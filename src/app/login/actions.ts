"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { login } from "@/lib/auth";

export type LoginResult = { ok: false; error: string } | { ok: true };

export async function loginAction(
  _prev: LoginResult | null,
  formData: FormData
): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/dashboard");

  if (!email || !password) {
    return { ok: false, error: "아이디와 비밀번호를 입력해주세요." };
  }

  const headersList = await headers();
  const session = await login(email, password, {
    ipAddress:
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headersList.get("x-real-ip") ??
      undefined,
    userAgent: headersList.get("user-agent") ?? undefined,
  });

  if (!session) {
    return { ok: false, error: "아이디 또는 비밀번호가 일치하지 않습니다." };
  }

  redirect(from);
}
