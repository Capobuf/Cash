import { execFile } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { expect, it } from 'vitest';

it.skipIf(process.platform === 'linux' && !process.env.DISPLAY)(
  'organizza le righe con mouse e tastiera, annulla il drag e conserva controlli, template ed export',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cash-layout-ui-'));
    try {
      await build({
        entryPoints: ['tests/fixtures/quote-layout-ui.tsx'],
        outfile: join(directory, 'fixture.js'),
        bundle: true,
        platform: 'browser',
        format: 'iife',
        globalName: 'Checks',
        jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"development"' },
      });
      await writeFile(
        join(directory, 'index.html'),
        '<div id="root"></div><link rel="stylesheet" href="styles.css">',
      );
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
        { windowsHide: true, timeout: 30000 },
      );
      await cp(resolve('src/renderer/assets'), join(directory, 'assets'), {
        recursive: true,
      });
      await writeFile(
        join(directory, 'runner.cjs'),
        String.raw`
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 2400, show: false, webPreferences: { contextIsolation: false, backgroundThrottling: false, offscreen: true } });
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const wait = (ms = 80) => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (code, label) => {
    const deadline = Date.now() + 5000;
    while (!(await js(code))) {
      if (Date.now() > deadline) throw new Error('Timed out waiting for ' + label);
      await wait(20);
    }
  };
  const idle = () => until('!document.querySelector("[data-dnd-dragging], [data-dnd-dropping]")', 'drag cleanup');
  const key = async (keyCode) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode }); await wait(120); };
  const info = () => js('Checks.info()');
  const click = (label) => js('Checks.click(' + JSON.stringify(label) + ')');
  const point = (selector) => js('(() => { const e = document.querySelector(' + JSON.stringify(selector) + '); if (!e) throw new Error("Missing target " + ' + JSON.stringify(selector) + '); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()');
  const handle = (id) => '[data-quote-item="' + id + '"] [data-quote-drag-handle]';
  const drop = (id) => '[data-quote-drop="' + id + '"]';
  const drag = async (source, target, cancel = false) => {
    await idle();
    await until('(() => { const e = document.querySelector(' + JSON.stringify(source) + '); const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width/2, r.y + r.height/2)); })()', 'unobstructed drag handle');
    const start = await point(source);
    let end = await point(target);
    win.webContents.sendInputEvent({ type: 'mouseMove', ...start });
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...start });
    await until('!!document.querySelector("[data-dnd-dragging]")', 'pointer drag activation');
    for (let i=1; i<=12; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', button: 'left', x: Math.round(start.x+(end.x-start.x)*i/12), y: Math.round(start.y+(end.y-start.y)*i/12) });
      await wait(20);
    }
    await wait(120);
    // Append zones move as children enter them. Following a sortable card instead
    // would chase it after the swap and could undo the intended reorder.
    for (let i=0; target.startsWith('[data-quote-drop=') && i<3; i++) {
      end = await point(target);
      win.webContents.sendInputEvent({ type: 'mouseMove', button: 'left', ...end });
      await wait(120);
    }
    if (cancel) await key('Escape');
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...end });
    await idle();
    await js('Checks.settle()');
  };
  try {
    await win.loadFile(join(__dirname, 'index.html'));
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1200, height: 2400, deviceScaleFactor: 1, mobile: false });
    await js(readFileSync(join(__dirname, 'fixture.js'), 'utf8'));
    const ids = await js('Checks.setup()');
    assert.deepEqual((await info()).domOrder, ids);
    await click('Rinomina preventivo');
    await js('Checks.fill("#quote-title", "  Configurazione rete sede nord  ")');
    await click('Salva');
    assert.equal((await info()).quote.customTitle, 'Configurazione rete sede nord');
    assert.equal(await js('document.querySelector("h2").textContent'), 'Configurazione rete sede nord');
    assert.equal((await info()).unchangedItems && (await info()).unchangedTotal, true);
    await click('Rinomina preventivo');
    await js('Checks.fill("#quote-title", "Da annullare")');
    await click('Annulla');
    assert.equal((await info()).quote.customTitle, 'Configurazione rete sede nord');
    await click('Rinomina preventivo');
    await click('Ripristina titolo automatico');
    assert.equal((await info()).quote.customTitle, undefined);
    assert.equal(await js('document.querySelector("h2").textContent'), 'Cliente demo - Preventivo #1');
    await click('Rinomina preventivo');
    await js('Checks.fill("#quote-title", "   ")');
    await click('Salva');
    assert.equal((await info()).quote.customTitle, undefined);
    await js('Checks.setReadOnly(true)');
    assert.equal(await js('Array.from(document.querySelectorAll("button")).find(e => e.getAttribute("aria-label") === "Rinomina preventivo").disabled'), true);
    await js('Checks.setReadOnly(false)');
    await click('Nuovo contenitore');
    await js('Checks.fill("#new-container-name", "Sede Nord")');
    await click('Crea contenitore');
    await click('Nuovo contenitore');
    await js('Checks.fill("#new-container-name", "Sede Sud")');
    await click('Crea contenitore');
    let snapshot = await info();
    const [north, south] = snapshot.quote.layout.filter(e => e.kind === 'container').map(e => e.id);
    await drag(handle(ids[0]), drop(north));
    snapshot = await info();
    assert.deepEqual(snapshot.quote.layout.find(e => e.id === north).itemIds, [ids[0]], 'drop into empty container');
    assert.equal(snapshot.unchangedItems && snapshot.unchangedTotal, true);
    const beforeCancel = JSON.stringify(snapshot.quote);
    const writes = snapshot.writes;
    await drag(handle(ids[1]), drop(south), true);
    snapshot = await info();
    assert.equal(JSON.stringify(snapshot.quote), beforeCancel, 'escape must not mutate');
    assert.equal(snapshot.writes, writes, 'escape must not save');
    await drag(handle(ids[1]), drop(north));
    assert.deepEqual((await info()).quote.layout.find(e => e.id === north).itemIds, [ids[0], ids[1]], 'drop after cancellation');
    // Reorder two children with the keyboard, then cancel another keyboard drag.
    await js('document.querySelector(' + JSON.stringify(handle(ids[1])) + ').focus()');
    await key('Space'); await key('Up'); await key('Space');
    snapshot = await info();
    assert.deepEqual(snapshot.quote.layout.find(e => e.id === north).itemIds, [ids[1], ids[0]], 'keyboard within container');
    assert.equal(await js('document.activeElement?.hasAttribute("data-quote-drag-handle")'), true, 'focus stays on handle');
    const beforeKeyboardCancel = JSON.stringify(snapshot.quote);
    await key('Space'); await key('Down'); await key('Escape');
    assert.equal(JSON.stringify((await info()).quote), beforeKeyboardCancel);
    await drag(handle(ids[0]), drop(south));
    snapshot = await info();
    assert.deepEqual(snapshot.quote.layout.find(e => e.id === north).itemIds, [ids[1]], 'between containers');
    assert.deepEqual(snapshot.quote.layout.find(e => e.id === south).itemIds, [ids[0]]);
    await drag(handle(ids[0]), drop('quote-root'));
    snapshot = await info();
    assert.deepEqual(snapshot.quote.layout.at(-1), { kind: 'item', itemId: ids[0] }, 'back to root');
    const beforeNoop = snapshot.writes;
    await drag(handle(ids[0]), handle(ids[0]));
    assert.equal((await info()).writes, beforeNoop, 'no-op must not save');
    await js('const invalid = document.createElement("div"); invalid.id = "invalid-drop"; invalid.style.cssText = "position:fixed;right:0;bottom:0;width:20px;height:20px"; document.body.append(invalid)');
    const beforeInvalid = JSON.stringify((await info()).quote);
    await drag(handle(ids[0]), '#invalid-drop');
    assert.equal(JSON.stringify((await info()).quote), beforeInvalid, 'invalid drop must not mutate');
    assert.equal((await info()).writes, beforeNoop, 'invalid drop must not save');
    await js('document.querySelector("#invalid-drop").remove()');
    // Dedicated handle must not intercept price edits or the card collapse button.
    await click('Apri o chiudi Firewall');
    await js('Checks.fill(' + JSON.stringify('#chosen-' + ids[2]) + ', "125,00")');
    await js('document.querySelector(' + JSON.stringify('#chosen-' + ids[2]) + ').dispatchEvent(new FocusEvent("focusout", { bubbles: true })); Checks.settle()');
    assert.equal((await info()).quote.items.find(e => e.id === ids[2]).chosenPrice, '125.00');
    await js('document.querySelector(' + JSON.stringify(handle(ids[2])) + ').focus()');
    const beforeKeyboard = (await info()).domOrder;
    await key('Space'); await key('Down'); await key('Space');
    snapshot = await info();
    assert.notDeepEqual(snapshot.domOrder, beforeKeyboard, 'keyboard reorder');
    assert.equal(snapshot.valid, true);
    await drag('[data-quote-container="' + south + '"] [data-quote-drag-handle]', '[data-quote-container="' + north + '"] [data-quote-drag-handle]');
    snapshot = await info();
    assert(snapshot.quote.layout.findIndex(e => e.id === south) < snapshot.quote.layout.findIndex(e => e.id === north), 'container reorder');
    // Container actions reuse the normal template dialog.
    await js('document.querySelector(' + JSON.stringify('[data-quote-container="' + north + '"] button[data-slot=dropdown-menu-trigger]') + ').click(); Checks.settle()');
    await click('Da template');
    await js('document.querySelector("[data-slot=dialog-content] button.w-full").click(); Checks.settle()');
    await click('Inserisci 2 voci');
    snapshot = await info();
    assert.deepEqual(snapshot.quote.layout.find(e => e.id === north).itemIds.map(id => snapshot.quote.items.find(e => e.id === id).name), ['Switch', 'LAN', 'Wi-Fi']);
    await click('Elimina contenitore Sede Nord');
    await click('Annulla');
    assert((await info()).quote.layout.some(e => e.id === north));
    await click('Elimina contenitore Sede Nord');
    await click('Elimina contenitore');
    snapshot = await info();
    assert.equal(snapshot.quote.items.length, 5);
    assert.equal(snapshot.quote.layout.some(e => e.id === north), false);
    assert.equal(snapshot.valid, true);
    for (const width of [375, 768, 1200]) {
      await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height: 2400, deviceScaleFactor: 1, mobile: false });
      await js('Checks.settle()');
      assert.equal((await info()).overflow, false, 'horizontal overflow at ' + width);
    }
    await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1200, height: 2400, deviceScaleFactor: 1, mobile: false });
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await js('Checks.settle()');
    await drag(handle(ids[0]), drop(south));
    assert.deepEqual((await info()).quote.layout.find(e => e.id === south).itemIds, [ids[0]]);
    if (process.env.CASH_UI_SCREENSHOTS) {
      mkdirSync(process.env.CASH_UI_SCREENSHOTS, {recursive: true});
      await js('document.documentElement.classList.add("dark"); Checks.settle()');
      writeFileSync(join(process.env.CASH_UI_SCREENSHOTS, 'quote-containers.png'), (await win.webContents.capturePage()).toPNG());
    }
    await js('Checks.setReadOnly(true)');
    assert.equal(await js('Array.from(document.querySelectorAll("[data-quote-drag-handle]")).every(e => e.disabled)'), true);
    await js('Checks.setReadOnly(false)');
    // Leaving an inline edit for the dedicated handle must commit the edit and
    // still allow that same gesture to move the row.
    await js('Checks.fill(' + JSON.stringify('#quote-name-' + ids[0]) + ', "Router aggiornato")');
    assert.equal(await js('document.activeElement?.id'), 'quote-name-' + ids[0], 'inline field focused before pointer drag');
    await drag(handle(ids[0]), drop('quote-root'));
    assert.equal((await info()).quote.items.find(item => item.id === ids[0]).name, 'Router aggiornato');
    assert.deepEqual((await info()).quote.layout.at(-1), { kind: 'item', itemId: ids[0] });
    const beforeSwitch = (await info()).quote;
    // Switch context during a pending pointer operation.
    const start = await point(handle(ids[2]));
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...start });
    await wait(250);
    await js('Checks.switchArchive()');
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...start });
    await wait(150);
    assert.deepEqual((await info()).quote, beforeSwitch);
    const visibleOrder = (await info()).order;
    assert.deepEqual(await js('Checks.showExport()'), visibleOrder, 'export follows visible order');
    assert.equal(await js('Checks.runOperationalChecks()'), 'OPERATIONAL_UI_OK');
    if (process.env.CASH_UI_SCREENSHOTS) {
      writeFileSync(join(process.env.CASH_UI_SCREENSHOTS, 'quote-operational-table.png'), (await win.webContents.capturePage()).toPNG());
    }
    process.stdout.write('LAYOUT_UI_OK\n', () => app.exit(0));
  } catch(error) {
    process.stderr.write(String(error) + '\n' + JSON.stringify(await info().catch(() => ({}))) + '\n' + await js('document.body.innerText').catch(() => ''), () => app.exit(1));
  }
});
`,
      );
      const electron = createRequire(import.meta.url)('electron') as string;
      const { stdout } = await promisify(execFile)(
        electron,
        [join(directory, 'runner.cjs'), '--no-sandbox', '--disable-gpu'],
        {
          timeout: 60000,
          windowsHide: true,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
          maxBuffer: 1024 * 1024,
        },
      );
      expect(stdout).toContain('LAYOUT_UI_OK');
    } finally {
      if (resolve(directory).startsWith(resolve(tmpdir()) + sep))
        await rm(directory, { recursive: true, force: true });
    }
  },
  90000,
);
