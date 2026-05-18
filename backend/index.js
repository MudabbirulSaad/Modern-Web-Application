import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import pool from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || 'development-jwt-secret';
const AUTH_COOKIE_NAME = 'auth_token';

app.use(cors());
app.use(express.json());
app.use(cookieParser());

const requireAdmin = (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ status: 'error', message: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== 'admin') {
      res.status(403).json({ status: 'error', message: 'Admin access required' });
      return;
    }

    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Authentication required' });
  }
};

const readTutorPayload = (body) => ({
  name: String(body.name || '').trim(),
  department: String(body.department || '').trim(),
  bio: String(body.bio || '').trim()
});

const readCoursePayload = (body) => ({
  title: String(body.title || '').trim(),
  department: String(body.department || '').trim(),
  description: String(body.description || '').trim(),
  tutorIds: [...new Set(
    (Array.isArray(body.tutorIds) ? body.tutorIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )]
});

const selectCourseById = async (conn, courseId) => {
  const courseRows = await conn.query(
    'SELECT id, title, department, description, created_at, updated_at FROM Courses WHERE id = ? LIMIT 1',
    [courseId]
  );

  if (courseRows.length === 0) {
    return null;
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
    [courseId]
  );

  return { ...courseRows[0], tutors: tutorRows };
};

const insertCourseTutors = async (conn, courseId, tutorIds) => {
  if (tutorIds.length === 0) {
    return;
  }

  const placeholders = tutorIds.map(() => '(?, ?)').join(', ');
  const values = tutorIds.flatMap((tutorId) => [courseId, tutorId]);

  await conn.query(
    `INSERT INTO Course_Tutors (course_id, tutor_id) VALUES ${placeholders}`,
    values
  );
};

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

app.post('/api/auth/login', async (req, res) => {
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

app.post('/api/tutors', requireAdmin, async (req, res) => {
  const { name, department, bio } = readTutorPayload(req.body);

  if (!name || !department || !bio) {
    res.status(400).json({ status: 'error', message: 'Name, department, and bio are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(
      'INSERT INTO Tutors (name, department, bio) VALUES (?, ?, ?)',
      [name, department, bio]
    );
    const rows = await conn.query(
      'SELECT id, name, department, bio, created_at, updated_at FROM Tutors WHERE id = ? LIMIT 1',
      [Number(result.insertId)]
    );

    res.status(201).json({ status: 'ok', data: rows[0] });
  } catch (err) {
    console.error('Tutor create error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to create tutor' });
  } finally {
    if (conn) conn.release();
  }
});

app.put('/api/tutors/:id', requireAdmin, async (req, res) => {
  const { name, department, bio } = readTutorPayload(req.body);

  if (!name || !department || !bio) {
    res.status(400).json({ status: 'error', message: 'Name, department, and bio are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(
      'UPDATE Tutors SET name = ?, department = ?, bio = ? WHERE id = ?',
      [name, department, bio, req.params.id]
    );

    if (Number(result.affectedRows || 0) === 0) {
      res.status(404).json({ status: 'error', message: 'Tutor not found' });
      return;
    }

    const rows = await conn.query(
      'SELECT id, name, department, bio, created_at, updated_at FROM Tutors WHERE id = ? LIMIT 1',
      [req.params.id]
    );

    res.json({ status: 'ok', data: rows[0] });
  } catch (err) {
    console.error('Tutor update error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to update tutor' });
  } finally {
    if (conn) conn.release();
  }
});

app.delete('/api/tutors/:id', requireAdmin, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(
      'DELETE FROM Tutors WHERE id = ?',
      [req.params.id]
    );

    if (Number(result.affectedRows || 0) === 0) {
      res.status(404).json({ status: 'error', message: 'Tutor not found' });
      return;
    }

    res.json({ status: 'ok', message: 'Tutor deleted' });
  } catch (err) {
    console.error('Tutor delete error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to delete tutor' });
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
        COALESCE(GROUP_CONCAT(t.id ORDER BY t.name SEPARATOR ','), '') AS tutor_ids,
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
    const course = await selectCourseById(conn, req.params.id);

    if (!course) {
      res.status(404).json({ status: 'error', message: 'Course not found' });
      return;
    }

    res.json({ status: 'ok', data: course });
  } catch (err) {
    console.error('Course detail query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch course' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/courses', requireAdmin, async (req, res) => {
  const { title, department, description, tutorIds } = readCoursePayload(req.body);

  if (!title || !department || !description) {
    res.status(400).json({ status: 'error', message: 'Title, department, and description are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const result = await conn.query(
      'INSERT INTO Courses (title, department, description) VALUES (?, ?, ?)',
      [title, department, description]
    );
    const courseId = Number(result.insertId);

    await insertCourseTutors(conn, courseId, tutorIds);
    const course = await selectCourseById(conn, courseId);
    await conn.commit();

    res.status(201).json({ status: 'ok', data: course });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Course create error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to create course' });
  } finally {
    if (conn) conn.release();
  }
});

app.put('/api/courses/:id', requireAdmin, async (req, res) => {
  const { title, department, description, tutorIds } = readCoursePayload(req.body);

  if (!title || !department || !description) {
    res.status(400).json({ status: 'error', message: 'Title, department, and description are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const result = await conn.query(
      'UPDATE Courses SET title = ?, department = ?, description = ? WHERE id = ?',
      [title, department, description, req.params.id]
    );

    if (Number(result.affectedRows || 0) === 0) {
      await conn.rollback();
      res.status(404).json({ status: 'error', message: 'Course not found' });
      return;
    }

    await conn.query(
      'DELETE FROM Course_Tutors WHERE course_id = ?',
      [req.params.id]
    );
    await insertCourseTutors(conn, req.params.id, tutorIds);
    const course = await selectCourseById(conn, req.params.id);
    await conn.commit();

    res.json({ status: 'ok', data: course });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Course update error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to update course' });
  } finally {
    if (conn) conn.release();
  }
});

app.delete('/api/courses/:id', requireAdmin, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(
      'DELETE FROM Courses WHERE id = ?',
      [req.params.id]
    );

    if (Number(result.affectedRows || 0) === 0) {
      res.status(404).json({ status: 'error', message: 'Course not found' });
      return;
    }

    res.json({ status: 'ok', message: 'Course deleted' });
  } catch (err) {
    console.error('Course delete error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to delete course' });
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
