import request from 'supertest';
import app from './app.js';
import pool from './db.js';
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { buildGroqMessages } from './advisorGroq.js';
import { JWT_SECRET } from './middleware/auth.js';

afterAll(async () => {
  await pool.end();
});

const advisorRequest = (overrides = {}) => ({
  interestArea: 'Artificial Intelligence',
  learningFocus: ['AI', 'Software', 'Practical'],
  recommendationGoal: 'Explore best matches',
  experienceConfidence: 'Some experience',
  personalGoal: 'I want practical AI courses with good tutor support.',
  ...overrides
});

const originalGroqEnv = {
  GROQ_API: process.env.GROQ_API,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_model: process.env.GROQ_model,
  GROQ_MODEL: process.env.GROQ_MODEL
};

const restoreGroqEnv = () => {
  Object.entries(originalGroqEnv).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
};

const clearGroqEnv = () => {
  delete process.env.GROQ_API;
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_model;
  delete process.env.GROQ_MODEL;
};

const advisorRows = () => [
  {
    course_id: 1,
    course_title: 'Machine Learning',
    course_department: 'Artificial Intelligence',
    course_description: 'Build practical AI systems with machine learning software workflows.',
    average_rating: 4.5,
    review_count: 3,
    tutor_id: 10,
    tutor_name: 'Dr Example',
    tutor_department: 'Computing Technologies'
  },
  {
    course_id: 2,
    course_title: 'Database Design',
    course_department: 'Information Systems',
    course_description: 'Model relational data for enterprise systems.',
    average_rating: null,
    review_count: 0,
    tutor_id: 11,
    tutor_name: 'Prof Data',
    tutor_department: 'Information Systems'
  }
];

const studentToken = (overrides = {}) => jwt.sign(
  { id: 7, email: 'student@example.com', role: 'student', ...overrides },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const mockAdvisorConnection = (rows = advisorRows(), studentEvidenceRows = []) => {
  const mockConn = {
    query: jest.fn((sql) => {
      if (String(sql).includes('LEFT JOIN Favorites f')) {
        return Promise.resolve(studentEvidenceRows);
      }

      return Promise.resolve(rows);
    }),
    release: jest.fn()
  };
  jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

  return mockConn;
};

describe('POST /api/advisor/recommendations', () => {
  beforeEach(() => {
    clearGroqEnv();
  });

  afterEach(() => {
    restoreGroqEnv();
    jest.restoreAllMocks();
  });

  it('ranks preselected local Course candidates with Groq when a backend key is configured', async () => {
    process.env.GROQ_API = 'test-groq-key';
    process.env.GROQ_model = 'openai/gpt-oss-20b';

    const mockConn = mockAdvisorConnection();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'AI-ranked Course recommendations for Artificial Intelligence.',
                recommendations: [
                  {
                    courseId: 1,
                    score: 98,
                    reason: 'Machine Learning best matches the practical AI goal.',
                    evidence: ['Course Department matches Artificial Intelligence', 'Linked tutors available'],
                    limitations: []
                  },
                  {
                    courseId: 2,
                    score: 41,
                    reason: 'Database Design is a weaker adjacent systems option.',
                    evidence: ['Linked tutors available'],
                    limitations: ['Limited course review data is available.']
                  }
                ]
              })
            }
          }
        ]
      })
    });

    const res = await request(app)
      .post('/api/advisor/recommendations')
      .send(advisorRequest());

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.mode).toBe('ai');
    expect(res.body.data.summary).toBe('AI-ranked Course recommendations for Artificial Intelligence.');
    expect(res.body.data.limitations).toEqual([]);
    expect(res.body.data.recommendations[0]).toEqual(expect.objectContaining({
      course: {
        id: 1,
        title: 'Machine Learning',
        department: 'Artificial Intelligence',
        description: 'Build practical AI systems with machine learning software workflows.',
        has_favorite: false
      },
      score: 98,
      reason: 'Machine Learning best matches the practical AI goal.',
      evidence: ['Course Department matches Artificial Intelligence', 'Linked tutors available'],
      tutors: [
        {
          id: 10,
          name: 'Dr Example',
          department: 'Computing Technologies'
        }
      ],
      limitations: []
    }));
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-groq-key'
        })
      })
    );
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('does not call Groq and returns local recommendations when no backend key is configured', async () => {
    const mockConn = mockAdvisorConnection();
    const fetchSpy = jest.spyOn(global, 'fetch');

    const res = await request(app)
      .post('/api/advisor/recommendations')
      .send(advisorRequest());

    expect(res.statusCode).toBe(200);
    expect(res.body.data.mode).toBe('local');
    expect(res.body.data.limitations).toEqual(['Generated from local matching only.']);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('falls back to deterministic local recommendations when Groq fails or times out', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key';
    const mockConn = mockAdvisorConnection();
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Groq timed out'));

    const res = await request(app)
      .post('/api/advisor/recommendations')
      .send(advisorRequest());

    expect(res.statusCode).toBe(200);
    expect(res.body.data.mode).toBe('local');
    expect(res.body.data.summary).toBe('Local Course recommendations for Artificial Intelligence.');
    expect(res.body.data.limitations).toEqual([
      'Generated from local matching only.',
      'AI ranking is unavailable; showing deterministic local recommendations.'
    ]);
    expect(res.body.data.recommendations[0].course.title).toBe('Machine Learning');
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('falls back when Groq returns malformed JSON or ungrounded evidence', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key';
    const mockConn = mockAdvisorConnection();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Unsupported invented recommendation.',
                recommendations: [
                  {
                    courseId: 1,
                    score: 99,
                    reason: 'Machine Learning has official guaranteed career outcomes.',
                    evidence: ['Guaranteed job placement'],
                    limitations: []
                  }
                ]
              })
            }
          }
        ]
      })
    });

    const res = await request(app)
      .post('/api/advisor/recommendations')
      .send(advisorRequest());

    expect(res.statusCode).toBe(200);
    expect(res.body.data.mode).toBe('local');
    expect(res.body.data.limitations).toContain('AI ranking is unavailable; showing deterministic local recommendations.');
    expect(res.body.data.recommendations[0].evidence).not.toContain('Guaranteed job placement');
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('builds a Groq prompt from preselected app-owned Course candidates with explicit grounding rules', () => {
    const messages = buildGroqMessages(advisorRequest(), [
      {
        course: {
          id: 1,
          title: 'Machine Learning',
          department: 'Artificial Intelligence',
          description: 'Build practical AI systems with machine learning software workflows.'
        },
        score: 20,
        reason: 'Machine Learning is recommended because course department matches artificial intelligence.',
        evidence: ['Course Department matches Artificial Intelligence'],
        tutors: [
          {
            id: 10,
            name: 'Dr Example',
            department: 'Computing Technologies'
          }
        ],
        limitations: []
      }
    ]);

    const promptText = messages.map((message) => message.content).join('\n');
    const userPayload = JSON.parse(messages[1].content);

    expect(promptText).toContain('Use only the supplied app-owned Course candidate data');
    expect(promptText).toContain('Do not invent prerequisites, fees, availability, career outcomes, official university facts');
    expect(userPayload.candidates).toEqual([
      {
        course: {
          id: 1,
          title: 'Machine Learning',
          department: 'Artificial Intelligence',
          description: 'Build practical AI systems with machine learning software workflows.'
        },
        score: 20,
        reason: 'Machine Learning is recommended because course department matches artificial intelligence.',
        evidence: ['Course Department matches Artificial Intelligence'],
        tutors: [
          {
            id: 10,
            name: 'Dr Example',
            department: 'Computing Technologies'
          }
        ],
        limitations: []
      }
    ]);
    expect(promptText).not.toContain('Guaranteed job placement');
    expect(promptText).not.toContain('test-groq-key');
  });

  it('returns Course-first local recommendations for Guests by Course Department and focus', async () => {
    const mockConn = mockAdvisorConnection();

    const res = await request(app)
      .post('/api/advisor/recommendations')
      .send(advisorRequest());

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.mode).toBe('local');
    expect(res.body.data.limitations).toEqual(['Generated from local matching only.']);
    expect(res.body.data.recommendations).toHaveLength(2);
    expect(res.body.data.recommendations[0]).toEqual(expect.objectContaining({
      course: expect.objectContaining({
        id: 1,
        title: 'Machine Learning',
        department: 'Artificial Intelligence',
        description: 'Build practical AI systems with machine learning software workflows.',
        has_favorite: false
      }),
      evidence: expect.arrayContaining([
        'Course Department matches Artificial Intelligence',
        'Matches AI focus',
        'Linked tutors available',
        'Course rating 4.5 from 3 reviews'
      ]),
      tutors: [
        {
          id: 10,
          name: 'Dr Example',
          department: 'Computing Technologies'
        }
      ],
      limitations: []
    }));
    expect(res.body.data.recommendations[0].score).toBeGreaterThan(res.body.data.recommendations[1].score);
    expect(res.body.data.recommendations[0].reason).toContain('Machine Learning');
    expect(mockConn.query).toHaveBeenCalledWith(expect.stringContaining('FROM Courses c'));
    expect(mockConn.query.mock.calls[0][0]).toContain('LEFT JOIN Course_Tutors ct');
    expect(mockConn.query.mock.calls[0][0]).toContain('LEFT JOIN Tutors t');
    expect(mockConn.query.mock.calls[0][0]).toContain('WHERE r.entity_type = "course"');
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('returns closest Courses with an honest limitation when no exact Department match exists', async () => {
    const mockRows = [
      {
        course_id: 3,
        course_title: 'Software Engineering Project',
        course_department: 'Software Engineering',
        course_description: 'Deliver practical software with team-based project methods.',
        average_rating: null,
        review_count: 0,
        tutor_id: 12,
        tutor_name: 'Dr Builder',
        tutor_department: 'Engineering Practice'
      },
      {
        course_id: 4,
        course_title: 'Business Analytics',
        course_department: 'Business',
        course_description: 'Use analytics to support business decisions.',
        average_rating: 4,
        review_count: 1,
        tutor_id: null,
        tutor_name: null,
        tutor_department: null
      }
    ];
    const mockConn = mockAdvisorConnection(mockRows);

    const res = await request(app)
      .post('/api/advisor/recommendations')
      .send(advisorRequest({ interestArea: 'Artificial Intelligence' }));

    expect(res.statusCode).toBe(200);
    expect(res.body.data.recommendations).toHaveLength(2);
    expect(res.body.data.recommendations[0].course.title).toBe('Software Engineering Project');
    expect(res.body.data.limitations).toEqual([
      'Generated from local matching only.',
      'No exact Course Department match was found; showing closest local matches.'
    ]);
    expect(res.body.data.recommendations[0].limitations).toContain(
      'No exact Course Department match was found; showing closest local matches.'
    );
    expect(res.body.data.recommendations[0].limitations).toContain('Limited course review data is available.');
    expect(res.body.data.recommendations[1].limitations).toContain('No linked tutors are currently listed.');
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('uses Course Department, not Tutor staff affiliation, as the discovery Department signal', async () => {
    const mockRows = [
      {
        course_id: 5,
        course_title: 'Practical Software Studio',
        course_department: 'Software Engineering',
        course_description: 'AI software practical support for applied teams.',
        average_rating: 5,
        review_count: 4,
        tutor_id: 15,
        tutor_name: 'Dr AI Staff',
        tutor_department: 'Artificial Intelligence'
      },
      {
        course_id: 6,
        course_title: 'Foundations of Artificial Intelligence',
        course_department: 'Artificial Intelligence',
        course_description: 'Introductory AI concepts for new learners.',
        average_rating: null,
        review_count: 0,
        tutor_id: null,
        tutor_name: null,
        tutor_department: null
      }
    ];
    const mockConn = mockAdvisorConnection(mockRows);

    const res = await request(app)
      .post('/api/advisor/recommendations')
      .send(advisorRequest());

    expect(res.statusCode).toBe(200);
    expect(res.body.data.recommendations[0].course).toEqual(expect.objectContaining({
      id: 6,
      title: 'Foundations of Artificial Intelligence',
      department: 'Artificial Intelligence',
      description: 'Introductory AI concepts for new learners.',
      has_favorite: false
    }));
    expect(res.body.data.recommendations[0].evidence).toContain(
      'Course Department matches Artificial Intelligence'
    );
    expect(res.body.data.recommendations[1].course.department).toBe('Software Engineering');
    expect(res.body.data.recommendations[1].tutors[0].department).toBe('Artificial Intelligence');
    expect(res.body.data.recommendations[1].evidence).not.toContain(
      'Course Department matches Artificial Intelligence'
    );
    expect(mockConn.query.mock.calls[0][0]).not.toContain('t.department = ?');
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('keeps Guest recommendations public while authenticated Students receive favorite and review evidence', async () => {
    const mockConn = mockAdvisorConnection(advisorRows(), [
      {
        course_id: 1,
        has_favorite: 1,
        student_review_count: 1,
        student_average_rating: 5
      }
    ]);

    const guestRes = await request(app)
      .post('/api/advisor/recommendations')
      .send(advisorRequest());

    const studentRes = await request(app)
      .post('/api/advisor/recommendations')
      .set('Cookie', [`auth_token=${studentToken()}`])
      .send(advisorRequest());

    expect(guestRes.statusCode).toBe(200);
    expect(guestRes.body.data.personalization).toEqual({ active: false, signals: [] });
    expect(guestRes.body.data.recommendations[0].evidence).not.toContain('Saved in your Favorites');
    expect(guestRes.body.data.recommendations[0].course.has_favorite).toBe(false);

    expect(studentRes.statusCode).toBe(200);
    expect(studentRes.body.data.personalization).toEqual({
      active: true,
      signals: ['Favorites', 'Your review activity']
    });
    expect(studentRes.body.data.recommendations[0].course).toEqual(expect.objectContaining({
      id: 1,
      has_favorite: true
    }));
    expect(studentRes.body.data.recommendations[0].evidence).toEqual(expect.arrayContaining([
      'Saved in your Favorites',
      'You reviewed this Course with a 5.0 rating'
    ]));
    expect(studentRes.body.data.recommendations[0].score).toBeGreaterThan(
      guestRes.body.data.recommendations[0].score
    );
    expect(mockConn.query).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN Favorites f'),
      [7, 7]
    );
    expect(mockConn.release).toHaveBeenCalledTimes(2);
  });

  it('does not leak another Student favorite or review evidence into authenticated Advisor output', async () => {
    const mockConn = mockAdvisorConnection(advisorRows(), [
      {
        course_id: 1,
        has_favorite: 1,
        student_review_count: 0,
        student_average_rating: null
      }
    ]);

    const res = await request(app)
      .post('/api/advisor/recommendations')
      .set('Cookie', [`auth_token=${studentToken({ id: 7, email: 'current@student.test' })}`])
      .send(advisorRequest());

    const evidenceSql = mockConn.query.mock.calls.find(([sql]) => String(sql).includes('LEFT JOIN Favorites f'))[0];
    const outputText = JSON.stringify(res.body.data);

    expect(res.statusCode).toBe(200);
    expect(evidenceSql).toContain('f.user_id = ?');
    expect(evidenceSql).toContain('r.user_id = ?');
    expect(mockConn.query).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN Favorites f'), [7, 7]);
    expect(res.body.data.recommendations[0].evidence).toContain('Saved in your Favorites');
    expect(res.body.data.recommendations[1].evidence).not.toContain('Saved in your Favorites');
    expect(outputText).not.toContain('current@student.test');
    expect(outputText).not.toContain('other@student.test');
    expect(outputText).not.toContain('user_id');
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('does not persist Advisor conversations or generated recommendation results', async () => {
    const mockConn = mockAdvisorConnection();

    const res = await request(app)
      .post('/api/advisor/recommendations')
      .set('Cookie', [`auth_token=${studentToken()}`])
      .send(advisorRequest());

    const sqlText = mockConn.query.mock.calls
      .map(([sql]) => String(sql).replace(/\s+/g, ' ').trim().toLowerCase());

    expect(res.statusCode).toBe(200);
    expect(sqlText).toHaveLength(2);
    expect(sqlText.every((sql) => sql.startsWith('select'))).toBe(true);
    expect(sqlText.join(' ')).not.toMatch(/\b(insert|update|delete)\b/);
    expect(sqlText.join(' ')).not.toContain('advisor_conversations');
    expect(sqlText.join(' ')).not.toContain('advisor_results');
    expect(mockConn.release).toHaveBeenCalled();
  });
});
