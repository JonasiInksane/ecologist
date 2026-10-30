// Renders one frame headlessly and saves the view as a PNG, to check how things look without a browser:
// `node tools/shot.mjs [out.png] [--seed N] [--level N | --terrarium] [--at X,Y] [--ticks N] [--day D] [--hour H] [--zoom 2]`
// --level plays puzzle N (1 is the first) instead of the seed's world, centred on its room.
// --at centres the view on tile X,Y (default: the explorer); --hour sets the time of day (0-24, default the start's);
// --day moves the calendar on that many days (the year is 8 days, starting in spring: 2 is summer, 4 autumn, 6 winter).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const fakeCtx = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {} };
function stub() {
  return new Proxy(function () {}, {
    get: (f, k) => k === 'getContext' ? () => fakeCtx : k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? undefined : stub(),
    apply: () => stub(), construct: () => stub(), set: () => true,
  });
}
globalThis.document = stub();
globalThis.addEventListener = () => {};
globalThis.Option = function () {};
globalThis.matchMedia = () => ({ matches: false });

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shot.png';
const { generate } = await import('../js/generate.js');
const { step } = await import('../js/sim.js');
const { render } = await import('../js/render/render.js');
const { centerOn, setZoom, snapToExplorer } = await import('../js/render/camera.js');
const { frame } = await import('../js/canvas.js');
const { PW, T } = await import('../js/config.js');
const { DAY_TICKS } = await import('../js/daynight.js');
const { S, VIEW } = await import('../js/world.js');

S.seed = +arg('--seed', S.seed);
generate();
let shotLevelView;
if (arg('--level')) { const { LEVELS, startLevel } = await import('../js/levels.js'); const index = +arg('--level') - 1; startLevel(index); shotLevelView = LEVELS[index].view; }
const jarShot = process.argv.includes('--terrarium');
if (jarShot) { const { startTerrarium } = await import('../js/terrarium.js'); startTerrarium(S.seed); }
if (arg('--hour')) S.tick = Math.round((((+arg('--hour') / 24 - 0.35) % 1 + 1) % 1) * DAY_TICKS);   // as the tests' setClock: phase 0.5 is noon
S.tick += Math.round(+arg('--day', 0) * DAY_TICKS);
const ticks = +arg('--ticks', 60);
for (let i = 0; i < ticks; i++) step();
setZoom(+arg('--zoom', jarShot ? 2 : shotLevelView?.zoom || 1));
const at = arg('--at');
if (at || arg('--level') || jarShot) { const [x, y] = (at || (jarShot ? '45,43' : shotLevelView ? `${shotLevelView.x},${shotLevelView.y}` : '80,50')).split(',').map(Number); S.follow = false; centerOn(x * T + 4, y * T + 4); } else snapToExplorer();
render(S.tick / 60);
render(S.tick / 60 + 1 / 30);   // twice, so the light (worked out every other frame) is current

// PNG: 8-bit RGBA rows, each with filter byte 0, deflated, in IHDR / IDAT / IEND chunks with CRC-32s
const w = VIEW.w, h = VIEW.h, raw = Buffer.alloc((w * 4 + 1) * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const c = frame[(VIEW.y + y) * PW + VIEW.x + x], o = y * (w * 4 + 1) + 1 + x * 4;
  raw[o] = c & 255; raw[o + 1] = (c >>> 8) & 255; raw[o + 2] = (c >>> 16) & 255; raw[o + 3] = 255;
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]), sum = Buffer.alloc(4);
  len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${out}: ${w} × ${h}, seed ${S.seed}, view at tile ${(VIEW.x / T) | 0}, ${(VIEW.y / T) | 0}`);
process.exit(0);
