const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

const PORT = process.env.PORT || 3000;
const POSTGREST_URL = (process.env.POSTGREST_URL || "").replace(/\/+$/, "");

// ==============================
// SECURITY BASIC
// ==============================
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "100kb" }));

// Giới hạn request API
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

// ==============================
// CONFIG CHECK
// ==============================
function hasPostgrestUrl() {
  return Boolean(POSTGREST_URL);
}

function requirePostgrestUrl(req, res, next) {
  if (!hasPostgrestUrl()) {
    return res.status(500).json({
      ok: false,
      error: "Missing POSTGREST_URL"
    });
  }

  next();
}

// ==============================
// POSTGREST FETCH FUNCTION
// ==============================
async function fetchFromPostgrest(endpoint, limit = 5000) {
  const url = `${POSTGREST_URL}/${endpoint}?select=*&limit=${limit}`;

  try {
    const response = await fetch(url, {
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
      url,
      text,
      data,
      isJson
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      url,
      text: error.message,
      data: null,
      isJson: false
    };
  }
}

// ==============================
// HANDLE DATA RESPONSE
// ==============================
async function handleData(req, res, endpointName, tableDisplayName) {
  const result = await fetchFromPostgrest(endpointName, 5000);

  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      table: tableDisplayName,
      error: "Unable to fetch data from PostgREST",
      called_url: result.url,
      raw_text: result.text
    });
  }

  if (!result.isJson) {
    return res.status(500).json({
      ok: false,
      table: tableDisplayName,
      error: "PostgREST did not return valid JSON",
      called_url: result.url,
      raw_text: result.text
    });
  }

  const rows = Array.isArray(result.data) ? result.data : [];

  return res.json({
    ok: true,
    table: tableDisplayName,
    count: rows.length,
    data: rows
  });
}

// ==============================
// HEALTH / DEBUG
// ==============================
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "nodejs-secure-postgrest-viewer",
    message: "Node.js server is running",
    postgrest_configured: hasPostgrestUrl(),
    endpoints: {
      health: "/health",
      debug: "/api/debug",
      a2: "/api/a2",
      lenh_quyetdinh: "/api/lenh-quyetdinh",
      raw_a2: "/api/raw/a2",
      raw_lenh_quyetdinh: "/api/raw/lenh-quyetdinh"
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "nodejs-secure-postgrest-viewer",
    message: "This is Node.js server"
  });
});

app.get("/api/debug", (req, res) => {
  res.json({
    ok: true,
    service: "nodejs-secure-postgrest-viewer",
    postgrest_configured: hasPostgrestUrl(),
    postgrest_url_preview: POSTGREST_URL
      ? POSTGREST_URL.replace(/^https?:\/\//, "").slice(0, 45) + "..."
      : null,
    endpoints: {
      a2: "/api/a2",
      lenh_quyetdinh: "/api/lenh-quyetdinh",
      raw_a2: "/api/raw/a2",
      raw_lenh_quyetdinh: "/api/raw/lenh-quyetdinh"
    }
  });
});

// ==============================
// RAW DEBUG ENDPOINTS
// ==============================

// Debug bảng _A2
app.get("/api/raw/a2", requirePostgrestUrl, async (req, res) => {
  const result = await fetchFromPostgrest("_A2", 5);

  res.json({
    ok: result.ok,
    status: result.status,
    table: "_A2",
    called_url: result.url,
    is_json: result.isJson,
    raw_text: result.text,
    data: result.data
  });
});

// Debug bảng lenh_quyetdinh
app.get("/api/raw/lenh-quyetdinh", requirePostgrestUrl, async (req, res) => {
  const result = await fetchFromPostgrest("lenh_quyetdinh", 5);

  res.json({
    ok: result.ok,
    status: result.status,
    table: "lenh_quyetdinh",
    called_url: result.url,
    is_json: result.isJson,
    raw_text: result.text,
    data: result.data
  });
});

// ==============================
// MAIN READ-ONLY API
// ==============================

// Lấy dữ liệu bảng _A2
app.get("/api/a2", requirePostgrestUrl, async (req, res) => {
  await handleData(req, res, "_A2", "_A2");
});

// Lấy dữ liệu bảng lenh_quyetdinh
app.get("/api/lenh-quyetdinh", requirePostgrestUrl, async (req, res) => {
  await handleData(req, res, "lenh_quyetdinh", "lenh_quyetdinh");
});

// ==============================
// BLOCK WRITE METHODS
// ==============================
app.post("/api/*", (req, res) => {
  res.status(405).json({
    ok: false,
    error: "Read only API. POST is not allowed."
  });
});

app.put("/api/*", (req, res) => {
  res.status(405).json({
    ok: false,
    error: "Read only API. PUT is not allowed."
  });
});

app.patch("/api/*", (req, res) => {
  res.status(405).json({
    ok: false,
    error: "Read only API. PATCH is not allowed."
  });
});

app.delete("/api/*", (req, res) => {
  res.status(405).json({
    ok: false,
    error: "Read only API. DELETE is not allowed."
  });
});

// ==============================
// SERVE HTML IF EXISTS
// ==============================
app.use(express.static(path.join(__dirname, "public")));

app.get("/view", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ==============================
// 404 HANDLER
// ==============================
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
    path: req.path,
    available_endpoints: [
      "/",
      "/health",
      "/api/debug",
      "/api/raw/a2",
      "/api/raw/lenh-quyetdinh",
      "/api/a2",
      "/api/lenh-quyetdinh",
      "/view"
    ]
  });
});

// ==============================
// START SERVER
// ==============================
app.listen(PORT, () => {
  console.log(`Node.js server running on port ${PORT}`);
});
