const base = 'http://127.0.0.1:8787';

const wf = {
  name: 'Срочный или нет',
  nodes: [
    { id: 'wh', type: 'webhook', position: { x: 40, y: 160 }, config: { note: 'Присылай { "subject": "..." }' } },
    { id: 'if', type: 'if', position: { x: 340, y: 160 }, config: { left: '{{body.subject}}', operator: 'contains', right: 'Срочно' } },
    { id: 'hot', type: 'respond', position: { x: 640, y: 60 }, config: { body: '{ "priority": "высокий", "msg": "🔥 СРОЧНО — берём в работу первым" }' } },
    { id: 'cold', type: 'respond', position: { x: 640, y: 320 }, config: { body: '{ "priority": "обычный", "msg": "😌 Не срочно — в очередь" }' }
  ],
  edges: [
    { id: 'e1', source: 'wh', target: 'if' },
    { id: 'e2', source: 'if', target: 'hot', sourceHandle: 'true' },
    { id: 'e3', source: 'if', target: 'cold', sourceHandle: 'false' }
  ]
};

const created = await (await fetch(base + '/api/workflows', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(wf)
})).json();
console.log('СОЗДАН:', created.id, created.name);

const post = (subject) =>
  fetch(base + '/api/webhook/' + created.id, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject })
  }).then(r => r.json());

console.log('Тест 1:', JSON.stringify(await post('Срочно! Сервер лежит')));
console.log('Тест 2:', JSON.stringify(await post('Купить молоко')));
setTimeout(() => process.exit(0), 200);
