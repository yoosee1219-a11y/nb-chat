"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CARRIER, type Carrier } from "@/lib/constants";

export type PlanInput = {
  name: string;
  carrier: Carrier;
  monthlyFee: number;
  dataAllowance?: string;
  voiceMinutes?: string;
  smsCount?: string;
  description?: string;
  isActive?: boolean;
};

function validate(input: PlanInput) {
  if (!input.name.trim()) return "요금제명을 입력해주세요.";
  if (!CARRIER.includes(input.carrier)) return "유효하지 않은 통신사입니다.";
  if (!Number.isInteger(input.monthlyFee) || input.monthlyFee < 0)
    return "월 요금은 0 이상의 정수여야 합니다.";
  return null;
}

export async function createPlan(input: PlanInput) {
  const session = await requireSession();
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const plan = await prisma.plan.create({
    data: {
      name: input.name.trim(),
      carrier: input.carrier,
      monthlyFee: input.monthlyFee,
      dataAllowance: input.dataAllowance?.trim() || null,
      voiceMinutes: input.voiceMinutes?.trim() || null,
      smsCount: input.smsCount?.trim() || null,
      description: input.description?.trim() || null,
      isActive: input.isActive ?? true,
    },
  });

  await audit({
    managerId: session.managerId,
    action: "PLAN_CREATED",
    resource: `plan:${plan.id}`,
    metadata: { name: plan.name, carrier: plan.carrier, monthlyFee: plan.monthlyFee },
  });

  revalidatePath("/plans");
  return { ok: true };
}

export async function updatePlan(id: string, input: PlanInput) {
  const session = await requireSession();
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const exists = await prisma.plan.findUnique({ where: { id } });
  if (!exists) return { ok: false, error: "요금제를 찾을 수 없습니다." };

  await prisma.plan.update({
    where: { id },
    data: {
      name: input.name.trim(),
      carrier: input.carrier,
      monthlyFee: input.monthlyFee,
      dataAllowance: input.dataAllowance?.trim() || null,
      voiceMinutes: input.voiceMinutes?.trim() || null,
      smsCount: input.smsCount?.trim() || null,
      description: input.description?.trim() || null,
      isActive: input.isActive ?? true,
    },
  });

  await audit({
    managerId: session.managerId,
    action: "PLAN_UPDATED",
    resource: `plan:${id}`,
    metadata: { name: input.name },
  });

  revalidatePath("/plans");
  return { ok: true };
}

export async function deletePlan(id: string) {
  const session = await requireSession();

  // 사용 중인 요금제는 삭제 대신 비활성화
  const usedBy = await prisma.applicant.count({
    where: { appliedPlanId: id },
  });
  if (usedBy > 0) {
    await prisma.plan.update({
      where: { id },
      data: { isActive: false },
    });
    await audit({
      managerId: session.managerId,
      action: "PLAN_UPDATED",
      resource: `plan:${id}`,
      metadata: { reason: "soft-delete (in use)", usedBy },
    });
    revalidatePath("/plans");
    return {
      ok: true,
      softDeleted: true,
      message: `${usedBy}명이 사용 중이라 비활성화 처리됨`,
    };
  }

  await prisma.plan.delete({ where: { id } });

  await audit({
    managerId: session.managerId,
    action: "PLAN_DELETED",
    resource: `plan:${id}`,
  });

  revalidatePath("/plans");
  return { ok: true };
}
