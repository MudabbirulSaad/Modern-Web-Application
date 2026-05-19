import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    userId: null,
    role: null,
    loggedIn: false,
    loading: false,
    error: null,
    theme: localStorage.getItem('theme') || 'auto'
  }),
  actions: {
    setUser(userData) {
      this.user = userData
      this.userId = userData?.id || null
      this.role = userData?.role || null
      this.loggedIn = !!userData
    },
    clearUser() {
      this.user = null
      this.userId = null
      this.role = null
      this.loggedIn = false
    },
    async login(credentials) {
      this.loading = true
      this.error = null

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(credentials)
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.message || 'Unable to log in')
        }

        this.setUser(payload.data)
        return payload.data
      } catch (err) {
        this.clearUser()
        this.error = err.message || 'Login failed. Please try again.'
        throw err
      } finally {
        this.loading = false
      }
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
    isAuthenticated: (state) => state.loggedIn,
    isAdmin: (state) => state.loggedIn && state.role === 'admin'
  }
})
