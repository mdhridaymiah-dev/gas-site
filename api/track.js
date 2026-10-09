import { createHash } from "node:crypto";
import { redis, ready } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST" || !ready()) return res.status(204).end();
  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  const ua = String(req.headers["user-agent"] || "");
  const h = createHash("sha256").update(ip + ua + (process.env.ADMIN_KEY || "s")).digest("hex").slice(0, 24);
  const day = new Date().toISOString().slice(0, 10);
  await redis([
    ["INCR", "gas:pv"], ["INCR", "gas:pv:" + day],
    ["PFADD", "gas:uv", h], ["PFADD", "gas:uv:" + day, h],
    ["EXPIRE", "gas:pv:" + day, 60 * 86400], ["EXPIRE", "gas:uv:" + day, 60 * 86400],
  ]);
  res.status(204).end();
}
