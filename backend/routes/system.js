import express from 'express';
import pool from '../db.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/db-test', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT 1 as val');
    res.json({ status: 'ok', data: rows[0] });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;
