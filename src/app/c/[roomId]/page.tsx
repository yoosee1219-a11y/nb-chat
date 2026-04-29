import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signApplicantToken } from "@/lib/auth";
import { LANGUAGE } from "@/lib/constants";
import { CustomerChat } from "./customer-chat";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#10b981",
};

/**
 * 신청자(고객) 모바일 채팅 페이지 — Phase 3.5
 *
 * URL: /c/[roomId]
 *
 * 인증 모델 (MVP):
 *  - roomId(cuid)을 unguessable bearer로 취급
 *  - 페이지 로드 시 서버에서 해당 룸 검증 후 룸-바운드 JWT(24h) 발급
 *  - 클라이언트는 토큰을 메모리에 보관하고 socket.handshake.auth로 전달
 *
 * 추후 강화:
 *  - 매니저가 발급하는 1회용 매직 링크
 *  - 휴대폰 OTP 추가
 *  - 토큰 회전 (refresh)
 */
export default async function CustomerChatPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    include: {
      applicant: {
        select: {
          id: true,
          name: true,
          preferredLanguage: true,
          nationality: true,
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: {
          id: true,
          senderType: true,
          type: true,
          originalText: true,
          language: true,
          translatedText: true,
          attachments: true,
          cardType: true,
          cardPayload: true,
          createdAt: true,
        },
      },
    },
  });
  if (!room) notFound();

  const token = await signApplicantToken({
    roomId: room.id,
    applicantId: room.applicant.id,
    language: room.applicant.preferredLanguage,
  });

  // 신청자 언어 라벨
  const langInfo = LANGUAGE[room.applicant.preferredLanguage];

  return (
    <CustomerChat
      roomId={room.id}
      token={token}
      applicantName={room.applicant.name}
      applicantLanguage={room.applicant.preferredLanguage}
      languageLabel={langInfo?.label ?? room.applicant.preferredLanguage}
      initialMessages={room.messages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
