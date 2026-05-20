import { defineStore } from 'pinia'

let listenersAttached = false
let activeStore = null
let reconnectInProgress = false
const reconnectHooks = new Set()

const readNavigatorOnline = () => {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return true
  }

  return navigator.onLine
}

const notifyReconnectHooks = async () => {
  if (reconnectInProgress) {
    return
  }

  reconnectInProgress = true

  try {
    await Promise.all([...reconnectHooks].map((hook) => hook()))
  } finally {
    reconnectInProgress = false
  }
}

const handleOnline = () => {
  if (!activeStore) {
    return
  }

  const wasOffline = !activeStore.online
  activeStore.online = true

  if (wasOffline) {
    void notifyReconnectHooks()
  }
}

const handleOffline = () => {
  if (activeStore) {
    activeStore.online = false
  }
}

export const useOnlineStore = defineStore('online', {
  state: () => ({
    online: true,
    initialized: false
  }),
  actions: {
    initialize() {
      activeStore = this
      this.online = readNavigatorOnline()
      this.initialized = true

      if (listenersAttached || typeof window === 'undefined') {
        return
      }

      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      listenersAttached = true
    },
    onReconnect(callback) {
      reconnectHooks.add(callback)

      return () => {
        reconnectHooks.delete(callback)
      }
    }
  }
})

export const resetOnlineStoreListenersForTests = () => {
  listenersAttached = false
  activeStore = null
  reconnectInProgress = false
  reconnectHooks.clear()
}
