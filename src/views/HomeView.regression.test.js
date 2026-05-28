import { readFileSync } from 'node:fs'
import { describe, expect, it } from '@jest/globals'

const homeView = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')

function getStyleRule(source, selector) {
  const escapedSelector = selector.replaceAll('.', '\\.')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] || ''
}

describe('Home mobile hero regressions', () => {
  it('uses the authenticated role to choose the secondary hero action', () => {
    expect(homeView).toContain("import { useUserStore } from '../store/userStore'")
    expect(homeView).toContain('const userStore = useUserStore()')
    expect(homeView).toContain('homeSecondaryAction')
    expect(homeView).toContain("userStore.isAdmin")
    expect(homeView).toContain("label: 'Admin dashboard'")
    expect(homeView).toContain("userStore.isAuthenticated")
    expect(homeView).toContain("label: 'Dashboard'")
    expect(homeView).toContain("label: 'Register'")
    expect(homeView).toContain(':to="homeSecondaryAction.to"')
    expect(homeView).toContain('{{ homeSecondaryAction.label }}')
  })

  it('keeps the Explore dropdown above the mobile hero artwork instead of clipped underneath', () => {
    expect(getStyleRule(homeView, '.home-hero')).toContain('overflow-x: clip')
    expect(getStyleRule(homeView, '.home-hero')).toContain('overflow-y: visible')
    expect(getStyleRule(homeView, '.home-hero__content')).toContain('z-index: 2')
    expect(getStyleRule(homeView, '.home-hero__visual')).toContain('z-index: 1')
    expect(getStyleRule(homeView, '.home-hero__actions .dropdown')).toContain('z-index: 3')
    expect(getStyleRule(homeView, '.home-hero__actions .dropdown-menu')).toContain('z-index: 1055')
    expect(getStyleRule(homeView, '.home-hero')).not.toContain('overflow: hidden')
  })
})
