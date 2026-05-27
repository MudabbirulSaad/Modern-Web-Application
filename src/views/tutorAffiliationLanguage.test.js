import { readFileSync } from 'node:fs'

const readView = (fileName) => readFileSync(new URL(`./${fileName}`, import.meta.url), 'utf8')

describe('tutor affiliation language', () => {
  it('presents tutor record department values as staff affiliation in tutor-facing views', () => {
    const tutorList = readView('TutorList.vue')
    const tutorDetail = readView('TutorDetail.vue')

    expect(tutorList).toContain('Staff affiliation')
    expect(tutorDetail).toContain('Academic Unit')
    expect(tutorList).not.toContain('Find tutors by department')
  })

  it('explains tutor staff affiliation in admin tutor management copy', () => {
    const adminDashboard = readView('AdminDashboard.vue')

    expect(adminDashboard).toContain('Staff affiliation or academic unit')
    expect(adminDashboard).toContain('This is shown on tutor profiles and is separate from Course Department discovery.')
    expect(adminDashboard).toContain('Staff affiliation: {{ tutor.department }}')
    expect(adminDashboard).toContain('placeholder="Search by name or staff affiliation"')
  })
})
