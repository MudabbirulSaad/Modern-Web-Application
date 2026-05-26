import { routes } from './routes.js'

describe('application routes', () => {
  it('exposes departments as a public discovery route without changing existing directory routes', () => {
    expect(routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/departments', name: 'departments' }),
      expect.objectContaining({ path: '/advisor', name: 'advisor' }),
      expect.objectContaining({ path: '/courses', name: 'courses' }),
      expect.objectContaining({ path: '/courses/:id', name: 'course-detail' }),
      expect.objectContaining({ path: '/tutors', name: 'tutors' }),
      expect.objectContaining({ path: '/tutors/:id', name: 'tutor-detail' }),
      expect.objectContaining({ path: '/register', name: 'register' }),
      expect.objectContaining({ path: '/login', name: 'login' }),
      expect.objectContaining({ path: '/dashboard', name: 'student-dashboard' }),
      expect.objectContaining({ path: '/admin', name: 'admin-dashboard' })
    ]))

    const departmentsRoute = routes.find((route) => route.name === 'departments')
    expect(departmentsRoute.meta).toBeUndefined()

    const advisorRoute = routes.find((route) => route.name === 'advisor')
    expect(advisorRoute.meta).toBeUndefined()
  })
})
