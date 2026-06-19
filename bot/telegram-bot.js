import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, ".env"));
loadEnvFile(path.resolve(__dirname, "..", ".env"));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const MINI_APP_URL = process.env.TELEGRAM_MINI_APP_URL || process.env.APP_URL || "";
const SUPPORT_CONTACT = process.env.TELEGRAM_SUPPORT_CONTACT || process.env.SUPPORT_CONTACT || "@yegarabingo_support";
const INVITE_URL = process.env.TELEGRAM_INVITE_URL || MINI_APP_URL || "";
const LOGO_URL = process.env.TELEGRAM_BOT_LOGO_URL || process.env.YEGARA_BINGO_LOGO_URL || "";
const PORT = Number(process.env.PORT || 3000);
const sessionState = new Map();

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN in environment.");
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in environment.");
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function telegram(method, body) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram API error on ${method}`);
  }
  return data.result;
}

async function callGameAction(action, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/game-action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ action, ...args }),
  });

  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `Supabase function error (${res.status})`);
  }
  return data;
}

function getTelegramIdentity(messageOrUser) {
  const user = messageOrUser?.from ?? messageOrUser;
  if (!user?.id) throw new Error("Telegram user not found.");
  return {
    telegram_id: String(user.id),
    username:
      user.username ||
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      `Player${user.id}`,
  };
}

async function registerPlayer(messageOrUser) {
  const identity = getTelegramIdentity(messageOrUser);
  const { player } = await callGameAction("upsert_player", identity);
  return player;
}

async function getWalletSummary(player_id) {
  return callGameAction("get_wallet_summary", { player_id });
}

function getSession(chatId) {
  if (!sessionState.has(chatId)) {
    sessionState.set(chatId, {
      lastAction: "Opened bot",
      lastVisitedAt: new Date().toISOString(),
    });
  }
  return sessionState.get(chatId);
}

function updateSession(chatId, patch) {
  const current = getSession(chatId);
  const next = {
    ...current,
    ...patch,
    lastVisitedAt: new Date().toISOString(),
  };
  sessionState.set(chatId, next);
  return next;
}

function helpText() {
  return [
    "🎱 Yegara Bingo Bot",
    "",
    "/start - Register and show quick actions",
    "/register - Register your account",
    "/instructions - How to use Yegara Bingo",
    "/balance - Show wallet balances",
    "/deposit <amount> <note> - Create a deposit request",
    "/withdraw <amount> <note> - Create a withdrawal request",
    "/play - Open the Bingo app",
    "/support - Contact support",
    "/invite - Share the game link",
  ].join("\n");
}

function menuText(player, summary, session) {
  return [
    `👋 Welcome ${player.username}!`,
    "Welcome to Yegara Bingo.",
    "",
    `🆔 Session: ${player.telegram_id}`,
    `💼 Play wallet: ${summary.summary.play_wallet_balance}`,
    `🏦 Main wallet: ${summary.summary.main_wallet_balance}`,
    `🧮 Total balance: ${summary.summary.total_balance}`,
    `🕒 Last action: ${session.lastAction}`,
    "",
    "Choose an option below:",
    "🎮 Play",
    "📝 Register",
    "💵 Deposit",
    "🏧 Withdrawal",
    "📘 Instructions",
    "🆘 Contact Support",
    "📨 Invite",
  ].join("\n");
}

function instructionsText() {
  return [
    "📘 Yegara Bingo Instructions",
    "",
    "1. Tap Play to open the game.",
    "2. Register automatically with /start or /register.",
    "3. Deposit to fund your wallet.",
    "4. Join a room and choose your cartelas.",
    "5. Claim bingo when your line is complete.",
  ].join("\n");
}

function supportText() {
  return [
    "🆘 Contact Support",
    "",
    `Support: ${SUPPORT_CONTACT}`,
  ].join("\n");
}

function inviteText() {
  return [
    "📨 Invite your friends to Yegara Bingo!",
    INVITE_URL ? `Open game: ${INVITE_URL}` : "Invite link is not configured yet.",
  ].join("\n");
}

function mainMenuMarkup() {
  const rows = [
    [{ text: "🎮 Play", callback_data: "play" }, { text: "📝 Register", callback_data: "register" }],
    [{ text: "💵 Deposit", callback_data: "deposit_help" }, { text: "🏧 Withdrawal", callback_data: "withdraw_help" }],
    [{ text: "📘 Instructions", callback_data: "instructions" }, { text: "🆘 Support", callback_data: "support" }],
    [{ text: "📨 Invite", callback_data: "invite" }],
  ];

  if (MINI_APP_URL) {
    rows[0][0] = { text: "🎮 Play", web_app: { url: MINI_APP_URL } };
  }

  return { inline_keyboard: rows };
}

function balanceText(summary) {
  return [
    `👤 ${summary.player.username}`,
    `💼 Play wallet: ${summary.summary.play_wallet_balance}`,
    `🏦 Main wallet: ${summary.summary.main_wallet_balance}`,
    `🧮 Total: ${summary.summary.total_balance}`,
  ].join("\n");
}

async function sendStart(chatId, player) {
  const summary = await getWalletSummary(player.id);
  const session = updateSession(chatId, { lastAction: "Opened main menu" });
  const caption = `${menuText(player, summary, session)}\n\n${helpText()}`;

  if (LOGO_URL) {
    await telegram("sendPhoto", {
      chat_id: chatId,
      photo: LOGO_URL,
      caption,
      reply_markup: mainMenuMarkup(),
    });
    return;
  }

  await telegram("sendMessage", {
    chat_id: chatId,
    text: caption,
    reply_markup: mainMenuMarkup(),
  });
}

async function handleCommand(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const [command, ...rest] = text.split(/\s+/);

  try {
    if (command === "/start") {
      const player = await registerPlayer(message);
      await sendStart(chatId, player);
      return;
    }

    if (command === "/register") {
      const player = await registerPlayer(message);
      updateSession(chatId, { lastAction: "Registered account" });
      await telegram("sendMessage", {
        chat_id: chatId,
        text: `✅ Registered as ${player.username}\nTelegram ID: ${player.telegram_id}`,
      });
      return;
    }

    if (command === "/balance") {
      const player = await registerPlayer(message);
      const summary = await callGameAction("get_wallet_summary", { player_id: player.id });
      updateSession(chatId, { lastAction: "Checked balance" });
      await telegram("sendMessage", { chat_id: chatId, text: balanceText(summary) });
      return;
    }

    if (command === "/deposit") {
      const amount = Number(rest[0]);
      const note = rest.slice(1).join(" ") || "Telegram deposit request";
      if (!Number.isFinite(amount) || amount <= 0) {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "Usage: /deposit <amount> <note>\nExample: /deposit 100 CBE transfer",
        });
        return;
      }
      const player = await registerPlayer(message);
      const result = await callGameAction("request_deposit", {
        player_id: player.id,
        amount,
        note,
      });
      updateSession(chatId, { lastAction: `Deposit request: ${amount}` });
      await telegram("sendMessage", {
        chat_id: chatId,
        text: `🧾 Deposit request submitted\nAmount: ${amount}\nStatus: ${result.request.status}`,
      });
      return;
    }

    if (command === "/withdraw" || command === "/withdrawal") {
      const amount = Number(rest[0]);
      const note = rest.slice(1).join(" ") || "Telegram withdrawal request";
      if (!Number.isFinite(amount) || amount <= 0) {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "Usage: /withdraw <amount> <note>\nExample: /withdraw 100 CBE account",
        });
        return;
      }
      const player = await registerPlayer(message);
      const result = await callGameAction("request_withdrawal", {
        player_id: player.id,
        amount,
        note,
      });
      updateSession(chatId, { lastAction: `Withdrawal request: ${amount}` });
      await telegram("sendMessage", {
        chat_id: chatId,
        text: `🏧 Withdrawal request submitted\nAmount: ${amount}\nStatus: ${result.request.status}`,
      });
      return;
    }

    if (command === "/instructions") {
      updateSession(chatId, { lastAction: "Viewed instructions" });
      await telegram("sendMessage", { chat_id: chatId, text: instructionsText(), reply_markup: mainMenuMarkup() });
      return;
    }

    if (command === "/support") {
      updateSession(chatId, { lastAction: "Opened support info" });
      await telegram("sendMessage", { chat_id: chatId, text: supportText(), reply_markup: mainMenuMarkup() });
      return;
    }

    if (command === "/invite") {
      updateSession(chatId, { lastAction: "Opened invite info" });
      await telegram("sendMessage", { chat_id: chatId, text: inviteText(), reply_markup: mainMenuMarkup() });
      return;
    }

    if (command === "/play") {
      updateSession(chatId, { lastAction: "Opened play link" });
      if (!MINI_APP_URL) {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "Mini app URL is not configured yet. Set TELEGRAM_MINI_APP_URL in your environment.",
        });
        return;
      }
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "Tap below to play Bingo.",
        reply_markup: {
          inline_keyboard: [[{ text: "🎮 Open Bingo", web_app: { url: MINI_APP_URL } }]],
        },
      });
      return;
    }

    await telegram("sendMessage", { chat_id: chatId, text: helpText() });
  } catch (error) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: `❌ ${error.message || "Something went wrong"}`,
    });
  }
}

async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  if (!chatId) return;

  try {
    if (callbackQuery.data === "balance") {
      const player = await registerPlayer(callbackQuery.from);
      const summary = await callGameAction("get_wallet_summary", { player_id: player.id });
      updateSession(chatId, { lastAction: "Checked balance" });
      await telegram("sendMessage", { chat_id: chatId, text: balanceText(summary) });
    } else if (callbackQuery.data === "register") {
      const player = await registerPlayer(callbackQuery.from);
      updateSession(chatId, { lastAction: "Registered account" });
      await telegram("sendMessage", {
        chat_id: chatId,
        text: `✅ Registered as ${player.username}\nTelegram ID: ${player.telegram_id}`,
        reply_markup: mainMenuMarkup(),
      });
    } else if (callbackQuery.data === "play") {
      updateSession(chatId, { lastAction: "Opened play link" });
      if (!MINI_APP_URL) {
        await telegram("sendMessage", { chat_id: chatId, text: "Mini app URL is not configured yet." });
      } else {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "Tap below to play Bingo.",
          reply_markup: { inline_keyboard: [[{ text: "🎮 Open Bingo", web_app: { url: MINI_APP_URL } }]] },
        });
      }
    } else if (callbackQuery.data === "deposit_help") {
      updateSession(chatId, { lastAction: "Viewed deposit help" });
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "💵 To deposit, send: /deposit <amount> <note>\nExample: /deposit 100 CBE transfer",
        reply_markup: mainMenuMarkup(),
      });
    } else if (callbackQuery.data === "withdraw_help") {
      updateSession(chatId, { lastAction: "Viewed withdrawal help" });
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "🏧 To withdraw, send: /withdraw <amount> <note>\nExample: /withdraw 100 Telebirr",
        reply_markup: mainMenuMarkup(),
      });
    } else if (callbackQuery.data === "instructions") {
      updateSession(chatId, { lastAction: "Viewed instructions" });
      await telegram("sendMessage", { chat_id: chatId, text: instructionsText(), reply_markup: mainMenuMarkup() });
    } else if (callbackQuery.data === "support") {
      updateSession(chatId, { lastAction: "Opened support info" });
      await telegram("sendMessage", { chat_id: chatId, text: supportText(), reply_markup: mainMenuMarkup() });
    } else if (callbackQuery.data === "invite") {
      updateSession(chatId, { lastAction: "Opened invite info" });
      await telegram("sendMessage", { chat_id: chatId, text: inviteText(), reply_markup: mainMenuMarkup() });
    }
  } catch (error) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: `❌ ${error.message || "Something went wrong"}`,
    });
  } finally {
    await telegram("answerCallbackQuery", { callback_query_id: callbackQuery.id });
  }
}

async function poll() {
  let offset = 0;
  while (true) {
    try {
      const res = await fetch(`${TELEGRAM_API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.description || "Failed to get updates");

      for (const update of data.result) {
        offset = update.update_id + 1;
        if (update.message?.text) await handleCommand(update.message);
        if (update.callback_query) await handleCallbackQuery(update.callback_query);
      }
    } catch (error) {
      console.error("Bot polling error:", error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

const app = express();

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "bingo-blitz-telegram-bot",
    status: "running",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    miniAppConfigured: Boolean(MINI_APP_URL),
  });
});

app.listen(PORT, () => {
  console.log(`Telegram bot health server listening on port ${PORT}`);
});

console.log("Telegram bot is starting...");
poll().catch((error) => {
  console.error("Telegram bot failed:", error);
  process.exit(1);
});