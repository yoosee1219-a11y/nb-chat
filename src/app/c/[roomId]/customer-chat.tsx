"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Bot,
  User,
  Wifi,
  WifiOff,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createApplicantSocket } from "@/lib/socket-client";
import type {
  ChatMessageEvent,
  Attachment,
  CardType,
  TypingEvent,
  MessageUpdatedEvent,
  MessageDeletedEvent,
} from "@/lib/socket-types";
import { MessageCard, parseCardPayload } from "@/app/(admin)/chat/message-card";

type Message = {
  id: string;
  senderType: string;
  type: string;
  originalText: string | null;
  language: string | null;
  translatedText: string | null;
  attachments: string | null;
  cardType: string | null;
  cardPayload: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

function parseAttachments(raw: string | null): Attachment[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * 신청자(고객) 모바일 채팅 화면 — Phase 3.5
 *
 * 신청자 POV 표시 정책:
 *  - 매니저/SYSTEM(챗봇) 메시지: translatedText(신청자 언어) 우선 표시 + 원문 토글
 *  - 본인(APPLICANT) 메시지: originalText(자기 언어) 그대로
 *
 * 모바일 우선:
 *  - 풀 height layout, 100dvh로 키보드 대응
 *  - 입력창 sticky bottom, safe-area-inset 패딩
 *  - 메시지 max-width 78% (좁은 화면 가독성)
 */
export function CustomerChat({
  roomId,
  token,
  applicantName,
  applicantLanguage,
  languageLabel,
  initialMessages,
}: {
  roomId: string;
  token: string;
  applicantName: string;
  applicantLanguage: string;
  languageLabel: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<Attachment[]>([]);
  const [connected, setConnected] = useState(false);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [peerTyping, setPeerTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<ReturnType<typeof createApplicantSocket> | null>(
    null
  );
  const typingRef = useRef<{
    active: boolean;
    resetTimer: ReturnType<typeof setTimeout> | null;
  }>({ active: false, resetTimer: null });
  const peerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 스크롤 자동 하단
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // 소켓 연결
  useEffect(() => {
    const sock = createApplicantSocket(token);
    socketRef.current = sock;

    sock.on("connect", () => {
      setConnected(true);
      sock.emit("chat:subscribe", { roomId }, (res) => {
        if (!res.ok) console.error("[customer] subscribe failed", res.error);
      });
    });
    sock.on("disconnect", () => setConnected(false));
    sock.on("connect_error", (e) => {
      console.error("[customer] connect_error", e.message);
      setConnected(false);
    });

    sock.on("chat:message", (event: ChatMessageEvent) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === event.id)) return prev;
        return [
          ...prev,
          {
            id: event.id,
            senderType: event.senderType,
            type: event.type,
            originalText: event.originalText,
            language: event.language,
            translatedText: event.translatedText,
            attachments: event.attachments
              ? JSON.stringify(event.attachments)
              : null,
            cardType: event.cardType,
            cardPayload: event.cardPayload
              ? JSON.stringify(event.cardPayload)
              : null,
            editedAt: null,
            deletedAt: null,
            createdAt: event.createdAt,
          },
        ];
      });
      // 새 메시지 도착 → typing 자동 해제 + read 신호
      setPeerTyping(false);
      sock.emit("chat:read", { roomId, lastMessageId: event.id });
    });

    sock.on("chat:typing", (data: TypingEvent) => {
      if (data.roomId !== roomId) return;
      // 본인(applicant) 신호는 무시 — 매니저 typing만 표시
      if (data.senderKind !== "manager") return;
      setPeerTyping(data.isTyping);
      if (data.isTyping) {
        if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
        peerTypingTimerRef.current = setTimeout(
          () => setPeerTyping(false),
          4000
        );
      }
    });

    sock.on("chat:message-updated", (data: MessageUpdatedEvent) => {
      if (data.roomId !== roomId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? {
                ...m,
                originalText: data.originalText,
                language: data.language,
                translatedText: data.translatedText,
                editedAt: data.editedAt,
              }
            : m
        )
      );
    });

    sock.on("chat:message-deleted", (data: MessageDeletedEvent) => {
      if (data.roomId !== roomId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? {
                ...m,
                originalText: null,
                translatedText: null,
                attachments: null,
                cardPayload: null,
                deletedAt: data.deletedAt,
              }
            : m
        )
      );
    });

    return () => {
      sock.disconnect();
      socketRef.current = null;
      if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
    };
  }, [roomId, token]);

  // 신청자 typing emit (1.5초 throttle)
  function notifyTyping() {
    const sock = socketRef.current;
    if (!sock || !connected) return;
    const t = typingRef.current;
    if (!t.active) {
      t.active = true;
      sock.emit("chat:typing", { roomId, isTyping: true });
    }
    if (t.resetTimer) clearTimeout(t.resetTimer);
    t.resetTimer = setTimeout(() => {
      sock.emit("chat:typing", { roomId, isTyping: false });
      t.active = false;
    }, 1500);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: fd,
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(`업로드 실패: ${err.error ?? res.status}`);
          continue;
        }
        const { data } = await res.json();
        setPending((p) => [...p, data]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function send() {
    const trimmed = text.trim();
    const hasAttachment = pending.length > 0;
    if ((!trimmed && !hasAttachment) || sending) return;
    const sock = socketRef.current;
    if (!sock) return;

    const type: "TEXT" | "IMAGE" | "FILE" = hasAttachment
      ? pending.every((a) => a.mimeType.startsWith("image/"))
        ? "IMAGE"
        : "FILE"
      : "TEXT";

    setSending(true);
    sock.emit(
      "chat:send",
      {
        roomId,
        type,
        originalText: trimmed,
        language: applicantLanguage,
        attachments: hasAttachment ? pending : undefined,
      },
      (res) => {
        setSending(false);
        if (res.ok) {
          setText("");
          setPending([]);
        } else {
          console.error("[customer] send failed", res.error);
          alert(`전송 실패: ${res.error}`);
        }
      }
    );
  }

  return (
    <div
      className="flex flex-col bg-gray-50"
      style={{ minHeight: "100dvh", height: "100dvh" }}
    >
      {/* 헤더 */}
      <header className="flex shrink-0 items-center gap-2 border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
          <Bot className="h-4 w-4 text-emerald-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">NB Chat 상담</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {applicantName} · {languageLabel}
          </p>
        </div>
        {connected ? (
          <Wifi className="h-4 w-4 text-emerald-500" />
        ) : (
          <WifiOff className="h-4 w-4 text-amber-500" />
        )}
      </header>

      {/* 메시지 영역 */}
      <main className="flex-1 overflow-y-auto px-3 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-xs text-muted-foreground">
              상담을 시작하려면 메시지를 보내주세요.
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {messages.map((m) => {
              if (m.senderType === "SYSTEM" && m.type !== "TEXT") {
                return (
                  <li key={m.id} className="text-center">
                    <span className="rounded-full bg-gray-200 px-3 py-1 text-[11px] text-gray-600">
                      {m.originalText}
                    </span>
                  </li>
                );
              }

              if (m.deletedAt) {
                const right = m.senderType === "APPLICANT";
                return (
                  <li
                    key={m.id}
                    className={`flex ${right ? "justify-end" : "justify-start"}`}
                  >
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-3 py-1.5 text-[11px] italic text-gray-500">
                      삭제된 메시지입니다
                    </div>
                  </li>
                );
              }

              const isMe = m.senderType === "APPLICANT";
              const isBot = m.senderType === "SYSTEM";
              const open = !!showOriginal[m.id];

              // 신청자 POV 표시 정책
              //  - 본인(APPLICANT): originalText
              //  - 매니저/봇: translatedText 우선 (없으면 originalText)
              const primary = isMe
                ? m.originalText
                : m.translatedText ?? m.originalText;
              const secondary = isMe ? null : m.originalText;

              return (
                <li
                  key={m.id}
                  className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                >
                  <div className="flex max-w-[78%] flex-col gap-0.5">
                    {!isMe && (
                      <div className="ml-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        {isBot ? (
                          <Bot className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                        <span>{isBot ? "챗봇" : "상담사"}</span>
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm leading-snug ${
                        isMe
                          ? "rounded-br-sm bg-emerald-500 text-white"
                          : "rounded-bl-sm bg-white text-gray-800 shadow-sm"
                      }`}
                    >
                      {parseAttachments(m.attachments).length > 0 && (
                        <div className="mb-1.5 space-y-1">
                          {parseAttachments(m.attachments).map((a, i) =>
                            a.mimeType.startsWith("image/") ? (
                              <a
                                key={i}
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img
                                  src={a.url}
                                  alt={a.name}
                                  className="max-h-48 max-w-full rounded-md"
                                />
                              </a>
                            ) : (
                              <a
                                key={i}
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] hover:underline ${
                                  isMe
                                    ? "border-white/30 bg-white/10"
                                    : "border-gray-200 bg-gray-50"
                                }`}
                              >
                                📎 <span className="truncate">{a.name}</span>
                              </a>
                            )
                          )}
                        </div>
                      )}
                      {m.type === "CARD" && m.cardType && (() => {
                        const payload = parseCardPayload(m.cardPayload);
                        if (!payload) return null;
                        return (
                          <div className="mb-1">
                            <MessageCard
                              cardType={m.cardType as CardType}
                              payload={payload}
                              onSurface={isMe ? "primary" : "muted"}
                            />
                          </div>
                        );
                      })()}
                      {primary && (
                        <p className="whitespace-pre-wrap">{primary}</p>
                      )}
                      {secondary && primary !== secondary && (
                        <>
                          {open && (
                            <p className="mt-1 border-t border-white/20 pt-1 text-[11px] opacity-70">
                              {secondary}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setShowOriginal((p) => ({
                                ...p,
                                [m.id]: !p[m.id],
                              }))
                            }
                            className={`mt-0.5 text-[10px] underline ${
                              isMe ? "text-white/70" : "text-emerald-600"
                            }`}
                          >
                            {open ? "원문 숨기기" : "원문 보기 (한국어)"}
                          </button>
                        </>
                      )}
                    </div>
                    <span
                      className={`text-[10px] text-muted-foreground ${
                        isMe ? "self-end" : "self-start ml-1"
                      }`}
                    >
                      {new Date(m.createdAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {m.editedAt && (
                        <span className="ml-1 italic opacity-70">(수정됨)</span>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {peerTyping && (
          <div className="mt-2 flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </main>

      {/* 입력창 */}
      <footer
        className="shrink-0 border-t bg-white px-3 py-2"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {pending.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pending.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700"
              >
                {a.mimeType.startsWith("image/") ? (
                  <ImageIcon className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                <span className="max-w-[140px] truncate">{a.name}</span>
                <button
                  onClick={() =>
                    setPending((p) => p.filter((_, j) => j !== i))
                  }
                  className="ml-0.5 hover:text-rose-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!connected || uploading}
            onClick={() => fileRef.current?.click()}
            className="h-11 w-11 shrink-0"
            title="사진/PDF 첨부 (10MB 이하)"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) notifyTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`메시지를 입력하세요 (${languageLabel})`}
            className="min-h-[44px] max-h-[120px] flex-1 resize-none text-sm"
            maxLength={2000}
            disabled={!connected}
          />
          <Button
            onClick={send}
            disabled={
              !connected ||
              sending ||
              (!text.trim() && pending.length === 0)
            }
            size="icon"
            className="h-11 w-11 shrink-0 bg-emerald-500 hover:bg-emerald-600"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}
