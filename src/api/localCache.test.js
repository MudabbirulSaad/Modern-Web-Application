import {
  canonicalizeDirectoryQueryKey,
  canonicalizePendingLocalActionKey,
  deletePendingLocalAction,
  getDirectoryQuery,
  getEntity,
  getPendingLocalActions,
  getStudentViewerScope,
  GUEST_VIEWER_SCOPE,
  initializeLocalCache,
  purgeViewerScope,
  resetLocalCacheForTests,
  saveDirectoryQuery,
  saveEntities,
  savePendingLocalAction
} from './localCache.js'

const day = 24 * 60 * 60 * 1000
const now = new Date('2026-05-21T00:00:00.000Z').getTime()

beforeEach(async () => {
  await resetLocalCacheForTests({ now })
})

describe('local cache key canonicalization', () => {
  it('canonicalizes directory query keys from stable viewer and query inputs', () => {
    expect(canonicalizeDirectoryQueryKey({
      viewerScope: getStudentViewerScope(42),
      domain: 'courses',
      search: '  Web Apps  ',
      department: '  Computer Science  ',
      sort: 'alphabetical',
      page: '2',
      limit: '12'
    })).toBe('student:42|courses|search=web apps|department=Computer Science|sort=alphabetical|page=2|limit=12')

    expect(canonicalizeDirectoryQueryKey({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'tutors',
      search: 'Networks',
      department: 'ICT',
      sort: 'unknown-sort',
      page: -1,
      limit: 0
    })).toBe('guest|tutors|search=networks|department=ICT|sort=best-match|page=1|limit=1')
  })

  it('canonicalizes pending favorite action keys from action fields', () => {
    expect(canonicalizePendingLocalActionKey({
      type: 'favorite',
      targetKind: 'Course',
      targetId: '7'
    })).toBe('type=favorite|target_kind=course|target_id=7')
  })
})

describe('local cache viewer scopes', () => {
  it('keeps query ids and entity rows isolated by viewer scope', async () => {
    await saveDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'courses',
      search: 'security',
      entityIds: [1]
    })
    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'courses',
      rows: [{ id: 1, title: 'Security', has_favorite: false }]
    })

    await saveDirectoryQuery({
      viewerScope: getStudentViewerScope(7),
      domain: 'courses',
      search: 'security',
      entityIds: [1]
    })
    await saveEntities({
      viewerScope: getStudentViewerScope(7),
      namespace: 'courses',
      rows: [{ id: 1, title: 'Security', has_favorite: true }]
    })

    await expect(getDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'courses',
      search: ' Security '
    })).resolves.toMatchObject({
      viewerScope: GUEST_VIEWER_SCOPE,
      data: { entityIds: [1] }
    })
    await expect(getEntity({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'courses',
      id: 1
    })).resolves.toMatchObject({
      data: { has_favorite: false }
    })
    await expect(getEntity({
      viewerScope: getStudentViewerScope(7),
      namespace: 'courses',
      id: 1
    })).resolves.toMatchObject({
      data: { has_favorite: true }
    })
  })
})

describe('local cache guest ttl', () => {
  it('evicts stale guest records on startup and does not return them', async () => {
    await resetLocalCacheForTests({ now: now - (8 * day) })
    await saveDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'tutors',
      search: 'math',
      entityIds: [3]
    })
    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'tutors',
      rows: [{ id: 3, name: 'Dr Math' }]
    })

    await resetLocalCacheForTests({ now, preserveRecords: true })
    await initializeLocalCache()

    await expect(getDirectoryQuery({
      viewerScope: GUEST_VIEWER_SCOPE,
      domain: 'tutors',
      search: 'math'
    })).resolves.toBeNull()
    await expect(getEntity({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'tutors',
      id: 3
    })).resolves.toBeNull()
  })
})

describe('local cache student purge', () => {
  it('purges student-scoped domain records and pending actions without touching guest records', async () => {
    const studentScope = getStudentViewerScope(11)

    await saveEntities({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'reviews',
      rows: [{ id: 9, body: 'Guest-visible review' }]
    })
    await saveEntities({
      viewerScope: studentScope,
      namespace: 'reviews',
      rows: [{ id: 9, body: 'Student-visible review' }]
    })
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: { type: 'favorite', targetKind: 'course', targetId: 1, desiredFavorite: true }
    })

    await purgeViewerScope(studentScope)

    await expect(getEntity({
      viewerScope: studentScope,
      namespace: 'reviews',
      id: 9
    })).resolves.toBeNull()
    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([])
    await expect(getEntity({
      viewerScope: GUEST_VIEWER_SCOPE,
      namespace: 'reviews',
      id: 9
    })).resolves.toMatchObject({
      data: { body: 'Guest-visible review' }
    })
  })
})

describe('local cache pending local actions', () => {
  it('compacts repeated favorite actions for the same scoped target', async () => {
    const studentScope = getStudentViewerScope(11)

    await savePendingLocalAction({
      viewerScope: studentScope,
      action: {
        type: 'favorite',
        targetKind: 'course',
        targetId: 1,
        desiredFavorite: true
      }
    })
    await savePendingLocalAction({
      viewerScope: studentScope,
      action: {
        type: 'favorite',
        targetKind: 'course',
        targetId: 1,
        desiredFavorite: false
      }
    })

    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([
      expect.objectContaining({
        key: 'type=favorite|target_kind=course|target_id=1',
        data: expect.objectContaining({
          id: 'type=favorite|target_kind=course|target_id=1',
          desiredFavorite: false
        })
      })
    ])
  })

  it('deletes a pending action using the helper-built key', async () => {
    const studentScope = getStudentViewerScope(11)
    const action = {
      type: 'favorite',
      targetKind: 'tutor',
      targetId: 3,
      desiredFavorite: true
    }

    await savePendingLocalAction({ viewerScope: studentScope, action })
    await deletePendingLocalAction({ viewerScope: studentScope, action })

    await expect(getPendingLocalActions(studentScope)).resolves.toEqual([])
  })
})
