"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deletePartner } from "./actions";
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

export function DeletePartnerButton({
  id,
  name,
  isDirect,
}: {
  id: string;
  name: string;
  isDirect: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const res = await deletePartner(id);
      if (res.ok) {
        toast.success(
          "softDeleted" in res && res.softDeleted
            ? `비활성화 완료 — ${res.message}`
            : "삭제 완료"
        );
      } else {
        toast.error(res.error);
      }
    });
  }

  if (isDirect) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive/40"
        title="DIRECT는 삭제할 수 없습니다"
        disabled
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          title="거래처 삭제"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>거래처 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{name}</strong> 거래처를 삭제하시겠습니까?
            <br />
            묶인 신청자가 있으면 비활성화로 처리됩니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "처리 중..." : "삭제"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
