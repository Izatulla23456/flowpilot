import { useCallback, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge as RfEdge,
  type EdgeChange,
  type Node as RfNode,
  type NodeChange
} from '@xyflow/react';
import type { FlowEdge, FlowNode, NodeRun } from 'core/types';
import { NODE_META } from '../nodes/registry';
import { useStore } from '../store';
import { NodeCard } from './NodeCard';

const nodeTypes = { fp: NodeCard as any };
const uid = () => Math.random().toString(36).slice(2, 9);

type FpNodeData = { node: FlowNode; lastRun?: NodeRun };
type FpNode = RfNode<FpNodeData, 'fp'>;

export function FlowCanvas() {
  const current = useStore(s => s.current);
  const runs = useStore(s => s.runs);
  const selectedNodeId = useStore(s => s.selectedNodeId);
  const selectNode = useStore(s => s.selectNode);
  const patchCurrent = useStore(s => s.patchCurrent);
  const setRfInstance = useStore(s => s.setRfInstance);

  const runsMap = useMemo(() => {
    const m: Record<string, NodeRun> = {};
    for (const r of runs) m[r.nodeId] = r; // последний запуск ноды
    return m;
  }, [runs]);

  const nodes: FpNode[] = useMemo(
    () =>
      (current?.nodes || []).map(n => ({
        id: n.id,
        type: 'fp' as const,
        position: n.position,
        selected: n.id === selectedNodeId,
        data: { node: n, lastRun: runsMap[n.id] }
      })),
    [current?.nodes, runsMap, selectedNodeId]
  );

  const edges: RfEdge[] = useMemo(
    () =>
      (current?.edges || []).map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        animated: true
      })),
    [current?.edges]
  );

  const syncNodes = useCallback(
    (next: FpNode[]) => {
      patchCurrent({
        nodes: next.map((n): FlowNode => ({
          id: n.id,
          type: n.data.node.type,
          position: { x: n.position.x, y: n.position.y },
          config: n.data.node.config
        }))
      });
    },
    [patchCurrent]
  );

  const syncEdges = useCallback(
    (next: RfEdge[]) => {
      patchCurrent({
        edges: next.map((e): FlowEdge => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle || undefined
        }))
      });
    },
    [patchCurrent]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<RfNode>[]) => {
      syncNodes(applyNodeChanges(changes as NodeChange<FpNode>[], nodes));
    },
    [nodes, syncNodes]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => syncEdges(applyEdgeChanges(changes, edges)),
    [edges, syncEdges]
  );
  const onConnect = useCallback((c: Connection) => {
    const st = useStore.getState();
    const cur = st.current;
    if (!cur) return;
    st.patchCurrent({
      edges: [...cur.edges, { id: uid(), source: c.source, target: c.target, sourceHandle: c.sourceHandle || undefined }]
    });
  }, []);

  if (!current) return null;

  return (
    <ReactFlow
      key={current.id}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_e, n) => selectNode(n.id)}
      onPaneClick={() => selectNode(null)}
      onInit={setRfInstance}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      defaultEdgeOptions={{ animated: true, style: { stroke: '#3b82f6' } }}
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
    </ReactFlow>
  );
}
