import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { NODE_META } from '../nodes/registry';
import { Empty } from './ui';

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
  const [tgToken, setTgToken] = useState('');
  const [tgChat, setTgChat] = useState('');
  const toast = useStore(s => s.toast);

  useEffect(() => {
    if (open)
      api
        .getSettings()
        .then(s => {
          setBase(s.aiBaseUrl || 'https://api.openai.com/v1');
          setModel(s.aiModel || 'gpt-4o-mini');
          setTgToken('');
          setTgChat('');
        })
        .catch(() => {});
  }, [open]);

  if (!open) return null;

  const save = async () => {
    try {
      await api.saveSettings({
        ...(key ? { aiKey: key } : {}),
        aiBaseUrl: base,
        aiModel: model,
        ...(tgToken ? { telegramBotToken: tgToken } : {}),
        ...(tgChat ? { telegramChatId: tgChat } : {})
      });
      toast('Настройки сохранены');
      onClose();
    } catch (e: any) {
      toast('Ошибка: ' + e.message, 'err');
    }
  };

  return (
    <ModalShell title="⚙ Настройки" onClose={onClose}>
      <div className="mt-3 space-y-3 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">ИИ</div>
        <label className="block">
          <span className="text-xs text-slate-400">API-ключ (OpenAI-совместимый)</span>
          <input className="inp mt-1" type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-… (пусто = не менять)" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Base URL</span>
          <input className="inp mt-1" value={base} onChange={e => setBase(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Модель</span>
          <input className="inp mt-1" value={model} onChange={e => setModel(e.target.value)} />
        </label>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Telegram</div>
        <label className="block">
          <span className="text-xs text-slate-400">Токен бота (от @BotFather)</span>
          <input className="inp mt-1" type="password" value={tgToken} onChange={e => setTgToken(e.target.value)} placeholder="123456:ABC… (пусто = не менять)" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-400">Chat ID (твой чат/канал)</span>
          <input className="inp mt-1" value={tgChat} onChange={e => setTgChat(e.target.value)} placeholder="-100… или 123456789" />
        </label>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Работают любые OpenAI-совместимые API: OpenAI, OpenRouter, Groq, локальный Ollama (Base URL:
          http://localhost:11434/v1, модель: llama3.1). Без ключа FlowPilot использует встроенный шаблонный ИИ —
          офлайн. Telegram без токена работает в mock-режиме (сообщение «доставляется» локально — для офлайн-демо).
          Ключи и токены сохраняются только на сервере и не передаются в браузер.
        </p>
        <button className="btn-primary w-full" onClick={save}>
          Сохранить
        </button>
      </div>
    </ModalShell>
  );
}

export function AiFixModal({ open, nodeId, onClose }: { open: boolean; nodeId: string | null; onClose: () => void }) {
  const current = useStore(s => s.current);
  const toast = useStore(s => s.toast);
  const [state, setState] = useState<{ advice: string; fixed: Record<string, any> | null; ai: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !nodeId || !current) return;
    setState(null);
    setBusy(true);
    api
      .aiFix(current.id, nodeId)
      .then(setState)
      .catch(e => toast('Ошибка: ' + e.message, 'err'))
      .finally(() => setBusy(false));
  }, [open, nodeId, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !nodeId || !current) return null;
  const node = current.nodes.find(n => n.id === nodeId);

  const apply = () => {
    if (!state?.fixed || !node) return;
    useStore.getState().snapshot();
    useStore
      .getState()
      .patchCurrent({ nodes: current.nodes.map(n => (n.id === node.id ? { ...n, config: { ...n.config, ...state.fixed } } : n)) });
    toast('Конфиг применён — запусти воркфлоу заново');
    onClose();
  };

  return (
    <ModalShell title={`🩺 ИИ-доктор · ${node ? NODE_META[node.type].label : ''}`} onClose={onClose} wide>
      {busy && <div className="mt-3 animate-pulse text-sm text-slate-400">Диагностируем ошибку…</div>}
      {state && !busy && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200">
            {state.advice}
            <div className="mt-1 text-[10px] text-slate-500">{state.ai === 'llm' ? 'ИИ (LLM)' : 'офлайн-подсказки'}</div>
          </div>
          {state.fixed && node && (
            <>
              <div className="text-xs text-slate-400">Предложенный конфиг ноды:</div>
              <pre className="max-h-52 overflow-auto rounded bg-ink-950 p-2 font-mono text-[11px] text-emerald-300/90">{JSON.stringify(state.fixed, null, 2)}</pre>
              <button className="btn-primary w-full" onClick={apply}>
                ✓ Применить исправление
              </button>
            </>
          )}
          <p className="text-[10px] text-slate-600">Применение не откатится само — Ctrl+Z отменит, если не нравится.</p>
        </div>
      )}
    </ModalShell>
  );
}

export function TestsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useStore(s => s.current);
  const toast = useStore(s => s.toast);
  const [tests, setTests] = useState<Array<{ name: string; method: string; url: string; body: string; expect: string }> | null>(null);
  const [aiKind, setAiKind] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !current) return;
    setTests(null);
    setBusy(true);
    api
      .aiTests(current.id)
      .then(r => {
        setTests(r.tests);
        setAiKind(r.ai);
      })
      .catch(e => toast('Ошибка: ' + e.message, 'err'))
      .finally(() => setBusy(false));
  }, [open, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !current) return null;

  const snippet = (t: { method: string; url: string; body: string }) => {
    let bodyArg: string;
    try {
      bodyArg = JSON.stringify(JSON.parse(t.body));
    } catch {
      bodyArg = JSON.stringify(t.body);
    }
    return `fetch("${location.origin}${t.url}", {method:"${t.method}", headers:{"Content-Type":"application/json"}, body: ${bodyArg}})`;
  };

  return (
    <ModalShell title="🧪 Тесты воркфлоу" onClose={onClose} wide>
      {busy && <div className="mt-3 animate-pulse text-sm text-slate-400">Генерируем тесты…</div>}
      {tests && !busy && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-slate-500">
            {aiKind === 'llm' ? 'Сгенерированы ИИ' : 'Сгенерированы правилами (офлайн)'} — вставь в консоль браузера (F12 → Console):
          </p>
          {tests.map((t, i) => (
            <div key={i} className="rounded-lg border border-ink-700 bg-ink-850 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                {t.name}
                <span className="ml-auto rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-slate-500">{t.method}</span>
              </div>
              <pre className="mt-2 overflow-auto rounded bg-ink-950 p-2 font-mono text-[10px] text-sky-300/90">{snippet(t)}</pre>
              <div className="mt-1 text-[10px] text-slate-500">Ожидаемо: {t.expect}</div>
              <button
                className="mt-1 rounded-md border border-ink-600 px-2 py-0.5 text-[10px] text-slate-400 hover:border-blue-500 hover:text-blue-300"
                onClick={() => {
                  navigator.clipboard?.writeText(snippet(t));
                  toast('Тест скопирован');
                }}
              >
                ⧉ Копировать
              </button>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
