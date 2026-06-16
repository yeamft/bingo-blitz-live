import { useEffect, useState } from "react";
import { api, getErrorMessage, Player } from "@/lib/api";

// Telegram WebApp shape (minimal)
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

export function useTelegramIdentity() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tg = window.Telegram?.WebApp;
      tg?.ready?.();
      tg?.expand?.();
      let telegram_id: string;
      let username: string;
      const tgUser = tg?.initDataUnsafe?.user;
      if (tgUser?.id) {
        telegram_id = String(tgUser.id);
        username = tgUser.username || tgUser.first_name || `Player${tgUser.id}`;
      } else {
        const m = getOrCreateMockIdentity();
        telegram_id = m.id;
        username = m.username;
      }
      try {
        const { player } = await api.upsertPlayer(telegram_id, username);
        if (!cancelled) {
          setPlayer(player);
          setError(null);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setPlayer(null);
          setError(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { player, loading, error };
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
}
