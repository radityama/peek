#!/usr/bin/env node

import { defineCommand, renderUsage, runMain } from 'citty'
import packageJson from '../package.json' with { type: 'json' }
import { ensureCloudflared } from './cloudflared/binary.js'
import { loadConfig } from './core/config.js'
import {
  type DevCommand,
  selectDevCommand,
  selectExplicitCommand,
} from './core/dev-command.js'
import { runDoctor } from './core/doctor.js'
import { readFramework } from './core/framework.js'
import { Lifecycle } from './core/lifecycle.js'
import { parsePort } from './core/port.js'
import { readProject } from './core/project.js'
import { runPeek } from './core/run.js'
import { CloudflareProvider } from './tunnel/cloudflare.js'
import { JsonOutput } from './ui/json-output.js'
import { TerminalOutput } from './ui/output.js'
import type { QrMode } from './ui/qr.js'
import { checkForUpdate } from './update/check.js'
import { shouldCheckForUpdates } from './update/eligibility.js'
import { createUpdateNotice } from './update/notice.js'
import { formatError, PeekError } from './utils/errors.js'

const raw = process.argv.slice(2)
const boundary = raw.indexOf('--')
const normalArgs = boundary === -1 ? raw : raw.slice(0, boundary)
const commandArgs = normalArgs[0] === 'dev' ? normalArgs.slice(1) : normalArgs
const isDoctor = normalArgs[0] === 'doctor'
const parsedArgs = isDoctor ? commandArgs.slice(1) : commandArgs
const explicitArgv = boundary === -1 ? undefined : raw.slice(boundary + 1)
const wantsJson = normalArgs.includes('--json')

const flags = {
  port: {
    type: 'string',
    description: 'Port opened by the development server',
  },
  provider: { type: 'string', description: 'Tunnel provider (cloudflare)' },
  qr: {
    type: 'boolean',
    description: 'Show a terminal QR code when it fits',
    negativeDescription: 'Do not show a terminal QR code',
  },
  verbose: { type: 'boolean', description: 'Show diagnostic details' },
  lan: { type: 'boolean', description: 'Share on the local network only' },
  json: { type: 'boolean', description: 'Emit newline-delimited JSON events' },
  live: { type: 'boolean', description: 'Run live tunnel checks with doctor' },
  'host-header': {
    type: 'string',
    description: 'Use localhost as the origin Host header',
  },
} as const

interface CliArgs {
  _: string[]
  port: string | undefined
  provider: string | undefined
  qr: boolean | undefined
  verbose: boolean | undefined
  lan: boolean | undefined
  json: boolean | undefined
  live: boolean | undefined
  'host-header': string | undefined
}

async function execute(args: CliArgs): Promise<void> {
  let output = args.json ? new JsonOutput() : new TerminalOutput('auto')
  const lifecycle = new Lifecycle()
  const updateController = new AbortController()
  const updateNotice = createUpdateNotice(({ current, latest }) => {
    if (output instanceof TerminalOutput)
      output.updateAvailable(current, latest)
  })
  lifecycle.installSignals()
  try {
    const unknownFlags = Object.keys(args).filter(
      (key) =>
        ![
          '_',
          'port',
          'provider',
          'qr',
          'verbose',
          'lan',
          'json',
          'live',
          'hostHeader',
          'host-header',
        ].includes(key),
    )
    if (unknownFlags.length > 0) {
      throw new PeekError(
        'USAGE_ERROR',
        `Unknown option: --${unknownFlags[0]}`,
        'Use peek --help to see available flags.',
      )
    }
    if (args._.length > 0) {
      throw new PeekError(
        'USAGE_ERROR',
        `Unknown command or argument: ${args._.join(' ')}`,
        'Use peek --help to see available commands and flags.',
      )
    }
    if (args.live && !isDoctor) {
      throw new PeekError(
        'USAGE_ERROR',
        '--live requires peek doctor.',
        'Run peek doctor --live.',
      )
    }
    if (isDoctor && explicitArgv !== undefined) {
      throw new PeekError(
        'USAGE_ERROR',
        'peek doctor does not accept an explicit command.',
        'Run peek doctor from a project directory.',
      )
    }
    if (isDoctor && args.lan) {
      throw new PeekError(
        'USAGE_ERROR',
        'peek doctor does not support --lan.',
        'Run peek --lan to share a LAN preview, or peek doctor --live to check a tunnel.',
      )
    }
    if (
      isDoctor &&
      !args.live &&
      (args.port !== undefined ||
        args.qr !== undefined ||
        args.provider !== undefined ||
        args['host-header'] !== undefined)
    ) {
      throw new PeekError(
        'USAGE_ERROR',
        'Preview options require peek doctor --live.',
        'Remove the preview options or add --live.',
      )
    }
    if (args.provider !== undefined && args.provider !== 'cloudflare') {
      throw new PeekError(
        'USAGE_ERROR',
        `Provider ${JSON.stringify(args.provider)} is not available in Peek v${packageJson.version}.`,
        'Use --provider cloudflare or omit the flag.',
      )
    }
    if (args.lan && args.provider !== undefined) {
      throw new PeekError(
        'USAGE_ERROR',
        '--lan cannot be combined with --provider.',
        'Remove --provider to use the local network only.',
      )
    }
    if (
      args['host-header'] !== undefined &&
      args['host-header'] !== 'localhost'
    ) {
      throw new PeekError(
        'USAGE_ERROR',
        '--host-header only accepts localhost.',
        'Use --host-header localhost for a dev server that rejects the tunnel hostname.',
      )
    }
    if (args.lan && args['host-header'] !== undefined) {
      throw new PeekError(
        'USAGE_ERROR',
        '--host-header requires a public tunnel.',
        'Remove --host-header when using --lan.',
      )
    }
    if (args.port !== undefined && typeof args.port !== 'string') {
      throw new PeekError(
        'USAGE_ERROR',
        '--port needs a number.',
        'For example: peek --port 3000',
      )
    }
    if (isDoctor) {
      output.title()
      const checks = await runDoctor({ cwd: process.cwd() })
      for (const check of checks) output.doctorCheck(check)
      if (!args.live) {
        if (checks.some((check) => check.status === 'fail'))
          process.exitCode = 1
        return
      }
    }
    const config = await loadConfig(process.cwd())
    if (args.lan && config?.provider) {
      throw new PeekError(
        'USAGE_ERROR',
        '--lan cannot be combined with a configured tunnel provider.',
        'Remove provider from peek.config.ts to use the local network only.',
      )
    }
    const selectedProvider = args.provider ?? config?.provider ?? 'cloudflare'
    const effectiveQr = args.qr ?? config?.qr
    const qrMode: QrMode =
      effectiveQr === true ? 'on' : effectiveQr === false ? 'off' : 'auto'
    output = args.json ? new JsonOutput() : new TerminalOutput(qrMode)
    const explicitPort =
      args.port === undefined ? config?.port : parsePort(args.port)
    let project: Awaited<ReturnType<typeof readProject>> | undefined
    let command: DevCommand
    if (explicitArgv !== undefined) {
      command = selectExplicitCommand(explicitArgv)
    } else if (config?.command) {
      command = selectExplicitCommand(config.command)
    } else {
      project = await readProject(process.cwd())
      command = selectDevCommand(project.packageManager)
    }
    const framework = project?.framework ?? (await readFramework(process.cwd()))

    if (
      shouldCheckForUpdates({
        isDoctor,
        json: args.json === true,
        env: process.env,
      })
    ) {
      void checkForUpdate({
        currentVersion: packageJson.version,
        signal: AbortSignal.any([lifecycle.signal, updateController.signal]),
      })
        .then((result) => {
          if (!lifecycle.signal.aborted) updateNotice.receive(result)
        })
        .catch(() => {})
    }

    if (!isDoctor) output.title()
    if (project) output.success(`${project.packageManager} project`)
    let provider: CloudflareProvider | undefined
    if (!args.lan && selectedProvider === 'cloudflare') {
      output.info('Preparing tunnel engine...')
      const binaryPath = await ensureCloudflared({
        signal: lifecycle.signal,
        onDownload: () => output.info('Downloading cloudflared...'),
      })
      output.success('Tunnel engine ready')
      provider = new CloudflareProvider(
        binaryPath,
        undefined,
        args.verbose ? (line) => output.diagnostic(line) : undefined,
        args['host-header'] === 'localhost' ? 'localhost' : undefined,
      )
    }
    await runPeek({
      cwd: process.cwd(),
      command,
      ...(explicitPort === undefined ? {} : { explicitPort }),
      lifecycle,
      ...(provider ? { provider } : { lan: true }),
      onState: (state) => {
        if (state === 'starting') {
          output.state(
            state,
            project
              ? `Starting ${project.packageManager} dev...`
              : 'Starting command...',
          )
        } else if (state === 'waiting') {
          output.state(state, 'Waiting for server...')
        } else if (state === 'reconnecting') {
          output.state(state, 'Tunnel disconnected. Reconnecting...')
        } else {
          output.state(state, 'Connecting tunnel...')
        }
      },
      onDevOutput: (stream, text) => output.childOutput(stream, text),
      onServerReady: (port) => output.success(`Server ready on :${port}`),
      onReady: ({ localUrl, publicUrl }) => {
        output.ready(localUrl, publicUrl)
        updateNotice.ready()
      },
      onLanReady: (url) => {
        output.lanReady(url)
        updateNotice.ready()
      },
      framework,
      onPreviewFinding: (finding) =>
        finding.kind === 'hmr-unverified'
          ? output.info(finding.message)
          : output.warning(finding.kind, finding.message),
      onReconnectFailure: (attempt, message) =>
        output.warning(
          'reconnect-failed',
          `Tunnel reconnect attempt ${attempt} failed: ${message}`,
        ),
      onTunnelDrop: (message) => output.warning('tunnel-dropped', message),
      ...(isDoctor
        ? { onPreviewCheckComplete: () => lifecycle.requestStop() }
        : {}),
    })
    if (lifecycle.signalExitCode !== undefined)
      process.exitCode = lifecycle.signalExitCode
  } catch (error) {
    if (lifecycle.wasRequested) {
      process.exitCode = lifecycle.signalExitCode ?? 130
    } else {
      output.error(formatError(error, args.verbose === true))
      process.exitCode =
        error instanceof PeekError && error.code === 'USAGE_ERROR' ? 2 : 1
    }
  } finally {
    updateNotice.stop()
    updateController.abort()
    await lifecycle.stop()
  }
}

const main = defineCommand({
  meta: {
    name: 'peek',
    version: packageJson.version,
    description: 'Run your dev server. Share it instantly.',
  },
  args: flags,
  run: ({ args }) => execute(args),
})

if (wantsJson && normalArgs.includes('--version')) {
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, type: 'version', version: packageJson.version })}\n`,
  )
} else
  await runMain(main, {
    rawArgs: parsedArgs,
    showUsage: async (command, parent) => {
      const usage = await renderUsage(command, parent)
      const help =
        `${usage}\n` +
        'COMMANDS\n' +
        '  peek                     Run the detected dev script\n' +
        '  peek dev                 Same as peek\n' +
        '  peek doctor [--live]     Check the environment and preview\n' +
        '  peek -- pnpm dev         Run an explicit command\n\n' +
        '  --help                   Show this help\n' +
        '  --version                Show the version\n' +
        '  Flags go before --. Docs: https://github.com/radityprtama/peek\n'
      if (wantsJson) {
        process.stdout.write(
          `${JSON.stringify({ schemaVersion: 1, type: 'help', text: help })}\n`,
        )
      } else process.stdout.write(help)
    },
  })
