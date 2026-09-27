import { randomBytes } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Framework } from './framework.js'

export interface PreviewFinding {
  kind: 'blocked-host' | 'hmr-failed' | 'hmr-unverified'
  message: string
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
        ? `Vite rejected ${hostname}. Add this hostname to server.allowedHosts in your Vite config, then use a stable tunnel hostname; Quick Tunnel names change on restart.`
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
): Promise<PreviewFinding[]> {
  const findings: PreviewFinding[] = []
  try {
    const response = await fetch(publicUrl, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      redirect: 'manual',
    })
    const body = await readPrefix(response, 8_192)
    const rejection = classifyHostRejection(
      response.status,
      body,
      framework,
      new URL(publicUrl).hostname,
    )
    if (rejection) findings.push(rejection)
  } catch {
    if (signal.aborted) return findings
  }

  if (framework !== 'vite') {
    findings.push({
      kind: 'hmr-unverified',
      message: 'HMR WebSocket endpoint is not known for this project.',
    })
    return findings
  }
  const local = await probeWebSocketUpgrade(localUrl, signal)
  if (local !== true) {
    findings.push({
      kind: 'hmr-unverified',
      message: 'Local Vite HMR upgrade could not be verified.',
    })
    return findings
  }
  const remote = await probeWebSocketUpgrade(publicUrl, signal)
  if (remote !== true) {
    findings.push({
      kind: 'hmr-failed',
      message:
        'Vite HMR works locally but its WebSocket upgrade failed through the tunnel. Check server.ws settings and proxy WebSocket support.',
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
