"use client";

import { useState, useEffect, useRef } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Check, CheckCheck, Languages } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LANGUAGE } from "@/lib/constants";
import type { CardType, TypingEvent } from "@/lib/socket-types";
import { MessageCard, parseCardPayload } from "./message-card";
import { useChatSocket } from "./use-socket";

type MessageItem = {
  id: string;
  senderType: string;
  type: string;
  originalText: string | null;
  language: string | null;
  translatedText: string | null;
  attachments: string | null; // JSON 직렬화
  cardType: string | null;
  cardPayload: string | null; // JSON 직렬화
  isRead: boolean;
  createdAt: Date;
};

type ParsedAttachment = {
  url: string;
  name: string;
  size: number;
  mimeType: string;
};

function parseAttachments(raw: string | null): ParsedAttachment[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * 매니저(한국어) 시점 메시지 패널.
 * - 신청자 메시지: 번역(KO) 우선 표시 + 원문 토글
 * - 매니저 메시지: 한국어 원문 표시 + 신청자 언어 번역 토글 (참고용)
 * - SYSTEM 메시지: 가운데 정렬, 회색
 */
export function MessagePanel({
  roomId,
  messages,
  applicantName,
}: {
  roomId: string;
  messages: MessageItem[];
  applicantName: string;
}) {
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [peerTyping, setPeerTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // 새 메시지 도착 시 자동 스크롤 (sentinel into view)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length]);

  // 새 메시지 도착 → typing은 자동 해제
  useEffect(() => {
    setPeerTyping(false);
  }, [messages.length]);

  // 상대방 typing 이벤트 구독 — applicant가 입력 중일 때만 표시
  // (RealtimeBridge가 룸 subscribe를 이미 함)
  const { socket } = useChatSocket();
  useEffect(() => {
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    const onTyping = (data: TypingEvent) => {
      if (data.roomId !== roomId) return;
      if (data.senderKind !== "applicant") return;
      setPeerTyping(data.isTyping);
      if (data.isTyping) {
        if (resetTimer) clearTimeout(resetTimer);
        // 4초 동안 후속 typing 신호 없으면 자동 해제
        resetTimer = setTimeout(() => setPeerTyping(false), 4000);
      }
    };
    socket.on("chat:typing", onTyping);
    return () => {
      socket.off("chat:typing", onTyping);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [roomId, socket]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        메시지가 없습니다.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-4">
        {messages.map((m) => {
          if (m.senderType === "SYSTEM") {
            return (
              <div key={m.id} className="text-center">
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {m.originalText}
                </span>
              </div>
            );
          }

          const isManager = m.senderType === "MANAGER";
          const lang = m.language ? LANGUAGE[m.language] : null;
          const open = !!showOriginal[m.id];

          // 매니저 시점에서 표시할 본문:
          //  - 신청자 메시지: translatedText(KO) 우선, 토글 시 originalText
          //  - 매니저 메시지: originalText(KO) 그대로, 토글 시 translatedText (참고용)
          const primary = isManager ? m.originalText : m.translatedText;
          const secondary = isManager ? m.translatedText : m.originalText;
          const secondaryLang = !isManager ? lang : null;

          return (
            <div
              key={m.id}
              className={`flex ${isManager ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[75%] ${isManager ? "items-end" : "items-start"} flex flex-col gap-1`}>
                <div
                  className={`rounded-2xl px-3.5 py-2 ${
                    isManager
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {parseAttachments(m.attachments).length > 0 && (
                    <div className="mb-2 space-y-1.5">
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
                              className="max-h-60 max-w-full rounded-md border"
                            />
                          </a>
                        ) : (
                          <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs hover:underline ${
                              isManager
                                ? "border-primary-foreground/30 bg-primary-foreground/10"
                                : "border-border bg-background"
                            }`}
                          >
                            📎 <span className="truncate">{a.name}</span>
                            <span className="opacity-60">
                              ({Math.round(a.size / 1024)}KB)
                            </span>
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
                          onSurface={isManager ? "primary" : "muted"}
                        />
                      </div>
                    );
                  })()}
                  {(primary || secondary) && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {primary ?? secondary}
                    </p>
                  )}

                  {open && secondary && (
                    <div
                      className={`mt-2 border-t pt-2 text-xs ${
                        isManager
                          ? "border-primary-foreground/30 opacity-90"
                          : "border-border opacity-80"
                      }`}
                    >
                      {!isManager && secondaryLang && (
                        <span className="mr-1 font-mono text-[10px] opacity-70">
                          [{secondaryLang.bcp47}]
                        </span>
                      )}
                      <span className="whitespace-pre-wrap">{secondary}</span>
                    </div>
                  )}
                </div>

                <div
                  className={`flex items-center gap-2 px-1 text-[10px] text-muted-foreground ${
                    isManager ? "flex-row-reverse" : ""
                  }`}
                >
                  <span title={format(m.createdAt, "yyyy.MM.dd HH:mm:ss")}>
                    {formatDistanceToNow(m.createdAt, {
                      addSuffix: true,
                      locale: ko,
                    })}
                  </span>
                  {isManager ? (
                    <Badge variant="outline" className="h-4 px-1 text-[9px]">
                      나
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="h-4 px-1 text-[9px]">
                      {applicantName}
                    </Badge>
                  )}
                  {isManager && (
                    <span
                      title={m.isRead ? "읽음" : "전송됨"}
                      className={m.isRead ? "text-blue-500" : "opacity-60"}
                    >
                      {m.isRead ? (
                        <CheckCheck className="h-3 w-3" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </span>
                  )}
                  {secondary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setShowOriginal((prev) => ({
                          ...prev,
                          [m.id]: !prev[m.id],
                        }))
                      }
                      className="h-5 px-1.5 text-[10px]"
                    >
                      <Languages className="mr-1 h-3 w-3" />
                      {open ? "닫기" : isManager ? "번역" : "원문"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {peerTyping && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-muted px-3.5 py-2">
              <div className="flex items-center gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-foreground/60 [animation-delay:0ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-foreground/60 [animation-delay:150ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-foreground/60 [animation-delay:300ms]" />
                <span className="ml-2 text-[10px] text-muted-foreground">
                  {applicantName} 입력 중…
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
