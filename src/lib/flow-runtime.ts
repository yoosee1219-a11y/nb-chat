/**
 * 챗봇 플로우 실행 엔진 (Phase 4.3).
 *
 * 입력: 플로우 graph + 신청자 컨텍스트 + 신청자 메시지
 * 출력: 실행 트레이스 (어느 노드를 거쳤는지, 어떤 메시지를 발송했는지)
 *
 * 매니저 시뮬레이터에서 사용 — 실제 채팅 통합은 Phase 4.4에서 socket 핸들러에 결합.
 *
 * 안전:
 *  - max steps 제한 (사이클 방지)
 *  - 미연결 핸들 만나면 stop
 *  - 알려지지 않은 노드 타입 만나면 stop
 */

import type { Edge, Node } from "@xyflow/react";
import type {
  AnyNodeData,
  StartNodeData,
  MessageNodeData,
  ConditionNodeData,
  LLMNodeData,
  TranslateNodeData,
  EscalateNodeData,
} from "@/app/(admin)/chatbot-flow/[id]/node-types";
import { getTranslator } from "./translation";
import { getLLMClient } from "./llm";

// ─── 신청자 컨텍스트 ──────────────────────────────
export type ApplicantContext = {
  name: string;
  language: string; // KO_KR 등
  nationality: string; // VN 등
  status?: string; // PENDING 등
  planName?: string;
  message: string; // 신청자가 보낸 첫 메시지 (또는 현재 메시지)
};

// ─── 실행 결과 ────────────────────────────────────
export type FlowStep = {
  nodeId: string;
  kind: AnyNodeData["kind"];
  /** 이 노드가 만든 결과 — 메시지 텍스트, 조건 평가 결과, LLM 응답 등 */
  output?: string;
  /** 이 노드에서 발송된 메시지 (있으면) */
  emittedMessage?: {
    text: string;
    /** translatedText (신청자 언어로 — Phase 3.4 실 번역 시) */
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
  };
  /** 디버깅용 — 노드별 메모 */
  note?: string;
};

export type FlowExecutionResult = {
  ok: boolean;
  steps: FlowStep[];
  /** 종료 사유 */
  terminatedBy:
    | "completed" // 노드 끝까지 도달
    | "escalated" // escalate 노드 도달
    | "trigger_mismatched" // 시작 노드 트리거 조건 불일치 → 플로우 발동 안 함
    | "dead_end" // 다음 노드가 없음
    | "max_steps_exceeded"
    | "unknown_node"
    | "error";
  error?: string;
  /** 실제 신청자에게 발송될 메시지들 (Phase 4.4에서 socket으로) */
  emittedMessages: NonNullable<FlowStep["emittedMessage"]>[];
};

const MAX_STEPS = 50;
const MAX_NODES = 200;
const MAX_EDGES = 400;
const MAX_EMITTED_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;

// ─── 변수 치환 ────────────────────────────────────
export function substituteVariables(
  template: string,
  ctx: ApplicantContext
): string {
  return template
    .replace(/\{\{\s*message\s*\}\}/g, ctx.message)
    .replace(/\{\{\s*applicant\.name\s*\}\}/g, ctx.name)
    .replace(/\{\{\s*applicant\.language\s*\}\}/g, ctx.language)
    .replace(/\{\{\s*applicant\.nationality\s*\}\}/g, ctx.nationality)
    .replace(/\{\{\s*applicant\.status\s*\}\}/g, ctx.status ?? "")
    .replace(/\{\{\s*plan\.name\s*\}\}/g, ctx.planName ?? "");
}

// ─── 시작 노드 트리거 평가 ────────────────────────
function evaluateTrigger(
  data: StartNodeData,
  ctx: ApplicantContext
): boolean {
  switch (data.trigger) {
    case "always":
      return true;
    case "language_match":
      return ctx.language === data.triggerValue;
    case "status_match":
      return ctx.status === data.triggerValue;
    case "keyword_match":
      return (
        data.triggerValue.length > 0 &&
        ctx.message.toLowerCase().includes(data.triggerValue.toLowerCase())
      );
    default:
      return false;
  }
}

// ─── 조건 노드 평가 ────────────────────────────────
function evaluateCondition(
  data: ConditionNodeData,
  ctx: ApplicantContext
): boolean {
  let actual = "";
  switch (data.field) {
    case "language":
      actual = ctx.language;
      break;
    case "status":
      actual = ctx.status ?? "";
      break;
    case "nationality":
      actual = ctx.nationality;
      break;
  }
  const matches = actual === data.value;
  return data.operator === "equals" ? matches : !matches;
}

// ─── 그래프 헬퍼 ──────────────────────────────────
function findNode(
  nodes: Node<AnyNodeData>[],
  id: string
): Node<AnyNodeData> | null {
  return nodes.find((n) => n.id === id) ?? null;
}

function findStartNode(
  nodes: Node<AnyNodeData>[]
): Node<AnyNodeData> | null {
  return nodes.find((n) => n.type === "start") ?? null;
}

function nextNodeId(
  edges: Edge[],
  fromId: string,
  sourceHandle?: string
): string | null {
  for (const e of edges) {
    if (e.source !== fromId) continue;
    // sourceHandle 지정된 경우 (예: condition 노드의 'true'/'false') 일치 검사
    if (sourceHandle !== undefined) {
      if (e.sourceHandle === sourceHandle) return e.target;
    } else {
      // sourceHandle 무관 — 첫 매칭
      if (!e.sourceHandle || e.sourceHandle === null) return e.target;
    }
  }
  return null;
}

// ─── 노드 타입별 핸들러 (Phase 3.4: 실 API 연동) ─────────────────
async function executeMessage(
  data: MessageNodeData,
  ctx: ApplicantContext
): Promise<NonNullable<FlowStep["emittedMessage"]>> {
  const text = substituteVariables(data.text, ctx);
  const translator = getTranslator();
  const { translatedText } = await translator.translate({
    text,
    sourceLanguage: data.language,
    targetLanguage: ctx.language,
  });
  return {
    text,
    translatedText,
    sourceLanguage: data.language,
    targetLanguage: ctx.language,
  };
}

async function executeLLM(
  data: LLMNodeData,
  ctx: ApplicantContext
): Promise<string> {
  const userMsg = substituteVariables(data.userTemplate, ctx);
  const systemPrompt = substituteVariables(data.systemPrompt, ctx);
  const llm = getLLMClient(data.model);
  const { text } = await llm.complete({
    systemPrompt,
    userMessage: userMsg,
    model: data.model,
  });
  return text;
}

// ─── 메인 실행 함수 ───────────────────────────────
export async function executeFlow(
  nodes: Node<AnyNodeData>[],
  edges: Edge[],
  ctx: ApplicantContext
): Promise<FlowExecutionResult> {
  const steps: FlowStep[] = [];
  const emittedMessages: FlowExecutionResult["emittedMessages"] = [];

  // 입력 크기 가드 — 악성/잘못된 플로우가 런타임 자원 폭주 방지
  if (nodes.length > MAX_NODES) {
    return {
      ok: false,
      steps: [],
      terminatedBy: "error",
      error: `노드 수가 ${MAX_NODES}개를 초과합니다 (${nodes.length}개)`,
      emittedMessages: [],
    };
  }
  if (edges.length > MAX_EDGES) {
    return {
      ok: false,
      steps: [],
      terminatedBy: "error",
      error: `엣지 수가 ${MAX_EDGES}개를 초과합니다 (${edges.length}개)`,
      emittedMessages: [],
    };
  }

  const start = findStartNode(nodes);
  if (!start) {
    return {
      ok: false,
      steps: [],
      terminatedBy: "error",
      error: "시작 노드 없음",
      emittedMessages: [],
    };
  }

  // 1) 트리거 평가
  const startData = start.data as StartNodeData;
  const triggered = evaluateTrigger(startData, ctx);
  steps.push({
    nodeId: start.id,
    kind: "start",
    note: triggered
      ? `트리거 일치 (${startData.trigger})`
      : `트리거 불일치 (${startData.trigger} ${
          startData.triggerValue ? "= " + startData.triggerValue : ""
        })`,
  });

  if (!triggered) {
    return {
      ok: true,
      steps,
      terminatedBy: "trigger_mismatched",
      emittedMessages: [],
    };
  }

  // 2) 노드 순회
  let currentId: string | null = nextNodeId(edges, start.id);
  let stepCount = 0;

  while (currentId && stepCount < MAX_STEPS) {
    stepCount++;
    const node: Node<AnyNodeData> | null = findNode(nodes, currentId);
    if (!node) {
      return {
        ok: false,
        steps,
        terminatedBy: "unknown_node",
        error: `노드 ${currentId} 없음`,
        emittedMessages,
      };
    }

    const kind = node.data.kind;

    if (kind === "message") {
      const data = node.data as MessageNodeData;
      if (emittedMessages.length >= MAX_EMITTED_MESSAGES) {
        return {
          ok: false,
          steps,
          terminatedBy: "error",
          error: `발송 메시지가 ${MAX_EMITTED_MESSAGES}개를 초과`,
          emittedMessages,
        };
      }
      const emitted = await executeMessage(data, ctx);
      // 텍스트 cap (LLM 폭주 방지선)
      emitted.text = emitted.text.slice(0, MAX_MESSAGE_CHARS);
      emitted.translatedText = emitted.translatedText.slice(0, MAX_MESSAGE_CHARS);
      steps.push({
        nodeId: node.id,
        kind,
        output: emitted.text,
        emittedMessage: emitted,
      });
      emittedMessages.push(emitted);
      currentId = nextNodeId(edges, node.id);
    } else if (kind === "condition") {
      const data = node.data as ConditionNodeData;
      const result = evaluateCondition(data, ctx);
      steps.push({
        nodeId: node.id,
        kind,
        output: result ? "true" : "false",
        note: `${data.field} ${data.operator} ${data.value} → ${result}`,
      });
      // condition 노드는 sourceHandle 'true' 또는 'false'로 분기
      currentId = nextNodeId(edges, node.id, result ? "true" : "false");
    } else if (kind === "llm") {
      const data = node.data as LLMNodeData;
      if (emittedMessages.length >= MAX_EMITTED_MESSAGES) {
        return {
          ok: false,
          steps,
          terminatedBy: "error",
          error: `발송 메시지가 ${MAX_EMITTED_MESSAGES}개를 초과`,
          emittedMessages,
        };
      }
      const responseRaw = await executeLLM(data, ctx);
      const response = responseRaw.slice(0, MAX_MESSAGE_CHARS);
      // LLM 응답(한국어 가정)을 신청자 언어로 번역해 emit
      const translator = getTranslator();
      const { translatedText: translatedRaw } = await translator.translate({
        text: response,
        sourceLanguage: "KO_KR",
        targetLanguage: ctx.language,
      });
      const emitted = {
        text: response,
        translatedText: translatedRaw.slice(0, MAX_MESSAGE_CHARS),
        sourceLanguage: "KO_KR",
        targetLanguage: ctx.language,
      };
      steps.push({
        nodeId: node.id,
        kind,
        output: response,
        emittedMessage: emitted,
      });
      emittedMessages.push(emitted);
      currentId = nextNodeId(edges, node.id);
    } else if (kind === "translate") {
      const data = node.data as TranslateNodeData;
      const target = data.targetLanguage || ctx.language;
      const prevOutput = steps[steps.length - 1]?.output ?? "";
      const translator = getTranslator();
      const { translatedText } = await translator.translate({
        text: prevOutput,
        sourceLanguage: "KO_KR",
        targetLanguage: target,
      });
      steps.push({
        nodeId: node.id,
        kind,
        output: translatedText,
        note: `→ ${target}`,
      });
      currentId = nextNodeId(edges, node.id);
    } else if (kind === "escalate") {
      const data = node.data as EscalateNodeData;
      steps.push({
        nodeId: node.id,
        kind,
        note: `에스컬레이션: ${data.reason}${
          data.assignToManagerId
            ? ` (담당: ${data.assignToManagerId})`
            : " (대기열)"
        }`,
      });
      return {
        ok: true,
        steps,
        terminatedBy: "escalated",
        emittedMessages,
      };
    } else {
      return {
        ok: false,
        steps,
        terminatedBy: "unknown_node",
        error: `알 수 없는 노드 타입: ${kind}`,
        emittedMessages,
      };
    }
  }

  if (stepCount >= MAX_STEPS) {
    return {
      ok: false,
      steps,
      terminatedBy: "max_steps_exceeded",
      error: `${MAX_STEPS} 단계 초과 — 무한 루프 의심`,
      emittedMessages,
    };
  }

  // currentId === null → 다음 노드 없음
  return {
    ok: true,
    steps,
    terminatedBy: steps.length > 1 ? "completed" : "dead_end",
    emittedMessages,
  };
}
