// pp-m6.mjs — M6 probe: panic fill (staff alert/chase raises bladder rate) + sprint cost
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const st = () => page.evaluate(() => window.__cap.state());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// sample fill rate over a window (pressure per second), hero held still at a safe spot
async function rate(label, setup) {
  if (setup) await page.evaluate(setup);
  await sleep(300);
  if (label === 'chase') await page.evaluate(() => window.__cap.staffChase()); // re-arm: fresh chase window
  if (label === 'alert') await page.evaluate(() => window.__cap.staffAlert());
  const a = (await st()).pressure;
  await sleep(1400);
  const bb = (await st()).pressure;
  const r = (bb - a) / 1.4;
  console.log(`  [rate ${label}] ${a.toFixed(1)} -> ${bb.toFixed(1)} = ${r.toFixed(2)}/s`);
  return r;
}

// baseline: calm staff, no sprint
await page.evaluate(() => { window.__cap.teleport(-18, 12); window.__cap.staffPatrol(); window.__cap.staffAway(); });
const base = await rate('baseline');
ok(base > 0.5 && base < 3, `baseline fill sanity (${base.toFixed(2)}/s)`);

// alert: heard a squeak nearby -> +0.5 tier
const alerted = await rate('alert', () => {
  window.__cap.teleport(-18, 12);
  window.__cap.staffPatrol();
  window.__cap.staffAlert();
});
ok(alerted > base + 0.3, `alert tier fills faster than baseline (${alerted.toFixed(2)} vs ${base.toFixed(2)}/s)`);

// chase: +1.3 tier, faster than alert
await page.evaluate(() => window.__cap.staffChase());
await sleep(500);
let s = await st();
ok(s.panic === true, `panic flag raised while chased (panic=${s.panic})`);
ok(s.toasts.some((t) => /bladder/i.test(t)), `chase fired the bladder toast (${s.toasts.at(-1) || ''})`);
const chased = await rate('chase', () => window.__cap.staffChase());
ok(chased > alerted + 0.4, `chase tier fills faster than alert (${chased.toFixed(2)} vs ${alerted.toFixed(2)}/s)`);

// sprint cost: holding Shift+W while calm adds ~0.8 to the fill rate
await page.evaluate(() => { window.__cap.teleport(-18, 12); window.__cap.staffAway(); window.__cap.staffPatrol(); window.__cap.keys('KeyW', true); window.__cap.keys('ShiftLeft', true); });
await sleep(300);
const a2 = (await st()).pressure;
await sleep(1400);
const b2 = (await st()).pressure;
const sprintRate = (b2 - a2) / 1.4;
await page.evaluate(() => { window.__cap.keys('KeyW', false); window.__cap.keys('ShiftLeft', false); });
ok(sprintRate > base + 0.4, `sprinting adds a bladder cost (${sprintRate.toFixed(2)} vs baseline ${base.toFixed(2)}/s)`);

// panic clears once staff return to patrol
await page.evaluate(() => { window.__cap.staffPatrol(); window.__cap.staffAway(); });
await sleep(600);
s = await st();
ok(s.panic === false, `panic flag clears when staff relax (panic=${s.panic})`);

console.log(`\n${pass} pass / ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
