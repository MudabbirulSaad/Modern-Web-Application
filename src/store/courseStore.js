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

export const COURSE_PAGE_LIMIT = 6
export const COURSE_SORT_OPTIONS = [
  { value: 'best-match', label: 'Best Match' },
  { value: 'recently-active', label: 'Recently Active' },
  { value: 'alphabetical', label: 'Alphabetical' }
]

const courseUnavailableMessage = 'Courses are unavailable right now. Please try again shortly.'
const staleCoursesMessage = 'Showing saved results. Fresh data unavailable.'

const createInitialState = () => ({
  coursesById: {},
  activeCourseIds: [],
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
  totalCourses: 0
})

const createCoursesUrl = ({ search, department, sort, page, limit }) => {
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
  return `/api/courses${queryString ? `?${queryString}` : ''}`
}

export const useCourseStore = defineStore('courses', {
  state: createInitialState,
  getters: {
    courses: (state) => state.activeCourseIds
      .map((id) => state.coursesById[String(id)])
      .filter(Boolean),
    hasCourses() {
      return this.courses.length > 0
    },
    hasActiveFilters: (state) => Boolean(
      state.searchQuery.trim() || state.departmentFilter
    )
  },
  actions: {
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
        limit: COURSE_PAGE_LIMIT
      }
    },
    updateDepartments(items) {
      const nextDepartments = new Set(this.availableDepartments)

      items.forEach((course) => {
        if (course.department) {
          nextDepartments.add(course.department)
        }
      })

      this.availableDepartments = [...nextDepartments].sort((a, b) => a.localeCompare(b))
    },
    applyCourses(items, total) {
      const nextCoursesById = { ...this.coursesById }

      items.forEach((course) => {
        nextCoursesById[String(course.id)] = course
        registerFavoriteEntityPatcher({
          targetKind: 'course',
          targetId: course.id,
          patch: (entity) => {
            const existingCourse = this.coursesById[String(course.id)] || { id: course.id }

            this.coursesById = {
              ...this.coursesById,
              [String(course.id)]: {
                ...existingCourse,
                ...entity
              }
            }
          }
        })
      })

      this.coursesById = nextCoursesById
      this.activeCourseIds = items.map((course) => course.id)
      this.totalCourses = Number(total || 0)
      this.updateDepartments(items)
    },
    async hydrateFromCache(viewerScope, query) {
      const cachedQuery = await getDirectoryQuery({
        viewerScope,
        domain: 'courses',
        ...query
      })

      if (!cachedQuery) {
        return false
      }

      const entityRecords = await Promise.all(cachedQuery.data.entityIds.map((id) => (
        getEntity({
          viewerScope,
          namespace: 'courses',
          id
        })
      )))
      const courses = entityRecords
        .map((record) => record?.data)
        .filter(Boolean)

      if (courses.length !== cachedQuery.data.entityIds.length) {
        return false
      }

      this.applyCourses(courses, cachedQuery.data.total)
      this.error = ''
      this.staleMessage = ''
      this.isStale = true
      this.loading = false

      return true
    },
    async refreshCourses(viewerScope, query, hadCachedResults) {
      const payload = await apiRequest(createCoursesUrl(query), {
        method: 'GET',
        rawPayload: true
      })
      const courses = payload?.data || []
      const total = Number(payload?.total || 0)

      this.applyCourses(courses, total)
      this.error = ''
      this.staleMessage = ''
      this.isStale = false

      await Promise.all([
        saveDirectoryQuery({
          viewerScope,
          domain: 'courses',
          ...query,
          entityIds: courses.map((course) => course.id),
          total
        }),
        saveEntities({
          viewerScope,
          namespace: 'courses',
          rows: courses
        })
      ])

      if (!hadCachedResults) {
        this.loading = false
      }
    },
    async loadCourses() {
      const viewerScope = this.getViewerScope()
      const query = this.getQuery()

      if (this.viewerScope !== viewerScope) {
        this.coursesById = {}
        this.activeCourseIds = []
        this.totalCourses = 0
        this.viewerScope = viewerScope
      }

      this.error = ''
      this.staleMessage = ''
      this.favoriteError = ''

      const hadCachedResults = await this.hydrateFromCache(viewerScope, query)

      this.loading = !hadCachedResults
      this.refreshing = true

      try {
        await this.refreshCourses(viewerScope, query, hadCachedResults)
      } catch {
        if (hadCachedResults) {
          this.staleMessage = staleCoursesMessage
          this.error = ''
          this.isStale = true
        } else {
          this.error = courseUnavailableMessage
          this.staleMessage = ''
          this.isStale = false
          this.activeCourseIds = []
          this.totalCourses = 0
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
      return this.loadCourses()
    },
    isUpdatingFavorite(courseId) {
      return this.updatingFavoriteIds.includes(courseId)
        || useFavoriteSyncStore().hasPendingFavorite('course', courseId)
    },
    async setCourseFavorite(courseId, hasFavorite) {
      const key = String(courseId)
      const course = this.coursesById[key]

      if (!course) {
        return
      }

      const nextCourse = { ...course, has_favorite: hasFavorite }

      this.coursesById = {
        ...this.coursesById,
        [key]: nextCourse
      }

      await saveEntity({
        viewerScope: this.getViewerScope(),
        namespace: 'courses',
        row: nextCourse
      })
    },
    async toggleFavorite(course) {
      const userStore = useUserStore()

      if (!userStore.isStudent) {
        return
      }

      this.favoriteError = ''
      const nextState = !course.has_favorite
      await this.setCourseFavorite(course.id, nextState)

      const enqueued = await useFavoriteSyncStore().enqueueFavorite({
        targetKind: 'course',
        targetId: course.id,
        desiredFavorite: nextState,
        previousFavorite: course.has_favorite,
        entity: this.coursesById[String(course.id)]
      })

      if (!enqueued) {
        this.favoriteError = 'Favorite could not be updated. Please try again.'
      }
    }
  }
})
