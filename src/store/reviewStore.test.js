import { createPinia, setActivePinia } from 'pinia'
import { jest } from '@jest/globals'
import {
  GUEST_VIEWER_SCOPE,
  getEntity,
  getReviewCollection,
  getStudentViewerScope,
  resetLocalCacheForTests,
  saveReviewCollectionWithEntities
} from '../api/localCache.js'
import { configureApiClient } from '../api/client.js'
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
