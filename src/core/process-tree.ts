import { type ChildProcess, execFile, execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

interface Member {
  pid: number
  identity: string
  running: boolean
}

export interface OwnedProcessTree {
  kill(signal: NodeJS.Signals): void
  waitForStop(signal: AbortSignal): Promise<void>
  dispose(): boolean
}

const psArgs = ['-e', '-o', 'pid=,pgid=,stat=,lstart=']

function linuxMember(pid: number, group: number): Member | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const fields = stat.slice(stat.lastIndexOf(') ') + 2).split(' ')
    if (Number(fields[2]) !== group) return
    if (!/^\d+$/.test(fields[19] ?? '')) {
      throw new Error(
        'Dev process inspection returned invalid creation identity evidence.',
      )
    }
    return {
      pid,
      identity: `${pid}:${fields[19]}`,
      running: fields[0] !== 'Z' && fields[0] !== 'X',
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ESRCH') return
    throw error
  }
}

function members(output: string, group: number): Member[] {
  const result: Member[] = []
  for (const line of output.trim().split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line)
    if (!match || Number(match[2]) !== group) continue
    const pid = Number(match[1])
    if (process.platform === 'linux') {
      const member = linuxMember(pid, group)
      if (member) result.push(member)
    } else {
      result.push({
        pid,
        identity: `${pid}:${match[4]}`,
        running: !match[3]?.startsWith('Z'),
      })
    }
  }
  return result
}

function inspectSync(group: number): Member[] {
  return members(
    execFileSync('ps', psArgs, {
      encoding: 'utf8',
      timeout: 500,
      killSignal: 'SIGKILL',
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    }),
    group,
  )
}

async function inspect(group: number, signal: AbortSignal): Promise<Member[]> {
  signal.throwIfAborted()
  if (process.platform === 'linux') {
    const deadline = performance.now() + 500
    return readdirSync('/proc').flatMap((name) => {
      if (performance.now() >= deadline) {
        throw new Error(
          'Dev process inspection exceeded its bounded snapshot deadline.',
        )
      }
      if (!/^\d+$/.test(name)) return []
      const member = linuxMember(Number(name), group)
      return member ? [member] : []
    })
  }
  return new Promise((resolve, reject) => {
    const inspector = execFile(
      'ps',
      psArgs,
      {
        encoding: 'utf8',
        timeout: 500,
        killSignal: 'SIGKILL',
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, LC_ALL: 'C' },
      },
      (error, stdout) => {
        if (error) reject(error)
        else {
          try {
            resolve(members(stdout, group))
          } catch (cause) {
            reject(cause)
          }
        }
      },
    )
    cancelJobOnAbort(inspector, signal)
  })
}

export function cancelJobOnAbort(
  child: ChildProcess,
  signal: AbortSignal,
): void {
  // execFile does not forward killSignal to its spawn AbortSignal handler.
  // Use the owned handle so cancellation cannot leave an ignored SIGTERM job.
  const abort = (): void => {
    child.kill('SIGKILL')
  }
  const remove = (): void => signal.removeEventListener('abort', abort)
  child.once('close', remove)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
}

interface GroupInspection {
  snapshotSync(group: number): Member[]
  snapshot(group: number, signal: AbortSignal): Promise<Member[]>
}

export function ownPosixTree(
  child: ChildProcess,
  inspection: GroupInspection = {
    snapshotSync: inspectSync,
    snapshot: inspect,
  },
): OwnedProcessTree {
  const group = child.pid
  const owner = new AbortController()
  let released = false
  let stopped = group === undefined
  let failure: unknown
  let identities = new Set<string>()
  let request: NodeJS.Signals | undefined
  const started = performance.now()
  const accept = (current: Member[], initial = false): void => {
    if (current.length === 0 || current.every((member) => !member.running)) {
      stopped = true
      return
    }
    if (
      !initial &&
      !current.some((member) => identities.has(member.identity))
    ) {
      throw new Error(
        'Dev process group identity could not be verified; refusing to signal a possibly reused group.',
      )
    }
    identities = new Set(current.map((member) => member.identity))
  }
  // Capture the root while its native handle still owns the newly spawned PID.
  if (group !== undefined) {
    try {
      const initial = inspection.snapshotSync(group)
      if (
        child.exitCode !== null ||
        child.signalCode !== null ||
        !initial.some((member) => member.pid === group)
      ) {
        throw new Error(
          'Dev root identity was unavailable before process group observation; resource shutdown is unconfirmed.',
        )
      }
      accept(initial, true)
    } catch (error) {
      failure = error
    }
  }
  const signalGroup = (signal: NodeJS.Signals): void => {
    if (released || stopped || group === undefined) return
    try {
      process.kill(-group, signal)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      stopped = true
    }
  }
  const observe = async (): Promise<void> => {
    while (
      !owner.signal.aborted &&
      !released &&
      !stopped &&
      failure === undefined &&
      group !== undefined
    ) {
      try {
        const current = await inspection.snapshot(group, owner.signal)
        if (released) return
        accept(current)
        if (request && !stopped) {
          const signal = request
          request = undefined
          signalGroup(signal)
        }
        if (!stopped) {
          // Early samples capture startup descendants; steady inspection avoids
          // repeatedly launching full process-table jobs on an idle preview.
          await delay(
            performance.now() - started < 1000 ? 100 : 250,
            undefined,
            {
              signal: owner.signal,
            },
          )
        }
      } catch (error) {
        if (!owner.signal.aborted) failure = error
      }
    }
  }
  const observation = observe()
  const abruptExit = (): void => {
    owner.abort()
    if (released || stopped || group === undefined) return
    try {
      accept(inspection.snapshotSync(group))
      signalGroup('SIGKILL')
    } catch (error) {
      process.stderr.write(
        `Peek could not confirm dev cleanup during abrupt exit: ${String(error)}\n`,
      )
    }
  }
  process.once('exit', abruptExit)
  return {
    kill(signal) {
      if (released || stopped) return
      if (failure !== undefined) throw failure
      if (request !== 'SIGKILL') request = signal
    },
    async waitForStop(signal) {
      const onAbort = (): void => owner.abort(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
      try {
        await observation
        if (failure !== undefined) throw failure
        if (!stopped)
          throw new Error(
            'Dev resource observation was cancelled before shutdown was confirmed.',
          )
      } finally {
        signal.removeEventListener('abort', onAbort)
      }
    },
    dispose() {
      if (released) return stopped
      released = true
      owner.abort()
      process.off('exit', abruptExit)
      return stopped
    },
  }
}

interface WindowsMember {
  pid: number
  parent: number
  born: string
}

// Internal source export: termination embeds it and the native timing probe
// measures the production command rather than a duplicated copy.
export const windowsSnapshot = `ConvertTo-Json -Compress -InputObject @(@(Get-CimInstance Win32_Process -ErrorAction Stop) | ForEach-Object {
  if ($null -ne $_.CreationDate) {
    @{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;born=$_.CreationDate.ToUniversalTime().Ticks.ToString()}
  }
})`

function windowsArgs(script: string): string[] {
  return [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    Buffer.from(`$ErrorActionPreference='Stop'; ${script}`, 'utf16le').toString(
      'base64',
    ),
  ]
}

function windowsJob(script: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const inspector = execFile(
      'powershell.exe',
      windowsArgs(script),
      {
        encoding: 'utf8',
        timeout: 1500,
        killSignal: 'SIGKILL',
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    )
    cancelJobOnAbort(inspector, signal)
  })
}

function windowsMembers(output: string): WindowsMember[] {
  const parsed: unknown = JSON.parse(output.trim() || '[]')
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.map((row: unknown) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !('pid' in row) ||
      !('parent' in row) ||
      !('born' in row) ||
      !Number.isInteger(row.pid) ||
      !Number.isInteger(row.parent) ||
      typeof row.born !== 'string' ||
      !/^\d+$/.test(row.born)
    ) {
      throw new Error(
        'Windows process inspection returned invalid creation identity evidence.',
      )
    }
    return {
      pid: row.pid as number,
      parent: row.parent as number,
      born: row.born,
    }
  })
}

export function windowsSelection(known: readonly WindowsMember[]): string {
  const identities = Buffer.from(JSON.stringify(known), 'utf8').toString(
    'base64',
  )
  // Windows PowerShell 5.1 emits a decoded JSON array as one pipeline object.
  // Assign it first, then enumerate and validate rows before any PID casts.
  return `
function Read-PeekProcessRows([string]$json) {
  $decoded = ConvertFrom-Json -InputObject $json
  if ($null -eq $decoded) { throw 'Windows process inspection returned invalid creation identity evidence.' }
  foreach ($row in @($decoded)) {
    $ticks = 0L
    if ($row -isnot [pscustomobject] -or
        ($row.pid -isnot [int] -and $row.pid -isnot [long]) -or $row.pid -lt 0 -or $row.pid -gt [int]::MaxValue -or
        ($row.parent -isnot [int] -and $row.parent -isnot [long]) -or $row.parent -lt 0 -or $row.parent -gt [int]::MaxValue -or
        $row.born -isnot [string] -or $row.born -notmatch '^[0-9]+$' -or ![long]::TryParse($row.born, [ref]$ticks)) {
      throw 'Windows process inspection returned invalid creation identity evidence.'
    }
    $row
  }
}
$known = @(Read-PeekProcessRows ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${identities}'))))
$allJson = ${windowsSnapshot}
$all = @(Read-PeekProcessRows $allJson)
$selected = @{}
foreach ($item in $known) {
  foreach ($row in $all) { if ($row.pid -eq $item.pid -and $row.born -eq $item.born) { $selected[[int]$row.pid] = $row } }
}
do {
  $added = $false
  foreach ($row in $all) {
    if (!$selected.ContainsKey([int]$row.pid) -and $selected.ContainsKey([int]$row.parent) -and [long]$row.born -ge [long]$selected[[int]$row.parent].born) {
      $selected[[int]$row.pid] = $row; $added = $true
    }
  }
} while ($added)
`
}

function windowsTermination(
  known: readonly WindowsMember[],
  root: number,
): string {
  // Open the handle before checking CIM identity. Kill uses that process object
  // even if the original process exits between the identity check and termination.
  return `${windowsSelection(known)}
$held = @()
$rootKilled = $false
try {
  foreach ($row in $selected.Values) {
    $p = $null
    try {
      $p = [Diagnostics.Process]::GetProcessById([int]$row.pid)
      $null = $p.Handle
      $current = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $row.pid)
      if ($null -ne $current -and $current.CreationDate.ToUniversalTime().Ticks.ToString() -eq $row.born -and !$p.HasExited) {
        $held += @{process=$p; row=$row}; $p = $null
      }
    } catch [ArgumentException] {} catch [InvalidOperationException] {} finally { if ($null -ne $p) { $p.Dispose() } }
  }
  foreach ($item in @($held | Sort-Object @{Expression={
    if ($_.row.pid -eq ${root}) { -1 } else {
      $depth = 0; $ancestor = $_.row; $seen = @{}
      while ($selected.ContainsKey([int]$ancestor.parent) -and !$seen.ContainsKey([int]$ancestor.parent)) {
        $seen[[int]$ancestor.parent] = $true
        $ancestor = $selected[[int]$ancestor.parent]; $depth++
      }
      $depth
    }
  };Descending=$true})) {
    if (!$item.process.HasExited) {
      $item.process.Kill()
      if ($item.row.pid -eq ${root}) { $rootKilled = $true }
    }
  }
  @{rootKilled=$rootKilled} | ConvertTo-Json -Compress
} finally { foreach ($item in $held) { $item.process.Dispose() } }
`
}

export function ownWindowsTree(
  child: ChildProcess,
  job: typeof windowsJob = windowsJob,
): OwnedProcessTree {
  const root = child.pid
  const owner = new AbortController()
  let released = false
  let stopped = root === undefined
  let rootExited = false
  let rootTerminationVerified = false
  let failure: unknown
  let request = false
  let initialized = false
  let uncertain = false
  let known = new Map<number, WindowsMember>()
  const started = performance.now()
  const onExit = (): void => {
    rootExited = true
  }
  child.once('exit', onExit)
  const observe = async (): Promise<void> => {
    while (
      !owner.signal.aborted &&
      !released &&
      !stopped &&
      failure === undefined &&
      root !== undefined
    ) {
      try {
        const current = windowsMembers(await job(windowsSnapshot, owner.signal))
        if (released) return
        if (!initialized) {
          const rootMember = current.find((member) => member.pid === root)
          if (!rootMember || rootExited) {
            throw new Error(
              'Windows dev root exited before its creation identity could be established; resource shutdown is unconfirmed.',
            )
          }
          known.set(root, rootMember)
          initialized = true
        }
        const live = new Map(
          current
            .filter((member) => known.get(member.pid)?.born === member.born)
            .map((member) => [member.pid, member]),
        )
        let added: boolean
        do {
          added = false
          for (const member of current) {
            const parent = live.get(member.parent)
            if (
              !live.has(member.pid) &&
              parent &&
              BigInt(member.born) >= BigInt(parent.born)
            ) {
              live.set(member.pid, member)
              added = true
            }
          }
        } while (added)
        if (rootExited && !rootTerminationVerified && !request) uncertain = true
        if (live.size === 0) {
          if (uncertain || (rootExited && !rootTerminationVerified)) {
            throw new Error(
              'Windows tracked dev resources stopped, but root-first exit left unobserved ancestry; full resource shutdown is unconfirmed.',
            )
          }
          stopped = true
          return
        }
        known = live
        if (request) {
          request = false
          const result: unknown = JSON.parse(
            await job(
              windowsTermination([...known.values()], root),
              owner.signal,
            ),
          )
          if (
            !result ||
            typeof result !== 'object' ||
            !('rootKilled' in result) ||
            typeof result.rootKilled !== 'boolean'
          ) {
            throw new Error(
              'Windows termination returned invalid confirmation evidence.',
            )
          }
          rootTerminationVerified ||= result.rootKilled
          if (rootExited && !rootTerminationVerified) uncertain = true
        }
        await delay(performance.now() - started < 1000 ? 100 : 250, undefined, {
          signal: owner.signal,
        })
      } catch (error) {
        if (!owner.signal.aborted) failure = error
      }
    }
  }
  const observation = observe()
  const abruptExit = (): void => {
    owner.abort()
    if (released || stopped || root === undefined || !initialized) return
    try {
      execFileSync(
        'powershell.exe',
        windowsArgs(windowsTermination([...known.values()], root)),
        {
          timeout: 1500,
          killSignal: 'SIGKILL',
          windowsHide: true,
          stdio: 'ignore',
        },
      )
    } catch (error) {
      process.stderr.write(
        `Peek could not confirm dev cleanup during abrupt exit: ${String(error)}\n`,
      )
    }
  }
  process.once('exit', abruptExit)
  return {
    kill() {
      if (released || stopped) return
      if (failure !== undefined) throw failure
      request = true
    },
    async waitForStop(signal) {
      const onAbort = (): void => owner.abort(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
      try {
        await observation
        if (failure !== undefined) throw failure
        if (!stopped)
          throw new Error(
            'Windows dev resource observation was cancelled before shutdown was confirmed.',
          )
      } finally {
        signal.removeEventListener('abort', onAbort)
      }
    },
    dispose() {
      if (released) return stopped
      released = true
      owner.abort()
      child.off('exit', onExit)
      process.off('exit', abruptExit)
      return stopped
    },
  }
}
