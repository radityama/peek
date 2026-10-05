import { type ChildProcess, spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inject } from 'vitest'

export interface CliEvent extends Record<string, unknown> {
  type: string
}

export interface JournalRecord {
  role: string
  argv?: string[]
  pid?: number
  port?: number
  targetPort?: number
  targetUrl?: string
  attempt?: number
  originHostHeader?: string
}

export interface CliOptions {
  fixture?: 'ordinary' | 'adversarial'
  entry?: 'injected' | 'shipped'
  outputMode?: 'json' | 'human'
  packageJson?: string
  args?: string[]
  project?: boolean
  config?: string
  mode?:
    | 'announced'
    | 'silent'
    | 'delayed'
    | 'crash'
    | 'tree'
    | 'blocked-host'
    | 'ignore-sigterm'
  port?: number
  bind?: '127.0.0.1' | '0.0.0.0'
  providerMode?:
    | 'normal'
    | 'fail-once'
    | 'always-fail'
    | 'connect-pending'
    | 'reconnect-pending'
    | 'disconnect-on-force'
    | 'disconnect-error'
  framework?: 'node' | 'vite'
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

export interface CliExit {
  code: number | null
  signal: NodeJS.Signals | null
}

export interface CliHandle {
  readonly stdout: string
  readonly stderr: string
  readonly events: readonly CliEvent[]
  readonly directory: string
  waitForEvent(
    type: string,
    predicate?: (event: CliEvent) => boolean,
  ): Promise<CliEvent>
  waitForExit(): Promise<CliExit>
  signal(name: 'SIGINT' | 'SIGTERM'): Promise<void>
  readJournal(): Promise<JournalRecord[]>
  waitForJournal(
    role: string,
    predicate?: (record: JournalRecord) => boolean,
  ): Promise<JournalRecord>
  assertResourcesStopped(): Promise<void>
  dispose(): Promise<void>
}

const ordinaryFixture = fileURLToPath(
  new URL('../fixtures/cli/server.mjs', import.meta.url),
)
const transport = fileURLToPath(
  new URL('../fixtures/cli/transport.mjs', import.meta.url),
)
const shippedEntry = fileURLToPath(
  new URL('../../dist/cli.js', import.meta.url),
)

export async function startCli(options: CliOptions = {}): Promise<CliHandle> {
  const fixture =
    options.fixture === 'adversarial'
      ? fileURLToPath(
          new URL('../fixtures/cli/adversarial.mjs', import.meta.url),
        )
      : ordinaryFixture
  const directory = await mkdtemp(join(tmpdir(), 'peek cli-'))
  const journal = join(directory, 'journal.jsonl')
  let allocatedChild: ChildProcess | undefined
  let childClosed: Promise<void> | undefined
  try {
    await writeFile(journal, '')
    // A leading quoted executable is parsed differently by npm's Windows command shell.
    await writeFile(
      join(directory, 'dev.mjs'),
      `import ${JSON.stringify(pathToFileURL(fixture).href)}\n`,
    )
    await writeFile(
      join(directory, 'package.json'),
      options.packageJson ??
        JSON.stringify({
          name: 'peek-cli-fixture',
          private: true,
          packageManager: 'npm',
          scripts: {
            dev: 'node ./dev.mjs',
          },
          ...(options.framework === 'vite'
            ? { devDependencies: { vite: '*' } }
            : {}),
        }),
    )
    if (options.config !== undefined) {
      await writeFile(join(directory, 'peek.config.ts'), options.config)
    }
    const args = [...(options.args ?? ['--json'])]
    if (!options.project) args.push('--', process.execPath, fixture)
    const entry =
      options.entry === 'shipped' ? shippedEntry : inject('cliTestEntry')
    const child = spawn(process.execPath, [entry, ...args], {
      cwd: directory,
      env: {
        ...process.env,
        CI: '1',
        NODE_ENV: 'test',
        PEEK_TEST_JOURNAL: journal,
        PEEK_TEST_MODE: options.mode ?? 'announced',
        PEEK_TEST_PORT: String(options.port ?? 0),
        PEEK_TEST_BIND: options.bind ?? '127.0.0.1',
        PEEK_TEST_PROVIDER_MODE: options.providerMode ?? 'normal',
        PEEK_TEST_TRANSPORT: transport,
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    allocatedChild = child
    child.on('error', () => {})
    childClosed = new Promise((resolve) => child.once('close', () => resolve()))
    let stdout = ''
    let stderr = ''
    let pending = ''
    let failure: Error | undefined
    let exit: CliExit | undefined
    let exitedAt: number | undefined
    let closed = false
    let disposed = false
    const events: CliEvent[] = []
    const json =
      options.outputMode === undefined
        ? args.includes('--json')
        : options.outputMode === 'json'
    const parseLine = (line: string): void => {
      if (!json || !line.trim()) return
      try {
        const event: unknown = JSON.parse(line)
        if (
          !event ||
          typeof event !== 'object' ||
          !('type' in event) ||
          typeof event.type !== 'string'
        ) {
          throw new Error('Expected an object with an event type')
        }
        events.push(event as CliEvent)
      } catch (cause) {
        failure ??= new Error(`Malformed CLI stdout: ${line.slice(0, 300)}`, {
          cause,
        })
      }
    }
    if (!child.stdout || !child.stderr)
      throw new Error('Missing CLI output streams')
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) parseLine(line)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      failure ??= error
    })
    child.on('exit', (code, signal) => {
      exit = { code, signal }
      exitedAt = Date.now()
    })
    child.on('close', (code, signal) => {
      parseLine(pending)
      pending = ''
      exit = { code, signal }
      closed = true
    })
    if (child.pid)
      appendFileSync(
        journal,
        `${JSON.stringify({ role: 'cli', pid: child.pid })}\n`,
      )
    const diagnostic = (): string =>
      `\nstdout tail:\n${stdout.slice(-4000)}\nstderr tail:\n${stderr.slice(-4000)}`
    const wait = async <T>(
      description: string,
      observe: () => T | undefined,
      milliseconds: number,
      checkFailure = true,
      rejectAfterExit = false,
    ): Promise<T> => {
      const deadline = Date.now() + milliseconds
      while (Date.now() < deadline) {
        if (checkFailure && failure)
          throw new Error(`${failure.message}${diagnostic()}`, {
            cause: failure,
          })
        const result = observe()
        if (result !== undefined) return result
        // Give the final stdout bytes one turn to arrive, without waiting for inherited pipes forever.
        if (
          checkFailure &&
          (closed ||
            (rejectAfterExit &&
              exitedAt !== undefined &&
              Date.now() - exitedAt > 100))
        )
          throw new Error(
            `CLI closed before ${description} (${JSON.stringify(exit)})${diagnostic()}`,
          )
        await delay(25)
      }
      throw new Error(`Timed out waiting for ${description}${diagnostic()}`)
    }
    const readJournal = async (): Promise<JournalRecord[]> => {
      const contents = await readFile(journal, 'utf8')
      return contents
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as JournalRecord)
    }
    const signal = async (name: 'SIGINT' | 'SIGTERM'): Promise<void> => {
      if (exit) return
      if (process.platform === 'win32' && options.entry !== 'shipped') {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Signal handler IPC timed out')),
            1000,
          )
          child.send({ type: 'signal-handler', signal: name }, (error) => {
            clearTimeout(timeout)
            error ? reject(error) : resolve()
          })
        })
      } else child.kill(name)
    }
    const resources = async (): Promise<{
      pids: number[]
      ports: number[]
    }> => {
      const records = await readJournal()
      return {
        pids: [
          ...new Set(
            records.flatMap((record) =>
              record.pid === undefined ? [] : [record.pid],
            ),
          ),
        ],
        ports: [
          ...new Set(
            records.flatMap((record) =>
              record.port === undefined ? [] : [record.port],
            ),
          ),
        ],
      }
    }
    return {
      directory,
      get stdout() {
        return stdout
      },
      get stderr() {
        return stderr
      },
      get events() {
        return events
      },
      waitForEvent: (type, predicate = () => true) =>
        wait(
          `event ${type}`,
          () => events.find((event) => event.type === type && predicate(event)),
          options.timeoutMs ?? 12_000,
          true,
          true,
        ),
      waitForExit: () =>
        wait(
          'CLI close',
          () => (closed ? exit : undefined),
          options.timeoutMs ?? 10_000,
        ),
      signal,
      readJournal,
      waitForJournal: async (role, predicate = () => true) => {
        const deadline = Date.now() + (options.timeoutMs ?? 12_000)
        let records: JournalRecord[] = []
        while (Date.now() < deadline) {
          records = await readJournal()
          const record = records.find(
            (record) => record.role === role && predicate(record),
          )
          if (failure)
            throw new Error(`${failure.message}${diagnostic()}`, {
              cause: failure,
            })
          if (record) return record
          if (closed) break
          await delay(25)
        }
        throw new Error(
          `Missing journal checkpoint ${role} (${JSON.stringify(exit)})\nJournal tail:\n${JSON.stringify(records.slice(-12))}${diagnostic()}`,
        )
      },
      assertResourcesStopped: async () => {
        const { pids, ports } = await resources()
        await wait(
          `journalled processes to stop (${pids.join(', ')})`,
          () => (pids.every((pid) => !isAlive(pid)) ? true : undefined),
          5000,
          false,
        )
        const open = (
          await Promise.all(
            ports.map(async (port) =>
              (await portOpen(port)) ? port : undefined,
            ),
          )
        ).filter((port) => port !== undefined)
        if (open.length)
          throw new Error(
            `Journalled ports still open: ${open.join(', ')}${diagnostic()}`,
          )
      },
      dispose: async () => {
        if (disposed) return
        disposed = true
        try {
          await signal('SIGTERM').catch(() => {})
          await wait(
            'graceful fallback close',
            () => (closed ? true : undefined),
            5000,
            false,
          ).catch(() => {})
          // This runs after test assertions; forced cleanup must never prove Peek's cleanup worked.
          const { pids } = await resources()
          for (const pid of pids.reverse()) {
            if (isAlive(pid)) {
              try {
                process.kill(pid, 'SIGKILL')
              } catch {}
              await wait(
                `fallback process ${pid} to stop`,
                () => (!isAlive(pid) ? true : undefined),
                1000,
                false,
              ).catch(() => {})
            }
          }
          await wait(
            'forced fallback close',
            () => (closed ? true : undefined),
            2000,
            false,
          )
          await wait(
            'fallback resources to stop',
            () => (pids.every((pid) => !isAlive(pid)) ? true : undefined),
            2000,
            false,
          )
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      },
    }
  } catch (error) {
    try {
      allocatedChild?.kill('SIGTERM')
      if (childClosed) await boundedClose(childClosed, 2000)
      const contents = await readFile(journal, 'utf8').catch(() => '')
      const records = contents
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as JournalRecord)
      const pids = [
        ...new Set(
          records.flatMap((record) =>
            record.pid === undefined ? [] : [record.pid],
          ),
        ),
      ]
      for (const pid of pids.reverse()) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {}
        await delay(25)
      }
      allocatedChild?.kill('SIGKILL')
      if (childClosed) await boundedClose(childClosed, 1000)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
    throw error
  }
}

async function boundedClose(
  closed: Promise<void>,
  milliseconds: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    closed,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, milliseconds)
    }),
  ])
  clearTimeout(timer)
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (open: boolean): void => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(500, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}
