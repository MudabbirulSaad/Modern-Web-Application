import request from 'supertest';
import app from './app.js';
import pool from './db.js';
import { jest } from '@jest/globals';

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

describe('POST /api/advisor/recommendations', () => {
  it('returns Course-first local recommendations for Guests by Course Department and focus', async () => {
    const mockRows = [
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
    const mockConn = {
      query: jest.fn().mockResolvedValue(mockRows),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/advisor/recommendations')
      .send(advisorRequest());

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.mode).toBe('local');
    expect(res.body.data.limitations).toEqual(['Generated from local matching only.']);
    expect(res.body.data.recommendations).toHaveLength(2);
    expect(res.body.data.recommendations[0]).toEqual(expect.objectContaining({
      course: {
        id: 1,
        title: 'Machine Learning',
        department: 'Artificial Intelligence',
        description: 'Build practical AI systems with machine learning software workflows.'
      },
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

    spy.mockRestore();
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
    const mockConn = {
      query: jest.fn().mockResolvedValue(mockRows),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

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

    spy.mockRestore();
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
    const mockConn = {
      query: jest.fn().mockResolvedValue(mockRows),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/advisor/recommendations')
      .send(advisorRequest());

    expect(res.statusCode).toBe(200);
    expect(res.body.data.recommendations[0].course).toEqual({
      id: 6,
      title: 'Foundations of Artificial Intelligence',
      department: 'Artificial Intelligence',
      description: 'Introductory AI concepts for new learners.'
    });
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

    spy.mockRestore();
  });
});
