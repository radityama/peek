import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseChangelog } from '../../src/content/changelog'

const fixture = `# Changelog

## 0.3.0 — 2026-10-10

- First change.
- Second change.

## 0.2.0 — 2026-09-27

- Older change.
`

describe('parseChangelog', () => {
  it('ignores the document title', () => {
    const releases = parseChangelog(fixture)
    expect(releases).toHaveLength(2)
    expect(releases[0]?.version).toBe('0.3.0')
  })

  it('captures the date', () => {
    expect(parseChangelog(fixture)[0]?.date).toBe('2026-10-10')
  })

  it('keeps the markdown body without the heading line', () => {
    const body = parseChangelog(fixture)[0]?.body ?? ''
    expect(body).toContain('- First change.')
    expect(body).not.toContain('## 0.3.0')
  })

  it('handles a release with no date', () => {
    const releases = parseChangelog('## 1.0.0\n\n- Note.\n')
    expect(releases[0]?.date).toBeNull()
  })

  it('parses the real changelog newest-first, matching the package version', () => {
    const source = readFileSync(
      new URL('../../../CHANGELOG.md', import.meta.url),
      'utf8',
    )
    const pkg = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { version: string }
    const releases = parseChangelog(source)
    expect(releases.length).toBeGreaterThan(3)
    expect(releases[0]?.version).toBe(pkg.version)
    expect(releases.every((release) => release.body.length > 0)).toBe(true)
  })
})
