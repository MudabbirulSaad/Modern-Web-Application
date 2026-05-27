<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAdminManagement } from '../admin/useAdminManagement.js'
import {
  filterAdminCourseRecords,
  filterAdminTutorRecords,
  filterAdminUserRecords,
  summarizeVisibleAdminRecords
} from '../admin/adminRecordFiltering.js'
import BaseCard from '../components/common/BaseCard.vue'
import { createTutorAssignmentState } from './adminTutorAssignment.js'

const activeAdminTab = ref('courses')
const tutorSearch = ref('')
const courseRecordSearch = ref('')
const tutorRecordSearch = ref('')
const userRecordSearch = ref('')
const TUTOR_SEARCH_RESULT_LIMIT = 8

const {
  tutors,
  courses,
  users,
  loadingTutors,
  loadingCourses,
  loadingUsers,
  tutorForm,
  courseForm,
  tutorSaving,
  courseSaving,
  deletingTutorId,
  deletingCourseId,
  tutorFormError,
  courseFormError,
  userLoadError,
  error,
  success,
  editingTutorId,
  editingCourseId,
  editTutor: startTutorEdit,
  editCourse: startCourseEdit,
  resetTutorForm,
  resetCourseForm: resetManagementCourseForm,
  saveTutor,
  saveCourse: saveManagementCourse,
  deleteTutor,
  deleteCourse,
  loadTutors,
  loadCourses,
  loadUsers
} = useAdminManagement({})

const isEditingTutor = computed(() => editingTutorId.value !== null)
const isEditingCourse = computed(() => editingCourseId.value !== null)
const hasTutors = computed(() => tutors.value.length > 0)
const hasCourses = computed(() => courses.value.length > 0)
const hasUsers = computed(() => users.value.length > 0)
const tutorSearchTerm = computed(() => tutorSearch.value.trim())
const hasTutorSearch = computed(() => tutorSearchTerm.value.length > 0)
const courseRecordSearchTerm = computed(() => courseRecordSearch.value.trim())
const tutorRecordSearchTerm = computed(() => tutorRecordSearch.value.trim())
const userRecordSearchTerm = computed(() => userRecordSearch.value.trim())
const filteredCourses = computed(() => filterAdminCourseRecords(courses.value, courseRecordSearchTerm.value))
const filteredTutors = computed(() => filterAdminTutorRecords(tutors.value, tutorRecordSearchTerm.value))
const filteredUsers = computed(() => filterAdminUserRecords(users.value, userRecordSearchTerm.value))
const courseRecordSummary = computed(() => summarizeVisibleAdminRecords(filteredCourses.value, courses.value))
const tutorRecordSummary = computed(() => summarizeVisibleAdminRecords(filteredTutors.value, tutors.value))
const userRecordSummary = computed(() => summarizeVisibleAdminRecords(filteredUsers.value, users.value))
const courseTutorNames = (course) => String(course.tutor_names || '').trim()
const courseTutorCount = (course) => {
  const names = courseTutorNames(course)

  if (!names) {
    return 0
  }

  return names.split(',').map((name) => name.trim()).filter(Boolean).length
}
const courseTutorAssignment = computed(() => createTutorAssignmentState({
  tutors: tutors.value,
  selectedTutorIds: courseForm.tutorIds,
  searchTerm: tutorSearch.value,
  limit: TUTOR_SEARCH_RESULT_LIMIT
}))
const selectedCourseTutors = computed(() => courseTutorAssignment.value.visibleSelectedTutors)
const availableCourseTutors = computed(() => courseTutorAssignment.value.searchResults)
const tutorSearchResultCount = computed(() => courseTutorAssignment.value.searchResultCount)
const hiddenTutorResultCount = computed(() => (
  Math.max(tutorSearchResultCount.value - availableCourseTutors.value.length, 0)
))

const resetCourseForm = () => {
  resetManagementCourseForm()
  tutorSearch.value = ''
}

const saveCourse = async () => {
  const saved = await saveManagementCourse()

  if (saved) {
    tutorSearch.value = ''
  }
}

const editTutor = (tutor) => {
  activeAdminTab.value = 'tutors'
  startTutorEdit(tutor)
}

const editCourse = async (course) => {
  activeAdminTab.value = 'courses'
  tutorSearch.value = ''
  await startCourseEdit(course)
}

const addCourseTutor = (tutor) => {
  courseForm.tutorIds = courseTutorAssignment.value.add(tutor.id)
}

const removeCourseTutor = (tutor) => {
  courseForm.tutorIds = courseTutorAssignment.value.remove(tutor.id)
}

onMounted(() => {
  loadTutors()
  loadCourses()
  loadUsers()
})
</script>

<template>
  <section class="admin-dashboard">
    <div class="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-end mb-4">
      <div>
        <p class="text-uppercase text-primary fw-bold small mb-2">Admin Dashboard</p>
        <h1 class="mb-2">Manage tutors and courses</h1>
        <p class="lead text-body-secondary mb-0">
          Create directory records, keep department details current, and assign tutors to courses.
        </p>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div v-if="success" class="alert alert-success" role="status">
      {{ success }}
    </div>

    <div class="admin-tabs mb-4" role="tablist" aria-label="Admin management sections">
      <button
        class="admin-tab"
        :class="{ active: activeAdminTab === 'courses' }"
        type="button"
        role="tab"
        :aria-selected="activeAdminTab === 'courses'"
        aria-controls="course-admin-panel"
        @click="activeAdminTab = 'courses'"
      >
        Courses
      </button>
      <button
        class="admin-tab"
        :class="{ active: activeAdminTab === 'tutors' }"
        type="button"
        role="tab"
        :aria-selected="activeAdminTab === 'tutors'"
        aria-controls="tutor-admin-panel"
        @click="activeAdminTab = 'tutors'"
      >
        Tutors
      </button>
      <button
        class="admin-tab"
        :class="{ active: activeAdminTab === 'users' }"
        type="button"
        role="tab"
        :aria-selected="activeAdminTab === 'users'"
        aria-controls="user-admin-panel"
        @click="activeAdminTab = 'users'"
      >
        Users
      </button>
    </div>

    <div class="vstack gap-4">
      <section
        v-show="activeAdminTab === 'courses'"
        id="course-admin-panel"
        aria-labelledby="course-admin-heading"
        role="tabpanel"
      >
        <h2 id="course-admin-heading" class="h3 mb-3">Course management</h2>
        <div class="row g-4">
          <div class="col-12 col-lg-5">
            <BaseCard class="admin-form-card" :stretch="false" :interactive="false">
              <template #header>
                <h3 class="h4 mb-0">{{ isEditingCourse ? 'Edit course' : 'New course' }}</h3>
              </template>

              <form @submit.prevent="saveCourse">
                <div v-if="courseFormError" class="alert alert-danger" role="alert">
                  {{ courseFormError }}
                </div>

                <div class="mb-3">
                  <label class="form-label" for="course-title">Title</label>
                  <input
                    id="course-title"
                    v-model="courseForm.title"
                    class="form-control"
                    type="text"
                    required
                  >
                </div>

                <div class="mb-3">
                  <label class="form-label" for="course-department">Department</label>
                  <input
                    id="course-department"
                    v-model="courseForm.department"
                    class="form-control"
                    type="text"
                    required
                  >
                </div>

                <div class="mb-3">
                  <label class="form-label" for="course-description">Description</label>
                  <textarea
                    id="course-description"
                    v-model="courseForm.description"
                    class="form-control"
                    rows="4"
                    required
                  ></textarea>
                </div>

                <fieldset class="mb-4">
                  <legend class="form-label">Assigned tutors</legend>

                  <div v-if="selectedCourseTutors.length > 0" class="selected-tutor-list mb-3" aria-label="Selected tutors">
                    <span
                      v-for="tutor in selectedCourseTutors"
                      :key="tutor.id"
                      class="selected-tutor-chip"
                    >
                      <span>
                        <strong>{{ tutor.name }}</strong>
                        <span class="text-body-secondary"> {{ tutor.department }}</span>
                      </span>
                      <button
                        class="selected-tutor-remove"
                        type="button"
                        :aria-label="`Remove ${tutor.name}`"
                        @click="removeCourseTutor(tutor)"
                      >
                        &times;
                      </button>
                    </span>
                  </div>
                  <div v-else class="assignment-empty mb-3" role="status">
                    No tutors selected.
                  </div>

                  <div v-if="loadingTutors" class="placeholder-glow" aria-label="Loading tutor assignment options">
                    <span class="placeholder col-12 mb-2"></span>
                    <span class="placeholder col-10"></span>
                  </div>
                  <div v-else-if="!hasTutors" class="alert alert-secondary mb-0" role="status">
                    Create tutors before assigning them to courses.
                  </div>
                  <div v-else class="course-tutor-assignment">
                    <label class="form-label small text-body-secondary" for="course-tutor-search">
                      Search by tutor name or staff affiliation
                    </label>
                    <input
                      id="course-tutor-search"
                      v-model="tutorSearch"
                      class="form-control"
                      type="search"
                      autocomplete="off"
                      placeholder="Start typing to find tutors"
                    >

                    <div v-if="!hasTutorSearch" class="assignment-empty mt-3" role="status">
                      Search available tutors to add them to this course.
                    </div>
                    <div v-else-if="availableCourseTutors.length === 0" class="assignment-empty mt-3" role="status">
                      No available tutors match "{{ tutorSearchTerm }}".
                    </div>
                    <div v-else class="tutor-search-results mt-3">
                      <div
                        v-for="tutor in availableCourseTutors"
                        :key="tutor.id"
                        class="tutor-search-result"
                      >
                        <div class="min-w-0">
                          <p class="fw-bold mb-1 text-truncate">{{ tutor.name }}</p>
                          <p class="small text-body-secondary mb-0 text-truncate">{{ tutor.department }}</p>
                        </div>
                        <button
                          class="btn btn-directory-action-secondary btn-sm"
                          type="button"
                          @click="addCourseTutor(tutor)"
                        >
                          Add
                        </button>
                      </div>
                      <p v-if="hiddenTutorResultCount > 0" class="small text-body-secondary mb-0 mt-2">
                        Showing {{ availableCourseTutors.length }} of {{ tutorSearchResultCount }} matches. Refine the search to narrow the list.
                      </p>
                    </div>
                    <p v-if="selectedCourseTutors.length > 0" class="small text-body-secondary mb-0 mt-2">
                      {{ selectedCourseTutors.length }} tutor{{ selectedCourseTutors.length === 1 ? '' : 's' }} selected.
                    </p>
                    <input
                      v-for="tutorId in courseForm.tutorIds"
                      :key="`selected-course-tutor-${tutorId}`"
                      type="hidden"
                      name="tutorIds"
                      :value="tutorId"
                    >
                  </div>
                </fieldset>

                <div class="d-flex flex-column flex-sm-row gap-2">
                  <button class="btn btn-directory-action" type="submit" :disabled="courseSaving">
                    <span v-if="courseSaving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                    {{ courseSaving ? 'Saving' : isEditingCourse ? 'Update course' : 'Create course' }}
                  </button>
                  <button
                    v-if="isEditingCourse"
                    class="btn btn-directory-action-secondary"
                    type="button"
                    :disabled="courseSaving"
                    @click="resetCourseForm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </BaseCard>
          </div>

          <div class="col-12 col-lg-7">
            <BaseCard :stretch="false" :interactive="false">
              <template #header>
                <h3 class="h4 mb-0">Course records</h3>
              </template>

              <div class="admin-record-toolbar">
                <div class="min-w-0 flex-grow-1">
                  <label class="form-label small text-body-secondary" for="course-record-search">
                    Search Course records
                  </label>
                  <input
                    id="course-record-search"
                    v-model="courseRecordSearch"
                    class="form-control"
                    type="search"
                    autocomplete="off"
                    placeholder="Search by title or department"
                  >
                </div>
                <span class="badge text-bg-light admin-record-count">{{ courseRecordSummary }}</span>
              </div>

              <div v-if="loadingCourses" class="placeholder-glow" aria-label="Loading courses">
                <span class="placeholder col-8 mb-3"></span>
                <span class="placeholder col-12"></span>
                <span class="placeholder col-11"></span>
                <span class="placeholder col-9"></span>
              </div>

              <div v-else-if="!hasCourses" class="alert alert-secondary mb-0" role="status">
                No courses are available yet.
              </div>

              <div v-else-if="filteredCourses.length === 0" class="alert alert-secondary mb-0" role="status">
                No Course records match "{{ courseRecordSearchTerm }}".
              </div>

              <div v-else class="admin-record-list" aria-label="Course records">
                <article
                  v-for="course in filteredCourses"
                  :key="course.id"
                  class="admin-management-row"
                >
                  <div class="admin-management-row__body">
                    <div class="admin-management-row__heading">
                      <h4 class="h6 mb-0 text-truncate">{{ course.title }}</h4>
                      <p class="small text-body-secondary mb-0 text-truncate">
                        {{ course.department }} · {{ courseTutorCount(course) }} tutor{{ courseTutorCount(course) === 1 ? '' : 's' }}
                      </p>
                    </div>
                    <p class="small text-body-secondary mb-0 record-summary admin-line-clamp">{{ course.description }}</p>
                    <p class="small mb-0 text-body-secondary admin-line-clamp">
                      <strong class="text-body">Tutors:</strong> {{ courseTutorNames(course) || 'Unassigned' }}
                    </p>
                  </div>
                  <div class="admin-management-row__actions" aria-label="Course record actions">
                    <button class="btn btn-directory-action-secondary btn-sm" type="button" @click="editCourse(course)">
                      Edit
                    </button>
                    <button
                      class="btn btn-directory-action-danger btn-sm"
                      type="button"
                      :disabled="deletingCourseId === course.id"
                      @click="deleteCourse(course)"
                    >
                      <span
                        v-if="deletingCourseId === course.id"
                        class="spinner-border spinner-border-sm me-2"
                        aria-hidden="true"
                      ></span>
                      {{ deletingCourseId === course.id ? 'Deleting' : 'Delete' }}
                    </button>
                  </div>
                </article>
              </div>
            </BaseCard>
          </div>
        </div>
      </section>

      <section
        v-show="activeAdminTab === 'tutors'"
        id="tutor-admin-panel"
        aria-labelledby="tutor-admin-heading"
        role="tabpanel"
      >
        <h2 id="tutor-admin-heading" class="h3 mb-3">Tutor management</h2>
        <div class="row g-4">
          <div class="col-12 col-lg-5">
            <BaseCard class="admin-form-card" :stretch="false" :interactive="false">
              <template #header>
                <h3 class="h4 mb-0">{{ isEditingTutor ? 'Edit tutor' : 'New tutor' }}</h3>
              </template>

              <form @submit.prevent="saveTutor">
                <div v-if="tutorFormError" class="alert alert-danger" role="alert">
                  {{ tutorFormError }}
                </div>

                <div class="mb-3">
                  <label class="form-label" for="tutor-name">Name</label>
                  <input
                    id="tutor-name"
                    v-model="tutorForm.name"
                    class="form-control"
                    type="text"
                    required
                  >
                </div>

                <div class="mb-3">
                  <label class="form-label" for="tutor-department">Staff affiliation or academic unit</label>
                  <input
                    id="tutor-department"
                    v-model="tutorForm.department"
                    class="form-control"
                    type="text"
                    required
                  >
                  <p class="form-text mb-0">
                    This is shown on tutor profiles and is separate from Course Department discovery.
                  </p>
                </div>

                <div class="mb-4">
                  <label class="form-label" for="tutor-bio">Bio</label>
                  <textarea
                    id="tutor-bio"
                    v-model="tutorForm.bio"
                    class="form-control"
                    rows="5"
                    required
                  ></textarea>
                </div>

                <div class="d-flex flex-column flex-sm-row gap-2">
                  <button class="btn btn-directory-action" type="submit" :disabled="tutorSaving">
                    <span v-if="tutorSaving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                    {{ tutorSaving ? 'Saving' : isEditingTutor ? 'Update tutor' : 'Create tutor' }}
                  </button>
                  <button
                    v-if="isEditingTutor"
                    class="btn btn-directory-action-secondary"
                    type="button"
                    :disabled="tutorSaving"
                    @click="resetTutorForm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </BaseCard>
          </div>

          <div class="col-12 col-lg-7">
            <BaseCard :stretch="false" :interactive="false">
              <template #header>
                <h3 class="h4 mb-0">Tutor records</h3>
              </template>

              <div class="admin-record-toolbar">
                <div class="min-w-0 flex-grow-1">
                  <label class="form-label small text-body-secondary" for="tutor-record-search">
                    Search Tutor records
                  </label>
                  <input
                    id="tutor-record-search"
                    v-model="tutorRecordSearch"
                    class="form-control"
                    type="search"
                    autocomplete="off"
                    placeholder="Search by name or staff affiliation"
                  >
                </div>
                <span class="badge text-bg-light admin-record-count">{{ tutorRecordSummary }}</span>
              </div>

              <div v-if="loadingTutors" class="placeholder-glow" aria-label="Loading tutors">
                <span class="placeholder col-8 mb-3"></span>
                <span class="placeholder col-12"></span>
                <span class="placeholder col-11"></span>
                <span class="placeholder col-9"></span>
              </div>

              <div v-else-if="!hasTutors" class="alert alert-secondary mb-0" role="status">
                No tutors are available yet.
              </div>

              <div v-else-if="filteredTutors.length === 0" class="alert alert-secondary mb-0" role="status">
                No Tutor records match "{{ tutorRecordSearchTerm }}".
              </div>

              <div v-else class="admin-record-list" aria-label="Tutor records">
                <article
                  v-for="tutor in filteredTutors"
                  :key="tutor.id"
                  class="admin-management-row"
                >
                  <div class="admin-management-row__body">
                    <div class="admin-management-row__heading">
                      <h4 class="h6 mb-0 text-truncate">{{ tutor.name }}</h4>
                      <p class="small text-body-secondary mb-0 text-truncate">
                        Staff affiliation: {{ tutor.department }}
                      </p>
                    </div>
                    <p class="small text-body-secondary mb-0 record-summary admin-line-clamp">{{ tutor.bio }}</p>
                  </div>
                  <div class="admin-management-row__actions" aria-label="Tutor record actions">
                    <button class="btn btn-directory-action-secondary btn-sm" type="button" @click="editTutor(tutor)">
                      Edit
                    </button>
                    <button
                      class="btn btn-directory-action-danger btn-sm"
                      type="button"
                      :disabled="deletingTutorId === tutor.id"
                      @click="deleteTutor(tutor)"
                    >
                      <span
                        v-if="deletingTutorId === tutor.id"
                        class="spinner-border spinner-border-sm me-2"
                        aria-hidden="true"
                      ></span>
                      {{ deletingTutorId === tutor.id ? 'Deleting' : 'Delete' }}
                    </button>
                  </div>
                </article>
              </div>
            </BaseCard>
          </div>
        </div>
      </section>

      <section
        v-show="activeAdminTab === 'users'"
        id="user-admin-panel"
        aria-labelledby="user-admin-heading"
        role="tabpanel"
      >
        <h2 id="user-admin-heading" class="h3 mb-3">User role management</h2>
        <BaseCard :stretch="false" :interactive="false">
          <template #header>
            <h3 class="h4 mb-0">User records</h3>
          </template>

          <div class="admin-record-toolbar">
            <div class="min-w-0 flex-grow-1">
              <label class="form-label small text-body-secondary" for="user-record-search">
                Search User records
              </label>
              <input
                id="user-record-search"
                v-model="userRecordSearch"
                class="form-control"
                type="search"
                autocomplete="off"
                placeholder="Search by username or email"
              >
            </div>
            <span class="badge text-bg-light admin-record-count">{{ userRecordSummary }}</span>
          </div>

          <div v-if="loadingUsers" class="placeholder-glow" aria-label="Loading users">
            <span class="placeholder col-8 mb-3"></span>
            <span class="placeholder col-12"></span>
            <span class="placeholder col-11"></span>
            <span class="placeholder col-9"></span>
          </div>

          <div v-else-if="userLoadError" class="alert alert-danger mb-0" role="alert">
            {{ userLoadError }}
          </div>

          <div v-else-if="!hasUsers" class="alert alert-secondary mb-0" role="status">
            No users are available yet.
          </div>

          <div v-else-if="filteredUsers.length === 0" class="alert alert-secondary mb-0" role="status">
            No User records match "{{ userRecordSearchTerm }}".
          </div>

          <div v-else class="admin-record-list" aria-label="User records">
            <article
              v-for="user in filteredUsers"
              :key="user.id"
              class="admin-management-row"
            >
              <div class="admin-management-row__body">
                <div class="admin-management-row__heading">
                  <div class="d-flex flex-wrap align-items-center gap-2 min-w-0">
                    <h4 class="h6 mb-0 text-truncate">{{ user.username }}</h4>
                    <span v-if="user.is_primary_admin" class="badge text-bg-primary">Primary Admin</span>
                    <span v-if="user.is_current_user" class="badge text-bg-light admin-record-count">You</span>
                  </div>
                  <p class="small text-body-secondary mb-0 text-truncate">{{ user.email }}</p>
                </div>
                <p class="small text-body-secondary mb-0">
                  Role: <strong class="text-body text-capitalize">{{ user.role }}</strong>
                </p>
              </div>
            </article>
          </div>
        </BaseCard>
      </section>
    </div>
  </section>
</template>

<style scoped>
.admin-dashboard {
  max-width: 1180px;
  margin: 0 auto;
  overflow-x: clip;
}

.record-summary {
  max-width: 34rem;
}

.admin-record-toolbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 0.9rem;
  margin-bottom: 1rem;
}

.admin-record-count {
  flex: 0 0 auto;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--bs-border-color);
  color: var(--bs-body-color) !important;
  background: var(--bs-tertiary-bg) !important;
}

.admin-record-list {
  display: grid;
  gap: 0.65rem;
}

.admin-management-row {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 0;
  border-top: 1px solid var(--bs-border-color);
}

.admin-management-row:first-child {
  border-top: 0;
  padding-top: 0;
}

.admin-management-row__body {
  display: grid;
  min-width: 0;
  gap: 0.35rem;
}

.admin-management-row__heading {
  display: grid;
  min-width: 0;
  gap: 0.15rem;
}

.admin-management-row__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.admin-line-clamp {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.course-tutor-assignment {
  min-width: 0;
}

.selected-tutor-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.selected-tutor-chip {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.45rem 0.35rem 0.75rem;
  border: 1px solid rgba(var(--swinburne-punch-rgb), 0.18);
  border-radius: 999px;
  background: rgba(var(--swinburne-punch-rgb), 0.08);
  font-size: 0.9rem;
  line-height: 1.2;
}

.selected-tutor-chip > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-tutor-remove {
  display: inline-flex;
  width: 1.65rem;
  height: 1.65rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  color: var(--swinburne-punch);
  background: var(--bs-body-bg);
  font-size: 1.2rem;
  line-height: 1;
}

.selected-tutor-remove:hover {
  color: var(--swinburne-white);
  background: var(--swinburne-punch);
}

.selected-tutor-remove:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 0.2rem var(--swinburne-focus-ring);
}

.assignment-empty {
  padding: 0.85rem;
  border: 1px dashed var(--bs-border-color);
  border-radius: 0.5rem;
  color: var(--bs-secondary-color);
  background: var(--bs-tertiary-bg);
}

.tutor-search-results {
  display: grid;
  gap: 0.5rem;
  max-height: 21rem;
  overflow-y: auto;
}

.tutor-search-result {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--bs-border-color);
  border-radius: 0.5rem;
  background: var(--bs-body-bg);
}

.min-w-0 {
  min-width: 0;
}

.admin-tabs {
  display: inline-flex;
  gap: 0.35rem;
  padding: 0.35rem;
  border: 1px solid rgba(var(--swinburne-punch-rgb), 0.18);
  border-radius: 999px;
  background: var(--bs-body-bg);
  box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.06);
}

.admin-tab {
  min-width: 8.5rem;
  padding: 0.65rem 1.25rem;
  border: 0;
  border-radius: 999px;
  color: var(--bs-body-color);
  background: transparent;
  font-weight: 800;
  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}

.admin-tab:hover {
  color: var(--swinburne-punch);
}

.admin-tab.active {
  color: var(--swinburne-white);
  background: var(--swinburne-punch);
  box-shadow: 0 0.65rem 1.25rem rgba(var(--swinburne-punch-rgb), 0.22);
}

.admin-tab:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 0.25rem var(--swinburne-focus-ring);
}

[data-bs-theme="dark"] .admin-tabs {
  background: var(--bs-surface-color);
  border-color: rgba(255, 255, 255, 0.1);
}

[data-bs-theme="dark"] .selected-tutor-remove {
  background: var(--bs-surface-color);
}

@media (min-width: 768px) {
  .admin-form-card {
    position: sticky;
    top: 1rem;
  }
}

@media (max-width: 575.98px) {
  .admin-record-toolbar,
  .admin-management-row {
    align-items: stretch;
    flex-direction: column;
  }

  .admin-record-count,
  .admin-management-row__actions {
    width: 100%;
  }

  .admin-management-row__actions .btn {
    flex: 1 1 0;
  }
}
</style>
