"use client";

import { useCallback, useState, useTransition } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Save, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { saveFlowGraph } from "../actions";

/**
 * Phase 4.1 — 빈 캔버스 셸.
 * Phase 4.2에서 커스텀 노드 타입 (메시지/조건/LLM/번역/사람연결/대기) 추가.
 */
export function FlowCanvas({
  flowId,
  initialNodes,
  initialEdges,
}: {
  flowId: string;
  initialNodes: Node[];
  initialEdges: Edge[];
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [pending, startTransition] = useTransition();
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [dirty, setDirty] = useState(false);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
      setDirty(true);
    },
    [setEdges]
  );

  function addDefaultNode() {
    const id = `node-${Date.now()}`;
    const center = rfInstance?.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }) ?? { x: 200, y: 200 };

    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "default",
        position: { x: center.x, y: center.y },
        data: { label: "새 노드" },
      },
    ]);
    setDirty(true);
  }

  function save() {
    startTransition(async () => {
      const res = await saveFlowGraph(flowId, { nodes, edges });
      if (res.ok) {
        setDirty(false);
        toast.success("저장 완료");
      } else {
        toast.error(`저장 실패: ${res.error}`);
      }
    });
  }

  return (
    <div className="relative h-full w-full">
      {/* 툴바 */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-lg border bg-background/95 p-1.5 shadow-sm backdrop-blur">
        <Button variant="ghost" size="sm" onClick={addDefaultNode}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          노드 추가
        </Button>
        <div className="h-5 w-px bg-border" />
        {dirty && (
          <Badge variant="outline" className="text-[10px] text-amber-600">
            저장 안됨
          </Badge>
        )}
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          저장
        </Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(c) => {
          onNodesChange(c);
          setDirty(true);
        }}
        onEdgesChange={(c) => {
          onEdgesChange(c);
          setDirty(true);
        }}
        onConnect={onConnect}
        onInit={setRfInstance}
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-muted/20"
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap
          pannable
          zoomable
          className="!bg-background !border"
        />
      </ReactFlow>
    </div>
  );
}
