<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'

const tutors = ref([])
const loading = ref(true)
const error = ref('')

const hasTutors = computed(() => tutors.value.length > 0)

onMounted(async () => {
  try {
    const response = await fetch('/api/tutors')

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
      <div v-for="tutor in tutors" :key="tutor.id" class="col-12 col-md-6 col-xl-4">
        <BaseCard>
          <template #header>
            <span class="badge rounded-pill text-bg-light border">{{ tutor.department }}</span>
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
