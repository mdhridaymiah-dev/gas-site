import { createHash } from "node:crypto";
import { redis, ready, body } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST" || !ready()) return res.status(204).end();
  const id = String(body(req).id || "").replace(/[^a-z0-9]/gi, "").slice(0, 20);
  if (!id) return res.status(400).end();
  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  const ua = String(req.headers["user-agent"] || "");
  const h = createHash("sha256").update(ip + ua + (process.env.ADMIN_KEY || "s")).digest("hex").slice(0, 24);
  const set = await redis([["SET", `gas:cf:${h}:${id}`, 1, "NX", "EX", 2592000]]);
  if (set[0].result === "OK") await redis([["HINCRBY", "gas:conf", id, 1]]);
  res.json({ ok: true });
}
