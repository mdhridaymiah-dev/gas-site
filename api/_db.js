const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const ready = () => !!(URL_ && TOKEN);
export const redis = async (cmds) => {
  const r = await fetch(URL_ + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  return r.json();
};
export const clip = (v, n) => String(v || "").replace(/[<>]/g, "").trim().slice(0, n);
export const body = (req) => (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {});
