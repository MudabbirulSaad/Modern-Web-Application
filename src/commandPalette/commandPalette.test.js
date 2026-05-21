import { jest } from '@jest/globals'
import { createPinia, setActivePinia } from 'pinia'
import {
  createCommandPaletteController,
  createCommandPaletteShortcutHandler,
  executeSmartNavigationCommand,
  parseOfflineCommand,
  submitCommandPaletteIntent
} from './commandPalette.js'
import { ApiError } from '../api/client.js'
import { useCourseStore } from '../store/courseStore.js'
import { useTutorStore } from '../store/tutorStore.js'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('command palette behavior', () => {
  it('opens from Cmd/Ctrl+K and focuses the input', async () => {
    const open = jest.fn()
    const focusInput = jest.fn()
    const handler = createCommandPaletteShortcutHandler({ open, focusInput })
    const event = {
      key: 'k',
      metaKey: true,
      ctrlKey: false,
      preventDefault: jest.fn()
    }

    handler(event)
    await Promise.resolve()

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledTimes(1)
    expect(focusInput).toHaveBeenCalledTimes(1)
  })

  it('does not call the backend while the user types and submits one online request', async () => {
    const apiRequest = jest.fn(async () => ({
      action: 'NAVIGATE',
      route: '/courses',
      domain: 'courses',
      filters: {},
      confidence: 0.9,
      reason: 'Courses route'
    }))
    const router = { push: jest.fn(async () => {}) }
    const controller = createCommandPaletteController({
      apiRequest,
      router,
      isOnline: () => true
    })

    controller.open()
    controller.updateIntent('courses')

    expect(apiRequest).not.toHaveBeenCalled()

    await controller.submit()

    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest).toHaveBeenCalledWith('/api/smart-navigation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ intent: 'courses' })
    })
    expect(router.push).toHaveBeenCalledWith({ path: '/courses' })
    expect(controller.isOpen()).toBe(false)
  })

  it('applies validated course filters before navigation', async () => {
    const router = { push: jest.fn(async () => {}) }

    const result = await executeSmartNavigationCommand({
      action: 'FILTER',
      route: '/courses',
      domain: 'courses',
      filters: {
        search: 'Databases',
        department: 'ICT',
        sort: 'recently-active',
        page: 2,
        limit: 6,
        unsafe: 'ignored'
      },
      confidence: 1,
      reason: 'Filter courses'
    }, router)
    const courseStore = useCourseStore()

    expect(result).toEqual({ executed: true })
    expect(courseStore.searchQuery).toBe('Databases')
    expect(courseStore.departmentFilter).toBe('ICT')
    expect(courseStore.sortOrder).toBe('recently-active')
    expect(courseStore.currentPage).toBe(2)
    expect(router.push).toHaveBeenCalledWith({ path: '/courses' })
  })

  it('applies validated tutor filters before navigation', async () => {
    const router = { push: jest.fn(async () => {}) }

    const result = await executeSmartNavigationCommand({
      action: 'FILTER',
      route: '/tutors',
      domain: 'tutors',
      filters: {
        search: 'Ada',
        department: 'Computer Science',
        sort: 'alphabetical',
        page: '3',
        limit: 6
      },
      confidence: 0.95,
      reason: 'Filter tutors'
    }, router)
    const tutorStore = useTutorStore()

    expect(result).toEqual({ executed: true })
    expect(tutorStore.searchQuery).toBe('Ada')
    expect(tutorStore.departmentFilter).toBe('Computer Science')
    expect(tutorStore.sortOrder).toBe('alphabetical')
    expect(tutorStore.currentPage).toBe(3)
    expect(router.push).toHaveBeenCalledWith({ path: '/tutors' })
  })

  it('rejects invalid filter commands inline without navigating', async () => {
    const router = { push: jest.fn(async () => {}) }

    const result = await executeSmartNavigationCommand({
      action: 'FILTER',
      route: '/courses',
      domain: 'courses',
      filters: { sort: 'delete-all', page: 1, limit: 6 },
      confidence: 1,
      reason: 'Bad sort'
    }, router)

    expect(result).toEqual({
      executed: false,
      feedback: 'Unsupported navigation command'
    })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('rejects uncertain commands, unsupported domains, and mutating actions before router guards run', async () => {
    const router = { push: jest.fn(async () => {}) }

    await expect(executeSmartNavigationCommand({
      action: 'FILTER',
      route: '/tutors',
      domain: 'tutors',
      filters: { search: 'Ada' },
      confidence: 0.3,
      reason: 'Maybe tutors'
    }, router)).resolves.toEqual({
      executed: false,
      feedback: 'Unsupported navigation command'
    })

    await expect(executeSmartNavigationCommand({
      action: 'FILTER',
      route: '/courses',
      domain: 'tutors',
      filters: { search: 'Ada' },
      confidence: 1,
      reason: 'Mismatched domain'
    }, router)).resolves.toEqual({
      executed: false,
      feedback: 'Unsupported navigation command'
    })

    await expect(executeSmartNavigationCommand({
      action: 'TOGGLE_FAVORITE',
      route: '/courses',
      domain: 'courses',
      filters: { targetId: '1', desiredFavorite: 'true' },
      confidence: 1,
      reason: 'Mutate favorite'
    }, router)).resolves.toEqual({
      executed: false,
      feedback: 'Unsupported navigation command'
    })

    await expect(executeSmartNavigationCommand({
      action: 'NAVIGATE',
      route: '/admin',
      domain: 'admin',
      filters: {},
      confidence: 1,
      reason: 'Admin'
    }, router)).resolves.toEqual({
      executed: false,
      feedback: 'Unsupported navigation command'
    })

    expect(router.push).not.toHaveBeenCalled()
  })

  it('returns executed true when router.push resolves successfully (undefined = no failure)', async () => {
    const router = { push: jest.fn(async () => undefined) }

    const result = await executeSmartNavigationCommand({
      action: 'NAVIGATE',
      route: '/courses',
      domain: 'courses',
      filters: {},
      confidence: 1,
      reason: 'Navigate to courses'
    }, router)

    expect(result).toEqual({ executed: true })
    expect(router.push).toHaveBeenCalledWith({ path: '/courses' })
  })

  it('parses simple offline route and search commands', () => {
    expect(parseOfflineCommand('Courses')).toMatchObject({
      action: 'NAVIGATE',
      route: '/courses',
      domain: 'courses'
    })
    expect(parseOfflineCommand('search tutors for algorithms')).toMatchObject({
      action: 'SEARCH',
      route: '/tutors',
      domain: 'tutors',
      filters: { search: 'algorithms' }
    })
  })

  it('returns inline NONE feedback for unsupported offline commands', async () => {
    const apiRequest = jest.fn()
    const router = { push: jest.fn(async () => {}) }
    const controller = createCommandPaletteController({
      apiRequest,
      router,
      isOnline: () => false
    })

    controller.open()
    controller.updateIntent('show me my favourite reviewers')
    await controller.submit()

    expect(apiRequest).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    expect(controller.feedback()).toBe('Offline command not supported. Try Courses, Tutors, or a simple search.')
    expect(controller.isOpen()).toBe(true)
  })

  it('shows inline 429 feedback and keeps the palette open', async () => {
    const apiRequest = jest.fn(async () => {
      throw new ApiError('Too many smart-navigation requests', { status: 429 })
    })
    const router = { push: jest.fn(async () => {}) }

    const result = await submitCommandPaletteIntent({
      intent: 'courses',
      apiRequest,
      router,
      online: true
    })

    expect(result).toEqual({
      executed: false,
      feedback: 'Too many smart-navigation requests. Please wait and try again.'
    })
    expect(router.push).not.toHaveBeenCalled()
  })
})
