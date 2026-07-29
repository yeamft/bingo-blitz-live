import fs from "node:fs";

const env = fs.readFileSync(".env", "utf8");
const get = (key) => env.match(new RegExp(`${key}=\\"?([^\\r\\n\\"]+)`))?.[1];
const url = get("VITE_SUPABASE_URL");
const key = get("VITE_SUPABASE_PUBLISHABLE_KEY");

const body = {
  action: "admin_login",
  email: "admin@yegarabingo.com",
  password: "admin12345",
};

const res = await fetch(`${url}/functions/v1/game-action`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify(body),
});

console.log(res.status, await res.text());
