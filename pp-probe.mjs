import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', protocolTimeout: 120000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 1800));
await page.evaluate(() => { window.__cap.teleport(-14, 12); window.__cap.yaw(-Math.PI / 2); }); // +X sprint
const trace = [];
await page.evaluate(() => { window.__cap.keys('ShiftLeft', true); window.__cap.keys('KeyW', true); });
for (let i = 0; i < 14; i++) {
  await new Promise((r) => setTimeout(r, 150));
  trace.push(await page.evaluate(() => { const s = window.__cap.state(); return [s.x, s.z, s.speed].join(','); }));
}
console.log(trace.join('\n'));
await browser.close();
