const makeDirectoryUrl = (basePath, department) => (
  `${basePath}?department=${encodeURIComponent(department)}`
)

const addRecord = (summariesByName, record, countKey) => {
  const name = typeof record.department === 'string' ? record.department.trim() : ''

  if (!name) {
    return
  }

  if (!summariesByName.has(name)) {
    summariesByName.set(name, {
      name,
      courseCount: 0,
      tutorCount: 0,
      courseDirectoryUrl: makeDirectoryUrl('/courses', name),
      tutorDirectoryUrl: makeDirectoryUrl('/tutors', name)
    })
  }

  const summary = summariesByName.get(name)
  summary[countKey] += 1
}

export const buildDepartmentSummaries = ({ courses = [], tutors = [] } = {}) => {
  const summariesByName = new Map()

  courses.forEach((course) => addRecord(summariesByName, course, 'courseCount'))
  tutors.forEach((tutor) => addRecord(summariesByName, tutor, 'tutorCount'))

  return [...summariesByName.values()].sort((first, second) => (
    first.name.localeCompare(second.name)
  ))
}
