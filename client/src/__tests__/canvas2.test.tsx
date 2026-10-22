// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';
import { FlowCanvas } from '../components/FlowCanvas';
import { useStore } from '../store';
import type { Workflow } from 'core/types';

beforeAll(() => {
  (globalThis as any).ResizeObserver =
    (globalThis as any).ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('') })));
});

afterEach(() => cleanup());

const emptyWf = (id: string) => ({ id, name: 't', createdAt: 1, updatedAt: 2, nodes: [] as any[], edges: [] as any[] });

describe('синхронизация канва ↔ store', () => {
  it('addNode попадает в DOM и сохраняется в store', async () => {
    const wf = emptyWf('s1');
    useStore.setState({
      current: wf,
      workflows: [wf],
      selectedNodeId: null,
      runs: [],
      rfInstance: null,
      addRfNodeFn: null
    });
    render(<FlowCanvas />);

    act(() => {
      useStore.getState().addNode('webhook');
    });
    await act(async () => {
      await new Promise(r => setTimeout(r, 20));
    });

    const els = document.querySelectorAll('.react-flow__node');
    const storeNodes = useStore.getState().current?.nodes;
    console.log('DOM =', els.length, 'STORE =', storeNodes?.length, 'IDS =', storeNodes?.map((n: any) => n.id).join(','));
    expect(els.length).toBe(1);
    expect(storeNodes?.length).toBe(1);
    expect(storeNodes?.[0]?.type).toBe('webhook');
  });

  it('переключение воркфлоу подгружает его ноды в канву', async () => {
    const wfA = emptyWf('a');
    const wfB: Workflow = {
      id: 'b',
      name: 'b',
      createdAt: 1,
      updatedAt: 2,
      nodes: [
        { id: 'n1', type: 'webhook', position: { x: 100, y: 100 }, config: {} },
        { id: 'n2', type: 'respond', position: { x: 400, y: 100 }, config: {} }
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }]
    };
    useStore.setState({
      current: wfA,
      workflows: [wfA, wfB],
      selectedNodeId: null,
      runs: [],
      rfInstance: null,
      addRfNodeFn: null
    });
    render(<FlowCanvas />);
    expect(document.querySelectorAll('.react-flow__node').length).toBe(0);

    act(() => {
      useStore.getState().setCurrent(wfB);
    });
    await act(async () => {
      await new Promise(r => setTimeout(r, 30));
    });

    const els = document.querySelectorAll('.react-flow__node');
    console.log('AFTER_SWITCH DOM =', els.length, 'IDS =', Array.from(els).map(e => e.getAttribute('data-id')).join(','));
    expect(els.length).toBe(2);
  });
});
