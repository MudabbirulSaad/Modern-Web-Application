import { jest } from '@jest/globals'
import { apiRequest, configureApiClient, ApiError } from './client.js'

beforeEach(() => {
  configureApiClient({ onUnauthorized: null })
  global.fetch = jest.fn()
})

describe('api client', () => {
  it('includes credentials and returns response data', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: jest.fn(() => 'application/json')
      },
      json: jest.fn(async () => ({ data: { id: 1 } }))
    })

    await expect(apiRequest('/api/example')).resolves.toEqual({ id: 1 })

    expect(global.fetch).toHaveBeenCalledWith('/api/example', {
      credentials: 'include',
      headers: {}
    })
  })

  it('throws a domain-friendly ApiError and invalidates session on 401', async () => {
    const onUnauthorized = jest.fn()
    configureApiClient({ onUnauthorized })
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: {
        get: jest.fn(() => 'application/json')
      },
      json: jest.fn(async () => ({ message: 'Please log in again' }))
    })

    await expect(apiRequest('/api/private')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Please log in again'
    })

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('normalizes network failures to ApiError', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(apiRequest('/api/unreachable')).rejects.toBeInstanceOf(ApiError)
    await expect(apiRequest('/api/unreachable')).rejects.toMatchObject({
      status: 0,
      message: 'Network request failed'
    })
  })
})
