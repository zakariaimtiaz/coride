import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { getDb } from "./db.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import metaRoutes from "./routes/meta.js";
import rideRoutes from "./routes/rides.js";
import settlementRoutes from "./routes/settlements.js";
import userRoutes from "./routes/users.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(cors({ origin: config.clientOrigin, credentials: true }));

// --- API -------------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "uber-expenses-api",
    time: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/settlements", settlementRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

// --- Static client (production: Express serves the built React app) ---------
if (fs.existsSync(config.distDir)) {
  app.use(express.static(config.distDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(config.distDir, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res
      .type("text")
      .send(
        "CoRide API is running.\n\n" +
          'Frontend not built yet — run "npm run dev" for development,\n' +
          'or "npm run build" and restart for production.',
      );
  });
}

// --- Error handler ----------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[api] Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

// --- Start Server only after Database is connected --------------------------
async function startServer() {
  try {
    await getDb(); // Ensure Turso/SQLite connection is established first
    app.listen(config.port, () => {
      console.log(`[api] Listening on http://localhost:${config.port}`);
      console.log(
        `[api] Database Target: ${config.tursoUrl ? "Turso Cloud" : config.dbPath}`,
      );
    });
  } catch (err) {
    console.error("[api] Failed to connect to database:", err);
    process.exit(1);
  }
}

startServer();
