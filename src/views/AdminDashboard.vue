<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import BaseCard from '../components/common/BaseCard.vue'

const tutors = ref([])
const courses = ref([])
const loadingTutors = ref(true)
const loadingCourses = ref(true)
const tutorSaving = ref(false)
const courseSaving = ref(false)
const deletingTutorId = ref(null)
const deletingCourseId = ref(null)
const error = ref('')
const success = ref('')
const editingTutorId = ref(null)
const editingCourseId = ref(null)
const activeAdminTab = ref('courses')

const tutorForm = reactive({
  name: '',
  department: '',
  bio: ''
})

const courseForm = reactive({
  title: '',
  department: '',
  description: '',
  tutorIds: []
})

const isEditingTutor = computed(() => editingTutorId.value !== null)
const isEditingCourse = computed(() => editingCourseId.value !== null)
const hasTutors = computed(() => tutors.value.length > 0)
const hasCourses = computed(() => courses.value.length > 0)

const resetTutorForm = () => {
  editingTutorId.value = null
  tutorForm.name = ''
  tutorForm.department = ''
  tutorForm.bio = ''
}

const resetCourseForm = () => {
  editingCourseId.value = null
  courseForm.title = ''
  courseForm.department = ''
  courseForm.description = ''
  courseForm.tutorIds = []
}

const readError = async (response, fallback) => {
  try {
    const payload = await response.json()
    return payload.message || fallback
  } catch (err) {
    return fallback
  }
}

const readCourseTutorIds = (course) => {
  if (Array.isArray(course.tutors)) {
    return course.tutors.map((tutor) => Number(tutor.id))
  }

  return String(course.tutor_ids || '')
    .split(',')
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
}

const loadTutors = async () => {
  loadingTutors.value = true
  error.value = ''

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
    loadingTutors.value = false
  }
}

const loadCourses = async () => {
  loadingCourses.value = true
  error.value = ''

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
    loadingCourses.value = false
  }
}

const editTutor = (tutor) => {
  activeAdminTab.value = 'tutors'
  editingTutorId.value = tutor.id
  tutorForm.name = tutor.name
  tutorForm.department = tutor.department
  tutorForm.bio = tutor.bio
  success.value = ''
  error.value = ''
}

const editCourse = async (course) => {
  activeAdminTab.value = 'courses'
  editingCourseId.value = course.id
  courseForm.title = course.title
  courseForm.department = course.department
  courseForm.description = course.description
  courseForm.tutorIds = readCourseTutorIds(course)
  success.value = ''
  error.value = ''

  try {
    const response = await fetch(`/api/courses/${course.id}`)

    if (!response.ok) {
      return
    }

    const payload = await response.json()
    courseForm.tutorIds = readCourseTutorIds(payload.data || course)
  } catch (err) {
    courseForm.tutorIds = readCourseTutorIds(course)
  }
}

const saveTutor = async () => {
  error.value = ''
  success.value = ''

  if (!tutorForm.name.trim() || !tutorForm.department.trim() || !tutorForm.bio.trim()) {
    error.value = 'Name, department, and bio are required.'
    return
  }

  tutorSaving.value = true

  try {
    const response = await fetch(isEditingTutor.value ? `/api/tutors/${editingTutorId.value}` : '/api/tutors', {
      method: isEditingTutor.value ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        name: tutorForm.name,
        department: tutorForm.department,
        bio: tutorForm.bio
      })
    })

    if (!response.ok) {
      throw new Error(await readError(response, 'Unable to save tutor'))
    }

    success.value = isEditingTutor.value ? 'Tutor updated.' : 'Tutor created.'
    resetTutorForm()
    await Promise.all([loadTutors(), loadCourses()])
  } catch (err) {
    error.value = err.message || 'Unable to save tutor.'
  } finally {
    tutorSaving.value = false
  }
}

const saveCourse = async () => {
  error.value = ''
  success.value = ''

  if (!courseForm.title.trim() || !courseForm.department.trim() || !courseForm.description.trim()) {
    error.value = 'Title, department, and description are required.'
    return
  }

  courseSaving.value = true

  try {
    const response = await fetch(isEditingCourse.value ? `/api/courses/${editingCourseId.value}` : '/api/courses', {
      method: isEditingCourse.value ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        title: courseForm.title,
        department: courseForm.department,
        description: courseForm.description,
        tutorIds: courseForm.tutorIds
      })
    })

    if (!response.ok) {
      throw new Error(await readError(response, 'Unable to save course'))
    }

    success.value = isEditingCourse.value ? 'Course updated.' : 'Course created.'
    resetCourseForm()
    await loadCourses()
  } catch (err) {
    error.value = err.message || 'Unable to save course.'
  } finally {
    courseSaving.value = false
  }
}

const deleteTutor = async (tutor) => {
  if (!window.confirm(`Delete ${tutor.name}?`)) {
    return
  }

  error.value = ''
  success.value = ''
  deletingTutorId.value = tutor.id

  try {
    const response = await fetch(`/api/tutors/${tutor.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error(await readError(response, 'Unable to delete tutor'))
    }

    if (editingTutorId.value === tutor.id) {
      resetTutorForm()
    }

    success.value = 'Tutor deleted.'
    await Promise.all([loadTutors(), loadCourses()])
  } catch (err) {
    error.value = err.message || 'Unable to delete tutor.'
  } finally {
    deletingTutorId.value = null
  }
}

const deleteCourse = async (course) => {
  if (!window.confirm(`Delete ${course.title}?`)) {
    return
  }

  error.value = ''
  success.value = ''
  deletingCourseId.value = course.id

  try {
    const response = await fetch(`/api/courses/${course.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error(await readError(response, 'Unable to delete course'))
    }

    if (editingCourseId.value === course.id) {
      resetCourseForm()
    }

    success.value = 'Course deleted.'
    await loadCourses()
  } catch (err) {
    error.value = err.message || 'Unable to delete course.'
  } finally {
    deletingCourseId.value = null
  }
}

onMounted(() => {
  loadTutors()
  loadCourses()
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
            <BaseCard>
              <template #header>
                <h3 class="h4 mb-0">{{ isEditingCourse ? 'Edit course' : 'New course' }}</h3>
              </template>

              <form @submit.prevent="saveCourse">
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
                  <div v-if="!hasTutors" class="alert alert-secondary mb-0" role="status">
                    Create tutors before assigning them to courses.
                  </div>
                  <div v-else class="vstack gap-2">
                    <div v-for="tutor in tutors" :key="tutor.id" class="form-check">
                      <input
                        :id="`course-tutor-${tutor.id}`"
                        v-model="courseForm.tutorIds"
                        class="form-check-input"
                        type="checkbox"
                        :value="tutor.id"
                      >
                      <label class="form-check-label" :for="`course-tutor-${tutor.id}`">
                        {{ tutor.name }} <span class="text-body-secondary">({{ tutor.department }})</span>
                      </label>
                    </div>
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
            <BaseCard>
              <template #header>
                <h3 class="h4 mb-0">Course records</h3>
              </template>

              <div v-if="loadingCourses" class="placeholder-glow" aria-label="Loading courses">
                <span class="placeholder col-8 mb-3"></span>
                <span class="placeholder col-12"></span>
                <span class="placeholder col-11"></span>
                <span class="placeholder col-9"></span>
              </div>

              <div v-else-if="!hasCourses" class="alert alert-secondary mb-0" role="status">
                No courses are available yet.
              </div>

              <div v-else class="table-responsive">
                <table class="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Course</th>
                      <th scope="col">Tutors</th>
                      <th class="text-end" scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="course in courses" :key="course.id">
                      <td>
                        <p class="fw-bold mb-1">{{ course.title }}</p>
                        <p class="small text-body-secondary mb-0 record-summary">{{ course.description }}</p>
                      </td>
                      <td>{{ course.tutor_names || 'Unassigned' }}</td>
                      <td>
                        <div class="d-flex justify-content-end gap-2">
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
                      </td>
                    </tr>
                  </tbody>
                </table>
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
            <BaseCard>
              <template #header>
                <h3 class="h4 mb-0">{{ isEditingTutor ? 'Edit tutor' : 'New tutor' }}</h3>
              </template>

              <form @submit.prevent="saveTutor">
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
                  <label class="form-label" for="tutor-department">Department</label>
                  <input
                    id="tutor-department"
                    v-model="tutorForm.department"
                    class="form-control"
                    type="text"
                    required
                  >
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
            <BaseCard>
              <template #header>
                <h3 class="h4 mb-0">Tutor records</h3>
              </template>

              <div v-if="loadingTutors" class="placeholder-glow" aria-label="Loading tutors">
                <span class="placeholder col-8 mb-3"></span>
                <span class="placeholder col-12"></span>
                <span class="placeholder col-11"></span>
                <span class="placeholder col-9"></span>
              </div>

              <div v-else-if="!hasTutors" class="alert alert-secondary mb-0" role="status">
                No tutors are available yet.
              </div>

              <div v-else class="table-responsive">
                <table class="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Tutor</th>
                      <th scope="col">Department</th>
                      <th class="text-end" scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="tutor in tutors" :key="tutor.id">
                      <td>
                        <p class="fw-bold mb-1">{{ tutor.name }}</p>
                        <p class="small text-body-secondary mb-0 record-summary">{{ tutor.bio }}</p>
                      </td>
                      <td>{{ tutor.department }}</td>
                      <td>
                        <div class="d-flex justify-content-end gap-2">
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
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </BaseCard>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.admin-dashboard {
  max-width: 1180px;
  margin: 0 auto;
}

.record-summary {
  max-width: 34rem;
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
</style>
