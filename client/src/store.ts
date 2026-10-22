import { create } from 'zustand';
import type { ReactFlowInstance } from '@xyflow/react';
import { defaultsFor } from './nodes/registry';
import type { ExecEvent, FlowNode, NodeRun, Workflow } from 'core/types';

export interface ExecSummary {
  at: number;
  trigger: string;
  status: 'success' | 'error';
  durationMs: number;
  output?: any;
}

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'err';
}

interface State {
  workflows: Workflow[];
  current: Workflow | null;
  selectedNodeId: string | null;
  rightTab: 'config' | 'data' | 'history';
  runs: NodeRun[];
  lastExec: ExecSummary | null;
  running: boolean;
  aiOpen: boolean;
  explainText: string | null;
  explainAi: string | null;
  toasts: Toast[];
  serverOnline: boolean;
  historyTick: number;
  rfInstance: ReactFlowInstance | null;
  addRfNodeFn: ((rfNode: any) => void) | null;

  setWorkflows: (w: Workflow[]) => void;
  setCurrent: (w: Workflow | null) => void;
  patchCurrent: (patch: Partial<Workflow>) => void;
  selectNode: (id: string | null) => void;
  setRightTab: (t: State['rightTab']) => void;
  applyExecEvent: (e: ExecEvent) => void;
  setRunning: (v: boolean) => void;
  setAiOpen: (v: boolean) => void;
  setExplain: (text: string | null, ai: string | null) => void;
  toast: (text: string, kind?: 'ok' | 'err') => void;
  setServerOnline: (v: boolean) => void;
  bumpHistory: () => void;
  setRfInstance: (rf: ReactFlowInstance | null) => void;
  setAddRfNodeFn: (fn: ((rfNode: any) => void) | null) => void;
  addNode: (kind: FlowNode['type']) => void;
}

let toastSeq = 0;
const uid = () => Math.random().toString(36).slice(2, 10);

export const useStore = create<State>((set, get) => ({
  workflows: [],
  current: null,
  selectedNodeId: null,
  rightTab: 'config',
  runs: [],
  lastExec: null,
  running: false,
  aiOpen: false,
  explainText: null,
  explainAi: null,
  toasts: [],
  serverOnline: false,
  historyTick: 0,
  rfInstance: null,
  addRfNodeFn: null,

  setWorkflows: workflows =>
    set(s => {
      const prev = s.current;
      let current: Workflow | null = prev;
      if (prev) {
        const server = workflows.find(w => w.id === prev.id);
        current = !server ? null : !prev.updatedAt || server.updatedAt >= prev.updatedAt ? server : prev;
      }
      return { workflows, current };
    }),
  setCurrent: current =>
    set({
      current,
      runs: [],
      lastExec: null,
      selectedNodeId: null,
      rightTab: 'config',
      explainText: null,
      explainAi: null
    }),
  patchCurrent: patch => {
    const cur = get().current;
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    set({ current: next, workflows: get().workflows.map(w => (w.id === cur.id ? next : w)) });
  },
  selectNode: id => set({ selectedNodeId: id, rightTab: 'config' }),
  setRightTab: rightTab => set({ rightTab }),
  applyExecEvent: e => {
    if (e.workflowId !== get().current?.id) return;
    if (e.type === 'start') set({ running: true, runs: [], lastExec: null });
    else if (e.type === 'node' && e.run) set(s => ({ runs: [...s.runs, e.run!] }));
    else if (e.type === 'end')
      set(s => ({
        running: false,
        lastExec: {
          at: e.at,
          trigger: e.trigger || 'manual',
          status: e.status || 'success',
          output: e.output,
          durationMs: s.runs.reduce((a, r) => a + r.durationMs, 0)
        }
      }));
  },
  setRunning: running => set({ running }),
  setAiOpen: aiOpen => set({ aiOpen }),
  setExplain: (explainText, explainAi) => set({ explainText, explainAi }),
  toast: (text, kind = 'ok') => {
    const id = ++toastSeq;
    set(s => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4000);
  },
  setServerOnline: serverOnline => set({ serverOnline }),
  bumpHistory: () => set(s => ({ historyTick: s.historyTick + 1 })),
  setRfInstance: rfInstance => set({ rfInstance }),
  setAddRfNodeFn: addRfNodeFn => set({ addRfNodeFn }),
  addNode: kind => {
    const s = get();
    const cur = s.current;
    if (!cur) return;
    const id = uid();
    let pos = { x: 160 + Math.random() * 240, y: 120 + Math.random() * 180 };
    if (s.rfInstance) {
      const p = s.rfInstance.screenToFlowPosition({ x: window.innerWidth * 0.45, y: window.innerHeight * 0.45 });
      pos = { x: p.x - 110 + (Math.random() * 120 - 60), y: p.y - 40 + (Math.random() * 120 - 60) };
    }
    const node: FlowNode = {
      id,
      type: kind,
      position: { x: Math.round(pos.x), y: Math.round(pos.y) },
      config: defaultsFor(kind)
    };
    if (s.addRfNodeFn) {
      s.addRfNodeFn({ id, type: 'fp', position: node.position, data: { node } });
    } else {
      s.patchCurrent({ nodes: [...cur.nodes, node] });
    }
    s.selectNode(id);
  }
}));
