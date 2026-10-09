import { redis, ready, clip, body } from "./_db.js";

const KEY = "gas:site";
const OUTCOMES = ["pending", "resolved", "unresolved"];
const STAGES = ["verified", "forwarded", "inprogress", "actioned"];

async function load() {
  const out = await redis([["GET", KEY]]);
  if (!Array.isArray(out)) throw new Error("redis: " + JSON.stringify(out).slice(0, 150));
  if (out[0] && out[0].error) throw new Error("redis: " + out[0].error);
  let d = {};
  try { d = out[0] && out[0].result ? JSON.parse(out[0].result) : {}; } catch (e) { d = {}; }
  d.status = d.status || {};
  d.edits = d.edits || {};
  d.advice = d.advice || [];
  return d;
}

async function save(d) {
  const out = await redis([["SET", KEY, JSON.stringify(d)]]);
  if (!Array.isArray(out) || (out[0] && out[0].error)) throw new Error("save: " + JSON.stringify(out).slice(0, 150));
}

export default async function handler(req, res) {
  try {
    if (!ready()) return res.status(500).json({ error: "ডাটাবেস সেট করা হয়নি" });

    if (req.method === "GET") {
      const d = await load();
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
      return res.status(200).json(d);
    }
    if (req.method !== "POST") return res.status(405).end();

    const b = body(req);
    if (!process.env.ADMIN_KEY || b.key !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: "ভুল কী" });
    }

    const d = await load();
    const now = Date.now();

    if (b.action === "setNotice") {
      d.notice = {
        text: clip(b.text, 600),
        level: ["info", "warn", "urgent"].includes(b.level) ? b.level : "info",
        on: !!b.on,
        at: now,
      };
    } else if (b.action === "setPrices") {
      const old = (d.prices && d.prices.items) || [];
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 40).map((i) => {
        const brand = clip(i.brand, 60), size = clip(i.size, 40), price = Number(i.price);
        if (!brand || !isFinite(price) || price <= 0) return null;
        const o = old.find((x) => x.brand === brand && x.size === size);
        const it = { brand, size, price, note: clip(i.note, 80) };
        if (o && o.price !== price) it.prev = o.price;
        else if (o && o.prev) it.prev = o.prev;
        return it;
      }).filter(Boolean);
      const history = [...((d.prices && d.prices.history) || [])];
      if (d.prices && old.length) history.push({ at: d.prices.updated, items: old, source: d.prices.source || "" });
      d.prices = { items, source: clip(b.source, 200), note: clip(b.note, 300), updated: now, history: history.slice(-30) };
    } else if (b.action === "addAdvice") {
      const title = clip(b.title, 120), text = clip(b.text, 1500);
      if (!title || !text) return res.status(400).json({ error: "শিরোনাম ও লেখা দিন" });
      d.advice = [{ id: now.toString(36) + Math.random().toString(36).slice(2, 6), title, text, at: now }, ...d.advice].slice(0, 50);
    } else if (b.action === "delAdvice") {
      d.advice = d.advice.filter((a) => a.id !== clip(b.id, 64));
    } else if (b.action === "setStatus") {
      const id = clip(b.id, 64);
      if (!/^[\w-]+$/.test(id)) return res.status(400).json({ error: "id" });
      const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : "";
      const stage = STAGES.includes(b.stage) ? b.stage : "";
      const note = clip(b.note, 500);
      const prev = d.status[id] || { log: [] };
      const log = [...(prev.log || []), { at: now, outcome, stage, note }].slice(-30);
      d.status[id] = { outcome, stage, note, at: now, log };
    } else if (b.action === "setAddress") {
      const id = clip(b.id, 64);
      if (!/^[\w-]+$/.test(id)) return res.status(400).json({ error: "id" });
      const e = {};
      ["division", "district", "upazila", "union", "area", "postOffice", "postCode"].forEach((k) => { e[k] = clip(b[k], 120); });
      d.edits[id] = e;
    } else if (b.action === "clearAddress") {
      delete d.edits[clip(b.id, 64)];
    } else if (b.action === "clearStatus") {
      delete d.status[clip(b.id, 64)];
    } else {
      return res.status(400).json({ error: "action" });
    }

    await save(d);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "server: " + (e && e.message ? e.message : String(e)) });
  }
}
