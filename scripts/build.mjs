import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import process from 'node:process';

const development = process.argv.includes('--development');
const optimization = {
  minify: !development,
  sourcemap: development,
};

await rm('dist', { recursive: true, force: true });
await mkdir('dist/native', { recursive: true });
await mkdir('dist/renderer', { recursive: true });

await Promise.all([
  build({
    entryPoints: ['src/native/main.ts'],
    outfile: 'dist/native/main.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', '@zowe/secrets-for-zowe-sdk'],
    ...optimization,
  }),
  build({
    entryPoints: ['src/native/preload.ts'],
    outfile: 'dist/native/preload.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    ...optimization,
  }),
  build({
    entryPoints: ['src/renderer/main.tsx'],
    outfile: 'dist/renderer/app.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome140',
    jsx: 'automatic',
    ...optimization,
  }),
]);

await Promise.all([
  cp('src/renderer/index.html', 'dist/renderer/index.html'),
  cp('src/renderer/assets', 'dist/renderer/assets', { recursive: true }),
]);
