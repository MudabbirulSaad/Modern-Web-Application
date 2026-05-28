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

router.patch('/users/:id/role', requireAdmin, async (req, res) => {
  const targetUserId = Number(req.params.id);
  const currentUserId = Number(req.user.id);
  const requestedRole = req.body?.role;
  let conn;

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    res.status(404).json({ status: 'error', message: 'User not found' });
    return;
  }

  if (!['admin', 'student'].includes(requestedRole)) {
    res.status(400).json({ status: 'error', message: 'Role must be admin or student' });
    return;
  }

  try {
    conn = await pool.getConnection();
    const targetRows = await conn.query(
      'SELECT id, role FROM Users WHERE id = ? LIMIT 1',
      [targetUserId]
    );
    const targetUser = targetRows[0];

    if (!targetUser) {
      res.status(404).json({ status: 'error', message: 'User not found' });
      return;
    }

    const isDemotion = targetUser.role === 'admin' && requestedRole === 'student';

    if (isDemotion && targetUserId === currentUserId) {
      res.status(400).json({ status: 'error', message: 'Admins cannot demote their own account' });
      return;
    }

    if (isDemotion) {
      const primaryAdminRows = await conn.query('SELECT id FROM Users ORDER BY id ASC LIMIT 1');
      const primaryAdminId = primaryAdminRows.length > 0 ? Number(primaryAdminRows[0].id) : null;

      if (targetUserId === primaryAdminId) {
        res.status(400).json({ status: 'error', message: 'Primary Admin cannot be demoted' });
        return;
      }

      const adminCountRows = await conn.query(
        'SELECT COUNT(*) AS admin_count FROM Users WHERE role = ?',
        ['admin']
      );
      const adminCount = Number(adminCountRows[0]?.admin_count || 0);

      if (adminCount <= 1) {
        res.status(409).json({ status: 'error', message: 'At least one Admin must remain' });
        return;
      }
    }

    await conn.query(
      'UPDATE Users SET role = ? WHERE id = ?',
      [requestedRole, targetUserId]
    );

    const updatedRows = await conn.query(
      'SELECT id, username, email, role FROM Users WHERE id = ? LIMIT 1',
      [targetUserId]
    );

    res.json({ status: 'ok', data: updatedRows[0] });
  } catch (err) {
    console.error('Admin user role update error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to update user role' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;
