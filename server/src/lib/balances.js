import { getDb } from "../db.js";

/**
 * Ledger maths.
 *
 * net(user) =  Σ amounts they paid  −  Σ their share of rides  +  Σ they received  −  Σ they paid out
 *
 * net > 0  →  the member is owed money
 * net < 0  →  the member owes money
 * net = 0  →  settled up
 */
export async function computeBalances() {
  const db = await getDb();
  const net = new Map();
  const bump = (id, delta) => net.set(id, (net.get(id) || 0) + delta);

  const payersRes = await db.execute(
    `SELECT user_id, SUM(amount_paisa) AS paid FROM ride_payers GROUP BY user_id`,
  );
  for (const row of payersRes.rows) {
    bump(row.user_id, row.paid);
  }

  const sharesRes = await db.execute(
    `SELECT user_id, share_paisa FROM ride_shares`,
  );
  for (const row of sharesRes.rows) {
    bump(row.user_id, -row.share_paisa);
  }

  const settlementsRes = await db.execute(
    `SELECT from_user, to_user, amount_paisa FROM settlements`,
  );
  for (const row of settlementsRes.rows) {
    bump(row.from_user, row.amount_paisa);
    bump(row.to_user, -row.amount_paisa);
  }

  // Every known user appears, even with a zero balance.
  const usersRes = await db.execute(`SELECT id FROM users`);
  for (const row of usersRes.rows) {
    if (!net.has(row.id)) net.set(row.id, 0);
  }
  return net;
}

/**
 * Split every participant's share across the ride's payers, proportionally to
 * what each payer contributed.
 *
 * Both margins are exact:
 *   • each participant's share is fully allocated across the payers, and
 *   • what is owed to a payer sums to exactly what that payer paid,
 * so the direct debts reconcile to the paisa with `computeBalances()`.
 *
 * Rounding: floor proportional amounts, hand leftover paisa to the biggest
 * fractional parts (capacity permitting); the last participant absorbs the
 * remainder (the leftover capacity always equals their remaining share).
 */
function allocatePayerDebts(shares, payers) {
  const remaining = payers.map((p) => ({
    userId: p.userId,
    cap: p.amountPaisa,
  }));
  const out = [];

  for (let i = 0; i < shares.length; i += 1) {
    const share = shares[i].sharePaisa;
    let amounts;

    if (i === shares.length - 1) {
      amounts = remaining.map((r) => r.cap);
    } else {
      const totalCap = remaining.reduce((sum, r) => sum + r.cap, 0);
      amounts = remaining.map((r) =>
        totalCap > 0 ? Math.floor((share * r.cap) / totalCap) : 0,
      );

      let rem = share - amounts.reduce((sum, a) => sum + a, 0);
      const byFraction = remaining
        .map((r, j) => ({
          j,
          frac: totalCap > 0 ? (share * r.cap) / totalCap - amounts[j] : 0,
        }))
        .sort((a, b) => b.frac - a.frac);

      let guard = 0;
      while (rem > 0 && byFraction.length > 0) {
        const { j } = byFraction[guard % byFraction.length];
        if (amounts[j] < remaining[j].cap) {
          amounts[j] += 1;
          rem -= 1;
        }
        guard += 1;
        if (guard > byFraction.length * (share + 2)) break; // safety valve
      }
      for (let j = 0; rem > 0 && j < amounts.length; j += 1) {
        while (rem > 0 && amounts[j] < remaining[j].cap) {
          amounts[j] += 1;
          rem -= 1;
        }
      }
    }

    remaining.forEach((r, j) => {
      r.cap -= amounts[j];
      if (amounts[j] > 0) {
        out.push({
          debtor: shares[i].userId,
          creditor: r.userId,
          amount: amounts[j],
        });
      }
    });
  }
  return out;
}

/**
 * Direct (pairwise) debts straight from the ledger — no re-routing.
 *
 * Every participant in a ride owes *the ride's payer(s)* their share
 * (proportionally to each payer's contribution), and every settlement shrinks
 * what was owed on that pair. Opposite IOUs between the same two people cancel
 * within the pair, so a pair netting to 0 disappears entirely.
 *
 * Money never flows through an intermediary: if Asker shared a ride that
 * Imtiaz and Rafed paid for together, he owes each of them their portion
 * directly — never a single combined amount.
 */
export async function computeDirectDebts() {
  const db = await getDb();

  // key `${debtorId}>${creditorId}` → paisa the debtor owes the creditor
  const owed = new Map();
  const add = (debtorId, creditorId, paisa) => {
    if (debtorId === creditorId) return; // a payer's own share is not a debt
    const key = `${debtorId}>${creditorId}`;
    owed.set(key, (owed.get(key) || 0) + paisa);
  };

  // Rides: each participant's share is split across the ride's payer(s).
  const payersByRide = new Map();
  const payersRes = await db.execute(
    `SELECT ride_id, user_id, amount_paisa FROM ride_payers ORDER BY amount_paisa DESC, user_id`,
  );
  for (const row of payersRes.rows) {
    if (!payersByRide.has(row.ride_id)) payersByRide.set(row.ride_id, []);
    payersByRide
      .get(row.ride_id)
      .push({ userId: row.user_id, amountPaisa: row.amount_paisa });
  }

  const sharesByRide = new Map();
  const sharesRes = await db.execute(
    `SELECT ride_id, user_id, share_paisa FROM ride_shares ORDER BY ride_id, user_id`,
  );
  for (const row of sharesRes.rows) {
    if (!sharesByRide.has(row.ride_id)) sharesByRide.set(row.ride_id, []);
    sharesByRide
      .get(row.ride_id)
      .push({ userId: row.user_id, sharePaisa: row.share_paisa });
  }

  for (const [rideId, shares] of sharesByRide) {
    const payers = payersByRide.get(rideId);
    if (!payers || payers.length === 0) continue;
    for (const debt of allocatePayerDebts(shares, payers)) {
      add(debt.debtor, debt.creditor, debt.amount);
    }
  }

  // Settlements: a payment from A to B shrinks A's IOU to B (may overpay → flows back).
  const settlementsRes = await db.execute(
    `SELECT from_user AS debtor, to_user AS creditor, SUM(amount_paisa) AS amount
       FROM settlements
      GROUP BY from_user, to_user`,
  );
  for (const row of settlementsRes.rows) {
    add(row.debtor, row.creditor, -row.amount);
  }

  // Net each unordered pair; a pair that cancels to 0 is excluded.
  const transfers = [];
  const done = new Set();
  for (const [key, amount] of owed) {
    const [a, b] = key.split(">").map(Number);
    const pair = a < b ? `${a}>${b}` : `${b}>${a}`;
    if (done.has(pair)) continue;
    done.add(pair);

    const reverse = owed.get(`${b}>${a}`) || 0;
    const net = amount - reverse;
    if (net > 0)
      transfers.push({ fromUserId: a, toUserId: b, amountPaisa: net });
    else if (net < 0)
      transfers.push({ fromUserId: b, toUserId: a, amountPaisa: -net });
  }
  return transfers;
}

/** Aggregate totals for a local month key ("YYYY-MM"). */
export async function monthStats(monthKey) {
  const db = await getDb();
  const ridesRes = await db.execute({
    sql: `SELECT COUNT(*) AS rideCount, COALESCE(SUM(amount_paisa), 0) AS rideTotal
            FROM rides WHERE substr(ride_at, 1, 7) = ?`,
    args: [monthKey],
  });
  const rides = ridesRes.rows[0];

  const settlementsRes = await db.execute({
    sql: `SELECT COUNT(*) AS settlementCount, COALESCE(SUM(amount_paisa), 0) AS settlementTotal
            FROM settlements WHERE substr(settled_at, 1, 7) = ?`,
    args: [monthKey],
  });
  const settlements = settlementsRes.rows[0];

  return {
    rideCount: rides.rideCount,
    rideTotalPaisa: rides.rideTotal,
    settlementCount: settlements.settlementCount,
    settlementTotalPaisa: settlements.settlementTotal,
  };
}
