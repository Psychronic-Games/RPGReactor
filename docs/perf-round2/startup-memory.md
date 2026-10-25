# startup-memory checkpoint (2026-10-14, paused for the night)

## First-pass report (condensed)

All measurements: own headless KWin display, flock /tmp/rr-perf.lock, Demo copy, Radeon iGPU, unthrottled unless marked.

1. **Discrete GPU and blocklist: DONE.**
   - Chromium 144 source: the Windows switch is spelled `--force-high-performance-gpu` (hyphens). `powerPreference` does nothing on Windows by default (only dual-GPU Macs). A blocklisted GPU falls back to software WARP on Windows; on Linux and Mac it gets no WebGL without `--enable-unsafe-swiftshader`.
   - Change: game manifests get `--force-high-performance-gpu --ignore-gpu-blocklist`, after the project's own arguments. They are added for new projects, template copies, on project open (`refreshReactorRuntime`) and on playtest launch (`ensureProjectPackageMetadata`). The rest of `package.json` is kept byte for byte (indentation, BOM). The editor's `package.json` has both. Game and editor WebGL contexts request `high-performance` (`Graphics.gpuPowerPreference`).
   - Opt-out: `"reactorHighPerformanceGpu": false` in the game manifest removes them.
   - Verified: the GPU process command line carried `--force_high_performance_gpu`; the contexts report `high-performance`.
2. **Boot time: measured, no runtime change.**
   - Parallel Effekseer was built and A/B tested: no gain (title at about 355 ms unthrottled and 800–890 ms at 4x throttle either way), so it was reverted.
   - The V8 code cache already works (149 entries).
   - Dropping the 3D and fight files saves 0–10 ms unthrottled and about 30 ms at 4x, 0–8 MB heap: not worth the load-order risk.
   - `nw-game-profile.cjs` now reports `boot` (loadMs, scene start times, titleMs) and `mapMs`.
3. **Shader cache: tool done, precompile not done.**
   - `--profile-dir` added to `nw-frame-breakdown.cjs` and `nw-game-profile.cjs`.
   - North Haven arrival, Mesa cache off, 3 pairs, medians: cold link waits 541 ms, worst frame 399 ms; warm 128 ms and 139 ms. All of it falls in the loading wait.
4. **Editor memory.**
   - Leak fixed: editor 3D rebuilds and map changes left old scenes' models in `Reactor3D.Shadows` lists, about 31 MB per rebuild (1882 → 2508 MB PSS over 20 rebuilds; flat after the fix). Fix: `Shadows.forgetScene`, called in `MapEditor3D.clearScene` and `MapScene.destroy`. The game was unaffected (identical caster counts across transfers).
   - `SWEEP_MODELS_ON_MAP_CHANGE` is now true (it was off because of that leak).
   - Playtest park: `MapEditor3D.PARK_AFTER_MS` = 5000 (0 disables). First park on North Haven: GPU 631 → 276 MB, PSS about −300 MB; rebuilds in about 400 ms on return. Later parks in a session freed less (Mesa caching).
   - Translations were not split: about 25 MB heap and 30–60 ms of startup.
5. **Music: not changed.** The `<audio>` route can't keep LOOPSTART/LOOPLENGTH loops seamless; whole decode is about 63 MB per 3-minute track.

## Follow-ups

### A. Reactor Room 3.1 GB in the editor: IN PROGRESS

**Finding:** this is not WebGL objects. A prototype hook counting every WebGL allocation (`glacct.js`) found only about 384 MB on map 1. The cost is the effect media on the props:

| Map 1 in the editor | GPU memory |
|---|---|
| Effect media as before | ~3,070–3,120 MB |
| Shared videos (new) | ~2,455–2,480 MB |
| No video planes | 523 MB |
| No video planes, no Effekseer layers | 473 MB |
| North Haven, for comparison | ~640 MB |

- The props carry "Animated Screen" (RPGReactor-Computer-Console-Interface.mp4, 1104x816) and "Static Video" (static.mp4, 1280x720) effects. That is 11 video planes, and the editor 3D view made a separate `<video>` element and VideoTexture for each: 10 decoders. The game's media-surfaces manager already shares one video per file (`_sharedVideos`); the editor did not.
- **Applied (complete, consistent):**
  - `_videoEffectPlane` shares one video or picture plus one texture per (file, loop) within a 3D view instance (`this._effectMedia`). Calls on `MapEditor3D.prototype` (the 2D model preview) still get a copy per plane.
  - New `static releaseEffectPlane(plane)` with a refcount. `disposeEffectPlays` uses it.
  - Switch: `MapEditor3D.SHARE_EFFECT_MEDIA = true`.
  - Result: 10 videos → 2. GPU 3123 → 2455 MB (−668 MB), PSS −186 MB.
- **Open question:** 2 shared videos still cost about 1.95 GB over the no-video case. It looks like a big fixed cost per decoder, not per frame (likely the VA-API decode surface pool on Linux). Next, check whether one video alone costs about 1 GB. Options to test:
  - pause videos that are off screen or far away;
  - force software decode for small clips (if NW exposes a switch);
  - draw frames into a canvas instead of keeping a hardware decoder.

  Windows decode memory will differ: the owner should check Task Manager's GPU memory on the RTX laptop.
- **Not yet done:**
  - Compare with the game on map 1 at the weak and 2048 tiers (the game shares videos; need to know if the decoder cost is the same).
  - Check the editor against the game's caps (weakTextureSize, GlbCompact, dropUnsampledImages, banded uploads). The WebGL objects at 248–384 MB are already small: the largest are four 2400² and one 2600² storage2d textures of 22–34 MB each (room floor and walls, model sheets). Check those against the cap.
  - The 2D model preview (ModelPropEffects2D, used when 3D is off) still makes one video per plane. Turning 3D off on map 1 went back to about 2.97 GB. Sharing there needs a refcounted play/pause, because a hidden plane pauses its own video.
  - Room-Rings is no longer in `template/Demo/3d/Map-Objects` (not present in the copy), so its cost wasn't measured.
- **No test yet for the sharing:** add one to `editor/tests/editor-memory-release.test.cjs` covering the refcount release, the prototype path not sharing, and `SHARE_EFFECT_MEDIA` false.

### B. 2D map GPU data while 3D is up (140–180 MB): NOT STARTED (diagnosis only)

- PIXI v8 `GCSystem` (`renderer.gc`, `gcMaxUnusedTime` 60 s, `gcFrequency` 30 s) runs only in `postrender`. With the 3D view up, PIXI never renders, so the 2D map's GPU data is never collected.
- After 60 s or more in 3D, a single `app.render()` freed about 140–180 MB (seen while parked).
- Calling `gc.run()` alone does not free it: renderables count as used whenever `renderGroup.gcTick === instructionSet.gcTick`.
- Ideas:
  - when 3D takes over, unload the tilemap's textures and its render group's GPU data explicitly, or do a PIXI render after 60 s followed by a three clear;
  - measure the hitch when 2D comes back with nw tooling, by toggling 3D off and timing the first 2D frame.

## Next steps, in order

State 2026-10-15 (Windows session, code and Node tests only, no NW launched):

- DONE, tested: the sharing test (A). `editor-memory-release` covers the refcount, the prototype path and `SHARE_EFFECT_MEDIA` false. It found a bug, now fixed: releasing one plane twice freed the video another plane still showed. `releaseEffectPlane` now clears the plane's media references first.
- DONE, tested: the 2D model preview shares video (`ModelPropEffects2D.SHARE_VIDEO`, on). `_videoEffectPlane` is called with the preview as owner. `showVideo` counts the shown planes per video: a video plays while any of them shows and pauses with the last one hidden. `dispose` goes through `releaseEffectPlane`. Tests are in `model-prop-effects-2d`.
- DONE, tested, NOT MEASURED: follow-up B (`MapEditor3D.RELEASE_2D_GRAPHICS`, on).
  - `release2DGraphics` runs PIXI's collector once with `maxUnusedTime` 0 when 3D takes over (both context strategies, while PIXI still owns the context).
  - `park` skips its PIXI draw after that release, because the draw would only upload the map again.
  - Not freed: pooled layer caches (`cacheAsTexture(false)` returns them to TexturePool) and textures that are not auto-collected (tile sheets).
- Remaining, in order (all need NW on the Linux machine):
  1. Measure B: North Haven and map 1 in the editor, 3D on, GPU memory (fdinfo) and PSS 5 s after the switch, `RELEASE_2D_GRAPHICS` true vs false (expect about 140-180 MB less). Then the return hitch: toggle 3D off and time the first 2D frame plus the `renderMap` timeout frame (teardown draws once before `renderMap` rebuilds the map), true vs false, medians of 3, also at `--throttle=4`.
  2. Measure the 2D preview sharing: map 1 with 3D off, before about 2.97 GB. Expect it near the 3D view's ~2.46 GB. Pan so one screen leaves the view while another of the same clip stays: the video keeps playing.
  3. Single-video cost check on map 1 (hook keeping one plane). Then decide between pausing off-screen video planes in the editor and software decode.
  4. Game on map 1, weak and 2048 tiers (`nw-game-profile` with fdinfo GPU memory), against the editor.
  5. Item 3 precompile stays not done unless asked.
- Windows owner check: Task Manager GPU memory on Reactor Room, 3D on and off.

## Files changed (mine)

- **Runtime:**
  - `runtime/reactor_core.js`: `Graphics.gpuPowerPreference`, used by the PIXI v8 and v5-7 inits and the Effekseer overlay.
  - `runtime/reactor_3d_lighting.js`: `Shadows.forgetScene`.
  - `runtime/reactor_3d.js`: `MapScene.destroy` calls `forgetScene` before `clear()`.
- **Editor:**
  - `editor/src/ProjectManager.js`: `GPU_CHROMIUM_ARGS`, `applyGpuChromiumArgs`, `ensureGpuChromiumArgs`, starter package, template copy, refresh, playtest.
  - `editor/src/ProjectController.js`: `powerPreference`.
  - `editor/src/MapEditor3D.js`:
    - `powerPreference` on the separate path;
    - `PARK_AFTER_MS`, `parkForPlaytest`, `park`, `unpark`, `unbindGraphics`, and the loop change;
    - `clearScene` forgets the scene's casters;
    - `SWEEP_MODELS_ON_MAP_CHANGE = true`;
    - `SHARE_EFFECT_MEDIA`, `_videoEffectPlane` sharing, `releaseEffectPlane`;
    - `disposeEffectPlays` uses the release.
  - `editor/package.json`: the GPU switches.
  - `editor/tests/perf/nw-game-profile.cjs`: boot timing and `--profile-dir`.
  - `editor/tests/perf/nw-frame-breakdown.cjs`: `--profile-dir`.
- **Tests:**
  - New: `editor/tests/gpu-switches.test.cjs`, `editor/tests/editor-memory-release.test.cjs`.
  - Updated regexes: `editor/tests/editor-playtest-pause.test.cjs`, `editor/tests/map-3d-viewport.test.cjs`.

## Tests (run at pause)

- **Passing:**
  - `editor-memory-release` 6/6
  - `gpu-switches` 10/10
  - `map-3d-viewport` 50/50
  - `map-editor-3d-events` 43/43
  - `map-3d-render-on-demand` 13/13
  - `map-looks` 28/28
  - `event-editing-3d` 7/7
  - `model-prop-effects-2d` 2/2
  - `video-frame-upload` 4/4
  - `video-surface-editor` 45/45
  - Earlier: `reactor-3d-lighting`, `light-volume`, `context-restore`, `shadow-continuity`, `pieces`, `render-work-reuse`, `audit-runtime-3d-room-shadows`, `map-neighbor-view`, `reflections`, `scene-walk`, `web-editor-build`, `playtest-profile-isolation`, `themed-dialogs-flows`.
- **Failing, not mine:**
  - `editor-playtest-pause` #3 and `shadow-maps` #15: regexes on the 3D view's render code, which other agents changed (`feed3D(now)`, `LightVolume.baking`).
  - `reactor-3d-foundation` #24 (A1 UVs).
  - `project-manager` #3: the Demo needs the runtime sync (lead).

## Draft changelog lines

- **Editor:**
  - Game manifests and the editor carry `--force-high-performance-gpu --ignore-gpu-blocklist` (opt-out `"reactorHighPerformanceGpu": false`); WebGL contexts request `powerPreference: "high-performance"` (`Graphics.gpuPowerPreference`).
  - `Reactor3D.Shadows.forgetScene` stops the editor keeping every rebuilt 3D scene's models in the shadow lists; `MapEditor3D.SWEEP_MODELS_ON_MAP_CHANGE` is on.
  - The 3D view gives its scene and models back after a playtest has had the GPU for `MapEditor3D.PARK_AFTER_MS` (5 s) and rebuilds when the editor is in front.
  - Video effect planes of one file share one video and texture in the 3D view (`MapEditor3D.SHARE_EFFECT_MEDIA`): Reactor Room drops from 10 decoders to 2, about 670 MB less GPU memory.
  - `nw-game-profile.cjs` reports boot and map arrival times; both NW perf tools take `--profile-dir` for warm launches.
- **User:**
  - Games and the editor now use the faster graphics card on laptops that have two.
  - The editor no longer grows in memory as you edit 3D maps, and gives memory back to a running playtest.
  - Screens that play the same video in the editor's 3D view now share one copy, using far less memory.

## Evidence and scripts

- Copied to `scratchpad/perf-round2-checkpoint/startup-memory-scripts/`:
  - `run.sh`: lock, display env and runtime sync. It expects `display.txt` and `Demo/` in the scratchpad folder: recreate the Demo copy (symlink audio, effects, fonts, icon, img, movies; copy the rest) and start the display.
  - `ed-gpu.cjs`: editor harness with phases. Reports GPU memory from amdgpu fdinfo plus PSS; `--hook` and `--phasefile`/`--phases` options.
  - `glacct.js`: WebGL allocation accounting hook.
  - `phases-*.js` and `step-*.js`: the measurement steps.
  - `boot-probe.cjs`, `ed-boot.cjs`, `game-transfer.cjs`, `gpu-check.cjs`, `arrive.sh`/`pairs.sh` (output `pairs.out`), `timeline.cjs`, `sync-into.cjs`.
  - `park3-pair.png`: before/after-park visual check.
- The scratchpad folder `/tmp/claude-1000/.../scratchpad/startup-memory/` still holds the Chromium source extracts and screenshots. The Demo copy is removed, the display is stopped, and no NW processes are left.
