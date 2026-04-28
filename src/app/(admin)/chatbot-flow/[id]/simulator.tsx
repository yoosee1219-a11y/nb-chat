"use client";

import { useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { Play, Loader2, RefreshCw, Bot, User } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  LANGUAGE,
  CONSULTATION_STATUS,
  NATIONALITY,
} from "@/lib/constants";
import {
  type ApplicantContext,
  type FlowExecutionResult,
} from "@/lib/flow-runtime";
import { simulateFlow } from "../actions";
import type { AnyNodeData } from "./node-types";

const TERMINATION_LABEL: Record<
  FlowExecutionResult["terminatedBy"],
  { label: string; tone: string }
> = {
  completed: { label: "완료", tone: "bg-emerald-100 text-emerald-700" },
  escalated: {
    label: "사람 인계",
    tone: "bg-rose-100 text-rose-700",
  },
  trigger_mismatched: {
    label: "트리거 불일치",
    tone: "bg-gray-100 text-gray-600",
  },
  dead_end: {
    label: "다음 노드 없음",
    tone: "bg-amber-100 text-amber-700",
  },
  max_steps_exceeded: {
    label: "단계 초과",
    tone: "bg-red-100 text-red-700",
  },
  unknown_node: {
    label: "알 수 없는 노드",
    tone: "bg-red-100 text-red-700",
  },
  error: { label: "에러", tone: "bg-red-100 text-red-700" },
};

export function FlowSimulator({
  open,
  onOpenChange,
  nodes,
  edges,
  onTraceChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: Node<AnyNodeData>[];
  edges: Edge[];
  /** 캔버스에 실행 노드 하이라이트하기 위한 콜백 (실행된 nodeId 배열) */
  onTraceChange?: (nodeIds: string[]) => void;
}) {
  const [ctx, setCtx] = useState<ApplicantContext>({
    name: "테스트 신청자",
    language: "VI_VN",
    nationality: "VN",
    status: "PENDING",
    message: "안녕하세요, 유심 가입하고 싶어요",
  });

  const [result, setResult] = useState<FlowExecutionResult | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const r = await simulateFlow({ nodes, edges }, ctx);
      setResult(r);
      onTraceChange?.(r.steps.map((s) => s.nodeId));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setResult({
        ok: false,
        steps: [],
        terminatedBy: "error",
        error: message,
        emittedMessages: [],
      });
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setResult(null);
    onTraceChange?.([]);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] overflow-y-auto sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Play className="h-4 w-4 text-emerald-600" />
            플로우 시뮬레이터
          </SheetTitle>
          <SheetDescription className="text-xs">
            가상 신청자를 설정하고 메시지를 입력해 챗봇 응답을 미리 확인.
            저장된 그래프가 아닌 현재 캔버스 상태로 실행됩니다.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* 가상 신청자 */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
              <User className="h-3.5 w-3.5" />
              가상 신청자
            </p>
            <div className="grid gap-2 grid-cols-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-[10px]">이름</Label>
                <Input
                  value={ctx.name}
                  onChange={(e) => setCtx({ ...ctx, name: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">모국어</Label>
                <Select
                  value={ctx.language}
                  onValueChange={(v) => setCtx({ ...ctx, language: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <span>{LANGUAGE[ctx.language]?.label}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LANGUAGE).map(([code, l]) => (
                      <SelectItem key={code} value={code}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">국적</Label>
                <Select
                  value={ctx.nationality}
                  onValueChange={(v) => setCtx({ ...ctx, nationality: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <span>
                      {NATIONALITY[ctx.nationality]?.flag}{" "}
                      {NATIONALITY[ctx.nationality]?.label}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NATIONALITY).map(([code, n]) => (
                      <SelectItem key={code} value={code}>
                        {n.flag} {n.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-[10px]">상담 상태</Label>
                <Select
                  value={ctx.status}
                  onValueChange={(v) => setCtx({ ...ctx, status: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <span>
                      {ctx.status &&
                        CONSULTATION_STATUS[
                          ctx.status as keyof typeof CONSULTATION_STATUS
                        ]?.label}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONSULTATION_STATUS).map(([code, s]) => (
                      <SelectItem key={code} value={code}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* 신청자 메시지 */}
          <div className="space-y-2">
            <Label className="text-xs">신청자 첫 메시지 (모국어 가정)</Label>
            <Textarea
              value={ctx.message}
              onChange={(e) => setCtx({ ...ctx, message: e.target.value })}
              placeholder="신청자가 채팅방에 들어와 보내는 첫 메시지"
              className="min-h-[60px] text-xs"
              maxLength={500}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={run}
              disabled={running || nodes.length === 0}
              className="flex-1"
              size="sm"
            >
              {running ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-2 h-3.5 w-3.5" />
              )}
              실행
            </Button>
            {result && (
              <Button onClick={reset} variant="outline" size="sm">
                <RefreshCw className="mr-1.5 h-3 w-3" />
                초기화
              </Button>
            )}
          </div>

          {/* 결과 */}
          {result && <ResultView result={result} nodes={nodes} ctx={ctx} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ResultView({
  result,
  nodes,
  ctx,
}: {
  result: FlowExecutionResult;
  nodes: Node<AnyNodeData>[];
  ctx: ApplicantContext;
}) {
  const term = TERMINATION_LABEL[result.terminatedBy];

  return (
    <div className="space-y-3">
      <Separator />
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold">실행 결과</p>
        <Badge variant="outline" className={`${term.tone} text-[10px]`}>
          {term.label}
        </Badge>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {result.steps.length}단계
        </span>
      </div>

      {result.error && (
        <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">
          {result.error}
        </div>
      )}

      {/* 발송된 메시지들 (신청자 측 채팅 미리보기) */}
      {result.emittedMessages.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground">
            신청자에게 발송될 메시지
          </p>
          <div className="space-y-1 rounded-lg bg-muted/40 p-2">
            {result.emittedMessages.map((m, i) => (
              <div
                key={i}
                className="flex flex-col gap-0.5 rounded-md bg-primary px-3 py-2 text-primary-foreground"
              >
                <p className="text-xs">{m.translatedText}</p>
                {m.text !== m.translatedText && (
                  <p className="text-[10px] opacity-70">
                    원문 (한국어): {m.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 노드 트레이스 */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground">
          노드 경로
        </p>
        <ol className="space-y-1">
          {result.steps.map((s, i) => {
            const node = nodes.find((n) => n.id === s.nodeId);
            const label = node?.data
              ? `${i + 1}. ${labelOf(s.kind)}`
              : `${i + 1}. ${s.kind}`;
            return (
              <li
                key={i}
                className="rounded border-l-2 border-muted-foreground/30 bg-card px-2 py-1.5 text-[11px]"
              >
                <p className="font-medium">{label}</p>
                {s.note && (
                  <p className="text-muted-foreground">{s.note}</p>
                )}
                {s.output && (
                  <p className="mt-0.5 line-clamp-2 font-mono text-[10px] text-muted-foreground">
                    output: {s.output}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function labelOf(kind: AnyNodeData["kind"]): string {
  const map: Record<AnyNodeData["kind"], string> = {
    start: "시작",
    message: "메시지",
    condition: "조건/분기",
    llm: "LLM 응답",
    translate: "번역",
    escalate: "사람 연결",
  };
  return map[kind];
}
