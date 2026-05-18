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
