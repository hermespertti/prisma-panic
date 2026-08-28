import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'] });
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__cap.restart(7));
await new Promise((r) => setTimeout(r, 250));
// a juicy shift: wet, legend seen, struts, shed, spooked, crouched
await page.evaluate(() => {
  const c = window.__cap;
  c.facts({ wet: true, accidents: 1, spooks: 1, sheds: 2, crouchT: 11, legendSeen: true, struts: 2, quota: 3, quotaTotal: 3, score: 105 });
  c.facts({ floors: new Set([1, 2]) });
  c.finish('WET EXIT — you fled to the deck, tanked the drive, and never told anyone');
});
await new Promise((r) => setTimeout(r, 150));
await page.screenshot({ path: 'tools/m7_report.png' });
await b.close();
console.log('shot saved');
