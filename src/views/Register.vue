<script setup>
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

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
  <section class="register-hero">
    <div class="register-hero__content">
      <p class="register-hero__eyebrow">Student Access</p>
      <h1>Create your Swinburne directory account.</h1>
      <p class="register-hero__lead">
        Join the student directory to review tutors, save favourite courses, upvote useful feedback,
        and unlock a personalised dashboard for planning your next academic move.
      </p>

      <div class="register-hero__actions">
        <RouterLink class="btn btn-outline-primary btn-lg" to="/login">
          Log in
        </RouterLink>
      </div>
    </div>

    <div class="register-hero__visual" aria-label="Registration highlights">
      <div class="register-hero__rail" aria-hidden="true"></div>

      <form class="register-panel" @submit.prevent="register">
        <div class="register-panel__header">
          <span>Student onboarding</span>
          <strong>Set up your directory access</strong>
        </div>

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
          <div class="register-panel__guidance">
            Passwords must use at least 8 characters to meet the directory account security requirement.
          </div>
        </div>

        <button class="btn btn-directory-action w-100" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
          {{ loading ? 'Creating account' : 'Register' }}
        </button>

        <p class="register-panel__login">
          Already registered?
          <RouterLink to="/login">Log in to your account</RouterLink>
        </p>
      </form>
    </div>
  </section>
</template>

<style scoped>
:global(body) {
  overflow-x: clip;
}

.register-hero {
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

.register-hero::before {
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

.register-hero::after {
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

.register-hero__content,
.register-hero__visual {
  position: relative;
  z-index: 1;
}

.register-hero__content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 760px;
}

.register-hero__eyebrow {
  color: var(--swinburne-punch);
  font-weight: 800;
  letter-spacing: 0.08em;
  margin-bottom: 1rem;
  text-transform: uppercase;
}

.register-hero h1 {
  color: var(--swinburne-black);
  font-size: clamp(3rem, 8vw, 7.25rem);
  line-height: 0.88;
  max-width: 10ch;
  margin-bottom: 1.25rem;
}

.register-hero__lead {
  color: #414141;
  font-size: clamp(1.1rem, 2vw, 1.35rem);
  line-height: 1.65;
  max-width: 700px;
  margin-bottom: 2rem;
}

.register-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  align-items: center;
}

.register-hero__visual {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 1.5rem;
  align-items: stretch;
  min-height: 28rem;
}

.register-hero__rail {
  width: 0.25rem;
  min-height: 100%;
  background:
    linear-gradient(180deg, var(--swinburne-punch), var(--swinburne-supernova));
  box-shadow: 0 0 0 1px rgba(var(--swinburne-punch-rgb), 0.12);
}

.register-panel {
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

.register-panel__header {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.register-panel__header span {
  color: var(--swinburne-punch);
  font-size: 0.8rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.register-panel__header strong {
  color: var(--swinburne-black);
  font-size: clamp(1.35rem, 2.4vw, 2rem);
  line-height: 1.15;
}

.register-panel__guidance {
  color: #4b4b4b;
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.5;
  margin-top: 0.5rem;
  padding-left: 0.85rem;
  border-left: 0.2rem solid var(--swinburne-supernova);
}

.register-panel__login {
  color: #4b4b4b;
  font-size: 0.95rem;
  margin: 1rem 0 0;
  text-align: center;
}

.register-panel__login a {
  font-weight: 800;
}

[data-bs-theme="dark"] .register-hero {
  background:
    linear-gradient(110deg, rgba(var(--swinburne-punch-rgb), 0.18), transparent 34%),
    linear-gradient(180deg, #121212 0%, #101010 76%, var(--bs-body-bg) 100%);
}

[data-bs-theme="dark"] .register-hero h1,
[data-bs-theme="dark"] .register-panel__header strong {
  color: var(--swinburne-white);
}

[data-bs-theme="dark"] .register-hero__lead,
[data-bs-theme="dark"] .register-panel__guidance,
[data-bs-theme="dark"] .register-panel__login {
  color: #d6d6d6;
}

[data-bs-theme="dark"] .register-panel {
  background:
    linear-gradient(180deg, rgba(30, 30, 30, 0.94), rgba(18, 18, 18, 0.8));
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.24);
}

[data-bs-theme="dark"] .register-panel__header {
  border-bottom-color: rgba(255, 255, 255, 0.16);
}

@media (max-width: 900px) {
  .register-hero {
    grid-template-columns: 1fr;
    min-height: auto;
    margin-top: -1rem;
  }

  .register-hero h1 {
    max-width: 100%;
  }

  .register-hero__visual {
    min-height: auto;
  }
}

@media (max-width: 575.98px) {
  .register-hero {
    padding-block: 2.5rem;
  }

  .register-hero__visual {
    grid-template-columns: 1fr;
  }

  .register-hero__rail {
    width: 100%;
    min-height: 0.25rem;
  }
}
</style>
