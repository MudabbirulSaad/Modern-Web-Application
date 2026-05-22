const parseFavoriteResponse = async (response, fallbackMessage) => {
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.message || fallbackMessage)
  }

  return payload.data || null
}

const requestFavorite = async ({ entityType, entityId, method, fetcher = fetch }) => {
  const response = await fetcher('/api/me/favorites', {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      entity_type: entityType,
      entity_id: entityId
    })
  })

  return parseFavoriteResponse(response, 'Unable to update favorite')
}

const fetchCurrentFavorites = async ({ fetcher = fetch } = {}) => {
  const response = await fetcher('/api/me/favorites', {
    credentials: 'include'
  })

  return parseFavoriteResponse(response, 'Unable to load favorites')
}

const saveFavorite = ({ entityType, entityId, fetcher }) => requestFavorite({
  entityType,
  entityId,
  method: 'POST',
  fetcher
})

const removeFavorite = ({ entityType, entityId, fetcher }) => requestFavorite({
  entityType,
  entityId,
  method: 'DELETE',
  fetcher
})

export const favoriteApi = {
  fetchCurrentFavorites,
  saveFavorite,
  removeFavorite
}

export {
  fetchCurrentFavorites,
  saveFavorite,
  removeFavorite
}
