import { useEffect, useMemo, useState } from "react";
import { BarChart3, Coins, Loader2, Radio, RefreshCw, Shield, Users, Wallet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTelegramIdentity } from "@/hooks/useTelegramIdentity";
import { api, type AdminAuthSession, type AdminSummary, getErrorMessage } from "@/lib/api";
import { toast } from "sonner";

type AdminSection = "overview" | "reports" | "users" | "rooms" | "transactions" | "wallet" | "audit";

const ADMIN_SECTIONS: Array<{ id: AdminSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "reports", label: "Reports" },
  { id: "users", label: "Users" },
  { id: "rooms", label: "Rooms" },
  { id: "transactions", label: "Transactions" },
  { id: "wallet", label: "Wallet" },
  { id: "audit", label: "Audit Logs" },
];

const ADMIN_SESSION_KEY = "yegara.admin.session";
const DEMO_ADMIN_EMAIL = "admin@test.com";
const DEMO_ADMIN_PASSWORD = "admin123";
const DEMO_ADMIN_ID = "demo-admin";

function emptyAdminSummary(): AdminSummary {
  return {
    totals: {
      total_users: 0,
      active_rooms: 0,
      live_rooms: 0,
      pending_wallet_requests: 0,
      total_revenue: 0,
      total_payouts: 0,
    },
    rooms: [],
    transactions: [],
    requests: [],
  };
}

function demoAdminSummary(): AdminSummary {
  return {
    totals: {
      total_users: 248,
      total_rooms: 36,
      active_players: 91,
      active_rooms: 7,
      live_rooms: 3,
      paused_rooms: 1,
      closed_rooms: 4,
      pending_wallet_requests: 6,
      total_revenue: 18450,
      total_payouts: 12780,
      total_deposits: 22600,
      total_withdrawals: 9350,
      net_profit: 5670,
    },
    users: [
      {
        id: "u-1",
        telegram_id: "556001",
        username: "Betty",
        phone_number: "251911111111",
        wallet_balance: 900,
        main_wallet_balance: 1400,
        play_wallet_balance: 900,
        is_admin: false,
        is_blocked: false,
        created_at: new Date().toISOString(),
      },
      {
        id: "u-2",
        telegram_id: "556002",
        username: "Nathan",
        phone_number: "251922222222",
        wallet_balance: 430,
        main_wallet_balance: 800,
        play_wallet_balance: 430,
        is_admin: false,
        is_blocked: true,
        created_at: new Date().toISOString(),
      },
      {
        id: "u-3",
        telegram_id: "556003",
        username: "Selam",
        phone_number: "251933333333",
        wallet_balance: 1220,
        main_wallet_balance: 1700,
        play_wallet_balance: 1220,
        is_admin: true,
        is_blocked: false,
        created_at: new Date().toISOString(),
      },
    ],
    rooms: [
      {
        id: "r-1",
        code: "AB12C",
        game_id: "BB-20260619-AAA1",
        room_name: "Evening 20 Br",
        is_private: false,
        host_id: "u-3",
        status: "live",
        stake_amount: 20,
        house_commission_pct: 15,
        derash: 920,
        call_interval_ms: 3000,
        lobby_seconds: 30,
        lobby_ends_at: new Date().toISOString(),
        current_index: 17,
        call_sequence: Array.from({ length: 75 }, (_, i) => i + 1),
        called_numbers: [4, 18, 22, 31, 45, 50, 61, 10, 27, 33, 54, 69, 2, 14, 29, 38, 57, 72],
        last_called_number: 72,
        winner_id: null,
        winner_name: null,
        winning_line: null,
        joined_players_count: 12,
        active_players_count: 10,
        watcher_count: 2,
        joined_players: [
          { player_id: "u-1", username: "Betty", role: "player", selected_cartelas: [7, 19], false_claims: 0, marked_count: 8 },
          { player_id: "u-2", username: "Nathan", role: "watcher", selected_cartelas: [], false_claims: 0, marked_count: 0 },
          { player_id: "u-3", username: "Selam", role: "player", selected_cartelas: [3], false_claims: 0, marked_count: 9 },
        ],
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        finished_at: null,
      },
      {
        id: "r-2",
        code: "ZX91Q",
        game_id: "BB-20260619-BBB2",
        room_name: "VIP Private",
        is_private: true,
        host_id: "u-3",
        status: "paused",
        stake_amount: 50,
        house_commission_pct: 15,
        derash: 600,
        call_interval_ms: 3000,
        lobby_seconds: 30,
        lobby_ends_at: new Date().toISOString(),
        current_index: 9,
        call_sequence: Array.from({ length: 75 }, (_, i) => i + 1),
        called_numbers: [5, 9, 16, 24, 32, 40, 44, 58, 63, 71],
        last_called_number: 71,
        winner_id: "u-1",
        winner_name: "Betty",
        winning_line: "Card 1 · Row 4",
        joined_players_count: 6,
        active_players_count: 6,
        watcher_count: 0,
        joined_players: [
          { player_id: "u-1", username: "Betty", role: "player", selected_cartelas: [15], false_claims: 0, marked_count: 10 },
          { player_id: "u-3", username: "Selam", role: "player", selected_cartelas: [9, 11], false_claims: 0, marked_count: 7 },
        ],
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        finished_at: null,
      },
    ],
    transactions: [
      { id: 1, player_id: "u-1", room_id: "r-1", kind: "stake", amount: -40, balance_after: 900, created_at: new Date().toISOString() },
      { id: 2, player_id: "u-3", room_id: "r-2", kind: "payout", amount: 510, balance_after: 1220, created_at: new Date().toISOString() },
      { id: 3, player_id: "u-2", room_id: null, kind: "deposit", amount: 300, balance_after: 800, created_at: new Date().toISOString() },
    ],
    requests: [
      { id: 101, player_id: "u-1", kind: "deposit", amount: 500, status: "pending", note: "provider=telebirr | reference=TB12345", created_at: new Date().toISOString() },
      { id: 102, player_id: "u-2", kind: "withdrawal", amount: 200, status: "pending", note: "method=bank | account=CBE-00991", created_at: new Date().toISOString() },
    ],
    audit_logs: [
      { id: 1001, room_id: null, player_id: "u-3", action: "admin_login", payload: {}, created_at: new Date().toISOString() },
      { id: 1002, room_id: "r-1", player_id: "u-3", action: "admin_force_finish_room", payload: { previous_status: "live" }, created_at: new Date().toISOString() },
      { id: 1003, room_id: null, player_id: "u-3", action: "wallet_request_approved", payload: { request_id: 101 }, created_at: new Date().toISOString() },
    ],
  };
}

export default function AdminPage() {
  const { loading } = useTelegramIdentity();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [adjustments, setAdjustments] = useState<Record<string, string>>({});
  const [adminSession, setAdminSession] = useState<AdminAuthSession | null>(() => {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? JSON.parse(raw) as AdminAuthSession : null;
  });
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [activeSection, setActiveSection] = useState<AdminSection>(() => {
    const hash = window.location.hash.replace("#", "") as AdminSection;
    return ADMIN_SECTIONS.some((section) => section.id === hash) ? hash : "overview";
  });

  async function loadAdmin(showRefresh = false) {
    if (!adminSession?.player?.is_admin) {
      setPageLoading(false);
      return;
    }

    if (adminSession.player.id === DEMO_ADMIN_ID) {
      setSummary(demoAdminSummary());
      setPageLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefresh) setRefreshing(true);
    else setPageLoading(true);

    try {
      const result = await api.getAdminSummary(adminSession.player.id);
      setSummary(result);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
      setSummary(null);
    } finally {
      setPageLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAdmin();
  }, [adminSession?.player?.id, adminSession?.player?.is_admin]);

  useEffect(() => {
    function syncSectionFromHash() {
      const hash = window.location.hash.replace("#", "") as AdminSection;
      if (ADMIN_SECTIONS.some((section) => section.id === hash)) {
        setActiveSection(hash);
      }
    }

    syncSectionFromHash();
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, []);

  async function handleAdminLogin() {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      toast.error("Enter admin email and password");
      return;
    }

    if (loginEmail.trim().toLowerCase() === DEMO_ADMIN_EMAIL && loginPassword === DEMO_ADMIN_PASSWORD) {
      const demoSession: AdminAuthSession = {
        player: {
          id: DEMO_ADMIN_ID,
          telegram_id: DEMO_ADMIN_ID,
          username: "Demo Admin",
          wallet_balance: 0,
          main_wallet_balance: 0,
          play_wallet_balance: 0,
          is_admin: true,
          is_blocked: false,
          created_at: new Date().toISOString(),
        },
      };
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(demoSession));
      setAdminSession(demoSession);
      setSummary(demoAdminSummary());
      setPageLoading(false);
      toast.success("Demo admin login successful");
      return;
    }

    setPageLoading(true);
    try {
      const session = await api.adminLogin(loginEmail.trim(), loginPassword);
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      setAdminSession(session);
      toast.success("Admin login successful");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setPageLoading(false);
    }
  }

  function navigateAdmin(section: AdminSection) {
    setActiveSection(section);
    window.history.replaceState(null, "", `/admin#${section}`);
  }

  function handleLogout() {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setAdminSession(null);
    setSummary(null);
    toast.success("Logged out");
  }

  async function handleWalletRequest(requestId: number, approve: boolean) {
    if (!adminSession?.player) return;
    if (adminSession.player.id === DEMO_ADMIN_ID) {
      toast.info("Wallet actions are disabled in demo mode");
      return;
    }
    setBusy(`request-${requestId}`);
    try {
      await api.processWalletRequest(adminSession.player.id, requestId, approve);
      toast.success(approve ? "Wallet request approved" : "Wallet request rejected");
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleCloseRoom(roomId: string) {
    if (!adminSession?.player) return;
    if (adminSession.player.id === DEMO_ADMIN_ID) {
      toast.info("Room actions are disabled in demo mode");
      return;
    }
    setBusy(`room-${roomId}`);
    try {
      await api.closeRoomAsAdmin(adminSession.player.id, roomId);
      toast.success("Room closed");
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleForceFinishRoom(roomId: string) {
    if (!adminSession?.player) return;
    if (adminSession.player.id === DEMO_ADMIN_ID) {
      toast.info("Room actions are disabled in demo mode");
      return;
    }
    setBusy(`force-finish-${roomId}`);
    try {
      await api.adminForceFinishRoom(adminSession.player.id, roomId);
      toast.success("Room force finished");
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleAdvanceRoomRound(roomId: string) {
    if (!adminSession?.player) return;
    if (adminSession.player.id === DEMO_ADMIN_ID) {
      toast.info("Room actions are disabled in demo mode");
      return;
    }
    setBusy(`advance-${roomId}`);
    try {
      await api.adminAdvanceRoomRound(adminSession.player.id, roomId);
      toast.success("Moved to next round");
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleResetRoomState(roomId: string) {
    if (!adminSession?.player) return;
    if (adminSession.player.id === DEMO_ADMIN_ID) {
      toast.info("Room actions are disabled in demo mode");
      return;
    }
    setBusy(`reset-${roomId}`);
    try {
      await api.adminResetRoomState(adminSession.player.id, roomId);
      toast.success("Room state reset");
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleAdmin(targetPlayerId: string, nextAdmin: boolean) {
    if (!adminSession?.player) return;
    if (adminSession.player.id === DEMO_ADMIN_ID) {
      toast.info("User admin changes are disabled in demo mode");
      return;
    }
    setBusy(`admin-${targetPlayerId}`);
    try {
      await api.adminSetUserAdmin(adminSession.player.id, targetPlayerId, nextAdmin);
      toast.success(nextAdmin ? "User promoted to admin" : "Admin access removed");
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleBlocked(targetPlayerId: string, nextBlocked: boolean) {
    if (!adminSession?.player) return;
    if (adminSession.player.id === DEMO_ADMIN_ID) {
      toast.info("User blocking is disabled in demo mode");
      return;
    }
    setBusy(`blocked-${targetPlayerId}`);
    try {
      await api.adminSetUserBlocked(adminSession.player.id, targetPlayerId, nextBlocked);
      toast.success(nextBlocked ? "User blocked" : "User unblocked");
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleAdjustWallet(targetPlayerId: string, wallet: "main" | "play") {
    if (!adminSession?.player) return;
    if (adminSession.player.id === DEMO_ADMIN_ID) {
      toast.info("Wallet adjustment is disabled in demo mode");
      return;
    }
    const amount = Math.trunc(Number(adjustments[targetPlayerId]) || 0);
    if (amount === 0) {
      toast.error("Enter a positive or negative adjustment amount");
      return;
    }
    setBusy(`wallet-${targetPlayerId}`);
    try {
      await api.adminAdjustWallet(adminSession.player.id, targetPlayerId, wallet, amount, "Admin dashboard adjustment");
      toast.success("Wallet adjusted");
      setAdjustments((prev) => ({ ...prev, [targetPlayerId]: "" }));
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const users = summary?.users ?? [];
  const filteredUsers = useMemo(() => users.filter((user) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return user.username.toLowerCase().includes(q)
      || user.telegram_id.toLowerCase().includes(q)
      || (user.phone_number ?? "").toLowerCase().includes(q);
  }), [users, userSearch]);

  if (loading || pageLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  if (!adminSession) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center px-5 py-8">
        <section className="glass rounded-3xl p-6 shadow-elegant w-full max-w-md space-y-5">
          <div className="text-center space-y-2">
            <Shield className="h-10 w-10 mx-auto text-primary" />
            <h1 className="text-2xl font-black">Admin Login</h1>
            <p className="text-sm text-muted-foreground">Sign in with your admin credentials.</p>
          </div>
          <div className="space-y-3">
            <Input type="email" placeholder="Admin email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
            <Input
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAdminLogin();
              }}
            />
          </div>
          <Button type="button" size="lg" className="w-full font-bold" onClick={handleAdminLogin}>
            Login
          </Button>
          <div className="rounded-xl border border-border bg-card/40 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">Seeded admin credentials</p>
            <p>Email: admin@yegarabingo.com</p>
            <p>Password: admin12345</p>
            <p className="mt-2 font-semibold text-foreground mb-1">Demo fallback credentials</p>
            <p>Email: {DEMO_ADMIN_EMAIL}</p>
            <p>Password: {DEMO_ADMIN_PASSWORD}</p>
          </div>
        </section>
      </main>
    );
  }

  if (!adminSession.player?.is_admin || !summary) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center px-5 py-8">
        <section className="glass rounded-3xl p-6 shadow-elegant space-y-3 text-center w-full max-w-md">
          <Shield className="h-8 w-8 mx-auto text-primary" />
          <h1 className="text-lg font-extrabold">Admin access required</h1>
          <p className="text-sm text-muted-foreground">
            This dashboard is available only for admin-enabled players.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-background safe-top safe-bottom">
      <div className="mx-auto flex w-full max-w-[90rem] flex-col lg:flex-row">
        <aside className="lg:sticky lg:top-0 lg:h-screen lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-border/70 bg-card/30 backdrop-blur px-4 py-5">
          <div className="flex items-center gap-3 mb-6">
            <div className="rounded-2xl gradient-primary p-3 text-primary-foreground shadow-elegant">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-black text-lg leading-tight">Admin Panel</h1>
              <p className="text-xs text-muted-foreground">Bingo Blitz Control</p>
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

          <Button type="button" variant="outline" className="mt-5 w-full" onClick={handleLogout}>
            Logout
          </Button>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <header className="mb-5 flex flex-col gap-3 rounded-3xl border border-border/70 bg-card/40 p-5 shadow-card md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Web Admin Dashboard</p>
              <h2 className="mt-1 text-3xl font-black tracking-tight">Operations Center</h2>
              <p className="mt-1 text-sm text-muted-foreground">Manage users, wallets, rooms, reports, and audit activity.</p>
            </div>
            <div className="flex gap-2">
              {adminSession.player.id === DEMO_ADMIN_ID && (
                <span className="inline-flex items-center rounded-full bg-warning/15 px-3 py-2 text-xs font-bold text-warning">
                  Demo Mode
                </span>
              )}
              <Button type="button" variant="secondary" onClick={() => loadAdmin(true)} disabled={refreshing}>
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Refresh
              </Button>
            </div>
          </header>

      <section id="overview" className={`glass scroll-mt-6 rounded-2xl p-5 shadow-card space-y-4 mb-4 ${activeSection === "overview" ? "" : "hidden"}`}>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-extrabold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Admin Dashboard
          </h1>
          <Button type="button" size="sm" variant="secondary" onClick={() => loadAdmin(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={<Users className="h-4 w-4" />} label="Total Users" value={summary.totals.total_users} />
          <MetricCard icon={<Users className="h-4 w-4" />} label="Active Players" value={summary.totals.active_players ?? 0} />
          <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Total Rooms" value={summary.totals.total_rooms ?? 0} />
          <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Active Rooms" value={summary.totals.active_rooms} />
          <MetricCard icon={<Coins className="h-4 w-4" />} label="Live Rooms" value={summary.totals.live_rooms} />
          <MetricCard icon={<Radio className="h-4 w-4" />} label="Paused Rooms" value={summary.totals.paused_rooms ?? 0} />
          <MetricCard icon={<XCircle className="h-4 w-4" />} label="Closed Rooms" value={summary.totals.closed_rooms ?? 0} />
          <MetricCard icon={<Wallet className="h-4 w-4" />} label="Pending Requests" value={summary.totals.pending_wallet_requests} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border p-3 bg-card/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue</p>
            <p className="text-2xl font-black mt-1 text-warning">{summary.totals.total_revenue}</p>
          </div>
          <div className="rounded-xl border border-border p-3 bg-card/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Payouts</p>
            <p className="text-2xl font-black mt-1 text-primary">{summary.totals.total_payouts}</p>
          </div>
        </div>
      </section>

      <section id="reports" className={`glass scroll-mt-6 rounded-2xl p-5 shadow-card space-y-4 mb-4 ${activeSection === "reports" ? "" : "hidden"}`}>
        <h2 className="text-base font-bold">Financial Reports</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ReportCard label="Deposits" value={summary.totals.total_deposits ?? 0} tone="text-primary" />
          <ReportCard label="Withdrawals" value={summary.totals.total_withdrawals ?? 0} tone="text-destructive" />
          <ReportCard label="Net Profit" value={summary.totals.net_profit ?? summary.totals.total_revenue - summary.totals.total_payouts} tone="text-warning" />
          <ReportCard label="Transactions" value={summary.transactions.length} tone="text-foreground" />
        </div>
      </section>

      <div className={`grid gap-4 xl:grid-cols-[1.2fr_0.8fr] items-start ${activeSection === "users" || activeSection === "rooms" ? "" : "hidden"}`}>
      <section id="users" className={`glass scroll-mt-6 rounded-2xl p-5 shadow-card space-y-4 mb-4 xl:mb-0 ${activeSection === "users" ? "" : "hidden"}`}>
        <div>
          <h2 className="text-base font-bold">User Management</h2>
          <p className="text-xs text-muted-foreground mt-1">Search users, promote admins, block accounts, and adjust wallets.</p>
        </div>
        <Input
          placeholder="Search username, Telegram ID, or phone"
          value={userSearch}
          onChange={(event) => setUserSearch(event.target.value)}
        />
        <div className="overflow-x-auto rounded-2xl border border-border bg-card/30">
          {filteredUsers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No users found.</p>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">User</th>
                  <th className="px-3 py-3">Telegram ID</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">Main</th>
                  <th className="px-3 py-3">Play</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Wallet Adjust</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="align-middle">
                    <td className="px-3 py-3 font-semibold">{user.username}</td>
                    <td className="px-3 py-3 text-muted-foreground">{user.telegram_id}</td>
                    <td className="px-3 py-3 text-muted-foreground">{user.phone_number ?? "—"}</td>
                    <td className="px-3 py-3 font-bold">{user.main_wallet_balance ?? user.wallet_balance}</td>
                    <td className="px-3 py-3 font-bold">{user.play_wallet_balance ?? user.wallet_balance}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] uppercase font-bold rounded-full px-2 py-1 ${user.is_admin ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                        {user.is_admin ? "Admin" : "User"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-[10px] uppercase font-bold rounded-full px-2 py-1 ${
                          user.is_blocked ? "bg-destructive/15 text-destructive" : "bg-emerald-500/15 text-emerald-600"
                        }`}
                      >
                        {user.is_blocked ? "Blocked" : "Active"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-[260px] gap-2">
                        <Input
                          type="number"
                          placeholder="+/- amount"
                          value={adjustments[user.id] ?? ""}
                          onChange={(event) => setAdjustments((prev) => ({ ...prev, [user.id]: event.target.value }))}
                        />
                        <Button type="button" size="sm" variant="secondary" onClick={() => handleAdjustWallet(user.id, "main")} disabled={busy !== null}>Main</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => handleAdjustWallet(user.id, "play")} disabled={busy !== null}>Play</Button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={user.is_admin ? "destructive" : "default"}
                          onClick={() => handleToggleAdmin(user.id, !user.is_admin)}
                          disabled={busy !== null || user.id === adminSession.player.id}
                        >
                          {busy === `admin-${user.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : user.is_admin ? "Remove admin" : "Make admin"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={user.is_blocked ? "secondary" : "destructive"}
                          onClick={() => handleToggleBlocked(user.id, !user.is_blocked)}
                          disabled={busy !== null || user.id === adminSession.player.id}
                        >
                          {busy === `blocked-${user.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : user.is_blocked ? "Unblock" : "Block"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section id="rooms" className={`glass scroll-mt-6 rounded-2xl p-5 shadow-card space-y-4 mb-4 xl:mb-0 ${activeSection === "rooms" ? "" : "hidden"}`}>
        <h2 className="text-base font-bold">Recent Rooms & Live Games</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card/30">
          {summary.rooms.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No rooms found.</p>
          ) : (
            <table className="w-full min-w-[1220px] text-sm">
              <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Room</th>
                  <th className="px-3 py-3">Code</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Stake</th>
                  <th className="px-3 py-3">Pot</th>
                  <th className="px-3 py-3">Players</th>
                  <th className="px-3 py-3">Watchers</th>
                  <th className="px-3 py-3">Called</th>
                  <th className="px-3 py-3">Last No.</th>
                  <th className="px-3 py-3">Cartelas</th>
                  <th className="px-3 py-3">Winner</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {summary.rooms.map((room) => (
                  <tr key={room.id}>
                    <td className="px-3 py-3 font-semibold">{room.room_name ?? room.code}</td>
                    <td className="px-3 py-3 font-mono">{room.code}</td>
                    <td className="px-3 py-3">{room.is_private ? "Private" : "Public"}</td>
                    <td className="px-3 py-3 uppercase font-bold">{room.status}</td>
                    <td className="px-3 py-3">{room.stake_amount}</td>
                    <td className="px-3 py-3">{room.derash}</td>
                    <td className="px-3 py-3">{room.active_players_count ?? 0}/{room.joined_players_count ?? 0}</td>
                    <td className="px-3 py-3">{room.watcher_count ?? 0}</td>
                    <td className="px-3 py-3">{room.called_numbers?.length ?? 0}</td>
                    <td className="px-3 py-3 font-bold">{room.last_called_number ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground max-w-[220px]">
                      {room.joined_players?.length
                        ? room.joined_players
                            .filter((entry) => entry.selected_cartelas?.length)
                            .map((entry) => `${entry.username ?? entry.player_id.slice(0, 6)}: ${entry.selected_cartelas?.join(",")}`)
                            .join(" · ") || "—"
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {room.winner_name ?? room.winning_line ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {room.status !== "finished" && !room.closed_by_admin && (
                          <Button type="button" size="sm" variant="destructive" onClick={() => handleCloseRoom(room.id)} disabled={busy !== null}>
                            {busy === `room-${room.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Close"}
                          </Button>
                        )}
                        {room.status !== "finished" && (
                          <Button type="button" size="sm" variant="secondary" onClick={() => handleForceFinishRoom(room.id)} disabled={busy !== null}>
                            {busy === `force-finish-${room.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Force finish"}
                          </Button>
                        )}
                        <Button type="button" size="sm" variant="secondary" onClick={() => handleAdvanceRoomRound(room.id)} disabled={busy !== null}>
                          {busy === `advance-${room.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Next round"}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => handleResetRoomState(room.id)} disabled={busy !== null}>
                          {busy === `reset-${room.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      </div>

      <div className={`grid gap-4 xl:grid-cols-2 items-start mt-4 ${activeSection === "transactions" || activeSection === "wallet" ? "" : "hidden"}`}>
      <section id="transactions" className={`glass scroll-mt-6 rounded-2xl p-5 shadow-card space-y-4 mb-4 xl:mb-0 ${activeSection === "transactions" ? "" : "hidden"}`}>
        <h2 className="text-base font-bold">Recent Transactions</h2>
        <div className="space-y-2">
          {summary.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions found.</p>
          ) : summary.transactions.map((tx) => (
            <div key={tx.id} className="rounded-xl border border-border p-3 bg-card/40 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold capitalize">{tx.kind.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
              </div>
              <p className="font-extrabold">{tx.amount}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="wallet" className={`glass scroll-mt-6 rounded-2xl p-5 shadow-card space-y-4 ${activeSection === "wallet" ? "" : "hidden"}`}>
        <h2 className="text-base font-bold">Wallet Requests</h2>
        <div className="space-y-2">
          {summary.requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wallet requests found. If this is unexpected, run the wallet migration in Supabase.</p>
          ) : summary.requests.map((request) => (
            <div key={request.id} className="rounded-xl border border-border p-3 bg-card/40">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold capitalize">{request.kind}</p>
                  <p className="text-xs text-muted-foreground">{new Date(request.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold">{request.amount}</p>
                  <p className="text-xs uppercase text-muted-foreground">{request.status}</p>
                </div>
              </div>
              {request.note && <p className="text-xs text-muted-foreground mt-2">{request.note}</p>}
              {request.status === "pending" && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Button type="button" size="sm" onClick={() => handleWalletRequest(request.id, true)} disabled={busy !== null}>
                    {busy === `request-${request.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => handleWalletRequest(request.id, false)} disabled={busy !== null}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      </div>

      <section id="audit" className={`glass scroll-mt-6 rounded-2xl p-5 shadow-card space-y-4 mt-4 ${activeSection === "audit" ? "" : "hidden"}`}>
        <h2 className="text-base font-bold">Audit Logs</h2>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {(summary.audit_logs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit logs found.</p>
          ) : (summary.audit_logs ?? []).map((log) => (
            <div key={log.id} className="rounded-xl border border-border p-3 bg-card/40">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold capitalize">{log.action.replace(/_/g, " ")}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                Player: {log.player_id ?? "system"} {log.room_id ? `· Room: ${log.room_id}` : ""}
              </p>
            </div>
          ))}
        </div>
      </section>
        </div>
      </div>
    </main>
  );
}

function AdminNavLink({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-smooth ${
        active
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ReportCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border p-3 bg-card/40">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-black mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-3 bg-card/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <p className="text-2xl font-black mt-1">{value}</p>
    </div>
  );
}