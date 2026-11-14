/**
 * Apply init.sql (baseline accounts + metadata) to the configured database.
 *
 * Targets whatever the server targets:
 *   - Turso Cloud when TURSO_DATABASE_URL is set (the normal case)
 *   - a local SQLite file (DB_PATH, default server/data/app.db) otherwise
 *
 *   npm run db:init                                  # live target (Turso or app.db)
 *   DB_MODE=local DB_PATH=./data/test.db npm run db:init
 *
 * The second form forces a throwaway local DB for tests: DB_MODE=local
 * ignores the Turso vars even though they are set in .env (do NOT try to
 * override them with empty strings — PowerShell 5.1 deletes $env:VAR on ''.)
 *
 * This is the ONLY way data is loaded: the server itself never inserts
 * anything at startup. The script is idempotent — init.sql uses
 * INSERT OR IGNORE, so re-running never duplicates or overwrites rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { config } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(here, '../init.sql');

if (!fs.existsSync(sqlPath)) {
  console.error(`[init] Not found: ${sqlPath}`);
  process.exit(1);
}

const dbUrl = config.tursoUrl ? config.tursoUrl : `file:${config.dbPath}`;
const target = config.tursoUrl ? `Turso (${config.tursoUrl})` : config.dbPath;

if (!config.tursoUrl && config.dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
}

const db = createClient({
  url: dbUrl,
  authToken: config.tursoAuthToken || undefined,
});

try {
  await db.executeMultiple(fs.readFileSync(sqlPath, 'utf8'));
} catch (err) {
  console.error(`[init] Failed to apply ${path.basename(sqlPath)} → ${target}`);
  console.error(`[init] ${err.message}`);
  process.exit(1);
}

const count = async (table) => {
  const r = await db.execute(`SELECT COUNT(*) AS c FROM ${table}`);
  return Number(r.rows[0].c);
};

console.log(`[init] Applied ${path.basename(sqlPath)} → ${target}`);
console.log(
  `[init] users=${await count('users')} payment_methods=${await count('payment_methods')} routes=${await count('routes')}`,
);
