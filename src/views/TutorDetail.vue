<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import FavoriteButton from '../components/common/FavoriteButton.vue'
import ReviewSection from '../components/ReviewSection.vue'
import { useFavoriteWorkflow } from '../favorites/useFavoriteWorkflow.js'
import { useUserStore } from '../store/userStore'

const route = useRoute()
const userStore = useUserStore()
const tutor = ref(null)
const loading = ref(true)
const error = ref('')
const notFound = ref(false)
const favoriteWorkflow = useFavoriteWorkflow({
  entityType: 'tutor',
  userStore,
  applyFavoriteState: (tutorId, hasFavorite) => {
    if (tutor.value?.id === tutorId) {
      tutor.value = { ...tutor.value, has_favorite: hasFavorite }
    }
  }
})
const favoriteError = favoriteWorkflow.favoriteError
const favoriteLoading = computed(() => tutor.value ? favoriteWorkflow.isUpdatingFavorite(tutor.value.id) : false)
const toggleFavorite = () => favoriteWorkflow.toggleFavorite(tutor.value)

onMounted(async () => {
  try {
    const response = await fetch(`/api/tutors/${route.params.id}`, {
      credentials: 'include'
    })

    if (response.status === 404) {
      notFound.value = true
      return
    }

    if (!response.ok) {
      throw new Error('Unable to load tutor')
    }

    const payload = await response.json()
    tutor.value = payload.data || null
  } catch (err) {
    error.value = 'Tutor details are unavailable right now. Please try again shortly.'
  } finally {
    loading.value = false
  }
})

</script>

<template>
  <section class="tutor-detail">
    <RouterLink class="btn btn-directory-action-secondary btn-sm mb-3" to="/tutors">
      Back to tutors
    </RouterLink>

    <BaseCard v-if="loading" aria-label="Loading tutor profile">
      <div class="placeholder-glow">
        <span class="placeholder col-5 mb-3"></span>
        <span class="placeholder col-8 mb-4"></span>
        <span class="placeholder col-12"></span>
        <span class="placeholder col-11"></span>
        <span class="placeholder col-9"></span>
      </div>
    </BaseCard>

    <div v-else-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div v-else-if="notFound || !tutor" class="alert alert-secondary" role="status">
      Tutor profile not found.
    </div>

    <div v-else class="vstack gap-4">
      <BaseCard>
        <template #header>
          <div class="d-flex justify-content-between gap-3 align-items-center">
            <span class="badge rounded-pill text-bg-light border">Academic Unit: {{ tutor.department }}</span>
            <FavoriteButton
              v-if="userStore.isStudent"
              :active="tutor.has_favorite"
              :loading="favoriteLoading"
              @toggle="toggleFavorite"
            />
          </div>
        </template>

        <div v-if="favoriteError" class="alert alert-warning" role="alert">{{ favoriteError }}</div>
        <p class="text-uppercase text-primary fw-bold small mb-2">Tutor Profile</p>
        <h1 class="mb-4">{{ tutor.name }}</h1>
        <p class="lead text-body-secondary mb-0">{{ tutor.bio }}</p>
      </BaseCard>

      <ReviewSection entity-type="tutor" :entity-id="tutor.id" />
    </div>
  </section>
</template>

<style scoped>
.tutor-detail {
  max-width: 880px;
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
