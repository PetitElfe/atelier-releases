const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
const dir = fs.mkdtempSync(join(tmpdir(), 'atelier-shopping-layout-'));
const base = 'http://127.0.0.1:18999';
const server = spawn('python', ['app/app.py'], {
  env: { ...process.env, ATELIER_DATA_DIR: dir, ATELIER_NO_BROWSER: '1', ATELIER_PORT: '18999' },
  stdio: 'ignore'
});
const key = 'atelierHomeCanvasV2_shopping';
async function ready(page) {
  await page.waitForFunction(() => window.AtelierStudio?.ready && homeCanvasReady && window.atelierGroceries);
  await page.evaluate(() => {
    setSideNavCollapsed(true);
    localStorage.setItem(homeModuleVisibilityKey('shopping'), '1');
    showView('home');
    syncHomeModuleVisibility();
  });
  await page.locator('#shoppingPanel').waitFor();
}
async function gesture(page, locator, dx, dy) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.keyboard.down('Alt'); // Disable magnets to measure the pointer delta.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
}
(async () => {
  let browser;
  try {
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(base + '/api/runtime-version')).ok) break; } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // This fixture represents an existing home, whose one-time 2026 migration is complete.
    await page.addInitScript(() => localStorage.setItem('atelierTodoTopRightApplied_20261030', '1'));
    await page.goto(base);
    await ready(page);
    await page.evaluate(() => {
      const item = globalLayoutItems.find(x => x.id === 'shopping');
      saveGlobalLayout(item, { x: 50, y: 300, width: 440, height: null, scale: 1 });
      applyGlobalLayout(item, readGlobalLayout(item));
    });
    const otherPositions = await page.evaluate(() => Object.fromEntries(
      globalLayoutItems.filter(x => isHomeCanvasItem(x) && x.id !== 'shopping').map(x => [x.key, localStorage.getItem(x.key)])));
    const cart = page.locator('#shoppingPanel');
    for (const zoom of [80, 100, 125, 160]) {
      await page.evaluate(z => AtelierDisplay.setZoom(z), zoom);
      await page.locator('#globalLayoutEdit').click();
      const old = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
      await gesture(page, cart.locator('.workspace-shopping-title'), 120, 45);
      const moved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
      assert.ok(moved.x > old.x + 40, `Courses moves horizontally at ${zoom}%`);
      assert.ok(moved.y > old.y + 15, `Courses moves vertically at ${zoom}%`);
      assert.equal(await cart.evaluate(el => el.classList.contains('layout-selected')), true);
      await page.keyboard.press('Shift+ArrowRight');
      assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).x, key), moved.x + 10);
      const width = (await cart.boundingBox()).width;
      await gesture(page, cart.locator(':scope > .layout-controls .layout-width-handle'), 50, 0);
      assert.ok((await cart.boundingBox()).width > width + 20, 'Selected cart can be resized');
      await page.locator('#globalLayoutEdit').click();
      const saved = await page.evaluate(k => localStorage.getItem(k), key);
      await page.reload();
      await ready(page);
      assert.equal(await page.evaluate(k => localStorage.getItem(k), key), saved, 'Position survives reload');
      assert.deepEqual(await page.evaluate(() => Object.fromEntries(
        globalLayoutItems.filter(x => isHomeCanvasItem(x) && x.id !== 'shopping').map(x => [x.key, localStorage.getItem(x.key)]))), otherPositions);
      assert.equal(await page.locator('#groceryDesktop').count(), 1, 'Same shopping client');
      assert.equal(await cart.locator(':scope > .layout-controls').count(), 1, 'No duplicate controls');
    }
    // Outside edit mode the list is usable, not draggable.
    await cart.locator('#groceryDesktop input').first().fill('Pommes');
    assert.equal(await cart.locator('#groceryDesktop input').first().inputValue(), 'Pommes');
    assert.deepEqual(errors, []);
    console.log('PASS: Courses drag, keyboard, resize and reload at 80/100/125/160%; other home positions preserved, one usable cart');
  } finally {
    await browser?.close();
    server.kill();
    await new Promise(r => setTimeout(r, 350));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
