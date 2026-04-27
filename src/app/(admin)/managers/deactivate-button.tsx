"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { UserX } from "lucide-react";
import { deactivateManager } from "./actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeactivateManagerButton({
  id,
  email,
}: {
  id: string;
  email: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handle() {
    startTransition(async () => {
      const res = await deactivateManager(id);
      if (res.ok) toast.success("매니저 비활성화 완료");
      else toast.error(res.error);
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          title="비활성화"
        >
          <UserX className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>매니저 비활성화</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{email}</strong> 계정을 비활성화합니다.
            <br />
            로그인은 막히지만 데이터(메시지/메모)는 보존됩니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={handle}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "처리 중..." : "비활성화"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
