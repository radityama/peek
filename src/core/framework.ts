import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type Framework =
  | 'next'
  | 'vite'
  | 'astro'
  | 'nuxt'
  | 'tanstack-start'
  | 'react-router'
  | 'sveltekit'
  | 'node'

const FRAMEWORK_PACKAGES: readonly [string, Framework][] = [
  ['next', 'next'],
  ['astro', 'astro'],
  ['nuxt', 'nuxt'],
  ['@tanstack/react-start', 'tanstack-start'],
  ['@react-router/dev', 'react-router'],
  ['@remix-run/dev', 'react-router'],
  ['@sveltejs/kit', 'sveltekit'],
  ['vite', 'vite'],
]

export function detectFramework(
  packageJson: Record<string, unknown>,
): Framework {
  const dependencies = {
    ...asRecord(packageJson.dependencies),
    ...asRecord(packageJson.devDependencies),
  }
  for (const [name, framework] of FRAMEWORK_PACKAGES) {
    if (typeof dependencies[name] === 'string') return framework
  }
  return 'node'
}

export async function readFramework(cwd: string): Promise<Framework> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(cwd, 'package.json'), 'utf8'),
    )
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? detectFramework(parsed as Record<string, unknown>)
      : 'node'
  } catch {
    return 'node'
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
