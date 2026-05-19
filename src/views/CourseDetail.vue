<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'

const route = useRoute()
const course = ref(null)
const loading = ref(true)
const error = ref('')
const notFound = ref(false)

const tutors = computed(() => course.value?.tutors || [])
const hasTutors = computed(() => tutors.value.length > 0)

onMounted(async () => {
  try {
    const response = await fetch(`/api/courses/${route.params.id}`)

    if (response.status === 404) {
      notFound.value = true
      return
    }

    if (!response.ok) {
      throw new Error('Unable to load course')
    }

    const payload = await response.json()
    course.value = payload.data || null
  } catch (err) {
    error.value = 'Course details are unavailable right now. Please try again shortly.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="course-detail">
    <RouterLink class="btn btn-link px-0 mb-3" to="/courses">
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
          <span class="badge rounded-pill text-bg-light border">{{ course.department }}</span>
        </template>

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
