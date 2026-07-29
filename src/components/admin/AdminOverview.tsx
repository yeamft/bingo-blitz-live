import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { AdminSummary, Transaction, WalletRequest } from "@/lib/api";
import { formatDateTime, formatEtb, formatNumber, titleCase } from "@/lib/admin/format";

type AdminOverviewProps = {
  summary: AdminSummary;
  onNavigateDeposits: () => void;
  onNavigateWallet: () => void;
};

export function AdminOverview({ summary, onNavigateDeposits, onNavigateWallet }: AdminOverviewProps) {
  const totals = summary.totals;
  const netProfit = totals.net_profit ?? totals.total_revenue - totals.total_payouts;
  const pendingDeposits = summary.requests.filter((r) => r.kind === "deposit" && r.status === "pending").length;
  const pendingWithdrawals = summary.requests.filter((r) => r.kind === "withdrawal" && r.status === "pending").length;
  const recentTransactions = summary.transactions.slice(0, 6);
  const recentRequests = summary.requests.filter((r) => r.status === "pending").slice(0, 5);

  return (
    <div className="space-y-6">
      <section>
        <SectionHeading title="Financial snapshot" description="Revenue, deposits, and wallet activity at a glance." />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Net profit" value={formatEtb(netProfit)} hint="Revenue minus payouts" tone="text-foreground" />
          <KpiCard label="Revenue" value={formatEtb(totals.total_revenue)} hint="Total stakes collected" tone="text-amber-600 dark:text-amber-400" />
          <KpiCard label="Deposits" value={formatEtb(totals.total_deposits ?? 0)} hint="Verified top-ups" tone="text-emerald-600 dark:text-emerald-400" />
          <KpiCard
            label="Pending requests"
            value={formatNumber(totals.pending_wallet_requests)}
            hint={`${pendingDeposits} deposits · ${pendingWithdrawals} withdrawals`}
            tone="text-primary"
            actionLabel="Review queue"
            onAction={onNavigateWallet}
          />
        </div>
      </section>

      <section>
        <SectionHeading title="Platform activity" description="Users, rooms, and live game health." />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total users" value={formatNumber(totals.total_users)} />
          <StatCard label="Active players" value={formatNumber(totals.active_players ?? 0)} />
          <StatCard label="Live rooms" value={formatNumber(totals.live_rooms)} accent="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" />
          <StatCard label="Active rooms" value={formatNumber(totals.active_rooms)} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <RoomStatusPill label="Paused" value={totals.paused_rooms ?? 0} />
          <RoomStatusPill label="Closed" value={totals.closed_rooms ?? 0} />
          <RoomStatusPill label="Total rooms" value={totals.total_rooms ?? 0} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Recent transactions" description="Latest ledger entries across the platform.">
          {recentTransactions.length === 0 ? (
            <EmptyState message="No transactions recorded yet." />
          ) : (
            <ul className="divide-y divide-border">
              {recentTransactions.map((tx) => (
                <TransactionListItem key={tx.id} transaction={tx} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Pending wallet requests"
          description="Deposits and withdrawals awaiting review."
          actionLabel="Open deposits"
          onAction={onNavigateDeposits}
        >
          {recentRequests.length === 0 ? (
            <EmptyState message="No pending wallet requests." />
          ) : (
            <ul className="divide-y divide-border">
              {recentRequests.map((request) => (
                <WalletRequestListItem key={request.id} request={request} />
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}

function SectionHeading({ title }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h2>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  actionLabel,
  onAction,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="admin-kpi-card rounded-2xl border border-border bg-card p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${tone}`}>{value}</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        {actionLabel && onAction && (
          <button type="button" onClick={onAction} className="text-xs font-semibold text-primary hover:underline">
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-2 text-xl font-bold text-foreground ${accent ? `inline-flex rounded-lg px-2 py-0.5 ${accent}` : ""}`}>
        {value}
      </p>
    </div>
  );
}

function RoomStatusPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground">{formatNumber(value)}</span>
    </div>
  );
}

function Panel({
  title,
  children,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-base font-bold text-foreground">{title}</h3>
        </div>
        {actionLabel && onAction && (
          <button type="button" onClick={onAction} className="text-xs font-semibold text-primary hover:underline">
            {actionLabel}
          </button>
        )}
      </div>
      <div className="px-2 py-1">{children}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{message}</p>;
}

function TransactionListItem({ transaction }: { transaction: Transaction }) {
  const positive = transaction.amount >= 0;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{titleCase(transaction.kind)}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(transaction.created_at)}</p>
      </div>
      <div className="text-right">
        <p className={`flex items-center justify-end gap-1 text-sm font-bold ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {formatEtb(transaction.amount)}
        </p>
      </div>
    </li>
  );
}

function WalletRequestListItem({ request }: { request: WalletRequest }) {
  const positive = request.kind === "deposit";
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {titleCase(request.kind)} #{request.id}
        </p>
        <p className="text-xs text-muted-foreground">{formatDateTime(request.created_at)}</p>
      </div>
      <p className={`text-sm font-bold ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
        {positive ? "+" : "-"}
        {formatEtb(request.amount)}
      </p>
    </li>
  );
}
