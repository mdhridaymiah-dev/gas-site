import { redis, ready, body } from "./_db.js";

const days = (n) => Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10));
const count = (arr, f) => { const c = {}; arr.forEach((r) => { const k = f(r); c[k] = (c[k] || 0) + 1; }); return c; };

export default async function handler(req, res) {
  if (!ready()) return res.status(500).json({ error: "Database not set" });
  const b = req.method === "POST" ? body(req) : {};
  const key = b.key || req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return res.status(401).json({ error: "Wrong key" });

  const range = async (k, n) => (await redis([["LRANGE", k, 0, n]]))[0].result || [];

  if (req.method === "GET") {
    const d7 = days(7), today = d7[6];
    const q = await redis([
      ["GET", "gas:pv"], ["PFCOUNT", "gas:uv"], ["PFCOUNT", "gas:uc"],
      ["LLEN", "gas:reports"], ["LLEN", "gas:pending"], ["GET", "gas:rejected"],
      ...d7.map((d) => ["GET", "gas:pv:" + d]), ...d7.map((d) => ["PFCOUNT", "gas:uv:" + d]),
    ]);
    const v = (i) => Number(q[i].result || 0);
    const pend = (await range("gas:pending", 199)).map((s) => JSON.parse(s));
    const pubs = (await range("gas:reports", 299)).map((s) => JSON.parse(s));
    const c = pend.length ? await redis(pend.map((i) => ["HGET", "gas:private", i.id])) : [];
    return res.json({
      stats: {
        views: v(0), visitors: v(1), complainers: v(2), published: v(3), pending: v(4), rejected: v(5),
        todayViews: v(6 + 6), todayVisitors: v(13 + 6),
        daily: d7.map((d, n) => ({ day: d, views: v(6 + n), visitors: v(13 + n) })),
        byDivision: count(pubs, (r) => r.division), byType: count(pubs, (r) => r.type || "অন্যান্য"),
      },
      pending: pend.map((i, n) => ({ ...i, contact: c[n].result || "" })),
      published: pubs.slice(0, 50),
    });
  }

  if (req.method === "POST") {
    const list = b.action === "delete" ? "gas:reports" : "gas:pending";
    const raw = (await range(list, 4999)).find((s) => JSON.parse(s).id === b.id);
    if (!raw) return res.status(404).json({ error: "Not found" });
    const cmds = [["LREM", list, 1, raw]];
    if (b.action === "approve") cmds.push(["LPUSH", "gas:reports", raw]);
    else { cmds.push(["HDEL", "gas:private", b.id]); if (b.action === "reject") cmds.push(["INCR", "gas:rejected"]); }
    await redis(cmds);
    return res.json({ ok: true });
  }
  res.status(405).end();
}
