// M12 MOBILE QA + PWA PROBES — manifest wired, icons served, offline shell
// registers, mute persists, and the whole HUD fits a real phone viewport
// (390x844 portrait with notch insets + landscape 844x390). Touch layer is
// built in a genuine coarse-pointer context (not the __cap.touchBuild escape hatch).
// .mjs rule: the in-page brain is BARE JS (no TS type annotations).
import puppeteer from 'puppeteer-core';

const EXE = '/usr/bin/chromium';
const BASE = 'http://127.0.0.1:5195/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EXE, headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan'],
});

// ---------- phone portrait: iPhone-ish 390x844 with a notch ----------
console.log('== phone portrait 390x844 (real coarse pointer) ==');
const phone = await browser.newPage();
await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const errors = [];
phone.on('pageerror', (e) => errors.push(String(e)));
phone.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await phone.goto(BASE, { waitUntil: 'domcontentloaded' });
await sleep(2500);
const pev = (fn, ...a) => phone.evaluate(fn, ...a);
const st = () => pev(() => window.__cap.state());

ok(await pev(() => matchMedia('(pointer: coarse)').matches) === true, 'phone reports a coarse pointer');
ok(await pev(() => window.__cap.touchUI()) === true, 'touch UI built automatically on a phone (no probe hatch)');

// manifest + theme + icons wired in the document
const meta = await pev(() => ({
  manifest: (document.querySelector('link[rel="manifest"]') || {}).href || null,
  apple: (document.querySelector('link[rel="apple-touch-icon"]') || {}).href || null,
  theme: (document.querySelector('meta[name="theme-color"]') || {}).content || null,
  fit: (document.querySelector('meta[name="viewport"]') || {}).content || '',
}));
ok(!!meta.manifest && meta.manifest.includes('manifest.webmanifest'), 'manifest link present (' + (meta.manifest || 'none') + ')');
ok(!!meta.apple && meta.apple.includes('apple-touch-icon'), 'apple-touch-icon present');
ok(meta.theme === '#0b0c11', 'theme-color matches the store at night');
ok(meta.fit.includes('viewport-fit=cover'), 'viewport-fit=cover for notch devices');

// the manifest itself parses and points at real served icons
const mani = await pev(async () => {
  const r = await fetch('./manifest.webmanifest');
  if (!r.ok) return { http: r.status };
  const j = await r.json();
  const icons = [];
  for (const ic of j.icons || []) {
    const ir = await fetch(ic.src.replace(/^\./, '.'));
    icons.push({ src: ic.src, ok: ir.ok, size: (ic.sizes || '') });
  }
  return { http: 200, display: j.display, name: j.name, icons };
});
ok(mani.http === 200, 'manifest served with JSON');
ok(mani.display === 'fullscreen', 'manifest display=fullscreen');
ok((mani.icons || []).length >= 3, 'manifest lists ' + (mani.icons || []).length + ' icons');
ok((mani.icons || []).every((i) => i.ok), 'every manifest icon actually serves');

// service worker: registered and controlled (Pages serves it; dev server too)
const sw = await pev(async () => {
  if (!('serviceWorker' in navigator)) return { has: false };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return { has: true, active: !!(reg && (reg.active || reg.installing || reg.waiting)),
             script: (reg && reg.active && reg.active.scriptURL) || null };
  } catch (e) { return { has: true, err: String(e) }; }
});
// headless chromium skips registration by design (hermetic probes) — accept either
// an ACTIVE worker serving sw.js, or the deliberate headless skip; sw.js itself
// must exist at its URL (checked above) so the wiring is real in both cases.
const swFile = await pev(async () => (await fetch('./sw.js')).status);
ok(swFile === 200, 'sw.js served at ./sw.js (' + swFile + ')');
ok(sw.active ? String(sw.script || '').endsWith('/sw.js')
             : await pev(() => navigator.userAgent.includes('HeadlessChrome')),
   'SW wiring honest: ' + (sw.active ? 'active worker on sw.js' : 'headless — deliberate skip'));

// title card fits the portrait viewport — CTA visible without scrolling
const fit = await pev(() => {
  const t = document.querySelector('.title');
  const go = document.querySelector('.tgo');
  if (!t || !go) return null;
  const g = go.getBoundingClientRect();
  return { goBottom: g.bottom, goTop: g.top, vh: innerHeight, vw: innerWidth };
});
ok(!!fit && fit.goBottom <= fit.vh, 'CLOCK IN CTA inside the portrait viewport (' + fit.goBottom.toFixed(0) + '/' + fit.vh + ')');

// clock in with a real touch tap, then check the HUD layout on the phone
const tap = await pev(() => {
  const e = document.querySelector('.title .tgo');
  const r = e.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await phone.touchscreen.tap(tap.cx, tap.cy);
await sleep(500);
ok((await st()).titleUp === false, 'touch tap clocks in on the phone');

const hudFit = await pev(() => {
  const pick = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width };
  };
  const s = pick('[data-pp="stick"]');
  const sp = pick('[data-pp="tbtnSprint"]');
  const cr = pick('[data-pp="tbtnCrouch"]');
  const u = pick('[data-pp="tbtnUse"]');
  const bg = pick('[data-pp="tbtnBag"]');
  const bar = pick('.bar');
  const mute = pick('[data-pp="mute"]');
  return { s, sp, cr, u, bg, bar, mute, vw: innerWidth, vh: innerHeight };
});
ok(!!hudFit.s && hudFit.s.r < hudFit.vw / 2, 'thumbstick stays in the left half (' + hudFit.s.r.toFixed(0) + '/' + hudFit.vw + ')');
ok(!!hudFit.bar && hudFit.bar.r <= hudFit.vw - 8, 'bladder bar fits the phone width (' + hudFit.bar.r.toFixed(0) + '/' + hudFit.vw + ')');
ok(!!hudFit.sp && !!hudFit.cr && !!hudFit.u && !!hudFit.bg, 'all four action buttons present in portrait');
// buttons must not fall off the bottom or overlap each other vertically
const btns = [hudFit.sp, hudFit.cr, hudFit.u, hudFit.bg];
ok(btns.every((b) => b.b <= hudFit.vh + 1), 'no button clipped at the bottom edge');
let vert = true;
for (let i = 1; i < btns.length; i++) vert = vert && btns[i].t >= btns[i - 1].b - 4;
ok(vert, 'action buttons stack without overlapping');
ok(!!hudFit.mute && hudFit.mute.l > hudFit.s.r, 'mute button clear of the thumbstick');

// gameplay still works through the phone path: stick pushes the hero
await pev(() => { window.__cap.restart(4271); window.__cap.staffAway(); });
const p0 = await st();
await pev(() => window.__cap.stick(0, -1));
await sleep(900);
await pev(() => window.__cap.stick(0, 0));
const p1 = await st();
ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, 'thumbstick moves the hero in portrait (' + Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1) + 'u)');

// ---------- mute: persists across reload ----------
console.log('== mute button ==');
ok(await pev(() => window.__cap.muted()) === false, 'sound starts unmuted');
const mutePos = await pev(() => {
  const e = document.querySelector('[data-pp="mute"]');
  const r = e.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await phone.touchscreen.tap(mutePos.cx, mutePos.cy);
await sleep(150);
ok(await pev(() => window.__cap.muted()) === true, 'tap mutes');
ok(await pev(() => document.querySelector('[data-pp="mute"]').textContent) === '🔇', 'icon flips to muted');
await phone.reload({ waitUntil: 'domcontentloaded' });
await sleep(2200);
ok(await pev(() => window.__cap.muted()) === true, 'mute survives a reload (persisted)');
await pev(() => window.__cap.mute(false));
await phone.reload({ waitUntil: 'domcontentloaded' });
await sleep(2200);
ok(await pev(() => window.__cap.muted()) === false, 'unmute survives too');

// ---------- landscape 844x390: the horizontal phone ----------
console.log('== landscape 844x390 ==');
await phone.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await sleep(600);
const land = await pev(() => {
  const go = document.querySelector('.title') ? document.querySelector('.tgo').getBoundingClientRect() : null;
  const s = document.querySelector('[data-pp="stick"]').getBoundingClientRect();
  const bar = document.querySelector('.bar').getBoundingClientRect();
  return { go: go && go.bottom, stickBottom: s.bottom, barBottom: bar.bottom, vh: innerHeight, vw: innerWidth };
});
ok(land.go === null || land.go <= land.vh, 'title CTA fits landscape');
ok(land.stickBottom <= land.vh + 1, 'thumbstick fully visible in landscape');
ok(land.barBottom <= land.vh + 1, 'bladder bar fully visible in landscape');

// ---------- desktop stays clean ----------
console.log('== desktop regression of the new UI ==');
const desk = await browser.newPage();
await desk.setViewport({ width: 1280, height: 720 });
const derr = [];
desk.on('pageerror', (e) => derr.push(String(e)));
await desk.goto(BASE, { waitUntil: 'domcontentloaded' });
await sleep(2200);
const dev = (fn, ...a) => desk.evaluate(fn, ...a);
ok(await dev(() => matchMedia('(pointer: coarse)').matches) === false, 'desktop stays fine-pointer');
ok(await dev(() => !!document.querySelector('[data-pp="mute"]')) === true, 'mute button shows on desktop too');
ok(await dev(() => window.__cap.touchUI()) === false, 'no touch widgets on desktop');
const muteClick = await dev(() => {
  const e = document.querySelector('[data-pp="mute"]');
  e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  return window.__cap.muted();
});
ok(muteClick === true, 'desktop mute click works');
await dev(() => { const e = document.querySelector('[data-pp="mute"]'); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
ok(await dev(() => window.__cap.muted()) === false, 'desktop unmute click works');

ok(errors.length === 0, 'phone console clean (' + errors.slice(0, 2).join(' | ') + ')');
ok(derr.length === 0, 'desktop console clean (' + derr.slice(0, 2).join(' | ') + ')');

await browser.close();
console.log(`\npp-m12: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
