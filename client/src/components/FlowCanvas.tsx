import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge as RfEdge,
  type EdgeChange,
  type Node as RfNode,
  type NodeChange
} from '@xyflow/react';
import type { FlowEdge, FlowNode, NodeRun, Workflow } from 'core/types';
import { NODE_META } from '../nodes/registry';
import { useStore } from '../store';
import { NodeCard } from './NodeCard';

const nodeTypes = { fp: NodeCard as any };
const uid = () => Math.random().toString(36).slice(2, 9);

type FpNode = RfNode<{ node: FlowNode; lastRun?: NodeRun }, 'fp'>;

function edgeLabel(sourceId: string, sourceHandle: string | undefined, nodes: FlowNode[]): string | undefined {
  const src = nodes.find(n => n.id === sourceId);
  if (src?.type !== 'if') return undefined;
  return sourceHandle === 'true' ? 'да' : sourceHandle === 'false' ? 'нет' : undefined;
}

function cleanFromRf(nodes: FpNode[], edges: RfEdge[]) {
  return {
    nodes: nodes.map((n): FlowNode => ({
      id: n.id,
      type: n.data.node.type,
      position: { x: n.position.x, y: n.position.y },
      config: n.data.node.config
    })),
    edges: edges.map((e): FlowEdge => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined
    }))
  };
}

function cleanFromStore(cur: Workflow) {
  return {
    nodes: cur.nodes.map(n => ({ id: n.id, type: n.type, position: n.position, config: n.config })),
    edges: cur.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined
    }))
  };
}

export function FlowCanvas() {
  const current = useStore(s => s.current);
  const runs = useStore(s => s.runs);
  const selectedNodeId = useStore(s => s.selectedNodeId);
  const selectNode = useStore(s => s.selectNode);
  const patchCurrent = useStore(s => s.patchCurrent);
  const setRfInstance = useStore(s => s.setRfInstance);

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<FpNode>([]);
  const [rfEdges, setRfEdges, onRfEdgesChange] = useEdgesState<RfEdge>([]);
  const loadedId = useRef<string | null>(null);

  const runsMap = useMemo(() => {
    const m: Record<string, NodeRun> = {};
    for (const r of runs) m[r.nodeId] = r;
    return m;
  }, [runs]);

  // Загрузка воркфлоу в React Flow (по смене id)
  useEffect(() => {
    if (current) {
      const nodes: FpNode[] = current.nodes.map(n => ({
        id: n.id,
        type: 'fp' as const,
        position: n.position,
        data: { node: n, lastRun: undefined }
      }));
      const edges: RfEdge[] = current.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        label: edgeLabel(e.source, e.sourceHandle || undefined, current.nodes),
        animated: true
      }));
      setRfNodes(nodes);
      setRfEdges(edges);
      loadedId.current = current.id;
      const t = setTimeout(() => useStore.getState().rfInstance?.fitView({ padding: 0.25 }), 60);
      return () => clearTimeout(t);
    } else {
      setRfNodes([]);
      setRfEdges([]);
      loadedId.current = null;
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Подсветка статусов по результатам выполнения (без потери внутренних полей RF)
  useEffect(() => {
    setRfNodes(prev => prev.map(n => ({ ...n, data: { ...n.data, lastRun: runsMap[n.id] } })));
  }, [runsMap, setRfNodes]);

  // Регистрируем функции добавления ноды/рёбра для сайдбара и подсказок
  useEffect(() => {
    const st = useStore.getState();
    st.setAddRfNodeFn(rfNode => setRfNodes(prev => [...prev, rfNode]));
    st.setAddRfEdgeFn(rfEdge => setRfEdges(prev => [...prev, rfEdge]));
    return () => {
      useStore.getState().setAddRfNodeFn(null);
      useStore.getState().setAddRfEdgeFn(null);
    };
  }, [setRfNodes, setRfEdges]);

  // Персист: RF-состояние → store (только если реально изменилось)
  useEffect(() => {
    const cur = useStore.getState().current;
    if (!cur || loadedId.current !== cur.id) return;
    if (JSON.stringify(cleanFromRf(rfNodes, rfEdges)) !== JSON.stringify(cleanFromStore(cur))) {
      patchCurrent(cleanFromRf(rfNodes, rfEdges));
    }
  }, [rfNodes, rfEdges, patchCurrent]);

  const onNodesChange = useCallback(
    (changes: NodeChange<RfNode>[]) => {
      if (changes.some(c => c.type === 'remove')) useStore.getState().snapshot();
      onRfNodesChange(changes as NodeChange<FpNode>[]);
    },
    [onRfNodesChange]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.some(c => c.type === 'remove')) useStore.getState().snapshot();
      onRfEdgesChange(changes);
    },
    [onRfEdgesChange]
  );

  const onConnect = useCallback(
    (c: Connection) => {
      useStore.getState().snapshot();
      const edge: RfEdge = {
        id: uid(),
        source: c.source,
        target: c.target,
        sourceHandle: c.sourceHandle || undefined,
        label: edgeLabel(c.source, c.sourceHandle || undefined, useStore.getState().current?.nodes || []),
        animated: true
      };
      setRfEdges(prev => [...prev, edge]);
    },
    [setRfEdges]
  );

  if (!current) return null;

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_e, n) => selectNode(n.id)}
      onPaneClick={() => selectNode(null)}
      onInit={setRfInstance}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      defaultEdgeOptions={{
        animated: true,
        style: { stroke: '#3b82f6' },
        labelStyle: { fill: '#cbd5e1', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: '#0f172a' },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="#182338" />
      <Controls position="bottom-left" showInteractive={false} />
      <MiniMap
        position="bottom-right"
        pannable
        zoomable
        nodeColor={(n: any) => NODE_META[n?.data?.node?.type as keyof typeof NODE_META]?.color || '#24334f'}
        maskColor="rgba(7,11,18,0.75)"
      />
      {current.nodes.length === 0 && rfNodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <div className="rounded-xl border border-dashed border-ink-500 bg-ink-900/80 px-6 py-4 text-center text-sm text-slate-400">
            Здесь пусто. Кликни по нодам в левом списке — они появятся здесь.
            <br />
            <span className="text-xs text-slate-600">Начни с ⚡ Webhook, потом 🔀 IF и 📤 Ответ</span>
          </div>
        </div>
      )}
    </ReactFlow>
  );
}
