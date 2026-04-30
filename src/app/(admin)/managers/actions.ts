"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MANAGER_ROLE } from "@/lib/constants";

export type ManagerInput = {
  email: string;
  name: string;
  password?: string;
  role: keyof typeof MANAGER_ROLE;
  isActive?: boolean;
};

async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export async function createManager(input: ManagerInput) {
  const session = await requireAdmin();

  if (!input.email.trim() || !input.name.trim()) {
    return { ok: false, error: "아이디와 이름은 필수입니다." };
  }
  if (!input.password || input.password.length < 8) {
    return { ok: false, error: "비밀번호는 최소 8자 이상이어야 합니다." };
  }
  if (!(input.role in MANAGER_ROLE)) {
    return { ok: false, error: "유효하지 않은 권한입니다." };
  }

  const exists = await prisma.manager.findUnique({
    where: { email: input.email.trim() },
  });
  if (exists) return { ok: false, error: "이미 등록된 아이디입니다." };

  const passwordHash = await bcrypt.hash(input.password, 10);

  const created = await prisma.manager.create({
    data: {
      email: input.email.trim(),
      name: input.name.trim(),
      passwordHash,
      role: input.role,
      isActive: input.isActive ?? true,
    },
  });

  await audit({
    managerId: session.managerId,
    action: "MANAGER_CREATED",
    resource: `manager:${created.id}`,
    metadata: { email: created.email, role: created.role },
  });

  revalidatePath("/managers");
  return { ok: true };
}

export async function updateManager(
  id: string,
  input: Omit<ManagerInput, "password"> & { password?: string }
) {
  const session = await requireAdmin();

  if (!input.email.trim() || !input.name.trim()) {
    return { ok: false, error: "아이디와 이름은 필수입니다." };
  }
  if (input.password && input.password.length > 0 && input.password.length < 8) {
    return { ok: false, error: "비밀번호는 최소 8자 이상이어야 합니다." };
  }

  const exists = await prisma.manager.findUnique({ where: { id } });
  if (!exists) return { ok: false, error: "매니저를 찾을 수 없습니다." };

  const passwordHash = input.password
    ? await bcrypt.hash(input.password, 10)
    : undefined;

  await prisma.manager.update({
    where: { id },
    data: {
      email: input.email.trim(),
      name: input.name.trim(),
      role: input.role,
      isActive: input.isActive ?? true,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  await audit({
    managerId: session.managerId,
    action: "MANAGER_UPDATED",
    resource: `manager:${id}`,
    metadata: {
      email: input.email,
      role: input.role,
      passwordChanged: !!passwordHash,
    },
  });

  revalidatePath("/managers");
  return { ok: true };
}

export async function deactivateManager(id: string) {
  const session = await requireAdmin();

  if (id === session.managerId) {
    return { ok: false, error: "본인 계정은 비활성화할 수 없습니다." };
  }

  const exists = await prisma.manager.findUnique({ where: { id } });
  if (!exists) return { ok: false, error: "매니저를 찾을 수 없습니다." };

  await prisma.manager.update({
    where: { id },
    data: { isActive: false },
  });

  await audit({
    managerId: session.managerId,
    action: "MANAGER_DEACTIVATED",
    resource: `manager:${id}`,
    metadata: { email: exists.email },
  });

  revalidatePath("/managers");
  return { ok: true };
}
