import { createConsola } from 'consola'
import pc from 'picocolors'
import type { DoctorCheck } from '../core/doctor.js'
import type { QrMode } from './qr.js'
import { renderQr } from './qr.js'

const logger = createConsola({
  reporters: [
    {
      log(entry) {
        const symbol =
          entry.type === 'success'
            ? pc.green('✓')
            : entry.type === 'error'
              ? pc.red('✗')
              : pc.cyan('·')
        const stream = entry.type === 'error' ? process.stderr : process.stdout
        stream.write(`${symbol} ${entry.args.map(String).join(' ')}\n`)
      },
    },
  ],
})

export interface Output {
  title(): void
  info(message: string): void
  state(state: string, message: string): void
  warning(kind: string, message: string): void
  success(message: string): void
  diagnostic(line: string): void
  childOutput(stream: 'stdout' | 'stderr', text: string): void
  ready(localUrl: string, publicUrl: string): void
  lanReady(url: string): void
  error(message: string): void
  doctorCheck(check: DoctorCheck): void
}

export class TerminalOutput implements Output {
  constructor(private readonly qrMode: QrMode) {}

  title(): void {
    process.stdout.write(`\n${pc.bold('Peek')}\n\n`)
  }

  info(message: string): void {
    logger.info(message)
  }

  state(_state: string, message: string): void {
    this.info(message)
  }

  warning(_kind: string, message: string): void {
    process.stderr.write(`${pc.yellow('!')} ${message}\n`)
  }

  success(message: string): void {
    logger.success(message)
  }

  diagnostic(line: string): void {
    logger.info(pc.dim(`[cloudflared] ${line}`))
  }

  childOutput(stream: 'stdout' | 'stderr', text: string): void {
    if (stream === 'stderr') process.stderr.write(text)
    else process.stdout.write(text)
  }

  ready(localUrl: string, publicUrl: string): void {
    this.success('Tunnel connected')
    process.stdout.write(`\nLocal   ${localUrl}\nPublic  ${publicUrl}\n`)
    renderQr(publicUrl, this.qrMode)
    process.stdout.write('\nPress Ctrl+C to stop\n')
  }

  lanReady(url: string): void {
    this.success('LAN preview ready')
    process.stdout.write(`\nLAN  ${url}\n`)
    renderQr(url, this.qrMode)
    process.stdout.write('\nPress Ctrl+C to stop\n')
  }

  error(message: string): void {
    logger.error(message)
  }

  doctorCheck(check: DoctorCheck): void {
    const detail = check.remedy
      ? `${check.message} ${check.remedy}`
      : check.message
    if (check.status === 'pass') this.success(`${check.name}: ${detail}`)
    else if (check.status === 'warn') this.info(`${check.name}: ${detail}`)
    else this.error(`${check.name}: ${detail}`)
  }
}
