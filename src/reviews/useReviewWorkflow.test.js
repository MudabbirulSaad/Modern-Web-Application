import { jest } from '@jest/globals'
import { useReviewWorkflow } from './useReviewWorkflow.js'

describe('review workflow module', () => {
  it('loads reviews for an entity through the public review interface', async () => {
    const reviewApi = {
      listReviews: jest.fn(async () => ({
        data: [
          { id: 1, rating: 5, comment: 'Clear explanations.', upvotes: 2 }
        ]
      }))
    }
    const workflow = useReviewWorkflow({
      entityType: 'course',
      entityId: 42,
      canReview: () => true,
      reviewApi
    })

    await workflow.loadReviews()

    expect(reviewApi.listReviews).toHaveBeenCalledWith({
      entityType: 'course',
      entityId: 42
    })
    expect(workflow.reviews.value).toEqual([
      { id: 1, rating: 5, comment: 'Clear explanations.', upvotes: 2 }
    ])
    expect(workflow.loading.value).toBe(false)
    expect(workflow.error.value).toBe('')
  })

  it('creates a review and prepends it to the loaded reviews', async () => {
    const createdReview = {
      id: 2,
      rating: 4,
      comment: 'Helpful practical examples.',
      upvotes: 0
    }
    const reviewApi = {
      createReview: jest.fn(async () => ({ data: createdReview }))
    }
    const workflow = useReviewWorkflow({
      entityType: 'tutor',
      entityId: 9,
      canReview: () => true,
      reviewApi
    })
    workflow.reviews.value = [
      { id: 1, rating: 5, comment: 'Clear explanations.', upvotes: 2 }
    ]
    workflow.rating.value = 4
    workflow.comment.value = 'Helpful practical examples.'

    const created = await workflow.createReview()

    expect(created).toBe(true)
    expect(reviewApi.createReview).toHaveBeenCalledWith({
      entityType: 'tutor',
      entityId: 9,
      rating: 4,
      comment: 'Helpful practical examples.'
    })
    expect(workflow.reviews.value).toEqual([
      createdReview,
      { id: 1, rating: 5, comment: 'Clear explanations.', upvotes: 2 }
    ])
    expect(workflow.rating.value).toBe(5)
    expect(workflow.comment.value).toBe('')
    expect(workflow.submitting.value).toBe(false)
    expect(workflow.submitError.value).toBe('')
  })

  it('updates an edited review and leaves edit mode', async () => {
    const updatedReview = {
      id: 7,
      rating: 3,
      comment: 'More examples would help.',
      upvotes: 4
    }
    const reviewApi = {
      updateReview: jest.fn(async () => ({ data: updatedReview }))
    }
    const workflow = useReviewWorkflow({
      entityType: 'course',
      entityId: 11,
      canReview: () => true,
      reviewApi
    })
    workflow.reviews.value = [
      { id: 7, rating: 5, comment: 'Original comment.', upvotes: 4 },
      { id: 8, rating: 4, comment: 'Keep this review.', upvotes: 1 }
    ]

    workflow.startEditing(workflow.reviews.value[0])
    workflow.editRating.value = 3
    workflow.editComment.value = 'More examples would help.'
    const updated = await workflow.updateReview(workflow.reviews.value[0])

    expect(updated).toBe(true)
    expect(reviewApi.updateReview).toHaveBeenCalledWith({
      reviewId: 7,
      rating: 3,
      comment: 'More examples would help.'
    })
    expect(workflow.reviews.value).toEqual([
      updatedReview,
      { id: 8, rating: 4, comment: 'Keep this review.', upvotes: 1 }
    ])
    expect(workflow.editingReviewId.value).toBe(null)
    expect(workflow.updating.value).toBe(false)
    expect(workflow.actionError.value).toBe('')
  })

  it('deletes a review and cancels editing when that review was open', async () => {
    const reviewApi = {
      deleteReview: jest.fn(async () => ({ status: 'ok' }))
    }
    const workflow = useReviewWorkflow({
      entityType: 'course',
      entityId: 11,
      canReview: () => true,
      reviewApi
    })
    workflow.reviews.value = [
      { id: 7, rating: 5, comment: 'Remove this review.', upvotes: 4 },
      { id: 8, rating: 4, comment: 'Keep this review.', upvotes: 1 }
    ]

    workflow.startEditing(workflow.reviews.value[0])
    const deleted = await workflow.deleteReview(workflow.reviews.value[0])

    expect(deleted).toBe(true)
    expect(reviewApi.deleteReview).toHaveBeenCalledWith({ reviewId: 7 })
    expect(workflow.reviews.value).toEqual([
      { id: 8, rating: 4, comment: 'Keep this review.', upvotes: 1 }
    ])
    expect(workflow.editingReviewId.value).toBe(null)
    expect(workflow.deletingId.value).toBe(null)
    expect(workflow.actionError.value).toBe('')
  })

  it('toggles an allowed review upvote and replaces that review', async () => {
    const toggledReview = {
      id: 8,
      rating: 4,
      comment: 'Useful pacing.',
      upvotes: 2,
      has_upvoted: true,
      can_manage: false
    }
    const reviewApi = {
      toggleUpvote: jest.fn(async () => ({ data: toggledReview }))
    }
    const workflow = useReviewWorkflow({
      entityType: 'course',
      entityId: 11,
      canReview: () => true,
      reviewApi
    })
    workflow.reviews.value = [
      { id: 7, rating: 5, comment: 'Keep this review.', upvotes: 4, can_manage: false },
      { id: 8, rating: 4, comment: 'Useful pacing.', upvotes: 1, has_upvoted: false, can_manage: false }
    ]

    const toggled = await workflow.toggleUpvote(workflow.reviews.value[1])

    expect(toggled).toBe(true)
    expect(reviewApi.toggleUpvote).toHaveBeenCalledWith({ reviewId: 8 })
    expect(workflow.reviews.value).toEqual([
      { id: 7, rating: 5, comment: 'Keep this review.', upvotes: 4, can_manage: false },
      toggledReview
    ])
    expect(workflow.upvotingId.value).toBe(null)
    expect(workflow.actionError.value).toBe('')
  })
})
