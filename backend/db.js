import { createPool } from 'mariadb';

const pool = createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'modern_web_app',
  connectionLimit: 5
});

export default pool;
