export const buildAdvisorRecommendationCards = (recommendations = []) => (
  recommendations.map((recommendation) => ({
    key: recommendation.course.id,
    courseTitle: recommendation.course.title,
    department: recommendation.course.department,
    description: recommendation.course.description,
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

  return {
    tone: result.mode === 'ai' ? 'info' : 'warning',
    title: result.mode === 'ai' ? 'Advisor context notice' : 'Local recommendation mode',
    messages: result.limitations
  }
}
