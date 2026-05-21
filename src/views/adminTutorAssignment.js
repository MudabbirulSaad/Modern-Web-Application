const normalizeSearch = (value) => String(value || '').trim().toLowerCase()

const readTutorId = (tutor) => Number(tutor?.id)

export const findTutorAssignmentResults = (tutors, selectedTutorIds, searchTerm, limit = 8) => {
  const selectedIds = new Set(
    (Array.isArray(selectedTutorIds) ? selectedTutorIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )
  const query = normalizeSearch(searchTerm)

  if (!query) {
    return []
  }

  return (Array.isArray(tutors) ? tutors : [])
    .filter((tutor) => !selectedIds.has(readTutorId(tutor)))
    .filter((tutor) => {
      const name = normalizeSearch(tutor?.name)
      const department = normalizeSearch(tutor?.department)

      return name.includes(query) || department.includes(query)
    })
    .slice(0, limit)
}

export const countTutorAssignmentMatches = (tutors, selectedTutorIds, searchTerm) => (
  findTutorAssignmentResults(tutors, selectedTutorIds, searchTerm, Number.POSITIVE_INFINITY).length
)

export const findSelectedTutors = (tutors, selectedTutorIds) => {
  const tutorById = new Map(
    (Array.isArray(tutors) ? tutors : [])
      .map((tutor) => [readTutorId(tutor), tutor])
      .filter(([id]) => Number.isInteger(id) && id > 0)
  )
  const selectedIds = [...new Set(
    (Array.isArray(selectedTutorIds) ? selectedTutorIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )]

  return selectedIds
    .map((id) => tutorById.get(id))
    .filter(Boolean)
}

export const addTutorAssignment = (selectedTutorIds, tutorId) => {
  const nextIds = (Array.isArray(selectedTutorIds) ? selectedTutorIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
  const nextTutorId = Number(tutorId)

  if (!Number.isInteger(nextTutorId) || nextTutorId <= 0 || nextIds.includes(nextTutorId)) {
    return nextIds
  }

  return [...nextIds, nextTutorId]
}

export const removeTutorAssignment = (selectedTutorIds, tutorId) => {
  const removedTutorId = Number(tutorId)

  return (Array.isArray(selectedTutorIds) ? selectedTutorIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0 && id !== removedTutorId)
}
