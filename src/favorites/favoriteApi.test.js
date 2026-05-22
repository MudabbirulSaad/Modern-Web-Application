import { jest } from '@jest/globals'
import { fetchCurrentFavorites, removeFavorite, saveFavorite } from './favoriteApi.js'

const jsonResponse = ({ ok = true, status = 200, body = {} } = {}) => ({
  ok,
  status,
  json: async () => body
})

describe('favorite API adapter', () => {
  it('saves a favorite through the current student endpoint', async () => {
    const fetcher = jest.fn(async () => jsonResponse({
      body: { status: 'ok', data: { id: 3, entity_type: 'course', entity_id: 2 } }
    }))

    const favorite = await saveFavorite({ entityType: 'course', entityId: 2, fetcher })

    expect(fetcher).toHaveBeenCalledWith('/api/me/favorites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        entity_type: 'course',
        entity_id: 2
      })
    })
    expect(favorite).toEqual({ id: 3, entity_type: 'course', entity_id: 2 })
  })

  it('removes a favorite through the current student endpoint', async () => {
    const fetcher = jest.fn(async () => jsonResponse({ body: { status: 'ok' } }))

    await removeFavorite({ entityType: 'tutor', entityId: 4, fetcher })

    expect(fetcher).toHaveBeenCalledWith('/api/me/favorites', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        entity_type: 'tutor',
        entity_id: 4
      })
    })
  })

  it('loads current student favorites with credentials', async () => {
    const favorites = { tutors: [], courses: [{ id: 2, has_favorite: true }] }
    const fetcher = jest.fn(async () => jsonResponse({
      body: { status: 'ok', data: favorites }
    }))

    await expect(fetchCurrentFavorites({ fetcher })).resolves.toEqual(favorites)
    expect(fetcher).toHaveBeenCalledWith('/api/me/favorites', {
      credentials: 'include'
    })
  })

  it('throws parsed API errors', async () => {
    const fetcher = jest.fn(async () => jsonResponse({
      ok: false,
      status: 403,
      body: { status: 'error', message: 'Student access required' }
    }))

    await expect(saveFavorite({ entityType: 'course', entityId: 2, fetcher }))
      .rejects.toThrow('Student access required')
  })
})
