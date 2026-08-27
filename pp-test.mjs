// prisma-panic smoke test — headless chromium, ANGLE/Vulkan
import puppeteer from 'puppeteer-core';

const EXE = '/usr/bin/chromium';
const URL = process.env.PP_URL || 'http://127.0.0.1:5195/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EXE, headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await wait(2200);

const st = () => page.evaluate(() => (window.__cap ? window.__cap.state() : null));
const key = async (k, down) => page.evaluate((k, d) => window.__cap.keys(k, d), k, down);
console.log('\n== boot ==');
let s = await st();
ok(!!s, '__cap debug hook present');
ok(s.mode === 'play', `boots straight into a run (mode=${s.mode})`);
ok(s.pressure >= 10 && s.pressure < 40, `starts at FRESH pressure (${s.pressure})`);

console.log('\n== movement & collision ==');
await page.evaluate(() => window.__cap.teleport(-18, 12));
const z0 = (await st()).z;
await key('KeyW', true);
await wait(900);
let s2 = await st();
ok(Math.hypot(s2.x + 18, s2.z - 12) > 1.2, `W drives the hero (x${s2.x} z${s2.z})`);
await key('KeyW', false);
// straight shot down the middle aisle (x=0) into the north wall
await page.evaluate(() => { window.__cap.teleport(0, -12); window.__cap.yaw(0); }); // yaw=0 faces -Z
await page.evaluate(() => { window.__cap.keys('ShiftLeft', true); window.__cap.keys('KeyW', true); });
await wait(2000); // ~5.4m sprint: reaches the wall, then presses into it
s2 = await st();
ok(s2.z < -17.3 && s2.z > -17.6, `north wall blocks the sprint and clamps (z=${s2.z})`);
await key('ShiftLeft', false); await key('KeyW', false);

console.log('\n== pressure economy ==');
const p0 = (await st()).pressure;
await wait(1600);
const p1 = (await st()).pressure;
ok(p1 > p0, `pressure climbs with time (${p0} -> ${p1})`);
// coffee espresso: risk item
await page.evaluate(() => window.__cap.teleport(10, -10));
await wait(200);
await key('KeyE', true); await wait(120); await key('KeyE', false);
await wait(300);
s = await st();
ok(s.toasts.some((t) => /espresso/i.test(t)), `espresso toast fires (${s.toasts.at(-1) || ''})`);
ok(s.inFreezer === false, 'coffee stand is outside the freezer');
// freezer aisle pushes pressure faster
await page.evaluate(() => window.__cap.teleport(10, 11));
await wait(400);
s = await st();
ok(s.inFreezer === true, 'teleport into freezer registers');

console.log('\n== toilet (relief) ==');
await page.evaluate(() => { window.__cap.set('pressure', 85); window.__cap.teleport(-21.5, -14); });
await wait(250);
const pPre = (await st()).pressure;
await key('KeyE', true);
await wait(700);
s = await st();
ok(s.relieving === true, `hold E at toilet = relieving (relieving=${s.relieving})`);
ok(s.pressure < pPre - 15, `pressure drains while relieving (${pPre} -> ${s.pressure})`);
await key('KeyE', false);

console.log('\n== accident ==');
await page.evaluate(() => window.__cap.set('pressure', 100));
await wait(350);
s = await st();
ok(s.wet === true, `100% pressure = wet pants (wet=${s.wet})`);
ok(s.accidents === 1, `accident counted (${s.accidents})`);
const wetHint = (await st()).toasts.some((t) => /SPLASH/.test(t));
ok(wetHint, 'the SPLASH toast lands');

console.log('\n== win + timeout endings ==');
await page.evaluate(() => { window.__cap.restart(); window.__cap.teleport(23, 12); });
await wait(300);
s = await st();
ok(s.mode === 'play' && s.quota === 0, `restart resets quota (mode=${s.mode})`);
ok(s.closing > 120, `fresh clock is randomized (${s.closing}s)`);
await page.evaluate(() => window.__cap.set('closing', 0.3));
await wait(700);
s = await st();
ok(s.mode === 'end' && /STORE CLOSED/.test(s.ending), `timeout ending fires (${s.ending})`);

console.log('\n== restart loop ==');
await page.evaluate(() => window.__cap.restart());
await wait(250);
s = await st();
ok(s.mode === 'play' && s.pressure < 40 && s.wet === false, 'R restarts a clean shift');

console.log('\n== camera tension ==');
await page.evaluate(() => window.__cap.set('pressure', 95));
await wait(900);
s = await st();
ok(s.state === 'CRITICAL', `CRITICAL state label (state=${s.state})`);
ok(s.fov < 64, `FOV squeezes at critical (fov=${s.fov})`);
ok(s.shake > 0.001, `camera shakes at critical (shake=${s.shake})`);

console.log('\n== perf / stability ==');
await wait(1500);
ok(errors.length === 0, `zero console/page errors (${errors.length}) ${errors[0] ? '— ' + String(errors[0]).slice(0, 140) : ''}`);
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 90) requestAnimationFrame(f); else res(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); }));
ok(fps > 30, `headless GPU renders at ${fps} fps`);

console.log(`\n${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
