// Loop-нода (ForEach): прогон через движок напрямую
import { executeWorkflow } from './core/engine.ts';

const wf = {
  id: 'wf-loop-test',
  name: 'loop-test',
  nodes: [
    { id: 'wh', type: 'webhook', position: { x: 0, y: 0 }, config: {} },
    { id: 'code1', type: 'code', position: { x: 200, y: 0 }, config: { code: 'return { items: [1, 2, 3, 4] };' } },
    { id: 'loop1', type: 'loop', position: { x: 400, y: 0 }, config: { source: '{{items}}', keyName: 'item' } },
    { id: 'resp1', type: 'respond', position: { x: 600, y: 0 }, config: { status: 200, body: '{"last": {{item}}, "total": {{total}}}' } }
  ],
  edges: [
    { id: 'e1', source: 'wh', target: 'code1' },
    { id: 'e2', source: 'code1', target: 'loop1' },
    { id: 'e3', source: 'loop1', target: 'resp1' }
  ]
};

const res = await executeWorkflow(wf, { trigger: 'manual', initialData: { subject: 'loop' } });
const respRuns = res.runs.filter(r => r.nodeId === 'resp1');
const ok = res.status === 'success' && respRuns.length === 4 && JSON.stringify(res.output) === '{"last":1,"total":4}';
console.log('status:', res.status, '| iterations:', respRuns.length, '| output:', JSON.stringify(res.output));
console.log(ok ? 'LOOP_OK' : 'LOOP_FAIL');
process.exit(ok ? 0 : 1);
