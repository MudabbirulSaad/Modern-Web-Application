import { computed, ref } from 'vue'
import { apiUrl } from '../api/url.js'
import { buildDepartmentSummaries } from './departmentSummaries.js'

const COURSE_DIRECTORY_URL = apiUrl('/api/courses?sort=alphabetical')
const TUTOR_DIRECTORY_URL = apiUrl('/api/tutors?sort=alphabetical')

const readDirectoryData = async (response) => {
  if (!response.ok) {
    throw new Error('Directory request failed')
  }

  const payload = await response.json()
  return Array.isArray(payload.data) ? payload.data : []
}

export const useDepartmentsDiscovery = ({
  fetcher = fetch,
  errorMessage = 'Departments are unavailable right now. Please try again shortly.'
} = {}) => {
  const departments = ref([])
  const loading = ref(true)
  const error = ref('')
  const searchQuery = ref('')

  const filteredDepartments = computed(() => {
    const search = searchQuery.value.trim().toLowerCase()

    if (!search) {
      return departments.value
    }

    return departments.value.filter((department) => (
      department.name.toLowerCase().includes(search)
    ))
  })

  const hasDepartments = computed(() => departments.value.length > 0)
  const hasVisibleDepartments = computed(() => filteredDepartments.value.length > 0)
  const emptyStateMessage = computed(() => {
    if (hasVisibleDepartments.value) {
      return ''
    }

    return hasDepartments.value
      ? 'No departments match your search.'
      : 'No departments are available yet.'
  })

  const fetchDepartments = async () => {
    loading.value = true
    error.value = ''

    try {
      const [courseResponse, tutorResponse] = await Promise.all([
        fetcher(COURSE_DIRECTORY_URL, { credentials: 'include' }),
        fetcher(TUTOR_DIRECTORY_URL, { credentials: 'include' })
      ])
      const [courses, tutors] = await Promise.all([
        readDirectoryData(courseResponse),
        readDirectoryData(tutorResponse)
      ])

      departments.value = buildDepartmentSummaries({ courses, tutors })
    } catch {
      error.value = errorMessage
    } finally {
      loading.value = false
    }
  }

  return {
    departments,
    loading,
    error,
    searchQuery,
    filteredDepartments,
    hasDepartments,
    hasVisibleDepartments,
    emptyStateMessage,
    fetchDepartments
  }
}
