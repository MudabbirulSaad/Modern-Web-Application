import { jest } from '@jest/globals'
import { ref } from 'vue'
import { useFavoriteWorkflow } from '../favorites/useFavoriteWorkflow.js'
import { applyAdvisorFavoriteState } from './advisorPresentation.js'

describe('advisor favorite workflow', () => {
  it('favorites a recommended Course through the existing Favorite workflow', async () => {
    const advisorResult = ref({
      recommendations: [
        {
          course: {
            id: 7,
            title: 'Machine Learning',
            department: 'Artificial Intelligence',
            description: 'Model practical prediction systems.',
            has_favorite: false
          },
          evidence: []
        }
      ]
    })
    const favoriteApi = {
      saveFavorite: jest.fn(async () => ({ id: 13, entity_type: 'course', entity_id: 7 })),
      removeFavorite: jest.fn()
    }
    const workflow = useFavoriteWorkflow({
      entityType: 'course',
      userStore: { isStudent: true },
      favoriteApi,
      applyFavoriteState: (courseId, hasFavorite) => {
        applyAdvisorFavoriteState(advisorResult, courseId, hasFavorite)
      }
    })

    const changed = await workflow.toggleFavorite(advisorResult.value.recommendations[0].course)

    expect(changed).toBe(true)
    expect(favoriteApi.saveFavorite).toHaveBeenCalledWith({ entityType: 'course', entityId: 7 })
    expect(favoriteApi.removeFavorite).not.toHaveBeenCalled()
    expect(advisorResult.value.recommendations[0].course.has_favorite).toBe(true)
    expect(workflow.favoriteError.value).toBe('')
  })
})
