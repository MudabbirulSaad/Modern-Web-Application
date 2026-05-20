export const GUEST_VIEWER_SCOPE = 'guest'
export const LOCAL_CACHE_GUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000

const databaseName = 'swindirectory-local-cache'
const databaseVersion = 1
const allowedSorts = new Set(['best-match', 'recently-active', 'alphabetical'])
const queryNamespaces = {
  courses: 'courseQueries',
  tutors: 'tutorQueries',
  reviews: 'reviewQueries'
}
const entityNamespaces = new Set(['courses', 'tutors', 'reviews'])
const allNamespaces = [
  'pendingLocalActions',
  'courseQueries',
  'courses',
  'tutorQueries',
  'tutors',
  'reviewQueries',
  'reviews'
]

let databasePromise = null
let memoryStores = null
let nowProvider = () => Date.now()

const createCompositeKey = (viewerScope, key) => `${viewerScope}::${key}`

const createMemoryStores = () => {
  const stores = new Map()
  allNamespaces.forEach((namespace) => {
    stores.set(namespace, new Map())
  })
  return stores
}

memoryStores = createMemoryStores()

const readIndexedDb = () => {
  if (typeof indexedDB === 'undefined') {
    return null
  }

  return indexedDB
}

const requestToPromise = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

const transactionComplete = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve()
  transaction.onerror = () => reject(transaction.error)
  transaction.onabort = () => reject(transaction.error)
})

const openDatabase = () => {
  const indexedDb = readIndexedDb()

  if (!indexedDb) {
    return null
  }

  if (databasePromise) {
    return databasePromise
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, databaseVersion)

    request.onupgradeneeded = () => {
      const db = request.result
      allNamespaces.forEach((namespace) => {
        if (!db.objectStoreNames.contains(namespace)) {
          db.createObjectStore(namespace, { keyPath: 'cacheKey' })
        }
      })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return databasePromise
}

const withStore = async (namespace, mode, callback) => {
  const db = await openDatabase()

  if (!db) {
    return callback(memoryStores.get(namespace))
  }

  const transaction = db.transaction(namespace, mode)
  const store = transaction.objectStore(namespace)
  const result = await callback(store)

  if (mode === 'readonly') {
    return result
  }

  await transactionComplete(transaction)
  return result
}

const putRecord = (namespace, record) => withStore(namespace, 'readwrite', async (store) => {
  if (store instanceof Map) {
    store.set(record.cacheKey, record)
    return record
  }

  await requestToPromise(store.put(record))
  return record
})

const getRecord = (namespace, cacheKey) => withStore(namespace, 'readonly', async (store) => {
  if (store instanceof Map) {
    return store.get(cacheKey) || null
  }

  return (await requestToPromise(store.get(cacheKey))) || null
})

const getAllRecords = (namespace) => withStore(namespace, 'readonly', async (store) => {
  if (store instanceof Map) {
    return [...store.values()]
  }

  return requestToPromise(store.getAll())
})

const deleteRecord = (namespace, cacheKey) => withStore(namespace, 'readwrite', async (store) => {
  if (store instanceof Map) {
    store.delete(cacheKey)
    return
  }

  await requestToPromise(store.delete(cacheKey))
})

const deleteWhere = async (namespace, predicate) => {
  const records = await getAllRecords(namespace)
  const keys = records.filter(predicate).map((record) => record.cacheKey)

  await Promise.all(keys.map((key) => deleteRecord(namespace, key)))
}

const normalizePositiveInteger = (value, fallback) => {
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

const normalizeViewerScope = (viewerScope) => (
  typeof viewerScope === 'string' && viewerScope.trim() ? viewerScope.trim() : GUEST_VIEWER_SCOPE
)

const normalizeDomain = (domain) => {
  const normalizedDomain = String(domain || '').trim().toLowerCase()

  if (!queryNamespaces[normalizedDomain]) {
    throw new Error(`Unsupported cache query domain: ${domain}`)
  }

  return normalizedDomain
}

const normalizeEntityNamespace = (namespace) => {
  const normalizedNamespace = String(namespace || '').trim().toLowerCase()

  if (!entityNamespaces.has(normalizedNamespace)) {
    throw new Error(`Unsupported cache entity namespace: ${namespace}`)
  }

  return normalizedNamespace
}

const shouldExpireGuestRecord = (record) => (
  record?.viewerScope === GUEST_VIEWER_SCOPE &&
  typeof record.savedAt === 'number' &&
  nowProvider() - record.savedAt > LOCAL_CACHE_GUEST_TTL_MS
)

const withoutExpiredGuestRecord = async (namespace, record) => {
  if (!record) {
    return null
  }

  if (shouldExpireGuestRecord(record)) {
    await deleteRecord(namespace, record.cacheKey)
    return null
  }

  return record
}

export const getStudentViewerScope = (userId) => `student:${userId}`

export const canonicalizeDirectoryQueryKey = ({
  viewerScope = GUEST_VIEWER_SCOPE,
  domain,
  search = '',
  department = '',
  sort = 'best-match',
  page = 1,
  limit = 6
} = {}) => {
  const normalizedViewerScope = normalizeViewerScope(viewerScope)
  const normalizedDomain = normalizeDomain(domain)
  const normalizedSearch = String(search || '').trim().toLowerCase()
  const normalizedDepartment = String(department || '').trim()
  const normalizedSort = allowedSorts.has(sort) ? sort : 'best-match'
  const normalizedPage = normalizePositiveInteger(page, 1)
  const normalizedLimit = normalizePositiveInteger(limit, 1)

  return [
    normalizedViewerScope,
    normalizedDomain,
    `search=${normalizedSearch}`,
    `department=${normalizedDepartment}`,
    `sort=${normalizedSort}`,
    `page=${normalizedPage}`,
    `limit=${normalizedLimit}`
  ].join('|')
}

export const initializeLocalCache = async () => {
  await openDatabase()
  await evictExpiredGuestRecords()
}

export const evictExpiredGuestRecords = async () => {
  await Promise.all(allNamespaces.map((namespace) => (
    deleteWhere(namespace, shouldExpireGuestRecord)
  )))
}

export const saveDirectoryQuery = async ({
  viewerScope = GUEST_VIEWER_SCOPE,
  domain,
  entityIds = [],
  total = null,
  ...query
}) => {
  const normalizedViewerScope = normalizeViewerScope(viewerScope)
  const normalizedDomain = normalizeDomain(domain)
  const key = canonicalizeDirectoryQueryKey({
    viewerScope: normalizedViewerScope,
    domain: normalizedDomain,
    ...query
  })
  const record = {
    cacheKey: createCompositeKey(normalizedViewerScope, key),
    viewerScope: normalizedViewerScope,
    key,
    savedAt: nowProvider(),
    data: {
      entityIds: [...entityIds],
      total
    }
  }

  return putRecord(queryNamespaces[normalizedDomain], record)
}

export const getDirectoryQuery = async ({
  viewerScope = GUEST_VIEWER_SCOPE,
  domain,
  ...query
}) => {
  const normalizedViewerScope = normalizeViewerScope(viewerScope)
  const normalizedDomain = normalizeDomain(domain)
  const key = canonicalizeDirectoryQueryKey({
    viewerScope: normalizedViewerScope,
    domain: normalizedDomain,
    ...query
  })
  const record = await getRecord(
    queryNamespaces[normalizedDomain],
    createCompositeKey(normalizedViewerScope, key)
  )

  return withoutExpiredGuestRecord(queryNamespaces[normalizedDomain], record)
}

export const saveEntity = async ({
  viewerScope = GUEST_VIEWER_SCOPE,
  namespace,
  row
}) => {
  const normalizedViewerScope = normalizeViewerScope(viewerScope)
  const normalizedNamespace = normalizeEntityNamespace(namespace)
  const key = String(row?.id || '')

  if (!key) {
    throw new Error('Cached entity rows require an id')
  }

  const record = {
    cacheKey: createCompositeKey(normalizedViewerScope, key),
    viewerScope: normalizedViewerScope,
    key,
    savedAt: nowProvider(),
    data: row
  }

  return putRecord(normalizedNamespace, record)
}

export const saveEntities = async ({
  viewerScope = GUEST_VIEWER_SCOPE,
  namespace,
  rows = []
}) => Promise.all(rows.map((row) => saveEntity({ viewerScope, namespace, row })))

export const getEntity = async ({
  viewerScope = GUEST_VIEWER_SCOPE,
  namespace,
  id
}) => {
  const normalizedViewerScope = normalizeViewerScope(viewerScope)
  const normalizedNamespace = normalizeEntityNamespace(namespace)
  const record = await getRecord(
    normalizedNamespace,
    createCompositeKey(normalizedViewerScope, String(id))
  )

  return withoutExpiredGuestRecord(normalizedNamespace, record)
}

export const savePendingLocalAction = async ({
  viewerScope = GUEST_VIEWER_SCOPE,
  action
}) => {
  const normalizedViewerScope = normalizeViewerScope(viewerScope)
  const key = String(action?.id || action?.key || `${Date.now()}-${Math.random()}`)
  const record = {
    cacheKey: createCompositeKey(normalizedViewerScope, key),
    viewerScope: normalizedViewerScope,
    key,
    savedAt: nowProvider(),
    data: {
      ...action,
      id: key
    }
  }

  return putRecord('pendingLocalActions', record)
}

export const getPendingLocalActions = async (viewerScope = GUEST_VIEWER_SCOPE) => {
  const normalizedViewerScope = normalizeViewerScope(viewerScope)
  const records = await getAllRecords('pendingLocalActions')
  const visibleRecords = []

  await Promise.all(records.map(async (record) => {
    const freshRecord = await withoutExpiredGuestRecord('pendingLocalActions', record)

    if (freshRecord?.viewerScope === normalizedViewerScope) {
      visibleRecords.push(freshRecord)
    }
  }))

  return visibleRecords.sort((a, b) => a.savedAt - b.savedAt)
}

export const purgeViewerScope = async (viewerScope) => {
  const normalizedViewerScope = normalizeViewerScope(viewerScope)

  await Promise.all(allNamespaces.map((namespace) => (
    deleteWhere(namespace, (record) => record.viewerScope === normalizedViewerScope)
  )))
}

export const resetLocalCacheForTests = async ({ now = Date.now(), preserveRecords = false } = {}) => {
  nowProvider = () => now
  databasePromise = null

  if (!preserveRecords) {
    memoryStores = createMemoryStores()
  }
}
