// pp-m5c.mjs — M5 UI probe: perk picker + summary render centered, clickable, resume the run
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

// force the perk picker (what quota pickup does)
await page.evaluate(() => window.__cap.perkForce());
await sleep(400);
let s = await st();
ok(s.perkPickerOpen === true, 'perk picker opens on quota milestone');
// panel must be centered in the viewport, not clipped off the top-left
const box = await page.evaluate(() => {
  const p = document.querySelector('.picker');
  if (!p) return null;
  const r = p.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, pos: getComputedStyle(p).position };
});
ok(!!box, 'picker element exists');
if (box) {
  const inView = box.x >= 0 && box.y >= 0 && box.x + box.w <= box.vw + 2 && box.y + box.h <= box.vh + 2;
  ok(box.pos === 'absolute', `picker is absolutely positioned (position=${box.pos})`);
  ok(inView, `picker fully inside the viewport (x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.w)} h=${Math.round(box.h)} in ${box.vw}x${box.vh})`);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const centered = Math.abs(cx - box.vw / 2) < 40 && Math.abs(cy - box.vh / 2) < 60;
  ok(centered, `picker roughly centered (center at ${Math.round(cx)},${Math.round(cy)} vs ${box.vw / 2},${box.vh / 2})`);
}
// while open, the run is paused
const rt1 = (await st()).runTime;
await sleep(800);
const rt2 = (await st()).runTime;
ok(rt2 - rt1 < 0.05, `run pauses under the picker (runTime advanced ${(rt2 - rt1).toFixed(3)}s)`);
// click the first benefit — it must resume the run
await page.evaluate(() => { document.querySelector('.picker .popt')?.click(); });
await sleep(700);
s = await st();
ok(s.perkPickerOpen === false && s.perks.length === 1, `benefit applied and picker closed (perks=${JSON.stringify(s.perks)})`);
const rt3 = s.runTime;
await sleep(800);
const rt4 = (await st()).runTime;
ok(rt4 - rt3 > 0.5, `run resumes after picking (runTime advanced ${(rt4 - rt3).toFixed(2)}s)`);
console.log(`\n${pass} pass / ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
