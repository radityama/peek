import type { Readable } from 'node:stream'
import { execa } from 'execa'
import { whichCommand } from 'which-command'
import type { DevCommand } from './dev-command.js'

export interface ProcessExit {
  exitCode: number | null
  failed: boolean
  spawnFailed: boolean
  message?: string
}

export interface DevProcess {
  pid: number | undefined
  stdout: Readable
  stderr: Readable
  exit: Promise<ProcessExit>
  kill: (signal: NodeJS.Signals) => void
}

export function spawnDev(command: DevCommand, cwd: string): DevProcess {
  const child = execa(command.file, command.args, {
    cwd,
    env: process.env,
    stdin: 'inherit',
    stdout: 'pipe',
    stderr: 'pipe',
    buffer: false,
    reject: false,
    killDescendants: true,
    cleanup: true,
  })
  if (!child.stdout || !child.stderr) {
    throw new Error('Development server output streams were unavailable')
  }
  const nativeChild = child.nodeChildProcess
  const exit = new Promise<ProcessExit>((resolve) => {
    const finish = (result: ProcessExit): void => {
      nativeChild.removeListener('exit', onExit)
      nativeChild.removeListener('error', onError)
      resolve(result)
    }
    const onExit = (
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      finish({
        exitCode,
        failed: exitCode !== 0 || signal !== null,
        spawnFailed: false,
        ...(signal
          ? { message: `Development command terminated by ${signal}.` }
          : {}),
      })
    }
    const onError = (error: Error): void => {
      finish({
        exitCode: null,
        failed: true,
        spawnFailed: true,
        message: error.message,
      })
    }
    nativeChild.once('exit', onExit)
    nativeChild.once('error', onError)
    void child.then(
      (result) => {
        finish({
          exitCode: result.exitCode ?? null,
          failed: result.failed,
          spawnFailed:
            result.failed &&
            result.exitCode === undefined &&
            result.signal === undefined &&
            !result.timedOut &&
            !result.isCanceled,
          ...(result.shortMessage ? { message: result.shortMessage } : {}),
        })
      },
      (error: unknown) => {
        finish({
          exitCode: null,
          failed: true,
          spawnFailed: false,
          message: `Development command observation failed: ${error instanceof Error ? error.message : String(error)}`,
        })
      },
    )
  })
  return {
    pid: child.pid,
    stdout: child.stdout,
    stderr: child.stderr,
    exit,
    kill: (signal) => {
      child.kill(signal)
    },
  }
}

export async function isMissingWindowsCommand(
  file: string,
  cwd: string,
): Promise<boolean> {
  if (process.platform !== 'win32') return false
  // Execa uses cmd.exe for unresolved Windows commands, which can turn a
  // missing executable into exit code 1. Use the same resolver Execa uses.
  return (await whichCommand(file, { cwd })) === undefined
}
