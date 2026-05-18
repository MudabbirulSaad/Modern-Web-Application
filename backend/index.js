import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import pool from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 12;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/db-test', async (req, res) => {
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

app.post('/api/auth/register', async (req, res) => {
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

app.get('/api/tutors', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, name, department, bio, created_at, updated_at FROM Tutors ORDER BY name ASC'
    );
    res.json({ status: 'ok', data: rows });
  } catch (err) {
    console.error('Tutors query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch tutors' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/tutors/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, name, department, bio, created_at, updated_at FROM Tutors WHERE id = ? LIMIT 1',
      [req.params.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ status: 'error', message: 'Tutor not found' });
      return;
    }

    res.json({ status: 'ok', data: rows[0] });
  } catch (err) {
    console.error('Tutor detail query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch tutor' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/courses', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(`
      SELECT
        c.id,
        c.title,
        c.department,
        c.description,
        c.created_at,
        c.updated_at,
        COALESCE(GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', '), '') AS tutor_names
      FROM Courses c
      LEFT JOIN Course_Tutors ct ON ct.course_id = c.id
      LEFT JOIN Tutors t ON t.id = ct.tutor_id
      GROUP BY c.id, c.title, c.department, c.description, c.created_at, c.updated_at
      ORDER BY c.title ASC
    `);
    res.json({ status: 'ok', data: rows });
  } catch (err) {
    console.error('Courses query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch courses' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/courses/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const courseRows = await conn.query(
      'SELECT id, title, department, description, created_at, updated_at FROM Courses WHERE id = ? LIMIT 1',
      [req.params.id]
    );

    if (courseRows.length === 0) {
      res.status(404).json({ status: 'error', message: 'Course not found' });
      return;
    }

    const tutorRows = await conn.query(
      `
      SELECT
        t.id,
        t.name,
        t.department,
        t.bio
      FROM Course_Tutors ct
      INNER JOIN Tutors t ON t.id = ct.tutor_id
      WHERE ct.course_id = ?
      ORDER BY t.name ASC
      `,
      [req.params.id]
    );

    res.json({ status: 'ok', data: { ...courseRows[0], tutors: tutorRows } });
  } catch (err) {
    console.error('Course detail query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch course' });
  } finally {
    if (conn) conn.release();
  }
});

if (process.env.NODE_ENV !== 'test') {
  pool.getConnection()
    .then(conn => {
      console.log('Database connected successfully');
      conn.release();
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch(err => {
      console.error('Failed to connect to the database on startup:', err);
      // Graceful handling: log the error but don't necessarily kill the app if it can still serve some requests
      // However, for many apps, DB failure is fatal. Given "gracefully", I'll just log and still start if possible, 
      // or start the server anyway so /api/health works.
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT} (Database connection failed)`);
      });
    });
}

export default app;
