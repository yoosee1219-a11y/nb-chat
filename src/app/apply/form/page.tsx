import type { Viewport } from "next";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ApplyForm } from "./apply-form";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#10b981",
};

/**
 * 자가 가입 신청 랜딩 — Phase 5.2
 * 외국인 신청자가 직접 정보 입력 후 채팅으로 이어짐.
 * /r/[code] 진입자는 fics_source 쿠키로 source 자동 첨부됨.
 */
export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const sourceRaw = cookieStore.get("fics_source")?.value;

  // 활성 요금제 목록 (자가 선택용)
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { monthlyFee: "asc" },
    select: {
      id: true,
      name: true,
      carrier: true,
      monthlyFee: true,
      dataAllowance: true,
      voiceMinutes: true,
      smsCount: true,
      commitment: true,
    },
  });

  // 진입 거래처 라벨 (디버그/투명성용)
  let fromLabel: string | null = null;
  if (sp.from) {
    const partner = await prisma.partner.findUnique({
      where: { code: sp.from },
      select: { name: true, code: true },
    });
    fromLabel =
      partner?.code === "DIRECT" ? "자체광고" : (partner?.name ?? null);
  }

  return <ApplyForm plans={plans} hasSource={!!sourceRaw} fromLabel={fromLabel} />;
}
