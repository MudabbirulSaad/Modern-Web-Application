import { defineStore } from 'pinia'
import { apiRequest } from '../api/client'
import {
  GUEST_VIEWER_SCOPE,
  getEntity,
  getReviewCollection,
  getStudentViewerScope,
  saveReviewCollectionWithEntities
} from '../api/localCache'
import { useOnlineStore } from './onlineStore'
import { useUserStore } from './userStore'

export const REVIEW_OFFLINE_MANAGEMENT_MESSAGE = 'A network connection is required to manage reviews.'

const reviewUnavailableMessage = 'Reviews are unavailable right now. Please try again shortly.'
const staleReviewsMessage = 'Showing saved reviews. Fresh data unavailable.'

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
    async toggleUpvote(review) {
      const userStore = useUserStore()

      if (!userStore.isStudent) {
        return null
      }

      this.actionError = ''
      this.upvotingId = review.id

      try {
        const updatedReview = await apiRequest(`/api/reviews/${review.id}/upvote`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            upvoted: !review.has_upvoted
          })
        })

        this.applyReviews(this.reviews.map((currentReview) => (
          currentReview.id === updatedReview.id ? updatedReview : currentReview
        )))
        await this.saveActiveCollection()
        return updatedReview
      } catch (err) {
        this.actionError = err.message || 'Upvote could not be updated. Please try again.'
        return null
      } finally {
        this.upvotingId = null
      }
    }
  }
})
