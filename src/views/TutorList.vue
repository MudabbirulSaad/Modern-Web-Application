<script setup>
import { onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import BaseTransitionList from '../components/common/BaseTransitionList.vue'
import FavoriteButton from '../components/common/FavoriteButton.vue'
import PaginationControls from '../components/common/PaginationControls.vue'
import { DEFAULT_DIRECTORY_SORT_OPTIONS, useDirectoryBrowsing } from '../directory/useDirectoryBrowsing.js'
import { useFavoriteWorkflow } from '../favorites/useFavoriteWorkflow.js'
import { useUserStore } from '../store/userStore'

const PAGE_LIMIT = 6
const SORT_OPTIONS = DEFAULT_DIRECTORY_SORT_OPTIONS
const userStore = useUserStore()
const route = useRoute()

const directory = useDirectoryBrowsing({
  endpoint: '/api/tutors',
  pageLimit: PAGE_LIMIT,
  errorMessage: 'Tutors are unavailable right now. Please try again shortly.',
  initialDepartment: route.query.department
})

const tutors = directory.items
const loading = directory.loading
const error = directory.error
const searchQuery = directory.searchQuery
const departmentFilter = directory.departmentFilter
const sortOrder = directory.sortOrder
const availableDepartments = directory.availableDepartments
const currentPage = directory.currentPage
const totalTutors = directory.totalItems
const hasTutors = directory.hasItems
const hasActiveFilters = directory.hasActiveFilters
const clearFilters = directory.clearFilters
const setPage = directory.setPage

onMounted(directory.fetchItems)
onUnmounted(directory.dispose)

const favoriteWorkflow = useFavoriteWorkflow({
  entityType: 'tutor',
  userStore,
  applyFavoriteState: directory.applyFavoriteState
})
const favoriteError = favoriteWorkflow.favoriteError
const isUpdatingFavorite = favoriteWorkflow.isUpdatingFavorite
const toggleFavorite = favoriteWorkflow.toggleFavorite
</script>

<template>
  <section class="tutor-list">
    <div class="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-end mb-4">
      <div>
        <p class="text-uppercase text-primary fw-bold small mb-2">Tutor Directory</p>
        <h1 class="mb-2">Find tutors by academic unit</h1>
        <p class="lead text-body-secondary mb-0">
          Browse available teaching staff and compare their academic focus before exploring course reviews.
        </p>
      </div>
    </div>

    <div class="search-filter-bar border rounded-3 p-3 mb-4">
      <div class="row g-3 align-items-end">
        <div class="col-12 col-lg-4">
          <label class="form-label" for="tutor-search">Search tutors</label>
          <input
            id="tutor-search"
            v-model="searchQuery"
            class="form-control"
            type="search"
            placeholder="Search by name or bio"
          >
        </div>

        <div class="col-12 col-md-6 col-lg-3">
          <label class="form-label" for="tutor-department-filter">Staff affiliation</label>
          <select id="tutor-department-filter" v-model="departmentFilter" class="form-select">
            <option value="">All staff affiliations</option>
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
          <label class="form-label" for="tutor-sort">Sort by</label>
          <select id="tutor-sort" v-model="sortOrder" class="form-select">
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
      {{ hasActiveFilters ? 'No tutors match your search.' : 'No tutors are available yet.' }}
    </div>

    <BaseTransitionList v-else list-class="row g-4">
      <div v-if="favoriteError" key="favorite-error" class="col-12">
        <div class="alert alert-warning mb-0" role="alert">{{ favoriteError }}</div>
      </div>

      <div v-for="tutor in tutors" :key="tutor.id" class="col-12 col-md-6 col-xl-4">
        <BaseCard>
          <template #header>
            <div class="d-flex justify-content-between gap-3 align-items-center">
              <span class="badge rounded-pill text-bg-light border">Staff affiliation: {{ tutor.department }}</span>
              <FavoriteButton
                v-if="userStore.isStudent"
                :active="tutor.has_favorite"
                :loading="isUpdatingFavorite(tutor.id)"
                @toggle="toggleFavorite(tutor)"
              />
            </div>
          </template>

          <h2 class="h4 mb-3">{{ tutor.name }}</h2>
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
    </BaseTransitionList>

    <PaginationControls
      v-if="!loading && !error && hasTutors"
      :page="currentPage"
      :limit="PAGE_LIMIT"
      :total="totalTutors"
      @update:page="setPage"
    />
  </section>
</template>

<style scoped>
.tutor-list {
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
