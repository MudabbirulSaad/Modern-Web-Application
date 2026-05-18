import fs from 'fs';
import path from 'path';
import pool from './db.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setup() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('Connected to database.');

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    const queries = schema.split(';').filter(q => q.trim() !== '');

    for (const query of queries) {
      console.log(`Executing: ${query.substring(0, 50)}...`);
      await conn.query(query);
    }

    console.log('Database setup complete.');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    if (conn) conn.release();
    process.exit();
  }
}

setup();
