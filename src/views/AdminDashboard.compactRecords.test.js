import { readFileSync } from 'node:fs'
import { describe, expect, it } from '@jest/globals'

const adminDashboard = readFileSync(new URL('./AdminDashboard.vue', import.meta.url), 'utf8')

describe('Admin compact record management layout', () => {
  it('renders Course and Tutor records as compact management rows with search and visible counts', () => {
    expect(adminDashboard).toContain('class="admin-record-toolbar"')
    expect(adminDashboard).toContain('id="course-record-search"')
    expect(adminDashboard).toContain('id="tutor-record-search"')
    expect(adminDashboard).toContain('filteredCourses.length')
    expect(adminDashboard).toContain('filteredTutors.length')
    expect(adminDashboard).toContain('class="admin-record-list"')
    expect(adminDashboard).toContain('class="admin-management-row')
    expect(adminDashboard).not.toContain('<table class="table align-middle mb-0">')
    expect(adminDashboard).not.toContain('<thead>')
  })

  it('keeps Edit and Delete actions wired from compact Course and Tutor rows', () => {
    expect(adminDashboard).toContain('aria-label="Course record actions"')
    expect(adminDashboard).toContain('@click="editCourse(course)"')
    expect(adminDashboard).toContain('@click="deleteCourse(course)"')
    expect(adminDashboard).toContain('aria-label="Tutor record actions"')
    expect(adminDashboard).toContain('@click="editTutor(tutor)"')
    expect(adminDashboard).toContain('@click="deleteTutor(tutor)"')
    expect(adminDashboard).toContain('deletingCourseId === course.id')
    expect(adminDashboard).toContain('deletingTutorId === tutor.id')
  })

  it('preserves staff affiliation wording and Course-Tutor assignment UI in the compact layout', () => {
    expect(adminDashboard).toContain('Staff affiliation: {{ tutor.department }}')
    expect(adminDashboard).toContain('Staff affiliation or academic unit')
    expect(adminDashboard).toContain('Search by tutor name or staff affiliation')
    expect(adminDashboard).toContain('class="selected-tutor-chip"')
    expect(adminDashboard).toContain('@click="addCourseTutor(tutor)"')
    expect(adminDashboard).toContain('@click="removeCourseTutor(tutor)"')
  })

  it('uses sticky desktop forms and clamps long compact record content without mobile sticky rules', () => {
    const mobileBlock = adminDashboard.match(/@media \(max-width: 575\.98px\) \{[\s\S]*?\n\}/)?.[0] || ''

    expect(adminDashboard).toMatch(/@media \(min-width: 768px\)[\s\S]*\.admin-form-card[\s\S]*position: sticky/)
    expect(adminDashboard).toContain('class="admin-form-card"')
    expect(adminDashboard).toContain('class="small text-body-secondary mb-0 record-summary admin-line-clamp"')
    expect(adminDashboard).toContain('-webkit-line-clamp: 2')
    expect(mobileBlock).not.toContain('position: sticky')
  })
})
