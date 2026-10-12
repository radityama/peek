import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { version } from '../../src/content/version'

describe('version', () => {
  it('matches the root package version', () => {
    const root = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { version: string }
    expect(version).toBe(root.version)
  })

  it('is a semver string', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
