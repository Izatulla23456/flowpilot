import { useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { ModalShell } from './Modals';

const EXAMPLES = [
  'Каждые 5 минут проверять список заказов и присылать в Telegram те, что дороже 5000',
  'Когда на webhook приходит письмо, если в теме есть слово «счёт» — отправить уведомление в Telegram',
  'Принимать JSON { "text": "..." }, переводить текст в верхний регистр и возвращать'
];

export function AiPanel() {
  const open = useStore(s => s.aiOpen);
  const setOpen = useStore(s => s.setAiOpen);
  const setWorkflows = useStore(s => s.setWorkflows);
  const setCurrent = useStore(s => s.setCurrent);
  const toast = useStore(s => s.toast);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ name: string; ai: string } | null>(null);

  if (!open) return null;

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.aiGenerate(prompt);
      const ws = await api.listWorkflows();
      setWorkflows(ws);
      setCurrent(r.workflow);
      setResult({ name: r.workflow.name, ai: r.ai });
      toast(r.ai === 'llm' ? 'ИИ собрал воркфлоу ✨' : 'Собран в шаблонном режиме (ключ ИИ не задан — ⚙ Настройки)');
    } catch (e: any) {
      toast('Ошибка: ' + e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="✨ ИИ-конструктор" onClose={() => setOpen(false)}>
      <p className="mt-1 text-xs text-slate-500">
        Опишите автоматизацию своими словами — FlowPilot сам соберёт воркфлоу на канве.
      </p>
      <textarea
        className="inp mt-3 h-28 resize-none"
        placeholder="Например: когда на почту приходит письмо, извлеки сумму и отправь её в Telegram…"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map(ex => (
          <button
            key={ex}
            className="rounded-full border border-ink-600 px-2.5 py-1 text-left text-[10px] text-slate-400 hover:border-blue-500 hover:text-blue-400"
            onClick={() => setPrompt(ex)}
          >
            {ex.length > 55 ? ex.slice(0, 55) + '…' : ex}
          </button>
        ))}
      </div>
      {result && (
        <div className="mt-2 text-xs text-slate-400">
          Создан: <b className="text-slate-200">{result.name}</b>{' '}
          {result.ai === 'template' && <span className="text-amber-400">(шаблонный режим)</span>}
        </div>
      )}
      <button className="btn-primary mt-4 w-full" disabled={busy} onClick={generate}>
        {busy ? 'Собираю…' : 'Собрать воркфлоу'}
      </button>
    </ModalShell>
  );
}
