"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  MessageCircle,
  Bot,
  UserCog,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV = [
  {
    label: "메인",
    items: [{ href: "/dashboard", label: "대시보드", icon: LayoutDashboard }],
  },
  {
    label: "운영",
    items: [
      { href: "/applicants", label: "신청자 관리", icon: Users },
      { href: "/plans", label: "요금제 관리", icon: FileText },
      { href: "/chat", label: "채팅", icon: MessageCircle },
      { href: "/chatbot-flow", label: "챗봇 플로우", icon: Bot },
    ],
  },
  {
    label: "관리",
    items: [{ href: "/managers", label: "매니저 관리", icon: UserCog }],
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      {NAV.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/60">
            {group.label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
