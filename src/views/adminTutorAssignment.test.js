import {
  addTutorAssignment,
  countTutorAssignmentMatches,
  findSelectedTutors,
  findTutorAssignmentResults,
  removeTutorAssignment
} from './adminTutorAssignment.js'

const tutors = [
  { id: 1, name: 'Dr Maya Chen', department: 'Computer Science' },
  { id: 2, name: 'Prof Liam Patel', department: 'Information Systems' },
  { id: 3, name: 'Dr Zoe Nguyen', department: 'Computer Science' },
  { id: 4, name: 'Avery Brooks', department: 'Design' }
]

describe('admin tutor assignment helpers', () => {
  it('searches available tutors by name or department while excluding selected tutors', () => {
    expect(findTutorAssignmentResults(tutors, [1], 'computer')).toEqual([
      { id: 3, name: 'Dr Zoe Nguyen', department: 'Computer Science' }
    ])

    expect(findTutorAssignmentResults(tutors, [], 'liam')).toEqual([
      { id: 2, name: 'Prof Liam Patel', department: 'Information Systems' }
    ])
  })

  it('adds and removes selected tutors without duplicating tutor IDs', () => {
    expect(addTutorAssignment([1, 2], 2)).toEqual([1, 2])
    expect(addTutorAssignment([1, 2], 3)).toEqual([1, 2, 3])
    expect(removeTutorAssignment([1, 2, 3], 2)).toEqual([1, 3])
  })

  it('resolves selected tutor rows and counts hidden matches for many-result searches', () => {
    expect(findSelectedTutors(tutors, [3, 1, 3])).toEqual([
      { id: 3, name: 'Dr Zoe Nguyen', department: 'Computer Science' },
      { id: 1, name: 'Dr Maya Chen', department: 'Computer Science' }
    ])

    expect(findTutorAssignmentResults(tutors, [], 'dr', 1)).toEqual([
      { id: 1, name: 'Dr Maya Chen', department: 'Computer Science' }
    ])
    expect(countTutorAssignmentMatches(tutors, [], 'dr')).toBe(2)
  })
})
