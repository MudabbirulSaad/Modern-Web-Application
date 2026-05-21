import { jest } from '@jest/globals'
import { createAuthGuard } from './authGuard.js'

describe('auth route guard', () => {
  it('redirects an authenticated student away from guest-only routes to the student dashboard', async () => {
    const store = {
      sessionInitialized: false,
      isAuthenticated: false,
      isStudent: false,
      isAdmin: false,
      initializeSession: jest.fn(async function initializeSession() {
        this.sessionInitialized = true
        this.isAuthenticated = true
        this.isStudent = true
      })
    }
    const guard = createAuthGuard(() => store)

    const result = await guard({ meta: { requiresGuest: true } })

    expect(result).toEqual({ name: 'student-dashboard' })
    expect(store.initializeSession).toHaveBeenCalledTimes(1)
  })

  it('redirects an authenticated admin away from guest-only routes to the admin dashboard', async () => {
    const store = {
      sessionInitialized: false,
      isAuthenticated: false,
      isStudent: false,
      isAdmin: false,
      initializeSession: jest.fn(async function initializeSession() {
        this.sessionInitialized = true
        this.isAuthenticated = true
        this.isAdmin = true
      })
    }
    const guard = createAuthGuard(() => store)

    const result = await guard({ meta: { requiresGuest: true } })

    expect(result).toEqual({ name: 'admin-dashboard' })
    expect(store.initializeSession).toHaveBeenCalledTimes(1)
  })

  it('allows unauthenticated guests to visit guest-only routes after session initialization', async () => {
    const store = {
      sessionInitialized: false,
      isAuthenticated: false,
      isStudent: false,
      isAdmin: false,
      initializeSession: jest.fn(async function initializeSession() {
        this.sessionInitialized = true
      })
    }
    const guard = createAuthGuard(() => store)

    const result = await guard({ meta: { requiresGuest: true } })

    expect(result).toBe(true)
    expect(store.initializeSession).toHaveBeenCalledTimes(1)
  })

  it('waits for session initialization before allowing a restored student route', async () => {
    const store = {
      sessionInitialized: false,
      isAuthenticated: false,
      isStudent: false,
      isAdmin: false,
      initializeSession: jest.fn(async function initializeSession() {
        this.sessionInitialized = true
        this.isAuthenticated = true
        this.isStudent = true
      })
    }
    const guard = createAuthGuard(() => store)

    const result = await guard({ meta: { requiresStudent: true } })

    expect(result).toBe(true)
    expect(store.initializeSession).toHaveBeenCalledTimes(1)
  })

  it('redirects protected routes to login after session initialization finds no user', async () => {
    const store = {
      sessionInitialized: false,
      isAuthenticated: false,
      isStudent: false,
      isAdmin: false,
      initializeSession: jest.fn(async function initializeSession() {
        this.sessionInitialized = true
      })
    }
    const guard = createAuthGuard(() => store)

    const result = await guard({ meta: { requiresAdmin: true } })

    expect(result).toEqual({ name: 'login' })
    expect(store.initializeSession).toHaveBeenCalledTimes(1)
  })
})
