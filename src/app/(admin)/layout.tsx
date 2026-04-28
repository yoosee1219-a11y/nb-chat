import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { SidebarNav } from "./sidebar-nav";
import { GlobalNotifications } from "./global-notifications";

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
        <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold shadow-sm">
              N
            </div>
            <div>
              <p className="text-sm font-semibold text-sidebar-foreground">NB Chat</p>
              <p className="text-[11px] text-sidebar-foreground/60">
                외국인 통신 상담 관리
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarNav role={session.role} />
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {session.name}
              </p>
              <p className="truncate text-[11px] text-sidebar-foreground/60">
                {session.email}
              </p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
          <h1 className="text-sm font-medium">NB Chat 관리자</h1>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
      <GlobalNotifications />
    </SidebarProvider>
  );
}
