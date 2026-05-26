import { describe, expect, it } from '@jest/globals'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const sourceRoot = new URL('../', import.meta.url).pathname
const forbiddenGroqClientPatterns = [
  /GROQ_API/i,
  /GROQ_API_KEY/i,
  /GROQ_MODEL/i,
  /api\.groq\.com/i,
  /groq\.com\/openai/i
]

const readSourceFiles = (dir) => readdirSync(dir)
  .flatMap((entry) => {
    const path = join(dir, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      return readSourceFiles(path)
    }

    return /\.(js|vue)$/.test(path) ? [path] : []
  })

describe('Advisor frontend Groq integration boundary', () => {
  it('keeps Groq secret configuration and provider calls out of Vue client code', () => {
    const matches = readSourceFiles(sourceRoot)
      .filter((path) => path !== new URL('./groqFrontendGuard.test.js', import.meta.url).pathname)
      .flatMap((path) => {
        const contents = readFileSync(path, 'utf8')

        return forbiddenGroqClientPatterns
          .filter((pattern) => pattern.test(contents))
          .map((pattern) => `${path.replace(sourceRoot, 'src/')}: ${pattern}`)
      })

    expect(matches).toEqual([])
  })
})
