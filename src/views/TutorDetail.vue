<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'

const route = useRoute()
const tutor = ref(null)
const loading = ref(true)
const error = ref('')
const notFound = ref(false)

onMounted(async () => {
  try {
    const response = await fetch(`/api/tutors/${route.params.id}`)

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
    <RouterLink class="btn btn-link px-0 mb-3" to="/tutors">
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

    <BaseCard v-else>
      <template #header>
        <span class="badge rounded-pill text-bg-light border">{{ tutor.department }}</span>
      </template>

      <p class="text-uppercase text-primary fw-bold small mb-2">Tutor Profile</p>
      <h1 class="mb-4">{{ tutor.name }}</h1>
      <p class="lead text-body-secondary mb-0">{{ tutor.bio }}</p>
    </BaseCard>
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
