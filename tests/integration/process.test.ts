import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { cleanupDev } from '../../src/core/cleanup.js'
import {
  type DevProcess,
  isMissingWindowsCommand,
  spawnDev,
} from '../../src/core/process.js'
import { processState } from '../helpers/cli.js'

interface Record {
  role: string
  pid: number
  port?: number
}

const fixture = fileURLToPath(
  new URL('../fixtures/cli/adversarial.mjs', import.meta.url),
)

async function readJournal(journal: string): Promise<Record[]> {
  return (await readFile(journal, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record)
}

async function waitForPipeClosure(dev: DevProcess): Promise<void> {
  const deadline = Date.now() + 2000
  while (!dev.stdout.closed || !dev.stderr.closed) {
    if (Date.now() >= deadline)
      throw new Error('Fallback output pipes did not close')
    await delay(25)
  }
}

it('reports a real unavailable command with missing-command classification', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peek-missing-command-'))
  const file = join(directory, 'peek-fixture-no-such-command')
  const dev = spawnDev({ file, args: [] }, directory)
  let stderr = ''
  dev.stderr.setEncoding('utf8')
  dev.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })
  const stderrClosed = new Promise<void>((resolve) => {
    dev.stderr.once('end', resolve)
  })
  try {
    const result = await dev.exit
    expect(result.failed).toBe(true)
    const windowsMissing = await isMissingWindowsCommand(file, directory)
    expect(result.spawnFailed || windowsMissing).toBe(true)
    if (process.platform !== 'win32') {
      expect(result).toMatchObject({ exitCode: null, spawnFailed: true })
      expect(result.message).toContain('peek-fixture-no-such-command')
    } else {
      expect(windowsMissing).toBe(true)
      expect(result.spawnFailed).toBe(false)
      await stderrClosed
      expect(stderr).toContain('peek-fixture-no-such-command')
    }
  } finally {
    dev.kill('SIGKILL')
    dev.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

it('reports normal zero exit as successful', async () => {
  const dev = spawnDev(
    { file: process.execPath, args: ['-e', 'process.exit(0)'] },
    tmpdir(),
  )
  try {
    expect(await dev.exit).toMatchObject({
      exitCode: 0,
      failed: false,
      spawnFailed: false,
    })
  } finally {
    dev.kill('SIGKILL')
    dev.dispose()
  }
})

it('preserves synchronous NUL argument validation', () => {
  expect(() =>
    spawnDev({ file: process.execPath, args: ['\0'] }, process.cwd()),
  ).toThrow(/null bytes/)
})

it.skipIf(process.platform === 'win32')(
  'settles a synchronous POSIX spawn failure without native events',
  async () => {
    const dev = spawnDev(
      {
        file: process.execPath,
        args: ['-e', 'process.exit(0)', 'x'.repeat(3 * 1024 * 1024)],
      },
      process.cwd(),
    )
    expect(dev.pid).toBeUndefined()
    await expect(dev.exit).resolves.toMatchObject({
      failed: true,
      spawnFailed: true,
      message: expect.stringContaining('E2BIG'),
    })
  },
  1000,
)

it('reports root exit before an inherited pipe closes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'peek-root-exit-'))
  const journal = join(directory, 'journal.jsonl')
  const stopFile = join(directory, 'stop-descendant')
  await writeFile(journal, '')
  const dev = spawnDev(
    {
      file: process.execPath,
      args: [
        '--input-type=module',
        '-e',
        `process.env.PEEK_TEST_JOURNAL=${JSON.stringify(journal)}; process.env.PEEK_TEST_STOP_FILE=${JSON.stringify(stopFile)}; await import(${JSON.stringify(pathToFileURL(fixture).href)})`,
      ],
    },
    directory,
  )
  const fallback = async (): Promise<void> => {
    let confirmed = false
    try {
      await writeFile(stopFile, 'stop')
      const deadline = Date.now() + 2000
      while (true) {
        const records = await readJournal(journal)
        if (
          records.some((record) => record.role === 'dev-descendant') &&
          (dev.pid === undefined || processState(dev.pid) !== 'running') &&
          records.every((record) => processState(record.pid) !== 'running')
        ) {
          break
        }
        if (Date.now() >= deadline)
          throw new Error('Root-exit fixture fallback did not stop resources')
        await delay(25)
      }
      await waitForPipeClosure(dev)
      confirmed = true
    } finally {
      dev.dispose()
      if (confirmed) await rm(directory, { recursive: true, force: true })
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = Date.now() + 5000
    let records = await readJournal(journal)
    while (!records.some((record) => record.role === 'root-exiting')) {
      if (Date.now() >= deadline)
        throw new Error('Missing root-exiting checkpoint')
      await delay(25)
      records = await readJournal(journal)
    }
    const descendant = records.find(
      (record) => record.role === 'dev-descendant',
    )
    console.info('root checkpoint', JSON.stringify(records))
    const result = await Promise.race([
      dev.exit,
      new Promise<string>((resolve) => {
        timer = setTimeout(
          () => resolve('root exit delayed by retained pipes'),
          2000,
        )
      }),
    ])
    console.info('root observation', JSON.stringify(result))
    expect(descendant).toBeDefined()
    if (!descendant) throw new Error('Missing descendant checkpoint')
    expect(() => process.kill(descendant.pid, 0)).not.toThrow()
    expect(dev.stdout.destroyed).toBe(false)
    expect(dev.stderr.destroyed).toBe(false)
    expect(result).toMatchObject({
      exitCode: 7,
      failed: true,
      spawnFailed: false,
    })
    expect(await readFile(journal, 'utf8')).toContain('root-exiting')
  } finally {
    clearTimeout(timer)
    await fallback()
  }
})

async function controlledTree(
  options: {
    checkpoint?: string
    timeoutMs?: number
    onSpawn?: (dev: DevProcess, directory: string) => void
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'peek-controlled-tree-'))
  const journal = join(directory, 'journal.jsonl')
  const stopFile = join(directory, 'stop-descendant')
  const exitFile = join(directory, 'exit-root')
  await writeFile(journal, '')
  const dev = spawnDev(
    {
      file: process.execPath,
      args: [
        '--input-type=module',
        '-e',
        `process.env.PEEK_TEST_JOURNAL=${JSON.stringify(journal)}; process.env.PEEK_TEST_STOP_FILE=${JSON.stringify(stopFile)}; process.env.PEEK_TEST_ROOT_EXIT_FILE=${JSON.stringify(exitFile)}; await import(${JSON.stringify(pathToFileURL(fixture).href)})`,
      ],
    },
    directory,
  )
  const fallback = async (): Promise<void> => {
    let confirmed = false
    try {
      await writeFile(stopFile, 'stop')
      await writeFile(exitFile, 'exit')
      const deadline = Date.now() + 2000
      while (true) {
        const records = await readJournal(journal)
        if (
          (dev.pid === undefined ||
            records.some((record) => record.role === 'dev-descendant')) &&
          (dev.pid === undefined || processState(dev.pid) !== 'running') &&
          records.every((record) => processState(record.pid) !== 'running')
        ) {
          confirmed = true
          break
        }
        if (Date.now() >= deadline)
          throw new Error('Controlled fixture fallback did not stop resources')
        await delay(25)
      }
    } finally {
      dev.dispose()
      try {
        await waitForPipeClosure(dev)
      } finally {
        if (confirmed) await rm(directory, { recursive: true, force: true })
      }
    }
  }
  try {
    options.onSpawn?.(dev, directory)
    const deadline = Date.now() + (options.timeoutMs ?? 5000)
    while (
      !(await readJournal(journal)).some(
        (record) => record.role === (options.checkpoint ?? 'root-waiting'),
      )
    ) {
      if (Date.now() >= deadline)
        throw new Error('Missing controlled root checkpoint')
      await delay(25)
    }
    const records = await readJournal(journal)
    const descendant = records.find(
      (record) => record.role === 'dev-descendant',
    )
    if (!descendant || dev.pid === undefined) {
      throw new Error('Missing controlled process identities')
    }
    return {
      dev,
      rootPid: dev.pid,
      descendant,
      exitRoot: () => writeFile(exitFile, 'exit'),
      fallback,
    }
  } catch (error) {
    try {
      await fallback()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Controlled fixture setup and teardown failed',
      )
    }
    throw error
  }
}

it('cooperatively disposes controlled-tree resources when setup misses its checkpoint', async () => {
  let spawned: DevProcess | undefined
  let directory: string | undefined
  const setup = controlledTree({
    checkpoint: 'missing-checkpoint',
    timeoutMs: 500,
    onSpawn: (dev, path) => {
      spawned = dev
      directory = path
    },
  })
  const regressionFallback = async (): Promise<void> => {
    // Baseline RED must also leave no processes behind; this is not the assertion.
    if (directory && spawned) {
      await writeFile(join(directory, 'stop-descendant'), 'stop').catch(
        () => {},
      )
      await writeFile(join(directory, 'exit-root'), 'exit').catch(() => {})
      const deadline = Date.now() + 2000
      while (true) {
        const records = await readJournal(
          join(directory, 'journal.jsonl'),
        ).catch(() => [] as Record[])
        if (
          records.some((record) => record.role === 'dev-descendant') &&
          (spawned.pid === undefined ||
            processState(spawned.pid) !== 'running') &&
          records.every((record) => processState(record.pid) !== 'running')
        )
          break
        if (
          !(await access(directory).then(
            () => true,
            () => false,
          ))
        )
          break
        if (Date.now() >= deadline)
          throw new Error('Setup regression fallback did not stop descendants')
        await delay(25)
      }
      spawned.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  }
  try {
    await expect(setup).rejects.toThrow('Missing controlled root checkpoint')
    if (!spawned || !directory || spawned.pid === undefined)
      throw new Error('Missing setup identity')
    expect(processState(spawned.pid)).not.toBe('running')
    expect(spawned.stdout.destroyed).toBe(true)
    expect(spawned.stderr.destroyed).toBe(true)
    await expect(access(directory)).rejects.toThrow()
  } finally {
    await regressionFallback()
  }
})

it('releases piped handles and prevents repeated termination after disposal', async () => {
  const fixture = await controlledTree()
  try {
    fixture.dev.dispose()
    fixture.dev.dispose()
    fixture.dev.kill('SIGTERM')
    fixture.dev.kill('SIGKILL')
    await delay(150)
    expect(fixture.dev.stdout.destroyed).toBe(true)
    expect(fixture.dev.stderr.destroyed).toBe(true)
    expect(processState(fixture.rootPid)).toBe('running')
    expect(processState(fixture.descendant.pid)).toBe('running')
    expect(
      await (await fetch(`http://127.0.0.1:${fixture.descendant.port}`)).text(),
    ).toBe('adversarial descendant')
  } finally {
    await fixture.fallback()
  }
})

it.runIf(process.platform === 'win32')(
  'terminates a real intact Windows tree without IPC signal simulation',
  async () => {
    const fixture = await controlledTree()
    try {
      const result = await cleanupDev(fixture.dev, new AbortController().signal)
      expect(result).toEqual({})
      expect(processState(fixture.rootPid)).toBe('absent')
      expect(processState(fixture.descendant.pid)).toBe('absent')
      await expect(
        fetch(`http://127.0.0.1:${fixture.descendant.port}`, {
          signal: AbortSignal.timeout(1000),
        }),
      ).rejects.toThrow()
    } finally {
      await fixture.fallback()
    }
  },
)

it.runIf(process.platform === 'win32')(
  'reports uncertainty when a Windows root exits before identity observation',
  async () => {
    const dev = spawnDev(
      { file: process.execPath, args: ['-e', 'process.exit(7)'] },
      tmpdir(),
    )
    try {
      await dev.exit
      if (dev.pid === undefined) throw new Error('Missing Windows root PID')
      const result = await cleanupDev(dev, new AbortController().signal)
      expect(result.error?.code).toBe('PROCESS_CLEANUP_ERROR')
      expect(processState(dev.pid)).toBe('absent')
    } finally {
      dev.dispose()
    }
  },
)
