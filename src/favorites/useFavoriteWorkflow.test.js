import { jest } from '@jest/globals'
import { useFavoriteWorkflow } from './useFavoriteWorkflow.js'

describe('favorite workflow module', () => {
  it('saves an unsaved favorite through the public favorite interface', async () => {
    const item = { id: 2, has_favorite: false }
    const userStore = { isStudent: true }
    const favoriteApi = {
      saveFavorite: jest.fn(async () => ({ id: 5, entity_type: 'course', entity_id: 2 })),
      removeFavorite: jest.fn()
    }
    const applyFavoriteState = jest.fn()
    const workflow = useFavoriteWorkflow({
      entityType: 'course',
      userStore,
      favoriteApi,
      applyFavoriteState
    })

    await workflow.toggleFavorite(item)

    expect(favoriteApi.saveFavorite).toHaveBeenCalledWith({ entityType: 'course', entityId: 2 })
    expect(favoriteApi.removeFavorite).not.toHaveBeenCalled()
    expect(applyFavoriteState).toHaveBeenCalledWith(2, true)
    expect(workflow.favoriteError.value).toBe('')
    expect(workflow.isUpdatingFavorite(2)).toBe(false)
  })

  it('removes a saved favorite through the public favorite interface', async () => {
    const item = { id: 4, has_favorite: true }
    const favoriteApi = {
      saveFavorite: jest.fn(),
      removeFavorite: jest.fn(async () => null)
    }
    const applyFavoriteState = jest.fn()
    const workflow = useFavoriteWorkflow({
      entityType: 'tutor',
      userStore: { isStudent: true },
      favoriteApi,
      applyFavoriteState
    })

    await workflow.toggleFavorite(item)

    expect(favoriteApi.removeFavorite).toHaveBeenCalledWith({ entityType: 'tutor', entityId: 4 })
    expect(favoriteApi.saveFavorite).not.toHaveBeenCalled()
    expect(applyFavoriteState).toHaveBeenCalledWith(4, false)
  })

  it('rejects favorite changes for non-students before calling the API', async () => {
    const favoriteApi = {
      saveFavorite: jest.fn(),
      removeFavorite: jest.fn()
    }
    const applyFavoriteState = jest.fn()
    const workflow = useFavoriteWorkflow({
      entityType: 'course',
      userStore: { isStudent: false },
      favoriteApi,
      applyFavoriteState
    })

    const changed = await workflow.toggleFavorite({ id: 2, has_favorite: false })

    expect(changed).toBe(false)
    expect(favoriteApi.saveFavorite).not.toHaveBeenCalled()
    expect(favoriteApi.removeFavorite).not.toHaveBeenCalled()
    expect(applyFavoriteState).not.toHaveBeenCalled()
  })

  it('dedupes duplicate clicks while a favorite request is in flight', async () => {
    let resolveRequest
    const favoriteApi = {
      saveFavorite: jest.fn(() => new Promise((resolve) => {
        resolveRequest = resolve
      })),
      removeFavorite: jest.fn()
    }
    const applyFavoriteState = jest.fn()
    const workflow = useFavoriteWorkflow({
      entityType: 'course',
      userStore: { isStudent: true },
      favoriteApi,
      applyFavoriteState
    })
    const item = { id: 2, has_favorite: false }

    const firstToggle = workflow.toggleFavorite(item)
    const secondToggle = workflow.toggleFavorite(item)

    expect(secondToggle).resolves.toBe(false)
    expect(favoriteApi.saveFavorite).toHaveBeenCalledTimes(1)

    resolveRequest({})
    await firstToggle
    await secondToggle

    expect(applyFavoriteState).toHaveBeenCalledTimes(1)
    expect(workflow.isUpdatingFavorite(2)).toBe(false)
  })

  it('preserves local favorite state when the request fails', async () => {
    const favoriteApi = {
      saveFavorite: jest.fn(async () => {
        throw new Error('Nope')
      }),
      removeFavorite: jest.fn()
    }
    const applyFavoriteState = jest.fn()
    const workflow = useFavoriteWorkflow({
      entityType: 'course',
      userStore: { isStudent: true },
      favoriteApi,
      applyFavoriteState
    })

    const changed = await workflow.toggleFavorite({ id: 2, has_favorite: false })

    expect(changed).toBe(false)
    expect(applyFavoriteState).not.toHaveBeenCalled()
    expect(workflow.favoriteError.value).toBe('Favorite could not be updated. Please try again.')
  })

  it('lets the dashboard remove a saved card without reloading the page', async () => {
    const favoriteCourses = [
      { id: 2, title: 'Databases', has_favorite: true },
      { id: 3, title: 'Networks', has_favorite: true }
    ]
    const favoriteApi = {
      saveFavorite: jest.fn(),
      removeFavorite: jest.fn(async () => null)
    }
    const workflow = useFavoriteWorkflow({
      entityType: 'course',
      userStore: { isStudent: true },
      favoriteApi,
      applyFavoriteState: (courseId, hasFavorite) => {
        if (!hasFavorite) {
          const index = favoriteCourses.findIndex((course) => course.id === courseId)
          favoriteCourses.splice(index, 1)
        }
      }
    })

    await workflow.toggleFavorite(favoriteCourses[0])

    expect(favoriteCourses).toEqual([
      { id: 3, title: 'Networks', has_favorite: true }
    ])
    expect(favoriteApi.removeFavorite).toHaveBeenCalledWith({ entityType: 'course', entityId: 2 })
  })
})
