<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/userStore'

const router = useRouter()
const userStore = useUserStore()

const email = ref('')
const password = ref('')
const error = ref('')

const isFormValid = computed(() => (
  email.value.trim().length > 0 &&
  password.value.length > 0
))

const login = async () => {
  error.value = ''

  if (!isFormValid.value) {
    error.value = 'Enter your email and password.'
    return
  }

  try {
    await userStore.login({
      email: email.value.trim(),
      password: password.value
    })
    router.push({ name: 'home' })
  } catch (err) {
    error.value = err.message || 'Login failed. Please try again.'
  }
}
</script>

<template>
  <section class="auth-view">
    <div class="mb-4">
      <p class="text-uppercase text-primary fw-bold small mb-2">Student Access</p>
      <h1 class="mb-2">Log in</h1>
      <p class="lead text-body-secondary mb-0">
        Sign in to review tutors, upvote feedback, and save favourite courses.
      </p>
    </div>

    <form class="card border-0 shadow-sm rounded-3" @submit.prevent="login">
      <div class="card-body p-4">
        <div v-if="error || userStore.error" class="alert alert-danger" role="alert">
          {{ error || userStore.error }}
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
            autocomplete="current-password"
            required
          >
        </div>

        <button class="btn btn-primary w-100" type="submit" :disabled="userStore.loading">
          <span v-if="userStore.loading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
          {{ userStore.loading ? 'Logging in' : 'Log in' }}
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
