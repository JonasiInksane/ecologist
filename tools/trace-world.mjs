// Reproducible full-state digest for behavior-preserving performance changes.
import { createHash } from 'node:crypto';
import { serialize } from 'node:v8';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { reseed } from './test-support.mjs';
const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const root = resolve(option('root', '.')), seed = Number(option('seed', '7')), ticks = Number(option('ticks', '400'));
const moduleAt = name => import(pathToFileURL(resolve(root, 'js', name)).href);
const { S } = await moduleAt('world.js');
const { generate } = await moduleAt('generate.js');
const { step } = await moduleAt('sim.js');
const { capture } = await moduleAt('snapshot.js');
S.seed = seed; generate(); reseed(seed);
const renderMode = option('render', 'none'); let renderer, pixels;
if (renderMode !== 'none') {
  renderer = (await moduleAt('render/render.js')).render; pixels = (await moduleAt('canvas.js')).frame;
  const camera = await moduleAt('render/camera.js'); camera.setZoom(1); camera.snapToExplorer();
  if (renderMode === 'storm') {
    const air = await moduleAt('air.js'); S.weather = true; S.wind = S.windTarget = 2; S.windTimer = 1e9;
    air.cloud.fill(air.STORM_AT * 3); air.hum.fill(air.RAIN_AT);
  }
}
const start = performance.now(); for (let i = 0; i < ticks; i++) { step(); if (renderer && i % 2 === 0) renderer(i / 60); }
const elapsed = performance.now() - start;
console.log(JSON.stringify({ seed, ticks, elapsedMs: elapsed, digest: createHash('sha256').update(serialize(capture())).digest('hex'),
  pixels: pixels ? createHash('sha256').update(new Uint8Array(pixels.buffer)).digest('hex') : undefined }));
process.exit(0);
