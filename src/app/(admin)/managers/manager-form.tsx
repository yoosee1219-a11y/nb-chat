"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import {
  createManager,
  updateManager,
  type ManagerInput,
} from "./actions";
import { MANAGER_ROLE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export type ExistingManager = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
};

export function ManagerForm({ existing }: { existing?: ExistingManager }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState<ManagerInput>(() => ({
    email: existing?.email ?? "",
    name: existing?.name ?? "",
    password: "",
    role: (existing?.role as keyof typeof MANAGER_ROLE) ?? "MANAGER",
    isActive: existing?.isActive ?? true,
  }));

  function submit() {
    startTransition(async () => {
      const res = existing
        ? await updateManager(existing.id, form)
        : await createManager(form);
      if (res.ok) {
        toast.success(existing ? "매니저 수정 완료" : "매니저 추가 완료");
        setOpen(false);
        if (!existing) setForm({ ...form, password: "" });
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
          <Button variant="ghost" size="icon" title="매니저 수정">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            매니저 추가
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "매니저 수정" : "매니저 추가"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "비밀번호는 변경 시에만 입력하세요."
              : "새로운 매니저 계정을 생성합니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">이메일 *</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={isEdit}
              placeholder="manager@fics.local"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="name">이름 *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="password">
              비밀번호 {isEdit ? "(변경 시 입력)" : "*"}
            </Label>
            <Input
              id="password"
              type="password"
              value={form.password ?? ""}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="최소 8자"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="role">권한 *</Label>
            <Select
              value={form.role}
              onValueChange={(v) =>
                setForm({ ...form, role: v as keyof typeof MANAGER_ROLE })
              }
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MANAGER_ROLE).map(([code, r]) => (
                  <SelectItem key={code} value={code}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              활성 (로그인 가능)
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
          <Button
            onClick={submit}
            disabled={
              isPending ||
              !form.email.trim() ||
              !form.name.trim() ||
              (!isEdit && (!form.password || form.password.length < 8))
            }
          >
            {isPending ? "저장 중..." : isEdit ? "수정" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
