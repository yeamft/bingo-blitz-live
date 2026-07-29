import {
  Activity,
  ArrowDownCircle,
  ArrowLeftRight,
  BarChart3,
  FileText,
  LayoutDashboard,
  Radio,
  Settings,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import type { AdminNavGroup } from "@/lib/admin/constants";

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        id: "overview",
        label: "Dashboard",
        description: "Key metrics and platform health",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      {
        id: "live",
        label: "Live Operations",
        description: "Active rooms and worker controls",
        icon: Radio,
        badgeKey: "live_rooms",
      },
      {
        id: "players",
        label: "Players",
        description: "User management and wallet adjustments",
        icon: Users,
      },
      {
        id: "rooms",
        label: "Rooms",
        description: "Game room history and controls",
        icon: Activity,
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      {
        id: "deposits",
        label: "Deposits",
        description: "Deposit verification queue",
        icon: ArrowDownCircle,
        badgeKey: "deposits",
      },
      {
        id: "withdrawals",
        label: "Withdrawals",
        description: "Withdrawal approval queue",
        icon: Wallet,
        badgeKey: "withdrawals",
      },
      {
        id: "transactions",
        label: "Transactions",
        description: "Ledger activity",
        icon: ArrowLeftRight,
      },
      {
        id: "wallet",
        label: "Wallet Queue",
        description: "All pending wallet requests",
        icon: FileText,
        badgeKey: "pending_wallet",
      },
      {
        id: "reports",
        label: "Reports",
        description: "Financial analytics and trends",
        icon: BarChart3,
      },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      {
        id: "settings",
        label: "Settings",
        description: "System configuration",
        icon: Settings,
      },
      {
        id: "audit",
        label: "Audit Logs",
        description: "Administrative action history",
        icon: Shield,
      },
    ],
  },
];
