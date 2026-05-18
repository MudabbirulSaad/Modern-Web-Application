import request from 'supertest';
import app from './index';
import pool from './db';
import { jest } from '@jest/globals';

afterAll(async () => {
  await pool.end();
});

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
      query: jest.fn().mockResolvedValue(mockTutors),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app).get('/api/tutors');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockTutors });
    expect(mockConn.query).toHaveBeenCalledWith(
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
      query: jest.fn().mockResolvedValue(mockCourses),
      release: jest.fn()
    };
    const spy = jest.spyOn(pool, 'getConnection').mockResolvedValue(mockConn);

    const res = await request(app).get('/api/courses');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: mockCourses });
    expect(mockConn.query).toHaveBeenCalledWith(
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
});
