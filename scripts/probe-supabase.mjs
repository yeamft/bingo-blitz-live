import fs from "node:fs";

const env = fs.readFileSync(".env", "utf8");
const get = (key) => env.match(new RegExp(`${key}=\\"?([^\\r\\n\\"]+)`))?.[1];

const url = get("VITE_SUPABASE_URL");
const key = get("VITE_SUPABASE_PUBLISHABLE_KEY");

console.log("URL:", url);

const results = await Promise.all([
  fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
    .then(async (r) => ({ rest: r.status, body: (await r.text()).slice(0, 150) }))
    .catch((e) => ({ rest: "ERR", msg: e.cause?.code || e.message })),
  fetch(`${url}/functions/v1/game-action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      action: "upsert_player",
      telegram_id: `probe_${Date.now()}`,
      username: "ProbeUser",
    }),
  })
    .then(async (r) => ({ fn: r.status, body: (await r.text()).slice(0, 500) }))
    .catch((e) => ({ fn: "ERR", msg: e.cause?.code || e.message })),
]);

console.log(JSON.stringify(results, null, 2));
