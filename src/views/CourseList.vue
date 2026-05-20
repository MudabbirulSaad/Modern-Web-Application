<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import BaseTransitionList from '../components/common/BaseTransitionList.vue'
import FavoriteButton from '../components/common/FavoriteButton.vue'
import PaginationControls from '../components/common/PaginationControls.vue'
import { useUserStore } from '../store/userStore'

const PAGE_LIMIT = 6
const SORT_OPTIONS = [
  { value: 'best-match', label: 'Best Match' },
  { value: 'recently-active', label: 'Recently Active' },
  { value: 'alphabetical', label: 'Alphabetical' }
]
const userStore = useUserStore()
const courses = ref([])
const loading = ref(true)
const error = ref('')
const favoriteError = ref('')
const updatingFavorites = ref(new Set())
const searchQuery = ref('')
const departmentFilter = ref('')
const sortOrder = ref('best-match')
const availableDepartments = ref([])
const currentPage = ref(1)
const totalCourses = ref(0)
let searchTimeout = null

const hasCourses = computed(() => courses.value.length > 0)
const hasActiveFilters = computed(() => Boolean(searchQuery.value.trim() || departmentFilter.value))

const updateDepartments = (items) => {
  const nextDepartments = new Set(availableDepartments.value)
  items.forEach((course) => {
    if (course.department) {
      nextDepartments.add(course.department)
    }
  })
  availableDepartments.value = [...nextDepartments].sort((a, b) => a.localeCompare(b))
}

const fetchCourses = async () => {
  const params = new URLSearchParams()
  const search = searchQuery.value.trim()

  if (search) {
    params.set('search', search)
  }

  if (departmentFilter.value) {
    params.set('department', departmentFilter.value)
  }

  params.set('page', String(currentPage.value))
  params.set('limit', String(PAGE_LIMIT))
  params.set('sort', sortOrder.value)

  loading.value = true
  error.value = ''

  try {
    const queryString = params.toString()
    const response = await fetch(`/api/courses${queryString ? `?${queryString}` : ''}`, {
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error('Unable to load courses')
    }

    const payload = await response.json()
    courses.value = payload.data || []
    totalCourses.value = Number(payload.total || 0)
    updateDepartments(courses.value)
  } catch (err) {
    error.value = 'Courses are unavailable right now. Please try again shortly.'
  } finally {
    loading.value = false
  }
}

const scheduleFetchCourses = () => {
  window.clearTimeout(searchTimeout)
  searchTimeout = window.setTimeout(fetchCourses, 300)
}

const clearFilters = () => {
  searchQuery.value = ''
  departmentFilter.value = ''
}

const setPage = (pageNumber) => {
  currentPage.value = pageNumber
  fetchCourses()
}

watch([searchQuery, departmentFilter, sortOrder], () => {
  currentPage.value = 1
  scheduleFetchCourses()
})

onMounted(fetchCourses)

onUnmounted(() => {
  window.clearTimeout(searchTimeout)
})

const isUpdatingFavorite = (courseId) => updatingFavorites.value.has(courseId)

const setCourseFavorite = (courseId, hasFavorite) => {
  courses.value = courses.value.map((course) => (
    course.id === courseId ? { ...course, has_favorite: hasFavorite } : course
  ))
}

const toggleFavorite = async (course) => {
  if (!userStore.isStudent || isUpdatingFavorite(course.id)) {
    return
  }

  favoriteError.value = ''
  updatingFavorites.value = new Set([...updatingFavorites.value, course.id])

  try {
    const nextState = !course.has_favorite
    const response = await fetch(`/api/users/${userStore.userId}/favorites`, {
      method: nextState ? 'POST' : 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        entity_type: 'course',
        entity_id: course.id
      })
    })
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to update favorite')
    }

    setCourseFavorite(course.id, nextState)
  } catch (err) {
    favoriteError.value = 'Favorite could not be updated. Please try again.'
  } finally {
    const nextUpdating = new Set(updatingFavorites.value)
    nextUpdating.delete(course.id)
    updatingFavorites.value = nextUpdating
  }
}
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
              v-for="option in SORT_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="col-12 col-md-6 col-lg-2">
          <button
            class="btn btn-outline-secondary w-100"
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
                :disabled="isUpdatingFavorite(course.id)"
                @toggle="toggleFavorite(course)"
              />
            </div>
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
    </BaseTransitionList>

    <PaginationControls
      v-if="!loading && !error && hasCourses"
      :page="currentPage"
      :limit="PAGE_LIMIT"
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
