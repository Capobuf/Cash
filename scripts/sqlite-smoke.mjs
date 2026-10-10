import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import console from 'node:console';
import assert from 'node:assert/strict';
import electron from 'electron';

const installed = process.argv.includes('--installed');
const packaged = installed || process.argv.includes('--packaged');
const directory = await mkdtemp(join(tmpdir(), 'cash-sqlite-smoke-'));
const executable = installed
  ? resolve(process.env.LOCALAPPDATA ?? '', 'Programs', 'Cash', 'Cash.exe')
  : packaged
    ? resolve('release/Cash.exe')
    : electron;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
try {
  const args = [
    ...(packaged ? [] : ['.']),
    `--cash-storage-smoke=${directory}`,
  ];
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env,
      windowsHide: true,
      stdio: 'pipe',
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`SQLite smoke timeout: ${output}`));
    }, 60_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`SQLite smoke exit ${code}: ${output}`));
      else resolve();
    });
  });
  const result = JSON.parse(
    await readFile(join(directory, 'result.json'), 'utf8'),
  );
  assert.equal(result.result, 'PASS');
  assert.ok(result.electron, 'Must run in Electron, not Node');
  assert.equal(result.platform, 'win32');
  assert.equal(result.arch, 'x64');
  console.log(JSON.stringify({ packaged, installed, ...result }, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
