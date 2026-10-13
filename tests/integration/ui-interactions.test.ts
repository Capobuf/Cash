import { execFile } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import type { runUiChecks } from '../fixtures/ui-interactions';

// Exercise real React reconciliation using the project's installed Electron DOM.
// Linux runners without a display cannot create a BrowserWindow.
it.skipIf(process.platform === 'linux' && !process.env.DISPLAY)(
  'preserves loading, selection, keyboard, form and navigation behavior',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cash-ui-interactions-'));
    try {
      const bundle = await build({
        entryPoints: ['tests/fixtures/ui-interactions.tsx'],
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
      await promisify(execFile)(
        process.execPath,
        [
          resolve('node_modules/@tailwindcss/cli/dist/index.mjs'),
          '-i',
          'src/renderer/styles.css',
          '-o',
          join(directory, 'styles.css'),
          '--minify',
        ],
        { windowsHide: true, timeout: 15000 },
      );
      await cp(resolve('src/renderer/assets'), join(directory, 'assets'), {
        recursive: true,
      });
      const runner = join(directory, 'runner.cjs');
      await writeFile(
        runner,
        `
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  // Keep animation frames and timers active while the test window is hidden.
  const window = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { contextIsolation: false, backgroundThrottling: false } });
  await window.loadFile(${JSON.stringify(pagePath)});
  try {
    const result = await window.webContents.executeJavaScript(readFileSync(${JSON.stringify(bundlePath)}, 'utf8') + '\\nWorkspaceChecks.runUiChecks()');
    await window.webContents.executeJavaScript("const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'styles.css'; document.head.append(link); new Promise(resolve => link.onload = resolve)");
    result.push(await window.webContents.executeJavaScript('WorkspaceChecks.runFinancialFlowChecks()', true));
    // Exercise both motion preferences independently of the runner's OS settings.
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await window.webContents.executeJavaScript('WorkspaceChecks.renderMotionPreview(false)');
    const painted = async () => window.webContents.executeJavaScript("Promise.all(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))).then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    const screenshots = process.env.CASH_UI_SCREENSHOTS;
    if (screenshots) {
      mkdirSync(screenshots, { recursive: true });
      await painted();
      writeFileSync(join(screenshots, 'clients-light.png'), (await window.webContents.capturePage()).toPNG());
      await window.webContents.executeJavaScript("document.documentElement.classList.add('dark')");
      await painted();
      writeFileSync(join(screenshots, 'clients-dark.png'), (await window.webContents.capturePage()).toPNG());
      await window.webContents.executeJavaScript("document.querySelector('#preview-site').click(); new Promise(requestAnimationFrame)");
      await painted();
      writeFileSync(join(screenshots, 'combobox-dark.png'), (await window.webContents.capturePage()).toPNG());
    }
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const reduced = await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.section-enter, [data-slot=skeleton], [data-slot=spinner]')).every(element => getComputedStyle(element).animationName === 'none') && !!document.querySelector('[role=status]')");
    if (!reduced) throw new Error('Reduced motion did not disable animations or lost loading status');
    result.push('reduced-motion');
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
      const expected: Awaited<ReturnType<typeof runUiChecks>> = [
        'startup',
        'clients',
        'customer-search',
        'controls',
        'fiscal-form',
        'navigation',
        'table',
        'bank-filters',
        'financial-loading',
        'backup-controls',
        'bank-import',
        'financial-flow',
        'reduced-motion',
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
