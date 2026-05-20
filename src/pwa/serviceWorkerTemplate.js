export const serviceWorkerFileName = 'sw.js'
export const defaultServiceWorkerCacheName = 'swindirectory-app-shell-v1'

const toAssetPath = (asset) => {
  const pathname = String(asset || '').trim()

  if (!pathname) {
    return ''
  }

  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

const isCacheableAppShellAsset = (asset) => {
  if (!asset || asset.includes('\n') || asset.includes('\r')) {
    return false
  }

  if (asset === '/api' || asset.startsWith('/api/')) {
    return false
  }

  return true
}

export const normalizeAppShellAssets = (assets = []) => {
  const normalizedAssets = new Set()

  assets
    .map(toAssetPath)
    .filter(isCacheableAppShellAsset)
    .forEach((asset) => normalizedAssets.add(asset))

  normalizedAssets.add('/')
  normalizedAssets.add('/index.html')

  return [...normalizedAssets].sort((a, b) => a.localeCompare(b))
}

export const createServiceWorkerSource = ({
  assets = [],
  cacheName = defaultServiceWorkerCacheName
} = {}) => {
  const appShellAssets = normalizeAppShellAssets(assets)

  return `const APP_SHELL_CACHE = ${JSON.stringify(cacheName)}
const APP_SHELL_ASSETS = ${JSON.stringify(appShellAssets, null, 2)}
const APP_SHELL_ASSET_SET = new Set(APP_SHELL_ASSETS)

const isSameOrigin = (url) => url.origin === self.location.origin
const isApiRequest = (url) => isSameOrigin(url) && (url.pathname === '/api' || url.pathname.startsWith('/api/'))
const isAppShellAsset = (url) => isSameOrigin(url) && APP_SHELL_ASSET_SET.has(url.pathname)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('swindirectory-app-shell-') && cacheName !== APP_SHELL_CACHE)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  if (!isSameOrigin(url)) {
    return
  }

  if (isApiRequest(url)) {
    event.respondWith(fetch(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html')
        .then((response) => response || fetch(request))
    )
    return
  }

  if (!isAppShellAsset(url)) {
    return
  }

  event.respondWith(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.match(url.pathname))
      .then((response) => response || fetch(request))
  )
})
`
}
