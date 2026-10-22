import type { Workflow } from './types';

function wf(name: string, nodes: any[], edges: any[]): Workflow {
  const now = Date.now();
  return { id: 'tpl-' + name, name, nodes, edges, createdAt: now, updatedAt: now };
}

export const TEMPLATES: Array<{ name: string; description: string; build: () => Workflow }> = [
  {
    name: 'Webhook → трансформация → ответ',
    description: 'Принимает POST, обрабатывает данные в коде и возвращает JSON. Отличное начало.',
    build: () =>
      wf('Echo & transform', [
        { id: 'wh', type: 'webhook', position: { x: 40, y: 160 }, config: { note: 'Ждёт POST /api/webhook/<id>' } },
        { id: 'code', type: 'code', position: { x: 340, y: 160 }, config: { code: 'return { received: data.body, at: new Date().toISOString() };' } },
        { id: 'resp', type: 'respond', position: { x: 640, y: 160 }, config: { body: '' } }
      ], [
        { id: 'e1', source: 'wh', target: 'code' },
        { id: 'e2', source: 'code', target: 'resp' }
      ])
  },
  {
    name: 'Cron: отчёт по заказам',
    description: 'Каждые 5 минут берёт демо-заказы, считает сумму и возвращает сводку.',
    build: () =>
      wf('Cron order report', [
        { id: 'sch', type: 'schedule', position: { x: 40, y: 160 }, config: { everyMinutes: 5 } },
        { id: 'http', type: 'httpRequest', position: { x: 340, y: 160 }, config: { method: 'GET', url: '/api/mock/orders', headersJson: '', body: '' } },
        {
          id: 'code', type: 'code', position: { x: 640, y: 160 },
          config: { code: 'const orders = data.body || [];\nreturn { count: orders.length, total: orders.reduce((s, o) => s + (o.amount || 0), 0), top: orders[0] || null };' }
        },
        { id: 'resp', type: 'respond', position: { x: 940, y: 160 }, config: { body: '' } }
      ], [
        { id: 'e1', source: 'sch', target: 'http' },
        { id: 'e2', source: 'http', target: 'code' },
        { id: 'e3', source: 'code', target: 'resp' }
      ])
  },
  {
    name: 'Воронка: счёт → Telegram',
    description: 'Webhook с письмом: если в теме слово «Счёт» — «отправить» в Telegram (демо-нода), иначе пропустить.',
    build: () =>
      wf('Invoice → Telegram', [
        { id: 'wh', type: 'webhook', position: { x: 40, y: 160 }, config: { note: 'POST: { "subject": "Счёт №123", "amount": 15000 }' } },
        { id: 'if', type: 'if', position: { x: 340, y: 160 }, config: { left: '{{body.subject}}', operator: 'contains', right: 'Счёт' } },
        {
          id: 'tg', type: 'httpRequest', position: { x: 640, y: 60 },
          config: {
            method: 'POST', url: '/api/mock/notify', headersJson: '{ "Content-Type": "application/json" }',
            body: '{ "channel": "telegram", "text": "Пришёл счёт: {{body.subject}} на {{body.amount}} ₽" }'
          }
        },
        { id: 'ok', type: 'respond', position: { x: 940, y: 60 }, config: { body: '{ "handled": true }' } },
        { id: 'skip', type: 'respond', position: { x: 640, y: 320 }, config: { body: '{ "handled": false }' } }
      ], [
        { id: 'e1', source: 'wh', target: 'if' },
        { id: 'e2', source: 'if', target: 'tg', sourceHandle: 'true' },
        { id: 'e3', source: 'if', target: 'skip', sourceHandle: 'false' },
        { id: 'e4', source: 'tg', target: 'ok' }
      ])
  },
  {
    name: 'HTTP-проверка по URL из запроса',
    description: 'Принимает { "url": "..." }, проверяет, жив ли сайт, отвечает статусом.',
    build: () =>
      wf('URL checker', [
        { id: 'wh', type: 'webhook', position: { x: 40, y: 160 }, config: { note: 'POST: { "url": "https://example.com" }' } },
        { id: 'http', type: 'httpRequest', position: { x: 340, y: 160 }, config: { method: 'GET', url: '{{body.url}}', headersJson: '', body: '' } },
        { id: 'if', type: 'if', position: { x: 640, y: 160 }, config: { left: '{{status}}', operator: 'equals', right: '200' } },
        { id: 'ok', type: 'respond', position: { x: 940, y: 60 }, config: { body: '{ "up": true, "status": {{status}}, "ms": {{durationMs}} }' } },
        { id: 'down', type: 'respond', position: { x: 940, y: 320 }, config: { body: '{ "up": false, "status": {{status}} }' } }
      ], [
        { id: 'e1', source: 'wh', target: 'http' },
        { id: 'e2', source: 'http', target: 'if' },
        { id: 'e3', source: 'if', target: 'ok', sourceHandle: 'true' },
        { id: 'e4', source: 'if', target: 'down', sourceHandle: 'false' }
      ])
  }
];
