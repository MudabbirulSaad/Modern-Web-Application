import { describe, expect, it } from '@jest/globals'
import { buildAdvisorRecommendationCards, buildAdvisorStatusNotice } from './advisorPresentation.js'

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
        courseTitle: 'Machine Learning',
        department: 'Artificial Intelligence',
        description: 'Model practical prediction systems.',
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
})
