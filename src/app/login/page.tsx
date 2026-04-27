import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage() {
  // 이미 로그인 상태면 대시보드로
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">FICS</CardTitle>
          <CardDescription>외국인 통신사 가입 상담 관리</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            개발 시드 계정:{" "}
            <code className="rounded bg-muted px-1 py-0.5">admin@fics.local</code>{" "}
            /{" "}
            <code className="rounded bg-muted px-1 py-0.5">admin123</code>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
