<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import FavoriteButton from '../components/common/FavoriteButton.vue'
import ReviewSection from '../components/ReviewSection.vue'
import { registerFavoriteEntityPatcher, useFavoriteSyncStore } from '../store/favoriteSyncStore'
import { useUserStore } from '../store/userStore'

const route = useRoute()
const userStore = useUserStore()
const favoriteSyncStore = useFavoriteSyncStore()
const course = ref(null)
const loading = ref(true)
const error = ref('')
const favoriteError = ref('')
const notFound = ref(false)

const tutors = computed(() => course.value?.tutors || [])
const hasTutors = computed(() => tutors.value.length > 0)
const favoriteLoading = computed(() => (
  course.value ? favoriteSyncStore.hasPendingFavorite('course', course.value.id) : false
))

onMounted(async () => {
  try {
    const response = await fetch(`/api/courses/${route.params.id}`, {
      credentials: 'include'
    })

    if (response.status === 404) {
      notFound.value = true
      return
    }

    if (!response.ok) {
      throw new Error('Unable to load course')
    }

    const payload = await response.json()
    course.value = payload.data || null

    if (course.value) {
      registerFavoriteEntityPatcher({
        targetKind: 'course',
        targetId: course.value.id,
        patch: (entity) => {
          course.value = {
            ...course.value,
            ...entity
          }
        }
      })
    }
  } catch (err) {
    error.value = 'Course details are unavailable right now. Please try again shortly.'
  } finally {
    loading.value = false
  }
})

const toggleFavorite = async () => {
  if (!userStore.isStudent || !course.value) {
    return
  }

  favoriteError.value = ''
  const previousFavorite = Boolean(course.value.has_favorite)
  const desiredFavorite = !previousFavorite
  course.value = { ...course.value, has_favorite: desiredFavorite }

  const enqueued = await favoriteSyncStore.enqueueFavorite({
    targetKind: 'course',
    targetId: course.value.id,
    desiredFavorite,
    previousFavorite,
    entity: course.value
  })

  if (!enqueued) {
    favoriteError.value = 'Favorite could not be updated. Please try again.'
  }
}
</script>

<template>
  <section class="course-detail">
    <RouterLink class="btn btn-directory-action-secondary btn-sm mb-3" to="/courses">
      Back to courses
    </RouterLink>

    <BaseCard v-if="loading" aria-label="Loading course details">
      <div class="placeholder-glow">
        <span class="placeholder col-5 mb-3"></span>
        <span class="placeholder col-9 mb-4"></span>
        <span class="placeholder col-12"></span>
        <span class="placeholder col-11"></span>
        <span class="placeholder col-8 mb-4"></span>
        <span class="placeholder col-4"></span>
      </div>
    </BaseCard>

    <div v-else-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div v-else-if="notFound || !course" class="alert alert-secondary" role="status">
      Course not found.
    </div>

    <div v-else class="vstack gap-4">
      <BaseCard>
        <template #header>
          <div class="d-flex justify-content-between gap-3 align-items-center">
            <span class="badge rounded-pill text-bg-light border">{{ course.department }}</span>
            <FavoriteButton
              v-if="userStore.isStudent"
              :active="course.has_favorite"
              :loading="favoriteLoading"
              @toggle="toggleFavorite"
            />
          </div>
        </template>

        <div v-if="favoriteError" class="alert alert-warning" role="alert">{{ favoriteError }}</div>
        <p class="text-uppercase text-primary fw-bold small mb-2">Course Details</p>
        <h1 class="mb-4">{{ course.title }}</h1>
        <p class="lead text-body-secondary mb-0">{{ course.description }}</p>
      </BaseCard>

      <section aria-labelledby="assigned-tutors-heading">
        <h2 id="assigned-tutors-heading" class="h3 mb-3">Assigned tutors</h2>

        <div v-if="!hasTutors" class="alert alert-secondary" role="status">
          Tutors are yet to be assigned.
        </div>

        <div v-else class="row g-4">
          <div v-for="tutor in tutors" :key="tutor.id" class="col-12 col-md-6">
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

      <ReviewSection entity-type="course" :entity-id="course.id" />
    </div>
  </section>
</template>

<style scoped>
.course-detail {
  max-width: 980px;
  margin: 0 auto;
}

.text-bg-light {
  color: var(--bs-body-color) !important;
  background-color: rgba(var(--swinburne-punch-rgb), 0.08) !important;
}

[data-bs-theme="dark"] .text-bg-light {
  background-color: rgba(var(--swinburne-punch-rgb), 0.18) !important;
}
</style>
