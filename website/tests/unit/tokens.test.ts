import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync(
  new URL('../../src/styles/tokens.css', import.meta.url),
  'utf8',
)

const REQUIRED = [
  '--font-sans',
  '--font-mono',
  '--text-display',
  '--text-h2',
  '--text-body-lg',
  '--color-bg',
  '--color-ink',
  '--color-ink-2',
  '--color-line',
  '--color-accent',
  '--color-accent-strong',
  '--color-success',
  '--color-dark-bg',
  '--color-dark-ink',
  '--container-content',
  '--container-wide',
  '--ease-out',
] as const

describe('design tokens', () => {
  it.each(REQUIRED)('declares %s', (token) => {
    expect(tokens).toContain(`${token}:`)
  })
})
