export const shouldShowReviewActions = (review) => review?.can_manage === true

export const shouldAllowReviewUpvote = (review, isStudent) => isStudent === true && review?.can_manage !== true
