<script setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import BaseCard from './common/BaseCard.vue'
import { getRatingFromArrowKey, reviewStarOptions } from './reviewStars'
import { useReviewStore } from '../store/reviewStore'
import { useUserStore } from '../store/userStore'

const props = defineProps({
  entityType: {
    type: String,
    required: true
  },
  entityId: {
    type: [Number, String],
    required: true
  }
})

const userStore = useUserStore()
const reviewStore = useReviewStore()
const {
  reviews,
  loading,
  error,
  staleMessage,
  submitError,
  actionError,
  submitting,
  updating,
  deletingId
} = storeToRefs(reviewStore)
const editingReviewId = ref(null)
const editRating = ref(5)
const editComment = ref('')
const rating = ref(5)
const comment = ref('')

const hasReviews = computed(() => reviews.value.length > 0)
const canReview = computed(() => userStore.isStudent)
const entityLabel = computed(() => props.entityType === 'course' ? 'course' : 'tutor')
const reviewLimitText = computed(() => canReview.value ? 'All reviews' : 'Top reviews')
const isReviewAuthor = (review) => userStore.userId && Number(review.user_id) === Number(userStore.userId)
const isReviewUpvotePending = (review) => reviewStore.isUpdatingReviewUpvote(review.id)
const isReviewUpvoteBlocked = (review) => reviewStore.hasBlockedReviewUpvote(review.id)

const upvoteLabel = (review) => `${review.upvotes} helpful vote${Number(review.upvotes) === 1 ? '' : 's'}`

const updateNewRatingFromKey = (event) => {
  const nextRating = getRatingFromArrowKey(event.key, rating.value)

  if (nextRating !== Number(rating.value)) {
    event.preventDefault()
    rating.value = nextRating
  }
}

const updateEditRatingFromKey = (event) => {
  const nextRating = getRatingFromArrowKey(event.key, editRating.value)

  if (nextRating !== Number(editRating.value)) {
    event.preventDefault()
    editRating.value = nextRating
  }
}

const fetchReviews = async () => {
  await reviewStore.loadReviews({
    entityType: props.entityType,
    entityId: props.entityId
  })
}

const startEditing = (review) => {
  reviewStore.actionError = ''
  editingReviewId.value = review.id
  editRating.value = review.rating
  editComment.value = review.comment
}

const cancelEditing = () => {
  editingReviewId.value = null
  editRating.value = 5
  editComment.value = ''
}

const submitReview = async () => {
  const review = await reviewStore.createReview({
    entityType: props.entityType,
    entityId: props.entityId,
    rating: rating.value,
    comment: comment.value
  })

  if (review) {
    rating.value = 5
    comment.value = ''
  }
}

const updateReview = async (review) => {
  const updatedReview = await reviewStore.updateReview({
    id: review.id,
    rating: editRating.value,
    comment: editComment.value
  })

  if (updatedReview) {
    cancelEditing()
  }
}

const deleteReview = async (review) => {
  const deleted = await reviewStore.deleteReview(review)

  if (deleted && editingReviewId.value === review.id) {
    cancelEditing()
  }
}

const toggleUpvote = async (review) => {
  if (!canReview.value) {
    return
  }

  await reviewStore.toggleUpvote(review)
}

const retryReviewUpvote = (review) => {
  reviewStore.retryReviewUpvote(review.id)
}

watch(
  () => [props.entityType, props.entityId, userStore.isStudent, userStore.userId],
  fetchReviews,
  { immediate: true }
)
</script>

<template>
  <section class="review-section" aria-labelledby="reviews-heading">
    <div class="d-flex align-items-center justify-content-between gap-3 mb-3">
      <h2 id="reviews-heading" class="h3 mb-0">Reviews</h2>
      <span class="badge rounded-pill text-bg-light border">{{ reviewLimitText }}</span>
    </div>

    <BaseCard v-if="canReview" class="mb-4">
      <h3 class="h5 mb-3">Leave a Review</h3>

      <form class="vstack gap-3" @submit.prevent="submitReview">
        <div>
          <p :id="`${entityType}-review-rating-label`" class="form-label mb-2">Rating</p>
          <div
            class="review-star-input"
            role="radiogroup"
            :aria-labelledby="`${entityType}-review-rating-label`"
          >
            <template v-for="option in reviewStarOptions(rating)" :key="option.value">
              <input
                :id="`${entityType}-review-rating-${option.value}`"
                v-model="rating"
                class="btn-check"
                type="radio"
                :name="`${entityType}-review-rating`"
                :value="option.value"
                required
                @keydown="updateNewRatingFromKey"
              >
              <label
                class="review-star-button"
                :class="{ 'is-filled': option.filled }"
                :for="`${entityType}-review-rating-${option.value}`"
              >
                <span aria-hidden="true">★</span>
                <span class="visually-hidden">{{ option.label }}</span>
              </label>
            </template>
          </div>
        </div>

        <div>
          <label class="form-label" :for="`${entityType}-review-comment`">Comment</label>
          <textarea
            :id="`${entityType}-review-comment`"
            v-model="comment"
            class="form-control"
            rows="4"
            maxlength="1000"
            required
          ></textarea>
        </div>

        <div v-if="submitError" class="alert alert-danger mb-0" role="alert">
          {{ submitError }}
        </div>

        <div>
          <button class="btn btn-directory-action" type="submit" :disabled="submitting || !comment.trim()">
            <span v-if="submitting" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            {{ submitting ? 'Submitting' : 'Submit review' }}
          </button>
        </div>
      </form>
    </BaseCard>

    <p v-else class="text-body-secondary mb-4">
      Log in as a student to leave a review for this {{ entityLabel }}.
    </p>

    <div v-if="loading" class="alert alert-secondary" role="status">
      Loading reviews...
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div v-else-if="!hasReviews" class="alert alert-secondary" role="status">
      No reviews yet.
    </div>

    <div v-else class="vstack gap-3">
      <div v-if="staleMessage" class="alert alert-warning mb-0" role="status">
        {{ staleMessage }}
      </div>

      <div v-if="actionError" class="alert alert-danger mb-0" role="alert">
        {{ actionError }}
      </div>

      <BaseCard v-for="review in reviews" :key="review.id">
        <div class="d-flex flex-column flex-sm-row justify-content-between gap-2 mb-3">
          <div>
            <p class="fw-semibold mb-1">{{ review.username || 'Student' }}</p>
            <p class="text-body-secondary small mb-0">
              {{ new Date(review.created_at).toLocaleDateString() }}
            </p>
          </div>

          <div class="d-flex flex-column align-items-start align-items-sm-end gap-2">
            <div class="review-rating" :aria-label="`${review.rating} out of 5 stars`">
              {{ '★'.repeat(review.rating) }}{{ '☆'.repeat(5 - review.rating) }}
            </div>

            <div v-if="isReviewAuthor(review)" class="btn-group btn-group-sm" aria-label="Review actions">
              <button
                class="btn btn-directory-action-secondary"
                type="button"
                :disabled="updating || deletingId === review.id"
                @click="startEditing(review)"
              >
                Edit
              </button>
              <button
                class="btn btn-directory-action-danger"
                type="button"
                :disabled="updating || deletingId === review.id"
                @click="deleteReview(review)"
              >
                <span
                  v-if="deletingId === review.id"
                  class="spinner-border spinner-border-sm me-1"
                  aria-hidden="true"
                ></span>
                {{ deletingId === review.id ? 'Deleting' : 'Delete' }}
              </button>
            </div>
          </div>
        </div>

        <form
          v-if="editingReviewId === review.id"
          class="vstack gap-3 mb-3"
          @submit.prevent="updateReview(review)"
        >
          <div>
            <p :id="`${entityType}-edit-review-rating-label-${review.id}`" class="form-label mb-2">Rating</p>
            <div
              class="review-star-input"
              role="radiogroup"
              :aria-labelledby="`${entityType}-edit-review-rating-label-${review.id}`"
            >
              <template v-for="option in reviewStarOptions(editRating)" :key="option.value">
                <input
                  :id="`${entityType}-edit-review-rating-${review.id}-${option.value}`"
                  v-model="editRating"
                  class="btn-check"
                  type="radio"
                  :name="`${entityType}-edit-review-rating-${review.id}`"
                  :value="option.value"
                  required
                  @keydown="updateEditRatingFromKey"
                >
                <label
                  class="review-star-button"
                  :class="{ 'is-filled': option.filled }"
                  :for="`${entityType}-edit-review-rating-${review.id}-${option.value}`"
                >
                  <span aria-hidden="true">★</span>
                  <span class="visually-hidden">{{ option.label }}</span>
                </label>
              </template>
            </div>
          </div>

          <div>
            <label class="form-label" :for="`${entityType}-edit-review-comment-${review.id}`">Comment</label>
            <textarea
              :id="`${entityType}-edit-review-comment-${review.id}`"
              v-model="editComment"
              class="form-control"
              rows="4"
              maxlength="1000"
              required
            ></textarea>
          </div>

          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-directory-action btn-sm" type="submit" :disabled="updating || !editComment.trim()">
              <span v-if="updating" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
              {{ updating ? 'Saving' : 'Save changes' }}
            </button>
            <button class="btn btn-directory-action-secondary btn-sm" type="button" :disabled="updating" @click="cancelEditing">
              Cancel
            </button>
          </div>
        </form>

        <p v-else class="mb-3">{{ review.comment }}</p>

        <div class="d-flex align-items-center gap-2">
          <button
            class="btn btn-sm"
            :class="review.has_upvoted ? 'btn-directory-action' : 'btn-directory-action-secondary'"
            type="button"
            :disabled="!canReview"
            :aria-pressed="review.has_upvoted ? 'true' : 'false'"
            :aria-busy="isReviewUpvotePending(review) ? 'true' : 'false'"
            @click="toggleUpvote(review)"
          >
            Helpful
          </button>
          <p class="text-body-secondary small mb-0">{{ upvoteLabel(review) }}</p>
          <span
            v-if="isReviewUpvotePending(review)"
            class="badge rounded-pill text-bg-light border"
            role="status"
          >
            Syncing
          </span>
          <span
            v-if="isReviewUpvoteBlocked(review)"
            class="badge rounded-pill text-bg-warning-subtle text-warning-emphasis border border-warning-subtle"
            role="status"
          >
            Sync paused
          </span>
          <button
            v-if="isReviewUpvoteBlocked(review)"
            class="btn btn-link btn-sm p-0"
            type="button"
            @click="retryReviewUpvote(review)"
          >
            Retry
          </button>
        </div>
      </BaseCard>
    </div>
  </section>
</template>

<style scoped>
.review-section {
  margin-top: 1.5rem;
}

.review-rating {
  color: var(--swinburne-supernova);
  font-weight: 700;
  letter-spacing: 0;
  white-space: nowrap;
}

.review-star-input {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.review-star-button {
  color: var(--bs-secondary-color);
  cursor: pointer;
  font-size: 1.8rem;
  line-height: 1;
  padding: 0.125rem;
  transition: color 0.15s ease, transform 0.15s ease;
}

.review-star-button:hover,
.review-star-button.is-filled {
  color: var(--swinburne-supernova);
}

.btn-check:focus + .review-star-button {
  border-radius: 0.25rem;
  box-shadow: 0 0 0 0.25rem var(--swinburne-focus-ring);
  outline: 0;
}

.btn-check:checked + .review-star-button {
  color: var(--swinburne-supernova);
  transform: translateY(-1px);
}

.text-bg-light {
  color: var(--bs-body-color) !important;
  background-color: rgba(var(--swinburne-punch-rgb), 0.08) !important;
}

[data-bs-theme="dark"] .text-bg-light {
  background-color: rgba(var(--swinburne-punch-rgb), 0.18) !important;
}
</style>
