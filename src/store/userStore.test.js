import { createPinia, setActivePinia } from 'pinia'
import { jest } from '@jest/globals'
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
