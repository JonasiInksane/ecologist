// Sound: small effects synthesized with Web Audio, so there are no sound files. Off until the Sound button is pressed.
// Effects are quieter the further they are from the middle of the view, panned left or right, and silent off screen.
// Splashes and pours sound like their liquid (a family per liquid: water, lava, thick, acid, oil, metal, glow), and the
// liquids in view make their own ambience: lava pops, acid fizzes, honey and mud gloop.
import { ACID, AETHER, BLOOM, FOAM, HONEY, LAVA, LYE, MOLTEN, MUD, OIL, QUICK, SLIME, TONIC } from './config.js';
import { FERRO, LIGHT, MSLAG } from './config.js';
import { LIQ } from './liquids.js';
import { S, VIEW } from './world.js';





let actx = null, master = null, noise = null, humGain = null;
const lastPlayed = {};
const MIN_GAP = { splash: 0.05, pour: 0.09, sizzle: 0.12, fizz: 0.08, crackle: 0.04, chime: 0.1, tinkle: 0.08, click: 0.03, boom: 0.15, blub: 0.07, pop: 0.12, gloop: 0.3 };
const FAMILY = {};   // liquid id -> how it sounds; anything not listed sounds like water, and gases make no sound
for (const t of [LAVA, MOLTEN, MSLAG]) FAMILY[t] = 'lava';
for (const t of [HONEY, MUD, SLIME, FOAM]) FAMILY[t] = 'thick';
for (const t of [ACID, LYE]) FAMILY[t] = 'acid';
FAMILY[OIL] = 'oil';
for (const t of [QUICK, FERRO]) FAMILY[t] = 'metal';
for (const t of [AETHER, LIGHT, BLOOM, TONIC]) FAMILY[t] = 'glow';
function familyOf(t) { return !t || !LIQ[t] ? 'water' : LIQ[t].gas ? null : FAMILY[t] || 'water'; }

function setupAudio() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return false;
  actx = new AC();
  master = actx.createGain(); master.gain.value = 0.6; master.connect(actx.destination);
  noise = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // pump hum: two low tones through a lowpass, faded in and out by setHum
  humGain = actx.createGain(); humGain.gain.value = 0;
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
  for (const f of [55, 110.5]) { const o = actx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
  lp.connect(humGain); humGain.connect(master);
  return true;
}
function enableSound(on) {
  if (on && !actx && !setupAudio()) return false;
  S.sound = on;
  if (actx) { if (on || S.music) actx.resume(); else actx.suspend(); }   // music keeps the audio running on its own
  return true;
}
function burst(out, dur, type, freq, q, gain) {
  const t = actx.currentTime, src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = noise; src.loop = true;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t, Math.random() * 0.5); src.stop(t + dur);
}
function tone(out, dur, type, f0, f1, gain) {
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur);
}
// wx, wy: world pixel position of the sound; t: the liquid, for splashes and pours.
function sfx(kind, wx, wy, t) {
  if (!S.sound || !actx || !(kind in MIN_GAP)) return;
  const fam = kind === 'splash' || kind === 'pour' ? familyOf(t) : null;
  if ((kind === 'splash' || kind === 'pour') && !fam) return;
  const now = actx.currentTime, gapKey = fam ? kind + fam : kind;
  if (now - (lastPlayed[gapKey] || 0) < MIN_GAP[kind]) return;
  const cx = VIEW.x + VIEW.w / 2, cy = VIEW.y + VIEW.h / 2;
  const nx = (wx - cx) / (VIEW.w / 2), ny = (wy - cy) / (VIEW.h / 2);
  if (Math.abs(nx) > 1.2 || Math.abs(ny) > 1.2) return;
  lastPlayed[gapKey] = now;
  const pan = actx.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, nx * 0.8));
  const vol = actx.createGain(); vol.gain.value = 1 - 0.5 * Math.min(1, Math.hypot(nx, ny));
  vol.connect(pan); pan.connect(master);
  const r = 0.85 + Math.random() * 0.3;
  if (fam) liquidSound(vol, fam, kind === 'pour' ? 0.6 : 1, r);
  else if (kind === 'sizzle') burst(vol, 0.4, 'highpass', 3200 * r, 0.7, 0.12);
  else if (kind === 'fizz') burst(vol, 0.16, 'highpass', 5200 * r, 0.7, 0.08);
  else if (kind === 'crackle') burst(vol, 0.035, 'bandpass', 2400 * r, 2, 0.25);
  else if (kind === 'chime') { tone(vol, 0.5, 'sine', 1320 * r, 1300 * r, 0.12); tone(vol, 0.35, 'sine', 1980 * r, 1960 * r, 0.05); }
  else if (kind === 'tinkle') tone(vol, 0.12, 'sine', 2600 * r, 2400 * r, 0.06);
  else if (kind === 'click') tone(vol, 0.06, 'square', 180, 90, 0.08);
  else if (kind === 'boom') { burst(vol, 0.9, 'lowpass', 260 * r, 0.8, 0.9); tone(vol, 0.5, 'sine', 90 * r, 35, 0.5); }
  else if (kind === 'blub') tone(vol, 0.09, 'sine', 380 * r, 760 * r, 0.05);   // a bubble popping
  else if (kind === 'pop') { tone(vol, 0.18, 'sine', 140 * r, 60 * r, 0.22); burst(vol, 0.12, 'lowpass', 500 * r, 1, 0.12); }   // lava
  else if (kind === 'gloop') tone(vol, 0.3, 'sine', 210 * r, 120 * r, 0.12);
}
// A splash or pour (loud 1 or 0.6) of a liquid family.
function liquidSound(out, fam, loud, r) {
  if (fam === 'water') burst(out, 0.14, 'bandpass', 1100 * r, 1.4, 0.35 * loud);
  else if (fam === 'lava') { tone(out, 0.25, 'sine', 120 * r, 55 * r, 0.3 * loud); burst(out, 0.2, 'lowpass', 420 * r, 1, 0.2 * loud); }
  else if (fam === 'thick') { tone(out, 0.22, 'sine', 230 * r, 140 * r, 0.16 * loud); burst(out, 0.12, 'bandpass', 520 * r, 3, 0.12 * loud); }
  else if (fam === 'acid') burst(out, 0.3, 'highpass', 4200 * r, 0.8, 0.14 * loud);
  else if (fam === 'oil') burst(out, 0.16, 'bandpass', 650 * r, 2, 0.3 * loud);
  else if (fam === 'metal') { tone(out, 0.25, 'sine', 900 * r, 860 * r, 0.1 * loud); tone(out, 0.18, 'sine', 1350 * r, 1300 * r, 0.06 * loud); }
  else { tone(out, 0.4, 'sine', 1500 * r, 1800 * r, 0.06 * loud); burst(out, 0.14, 'bandpass', 2400 * r, 2, 0.1 * loud); }   // glow
}
// The liquids in view (render counts them, with a position for each): lava pops, thick liquids gloop and acid fizzes
// now and then, more often the more of them there is. Called every frame; plays at most a few sounds a second.
let nextAmbience = 0;
function ambience(seen) {
  if (!S.sound || !actx || actx.currentTime < nextAmbience) return;
  nextAmbience = actx.currentTime + 0.25;
  for (const [fam, kind] of [['lava', 'pop'], ['thick', 'gloop'], ['acid', 'fizz']]) {
    const v = seen[fam];
    if (v && v.n && Math.random() < Math.min(0.6, v.n / 60)) sfx(kind, v.x, v.y);
  }
}
function setHum(level) {
  if (humGain) humGain.gain.setTargetAtTime(S.sound ? Math.min(1, level) * 0.05 : 0, actx.currentTime, 0.3);
}

export { FAMILY, familyOf, liquidSound, ambience, actx, master, noise, humGain, lastPlayed, MIN_GAP, setupAudio, enableSound, burst, tone, sfx, setHum };
