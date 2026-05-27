import express from 'express';
import pool from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/users', requireAdmin, async (req, res) => {
  let conn;

  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT id, username, email, role FROM Users ORDER BY id ASC');
    const primaryAdminId = rows.length > 0 ? Number(rows[0].id) : null;
    const currentUserId = Number(req.user.id);
    const users = rows.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_primary_admin: Number(user.id) === primaryAdminId,
      is_current_user: Number(user.id) === currentUserId
    }));

    res.json({ status: 'ok', data: users });
  } catch (err) {
    console.error('Admin users query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch users' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;
