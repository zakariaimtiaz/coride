import { Router } from "express";
import { getDb } from "../db.js";
import { requireApproved, requireAuth } from "../middleware/auth.js";
import { listParticipants, publicUser } from "../lib/users.js";

const router = Router();
router.use(requireAuth, requireApproved);

/**
 * GET /api/users — returns the list of approved active colleagues
 * used by the ride creation and settlement forms.
 */
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const participants = await listParticipants();

    return res.json({
      users: participants.map(publicUser),
    });
  } catch (err) {
    console.error("[users] Error fetching users:", err);
    return res.status(500).json({ error: "Server error fetching users." });
  }
});

export default router;
