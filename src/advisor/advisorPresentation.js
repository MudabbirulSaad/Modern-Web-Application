export const buildAdvisorRecommendationCards = (recommendations = []) => (
  recommendations.map((recommendation) => ({
    key: recommendation.course.id,
    courseId: recommendation.course.id,
    courseTitle: recommendation.course.title,
    department: recommendation.course.department,
    description: recommendation.course.description,
    hasFavorite: Boolean(recommendation.course.has_favorite),
    favoriteItem: {
      id: recommendation.course.id,
      has_favorite: Boolean(recommendation.course.has_favorite)
    },
    reason: recommendation.reason,
    evidence: recommendation.evidence || [],
    tutors: (recommendation.tutors || []).map((tutor) => ({
      ...tutor,
      to: { name: 'tutor-detail', params: { id: tutor.id } }
    })),
    limitations: recommendation.limitations || [],
    courseTo: { name: 'course-detail', params: { id: recommendation.course.id } }
  }))
)

export const buildAdvisorStatusNotice = (result) => {
  if (!result || !Array.isArray(result.limitations) || result.limitations.length === 0) {
    return null
  }

  // Demo note: local mode is expected when Groq is missing or invalid; present it as useful fallback, not a failure.
  const messages = result.limitations
    .filter((message) => message !== 'Generated from local matching only.')
    .map((message) => (
      message === 'AI ranking is unavailable; showing deterministic local recommendations.'
        ? 'Recommendations are available from local directory matching while AI ranking is unavailable.'
        : message
    ))

  if (result.mode !== 'ai' && result.limitations.includes('Generated from local matching only.') && messages.length === 0) {
    messages.push('Recommendations are available from local directory matching.')
  }

  return {
    tone: 'info',
    title: result.mode === 'ai' ? 'Advisor context notice' : 'Local recommendation mode',
    messages
  }
}

export const buildAdvisorPersonalizationNotice = (result) => {
  if (!result?.personalization?.active) {
    return {
      tone: 'secondary',
      title: 'Guest recommendations',
      messages: ['Sign in as a Student to include your Favorites and review activity.']
    }
  }

  const signals = result.personalization.signals || []
  const normalizedSignals = signals.map((signal) => {
    if (signal === 'Favorites') {
      return 'your Favorites'
    }

    if (signal === 'Your review activity') {
      return 'review activity'
    }

    return signal
  })
  const signalText = normalizedSignals.length > 0
    ? normalizedSignals.join(' and ')
    : 'your Student activity'

  return {
    tone: 'info',
    title: 'Student personalization active',
    messages: [`Using ${signalText} as private recommendation signals.`]
  }
}

export const applyAdvisorFavoriteState = (resultRef, courseId, hasFavorite) => {
  if (!resultRef.value?.recommendations) {
    return
  }

  resultRef.value = {
    ...resultRef.value,
    recommendations: resultRef.value.recommendations.map((recommendation) => {
      if (recommendation.course.id !== courseId) {
        return recommendation
      }

      return {
        ...recommendation,
        course: {
          ...recommendation.course,
          has_favorite: hasFavorite
        }
      }
    })
  }
}
