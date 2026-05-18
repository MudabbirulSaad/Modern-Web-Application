import express from 'express';
import cors from 'cors';
import pool from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

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
