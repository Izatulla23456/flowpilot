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
      { key: 'body', label: 'Body', type: 'textarea', placeholder: '{ "text": "Привет, {{body.name}}" }' },
      { key: 'retries', label: 'Повторы при сбое (0–5)', type: 'number', defaultValue: 0, help: 'Повторять запрос при ошибке сети или HTTP 5xx' },
      { key: 'retryDelayMs', label: 'Пауза между повторами, мс', type: 'number', defaultValue: 1000 }
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
  },
  loop: {
    kind: 'loop',
    label: 'Цикл (Loop)',
    icon: '🔁',
    color: '#f97316',
    description: 'Прогнать следующие ноды по каждому элементу массива',
    fields: [
      {
        key: 'source',
        label: 'Массив (путь в данных)',
        type: 'text',
        placeholder: '{{body.orders}}',
        help: 'Укажи поле-массив во входных данных. Для каждого элемента следующие ноды отработают отдельно'
      },
      {
        key: 'keyName',
        label: 'Имя переменной элемента',
        type: 'text',
        defaultValue: 'item',
        help: 'Внутри цикла текущий элемент доступен как {{item}}, порядковый — {{index}}'
      }
    ]
  },
  telegram: {
    kind: 'telegram',
    label: 'Telegram',
    icon: '📨',
    color: '#0ea5e9',
    description: 'Отправить сообщение в Telegram (бот-токен и чат — в настройках)',
    fields: [
      {
        key: 'text',
        label: 'Текст сообщения',
        type: 'textarea',
        placeholder: '🚀 Новый заказ: {{body.customer}} на {{body.sum}}',
        help: '{{field.path}} подставит значения из входных данных'
      },
      {
        key: 'chatId',
        label: 'Chat ID (опционально)',
        type: 'text',
        placeholder: 'пусто = чат из настроек',
        help: 'Переопределить чат, указанный в настройках приложения'
      }
    ]
  },
  form: {
    kind: 'form',
    label: 'Форма',
    icon: '📝',
    color: '#a855f7',
    isTrigger: true,
    description: 'Публичная HTML-форма: посетитель заполняет → данные приходят в воркфлоу',
    fields: [
      { key: 'title', label: 'Заголовок формы', type: 'text', defaultValue: 'Новая заявка' },
      {
        key: 'fields',
        label: 'Поля формы (JSON)',
        type: 'json',
        placeholder: '[{"name":"Имя"},{"name":"Email","type":"email"},{"name":"Комментарий","type":"textarea"}]',
        help: 'type: text | email | number | textarea; пустой список = одно поле «Сообщение»',
        defaultValue: '[{"name":"Имя"},{"name":"Email","type":"email"},{"name":"Комментарий","type":"textarea"}]'
      }
    ]
  }
};

export const NODE_ORDER: NodeKind[] = ['manual', 'webhook', 'schedule', 'form', 'httpRequest', 'if', 'loop', 'set', 'code', 'telegram', 'respond', 'delay'];

/** Подсказка «что дальше» — какие ноды логично подключить после данной */
export const NEXT_SUGGESTIONS: Record<NodeKind, Array<{ kind: NodeKind; why: string }>> = {
  manual: [
    { kind: 'set', why: 'подготовить данные' },
    { kind: 'httpRequest', why: 'получить данные с API' },
    { kind: 'telegram', why: 'сразу уведомить' }
  ],
  webhook: [
    { kind: 'if', why: 'разделить по условию' },
    { kind: 'set', why: 'переименовать / собрать поля' },
    { kind: 'telegram', why: 'сразу уведомить' },
    { kind: 'httpRequest', why: 'опросить внешний API' }
  ],
  schedule: [
    { kind: 'httpRequest', why: 'собрать данные' },
    { kind: 'telegram', why: 'отправить отчёт' },
    { kind: 'set', why: 'собрать payload' }
  ],
  form: [
    { kind: 'if', why: 'проверить заявку' },
    { kind: 'telegram', why: 'сообщить о новой заявке' },
    { kind: 'set', why: 'пересобрать поля' }
  ],
  httpRequest: [
    { kind: 'loop', why: 'пройтись по списку из ответа' },
    { kind: 'if', why: 'проверить статус или поле' },
    { kind: 'code', why: 'обработать данные' }
  ],
  if: [
    { kind: 'respond', why: 'ответить по ветке' },
    { kind: 'telegram', why: 'уведомить по ветке' },
    { kind: 'set', why: 'подготовить ответ' }
  ],
  loop: [
    { kind: 'telegram', why: 'сообщение по каждому элементу' },
    { kind: 'httpRequest', why: 'запрос на каждый элемент' },
    { kind: 'code', why: 'набрать значение элемента' }
  ],
  set: [
    { kind: 'if', why: 'проверить условия' },
    { kind: 'httpRequest', why: 'отправить наружу' },
    { kind: 'telegram', why: 'уведомить' }
  ],
  code: [
    { kind: 'if', why: 'проверить результат' },
    { kind: 'respond', why: 'вернуть результат' },
    { kind: 'telegram', why: 'уведомить о результате' }
  ],
  telegram: [
    { kind: 'respond', why: 'завершить с ответом' },
    { kind: 'delay', why: 'пауза перед следующим' }
  ],
  respond: [],
  delay: [
    { kind: 'httpRequest', why: 'запрос после паузы' },
    { kind: 'respond', why: 'ответить' }
  ]
};

export function defaultsFor(kind: NodeKind): Record<string, any> {
  const c: Record<string, any> = {};
  for (const f of NODE_META[kind].fields) if (f.defaultValue !== undefined) c[f.key] = f.defaultValue;
  return c;
}
