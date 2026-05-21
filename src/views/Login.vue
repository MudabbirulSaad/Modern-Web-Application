<script setup>
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
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
  <section class="login-hero">
    <div class="login-hero__content">
      <p class="login-hero__eyebrow">Student Access</p>
      <h1>Log in to shape smarter study choices.</h1>
      <p class="login-hero__lead">
        Sign in to review tutors, upvote useful feedback, save favourite courses, and access your student dashboard.
      </p>

      <div class="login-hero__actions">
        <RouterLink class="btn btn-outline-primary btn-lg" to="/register">
          Register
        </RouterLink>
      </div>
    </div>

    <div class="login-hero__visual" aria-label="Login highlights">
      <div class="login-hero__rail" aria-hidden="true"></div>

      <form class="login-panel" @submit.prevent="login">
        <div class="login-panel__header">
          <span>Secure student sign in</span>
          <strong>Continue to your directory</strong>
        </div>

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

        <button class="btn btn-directory-action w-100" type="submit" :disabled="userStore.loading">
          <span v-if="userStore.loading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
          {{ userStore.loading ? 'Logging in' : 'Log in' }}
        </button>

        <p class="login-panel__register">
          New to SwinDirectory?
          <RouterLink to="/register">Create an account</RouterLink>
        </p>
      </form>
    </div>
  </section>
</template>

<style scoped>
:global(body) {
  overflow-x: clip;
}

.login-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
  gap: clamp(2rem, 6vw, 6rem);
  align-items: center;
  width: auto;
  min-height: min(78vh, 760px);
  margin: -1.5rem calc(50% - 50vw) 0;
  padding:
    clamp(3rem, 7vw, 6.5rem)
    max(1.5rem, calc((100vw - 1320px) / 2 + 1.5rem));
  background:
    linear-gradient(110deg, rgba(var(--swinburne-punch-rgb), 0.1), transparent 34%),
    linear-gradient(180deg, #ffffff 0%, #f8f9fa 76%, var(--bs-body-bg) 100%);
  overflow: hidden;
  position: relative;
}

.login-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(var(--swinburne-punch-rgb), 0.26) 0 2px, transparent 2px 100%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.045) 0 1px, transparent 1px 100%);
  background-size: 8.5rem 100%, 100% 5rem;
  mask-image: linear-gradient(90deg, black, transparent 72%);
  opacity: 0.55;
}

.login-hero::after {
  content: "";
  position: absolute;
  top: 14%;
  right: max(1.5rem, calc((100vw - 1320px) / 2 + 1.5rem));
  width: min(34vw, 28rem);
  height: min(34vw, 28rem);
  border: 1px solid rgba(var(--swinburne-punch-rgb), 0.24);
  transform: rotate(10deg);
  opacity: 0.55;
}

.login-hero__content,
.login-hero__visual {
  position: relative;
  z-index: 1;
}

.login-hero__content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 760px;
}

.login-hero__eyebrow {
  color: var(--swinburne-punch);
  font-weight: 800;
  letter-spacing: 0.08em;
  margin-bottom: 1rem;
  text-transform: uppercase;
}

.login-hero h1 {
  color: var(--swinburne-black);
  font-size: clamp(3rem, 8vw, 7.25rem);
  line-height: 0.88;
  max-width: 10.3ch;
  margin-bottom: 1.25rem;
}

.login-hero__lead {
  color: #414141;
  font-size: clamp(1.1rem, 2vw, 1.35rem);
  line-height: 1.65;
  max-width: 700px;
  margin-bottom: 2rem;
}

.login-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  align-items: center;
}

.login-hero__visual {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 1.5rem;
  align-items: stretch;
  min-height: 28rem;
}

.login-hero__rail {
  width: 0.25rem;
  min-height: 100%;
  background:
    linear-gradient(180deg, var(--swinburne-punch), var(--swinburne-supernova));
  box-shadow: 0 0 0 1px rgba(var(--swinburne-punch-rgb), 0.12);
}

.login-panel {
  align-self: center;
  width: 100%;
  max-width: 520px;
  padding: clamp(1.25rem, 4vw, 2rem);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 255, 255, 0.78));
  border: 1px solid rgba(var(--swinburne-punch-rgb), 0.16);
  border-radius: 0.75rem;
  box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(10px);
}

.login-panel__header {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.login-panel__header span {
  color: var(--swinburne-punch);
  font-size: 0.8rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.login-panel__header strong {
  color: var(--swinburne-black);
  font-size: clamp(1.35rem, 2.4vw, 2rem);
  line-height: 1.15;
}

.login-panel__register {
  color: #4b4b4b;
  font-size: 0.95rem;
  margin: 1rem 0 0;
  text-align: center;
}

.login-panel__register a {
  font-weight: 800;
}

[data-bs-theme="dark"] .login-hero {
  background:
    linear-gradient(110deg, rgba(var(--swinburne-punch-rgb), 0.18), transparent 34%),
    linear-gradient(180deg, #121212 0%, #101010 76%, var(--bs-body-bg) 100%);
}

[data-bs-theme="dark"] .login-hero h1,
[data-bs-theme="dark"] .login-panel__header strong {
  color: var(--swinburne-white);
}

[data-bs-theme="dark"] .login-hero__lead,
[data-bs-theme="dark"] .login-panel__register {
  color: #d6d6d6;
}

[data-bs-theme="dark"] .login-panel {
  background:
    linear-gradient(180deg, rgba(30, 30, 30, 0.94), rgba(18, 18, 18, 0.8));
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.24);
}

[data-bs-theme="dark"] .login-panel__header {
  border-bottom-color: rgba(255, 255, 255, 0.16);
}

@media (max-width: 900px) {
  .login-hero {
    grid-template-columns: 1fr;
    min-height: auto;
    margin-top: -1rem;
  }

  .login-hero h1 {
    max-width: 100%;
  }

  .login-hero__visual {
    min-height: auto;
  }
}

@media (max-width: 575.98px) {
  .login-hero {
    padding-block: 2.5rem;
  }

  .login-hero__visual {
    grid-template-columns: 1fr;
  }

  .login-hero__rail {
    width: 100%;
    min-height: 0.25rem;
  }
}
</style>
