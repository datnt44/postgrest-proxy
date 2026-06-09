const express = require("express");

const app = express();

app.use(express.json({ limit: "1mb" }));

const POSTGREST_URL = (process.env.POSTGREST_URL || "").replace(/\/+$/, "");
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

function checkConfig(req, res, next) {
  if (!POSTGREST_URL) {
    return res.status(500).json({
      ok: false,
      error: "Missing POSTGREST_URL"
    });
  }

  next();
}

async function pgGet(tableName, limit = 5000) {
  const url = `${POSTGREST_URL}/${encodeURI(tableName)}?select=*&limit=${limit}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const text = await response.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      url,
      text,
      data
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      url,
      text: error.message,
      data: null
    };
  }
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Express proxy is running - read only",
    postgrest_url_configured: Boolean(POSTGREST_URL),
    endpoints: {
      a2: "/api/a2",
      lenh_quyetdinh: "/api/lenh-quyetdinh",
      debug_a2: "/api/debug/a2"
    }
  });
});

app.get("/api/debug/a2", checkConfig, async (req, res) => {
  const r = await pgGet("_A2", 5);

  res.json({
    ok: r.ok,
    status: r.status,
    called_url: r.url,
    raw_text: r.text,
    data: r.data
  });
});

app.get("/api/a2", checkConfig, async (req, res) => {
  const r = await pgGet("_A2", 5000);

  if (!r.ok) {
    return res.status(r.status).json({
      ok: false,
      table: "_A2",
      called_url: r.url,
      error: r.text
    });
  }

  const rows = Array.isArray(r.data) ? r.data : [];

  res.json({
    ok: true,
    table: "_A2",
    count: rows.length,
    data: rows
  });
});

app.get("/api/lenh-quyetdinh", checkConfig, async (req, res) => {
  const r = await pgGet("lenh_quyetdinh", 5000);

  if (!r.ok) {
    return res.status(r.status).json({
      ok: false,
      table: "lenh_quyetdinh",
      called_url: r.url,
      error: r.text
    });
  }

  const rows = Array.isArray(r.data) ? r.data : [];

  res.json({
    ok: true,
    table: "lenh_quyetdinh",
    count: rows.length,
    data: rows
  });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log("Proxy running on port", port);
});
