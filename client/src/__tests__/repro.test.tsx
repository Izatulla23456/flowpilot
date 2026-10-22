// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';
import { FlowCanvas } from '../components/FlowCanvas';
import { useStore } from '../store';

beforeAll(() => {
  (globalThis as any).ResizeObserver =
    (globalThis as any).ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('') })));
  window.confirm = () => true;
});

afterEach(() => cleanup());

const emptyWf = (id: string) => ({ id, name: 't', createdAt: 1, updatedAt: 2, nodes: [] as any[], edges: [] as any[] });

describe('репродукция: клики по сайдбару', () => {
  it('добавляем 3 ноды через реальный addNode — должны отрисоваться', () => {
    const wf = emptyWf('r1');
    useStore.setState({ current: wf, workflows: [wf], selectedNodeId: null, runs: [], rfInstance: null });
    render(<FlowCanvas />);

    expect(document.querySelectorAll('.react-flow__node').length).toBe(0);

    act(() => {
      useStore.getState().addNode('webhook');
    });
    act(() => {
      useStore.getState().addNode('if');
    });
    act(() => {
      useStore.getState().addNode('respond');
    });

    const els = document.querySelectorAll('.react-flow__node');
    const storeNodes = useStore.getState().current?.nodes.length;
    console.log('DOM_NODES =', els.length, 'STORE_NODES =', storeNodes);
    console.log('IDS =', Array.from(els).map(e => e.getAttribute('data-id')).join(','));
    expect(els.length).toBe(3);
  });
});
