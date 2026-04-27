"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
  type OnSelectionChangeParams,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Save,
  Loader2,
  Plus,
  Trash2,
  Play,
  MessageSquare,
  GitBranch,
  Sparkles,
  Languages,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { saveFlowGraph } from "../actions";
import { nodeTypes } from "./nodes";
import {
  defaultData,
  NODE_META,
  type AnyNodeData,
  type NodeKind,
} from "./node-types";
import {
  StartEditor,
  MessageEditor,
  ConditionEditor,
  LLMEditor,
  TranslateEditor,
  EscalateEditor,
} from "./editors";

const KIND_ICON = {
  start: Play,
  message: MessageSquare,
  condition: GitBranch,
  llm: Sparkles,
  translate: Languages,
  escalate: UserCheck,
} as const;

const ADDABLE_KINDS: NodeKind[] = [
  "message",
  "condition",
  "llm",
  "translate",
  "escalate",
];

type FlowNode = Node<AnyNodeData>;

export function FlowCanvas({
  flowId,
  initialNodes,
  initialEdges,
  managers,
}: {
  flowId: string;
  initialNodes: FlowNode[];
  initialEdges: Edge[];
  managers: { id: string; name: string; email: string }[];
}) {
  // ── 시작 노드가 없으면 자동 생성 ──────────────
  const seeded = (() => {
    if (initialNodes.length > 0) return initialNodes;
    return [
      {
        id: "start",
        type: "start",
        position: { x: 250, y: 80 },
        data: defaultData("start"),
        deletable: false,
      } as FlowNode,
    ];
  })();

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(seeded);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [pending, startTransition] = useTransition();
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds
        )
      );
      setDirty(true);
    },
    [setEdges]
  );

  const onSelectionChange = useCallback(
    ({ nodes: selNodes }: OnSelectionChangeParams) => {
      setSelectedNodeId(selNodes[0]?.id ?? null);
    },
    []
  );

  // 키보드 단축키: Esc로 패널 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedNodeId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function addNode(kind: NodeKind) {
    const id = `${kind}-${Date.now()}`;
    const center = rfInstance?.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2 + 50,
    }) ?? { x: 200, y: 200 };

    setNodes((nds) => [
      ...nds,
      {
        id,
        type: kind,
        position: { x: center.x + Math.random() * 60, y: center.y + Math.random() * 60 },
        data: defaultData(kind),
      } as FlowNode,
    ]);
    setSelectedNodeId(id);
    setDirty(true);
  }

  function updateNodeData(nodeId: string, patch: AnyNodeData) {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: patch } : n))
    );
    setDirty(true);
  }

  function deleteNode(nodeId: string) {
    if (nodeId === "start") {
      toast.error("시작 노드는 삭제할 수 없습니다.");
      return;
    }
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) =>
      eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
    );
    setSelectedNodeId(null);
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

  // 윈도우 닫기 / 라우팅 시 dirty 경고
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <div className="relative h-full w-full">
      {/* 툴바 */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-lg border bg-background/95 p-1.5 shadow-sm backdrop-blur">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              노드 추가
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {ADDABLE_KINDS.map((k) => {
              const meta = NODE_META[k];
              const Icon = KIND_ICON[k];
              return (
                <DropdownMenuItem
                  key={k}
                  onClick={() => addNode(k)}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {meta.description}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-5 w-px bg-border" />

        {dirty ? (
          <Badge variant="outline" className="text-[10px] text-amber-600">
            저장 안됨
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-emerald-600">
            저장됨
          </Badge>
        )}

        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          {pending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          저장
        </Button>
      </div>

      {/* 캔버스 */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(c) => {
          onNodesChange(c);
          // dimensions(자동 측정) / select(클릭 선택)는 dirty가 아님 — 사용자 의도적 변경만 dirty
          const meaningful = c.some(
            (ch) => ch.type !== "dimensions" && ch.type !== "select"
          );
          if (meaningful) setDirty(true);
        }}
        onEdgesChange={(c) => {
          onEdgesChange(c);
          const meaningful = c.some((ch) => ch.type !== "select");
          if (meaningful) setDirty(true);
        }}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onInit={setRfInstance}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-muted/20"
        defaultEdgeOptions={{
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap pannable zoomable className="!border" />
      </ReactFlow>

      {/* 프로퍼티 패널 */}
      <Sheet
        open={selectedNode !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedNodeId(null);
        }}
      >
        <SheetContent className="w-[420px] overflow-y-auto sm:max-w-[420px]">
          {selectedNode && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = KIND_ICON[selectedNode.data.kind];
                    return <Icon className="h-4 w-4" />;
                  })()}
                  {NODE_META[selectedNode.data.kind].label} 노드
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {NODE_META[selectedNode.data.kind].description}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6">
                <NodeEditor
                  nodeId={selectedNode.id}
                  data={selectedNode.data}
                  onChange={(patch) => updateNodeData(selectedNode.id, patch)}
                  managers={managers}
                />
              </div>

              {selectedNode.id !== "start" && (
                <div className="mt-6 border-t pt-4">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteNode(selectedNode.id)}
                    className="w-full"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    노드 삭제
                  </Button>
                </div>
              )}

              <div className="mt-4 rounded-md bg-muted/40 p-2.5 text-[10px] text-muted-foreground">
                <p>
                  <strong>ID:</strong>{" "}
                  <code className="font-mono">{selectedNode.id}</code>
                </p>
                <p className="mt-0.5">
                  변경사항은 자동으로 캔버스에 반영되며, 상단 "저장" 버튼으로
                  영구 저장됩니다.
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── 노드 타입별 에디터 디스패치 ──────────────────
function NodeEditor({
  nodeId,
  data,
  onChange,
  managers,
}: {
  nodeId: string;
  data: AnyNodeData;
  onChange: (next: AnyNodeData) => void;
  managers: { id: string; name: string; email: string }[];
}) {
  switch (data.kind) {
    case "start":
      return <StartEditor data={data} onChange={onChange} />;
    case "message":
      return <MessageEditor data={data} onChange={onChange} />;
    case "condition":
      return <ConditionEditor data={data} onChange={onChange} />;
    case "llm":
      return <LLMEditor data={data} onChange={onChange} />;
    case "translate":
      return <TranslateEditor data={data} onChange={onChange} />;
    case "escalate":
      return (
        <EscalateEditor data={data} onChange={onChange} managers={managers} />
      );
  }
}
