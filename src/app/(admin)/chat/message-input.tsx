"use client";

import { useState, type KeyboardEvent } from "react";
import { Send, Paperclip, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useChatSocket } from "./use-socket";

/**
 * 매니저 측 메시지 전송창.
 *  - Enter: 전송, Shift+Enter: 줄바꿈
 *  - Socket 연결 안 된 상태에서는 disable + 표시
 *  - 4000자 제한 (서버에서도 검증)
 *  - ack 받기 전엔 sending 상태 (UI 잠금)
 */
export function MessageInput({
  roomId,
  applicantLanguageLabel,
}: {
  roomId: string;
  applicantLanguageLabel: string;
}) {
  const { socket, state } = useChatSocket();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const connected = state === "connected";
  const disabled = !connected || sending;

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > 4000) {
      toast.error("메시지는 4000자 이하로 작성해주세요.");
      return;
    }
    if (!connected) {
      toast.error("연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setSending(true);
    socket.emit(
      "chat:send",
      {
        roomId,
        type: "TEXT",
        originalText: trimmed,
        language: "KO_KR",
      },
      (res) => {
        setSending(false);
        if (res.ok) {
          setText("");
        } else {
          toast.error(`전송 실패: ${res.error}`);
        }
      }
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="border-t bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <Badge variant="outline" className="text-[10px]">
          전송 시 자동번역: 한국어 → {applicantLanguageLabel}
        </Badge>
        {state === "connecting" && (
          <Badge variant="secondary" className="text-[10px]">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            연결 중
          </Badge>
        )}
        {state === "disconnected" && (
          <Badge variant="destructive" className="text-[10px]">
            연결 끊김 — 재연결 시도 중
          </Badge>
        )}
        {state === "error" && (
          <Badge variant="destructive" className="text-[10px]">
            연결 오류 — 소켓 서버 확인 필요
          </Badge>
        )}
      </div>

      <div className="flex items-end gap-2">
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled
            title="이미지 첨부 (Phase 3.5)"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled
            title="파일 첨부 (Phase 3.5)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </div>

        <Textarea
          placeholder={
            connected
              ? "한국어로 메시지를 입력하세요. 전송 시 신청자 언어로 자동번역됩니다."
              : "소켓 연결을 기다리는 중..."
          }
          className="min-h-[44px] max-h-32 resize-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!connected}
          maxLength={4000}
        />

        <Button
          type="button"
          onClick={send}
          disabled={disabled || !text.trim()}
          className="shrink-0"
        >
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          전송
        </Button>
      </div>
    </div>
  );
}
