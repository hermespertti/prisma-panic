// M9 FEEL PASS PROBES — clock-in title (audio-unlock gesture), player footstep
// cadence, guard footstep cadence, near-miss reaction (whoop + camera flinch).
// .mjs rule: the in-page brain is BARE JS (no TS type annotations).
import puppeteer from 'puppeteer-core';

const EXE = '/usr/bin/chromium';
const URL = 'http://127.0.0.1:5195/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EXE, headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await sleep(2500);
const st = () => page.evaluate(() => window.__cap.state());

console.log('== clock-in title ==');
let s = await st();
ok(s.titleUp === true, 'title card is up on boot (run is live behind it)');
ok(s.mode === 'play', 'boot is still straight into a run (mode=' + s.mode + ')');
ok(!!(await page.$('.title .tlogo')), 'title card renders in the DOM');
const box = await page.evaluate(() => {
  const t = document.querySelector('.title');
  if (!t) return null;
  const r = t.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
});
ok(!!box && box.x <= 1 && box.y <= 1 && box.w >= box.vw - 2 && box.h >= box.vh - 2, 'title covers the full viewport');

// click CLOCK IN via a real mouse gesture (the pulsing button sits below centre)
await page.mouse.click(640, 480);
await sleep(400);
s = await st();
ok(s.titleUp === false, 'clicking CLOCK IN dismisses the title');
ok((await page.evaluate(() => { const t = document.querySelector('.title'); return t ? getComputedStyle(t).display : 'gone'; })) !== 'flex', 'title element is hidden after clock-in');
ok((await page.evaluate(() => document.pointerLockElement !== null)), 'clock-in grabs pointer lock (audio-unlock gesture)');
ok((await page.evaluate(() => window.__cap.audioState())) === 'running', 'AudioContext is running after the click (state=' + (await page.evaluate(() => window.__cap.audioState())) + ')');

// clock-in is a one-shot: restart must not bring the card back
await page.evaluate(() => window.__cap.restart(999));
await sleep(300);
ok((await st()).titleUp === false, 'restart does not re-show the title');

// idempotent: clockIn() when the card is down is a no-op, no console errors
await page.evaluate(() => window.__cap.clockIn());
await sleep(150);
ok(errors.length === 0, 'no console/page errors from the title flow (' + errors.slice(0, 2).join(' | ') + ')');

console.log('== player footstep cadence ==');
await page.evaluate(() => { window.__cap.restart(4271); window.__cap.staffAway(); window.__cap.teleport(-14, 12); window.__cap.yaw(-Math.PI / 2); });
await sleep(400);
const f0 = (await st()).footstepCount;
await page.evaluate(() => window.__cap.keys('KeyW', true));
await sleep(1500);
const f1 = (await st()).footstepCount;
await page.evaluate(() => window.__cap.keys('KeyW', false));
await sleep(250);
const f2 = (await st()).footstepCount;
await sleep(400);
const f3 = (await st()).footstepCount;
ok(f1 > f0 + 2, 'walking produces footstep strikes (+' + (f1 - f0) + ' over 1.5s)');
ok(f3 - f2 <= 1, 'standing still stops the strikes (+' + (f3 - f2) + ' while idle)');

// crouch walk = slower cadence than a flat walk over the same time window
await page.evaluate(() => { window.__cap.restart(4271); window.__cap.staffAway(); window.__cap.teleport(-14, 12); window.__cap.yaw(-Math.PI / 2); });
await sleep(300);
const c0 = (await st()).footstepCount;
await page.evaluate(() => { window.__cap.keys('KeyW', true); window.__cap.keys('KeyC', true); });
await sleep(1500);
const c1 = (await st()).footstepCount;
await page.evaluate(() => { window.__cap.keys('KeyW', false); window.__cap.keys('KeyC', false); });
ok(c1 - c0 >= 2, 'crouch-walk still has footfall cadence (+' + (c1 - c0) + ' over 1.5s)');
ok(c1 - c0 < f1 - f0, 'crouch cadence is slower than flat walk (crouch +' + (c1 - c0) + ' vs walk +' + (f1 - f0) + ')');

console.log('== guard footstep cadence ==');
// hold a guard at ~3u by re-arming the chase every 200ms: chase = 5.2u/s =>
// ~2.5 heel strikes/s, all inside the 16u earshot cone, never close enough to land.
const H1 = [-14, 12];
await page.evaluate(() => { window.__cap.restart(4271); window.__cap.staffAway(); window.__cap.teleport(-14, 12); window.__cap.yaw(-Math.PI / 2); });
await sleep(300);
const g0 = (await st()).staffStepCount;
for (let i = 0; i < 7; i++) {
  await page.evaluate(([hx, hz]) => {
    const c = window.__cap, s = c.state();
    c.teleport(hx, hz);
    c.staffChaseAt([[+(hx + 3).toFixed(2), hz], [21.5, 16.5]]);
  }, H1);
  await sleep(200);
}
const g1 = (await st()).staffStepCount;
ok(g1 > g0 + 3, 'a guard at ~3u produces heel strikes (+' + (g1 - g0) + ' over 1.4s)');
ok((await st()).mode === 'play', 're-armed guard stayed at a distance during the footstep check');

// far guard = silent: hero at (-21,-14), both guards 27.8u out at (-10,12) — 0.6s chase closes ~3u, still ~25u
await page.evaluate(() => { window.__cap.restart(4271); window.__cap.staffAway(); window.__cap.teleport(-21, -14); window.__cap.yaw(-Math.PI / 2); });
await sleep(300);
const f0b = (await st()).staffStepCount;
await page.evaluate(() => window.__cap.staffChaseAt([[-10, 12]]));
await sleep(600);
const f1b = (await st()).staffStepCount;
ok(f1b - f0b <= 1, 'guard beyond the 16u earshot cone stays silent (+' + (f1b - f0b) + ' over 0.6s)');

console.log('== near-miss reaction ==');
// pin the guard at 1.9u (inside the 1.15-1.9u near-miss band, outside the 1.15u
// catch). Read d and re-pin ATOMICALLY in one in-page evaluate: the guard closes
// 5.2u/s, so a check-then-act round trip lets it land before the pin lands. The
// 1.9u drop guarantees it opens >0.75u above the catch line on the next frame.
await page.evaluate(() => { window.__cap.restart(4271); window.__cap.staffAway(); window.__cap.teleport(-14, 12); window.__cap.yaw(-Math.PI / 2); });
await sleep(300);
const drop = () => page.evaluate(([hx, hz]) => {
  const c = window.__cap;
  const a = -Math.PI / 4;
  c.staffChaseAt([[+(hx + Math.cos(a) * 1.9).toFixed(2), +(hz + Math.sin(a) * 1.9).toFixed(2)], [21.5, 16.5]]);
}, H1);
// atomic re-pin: if the guard has strayed (walked toward the hero), snap it back to
// 1.9u in the same in-page evaluate that reads its distance — no round-trip race.
const rePin = () => page.evaluate(([hx, hz]) => {
  const c = window.__cap, s = c.state();
  const d = s.staff[0] ? s.staff[0].d : -1;
  if (s.mode !== 'play' || d < 0 || d > 1.45) return;
  const a = -Math.PI / 4;
  c.staffChaseAt([[+(hx + Math.cos(a) * 1.9).toFixed(2), +(hz + Math.sin(a) * 1.9).toFixed(2)], [21.5, 16.5]]);
}, H1);
await drop(); // initial drop: guard spawns at 1.9u, whoop should fire within a frame
let maxShake = 0, pins = 0;
for (let i = 0; i < 40; i++) {
  const r = await st();
  if (r.mode !== 'play') break;
  maxShake = Math.max(maxShake, r.shake);
  await rePin();
  pins++;
  await sleep(25);
}
const nm = (await st()).nearMissCount;
ok(nm > 0, 'a guard at a hair\'s width fires the near-miss whoop (' + nm + ' after ' + pins + ' re-pins)');
ok(maxShake > 0.04, 'the camera flinches on the near-miss (max shake ' + maxShake.toFixed(3) + ' vs 0 baseline)');
ok((await st()).mode === 'play', 're-pinned guard never actually landed (mode=' + (await st()).mode + ')');

// cooldown: fresh guard, held in the band every 40ms for ~0.8s — at most one
// whoop per 2.6s window even though the guard never leaves the hair's-width range
await page.evaluate(() => { window.__cap.restart(4271); window.__cap.staffAway(); window.__cap.teleport(-14, 12); window.__cap.yaw(-Math.PI / 2); });
await sleep(300);
const m0 = (await st()).nearMissCount;
for (let i = 0; i < 20; i++) {
  const r = await st();
  if (r.mode !== 'play') break;
  await rePin();
  await sleep(40);
}
const m1 = (await st()).nearMissCount;
ok(m1 - m0 <= 1, 'near-miss has a cooldown, it does not spam per frame (+' + (m1 - m0) + ' in ~0.8s)');
ok((await st()).mode === 'play', 'cooldown pins never landed (mode=' + (await st()).mode + ')');

console.log('== soak bot compatibility: title must not eat the perk click ==');
// the M8 bot clicks perk buttons with a real mouse — the card must be gone first
await page.evaluate(() => { window.__cap.restart(4271); });
await sleep(200);
ok((await st()).titleUp === false, 'bot path: no title card after restart (bot already clocked in)');

console.log('== zero console/page errors (whole session) ==');
ok(errors.length === 0, 'no console/page errors (' + errors.slice(0, 3).join(' | ') + ')');

console.log('\nM9 FEEL: ' + pass + ' pass / ' + fail + ' fail');
await browser.close();
process.exit(fail ? 1 : 0);
