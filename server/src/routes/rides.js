import { Router } from "express";
import { getDb } from "../db.js";
import { requireApproved, requireAuth } from "../middleware/auth.js";
import { isAdminRole, participantIds } from "../lib/users.js";
import { formatBdt, toPaisa } from "../lib/money.js";
import { nowLocalNaive, toLocalNaive } from "../lib/datetime.js";

const router = Router();
router.use(requireAuth, requireApproved);

const MAX_AMOUNT_PAISA = 100_000_00; // 100,000 BDT — sanity guard against typos

/**
 * Only the System Admin is excluded from the ledger — regular admins log and
 * share rides like members do.
 */
function blockAdmin(req, res, next) {
  if (req.user.role === "system_admin") {
    return res.status(403).json({
      error:
        "The System Admin account is for approvals and oversight only — it never takes part in rides.",
      code: "ADMIN_READ_ONLY",
    });
  }
  return next();
}

/** Hydrate a ride row with its payer(s) + per-person shares. */
export async function serializeRide(db, id) {
  const rowRes = await db.execute({
    sql: `SELECT r.*, c.name AS creator_name
            FROM rides r
            JOIN users c ON c.id = r.created_by
           WHERE r.id = ?`,
    args: [Number(id)],
  });
  const row = rowRes.rows[0];
  if (!row) return null;

  const sharesRes = await db.execute({
    sql: `SELECT s.user_id, s.share_paisa, u.name
            FROM ride_shares s JOIN users u ON u.id = s.user_id
           WHERE s.ride_id = ?
           ORDER BY u.name COLLATE NOCASE`,
    args: [row.id],
  });
  const shares = sharesRes.rows;

  // Multiple members may have split the bill — one row per payer.
  const payersRes = await db.execute({
    sql: `SELECT p.user_id, p.amount_paisa, u.name
            FROM ride_payers p JOIN users u ON u.id = p.user_id
           WHERE p.ride_id = ?
           ORDER BY p.amount_paisa DESC, u.name COLLATE NOCASE`,
    args: [row.id],
  });
  let payers = payersRes.rows;

  if (payers.length === 0) {
    // Legacy ride without payer rows (pre-migration) — fall back to paid_by.
    const legacyRes = await db.execute({
      sql: `SELECT name FROM users WHERE id = ?`,
      args: [row.paid_by],
    });
    const legacy = legacyRes.rows[0];
    payers = [
      {
        user_id: row.paid_by,
        amount_paisa: row.amount_paisa,
        name: legacy?.name ?? "Unknown",
      },
    ];
  }

  return {
    id: row.id,
    paidBy: { id: payers[0].user_id, name: payers[0].name }, // first/biggest payer (compat)
    payers: payers.map((p) => ({
      userId: p.user_id,
      name: p.name,
      amountPaisa: p.amount_paisa,
    })),
    amountPaisa: row.amount_paisa,
    description: row.description,
    route: row.route,
    rideAt: row.ride_at,
    splitMethod: row.split_method,
    createdBy: row.created_by,
    createdByName: row.creator_name,
    createdAt: row.created_at,
    shares: shares.map((s) => ({
      userId: s.user_id,
      name: s.name,
      sharePaisa: s.share_paisa,
    })),
  };
}

export async function listRides(db, limit = 100) {
  const rowsRes = await db.execute({
    sql: `SELECT id FROM rides ORDER BY ride_at DESC, id DESC LIMIT ?`,
    args: [limit],
  });

  const rides = [];
  for (const r of rowsRes.rows) {
    const serialized = await serializeRide(db, r.id);
    if (serialized) rides.push(serialized);
  }
  return rides;
}

/**
 * POST /api/rides
 * body: { paidBy?, payers?, amountPaisa, route?, rideAt?, splitMethod,
 *         participants?: number[], shares?: { [userId]: amountPaisa } }
 */
router.post("/", blockAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const body = req.body ?? {};

    const amountPaisa = toPaisa(body.amountPaisa);
    if (!amountPaisa) {
      return res
        .status(400)
        .json({ error: "Enter a valid amount greater than 0." });
    }
    if (amountPaisa > MAX_AMOUNT_PAISA) {
      return res
        .status(400)
        .json({
          error: "That amount looks too large — please double check it.",
        });
    }

    const rawDescription = String(body.description ?? "").trim();
    if (
      rawDescription &&
      (rawDescription.length < 2 || rawDescription.length > 140)
    ) {
      return res
        .status(400)
        .json({ error: "Description must be 2–140 characters." });
    }
    const description = rawDescription || "Ride expense";
    const route =
      String(body.route ?? "")
        .trim()
        .slice(0, 160) || null;

    const rideAt = toLocalNaive(body.rideAt) || nowLocalNaive();

    const active = await participantIds();
    let payers;
    if (Array.isArray(body.payers) && body.payers.length > 0) {
      payers = body.payers.map((p) => ({
        userId: Number(p?.userId ?? p?.id),
        amountPaisa: toPaisa(p?.amountPaisa),
      }));
      if (
        payers.some(
          (p) => !Number.isInteger(p.userId) || !active.includes(p.userId),
        )
      ) {
        return res
          .status(400)
          .json({
            error: "Every payer must be an active colleague (member or admin).",
          });
      }
      if (new Set(payers.map((p) => p.userId)).size !== payers.length) {
        return res.status(400).json({ error: "List each payer only once." });
      }
      if (payers.some((p) => !p.amountPaisa || p.amountPaisa < 1)) {
        return res
          .status(400)
          .json({ error: "Each payer must cover an amount greater than 0." });
      }
      const paidSum = payers.reduce((total, p) => total + p.amountPaisa, 0);
      if (paidSum !== amountPaisa) {
        return res.status(400).json({
          error: `Payers must add up to the total — ${formatBdt(amountPaisa)} expected, ${formatBdt(paidSum)} entered.`,
          code: "PAYERS_MISMATCH",
        });
      }
    } else {
      const paidBy = Number(body.paidBy);
      if (!Number.isInteger(paidBy) || !active.includes(paidBy)) {
        return res
          .status(400)
          .json({ error: "Select an active colleague who paid the bill." });
      }
      payers = [{ userId: paidBy, amountPaisa }];
    }
    const primaryPayer = [...payers].sort(
      (a, b) => b.amountPaisa - a.amountPaisa,
    )[0].userId;

    const splitMethod = body.splitMethod === "custom" ? "custom" : "equal";

    let participants = Array.isArray(body.participants)
      ? [...new Set(body.participants.map(Number).filter(Number.isInteger))]
      : [];
    if (participants.length === 0) participants = active;

    const notActive = participants.filter((id) => !active.includes(id));
    if (notActive.length > 0) {
      return res
        .status(400)
        .json({
          error: "All participants must be active (approved) colleagues.",
        });
    }

    let shares;
    if (splitMethod === "equal") {
      const base = Math.floor(amountPaisa / participants.length);
      let remainder = amountPaisa - base * participants.length;
      shares = participants.map((userId) => ({
        userId,
        sharePaisa: base + (remainder-- > 0 ? 1 : 0),
      }));
    } else {
      const raw =
        body.shares && typeof body.shares === "object" ? body.shares : {};
      shares = participants.map((userId) => ({
        userId,
        sharePaisa: toPaisa(raw[userId] ?? raw[String(userId)]) ?? 0,
      }));
      const sum = shares.reduce((total, s) => total + s.sharePaisa, 0);
      if (sum !== amountPaisa) {
        return res.status(400).json({
          error: `Custom shares must add up to the total — ${formatBdt(amountPaisa)} expected, ${formatBdt(sum)} entered.`,
          code: "SPLIT_MISMATCH",
        });
      }
    }

    const now = new Date().toISOString();

    // Insert ride and related records via batched/sequential async execution
    const insertRideRes = await db.execute({
      sql: `INSERT INTO rides (paid_by, amount_paisa, description, route, ride_at, split_method, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        primaryPayer,
        amountPaisa,
        description,
        route,
        rideAt,
        splitMethod,
        req.user.id,
        now,
      ],
    });
    const rideId = Number(insertRideRes.lastInsertRowid);

    for (const share of shares) {
      await db.execute({
        sql: `INSERT INTO ride_shares (ride_id, user_id, share_paisa) VALUES (?, ?, ?)`,
        args: [rideId, share.userId, share.sharePaisa],
      });
    }

    for (const payer of payers) {
      await db.execute({
        sql: `INSERT INTO ride_payers (ride_id, user_id, amount_paisa) VALUES (?, ?, ?)`,
        args: [rideId, payer.userId, payer.amountPaisa],
      });
    }

    const createdRide = await serializeRide(db, rideId);
    return res.status(201).json({ ride: createdRide });
  } catch (err) {
    console.error("[rides] Create ride error:", err);
    return res.status(500).json({ error: "Server error creating ride." });
  }
});

/** GET /api/rides — most recent entries first. */
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rides = await listRides(db, limit);
    return res.json({ rides });
  } catch (err) {
    console.error("[rides] List rides error:", err);
    return res.status(500).json({ error: "Server error fetching rides." });
  }
});

/** DELETE /api/rides/:id — only the creator or an admin may remove an entry. */
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const rowRes = await db.execute({
      sql: `SELECT id, created_by FROM rides WHERE id = ?`,
      args: [Number(req.params.id)],
    });
    const row = rowRes.rows[0];
    if (!row) return res.status(404).json({ error: "Ride not found." });

    if (row.created_by !== req.user.id && !isAdminRole(req.user.role)) {
      return res
        .status(403)
        .json({
          error:
            "Only the person who logged this ride (or an admin) can delete it.",
        });
    }

    await db.execute({
      sql: `DELETE FROM rides WHERE id = ?`,
      args: [row.id],
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[rides] Delete ride error:", err);
    return res.status(500).json({ error: "Server error deleting ride." });
  }
});

export default router;
