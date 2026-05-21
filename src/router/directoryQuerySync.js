const DEFAULT_SORT = 'best-match'
const DEFAULT_PAGE = 1

const firstQueryValue = (value) => {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

const cleanStringQueryValue = (value) => {
  const firstValue = firstQueryValue(value)

  if (typeof firstValue !== 'string') {
    return ''
  }

  return firstValue
}

const parsePositivePage = (value) => {
  const numberValue = Number(firstQueryValue(value))

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return DEFAULT_PAGE
  }

  return numberValue
}

const getAllowedSortValues = (sortOptions) => new Set(
  sortOptions.map((option) => option.value)
)

export const parseDirectoryRouteQuery = (query = {}, sortOptions = []) => {
  const sort = cleanStringQueryValue(query.sort)
  const allowedSortValues = getAllowedSortValues(sortOptions)

  return {
    search: cleanStringQueryValue(query.search),
    department: cleanStringQueryValue(query.department),
    sort: allowedSortValues.has(sort) ? sort : DEFAULT_SORT,
    page: parsePositivePage(query.page)
  }
}

export const createDirectoryRouteQuery = (storeState, sortOptions = []) => {
  const allowedSortValues = getAllowedSortValues(sortOptions)
  const query = {}
  const search = String(storeState.searchQuery || '')
  const department = String(storeState.departmentFilter || '')
  const sort = String(storeState.sortOrder || DEFAULT_SORT)
  const page = Number(storeState.currentPage || DEFAULT_PAGE)

  if (search) {
    query.search = search
  }

  if (department) {
    query.department = department
  }

  if (sort !== DEFAULT_SORT && allowedSortValues.has(sort)) {
    query.sort = sort
  }

  if (Number.isInteger(page) && page > DEFAULT_PAGE) {
    query.page = String(page)
  }

  return query
}

export const areDirectoryRouteQueriesEqual = (left = {}, right = {}) => {
  const leftEntries = Object.entries(left)
    .map(([key, value]) => [key, String(firstQueryValue(value) || '')])
    .filter(([, value]) => value)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  const rightEntries = Object.entries(right)
    .map(([key, value]) => [key, String(firstQueryValue(value) || '')])
    .filter(([, value]) => value)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))

  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries)
}
