const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();

const PORT = process.env.PORT || 3000;

const POSTGREST_URL = (process.env.POSTGREST_URL || "").replace(//+$/, "");

const TABLE_A2 = process.env.TABLE_A2 || "_A2";
const TABLE_LENH_QUYETDINH = process.env.TABLE_LENH_QUYETDINH || "lenh_quyetdinh";

const FRONTEND_URL = process.env.FRONTEND_URL || "";

// ==============================
// BASIC SECURITY
// ==============================
app.use(
helmet({
contentSecurityPolicy: false
})
);

app.use(express.json({ limit: "100kb" }));

// ==============================
// CORS
// ==============================
const allowedOrigins = FRONTEND_URL
.split(",")
.map((item) => item.trim())
.filter(Boolean);

app.use(
cors({
origin: function (origin, callback) {
if (!origin) {
return callback(null, true);
}

```
  if (allowedOrigins.length === 0) {
    return callback(null, true);
  }

  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error("Not allowed by CORS: " + origin));
},
methods: ["GET", "OPTIONS"],
allowedHeaders: ["Content-Type", "Authorization"],
credentials: false
```

})
);

// ==============================
// RATE LIMIT
// ==============================
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
error: "Missing POSTGREST_URL",
hint: "POSTGREST_URL must be the HTTPS URL of your PostgREST service, not the PostgreSQL connection string."
});
}

if (!POSTGREST_URL.startsWith("http://") && !POSTGREST_URL.startsWith("https://")) {
return res.status(500).json({
ok: false,
error: "Invalid POSTGREST_URL",
hint: "POSTGREST_URL must start with http:// or https://. Do not use postgresql:// here."
});
}

next();
}

// ==============================
// POSTGREST FETCH
// ==============================
async function fetchFromPostgrest(tableName, limit = 5000) {
const safeTable = encodeURIComponent(tableName);
const url = `${POSTGREST_URL}/${safeTable}?select=*&limit=${limit}`;

try {
const response = await fetch(url, {
method: "GET",
headers: {
Accept: "application/json"
}
});

```
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
```

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

async function handleData(req, res, tableName, tableDisplayName) {
const limitRaw = req.query.limit || "5000";
const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 5000, 1), 10000);

const result = await fetchFromPostgrest(tableName, limit);

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
// ROOT / HEALTH / DEBUG
// ==============================
app.get("/", (req, res) => {
res.json({
ok: true,
service: "a2-viewer-api",
message: "Node.js API is running",
postgrest_configured: hasPostgrestUrl(),
frontend_url: FRONTEND_URL || null,
tables: {
a2: TABLE_A2,
lenh_quyetdinh: TABLE_LENH_QUYETDINH
},
endpoints: {
health: "/health",
debug: "/api/debug",
a2: "/api/a2",
raw_a2: "/api/raw/a2",
lenh_quyetdinh: "/api/lenh-quyetdinh",
raw_lenh_quyetdinh: "/api/raw/lenh-quyetdinh"
}
});
});

app.get("/health", (req, res) => {
res.json({
ok: true,
service: "a2-viewer-api",
message: "This is Node.js API server"
});
});

app.get("/api/debug", (req, res) => {
res.json({
ok: true,
service: "a2-viewer-api",
postgrest_configured: hasPostgrestUrl(),
postgrest_url_preview: POSTGREST_URL
? POSTGREST_URL.replace(/^https?:///, "").slice(0, 60) + "..."
: null,
frontend_url: FRONTEND_URL || null,
allowed_origins: allowedOrigins,
tables: {
a2: TABLE_A2,
lenh_quyetdinh: TABLE_LENH_QUYETDINH
},
endpoints: {
a2: "/api/a2",
raw_a2: "/api/raw/a2",
lenh_quyetdinh: "/api/lenh-quyetdinh",
raw_lenh_quyetdinh: "/api/raw/lenh-quyetdinh"
}
});
});

// ==============================
// RAW API
// ==============================
app.get("/api/raw/a2", requirePostgrestUrl, async (req, res) => {
const result = await fetchFromPostgrest(TABLE_A2, 5);

res.json({
ok: result.ok,
status: result.status,
table: TABLE_A2,
called_url: result.url,
is_json: result.isJson,
raw_text: result.text,
data: result.data
});
});

app.get("/api/raw/lenh-quyetdinh", requirePostgrestUrl, async (req, res) => {
const result = await fetchFromPostgrest(TABLE_LENH_QUYETDINH, 5);

res.json({
ok: result.ok,
status: result.status,
table: TABLE_LENH_QUYETDINH,
called_url: result.url,
is_json: result.isJson,
raw_text: result.text,
data: result.data
});
});

// ==============================
// MAIN READ-ONLY API
// ==============================
app.get("/api/a2", requirePostgrestUrl, async (req, res) => {
await handleData(req, res, TABLE_A2, TABLE_A2);
});

app.get("/api/lenh-quyetdinh", requirePostgrestUrl, async (req, res) => {
await handleData(req, res, TABLE_LENH_QUYETDINH, TABLE_LENH_QUYETDINH);
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
"/api/a2",
"/api/raw/lenh-quyetdinh",
"/api/lenh-quyetdinh"
]
});
});

// ==============================
// START SERVER
// ==============================
app.listen(PORT, () => {
console.log(`A2 Viewer API running on port ${PORT}`);
});
