"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { changeStatus } from "../actions";
import {
  CONSULTATION_STATUS,
  type ConsultationStatus,
} from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function StatusChange({
  applicantId,
  currentStatus,
}: {
  applicantId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(currentStatus);

  function handleChange(value: string | null) {
    if (!value || value === status) return;
    const prev = status;
    setStatus(value); // 옵티미스틱

    startTransition(async () => {
      const res = await changeStatus(
        applicantId,
        value as ConsultationStatus
      );
      if (!res.ok) {
        setStatus(prev);
        toast.error(res.error);
      } else {
        toast.success("상태 변경 완료");
      }
    });
  }

  const current =
    CONSULTATION_STATUS[status as ConsultationStatus] ?? null;

  return (
    <div className="flex items-center gap-3">
      {current && (
        <Badge variant="outline" className={current.className}>
          {current.label}
        </Badge>
      )}
      <Select value={status} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="상태 변경" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(CONSULTATION_STATUS).map(([code, s]) => (
            <SelectItem key={code} value={code}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
