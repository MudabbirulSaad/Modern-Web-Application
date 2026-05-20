export const REVIEW_STAR_VALUES = [1, 2, 3, 4, 5]

export const reviewStarOptions = (rating) => {
  const numericRating = Number(rating)

  return REVIEW_STAR_VALUES.map((value) => ({
    value,
    label: `${value} star${value === 1 ? '' : 's'}`,
    filled: value <= numericRating,
    checked: value === numericRating
  }))
}

export const getRatingFromArrowKey = (key, rating) => {
  const numericRating = Number(rating)

  if (key === 'ArrowRight' || key === 'ArrowUp') {
    return Math.min(5, numericRating + 1)
  }

  if (key === 'ArrowLeft' || key === 'ArrowDown') {
    return Math.max(1, numericRating - 1)
  }

  return numericRating
}
