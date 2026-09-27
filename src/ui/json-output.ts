import type { DoctorCheck } from '../core/doctor.js'
import type { Output } from './output.js'

export class JsonOutput implements Output {
  private write(type: string, fields: Record<string, unknown> = {}): void {
    process.stdout.write(
      `${JSON.stringify({ schemaVersion: 1, type, timestamp: new Date().toISOString(), ...fields })}\n`,
    )
  }

  title(): void {
    this.write('start')
  }

  info(message: string): void {
    this.write('info', { message })
  }

  state(state: string, message: string): void {
    this.write('state', { state, message })
  }

  warning(kind: string, message: string): void {
    this.write('warning', { kind, message })
  }

  success(message: string): void {
    this.write('success', { message })
  }

  diagnostic(line: string): void {
    this.write('diagnostic', { message: line })
  }

  childOutput(stream: 'stdout' | 'stderr', content: string): void {
    this.write('child-output', { stream, content })
  }

  ready(localUrl: string, publicUrl: string): void {
    this.write('ready', { localUrl, publicUrl })
  }

  lanReady(url: string): void {
    this.write('lan-ready', { url })
  }

  error(message: string): void {
    this.write('error', { message })
  }

  doctorCheck(check: DoctorCheck): void {
    this.write('doctor-check', { ...check })
  }
}
