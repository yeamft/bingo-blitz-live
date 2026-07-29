import { LogOut, Menu, Shield } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";
import type { AdminBadgeKey, AdminSection } from "@/lib/admin/constants";
import { ADMIN_NAV_GROUPS } from "@/lib/admin/navigation";

type AdminSidebarProps = {
  activeSection: AdminSection;
  username: string;
  badges: Partial<Record<AdminBadgeKey, number>>;
  onNavigate: (section: AdminSection) => void;
  onLogout: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function SidebarBrand() {
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Shield className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">Yegara Bingo</p>
        <p className="truncate text-xs text-muted-foreground">Admin Console</p>
      </div>
    </div>
  );
}

function SidebarNav({
  activeSection,
  badges,
  onNavigate,
}: Pick<AdminSidebarProps, "activeSection" | "badges" | "onNavigate">) {
  return (
    <nav className="space-y-5" aria-label="Admin navigation">
      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.id}>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = activeSection === item.id;
              const Icon = item.icon;
              const badgeCount = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                    <NavBadge count={badgeCount} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({
  username,
  onLogout,
}: Pick<AdminSidebarProps, "username" | "onLogout">) {
  const initials = username
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-3 border-t border-sidebar-border pt-4">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{initials || "AD"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{username}</p>
          <p className="text-xs text-muted-foreground">Administrator</p>
        </div>
        <ThemeToggle variant="menu" />
      </div>
      <Button type="button" variant="outline" className="w-full gap-2" onClick={onLogout}>
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}

function SidebarPanel({
  activeSection,
  badges,
  username,
  onNavigate,
  onLogout,
  className,
}: AdminSidebarProps & { className?: string }) {
  return (
    <div className={cn("flex h-full flex-col bg-sidebar text-sidebar-foreground", className)}>
      <div className="border-b border-sidebar-border px-4 py-5">
        <SidebarBrand />
      </div>
      <ScrollArea className="flex-1 px-3 py-4">
        <SidebarNav activeSection={activeSection} badges={badges} onNavigate={onNavigate} />
      </ScrollArea>
      <div className="px-4 pb-4">
        <SidebarFooter username={username} onLogout={onLogout} />
      </div>
    </div>
  );
}

export function AdminMobileTopBar({
  activeLabel,
  onOpenMenu,
}: {
  activeLabel: string;
  onOpenMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Admin</p>
        <p className="truncate text-sm font-bold text-foreground">{activeLabel}</p>
      </div>
      <Button type="button" variant="outline" size="icon" onClick={onOpenMenu} aria-label="Open navigation menu">
        <Menu className="h-4 w-4" />
      </Button>
    </header>
  );
}

export function AdminSidebar({
  activeSection,
  username,
  badges,
  onNavigate,
  onLogout,
  mobileOpen,
  onMobileOpenChange,
}: AdminSidebarProps) {
  function handleNavigate(section: AdminSection) {
    onNavigate(section);
    onMobileOpenChange(false);
  }

  return (
    <>
      <aside className="hidden w-72 shrink-0 border-r border-sidebar-border lg:sticky lg:top-0 lg:block lg:h-screen">
        <SidebarPanel
          activeSection={activeSection}
          username={username}
          badges={badges}
          onNavigate={handleNavigate}
          onLogout={onLogout}
          mobileOpen={mobileOpen}
          onMobileOpenChange={onMobileOpenChange}
        />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-[min(100vw,18rem)] p-0">
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <SidebarPanel
            activeSection={activeSection}
            username={username}
            badges={badges}
            onNavigate={handleNavigate}
            onLogout={onLogout}
            mobileOpen={mobileOpen}
            onMobileOpenChange={onMobileOpenChange}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
