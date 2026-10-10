import { runCli } from '../../../src/cli-command.js'
import { runDoctor } from '../../../src/core/doctor.js'
import { runPeek } from '../../../src/core/run.js'
import { prepareFixtureProvider } from './provider.js'

const onMessage = (message: unknown): void => {
  if (
    message &&
    typeof message === 'object' &&
    'type' in message &&
    message.type === 'abrupt-exit'
  ) {
    process.exit(23)
  }
  if (
    message &&
    typeof message === 'object' &&
    'type' in message &&
    message.type === 'signal-handler' &&
    'signal' in message &&
    (message.signal === 'SIGINT' || message.signal === 'SIGTERM')
  ) {
    process.emit(message.signal)
  }
}
process.on('message', onMessage)
try {
  if (process.env.PEEK_TEST_MALFORMED_STDOUT === '1')
    process.stdout.write('fixture non-JSON stdout\n')
  await runCli(process.argv.slice(2), {
    prepareProvider: async (options) => prepareFixtureProvider(options),
    readPassword: async () => {
      if (process.env.PEEK_TEST_PASSWORD === undefined)
        throw new Error('Fixture password was not supplied')
      return process.env.PEEK_TEST_PASSWORD
    },
    run: (options) => {
      const retryMs = process.env.PEEK_TEST_RETRY_MS
      return runPeek({
        ...options,
        ...(retryMs === undefined ? {} : { retryDelaysMs: [Number(retryMs)] }),
      })
    },
    doctor: (options) =>
      runDoctor({
        ...options,
        networkCheck: async () =>
          process.env.PEEK_TEST_NETWORK_REACHABLE !== '0',
      }),
  })
} finally {
  process.off('message', onMessage)
  if (process.connected) process.disconnect?.()
}
