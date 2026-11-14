import { Router } from "express";
import { getDb } from "../db.js";
import { requireApproved, requireAuth } from "../middleware/auth.js";
import {
  computeBalances,
  computeDirectDebts,
  monthStats,
} from "../lib/balances.js";
import { currentMonthKey, monthLabel } from "../lib/datetime.js";
import { listRides } from "./rides.js";
import { listSettlements } from "./settlements.js";

const router = Router();
router.use(requireAuth, requireApproved);

/**
 * GET /api/dashboard — everything the overview screen needs in one call:
 * monthly totals, per-member net balances, the direct person-to-person debts
 * (who actually borrowed from whom), plus recent rides & settlements.
 */
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const monthKey = currentMonthKey();
    const allNet = await computeBalances();

    const usersRes = await db.execute(
      `SELECT id, name, role, status FROM users`,
    );
    const names = new Map(usersRes.rows.map((u) => [u.id, u]));

    // The System Admin is system-control only: drop it from balances,
    // transfers and dues. Regular admins participate like members.
    const net = new Map(
      [...allNet.entries()].filter(
        ([userId]) => names.get(userId)?.role !== "system_admin",
      ),
    );

    const balances = [...net.entries()]
      .map(([userId, netPaisa]) => ({
        userId,
        name: names.get(userId)?.name ?? "Unknown",
        role: names.get(userId)?.role ?? "member",
        status: names.get(userId)?.status ?? "approved",
        netPaisa,
      }))
      .filter((b) => b.netPaisa !== 0 || b.status === "approved")
      .sort((a, b) => b.netPaisa - a.netPaisa || a.name.localeCompare(b.name));

    // Direct person-to-person debts from the ledger — each payer's row shows
    // exactly whom they actually borrowed from (0-debt pairs excluded).
    const inLedger = (userId) => names.get(userId)?.role !== "system_admin";

    const directDebts = await computeDirectDebts();
    const transfers = directDebts
      .filter((t) => inLedger(t.fromUserId) && inLedger(t.toUserId))
      .map((t) => ({
        from: {
          id: t.fromUserId,
          name: names.get(t.fromUserId)?.name ?? "Unknown",
        },
        to: { id: t.toUserId, name: names.get(t.toUserId)?.name ?? "Unknown" },
        amountPaisa: t.amountPaisa,
      }))
      .sort(
        (a, b) =>
          a.from.name.localeCompare(b.from.name) ||
          b.amountPaisa - a.amountPaisa,
      );

    const myNetPaisa = net.get(req.user.id) ?? 0;
    const stats = await monthStats(monthKey);

    return res.json({
      month: {
        key: monthKey,
        label: monthLabel(monthKey),
        ...stats,
      },
      myNetPaisa,
      balances,
      transfers,
      recentRides: await listRides(db, 6),
      recentSettlements: await listSettlements(db, 6),
    });
  } catch (err) {
    console.error("[dashboard] Error fetching dashboard data:", err);
    return res
      .status(500)
      .json({ error: "Server error fetching dashboard data." });
  }
});

export default router;
