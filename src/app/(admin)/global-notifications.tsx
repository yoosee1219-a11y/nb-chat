"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, MessageCircle } from "lucide-react";
import { getChatSocket } from "@/lib/socket-client";
import { useSocketToken } from "@/lib/socket-token-context";
import type { ChatMessageEvent } from "@/lib/socket-types";

/**
 * 매니저 글로벌 알림 — Phase B2
 *
 * - 매니저 connection 시 socket.ts가 자동으로 모든 권한 룸에 join
 * - 여기서 chat:message 이벤트를 글로벌 수신
 * - APPLICANT 발신만 알림 (매니저 본인 / SYSTEM 봇 메시지는 무시)
 * - 알림 종류:
 *   1) Sonner 토스트 (항상)
 *   2) 브라우저 Notification (탭 백그라운드일 때 + 권한 허용 시)
 *
 * 권한 요청은 첫 클릭 시 표시 — 사용자 제스처 필요 (Notification API 정책)
 */
export function GlobalNotifications() {
  const router = useRouter();
  const token = useSocketToken();
  const permissionRequested = useRef(false);

  useEffect(() => {
    const socket = getChatSocket(token);

    // 알림 권한 요청 — 사용자 첫 클릭 시 1회
    function requestPermissionOnce() {
      if (permissionRequested.current) return;
      permissionRequested.current = true;
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      window.removeEventListener("click", requestPermissionOnce);
    }
    window.addEventListener("click", requestPermissionOnce, { once: true });

    function handleMessage(event: ChatMessageEvent) {
      // 본인 메시지(MANAGER) / 시스템 봇은 알림 X
      if (event.senderType !== "APPLICANT") return;

      const preview =
        event.translatedText ?? event.originalText ?? "(첨부 메시지)";
      const truncated =
        preview.length > 80 ? preview.slice(0, 80) + "…" : preview;

      // 1) 토스트
      toast(`💬 새 메시지`, {
        description: truncated,
        duration: 6000,
        action: {
          label: "열기",
          onClick: () => router.push(`/chat?roomId=${event.roomId}`),
        },
      });

      // 2) 브라우저 Notification (백그라운드 탭일 때)
      if (
        typeof document !== "undefined" &&
        document.hidden &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const n = new Notification("NB Chat — 새 메시지", {
          body: truncated,
          icon: "/favicon.ico",
          tag: `room-${event.roomId}`, // 같은 룸 알림 누적 방지
        });
        n.onclick = () => {
          window.focus();
          router.push(`/chat?roomId=${event.roomId}`);
          n.close();
        };
      }
    }

    socket.on("chat:message", handleMessage);

    return () => {
      socket.off("chat:message", handleMessage);
      window.removeEventListener("click", requestPermissionOnce);
    };
  }, [router, token]);

  return null;
}
