import express from 'express';
import pool from '../db.js';
import { decodeAuthCookie, requireAdmin } from '../middleware/auth.js';
import {
  TUTOR_DUPLICATE_MESSAGE,
  buildDirectoryOrderClause,
  buildReviewStatsJoin,
  buildTutorFilters,
  hasDuplicateTutor,
  isTutorDuplicateError,
  normalizeFavoriteFields,
  readDirectoryFilters,
  readDirectorySort,
  readPagination,
  readTotalCount,
  readTutorPayload
} from './support.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const viewer = decodeAuthCookie(req);
  const isStudent = viewer?.role === 'student';
  const { whereClause, params } = buildTutorFilters(readDirectoryFilters(req.query));
  const pagination = readPagination(req.query);
  const sort = readDirectorySort(req.query);
  const paginationClause = pagination.isPaginated ? ' LIMIT ? OFFSET ?' : '';
  const paginationParams = pagination.isPaginated ? [pagination.limit, pagination.offset] : [];
  const needsReviewStats = sort !== 'alphabetical';
  const reviewStatsJoin = needsReviewStats ? buildReviewStatsJoin('tutor', 't') : '';
  const orderClause = buildDirectoryOrderClause(sort, 't', 'name');

  let conn;
  try {
    conn = await pool.getConnection();
    const countRows = params.length > 0
      ? await conn.query(`SELECT COUNT(*) AS total FROM Tutors${whereClause}`, params)
      : await conn.query(`SELECT COUNT(*) AS total FROM Tutors${whereClause}`);
    const total = readTotalCount(countRows);
    let rows;

    if (isStudent) {
      const sql = `
      SELECT
        t.id,
        t.name,
        t.department,
        t.bio,
        t.created_at,
        t.updated_at,
        CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS has_favorite
      FROM Tutors t
      LEFT JOIN Favorites f ON f.entity_type = "tutor" AND f.entity_id = t.id AND f.user_id = ?
      ${reviewStatsJoin}
      ${whereClause}
      ${orderClause}
      ${paginationClause}
      `;
      rows = await conn.query(sql, [Number(viewer.id), ...params, ...paginationParams]);
    } else if (needsReviewStats) {
      const sql = `
      SELECT
        t.id,
        t.name,
        t.department,
        t.bio,
        t.created_at,
        t.updated_at
      FROM Tutors t
      ${reviewStatsJoin}
      ${whereClause}
      ${orderClause}
      ${paginationClause}
      `;
      const queryParams = [...params, ...paginationParams];
      rows = queryParams.length > 0
        ? await conn.query(sql, queryParams)
        : await conn.query(sql);
    } else {
      const sql = `SELECT id, name, department, bio, created_at, updated_at FROM Tutors${whereClause} ORDER BY name ASC${paginationClause}`;
      const queryParams = [...params, ...paginationParams];
      rows = queryParams.length > 0
        ? await conn.query(sql, queryParams)
        : await conn.query(sql);
    }

    res.json({ status: 'ok', data: rows.map(normalizeFavoriteFields), total });
  } catch (err) {
    console.error('Tutors query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch tutors' });
  } finally {
    if (conn) conn.release();
  }
});

router.get('/:id', async (req, res) => {
  const viewer = decodeAuthCookie(req);
  const isStudent = viewer?.role === 'student';

  let conn;
  try {
    conn = await pool.getConnection();
    const rows = isStudent
      ? await conn.query(
        `
      SELECT
        t.id,
        t.name,
        t.department,
        t.bio,
        t.created_at,
        t.updated_at,
        CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS has_favorite
      FROM Tutors t
      LEFT JOIN Favorites f ON f.entity_type = "tutor" AND f.entity_id = t.id AND f.user_id = ?
      WHERE t.id = ?
      LIMIT 1
      `,
        [Number(viewer.id), req.params.id]
      )
      : await conn.query(
        'SELECT id, name, department, bio, created_at, updated_at FROM Tutors WHERE id = ? LIMIT 1',
        [req.params.id]
      );

    if (rows.length === 0) {
      res.status(404).json({ status: 'error', message: 'Tutor not found' });
      return;
    }

    res.json({ status: 'ok', data: normalizeFavoriteFields(rows[0]) });
  } catch (err) {
    console.error('Tutor detail query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch tutor' });
  } finally {
    if (conn) conn.release();
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, department, bio } = readTutorPayload(req.body);

  if (!name || !department || !bio) {
    res.status(400).json({ status: 'error', message: 'Name, department, and bio are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const isDuplicate = await hasDuplicateTutor(conn, { name, department });

    if (isDuplicate) {
      res.status(400).json({ status: 'error', message: TUTOR_DUPLICATE_MESSAGE });
      return;
    }

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
    if (isTutorDuplicateError(err)) {
      res.status(400).json({ status: 'error', message: TUTOR_DUPLICATE_MESSAGE });
      return;
    }

    console.error('Tutor create error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to create tutor' });
  } finally {
    if (conn) conn.release();
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { name, department, bio } = readTutorPayload(req.body);

  if (!name || !department || !bio) {
    res.status(400).json({ status: 'error', message: 'Name, department, and bio are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const isDuplicate = await hasDuplicateTutor(conn, { name, department }, req.params.id);

    if (isDuplicate) {
      res.status(400).json({ status: 'error', message: TUTOR_DUPLICATE_MESSAGE });
      return;
    }

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
    if (isTutorDuplicateError(err)) {
      res.status(400).json({ status: 'error', message: TUTOR_DUPLICATE_MESSAGE });
      return;
    }

    console.error('Tutor update error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to update tutor' });
  } finally {
    if (conn) conn.release();
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
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

export default router;
