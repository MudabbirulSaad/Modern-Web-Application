<script setup>
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useRouter } from 'vue-router'
import { useUserStore } from './store/userStore'

const userStore = useUserStore()
const router = useRouter()

const logout = async () => {
  try {
    await userStore.logout()
    router.push({ name: 'home' })
  } catch {
  }
}

onMounted(() => {
  userStore.applyTheme()
  
  // Listen for system theme changes if set to 'auto'
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (userStore.theme === 'auto') {
      userStore.applyTheme()
    }
  })
})
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-dark bg-black shadow-sm">
    <div class="container-fluid">
      <RouterLink class="navbar-brand d-flex align-items-center" to="/">
        <span class="brand-accent me-2"></span>
        <span class="fw-bold text-uppercase">SwinDirectory</span>
      </RouterLink>
      
      <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav me-auto">
          <li class="nav-item">
            <RouterLink class="nav-link px-3" active-class="active" to="/">Home</RouterLink>
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link px-3" active-class="active" to="/courses">Courses</RouterLink>
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link px-3" active-class="active" to="/tutors">Tutors</RouterLink>
          </li>
          <li v-if="userStore.isStudent" class="nav-item">
            <RouterLink class="nav-link px-3" active-class="active" to="/dashboard">Dashboard</RouterLink>
          </li>
          <li v-if="userStore.isAdmin" class="nav-item">
            <RouterLink class="nav-link px-3" active-class="active" to="/admin">Admin</RouterLink>
          </li>
          <li v-if="!userStore.isAuthenticated" class="nav-item">
            <RouterLink class="nav-link px-3" active-class="active" to="/register">Register</RouterLink>
          </li>
          <li v-if="!userStore.isAuthenticated" class="nav-item">
            <RouterLink class="nav-link px-3" active-class="active" to="/login">Login</RouterLink>
          </li>
          <li v-else class="nav-item">
            <button class="btn btn-link nav-link px-3" type="button" @click="logout">Logout</button>
          </li>
        </ul>
        
        <div class="d-flex align-items-center mt-2 mt-lg-0">
          <button
            class="btn theme-toggle-btn"
            type="button"
            :aria-label="`Current theme is ${userStore.themeLabel}. Activate to switch to ${userStore.nextThemeLabel}.`"
            :title="`Switch to ${userStore.nextThemeLabel} theme`"
            @click="userStore.cycleTheme"
          >
            {{ userStore.themeLabel }}
          </button>
        </div>
      </div>
    </div>
  </nav>

  <main class="container py-4">
    <RouterView v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
  </main>
</template>

<style scoped>
.bg-black {
  background-color: #000000 !important;
}

.brand-accent {
  width: 12px;
  height: 24px;
  background-color: var(--swinburne-punch);
  display: inline-block;
  border-radius: 2px;
}

.navbar-brand {
  letter-spacing: 0.5px;
}

.nav-link {
  font-weight: 500;
  transition: color 0.2s ease;
}

.nav-link:hover, .nav-link.active {
  color: var(--swinburne-punch) !important;
}

.theme-toggle-btn {
  --bs-btn-color: var(--swinburne-white);
  /* --bs-btn-border-color: var(--swinburne-punch); */
  --bs-btn-bg: var(--swinburne-punch-opa);
  --bs-btn-hover-color: var(--swinburne-white);
  --bs-btn-hover-bg: var(--swinburne-punch);
  --bs-btn-active-color: var(--swinburne-white);
  --bs-btn-active-bg: var(--swinburne-red-berry);
  --bs-btn-active-border-color: var(--swinburne-red-berry);
  --bs-btn-focus-shadow-rgb: var(--swinburne-punch-rgb);
  border-width: 0;
  font-weight: 600;
  line-height: 1.25;
  padding: 0.375rem 0.75rem;
}

.theme-toggle-btn:focus-visible {
  box-shadow: 0 0 0 0.25rem var(--swinburne-focus-ring);
}
</style>
