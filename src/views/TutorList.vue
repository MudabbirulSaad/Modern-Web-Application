<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import FavoriteButton from '../components/common/FavoriteButton.vue'
import { useUserStore } from '../store/userStore'

const userStore = useUserStore()
const tutors = ref([])
const loading = ref(true)
const error = ref('')
const favoriteError = ref('')
const updatingFavorites = ref(new Set())

const hasTutors = computed(() => tutors.value.length > 0)

onMounted(async () => {
  try {
    const response = await fetch('/api/tutors', {
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error('Unable to load tutors')
    }

    const payload = await response.json()
    tutors.value = payload.data || []
  } catch (err) {
    error.value = 'Tutors are unavailable right now. Please try again shortly.'
  } finally {
    loading.value = false
  }
})

const isUpdatingFavorite = (tutorId) => updatingFavorites.value.has(tutorId)

const setTutorFavorite = (tutorId, hasFavorite) => {
  tutors.value = tutors.value.map((tutor) => (
    tutor.id === tutorId ? { ...tutor, has_favorite: hasFavorite } : tutor
  ))
}

const toggleFavorite = async (tutor) => {
  if (!userStore.isStudent || isUpdatingFavorite(tutor.id)) {
    return
  }

  favoriteError.value = ''
  updatingFavorites.value = new Set([...updatingFavorites.value, tutor.id])

  try {
    const nextState = !tutor.has_favorite
    const response = await fetch(`/api/users/${userStore.userId}/favorites`, {
      method: nextState ? 'POST' : 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        entity_type: 'tutor',
        entity_id: tutor.id
      })
    })
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to update favorite')
    }

    setTutorFavorite(tutor.id, nextState)
  } catch (err) {
    favoriteError.value = 'Favorite could not be updated. Please try again.'
  } finally {
    const nextUpdating = new Set(updatingFavorites.value)
    nextUpdating.delete(tutor.id)
    updatingFavorites.value = nextUpdating
  }
}
</script>

<template>
  <section class="tutor-list">
    <div class="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-end mb-4">
      <div>
        <p class="text-uppercase text-primary fw-bold small mb-2">Tutor Directory</p>
        <h1 class="mb-2">Find tutors by department</h1>
        <p class="lead text-body-secondary mb-0">
          Browse available teaching staff and compare their academic focus before exploring course reviews.
        </p>
      </div>
    </div>

    <div v-if="loading" class="row g-4" aria-label="Loading tutors">
      <div v-for="index in 3" :key="index" class="col-12 col-md-6 col-xl-4">
        <BaseCard>
          <div class="placeholder-glow">
            <span class="placeholder col-8 mb-3"></span>
            <span class="placeholder col-5 mb-4"></span>
            <span class="placeholder col-12"></span>
            <span class="placeholder col-10"></span>
            <span class="placeholder col-7"></span>
          </div>
        </BaseCard>
      </div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div v-else-if="!hasTutors" class="alert alert-secondary" role="status">
      No tutors are available yet.
    </div>

    <div v-else class="row g-4">
      <div v-if="favoriteError" class="col-12">
        <div class="alert alert-warning mb-0" role="alert">{{ favoriteError }}</div>
      </div>

      <div v-for="tutor in tutors" :key="tutor.id" class="col-12 col-md-6 col-xl-4">
        <BaseCard>
          <template #header>
            <div class="d-flex justify-content-between gap-3 align-items-center">
              <span class="badge rounded-pill text-bg-light border">{{ tutor.department }}</span>
              <FavoriteButton
                v-if="userStore.isStudent"
                :active="tutor.has_favorite"
                :disabled="isUpdatingFavorite(tutor.id)"
                @toggle="toggleFavorite(tutor)"
              />
            </div>
          </template>

          <h2 class="h4 mb-3">{{ tutor.name }}</h2>
          <p class="text-body-secondary mb-0">{{ tutor.bio }}</p>

          <template #footer>
            <RouterLink
              class="btn btn-outline-primary btn-sm"
              :to="{ name: 'tutor-detail', params: { id: tutor.id } }"
            >
              View profile
            </RouterLink>
          </template>
        </BaseCard>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tutor-list {
  max-width: 1180px;
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
