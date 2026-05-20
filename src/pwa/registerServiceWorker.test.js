import { jest } from '@jest/globals'
import { registerServiceWorker } from './registerServiceWorker.js'

describe('service worker registration', () => {
  afterEach(() => {
    delete globalThis.window
    delete globalThis.document
    delete globalThis.navigator
  })

  it('registers the production service worker after the page is loaded', () => {
    const register = jest.fn()
    const listenerMap = new Map()

    globalThis.window = {
      location: { protocol: 'https:' },
      addEventListener: jest.fn((eventName, handler) => {
        listenerMap.set(eventName, handler)
      })
    }
    globalThis.document = { readyState: 'loading' }
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: { register }
      }
    })

    registerServiceWorker()
    listenerMap.get('load')()

    expect(register).toHaveBeenCalledWith('/sw.js')
  })
})
