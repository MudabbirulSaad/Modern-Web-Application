<script setup>
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import BaseTransitionList from '../components/common/BaseTransitionList.vue'
import { useDepartmentsDiscovery } from '../departments/useDepartmentsDiscovery.js'

const discovery = useDepartmentsDiscovery()

const loading = discovery.loading
const error = discovery.error
const searchQuery = discovery.searchQuery
const departments = discovery.filteredDepartments
const hasDepartments = discovery.hasVisibleDepartments
const emptyStateMessage = discovery.emptyStateMessage

onMounted(discovery.fetchDepartments)
</script>

<template>
  <section class="departments-page">
    <div class="departments-page__header mb-4">
      <p class="text-uppercase text-primary fw-bold small mb-2">Departments</p>
      <h1 class="mb-2">Browse departments</h1>
      <p class="lead text-body-secondary mb-0">
        Start with a department, then continue into matching courses or tutor profiles.
      </p>
    </div>

    <div class="search-filter-bar border rounded-3 p-3 mb-4">
      <label class="form-label" for="department-search">Search departments</label>
      <input
        id="department-search"
        v-model="searchQuery"
        class="form-control"
        type="search"
        placeholder="Search by department name"
      >
    </div>

    <div v-if="loading" class="row g-4" aria-label="Loading departments">
      <div v-for="index in 3" :key="index" class="col-12 col-md-6 col-xl-4">
        <BaseCard>
          <div class="placeholder-glow">
            <span class="placeholder col-8 mb-3"></span>
            <span class="placeholder col-5 mb-4"></span>
            <span class="placeholder col-12"></span>
          </div>
        </BaseCard>
      </div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div v-else-if="!hasDepartments" class="alert alert-secondary" role="status">
      {{ emptyStateMessage }}
    </div>

    <BaseTransitionList v-else list-class="row g-4">
      <div
        v-for="department in departments"
        :key="department.name"
        class="col-12 col-md-6 col-xl-4"
      >
        <BaseCard>
          <template #header>
            <span class="badge rounded-pill text-bg-light border">Department</span>
          </template>

          <h2 class="h4 mb-3">{{ department.name }}</h2>
          <dl class="departments-page__stats mb-4">
            <div>
              <dt>Courses</dt>
              <dd>{{ department.courseCount }}</dd>
            </div>
            <div>
              <dt>Tutors</dt>
              <dd>{{ department.tutorCount }}</dd>
            </div>
          </dl>

          <template #footer>
            <div class="d-flex flex-wrap gap-2">
              <RouterLink
                class="btn btn-directory-action btn-sm"
                :to="department.courseDirectoryUrl"
              >
                View courses
              </RouterLink>
              <RouterLink
                class="btn btn-directory-action-secondary btn-sm"
                :to="department.tutorDirectoryUrl"
              >
                View tutors
              </RouterLink>
            </div>
          </template>
        </BaseCard>
      </div>
    </BaseTransitionList>
  </section>
</template>

<style scoped>
.departments-page {
  max-width: 1180px;
  margin: 0 auto;
}

.departments-page__header {
  max-width: 760px;
}

.search-filter-bar {
  max-width: 640px;
  background-color: var(--bs-body-bg);
}

.departments-page__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.departments-page__stats div {
  padding: 1rem;
  border: 1px solid var(--bs-border-color);
  border-radius: 0.5rem;
  background-color: rgba(var(--swinburne-punch-rgb), 0.05);
}

.departments-page__stats dt {
  color: var(--bs-secondary-color);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.departments-page__stats dd {
  margin: 0.2rem 0 0;
  color: var(--bs-body-color);
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
}

.text-bg-light {
  color: var(--bs-body-color) !important;
  background-color: rgba(var(--swinburne-punch-rgb), 0.08) !important;
}

[data-bs-theme="dark"] .text-bg-light {
  background-color: rgba(var(--swinburne-punch-rgb), 0.18) !important;
}

[data-bs-theme="dark"] .departments-page__stats div {
  background-color: rgba(var(--swinburne-punch-rgb), 0.12);
}
</style>
