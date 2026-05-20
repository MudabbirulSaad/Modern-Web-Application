import { defineStore } from 'pinia'
import { apiRequest } from '../api/client'
import { getStudentViewerScope, purgeViewerScope } from '../api/localCache'
import { useCourseStore } from './courseStore'
import { useFavoriteSyncStore } from './favoriteSyncStore'
import { useReviewStore } from './reviewStore'
import { useTutorStore } from './tutorStore'

let sessionRequest = null
const themeModes = ['light', 'dark', 'auto']
const themeLabels = {
  light: 'Light',
  dark: 'Dark',
  auto: 'System'
}

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
    async resetAuthenticatedState() {
      const studentScope = this.role === 'student' && this.userId
        ? getStudentViewerScope(this.userId)
        : null
      const favoriteSyncStore = useFavoriteSyncStore()
      const reviewStore = useReviewStore()

      favoriteSyncStore.stopPendingFavoriteReplay()
      reviewStore.stopPendingReviewUpvoteReplay()
      this.clearUser()
      this.sessionInitialized = true
      useCourseStore().resetForGuestScope()
      useTutorStore().resetForGuestScope()
      reviewStore.resetForGuestScope()

      if (studentScope) {
        await purgeViewerScope(studentScope)
      }
    },
    async invalidateSession() {
      await this.resetAuthenticatedState()
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

      sessionRequest = apiRequest('/api/auth/session', {
        method: 'GET'
      })
        .then((userData) => {
          this.setUser(userData)
          return userData
        })
        .catch((err) => {
          this.clearUser()
          if (err.status === 401) {
            return null
          }
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
        const userData = await apiRequest('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(credentials)
        })

        this.setUser(userData)
        this.sessionInitialized = true
        return userData
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
        await apiRequest('/api/auth/logout', {
          method: 'POST'
        })

        await this.resetAuthenticatedState()
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
    cycleTheme() {
      const currentThemeIndex = themeModes.indexOf(this.theme)
      const nextTheme = themeModes[(currentThemeIndex + 1) % themeModes.length] || themeModes[0]
      this.setTheme(nextTheme)
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
    isStudent: (state) => state.loggedIn && state.role === 'student',
    themeLabel: (state) => themeLabels[state.theme] || themeLabels.auto,
    nextThemeLabel: (state) => {
      const currentThemeIndex = themeModes.indexOf(state.theme)
      const nextTheme = themeModes[(currentThemeIndex + 1) % themeModes.length] || themeModes[0]
      return themeLabels[nextTheme]
    }
  }
})
