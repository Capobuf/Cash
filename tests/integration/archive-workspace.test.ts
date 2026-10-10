import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import type { runWorkspaceChecks } from '../fixtures/archive-workspace';

// Exercise real React reconciliation using the project's installed Electron DOM.
// Linux runners without a display cannot create a BrowserWindow.
it.skipIf(process.platform === 'linux' && !process.env.DISPLAY)(
  'resets archive workspaces while preserving device state and global subscriptions',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cash-archive-workspace-'));
    try {
      const bundle = await build({
        entryPoints: ['tests/fixtures/archive-workspace.tsx'],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        globalName: 'WorkspaceChecks',
        jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"development"' },
      });
      const bundlePath = join(directory, 'workspace.js');
      await writeFile(bundlePath, bundle.outputFiles![0]!.text);
      const pagePath = join(directory, 'index.html');
      await writeFile(pagePath, '<div id="root"></div>');
      const runner = join(directory, 'runner.cjs');
      await writeFile(
        runner,
        `
const { app, BrowserWindow } = require('electron');
const { readFileSync } = require('node:fs');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false } });
  await window.loadFile(${JSON.stringify(pagePath)});
  try {
    const result = await window.webContents.executeJavaScript(readFileSync(${JSON.stringify(bundlePath)}, 'utf8') + '\\nWorkspaceChecks.runWorkspaceChecks()');
    process.stdout.write('WORKSPACE_RESULT:' + JSON.stringify(result) + '\\n', () => app.exit(0));
  } catch (error) {
    process.stderr.write(String(error) + '\\n', () => app.exit(1));
  }
});
`,
      );
      const electron = createRequire(import.meta.url)('electron') as string;
      const { stdout } = await promisify(execFile)(
        electron,
        [runner, '--no-sandbox', '--disable-gpu'],
        {
          timeout: 25000,
          windowsHide: true,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
          maxBuffer: 1024 * 1024,
        },
      );
      const result = stdout
        .split('\n')
        .find((line) => line.startsWith('WORKSPACE_RESULT:'));
      expect(result).toBeDefined();
      const expected: Awaited<ReturnType<typeof runWorkspaceChecks>> = [
        'catalog',
        'same-document',
        'delete-target',
        'clients',
        'quotes',
        'update-navigation-and-race',
        'settings-and-device',
        'profile-selections',
        'global-decisions-and-subscriptions',
      ];
      expect(JSON.parse(result!.slice('WORKSPACE_RESULT:'.length))).toEqual(
        expected,
      );
    } finally {
      if (resolve(directory).startsWith(resolve(tmpdir()) + sep))
        await rm(directory, { recursive: true, force: true });
    }
  },
  30000,
);
