<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { apiRequest } from '../api/client'
import {
  createCommandPaletteShortcutHandler,
  executeGlobalPaletteResult,
  executeGlobalPaletteViewAll,
  fetchGlobalPaletteSearch,
  submitCommandPaletteIntent
} from '../commandPalette/commandPalette'
import { useOnlineStore } from '../store/onlineStore'

const createEmptySearchResults = (query = '') => ({
  query,
  hasQuery: Boolean(query),
  hasMatches: false,
  courses: [],
  tutors: []
})

const router = useRouter()
const onlineStore = useOnlineStore()
const inputRef = ref(null)
const isOpen = ref(false)
const intent = ref('')
const feedback = ref('')
const submitting = ref(false)
const searchResults = ref(createEmptySearchResults())
const searchLoading = ref(false)
const searchError = ref('')
const askAnswer = ref(null)
let searchTimeout = null
let searchRequestId = 0

const focusInput = () => nextTick(() => inputRef.value?.focus())

const resetSearch = () => {
  window.clearTimeout(searchTimeout)
  searchRequestId += 1
  searchResults.value = createEmptySearchResults()
  searchLoading.value = false
  searchError.value = ''
}

const openPalette = () => {
  isOpen.value = true
  feedback.value = ''
}

const closePalette = () => {
  isOpen.value = false
  intent.value = ''
  feedback.value = ''
  askAnswer.value = null
  submitting.value = false
  resetSearch()
}

const updateIntent = (event) => {
  intent.value = event.target.value
  feedback.value = ''
  askAnswer.value = null
}

const loadSearchResults = async (query, requestId) => {
  if (!query.trim()) {
    searchResults.value = createEmptySearchResults()
    searchLoading.value = false
    searchError.value = ''
    return
  }

  searchLoading.value = true
  searchError.value = ''

  try {
    const nextResults = await fetchGlobalPaletteSearch({
      intent: query,
      apiRequest
    })

    if (requestId === searchRequestId) {
      searchResults.value = nextResults
      searchError.value = ''
    }
  } catch {
    if (requestId === searchRequestId) {
      searchResults.value = createEmptySearchResults(query.trim())
      searchError.value = 'Search results are unavailable right now.'
    }
  } finally {
    if (requestId === searchRequestId) {
      searchLoading.value = false
    }
  }
}

watch(intent, (query) => {
  window.clearTimeout(searchTimeout)
  const requestId = searchRequestId + 1
  searchRequestId = requestId

  if (!query.trim()) {
    searchResults.value = createEmptySearchResults()
    searchLoading.value = false
    searchError.value = ''
    return
  }

  searchResults.value = createEmptySearchResults(query.trim())
  searchLoading.value = true
  searchTimeout = window.setTimeout(() => {
    void loadSearchResults(query, requestId)
  }, 120)
})

const navigateToResult = async (result) => {
  await executeGlobalPaletteResult(result, router)
  closePalette()
}

const viewAll = async (domain) => {
  await executeGlobalPaletteViewAll(domain, searchResults.value.query, router)
  closePalette()
}

const submit = async () => {
  if (submitting.value) {
    return
  }

  submitting.value = true

  const result = await submitCommandPaletteIntent({
    intent: intent.value,
    apiRequest,
    router,
    online: onlineStore.online
  })

  submitting.value = false

  if (result.executed) {
    closePalette()
    return
  }

  askAnswer.value = result.askAnswer || null
  feedback.value = result.feedback
}

const handleShortcut = createCommandPaletteShortcutHandler({
  open: openPalette,
  focusInput
})

onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
})

onUnmounted(() => {
  window.clearTimeout(searchTimeout)
  window.removeEventListener('keydown', handleShortcut)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="command-palette-backdrop"
      role="presentation"
      @click.self="closePalette"
    >
      <section
        class="command-palette shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
      >
        <form @submit.prevent="submit">
          <div class="d-flex justify-content-between align-items-center gap-3 mb-3">
            <h2 id="command-palette-title" class="h5 mb-0">Command Palette</h2>
            <button
              class="btn-close"
              type="button"
              aria-label="Close command palette"
              @click="closePalette"
            ></button>
          </div>

          <label class="form-label" for="command-palette-input">Command</label>
          <div class="input-group">
            <input
              id="command-palette-input"
              ref="inputRef"
              class="form-control form-control-lg"
              :value="intent"
              type="search"
              autocomplete="off"
              placeholder="Courses, Tutors, or search courses for databases"
              @input="updateIntent"
              @keydown.esc.prevent="closePalette"
            >
            <button
              class="btn btn-directory-action"
              type="submit"
              :disabled="submitting"
            >
              {{ submitting ? 'Running' : 'Run' }}
            </button>
          </div>

          <p
            v-if="feedback"
            class="alert alert-warning mt-3 mb-0"
            role="status"
          >
            {{ feedback }}
          </p>

          <div
            v-if="askAnswer"
            class="command-palette-answer mt-3"
            aria-live="polite"
          >
            <p
              v-if="askAnswer.feedback"
              class="alert alert-warning mb-3"
              role="status"
            >
              {{ askAnswer.feedback }}
            </p>

            <section
              v-if="askAnswer.type === 'ANSWER'"
              aria-labelledby="command-palette-answer-heading"
            >
              <h3 id="command-palette-answer-heading" class="command-palette-group-heading mb-2">
                Answer
              </h3>
              <p class="command-palette-answer-copy mb-3">{{ askAnswer.answer }}</p>
            </section>

            <section
              v-if="askAnswer.citations?.courses?.length || askAnswer.citations?.tutors?.length"
              aria-labelledby="command-palette-citations-heading"
            >
              <h3 id="command-palette-citations-heading" class="command-palette-group-heading mb-2">
                Cited Results
              </h3>
              <div class="list-group">
                <button
                  v-for="course in askAnswer.citations.courses"
                  :key="`ask-course-${course.id}`"
                  class="list-group-item list-group-item-action command-palette-result"
                  type="button"
                  @click="navigateToResult(course)"
                >
                  <span class="command-palette-result-title">{{ course.title }}</span>
                  <span class="small text-body-secondary">{{ course.department }}</span>
                  <span v-if="course.description" class="command-palette-result-copy">{{ course.description }}</span>
                </button>
                <button
                  v-for="tutor in askAnswer.citations.tutors"
                  :key="`ask-tutor-${tutor.id}`"
                  class="list-group-item list-group-item-action command-palette-result"
                  type="button"
                  @click="navigateToResult(tutor)"
                >
                  <span class="command-palette-result-title">{{ tutor.name }}</span>
                  <span class="small text-body-secondary">{{ tutor.department }}</span>
                  <span v-if="tutor.bio" class="command-palette-result-copy">{{ tutor.bio }}</span>
                </button>
              </div>
            </section>

            <section
              v-else-if="askAnswer.closestMatches?.courses?.length || askAnswer.closestMatches?.tutors?.length"
              aria-labelledby="command-palette-closest-heading"
            >
              <h3 id="command-palette-closest-heading" class="command-palette-group-heading mb-2">
                Closest Matches
              </h3>
              <div class="list-group">
                <button
                  v-for="course in askAnswer.closestMatches.courses"
                  :key="`closest-course-${course.id}`"
                  class="list-group-item list-group-item-action command-palette-result"
                  type="button"
                  @click="navigateToResult(course)"
                >
                  <span class="command-palette-result-title">{{ course.title }}</span>
                  <span class="small text-body-secondary">{{ course.department }}</span>
                  <span v-if="course.description" class="command-palette-result-copy">{{ course.description }}</span>
                </button>
                <button
                  v-for="tutor in askAnswer.closestMatches.tutors"
                  :key="`closest-tutor-${tutor.id}`"
                  class="list-group-item list-group-item-action command-palette-result"
                  type="button"
                  @click="navigateToResult(tutor)"
                >
                  <span class="command-palette-result-title">{{ tutor.name }}</span>
                  <span class="small text-body-secondary">{{ tutor.department }}</span>
                  <span v-if="tutor.bio" class="command-palette-result-copy">{{ tutor.bio }}</span>
                </button>
              </div>
            </section>
          </div>

          <div
            v-if="searchResults.hasQuery && !askAnswer"
            class="command-palette-results mt-3"
            aria-live="polite"
          >
            <p v-if="searchLoading" class="alert alert-secondary mb-0" role="status">
              Searching courses and tutors...
            </p>

            <p v-else-if="searchError" class="alert alert-warning mb-0" role="status">
              {{ searchError }}
            </p>

            <div v-else-if="searchResults.hasMatches" class="d-grid gap-3">
              <section
                v-if="searchResults.courses.length"
                aria-labelledby="command-palette-courses-heading"
              >
                <div class="d-flex justify-content-between align-items-center gap-3 mb-2">
                  <h3 id="command-palette-courses-heading" class="command-palette-group-heading mb-0">
                    Courses
                  </h3>
                  <button
                    class="btn btn-link btn-sm p-0"
                    type="button"
                    @click="viewAll('courses')"
                  >
                    View all matching Courses
                  </button>
                </div>

                <div class="list-group">
                  <button
                    v-for="course in searchResults.courses"
                    :key="`course-${course.id}`"
                    class="list-group-item list-group-item-action command-palette-result"
                    type="button"
                    @click="navigateToResult(course)"
                  >
                    <span class="command-palette-result-title">
                      <span
                        v-if="course.code && !course.title.startsWith(course.code)"
                        class="command-palette-result-code"
                      >
                        <span
                          v-for="(segment, index) in course.highlights.code"
                          :key="`course-code-${course.id}-${index}`"
                          :class="{ 'command-palette-highlight': segment.match }"
                        >{{ segment.text }}</span>
                      </span>
                      <span
                        v-for="(segment, index) in course.highlights.title"
                        :key="`course-title-${course.id}-${index}`"
                        :class="{ 'command-palette-highlight': segment.match }"
                      >{{ segment.text }}</span>
                    </span>
                    <span class="small text-body-secondary">
                      <span
                        v-for="(segment, index) in course.highlights.department"
                        :key="`course-department-${course.id}-${index}`"
                        :class="{ 'command-palette-highlight': segment.match }"
                      >{{ segment.text }}</span>
                    </span>
                    <span v-if="course.description" class="command-palette-result-copy">
                      <span
                        v-for="(segment, index) in course.highlights.description"
                        :key="`course-description-${course.id}-${index}`"
                        :class="{ 'command-palette-highlight': segment.match }"
                      >{{ segment.text }}</span>
                    </span>
                  </button>
                </div>
              </section>

              <section
                v-if="searchResults.tutors.length"
                aria-labelledby="command-palette-tutors-heading"
              >
                <div class="d-flex justify-content-between align-items-center gap-3 mb-2">
                  <h3 id="command-palette-tutors-heading" class="command-palette-group-heading mb-0">
                    Tutors
                  </h3>
                  <button
                    class="btn btn-link btn-sm p-0"
                    type="button"
                    @click="viewAll('tutors')"
                  >
                    View all matching Tutors
                  </button>
                </div>

                <div class="list-group">
                  <button
                    v-for="tutor in searchResults.tutors"
                    :key="`tutor-${tutor.id}`"
                    class="list-group-item list-group-item-action command-palette-result"
                    type="button"
                    @click="navigateToResult(tutor)"
                  >
                    <span class="command-palette-result-title">
                      <span
                        v-for="(segment, index) in tutor.highlights.name"
                        :key="`tutor-name-${tutor.id}-${index}`"
                        :class="{ 'command-palette-highlight': segment.match }"
                      >{{ segment.text }}</span>
                    </span>
                    <span class="small text-body-secondary">
                      <span
                        v-for="(segment, index) in tutor.highlights.department"
                        :key="`tutor-department-${tutor.id}-${index}`"
                        :class="{ 'command-palette-highlight': segment.match }"
                      >{{ segment.text }}</span>
                    </span>
                    <span v-if="tutor.bio" class="command-palette-result-copy">
                      <span
                        v-for="(segment, index) in tutor.highlights.bio"
                        :key="`tutor-bio-${tutor.id}-${index}`"
                        :class="{ 'command-palette-highlight': segment.match }"
                      >{{ segment.text }}</span>
                    </span>
                  </button>
                </div>
              </section>
            </div>

            <p v-else class="alert alert-secondary mb-0" role="status">
              No courses or tutors match "{{ searchResults.query }}".
            </p>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.command-palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1090;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 1rem 1rem;
  background-color: rgba(0, 0, 0, 0.45);
}

.command-palette {
  width: min(42rem, 100%);
  padding: 1.25rem;
  border: 1px solid var(--bs-border-color);
  border-radius: 0.5rem;
  background-color: var(--bs-body-bg);
}

.command-palette .input-group {
  align-items: stretch;
}

.command-palette .btn-directory-action {
  min-width: 5.5rem;
}

.command-palette-results {
  max-height: min(26rem, 52vh);
  overflow-y: auto;
}

.command-palette-answer {
  max-height: min(28rem, 54vh);
  overflow-y: auto;
}

.command-palette-answer-copy {
  color: var(--bs-body-color);
}

.command-palette-group-heading {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
  color: var(--bs-secondary-color);
}

.command-palette-result {
  display: grid;
  gap: 0.2rem;
  text-align: left;
}

.command-palette-result-title {
  font-weight: 700;
  color: var(--bs-body-color);
}

.command-palette-result-code {
  margin-right: 0.4rem;
  color: var(--bs-secondary-color);
  font-weight: 700;
}

.command-palette-result-copy {
  display: -webkit-box;
  overflow: hidden;
  color: var(--bs-secondary-color);
  font-size: 0.9rem;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.command-palette-highlight {
  border-radius: 0.25rem;
  background-color: rgba(var(--bs-warning-rgb), 0.35);
  color: var(--bs-body-color);
  font-weight: 700;
}
</style>
