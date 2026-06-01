import { apiUrl } from '../api/url.js'

const readJson = async (response) => {
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.message || 'Review request failed')
  }

  return payload
}

export const reviewApi = {
  async listReviews({ entityType, entityId }) {
    const params = new URLSearchParams({
      entity_type: entityType,
      entity_id: String(entityId)
    })
    const response = await fetch(apiUrl(`/api/reviews?${params.toString()}`), {
      credentials: 'include'
    })

    return readJson(response)
  },

  async createReview({ entityType, entityId, rating, comment }) {
    const response = await fetch(apiUrl('/api/reviews'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        entity_type: entityType,
        entity_id: Number(entityId),
        rating: Number(rating),
        comment
      })
    })

    return readJson(response)
  },

  async updateReview({ reviewId, rating, comment }) {
    const response = await fetch(apiUrl(`/api/reviews/${reviewId}`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        rating: Number(rating),
        comment
      })
    })

    return readJson(response)
  },

  async deleteReview({ reviewId }) {
    const response = await fetch(apiUrl(`/api/reviews/${reviewId}`), {
      method: 'DELETE',
      credentials: 'include'
    })

    return readJson(response)
  },

  async toggleUpvote({ reviewId }) {
    const response = await fetch(apiUrl(`/api/reviews/${reviewId}/upvote`), {
      method: 'POST',
      credentials: 'include'
    })

    return readJson(response)
  }
}
