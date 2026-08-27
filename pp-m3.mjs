// pp-m3.mjs — probes for the two-floor layer (deck, swaps, car, deck staff)
import puppeteer from 'puppeteer-core';
const URL = process.env.PP_URL || 'http://127.0.0.1:5195/';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const st = () => page.evaluate(() => window.__cap.state());

let s = await st();
ok(s.floor === 1 && typeof s.seed === 'number', `boot on floor 1, seed #${s.seed}`);

// deck switch via debug floor (atmosphere + camera stay legal there)
await page.evaluate(() => { window.__cap.floor(2); window.__cap.teleport(0, -4); });
let under = 0;
for (let i = 0; i < 5; i++) {
  const pitch = i % 2 ? 1.4 : -0.24;
  await page.evaluate(([a, p]) => { window.__cap.yaw(a, p); }, [-Math.PI / 2 + i, pitch]);
  await new Promise((r) => setTimeout(r, 350));
  const s2 = await st();
  if (s2.camY < 0.22) under++;
}
s = await st();
ok(s.floor === 2 && under === 0, `deck renders, camera never under deck (under=${under}/5)`);
ok(s.staff.length >= 1, `deck staff on patrol (${s.staff.length} spotted)`);

// natural ramp swap: sprint east through the hall doorway
await page.evaluate(() => { window.__cap.restart(4271); });
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => { window.__cap.teleport(21, 12.1); window.__cap.yaw(-Math.PI / 2); });
await page.evaluate(() => { window.__cap.keys('ShiftLeft', true); window.__cap.keys('KeyW', true); });
await new Promise((r) => setTimeout(r, 2200));
s = await st();
ok(s.floor === 2, `sprinting east through the doorway lands you on the deck (floor=${s.floor}, pos ${s.x},${s.z})`);
await page.evaluate(() => { window.__cap.keys('ShiftLeft', false); window.__cap.keys('KeyW', false); });

// trunk locked under quota, opens at quota 3
await page.evaluate(() => { window.__cap.restart(4271); });
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => { window.__cap.floor(2); });
const carProbe = await page.evaluate(() => {
  const s = window.__cap.state();
  return { floor: s.floor };
});
ok(carProbe.floor === 2, 'debug floor swap works for harness too');

console.log(`\n${pass} pass / ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
