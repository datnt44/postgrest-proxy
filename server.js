const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();

const PORT = process.env.PORT || 3000;

const POSTGREST_URL = (process.env.POSTGREST_URL || "").replace(/\/+$/, "");
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "";

// Tên endpoint bên ngoài
const ENDPOINTS = {
  a2: {
    publicPath: "/api/a2",
    postgrestPath: "a2",
    limit: 5000
  },
  lenhQuyetDinh: {
    publicPath: "/api/lenh-quyetdinh",
    postgrestPath: "lenh_quyetdinh",
    limit: 5000
  }
};

// Bảo mật header cơ bản
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

// Chỉ cho phép JSON nhỏ
app.use(express.json({ limit: "100kb" }));

// Serve HTML trong thư mục public
app.use(express.static(path.join(__dirname, "public")));

// CORS whitelist
const corsOptions = {
  origin: function (origin, callback) {
    // Cho phép request cùng domain hoặc từ browser không có origin
    if (!origin) {
      return callback(null, true);
    }

    // Nếu không cấu hình ALLOW_ORIGIN thì chỉ cho cùng domain
    if (!ALLOW_ORIGIN) {
      return callback(null, false);
    }

    const allowedOrigins = ALLOW_ORIGIN.split(",").map(x => x.trim());

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET"],
  allowedHeaders: ["Content-Type"],
  maxAge: 86400
};

app.use(cors(corsOptions));

// Giới hạn số request để tránh spam API
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

// Chặn method không cần thiết trên /api
app.use("/api", (req, res, next) => {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  next();
});

// Không hiển thị biến môi trường nhạy cảm
function checkConfig(req, res, next) {
  if (!POSTGREST_URL) {
    return res.status(500).json({
      ok: false,
      error: "Server configuration error"
    });
  }

  next();
}

// Hàm gọi PostgREST nội bộ
async function fetchFromPostgrest(postgrestPath, limit) {
  const url = new URL(`${POSTGREST_URL}/${postgrestPath}`);
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

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    text
  };
}

// Hàm trả dữ liệu ra frontend
async function handleReadOnlyRequest(req, res, config) {
  try {
    const result = await fetchFromPostgrest(
      config.postgrestPath,
      config.limit
    );

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        error: "Unable to fetch data"
      });
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    return res.json({
      ok: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}

// API lấy bảng A2
app.get(ENDPOINTS.a2.publicPath, checkConfig, async (req, res) => {
  await handleReadOnlyRequest(req, res, ENDPOINTS.a2);
});

// API lấy bảng lệnh quyết định
app.get(ENDPOINTS.lenhQuyetDinh.publicPath, checkConfig, async (req, res) => {
  await handleReadOnlyRequest(req, res, ENDPOINTS.lenhQuyetDinh);
});

// Health check, không lộ URL PostgREST
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "nodejs-readonly-api"
  });
});

// Nếu route không tồn tại
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found"
  });
});

// Error handler chung, không trả stack trace
app.use((err, req, res, next) => {
  res.status(500).json({
    ok: false,
    error: "Internal server error"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
