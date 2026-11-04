import { useEffect, useState } from 'react';
import { api, ApiAuthError, setToken } from './api';
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
  const online = useStore(s => s.serverOnline);
  const [authFailed, setAuthFailed] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  // undo / redo: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        useStore.getState().redo();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

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
      .catch((e: any) => {
        if (alive && e instanceof ApiAuthError) setAuthFailed(true);
      });
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

  if (authFailed) {
    return (
      <div className="grid h-full place-items-center bg-ink-950 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-ink-600 bg-ink-900 p-6">
          <div className="text-lg">🔐</div>
          <h1 className="mt-2 text-base font-semibold text-slate-100">Нужен админ-токен</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            На сервере включена защита (FLOWPILOT_ADMIN_TOKEN). Введите токен, чтобы открыть конструктор.
          </p>
          <form
            className="mt-4 space-y-2"
            onSubmit={e => {
              e.preventDefault();
              setToken(tokenInput.trim());
              location.reload();
            }}
          >
            <input className="inp" type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)} placeholder="токен" autoFocus />
            <button className="btn-primary w-full" type="submit">
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-950 text-slate-200">
      <TopBar />
      {!online && (
        <div className="pointer-events-none fixed left-1/2 top-14 z-[70] -translate-x-1/2 rounded-xl border border-rose-500/50 bg-ink-900 px-4 py-2 text-sm text-rose-300 shadow-xl">
          ⚠ Сервер не отвечает. Нажми F5 — если не помогло, включи автопилот и я починю сам
        </div>
      )}
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
