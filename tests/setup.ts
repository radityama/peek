import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    cliTestEntry: string
  }
}

export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const root = fileURLToPath(new URL('../', import.meta.url))
  await build({ cwd: root, config: join(root, 'tsdown.config.ts') })

  const cache = join(root, 'node_modules', '.cache')
  await mkdir(cache, { recursive: true })
  const directory = await mkdtemp(join(cache, 'peek-cli-test-'))
  try {
    await build({
      config: false,
      cwd: root,
      entry: { 'cli-test': 'tests/fixtures/cli/entry.ts' },
      format: ['esm'],
      platform: 'node',
      target: 'node22',
      outDir: directory,
      outExtensions: () => ({ js: '.mjs' }),
      clean: true,
      dts: false,
    })
    project.provide('cliTestEntry', join(directory, 'cli-test.mjs'))
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }

  return async () => {
    await rm(directory, { recursive: true, force: true })
  }
}
