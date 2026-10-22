import { Handle, Position } from '@xyflow/react';
import type { FlowNode, NodeRun } from 'core/types';
import { NODE_META } from '../nodes/registry';

interface Props {
  data: { node: FlowNode; lastRun?: NodeRun };
  selected?: boolean;
}

export function NodeCard({ data, selected }: Props) {
  const node = data.node;
  const meta = NODE_META[node.type];
  const run = data.lastRun;
  const status = run ? (run.status === 'success' ? 'ok' : 'err') : 'idle';
  const preview =
    run && !run.error && run.output !== undefined
      ? (typeof run.output === 'string' ? run.output : JSON.stringify(run.output)).slice(0, 80)
      : null;

  return (
    <div
      className={`w-52 rounded-xl border bg-ink-850 px-3 py-2 shadow-xl transition-colors ${
        selected ? 'border-blue-500 shadow-blue-500/20' : 'border-ink-600'
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm"
          style={{ background: meta.color + '22', color: meta.color }}
        >
          {meta.icon}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-slate-100">{meta.label}</div>
          <div className="truncate font-mono text-[9px] text-slate-600">{node.id}</div>
        </div>
        <span
          className={`ml-auto h-2.5 w-2.5 shrink-0 rounded-full ${
            status === 'ok' ? 'bg-emerald-400' : status === 'err' ? 'bg-rose-500' : 'bg-ink-500'
          }`}
        />
      </div>
      {node.type === 'webhook' && (
        <div className="mt-1.5 truncate rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[9px] text-amber-300/80">
          POST /api/webhook/{node.id}
        </div>
      )}
      {run && run.error && (
        <div className="mt-1 truncate text-[10px] text-rose-400" title={run.error}>
          ⚠ {run.error}
        </div>
      )}
      {preview && (
        <div className="mt-1 truncate rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300/70" title={preview}>
          {preview}
        </div>
      )}
      {node.type === 'if' ? (
        <>
          <Handle type="source" id="true" position={Position.Right} style={{ top: '32%' }} />
          <Handle type="source" id="false" position={Position.Right} style={{ top: '72%' }} />
          <div className="mt-0.5 flex justify-end gap-3 text-[8px] text-slate-600">
            <span>верх: true</span>
            <span>низ: false</span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}
