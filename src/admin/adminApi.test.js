import { jest } from '@jest/globals'
import {
  createCourse,
  createTutor,
  deleteCourse,
  deleteTutor,
  fetchCourse,
  listCourses,
  listUsers,
  listTutors,
  updateUserRole,
  updateCourse,
  updateTutor
} from './adminApi.js'

const jsonResponse = ({ ok = true, body = {} } = {}) => ({
  ok,
  json: jest.fn(async () => body)
})

describe('admin API adapter', () => {
  it('uses admin tutor management requests with credentials and JSON payloads', async () => {
    const fetcher = jest.fn(async () => jsonResponse({ body: { data: { id: 1 } } }))

    await createTutor({
      name: 'Ada Lovelace',
      department: 'Computer Science',
      bio: 'Teaches algorithms.',
      fetcher
    })
    await updateTutor({
      tutorId: 1,
      name: 'Ada Updated',
      department: 'Software Engineering',
      bio: 'Updated bio.',
      fetcher
    })
    await deleteTutor({ tutorId: 1, fetcher })

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/tutors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: 'Ada Lovelace',
        department: 'Computer Science',
        bio: 'Teaches algorithms.'
      })
    })
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/tutors/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: 'Ada Updated',
        department: 'Software Engineering',
        bio: 'Updated bio.'
      })
    })
    expect(fetcher).toHaveBeenNthCalledWith(3, '/api/tutors/1', {
      method: 'DELETE',
      credentials: 'include'
    })
  })

  it('uses admin course management requests with detail loading and assigned tutors', async () => {
    const fetcher = jest.fn(async () => jsonResponse({ body: { data: { id: 2 } } }))

    await listTutors({ fetcher })
    await listCourses({ fetcher })
    await fetchCourse({ courseId: 2, fetcher })
    await createCourse({
      title: 'COS10005 Web Development',
      department: 'Computer Science',
      description: 'Builds web applications.',
      tutorIds: [1, 3],
      fetcher
    })
    await updateCourse({
      courseId: 2,
      title: 'COS10005 Web Development',
      department: 'Computer Science',
      description: 'Updated.',
      tutorIds: [3],
      fetcher
    })
    await deleteCourse({ courseId: 2, fetcher })

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/tutors')
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/courses')
    expect(fetcher).toHaveBeenNthCalledWith(3, '/api/courses/2')
    expect(fetcher).toHaveBeenNthCalledWith(4, '/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: 'COS10005 Web Development',
        department: 'Computer Science',
        description: 'Builds web applications.',
        tutorIds: [1, 3]
      })
    })
    expect(fetcher).toHaveBeenNthCalledWith(5, '/api/courses/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: 'COS10005 Web Development',
        department: 'Computer Science',
        description: 'Updated.',
        tutorIds: [3]
      })
    })
    expect(fetcher).toHaveBeenNthCalledWith(6, '/api/courses/2', {
      method: 'DELETE',
      credentials: 'include'
    })
  })

  it('maps backend error messages from failed admin responses', async () => {
    const fetcher = jest.fn(async () => jsonResponse({
      ok: false,
      body: { message: 'Duplicate tutor name' }
    }))

    await expect(createTutor({
      name: 'Ada Lovelace',
      department: 'Computer Science',
      bio: 'Teaches algorithms.',
      fetcher
    })).rejects.toThrow('Duplicate tutor name')
  })

  it('loads admin users through the admin-only directory endpoint', async () => {
    const users = [
      {
        id: 1,
        username: 'primaryadmin',
        email: 'primary@example.edu',
        role: 'admin',
        is_primary_admin: true,
        is_current_user: false
      }
    ]
    const fetcher = jest.fn(async () => jsonResponse({ body: { data: users } }))

    await expect(listUsers({ fetcher })).resolves.toEqual(users)

    expect(fetcher).toHaveBeenCalledWith('/api/admin/users', {
      credentials: 'include'
    })
  })

  it('maps admin user loading failures to a useful fallback message', async () => {
    const fetcher = jest.fn(async () => jsonResponse({ ok: false, body: {} }))

    await expect(listUsers({ fetcher })).rejects.toThrow('Unable to load users')
  })

  it('updates admin user roles with credentials and JSON payloads', async () => {
    const updatedUser = {
      id: 3,
      username: 'standardstudent',
      email: 'student@example.edu',
      role: 'admin'
    }
    const fetcher = jest.fn(async () => jsonResponse({ body: { data: updatedUser } }))

    await expect(updateUserRole({
      userId: 3,
      role: 'admin',
      fetcher
    })).resolves.toEqual(updatedUser)

    expect(fetcher).toHaveBeenCalledWith('/api/admin/users/3/role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role: 'admin' })
    })
  })

  it('maps admin user role update failures to backend or fallback messages', async () => {
    const backendFailure = jest.fn(async () => jsonResponse({
      ok: false,
      body: { message: 'Primary Admin cannot be demoted' }
    }))
    const fallbackFailure = jest.fn(async () => jsonResponse({ ok: false, body: {} }))

    await expect(updateUserRole({
      userId: 1,
      role: 'student',
      fetcher: backendFailure
    })).rejects.toThrow('Primary Admin cannot be demoted')
    await expect(updateUserRole({
      userId: 3,
      role: 'admin',
      fetcher: fallbackFailure
    })).rejects.toThrow('Unable to update user role')
  })
})
