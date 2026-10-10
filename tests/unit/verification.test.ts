import { expect, it, vi } from 'vitest'
import { coordinateVerification } from '../../src/core/verification.js'

it('shares one inspection among concurrent requests and expires positive evidence', async () => {
  let now = 100
  let release!: () => void
  const inspection = new Promise<void>((resolve) => {
    release = resolve
  })
  const verify = vi
    .fn()
    .mockReturnValueOnce(inspection)
    .mockResolvedValue(undefined)
  const coordinated = coordinateVerification(verify, 1_000, () => now)
  const requests = [coordinated(), coordinated(), coordinated()]
  await Promise.resolve()
  expect(verify).toHaveBeenCalledTimes(1)
  release()
  await Promise.all(requests)
  now = 1_099
  await coordinated()
  expect(verify).toHaveBeenCalledTimes(1)
  now = 1_100
  await coordinated()
  expect(verify).toHaveBeenCalledTimes(2)
  await coordinated(true)
  expect(verify).toHaveBeenCalledTimes(3)
})

it('does not cache failed inspection and retries the next request', async () => {
  const verify = vi
    .fn()
    .mockRejectedValueOnce(new Error('ownership lost'))
    .mockResolvedValue(undefined)
  const coordinated = coordinateVerification(verify)
  await expect(coordinated()).rejects.toThrow('ownership lost')
  await expect(coordinated()).resolves.toBeUndefined()
  expect(verify).toHaveBeenCalledTimes(2)
})

it('detects replacement once positive ownership evidence expires', async () => {
  let now = 0
  let owned = true
  const coordinated = coordinateVerification(
    async () => {
      if (!owned) throw new Error('port replaced')
    },
    1_000,
    () => now,
  )
  await coordinated()
  owned = false
  now = 999
  await expect(coordinated()).resolves.toBeUndefined()
  now = 1_000
  await expect(coordinated()).rejects.toThrow('port replaced')
})
