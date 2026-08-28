import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'] });
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const st = () => page.evaluate(() => window.__cap.state());
// fresh visitor: tutorial not seen
await page.evaluate(() => localStorage.removeItem('pp_tutorial_done'));
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
let s = await st();
ok(s.tutorialSeen === false, 'fresh visitor: tutorial pending');
await new Promise((r) => setTimeout(r, 1500));
s = await st();
const hasTut = s.toasts.some((t) => /WASD to move/.test(t));
ok(hasTut, `tutorial line fires (toasts: ${JSON.stringify(s.toasts.slice(-1))})`);
// hit-stop: runTime drifts less during a splash than a normal 0.5s
const rt1 = s.runTime;
await page.evaluate(() => window.__cap.set('pressure', 100));
await new Promise((r) => setTimeout(r, 500));
const s2 = await st();
console.log(`  (hitstop window: runTime advanced ${(s2.runTime - rt1).toFixed(2)}s in ~0.5s wall, wet=${s2.wet})`);
await b.close();
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
