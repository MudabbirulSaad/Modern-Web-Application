import { homeExploreLinks, mainNavLinks } from './navigation.js'

describe('public navigation links', () => {
  it('exposes the AI Course Advisor in the main nav and Home Explore menu', () => {
    expect(mainNavLinks).toEqual(expect.arrayContaining([
      { label: 'Advisor', to: '/advisor' }
    ]))

    expect(homeExploreLinks).toEqual(expect.arrayContaining([
      { label: 'AI Course Advisor', to: '/advisor' }
    ]))
  })
})
