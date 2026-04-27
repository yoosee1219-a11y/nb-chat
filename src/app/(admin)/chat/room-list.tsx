"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Star, Search, MessageCircle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NATIONALITY, LANGUAGE } from "@/lib/constants";
import { toggleFavorite } from "./actions";

type RoomItem = {
  id: string;
  isFavorite: boolean;
  unreadCount: number;
  lastMessageAt: Date | null;
  managerId: string | null;
  applicant: {
    id: string;
    name: string;
    nationality: string;
    preferredLanguage: string;
    status: string;
  };
  lastPreview: string | null;
};

export function RoomList({
  rooms,
  selectedRoomId,
  currentManagerId,
}: {
  rooms: RoomItem[];
  selectedRoomId: string | null;
  currentManagerId: string;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"mine" | "all" | "fav">("mine");
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let list = rooms;
    if (tab === "mine")
      list = list.filter((r) => r.managerId === currentManagerId);
    else if (tab === "fav") list = list.filter((r) => r.isFavorite);

    if (q.trim()) {
      const lower = q.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.applicant.name.toLowerCase().includes(lower) ||
          r.id.toLowerCase().includes(lower)
      );
    }

    return [...list].sort((a, b) => {
      // 즐겨찾기 우선 → 미읽음 우선 → 최신순
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if (a.unreadCount !== b.unreadCount)
        return b.unreadCount - a.unreadCount;
      const at = a.lastMessageAt?.getTime() ?? 0;
      const bt = b.lastMessageAt?.getTime() ?? 0;
      return bt - at;
    });
  }, [rooms, tab, q, currentManagerId]);

  const counts = useMemo(
    () => ({
      mine: rooms.filter((r) => r.managerId === currentManagerId).length,
      all: rooms.length,
      fav: rooms.filter((r) => r.isFavorite).length,
    }),
    [rooms, currentManagerId]
  );

  return (
    <div className="flex h-full flex-col border-r">
      {/* 헤더 */}
      <div className="border-b p-3 space-y-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          <h3 className="text-sm font-semibold">채팅방</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length}
          </span>
        </div>

        {/* 탭 */}
        <div className="flex gap-1">
          <TabBtn active={tab === "mine"} onClick={() => setTab("mine")}>
            내 담당 <span className="ml-1 text-xs opacity-60">{counts.mine}</span>
          </TabBtn>
          <TabBtn active={tab === "all"} onClick={() => setTab("all")}>
            전체 <span className="ml-1 text-xs opacity-60">{counts.all}</span>
          </TabBtn>
          <TabBtn active={tab === "fav"} onClick={() => setTab("fav")}>
            ★ <span className="ml-1 text-xs opacity-60">{counts.fav}</span>
          </TabBtn>
        </div>

        {/* 검색 */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="이름 / 룸ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 pl-8 pr-7 text-xs"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 리스트 */}
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-xs text-muted-foreground">
            데이터 없음
          </p>
        ) : (
          <ul className="divide-y">
            {filtered.map((r) => {
              const nat = NATIONALITY[r.applicant.nationality];
              const lang = LANGUAGE[r.applicant.preferredLanguage];
              const isSelected = r.id === selectedRoomId;
              return (
                <li key={r.id}>
                  <Link
                    href={`/chat?roomId=${r.id}`}
                    className={`block px-3 py-2.5 hover:bg-muted/50 ${
                      isSelected ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startTransition(() => {
                            toggleFavorite(r.id);
                          });
                        }}
                        className="mt-0.5 shrink-0"
                        title={r.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}
                      >
                        <Star
                          className={`h-4 w-4 ${
                            r.isFavorite
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground hover:text-amber-400"
                          }`}
                        />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">{nat?.flag}</span>
                          <p className="truncate text-sm font-medium">
                            {r.applicant.name}
                          </p>
                          {r.unreadCount > 0 && (
                            <Badge
                              variant="destructive"
                              className="ml-auto h-4 px-1.5 text-[10px]"
                            >
                              {r.unreadCount}
                            </Badge>
                          )}
                        </div>

                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {r.lastPreview ?? "메시지 없음"}
                        </p>

                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{lang?.label ?? r.applicant.preferredLanguage}</span>
                          {r.lastMessageAt && (
                            <span title={format(r.lastMessageAt, "yyyy.MM.dd HH:mm")}>
                              ·{" "}
                              {formatDistanceToNow(r.lastMessageAt, {
                                addSuffix: true,
                                locale: ko,
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="sm"
      onClick={onClick}
      className="h-7 flex-1 text-xs"
    >
      {children}
    </Button>
  );
}
