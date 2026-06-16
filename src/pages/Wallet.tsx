import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Wallet as WalletIcon,
  ShieldCheck,
} from "lucide-react";
import { useTelegramIdentity } from "@/hooks/useTelegramIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/lib/i18n";
import { api, getErrorMessage, Transaction, WalletRequest } from "@/lib/api";
import { toast } from "sonner";

export default function WalletPage() {
  const { player, loading } = useTelegramIdentity();
  const { t } = useLang();
  const [summary, setSummary] = useState<{
    total_balance: number;
    main_wallet_balance: number;
    play_wallet_balance: number;
  } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [requests, setRequests] = useState<WalletRequest[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transferAmount, setTransferAmount] = useState("100");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [submitting, setSubmitting] = useState<null | "transfer" | "deposit" | "withdrawal">(null);

  async function loadWallet(showSpinner = false) {
    if (!player) return;
    if (showSpinner) setRefreshing(true);
    else setPageLoading(true);
    try {
      const data = await api.getWalletSummary(player.id);
      setSummary(data.summary);
      setTransactions(data.transactions);
      setRequests(data.requests);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setPageLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!player) return;
    loadWallet();
  }, [player?.id]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending").length,
    [requests],
  );

  async function handleTransfer() {
    if (!player) return;
    const amount = Math.trunc(Number(transferAmount) || 0);
    if (amount <= 0) {
      toast.error("Enter a valid transfer amount");
      return;
    }

    setSubmitting("transfer");
    try {
      await api.transferToPlayWallet(player.id, amount);
      toast.success("Transferred to play wallet");
      await loadWallet(true);
      setTransferAmount("");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleRequest(kind: "deposit" | "withdrawal") {
    if (!player) return;

    const amountRaw = kind === "deposit" ? depositAmount : withdrawAmount;
    const note = kind === "deposit" ? depositNote : withdrawNote;
    const amount = Math.trunc(Number(amountRaw) || 0);

    if (amount <= 0) {
      toast.error(`Enter a valid ${kind} amount`);
      return;
    }

    setSubmitting(kind);
    try {
      if (kind === "deposit") {
        await api.requestDeposit(player.id, amount, note.trim() || undefined);
        setDepositAmount("");
        setDepositNote("");
      } else {
        await api.requestWithdrawal(player.id, amount, note.trim() || undefined);
        setWithdrawAmount("");
        setWithdrawNote("");
      }
      toast.success(`${kind === "deposit" ? "Deposit" : "Withdrawal"} request submitted`);
      await loadWallet(true);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(null);
    }
  }

  if (loading || !player) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  if (pageLoading && !summary) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  const playBalance = summary?.play_wallet_balance ?? player.play_wallet_balance ?? player.wallet_balance;
  const mainBalance = summary?.main_wallet_balance ?? player.main_wallet_balance ?? player.wallet_balance;
  const totalBalance = summary?.total_balance ?? mainBalance + playBalance;

  return (
    <main className="min-h-screen max-w-md mx-auto px-5 py-6 safe-top">
      <section className="glass rounded-2xl p-5 shadow-card space-y-4 mb-4">
        <h1 className="text-lg font-extrabold flex items-center gap-2">
          <WalletIcon className="h-5 w-5 text-warning" /> Wallet
        </h1>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground mt-2">Current total balance</p>
            <p className="text-4xl font-black text-warning mt-1 tabular-nums">{totalBalance}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadWallet(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border p-3 bg-card/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("playWallet")}</p>
            <p className="font-extrabold text-xl mt-1 tabular-nums text-foreground">{playBalance}</p>
          </div>
          <div className="rounded-xl border border-border p-3 bg-card/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("mainWallet")}</p>
            <p className="font-extrabold text-xl mt-1 tabular-nums text-foreground">{mainBalance}</p>
          </div>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 flex items-start gap-2 text-xs">
          <ShieldCheck className="h-4 w-4 mt-0.5 text-primary" />
          <p>
            {t("mainWallet")} holds your reserve. {t("playWallet")} is used for stakes and payouts.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-border p-3 bg-card/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending Requests</p>
            <p className="font-extrabold text-xl mt-1 tabular-nums text-foreground">{pendingRequests}</p>
          </div>
          <div className="rounded-xl border border-border p-3 bg-card/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Transactions</p>
            <p className="font-extrabold text-xl mt-1 tabular-nums text-foreground">{transactions.length}</p>
          </div>
          <div className="rounded-xl border border-border p-3 bg-card/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Requests</p>
            <p className="font-extrabold text-xl mt-1 tabular-nums text-foreground">{requests.length}</p>
          </div>
        </div>
      </section>

      <section className="glass rounded-2xl p-5 shadow-card space-y-4 mb-4">
        <h2 className="text-base font-bold flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" /> Move money to play wallet
        </h2>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input
            type="number"
            min="1"
            placeholder="Amount"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
          />
          <Button onClick={handleTransfer} disabled={submitting !== null}>
            {submitting === "transfer" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Transfer"}
          </Button>
        </div>
      </section>

      <section className="glass rounded-2xl p-5 shadow-card space-y-4 mb-4">
        <h2 className="text-base font-bold flex items-center gap-2">
          <ArrowDownLeft className="h-4 w-4 text-primary" /> Deposit request
        </h2>
        <Input
          type="number"
          min="1"
          placeholder="Deposit amount"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
        />
        <Textarea
          placeholder="Payment reference or note"
          value={depositNote}
          onChange={(e) => setDepositNote(e.target.value)}
        />
        <Button size="lg" className="h-11 font-bold w-full" onClick={() => handleRequest("deposit")} disabled={submitting !== null}>
          {submitting === "deposit" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit deposit request"}
        </Button>
      </section>

      <section className="glass rounded-2xl p-5 shadow-card space-y-4 mb-4">
        <h2 className="text-base font-bold flex items-center gap-2">
          <ArrowUpRight className="h-4 w-4 text-primary" /> Withdrawal request
        </h2>
        <Input
          type="number"
          min="1"
          placeholder="Withdrawal amount"
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
        />
        <Textarea
          placeholder="Bank, mobile money, or payout note"
          value={withdrawNote}
          onChange={(e) => setWithdrawNote(e.target.value)}
        />
        <Button
          size="lg"
          variant="secondary"
          className="h-11 font-bold w-full"
          onClick={() => handleRequest("withdrawal")}
          disabled={submitting !== null}
        >
          {submitting === "withdrawal" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit withdrawal request"}
        </Button>
      </section>

      <section className="glass rounded-2xl p-5 shadow-card space-y-4 mb-4">
        <div>
          <h2 className="text-base font-bold">Recent transactions</h2>
          <p className="text-xs text-muted-foreground mt-1">Stake, payout, transfer, and wallet activity.</p>
        </div>
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            transactions.slice(0, 8).map((tx) => (
              <div key={tx.id} className="rounded-xl border border-border p-3 bg-card/40 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold capitalize">{tx.kind.replace(/_/g, " ")}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className={`font-extrabold ${tx.amount >= 0 ? "text-primary" : "text-destructive"}`}>
                    {tx.amount >= 0 ? "+" : ""}
                    {tx.amount}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Balance: {tx.balance_after}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="glass rounded-2xl p-5 shadow-card space-y-4">
        <div>
          <h2 className="text-base font-bold">Wallet requests</h2>
          <p className="text-xs text-muted-foreground mt-1">Pending and processed deposit/withdrawal requests.</p>
        </div>
        <div className="space-y-2">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wallet requests yet.</p>
          ) : (
            requests.slice(0, 8).map((request) => (
              <div key={request.id} className="rounded-xl border border-border p-3 bg-card/40">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold capitalize">{request.kind}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(request.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold">{request.amount}</p>
                    <p
                      className={`text-[11px] font-semibold uppercase ${
                        request.status === "approved"
                          ? "text-primary"
                          : request.status === "rejected"
                            ? "text-destructive"
                            : "text-warning"
                      }`}
                    >
                      {request.status}
                    </p>
                  </div>
                </div>
                {request.note && <p className="text-xs text-muted-foreground mt-2">{request.note}</p>}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}