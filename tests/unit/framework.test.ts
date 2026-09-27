import { describe, expect, it } from 'vitest'
import { detectFramework } from '../../src/core/framework.js'

describe('framework hints', () => {
  it.each([
    ['next', 'next'],
    ['vite', 'vite'],
    ['astro', 'astro'],
    ['nuxt', 'nuxt'],
    ['@tanstack/react-start', 'tanstack-start'],
    ['@react-router/dev', 'react-router'],
    ['@remix-run/dev', 'react-router'],
    ['@sveltejs/kit', 'sveltekit'],
  ] as const)('recognizes %s', (name, expected) => {
    expect(detectFramework({ devDependencies: { [name]: '1.0.0' } })).toBe(
      expected,
    )
  })

  it('falls back to generic Node and ignores malformed metadata', () => {
    expect(detectFramework({ dependencies: null })).toBe('node')
  })
})
