<script setup>
import { computed, watch } from 'vue'
import BaseCard from './common/BaseCard.vue'
import { shouldAllowReviewUpvote, shouldShowReviewActions } from './reviewActions'
import { useUserStore } from '../store/userStore'
import { useReviewWorkflow } from '../reviews/useReviewWorkflow'
import ReviewRatingInput from '../reviews/ReviewRatingInput.vue'

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
const canReview = computed(() => userStore.isStudent)
const entityLabel = computed(() => props.entityType === 'course' ? 'course' : 'tutor')
const reviewLimitText = computed(() => canReview.value ? 'All reviews' : 'Top reviews')
const workflow = useReviewWorkflow({
  entityType: () => props.entityType,
  entityId: () => props.entityId,
  canReview: () => canReview.value
})
const {
  reviews,
  loading,
  error,
  submitError,
  actionError,
  submitting,
  updating,
  deletingId,
  upvotingId,
  editingReviewId,
  editRating,
  editComment,
  rating,
  comment,
  loadReviews,
  createReview,
  startEditing,
  cancelEditing,
  updateReview,
  deleteReview,
  toggleUpvote
} = workflow

const hasReviews = computed(() => reviews.value.length > 0)
const upvoteLabel = (review) => `${review.upvotes} helpful vote${Number(review.upvotes) === 1 ? '' : 's'}`
const submitReview = createReview

watch(
  () => [props.entityType, props.entityId, userStore.isStudent],
  loadReviews,
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
          <ReviewRatingInput
            v-model="rating"
            :id-prefix="`${entityType}-review-rating`"
            :name="`${entityType}-review-rating`"
            :labelledby="`${entityType}-review-rating-label`"
            :disabled="submitting"
          />
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

            <div v-if="shouldShowReviewActions(review)" class="btn-group btn-group-sm" aria-label="Review actions">
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
            <ReviewRatingInput
              v-model="editRating"
              :id-prefix="`${entityType}-edit-review-rating-${review.id}`"
              :name="`${entityType}-edit-review-rating-${review.id}`"
              :labelledby="`${entityType}-edit-review-rating-label-${review.id}`"
              :disabled="updating"
            />
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
            :disabled="!shouldAllowReviewUpvote(review, canReview) || upvotingId === review.id"
            :aria-pressed="review.has_upvoted ? 'true' : 'false'"
            @click="toggleUpvote(review)"
          >
            <span
              v-if="upvotingId === review.id"
              class="spinner-border spinner-border-sm me-1"
              aria-hidden="true"
            ></span>
            Helpful
          </button>
          <p class="text-body-secondary small mb-0">{{ upvoteLabel(review) }}</p>
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

.text-bg-light {
  color: var(--bs-body-color) !important;
  background-color: rgba(var(--swinburne-punch-rgb), 0.08) !important;
}

[data-bs-theme="dark"] .text-bg-light {
  background-color: rgba(var(--swinburne-punch-rgb), 0.18) !important;
}
</style>
