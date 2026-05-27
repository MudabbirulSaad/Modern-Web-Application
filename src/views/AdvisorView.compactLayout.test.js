import { readFileSync } from 'node:fs'
import { describe, expect, it } from '@jest/globals'

const advisorView = readFileSync(new URL('./AdvisorView.vue', import.meta.url), 'utf8')

describe('Advisor compact recommendation layout', () => {
  it('renders recommendations as a compact single-column Course list, not a chatbot or two-column card grid', () => {
    expect(advisorView).toContain('class="advisor-recommendation-list"')
    expect(advisorView).toContain('class="advisor-recommendation-record')
    expect(advisorView).not.toMatch(/v-for="card in cards"[\s\S]{0,160}col-12 col-lg-6/)
    expect(advisorView).not.toMatch(/chatbot|chat bot|chat popup/i)
  })

  it('keeps Course actions, evidence, supporting Tutors, and limitations compact inside each record', () => {
    expect(advisorView).toContain('aria-label="Course recommendation actions"')
    expect(advisorView).toContain('class="advisor-recommendation-record__meta"')
    expect(advisorView).toContain('class="advisor-recommendation-record__tutors"')
    expect(advisorView).toContain('class="advisor-recommendation-record__note')
    expect(advisorView).toContain('View course')
    expect(advisorView).toContain('<FavoriteButton')
    expect(advisorView).not.toContain('class="alert alert-secondary py-2 small"')
  })

  it('makes the preference panel sticky only on wider viewports', () => {
    const mobileBlock = advisorView.match(/@media \(max-width: 575\.98px\) \{[\s\S]*?\n\}/)?.[0] || ''

    expect(advisorView).toMatch(/@media \(min-width: 768px\)[\s\S]*\.advisor-panel[\s\S]*position: sticky/)
    expect(mobileBlock).not.toContain('position: sticky')
  })

  it('keeps Advisor status and personalization notices compact above results', () => {
    expect(advisorView).toContain('class="advisor-notice')
    expect(advisorView).toContain('class="advisor-notice__messages')
    expect(advisorView).not.toContain('class="alert mb-4"')
  })
})
