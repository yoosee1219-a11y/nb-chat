"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { createPlan, updatePlan, type PlanInput } from "./actions";
import { CARRIER, type Carrier } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type ExistingPlan = {
  id: string;
  name: string;
  carrier: string;
  monthlyFee: number;
  dataAllowance: string | null;
  voiceMinutes: string | null;
  smsCount: string | null;
  commitment: string | null;
  description: string | null;
  isActive: boolean;
};

export function PlanForm({ existing }: { existing?: ExistingPlan }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState<PlanInput>(() => ({
    name: existing?.name ?? "",
    carrier: (existing?.carrier as Carrier) ?? "LGU+",
    monthlyFee: existing?.monthlyFee ?? 0,
    dataAllowance: existing?.dataAllowance ?? "",
    voiceMinutes: existing?.voiceMinutes ?? "",
    smsCount: existing?.smsCount ?? "",
    commitment: existing?.commitment ?? "",
    description: existing?.description ?? "",
    isActive: existing?.isActive ?? true,
  }));

  function submit() {
    startTransition(async () => {
      const res = existing
        ? await updatePlan(existing.id, form)
        : await createPlan(form);
      if (res.ok) {
        toast.success(existing ? "요금제 수정 완료" : "요금제 등록 완료");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  const isEdit = !!existing;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" title="요금제 수정">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            요금제 추가
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "요금제 수정" : "요금제 추가"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "요금제 정보를 수정합니다." : "새로운 요금제를 등록합니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name">요금제명 *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="5G 스탠다드"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="carrier">통신사 *</Label>
              <Select
                value={form.carrier}
                onValueChange={(v) =>
                  setForm({ ...form, carrier: v as Carrier })
                }
              >
                <SelectTrigger id="carrier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARRIER.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="fee">월 요금 (원) *</Label>
              <Input
                id="fee"
                type="number"
                value={form.monthlyFee}
                onChange={(e) =>
                  setForm({ ...form, monthlyFee: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="data">데이터</Label>
              <Input
                id="data"
                value={form.dataAllowance ?? ""}
                onChange={(e) =>
                  setForm({ ...form, dataAllowance: e.target.value })
                }
                placeholder="30GB"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="voice">통화</Label>
              <Input
                id="voice"
                value={form.voiceMinutes ?? ""}
                onChange={(e) =>
                  setForm({ ...form, voiceMinutes: e.target.value })
                }
                placeholder="무제한"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sms">SMS</Label>
              <Input
                id="sms"
                value={form.smsCount ?? ""}
                onChange={(e) =>
                  setForm({ ...form, smsCount: e.target.value })
                }
                placeholder="무제한"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="commitment">약정</Label>
            <Input
              id="commitment"
              value={form.commitment ?? ""}
              onChange={(e) =>
                setForm({ ...form, commitment: e.target.value })
              }
              placeholder="12개월 / 24개월 / 약정 없음"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="desc">설명</Label>
            <Textarea
              id="desc"
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="active"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) =>
                setForm({ ...form, isActive: e.target.checked })
              }
              className="h-4 w-4"
            />
            <Label htmlFor="active" className="cursor-pointer">
              활성 (신청자가 선택 가능)
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
          <Button onClick={submit} disabled={isPending || !form.name.trim()}>
            {isPending ? "저장 중..." : isEdit ? "수정" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
