import express from 'express';
import pool from '../db.js';
import { requireStudent } from '../middleware/auth.js';
import {
  normalizeFavoriteFields,
  selectFavoriteById,
  validateCurrentFavoriteRequest,
  validateDashboardUserRequest,
  validateFavoriteRequest
} from './support.js';

const router = express.Router();

const sendFavoriteDashboard = async (res, userId) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const tutorRows = await conn.query(
      `
      SELECT
        t.id,
        t.name,
        t.department,
        t.bio,
        t.created_at,
        t.updated_at,
        1 AS has_favorite
      FROM Favorites f
      INNER JOIN Tutors t ON t.id = f.entity_id
      WHERE f.user_id = ? AND f.entity_type = "tutor"
      ORDER BY t.name ASC
      `,
      [userId]
    );
    const courseRows = await conn.query(
      `
      SELECT
        c.id,
        c.title,
        c.department,
        c.description,
        c.created_at,
        c.updated_at,
        COALESCE(GROUP_CONCAT(t.id ORDER BY t.name SEPARATOR ','), '') AS tutor_ids,
        COALESCE(GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', '), '') AS tutor_names,
        1 AS has_favorite
      FROM Favorites f
      INNER JOIN Courses c ON c.id = f.entity_id
      LEFT JOIN Course_Tutors ct ON ct.course_id = c.id
      LEFT JOIN Tutors t ON t.id = ct.tutor_id
      WHERE f.user_id = ? AND f.entity_type = "course"
      GROUP BY c.id, c.title, c.department, c.description, c.created_at, c.updated_at
      ORDER BY c.title ASC
      `,
      [userId]
    );

    res.json({
      status: 'ok',
      data: {
        tutors: tutorRows.map(normalizeFavoriteFields),
        courses: courseRows.map(normalizeFavoriteFields)
      }
    });
  } catch (err) {
    console.error('User favorites query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch favorites' });
  } finally {
    if (conn) conn.release();
  }
};

const createFavorite = async (res, favoriteRequest) => {
  const { userId, entityType, entityId } = favoriteRequest;

  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(
      'INSERT INTO Favorites (user_id, entity_type, entity_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
      [userId, entityType, entityId]
    );
    const favorite = await selectFavoriteById(conn, Number(result.insertId));

    res.status(201).json({ status: 'ok', data: favorite });
  } catch (err) {
    console.error('Favorite create error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to save favorite' });
  } finally {
    if (conn) conn.release();
  }
};

const removeFavorite = async (res, favoriteRequest) => {
  const { userId, entityType, entityId } = favoriteRequest;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query(
      'DELETE FROM Favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?',
      [userId, entityType, entityId]
    );

    res.json({ status: 'ok', message: 'Favorite removed' });
  } catch (err) {
    console.error('Favorite delete error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to remove favorite' });
  } finally {
    if (conn) conn.release();
  }
};

router.get('/me/favorites', requireStudent, async (req, res) => {
  await sendFavoriteDashboard(res, Number(req.user.id));
});

router.get('/users/:id/favorites', requireStudent, async (req, res) => {
  const userId = validateDashboardUserRequest(req, res);

  if (!userId) {
    return;
  }

  await sendFavoriteDashboard(res, userId);
});

router.post('/me/favorites', requireStudent, async (req, res) => {
  const favoriteRequest = validateCurrentFavoriteRequest(req, res);

  if (!favoriteRequest) {
    return;
  }

  await createFavorite(res, favoriteRequest);
});

router.post('/users/:id/favorites', requireStudent, async (req, res) => {
  const favoriteRequest = validateFavoriteRequest(req, res);

  if (!favoriteRequest) {
    return;
  }

  await createFavorite(res, favoriteRequest);
});

router.delete('/me/favorites', requireStudent, async (req, res) => {
  const favoriteRequest = validateCurrentFavoriteRequest(req, res);

  if (!favoriteRequest) {
    return;
  }

  await removeFavorite(res, favoriteRequest);
});

router.delete('/users/:id/favorites', requireStudent, async (req, res) => {
  const favoriteRequest = validateFavoriteRequest(req, res);

  if (!favoriteRequest) {
    return;
  }

  await removeFavorite(res, favoriteRequest);
});

export default router;
