"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { updateNote, deleteNote } from "../actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

export type NoteItemProps = {
  note: {
    id: string;
    content: string;
    createdAt: Date;
    updatedAt: Date | null;
    manager: { id: string; name: string };
  };
  currentManagerId: string;
  isAdmin: boolean;
};

export function NoteItem({ note, currentManagerId, isAdmin }: NoteItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [isPending, startTransition] = useTransition();

  const canModify = note.manager.id === currentManagerId || isAdmin;

  function saveEdit() {
    startTransition(async () => {
      const res = await updateNote(note.id, editContent);
      if (res.ok) {
        toast.success("메모 수정 완료");
        setIsEditing(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteNote(note.id);
      if (res.ok) toast.success("메모 삭제 완료");
      else toast.error(res.error);
    });
  }

  return (
    <div className="group rounded-md border p-3 hover:bg-muted/30">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{note.manager.name}</span>
            <span>·</span>
            <span>
              {format(note.createdAt, "yyyy.MM.dd HH:mm", { locale: ko })}
            </span>
            {note.updatedAt && <span className="italic">(수정됨)</span>}
          </div>

          {isEditing ? (
            <div className="mt-2 space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setEditContent(note.content);
                  }}
                  disabled={isPending}
                >
                  수정 취소
                </Button>
                <Button
                  size="sm"
                  onClick={saveEdit}
                  disabled={isPending || !editContent.trim()}
                >
                  {isPending ? "저장 중..." : "수정 저장"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-sm">{note.content}</p>
          )}
        </div>

        {canModify && !isEditing && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsEditing(true)}
              title="메모 수정"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  title="메모 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>메모 삭제</AlertDialogTitle>
                  <AlertDialogDescription>
                    이 메모를 삭제하시겠습니까?
                    <br />
                    삭제된 메모는 복구할 수 없습니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isPending ? "삭제 중..." : "삭제 확인"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  );
}
