export type NodeKind =
  | 'manual'
  | 'webhook'
  | 'schedule'
  | 'httpRequest'
  | 'if'
  | 'set'
  | 'code'
  | 'respond'
  | 'delay'
  | 'loop'
  | 'telegram'
  | 'form';

export interface XY {
  x: number;
  y: number;
}

export interface FlowNode {
  id: string;
  type: NodeKind;
  position: XY;
  config: Record<string, any>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt: number;
  updatedAt: number;
}

export interface NodeRun {
  nodeId: string;
  status: 'success' | 'error';
  input: any;
  output: any;
  error?: string;
  durationMs: number;
  runIndex: number;
}

export interface ExecEvent {
  type: 'start' | 'node' | 'end';
  workflowId: string;
  workflowName?: string;
  at: number;
  trigger?: string;
  run?: NodeRun;
  status?: 'success' | 'error';
  output?: any;
}

export type ExecListener = (e: ExecEvent) => void;
