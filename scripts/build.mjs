import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { env } from 'node:process';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/native', { recursive: true });
await mkdir('dist/renderer', { recursive: true });

await Promise.all([
  build({ entryPoints: ['src/native/main.ts'], outfile: 'dist/native/main.cjs', bundle: true,
    platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'keytar'], sourcemap: true,
    define: { __CASH_FIC_CLIENT_ID__: JSON.stringify(env.CASH_FIC_CLIENT_ID ?? '') } }),
  build({ entryPoints: ['src/native/preload.ts'], outfile: 'dist/native/preload.cjs', bundle: true,
    platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], sourcemap: true }),
  build({ entryPoints: ['src/renderer/main.tsx'], outfile: 'dist/renderer/app.js', bundle: true,
    platform: 'browser', format: 'iife', target: 'chrome140', sourcemap: true, jsx: 'automatic' }),
]);

await cp('src/renderer/index.html', 'dist/renderer/index.html');
