var express = require("express");
var helmet = require("helmet");
var cors = require("cors");
var rateLimit = require("express-rate-limit");

var app = express();

var PORT = process.env.PORT || 3000;

var POSTGREST_URL = String(process.env.POSTGREST_URL || "").replace(/\/+$/, "");
var TABLE_A2 = process.env.TABLE_A2 || "_A2";
var TABLE_LENH_QUYETDINH = process.env.TABLE_LENH_QUYETDINH || "lenh_quyetdinh";
var FRONTEND_URL = process.env.FRONTEND_URL || "";

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "100kb" }));

var allowedOrigins = FRONTEND_URL
  .split(",")
  .map(function (item) {
    return item.trim();
  })
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.length === 0) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS: " + origin));
    },
    methods: ["GET", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  })
);

var apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many requests. Please try again later."
  }
});

app.use("/api", apiLimiter);

function hasPostgrestUrl() {
  return Boolean(POSTGREST_URL);
}

function requirePostgrestUrl(req, res, next) {
  if (!hasPostgrestUrl()) {
    return res.status(500).json({
      ok: false,
      error: "Missing POSTGREST_URL",
      hint: "POSTGREST_URL phải là URL https của service PostgREST, không phải postgresql://"
    });
  }

  if (
    POSTGREST_URL.indexOf("http://") !== 0 &&
    POSTGREST_URL.indexOf("https://") !== 0
  ) {
    return res.status(500).json({
      ok: false,
      error: "Invalid POSTGREST_URL",
      hint: "POSTGREST_URL phải bắt đầu bằng http:// hoặc https://"
    });
  }

  next();
}

async function fetchFromPostgrest(tableName, limit, offset) {
  var safeTable = encodeURIComponent(tableName);

  var url =
    POSTGREST_URL +
    "/" +
    safeTable +
    "?select=*&limit=" +
    limit +
    "&offset=" +
    offset;

  try {
    var response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    var text = await response.text();

    var data = null;
    var isJson = true;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      isJson = false;
    }

    return {
      ok: response.ok,
      status: response.status,
      url: url,
      text: text,
      data: data,
      isJson: isJson
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      url: url,
      text: error.message,
      data: null,
      isJson: false
    };
  }
}

async function handleData(req, res, tableName, tableDisplayName) {
  var limitRaw = req.query.limit || "5000";
  var offsetRaw = req.query.offset || "0";

  var parsedLimit = parseInt(limitRaw, 10) || 5000;
  var parsedOffset = parseInt(offsetRaw, 10) || 0;

  var limit = Math.min(Math.max(parsedLimit, 1), 10000);
  var offset = Math.max(parsedOffset, 0);

  var result = await fetchFromPostgrest(tableName, limit, offset);

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

  var rows = Array.isArray(result.data) ? result.data : [];

  return res.json({
    ok: true,
    table: tableDisplayName,
    limit: limit,
    offset: offset,
    count: rows.length,
    data: rows
  });
}

app.get("/", function (req, res) {
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

app.get("/health", function (req, res) {
  res.json({
    ok: true,
    service: "a2-viewer-api",
    message: "This is Node.js API server"
  });
});

app.get("/api/debug", function (req, res) {
  res.json({
    ok: true,
    service: "a2-viewer-api",
    postgrest_configured: hasPostgrestUrl(),
    postgrest_url_preview: POSTGREST_URL
      ? POSTGREST_URL.replace(/^https?:\/\//, "").slice(0, 60) + "..."
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

app.get("/api/raw/a2", requirePostgrestUrl, async function (req, res) {
  var result = await fetchFromPostgrest(TABLE_A2, 5, 0);

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

app.get("/api/raw/lenh-quyetdinh", requirePostgrestUrl, async function (req, res) {
  var result = await fetchFromPostgrest(TABLE_LENH_QUYETDINH, 5, 0);

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

app.get("/api/a2", requirePostgrestUrl, async function (req, res) {
  await handleData(req, res, TABLE_A2, TABLE_A2);
});

app.get("/api/lenh-quyetdinh", requirePostgrestUrl, async function (req, res) {
  await handleData(req, res, TABLE_LENH_QUYETDINH, TABLE_LENH_QUYETDINH);
});

app.post("/api/*", function (req, res) {
  res.status(405).json({
    ok: false,
    error: "Read only API. POST is not allowed."
  });
});

app.put("/api/*", function (req, res) {
  res.status(405).json({
    ok: false,
    error: "Read only API. PUT is not allowed."
  });
});

app.patch("/api/*", function (req, res) {
  res.status(405).json({
    ok: false,
    error: "Read only API. PATCH is not allowed."
  });
});

app.delete("/api/*", function (req, res) {
  res.status(405).json({
    ok: false,
    error: "Read only API. DELETE is not allowed."
  });
});

app.use(function (req, res) {
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

app.listen(PORT, function () {
  console.log("A2 Viewer API running on port " + PORT);
});
