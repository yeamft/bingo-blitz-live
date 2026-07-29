// Production Telegram bot webhook for Yegara Bingo.
// Phone-first registration: /start requires the user's own shared contact before account creation.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || Deno.env.get("BOT_TOKEN") || "";
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
const BOT_INTERNAL_SECRET = Deno.env.get("BOT_INTERNAL_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MINI_APP_URL = (
  Deno.env.get("TELEGRAM_MINI_APP_URL") ||
  Deno.env.get("APP_URL") ||
  ""
).trim();
const SUPPORT_CONTACT =
  Deno.env.get("TELEGRAM_SUPPORT_CONTACT") ||
  Deno.env.get("SUPPORT_CONTACT") ||
  "@yegarabingo_support";

const TELEGRAM_API = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : "";

type TgUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TgContact = {
  phone_number: string;
  user_id?: number;
  first_name?: string;
};

type TgMessage = {
  message_id: number;
  chat: { id: number };
  from?: TgUser;
  text?: string;
  contact?: TgContact;
};

type TgCallbackQuery = {
  id: string;
  from: TgUser;
  data?: string;
  message?: { chat: { id: number } };
};

type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

type Player = {
  id: string;
  telegram_id: string;
  username: string;
  phone_number?: string | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function telegram(method: string, body: Record<string, unknown>) {
  if (!TELEGRAM_API) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
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

async function callGameAction(action: string, args: Record<string, unknown> = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase credentials are not configured");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
  if (BOT_INTERNAL_SECRET) {
    headers["x-bot-internal-secret"] = BOT_INTERNAL_SECRET;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/game-action`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...args }),
  });
  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `game-action error (${res.status})`);
  }
  return data;
}

function getIdentity(user: TgUser | undefined) {
  if (!user?.id) throw new Error("Telegram user not found.");
  return {
    telegram_id: String(user.id),
    username:
      user.username ||
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      `Player${user.id}`,
  };
}

function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0") && digits.length === 10) digits = `251${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 9) digits = `251${digits}`;
  if (!/^\d{9,15}$/.test(digits)) return null;
  return digits;
}

function playButton() {
  if (!MINI_APP_URL) return { text: "🎮 Play", callback_data: "play" };
  return { text: "🎮 Play", web_app: { url: MINI_APP_URL } };
}

function registeredMenuMarkup() {
  return {
    inline_keyboard: [
      [playButton()],
      [
        { text: "💼 Balance", callback_data: "balance" },
        { text: "📘 How to play", callback_data: "instructions" },
      ],
      [{ text: "🆘 Support", callback_data: "support" }],
    ],
  };
}

function phoneKeyboard() {
  return {
    keyboard: [[{ text: "📱 Share phone number", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function welcomeRegistered(player: Player, summary: {
  summary: { play_wallet_balance: number; main_wallet_balance: number; total_balance: number };
}) {
  return [
    `👋 Welcome back, ${player.username}!`,
    "",
    `💼 Play: ${summary.summary.play_wallet_balance}`,
    `🏦 Main: ${summary.summary.main_wallet_balance}`,
    `🧮 Total: ${summary.summary.total_balance}`,
    "",
    "Tap Play to open Bingo.",
  ].join("\n");
}

function welcomeNeedsPhone(username: string) {
  return [
    `👋 Hi ${username}!`,
    "",
    "To create your Yegara Bingo account, share your phone number.",
    "Tap the button below — only your own number is accepted.",
  ].join("\n");
}

function instructionsText() {
  return [
    "📘 How to play",
    "",
    "1. Open Play and pick a stake.",
    "2. Choose up to 3 cartelas.",
    "3. Wait for the lobby countdown.",
    "4. Mark numbers or use auto-fill.",
    "5. Claim Bingo when you win.",
    "",
    "Deposit and withdraw from the Wallet tab in the app.",
  ].join("\n");
}

async function findPlayer(user: TgUser): Promise<Player | null> {
  const identity = getIdentity(user);
  const { player } = await callGameAction("get_player_by_telegram", {
    telegram_id: identity.telegram_id,
  });
  return player ?? null;
}

async function registerWithPhone(user: TgUser, phoneNumber: string): Promise<Player> {
  const identity = getIdentity(user);
  const phone = normalizePhone(phoneNumber);
  if (!phone) throw new Error("That phone number looks invalid. Please share again.");
  const { player } = await callGameAction("upsert_player", {
    ...identity,
    phone_number: phone,
  });
  return player;
}

async function sendStart(chatId: number, user: TgUser) {
  const identity = getIdentity(user);
  const player = await findPlayer(user);

  if (player?.phone_number?.trim()) {
    const summary = await callGameAction("get_wallet_summary", { player_id: player.id });
    await telegram("sendMessage", {
      chat_id: chatId,
      text: welcomeRegistered(player, summary),
      reply_markup: registeredMenuMarkup(),
    });
    return;
  }

  await telegram("sendMessage", {
    chat_id: chatId,
    text: welcomeNeedsPhone(identity.username),
    reply_markup: phoneKeyboard(),
  });
}

async function handleContact(message: TgMessage) {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;
  const contact = message.contact;
  if (!contact?.phone_number) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Please use the Share phone number button.",
      reply_markup: phoneKeyboard(),
    });
    return;
  }
  if (contact.user_id && contact.user_id !== user.id) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Please share your own phone number.",
      reply_markup: phoneKeyboard(),
    });
    return;
  }

  const player = await registerWithPhone(user, contact.phone_number);
  const summary = await callGameAction("get_wallet_summary", { player_id: player.id });
  await telegram("sendMessage", {
    chat_id: chatId,
    text: `✅ Account ready, ${player.username}!\n📱 ${player.phone_number}`,
    reply_markup: { remove_keyboard: true },
  });
  await telegram("sendMessage", {
    chat_id: chatId,
    text: welcomeRegistered(player, summary),
    reply_markup: registeredMenuMarkup(),
  });
}

async function requireRegistered(user: TgUser): Promise<Player> {
  const player = await findPlayer(user);
  if (!player?.phone_number?.trim()) {
    throw new Error("Share your phone number first to finish registration.");
  }
  return player;
}

async function handleMessage(message: TgMessage) {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;

  try {
    if (message.contact) {
      await handleContact(message);
      return;
    }

    const text = (message.text || "").trim();
    const command = text.split(/\s+/)[0]?.split("@")[0] || "";

    if (command === "/start" || command === "/register") {
      await sendStart(chatId, user);
      return;
    }

    if (command === "/balance") {
      const player = await requireRegistered(user);
      const summary = await callGameAction("get_wallet_summary", { player_id: player.id });
      await telegram("sendMessage", {
        chat_id: chatId,
        text: [
          `👤 ${summary.player.username}`,
          `💼 Play: ${summary.summary.play_wallet_balance}`,
          `🏦 Main: ${summary.summary.main_wallet_balance}`,
          `🧮 Total: ${summary.summary.total_balance}`,
        ].join("\n"),
        reply_markup: registeredMenuMarkup(),
      });
      return;
    }

    if (command === "/play") {
      const player = await requireRegistered(user);
      if (!MINI_APP_URL) {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "Mini App URL is not configured yet. Set TELEGRAM_MINI_APP_URL.",
        });
        return;
      }
      await telegram("sendMessage", {
        chat_id: chatId,
        text: `Ready, ${player.username}. Tap Play to open Bingo.`,
        reply_markup: { inline_keyboard: [[playButton()]] },
      });
      return;
    }

    if (command === "/instructions" || command === "/help") {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: instructionsText(),
        reply_markup: registeredMenuMarkup(),
      });
      return;
    }

    if (command === "/support") {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: `🆘 Support\n\nContact: ${SUPPORT_CONTACT}`,
        reply_markup: registeredMenuMarkup(),
      });
      return;
    }

    if (command === "/deposit" || command === "/withdraw" || command === "/withdrawal") {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "Open the app Wallet tab to deposit or withdraw.",
        reply_markup: registeredMenuMarkup(),
      });
      return;
    }

    await sendStart(chatId, user);
  } catch (error) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: `❌ ${error instanceof Error ? error.message : "Something went wrong"}`,
    });
  }
}

async function handleCallback(callback: TgCallbackQuery) {
  const chatId = callback.message?.chat?.id;
  if (!chatId) return;

  try {
    const data = callback.data || "";
    if (data === "balance") {
      const player = await requireRegistered(callback.from);
      const summary = await callGameAction("get_wallet_summary", { player_id: player.id });
      await telegram("sendMessage", {
        chat_id: chatId,
        text: [
          `👤 ${summary.player.username}`,
          `💼 Play: ${summary.summary.play_wallet_balance}`,
          `🏦 Main: ${summary.summary.main_wallet_balance}`,
          `🧮 Total: ${summary.summary.total_balance}`,
        ].join("\n"),
        reply_markup: registeredMenuMarkup(),
      });
    } else if (data === "play") {
      await requireRegistered(callback.from);
      if (!MINI_APP_URL) {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "Mini App URL is not configured yet.",
        });
      } else {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "Tap Play to open Bingo.",
          reply_markup: { inline_keyboard: [[playButton()]] },
        });
      }
    } else if (data === "instructions") {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: instructionsText(),
        reply_markup: registeredMenuMarkup(),
      });
    } else if (data === "support") {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: `🆘 Support\n\nContact: ${SUPPORT_CONTACT}`,
        reply_markup: registeredMenuMarkup(),
      });
    } else if (data === "register") {
      await sendStart(chatId, callback.from);
    }
  } catch (error) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: `❌ ${error instanceof Error ? error.message : "Something went wrong"}`,
    });
  } finally {
    await telegram("answerCallbackQuery", { callback_query_id: callback.id });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return json({
      ok: true,
      service: "yegara-bingo-telegram-bot",
      miniAppConfigured: Boolean(MINI_APP_URL),
    });
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  if (!TELEGRAM_BOT_TOKEN) {
    return json({ error: "TELEGRAM_BOT_TOKEN not configured" }, 500);
  }

  if (TELEGRAM_WEBHOOK_SECRET) {
    const provided = req.headers.get("x-telegram-bot-api-secret-token") || "";
    if (!timingSafeEqual(provided, TELEGRAM_WEBHOOK_SECRET)) {
      return json({ error: "unauthorized" }, 401);
    }
  }

  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  try {
    if (update.message) await handleMessage(update.message);
    if (update.callback_query) await handleCallback(update.callback_query);
  } catch (error) {
    console.error("telegram-bot handler error", error);
  }

  // Always 200 so Telegram does not retry endlessly on handler bugs.
  return json({ ok: true });
});
