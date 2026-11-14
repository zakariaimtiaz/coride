import { Router } from "express";
import bcrypt from "bcryptjs";
import { getDb } from "../db.js";
import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
  signToken,
} from "../middleware/auth.js";
import { findUserByEmail, publicUser } from "../lib/users.js";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/register
 * Creates a user in the "pending" state — they cannot see the dashboard until
 * an admin approves them. A session cookie is issued so the pending screen can
 * poll for approval.
 */
router.post("/register", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? "");

    if (name.length < 2 || name.length > 60) {
      return res
        .status(400)
        .json({ error: "Name must be between 2 and 60 characters." });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters." });
    }

    const db = await getDb();
    const existing = await findUserByEmail(email);

    if (existing && existing.status === "approved") {
      return res
        .status(409)
        .json({
          error: "An account with this email already exists — please log in.",
          code: "EXISTS",
        });
    }
    if (existing && existing.status === "pending") {
      return res
        .status(409)
        .json({
          error: "This email is already awaiting admin approval.",
          code: "PENDING",
        });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const now = new Date().toISOString();

    if (existing) {
      // Previously rejected → allow re-application with fresh details.
      await db.execute({
        sql: `UPDATE users SET name = ?, password_hash = ?, status = 'pending', approved_at = NULL, created_at = ? WHERE id = ?`,
        args: [name, passwordHash, now, existing.id],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO users (name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, 'member', 'pending', ?)`,
        args: [name, email, passwordHash, now],
      });
    }

    const user = publicUser(await findUserByEmail(email));
    setSessionCookie(res, signToken(user));

    return res.status(201).json({
      user,
      message:
        "Registration submitted! An admin must approve your account before the dashboard unlocks.",
    });
  } catch (err) {
    console.error("[auth] Register error:", err);
    return res.status(500).json({ error: "Server error during registration." });
  }
});

/**
 * POST /api/auth/login
 * Approved and pending users receive a session cookie. Rejected users are told
 * to register again (their old session is not issued).
 */
router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    const user = await findUserByEmail(email);
    const valid = user && bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res
        .status(401)
        .json({
          error: "Incorrect email or password.",
          code: "INVALID_CREDENTIALS",
        });
    }
    if (user.status === "rejected") {
      clearSessionCookie(res);
      return res.status(403).json({
        error:
          "Your registration was rejected by an admin. Please register again.",
        code: "REJECTED",
      });
    }

    const pub = publicUser(user);
    setSessionCookie(res, signToken(pub));
    return res.json({ user: pub });
  } catch (err) {
    console.error("[auth] Login error:", err);
    return res.status(500).json({ error: "Server error during login." });
  }
});

/** POST /api/auth/logout */
router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});

/** GET /api/auth/me — used by the router to restore the session on refresh. */
router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

/**
 * POST /api/auth/change-password
 * Any signed-in user updates their own password (current password required).
 * Forgotten passwords are handled separately by the System Admin.
 */
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "New password must be at least 6 characters." });
    }
    if (!currentPassword) {
      return res.status(400).json({ error: "Enter your current password." });
    }

    const db = await getDb();
    const userRes = await db.execute({
      sql: `SELECT * FROM users WHERE id = ?`,
      args: [req.user.id],
    });
    const row = userRes.rows[0];

    if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
      return res
        .status(401)
        .json({
          error: "Your current password is incorrect.",
          code: "WRONG_PASSWORD",
        });
    }
    if (bcrypt.compareSync(newPassword, row.password_hash)) {
      return res
        .status(400)
        .json({ error: "Choose a password different from your current one." });
    }

    await db.execute({
      sql: `UPDATE users SET password_hash = ? WHERE id = ?`,
      args: [bcrypt.hashSync(newPassword, 10), row.id],
    });

    return res.json({ ok: true, message: "Password updated." });
  } catch (err) {
    console.error("[auth] Change password error:", err);
    return res.status(500).json({ error: "Server error updating password." });
  }
});

export default router;
