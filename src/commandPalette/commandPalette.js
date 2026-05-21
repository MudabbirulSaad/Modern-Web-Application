import { NavigationFailureType, isNavigationFailure } from 'vue-router'
import {
  COURSE_PAGE_LIMIT,
  COURSE_SORT_OPTIONS,
  useCourseStore
} from '../store/courseStore'
import {
  TUTOR_PAGE_LIMIT,
  TUTOR_SORT_OPTIONS,
  useTutorStore
} from '../store/tutorStore'

const SUPPORTED_ROUTES = new Map([
  ['/', null],
  ['/courses', 'courses'],
  ['/tutors', 'tutors']
])

const ALLOWED_FILTERS = new Set(['search', 'department', 'sort', 'page', 'limit'])
const SORT_OPTIONS_BY_DOMAIN = new Map([
  ['courses', new Set(COURSE_SORT_OPTIONS.map((option) => option.value))],
  ['tutors', new Set(TUTOR_SORT_OPTIONS.map((option) => option.value))]
])
const PAGE_LIMIT_BY_DOMAIN = new Map([
  ['courses', COURSE_PAGE_LIMIT],
  ['tutors', TUTOR_PAGE_LIMIT]
])
const MINIMUM_COMMAND_CONFIDENCE = 0.5
const OFFLINE_UNSUPPORTED_MESSAGE = 'Offline command not supported. Try Courses, Tutors, or a simple search.'
const RATE_LIMIT_MESSAGE = 'Too many smart-navigation requests. Please wait and try again.'

const cleanText = (value, maxLength = 100) => String(value || '').trim().slice(0, maxLength)

const createNoneCommand = (reason = OFFLINE_UNSUPPORTED_MESSAGE) => ({
  action: 'NONE',
  route: null,
  domain: null,
  filters: {},
  confidence: 0,
  reason
})

const createRouteCommand = (route, action = 'NAVIGATE', filters = {}) => ({
  action,
  route,
  domain: SUPPORTED_ROUTES.get(route),
  filters,
  confidence: 1,
  reason: 'Command parsed'
})

const parsePositiveInteger = (value) => {
  const numberValue = Number(value)

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return null
  }

  return numberValue
}

const sanitizeFilters = (filters, domain = null) => {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    return {}
  }

  const safeFilters = {}

  for (const [key, value] of Object.entries(filters)) {
    if (!ALLOWED_FILTERS.has(key)) {
      continue
    }

    if (['search', 'department'].includes(key)) {
      if (typeof value !== 'string') {
        return null
      }

      const safeValue = cleanText(value)

      if (safeValue) {
        safeFilters[key] = safeValue
      }

      continue
    }

    if (key === 'sort') {
      const safeValue = cleanText(value)
      const allowedSortOptions = SORT_OPTIONS_BY_DOMAIN.get(domain)

      if (!allowedSortOptions?.has(safeValue)) {
        return null
      }

      safeFilters[key] = safeValue
      continue
    }

    const safeNumber = parsePositiveInteger(value)

    if (!safeNumber) {
      return null
    }

    if (key === 'limit' && safeNumber !== PAGE_LIMIT_BY_DOMAIN.get(domain)) {
      return null
    }

    safeFilters[key] = safeNumber
  }

  return safeFilters
}

export const sanitizeCommand = (command) => {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    return createNoneCommand('Unsupported navigation command')
  }

  const action = String(command.action || '').trim().toUpperCase()

  if (action === 'NONE') {
    return createNoneCommand(cleanText(command.reason, 160) || 'No supported navigation command')
  }

  if (!['NAVIGATE', 'FILTER', 'SEARCH'].includes(action)) {
    return createNoneCommand('Unsupported navigation command')
  }

  const route = cleanText(command.route)
  const domain = cleanText(command.domain) || null

  if (!SUPPORTED_ROUTES.has(route) || SUPPORTED_ROUTES.get(route) !== domain) {
    return createNoneCommand('Unsupported navigation command')
  }

  const confidence = Number(command.confidence)

  if (!Number.isFinite(confidence) || confidence < MINIMUM_COMMAND_CONFIDENCE) {
    return createNoneCommand('Unsupported navigation command')
  }

  const filters = sanitizeFilters(command.filters, domain)

  if (!filters) {
    return createNoneCommand('Unsupported navigation command')
  }

  return {
    action,
    route,
    domain,
    filters,
    confidence: Math.max(0, Math.min(confidence, 1)),
    reason: cleanText(command.reason, 160) || 'Navigation command parsed'
  }
}

const applyDirectoryFilters = ({ domain, filters }) => {
  if (domain === 'courses') {
    useCourseStore().applyDirectoryFilters(filters)
    return
  }

  if (domain === 'tutors') {
    useTutorStore().applyDirectoryFilters(filters)
  }
}

const domainToRoute = (domain) => (domain === 'courses' ? '/courses' : '/tutors')

const parseDomain = (value) => {
  if (['course', 'courses'].includes(value)) {
    return 'courses'
  }

  if (['tutor', 'tutors'].includes(value)) {
    return 'tutors'
  }

  return null
}

export const parseOfflineCommand = (intent) => {
  const rawIntent = cleanText(intent, 500)
  const normalizedIntent = rawIntent.toLowerCase().replace(/\s+/g, ' ')

  if (!normalizedIntent) {
    return createNoneCommand('Enter a command to continue.')
  }

  if (['home', 'start', '/'].includes(normalizedIntent)) {
    return createRouteCommand('/')
  }

  if (['courses', 'course', '/courses'].includes(normalizedIntent)) {
    return createRouteCommand('/courses')
  }

  if (['tutors', 'tutor', '/tutors'].includes(normalizedIntent)) {
    return createRouteCommand('/tutors')
  }

  const searchMatch = normalizedIntent.match(/^(?:search|find)\s+(courses?|tutors?)\s+(?:for|about|matching)\s+(.+)$/)
    || normalizedIntent.match(/^(courses?|tutors?)\s+(?:search|for)\s+(.+)$/)

  if (searchMatch) {
    const domain = parseDomain(searchMatch[1])
    const search = cleanText(searchMatch[2])

    if (domain && search) {
      return createRouteCommand(domainToRoute(domain), 'SEARCH', { search })
    }
  }

  const departmentMatch = normalizedIntent.match(/^(courses?|tutors?)\s+(?:in|from|department)\s+(.+)$/)

  if (departmentMatch) {
    const domain = parseDomain(departmentMatch[1])
    const department = cleanText(departmentMatch[2])

    if (domain && department) {
      return createRouteCommand(domainToRoute(domain), 'FILTER', { department })
    }
  }

  return createNoneCommand()
}

export const executeSmartNavigationCommand = async (command, router) => {
  const safeCommand = sanitizeCommand(command)

  if (safeCommand.action === 'NONE') {
    return {
      executed: false,
      feedback: safeCommand.reason
    }
  }

  if (['FILTER', 'SEARCH'].includes(safeCommand.action)) {
    applyDirectoryFilters(safeCommand)
  }

  const failure = await router.push({ path: safeCommand.route })

  if (isNavigationFailure(failure, NavigationFailureType.aborted) ||
      isNavigationFailure(failure, NavigationFailureType.cancelled)) {
    return {
      executed: false,
      feedback: 'Navigation was blocked. You may not have access to that page.'
    }
  }

  return { executed: true }
}

export const requestSmartNavigationCommand = (intent, apiRequest) => apiRequest('/api/smart-navigation', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ intent })
})

export const submitCommandPaletteIntent = async ({
  intent,
  apiRequest,
  router,
  online
}) => {
  const cleanIntent = cleanText(intent, 500)

  if (!cleanIntent) {
    return {
      executed: false,
      feedback: 'Enter a command to continue.'
    }
  }

  try {
    const command = online
      ? await requestSmartNavigationCommand(cleanIntent, apiRequest)
      : parseOfflineCommand(cleanIntent)

    return executeSmartNavigationCommand(command, router)
  } catch (err) {
    if (err?.status === 429) {
      return {
        executed: false,
        feedback: RATE_LIMIT_MESSAGE
      }
    }

    return {
      executed: false,
      feedback: err?.message || 'Unable to run command.'
    }
  }
}

export const createCommandPaletteShortcutHandler = ({ open, focusInput }) => (event) => {
  const isCommandK = (event.metaKey || event.ctrlKey) && String(event.key || '').toLowerCase() === 'k'

  if (!isCommandK) {
    return
  }

  event.preventDefault()
  open()
  queueMicrotask(() => focusInput())
}

export const createCommandPaletteController = ({
  apiRequest,
  router,
  isOnline
}) => {
  const state = {
    open: false,
    intent: '',
    feedback: '',
    submitting: false
  }

  return {
    open() {
      state.open = true
      state.feedback = ''
    },
    close() {
      state.open = false
      state.intent = ''
      state.feedback = ''
      state.submitting = false
    },
    updateIntent(intent) {
      state.intent = intent
      state.feedback = ''
    },
    isOpen() {
      return state.open
    },
    feedback() {
      return state.feedback
    },
    isSubmitting() {
      return state.submitting
    },
    async submit() {
      if (state.submitting) {
        return
      }

      state.submitting = true

      const result = await submitCommandPaletteIntent({
        intent: state.intent,
        apiRequest,
        router,
        online: isOnline()
      })

      state.submitting = false

      if (result.executed) {
        this.close()
        return
      }

      state.feedback = result.feedback
    }
  }
}
