/** Shared admin dashboard constants and types. */

import type { LucideIcon } from "lucide-react";

export type AdminSection =
  | "overview"
  | "live"
  | "reports"
  | "players"
  | "rooms"
  | "deposits"
  | "withdrawals"
  | "transactions"
  | "wallet"
  | "settings"
  | "audit";

export type AdminBadgeKey = "pending_wallet" | "deposits" | "withdrawals" | "live_rooms";

export type AdminNavItem = {
  id: AdminSection;
  label: string;
  description: string;
  icon: LucideIcon;
  badgeKey?: AdminBadgeKey;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_SECTIONS: Array<{ id: AdminSection; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Key metrics and platform health" },
  { id: "live", label: "Live Operations", description: "Active rooms and worker controls" },
  { id: "reports", label: "Reports", description: "Financial analytics and trends" },
  { id: "players", label: "Players", description: "User management and wallet adjustments" },
  { id: "rooms", label: "Rooms", description: "Game room history and controls" },
  { id: "deposits", label: "Deposits", description: "Deposit verification queue" },
  { id: "withdrawals", label: "Withdrawals", description: "Withdrawal approval queue" },
  { id: "transactions", label: "Transactions", description: "Ledger activity" },
  { id: "wallet", label: "Wallet Queue", description: "All pending wallet requests" },
  { id: "settings", label: "Settings", description: "System configuration" },
  { id: "audit", label: "Audit Logs", description: "Administrative action history" },
];

export const ADMIN_SESSION_KEY = "yegara.admin.session";

export type AdminRole = "super_admin" | "finance_admin" | "support_admin" | "game_admin";

export const DEFAULT_SYSTEM_SETTINGS: Record<string, string> = {
  public_stakes: "10,20,50,100,500",
  private_stakes: "10,20,50,100",
  house_commission_pct: "20",
  lobby_duration_seconds: "30",
  call_interval_ms: "3000",
  false_claim_penalty_pct: "20",
  deposits_enabled: "true",
  withdrawals_enabled: "true",
  new_games_enabled: "true",
  min_deposit_amount: "10",
  min_withdrawal_amount: "50",
  max_withdrawal_amount: "50000",
};
