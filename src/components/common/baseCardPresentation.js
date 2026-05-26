export function buildBaseCardClasses({ stretch = true, interactive = true } = {}) {
  return [
    'card',
    'rounded-4',
    'shadow-sm',
    stretch && 'h-100',
    'base-card',
    interactive && 'base-card--interactive'
  ].filter(Boolean)
}
