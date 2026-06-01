const BASE_URL = import.meta.env?.BASE_URL || '/'
const API_PREFIX = `${BASE_URL.replace(/\/$/, '')}/api`

export const apiUrl = (path) => {
  if (path.startsWith(API_PREFIX)) {
    return path
  }

  const apiPath = path.startsWith('/api') ? path.slice(4) : path
  return `${API_PREFIX}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`
}
