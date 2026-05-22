import { jest } from '@jest/globals'
import { useReviewRatingInput } from './reviewRatingInput.js'

describe('review rating input module', () => {
  it('updates the public rating value from keyboard interaction', () => {
    const prevented = jest.fn()
    const ratingInput = useReviewRatingInput({
      idPrefix: 'course-review-rating',
      name: 'course-review-rating',
      modelValue: () => 3,
      updateModelValue: jest.fn()
    })

    ratingInput.onKeydown({
      key: 'ArrowRight',
      preventDefault: prevented
    })

    expect(prevented).toHaveBeenCalled()
    expect(ratingInput.updateModelValue).toHaveBeenCalledWith(4)
    expect(ratingInput.options()).toEqual([
      {
        value: 1,
        id: 'course-review-rating-1',
        name: 'course-review-rating',
        label: '1 star',
        filled: true,
        checked: false,
        disabled: false
      },
      {
        value: 2,
        id: 'course-review-rating-2',
        name: 'course-review-rating',
        label: '2 stars',
        filled: true,
        checked: false,
        disabled: false
      },
      {
        value: 3,
        id: 'course-review-rating-3',
        name: 'course-review-rating',
        label: '3 stars',
        filled: true,
        checked: true,
        disabled: false
      },
      {
        value: 4,
        id: 'course-review-rating-4',
        name: 'course-review-rating',
        label: '4 stars',
        filled: false,
        checked: false,
        disabled: false
      },
      {
        value: 5,
        id: 'course-review-rating-5',
        name: 'course-review-rating',
        label: '5 stars',
        filled: false,
        checked: false,
        disabled: false
      }
    ])
  })

  it('does not change the public value while disabled', () => {
    const ratingInput = useReviewRatingInput({
      idPrefix: 'course-review-rating',
      name: 'course-review-rating',
      modelValue: () => 3,
      updateModelValue: jest.fn(),
      disabled: () => true
    })

    ratingInput.select(5)
    ratingInput.onKeydown({
      key: 'ArrowRight',
      preventDefault: jest.fn()
    })

    expect(ratingInput.updateModelValue).not.toHaveBeenCalled()
    expect(ratingInput.options()[0].disabled).toBe(true)
  })
})
