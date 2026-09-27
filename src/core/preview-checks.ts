import { randomBytes } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { setTimeout as delay } from 'node:timers/promises'
import type { Framework } from './framework.js'

export interface PreviewFinding {
  kind: 'blocked-host' | 'hmr-failed' | 'hmr-unverified'
  message: string
}

export interface PreviewCheckDependencies {
  fetcher?: typeof fetch
  probeUpgrade?: typeof probeWebSocketUpgrade
}

export function classifyHostRejection(
  status: number,
  body: string,
  framework: Framework,
  hostname: string,
): PreviewFinding | undefined {
  if (status !== 403 && status !== 400) return undefined
  if (/blocked request.*host|host.*not allowed|allowedhosts/i.test(body)) {
    const remedy =
      framework === 'vite' ||
      framework === 'astro' ||
      framework === 'sveltekit' ||
      framework === 'react-router' ||
      framework === 'tanstack-start'
        ? `Vite rejected ${hostname}. Add --host-header localhost before any -- command separator, then retry.`
        : `The dev server rejected ${hostname}. Add this hostname to its trusted-host configuration.`
    return { kind: 'blocked-host', message: remedy }
  }
  return undefined
}

export async function checkPreview(
  localUrl: string,
  publicUrl: string,
  framework: Framework,
  signal: AbortSignal,
  dependencies: PreviewCheckDependencies = {},
): Promise<PreviewFinding[]> {
  const findings: PreviewFinding[] = []
  const fetcher = dependencies.fetcher ?? fetch
  const probeUpgrade = dependencies.probeUpgrade ?? probeWebSocketUpgrade
  for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
    try {
      const response = await fetcher(publicUrl, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
        redirect: 'manual',
      })
      if (response.status >= 500) {
        await response.body?.cancel().catch(() => {})
        if (attempt < 2) await delay(1_000, undefined, { signal })
        continue
      }
      const body = await readPrefix(response, 8_192)
      const rejection = classifyHostRejection(
        response.status,
        body,
        framework,
        new URL(publicUrl).hostname,
      )
      if (rejection) {
        findings.push(rejection)
        return findings
      }
      break
    } catch {
      if (signal.aborted) return findings
      if (attempt < 2) await delay(1_000, undefined, { signal }).catch(() => {})
      if (signal.aborted) return findings
    }
  }

  if (signal.aborted) return findings

  if (framework !== 'vite') {
    findings.push({
      kind: 'hmr-unverified',
      message: 'HMR WebSocket endpoint is not known for this project.',
    })
    return findings
  }
  const local = await probeUpgrade(localUrl, signal)
  if (signal.aborted) return findings
  if (local !== true) {
    findings.push({
      kind: 'hmr-unverified',
      message: 'Local Vite HMR upgrade could not be verified.',
    })
    return findings
  }
  const remote = await probeUpgrade(publicUrl, signal)
  if (signal.aborted) return findings
  if (remote === false) {
    findings.push({
      kind: 'hmr-failed',
      message:
        'Vite HMR works locally but its WebSocket upgrade failed through the tunnel. Check server.ws settings and proxy WebSocket support.',
    })
  } else if (remote === undefined) {
    findings.push({
      kind: 'hmr-unverified',
      message: 'Public HMR upgrade could not be checked yet.',
    })
  }
  return findings
}

async function readPrefix(response: Response, limit: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    while (text.length < limit) {
      const next = await reader.read()
      if (next.done) break
      text += decoder.decode(next.value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return text.slice(0, limit)
}

export function probeWebSocketUpgrade(
  baseUrl: string,
  signal: AbortSignal,
): Promise<boolean | undefined> {
  return new Promise((resolve) => {
    const url = new URL(baseUrl)
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: 'GET',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
          'Sec-WebSocket-Protocol': 'vite-hmr',
        },
      },
    )
    let settled = false
    const finish = (result: boolean | undefined): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      request.destroy()
      resolve(result)
    }
    const onAbort = (): void => finish(undefined)
    const timeout = setTimeout(() => finish(undefined), 4_000)
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
    request.on('upgrade', (_response, socket) => {
      socket.destroy()
      finish(true)
    })
    request.on('response', (response) => {
      response.resume()
      finish(false)
    })
    request.on('error', () => finish(undefined))
    request.end()
  })
}
