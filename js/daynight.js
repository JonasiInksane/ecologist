// Day and night. Phase 0 is midnight and 0.5 is noon; a full day lasts DAY_TICKS simulation ticks.
import { S } from './world.js';





const DAY_TICKS = 60 * 180;

// The world starts mid-morning. Puzzles hold the time at late morning so the sun never sets on one.
// The Time of day setting (S.timeMode) can hold it too: 'day' at noon, 'night' at midnight, 'stop' wherever it was
// (S.heldPhase). Back on 'cycle' it runs on from the time it was held at (S.timeShift). Seasons run on regardless.
const HELD = { day: 0.5, night: 0 };
function cyclePhase() { return ((S.tick / DAY_TICKS + 0.35 + (S.timeShift || 0)) % 1 + 1) % 1; }
function dayPhase() {
  if (S.level && !S.level.custom) return 0.42;   // custom levels keep their world's time
  if (S.timeMode in HELD) return HELD[S.timeMode];
  if (S.timeMode === 'stop') return S.heldPhase ?? cyclePhase();
  return cyclePhase();
}
function setTimeMode(mode) {
  const now = dayPhase();
  if (mode === 'stop') S.heldPhase = now;
  if (mode === 'cycle') S.timeShift = (S.timeShift || 0) + now - cyclePhase();   // carry on from the time it was held at
  S.timeMode = mode;
}
function sunHeight() { return -Math.cos(dayPhase() * Math.PI * 2); }   // -1 at midnight, 1 at noon
// Sky light colour: bright white by day, warm at dawn and dusk, dim blue at night.
function skyLight() {
  const h = sunHeight();
  const day = Math.min(1, Math.max(0, (h + 0.15) / 0.5));
  const dusk = Math.max(0, 1 - Math.abs(h) / 0.25) * 0.35;
  const lvl = 0.14 + 0.86 * day;   // cloud cover dims it further, column by column (js/render/lighting.js)
  return [Math.min(1, lvl * (0.55 + 0.45 * day) + dusk), lvl * (0.65 + 0.35 * day) + dusk * 0.4, lvl];
}
function clockText() {
  const m = Math.floor(dayPhase() * 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}${S.timeMode && S.timeMode !== 'cycle' && !S.level ? ' (held)' : ''}`;
}

export { HELD, cyclePhase, setTimeMode, DAY_TICKS, dayPhase, sunHeight, skyLight, clockText };
