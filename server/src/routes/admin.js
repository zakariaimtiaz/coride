import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb } from "../db.js";
import {
  requireAdmin,
  requireApproved,
  requireAuth,
  requireSystemAdmin,
} from "../middleware/auth.js";
import { findUserById, publicUser } from "../lib/users.js";

const router = Router();
router.use(requireAuth, requireApproved, requireAdmin);

/** The built-in account is fixed: nobody may reject, demote or delete it. */
function blockSystemAdmin(res, target) {
  if (target.role === "system_admin") {
    res.status(403).json({
      error:
        "The System Admin account is built in — it cannot be rejected, demoted or deleted.",
      code: "SYSTEM_ADMIN_PROTECTED",
    });
    return true;
  }
  return false;
}

const COUNTS_SQL = `
  SELECT
    SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
    COUNT(*) AS total
  FROM users`;

/** GET /api/admin/users?status=pending|approved|rejected|all */
router.get("/users", async (req, res) => {
  try {
    const db = await getDb();
    const rowsRes = await db.execute(
      `SELECT id, name, email, role, status, created_at, approved_at
         FROM users
        ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                 created_at DESC`,
    );

    const countsRes = await db.execute(COUNTS_SQL);
    const counts = countsRes.rows[0] || {};
    const status = String(req.query.status ?? "all");
    const users =
      status === "all"
        ? rowsRes.rows
        : rowsRes.rows.filter((r) => r.status === status);

    return res.json({
      counts: {
        pending: counts.pending ?? 0,
        approved: counts.approved ?? 0,
        rejected: counts.rejected ?? 0,
        total: counts.total ?? 0,
      },
      users: users.map(publicUser),
    });
  } catch (err) {
    console.error("[admin] Get users error:", err);
    return res.status(500).json({ error: "Server error fetching users." });
  }
});

/** POST /api/admin/users/:id/approve — unlocks the dashboard for a pending signup. */
router.post("/users/:id/approve", async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    if (user.status === "approved") {
      return res.json({ user: publicUser(user), message: "Already approved." });
    }

    const db = await getDb();
    await db.execute({
      sql: `UPDATE users SET status = 'approved', approved_at = ? WHERE id = ?`,
      args: [new Date().toISOString(), user.id],
    });

    const updatedUser = await findUserById(user.id);
    return res.json({
      user: publicUser(updatedUser),
      message: `${user.name} can now access the dashboard.`,
    });
  } catch (err) {
    console.error("[admin] Approve user error:", err);
    return res.status(500).json({ error: "Server error approving user." });
  }
});

/** POST /api/admin/users/:id/reject — blocks a signup (it can be re-applied later). */
router.post("/users/:id/reject", async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    if (blockSystemAdmin(res, user)) return;
    if (user.id === req.user.id) {
      return res
        .status(400)
        .json({ error: "You cannot reject your own account." });
    }
    if (user.status === "rejected") {
      return res.json({ user: publicUser(user), message: "Already rejected." });
    }

    const db = await getDb();
    await db.execute({
      sql: `UPDATE users SET status = 'rejected', approved_at = NULL WHERE id = ?`,
      args: [user.id],
    });

    const updatedUser = await findUserById(user.id);
    return res.json({
      user: publicUser(updatedUser),
      message: `${user.name} has been rejected.`,
    });
  } catch (err) {
    console.error("[admin] Reject user error:", err);
    return res.status(500).json({ error: "Server error rejecting user." });
  }
});

/** POST /api/admin/users/:id/role — grant or revoke admin rights.
 *  Granting `admin` is System Admin only; regular admins may still demote. */
router.post("/users/:id/role", async (req, res) => {
  try {
    const role = req.body?.role;
    if (role !== "admin" && role !== "member") {
      return res.status(400).json({ error: "Choose role: admin or member." });
    }

    // Only the built-in System Admin may create other admins.
    if (role === "admin" && req.user.role !== "system_admin") {
      return res.status(403).json({
        error: "Only the System Admin can grant admin rights.",
        code: "SYSTEM_ADMIN_REQUIRED",
      });
    }

    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    if (blockSystemAdmin(res, user)) return;
    if (user.id === req.user.id && role === "member") {
      return res
        .status(400)
        .json({ error: "You cannot demote your own account." });
    }

    const db = await getDb();
    if (role === "member" && user.role === "admin") {
      const adminsRes = await db.execute(
        `SELECT COUNT(*) AS c FROM users
          WHERE role IN ('admin','system_admin') AND status = 'approved'`,
      );
      const admins = adminsRes.rows[0]?.c ?? 0;
      if (admins <= 1) {
        return res
          .status(400)
          .json({ error: "At least one admin must remain." });
      }
    }

    await db.execute({
      sql: `UPDATE users SET role = ? WHERE id = ?`,
      args: [role, user.id],
    });

    const updatedUser = await findUserById(user.id);
    return res.json({ user: publicUser(updatedUser) });
  } catch (err) {
    console.error("[admin] Role change error:", err);
    return res.status(500).json({ error: "Server error updating user role." });
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Forgotten passwords: System Admin only (regular admins get 403). Sets a new
 * password and returns it once so it can be shared with the user.
 */
router.post(
  "/users/:id/reset-password",
  requireSystemAdmin,
  async (req, res) => {
    try {
      const user = await findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found." });
      if (user.id === req.user.id) {
        return res
          .status(400)
          .json({ error: "Use Change password to update your own password." });
      }

      const provided = String(req.body?.password ?? "");
      const temporaryPassword =
        provided.length >= 6
          ? provided
          : `reset-${randomBytes(4).toString("hex")}`;

      const db = await getDb();
      await db.execute({
        sql: `UPDATE users SET password_hash = ? WHERE id = ?`,
        args: [bcrypt.hashSync(temporaryPassword, 10), user.id],
      });

      const updatedUser = await findUserById(user.id);
      return res.json({
        user: publicUser(updatedUser),
        temporaryPassword,
        message: `Password reset for ${user.name}.`,
      });
    } catch (err) {
      console.error("[admin] Reset password error:", err);
      return res
        .status(500)
        .json({ error: "Server error resetting password." });
    }
  },
);

/**
 * DELETE /api/admin/users/:id
 * Removes an account that has no ledger history. Accounts with rides or
 * payments are refused (409) so the ledger can never be corrupted.
 */
router.delete("/users/:id", async (req, res) => {
  try {
    const db = await getDb();
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    if (blockSystemAdmin(res, user)) return;
    if (user.id === req.user.id) {
      return res
        .status(400)
        .json({ error: "You cannot delete your own account." });
    }

    const ridesRes = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM rides r
             WHERE r.paid_by = ? OR r.created_by = ?
                OR EXISTS (SELECT 1 FROM ride_payers p WHERE p.ride_id = r.id AND p.user_id = ?)
                OR EXISTS (SELECT 1 FROM ride_shares s WHERE s.ride_id = r.id AND s.user_id = ?)`,
      args: [user.id, user.id, user.id, user.id],
    });
    const rides = ridesRes.rows[0]?.c ?? 0;

    const paymentsRes = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM settlements
             WHERE from_user = ? OR to_user = ? OR recorded_by = ?`,
      args: [user.id, user.id, user.id],
    });
    const payments = paymentsRes.rows[0]?.c ?? 0;

    if (rides > 0 || payments > 0) {
      return res.status(409).json({
        error: `${user.name} has ${rides} ride${rides === 1 ? "" : "s"} and ${payments} payment${
          payments === 1 ? "" : "s"
        } on record — deleting would break the ledger. Reject the account instead.`,
        code: "USER_HAS_DATA",
      });
    }

    await db.execute({
      sql: `DELETE FROM ride_shares WHERE user_id = ?`,
      args: [user.id],
    });
    await db.execute({
      sql: `DELETE FROM ride_payers WHERE user_id = ?`,
      args: [user.id],
    });
    await db.execute({
      sql: `DELETE FROM users WHERE id = ?`,
      args: [user.id],
    });

    return res.json({ ok: true, message: `${user.name} has been deleted.` });
  } catch (err) {
    console.error("[admin] Delete user error:", err);
    return res.status(500).json({ error: "Server error deleting user." });
  }
});

/** GET /api/admin/stats — small overview for the admin header. */
router.get("/stats", async (req, res) => {
  try {
    const db = await getDb();
    const usersRes = await db.execute(COUNTS_SQL);
    const users = usersRes.rows[0] || {};
    const ridesRes = await db.execute(
      `SELECT COUNT(*) AS c, COALESCE(SUM(amount_paisa), 0) AS total FROM rides`,
    );
    const rides = ridesRes.rows[0] || {};

    return res.json({
      users: {
        pending: users.pending ?? 0,
        approved: users.approved ?? 0,
        rejected: users.rejected ?? 0,
        total: users.total ?? 0,
      },
      rides: { count: rides.c ?? 0, totalPaisa: rides.total ?? 0 },
    });
  } catch (err) {
    console.error("[admin] Stats error:", err);
    return res.status(500).json({ error: "Server error fetching stats." });
  }
});

export default router;
