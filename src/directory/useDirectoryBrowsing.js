import { computed, ref, watch } from 'vue'

export const DEFAULT_DIRECTORY_SORT_OPTIONS = [
  { value: 'best-match', label: 'Best Match' },
  { value: 'recently-active', label: 'Recently Active' },
  { value: 'alphabetical', label: 'Alphabetical' }
]

export const useDirectoryBrowsing = ({
  endpoint,
  pageLimit,
  fetcher = fetch,
  errorMessage,
  debounceMs = 300,
  initialDepartment = ''
}) => {
  const items = ref([])
  const loading = ref(true)
  const error = ref('')
  const searchQuery = ref('')
  const departmentFilter = ref(typeof initialDepartment === 'string' ? initialDepartment : '')
  const sortOrder = ref('best-match')
  const availableDepartments = ref([])
  const currentPage = ref(1)
  const totalItems = ref(0)
  let searchTimeout = null

  const hasItems = computed(() => items.value.length > 0)
  const hasActiveFilters = computed(() => Boolean(searchQuery.value.trim() || departmentFilter.value))

  const buildUrl = () => {
    const params = new URLSearchParams()
    const search = searchQuery.value.trim()

    if (search) {
      params.set('search', search)
    }

    if (departmentFilter.value) {
      params.set('department', departmentFilter.value)
    }

    params.set('page', String(currentPage.value))
    params.set('limit', String(pageLimit))
    params.set('sort', sortOrder.value)

    const queryString = params.toString()
    return `${endpoint}${queryString ? `?${queryString}` : ''}`
  }

  const fetchItems = async () => {
    loading.value = true
    error.value = ''

    try {
      const response = await fetcher(buildUrl(), {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(errorMessage)
      }

      const payload = await response.json()
      items.value = payload.data || []
      totalItems.value = Number(payload.total || 0)
      availableDepartments.value = Array.isArray(payload.metadata?.departments)
        ? payload.metadata.departments
        : []
    } catch (err) {
      error.value = errorMessage
    } finally {
      loading.value = false
    }
  }

  const scheduleFetch = () => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(fetchItems, debounceMs)
  }

  const stopWatching = watch([searchQuery, departmentFilter, sortOrder], () => {
    currentPage.value = 1
    scheduleFetch()
  })

  const clearFilters = () => {
    searchQuery.value = ''
    departmentFilter.value = ''
  }

  const setPage = (pageNumber) => {
    currentPage.value = pageNumber
    return fetchItems()
  }

  const applyFavoriteState = (itemId, hasFavorite) => {
    items.value = items.value.map((item) => (
      item.id === itemId ? { ...item, has_favorite: hasFavorite } : item
    ))
  }

  const dispose = () => {
    clearTimeout(searchTimeout)
    stopWatching()
  }

  return {
    items,
    loading,
    error,
    searchQuery,
    departmentFilter,
    sortOrder,
    availableDepartments,
    currentPage,
    totalItems,
    hasItems,
    hasActiveFilters,
    fetchItems,
    clearFilters,
    setPage,
    applyFavoriteState,
    dispose
  }
}
