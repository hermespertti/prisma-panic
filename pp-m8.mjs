// M8 SOAK TEST — an AI bot plays COMPLETE shifts in the real game.
// No teleport-to-target cheating: it walks, sprints through the real floor
// doors, holds E at real toilets, clicks real perk buttons, crouches to shed
// real chases, and ends at the real car. Assertions verify the whole loop
// integrates and pacing holds across seeds.
//
// .mjs rule: the in-page brain is BARE JS (no TS type annotations).
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'] });
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function installBrain() {
  await page.evaluate(() => {
    const K = (q) => q.f + ':' + q.x + ':' + q.z;
    window.__bot = {
      B: null,
      reset() {
        this.B = {
          seen: new Set(), lastQuota: 0, legendDone: false,
          lastX: 0, lastZ: 0, lastT: performance.now(), moveAccum: 0,
          strafe: 0, strafeUntil: 0, nudges: 0, picked: [],
          samples: [], maxPressure: 0, minClosing: 999, camClearN: 0, nan: 0,
          crouchGame: 0, reliefTicks: 0, legendAppeared: false,
        };
        this.B.quads = window.__cap.nav().quads.slice();
      },
      tick() {
        const c = window.__cap;
        const s = c.state();
        const B = this.B;
        B.samples.push(s);
        B.maxPressure = Math.max(B.maxPressure, s.pressure);
        B.minClosing = Math.min(B.minClosing, s.closing);
        // NOTE: state().camClear is `!camRayClear(...)` — TRUE when BLOCKED. Count clear = !s.camClear.
        if (!s.camClear) B.camClearN++;
        if (![s.x, s.z, s.pressure, s.closing, s.speed].every((v) => Number.isFinite(v))) B.nan++;
        if (s.crouching) B.crouchGame++;
        if (s.relieving) B.reliefTicks++;
        if (s.legendActive) B.legendAppeared = true;
        if (s.mode !== 'play') return { done: true, s };

        // a quad was just collected — mark the nearest un-seen quad (on this floor) as seen
        if (s.quota > B.lastQuota) {
          let best = null, bd = 1e9;
          for (const q of B.quads) {
            if (B.seen.has(K(q)) || q.f !== s.floor) continue;
            const d = Math.hypot(q.x - s.x, q.z - s.z);
            if (d < bd) { bd = d; best = q; }
          }
          if (best) B.seen.add(K(best));
        }
        B.lastQuota = s.quota;

        if (s.perkPickerOpen) {
          const label = c.nav().picker();
          if (label) B.picked.push(label);
          return { s };
        }
        const nav = c.nav();
        let tx = s.x, tz = s.z, sprint = false, crouch = false, holdE = false;
        const remain = B.quads.filter((q) => !B.seen.has(K(q)));

        // staff proximity (state().staff[].d is per-staff distance on this floor)
        let nearestStaff = 1e9, chased = null;
        const sp = c.staffPos();
        for (let i = 0; i < s.staff.length; i++) {
          if (s.staff[i].d < nearestStaff) nearestStaff = s.staff[i].d;
          if (s.staff[i].s === 'chase' && sp[i]) chased = sp[i];
        }
        const legend = (s.legendActive && s.legendPos && s.floor === 1 && s.quota < 3) ? s.legendPos : null;
        // legendDone = actually got within the 10u sighting radius
        if (legend && Math.hypot(legend.x - s.x, legend.z - s.z) < 9.5) B.legendDone = true;
        const toilet = s.floor === 2 ? nav.toilets.deck : nav.toilets.floor1;
        const toiletHot = s.pressure > 50;

        if (chased) {
          // being hunted: the chase is a 4.2s timer — outrun it (7.4 > 5.2),
          // then the guard settles to alert and we fade
          const ax = s.x - chased[0], az = s.z - chased[1];
          const al = Math.hypot(ax, az) || 1;
          tx = s.x + (ax / al) * 8; tz = s.z + (az / al) * 8;
          sprint = true;
        } else if (s.quota >= 3) {
          if (s.floor === 2) { tx = nav.car.x; tz = nav.car.z; sprint = s.pressure < 75 && nearestStaff > 8; }
          else { tx = 23.8; tz = 12.1; sprint = nearestStaff > 8; } // east doorway up to the deck
        } else if (legend) {
          tx = legend.x; tz = legend.z;
        } else if (toiletHot) {
          tx = toilet.x + 1.0; tz = toilet.z + 1.0;
          if (Math.hypot(toilet.x - s.x, toilet.z - s.z) < 1.9) holdE = true;
        } else if (remain.length) {
          const same = remain.filter((q) => q.f === s.floor);
          if (same.length) {
            let best = same[0], bd = 1e9;
            for (const q of same) { const d = Math.hypot(q.x - s.x, q.z - s.z); if (d < bd) { bd = d; best = q; } }
            tx = best.x; tz = best.z;
            // a dry WALKING shopper is invisible (patrols only see sprinters/wet) —
            // sprint only when the nearest guard is out of the 7m spook range
            sprint = bd > 8 && s.pressure < 65 && nearestStaff > 8;
          } else if (s.floor === 1) { tx = 23.8; tz = 12.1; sprint = nearestStaff > 8; }
          else { tx = 20.6; tz = -13.3; sprint = nearestStaff > 8; }
        }
        // quiet travel near a patrolling guard: crouch-walk (2.07 m/s, unseeable)
        if (!chased && nearestStaff < 4.5 && !holdE) crouch = true;
        if (s.relieving) holdE = true;

        // stuck detection + escape (strafe, then a small nudge past the wall)
        const now = performance.now();
        const moved = Math.hypot(s.x - B.lastX, s.z - B.lastZ);
        if (moved > 0.02) B.moveAccum += moved;
        if (now - B.lastT > 1400) {
          if (B.moveAccum < 0.4 && Math.hypot(tx - s.x, tz - s.z) > 1.5) {
            B.strafe = B.strafe === 1 ? -1 : 1;
            B.strafeUntil = now + 900;
            if (B.nudges > 3) {
              const dx = tx - s.x, dz = tz - s.z, dl = Math.hypot(dx, dz) || 1;
              c.teleport(s.x + (dx / dl) * 1.1, s.z + (dz / dl) * 1.1);
              B.nudges = 0;
            } else B.nudges++;
          }
          B.moveAccum = 0; B.lastT = now;
        }
        B.lastX = s.x; B.lastZ = s.z;
        const dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz);
        c.yaw(Math.atan2(-dx, -dz));
        const strafing = now < B.strafeUntil;
        c.keys('KeyW', dist > 0.5);
        c.keys('KeyA', strafing && B.strafe === -1);
        c.keys('KeyD', strafing && B.strafe === 1);
        c.keys('ShiftLeft', sprint && dist > 3);
        c.keys('KeyC', crouch);
        c.keys('KeyE', holdE);
        return { s };
      },
    };
  });
}

async function playSeed(seed, budgetMs, closing) {
  await installBrain();
  await page.evaluate((sd, cl) => { window.__cap.restart(sd); window.__cap.set('closing', cl); window.__bot.reset(); }, seed, closing);
  await sleep(400);
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < budgetMs) {
    last = await page.evaluate(() => window.__bot.tick());
    await sleep(100);
    if (last && last.done) break;
  }
  const out = await page.evaluate(() => {
    const c = window.__cap;
    const s = c.state();
    const B = window.__bot.B;
    return {
      mode: s.mode, ending: s.ending, quota: s.quota, score: s.score,
      rank: s.rank, runTime: s.runTime, closing: s.closing, wet: s.wet,
      accidents: s.accidents, struts: s.struts, floors: s.floors,
      maxPressure: +B.maxPressure.toFixed(1), minClosing: B.minClosing,
      camClearRatio: +(B.camClearN / Math.max(1, B.samples.length)).toFixed(2),
      nan: B.nan, crouchTicks: B.crouchGame, reliefTicks: B.reliefTicks,
      legendDone: B.legendDone, legendAppeared: B.legendAppeared,
      picked: B.picked, nudges: B.nudges, sampleCount: B.samples.length,
      report: c.report(),
    };
  });
  out.seed = seed;
  out.wallSec = +((Date.now() - t0) / 1000).toFixed(1);
  return out;
}

// ---------- run ----------
const SEEDS = [4271, 9042, 1337, 20261020, 555];
const CLOSING = 240;  // the game's own minimum closing clock — a fair full-loop budget
const BUDGET = 420000; // per-seed wall-clock cap
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } };

const runs = [];
for (const seed of SEEDS) {
  console.log(`seed ${seed} playing (closing=${CLOSING}s)...`);
  const r = await playSeed(seed, BUDGET, CLOSING);
  runs.push(r);
  console.log(`  -> ${r.mode} | ${String(r.ending).slice(0, 38)} | quota ${r.quota} | score ${r.score} rank ${r.rank} | ${r.runTime}s (wall ${r.wallSec}s) | maxP ${r.maxPressure} | camClear ${r.camClearRatio} | relief ${r.reliefTicks} | nudges ${r.nudges}`);

  ok(r.mode === 'end', `s${seed}: run reached an ending`);
  ok(typeof r.ending === 'string' && r.ending.length > 5, `s${seed}: ending string present`);
  ok(r.nan === 0, `s${seed}: no NaN in tracked state (got ${r.nan})`);
  ok(r.maxPressure <= 100, `s${seed}: pressure never overflowed (max ${r.maxPressure})`);
  ok(r.minClosing >= 0, `s${seed}: closing clock never negative`);
  ok(r.camClearRatio >= 0.8, `s${seed}: camera clear most of the time (${r.camClearRatio})`);
  ok(r.score > 0, `s${seed}: score accumulated (${r.score})`);
  // duration must match the ending's character
  const isCaught = r.ending.startsWith('CAUGHT'), isClosed = r.ending.startsWith('STORE CLOSED'), isExit = r.ending.startsWith('CLEAN') || r.ending.startsWith('WET');
  const durOk = isCaught ? r.runTime > 3 && r.runTime < 200 : isClosed ? r.runTime > CLOSING - 15 : r.runTime > 25 && r.runTime < 300;
  ok(durOk, `s${seed}: run duration matches ending (${r.ending.slice(0, 12)}... lasted ${r.runTime}s)`);
  ok(r.report.head, `s${seed}: shift report rendered`);
  ok(r.report.lines.length >= 3, `s${seed}: report has >=3 lines (got ${r.report.lines.length})`);
  const dupes = r.report.lines.length - new Set(r.report.lines).size;
  ok(dupes === 0, `s${seed}: no duplicate report lines`);
  ok(!!r.report.lines.find((l) => l.includes('gives this shift')), `s${seed}: report has the desk grade line`);
  if (r.wet) ok(r.report.lines.some((l) => l.toLowerCase().includes('accident') || l.includes('jeans')), `s${seed}: wet run has accident/jeans line`);
  if (isExit) ok(r.floors >= 2, `s${seed}: exit ending touched the deck (floors ${r.floors})`);
  ok(r.quota <= 3, `s${seed}: quota clamped at 3 (got ${r.quota})`); // the M8 bug: was 474
  ok(r.quota >= 3 || isCaught || isClosed, `s${seed}: quota filled or valid failure ending (quota ${r.quota})`);
  // bladder invariant: pressure that got near-critical must have resolved —
  // relieved at a toilet, or turned into a wet-pants accident (not a silent leak)
  if (r.maxPressure >= 80) ok(r.reliefTicks > 0 || r.wet, `s${seed}: near-critical pressure resolved (relief ${r.reliefTicks}, wet ${r.wet}, maxP ${r.maxPressure})`);
  if (r.quota >= 2) ok(r.picked.length >= 2, `s${seed}: bot picked perks at quota 1 and 2 (${r.picked.length} picks)`);
  if (r.legendDone) ok(r.report.lines.some((l) => l.includes('2020 incident')), `s${seed}: legend sighting made it into the report`);
}

// pacing: the loop must be BEATABLE — at least one seed reaches the getaway car,
// and endings must vary (a run can fail in its own ways). (A conservative bot
// that mostly walks/crouch-walks exits on fewer seeds; a human sprints the spook
// risk. The integration bar is achievability + variety, not an exit rate.)
const exits = runs.filter((r) => r.ending.startsWith('CLEAN') || r.ending.startsWith('WET')).length;
const closed = runs.filter((r) => r.ending.startsWith('STORE CLOSED')).length;
ok(exits >= 1, `pacing: a clean run is achievable (car-exits ${exits}/${runs.length})`);
ok(new Set(runs.map((r) => r.ending.split(' — ')[0])).size >= 2, 'pacing: endings vary across seeds');
ok(closed <= runs.length * 0.6, `pacing: store-closed shouldn't dominate (${closed}/${runs.length})`);

// determinism: same seed twice -> same store, same difficulty, same shift
const a = await page.evaluate(() => { window.__cap.restart(4271); const c = window.__cap; return { quads: c.nav().quads, diff: c.state().difficulty, shift: c.state().shiftName, car: c.nav().car }; });
const b2 = await page.evaluate(() => { window.__cap.restart(4271); const c = window.__cap; return { quads: c.nav().quads, diff: c.state().difficulty, shift: c.state().shiftName, car: c.nav().car }; });
ok(JSON.stringify(a.quads) === JSON.stringify(b2.quads), 'determinism: same seed = same quad layout');
ok(a.diff === b2.diff && a.shift === b2.shift, 'determinism: same seed = same shift difficulty');
ok(JSON.stringify(a.car) === JSON.stringify(b2.car), 'determinism: same seed = same car slot');

console.log(`\nSOAK SUMMARY: ${exits} car-exits, ${closed} store-closed, ${runs.length - exits - closed} caught/other`);
console.log(`${pass} pass / ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
