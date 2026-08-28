// pp-m5d.mjs — M5 probe: pointer lock is released while picker/wardrobe are open
// (the cursor must be free to click the buttons; clicking the world re-locks)
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
const locked = () => page.evaluate(() => document.pointerLockElement !== null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// acquire pointer lock like a real player: click the world
await page.mouse.click(900, 400);
await sleep(400);
ok(await locked(), 'clicking the world acquires pointer lock');

// open the perk picker -> the cursor must be freed
await page.evaluate(() => window.__cap.perkForce());
await sleep(400);
ok((await st()).perkPickerOpen === true, 'perk picker open');
ok(!(await locked()), 'pointer lock released while picker is open (cursor is free)');

// free cursor must not drag the camera
const yaw1 = (await st()).yaw;
await page.mouse.move(400, 400); await sleep(50);
await page.mouse.move(700, 400); await sleep(50);
const yaw2 = (await st()).yaw;
ok(Math.abs(yaw2 - yaw1) < 0.001, `camera ignores a free cursor (yaw ${yaw1} -> ${yaw2})`);

// real mouse click on a benefit button (no ESC, no canvas click)
const btn = await page.evaluate(() => {
  const r = document.querySelector('.picker .popt')?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
ok(!!btn, 'benefit button has a clickable rect');
if (btn) {
  await page.mouse.move(btn.x, btn.y);
  await page.mouse.click(btn.x, btn.y);
  await sleep(500);
}
let s = await st();
ok(s.perkPickerOpen === false && s.perks.length === 1, `picked a benefit with the free cursor (perks=${JSON.stringify(s.perks)})`);
ok(!(await locked()), 'picking does NOT silently re-lock the pointer');
const rt3 = s.runTime;
await sleep(800);
ok((await st()).runTime - rt3 > 0.5, 'run resumed after picking');

// clicking the world again re-locks (the control loop still works)
await page.mouse.click(900, 400);
await sleep(400);
ok(await locked(), 'clicking the world re-acquires pointer lock');

// wardrobe (opened with B while locked) must also free the cursor
await page.keyboard.press('KeyB');
await sleep(400);
s = await st();
ok(s.wardrobeOpen === true, 'wardrobe opens with B');
ok(!(await locked()), 'pointer lock released while wardrobe is open');
await page.keyboard.press('KeyB');
await sleep(300);
ok((await st()).wardrobeOpen === false, 'wardrobe closes with B');

console.log(`\n${pass} pass / ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
