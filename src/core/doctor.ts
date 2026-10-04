import { access } from 'node:fs/promises'
import { whichCommand } from 'which-command'
import packageJson from '../../package.json' with { type: 'json' }
import { inspectCachedCloudflared } from '../cloudflared/binary.js'
import { CLOUDFLARED_VERSION } from '../cloudflared/platform.js'
import type { PeekConfig } from '../config.js'
import { formatError, PeekError } from '../utils/errors.js'
import { loadConfig } from './config.js'
import { readProject } from './project.js'

export interface DoctorCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  remedy?: string
  detail?: string
}

function failedCheck(
  name: string,
  error: unknown,
  remedy: string,
  verbose: boolean,
): DoctorCheck {
  return {
    name,
    status: 'fail',
    message: error instanceof PeekError ? error.message : formatError(error),
    remedy: error instanceof PeekError ? error.hint : remedy,
    ...(verbose ? { detail: formatError(error, true) } : {}),
  }
}

export interface DoctorOptions {
  cwd: string
  networkCheck?: () => Promise<boolean>
  verbose?: boolean
}

export async function runDoctor(
  options: DoctorOptions,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []
  checks.push({
    name: 'peek',
    status: 'pass',
    message: `Peek ${packageJson.version}`,
  })
  checks.push({
    name: 'platform',
    status: 'pass',
    message: `${process.platform}/${process.arch}`,
  })
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
    checks.push(
      failedCheck(
        'config',
        error,
        'Fix or remove peek.config.ts.',
        options.verbose === true,
      ),
    )
  }

  try {
    const project = config?.command ? undefined : await readProject(options.cwd)
    checks.push({
      name: 'project',
      status: 'pass',
      message: project
        ? `${project.packageManager} project with a dev script.`
        : 'Using a configured command; project detection skipped.',
    })
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
    for (const name of ['project', 'command']) {
      checks.push(
        failedCheck(
          name,
          error,
          'Add a dev script or configure a command.',
          options.verbose === true,
        ),
      )
    }
  }

  try {
    const cache = await inspectCachedCloudflared()
    checks.push(
      cache === 'verified'
        ? {
            name: 'cloudflared',
            status: 'pass',
            message: `Cached cloudflared ${CLOUDFLARED_VERSION} checksum is valid.`,
            ...(options.verbose
              ? {
                  detail:
                    'The cached binary matches its pinned SHA-256 digest.',
                }
              : {}),
          }
        : {
            name: 'cloudflared',
            status: 'warn',
            message: `No verified cloudflared ${CLOUDFLARED_VERSION} binary is cached.`,
            remedy: 'A normal peek run will download and verify cloudflared.',
            ...(options.verbose
              ? { detail: 'Peek never runs an unverified cached binary.' }
              : {}),
          },
    )
  } catch (error) {
    checks.push(
      failedCheck(
        'cloudflared',
        error,
        'Use a supported platform and architecture.',
        options.verbose === true,
      ),
    )
  }

  try {
    const reachable = await (options.networkCheck ?? defaultNetworkCheck)()
    checks.push(
      reachable
        ? {
            name: 'network',
            status: 'pass',
            message:
              'Cloudflare HTTPS is reachable; tunnel port 7844 is not checked.',
            ...(options.verbose
              ? {
                  detail:
                    'HTTPS HEAD has a 5-second timeout; cloudflared needs outbound UDP or TCP port 7844.',
                }
              : {}),
          }
        : {
            name: 'network',
            status: 'warn',
            message: 'Cloudflare was not reachable.',
            remedy:
              'Check HTTPS access and outbound port 7844 before starting a public tunnel.',
            ...(options.verbose
              ? {
                  detail:
                    'HTTPS HEAD has a 5-second timeout; cloudflared needs outbound UDP or TCP port 7844.',
                }
              : {}),
          },
    )
  } catch {
    checks.push({
      name: 'network',
      status: 'warn',
      message: 'Network check could not complete.',
      remedy:
        'Check HTTPS access and outbound port 7844 before starting a public tunnel.',
    })
  }

  try {
    if (!['linux', 'darwin', 'win32'].includes(process.platform))
      throw new Error('Process socket inspection is unsupported')
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
