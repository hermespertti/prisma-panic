// M10 CONTENT PROBES — deepen the bladder loop: weighted event pool (CODE PEEP /
// ICE BURST / SAMPLE CART), 5 new perks, wet-state escalation (4 tiers, smell
// radius, staff smell-detection), and the two new store zones (produce mist
// fills, deli counter relaxes). .mjs rule: the in-page brain is BARE JS.
import puppeteer from 'puppeteer-core';

const EXE = '/usr/bin/chromium';
const URL = 'http://127.0.0.1:5195/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EXE, headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await sleep(2500);
const st = () => page.evaluate(() => window.__cap.state());
const ev = (fn, ...args) => page.evaluate(fn, ...args);
const fresh = () => ev(() => { window.__cap.restart(4271); window.__cap.staffAway(); });
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('== M10 boot sanity (title still non-blocking) ==');
let s = await st();
ok(s.mode === 'play', 'run is live at boot (mode=' + s.mode + ')');
await ev(() => window.__cap.clockIn());
await sleep(150);

console.log('== event pool: CODE PEEP announcement ==');
await fresh(); await sleep(300);
await ev(() => { window.__cap.teleport(0, 0); });
const guardsBefore = (await st()).staff.map((x) => x.s);
ok((await ev(() => window.__cap.forceEvent('codepeep'))) === true, "forceEvent('codepeep') is a real pool event");
s = await st();
ok(s.mods.includes(0.6), 'CODE PEEP adds the +0.6 fill mod while it rings out');
ok(s.staff.some((x) => x.s === 'alert'), 'CODE PEEP puts floor-1 patrols on alert (states: ' + s.staff.map((x) => x.s).join(',') + ')');
await sleep(9000);
s = await st();
ok(!s.mods.includes(0.6), 'CODE PEEP mod expires after the 8s announcement');
ok((await st()).mode === 'play', 'CODE PEEP did not end the run');

console.log('== event pool: SAMPLE CART ==');
await fresh(); await sleep(300);
await ev(() => window.__cap.set('pressure', 50));
const pBefore = (await st()).pressure;
ok((await ev(() => window.__cap.forceEvent('samplecart'))) === true, "forceEvent('samplecart') is a real pool event");
await sleep(100);
const pAfter = (await st()).pressure;
ok(pAfter >= pBefore + 9.5, 'sample cart spiking the bladder (+10, got +' + (pAfter - pBefore).toFixed(1) + ')');

console.log('== event pool: ICE BURST ==');
await fresh(); await sleep(300);
await ev(() => { window.__cap.teleport(0, 0); });
const iceBefore = (await st()).ice ? await ev(() => window.__cap.ice()) : [];
const iceN0 = (await ev(() => window.__cap.ice())).length;
ok((await ev(() => window.__cap.forceEvent('iceburst'))) === true, "forceEvent('iceburst') is a real pool event");
await sleep(100);
const iceAfter = await ev(() => window.__cap.ice());
ok(iceAfter.length === iceN0 + 1, 'ICE BURST adds a fresh frozen patch (ice ' + iceN0 + ' -> ' + iceAfter.length + ')');
const np = iceAfter[iceAfter.length - 1];
const d = Math.hypot(np[0] - 0, np[1] - 0);
ok(d < 10, 'the burst lands near the player (+' + d.toFixed(1) + 'u — a hazard in your path, not on the moon)');
await page.evaluate(([x, z]) => window.__cap.teleport(x, z), np);
await sleep(100);
s = await st();
ok(s.slippery === true, 'the burst patch is actually slippery (isSlippery=true on it)');

console.log('== event pool: existing events still roll (regression) ==');
ok((await ev(() => window.__cap.forceEvent('flicker'))) === true, "forceEvent('flicker') still works");
s = await st();
ok(s.mods.includes(0.4), 'flicker still adds its +0.4 mod');
ok((await ev(() => window.__cap.forceEvent('puddle'))) === true, "forceEvent('puddle') still works");
ok((await ev(() => window.__cap.forceEvent('legend'))) === true, "forceEvent('legend') still works");
ok((await ev(() => window.__cap.forceEvent('nope'))) === false, 'unknown event key returns false, no crash');

console.log('== store zones: produce mist FILLs, deli RELAXES ==');
await fresh(); await sleep(300);
const rBase = await ev(() => window.__cap.rate());
ok(rBase > 1, 'rate() reads the live fill curve (' + rBase + ')');
await ev(() => { window.__cap.teleport(-19, 2.5); }); // inside the mist zone, clear of the solid display
await sleep(200);
s = await st();
ok(s.mods.includes(0.7), 'standing in the produce mist adds the +0.7 cold mod');
ok(await ev(() => window.__cap.rate()) > rBase, 'the mist makes the bladder fill faster (rate ' + rBase + ' -> ' + (await ev(() => window.__cap.rate())) + ')');
await ev(() => { window.__cap.teleport(0, 0); });
await sleep(200);
ok(!(await st()).mods.includes(0.7), 'leaving the mist drops the +0.7 mod');
await ev(() => { window.__cap.teleport(16.7, -10.5); }); // at the warm deli counter
await sleep(200);
s = await st();
ok(s.mods.includes(-0.3), 'standing at the deli counter adds the -0.3 warm mod');
const rDeli = await ev(() => window.__cap.rate());
ok(rDeli < rBase, 'the deli relaxes the bladder (rate ' + rBase + ' -> ' + rDeli + ')');
await ev(() => { window.__cap.teleport(0, 0); });
await sleep(200);
ok(!(await st()).mods.includes(-0.3), 'leaving the deli drops the -0.3 mod');

console.log('== wet-state escalation: the embarrassment clock ==');
await fresh(); await sleep(300);
s = await st();
ok(s.wet === false && s.wetTier === 0, 'a fresh shift is dry (tier 0)');
await ev(() => { window.__cap.setWet(5); });
s = await st();
ok(s.wet === true && s.wetTier === 0, 'wet at t=5s is tier 0 (local smell)');
await ev(() => { window.__cap.setWet(45); });
s = await st();
ok(s.wetTier === 1, 'wet at t=45s escalates to tier 1 (the smell drifts)');
ok(near(s.smellR, 7 * 1.4, 0.05), 'tier 1 smell radius grew (got ' + s.smellR + ', want 9.8)');
await ev(() => { window.__cap.setWet(100); });
s = await st();
ok(s.wetTier === 3, 'wet at t=100s escalates to tier 3 (CODE PEEP)');
ok(near(s.smellR, 7 * 2.2, 0.05), 'tier 3 smell radius is max (got ' + s.smellR + ', want 15.4)');
// the fill curve climbs with the tier: the store's judgment is a pressure tax
await fresh(); await sleep(300);
const rDry = await ev(() => window.__cap.rate());
await ev(() => window.__cap.setWet(0));
await sleep(100);
const rWet0 = await ev(() => window.__cap.rate());
await ev(() => window.__cap.setWet(100));
await sleep(100);
const rWet3 = await ev(() => window.__cap.rate());
ok(rWet0 > rDry * 1.1, 'wet at all costs: tier-0 wet fills faster than dry (' + rDry + ' -> ' + rWet0 + ')');
// tier-3 CODE PEEP also puts every guard on alert, stacking the +0.5 alert
// fill mod. Full decomposition: (dryBase + alertMod) * 1.15 (wet) * 1.6 (tier 3).
const mods3 = (await st()).mods;
const alertMod = mods3.includes(0.5) ? 0.5 : 0;
const expected3 = (rDry + alertMod) * 1.15 * 1.6;
ok(near(rWet3, expected3, 0.03), 'tier 3 judgment stacks +60% on the wet fill (got ' + rWet3 + ', want ' + expected3.toFixed(3) + ', alert mod ' + alertMod + ')');

console.log('== wet-state escalation: staff SMELL you (tier 2+) ==');
// guard parked at (21.5,16.5) via staffAway; hero at (12,10) = 11.5u out —
// beyond the 4.5u wet-sight spook and the 7u tier-0 smell, INSIDE the 12.6u
// tier-2 smell radius. If the guard leaves patrol, something smelled.
await fresh(); await sleep(300);
await ev(() => { window.__cap.teleport(12, 10); });
await ev(() => { window.__cap.setWet(5); }); // tier 0: radius 7u, guard at 11.5u
await sleep(600);
s = await st();
ok(s.staff[0].s === 'patrol' || s.staff[0].s === 'alert', 'sanity: guard exists (' + s.staff[0].s + ')');
const tier0Patrolling = s.staff.filter((x) => x.s === 'patrol').length;
await ev(() => { window.__cap.setWet(75); }); // tier 2: radius 12.6u > 11.5u
await sleep(600);
s = await st();
ok(s.staff.some((x) => x.s === 'alert'), 'at tier 2 the guard smells you and goes on alert (states: ' + s.staff.map((x) => x.s).join(',') + ')');
await ev(() => { window.__cap.setWet(100); }); // tier 3: CODE PEEP puts every patrol on alert
await sleep(600);
s = await st();
ok(s.staff.every((x) => x.s !== 'patrol'), 'at tier 3 the CODE PEEP puts the whole floor on alert (states: ' + s.staff.map((x) => x.s).join(',') + ')');

console.log('== new perks: each rewrites a real mechanic ==');
// ICE WATER: the whole fill curve scales
await fresh(); await sleep(300);
const r0 = await ev(() => window.__cap.rate());
ok((await ev(() => window.__cap.takePerk('icewater'))) === true, "takePerk('icewater') lands");
ok(near(await ev(() => window.__cap.rate()), r0 * 0.9, 0.02), 'ICE WATER cuts the fill 10% (' + r0 + ' -> ' + (await ev(() => window.__cap.rate())) + ')');
// TUCKED IN: the sprint cost mod changes value
await fresh(); await sleep(300);
ok((await ev(() => window.__cap.takePerk('tucked'))) === true, "takePerk('tucked') lands");
await ev(() => { window.__cap.keys('KeyW', true); window.__cap.keys('ShiftLeft', true); });
await sleep(500);
s = await st();
ok(s.mods.includes(0.55) && !s.mods.includes(0.8), 'TUCKED IN swaps the sprint cost 0.8 -> 0.55 (mods: ' + s.mods.join(',') + ')');
await ev(() => { window.__cap.keys('KeyW', false); window.__cap.keys('ShiftLeft', false); });
await sleep(100);
ok(!(await st()).mods.includes(0.55), 'the 0.55 sprint mod clears when the sprint stops');
// NAPKINS: the wet-pants speed tax is waived
await fresh(); await sleep(300);
ok((await ev(() => window.__cap.takePerk('napkins'))) === true, "takePerk('napkins') lands");
await ev(() => { window.__cap.keys('KeyW', true); });
await sleep(700);
const vDry = (await st()).speed;
await ev(() => { window.__cap.setWet(0); });
await sleep(700);
const vWetNap = (await st()).speed;
await ev(() => { window.__cap.keys('KeyW', false); });
ok(vDry > 3.5, 'dry walk speed measured (' + vDry.toFixed(1) + ')');
ok(vWetNap > vDry * 0.95, 'NAPKINS waives the wet speed tax (dry ' + vDry.toFixed(1) + ' vs wet ' + vWetNap.toFixed(1) + ')');
// COLD BREW: coffee now pays
await fresh(); await sleep(300);
ok((await ev(() => window.__cap.takePerk('coldbrew'))) === true, "takePerk('coldbrew') lands");
await ev(() => { window.__cap.teleport(10, -10); window.__cap.set('pressure', 50); });
const sc0 = (await st()).score;
await ev(() => window.__cap.keys('KeyE', true));
await sleep(80);
await ev(() => window.__cap.keys('KeyE', false));
await sleep(200);
const sc1 = (await st()).score;
ok(sc1 - sc0 >= 30, 'COLD BREW loyalty pays +30 for the sample (+ ' + (sc1 - sc0) + ')');
// DEODORANT: the smell radius shrinks
await fresh(); await sleep(300);
await ev(() => window.__cap.takePerk('deodorant'));
await ev(() => { window.__cap.setWet(0); });
s = await st();
ok(near(s.smellR, 7 * 0.7, 0.05), 'DEODORANT shrinks the smell radius (got ' + s.smellR + ', want 4.9)');

console.log('== perk pool depth (the picker offers from 10 now) ==');
await fresh(); await sleep(300);
const m10keys = ['icewater', 'tucked', 'napkins', 'coldbrew', 'deodorant'];
for (const k of m10keys) await ev((key) => window.__cap.takePerk(key), k);
s = await st();
ok(m10keys.every((k) => s.perks.includes(k)), 'all five M10 perks are real pool entries (took: ' + s.perks.join(',') + ')');
await ev(() => window.__cap.perkForce());
await sleep(200);
const btns = await page.evaluate(() => document.querySelectorAll('.popt').length);
ok(btns === 3, 'the picker still offers exactly 3 options from the deepened pool (got ' + btns + ')');

console.log('== zero console/page errors (whole session) ==');
ok(errors.length === 0, 'no console/page errors (' + errors.slice(0, 3).join(' | ') + ')');

console.log('\nM10 CONTENT: ' + pass + ' pass / ' + fail + ' fail');
await browser.close();
process.exit(fail ? 1 : 0);
