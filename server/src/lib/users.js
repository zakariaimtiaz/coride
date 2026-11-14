import { getDb } from "../db.js";

/** Strip sensitive columns before a user row leaves the API. */
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
}

export async function findUserById(id) {
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT * FROM users WHERE id = ?`,
    args: [Number(id)],
  });
  return res.rows[0] || null;
}

export async function findUserByEmail(email) {
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT * FROM users WHERE email = ?`,
    args: [String(email).trim().toLowerCase()],
  });

  if (!res.rows || res.rows.length === 0) return null;

  // libSQL row objects can sometimes use numeric or string keys depending on mode;
  // ensure we return the row object cleanly.
  const row = res.rows[0];
  return {
    id: row.id ?? row[0],
    name: row.name ?? row[1],
    email: row.email ?? row[2],
    password_hash: row.password_hash ?? row[3],
    role: row.role ?? row[4],
    status: row.status ?? row[5],
    created_at: row.created_at ?? row[6],
    approved_at: row.approved_at ?? row[7],
  };
}

/** admin or the built-in system_admin — both oversee the ledger. */
export function isAdminRole(role) {
  return role === "admin" || role === "system_admin";
}

/** The one fixed, undeletable super-user account. */
export function isSystemAdmin(role) {
  return role === "system_admin";
}

/**
 * Colleagues who take part in the ledger — approved members AND regular
 * admins. Only the System Admin (system_control) is excluded: it never
 * appears in the participant picker, payer/payee lists or the balance ledger.
 */
export async function participantIds() {
  const db = await getDb();
  const res = await db.execute(
    `SELECT id FROM users
     WHERE status = 'approved' AND role <> 'system_admin'
     ORDER BY name COLLATE NOCASE`,
  );
  return res.rows.map((r) => r.id);
}

export async function listParticipants() {
  const db = await getDb();
  const res = await db.execute(
    `SELECT id, name, email, role FROM users
     WHERE status = 'approved' AND role <> 'system_admin'
     ORDER BY name COLLATE NOCASE`,
  );
  return res.rows;
}
