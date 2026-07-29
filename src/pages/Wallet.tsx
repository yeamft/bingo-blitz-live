import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  ChevronRight,
  CreditCard,
  Loader2,
  RefreshCw,
  Smartphone,
  Wallet as WalletIcon,
} from "lucide-react";
import { useTelegramIdentity } from "@/hooks/useTelegramIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLang } from "@/lib/i18n";
import { api, getErrorMessage, Transaction, WalletRequest, type DepositProvider } from "@/lib/api";
import { toast } from "sonner";

const DEPOSIT_PROVIDER_OPTIONS: Array<{
  value: DepositProvider;
  label: string;
  short: string;
  icon: typeof Smartphone;
}> = [
  { value: "telebirr", label: "Telebirr", short: "TB", icon: Smartphone },
  { value: "cbe", label: "CBE", short: "CBE", icon: Building2 },
  { value: "dashen", label: "Dashen", short: "DB", icon: Building2 },
  { value: "abyssinia", label: "Abyssinia", short: "BOA", icon: Building2 },
  { value: "cbebirr", label: "CBE Birr", short: "Birr", icon: CreditCard },
];

const WITHDRAW_METHOD_OPTIONS: Array<{
  value: "bank" | "telebirr" | "cbebirr";
  label: string;
  icon: typeof Smartphone;
}> = [
  { value: "bank", label: "Bank", icon: Building2 },
  { value: "telebirr", label: "Telebirr", icon: Smartphone },
  { value: "cbebirr", label: "CBE Birr", icon: CreditCard },
];

export default function WalletPage() {
  const { player, loading, refreshPlayer, offline, updateLocalPlayer } = useTelegramIdentity();
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
  const [depositProvider, setDepositProvider] = useState<DepositProvider>("telebirr");
  const [depositReference, setDepositReference] = useState("");
  const [depositAccountSuffix, setDepositAccountSuffix] = useState("");
  const [depositPhoneNumber, setDepositPhoneNumber] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState("bank");
  const [withdrawAccount, setWithdrawAccount] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [submitting, setSubmitting] = useState<null | "transfer" | "transferMain" | "deposit" | "withdrawal">(null);
  const [playToMainAmount, setPlayToMainAmount] = useState("");
  const [transactionPage, setTransactionPage] = useState(0);
  const [walletAction, setWalletAction] = useState<null | "deposit" | "withdraw" | "toPlay" | "toMain">(null);

  const TRANSACTIONS_PER_PAGE = 4;

  const loadWallet = useCallback(async (showSpinner = false) => {
    if (!player) return;
    if (showSpinner) setRefreshing(true);
    else setPageLoading(true);
    try {
      const data = await api.getWalletSummary(player.id);
      setSummary(data.summary);
      setTransactions(data.transactions);
      setRequests(data.requests);
    } catch (error: unknown) {
      // Offline / demo fallback from local player balances
      setSummary({
        total_balance:
          Number(player.main_wallet_balance ?? 0) + Number(player.play_wallet_balance ?? player.wallet_balance ?? 0),
        main_wallet_balance: Number(player.main_wallet_balance ?? player.wallet_balance ?? 0),
        play_wallet_balance: Number(player.play_wallet_balance ?? player.wallet_balance ?? 0),
      });
      if (!offline) toast.error(getErrorMessage(error));
    } finally {
      setPageLoading(false);
      setRefreshing(false);
    }
  }, [player, offline]);

  useEffect(() => {
    if (!player) return;
    loadWallet();
  }, [loadWallet, player]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending").length,
    [requests],
  );

  const pagedTransactions = useMemo(
    () => transactions.slice(transactionPage * TRANSACTIONS_PER_PAGE, (transactionPage + 1) * TRANSACTIONS_PER_PAGE),
    [transactions, transactionPage],
  );

  const totalTransactionPages = Math.max(1, Math.ceil(transactions.length / TRANSACTIONS_PER_PAGE));

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
      await Promise.all([loadWallet(true), refreshPlayer()]);
      setTransferAmount("");
      setWalletAction(null);
    } catch (error: unknown) {
      if (offline && updateLocalPlayer) {
        const main = Number(player.main_wallet_balance ?? 0);
        const play = Number(player.play_wallet_balance ?? player.wallet_balance ?? 0);
        if (main < amount) {
          toast.error("Insufficient main wallet balance");
        } else {
          const next = {
            ...player,
            main_wallet_balance: main - amount,
            play_wallet_balance: play + amount,
            wallet_balance: play + amount,
          };
          updateLocalPlayer(next);
          setSummary({
            total_balance: next.main_wallet_balance! + next.play_wallet_balance!,
            main_wallet_balance: next.main_wallet_balance!,
            play_wallet_balance: next.play_wallet_balance!,
          });
          toast.success("Transferred to play wallet (offline)");
          setTransferAmount("");
          setWalletAction(null);
        }
      } else {
        toast.error(getErrorMessage(error));
      }
    } finally {
      setSubmitting(null);
    }
  }

  async function handleTransferToMain() {
    if (!player) return;
    const amount = Math.trunc(Number(playToMainAmount) || 0);
    if (amount <= 0) {
      toast.error("Enter a valid transfer amount");
      return;
    }

    setSubmitting("transferMain");
    try {
      await api.transferToMainWallet(player.id, amount);
      toast.success("Transferred to main wallet");
      await Promise.all([loadWallet(true), refreshPlayer()]);
      setPlayToMainAmount("");
      setWalletAction(null);
    } catch (error: unknown) {
      if (offline && updateLocalPlayer) {
        const main = Number(player.main_wallet_balance ?? 0);
        const play = Number(player.play_wallet_balance ?? player.wallet_balance ?? 0);
        if (play < amount) {
          toast.error("Insufficient play wallet balance");
        } else {
          const next = {
            ...player,
            main_wallet_balance: main + amount,
            play_wallet_balance: play - amount,
            wallet_balance: play - amount,
          };
          updateLocalPlayer(next);
          setSummary({
            total_balance: next.main_wallet_balance! + next.play_wallet_balance!,
            main_wallet_balance: next.main_wallet_balance!,
            play_wallet_balance: next.play_wallet_balance!,
          });
          toast.success("Transferred to main wallet (offline)");
          setPlayToMainAmount("");
          setWalletAction(null);
        }
      } else {
        toast.error(getErrorMessage(error));
      }
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

    if (kind === "deposit") {
      if (!depositReference.trim()) {
        toast.error("Enter your payment reference or receipt number");
        return;
      }
      if (depositProvider === "cbe" && depositAccountSuffix.trim().length !== 8) {
        toast.error("CBE deposits require an 8-digit account suffix");
        return;
      }
      if (depositProvider === "abyssinia" && depositAccountSuffix.trim().length !== 5) {
        toast.error("Bank of Abyssinia deposits require a 5-digit account suffix");
        return;
      }
      if (depositProvider === "cbebirr" && !depositPhoneNumber.trim()) {
        toast.error("CBE Birr deposits require your phone number");
        return;
      }
    }

    setSubmitting(kind);
    try {
      if (kind === "deposit") {
        await api.requestVerifiedDeposit(player.id, amount, {
          provider: depositProvider,
          reference: depositReference.trim(),
          account_suffix: depositAccountSuffix.trim() || undefined,
          phone_number: depositPhoneNumber.trim() || undefined,
          note: note.trim() || undefined,
        });
        setDepositAmount("");
        setDepositReference("");
        setDepositAccountSuffix("");
        setDepositPhoneNumber("");
        setDepositNote("");
        toast.success("Deposit verified and credited automatically");
        setWalletAction(null);
      } else {
        await api.requestWithdrawal(
          player.id,
          amount,
          [
            `method=${withdrawMethod}`,
            withdrawAccount.trim() ? `account=${withdrawAccount.trim()}` : null,
            note.trim() ? `note=${note.trim()}` : null,
          ].filter(Boolean).join(" | "),
        );
        setWithdrawAmount("");
        setWithdrawAccount("");
        setWithdrawNote("");
        toast.success("Withdrawal request submitted");
        setWalletAction(null);
      }
      await Promise.all([loadWallet(true), refreshPlayer()]);
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
    <main className="min-h-screen max-w-md mx-auto px-2.5 sm:px-4 py-3 sm:py-5 safe-top">
      <section className="glass rounded-2xl p-3 sm:p-4 shadow-card space-y-2.5 sm:space-y-3 mb-2.5 sm:mb-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-lg font-extrabold">
            <WalletIcon className="h-5 w-5 text-warning" /> Wallet
          </h1>
          {pendingRequests > 0 && (
            <span className="rounded-full bg-warning/10 px-2.5 py-1 text-[10px] font-bold text-warning">
              {pendingRequests} pending
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground mt-1">Current total balance</p>
            <p className="text-3xl sm:text-4xl font-black text-warning mt-1 tabular-nums">{totalBalance}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadWallet(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-xl border border-border p-2 sm:p-2.5 bg-card/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("playWallet")}</p>
            <p className="font-extrabold text-lg sm:text-xl mt-1 tabular-nums text-foreground">{playBalance}</p>
          </div>
          <div className="rounded-xl border border-border p-2 sm:p-2.5 bg-card/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("mainWallet")}</p>
            <p className="font-extrabold text-lg sm:text-xl mt-1 tabular-nums text-foreground">{mainBalance}</p>
          </div>
        </div>

      </section>

      <section className="mb-3 rounded-2xl border border-border bg-card p-3 shadow-card">
        <div className="mb-3">
          <h2 className="text-base font-bold">What would you like to do?</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <WalletAction
            icon={<ArrowDownLeft className="h-5 w-5" />}
            label="Deposit"
            tone="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            onClick={() => setWalletAction("deposit")}
          />
          <WalletAction
            icon={<ArrowUpRight className="h-5 w-5" />}
            label="Withdraw"
            tone="bg-amber-500/10 text-amber-700 dark:text-amber-400"
            onClick={() => setWalletAction("withdraw")}
          />
          <WalletAction
            icon={<ArrowRightLeft className="h-5 w-5" />}
            label="Fund play"
            tone="bg-primary/10 text-primary"
            onClick={() => setWalletAction("toPlay")}
          />
          <WalletAction
            icon={<ArrowRightLeft className="h-5 w-5 rotate-180" />}
            label="Save winnings"
            tone="bg-sky-500/10 text-sky-700 dark:text-sky-400"
            onClick={() => setWalletAction("toMain")}
          />
        </div>
      </section>

      <Dialog open={walletAction === "toPlay"} onOpenChange={(open) => !open && setWalletAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Fund your play wallet</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-semibold">Main balance: {mainBalance} ETB</p>
          <QuickAmounts balance={mainBalance} onSelect={(amount) => setTransferAmount(String(amount))} />
          <Input
            type="number"
            min="1"
            max={mainBalance}
            inputMode="numeric"
            aria-label="Transfer amount"
            placeholder="Enter amount"
            value={transferAmount}
            onChange={(event) => setTransferAmount(event.target.value)}
          />
          <Button className="h-11 w-full font-bold" onClick={handleTransfer} disabled={submitting !== null}>
            {submitting === "transfer" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Move to play wallet"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={walletAction === "toMain"} onOpenChange={(open) => !open && setWalletAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save your winnings</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-semibold">Play balance: {playBalance} ETB</p>
          <QuickAmounts balance={playBalance} onSelect={(amount) => setPlayToMainAmount(String(amount))} />
          <Input
            type="number"
            min="1"
            max={playBalance}
            inputMode="numeric"
            aria-label="Transfer amount"
            placeholder="Enter amount"
            value={playToMainAmount}
            onChange={(event) => setPlayToMainAmount(event.target.value)}
          />
          <Button className="h-11 w-full font-bold" onClick={handleTransferToMain} disabled={submitting !== null}>
            {submitting === "transferMain" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Move to main wallet"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={walletAction === "deposit"} onOpenChange={(open) => !open && setWalletAction(null)}>
        <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deposit money</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {DEPOSIT_PROVIDER_OPTIONS.map(({ value, label, short, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant={depositProvider === value ? "default" : "outline"}
                className="h-14 flex-col gap-1 px-1 text-[10px]"
                onClick={() => setDepositProvider(value)}
                title={label}
              >
                <Icon className="h-4 w-4" />
                {short}
              </Button>
            ))}
          </div>
          <QuickAmounts onSelect={(amount) => setDepositAmount(String(amount))} />
          <Input
            type="number"
            min="1"
            inputMode="numeric"
            placeholder="Amount in ETB"
            value={depositAmount}
            onChange={(event) => setDepositAmount(event.target.value)}
          />
          <Input
            placeholder={depositProvider === "cbebirr" ? "Receipt number" : "Payment reference"}
            value={depositReference}
            onChange={(event) => setDepositReference(event.target.value)}
          />
          {(depositProvider === "cbe" || depositProvider === "abyssinia") && (
            <Input
              inputMode="numeric"
              placeholder={depositProvider === "cbe" ? "Last 8 account digits" : "Last 5 account digits"}
              value={depositAccountSuffix}
              onChange={(event) =>
                setDepositAccountSuffix(
                  event.target.value.replace(/\D/g, "").slice(0, depositProvider === "cbe" ? 8 : 5),
                )
              }
            />
          )}
          {depositProvider === "cbebirr" && (
            <Input
              type="tel"
              placeholder="Phone number (251…)"
              value={depositPhoneNumber}
              onChange={(event) => setDepositPhoneNumber(event.target.value)}
            />
          )}
          <Textarea
            className="min-h-20"
            placeholder="Note (optional)"
            value={depositNote}
            onChange={(event) => setDepositNote(event.target.value)}
          />
          <Button className="h-11 w-full font-bold" onClick={() => handleRequest("deposit")} disabled={submitting !== null}>
            {submitting === "deposit" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify and deposit"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={walletAction === "withdraw"} onOpenChange={(open) => !open && setWalletAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Withdraw money</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-semibold">Available: {mainBalance} ETB</p>
          <div className="grid grid-cols-3 gap-2">
            {WITHDRAW_METHOD_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant={withdrawMethod === value ? "default" : "outline"}
                className="h-14 flex-col gap-1 px-1 text-[10px]"
                onClick={() => setWithdrawMethod(value)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
          <QuickAmounts balance={mainBalance} onSelect={(amount) => setWithdrawAmount(String(amount))} />
          <Input
            type="number"
            min="1"
            max={mainBalance}
            inputMode="numeric"
            placeholder="Amount in ETB"
            value={withdrawAmount}
            onChange={(event) => setWithdrawAmount(event.target.value)}
          />
          <Input
            placeholder={withdrawMethod === "bank" ? "Account number and holder name" : "Payout phone number"}
            value={withdrawAccount}
            onChange={(event) => setWithdrawAccount(event.target.value)}
          />
          <Textarea
            className="min-h-20"
            placeholder="Additional details (optional)"
            value={withdrawNote}
            onChange={(event) => setWithdrawNote(event.target.value)}
          />
          <Button
            className="h-11 w-full font-bold"
            onClick={() => handleRequest("withdrawal")}
            disabled={submitting !== null}
          >
            {submitting === "withdrawal" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request withdrawal"}
          </Button>
        </DialogContent>
      </Dialog>

      <section className="glass rounded-2xl p-3 sm:p-4 shadow-card space-y-2.5 sm:space-y-3 mb-2.5 sm:mb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold">Recent transactions</h2>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={transactionPage <= 0}
              onClick={() => setTransactionPage((page) => Math.max(0, page - 1))}
            >
              Prev
            </Button>
            <span className="text-muted-foreground min-w-[44px] text-center">
              {transactionPage + 1}/{totalTransactionPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={transactionPage >= totalTransactionPages - 1}
              onClick={() => setTransactionPage((page) => Math.min(totalTransactionPages - 1, page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            pagedTransactions.map((tx) => (
              <div key={tx.id} className="rounded-xl border border-border p-2.5 bg-card/40 flex items-center justify-between gap-2.5">
                <div>
                  <p className="text-[13px] font-semibold capitalize">{tx.kind.replace(/_/g, " ")}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-extrabold ${tx.amount >= 0 ? "text-primary" : "text-destructive"}`}>
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

      <section className="glass rounded-2xl p-4 sm:p-5 shadow-card space-y-3 sm:space-y-4">
        <div>
          <h2 className="text-base font-bold">Wallet requests</h2>
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

function WalletAction({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-20 items-center gap-3 rounded-xl border border-border bg-background/60 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{label}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function QuickAmounts({
  balance,
  onSelect,
}: {
  balance?: number;
  onSelect: (amount: number) => void;
}) {
  const suggestions = balance === undefined
    ? [100, 500, 1000]
    : [100, 500, Math.max(0, Math.floor(balance))].filter(
        (amount, index, values) => amount > 0 && amount <= balance && values.indexOf(amount) === index,
      );

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" aria-label="Quick amounts">
      {suggestions.map((amount) => (
        <Button
          key={amount}
          type="button"
          variant="outline"
          size="sm"
          className="h-8 flex-1"
          onClick={() => onSelect(amount)}
        >
          {balance !== undefined && amount === Math.floor(balance) ? "All" : amount} ETB
        </Button>
      ))}
    </div>
  );
}
