"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canMutate } from "@/lib/permissions";

export type PartnerInput = {
  code: string;
  name: string;
  contact?: string;
  memo?: string;
  isActive?: boolean;
};

const RESERVED_CODES = ["DIRECT"]; // 시스템 예약 — 자체광고

const CODE_RE = /^[a-zA-Z0-9_-]{2,32}$/;

function validate(input: PartnerInput, options?: { allowReserved?: boolean }) {
  if (!input.name.trim()) return "거래처명을 입력해주세요.";
  if (!input.code.trim()) return "코드가 비어 있습니다.";
  if (!CODE_RE.test(input.code))
    return "코드는 영문/숫자/-/_ 조합 2~32자만 허용됩니다.";
  if (
    !options?.allowReserved &&
    RESERVED_CODES.includes(input.code.toUpperCase())
  ) {
    return `'${input.code}'는 시스템 예약 코드입니다.`;
  }
  return null;
}

/**
 * 자동 생성 코드 — 짧고 알아보기 좋게.
 * 예: p-3k9a, p-7w2b
 */
function generateCode(): string {
  const charset = "abcdefghjkmnpqrstuvwxyz23456789"; // 혼동되는 0/O/1/l/i 제외
  const rnd = Array.from({ length: 4 }, () =>
    charset[Math.floor(Math.random() * charset.length)]
  ).join("");
  return `p-${rnd}`;
}

export async function suggestPartnerCode(): Promise<string> {
  await requireSession();
  // 충돌 안 나는 코드 찾기 (보통 1번에 끝)
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const exists = await prisma.partner.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  // 5번 충돌 — 해시로 폴백 (사실상 도달 안 함)
  return `p-${Date.now().toString(36).slice(-5)}`;
}

export async function createPartner(input: PartnerInput) {
  const session = await requireSession();
  if (!canMutate(session)) return { ok: false, error: "VIEWER 권한은 거래처를 추가할 수 없습니다." };
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const code = input.code.trim();

  // 중복 체크
  const dup = await prisma.partner.findUnique({
    where: { code },
    select: { id: true },
  });
  if (dup) return { ok: false, error: `코드 '${code}'는 이미 사용 중입니다.` };

  const partner = await prisma.partner.create({
    data: {
      code,
      name: input.name.trim(),
      contact: input.contact?.trim() || null,
      memo: input.memo?.trim() || null,
      isActive: input.isActive ?? true,
    },
  });

  await audit({
    managerId: session.managerId,
    action: "PARTNER_CREATED",
    resource: `partner:${partner.id}`,
    metadata: { code: partner.code, name: partner.name },
  });

  revalidatePath("/partners");
  return { ok: true };
}

export async function updatePartner(id: string, input: PartnerInput) {
  const session = await requireSession();
  if (!canMutate(session)) return { ok: false, error: "VIEWER 권한은 거래처를 수정할 수 없습니다." };

  const exists = await prisma.partner.findUnique({ where: { id } });
  if (!exists) return { ok: false, error: "거래처를 찾을 수 없습니다." };

  // DIRECT는 코드 변경 금지, name은 허용
  const isDirect = exists.code === "DIRECT";
  const err = validate(input, { allowReserved: isDirect });
  if (err) return { ok: false, error: err };

  const code = input.code.trim();
  if (isDirect && code !== "DIRECT") {
    return {
      ok: false,
      error: "DIRECT 거래처의 코드는 변경할 수 없습니다.",
    };
  }

  // 코드 변경 시 중복 체크
  if (code !== exists.code) {
    const dup = await prisma.partner.findUnique({
      where: { code },
      select: { id: true },
    });
    if (dup) return { ok: false, error: `코드 '${code}'는 이미 사용 중입니다.` };
  }

  await prisma.partner.update({
    where: { id },
    data: {
      code,
      name: input.name.trim(),
      contact: input.contact?.trim() || null,
      memo: input.memo?.trim() || null,
      isActive: input.isActive ?? true,
    },
  });

  await audit({
    managerId: session.managerId,
    action: "PARTNER_UPDATED",
    resource: `partner:${id}`,
    metadata: { code, name: input.name },
  });

  revalidatePath("/partners");
  return { ok: true };
}

export async function deletePartner(id: string) {
  const session = await requireSession();
  if (!canMutate(session)) return { ok: false, error: "VIEWER 권한은 거래처를 삭제할 수 없습니다." };

  const exists = await prisma.partner.findUnique({ where: { id } });
  if (!exists) return { ok: false, error: "거래처를 찾을 수 없습니다." };
  if (exists.code === "DIRECT")
    return { ok: false, error: "DIRECT 거래처는 삭제할 수 없습니다." };

  // 신청자가 묶여 있으면 비활성화로 폴백 (히스토리 보존)
  const usedBy = await prisma.applicant.count({
    where: { sourcePartnerId: id },
  });
  if (usedBy > 0) {
    await prisma.partner.update({
      where: { id },
      data: { isActive: false },
    });
    await audit({
      managerId: session.managerId,
      action: "PARTNER_UPDATED",
      resource: `partner:${id}`,
      metadata: { reason: "soft-delete (in use)", usedBy },
    });
    revalidatePath("/partners");
    return {
      ok: true,
      softDeleted: true,
      message: `${usedBy}명이 묶여 있어 비활성화 처리됨`,
    };
  }

  await prisma.partner.delete({ where: { id } });

  await audit({
    managerId: session.managerId,
    action: "PARTNER_DELETED",
    resource: `partner:${id}`,
    metadata: { code: exists.code },
  });

  revalidatePath("/partners");
  return { ok: true };
}
