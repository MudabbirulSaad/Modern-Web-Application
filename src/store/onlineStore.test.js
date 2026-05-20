import { createPinia, setActivePinia } from 'pinia'
import { jest } from '@jest/globals'
import { useOnlineStore, resetOnlineStoreListenersForTests } from './onlineStore.js'

const listeners = new Map()

beforeEach(() => {
  listeners.clear()
  global.navigator = {
    onLine: true
  }
  global.window = {
    addEventListener: jest.fn((event, handler) => listeners.set(event, handler)),
    removeEventListener: jest.fn()
  }
  resetOnlineStoreListenersForTests()
  setActivePinia(createPinia())
})

describe('online store', () => {
  it('initializes online state once and sets up listeners idempotently', () => {
    const store = useOnlineStore()

    store.initialize()
    store.initialize()

    expect(store.online).toBe(true)
    expect(window.addEventListener).toHaveBeenCalledTimes(2)
    expect(window.addEventListener).toHaveBeenCalledWith('online', expect.any(Function))
    expect(window.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function))
  })

  it('updates offline state from the shared listener', () => {
    const store = useOnlineStore()
    store.initialize()

    listeners.get('offline')()

    expect(store.online).toBe(false)
  })

  it('drains reconnect hooks once per offline to online transition', async () => {
    const store = useOnlineStore()
    const drainPendingActions = jest.fn(async () => {})
    store.initialize()
    store.onReconnect(drainPendingActions)

    listeners.get('offline')()
    listeners.get('online')()
    listeners.get('online')()
    await Promise.resolve()

    expect(drainPendingActions).toHaveBeenCalledTimes(1)
  })
})
