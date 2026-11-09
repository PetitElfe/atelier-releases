// Browser protocol/UI checks, never presented as physical stylus/audio tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');

(async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-observations-ui-'));
  const child = spawn(process.env.PYTHON || 'python', [path.join(__dirname, 'verification.py'),
    '--no-browser', '--output', folder], {stdio: ['ignore', 'pipe', 'pipe']});
  let browser;
  try {
    const url = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(Error('Harness startup timeout')), 20000);
      child.stdout.on('data', data => {
        text += data;
        const match = text.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {clearTimeout(timer); resolve(match[0]);}
      });
      child.on('error', error => {clearTimeout(timer); reject(error);});
      child.on('exit', code => {clearTimeout(timer); reject(Error('Harness exit ' + code));});
    });
    browser = await chromium.launch({headless: true});
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('report').textContent.includes('NOT_VALIDATED'));
    assert.equal(await page.locator('[data-check]').count(), 15);
    assert.equal(await page.locator('[data-check]').evaluateAll(nodes => nodes.every(n => n.value === 'not_tested')), true);
    // An invented PointerEvent and a real browser mouse are not a physical pen.
    await page.locator('canvas').evaluate(canvas => canvas.dispatchEvent(new PointerEvent('pointermove',
      {pointerType: 'pen', buttons: 1, pressure: .8, pointerId: 1, bubbles: true})));
    assert.match(await page.locator('#pen').textContent(), /Aucun événement/);
    const rect = await page.locator('canvas').boundingBox();
    await page.mouse.move(rect.x + 25, rect.y + 25);
    await page.mouse.down();
    await page.mouse.move(rect.x + 80, rect.y + 60, {steps: 5});
    await page.mouse.up();
    await page.locator('[data-check=pc_sound]').selectOption('pass');
    await page.locator('[data-check=windows_notification_minimized]').selectOption('fail');
    await page.locator('#save').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Observations enregistrées'));
    let report = JSON.parse(fs.readFileSync(path.join(folder, fs.readdirSync(folder).find(f => f.endsWith('.json'))), 'utf8'));
    assert.equal(report.participant.pen_samples, 0);
    assert.equal(report.participant.strokes, 1);
    assert.equal(report.participant.audio_decoded, false);
    assert.equal(report.participant.checks.pc_sound, 'pass');
    assert.equal(report.participant.checks.windows_notification_minimized, 'fail');
    assert.equal(report.observations.physical_acceptance, 'NOT_VALIDATED');
    assert.equal(report.observations.master_update_allowed, false);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-check=pc_sound]').value === 'pass');
    assert.equal(await page.locator('[data-check=windows_notification_minimized]').inputValue(), 'fail');
    // CDP emulates pressure for the harness regression only. It is not hardware evidence.
    await page.locator('canvas').scrollIntoViewIfNeeded();
    const box = await page.locator('canvas').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: box.x + 25, y: box.y + 25,
      button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: .2});
    await cdp.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: box.x + 70, y: box.y + 50,
      button: 'left', buttons: 1, pointerType: 'pen', force: .8});
    await cdp.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: box.x + 70, y: box.y + 50,
      button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen', force: 0});
    await page.locator('#tailnet').fill('http://arbitrary.invalid');
    await page.locator('#configureTailnet').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Opération refusée'));
    await page.locator('#save').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Observations enregistrées'));
    report = JSON.parse(fs.readFileSync(path.join(folder, fs.readdirSync(folder).find(f => f.endsWith('.json'))), 'utf8'));
    assert.equal(report.participant.strokes, 2);
    assert.ok(report.participant.pen_samples >= 2);
    assert.ok(report.participant.pen_min > .19 && report.participant.pen_min < .21);
    assert.ok(report.participant.pen_max > .79 && report.participant.pen_max < .81);
    assert.equal(report.participant.checks.pen_pressure, 'not_tested');
    assert.equal(report.observations.master_update_allowed, false);
    assert.equal(report.review_required, true);
    assert.deepEqual(errors, []);
    console.log('Harness UI/protocol passed. No physical-device acceptance was performed.');
  } finally {
    if (browser) await browser.close();
    child.kill();
    fs.rmSync(folder, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
