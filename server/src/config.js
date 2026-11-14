import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));

// Load env files: workspace .env (more specific) first, then repo-root .env.
dotenv.config({ path: path.resolve(here, "../.env"), quiet: true });
dotenv.config({ path: path.resolve(here, "../../.env"), quiet: true });

const isProd = process.env.NODE_ENV === "production";

// DB_MODE=local forces the local SQLite file (DB_PATH) even when the Turso
// vars are set — the safe way to run tests against a throwaway DB.
// (Overriding with empty-string TURSO_* vars does NOT work in Windows
// PowerShell 5.1: assigning '' to $env:VAR deletes it, so dotenv re-loads
// the live Turso config from .env.)
const forceLocalDb = /^(local|file)$/i.test(process.env.DB_MODE || "");

export const config = {
  isProd,
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  // --- Turso Cloud Database Properties (ignored when DB_MODE=local) ---
  tursoUrl: forceLocalDb ? "" : process.env.TURSO_DATABASE_URL || "",
  tursoAuthToken: forceLocalDb ? "" : process.env.TURSO_AUTH_TOKEN || "",

  dbPath: process.env.DB_PATH || path.resolve(here, "../data/app.db"),
  cookieName: "ue_session",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  distDir: path.resolve(here, "../../client/dist"),
};

// Placeholder values that must never be used in production.
const INSECURE_SECRETS = new Set([
  "dev-only-secret-change-me",
  "change-me-to-a-long-random-string",
]);

if (isProd && INSECURE_SECRETS.has(config.jwtSecret)) {
  console.warn(
    "[config] WARNING: JWT_SECRET is a known insecure placeholder — set a real secret before deploying.",
  );
}
