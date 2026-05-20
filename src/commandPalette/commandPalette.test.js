import { jest } from '@jest/globals'
import {
  createCommandPaletteController,
  createCommandPaletteShortcutHandler,
  executeSmartNavigationCommand,
  parseOfflineCommand,
  submitCommandPaletteIntent
} from './commandPalette.js'
import { ApiError } from '../api/client.js'

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
    expect(router.push).toHaveBeenCalledWith({ path: '/courses', query: {} })
    expect(controller.isOpen()).toBe(false)
  })

  it('executes online navigation through the router', async () => {
    const router = { push: jest.fn(async () => {}) }

    const result = await executeSmartNavigationCommand({
      action: 'SEARCH',
      route: '/tutors',
      domain: 'tutors',
      filters: { search: 'Ada', unsafe: 'ignored' },
      confidence: 1,
      reason: 'Search tutors'
    }, router)

    expect(result).toEqual({ executed: true })
    expect(router.push).toHaveBeenCalledWith({
      path: '/tutors',
      query: { search: 'Ada' }
    })
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
