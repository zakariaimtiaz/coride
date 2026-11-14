import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { publicUser } from "../lib/users.js";

export function signToken(user) {
  return jwt.sign({ sub: String(user.id) }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { path: "/" });
}

/** Any signed-in account (pending / approved / rejected) passes this gate. */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[config.cookieName];
  if (!token) {
    return res
      .status(401)
      .json({ error: "Not authenticated.", code: "UNAUTHENTICATED" });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    clearSessionCookie(res);
    return res
      .status(401)
      .json({
        error: "Your session expired. Please log in again.",
        code: "UNAUTHENTICATED",
      });
  }

  const db = await getDb();
  const resUser = await db.execute({
    sql: `SELECT * FROM users WHERE id = ?`,
    args: [Number(payload.sub)],
  });
  const row = resUser.rows[0];

  if (!row) {
    clearSessionCookie(res);
    return res
      .status(401)
      .json({ error: "Account no longer exists.", code: "UNAUTHENTICATED" });
  }

  req.user = publicUser(row);
  return next();
}

/** Only admin-approved members may touch the ledger. */
export function requireApproved(req, res, next) {
  if (req.user.status !== "approved") {
    return res
      .status(403)
      .json({
        error: "Your account is awaiting admin approval.",
        code: "APPROVAL_REQUIRED",
      });
  }
  return next();
}

/** Admin + System Admin (the built-in super user) may enter the admin panel. */
export function requireAdmin(req, res, next) {
  if (req.user.role !== "admin" && req.user.role !== "system_admin") {
    return res
      .status(403)
      .json({ error: "Admin access required.", code: "FORBIDDEN" });
  }
  return next();
}

/** Only the single built-in System Admin account passes this gate. */
export function requireSystemAdmin(req, res, next) {
  if (req.user.role !== "system_admin") {
    return res.status(403).json({
      error: "Only the System Admin can do that.",
      code: "SYSTEM_ADMIN_REQUIRED",
    });
  }
  return next();
}
