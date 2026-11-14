import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { config } from "./config.js";

let db = null;

export async function getDb() {
  if (db) return db;

  const dbUrl = config.tursoUrl ? config.tursoUrl : `file:${config.dbPath}`;

  if (!config.tursoUrl && config.dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  }

  db = createClient({
    url: dbUrl,
    authToken: config.tursoAuthToken || undefined,
  });

  // createClient() is lazy — probe the connection now so a bad URL or an
  // expired auth token fails at startup, not on the first API request.
  await db.execute("SELECT 1");

  if (config.tursoUrl) {
    console.log(
      `🚀 [api] Connected to Turso Cloud Database: ${config.tursoUrl}`,
    );
  } else {
    console.log(
      `📁 [api] Connected to Local SQLite Database: ${config.dbPath}`,
    );
  }

  return db;
}
