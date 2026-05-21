import { jest } from '@jest/globals'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  createCommandPaletteController,
  createCommandPaletteShortcutHandler,
  createGlobalPaletteSearch,
  fetchGlobalPaletteSearch,
  executeSmartNavigationCommand,
  executeGlobalPaletteResult,
  executeGlobalPaletteViewAll,
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
    expect(router.push).toHaveBeenCalledWith({
      path: '/courses',
      query: {
        search: 'Databases',
        department: 'ICT',
        sort: 'recently-active',
        page: '2'
      }
    })
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
    expect(router.push).toHaveBeenCalledWith({
      path: '/tutors',
      query: {
        search: 'Ada',
        department: 'Computer Science',
        sort: 'alphabetical',
        page: '3'
      }
    })
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
    expect(parseOfflineCommand('search professors for cyber security')).toMatchObject({
      action: 'SEARCH',
      route: '/tutors',
      domain: 'tutors',
      filters: { search: 'cyber security' }
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

  it('returns grouped course and tutor search results with highlighted matches', () => {
    const results = createGlobalPaletteSearch({
      intent: 'database',
      courses: [
        {
          id: 7,
          title: 'COS20031 Database Design',
          department: 'Information Systems',
          description: 'Model relational data.',
          tutor_names: 'Prof Liam Patel'
        },
        {
          id: 8,
          title: 'COS10005 Web Development',
          department: 'Computer Science',
          description: 'Build accessible web applications.'
        }
      ],
      tutors: [
        {
          id: 4,
          name: 'Prof Liam Patel',
          department: 'Information Systems',
          bio: 'Teaches database design and enterprise systems.'
        }
      ]
    })

    expect(results.hasQuery).toBe(true)
    expect(results.hasMatches).toBe(true)
    expect(results.courses).toHaveLength(1)
    expect(results.tutors).toHaveLength(1)
    expect(results.courses[0]).toMatchObject({
      id: 7,
      kind: 'course',
      title: 'COS20031 Database Design',
      code: 'COS20031',
      department: 'Information Systems'
    })
    expect(results.courses[0].highlights.title).toContainEqual({
      text: 'Database',
      match: true
    })
    expect(results.tutors[0].highlights.bio).toContainEqual({
      text: 'database',
      match: true
    })
  })

  it('returns a clear no-match state for deterministic search misses', () => {
    const results = createGlobalPaletteSearch({
      intent: 'quantum',
      courses: [{ id: 1, title: 'Database Design', department: 'Information Systems' }],
      tutors: [{ id: 2, name: 'Maya Chen', department: 'Computer Science', bio: 'Frontend engineering.' }]
    })

    expect(results).toMatchObject({
      query: 'quantum',
      hasQuery: true,
      hasMatches: false,
      courses: [],
      tutors: []
    })
  })

  it.each([
    ['cyber security', 'ICT300 Cybersecurity'],
    ['cyber-security', 'ICT300 Cybersecurity'],
    ['IT security', 'COS30015 IT Security']
  ])('discovers security results from plain palette search for %s', (intent, courseTitle) => {
    const results = createGlobalPaletteSearch({
      intent,
      courses: [
        {
          id: 15,
          title: courseTitle,
          department: 'Information Technology',
          description: 'Security principles for connected systems.',
          tutor_names: 'Cybersecurity Tutor'
        }
      ],
      tutors: [
        {
          id: 8,
          name: 'Cybersecurity Tutor',
          department: 'Information Technology',
          bio: 'Lecturer for IT security and secure systems.'
        }
      ]
    })

    expect(results).toMatchObject({
      hasQuery: true,
      hasMatches: true,
      courses: [expect.objectContaining({ id: 15, kind: 'course' })],
      tutors: [expect.objectContaining({ id: 8, kind: 'tutor' })]
    })
  })

  it('navigates result clicks to detail pages', async () => {
    const router = { push: jest.fn(async () => {}) }

    await executeGlobalPaletteResult({ kind: 'course', id: 7 }, router)
    await executeGlobalPaletteResult({ kind: 'tutor', id: 4 }, router)

    expect(router.push).toHaveBeenNthCalledWith(1, {
      name: 'course-detail',
      params: { id: 7 }
    })
    expect(router.push).toHaveBeenNthCalledWith(2, {
      name: 'tutor-detail',
      params: { id: 4 }
    })
  })

  it('navigates view-all actions to URL-backed filtered lists', async () => {
    const router = { push: jest.fn(async () => {}) }

    await executeGlobalPaletteViewAll('courses', 'database', router)
    await executeGlobalPaletteViewAll('tutors', 'Maya Chen', router)

    expect(useCourseStore()).toMatchObject({
      searchQuery: 'database',
      sortOrder: 'best-match',
      currentPage: 1
    })
    expect(useTutorStore()).toMatchObject({
      searchQuery: 'Maya Chen',
      sortOrder: 'best-match',
      currentPage: 1
    })
    expect(router.push).toHaveBeenNthCalledWith(1, {
      path: '/courses',
      query: { search: 'database' }
    })
    expect(router.push).toHaveBeenNthCalledWith(2, {
      path: '/tutors',
      query: { search: 'Maya Chen' }
    })
  })

  it('updates plain search results while typing without calling the provider', () => {
    const apiRequest = jest.fn()
    const router = { push: jest.fn(async () => {}) }
    const controller = createCommandPaletteController({
      apiRequest,
      router,
      isOnline: () => true,
      getCourses: () => [{ id: 7, title: 'Database Design', department: 'Information Systems' }],
      getTutors: () => [{ id: 4, name: 'Maya Chen', department: 'Computer Science', bio: 'Databases.' }]
    })

    controller.open()
    controller.updateIntent('database')

    expect(apiRequest).not.toHaveBeenCalled()
    expect(controller.searchResults()).toMatchObject({
      hasMatches: true,
      courses: [expect.objectContaining({ id: 7 })],
      tutors: [expect.objectContaining({ id: 4 })]
    })
  })

  it('fetches palette search from directory APIs instead of populated Pinia maps or the Groq endpoint', async () => {
    const apiRequest = jest.fn(async (url) => {
      if (url.startsWith('/api/courses?')) {
        return {
          data: [{
            id: 9,
            title: 'COS20031 Database Design',
            department: 'Information Systems',
            description: 'Model data.'
          }]
        }
      }

      if (url.startsWith('/api/tutors?')) {
        return {
          data: [{
            id: 3,
            name: 'Liam Patel',
            department: 'Information Systems',
            bio: 'Database systems.'
          }]
        }
      }

      throw new Error('Unexpected request: ' + url)
    })

    const results = await fetchGlobalPaletteSearch({
      intent: 'database',
      apiRequest
    })

    expect(apiRequest).toHaveBeenCalledTimes(2)
    expect(apiRequest.mock.calls[0][0]).toContain('/api/courses?')
    expect(apiRequest.mock.calls[0][0]).toContain('search=database')
    expect(apiRequest.mock.calls[0][0]).toContain('limit=4')
    expect(apiRequest.mock.calls[1][0]).toContain('/api/tutors?')
    expect(apiRequest.mock.calls.map(([url]) => url)).not.toContain('/api/smart-navigation')
    expect(results).toMatchObject({
      hasMatches: true,
      courses: [expect.objectContaining({ id: 9 })],
      tutors: [expect.objectContaining({ id: 3 })]
    })
  })

  it('uses deterministic /navigate matching for exact course and tutor detail pages before Groq', async () => {
    const apiRequest = jest.fn(async (url) => {
      if (url.startsWith('/api/courses?')) {
        return {
          data: url.includes('COS30015')
            ? [{ id: 15, title: 'COS30015 IT Security', department: 'Computing Technologies' }]
            : []
        }
      }

      if (url.startsWith('/api/tutors?')) {
        return {
          data: url.includes('Maya+Chen')
            ? [{ id: 4, name: 'Maya Chen', department: 'Computing Technologies' }]
            : []
        }
      }

      throw new Error('Unexpected request: ' + url)
    })
    const router = { push: jest.fn(async () => {}) }

    await expect(submitCommandPaletteIntent({
      intent: '/navigate take me to COS30015',
      apiRequest,
      router,
      online: true
    })).resolves.toEqual({ executed: true })
    await expect(submitCommandPaletteIntent({
      intent: '/navigate take me to Maya Chen',
      apiRequest,
      router,
      online: true
    })).resolves.toEqual({ executed: true })

    expect(router.push).toHaveBeenNthCalledWith(1, {
      name: 'course-detail',
      params: { id: 15 }
    })
    expect(router.push).toHaveBeenNthCalledWith(2, {
      name: 'tutor-detail',
      params: { id: 4 }
    })
    expect(apiRequest.mock.calls.map(([url]) => url)).not.toContain('/api/smart-navigation')
  })

  it('uses deterministic /navigate parsing for broad course and tutor discovery filters', async () => {
    const apiRequest = jest.fn(async (url) => {
      if (url.startsWith('/api/courses?') || url.startsWith('/api/tutors?')) {
        return { data: [] }
      }

      throw new Error('Unexpected request: ' + url)
    })
    const router = { push: jest.fn(async () => {}) }

    await submitCommandPaletteIntent({
      intent: '/navigate show me cybersecurity courses',
      apiRequest,
      router,
      online: true
    })
    await submitCommandPaletteIntent({
      intent: '/navigate show me all teachers named Chen',
      apiRequest,
      router,
      online: true
    })

    expect(useCourseStore()).toMatchObject({
      searchQuery: 'cybersecurity',
      sortOrder: 'best-match',
      currentPage: 1
    })
    expect(useTutorStore()).toMatchObject({
      searchQuery: 'Chen',
      sortOrder: 'best-match',
      currentPage: 1
    })
    expect(router.push).toHaveBeenNthCalledWith(1, {
      path: '/courses',
      query: { search: 'cybersecurity' }
    })
    expect(router.push).toHaveBeenNthCalledWith(2, {
      path: '/tutors',
      query: { search: 'Chen' }
    })
    expect(apiRequest.mock.calls.map(([url]) => url)).not.toContain('/api/smart-navigation')
  })

  it.each([
    ['/navigate show me cyber security courses', 'cyber security'],
    ['/navigate show me cyber-security courses', 'cyber-security'],
    ['/navigate show me IT security tutors', 'IT security']
  ])('keeps relevant slash-command security discovery deterministic for %s', async (intent, expectedSearch) => {
    const apiRequest = jest.fn(async (url) => {
      if (url.startsWith('/api/courses?') || url.startsWith('/api/tutors?')) {
        return { data: [] }
      }

      throw new Error('Unexpected request: ' + url)
    })
    const router = { push: jest.fn(async () => {}) }

    await submitCommandPaletteIntent({
      intent,
      apiRequest,
      router,
      online: true
    })

    const expectedDomain = intent.includes('tutors') ? 'tutors' : 'courses'
    const expectedPath = expectedDomain === 'courses' ? '/courses' : '/tutors'

    expect(router.push).toHaveBeenCalledWith({
      path: expectedPath,
      query: { search: expectedSearch }
    })
    expect(apiRequest.mock.calls.map(([url]) => url)).not.toContain('/api/smart-navigation')
  })

  it('falls back from uncertain /navigate wording to Groq and keeps unsafe output controlled', async () => {
    const apiRequest = jest.fn(async (url) => {
      if (url.startsWith('/api/courses?') || url.startsWith('/api/tutors?')) {
        return { data: [] }
      }

      if (url === '/api/smart-navigation') {
        return {
          action: 'TOGGLE_FAVORITE',
          route: '/courses',
          domain: 'courses',
          filters: { targetId: '1' },
          confidence: 1,
          reason: 'Mutate favorite'
        }
      }

      throw new Error('Unexpected request: ' + url)
    })
    const router = { push: jest.fn(async () => {}) }

    const result = await submitCommandPaletteIntent({
      intent: '/navigate please handle this however you think',
      apiRequest,
      router,
      online: true
    })

    expect(result).toEqual({
      executed: false,
      feedback: 'Unsupported navigation command'
    })
    expect(apiRequest.mock.calls.map(([url]) => url)).toContain('/api/smart-navigation')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('preserves route guard feedback when /navigate fallback navigation is blocked', async () => {
    const apiRequest = jest.fn(async (url) => {
      if (url.startsWith('/api/courses?') || url.startsWith('/api/tutors?')) {
        return { data: [] }
      }

      if (url === '/api/smart-navigation') {
        return {
          action: 'NAVIGATE',
          route: '/courses',
          domain: 'courses',
          filters: {},
          confidence: 1,
          reason: 'Courses route'
        }
      }

      throw new Error('Unexpected request: ' + url)
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: {} },
        {
          path: '/courses',
          name: 'courses',
          component: {},
          beforeEnter: () => false
        }
      ]
    })
    await router.push('/')

    await expect(submitCommandPaletteIntent({
      intent: '/navigate maybe the protected directory',
      apiRequest,
      router,
      online: true
    })).resolves.toEqual({
      executed: false,
      feedback: 'Navigation was blocked. You may not have access to that page.'
    })
  })

  it('submits /ask to the grounded answer endpoint and keeps the palette open with cited cards', async () => {
    const apiRequest = jest.fn(async (url, options) => {
      if (url === '/api/smart-navigation/ask') {
        expect(options).toMatchObject({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        expect(JSON.parse(options.body)).toEqual({
          question: 'Which database course should I take?'
        })

        return {
          type: 'ANSWER',
          answer: 'COS20031 Database Design is the relevant database course.',
          confidence: 0.84,
          citations: {
            courses: [{
              id: 9,
              kind: 'course',
              title: 'COS20031 Database Design',
              department: 'Information Systems'
            }],
            tutors: [{
              id: 3,
              kind: 'tutor',
              name: 'Liam Patel',
              department: 'Information Systems'
            }]
          },
          closestMatches: {
            courses: [],
            tutors: []
          }
        }
      }

      throw new Error('Unexpected request: ' + url)
    })
    const router = { push: jest.fn(async () => {}) }
    const controller = createCommandPaletteController({
      apiRequest,
      router,
      isOnline: () => true
    })

    controller.open()
    controller.updateIntent('/ask Which database course should I take?')
    await controller.submit()

    expect(controller.isOpen()).toBe(true)
    expect(controller.feedback()).toBe('')
    expect(controller.askAnswer()).toMatchObject({
      type: 'ANSWER',
      answer: 'COS20031 Database Design is the relevant database course.',
      citations: {
        courses: [expect.objectContaining({ id: 9, kind: 'course' })],
        tutors: [expect.objectContaining({ id: 3, kind: 'tutor' })]
      }
    })
    expect(router.push).not.toHaveBeenCalled()
    expect(apiRequest.mock.calls.map(([url]) => url)).not.toContain('/api/smart-navigation')
  })

  it('shows closest matches for weak /ask evidence without closing the palette', async () => {
    const apiRequest = jest.fn(async () => ({
      type: 'CLOSEST_MATCHES',
      answer: '',
      confidence: 0.22,
      feedback: 'I found related directory matches, but not enough evidence to answer.',
      citations: {
        courses: [],
        tutors: []
      },
      closestMatches: {
        courses: [{ id: 4, kind: 'course', title: 'COS10001 Intro to Programming' }],
        tutors: []
      }
    }))
    const router = { push: jest.fn(async () => {}) }
    const result = await submitCommandPaletteIntent({
      intent: '/ask Should I choose a web or networks unit?',
      apiRequest,
      router,
      online: true
    })

    expect(result).toMatchObject({
      executed: false,
      feedback: '',
      askAnswer: {
        type: 'CLOSEST_MATCHES',
        closestMatches: {
          courses: [expect.objectContaining({ id: 4, kind: 'course' })]
        }
      }
    })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('degrades /ask provider failures to controlled palette feedback', async () => {
    const apiRequest = jest.fn(async () => {
      throw new ApiError('Grounded answers are unavailable', { status: 503 })
    })
    const router = { push: jest.fn(async () => {}) }

    await expect(submitCommandPaletteIntent({
      intent: '/ask Which tutor teaches security?',
      apiRequest,
      router,
      online: true
    })).resolves.toEqual({
      executed: false,
      feedback: 'Grounded answers are unavailable'
    })
    expect(router.push).not.toHaveBeenCalled()
  })
})
