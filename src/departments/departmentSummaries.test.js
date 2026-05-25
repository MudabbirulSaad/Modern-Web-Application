import { buildDepartmentSummaries } from './departmentSummaries.js'

describe('department summaries', () => {
  it('groups courses and tutors by department with counts and directory links', () => {
    const summaries = buildDepartmentSummaries({
      courses: [
        { id: 1, title: 'Networks', department: 'Computer Science' },
        { id: 2, title: 'Typography', department: 'Design' },
        { id: 3, title: 'Cybersecurity', department: 'Computer Science' }
      ],
      tutors: [
        { id: 10, name: 'Dr Ada Lovelace', department: 'Computer Science' },
        { id: 11, name: 'Prof Max Bill', department: 'Design' },
        { id: 12, name: 'Dr Grace Hopper', department: 'Computer Science' },
        { id: 13, name: 'Dr Finance', department: 'Business' }
      ]
    })

    expect(summaries).toEqual([
      {
        name: 'Business',
        courseCount: 0,
        tutorCount: 1,
        courseDirectoryUrl: '/courses?department=Business',
        tutorDirectoryUrl: '/tutors?department=Business'
      },
      {
        name: 'Computer Science',
        courseCount: 2,
        tutorCount: 2,
        courseDirectoryUrl: '/courses?department=Computer%20Science',
        tutorDirectoryUrl: '/tutors?department=Computer%20Science'
      },
      {
        name: 'Design',
        courseCount: 1,
        tutorCount: 1,
        courseDirectoryUrl: '/courses?department=Design',
        tutorDirectoryUrl: '/tutors?department=Design'
      }
    ])
  })
})
