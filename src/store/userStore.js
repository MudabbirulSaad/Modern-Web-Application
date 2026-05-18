import { defineStore } from 'pinia'

let sessionRequest = null

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    userId: null,
    role: null,
    loggedIn: false,
    sessionInitialized: false,
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
    async initializeSession() {
      if (this.sessionInitialized) {
        return this.user
      }

      if (sessionRequest) {
        return sessionRequest
      }

      this.loading = true
      this.error = null

      sessionRequest = fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include'
      })
        .then(async (response) => {
          const payload = await response.json()

          if (response.status === 401) {
            this.clearUser()
            return null
          }

          if (!response.ok) {
            throw new Error(payload.message || 'Unable to restore session')
          }

          this.setUser(payload.data)
          return payload.data
        })
        .catch((err) => {
          this.clearUser()
          this.error = err.message || 'Unable to restore session'
          return null
        })
        .finally(() => {
          this.loading = false
          this.sessionInitialized = true
          sessionRequest = null
        })

      return sessionRequest
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
        this.sessionInitialized = true
        return payload.data
      } catch (err) {
        this.clearUser()
        this.error = err.message || 'Login failed. Please try again.'
        throw err
      } finally {
        this.loading = false
      }
    },
    async logout() {
      this.loading = true
      this.error = null

      try {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include'
        })

        if (!response.ok) {
          const payload = await response.json()
          throw new Error(payload.message || 'Unable to log out')
        }

        this.clearUser()
        this.sessionInitialized = true
      } catch (err) {
        this.error = err.message || 'Unable to log out'
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
    isAdmin: (state) => state.loggedIn && state.role === 'admin',
    isStudent: (state) => state.loggedIn && state.role === 'student'
  }
})
