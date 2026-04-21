// Bilingual EN / Amharic strings + helper hook
import { useEffect, useState } from "react";

export type Lang = "en" | "am";

const STORAGE_KEY = "bingo.lang";

export const t = {
  appName: { en: "Derash Bingo", am: "ደራሽ ቢንጎ" },
  tagline: {
    en: "75-ball multiplayer · Stake & win the pool",
    am: "75-ኳስ ብዙ ተጫዋች · ገቢ አስገብተው ድል ይቀዳጁ",
  },
  playingAs: { en: "Playing as", am: "የመለያ ስም" },
  wallet: { en: "Wallet", am: "ቦርሳ" },
  joinRoom: { en: "Join a room", am: "ክፍል ይቀላቀሉ" },
  roomCode: { en: "ROOM CODE", am: "የክፍል ኮድ" },
  join: { en: "Join", am: "ግባ" },
  hostNew: { en: "Or host a new game", am: "ወይም አዲስ ጨዋታ ይጀምሩ" },
  stake: { en: "Stake", am: "ገንዘብ" },
  createRoom: { en: "Create room", am: "ክፍል ይክፈቱ" },
  leave: { en: "Leave", am: "ውጣ" },
  refresh: { en: "Refresh", am: "አድስ" },
  bingo: { en: "BINGO!", am: "ቢንጎ!" },
  derash: { en: "Derash", am: "ደራሽ" },
  players: { en: "Players", am: "ተጫዋቾች" },
  watchers: { en: "Watching", am: "ተመልካቾች" },
  startsIn: { en: "Starts in", am: "ይጀምራል በ" },
  waiting: { en: "Round Started. Please Wait", am: "ዙሩ ጀመረ። እባክዎ ይጠብቁ" },
  watchingMode: {
    en: "Watching only — game already in progress",
    am: "በመመልከት ላይ — ጨዋታው ቀድሞ ጀምሯል",
  },
  yourCard: { en: "Your card", am: "የእርስዎ ካርድ" },
  masterBoard: { en: "Master Board", am: "ዋና ሰሌዳ" },
  callLog: { en: "Call Log", am: "የተጠሩ ቁጥሮች" },
  winner: { en: "Winner", am: "አሸናፊ" },
  noWinner: { en: "No winner this round", am: "በዚህ ዙር አሸናፊ የለም" },
  youWon: { en: "You won!", am: "አሸንፈዋል!" },
  payout: { en: "Payout", am: "ሽልማት" },
  pattern: { en: "Pattern", am: "ቅርጽ" },
  lobbyPhase: { en: "Lobby Phase", am: "የመጠበቅ ወቅት" },
  livePhase: { en: "Live", am: "በጨዋታ" },
  finished: { en: "Finished", am: "አልቋል" },
  insufficientBalance: { en: "Insufficient balance", am: "በቦርሳዎ በቂ ገንዘብ የለም" },
  roomNotFound: { en: "Room not found", am: "ክፍል አልተገኘም" },
  invalidLine: { en: "No completed line", am: "የተጠናቀቀ መስመር የለም" },
  free: { en: "FREE", am: "ነጻ" },
};

export function useLang() {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    return (localStorage.getItem(STORAGE_KEY) as Lang) || "en";
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);
  const tr = (key: keyof typeof t) => t[key][lang];
  return { lang, setLang, t: tr, toggle: () => setLang((l) => (l === "en" ? "am" : "en")) };
}
