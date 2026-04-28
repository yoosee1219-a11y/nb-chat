"use client";

import { useState, useTransition } from "react";
import { Loader2, Bot, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { LANGUAGE, NATIONALITY, VISA_TYPES } from "@/lib/constants";
import { submitApplication, type ApplyInput } from "./actions";

type Plan = {
  id: string;
  name: string;
  carrier: string;
  monthlyFee: number;
  dataAllowance: string | null;
  voiceMinutes: string | null;
  smsCount: string | null;
  commitment: string | null;
};

export function ApplyForm({
  plans,
  hasSource,
  fromLabel,
}: {
  plans: Plan[];
  hasSource: boolean;
  fromLabel: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ApplyInput>({
    name: "",
    nationality: "VN",
    preferredLanguage: "VI_VN",
    phone: "",
    email: "",
    visa: "",
    appliedPlanId: undefined,
    privacyConsent: false,
    thirdPartyConsent: false,
  });

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitApplication(form);
      if (res && !res.ok) {
        setError(res.error);
      }
    });
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-50 to-white px-4 py-6">
      <div className="mx-auto max-w-md">
        {/* 헤더 */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Bot className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">NB Chat 가입 상담</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            외국인 통신 가입 상담을 도와드립니다
          </p>
          {fromLabel && (
            <p className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-0.5 text-[11px] text-emerald-700">
              유입: {fromLabel}
            </p>
          )}
        </div>

        {/* 폼 */}
        <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div className="space-y-1">
            <Label htmlFor="name">이름 *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="여권상 영문 이름"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>국적 *</Label>
              <Select
                value={form.nationality}
                onValueChange={(v) =>
                  setForm({ ...form, nationality: v as string })
                }
              >
                <SelectTrigger>
                  <span>
                    {NATIONALITY[form.nationality]?.flag}{" "}
                    {NATIONALITY[form.nationality]?.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(NATIONALITY).map(([code, n]) => (
                    <SelectItem key={code} value={code}>
                      {n.flag} {n.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>사용 언어 *</Label>
              <Select
                value={form.preferredLanguage}
                onValueChange={(v) =>
                  setForm({ ...form, preferredLanguage: v as string })
                }
              >
                <SelectTrigger>
                  <span>{LANGUAGE[form.preferredLanguage]?.label}</span>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LANGUAGE).map(([code, l]) => (
                    <SelectItem key={code} value={code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="phone">휴대폰</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="010-0000-0000"
                inputMode="tel"
              />
            </div>
            <div className="space-y-1">
              <Label>비자 종류</Label>
              <Select
                value={form.visa ?? ""}
                onValueChange={(v) => setForm({ ...form, visa: v as string })}
              >
                <SelectTrigger>
                  <span>{form.visa || "선택"}</span>
                </SelectTrigger>
                <SelectContent>
                  {VISA_TYPES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">이메일 (선택)</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="example@email.com"
            />
          </div>

          <div className="space-y-1">
            <Label>희망 요금제 (선택 — 상담 시 변경 가능)</Label>
            <Select
              value={form.appliedPlanId ?? ""}
              onValueChange={(v) =>
                setForm({ ...form, appliedPlanId: (v as string) || undefined })
              }
            >
              <SelectTrigger>
                <span>
                  {form.appliedPlanId
                    ? plans.find((p) => p.id === form.appliedPlanId)?.name
                    : "선택 안 함"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    [{p.carrier}] {p.name} · {p.monthlyFee.toLocaleString()}원
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-md bg-muted/40 p-3 text-xs">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.privacyConsent}
                onChange={(e) =>
                  setForm({ ...form, privacyConsent: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                <strong>[필수]</strong> 개인정보 수집 및 이용 동의 (이름, 연락처,
                국적, 비자정보)
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.thirdPartyConsent}
                onChange={(e) =>
                  setForm({ ...form, thirdPartyConsent: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                <strong>[선택]</strong> 통신사(LGU+ 등)에 제3자 정보 제공 동의
              </span>
            </label>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <Button
            onClick={submit}
            disabled={pending}
            className="w-full bg-emerald-500 hover:bg-emerald-600"
            size="lg"
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            상담 시작하기
          </Button>

          {!hasSource && (
            <p className="text-center text-[10px] text-muted-foreground">
              ※ 직접 접속하셨어요. 거래처 링크로 접속하시면 자동 추적됩니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
