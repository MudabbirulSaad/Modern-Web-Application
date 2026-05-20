import request from 'supertest';
import app from './index';
import pool from './db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';

afterAll(async () => {
  await pool.end();
});

const withGroqConfig = (fn) => async () => {
  const originalApiKey = process.env.GROQ_API_KEY;
  const originalModel = process.env.GROQ_MODEL;

  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.GROQ_MODEL = 'llama-test';

  try {
    await fn();
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = originalApiKey;
    }

    if (originalModel === undefined) {
      delete process.env.GROQ_MODEL;
    } else {
      process.env.GROQ_MODEL = originalModel;
    }
  }
};

const mockGroqCommand = (command) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(command)
          }
        }
      ]
    })
  });
};

const smartNavStudentCookie = () => {
  const token = jwt.sign({ id: 7, role: 'student' }, process.env.JWT_SECRET || 'development-jwt-secret');
  return [`auth_token=${token}`];
};

describe('GET /api/health', () => {
  it('should return status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/db-test', () => {
  it('should return 200 and success message on successful query', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue([{ val: 1 }]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app).get('/api/db-test');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: { val: 1 } });
    expect(mockConn.release).toHaveBeenCalled();
    
    spy.mockRestore();
  });

  it('should return 500 and error message on failed connection', async () => {
    const spy = jest.spyOn(pool, 'getConnection').mockRejectedValue(new Error('Connection failed'));

    const res = await request(app).get('/api/db-test');
    expect(res.statusCode).toEqual(500);
    expect(res.body).toEqual({ status: 'error', message: 'Database connection failed' });
    
    spy.mockRestore();
  });
});

describe('POST /api/smart-navigation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  it('should return NONE when Groq configuration is missing', async () => {
    const originalApiKey = process.env.GROQ_API_KEY;
    const originalModel = process.env.GROQ_MODEL;
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
    global.fetch = jest.fn();

    const res = await request(app)
      .post('/api/smart-navigation')
      .send({ intent: 'find computer science tutors' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: {
        action: 'NONE',
        route: null,
        domain: null,
        filters: {},
        confidence: 0,
        reason: 'Smart navigation is unavailable'
      }
    });
    expect(global.fetch).not.toHaveBeenCalled();

    if (originalApiKey === undefined) {
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = originalApiKey;
    }

    if (originalModel === undefined) {
      delete process.env.GROQ_MODEL;
    } else {
      process.env.GROQ_MODEL = originalModel;
    }
  });

  it('should reject missing or invalid intent before calling Groq', withGroqConfig(async () => {
    global.fetch = jest.fn();

    const missingRes = await request(app)
      .post('/api/smart-navigation')
      .send({});
    const longRes = await request(app)
      .post('/api/smart-navigation')
      .send({ intent: 'x'.repeat(501) });

    expect(missingRes.statusCode).toEqual(400);
    expect(missingRes.body).toEqual({ status: 'error', message: 'Intent is required' });
    expect(longRes.statusCode).toEqual(400);
    expect(longRes.body).toEqual({ status: 'error', message: 'Intent must be 500 characters or fewer' });
    expect(global.fetch).not.toHaveBeenCalled();
  }));

  it('should sanitize Groq output into the closed command schema and strip extra fields', withGroqConfig(async () => {
    mockGroqCommand({
      action: 'NAVIGATE',
      route: '/tutors',
      domain: 'tutors',
      filters: {
        search: 'maya',
        department: 'Computer Science',
        role: 'admin'
      },
      confidence: 0.92,
      reason: 'Tutor directory matches',
      jwt: 'secret',
      userId: 7
    });

    const res = await request(app)
      .post('/api/smart-navigation')
      .set('Cookie', smartNavStudentCookie())
      .send({ intent: 'show me computer science tutors named maya' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: {
        action: 'NAVIGATE',
        route: '/tutors',
        domain: 'tutors',
        filters: {
          search: 'maya',
          department: 'Computer Science'
        },
        confidence: 0.92,
        reason: 'Tutor directory matches'
      }
    });
    expect(Object.keys(res.body.data)).toEqual(['action', 'route', 'domain', 'filters', 'confidence', 'reason']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(JSON.stringify(requestBody)).toContain('show me computer science tutors named maya');
    expect(JSON.stringify(requestBody)).not.toContain('auth_token');
    expect(JSON.stringify(requestBody)).not.toContain('secret');
    expect(JSON.stringify(requestBody)).not.toContain('"userId"');
  }));

  it('should resolve unsupported actions, invalid enums, missing keys, and low confidence to NONE', withGroqConfig(async () => {
    mockGroqCommand({
      action: 'DELETE',
      route: '/admin',
      domain: 'users',
      filters: { search: 'anything' },
      confidence: 0.99,
      reason: 'Unsafe'
    });

    const invalidRes = await request(app)
      .post('/api/smart-navigation')
      .send({ intent: 'delete a user' });

    mockGroqCommand({
      action: 'NAVIGATE',
      route: '/admin',
      domain: 'courses',
      filters: { search: 'private' },
      confidence: 0.91,
      reason: 'Invalid route'
    });

    const invalidEnumRes = await request(app)
      .post('/api/smart-navigation')
      .send({ intent: 'open the admin page' });

    mockGroqCommand({
      route: '/tutors',
      domain: 'tutors',
      filters: { search: 'maya' },
      confidence: 0.91,
      reason: 'Missing action'
    });

    const missingKeyRes = await request(app)
      .post('/api/smart-navigation')
      .send({ intent: 'find maya' });

    mockGroqCommand({
      action: 'NAVIGATE',
      route: '/courses',
      domain: 'courses',
      filters: { search: 'databases' },
      confidence: 0.39,
      reason: 'Weak match'
    });

    const lowConfidenceRes = await request(app)
      .post('/api/smart-navigation')
      .send({ intent: 'maybe something about databases' });

    expect(invalidRes.body.data).toEqual({
      action: 'NONE',
      route: null,
      domain: null,
      filters: {},
      confidence: 0,
      reason: 'Unsupported navigation command'
    });
    expect(invalidEnumRes.body.data).toEqual({
      action: 'NONE',
      route: null,
      domain: null,
      filters: {},
      confidence: 0,
      reason: 'Unsupported navigation command'
    });
    expect(missingKeyRes.body.data).toEqual({
      action: 'NONE',
      route: null,
      domain: null,
      filters: {},
      confidence: 0,
      reason: 'Unsupported navigation command'
    });
    expect(lowConfidenceRes.body.data).toEqual({
      action: 'NONE',
      route: null,
      domain: null,
      filters: {},
      confidence: 0.39,
      reason: 'Low confidence'
    });
  }));

  it('should resolve malformed JSON and provider failures to NONE', withGroqConfig(async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'not json' } }]
      })
    });

    const malformedRes = await request(app)
      .post('/api/smart-navigation')
      .send({ intent: 'go to tutors' });

    global.fetch = jest.fn().mockRejectedValue(new Error('provider failed'));

    const failedRes = await request(app)
      .post('/api/smart-navigation')
      .send({ intent: 'go to courses' });

    expect(malformedRes.body.data).toEqual({
      action: 'NONE',
      route: null,
      domain: null,
      filters: {},
      confidence: 0,
      reason: 'Unable to parse navigation intent'
    });
    expect(failedRes.body.data).toEqual({
      action: 'NONE',
      route: null,
      domain: null,
      filters: {},
      confidence: 0,
      reason: 'Unable to parse navigation intent'
    });
  }));

  it('should reject inconsistent route/domain pairs even when each value is individually whitelisted', withGroqConfig(async () => {
    mockGroqCommand({
      action: 'NAVIGATE',
      route: '/tutors',
      domain: 'courses',
      filters: {},
      confidence: 0.95,
      reason: 'Mismatched pair'
    });

    const mismatchedTutorsRes = await request(app)
      .post('/api/smart-navigation')
      .send({ intent: 'show me courses on the tutors page' });

    mockGroqCommand({
      action: 'NAVIGATE',
      route: '/courses',
      domain: 'tutors',
      filters: {},
      confidence: 0.95,
      reason: 'Mismatched pair'
    });

    const mismatchedCoursesRes = await request(app)
      .post('/api/smart-navigation')
      .send({ intent: 'show me tutors on the courses page' });

    expect(mismatchedTutorsRes.body.data).toEqual({
      action: 'NONE',
      route: null,
      domain: null,
      filters: {},
      confidence: 0,
      reason: 'Unsupported navigation command'
    });
    expect(mismatchedCoursesRes.body.data).toEqual({
      action: 'NONE',
      route: null,
      domain: null,
      filters: {},
      confidence: 0,
      reason: 'Unsupported navigation command'
    });
  }));

  it('should rate limit smart-navigation requests', withGroqConfig(async () => {
    mockGroqCommand({
      action: 'NONE',
      route: null,
      domain: null,
      filters: {},
      confidence: 0.8,
      reason: 'No matching route'
    });

    for (let i = 0; i < 10; i += 1) {
      const res = await request(app)
        .post('/api/smart-navigation')
        .set('X-Forwarded-For', '203.0.113.42')
        .send({ intent: `request ${i}` });
      expect(res.statusCode).toEqual(200);
    }

    const limitedRes = await request(app)
      .post('/api/smart-navigation')
      .set('X-Forwarded-For', '203.0.113.42')
      .send({ intent: 'one too many' });

    expect(limitedRes.statusCode).toEqual(429);
    expect(limitedRes.body).toEqual({ status: 'error', message: 'Too many smart-navigation requests' });
    expect(global.fetch).toHaveBeenCalledTimes(10);
  }));
});

describe('GET /api/tutors', () => {
  it('should return the list of tutors from the database', async () => {
    const mockTutors = [
      {
        id: 1,
        name: 'Dr Maya Chen',
        department: 'Computer Science',
        bio: 'Specialises in web development and human-computer interaction.',
        created_at: '2026-05-18T00:00:00.000Z',
        updated_at: '2026-05-18T00:00:00.000Z'
      },
      {
        id: 2,
        name: 'Prof Liam Patel',
        department: 'Information Systems',
        bio: 'Teaches database design and enterprise systems.',
        created_at: '2026-05-18T00:00:00.000Z',
        updated_at: '2026-05-18T00:00:00.000Z'
      }
    ];
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce(mockTutors),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app).get('/api/tutors');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockTutors, total: 2 });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id, name, department, bio, created_at, updated_at FROM Tutors ORDER BY name ASC'
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 500 when tutors cannot be fetched', async () => {
    const spy = jest.spyOn(pool, 'getConnection').mockRejectedValue(new Error('Connection failed'));

    const res = await request(app).get('/api/tutors');

    expect(res.statusCode).toEqual(500);
    expect(res.body).toEqual({ status: 'error', message: 'Unable to fetch tutors' });

    spy.mockRestore();
  });

  it('should filter tutors by search and department queries', async () => {
    const mockTutors = [
      {
        id: 1,
        name: 'Dr Maya Chen',
        department: 'Computer Science',
        bio: 'Specialises in web development and human-computer interaction.',
        created_at: '2026-05-18T00:00:00.000Z',
        updated_at: '2026-05-18T00:00:00.000Z'
      }
    ];
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(mockTutors),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .get('/api/tutors')
      .query({ search: 'maya', department: 'Computer Science' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockTutors, total: 1 });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE (name LIKE ? OR bio LIKE ?) AND department = ?'),
      ['%maya%', '%maya%', 'Computer Science']
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should paginate tutors when page and limit queries are provided', async () => {
    const mockTutors = [
      {
        id: 3,
        name: 'Dr Omar Wright',
        department: 'Computer Science',
        bio: 'Teaches software architecture.',
        created_at: '2026-05-18T00:00:00.000Z',
        updated_at: '2026-05-18T00:00:00.000Z'
      }
    ];
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ total: 5 }])
        .mockResolvedValueOnce(mockTutors),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .get('/api/tutors')
      .query({ page: '2', limit: '2' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockTutors, total: 5 });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id, name, department, bio, created_at, updated_at FROM Tutors ORDER BY name ASC LIMIT ? OFFSET ?',
      [2, 2]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should sort tutors by best match when requested', async () => {
    const mockTutors = [
      {
        id: 1,
        name: 'Dr Maya Chen',
        department: 'Computer Science',
        bio: 'Specialises in web development and human-computer interaction.',
        created_at: '2026-05-18T00:00:00.000Z',
        updated_at: '2026-05-18T00:00:00.000Z'
      }
    ];
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(mockTutors),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .get('/api/tutors')
      .query({ sort: 'best-match' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockTutors, total: 1 });
    expect(mockConn.query.mock.calls[1][0]).toContain('AVG(rating) AS average_rating');
    expect(mockConn.query.mock.calls[1][0]).toContain('COUNT(*) AS review_count');
    expect(mockConn.query.mock.calls[1][0]).toContain('ORDER BY (COALESCE(review_stats.average_rating, 0) * 2) + LOG10(COALESCE(review_stats.review_count, 0) + 1) DESC');
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });
});

describe('GET /api/tutors/:id', () => {
  it('should return a single tutor from the database', async () => {
    const mockTutor = {
      id: 1,
      name: 'Dr Maya Chen',
      department: 'Computer Science',
      bio: 'Specialises in web development and human-computer interaction.',
      created_at: '2026-05-18T00:00:00.000Z',
      updated_at: '2026-05-18T00:00:00.000Z'
    };
    const mockConn = {
      query: jest.fn().mockResolvedValue([mockTutor]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app).get('/api/tutors/1');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockTutor });
    expect(mockConn.query).toHaveBeenCalledWith(
      'SELECT id, name, department, bio, created_at, updated_at FROM Tutors WHERE id = ? LIMIT 1',
      ['1']
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 404 when the tutor does not exist', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue([]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app).get('/api/tutors/999');

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({ status: 'error', message: 'Tutor not found' });
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 500 when the tutor cannot be fetched', async () => {
    const spy = jest.spyOn(pool, 'getConnection').mockRejectedValue(new Error('Connection failed'));

    const res = await request(app).get('/api/tutors/1');

    expect(res.statusCode).toEqual(500);
    expect(res.body).toEqual({ status: 'error', message: 'Unable to fetch tutor' });

    spy.mockRestore();
  });
});

describe('Protected tutor management endpoints', () => {
  const adminCookie = () => {
    const token = jwt.sign(
      { id: 1, role: 'admin' },
      process.env.JWT_SECRET || 'development-jwt-secret',
      { expiresIn: '7d' }
    );
    return [`auth_token=${token}`];
  };

  const studentCookie = () => {
    const token = jwt.sign(
      { id: 2, role: 'student' },
      process.env.JWT_SECRET || 'development-jwt-secret',
      { expiresIn: '7d' }
    );
    return [`auth_token=${token}`];
  };

  it('should create a tutor when the requester is an admin', async () => {
    const createdTutor = {
      id: 4,
      name: 'Dr Nora Banks',
      department: 'Computer Science',
      bio: 'Teaches client-side engineering and accessibility.',
      created_at: '2026-05-18T00:00:00.000Z',
      updated_at: '2026-05-18T00:00:00.000Z'
    };
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ insertId: 4 })
        .mockResolvedValueOnce([createdTutor]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/tutors')
      .set('Cookie', adminCookie())
      .send({
        name: ' Dr Nora Banks ',
        department: ' Computer Science ',
        bio: ' Teaches client-side engineering and accessibility. '
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toEqual({ status: 'ok', data: createdTutor });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM Tutors WHERE LOWER(TRIM(name)) = ? AND LOWER(TRIM(department)) = ? LIMIT 1',
      ['dr nora banks', 'computer science']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO Tutors (name, department, bio) VALUES (?, ?, ?)',
      ['Dr Nora Banks', 'Computer Science', 'Teaches client-side engineering and accessibility.']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      3,
      'SELECT id, name, department, bio, created_at, updated_at FROM Tutors WHERE id = ? LIMIT 1',
      [4]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should reject duplicate tutor creation by normalized name and department', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue([{ id: 1 }]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/tutors')
      .set('Cookie', adminCookie())
      .send({
        name: '  DR NORA BANKS  ',
        department: ' computer science ',
        bio: 'Different bio.'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'A tutor with this name and department already exists' });
    expect(mockConn.query).toHaveBeenCalledTimes(1);
    expect(mockConn.query).toHaveBeenCalledWith(
      'SELECT id FROM Tutors WHERE LOWER(TRIM(name)) = ? AND LOWER(TRIM(department)) = ? LIMIT 1',
      ['dr nora banks', 'computer science']
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should reject tutor creation when the requester is not an admin', async () => {
    const res = await request(app)
      .post('/api/tutors')
      .set('Cookie', studentCookie())
      .send({
        name: 'Dr Nora Banks',
        department: 'Computer Science',
        bio: 'Teaches client-side engineering and accessibility.'
      });

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({ status: 'error', message: 'Admin access required' });
  });

  it('should reject protected tutor changes without a valid token', async () => {
    const res = await request(app)
      .delete('/api/tutors/4')
      .set('Cookie', ['auth_token=invalid-token']);

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({ status: 'error', message: 'Authentication required' });
  });

  it('should update a tutor when the requester is an admin', async () => {
    const updatedTutor = {
      id: 4,
      name: 'Dr Nora Banks',
      department: 'Software Engineering',
      bio: 'Leads frontend architecture and accessibility studios.',
      created_at: '2026-05-18T00:00:00.000Z',
      updated_at: '2026-05-18T00:00:00.000Z'
    };
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([updatedTutor]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/tutors/4')
      .set('Cookie', adminCookie())
      .send({
        name: 'Dr Nora Banks',
        department: 'Software Engineering',
        bio: 'Leads frontend architecture and accessibility studios.'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: updatedTutor });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM Tutors WHERE LOWER(TRIM(name)) = ? AND LOWER(TRIM(department)) = ? AND id <> ? LIMIT 1',
      ['dr nora banks', 'software engineering', '4']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE Tutors SET name = ?, department = ?, bio = ? WHERE id = ?',
      ['Dr Nora Banks', 'Software Engineering', 'Leads frontend architecture and accessibility studios.', '4']
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should reject tutor updates that collide with another normalized tutor', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue([{ id: 1 }]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/tutors/4')
      .set('Cookie', adminCookie())
      .send({
        name: 'DR NORA BANKS',
        department: ' software engineering ',
        bio: 'Updated bio.'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'A tutor with this name and department already exists' });
    expect(mockConn.query).toHaveBeenCalledTimes(1);
    expect(mockConn.query).toHaveBeenCalledWith(
      'SELECT id FROM Tutors WHERE LOWER(TRIM(name)) = ? AND LOWER(TRIM(department)) = ? AND id <> ? LIMIT 1',
      ['dr nora banks', 'software engineering', '4']
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 404 when updating a missing tutor', async () => {
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ affectedRows: 0 }),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/tutors/999')
      .set('Cookie', adminCookie())
      .send({
        name: 'Missing Tutor',
        department: 'Computer Science',
        bio: 'No profile.'
      });

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({ status: 'error', message: 'Tutor not found' });
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should delete a tutor when the requester is an admin', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue({ affectedRows: 1 }),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .delete('/api/tutors/4')
      .set('Cookie', adminCookie());

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', message: 'Tutor deleted' });
    expect(mockConn.query).toHaveBeenCalledWith(
      'DELETE FROM Tutors WHERE id = ?',
      ['4']
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 400 when tutor fields are missing', async () => {
    const res = await request(app)
      .post('/api/tutors')
      .set('Cookie', adminCookie())
      .send({
        name: '',
        department: 'Computer Science',
        bio: 'No name.'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'Name, department, and bio are required' });
  });
});

describe('GET /api/courses', () => {
  it('should return the list of courses with linked tutors from the database', async () => {
    const mockCourses = [
      {
        id: 1,
        title: 'COS30043 Interface Design and Development',
        department: 'Computer Science',
        description: 'Design and build responsive web interfaces using modern frontend practices.',
        tutor_names: 'Dr Maya Chen'
      },
      {
        id: 2,
        title: 'COS20031 Database Design',
        department: 'Information Systems',
        description: 'Model, normalize, and query relational data for software applications.',
        tutor_names: 'Prof Liam Patel'
      }
    ];
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce(mockCourses),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app).get('/api/courses');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockCourses, total: 2 });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM Courses c')
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 500 when courses cannot be fetched', async () => {
    const spy = jest.spyOn(pool, 'getConnection').mockRejectedValue(new Error('Connection failed'));

    const res = await request(app).get('/api/courses');

    expect(res.statusCode).toEqual(500);
    expect(res.body).toEqual({ status: 'error', message: 'Unable to fetch courses' });

    spy.mockRestore();
  });

  it('should filter courses by search and department queries', async () => {
    const mockCourses = [
      {
        id: 1,
        title: 'COS30043 Interface Design and Development',
        department: 'Computer Science',
        description: 'Design and build responsive web interfaces using modern frontend practices.',
        tutor_names: 'Dr Maya Chen'
      }
    ];
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(mockCourses),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .get('/api/courses')
      .query({ search: 'interface', department: 'Computer Science' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockCourses, total: 1 });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE (c.title LIKE ? OR c.description LIKE ? OR EXISTS ('),
      ['%interface%', '%interface%', '%interface%', 'Computer Science']
    );
    expect(mockConn.query.mock.calls[1][0]).toContain('t_search.name LIKE ?');
    expect(mockConn.query.mock.calls[1][0]).toContain('AND c.department = ?');
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should paginate courses when page and limit queries are provided', async () => {
    const mockCourses = [
      {
        id: 3,
        title: 'COS30017 Software Development for Mobile Devices',
        department: 'Computer Science',
        description: 'Build mobile software with contemporary tooling.',
        tutor_names: 'Dr Maya Chen'
      }
    ];
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ total: 6 }])
        .mockResolvedValueOnce(mockCourses),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .get('/api/courses')
      .query({ page: '2', limit: '3' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockCourses, total: 6 });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('LIMIT ? OFFSET ?'),
      [3, 3]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should sort courses by recently active when requested', async () => {
    const mockCourses = [
      {
        id: 1,
        title: 'COS30043 Interface Design and Development',
        department: 'Computer Science',
        description: 'Design and build responsive web interfaces using modern frontend practices.',
        tutor_names: 'Dr Maya Chen'
      }
    ];
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce(mockCourses),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .get('/api/courses')
      .query({ sort: 'recently-active' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockCourses, total: 1 });
    expect(mockConn.query.mock.calls[1][0]).toContain('MAX(created_at) AS latest_review_at');
    expect(mockConn.query.mock.calls[1][0]).toContain('ORDER BY GREATEST(c.updated_at, COALESCE(review_stats.latest_review_at, c.updated_at)) DESC');
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });
});

describe('GET /api/courses/:id', () => {
  it('should return a single course with assigned tutors from the database', async () => {
    const mockCourse = {
      id: 1,
      title: 'COS30043 Interface Design and Development',
      department: 'Computer Science',
      description: 'Design and build responsive web interfaces using modern frontend practices.',
      created_at: '2026-05-18T00:00:00.000Z',
      updated_at: '2026-05-18T00:00:00.000Z'
    };
    const mockTutors = [
      {
        id: 1,
        name: 'Dr Maya Chen',
        department: 'Computer Science',
        bio: 'Specialises in web development and human-computer interaction.'
      },
      {
        id: 3,
        name: 'Dr Amelia Wright',
        department: 'Software Engineering',
        bio: 'Focuses on agile delivery and software architecture.'
      }
    ];
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([mockCourse])
        .mockResolvedValueOnce(mockTutors),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app).get('/api/courses/1');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: { ...mockCourse, tutors: mockTutors } });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id, title, department, description, created_at, updated_at FROM Courses WHERE id = ? LIMIT 1',
      ['1']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM Course_Tutors ct'),
      ['1']
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 404 when the course does not exist', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue([]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app).get('/api/courses/999');

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({ status: 'error', message: 'Course not found' });
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 500 when the course cannot be fetched', async () => {
    const spy = jest.spyOn(pool, 'getConnection').mockRejectedValue(new Error('Connection failed'));

    const res = await request(app).get('/api/courses/1');

    expect(res.statusCode).toEqual(500);
    expect(res.body).toEqual({ status: 'error', message: 'Unable to fetch course' });

    spy.mockRestore();
  });
});

describe('Protected course management endpoints', () => {
  const adminCookie = () => {
    const token = jwt.sign(
      { id: 1, role: 'admin' },
      process.env.JWT_SECRET || 'development-jwt-secret',
      { expiresIn: '7d' }
    );
    return [`auth_token=${token}`];
  };

  const studentCookie = () => {
    const token = jwt.sign(
      { id: 2, role: 'student' },
      process.env.JWT_SECRET || 'development-jwt-secret',
      { expiresIn: '7d' }
    );
    return [`auth_token=${token}`];
  };

  it('should create a course with assigned tutors when the requester is an admin', async () => {
    const createdCourse = {
      id: 4,
      title: 'COS10005 Web Development',
      department: 'Computer Science',
      description: 'Build accessible web applications.',
      created_at: '2026-05-18T00:00:00.000Z',
      updated_at: '2026-05-18T00:00:00.000Z'
    };
    const assignedTutors = [
      {
        id: 1,
        name: 'Dr Maya Chen',
        department: 'Computer Science',
        bio: 'Specialises in web development and human-computer interaction.'
      },
      {
        id: 3,
        name: 'Dr Amelia Wright',
        department: 'Software Engineering',
        bio: 'Focuses on agile delivery and software architecture.'
      }
    ];
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ insertId: 4 })
        .mockResolvedValueOnce({ affectedRows: 2 })
        .mockResolvedValueOnce([createdCourse])
        .mockResolvedValueOnce(assignedTutors),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/courses')
      .set('Cookie', adminCookie())
      .send({
        title: ' COS10005 Web Development ',
        department: ' Computer Science ',
        description: ' Build accessible web applications. ',
        tutorIds: [1, '3', 3]
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toEqual({ status: 'ok', data: { ...createdCourse, tutors: assignedTutors } });
    expect(mockConn.beginTransaction).toHaveBeenCalled();
    expect(mockConn.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM Courses WHERE LOWER(TRIM(title)) = ? AND LOWER(TRIM(department)) = ? LIMIT 1',
      ['cos10005 web development', 'computer science']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO Courses (title, department, description) VALUES (?, ?, ?)',
      ['COS10005 Web Development', 'Computer Science', 'Build accessible web applications.']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      3,
      'INSERT INTO Course_Tutors (course_id, tutor_id) VALUES (?, ?), (?, ?)',
      [4, 1, 4, 3]
    );
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return a validation error when creating a duplicate course', async () => {
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn().mockResolvedValueOnce([{ id: 1 }]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/courses')
      .set('Cookie', adminCookie())
      .send({
        title: ' cos10005 web development ',
        department: ' computer science ',
        description: 'Another copy.',
        tutorIds: [1]
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'A course with this title and department already exists' });
    expect(mockConn.query).toHaveBeenCalledTimes(1);
    expect(mockConn.query).toHaveBeenCalledWith(
      'SELECT id FROM Courses WHERE LOWER(TRIM(title)) = ? AND LOWER(TRIM(department)) = ? LIMIT 1',
      ['cos10005 web development', 'computer science']
    );
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.commit).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should reject course creation when the requester is not an admin', async () => {
    const res = await request(app)
      .post('/api/courses')
      .set('Cookie', studentCookie())
      .send({
        title: 'COS10005 Web Development',
        department: 'Computer Science',
        description: 'Build accessible web applications.',
        tutorIds: [1]
      });

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({ status: 'error', message: 'Admin access required' });
  });

  it('should update a course and replace assigned tutors when the requester is an admin', async () => {
    const updatedCourse = {
      id: 4,
      title: 'COS10005 Web Development',
      department: 'Computer Science',
      description: 'Build accessible and responsive web applications.',
      created_at: '2026-05-18T00:00:00.000Z',
      updated_at: '2026-05-18T00:00:00.000Z'
    };
    const assignedTutors = [
      {
        id: 2,
        name: 'Prof Liam Patel',
        department: 'Information Systems',
        bio: 'Teaches database design and enterprise systems.'
      }
    ];
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 2 })
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([updatedCourse])
        .mockResolvedValueOnce(assignedTutors),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/courses/4')
      .set('Cookie', adminCookie())
      .send({
        title: 'COS10005 Web Development',
        department: 'Computer Science',
        description: 'Build accessible and responsive web applications.',
        tutorIds: [2]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: { ...updatedCourse, tutors: assignedTutors } });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM Courses WHERE LOWER(TRIM(title)) = ? AND LOWER(TRIM(department)) = ? AND id <> ? LIMIT 1',
      ['cos10005 web development', 'computer science', '4']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE Courses SET title = ?, department = ?, description = ? WHERE id = ?',
      ['COS10005 Web Development', 'Computer Science', 'Build accessible and responsive web applications.', '4']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM Course_Tutors WHERE course_id = ?',
      ['4']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      4,
      'INSERT INTO Course_Tutors (course_id, tutor_id) VALUES (?, ?)',
      ['4', 2]
    );
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return a validation error when updating a course to duplicate another course', async () => {
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn().mockResolvedValueOnce([{ id: 1 }]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/courses/4')
      .set('Cookie', adminCookie())
      .send({
        title: 'COS30043 Interface Design and Development',
        department: 'Computer Science',
        description: 'Colliding course.',
        tutorIds: [1]
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'A course with this title and department already exists' });
    expect(mockConn.query).toHaveBeenCalledTimes(1);
    expect(mockConn.query).toHaveBeenCalledWith(
      'SELECT id FROM Courses WHERE LOWER(TRIM(title)) = ? AND LOWER(TRIM(department)) = ? AND id <> ? LIMIT 1',
      ['cos30043 interface design and development', 'computer science', '4']
    );
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.commit).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should deduplicate submitted tutor assignments when updating a course', async () => {
    const updatedCourse = {
      id: 4,
      title: 'COS10005 Web Development',
      department: 'Computer Science',
      description: 'Build accessible and responsive web applications.',
      created_at: '2026-05-18T00:00:00.000Z',
      updated_at: '2026-05-18T00:00:00.000Z'
    };
    const assignedTutors = [
      {
        id: 2,
        name: 'Prof Liam Patel',
        department: 'Information Systems',
        bio: 'Teaches database design and enterprise systems.'
      }
    ];
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 2 })
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([updatedCourse])
        .mockResolvedValueOnce(assignedTutors),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/courses/4')
      .set('Cookie', adminCookie())
      .send({
        title: 'COS10005 Web Development',
        department: 'Computer Science',
        description: 'Build accessible and responsive web applications.',
        tutorIds: [2, '2', 2]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: { ...updatedCourse, tutors: assignedTutors } });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      4,
      'INSERT INTO Course_Tutors (course_id, tutor_id) VALUES (?, ?)',
      ['4', 2]
    );
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 404 when updating a missing course', async () => {
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ affectedRows: 0 }),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/courses/999')
      .set('Cookie', adminCookie())
      .send({
        title: 'Missing Course',
        department: 'Computer Science',
        description: 'No course.',
        tutorIds: []
      });

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({ status: 'error', message: 'Course not found' });
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should delete a course when the requester is an admin', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue({ affectedRows: 1 }),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .delete('/api/courses/4')
      .set('Cookie', adminCookie());

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', message: 'Course deleted' });
    expect(mockConn.query).toHaveBeenCalledWith(
      'DELETE FROM Courses WHERE id = ?',
      ['4']
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 400 when course fields are missing', async () => {
    const res = await request(app)
      .post('/api/courses')
      .set('Cookie', adminCookie())
      .send({
        title: '',
        department: 'Computer Science',
        description: 'No title.',
        tutorIds: [1]
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'Title, department, and description are required' });
  });
});

describe('POST /api/auth/register', () => {
  it('should register the first user as an admin with a hashed password', async () => {
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ user_count: 0 }])
        .mockResolvedValueOnce({ insertId: 1 }),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'firststudent',
        email: 'first@example.edu',
        password: 'securepass123'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toEqual({
      status: 'ok',
      data: {
        id: 1,
        username: 'firststudent',
        email: 'first@example.edu',
        role: 'admin'
      }
    });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      1,
      'SELECT COUNT(*) AS user_count FROM Users'
    );

    const insertCall = mockConn.query.mock.calls[1];
    expect(insertCall[0]).toEqual(
      'INSERT INTO Users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
    );
    expect(insertCall[1][0]).toEqual('firststudent');
    expect(insertCall[1][1]).toEqual('first@example.edu');
    expect(insertCall[1][2]).not.toEqual('securepass123');
    expect(await bcrypt.compare('securepass123', insertCall[1][2])).toEqual(true);
    expect(insertCall[1][3]).toEqual('admin');
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should register later users as students', async () => {
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ user_count: 1 }])
        .mockResolvedValueOnce({ insertId: 2 }),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'secondstudent',
        email: 'second@example.edu',
        password: 'securepass123'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.role).toEqual('student');
    expect(mockConn.query.mock.calls[1][1][3]).toEqual('student');
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: '',
        email: 'missing@example.edu',
        password: 'securepass123'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'Username, email, and password are required' });
  });

  it('should return 409 when the username or email already exists', async () => {
    const duplicateError = new Error('Duplicate entry');
    duplicateError.code = 'ER_DUP_ENTRY';
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([{ user_count: 1 }])
        .mockRejectedValueOnce(duplicateError),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'existing',
        email: 'existing@example.edu',
        password: 'securepass123'
      });

    expect(res.statusCode).toEqual(409);
    expect(res.body).toEqual({ status: 'error', message: 'Username or email already exists' });
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });
});

describe('POST /api/auth/login', () => {
  it('should log in a user and issue an HttpOnly JWT cookie', async () => {
    const passwordHash = await bcrypt.hash('securepass123', 12);
    const mockUser = {
      id: 7,
      username: 'studentone',
      email: 'student@example.edu',
      password_hash: passwordHash,
      role: 'student'
    };
    const mockConn = {
      query: jest.fn().mockResolvedValue([mockUser]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'student@example.edu',
        password: 'securepass123'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: {
        id: 7,
        username: 'studentone',
        email: 'student@example.edu',
        role: 'student'
      }
    });
    expect(mockConn.query).toHaveBeenCalledWith(
      'SELECT id, username, email, password_hash, role FROM Users WHERE email = ? LIMIT 1',
      ['student@example.edu']
    );

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('auth_token=');
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Strict');

    const token = cookies[0].match(/auth_token=([^;]+)/)[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'development-jwt-secret');
    expect(decoded).toMatchObject({
      id: 7,
      role: 'student'
    });
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 401 when the password is incorrect', async () => {
    const passwordHash = await bcrypt.hash('securepass123', 12);
    const mockConn = {
      query: jest.fn().mockResolvedValue([{
        id: 7,
        username: 'studentone',
        email: 'student@example.edu',
        password_hash: passwordHash,
        role: 'student'
      }]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'student@example.edu',
        password: 'wrongpass123'
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({ status: 'error', message: 'Invalid email or password' });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 401 when the user does not exist', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue([]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'missing@example.edu',
        password: 'securepass123'
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({ status: 'error', message: 'Invalid email or password' });
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'student@example.edu',
        password: ''
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'Email and password are required' });
  });
});

describe('GET /api/auth/session', () => {
  const sessionCookie = () => {
    const token = jwt.sign(
      { id: 7, role: 'student' },
      process.env.JWT_SECRET || 'development-jwt-secret',
      { expiresIn: '7d' }
    );
    return [`auth_token=${token}`];
  };

  it('should restore the authenticated user from the auth cookie', async () => {
    const mockUser = {
      id: 7,
      username: 'studentone',
      email: 'student@example.edu',
      role: 'student'
    };
    const mockConn = {
      query: jest.fn().mockResolvedValue([mockUser]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .get('/api/auth/session')
      .set('Cookie', sessionCookie());

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockUser });
    expect(mockConn.query).toHaveBeenCalledWith(
      'SELECT id, username, email, role FROM Users WHERE id = ? LIMIT 1',
      [7]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 401 when the auth cookie is missing', async () => {
    const spy = jest.spyOn(pool, 'getConnection');

    const res = await request(app).get('/api/auth/session');

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({ status: 'error', message: 'Authentication required' });
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 401 when the auth cookie is invalid', async () => {
    const spy = jest.spyOn(pool, 'getConnection');

    const res = await request(app)
      .get('/api/auth/session')
      .set('Cookie', ['auth_token=invalid-token']);

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({ status: 'error', message: 'Authentication required' });
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});

describe('POST /api/auth/logout', () => {
  it('should clear the auth cookie', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok' });

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('auth_token=');
    expect(cookies[0]).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Strict');
  });
});

describe('Review endpoints', () => {
  const studentCookie = () => {
    const token = jwt.sign(
      { id: 7, role: 'student' },
      process.env.JWT_SECRET || 'development-jwt-secret',
      { expiresIn: '7d' }
    );
    return [`auth_token=${token}`];
  };

  const adminCookie = () => {
    const token = jwt.sign(
      { id: 1, role: 'admin' },
      process.env.JWT_SECRET || 'development-jwt-secret',
      { expiresIn: '7d' }
    );
    return [`auth_token=${token}`];
  };

  it('should return the top three reviews for guests', async () => {
    const reviews = [
      {
        id: 1,
        user_id: 7,
        username: 'studentone',
        entity_type: 'tutor',
        entity_id: 2,
        rating: 5,
        comment: 'Excellent explanations.',
        upvotes: 8,
        created_at: '2026-05-18T00:00:00.000Z'
      }
    ];
    const mockConn = {
      query: jest.fn().mockResolvedValue(reviews),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app).get('/api/reviews?entity_type=tutor&entity_id=2');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: reviews });
    expect(mockConn.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT ?'),
      ['tutor', 2, 3]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return all matching reviews for authenticated students', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue([]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .get('/api/reviews?entity_type=course&entity_id=3')
      .set('Cookie', studentCookie());

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: [] });
    expect(mockConn.query).toHaveBeenCalledWith(
      expect.not.stringContaining('LIMIT ?'),
      [7, 'course', 3]
    );
    expect(mockConn.query.mock.calls[0][0]).toEqual(expect.stringContaining('Review_Upvotes'));
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should create a sanitized review when the requester is a student', async () => {
    const createdReview = {
      id: 12,
      user_id: 7,
      username: 'studentone',
      entity_type: 'course',
      entity_id: 3,
      rating: 4,
      comment: '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;Clear lectures.',
      upvotes: 0,
      created_at: '2026-05-18T00:00:00.000Z'
    };
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce({ insertId: 12 })
        .mockResolvedValueOnce([createdReview]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/reviews')
      .set('Cookie', studentCookie())
      .send({
        entity_type: 'course',
        entity_id: 3,
        rating: 4,
        comment: '<script>alert("x")</script>Clear lectures.'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toEqual({ status: 'ok', data: createdReview });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      1,
      'INSERT INTO Reviews (user_id, entity_type, entity_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [7, 'course', 3, 4, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;Clear lectures.']
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should reject review creation from non-students', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Cookie', adminCookie())
      .send({
        entity_type: 'tutor',
        entity_id: 2,
        rating: 5,
        comment: 'Great support.'
      });

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({ status: 'error', message: 'Student access required' });
  });

  it('should update a review when the requester owns it', async () => {
    const updatedReview = {
      id: 12,
      user_id: 7,
      username: 'studentone',
      entity_type: 'course',
      entity_id: 3,
      rating: 5,
      comment: 'Updated after the second lecture.',
      upvotes: 0,
      created_at: '2026-05-18T00:00:00.000Z'
    };
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([updatedReview]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/reviews/12')
      .set('Cookie', studentCookie())
      .send({
        rating: 5,
        comment: 'Updated after the second lecture.'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: updatedReview });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      1,
      'UPDATE Reviews SET rating = ?, comment = ? WHERE id = ? AND user_id = ?',
      [5, 'Updated after the second lecture.', '12', 7]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should not update a review owned by another user', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue({ affectedRows: 0 }),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/reviews/12')
      .set('Cookie', studentCookie())
      .send({
        rating: 4,
        comment: 'Trying to edit another review.'
      });

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({ status: 'error', message: 'Review not found' });
    expect(mockConn.query).toHaveBeenCalledWith(
      'UPDATE Reviews SET rating = ?, comment = ? WHERE id = ? AND user_id = ?',
      [4, 'Trying to edit another review.', '12', 7]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should delete a review when the requester owns it', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue({ affectedRows: 1 }),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .delete('/api/reviews/12')
      .set('Cookie', studentCookie());

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', message: 'Review deleted' });
    expect(mockConn.query).toHaveBeenCalledWith(
      'DELETE FROM Reviews WHERE id = ? AND user_id = ?',
      ['12', 7]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should reject desired-state review upvotes without authentication', async () => {
    const res = await request(app)
      .put('/api/reviews/12/upvote')
      .send({ upvoted: true });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({ status: 'error', message: 'Authentication required' });
  });

  it('should reject desired-state review upvotes with invalid payloads', async () => {
    const res = await request(app)
      .put('/api/reviews/12/upvote')
      .set('Cookie', studentCookie())
      .send({ upvoted: 'true' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'Valid upvoted state is required' });
  });

  it('should reject desired-state review upvotes with invalid review ids', async () => {
    const res = await request(app)
      .put('/api/reviews/not-a-review/upvote')
      .set('Cookie', studentCookie())
      .send({ upvoted: true });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'Valid review id is required' });
  });

  it('should reject desired-state review upvotes for missing reviews', async () => {
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn().mockResolvedValueOnce([]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/reviews/999/upvote')
      .set('Cookie', studentCookie())
      .send({ upvoted: true });

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({ status: 'error', message: 'Review not found' });
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.commit).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should idempotently add a desired-state review upvote', async () => {
    const updatedReview = {
      id: 12,
      user_id: 5,
      username: 'studenttwo',
      entity_type: 'course',
      entity_id: 3,
      rating: 5,
      comment: 'Very helpful.',
      upvotes: 1,
      has_upvoted: true,
      created_at: '2026-05-18T00:00:00.000Z'
    };
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn()
        .mockResolvedValueOnce([{ id: 12 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([updatedReview]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/reviews/12/upvote')
      .set('Cookie', studentCookie())
      .send({ upvoted: true });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: updatedReview });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      3,
      'INSERT INTO Review_Upvotes (review_id, user_id) VALUES (?, ?)',
      [12, 7]
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      4,
      'UPDATE Reviews SET upvotes = upvotes + 1 WHERE id = ?',
      [12]
    );
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should not double-count when desired-state review upvote is repeated', async () => {
    const updatedReview = {
      id: 12,
      user_id: 5,
      username: 'studenttwo',
      entity_type: 'course',
      entity_id: 3,
      rating: 5,
      comment: 'Very helpful.',
      upvotes: 1,
      has_upvoted: 1,
      created_at: '2026-05-18T00:00:00.000Z'
    };
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn()
        .mockResolvedValueOnce([{ id: 12 }])
        .mockResolvedValueOnce([{ review_id: 12 }])
        .mockResolvedValueOnce([updatedReview]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/reviews/12/upvote')
      .set('Cookie', studentCookie())
      .send({ upvoted: true });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: { ...updatedReview, has_upvoted: true } });
    expect(mockConn.query).not.toHaveBeenCalledWith(
      'UPDATE Reviews SET upvotes = upvotes + 1 WHERE id = ?',
      [12]
    );
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should idempotently remove a desired-state review upvote', async () => {
    const updatedReview = {
      id: 12,
      user_id: 5,
      username: 'studenttwo',
      entity_type: 'course',
      entity_id: 3,
      rating: 5,
      comment: 'Very helpful.',
      upvotes: 0,
      has_upvoted: false,
      created_at: '2026-05-18T00:00:00.000Z'
    };
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn()
        .mockResolvedValueOnce([{ id: 12 }])
        .mockResolvedValueOnce([{ review_id: 12 }])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([updatedReview]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/reviews/12/upvote')
      .set('Cookie', studentCookie())
      .send({ upvoted: false });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: updatedReview });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM Review_Upvotes WHERE review_id = ? AND user_id = ?',
      [12, 7]
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      4,
      'UPDATE Reviews SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = ?',
      [12]
    );
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should not decrement when desired-state review upvote removal is repeated', async () => {
    const updatedReview = {
      id: 12,
      user_id: 5,
      username: 'studenttwo',
      entity_type: 'course',
      entity_id: 3,
      rating: 5,
      comment: 'Very helpful.',
      upvotes: 0,
      has_upvoted: 0,
      created_at: '2026-05-18T00:00:00.000Z'
    };
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn()
        .mockResolvedValueOnce([{ id: 12 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([updatedReview]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/reviews/12/upvote')
      .set('Cookie', studentCookie())
      .send({ upvoted: false });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: { ...updatedReview, has_upvoted: false } });
    expect(mockConn.query).not.toHaveBeenCalledWith(
      'UPDATE Reviews SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = ?',
      [12]
    );
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return the authenticated student review history', async () => {
    const reviewHistory = [
      {
        id: 22,
        user_id: 7,
        username: 'studentone',
        entity_type: 'course',
        entity_id: 3,
        entity_title: 'SWE30003 Software Architectures and Design',
        entity_department: 'Software Engineering',
        rating: 5,
        comment: 'Clear architecture examples.',
        upvotes: 2,
        created_at: '2026-05-18T00:00:00.000Z'
      }
    ];
    const mockConn = {
      query: jest.fn().mockResolvedValue(reviewHistory),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .get('/api/users/7/reviews')
      .set('Cookie', studentCookie());

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: reviewHistory });
    expect(mockConn.query).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN Courses c ON r.entity_type = "course" AND c.id = r.entity_id'),
      [7]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should reject review history for another user id', async () => {
    const res = await request(app)
      .get('/api/users/8/reviews')
      .set('Cookie', studentCookie());

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({ status: 'error', message: 'Cannot access another user dashboard' });
  });
});

describe('Favorite endpoints', () => {
  const studentCookie = (id = 7) => {
    const token = jwt.sign(
      { id, role: 'student' },
      process.env.JWT_SECRET || 'development-jwt-secret',
      { expiresIn: '7d' }
    );
    return [`auth_token=${token}`];
  };

  const adminCookie = () => {
    const token = jwt.sign(
      { id: 1, role: 'admin' },
      process.env.JWT_SECRET || 'development-jwt-secret',
      { expiresIn: '7d' }
    );
    return [`auth_token=${token}`];
  };

  it('should save a favorite for the authenticated student', async () => {
    const favorite = {
      id: 3,
      user_id: 7,
      entity_type: 'course',
      entity_id: 2
    };
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce({ insertId: 3 })
        .mockResolvedValueOnce([favorite]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/users/7/favorites')
      .set('Cookie', studentCookie())
      .send({
        entity_type: 'course',
        entity_id: 2
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toEqual({ status: 'ok', data: favorite });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      1,
      'INSERT INTO Favorites (user_id, entity_type, entity_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
      [7, 'course', 2]
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id, user_id, entity_type, entity_id FROM Favorites WHERE id = ? LIMIT 1',
      [3]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return the authenticated student favorite tutors and courses', async () => {
    const favoriteTutors = [
      {
        id: 2,
        name: 'Prof Liam Patel',
        department: 'Information Systems',
        bio: 'Teaches database design.',
        created_at: '2026-05-18T00:00:00.000Z',
        updated_at: '2026-05-18T00:00:00.000Z',
        has_favorite: true
      }
    ];
    const favoriteCourses = [
      {
        id: 3,
        title: 'SWE30003 Software Architectures and Design',
        department: 'Software Engineering',
        description: 'Explore architectural patterns.',
        created_at: '2026-05-18T00:00:00.000Z',
        updated_at: '2026-05-18T00:00:00.000Z',
        tutor_ids: '1,3',
        tutor_names: 'Dr Maya Chen, Dr Amelia Wright',
        has_favorite: true
      }
    ];
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce(favoriteTutors)
        .mockResolvedValueOnce(favoriteCourses),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .get('/api/users/7/favorites')
      .set('Cookie', studentCookie());

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: {
        tutors: favoriteTutors,
        courses: favoriteCourses
      }
    });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INNER JOIN Tutors t ON t.id = f.entity_id'),
      [7]
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INNER JOIN Courses c ON c.id = f.entity_id'),
      [7]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should remove a saved favorite for the authenticated student', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue({ affectedRows: 1 }),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .delete('/api/users/7/favorites')
      .set('Cookie', studentCookie())
      .send({
        entity_type: 'tutor',
        entity_id: 4
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', message: 'Favorite removed' });
    expect(mockConn.query).toHaveBeenCalledWith(
      'DELETE FROM Favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?',
      [7, 'tutor', 4]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should reject favorites for another user id', async () => {
    const res = await request(app)
      .post('/api/users/8/favorites')
      .set('Cookie', studentCookie())
      .send({
        entity_type: 'course',
        entity_id: 2
      });

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({ status: 'error', message: 'Cannot manage favorites for another user' });
  });

  it('should reject reading favorites for another user id', async () => {
    const res = await request(app)
      .get('/api/users/8/favorites')
      .set('Cookie', studentCookie());

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({ status: 'error', message: 'Cannot access another user dashboard' });
  });

  it('should reject favorites from non-students', async () => {
    const res = await request(app)
      .post('/api/users/1/favorites')
      .set('Cookie', adminCookie())
      .send({
        entity_type: 'course',
        entity_id: 2
      });

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({ status: 'error', message: 'Student access required' });
  });

  it('should reject desired-state favorite updates without authentication', async () => {
    const res = await request(app)
      .put('/api/me/favorite')
      .send({
        entity_type: 'course',
        entity_id: 2,
        favorite: true
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({ status: 'error', message: 'Authentication required' });
  });

  it('should reject desired-state favorite updates with invalid payloads', async () => {
    const res = await request(app)
      .put('/api/me/favorite')
      .set('Cookie', studentCookie())
      .send({
        entity_type: 'course',
        entity_id: 2,
        favorite: 'true'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'Valid entity_type, entity_id, and favorite state are required' });
  });

  it('should reject desired-state favorite updates for invalid target kinds', async () => {
    const res = await request(app)
      .put('/api/me/favorite')
      .set('Cookie', studentCookie())
      .send({
        entity_type: 'program',
        entity_id: 2,
        favorite: true
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({ status: 'error', message: 'Valid entity_type, entity_id, and favorite state are required' });
  });

  it('should reject desired-state favorite updates for missing targets', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValueOnce([]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/me/favorite')
      .set('Cookie', studentCookie())
      .send({
        entity_type: 'tutor',
        entity_id: 999,
        favorite: true
      });

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({ status: 'error', message: 'Favorite target not found' });
    expect(mockConn.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM Tutors t'),
      [7, 999]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should idempotently add a desired-state favorite for the authenticated student', async () => {
    const target = {
      id: 2,
      title: 'COS20031 Database Design',
      department: 'Information Systems',
      description: 'Model relational data.',
      created_at: '2026-05-18T00:00:00.000Z',
      updated_at: '2026-05-18T00:00:00.000Z',
      tutor_ids: '2',
      tutor_names: 'Prof Liam Patel',
      has_favorite: 0
    };
    const updatedTarget = { ...target, has_favorite: 1 };
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([target])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([updatedTarget]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/me/favorite')
      .set('Cookie', studentCookie())
      .send({
        entity_type: 'course',
        entity_id: 2,
        favorite: true
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: {
        ...updatedTarget,
        entity_type: 'course',
        has_favorite: true
      }
    });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO Favorites (user_id, entity_type, entity_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
      [7, 'course', 2]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should not create duplicate favorites when desired-state add is repeated', async () => {
    const target = {
      id: 4,
      name: 'Dr Nina Park',
      department: 'Computer Science',
      bio: 'Teaches programming.',
      created_at: '2026-05-18T00:00:00.000Z',
      updated_at: '2026-05-18T00:00:00.000Z',
      has_favorite: 1
    };
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([target])
        .mockResolvedValueOnce({ affectedRows: 0 })
        .mockResolvedValueOnce([target]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/me/favorite')
      .set('Cookie', studentCookie())
      .send({
        entity_type: 'tutor',
        entity_id: 4,
        favorite: true
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: {
        ...target,
        entity_type: 'tutor',
        has_favorite: true
      }
    });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO Favorites (user_id, entity_type, entity_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
      [7, 'tutor', 4]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should idempotently remove a desired-state favorite for the authenticated student', async () => {
    const target = {
      id: 2,
      name: 'Prof Liam Patel',
      department: 'Information Systems',
      bio: 'Teaches database design.',
      created_at: '2026-05-18T00:00:00.000Z',
      updated_at: '2026-05-18T00:00:00.000Z',
      has_favorite: 1
    };
    const updatedTarget = { ...target, has_favorite: 0 };
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([target])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([updatedTarget]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/me/favorite')
      .set('Cookie', studentCookie())
      .send({
        entity_type: 'tutor',
        entity_id: 2,
        favorite: false
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: {
        ...updatedTarget,
        entity_type: 'tutor',
        has_favorite: false
      }
    });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM Favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?',
      [7, 'tutor', 2]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should keep repeated desired-state favorite removals as successful no-ops', async () => {
    const target = {
      id: 2,
      title: 'COS20031 Database Design',
      department: 'Information Systems',
      description: 'Model relational data.',
      created_at: '2026-05-18T00:00:00.000Z',
      updated_at: '2026-05-18T00:00:00.000Z',
      tutor_ids: '2',
      tutor_names: 'Prof Liam Patel',
      has_favorite: 0
    };
    const mockConn = {
      query: jest.fn()
        .mockResolvedValueOnce([target])
        .mockResolvedValueOnce({ affectedRows: 0 })
        .mockResolvedValueOnce([target]),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/me/favorite')
      .set('Cookie', studentCookie())
      .send({
        entity_type: 'course',
        entity_id: 2,
        favorite: false
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: {
        ...target,
        entity_type: 'course',
        has_favorite: false
      }
    });
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM Favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?',
      [7, 'course', 2]
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });
});
