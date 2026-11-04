import type { Workflow } from '../core/types';
import { store } from './storage';

const KINDS = ['manual', 'webhook', 'schedule', 'form', 'httpRequest', 'if', 'set', 'code', 'respond', 'delay', 'loop', 'telegram'];

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
- "loop": ForEach over an array field. config: { "source": "{{path.to.array}}", "keyName": "item" } — downstream nodes run once per element; inside the loop use {{item}}, {{index}}, {{total}}
- "telegram": send a Telegram message (bot token and chat are configured app-wide). config: { "text": "message with {{templates}}" }
- "form": public HTML form trigger (input = { source: \"form\", title, fields: {...} }). config: { "title": "...", "fields": "JSON string: [{\"name\":\"Имя\"},{\"name\":\"Email\",\"type\":\"email\"}]" }
Template rules: {{a.b.c}} or {{a[0].b}} resolves from the current input.
Rules:
1. Include exactly ONE start node (manual, webhook, schedule or form).
2. Layout: left to right, x step 260, y around 120.
3. Use only the listed node types.
4. Prefer the "telegram" node for messaging (bot is configured app-wide); use httpRequest to Telegram only if the user explicitly asks for a custom bot token.
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

export async function chat(messages: Array<{ role: string; content: string }>): Promise<string | null> {
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
  if (nodes.length === 0 || !nodes.some((n: any) => ['manual', 'webhook', 'schedule', 'form'].includes(n.type))) return null;
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
  form: 'Форма (публичная HTML-страница)',
  httpRequest: 'HTTP-запрос',
  if: 'Условие (IF)',
  set: 'Присвоить поля',
  code: 'JavaScript',
  respond: 'Ответ Webhook',
  delay: 'Задержка',
  loop: 'Цикл по массиву',
  telegram: 'Telegram-сообщение'
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
    if (n.type === 'loop') detail = `по массиву ${c.source || '{{…}}'} (элемент — ${c.keyName || 'item'})`;
    if (n.type === 'telegram') detail = `сообщение: ${String(c.text || '').slice(0, 60)}`;
    if (n.type === 'form') detail = `форма «${c.title || 'Форма'}», полей: ${(Array.isArray(c.fields) ? c.fields.length : 1) || 1}`;
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

// ---------- ИИ-доктор: диагностика и починка ошибки ноды ----------

function ruleFixAdvice(node: any, lastRun: any | null): string {
  const err = String(lastRun?.error || '');
  const c = node?.config || {};
  if (node?.type === 'httpRequest') {
    if (!c.url) return 'У HTTP-ноды не заполнен URL. Впиши адрес (например /api/mock/orders или https://…).';
    if (/HTTP 5\d\d/.test(err)) return `Сервер-приёмник ответил 5xx (${err}). Проверь URL и метод; включи «Повторы при сбое» (1–3).`;
    if (/fetch failed|fetch/i.test(err)) return `Хост недоступен (${err}). Проверь адрес, доступность сервиса и права на внешние запросы.`;
    if (/невалидный JSON/.test(err)) return 'Поле Headers (JSON) — невалидный JSON. Исправь формат: { "Key": "value" }.';
  }
  if (node?.type === 'code') return `JS-ошибка: ${err || 'выполнение упало'}. Вспоминка: data — входные данные; обязателен return; проверь доступ к полям, которых может не быть.`;
  if (node?.type === 'if') return `Проверь «Левую/Правую часть»: шаблон {{…}} должен указывать на существующее поле входных данных (посмотри Данные ноды перед IF).`;
  if (node?.type === 'respond') return 'Ответ пуст или невалидный JSON. Заполни «Тело ответа» валидным JSON-шаблоном, например { "ok": {{status}} }.';
  if (node?.type === 'loop') return `Массив не найден по пути ${c.source || '{{…}}'}: убедись, что во входных данных по этому пути именно массив (массив, а не объект).`;
  if (node?.type === 'telegram') return 'Проверь текст (не должен быть пустым) и, если нужна реальная отправка, токен бота и chatId в настройках ⚙ (без них работает mock-режим).';
  return err ? `Ошибка: ${err}. Открой Данные ноды, посмотри вход и поправь конфиг.` : 'Явных ошибок нет — запусти воркфлоу ещё раз и посмотри данные ноды.';
}

export async function aiFix(
  node: { type: string; config: any },
  lastRun: { input?: any; error?: string } | null
): Promise<{ fixed: Record<string, any> | null; advice: string; ai: 'llm' | 'rules' }> {
  const raw = await chat([
    {
      role: 'system',
      content: `You are the FlowPilot error doctor. You get a workflow node (type + config), its last input and the error. Propose the minimal fix. Respond STRICT JSON, no markdown:
{
  "config": { ...FULL corrected config object for this node type, all fields... },
  "advice": "1–3 sentences in Russian: what was wrong and what you changed"
}
Node config fields:
- httpRequest: { method, url, headersJson (JSON string), body (string with {{templates}}), retries (0-5), retryDelayMs }
- if: { left ({{template}}), operator, right }
- set: { fields: [{key, value}] }
- code: { code } (JS, input is data, must return output)
- respond: { body }
- loop: { source ({{path.to.array}}), keyName }
- telegram: { text, chatId }
If you cannot determine a concrete fix, return { "config": null, "advice": "..." }. JSON only.`
    },
    {
      role: 'user',
      content: JSON.stringify({ nodeType: node.type, config: node.config, lastInput: lastRun?.input, error: lastRun?.error || 'unknown failure' }, null, 2)
    }
  ]);
  if (raw) {
    const g = extractJson(raw);
    if (g && (g.config && typeof g.config === 'object' ? Object.keys(g.config).length > 0 : false)) {
      return { fixed: g.config, advice: String(g.advice || 'Исправлено'), ai: 'llm' };
    }
    if (g && g.advice) return { fixed: null, advice: String(g.advice), ai: 'llm' };
  }
  return { fixed: null, advice: ruleFixAdvice(node, lastRun), ai: 'rules' };
}

// ---------- Генератор тестовых запросов ----------

function collectTemplatePaths(wf: Workflow): string[] {
  const paths = new Set<string>();
  const re = /\{\{\s*([\w$.\[\]]+)\s*\}\}/g;
  for (const n of wf.nodes) {
    const walk = (v: any) => {
      if (typeof v === 'string') {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(v))) paths.add(m[1]);
      } else if (v && typeof v === 'object') {
        for (const x of Object.values(v)) walk(x);
      }
    };
    walk(n.config);
  }
  return Array.from(paths);
}

export function ruleTests(wf: Workflow): Array<{ name: string; method: string; url: string; body: string; expect: string }> {
  const url = `/api/webhook/${wf.id}`;
  const bodyPaths = collectTemplatePaths(wf).filter(p => p.startsWith('body.') && !p.includes('['));
  const fields: Record<string, string> = {};
  for (const p of bodyPaths.slice(0, 6)) {
    const key = p.slice(5);
    const n = Number(key);
    fields[key] = Number.isFinite(n) && n > 0 && String(key).length <= 6 ? '1500' : 'тест';
  }
  const obj = Object.keys(fields).length ? fields : { text: 'тест' };
  const ifNode = wf.nodes.find(n => n.type === 'if');
  const branchHint = ifNode ? ` (IF: ${ifNode.config?.left} ${ifNode.config?.operator} ${ifNode.config?.right})` : '';
  return [
    { name: 'Happy path', method: 'POST', url, body: JSON.stringify(obj, null, 2), expect: `Успешный прогон по главной ветке${branchHint}` },
    {
      name: 'Boundary (пусто/минимум)',
      method: 'POST',
      url,
      body: JSON.stringify(Object.fromEntries(Object.keys(obj).map(k => [k, '']))),
      expect: 'Второй ветки/ответ об обработке, без сбоев'
    },
    { name: 'Negative (битый JSON)', method: 'POST', url, body: '{"text": ', expect: 'HTTP 400, сервер жив, воркфлоу не сломан' }
  ];
}

export async function aiTests(wf: Workflow): Promise<{ tests: Array<{ name: string; method: string; url: string; body: string; expect: string }>; ai: 'llm' | 'rules' }> {
  const url = `/api/webhook/${wf.id}`;
  const raw = await chat([
    {
      role: 'system',
      content: `You are the FlowPilot QA engineer. Given a workflow (nodes+config), produce 3–5 test requests for its trigger. Respond STRICT JSON:
[{ "name": "short name (happy/boundary/negative/edge)", "method": "POST", "url": "/api/webhook/WORKFLOW_ID_PLACEHOLDER", "body": "<JSON string body>", "expect": "expected result in Russian" }]
Cover: happy path, boundary values, negative (empty/broken). JSON only.`
    },
    {
      role: 'user',
      content: JSON.stringify({ name: wf.name, nodes: wf.nodes.map(n => ({ type: n.type, config: n.config })) }, null, 2)
    }
  ]);
  if (raw) {
    const g = extractJson(raw);
    const arr = Array.isArray(g) ? g : Array.isArray(g?.tests) ? g.tests : null;
    if (arr && arr.length) {
      const tests = arr
        .filter((t: any) => t && t.name && t.body !== undefined)
        .slice(0, 5)
        .map((t: any) => ({ name: String(t.name), method: 'POST', url: String(t.url || url).replace('WORKFLOW_ID_PLACEHOLDER', wf.id), body: String(t.body), expect: String(t.expect || '') }));
      if (tests.length) return { tests, ai: 'llm' };
    }
  }
  return { tests: ruleTests(wf), ai: 'rules' };
}
