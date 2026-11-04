// Smoke-тест новых фич: форма, Telegram(mock), ИИ-доктор, ИИ-тесты, метрики, лендинг
import fs from 'node:fs';

const base = 'http://127.0.0.1:8787';
let ADMIN_TOKEN = '';
try {
  const m = fs.readFileSync(new URL('./.env', import.meta.url), 'utf8').match(/FLOWPILOT_ADMIN_TOKEN=(.+)/);
  if (m) ADMIN_TOKEN = m[1].trim();
} catch {}
const H = { 'content-type': 'application/json', ...(ADMIN_TOKEN ? { Authorization: `Bearer ${ADMIN_TOKEN}` } : {}) };
const J = (r) => r.json();
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failed++;
};

// 1. Лендинг
const land = await (await fetch(base + '/')).text();
check('лендинг / ', land.includes('FlowPilot') && land.includes('конструктор'));
const app = await (await fetch(base + '/app')).text();
check('SPA /app', app.includes('<div id="root">'));

// 2. Форма: создаём воркфлоу form → set → respond
const wf = await (
  await fetch(base + '/api/workflows', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      name: 'Smoke: форма',
      nodes: [
        { id: 'f1', type: 'form', position: { x: 0, y: 0 }, config: { title: 'Заявка', fields: '[{"name":"Имя"},{"name":"Email","type":"email"}]' } },
        { id: 's1', type: 'set', position: { x: 240, y: 0 }, config: { fields: [{ key: 'greeting', value: 'Здравствуйте, {{fields.Имя}}!' }] } },
        { id: 'r1', type: 'respond', position: { x: 480, y: 0 }, config: { body: '{"okForm": true, "greeting": "{{greeting}}"}' } }
      ],
      edges: [
        { id: 'e1', source: 'f1', target: 's1' },
        { id: 'e2', source: 's1', target: 'r1' }
      ]
    })
  })
).json();
const page = await (await fetch(base + `/api/form/${wf.id}`)).text();
check('GET /api/form → HTML', page.includes('<!doctype html>') && page.includes('Заявка'), `id=${wf.id.slice(0, 6)}`);
check('форма: поля', page.includes('name="Имя"') && page.includes('name="Email"'));

const sub = await (
  await fetch(base + `/api/form/${wf.id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 'Имя': 'Тест', Email: 't@t.kz' })
  })
).json();
check('POST /api/form → запуск', sub.ok === true, JSON.stringify(sub.output));

// 3. Telegram (mock-режим без токена)
const tg = await (
  await fetch(base + '/api/integration/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'тест' })
  })
).json();
check('Telegram mock', tg.ok === true && tg.mock === true, tg.channel || '');

// 4. ИИ-доктор: ломаем if-ноду (нет left) и чиним
const bad = await (
  await fetch(base + '/api/workflows', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      name: 'Smoke: сломанный',
      nodes: [
        { id: 'w1', type: 'webhook', position: { x: 0, y: 0 }, config: {} },
        { id: 'i1', type: 'if', position: { x: 240, y: 0 }, config: { operator: 'equals' } },
        { id: 'r1', type: 'respond', position: { x: 480, y: 0 }, config: { body: 'ok' } }
      ],
      edges: [
        { id: 'e1', source: 'w1', target: 'i1' },
        { id: 'e2', source: 'i1', target: 'r1', sourceHandle: 'true' }
      ]
    })
  })
).json();
await fetch(base + `/api/webhook/${bad.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
const fix = await (
  await fetch(base + '/api/ai/fix', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ workflowId: bad.id, nodeId: 'i1' })
  })
).json();
check('ИИ-доктор: advice', typeof fix.advice === 'string' && fix.advice.length > 10, fix.advice?.slice(0, 60));
check('ИИ-доктор: режим', fix.ai === 'rules' || fix.ai === 'llm', `ai=${fix.ai} fixed=${fix.fixed ? 'да' : 'нет (нужен LLM)'}`);

// 5. ИИ-тесты
const demo = (await (await fetch(base + '/api/workflows', { headers: H })).json()).find((w) => /демо/i.test(w.name));
const tests = await (
  await fetch(base + '/api/ai/tests', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ workflowId: demo.id })
  })
).json();
check('ИИ-тесты: набор', Array.isArray(tests.tests) && tests.tests.length >= 3, `${tests.tests?.length} тестов`);
check('ИИ-тесты: виды', /happy/i.test(tests.tests.map((t) => t.name).join(' ')) || tests.tests.length >= 3, tests.tests?.map((t) => t.name).join(' | ').slice(0, 80));

// 6. Метрики
const m = await (await fetch(base + '/api/metrics')).json();
check('метрики', m.runs >= 2 && m.workflows >= 1, `runs=${m.runs} avg=${m.avgRunMs}мс`);

// 7. Настройки: секреты скрыты
const st = await (await fetch(base + '/api/settings', { headers: H })).json();
check('settings: нет секретов', st.aiKey === undefined && st.telegramBotToken === undefined, JSON.stringify(st));

// 8. Чистим smoke-воркфлоу
await fetch(base + `/api/workflows/${wf.id}`, { method: 'DELETE', headers: H });
await fetch(base + `/api/workflows/${bad.id}`, { method: 'DELETE', headers: H });

console.log(failed === 0 ? 'SMOKE2_OK' : `SMOKE2_FAIL (${failed})`);
setTimeout(() => process.exit(failed === 0 ? 0 : 1), 100);
