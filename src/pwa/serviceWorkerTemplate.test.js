import vm from 'node:vm'
import { jest } from '@jest/globals'
import {
  createServiceWorkerSource,
  normalizeAppShellAssets
} from './serviceWorkerTemplate.js'

const createWorkerContext = (source) => {
  const listeners = new Map()
  const cache = {
    addAll: jest.fn(async () => {}),
    match: jest.fn(async (request) => ({ cached: request }))
  }
  const context = {
    URL,
    fetch: jest.fn(async (request) => ({ network: request.url || request })),
    caches: {
      open: jest.fn(async () => cache),
      keys: jest.fn(async () => ['old-cache', 'swindirectory-app-shell-v1']),
      delete: jest.fn(async () => true),
      match: jest.fn(async (request) => ({ cached: request }))
    },
    self: {
      location: { origin: 'https://directory.test' },
      skipWaiting: jest.fn(async () => {}),
      clients: { claim: jest.fn(async () => {}) },
      addEventListener: jest.fn((eventName, handler) => {
        listeners.set(eventName, handler)
      })
    }
  }

  context.globalThis = context
  context.self.self = context.self

  vm.runInNewContext(source, context)

  return { cache, context, listeners }
}

describe('service worker app-shell caching', () => {
  it('normalizes build assets without allowing API entries', () => {
    expect(normalizeAppShellAssets([
      'index.html',
      '/',
      '/assets/app.123.js',
      '/assets/app.123.js',
      '/favicon.svg',
      '/api/courses'
    ])).toEqual([
      '/',
      '/assets/app.123.js',
      '/favicon.svg',
      '/index.html'
    ])
  })

  it('precaches static app-shell assets and bypasses API requests without runtime caching', async () => {
    const source = createServiceWorkerSource({
      assets: ['/', '/index.html', '/assets/app.123.js', '/favicon.svg'],
      cacheName: 'swindirectory-app-shell-v1'
    })
    const { cache, context, listeners } = createWorkerContext(source)

    await listeners.get('install')({
      waitUntil: (promise) => promise
    })

    expect(cache.addAll).toHaveBeenCalledWith([
      '/',
      '/assets/app.123.js',
      '/favicon.svg',
      '/index.html'
    ])

    let apiResponsePromise
    listeners.get('fetch')({
      request: {
        method: 'GET',
        url: 'https://directory.test/api/courses?page=1',
        mode: 'cors'
      },
      respondWith: (promise) => {
        apiResponsePromise = promise
      }
    })

    await expect(apiResponsePromise).resolves.toEqual({
      network: 'https://directory.test/api/courses?page=1'
    })
    expect(context.fetch).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://directory.test/api/courses?page=1'
    }))
    expect(cache.match).not.toHaveBeenCalled()
  })

  it('serves cached index.html for offline navigation requests', async () => {
    const source = createServiceWorkerSource({
      assets: ['/', '/index.html', '/assets/app.123.js'],
      cacheName: 'swindirectory-app-shell-v1'
    })
    const { context, listeners } = createWorkerContext(source)

    let responsePromise
    listeners.get('fetch')({
      request: {
        method: 'GET',
        url: 'https://directory.test/courses',
        mode: 'navigate'
      },
      respondWith: (promise) => {
        responsePromise = promise
      }
    })

    await expect(responsePromise).resolves.toEqual({ cached: '/index.html' })
    expect(context.fetch).not.toHaveBeenCalled()
  })
})
