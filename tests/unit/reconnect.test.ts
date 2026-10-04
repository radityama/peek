import { expect, it } from 'vitest'
import { TunnelRecovery } from '../../src/core/reconnect.js'

it('starts immediately and uses all seven retry delays before exhaustion', async () => {
  const recovery = new TunnelRecovery()
  const cause = new Error('network unavailable')
  expect(recovery.delayMs).toBe(0)
  for (const milliseconds of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    recovery.failed(cause)
    expect(recovery.delayMs).toBe(milliseconds)
  }
  await expect(
    Promise.resolve().then(() => recovery.failed(cause)),
  ).rejects.toMatchObject({
    code: 'TUNNEL_CONNECTION_ERROR',
    message: expect.stringContaining('eight consecutive failures or drops'),
    hint: expect.stringContaining('peek doctor'),
    cause,
  })
})

it('does not reset for short ready sessions', async () => {
  const recovery = new TunnelRecovery()
  for (let index = 0; index < 7; index++) recovery.dropped(10)
  await expect(
    Promise.resolve().then(() => recovery.dropped(10)),
  ).rejects.toMatchObject({
    code: 'TUNNEL_CONNECTION_ERROR',
  })
})

it('counts mixed failed connects and short sessions once each', async () => {
  const recovery = new TunnelRecovery()
  for (let index = 0; index < 3; index++) {
    recovery.failed(new Error('offline'))
    recovery.dropped(20)
  }
  recovery.failed(new Error('final failed connection'))
  await expect(
    Promise.resolve().then(() => recovery.dropped(20)),
  ).rejects.toMatchObject({
    code: 'TUNNEL_CONNECTION_ERROR',
    cause: expect.objectContaining({ message: 'final failed connection' }),
  })
})

it('keeps the budget at 29,999 milliseconds', async () => {
  const recovery = new TunnelRecovery()
  for (let index = 0; index < 7; index++) recovery.failed(new Error('offline'))
  await expect(
    Promise.resolve().then(() => recovery.dropped(29999)),
  ).rejects.toMatchObject({
    code: 'TUNNEL_CONNECTION_ERROR',
  })
})

it.each([30000, 30001])(
  'resets budget and delay at %i milliseconds',
  (milliseconds) => {
    const recovery = new TunnelRecovery()
    for (let index = 0; index < 7; index++)
      recovery.failed(new Error('offline'))
    recovery.dropped(milliseconds)
    expect(recovery.delayMs).toBe(1000)
    for (let index = 0; index < 6; index++) recovery.dropped(1)
    expect(recovery.delayMs).toBe(30000)
  },
)

it('clears the obsolete cause when a stable connection resets the budget', async () => {
  const recovery = new TunnelRecovery()
  recovery.failed(new Error('old outage'))
  recovery.dropped(30000)
  for (let index = 0; index < 6; index++) recovery.dropped(1)
  const error = await Promise.resolve()
    .then(() => recovery.dropped(1))
    .catch((failure: unknown) => failure)
  expect(error).toMatchObject({ code: 'TUNNEL_CONNECTION_ERROR' })
  expect((error as Error).cause).toBeUndefined()
})

it('preserves the existing custom delay seam and caps its final value', () => {
  const recovery = new TunnelRecovery([7, 11])
  recovery.failed(new Error('offline'))
  expect(recovery.delayMs).toBe(7)
  recovery.dropped(1)
  expect(recovery.delayMs).toBe(11)
  recovery.failed(new Error('offline'))
  expect(recovery.delayMs).toBe(11)
})

it('uses default delays for an empty custom sequence', () => {
  const recovery = new TunnelRecovery([])
  recovery.failed(new Error('offline'))
  expect(recovery.delayMs).toBe(1000)
})
