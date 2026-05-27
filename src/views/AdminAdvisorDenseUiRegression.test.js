import { readFileSync } from 'node:fs'
import { describe, expect, it } from '@jest/globals'

const adminDashboard = readFileSync(new URL('./AdminDashboard.vue', import.meta.url), 'utf8')
const advisorView = readFileSync(new URL('./AdvisorView.vue', import.meta.url), 'utf8')

function getStyleRule(source, selector) {
  const escapedSelector = selector.replaceAll('.', '\\.')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] || ''
}

describe('Admin and Advisor dense UI regressions', () => {
  it('locks Advisor recommendations to compact single-column records instead of the old two-column card grid', () => {
    expect(advisorView).toContain('class="advisor-recommendation-list"')
    expect(advisorView).toContain('class="advisor-recommendation-record"')
    expect(getStyleRule(advisorView, '.advisor-recommendation-list')).not.toContain('grid-template-columns')
    expect(advisorView).not.toMatch(/col-12\s+col-lg-6/)
    expect(advisorView).not.toMatch(/v-for="card in cards"[\s\S]{0,240}<BaseCard(?![\s\S]{0,80}:stretch="false")/)
  })

  it('locks Admin Course and Tutor records to compact rows with search counts instead of tables', () => {
    expect(adminDashboard).toContain('id="course-record-search"')
    expect(adminDashboard).toContain('id="tutor-record-search"')
    expect(adminDashboard).toContain('{{ courseRecordSummary }}')
    expect(adminDashboard).toContain('{{ tutorRecordSummary }}')
    expect(adminDashboard).toContain('aria-label="Course records"')
    expect(adminDashboard).toContain('aria-label="Tutor records"')
    expect(adminDashboard).not.toContain('<table')
    expect(adminDashboard).not.toContain('<thead')
    expect(adminDashboard).not.toContain('<tbody')
  })

  it('keeps Advisor compact record content and actions visible', () => {
    expect(advisorView).toContain('class="advisor-recommendation-record__meta"')
    expect(advisorView).toContain('class="advisor-recommendation-record__tutors"')
    expect(advisorView).toContain('class="advisor-recommendation-record__note')
    expect(advisorView).toContain('<FavoriteButton')
    expect(advisorView).toContain('View course')
  })

  it('prevents dense Admin and Advisor surfaces from causing horizontal overflow on mobile', () => {
    expect(getStyleRule(adminDashboard, '.admin-dashboard')).toContain('overflow-x: clip')
    expect(getStyleRule(advisorView, '.advisor-page')).toContain('overflow-x: clip')
  })

  it('allows compact record and recommendation action groups to wrap instead of overlapping', () => {
    expect(getStyleRule(adminDashboard, '.admin-management-row__actions')).toContain('flex-wrap: wrap')
    expect(getStyleRule(advisorView, '.advisor-recommendation-record__actions')).toContain('flex-wrap: wrap')
  })
})
