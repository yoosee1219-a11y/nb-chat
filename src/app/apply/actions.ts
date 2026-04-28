"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

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

type SourceCookie = {
  partnerId: string | null;
  partnerCode: string | null;
  campaign: string | null;
  medium: string | null;
  referrer: string | null;
  landedAt: string | null;
};

function parseSourceCookie(raw: string | undefined): SourceCookie | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return {
      partnerId: j.partnerId ?? null,
      partnerCode: j.partnerCode ?? null,
      campaign: j.campaign ?? null,
      medium: j.medium ?? null,
      referrer: j.referrer ?? null,
      landedAt: j.landedAt ?? null,
    };
  } catch {
    return null;
  }
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
  const source = parseSourceCookie(cookieStore.get("fics_source")?.value);

  // source가 없으면 DIRECT로 폴백
  let sourcePartnerId = source?.partnerId ?? null;
  if (!sourcePartnerId) {
    const direct = await prisma.partner.findUnique({
      where: { code: "DIRECT" },
      select: { id: true },
    });
    sourcePartnerId = direct?.id ?? null;
  }

  // appliedPlanId 검증
  let appliedPlanId: string | null = null;
  if (input.appliedPlanId) {
    const plan = await prisma.plan.findUnique({
      where: { id: input.appliedPlanId },
      select: { id: true, isActive: true },
    });
    if (plan && plan.isActive) appliedPlanId = plan.id;
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
        sourcePartnerId,
        sourceCampaign: source?.campaign ?? null,
        sourceMedium: source?.medium ?? null,
        sourceReferrer: source?.referrer ?? null,
        sourceLandedAt: source?.landedAt ? new Date(source.landedAt) : null,
      },
    });
    const room = await tx.chatRoom.create({
      data: {
        applicantId: applicant.id,
      },
    });
    return { applicant, room };
  });

  // 추적 쿠키는 가입 완료 후 정리 (다음 유입을 깨끗하게)
  cookieStore.delete("fics_source");

  redirect(`/c/${result.room.id}`);
}
