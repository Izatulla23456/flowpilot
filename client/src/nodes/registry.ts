import type { NodeKind } from 'core/types';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'json' | 'code' | 'number' | 'select' | 'fields';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  help?: string;
  defaultValue?: any;
}

export interface NodeMeta {
  kind: NodeKind;
  label: string;
  icon: string;
  color: string;
  description: string;
  fields: FieldDef[];
  isTrigger?: boolean;
}

export const NODE_META: Record<NodeKind, NodeMeta> = {
  manual: {
    kind: 'manual',
    label: 'Ручной запуск',
    icon: '▶',
    color: '#22c55e',
    isTrigger: true,
    description: 'Старт по кнопке «Запустить»',
    fields: [
      {
        key: 'payload',
        label: 'Стартовые данные (JSON)',
        type: 'json',
        placeholder: '{ "text": "привет" }',
        help: 'Эти данные станут входом воркфлоу',
        defaultValue: '{}'
      }
    ]
  },
  webhook: {
    kind: 'webhook',
    label: 'Webhook',
    icon: '⚡',
    color: '#f59e0b',
    isTrigger: true,
    description: 'Старт при POST-запросе',
    fields: [{ key: 'note', label: 'Заметка', type: 'text', placeholder: 'Кто будет слать запросы…' }]
  },
  schedule: {
    kind: 'schedule',
    label: 'Расписание',
    icon: '⏰',
    color: '#8b5cf6',
    isTrigger: true,
    description: 'Запускается по таймеру',
    fields: [{ key: 'everyMinutes', label: 'Каждые (минут)', type: 'number', defaultValue: 5 }]
  },
  httpRequest: {
    kind: 'httpRequest',
    label: 'HTTP-запрос',
    icon: '🌐',
    color: '#3b82f6',
    description: 'Запрос к любому API',
    fields: [
      {
        key: 'method',
        label: 'Метод',
        type: 'select',
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({ value: m, label: m })),
        defaultValue: 'GET'
      },
      {
        key: 'url',
        label: 'URL',
        type: 'text',
        placeholder: 'https://api.example.com/data  или  {{body.url}}',
        help: '{{field.path}} подставит значения из входных данных'
      },
      { key: 'headersJson', label: 'Headers (JSON)', type: 'json', placeholder: '{ "Content-Type": "application/json" }' },
      { key: 'body', label: 'Body', type: 'textarea', placeholder: '{ "text": "Привет, {{body.name}}" }' }
    ]
  },
  if: {
    kind: 'if',
    label: 'Условие (IF)',
    icon: '🔀',
    color: '#ec4899',
    description: 'Ветвление true / false',
    fields: [
      { key: 'left', label: 'Левая часть', type: 'text', placeholder: '{{status}}', help: '{{field.path}} — из входных данных' },
      {
        key: 'operator',
        label: 'Оператор',
        type: 'select',
        defaultValue: 'equals',
        options: [
          { value: 'equals', label: 'равно' },
          { value: 'notEquals', label: 'не равно' },
          { value: 'contains', label: 'содержит' },
          { value: 'notContains', label: 'не содержит' },
          { value: 'startsWith', label: 'начинается с' },
          { value: 'endsWith', label: 'заканчивается на' },
          { value: 'gt', label: 'больше' },
          { value: 'gte', label: 'больше или равно' },
          { value: 'lt', label: 'меньше' },
          { value: 'lte', label: 'меньше или равно' },
          { value: 'exists', label: 'существует' },
          { value: 'notExists', label: 'не существует' },
          { value: 'isEmpty', label: 'пусто' },
          { value: 'notEmpty', label: 'не пусто' }
        ]
      },
      { key: 'right', label: 'Правая часть', type: 'text', placeholder: '200' }
    ]
  },
  set: {
    kind: 'set',
    label: 'Присвоить (Set)',
    icon: '✏️',
    color: '#14b8a6',
    description: 'Записать / добавить поля',
    fields: [{ key: 'fields', label: 'Поля', type: 'fields', defaultValue: [] }]
  },
  code: {
    kind: 'code',
    label: 'Код (JS)',
    icon: '💻',
    color: '#eab308',
    description: 'Своя логика на JavaScript',
    fields: [
      {
        key: 'code',
        label: 'Код',
        type: 'code',
        placeholder: 'return { ok: data.body.status === 200 };',
        help: 'data — входные данные. Верните результат.',
        defaultValue: 'return data;'
      }
    ]
  },
  respond: {
    kind: 'respond',
    label: 'Ответ',
    icon: '📤',
    color: '#06b6d4',
    description: 'Ответ webhook / финальный результат',
    fields: [
      {
        key: 'body',
        label: 'Тело ответа (JSON / шаблон)',
        type: 'textarea',
        placeholder: 'пусто = данные как есть',
        help: 'Можно шаблон: { "x": {{value}} }'
      }
    ]
  },
  delay: {
    kind: 'delay',
    label: 'Задержка',
    icon: '⏳',
    color: '#64748b',
    description: 'Подождать N миллисекунд',
    fields: [{ key: 'ms', label: 'Миллисекунды', type: 'number', defaultValue: 1000 }]
  }
};

export const NODE_ORDER: NodeKind[] = ['manual', 'webhook', 'schedule', 'httpRequest', 'if', 'set', 'code', 'respond', 'delay'];

export function defaultsFor(kind: NodeKind): Record<string, any> {
  const c: Record<string, any> = {};
  for (const f of NODE_META[kind].fields) if (f.defaultValue !== undefined) c[f.key] = f.defaultValue;
  return c;
}
