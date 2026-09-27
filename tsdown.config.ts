import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { cli: 'src/cli.ts', config: 'src/config.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  outExtensions: () => ({ js: '.js' }),
  clean: true,
  dts: true,
})
