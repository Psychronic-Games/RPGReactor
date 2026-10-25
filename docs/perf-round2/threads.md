# threads agent: checkpoint 2026-10-14 (paused for the night)

Weak-tier numbers come from the Radeon iGPU on a headless KWin display. "t4" means CDP CPU throttle 4x. That throttle slows only the page's main thread: a worker's draw time was the same throttled as unthrottled (about 2 ms), so throttled numbers favor work moved to a worker.

## Done

### 1. Workers for non-render work: the hull worker (shipped in runtime, switch `ReactorFight.Action.HullWorker.enabled`)
- Cause: `A.buildHull` in `runtime/reactor_fight_action.js` (`A.hullOf`, then `measure`, then `A.props`) reads every triangle of a model on the main thread the first time the battle needs a line of sight. On North Haven that is one 323 to 341 ms frame in Tactical (AI.think, then G.sight) and in Action (takeAim). The models involved were the Consul, the Ninja H2, Carol, and the Tree-01 and Tree-02 poses.
- Change: `A.HullWorker` takes a snapshot of the model's meshes (positions, index, skin, matrices; one copy each, sent as transferred buffers) and posts it to a blob worker. The worker runs `importScripts(three.js)` plus the same `buildHull` source, stringified, against a rebuilt template. Until a hull comes back, `A.hullOf` returns `A.HULL_PENDING`: the body counts by its footprint, and `A.hullEpoch` makes everything measure again once the hull arrives. Hulls are asked for at battle start (`A.measureAll` in the start wrapper). A Tactical `AI.think` waits while any hull is pending (`reactor_fight_tactical.js`, 2 lines), so its decisions match the old synchronous ones. After `WAIT_MS` (4000) the hull is built on the main thread. If a plugin replaces `A.buildHull`, the work stays on the main thread (`HullWorker.kernel`). Morph targets, instanced or batched meshes, lines, or no Worker support also fall back to the main thread. The worker rests through `Reactor3D.IdleWorkers`.
- Sameness: the worker's output matched the main thread's to the bit for all 13 Demo templates in NW (`results/hulldbg`) and in the node tests. Snapshot cost on the main thread was 0.1 to 1.1 ms per model, against 3 to 78 ms per model before.
- Numbers (medians of 3 alternated A/B runs, North Haven, Tactical with Troop 8 and the map's raiders, about 10 units, 30 s):
  - Tactical, unthrottled: worst frame 337 to 66 ms; sd 8.6 to 4.8; Game_Fight.update max 340 to 11 ms.
  - Tactical, t4: worst frame 1368 to 336 ms; sd 55.9 to 22.0; tick max 1370 to 161 ms.
  - Action, unthrottled (20 s): worst frame 383 to 67 ms; sd 10.9 to 2.1; p99 23.7 to 21.3.
  - Action, t4: worst frame 1567 to 348 ms; sd 87 to 25.
  - The remaining worst frames come from battle start itself, render, and shader links, not from hulls (`results/tac-after-prof`).

### Measured and left alone (item 1)
- Save: 148 KB of JSON; stringify 0.8 ms and deflate 1.8 ms (3 and 4.6 ms at t4); a whole save takes 5 ms, or 11 ms at t4. A worker round trip would cost about as much.
- Neighbor map JSON parse (`N.make`): 37 ms at t4 per neighbor, done twice. A structured clone back from a worker costs about the same as `JSON.parse`, so there is nothing to gain.
- Physics: about 4% of main-thread time during long frames. It is interleaved with each character's update, so it cannot move off the thread alone.
- Remaining in-play spikes on North Haven (t4, 45 s settle, walk and two crossings). These are candidates for the same snapshot-to-worker pattern:
  - `N.addBody`, the neighbor MapScene build: 110 to 210 ms per neighbor at t4, 57 ms unthrottled. Most of it is `addRoom` ground geometry (`Geometry.build`, `computeVertexNormals`), `groundLayers` `getImageData`, and `addSurround`.
  - `N.mask` (`buildModelCollisionMask`): 716 ms over 100 slices, up to 18 ms each. It has the same structure as the hull, but it lives in `reactor_3d_models.js`, which the models-textures agent owns. It needs that function split into a grid kernel and the mask closures.
  - Foliage chunk meshing: 853 ms over 174 slices, about 5 ms each at t4, up to 25 ms.
  - ModelJoins finger weights: owned by models-textures.

### 2. SharedArrayBuffer (report only, no code change)
- NW.js 0.107 (Chrome 144), game origin `chrome-extension://`: `SharedArrayBuffer` exists, is shared with a worker (test value read back as 42), and `Atomics` works. `crossOriginIsolated` is false and not needed. The editor runs on the same NW with no extra flags.
- In a worker: `OffscreenCanvas` with WebGL2 works, and `transferControlToOffscreen` works.
- Web export: plain builds have no service worker and no COOP/COEP, so no SAB. Packed builds have `pack-worker.js`, which sets no headers. itch.io's SharedArrayBuffer checkbox supplies the headers. Nothing measured copies enough to need SAB (the hull snapshot is about 1 ms), so it stays unused and any future use needs a non-SAB fallback.

### 3. Render-thread prototype (works; not wired into anything)
- Files: `editor/tests/perf/render-thread/RR_RenderThread.js` (main thread side; `Reactor3D.RenderThread.enabled` is false) and `RR_RenderWorker.js` (the worker). A harness copies them into a disposable copy's `js/plugins` and loads them at the title screen.
- The worker loads three.js and every `reactor_3d*.js` with `importScripts` (the 3D runtime loads cleanly without a DOM). It shims document (OffscreenCanvas), Graphics, an ImageManager that fetches and decodes in the worker, and stand-ins for $gameMap and $gamePlayer. It builds the runtime's own `MapScene` from a structured clone of `$dataMap` (posting the map costs 5 to 6 ms once) and draws it through `Viewport.renderPass` on its canvas.
- Each refresh the main thread posts the camera, frame, tile animation frame, character positions, and the collected lights and ambient. That costs 0.13 ms (0.5 ms at t4). The posts go through `drawReactor3D` and `updateReactor3D` overrides, so they also follow Graphics.FramePacing.
- Pixels: `results/rt-msg/shot.png` shows North Haven with water reflections and dusk ambient, the Show Text window composited above it, and characters as yellow stand-in posts.
- The game canvas needs an alpha channel: PIXI is created with `backgroundAlpha: 1` (opaque context). The harness patches the copy's `reactor_core.js` (`run-rt.sh`, RT_TRANSPARENT=1).
- Main-thread busy time per frame, from the profile, North Haven walking a square, 15 s, medians of 3:
  - Unthrottled: today 5.38 ms; worker 2.67 ms (models still synced on main); nosync 2.32 ms.
  - t4: today 26.8 ms (frame median 30.1, p95 38.2, sd 9.3); worker 9.45 ms (frame median 16.7, p95 17.3, sd 2.5); nosync 7.8 ms.
  - The worker drew in 1.6 to 2.0 ms a frame. That is not comparable to today, because it draws no models, no shadow maps, and no render-scale upscale.
- Found and fixed in the prototype: when the worker drew on its own rAF, 2 of 3 runs had about 48 frames of 33 ms (p95 33.6). Drawing as each post arrives (`immediate`) removed them: 3 of 3 runs at p95 17.3 to 17.4, sd 0.4 to 0.7 (`iso2.log`). `noDraw` and pacing-off runs isolate the cause to the worker's rAF draw (`iso.log`). A transparent game canvas alone showed no 60 Hz stalls here. The core comment in `_createPixiApp` records a cost of 91 vs 101 fps at 144 Hz on an iGPU, which still needs checking on real hardware.

## In progress / exact state
- `RR_RenderWorker.js` supports `immediate` (draw on message), but the default is still the rAF path: `RT.immediate` is false. The next edit is to make immediate the default. All three runs with immediate were clean.
- Nothing is half-applied. The runtime edits are complete and tested. My NW, chromedriver and display processes are stopped, and the project copies and runtime-before/after copies are removed.

## Next steps (in order)
1. (`RT.immediate` is now true by default, 2026-10-15.) Rerun the today/thread/nosync A/B (rtab.sh), unthrottled and t4.
2. Report the prototype's gaps with estimates:
   - Character and prop models: a worker-side game-object mirror built from reactor_objects plus a per-frame field diff, and GLB loading in the worker. 2 to 3 weeks; plugins that override character methods need per-plugin work.
   - Effekseer: 1 to 2 weeks, risky.
   - Below/above pass sandwich with 2D sprites and plugin tilemap layers: a third canvas, 3 to 5 days.
   - Tone, flash, fog and blend-mode overlays over the world: about 1 week; plugin fogs are not fixable in general.
   - Snapshots and save thumbnails: the worker returns an ImageBitmap; snap is synchronous. 3 days.
   - Battle rooms: keep the main-thread path while in Scene_Battle. 2 to 3 days.
   - Context loss in the worker: 2 days.
   - Game logic in the 3D update (doors in updateRipples feed passability, Neighbors readiness, raycasts and picking, cutaway): 1 to 2 weeks.
   - Parity of the shared-context path (render scale 0.75 with SharpUpscale, shadows): 2 to 3 days.
   - Not building the main-thread scene (memory): 1 to 2 days.
   - Measuring the cost of the transparent game canvas on the iGPU at 144 Hz.
   - Rough total: 2 to 3 months for production quality.
3. Optional: an A/B crossing run (`cross.js`) to confirm the hull change leaves North Haven play unaffected. It should be unaffected: hulls are only used in battles.
4. Final report.

## Files changed
- `runtime/reactor_fight_action.js`: `A.HullWorker`, async `A.hullOf`, `A.HULL_PENDING`, `A.hullEpoch`, `A.hullsPending`, `A.measureAll`; `measure` and `sizeOf` measure again on the epoch; `HullWorker.kernel` is set after `buildHull`; `measureAll` is called in the start wrapper.
- `runtime/reactor_fight_tactical.js`: two lines at the top of `AI.think` (wait while hulls are pending).
- New: `editor/tests/hull-worker.test.cjs`.
- New: `editor/tests/perf/render-thread/RR_RenderThread.js` and `RR_RenderWorker.js` (prototype, loaded by nothing).

## Tests
- `editor/tests/hull-worker.test.cjs` (11 tests) passes. It covers:
  - bit-sameness on boxes and nested groups, quantized interleaved positions, and a posed skinned mesh, each by triangles and dense;
  - morph-target and Line fallbacks;
  - pending, then landing, then the epoch; switch off;
  - the WAIT_MS fallback;
  - a plugin override staying on the main thread;
  - Tactical think waiting.
- `fight-action-world.test.cjs` passes.
- In the 29-file fight, tactical and vehicle run (`scripts/tests.log`), two tests fail, neither from my change:
  - `runtime-events.test.cjs`: template/Demo/js/reactor_core.js no longer matches runtime/. The lead's sync fixes it.
  - `tactical-view.test.cjs:454`: `events[i].isStarting is not a function`. This comes from another agent's edit to `F.anyEventStarting` in `reactor_fight.js`, which now walks `$gameMap.events()`; the test's stub events lack `isStarting`.
- Note: `git status` shows modified Demo GLBs under template/Demo/3d. They are not mine (my copy held its own 3d/; only audio, effects, fonts, icon, img and movies were symlinked). They are probably from the models-textures agent.

## Draft changelog lines
- Editor changelog: **Battle line-of-sight hulls are measured off the main thread.** `ReactorFight.Action.HullWorker` runs `buildHull` in a worker on a copy of the model's meshes, with bit-identical output. Until a hull arrives, the model counts by its footprint, and Tactical AI waits for pending hulls (`hullsPending`). Turn it off with `ReactorFight.Action.HullWorker.enabled = false`. The first line of sight in a North Haven battle dropped from 340 ms to 66 ms (1.37 s to 336 ms at 4x CPU throttle).
- User changelog: Tactical and Action battles no longer freeze for a moment the first time a unit looks past a vehicle, tree or character.

## Evidence and scripts
Copied to `perf-round2-checkpoint/threads-evidence/`:
- `scripts/`:
  - `probe.cjs`: NW harness with profile windows, screenshots, and PROBE_ARGS.
  - `run.sh`, `run-rt.sh` (RT_TRANSPARENT), `ab.sh` with `abstats.cjs`, `rtab.sh`, `iso.sh`, `iso2.sh`.
  - Measurement scripts: `cross.js`, `tactical.js`, `rt.js`, `save.js`, `sab.js`, `hulldbg.js`.
  - Logs: `ab-battles.log`, `rtab.log` (invalid: before the `drawReactor3D` split was handled), `rtb.log`, `iso.log`, `iso2.log`, `tests.log`.
- `results/<run>/`: `probe.json`, `log.txt`, and `shot.png` where taken. Key runs:
  - `cross-base-t4-2`: North Haven spikes.
  - `tac-*`, `tact4-*`, `act-*`, `actt4-*`: battle A/B.
  - `hulldbg`: bit-sameness in NW.
  - `rtb-*`, `rtbt4-*`: render thread.
  - `rt-msg/shot.png`: the prototype picture.

To rerun: recreate a disposable Demo copy in scratchpad/threads/Demo (copy everything except audio, effects, fonts, icon, img and movies, which are symlinked), start `editor/tests/perf/headless-display.sh` writing to display.txt, then use `run.sh` or `run-rt.sh`.
