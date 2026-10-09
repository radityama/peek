import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
} from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { type PreviewProxy, startPreviewProxy } from '../../src/core/proxy.js'

const listeners: Server[] = []
const proxies: PreviewProxy[] = []
afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()))
  await Promise.all(
    listeners.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
          server.closeAllConnections()
        }),
    ),
  )
})

async function listen(server: Server): Promise<number> {
  listeners.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing origin port')
  return address.port
}

function requestThroughProxy(
  port: number,
  upgrade = false,
  extraHeaders: Record<string, string> = {},
): Promise<{
  status: number
  headers: IncomingMessage['headers']
  body: string
}> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      path: '/',
      headers: {
        ...(upgrade
          ? { connection: 'Upgrade', upgrade: 'websocket' }
          : {
              connection: 'keep-alive, x-request-hop',
              'x-request-hop': 'remove',
            }),
        ...extraHeaders,
      },
    })
    request.setTimeout(3000, () =>
      request.destroy(new Error('Proxy timed out')),
    )
    request.on('error', reject)
    request.on('response', (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => {
        body += chunk
      })
      response.on('error', reject)
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body,
        }),
      )
    })
    request.end()
  })
}

it('reframes chunked rejected upgrades after Node decodes the upstream body', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(403, {
      'content-type': 'text/plain',
      'transfer-encoding': 'chunked',
      connection: 'close, x-origin-hop',
      'x-origin-hop': 'remove',
    })
    response.write('rejected ')
    response.end('upgrade')
  })
  const targetPort = await listen(server)
  const proxy = await startPreviewProxy({
    targetPort,
    verifyTarget: async () => {},
  })
  proxies.push(proxy)
  const result = await requestThroughProxy(proxy.port, true)
  expect(result.status).toBe(403)
  expect(result.body).toBe('rejected upgrade')
  expect(result.headers['content-type']).toBe('text/plain')
  expect(result.headers['transfer-encoding']).toBeUndefined()
  expect(result.headers['content-length']).toBeUndefined()
  expect(result.headers['x-origin-hop']).toBeUndefined()
  expect(result.headers.connection).toBe('close')
})

it.each([400, 401, 404, 426, 500])(
  'forwards a rejected upgrade with status %i and a fixed-length body',
  async (status) => {
    const server = createServer((_request, response) => {
      response.writeHead(status, {
        'content-length': '4',
        'content-type': 'text/plain',
      })
      response.end('nope')
    })
    const targetPort = await listen(server)
    const proxy = await startPreviewProxy({
      targetPort,
      verifyTarget: async () => {},
    })
    proxies.push(proxy)
    const result = await requestThroughProxy(proxy.port, true)
    expect(result.status).toBe(status)
    expect(result.body).toBe('nope')
    expect(result.headers['content-length']).toBe('4')
    expect(result.headers['content-type']).toBe('text/plain')
  },
)

it('forwards a rejected upgrade with no body', async () => {
  const targetPort = await listen(
    createServer((_request, response) => {
      response.writeHead(204)
      response.end()
    }),
  )
  const proxy = await startPreviewProxy({
    targetPort,
    verifyTarget: async () => {},
  })
  proxies.push(proxy)
  const result = await requestThroughProxy(proxy.port, true)
  expect(result.status).toBe(204)
  expect(result.body).toBe('')
})

it('removes connection-nominated headers from ordinary HTTP requests and responses', async () => {
  let receivedHop: string | string[] | undefined
  const server = createServer((request, response) => {
    receivedHop = request.headers['x-request-hop']
    response.writeHead(200, {
      connection: 'close, x-origin-hop',
      'x-origin-hop': 'remove',
      'content-length': '2',
    })
    response.end('ok')
  })
  const targetPort = await listen(server)
  const proxy = await startPreviewProxy({
    targetPort,
    verifyTarget: async () => {},
  })
  proxies.push(proxy)
  const result = await requestThroughProxy(proxy.port)
  expect(result.status).toBe(200)
  expect(result.body).toBe('ok')
  expect(receivedHop).toBeUndefined()
  expect(result.headers['x-origin-hop']).toBeUndefined()
  expect(result.headers['content-length']).toBe('2')
})

it('ends a rejected upgrade if the origin terminates its body early', async () => {
  const targetPort = await listen(
    createServer((_request, response) => {
      response.writeHead(500, { 'content-length': '10' })
      response.write('short')
      setTimeout(() => response.destroy(), 25)
    }),
  )
  const proxy = await startPreviewProxy({
    targetPort,
    verifyTarget: async () => {},
  })
  proxies.push(proxy)
  await expect(requestThroughProxy(proxy.port, true)).rejects.toThrow()
})

it('keeps failed HTTP guesses and cross-origin upgrades away from the origin', async () => {
  let httpRequests = 0
  let upgrades = 0
  const server = createServer((_request, response) => {
    httpRequests++
    response.end('allowed')
  })
  server.on('upgrade', (_request, socket) => {
    upgrades++
    socket.end(
      'HTTP/1.1 426 Upgrade Required\r\nContent-Length: 4\r\nConnection: close\r\n\r\nnope',
    )
  })
  const targetPort = await listen(server)
  const proxy = await startPreviewProxy({
    targetPort,
    password: 'secret',
    publicOrigin: () => 'https://active.trycloudflare.com',
    verifyTarget: async () => {},
    now: () => 0,
  })
  proxies.push(proxy)
  for (let index = 0; index < 12; index++) {
    const response = await fetch(`http://127.0.0.1:${proxy.port}`)
    expect(response.status).toBe(401)
    await response.arrayBuffer()
  }
  expect((await fetch(`http://127.0.0.1:${proxy.port}`)).status).toBe(429)
  expect(httpRequests).toBe(0)
  const authorization = `Basic ${Buffer.from('peek:secret').toString('base64')}`
  const accepted = await fetch(`http://127.0.0.1:${proxy.port}`, {
    headers: { authorization },
  })
  expect(accepted.status).toBe(200)
  expect(await accepted.text()).toBe('allowed')
  expect(httpRequests).toBe(1)
  expect(
    (
      await requestThroughProxy(proxy.port, true, {
        authorization,
        origin: 'https://attacker.example',
      })
    ).status,
  ).toBe(403)
  expect(upgrades).toBe(0)
  expect(
    (
      await requestThroughProxy(proxy.port, true, {
        authorization,
        origin: 'https://active.trycloudflare.com',
      })
    ).status,
  ).toBe(426)
  expect(upgrades).toBe(1)
})

it('refuses a request when the selected dev listener can no longer be verified', async () => {
  let requests = 0
  const server = createServer((_request, response) => {
    requests++
    response.end('selected server')
  })
  listeners.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing origin port')
  let verified = true
  const proxy = await startPreviewProxy({
    targetPort: address.port,
    verifyTarget: async () => {
      if (!verified) throw new Error('Port ownership was lost')
    },
  })
  proxies.push(proxy)
  const url = `http://127.0.0.1:${proxy.port}`
  expect(await (await fetch(url)).text()).toBe('selected server')
  verified = false
  expect((await fetch(url)).status).toBe(502)
  expect(requests).toBe(1)
})
