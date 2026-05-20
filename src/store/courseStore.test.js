import { createPinia, setActivePinia } from 'pinia'
import { jest } from '@jest/globals'
import {
  GUEST_VIEWER_SCOPE,
  getStudentViewerScope,
  resetLocalCacheForTests,
  saveDirectoryQuery,
  saveEntities
} from '../api/localCache.js'
import { configureApiClient } from '../api/client.js'
import { useUserStore } from './userStore.js'
import { useCourseStore } from './courseStore.js'

const okCoursesResponse = ({ data = [], total = data.length } = {}) => ({
  ok: true,
  status: 200,
  headers: {
    get: jest.fn(() => 'application/json')
  },
  json: jest.fn(async () => ({ data, total }))
})

const failedCoursesResponse = () => ({
  ok: false,
  status: 503,
  headers: {
    get: jest.fn(() => 'application/json')
  },
  json: jest.fn(async () => ({ message: 'Service unavailable' }))
})

const waitForFetchStart = async () => {
  for (let index = 0; index < 10; index += 1) {
    if (global.fetch.mock.calls.length > 0) {
      return
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  }

  throw new Error('Expected course refresh request to start')
}

beforeEach(async () => {
  global.fetch = jest.fn()
  global.localStorage = {
    getItem: jest.fn(() => null),
    setItem: jest.fn()
  }
  configureApiClient({ onUnauthorized: null })
  await resetLocalCacheForTests({ now: new Date('2026-05-21T00:00:00.000Z').getTime() })
  setActivePinia(createPinia())
})

describe('course store cache-first loading', () => {
  it('hydrates cached course query results immediately before online refresh completes', async () => {
    await saveDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'courses',
      entityIds: [1],
      total: 1
    })
    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'courses',
      rows: [{ id: 1, title: 'Cached Security', department: 'ICT', has_favorite: false }]
    })

    let resolveFetch
    global.fetch.mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve
    }))

    const store = useCourseStore()
    const loadPromise = store.loadCourses()
    await waitForFetchStart()

    expect(store.courses).toEqual([
      expect.objectContaining({ id: 1, title: 'Cached Security', has_favorite: false })
    ])
    expect(store.loading).toBe(false)
    expect(store.refreshing).toBe(true)
    expect(store.isStale).toBe(true)

    resolveFetch(okCoursesResponse({
      data: [{ id: 2, title: 'Fresh Web Apps', department: 'CS', has_favorite: false }],
      total: 1
    }))
    await loadPromise

    expect(store.courses).toEqual([
      expect.objectContaining({ id: 2, title: 'Fresh Web Apps' })
    ])
    expect(store.isStale).toBe(false)
  })

  it('marks stale cached results fresh after successful revalidation', async () => {
    await saveDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'courses',
      entityIds: [1],
      total: 1
    })
    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'courses',
      rows: [{ id: 1, title: 'Cached Security', department: 'ICT', has_favorite: false }]
    })
    global.fetch.mockResolvedValue(okCoursesResponse({
      data: [{ id: 1, title: 'Fresh Security', department: 'ICT', has_favorite: false }],
      total: 1
    }))

    const store = useCourseStore()
    await store.loadCourses()

    expect(store.courses).toEqual([
      expect.objectContaining({ title: 'Fresh Security' })
    ])
    expect(store.error).toBe('')
    expect(store.staleMessage).toBe('')
    expect(store.isStale).toBe(false)
  })

  it('keeps stale cached results visible after retriable refresh failure', async () => {
    await saveDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'courses',
      entityIds: [3],
      total: 1
    })
    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'courses',
      rows: [{ id: 3, title: 'Cached Databases', department: 'ICT', has_favorite: false }]
    })
    global.fetch.mockResolvedValue(failedCoursesResponse())

    const store = useCourseStore()
    await store.loadCourses()

    expect(store.courses).toEqual([
      expect.objectContaining({ id: 3, title: 'Cached Databases' })
    ])
    expect(store.error).toBe('')
    expect(store.staleMessage).toBe('Showing saved results. Fresh data unavailable.')
    expect(store.isStale).toBe(true)
  })

  it('shows the normal course error when online refresh fails with no cache', async () => {
    global.fetch.mockResolvedValue(failedCoursesResponse())

    const store = useCourseStore()
    await store.loadCourses()

    expect(store.courses).toEqual([])
    expect(store.error).toBe('Courses are unavailable right now. Please try again shortly.')
    expect(store.staleMessage).toBe('')
    expect(store.loading).toBe(false)
  })

  it('isolates cached favorite markers by viewer scope', async () => {
    await saveDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'courses',
      search: 'security',
      entityIds: [1],
      total: 1
    })
    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'courses',
      rows: [{ id: 1, title: 'Security', department: 'ICT', has_favorite: false }]
    })
    await saveDirectoryQuery({
      viewerScope: getStudentViewerScope(7),
      domain: 'courses',
      search: 'security',
      entityIds: [1],
      total: 1
    })
    await saveEntities({
      viewerScope: getStudentViewerScope(7),
      namespace: 'courses',
      rows: [{ id: 1, title: 'Security', department: 'ICT', has_favorite: true }]
    })
    global.fetch.mockResolvedValue(failedCoursesResponse())

    const userStore = useUserStore()
    const store = useCourseStore()

    store.searchQuery = 'security'
    await store.loadCourses()
    expect(store.courses[0].has_favorite).toBe(false)

    userStore.setUser({ id: 7, role: 'student' })
    await store.loadCourses()
    expect(store.courses[0].has_favorite).toBe(true)
  })
})
