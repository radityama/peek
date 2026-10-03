import { runCli } from '../../../src/cli-command.js'

await runCli(process.argv.slice(2), {
  prepareProvider: async () => {
    throw new Error('The test transport has not been configured')
  },
})
