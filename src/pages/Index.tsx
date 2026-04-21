import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTelegramIdentity, haptic } from "@/hooks/useTelegramIdentity";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BingoBall } from "@/components/bingo/BingoBall";
import { Loader2, Plus, LogIn } from "lucide-react";

const Index = () => {
  const { player, loading } = useTelegramIdentity();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  async function handleCreate() {
    if (!player) return;
    setBusy("create");
    haptic("medium");
    try {
      const { room } = await api.createRoom(player.id);
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
    <main className="min-h-screen flex flex-col safe-top safe-bottom px-5 py-8 max-w-md mx-auto">
      <header className="text-center mb-8">
        <div className="flex justify-center gap-2 mb-6">
          <BingoBall number={7} size="lg" className="rotate-[-12deg]" />
          <BingoBall number={42} size="lg" className="translate-y-2" />
          <BingoBall number={99} size="lg" className="rotate-12" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">
          <span className="bg-clip-text text-transparent gradient-primary">Bingo</span> 100
        </h1>
        <p className="text-muted-foreground mt-2">
          Real-time multiplayer · 100 balls · Full house wins
        </p>
      </header>

      <section className="glass rounded-3xl p-6 mb-4 shadow-card">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Playing as</p>
        <p className="text-lg font-semibold">{player.username}</p>
      </section>

      <section className="glass rounded-3xl p-6 mb-4 shadow-card space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <LogIn className="h-5 w-5 text-accent" /> Join a room
        </h2>
        <div className="flex gap-2">
          <Input
            placeholder="ROOM CODE"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={5}
            className="text-center font-mono tracking-[0.4em] text-lg uppercase h-12"
          />
          <Button
            onClick={handleJoin}
            disabled={!code.trim() || busy !== null}
            size="lg"
            className="h-12"
          >
            {busy === "join" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}
          </Button>
        </div>
      </section>

      <section className="glass rounded-3xl p-6 shadow-card space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary" /> Or host a new game
        </h2>
        <Button
          onClick={handleCreate}
          disabled={busy !== null}
          size="lg"
          className="w-full h-14 gradient-primary text-primary-foreground font-bold text-base shadow-elegant"
        >
          {busy === "create" ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create room"}
        </Button>
      </section>

      <p className="text-center text-xs text-muted-foreground mt-8">
        Open this app in two browser tabs (or share the link) to test multiplayer.
      </p>
    </main>
  );
};

export default Index;
