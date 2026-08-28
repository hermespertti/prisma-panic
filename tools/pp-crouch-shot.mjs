import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'] });
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
const evalCap = (fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await evalCap(() => window.__cap.restart(7));
await sleep(500);
// standing, facing a shelf
await evalCap(() => window.__cap.teleport(3, 11));
await evalCap(() => window.__cap.yaw(-1.2));
await sleep(400);
await page.screenshot({ path: 'tools/crouch_standing.png' });
// crouching
await evalCap(() => window.__cap.keys('KeyC', true));
await sleep(700);
const crouch = await evalCap(() => window.__cap.state().crouching);
console.log('crouching =', crouch);
await page.screenshot({ path: 'tools/crouch_ducked.png' });
await b.close();
