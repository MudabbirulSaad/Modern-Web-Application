const makeDirectoryUrl = (basePath, department) => (
  `${basePath}?department=${encodeURIComponent(department)}`
)

const readCourseTutorIds = (course) => String(course.tutor_ids || '')
  .split(',')
  .map((tutorId) => tutorId.trim())
  .filter(Boolean)

const addCourse = (summariesByName, course) => {
  const name = typeof course.department === 'string' ? course.department.trim() : ''

  if (!name) {
    return
  }

  if (!summariesByName.has(name)) {
    summariesByName.set(name, {
      name,
      courseCount: 0,
      tutorCount: 0,
      tutorIds: new Set(),
      courseDirectoryUrl: makeDirectoryUrl('/courses', name),
      tutorDirectoryUrl: makeDirectoryUrl('/tutors', name)
    })
  }

  const summary = summariesByName.get(name)
  summary.courseCount += 1
  readCourseTutorIds(course).forEach((tutorId) => summary.tutorIds.add(tutorId))
}

export const buildDepartmentSummaries = ({ courses = [] } = {}) => {
  const summariesByName = new Map()

  courses.forEach((course) => addCourse(summariesByName, course))

  return [...summariesByName.values()]
    .map(({ tutorIds, ...summary }) => ({
      ...summary,
      tutorCount: tutorIds.size
    }))
    .sort((first, second) => (
      first.name.localeCompare(second.name)
    ))
}
