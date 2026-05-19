<script setup>
import { computed, ref, watch } from 'vue'
import BaseCard from './common/BaseCard.vue'
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
const reviews = ref([])
const loading = ref(false)
const error = ref('')
const submitError = ref('')
const actionError = ref('')
const submitting = ref(false)
const updating = ref(false)
const deletingId = ref(null)
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

const fetchReviews = async () => {
  loading.value = true
  error.value = ''

  try {
    const params = new URLSearchParams({
      entity_type: props.entityType,
      entity_id: String(props.entityId)
    })
    const response = await fetch(`/api/reviews?${params.toString()}`, {
      credentials: 'include'
    })
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to load reviews')
    }

    reviews.value = payload.data || []
  } catch (err) {
    error.value = 'Reviews are unavailable right now. Please try again shortly.'
  } finally {
    loading.value = false
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

const submitReview = async () => {
  submitError.value = ''
  submitting.value = true

  try {
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        entity_type: props.entityType,
        entity_id: Number(props.entityId),
        rating: Number(rating.value),
        comment: comment.value
      })
    })
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to submit review')
    }

    reviews.value = [payload.data, ...reviews.value]
    rating.value = 5
    comment.value = ''
  } catch (err) {
    submitError.value = err.message || 'Review could not be submitted. Please try again.'
  } finally {
    submitting.value = false
  }
}

const updateReview = async (review) => {
  actionError.value = ''
  updating.value = true

  try {
    const response = await fetch(`/api/reviews/${review.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        rating: Number(editRating.value),
        comment: editComment.value
      })
    })
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to update review')
    }

    cancelEditing()
    await fetchReviews()
  } catch (err) {
    actionError.value = err.message || 'Review could not be updated. Please try again.'
  } finally {
    updating.value = false
  }
}

const deleteReview = async (review) => {
  actionError.value = ''
  deletingId.value = review.id

  try {
    const response = await fetch(`/api/reviews/${review.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to delete review')
    }

    if (editingReviewId.value === review.id) {
      cancelEditing()
    }
    await fetchReviews()
  } catch (err) {
    actionError.value = err.message || 'Review could not be deleted. Please try again.'
  } finally {
    deletingId.value = null
  }
}

watch(
  () => [props.entityType, props.entityId, userStore.isStudent],
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
          <label class="form-label" :for="`${entityType}-review-rating`">Rating</label>
          <select
            :id="`${entityType}-review-rating`"
            v-model="rating"
            class="form-select"
            required
          >
            <option v-for="value in 5" :key="value" :value="value">
              {{ value }} star{{ value === 1 ? '' : 's' }}
            </option>
          </select>
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
          <button class="btn btn-primary" type="submit" :disabled="submitting || !comment.trim()">
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
                class="btn btn-outline-primary"
                type="button"
                :disabled="updating || deletingId === review.id"
                @click="startEditing(review)"
              >
                Edit
              </button>
              <button
                class="btn btn-outline-danger"
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
            <label class="form-label" :for="`${entityType}-edit-review-rating-${review.id}`">Rating</label>
            <select
              :id="`${entityType}-edit-review-rating-${review.id}`"
              v-model="editRating"
              class="form-select"
              required
            >
              <option v-for="value in 5" :key="value" :value="value">
                {{ value }} star{{ value === 1 ? '' : 's' }}
              </option>
            </select>
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
            <button class="btn btn-primary btn-sm" type="submit" :disabled="updating || !editComment.trim()">
              <span v-if="updating" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
              {{ updating ? 'Saving' : 'Save changes' }}
            </button>
            <button class="btn btn-outline-secondary btn-sm" type="button" :disabled="updating" @click="cancelEditing">
              Cancel
            </button>
          </div>
        </form>

        <p v-else class="mb-3">{{ review.comment }}</p>
        <p class="text-body-secondary small mb-0">{{ review.upvotes }} upvotes</p>
      </BaseCard>
    </div>
  </section>
</template>

<style scoped>
.review-section {
  margin-top: 1.5rem;
}

.review-rating {
  color: var(--swinburne-punch);
  font-weight: 700;
  letter-spacing: 0;
  white-space: nowrap;
}

.text-bg-light {
  color: var(--bs-body-color) !important;
  background-color: rgba(var(--swinburne-punch-rgb), 0.08) !important;
}

[data-bs-theme="dark"] .text-bg-light {
  background-color: rgba(var(--swinburne-punch-rgb), 0.18) !important;
}
</style>
