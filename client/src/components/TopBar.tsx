import { useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { AiPanel } from './AiPanel';
import { SettingsModal, TemplatesModal } from './Modals';

export function TopBar() {
  const current = useStore(s => s.current);
  const patchCurrent = useStore(s => s.patchCurrent);
  const running = useStore(s => s.running);
  const online = useStore(s => s.serverOnline);
  const setAiOpen = useStore(s => s.setAiOpen);
  const setExplain = useStore(s => s.setExplain);
  const setRightTab = useStore(s => s.setRightTab);
  const toast = useStore(s => s.toast);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const run = async () => {
    if (!current || running) return;
    useStore.getState().setRunning(true);
    setRightTab('data');
    try {
      const r = await api.run(current.id);
      if (!r.ok) toast(r.error || 'Ошибка запуска', 'err');
    } catch (e: any) {
      toast('Сервер недоступен: ' + e.message, 'err');
      useStore.getState().setRunning(false);
    }
  };

  const explain = async () => {
    if (!current) return;
    setExplain('Описываю…', null);
    setRightTab('data');
    try {
      const r = await api.aiExplain(current.id);
      setExplain(r.text, r.ai);
    } catch (e: any) {
      toast('Ошибка: ' + e.message, 'err');
      setExplain(null, null);
    }
  };

  const exportWf = () => {
    if (!current) return;
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${current.name.replace(/\s+/g, '_')}.flowpilot.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importWf = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const wf = JSON.parse(await f.text());
        if (!Array.isArray(wf.nodes)) throw new Error('bad file');
        const created = await api.createWorkflow({ name: wf.name || 'Imported', nodes: wf.nodes, edges: wf.edges || [] });
        const ws = await api.listWorkflows();
        useStore.getState().setWorkflows(ws);
        useStore.getState().setCurrent(created);
        toast(`Импортирован «${created.name}»`);
      } catch {
        toast('Не удалось разобрать файл', 'err');
      }
    };
    input.click();
  };

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-900 px-3">
      <div className="flex items-center gap-2 pr-2">
        <span className="text-base">🛸</span>
        <span className="text-sm font-bold text-slate-100">
          Flow<span className="text-blue-400">Pilot</span>
        </span>
      </div>
      <input
        className="w-44 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-slate-200 outline-none hover:border-ink-600 focus:border-blue-500"
        value={current?.name || ''}
        placeholder="имя воркфлоу"
        onChange={e => patchCurrent({ name: e.target.value })}
      />
      <span
        className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-rose-500'}`}
        title={online ? 'Сервер на связи' : 'Сервер недоступен'}
      />
      {current?.nodes.some(n => n.type === 'webhook') && (
        <button
          title="Скопировать URL webhook"
          onClick={() => {
            navigator.clipboard?.writeText(`http://localhost:8787/api/webhook/${current.id}`);
            toast('URL webhook скопирован');
          }}
          className="hidden items-center gap-1 rounded-md border border-ink-600 px-2 py-1 font-mono text-[10px] text-amber-300/90 hover:border-amber-500 lg:flex"
        >
          ⚡ /api/webhook/{current.id.slice(0, 6)}
        </button>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          disabled={running || !current}
          onClick={run}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {running ? 'Идёт…' : '▶ Запустить'}
        </button>
        <button className="btn-ghost !text-sm" title="ИИ: собрать воркфлоу по описанию" onClick={() => setAiOpen(true)}>
          ✨ ИИ
        </button>
        <button className="btn-ghost !text-sm" title="ИИ: описать текущий воркфлоу" onClick={explain}>
          📖
        </button>
        <button className="btn-ghost !text-sm" title="Шаблоны" onClick={() => setShowTemplates(true)}>
          📦
        </button>
        <button className="btn-ghost !text-sm" title="Экспорт JSON" onClick={exportWf}>
          ⬇
        </button>
        <button className="btn-ghost !text-sm" title="Импорт JSON" onClick={importWf}>
          📂
        </button>
        <button className="btn-ghost !text-sm" title="Настройки ИИ" onClick={() => setShowSettings(true)}>
          ⚙
        </button>
      </div>
      <AiPanel />
      <TemplatesModal open={showTemplates} onClose={() => setShowTemplates(false)} />
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
