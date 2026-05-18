import request from 'supertest';
import app from './index';
import pool from './db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
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
      'INSERT INTO Tutors (name, department, bio) VALUES (?, ?, ?)',
      ['Dr Nora Banks', 'Computer Science', 'Teaches client-side engineering and accessibility.']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id, name, department, bio, created_at, updated_at FROM Tutors WHERE id = ? LIMIT 1',
      [4]
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
      'UPDATE Tutors SET name = ?, department = ?, bio = ? WHERE id = ?',
      ['Dr Nora Banks', 'Software Engineering', 'Leads frontend architecture and accessibility studios.', '4']
    );
    expect(mockConn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should return 404 when updating a missing tutor', async () => {
    const mockConn = {
      query: jest.fn().mockResolvedValue({ affectedRows: 0 }),
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
      'INSERT INTO Courses (title, department, description) VALUES (?, ?, ?)',
      ['COS10005 Web Development', 'Computer Science', 'Build accessible web applications.']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO Course_Tutors (course_id, tutor_id) VALUES (?, ?), (?, ?)',
      [4, 1, 4, 3]
    );
    expect(mockConn.commit).toHaveBeenCalled();
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
      'UPDATE Courses SET title = ?, department = ?, description = ? WHERE id = ?',
      ['COS10005 Web Development', 'Computer Science', 'Build accessible and responsive web applications.', '4']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM Course_Tutors WHERE course_id = ?',
      ['4']
    );
    expect(mockConn.query).toHaveBeenNthCalledWith(
      3,
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
      query: jest.fn().mockResolvedValue({ affectedRows: 0 }),
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
