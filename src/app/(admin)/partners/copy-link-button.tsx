"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Check, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 진입 URL 복사 — 거래처별 unique 추적 링크.
 * 매니저가 거래처에게 공유할 URL.
 */
export function CopyLinkButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/r/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("URL 복사됨");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("복사 실패");
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={copy}
      title={`/r/${code} 복사`}
    >
      {copied ? (
        <Check className="h-4 w-4 text-emerald-600" />
      ) : (
        <LinkIcon className="h-4 w-4" />
      )}
    </Button>
  );
}
