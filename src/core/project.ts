import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PeekError } from '../utils/errors.js'
import { detectFramework, type Framework } from './framework.js'

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export interface Project {
  cwd: string
  packageManager: PackageManager
  devScript: string
  framework: Framework
  name?: string
}

const lockfileManagers = {
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
} as const satisfies Record<string, PackageManager>

export const lockfileNames = Object.keys(lockfileManagers)

export function detectPackageManager(
  packageManagerField: unknown,
  lockfiles: readonly string[],
): PackageManager {
  if (packageManagerField !== undefined) {
    if (typeof packageManagerField !== 'string') {
      throw new PeekError(
        'PACKAGE_MANAGER_ERROR',
        'The packageManager field must be a string.',
        'Set packageManager to pnpm, npm, yarn, or bun with an optional version.',
      )
    }
    const name = packageManagerField.split('@', 1)[0]
    if (isPackageManager(name)) return name
    throw new PeekError(
      'PACKAGE_MANAGER_ERROR',
      `Peek does not support package manager ${JSON.stringify(name)}.`,
      'Use pnpm, npm, yarn, or bun, or run an explicit command with peek -- <command>.',
    )
  }

  const managers = new Set<PackageManager>()
  for (const lockfile of lockfiles) {
    const manager = lockfileManagers[lockfile as keyof typeof lockfileManagers]
    if (manager) managers.add(manager)
  }
  if (managers.size > 1) {
    throw new PeekError(
      'PACKAGE_MANAGER_ERROR',
      'Peek found lockfiles for multiple package managers.',
      'Set packageManager in package.json or remove stale lockfiles.',
    )
  }
  return managers.values().next().value ?? 'npm'
}

export async function readProject(cwd: string): Promise<Project> {
  let source: string
  try {
    source = await readFile(join(cwd, 'package.json'), 'utf8')
  } catch (cause) {
    throw new PeekError(
      'PROJECT_NOT_FOUND',
      "Peek couldn't read package.json in this directory.",
      'Run Peek from a Node.js project or use peek -- <command>.',
      cause,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (cause) {
    throw new PeekError(
      'PROJECT_INVALID',
      'Peek could not parse package.json.',
      'Fix the JSON syntax and try again.',
      cause,
    )
  }
  if (!isRecord(parsed)) {
    throw new PeekError(
      'PROJECT_INVALID',
      'package.json must contain a JSON object.',
      'Fix package.json and try again.',
    )
  }

  const scripts = parsed.scripts
  const devScript = isRecord(scripts) ? scripts.dev : undefined
  if (typeof devScript !== 'string' || devScript.trim().length === 0) {
    throw new PeekError(
      'DEV_SCRIPT_NOT_FOUND',
      'Peek couldn\'t find a usable "dev" script in package.json.',
      'Add scripts.dev or run an explicit command with peek -- <command>.',
    )
  }

  const present = await Promise.all(
    lockfileNames.map(async (name) => {
      try {
        await access(join(cwd, name))
        return name
      } catch {
        return undefined
      }
    }),
  )
  const packageManager = detectPackageManager(
    parsed.packageManager,
    present.filter((name): name is string => name !== undefined),
  )
  const project: Project = {
    cwd,
    packageManager,
    devScript,
    framework: detectFramework(parsed),
  }
  if (typeof parsed.name === 'string') project.name = parsed.name
  return project
}

function isPackageManager(value: unknown): value is PackageManager {
  return (
    value === 'pnpm' || value === 'npm' || value === 'yarn' || value === 'bun'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
