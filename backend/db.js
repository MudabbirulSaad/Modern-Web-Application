import { createPool } from 'mariadb';
import dotenv from 'dotenv';

dotenv.config();
const pool = createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'modern_web_app',
  connectionLimit: 5
});

export default pool;
