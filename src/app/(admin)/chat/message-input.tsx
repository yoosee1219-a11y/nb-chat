"use client";

import { Send, Paperclip, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/**
 * Phase 3.1 — 메시지 입력 셸 (UI만, 전송 비활성화)
 * Phase 3.2에서 Socket.IO 전송 + Outbox 연결 예정.
 */
export function MessageInput({
  applicantLanguageLabel,
}: {
  applicantLanguageLabel: string;
}) {
  return (
    <div className="border-t bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="text-[10px]">
          전송 시 자동번역: 한국어 → {applicantLanguageLabel}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          Phase 3.2에서 활성화
        </Badge>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled
            title="이미지 첨부 (구현 예정)"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled
            title="파일 첨부 (구현 예정)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </div>

        <Textarea
          placeholder="한국어로 메시지를 입력하세요. 전송 시 신청자 언어로 자동번역됩니다."
          className="min-h-[44px] max-h-32 resize-none"
          disabled
        />

        <Button type="button" disabled className="shrink-0">
          <Send className="mr-2 h-4 w-4" />
          전송
        </Button>
      </div>
    </div>
  );
}
