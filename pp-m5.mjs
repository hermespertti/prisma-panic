// pp-m5.mjs — M4 probes: shoppers, reactions, strut at mirror, wardrobe
import puppeteer from 'puppeteer-core';
const URL = process.env.PP_URL || 'http://127.0.0.1:5195/';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const st = () => page.evaluate(() => window.__cap.state());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let s = await st();
ok(s.shoppers >= 8, `shoppers in the aisles (${s.shoppers})`);

// shopper reaction to wet jeans — fresh run, staff are far from the spawn corner
await page.evaluate(() => window.__cap.restart(4271));
await sleep(500);
await page.evaluate(() => {
  window.__cap.set('pressure', 100);
  window.__cap.shoppersReact(0);
  window.__cap.shoppersNear(-18, 12, 3);
});
await sleep(800);
s = await st();
const reacted = s.toasts.some((t) => /wet-jeans|OH\.|TikTok|pretends not to smell|cart for leverage/.test(t));
ok(reacted, `a shopper reacts to the wet-jeans man (toasts: ${JSON.stringify(s.toasts.slice(-2))})`);

// DRY strut at the mirror: fresh run, hold E 1.4s, dance 1.6s
await page.evaluate(() => window.__cap.restart(4271));
await sleep(500);
const startScore = (await st()).score;
await page.evaluate(() => { window.__cap.staffAway(); window.__cap.teleport(-6, -14); window.__cap.keys('KeyE', true); });
await sleep(600);
ok(!(await st()).strutting, 'no instant strut before the hold completes');
await sleep(3400);
s = await st();
const dryDelta = s.score - startScore;
ok(s.struts === 1, `dry strut completed (struts=${s.struts})`);
ok(s.strutting === false, 'strut ends on its own');
ok(dryDelta >= 15, `dry strut pays dignity (delta ${dryDelta}, need >=15)`);
await page.evaluate(() => { window.__cap.keys('KeyE', false); });

// WET strut: fresh run, go wet, strut again — the Confident Strut pays more
await page.evaluate(() => window.__cap.restart(4271));
await sleep(500);
await page.evaluate(() => window.__cap.set('pressure', 100));
await sleep(300);
s = await st();
ok(s.wet === true, 'accident fires from pressure');
const wetBefore = s.score;
await page.evaluate(() => { window.__cap.staffAway(); window.__cap.teleport(-6, -14); window.__cap.keys('KeyE', true); });
await sleep(3400);
s = await st();
const wetDelta = s.score - wetBefore;
ok(s.struts === 1, `wet strut completed (struts=${s.struts})`);
ok(wetDelta > dryDelta, `the CONFIDENT strut pays more (wet ${wetDelta} > dry ${dryDelta})`);
await page.evaluate(() => { window.__cap.keys('KeyE', false); });

// wardrobe: open, close, persists
await page.evaluate(() => window.__cap.wardrobe());
await sleep(300);
s = await st();
ok(s.wardrobeOpen === true, 'wardrobe opens');
await page.evaluate(() => window.__cap.wardrobe());
await sleep(200);
s = await st();
ok(s.wardrobeOpen === false, 'wardrobe closes');
const pants = await page.evaluate(() => JSON.parse(localStorage.getItem('pp_pants_v1') || '{}'));
ok(pants.equipped && Array.isArray(pants.unlocked), `wardrobe persists to localStorage (equipped=${pants.equipped}, unlocked=${(pants.unlocked || []).join(',')})`);

if (errs.length) console.log('  console errors:\n    ' + errs.slice(0, 3).join('\n    '));
console.log(`\n${pass} pass / ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
