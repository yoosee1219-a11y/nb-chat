"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Wifi,
  MessageCircle,
  Bot,
  UserCog,
  Building2,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** 이 메뉴를 볼 수 있는 역할들. 없으면 모두 가능 */
  allowedRoles?: string[];
};

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "메인",
    items: [{ href: "/dashboard", label: "대시보드", icon: LayoutDashboard }],
  },
  {
    label: "운영",
    items: [
      { href: "/applicants", label: "신청자 관리", icon: Users },
      { href: "/partners", label: "거래처 관리", icon: Building2 },
      { href: "/partner-stats", label: "거래처 통계", icon: TrendingUp },
      { href: "/plans", label: "요금제 관리", icon: Wifi },
      { href: "/chat", label: "채팅", icon: MessageCircle },
      { href: "/chatbot-flow", label: "챗봇 플로우", icon: Bot },
    ],
  },
  {
    label: "관리",
    items: [
      { href: "/managers", label: "매니저 관리", icon: UserCog },
      {
        href: "/audit",
        label: "감사 로그",
        icon: ShieldCheck,
        allowedRoles: ["ADMIN"],
      },
    ],
  },
];

export function SidebarNav({ role }: { role: string }) {
  const pathname = usePathname();

  return (
    <>
      {NAV.map((group) => {
        const visibleItems = group.items.filter(
          (item) => !item.allowedRoles || item.allowedRoles.includes(role)
        );
        if (visibleItems.length === 0) return null;
        return (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/60">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleItems.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
}
