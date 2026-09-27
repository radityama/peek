import { spawnSync } from 'node:child_process'
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const temporary = await mkdtemp(join(tmpdir(), 'peek-pack-'))
const installDir = join(temporary, 'install')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)

function run(command, args, cwd, shell = process.platform === 'win32') {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 10_000_000,
    shell,
  })
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`,
      { cause: result.error },
    )
  }
  return result.stdout
}

try {
  run(npm, ['pack', '--pack-destination', temporary])
  const tarballs = (await readdir(temporary)).filter((name) =>
    name.endsWith('.tgz'),
  )
  if (tarballs.length !== 1) {
    throw new Error(`Expected one package tarball, found ${tarballs.length}`)
  }
  run(npm, [
    'install',
    '--prefix',
    installDir,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    join(temporary, tarballs[0]),
  ])
  const packageRoot = join(installDir, 'node_modules', '@radityprtama', 'peek')
  const installedPackage = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8'),
  )
  if (installedPackage.bin?.peek !== 'dist/cli.js') {
    throw new Error('Installed package has no valid peek bin entry')
  }
  const bin = join(
    installDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'peek.cmd' : 'peek',
  )
  await access(bin)
  const version = run(bin, ['--version']).trim()
  if (version !== packageJson.version) {
    throw new Error(`Packed CLI reported unexpected version: ${version}`)
  }
  const help = run(bin, ['--help'])
  if (!help.includes('peek')) {
    throw new Error('Packed CLI did not display help')
  }
  const configExport = run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import { defineConfig } from '@radityprtama/peek/config'; process.stdout.write(String(defineConfig({ port: 3000 }).port))",
    ],
    installDir,
    false,
  )
  if (configExport !== '3000') {
    throw new Error('Packed config export did not load')
  }
  process.stdout.write(`Packed CLI smoke test passed (${version}).\n`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
