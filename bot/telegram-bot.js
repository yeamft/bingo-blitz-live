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
const PORT = Number(process.env.PORT || 3000);

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

function helpText() {
  return [
    "🎱 Yegara Bingo Bot",
    "",
    "/start - Register and show quick actions",
    "/register - Register your account",
    "/balance - Show wallet balances",
    "/deposit <amount> <note> - Create a deposit request",
    "/play - Open the Bingo app",
  ].join("\n");
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
  const text = [
    `👋 Welcome ${player.username}!`,
    "Your Bingo account is ready.",
    "",
    helpText(),
  ].join("\n");

  const reply_markup = MINI_APP_URL
    ? {
        inline_keyboard: [
          [{ text: "🎮 Play Bingo", web_app: { url: MINI_APP_URL } }],
          [{ text: "💰 Check Balance", callback_data: "balance" }],
        ],
      }
    : undefined;

  await telegram("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup,
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
      await telegram("sendMessage", {
        chat_id: chatId,
        text: `✅ Registered as ${player.username}\nTelegram ID: ${player.telegram_id}`,
      });
      return;
    }

    if (command === "/balance") {
      const player = await registerPlayer(message);
      const summary = await callGameAction("get_wallet_summary", { player_id: player.id });
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
      await telegram("sendMessage", {
        chat_id: chatId,
        text: `🧾 Deposit request submitted\nAmount: ${amount}\nStatus: ${result.request.status}`,
      });
      return;
    }

    if (command === "/play") {
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
      await telegram("sendMessage", { chat_id: chatId, text: balanceText(summary) });
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