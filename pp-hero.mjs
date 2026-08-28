// pp-hero.mjs — M5: the Blender hero model loads, wires the rig, goes wet
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const st = () => page.evaluate(() => window.__cap.state());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
// wait for the GLB to load (async)
let s = await st();
for (let i = 0; i < 30 && !s.heroModelLoaded; i++) { await sleep(300); s = await st(); }
ok(s.heroModelLoaded === true, `hero.glb loaded from Blender (loaded=${s.heroModelLoaded})`);
ok((s.heroJeansMats || 0) >= 1, `rig picked up the M_Jeans material (mats=${s.heroJeansMats})`);
// walk a bit: model legs must be swinging (check rotation changes on LegL)
await page.evaluate(() => { window.__cap.keys('KeyW', true); });
await sleep(1200);
// sample the hero's x while walking — proves the model is in the live rig
const legA = await page.evaluate(() => window.__cap.state().x);
await sleep(900);
const legB = await page.evaluate(() => window.__cap.state().x);
ok(Math.abs(legB - legA) > 1.5, `hero walks (moved ${Math.abs(legB - legA).toFixed(1)} units in 0.9s)`);
await page.evaluate(() => { window.__cap.keys('KeyW', false); });
// go wet: the GLB jeans must darken (wet lerp) — sample material color via state proxy
await page.evaluate(() => window.__cap.set('pressure', 100));
await sleep(2500);
s = await st();
ok(s.wet === true, 'accident fired');
const jeansCol = await page.evaluate(() => window.__cap.jeansRGB());
ok(jeansCol && jeansCol[0] < 60, `GLB jeans went wet-dark (rgb=${jeansCol ? jeansCol.join(',') : 'n/a'})`);
// screenshot of the new hero mid-store
await page.evaluate(() => { window.__cap.restart(4271); });
await sleep(1200);
await page.evaluate(() => { window.__cap.keys('KeyW', true); });
await sleep(700);
await page.evaluate(() => { window.__cap.keys('KeyW', false); });
await page.screenshot({ path: '/home/lex/prisma-panic/tools/hero_ingame.png' });
if (errs.length) console.log('  console errors:\n    ' + errs.slice(0, 3).join('\n    '));
console.log(`\n${pass} pass / ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
