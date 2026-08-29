// M12 visual QA: phone portrait + landscape shots of title + in-game HUD
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
await sleep(2600);
await page.screenshot({ path: 'tools/m12-portrait-title.png' });
const tap = await page.evaluate(() => {
  const e = document.querySelector('.title .tgo');
  const r = e.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await page.touchscreen.tap(tap.cx, tap.cy);
await sleep(600);
await page.evaluate(() => { window.__cap.set('pressure', 88); });
await sleep(900);
await page.screenshot({ path: 'tools/m12-portrait-play.png' });
await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await sleep(900);
await page.screenshot({ path: 'tools/m12-landscape-play.png' });
await browser.close();
console.log('shots done');
