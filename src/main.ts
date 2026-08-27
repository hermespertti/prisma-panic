// ============================= prisma-panic main.ts ============================
// Third-person roguelike-ish prototype: a supermarket shift where your bladder
// is the health bar. Port of the Godot M1 spec (scripts-godot-ref/).
import * as THREE from 'three';
import * as SFX from './audio';

// ---------- debug hook (tests) ----------
const G = {
  mode: 'play' as 'play' | 'end',
  pressure: 10,
  wet: false,
  runTime: 0,
  closing: 300,
  quota: 0,
  quotaTotal: 3,
  accidents: 0,
  score: 0,
  coffeeCd: 0,
  mods: [] as number[],
  toasts: [] as string[],
  ending: '',
};
declare global { interface Window { __cap: any; __pp: any } }

// ---------- bladder state ----------
const FULL = 100;
const BASE_FILL = 1.2;
const RELIEF_RATE = 45;
const ACCIDENT_RECOVERY = 35;
const STATE_NAMES = ['FRESH', 'SQUEEZY', 'PRESSING', 'CRITICAL'];
function stateIdx(): number { return G.pressure < 40 ? 0 : G.pressure < 70 ? 1 : G.pressure < 90 ? 2 : 3; }
function stateName(): string { return STATE_NAMES[stateIdx()]; }
function pressureRate(): number {
  let r = BASE_FILL + G.mods.reduce((a, b) => a + b, 0);
  if (G.wet) r *= 1.15;
  return r;
}
let toastT = 0;
const hud = document.getElementById('hud')!;
const hudToast = document.createElement('div');
hudToast.className = 'toast';
hud.appendChild(hudToast);
function toast(msg: string): void {
  G.toasts.push(msg);
  if (G.toasts.length > 4) G.toasts.shift();
  hudToast.textContent = msg;
  hudToast.style.opacity = '1';
  toastT = 3.2;
}

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11131a);
scene.fog = new THREE.Fog(0x11131a, 18, 60);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 120);

let pointerLocked = false;
renderer.domElement.addEventListener('click', () => {
  renderer.domElement.requestPointerLock?.();
  SFX.humStart();
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0xe6ebf2, 0.55));
scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x39404d, 0.55));
const sun = new THREE.DirectionalLight(0xfff8ea, 1.6);
sun.position.set(-12, 18, -8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ---------- collision ----------
const boxes: { x: number; z: number; hx: number; hz: number }[] = [];
const addBox = (x: number, z: number, hx: number, hz: number) => boxes.push({ x, z, hx, hz });
function collide(x: number, z: number, r: number): [number, number] {
  for (const b of boxes) {
    const dx = x - b.x, dz = z - b.z;
    const ox = b.hx + r - Math.abs(dx);
    const oz = b.hz + r - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) x += Math.sign(dx || 1) * ox;
      else z += Math.sign(dz || 1) * oz;
    }
  }
  return [x, z];
}

// ---------- store geometry ----------
const store = new THREE.Group();
scene.add(store);
const mat = (c: number, rough = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
function box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, solid = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  store.add(mesh);
  if (solid) addBox(x, z, w / 2, d / 2);
  return mesh;
}
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 36), new THREE.MeshStandardMaterial({ color: 0xc8c3b8, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  store.add(floor);
}
// perimeter walls, bathroom corner (NW), exit gap (E side, z 10.8..13.2)
box(46, 3.2, 0.4, 0, 1.6, -18, mat(0x8d95a1));
box(46, 3.2, 0.4, 0, 1.6, 18, mat(0x8d95a1));
box(0.4, 3.2, 36, -23, 1.6, 0, mat(0x8d95a1));
box(0.4, 3.2, 28.8, 23, 1.6, -3.6, mat(0x8d95a1));
box(0.4, 3.2, 4.8, 23, 1.6, 15.6, mat(0x8d95a1));
box(0.4, 3.2, 4.5, -16.5, 1.6, -15.75, mat(0x7f9aa3)); // bathroom: two stall walls + a back wall
box(0.4, 3.2, 1.0, -16.5, 1.6, -11.5, mat(0x7f9aa3));
box(6.5, 3.2, 0.4, -19.75, 1.6, -11, mat(0x7f9aa3));
// ceiling + fluorescent strips (source of all pee-shivers)
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(46, 36), mat(0x23262e, 0.99));
ceil.rotation.x = Math.PI / 2;
ceil.position.y = 3.4;
store.add(ceil);
const stripMat = new THREE.MeshStandardMaterial({ color: 0xf2f6ff, emissive: 0xdfeaff, emissiveIntensity: 1.7, roughness: 0.4 });
for (const sx of [-15, -5, 5, 15]) for (const sz of [-10, 0, 10]) {
  const s = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 5), stripMat);
  s.position.set(sx, 3.26, sz);
  store.add(s);
}
for (const [px, pz] of [[-12, 0], [12, 4]] as const) {
  const pl = new THREE.PointLight(0xeef4ff, 22, 24, 1.8);
  pl.position.set(px, 3, pz);
  store.add(pl);
}
// shelf rows + merchandise silhouettes
const merchColors = [0xcc4433, 0xe68c26, 0xf2dd4d, 0x66b34d, 0x33999e, 0xbf5999, 0x805936, 0xdadcde];
const shelfMat = mat(0xb6b3ae);
function shelfRow(x: number, z: number, along: 'x' | 'z', len: number): void {
  const w = along === 'z' ? 1 : len, d = along === 'z' ? len : 1;
  box(w, 2, d, x, 1, z, shelfMat);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const n = Math.floor(len / 1.2);
  for (let i = 0; i < n; i++) {
    for (const level of [0.55, 1.1, 1.65]) {
      for (const side of [-1, 1]) {
        const s = 0.25 + ((i * 7919) % 997) / 997 * 0.15;
        const m2 = new THREE.Mesh(geo, mat(merchColors[(i * 7 + Math.floor(level * 13)) % merchColors.length]));
        m2.scale.set(s, s * 1.2, s * 0.8);
        const t = -len / 2 + 0.8 + i * 1.2;
        const off = side * 0.53;
        m2.position.set(
          x + (along === 'z' ? off : t),
          level + s * 0.6,
          z + (along === 'z' ? t : off),
        );
        m2.castShadow = true;
        store.add(m2);
      }
    }
  }
}
shelfRow(-10, -6, 'z', 14);
shelfRow(-3, -6, 'z', 14);
shelfRow(4, -6, 'z', 14);
shelfRow(8, 4, 'x', 12);

// ---------- interactables ----------
// The toilet (NW corner).
const toiletMat = new THREE.MeshStandardMaterial({ color: 0xeef0e8, roughness: 0.35, metalness: 0.05 });
const toilet = new THREE.Group();
{
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), toiletMat);
  bowl.scale.set(1, 0.55, 1.25); bowl.position.y = 0.42; bowl.castShadow = true;
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.1, 16), toiletMat);
  seat.position.y = 0.68;
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.2), toiletMat);
  tank.position.set(0, 0.85, -0.36); tank.castShadow = true;
  toilet.add(bowl, seat, tank);
  toilet.position.set(-22, 0, -14.5);
  toilet.rotation.y = Math.PI / 2;
  store.add(toilet);
  addBox(-22, -14.5, 0.45, 0.45);
  const glow = new THREE.PointLight(0x66ff99, 6, 6, 1.6);
  glow.position.set(0, 1.7, 0);
  toilet.add(glow);
}
// Coffee stand.
const coffee = new THREE.Group();
const cup = new THREE.Group();
{
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.8), new THREE.MeshStandardMaterial({ color: 0xb8452f, roughness: 0.6 }));
  counter.position.y = 0.55; counter.castShadow = true;
  const cupM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.16, 10), mat(0xf2f2ea, 0.6));
  cupM.position.set(0.25, 1.16, 0);
  cup.add(cupM);
  coffee.add(counter, cup);
  coffee.position.set(10, 0, -10);
  store.add(coffee);
}
// Freezer aisle.
const freezerZone = { x: 10, z: 11, hx: 5, hz: 4 };
function inRect(x: number, z: number, r: { x: number; z: number; hx: number; hz: number }): boolean {
  return Math.abs(x - r.x) < r.hx && Math.abs(z - r.z) < r.hz;
}
{
  const floor2 = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ color: 0xaee0f5, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.85 }));
  floor2.rotation.x = -Math.PI / 2;
  floor2.position.set(10, 0.011, 11);
  store.add(floor2);
  const iceLight = new THREE.PointLight(0x9fd8ff, 14, 12, 1.7);
  iceLight.position.set(10, 2.6, 11);
  store.add(iceLight);
  for (let i = 0; i < 3; i++) {
    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.1), mat(0xeaf3fa, 0.35));
    chest.position.set(7 + i * 3, 0.45, 11);
    chest.castShadow = true;
    store.add(chest);
    addBox(7 + i * 3, 11, 1.1, 0.55);
  }
}
// Quota items (glowing loot).
function quotaAt(x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshStandardMaterial({ color: 0xe67a14, emissive: 0xff6a00, emissiveIntensity: 1.1, roughness: 0.4 }));
  m.position.set(x, y, z);
  m.castShadow = true;
  store.add(m);
  return m;
}
const quads = [quotaAt(-16.2, 0.2, -13), quotaAt(14, 0.6, 14.5), quotaAt(20.4, 0.2, 13)];
box(0.7, 0.5, 0.7, 14, 0.25, 14.5, mat(0xddeef5, 0.5)); // ice-box pedestal
box(0.6, 1.0, 0.6, 20.4, 0.5, 13, mat(0x6a737f, 0.6));   // exit pedestal
// Exit doors.
{
  const exitMat = new THREE.MeshStandardMaterial({ color: 0x2fbf5f, emissive: 0x19d34c, emissiveIntensity: 1.4, roughness: 0.5 });
  const exitDoors = new THREE.Group();
  const leaves = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x9fb2c2, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.55 }));
  leaves.position.y = 1.1;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.08), exitMat);
  sign.position.y = 2.45;
  exitDoors.add(leaves, sign);
  exitDoors.position.set(23.2, 0, 12);
  store.add(exitDoors);
}

// ---------- the hero (reference still: black long sleeve, jeans, buckle, cap) ----------
const hero = new THREE.Group();
const dryJeans = new THREE.Color(0x3a5a8c), wetJeans = new THREE.Color(0x1a2c54);
const jeansMat = new THREE.MeshStandardMaterial({ color: dryJeans.clone(), roughness: 0.95 });
const blackMat = mat(0x1b1d24, 0.9);
const skinMat = mat(0xe0b894, 0.8);
const buckleMat = mat(0xffffff, 0.5);
function mk(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
mk(new THREE.CylinderGeometry(0.3, 0.3, 0.62, 12), blackMat, 0, 1.25, 0, hero);
mk(new THREE.BoxGeometry(0.5, 0.24, 0.32), jeansMat, 0, 0.88, 0, hero);
mk(new THREE.CylinderGeometry(0.29, 0.29, 0.05, 12), blackMat, 0, 1.0, 0, hero);
mk(new THREE.BoxGeometry(0.12, 0.07, 0.03), buckleMat, 0, 1.0, 0.27, hero);
mk(new THREE.SphereGeometry(0.17, 12, 10), skinMat, 0, 1.78, 0, hero);
mk(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 12), blackMat, 0, 1.96, 0, hero);
mk(new THREE.BoxGeometry(0.3, 0.03, 0.18), blackMat, 0, 1.94, -0.22, hero);
mk(new THREE.SphereGeometry(0.09, 10, 8), skinMat, 0.16, 1.38, 0.14, hero);  // clasped hands
mk(new THREE.SphereGeometry(0.09, 10, 8), skinMat, -0.16, 1.38, 0.14, hero); // in front, that walk
const legs: THREE.Object3D[] = [], arms: THREE.Object3D[] = [];
for (const s of [-1, 1]) {
  const leg = new THREE.Group(); leg.position.set(s * 0.14, 0.7, 0); hero.add(leg);
  mk(new THREE.CylinderGeometry(0.14, 0.14, 0.68, 10), jeansMat, 0, -0.34, 0, leg);
  mk(new THREE.BoxGeometry(0.2, 0.1, 0.34), blackMat, 0, -0.66, 0.06, leg);
  legs.push(leg);
  const arm = new THREE.Group(); arm.position.set(s * 0.42, 1.5, 0); hero.add(arm);
  mk(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 10), blackMat, 0, -0.24, 0, arm);
  arms.push(arm);
}
hero.position.set(-18, 0, 12);
scene.add(hero);

// ---------- player state ----------
const player = { x: -18, z: 12, r: 0.36 };
const vel = { x: 0, z: 0 };
let camYaw = -Math.PI / 2, camPitch = -0.32, camShake = 0;
const CAM_DIST = 4.4;
let walkPhase = 0, relieving = false, heartbeatT = 0, dripT = 0, eHeld = false;
let clock = 240 + Math.random() * 120; // randomised closing time (M3 will seed per-floor)
const keys = new Set<string>();
const SPEED = 4.6, SPRINT = 7.4;

// ---------- HUD ----------
function el(cls: string, text: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  hud.appendChild(d);
  return d;
}
const bar = el('bar', '');
const barFill = document.createElement('div');
barFill.className = 'barfill';
bar.appendChild(barFill);
const stateLbl = el('lbl state', 'BLADDER: FRESH');
const clockLbl = el('lbl clock', '');
const quotaLbl = el('lbl', 'QUOTA 0/3');
const hintLbl = el('lbl hint', '');
const wetLbl = el('lbl wet', 'WET PANTS');
wetLbl.style.display = 'none';
const sumLbl = el('summary', '');
sumLbl.style.display = 'none';
function fmt(t: number): string { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${s.toString().padStart(2, '0')}`; }
const STATE_COLORS = ['#57cc57', '#d9d94d', '#f29b26', '#e64433'];

// ---------- run flow ----------
function startRun(): void {
  G.mode = 'play';
  G.pressure = 10; G.wet = false; G.runTime = 0; G.closing = clock;
  G.quota = 0; G.accidents = 0; G.score = 0; G.coffeeCd = 0;
  G.mods = []; G.toasts = []; G.ending = '';
  player.x = -18; player.z = 12; vel.x = 0; vel.z = 0;
  relieving = false;
  quads.forEach((q) => (q.visible = true));
  cup.visible = true;
  toast('Quota first, then the exit. And find a toilet before the pants decide for you.');
  sumLbl.style.display = 'none';
  wetLbl.style.display = 'none';
  SFX.humStart();
}
function accident(): void {
  G.wet = true;
  G.pressure = ACCIDENT_RECOVERY;
  G.accidents++;
  toast("...SPLASH. You heard that, didn't you?");
  SFX.splash(); SFX.plop();
  camShake = 0.14;
}
function endRun(ending: string): void {
  if (G.mode !== 'play') return;
  G.mode = 'end';
  G.ending = ending;
  SFX.humStop();
  const bonus = ending.startsWith('CLEAN') ? 50 : ending.startsWith('WET') ? 25 : 10;
  G.score += bonus;
  sumLbl.textContent =
    `RUN COMPLETE\n\n${ending}\n\nShift time ${fmt(G.runTime)} · Quota ${G.quota}/3 · Accidents ${G.accidents}\nSCORE ${G.score}\n\n[ press R to run it back ]`;
  sumLbl.style.display = 'block';
}

// ---------- interact registry ----------
type Inter = { x: number; z: number; r: number; hint: () => string; on: () => void };
const interactables: Inter[] = [
  {
    x: -22, z: -14.5, r: 2.1,
    hint: () => 'Use the toilet',
    on: () => { relieving = true; },
  },
  {
    x: 10, z: -10, r: 1.9,
    hint: () => (G.coffeeCd <= 0 && cup.visible ? 'Grab free coffee' : 'Coffee stand (out of samples)'),
    on: () => {
      if (G.coffeeCd > 0) { toast('"One at a time, dear," says the lady.'); return; }
      if (!cup.visible) { toast('The stand is empty. The lady shrugs.'); return; }
      cup.visible = false;
      G.coffeeCd = 30;
      G.pressure = Math.min(FULL, G.pressure + 12);
      G.mods.push(0.35);
      toast('Free espresso. Tastes like victory. (Your bladder notes this.)');
    },
  },
];
function nearest(list: Inter[], x: number, z: number): Inter | null {
  let best: Inter | null = null, bd = 2.1;
  for (const it of list) {
    const d = Math.hypot(it.x - x, it.z - z);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

// ---------- debug hooks ----------
window.__cap = {
  state: () => ({
    mode: G.mode, pressure: +G.pressure.toFixed(1), wet: G.wet, state: stateName(),
    x: +player.x.toFixed(2), z: +player.z.toFixed(2),
    yaw: +camYaw.toFixed(2), pitch: +camPitch.toFixed(2),
    speed: +Math.hypot(vel.x, vel.z).toFixed(2),
    fov: +camera.fov.toFixed(1), shake: +camShake.toFixed(3),
    quota: G.quota, closing: Math.max(0, Math.round(G.closing)),
    accidents: G.accidents, score: G.score, relieving,
    inFreezer: inRect(player.x, player.z, freezerZone),
    toasts: [...G.toasts], ending: G.ending,
  }),
  keys: (k: string, down: boolean) => { if (down) keys.add(k); else keys.delete(k); },
  walk: (down: boolean) => { if (down) keys.add('KeyW'); else keys.delete('KeyW'); },
  teleport: (x: number, z: number) => { player.x = x; player.z = z; vel.x = 0; vel.z = 0; },
  yaw: (y: number, p?: number) => { camYaw = y; if (p !== undefined) camPitch = p; },
  restart: () => startRun(),
  set: (k: string, v: number) => { if (k === 'pressure') { G.pressure = v; if (v >= FULL) accident(); } if (k === 'closing') G.closing = v; },
};
window.__pp = window.__cap;

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyR') { startRun(); return; }
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  camYaw -= e.movementX * 0.0024;
  camPitch = THREE.MathUtils.clamp(camPitch - e.movementY * 0.002, -1.1, -0.05);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- main loop ----------
let last = performance.now();
function step(): void {
  const dt = Math.min(0.05, (performance.now() - last) / 1000);
  last = performance.now();

  if (G.mode === 'play') {
    G.runTime += dt;
    G.closing -= dt;
    G.coffeeCd -= dt;
    if (G.closing <= 0) endRun('STORE CLOSED — the lights died mid-strut. Security found you at the deli counter.');

    // bladder
    if (relieving) {
      G.pressure = Math.max(0, G.pressure - RELIEF_RATE * dt);
      if (G.pressure <= 4) { relieving = false; toast("Ahhhh. That's the spot. (The pants, sadly, stay as they are.)"); }
    } else {
      G.pressure = Math.min(FULL, G.pressure + pressureRate() * dt);
      if (G.pressure >= FULL) accident();
    }

    // camera-relative movement
    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    let mx = 0, mz = 0;
    if (!relieving) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    }
    const moving = mx !== 0 || mz !== 0;
    let sp = sprinting && moving ? SPRINT : SPEED;
    if (G.wet) sp *= 0.88; // wet pants are heavy and cold
    if (moving) {
      const len = Math.hypot(mx, mz);
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);   // cam forward
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);     // cam right
      const wx = (fx * -mz + rx * mx) / len;
      const wz = (fz * -mz + rz * mx) / len;
      vel.x += (wx * sp - vel.x) * Math.min(1, 12 * dt);
      vel.z += (wz * sp - vel.z) * Math.min(1, 12 * dt);
      walkPhase += dt * (sprinting ? 11 : 8.5);
    } else {
      vel.x *= Math.max(0, 1 - 14 * dt);
      vel.z *= Math.max(0, 1 - 14 * dt);
    }
    let nx = player.x + vel.x * dt, nz = player.z + vel.z * dt;
    [nx, nz] = collide(nx, nz, player.r);
    player.x = nx; player.z = nz;

    // freezer aisle: cold floor raises the stakes
    if (inRect(player.x, player.z, freezerZone)) {
      if (!inRect(player.x - vel.x * dt, player.z - vel.z * dt, freezerZone)) {
        if (!G.mods.includes(1.6)) { G.mods.push(1.6); toast('The freezer aisle. Cold floors. Your bladder is filing a complaint.'); }
      }
    } else {
      const i = G.mods.indexOf(1.6);
      if (i >= 0) { G.mods.splice(i, 1); toast('Warm again. The complaint is withdrawn.'); }
    }

    // quota loot
    for (const q of quads) {
      if (q.visible && Math.hypot(q.position.x - player.x, q.position.z - player.z) < 1.1) {
        q.visible = false;
        G.quota++; G.score += 10;
        toast(`Quota item secured. (${G.quota}/3)`);
        SFX.thump();
      }
    }

    // exit (unlocked by quota)
    if (Math.hypot(23 - player.x, 12 - player.z) < 1.6 && G.quota >= 3) {
      endRun(G.wet ? 'WET EXIT — you peed your pants and walked out anyway' : 'CLEAN EXIT — dry pants. Absolute legend.');
    }

    // interact: E edge-trigger (real keydown and harness Set both land in keys)
    const eNow = keys.has('KeyE');
    if (eNow && !eHeld && !relieving) {
      const n = nearest(interactables, player.x, player.z);
      if (n) n.on();
    }
    if (!eNow) relieving = false;
    else if (relieving && !nearest(interactables, player.x, player.z)) relieving = false;
    eHeld = eNow;

    // HUD refresh
    const st = stateIdx();
    barFill.style.width = `${G.pressure}%`;
    barFill.style.background = STATE_COLORS[st];
    stateLbl.textContent = `BLADDER: ${stateName()} ${Math.round(G.pressure)}%`;
    stateLbl.style.opacity = st === 3 && !G.wet ? String(0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 1000 * 8))) : '0.95';
    clockLbl.textContent = `CLOSING IN ${fmt(Math.max(0, G.closing))}`;
    clockLbl.style.color = G.closing < 60 ? '#e64433' : '#cfd3da';
    quotaLbl.textContent = `QUOTA ${G.quota}/3`;
    wetLbl.style.display = G.wet ? 'block' : 'none';
    const near = nearest(interactables, player.x, player.z);
    hintLbl.textContent = near ? `[E] ${near.hint()}` : '';

    // CRITICAL heartbeat + drips
    if (st === 3) {
      heartbeatT -= dt;
      if (heartbeatT <= 0) { SFX.thump(); heartbeatT = 0.42; }
      if (moving && !relieving) {
        dripT -= dt;
        if (dripT <= 0) { SFX.shhh(0.05, 0.05, 0.25); dripT = 0.45; }
      }
    }

    // hero animation — urgency rewrites the walk
    const urgency = THREE.MathUtils.clamp((G.pressure - 30) / 70, 0, 1);
    const sp2 = Math.hypot(vel.x, vel.z);
    const swing = THREE.MathUtils.clamp(sp2 / SPEED, 0, 1.3);
    for (let i = 0; i < 2; i++) {
      legs[i].rotation.x = Math.sin(walkPhase) * 0.55 * swing * (i ? -1 : 1);
      arms[i].rotation.x = -Math.sin(walkPhase) * 0.5 * swing * (i ? -1 : 1);
    }
    const t = performance.now() / 1000;
    hero.rotation.y = THREE.MathUtils.lerp(hero.rotation.y, Math.atan2(vel.x, vel.z), Math.min(1, 12 * dt));
    hero.position.lerp(new THREE.Vector3(player.x, 0, player.z), Math.min(1, 24 * dt));
    const hop = st === 3 && !relieving && moving ? Math.abs(Math.sin(t * 10)) * 0.045 : 0;
    hero.position.y = hop;
    hero.rotation.z = Math.sin(t * (4 + 8 * urgency)) * urgency * 0.22 * swing; // the waddle lean

    // camera tension: squeeze the lens, add the shakes
    const targetShake = st === 3 ? 0.05 : st === 2 ? 0.015 : 0;
    camShake += (targetShake - camShake) * Math.min(1, 1.5 * dt);
    const fovT = 68 - st * 1.5;
    camera.fov += (fovT - camera.fov) * Math.min(1, 3 * dt);
    camera.updateProjectionMatrix();
    jeansMat.color.lerp(G.wet ? wetJeans : dryJeans, Math.min(1, 4 * dt)); // visible wetness
  }

  // third-person orbit rig
  const d = CAM_DIST + stateIdx() * 0.12;
  const cp = Math.cos(camPitch);
  const back = d * cp;
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const jitter = (s: number) => (Math.random() - 0.5) * camShake * s;
  camera.position.set(
    hero.position.x - fx * back + jitter(1),
    hero.position.y + 1.55 + Math.sin(camPitch) * d + jitter(0.6),
    hero.position.z - fz * back + jitter(0.3),
  );
  camera.lookAt(hero.position.x, hero.position.y + 1.15, hero.position.z);

  renderer.render(scene, camera);
  requestAnimationFrame(step);
}
startRun();
requestAnimationFrame(step);
