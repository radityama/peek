#!/usr/bin/env node

import { runCli } from './cli-command.js'

await runCli(process.argv.slice(2))
