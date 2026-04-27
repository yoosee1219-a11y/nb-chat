"use client";

/**
 * 노드 프로퍼티 에디터 — 우측 패널에서 사용.
 * 각 에디터는 (node, onChange) 받아서 부모 nodes state 갱신.
 *
 * 신청자(고객) 컨텍스트 변수 (Phase 4.4 실행 엔진에서 치환):
 *   {{message}}            — 신청자가 방금 보낸 텍스트
 *   {{applicant.name}}     — 신청자 이름
 *   {{applicant.language}} — 신청자 모국어 (KO_KR 등)
 *   {{applicant.nationality}} — 국적 코드 (VN, NP, ...)
 *   {{plan.name}}          — 신청한 요금제명 (있으면)
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  LANGUAGE,
  CONSULTATION_STATUS,
  NATIONALITY,
} from "@/lib/constants";
import type {
  MessageNodeData,
  ConditionNodeData,
  ConditionField,
  ConditionOperator,
  LLMNodeData,
  LLMModel,
  TranslateNodeData,
  EscalateNodeData,
} from "./node-types";

type EditorProps<T> = {
  data: T;
  onChange: (next: T) => void;
};

// ─── Message ──────────────────────────────────────
export function MessageEditor({
  data,
  onChange,
}: EditorProps<MessageNodeData>) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="msg-text">메시지 본문</Label>
        <Textarea
          id="msg-text"
          value={data.text}
          onChange={(e) => onChange({ ...data, text: e.target.value })}
          placeholder="신청자에게 보낼 메시지"
          className="min-h-[120px]"
          maxLength={2000}
        />
        <p className="text-[11px] text-muted-foreground">
          신청자에게는 모국어로 자동번역되어 전송됩니다. 변수: <code>{`{{applicant.name}}`}</code>
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="msg-lang">작성 언어</Label>
        <Select
          value={data.language}
          onValueChange={(v) => onChange({ ...data, language: v })}
        >
          <SelectTrigger id="msg-lang">
            <span>{LANGUAGE[data.language]?.label ?? "선택"}</span>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LANGUAGE).map(([code, l]) => (
              <SelectItem key={code} value={code}>
                {l.label}{" "}
                <span className="ml-1 text-muted-foreground">({l.bcp47})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Condition ──────────────────────────────────────
export function ConditionEditor({
  data,
  onChange,
}: EditorProps<ConditionNodeData>) {
  const fields: { key: ConditionField; label: string }[] = [
    { key: "language", label: "모국어" },
    { key: "status", label: "상담 상태" },
    { key: "nationality", label: "국적" },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>비교 대상</Label>
        <Select
          value={data.field}
          onValueChange={(v) =>
            onChange({ ...data, field: v as ConditionField, value: "" })
          }
        >
          <SelectTrigger>
            <span>{fields.find((f) => f.key === data.field)?.label}</span>
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (
              <SelectItem key={f.key} value={f.key}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>연산자</Label>
        <Select
          value={data.operator}
          onValueChange={(v) =>
            onChange({ ...data, operator: v as ConditionOperator })
          }
        >
          <SelectTrigger>
            <span>{data.operator === "equals" ? "같음 (=)" : "다름 (≠)"}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">같음 (=)</SelectItem>
            <SelectItem value="not_equals">다름 (≠)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>비교 값</Label>
        <ConditionValueSelect data={data} onChange={onChange} />
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-[11px] text-muted-foreground">
        <p className="font-medium text-foreground">출력 분기:</p>
        <ul className="mt-1 list-disc pl-4">
          <li>
            <strong>참</strong> 핸들 → 조건 만족 시
          </li>
          <li>
            <strong>거짓</strong> 핸들 → 그 외
          </li>
        </ul>
      </div>
    </div>
  );
}

function ConditionValueSelect({
  data,
  onChange,
}: EditorProps<ConditionNodeData>) {
  if (data.field === "language") {
    return (
      <Select
        value={data.value || undefined}
        onValueChange={(v) => onChange({ ...data, value: v })}
      >
        <SelectTrigger>
          <span>{LANGUAGE[data.value]?.label ?? "선택"}</span>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(LANGUAGE).map(([code, l]) => (
            <SelectItem key={code} value={code}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (data.field === "status") {
    return (
      <Select
        value={data.value || undefined}
        onValueChange={(v) => onChange({ ...data, value: v })}
      >
        <SelectTrigger>
          <span>
            {CONSULTATION_STATUS[
              data.value as keyof typeof CONSULTATION_STATUS
            ]?.label ?? "선택"}
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
    );
  }

  // nationality
  return (
    <Select
      value={data.value || undefined}
      onValueChange={(v) => onChange({ ...data, value: v })}
    >
      <SelectTrigger>
        <span>
          {(() => {
            const nat = NATIONALITY[data.value];
            return nat ? `${nat.flag} ${nat.label}` : "선택";
          })()}
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
  );
}

// ─── LLM ──────────────────────────────────────
export function LLMEditor({ data, onChange }: EditorProps<LLMNodeData>) {
  const models: { key: LLMModel; label: string; hint: string }[] = [
    {
      key: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      hint: "빠르고 저렴 (FAQ 답변 권장)",
    },
    {
      key: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      hint: "더 정교한 응답",
    },
    { key: "gpt-4o-mini", label: "GPT-4o mini", hint: "OpenAI 대안" },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>모델</Label>
        <Select
          value={data.model}
          onValueChange={(v) =>
            onChange({ ...data, model: v as LLMModel })
          }
        >
          <SelectTrigger>
            <span>{models.find((m) => m.key === data.model)?.label}</span>
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.key} value={m.key}>
                <div className="flex flex-col">
                  <span>{m.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {m.hint}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="llm-system">시스템 프롬프트</Label>
        <Textarea
          id="llm-system"
          value={data.systemPrompt}
          onChange={(e) =>
            onChange({ ...data, systemPrompt: e.target.value })
          }
          className="min-h-[100px] font-mono text-xs"
          maxLength={2000}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="llm-user">사용자 메시지 템플릿</Label>
        <Textarea
          id="llm-user"
          value={data.userTemplate}
          onChange={(e) =>
            onChange({ ...data, userTemplate: e.target.value })
          }
          className="min-h-[80px] font-mono text-xs"
          maxLength={1000}
        />
        <div className="flex flex-wrap gap-1">
          {[
            "{{message}}",
            "{{applicant.name}}",
            "{{applicant.language}}",
            "{{applicant.nationality}}",
            "{{plan.name}}",
          ].map((v) => (
            <Badge key={v} variant="outline" className="font-mono text-[10px]">
              {v}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="llm-tokens">최대 토큰</Label>
        <Input
          id="llm-tokens"
          type="number"
          min={50}
          max={4000}
          step={50}
          value={data.maxTokens}
          onChange={(e) =>
            onChange({ ...data, maxTokens: Number(e.target.value) || 500 })
          }
        />
      </div>
    </div>
  );
}

// ─── Translate ──────────────────────────────────────
export function TranslateEditor({
  data,
  onChange,
}: EditorProps<TranslateNodeData>) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>대상 언어</Label>
        <Select
          value={data.targetLanguage || "__auto__"}
          onValueChange={(v) =>
            onChange({
              ...data,
              targetLanguage: v === "__auto__" ? "" : v,
            })
          }
        >
          <SelectTrigger>
            <span>
              {data.targetLanguage
                ? LANGUAGE[data.targetLanguage]?.label
                : "신청자 언어로 (자동)"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto__">신청자 언어로 (자동)</SelectItem>
            {Object.entries(LANGUAGE).map(([code, l]) => (
              <SelectItem key={code} value={code}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          이전 노드 결과를 이 언어로 번역해 다음 노드로 넘깁니다.
        </p>
      </div>
    </div>
  );
}

// ─── Escalate ──────────────────────────────────────
export function EscalateEditor({
  data,
  onChange,
  managers,
}: EditorProps<EscalateNodeData> & {
  managers: { id: string; name: string; email: string }[];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="esc-reason">에스컬레이션 사유</Label>
        <Textarea
          id="esc-reason"
          value={data.reason}
          onChange={(e) => onChange({ ...data, reason: e.target.value })}
          placeholder="예: 결제 관련 복잡 문의 — 사람 상담 필요"
          className="min-h-[80px]"
          maxLength={300}
        />
        <p className="text-[11px] text-muted-foreground">
          매니저 채팅 룸에 시스템 메시지로 표시됩니다.
        </p>
      </div>

      <div className="space-y-2">
        <Label>담당 매니저 (선택)</Label>
        <Select
          value={data.assignToManagerId ?? "__unassigned__"}
          onValueChange={(v) =>
            onChange({
              ...data,
              assignToManagerId: v === "__unassigned__" ? undefined : v,
            })
          }
        >
          <SelectTrigger>
            <span>
              {data.assignToManagerId
                ? managers.find((m) => m.id === data.assignToManagerId)?.name ??
                  "(삭제된 매니저)"
                : "지정 안 함 (대기열)"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unassigned__">지정 안 함 (대기열)</SelectItem>
            {managers.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}{" "}
                <span className="text-muted-foreground">· {m.email}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-[11px] text-muted-foreground">
        이 노드 도달 시 챗봇 자동 응답이 종료되고 사람 매니저에게 인계됩니다.
      </div>
    </div>
  );
}
