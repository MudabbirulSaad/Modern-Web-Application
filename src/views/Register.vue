<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const username = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const isFormValid = computed(() => (
  username.value.trim().length > 0 &&
  email.value.trim().length > 0 &&
  password.value.length >= 8
))

const register = async () => {
  error.value = ''

  if (!isFormValid.value) {
    error.value = 'Enter a username, email, and password with at least 8 characters.'
    return
  }

  loading.value = true

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username.value.trim(),
        email: email.value.trim(),
        password: password.value
      })
    })
    const payload = await response.json()

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to register')
    }

    router.push({ name: 'login' })
  } catch (err) {
    error.value = err.message || 'Registration failed. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="auth-view">
    <div class="mb-4">
      <p class="text-uppercase text-primary fw-bold small mb-2">Student Access</p>
      <h1 class="mb-2">Create your account</h1>
      <p class="lead text-body-secondary mb-0">
        Register to review tutors, upvote feedback, and save favourite courses.
      </p>
    </div>

    <form class="card border-0 shadow-sm rounded-3" @submit.prevent="register">
      <div class="card-body p-4">
        <div v-if="error" class="alert alert-danger" role="alert">
          {{ error }}
        </div>

        <div class="mb-3">
          <label class="form-label" for="username">Username</label>
          <input
            id="username"
            v-model="username"
            class="form-control"
            type="text"
            autocomplete="username"
            required
          >
        </div>

        <div class="mb-3">
          <label class="form-label" for="email">Email</label>
          <input
            id="email"
            v-model="email"
            class="form-control"
            type="email"
            autocomplete="email"
            required
          >
        </div>

        <div class="mb-4">
          <label class="form-label" for="password">Password</label>
          <input
            id="password"
            v-model="password"
            class="form-control"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          >
          <div class="form-text">Use at least 8 characters.</div>
        </div>

        <button class="btn btn-primary w-100" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
          {{ loading ? 'Creating account' : 'Register' }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.auth-view {
  max-width: 520px;
  margin: 0 auto;
}
</style>
