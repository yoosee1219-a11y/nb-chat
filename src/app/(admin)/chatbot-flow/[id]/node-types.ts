/**
 * 챗봇 플로우 노드 타입 정의.
 * xyflow의 Node<TData> 제네릭에 들어가는 data 형태들.
 *
 * 추후 4.4 (실행 엔진)에서 이 데이터를 읽어 노드별 동작 수행.
 */

export type NodeKind =
  | "start" // 플로우 진입점 (자동 1개)
  | "message" // 정적 텍스트 발송
  | "condition" // 신청자 속성 분기
  | "llm" // Claude/GPT 호출
  | "translate" // 명시적 번역 단계
  | "escalate"; // 사람 매니저로 에스컬레이션

// ─── data 페이로드 ────────────────────────────────
export type StartNodeData = {
  kind: "start";
  label: string;
};

export type MessageNodeData = {
  kind: "message";
  text: string;
  /** 작성 언어 (KO_KR이면 신청자 언어로 자동번역). 비우면 신청자 언어 그대로 발송 */
  language: string;
};

export type ConditionField = "language" | "status" | "nationality";
export type ConditionOperator = "equals" | "not_equals";

export type ConditionNodeData = {
  kind: "condition";
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
};

export type LLMModel =
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "gpt-4o-mini";

export type LLMNodeData = {
  kind: "llm";
  model: LLMModel;
  systemPrompt: string;
  /** 신청자 메시지 + 컨텍스트 변수 ({{message}}, {{name}}, {{language}}) */
  userTemplate: string;
  maxTokens: number;
};

export type TranslateNodeData = {
  kind: "translate";
  /** 빈 문자열이면 "신청자 언어로" 자동 결정 */
  targetLanguage: string;
};

export type EscalateNodeData = {
  kind: "escalate";
  /** 매니저에게 보일 사유 */
  reason: string;
  /** 비워두면 unassigned 상태 유지, 지정 시 해당 매니저에게 배정 */
  assignToManagerId?: string;
};

export type AnyNodeData =
  | StartNodeData
  | MessageNodeData
  | ConditionNodeData
  | LLMNodeData
  | TranslateNodeData
  | EscalateNodeData;

// ─── 메타 ───────────────────────────────────────────
export const NODE_META: Record<
  NodeKind,
  { label: string; tone: string; description: string }
> = {
  start: {
    label: "시작",
    tone: "slate",
    description: "플로우 진입점. 신청자가 채팅방에 들어오면 여기서 시작",
  },
  message: {
    label: "메시지",
    tone: "cyan",
    description: "신청자에게 정적 텍스트를 발송 (자동번역 대상)",
  },
  condition: {
    label: "조건/분기",
    tone: "amber",
    description: "신청자 속성(언어/상태/국적)으로 다음 노드 분기",
  },
  llm: {
    label: "LLM 응답",
    tone: "violet",
    description: "Claude/GPT를 호출해 동적 응답 생성",
  },
  translate: {
    label: "번역",
    tone: "indigo",
    description: "이전 노드 결과를 명시적으로 다른 언어로 번역",
  },
  escalate: {
    label: "사람 연결",
    tone: "rose",
    description: "사람 매니저 채팅으로 인계 (자동 응대 종료)",
  },
};

export const TONE_CLASSES: Record<
  string,
  { bg: string; border: string; text: string; ring: string }
> = {
  slate: {
    bg: "bg-slate-50",
    border: "border-slate-300",
    text: "text-slate-700",
    ring: "ring-slate-400",
  },
  cyan: {
    bg: "bg-cyan-50",
    border: "border-cyan-300",
    text: "text-cyan-700",
    ring: "ring-cyan-400",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    text: "text-amber-700",
    ring: "ring-amber-400",
  },
  violet: {
    bg: "bg-violet-50",
    border: "border-violet-300",
    text: "text-violet-700",
    ring: "ring-violet-400",
  },
  indigo: {
    bg: "bg-indigo-50",
    border: "border-indigo-300",
    text: "text-indigo-700",
    ring: "ring-indigo-400",
  },
  rose: {
    bg: "bg-rose-50",
    border: "border-rose-300",
    text: "text-rose-700",
    ring: "ring-rose-400",
  },
};

/** 새 노드 생성 시 기본 데이터 */
export function defaultData(kind: NodeKind): AnyNodeData {
  switch (kind) {
    case "start":
      return { kind: "start", label: "시작" };
    case "message":
      return { kind: "message", text: "안녕하세요!", language: "KO_KR" };
    case "condition":
      return {
        kind: "condition",
        field: "language",
        operator: "equals",
        value: "VI_VN",
      };
    case "llm":
      return {
        kind: "llm",
        model: "claude-haiku-4-5",
        systemPrompt:
          "당신은 LGU+ 외국인 통신 가입 상담사입니다. 친절하고 간결하게 답변하세요.",
        userTemplate: "{{message}}",
        maxTokens: 500,
      };
    case "translate":
      return { kind: "translate", targetLanguage: "" };
    case "escalate":
      return {
        kind: "escalate",
        reason: "복잡한 문의 — 사람 상담 필요",
        assignToManagerId: undefined,
      };
  }
}
