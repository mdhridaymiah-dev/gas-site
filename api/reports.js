import { createHash } from "node:crypto";
import { redis, ready, clip, body } from "./_db.js";

const LIMIT = 5;
const MODERATE = process.env.MODERATION !== "off";

export default async function handler(req, res) {
  if (!ready()) return res.status(500).json({ error: "ডাটাবেস সেট করা হয়নি / Database not set" });

  if (req.method === "GET") {
    const out = await redis([["LRANGE", "gas:reports", 0, 499], ["HGETALL", "gas:conf"]]);
    const f = out[1].result || [], conf = {};
    for (let i = 0; i < f.length; i += 2) conf[f[i]] = Number(f[i + 1]);
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
    return res.json((out[0].result || []).map((s) => { const r = JSON.parse(s); delete r.dealer; delete r.dealerCo; r.conf = conf[r.id] || 0; return r; }));
  }

  if (req.method === "POST") {
    const b = body(req);
    if (b.website) return res.json({ ok: true, pending: true });

    const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
    const h = createHash("sha256").update(ip + (process.env.ADMIN_KEY || "s")).digest("hex").slice(0, 24);
    const rl = await redis([["INCR", "gas:rl:" + h], ["EXPIRE", "gas:rl:" + h, 3600, "NX"]]);
    if (rl[0].result > LIMIT) return res.status(429).json({ error: "অনেক বেশি জমা হয়েছে, এক ঘণ্টা পরে আবার চেষ্টা করুন / Too many submissions, try again in an hour" });

    const text = clip(b.text, 1000), division = clip(b.division, 30);
    if (text.length < 10 || !division) return res.status(400).json({ error: "বিভাগ ও কমপক্ষে ১০ অক্ষরের বিবরণ দিন / Choose a division and write at least 10 characters" });

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const pub = {
      id, at: new Date().toISOString(), division, area: clip(b.area, 160), type: clip(b.type, 40), office: clip(b.office, 40), district: clip(b.district, 60), upazila: clip(b.upazila, 60), union: clip(b.union, 60), postOffice: clip(b.postOffice, 80), postCode: clip(b.postCode, 10),
      text,
      amount: Math.min(Math.max(parseInt(b.amount) || 0, 0), 10000000),
      outcome: ["resolved", "unresolved", "pending"].includes(b.outcome) ? b.outcome : "pending",
      name: !b.name || b.anonymous ? "" : clip(b.name, 60),
    };
    const list = MODERATE ? "gas:pending" : "gas:reports";
    const cmds = [["LPUSH", list, JSON.stringify(pub)], ["LTRIM", list, 0, 4999]];
    cmds.push(["PFADD", "gas:uc", h]);
    if (b.contact) cmds.push(["HSET", "gas:private", id, clip(b.contact, 120)]);
    await redis(cmds);
    return res.json({ ok: true, pending: MODERATE });
  }
  res.status(405).end();
}
