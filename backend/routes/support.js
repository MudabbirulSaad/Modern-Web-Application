const readTutorPayload = (body) => ({
  name: String(body.name || '').trim(),
  department: String(body.department || '').trim(),
  bio: String(body.bio || '').trim()
});

const normalizeTutorIdentity = (value) => String(value || '').trim().toLowerCase();

const TUTOR_DUPLICATE_MESSAGE = 'A tutor with this name and department already exists';

const isTutorDuplicateError = (err) => (
  Number(err?.errno) === 1062
  || err?.code === 'ER_DUP_ENTRY'
  || String(err?.message || '').includes('uniq_tutors_normalized_identity')
);

const hasDuplicateTutor = async (conn, { name, department }, exceptTutorId = null) => {
  const normalizedName = normalizeTutorIdentity(name);
  const normalizedDepartment = normalizeTutorIdentity(department);

  if (exceptTutorId === null) {
    const rows = await conn.query(
      'SELECT id FROM Tutors WHERE LOWER(TRIM(name)) = ? AND LOWER(TRIM(department)) = ? LIMIT 1',
      [normalizedName, normalizedDepartment]
    );

    return rows.length > 0;
  }

  const rows = await conn.query(
    'SELECT id FROM Tutors WHERE LOWER(TRIM(name)) = ? AND LOWER(TRIM(department)) = ? AND id <> ? LIMIT 1',
    [normalizedName, normalizedDepartment, exceptTutorId]
  );

  return rows.length > 0;
};

const readCoursePayload = (body) => ({
  title: String(body.title || '').trim(),
  department: String(body.department || '').trim(),
  description: String(body.description || '').trim(),
  tutorIds: [...new Set(
    (Array.isArray(body.tutorIds) ? body.tutorIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )]
});

const normalizeCourseIdentity = (value) => String(value || '').trim().toLowerCase();

const COURSE_DUPLICATE_MESSAGE = 'A course with this title and department already exists';

const isCourseDuplicateError = (err) => (
  Number(err?.errno) === 1062
  || err?.code === 'ER_DUP_ENTRY'
  || String(err?.message || '').includes('uniq_courses_normalized_identity')
);

const hasDuplicateCourse = async (conn, { title, department }, exceptCourseId = null) => {
  const normalizedTitle = normalizeCourseIdentity(title);
  const normalizedDepartment = normalizeCourseIdentity(department);

  if (exceptCourseId === null) {
    const rows = await conn.query(
      'SELECT id FROM Courses WHERE LOWER(TRIM(title)) = ? AND LOWER(TRIM(department)) = ? LIMIT 1',
      [normalizedTitle, normalizedDepartment]
    );

    return rows.length > 0;
  }

  const rows = await conn.query(
    'SELECT id FROM Courses WHERE LOWER(TRIM(title)) = ? AND LOWER(TRIM(department)) = ? AND id <> ? LIMIT 1',
    [normalizedTitle, normalizedDepartment, exceptCourseId]
  );

  return rows.length > 0;
};

const readDirectoryFilters = (query) => ({
  search: String(query.search || '').trim(),
  department: String(query.department || '').trim()
});

const readPagination = (query) => {
  const hasPage = Object.prototype.hasOwnProperty.call(query, 'page');
  const hasLimit = Object.prototype.hasOwnProperty.call(query, 'limit');

  if (!hasPage && !hasLimit) {
    return { page: 1, limit: null, offset: 0, isPaginated: false };
  }

  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 9, 1), 50);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    isPaginated: true
  };
};

const readTotalCount = (rows) => Number(rows?.[0]?.total || 0);

const readDirectorySort = (query) => {
  const sort = String(query.sort || '').trim().toLowerCase();

  if (['best-match', 'best_match', 'best'].includes(sort)) {
    return 'best-match';
  }

  if (['recently-active', 'recently_active', 'recent'].includes(sort)) {
    return 'recently-active';
  }

  return 'alphabetical';
};

const buildReviewStatsJoin = (entityType, entityAlias) => `
      LEFT JOIN (
        SELECT
          entity_id,
          AVG(rating) AS average_rating,
          COUNT(*) AS review_count,
          MAX(created_at) AS latest_review_at
        FROM Reviews
        WHERE entity_type = "${entityType}"
        GROUP BY entity_id
      ) review_stats ON review_stats.entity_id = ${entityAlias}.id`;

const buildDirectoryOrderClause = (sort, entityAlias, labelField) => {
  if (sort === 'best-match') {
    return `ORDER BY (COALESCE(review_stats.average_rating, 0) * 2) + LOG10(COALESCE(review_stats.review_count, 0) + 1) DESC, COALESCE(review_stats.review_count, 0) DESC, ${entityAlias}.${labelField} ASC`;
  }

  if (sort === 'recently-active') {
    return `ORDER BY GREATEST(${entityAlias}.updated_at, COALESCE(review_stats.latest_review_at, ${entityAlias}.updated_at)) DESC, ${entityAlias}.${labelField} ASC`;
  }

  return `ORDER BY ${entityAlias}.${labelField} ASC`;
};

const buildTutorFilters = ({ search, department }) => {
  const clauses = [];
  const params = [];

  if (search) {
    clauses.push('(name LIKE ? OR bio LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (department) {
    clauses.push('department = ?');
    params.push(department);
  }

  return {
    whereClause: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    params
  };
};

const buildCourseFilters = ({ search, department }) => {
  const clauses = [];
  const params = [];

  if (search) {
    clauses.push(`(c.title LIKE ? OR c.description LIKE ? OR EXISTS (
      SELECT 1
      FROM Course_Tutors ct_search
      INNER JOIN Tutors t_search ON t_search.id = ct_search.tutor_id
      WHERE ct_search.course_id = c.id AND t_search.name LIKE ?
    ))`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (department) {
    clauses.push('c.department = ?');
    params.push(department);
  }

  return {
    whereClause: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    params
  };
};

const selectCourseById = async (conn, courseId, viewerId = null) => {
  const hasViewer = Number.isInteger(Number(viewerId)) && Number(viewerId) > 0;
  const favoriteSelect = hasViewer
    ? ', CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS has_favorite'
    : '';
  const favoriteJoin = hasViewer
    ? 'LEFT JOIN Favorites f ON f.entity_type = "course" AND f.entity_id = c.id AND f.user_id = ?'
    : '';
  const params = hasViewer ? [Number(viewerId), courseId] : [courseId];
  const courseRows = hasViewer
    ? await conn.query(
      `
      SELECT
        c.id,
        c.title,
        c.department,
        c.description,
        c.created_at,
        c.updated_at
        ${favoriteSelect}
      FROM Courses c
      ${favoriteJoin}
      WHERE c.id = ?
      LIMIT 1
      `,
      params
    )
    : await conn.query(
      'SELECT id, title, department, description, created_at, updated_at FROM Courses WHERE id = ? LIMIT 1',
      [courseId]
    );

  if (courseRows.length === 0) {
    return null;
  }

  const tutorRows = await conn.query(
    `
      SELECT
        t.id,
        t.name,
        t.department,
        t.bio
      FROM Course_Tutors ct
      INNER JOIN Tutors t ON t.id = ct.tutor_id
      WHERE ct.course_id = ?
      ORDER BY t.name ASC
      `,
    [courseId]
  );

  return { ...normalizeFavoriteFields(courseRows[0]), tutors: tutorRows };
};

const insertCourseTutors = async (conn, courseId, tutorIds) => {
  if (tutorIds.length === 0) {
    return;
  }

  const placeholders = tutorIds.map(() => '(?, ?)').join(', ');
  const values = tutorIds.flatMap((tutorId) => [courseId, tutorId]);

  await conn.query(
    `INSERT INTO Course_Tutors (course_id, tutor_id) VALUES ${placeholders}`,
    values
  );
};

const REVIEW_COMMENT_MAX_LENGTH = 1000;

const sanitizeReviewComment = (comment) => String(comment || '')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<[^>]*>/g, '')
  .trim();

const readReviewPayload = (body) => ({
  entityType: String(body.entity_type || '').trim().toLowerCase(),
  entityId: Number(body.entity_id),
  rating: Number(body.rating),
  comment: sanitizeReviewComment(body.comment)
});

const readFavoritePayload = (body) => ({
  entityType: String(body.entity_type || '').trim().toLowerCase(),
  entityId: Number(body.entity_id)
});

const normalizeReview = (review, viewerId = null) => {
  if (!review) {
    return null;
  }

  const normalized = {
    ...review,
    can_manage: Number.isInteger(Number(viewerId)) && Number(viewerId) > 0
      ? Number(review.user_id) === Number(viewerId)
      : false
  };

  if (Object.prototype.hasOwnProperty.call(review, 'has_upvoted')) {
    return {
      ...normalized,
      has_upvoted: Boolean(Number(review.has_upvoted))
    };
  }

  return normalized;
};

const normalizeFavoriteFields = (row) => {
  if (!row) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(row, 'has_favorite')) {
    return {
      ...row,
      has_favorite: Boolean(Number(row.has_favorite))
    };
  }

  return row;
};

const validateFavoriteRequest = (req, res) => {
  const requestedUserId = Number(req.params.id);

  if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) {
    res.status(400).json({ status: 'error', message: 'Valid user id is required' });
    return null;
  }

  if (requestedUserId !== Number(req.user.id)) {
    res.status(403).json({ status: 'error', message: 'Cannot manage favorites for another user' });
    return null;
  }

  const { entityType, entityId } = readFavoritePayload(req.body);

  if (!['tutor', 'course'].includes(entityType) || !Number.isInteger(entityId) || entityId <= 0) {
    res.status(400).json({ status: 'error', message: 'Valid entity_type and entity_id are required' });
    return null;
  }

  return { userId: requestedUserId, entityType, entityId };
};

const validateCurrentFavoriteRequest = (req, res) => {
  const { entityType, entityId } = readFavoritePayload(req.body);

  if (!['tutor', 'course'].includes(entityType) || !Number.isInteger(entityId) || entityId <= 0) {
    res.status(400).json({ status: 'error', message: 'Valid entity_type and entity_id are required' });
    return null;
  }

  return { userId: Number(req.user.id), entityType, entityId };
};

const validateDashboardUserRequest = (req, res) => {
  const requestedUserId = Number(req.params.id);

  if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) {
    res.status(400).json({ status: 'error', message: 'Valid user id is required' });
    return null;
  }

  if (requestedUserId !== Number(req.user.id)) {
    res.status(403).json({ status: 'error', message: 'Cannot access another user dashboard' });
    return null;
  }

  return requestedUserId;
};

const selectReviewById = async (conn, reviewId, viewerId = null) => {
  const hasViewer = Number.isInteger(Number(viewerId)) && Number(viewerId) > 0;
  const upvoteSelect = hasViewer
    ? ', CASE WHEN ru.user_id IS NULL THEN 0 ELSE 1 END AS has_upvoted'
    : '';
  const upvoteJoin = hasViewer
    ? 'LEFT JOIN Review_Upvotes ru ON ru.review_id = r.id AND ru.user_id = ?'
    : '';
  const params = hasViewer ? [Number(viewerId), reviewId] : [reviewId];
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
      WHERE r.id = ?
      LIMIT 1
      `,
    params
  );

  return normalizeReview(rows[0] || null, hasViewer ? Number(viewerId) : null);
};

const selectFavoriteById = async (conn, favoriteId) => {
  const rows = await conn.query(
    'SELECT id, user_id, entity_type, entity_id FROM Favorites WHERE id = ? LIMIT 1',
    [favoriteId]
  );

  return rows[0] || null;
};

export {
  TUTOR_DUPLICATE_MESSAGE,
  isTutorDuplicateError,
  hasDuplicateTutor,
  readTutorPayload,
  COURSE_DUPLICATE_MESSAGE,
  isCourseDuplicateError,
  hasDuplicateCourse,
  readCoursePayload,
  readDirectoryFilters,
  readPagination,
  readTotalCount,
  readDirectorySort,
  buildReviewStatsJoin,
  buildDirectoryOrderClause,
  buildTutorFilters,
  buildCourseFilters,
  selectCourseById,
  insertCourseTutors,
  REVIEW_COMMENT_MAX_LENGTH,
  sanitizeReviewComment,
  readReviewPayload,
  normalizeReview,
  normalizeFavoriteFields,
  validateCurrentFavoriteRequest,
  validateFavoriteRequest,
  validateDashboardUserRequest,
  selectReviewById,
  selectFavoriteById
};
