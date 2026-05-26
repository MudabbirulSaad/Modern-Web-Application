import { jest } from '@jest/globals'
import { useAdvisorDiscovery } from './useAdvisorDiscovery.js'

const makeResponse = (data) => ({
  ok: true,
  json: async () => ({ data })
})

describe('advisor discovery workflow', () => {
  it('submits the five guided Advisor inputs to the backend recommendation endpoint', async () => {
    const fetcher = jest.fn(async () => makeResponse({
      mode: 'local',
      summary: 'Local Course recommendations for Artificial Intelligence.',
      limitations: ['Generated from local matching only.'],
      recommendations: []
    }))
    const advisor = useAdvisorDiscovery({ fetcher })

    advisor.preferences.interestArea.value = 'Artificial Intelligence'
    advisor.preferences.learningFocus.value = ['AI', 'Practical']
    advisor.preferences.recommendationGoal.value = 'Explore best matches'
    advisor.preferences.experienceConfidence.value = 'Some experience'
    advisor.preferences.personalGoal.value = 'I want applied AI with tutor support.'

    await advisor.submitPreferences()

    expect(fetcher).toHaveBeenCalledWith('/api/advisor/recommendations', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        interestArea: 'Artificial Intelligence',
        learningFocus: ['AI', 'Practical'],
        recommendationGoal: 'Explore best matches',
        experienceConfidence: 'Some experience',
        personalGoal: 'I want applied AI with tutor support.'
      })
    })
    expect(advisor.result.value.mode).toBe('local')
    expect(advisor.error.value).toBe('')
    expect(advisor.loading.value).toBe(false)
  })
})
