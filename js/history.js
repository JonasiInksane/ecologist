// Undo: snapshots taken before each edit and every few seconds of play; Ctrl+Z steps back through them.
// A snapshot is about 2.5 MB, so the history keeps the last HISTORY_MAX (about 30 MB).
import { capture, restore } from './snapshot.js';
import { S } from './world.js';

const HISTORY_MAX = 12, AUTO_EVERY = 240, EDIT_GAP = 30, EDIT_GAP_MS = 1000;   // a snapshot every 4 s of play; edits within half a second of play and a second of real time share one
const history = [];
let lastAt = -Infinity, lastWall = -Infinity;

function takeSnapshot() {
  history.push({ tick: S.tick, snap: capture() });
  if (history.length > HISTORY_MAX) history.shift();
  lastAt = S.tick; lastWall = Date.now();
}
// Before the player changes the world (a paint stroke, a placed object, a new world). Real time counts too, so edits
// made while paused can still be undone one at a time.
function checkpoint() { if (!history.length || Math.abs(S.tick - lastAt) >= EDIT_GAP || Date.now() - lastWall >= EDIT_GAP_MS) takeSnapshot(); }
// Called each frame while the world runs.
function autoCheckpoint() { if (S.tick - lastAt >= AUTO_EVERY) takeSnapshot(); }
// Steps back to the last snapshot. Returns how many seconds of play that undid, or -1 if there's nothing to undo.
function undo() {
  const entry = history.pop();
  if (!entry) return -1;
  const back = Math.max(0, S.tick - entry.tick) / 60;
  restore(entry.snap);
  lastAt = S.tick; lastWall = -Infinity;   // the next edit after an undo gets its own snapshot
  return back;
}
function clearHistory() { history.length = 0; lastAt = lastWall = -Infinity; }

export { HISTORY_MAX, AUTO_EVERY, EDIT_GAP, EDIT_GAP_MS, history, takeSnapshot, checkpoint, autoCheckpoint, undo, clearHistory };
