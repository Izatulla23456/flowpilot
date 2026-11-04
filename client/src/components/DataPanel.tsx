import { useState } from 'react';
import { NODE_META } from '../nodes/registry';
import { useStore } from '../store';
import { AiFixModal } from './Modals';
import { Empty } from './ui';

const pretty = (v: any) => {
  if (v === undefined) return '∅';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

export function DataPanel() {
  const runs = useStore(s => s.runs);
  const current = useStore(s => s.current);
  const explainText = useStore(s => s.explainText);
  const explainAi = useStore(s => s.explainAi);
  const setExplain = useStore(s => s.setExplain);
  const lastExec = useStore(s => s.lastExec);
  const [fixNode, setFixNode] = useState<string | null>(null);

  if (explainText) {
    return (
      <div className="h-full overflow-y-auto p-3">
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-violet-300">
            📖 Описание воркфлоу
            {explainAi === 'rules' && (
              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[9px] text-slate-500">авто-описание</span>
            )}
            <button className="ml-auto text-slate-500 hover:text-slate-300" onClick={() => setExplain(null, null)}>
              ✕
            </button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{explainText}</p>
        </div>
      </div>
    );
  }

  if (!lastExec) {
    return <Empty text="Нажмите «Запустить» или отправьте POST на webhook — здесь появятся данные каждой ноды" />;
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div
        className={`mb-2 rounded-lg border p-2 text-xs ${
          lastExec.status === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
            : 'border-rose-500/30 bg-rose-500/5 text-rose-300'
        }`}
      >
        {lastExec.status === 'success' ? '✓ Завершился успешно' : '✕ Были ошибки'} · {lastExec.durationMs} мс · триггер:{' '}
        {lastExec.trigger}
      </div>
      {runs.length === 0 && <div className="text-center text-xs text-slate-600">Нет данных</div>}
      <div className="space-y-2">
        {runs.map((r, i) => {
          const node = current?.nodes.find(n => n.id === r.nodeId);
          const meta = node ? NODE_META[node.type] : null;
          return (
            <div key={i} className="rounded-lg border border-ink-700 bg-ink-850 p-2">
              <div className="flex items-center gap-2 text-xs">
                <span>{meta?.icon}</span>
                <span className="font-medium text-slate-200">{meta?.label || r.nodeId}</span>
                <span
                  className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${
                    r.status === 'success' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                  }`}
                >
                  {r.status === 'success' ? 'OK' : 'ERR'} · {r.durationMs} мс
                </span>
              </div>
              {r.error && (
                <>
                  <pre className="mt-1 whitespace-pre-wrap text-[11px] text-rose-400">{r.error}</pre>
                  <button
                    className="mt-1.5 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20"
                    onClick={() => setFixNode(r.nodeId)}
                  >
                    🩺 Починить с ИИ
                  </button>
                </>
              )}
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-300">Вход</summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-ink-950 p-2 text-[10px] text-slate-400">{pretty(r.input)}</pre>
              </details>
              <details open className="mt-1">
                <summary className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-300">Выход</summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-ink-950 p-2 text-[10px] text-emerald-300/80">{pretty(r.output)}</pre>
              </details>
            </div>
          );
        })}
      </div>
      <AiFixModal open={!!fixNode} nodeId={fixNode} onClose={() => setFixNode(null)} />
    </div>
  );
}
