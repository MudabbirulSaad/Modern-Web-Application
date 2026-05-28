const parseAdminResponse = async (response, fallbackMessage) => {
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.message || fallbackMessage)
  }

  return payload.data || null
}

const jsonRequest = ({ fetcher, url, method, body, fallbackMessage }) => fetcher(url, {
  method,
  headers: {
    'Content-Type': 'application/json'
  },
  credentials: 'include',
  body: JSON.stringify(body)
}).then((response) => parseAdminResponse(response, fallbackMessage))

const listTutors = async ({ fetcher = fetch } = {}) => {
  const response = await fetcher('/api/tutors')

  return parseAdminResponse(response, 'Unable to load tutors')
}

const listCourses = async ({ fetcher = fetch } = {}) => {
  const response = await fetcher('/api/courses')

  return parseAdminResponse(response, 'Unable to load courses')
}

const listUsers = async ({ fetcher = fetch } = {}) => {
  const response = await fetcher('/api/admin/users', {
    credentials: 'include'
  })

  return parseAdminResponse(response, 'Unable to load users')
}

const updateUserRole = ({ userId, role, fetcher = fetch }) => jsonRequest({
  fetcher,
  url: `/api/admin/users/${userId}/role`,
  method: 'PATCH',
  body: { role },
  fallbackMessage: 'Unable to update user role'
})

const fetchCourse = async ({ courseId, fetcher = fetch }) => {
  const response = await fetcher(`/api/courses/${courseId}`)

  return parseAdminResponse(response, 'Unable to load course details')
}

const createTutor = ({ name, department, bio, fetcher = fetch }) => jsonRequest({
  fetcher,
  url: '/api/tutors',
  method: 'POST',
  body: { name, department, bio },
  fallbackMessage: 'Unable to save tutor'
})

const updateTutor = ({ tutorId, name, department, bio, fetcher = fetch }) => jsonRequest({
  fetcher,
  url: `/api/tutors/${tutorId}`,
  method: 'PUT',
  body: { name, department, bio },
  fallbackMessage: 'Unable to save tutor'
})

const deleteTutor = async ({ tutorId, fetcher = fetch }) => {
  const response = await fetcher(`/api/tutors/${tutorId}`, {
    method: 'DELETE',
    credentials: 'include'
  })

  return parseAdminResponse(response, 'Unable to delete tutor')
}

const createCourse = ({ title, department, description, tutorIds, fetcher = fetch }) => jsonRequest({
  fetcher,
  url: '/api/courses',
  method: 'POST',
  body: { title, department, description, tutorIds },
  fallbackMessage: 'Unable to save course'
})

const updateCourse = ({ courseId, title, department, description, tutorIds, fetcher = fetch }) => jsonRequest({
  fetcher,
  url: `/api/courses/${courseId}`,
  method: 'PUT',
  body: { title, department, description, tutorIds },
  fallbackMessage: 'Unable to save course'
})

const deleteCourse = async ({ courseId, fetcher = fetch }) => {
  const response = await fetcher(`/api/courses/${courseId}`, {
    method: 'DELETE',
    credentials: 'include'
  })

  return parseAdminResponse(response, 'Unable to delete course')
}

export const adminApi = {
  listTutors,
  listCourses,
  listUsers,
  updateUserRole,
  fetchCourse,
  createTutor,
  updateTutor,
  deleteTutor,
  createCourse,
  updateCourse,
  deleteCourse
}

export {
  listTutors,
  listCourses,
  listUsers,
  updateUserRole,
  fetchCourse,
  createTutor,
  updateTutor,
  deleteTutor,
  createCourse,
  updateCourse,
  deleteCourse
}
