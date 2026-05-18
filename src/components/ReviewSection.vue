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
const submitting = ref(false)
const rating = ref(5)
const comment = ref('')

const hasReviews = computed(() => reviews.value.length > 0)
const canReview = computed(() => userStore.isStudent)
const entityLabel = computed(() => props.entityType === 'course' ? 'course' : 'tutor')
const reviewLimitText = computed(() => canReview.value ? 'All reviews' : 'Top reviews')

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
      <BaseCard v-for="review in reviews" :key="review.id">
        <div class="d-flex flex-column flex-sm-row justify-content-between gap-2 mb-3">
          <div>
            <p class="fw-semibold mb-1">{{ review.username || 'Student' }}</p>
            <p class="text-body-secondary small mb-0">
              {{ new Date(review.created_at).toLocaleDateString() }}
            </p>
          </div>
          <div class="review-rating" :aria-label="`${review.rating} out of 5 stars`">
            {{ '★'.repeat(review.rating) }}{{ '☆'.repeat(5 - review.rating) }}
          </div>
        </div>

        <p class="mb-3">{{ review.comment }}</p>
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
