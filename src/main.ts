// ============================= prisma-panic main.ts ============================
// Third-person supermarket roguelike: your bladder is the health bar.
// M2: patrols that notice you, a frozen lake to skate, a career-limiting staff
// bathroom, random messes, and a camera that collides with the world.
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
// Player colliders [cx, cz, hx, hz] — walk into nothing, camera stops at them too.
const solids: { x: number; z: number; hx: number; hz: number }[] = [];
const addBox = (x: number, z: number, hx: number, hz: number) => solids.push({ x, z, hx, hz });
// camera-only blockers, with height span so low cameras can duck under shelves
const camSolids: { x: number; z: number; hx: number; hz: number; y0: number; y1: number }[] = [];
const addCamSolid = (x: number, z: number, hx: number, hz: number, y0 = 0, y1 = 3.4) =>
  camSolids.push({ x, z, hx, hz, y0, y1 });
function collide(x: number, z: number, r: number): [number, number] {
  for (const b of solids) {
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

// ---------- the frozen lake (freezer aisle): slippery AND cold ----------
const FREEZER = { x: 10, z: 11, hx: 5, hz: 4 };
function inRect(x: number, z: number, r: { x: number; z: number; hx: number; hz: number }): boolean {
  return Math.abs(x - r.x) < r.hx && Math.abs(z - r.z) < r.hz;
}
function isIce(x: number, z: number): boolean {
  return inRect(x, z, FREEZER);
}
// world floors — the camera's floor-height oracle, so it can NEVER dip under
function floorY(x: number, z: number): number {
  if (x > 21.2 && z > 10.4 && z < 13.6) return 0;            // exit doorway → outside
  if (x < -16.5 && z < -11) return 0.04;                     // bathroom vinyl (raised)
  if (inRect(x, z, FREEZER)) return 0.011;                   // frozen lake (raised)
  if (x > 23.2 || x < -23.4 || z > 18.2 || z < -18.2) return 0.8; // parking-lot slab (raised)
  return 0;                                                   // main store vinyl
}

// ---------- camera rig (true orbit, colliding) ----------
// Pivot sits at the hero's head. Pitch 0 = dead level, horizon straight through
// the crosshair area. Positive swings UP (overhead orbit, +80°), negative tucks
// DOWN toward a knee-cam (−15°) — and even there the ray-floor test keeps the
// lens above whatever floor it's hovering (vinyl, ice, parking slab).
const camRig = {
  pitch: -0.24, // rad, clamp [-0.26, +1.4]
  dist: 4.4,
};
// does the hero→camera ray pass through a solid, or sink under the floor?
function camRayClear(hx: number, hy: number, hz: number, cx: number, cy: number, cz: number): boolean {
  const STEPS = 10;
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = hx + (cx - hx) * t, y = hy + (cy - hy) * t, z = hz + (cz - hz) * t;
    if (y < floorY(x, z) + 0.22) return false; // ray dips under floor — blocked
    for (const s of camSolids) {
      if (Math.abs(x - s.x) < s.hx && Math.abs(z - s.z) < s.hz && y > s.y0 && y < s.y1) return false;
    }
  }
  return true;
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
// perimeter walls + exit gap (E, z 10.8..13.2) + bathroom corner (NW) + break room (SE)
box(46, 3.2, 0.4, 0, 1.6, -18, mat(0x8d95a1));
box(46, 3.2, 0.4, 0, 1.6, 18, mat(0x8d95a1));
box(0.4, 3.2, 36, -23, 1.6, 0, mat(0x8d95a1));
box(0.4, 3.2, 28.8, 23, 1.6, -3.6, mat(0x8d95a1));
box(0.4, 3.2, 4.8, 23, 1.6, 15.6, mat(0x8d95a1));
box(0.4, 3.2, 4.5, -16.5, 1.6, -15.75, mat(0x7f9aa3));
box(0.4, 3.2, 1.0, -16.5, 1.6, -11.5, mat(0x7f9aa3));
box(6.5, 3.2, 0.4, -19.75, 1.6, -11, mat(0x7f9aa3));
// ceiling + fluorescent strips — flicker events dim THESE
const strips: THREE.Mesh[] = [];
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(46, 36), mat(0x23262e, 0.99));
ceil.rotation.x = Math.PI / 2;
ceil.position.y = 3.4;
store.add(ceil);
const stripMat = new THREE.MeshStandardMaterial({ color: 0xf2f6ff, emissive: 0xdfeaff, emissiveIntensity: 1.7, roughness: 0.4 });
for (const sx of [-15, -5, 5, 15]) for (const sz of [-10, 0, 10]) {
  const s = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 5), stripMat);
  s.position.set(sx, 3.26, sz);
  store.add(s);
  strips.push(s);
}
for (const [px, pz] of [[-12, 0], [12, 4]] as const) {
  const pl = new THREE.PointLight(0xeef4ff, 22, 24, 1.8);
  pl.position.set(px, 3, pz);
  store.add(pl);
}
// shelf rows (player solid + camera blocker, low cameras duck under)
const shelfMat = mat(0xb6b3ae);
const merchColors = [0xcc4433, 0xe68c26, 0xf2dd4d, 0x66b34d, 0x33999e, 0xbf5999, 0x805936, 0xdadcde];
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

// ---------- interactables & decor ----------
// The toilet (NW corner).
const toiletMat = new THREE.MeshStandardMaterial({ color: 0xeef0e8, roughness: 0.35, metalness: 0.05 });
function makeToilet(x: number, z: number, yaw: number, glowColor: number): THREE.Group {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), toiletMat);
  bowl.scale.set(1, 0.55, 1.25); bowl.position.y = 0.42; bowl.castShadow = true;
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.1, 16), toiletMat);
  seat.position.y = 0.68;
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.2), toiletMat);
  tank.position.set(0, 0.85, -0.36); tank.castShadow = true;
  g.add(bowl, seat, tank);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  store.add(g);
  const glow = new THREE.PointLight(glowColor, 6, 6, 1.6);
  glow.position.set(0, 1.7, 0);
  g.add(glow);
  return g;
}
makeToilet(-22, -14.5, Math.PI / 2, 0x66ff99);
addBox(-22, -14.5, 0.45, 0.45);

// Coffee stand.
{
  const coffee = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.8), new THREE.MeshStandardMaterial({ color: 0xb8452f, roughness: 0.6 }));
  counter.position.y = 0.55; counter.castShadow = true;
  const cupM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.16, 10), mat(0xf2f2ea, 0.6));
  cupM.position.set(0.25, 1.16, 0);
  coffee.add(counter, cupM);
  coffee.position.set(10, 0, -10);
  store.add(coffee);
}
// THE FROZEN LAKE — the old "freezer aisle", now actually slippery.
// One long ice sheet with display chests ON it, like a skating rink that
// retail somehow never shut down. Drift to cross it. Hear the squeak.
{
  const lake = new THREE.Mesh(
    new THREE.PlaneGeometry(FREEZER.hx * 2, FREEZER.hz * 2),
    new THREE.MeshStandardMaterial({ color: 0xaee0f5, roughness: 0.28, metalness: 0.12, transparent: true, opacity: 0.9 }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(FREEZER.x, 0.011, FREEZER.z);
  store.add(lake);
  const lakeLight = new THREE.PointLight(0x9fd8ff, 14, 12, 1.7);
  lakeLight.position.set(FREEZER.x, 2.6, FREEZER.z);
  store.add(lakeLight);
  for (let i = 0; i < 3; i++) {
    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.1), mat(0xeaf3fa, 0.35));
    chest.position.set(7 + i * 3, 0.45, 11);
    chest.castShadow = true;
    store.add(chest);
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
box(0.7, 0.5, 0.7, 14, 0.25, 14.5, mat(0xddeef5, 0.5));
box(0.6, 1.0, 0.6, 20.4, 0.5, 13, mat(0x6a737f, 0.6));
// Exit doors.
{
  const exitDoors = new THREE.Group();
  const leaves = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x9fb2c2, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.55 }));
  leaves.position.y = 1.1;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.08), new THREE.MeshStandardMaterial({ color: 0x2fbf5f, emissive: 0x19d34c, emissiveIntensity: 1.4, roughness: 0.5 }));
  sign.position.y = 2.45;
  exitDoors.add(leaves, sign);
  exitDoors.position.set(23.2, 0, 12);
  store.add(exitDoors);
}
// ---------- THE STAFF BREAK ROOM (SE corner) ----------
// Staff take their breaks HERE, at the staff toilet, behind two walls with a
// gap you can sprint through. Relief is legal-ish; being SEEN is not.
{
  // floor tint
  const br = new THREE.Mesh(new THREE.PlaneGeometry(7, 5.2), new THREE.MeshStandardMaterial({ color: 0x9a7f5c, roughness: 0.9 }));
  br.rotation.x = -Math.PI / 2;
  br.position.set(17.5, 0.012, 15.2);
  store.add(br);
  // two wall slabs + gap at x≈14.9 (gap width 1.1)
  box(0.4, 3.2, 3.0, 14.6, 1.6, 12.9, mat(0x6f5c46)); // north wall (two slabs, gap between)
  box(0.4, 3.2, 1.2, 14.6, 1.6, 16.1, mat(0x6f5c46));
  box(7.6, 3.2, 0.4, 18.2, 1.6, 12.4, mat(0x6f5c46)); // west wall segment north of gap... (decor plinth runs)
  // staff toilet: porcelain in the corner, absolutely not up to code
  makeToilet(20.2, 16.2, -Math.PI / 2, 0xff5577);
  // staff fridge + cooler
  const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.7), mat(0xd8dde2, 0.5));
  fridge.position.set(21.6, 0.85, 13.4); fridge.castShadow = true;
  store.add(fridge);
  addBox(21.6, 13.4, 0.5, 0.4);
  const cooler = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x77c8ee, roughness: 0.2, transparent: true, opacity: 0.8 }));
  cooler.position.set(21.4, 1.15, 15.6);
  store.add(cooler);
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

// ---------- STAFF ----------
// Two staff on fixed patrol loops. They see with a 130° cone out to 13m and
// they HEAR sprint footsteps on ice. Catch radius 1.15m, and sprinting away
// genuinely works — they patrol at 2.6 and chase at 5.2 against your 7.4.
type Staff = {
  obj: THREE.Group; legs: THREE.Object3D[];
  x: number; z: number; yaw: number;
  state: 'patrol' | 'alert' | 'chase' | 'return';
  wp: [number, number][]; wpIdx: number;
  speed: number; t: number;       // state timer
  phase: number; lastSqueak: number;
};
const staffMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.85 });   // white overalls
const visorMat = new THREE.MeshStandardMaterial({ color: 0xf2c40e, roughness: 0.6 });     // yellow visor
function makeStaff(x: number, z: number, wp: [number, number][]): Staff {
  const g = new THREE.Group();
  mk(new THREE.CylinderGeometry(0.3, 0.3, 0.64, 12), staffMat, 0, 1.26, 0, g);
  mk(new THREE.SphereGeometry(0.17, 12, 10), skinMat, 0, 1.8, 0, g);
  mk(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 12), visorMat, 0, 1.98, 0, g);
  const st: Staff = {
    obj: g, legs: [], x: x, z: z, yaw: 0,
    state: 'patrol', wp, wpIdx: 0, speed: 2.6, t: 0, phase: Math.random() * 6, lastSqueak: 0,
  };
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.14, 0.7, 0); g.add(leg);
    mk(new THREE.CylinderGeometry(0.13, 0.13, 0.66, 10), staffMat, 0, -0.33, 0, leg);
    mk(new THREE.BoxGeometry(0.2, 0.1, 0.34), blackMat, 0, -0.66, 0.06, leg);
    st.legs.push(leg);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return st;
}
const staff: Staff[] = [
  // Sees you crossing the exit zone... if you ever learn to knock.
  makeStaff(17.5, 15.2, [[17.5, 15.2], [12, 15.5], [4, 15.8], [-8, 15.5], [-18, 14], [-18, 4], [-10, 2], [2, 2], [12, 2], [17.5, 15.2]]),
  // The long loop: coffee stand to frozen lake.
  makeStaff(2, -14, [[2, -14], [-14, -14], [-14, -2], [2, -2], [2, 6], [14, 8], [14, -2], [2, -14]]),
];
const staffSeen = (s: Staff): boolean => {
  const dx = hero.position.x - s.x, dz = hero.position.z - s.z;
  const d = Math.hypot(dx, dz);
  if (d > 13) return false;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const dot = (dx * fx + dz * fz) / Math.max(0.001, d);
  return dot > Math.cos(1.13); // ≈130° cone
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
    s.wpIdx = s.wp.length; // park the loop; new objective comes after
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

// register camera blockers for everything solid over 0.6m
for (const b of solids) addCamSolid(b.x, b.z, b.hx, b.hz, 0, 3.4);
addCamSolid(FREEZER.x, FREEZER.z, FREEZER.hx, FREEZER.hz, -1, 0.011); // the lake itself

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
const alertLbl = el('lbl alert', '');
alertLbl.style.display = 'none';
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
  for (const s of staff) { s.state = 'patrol'; s.wpIdx = 0; s.x = s.wp[0][0]; s.z = s.wp[0][1]; }
  toast('Quota first, then the exit. And find a toilet before the pants decide for you.');
  sumLbl.style.display = 'none';
  wetLbl.style.display = 'none';
  alertLbl.style.display = 'none';
  SFX.humStart();
}
function accident(caught = false): void {
  if (caught) return;
  G.wet = true;
  G.pressure = ACCIDENT_RECOVERY;
  G.accidents++;
  toast("...SPLASH. You heard that, didn't you?");
  SFX.splash(); SFX.plop();
  camShake = 0.14;
  // staff hear it. Of course they do.
  for (const s of staff) {
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
    x: 20.2, z: 16.2, r: 2.0,
    hint: () => 'Use the STAFF toilet (legally risky)',
    on: () => {
      relieving = true;
      for (const s of staff) {
        if (Math.hypot(hero.position.x - s.x, hero.position.z - s.z) < 13) spooked(s, 'THIEF! THIEF!');
      }
    },
  },
  {
    x: 10, z: -10, r: 1.9,
    hint: () => (G.coffeeCd <= 0 ? 'Grab free coffee' : 'Coffee stand (out of samples)'),
    on: () => {
      if (G.coffeeCd > 0) { toast('"One at a time, dear," says the lady.'); return; }
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

// ---------- staff AI ----------
function staffStep(s: Staff, dt: number): void {
  const heroD = Math.hypot(hero.position.x - s.x, hero.position.z - s.z);
  const heardSqueak = isIce(player.x, player.z) && Math.hypot(vel.x, vel.z) > 5.5 &&
    performance.now() - s.lastSqueak > 2500;
  if (heardSqueak) s.lastSqueak = performance.now();
  if (s.state === 'patrol') {
    // sight + sound detection
    if (heroD < 7 && staffSeen(s) && (G.wet || Math.hypot(vel.x, vel.z) > 5)) {
      spooked(s, G.wet ? 'SECURITY! WE HAVE A CODE PEED!' : 'Why is this man SPRINTING?');
    } else if (G.wet && heroD < 4.5) {
      spooked(s, 'SECURITY! WE HAVE A CODE PEED!');
    } else if (heardSqueak && heroD < 11) {
      staffHear(s, player.x, player.z, '...squeak squeak squeak...');
    }
  } else if (s.state === 'alert') {
    s.t -= dt;
    if (s.t <= 0) { s.state = 'patrol'; }
  } else if (s.state === 'chase') {
    s.t -= dt;
    if (s.t <= 0) s.state = 'alert';
    if (heroD < 1.15 && G.mode === 'play') {
      SFX.alarm();
      endRun('CAUGHT — staff arms themself with body glue and wet-floor signs');
    }
  }
  // pick destination
  let tx = s.x, tz = s.z;
  if (s.state === 'chase') { tx = hero.position.x; tz = hero.position.z; }
  else if (s.state === 'alert') { tx = player.x; tz = player.z; } // walk to last noise/sight
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
// The store mops the frozen lake. It should NOT. Puddles spawn on their own.
const puddles: THREE.Mesh[] = [];
function spawnPuddle(x: number, z: number): void {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ color: 0x7fd4ff, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.75 }));
  p.rotation.x = -Math.PI / 2;
  p.position.set(x, 0.012, z);
  store.add(p);
  puddles.push(p);
}
function isSlippery(x: number, z: number): boolean {
  if (isIce(x, z)) return true;
  for (const p of puddles) if (Math.hypot(p.position.x - x, p.position.z - z) < 1.3) return true;
  return false;
}
let flickerT = 0, flickerOn = false;
let eventTimer = 38 + Math.random() * 20; // first random mess ~mid-run

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
    inFreezer: inRect(player.x, player.z, FREEZER),
    slippery: isSlippery(player.x, player.z),
    staff: staff.map((s) => ({ s: s.state, d: +Math.hypot(hero.position.x - s.x, hero.position.z - s.z).toFixed(1) })),
    toasts: [...G.toasts], ending: G.ending,
  }),
  keys: (k: string, down: boolean) => { if (down) keys.add(k); else keys.delete(k); },
  walk: (down: boolean) => { if (down) keys.add('KeyW'); else keys.delete('KeyW'); },
  teleport: (x: number, z: number) => { player.x = x; player.z = z; vel.x = 0; vel.z = 0; },
  yaw: (y: number, p?: number) => { camYaw = y; if (p !== undefined) camRig.pitch = p; },
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
    const onIce = isSlippery(player.x, player.z);
    if (moving) {
      const len = Math.hypot(mx, mz);
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);   // cam forward
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);     // cam right
      const wx = (fx * -mz + rx * mx) / len;
      const wz = (fz * -mz + rz * mx) / len;
      // ICE: you can't steer, only suggest direction to the lake
      const accel = onIce ? 3.2 : 12;
      vel.x += (wx * sp - vel.x) * Math.min(1, accel * dt);
      vel.z += (wz * sp - vel.z) * Math.min(1, accel * dt);
      walkPhase += dt * (sprinting ? 11 : 8.5);
      if (onIce) {
        squeakT -= dt;
        if (squeakT <= 0) { SFX.squeak(); squeakT = 0.34; }
      }
    } else {
      const grip = onIce ? 1.6 : 14; // the lake keeps your momentum. Forever, basically.
      vel.x *= Math.max(0, 1 - grip * dt);
      vel.z *= Math.max(0, 1 - grip * dt);
    }
    let nx = player.x + vel.x * dt, nz = player.z + vel.z * dt;
    [nx, nz] = collide(nx, nz, player.r);
    player.x = nx; player.z = nz;

    // frozen lake: cold floor raises the stakes (and the drift)
    if (inRect(player.x, player.z, FREEZER)) {
      if (!inRect(player.x - vel.x * dt, player.z - vel.z * dt, FREEZER)) {
        if (!G.mods.includes(1.6)) { G.mods.push(1.6); toast('The frozen lake. Your bladder has filed a formal complaint.'); }
      }
    } else {
      delMod(1.6);
    }

    // quads
    for (const q of quads) {
      if (q.visible && Math.hypot(q.position.x - player.x, q.position.z - player.z) < 1.1) {
        q.visible = false;
        G.quota++; G.score += 10;
        toast(`Quota item secured. (${G.quota}/3)`);
        SFX.thump();
      }
    }

    // exit (quota unlocks it; sprinting through the door while staff watch is its own artform)
    if (Math.hypot(23 - player.x, 12 - player.z) < 1.6 && G.quota >= 3) {
      endRun(G.wet ? 'WET EXIT — you peed your pants and walked out anyway' : 'CLEAN EXIT — dry pants. Absolute legend.');
    }

    // staff patrols + chase
    for (const s of staff) staffStep(s, dt);

    // random mess: leaks + a flicker event
    eventTimer -= dt;
    if (eventTimer <= 0) {
      eventTimer = 34 + Math.random() * 22;
      if (!flickerOn && Math.random() < 0.5) {
        flickerOn = true; flickerT = 6;
        toast('The fluorescent strip above you commits to flickering. Pee-shivers incoming.');
        addMod(0.4); // shiver multiplier
      } else {
        // leak somewhere in the aisles — fresh slippery patch, spawns in view if you're near
        const rx = THREE.MathUtils.clamp(Math.floor(Math.random() * 5) * -5 - 5 + Math.random() * 4, -20, 20);
        const rz = THREE.MathUtils.clamp(-12 + Math.random() * 24, -15, 15);
        spawnPuddle(rx, rz);
        toast('Somebody mopped that. Somebody who has never peed in their pants.');
      }
    }
    if (flickerOn) {
      flickerT -= dt;
      if (flickerT <= 0) { flickerOn = false; delMod(0.4); }
    }
    // exit doorway lets you actually leave
    if (player.x > 23.4) endRun(G.wet ? 'WET EXIT — you peed your pants and walked out anyway' : 'CLEAN EXIT — dry pants. Absolute legend.');

    // interact: E edge-trigger
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
    const anyChase = staff.find((s) => s.state === 'chase');
    if (anyChase) {
      alertLbl.style.display = 'block';
      alertLbl.textContent = 'STAFF IS COMING';
    } else if (staff.find((s) => s.state === 'alert')) {
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
    hero.rotation.z = Math.sin(t * (4 + 8 * urgency)) * urgency * 0.22 * swing;

    // camera tension: squeeze the lens, add the shakes
    const targetShake = st === 3 ? 0.05 : st === 2 ? 0.015 : 0;
    camShake += (targetShake - camShake) * Math.min(1, 1.5 * dt);
    const fovT = 68 - st * 1.5;
    camera.fov += (fovT - camera.fov) * Math.min(1, 3 * dt);
    camera.updateProjectionMatrix();
    jeansMat.color.lerp(G.wet ? wetJeans : dryJeans, Math.min(1, 4 * dt));
  }

  // ---------- camera placement ----------
  // pivot at hero's head; orbit up to +80°, tuck to −15°, never under the floor
  const dist = camRig.dist + stateIdx() * 0.12;
  const cp = Math.cos(camRig.pitch);
  const sinp = Math.sin(camRig.pitch);
  const hx = hero.position.x, hy = hero.position.y + 1.5, hz = hero.position.z;
  // ray-sample from pivot backwards until something blocks, then stop just short
  let bx = Math.sin(camYaw), bz = Math.cos(camYaw); // "away from hero" horizontal dir
  let d0 = dist * cp, d1 = dist * cp; // wanted distance at this pitch
  let placed = false;
  for (let i = 10; i >= 1; i--) {
    const dd = (dist * cp) * (i / 10);
    const cx = hx + bx * dd, cz = hz + bz * dd;
    const cy = hy + sinp * dd - Math.max(0, sinp) * 0.4; // pulling up also pulls back down a touch
    if (cy > floorY(cx, cz) + 0.22 && camRayClear(hx, hy, hz, cx, cy, cz)) {
      camera.position.set(cx + (Math.random() - 0.5) * camShake, cy + (Math.random() - 0.5) * camShake * 0.6, cz + (Math.random() - 0.5) * camShake * 0.3);
      placed = true;
      break;
    }
  }
  if (!placed) {
    // nowhere clean (cornered): tuck right behind the hero's shoulder, always above floor
    const cy = hy - 0.12;
    camera.position.set(hx + bx * 2.2, Math.max(cy, floorY(hx + bx * 2.2, hz + bz * 2.2) + 0.25), hz + bz * 2.2);
  }
  camera.lookAt(hero.position.x, hero.position.y + 1.15, hero.position.z);

  renderer.render(scene, camera);
  requestAnimationFrame(step);
}
startRun();
requestAnimationFrame(step);
