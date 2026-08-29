// ============================== audio.ts ==============================
// Procedural WebAudio SFX — no audio assets. Drips, shhh, splashes, plops,
// a store hum that curdles into a heartbeat as the bladder fills.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let humGain: GainNode | null = null;
let humOsc: OscillatorNode | null = null;
let humOsc2: OscillatorNode | null = null;

function ensure(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master!.gain.value = 0.85;
      master!.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = 0.98 * last + 0.02 * w; // pinkish
    d[i] = (last * 3.2 + w * 0.12) * 0.5;
  }
  return buf;
}
// cached step-size + long noise — a footstep fires ~4-8x/second; don't synthesize a
// 3840-sample buffer per strike (M8 feel pass)
let stepNoise: AudioBuffer | null = null;
function stepNoiseBuf(c: AudioContext): AudioBuffer {
  if (!stepNoise) stepNoise = noiseBuffer(c, 0.07);
  return stepNoise;
}

/** Descending/ascending sine blip (drips, plops). */
export function tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

/** Upward chirp — the legendary plop (140→360 Hz, like the reference still's protagonist). */
export function plop(): void {
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  o.frequency.setValueAtTime(140, c.currentTime);
  o.frequency.linearRampToValueAtTime(360, c.currentTime + 0.25);
  const g = c.createGain();
  g.gain.setValueAtTime(0.9, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.25);
  o.connect(g).connect(master);
  o.start();
  o.stop(c.currentTime + 0.27);
}

/** Filtered noise burst — shhh (lp 0.15) and the splash finale (lp 0.35, loud). */
export function shhh(vol = 0.1, dur = 0.09, lp = 0.15): void {
  const c = ensure();
  if (!c || !master) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp * c.sampleRate; // lp param kept as fraction of nyquist-ish scale
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(f).connect(g).connect(master);
  src.start();
}

export function splash(): void {
  shhh(0.55, 0.35, 0.35);
  tone(90, 0.3, 0.4, 'triangle'); // body-fall thud under the hiss
}

/** Store ambience: a low fluorescent hum, two detuned saws. */
export function humStart(): void {
  const c = ensure();
  if (!c || !master) return;
  if (humOsc) return;
  humGain = c.createGain();
  humGain.gain.value = 0.014;
  humGain.connect(master);
  humOsc = c.createOscillator();
  humOsc.type = 'sawtooth';
  humOsc.frequency.value = 58;
  humOsc2 = c.createOscillator();
  humOsc2.type = 'sawtooth';
  humOsc2.frequency.value = 58.6; // beat frequency = fluorescent flicker
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 160;
  humOsc.connect(lp);
  humOsc2.connect(lp);
  lp.connect(humGain);
  humOsc.start();
  humOsc2.start();
}

export function humStop(): void {
  if (humOsc) { humOsc.stop(); humOsc = null; }
  if (humOsc2) { humOsc2.stop(); humOsc2 = null; }
  if (humGain) { humGain.disconnect(); humGain = null; }
}

/** The panic heartbeat: doubles under CRITICAL pressure. */
export function thump(): void {
  tone(52, 0.09, 0.28, 'sine');
}

/** Sneaker squeak on the frozen lake — two thin sines sliding down. */
export function squeak(): void {
  tone(1750, 0.16, 0.05, 'sine');
  tone(2350, 0.1, 0.03, 'sine');
}

/** Context state for probes — 'running' only after a real user gesture (or resume). */
export function audioState(): string {
  return ctx ? ctx.state : 'none';
}

/** Caught by staff: the alarm that ends your shift. */
export function alarm(): void {
  tone(720, 0.5, 0.3, 'square');
}

// ---------- M8 feel pass: footsteps, staff footsteps, near-miss tension ----------

/** Sneaker tap. Sprint = snappier + higher, crouch = softer + lower (rubber sole). */
export function stepSfx(sprinting: boolean, crouched: boolean): void {
  const c = ensure();
  if (!c || !master) return;
  const f = c.createBufferSource();
  f.buffer = stepNoiseBuf(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = crouched ? 220 : sprinting ? 520 : 380;
  bp.Q.value = 1.2;
  const g = c.createGain();
  const v = crouched ? 0.05 : sprinting ? 0.16 : 0.09;
  g.gain.setValueAtTime(v, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.07);
  f.connect(bp).connect(g).connect(master);
  f.start();
}

/** Guard footstep: one octave down + lowpass, so a guard is heard as a HEEL, not a sneaker. */
export function staffStepSfx(vol: number): void {
  const c = ensure();
  if (!c || !master) return;
  if (vol < 0.01) return;
  const f = c.createBufferSource();
  f.buffer = stepNoiseBuf(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 150;
  bp.Q.value = 1.0;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
  f.connect(bp).connect(g).connect(master);
  f.start();
  tone(64, 0.06, vol * 0.7, 'sine'); // heel weight under the scuff
}

/** Near-miss whoop: a rising air-rush as the guard closes to within a step. */
export function nearMiss(): void {
  const c = ensure();
  if (!c || !master) return;
  const f = c.createBufferSource();
  f.buffer = noiseBuffer(c, 0.3);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(320, c.currentTime);
  bp.frequency.exponentialRampToValueAtTime(1400, c.currentTime + 0.28);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.34, c.currentTime + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.3);
  f.connect(bp).connect(g).connect(master);
  f.start();
}
