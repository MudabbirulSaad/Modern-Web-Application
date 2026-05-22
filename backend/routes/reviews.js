import express from 'express';
import pool from '../db.js';
import { decodeAuthCookie, requireStudent } from '../middleware/auth.js';
import {
  REVIEW_COMMENT_MAX_LENGTH,
  normalizeReview,
  readReviewPayload,
  sanitizeReviewComment,
  selectReviewById,
  validateDashboardUserRequest
} from './support.js';

const router = express.Router();

router.get('/reviews', async (req, res) => {
  const entityType = String(req.query.entity_type || '').trim().toLowerCase();
  const entityId = Number(req.query.entity_id);

  if (!['tutor', 'course'].includes(entityType) || !Number.isInteger(entityId) || entityId <= 0) {
    res.status(400).json({ status: 'error', message: 'Valid entity_type and entity_id are required' });
    return;
  }

  const viewer = decodeAuthCookie(req);
  const isStudent = viewer?.role === 'student';
  const upvoteSelect = isStudent
    ? ', CASE WHEN ru.user_id IS NULL THEN 0 ELSE 1 END AS has_upvoted'
    : '';
  const upvoteJoin = isStudent
    ? 'LEFT JOIN Review_Upvotes ru ON ru.review_id = r.id AND ru.user_id = ?'
    : '';
  const params = isStudent ? [Number(viewer.id), entityType, entityId] : [entityType, entityId];
  const limitClause = isStudent ? '' : 'LIMIT ?';

  if (!isStudent) {
    params.push(3);
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `
      SELECT
        r.id,
        r.user_id,
        u.username,
        r.entity_type,
        r.entity_id,
        r.rating,
        r.comment,
        r.upvotes,
        r.created_at
        ${upvoteSelect}
      FROM Reviews r
      INNER JOIN Users u ON u.id = r.user_id
      ${upvoteJoin}
      WHERE r.entity_type = ? AND r.entity_id = ?
      ORDER BY r.upvotes DESC, r.created_at DESC
      ${limitClause}
      `,
      params
    );

    res.json({
      status: 'ok',
      data: rows.map((review) => normalizeReview(review, isStudent ? Number(viewer.id) : null)),
      metadata: isStudent
        ? { access: 'student-full' }
        : { access: 'guest-preview', preview_limit: 3 }
    });
  } catch (err) {
    console.error('Reviews query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch reviews' });
  } finally {
    if (conn) conn.release();
  }
});

router.post('/reviews', requireStudent, async (req, res) => {
  const { entityType, entityId, rating, comment } = readReviewPayload(req.body);

  if (!['tutor', 'course'].includes(entityType) || !Number.isInteger(entityId) || entityId <= 0) {
    res.status(400).json({ status: 'error', message: 'Valid entity_type and entity_id are required' });
    return;
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment) {
    res.status(400).json({ status: 'error', message: 'Rating from 1 to 5 and comment are required' });
    return;
  }

  if (comment.length > REVIEW_COMMENT_MAX_LENGTH) {
    res.status(400).json({ status: 'error', message: 'Review comment must be 1000 characters or fewer' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(
      'INSERT INTO Reviews (user_id, entity_type, entity_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [Number(req.user.id), entityType, entityId, rating, comment]
    );
    const review = await selectReviewById(conn, Number(result.insertId), Number(req.user.id));

    res.status(201).json({ status: 'ok', data: review });
  } catch (err) {
    console.error('Review create error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to create review' });
  } finally {
    if (conn) conn.release();
  }
});

router.put('/reviews/:id', requireStudent, async (req, res) => {
  const reviewId = Number(req.params.id);
  const rating = Number(req.body.rating);
  const comment = sanitizeReviewComment(req.body.comment);

  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    res.status(400).json({ status: 'error', message: 'Valid review id is required' });
    return;
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment) {
    res.status(400).json({ status: 'error', message: 'Rating from 1 to 5 and comment are required' });
    return;
  }

  if (comment.length > REVIEW_COMMENT_MAX_LENGTH) {
    res.status(400).json({ status: 'error', message: 'Review comment must be 1000 characters or fewer' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(
      'UPDATE Reviews SET rating = ?, comment = ? WHERE id = ? AND user_id = ?',
      [rating, comment, req.params.id, Number(req.user.id)]
    );

    if (Number(result.affectedRows || 0) === 0) {
      res.status(404).json({ status: 'error', message: 'Review not found' });
      return;
    }

    const review = await selectReviewById(conn, reviewId, Number(req.user.id));

    res.json({ status: 'ok', data: review });
  } catch (err) {
    console.error('Review update error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to update review' });
  } finally {
    if (conn) conn.release();
  }
});

router.delete('/reviews/:id', requireStudent, async (req, res) => {
  const reviewId = Number(req.params.id);

  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    res.status(400).json({ status: 'error', message: 'Valid review id is required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(
      'DELETE FROM Reviews WHERE id = ? AND user_id = ?',
      [req.params.id, Number(req.user.id)]
    );

    if (Number(result.affectedRows || 0) === 0) {
      res.status(404).json({ status: 'error', message: 'Review not found' });
      return;
    }

    res.json({ status: 'ok', message: 'Review deleted' });
  } catch (err) {
    console.error('Review delete error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to delete review' });
  } finally {
    if (conn) conn.release();
  }
});

router.post('/reviews/:id/upvote', requireStudent, async (req, res) => {
  const reviewId = Number(req.params.id);
  const userId = Number(req.user.id);

  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    res.status(400).json({ status: 'error', message: 'Valid review id is required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const reviewRows = await conn.query(
      'SELECT id, user_id FROM Reviews WHERE id = ? LIMIT 1',
      [reviewId]
    );

    if (reviewRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ status: 'error', message: 'Review not found' });
      return;
    }

    if (Number(reviewRows[0].user_id) === userId) {
      await conn.rollback();
      res.status(403).json({ status: 'error', message: 'Cannot upvote your own review' });
      return;
    }

    const upvoteRows = await conn.query(
      'SELECT review_id FROM Review_Upvotes WHERE review_id = ? AND user_id = ? LIMIT 1',
      [reviewId, userId]
    );

    if (upvoteRows.length > 0) {
      await conn.query(
        'DELETE FROM Review_Upvotes WHERE review_id = ? AND user_id = ?',
        [reviewId, userId]
      );
      await conn.query(
        'UPDATE Reviews SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = ?',
        [reviewId]
      );
    } else {
      await conn.query(
        'INSERT INTO Review_Upvotes (review_id, user_id) VALUES (?, ?)',
        [reviewId, userId]
      );
      await conn.query(
        'UPDATE Reviews SET upvotes = upvotes + 1 WHERE id = ?',
        [reviewId]
      );
    }

    const review = await selectReviewById(conn, reviewId, userId);
    await conn.commit();

    res.json({ status: 'ok', data: review });
  } catch (err) {
    if (conn) {
      await conn.rollback();
    }

    console.error('Review upvote error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to update review upvote' });
  } finally {
    if (conn) conn.release();
  }
});

router.get('/users/:id/reviews', requireStudent, async (req, res) => {
  const userId = validateDashboardUserRequest(req, res);

  if (!userId) {
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `
      SELECT
        r.id,
        r.user_id,
        u.username,
        r.entity_type,
        r.entity_id,
        CASE
          WHEN r.entity_type = "course" THEN c.title
          ELSE t.name
        END AS entity_title,
        CASE
          WHEN r.entity_type = "course" THEN c.department
          ELSE t.department
        END AS entity_department,
        r.rating,
        r.comment,
        r.upvotes,
        0 AS has_upvoted,
        r.created_at
      FROM Reviews r
      INNER JOIN Users u ON u.id = r.user_id
      LEFT JOIN Courses c ON r.entity_type = "course" AND c.id = r.entity_id
      LEFT JOIN Tutors t ON r.entity_type = "tutor" AND t.id = r.entity_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
      `,
      [userId]
    );

    res.json({ status: 'ok', data: rows.map((review) => normalizeReview(review, userId)) });
  } catch (err) {
    console.error('User review history query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch review history' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;
