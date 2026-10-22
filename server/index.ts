import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { executeWorkflow, findTriggers } from '../core/engine';
import { TEMPLATES } from '../core/templates';
import type { ExecEvent, Workflow } from '../core/types';
import { aiExplain, aiGenerate } from './ai';
import { store } from './storage';

const PORT = Number(process.env.PORT || 8787);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

app.get('/api/workflows', (_req, res) =>
  res.json(Object.values(workflows).sort((a, b) => b.updatedAt - a.updatedAt))
);

app.post('/api/workflows', (req, res) => {
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

app.get('/api/workflows/:id', (req, res) => {
  const wf = workflows[req.params.id];
  if (!wf) return res.status(404).json({ error: 'not found' });
  res.json(wf);
});

app.put('/api/workflows/:id', (req, res) => {
  const wf = workflows[req.params.id];
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

app.delete('/api/workflows/:id', (req, res) => {
  delete workflows[req.params.id];
  store.saveWorkflows(workflows);
  rescheduleAll();
  broadcast({ type: 'workflows-updated' });
  res.json({ ok: true });
});

app.post('/api/workflows/:id/run', async (req, res) => {
  const wf = workflows[req.params.id];
  if (!wf) return res.status(404).json({ error: 'not found' });
  const entry = findTriggers(wf)[0];
  if (!entry) return res.status(400).json({ error: 'Нет стартовой ноды (Manual / Webhook / Schedule)' });
  const result = await runWorkflow(wf, 'manual', entry.id, req.body?.initialData);
  res.json({ ok: result.status === 'success', error: result.error, output: result.output });
});

app.post('/api/webhook/:id', async (req, res) => {
  const wf = workflows[req.params.id];
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

app.post('/api/exec/http', async (req, res) => {
  const { method, url, headers, body } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const target = String(url).startsWith('/') ? `http://127.0.0.1:${PORT}${url}` : String(url);
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

app.post('/api/ai/generate', async (req, res) => {
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

app.post('/api/ai/explain', async (req, res) => {
  const wf = workflows[req.body?.workflowId] || (req.body?.workflow as Workflow);
  if (!wf || !Array.isArray(wf.nodes)) return res.status(400).json({ error: 'workflow required' });
  res.json(await aiExplain(wf));
});

app.get('/api/settings', (_req, res) => {
  const s = store.loadSettings();
  res.json({ aiKey: s.aiKey, aiBaseUrl: s.aiBaseUrl, aiModel: s.aiModel, hasKey: Boolean(s.aiKey) });
});

app.put('/api/settings', (req, res) => {
  const cur = store.loadSettings();
  const next = { ...cur, ...pick(req.body, ['aiKey', 'aiBaseUrl', 'aiModel']) };
  store.saveSettings(next);
  res.json({ ok: true, hasKey: Boolean(next.aiKey) });
});

app.get('/api/workflows/:id/history', (req, res) => res.json(store.loadHistory()[req.params.id] || []));

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
