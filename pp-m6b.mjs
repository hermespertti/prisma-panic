// pp-m6b.mjs — M6 fake-shopping probe: crouch = slow + calm + real shelf cover that sheds a chase
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new', protocolTimeout: 360000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=vulkan', '--window-size=1280,720'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:5195/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const st = () => page.evaluate(() => window.__cap.state());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalCap = (fn, arg) => page.evaluate(fn, arg);
const G0 = { x: 21.5, z: 16.5 };

// teleport AND wait until the hero mesh has converged (LOS reads the mesh, not the physics pos)
async function settle(x, z) {
  await evalCap(([x, z]) => { window.__cap.staffPin(21.5, 16.5); window.__cap.teleport(x, z); }, [x, z]);
  for (let i = 0; i < 12; i++) {
    await sleep(80);
    const p = await evalCap(() => { const s = window.__cap.state(); return [s.x, s.z]; });
    const hm = await evalCap(() => window.__cap.heroMesh());
    if (hm && Math.hypot(hm[0] - x, hm[1] - z) < 0.12) return;
  }
}
// guards pin, settled hero, read LOS via the game's own geometry
const losAt = async (x, z) => { await settle(x, z); await sleep(120); return evalCap(() => window.__cap.staffLos()); };

// deterministic store
await evalCap(() => window.__cap.restart(7));
await sleep(600);

// scan the grid for real shelf cover (settled mesh + re-pinned guards at every sample)
const coverPts = [], openPts = [];
for (let x = -19; x <= 19; x += 2) {
  for (let z = -15; z <= 15; z += 2) {
    const d = Math.hypot(x - G0.x, z - G0.z);
    if (d < 8 || d > 20) continue;
    const los = await losAt(x, z);
    (los.some((L) => !L) ? coverPts : openPts).push({ x, z, los });
  }
}
let cover = coverPts.find((c) => c.los.some((L) => !L) && c.los.some((L) => L)) || coverPts[coverPts.length - 1];
let open = openPts.find((o) => o.los.every(Boolean));
console.log(`  [scan] ${coverPts.length} cover pts, ${openPts.length} open pts`);
ok(!!cover && !!open, `scanned real shelf cover (cover=${JSON.stringify(cover && { x: cover.x, z: cover.z })}, open=${JSON.stringify(open && { x: open.x, z: open.z })})`);
if (!cover || !open) { console.log(`  cover=${JSON.stringify(coverPts.slice(0, 3))} open=${JSON.stringify(openPts.slice(0, 3))}\n0 pass / ${fail + 1} fail (no geometry)`); await b.close(); process.exit(1); }

// 1. cover actually blocks the staff's view (open spot does not)
ok((await losAt(open.x, open.z)).every(Boolean), 'open spot: all staff can see you');
const coverLos = await losAt(cover.x, cover.z);
ok(coverLos.some((L) => !L), `behind the shelf: at least one guard loses sight (${JSON.stringify(coverLos)})`);

// 2. crouch slows you down
await settle(open.x, open.z);
await evalCap(() => window.__cap.keys('KeyW', true));
await sleep(900);
const walkSpeed = (await st()).speed;
await evalCap(() => window.__cap.keys('KeyW', false));
await sleep(400);
await evalCap(() => { window.__cap.keys('KeyW', true); window.__cap.keys('KeyC', true); });
await sleep(1100);
const crouchSpeed = (await st()).speed;
const crouchFlag = (await st()).crouching;
await evalCap(() => { window.__cap.keys('KeyW', false); window.__cap.keys('KeyC', false); });
ok(crouchFlag === true, `C registers as crouching (crouching=${crouchFlag})`);
ok(crouchSpeed < walkSpeed * 0.6, `crouching is slow (${crouchSpeed.toFixed(2)} vs walk ${walkSpeed.toFixed(2)}/s)`);

// 3. crouch buys seconds: fill rate drops while pretending to shop
async function rate(setupNode) {
  if (setupNode) await setupNode(); // Node-side setup (teleport / key presses)
  await evalCap(() => window.__cap.staffPatrol()); // silence: patrol + fresh lostT
  await sleep(300);
  const a = (await st()).pressure;
  await sleep(1500);
  const c = (await st()).pressure;
  return (c - a) / 1.5;
}
const baseRate = await rate(async () => { await settle(open.x, open.z); });
const crouchRate = await rate(async () => { await settle(open.x, open.z); await evalCap(() => window.__cap.keys('KeyC', true)); });
await evalCap(() => window.__cap.keys('KeyC', false));
ok(crouchRate < baseRate - 0.2, `crouching calms the fill (${crouchRate.toFixed(2)} vs baseline ${baseRate.toFixed(2)}/s)`);

// 4. the escape: fresh run, crouch behind the shelf, break LOS, shed the chase
await evalCap(() => window.__cap.restart(7));
await sleep(500);
// Confirm CROUCHED LOS at the cover spot is blocked for >=1 guard AND clear for >=1,
// and record the EXACT guard positions where it was measured (chase re-pins there, so the
// live geometry matches the static one).
let crouchLos = null, guardPts = [], spot = cover;
for (const cand of [cover, { x: cover.x + 1.5, z: cover.z }, { x: cover.x - 1.5, z: cover.z }, { x: cover.x, z: cover.z + 1.5 }, { x: cover.x, z: cover.z - 1.5 }]) {
  if (crouchLos) break;
  await settle(cand.x, cand.z);
  await evalCap(() => window.__cap.keys('KeyC', true));
  await sleep(600); // squish must land (isCrouched needs scale < 0.85)
  for (let i = 0; i < 4; i++) {
    await evalCap(() => window.__cap.staffPin(21.5, 16.5));
    await sleep(120);
    const l = await evalCap(() => window.__cap.staffLos());
    const pos = await evalCap(() => window.__cap.staffPos());
    if (l.some((v) => !v) && l.some((v) => v)) { crouchLos = l; guardPts = pos; spot = cand; break; }
  }
}
ok(!!crouchLos, `crouched at real shelf cover with >=1 guard blocked and >=1 with clear view (${JSON.stringify(crouchLos)} at ${JSON.stringify(spot)})`);
if (!crouchLos) { console.log(`\n${pass} pass / ${fail + 1} fail (no stable crouched cover)`); await b.close(); process.exit(1); }
// Chase-pin each guard back to its measured position until the blocked ones shed
let after = await st();
for (let i = 0; i < 20; i++) {
  await evalCap((pts) => window.__cap.staffChaseAt(pts), guardPts);
  await sleep(150);
  after = await st();
  if (after.staff.every((s, i2) => crouchLos[i2] || s.s !== 'chase')) break;
}
await evalCap(() => window.__cap.keys('KeyC', false));
const shed = after.staff.filter((_, i) => !crouchLos[i]);
const kept = after.staff.filter((_, i) => crouchLos[i]);
ok(after.wet === false, `no accident interfered with the escape (wet=${after.wet})`);
ok(shed.length > 0 && shed.every((s) => s.s !== 'chase'), `guards behind whom you hid lost the chase (${JSON.stringify(shed)})`);
ok(kept.every((s) => s.s === 'chase'), `guards with clear line of sight kept chasing (${JSON.stringify(kept)})`);
ok(after.toasts.some((t) => /cereal aisle|nutrition label/i.test(t)), `shed toast fired (${after.toasts.at(-1) || ''})`);
ok(after.mode === 'play', `still playing after shedding (mode=${after.mode})`);

console.log(`\n${pass} pass / ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
