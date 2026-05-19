<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import BaseCard from '../components/common/BaseCard.vue'

const tutors = ref([])
const loading = ref(true)
const saving = ref(false)
const deletingId = ref(null)
const error = ref('')
const success = ref('')
const editingId = ref(null)

const form = reactive({
  name: '',
  department: '',
  bio: ''
})

const isEditing = computed(() => editingId.value !== null)
const hasTutors = computed(() => tutors.value.length > 0)

const resetForm = () => {
  editingId.value = null
  form.name = ''
  form.department = ''
  form.bio = ''
}

const readError = async (response, fallback) => {
  try {
    const payload = await response.json()
    return payload.message || fallback
  } catch (err) {
    return fallback
  }
}

const loadTutors = async () => {
  loading.value = true
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
    loading.value = false
  }
}

const editTutor = (tutor) => {
  editingId.value = tutor.id
  form.name = tutor.name
  form.department = tutor.department
  form.bio = tutor.bio
  success.value = ''
  error.value = ''
}

const saveTutor = async () => {
  error.value = ''
  success.value = ''

  if (!form.name.trim() || !form.department.trim() || !form.bio.trim()) {
    error.value = 'Name, department, and bio are required.'
    return
  }

  saving.value = true

  try {
    const response = await fetch(isEditing.value ? `/api/tutors/${editingId.value}` : '/api/tutors', {
      method: isEditing.value ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        name: form.name,
        department: form.department,
        bio: form.bio
      })
    })

    if (!response.ok) {
      throw new Error(await readError(response, 'Unable to save tutor'))
    }

    success.value = isEditing.value ? 'Tutor updated.' : 'Tutor created.'
    resetForm()
    await loadTutors()
  } catch (err) {
    error.value = err.message || 'Unable to save tutor.'
  } finally {
    saving.value = false
  }
}

const deleteTutor = async (tutor) => {
  if (!window.confirm(`Delete ${tutor.name}?`)) {
    return
  }

  error.value = ''
  success.value = ''
  deletingId.value = tutor.id

  try {
    const response = await fetch(`/api/tutors/${tutor.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error(await readError(response, 'Unable to delete tutor'))
    }

    if (editingId.value === tutor.id) {
      resetForm()
    }

    success.value = 'Tutor deleted.'
    await loadTutors()
  } catch (err) {
    error.value = err.message || 'Unable to delete tutor.'
  } finally {
    deletingId.value = null
  }
}

onMounted(() => {
  loadTutors()
})
</script>

<template>
  <section class="admin-dashboard">
    <div class="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-end mb-4">
      <div>
        <p class="text-uppercase text-primary fw-bold small mb-2">Admin Dashboard</p>
        <h1 class="mb-2">Manage tutors</h1>
        <p class="lead text-body-secondary mb-0">
          Create tutor profiles and keep department details current for the directory.
        </p>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div v-if="success" class="alert alert-success" role="status">
      {{ success }}
    </div>

    <div class="row g-4">
      <div class="col-12 col-lg-5">
        <BaseCard>
          <template #header>
            <h2 class="h4 mb-0">{{ isEditing ? 'Edit tutor' : 'New tutor' }}</h2>
          </template>

          <form @submit.prevent="saveTutor">
            <div class="mb-3">
              <label class="form-label" for="tutor-name">Name</label>
              <input
                id="tutor-name"
                v-model="form.name"
                class="form-control"
                type="text"
                required
              >
            </div>

            <div class="mb-3">
              <label class="form-label" for="tutor-department">Department</label>
              <input
                id="tutor-department"
                v-model="form.department"
                class="form-control"
                type="text"
                required
              >
            </div>

            <div class="mb-4">
              <label class="form-label" for="tutor-bio">Bio</label>
              <textarea
                id="tutor-bio"
                v-model="form.bio"
                class="form-control"
                rows="5"
                required
              ></textarea>
            </div>

            <div class="d-flex flex-column flex-sm-row gap-2">
              <button class="btn btn-primary" type="submit" :disabled="saving">
                <span v-if="saving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                {{ saving ? 'Saving' : isEditing ? 'Update tutor' : 'Create tutor' }}
              </button>
              <button
                v-if="isEditing"
                class="btn btn-outline-secondary"
                type="button"
                :disabled="saving"
                @click="resetForm"
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
            <h2 class="h4 mb-0">Tutor records</h2>
          </template>

          <div v-if="loading" class="placeholder-glow" aria-label="Loading tutors">
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
                    <p class="small text-body-secondary mb-0 tutor-bio">{{ tutor.bio }}</p>
                  </td>
                  <td>{{ tutor.department }}</td>
                  <td>
                    <div class="d-flex justify-content-end gap-2">
                      <button class="btn btn-outline-primary btn-sm" type="button" @click="editTutor(tutor)">
                        Edit
                      </button>
                      <button
                        class="btn btn-outline-danger btn-sm"
                        type="button"
                        :disabled="deletingId === tutor.id"
                        @click="deleteTutor(tutor)"
                      >
                        {{ deletingId === tutor.id ? 'Deleting' : 'Delete' }}
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
</template>

<style scoped>
.admin-dashboard {
  max-width: 1180px;
  margin: 0 auto;
}

.tutor-bio {
  max-width: 34rem;
}
</style>
