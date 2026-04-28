"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  Loader2,
  X,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useChatSocket } from "./use-socket";
import type { Attachment } from "@/lib/socket-types";

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
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<Attachment[]>([]);
  const fileImgRef = useRef<HTMLInputElement>(null);
  const fileDocRef = useRef<HTMLInputElement>(null);

  const connected = state === "connected";
  const disabled = !connected || sending || uploading;

  async function handleFiles(files: FileList | null, kind: "IMAGE" | "FILE") {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(`업로드 실패: ${err.error ?? res.status}`);
          continue;
        }
        const { data } = await res.json();
        setPending((p) => [...p, data]);
      }
    } finally {
      setUploading(false);
      if (fileImgRef.current) fileImgRef.current.value = "";
      if (fileDocRef.current) fileDocRef.current.value = "";
    }
  }

  function send() {
    const trimmed = text.trim();
    const hasAttachment = pending.length > 0;
    if (!trimmed && !hasAttachment) return;
    if (trimmed.length > 4000) {
      toast.error("메시지는 4000자 이하로 작성해주세요.");
      return;
    }
    if (!connected) {
      toast.error("연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const type: "TEXT" | "IMAGE" | "FILE" = hasAttachment
      ? pending.every((a) => a.mimeType.startsWith("image/"))
        ? "IMAGE"
        : "FILE"
      : "TEXT";

    setSending(true);
    socket.emit(
      "chat:send",
      {
        roomId,
        type,
        originalText: trimmed,
        language: "KO_KR",
        attachments: hasAttachment ? pending : undefined,
      },
      (res) => {
        setSending(false);
        if (res.ok) {
          setText("");
          setPending([]);
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

      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pending.map((a, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="gap-1.5 px-2 py-1 text-[11px]"
            >
              {a.mimeType.startsWith("image/") ? (
                <ImageIcon className="h-3 w-3" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
              <span className="max-w-[180px] truncate">{a.name}</span>
              <button
                type="button"
                onClick={() =>
                  setPending((p) => p.filter((_, j) => j !== i))
                }
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <input
        ref={fileImgRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files, "IMAGE")}
      />
      <input
        ref={fileDocRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files, "FILE")}
      />

      <div className="flex items-end gap-2">
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            title="이미지 첨부 (JPG/PNG/WebP, 10MB 이하)"
            onClick={() => fileImgRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            title="PDF 첨부 (10MB 이하)"
            onClick={() => fileDocRef.current?.click()}
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
          disabled={disabled || (!text.trim() && pending.length === 0)}
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
