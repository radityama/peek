import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import {
  type DevProcess,
  isMissingWindowsCommand,
  spawnDev,
} from '../../src/core/process.js'

interface Record {
  role: string
  pid: number
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
    await writeFile(stopFile, 'stop')
    dev.kill('SIGKILL')
    await waitForPipeClosure(dev)
    const records = await readJournal(journal)
    await delay(50)
    for (const record of records) {
      let state = 'terminated'
      try {
        process.kill(record.pid, 0)
        state =
          process.platform === 'linux'
            ? ((await readFile(`/proc/${record.pid}/stat`, 'utf8')).split(
                ') ',
              )[1]?.[0] ?? 'unknown')
            : 'present'
      } catch {}
      console.info('fallback state', JSON.stringify({ ...record, state }))
    }
    await rm(directory, { recursive: true, force: true })
  }
})
