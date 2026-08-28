import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 3000));
const st = () => page.evaluate(() => window.__cap.state());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// floor 1 shot: mid-store with the new hero
await page.evaluate(() => window.__cap.teleport(-8, 4));
await sleep(900);
await page.screenshot({ path: '/home/lex/prisma-panic/tools/final_floor1.png' });

// floor 2: walk east through the hall door (23.2, 12.1) with speed
await page.evaluate(() => window.__cap.teleport(22.0, 12.1));
for (const k of ['KeyS', 'KeyW', 'KeyD', 'KeyA']) {
  await page.evaluate((k) => window.__cap.keys(k, true), k);
  await sleep(1100);
  const f = (await st()).floor;
  if (f === 2) break;
  await page.evaluate((k) => window.__cap.keys(k, false), k);
}
await page.evaluate(() => window.__cap.keys('KeyW', false));
await page.evaluate(() => window.__cap.keys('KeyS', false));
await page.evaluate(() => window.__cap.keys('KeyD', false));
await page.evaluate(() => window.__cap.keys('KeyA', false));
await sleep(1000);
const s = await st();
console.log('floor:', s.floor, 'x:', s.x, 'z:', s.z);
await page.screenshot({ path: '/home/lex/prisma-panic/tools/final_floor2.png' });
await b.close();
console.log('final shots saved');
