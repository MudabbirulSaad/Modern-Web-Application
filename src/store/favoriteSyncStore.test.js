import { createPinia, setActivePinia } from 'pinia'
import { jest } from '@jest/globals'
import {
  getEntity,
  getPendingLocalActions,
  getStudentViewerScope,
  resetLocalCacheForTests,
  saveEntities,
  savePendingLocalAction
} from '../api/localCache.js'
import { configureApiClient } from '../api/client.js'
import { useCourseStore } from './courseStore.js'
import { useFavoriteSyncStore } from './favoriteSyncStore.js'
import { useNotificationStore } from './notificationStore.js'
import { useTutorStore } from './tutorStore.js'
import { useUserStore } from './userStore.js'

const okFavoriteResponse = (data) => ({
  ok: true,
  status: 200,
  headers: {
    get: jest.fn(() => 'application/json')
  },
  json: jest.fn(async () => ({ data }))
})

const failedFavoriteResponse = ({ status = 503, message = 'Unable to update favorite' } = {}) => ({
  ok: false,
  status,
  headers: {
    get: jest.fn(() => 'application/json')
  },
  json: jest.fn(async () => ({ message }))
})

const waitForFetchCalls = async (count) => {
  for (let index = 0; index < 20; index += 1) {
    if (global.fetch.mock.calls.length >= count) {
      return
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  }

  throw new Error(`Expected ${count} fetch call(s)`)
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

afterEach(() => {
  useNotificationStore().clear()
})

describe('favorite sync store', () => {
  it('optimistically patches courses and compacts repeated clicks while pending', async () => {
    let resolveFetch
    global.fetch.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFetch = resolve
    }))
    global.fetch.mockResolvedValue(okFavoriteResponse({ id: 1, title: 'Security', has_favorite: false }))

    const userStore = useUserStore()
    const courseStore = useCourseStore()
    const favoriteSyncStore = useFavoriteSyncStore()
    userStore.setUser({ id: 7, role: 'student' })
    courseStore.applyCourses([
      { id: 1, title: 'Security', department: 'ICT', has_favorite: false }
    ], 1)

    await courseStore.toggleFavorite(courseStore.courses[0])
    expect(courseStore.courses[0].has_favorite).toBe(true)
    expect(courseStore.isUpdatingFavorite(1)).toBe(true)

    await courseStore.toggleFavorite(courseStore.courses[0])
    expect(courseStore.courses[0].has_favorite).toBe(false)
    expect(courseStore.isUpdatingFavorite(1)).toBe(true)

    await expect(getPendingLocalActions(getStudentViewerScope(7))).resolves.toEqual([
      expect.objectContaining({
        key: 'type=favorite|target_kind=course|target_id=1',
        data: expect.objectContaining({ desiredFavorite: false })
      })
    ])

    resolveFetch(okFavoriteResponse({ id: 1, title: 'Security', has_favorite: true }))
    await waitForFetchCalls(2)
    await favoriteSyncStore.replayPendingFavorites()

    expect(global.fetch).toHaveBeenLastCalledWith('/api/me/favorite', expect.objectContaining({
      body: JSON.stringify({
        entity_type: 'course',
        entity_id: 1,
        favorite: false
      })
    }))
  })

  it('replays only actions for the exact active student viewer scope', async () => {
    await savePendingLocalAction({
      viewerScope: getStudentViewerScope(7),
      action: { type: 'favorite', targetKind: 'course', targetId: 1, desiredFavorite: true }
    })
    await savePendingLocalAction({
      viewerScope: getStudentViewerScope(8),
      action: { type: 'favorite', targetKind: 'course', targetId: 2, desiredFavorite: true }
    })
    global.fetch.mockResolvedValue(okFavoriteResponse({ id: 1, has_favorite: true }))

    const userStore = useUserStore()
    const favoriteSyncStore = useFavoriteSyncStore()
    userStore.setUser({ id: 7, role: 'student' })

    await favoriteSyncStore.replayPendingFavorites()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith('/api/me/favorite', expect.objectContaining({
      body: JSON.stringify({
        entity_type: 'course',
        entity_id: 1,
        favorite: true
      })
    }))
    await expect(getPendingLocalActions(getStudentViewerScope(8))).resolves.toHaveLength(1)
  })

  it('keeps guest replay dormant', async () => {
    await savePendingLocalAction({
      viewerScope: getStudentViewerScope(7),
      action: { type: 'favorite', targetKind: 'tutor', targetId: 3, desiredFavorite: true }
    })

    const favoriteSyncStore = useFavoriteSyncStore()
    await favoriteSyncStore.replayPendingFavorites()

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('retains retriable failures with backoff metadata', async () => {
    await savePendingLocalAction({
      viewerScope: getStudentViewerScope(7),
      action: { type: 'favorite', targetKind: 'tutor', targetId: 3, desiredFavorite: true }
    })
    global.fetch.mockResolvedValue(failedFavoriteResponse({ status: 503 }))

    const userStore = useUserStore()
    const favoriteSyncStore = useFavoriteSyncStore()
    userStore.setUser({ id: 7, role: 'student' })

    await favoriteSyncStore.replayPendingFavorites()

    await expect(getPendingLocalActions(getStudentViewerScope(7))).resolves.toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          desiredFavorite: true,
          status: 'queued',
          attemptCount: 1,
          nextAttemptAt: expect.any(Number),
          lastError: 'Unable to update favorite'
        })
      })
    ])
  })

  it('blocks repeated retriable failures and skips blocked favorites during automatic replay', async () => {
    const studentScope = getStudentViewerScope(7)
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: {
        type: 'favorite',
        targetKind: 'tutor',
        targetId: 3,
        desiredFavorite: true,
        attemptCount: 2,
        nextAttemptAt: 0,
        status: 'queued'
      }
    })
    global.fetch.mockResolvedValue(failedFavoriteResponse({ status: 503 }))

    const userStore = useUserStore()
    const favoriteSyncStore = useFavoriteSyncStore()
    const notificationStore = useNotificationStore()
    userStore.setUser({ id: 7, role: 'student' })

    await favoriteSyncStore.replayPendingFavorites()

    expect(favoriteSyncStore.hasPendingFavorite('tutor', 3)).toBe(true)
    expect(favoriteSyncStore.isFavoriteSyncing('tutor', 3)).toBe(false)
    expect(favoriteSyncStore.hasBlockedFavorite('tutor', 3)).toBe(true)
    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          desiredFavorite: true,
          status: 'blocked',
          attemptCount: 3,
          nextAttemptAt: 0,
          lastError: 'Unable to update favorite'
        })
      })
    ])
    expect(notificationStore.notifications).toEqual([
      expect.objectContaining({
        message: 'Favorite could not be updated. Retry when your connection is stable.',
        variant: 'warning'
      })
    ])

    global.fetch.mockClear()
    await favoriteSyncStore.replayPendingFavorites()

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('manually retries a blocked favorite through the normal replay path', async () => {
    const studentScope = getStudentViewerScope(7)
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: {
        type: 'favorite',
        targetKind: 'course',
        targetId: 1,
        desiredFavorite: true,
        attemptCount: 3,
        nextAttemptAt: 0,
        status: 'blocked'
      }
    })
    global.fetch.mockResolvedValue(okFavoriteResponse({ id: 1, has_favorite: true }))

    const userStore = useUserStore()
    const favoriteSyncStore = useFavoriteSyncStore()
    userStore.setUser({ id: 7, role: 'student' })
    await favoriteSyncStore.refreshPendingFavorites()

    await favoriteSyncStore.retryFavorite('course', 1)

    expect(global.fetch).toHaveBeenCalledWith('/api/me/favorite', expect.objectContaining({
      body: JSON.stringify({
        entity_type: 'course',
        entity_id: 1,
        favorite: true
      })
    }))
    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([])
  })

  it('reactivates a blocked favorite when the user overwrites the desired state', async () => {
    const studentScope = getStudentViewerScope(7)
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: {
        type: 'favorite',
        targetKind: 'course',
        targetId: 1,
        desiredFavorite: true,
        previousFavorite: false,
        attemptCount: 3,
        nextAttemptAt: 0,
        status: 'blocked'
      }
    })
    global.fetch.mockResolvedValue(okFavoriteResponse({ id: 1, has_favorite: false }))

    const userStore = useUserStore()
    const favoriteSyncStore = useFavoriteSyncStore()
    userStore.setUser({ id: 7, role: 'student' })

    await favoriteSyncStore.enqueueFavorite({
      targetKind: 'course',
      targetId: 1,
      desiredFavorite: false,
      previousFavorite: true,
      entity: { id: 1, has_favorite: false }
    })
    await waitForFetchCalls(1)

    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([])
    expect(favoriteSyncStore.hasBlockedFavorite('course', 1)).toBe(false)
    expect(global.fetch).toHaveBeenCalledWith('/api/me/favorite', expect.objectContaining({
      body: JSON.stringify({
        entity_type: 'course',
        entity_id: 1,
        favorite: false
      })
    }))
  })

  it('discards non-retriable failures, reconciles optimistic state, and notifies', async () => {
    const studentScope = getStudentViewerScope(7)
    await saveEntities({
      viewerScope: studentScope,
      namespace: 'tutors',
      rows: [{ id: 3, name: 'Tutor', has_favorite: true }]
    })
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: {
        type: 'favorite',
        targetKind: 'tutor',
        targetId: 3,
        desiredFavorite: true,
        previousFavorite: false
      }
    })
    global.fetch.mockResolvedValue(failedFavoriteResponse({ status: 400, message: 'Bad favorite' }))

    const userStore = useUserStore()
    const tutorStore = useTutorStore()
    const favoriteSyncStore = useFavoriteSyncStore()
    const notificationStore = useNotificationStore()
    userStore.setUser({ id: 7, role: 'student' })
    tutorStore.applyTutors([{ id: 3, name: 'Tutor', has_favorite: true }], 1)

    await favoriteSyncStore.replayPendingFavorites()

    expect(tutorStore.tutors[0].has_favorite).toBe(false)
    await expect(getEntity({
      viewerScope: studentScope,
      namespace: 'tutors',
      id: 3
    })).resolves.toMatchObject({ data: expect.objectContaining({ has_favorite: false }) })
    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([])
    expect(notificationStore.notifications).toEqual([
      expect.objectContaining({
        message: 'Favorite could not be updated. Please try again.',
        variant: 'warning'
      })
    ])
  })
})
