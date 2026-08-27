// ============================= prisma-panic main.ts ============================
// Third-person supermarket roguelike: your bladder is the health bar.
// M3: TWO FLOORS — market hall + parking deck (the katos). Seed-random props,
// staff patrols on BOTH floors, slippery ice / oil / random leaks.
// Same seed = same store. Your getaway car waits on the deck.
import * as THREE from 'three';
import * as SFX from './audio';

// ---------- seeded rng (one seed per shift) ----------
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- global run state ----------
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
  floor: 1,            // 1 = market hall, 2 = parking deck
  floors: new Set<number>([1]),
  seed: 4271,
};
declare global { interface Window { __cap: any; __pp: any } }

// ---------- bladder state ----------
const FULL = 100;
const BASE_FILL = 1.2;
const RELIEF_RATE = 45;
const ACCIDENT_RECOVERY = 35;
const STATE_NAMES = ['FRESH', 'SQUEEZY', 'PRESSING', 'CRITICAL'];
// difficulty = shift number mod 5: Monday is a gentle warmup, Friday shifts are chaos
function shiftDifficulty(seed: number): number { return 1 + Math.floor(seed) % 5; }
function shiftName(seed: number): string { return ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'][shiftDifficulty(seed) - 1]; }
function stateIdx(): number { return G.floor === 2 ? (G.pressure < 40 ? 1 : G.pressure < 70 ? 2 : 3) : G.pressure < 40 ? 0 : G.pressure < 70 ? 1 : G.pressure < 90 ? 2 : 3; }
function stateName(): string { return STATE_NAMES[stateIdx()]; }
function pressureRate(): number {
  let r = BASE_FILL * (1 + 0.09 * (shiftDifficulty(G.seed) - 1)) + G.mods.reduce((a, b) => a + b, 0);
  if (G.wet) r *= 1.15;
  return r;
}
function addMod(v: number): void { if (!G.mods.includes(v)) G.mods.push(v); }
function delMod(v: number): void { const i = G.mods.indexOf(v); if (i >= 0) G.mods.splice(i, 1); }

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

// ---------- perks: quota items turn into weird power ----------
const PERKS: Record<string, { name: string; desc: string; apply: () => void }> = {
  diuretic: {
    name: 'DIURETIC',
    desc: 'Free coffee is now +6 instead of +12. Your kidneys respect the hustle.',
    apply: () => { perkCoffee = 6; toast('Perk: DIURETIC. The free coffee is almost a non-event.'); },
  },
  thick: {
    name: 'PRISMA DENIM',
    desc: 'Accidents recover to 25 instead of 35. The pants are load-bearing.',
    apply: () => { perkRecovery = 25; toast('Perk: PRISMA DENIM. The pants hold more than pride now.'); },
  },
  slippery: {
    name: 'WET-FLOOR WALTZ',
    desc: 'Sprint speed up. Ice is no longer a complaint — it\'s a lifestyle.',
    apply: () => { perkSprint = 0.75; toast('Perk: WET-FLOOR WALTZ. You commit to the slide.'); },
  },
  quiet: {
    name: 'QUIET SHOE SOLES',
    desc: 'Staff hear your squeaks from 7m instead of 11m. You are a ghost in a polo.',
    apply: () => { perkSqueak = 7; toast('Perk: QUIET SHOE SOLES. The squeak stays yours.'); },
  },
  bladder: {
    name: 'ELASTIC BLADDER',
    desc: 'Max pressure 110. You can now hold more than is healthy.',
    apply: () => { perkFull = 110; toast('Perk: ELASTIC BLADDER. The tank is bigger. The dread is bigger too.'); },
  },
};
const PERK_KEYS = Object.keys(PERKS);
let perkCoffee = 12, perkRecovery = 35, perkSprint = 0, perkSqueak = 11, perkFull = FULL;
const perksTaken: string[] = [];
let perkPicker: HTMLElement | null = null;
let perkPaused = false;
function showPerkPicker(): void {
  if (perkPicker) return;
  perkPaused = true;
  const wrap = document.createElement('div');
  wrap.className = 'picker';
  const title = document.createElement('div');
  title.className = 'ptitle';
  title.textContent = 'QUOTA SECURED — THE STORE OFFERS A "BENEFIT"';
  wrap.appendChild(title);
  const rng = mulberry32(G.seed * 7 + G.quota * 131);
  const shuffled = [...PERK_KEYS].sort(() => rng() - 0.5).slice(0, 3);
  for (const key of shuffled) {
    const p = PERKS[key];
    const btn = document.createElement('button');
    btn.className = 'popt';
    const n = document.createElement('span');
    n.className = 'pn';
    n.textContent = `${p.name}  —  `;
    const d = document.createElement('span');
    d.textContent = p.desc;
    btn.appendChild(n); btn.appendChild(d);
    btn.addEventListener('click', () => {
      p.apply();
      perksTaken.push(key);
      perkPicker?.remove();
      perkPicker = null;
      perkPaused = false;
      SFX.thump();
    });
    wrap.appendChild(btn);
  }
  hud.appendChild(wrap);
  perkPicker = wrap;
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

// ---------- lights (store lights live INSIDE the floor groups so swapping
// floors swaps the whole mood: bright hall vs floodlit deck) ----------
scene.add(new THREE.AmbientLight(0xe6ebf2, 0.55));
const hemi = new THREE.HemisphereLight(0xdfe6ee, 0x39404d, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff8ea, 1.6);
sun.position.set ? sun.position.set(-12, 18, -8) : sun.position.set(-12, 18, -8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ---------- collision (per floor) ----------
type Solid = { x: number; z: number; hx: number; hz: number };
const floorSolids: Solid[][] = [[], []];
const addBox = (f: number, x: number, z: number, hx: number, hz: number) => floorSolids[f - 1].push({ x, z, hx, hz });
type CamSolid = { x: number; z: number; hx: number; hz: number; y0: number; y1: number };
const floorCamSolids: CamSolid[][] = [[], []];
const addCamSolid = (f: number, x: number, z: number, hx: number, hz: number, y0 = 0, y1 = 3.4) =>
  floorCamSolids[f - 1].push({ x, z, hx, hz, y0, y1 });

function collide(x: number, z: number, r: number, floor = G.floor): [number, number] {
  for (const b of floorSolids[floor - 1]) {
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

// ---------- slippery zones (per floor) ----------
function inRect(x: number, z: number, r: { x: number; z: number; hx: number; hz: number }): boolean {
  return Math.abs(x - r.x) < r.hx && Math.abs(z - r.z) < r.hz;
}
type Rect = { x: number; z: number; hx: number; hz: number };
const iceRects: Rect[][] = [[], []];       // rect slippery zones (frozen lakes)
const spillZones: { x: number; z: number; r: number }[][] = [[], []]; // circular wet/oil patches

// the frozen lake stays put (it's sacred); seeded extra patches move around
const LAKE1: Rect = { x: 10, z: 11, hx: 5, hz: 4 };

// world floors — the camera's floor oracle, so it can NEVER dip under
function floorY(x: number, z: number): number {
  if (G.floor === 1) {
    if (x < -16.5 && z < -11) return 0.04;                       // bathroom vinyl
    for (const iz of iceRects[0]) if (inRect(x, z, iz)) return 0.011;
    if (x > 23.2 || x < -23.4 || z > 18.2 || z < -18.2) return 0.8; // outside slab
  } else {
    for (const s of spillZones[1]) if (Math.hypot(x - s.x, z - s.z) < s.r) return 0.011;
  }
  return 0;
}

// ---------- camera rig (true orbit, colliding, per floor) ----------
const camRig = { pitch: -0.24, dist: 4.4 };
function camRayClear(hx: number, hy: number, hz: number, cx: number, cy: number, cz: number): boolean {
  const STEPS = 10;
  const solids = floorCamSolids[G.floor - 1];
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = hx + (cx - hx) * t, y = hy + (cy - hy) * t, z = hz + (cz - hz) * t;
    if (y < floorY(x, z) + 0.22) return false; // ray dips under floor — blocked
    for (const s of solids) {
      if (Math.abs(x - s.x) < s.hx && Math.abs(z - s.z) < s.hz && y > s.y0 && y < s.y1) return false;
    }
  }
  return true;
}

// ---------- floors live in their own groups (only one visible at a time) ----------
const store1 = new THREE.Group(); // market hall
const store2 = new THREE.Group(); // parking deck
const staffScene = new THREE.Group(); // staff + torches, rebuilt every seed
scene.add(store1, store2, staffScene);
const carPos = { x: -16, z: -13 }; // your getaway car slot (seeded in buildDeck)
const mat = (c: number, rough = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
function box(g: THREE.Group, f: number, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, solid = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  if (solid) { addBox(f, x, z, w / 2, d / 2); addCamSolid(f, x, z, w / 2, d / 2, 0, Math.max(0.61, y + h / 2)); }
  return mesh;
}
function disposeGroup(g: THREE.Group): void {
  g.traverse((o: any) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => m.dispose());
  });
  g.clear();
}

// ---------- toilets ----------
const toiletMat = new THREE.MeshStandardMaterial({ color: 0xeef0e8, roughness: 0.35, metalness: 0.05 });
function makeToilet(g: THREE.Group, x: number, z: number, yaw: number, glowColor: number): void {
  const t = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), toiletMat);
  bowl.scale.set(1, 0.55, 1.25); bowl.position.y = 0.42; bowl.castShadow = true;
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.1, 16), toiletMat);
  seat.position.y = 0.68;
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.2), toiletMat);
  tank.position.set(0, 0.85, -0.36); tank.castShadow = true;
  t.add(bowl, seat, tank);
  t.position.set(x, 0, z);
  t.rotation.y = yaw;
  g.add(t);
  const glow = new THREE.PointLight(glowColor, 6, 6, 1.6);
  glow.position.set(0, 1.7, 0);
  t.add(glow);
}

// ---------- THE MARKET HALL (floor 1) ----------
function buildHall(seed: number): void {
  const rng = mulberry32(seed);
  disposeGroup(store1);
  iceRects[0].length = 0; spillZones[0].length = 0;
  floorSolids[0].length = 0; floorCamSolids[0].length = 0;
  const g = store1;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 36), mat(0xc8c3b8, 0.95));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);
  // perimeter walls + east doorway (no exit: the deck is where you flee)
  box(g, 1, 46, 3.2, 0.4, 0, 1.6, -18, mat(0x8d95a1));
  box(g, 1, 46, 3.2, 0.4, 0, 1.6, 18, mat(0x8d95a1));
  box(g, 1, 0.4, 3.2, 36, -23, 1.6, 0, mat(0x8d95a1));
  box(g, 1, 0.4, 3.2, 28.8, 23, 1.6, -3.6, mat(0x8d95a1));
  box(g, 1, 0.4, 3.2, 4.8, 23, 1.6, 15.6, mat(0x8d95a1));
  // bathroom corner walls (NW)
  box(g, 1, 0.4, 3.2, 4.5, -16.5, 1.6, -15.75, mat(0x7f9aa3));
  box(g, 1, 0.4, 3.2, 1.0, -16.5, 1.6, -11.5, mat(0x7f9aa3));
  box(g, 1, 6.5, 3.2, 0.4, -19.75, 1.6, -11, mat(0x7f9aa3));
  // EAST DOORWAY = the ramp up to the parking deck. Two frames + arch sign.
  const frameMat = mat(0x3a4451, 0.6);
  box(g, 1, 0.3, 2.6, 0.5, 22.6, 1.3, 10.9, frameMat);
  box(g, 1, 0.3, 2.6, 0.5, 22.6, 1.3, 13.3, frameMat);
  const arch = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.12), new THREE.MeshStandardMaterial({ color: 0x2fbf5f, emissive: 0x19d34c, emissiveIntensity: 1.1, roughness: 0.5 }));
  arch.position.set(23.2, 2.7, 12.1);
  g.add(arch);
  // ceiling + strips (flicker events dim these)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(46, 36), mat(0x23262e, 0.99));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 3.4;
  g.add(ceil);
  const stripMat = new THREE.MeshStandardMaterial({ color: 0xf2f6ff, emissive: 0xdfeaff, emissiveIntensity: 1.7, roughness: 0.4 });
  for (const sx of [-15, -5, 5, 15]) for (const sz of [-10, 0, 10]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 5), stripMat);
    s.position.set(sx, 3.26, sz);
    g.add(s);
  }
  for (const [px, pz] of [[-12, 0], [12, 4]] as const) {
    const pl = new THREE.PointLight(0xeef4ff, 22, 24, 1.8);
    pl.position.set(px, 3, pz);
    g.add(pl);
  }

  // shelf rows — seeded jitter per run: lanes shift, lengths vary, widths don't
  const shelfMat = mat(0xb6b3ae);
  const merchColors = [0xcc4433, 0xe68c26, 0xf2dd4d, 0x66b34d, 0x33999e, 0xbf5999, 0x805936, 0xdadcde];
  function shelfRow(x: number, z: number, along: 'x' | 'z', len: number): void {
    const w = along === 'z' ? 1 : len, d = along === 'z' ? len : 1;
    box(g, 1, w, 2, d, x, 1, z, shelfMat);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const n = Math.floor(len / 1.2);
    for (let i = 0; i < n; i++) {
      for (const level of [0.55, 1.1, 1.65]) {
        for (const side of [-1, 1]) {
          const s = 0.25 + ((i * 7919 + Math.floor(seed)) % 997) / 997 * 0.15;
          const m2 = new THREE.Mesh(geo, mat(merchColors[(i * 7 + Math.floor(level * 13)) % merchColors.length]));
          m2.scale.set(s, s * 1.2, s * 0.8);
          const t = -len / 2 + 0.8 + i * 1.2;
          const off = side * 0.53;
          m2.position.set(x + (along === 'z' ? off : t), level + s * 0.6, z + (along === 'z' ? t : off));
          m2.castShadow = true;
          g.add(m2);
        }
      }
    }
  }
  shelfRow(-10 + (rng() - 0.5) * 1.2, -6 + (rng() - 0.5) * 2, 'z', 12 + rng() * 4);
  shelfRow(-3 + (rng() - 0.5) * 1.2, -6 + (rng() - 0.5) * 2, 'z', 12 + rng() * 4);
  shelfRow(4 + (rng() - 0.5) * 1.2, -6 + (rng() - 0.5) * 2, 'z', 12 + rng() * 4);
  shelfRow(8, 4 + (rng() - 0.5) * 2, 'x', 10 + rng() * 4);

  // frozen lake (always) + seeded second patch somewhere in the south aisles
  iceRects[0].push({ ...LAKE1 });
  if (rng() < 0.7) {
    const px = -14 + rng() * 12, pz = -8 + rng() * 6;
    iceRects[0].push({ x: px, z: pz, hx: 1.6, hz: 1.6 });
  }
  { // lake slabs
    const lake = new THREE.Mesh(
      new THREE.PlaneGeometry(LAKE1.hx * 2, LAKE1.hz * 2),
      new THREE.MeshStandardMaterial({ color: 0xaee0f5, roughness: 0.28, metalness: 0.12, transparent: true, opacity: 0.9 }),
    );
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(LAKE1.x, 0.011, LAKE1.z);
    g.add(lake);
    const lakeLight = new THREE.PointLight(0x9fd8ff, 14, 12, 1.7);
    lakeLight.position.set(LAKE1.x, 2.6, LAKE1.z);
    g.add(lakeLight);
    for (const ir of iceRects[0]) addCamSolid(1, ir.x, ir.z, ir.hx, ir.hz, -1, 0.011);
    for (let i = 0; i < 3; i++) {
      const chest = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.1), mat(0xeaf3fa, 0.35));
      chest.position.set(7 + i * 3, 0.45, 11);
      chest.castShadow = true;
      g.add(chest);
      addBox(1, 7 + i * 3, 11, 1.1, 0.55);
    }
  }

  // toilets — the NW one is legal, the staff one in the break room is not
  makeToilet(g, -22, -14.5, Math.PI / 2, 0x66ff99);
  addBox(1, -22, -14.5, 0.45, 0.45);
  makeToilet(g, 20.2, 16.2, -Math.PI / 2, 0xff5577);
  // break-room walls (SE): the gap at x≈14.9 is your sprint heroics
  box(g, 1, 0.4, 3.2, 3.0, 14.6, 1.6, 12.9, mat(0x6f5c46));
  box(g, 1, 0.4, 3.2, 1.2, 14.6, 1.6, 16.1, mat(0x6f5c46));
  box(g, 1, 7.6, 3.2, 0.4, 18.2, 1.6, 12.4, mat(0x6f5c46));
  const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.7), mat(0xd8dde2, 0.5));
  fridge.position.set(21.6, 0.85, 13.4); fridge.castShadow = true;
  g.add(fridge); addBox(1, 21.6, 13.4, 0.5, 0.4);

  // coffee stand (sacred, fixed) — seeded quad spots only
  {
    const coffee = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.8), new THREE.MeshStandardMaterial({ color: 0xb8452f, roughness: 0.6 }));
    counter.position.y = 0.55; counter.castShadow = true;
    const cupM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.16, 10), mat(0xf2f2ea, 0.6));
    cupM.position.set(0.25, 1.16, 0);
    coffee.add(counter, cupM);
    coffee.position.set(10, 0, -10);
    g.add(coffee);
  }
  // seeded quota spots on this floor: choose 2-3 from a safe pool (never in lanes)
  const quadPool: [number, number][] = [[-16.2, -13], [-6, 14], [14, 14.5], [20.4, 13], [-2, 6]];
  const qn = 2 + (rng() < 0.5 ? 1 : 0);
  const qs: [number, number][] = [];
  const usedQuadSpots: [number, number][] = [];
  for (let i = 0; i < quadPool.length && qs.length < qn; i++) {
    const pick = Math.floor(rng() * quadPool.length);
    const s = quadPool[pick];
    if (!usedQuadSpots.some(([a, b]) => Math.hypot(a - s[0], b - s[1]) < 3)) { usedQuadSpots.push(s); qs.push(s); }
  }
  seedQuads.push(...qs.map(([x, z]) => ({ f: 1, x, z })));
}

// ---------- THE PARKING DECK (floor 2): dark, slippery, your car waits ----------
function buildDeck(seed: number): void {
  const rng = mulberry32(seed * 7 + 13);
  disposeGroup(store2);
  iceRects[1].length = 0; spillZones[1].length = 0;
  floorSolids[1].length = 0; floorCamSolids[1].length = 0;
  const g = store2;

  const deck = new THREE.Mesh(new THREE.PlaneGeometry(46, 36), mat(0x2c2f36, 0.98));
  deck.rotation.x = -Math.PI / 2;
  deck.receiveShadow = true;
  g.add(deck);
  // doorway back to the hall: NO solid near it — the ramp-down trigger circle
  // sits in open deck so you never slam into an invisible wall at speed.
  // guard-house pocket, far NW corner: two wall slabs, toilet tucked inside —
  // reachable, but deck staff patrol right past the gap. That's the deal.
  box(g, 2, 0.4, 2.2, 3.2, -17.4, 1.1, -15.6, mat(0x4b3a2c));
  box(g, 2, 3.4, 2.2, 0.4, -15.5, 1.1, -11.6, mat(0x4b3a2c));
  makeToilet(g, -16.9, -13.2, Math.PI / 2, 0x66ff99);
  // floodlight poles
  for (const [px, pz] of [[-14, -6], [0, -8], [14, -4], [6, 8]] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5, 8), mat(0x5a6068, 0.6));
    pole.position.set(px, 2.5, pz);
    g.add(pole);
    const fl = new THREE.PointLight(0xfff3d6, 26, 26, 1.9);
    fl.position.set(px, 4.8, pz);
    g.add(fl);
  }
  // seeded cars in slots; two slots hold quota loot. Cars block camera + runner.
  const cols = [-16.5, -11.5, -6.5, -1.5, 3.5, 8.5, 13.5];
  const rows = [-13, -6, 1];
  const carMats = [0x8a1f1f, 0x24333f, 0x6a6e73, 0x1b2d4a, 0x3e4a35, 0x5c4a2e].map((c) => mat(c, 0.5));
  let cars = 0;
  const slots: [number, number][] = [];
  for (const cx of cols) for (const cz of rows) slots.push([cx, cz]);
  // your car picks its slot FIRST — nobody parallel parks on top of the blue one
  const carSlot = slots[Math.floor(rng() * slots.length)];
  carPos.x = carSlot[0]; carPos.z = carSlot[1] + (rng() < 0.4 ? 3 : -3);
  for (const [cx, cz] of slots) {
    if (Math.hypot(cx - carPos.x, cz - carPos.z) < 3.2) continue;
    if (rng() < 0.5 && cars < 12) {
      cars++;
      const car = new THREE.Group();
      const m = carMats[Math.floor(rng() * carMats.length)];
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.3), m);
      body.position.y = 0.55; body.castShadow = true;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 2.2), mat(0x11141a, 0.35));
      cab.position.set(0, 1.18, -0.1); cab.castShadow = true;
      car.add(body, cab);
      car.position.set(cx, 0, cz);
      g.add(car);
      addBox(2, cx, cz, 1.1, 2.3);
      addCamSolid(2, cx, cz, 1.1, 2.3, 0, 1.6);
    }
  }
  // YOUR car: blue, always there, trunk full of shame
  {
    const hero2 = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.72, 4.4), mat(0x2e5fa3, 0.4));
    body.position.y = 0.56; body.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.58, 2.3), mat(0x11141a, 0.35));
    cab.position.set(0, 1.2, -0.1); cab.castShadow = true;
    const beacon = new THREE.PointLight(0x53d4ff, 10, 9, 1.6);
    beacon.position.set(0, 2, 0);
    hero2.add(body, cab, beacon);
    hero2.position.set(carPos.x, 0, carPos.z);
    g.add(hero2);
    addBox(2, carPos.x, carPos.z, 1.1, 2.3);
    addCamSolid(2, carPos.x, carPos.z, 1.1, 2.3, 0, 1.6);
  }
  // seeded oil sheens (slippery) — the deck is a wet-floor sign that gave up
  for (let i = 0; i < 4; i++) {
    const ox = -20 + rng() * 40, oz = -15 + rng() * 30;
    if (Math.hypot(ox - carPos.x, oz - carPos.z) < 3) continue;
    spillZones[1].push({ x: ox, z: oz, r: 1.3 });
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1.3, 22), new THREE.MeshStandardMaterial({ color: 0x1c2530, roughness: 0.15, metalness: 0.7, transparent: true, opacity: 0.85 }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(ox, 0.011, oz);
    g.add(sh);
  }
  // seeded deck quads (2 slots): the trunk has room but it wants a FULL cart
  const dq: [number, number][] = [];
  for (let i = 0; i < 2; i++) {
    const s = slots[Math.floor(rng() * slots.length)];
    dq.push([s[0], s[1] + (rng() < 0.5 ? 3 : -3)]);
  }
  for (const [dx, dz] of dq) seedQuads.push({ f: 2, x: dx, z: Math.max(-15.5, Math.min(15.5, dz)) });
}

// ---------- the hero ----------
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
mk(new THREE.SphereGeometry(0.09, 10, 8), skinMat, 0.16, 1.38, 0.14, hero);
mk(new THREE.SphereGeometry(0.09, 10, 8), skinMat, -0.16, 1.38, 0.14, hero);
const legs: THREE.Object3D[] = [], arms: THREE.Object3D[] = [];
for (const s of [-1, 1]) {
  const leg = new THREE.Group(); leg.position.set(leg.position.x, leg.position.y, leg.position.z); leg.position.set(s * 0.14, 0.7, 0); hero.add(leg);
  mk(new THREE.CylinderGeometry(0.14, 0.14, 0.68, 10), jeansMat, 0, -0.34, 0, leg);
  mk(new THREE.BoxGeometry(0.2, 0.1, 0.34), blackMat, 0, -0.66, 0.06, leg);
  legs.push(leg);
  const arm = new THREE.Group(); arm.position.set(s * 0.42, 1.5, 0); hero.add(arm);
  mk(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 10), blackMat, 0, -0.24, 0, arm);
  arms.push(arm);
}
hero.position.set(-18, 0, 12);
scene.add(hero);

// ---------- STAFF (both floors) ----------
type Staff = {
  obj: THREE.Group; torch?: THREE.SpotLight; legs: THREE.Object3D[];
  x: number; z: number; yaw: number; floor: number;
  state: 'patrol' | 'alert' | 'chase' | 'return';
  wp: [number, number][]; wpIdx: number;
  speed: number; t: number; phase: number; lastSqueak: number;
};
const staffMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.85 });
const visorMat = new THREE.MeshStandardMaterial({ color: 0xf2c40e, roughness: 0.6 });
function makeStaff(floor: number, x: number, z: number, wp: [number, number][], torch = false): Staff {
  const g = new THREE.Group();
  mk(new THREE.CylinderGeometry(0.3, 0.3, 0.64, 12), staffMat, 0, 1.26, 0, g);
  mk(new THREE.SphereGeometry(0.17, 12, 10), skinMat, 0, 1.8, 0, g);
  mk(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 12), visorMat, 0, 1.98, 0, g);
  const st: Staff = {
    obj: g, legs: [], x, z, yaw: 0, floor,
    state: 'patrol', wp, wpIdx: 0, speed: 2.6, t: 0, phase: Math.random() * 6, lastSqueak: 0,
  };
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.14, 0.7, 0); g.add(leg);
    mk(new THREE.CylinderGeometry(0.13, 0.13, 0.66, 10), staffMat, 0, -0.33, 0, leg);
    mk(new THREE.BoxGeometry(0.2, 0.1, 0.34), blackMat, 0, -0.66, 0.06, leg);
    st.legs.push(leg);
  }
  if (torch) {
    const sp = new THREE.SpotLight(0xfff1c4, 60, 14, 0.62, 0.5, 1.4);
    sp.position.set(0, 1.7, 0);
    const tgt = new THREE.Object3D(); tgt.position.set(0, 1.2, -6);
    g.add(sp, tgt);
    sp.target = tgt;
    st.torch = sp;
  }
  g.position.set(x, 0, z);
  staffScene.add(g);
  return st;
}
function deckPatrolAnchors(seed: number): [number, number][] {
  const rng = mulberry32(seed * 31 + 7);
  // driving aisles only (cars park at slot centers; aisles run between rows)
  const pool: [number, number][] = [];
  for (const x of [-14, -9, -4, 1, 6, 11, 16]) for (const z of [-9.5, -2.5, 4.5]) pool.push([x, z]);
  const out: [number, number][] = [[21, -13]];
  for (let i = 0; i < 7; i++) out.push(pool[Math.floor(rng() * pool.length)]);
  return out;
}
let staff: Staff[] = [];
const staffSeen = (s: Staff): boolean => {
  const dx = hero.position.x - s.x, dz = hero.position.z - s.z;
  const d = Math.hypot(dx, dz);
  const range = s.floor === 2 ? 11 : 13;
  if (d > range) return false;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const dot = (dx * fx + dz * fz) / Math.max(0.001, d);
  return dot > Math.cos(s.floor === 2 ? 0.87 : 1.13); // torch beam is narrower
};
function spooked(s: Staff, why: string): void {
  if (s.state !== 'chase') {
    s.state = 'chase';
    s.t = 4.2;
    toast(`Staff: "${why}"`);
    SFX.alarm();
  }
}
function staffHear(s: Staff, x: number, z: number, why: string): void {
  if (s.state === 'patrol') {
    s.state = 'alert';
    s.t = 5;
    s.wpIdx = s.wp.length;
    toast(`Staff: "${why}"`);
  }
}

// ---------- run state ----------
const player = { x: -18, z: 12, r: 0.36 };
const vel = { x: 0, z: 0 };
let camYaw = -Math.PI / 2, camShake = 0;
let walkPhase = 0, relieving = false, heartbeatT = 0, dripT = 0, squeakT = 0, eHeld = false;
let clock = 240 + Math.random() * 120;
const keys = new Set<string>();
const SPEED = 4.6, SPRINT = 7.4;
const seedQuads: { f: number; x: number; z: number }[] = [];
const quadMeshes: { x: number; z: number; f: number; mesh: THREE.Mesh }[] = [];

// ---------- atmosphere ----------
function applyAtmos(floor: number): void {
  if (floor === 1) {
    scene.background = new THREE.Color(0x11131a);
    (scene.fog as THREE.Fog).color.set(0x11131a);
    (scene.fog as THREE.Fog).near = 18; (scene.fog as THREE.Fog).far = 60;
    hemi.intensity = 0.55; sun.intensity = 1.6;
    sun.color.set(0xfff8ea);
    store1.visible = true; store2.visible = false;
  } else {
    scene.background = new THREE.Color(0x0b0d12);
    (scene.fog as THREE.Fog).color.set(0x0b0d12);
    (scene.fog as THREE.Fog).near = 12; (scene.fog as THREE.Fog).far = 46;
    hemi.intensity = 0.16; sun.intensity = 0.3;
    sun.color.set(0xbfd2ff);
    store1.visible = false; store2.visible = true;
  }
}

// ---------- interact registry (per floor) ----------
type Inter = { x: number; z: number; r: number; floor: number; hint: () => string; on: () => void };
const interactables: Inter[] = [];
function nearest(list: Inter[], x: number, z: number): Inter | null {
  let best: Inter | null = null, bd = 2.1;
  for (const it of list) {
    if (it.floor !== G.floor) continue;
    const d = Math.hypot(it.x - x, it.z - z);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

// ---------- FLOOR TRANSITION ----------
const HALL_DOOR = { x: 23.2, z: 12.1, r: 1.5 };   // on hall side
const DECK_DOOR = { x: 21.2, z: -13.9, r: 1.5 };  // on deck side
let swapCd = 0;
function swapFloor(to: number): void {
  G.floor = to;
  G.floors.add(to);
  swapCd = 1.4;
  if (to === 2) {
    player.x = 21.2; player.z = -13.9;
    toast('K-PARKKI P2. Dark. Slippery. Your car is somewhere out there.');
  } else {
    player.x = 21.2; player.z = 12.1;
    toast('Back inside. The hallway lights judge you.');
  }
  applyAtmos(to);
}

function buildSeedLayout(seed: number): void {
  seedQuads.length = 0;
  quadMeshes.length = 0;
  buildHall(seed);
  buildDeck(seed);
  // place seeded quads as glowing pickups
  for (const q of seedQuads) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshStandardMaterial({ color: 0xe67a14, emissive: 0xff6a00, emissiveIntensity: 1.1, roughness: 0.4 }));
    m.position.set(q.x, 0.55, q.z);
    m.castShadow = true;
    (q.f === 1 ? store1 : store2).add(m);
    quadMeshes.push({ x: q.x, z: q.z, f: q.f, mesh: m });
  }
  // staff per seed: wipe old crew (meshes + torches) before spawning the new one
  while (staffScene.children.length > 0) staffScene.remove(staffScene.children[0]);
  staff = [
    makeStaff(1, 17.5, 15.2, [[17.5, 15.2], [12, 15.5], [4, 15.8], [-8, 15.5], [-18, 14], [-18, 4], [-10, 2], [2, 2], [12, 2], [17.5, 15.2]]),
    makeStaff(1, 2, -14, [[2, -14], [-14, -14], [-14, -2], [2, -2], [2, 6], [14, 8], [14, -2], [2, -14]]),
  ];
  const rng = mulberry32(seed * 131 + 5);
  const nDeck = rng() < 0.55 ? 2 : 1;
  for (let i = 0; i < nDeck; i++) {
    staff.push(makeStaff(2, 21, -13.9, deckPatrolAnchors(seed + i), true));
  }
  for (const s of staff) s.obj.userData.staff = true;
  for (const s of staff) s.obj.traverse((o: any) => { o.userData.staff = true; });
}

// ---------- seed helpers ----------
function buildInteractables(): void {
  interactables.length = 0;
  interactables.push(
    { x: -22, z: -14.5, r: 2.1, floor: 1, hint: () => 'Use the toilet', on: () => { relieving = true; } },
    { x: 20.2, z: 16.2, r: 2.0, floor: 1, hint: () => 'Use the STAFF toilet (legally risky)', on: () => {
        relieving = true;
        for (const s of staff) if (s.floor === 1 && Math.hypot(hero.position.x - s.x, hero.position.z - s.z) < 13) spooked(s, 'THIEF! THIEF!');
      } },
    { x: 10, z: -10, r: 1.9, floor: 1, hint: () => (G.coffeeCd <= 0 ? 'Grab free coffee' : 'Coffee stand (out of samples)'), on: () => {
        if (G.coffeeCd > 0) { toast('"One at a time, dear," says the lady.'); return; }
        G.coffeeCd = 30;
        G.pressure = Math.min(perkFull, G.pressure + perkCoffee);
        G.mods.push(0.35);
        toast('Free espresso. Tastes like victory. (Your bladder notes this.)');
      } },
    { x: -16.9, z: -13.2, r: 2.0, floor: 2, hint: () => 'Use the STAFF toilet (legally risky)', on: () => {
        relieving = true;
        for (const s of staff) if (s.floor === 2 && Math.hypot(hero.position.x - s.x, hero.position.z - s.z) < 11) spooked(s, 'Halt! Katos area is staff only!');
      } },
  );
}

function startRun(seed?: number): void {
  G.mode = 'play';
  G.seed = seed ?? Math.floor(Math.random() * 1e9);
  G.floor = 1;
  G.floors = new Set([1]);
  G.pressure = 10; G.wet = false; G.runTime = 0; G.closing = 240 + Math.random() * 120;
  G.quota = 0; G.accidents = 0; G.score = 0; G.coffeeCd = 0;
  G.mods = []; G.toasts = []; G.ending = '';
  perkCoffee = 12; perkRecovery = 35; perkSprint = 0; perkSqueak = 11; perkFull = FULL;
  perksTaken.length = 0;
  perkPicker?.remove(); perkPicker = null; perkPaused = false;
  player.x = -18; player.z = 12; vel.x = 0; vel.z = 0;
  relieving = false;
  // wipe last run's leftovers: puddles, flicker, event clock
  for (const p of puddles) { p.parent?.remove(p); p.geometry.dispose(); (p.material as THREE.Material).dispose(); }
  puddles.length = 0;
  spillZones[0].length = 0; spillZones[1].length = 0;
  flickerOn = false; flickerT = 0;
  eventTimer = 24 + Math.random() * 16;
  buildSeedLayout(G.seed);
  buildInteractables();
  applyAtmos(1);
  toast(`Shift #${G.seed} (${shiftName(G.seed)} shift, difficulty ${shiftDifficulty(G.seed)}/5) — quota first, then the deck.`);
  sumLbl.style.display = 'none';
  wetLbl.style.display = 'none';
  alertLbl.style.display = 'none';
  SFX.humStart();
}
function accident(caught = false): void {
  if (caught) return;
  G.wet = true;
  G.pressure = perkRecovery;
  G.accidents++;
  toast("...SPLASH. You heard that, didn't you?");
  SFX.splash(); SFX.plop();
  camShake = 0.14;
  for (const s of staff) {
    if (s.floor !== G.floor) continue;
    const d = Math.hypot(hero.position.x - s.x, hero.position.z - s.z);
    if (d < 9) staffHear(s, hero.position.x, hero.position.z, '...was that a PEEING?');
  }
}
function endRun(ending: string): void {
  if (G.mode !== 'play') return;
  G.mode = 'end';
  G.ending = ending;
  SFX.humStop();
  const bonus = ending.startsWith('CLEAN') ? 50 : ending.startsWith('WET') ? 25 : ending.startsWith('CAUGHT') ? 15 : 10;
  G.score += bonus;
  const diff = shiftDifficulty(G.seed);
  G.score += (diff - 1) * 12;
  let rank = 'D';
  if (G.score >= 110) rank = 'S'; else if (G.score >= 90) rank = 'A'; else if (G.score >= 70) rank = 'B'; else if (G.score >= 50) rank = 'C';
  sumLbl.textContent =
    `RUN COMPLETE — seed #${G.seed} (${shiftName(G.seed)}, difficulty ${diff}/5)\n\n${ending}\n\nShift time ${fmt(G.runTime)} · Quota ${G.quota}/3 · Accidents ${G.accidents} · Floors ${G.floors.size}/2\nSCORE ${G.score} — RANK ${rank}\n\n[ press R to run it back — new seed, new store ]`;
  sumLbl.style.display = 'block';
}

// ---------- staff AI ----------
function staffStep(s: Staff, dt: number): void {
  if (s.floor !== G.floor) return;
  const heroD = Math.hypot(hero.position.x - s.x, hero.position.z - s.z);
  const heardSqueak = isSlippery(player.x, player.z) && Math.hypot(vel.x, vel.z) > 5.5 &&
    performance.now() - s.lastSqueak > 2500;
  if (heardSqueak) s.lastSqueak = performance.now();
  if (s.state === 'patrol') {
    if (heroD < 7 && staffSeen(s) && (G.wet || Math.hypot(vel.x, vel.z) > 5)) {
      spooked(s, G.wet ? 'SECURITY! WE HAVE A CODE PEED!' : 'Why is this man SPRINTING?');
    } else if (G.wet && heroD < 4.5) {
      spooked(s, 'SECURITY! WE HAVE A CODE PEED!');
    } else if (heardSqueak && heroD < perkSqueak) {
      staffHear(s, player.x, player.z, s.floor === 2 ? '...squeak... on my deck...' : '...squeak squeak squeak...');
    }
  } else if (s.state === 'alert') {
    s.t -= dt;
    if (s.t <= 0) s.state = 'patrol';
  } else if (s.state === 'chase') {
    s.t -= dt;
    if (s.t <= 0) s.state = 'alert';
    if (heroD < 1.15 && G.mode === 'play') {
      SFX.alarm();
      endRun('CAUGHT — staff arms themself with body glue and wet-floor signs');
    }
  }
  let tx = s.x, tz = s.z;
  if (s.state === 'chase') { tx = hero.position.x; tz = hero.position.z; }
  else if (s.state === 'alert') { tx = player.x; tz = player.z; }
  else if (s.state === 'patrol') {
    const wp = s.wp[s.wpIdx % s.wp.length];
    tx = wp[0]; tz = wp[1];
    if (Math.hypot(tx - s.x, tz - s.z) < 1.2) s.wpIdx++;
  }
  const dx = tx - s.x, dz = tz - s.z;
  const d = Math.hypot(dx, dz);
  const spd = s.state === 'chase' ? 5.2 : s.state === 'alert' ? 3.6 : 2.6;
  if (d > 0.15) {
    const nx = s.x + (dx / d) * spd * dt, nz = s.z + (dz / d) * spd * dt;
    s.x = nx; s.z = nz;
    s.yaw = THREE.MathUtils.lerp(s.yaw, Math.atan2(dx, dz), Math.min(1, 10 * dt));
    s.phase += dt * spd * 1.7;
    s.obj.position.set(s.x, 0, s.z);
    s.obj.rotation.y = s.yaw;
    const swing = Math.min(1.2, spd / 4.6);
    for (let i = 0; i < 2; i++) s.legs[i].rotation.x = Math.sin(s.phase + i * Math.PI) * 0.5 * swing;
  }
}

// ---------- random mess (events) ----------
const puddles: THREE.Mesh[] = [];
function spawnPuddle(x: number, z: number): void {
  const m = new THREE.MeshStandardMaterial({ color: 0x7fd4ff, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.75 });
  const geo = G.floor === 2 ? new THREE.CircleGeometry(1.3, 22) : new THREE.PlaneGeometry(2.6, 2.6);
  const p = new THREE.Mesh(geo, m);
  p.rotation.x = -Math.PI / 2;
  p.position.set(x, G.floor === 2 ? 0.011 : 0.012, z);
  (G.floor === 2 ? store2 : store1).add(p);
  spillZones[G.floor - 1].push({ x, z, r: 1.3 });
  puddles.push(p);
}
function isIce(x: number, z: number): boolean {
  for (const iz of iceRects[G.floor - 1]) if (inRect(x, z, iz)) return true;
  return false;
}
function isSlippery(x: number, z: number): boolean {
  if (isIce(x, z)) return true;
  for (const s of spillZones[G.floor - 1]) if (Math.hypot(x - s.x, z - s.z) < s.r) return true;
  return false;
}
let flickerT = 0, flickerOn = false;
let eventTimer = 24 + Math.random() * 16;

// ---------- debug hooks ----------
window.__cap = {
  state: () => ({
    mode: G.mode, pressure: +G.pressure.toFixed(1), wet: G.wet, state: stateName(),
    x: +player.x.toFixed(2), z: +player.z.toFixed(2),
    yaw: +camYaw.toFixed(2), pitch: +camRig.pitch.toFixed(2),
    speed: +Math.hypot(vel.x, vel.z).toFixed(2),
    fov: +camera.fov.toFixed(1), shake: +camShake.toFixed(3),
    camY: +camera.position.y.toFixed(2), camClear: !camRayClear(hero.position.x, hero.position.y + 1.5, hero.position.z, camera.position.x, camera.position.y, camera.position.z),
    quota: G.quota, closing: Math.max(0, Math.round(G.closing)),
    accidents: G.accidents, score: G.score, relieving,
    floor: G.floor, seed: G.seed,
    difficulty: shiftDifficulty(G.seed), shiftName: shiftName(G.seed),
    perkPickerOpen: perkPicker !== null,
    perks: [...perksTaken],
    runTime: +G.runTime.toFixed(1),
    inFreezer: isIce(player.x, player.z),
    slippery: isSlippery(player.x, player.z),
    staff: staff.filter((s) => s.floor === G.floor).map((s) => ({ s: s.state, d: +Math.hypot(hero.position.x - s.x, hero.position.z - s.z).toFixed(1) })),
    toasts: [...G.toasts], ending: G.ending,
    summary: (document.querySelector('.summary') as HTMLElement)?.textContent || '',
  }),
  keys: (k: string, down: boolean) => { if (down) keys.add(k); else keys.delete(k); },
  walk: (down: boolean) => { if (down) keys.add('KeyW'); else keys.delete('KeyW'); },
  teleport: (x: number, z: number) => { player.x = x; player.z = z; vel.x = 0; vel.z = 0; },
  yaw: (y: number, p?: number) => { camYaw = y; if (p !== undefined) camRig.pitch = p; },
  restart: (seed?: number) => startRun(seed),
  seed: (s?: number) => ({ seed: G.seed, rebuild: () => startRun(s) }),
  floor: (n: number) => { if (n === G.floor) return; G.floor = n; G.floors.add(n); applyAtmos(n); },
  set: (k: string, v: number) => { if (k === 'pressure') { G.pressure = v; if (v >= perkFull) accident(); } if (k === 'closing') G.closing = v; },
  perkForce: () => { if (!perkPicker && G.mode === 'play') showPerkPicker(); },
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
  camRig.pitch = THREE.MathUtils.clamp(camRig.pitch + e.movementY * 0.002, -0.26, 1.4);
});
addEventListener('wheel', (e) => {
  camRig.dist = THREE.MathUtils.clamp(camRig.dist + Math.sign(e.deltaY) * 0.35, 2.6, 7.5);
}, { passive: true });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

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
const floorLbl = el('lbl floor', 'FLOOR 1 — MARKET HALL');
const hintLbl = el('lbl hint', '');
const wetLbl = el('lbl wet', 'WET PANTS');
wetLbl.style.display = 'none';
const alertLbl = el('lbl alert', '');
alertLbl.style.display = 'none';
const sumLbl = el('summary', '');
sumLbl.style.display = 'none';
function fmt(t: number): string { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${s.toString().padStart(2, '0')}`; }
const STATE_COLORS = ['#57cc57', '#d9d94d', '#f29b26', '#e64433'];

// ---------- main loop ----------
let last = performance.now();
function step(): void {
  const dt = Math.min(0.05, (performance.now() - last) / 1000);
  last = performance.now();

  if (G.mode === 'play' && !perkPaused) {
    G.runTime += dt;
    G.closing -= dt;
    G.coffeeCd -= dt;
    swapCd -= dt;
    if (G.closing <= 0) endRun('STORE CLOSED — the lights died mid-strut. Security found you at the deli counter.');

    // bladder
    if (relieving) {
      G.pressure = Math.max(0, G.pressure - RELIEF_RATE * dt);
      if (G.pressure <= 4) { relieving = false; toast("Ahhhh. That's the spot. (The pants, sadly, stay as they are.)"); }
    } else {
      G.pressure = Math.min(perkFull, G.pressure + pressureRate() * dt);
      if (G.pressure >= perkFull) accident();
    }

    // movement
    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    let mx = 0, mz = 0;
    if (!relieving) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    }
    const moving = mx !== 0 || mz !== 0;
    let sp = sprinting && moving ? SPRINT + perkSprint : SPEED;
    if (G.wet) sp *= 0.88;
    const onIce = isSlippery(player.x, player.z);
    if (moving) {
      const len = Math.hypot(mx, mz);
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      const wx = (fx * -mz + rx * mx) / len;
      const wz = (fz * -mz + rz * mx) / len;
      const accel = onIce ? 3.2 : 12;
      vel.x += (wx * sp - vel.x) * Math.min(1, accel * dt);
      vel.z += (wz * sp - vel.z) * Math.min(1, accel * dt);
      walkPhase += dt * (sprinting ? 11 : 8.5);
      if (onIce) {
        squeakT -= dt;
        if (squeakT <= 0) { SFX.squeak(); squeakT = 0.34; }
      }
    } else {
      const grip = onIce ? 1.6 : 14;
      vel.x *= Math.max(0, 1 - grip * dt);
      vel.z *= Math.max(0, 1 - grip * dt);
    }
    let nx = player.x + vel.x * dt, nz = player.z + vel.z * dt;
    [nx, nz] = collide(nx, nz, player.r);
    player.x = nx; player.z = nz;

    // frozen lake / dark deck pressure modifiers
    if (isIce(player.x, player.z)) {
      if (!G.mods.includes(1.6)) { G.mods.push(1.6); toast('Ice under your shoes. Your bladder has filed a formal complaint.'); }
    } else {
      delMod(1.6);
    }

    // doorway to the parking deck: walk through fast to flee upward (or back)
    if (G.floor === 1 && swapCd <= 0 && Math.hypot(player.x - HALL_DOOR.x, player.z - HALL_DOOR.z) < HALL_DOOR.r && Math.hypot(vel.x, vel.z) > 1.5) swapFloor(2);
    if (G.floor === 2 && swapCd <= 0 && Math.hypot(player.x - DECK_DOOR.x, player.z - DECK_DOOR.z) < DECK_DOOR.r && Math.hypot(vel.x, vel.z) > 1.5) swapFloor(1);

    // quads (both floors, seeded spots)
    for (const q of quadMeshes) {
      if (q.f === G.floor && Math.hypot(q.x - player.x, q.z - player.z) < 1.1) {
        q.mesh.visible = false;
        G.quota++; G.score += 10;
        if (G.quota === 1 || G.quota === 2) {
          toast(`Quota item secured. (${G.quota}/3) The store manager is watching you now.`);
          showPerkPicker();
        } else {
          toast(`Quota item secured. (${G.quota}/3) Trunk's open. Run.`);
        }
        SFX.thump();
      }
    }

    // the getaway car: trunk wants the full cart
    if (G.floor === 2 && G.quota >= 3) {
      const car = (seedQuads.length, carPos);
      if (Math.hypot(player.x - car.x, player.z - car.z) < 1.6) {
        endRun(G.wet ? 'WET EXIT — you fled to the deck, tanked the drive, and never told anyone' : 'CLEAN EXIT — dry pants, full cart, deck-topping strut. Legend.');
      }
    }

    // staff patrols + chase
    for (const s of staff) staffStep(s, dt);

    // random mess
    eventTimer -= dt;
    if (eventTimer <= 0) {
      eventTimer = 30 + Math.random() * 22;
      if (G.floor === 1 && !flickerOn && Math.random() < 0.5) {
        flickerOn = true; flickerT = 6;
        toast('The fluorescent strip above you commits to flickering. Pee-shivers incoming.');
        addMod(0.4);
      } else {
        const rx = THREE.MathUtils.clamp(Math.floor(Math.random() * 5) * -5 - 5 + Math.random() * 4, -20, 20);
        const rz = THREE.MathUtils.clamp(-12 + Math.random() * 24, -15, 15);
        spawnPuddle(rx, rz);
        toast(G.floor === 2 ? 'Oil. Of course it\'s oil.' : 'Somebody mopped that. Somebody who has never peed in their pants.');
      }
    }
    if (flickerOn) {
      flickerT -= dt;
      if (flickerT <= 0) { flickerOn = false; delMod(0.4); }
    }

    // interact: E edge-trigger
    const eNow = keys.has('KeyE');
    if (eNow && !eHeld && !relieving) {
      const n = nearest(interactables, player.x, player.z);
      if (n) n.on();
    }
    if (!eNow) relieving = false;
    else if (relieving && !nearest(interactables, player.x, player.z)) relieving = false;
    eHeld = eNow;

    // HUD
    const st = stateIdx();
    barFill.style.width = `${G.pressure}%`;
    barFill.style.background = STATE_COLORS[st];
    stateLbl.textContent = `BLADDER: ${stateName()} ${Math.round(G.pressure)}%`;
    stateLbl.style.opacity = st === 3 && !G.wet ? String(0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 1000 * 8))) : '0.95';
    clockLbl.textContent = `CLOSING IN ${fmt(Math.max(0, G.closing))}`;
    clockLbl.style.color = G.closing < 60 ? '#e64433' : '#cfd3da';
    quotaLbl.textContent = `QUOTA ${G.quota}/3`;
    floorLbl.textContent = G.floor === 1 ? 'FLOOR 1 — MARKET HALL' : 'FLOOR 2 — K-PARKKI DECK';
    wetLbl.style.display = G.wet ? 'block' : 'none';
    const near = nearest(interactables, player.x, player.z);
    hintLbl.textContent = near ? `[E] ${near.hint()}` : (G.floor === 2 && Math.hypot(player.x - carPos.x, player.z - carPos.z) < 4 && G.quota < 3 ? `Car found — trunk needs quota (${G.quota}/3)` : '');
    const anyChase = staff.find((s) => s.floor === G.floor && s.state === 'chase');
    if (anyChase) {
      alertLbl.style.display = 'block';
      alertLbl.textContent = 'STAFF IS COMING';
    } else if (staff.find((s) => s.floor === G.floor && s.state === 'alert')) {
      alertLbl.style.display = 'block';
      alertLbl.textContent = '...staff heard something';
    } else alertLbl.style.display = 'none';

    // CRITICAL heartbeat + drips
    if (st === 3) {
      heartbeatT -= dt;
      if (heartbeatT <= 0) { SFX.thump(); heartbeatT = 0.42; }
      if (moving && !relieving) {
        dripT -= dt;
        if (dripT <= 0) { SFX.shhh(0.05, 0.05, 0.25); dripT = 0.45; }
      }
    }

    // hero animation
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
    hero.rotation.z = Math.sin(t * (4 + 8 * urgency)) * urgency * 0.22 * swing;

    // camera tension
    const targetShake = st === 3 ? 0.05 : st === 2 ? 0.015 : 0;
    camShake += (targetShake - camShake) * Math.min(1, 1.5 * dt);
    const fovT = 68 - st * 1.5;
    camera.fov += (fovT - camera.fov) * Math.min(1, 3 * dt);
    camera.updateProjectionMatrix();
    jeansMat.color.lerp(G.wet ? wetJeans : dryJeans, Math.min(1, 4 * dt));
  }

  // ---------- camera placement ----------
  const dist = camRig.dist + stateIdx() * 0.12;
  const cp = Math.cos(camRig.pitch);
  const sinp = Math.sin(camRig.pitch);
  const hx = hero.position.x, hy = hero.position.y + 1.5, hz = hero.position.z;
  let bx = Math.sin(camYaw), bz = Math.cos(camYaw);
  let placed = false;
  for (let i = 10; i >= 1; i--) {
    const dd = (dist * cp) * (i / 10);
    const cx = hx + bx * dd, cz = hz + bz * dd;
    const cy = hy + sinp * dd - Math.max(0, sinp) * 0.4;
    if (cy > floorY(cx, cz) + 0.22 && camRayClear(hx, hy, hz, cx, cy, cz)) {
      camera.position.set(cx + (Math.random() - 0.5) * camShake, cy + (Math.random() - 0.5) * camShake * 0.6, cz + (Math.random() - 0.5) * camShake * 0.3);
      placed = true;
      break;
    }
  }
  if (!placed) {
    const cy = hy - 0.12;
    camera.position.set(hx + bx * 2.2, Math.max(cy, floorY(hx + bx * 2.2, hz + bz * 2.2) + 0.25), hz + bz * 2.2);
  }
  camera.lookAt(hero.position.x, hero.position.y + 1.15, hero.position.z);

  renderer.render(scene, camera);
  requestAnimationFrame(step);
}

startRun(4271);
requestAnimationFrame(step);