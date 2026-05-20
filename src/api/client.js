let unauthorizedHandler = null

export class ApiError extends Error {
  constructor(message, { status = 0, data = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export const configureApiClient = ({ onUnauthorized } = {}) => {
  unauthorizedHandler = typeof onUnauthorized === 'function' ? onUnauthorized : null
}

const hasJsonBody = (response) => {
  const contentType = response.headers?.get?.('content-type') || ''
  return contentType.includes('application/json')
}

const parseResponseBody = async (response) => {
  if (response.status === 204) {
    return null
  }

  if (!hasJsonBody(response)) {
    return null
  }

  try {
    return await response.json()
  } catch {
    return null
  }
}

export const apiRequest = async (url, options = {}) => {
  const headers = {
    ...(options.headers || {})
  }

  let response

  try {
    response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers
    })
  } catch {
    throw new ApiError('Network request failed', { status: 0 })
  }

  const payload = await parseResponseBody(response)

  if (!response.ok) {
    const message = payload?.message || 'Request failed'

    if (response.status === 401) {
      unauthorizedHandler?.()
    }

    throw new ApiError(message, {
      status: response.status,
      data: payload?.data ?? payload
    })
  }

  return payload?.data ?? payload
}
