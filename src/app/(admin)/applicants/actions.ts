"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CONSULTATION_STATUS, type ConsultationStatus } from "@/lib/constants";

export async function changeStatus(
  applicantId: string,
  toStatus: ConsultationStatus,
  reason?: string
) {
  const session = await requireSession();

  if (!(toStatus in CONSULTATION_STATUS)) {
    return { ok: false, error: "유효하지 않은 상태입니다." };
  }

  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { status: true },
  });
  if (!applicant) return { ok: false, error: "신청자를 찾을 수 없습니다." };

  const fromStatus = applicant.status;
  if (fromStatus === toStatus) {
    return { ok: false, error: "현재 상태와 동일합니다." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.applicant.update({
      where: { id: applicantId },
      data: { status: toStatus },
    });
    await tx.statusHistory.create({
      data: {
        applicantId,
        managerId: session.managerId,
        fromStatus,
        toStatus,
        reason: reason || null,
      },
    });
  });

  await audit({
    managerId: session.managerId,
    action: "APPLICANT_STATUS_CHANGED",
    resource: `applicant:${applicantId}`,
    metadata: { fromStatus, toStatus, reason },
  });

  revalidatePath(`/applicants/${applicantId}`);
  revalidatePath("/applicants");
  return { ok: true };
}

export async function createNote(applicantId: string, content: string) {
  const session = await requireSession();
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "메모 내용을 입력해주세요." };

  const note = await prisma.note.create({
    data: {
      applicantId,
      managerId: session.managerId,
      content: trimmed,
    },
  });

  await audit({
    managerId: session.managerId,
    action: "NOTE_CREATED",
    resource: `note:${note.id}`,
    metadata: { applicantId },
  });

  revalidatePath(`/applicants/${applicantId}`);
  return { ok: true };
}

export async function updateNote(noteId: string, content: string) {
  const session = await requireSession();
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "메모 내용을 입력해주세요." };

  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) return { ok: false, error: "메모를 찾을 수 없습니다." };

  // 작성자 본인 또는 ADMIN만 수정 가능
  if (note.managerId !== session.managerId && session.role !== "ADMIN") {
    return { ok: false, error: "수정 권한이 없습니다." };
  }

  await prisma.note.update({
    where: { id: noteId },
    data: { content: trimmed, updatedAt: new Date() },
  });

  await audit({
    managerId: session.managerId,
    action: "NOTE_UPDATED",
    resource: `note:${noteId}`,
    metadata: { applicantId: note.applicantId },
  });

  revalidatePath(`/applicants/${note.applicantId}`);
  return { ok: true };
}

export async function deleteNote(noteId: string) {
  const session = await requireSession();

  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) return { ok: false, error: "메모를 찾을 수 없습니다." };

  if (note.managerId !== session.managerId && session.role !== "ADMIN") {
    return { ok: false, error: "삭제 권한이 없습니다." };
  }

  await prisma.note.delete({ where: { id: noteId } });

  await audit({
    managerId: session.managerId,
    action: "NOTE_DELETED",
    resource: `note:${noteId}`,
    metadata: { applicantId: note.applicantId },
  });

  revalidatePath(`/applicants/${note.applicantId}`);
  return { ok: true };
}
