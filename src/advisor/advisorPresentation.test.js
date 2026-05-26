import { describe, expect, it } from '@jest/globals'
import {
  applyAdvisorFavoriteState,
  buildAdvisorPersonalizationNotice,
  buildAdvisorRecommendationCards,
  buildAdvisorStatusNotice
} from './advisorPresentation.js'

describe('advisor recommendation presentation', () => {
  it('builds Course-first cards with evidence, supporting Tutor links, and limitations', () => {
    const cards = buildAdvisorRecommendationCards([
      {
        course: {
          id: 7,
          title: 'Machine Learning',
          department: 'Artificial Intelligence',
          description: 'Model practical prediction systems.'
        },
        reason: 'Strong match for AI and practical learning.',
        evidence: ['Department match', 'Matches AI focus', 'Linked tutors available'],
        tutors: [
          { id: 3, name: 'Dr Aisha Rahman', department: 'Computing Technologies' }
        ],
        limitations: ['Limited course review data is available.']
      }
    ])

    expect(cards).toEqual([
      {
        key: 7,
        courseId: 7,
        courseTitle: 'Machine Learning',
        department: 'Artificial Intelligence',
        description: 'Model practical prediction systems.',
        hasFavorite: false,
        favoriteItem: {
          id: 7,
          has_favorite: false
        },
        reason: 'Strong match for AI and practical learning.',
        evidence: ['Department match', 'Matches AI focus', 'Linked tutors available'],
        tutors: [
          {
            id: 3,
            name: 'Dr Aisha Rahman',
            department: 'Computing Technologies',
            to: { name: 'tutor-detail', params: { id: 3 } }
          }
        ],
        limitations: ['Limited course review data is available.'],
        courseTo: { name: 'course-detail', params: { id: 7 } }
      }
    ])
  })

  it('labels local fallback and weak-match notices clearly', () => {
    expect(buildAdvisorStatusNotice({
      mode: 'local',
      limitations: [
        'Generated from local matching only.',
        'No exact Department match was found; showing closest matching Courses.'
      ]
    })).toEqual({
      tone: 'warning',
      title: 'Local recommendation mode',
      messages: [
        'Generated from local matching only.',
        'No exact Department match was found; showing closest matching Courses.'
      ]
    })
  })

  it('communicates when Student personalization is active without blocking Guests', () => {
    expect(buildAdvisorPersonalizationNotice({
      personalization: {
        active: true,
        signals: ['Favorites', 'Your review activity']
      }
    })).toEqual({
      tone: 'info',
      title: 'Student personalization active',
      messages: ['Using your Favorites and review activity as private recommendation signals.']
    })

    expect(buildAdvisorPersonalizationNotice({
      personalization: {
        active: false,
        signals: []
      }
    })).toEqual({
      tone: 'secondary',
      title: 'Guest recommendations',
      messages: ['Sign in as a Student to include your Favorites and review activity.']
    })
  })

  it('applies existing Favorite workflow state to Advisor Course recommendations', () => {
    const resultRef = {
      value: {
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
          },
          {
            course: {
              id: 8,
              title: 'Data Visualisation',
              department: 'Data Science',
              description: 'Explain data clearly.',
              has_favorite: false
            },
            evidence: []
          }
        ]
      }
    }

    applyAdvisorFavoriteState(resultRef, 7, true)

    expect(resultRef.value.recommendations[0].course.has_favorite).toBe(true)
    expect(resultRef.value.recommendations[1].course.has_favorite).toBe(false)
  })
})
