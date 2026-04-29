"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChatSocket } from "./use-socket";
import type { CardType } from "@/lib/socket-types";
import { CARD_TYPES, MessageCard } from "./message-card";

/**
 * Card 메시지 발신 다이얼로그 — Phase 5.7
 *
 * cardType 선택 → 폼 입력 → 미리보기 → 전송.
 * cardType별 권장 필드는 placeholder/label로 안내. payload는 freeform key:value.
 *
 * MVP: 매니저 측에서만 발신. 신청자는 카드 수신만 가능.
 * 미래: 챗봇 플로우의 CARD 노드 → 자동 발신 경로 분리.
 */
type FieldRow = { key: string; value: string };

const PRESETS: Record<CardType, FieldRow[]> = {
  PLAN: [
    { key: "name", value: "" },
    { key: "monthlyFee", value: "" },
    { key: "dataAllowance", value: "" },
    { key: "voiceMinutes", value: "" },
    { key: "smsCount", value: "" },
    { key: "commitment", value: "" },
  ],
  VIDEO: [
    { key: "title", value: "" },
    { key: "url", value: "" },
    { key: "thumbnail", value: "" },
  ],
  PROFILE: [
    { key: "name", value: "" },
    { key: "nationality", value: "" },
    { key: "language", value: "" },
    { key: "visa", value: "" },
  ],
  HOUSING: [
    { key: "title", value: "" },
    { key: "region", value: "" },
    { key: "link", value: "" },
  ],
  RESUME: [
    { key: "name", value: "" },
    { key: "age", value: "" },
    { key: "experience", value: "" },
  ],
  GENERIC: [
    { key: "title", value: "" },
    { key: "body", value: "" },
    { key: "link", value: "" },
    { key: "image", value: "" },
  ],
};

export function CardSenderDialog({
  roomId,
  trigger,
}: {
  roomId: string;
  trigger: React.ReactNode;
}) {
  const { socket, state } = useChatSocket();
  const [open, setOpen] = useState(false);
  const [cardType, setCardType] = useState<CardType>("PLAN");
  const [rows, setRows] = useState<FieldRow[]>(PRESETS.PLAN);
  const [sending, setSending] = useState(false);

  function changeType(next: CardType) {
    setCardType(next);
    setRows(PRESETS[next].map((r) => ({ ...r })));
  }

  function buildPayload(): Record<string, string> {
    const payload: Record<string, string> = {};
    for (const r of rows) {
      const k = r.key.trim();
      const v = r.value.trim();
      if (k && v) payload[k] = v;
    }
    // RESUME은 fields 래핑 (MessageCard와 일관)
    if (cardType === "RESUME") {
      return { fields: JSON.stringify(payload) } as unknown as Record<
        string,
        string
      >;
    }
    return payload;
  }

  function preview() {
    const payload =
      cardType === "RESUME"
        ? { fields: Object.fromEntries(rows.filter((r) => r.key && r.value).map((r) => [r.key, r.value])) }
        : Object.fromEntries(rows.filter((r) => r.key && r.value).map((r) => [r.key, r.value]));
    return payload;
  }

  function send() {
    if (state !== "connected") {
      toast.error("연결되지 않았습니다.");
      return;
    }
    const payload = preview();
    if (Object.keys(payload).length === 0) {
      toast.error("최소 1개 필드를 입력하세요.");
      return;
    }

    setSending(true);
    socket.emit(
      "chat:send",
      {
        roomId,
        type: "CARD",
        originalText: "",
        language: "KO_KR",
        cardType,
        cardPayload: payload,
      },
      (res) => {
        setSending(false);
        if (res.ok) {
          setOpen(false);
          // 다음 발신 위해 초기화
          setRows(PRESETS[cardType].map((r) => ({ ...r })));
        } else {
          toast.error(`전송 실패: ${res.error}`);
        }
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>카드 메시지 발신</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 폼 */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>카드 종류</Label>
              <Select value={cardType} onValueChange={(v) => changeType(v as CardType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="key"
                    value={row.key}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, j) =>
                          j === i ? { ...r, key: e.target.value } : r
                        )
                      )
                    }
                    className="w-32 shrink-0"
                  />
                  {row.key === "body" || row.value.length > 50 ? (
                    <Textarea
                      placeholder="value"
                      value={row.value}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, j) =>
                            j === i ? { ...r, value: e.target.value } : r
                          )
                        )
                      }
                      rows={3}
                    />
                  ) : (
                    <Input
                      placeholder="value"
                      value={row.value}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, j) =>
                            j === i ? { ...r, value: e.target.value } : r
                          )
                        )
                      }
                    />
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setRows((prev) => [...prev, { key: "", value: "" }])
                }
              >
                + 필드 추가
              </Button>
            </div>
          </div>

          {/* 미리보기 */}
          <div className="space-y-1.5">
            <Label>미리보기</Label>
            <div className="rounded-lg border bg-muted/20 p-3">
              <MessageCard
                cardType={cardType}
                payload={preview() as Record<string, unknown>}
                onSurface="muted"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button type="button" onClick={send} disabled={sending}>
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            전송
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
