"use client";

import { useState } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * 신청자(고객) 채팅 링크 — Phase 3.5
 *
 * 매니저가 고객에게 SMS/카톡 등으로 보내는 진입 URL 복사.
 * MVP: roomId를 그대로 URL에 노출 (cuid라 unguessable).
 */
export function CustomerLinkButton({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState(false);

  function buildUrl() {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/c/${roomId}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(buildUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("[customer-link] copy failed", e);
    }
  }

  function openLink() {
    window.open(buildUrl(), "_blank");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" title="고객 링크">
          <Share2 className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={copyLink}>
          {copied ? (
            <Check className="mr-2 h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="mr-2 h-3.5 w-3.5" />
          )}
          {copied ? "복사됨" : "고객 링크 복사"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={openLink}>
          <Share2 className="mr-2 h-3.5 w-3.5" />
          새 탭에서 열기
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
