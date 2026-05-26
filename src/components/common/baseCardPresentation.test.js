import { describe, expect, it } from '@jest/globals'
import { buildBaseCardClasses } from './baseCardPresentation.js'

describe('BaseCard presentation', () => {
  it('keeps equal-height stretch and hover lift enabled by default', () => {
    expect(buildBaseCardClasses()).toEqual([
      'card',
      'rounded-4',
      'shadow-sm',
      'h-100',
      'base-card',
      'base-card--interactive'
    ])
  })

  it('allows dense cards to opt out of equal-height stretch and hover lift', () => {
    expect(buildBaseCardClasses({ stretch: false, interactive: false })).toEqual([
      'card',
      'rounded-4',
      'shadow-sm',
      'base-card'
    ])
  })
})
