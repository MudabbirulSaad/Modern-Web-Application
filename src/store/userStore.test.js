import { createPinia, setActivePinia } from 'pinia'
import { jest } from '@jest/globals'
import { apiRequest, configureApiClient } from '../api/client.js'
import {
  GUEST_VIEWER_SCOPE,
  getEntity,
  getPendingLocalActions,
  getStudentViewerScope,
  resetLocalCacheForTests,
  saveEntities,
  savePendingLocalAction,
  saveReviewCollectionWithEntities
} from '../api/localCache.js'
import { useCourseStore } from './courseStore.js'
import { useFavoriteSyncStore } from './favoriteSyncStore.js'
import { useReviewStore } from './reviewStore.js'
import { useTutorStore } from './tutorStore.js'
import { useUserStore } from './userStore.js'

const storage = new Map()

const okResponse = () => ({
  ok: true,
  status: 200,
  headers: {
    get: jest.fn(() => 'application/json')
  },
  json: jest.fn(async () => ({ data: null }))
})

const unauthorizedResponse = () => ({
  ok: false,
  status: 401,
  headers: {
    get: jest.fn(() => 'application/json')
  },
  json: jest.fn(async () => ({ message: 'Session expired' }))
})

beforeEach(async () => {
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
  await resetLocalCacheForTests({ now: new Date('2026-05-21T00:00:00.000Z').getTime() })
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
  const seedGuestAndStudentState = async () => {
    const studentScope = getStudentViewerScope(7)

    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'courses',
      rows: [{ id: 1, title: 'Guest Course', has_favorite: false }]
    })
    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'tutors',
      rows: [{ id: 2, name: 'Guest Tutor', has_favorite: false }]
    })
    await saveReviewCollectionWithEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      entityType: 'course',
      entityId: 1,
      rows: [{ id: 3, comment: 'Guest Review', has_upvoted: true }]
    })
    await saveEntities({
      viewerScope: studentScope,
      namespace: 'courses',
      rows: [{ id: 1, title: 'Student Course', has_favorite: true }]
    })
    await saveEntities({
      viewerScope: studentScope,
      namespace: 'tutors',
      rows: [{ id: 2, name: 'Student Tutor', has_favorite: true }]
    })
    await saveEntities({
      viewerScope: studentScope,
      namespace: 'reviews',
      rows: [{ id: 3, comment: 'Student Review', has_upvoted: true }]
    })
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: { type: 'favorite', targetKind: 'course', targetId: 1, desiredFavorite: true }
    })
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: { type: 'review-upvote', targetKind: 'review', targetId: 3, desiredUpvoted: true }
    })

    const userStore = useUserStore()
    const courseStore = useCourseStore()
    const tutorStore = useTutorStore()
    const reviewStore = useReviewStore()
    const favoriteSyncStore = useFavoriteSyncStore()

    userStore.setUser({ id: 7, role: 'student' })
    courseStore.viewerScope = studentScope
    courseStore.applyCourses([{ id: 1, title: 'Student Course', has_favorite: true }], 1)
    tutorStore.viewerScope = studentScope
    tutorStore.applyTutors([{ id: 2, name: 'Student Tutor', has_favorite: true }], 1)
    reviewStore.viewerScope = studentScope
    reviewStore.applyReviews([{ id: 3, comment: 'Student Review', upvotes: 1, has_upvoted: true }])
    favoriteSyncStore.pendingFavoriteKeys = ['type=favorite|target_kind=course|target_id=1']
    reviewStore.pendingReviewUpvoteKeys = ['type=review-upvote|target_kind=review|target_id=3']

    return { studentScope, userStore, courseStore, tutorStore, reviewStore, favoriteSyncStore }
  }

  const expectGuestTeardown = async ({
    studentScope,
    userStore,
    courseStore,
    tutorStore,
    reviewStore,
    favoriteSyncStore
  }) => {
    expect(userStore.user).toBeNull()
    expect(userStore.userId).toBeNull()
    expect(userStore.role).toBeNull()
    expect(userStore.loggedIn).toBe(false)
    expect(userStore.sessionInitialized).toBe(true)

    expect(courseStore.viewerScope).toBe(GUEST_VIEWER_SCOPE)
    expect(courseStore.courses).toEqual([])
    expect(tutorStore.viewerScope).toBe(GUEST_VIEWER_SCOPE)
    expect(tutorStore.tutors).toEqual([])
    expect(reviewStore.viewerScope).toBe(GUEST_VIEWER_SCOPE)
    expect(reviewStore.reviews).toEqual([])
    expect(favoriteSyncStore.pendingFavoriteKeys).toEqual([])
    expect(reviewStore.pendingReviewUpvoteKeys).toEqual([])

    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([])
    await expect(getEntity({
      viewerScope: studentScope,
      namespace: 'courses',
      id: 1
    })).resolves.toBeNull()
    await expect(getEntity({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'courses',
      id: 1
    })).resolves.toMatchObject({ data: expect.objectContaining({ title: 'Guest Course' }) })
    await expect(getEntity({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'tutors',
      id: 2
    })).resolves.toMatchObject({ data: expect.objectContaining({ name: 'Guest Tutor' }) })
    await expect(getEntity({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'reviews',
      id: 3
    })).resolves.toMatchObject({
      data: expect.not.objectContaining({ has_upvoted: expect.anything() })
    })
  }

  it('stops pending replay before purging student records on explicit logout', async () => {
    const seeded = await seedGuestAndStudentState()
    const stopOrder = []
    const stopFavoriteReplay = seeded.favoriteSyncStore.stopPendingFavoriteReplay
    const stopReviewReplay = seeded.reviewStore.stopPendingReviewUpvoteReplay
    seeded.favoriteSyncStore.stopPendingFavoriteReplay = jest.fn(function stopPendingFavoriteReplay() {
      stopOrder.push('favorite-stop')
      return stopFavoriteReplay.call(this)
    })
    seeded.reviewStore.stopPendingReviewUpvoteReplay = jest.fn(function stopPendingReviewUpvoteReplay() {
      stopOrder.push('review-stop')
      return stopReviewReplay.call(this)
    })
    global.fetch.mockResolvedValue(okResponse())

    await seeded.userStore.logout()

    expect(stopOrder).toEqual(['favorite-stop', 'review-stop'])
    await expectGuestTeardown(seeded)
  })

  it('uses the same teardown path when the api client observes a 401', async () => {
    const seeded = await seedGuestAndStudentState()
    configureApiClient({
      onUnauthorized: () => seeded.userStore.invalidateSession()
    })
    global.fetch.mockResolvedValue(unauthorizedResponse())

    await expect(apiRequest('/api/private')).rejects.toMatchObject({ status: 401 })

    await expectGuestTeardown(seeded)
  })

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
