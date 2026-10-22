const base = 'http://127.0.0.1:8787';

const ws = await (await fetch(base + '/api/workflows')).json();
const wh = ws.find(w => /демо|Invoice/i.test(w.name) && w.nodes.some(n => n.type === 'webhook'));
if (!wh) { console.error('demo workflow not found, have:', ws.map(w => w.name).join(' | ')); process.exit(1); }
console.log('WF:', wh.id, wh.name);

const post = (body) =>
  fetch(base + '/api/webhook/' + wh.id, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json());

const r1 = await post({ subject: 'Счёт №123 за облако', amount: 15000 });
console.log('INVOICE   :', JSON.stringify(r1));
const r2 = await post({ subject: 'Привет', amount: 100 });
console.log('NOINVOICE :', JSON.stringify(r2));

const ok = r1.output && r1.output.handled === true && r2.output && r2.output.handled === false;
console.log(ok ? 'SMOKE_OK' : 'SMOKE_FAIL');
setTimeout(() => process.exit(ok ? 0 : 1), 200);
