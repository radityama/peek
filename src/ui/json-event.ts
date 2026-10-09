import type { AccessMode } from '../core/access.js'

type RuntimeEventPayload =
  | { type: 'start' }
  | { type: 'info'; message: string }
  | { type: 'state'; state: string; message: string }
  | { type: 'warning'; kind: string; message: string }
  | { type: 'success'; message: string }
  | { type: 'diagnostic'; message: string }
  | { type: 'child-output'; stream: 'stdout' | 'stderr'; content: string }
  | { type: 'ready'; localUrl: string; publicUrl: string }
  | { type: 'lan-ready'; url: string }
  | { type: 'private-ready'; url: string }
  | { type: 'access'; mode: AccessMode; expiresAt?: string }
  | { type: 'error'; message: string }
  | {
      type: 'doctor-check'
      name: string
      status: 'pass' | 'warn' | 'fail'
      message: string
      remedy?: string
      detail?: string
    }

type CommandEventPayload =
  | { type: 'help'; text: string }
  | { type: 'version'; version: string }

export type JsonEventInput = (RuntimeEventPayload | CommandEventPayload) & {
  schemaVersion?: never
  timestamp?: never
}

export type PeekJsonEvent =
  | (RuntimeEventPayload & { schemaVersion: 1; timestamp: string })
  | (CommandEventPayload & { schemaVersion: 1; timestamp?: never })

export function writeJsonEvent(input: JsonEventInput): void {
  const {
    schemaVersion: _schemaVersion,
    timestamp: _timestamp,
    ...payload
  } = input
  const event: PeekJsonEvent =
    payload.type === 'help' || payload.type === 'version'
      ? { schemaVersion: 1, ...payload }
      : { schemaVersion: 1, timestamp: new Date().toISOString(), ...payload }
  process.stdout.write(`${JSON.stringify(event)}\n`)
}
