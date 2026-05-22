import { getRatingFromArrowKey, reviewStarOptions } from '../components/reviewStars.js'

const resolveValue = (value) => (typeof value === 'function' ? value() : value)

export const useReviewRatingInput = ({
  idPrefix,
  name,
  modelValue,
  updateModelValue,
  disabled = false
}) => {
  const isDisabled = () => Boolean(resolveValue(disabled))
  const currentValue = () => Number(resolveValue(modelValue))
  const currentIdPrefix = () => resolveValue(idPrefix)
  const currentName = () => resolveValue(name)

  const select = (value) => {
    if (isDisabled()) {
      return false
    }

    updateModelValue(Number(value))
    return true
  }

  const onKeydown = (event) => {
    if (isDisabled()) {
      return false
    }

    const nextRating = getRatingFromArrowKey(event.key, currentValue())

    if (nextRating !== currentValue()) {
      event.preventDefault()
      return select(nextRating)
    }

    return false
  }

  const options = () => reviewStarOptions(currentValue()).map((option) => ({
    ...option,
    id: `${currentIdPrefix()}-${option.value}`,
    name: currentName(),
    disabled: isDisabled()
  }))

  return {
    options,
    select,
    onKeydown,
    updateModelValue
  }
}
