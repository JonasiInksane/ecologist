# Ecologist: native engine foundation

Approved direction: Godot hosts presentation and input; an independent C++ grid runs
the simulation. The existing JavaScript sandbox remains the behavioural reference.
This first milestone is an interactive **liquid transport** prototype, not the full port.

## Rules and scope

- Start with the existing 512 × 128 cell world, 255 carrier units per full cell, 8 display
  pixels per cell and 60 fixed ticks per second. Keep the original alternating scan,
  viscosity, density swapping, integer spreading and sleeping chunks.
- Carry temperature, velocity, latent energy and all 21 dissolved concentration channels.
  Retain Float32 storage boundaries and double intermediate arithmetic from JavaScript.
- Use a seeded random generator. Rendering never advances it.
- Provide pouring, solid terrain painting/erasing, pause, single step, reset, pan and zoom.
- Render a cell texture through Godot; cells are data, not individual engine objects.
- Validate the isolated transport pass against the **actual JavaScript implementation**
  with reaction/block hooks and cosmetic particle emission disabled in both references.
  Normal browser steps keep their hooks, scheduling and shared RNG unchanged.
- Chemistry, phase changes, powders, momentum, devices, plants/animals, weather and
  browser save import remain subsequent port milestones. They remain available in the
  browser version. Native transport results are not claims of full ecosystem parity.

## Acceptance

Compare complete cell arrays, sleeping chunks, tick and RNG continuation after scripted
steps: falling, spreading/remainders, map edges, viscosity, gas ascent, density swaps,
fractional solutes, temperature/latent transfers and edits that wake settled chunks.
Run the existing browser regression suite after extracting its transport entry point.
Compile the native executable and GDExtension; run Godot import and integration checks.
Benchmark native transport separately at current size and one million cells, recording
hardware-independent scope and active workload. A transport benchmark is not a full-game
frame-rate result. Keep the browser save identifiers and historical evidence paths.

## Project layout

- `native/core`: standard C++ simulation, independent of Godot.
- `native/godot`: thin GDExtension adapter.
- `godot`: interactive flow sandbox and integration tests.
- `tools`: data export, reference parity, portable setup/build/run commands.

Godot 4.7.2 is the Windows test runtime; the extension targets the compatible 4.5 API.
Dependencies are pinned and downloaded into ignored project-local folders.

## First milestone verification (2026-10-30)

- 32 differential checks match all transported arrays, sleep counters, clock and RNG byte for byte.
- Godot integration covers allocation/bounds, painting, reference pouring temperatures, conservation,
  sleep/wake, texture size, reset, single stepping, material selection, brush limits and camera zoom.
- Full browser quick suite: 25 scenes pass. Accounting: 51 checks pass. Cloud-origin weather: 22
  checks pass. The renamed self-contained browser bundle initializes and draws its first frame.
- Before/after browser extraction snapshots and RNG continuation match for both recorded seeds.
- Windows native extension compiles; the real Godot OpenGL scene renders on the Radeon 530.
  Interactive feel still needs the user's playtest. No claim of complete visual or simulation parity.

Local timing sample: Intel Core i7-10510U, Windows x64, Clang 23.1.4 Release, Node 20.15.1;
240 ticks, a water slab initially filling one quarter of the grid, no reset during measurement.
Results include first-run costs and vary with laptop load/temperature; no multithreading yet.

| Implementation | Grid cells | Initial water cells | Mean active grid cells | Mean ms/tick | Worst ms/tick |
| --- | ---: | ---: | ---: | ---: | ---: |
| C++ | 65,536 | 16,384 | 32,358 | 0.64 | 3.30 |
| JavaScript | 65,536 | 16,384 | 32,358 | 5.19 | 70.92 |
| C++ | 1,048,576 | 262,144 | 539,238 | 35.16 | 92.94 |

All three runs conserve water. These timings exclude rendering and every deferred system.
The larger case exceeds a 60-tick/s budget even before those systems are added; it is a scaling
baseline, not a promise of a million fully simulated moving pixels. Reproduce with
`powershell -ExecutionPolicy Bypass -File tools/native.ps1 -Action benchmark`.

Playtest: pour water and honey side by side, dig a gap below a pool, pan/zoom while it flows,
then pause and press N. Expect different viscosities, drainage through the gap, a stable world
under camera movement and one tick per press. Existing ecosystem/weather play remains in the browser.

## Visual fidelity correction

The user's playtest identified that the flat-color transport preview did not preserve the HTML
appearance. Restore the existing visual design rather than designing a new liquid style:

- Generate surface/body/deep colors, opacity and animation speed from the HTML material tables.
- Classify streams, inherited alignment, pool heights and connected-column depth with the HTML
  renderer's rules in a read-only presentation module. Preserve one-pixel wave crests across cells.
- Draw the original wave/highlight, depth, reflection, caustic and material-pattern formulas on
  the GPU; keep visual time independent of simulation time, including while paused.
- Restore the original sky gradient, parallax hill colors, cave backdrop and dirt/stone pixel
  treatment, because liquid transparency depends on the image behind it.
- Keep the simulation unchanged. Full lighting/day-night, charged liquid effects, whirlpools,
  solute tinting and content from the remaining simulation port are separate work.

Validation uses a controlled scene containing 14 liquid types, partial/full surfaces, rising
and falling streams, left/right alignment, stream-to-pool joins, depth and map edges. Native
shape metadata must match JavaScript exactly. Render the same cells with actual HTML draw
functions and Godot at times 0 and 3.25; compare both the entire image and liquid-only pixels.
Acceptance: at least 99.8% within 3/255 per RGB channel and mean channel error below 0.5/255.
The controlled test disables the full world's lighting/ecology, so it is not full-world parity.

Run `tools/native.ps1 -Action test` for transport and integration, and
`tools/native.ps1 -Action visuals` for the real GPU/HTML comparison. Visual controls retain
the HTML constants (8 pixels/cell, 56-pixel depth ramp, 6-row reflections at 0.3 strength,
8-cell caustic reach). Tune the original tables/formulas, not generated palette copies.

Verified on the local Radeon 530: native geometry matches exactly; at least 99.95% of the
163,000+ liquid pixels in each controlled frame are within 3/255 per channel. Mean liquid
channel error is below 0.025/255. Small differences remain around reflections and floating-point
boundaries; this is not a pixel-perfect claim. All 32 transport checks and 23 Godot integration
checks pass. A six-second playable-scene capture runs at approximately 58–60 fps after disabling
the tested windowed OpenGL driver's vsync throttle and applying a 60 fps render limit.
