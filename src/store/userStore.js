import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    loading: false,
    error: null,
    theme: localStorage.getItem('theme') || 'auto'
  }),
  actions: {
    setUser(userData) {
      this.user = userData
    },
    clearUser() {
      this.user = null
    },
    setTheme(newTheme) {
      this.theme = newTheme
      localStorage.setItem('theme', newTheme)
      this.applyTheme()
    },
    applyTheme() {
      let activeTheme = this.theme
      if (this.theme === 'auto') {
        activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
      document.documentElement.setAttribute('data-bs-theme', activeTheme)
    }
  },
  getters: {
    isAuthenticated: (state) => !!state.user
  }
})
