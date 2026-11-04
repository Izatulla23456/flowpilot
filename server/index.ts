import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { executeWorkflow, findTriggers } from '../core/engine';
import { TEMPLATES } from '../core/templates';
import type { ExecEvent, Workflow } from '../core/types';
import { aiExplain, aiFix, aiGenerate, aiTests } from './ai';
import { store } from './storage';

const PORT = Number(process.env.PORT || 8787);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- .env (FLOWPILOT_ADMIN_TOKEN, PORT, ...) ----------
try {
  const envFile = path.join(__dirname, '../.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* .env опционален */ }

const ADMIN_TOKEN = process.env.FLOWPILOT_ADMIN_TOKEN || '';
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!ADMIN_TOKEN) return next();
  const h = String(req.headers.authorization || '');
  const tok = h.startsWith('Bearer ') ? h.slice(7) : String(req.query.token || '');
  if (tok === ADMIN_TOKEN) return next();
  res.status(401).json({ error: 'unauthorized: нужен админ-токен' });
}
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '5mb' }));

const workflows: Record<string, Workflow> = store.loadWorkflows();
const timers = new Map<string, NodeJS.Timeout>();
const sigs = new Map<string, string>();
const metrics = { runs: 0, errors: 0, totalMs: 0, startedAt: Date.now() };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function broadcast(obj: unknown) {
  const s = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(s);
}

/** fetch с разрешением относительных URL внутри сервера (mock-сервисы) */
function serverFetch(url: string, init?: RequestInit): Promise<Response> {
  const target = url.startsWith('/') ? `http://127.0.0.1:${PORT}${url}` : url;
  return fetch(target, init);
}

function scheduleSig(wf: Workflow): string {
  const s = wf.nodes.find(n => n.type === 'schedule');
  return s ? `${s.id}:${s.config?.everyMinutes ?? 5}` : 'none';
}

/** Пересоздаёт таймеры только для изменившихся воркфлоу */
function rescheduleAll() {
  const desired = new Map<string, string>();
  for (const wf of Object.values(workflows)) desired.set(wf.id, scheduleSig(wf));
  for (const [id, t] of timers) {
    if (!desired.has(id) || desired.get(id) !== sigs.get(id)) {
      clearInterval(t);
      timers.delete(id);
      sigs.delete(id);
    }
  }
  for (const [id, sig] of desired) {
    if (sig === 'none' || (sigs.get(id) === sig && timers.has(id))) continue;
    const wf = workflows[id];
    const node = wf.nodes.find(n => n.type === 'schedule')!;
    const min = Math.max(1, Number(node.config?.everyMinutes) || 5);
    const t = setInterval(() => {
      runWorkflow(workflows[id], 'schedule', node.id).catch(e => console.error('schedule run failed', e));
    }, min * 60_000);
    t.unref();
    timers.set(id, t);
    sigs.set(id, sig);
    console.log(`[schedule] «${wf.name}»: каждые ${min} мин`);
  }
}

async function runWorkflow(
  wf: Workflow,
  trigger: 'manual' | 'webhook' | 'schedule',
  entryNodeId?: string,
  initialData?: any
) {
  const result = await executeWorkflow(wf, {
    trigger,
    entryNodeId,
    initialData,
    ctx: { fetchImpl: serverFetch },
    listen: (e: ExecEvent) => broadcast({ type: 'exec', event: e })
  });
  store.pushHistory(wf.id, {
    at: Date.now(),
    trigger,
    status: result.status,
    error: result.error,
    output: result.output,
    runs: result.runs,
    durationMs: result.runs.reduce((s, r) => s + r.durationMs, 0)
  });
  metrics.runs += 1;
  if (result.status !== 'success') metrics.errors += 1;
  metrics.totalMs += result.runs.reduce((s, r) => s + r.durationMs, 0);
  broadcast({ type: 'history', workflowId: wf.id });
  return result;
}

function pick(o: unknown, keys: string[]): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  const obj = (o || {}) as Record<string, unknown>;
  for (const k of keys) if (obj[k] !== undefined) r[k] = obj[k];
  return r;
}

// ---------- API ----------

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'flowpilot', at: Date.now() }));

app.get('/api/metrics', (_req, res) =>
  res.json({
    app: 'flowpilot',
    uptimeSec: Math.round((Date.now() - metrics.startedAt) / 1000),
    runs: metrics.runs,
    errors: metrics.errors,
    errorRate: metrics.runs ? +(metrics.errors / metrics.runs).toFixed(3) : 0,
    avgRunMs: metrics.runs ? Math.round(metrics.totalMs / metrics.runs) : 0,
    workflows: Object.keys(workflows).length
  })
);

app.get('/api/workflows', requireAuth, (_req, res) =>
  res.json(Object.values(workflows).sort((a, b) => b.updatedAt - a.updatedAt))
);

app.post('/api/workflows', requireAuth, (req, res) => {
  let base: Workflow | null = null;
  if (typeof req.body?.template === 'string') {
    const t = TEMPLATES.find(x => x.name === req.body.template);
    base = t ? t.build() : null;
  }
  const now = Date.now();
  const wf: Workflow = {
    id: uid(),
    name: String(base?.name || req.body?.name || 'Новый воркфлоу').slice(0, 80),
    nodes: Array.isArray(req.body?.nodes) ? req.body.nodes : base?.nodes || [],
    edges: Array.isArray(req.body?.edges) ? req.body.edges : base?.edges || [],
    createdAt: now,
    updatedAt: now
  };
  workflows[wf.id] = wf;
  store.saveWorkflows(workflows);
  rescheduleAll();
  broadcast({ type: 'workflows-updated' });
  res.json(wf);
});

app.get('/api/workflows/:id', requireAuth, (req, res) => {
  const wf = workflows[String(req.params.id)];
  if (!wf) return res.status(404).json({ error: 'not found' });
  res.json(wf);
});

app.put('/api/workflows/:id', requireAuth, (req, res) => {
  const wf = workflows[String(req.params.id)];
  if (!wf) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  if (typeof b.name === 'string' && b.name.trim()) wf.name = b.name.slice(0, 80);
  if (Array.isArray(b.nodes)) wf.nodes = b.nodes;
  if (Array.isArray(b.edges)) wf.edges = b.edges;
  wf.updatedAt = Date.now();
  store.saveWorkflows(workflows);
  rescheduleAll();
  broadcast({ type: 'workflows-updated' });
  res.json(wf);
});

app.delete('/api/workflows/:id', requireAuth, (req, res) => {
  delete workflows[String(req.params.id)];
  store.saveWorkflows(workflows);
  rescheduleAll();
  broadcast({ type: 'workflows-updated' });
  res.json({ ok: true });
});

app.post('/api/workflows/:id/run', requireAuth, async (req, res) => {
  const wf = workflows[String(req.params.id)];
  if (!wf) return res.status(404).json({ error: 'not found' });
  const entry = findTriggers(wf)[0];
  if (!entry) return res.status(400).json({ error: 'Нет стартовой ноды (Manual / Webhook / Schedule)' });
  const result = await runWorkflow(wf, 'manual', entry.id, req.body?.initialData);
  res.json({ ok: result.status === 'success', error: result.error, output: result.output });
});

// ---------- защита от SSRF и brute-force ----------

/** Блокирует запросы к внутренним адресам (metadata, loopback, LAN) */
function isInternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
    if (h.endsWith('.local') || h.endsWith('.internal')) return true;
    if (h.startsWith('10.') || h.startsWith('192.168.')) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (h.startsWith('169.254.') || h.startsWith('127.')) return true;
    return false;
  } catch {
    return false;
  }
}

/** Простой rate limit по IP (окно 60 с) */
const rlHits = new Map<string, { n: number; t: number }>();
function rateLimit(limit: number): express.RequestHandler {
  return (req, res, next) => {
    const ip = String(req.ip || 'unknown');
    const now = Date.now();
    const h = rlHits.get(ip);
    if (!h || now - h.t > 60_000) rlHits.set(ip, { n: 1, t: now });
    else if (++h.n > limit) return res.status(429).json({ error: 'too many requests' });
    next();
  };
}
const webhookLimiter = rateLimit(30);
const aiLimiter = rateLimit(10);

app.post('/api/webhook/:id', webhookLimiter, async (req, res) => {
  const wf = workflows[String(req.params.id)];
  if (!wf) return res.status(404).json({ error: 'workflow not found' });
  const wh = wf.nodes.find(n => n.type === 'webhook');
  if (!wh) return res.status(400).json({ error: 'В этом воркфлоу нет webhook-ноды' });
  const result = await runWorkflow(wf, 'webhook', wh.id, {
    method: req.method,
    query: req.query,
    body: req.body
  });
  res.json({ ok: result.status === 'success', output: result.output, error: result.error });
});

app.post('/api/exec/http', aiLimiter, async (req, res) => {
  const { method, url, headers, body } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const raw = String(url);
  const target = raw.startsWith('/') ? `http://127.0.0.1:${PORT}${raw}` : raw;
  if (!raw.startsWith('/') && isInternalUrl(target)) {
    return res.status(403).json({ error: 'запросы к внутренним адресам запрещены' });
  }
  try {
    const r = await fetch(target, {
      method: String(method || 'GET').toUpperCase(),
      headers: headers || {},
      body: body || undefined
    });
    const text = await r.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    res.json({ status: r.status, ok: r.ok, body: json !== undefined ? json : text });
  } catch (e: any) {
    res.status(502).json({ error: e?.message || 'fetch failed' });
  }
});

app.get('/api/templates', (_req, res) =>
  res.json(TEMPLATES.map(t => ({ name: t.name, description: t.description })))
);

app.post('/api/ai/generate', requireAuth, aiLimiter, async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'empty prompt' });
  try {
    const g = await aiGenerate(prompt);
    const now = Date.now();
    const wf: Workflow = { id: uid(), name: g.name, nodes: g.nodes, edges: g.edges, createdAt: now, updatedAt: now };
    workflows[wf.id] = wf;
    store.saveWorkflows(workflows);
    rescheduleAll();
    broadcast({ type: 'workflows-updated' });
    res.json({ workflow: wf, ai: g.ai });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'ai failed' });
  }
});

app.post('/api/ai/explain', requireAuth, aiLimiter, async (req, res) => {
  const wf = workflows[req.body?.workflowId] || (req.body?.workflow as Workflow);
  if (!wf || !Array.isArray(wf.nodes)) return res.status(400).json({ error: 'workflow required' });
  res.json(await aiExplain(wf));
});

app.post('/api/ai/fix', requireAuth, aiLimiter, async (req, res) => {
  const wf = workflows[String(req.body?.workflowId)];
  const node = wf?.nodes.find(n => n.id === req.body?.nodeId);
  if (!wf || !node) return res.status(400).json({ error: 'node not found' });
  const hist = store.loadHistory()[wf.id] || [];
  const lastRun = [...hist].reverse().flatMap(h => h.runs || []).find(r => r.nodeId === node.id) || null;
  res.json(await aiFix(node, lastRun));
});

app.post('/api/ai/tests', requireAuth, aiLimiter, async (req, res) => {
  const wf = workflows[String(req.body?.workflowId)];
  if (!wf) return res.status(404).json({ error: 'workflow not found' });
  res.json(await aiTests(wf));
});

app.get('/api/settings', requireAuth, (_req, res) => {
  const s = store.loadSettings();
  // ВАЖНО: ключи/токены никогда не возвращаются клиенту (публикация = утечка)
  res.json({ aiBaseUrl: s.aiBaseUrl, aiModel: s.aiModel, hasKey: Boolean(s.aiKey), hasTelegram: Boolean(s.telegramBotToken && s.telegramChatId) });
});

app.put('/api/settings', requireAuth, (req, res) => {
  const cur = store.loadSettings();
  const next = { ...cur, ...pick(req.body, ['aiKey', 'aiBaseUrl', 'aiModel', 'telegramBotToken', 'telegramChatId']) };
  store.saveSettings(next);
  res.json({ ok: true, hasKey: Boolean(next.aiKey), hasTelegram: Boolean(next.telegramBotToken && next.telegramChatId) });
});

app.get('/api/workflows/:id/history', requireAuth, (req, res) => res.json(store.loadHistory()[String(req.params.id)] || []));

// ---------- интеграция: Telegram ----------

app.post('/api/integration/telegram', webhookLimiter, async (req, res) => {
  const s = store.loadSettings();
  const text = String(req.body?.text || '').slice(0, 4000);
  const chatId = String(req.body?.chatId || s.telegramChatId || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'пустой текст' });
  if (!s.telegramBotToken || !chatId) {
    // mock-режим (офлайн-демо без токена): сообщение «доставлено» локально
    return res.json({ ok: true, mock: true, channel: 'telegram(mock)', preview: text.slice(0, 160) });
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
    });
    const j: any = await r.json();
    if (!j?.ok) return res.status(502).json({ ok: false, error: j?.description || `telegram ${r.status}` });
    res.json({ ok: true, channel: 'telegram', messageId: j.result?.message_id, at: new Date().toISOString() });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: `telegram: ${e?.message || e}` });
  }
});

// ---------- интеграция: публичная HTML-форма ----------

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formFieldsOf(node: any): Array<{ name: string; type: string; label: string }> {
  const raw = parseFormFields(node?.config?.fields);
  const list = (Array.isArray(raw) ? raw : []).filter((f: any) => f && f.name).slice(0, 12);
  return list.length
    ? list.map((f: any) => ({ name: String(f.name).slice(0, 60), type: String(f.type || 'text'), label: String(f.label || f.name).slice(0, 80) }))
    : [{ name: 'message', type: 'textarea', label: 'Сообщение' }];
}

function parseFormFields(v: any): any {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const j = JSON.parse(v);
      return Array.isArray(j) ? j : null;
    } catch {
      return null;
    }
  }
  return null;
}

app.get('/api/form/:id', (req, res) => {
  const wf = workflows[String(req.params.id)];
  const node = wf?.nodes.find(n => n.type === 'form');
  if (!wf || !node) return res.status(404).send('Форма не найдена');
  const title = escapeHtml(String(node.config?.title || 'Форма'));
  const fields = formFieldsOf(node);
  const inputs = fields
    .map(f => {
      const id = 'f_' + f.name.replace(/[^\p{L}\p{N}]/gu, '_');
      const control =
        f.type === 'textarea'
          ? `<textarea id="${id}" name="${escapeHtml(f.name)}" rows="4" class="ctl"></textarea>`
          : `<input id="${id}" name="${escapeHtml(f.name)}" type="${f.type === 'email' || f.type === 'number' ? f.type : 'text'}" class="ctl" />`;
      return `<label class="fld"><span>${escapeHtml(f.label)}</span>${control}</label>`;
    })
    .join('\n');
  res.type('html').send(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1220;font-family:system-ui,sans-serif;color:#e2e8f0}
  .card{width:min(440px,92vw);background:#111a2e;border:1px solid #1f2c4a;border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
  h1{font-size:18px;margin:0 0 4px} .sub{font-size:12px;color:#64748b;margin:0 0 18px}
  .fld{display:block;margin-bottom:12px} .fld span{display:block;font-size:12px;color:#94a3b8;margin-bottom:4px}
  .ctl{width:100%;box-sizing:border-box;background:#0b1220;border:1px solid #24345c;border-radius:10px;color:#e2e8f0;padding:10px 12px;font-size:14px}
  button{width:100%;margin-top:6px;background:#2563eb;border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;padding:11px;cursor:pointer}
  button:hover{background:#3b82f6} .done{margin-top:14px;font-size:13px;color:#34d399;text-align:center;display:none}
  .brand{margin-top:16px;font-size:11px;color:#475569;text-align:center}
</style></head><body>
<div class="card">
  <h1>${title}</h1><p class="sub">FlowPilot · данные уйдут в автоматизацию</p>
  <form id="fm">${inputs}</form>
  <button id="go" type="submit">Отправить →</button>
  <div class="done" id="ok">✓ Заявка принята, автоматизация запущена</div>
  <div class="brand">powered by FlowPilot</div>
</div>
<script>
const form = document.getElementById('fm');
form.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('go');
  btn.disabled = true; btn.textContent = 'Отправляем…';
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const r = await fetch('/api/form/${wf.id}', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) { document.getElementById('ok').style.display = 'block'; form.style.display = 'none'; btn.style.display = 'none'; }
    else { btn.disabled = false; btn.textContent = 'Отправить →'; alert('Ошибка: ' + (j.error || r.status)); }
  } catch (err) { btn.disabled = false; btn.textContent = 'Отправить →'; alert('Сеть недоступна'); }
});
</script></body></html>`);
});

app.post('/api/form/:id', webhookLimiter, async (req, res) => {
  const wf = workflows[String(req.params.id)];
  const node = wf?.nodes.find(n => n.type === 'form');
  if (!wf || !node) return res.status(404).json({ ok: false, error: 'form not found' });
  const fields = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const result = await runWorkflow(wf, 'webhook', node.id, { source: 'form', title: String(node.config?.title || ''), fields });
  res.json({ ok: result.status === 'success', output: result.output, error: result.error });
});

// ---------- mock-сервисы (демо без интернета) ----------

app.get('/api/mock/orders', (_req, res) =>
  res.json([
    { id: 101, customer: 'Алиса', amount: 15000 },
    { id: 102, customer: 'Богдан', amount: 2300 },
    { id: 103, customer: 'Вера', amount: 8900 }
  ])
);

app.post('/api/mock/notify', (req, res) =>
  res.json({ delivered: true, channel: req.body?.channel || 'unknown', at: new Date().toISOString() })
);

// ---------- WS ----------

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'hello', at: Date.now() }));
});

// ---------- static (production build) ----------

const dist = path.join(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/|ws$).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// ---------- старт ----------

if (Object.keys(workflows).length === 0) {
  const t = TEMPLATES[2];
  const built = t.build();
  const id = 'demo-' + uid();
  workflows[id] = {
    id,
    name: t.name + ' (демо)',
    nodes: built.nodes,
    edges: built.edges,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  store.saveWorkflows(workflows);
}
rescheduleAll();
server.listen(PORT, () => {
  console.log(`🛸 FlowPilot server: http://localhost:${PORT}`);
});
