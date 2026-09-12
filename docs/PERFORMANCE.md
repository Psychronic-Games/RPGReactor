# Runtime performance checks

## Acer 1440p movement pass — runtime 20260907.2

**Removed repeat shader compilation from looping 3D effects and a fully hidden floor draw. No quality settings were reduced.** Three baseline walking samples aggregate to **25.47 FPS**, versus **26.07 FPS** across four optimized samples. That small difference is within substantial session variation: p95 remains 55.6 ms, and p99 and the worst frame did not improve overall. This does **not** establish resolved spikes or sustained 60/144 FPS.

### Hardware and measurement

AMD Ryzen 5 PRO 5650U, 12 logical processors, 15.3 GiB usable RAM, integrated AMD Radeon through normal ANGLE Direct3D11. Testing used the external Acer, not the laptop's 1920×1080/60 Hz display. The game canvas rendered at **2560×1440**; idle animation-frame intervals had a 6.9 ms median, consistent with the Acer's 144 Hz refresh. The window fits the image into its available client area; the rendering buffer remains full resolution.

A disposable Demo copy and isolated NW.js profile preserve authored project data. Each measured route starts at (24,45), moves 24 tiles north and 24 south at speed 4, and finishes at (24,45), with collision bypass for repeatability. Four seconds of warmup precede each route; each completed route contains 384 measured animation-frame intervals and 385 3D renders. Browser frame limiting stays enabled. Test-only focus/background overrides allow measurement while the user works elsewhere. No test suite or CPU profiler ran during these samples; other desktop activity was not controlled.

Baseline disables `Reactor3D.CoveredFloor.enabled` and `Reactor3D.EffekseerScene.reuseQuads`, disposing inactive cached quads before warmup. Optimized enables both. No resolution, texture/filtering, shadow/light budget, model-detail error limit, effect budget or antialiasing change is part of this pass. Older 1080p results below use a different workload and are not a direct baseline.

| Sample, in collection order | FPS | Mean ms | p95 ms | p99 ms | Maximum ms | Shader compilations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline-a | 25.70 | 38.92 | 55.5 | 90.1 | 125.0 | 12 |
| optimized-a | 26.13 | 38.27 | 48.8 | 166.7 | 291.8 | 0 |
| optimized-b | 25.07 | 39.90 | 62.4 | 125.0 | 179.9 | 0 |
| baseline-b | 24.58 | 40.69 | 55.7 | 132.2 | 207.9 | 12 |
| optimized-c | 26.89 | 37.18 | 48.7 | 76.1 | 83.3 | 0 |
| baseline-c | 26.19 | 38.18 | 55.5 | 83.1 | 125.0 | 12 |
| optimized-d | 26.27 | 38.07 | 55.5 | 124.9 | 139.0 | 0 |

Aggregate frame time is 39.26 → 38.35 ms, about 2.3% lower. Intervals over 50 ms account for 70/1152 baseline frames and 90/1536 optimized frames. Aggregate p99 is 104.4 → 118.0 ms and maximum is 207.9 → 291.8 ms. All seven samples are retained, including the slower optimized runs. The last pair includes additional image-decode readiness and conservative fallback guards; the first five used the same two rendering optimizations before those guards were finalized. See [machine-readable results and validation](benchmarks/2026-09-07-potato-1440p.json).

### Changes and evidence

- **Keep a bounded set of effect drawing quads across loops.** Disposing the final matching Three.js material also discarded its shader-source cache, causing identical shaders to compile again when the next effect began. Diagnostic program queries sometimes blocked for 15–50 ms. Retain at most four small quads/materials per owning scene; release every play's texture and GPU targets immediately, reset drawing uniforms before reuse, and dispose cached geometry/materials on scene teardown. Every baseline route compiled 12 shaders; every optimized route compiled zero after warmup.
- **Skip the room floor only when an opaque parallax completely covers it.** Prove opacity against every source pixel once after decoding. Check the generated surfaces, camera bounds/near plane, transforms, depth/blend settings, visibility, shadow casting and intervening draws. Animated, translucent, edited, clipped, unknown and unsupported cases retain the original draw. Restore visibility after rendering, including exceptions. Frozen full-frame GPU comparisons for the eligible floor saved about 9.3% in one repeated comparison (17.55/17.99 → 15.38/16.86 ms); this is GPU time for a frozen view, not a live FPS promise.

GPU pressure remains a major limit. An earlier instrumented moving sample after quad reuse measured a 35.8 ms median GPU interval, with 52.0 ms p95. These diagnostics include instrumentation and a different movement segment, so they are not used for the live comparison above. Individual-draw probes locate large costs in full-screen floor lighting, dense skinned characters and light bodies; timer queries around each draw disturb execution, so those timings are only prioritization evidence. Full utilization can amplify small bursts, but this pass does not attribute every stall to the GPU.

Additional native-buffer reuse, shadow-lookup short-circuiting and shared shadow-coordinate experiments did not demonstrate sufficient repeatable benefit and were left out. The two shadow experiments matched pixels in three frozen views but did not justify changing production shaders. Existing quality levels remain intact.

### Validation and remaining limits

- Saved-build GPU comparisons: **11 floor cases match every channel at 2560×1440**. Five eligible views omit the lower draw; six boundary/transparency cases keep it. Three nonempty effect-quad comparisons also match exactly with material reuse. No WebGL errors.
- Title → new map, image reload and resize 1600×900 → 2560×1440 pass. The custom `Scene_ReactorUI` title releases all plays, the quad pool and covered-floor registry; returning to the map restores live effects at four samples. Deferred image-decode completion cannot revive a cleared scene. Normal collision/input state is restored after tests.
- **175 focused tests pass**, including eight new behavioral regressions. Both runtime/template synchronization checks pass for all 13 local projects. JavaScript syntax and whitespace checks pass.
- Full Windows suite before final corrections: **2,912 passed, 34 failed, 1 skipped** (2,947 total). Ten old revision assertions and one template synchronization failure were corrected and passed on rerun. The remaining 23 failures concern platform paths/case, symlink/lock permissions, archive/codec tooling, packaging and thumbnail caching outside these rendering changes. The full suite was not rerun after those corrections; it is not claimed green.
- Runtime **20260907.2** is synchronized to local projects. No authored map/settings changes, resolution reduction, release build, publication or commit was made by this pass. The isolated diagnostic window/server is closed after validation.

Local detailed evidence is in ignored `scratchpad/perf-20260907/`: `host.cjs`, `route.cjs`, `measure.js`, all `final-baseline-*.json` / `final-optimized-*.json`, `final-quality.json`, `quad-quality.json`, `lifecycle.json`, `focused-final.log`, `sync-final.log` and `full-tests.log`. The compact JSON linked above is retained with the documentation. Remaining work is to reduce the expensive visible rendering and investigate the residual long frames without reducing fidelity.

## Shared GPU effects and exact frame reuse — runtime 20260905.5

**Final normal-backend verification: 55.4 and 54.8 FPS at 1920×1080. Sustained 60 FPS is not yet achieved.** Revision 20260905.5 is installed in the engine and tracked Demo. The shared rendering changes also load in editor map and model previews. No resolution, texture filtering, shadow budget, effect antialiasing, effect pixel budget or model-detail error limit was reduced in these two passes (.4 and .5).

### What changed

- Attached Effekseer animations render into the owning renderer's GPU textures, avoiding the old WebGL-to-canvas-to-WebGL copy. The original 4-sample antialiasing is retained on this laptop. A GPU colour conversion preserves the original sRGB texture filtering; unsupported contexts keep the canvas path. Normal 2D animations keep their overlay.
- Coverage checks use asynchronous GPU readback and the existing worker. A timeout or context loss cancels a result instead of blocking or learning false empty bounds. Native effect contexts remain alive through outstanding asset callbacks, then release safely.
- Map and viewport cleanup now stops only the effects they own. Rebuilding a map keeps four targets instead of accumulating old plays. Leaving the map releases all live plays and targets; recreating the viewport leaves the main graphics context intact.
- Light-cell changes touch only the affected cells when that is cheaper; widespread changes use the original bulk rebuild. Every bit matches a freshly rebuilt reference, including light slot 31, removals and moving grid origins. Colours alone do not trigger mask uploads.
- Stored video-surface settings reuse their validated result while unchanged. Playback time remains live; nested edits and malformed values still pass through the original parser.
- Attached-effect quads use an outward-rounded scissor for pixels already discarded by their shader, restoring the caller's scissor afterwards.
- Neutral engine colour passes are skipped only when an intact opaque backdrop makes that safe. Fades, flashes, colour changes, zoom, opacity, masks, custom shaders and unsafe blending retain the necessary passes. Ordinary sprite filters retain their compositing behavior. The backdrop check is shared within each PIXI render, and repeated for the next render.

The original misplaced-flash fix remains: hidden 3D-owned handles cannot also draw through the 2D projection. The editor's AnimationPreviewLayer now uses the shared GPU path in both map and model views, and draws after receiving the current anchor and camera.

### Measured performance

One game window, ANGLE/D3D11, 1920×1080, AC power. Live samples use 15 seconds of plain animation-frame intervals after warmup; player [24,15], camera position and rotation match at both ends. This is a different view from the older [24,49] samples below, so those figures are historical rather than a direct baseline. Unit tests and CPU profiling were not running during the live samples.

| Comparison | Original path | Optimized path |
| --- | ---: | ---: |
| Shared-effect ABBA, same session | 41.50 / 35.93 FPS | 48.56 / 47.16 FPS |
| Neutral colour passes, same session | 53.82 FPS | 55.89 FPS; cached guard 56.29 FPS |
| Earlier fresh saved .5 build | — | 55.89 FPS, mean 17.89 ms, p95 16.8 ms |
| Final .5 verification, normal Direct3D | — | 55.42 / 54.82 FPS; mean 18.04 / 18.24 ms; p95 16.8 / 33.3 ms |

The shared-effect comparison had substantial drift; its combined mean frame time was 25.96 → 20.90 ms (about 19.5% lower), not a guarantee for every scene. Earlier separate-launch .4 samples reached 55.69 FPS. The earlier saved sample had 23 intervals over 25 ms; the final pair had 28 and 75 respectively; occasional long frames still lower the average even when most frames fit the display refresh.

Frozen full-image colour-pass comparisons consistently save about 0.9–1.1 ms GPU time in the neutral case. Those are GPU timings, not gameplay FPS. One flash timing sample suffered a large transient slowdown, so it is used only for image validation. Effect scissors saved about 0.23 ms in one frozen comparison. Sparse light changes and video validation have small microbenchmark gains; no independent live FPS gain is claimed for them.

### Quality and regression evidence

- Native legacy/shared draws match exactly for four effects (RPGReactor-Core, FireAll1, ThunderOne1, CureOne1) at three sampled times with identical seeds, including nonempty frames and 4-sample antialiasing.
- Filtered runtime and premultiplied editor colour comparisons differ by at most 2/255 per channel, with identical alpha and lit-pixel counts. The earlier conversion that differed by up to 61/255 was rejected.
- Shared graphics-state handoff, including deliberately disturbed state: zero pixel differences and no graphics errors.
- Neutral, flash, tone, fade, opacity, zoom and direct-matrix cases in the saved .5 build: zero pixel differences. Scissors also match exactly across five camera angles.
- Editor map and model preview checks: attached effects visible on the shared path, original 4-sample antialiasing, no errors, correct cleanup. These verify function and appearance, not an editor FPS promise.
- Latest runtime resize/focus/movement/map-rebuild test: 39 normal 2D draws, zero duplicate 3D draws, no error display or graphics errors. Title transition: zero plays and zero targets. Explicit viewport release/recreation: main context remains live and a fresh effect context is created.
- Installed-source focused checks: **180 passed**. The broader related selection was **185 passed / 1 failed**; the existing Windows thumbnail PNG disk-cache test remains failing. The full suite was not rerun for .5; older full-suite failures below remain unresolved.
- Runtime/template source hashes match. Syntax and whitespace checks pass. Unrelated author edits are preserved; nothing was committed.

Experiments without a demonstrated benefit were left out: early video uploads, broader transform memoization, effect-target pooling, floor depth prepasses, and exact skinned-vertex welding. Reordering floors changed visible pixels and was rejected. Further work must address the remaining frame cost and occasional stalls without lowering authored quality.

Additional .5 backend checks measured 42.57 FPS with OpenGL and 32.98 with Vulkan; normal Direct3D is restored. Removing the browser frame limit produced 86.68 callbacks/second but only 51.76 newly rendered 3D frames/second (normal scheduling measured 51.04 in the matching diagnostic). That is not a real 60 FPS result, and the flag was removed. The diagnostic adds instrumentation and is separate from the plain RAF samples above. Skinned-detail experiments, transform memoization and hiding an empty composite did not establish a worthwhile further gain and are not installed.

One clean Direct3D playtest remains open with normal input and focus behavior restored. The final health check confirmed runtime .5, full 1920×1080, shared rendering, 4-sample attached effects, advancing simulation, two ready effects, and no error display or graphics error.


## Third laptop pass — runtime 20260905.3

The shared renderer now avoids additional duplicate work, and the runtime fixes misplaced flashes from 3D-attached animations. **The final controlled live samples averaged 44.8 and 45.8 FPS with the new performance switches enabled. Sustained 60 FPS remains unachieved.** No resolution, texture, shadow, effect-budget or model-detail settings were reduced in this pass.

### Fixed: attached animations flashing in the wrong place

PIXI 8's render callback was queuing hidden Sprite_Animation instances after their effects had been claimed by the 3D renderer. Those handles were then drawn again through the 2D screen projection. A real game probe observed 730 duplicate draws across 357 frames in 12 seconds. The corrected runtime refuses scene-owned effects at enqueue and draw time, and removes entries whose ownership changed while queued before deciding whether to copy the screen behind effects. Normal 2D animations and sound/flash/lifetime updates remain active.

After the fix the duplicate count was zero across 409 live frames, with correctly anchored core effects still ready and visible in the scene. A fresh saved-build probe also recorded zero duplicates across 565 frames. The latter starting view culls some off-screen core effects; the earlier visible-effect probe is the evidence that the correct effects remain. Tests cover hidden callbacks, ownership changes after queuing, mixed 2D/3D queues and continued overlay clearing.

### Additional shared savings

- Skip exactly zero-alpha tile pixels before expensive lighting when the material blends normally and writes neither depth nor stencil. Fractional and opaque pixels keep their existing drawing and overlap order. The optimization follows material changes and falls back when its conditions no longer hold.
- Draw both sides of additive sphere/cone/beam light bodies in a single pass. Their surfaces and brightness are retained; the tested image differences are limited to rounding of at most 2/255 per channel.
- Reuse an already-cleared shared render target while a pass is empty. New content, pending shadows, callbacks, disposal and resizing require a real draw. Separate canvas passes retain their existing behavior.
- Reuse unchanged skeleton palettes across repeated color/shadow passes. Bone poses, inverse-bind changes, manual palette edits, replacement arrays and replacement textures invalidate the cache. Custom skeleton update functions are left intact.
- Repack only light intersections whose exact inputs changed, and upload the mask only if its bits change. RGB-only changes do not alter intersections. A frame that changes most lights uses a full rebuild. Grid size, radius and shader equations are unchanged.
- Resolve an attachment's world point, model scale/rotation and relative part rotation from one fresh ancestor walk. Video surfaces retain the old-helper fallback for older projects.
- Clear all six faces of a shadow row together, then draw the same selected faces in the same order. Original shadow geometry and existing budgets are retained.

These renderer changes are in the shared runtime loaded by editor map/model views. The duplicate overlay fix belongs to the game/playtest Sprite_Animation path; the editor's independent AnimationPreviewLayer keeps its existing drawing implementation.

### Final controlled live comparison

One NW.js game window, D3D11/ANGLE, 1920×1080, laptop on AC. The full test suite had finished before these measurements. Movement was held temporarily at player [24,49]; recorded player position, camera position and rotation match at both ends of all samples. Animations remained live. Each sample followed five seconds of warmup and collected 15 seconds of plain animation-frame intervals without GPU query instrumentation. The flash fix and combined attachment transforms remain enabled in both variants; switches cover the other new performance features. Older .2 optimizations remain enabled in both.

| Sample | Mean frame time | Average FPS | p95 frame time |
| --- | ---: | ---: | ---: |
| New switches off A | 24.08 ms | 41.5 | 50.0 ms |
| New switches on A | 22.31 ms | 44.8 | 49.9 ms |
| New switches off B | 22.04 ms | 45.4 | 49.9 ms |
| New switches on B | 21.85 ms | 45.8 | 49.9 ms |

Paired mean frame time: **23.06 → 22.08 ms**, about **4.3% less time per frame**. This is a modest gain and the p95 remains near 50 ms. Earlier 46–52 FPS samples and later lower samples are not a substitute for this controlled comparison: the user was moving around the map during parts of that exploration, as confirmed by recorded positions [37,12] and [8,18]. Frozen GPU timings must not be presented as live FPS.

### Image and regression checks

- Five frozen camera views: the initial four-feature bundle differs by at most 2/255 in a small number of light-glow channels; no graphics errors. Zero-alpha tile rejection alone is pixel-identical.
- Synthetic GPU fixtures covering alpha 0/128/254/255, opacity 1/0.6, overlap and depth-writing fallback: exact image matches. Shadow-row fixtures for empty, single, alternating and all faces: exact depth-image matches.
- A forced dynamic-shadow comparison retained identical pixels. Row-clear GPU medians averaged 14.05 → 13.96 ms; this is a small saving.
- 240 animated shadow frames passed with five slot changes, no mismatched maps, no budget overruns and no graphics errors.
- 201 focused tests passed. The seven shared-context tests also pass after replacing an obsolete source-pattern assertion with a behavioral reset/exception test.
- Full Windows run: 2,748 tests; 2,717 passed, 30 failed, one skipped. One failure was the obsolete shared-context assertion just corrected and rerun successfully. The other 29 failures are in platform/tooling, path/permission, existing authored-content or ignored-project synchronization checks; the full suite is not green. Raw results are retained. Compared with the prior 27-failure run, additional non-render failures concern the thumbnail disk cache and packaged-runtime copying; no unrelated fixes were attempted.

### Experiments not shipped

GPU-built/finer light grids, general world-matrix caching, triangle reordering, front-to-back material sorting, light-body instancing and direct cross-context effect-image transfers did not produce a reliable acceptable improvement. Opaque-pixel removal in the blend pass was replaced by the safer zero-alpha-only optimization. OpenGL performed worse, and Vulkan lost its graphics context. No backend or power-mode changes were retained. No new encoder dependency was added.

The direct-transfer prototype was restored to the established canvas path after it measured slower; it is not in the saved runtime. Its small crop probe followed the [WebGL 2 texture upload API](https://registry.khronos.org/webgl/specs/2.0/).

## Second laptop pass — runtime 20260905.2

The shared changes are installed in the editor, source runtime and tracked Demo. **Live gameplay improved from 25–28 FPS to 40–41 FPS in the final paired test. Sustained 60 FPS has not been achieved.** All NW.js benchmark windows and drivers were closed after testing.

### What changed

- A conservative 3D light index skips lights that cannot contribute to a pixel. Moving lights update immediately; pixels outside the indexed area retain the original light loop. Lighting equations, falloff and shadow samples are unchanged.
- One background worker prepares index-only detail levels for dense, rigid models. The renderer chooses levels using a conservative camera scale and an estimated 0.35-pixel geometric error. Original vertex data, textures and source files remain intact. Close views, skinned/transparent/partial meshes, edited geometry and worker failure use full detail. Shadow drawing, collision and editor picking retain original geometry.
- A second worker measures effect coverage away from the main thread. It uses the same small coverage image and captured camera pose; drawing proceeds while the measurement is pending. Unsupported or failed workers fall back to the existing path. Effect rendering, resolution and budgets are unchanged.
- The editor map, database model view, model picker and event previews share the geometry drawing helper. The editor supplies same-origin worker URLs even when runtime scripts are injected as Blobs. Its separate AnimationPreviewLayer coverage implementation is still synchronous; the coverage worker belongs to the shared runtime EffekseerScene path.

The authored 1920×1080 output, texture data, effect budgets, lighting and shadow quality settings were retained. Runtime draw geometry can differ as described above. The previous revision's range checks, beam bounds reuse and attachment matrix savings remain active.

### Final live measurements

Same process, same scene and settings; five seconds of warmup before each 15-second sample. Baseline disables this round's three features. Animation keeps running, so phases vary. FPS below is calculated from all sampled frame intervals, not the instantaneous overlay counter.

| Sample | Mean frame time | Average FPS | Median GPU frame time |
| --- | ---: | ---: | ---: |
| Baseline A | 35.94 ms | 27.8 | 29.55 ms |
| Optimized A | 24.54 ms | 40.7 | 17.80 ms |
| Baseline B | 40.06 ms | 25.0 | 31.78 ms |
| Optimized B | 24.68 ms | 40.5 | 18.49 ms |

Optimized p95 frame intervals were 33.5 and 49.9 ms. That variability is material: this is not a locked 60 FPS result. Optimized main-thread update averages were 14.14–14.75 ms, plus approximately 1.9 ms for the final composite; median live GPU time was 17.80–18.49 ms. Both sides still have little or no headroom within a 16.67 ms frame budget.

### Controlled rendering and quality checks

The final frozen-view run used 40 GPU timer samples per batch, pausing clocks, scene updates and videos. Baseline/lighting/combined/baseline/combined medians were 24.03 / 13.26 / 12.70 / 23.21 / 12.66 ms. Averaging paired baseline and combined medians gives **23.62 → 12.68 ms, 46.3% less GPU time**. An earlier controlled pose showed 31.1% savings. These are rendering measurements, not live FPS: animated shadow refreshes, updates and media work are excluded.

Lighting-only pixels matched exactly in the final run and at four earlier camera positions (original, near, far and orbit). Both repeated baseline images matched exactly. The final combined image differed in 77,777 of 8,294,400 RGBA channels, with mean absolute difference 0.0346 on a 0–255 scale and maximum 135. Earlier four-camera mean differences ranged from 0.0284 to 0.0654. Screenshots were visually inspected and showed no obvious loss at the tested views. These aggregate differences and the simplifier's approximate geometric error are **not a proof of imperceptibility for every model or camera**; broader content and motion review remains necessary.

All comparisons retained 24 lights, 100 lit materials and the same shadow settings, with zero graphics errors or failed shader programs. A real worker probe returned exactly the same coverage bounds/history as synchronous measurement for a synthetic effect image. The real editor loaded model detail levels through its Blob worker, and its Reactor model preview displayed both authored effects with no logged errors. The latest runtime passed 240 animated shadow frames with one slot change, no mismatched static/dynamic maps and no budget overruns or graphics errors.

### Validation and scope

- 259 focused runtime/editor tests passed. Regression cases include conservative light masks, movement, grid shifts, geometry mutation/disposal, partial draw ranges, parent shear, full shadow geometry, worker failure and asynchronous effect lifetime.
- Final full Windows suite: **2709 passed, 27 failed, 1 skipped (2737 total)**. Remaining failures concern Windows path/zip/unzip/symlink assumptions, existing editor/content expectations, and ignored corpus runtime drift. This is not a clean release run. The exact failures are included in the measurements JSON.
- Source runtime, version marker and four new library/license files match the tracked Demo copies byte-for-byte. New/existing project refreshes copy the runtime libraries through the existing recursive updater. Twelve ignored local corpus projects were not bulk rewritten; their drift remains reported by the suite.
- Pinned meshoptimizer 1.1 JavaScript/WASM is bundled with its MIT license. Source: [meshoptimizer](https://github.com/zeux/meshoptimizer/tree/v1.1). No OS power, driver or quality setting changes were made. Existing unrelated edits were preserved; no commit was created.

Hardware: HP EliteBook 845 G8, Ryzen 5 PRO 5650U, integrated Radeon, 16 GB RAM, Windows 11, ANGLE/D3D11 with AMD driver 31.0.21924.61, AC power and Balanced plan. Existing weak tier: four static/two dynamic shadow rows, 256-pixel faces, one shadow tap.

### Reproduction and next bottlenecks

Use a fully copied disposable Demo, since project plugins may autosave. From the repository root, run the existing NW.js harness with the new setup:

`node editor/tests/perf/nw-game-profile.cjs --project=<disposable-Demo> --nw-root=nwjs-win --seconds=15 --setup=editor/tests/perf/render-budget-compare-setup.js --out=<results-directory>`

The setup restores clocks, media, feature settings and program keys after its comparison; the harness closes its test process. Its pass flag checks rendering validity and exact lighting equality, not perceptual equivalence of geometry. Allow model workers to finish before interpreting geometry gains (the report includes detailReady).

The remaining work toward 60 FPS is the live update/render pipeline: animated world transforms, effect/canvas texture transfers and shadow refresh cost. Workers cannot remove GPU shading or transfer costs merely by moving JavaScript off the main thread. A shared effect-rendering context would require a compatible Effekseer integration and separate visual regression work; that change is not included here.

## Ryzen 5 5650U laptop pass — 2026-09-05

Applied three changes to the source runtime and bundled Demo, revision **20260905.1**:

- Reject lights outside their enclosing cube before the fragment shader calculates distance. The existing radial falloff, cone edges and shadow sampling remain intact.
- Reuse each model's beam-collision bounds within one light update, rebuilding them on the next update.
- Calculate an attachment's rotation with one ancestor-matrix update instead of two, retaining Three.js's treatment of scaled parents.

The authored 1920×1080 resolution, textures, geometry, lighting and shadow settings were retained. No assets were reduced.

Hardware: HP EliteBook 845 G8, Ryzen 5 PRO 5650U, integrated Radeon graphics, approximately 16 GB RAM, Windows 11. ANGLE/D3D11, AMD driver 31.0.21924.61, AC power, Balanced plan. The existing weak GPU tier uses four static shadow rows, two dynamic rows, 256-pixel faces and one shadow tap.

### Measurements

Two frozen-view comparisons, each alternating baseline/optimized/baseline/optimized with 40 GPU samples per batch:

| Run | Baseline GPU time | Optimized GPU time | Reduction |
| --- | ---: | ---: | ---: |
| 1 | 31.72 ms | 27.54 ms | 13.2% |
| 2 | 28.76 ms | 27.20 ms | 5.4% |

Each time is the average of the two batch medians. Both runs retained 24 packed lights and 100 lit materials. Every baseline/optimized pixel comparison was identical, with no graphics errors or failed shader programs. The final harness also pauses detached video texture sources; an intervening exploratory run failed baseline-versus-baseline image stability and was discarded.

Live animation was less consistent. Four 10-second samples in the same process, with five seconds of warmup per switch, recorded **18.83 / 23.36 / 21.15 / 18.67 FPS** in baseline/optimized/baseline/optimized order. This does **not** establish a reliable live FPS increase or 60 FPS at 1080p. Animation phases and GPU scheduling differ between batches. The initial profiled run averaged 21.2 FPS. The measured GPU savings are the clearer result.

### Verification and remaining work

- **121 focused tests passed**, with no failures or skips. New cases cover movement, replacement geometry, visibility/removal, beam carriers, fresh standalone calls, scaled/rotated attachments and light-range boundaries. Existing runtime-version assertions were updated; the movie-discovery fixture now avoids a Windows-invalid question-mark filename while retaining its lexical path check.
- **240 animated frames passed** shadow continuity checks: no static/dynamic mismatches, budget overruns or WebGL errors. Four light-slot changes occurred as animated lights changed priority.
- Source runtime and the tracked Demo copies match byte-for-byte. The other 12 ignored local corpus projects still carry the prior engine; the broad sync check reports those 24 expected differences. They were not needed for this Demo benchmark.
- The full project test suite was not rerun. Existing unrelated working-tree edits were preserved; no commit was created.
- The baseline CPU profile still shows animation image readbacks and texture uploads as expensive operations. This pass does not remove those stalls. Further substantial gains need work on that rendering path or more selective light lists, with new visual comparisons.

Reproduce the shader comparison with the existing NW game profiler on a disposable Demo copy and `--setup=editor/tests/perf/light-range-compare-setup.js`. The profiler reports CPU and GPU time separately. Use `shadow-continuity-setup.js` for the moving-shadow check. Profile copies only: plugins may autosave.


## 2D editor light field and prop previews (2026-09-04)

`LightingManager` r14 evaluates the runtime's point/spot/beam falloff on the
flat ground plane, using world anchors and height/pitch/yaw. Downward cones
intersect the floor as ellipses. Full fragment precision avoids edge errors
seen with default shader precision. All floor lights sit below the prop layer;
individual shadow masks only attenuate their own additive light. This retains
the flat renderer's brightness treatment: it is not a full 3D material/volume
compositor, and walls, self-shadowing and event-model casters remain outside
this editor ground-shadow approximation.

Placed props retain Three targets on PIXI's WebGL2 context, without per-frame
canvas copies. Target density follows zoom and device resolution with at least
25% sampling headroom (subject to the 4096/hardware limit), linear filtering and
four MSAA samples. Zoom-in restores detail; it does not change animation speed.
Pose/media/light-anchor updates run at the existing 60 Hz model presentation
rate. Static/hidden props reuse textures, and hidden media pauses. Flat model
materials own their ambient uniforms so another preview cannot recolor them.

Shadow masks cover each light's ground footprint, grow in retained 64-pixel
blocks to at most 512 per side, and refresh at most 30 Hz. Projected caster
bounds reject irrelevant geometry; empty pools skip rendering. Static masks
and flicker-only changes reuse their targets. A mask is unbound from consumers
before replacement/removal. Model/bone boxes are cached; production rendering
does not read pixels back to the CPU.

Run `node editor/tests/perf/nw-flat-preview.cjs` from the repository root.
It copies Demo, isolates the NW.js profile, compares 24 rendered light fields
against the runtime's actual GLSL, checks a caster outside the light footprint,
checks model-lighting isolation and zoom resolution, profiles 20 seconds of
animation, and saves 2D/3D screenshots. `RR_RENDER_NODE=/dev/dri/renderD129`
selected this machine's AMD integrated graphics. The script prints its temp
artifact directory; the author's Demo and lock are not modified.

Recorded NVIDIA comparison at map zoom 0.3: model texture area fell about 86%;
preview CPU time averaged 0.588 ms per display tick before and 0.271 ms after;
shadow submissions fell from 325 to 179 per second. Samples were 10 seconds
before and 20 seconds after, not frozen identical poses, so these describe
representative workload reduction rather than an exact GPU speedup. The final
NVIDIA sample's combined Three/PIXI GPU time averaged 0.443 ms (p95 1.649 ms).
The AMD integrated sample averaged 4.262 ms (p95 14.784 ms, max 20.526 ms).
Queries cover the editor canvas, excluding Effekseer's separate context and the
browser compositor. These devices do not establish performance on every old PC.

The 24 GPU field comparisons differed by at most one 8-bit level. The projected
shadow fixture produced 366 opaque pixels and restored caster state. Separate
NW.js lifecycle checks verify visible video/animation/shadow pixels, overlapping
colored lights preserving ambient, view/map switching and project-close cleanup.



Optimize repeated CPU work and GPU work separately. A cheap JavaScript update
can submit expensive drawing, and timing only the final PIXI composite misses
the Three.js passes submitted during the game update. Keep resolution, light
counts, shadow quality and scene state constant when comparing an optimization.

## Flat model sprites — 2026-09-04, revision .17

Animated models on 2D maps previously rendered into a private WebGL canvas,
then copied through a 2D canvas and uploaded to PIXI on each draw. The shared
path now renders directly into sprite textures, retaining the model sprite's
pixel dimensions and up to four antialiasing samples. Only the compatibility
fallback copies pixels. Culled models retain simulation but skip drawing;
catch-up ticks also skip redundant draws.

A local NW.js check on a disposable 1920×1080 Demo copy loaded 18 model
instances and 12 carried lights. A shared → canvas → shared comparison used
roughly 1.5-second samples. CPU time inside model painting averaged about
**0.11 ms per draw shared versus 0.98 ms copied** (about 89% less). Browser
presentation cadence measured about 29 FPS during the copied sample and
127 FPS in the warmed shared sample; game simulation remained near 60 ticks/s.
These are short local measurements, not an older-PC performance guarantee or
GPU timer-query results. The first shared sample included more warm-up work.

A frozen-view comparison retained resolution and showed a mean RGB difference
of 0.17/255 between shared and canvas paths; about 0.4% of pixels differed by
more than eight channel values. Thus this is not a pixel-identical claim.
Visual inspection confirmed intact model detail and soft translucent lighting.
The separate lighting correction replaces the rectangle-only cone falloff
with a tapered texture and uses reduced body opacity, avoiding white washes.

Local harness: `scratchpad/flat-model-profile.cjs` (ignored development aid).
Regression coverage lives in `editor/tests/model-playback-lifecycle.test.cjs`.

A follow-up with expanding animated bounds retained the shared-path benefit:
about 0.10 ms/draw shared versus 1.31 ms copied, and roughly 106 versus 24
presented frames/s in the warmed samples. Bone bounds are cached by geometry
and bind matrices; moving frames transform boxes instead of reading vertices.
These measurements retain the same short-run/local-machine limitations above.

## Spotlight and anchor optimization — 2026-09-04

Runtime revision **20260904.15** stops processing a spotlight once its cone
falloff reaches exactly zero, before sampling either shadow atlas. The soft
cone edge, lit pixels, shadow filtering and caster budgets retain their existing
calculations. Model effect anchors also stop explicitly updating world matrices
before `localToWorld`, because the bundled Three.js already updates the node and
its ancestors inside that method. A real-Three.js regression checks fresh parent
translation/rotation, model scale and part offsets, with one update per node.

Measured on the **integrated AMD GPU in a Ryzen 9 9950X3D**, using NW.js,
ANGLE/radeonsi, a 1280×720 Demo start-map view, 22 packed lights and 100 lit
materials. The CPU is a modern desktop CPU; this is evidence about integrated
GPU cost, not a complete old-PC benchmark.

| Shader settings | Baseline GPU median | Optimized GPU median | Pixel comparison |
| --- | ---: | ---: | --- |
| Full, 8 shadow rows, 5 taps | 27.53 ms | 22.36 ms | Identical |
| Full, repeated | 27.91 ms | 22.17 ms | Identical |
| Weak, 4 shadow rows, 1 tap | 16.01 ms | 16.43 ms | Identical |
| Weak, repeated | 15.77 ms | 15.09 ms | Identical |

Each median contains 40 GPU timer samples after shader warmup. Full quality
saved approximately 19–21% in these comparisons; weak quality showed no
consistent gain. Both tiers returned zero WebGL errors and zero failed shader
programs. An earlier full-quality experiment measured about 17.5% savings.
Normal GPU scheduling, clock changes and the animated scene's freeze point
affect timings between runs.

These are **frozen-scene rendering comparisons**, including Three.js world and
overlay passes plus the PIXI composite. They isolate the fragment-shader change;
they do not measure moving-caster atlas refreshes, simulation, media playback,
or the CPU anchor improvement. Exact pixels in these views are useful regression
evidence, not exhaustive visual coverage of every map, camera and GPU driver.
The new branch only skips mathematically zero contributions; it does not lower
any quality setting. The weak-tier run explicitly selected the existing weak
Reactor3D tier in a disposable runtime copy, since this GPU's renderer string
currently defaults to full quality.

## Reproduce

Use the matching NW.js SDK/chromedriver under `nwjs-linux` (or the platform's
equivalent directory), or pass `--nw-root`. From the repository root:

```bash
BENCH_DIR=$(mktemp -d)
cp -RL template/Demo "$BENCH_DIR/Demo"
cp runtime/reactor_3d.js runtime/reactor_main.js "$BENCH_DIR/Demo/js/"
node editor/tests/perf/nw-game-profile.cjs \
  --project="$BENCH_DIR/Demo" --seconds=6 --out="$BENCH_DIR" \
  --setup=editor/tests/perf/lighting-compare-setup.js \
  --shot="$BENCH_DIR/game.png" > "$BENCH_DIR/profile.log" 2>&1
```

Use a real copy with symlinks dereferenced: project plugins can autosave even
though the profiler itself never requests a save. On Linux with multiple GPUs,
optionally pass `--render-node=/dev/dri/renderD129`, substituting the actual
device. Check the report's renderer description rather than assuming an
environment variable selected the intended GPU.

The setup script freezes game updates, clocks and playing media, then alternates
baseline/optimized/baseline/optimized. Baseline removes only the spotlight exit
from the current shader. Materials are recompiled and warmed before sampling;
the report requires identical framebuffer pixels, a nonuniform image, 40 valid
GPU samples per batch, and no WebGL or shader errors. The normal shader, clocks,
tickers and media resume afterwards. Custom time-driven plugins may require
additional freezing; a baseline-versus-baseline mismatch detects that problem.

The subsequent `frames` report measures the running game. Its shared-context GPU
query spans the update handler and final PIXI render; it excludes separate
contexts and effects submitted after that render. CPU update time, render
submission time and frame intervals are reported separately. GPU time is not
interchangeable with FPS. Omit `--setup` for ordinary live-game profiling.

## Moving-scene shadow continuity — 2026-09-04

Revision **20260904.16** fixes a separate temporal problem: a cached static
shadow could adopt a new light origin before its dynamic partner refreshed,
temporarily suppressing character shadows. The pair now updates together
within the same budgets and intervals. Shadow-slot selection retains incumbents
through near ties, uses pre-flicker light values for priority, and changes cone
priority smoothly. Rendering still uses the actual animated light values.

Run the same profiler command above with
`--setup=editor/tests/perf/shadow-continuity-setup.js` to observe 240 rendered
frames with lights, actors and camera updates running. It checks for mismatched
static/dynamic maps, budget overruns and GL errors, and logs slot changes.
Changing slots is allowed when lights move, disappear or become substantially
more important; zero slot changes is not a general correctness condition.

The .15 Demo run recorded 24 slot changes and 46 mismatched pairs over 240
frames. Final .16 probes recorded two changes at full quality on NVIDIA and
one at weak quality on AMD integrated graphics, with zero mismatched pairs,
budget overruns or GL errors in either run. Weak quality was explicitly selected
in the disposable runtime copy. Animation phases differ across launches, so
these counts are diagnostic observations rather than a deterministic performance
comparison. The Node regressions separately reproduce controlled near ties and
paired-refresh contention; the three initial continuity cases fail on .15.

Full/weak shadow capacities and filtering remain unchanged. Lights without an
assigned shadow row still illuminate the scene; this fix does not make shadow
capacity unlimited or establish visual correctness for every scene and driver.

## Further candidates

Profile before expanding the changes. Promising remaining targets include
reusing beam-collision bounds within a frame, reducing repeated effect-anchor
lookups, and restricting each object's shader light list to lights that can
actually reach it. Any cache must invalidate on movement, animation, geometry
changes and removal. Existing static shadow caching and moving-shadow budgets
already avoid some redraws; extending them needs moving-scene comparisons to
catch stale shadows. Lowering resolution or geometry detail is a separate
quality decision, not part of this optimization.
