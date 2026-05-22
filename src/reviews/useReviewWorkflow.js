import { ref } from 'vue'
import { shouldAllowReviewUpvote } from '../components/reviewActions.js'
import { reviewApi as defaultReviewApi } from './reviewApi.js'

const DEFAULT_LOAD_ERROR = 'Reviews are unavailable right now. Please try again shortly.'

export const useReviewWorkflow = ({
  entityType,
  entityId,
  canReview,
  reviewApi = defaultReviewApi
}) => {
  const reviews = ref([])
  const loading = ref(false)
  const error = ref('')
  const submitError = ref('')
  const actionError = ref('')
  const submitting = ref(false)
  const updating = ref(false)
  const deletingId = ref(null)
  const upvotingId = ref(null)
  const rating = ref(5)
  const comment = ref('')
  const editingReviewId = ref(null)
  const editRating = ref(5)
  const editComment = ref('')

  const resolveEntityType = () => (typeof entityType === 'function' ? entityType() : entityType)
  const resolveEntityId = () => (typeof entityId === 'function' ? entityId() : entityId)
  const resolveCanReview = () => (typeof canReview === 'function' ? canReview() : canReview)

  const loadReviews = async () => {
    loading.value = true
    error.value = ''

    try {
      const payload = await reviewApi.listReviews({
        entityType: resolveEntityType(),
        entityId: resolveEntityId()
      })

      reviews.value = payload.data || []
    } catch (err) {
      error.value = DEFAULT_LOAD_ERROR
    } finally {
      loading.value = false
    }
  }

  const createReview = async () => {
    submitError.value = ''
    submitting.value = true

    try {
      const payload = await reviewApi.createReview({
        entityType: resolveEntityType(),
        entityId: resolveEntityId(),
        rating: Number(rating.value),
        comment: comment.value
      })

      reviews.value = [payload.data, ...reviews.value]
      rating.value = 5
      comment.value = ''

      return true
    } catch (err) {
      submitError.value = err.message || 'Review could not be submitted. Please try again.'
      return false
    } finally {
      submitting.value = false
    }
  }

  const startEditing = (review) => {
    actionError.value = ''
    editingReviewId.value = review.id
    editRating.value = review.rating
    editComment.value = review.comment
  }

  const cancelEditing = () => {
    editingReviewId.value = null
    editRating.value = 5
    editComment.value = ''
  }

  const replaceReview = (review) => {
    reviews.value = reviews.value.map((currentReview) => (
      currentReview.id === review.id ? review : currentReview
    ))
  }

  const updateReview = async (review) => {
    actionError.value = ''
    updating.value = true

    try {
      const payload = await reviewApi.updateReview({
        reviewId: review.id,
        rating: Number(editRating.value),
        comment: editComment.value
      })

      replaceReview(payload.data)
      cancelEditing()

      return true
    } catch (err) {
      actionError.value = err.message || 'Review could not be updated. Please try again.'
      return false
    } finally {
      updating.value = false
    }
  }

  const deleteReview = async (review) => {
    actionError.value = ''
    deletingId.value = review.id

    try {
      await reviewApi.deleteReview({ reviewId: review.id })

      reviews.value = reviews.value.filter((currentReview) => currentReview.id !== review.id)
      if (editingReviewId.value === review.id) {
        cancelEditing()
      }

      return true
    } catch (err) {
      actionError.value = err.message || 'Review could not be deleted. Please try again.'
      return false
    } finally {
      deletingId.value = null
    }
  }

  const toggleUpvote = async (review) => {
    if (!shouldAllowReviewUpvote(review, resolveCanReview())) {
      return false
    }

    actionError.value = ''
    upvotingId.value = review.id

    try {
      const payload = await reviewApi.toggleUpvote({ reviewId: review.id })

      replaceReview(payload.data)

      return true
    } catch (err) {
      actionError.value = err.message || 'Upvote could not be updated. Please try again.'
      return false
    } finally {
      upvotingId.value = null
    }
  }

  return {
    reviews,
    loading,
    error,
    submitError,
    actionError,
    submitting,
    updating,
    deletingId,
    upvotingId,
    rating,
    comment,
    editingReviewId,
    editRating,
    editComment,
    loadReviews,
    createReview,
    startEditing,
    cancelEditing,
    updateReview,
    deleteReview,
    toggleUpvote
  }
}
