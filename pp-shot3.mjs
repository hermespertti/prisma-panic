// pp-shot3.mjs — eyeball the legend mid-incident + a strut
import puppeteer from 'puppeteer-core';
const URL = process.env.PP_URL || 'http://127.0.0.1:5195/';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));

// legend, mid-crouch, hero standing right there
await page.evaluate(() => { window.__cap.staffAway(); window.__cap.legend(); });
await new Promise((r) => setTimeout(r, 6500));
const lp = await page.evaluate(() => window.__cap.state().legendPos);
await page.evaluate(([x, z]) => { window.__cap.teleport(x, z + 3); window.__cap.yaw(Math.PI); }, [lp.x, lp.z]);
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: '/tmp/pp_legend.jpg' });

// strut at the mirror, wet
await page.evaluate(() => { window.__cap.set('pressure', 100); window.__cap.teleport(-6, -14); window.__cap.yaw(Math.PI); window.__cap.keys('KeyE', true); });
await new Promise((r) => setTimeout(r, 2600));
await page.screenshot({ path: '/tmp/pp_strut.jpg' });

await b.close();
console.log('shots done');
