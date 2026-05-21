import app from './app.js';
import pool from './db.js';

const PORT = process.env.PORT || 3000;

const startServer = () => {
  pool.getConnection()
    .then((conn) => {
      console.log('Database connected successfully');
      conn.release();
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to connect to the database on startup:', err);
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT} (Database connection failed)`);
      });
    });
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { startServer };
export default app;
