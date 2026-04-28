"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, RotateCw } from "lucide-react";
import {
  createPartner,
  updatePartner,
  suggestPartnerCode,
  type PartnerInput,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type ExistingPartner = {
  id: string;
  code: string;
  name: string;
  contact: string | null;
  memo: string | null;
  isActive: boolean;
};

export function PartnerForm({ existing }: { existing?: ExistingPartner }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState<PartnerInput>(() => ({
    code: existing?.code ?? "",
    name: existing?.name ?? "",
    contact: existing?.contact ?? "",
    memo: existing?.memo ?? "",
    isActive: existing?.isActive ?? true,
  }));

  const isEdit = !!existing;
  const isDirect = existing?.code === "DIRECT";

  async function generate() {
    setGenerating(true);
    try {
      const code = await suggestPartnerCode();
      setForm((p) => ({ ...p, code }));
    } finally {
      setGenerating(false);
    }
  }

  function submit() {
    startTransition(async () => {
      const res = isEdit
        ? await updatePartner(existing.id, form)
        : await createPartner(form);
      if (res.ok) {
        toast.success(isEdit ? "거래처 수정 완료" : "거래처 등록 완료");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  // 신규 등록 시, 다이얼로그 열릴 때 자동으로 코드 1개 생성
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !isEdit && !form.code) {
      generate();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" title="거래처 수정">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            거래처 추가
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "거래처 수정" : "거래처 추가"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "거래처 정보를 수정합니다."
              : "유입 추적용 거래처를 등록합니다. 진입 URL은 등록 후 자동 생성됩니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name">거래처명 *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="스텔업"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="code">코드 (URL용) *</Label>
            <div className="flex gap-2">
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="stealup"
                className="font-mono"
                disabled={isDirect}
              />
              {!isDirect && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={generate}
                  disabled={generating || isPending}
                  title="코드 자동 생성"
                >
                  <RotateCw
                    className={`h-4 w-4 ${generating ? "animate-spin" : ""}`}
                  />
                </Button>
              )}
            </div>
            {!isDirect && (
              <p className="text-[10px] text-muted-foreground">
                URL: <span className="font-mono">/r/{form.code || "..."}</span>{" "}
                — 영문/숫자/-/_ 2~32자
              </p>
            )}
            {isDirect && (
              <p className="text-[10px] text-muted-foreground">
                DIRECT 거래처의 코드는 변경할 수 없습니다.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="contact">담당자/연락처</Label>
            <Input
              id="contact"
              value={form.contact ?? ""}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              placeholder="홍길동 / hong@stealup.com / 010-..."
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="memo">메모</Label>
            <Textarea
              id="memo"
              value={form.memo ?? ""}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              rows={2}
              placeholder="유입 채널 형태, 광고 시작 시기 등"
              className="resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="active"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4"
            />
            <Label htmlFor="active" className="cursor-pointer">
              활성 (진입 URL이 동작)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "처리 중..." : isEdit ? "저장" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
