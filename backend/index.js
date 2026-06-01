import app from './app.js';
import pool from './db.js';
import http from 'http';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const startServer = async () => {
  try {
    const conn = await pool.getConnection();
    console.log('Database connected successfully');
    conn.release();

    const server = http.createServer(app);

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`${HOST}:${PORT} is already in use. Stop the old server or set a different PORT.`);
        process.exit(1);
      }

      throw err;
    });

    server.listen(PORT, HOST, () => {
      console.log(`Server is running on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to connect to the database on startup:', err);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { startServer };
export default app;
