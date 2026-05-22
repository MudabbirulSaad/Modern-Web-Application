import express from 'express';
import pool from '../db.js';
import { decodeAuthCookie, requireAdmin } from '../middleware/auth.js';
import {
  COURSE_DUPLICATE_MESSAGE,
  buildCourseFilters,
  buildDirectoryOrderClause,
  buildReviewStatsJoin,
  hasDuplicateCourse,
  insertCourseTutors,
  isCourseDuplicateError,
  normalizeFavoriteFields,
  readCoursePayload,
  readDirectoryFilters,
  readDirectorySort,
  readPagination,
  readTotalCount,
  selectCourseById
} from './support.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const viewer = decodeAuthCookie(req);
  const isStudent = viewer?.role === 'student';
  const directoryFilters = readDirectoryFilters(req.query);
  const { whereClause, params } = buildCourseFilters(directoryFilters);
  const departmentFilters = buildCourseFilters({ search: directoryFilters.search, department: '' });
  const departmentWhereClause = departmentFilters.whereClause
    ? `${departmentFilters.whereClause} AND c.department IS NOT NULL AND c.department <> ""`
    : ' WHERE c.department IS NOT NULL AND c.department <> ""';
  const pagination = readPagination(req.query);
  const sort = readDirectorySort(req.query);
  const paginationClause = pagination.isPaginated ? ' LIMIT ? OFFSET ?' : '';
  const paginationParams = pagination.isPaginated ? [pagination.limit, pagination.offset] : [];
  const needsReviewStats = sort !== 'alphabetical';
  const reviewStatsJoin = needsReviewStats ? buildReviewStatsJoin('course', 'c') : '';
  const orderClause = buildDirectoryOrderClause(sort, 'c', 'title');
  const reviewStatsGroupFields = needsReviewStats
    ? ', review_stats.average_rating, review_stats.review_count, review_stats.latest_review_at'
    : '';

  let conn;
  try {
    conn = await pool.getConnection();
    const countRows = params.length > 0
      ? await conn.query(`SELECT COUNT(*) AS total FROM Courses c${whereClause}`, params)
      : await conn.query(`SELECT COUNT(*) AS total FROM Courses c${whereClause}`);
    const total = readTotalCount(countRows);
    const departmentRows = departmentFilters.params.length > 0
      ? await conn.query(`SELECT DISTINCT c.department AS department FROM Courses c${departmentWhereClause} ORDER BY c.department ASC`, departmentFilters.params)
      : await conn.query(`SELECT DISTINCT c.department AS department FROM Courses c${departmentWhereClause} ORDER BY c.department ASC`);
    const departments = departmentRows.map((row) => row.department);
    let rows;

    if (isStudent) {
      const sql = `
      SELECT
        c.id,
        c.title,
        c.department,
        c.description,
        c.created_at,
        c.updated_at,
        COALESCE(GROUP_CONCAT(t.id ORDER BY t.name SEPARATOR ','), '') AS tutor_ids,
        COALESCE(GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', '), '') AS tutor_names,
        CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS has_favorite
      FROM Courses c
      LEFT JOIN Course_Tutors ct ON ct.course_id = c.id
      LEFT JOIN Tutors t ON t.id = ct.tutor_id
      LEFT JOIN Favorites f ON f.entity_type = "course" AND f.entity_id = c.id AND f.user_id = ?
      ${reviewStatsJoin}
      ${whereClause}
      GROUP BY c.id, c.title, c.department, c.description, c.created_at, c.updated_at, f.id${reviewStatsGroupFields}
      ${orderClause}
      ${paginationClause}
    `;
      rows = await conn.query(sql, [Number(viewer.id), ...params, ...paginationParams]);
    } else {
      const sql = `
      SELECT
        c.id,
        c.title,
        c.department,
        c.description,
        c.created_at,
        c.updated_at,
        COALESCE(GROUP_CONCAT(t.id ORDER BY t.name SEPARATOR ','), '') AS tutor_ids,
        COALESCE(GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', '), '') AS tutor_names,
        0 AS has_favorite
      FROM Courses c
      LEFT JOIN Course_Tutors ct ON ct.course_id = c.id
      LEFT JOIN Tutors t ON t.id = ct.tutor_id
      ${reviewStatsJoin}
      ${whereClause}
      GROUP BY c.id, c.title, c.department, c.description, c.created_at, c.updated_at${reviewStatsGroupFields}
      ${orderClause}
      ${paginationClause}
    `;
      const queryParams = [...params, ...paginationParams];
      rows = queryParams.length > 0
        ? await conn.query(sql, queryParams)
        : await conn.query(sql);
    }

    res.json({ status: 'ok', data: rows.map(normalizeFavoriteFields), total, metadata: { departments } });
  } catch (err) {
    console.error('Courses query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch courses' });
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
    const course = await selectCourseById(conn, req.params.id, isStudent ? Number(viewer.id) : null);

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

router.post('/', requireAdmin, async (req, res) => {
  const { title, department, description, tutorIds } = readCoursePayload(req.body);

  if (!title || !department || !description) {
    res.status(400).json({ status: 'error', message: 'Title, department, and description are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    if (await hasDuplicateCourse(conn, { title, department })) {
      await conn.rollback();
      res.status(400).json({ status: 'error', message: COURSE_DUPLICATE_MESSAGE });
      return;
    }

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

    if (isCourseDuplicateError(err)) {
      res.status(400).json({ status: 'error', message: COURSE_DUPLICATE_MESSAGE });
      return;
    }

    console.error('Course create error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to create course' });
  } finally {
    if (conn) conn.release();
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { title, department, description, tutorIds } = readCoursePayload(req.body);

  if (!title || !department || !description) {
    res.status(400).json({ status: 'error', message: 'Title, department, and description are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    if (await hasDuplicateCourse(conn, { title, department }, req.params.id)) {
      await conn.rollback();
      res.status(400).json({ status: 'error', message: COURSE_DUPLICATE_MESSAGE });
      return;
    }

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

    if (isCourseDuplicateError(err)) {
      res.status(400).json({ status: 'error', message: COURSE_DUPLICATE_MESSAGE });
      return;
    }

    console.error('Course update error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to update course' });
  } finally {
    if (conn) conn.release();
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
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

export default router;
