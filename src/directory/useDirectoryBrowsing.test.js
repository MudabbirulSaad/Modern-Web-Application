import { jest } from '@jest/globals'
import { nextTick } from 'vue'
import { useDirectoryBrowsing } from './useDirectoryBrowsing.js'

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('directory browsing module', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('resets to page one and fetches the expected query when search changes', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ id: 1, title: 'Cybersecurity Fundamentals' }],
        total: 1,
        metadata: { departments: ['Computer Science'] }
      })
    }))
    const browsing = useDirectoryBrowsing({
      endpoint: '/api/courses',
      pageLimit: 6,
      fetcher,
      errorMessage: 'Courses are unavailable right now. Please try again shortly.'
    })

    browsing.currentPage.value = 3
    browsing.searchQuery.value = ' cyber '

    await nextTick()
    jest.advanceTimersByTime(300)
    await flushPromises()

    expect(browsing.currentPage.value).toBe(1)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/courses?search=cyber&page=1&limit=6&sort=best-match',
      { credentials: 'include' }
    )

    browsing.dispose()
  })

  it('fetches the selected page and exposes response metadata', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ id: 7, name: 'Dr Ada Lovelace' }],
        total: 14,
        metadata: { departments: ['Computer Science', 'Design'] }
      })
    }))
    const browsing = useDirectoryBrowsing({
      endpoint: '/api/tutors',
      pageLimit: 6,
      fetcher,
      errorMessage: 'Tutors are unavailable right now. Please try again shortly.'
    })

    browsing.departmentFilter.value = 'Computer Science'
    browsing.sortOrder.value = 'alphabetical'
    await browsing.setPage(2)

    expect(fetcher).toHaveBeenCalledWith(
      '/api/tutors?department=Computer+Science&page=2&limit=6&sort=alphabetical',
      { credentials: 'include' }
    )
    expect(browsing.items.value).toEqual([{ id: 7, name: 'Dr Ada Lovelace' }])
    expect(browsing.totalItems.value).toBe(14)
    expect(browsing.availableDepartments.value).toEqual(['Computer Science', 'Design'])

    browsing.dispose()
  })

  it('exposes the configured error message when a directory request fails', async () => {
    const fetcher = jest.fn(async () => ({
      ok: false,
      json: async () => ({ message: 'nope' })
    }))
    const browsing = useDirectoryBrowsing({
      endpoint: '/api/tutors',
      pageLimit: 6,
      fetcher,
      errorMessage: 'Tutors are unavailable right now. Please try again shortly.'
    })

    await browsing.fetchItems()

    expect(browsing.error.value).toBe('Tutors are unavailable right now. Please try again shortly.')
    expect(browsing.loading.value).toBe(false)

    browsing.dispose()
  })

  it('applies favorite state updates to the matching directory row only', async () => {
    const browsing = useDirectoryBrowsing({
      endpoint: '/api/courses',
      pageLimit: 6,
      fetcher: jest.fn(),
      errorMessage: 'Courses are unavailable right now. Please try again shortly.'
    })
    browsing.items.value = [
      { id: 1, title: 'Networks', has_favorite: false },
      { id: 2, title: 'Databases', has_favorite: false }
    ]

    browsing.applyFavoriteState(2, true)

    expect(browsing.items.value).toEqual([
      { id: 1, title: 'Networks', has_favorite: false },
      { id: 2, title: 'Databases', has_favorite: true }
    ])

    browsing.dispose()
  })
})
