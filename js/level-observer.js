// Static puzzle observers stay outside saved world state and the simulation's module graph.
// In particular, sim must not import levels -> generate -> the eager pristine snapshot.
import { S } from './world.js';

let builtInLevelObserver = null;
function setBuiltInLevelObserver(observer) { builtInLevelObserver = observer; }
function observeLevel() {
  const st = S.level;
  if (!st || st.custom || st.done || st.failed) return;
  builtInLevelObserver?.(st);
}

export { setBuiltInLevelObserver, observeLevel };
