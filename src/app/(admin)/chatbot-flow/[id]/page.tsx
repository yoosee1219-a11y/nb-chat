import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlowCanvas } from "./canvas";
import type { Edge, Node } from "@xyflow/react";
import type { AnyNodeData } from "./node-types";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "초안", className: "bg-amber-100 text-amber-700 border-amber-200" },
  PUBLISHED: {
    label: "운영 중",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  ARCHIVED: {
    label: "보관됨",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
};

export default async function FlowEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const flow = await prisma.chatbotFlow.findUnique({ where: { id } });
  if (!flow) notFound();

  const nodes = JSON.parse(flow.nodesData) as Node<AnyNodeData>[];
  const edges = JSON.parse(flow.edgesData) as Edge[];
  const status = STATUS_BADGE[flow.status] ?? STATUS_BADGE.DRAFT;

  // EscalateNode에서 매니저 선택용
  const managers = await prisma.manager.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col">
      {/* 헤더 */}
      <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-2.5">
        <Button variant="ghost" size="icon" asChild title="목록으로">
          <Link href="/chatbot-flow">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{flow.name}</h2>
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
          </div>
          {flow.description && (
            <p className="truncate text-[11px] text-muted-foreground">
              {flow.description}
            </p>
          )}
        </div>
      </header>

      {/* 캔버스 */}
      <div className="min-h-0 flex-1">
        <FlowCanvas
          flowId={flow.id}
          initialNodes={nodes}
          initialEdges={edges}
          managers={managers}
        />
      </div>
    </div>
  );
}
