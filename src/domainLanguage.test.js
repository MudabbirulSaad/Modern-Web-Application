import { readFileSync } from 'node:fs'

describe('domain language documentation', () => {
  it('distinguishes Course Department discovery from Tutor staff affiliation', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

    expect(readme).toContain('Course Department')
    expect(readme).toContain('Tutor staff affiliation')
    expect(readme).toContain('Tutor records still store this value in the existing `department` field')
  })
})
