// pp-cam.mjs — targeted probes for the two camera complaints:
// 1) camera sinking under the floor (any pitch, anywhere)
// 2) camera unable to rotate past the horizon (needs to orbit ABOVE horizontal)
import puppeteer from 'puppeteer-core';

const URL = process.env.PP_URL || 'http://127.0.0.1:5195/';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2500)); // let a run boot

let pass = 0, fail = 0;
const ok = (name, cond, note = '') => {
  (cond ? (pass++, console.log('  PASS')) : (fail++, console.log('  FAIL')));
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + name + (note ? ` (${note})` : ''));
};

// park the camera at max upward pitch at several spots, let physics settle
const spots = [[0, 0], [10, 11], [-18, -14], [24, 12]];
let under = 0;
for (const [x, z] of spots) {
  await page.evaluate(async (x, z) => {
    window.__cap.teleport(x, z);
    window.__cap.yaw(-Math.PI / 2, 1.4); // +80° overhead = way over the horizon
    for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
  }, x, z);
  const s = await page.evaluate(() => window.__cap.state());
  if (s.camY < 0.22) under++;
}
ok('camera orbits ABOVE the horizon (pitch +1.4 rad holds)', under === 0, `under-floor spots=${under}/4`);

// default pitch = dead level: with a flat store behind the hero the ray must stay clear (no auto tuck)
await page.evaluate(() => { window.__cap.teleport(0, 0); window.__cap.yaw(-Math.PI / 2, -0.24); });
await new Promise((r) => setTimeout(r, 800));
const s2 = await page.evaluate(() => window.__cap.state());
ok('knee-cam pitch keeps lens above floor', s2.camY > 0.22, `camY=${s2.camY}`);
ok('zero console/page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

console.log(`\n${pass} pass / ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
