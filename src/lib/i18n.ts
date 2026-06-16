// Bilingual EN / Amharic strings + helper hook
import { useEffect, useState } from "react";

export type Lang = "en" | "am";

const STORAGE_KEY = "bingo.lang";

export const t = {
  appName: { en: "Yegara Bingo", am: "የጋራ ቢንጎ" },
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
  derash: { en: "Yegara", am: "የጋራ" },
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
  pausedPhase: { en: "Verification", am: "ማረጋገጫ" },
  finished: { en: "Finished", am: "አልቋል" },
  insufficientBalance: { en: "Insufficient balance", am: "በቦርሳዎ በቂ ገንዘብ የለም" },
  topUp: { en: "Top Up", am: "ገንዘብ ጨምር" },
  cartelaMarket: { en: "Cartela Market", am: "የካርቴላ ገበያ" },
  chooseUpToThree: { en: "Choose up to 3 cartelas", am: "እስከ 3 ካርቴላ ይምረጡ" },
  selected: { en: "Selected", am: "የተመረጠ" },
  totalStake: { en: "Total stake", am: "ጠቅላላ ገቢ" },
  preview: { en: "Preview", am: "ቅድመ እይታ" },
  privateRoom: { en: "Private room", am: "የግል ክፍል" },
  autoFill: { en: "Auto Fill", am: "ራስ-ሙላ" },
  manualMode: { en: "Manual mode", am: "የእጅ ሁኔታ" },
  gameId: { en: "Game ID", am: "የጨዋታ መለያ" },
  winningCard: { en: "Winning card", am: "ያሸነፈ ካርድ" },
  joinNextRound: { en: "Join Next Round", am: "ቀጣዩን ዙር ይቀላቀሉ" },
  falseClaimPenalty: { en: "False claim penalty applied", am: "ሐሰተኛ የቢንጎ ጥሪ ቅጣት ተፈፀመ" },
  bingoUnderReview: { en: "Bingo claim under review", am: "የቢንጎ ጥሪ በማረጋገጫ ላይ ነው" },
  approve: { en: "Approve", am: "አጽድቅ" },
  reject: { en: "Reject", am: "አትቀበል" },
  playWallet: { en: "Play Wallet", am: "የጨዋታ ቦርሳ" },
  mainWallet: { en: "Main Wallet", am: "ዋና ቦርሳ" },
  roomNotFound: { en: "Room not found", am: "ክፍል አልተገኘም" },
  invalidLine: { en: "No completed line", am: "የተጠናቀቀ መስመር የለም" },
  free: { en: "FREE", am: "ነጻ" },
  cardsActive: { en: "Cards", am: "ካርዶች" },
  active: { en: "Active", am: "ንቁ" },
  buyCard: { en: "Buy Card", am: "ካርድ ግዛ" },
  globalAutoFill: { en: "Global Auto Fill", am: "አጠቃላይ ራስ-ሙላ" },
  globalDaubProgress: { en: "Global daub progress", am: "አጠቃላይ ሂደት" },
  toBingo: { en: "TO BINGO", am: "ወደ ቢንጎ" },
  cartela: { en: "Cartela", am: "ካርቴላ" },
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
