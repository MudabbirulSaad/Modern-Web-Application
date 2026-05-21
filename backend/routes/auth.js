import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { AUTH_COOKIE_NAME, JWT_SECRET, decodeAuthCookie } from '../middleware/auth.js';

const SALT_ROUNDS = 12;

const router = express.Router();

router.post('/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!username || !email || !password) {
    res.status(400).json({ status: 'error', message: 'Username, email, and password are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const countRows = await conn.query('SELECT COUNT(*) AS user_count FROM Users');
    const userCount = Number(countRows[0]?.user_count || 0);
    const role = userCount === 0 ? 'admin' : 'student';
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await conn.query(
      'INSERT INTO Users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, role]
    );

    res.status(201).json({
      status: 'ok',
      data: {
        id: Number(result.insertId),
        username,
        email,
        role
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ status: 'error', message: 'Username or email already exists' });
      return;
    }

    console.error('Registration error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to register user' });
  } finally {
    if (conn) conn.release();
  }
});

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    res.status(400).json({ status: 'error', message: 'Email and password are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, username, email, password_hash, role FROM Users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];

    if (!user) {
      res.status(401).json({ status: 'error', message: 'Invalid email or password' });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      res.status(401).json({ status: 'error', message: 'Invalid email or password' });
      return;
    }

    const userData = {
      id: Number(user.id),
      username: user.username,
      email: user.email,
      role: user.role
    };
    const token = jwt.sign(
      {
        id: userData.id,
        role: userData.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.json({ status: 'ok', data: userData });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to log in' });
  } finally {
    if (conn) conn.release();
  }
});

router.get('/session', async (req, res) => {
  const decoded = decodeAuthCookie(req);

  if (!decoded) {
    res.status(401).json({ status: 'error', message: 'Authentication required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, username, email, role FROM Users WHERE id = ? LIMIT 1',
      [Number(decoded.id)]
    );
    const user = rows[0];

    if (!user) {
      res.status(401).json({ status: 'error', message: 'Authentication required' });
      return;
    }

    res.json({
      status: 'ok',
      data: {
        id: Number(user.id),
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Session restore error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to restore session' });
  } finally {
    if (conn) conn.release();
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  });
  res.json({ status: 'ok' });
});

export default router;
