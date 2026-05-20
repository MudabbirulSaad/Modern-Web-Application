import { createPinia, setActivePinia } from 'pinia'
import { jest } from '@jest/globals'
import { useNotificationStore } from './notificationStore.js'

beforeEach(() => {
  jest.useFakeTimers()
  setActivePinia(createPinia())
})

afterEach(() => {
  jest.useRealTimers()
})

describe('notification store', () => {
  it('adds transient memory-only notifications and expires them', () => {
    const store = useNotificationStore()

    const id = store.notify({
      message: 'Saved offline. Syncing when connection returns.',
      variant: 'warning',
      timeout: 1000
    })

    expect(store.notifications).toEqual([
      expect.objectContaining({
        id,
        message: 'Saved offline. Syncing when connection returns.',
        variant: 'warning'
      })
    ])

    jest.advanceTimersByTime(1000)

    expect(store.notifications).toEqual([])
  })

  it('dismisses a notification before its timeout', () => {
    const store = useNotificationStore()
    const id = store.notify({ message: 'Back online.', timeout: 1000 })

    store.dismiss(id)
    jest.advanceTimersByTime(1000)

    expect(store.notifications).toEqual([])
  })
})
