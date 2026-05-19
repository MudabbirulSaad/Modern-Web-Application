<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'

const courses = ref([])
const loading = ref(true)
const error = ref('')

const hasCourses = computed(() => courses.value.length > 0)

onMounted(async () => {
  try {
    const response = await fetch('/api/courses')

    if (!response.ok) {
      throw new Error('Unable to load courses')
    }

    const payload = await response.json()
    courses.value = payload.data || []
  } catch (err) {
    error.value = 'Courses are unavailable right now. Please try again shortly.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="course-list">
    <div class="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-end mb-4">
      <div>
        <p class="text-uppercase text-primary fw-bold small mb-2">Course Directory</p>
        <h1 class="mb-2">Browse available courses</h1>
        <p class="lead text-body-secondary mb-0">
          Explore subjects by department and see which tutors are linked to each course.
        </p>
      </div>
    </div>

    <div v-if="loading" class="row g-4" aria-label="Loading courses">
      <div v-for="index in 3" :key="index" class="col-12 col-md-6 col-xl-4">
        <BaseCard>
          <div class="placeholder-glow">
            <span class="placeholder col-9 mb-3"></span>
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

    <div v-else-if="!hasCourses" class="alert alert-secondary" role="status">
      No courses are available yet.
    </div>

    <div v-else class="row g-4">
      <div v-for="course in courses" :key="course.id" class="col-12 col-md-6 col-xl-4">
        <BaseCard>
          <template #header>
            <span class="badge rounded-pill text-bg-light border">{{ course.department }}</span>
          </template>

          <h2 class="h4 mb-3">{{ course.title }}</h2>
          <p class="text-body-secondary mb-4">{{ course.description }}</p>

          <template #footer>
            <p class="small text-uppercase fw-bold text-body-secondary mb-1">Tutors</p>
            <p class="mb-0">{{ course.tutor_names || 'Tutors to be announced' }}</p>
            <RouterLink
              class="btn btn-outline-primary btn-sm mt-3"
              :to="{ name: 'course-detail', params: { id: course.id } }"
            >
              View course
            </RouterLink>
          </template>
        </BaseCard>
      </div>
    </div>
  </section>
</template>

<style scoped>
.course-list {
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
