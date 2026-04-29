"use client";

import { useState, useEffect, useRef } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronUp, Check, CheckCheck, Languages, Loader2, Pencil, Trash2, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LANGUAGE } from "@/lib/constants";
import type {
  CardType,
  TypingEvent,
  MessageUpdatedEvent,
  MessageDeletedEvent,
} from "@/lib/socket-types";
import { MessageCard, parseCardPayload } from "./message-card";
import { useChatSocket } from "./use-socket";

type MessageItem = {
  id: string;
  senderType: string;
  senderId: string | null;
  type: string;
  originalText: string | null;
  language: string | null;
  translatedText: string | null;
  attachments: string | null; // JSON 직렬화
  cardType: string | null;
  cardPayload: string | null; // JSON 직렬화
  isRead: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
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
  messages: initialMessages,
  applicantName,
  currentManagerId,
  hasMoreMessages = false,
}: {
  roomId: string;
  messages: MessageItem[];
  applicantName: string;
  currentManagerId: string;
  hasMoreMessages?: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [peerTyping, setPeerTyping] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  // 추가 로드된 과거 메시지 (initialMessages 앞에 prepend)
  const [olderMessages, setOlderMessages] = useState<MessageItem[]>([]);
  const [hasMore, setHasMore] = useState(hasMoreMessages);
  const [loadingMore, setLoadingMore] = useState(false);
  // edit/delete 즉시 반영 위해 local state로 messages 관리
  const [localOverrides, setLocalOverrides] = useState<
    Record<
      string,
      Partial<Pick<MessageItem, "originalText" | "translatedText" | "editedAt" | "deletedAt">>
    >
  >({});

  // 룸 변경 시 reset
  useEffect(() => {
    setOlderMessages([]);
    setHasMore(hasMoreMessages);
    setLocalOverrides({});
  }, [roomId, hasMoreMessages]);

  // 서버에서 새 메시지 props가 오면 overrides는 리셋 (서버가 진실)
  useEffect(() => {
    setLocalOverrides({});
  }, [initialMessages]);

  // overrides 적용된 messages = older + initial 순서
  const allMessages = [...olderMessages, ...initialMessages];
  const messages = allMessages.map((m) => {
    const o = localOverrides[m.id];
    if (!o) return m;
    return { ...m, ...o };
  });

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    const cursor = messages[0]?.createdAt;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const cursorIso =
        cursor instanceof Date ? cursor.toISOString() : new Date(cursor).toISOString();
      const res = await fetch(
        `/api/messages?roomId=${encodeURIComponent(roomId)}&before=${encodeURIComponent(cursorIso)}&limit=50`
      );
      if (!res.ok) {
        toast.error("이전 메시지 로드 실패");
        return;
      }
      const data = await res.json();
      const fetched: MessageItem[] = data.messages.map((m: Record<string, unknown>) => ({
        ...m,
        createdAt: new Date(m.createdAt as string),
        editedAt: m.editedAt ? new Date(m.editedAt as string) : null,
        deletedAt: m.deletedAt ? new Date(m.deletedAt as string) : null,
      })) as MessageItem[];
      // dedupe — initial/older/socket으로 들어온 메시지와 id 충돌 방지
      const existingIds = new Set([
        ...olderMessages.map((m) => m.id),
        ...initialMessages.map((m) => m.id),
      ]);
      const deduped = fetched.filter((m) => !existingIds.has(m.id));
      setOlderMessages((prev) => [...deduped, ...prev]);
      setHasMore(!!data.hasMore);
    } catch (e) {
      console.error("[loadMore]", e);
      toast.error("이전 메시지 로드 실패");
    } finally {
      setLoadingMore(false);
    }
  }

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

    // edit/delete 이벤트 수신 → local override 즉시 반영
    const onUpdated = (data: MessageUpdatedEvent) => {
      if (data.roomId !== roomId) return;
      setLocalOverrides((prev) => ({
        ...prev,
        [data.messageId]: {
          ...prev[data.messageId],
          originalText: data.originalText,
          translatedText: data.translatedText,
          editedAt: new Date(data.editedAt),
        },
      }));
    };
    const onDeleted = (data: MessageDeletedEvent) => {
      if (data.roomId !== roomId) return;
      setLocalOverrides((prev) => ({
        ...prev,
        [data.messageId]: {
          ...prev[data.messageId],
          originalText: null,
          translatedText: null,
          deletedAt: new Date(data.deletedAt),
        },
      }));
    };
    socket.on("chat:message-updated", onUpdated);
    socket.on("chat:message-deleted", onDeleted);

    return () => {
      socket.off("chat:typing", onTyping);
      socket.off("chat:message-updated", onUpdated);
      socket.off("chat:message-deleted", onDeleted);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [roomId, socket]);

  function startEdit(m: MessageItem) {
    setEditingId(m.id);
    setEditingText(m.originalText ?? "");
  }
  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
  }
  function saveEdit(messageId: string) {
    const text = editingText.trim();
    if (!text) {
      toast.error("내용을 입력하세요.");
      return;
    }
    socket.emit(
      "chat:edit",
      { roomId, messageId, originalText: text, language: "KO_KR" },
      (res) => {
        if (res.ok) {
          cancelEdit();
        } else {
          toast.error(`수정 실패: ${res.error}`);
        }
      }
    );
  }
  function deleteMsg(messageId: string) {
    if (!confirm("이 메시지를 삭제하시겠습니까? 신청자에게도 삭제 표시됩니다."))
      return;
    socket.emit("chat:delete", { roomId, messageId }, (res) => {
      if (!res.ok) toast.error(`삭제 실패: ${res.error}`);
    });
  }

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
        {hasMore && (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
              className="h-7 text-xs"
            >
              {loadingMore ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <ChevronUp className="mr-1.5 h-3 w-3" />
              )}
              이전 메시지 더보기
            </Button>
          </div>
        )}
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

          // 삭제된 메시지 — placeholder
          if (m.deletedAt) {
            const isManagerSide = m.senderType === "MANAGER";
            return (
              <div
                key={m.id}
                className={`flex ${isManagerSide ? "justify-end" : "justify-start"}`}
              >
                <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-1.5 text-xs italic text-muted-foreground">
                  삭제된 메시지입니다
                </div>
              </div>
            );
          }

          const isManager = m.senderType === "MANAGER";
          const isOwnMessage = isManager && m.senderId === currentManagerId;
          const isEditingThis = editingId === m.id;
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
                  {isEditingThis ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        rows={3}
                        maxLength={4000}
                        className="bg-background text-foreground"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEdit}
                          className="h-6 px-2 text-[10px]"
                        >
                          취소
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveEdit(m.id)}
                          className="h-6 px-2 text-[10px]"
                        >
                          저장
                        </Button>
                      </div>
                    </div>
                  ) : (
                    (primary || secondary) && (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {primary ?? secondary}
                      </p>
                    )
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
                  {m.editedAt && (
                    <span className="italic opacity-60" title={`수정: ${format(m.editedAt, "yyyy.MM.dd HH:mm:ss")}`}>
                      (수정됨)
                    </span>
                  )}
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
                  {isOwnMessage && !isEditingThis && (
                    <>
                      {m.type === "TEXT" && (
                        <button
                          type="button"
                          onClick={() => startEdit(m)}
                          title="수정"
                          className="opacity-50 hover:opacity-100"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteMsg(m.id)}
                        title="삭제"
                        className="opacity-50 hover:text-destructive hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  {isEditingThis && (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      title="편집 취소"
                      className="opacity-50 hover:opacity-100"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
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
