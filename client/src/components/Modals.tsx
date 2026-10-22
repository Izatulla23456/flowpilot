import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { useStore } from '../store';

export function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl border border-ink-600 bg-ink-850 p-5 shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button className="ml-auto text-slate-500 hover:text-slate-300" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function TemplatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<Array<{ name: string; description: string }>>([]);
  const toast = useStore(s => s.toast);

  useEffect(() => {
    if (open) api.templates().then(setItems).catch(() => {});
  }, [open]);

  if (!open) return null;

  const create = async (name: string) => {
    try {
      const wf = await api.createWorkflow({ template: name });
      const ws = await api.listWorkflows();
      useStore.getState().setWorkflows(ws);
      useStore.getState().setCurrent(wf);
      onClose();
      toast(`Создан «${wf.name}»`);
    } catch (e: any) {
      toast('Ошибка: ' + e.message, 'err');
    }
  };

  return (
    <ModalShell title="📦 Готовые шаблоны" onClose={onClose} wide>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map(t => (
          <button
            key={t.name}
            onClick={() => create(t.name)}
            className="rounded-xl border border-ink-600 bg-ink-900 p-3 text-left hover:border-blue-500"
          >
            <div className="text-sm font-medium text-slate-100">{t.name}</div>
            <div className="mt-1 text-xs text-slate-500">{t.description}</div>
          </button>
        ))}
      </div>
    </ModalShell>
  );
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, setKey] = useState('');
  const [base, setBase] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o-mini');
  const toast = useStore(s => s.toast);

  useEffect(() => {
    if (open)
      api
        .getSettings()
        .then(s => {
          setKey(s.aiKey || '');
          setBase(s.aiBaseUrl || 'https://api.openai.com/v1');
          setModel(s.aiModel || 'gpt-4o-mini');
        })
        .catch(() => {});
  }, [open]);

  if (!open) return null;

  const save = async () => {
    try {
      await api.saveSettings({ aiKey: key, aiBaseUrl: base, aiModel: model });
      toast('Настройки сохранены');
      onClose();
    } catch (e: any) {
      toast('Ошибка: ' + e.message, 'err');
    }
  };

  return (
    <ModalShell title="⚙ Настройки ИИ" onClose={onClose}>
      <div className="mt-3 space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-slate-400">API-ключ (OpenAI-совместимый)</span>
          <input className="inp mt-1" type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-…" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Base URL</span>
          <input className="inp mt-1" value={base} onChange={e => setBase(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Модель</span>
          <input className="inp mt-1" value={model} onChange={e => setModel(e.target.value)} />
        </label>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Работают любые OpenAI-совместимые API: OpenAI, OpenRouter, Groq, локальный Ollama (Base URL:
          http://localhost:11434/v1, модель: llama3.1). Без ключа FlowPilot использует встроенный шаблонный ИИ — офлайн.
        </p>
        <button className="btn-primary w-full" onClick={save}>
          Сохранить
        </button>
      </div>
    </ModalShell>
  );
}
