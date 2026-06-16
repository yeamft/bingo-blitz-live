import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTelegramIdentity, haptic } from "@/hooks/useTelegramIdentity";
import { api, getErrorMessage } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { BingoBall } from "@/components/bingo/BingoBall";
import { BingoCard } from "@/components/bingo/BingoCard";
import { generateCardFromCartela, saveSessionCartelas } from "@/lib/cartela";
import { Loader2, Plus, LogIn, Wallet, Languages, Eye, Sparkles, Users, ShieldCheck } from "lucide-react";

const Index = () => {
  const { player, loading, error } = useTelegramIdentity();
  const { t, lang, toggle } = useLang();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [stake, setStake] = useState(20);
  const [selectedCartelas, setSelectedCartelas] = useState<number[]>([1]);
  const [previewCartela, setPreviewCartela] = useState<number | null>(null);
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const totalStake = stake * selectedCartelas.length;
  const canAfford = (player?.wallet_balance ?? 0) >= totalStake;

  const cartelaPreviewCard = useMemo(
    () => (previewCartela ? generateCardFromCartela(previewCartela) : []),
    [previewCartela],
  );

  function toggleCartela(cardNo: number) {
    setSelectedCartelas((prev) => {
      if (prev.includes(cardNo)) return prev.filter((n) => n !== cardNo);
      if (prev.length >= 3) return prev;
      return [...prev, cardNo].sort((a, b) => a - b);
    });
  }

  async function handleCreate() {
    if (!player) return;
    if (!selectedCartelas.length) {
      toast.error(t("chooseUpToThree"));
      return;
    }
    if (!canAfford) {
      toast.error(t("insufficientBalance"));
      haptic("error");
      return;
    }
    setBusy("create");
    haptic("medium");
    try {
      const { room } = await api.createRoom(player.id, stake, selectedCartelas, isPrivateRoom);
      saveSessionCartelas(room.code, selectedCartelas);
      navigate(`/room/${room.code}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleJoin() {
    if (!player || !code.trim()) return;
    if (!selectedCartelas.length) {
      toast.error(t("chooseUpToThree"));
      return;
    }
    setBusy("join");
    haptic("medium");
    try {
      const { room } = await api.joinRoom(code.trim().toUpperCase(), player.id, selectedCartelas);
      saveSessionCartelas(room.code, selectedCartelas);
      navigate(`/room/${room.code}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
      haptic("error");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  if (error || !player) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="glass rounded-2xl p-5 max-w-md w-full text-center shadow-card space-y-3">
          <h1 className="text-xl font-bold">Unable to load the game</h1>
          <p className="text-sm text-muted-foreground">
            {error ?? "Your player profile could not be loaded."}
          </p>
          <Button onClick={() => window.location.reload()} className="w-full">
            Retry
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen safe-top safe-bottom px-4 py-5 max-w-md mx-auto overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-20 -left-20 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute top-36 -right-24 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
        <div className="absolute bottom-10 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-warning/10 blur-3xl" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigate("/wallet")}
          className="glass flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold shadow-card"
        >
          <Wallet className="h-3.5 w-3.5 text-warning" />
          <span>{player.wallet_balance} ETB</span>
        </button>
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 text-xs glass px-3 py-2 rounded-full font-semibold uppercase tracking-wider shadow-card"
        >
          <Languages className="h-3.5 w-3.5" /> {lang === "en" ? "EN" : "አማ"}
        </button>
      </div>

      <header className="relative glass rounded-[2rem] p-5 mb-4 shadow-elegant overflow-hidden">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/20 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary-glow mb-3">
              <Sparkles className="h-3 w-3" /> Live Bingo
            </div>
            <h1 className="text-4xl font-black tracking-tight leading-none">
              {t("appName")}
            </h1>
            <p className="text-sm text-muted-foreground mt-3 max-w-[15rem]">{t("tagline")}</p>
          </div>
          <div className="relative h-24 w-24 shrink-0">
            <BingoBall number={7} size="md" className="absolute left-0 top-2 rotate-[-14deg]" showLetter={false} />
            <BingoBall number={42} size="lg" className="absolute right-0 top-7 z-10" showLetter={false} />
            <BingoBall number={68} size="sm" className="absolute bottom-0 left-7 rotate-12" showLetter={false} />
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-2 mt-5">
          <div className="rounded-2xl bg-secondary/70 p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("playingAs")}</p>
            <p className="font-black truncate mt-1">{player.username}</p>
          </div>
          <div className="rounded-2xl bg-secondary/70 p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cards</p>
            <p className="font-black mt-1">{selectedCartelas.length}/3</p>
          </div>
          <div className="rounded-2xl bg-warning/10 p-3 border border-warning/20">
            <p className="text-[10px] uppercase tracking-wider text-warning">Stake</p>
            <p className="font-black mt-1 text-warning">{totalStake}</p>
          </div>
        </div>
      </header>

      <section className="glass rounded-3xl p-4 mb-3 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black flex items-center gap-2">
            <LogIn className="h-4 w-4 text-accent" /> {t("joinRoom")}
          </h2>
          <span className="text-[10px] rounded-full bg-accent/10 text-accent px-2 py-1 font-bold uppercase tracking-wider">Fast play</span>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder={t("roomCode")}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
            maxLength={5}
            className="text-center font-mono tracking-[0.4em] text-lg uppercase h-12 rounded-2xl bg-background/50"
          />
          <Button
            onClick={handleJoin}
            disabled={!code.trim() || busy !== null}
            size="lg"
            className="h-12 px-5 rounded-2xl bg-accent text-accent-foreground hover:bg-accent/90 font-black"
          >
            {busy === "join" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("join")}
          </Button>
        </div>
      </section>

      <section className="glass rounded-3xl p-5 shadow-card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> {t("hostNew")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Pick stake, choose cards, and start a room.</p>
          </div>
          <div className="rounded-2xl gradient-primary text-primary-foreground p-3 shadow-elegant">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            {t("stake")}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[10, 20, 50, 100].map((v) => (
              <button
                key={v}
                onClick={() => setStake(v)}
                className={`rounded-2xl p-3 text-left border-2 transition-smooth ${
                  stake === v
                    ? "border-primary bg-primary/20 text-foreground shadow-elegant"
                    : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wider opacity-80">ETB</p>
                <p className="font-black text-lg leading-none mt-1">{v}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border p-3 bg-card/40">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black text-sm">{t("cartelaMarket")}</h3>
            <span className="text-xs text-muted-foreground rounded-full bg-secondary px-2 py-1">
              {t("selected")}: <span className="font-bold text-foreground">{selectedCartelas.length}/3</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{t("chooseUpToThree")}</p>

          <div className="grid grid-cols-8 gap-1.5 max-h-48 overflow-y-auto pr-1 rounded-2xl">
            {Array.from({ length: 200 }, (_, i) => i + 1).map((n) => {
              const selected = selectedCartelas.includes(n);
              const blocked = !selected && selectedCartelas.length >= 3;
              return (
                <button
                  key={n}
                  onClick={() => !blocked && toggleCartela(n)}
                  className={`h-8 rounded-lg text-xs font-bold border transition-smooth ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : blocked
                        ? "border-border bg-secondary/40 text-muted-foreground opacity-50 cursor-not-allowed"
                        : "border-border bg-secondary text-foreground hover:border-primary/50"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>

          {selectedCartelas.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-secondary/60 p-2">
              <div className="text-xs text-muted-foreground">
                {t("totalStake")}: <span className="font-bold text-foreground">{totalStake}</span>
              </div>
              <div className="flex gap-1.5">
                {selectedCartelas.map((n) => (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    key={n}
                    className="h-7 px-2 text-[10px]"
                    onClick={() => setPreviewCartela(n)}
                  >
                    <Eye className="h-3 w-3 mr-1" /> #{n}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-border p-3 bg-card/40">
          <span className="text-sm font-bold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" /> {t("privateRoom")}</span>
          <Switch checked={isPrivateRoom} onCheckedChange={setIsPrivateRoom} />
        </div>

        {!canAfford && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 flex items-center justify-between gap-3">
            <p className="text-xs text-destructive font-semibold">{t("insufficientBalance")}</p>
            <Button type="button" variant="destructive" size="sm" onClick={() => navigate("/wallet")}>
              {t("topUp")}
            </Button>
          </div>
        )}

        <Button
          onClick={handleCreate}
          disabled={busy !== null || !selectedCartelas.length || !canAfford}
          size="lg"
          className="w-full h-12 rounded-2xl gradient-primary text-primary-foreground font-black shadow-elegant text-base"
        >
          {busy === "create" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            `${t("createRoom")} · ${totalStake}`
          )}
        </Button>
      </section>

      <Dialog open={previewCartela !== null} onOpenChange={(open) => !open && setPreviewCartela(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("preview")} #{previewCartela}
            </DialogTitle>
            <DialogDescription>{t("cartelaMarket")}</DialogDescription>
          </DialogHeader>
          <BingoCard numbers={cartelaPreviewCard} marked={[0]} current={null} disabled />
        </DialogContent>
      </Dialog>

    </main>
  );
};

export default Index;
