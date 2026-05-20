<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import BaseTransitionList from '../components/common/BaseTransitionList.vue'
import FavoriteButton from '../components/common/FavoriteButton.vue'
import PaginationControls from '../components/common/PaginationControls.vue'
import { COURSE_PAGE_LIMIT, COURSE_SORT_OPTIONS, useCourseStore } from '../store/courseStore'
import { useUserStore } from '../store/userStore'

const userStore = useUserStore()
const courseStore = useCourseStore()
const {
  courses,
  loading,
  error,
  staleMessage,
  favoriteError,
  searchQuery,
  departmentFilter,
  sortOrder,
  availableDepartments,
  currentPage,
  totalCourses,
  hasCourses,
  hasActiveFilters
} = storeToRefs(courseStore)
let searchTimeout = null

const scheduleFetchCourses = () => {
  window.clearTimeout(searchTimeout)
  searchTimeout = window.setTimeout(() => courseStore.loadCourses(), 300)
}

const clearFilters = () => {
  courseStore.clearFilters()
}

const setPage = (pageNumber) => {
  courseStore.setPage(pageNumber)
}

watch([searchQuery, departmentFilter, sortOrder], () => {
  courseStore.currentPage = 1
  scheduleFetchCourses()
})

watch(
  () => courseStore.getViewerScope(),
  () => {
    window.clearTimeout(searchTimeout)
    courseStore.loadCourses()
  }
)

onMounted(() => courseStore.loadCourses())

onUnmounted(() => {
  window.clearTimeout(searchTimeout)
})

const isUpdatingFavorite = (courseId) => courseStore.isUpdatingFavorite(courseId)
const hasBlockedFavorite = (courseId) => courseStore.hasBlockedFavorite(courseId)
const toggleFavorite = (course) => courseStore.toggleFavorite(course)
const retryFavorite = (courseId) => courseStore.retryFavorite(courseId)
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

    <div class="search-filter-bar border rounded-3 p-3 mb-4">
      <div class="row g-3 align-items-end">
        <div class="col-12 col-lg-4">
          <label class="form-label" for="course-search">Search courses</label>
          <input
            id="course-search"
            v-model="searchQuery"
            class="form-control"
            type="search"
            placeholder="Search by title, description, or tutor"
          >
        </div>

        <div class="col-12 col-md-6 col-lg-3">
          <label class="form-label" for="course-department-filter">Department</label>
          <select id="course-department-filter" v-model="departmentFilter" class="form-select">
            <option value="">All departments</option>
            <option
              v-for="department in availableDepartments"
              :key="department"
              :value="department"
            >
              {{ department }}
            </option>
          </select>
        </div>

        <div class="col-12 col-md-6 col-lg-3">
          <label class="form-label" for="course-sort">Sort by</label>
          <select id="course-sort" v-model="sortOrder" class="form-select">
            <option
              v-for="option in COURSE_SORT_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="col-12 col-md-6 col-lg-2">
          <button
            class="btn btn-directory-action-secondary w-100"
            type="button"
            :disabled="!hasActiveFilters"
            @click="clearFilters"
          >
            Clear
          </button>
        </div>
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
      {{ hasActiveFilters ? 'No courses match your search.' : 'No courses are available yet.' }}
    </div>

    <BaseTransitionList v-else list-class="row g-4">
      <div v-if="staleMessage" key="stale-message" class="col-12">
        <div class="alert alert-info mb-0" role="status">{{ staleMessage }}</div>
      </div>

      <div v-if="favoriteError" key="favorite-error" class="col-12">
        <div class="alert alert-warning mb-0" role="alert">{{ favoriteError }}</div>
      </div>

      <div v-for="course in courses" :key="course.id" class="col-12 col-md-6 col-xl-4">
        <BaseCard>
          <template #header>
            <div class="d-flex justify-content-between gap-3 align-items-center">
              <span class="badge rounded-pill text-bg-light border">{{ course.department }}</span>
              <FavoriteButton
                v-if="userStore.isStudent"
                :active="course.has_favorite"
                :loading="isUpdatingFavorite(course.id)"
                :blocked="hasBlockedFavorite(course.id)"
                @toggle="toggleFavorite(course)"
                @retry="retryFavorite(course.id)"
              />
            </div>
          </template>

          <h2 class="h4 mb-3">{{ course.title }}</h2>
          <p class="text-body-secondary mb-4">{{ course.description }}</p>

          <template #footer>
            <p class="small text-uppercase fw-bold text-body-secondary mb-1">Tutors</p>
            <p class="mb-0">{{ course.tutor_names || 'Tutors to be announced' }}</p>
            <RouterLink
              class="btn btn-directory-action btn-sm mt-3"
              :to="{ name: 'course-detail', params: { id: course.id } }"
            >
              View course
            </RouterLink>
          </template>
        </BaseCard>
      </div>
    </BaseTransitionList>

    <PaginationControls
      v-if="!loading && !error && hasCourses"
      :page="currentPage"
      :limit="COURSE_PAGE_LIMIT"
      :total="totalCourses"
      @update:page="setPage"
    />
  </section>
</template>

<style scoped>
.course-list {
  max-width: 1180px;
  margin: 0 auto;
}

.search-filter-bar {
  background-color: var(--bs-body-bg);
}

.text-bg-light {
  color: var(--bs-body-color) !important;
  background-color: rgba(var(--swinburne-punch-rgb), 0.08) !important;
}

[data-bs-theme="dark"] .text-bg-light {
  background-color: rgba(var(--swinburne-punch-rgb), 0.18) !important;
}
</style>
