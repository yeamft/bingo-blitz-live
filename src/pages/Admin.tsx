import { useEffect, useState } from "react";
import { BarChart3, Coins, Loader2, RefreshCw, Shield, Users, Wallet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTelegramIdentity } from "@/hooks/useTelegramIdentity";
import { api, type AdminSummary, getErrorMessage } from "@/lib/api";
import { toast } from "sonner";

const ADMIN_SESSION_KEY = "bingo.admin_test_session";
const TEST_ADMIN_EMAIL = "admin@test.com";
const TEST_ADMIN_PASSWORD = "admin123";

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

function isAdminTestMode() {
  return new URLSearchParams(window.location.search).get("test_admin") === "1" || localStorage.getItem(ADMIN_SESSION_KEY) === "1";
}

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

export default function AdminPage() {
  const { player, loading } = useTelegramIdentity();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [adjustments, setAdjustments] = useState<Record<string, string>>({});
  const [adminLoggedIn, setAdminLoggedIn] = useState(isAdminTestMode());
  const [activeSection, setActiveSection] = useState<AdminSection>(() => {
    const hash = window.location.hash.replace("#", "") as AdminSection;
    return ADMIN_SECTIONS.some((section) => section.id === hash) ? hash : "overview";
  });
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  async function loadAdmin(showRefresh = false) {
    if (!player || !adminLoggedIn) {
      setPageLoading(false);
      return;
    }
    if (showRefresh) setRefreshing(true);
    else setPageLoading(true);

    try {
      const result = await api.getAdminSummary(player.id);
      setSummary(result);
    } catch (error: unknown) {
      if (isAdminTestMode()) {
        setSummary(emptyAdminSummary());
        toast.info("Admin test mode enabled");
        return;
      }
      toast.error(getErrorMessage(error));
      setSummary(null);
    } finally {
      setPageLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAdmin();
  }, [player?.id, adminLoggedIn]);

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

  function navigateAdmin(section: AdminSection) {
    setActiveSection(section);
    window.history.replaceState(null, "", `/admin#${section}`);
  }

  function handleAdminLogin() {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      toast.error("Enter admin email and password");
      return;
    }

    if (loginEmail.trim().toLowerCase() !== TEST_ADMIN_EMAIL || loginPassword !== TEST_ADMIN_PASSWORD) {
      toast.error("Invalid test admin credentials");
      return;
    }

    localStorage.setItem(ADMIN_SESSION_KEY, "1");
    setAdminLoggedIn(true);
    toast.success("Admin test login successful");
  }

  function handleTestLogin() {
    setLoginEmail(TEST_ADMIN_EMAIL);
    setLoginPassword(TEST_ADMIN_PASSWORD);
    localStorage.setItem(ADMIN_SESSION_KEY, "1");
    setAdminLoggedIn(true);
    toast.success("Admin test login enabled");
  }

  function handleLogout() {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setAdminLoggedIn(false);
    setSummary(null);
    toast.success("Logged out");
  }

  async function handleWalletRequest(requestId: number, approve: boolean) {
    if (!player) return;
    setBusy(`request-${requestId}`);
    try {
      await api.processWalletRequest(player.id, requestId, approve);
      toast.success(approve ? "Wallet request approved" : "Wallet request rejected");
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleCloseRoom(roomId: string) {
    if (!player) return;
    setBusy(`room-${roomId}`);
    try {
      await api.closeRoomAsAdmin(player.id, roomId);
      toast.success("Room closed");
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleAdmin(targetPlayerId: string, nextAdmin: boolean) {
    if (!player) return;
    setBusy(`admin-${targetPlayerId}`);
    try {
      await api.adminSetUserAdmin(player.id, targetPlayerId, nextAdmin);
      toast.success(nextAdmin ? "User promoted to admin" : "Admin access removed");
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleAdjustWallet(targetPlayerId: string, wallet: "main" | "play") {
    if (!player) return;
    const amount = Math.trunc(Number(adjustments[targetPlayerId]) || 0);
    if (amount === 0) {
      toast.error("Enter a positive or negative adjustment amount");
      return;
    }
    setBusy(`wallet-${targetPlayerId}`);
    try {
      await api.adminAdjustWallet(player.id, targetPlayerId, wallet, amount, "Admin dashboard adjustment");
      toast.success("Wallet adjusted");
      setAdjustments((prev) => ({ ...prev, [targetPlayerId]: "" }));
      await loadAdmin(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  if (loading || pageLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  if (!adminLoggedIn) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center px-5 py-8">
        <section className="glass rounded-3xl p-6 shadow-elegant w-full max-w-md space-y-5">
          <div className="text-center space-y-2">
            <Shield className="h-10 w-10 mx-auto text-primary" />
            <h1 className="text-2xl font-black">Admin Login</h1>
            <p className="text-sm text-muted-foreground">Web admin dashboard access for testing and management.</p>
          </div>

          <div className="space-y-3">
            <Input
              type="email"
              placeholder="Admin email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
            />
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
          <Button type="button" size="lg" variant="secondary" className="w-full font-bold" onClick={handleTestLogin}>
            Continue as Test Admin
          </Button>

          <div className="rounded-xl border border-border bg-card/40 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">Testing credentials</p>
            <p>Email: {TEST_ADMIN_EMAIL}</p>
            <p>Password: {TEST_ADMIN_PASSWORD}</p>
          </div>
        </section>
      </main>
    );
  }

  if (!player || !summary) {
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

  const users = summary.users ?? [];
  const filteredUsers = users.filter((user) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return user.username.toLowerCase().includes(q) || user.telegram_id.toLowerCase().includes(q);
  });

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
          <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Active Rooms" value={summary.totals.active_rooms} />
          <MetricCard icon={<Coins className="h-4 w-4" />} label="Live Rooms" value={summary.totals.live_rooms} />
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
          <p className="text-xs text-muted-foreground mt-1">Search users, promote admins, and adjust wallets.</p>
        </div>
        <Input
          placeholder="Search username or Telegram ID"
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
                  <th className="px-3 py-3">Main</th>
                  <th className="px-3 py-3">Play</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Wallet Adjust</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="align-middle">
                    <td className="px-3 py-3 font-semibold">{user.username}</td>
                    <td className="px-3 py-3 text-muted-foreground">{user.telegram_id}</td>
                    <td className="px-3 py-3 font-bold">{user.main_wallet_balance ?? user.wallet_balance}</td>
                    <td className="px-3 py-3 font-bold">{user.play_wallet_balance ?? user.wallet_balance}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] uppercase font-bold rounded-full px-2 py-1 ${user.is_admin ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                        {user.is_admin ? "Admin" : "User"}
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
                      <Button
                        type="button"
                        size="sm"
                        variant={user.is_admin ? "destructive" : "default"}
                        onClick={() => handleToggleAdmin(user.id, !user.is_admin)}
                        disabled={busy !== null || user.id === player.id}
                      >
                        {busy === `admin-${user.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : user.is_admin ? "Remove admin" : "Make admin"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section id="rooms" className={`glass scroll-mt-6 rounded-2xl p-5 shadow-card space-y-4 mb-4 xl:mb-0 ${activeSection === "rooms" ? "" : "hidden"}`}>
        <h2 className="text-base font-bold">Recent Rooms</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card/30">
          {summary.rooms.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No rooms found.</p>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Room</th>
                  <th className="px-3 py-3">Code</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Stake</th>
                  <th className="px-3 py-3">Pot</th>
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
                    <td className="px-3 py-3 text-right">
                      {room.status !== "finished" && !room.closed_by_admin ? (
                        <Button type="button" size="sm" variant="destructive" onClick={() => handleCloseRoom(room.id)} disabled={busy !== null}>
                          {busy === `room-${room.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Close"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">No action</span>
                      )}
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