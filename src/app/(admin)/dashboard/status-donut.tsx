"use client";

import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CONSULTATION_STATUS, type ConsultationStatus } from "@/lib/constants";

const COLORS: Record<ConsultationStatus, string> = {
  PENDING: "var(--color-chart-3)",     // amber
  IN_PROGRESS: "var(--color-chart-1)", // indigo
  CONFIRMED: "var(--color-chart-5)",   // emerald
  CANCELLED: "var(--color-chart-4)",   // rose
  UNCONFIRMED: "var(--color-chart-2)", // cyan
};

export function StatusDonut({
  data,
}: {
  data: { status: ConsultationStatus; count: number }[];
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const rows = data
    .filter((d) => d.count > 0)
    .map((d) => ({
      name: CONSULTATION_STATUS[d.status]?.label ?? d.status,
      value: d.count,
      status: d.status,
    }));

  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        데이터 없음
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {rows.map((r) => (
              <Cell
                key={r.status}
                fill={COLORS[r.status as ConsultationStatus] ?? "var(--color-chart-2)"}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              fontSize: "12px",
            }}
            formatter={(v: number) => [`${v}건`, ""]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold leading-none">{total}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">전체</p>
      </div>
    </div>
  );
}
