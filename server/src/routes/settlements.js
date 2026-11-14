import { Router } from "express";
import { getDb } from "../db.js";
import { requireApproved, requireAuth } from "../middleware/auth.js";
import { isAdminRole, participantIds } from "../lib/users.js";
import { toPaisa } from "../lib/money.js";
import { nowLocalNaive, toLocalNaive } from "../lib/datetime.js";

const router = Router();
router.use(requireAuth, requireApproved);

/**
 * Only the System Admin is excluded from the ledger — regular admins record
 * payments like members do.
 */
function blockAdmin(req, res, next) {
  if (req.user.role === "system_admin") {
    return res.status(403).json({
      error:
        "The System Admin account is for approvals and oversight only — it never moves money.",
      code: "ADMIN_READ_ONLY",
    });
  }
  return next();
}

const prettifyMethod = (value) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : "Cash";

export async function serializeSettlement(db, id) {
  const rowRes = await db.execute({
    sql: `SELECT s.*, f.name AS from_name, t.name AS to_name, r.name AS recorded_by_name,
                 pm.label AS method_label
            FROM settlements s
            JOIN users f ON f.id = s.from_user
            JOIN users t ON t.id = s.to_user
            JOIN users r ON r.id = s.recorded_by
            LEFT JOIN payment_methods pm ON pm.value = s.payment_method
           WHERE s.id = ?`,
    args: [Number(id)],
  });
  const row = rowRes.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    from: { id: row.from_user, name: row.from_name },
    to: { id: row.to_user, name: row.to_name },
    amountPaisa: row.amount_paisa,
    paymentMethod: row.payment_method ?? "cash",
    paymentMethodLabel: row.method_label || prettifyMethod(row.payment_method),
    status: row.acknowledged_at ? "acknowledged" : "pending",
    acknowledgedAt: row.acknowledged_at ?? null,
    settledAt: row.settled_at,
    recordedBy: row.recorded_by,
    recordedByName: row.recorded_by_name,
    createdAt: row.created_at,
  };
}

export async function listSettlements(db, limit = 50) {
  const rowsRes = await db.execute({
    sql: `SELECT id FROM settlements ORDER BY settled_at DESC, id DESC LIMIT ?`,
    args: [limit],
  });

  const settlements = [];
  for (const r of rowsRes.rows) {
    const serialized = await serializeSettlement(db, r.id);
    if (serialized) settlements.push(serialized);
  }
  return settlements;
}

/**
 * POST /api/settlements
 * Records a payment from the current colleague to another one
 * ("Pay due / clear balance"). Regular admins may do this too — only the
 * System Admin is excluded.
 */
router.post("/", blockAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const body = req.body ?? {};

    const active = await participantIds();
    const toUser = Number(body.toUser);
    const fromUser = req.user.id;

    if (!active.includes(fromUser)) {
      return res
        .status(400)
        .json({ error: "Select an active colleague who is paying." });
    }
    if (!active.includes(toUser)) {
      return res
        .status(400)
        .json({ error: "Select an active colleague to receive the payment." });
    }
    if (fromUser === toUser) {
      return res
        .status(400)
        .json({ error: "Payer and receiver must be different people." });
    }

    const amountPaisa = toPaisa(body.amountPaisa);
    if (!amountPaisa) {
      return res
        .status(400)
        .json({ error: "Enter a valid amount greater than 0." });
    }
    if (amountPaisa > 100_000_00) {
      return res
        .status(400)
        .json({
          error: "That amount looks too large — please double check it.",
        });
    }

    const paymentMethod = String(body.paymentMethod ?? "cash").toLowerCase();
    const methodRes = await db.execute({
      sql: `SELECT value FROM payment_methods WHERE value = ? AND active = 1`,
      args: [paymentMethod],
    });
    const methodRow = methodRes.rows[0];

    if (!methodRow) {
      const availableRes = await db.execute(
        `SELECT label FROM payment_methods WHERE active = 1 ORDER BY id`,
      );
      const available = availableRes.rows.map((m) => m.label).join(", ");
      return res.status(400).json({
        error: `Choose a payment method${available ? `: ${available}` : " from the list."}`,
      });
    }

    const settledAt = toLocalNaive(body.settledAt) || nowLocalNaive();

    const insertRes = await db.execute({
      sql: `INSERT INTO settlements (from_user, to_user, amount_paisa, payment_method, settled_at, recorded_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        fromUser,
        toUser,
        amountPaisa,
        paymentMethod,
        settledAt,
        req.user.id,
        new Date().toISOString(),
      ],
    });

    const settlement = await serializeSettlement(
      db,
      Number(insertRes.lastInsertRowid),
    );
    return res.status(201).json({ settlement });
  } catch (err) {
    console.error("[settlements] Create settlement error:", err);
    return res.status(500).json({ error: "Server error recording payment." });
  }
});

/** GET /api/settlements — settlement history, newest first. */
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const settlements = await listSettlements(db, limit);
    return res.json({ settlements });
  } catch (err) {
    console.error("[settlements] List settlements error:", err);
    return res
      .status(500)
      .json({ error: "Server error fetching payment history." });
  }
});

/**
 * POST /api/settlements/:id/acknowledge
 * The pay-to user confirms they received the money. Only that person may ack.
 */
router.post("/:id/acknowledge", async (req, res) => {
  try {
    const db = await getDb();
    const rowRes = await db.execute({
      sql: `SELECT id, to_user, acknowledged_at FROM settlements WHERE id = ?`,
      args: [Number(req.params.id)],
    });
    const row = rowRes.rows[0];
    if (!row) return res.status(404).json({ error: "Payment not found." });

    if (row.to_user !== req.user.id) {
      return res.status(403).json({
        error: "Only the person who received this payment can acknowledge it.",
        code: "NOT_RECIPIENT",
      });
    }
    if (row.acknowledged_at) {
      return res.status(409).json({
        error: "This payment has already been acknowledged.",
        code: "ALREADY_ACKNOWLEDGED",
      });
    }

    await db.execute({
      sql: `UPDATE settlements SET acknowledged_at = ? WHERE id = ?`,
      args: [nowLocalNaive(), row.id],
    });

    const updatedSettlement = await serializeSettlement(db, row.id);
    return res.json({ settlement: updatedSettlement });
  } catch (err) {
    console.error("[settlements] Acknowledge error:", err);
    return res
      .status(500)
      .json({ error: "Server error acknowledging payment." });
  }
});

/** DELETE /api/settlements/:id — undo (recorder or admin only). */
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const rowRes = await db.execute({
      sql: `SELECT id, recorded_by, from_user FROM settlements WHERE id = ?`,
      args: [Number(req.params.id)],
    });
    const row = rowRes.rows[0];
    if (!row) return res.status(404).json({ error: "Settlement not found." });

    if (row.recorded_by !== req.user.id && !isAdminRole(req.user.role)) {
      return res
        .status(403)
        .json({
          error:
            "Only the person who recorded this payment (or an admin) can delete it.",
        });
    }

    await db.execute({
      sql: `DELETE FROM settlements WHERE id = ?`,
      args: [row.id],
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[settlements] Delete settlement error:", err);
    return res.status(500).json({ error: "Server error deleting payment." });
  }
});

export default router;
