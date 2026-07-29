import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminTableCardProps = {
  title: string;
  /** Right-aligned summary shown next to the title, e.g. a pending count. */
  meta?: ReactNode;
  actions?: ReactNode;
  /** Rendered instead of the table when there are no rows. */
  empty?: boolean;
  emptyMessage?: string;
  /** Smallest width before the table starts scrolling horizontally. */
  minWidthClass?: string;
  children: ReactNode;
};

export function AdminTableCard({
  title,
  meta,
  actions,
  empty = false,
  emptyMessage = "No records found.",
  minWidthClass = "min-w-[720px]",
  children,
}: AdminTableCardProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          {meta}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {empty ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="admin-table-scroll rounded-none border-0">
          <table className={cn("admin-table", minWidthClass)}>{children}</table>
        </div>
      )}
    </section>
  );
}

export function AdminTableCount({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{label}</span>
  );
}
