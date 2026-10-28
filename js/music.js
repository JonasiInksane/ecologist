// Music: a soft score made up as it plays, with Web Audio. A slow pad holds a chord for a few bars while a sparse
// melody picks notes from it. By day it plays in C major (C, Am, F, G); at night in A minor (Am, F, C, G), lower,
// slower and sparser; rain darkens it and thins the melody out further. Off until the Music button is pressed.
import { actx, master, setupAudio } from './audio.js';
import { sunHeight } from './daynight.js';
import { S } from './world.js';

const DAY = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]];     // semitones above C: C, Am, F, G
const NIGHT = [[9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14]];   // Am, F, C, G
const PENTA = { day: [0, 2, 4, 7, 9], night: [9, 12, 14, 16, 19] };   // C major and A minor pentatonic
const C3 = 130.81, VOLUME = 0.1;
let out = null, filter = null, nextChord = 0, nextNote = 0, bar = 0;

const freq = semis => C3 * Math.pow(2, semis / 12);
function setup() {
  out = actx.createGain(); out.gain.value = 0;
  filter = actx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2000; filter.Q.value = 0.3;
  out.connect(filter); filter.connect(master);
}
function enableMusic(on) {
  if (on && !actx && !setupAudio()) return false;
  S.music = on;
  if (!actx) return true;
  if (!out) setup();
  if (on) { actx.resume(); nextChord = nextNote = actx.currentTime + 0.1; }
  else if (!S.sound) actx.suspend();
  out.gain.setTargetAtTime(on ? VOLUME : 0, actx.currentTime, 0.8);
  return true;
}
// A soft note: f Hz from time t for dur seconds, rising over attack and fading out over the rest.
function note(f, t, dur, type, gain, attack) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
// Called every frame: schedules the next chord and melody note a little ahead of time.
function musicTick() {
  if (!S.music || !actx || !out) return;
  const now = actx.currentTime, night = sunHeight() < -0.05, rain = Math.min(1, S.rain || 0);
  filter.frequency.setTargetAtTime((night ? 1100 : 2200) * (1 - 0.45 * rain), now, 2);
  const chords = night ? NIGHT : DAY, chord = chords[bar % chords.length], low = night ? -12 : 0, len = night ? 10 : 8;
  if (now > nextChord - 0.3) {   // the pad: each chord tone twice, slightly detuned, swelling in and out
    for (const s of chord) for (const d of [-0.6, 0.6]) note(freq(s + low) * Math.pow(2, d / 1200), nextChord, len + 1.5, 'triangle', 0.05, 2.5);
    nextChord += len; bar++;
  }
  if (now > nextNote - 0.1) {
    const scale = night ? PENTA.night : PENTA.day, sparse = (night ? 0.5 : 0.75) * (1 - 0.5 * rain);
    if (Math.random() < sparse) note(freq(scale[(Math.random() * scale.length) | 0] + 12 + low), nextNote, 1.6, 'sine', 0.06, 0.02);
    nextNote += (night ? 1.6 : 1.1) * (1 + Math.random());
  }
}

export { DAY, NIGHT, PENTA, VOLUME, enableMusic, note, musicTick };
