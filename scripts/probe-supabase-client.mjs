import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env", "utf8");
const get = (key) => env.match(new RegExp(`${key}=\\"?([^\\r\\n\\"]+)`))?.[1];

const url = get("VITE_SUPABASE_URL");
const key = get("VITE_SUPABASE_PUBLISHABLE_KEY");
const db = createClient(url, key);

const [{ data: rooms, error: roomsError }, { data: players, error: playersError }, fn] =
  await Promise.all([
    db.from("rooms").select("id,code,status,stake_amount").limit(3),
    db.from("players").select("id,username").limit(3),
    fetch(`${url}/functions/v1/game-action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        action: "get_wallet_summary",
        player_id: "9a1517da-caee-481e-95a2-6158f2ac0132",
      }),
    }).then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 300) })),
  ]);

console.log(JSON.stringify({ roomsError, rooms, playersError, playersCount: players?.length, fn }, null, 2));
