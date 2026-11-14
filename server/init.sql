-- =============================================================================
-- init.sql — baseline data for a fresh database
--
-- Contains: full schema, the fixed accounts, and the admin-managed metadata
-- (payment methods + routes) exactly as they exist in the live database.
--
-- Usage (fresh file):
--   1. sqlite3 data/app.db < init.sql      (or run through any SQLite client)
--   2. start the server  →  it detects the tables and skips its own seeding
--
-- Safe to re-run: every INSERT is OR IGNORE keyed on its unique column
-- (email / value / name), so existing rows are never touched or duplicated.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------- schema ---

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('system_admin','admin','member')),
  status        TEXT    NOT NULL DEFAULT 'pending'  CHECK (status IN ('pending','approved','rejected')),
  created_at    TEXT    NOT NULL,
  approved_at   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS rides (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  paid_by      INTEGER NOT NULL REFERENCES users(id),
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  description  TEXT    NOT NULL,
  route        TEXT,
  ride_at      TEXT    NOT NULL,
  split_method TEXT    NOT NULL DEFAULT 'equal' CHECK (split_method IN ('equal','custom')),
  created_by   INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rides_ride_at ON rides(ride_at);

CREATE TABLE IF NOT EXISTS ride_shares (
  ride_id     INTEGER NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_paisa INTEGER NOT NULL CHECK (share_paisa >= 0),
  PRIMARY KEY (ride_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_shares_user ON ride_shares(user_id);

-- Who paid the bill: one row per payer, amounts summing to rides.amount_paisa.
CREATE TABLE IF NOT EXISTS ride_payers (
  ride_id      INTEGER NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  PRIMARY KEY (ride_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_payers_user ON ride_payers(user_id);

CREATE TABLE IF NOT EXISTS settlements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user       INTEGER NOT NULL REFERENCES users(id),
  to_user         INTEGER NOT NULL REFERENCES users(id),
  amount_paisa    INTEGER NOT NULL CHECK (amount_paisa > 0),
  payment_method  TEXT    NOT NULL DEFAULT 'cash',
  settled_at      TEXT    NOT NULL,
  recorded_by     INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT    NOT NULL,
  acknowledged_at TEXT,
  CHECK (from_user <> to_user)
);
CREATE INDEX IF NOT EXISTS idx_settlements_at ON settlements(settled_at);

CREATE TABLE IF NOT EXISTS payment_methods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  value      TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  label      TEXT    NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL
);

-- ----------------------------------------------------------------- users ---

-- Passwords are bcrypt (cost 10), the same scheme the app uses.
-- System Admin : Admin@123   (built-in, undeletable, only account that can reset passwords)
-- Members      : password
INSERT OR IGNORE INTO users (name, email, password_hash, role, status, created_at, approved_at) VALUES
  ('System Admin', 'admin@uberexpenses.local',
   '$2b$10$nigc5a3MWzPcpPsBw78FT.ioUn35ISk04BEuOs2hFd.LLZEy/3h4u',
   'system_admin', 'approved', '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'),
  ('Zakaria Imtiaz', 'imtiaz@friendship.ngo',
   '$2b$10$S/3d19/xVPgud2Q0nGk8mOV5h5/e7Qrp0TkNssz6zOia6RntCDkL2',
   'member', 'approved', '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'),
  ('Rafed Khan', 'rafedrasul@friendship.ngo',
   '$2b$10$S/3d19/xVPgud2Q0nGk8mOV5h5/e7Qrp0TkNssz6zOia6RntCDkL2',
   'member', 'approved', '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'),
  ('Masud Rana', 'mrana@friendship.ngo',
   '$2b$10$S/3d19/xVPgud2Q0nGk8mOV5h5/e7Qrp0TkNssz6zOia6RntCDkL2',
   'member', 'approved', '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'),
  ('Asker Wahid', 'asker@friendship.ngo',
   '$2b$10$S/3d19/xVPgud2Q0nGk8mOV5h5/e7Qrp0TkNssz6zOia6RntCDkL2',
   'member', 'approved', '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z');

-- -------------------------------------------------------------- metadata ---

-- Payment methods offered on the Pay-due form.
INSERT OR IGNORE INTO payment_methods (value, label, active, created_at) VALUES
  ('cash',  'Cash',  1, '2026-11-12T15:36:46.248Z'),
  ('bkash', 'Bkash', 1, '2026-11-12T15:37:13.893Z'),
  ('nagad', 'Nagad', 1, '2026-11-12T15:37:22.997Z'),
  ('bank',  'Bank',  1, '2026-11-12T15:37:28.280Z');

-- Route suggestions on the ride form.
INSERT OR IGNORE INTO routes (name, active, created_at) VALUES
  ('Home to Office', 1, '2026-11-12T15:34:27.803Z'),
  ('Office to Home', 1, '2026-11-12T15:34:35.636Z');
