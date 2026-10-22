import { api } from '../api';
import { NODE_META, NODE_ORDER } from '../nodes/registry';
import { useStore } from '../store';

export function Sidebar() {
  const workflows = useStore(s => s.workflows);
  const current = useStore(s => s.current);
  const setCurrent = useStore(s => s.setCurrent);
  const setWorkflows = useStore(s => s.setWorkflows);
  const addNode = useStore(s => s.addNode);
  const toast = useStore(s => s.toast);

  const createWf = async () => {
    try {
      const wf = await api.createWorkflow({ name: 'Новый воркфлоу' });
      const ws = await api.listWorkflows();
      setWorkflows(ws);
      setCurrent(wf);
    } catch (e: any) {
      toast('Сервер недоступен: ' + e.message, 'err');
    }
  };

  const delWf = async (id: string) => {
    if (!confirm('Удалить воркфлоу?')) return;
    try {
      await api.deleteWorkflow(id);
      const ws = await api.listWorkflows();
      setWorkflows(ws);
      if (current?.id === id) setCurrent(ws[0] || null);
    } catch (e: any) {
      toast('Ошибка: ' + e.message, 'err');
    }
  };

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900">
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Воркфлоу</span>
        <button className="btn-ghost" title="Создать воркфлоу" onClick={createWf}>
          ＋
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-1">
          {workflows.map(w => (
            <div
              key={w.id}
              className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                w.id === current?.id ? 'bg-ink-800 text-slate-100' : 'text-slate-400 hover:bg-ink-850'
              }`}
            >
              <button className="min-w-0 flex-1 truncate text-left" onClick={() => setCurrent(w)}>
                {w.name}
              </button>
              <span className="text-[9px] text-slate-600">{w.nodes.length}н</span>
              <button className="hidden text-slate-600 hover:text-rose-400 group-hover:block" onClick={() => delWf(w.id)}>
                ✕
              </button>
            </div>
          ))}
          {!workflows.length && <div className="px-2 py-4 text-center text-xs text-slate-600">Пока пусто</div>}
        </div>

        <div className="mt-4 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ножды</div>
        <div className="mt-1 space-y-0.5">
          {NODE_ORDER.map(kind => {
            const m = NODE_META[kind];
            return (
              <button
                key={kind}
                disabled={!current}
                onClick={() => addNode(kind)}
                title={m.description}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-slate-300 hover:bg-ink-800 disabled:opacity-40"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded-md text-xs"
                  style={{ background: m.color + '22', color: m.color }}
                >
                  {m.icon}
                </span>
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t border-ink-700 p-3 text-[10px] leading-relaxed text-slate-600">
        Клик по ноде — настройки · Del — удалить
        <br />
        Соединяйте узлы линиями слева → направо
      </div>
    </div>
  );
}
