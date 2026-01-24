const express = require("express");
const app = express();
app.use(express.json({ limit: "1mb" }));

const POSTGREST_URL = (process.env.POSTGREST_URL || "").replace(/\/+$/, "");
const INSERT_ENDPOINT = (process.env.INSERT_ENDPOINT || "").replace(/^\/+/, "");
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

async function pgFetch(path, options = {}) {
  const url = `${POSTGREST_URL}/${path.replace(/^\/+/, "")}`;
  const res = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { res, text, data };
}

// Lookups (ẩn tên bảng thật)
app.get("/api/lookups/dan-toc", async (req, res) => {
  const r = await pgFetch("dan%20toc?select=dan%20toc&order=dan%20toc.asc&limit=2000");
  if (!r.res.ok) return res.status(r.res.status).json({ error: r.text });
  const rows = Array.isArray(r.data) ? r.data : [];
  res.json(rows.map(x => x["dan toc"]).filter(Boolean));
});

app.get("/api/lookups/quoc-tich", async (req, res) => {
  const r = await pgFetch("quoc_tich?select=ten&order=ten.asc&limit=300");
  if (!r.res.ok) return res.status(r.res.status).json({ error: r.text });
  const rows = Array.isArray(r.data) ? r.data : [];
  res.json(rows.map(x => x.ten).filter(Boolean));
});

app.get("/api/lookups/noi-tt", async (req, res) => {
  const r = await pgFetch("donvihanhchinh?select=xa,tinh&limit=2000");
  if (!r.res.ok) return res.status(r.res.status).json({ error: r.text });
  const rows = Array.isArray(r.data) ? r.data : [];
  const values = rows
    .map(x => `${x.xa || ""} - ${x.tinh || ""}`.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .sort((a,b) => a.localeCompare(b, "vi"));
  res.json(values);
});

// Submit (ẩn endpoint insert thật)
app.post("/api/submit", async (req, res) => {
  const r = await pgFetch(INSERT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(req.body || {})
  });
  if (!r.res.ok) return res.status(r.res.status).json({ error: r.text });
  res.json(r.data);
});

app.get("/", (req, res) => res.send("OK"));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Proxy running on", port));
