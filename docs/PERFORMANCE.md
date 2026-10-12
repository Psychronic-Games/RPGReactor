# Runtime performance checks

## Draws thrown away each frame (2026-10-09, runtime 20261009.1)

The owner reported lag spikes and uneven frame pacing on every map, worst on North Haven, on an RTX 5070 with a Ryzen 9 9950X3D and a 180 Hz monitor. The frame was bound by the main thread, not the GPU: standing in North Haven's village square, with no water in sight, the scene was drawn three more times a frame for its lakes' mirror pictures, and every piece chunk a second time for the see-through pass.

| Change | Switch | What it stops |
| --- | --- | --- |
| A water sheet takes a mirror picture only while it has a pixel on screen | `Reactor3D.WaterSight.enabled` (`HOLD`: 30 frames) | A whole draw of the scene per lake whose bounds touch the view, up to four. Asked with an occlusion query round each sheet's draw; in a game only. |
| Mirror pictures at the view's render scale | `Reactor3D.MIRROR_AT_VIEW_SCALE` | Pictures drawn at 1920x1080 for a frame drawn at 1440x810. |
| Only the ghost chunks a see-through corridor crosses are drawn | `Reactor3D.CUT_GHOST_CULL` | Every piece chunk drawn twice (462 ghosts on North Haven; 3 to 11 with a corridor, none without). |
| Light arrays compared in one shared function, one loop per array kind | none | Hundreds of cold closures, 160 KB of number objects a frame. |
| A door's reach asked without making records | none | About 60 KB a frame for 39 doors against every character. |

North Haven, a 45 s walk round a 60-tile square from the fountain (83, 65), 1920x1080, a 60 Hz headless output:

| | Before | After |
| --- | --- | --- |
| RTX 5070, main thread per frame | 12.87 ms | 5.37 ms |
| RTX 5070, frames over 25 ms | 10 (33 ms each) | 0 |
| RTX 5070, standing in the square, tick to composite | 11.2 ms | 5.2 ms |
| RTX 5070, main thread slowed four times | 15.9 fps, median frame 66.7 ms | 41.5 fps, median 16.7 ms |
| Radeon iGPU (weak tier), main thread per frame | 5.62 ms | 4.59 ms |
| Radeon iGPU, GPU median / p95 | 14.5 / 19.1 ms | 14.1 / 17.8 ms |
| Radeon iGPU, main thread slowed four times, standing in the square | 49 to 50 fps, 72 to 87 frames over 25 ms in 8 s | 55 to 59 fps, 9 to 34 |
| Garbage made per frame (RTX walk) | 1,155 KB | 937 KB |

The Reactor Room on the RTX after the changes: 6.42 ms a frame, no long frame in 30 s. The picture was compared with each switch on and off with the game running: the fountain's and the lake's reflections, and a wall seen through at three places (differences were the idle animation and the grass's sway only). Full Node suite: **6,743 tests; 6,733 passed, 10 skipped, zero failed** (127.9 s).

Still open, measured:

- **The weak tier is GPU-bound on North Haven:** 12.1 ms median over an 81-point grid of the map on the Radeon iGPU, about 14 ms in the village, with nothing wasted found: ground 1.4 ms, the party's four models 2.5 ms (one is 149,000 triangles), pieces 3.5 ms. A frame past 16.7 ms is shown for two refreshes; `Reactor3D.adaptiveResolution` is the existing answer and is off by the owner's choice.
- **Refresh rates that 60 does not divide:** the game runs 60 updates a second, and the 3D world is drawn on update frames. At 180 Hz that is every third refresh; at 144 Hz and 100 Hz the updates fall on uneven refreshes (2, 2, 3 at 144), which reads as judder however fast the frame is. Not addressed.
- **The reflection capture** draws a cube face every frame on the full tier: 1.2 ms of main thread on North Haven (about 220 draws).
- **Garbage left:** most is three.js's own render lists and matrix math; `LightVolume.dynamicRegion` recomputes some geometry's bounding box on each walk of the scene (45 KB a frame), and a visible lake's bounds are measured afresh each frame.
- **Arriving on North Haven** (measured before these changes, not again after): the first second holds one frame of 0.5 to 0.85 s (the build) and about a dozen of 50 to 300 ms.

Method: `editor/tests/perf/headless-display.sh` starts a headless display on the real GPUs (the integrated GPU by default, the NVIDIA card with the offload variables it names), and `nw-frame-breakdown.cjs` took `--map=<id>,<x>,<y>`, `--walk-size` and `--throttle`. A whole-frame GPU timer query on the RTX measures the main thread's submission, not GPU work (0.7 ms with the capture off, 12 ms with it on, the same scene): read per-pass sums and the CPU profile there.

## Editor map loading (2026-10-07)

Runtime **20261007.2**: the editor prepares rock geometry using the existing runtime workers while tileset, parallax and material images load together. It waits for every rock chunk before constructing the scene; individual rock/terrain edits still use the same signatures and meshing program. The two most recently visited maps retain CPU arrays within a 64 MiB budget (16 MiB on low-memory hosts), cleared when the project changes. Deleted chunks are removed; concurrent rebuilds share matching jobs and discard obsolete results.

North Haven on a disposable Demo copy (NW.js, RTX 5070, Node suite run separately):

| Map build | Before | After |
| --- | --- | --- |
| First visit | 3.15–3.28 s | 1.99–2.93 s |
| Return after another map | 2.41–2.61 s | 0.39–0.49 s |
| Piece geometry on the main thread | about 2.2 s | about 0.12–0.16 s |

These are map-build timings, not a guarantee of click-to-visible latency. Image uploads and first-time shader compilation add work. The GUI harness lost its WebGL context with both the original rebuild and the optimization, on shared and separate contexts; it therefore did not establish a successful visual or 2D/3D toggle smoke. A subsequent session sandbox change denied the harness's local TCP listener (`EPERM`), preventing further GUI investigation. The North Haven cache holds 44,431,068 bytes in this fixture, with 171 rock meshes prepared before scene construction.

Six functional regression tests cover exact worker/synchronous arrays (positions, UVs, normals and colours), reuse, rock/ground invalidation, deleted rocks, overlapping preparation and undo, worker failure/fallback, map eviction, memory limits and project isolation. Full Node suite: **6,712 tests; 6,702 passed, 10 skipped, zero failed** (131.4 s). Evidence: `/tmp/rr-northhaven-load.cjs`, `/tmp/rr-northhaven-control-results.json`, `/tmp/rr-northhaven-opengl-results.json`, `/tmp/rr-northhaven-final-results.json`, `/tmp/rr-northhaven-full-suite.log`.

## Quality levels (2026-10-09, runtime 20261009.2)

The owner's rule: a game runs well on any hardware, looks good on the weakest and better on the best. Level 0 is the picture as it has always been drawn, and a machine that holds its frame rate never leaves it. `Reactor3D.Quality` (in `runtime/reactor_3d.js`) steps a machine that does not hold it down a level at a time, along what its frames wait for, and never along the other:

| Kind | Level 1 | Level 2 | Level 3 |
| --- | --- | --- | --- |
| GPU (the graphics card) | world drawn at 0.83 of the project's `renderScale` | 0.67 of it, models a level coarser (`pixelError` x2) | shadows off, `pixelError` x3 |
| CPU (the main thread) | no depth-first draw, foliage at 0.65 of its distances and 0.7 of its clumps | foliage at 0.45 and 0.5, shadows off | |
| Either, its levels spent and still a quarter short | the world drawn on every other update: 30 pictures a second under 60 updates | | |

- **What is measured:** the world frames a second of play delivers, against the screen's own refresh (read from the game's quickest frames, so a 50 Hz panel showing 50 is not short). A two-second window short by 12% twice running, or by 40% once, takes a step. The main thread is the cause when its work fills 60% of the frame or 75% of a refresh's budget, the graphics card otherwise. Loading, a window out of focus and the two seconds after a step are not judged.
- **Back up:** only as another map opens, after ten calm seconds, one step; a step that does not hold is not tried again that session.
- **Kept:** the levels a machine settles at are saved with the player's options (`ConfigManager.graphicsAuto`) and start its next session.
- **The player's say:** Options, Graphics: Auto (the default), High, Medium, Low (`ConfigManager.graphicsQuality`; High is level 0, Medium is GPU 1 and CPU 1, Low is GPU 3 and CPU 2). The row appears once the machine has drawn a 3D map. A project whose options plugin builds its own list adds the entry there: the Demo's is in the Visual category. `Window_Options.GRAPHICS_TEXT` holds the words.
- **Switches:** `Reactor3D.Quality.enabled = false` draws level 0 always; `Reactor3D.Quality.reset()` returns the automatic levels to the top.

Measured on the Radeon iGPU (weak tier), North Haven, runtime 20261009.2:

| Case | Without | With |
| --- | --- | --- |
| Main thread slowed four times, the 60-tile walk | 29 to 38 world frames a second, uneven | CPU 1 in 4 s (45 to 52), CPU 2 in 10 s, then a steady 30 at the full picture size |
| The world drawn at full 1080p (a GPU pushed past its budget) | 45 to 50 a second | GPU 1 and GPU 2 within 16 s, then a steady 60 |
| Normal walk, and the RTX 5070 | 60 | 60, level 0 throughout |

What each setting buys there, standing in the square (GPU ms per frame; main thread ms with it slowed four times): the defaults 14.0 and 16.2; scale 0.6, 11.6; scale 0.5, 9.6; shadows off, 13.0; no depth-first draw, 14.9 and 14.1; thinner foliage, 13.8 and 14.9; the light at an eighth, 14.0 (nothing). High, Medium and Low were looked at side by side on the weak tier: Medium is a little softer, Low softer and without shadows, both clean.

Not covered: a Classic battle's room is not measured (it keeps the levels the map left), and a 2D map has nothing to step.

### Game speed below 60 frames a second

`SceneManager.determineRepeatNumber` rounded the smoothed frame interval to a whole number of updates, which is one update a frame all the way from 60 down to 40 frames a second: a machine at 45 ran the game at three quarters of its speed. It now adds the time up and makes the updates as they come due (up to four a frame), with one a frame kept for a screen within 3% of 60 Hz. `SceneManager.trueSpeed = false` rounds as before.

| Frames a second | 180 to 62 | 60 | 55 | 50 | 45 | 40 | 30 | 24 | 20 | 15 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Updates a second, before | 60 (62 at 62) | 60 | 55 | 50 | 45 | 72 | 60 | 48 | 40 | 30 | 20 |
| Updates a second, now | 60 | 60 | 60 | 60 | 60 | 60 | 60 | 60 | 60 | 60 | 40 |

Live on the weak tier, the party walking North Haven (tiles a second; 3.73 on an unslowed machine): main thread slowed four times 3.11 before and 3.67 now; slowed six times 2.49 and 3.67. A 60 Hz screen with its frames 6% off never gets a frame with no update or two. A 50 Hz screen now plays at full speed (six updates in five frames) where it played at five sixths.

## Quality settings

The levels above move a few of these; all remain engine defaults a script call or plugin can change at any time. Figures: Intel UHD 630, 1080p, the Demo's start map, frozen GPU frame unless noted (runtime 20260930.9).

| Setting | Default | What it trades | Measured |
| --- | --- | --- | --- |
| `Reactor3D.renderScale` | 0.75 | The 3D is drawn at this fraction of the screen each way and enlarged. The saving is the pixels not drawn (0.75 draws 56% of them); fine texture softens a little. 1 = native. | native 11.2 ms, 0.75 9.3 ms; walking about 100 → 117 fps |
| `Reactor3D.SharpUpscale.mode` | `"cas"` | How the smaller picture is enlarged: `"crisp"` keeps each pixel flat with a hard, slightly stepped edge; `"cas"` filters and sharpens within each pixel's neighbours (softer, no steps). `enabled = false` lets PIXI enlarge it pixel for pixel (blocky). | crisp 9.3, cas 9.4, PIXI nearest 8.3 ms |
| `Reactor3D.SharpUpscale.sharpness` | 0.5 | 0–1. Crisp: how hard the edge blend is (1: half a screen pixel). CAS: how strongly it sharpens. | no cost difference |
| `Reactor3D.HalfLight.SCALE` | 0.25 | The size the lighting and shadows are worked out at, each way, before being filtered up. Surfaces keep their full detail; only the light is coarser. 0.125 and below put light rims on models against much brighter or darker ground. `enabled = false` lights every pixel (the old way). | full 20.3, 1/4 10.6, 1/8 9.9, 1/16 9.8 ms (three places, before `renderScale`) |
| `Reactor3D.HalfLight.matchSurfaces` | true | The small light is filtered up from the samples on each pixel's own surface, and a pixel with none (a rim, a thin part) is lit at full size. `false` filters plainly: a blocky rim of the ground's light on models. `PLAIN_SPREAD` (0.02) lets pixels whose four samples agree skip the depth read; `exactEdges = false` drops the full-size fallback. | harness iGPU, 0.75 of 1080p: combine 0.48 → 1.1 ms; pixels 24+ levels off full-size light 9,139 → 538 |
| `Reactor3D.HalfHaze.SCALE` | 0.25 | The size the lights' haze (cones, balls) is drawn at. `enabled = false` draws it full size. | 3.8 → about 0.8 ms for eleven cones |
| `Reactor3D.GeometryDetail.pixelError` | 1 | How far, in screen pixels, a simplified model may stray from the full one before the finer level is drawn. | 0.35 → 1: 0.85 ms, single texels moved |
| `Reactor3D.SHADOWS`, `Reactor3D.SHADOW_QUALITY` | `"auto"`, weak/full tiers | Shadow rows, their size and filtering. The tier is picked from the GPU. | rows about 1.3 ms walking |
| `Reactor3D.LightVolume.dynamicEnabled` | true | Moving lights baked once a frame instead of per pixel. Evens out on average, saves up to 3.5 ms where many swing across the view. | |
| `Reactor3D.FOLIAGE_LOD` | full: near 22, far 64, scale 1; weak: near 12, far 38, scale 0.5 | Grass, flowers, ferns and reeds: tiles from the eye where the field starts to thin and where it is gone, and the share drawn at all. Chunks past `far` are not drawn; the blades are drawn before the ground (whatever they hide is never shaded) and stay out of reflections. | harness iGPU (weak tier), North Haven with about 100,000 clumps painted, 3D update with `gl.finish`: +0.2 to +1 ms across meadow, cliff, wide and high views (runtime 20261002.6 + foliage) |
| `Reactor3D.adaptiveResolution` | false | Let the scale fall when frames run long and climb back when calm. Off: a scale that moves reads as the picture changing under the player. | |

A menu would most naturally offer presets over these (for example Low: renderScale 0.6, lighting 1/8; Medium: 0.75, 1/4; High: 1, 1/4; Ultra: 1 with `HalfLight` and `HalfHaze` off and pixelError 0.35), saved per player with the other options.

## Editor memory

Editor previews hold only what they show. A model loaded to draw a thumbnail is released as soon as the picture exists, and the thumbnail renderer is dropped with its WebGL context four seconds after its last use. The 3D Models page keeps the model on screen and the one before it; closing the page releases every model and both renderers. The 3D map view frees its models' graphics-card copies before its renderer is disposed, because a renderer's own dispose leaves them behind on the context it shares with the 2D view. On North Haven (video memory / ArrayBuffers, MB): closing the Database after eight previews ended at 804, 978, 975 / 323, 351, 351 over three rounds before and 502, 475, 477 / 207, 219, 219 after; three 2D/3D toggles went 1103, 1179, 1256 before and 471, 484, 482 after. Still open: switching maps keeps every model for the project (a release on map change left copies held and is off: `MapEditor3D.SWEEP_MODELS_ON_MAP_CHANGE`), and the builder's 50-step undo can hold about 97 MB on North Haven. Measure with `scratchpad/memory/ed-mem.cjs <out> 5 --loops`: three rounds of each open-and-close loop should end where the first ended.

## Battle start on the map (runtime 20261003.29, weak tier, 1080p, one window)

What a battle can play is readied with the map: each unit's and party member's sequences, pictures, effects and projectile models (one action a frame, once a session), a collision footprint for every size a model stands at, every model's bounds, and the Tactical HUD (hidden until the battle takes it, made again a second after a battle ends). Units that join a running battle are built inside 4 ms a frame (`Reactor3D.ModelJoins.BUDGET`), and carried weapons are taken up one unit a frame.

First five seconds, frames over 33 / 50 / 66 ms and the worst frame; "4x" is with the CPU throttled four times (`Emulation.setCPUThrottlingRate`), the nearer picture of a low-end PC:

| Battle | Before | After | 4x before | 4x after |
| --- | --- | --- | --- | --- |
| Tactical raid, 11 units | 50/5/1, 68 ms | 60/10/0, 65 | 98/24/13, 300 | 69 to 100/11 to 14/7 to 8, 141 to 165 |
| Raid, second start | 53/9/0, 57 | 49/3/0, 55 | 89/7/3, 104 | 31 to 89/5 to 6/2, 96 to 102 |
| Action skirmish | 17/2/0, 66 | 19/0/0, 49 | 33 to 79/8 to 12/7 to 8, 232 | 83 to 101/10 to 11/6, 212 to 218 |
| First Person | 29/4/0, 65 | 15/0/0, 44 | 50/9/6, 274 | 58 to 81/10/6, 151 |
| Army drill, 43 units | 46/11/2, 92 | 22/2/0, 60 | 72/56/35, 264 | 78/63/33, 161 |
| 2D Deck Drill | 1/0/0, 37 | 1/0/0, 46 | 12/8/7, 123 | 14/7/6, 205 |

Unthrottled, no CPU hitch is left at a raid's start: the remaining long frames are GPU wait (the tactical view is GPU-bound at about 22 ms a frame here). Throttled, the worst frames are the fight's first frame (turn order, `Game_Fight.start`, unit model builds), one grip solve a frame (30 to 40 ms each), the HUD's first uploads and portrait painting. New shader programs still compile at a battle's start (7 for the raid, 5 for Action, 33 for the army after its Transfer Player rebuilds the scene). Measure with `scratchpad/perf/battle-perf.cjs <out> begin` (`MENU=0..4`, `THROTTLE=4`, `SECOND=1`, `PROF=start`, `NOCHECK=1` for a shipped game's shader checks).

## Memory (runtime 20261003.27 to .30, weak tier, 1080p)

Since .30 a model stays loaded while the map being played, a battle on it, its encounters or its events name it. When another map opens, unclaimed models are released; the newest stay while they fit 96 MB (32 MB on low-memory machines). `Reactor3D.ModelUse.enabled = false` keeps every model for the session. A model's embedded pictures are decoded once (the GLB worker decoded and dropped them, and the main thread decoded them again). North Haven straight from the title now takes about 1.4 GB of process memory (1.3 GB on a low-memory machine; 1.9 GB before today) plus 0.6 to 0.8 GB of video memory, and plays with a battle inside a 1.6 GB limit on the low tier; at 1.5 GB it loads and walks and is killed when a battle starts. Arriving through the Reactor Room still needs 2 GB: that room's pictures are each held as a decoded image, a canvas and a texture, and one 2400x2400 wall picture is uploaded three times.

Since .31 a picture used by several surfaces (walls, floor, a poster) is uploaded once per sampling (`Reactor3D.ScenePictures`), with no canvas copy; large pictures cost width x height x 4 bytes of video memory (a 4000x2250 poster: 34 MB), and machines reporting 4 GB or less keep them at 2048 on the longest side (`Reactor3D.ScenePictures.LOW_MEMORY_SIZE`). A hidden tile layer builds no 2D atlas. The Reactor Room went from 1,853 to about 1,440 MB of process memory. The Demo walk (title, Static Room, Reactor Room, North Haven, a battle) passes inside 2 GB with no reclaim; inside 1.5 GB it is killed loading North Haven after the Reactor Room. The editor on North Haven in the 3D view takes about 1.75 GB plus 0.7 GB of video memory; its model thumbnails and previews are not yet released (video memory 838 to 1,017 MB over two rounds of previews).

The figures below are from .27.

A 2D game takes about 0.5 GB and runs inside a 1 GB limit. A large 3D map takes 1.6 to 1.8 GB of process memory plus about 0.8 GB of video memory, which is system RAM on integrated graphics. Each 2048 model texture costs 21 MB of video memory; 1024 costs 5 MB. Machines reporting 4 GB or less load model textures at 1024 (`Reactor3D.memoryTier`: `"auto"`, `"low"`, `"normal"`; `Reactor3D.lowMemoryTextureSize`). Music is decoded whole: about 22 MB per minute.

| Stage (all processes, PSS) | MB | Video memory |
| --- | --- | --- |
| Title | 730 | 236 |
| Small 2D map | 1,266 | 436 |
| North Haven, straight from the title | 1,944 before, 1,625 to 1,805 after the cuts | 760 to 811 (619 on the low tier) |
| North Haven, arriving through two other 3D maps | 2,562 | 783 |

Cuts in this revision: a decoded bitmap is closed once its texture is on the GPU (145 to 209 MB; `Reactor3D.ShaderWarmup.releaseImages`), workers end after 8 s idle (`Reactor3D.IdleWorkers.REST_MS`), the 2D tile atlas is made by the first tile drawn (48 MB each side). Inside a hard limit with no swap: North Haven plays in 2 GB (peak 1,958 during the load) and is killed during the load at 1.5 GB; an imported 2003 game peaks at 371 to 497 MB. Largest thing left: `Reactor3D._glbCache` keeps every model and its textures for the session, so each 3D map visited adds to the next (about 620 MB at North Haven after two others). Measure with `scratchpad/memory/mem.cjs` and `limited.sh`.

## World and models on weak graphics (runtime 20261003.26, Ryzen integrated Radeon, 1080p, frozen frames, one window)

| Change | Measured | Picture |
| --- | --- | --- |
| `Reactor3D.DepthFirst` (pieces, floor; the sky tests depth) | isometric 20.69 to 18.42 ms, third person 12.82 to 11.39, first person at the map edge 23.23 to 19.70 | identical (0 channels differ, including the indoor cutaway) |
| `GeometryDetail` shared per model, index lists kept | 43.8 to 22 ms for 40 standing units while levels arrive | same levels |
| A skinned body's distance taken from its joints | 691k to 599k triangles, 22.75 to 21.98 ms | mean 0.18 of a level |
| Model sprites on flat maps take detail levels | Deck Drill 13.46 to 6.0 ms GPU | within `pixelError` |
| Ground edge noise only where paint is part-way | 8 types 2.14 to 1.72 ms (3 types 0.9 ms) | identical |
| Battle models and weapons readied at map load; a weapon measured once per model | tactical start: frames over 50 ms 12 to 8, over 33 ms 59 to 28 | none |

Surroundings cost 0.0 to 0.05 ms out of view; a map-wide glowing foliage layer costs what a plain one does. A profile of the party walking North Haven with weapons shows none of the roof, climbing or held-weapon helpers above 0.1% of the frame. North Haven holds 726 geometries and 67 textures after each of three round trips (no leak): model textures 133 MB, piece buffers 66 MB, piece textures 28 MB, model buffers 23 MB. Still over budget: isometric on North Haven at 18.4 ms GPU (the tank's 20 double-sided meshes are about 3.3 ms of it); battle start still has frames over 50 ms (an effect model loaded by the sequence warm-up, a GPU wait of 16 to 28 ms, the first grip solves).

## Battles on the map (runtime 20261003.24, Ryzen integrated Radeon, 1080p, one window)

| Scene | Frame | CPU | Battle code |
|---|---|---|---|
| Exploring, before any battle | 16.7 ms (capped) | 4.0 | 0 |
| Tactical, 14 units, at rest | 23.8 ms | 7.0 | 0.11 ms |
| Tactical, enemy phase | 28.3 | 8.2 | 0.24, worst 8.1 |
| Action, third person, 8 enemies | 22.4 | 8.2 | 0.64 |
| First Person, 8 enemies | 26.5 | 9.1 | 0.71 |
| Army of 61, at rest / enemy phase | 34.0 / 48.0 | 13.1 / 18.3 | 0.25 / 1.64, worst 20 |
| 2D battle, 11 units | 16.7 (capped) | 4.2 | 0.11 |

The battle's own code is a small share; the frame is the world and the models. A unit's AI thinks within `ReactorFight.AI_BUDGET_MS` (4) a frame, shared by every unit deciding in that frame (three times that above 20 units); its floods and its weighing yield to the clock. Model portraits are fetched from the graphics card without waiting and kept for the session. Battle start still has about ten frames over 50 ms (the worst 90 to 105 ms at raid size, 340 ms for an army): the first carry of each weapon model, a model's first load, new texture uploads and shader compiles. The 2D battle row is with flat-map models sharing their detail levels (20.6 ms before). Measure with `scratchpad/harness-slot.sh -x node scratchpad/perf/battle-perf.cjs <out> tactical|army|action3|action1|drill` (`NODRAIN=1` for frame times, `PROFILE=1`, `ALLOC=1`, `LEAKS=10`).

## Edges and beams — runtime 20260930.12

Harness iGPU (Ryzen 9 9950X3D's Radeon, radeonsi on X11, weak tier since this runtime), 1920×1080, the start map near the Psychronic mascot (37,11) and the start area (24,47). Looks were judged with game updates stopped and the clock running, each variant drawn for a second first; the frozen mode's stopped clock can hold programs a variant never compiled and drew a wrong reference.

| Change | Cost | What it fixed |
| --- | --- | --- |
| The small light's passes stand at the camera (`cameraPosition`) | none | the volume read from the far side of faces: dark floors, bright model faces, in quarter-size blocks |
| Shadows switching on refresh the originals, not the twins | none | start-map floor compiled without the shadow lookup (full-size path only) |
| Light filtered up by surface, full-size at rims | about +0.6 ms | blocky rims of the ground's light on models (24+ level errors 9,139 → 538) |
| Haze filtered up by surface | +0.16 ms | haze bleeding across silhouettes |
| Beams in the pass at full size | negligible | a laser drawn as a row of soft blocks |
| Ryzen APUs on Linux weak tier | −15 ms here | full-tier reflection capture (6.2 ms) and full-detail meshes on a 2-CU iGPU |

Weak tier, start map, GPU per frame: 7.95 ms at the defaults, 9.28 at `renderScale = 1`, 7.58 with `SharpUpscale.mode = "crisp"`.

## Intel UHD 630 pass — runtimes 20260930.2–.6

Laptop: i5-10500H with its integrated Intel UHD 630 forced on (the RTX 3060 idle), 1920×1080, ANGLE/D3D11, weak tier. Tool: `editor/tests/perf/nw-frame-breakdown.cjs` on a disposable Demo copy: `--mode=passes` (GPU per three.js pass and PIXI composite), `--mode=draws` (GPU per draw call, for ranking only), `--mode=spikes` (every long frame with the CPU samples and the GL traffic inside it), `--mode=frozen` (clocks, tickers and videos stopped; the same frame drawn under a timer per variant; pixels compared with the baseline's own noise; variants from a `--setup` script's `window.__rrVariants`). The harness waits for the geometry worker before measuring: until it has simplified the dense models the full geometry is drawn.

Findings that shaped the pass:

- The frame is GPU-bound: the main thread idled for most of every long frame while the GPU ran 40–90 ms. Spikes were GPU back-pressure, not script, GC or shader compiles.
- On a frozen start-map frame the light loop was about 12 ms of 30, but not for its arithmetic: the inlined double shadow lookup slowed every lit pixel (removing its code, with no pixel change, saved 8 ms). Merged, the frame went 29.8 to 23.9 ms. A loop indexed identically across pixels and a depth pre-pass measured no gain; drawing the room's walls as opaque made it slower (they are rejected behind props only as late, transparent draws).
- Of 23 lights on the start map only 6 are unchanged from frame to frame (seven sweeping searchlights, flicker), so caching the summed light across frames does not pay there.
- Remaining weight on that frame: lighting about 11 ms, vertex and fixed work about 11 ms (three 488k-triangle props, 149k-triangle characters), PIXI composite 2 ms.

Walking route (20 s, same start, collision off), before → after this pass (before the merged shadow lookup): median frame 48.7 → 34.7 ms, p95 124.8 → 69 ms, worst 368 → 264 ms, long frames 46 → 30. The changes are listed in the 0.98.9 editor changelog, Performance.

Runtime 20260930.6, the second round (measured with frozen frames drawn back to back, which an integrated GPU needs: timed with gaps between draws it dropped its clock, and the same frame read 12.9 to 20.4 ms):

- Frozen, three places along the walk: 24.8 ms before the round, 11.0 ms after. Walking, 20 s: about 95 to 100 fps (it began the day near 40), the median frame on the 144 Hz display's 7 ms refresh.
- Largest steps: the light at a quarter size from the pass's depth (`HalfLight`; in the view with the most lights 23.1 → 12.5 ms); the haze at a quarter size (`HalfHaze`, 3.8 → about 0.8 ms); an opaque game canvas (the browser's blend of an alpha canvas pushed most frames past the refresh: 91 → 101 fps); distance levels at a pixel of error (0.85 ms); the moving lights' bake on a one-tile grid.
- Where the remaining frame goes (live, per pass): the unlit surfaces about 5 ms (757k triangles, 83 draws; the three dense props alone 1.2 ms of vertex work), PIXI's composite 1.3 ms, the combine 1 ms, the shadow rows 1.3 ms, surfaces lit as before (49 reflective meshes, 328k triangles) 1.1 ms, the light pass 0.8 ms. At a quarter of the resolution the frame still costs about 5 ms: 144 fps at 1080p on this GPU needs the fixed costs cut as well as the pixels.
- Fixed on the way: the light volume's bakes were refused by the driver whenever PIXI had drawn since three (a shadow sampler met PIXI's texture), so some earlier volume measurements included lights that were not being drawn; the figures above are after the fix.

Later the same day (runtimes 20260930.3–.5), the light volume and loading:

- Baked light volume: still, flickering and pulsing lights read from half-tile 3D textures (15 of 23 on the start map); moving lights without their own shadow row are gathered once a frame into a view atlas. Frozen: 8.3 ms saved by the baked lights; walking, 20 s: 699/703 → 755/778 frames, GPU median about 23 ms, p95 41 → 33 ms. The frame is still GPU-bound at about 40 FPS on this GPU; the per-pixel cost left is the texture shading every pixel pays (about 6 ms at 1080p), the party's sharp shadows, and vertex work on dense models.
- Loading: shader compiles on the driver's threads with meshes shown when ready, pictures decoded in a worker and uploaded under a budget. Fresh profile, New Game, 15 s: 298 → 453 frames, worst frame 2.4 → 0.62 s. Left: Effekseer's WebAssembly start (0.3–0.6 s once) and single large texture uploads (about 70 ms each).
