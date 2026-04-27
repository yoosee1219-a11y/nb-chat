import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Pretendard는 globals.css에서 @import (한국어 어드민용 본문 폰트).
// CSS variable --font-sans는 system + Pretendard 우선으로 globals에서 정의.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FICS — 외국인 통신사 가입 상담 관리",
  description:
    "외국인 대상 통신사 가입 상담을 효율적으로 관리하는 어드민 시스템. 자동번역 채팅과 챗봇 플로우를 지원합니다.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" closeButton duration={3000} />
      </body>
    </html>
  );
}
