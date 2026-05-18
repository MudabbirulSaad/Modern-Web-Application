import { getRatingFromArrowKey, reviewStarOptions } from './reviewStars.js'

describe('review star rating controls', () => {
  it('builds five accessible star choices with the current rating marked', () => {
    expect(reviewStarOptions(3)).toEqual([
      { value: 1, label: '1 star', filled: true, checked: false },
      { value: 2, label: '2 stars', filled: true, checked: false },
      { value: 3, label: '3 stars', filled: true, checked: true },
      { value: 4, label: '4 stars', filled: false, checked: false },
      { value: 5, label: '5 stars', filled: false, checked: false }
    ])
  })

  it('moves the rating with arrow keys without leaving the 1 to 5 range', () => {
    expect(getRatingFromArrowKey('ArrowRight', 3)).toBe(4)
    expect(getRatingFromArrowKey('ArrowUp', 5)).toBe(5)
    expect(getRatingFromArrowKey('ArrowLeft', 3)).toBe(2)
    expect(getRatingFromArrowKey('ArrowDown', 1)).toBe(1)
    expect(getRatingFromArrowKey('Enter', 3)).toBe(3)
  })
})
