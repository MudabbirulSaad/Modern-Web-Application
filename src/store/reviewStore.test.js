import { createPinia, setActivePinia } from 'pinia'
import { jest } from '@jest/globals'
import {
  GUEST_VIEWER_SCOPE,
  getEntity,
  getPendingLocalActions,
  getReviewCollection,
  getStudentViewerScope,
  resetLocalCacheForTests,
  saveEntity,
  savePendingLocalAction,
  saveReviewCollectionWithEntities
} from '../api/localCache.js'
import { configureApiClient } from '../api/client.js'
import { useNotificationStore } from './notificationStore.js'
import { useOnlineStore } from './onlineStore.js'
import { useReviewStore } from './reviewStore.js'
import { useUserStore } from './userStore.js'

const okReviewsResponse = (data = []) => ({
  ok: true,
  status: 200,
  headers: {
    get: jest.fn(() => 'application/json')
  },
  json: jest.fn(async () => ({ status: 'ok', data }))
})

const failedReviewsResponse = () => ({
  ok: false,
  status: 503,
  headers: {
    get: jest.fn(() => 'application/json')
  },
  json: jest.fn(async () => ({ status: 'error', message: 'Service unavailable' }))
})

const okUpvoteResponse = (data) => ({
  ok: true,
  status: 200,
  headers: {
    get: jest.fn(() => 'application/json')
  },
  json: jest.fn(async () => ({ status: 'ok', data }))
})

const failedUpvoteResponse = ({ status = 503, message = 'Unable to update upvote' } = {}) => ({
  ok: false,
  status,
  headers: {
    get: jest.fn(() => 'application/json')
  },
  json: jest.fn(async () => ({ status: 'error', message }))
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

  throw new Error('Expected review refresh request to start')
}

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

describe('review cache helpers', () => {
  it('preserves guest preview limits and strips student upvote markers from guest rows', async () => {
    await saveReviewCollectionWithEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      entityType: 'tutor',
      entityId: 2,
      rows: [
        { id: 1, comment: 'First', has_upvoted: true },
        { id: 2, comment: 'Second', has_upvoted: false },
        { id: 3, comment: 'Third', has_upvoted: true }
      ]
    })

    await expect(getReviewCollection({
      viewerScope: GUEST_VIEWER_SCOPE,
      entityType: 'tutor',
      entityId: 2
    })).resolves.toMatchObject({
      data: { reviewIds: [1, 2, 3] }
    })
    await expect(getEntity({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'reviews',
      id: 1
    })).resolves.toMatchObject({
      data: { id: 1, comment: 'First' }
    })
    const guestReview = await getEntity({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'reviews',
      id: 1
    })
    expect(guestReview.data).not.toHaveProperty('has_upvoted')
  })
})

describe('review store cache-first loading', () => {
  it('isolates student upvote markers by viewer scope', async () => {
    await saveReviewCollectionWithEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      entityType: 'course',
      entityId: 3,
      rows: [{ id: 10, comment: 'Guest visible', upvotes: 4 }]
    })
    await saveReviewCollectionWithEntities({
      viewerScope: getStudentViewerScope(7),
      entityType: 'course',
      entityId: 3,
      rows: [{ id: 10, comment: 'Student visible', upvotes: 4, has_upvoted: true }]
    })
    global.fetch.mockResolvedValue(failedReviewsResponse())

    const userStore = useUserStore()
    const store = useReviewStore()

    await store.loadReviews({ entityType: 'course', entityId: 3 })
    expect(store.reviews[0]).toEqual(expect.objectContaining({ comment: 'Guest visible' }))
    expect(store.reviews[0]).not.toHaveProperty('has_upvoted')

    userStore.setUser({ id: 7, role: 'student' })
    await store.loadReviews({ entityType: 'course', entityId: 3 })
    expect(store.reviews[0]).toEqual(expect.objectContaining({
      comment: 'Student visible',
      has_upvoted: true
    }))
  })

  it('hydrates cached review results before online refresh completes', async () => {
    await saveReviewCollectionWithEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      entityType: 'tutor',
      entityId: 2,
      rows: [{ id: 1, comment: 'Cached review', upvotes: 1 }]
    })

    let resolveFetch
    global.fetch.mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve
    }))

    const store = useReviewStore()
    const loadPromise = store.loadReviews({ entityType: 'tutor', entityId: 2 })
    await waitForFetchStart()

    expect(store.reviews).toEqual([
      expect.objectContaining({ id: 1, comment: 'Cached review' })
    ])
    expect(store.loading).toBe(false)
    expect(store.refreshing).toBe(true)
    expect(store.isStale).toBe(true)

    resolveFetch(okReviewsResponse([{ id: 2, comment: 'Fresh review', upvotes: 3 }]))
    await loadPromise

    expect(store.reviews).toEqual([
      expect.objectContaining({ id: 2, comment: 'Fresh review' })
    ])
    expect(store.isStale).toBe(false)
  })

  it('keeps stale cached reviews visible after retriable refresh failure', async () => {
    await saveReviewCollectionWithEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      entityType: 'course',
      entityId: 9,
      rows: [{ id: 5, comment: 'Saved review', upvotes: 2 }]
    })
    global.fetch.mockResolvedValue(failedReviewsResponse())

    const store = useReviewStore()
    await store.loadReviews({ entityType: 'course', entityId: 9 })

    expect(store.reviews).toEqual([
      expect.objectContaining({ id: 5, comment: 'Saved review' })
    ])
    expect(store.error).toBe('')
    expect(store.staleMessage).toBe('Showing saved reviews. Fresh data unavailable.')
    expect(store.isStale).toBe(true)
  })

  it('shows the normal review error when online refresh fails with no cache', async () => {
    global.fetch.mockResolvedValue(failedReviewsResponse())

    const store = useReviewStore()
    await store.loadReviews({ entityType: 'course', entityId: 9 })

    expect(store.reviews).toEqual([])
    expect(store.error).toBe('Reviews are unavailable right now. Please try again shortly.')
    expect(store.staleMessage).toBe('')
    expect(store.loading).toBe(false)
  })

  it('blocks offline review management writes without queueing requests', async () => {
    const userStore = useUserStore()
    const onlineStore = useOnlineStore()
    const store = useReviewStore()

    userStore.setUser({ id: 7, role: 'student' })
    onlineStore.online = false

    await store.createReview({
      entityType: 'course',
      entityId: 3,
      rating: 5,
      comment: 'Offline write'
    })
    await store.updateReview({ id: 10, rating: 4, comment: 'Offline edit' })
    await store.deleteReview({ id: 10 })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(store.submitError).toBe('A network connection is required to manage reviews.')
    expect(store.actionError).toBe('A network connection is required to manage reviews.')
  })
})

describe('review upvote local-first sync', () => {
  it('optimistically patches upvotes with a zero floor and compacts repeated clicks while pending', async () => {
    let resolveFetch
    global.fetch.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFetch = resolve
    }))
    global.fetch.mockResolvedValue(okUpvoteResponse({ id: 10, upvotes: 0, has_upvoted: false }))

    const userStore = useUserStore()
    const store = useReviewStore()
    userStore.setUser({ id: 7, role: 'student' })
    store.viewerScope = getStudentViewerScope(7)
    store.activeEntityType = 'course'
    store.activeEntityId = 3
    store.applyReviews([{ id: 10, comment: 'Saved', upvotes: 0, has_upvoted: false }])

    await store.toggleUpvote(store.reviews[0])
    expect(store.reviews[0]).toEqual(expect.objectContaining({
      upvotes: 1,
      has_upvoted: true
    }))
    expect(store.hasPendingReviewUpvote(10)).toBe(true)
    expect(store.isUpdatingReviewUpvote(10)).toBe(true)

    await store.toggleUpvote(store.reviews[0])
    expect(store.reviews[0]).toEqual(expect.objectContaining({
      upvotes: 0,
      has_upvoted: false
    }))
    expect(store.hasPendingReviewUpvote(10)).toBe(true)

    await expect(getPendingLocalActions(getStudentViewerScope(7))).resolves.toEqual([
      expect.objectContaining({
        key: 'type=review-upvote|target_kind=review|target_id=10',
        data: expect.objectContaining({
          desiredUpvoted: false,
          previousHasUpvoted: true,
          previousUpvotes: 1
        })
      })
    ])

    resolveFetch(okUpvoteResponse({ id: 10, upvotes: 1, has_upvoted: true }))
    await waitForFetchCalls(2)
    await store.replayPendingReviewUpvotes()

    expect(global.fetch).toHaveBeenLastCalledWith('/api/reviews/10/upvote', expect.objectContaining({
      body: JSON.stringify({ upvoted: false })
    }))
  })

  it('never displays a negative upvote count when removing an optimistic upvote', async () => {
    global.fetch.mockResolvedValue(failedUpvoteResponse({ status: 503 }))

    const userStore = useUserStore()
    const store = useReviewStore()
    userStore.setUser({ id: 7, role: 'student' })
    store.applyReviews([{ id: 11, comment: 'Saved', upvotes: 0, has_upvoted: true }])

    await store.toggleUpvote(store.reviews[0])

    expect(store.reviews[0]).toEqual(expect.objectContaining({
      upvotes: 0,
      has_upvoted: false
    }))
  })

  it('replays only actions for the exact active student viewer scope', async () => {
    await savePendingLocalAction({
      viewerScope: getStudentViewerScope(7),
      action: { type: 'review-upvote', targetKind: 'review', targetId: 10, desiredUpvoted: true }
    })
    await savePendingLocalAction({
      viewerScope: getStudentViewerScope(8),
      action: { type: 'review-upvote', targetKind: 'review', targetId: 11, desiredUpvoted: true }
    })
    global.fetch.mockResolvedValue(okUpvoteResponse({ id: 10, upvotes: 3, has_upvoted: true }))

    const userStore = useUserStore()
    const store = useReviewStore()
    userStore.setUser({ id: 7, role: 'student' })

    await store.replayPendingReviewUpvotes()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith('/api/reviews/10/upvote', expect.objectContaining({
      body: JSON.stringify({ upvoted: true })
    }))
    await expect(getPendingLocalActions(getStudentViewerScope(8))).resolves.toHaveLength(1)
  })

  it('does not reconcile or clear an in-flight replay after the active student viewer scope changes', async () => {
    let resolveFetch
    const studentScope = getStudentViewerScope(7)

    await savePendingLocalAction({
      viewerScope: studentScope,
      action: { type: 'review-upvote', targetKind: 'review', targetId: 10, desiredUpvoted: true }
    })
    global.fetch.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFetch = resolve
    }))

    const userStore = useUserStore()
    const store = useReviewStore()
    userStore.setUser({ id: 7, role: 'student' })
    store.viewerScope = studentScope
    store.applyReviews([{ id: 10, comment: 'Saved', upvotes: 0, has_upvoted: false }])

    const replayPromise = store.replayPendingReviewUpvotes()
    await waitForFetchStart()
    userStore.setUser({ id: 8, role: 'student' })
    resolveFetch(okUpvoteResponse({ id: 10, upvotes: 5, has_upvoted: true }))
    await replayPromise

    expect(store.reviews[0]).toEqual(expect.objectContaining({
      upvotes: 0,
      has_upvoted: false
    }))
    await expect(getPendingLocalActions(studentScope)).resolves.toHaveLength(1)
  })

  it('reconciles cached visible reviews from the authoritative server response', async () => {
    const studentScope = getStudentViewerScope(7)
    await saveEntity({
      viewerScope: studentScope,
      namespace: 'reviews',
      row: { id: 10, comment: 'Old', upvotes: 1, has_upvoted: false }
    })
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: { type: 'review-upvote', targetKind: 'review', targetId: 10, desiredUpvoted: true }
    })
    global.fetch.mockResolvedValue(okUpvoteResponse({
      id: 10,
      comment: 'Authoritative',
      upvotes: 4,
      has_upvoted: true
    }))

    const userStore = useUserStore()
    const store = useReviewStore()
    userStore.setUser({ id: 7, role: 'student' })
    store.viewerScope = studentScope
    store.activeEntityType = 'course'
    store.activeEntityId = 3
    store.applyReviews([{ id: 10, comment: 'Old', upvotes: 1, has_upvoted: false }])

    await store.replayPendingReviewUpvotes()

    expect(store.reviews[0]).toEqual(expect.objectContaining({
      comment: 'Authoritative',
      upvotes: 4,
      has_upvoted: true
    }))
    await expect(getEntity({
      viewerScope: studentScope,
      namespace: 'reviews',
      id: 10
    })).resolves.toMatchObject({
      data: expect.objectContaining({
        comment: 'Authoritative',
        upvotes: 4,
        has_upvoted: true
      })
    })
  })

  it('retains retriable failures with backoff metadata', async () => {
    await savePendingLocalAction({
      viewerScope: getStudentViewerScope(7),
      action: { type: 'review-upvote', targetKind: 'review', targetId: 10, desiredUpvoted: true }
    })
    global.fetch.mockResolvedValue(failedUpvoteResponse({ status: 503 }))

    const userStore = useUserStore()
    const store = useReviewStore()
    userStore.setUser({ id: 7, role: 'student' })

    await store.replayPendingReviewUpvotes()

    await expect(getPendingLocalActions(getStudentViewerScope(7))).resolves.toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          desiredUpvoted: true,
          status: 'queued',
          attemptCount: 1,
          nextAttemptAt: expect.any(Number),
          lastError: 'Unable to update upvote'
        })
      })
    ])
  })

  it('blocks repeated retriable failures and skips blocked review upvotes during automatic replay', async () => {
    const studentScope = getStudentViewerScope(7)
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: {
        type: 'review-upvote',
        targetKind: 'review',
        targetId: 10,
        desiredUpvoted: true,
        attemptCount: 2,
        nextAttemptAt: 0,
        status: 'queued'
      }
    })
    global.fetch.mockResolvedValue(failedUpvoteResponse({ status: 503 }))

    const userStore = useUserStore()
    const store = useReviewStore()
    const notificationStore = useNotificationStore()
    userStore.setUser({ id: 7, role: 'student' })

    await store.replayPendingReviewUpvotes()

    expect(store.hasPendingReviewUpvote(10)).toBe(true)
    expect(store.isUpdatingReviewUpvote(10)).toBe(false)
    expect(store.hasBlockedReviewUpvote(10)).toBe(true)
    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          desiredUpvoted: true,
          status: 'blocked',
          attemptCount: 3,
          nextAttemptAt: 0,
          lastError: 'Unable to update upvote'
        })
      })
    ])
    expect(notificationStore.notifications).toEqual([
      expect.objectContaining({
        message: 'Upvote could not be updated. Retry when your connection is stable.',
        variant: 'warning'
      })
    ])

    global.fetch.mockClear()
    await store.replayPendingReviewUpvotes()

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('manually retries a blocked review upvote through the normal replay path', async () => {
    const studentScope = getStudentViewerScope(7)
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: {
        type: 'review-upvote',
        targetKind: 'review',
        targetId: 10,
        desiredUpvoted: true,
        attemptCount: 3,
        nextAttemptAt: 0,
        status: 'blocked'
      }
    })
    global.fetch.mockResolvedValue(okUpvoteResponse({ id: 10, upvotes: 2, has_upvoted: true }))

    const userStore = useUserStore()
    const store = useReviewStore()
    userStore.setUser({ id: 7, role: 'student' })
    await store.refreshPendingReviewUpvotes()

    await store.retryReviewUpvote(10)

    expect(global.fetch).toHaveBeenCalledWith('/api/reviews/10/upvote', expect.objectContaining({
      body: JSON.stringify({ upvoted: true })
    }))
    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([])
  })

  it('reactivates a blocked review upvote when the user overwrites the desired state', async () => {
    const studentScope = getStudentViewerScope(7)
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: {
        type: 'review-upvote',
        targetKind: 'review',
        targetId: 10,
        desiredUpvoted: true,
        previousHasUpvoted: false,
        previousUpvotes: 0,
        attemptCount: 3,
        nextAttemptAt: 0,
        status: 'blocked'
      }
    })
    global.fetch.mockResolvedValue(okUpvoteResponse({ id: 10, upvotes: 0, has_upvoted: false }))

    const userStore = useUserStore()
    const store = useReviewStore()
    userStore.setUser({ id: 7, role: 'student' })
    store.viewerScope = studentScope
    store.activeEntityType = 'course'
    store.activeEntityId = 3
    store.applyReviews([{ id: 10, comment: 'Saved', upvotes: 1, has_upvoted: true }])

    await store.toggleUpvote(store.reviews[0])
    await waitForFetchCalls(1)

    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([])
    expect(store.hasBlockedReviewUpvote(10)).toBe(false)
    expect(global.fetch).toHaveBeenCalledWith('/api/reviews/10/upvote', expect.objectContaining({
      body: JSON.stringify({ upvoted: false })
    }))
  })

  it('discards non-retriable failures, reconciles optimistic state, and notifies', async () => {
    const studentScope = getStudentViewerScope(7)
    await saveEntity({
      viewerScope: studentScope,
      namespace: 'reviews',
      row: { id: 10, comment: 'Saved', upvotes: 1, has_upvoted: true }
    })
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: {
        type: 'review-upvote',
        targetKind: 'review',
        targetId: 10,
        desiredUpvoted: true,
        previousHasUpvoted: false,
        previousUpvotes: 0
      }
    })
    global.fetch.mockResolvedValue(failedUpvoteResponse({ status: 400, message: 'Bad upvote' }))

    const userStore = useUserStore()
    const store = useReviewStore()
    const notificationStore = useNotificationStore()
    userStore.setUser({ id: 7, role: 'student' })
    store.viewerScope = studentScope
    store.activeEntityType = 'course'
    store.activeEntityId = 3
    store.applyReviews([{ id: 10, comment: 'Saved', upvotes: 1, has_upvoted: true }])

    await store.replayPendingReviewUpvotes()

    expect(store.reviews[0]).toEqual(expect.objectContaining({
      upvotes: 0,
      has_upvoted: false
    }))
    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([])
    expect(notificationStore.notifications).toEqual([
      expect.objectContaining({
        message: 'Upvote could not be updated. Please try again.',
        variant: 'warning'
      })
    ])
  })
})
