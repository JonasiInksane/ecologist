# Phase 23: sealed terrarium

## Model and shared construction

The first showcase preset exposes the designed glass jar already verified in Phase 22.
`js/terrarium.js` owns its complete empty-world initialization, geometry, initial organisms
and food. Both the runtime preset and `tools/check-ecosystem.mjs` call that constructor;
the balanced, dark, unfed and overfed controls retain their existing construction and gate.
There are no biology, feeding, oxygen or temperature-rate changes in this extraction.

The constructor consumes the caller's random stream. The gate retains its seeded stream
through setup and subsequent steps. Runtime entry seeds only construction and restores the
ordinary random function afterward, as generated worlds do. Restart reproduces the initial
jar; it does not promise an identical future stochastic trajectory.

The preset uses a saved `S.terrarium` descriptor and leaves `S.level` unset. This preserves
ordinary day/night and the normal save/code/file paths. The descriptor records its seed,
start tick and the world settings to restore on exit. Loading restores existing state and
never calls the constructor. Empty-world reset and loading an older save clear the marker.
No new per-tile fields or recurring resource additions are introduced.

Telemetry reads only the fixed jar area and its resident organisms. It reports elapsed game
days, population turnover, actual oxygen, algae relative to its initial amount and qualitative
food reserves. It neither predicts a precise lifetime nor claims perpetual stability. Reading
the panel must not mutate the world or consume randomness. Player copy explains fish, food,
oxygen and light without exposing inventory implementation details.

Before extraction, parity fixtures use the preserved Phase 22 source at
`.test-artifacts/phase22-verified-source`. Independent processes compare exact initial and
short stepped worlds for all four scenarios and seeds 7, 73 and 31337. Only the added null
terrarium marker, false editor-mode and null draft defaults, and strictly asserted zero magical ledger metadata
are excluded; all physical and biological fields must match exactly. Focused controls cover finite setup, read purity, save/code round trips,
old saves, restart and exit settings. The existing six-case long-duration gate remains intact.

UI integration is owned separately: an explicit terrarium Mode entry, framing without an
explorer, a view-only panel, working save/load/restart and guarded editing paths. Pause,
speed, light and camera controls remain useful. Browser automation is unavailable in this
turn; initial interaction coverage therefore uses headless event and bundle checks.

Verification passed 273 focused/model/parity checks and compared exact snapshots at steps 0, 1, 8, 32 and 64 for all twelve
seed/scenario combinations, including the next random draw. Save/code/legacy, resource,
read-purity, restart and undo controls passed alongside those comparisons. The raw record is
[`phase23-terrarium-model.log`](../../research_notes/Tidepool%20living%20world%20audit/phase23-terrarium-model.log);
the long gate contract remains unchanged. Independent headless UI review reproduced and then
verified fixes for preserving the sandbox time schedule and clearing stale editor state on
older saves. The final UI integration passes 43 event checks, including guarded editing,
real code load/undo, light schedules, recorded loss/oxygen feedback and day/night display.
The tested isolation mask stays intact; the renderer seeds daylight only within the jar's
pure shared geometry. Native frame inspection confirms readable water, seedlings and glass.
Browser interaction and full page layout remain unverified in this increment.
