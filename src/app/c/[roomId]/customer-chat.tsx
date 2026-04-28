"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Bot, User, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createApplicantSocket } from "@/lib/socket-client";
import type { ChatMessageEvent } from "@/lib/socket-types";

type Message = {
  id: string;
  senderType: string;
  type: string;
  originalText: string | null;
  language: string | null;
  translatedText: string | null;
  createdAt: string;
};

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
  const [connected, setConnected] = useState(false);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<ReturnType<typeof createApplicantSocket> | null>(
    null
  );

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
            createdAt: event.createdAt,
          },
        ];
      });
    });

    return () => {
      sock.disconnect();
      socketRef.current = null;
    };
  }, [roomId, token]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const sock = socketRef.current;
    if (!sock) return;

    setSending(true);
    sock.emit(
      "chat:send",
      {
        roomId,
        type: "TEXT",
        originalText: trimmed,
        language: applicantLanguage,
      },
      (res) => {
        setSending(false);
        if (res.ok) {
          setText("");
        } else {
          // 간단한 에러 표시 — 추후 toast로 교체
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
                      <p className="whitespace-pre-wrap">{primary}</p>
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
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
      </main>

      {/* 입력창 */}
      <footer
        className="shrink-0 border-t bg-white px-3 py-2"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
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
            disabled={!connected || sending || !text.trim()}
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
