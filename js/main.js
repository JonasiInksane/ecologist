// Entry point: builds the world and runs the fixed-rate simulation loop.
import { setHum } from './audio.js';
import { generate } from './generate.js';
import { musicTick } from './music.js';
import { autoCheckpoint } from './history.js';
import { checkLevel } from './levels.js';
import { paintStroke, paused, speedEl, updateStatus } from './input.js';
import { updateParticles } from './particles.js';
import { setZoom, snapToExplorer, updateCamera } from './render/camera.js';
import { render } from './render/render.js';
import { step } from './sim.js';
import { S, pumps, reduceMotion } from './world.js';












let acc = 0, prev = performance.now(), frames = 0, clock = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  clock += dt * (reduceMotion ? 0.3 : 1);
  paintStroke();
  if (!paused) {
    acc += dt * 60 * +speedEl.value;
    let n = 0;
    while (acc >= 1 && n < 8) { step(); acc -= 1; n++; }
    if (n === 8) acc = 0;
    autoCheckpoint();
    updateParticles();
  }
  updateCamera();
  if (S.sound) setHum(pumps.filter(p => p.on && p.active).length * 0.5);
  musicTick();
  render(clock);
  if ((frames & 31) === 0) checkLevel();
  if ((frames++ & 7) === 0) updateStatus();
  requestAnimationFrame(loop);
}
const linked = /^#seed-([0-9]{1,10})$/.exec(location.hash);   // a shared seed link
if (linked && +linked[1] <= 2147483647) S.seed = +linked[1];
generate();
setZoom(1);
snapToExplorer();
requestAnimationFrame(loop);
