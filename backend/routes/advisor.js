import express from 'express';
import pool from '../db.js';
import { rankRecommendationsWithGroq } from '../advisorGroq.js';
import { decodeAuthCookie } from '../middleware/auth.js';

const router = express.Router();

const LOCAL_LIMITATION = 'Generated from local matching only.';
const WEAK_MATCH_LIMITATION = 'No exact Course Department match was found; showing closest local matches.';

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const readAdvisorPreferences = (body) => ({
  interestArea: String(body.interestArea || '').trim(),
  learningFocus: Array.isArray(body.learningFocus)
    ? body.learningFocus.map((focus) => String(focus || '').trim()).filter(Boolean)
    : [],
  recommendationGoal: String(body.recommendationGoal || '').trim(),
  experienceConfidence: String(body.experienceConfidence || '').trim(),
  personalGoal: String(body.personalGoal || '').trim()
});

const uniqueTokens = (values) => {
  const stopWords = new Set(['and', 'with', 'for', 'the', 'a', 'an', 'to', 'of', 'in', 'on', 'best', 'matches']);

  return [...new Set(
    values
      .flatMap((value) => normalizeText(value).split(/[^a-z0-9]+/))
      .filter((token) => token.length >= 2 && !stopWords.has(token))
  )];
};

const groupCandidateRows = (rows) => {
  const courses = new Map();

  rows.forEach((row) => {
    const courseId = Number(row.course_id);

    if (!courses.has(courseId)) {
      courses.set(courseId, {
        id: courseId,
        title: row.course_title,
        department: row.course_department,
        description: row.course_description,
        has_favorite: false,
        averageRating: row.average_rating === null || row.average_rating === undefined
          ? null
          : Number(row.average_rating),
        reviewCount: Number(row.review_count || 0),
        tutors: []
      });
    }

    if (row.tutor_id) {
      courses.get(courseId).tutors.push({
        id: Number(row.tutor_id),
        name: row.tutor_name,
        department: row.tutor_department
      });
    }
  });

  return [...courses.values()];
};

const buildStudentEvidenceByCourse = (rows = []) => {
  const evidence = new Map();

  rows.forEach((row) => {
    evidence.set(Number(row.course_id), {
      hasFavorite: Boolean(row.has_favorite),
      reviewCount: Number(row.student_review_count || 0),
      averageRating: row.student_average_rating === null || row.student_average_rating === undefined
        ? null
        : Number(row.student_average_rating)
    });
  });

  return evidence;
};

const scoreCourse = (course, preferences, hasExactDepartmentMatch, studentEvidence = null) => {
  const interest = normalizeText(preferences.interestArea);
  const department = normalizeText(course.department);
  const searchableCourseText = normalizeText(`${course.title} ${course.department} ${course.description}`);
  const focusTokens = uniqueTokens(preferences.learningFocus);
  const goalTokens = uniqueTokens([
    preferences.recommendationGoal,
    preferences.experienceConfidence,
    preferences.personalGoal
  ]);
  const evidence = [];
  const limitations = [];
  let score = 0;

  if (interest && department === interest) {
    score += 8;
    evidence.push(`Course Department matches ${preferences.interestArea}`);
  } else if (interest && searchableCourseText.includes(interest)) {
    score += 4;
    evidence.push(`Course content matches ${preferences.interestArea}`);
  }

  focusTokens.forEach((token) => {
    if (searchableCourseText.includes(token)) {
      score += 2;
      evidence.push(`Matches ${token.toUpperCase()} focus`);
    }
  });

  goalTokens.forEach((token) => {
    if (searchableCourseText.includes(token)) {
      score += 1;
    }
  });

  if (course.tutors.length > 0) {
    score += Math.min(course.tutors.length, 2);
    evidence.push('Linked tutors available');
  } else {
    limitations.push('No linked tutors are currently listed.');
  }

  if (course.reviewCount > 0 && course.averageRating !== null) {
    score += Math.round(course.averageRating);
    evidence.push(`Course rating ${course.averageRating.toFixed(1)} from ${course.reviewCount} reviews`);
  } else {
    limitations.push('Limited course review data is available.');
  }

  if (studentEvidence?.hasFavorite) {
    score += 6;
    evidence.push('Saved in your Favorites');
  }

  if (studentEvidence?.reviewCount > 0 && studentEvidence.averageRating !== null) {
    score += Math.round(studentEvidence.averageRating);
    evidence.push(`You reviewed this Course with a ${studentEvidence.averageRating.toFixed(1)} rating`);
  }

  if (!hasExactDepartmentMatch) {
    limitations.unshift(WEAK_MATCH_LIMITATION);
  }

  if (evidence.length === 0) {
    evidence.push('Closest available Course from the local directory');
  }

  return {
    course: {
      id: course.id,
      title: course.title,
      department: course.department,
      description: course.description,
      has_favorite: Boolean(studentEvidence?.hasFavorite)
    },
    score,
    reason: `${course.title} is recommended because ${evidence[0].toLowerCase()}.`,
    evidence,
    tutors: course.tutors,
    limitations
  };
};

const buildRecommendations = (rows, preferences, studentEvidenceByCourse = new Map()) => {
  const courses = groupCandidateRows(rows);
  const interest = normalizeText(preferences.interestArea);
  const hasExactDepartmentMatch = courses.some((course) => normalizeText(course.department) === interest);

  return {
    hasExactDepartmentMatch,
    recommendations: courses
      .map((course) => scoreCourse(
        course,
        preferences,
        hasExactDepartmentMatch,
        studentEvidenceByCourse.get(course.id) || null
      ))
      .sort((a, b) => {
        if (hasExactDepartmentMatch) {
          const aExact = normalizeText(a.course.department) === interest;
          const bExact = normalizeText(b.course.department) === interest;

          if (aExact !== bExact) {
            return aExact ? -1 : 1;
          }
        }

        return b.score - a.score || a.course.title.localeCompare(b.course.title);
      })
      .slice(0, 5)
  };
};

const readStudentContext = (req) => {
  const user = decodeAuthCookie(req);
  return user?.role === 'student' ? user : null;
};

const readStudentEvidence = async (conn, studentId) => conn.query(`
  SELECT
    c.id AS course_id,
    CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS has_favorite,
    COUNT(r.id) AS student_review_count,
    AVG(r.rating) AS student_average_rating
  FROM Courses c
  LEFT JOIN Favorites f
    ON f.entity_type = "course"
    AND f.entity_id = c.id
    AND f.user_id = ?
  LEFT JOIN Reviews r
    ON r.entity_type = "course"
    AND r.entity_id = c.id
    AND r.user_id = ?
  GROUP BY c.id, f.id
`, [studentId, studentId]);

const buildPersonalization = (student, studentEvidenceRows) => {
  if (!student) {
    return { active: false, signals: [] };
  }

  const hasFavorites = studentEvidenceRows.some((row) => Boolean(row.has_favorite));
  const hasReviewActivity = studentEvidenceRows.some((row) => Number(row.student_review_count || 0) > 0);

  return {
    active: true,
    signals: [
      ...(hasFavorites ? ['Favorites'] : []),
      ...(hasReviewActivity ? ['Your review activity'] : [])
    ]
  };
};

router.post('/recommendations', async (req, res) => {
  const preferences = readAdvisorPreferences(req.body);

  if (!preferences.interestArea || preferences.learningFocus.length === 0 || !preferences.recommendationGoal || !preferences.experienceConfidence) {
    res.status(400).json({
      status: 'error',
      message: 'Interest area, learning focus, recommendation goal, and experience confidence are required'
    });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const student = readStudentContext(req);
    const rows = await conn.query(`
      SELECT
        c.id AS course_id,
        c.title AS course_title,
        c.department AS course_department,
        c.description AS course_description,
        review_stats.average_rating,
        review_stats.review_count,
        t.id AS tutor_id,
        t.name AS tutor_name,
        t.department AS tutor_department
      FROM Courses c
      LEFT JOIN Course_Tutors ct ON ct.course_id = c.id
      LEFT JOIN Tutors t ON t.id = ct.tutor_id
      LEFT JOIN (
        SELECT
          entity_id,
          AVG(rating) AS average_rating,
          COUNT(*) AS review_count
        FROM Reviews r
        WHERE r.entity_type = "course"
        GROUP BY entity_id
      ) review_stats ON review_stats.entity_id = c.id
      ORDER BY c.title ASC, t.name ASC
    `);
    const studentEvidenceRows = student ? await readStudentEvidence(conn, student.id) : [];
    const personalization = buildPersonalization(student, studentEvidenceRows);
    const studentEvidenceByCourse = buildStudentEvidenceByCourse(studentEvidenceRows);

    const { hasExactDepartmentMatch, recommendations } = buildRecommendations(rows, preferences, studentEvidenceByCourse);
    const limitations = [LOCAL_LIMITATION];

    if (!hasExactDepartmentMatch && recommendations.length > 0) {
      limitations.push(WEAK_MATCH_LIMITATION);
    }

    try {
      const groqResult = await rankRecommendationsWithGroq(preferences, recommendations);

      if (groqResult) {
        res.json({
          status: 'ok',
          data: {
            mode: 'ai',
            summary: groqResult.summary,
            personalization,
            limitations: [],
            recommendations: groqResult.recommendations
          }
        });
        return;
      }
    } catch {
      limitations.push('AI ranking is unavailable; showing deterministic local recommendations.');
    }

    res.json({
      status: 'ok',
      data: {
        mode: 'local',
        summary: `Local Course recommendations for ${preferences.interestArea}.`,
        personalization,
        limitations,
        recommendations
      }
    });
  } catch (err) {
    console.error('Advisor recommendation error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to build advisor recommendations' });
  } finally {
    if (conn) conn.release();
  }
});

export default router;
