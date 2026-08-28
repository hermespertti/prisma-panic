import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
// walk toward a quota item and pick it up so the picker opens naturally
await page.evaluate(() => window.__cap.perkForce());
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '/home/lex/prisma-panic/tools/picker_centered.png' });
await b.close();
console.log('shot saved');
