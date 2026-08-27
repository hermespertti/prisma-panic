// pp-shot2.mjs — eyeball the parking deck
import puppeteer from 'puppeteer-core';
const URL = process.env.PP_URL || 'http://127.0.0.1:5195/';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__cap.floor(2));
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '/tmp/pp_deck1.jpg' });
await page.evaluate(() => { window.__cap.teleport(21.2, -13.9); window.__cap.yaw(-Math.PI / 2, 0.9); });
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: '/tmp/pp_deck2.jpg' });
await page.evaluate(() => { window.__cap.teleport(-16, -13); window.__cap.yaw(Math.PI / 2, 0.35); });
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: '/tmp/pp_deck3.jpg' });
await b.close();
console.log('shots done');
