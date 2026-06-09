const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

const PORT = process.env.PORT || 3000;
const POSTGREST_URL = (process.env.POSTGREST_URL || "").replace(/\/+$/, "");

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "100kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many requests. Please try again later."
  }
});

app.use("/api", apiLimiter);

function checkConfig(req, res, next) {
  if (!POSTGREST_URL) {
    return res.status(500).json({
      ok: false,
      error: "Missing POSTGREST_URL"
    });
  }

  next();
}

async function fetchFromPostgrest(endpoint, limit = 5000) {
  const url = new URL(`${POSTGREST_URL}/${endpoint}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const text = await response.text();

  let data = null;
  let isJson = true;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    isJson = false;
  }

  return {
    ok: response.ok,
    status: response.status,
    url: url.toString(),
    text,
    data,
    isJson
  };
}

async function handleData(req, res, endpointName) {
  try {
    const result = await fetchFromPostgrest(endpointName, 5000);

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        error: "Unable to fetch data from PostgREST",
        status: result.status,
        called_url: result.url,
        raw_text: result.text
      });
    }

    if (!result.isJson) {
      return res.status(500).json({
        ok: false,
        error: "PostgREST did not return valid JSON",
        called_url: result.url,
        raw_text: result.text
      });
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    return res.json({
      ok: true,
      endpoint: endpointName,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      message: error.message
    });
  }
}

// Kiểm tra server Node.js
app.get("/api/debug", (req, res) => {
  res.json({
    ok: true,
    service: "nodejs-secure-postgrest-viewer",
    postgrest_configured: Boolean(POSTGREST_URL),
    postgrest_url_preview: POSTGREST_URL
      ? POSTGREST_URL.replace(/^https?:\/\//, "").slice(0, 40) + "..."
      : null,
    endpoints: {
      a2: "/api/a2",
      lenh_quyetdinh: "/api/lenh-quyetdinh",
      raw_a2: "/api/raw/a2",
      raw_lenh_quyetdinh: "/api/raw/lenh-quyetdinh"
    }
  });
});

// Xem raw response từ PostgREST cho A2
app.get("/api/raw/a2", checkConfig, async (req, res) => {
  const result = await fetchFromPostgrest("a2", 5);

  res.json({
    ok: result.ok,
    status: result.status,
    called_url: result.url,
    is_json: result.isJson,
    raw_text: result.text,
    data: result.data
  });
});

// Xem raw response từ PostgREST cho lệnh quyết định
app.get("/api/raw/lenh-quyetdinh", checkConfig, async (req, res) => {
  const result = await fetchFromPostgrest("lenh_quyetdinh", 5);

  res.json({
    ok: result.ok,
    status: result.status,
    called_url: result.url,
    is_json: result.isJson,
    raw_text: result.text,
    data: result.data
  });
});

// API chính: bảng A2
app.get("/api/a2", checkConfig, async (req, res) => {
  await handleData(req, res, "a2");
});

// API chính: bảng lệnh quyết định
app.get("/api/lenh-quyetdinh", checkConfig, async (req, res) => {
  await handleData(req, res, "lenh_quyetdinh");
});

// Chặn các method chỉnh sửa dữ liệu
app.post("/api/*", (req, res) => {
  res.status(405).json({
    ok: false,
    error: "Method not allowed. Read only API."
  });
});

app.put("/api/*", (req, res) => {
  res.status(405).json({
    ok: false,
    error: "Method not allowed. Read only API."
  });
});

app.patch("/api/*", (req, res) => {
  res.status(405).json({
    ok: false,
    error: "Method not allowed. Read only API."
  });
});

app.delete("/api/*", (req, res) => {
  res.status(405).json({
    ok: false,
    error: "Method not allowed. Read only API."
  });
});

// Serve HTML sau khi khai báo API
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Route không tồn tại
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
