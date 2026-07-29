import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Coins,
  FileText,
  Loader2,
  LogOut,
  Radio,
  RefreshCw,
  Settings,
  Shield,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminFinancialCharts } from "@/components/admin/AdminCharts";
import { AdminDataTable, type AdminColumn } from "@/components/admin/AdminDataTable";
import { hasStoredThemePreference } from "@/components/theme/ThemeProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useTelegramIdentity } from "@/hooks/useTelegramIdentity";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import {
  api,
  getErrorMessage,
  type AdminAuthSession,
  type AdminSummary,
  type Player,
  type Room,
  type Transaction,
  type WalletRequest,
} from "@/lib/api";
import {
  ADMIN_SECTIONS,
  ADMIN_SESSION_KEY,
  DEFAULT_SYSTEM_SETTINGS,
  type AdminSection,
} from "@/lib/admin/constants";
import { exportToCsv } from "@/lib/admin/csv";
import {
  formatDateTime,
  formatEtb,
  formatNumber,
  statusTone,
  titleCase,
} from "@/lib/admin/format";

type AdminArgs = { player_id: string; session_token?: string };

function adminArgs(session: AdminAuthSession): AdminArgs {
  return {
    player_id: session.player.id,
    session_token: session.session_token,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Only accept sessions that carry a real database player id. This discards
 * legacy demo sessions ("demo-admin") left in localStorage by older builds.
 */
function readStoredSession(): AdminAuthSession | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminAuthSession;
    if (!parsed?.player?.id || !UUID_PATTERN.test(parsed.player.id) || !parsed.player.is_admin) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
}

function isAuthFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("admin access required") ||
    normalized.includes("player not found") ||
    normalized.includes("invalid input syntax for type uuid") ||
    normalized.includes("unauthorized") ||
    normalized.includes("invalid credentials")
  );
}

function sectionFromHash(): AdminSection {
  const hash = window.location.hash.replace("#", "") as AdminSection;
  return ADMIN_SECTIONS.some((section) => section.id === hash) ? hash : "overview";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(status)}`}
    >
      {titleCase(status)}
    </span>
  );
}

export default function AdminPage() {
  const { setTheme } = useTheme();
  const { player: currentPlayer, loading: identityLoading } = useTelegramIdentity();
  const [session, setSession] = useState<AdminAuthSession | null>(() => readStoredSession());
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULT_SYSTEM_SETTINGS);
  const [activeSection, setActiveSection] = useState<AdminSection>(sectionFromHash);
  const [pageLoading, setPageLoading] = useState(() => Boolean(readStoredSession()));
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [adjustments, setAdjustments] = useState<Record<string, string>>({});

  const activeMeta = useMemo(
    () => ADMIN_SECTIONS.find((section) => section.id === activeSection) ?? ADMIN_SECTIONS[0],
    [activeSection],
  );

  const loadSettings = useCallback(async (authSession: AdminAuthSession) => {
    const args = adminArgs(authSession);
    try {
      const result = await api.getSystemSettings(args.player_id, args.session_token);
      setSettings({ ...DEFAULT_SYSTEM_SETTINGS, ...result.settings });
    } catch {
      setSettings(DEFAULT_SYSTEM_SETTINGS);
    }
  }, []);

  const loadAdmin = useCallback(
    async (authSession: AdminAuthSession, showRefresh = false) => {
      if (!authSession.player?.is_admin) {
        setPageLoading(false);
        return;
      }

      if (showRefresh) setRefreshing(true);
      else setPageLoading(true);

      const args = adminArgs(authSession);
      try {
        const [result] = await Promise.all([
          api.getAdminSummary(args.player_id, args.session_token),
          loadSettings(authSession),
        ]);
        setSummary(result);
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        setSummary(null);
        // A rejected session is unusable — drop it and return to the login form.
        if (isAuthFailure(message)) {
          localStorage.removeItem(ADMIN_SESSION_KEY);
          setSession(null);
          toast.error("Your admin session expired. Please sign in again.");
        } else {
          toast.error(message);
        }
      } finally {
        setPageLoading(false);
        setRefreshing(false);
      }
    },
    [loadSettings],
  );

  useEffect(() => {
    if (!hasStoredThemePreference()) {
      setTheme("light");
    }
  }, [setTheme]);

  // Local development convenience: an already admin-enabled Telegram player
  // may enter without the separate email/password prompt. Production always
  // requires a normal admin session.
  useEffect(() => {
    if (!import.meta.env.DEV || session || identityLoading || !currentPlayer?.is_admin) return;
    setSession({ player: currentPlayer });
  }, [currentPlayer, identityLoading, session]);

  useEffect(() => {
    if (session?.player?.is_admin) {
      void loadAdmin(session);
    } else {
      setPageLoading(false);
    }
  }, [session, loadAdmin]);

  useEffect(() => {
    function syncSectionFromHash() {
      setActiveSection(sectionFromHash());
    }

    syncSectionFromHash();
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, []);

  function navigateAdmin(section: AdminSection) {
    setActiveSection(section);
    window.history.replaceState(null, "", `/admin#${section}`);
  }

  async function handleAdminLogin() {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      toast.error("Enter admin email and password");
      return;
    }

    setLoginLoading(true);
    setSummary(null);
    try {
      const authSession = await api.adminLogin(loginEmail.trim(), loginPassword);
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(authSession));
      setSession(authSession);
      toast.success("Admin login successful");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    const token = session?.session_token;
    try {
      if (token) await api.adminLogout(token);
    } catch {
      // Clear local session even if server logout fails.
    }
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setSession(null);
    setSummary(null);
    setPageLoading(false);
    toast.success("Logged out");
  }

  async function runAdminAction<T>(
    key: string,
    action: (args: AdminArgs) => Promise<T>,
    successMessage: string,
    refresh = true,
  ) {
    if (!session?.player) return;
    setBusy(key);
    try {
      await action(adminArgs(session));
      toast.success(successMessage);
      if (refresh) await loadAdmin(session, true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleWalletRequest(requestId: number, approve: boolean) {
    if (!session?.player) return;
    await runAdminAction(
      `request-${requestId}`,
      (args) => api.processWalletRequest(args.player_id, requestId, approve, args.session_token),
      approve ? "Wallet request approved" : "Wallet request rejected",
    );
  }

  async function handleCloseRoom(roomId: string) {
    await runAdminAction(
      `room-${roomId}`,
      (args) => api.closeRoomAsAdmin(args.player_id, roomId, args.session_token),
      "Room closed",
    );
  }

  async function handleForceFinishRoom(roomId: string) {
    await runAdminAction(
      `force-finish-${roomId}`,
      (args) => api.adminForceFinishRoom(args.player_id, roomId, args.session_token),
      "Room force finished",
    );
  }

  async function handleAdvanceRoomRound(roomId: string) {
    await runAdminAction(
      `advance-${roomId}`,
      (args) => api.adminAdvanceRoomRound(args.player_id, roomId, args.session_token),
      "Moved to next round",
    );
  }

  async function handleResetRoomState(roomId: string) {
    await runAdminAction(
      `reset-${roomId}`,
      (args) => api.adminResetRoomState(args.player_id, roomId, args.session_token),
      "Room state reset",
    );
  }

  async function handleToggleAdmin(targetPlayerId: string, nextAdmin: boolean) {
    await runAdminAction(
      `admin-${targetPlayerId}`,
      (args) => api.adminSetUserAdmin(args.player_id, targetPlayerId, nextAdmin, args.session_token),
      nextAdmin ? "User promoted to admin" : "Admin access removed",
    );
  }

  async function handleToggleBlocked(targetPlayerId: string, nextBlocked: boolean) {
    await runAdminAction(
      `blocked-${targetPlayerId}`,
      (args) => api.adminSetUserBlocked(args.player_id, targetPlayerId, nextBlocked, args.session_token),
      nextBlocked ? "User blocked" : "User unblocked",
    );
  }

  async function handleAdjustWallet(targetPlayerId: string, wallet: "main" | "play") {
    if (!session?.player) return;
    const amount = Math.trunc(Number(adjustments[targetPlayerId]) || 0);
    if (amount === 0) {
      toast.error("Enter a positive or negative adjustment amount");
      return;
    }

    await runAdminAction(
      `wallet-${targetPlayerId}`,
      (args) =>
        api.adminAdjustWallet(
          args.player_id,
          targetPlayerId,
          wallet,
          amount,
          "Admin dashboard adjustment",
          args.session_token,
        ),
      "Wallet adjusted",
    );
    setAdjustments((prev) => ({ ...prev, [targetPlayerId]: "" }));
  }

  async function handleWorkerTick() {
    if (!session?.player) return;
    setBusy("worker-tick");
    try {
      const result = await api.workerTickRooms(`admin-${session.player.id}`);
      toast.success(`Worker processed ${result.results?.length ?? 0} room action(s)`);
      await loadAdmin(session, true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveSettings() {
    if (!session?.player) return;
    const args = adminArgs(session);
    setSavingSettings(true);
    try {
      await api.updateSystemSettings(args.player_id, settings, args.session_token);
      toast.success("System settings saved");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingSettings(false);
    }
  }

  const players = useMemo(() => summary?.users ?? [], [summary?.users]);
  const liveRooms = useMemo(
    () =>
      (summary?.rooms ?? []).filter(
        (room) => room.status === "live" || room.status === "lobby" || room.status === "paused",
      ),
    [summary?.rooms],
  );
  const depositRequests = useMemo(
    () => (summary?.requests ?? []).filter((request) => request.kind === "deposit"),
    [summary?.requests],
  );
  const withdrawalRequests = useMemo(
    () => (summary?.requests ?? []).filter((request) => request.kind === "withdrawal"),
    [summary?.requests],
  );
  const pendingRequests = useMemo(
    () => (summary?.requests ?? []).filter((request) => request.status === "pending"),
    [summary?.requests],
  );

  const playersTable = usePaginatedRows<Player>({
    rows: players,
    pageSize: 15,
    initialSortKey: "created_at",
    initialSortDirection: "desc",
    searchAccessor: (player) =>
      [player.username, player.telegram_id, player.phone_number ?? ""].join(" ").toLowerCase(),
    sortAccessor: (player, key) => {
      switch (key) {
        case "username":
          return player.username.toLowerCase();
        case "main_wallet":
          return player.main_wallet_balance ?? player.wallet_balance;
        case "play_wallet":
          return player.play_wallet_balance ?? player.wallet_balance;
        case "created_at":
          return new Date(player.created_at).getTime();
        default:
          return String((player as Record<string, unknown>)[key] ?? "");
      }
    },
  });

  const playerColumns = useMemo<AdminColumn<Player>[]>(
    () => [
      {
        key: "username",
        header: "Player",
        sortable: true,
        render: (player) => (
          <div>
            <p className="font-semibold text-foreground">{player.username}</p>
            <p className="text-xs text-muted-foreground">{player.telegram_id}</p>
          </div>
        ),
        exportValue: (player) => player.username,
      },
      {
        key: "phone_number",
        header: "Phone",
        render: (player) => <span className="text-muted-foreground">{player.phone_number ?? "—"}</span>,
        exportValue: (player) => player.phone_number ?? "",
      },
      {
        key: "main_wallet",
        header: "Main",
        sortable: true,
        render: (player) => (
          <span className="font-semibold">{formatEtb(player.main_wallet_balance ?? player.wallet_balance)}</span>
        ),
        exportValue: (player) => player.main_wallet_balance ?? player.wallet_balance,
      },
      {
        key: "play_wallet",
        header: "Play",
        sortable: true,
        render: (player) => (
          <span className="font-semibold">{formatEtb(player.play_wallet_balance ?? player.wallet_balance)}</span>
        ),
        exportValue: (player) => player.play_wallet_balance ?? player.wallet_balance,
      },
      {
        key: "role",
        header: "Role",
        render: (player) => (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
              player.is_admin ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {player.is_admin ? "Admin" : "Player"}
          </span>
        ),
        exportValue: (player) => (player.is_admin ? "admin" : "player"),
      },
      {
        key: "status",
        header: "Status",
        render: (player) => <StatusBadge status={player.is_blocked ? "blocked" : "active"} />,
        exportValue: (player) => (player.is_blocked ? "blocked" : "active"),
      },
      {
        key: "created_at",
        header: "Joined",
        sortable: true,
        render: (player) => <span className="text-muted-foreground">{formatDateTime(player.created_at)}</span>,
        exportValue: (player) => player.created_at,
      },
      {
        key: "actions",
        header: "Actions",
        className: "min-w-[420px]",
        render: (player) => (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Input
                type="number"
                placeholder="+/- amount"
                value={adjustments[player.id] ?? ""}
                onChange={(event) =>
                  setAdjustments((prev) => ({ ...prev, [player.id]: event.target.value }))
                }
                className="h-8 w-28"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => handleAdjustWallet(player.id, "main")}
                disabled={busy !== null}
              >
                Main
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => handleAdjustWallet(player.id, "play")}
                disabled={busy !== null}
              >
                Play
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={player.is_admin ? "destructive" : "default"}
                onClick={() => handleToggleAdmin(player.id, !player.is_admin)}
                disabled={busy !== null || player.id === session?.player.id}
              >
                {busy === `admin-${player.id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : player.is_admin ? (
                  "Remove admin"
                ) : (
                  "Make admin"
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={player.is_blocked ? "secondary" : "destructive"}
                onClick={() => handleToggleBlocked(player.id, !player.is_blocked)}
                disabled={busy !== null || player.id === session?.player.id}
              >
                {busy === `blocked-${player.id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : player.is_blocked ? (
                  "Unblock"
                ) : (
                  "Block"
                )}
              </Button>
            </div>
          </div>
        ),
      },
    ],
    [adjustments, busy, session?.player.id],
  );

  function exportPlayersCsv() {
    const exportColumns = playerColumns.filter((column) => column.exportValue);
    exportToCsv(
      "players.csv",
      exportColumns.map((column) => column.header),
      players.map((player) => exportColumns.map((column) => column.exportValue!(player))),
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen w-full bg-background px-5 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center justify-center">
          <section className="w-full rounded-2xl border border-border bg-card p-8 shadow-card">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Shield className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Admin Login</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in with your administrator credentials to access the operations dashboard.
              </p>
            </div>

            <div className="space-y-3">
              <Input
                type="email"
                placeholder="Admin email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                autoComplete="username"
              />
              <Input
                type="password"
                placeholder="Password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                autoComplete="current-password"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleAdminLogin();
                }}
              />
            </div>

            <Button
              type="button"
              size="lg"
              className="mt-5 w-full font-semibold"
              onClick={() => void handleAdminLogin()}
              disabled={loginLoading}
            >
              {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </section>
        </div>
      </main>
    );
  }

  if (pageLoading || !summary) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Loading admin dashboard…</p>
        </div>
      </main>
    );
  }

  if (!session.player?.is_admin) {
    return (
      <main className="min-h-screen w-full bg-background px-5 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center justify-center">
          <section className="w-full rounded-2xl border border-border bg-card p-8 text-center shadow-card">
            <Shield className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Admin access required</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This dashboard is available only for admin-enabled accounts.
            </p>
            <Button type="button" variant="secondary" className="mt-5" onClick={() => void handleLogout()}>
              Back to login
            </Button>
          </section>
        </div>
      </main>
    );
  }

  const totals = summary.totals;
  const netProfit = totals.net_profit ?? totals.total_revenue - totals.total_payouts;

  return (
    <main className="min-h-screen w-full bg-background">
      <div className="mx-auto flex w-full max-w-[90rem] flex-col lg:flex-row">
        <aside className="shrink-0 border-b border-border bg-card px-4 py-5 shadow-card lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-primary p-3 text-primary-foreground shadow-card">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight text-foreground">Admin Panel</h1>
              <p className="text-xs text-muted-foreground">Bingo Blitz Operations</p>
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {ADMIN_SECTIONS.map((section) => (
              <AdminNavLink
                key={section.id}
                label={section.label}
                active={activeSection === section.id}
                onClick={() => navigateAdmin(section.id)}
              />
            ))}
          </nav>

          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signed in as</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{session.player.username}</p>
          </div>

          <Button type="button" variant="outline" className="mt-4 w-full gap-2" onClick={() => void handleLogout()}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <header className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Operations Center</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  {activeMeta.label}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{activeMeta.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ThemeToggle variant="menu" />
                <Button type="button" variant="outline" onClick={() => void handleWorkerTick()} disabled={busy !== null}>
                  {busy === "worker-tick" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Radio className="mr-2 h-4 w-4" />
                      Worker tick
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void loadAdmin(session, true)}
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh
                    </>
                  )}
                </Button>
              </div>
            </div>
          </header>

          {activeSection === "overview" && (
            <section className="space-y-4">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <MetricCard icon={<Users className="h-4 w-4" />} label="Total Users" value={totals.total_users} />
                <MetricCard
                  icon={<Activity className="h-4 w-4" />}
                  label="Active Players"
                  value={totals.active_players ?? 0}
                />
                <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Total Rooms" value={totals.total_rooms ?? 0} />
                <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Active Rooms" value={totals.active_rooms} />
                <MetricCard icon={<Coins className="h-4 w-4" />} label="Live Rooms" value={totals.live_rooms} />
                <MetricCard icon={<Radio className="h-4 w-4" />} label="Paused Rooms" value={totals.paused_rooms ?? 0} />
                <MetricCard icon={<XCircle className="h-4 w-4" />} label="Closed Rooms" value={totals.closed_rooms ?? 0} />
                <MetricCard
                  icon={<Wallet className="h-4 w-4" />}
                  label="Pending Requests"
                  value={totals.pending_wallet_requests}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <FinanceMetricCard label="Revenue" value={totals.total_revenue} tone="text-amber-600" />
                <FinanceMetricCard label="Payouts" value={totals.total_payouts} tone="text-primary" />
                <FinanceMetricCard label="Deposits" value={totals.total_deposits ?? 0} tone="text-emerald-600" />
                <FinanceMetricCard label="Net Profit" value={netProfit} tone="text-foreground" />
              </div>
            </section>
          )}

          {activeSection === "live" && (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-foreground">Live Operations</h3>
                  <p className="text-sm text-muted-foreground">
                    Active lobbies and live games. Use worker tick to advance server-side clocks.
                  </p>
                </div>
                <Button type="button" size="sm" onClick={() => void handleWorkerTick()} disabled={busy !== null}>
                  {busy === "worker-tick" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run worker tick"}
                </Button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                {liveRooms.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No active rooms.</p>
                ) : (
                  <table className="w-full min-w-[960px] text-sm">
                    <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Code</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Stake</th>
                        <th className="px-4 py-3">Derash</th>
                        <th className="px-4 py-3">Players</th>
                        <th className="px-4 py-3">Called</th>
                        <th className="px-4 py-3">Last</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {liveRooms.map((room) => (
                        <tr key={room.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-mono font-semibold">{room.code}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={room.status} />
                          </td>
                          <td className="px-4 py-3">{formatEtb(room.stake_amount)}</td>
                          <td className="px-4 py-3 font-semibold text-amber-600">{formatEtb(room.derash)}</td>
                          <td className="px-4 py-3">{room.active_players_count ?? 0}</td>
                          <td className="px-4 py-3">
                            {room.called_numbers?.length ?? Math.max(0, room.current_index + 1)}
                          </td>
                          <td className="px-4 py-3">{room.last_called_number ?? "—"}</td>
                          <td className="px-4 py-3">
                            <RoomActionButtons
                              room={room}
                              busy={busy}
                              onClose={handleCloseRoom}
                              onForceFinish={handleForceFinishRoom}
                              onAdvance={handleAdvanceRoomRound}
                              onReset={handleResetRoomState}
                              compact
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}

          {activeSection === "reports" && (
            <section className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <FinanceMetricCard label="Deposits" value={totals.total_deposits ?? 0} tone="text-emerald-600" />
                <FinanceMetricCard label="Withdrawals" value={totals.total_withdrawals ?? 0} tone="text-destructive" />
                <FinanceMetricCard label="Net Profit" value={netProfit} tone="text-amber-600" />
                <MetricCard icon={<FileText className="h-4 w-4" />} label="Transactions" value={summary.transactions.length} />
              </div>
              <AdminFinancialCharts summary={summary} />
            </section>
          )}

          {activeSection === "players" && (
            <AdminDataTable
              title="Player Management"
              description="Search users, promote admins, block accounts, and adjust wallets."
              columns={playerColumns}
              rows={playersTable.rows}
              rowKey={(player) => player.id}
              search={playersTable.search}
              onSearchChange={playersTable.setSearch}
              searchPlaceholder="Search username, Telegram ID, or phone"
              page={playersTable.page}
              totalPages={playersTable.totalPages}
              totalRows={playersTable.totalRows}
              pageSize={playersTable.pageSize}
              onPageChange={playersTable.setPage}
              sortKey={playersTable.sortKey}
              sortDirection={playersTable.sortDirection}
              onSort={playersTable.toggleSort}
              onExport={exportPlayersCsv}
              loading={refreshing}
              emptyMessage="No players found."
            />
          )}

          {activeSection === "rooms" && (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 text-base font-bold text-foreground">Rooms</h3>
              <div className="overflow-x-auto rounded-xl border border-border">
                {summary.rooms.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No rooms found.</p>
                ) : (
                  <table className="w-full min-w-[1200px] text-sm">
                    <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Room</th>
                        <th className="px-4 py-3">Code</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Stake</th>
                        <th className="px-4 py-3">Pot</th>
                        <th className="px-4 py-3">Players</th>
                        <th className="px-4 py-3">Called</th>
                        <th className="px-4 py-3">Winner</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {summary.rooms.map((room) => (
                        <tr key={room.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-semibold">{room.room_name ?? room.code}</td>
                          <td className="px-4 py-3 font-mono">{room.code}</td>
                          <td className="px-4 py-3">{room.is_private ? "Private" : "Public"}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={room.status} />
                          </td>
                          <td className="px-4 py-3">{formatEtb(room.stake_amount)}</td>
                          <td className="px-4 py-3">{formatEtb(room.derash)}</td>
                          <td className="px-4 py-3">
                            {room.active_players_count ?? 0}/{room.joined_players_count ?? 0}
                          </td>
                          <td className="px-4 py-3">{room.called_numbers?.length ?? 0}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {room.winner_name ?? room.winning_line ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <RoomActionButtons
                              room={room}
                              busy={busy}
                              onClose={handleCloseRoom}
                              onForceFinish={handleForceFinishRoom}
                              onAdvance={handleAdvanceRoomRound}
                              onReset={handleResetRoomState}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}

          {activeSection === "deposits" && (
            <WalletRequestSection
              title="Deposit Queue"
              description="Review and approve incoming deposit requests."
              requests={depositRequests}
              busy={busy}
              onProcess={handleWalletRequest}
              approveLabel="Approve"
            />
          )}

          {activeSection === "withdrawals" && (
            <WalletRequestSection
              title="Withdrawal Queue"
              description="Review and approve outgoing withdrawal requests."
              requests={withdrawalRequests}
              busy={busy}
              onProcess={handleWalletRequest}
              approveLabel="Mark paid"
            />
          )}

          {activeSection === "transactions" && (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 text-base font-bold text-foreground">Recent Transactions</h3>
              <div className="space-y-2">
                {summary.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transactions found.</p>
                ) : (
                  summary.transactions.map((transaction) => (
                    <TransactionRow key={transaction.id} transaction={transaction} />
                  ))
                )}
              </div>
            </section>
          )}

          {activeSection === "wallet" && (
            <WalletRequestSection
              title="Wallet Queue"
              description="All pending wallet requests across deposits and withdrawals."
              requests={pendingRequests}
              busy={busy}
              onProcess={handleWalletRequest}
              approveLabel="Approve"
            />
          )}

          {activeSection === "settings" && (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="mb-5 flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">System Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Authoritative game rules and platform configuration shared across all clients.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(settings).map(([key, value]) => (
                  <label key={key} className="space-y-2 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {titleCase(key)}
                    </span>
                    <Input
                      value={value}
                      onChange={(event) =>
                        setSettings((prev) => ({
                          ...prev,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>

              <Button type="button" className="mt-5" onClick={() => void handleSaveSettings()} disabled={savingSettings}>
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save settings"}
              </Button>
            </section>
          )}

          {activeSection === "audit" && (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 text-base font-bold text-foreground">Audit Logs</h3>
              <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                {(summary.audit_logs ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No audit logs found.</p>
                ) : (
                  (summary.audit_logs ?? []).map((log) => (
                    <div key={log.id} className="rounded-xl border border-border bg-muted/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">{titleCase(log.action)}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        Player: {log.player_id ?? "system"}
                        {log.room_id ? ` · Room: ${log.room_id}` : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function AdminNavLink({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted/40 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{formatNumber(value)}</p>
    </div>
  );
}

function FinanceMetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone}`}>{formatEtb(value)}</p>
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const positive = transaction.amount >= 0;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4">
      <div>
        <p className="font-semibold text-foreground">{titleCase(transaction.kind)}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(transaction.created_at)}</p>
      </div>
      <div className="text-right">
        <p className={`flex items-center justify-end gap-1 font-bold ${positive ? "text-emerald-600" : "text-destructive"}`}>
          {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          {formatEtb(transaction.amount)}
        </p>
        <p className="text-xs text-muted-foreground">Balance {formatEtb(transaction.balance_after)}</p>
      </div>
    </div>
  );
}

function WalletRequestSection({
  title,
  description,
  requests,
  busy,
  onProcess,
  approveLabel,
}: {
  title: string;
  description: string;
  requests: WalletRequest[];
  busy: string | null;
  onProcess: (requestId: number, approve: boolean) => Promise<void>;
  approveLabel: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-2">
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests in this queue.</p>
        ) : (
          requests.map((request) => (
            <div key={request.id} className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">
                    {titleCase(request.kind)} #{request.id}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(request.created_at)}</p>
                  {request.note && <p className="mt-1 text-xs text-muted-foreground">{request.note}</p>}
                </div>
                <div className="text-right">
                  <p
                    className={`font-bold ${
                      request.kind === "deposit" ? "text-emerald-600" : "text-destructive"
                    }`}
                  >
                    {request.kind === "deposit" ? "+" : "-"}
                    {formatEtb(request.amount)}
                  </p>
                  <StatusBadge status={request.status} />
                </div>
              </div>
              {request.status === "pending" && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void onProcess(request.id, true)}
                    disabled={busy !== null}
                  >
                    {busy === `request-${request.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : approveLabel}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void onProcess(request.id, false)}
                    disabled={busy !== null}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function RoomActionButtons({
  room,
  busy,
  onClose,
  onForceFinish,
  onAdvance,
  onReset,
  compact = false,
}: {
  room: Room;
  busy: string | null;
  onClose: (roomId: string) => Promise<void>;
  onForceFinish: (roomId: string) => Promise<void>;
  onAdvance: (roomId: string) => Promise<void>;
  onReset: (roomId: string) => Promise<void>;
  compact?: boolean;
}) {
  const buttonSize = compact ? "sm" : "sm";

  return (
    <div className={`flex justify-end gap-2 ${compact ? "flex-wrap" : "flex-wrap"}`}>
      {room.status !== "finished" && !room.closed_by_admin && (
        <Button
          type="button"
          size={buttonSize}
          variant="destructive"
          onClick={() => void onClose(room.id)}
          disabled={busy !== null}
        >
          {busy === `room-${room.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Close"}
        </Button>
      )}
      {room.status !== "finished" && (
        <Button
          type="button"
          size={buttonSize}
          variant="secondary"
          onClick={() => void onForceFinish(room.id)}
          disabled={busy !== null}
        >
          {busy === `force-finish-${room.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finish"}
        </Button>
      )}
      <Button
        type="button"
        size={buttonSize}
        variant="secondary"
        onClick={() => void onAdvance(room.id)}
        disabled={busy !== null}
      >
        {busy === `advance-${room.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Next round"}
      </Button>
      <Button
        type="button"
        size={buttonSize}
        variant="outline"
        onClick={() => void onReset(room.id)}
        disabled={busy !== null}
      >
        {busy === `reset-${room.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset"}
      </Button>
    </div>
  );
}
