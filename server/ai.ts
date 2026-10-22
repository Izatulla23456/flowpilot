import type { Workflow } from '../core/types';
import { store } from './storage';

const KINDS = ['manual', 'webhook', 'schedule', 'httpRequest', 'if', 'set', 'code', 'respond', 'delay'];

const SYSTEM = `You are the AI builder inside FlowPilot, a visual workflow automation platform (like n8n/Zapier).
The user describes an automation in plain language. You produce a workflow as STRICT JSON — no markdown, no comments.
Schema:
{
  "name": "short workflow name (max 40 chars)",
  "nodes": [{ "id": "n1", "type": "<kind>", "position": { "x": 0, "y": 0 }, "config": {} }],
  "edges": [{ "id": "e1", "source": "n1", "target": "n2", "sourceHandle": "true" }]
}
Node types and their config:
- "manual": start button. config: { "payload": "<JSON string of initial data, e.g. {}>" }
- "webhook": starts on POST to the workflow webhook. Its input: { "method", "query", "body" }
- "schedule": starts every N minutes. config: { "everyMinutes": 5 }
- "httpRequest": makes an HTTP call. config: { "method": "GET|POST|PUT|DELETE", "url": "...", "headersJson": "{}", "body": "request body string, may contain templates" }
- "if": condition, outputs on handles "true"/"false". config: { "left": "{{field.path}}", "operator": "equals|notEquals|contains|notContains|startsWith|endsWith|gt|gte|lt|lte|exists|notExists|isEmpty|notEmpty", "right": "value" }
- "set": writes fields. config: { "fields": [{ "key": "name", "value": "literal or {{field.path}}" }] }
- "code": JavaScript. config: { "code": "return { x: data.x * 2 };" } where \`data\` is the input; return the output
- "respond": sets the HTTP response of the webhook. config: { "body": "JSON string or template; empty string = pass input through" }
- "delay": wait. config: { "ms": 1000 }
Template rules: {{a.b.c}} or {{a[0].b}} resolves from the current input.
Rules:
1. Include exactly ONE start node (manual, webhook or schedule).
2. Layout: left to right, x step 260, y around 120.
3. Use only the listed node types.
4. For Telegram: httpRequest POST to https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage with headersJson '{"Content-Type":"application/json"}' and JSON body with chat_id and text (use templates inside text).
5. Prefer webhook for "when something happens", schedule for "every X", manual for demos.
6. Built-in demo endpoints: GET /api/mock/orders (list of orders), POST /api/mock/notify (fake message delivery).
7. Respond with JSON only.`;

function stripFences(s: string): string {
  return s.replace(/```json/gi, '```').replace(/```/g, '').trim();
}

export function extractJson(s: string): any {
  const cleaned = stripFences(s);
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fallthrough */
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      /* give up */
    }
  }
  return null;
}

async function chat(messages: Array<{ role: string; content: string }>): Promise<string | null> {
  const s = store.loadSettings();
  if (!s.aiKey) return null;
  try {
    const base = (s.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.aiKey}` },
      body: JSON.stringify({
        model: s.aiModel || 'gpt-4o-mini',
        messages,
        temperature: 0.2,
        max_tokens: 4000
      })
    });
    if (!res.ok) {
      console.error('AI API error', res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const j: any = await res.json();
    return j.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error('AI call failed', e);
    return null;
  }
}

function normalizeGraph(g: any): { nodes: any[]; edges: any[] } | null {
  if (!g || !Array.isArray(g.nodes) || g.nodes.length === 0) return null;
  const ids = new Set(g.nodes.map((n: any) => n.id).filter(Boolean));
  const nodes = g.nodes
    .filter((n: any) => n && typeof n.id === 'string' && KINDS.includes(n.type))
    .map((n: any, i: number) => ({
      id: n.id,
      type: n.type,
      position: n.position && typeof n.position.x === 'number' ? n.position : { x: 60 + i * 260, y: 160 },
      config: n.config && typeof n.config === 'object' ? n.config : {}
    }));
  if (nodes.length === 0 || !nodes.some((n: any) => ['manual', 'webhook', 'schedule'].includes(n.type))) return null;
  const edges = (Array.isArray(g.edges) ? g.edges : [])
    .filter((e: any) => e && ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
    .map((e: any) => ({
      id: e.id || `e-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined
    }));
  return { nodes, edges };
}

/** Шаблонный офлайн-генератор (без LLM) */
function templateGenerate(prompt: string): { name: string; nodes: any[]; edges: any[] } {
  const p = prompt.toLowerCase();
  const has = (re: RegExp) => re.test(p);
  const hasSchedule = has(/кажд|cron|расписан|таймер|timer|раз в|ежедн|посекун/);
  const hasTelegram = has(/телеграм|telegram/);
  const hasIf = has(/если|услови|только когда|когда/);
  const nodes: any[] = [];
  const edges: any[] = [];
  let prev: string | null = null;
  const add = (type: string, config: any) => {
    const id = `n${nodes.length + 1}`;
    nodes.push({ id, type, position: { x: 40 + nodes.length * 260, y: 160 }, config });
    if (prev) edges.push({ id: `e${edges.length + 1}`, source: prev, target: id });
    prev = id;
    return id;
  };
  add(hasSchedule ? 'schedule' : 'webhook', hasSchedule ? { everyMinutes: 5 } : { note: 'POST JSON сюда' });
  if (hasTelegram || hasIf) add('httpRequest', { method: 'GET', url: '/api/mock/orders', headersJson: '', body: '' });
  if (hasIf) add('if', { left: '{{body[0].amount}}', operator: 'gt', right: '5000' });
  if (hasTelegram)
    add('httpRequest', {
      method: 'POST',
      url: '/api/mock/notify',
      headersJson: '{ "Content-Type": "application/json" }',
      body: '{ "channel": "telegram", "text": "Новое событие: {{body[0].id}}" }'
    });
  add('respond', { body: '' });
  return { name: 'AI-воркфлоу (шаблон)', nodes, edges };
}

export async function aiGenerate(prompt: string): Promise<{ name: string; nodes: any[]; edges: any[]; ai: 'llm' | 'template' }> {
  const raw = await chat([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: prompt }
  ]);
  if (raw) {
    const g = extractJson(raw);
    const norm = g && normalizeGraph(g);
    if (norm) return { name: String(g.name || 'AI workflow').slice(0, 60), ...norm, ai: 'llm' };
  }
  return { ...templateGenerate(prompt), ai: 'template' as const };
}

const KIND_RU: Record<string, string> = {
  manual: 'Ручной запуск',
  webhook: 'Webhook (POST)',
  schedule: 'Расписание',
  httpRequest: 'HTTP-запрос',
  if: 'Условие (IF)',
  set: 'Присвоить поля',
  code: 'JavaScript',
  respond: 'Ответ Webhook',
  delay: 'Задержка'
};

export function ruleExplain(wf: Workflow): string {
  const lines = wf.nodes.map((n, i) => {
    const c = n.config || {};
    let detail = '';
    if (n.type === 'schedule') detail = `каждые ${c.everyMinutes || 5} мин`;
    if (n.type === 'httpRequest') detail = `${c.method || 'GET'} ${c.url || ''}`;
    if (n.type === 'if') detail = `${c.left || '?'} ${c.operator || 'equals'} ${c.right ?? ''}`;
    if (n.type === 'code') detail = 'обработка данных в JS';
    if (n.type === 'set') detail = `поля: ${(c.fields || []).map((f: any) => f.key).join(', ') || '—'}`;
    if (n.type === 'delay') detail = `${c.ms || 0} мс`;
    if (n.type === 'webhook') detail = `POST /api/webhook/${wf.id}`;
    return `${i + 1}. ${KIND_RU[n.type] || n.type}${detail ? ` — ${detail}` : ''}`;
  });
  return `Воркфлоу «${wf.name}»: ${wf.nodes.length} узлов, ${wf.edges.length} связей.\n${lines.join('\n')}\n\nДанные текут слева направо; {{шаблон}} подставляет значения из входных данных узла.`;
}

export async function aiExplain(wf: Workflow): Promise<{ text: string; ai: 'llm' | 'rules' }> {
  const raw = await chat([
    {
      role: 'system',
      content:
        'You describe n8n-like workflows in Russian. Be concise (3–6 sentences), explain the data flow and what the user can do with it. Plain text only.'
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          name: wf.name,
          nodes: wf.nodes.map(n => ({ type: n.type, config: n.config })),
          edges: wf.edges.map(e => ({ from: e.source, to: e.target, handle: e.sourceHandle }))
        },
        null,
        2
      )
    }
  ]);
  if (raw) return { text: raw.trim(), ai: 'llm' };
  return { text: ruleExplain(wf), ai: 'rules' };
}
