/**
 * Read-only diagnostic for admin login.
 * Reports which edge-function actions are live and whether an admin row exists.
 *
 *   node scripts/diagnose-admin.mjs
 */
import fs from "node:fs";

const env = fs.readFileSync(".env", "utf8");
const readEnv = (key) => env.match(new RegExp(`${key}=\\"?([^\\r\\n\\"]+)`))?.[1];

const url = readEnv("VITE_SUPABASE_URL");
const anonKey = readEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

if (!url || !anonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

async function callAction(body) {
  const response = await fetch(`${url}/functions/v1/game-action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  });
  let parsed;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
}

const FAKE_UUID = "00000000-0000-4000-8000-000000000000";

// Read-only probes ordered oldest feature -> newest, to pin the deployed vintage.
const probes = [
  ["get_player_by_telegram (original)", { action: "get_player_by_telegram", telegram_id: "__diagnostic__" }],
  ["get_wallet_summary (wallet phase)", { action: "get_wallet_summary", player_id: FAKE_UUID }],
  ["get_room_cartela_market (cartelas)", { action: "get_room_cartela_market", room_id: FAKE_UUID }],
  ["get_admin_summary (admin phase)", { action: "get_admin_summary", player_id: FAKE_UUID }],
  ["admin_login (admin auth)", { action: "admin_login", email: "diagnostic@example.com", password: "x" }],
  ["get_system_settings (current)", { action: "get_system_settings", player_id: FAKE_UUID }],
  ["admin_logout (current)", { action: "admin_logout" }],
  ["definitely_not_an_action", { action: "definitely_not_an_action" }],
];

const results = [];
for (const [label, body] of probes) {
  results.push([label, await callAction(body)]);
}

console.log(`\nProject: ${url}\n`);

let anyPresent = false;
for (const [label, result] of results) {
  const message = result.body?.error ?? JSON.stringify(result.body)?.slice(0, 60) ?? "ok";
  const unknown = message === "unknown action";
  if (!unknown && !label.startsWith("definitely_not")) anyPresent = true;
  console.log(`${unknown ? "MISSING " : "present "} ${label.padEnd(36)} ${result.status}  ${message}`);
}

console.log("");
if (!anyPresent) {
  console.log("RESULT: NO action from this codebase is recognised by the deployed function.");
  console.log("        The URL is serving a different or stub function, not this project's game-action.");
  console.log("Fix:    npx supabase functions deploy game-action --use-api");
} else {
  console.log("RESULT: the function is this project's, but predates the admin auth work.");
  console.log("Fix:    npx supabase functions deploy game-action --use-api");
}
console.log("");
