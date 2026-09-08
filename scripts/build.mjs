import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/native', { recursive: true });
await mkdir('dist/renderer', { recursive: true });

await Promise.all([
  build({ entryPoints: ['src/native/main.ts'], outfile: 'dist/native/main.cjs', bundle: true,
    platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'keytar'], sourcemap: true }),
  build({ entryPoints: ['src/native/preload.ts'], outfile: 'dist/native/preload.cjs', bundle: true,
    platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], sourcemap: true }),
  build({ entryPoints: ['src/renderer/app.ts'], outfile: 'dist/renderer/app.js', bundle: true,
    platform: 'browser', format: 'iife', target: 'chrome140', sourcemap: true }),
]);

await Promise.all([
  cp('src/renderer/index.html', 'dist/renderer/index.html'),
  cp('src/renderer/styles.css', 'dist/renderer/styles.css'),
]);
