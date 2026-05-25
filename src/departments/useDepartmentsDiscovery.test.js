import { jest } from '@jest/globals'
import { useDepartmentsDiscovery } from './useDepartmentsDiscovery.js'

const makeResponse = (data) => ({
  ok: true,
  json: async () => ({ data })
})

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('departments discovery', () => {
  it('loads unpaginated directory data and filters department summaries by search', async () => {
    const fetcher = jest.fn(async (url) => {
      if (url === '/api/courses?sort=alphabetical') {
        return makeResponse([
          { id: 1, title: 'Networks', department: 'Computer Science', tutor_ids: '10' },
          { id: 2, title: 'Typography', department: 'Design', tutor_ids: '' }
        ])
      }

      return makeResponse([
        { id: 10, name: 'Dr Ada Lovelace', department: 'Engineering' },
        { id: 11, name: 'Prof Max Bill', department: 'Art and Design' }
      ])
    })
    const discovery = useDepartmentsDiscovery({ fetcher })

    await discovery.fetchDepartments()
    discovery.searchQuery.value = 'computer'
    await flushPromises()

    expect(fetcher).toHaveBeenCalledWith('/api/courses?sort=alphabetical', {
      credentials: 'include'
    })
    expect(fetcher).toHaveBeenCalledWith('/api/tutors?sort=alphabetical', {
      credentials: 'include'
    })
    expect(discovery.filteredDepartments.value).toEqual([
      expect.objectContaining({
        name: 'Computer Science',
        courseCount: 1,
        tutorCount: 1
      })
    ])
    expect(discovery.emptyStateMessage.value).toBe('')
  })

  it('distinguishes no departments from no search matches', async () => {
    const discovery = useDepartmentsDiscovery({
      fetcher: jest.fn(async () => makeResponse([]))
    })

    await discovery.fetchDepartments()

    expect(discovery.emptyStateMessage.value).toBe('No departments are available yet.')

    discovery.departments.value = [
      {
        name: 'Design',
        courseCount: 1,
        tutorCount: 0,
        courseDirectoryUrl: '/courses?department=Design',
        tutorDirectoryUrl: '/tutors?department=Design'
      }
    ]
    discovery.searchQuery.value = 'computer'
    await flushPromises()

    expect(discovery.filteredDepartments.value).toEqual([])
    expect(discovery.emptyStateMessage.value).toBe('No departments match your search.')
  })
})
