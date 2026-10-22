import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { Empty } from './ui';

const safe = (v: any) => {
  try {
    return JSON.stringify(v, null, 2)?.slice(0, 400) ?? '∅';
  } catch {
    return String(v);
  }
};

export function HistoryPanel() {
  const current = useStore(s => s.current);
  const tick = useStore(s => s.historyTick);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!current) {
      setItems([]);
      return;
    }
    api.history(current.id).then(setItems).catch(() => setItems([]));
  }, [current?.id, tick]);

  if (!current) return <Empty text="—" />;
  if (!items.length) return <Empty text="Пока нет запусков. Нажмите «Запустить» или шлёпните webhook" />;

  return (
    <div className="h-full space-y-1.5 overflow-y-auto p-3">
      {[...items].reverse().map((h, i) => (
        <div key={i} className="rounded-lg border border-ink-700 bg-ink-850 p-2 text-xs">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${h.status === 'success' ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            <span className="text-slate-300">{new Date(h.at).toLocaleTimeString('ru-RU')}</span>
            <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] text-slate-400">{h.trigger}</span>
            <span className="ml-auto text-[10px] text-slate-500">{h.durationMs} мс</span>
          </div>
          {h.output !== undefined && (
            <pre className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap text-[10px] text-emerald-300/70">{safe(h.output)}</pre>
          )}
          {h.error && <div className="mt-1 text-[10px] text-rose-400">{h.error}</div>}
        </div>
      ))}
    </div>
  );
}
