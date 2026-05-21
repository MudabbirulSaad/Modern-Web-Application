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
import { useTutorStore } from './tutorStore.js'

const okTutorsResponse = ({ data = [], total = data.length } = {}) => ({
  ok: true,
  status: 200,
  headers: {
    get: jest.fn(() => 'application/json')
  },
  json: jest.fn(async () => ({ data, total }))
})

const failedTutorsResponse = () => ({
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

  throw new Error('Expected tutor refresh request to start')
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

describe('tutor store cache-first loading', () => {
  it.each([
    'cyber security',
    'cyber-security',
    'IT security'
  ])('loads regular tutor search for %s through the deterministic directory API only', async (searchQuery) => {
    global.fetch.mockResolvedValue(okTutorsResponse({
      data: [{
        id: 8,
        name: 'Cybersecurity Tutor',
        department: 'Information Technology',
        bio: 'Lecturer for IT security and secure systems.',
        has_favorite: false
      }],
      total: 1
    }))

    const store = useTutorStore()
    store.searchQuery = searchQuery

    await store.loadTutors()

    expect(store.tutors).toEqual([
      expect.objectContaining({ id: 8, name: 'Cybersecurity Tutor' })
    ])
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const requestUrl = global.fetch.mock.calls[0][0]
    const requestParams = new URLSearchParams(requestUrl.split('?')[1])
    expect(requestUrl).toContain('/api/tutors?')
    expect(requestParams.get('search')).toBe(searchQuery)
    expect(requestParams.get('sort')).toBe('best-match')
    expect(requestParams.get('page')).toBe('1')
    expect(requestParams.get('limit')).toBe('6')
    expect(global.fetch.mock.calls.map(([url]) => url)).not.toContain('/api/smart-navigation')
  })

  it('hydrates cached tutor query results immediately before online refresh completes', async () => {
    await saveDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'tutors',
      entityIds: [1],
      total: 1
    })
    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'tutors',
      rows: [{ id: 1, name: 'Cached Tutor', department: 'ICT', has_favorite: false }]
    })

    let resolveFetch
    global.fetch.mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve
    }))

    const store = useTutorStore()
    const loadPromise = store.loadTutors()
    await waitForFetchStart()

    expect(store.tutors).toEqual([
      expect.objectContaining({ id: 1, name: 'Cached Tutor', has_favorite: false })
    ])
    expect(store.loading).toBe(false)
    expect(store.refreshing).toBe(true)
    expect(store.isStale).toBe(true)

    resolveFetch(okTutorsResponse({
      data: [{ id: 2, name: 'Fresh Tutor', department: 'CS', has_favorite: false }],
      total: 1
    }))
    await loadPromise

    expect(store.tutors).toEqual([
      expect.objectContaining({ id: 2, name: 'Fresh Tutor' })
    ])
    expect(store.isStale).toBe(false)
  })

  it('marks stale cached results fresh after successful revalidation', async () => {
    await saveDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'tutors',
      entityIds: [1],
      total: 1
    })
    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'tutors',
      rows: [{ id: 1, name: 'Cached Tutor', department: 'ICT', has_favorite: false }]
    })
    global.fetch.mockResolvedValue(okTutorsResponse({
      data: [{ id: 1, name: 'Fresh Tutor', department: 'ICT', has_favorite: false }],
      total: 1
    }))

    const store = useTutorStore()
    await store.loadTutors()

    expect(store.tutors).toEqual([
      expect.objectContaining({ name: 'Fresh Tutor' })
    ])
    expect(store.error).toBe('')
    expect(store.staleMessage).toBe('')
    expect(store.isStale).toBe(false)
  })

  it('keeps stale cached results visible after retriable refresh failure', async () => {
    await saveDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'tutors',
      entityIds: [3],
      total: 1
    })
    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'tutors',
      rows: [{ id: 3, name: 'Cached Databases Tutor', department: 'ICT', has_favorite: false }]
    })
    global.fetch.mockResolvedValue(failedTutorsResponse())

    const store = useTutorStore()
    await store.loadTutors()

    expect(store.tutors).toEqual([
      expect.objectContaining({ id: 3, name: 'Cached Databases Tutor' })
    ])
    expect(store.error).toBe('')
    expect(store.staleMessage).toBe('Showing saved results. Fresh data unavailable.')
    expect(store.isStale).toBe(true)
  })

  it('shows the normal tutor error when online refresh fails with no cache', async () => {
    global.fetch.mockResolvedValue(failedTutorsResponse())

    const store = useTutorStore()
    await store.loadTutors()

    expect(store.tutors).toEqual([])
    expect(store.error).toBe('Tutors are unavailable right now. Please try again shortly.')
    expect(store.staleMessage).toBe('')
    expect(store.loading).toBe(false)
  })

  it('isolates cached favorite markers by viewer scope', async () => {
    await saveDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'tutors',
      search: 'network',
      entityIds: [1],
      total: 1
    })
    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'tutors',
      rows: [{ id: 1, name: 'Network Tutor', department: 'ICT', has_favorite: false }]
    })
    await saveDirectoryQuery({
      viewerScope: getStudentViewerScope(7),
      domain: 'tutors',
      search: 'network',
      entityIds: [1],
      total: 1
    })
    await saveEntities({
      viewerScope: getStudentViewerScope(7),
      namespace: 'tutors',
      rows: [{ id: 1, name: 'Network Tutor', department: 'ICT', has_favorite: true }]
    })
    global.fetch.mockResolvedValue(failedTutorsResponse())

    const userStore = useUserStore()
    const store = useTutorStore()

    store.searchQuery = 'network'
    await store.loadTutors()
    expect(store.tutors[0].has_favorite).toBe(false)

    userStore.setUser({ id: 7, role: 'student' })
    await store.loadTutors()
    expect(store.tutors[0].has_favorite).toBe(true)
  })
})
