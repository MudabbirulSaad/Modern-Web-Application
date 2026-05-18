import { useUserStore } from '../store/userStore'

export const createAuthGuard = (resolveUserStore = useUserStore) => async (to) => {
  if (!to.meta.requiresAdmin && !to.meta.requiresStudent) {
    return true
  }

  const userStore = resolveUserStore()

  if (!userStore.sessionInitialized) {
    await userStore.initializeSession()
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
