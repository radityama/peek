import { execFile } from 'node:child_process'
import { readdir, readFile, readlink } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { PeekError } from '../utils/errors.js'
import { COMMON_DEV_PORTS, extractLocalPorts, probePort } from './port.js'

const execFileAsync = promisify(execFile)

export class PortSignals {
  private readonly ports = new Set<number>()
  private pending = ''

  addChunk(chunk: string): void {
    this.pending += chunk
    const lines = this.pending.split(/[\r\n]+/)
    this.pending = lines.pop() ?? ''
    for (const line of lines) this.addLine(line)
  }

  getPorts(): number[] {
    const all = new Set(this.ports)
    for (const port of extractLocalPorts(this.pending)) all.add(port)
    return [...all]
  }

  private addLine(line: string): void {
    for (const port of extractLocalPorts(line)) this.ports.add(port)
  }
}

export interface WaitForServerOptions {
  explicitPort?: number
  signals: PortSignals
  baselineOpen: ReadonlySet<number>
  signal: AbortSignal
  hasExited: () => boolean
  inspectPorts?: () => Promise<readonly number[]>
  commonPorts?: readonly number[]
  timeoutMs?: number
}

export async function captureBaselinePorts(
  explicitPort?: number,
): Promise<Set<number>> {
  const ports = new Set<number>(COMMON_DEV_PORTS)
  if (explicitPort !== undefined) ports.add(explicitPort)
  const checks = await Promise.all(
    [...ports].map(async (port) => [port, await probePort(port)] as const),
  )
  return new Set(checks.filter(([, open]) => open).map(([port]) => port))
}

export async function waitForServer(
  options: WaitForServerOptions,
): Promise<number> {
  const {
    explicitPort,
    signals,
    baselineOpen,
    signal,
    hasExited,
    inspectPorts = async () => [],
    commonPorts = COMMON_DEV_PORTS,
    timeoutMs = 60_000,
  } = options
  if (explicitPort !== undefined && baselineOpen.has(explicitPort)) {
    throw new PeekError(
      'SERVER_DETECTION_ERROR',
      `Port ${explicitPort} was already in use before Peek started the dev server.`,
      'Stop the existing service or choose a different --port.',
    )
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    if (hasExited()) {
      throw new PeekError(
        'SERVER_START_ERROR',
        'The development server exited before becoming ready.',
        'Check the dev server output above and fix its startup error.',
      )
    }

    if (explicitPort !== undefined) {
      if (await probePort(explicitPort, signal)) {
        const owned = await inspectPorts()
        signal.throwIfAborted()
        if (owned.length > 0 && !owned.includes(explicitPort)) {
          throw new PeekError(
            'SERVER_DETECTION_ERROR',
            `Port ${explicitPort} is reachable but does not belong to the dev process.`,
            'Choose the port opened by this dev server or check for another local service.',
          )
        }
        return explicitPort
      }
    } else {
      const outputPorts = signals
        .getPorts()
        .filter((port) => !baselineOpen.has(port))
      const outputReady = await readyPorts(outputPorts, signal)
      if (outputReady.length > 1) throw ambiguousPorts(outputReady)
      if (outputReady[0] !== undefined) {
        const selected = outputReady[0]
        const owned = await inspectPorts()
        signal.throwIfAborted()
        if (owned.length > 0 && !owned.includes(selected)) {
          throw new PeekError(
            'SERVER_DETECTION_ERROR',
            `The announced port ${selected} does not belong to the dev process.`,
            'Check the dev server output and select its port with --port <number>.',
          )
        }
        if (owned.includes(selected) || commonPorts.includes(selected))
          return selected
      }

      // Once a dev process announces a port, a concurrent listener must not
      // displace it just because that other listener becomes ready first.
      if (signals.getPorts().length > 0) {
        await delay(200, undefined, { signal })
        continue
      }

      const ownedReady = await readyPorts(await inspectPorts(), signal)
      if (ownedReady.length > 1) throw ambiguousPorts(ownedReady)
      if (ownedReady[0] !== undefined) return ownedReady[0]

      const commonReady = await readyPorts(
        commonPorts.filter((port) => !baselineOpen.has(port)),
        signal,
      )
      if (commonReady.length > 1) throw ambiguousPorts(commonReady)
      if (commonReady[0] !== undefined) return commonReady[0]
    }
    await delay(200, undefined, { signal })
  }
  throw new PeekError(
    'SERVER_TIMEOUT',
    'Peek could not find a ready development server within 60 seconds.',
    'Check the server output, then retry with --port <number> if it uses an unusual port.',
  )
}

async function readyPorts(
  candidates: readonly number[],
  signal: AbortSignal,
): Promise<number[]> {
  const unique = [...new Set(candidates)]
  const checked = await Promise.all(
    unique.map(async (port) => [port, await probePort(port, signal)] as const),
  )
  return checked.filter(([, ready]) => ready).map(([port]) => port)
}

function ambiguousPorts(ports: readonly number[]): PeekError {
  return new PeekError(
    'SERVER_DETECTION_ERROR',
    `Peek found multiple ready ports: ${ports.join(', ')}.`,
    'Select the development server explicitly with --port <number>.',
  )
}

export interface ListenerInspection {
  available: boolean
  ports: readonly number[]
}

export async function inspectChildListeners(
  pid: number | undefined,
  signal?: AbortSignal,
  expectedPort?: number,
): Promise<ListenerInspection> {
  if (pid === undefined) return { available: false, ports: [] }
  signal?.throwIfAborted()
  try {
    if (process.platform === 'linux')
      return { available: true, ports: await inspectLinux(pid) }
    if (process.platform === 'darwin')
      return { available: true, ports: await inspectMac(pid, signal) }
    if (process.platform === 'win32')
      return await inspectWindows(pid, signal, expectedPort)
  } catch {
    // Cancellation must survive the optional-inspection fallback below.
    signal?.throwIfAborted()
  }
  return { available: false, ports: [] }
}

export async function inspectChildListeningPorts(
  pid: number | undefined,
  signal?: AbortSignal,
): Promise<number[]> {
  return [...(await inspectChildListeners(pid, signal)).ports]
}

// Verify that the fixed selected port is still reachable and still belongs to
// the dev process. An unavailable inspection is not evidence of ownership loss,
// so only a confirmed empty or mismatched listener set is rejected.
export async function verifySelectedServer(
  pid: number | undefined,
  port: number,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  if (!(await probePort(port, signal))) {
    throw new PeekError(
      'SERVER_DETECTION_ERROR',
      `The selected dev server on port ${port} is no longer reachable.`,
      'Restart Peek after the dev server is ready; Peek does not switch ports during a preview.',
    )
  }
  const inspected = await inspectChildListeners(pid, signal, port)
  signal.throwIfAborted()
  if (inspected.available && !inspected.ports.includes(port)) {
    throw new PeekError(
      'SERVER_DETECTION_ERROR',
      `Port ${port} no longer belongs to the selected dev process.`,
      'Stop the unrelated listener and restart Peek with the dev server port.',
    )
  }
}

async function inspectLinux(rootPid: number): Promise<number[]> {
  const pids = await linuxDescendants(rootPid)
  const inodes = new Set<string>()
  for (const pid of pids) {
    let descriptors: string[]
    try {
      descriptors = await readdir(`/proc/${pid}/fd`)
    } catch {
      continue
    }
    for (const fd of descriptors) {
      try {
        const link = await readlink(`/proc/${pid}/fd/${fd}`)
        const match = /^socket:\[(\d+)\]$/.exec(link)
        if (match?.[1]) inodes.add(match[1])
      } catch {
        // A descriptor may close while it is being inspected.
      }
    }
  }
  const ports = new Set<number>()
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    const lines = (await readFile(table, 'utf8')).trim().split('\n').slice(1)
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      const local = parts[1]
      const state = parts[3]
      const inode = parts[9]
      if (state !== '0A' || !local || !inode || !inodes.has(inode)) continue
      const hex = local.split(':').pop()
      if (hex) ports.add(Number.parseInt(hex, 16))
    }
  }
  return [...ports]
}

async function linuxDescendants(rootPid: number): Promise<number[]> {
  const result: number[] = []
  const queue = [rootPid]
  const seen = new Set<number>()
  while (queue.length > 0) {
    const pid = queue.shift()
    if (pid === undefined || seen.has(pid)) continue
    seen.add(pid)
    result.push(pid)
    try {
      const children = await readFile(
        `/proc/${pid}/task/${pid}/children`,
        'utf8',
      )
      for (const value of children.trim().split(/\s+/)) {
        const child = Number(value)
        if (Number.isInteger(child) && child > 0) queue.push(child)
      }
    } catch {
      // The process may have exited.
    }
  }
  return result
}

async function inspectMac(
  rootPid: number,
  signal?: AbortSignal,
): Promise<number[]> {
  const pids = [rootPid]
  for (let index = 0; index < pids.length; index++) {
    const pid = pids[index]
    if (pid === undefined) continue
    try {
      const { stdout } = await execFileAsync('pgrep', ['-P', String(pid)], {
        timeout: 500,
        signal,
      })
      for (const value of stdout.trim().split(/\s+/)) {
        const child = Number(value)
        if (Number.isInteger(child) && child > 0 && !pids.includes(child))
          pids.push(child)
      }
    } catch {
      signal?.throwIfAborted()
      // pgrep exits with code 1 when there are no children.
    }
  }
  const { stdout } = await lsofListening(pids, signal)
  return parsePortLines(stdout)
}

// lsof exits 1 when the filter matches no descriptor. That is a confirmed
// empty listener set, not an unavailable inspection.
async function lsofListening(
  pids: number[],
  signal?: AbortSignal,
): Promise<{ stdout: string }> {
  try {
    return await execFileAsync(
      'lsof',
      ['-nP', '-a', '-p', pids.join(','), '-iTCP', '-sTCP:LISTEN'],
      { timeout: 1000, signal },
    )
  } catch (error) {
    signal?.throwIfAborted()
    const code = (error as { code?: number | string }).code
    if (code === 1 || code === '1') return { stdout: '' }
    throw error
  }
}

async function inspectWindows(
  rootPid: number,
  signal?: AbortSignal,
  expectedPort?: number,
): Promise<ListenerInspection> {
  const opened = new Set<number>()
  let directAvailable = false
  try {
    const { stdout: netstat } = await execFileAsync(
      'netstat',
      ['-ano', '-p', 'tcp'],
      { timeout: 2000, signal },
    )
    directAvailable = true
    for (const line of netstat.split('\n')) {
      const match = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i.exec(
        line,
      )
      if (match?.[1] && Number(match[2]) === rootPid)
        opened.add(Number(match[1]))
    }
  } catch {
    signal?.throwIfAborted()
    // Descendant inspection below remains available without netstat.
  }
  if (!directAvailable) return { available: false, ports: [...opened] }
  // netstat already proves the root owns the expected port; the expensive
  // descendant scan is only needed to prove the negative or widen the set.
  if (expectedPort !== undefined && opened.has(expectedPort))
    return { available: true, ports: [...opened] }
  const script = `$ids = @(${rootPid}); $all = Get-CimInstance Win32_Process; do { $new = @($all | Where-Object { $ids -contains $_.ParentProcessId } | ForEach-Object ProcessId); $next = @($new | Where-Object { $ids -notcontains $_ }); $ids += $next } while ($next.Count -gt 0); Get-NetTCPConnection -State Listen | Where-Object { $ids -contains $_.OwningProcess } | Select-Object -ExpandProperty LocalPort`
  let descendantsAvailable = false
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 2000, signal },
    )
    descendantsAvailable = true
    for (const value of stdout.trim().split(/\s+/)) {
      const port = Number(value)
      if (Number.isInteger(port) && port > 0 && port <= 65535) opened.add(port)
    }
  } catch {
    signal?.throwIfAborted()
    // Keep the direct root evidence when descendant inspection is unavailable.
  }
  // Direct netstat only proves the root listener; a confirmed empty set needs
  // both readers. Verify therefore accepts an unavailable descendant read.
  return {
    available: directAvailable && descendantsAvailable,
    ports: [...opened],
  }
}

function parsePortLines(stdout: string): number[] {
  const ports = new Set<number>()
  for (const line of stdout.split('\n')) {
    const match = /:(\d+)\s+\(LISTEN\)/.exec(line)
    if (match?.[1]) ports.add(Number(match[1]))
  }
  return [...ports]
}
