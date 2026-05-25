const AUTH_COOKIE_NAME = 'auth_token';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const SMART_NAV_MAX_INTENT_LENGTH = 500;
const SMART_NAV_MIN_CONFIDENCE = 0.5;
const SMART_ASK_MIN_CONFIDENCE = 0.55;
const SMART_ASK_CONTEXT_LIMIT = 3;

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    ...headers
  }
});

const ok = (data = null, status = 200, headers = {}) => json(data === null ? { status: 'ok' } : { status: 'ok', data }, status, headers);
const error = (message, status = 500) => json({ status: 'error', message }, status);

const parseBody = async (request) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return {};
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
};

const parseCookies = (request) => Object.fromEntries(
  (request.headers.get('cookie') || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const index = item.indexOf('=');
      return index === -1 ? [item, ''] : [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
    })
);

const base64UrlEncode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const base64UrlEncodeJson = (value) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
const base64UrlDecodeJson = (value) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), (char) => char.charCodeAt(0))));

const importHmacKey = (secret) => crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify']
);

const signJwt = async (payload, secret) => {
  const header = base64UrlEncodeJson({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncodeJson({ ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS });
  const signingInput = `${header}.${body}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(signature)}`;
};

const verifyJwt = async (token, secret) => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const key = await importHmacKey(secret);
  const signatureBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(signature.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(`${header}.${body}`));
  if (!valid) return null;
  const payload = base64UrlDecodeJson(body);
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
};

const hashPassword = async (password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  return `pbkdf2$100000$${base64UrlEncode(salt)}$${base64UrlEncode(bits)}`;
};

const verifyPassword = async (password, stored) => {
  const [scheme, iterationsRaw, saltRaw, hashRaw] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2') return false;
  const salt = Uint8Array.from(atob(saltRaw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(saltRaw.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
  const expected = Uint8Array.from(atob(hashRaw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(hashRaw.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: Number(iterationsRaw), hash: 'SHA-256' }, keyMaterial, 256);
  const actual = new Uint8Array(bits);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
};

const authUser = async (request, env) => verifyJwt(parseCookies(request)[AUTH_COOKIE_NAME], env.JWT_SECRET);
const requireRole = async (request, env, role) => {
  const user = await authUser(request, env);
  if (!user) return { response: error('Authentication required', 401) };
  if (user.role !== role) return { response: error(`${role[0].toUpperCase()}${role.slice(1)} access required`, 403) };
  return { user };
};

const one = async (db, sql, params = []) => db.prepare(sql).bind(...params).first();
const all = async (db, sql, params = []) => (await db.prepare(sql).bind(...params).all()).results || [];
const run = async (db, sql, params = []) => db.prepare(sql).bind(...params).run();

const normalizeBoolFields = (row) => {
  if (!row) return row;
  const copy = { ...row };
  if ('has_favorite' in copy) copy.has_favorite = Boolean(Number(copy.has_favorite));
  if ('has_upvoted' in copy) copy.has_upvoted = Boolean(Number(copy.has_upvoted));
  return copy;
};

const sanitizeHtml = (value) => String(value || '').trim()
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const like = (value) => `%${String(value || '').trim().toLowerCase()}%`;
const pagination = (searchParams) => {
  if (!searchParams.has('page') && !searchParams.has('limit')) return { clause: '', params: [] };
  const page = Math.max(Number.parseInt(searchParams.get('page'), 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit'), 10) || 9, 1), 50);
  return { clause: ' LIMIT ? OFFSET ?', params: [limit, (page - 1) * limit] };
};

const directoryWhere = (searchParams, fields, alias = '') => {
  const clauses = [];
  const params = [];
  const search = String(searchParams.get('search') || '').trim();
  const department = String(searchParams.get('department') || '').trim();
  if (search) {
    clauses.push(`(${fields.map((field) => `LOWER(${field}) LIKE ?`).join(' OR ')})`);
    params.push(...fields.map(() => like(search)));
  }
  if (department) {
    clauses.push(`${alias}department = ?`);
    params.push(department);
  }
  return { clause: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
};

const courseWithTutors = async (db, courseId, viewerId = null) => {
  const course = viewerId
    ? await one(db, `SELECT c.*, CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS has_favorite FROM Courses c LEFT JOIN Favorites f ON f.entity_type = 'course' AND f.entity_id = c.id AND f.user_id = ? WHERE c.id = ? LIMIT 1`, [viewerId, courseId])
    : await one(db, 'SELECT * FROM Courses WHERE id = ? LIMIT 1', [courseId]);
  if (!course) return null;
  const tutors = await all(db, `SELECT t.id, t.name, t.department, t.bio FROM Course_Tutors ct INNER JOIN Tutors t ON t.id = ct.tutor_id WHERE ct.course_id = ? ORDER BY t.name ASC`, [courseId]);
  return normalizeBoolFields({ ...course, tutors });
};

const courseRows = async (db, where, viewerId = null, page = { clause: '', params: [] }) => {
  const rows = await all(db, `
+    SELECT c.*, COALESCE(GROUP_CONCAT(t.id), '') AS tutor_ids, COALESCE(GROUP_CONCAT(t.name), '') AS tutor_names${viewerId ? ", CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS has_favorite" : ''}
+    FROM Courses c
+    LEFT JOIN Course_Tutors ct ON ct.course_id = c.id
+    LEFT JOIN Tutors t ON t.id = ct.tutor_id
+    ${viewerId ? "LEFT JOIN Favorites f ON f.entity_type = 'course' AND f.entity_id = c.id AND f.user_id = ?" : ''}
+    ${where.clause}
+    GROUP BY c.id${viewerId ? ', f.id' : ''}
+    ORDER BY c.title ASC${page.clause}
+  `.replace(/^\+/gm, ''), [...(viewerId ? [viewerId] : []), ...where.params, ...page.params]);
  return rows.map(normalizeBoolFields);
};

const readJsonPayload = (body, keys) => Object.fromEntries(keys.map((key) => [key, String(body[key] || '').trim()]));

const smartUnavailable = (reason) => ({ action: 'NONE', route: null, domain: null, filters: {}, confidence: 0, reason });
const smartAskEmpty = (feedback, closestMatches = { courses: [], tutors: [] }) => ({ type: 'FEEDBACK', answer: '', confidence: 0, feedback, citations: { courses: [], tutors: [] }, closestMatches });

const groqJson = async (env, messages) => {
  if (!env.GROQ_API_KEY || !env.GROQ_MODEL) return null;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.GROQ_MODEL, temperature: 0, response_format: { type: 'json_object' }, messages })
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const content = String(payload?.choices?.[0]?.message?.content || '').trim();
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return JSON.parse(fenced ? fenced[1] : content);
};

const handleSmartNavigation = async (body, env) => {
  const intent = String(body.intent || '').trim();
  if (!intent) return error('Intent is required', 400);
  if (intent.length > SMART_NAV_MAX_INTENT_LENGTH) return error(`Intent must be ${SMART_NAV_MAX_INTENT_LENGTH} characters or fewer`, 400);
  try {
    const parsed = await groqJson(env, [
      { role: 'system', content: 'Parse the user intent into one JSON command with action NAVIGATE, FILTER, SEARCH, or NONE; route /, /tutors, /courses, or null; domain tutors, courses, or null; filters search and department; confidence 0..1; reason. Return JSON only.' },
      { role: 'user', content: intent }
    ]);
    if (!parsed || Number(parsed.confidence || 0) < SMART_NAV_MIN_CONFIDENCE) return ok(smartUnavailable('Low confidence'));
    const route = ['/', '/tutors', '/courses'].includes(parsed.route) ? parsed.route : null;
    const domain = route === '/tutors' ? 'tutors' : route === '/courses' ? 'courses' : null;
    return ok({ action: String(parsed.action || 'NONE').toUpperCase(), route, domain, filters: parsed.filters || {}, confidence: Number(parsed.confidence || 0), reason: String(parsed.reason || 'Parsed') });
  } catch {
    return ok(smartUnavailable('Unable to parse navigation intent'));
  }
};

const handleSmartAsk = async (db, body, env) => {
  const question = String(body.question || '').trim();
  if (!question) return error('Question is required', 400);
  const search = like(question);
  const courses = await all(db, `SELECT c.id, 'course' AS kind, c.title, c.department, c.description, COALESCE(GROUP_CONCAT(t.name), '') AS tutor_names FROM Courses c LEFT JOIN Course_Tutors ct ON ct.course_id = c.id LEFT JOIN Tutors t ON t.id = ct.tutor_id WHERE LOWER(c.title) LIKE ? OR LOWER(c.department) LIKE ? OR LOWER(c.description) LIKE ? OR LOWER(t.name) LIKE ? GROUP BY c.id ORDER BY c.title LIMIT ?`, [search, search, search, search, SMART_ASK_CONTEXT_LIMIT]);
  const tutors = await all(db, `SELECT id, 'tutor' AS kind, name, department, bio FROM Tutors WHERE LOWER(name) LIKE ? OR LOWER(department) LIKE ? OR LOWER(bio) LIKE ? ORDER BY name LIMIT ?`, [search, search, search, SMART_ASK_CONTEXT_LIMIT]);
  const context = { courses, tutors };
  if (!courses.length && !tutors.length) return ok({ type: 'CLOSEST_MATCHES', answer: '', confidence: 0, feedback: 'I found related directory matches, but not enough evidence to answer.', citations: { courses: [], tutors: [] }, closestMatches: context });
  try {
    const parsed = await groqJson(env, [
      { role: 'system', content: 'Answer only from the provided course and tutor rows. Return JSON with answer, confidence, supported, citations: {courses: number[], tutors: number[]}.' },
      { role: 'user', content: JSON.stringify({ question, directoryRows: context }) }
    ]);
    if (!parsed || Number(parsed.confidence || 0) < SMART_ASK_MIN_CONFIDENCE || parsed.supported === false) return ok({ type: 'CLOSEST_MATCHES', answer: '', confidence: Number(parsed?.confidence || 0), feedback: 'I found related directory matches, but not enough evidence to answer.', citations: { courses: [], tutors: [] }, closestMatches: context });
    const courseIds = new Set((parsed.citations?.courses || []).map(Number));
    const tutorIds = new Set((parsed.citations?.tutors || []).map(Number));
    return ok({ type: 'ANSWER', answer: String(parsed.answer || '').slice(0, 900), confidence: Number(parsed.confidence || 0), feedback: '', citations: { courses: courses.filter((row) => courseIds.has(Number(row.id))), tutors: tutors.filter((row) => tutorIds.has(Number(row.id))) }, closestMatches: { courses: [], tutors: [] } });
  } catch {
    return ok(smartAskEmpty('Grounded answers are unavailable.', context));
  }
};

const route = (pathname) => pathname.replace(/^\/api/, '') || '/';

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const path = route(url.pathname);
  const method = request.method;
  const body = await parseBody(request);

  try {
    if (!db) return error('Database binding is not configured', 500);
    if (method === 'GET' && path === '/health') return ok({ status: 'ok' });
    if (method === 'GET' && path === '/db-test') return ok(await one(db, 'SELECT 1 AS val'));
    if (method === 'POST' && path === '/smart-navigation') return handleSmartNavigation(body, env);
    if (method === 'POST' && path === '/smart-navigation/ask') return handleSmartAsk(db, body, env);

    if (method === 'POST' && path === '/auth/register') {
      const username = String(body.username || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!username || !email || !password) return error('Username, email, and password are required', 400);
      const count = await one(db, 'SELECT COUNT(*) AS user_count FROM Users');
      const role = Number(count?.user_count || 0) === 0 ? 'admin' : 'student';
      const passwordHash = await hashPassword(password);
      try {
        const result = await run(db, 'INSERT INTO Users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', [username, email, passwordHash, role]);
        return ok({ id: result.meta.last_row_id, username, email, role }, 201);
      } catch {
        return error('Username or email already exists', 409);
      }
    }

    if (method === 'POST' && path === '/auth/login') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email || !password) return error('Email and password are required', 400);
      const user = await one(db, 'SELECT id, username, email, password_hash, role FROM Users WHERE email = ? LIMIT 1', [email]);
      if (!user || !(await verifyPassword(password, user.password_hash))) return error('Invalid email or password', 401);
      const userData = { id: Number(user.id), username: user.username, email: user.email, role: user.role };
      const token = await signJwt({ id: userData.id, role: userData.role }, env.JWT_SECRET);
      return ok(userData, 200, { 'set-cookie': `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${TOKEN_TTL_SECONDS}` });
    }

    if (method === 'GET' && path === '/auth/session') {
      const decoded = await authUser(request, env);
      if (!decoded) return error('Authentication required', 401);
      const user = await one(db, 'SELECT id, username, email, role FROM Users WHERE id = ? LIMIT 1', [Number(decoded.id)]);
      if (!user) return error('Authentication required', 401);
      return ok({ id: Number(user.id), username: user.username, email: user.email, role: user.role });
    }

    if (method === 'POST' && path === '/auth/logout') {
      return ok(null, 200, { 'set-cookie': `${AUTH_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0` });
    }

    if (method === 'GET' && path === '/tutors') {
      const viewer = await authUser(request, env);
      const where = directoryWhere(url.searchParams, ['name', 'department', 'bio']);
      const page = pagination(url.searchParams);
      const total = await one(db, `SELECT COUNT(*) AS total FROM Tutors${where.clause}`, where.params);
      const rows = viewer?.role === 'student'
        ? await all(db, `SELECT t.*, CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS has_favorite FROM Tutors t LEFT JOIN Favorites f ON f.entity_type = 'tutor' AND f.entity_id = t.id AND f.user_id = ?${where.clause ? where.clause.replace(' WHERE ', ' WHERE ') : ''} ORDER BY t.name ASC${page.clause}`, [Number(viewer.id), ...where.params, ...page.params])
        : await all(db, `SELECT * FROM Tutors${where.clause} ORDER BY name ASC${page.clause}`, [...where.params, ...page.params]);
      return json({ status: 'ok', data: rows.map(normalizeBoolFields), total: Number(total?.total || 0) });
    }

    const tutorId = path.match(/^\/tutors\/(\d+)$/)?.[1];
    if (tutorId && method === 'GET') {
      const viewer = await authUser(request, env);
      const row = viewer?.role === 'student'
        ? await one(db, `SELECT t.*, CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS has_favorite FROM Tutors t LEFT JOIN Favorites f ON f.entity_type = 'tutor' AND f.entity_id = t.id AND f.user_id = ? WHERE t.id = ? LIMIT 1`, [Number(viewer.id), tutorId])
        : await one(db, 'SELECT * FROM Tutors WHERE id = ? LIMIT 1', [tutorId]);
      return row ? ok(normalizeBoolFields(row)) : error('Tutor not found', 404);
    }

    if (method === 'POST' && path === '/tutors') {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const { name, department, bio } = readJsonPayload(body, ['name', 'department', 'bio']);
      if (!name || !department || !bio) return error('Name, department, and bio are required', 400);
      try {
        const result = await run(db, 'INSERT INTO Tutors (name, department, bio) VALUES (?, ?, ?)', [name, department, bio]);
        return ok(await one(db, 'SELECT * FROM Tutors WHERE id = ?', [result.meta.last_row_id]), 201);
      } catch {
        return error('A tutor with this name and department already exists', 400);
      }
    }

    if (tutorId && method === 'PUT') {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const { name, department, bio } = readJsonPayload(body, ['name', 'department', 'bio']);
      if (!name || !department || !bio) return error('Name, department, and bio are required', 400);
      const result = await run(db, 'UPDATE Tutors SET name = ?, department = ?, bio = ? WHERE id = ?', [name, department, bio, tutorId]);
      if (!result.meta.changes) return error('Tutor not found', 404);
      return ok(await one(db, 'SELECT * FROM Tutors WHERE id = ?', [tutorId]));
    }

    if (tutorId && method === 'DELETE') {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const result = await run(db, 'DELETE FROM Tutors WHERE id = ?', [tutorId]);
      return result.meta.changes ? ok(null) : error('Tutor not found', 404);
    }

    if (method === 'GET' && path === '/courses') {
      const viewer = await authUser(request, env);
      const where = directoryWhere(url.searchParams, ['c.title', 'c.department', 'c.description', 't.name'], 'c.');
      const page = pagination(url.searchParams);
      const total = await one(db, `SELECT COUNT(DISTINCT c.id) AS total FROM Courses c LEFT JOIN Course_Tutors ct ON ct.course_id = c.id LEFT JOIN Tutors t ON t.id = ct.tutor_id${where.clause}`, where.params);
      const rows = await courseRows(db, where, viewer?.role === 'student' ? Number(viewer.id) : null, page);
      return json({ status: 'ok', data: rows, total: Number(total?.total || 0) });
    }

    const courseId = path.match(/^\/courses\/(\d+)$/)?.[1];
    if (courseId && method === 'GET') {
      const viewer = await authUser(request, env);
      const course = await courseWithTutors(db, courseId, viewer?.role === 'student' ? Number(viewer.id) : null);
      return course ? ok(course) : error('Course not found', 404);
    }

    if (method === 'POST' && path === '/courses') {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const { title, department, description } = readJsonPayload(body, ['title', 'department', 'description']);
      const tutorIds = [...new Set((Array.isArray(body.tutorIds) ? body.tutorIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
      if (!title || !department || !description) return error('Title, department, and description are required', 400);
      try {
        const result = await run(db, 'INSERT INTO Courses (title, department, description) VALUES (?, ?, ?)', [title, department, description]);
        await Promise.all(tutorIds.map((id) => run(db, 'INSERT OR IGNORE INTO Course_Tutors (course_id, tutor_id) VALUES (?, ?)', [result.meta.last_row_id, id])));
        return ok(await courseWithTutors(db, result.meta.last_row_id), 201);
      } catch {
        return error('A course with this title and department already exists', 400);
      }
    }

    if (courseId && method === 'PUT') {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const { title, department, description } = readJsonPayload(body, ['title', 'department', 'description']);
      const tutorIds = [...new Set((Array.isArray(body.tutorIds) ? body.tutorIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
      if (!title || !department || !description) return error('Title, department, and description are required', 400);
      const result = await run(db, 'UPDATE Courses SET title = ?, department = ?, description = ? WHERE id = ?', [title, department, description, courseId]);
      if (!result.meta.changes) return error('Course not found', 404);
      await run(db, 'DELETE FROM Course_Tutors WHERE course_id = ?', [courseId]);
      await Promise.all(tutorIds.map((id) => run(db, 'INSERT OR IGNORE INTO Course_Tutors (course_id, tutor_id) VALUES (?, ?)', [courseId, id])));
      return ok(await courseWithTutors(db, courseId));
    }

    if (courseId && method === 'DELETE') {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const result = await run(db, 'DELETE FROM Courses WHERE id = ?', [courseId]);
      return result.meta.changes ? ok(null) : error('Course not found', 404);
    }

    if (method === 'GET' && path === '/reviews') {
      const entityType = String(url.searchParams.get('entity_type') || '').toLowerCase();
      const entityId = Number(url.searchParams.get('entity_id'));
      if (!['tutor', 'course'].includes(entityType) || !Number.isInteger(entityId) || entityId <= 0) return error('Valid entity_type and entity_id are required', 400);
      const viewer = await authUser(request, env);
      const isStudent = viewer?.role === 'student';
      const rows = isStudent
        ? await all(db, `SELECT r.*, u.username, CASE WHEN ru.user_id IS NULL THEN 0 ELSE 1 END AS has_upvoted FROM Reviews r INNER JOIN Users u ON u.id = r.user_id LEFT JOIN Review_Upvotes ru ON ru.review_id = r.id AND ru.user_id = ? WHERE r.entity_type = ? AND r.entity_id = ? ORDER BY r.upvotes DESC, r.created_at DESC`, [Number(viewer.id), entityType, entityId])
        : await all(db, `SELECT r.*, u.username FROM Reviews r INNER JOIN Users u ON u.id = r.user_id WHERE r.entity_type = ? AND r.entity_id = ? ORDER BY r.upvotes DESC, r.created_at DESC LIMIT 3`, [entityType, entityId]);
      return ok(rows.map(normalizeBoolFields));
    }

    const reviewId = path.match(/^\/reviews\/(\d+)$/)?.[1];
    if (method === 'POST' && path === '/reviews') {
      const auth = await requireRole(request, env, 'student');
      if (auth.response) return auth.response;
      const entityType = String(body.entity_type || '').toLowerCase();
      const entityId = Number(body.entity_id);
      const rating = Number(body.rating);
      const comment = sanitizeHtml(body.comment);
      if (!['tutor', 'course'].includes(entityType) || !Number.isInteger(entityId) || entityId <= 0) return error('Valid entity_type and entity_id are required', 400);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment) return error('Rating from 1 to 5 and comment are required', 400);
      const result = await run(db, 'INSERT INTO Reviews (user_id, entity_type, entity_id, rating, comment) VALUES (?, ?, ?, ?, ?)', [Number(auth.user.id), entityType, entityId, rating, comment]);
      return ok(await one(db, `SELECT r.*, u.username, 0 AS has_upvoted FROM Reviews r INNER JOIN Users u ON u.id = r.user_id WHERE r.id = ?`, [result.meta.last_row_id]), 201);
    }

    if (reviewId && method === 'PUT' && !path.endsWith('/upvote')) {
      const auth = await requireRole(request, env, 'student');
      if (auth.response) return auth.response;
      const rating = Number(body.rating);
      const comment = sanitizeHtml(body.comment);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment) return error('Rating from 1 to 5 and comment are required', 400);
      const result = await run(db, 'UPDATE Reviews SET rating = ?, comment = ? WHERE id = ? AND user_id = ?', [rating, comment, reviewId, Number(auth.user.id)]);
      if (!result.meta.changes) return error('Review not found', 404);
      return ok(await one(db, `SELECT r.*, u.username FROM Reviews r INNER JOIN Users u ON u.id = r.user_id WHERE r.id = ?`, [reviewId]));
    }

    if (reviewId && method === 'DELETE') {
      const auth = await requireRole(request, env, 'student');
      if (auth.response) return auth.response;
      const result = await run(db, 'DELETE FROM Reviews WHERE id = ? AND user_id = ?', [reviewId, Number(auth.user.id)]);
      return result.meta.changes ? ok(null) : error('Review not found', 404);
    }

    const upvoteId = path.match(/^\/reviews\/(\d+)\/upvote$/)?.[1];
    if (upvoteId && method === 'PUT') {
      const auth = await requireRole(request, env, 'student');
      if (auth.response) return auth.response;
      if (typeof body.upvoted !== 'boolean') return error('Valid upvoted state is required', 400);
      const existing = await one(db, 'SELECT review_id FROM Review_Upvotes WHERE review_id = ? AND user_id = ?', [upvoteId, Number(auth.user.id)]);
      if (body.upvoted && !existing) {
        await run(db, 'INSERT INTO Review_Upvotes (review_id, user_id) VALUES (?, ?)', [upvoteId, Number(auth.user.id)]);
        await run(db, 'UPDATE Reviews SET upvotes = upvotes + 1 WHERE id = ?', [upvoteId]);
      } else if (!body.upvoted && existing) {
        await run(db, 'DELETE FROM Review_Upvotes WHERE review_id = ? AND user_id = ?', [upvoteId, Number(auth.user.id)]);
        await run(db, 'UPDATE Reviews SET upvotes = MAX(upvotes - 1, 0) WHERE id = ?', [upvoteId]);
      }
      return ok(normalizeBoolFields(await one(db, `SELECT r.*, u.username, CASE WHEN ru.user_id IS NULL THEN 0 ELSE 1 END AS has_upvoted FROM Reviews r INNER JOIN Users u ON u.id = r.user_id LEFT JOIN Review_Upvotes ru ON ru.review_id = r.id AND ru.user_id = ? WHERE r.id = ?`, [Number(auth.user.id), upvoteId])));
    }

    const userReviewsId = path.match(/^\/users\/(\d+)\/reviews$/)?.[1];
    if (userReviewsId && method === 'GET') {
      const auth = await requireRole(request, env, 'student');
      if (auth.response) return auth.response;
      if (Number(userReviewsId) !== Number(auth.user.id)) return error('Cannot access another user dashboard', 403);
      return ok(await all(db, `SELECT r.*, u.username, CASE WHEN r.entity_type = 'course' THEN c.title ELSE t.name END AS entity_title, CASE WHEN r.entity_type = 'course' THEN c.department ELSE t.department END AS entity_department FROM Reviews r INNER JOIN Users u ON u.id = r.user_id LEFT JOIN Courses c ON r.entity_type = 'course' AND c.id = r.entity_id LEFT JOIN Tutors t ON r.entity_type = 'tutor' AND t.id = r.entity_id WHERE r.user_id = ? ORDER BY r.created_at DESC`, [Number(auth.user.id)]));
    }

    const userFavoritesId = path.match(/^\/users\/(\d+)\/favorites$/)?.[1];
    if (userFavoritesId && method === 'GET') {
      const auth = await requireRole(request, env, 'student');
      if (auth.response) return auth.response;
      if (Number(userFavoritesId) !== Number(auth.user.id)) return error('Cannot access another user dashboard', 403);
      const tutors = await all(db, `SELECT t.*, 1 AS has_favorite FROM Favorites f INNER JOIN Tutors t ON t.id = f.entity_id WHERE f.user_id = ? AND f.entity_type = 'tutor' ORDER BY t.name`, [Number(auth.user.id)]);
      const courses = await all(db, `SELECT c.*, COALESCE(GROUP_CONCAT(t.id), '') AS tutor_ids, COALESCE(GROUP_CONCAT(t.name), '') AS tutor_names, 1 AS has_favorite FROM Favorites f INNER JOIN Courses c ON c.id = f.entity_id LEFT JOIN Course_Tutors ct ON ct.course_id = c.id LEFT JOIN Tutors t ON t.id = ct.tutor_id WHERE f.user_id = ? AND f.entity_type = 'course' GROUP BY c.id ORDER BY c.title`, [Number(auth.user.id)]);
      return ok({ tutors: tutors.map(normalizeBoolFields), courses: courses.map(normalizeBoolFields) });
    }

    if (userFavoritesId && ['POST', 'DELETE'].includes(method)) {
      const auth = await requireRole(request, env, 'student');
      if (auth.response) return auth.response;
      if (Number(userFavoritesId) !== Number(auth.user.id)) return error('Cannot manage favorites for another user', 403);
      const entityType = String(body.entity_type || '').toLowerCase();
      const entityId = Number(body.entity_id);
      if (!['tutor', 'course'].includes(entityType) || !Number.isInteger(entityId) || entityId <= 0) return error('Valid entity_type and entity_id are required', 400);
      if (method === 'POST') {
        await run(db, 'INSERT OR IGNORE INTO Favorites (user_id, entity_type, entity_id) VALUES (?, ?, ?)', [Number(auth.user.id), entityType, entityId]);
        return ok(await one(db, 'SELECT * FROM Favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?', [Number(auth.user.id), entityType, entityId]), 201);
      }
      await run(db, 'DELETE FROM Favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?', [Number(auth.user.id), entityType, entityId]);
      return ok(null);
    }

    if (method === 'PUT' && path === '/me/favorite') {
      const auth = await requireRole(request, env, 'student');
      if (auth.response) return auth.response;
      const entityType = String(body.entity_type || '').toLowerCase();
      const entityId = Number(body.entity_id);
      if (!['tutor', 'course'].includes(entityType) || !Number.isInteger(entityId) || entityId <= 0 || typeof body.favorite !== 'boolean') return error('Valid entity_type, entity_id, and favorite state are required', 400);
      const target = entityType === 'tutor' ? await one(db, 'SELECT * FROM Tutors WHERE id = ?', [entityId]) : await courseWithTutors(db, entityId);
      if (!target) return error('Favorite target not found', 404);
      if (body.favorite) await run(db, 'INSERT OR IGNORE INTO Favorites (user_id, entity_type, entity_id) VALUES (?, ?, ?)', [Number(auth.user.id), entityType, entityId]);
      else await run(db, 'DELETE FROM Favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?', [Number(auth.user.id), entityType, entityId]);
      const updated = entityType === 'tutor'
        ? await one(db, `SELECT t.*, CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS has_favorite FROM Tutors t LEFT JOIN Favorites f ON f.entity_type = 'tutor' AND f.entity_id = t.id AND f.user_id = ? WHERE t.id = ?`, [Number(auth.user.id), entityId])
        : await courseWithTutors(db, entityId, Number(auth.user.id));
      return ok(normalizeBoolFields({ ...updated, entity_type: entityType }));
    }

    return error('Not found', 404);
  } catch (err) {
    console.error(err);
    return error('Internal server error', 500);
  }
}
