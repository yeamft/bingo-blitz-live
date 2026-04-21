import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTelegramIdentity, haptic } from "@/hooks/useTelegramIdentity";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BingoBall } from "@/components/bingo/BingoBall";
import { Loader2, Plus, LogIn, Wallet, Languages } from "lucide-react";

const Index = () => {
  const { player, loading } = useTelegramIdentity();
  const { t, lang, toggle } = useLang();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [stake, setStake] = useState(20);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  async function handleCreate() {
    if (!player) return;
    if (player.wallet_balance < stake) {
      toast.error(t("insufficientBalance"));
      haptic("error");
      return;
    }
    setBusy("create");
    haptic("medium");
    try {
      const { room } = await api.createRoom(player.id, stake);
      navigate(`/room/${room.code}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleJoin() {
    if (!player || !code.trim()) return;
    setBusy("join");
    haptic("medium");
    try {
      const { room } = await api.joinRoom(code.trim().toUpperCase(), player.id);
      navigate(`/room/${room.code}`);
    } catch (e: any) {
      toast.error(e.message);
      haptic("error");
    } finally {
      setBusy(null);
    }
  }

  if (loading || !player) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col safe-top safe-bottom px-5 py-6 max-w-md mx-auto">
      <div className="flex justify-end mb-2">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 text-xs glass px-3 py-1.5 rounded-full font-semibold uppercase tracking-wider"
        >
          <Languages className="h-3.5 w-3.5" /> {lang === "en" ? "EN" : "አማ"}
        </button>
      </div>

      <header className="text-center mb-6">
        <div className="flex justify-center gap-2 mb-5">
          <BingoBall number={7} size="md" className="rotate-[-12deg]" showLetter={false} />
          <BingoBall number={42} size="md" className="translate-y-2" showLetter={false} />
          <BingoBall number={68} size="md" className="rotate-12" showLetter={false} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          <span className="bg-clip-text text-transparent gradient-primary">{t("appName")}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-2">{t("tagline")}</p>
      </header>

      <section className="glass rounded-2xl p-4 mb-4 shadow-card flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("playingAs")}
          </p>
          <p className="font-bold">{player.username}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 justify-end">
            <Wallet className="h-3 w-3" /> {t("wallet")}
          </p>
          <p className="font-extrabold text-2xl text-warning leading-tight">
            {player.wallet_balance}
          </p>
        </div>
      </section>

      <section className="glass rounded-2xl p-5 mb-3 shadow-card space-y-3">
        <h2 className="text-base font-bold flex items-center gap-2">
          <LogIn className="h-4 w-4 text-accent" /> {t("joinRoom")}
        </h2>
        <div className="flex gap-2">
          <Input
            placeholder={t("roomCode")}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
            maxLength={5}
            className="text-center font-mono tracking-[0.4em] text-lg uppercase h-12"
          />
          <Button
            onClick={handleJoin}
            disabled={!code.trim() || busy !== null}
            size="lg"
            className="h-12 px-5"
          >
            {busy === "join" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("join")}
          </Button>
        </div>
      </section>

      <section className="glass rounded-2xl p-5 shadow-card space-y-3">
        <h2 className="text-base font-bold flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" /> {t("hostNew")}
        </h2>
        <div className="flex items-center gap-3">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("stake")}
          </label>
          <div className="flex gap-2">
            {[10, 20, 50, 100].map((v) => (
              <button
                key={v}
                onClick={() => setStake(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition-smooth ${
                  stake === v
                    ? "border-primary bg-primary/20 text-foreground"
                    : "border-border bg-secondary text-muted-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <Button
          onClick={handleCreate}
          disabled={busy !== null}
          size="lg"
          className="w-full h-12 gradient-primary text-primary-foreground font-bold shadow-elegant"
        >
          {busy === "create" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            `${t("createRoom")} · ${stake}`
          )}
        </Button>
      </section>

      <p className="text-center text-[11px] text-muted-foreground mt-6 leading-relaxed">
        Open this app in two browser tabs (or share the link) to test multiplayer.
      </p>
    </main>
  );
};

export default Index;
