"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  verifySourceCookie,
  type SourcePayload,
} from "@/lib/source-cookie";
import { translateForPeer } from "@/lib/translation";

export type ApplyInput = {
  name: string;
  nationality: string;
  preferredLanguage: string;
  phone?: string;
  email?: string;
  visa?: string;
  appliedPlanId?: string;
  privacyConsent: boolean;
  thirdPartyConsent: boolean;
};

async function resolvePartnerId(source: SourcePayload | null): Promise<string | null> {
  if (source?.partnerId) {
    const validated = await prisma.partner.findUnique({
      where: { id: source.partnerId },
      select: { id: true, isActive: true },
    });
    if (validated?.isActive) return validated.id;
  }
  if (source?.partnerCode) {
    const validated = await prisma.partner.findUnique({
      where: { code: source.partnerCode },
      select: { id: true, isActive: true },
    });
    if (validated?.isActive) return validated.id;
  }
  return null;
}

export async function submitApplication(input: ApplyInput) {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "이름을 입력해주세요." };
  if (!input.nationality) return { ok: false, error: "국적을 선택해주세요." };
  if (!input.preferredLanguage)
    return { ok: false, error: "사용 언어를 선택해주세요." };
  if (!input.privacyConsent)
    return { ok: false, error: "개인정보 수집 동의가 필요합니다." };

  const cookieStore = await cookies();
  // HMAC 서명 검증 — 변조된 쿠키는 null 반환 → DIRECT 폴백
  const sourceLast = verifySourceCookie(cookieStore.get("fics_source")?.value);
  const sourceFirst = verifySourceCookie(
    cookieStore.get("fics_source_first")?.value
  );

  // 서버 재검증 — 쿠키는 클라 변조 가능
  let lastPartnerId = await resolvePartnerId(sourceLast);
  let firstPartnerId = await resolvePartnerId(sourceFirst);

  // last-touch 폴백 → DIRECT
  if (!lastPartnerId) {
    const direct = await prisma.partner.findUnique({
      where: { code: "DIRECT" },
      select: { id: true },
    });
    lastPartnerId = direct?.id ?? null;
  }
  // first-touch가 없으면 last-touch와 동일 (직진 가입자)
  if (!firstPartnerId) firstPartnerId = lastPartnerId;

  // 길이 제한 — DB 저장 안전망
  const trim = (v: string | null | undefined, max = 200) =>
    v ? v.slice(0, max) : null;

  // appliedPlanId 검증
  let appliedPlanId: string | null = null;
  if (input.appliedPlanId) {
    const plan = await prisma.plan.findUnique({
      where: { id: input.appliedPlanId },
      select: { id: true, isActive: true },
    });
    if (plan && plan.isActive) appliedPlanId = plan.id;
  }

  // 자동 환영 메시지 — 가입 완료 즉시 채팅방에 표시 (빈 화면 방지)
  const welcomeKo = `${name}님, 환영합니다! 외국인 통신사 가입 상담을 도와드립니다. 궁금한 점을 한국어 또는 모국어로 자유롭게 입력해주세요. 자동으로 번역되어 상담사에게 전달됩니다.`;
  // 신청자 언어로 미리 번역 — 트랜잭션 밖에서 (장시간 외부 API 호출 안전)
  let welcomeTranslated: string | null = null;
  try {
    const r = await translateForPeer(
      welcomeKo,
      "KO_KR",
      input.preferredLanguage
    );
    welcomeTranslated = r.translatedText;
  } catch (e) {
    console.error("[apply] welcome translate 실패", e);
    // 번역 실패해도 가입은 진행 — 원본만 저장
  }

  const result = await prisma.$transaction(async (tx) => {
    const applicant = await tx.applicant.create({
      data: {
        name,
        nationality: input.nationality,
        preferredLanguage: input.preferredLanguage,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        visa: input.visa?.trim() || null,
        privacyConsent: true,
        thirdPartyConsent: !!input.thirdPartyConsent,
        status: "PENDING",
        appliedPlanId,
        // last-touch
        sourcePartnerId: lastPartnerId,
        sourceCampaign: trim(sourceLast?.campaign, 100),
        sourceMedium: trim(sourceLast?.medium, 50),
        sourceReferrer: trim(sourceLast?.referrer, 500),
        sourceLandedAt: sourceLast?.landedAt
          ? new Date(sourceLast.landedAt)
          : null,
        // first-touch
        firstTouchPartnerId: firstPartnerId,
        firstTouchCampaign: trim(sourceFirst?.campaign ?? sourceLast?.campaign, 100),
        firstTouchMedium: trim(sourceFirst?.medium ?? sourceLast?.medium, 50),
        firstTouchLandedAt: sourceFirst?.landedAt
          ? new Date(sourceFirst.landedAt)
          : sourceLast?.landedAt
            ? new Date(sourceLast.landedAt)
            : null,
      },
    });
    const room = await tx.chatRoom.create({
      data: {
        applicantId: applicant.id,
        // 첫 메시지로 인해 lastMessageAt 즉시 set
        lastMessageAt: new Date(),
      },
    });
    // 자동 환영 시스템 메시지 — Phase 5.10
    await tx.message.create({
      data: {
        roomId: room.id,
        senderType: "SYSTEM",
        senderId: null,
        type: "TEXT",
        originalText: welcomeKo,
        language: "KO_KR",
        translatedText: welcomeTranslated,
        isRead: false,
      },
    });
    return { applicant, room };
  });

  // last-touch 쿠키만 정리 (다음 유입 캠페인을 깨끗하게)
  // first-touch 쿠키는 유지 — 같은 사람이 재방문/재가입 시에도 첫 채널 추적
  cookieStore.delete("fics_source");

  redirect(`/c/${result.room.id}`);
}
