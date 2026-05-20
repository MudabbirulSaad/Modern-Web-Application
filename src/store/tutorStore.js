import { defineStore } from 'pinia'
import { apiRequest } from '../api/client'
import {
  GUEST_VIEWER_SCOPE,
  getDirectoryQuery,
  getEntity,
  getStudentViewerScope,
  saveDirectoryQuery,
  saveEntities,
  saveEntity
} from '../api/localCache'
import { useUserStore } from './userStore'
import { registerFavoriteEntityPatcher, useFavoriteSyncStore } from './favoriteSyncStore'

export const TUTOR_PAGE_LIMIT = 6
export const TUTOR_SORT_OPTIONS = [
  { value: 'best-match', label: 'Best Match' },
  { value: 'recently-active', label: 'Recently Active' },
  { value: 'alphabetical', label: 'Alphabetical' }
]

const tutorUnavailableMessage = 'Tutors are unavailable right now. Please try again shortly.'
const staleTutorsMessage = 'Showing saved results. Fresh data unavailable.'

const createInitialState = () => ({
  tutorsById: {},
  activeTutorIds: [],
  loading: true,
  refreshing: false,
  error: '',
  staleMessage: '',
  isStale: false,
  favoriteError: '',
  updatingFavoriteIds: [],
  viewerScope: GUEST_VIEWER_SCOPE,
  searchQuery: '',
  departmentFilter: '',
  sortOrder: 'best-match',
  availableDepartments: [],
  currentPage: 1,
  totalTutors: 0
})

const createTutorsUrl = ({ search, department, sort, page, limit }) => {
  const params = new URLSearchParams()

  if (search) {
    params.set('search', search)
  }

  if (department) {
    params.set('department', department)
  }

  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set('sort', sort)

  const queryString = params.toString()
  return `/api/tutors${queryString ? `?${queryString}` : ''}`
}

export const useTutorStore = defineStore('tutors', {
  state: createInitialState,
  getters: {
    tutors: (state) => state.activeTutorIds
      .map((id) => state.tutorsById[String(id)])
      .filter(Boolean),
    hasTutors() {
      return this.tutors.length > 0
    },
    hasActiveFilters: (state) => Boolean(
      state.searchQuery.trim() || state.departmentFilter
    )
  },
  actions: {
    resetForGuestScope() {
      const nextState = createInitialState()

      this.tutorsById = nextState.tutorsById
      this.activeTutorIds = nextState.activeTutorIds
      this.loading = nextState.loading
      this.refreshing = nextState.refreshing
      this.error = nextState.error
      this.staleMessage = nextState.staleMessage
      this.isStale = nextState.isStale
      this.favoriteError = nextState.favoriteError
      this.updatingFavoriteIds = nextState.updatingFavoriteIds
      this.viewerScope = nextState.viewerScope
      this.searchQuery = nextState.searchQuery
      this.departmentFilter = nextState.departmentFilter
      this.sortOrder = nextState.sortOrder
      this.availableDepartments = nextState.availableDepartments
      this.currentPage = nextState.currentPage
      this.totalTutors = nextState.totalTutors
    },
    getViewerScope() {
      const userStore = useUserStore()

      if (userStore.isStudent && userStore.userId) {
        return getStudentViewerScope(userStore.userId)
      }

      return GUEST_VIEWER_SCOPE
    },
    getQuery() {
      return {
        search: this.searchQuery.trim(),
        department: this.departmentFilter,
        sort: this.sortOrder,
        page: this.currentPage,
        limit: TUTOR_PAGE_LIMIT
      }
    },
    updateDepartments(items) {
      const nextDepartments = new Set(this.availableDepartments)

      items.forEach((tutor) => {
        if (tutor.department) {
          nextDepartments.add(tutor.department)
        }
      })

      this.availableDepartments = [...nextDepartments].sort((a, b) => a.localeCompare(b))
    },
    applyTutors(items, total) {
      const nextTutorsById = { ...this.tutorsById }

      items.forEach((tutor) => {
        nextTutorsById[String(tutor.id)] = tutor
        registerFavoriteEntityPatcher({
          targetKind: 'tutor',
          targetId: tutor.id,
          patch: (entity) => {
            const existingTutor = this.tutorsById[String(tutor.id)] || { id: tutor.id }

            this.tutorsById = {
              ...this.tutorsById,
              [String(tutor.id)]: {
                ...existingTutor,
                ...entity
              }
            }
          }
        })
      })

      this.tutorsById = nextTutorsById
      this.activeTutorIds = items.map((tutor) => tutor.id)
      this.totalTutors = Number(total || 0)
      this.updateDepartments(items)
    },
    async hydrateFromCache(viewerScope, query) {
      const cachedQuery = await getDirectoryQuery({
        viewerScope,
        domain: 'tutors',
        ...query
      })

      if (!cachedQuery) {
        return false
      }

      const entityRecords = await Promise.all(cachedQuery.data.entityIds.map((id) => (
        getEntity({
          viewerScope,
          namespace: 'tutors',
          id
        })
      )))
      const tutors = entityRecords
        .map((record) => record?.data)
        .filter(Boolean)

      if (tutors.length !== cachedQuery.data.entityIds.length) {
        return false
      }

      this.applyTutors(tutors, cachedQuery.data.total)
      this.error = ''
      this.staleMessage = ''
      this.isStale = true
      this.loading = false

      return true
    },
    async refreshTutors(viewerScope, query, hadCachedResults) {
      const payload = await apiRequest(createTutorsUrl(query), {
        method: 'GET',
        rawPayload: true
      })
      const tutors = payload?.data || []
      const total = Number(payload?.total || 0)

      this.applyTutors(tutors, total)
      this.error = ''
      this.staleMessage = ''
      this.isStale = false

      await Promise.all([
        saveDirectoryQuery({
          viewerScope,
          domain: 'tutors',
          ...query,
          entityIds: tutors.map((tutor) => tutor.id),
          total
        }),
        saveEntities({
          viewerScope,
          namespace: 'tutors',
          rows: tutors
        })
      ])

      if (!hadCachedResults) {
        this.loading = false
      }
    },
    async loadTutors() {
      const viewerScope = this.getViewerScope()
      const query = this.getQuery()

      if (this.viewerScope !== viewerScope) {
        this.tutorsById = {}
        this.activeTutorIds = []
        this.totalTutors = 0
        this.viewerScope = viewerScope
      }

      this.error = ''
      this.staleMessage = ''
      this.favoriteError = ''

      const hadCachedResults = await this.hydrateFromCache(viewerScope, query)

      this.loading = !hadCachedResults
      this.refreshing = true

      try {
        await this.refreshTutors(viewerScope, query, hadCachedResults)
      } catch {
        if (hadCachedResults) {
          this.staleMessage = staleTutorsMessage
          this.error = ''
          this.isStale = true
        } else {
          this.error = tutorUnavailableMessage
          this.staleMessage = ''
          this.isStale = false
          this.activeTutorIds = []
          this.totalTutors = 0
        }
      } finally {
        this.loading = false
        this.refreshing = false
      }
    },
    clearFilters() {
      this.searchQuery = ''
      this.departmentFilter = ''
    },
    setPage(pageNumber) {
      this.currentPage = pageNumber
      return this.loadTutors()
    },
    isUpdatingFavorite(tutorId) {
      return this.updatingFavoriteIds.includes(tutorId)
        || useFavoriteSyncStore().isFavoriteSyncing('tutor', tutorId)
    },
    hasBlockedFavorite(tutorId) {
      return useFavoriteSyncStore().hasBlockedFavorite('tutor', tutorId)
    },
    retryFavorite(tutorId) {
      return useFavoriteSyncStore().retryFavorite('tutor', tutorId)
    },
    async setTutorFavorite(tutorId, hasFavorite) {
      const key = String(tutorId)
      const tutor = this.tutorsById[key]

      if (!tutor) {
        return
      }

      const nextTutor = { ...tutor, has_favorite: hasFavorite }

      this.tutorsById = {
        ...this.tutorsById,
        [key]: nextTutor
      }

      await saveEntity({
        viewerScope: this.getViewerScope(),
        namespace: 'tutors',
        row: nextTutor
      })
    },
    async toggleFavorite(tutor) {
      const userStore = useUserStore()

      if (!userStore.isStudent) {
        return
      }

      this.favoriteError = ''
      const nextState = !tutor.has_favorite
      await this.setTutorFavorite(tutor.id, nextState)

      const enqueued = await useFavoriteSyncStore().enqueueFavorite({
        targetKind: 'tutor',
        targetId: tutor.id,
        desiredFavorite: nextState,
        previousFavorite: tutor.has_favorite,
        entity: this.tutorsById[String(tutor.id)]
      })

      if (!enqueued) {
        this.favoriteError = 'Favorite could not be updated. Please try again.'
      }
    }
  }
})
