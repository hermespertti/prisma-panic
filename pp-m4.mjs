// pp-m4.mjs — probes: perk picker pauses + applies, shift difficulty, ranked ending
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

// seed 4271: 4271 % 5 = 1 -> difficulty 2 (TUESDAY)
let s = await st();
ok(s.difficulty === 2, `shift difficulty from seed (diff=${s.difficulty}, expected 2)`);
ok(s.shiftName === 'TUESDAY', `shift name is TUESDAY (got ${s.shiftName})`);

// pause check: timer frozen while picker is up
await page.evaluate(() => window.__cap.perkForce());
await new Promise((r) => setTimeout(r, 600));
const t1 = await page.evaluate(() => window.__cap.state().runTime);
await new Promise((r) => setTimeout(r, 1200));
const t2 = await page.evaluate(() => window.__cap.state().runTime);
ok(t2 - t1 < 0.02, `run pauses during perk pick (drift ${Math.abs(t2 - t1).toFixed(3)}s over 1.2s)`);

// picker shows 3 options, click one, verify effect
const picked = await page.evaluate(() => {
  const opts = document.querySelectorAll('.popt');
  if (!opts.length) return { n: 0, names: [] };
  const names = [...opts].map((o) => o.textContent.trim());
  opts[0].click();
  return { n: opts.length, names };
});
ok(picked.n === 3, `picker offers 3 perks (got ${picked.n})`);
await new Promise((r) => setTimeout(r, 500));
s = await st();
ok(s.perkPickerOpen === false, 'picker closes after pick');
ok(s.perks.length === 1, `perks recorded (${s.perks.join(',')})`);
console.log('    (picked from: ' + picked.names.map((n) => n.split('—')[0].trim()).join(' | ') + ')');

// run out to an ending: dump pressure to force accident chain, then close time
await page.evaluate(() => { window.__cap.set('pressure', 100); window.__cap.set('closing', 1); });
await new Promise((r) => setTimeout(r, 1500));
s = await st();
ok(s.mode === 'end' && /RANK [SABCD]/.test(s.summary || ''), `run ends with ranked score (summary: ${(s.summary || '').split('\n').slice(-2).join(' | ')})`);

if (errs.length) console.log('  console errors:\n    ' + errs.slice(0, 3).join('\n    '));
console.log(`\n${pass} pass / ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
