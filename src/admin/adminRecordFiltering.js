const matchesSearch = (record, fields, searchTerm) => {
  const query = String(searchTerm || '').trim().toLowerCase()

  if (!query) {
    return true
  }

  return fields.some((field) => String(record[field] || '').toLowerCase().includes(query))
}

export const filterAdminCourseRecords = (courses, searchTerm) => courses.filter((course) => matchesSearch(course, [
  'title',
  'department'
], searchTerm))

export const filterAdminTutorRecords = (tutors, searchTerm) => tutors.filter((tutor) => matchesSearch(tutor, [
  'name',
  'department'
], searchTerm))

export const filterAdminUserRecords = (users, searchTerm) => users.filter((user) => matchesSearch(user, [
  'username',
  'email'
], searchTerm))

export const summarizeVisibleAdminRecords = (visibleRecords, allRecords) => (
  `Showing ${visibleRecords.length} of ${allRecords.length} records`
)
