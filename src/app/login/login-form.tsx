"use client";

import { useActionState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { loginAction, type LoginResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const params = useSearchParams();
  const from = params.get("from") ?? "/dashboard";

  const [state, formAction, isPending] = useActionState<LoginResult | null, FormData>(
    loginAction,
    null
  );

  useEffect(() => {
    if (state && !state.ok) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="from" value={from} />

      <div className="space-y-2">
        <Label htmlFor="email">아이디</Label>
        <Input
          id="email"
          name="email"
          type="text"
          autoComplete="username"
          required
          defaultValue="admin"
          placeholder="admin"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "로그인 중..." : "로그인"}
      </Button>
    </form>
  );
}
