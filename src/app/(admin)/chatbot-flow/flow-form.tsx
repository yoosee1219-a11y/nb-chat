"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createFlow } from "./actions";

export function FlowForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("이름을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      try {
        await createFlow({ name: trimmed, description });
        // createFlow가 성공 시 redirect → 여기 도달 안 함
      } catch (err) {
        // Next의 redirect는 throw, 그래서 catch에서 무시
        if ((err as { digest?: string })?.digest?.startsWith?.("NEXT_REDIRECT")) {
          return;
        }
        toast.error("플로우 생성 실패");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          플로우 추가
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 챗봇 플로우</DialogTitle>
          <DialogDescription>
            노드 기반 시나리오를 만들어 자동 응답 흐름을 설계합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="flow-name">이름</Label>
            <Input
              id="flow-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 신규 신청자 환영 플로우"
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flow-desc">설명 (선택)</Label>
            <Textarea
              id="flow-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="이 플로우의 목적, 트리거 조건 등을 메모"
              maxLength={300}
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            취소
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            생성하고 편집하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
