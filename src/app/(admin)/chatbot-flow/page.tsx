import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Bot, Workflow, Pencil, Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../_components/page-header";
import { FlowForm } from "./flow-form";

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

export default async function ChatbotFlowPage() {
  const flows = await prisma.chatbotFlow.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return (
    <div>
      <PageHeader
        title="챗봇 플로우"
        description={`노드 기반 자동 응답 시나리오 · 전체 ${flows.length}개`}
        breadcrumbs={[
          { label: "홈", href: "/dashboard" },
          { label: "챗봇 플로우" },
        ]}
        actions={<FlowForm />}
      />

      {flows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {flows.map((f) => {
            const status = STATUS_BADGE[f.status] ?? STATUS_BADGE.DRAFT;
            const nodeCount = (() => {
              try {
                return (JSON.parse(f.nodesData) as unknown[]).length;
              } catch {
                return 0;
              }
            })();

            return (
              <Card key={f.id} className="transition-colors hover:bg-muted/30">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{f.name}</h3>
                      {f.description && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {f.description}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Workflow className="h-3 w-3" />
                      {nodeCount}개 노드
                    </span>
                    <span>
                      {format(f.updatedAt, "yyyy.MM.dd HH:mm", { locale: ko })}
                    </span>
                  </div>

                  <div className="mt-3">
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <Link href={`/chatbot-flow/${f.id}`}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        편집
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Bot className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="font-medium">아직 플로우가 없습니다</p>
          <p className="mt-1 text-xs text-muted-foreground">
            상단 우측의 "플로우 추가" 버튼으로 첫 번째 챗봇 시나리오를 만들어보세요.
          </p>
        </div>
        <div className="mt-2 grid gap-2 text-left text-xs text-muted-foreground sm:grid-cols-3">
          <Hint icon={<Workflow className="h-3.5 w-3.5" />} title="비주얼 빌더">
            드래그&드롭 노드 에디터로 흐름 설계
          </Hint>
          <Hint icon={<Zap className="h-3.5 w-3.5" />} title="LLM 노드">
            Claude/GPT 호출로 FAQ 자동응답
          </Hint>
          <Hint icon={<Bot className="h-3.5 w-3.5" />} title="조건/분기">
            언어/상태별 분기, 사람 매니저 에스컬레이션
          </Hint>
        </div>
      </CardContent>
    </Card>
  );
}

function Hint({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center gap-1.5 font-medium">
        {icon}
        {title}
      </div>
      <p className="mt-1 text-[11px]">{children}</p>
    </div>
  );
}
