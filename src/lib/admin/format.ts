/** Formatting helpers for the admin dashboard. */

export function formatEtb(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  return `${value.toLocaleString("en-ET")} ETB`;
}

export function formatNumber(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("en-ET");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-ET", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function statusTone(status: string): string {
  switch (status.toLowerCase()) {
    case "live":
    case "approved":
    case "active":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "lobby":
    case "pending":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "paused":
      return "bg-sky-500/10 text-sky-700 dark:text-sky-400";
    case "rejected":
    case "blocked":
    case "finished":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-destructive/10 text-destructive";
  }
}
