import { ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { AdminSection } from "@/lib/admin/constants";
import { ADMIN_NAV_GROUPS } from "@/lib/admin/navigation";

type AdminHeaderProps = {
  section: AdminSection;
  label: string;
  description: string;
  refreshing: boolean;
  onRefresh: () => void;
  actions?: React.ReactNode;
};

function breadcrumbForSection(section: AdminSection): string[] {
  for (const group of ADMIN_NAV_GROUPS) {
    const item = group.items.find((entry) => entry.id === section);
    if (item) return [group.label, item.label];
  }
  return ["Admin", labelFallback(section)];
}

function labelFallback(section: AdminSection): string {
  return section.charAt(0).toUpperCase() + section.slice(1);
}

export function AdminHeader({
  section,
  label,
  refreshing,
  onRefresh,
  actions,
}: AdminHeaderProps) {
  const crumbs = breadcrumbForSection(section);

  return (
    <header className="admin-page-header mb-6 rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} className="inline-flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-3 w-3 opacity-60" aria-hidden />}
                <span className={index === crumbs.length - 1 ? "font-semibold text-foreground" : undefined}>
                  {crumb}
                </span>
              </span>
            ))}
          </nav>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{label}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <ThemeToggle variant="menu" className="hidden lg:inline-flex" />
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-2">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>
    </header>
  );
}
