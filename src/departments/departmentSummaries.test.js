import { buildDepartmentSummaries } from './departmentSummaries.js'

describe('department summaries', () => {
  it('creates department summaries from course departments only', () => {
    const summaries = buildDepartmentSummaries({
      courses: [
        { id: 1, title: 'Networks', department: 'Computer Science', tutor_ids: '' },
        { id: 2, title: 'Typography', department: 'Design', tutor_ids: '' },
        { id: 3, title: 'Cybersecurity', department: 'Computer Science', tutor_ids: '' }
      ],
      tutors: [
        { id: 10, name: 'Dr Ada Lovelace', department: 'Engineering' },
        { id: 12, name: 'Dr Grace Hopper', department: 'Computing' },
        { id: 13, name: 'Dr Finance', department: 'Business' }
      ]
    })

    expect(summaries).toEqual([
      {
        name: 'Computer Science',
        courseCount: 2,
        tutorCount: 0,
        courseDirectoryUrl: '/courses?department=Computer%20Science',
        tutorDirectoryUrl: '/tutors?department=Computer%20Science'
      },
      {
        name: 'Design',
        courseCount: 1,
        tutorCount: 0,
        courseDirectoryUrl: '/courses?department=Design',
        tutorDirectoryUrl: '/tutors?department=Design'
      }
    ])
  })

  it('counts distinct tutors assigned to courses in each department', () => {
    const summaries = buildDepartmentSummaries({
      courses: [
        { id: 1, title: 'Networks', department: 'Computer Science', tutor_ids: '10,12' },
        { id: 2, title: 'Cybersecurity', department: 'Computer Science', tutor_ids: '10' },
        { id: 3, title: 'Typography', department: 'Design', tutor_ids: '12,14' }
      ],
      tutors: [
        { id: 10, name: 'Dr Ada Lovelace', department: 'Engineering' },
        { id: 12, name: 'Dr Grace Hopper', department: 'Computing' },
        { id: 14, name: 'Prof Max Bill', department: 'Art and Design' }
      ]
    })

    expect(summaries).toEqual([
      expect.objectContaining({
        name: 'Computer Science',
        courseCount: 2,
        tutorCount: 2
      }),
      expect.objectContaining({
        name: 'Design',
        courseCount: 1,
        tutorCount: 2
      })
    ])
  })

  it('counts distinct Course-Tutor assignments without using Tutor staff affiliations as departments', () => {
    const summaries = buildDepartmentSummaries({
      courses: [
        { id: 1, title: 'Machine Learning Systems', department: 'Artificial Intelligence', tutor_ids: '10,12' },
        { id: 2, title: 'Intelligent Systems', department: 'Artificial Intelligence', tutor_ids: '10' },
        { id: 3, title: 'Financial Analytics', department: 'Business Analytics', tutor_ids: '14' }
      ],
      tutors: [
        { id: 10, name: 'Dr Aisha Rahman', department: 'Data Science Institute' },
        { id: 12, name: 'Prof Mina Okafor', department: 'Computing Technologies' },
        { id: 14, name: 'Dr Sam Lee', department: 'Artificial Intelligence' }
      ]
    })

    expect(summaries).toEqual([
      expect.objectContaining({
        name: 'Artificial Intelligence',
        courseCount: 2,
        tutorCount: 2,
        tutorDirectoryUrl: '/tutors?department=Artificial%20Intelligence'
      }),
      expect.objectContaining({
        name: 'Business Analytics',
        courseCount: 1,
        tutorCount: 1,
        tutorDirectoryUrl: '/tutors?department=Business%20Analytics'
      })
    ])
  })
})
