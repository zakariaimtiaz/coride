import { Router } from "express";
import { getDb } from "../db.js";
import {
  requireAdmin,
  requireApproved,
  requireAuth,
} from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireApproved);

const slugify = (text) =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function serializeMethod(row) {
  return {
    id: row.id,
    value: row.value,
    label: row.label,
    active: row.active === 1,
  };
}

function serializeRoute(row) {
  return { id: row.id, name: row.name, active: row.active === 1 };
}

/**
 * GET /api/meta — the active lists the forms need:
 * payment methods for the Pay-due select, route suggestions for the ride form.
 */
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const methodsRes = await db.execute(
      `SELECT * FROM payment_methods WHERE active = 1 ORDER BY id`,
    );
    const routesRes = await db.execute(
      `SELECT * FROM routes WHERE active = 1 ORDER BY name COLLATE NOCASE`,
    );

    return res.json({
      paymentMethods: methodsRes.rows.map(serializeMethod),
      routes: routesRes.rows.map(serializeRoute),
    });
  } catch (err) {
    console.error("[meta] Get active meta error:", err);
    return res.status(500).json({ error: "Server error fetching metadata." });
  }
});

/** GET /api/meta/manage — full lists incl. archived (admins only). */
router.get("/manage", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const methodsRes = await db.execute(
      `SELECT * FROM payment_methods ORDER BY active DESC, id`,
    );
    const routesRes = await db.execute(
      `SELECT * FROM routes ORDER BY active DESC, name COLLATE NOCASE`,
    );

    return res.json({
      paymentMethods: methodsRes.rows.map(serializeMethod),
      routes: routesRes.rows.map(serializeRoute),
    });
  } catch (err) {
    console.error("[meta] Get manage meta error:", err);
    return res
      .status(500)
      .json({ error: "Server error fetching metadata management lists." });
  }
});

/* ------------------------------------------------------- payment methods --- */

router.post("/payment-methods", requireAdmin, async (req, res) => {
  try {
    const label = String(req.body?.label ?? "").trim();
    if (label.length < 2 || label.length > 40) {
      return res
        .status(400)
        .json({ error: "Name must be between 2 and 40 characters." });
    }

    const value = slugify(label);
    if (!value) return res.status(400).json({ error: "Enter a valid name." });

    const db = await getDb();
    const existingRes = await db.execute({
      sql: `SELECT id FROM payment_methods WHERE value = ?`,
      args: [value],
    });
    if (existingRes.rows.length > 0) {
      return res
        .status(409)
        .json({ error: `“${label}” already exists.`, code: "DUPLICATE" });
    }

    const insertRes = await db.execute({
      sql: `INSERT INTO payment_methods (value, label, active, created_at) VALUES (?, ?, 1, ?)`,
      args: [value, label, new Date().toISOString()],
    });

    const rowRes = await db.execute({
      sql: `SELECT * FROM payment_methods WHERE id = ?`,
      args: [insertRes.lastInsertRowid],
    });
    const row = rowRes.rows[0];

    return res.status(201).json({ paymentMethod: serializeMethod(row) });
  } catch (err) {
    console.error("[meta] Create payment method error:", err);
    return res
      .status(500)
      .json({ error: "Server error creating payment method." });
  }
});

router.put("/payment-methods/:id", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const rowRes = await db.execute({
      sql: `SELECT * FROM payment_methods WHERE id = ?`,
      args: [Number(req.params.id)],
    });
    const row = rowRes.rows[0];
    if (!row)
      return res.status(404).json({ error: "Payment method not found." });

    const label =
      req.body?.label === undefined ? row.label : String(req.body.label).trim();
    if (label.length < 2 || label.length > 40) {
      return res
        .status(400)
        .json({ error: "Name must be between 2 and 40 characters." });
    }
    const active =
      req.body?.active === undefined ? row.active : req.body.active ? 1 : 0;

    await db.execute({
      sql: `UPDATE payment_methods SET label = ?, active = ? WHERE id = ?`,
      args: [label, active, row.id],
    });

    const updatedRes = await db.execute({
      sql: `SELECT * FROM payment_methods WHERE id = ?`,
      args: [row.id],
    });
    return res.json({ paymentMethod: serializeMethod(updatedRes.rows[0]) });
  } catch (err) {
    console.error("[meta] Update payment method error:", err);
    return res
      .status(500)
      .json({ error: "Server error updating payment method." });
  }
});

/**
 * DELETE /api/payment-methods/:id
 * Unused → removed outright. Used by past payments → archived (active = 0) so
 * history keeps its label and it disappears from the form.
 */
router.delete("/payment-methods/:id", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const rowRes = await db.execute({
      sql: `SELECT * FROM payment_methods WHERE id = ?`,
      args: [Number(req.params.id)],
    });
    const row = rowRes.rows[0];
    if (!row)
      return res.status(404).json({ error: "Payment method not found." });

    const usedRes = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM settlements WHERE payment_method = ?`,
      args: [row.value],
    });
    const used = usedRes.rows[0]?.c ?? 0;

    if (used > 0) {
      await db.execute({
        sql: `UPDATE payment_methods SET active = 0 WHERE id = ?`,
        args: [row.id],
      });
      const updatedRes = await db.execute({
        sql: `SELECT * FROM payment_methods WHERE id = ?`,
        args: [row.id],
      });
      return res.json({
        paymentMethod: serializeMethod(updatedRes.rows[0]),
        archived: true,
        message: `“${row.label}” is used by ${used} payment${used === 1 ? "" : "s"} — hidden from the form, history keeps the label.`,
      });
    }

    await db.execute({
      sql: `DELETE FROM payment_methods WHERE id = ?`,
      args: [row.id],
    });
    return res.json({ deleted: true, message: `“${row.label}” deleted.` });
  } catch (err) {
    console.error("[meta] Delete payment method error:", err);
    return res
      .status(500)
      .json({ error: "Server error deleting payment method." });
  }
});

/* ---------------------------------------------------------------- routes --- */

router.post("/routes", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (name.length < 2 || name.length > 60) {
      return res
        .status(400)
        .json({ error: "Route must be between 2 and 60 characters." });
    }

    const db = await getDb();
    const existingRes = await db.execute({
      sql: `SELECT id FROM routes WHERE name = ?`,
      args: [name],
    });
    if (existingRes.rows.length > 0) {
      return res
        .status(409)
        .json({ error: `“${name}” already exists.`, code: "DUPLICATE" });
    }

    const insertRes = await db.execute({
      sql: `INSERT INTO routes (name, active, created_at) VALUES (?, 1, ?)`,
      args: [name, new Date().toISOString()],
    });

    const rowRes = await db.execute({
      sql: `SELECT * FROM routes WHERE id = ?`,
      args: [insertRes.lastInsertRowid],
    });
    const row = rowRes.rows[0];

    return res.status(201).json({ route: serializeRoute(row) });
  } catch (err) {
    console.error("[meta] Create route error:", err);
    return res.status(500).json({ error: "Server error creating route." });
  }
});

router.put("/routes/:id", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const rowRes = await db.execute({
      sql: `SELECT * FROM routes WHERE id = ?`,
      args: [Number(req.params.id)],
    });
    const row = rowRes.rows[0];
    if (!row) return res.status(404).json({ error: "Route not found." });

    const name =
      req.body?.name === undefined ? row.name : String(req.body.name).trim();
    if (name.length < 2 || name.length > 60) {
      return res
        .status(400)
        .json({ error: "Route must be between 2 and 60 characters." });
    }
    const active =
      req.body?.active === undefined ? row.active : req.body.active ? 1 : 0;

    await db.execute({
      sql: `UPDATE routes SET name = ?, active = ? WHERE id = ?`,
      args: [name, active, row.id],
    });

    const updatedRes = await db.execute({
      sql: `SELECT * FROM routes WHERE id = ?`,
      args: [row.id],
    });
    return res.json({ route: serializeRoute(updatedRes.rows[0]) });
  } catch (err) {
    console.error("[meta] Update route error:", err);
    return res.status(500).json({ error: "Server error updating route." });
  }
});

/** DELETE /api/routes/:id — unused → removed, used by rides → archived. */
router.delete("/routes/:id", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const rowRes = await db.execute({
      sql: `SELECT * FROM routes WHERE id = ?`,
      args: [Number(req.params.id)],
    });
    const row = rowRes.rows[0];
    if (!row) return res.status(404).json({ error: "Route not found." });

    const usedRes = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM rides WHERE route = ?`,
      args: [row.name],
    });
    const used = usedRes.rows[0]?.c ?? 0;

    if (used > 0) {
      await db.execute({
        sql: `UPDATE routes SET active = 0 WHERE id = ?`,
        args: [row.id],
      });
      const updatedRes = await db.execute({
        sql: `SELECT * FROM routes WHERE id = ?`,
        args: [row.id],
      });
      return res.json({
        route: serializeRoute(updatedRes.rows[0]),
        archived: true,
        message: `“${row.name}” is used by past rides — hidden from the form, old rides keep it.`,
      });
    }

    await db.execute({
      sql: `DELETE FROM routes WHERE id = ?`,
      args: [row.id],
    });
    return res.json({ deleted: true, message: `“${row.name}” deleted.` });
  } catch (err) {
    console.error("[meta] Delete route error:", err);
    return res.status(500).json({ error: "Server error deleting route." });
  }
});

export default router;
