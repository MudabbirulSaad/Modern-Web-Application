import { shouldShowReviewActions } from './reviewActions.js'

describe('review action visibility', () => {
  it('shows edit and delete controls from the review DTO management state', () => {
    expect(shouldShowReviewActions({ user_id: 9, can_manage: true })).toBe(true)
    expect(shouldShowReviewActions({ user_id: 7, can_manage: false })).toBe(false)
    expect(shouldShowReviewActions({ user_id: 7 })).toBe(false)
  })
})
