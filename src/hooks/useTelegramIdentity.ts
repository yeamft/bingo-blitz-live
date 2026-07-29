import { useEffect, useState } from "react";
import { api, getErrorMessage, Player } from "@/lib/api";

type TgUser = { id: number; username?: string; first_name?: string };
type TgWebApp = {
  initDataUnsafe?: { user?: TgUser };
  ready?: () => void;
  expand?: () => void;
  HapticFeedback?: {
    impactOccurred: (s: "light" | "medium" | "heavy") => void;
    notificationOccurred: (s: "success" | "error" | "warning") => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

const STORAGE_KEY = "bingo.mock_identity";
const LOCAL_PLAYER_KEY = "bingo.local_player";
const OFFLINE_ALLOWED = import.meta.env.DEV;

function getOrCreateMockIdentity(): { id: string; username: string } {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return JSON.parse(existing);
  const id = "mock_" + Math.random().toString(36).slice(2, 10);
  const adjectives = ["Lucky", "Swift", "Bold", "Calm", "Wild", "Cosmic", "Neon", "Zen"];
  const animals = ["Fox", "Owl", "Tiger", "Whale", "Lynx", "Wolf", "Hawk", "Bear"];
  const username =
    adjectives[Math.floor(Math.random() * adjectives.length)] +
    animals[Math.floor(Math.random() * animals.length)] +
    Math.floor(Math.random() * 99);
  const identity = { id, username };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

function buildLocalPlayer(telegram_id: string, username: string, phone?: string | null): Player {
  const raw = localStorage.getItem(LOCAL_PLAYER_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Player;
      if (parsed.telegram_id === telegram_id) {
        return {
          ...parsed,
          username,
          phone_number: phone ?? parsed.phone_number,
        };
      }
    } catch {
      // ignore
    }
  }

  const player: Player = {
    id: `local-${telegram_id}`,
    telegram_id,
    username,
    phone_number: phone ?? null,
    wallet_balance: 5000,
    main_wallet_balance: 5000,
    play_wallet_balance: 5000,
    is_admin: false,
    is_blocked: false,
    created_at: new Date().toISOString(),
  };
  localStorage.setItem(LOCAL_PLAYER_KEY, JSON.stringify(player));
  return player;
}

function saveLocalPlayer(player: Player) {
  localStorage.setItem(LOCAL_PLAYER_KEY, JSON.stringify(player));
}

export function useTelegramIdentity() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [identity, setIdentity] = useState<{ telegram_id: string; username: string } | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
    const tgUser = tg?.initDataUnsafe?.user;
    if (tgUser?.id) {
      setIdentity({
        telegram_id: String(tgUser.id),
        username: tgUser.username || tgUser.first_name || `Player${tgUser.id}`,
      });
      return;
    }
    const mock = getOrCreateMockIdentity();
    setIdentity({ telegram_id: mock.id, username: mock.username });
  }, []);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    (async () => {
      try {
        const { player } = await api.upsertPlayer(identity.telegram_id, identity.username);
        if (!cancelled) {
          setPlayer(player);
          setError(null);
          setOffline(false);
          saveLocalPlayer(player);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          if (OFFLINE_ALLOWED) {
            const local = buildLocalPlayer(identity.telegram_id, identity.username);
            setPlayer(local);
            setOffline(true);
            setError(null);
          } else {
            setPlayer(null);
            setError(getErrorMessage(err));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity]);

  async function completePhoneRegistration(phone_number: string) {
    if (!identity) throw new Error("Player identity not ready");
    try {
      const { player: updated } = await api.upsertPlayer(
        identity.telegram_id,
        identity.username,
        phone_number.trim(),
      );
      setPlayer(updated);
      setOffline(false);
      saveLocalPlayer(updated);
      return updated;
    } catch (err) {
      if (!OFFLINE_ALLOWED || !player) throw err;
      const updated = {
        ...player,
        phone_number: phone_number.trim(),
      };
      setPlayer(updated);
      saveLocalPlayer(updated);
      return updated;
    }
  }

  async function refreshPlayer() {
    if (!identity) return null;
    try {
      const { player: updated } = await api.upsertPlayer(
        identity.telegram_id,
        identity.username,
        player?.phone_number ?? undefined,
      );
      setPlayer(updated);
      setOffline(false);
      saveLocalPlayer(updated);
      return updated;
    } catch {
      if (player) return player;
      return null;
    }
  }

  function updateLocalPlayer(next: Player) {
    setPlayer(next);
    saveLocalPlayer(next);
  }

  const needsPhoneNumber = Boolean(player && !player.phone_number?.trim());

  return {
    player,
    loading,
    error,
    offline,
    needsPhoneNumber,
    completePhoneRegistration,
    refreshPlayer,
    updateLocalPlayer,
  };
}

export function haptic(kind: "light" | "medium" | "heavy" | "success" | "error" | "warning" = "light") {
  const h = window.Telegram?.WebApp?.HapticFeedback;
  if (!h) return;
  if (kind === "success" || kind === "error" || kind === "warning") {
    h.notificationOccurred(kind);
  } else {
    h.impactOccurred(kind);
  }
}

export function resetMockIdentity() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LOCAL_PLAYER_KEY);
}
