import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import pool from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || 'development-jwt-secret';
const AUTH_COOKIE_NAME = 'auth_token';

app.use(cors());
app.use(express.json());
app.use(cookieParser());

const requireAdmin = (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ status: 'error', message: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== 'admin') {
      res.status(403).json({ status: 'error', message: 'Admin access required' });
      return;
    }

    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Authentication required' });
  }
};

const decodeAuthCookie = (req) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

const requireStudent = (req, res, next) => {
  const decoded = decodeAuthCookie(req);

  if (!decoded) {
    res.status(401).json({ status: 'error', message: 'Authentication required' });
    return;
  }

  if (decoded.role !== 'student') {
    res.status(403).json({ status: 'error', message: 'Student access required' });
    return;
  }

  req.user = decoded;
  next();
};

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

const SMART_NAV_MAX_INTENT_LENGTH = 500;
const SMART_NAV_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const SMART_NAV_RATE_LIMIT_MAX = 10;
const SMART_NAV_MIN_CONFIDENCE = 0.5;
const SMART_NAV_ALLOWED_ACTIONS = new Set(['NAVIGATE', 'FILTER', 'SEARCH', 'NONE']);
const SMART_NAV_ROUTE_DOMAIN_MAP = new Map([
  ['/', null],
  ['/tutors', 'tutors'],
  ['/courses', 'courses']
]);
const SMART_NAV_ALLOWED_FILTERS = new Set(['search', 'department']);
const smartNavigationRateLimit = new Map();

const SMART_NAVIGATION_SCHEMA = {
  actions: ['NAVIGATE', 'FILTER', 'SEARCH', 'NONE'],
  routeDomainPairs: [
    { route: '/', domain: null },
    { route: '/tutors', domain: 'tutors' },
    { route: '/courses', domain: 'courses' }
  ],
  filters: {
    search: 'string',
    department: 'string'
  },
  responseShape: {
    action: 'NAVIGATE | FILTER | SEARCH | NONE',
    route: '/ | /tutors | /courses | null',
    domain: 'tutors | courses | null (must match the route pair)',
    filters: {
      search: 'optional string',
      department: 'optional string'
    },
    confidence: 'number between 0 and 1',
    reason: 'short string'
  }
};

const noneSmartNavigationCommand = (reason, confidence = 0) => ({
  action: 'NONE',
  route: null,
  domain: null,
  filters: {},
  confidence,
  reason
});

const readSmartNavigationRateLimitKey = (req) => {
  const forwardedFor = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
};

const isSmartNavigationRateLimited = (req) => {
  const key = readSmartNavigationRateLimitKey(req);
  const now = Date.now();
  const existing = smartNavigationRateLimit.get(key) || [];
  const recentRequests = existing.filter((timestamp) => now - timestamp < SMART_NAV_RATE_LIMIT_WINDOW_MS);

  if (recentRequests.length >= SMART_NAV_RATE_LIMIT_MAX) {
    smartNavigationRateLimit.set(key, recentRequests);
    return true;
  }

  recentRequests.push(now);
  smartNavigationRateLimit.set(key, recentRequests);
  return false;
};

const readSmartNavigationIntent = (body) => {
  if (!body || typeof body.intent !== 'string' || body.intent.trim().length === 0) {
    return { error: 'Intent is required' };
  }

  const intent = body.intent.trim();

  if (intent.length > SMART_NAV_MAX_INTENT_LENGTH) {
    return { error: `Intent must be ${SMART_NAV_MAX_INTENT_LENGTH} characters or fewer` };
  }

  return { intent };
};

const sanitizeSmartNavigationFilters = (filters) => {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    return {};
  }

  return Object.entries(filters).reduce((safeFilters, [key, value]) => {
    if (!SMART_NAV_ALLOWED_FILTERS.has(key) || typeof value !== 'string') {
      return safeFilters;
    }

    const safeValue = value.trim().slice(0, 100);

    if (safeValue) {
      safeFilters[key] = safeValue;
    }

    return safeFilters;
  }, {});
};

const sanitizeSmartNavigationCommand = (command) => {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    return noneSmartNavigationCommand('Unsupported navigation command');
  }

  const action = String(command.action || '').trim().toUpperCase();
  const confidence = Math.max(0, Math.min(Number(command.confidence) || 0, 1));

  if (!SMART_NAV_ALLOWED_ACTIONS.has(action)) {
    return noneSmartNavigationCommand('Unsupported navigation command');
  }

  if (action === 'NONE') {
    return noneSmartNavigationCommand(
      typeof command.reason === 'string' && command.reason.trim()
        ? command.reason.trim().slice(0, 160)
        : 'No supported navigation command',
      confidence
    );
  }

  if (confidence < SMART_NAV_MIN_CONFIDENCE) {
    return noneSmartNavigationCommand('Low confidence', confidence);
  }

  const route = typeof command.route === 'string' ? command.route.trim() : '';
  const domain = typeof command.domain === 'string' && command.domain.trim()
    ? command.domain.trim()
    : null;

  if (!SMART_NAV_ROUTE_DOMAIN_MAP.has(route)) {
    return noneSmartNavigationCommand('Unsupported navigation command');
  }

  if (SMART_NAV_ROUTE_DOMAIN_MAP.get(route) !== domain) {
    return noneSmartNavigationCommand('Unsupported navigation command');
  }

  return {
    action,
    route,
    domain,
    filters: sanitizeSmartNavigationFilters(command.filters),
    confidence,
    reason: typeof command.reason === 'string' && command.reason.trim()
      ? command.reason.trim().slice(0, 160)
      : 'Navigation command parsed'
  };
};

const parseGroqSmartNavigationContent = (content) => {
  const rawContent = String(content || '').trim();
  const fencedJson = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return JSON.parse(fencedJson ? fencedJson[1] : rawContent);
};

const requestSmartNavigationCommand = async (intent) => {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;

  if (!apiKey || !model) {
    return noneSmartNavigationCommand('Smart navigation is unavailable');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Parse the user intent into exactly one JSON smart-navigation command. Return JSON only. Use only the provided schema. Do not invent routes, domains, filters, or actions.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            intent,
            schema: SMART_NAVIGATION_SCHEMA
          })
        }
      ]
    })
  });

  if (!response.ok) {
    return noneSmartNavigationCommand('Unable to parse navigation intent');
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  return sanitizeSmartNavigationCommand(parseGroqSmartNavigationContent(content));
};

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

const DIRECTORY_SEARCH_TOKEN_ALIASES = new Map([
  ['it', ['information technology']],
  ['teacher', ['tutor']],
  ['lecturer', ['tutor']],
  ['professor', ['tutor']],
  ['instructor', ['tutor']]
]);

const DIRECTORY_SEARCH_PHRASE_ALIASES = new Map([
  ['cyber security', ['cybersecurity']],
  ['cybersecurity', ['cyber security']],
  ['it security', ['cyber', 'cyber security', 'cybersecurity']]
]);

const normalizeDirectoryText = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const uniqueValues = (values) => [...new Set(values.filter(Boolean))];

const directoryTokenVariants = (token) => {
  const variants = [token];

  if (token.endsWith('ies') && token.length > 3) {
    variants.push(`${token.slice(0, -3)}y`);
  } else if (token.endsWith('s') && token.length > 3) {
    variants.push(token.slice(0, -1));
  } else if (token.endsWith('y') && token.length > 2) {
    variants.push(`${token.slice(0, -1)}ies`);
  } else if (token.length > 2) {
    variants.push(`${token}s`);
  }

  return uniqueValues(variants);
};

const directoryPhraseVariants = (tokens) => {
  const variants = [];

  for (let start = 0; start < tokens.length; start += 1) {
    for (let end = start + 2; end <= tokens.length; end += 1) {
      const phrase = tokens.slice(start, end).join(' ');
      variants.push(phrase, ...(DIRECTORY_SEARCH_PHRASE_ALIASES.get(phrase) || []));
    }
  }

  return uniqueValues(variants);
};

const createDirectorySearchSpec = (search) => {
  const normalized = normalizeDirectoryText(search);

  if (!normalized) {
    return null;
  }

  const tokens = uniqueValues(normalized.split(' '));
  const tokenVariants = uniqueValues(tokens.flatMap(directoryTokenVariants));
  const expandedPhrases = uniqueValues([
    normalized,
    tokens.join(''),
    ...tokenVariants,
    ...directoryPhraseVariants(tokens),
    ...tokenVariants.flatMap((token) => DIRECTORY_SEARCH_TOKEN_ALIASES.get(token) || [])
  ]);

  return {
    normalized,
    tokens,
    phrases: uniqueValues(expandedPhrases),
    compactPhrases: uniqueValues(expandedPhrases.map((phrase) => phrase.replace(/\s+/g, '')))
  };
};

const sqlTextExpression = (fields) => `LOWER(CONCAT_WS(' ', ${fields.join(', ')}))`;
const sqlCompactExpression = (fields) => `LOWER(REGEXP_REPLACE(CONCAT_WS(' ', ${fields.join(', ')}), '[^[:alnum:]]+', ''))`;

const addLikeParams = (params, values) => {
  values.forEach((value) => params.push(`%${value}%`));
};

const buildDirectorySearchCondition = (fieldGroups, searchSpec) => {
  if (!searchSpec) {
    return { clause: '', params: [] };
  }

  const clauses = [];
  const params = [];

  fieldGroups.forEach((fields) => {
    const textExpression = sqlTextExpression(fields);
    const compactExpression = sqlCompactExpression(fields);
    clauses.push(`(${textExpression} LIKE ? OR ${compactExpression} LIKE ?)`);
    params.push(`%${searchSpec.normalized}%`, `%${searchSpec.tokens.join('')}%`);
  });

  searchSpec.phrases.forEach((phrase) => {
    fieldGroups.forEach((fields) => {
      clauses.push(`${sqlTextExpression(fields)} LIKE ?`);
      params.push(`%${phrase}%`);
    });
  });

  searchSpec.compactPhrases.forEach((phrase) => {
    fieldGroups.forEach((fields) => {
      clauses.push(`${sqlCompactExpression(fields)} LIKE ?`);
      params.push(`%${phrase}%`);
    });
  });

  return {
    clause: `(${clauses.join(' OR ')})`,
    params
  };
};

const buildAllTokenExpression = (fields, tokens) => {
  const expression = sqlTextExpression(fields);
  return tokens.map(() => `${expression} LIKE ?`).join(' AND ');
};

const buildAnyTokenExpression = (fields, tokens) => {
  const expression = sqlTextExpression(fields);
  return tokens.map(() => `${expression} LIKE ?`).join(' OR ');
};

const buildTokenMatchScoreExpression = (fields, tokens) => {
  const expression = sqlTextExpression(fields);
  return tokens.map(() => `CASE WHEN ${expression} LIKE ? THEN 1 ELSE 0 END`).join(' + ');
};

const buildSearchRanking = ({ searchSpec, primaryField, codeField = null, prefixFields = [], allKeywordFields = [], fieldPriorityGroups = [], stableFields = [] }) => {
  if (!searchSpec) {
    return { clause: '', params: [] };
  }

  const params = [];
  const cases = [];
  const exactFields = uniqueValues([codeField, primaryField]);
  const prefixMatchFields = uniqueValues([codeField, primaryField, ...prefixFields]);
  const partialKeywordFields = uniqueValues([
    ...allKeywordFields,
    ...fieldPriorityGroups.flat()
  ]);

  exactFields.forEach((field) => {
    cases.push(`WHEN ${sqlTextExpression([field])} = ? THEN 0`);
    params.push(searchSpec.normalized);
  });

  prefixMatchFields.forEach((field) => {
    cases.push(`WHEN ${sqlTextExpression([field])} LIKE ? THEN 1`);
    params.push(`${searchSpec.normalized}%`);
  });

  if (allKeywordFields.length > 0) {
    cases.push(`WHEN ${buildAllTokenExpression(allKeywordFields, searchSpec.tokens)} THEN 2`);
    addLikeParams(params, searchSpec.tokens);
  }

  if (partialKeywordFields.length > 0) {
    cases.push(`WHEN ${buildAnyTokenExpression(partialKeywordFields, searchSpec.tokens)} THEN 3`);
    addLikeParams(params, searchSpec.tokens);
  }

  fieldPriorityGroups.forEach((fields, index) => {
    cases.push(`WHEN ${buildAnyTokenExpression(fields, searchSpec.tokens)} THEN ${4 + index}`);
    addLikeParams(params, searchSpec.tokens);
  });

  const partialScoreClause = partialKeywordFields.length > 0
    ? `, (${buildTokenMatchScoreExpression(partialKeywordFields, searchSpec.tokens)}) DESC`
    : '';

  if (partialKeywordFields.length > 0) {
    addLikeParams(params, searchSpec.tokens);
  }

  return {
    clause: `CASE ${cases.join(' ')} ELSE ${4 + fieldPriorityGroups.length} END ASC${partialScoreClause}, ${stableFields.join(', ')}`,
    params
  };
};

const buildDirectoryOrderClause = (sort, entityAlias, labelField, searchRanking = null) => {
  const labelExpression = `${entityAlias}.${labelField}`;
  const stableOrder = `${labelExpression} ASC, ${entityAlias}.id ASC`;

  if (searchRanking?.clause) {
    const sortTieBreaker = sort === 'recently-active'
      ? `, GREATEST(${entityAlias}.updated_at, COALESCE(review_stats.latest_review_at, ${entityAlias}.updated_at)) DESC`
      : sort === 'best-match'
        ? ', (COALESCE(review_stats.average_rating, 0) * 2) + LOG10(COALESCE(review_stats.review_count, 0) + 1) DESC, COALESCE(review_stats.review_count, 0) DESC'
        : '';

    return `ORDER BY ${searchRanking.clause}${sortTieBreaker}`;
  }

  if (sort === 'best-match') {
    return `ORDER BY (COALESCE(review_stats.average_rating, 0) * 2) + LOG10(COALESCE(review_stats.review_count, 0) + 1) DESC, COALESCE(review_stats.review_count, 0) DESC, ${labelExpression} ASC`;
  }

  if (sort === 'recently-active') {
    return `ORDER BY GREATEST(${entityAlias}.updated_at, COALESCE(review_stats.latest_review_at, ${entityAlias}.updated_at)) DESC, ${labelExpression} ASC`;
  }

  return `ORDER BY ${labelExpression} ASC`;
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

const buildTutorFilters = ({ search, department }) => {
  const clauses = [];
  const params = [];
  const searchSpec = createDirectorySearchSpec(search);

  if (searchSpec) {
    const searchCondition = buildDirectorySearchCondition([
      ['name', 'bio'],
      ['name'],
      ['department'],
      ['bio']
    ], searchSpec);
    clauses.push(searchCondition.clause);
    params.push(...searchCondition.params);
  }

  if (department) {
    clauses.push('department = ?');
    params.push(department);
  }

  return {
    whereClause: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    params,
    searchSpec
  };
};

const buildCourseFilters = ({ search, department }) => {
  const clauses = [];
  const params = [];
  const searchSpec = createDirectorySearchSpec(search);

  if (searchSpec) {
    const courseSearchCondition = buildDirectorySearchCondition([
      ['c.title', 'c.description'],
      ['c.title'],
      ['c.department'],
      ['c.description']
    ], searchSpec);
    const tutorSearchCondition = buildDirectorySearchCondition([
      ['t_search.name']
    ], searchSpec);

    clauses.push(`(${courseSearchCondition.clause} OR EXISTS (
      SELECT 1
      FROM Course_Tutors ct_search
      INNER JOIN Tutors t_search ON t_search.id = ct_search.tutor_id
      WHERE ct_search.course_id = c.id AND ${tutorSearchCondition.clause}
    ))`);
    params.push(...courseSearchCondition.params, ...tutorSearchCondition.params);
  }

  if (department) {
    clauses.push('c.department = ?');
    params.push(department);
  }

  return {
    whereClause: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    params,
    searchSpec
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

const sanitizeReviewComment = (comment) => String(comment || '')
  .trim()
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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

const readDesiredFavoritePayload = (body) => ({
  ...readFavoritePayload(body),
  favorite: body.favorite
});

const readDesiredReviewUpvotePayload = (body) => ({
  upvoted: body.upvoted
});

const normalizeReview = (review) => {
  if (!review) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(review, 'has_upvoted')) {
    return {
      ...review,
      has_upvoted: Boolean(Number(review.has_upvoted))
    };
  }

  return review;
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

const validateDesiredFavoriteRequest = (req, res) => {
  const { entityType, entityId, favorite } = readDesiredFavoritePayload(req.body);

  if (
    !['tutor', 'course'].includes(entityType)
    || !Number.isInteger(entityId)
    || entityId <= 0
    || typeof favorite !== 'boolean'
  ) {
    res.status(400).json({ status: 'error', message: 'Valid entity_type, entity_id, and favorite state are required' });
    return null;
  }

  return { userId: Number(req.user.id), entityType, entityId, favorite };
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

  return normalizeReview(rows[0] || null);
};

const selectFavoriteById = async (conn, favoriteId) => {
  const rows = await conn.query(
    'SELECT id, user_id, entity_type, entity_id FROM Favorites WHERE id = ? LIMIT 1',
    [favoriteId]
  );

  return rows[0] || null;
};

const selectFavoriteTarget = async (conn, entityType, entityId, userId) => {
  if (entityType === 'tutor') {
    const rows = await conn.query(
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
      [userId, entityId]
    );

    return rows[0] ? { ...normalizeFavoriteFields(rows[0]), entity_type: entityType } : null;
  }

  const rows = await conn.query(
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
        CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS has_favorite
      FROM Courses c
      LEFT JOIN Course_Tutors ct ON ct.course_id = c.id
      LEFT JOIN Tutors t ON t.id = ct.tutor_id
      LEFT JOIN Favorites f ON f.entity_type = "course" AND f.entity_id = c.id AND f.user_id = ?
      WHERE c.id = ?
      GROUP BY c.id, c.title, c.department, c.description, c.created_at, c.updated_at, f.id
      LIMIT 1
      `,
    [userId, entityId]
  );

  return rows[0] ? { ...normalizeFavoriteFields(rows[0]), entity_type: entityType } : null;
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/db-test', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT 1 as val');
    res.json({ status: 'ok', data: rows[0] });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/smart-navigation', async (req, res) => {
  const { intent, error } = readSmartNavigationIntent(req.body);

  if (error) {
    res.status(400).json({ status: 'error', message: error });
    return;
  }

  if (isSmartNavigationRateLimited(req)) {
    res.status(429).json({ status: 'error', message: 'Too many smart-navigation requests' });
    return;
  }

  try {
    const command = await requestSmartNavigationCommand(intent);
    res.json({ status: 'ok', data: command });
  } catch (err) {
    res.json({
      status: 'ok',
      data: noneSmartNavigationCommand('Unable to parse navigation intent')
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!username || !email || !password) {
    res.status(400).json({ status: 'error', message: 'Username, email, and password are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const countRows = await conn.query('SELECT COUNT(*) AS user_count FROM Users');
    const userCount = Number(countRows[0]?.user_count || 0);
    const role = userCount === 0 ? 'admin' : 'student';
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await conn.query(
      'INSERT INTO Users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, role]
    );

    res.status(201).json({
      status: 'ok',
      data: {
        id: Number(result.insertId),
        username,
        email,
        role
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ status: 'error', message: 'Username or email already exists' });
      return;
    }

    console.error('Registration error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to register user' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    res.status(400).json({ status: 'error', message: 'Email and password are required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, username, email, password_hash, role FROM Users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];

    if (!user) {
      res.status(401).json({ status: 'error', message: 'Invalid email or password' });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      res.status(401).json({ status: 'error', message: 'Invalid email or password' });
      return;
    }

    const userData = {
      id: Number(user.id),
      username: user.username,
      email: user.email,
      role: user.role
    };
    const token = jwt.sign(
      {
        id: userData.id,
        role: userData.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.json({ status: 'ok', data: userData });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to log in' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/auth/session', async (req, res) => {
  const decoded = decodeAuthCookie(req);

  if (!decoded) {
    res.status(401).json({ status: 'error', message: 'Authentication required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, username, email, role FROM Users WHERE id = ? LIMIT 1',
      [Number(decoded.id)]
    );
    const user = rows[0];

    if (!user) {
      res.status(401).json({ status: 'error', message: 'Authentication required' });
      return;
    }

    res.json({
      status: 'ok',
      data: {
        id: Number(user.id),
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Session restore error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to restore session' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  });
  res.json({ status: 'ok' });
});

app.get('/api/reviews', async (req, res) => {
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

    res.json({ status: 'ok', data: rows.map(normalizeReview) });
  } catch (err) {
    console.error('Reviews query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch reviews' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/reviews', requireStudent, async (req, res) => {
  const { entityType, entityId, rating, comment } = readReviewPayload(req.body);

  if (!['tutor', 'course'].includes(entityType) || !Number.isInteger(entityId) || entityId <= 0) {
    res.status(400).json({ status: 'error', message: 'Valid entity_type and entity_id are required' });
    return;
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment) {
    res.status(400).json({ status: 'error', message: 'Rating from 1 to 5 and comment are required' });
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

app.put('/api/reviews/:id', requireStudent, async (req, res) => {
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

app.delete('/api/reviews/:id', requireStudent, async (req, res) => {
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

app.put('/api/reviews/:id/upvote', requireStudent, async (req, res) => {
  const reviewId = Number(req.params.id);
  const userId = Number(req.user.id);
  const { upvoted } = readDesiredReviewUpvotePayload(req.body);

  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    res.status(400).json({ status: 'error', message: 'Valid review id is required' });
    return;
  }

  if (typeof upvoted !== 'boolean') {
    res.status(400).json({ status: 'error', message: 'Valid upvoted state is required' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const reviewRows = await conn.query(
      'SELECT id FROM Reviews WHERE id = ? LIMIT 1 FOR UPDATE',
      [reviewId]
    );

    if (reviewRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ status: 'error', message: 'Review not found' });
      return;
    }

    const upvoteRows = await conn.query(
      'SELECT review_id FROM Review_Upvotes WHERE review_id = ? AND user_id = ? LIMIT 1',
      [reviewId, userId]
    );
    const hasUpvote = upvoteRows.length > 0;

    if (upvoted && !hasUpvote) {
      await conn.query(
        'INSERT INTO Review_Upvotes (review_id, user_id) VALUES (?, ?)',
        [reviewId, userId]
      );
      await conn.query(
        'UPDATE Reviews SET upvotes = upvotes + 1 WHERE id = ?',
        [reviewId]
      );
    } else if (!upvoted && hasUpvote) {
      await conn.query(
        'DELETE FROM Review_Upvotes WHERE review_id = ? AND user_id = ?',
        [reviewId, userId]
      );
      await conn.query(
        'UPDATE Reviews SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = ?',
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

app.get('/api/users/:id/reviews', requireStudent, async (req, res) => {
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

    res.json({ status: 'ok', data: rows });
  } catch (err) {
    console.error('User review history query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch review history' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/users/:id/favorites', requireStudent, async (req, res) => {
  const userId = validateDashboardUserRequest(req, res);

  if (!userId) {
    return;
  }

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
});

app.post('/api/users/:id/favorites', requireStudent, async (req, res) => {
  const favoriteRequest = validateFavoriteRequest(req, res);

  if (!favoriteRequest) {
    return;
  }

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
});

app.delete('/api/users/:id/favorites', requireStudent, async (req, res) => {
  const favoriteRequest = validateFavoriteRequest(req, res);

  if (!favoriteRequest) {
    return;
  }

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
});

app.put('/api/me/favorite', requireStudent, async (req, res) => {
  const favoriteRequest = validateDesiredFavoriteRequest(req, res);

  if (!favoriteRequest) {
    return;
  }

  const { userId, entityType, entityId, favorite } = favoriteRequest;

  let conn;
  try {
    conn = await pool.getConnection();
    const target = await selectFavoriteTarget(conn, entityType, entityId, userId);

    if (!target) {
      res.status(404).json({ status: 'error', message: 'Favorite target not found' });
      return;
    }

    if (favorite) {
      await conn.query(
        'INSERT INTO Favorites (user_id, entity_type, entity_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
        [userId, entityType, entityId]
      );
    } else {
      await conn.query(
        'DELETE FROM Favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?',
        [userId, entityType, entityId]
      );
    }

    const updatedTarget = await selectFavoriteTarget(conn, entityType, entityId, userId);
    res.json({ status: 'ok', data: updatedTarget });
  } catch (err) {
    console.error('Favorite desired-state error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to update favorite' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/tutors', async (req, res) => {
  const viewer = decodeAuthCookie(req);
  const isStudent = viewer?.role === 'student';
  const { whereClause, params, searchSpec } = buildTutorFilters(readDirectoryFilters(req.query));
  const pagination = readPagination(req.query);
  const sort = readDirectorySort(req.query);
  const paginationClause = pagination.isPaginated ? ' LIMIT ? OFFSET ?' : '';
  const paginationParams = pagination.isPaginated ? [pagination.limit, pagination.offset] : [];
  const needsReviewStats = sort !== 'alphabetical';
  const reviewStatsJoin = needsReviewStats ? buildReviewStatsJoin('tutor', 't') : '';
  const searchRanking = buildSearchRanking({
    searchSpec,
    primaryField: 't.name',
    prefixFields: ['t.department'],
    allKeywordFields: ['t.name', 't.department', 't.bio'],
    fieldPriorityGroups: [
      ['t.name'],
      ['t.department'],
      ['t.bio']
    ],
    stableFields: ['t.name ASC', 't.id ASC']
  });
  const orderClause = buildDirectoryOrderClause(sort, 't', 'name', searchRanking);
  const orderParams = searchRanking.params || [];

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
      rows = await conn.query(sql, [Number(viewer.id), ...params, ...orderParams, ...paginationParams]);
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
      const queryParams = [...params, ...orderParams, ...paginationParams];
      rows = queryParams.length > 0
        ? await conn.query(sql, queryParams)
        : await conn.query(sql);
    } else {
      const sql = searchSpec
        ? `SELECT t.id, t.name, t.department, t.bio, t.created_at, t.updated_at FROM Tutors t${whereClause} ${orderClause}${paginationClause}`
        : `SELECT id, name, department, bio, created_at, updated_at FROM Tutors${whereClause} ${orderClause.replaceAll('t.', '')}${paginationClause}`;
      const queryParams = [...params, ...orderParams, ...paginationParams];
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

app.get('/api/tutors/:id', async (req, res) => {
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

app.post('/api/tutors', requireAdmin, async (req, res) => {
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

app.put('/api/tutors/:id', requireAdmin, async (req, res) => {
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

app.delete('/api/tutors/:id', requireAdmin, async (req, res) => {
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

app.get('/api/courses', async (req, res) => {
  const viewer = decodeAuthCookie(req);
  const isStudent = viewer?.role === 'student';
  const { whereClause, params, searchSpec } = buildCourseFilters(readDirectoryFilters(req.query));
  const pagination = readPagination(req.query);
  const sort = readDirectorySort(req.query);
  const paginationClause = pagination.isPaginated ? ' LIMIT ? OFFSET ?' : '';
  const paginationParams = pagination.isPaginated ? [pagination.limit, pagination.offset] : [];
  const needsReviewStats = sort !== 'alphabetical';
  const reviewStatsJoin = needsReviewStats ? buildReviewStatsJoin('course', 'c') : '';
  const searchRanking = buildSearchRanking({
    searchSpec,
    primaryField: 'c.title',
    codeField: 'SUBSTRING_INDEX(c.title, " ", 1)',
    prefixFields: ['c.department'],
    allKeywordFields: ['c.title', 'c.department', 'c.description'],
    fieldPriorityGroups: [
      ['c.title'],
      ['c.department'],
      ['c.description'],
      ['tutor_names']
    ],
    stableFields: ['c.title ASC', 'c.id ASC']
  });
  const orderClause = buildDirectoryOrderClause(sort, 'c', 'title', searchRanking);
  const orderParams = searchRanking.params || [];
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
      rows = await conn.query(sql, [Number(viewer.id), ...params, ...orderParams, ...paginationParams]);
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
        COALESCE(GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', '), '') AS tutor_names
      FROM Courses c
      LEFT JOIN Course_Tutors ct ON ct.course_id = c.id
      LEFT JOIN Tutors t ON t.id = ct.tutor_id
      ${reviewStatsJoin}
      ${whereClause}
      GROUP BY c.id, c.title, c.department, c.description, c.created_at, c.updated_at${reviewStatsGroupFields}
      ${orderClause}
      ${paginationClause}
    `;
      const queryParams = [...params, ...orderParams, ...paginationParams];
      rows = queryParams.length > 0
        ? await conn.query(sql, queryParams)
        : await conn.query(sql);
    }

    res.json({ status: 'ok', data: rows.map(normalizeFavoriteFields), total });
  } catch (err) {
    console.error('Courses query error:', err);
    res.status(500).json({ status: 'error', message: 'Unable to fetch courses' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/courses/:id', async (req, res) => {
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

app.post('/api/courses', requireAdmin, async (req, res) => {
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

app.put('/api/courses/:id', requireAdmin, async (req, res) => {
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

app.delete('/api/courses/:id', requireAdmin, async (req, res) => {
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

if (process.env.NODE_ENV !== 'test') {
  pool.getConnection()
    .then(conn => {
      console.log('Database connected successfully');
      conn.release();
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch(err => {
      console.error('Failed to connect to the database on startup:', err);
      // Graceful handling: log the error but don't necessarily kill the app if it can still serve some requests
      // However, for many apps, DB failure is fatal. Given "gracefully", I'll just log and still start if possible, 
      // or start the server anyway so /api/health works.
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT} (Database connection failed)`);
      });
    });
}

export default app;
