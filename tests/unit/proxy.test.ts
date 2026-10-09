import { createServer, type Server } from 'node:http'
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
