<script setup>
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useUserStore } from './store/userStore'

const userStore = useUserStore()

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
            <RouterLink class="nav-link px-3" active-class="active" to="/tutors">Tutors</RouterLink>
          </li>
        </ul>
        
        <div class="d-flex align-items-center">
          <div class="dropdown">
            <button class="btn btn-link nav-link dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              Theme
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow border-0 rounded-3">
              <li><button class="dropdown-item" @click="userStore.setTheme('light')">Light</button></li>
              <li><button class="dropdown-item" @click="userStore.setTheme('dark')">Dark</button></li>
              <li><button class="dropdown-item" @click="userStore.setTheme('auto')">System</button></li>
            </ul>
          </div>
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
</style>
