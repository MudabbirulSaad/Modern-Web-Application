import { defineStore } from 'pinia'
import { ApiError, apiRequest } from '../api/client'
import {
  GUEST_VIEWER_SCOPE,
  canonicalizePendingLocalActionKey,
  deletePendingLocalAction,
  getEntity,
  getPendingLocalActions,
  getReviewCollection,
  getStudentViewerScope,
  saveEntity,
  savePendingLocalAction,
  saveReviewCollectionWithEntities
} from '../api/localCache'
import { useNotificationStore } from './notificationStore'
import { useOnlineStore } from './onlineStore'
import { useUserStore } from './userStore'

export const REVIEW_OFFLINE_MANAGEMENT_MESSAGE = 'A network connection is required to manage reviews.'

const reviewUnavailableMessage = 'Reviews are unavailable right now. Please try again shortly.'
const staleReviewsMessage = 'Showing saved reviews. Fresh data unavailable.'
const upvoteFailureMessage = 'Upvote could not be updated. Please try again.'
const upvoteBlockedMessage = 'Upvote could not be updated. Retry when your connection is stable.'
const retryBackoffMs = 30 * 1000
const maxRetryAttempts = 3
const pendingStatuses = {
  queued: 'queued',
  syncing: 'syncing',
  blocked: 'blocked'
}

const createInitialState = () => ({
  reviewsById: {},
  activeReviewIds: [],
  loading: true,
  refreshing: false,
  error: '',
  staleMessage: '',
  isStale: false,
  submitError: '',
  actionError: '',
  submitting: false,
  updating: false,
  deletingId: null,
  upvotingId: null,
  pendingReviewUpvoteKeys: [],
  blockedReviewUpvoteKeys: [],
  syncingReviewUpvoteKeys: [],
  replayingReviewUpvotes: false,
  replayGeneration: 0,
  viewerScope: GUEST_VIEWER_SCOPE,
  activeTargetKey: '',
  activeEntityType: '',
  activeEntityId: null
})

const createTargetKey = ({ entityType, entityId }) => `${entityType}:${entityId}`

const createReviewsUrl = ({ entityType, entityId }) => {
  const params = new URLSearchParams({
    entity_type: entityType,
    entity_id: String(entityId)
  })

  return `/api/reviews?${params.toString()}`
}

const createReviewUpvoteAction = (review, desiredUpvoted) => ({
  type: 'review-upvote',
  targetKind: 'review',
  targetId: review.id,
  desiredUpvoted,
  previousHasUpvoted: Boolean(review.has_upvoted),
  previousUpvotes: Math.max(0, Number(review.upvotes || 0)),
  attemptCount: 0,
  nextAttemptAt: 0,
  status: pendingStatuses.queued,
  lastError: ''
})

const patchReviewUpvote = (review, desiredUpvoted) => {
  const previousHasUpvoted = Boolean(review.has_upvoted)
  const previousUpvotes = Math.max(0, Number(review.upvotes || 0))
  const delta = desiredUpvoted === previousHasUpvoted ? 0 : (desiredUpvoted ? 1 : -1)

  return {
    ...review,
    has_upvoted: desiredUpvoted,
    upvotes: Math.max(0, previousUpvotes + delta)
  }
}

const isRetriableSyncError = (err) => {
  if (!(err instanceof ApiError)) {
    return true
  }

  return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500
}

const readServerReview = (payload, action) => ({
  id: action.targetId,
  ...(payload || {}),
  has_upvoted: payload?.has_upvoted ?? action.desiredUpvoted
})

const isBlockedAction = (action) => action?.status === pendingStatuses.blocked

const isSyncingAction = (action) => action?.status === pendingStatuses.syncing

const findActionRecord = (records, key) => records.find((record) => record.key === key)

const findReplayableRecord = (records) => records.find((record) => (
  !isBlockedAction(record.data) && Number(record.data?.nextAttemptAt || 0) <= Date.now()
))

export const useReviewStore = defineStore('reviews', {
  state: createInitialState,
  getters: {
    reviews: (state) => state.activeReviewIds
      .map((id) => state.reviewsById[String(id)])
      .filter(Boolean),
    hasReviews() {
      return this.reviews.length > 0
    }
  },
  actions: {
    stopPendingReviewUpvoteReplay() {
      this.replayGeneration += 1
      this.replayingReviewUpvotes = false
      this.pendingReviewUpvoteKeys = []
      this.blockedReviewUpvoteKeys = []
      this.syncingReviewUpvoteKeys = []
    },
    resetForGuestScope() {
      const nextState = createInitialState()

      this.reviewsById = nextState.reviewsById
      this.activeReviewIds = nextState.activeReviewIds
      this.loading = nextState.loading
      this.refreshing = nextState.refreshing
      this.error = nextState.error
      this.staleMessage = nextState.staleMessage
      this.isStale = nextState.isStale
      this.submitError = nextState.submitError
      this.actionError = nextState.actionError
      this.submitting = nextState.submitting
      this.updating = nextState.updating
      this.deletingId = nextState.deletingId
      this.upvotingId = nextState.upvotingId
      this.pendingReviewUpvoteKeys = nextState.pendingReviewUpvoteKeys
      this.blockedReviewUpvoteKeys = nextState.blockedReviewUpvoteKeys
      this.syncingReviewUpvoteKeys = nextState.syncingReviewUpvoteKeys
      this.replayingReviewUpvotes = nextState.replayingReviewUpvotes
      this.viewerScope = nextState.viewerScope
      this.activeTargetKey = nextState.activeTargetKey
      this.activeEntityType = nextState.activeEntityType
      this.activeEntityId = nextState.activeEntityId
    },
    getViewerScope() {
      const userStore = useUserStore()

      if (userStore.isStudent && userStore.userId) {
        return getStudentViewerScope(userStore.userId)
      }

      return GUEST_VIEWER_SCOPE
    },
    applyReviews(items) {
      const nextReviewsById = { ...this.reviewsById }

      items.forEach((review) => {
        nextReviewsById[String(review.id)] = review
      })

      this.reviewsById = nextReviewsById
      this.activeReviewIds = items.map((review) => review.id)
    },
    resetActiveReviews() {
      this.reviewsById = {}
      this.activeReviewIds = []
    },
    getStudentViewerScope() {
      const userStore = useUserStore()

      if (!userStore.isStudent || !userStore.userId) {
        return null
      }

      return getStudentViewerScope(userStore.userId)
    },
    getReviewUpvoteActionKey(reviewId) {
      return canonicalizePendingLocalActionKey({
        type: 'review-upvote',
        targetKind: 'review',
        targetId: reviewId
      })
    },
    hasPendingReviewUpvote(reviewId) {
      return this.pendingReviewUpvoteKeys.includes(this.getReviewUpvoteActionKey(reviewId))
    },
    isUpdatingReviewUpvote(reviewId) {
      const key = this.getReviewUpvoteActionKey(reviewId)
      return this.pendingReviewUpvoteKeys.includes(key) && !this.blockedReviewUpvoteKeys.includes(key)
    },
    hasBlockedReviewUpvote(reviewId) {
      return this.blockedReviewUpvoteKeys.includes(this.getReviewUpvoteActionKey(reviewId))
    },
    async refreshPendingReviewUpvotes() {
      const viewerScope = this.getStudentViewerScope()

      if (!viewerScope) {
        this.pendingReviewUpvoteKeys = []
        this.blockedReviewUpvoteKeys = []
        this.syncingReviewUpvoteKeys = []
        return []
      }

      const records = await getPendingLocalActions(viewerScope)
      const reviewUpvoteRecords = records.filter((record) => record.data?.type === 'review-upvote')
      this.pendingReviewUpvoteKeys = reviewUpvoteRecords.map((record) => record.key)
      this.blockedReviewUpvoteKeys = reviewUpvoteRecords
        .filter((record) => isBlockedAction(record.data))
        .map((record) => record.key)
      this.syncingReviewUpvoteKeys = reviewUpvoteRecords
        .filter((record) => isSyncingAction(record.data))
        .map((record) => record.key)

      return reviewUpvoteRecords
    },
    async saveActiveCollection() {
      if (!this.activeEntityType || !this.activeEntityId) {
        return
      }

      await saveReviewCollectionWithEntities({
        viewerScope: this.getViewerScope(),
        entityType: this.activeEntityType,
        entityId: this.activeEntityId,
        rows: this.reviews
      })
    },
    async hydrateFromCache(viewerScope, target) {
      const cachedCollection = await getReviewCollection({
        viewerScope,
        entityType: target.entityType,
        entityId: target.entityId
      })

      if (!cachedCollection) {
        return false
      }

      const entityRecords = await Promise.all(cachedCollection.data.reviewIds.map((id) => (
        getEntity({
          viewerScope,
          namespace: 'reviews',
          id
        })
      )))
      const reviews = entityRecords
        .map((record) => record?.data)
        .filter(Boolean)

      if (reviews.length !== cachedCollection.data.reviewIds.length) {
        return false
      }

      this.applyReviews(reviews)
      this.error = ''
      this.staleMessage = ''
      this.isStale = true
      this.loading = false

      return true
    },
    async refreshReviews(viewerScope, target, hadCachedResults) {
      const reviews = await apiRequest(createReviewsUrl(target), {
        method: 'GET'
      }) || []

      this.applyReviews(reviews)
      this.error = ''
      this.staleMessage = ''
      this.isStale = false

      await saveReviewCollectionWithEntities({
        viewerScope,
        entityType: target.entityType,
        entityId: target.entityId,
        rows: reviews
      })

      if (!hadCachedResults) {
        this.loading = false
      }
    },
    async loadReviews({ entityType, entityId }) {
      const target = {
        entityType,
        entityId: Number(entityId)
      }
      const viewerScope = this.getViewerScope()
      const targetKey = createTargetKey(target)

      if (this.viewerScope !== viewerScope || this.activeTargetKey !== targetKey) {
        this.resetActiveReviews()
        this.viewerScope = viewerScope
        this.activeTargetKey = targetKey
        this.activeEntityType = target.entityType
        this.activeEntityId = target.entityId
      }

      await this.refreshPendingReviewUpvotes()

      this.error = ''
      this.staleMessage = ''
      this.submitError = ''
      this.actionError = ''

      const hadCachedResults = await this.hydrateFromCache(viewerScope, target)

      this.loading = !hadCachedResults
      this.refreshing = true

      try {
        await this.refreshReviews(viewerScope, target, hadCachedResults)
      } catch {
        if (hadCachedResults) {
          this.staleMessage = staleReviewsMessage
          this.error = ''
          this.isStale = true
        } else {
          this.error = reviewUnavailableMessage
          this.staleMessage = ''
          this.isStale = false
          this.activeReviewIds = []
        }
      } finally {
        this.loading = false
        this.refreshing = false
      }
    },
    requireOnlineForManagement(errorTarget = 'action') {
      const onlineStore = useOnlineStore()

      if (onlineStore.online) {
        return true
      }

      if (errorTarget === 'submit') {
        this.submitError = REVIEW_OFFLINE_MANAGEMENT_MESSAGE
      } else {
        this.actionError = REVIEW_OFFLINE_MANAGEMENT_MESSAGE
      }

      return false
    },
    async createReview({ entityType, entityId, rating, comment }) {
      this.submitError = ''

      if (!this.requireOnlineForManagement('submit')) {
        return null
      }

      this.submitting = true

      try {
        const review = await apiRequest('/api/reviews', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            entity_type: entityType,
            entity_id: Number(entityId),
            rating: Number(rating),
            comment
          })
        })

        const nextReviews = [review, ...this.reviews]
        this.applyReviews(nextReviews)
        await saveReviewCollectionWithEntities({
          viewerScope: this.getViewerScope(),
          entityType,
          entityId,
          rows: nextReviews
        })
        return review
      } catch (err) {
        this.submitError = err.message || 'Review could not be submitted. Please try again.'
        return null
      } finally {
        this.submitting = false
      }
    },
    async updateReview({ id, rating, comment }) {
      this.actionError = ''

      if (!this.requireOnlineForManagement()) {
        return null
      }

      this.updating = true

      try {
        const review = await apiRequest(`/api/reviews/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            rating: Number(rating),
            comment
          })
        })

        this.applyReviews(this.reviews.map((currentReview) => (
          currentReview.id === review.id ? review : currentReview
        )))
        await this.saveActiveCollection()
        return review
      } catch (err) {
        this.actionError = err.message || 'Review could not be updated. Please try again.'
        return null
      } finally {
        this.updating = false
      }
    },
    async deleteReview(review) {
      this.actionError = ''

      if (!this.requireOnlineForManagement()) {
        return false
      }

      this.deletingId = review.id

      try {
        await apiRequest(`/api/reviews/${review.id}`, {
          method: 'DELETE'
        })
        this.activeReviewIds = this.activeReviewIds.filter((id) => id !== review.id)
        await this.saveActiveCollection()
        return true
      } catch (err) {
        this.actionError = err.message || 'Review could not be deleted. Please try again.'
        return false
      } finally {
        this.deletingId = null
      }
    },
    async patchVisibleReview(review) {
      this.applyReviews(this.reviews.map((currentReview) => (
        currentReview.id === review.id ? {
          ...currentReview,
          ...review
        } : currentReview
      )))

      await saveEntity({
        viewerScope: this.getViewerScope(),
        namespace: 'reviews',
        row: {
          ...(this.reviewsById[String(review.id)] || {}),
          ...review
        }
      })

      await this.saveActiveCollection()
    },
    async toggleUpvote(review) {
      const userStore = useUserStore()

      if (!userStore.isStudent) {
        return null
      }

      this.actionError = ''
      const viewerScope = this.getStudentViewerScope()

      if (!viewerScope) {
        return null
      }

      const desiredUpvoted = !Boolean(review.has_upvoted)
      const optimisticReview = patchReviewUpvote(review, desiredUpvoted)
      const action = createReviewUpvoteAction(review, desiredUpvoted)

      await this.patchVisibleReview(optimisticReview)
      await savePendingLocalAction({ viewerScope, action })
      await this.refreshPendingReviewUpvotes()

      void this.replayPendingReviewUpvotes()
      return optimisticReview
    },
    async reconcileReviewUpvote(action, review, replayViewerScope = this.getStudentViewerScope()) {
      const viewerScope = replayViewerScope

      if (!viewerScope || this.getStudentViewerScope() !== viewerScope) {
        return false
      }

      const cachedRecord = await getEntity({
        viewerScope,
        namespace: 'reviews',
        id: action.targetId
      })
      const mergedReview = {
        ...(cachedRecord?.data || {}),
        ...review
      }

      await saveEntity({
        viewerScope,
        namespace: 'reviews',
        row: mergedReview
      })

      if (this.viewerScope === viewerScope && this.reviewsById[String(action.targetId)]) {
        this.applyReviews(this.reviews.map((currentReview) => (
          currentReview.id === action.targetId ? {
            ...currentReview,
            ...mergedReview
          } : currentReview
        )))
        await this.saveActiveCollection()
      }

      return true
    },
    async keepReviewUpvoteForRetry(viewerScope, record, err) {
      const attemptCount = Number(record.data?.attemptCount || 0) + 1
      const blocked = attemptCount >= maxRetryAttempts

      await savePendingLocalAction({
        viewerScope,
        action: {
          ...record.data,
          attemptCount,
          status: blocked ? pendingStatuses.blocked : pendingStatuses.queued,
          nextAttemptAt: blocked ? 0 : Date.now() + (retryBackoffMs * attemptCount),
          lastError: err.message || upvoteFailureMessage
        }
      })
      await this.refreshPendingReviewUpvotes()

      if (blocked) {
        useNotificationStore().notify({
          message: upvoteBlockedMessage,
          variant: 'warning'
        })
      }
    },
    async retryReviewUpvote(reviewId) {
      const viewerScope = this.getStudentViewerScope()

      if (!viewerScope) {
        return false
      }

      const key = this.getReviewUpvoteActionKey(reviewId)
      const records = await getPendingLocalActions(viewerScope)
      const record = findActionRecord(records, key)

      if (!record?.data || !isBlockedAction(record.data)) {
        return false
      }

      await savePendingLocalAction({
        viewerScope,
        action: {
          ...record.data,
          status: pendingStatuses.queued,
          nextAttemptAt: 0,
          lastError: ''
        }
      })
      await this.refreshPendingReviewUpvotes()
      await this.replayPendingReviewUpvotes()
      return true
    },
    async discardReviewUpvoteAndReconcile(viewerScope, record) {
      const rollbackReview = {
        id: record.data.targetId,
        has_upvoted: record.data.previousHasUpvoted ?? !record.data.desiredUpvoted,
        upvotes: Math.max(0, Number(record.data.previousUpvotes || 0))
      }

      await Promise.all([
        deletePendingLocalAction({ viewerScope, action: record.data }),
        this.reconcileReviewUpvote(record.data, rollbackReview, viewerScope)
      ])
      await this.refreshPendingReviewUpvotes()
      useNotificationStore().notify({
        message: upvoteFailureMessage,
        variant: 'warning'
      })
    },
    async replayPendingReviewUpvotes() {
      const viewerScope = this.getStudentViewerScope()

      if (!viewerScope || this.replayingReviewUpvotes) {
        return
      }

      this.replayingReviewUpvotes = true
      const replayGeneration = this.replayGeneration

      try {
        let records = await this.refreshPendingReviewUpvotes()

        while (records.length > 0 && this.replayGeneration === replayGeneration) {
          const record = findReplayableRecord(records)

          if (!record) {
            break
          }

          const action = record.data

          try {
            await savePendingLocalAction({
              viewerScope,
              action: {
                ...action,
                status: pendingStatuses.syncing
              }
            })
            await this.refreshPendingReviewUpvotes()
            const payload = await apiRequest(`/api/reviews/${action.targetId}/upvote`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                upvoted: action.desiredUpvoted
              })
            })
            const latestRecords = await getPendingLocalActions(viewerScope)
            const latestRecord = latestRecords.find((item) => item.key === record.key)

            if (this.replayGeneration !== replayGeneration) {
              break
            }

            if (latestRecord?.data?.desiredUpvoted !== action.desiredUpvoted) {
              records = await this.refreshPendingReviewUpvotes()
              continue
            }

            if (this.getStudentViewerScope() !== viewerScope) {
              break
            }

            await this.reconcileReviewUpvote(action, readServerReview(payload, action), viewerScope)
            await deletePendingLocalAction({ viewerScope, action })
            records = await this.refreshPendingReviewUpvotes()
          } catch (err) {
            if (isRetriableSyncError(err)) {
              await this.keepReviewUpvoteForRetry(viewerScope, record, err)
            } else {
              await this.discardReviewUpvoteAndReconcile(viewerScope, record)
            }
            break
          }
        }
      } finally {
        if (this.replayGeneration === replayGeneration) {
          this.replayingReviewUpvotes = false
        }
      }
    }
  }
})
