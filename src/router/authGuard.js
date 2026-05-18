import { useUserStore } from '../store/userStore'

export const createAuthGuard = (resolveUserStore = useUserStore) => async (to) => {
  if (!to.meta.requiresAdmin && !to.meta.requiresStudent && !to.meta.requiresGuest) {
    return true
  }

  const userStore = resolveUserStore()

  if (!userStore.sessionInitialized) {
    await userStore.initializeSession()
  }

  if (to.meta.requiresGuest) {
    if (userStore.isAdmin) {
      return { name: 'admin-dashboard' }
    }

    if (userStore.isStudent) {
      return { name: 'student-dashboard' }
    }

    return true
  }

  if (!userStore.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.requiresStudent && !userStore.isStudent) {
    return { name: 'home' }
  }

  if (to.meta.requiresAdmin && !userStore.isAdmin) {
    return { name: 'home' }
  }

  return true
}
