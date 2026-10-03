import { expect, it, vi } from 'vitest'
import { privateLanAddresses, selectLanAddress } from '../../src/core/lan.js'

it('keeps only private external IPv4 addresses', () => {
  const result = privateLanAddresses({
    wifi: [
      { address: '192.168.1.4', family: 'IPv4', internal: false },
      { address: 'fe80::1', family: 'IPv6', internal: false },
    ],
    docker: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
    loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    public: [{ address: '8.8.8.8', family: 'IPv4', internal: false }],
  } as never)
  expect(result).toEqual(['192.168.1.4', '172.17.0.1'])
})

it('rejects ambiguous usable private interfaces', async () => {
  await expect(
    selectLanAddress(
      3000,
      new AbortController().signal,
      ['172.17.0.1', '192.168.1.4'],
      async () => true,
    ),
  ).rejects.toThrow('multiple usable LAN addresses')
})

it('rejects a missing private interface before probing any port', async () => {
  const probe = vi.fn(async () => true)
  await expect(
    selectLanAddress(3000, new AbortController().signal, [], probe),
  ).rejects.toMatchObject({
    code: 'SERVER_DETECTION_ERROR',
    message: 'Peek found no private IPv4 address for LAN mode.',
  })
  expect(probe).not.toHaveBeenCalled()
})
