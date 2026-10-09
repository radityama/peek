import type { AccessMode } from '../core/access.js'
import type { DoctorCheck } from '../core/doctor.js'
import { writeJsonEvent } from './json-event.js'
import type { Output } from './output.js'

export class JsonOutput implements Output {
  title(): void {
    writeJsonEvent({ type: 'start' })
  }
  info(message: string): void {
    writeJsonEvent({ type: 'info', message })
  }
  state(state: string, message: string): void {
    writeJsonEvent({ type: 'state', state, message })
  }
  warning(kind: string, message: string): void {
    writeJsonEvent({ type: 'warning', kind, message })
  }
  success(message: string): void {
    writeJsonEvent({ type: 'success', message })
  }
  diagnostic(message: string): void {
    writeJsonEvent({ type: 'diagnostic', message })
  }
  childOutput(stream: 'stdout' | 'stderr', content: string): void {
    writeJsonEvent({ type: 'child-output', stream, content })
  }
  ready(localUrl: string, publicUrl: string): void {
    writeJsonEvent({ type: 'ready', localUrl, publicUrl })
  }
  lanReady(url: string): void {
    writeJsonEvent({ type: 'lan-ready', url })
  }
  privateReady(url: string): void {
    writeJsonEvent({ type: 'private-ready', url })
  }
  access(mode: AccessMode, expiresAt?: string): void {
    writeJsonEvent({
      type: 'access',
      mode,
      ...(expiresAt ? { expiresAt } : {}),
    })
  }
  error(message: string): void {
    writeJsonEvent({ type: 'error', message })
  }
  doctorCheck(check: DoctorCheck): void {
    writeJsonEvent({
      type: 'doctor-check',
      name: check.name,
      status: check.status,
      message: check.message,
      ...(check.remedy === undefined ? {} : { remedy: check.remedy }),
      ...(check.detail === undefined ? {} : { detail: check.detail }),
    })
  }
}
