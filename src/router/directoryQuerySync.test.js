import { areDirectoryRouteQueriesEqual, createDirectoryRouteQuery, parseDirectoryRouteQuery } from './directoryQuerySync.js'
import { COURSE_SORT_OPTIONS } from '../store/courseStore.js'
import { TUTOR_SORT_OPTIONS } from '../store/tutorStore.js'

describe('directory route query synchronization', () => {
  it('hydrates course filter state from a direct route query', () => {
    expect(parseDirectoryRouteQuery({
      search: 'cyber security',
      department: 'Computing Technologies',
      sort: 'recently-active',
      page: '2'
    }, COURSE_SORT_OPTIONS)).toEqual({
      search: 'cyber security',
      department: 'Computing Technologies',
      sort: 'recently-active',
      page: 2
    })
  })

  it('hydrates tutor filter state from a direct route query', () => {
    expect(parseDirectoryRouteQuery({
      search: 'Chen',
      department: 'Mathematics',
      sort: 'alphabetical',
      page: '3'
    }, TUTOR_SORT_OPTIONS)).toEqual({
      search: 'Chen',
      department: 'Mathematics',
      sort: 'alphabetical',
      page: 3
    })
  })

  it('falls back from invalid query values while preserving valid filters', () => {
    expect(parseDirectoryRouteQuery({
      search: 'databases',
      department: 'ICT',
      sort: 'unknown-sort',
      page: '0'
    }, COURSE_SORT_OPTIONS)).toEqual({
      search: 'databases',
      department: 'ICT',
      sort: 'best-match',
      page: 1
    })
  })

  it('builds query params from course store state without dropping active filters', () => {
    expect(createDirectoryRouteQuery({
      searchQuery: 'web apps',
      departmentFilter: 'ICT',
      sortOrder: 'recently-active',
      currentPage: 2
    }, COURSE_SORT_OPTIONS)).toEqual({
      search: 'web apps',
      department: 'ICT',
      sort: 'recently-active',
      page: '2'
    })
  })

  it('restores prior course and tutor states from back and forward route queries', () => {
    const courseBackState = parseDirectoryRouteQuery({ search: 'security', page: '2' }, COURSE_SORT_OPTIONS)
    const courseForwardState = parseDirectoryRouteQuery({ department: 'ICT', sort: 'alphabetical' }, COURSE_SORT_OPTIONS)
    const tutorBackState = parseDirectoryRouteQuery({ search: 'Chen', page: '3' }, TUTOR_SORT_OPTIONS)
    const tutorForwardState = parseDirectoryRouteQuery({ department: 'Design', sort: 'recently-active' }, TUTOR_SORT_OPTIONS)

    expect(courseBackState).toEqual({
      search: 'security',
      department: '',
      sort: 'best-match',
      page: 2
    })
    expect(courseForwardState).toEqual({
      search: '',
      department: 'ICT',
      sort: 'alphabetical',
      page: 1
    })
    expect(tutorBackState).toEqual({
      search: 'Chen',
      department: '',
      sort: 'best-match',
      page: 3
    })
    expect(tutorForwardState).toEqual({
      search: '',
      department: 'Design',
      sort: 'recently-active',
      page: 1
    })
  })
})


const createDirectoryRouteHarness = ({ routeName, sortOptions }) => {
  const route = { query: {} }
  const store = {
    searchQuery: "",
    departmentFilter: "",
    sortOrder: "best-match",
    currentPage: 1,
    applyDirectoryFilters(filters = {}) {
      this.searchQuery = filters.search || ""
      this.departmentFilter = filters.department || ""
      this.sortOrder = filters.sort || "best-match"
      this.currentPage = filters.page || 1
    }
  }
  const router = {
    pushed: [],
    async push(location) {
      this.pushed.push(location)
      route.query = { ...(location.query || {}) }
    }
  }

  return {
    route,
    store,
    router,
    applyRouteQuery(nextQuery) {
      route.query = { ...nextQuery }
      store.applyDirectoryFilters(parseDirectoryRouteQuery(route.query, sortOptions))
    },
    async syncRouteFromStore() {
      const query = createDirectoryRouteQuery(store, sortOptions)

      if (!areDirectoryRouteQueriesEqual(route.query, query)) {
        await router.push({ name: routeName, query })
      }
    }
  }
}

describe("directory route and store synchronization behavior", () => {
  it("hydrates CourseList state from a direct route and pushes later store changes without dropping filters", async () => {
    const harness = createDirectoryRouteHarness({ routeName: "courses", sortOptions: COURSE_SORT_OPTIONS })

    harness.applyRouteQuery({ search: "cyber security", department: "Computing Technologies", sort: "recently-active", page: "2" })

    expect(harness.store).toEqual(expect.objectContaining({
      searchQuery: "cyber security",
      departmentFilter: "Computing Technologies",
      sortOrder: "recently-active",
      currentPage: 2
    }))

    harness.store.searchQuery = "cyber security Chen"
    harness.store.currentPage = 1
    await harness.syncRouteFromStore()

    expect(harness.router.pushed.at(-1)).toEqual({
      name: "courses",
      query: {
        search: "cyber security Chen",
        department: "Computing Technologies",
        sort: "recently-active"
      }
    })
  })

  it("hydrates TutorList state from a direct route and pushes later store changes without dropping filters", async () => {
    const harness = createDirectoryRouteHarness({ routeName: "tutors", sortOptions: TUTOR_SORT_OPTIONS })

    harness.applyRouteQuery({ search: "Chen", department: "Mathematics", sort: "alphabetical", page: "3" })

    expect(harness.store).toEqual(expect.objectContaining({
      searchQuery: "Chen",
      departmentFilter: "Mathematics",
      sortOrder: "alphabetical",
      currentPage: 3
    }))

    harness.store.departmentFilter = "Computing Technologies"
    await harness.syncRouteFromStore()

    expect(harness.router.pushed.at(-1)).toEqual({
      name: "tutors",
      query: {
        search: "Chen",
        department: "Computing Technologies",
        sort: "alphabetical",
        page: "3"
      }
    })
  })

  it("falls back from invalid CourseList and TutorList route queries at the store boundary", () => {
    const courses = createDirectoryRouteHarness({ routeName: "courses", sortOptions: COURSE_SORT_OPTIONS })
    const tutors = createDirectoryRouteHarness({ routeName: "tutors", sortOptions: TUTOR_SORT_OPTIONS })

    courses.applyRouteQuery({ search: "databases", department: "ICT", sort: "unknown-sort", page: "-4" })
    tutors.applyRouteQuery({ search: "Maya", department: "Design", sort: "bad-sort", page: "later" })

    expect(courses.store).toEqual(expect.objectContaining({
      searchQuery: "databases",
      departmentFilter: "ICT",
      sortOrder: "best-match",
      currentPage: 1
    }))
    expect(tutors.store).toEqual(expect.objectContaining({
      searchQuery: "Maya",
      departmentFilter: "Design",
      sortOrder: "best-match",
      currentPage: 1
    }))
  })

  it("restores CourseList and TutorList filter states from browser back and forward route queries", () => {
    const courses = createDirectoryRouteHarness({ routeName: "courses", sortOptions: COURSE_SORT_OPTIONS })
    const tutors = createDirectoryRouteHarness({ routeName: "tutors", sortOptions: TUTOR_SORT_OPTIONS })

    courses.applyRouteQuery({ search: "security", page: "2" })
    expect(courses.store).toEqual(expect.objectContaining({ searchQuery: "security", currentPage: 2 }))
    courses.applyRouteQuery({ department: "ICT", sort: "alphabetical" })
    expect(courses.store).toEqual(expect.objectContaining({ searchQuery: "", departmentFilter: "ICT", sortOrder: "alphabetical", currentPage: 1 }))

    tutors.applyRouteQuery({ search: "Chen", page: "3" })
    expect(tutors.store).toEqual(expect.objectContaining({ searchQuery: "Chen", currentPage: 3 }))
    tutors.applyRouteQuery({ department: "Design", sort: "recently-active" })
    expect(tutors.store).toEqual(expect.objectContaining({ searchQuery: "", departmentFilter: "Design", sortOrder: "recently-active", currentPage: 1 }))
  })
})
