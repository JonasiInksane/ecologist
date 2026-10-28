// Seeded hashing and noise, plus colour packing helpers.
import { S } from './world.js';












function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(S.seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi + s, yi), b = hash(xi + 1 + s, yi), c = hash(xi + s, yi + 1), d = hash(xi + 1 + s, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function pack(c) { return (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; }
function P(arr) { return arr.map(h => pack(hex(h))); }

// A small seeded random generator (mulberry32): the same seed gives the same sequence of numbers in [0, 1).
function seededRandom(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { seededRandom, hash, vnoise, hex, pack, P };
