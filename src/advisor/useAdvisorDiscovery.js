import { computed, ref } from 'vue'

export const ADVISOR_INTEREST_AREAS = [
  'Not sure yet',
  'Artificial Intelligence',
  'Computer Science',
  'Cybersecurity',
  'Data Science',
  'Software Engineering',
  'Web Development'
]

export const ADVISOR_LEARNING_FOCUS = [
  'AI',
  'Software',
  'Data',
  'Security',
  'Web',
  'Systems',
  'Theory',
  'Practical'
]

export const ADVISOR_RECOMMENDATION_GOALS = [
  'Explore best matches',
  'Find highly reviewed courses',
  'Find courses with strong tutor support',
  'Discover new areas'
]

export const ADVISOR_EXPERIENCE_CONFIDENCE = [
  'Beginner',
  'Some experience',
  'Confident'
]

const readAdvisorData = async (response) => {
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.message || 'Unable to build advisor recommendations')
  }

  return payload.data || null
}

export const useAdvisorDiscovery = ({
  fetcher = fetch,
  errorMessage = 'Advisor recommendations are unavailable right now. Please try again shortly.'
} = {}) => {
  const interestArea = ref(ADVISOR_INTEREST_AREAS[0])
  const learningFocus = ref([])
  const recommendationGoal = ref(ADVISOR_RECOMMENDATION_GOALS[0])
  const experienceConfidence = ref(ADVISOR_EXPERIENCE_CONFIDENCE[1])
  const personalGoal = ref('')
  const loading = ref(false)
  const error = ref('')
  const result = ref(null)

  const preferences = {
    interestArea,
    learningFocus,
    recommendationGoal,
    experienceConfidence,
    personalGoal
  }

  const hasRequiredPreferences = computed(() => (
    interestArea.value
    && learningFocus.value.length > 0
    && recommendationGoal.value
    && experienceConfidence.value
  ))

  const toggleLearningFocus = (focus) => {
    learningFocus.value = learningFocus.value.includes(focus)
      ? learningFocus.value.filter((item) => item !== focus)
      : [...learningFocus.value, focus]
  }

  const submitPreferences = async () => {
    loading.value = true
    error.value = ''

    try {
      const response = await fetcher('/api/advisor/recommendations', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          interestArea: interestArea.value,
          learningFocus: learningFocus.value,
          recommendationGoal: recommendationGoal.value,
          experienceConfidence: experienceConfidence.value,
          personalGoal: personalGoal.value.trim()
        })
      })

      result.value = await readAdvisorData(response)
    } catch {
      error.value = errorMessage
    } finally {
      loading.value = false
    }
  }

  return {
    preferences,
    loading,
    error,
    result,
    hasRequiredPreferences,
    toggleLearningFocus,
    submitPreferences
  }
}
