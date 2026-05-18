import { jest } from '@jest/globals'
import { createAuthGuard } from './authGuard.js'

describe('auth route guard', () => {
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
