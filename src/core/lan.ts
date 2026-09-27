import { createSocket } from 'node:dgram'
import { type NetworkInterfaceInfo, networkInterfaces } from 'node:os'
import { PeekError } from '../utils/errors.js'
import { probeHostPort } from './port.js'

export function privateLanAddresses(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string[] {
  const addresses = new Set<string>()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      const parts = entry.address.split('.').map(Number)
      if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
        continue
      const [first, second] = parts
      if (
        first === 10 ||
        (first === 172 &&
          second !== undefined &&
          second >= 16 &&
          second <= 31) ||
        (first === 192 && second === 168)
      ) {
        addresses.add(entry.address)
      }
    }
  }
  return [...addresses]
}

export async function selectLanAddress(
  port: number,
  signal: AbortSignal,
  addresses = privateLanAddresses(),
  probe: typeof probeHostPort = probeHostPort,
  preferred?: string,
): Promise<string> {
  if (addresses.length === 0) {
    throw new PeekError(
      'SERVER_DETECTION_ERROR',
      'Peek found no private IPv4 address for LAN mode.',
      'Connect to a local network and retry.',
    )
  }
  const checked = await Promise.all(
    addresses.map(async (address) => ({
      address,
      ready: await probe(address, port, signal),
    })),
  )
  const usable = checked
    .filter((entry) => entry.ready)
    .map((entry) => entry.address)
  if (usable.length === 1 && usable[0]) return usable[0]
  if (usable.length === 0) {
    throw new PeekError(
      'SERVER_DETECTION_ERROR',
      `The development server on port ${port} is unavailable from the local network.`,
      'Configure the dev server to listen on 0.0.0.0 and retry --lan.',
    )
  }
  const primary = preferred ?? (await preferredLanAddress())
  if (primary && usable.includes(primary)) return primary
  throw new PeekError(
    'SERVER_DETECTION_ERROR',
    `Peek found multiple usable LAN addresses: ${usable.join(', ')}.`,
    'Disconnect unused network interfaces and retry --lan.',
  )
}

async function preferredLanAddress(): Promise<string | undefined> {
  const socket = createSocket('udp4')
  try {
    return await new Promise<string | undefined>((resolve) => {
      socket.once('error', () => resolve(undefined))
      socket.connect(53, '1.1.1.1', () => {
        const address = socket.address()
        resolve(typeof address === 'string' ? undefined : address.address)
      })
    })
  } finally {
    socket.close()
  }
}
