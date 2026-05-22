import { ref } from 'vue'
import { favoriteApi as defaultFavoriteApi } from './favoriteApi.js'

const DEFAULT_ERROR = 'Favorite could not be updated. Please try again.'

export const useFavoriteWorkflow = ({
  entityType,
  userStore,
  favoriteApi = defaultFavoriteApi,
  applyFavoriteState,
  errorMessage = DEFAULT_ERROR
}) => {
  const favoriteError = ref('')
  const updatingFavorites = ref(new Set())

  const isUpdatingFavorite = (entityId) => updatingFavorites.value.has(entityId)

  const startUpdating = (entityId) => {
    updatingFavorites.value = new Set([...updatingFavorites.value, entityId])
  }

  const stopUpdating = (entityId) => {
    const nextUpdating = new Set(updatingFavorites.value)
    nextUpdating.delete(entityId)
    updatingFavorites.value = nextUpdating
  }

  const toggleFavorite = async (item) => {
    if (!userStore.isStudent || !item || isUpdatingFavorite(item.id)) {
      return false
    }

    favoriteError.value = ''
    startUpdating(item.id)

    try {
      const nextState = !item.has_favorite
      const request = nextState ? favoriteApi.saveFavorite : favoriteApi.removeFavorite

      await request({ entityType, entityId: item.id })
      applyFavoriteState(item.id, nextState)

      return true
    } catch (err) {
      favoriteError.value = errorMessage
      return false
    } finally {
      stopUpdating(item.id)
    }
  }

  return {
    favoriteError,
    isUpdatingFavorite,
    toggleFavorite
  }
}
