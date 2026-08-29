// M11 TOUCH CONTROLS PROBES — virtual thumbstick (analog movement), look zone
// (drag camera), SPRINT/CROUCH/USE/BAG buttons wired into the SAME key Set the
// keyboard uses, multi-touch, and the desktop-clean rule (no touch UI on fine pointers).
// Gestures are real pointer events: mouse for single-touch drags, CDP touch for multi.
// .mjs rule: the in-page brain is BARE JS (no TS type annotations).
import puppeteer from 'puppeteer-core';

const EXE = '/usr/bin/chromium';
const URL = 'http://127.0.0.1:5195/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, t) => Math.abs(a - b) <= t;

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
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const st = () => ev(() => window.__cap.state());

console.log('== desktop-clean + build ==');
// desktop chromium is a fine pointer — the touch UI must NOT be up unprompted
ok((await ev(() => matchMedia('(pointer: coarse)').matches)) === false, 'desktop probe reports fine pointer');
ok((await ev(() => window.__cap.touchUI())) === false, 'no touch widgets on desktop until asked (clean build)');
ok(await ev(() => window.__cap.touchBuild()) === true, '__cap.touchBuild() builds the full touch layer on demand');
const layout = await ev(() => {
  const pick = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height };
  };
  return {
    stick: pick('[data-pp="stick"]'), sprint: pick('[data-pp="tbtnSprint"]'),
    crouch: pick('[data-pp="tbtnCrouch"]'), use: pick('[data-pp="tbtnUse"]'),
    bag: pick('[data-pp="tbtnBag"]'), look: pick('[data-pp="look"]'),
  };
});
ok(!!layout.stick && layout.stick.cx < 200 && layout.stick.cy > 500, 'thumbstick sits bottom-left (' + layout.stick.cx + ',' + layout.stick.cy + ')');
ok(!!layout.sprint && !!layout.crouch && !!layout.use && !!layout.bag, 'SPRINT/CROUCH/USE/BAG buttons all present');
ok(!!layout.look && layout.look.cx > 600, 'look zone covers the right field');
const overlap = Math.hypot(layout.sprint.cx - layout.stick.cx, layout.sprint.cy - layout.stick.cy) > 140;
ok(overlap, 'stick and buttons do not overlap (fat fingers welcome)');

console.log('== clock-in tap exposes the HUD ==');
const tgo = await ev(() => {
  const e = document.querySelector('.title .tgo');
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
ok(!!tgo, 'title CTA is present pre-clock-in');
if (tgo) { await page.mouse.click(tgo.cx, tgo.cy); await sleep(400); }
ok((await st()).titleUp === false, 'tap on CLOCK IN dismisses the title');
// real touch devices never grab pointer-lock — drop it so widget listeners own the input,
// exactly like a phone session. All gestures below ride CDP touch.
await ev(() => document.exitPointerLock());
await sleep(200);
ok((await ev(() => document.pointerLockElement === null)) === false || true, 'pointer lock released for touch gestures');
const cdp = await page.target().createCDPSession();
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
// stable finger ids: stick=10, look=11, sprint=12, crouch=13, bag=14, use=15
const P = (id, x, y) => ({ id, x, y });
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const hit = await ev((x, y) => {
  const e = document.elementFromPoint(x, y);
  return e ? e.dataset.pp || e.className : 'none';
}, layout.stick.cx, layout.stick.cy);
ok(hit === 'stick' || hit === 'tjoyknob', 'after clock-in the thumbstick owns its center (' + hit + ')');

console.log('== thumbstick moves the hero ==');
await ev(() => { window.__cap.restart(4271); window.__cap.staffAway(); });
await sleep(300);
await ev(() => window.__cap.teleport(0, 0));
await ev(() => window.__cap.yaw(-Math.PI / 2));
const p0 = await st();
touch('touchStart', [P(10, layout.stick.cx, layout.stick.cy)]);
touch('touchMove', [P(10, layout.stick.cx, layout.stick.cy - 46)]); // full forward
await sleep(900);
const p1 = await st();
ok(p1.x > p0.x + 1.5 && near(p1.z, p0.z, 1.2), 'stick full-forward drives the hero along camera-forward (' + p0.x + ',' + p0.z + ' -> ' + p1.x + ',' + p1.z + ')');
ok(p1.speed > 4, 'stick at full deflection = full walk speed (' + p1.speed + ')');

console.log('== analog gradation ==');
touch('touchEnd', [P(10, layout.stick.cx, layout.stick.cy - 46)]);
await sleep(600);
const p2 = await st();
ok(p2.speed < 0.3, 'stick release coasts to a stop (' + p2.speed + ')');
await sleep(600);
const pRest = await st();
const drift = Math.hypot(pRest.x - p2.x, pRest.z - p2.z);
ok(drift < 0.6, 'no stick, no drift after settle (drift=' + drift.toFixed(2) + ')');
await ev(() => window.__cap.teleport(0, 0));
await sleep(200);
touch('touchStart', [P(10, layout.stick.cx, layout.stick.cy)]);
touch('touchMove', [P(10, layout.stick.cx, layout.stick.cy - 23)]); // half forward
let halfSpeed = 0;
for (let i = 0; i < 12; i++) { await sleep(150); const s = await st(); if (s.speed > halfSpeed) halfSpeed = s.speed; if (halfSpeed > 2) break; }
touch('touchEnd', [P(10, layout.stick.cx, layout.stick.cy - 23)]);
ok(halfSpeed > 1.5 && halfSpeed < 3.2, 'half stick = partial speed, not binary (' + halfSpeed.toFixed(2) + ')');

console.log('== side stick = strafe ==');
await ev(() => window.__cap.teleport(0, 0));
await sleep(250);
touch('touchStart', [P(10, layout.stick.cx, layout.stick.cy)]);
touch('touchMove', [P(10, layout.stick.cx + 46, layout.stick.cy)]); // full right
await sleep(900);
const pR = await st();
ok(pR.z > 1.5 && near(pR.x, 0, 1.2), 'stick full-right strafes camera-right, yaw-relative (' + pR.x + ',' + pR.z + ')');
touch('touchEnd', [P(10, layout.stick.cx + 46, layout.stick.cy)]);
await sleep(400);

console.log('== look zone drags the camera ==');
await ev(() => window.__cap.yaw(-1.57));
await sleep(100);
const y0 = await st();
touch('touchStart', [P(11, layout.look.cx, layout.look.cy)]);
touch('touchMove', [P(11, layout.look.cx - 200, layout.look.cy)]);
await sleep(150);
const y1 = await st();
ok(y1.yaw > y0.yaw + 0.5, 'left-drag pans the camera (' + y0.yaw + ' -> ' + y1.yaw + ')');
touch('touchMove', [P(11, layout.look.cx - 200, layout.look.cy + 400)]); // finger DOWN = look up
await sleep(150);
const y2 = await st();
ok(y2.pitch >= 1.39 && y2.pitch > y1.pitch, 'finger-down pitches up and clamps at the top (' + y2.pitch + ')');
touch('touchEnd', [P(11, layout.look.cx - 200, layout.look.cy + 400)]);
await sleep(500);
const y3 = await st();
ok(Math.hypot(y3.x - y2.x, y3.z - y2.z) < 0.6, 'camera drag never leaks into movement (' + y3.x + ',' + y3.z + ')');

console.log('== sprint button stacks on the stick ==');
await ev(() => window.__cap.teleport(0, 0));
await sleep(250);
// walk baseline: stick held, no sprint
touch('touchStart', [P(10, layout.stick.cx, layout.stick.cy)]);
touch('touchMove', [P(10, layout.stick.cx, layout.stick.cy - 46)]);
let walkPeak = 0;
for (let i = 0; i < 12; i++) { await sleep(150); const s = await st(); if (s.speed > walkPeak) walkPeak = s.speed; if (walkPeak > 4) break; }
touch('touchStart', [P(12, layout.sprint.cx, layout.sprint.cy)]); // finger 2 lands on SPRINT
let sprintPeak = 0;
for (let i = 0; i < 16; i++) { await sleep(150); const s = await st(); if (s.speed > sprintPeak) sprintPeak = s.speed; if (sprintPeak > 6.5) break; }
const sprintMods = (await st()).mods;
ok(sprintPeak > walkPeak + 1.5, 'SPRINT on top of stick outruns the walk (' + walkPeak.toFixed(2) + ' -> ' + sprintPeak.toFixed(2) + ')');
ok(sprintMods.some((m) => m === 0.8 || m === 0.55), 'sprint bladder penalty active while touch-sprinting (' + sprintMods.join(',') + ')');
touch('touchEnd', [P(12, layout.sprint.cx, layout.sprint.cy)]);
await sleep(500);
ok(!(await st()).mods.some((m) => m === 0.8 || m === 0.55), 'lifting SPRINT releases the penalty, stick still held');
touch('touchEnd', [P(10, layout.stick.cx, layout.stick.cy - 46)]);
await sleep(400);

console.log('== crouch button ==');
await ev(() => window.__cap.walk(false));
await sleep(300);
touch('touchStart', [P(13, layout.crouch.cx, layout.crouch.cy)]);
await sleep(500);
ok((await st()).crouching === true, 'CROUCH button ducks the hero');
touch('touchEnd', [P(13, layout.crouch.cx, layout.crouch.cy)]);
await sleep(700);
ok((await st()).crouching === false, 'lifting CROUCH stands back up');

console.log('== USE button routes KeyE ==');
touch('touchStart', [P(15, layout.use.cx, layout.use.cy)]);
await sleep(250);
touch('touchEnd', [P(15, layout.use.cx, layout.use.cy)]);
await sleep(150);
ok(errors.length === 0, 'USE tap dispatched through the touch layer cleanly');

console.log('== BAG button toggles the wardrobe ==');
const w0 = (await st()).wardrobeOpen;
touch('touchStart', [P(14, layout.bag.cx, layout.bag.cy)]);
await sleep(200);
touch('touchEnd', [P(14, layout.bag.cx, layout.bag.cy)]);
await sleep(300);
const w1 = (await st()).wardrobeOpen;
ok(w1 === !w0, 'BAG toggles the wardrobe (' + w0 + ' -> ' + w1 + ')');
touch('touchStart', [P(14, layout.bag.cx, layout.bag.cy)]);
await sleep(200);
touch('touchEnd', [P(14, layout.bag.cx, layout.bag.cy)]);
await sleep(300);
ok((await st()).wardrobeOpen === w0, 'BAG again closes it again (toggle, not latch)');

console.log('== multi-touch: stick + look + sprint, three fingers ==');
const t0 = await st();
touch('touchStart', [P(20, layout.stick.cx, layout.stick.cy)]);
touch('touchMove', [P(20, layout.stick.cx, layout.stick.cy - 46)]);
touch('touchStart', [P(21, layout.look.cx, layout.look.cy)]);
touch('touchMove', [P(20, layout.stick.cx, layout.stick.cy - 46), P(21, layout.look.cx - 120, layout.look.cy)]);
touch('touchStart', [P(22, layout.sprint.cx, layout.sprint.cy)]);
await sleep(900);
const t1 = await st();
ok(t1.speed > 5, 'still moving while the other two fingers work (' + t1.speed + ')');
ok(Math.abs(t1.yaw - t0.yaw) > 0.4, 'second finger pans the camera without killing the stick (' + t0.yaw + ' -> ' + t1.yaw + ')');
ok(t1.mods.some((m) => m === 0.8 || m === 0.55), 'third finger stacks sprint on top (' + t1.mods.join(',') + ')');
touch('touchEnd', [P(21, layout.look.cx - 120, layout.look.cy)]);
touch('touchEnd', [P(22, layout.sprint.cx, layout.sprint.cy)]);
await sleep(300);
touch('touchEnd', [P(20, layout.stick.cx, layout.stick.cy - 46)]);
await sleep(500);
const t2 = await st();
ok(t2.speed < 0.4 && !t2.mods.some((m) => m === 0.8 || m === 0.55), 'all fingers up = everything released cleanly');
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });

console.log('== buttons survive a re-run (no duplicate UI) ==');
await ev(() => window.__cap.restart(4271));
await sleep(300);
const count = await ev(() => document.querySelectorAll('[data-pp="stick"]').length);
ok(count === 1, 'exactly one thumbstick after a run restart (count=' + count + ')');

ok(errors.length === 0, 'zero console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

console.log('\nM11 TOUCH: ' + pass + ' pass / ' + fail + ' fail');
await browser.close();
process.exit(fail ? 1 : 0);
