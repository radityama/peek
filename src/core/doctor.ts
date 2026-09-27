import { access } from 'node:fs/promises'
import { whichCommand } from 'which-command'
import { inspectCachedCloudflared } from '../cloudflared/binary.js'
import type { PeekConfig } from '../config.js'
import { loadConfig } from './config.js'
import { readProject } from './project.js'

export interface DoctorCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  remedy?: string
}

export interface DoctorOptions {
  cwd: string
  networkCheck?: () => Promise<boolean>
}

export async function runDoctor(
  options: DoctorOptions,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []
  const major = Number(process.versions.node.split('.')[0])
  checks.push(
    major >= 22
      ? {
          name: 'node',
          status: 'pass',
          message: `Node.js ${process.versions.node}`,
        }
      : {
          name: 'node',
          status: 'fail',
          message: `Node.js ${process.versions.node} is unsupported.`,
          remedy: 'Install Node.js 22 or newer.',
        },
  )

  let config: PeekConfig | undefined
  try {
    config = await loadConfig(options.cwd)
    checks.push({
      name: 'config',
      status: 'pass',
      message: config ? 'peek.config.ts is valid.' : 'No config is needed.',
    })
  } catch (error) {
    checks.push({
      name: 'config',
      status: 'fail',
      message: String(error),
      remedy: 'Fix or remove peek.config.ts.',
    })
  }

  try {
    const project = config?.command ? undefined : await readProject(options.cwd)
    const file = config?.command?.[0] ?? project?.packageManager
    if (!file) throw new Error('No development command could be selected.')
    const executable = await whichCommand(file, { cwd: options.cwd })
    checks.push(
      executable
        ? { name: 'command', status: 'pass', message: `${file} is available.` }
        : {
            name: 'command',
            status: 'fail',
            message: `${file} is unavailable.`,
            remedy: `Install ${file} or select an available command.`,
          },
    )
  } catch (error) {
    checks.push({
      name: 'command',
      status: 'fail',
      message: String(error),
      remedy: 'Add a dev script or configure a command.',
    })
  }

  try {
    const cache = await inspectCachedCloudflared()
    checks.push(
      cache === 'verified'
        ? {
            name: 'cloudflared',
            status: 'pass',
            message: 'Cached binary checksum is valid.',
          }
        : {
            name: 'cloudflared',
            status: 'warn',
            message: 'No verified binary is cached.',
            remedy: 'A normal peek run will download and verify cloudflared.',
          },
    )
  } catch (error) {
    checks.push({
      name: 'cloudflared',
      status: 'fail',
      message: String(error),
      remedy: 'Use a supported platform and architecture.',
    })
  }

  try {
    const reachable = await (options.networkCheck ?? defaultNetworkCheck)()
    checks.push(
      reachable
        ? {
            name: 'network',
            status: 'pass',
            message: 'Cloudflare is reachable.',
          }
        : {
            name: 'network',
            status: 'warn',
            message: 'Cloudflare was not reachable.',
            remedy: 'Check the network before starting a public tunnel.',
          },
    )
  } catch {
    checks.push({
      name: 'network',
      status: 'warn',
      message: 'Network check could not complete.',
      remedy: 'Check the network before starting a public tunnel.',
    })
  }

  try {
    if (process.platform === 'linux') {
      await access('/proc/net/tcp')
      await access('/proc/net/tcp6')
    } else if (process.platform === 'darwin' && !(await whichCommand('lsof')))
      throw new Error('lsof is unavailable')
    else if (
      process.platform === 'win32' &&
      !(await whichCommand('powershell.exe'))
    )
      throw new Error('PowerShell is unavailable')
    checks.push({
      name: 'port-inspection',
      status: 'pass',
      message: 'Process socket inspection is available.',
    })
  } catch {
    checks.push({
      name: 'port-inspection',
      status: 'warn',
      message: 'Process socket inspection is unavailable.',
      remedy: 'Use --port if automatic discovery cannot verify the server.',
    })
  }
  return checks
}

async function defaultNetworkCheck(): Promise<boolean> {
  const response = await fetch('https://www.cloudflare.com/', {
    method: 'HEAD',
    signal: AbortSignal.timeout(5_000),
  })
  return response.status < 500
}
