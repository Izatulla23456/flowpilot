import type { ExecEvent, ExecListener, FlowEdge, FlowNode, NodeRun, Workflow } from './types';

const TEMPLATE_RE = /\{\{\s*([\w$]+(?:\.[\w$]+|\[\d+\])*)\s*\}\}/g;

export function isTemplate(v: unknown): v is string {
  return typeof v === 'string' && v.includes('{{');
}

/** Забирает значение по пути "a.b.c[0]" из объекта */
export function lookup(data: any, path: string): any {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: any = data;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Подставляет {{шаблоны}} в строку */
export function resolveTemplate(tpl: string, data: any): string {
  return tpl.replace(TEMPLATE_RE, (_m, expr: string) => {
    const v = lookup(data, expr);
    if (v === undefined || v === null) return '';
    return typeof v === 'string' ? v : JSON.stringify(v);
  });
}

function singleExpr(v: string): string | null {
  const m = v.match(/^\s*\{\{\s*([\w$]+(?:\.[\w$]+|\[\d+\])*)\s*\}\}\s*$/);
  return m ? m[1] : null;
}

/** {{a.b}} → сырое значение; строка с шаблонами → подставленная; иначе как есть */
export function resolveValue(v: any, data: any): any {
  if (typeof v === 'string') {
    const e = singleExpr(v);
    if (e) {
      const r = lookup(data, e);
      return r === undefined ? '' : r;
    }
    if (isTemplate(v)) return resolveTemplate(v, data);
  }
  return v;
}

export function parseJsonLoose(s: string): any {
  if (!s || !String(s).trim()) return undefined;
  try {
    return JSON.parse(String(s));
  } catch {
    return undefined;
  }
}

function isEmptyish(v: any): boolean {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function compare(l: any, op: string, r: any): boolean {
  const ls = l === undefined || l === null ? '' : String(l);
  const rs = r === undefined || r === null ? '' : String(r);
  switch (op) {
    case 'equals': return ls === rs;
    case 'notEquals': return ls !== rs;
    case 'contains': return ls.includes(rs);
    case 'notContains': return !ls.includes(rs);
    case 'startsWith': return ls.startsWith(rs);
    case 'endsWith': return ls.endsWith(rs);
    case 'gt': return Number(l) > Number(r);
    case 'gte': return Number(l) >= Number(r);
    case 'lt': return Number(l) < Number(r);
    case 'lte': return Number(l) <= Number(r);
    case 'exists': return l !== undefined && l !== null;
    case 'notExists': return l === undefined || l === null;
    case 'isEmpty': return isEmptyish(l);
    case 'notEmpty': return !isEmptyish(l);
    default: return false;
  }
}

function manualPayload(node: FlowNode): any {
  return parseJsonLoose(node.config?.payload || '') ?? {};
}

export interface ExecContext {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface NodeResult {
  output: any;
  error?: string;
  nextHandle?: string;
}

/** Выполняет одну ноду */
export async function execNode(node: FlowNode, input: any, ctx: ExecContext = {}): Promise<NodeResult> {
  const c = node.config || {};
  switch (node.type) {
    case 'manual':
      return { output: manualPayload(node) };

    case 'webhook':
      return { output: input ?? {} };

    case 'schedule':
      return {
        output: { ...(input && typeof input === 'object' ? input : {}), triggeredAt: new Date().toISOString() }
      };

    case 'httpRequest': {
      const method = String(c.method || 'GET').toUpperCase();
      const url = resolveTemplate(String(c.url || ''), input).trim();
      if (!url) return { output: undefined, error: 'URL не заполнен' };
      const headers: Record<string, string> = {};
      if (c.headersJson) {
        const h = parseJsonLoose(resolveTemplate(String(c.headersJson), input));
        if (!h || typeof h !== 'object' || Array.isArray(h))
          return { output: undefined, error: 'Headers: невалидный JSON' };
        for (const [k, v] of Object.entries(h)) headers[k] = String(v);
      }
      let body: string | undefined;
      if (c.body && method !== 'GET' && method !== 'HEAD') body = resolveTemplate(String(c.body), input);
      const fetchImpl = ctx.fetchImpl || ((u: string, i?: RequestInit) => fetch(u, i));
      const t0 = Date.now();
      let res: Response;
      try {
        res = await fetchImpl(url, { method, headers, body });
      } catch (e: any) {
        return { output: undefined, error: `HTTP ошибка: ${e?.message || e}` };
      }
      const text = await res.text();
      const json = parseJsonLoose(text);
      return {
        output: { status: res.status, ok: res.ok, body: json !== undefined ? json : text, durationMs: Date.now() - t0 }
      };
    }

    case 'if': {
      const left = resolveValue(c.left, input);
      const right = resolveValue(c.right, input);
      const cond = compare(left, String(c.operator || 'equals'), right);
      const base = input && typeof input === 'object' ? { ...input } : { data: input };
      return { output: { ...base, _branch: cond ? 'true' : 'false' }, nextHandle: cond ? 'true' : 'false' };
    }

    case 'set': {
      const base = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : { data: input };
      for (const f of Array.isArray(c.fields) ? c.fields : []) {
        if (!f || !f.key) continue;
        base[f.key] = resolveValue(f.value, input);
      }
      return { output: base };
    }

    case 'code': {
      const code = String(c.code || 'return data;');
      // eslint-disable-next-line no-new-func
      const fn = new Function('data', `"use strict";\nreturn (async (data) => {\n${code}\n})(data);`);
      const out = await fn(input);
      return { output: out };
    }

    case 'respond': {
      if (c.body === undefined || c.body === null || String(c.body) === '') return { output: input };
      const s = String(c.body);
      const e = singleExpr(s);
      if (e) {
        const r = lookup(input, e);
        return { output: r === undefined ? null : r };
      }
      const resolved = resolveTemplate(s, input);
      const j = parseJsonLoose(resolved);
      return { output: j !== undefined ? j : resolved };
    }

    case 'delay': {
      const ms = Math.max(0, Math.min(Number(c.ms) || 0, 120_000));
      await new Promise(r => setTimeout(r, ms));
      return { output: input };
    }

    default:
      return { output: undefined, error: `Неизвестный тип ноды: ${node.type}` };
  }
}

export function findTriggers(wf: Workflow): FlowNode[] {
  return wf.nodes.filter(n => n.type === 'manual' || n.type === 'webhook' || n.type === 'schedule');
}

export interface ExecuteOptions {
  trigger: 'manual' | 'webhook' | 'schedule' | 'client';
  entryNodeId?: string;
  initialData?: any;
  listen?: ExecListener;
  ctx?: ExecContext;
  maxSteps?: number;
}

export interface ExecuteResult {
  status: 'success' | 'error';
  runs: NodeRun[];
  output?: any;
  error?: string;
}

/** Прогоняет воркфлоу от стартовой ноды по графу, стримит события */
export async function executeWorkflow(wf: Workflow, opts: ExecuteOptions): Promise<ExecuteResult> {
  const listen = opts.listen;
  const emit = (e: {
    type: 'start' | 'node' | 'end';
    trigger?: string;
    run?: NodeRun;
    status?: 'success' | 'error';
    output?: any;
  }) => listen?.({ at: Date.now(), workflowId: wf.id, workflowName: wf.name, ...e } as ExecEvent);

  const nodes = new Map(wf.nodes.map(n => [n.id, n] as const));
  const children = new Map<string, FlowEdge[]>();
  for (const e of wf.edges) {
    const list = children.get(e.source) || [];
    list.push(e);
    children.set(e.source, list);
  }

  const entry = (opts.entryNodeId ? nodes.get(opts.entryNodeId) : undefined) || findTriggers(wf)[0];
  const runs: NodeRun[] = [];

  emit({ type: 'start', trigger: opts.trigger });
  if (!entry) {
    emit({ type: 'end', status: 'error' });
    return { status: 'error', runs, error: 'Нет стартовой ноды (Manual / Webhook / Schedule)' };
  }

  const perNode = new Map<string, number>();
  const queue: Array<{ id: string; input: any }> = [
    {
      id: entry.id,
      input:
        opts.initialData !== undefined
          ? opts.initialData
          : entry.type === 'manual'
            ? manualPayload(entry)
            : { triggeredAt: new Date().toISOString() }
    }
  ];
  const maxSteps = opts.maxSteps ?? 200;
  let steps = 0;
  let output: any;
  let hadError = false;

  while (queue.length > 0) {
    const step = queue.shift()!;
    if (++steps > maxSteps) {
      hadError = true;
      const run: NodeRun = {
        nodeId: step.id, status: 'error', input: step.input, output: undefined,
        error: 'Превышен лимит шагов — возможно, зациклили', durationMs: 0, runIndex: 0
      };
      runs.push(run);
      emit({ type: 'node', run });
      break;
    }
    const node = nodes.get(step.id);
    if (!node) continue;
    const isTrigger = node.type === 'manual' || node.type === 'webhook' || node.type === 'schedule';
    if (isTrigger && step.id !== entry.id) continue; // триггеры — только как вход

    const count = (perNode.get(step.id) || 0) + 1;
    if (count > 20) {
      hadError = true;
      const run: NodeRun = {
        nodeId: step.id, status: 'error', input: step.input, output: undefined,
        error: 'Нода сработала >20 раз — похоже на цикл', durationMs: 0, runIndex: count
      };
      runs.push(run);
      emit({ type: 'node', run });
      continue;
    }
    perNode.set(step.id, count);

    const t0 = Date.now();
    let result: NodeResult;
    try {
      result = await execNode(node, step.input, opts.ctx || {});
    } catch (e: any) {
      result = { output: undefined, error: `Ошибка выполнения: ${e?.message || e}` };
    }
    const run: NodeRun = {
      nodeId: step.id,
      status: result.error ? 'error' : 'success',
      input: step.input,
      output: result.output,
      error: result.error,
      durationMs: Date.now() - t0,
      runIndex: count - 1
    };
    runs.push(run);
    emit({ type: 'node', run });

    if (result.error) {
      hadError = true;
      continue;
    }
    if (node.type === 'respond') {
      if (output === undefined) output = result.output;
      continue;
    }
    const outs = (children.get(step.id) || []).filter(e => {
      if (!result.nextHandle) return true;
      if (!e.sourceHandle) return false;
      return e.sourceHandle === result.nextHandle;
    });
    for (const e of outs) queue.push({ id: e.target, input: result.output });
  }

  emit({ type: 'end', status: hadError ? 'error' : 'success', output });
  return { status: hadError ? 'error' : 'success', runs, output, error: hadError ? 'Были ошибки при выполнении' : undefined };
}
