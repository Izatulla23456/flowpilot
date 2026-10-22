import { useEffect } from 'react';
import { api } from './api';
import { AiPanel } from './components/AiPanel';
import { ConfigPanel } from './components/ConfigPanel';
import { DataPanel } from './components/DataPanel';
import { FlowCanvas } from './components/FlowCanvas';
import { HistoryPanel } from './components/HistoryPanel';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { useStore } from './store';

function Toasts() {
  const toasts = useStore(s => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`rounded-full border px-4 py-1.5 text-xs shadow-lg ${
            t.kind === 'ok' ? 'border-emerald-500/40 bg-ink-900 text-emerald-300' : 'border-rose-500/40 bg-ink-900 text-rose-300'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const current = useStore(s => s.current);
  const rightTab = useStore(s => s.rightTab);
  const setRightTab = useStore(s => s.setRightTab);
  const running = useStore(s => s.running);

  // первичная загрузка
  useEffect(() => {
    let alive = true;
    api
      .listWorkflows()
      .then(ws => {
        if (!alive) return;
        useStore.getState().setWorkflows(ws);
        if (ws.length) useStore.getState().setCurrent(ws[0]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // websocket: live-события выполнения
  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => useStore.getState().setServerOnline(true);
      ws.onmessage = m => {
        try {
          const msg = JSON.parse(m.data);
          if (msg.type === 'exec' && msg.event) useStore.getState().applyExecEvent(msg.event);
          else if (msg.type === 'workflows-updated') api.listWorkflows().then(useStore.getState().setWorkflows).catch(() => {});
          else if (msg.type === 'history') useStore.getState().bumpHistory();
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        useStore.getState().setServerOnline(false);
        timer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      clearTimeout(timer);
      ws?.close();
    };
  }, []);

  // автосохранение
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      api.saveWorkflow(current).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [current]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-950 text-slate-200">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="relative min-w-0 flex-1">
          {current ? (
            <FlowCanvas />
          ) : (
            <div className="grid h-full place-items-center text-sm text-slate-600">Выберите или создайте воркфлоу слева</div>
          )}
          {running && (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-blue-500/40 bg-ink-900/90 px-3 py-1 text-xs text-blue-300 shadow-lg">
              Выполняется…
            </div>
          )}
        </div>
        <div className="flex w-80 shrink-0 flex-col border-l border-ink-700 bg-ink-900">
          <div className="flex border-b border-ink-700 text-xs">
            {([
              ['config', '⚙ Нода'],
              ['data', '📊 Данные'],
              ['history', '🕘 Журнал']
            ] as const).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setRightTab(t)}
                className={`flex-1 py-2 transition-colors ${
                  rightTab === t ? 'bg-ink-800 font-medium text-slate-100' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {rightTab === 'config' ? <ConfigPanel /> : rightTab === 'data' ? <DataPanel /> : <HistoryPanel />}
          </div>
        </div>
      </div>
      <AiPanel />
      <Toasts />
    </div>
  );
}
