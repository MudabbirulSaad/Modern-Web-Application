const SUPPORTED_ROUTES = new Map([
  ['/', null],
  ['/courses', 'courses'],
  ['/tutors', 'tutors']
])

const ALLOWED_FILTERS = new Set(['search', 'department'])
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

const sanitizeFilters = (filters) => {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    return {}
  }

  return Object.entries(filters).reduce((safeFilters, [key, value]) => {
    if (!ALLOWED_FILTERS.has(key) || typeof value !== 'string') {
      return safeFilters
    }

    const safeValue = cleanText(value)

    if (safeValue) {
      safeFilters[key] = safeValue
    }

    return safeFilters
  }, {})
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

  return {
    action,
    route,
    domain,
    filters: sanitizeFilters(command.filters),
    confidence: Math.max(0, Math.min(Number(command.confidence) || 0, 1)),
    reason: cleanText(command.reason, 160) || 'Navigation command parsed'
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

  await router.push({
    path: safeCommand.route,
    query: sanitizeFilters(safeCommand.filters)
  })

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
