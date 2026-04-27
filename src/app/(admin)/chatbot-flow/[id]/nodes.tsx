"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  Play,
  MessageSquare,
  GitBranch,
  Sparkles,
  Languages,
  UserCheck,
} from "lucide-react";
import { LANGUAGE, CONSULTATION_STATUS, NATIONALITY } from "@/lib/constants";
import {
  NODE_META,
  TONE_CLASSES,
  type StartNodeData,
  type MessageNodeData,
  type ConditionNodeData,
  type LLMNodeData,
  type TranslateNodeData,
  type EscalateNodeData,
} from "./node-types";

const ICON = {
  start: Play,
  message: MessageSquare,
  condition: GitBranch,
  llm: Sparkles,
  translate: Languages,
  escalate: UserCheck,
} as const;

function NodeShell({
  kind,
  selected,
  preview,
  children,
  showTopHandle = true,
  showBottomHandle = true,
  bottomHandles,
}: {
  kind: keyof typeof ICON;
  selected: boolean;
  preview: React.ReactNode;
  children?: React.ReactNode;
  showTopHandle?: boolean;
  showBottomHandle?: boolean;
  /** condition 노드처럼 multiple source handle (true/false) */
  bottomHandles?: { id: string; label: string }[];
}) {
  const meta = NODE_META[kind];
  const tone = TONE_CLASSES[meta.tone];
  const Icon = ICON[kind];

  return (
    <div
      className={`min-w-[180px] max-w-[260px] rounded-lg border-2 bg-card shadow-sm transition-all ${
        selected
          ? `${tone.border} ring-2 ${tone.ring} ring-offset-2`
          : `${tone.border}`
      }`}
    >
      {showTopHandle && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-2 !w-2 !border-2 !border-background !bg-foreground"
        />
      )}

      <div
        className={`flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-[11px] font-semibold ${tone.bg} ${tone.text}`}
      >
        <Icon className="h-3 w-3" />
        {meta.label}
      </div>
      <div className="px-3 py-2 text-xs leading-relaxed text-foreground">
        {preview}
      </div>
      {children}

      {showBottomHandle && !bottomHandles && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-2 !w-2 !border-2 !border-background !bg-foreground"
        />
      )}
      {bottomHandles?.map((h, i) => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={Position.Bottom}
          style={{ left: `${((i + 1) / (bottomHandles.length + 1)) * 100}%` }}
          className="!h-2 !w-2 !border-2 !border-background !bg-foreground"
        >
          <span className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium text-muted-foreground">
            {h.label}
          </span>
        </Handle>
      ))}
    </div>
  );
}

// ─── 각 노드 ──────────────────────────────────────────

export function StartNode({
  data,
  selected,
}: NodeProps<Node<StartNodeData>>) {
  return (
    <NodeShell
      kind="start"
      selected={!!selected}
      showTopHandle={false}
      preview={
        <p className="text-muted-foreground">신청자 진입 시 시작</p>
      }
    />
  );
}

export function MessageNode({
  data,
  selected,
}: NodeProps<Node<MessageNodeData>>) {
  const lang = LANGUAGE[data.language];
  return (
    <NodeShell
      kind="message"
      selected={!!selected}
      preview={
        <>
          <p className="line-clamp-3 whitespace-pre-wrap">
            {data.text || (
              <span className="text-muted-foreground">(빈 메시지)</span>
            )}
          </p>
          {lang && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              작성 언어: {lang.label} → 신청자 언어로 자동번역
            </p>
          )}
        </>
      }
    />
  );
}

export function ConditionNode({
  data,
  selected,
}: NodeProps<Node<ConditionNodeData>>) {
  const fieldLabel = {
    language: "모국어",
    status: "상담 상태",
    nationality: "국적",
  }[data.field];
  const opLabel = data.operator === "equals" ? "=" : "≠";

  // value 라벨 변환
  let valueLabel = data.value;
  if (data.field === "language") {
    valueLabel = LANGUAGE[data.value]?.label ?? data.value;
  } else if (data.field === "status") {
    valueLabel =
      CONSULTATION_STATUS[
        data.value as keyof typeof CONSULTATION_STATUS
      ]?.label ?? data.value;
  } else if (data.field === "nationality") {
    const nat = NATIONALITY[data.value];
    valueLabel = nat ? `${nat.flag} ${nat.label}` : data.value;
  }

  return (
    <NodeShell
      kind="condition"
      selected={!!selected}
      bottomHandles={[
        { id: "true", label: "참" },
        { id: "false", label: "거짓" },
      ]}
      preview={
        <p>
          <span className="text-muted-foreground">{fieldLabel}</span>{" "}
          <span className="font-mono font-semibold">{opLabel}</span>{" "}
          <span className="font-medium">{valueLabel || "(미설정)"}</span>
        </p>
      }
    />
  );
}

export function LLMNode({ data, selected }: NodeProps<Node<LLMNodeData>>) {
  return (
    <NodeShell
      kind="llm"
      selected={!!selected}
      preview={
        <>
          <p className="font-mono text-[10px] text-muted-foreground">
            {data.model}
          </p>
          <p className="mt-1 line-clamp-2 text-xs">
            {data.systemPrompt || (
              <span className="text-muted-foreground">(시스템 프롬프트 없음)</span>
            )}
          </p>
        </>
      }
    />
  );
}

export function TranslateNode({
  data,
  selected,
}: NodeProps<Node<TranslateNodeData>>) {
  const lang = data.targetLanguage ? LANGUAGE[data.targetLanguage] : null;
  return (
    <NodeShell
      kind="translate"
      selected={!!selected}
      preview={
        <p>
          <span className="text-muted-foreground">→ </span>
          <span className="font-medium">
            {lang?.label ?? "신청자 언어로 (자동)"}
          </span>
        </p>
      }
    />
  );
}

export function EscalateNode({
  data,
  selected,
}: NodeProps<Node<EscalateNodeData>>) {
  return (
    <NodeShell
      kind="escalate"
      selected={!!selected}
      showBottomHandle={false}
      preview={
        <p className="line-clamp-2 text-xs">
          {data.reason || (
            <span className="text-muted-foreground">(사유 미설정)</span>
          )}
        </p>
      }
    />
  );
}

export const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  condition: ConditionNode,
  llm: LLMNode,
  translate: TranslateNode,
  escalate: EscalateNode,
} as const;
