import { redirect } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  FileText,
  MessageCircle,
  Bot,
  UserCog,
  LogOut,
} from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

const NAV = [
  {
    label: "메인",
    items: [
      { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
    ],
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

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const initials = session.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-b px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
              F
            </div>
            <div>
              <p className="text-sm font-semibold">FICS</p>
              <p className="text-xs text-muted-foreground">외국인 통신 상담</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {NAV.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="border-t p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {session.email}
              </p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md p-1.5 hover:bg-muted"
                title="로그아웃"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <h1 className="text-sm font-medium">FICS 관리자</h1>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
