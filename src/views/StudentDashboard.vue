<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import { useUserStore } from '../store/userStore'

const userStore = useUserStore()
const favoriteTutors = ref([])
const favoriteCourses = ref([])
const reviews = ref([])
const loading = ref(true)
const error = ref('')

const hasFavoriteTutors = computed(() => favoriteTutors.value.length > 0)
const hasFavoriteCourses = computed(() => favoriteCourses.value.length > 0)
const hasReviews = computed(() => reviews.value.length > 0)

const reviewEntityRoute = (review) => ({
  name: review.entity_type === 'course' ? 'course-detail' : 'tutor-detail',
  params: { id: review.entity_id }
})

const reviewEntityTypeLabel = (review) => review.entity_type === 'course' ? 'Course' : 'Tutor'

onMounted(async () => {
  loading.value = true
  error.value = ''

  try {
    const [favoritesResponse, reviewsResponse] = await Promise.all([
      fetch(`/api/users/${userStore.userId}/favorites`, {
        credentials: 'include'
      }),
      fetch(`/api/users/${userStore.userId}/reviews`, {
        credentials: 'include'
      })
    ])
    const favoritesPayload = await favoritesResponse.json()
    const reviewsPayload = await reviewsResponse.json()

    if (!favoritesResponse.ok) {
      throw new Error(favoritesPayload.message || 'Unable to load favorites')
    }

    if (!reviewsResponse.ok) {
      throw new Error(reviewsPayload.message || 'Unable to load review history')
    }

    favoriteTutors.value = favoritesPayload.data?.tutors || []
    favoriteCourses.value = favoritesPayload.data?.courses || []
    reviews.value = reviewsPayload.data || []
  } catch (err) {
    error.value = 'Dashboard data is unavailable right now. Please try again shortly.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="student-dashboard">
    <div class="mb-4">
      <p class="text-uppercase text-primary fw-bold small mb-2">Student Dashboard</p>
      <h1 class="mb-2">My saved courses, tutors, and reviews</h1>
      <p class="lead text-body-secondary mb-0">
        Keep track of the directory entries and review history connected to your student account.
      </p>
    </div>

    <div v-if="loading" class="vstack gap-4">
      <BaseCard v-for="section in 3" :key="section" aria-label="Loading dashboard section">
        <div class="placeholder-glow">
          <span class="placeholder col-4 mb-3"></span>
          <span class="placeholder col-10"></span>
          <span class="placeholder col-8"></span>
        </div>
      </BaseCard>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div v-else class="vstack gap-5">
      <section aria-labelledby="favorite-tutors-heading">
        <div class="d-flex align-items-center justify-content-between gap-3 mb-3">
          <h2 id="favorite-tutors-heading" class="h3 mb-0">Favorite Tutors</h2>
          <RouterLink class="btn btn-directory-action-secondary btn-sm" to="/tutors">Browse tutors</RouterLink>
        </div>

        <div v-if="!hasFavoriteTutors" class="alert alert-secondary" role="status">
          You have not saved any tutors yet.
        </div>

        <div v-else class="row g-4">
          <div v-for="tutor in favoriteTutors" :key="tutor.id" class="col-12 col-md-6">
            <BaseCard>
              <template #header>
                <span class="badge rounded-pill text-bg-light border">{{ tutor.department }}</span>
              </template>

              <h3 class="h5 mb-3">{{ tutor.name }}</h3>
              <p class="text-body-secondary mb-0">{{ tutor.bio }}</p>

              <template #footer>
                <RouterLink
                  class="btn btn-directory-action btn-sm"
                  :to="{ name: 'tutor-detail', params: { id: tutor.id } }"
                >
                  View profile
                </RouterLink>
              </template>
            </BaseCard>
          </div>
        </div>
      </section>

      <section aria-labelledby="favorite-courses-heading">
        <div class="d-flex align-items-center justify-content-between gap-3 mb-3">
          <h2 id="favorite-courses-heading" class="h3 mb-0">Favorite Courses</h2>
          <RouterLink class="btn btn-directory-action-secondary btn-sm" to="/courses">Browse courses</RouterLink>
        </div>

        <div v-if="!hasFavoriteCourses" class="alert alert-secondary" role="status">
          You have not saved any courses yet.
        </div>

        <div v-else class="row g-4">
          <div v-for="course in favoriteCourses" :key="course.id" class="col-12 col-md-6">
            <BaseCard>
              <template #header>
                <span class="badge rounded-pill text-bg-light border">{{ course.department }}</span>
              </template>

              <h3 class="h5 mb-3">{{ course.title }}</h3>
              <p class="text-body-secondary mb-3">{{ course.description }}</p>
              <p v-if="course.tutor_names" class="small text-body-secondary mb-0">
                Tutors: {{ course.tutor_names }}
              </p>

              <template #footer>
                <RouterLink
                  class="btn btn-directory-action btn-sm"
                  :to="{ name: 'course-detail', params: { id: course.id } }"
                >
                  View course
                </RouterLink>
              </template>
            </BaseCard>
          </div>
        </div>
      </section>

      <section aria-labelledby="review-history-heading">
        <div class="d-flex align-items-center justify-content-between gap-3 mb-3">
          <h2 id="review-history-heading" class="h3 mb-0">Past Reviews</h2>
          <span class="badge rounded-pill text-bg-light border">{{ reviews.length }} total</span>
        </div>

        <div v-if="!hasReviews" class="alert alert-secondary" role="status">
          You have not written any reviews yet.
        </div>

        <div v-else class="vstack gap-3">
          <BaseCard v-for="review in reviews" :key="review.id">
            <div class="d-flex flex-column flex-sm-row justify-content-between gap-3 mb-3">
              <div>
                <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                  <span class="badge rounded-pill text-bg-light border">{{ reviewEntityTypeLabel(review) }}</span>
                  <span class="badge rounded-pill text-bg-light border">{{ review.entity_department }}</span>
                </div>
                <h3 class="h5 mb-1">
                  <RouterLink class="link-body-emphasis" :to="reviewEntityRoute(review)">
                    {{ review.entity_title || 'Directory entry' }}
                  </RouterLink>
                </h3>
                <p class="text-body-secondary small mb-0">
                  {{ new Date(review.created_at).toLocaleDateString() }}
                </p>
              </div>

              <div class="review-rating" :aria-label="`${review.rating} out of 5 stars`">
                {{ '★'.repeat(review.rating) }}{{ '☆'.repeat(5 - review.rating) }}
              </div>
            </div>

            <p class="mb-3">{{ review.comment }}</p>
            <p class="text-body-secondary small mb-0">
              {{ review.upvotes }} helpful vote{{ Number(review.upvotes) === 1 ? '' : 's' }}
            </p>
          </BaseCard>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.student-dashboard {
  max-width: 1100px;
  margin: 0 auto;
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
