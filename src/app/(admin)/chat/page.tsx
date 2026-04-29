import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle, PanelRightOpen, PanelRightClose, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  CONSULTATION_STATUS,
  LANGUAGE,
  NATIONALITY,
  type ConsultationStatus,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RoomList } from "./room-list";
import { MessagePanel } from "./message-panel";
import { MessageInput } from "./message-input";
import { ApplicantSidePanel } from "./applicant-side-panel";
import { MarkReadEffect } from "./mark-read-effect";
import { RealtimeBridge } from "./realtime-bridge";
import { assignRoomToMe } from "./actions";

const ROOM_LIST_LIMIT = 100;

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ roomId?: string; panel?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { roomId: roomIdParam, panel } = await searchParams;
  const sidePanelOpen = panel !== "off";

  // ───── 좌측: 룸 리스트 ─────
  const rawRooms = await prisma.chatRoom.findMany({
    take: ROOM_LIST_LIMIT,
    orderBy: [
      { isFavorite: "desc" },
      { lastMessageAt: { sort: "desc", nulls: "last" } },
    ],
    include: {
      applicant: {
        select: {
          id: true,
          name: true,
          nationality: true,
          preferredLanguage: true,
          status: true,
        },
      },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          senderType: true,
          originalText: true,
          translatedText: true,
        },
      },
    },
  });

  const roomItems = rawRooms.map((r) => {
    const last = r.messages[0];
    // 매니저 시점 한국어 미리보기:
    //  - 매니저 메시지: originalText (KO)
    //  - 신청자 메시지: translatedText (KO) → 없으면 originalText
    //  - SYSTEM: originalText
    const preview = last
      ? last.senderType === "MANAGER"
        ? last.originalText
        : last.translatedText ?? last.originalText
      : null;

    return {
      id: r.id,
      isFavorite: r.isFavorite,
      unreadCount: r.unreadCount,
      lastMessageAt: r.lastMessageAt,
      managerId: r.managerId,
      applicant: r.applicant,
      lastPreview: preview,
    };
  });

  // ───── 중앙/우측: 선택된 룸 ─────
  const selectedRoomId =
    roomIdParam ?? roomItems[0]?.id ?? null;

  // 초기 50개 메시지만 (최신순으로 take 후 reverse) — Phase 5.8 lazy load
  const MESSAGE_PAGE_SIZE = 50;
  const selectedRoom = selectedRoomId
    ? await prisma.chatRoom.findUnique({
        where: { id: selectedRoomId },
        include: {
          applicant: { include: { appliedPlan: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: MESSAGE_PAGE_SIZE,
          },
        },
      })
    : null;
  // RSC로 가져온 messages는 desc → 화면은 asc 필요
  const orderedMessages = selectedRoom
    ? [...selectedRoom.messages].reverse()
    : [];
  // 다음 페이지 존재 여부 — 정확히 PAGE_SIZE만큼 가져왔으면 더 있을 가능성
  const hasMoreMessages = selectedRoom
    ? selectedRoom.messages.length === MESSAGE_PAGE_SIZE
    : false;

  // ───── 렌더 ─────
  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-1">
      {/* 좌측: 룸 리스트 */}
      <div className="w-80 shrink-0">
        <RoomList
          rooms={roomItems}
          selectedRoomId={selectedRoomId}
          currentManagerId={session.managerId}
        />
      </div>

      {/* 중앙: 메시지 영역 */}
      <div className="flex min-w-0 flex-1 flex-col bg-muted/20">
        {selectedRoom ? (
          <SelectedRoomView
            session={session}
            sidePanelOpen={sidePanelOpen}
            selectedRoomId={selectedRoom.id}
            unreadCount={selectedRoom.unreadCount}
            isAssignedToMe={selectedRoom.managerId === session.managerId}
            isUnassigned={selectedRoom.managerId === null}
            applicant={selectedRoom.applicant}
            messages={orderedMessages}
            hasMoreMessages={hasMoreMessages}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      {/* 우측: 사이드 패널 */}
      {sidePanelOpen && selectedRoom && (
        <div className="hidden w-80 shrink-0 lg:block">
          <ApplicantSidePanel
            applicant={selectedRoom.applicant}
            appliedPlan={selectedRoom.applicant.appliedPlan}
            roomId={selectedRoom.id}
          />
        </div>
      )}
    </div>
  );
}

function SelectedRoomView({
  session,
  sidePanelOpen,
  selectedRoomId,
  unreadCount,
  isAssignedToMe,
  isUnassigned,
  applicant,
  messages,
  hasMoreMessages,
}: {
  session: { managerId: string };
  sidePanelOpen: boolean;
  selectedRoomId: string;
  unreadCount: number;
  isAssignedToMe: boolean;
  isUnassigned: boolean;
  hasMoreMessages: boolean;
  applicant: {
    id: string;
    name: string;
    nationality: string;
    preferredLanguage: string;
    status: string;
  };
  messages: Array<{
    id: string;
    senderType: string;
    senderId: string | null;
    type: string;
    originalText: string | null;
    language: string | null;
    translatedText: string | null;
    attachments: string | null;
    cardType: string | null;
    cardPayload: string | null;
    isRead: boolean;
    editedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
  }>;
}) {
  const nat = NATIONALITY[applicant.nationality];
  const lang = LANGUAGE[applicant.preferredLanguage];
  const status =
    CONSULTATION_STATUS[applicant.status as ConsultationStatus];

  async function assign() {
    "use server";
    await assignRoomToMe(selectedRoomId);
  }

  return (
    <>
      <RealtimeBridge roomId={selectedRoomId} />
      <MarkReadEffect roomId={selectedRoomId} unreadCount={unreadCount} />

      {/* 헤더 */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
        <span className="text-lg">{nat?.flag}</span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{applicant.name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {nat?.label} · {lang?.label}
            {status && (
              <Badge
                variant="outline"
                className={`${status.className} ml-2 h-4 px-1.5 text-[10px]`}
              >
                {status.label}
              </Badge>
            )}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isUnassigned && (
            <form action={assign}>
              <Button type="submit" size="sm" variant="outline">
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                내가 담당
              </Button>
            </form>
          )}
          {isAssignedToMe && (
            <Badge variant="secondary" className="h-6 text-xs">
              내 담당
            </Badge>
          )}
          <Button variant="ghost" size="icon" asChild title="사이드 패널 토글">
            <Link
              href={{
                pathname: "/chat",
                query: {
                  roomId: selectedRoomId,
                  ...(sidePanelOpen ? { panel: "off" } : {}),
                },
              }}
            >
              {sidePanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Link>
          </Button>
        </div>
      </header>

      {/* 메시지 패널 */}
      <div className="min-h-0 flex-1">
        <MessagePanel
          roomId={selectedRoomId}
          messages={messages}
          applicantName={applicant.name}
          currentManagerId={session.managerId}
          hasMoreMessages={hasMoreMessages}
        />
      </div>

      {/* 입력창 */}
      <MessageInput
        roomId={selectedRoomId}
        applicantLanguageLabel={lang?.label ?? "신청자 언어"}
      />
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <MessageCircle className="h-12 w-12 opacity-30" />
      <div>
        <p className="text-sm font-medium">채팅방을 선택하세요</p>
        <p className="mt-1 text-xs">왼쪽 목록에서 신청자와의 대화를 선택할 수 있습니다.</p>
      </div>
    </div>
  );
}
