import { NODE_META, type FieldDef } from '../nodes/registry';
import { useStore } from '../store';
import { Empty } from './ui';

const isValidJson = (s: string) => {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
};

function FieldsEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const rows: Array<{ key: string; value: string }> = Array.isArray(value) ? value : [];
  const upd = (i: number, patch: Partial<{ key: string; value: string }>) => {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1">
          <input className="inp" value={r.key} placeholder="ключ" onChange={e => upd(i, { key: e.target.value })} />
          <input
            className="inp flex-1"
            value={r.value}
            placeholder="значение или {{...}}"
            onChange={e => upd(i, { value: e.target.value })}
          />
          <button className="btn-ghost shrink-0" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button
        className="w-full rounded-lg border border-dashed border-ink-500 py-1.5 text-xs text-slate-400 hover:border-blue-500 hover:text-blue-400"
        onClick={() => onChange([...rows, { key: '', value: '' }])}
      >
        + Добавить поле
      </button>
    </div>
  );
}

function Field({ def, value, onChange }: { def: FieldDef; value: any; onChange: (v: any) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-400">{def.label}</label>
      {def.type === 'text' && (
        <input className="inp" value={value ?? ''} placeholder={def.placeholder} onChange={e => onChange(e.target.value)} />
      )}
      {def.type === 'number' && (
        <input
          className="inp"
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      )}
      {def.type === 'select' && (
        <select className="inp" value={value ?? def.defaultValue ?? ''} onChange={e => onChange(e.target.value)}>
          {(def.options || []).map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {(def.type === 'json' || def.type === 'textarea') && (
        <textarea
          className={`inp ${def.type === 'json' ? 'font-mono text-xs' : ''}`}
          rows={def.type === 'textarea' ? 5 : 4}
          value={value ?? ''}
          placeholder={def.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      )}
      {def.type === 'json' && typeof value === 'string' && value.trim() !== '' && (
        <p className={`mt-1 text-[10px] ${isValidJson(value) ? 'text-emerald-500' : 'text-rose-400'}`}>
          {isValidJson(value) ? '✓ валидный JSON' : '✕ не JSON'}
        </p>
      )}
      {def.type === 'code' && (
        <textarea
          className="inp font-mono text-[12px] leading-relaxed"
          rows={8}
          value={value ?? ''}
          placeholder={def.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      )}
      {def.type === 'fields' && <FieldsEditor value={value} onChange={onChange} />}
      {def.help && <p className="mt-1 text-[10px] text-slate-600">{def.help}</p>}
    </div>
  );
}

export function ConfigPanel() {
  const current = useStore(s => s.current);
  const selId = useStore(s => s.selectedNodeId);
  const patchCurrent = useStore(s => s.patchCurrent);
  const node = current?.nodes.find(n => n.id === selId);

  if (!current) return <Empty text="Выберите воркфлоу слева" />;
  if (!node) return <Empty text="Кликните по ноде на канве, чтобы настроить её" />;

  const meta = NODE_META[node.type];
  const setField = (key: string, value: any) => {
    patchCurrent({
      nodes: current.nodes.map(n => (n.id === node.id ? { ...n, config: { ...n.config, [key]: value } } : n))
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-700 p-3">
        <div className="flex items-center gap-2">
          <span
            className="grid h-8 w-8 place-items-center rounded-lg text-base"
            style={{ background: meta.color + '22', color: meta.color }}
          >
            {meta.icon}
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-100">{meta.label}</div>
            <div className="text-[11px] text-slate-500">{meta.description}</div>
          </div>
        </div>
        {node.type === 'webhook' && (
          <div className="mt-2 break-all rounded-lg bg-ink-900 p-2 font-mono text-[11px] text-amber-300">
            POST /api/webhook/{current.id}
          </div>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {meta.fields.map(f => (
          <Field key={f.key} def={f} value={node.config?.[f.key]} onChange={v => setField(f.key, v)} />
        ))}
      </div>
    </div>
  );
}
