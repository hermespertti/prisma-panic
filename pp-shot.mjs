// pp-shot.mjs — orbit-camera screenshots for eyeballing
import puppeteer from 'puppeteer-core';
const URL = process.env.PP_URL || 'http://127.0.0.1:5195/';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(URL, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2500));

await page.evaluate(() => { window.__cap.teleport(10, 11); window.__cap.yaw(-Math.PI / 2, 1.4); });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: '/tmp/pp_cam_over.jpg' });

await page.evaluate(() => { window.__cap.yaw(-Math.PI / 2, -0.24); });
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: '/tmp/pp_cam_low.jpg' });

await page.evaluate(() => { window.__cap.teleport(-18, -14); window.__cap.yaw(0, 0.9); });
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: '/tmp/pp_cam_bath.jpg' });
await b.close();
console.log('shots done');
