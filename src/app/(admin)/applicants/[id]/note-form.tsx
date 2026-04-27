"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createNote } from "../actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function NoteForm({ applicantId }: { applicantId: string }) {
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!content.trim()) {
      toast.error("메모 내용을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const res = await createNote(applicantId, content);
      if (res.ok) {
        toast.success("메모 작성 완료");
        setContent("");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="메모를 입력하세요."
        rows={3}
        className="resize-none"
      />
      <div className="flex justify-end">
        <Button
          onClick={submit}
          disabled={isPending || !content.trim()}
          size="sm"
        >
          {isPending ? "저장 중..." : "메모 저장"}
        </Button>
      </div>
    </div>
  );
}
