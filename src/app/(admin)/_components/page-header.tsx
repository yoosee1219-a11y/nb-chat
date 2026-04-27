import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; href?: string };

/**
 * 어드민 페이지 공용 헤더.
 * 패턴: 브레드크럼 → (제목 + 부제 inline) → 우측 액션 버튼 영역
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="-mx-6 -mt-6 mb-6 border-b border-border bg-background px-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav
              aria-label="브레드크럼"
              className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground"
            >
              {breadcrumbs.map((c, i) => {
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && (
                      <ChevronRight className="h-3 w-3 flex-shrink-0" />
                    )}
                    {c.href && !isLast ? (
                      <Link
                        href={c.href}
                        className="truncate transition-colors hover:text-foreground"
                      >
                        {c.label}
                      </Link>
                    ) : (
                      <span
                        className={
                          isLast ? "truncate text-foreground" : "truncate"
                        }
                      >
                        {c.label}
                      </span>
                    )}
                  </span>
                );
              })}
            </nav>
          )}
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {description && (
              <p className="pb-0.5 text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
