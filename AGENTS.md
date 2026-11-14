# Agent Instructions

Follow these rules when working on this project. They apply to every task, without exception.

## 1. Tests must run against the test database — never the live one

- The live database is **Turso Cloud** (`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` in `.env`). It holds real data and must not be touched by tests. (The local `server/data/app.db` file is only used when those vars are unset.)
- While `TURSO_DATABASE_URL` is set, **`DB_PATH` is ignored** — the server always talks to Turso. To isolate tests, set **`DB_MODE=local`**, which forces the local file even when the Turso vars are present. Never rely on empty-string `TURSO_*` overrides: Windows PowerShell 5.1 deletes `$env:VAR` when you assign `''`, so dotenv silently re-loads the live config from `.env`.
  - Bash / Git Bash:
    ```
    DB_MODE=local DB_PATH=data/test.db npm run db:init
    DB_MODE=local DB_PATH=data/test.db PORT=4100 npm run server
    BASE_URL=http://localhost:4100 npm run test:api
    ```
  - PowerShell:
    ```powershell
    $env:DB_MODE='local'; $env:DB_PATH='data/test.db'
    npm run db:init                       # once per fresh test DB
    $env:PORT=4100; npm run server        # terminal 1
    $env:BASE_URL='http://localhost:4100'; npm run test:api   # terminal 2
    ```
- Never run the smoke suite or any test script against port 4000, `app.db`, or Turso.
- If a test does run against the live database by mistake, clean up its data immediately (see section 2).

## 2. MANDATORY: Always remove test data when finished

After any test, manual verification, or debug session, delete every record and file you created. This is not optional.

**Database**
- Remove any test users, rides, ride shares, and settlements you created.
- After cleanup, verify the live database contains only real accounts and real records — no leftovers.

**Files**
- Delete any temporary scripts you created (`check-*.mjs`, `test-*.mjs`, debug helpers, one-off queries).
- Logs and scratch files belong in `C:\Users\Imtiaz\AppData\Local\Temp\opencode\`, not in the project folder.

**Before finishing**
- Re-check the live database: only real users and real records remain, with no test rides or settlements.
- Re-check the repo: no stray scripts, logs, or scratch files.

## 3. The app never inserts data on startup

- `server/src/db.js` creates the schema only — no accounts, no payment methods, no routes.
- All baseline data lives in `server/init.sql` and is applied only by `npm run db:init` (idempotent). It targets **Turso** when `TURSO_DATABASE_URL` is set, otherwise the local `DB_PATH` file.
- Never re-add startup seeding, bootstrap accounts, or demo-data scripts.
- The demo loader (`seedDemo.js`) and the `seed` script were removed deliberately — do not restore them.

## 4. Project conventions

- Money is stored as integer **paisa** (`amount_paisa`). Never use floating-point numbers for money.
- The System Admin account (`admin@uberexpenses.local`) must never appear as a participant, payer, payee, or balance row.
- Rebuild the client (`npm run build`) after any change under `client/src`.
- Restart the server after any change under `server/src`.
- Re-run the smoke suite (against the test DB) after server changes to confirm nothing broke.

## 5. Reporting

- When you claim something works, say how it was verified (which checks ran, against which database).
- If you cannot verify something, say so explicitly instead of assuming.
