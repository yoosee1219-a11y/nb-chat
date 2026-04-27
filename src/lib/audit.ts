import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";

/**
 * 감사 로그 헬퍼
 * Vijob엔 없는 우리만의 강점 — 모든 매니저 액션 기록
 * PIPA 컴플라이언스 + 사고 추적 근거
 */
export async function audit(input: {
  managerId: string;
  action: string;
  resource: string;
  metadata?: Record<string, unknown>;
}) {
  const h = await headers();
  await prisma.auditLog.create({
    data: {
      managerId: input.managerId,
      action: input.action,
      resource: input.resource,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      ipAddress:
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null,
      userAgent: h.get("user-agent") ?? null,
    },
  });
}
