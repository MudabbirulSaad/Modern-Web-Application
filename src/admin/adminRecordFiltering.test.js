import { describe, expect, it } from '@jest/globals'
import {
  filterAdminCourseRecords,
  filterAdminTutorRecords,
  summarizeVisibleAdminRecords
} from './adminRecordFiltering.js'

const courses = [
  {
    id: 1,
    title: 'COS10004 Computer Systems',
    department: 'Computer Science',
    description: 'Core systems unit.',
    tutor_names: 'Associate Professor Caslon Chua, Professor Jun Zhang'
  },
  {
    id: 2,
    title: 'INF20016 Database Analysis',
    department: 'Information Systems',
    description: 'Data modelling and SQL.',
    tutor_names: 'Dr Maya Chen'
  }
]

const tutors = [
  {
    id: 1,
    name: 'Associate Professor Ali Yavari',
    department: 'Computing Technologies',
    bio: 'Director, 6G Research and Innovation Laboratory.'
  },
  {
    id: 2,
    name: 'Dr Maya Chen',
    department: 'Information Systems',
    bio: 'Teaches database design.'
  }
]

describe('admin record filtering', () => {
  it('filters Course records by title or department without matching description or Tutor names', () => {
    expect(filterAdminCourseRecords(courses, 'computer systems')).toEqual([courses[0]])
    expect(filterAdminCourseRecords(courses, 'information systems')).toEqual([courses[1]])
    expect(filterAdminCourseRecords(courses, 'jun zhang')).toEqual([])
    expect(filterAdminCourseRecords(courses, 'modelling')).toEqual([])
    expect(summarizeVisibleAdminRecords([courses[0]], courses)).toBe('Showing 1 of 2 records')
  })

  it('filters Tutor records by name or staff affiliation without matching bio text', () => {
    expect(filterAdminTutorRecords(tutors, 'ali')).toEqual([tutors[0]])
    expect(filterAdminTutorRecords(tutors, 'computing technologies')).toEqual([tutors[0]])
    expect(filterAdminTutorRecords(tutors, 'database')).toEqual([])
    expect(filterAdminTutorRecords(tutors, '')).toEqual(tutors)
  })
})
