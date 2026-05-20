import { createPinia, setActivePinia } from 'pinia'
import { jest } from '@jest/globals'
import { apiRequest, configureApiClient } from '../api/client.js'
import { useUserStore } from './userStore.js'

const storage = new Map()

beforeEach(() => {
  storage.clear()
  global.localStorage = {
    getItem: jest.fn((key) => storage.get(key) || null),
    setItem: jest.fn((key, value) => storage.set(key, value))
  }
  global.window = {
    matchMedia: jest.fn(() => ({ matches: false }))
  }
  global.document = {
    documentElement: {
      setAttribute: jest.fn()
    }
  }
  global.fetch = jest.fn()
  configureApiClient({ onUnauthorized: null })
  setActivePinia(createPinia())
})

describe('user theme preference', () => {
  it('cycles through light, dark, and system themes while persisting the preference', () => {
    const store = useUserStore()

    store.setTheme('light')
    store.cycleTheme()
    expect(store.theme).toBe('dark')
    expect(localStorage.setItem).toHaveBeenLastCalledWith('theme', 'dark')
    expect(document.documentElement.setAttribute).toHaveBeenLastCalledWith('data-bs-theme', 'dark')

    store.cycleTheme()
    expect(store.theme).toBe('auto')
    expect(localStorage.setItem).toHaveBeenLastCalledWith('theme', 'auto')
    expect(document.documentElement.setAttribute).toHaveBeenLastCalledWith('data-bs-theme', 'light')

    store.cycleTheme()
    expect(store.theme).toBe('light')
    expect(localStorage.setItem).toHaveBeenLastCalledWith('theme', 'light')
    expect(document.documentElement.setAttribute).toHaveBeenLastCalledWith('data-bs-theme', 'light')
  })
})

describe('user session invalidation', () => {
  it('uses the shared invalidation path when the api client observes a 401', async () => {
    const store = useUserStore()
    store.setUser({ id: 1, role: 'student' })
    store.sessionInitialized = false
    configureApiClient({
      onUnauthorized: () => store.invalidateSession()
    })
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: {
        get: jest.fn(() => 'application/json')
      },
      json: jest.fn(async () => ({ message: 'Session expired' }))
    })

    await expect(apiRequest('/api/private')).rejects.toMatchObject({ status: 401 })

    expect(store.user).toBeNull()
    expect(store.userId).toBeNull()
    expect(store.role).toBeNull()
    expect(store.loggedIn).toBe(false)
    expect(store.sessionInitialized).toBe(true)
  })
})
