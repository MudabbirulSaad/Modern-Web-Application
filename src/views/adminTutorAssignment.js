const normalizeSearch = (value) => String(value || '').trim().toLowerCase()

const readTutorId = (tutor) => Number(tutor?.id)

const readValidTutorIds = (tutors) => new Set(
  (Array.isArray(tutors) ? tutors : [])
    .map((tutor) => readTutorId(tutor))
    .filter((id) => Number.isInteger(id) && id > 0)
)

const normalizeTutorIds = (selectedTutorIds, tutors = null) => {
  const validTutorIds = Array.isArray(tutors) && tutors.length > 0 ? readValidTutorIds(tutors) : null

  return [...new Set(
    (Array.isArray(selectedTutorIds) ? selectedTutorIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
      .filter((id) => !validTutorIds || validTutorIds.has(id))
  )]
}

export const findTutorAssignmentResults = (tutors, selectedTutorIds, searchTerm, limit = 8) => {
  const selectedIds = new Set(normalizeTutorIds(selectedTutorIds))
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
  const selectedIds = normalizeTutorIds(selectedTutorIds)

  return selectedIds
    .map((id) => tutorById.get(id))
    .filter(Boolean)
}

export const addTutorAssignment = (selectedTutorIds, tutorId) => {
  const nextIds = normalizeTutorIds(selectedTutorIds)
  const nextTutorId = Number(tutorId)

  if (!Number.isInteger(nextTutorId) || nextTutorId <= 0 || nextIds.includes(nextTutorId)) {
    return nextIds
  }

  return [...nextIds, nextTutorId]
}

export const removeTutorAssignment = (selectedTutorIds, tutorId) => {
  const removedTutorId = Number(tutorId)

  return normalizeTutorIds(selectedTutorIds)
    .filter((id) => id !== removedTutorId)
}

export const createTutorAssignmentState = ({
  tutors,
  selectedTutorIds,
  searchTerm = '',
  limit = 8
}) => {
  const selectedIds = normalizeTutorIds(selectedTutorIds, tutors)

  return {
    selectedIds,
    visibleSelectedTutors: findSelectedTutors(tutors, selectedIds),
    searchResults: findTutorAssignmentResults(tutors, selectedIds, searchTerm, limit),
    searchResultCount: countTutorAssignmentMatches(tutors, selectedIds, searchTerm),
    payloadTutorIds: selectedIds,
    add: (tutorId) => normalizeTutorIds(addTutorAssignment(selectedIds, tutorId), tutors),
    remove: (tutorId) => removeTutorAssignment(selectedIds, tutorId)
  }
}
