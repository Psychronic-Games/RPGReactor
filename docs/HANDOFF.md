# Handoff - 0.98.4 In Progress

Last updated 2026-08-25.

## Current State

- **0.98.3** is tagged and published at
  <https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.98.3>
  (2026-08-24): in-editor rigging, rig templates and preset motions,
  database 3D bindings, MP3/WAV/FLAC/M4A audio, PixiJS 8.20.0.
- **0.98.4** is open in `editor/package.json`, both READMEs, and the
  `[Unreleased - 0.98.4]` sections of both changelogs. One feature (custom user interfaces, phase 1) and seventeen fixes are queued
  there already (VisuStella Effekseer/heat-distortion draw failures and
  off-centre transition shaders from user reports, Audio Player loop points, the Enemies note resize,
  seek-broken Demo tracks, the web editor's 3D suite, two PIXI 8 compat
  gaps, the map-title load soft lock, console quieting, the v8 `origin`
  accessor, render-guard noise, DB3D first-open glitches).
- Validation: **1,560 passing tests**, no failures, skips, or TODOs
  (`cd editor && npm test`, ~19 s). Syntax and `git diff --check` pass.
- `template/Demo` is the only git-tracked template. The other folders under
  `template/` are local compatibility-corpus projects (Star Shift
  Freelancers / Origins / Rebellion, Project2/3, MZ3D, Parallax, Hendrix,
  Barebones) and are ignored; tests must not depend on them.

## Open Threads (pick up from here)

Feature work, in the order the owner has been asking:

- **Rigging backlog** (see the rigging sections below): weight-painting
  brush; camera-relative preset mirroring (poses assume +Z facing);
  death/knockback presets; bird/fish templates; retargeting clips between
  same-template rigs; a terrain-driven rule-set switch so Swim is automatic;
  decimation guidance for Meshy-scale models.
- **Custom user interfaces** — phase 1 of `DESIGN-USER-INTERFACES.md` shipped
  in this cycle (see the cycle note below). Next: List and Gauge nodes with
  data sources, overlay/HUD mode, focus-order overrides (phase 2); styling
  depth (3); title/menu replacement settings (4); standalone MZ plugin (5).
- **Stock MZ battler motions are not mapped to model actions** — a 3D
  battler plays its ambient rules and named actions, but walk/attack/damage
  motion cells do not yet trigger model animations.
- **Embedded-clip follow-ups**: bake clip → keyed pose rules (needs
  animated-GLB bones registered as parts); cloth/limb interpenetration
  mitigations (per-part depth bias) — authoring-side skinning is the real
  fix.
- **Weapons/armors/items** store 3D bindings only; nothing draws them yet.
- **3D world massing** — `DESIGN-3D-WORLDS.md` phases 5–7 (Block shape,
  structures, direct manipulation) are still a plan; the character/model
  side sprinted ahead of the tileset-inferred world.
- **Diagonal strut runs as single planes** (measured 2026-08-16, under
  *Event 3D Models* below): a run whose art descends across many rows needs
  per-column depth. Design answer known, not built.
- **WebGPU**: parked. Three's WebGPURenderer is a different bundle and
  material surface; our offscreen-renderer → Bitmap → PIXI pipeline is
  portable in principle but not a drop-in swap.

Content and tooling:

- **Demo art gaps** (owner replacing stock assets as originals are made):
  `img/characters/Actor1` (actors 2–8), `sv_actors/Actor1_2..8` and
  `Actor2_2`, all five enemies have no battler art on disk, and
  `docs/demo-missing-se.md` lists the 120 SE names animations still
  reference. Intentional Demo removals must be staged with `git rm` or the
  completeness test fails.
- **Translations are hand-authored, by decision (2026-08-25).** The owner
  does not want the app depending on an online translation engine;
  `generate-deep-translations.cjs` (Microsoft edge endpoint, now 404) is
  retired rather than repaired. New phrases go into all 17 non-English
  locales in `I18nDeepTranslations.js` / the curated `I18nManager.js`
  blocks by hand; `i18n.test.cjs` fails on any locale missing a phrase. The
  shipped editor never needed the network: the file is static.
- **GitHub feedback round-up, open items** (the closed ones are in the
  cycle note below): documentation/wiki and a compatible-plugin list;
  Android APK and ARM64 (RG34xx-class) game deploys; a plugin boilerplate
  generator in the Forge or Plugin Manager; an action battle system under
  System 1. Gamepad and touch already work in games (stock `Input` /
  `TouchInput`).
- **Audit backlog** (`AUDIT-BACKLOG-2026-07-25.md`) still awaits owner
  decisions on three authored-data items; nothing there is a code defect.

## Manual Release Gates

Not runnable from this Linux checkout; do them on the release hardware.

- Open the rebuilt Web package over HTTPS or localhost and confirm the 3D
  checkbox stays checked, the canvas appears, model previews render in the
  database (fixed in the 0.98.4 cycle), and switching back restores the 2D
  map.
- Run Windows launch and Authenticode checks on Windows with release
  credentials.
- Run macOS launch, signing, notarization, stapling, and Gatekeeper checks
  on macOS with release credentials.
- Region and object-designation overlays remain absent from the 3D
  viewport; an existing editor affordance gap, not a bug.

Windows 3D-checkbox crash: **resolved and confirmed on native Windows
2026-08-22** (inline three.js injection overflowed the 1MB main-thread stack;
Blob-URL loading fixed it in 0.98.2 — `f3f87cc`, `97e0457`).

---

# Cycle Notes (newest first)

Engineering notes and gotchas from each piece of work, kept because the
suite and the next session both lean on them. Shipped-cycle narrative starts
at *History* below.

## Runtime 3D Instance Stalls (2026-08-25, owner asked "is the game affected too?")

- Yes, differently. `game-perf.mjs` + `game-profile.mjs` (session
  scratchpad; CDP `Profiler.start/stop`, aggregate self/total and caller
  chains per window). Before, walking 8 s: 3 gaps / 1,531 ms, max 1,167;
  battle first 3 s: 4 gaps / 1,133 ms, max 712. After: 300 ms / max 200 and
  133 ms / max 61. Load-fade preload untouched (~260 ms behind the fade).
- Three causes, all per new instance, none visible in the wrapped
  `Reactor3D` methods until the sampler named them:
  1. `cloneModelTemplate` → `Object3D.copy` JSON-copies `userData`, and the
     root carries `glbTextures` (THREE.Texture, whose `toJSON` encodes the
     image to a data URL): 1,338 ms across 7 clones → 2 ms.
  2. three r185 `projectObject` (`libs/three.js:77878`) calls
     `SkinnedMesh.computeBoundingSphere` while `boundingSphere === null`
     for `sortObjects`, independent of `frustumCulled`, and that walks every
     vertex through the bones: ~330 ms per 600k-vertex instance. Fix:
     `presetSkinnedBounds` (geometry sphere, computed once per shared
     geometry) in `cloneModelTemplate` and at the end of `applyModelRig`.
     `frustumCulled = false` alone did NOT fix it.
  3. `PIXISuper` (`pixi_compat.js`) threw a TypeError per ES5-style
     construction to learn a class is ES6; 489 ms self per 8 s of walking
     from `Point`/`Rectangle`. Memoised per class (`__rrEs6Class`).
- What is left and known: `texSubImage2D` ~40 ms/s (the 3D canvas →
  Bitmap → PIXI upload every frame; the pipeline, not a bug; a shared GL
  context or render-to-texture would remove it) and ~200 ms once when a
  new instance first draws (its material clones initialise; programs are
  cached). Potato-PC work would start there.

## Database 3D Preview Stutter (2026-08-25, owner-reported)

- Measured, not guessed: `db3d-perf.mjs` (session scratchpad) wraps
  `_renderThumbnail/_loadTemplate/_partUnderPointer/...` on the prototype,
  logs rAF gaps >24 ms with the active wrapper, and a `longtask`
  PerformanceObserver, then drives hover sweeps, wheel zooms, and orbit
  drags for 8 s right after clicking the 596k-triangle Carol. Before: 30+
  long tasks of ~350 ms back to back (`_partUnderPointer` 20 calls / 4.0 s,
  `_renderThumbnail` 24 calls / 8.2 s incl. 59 `toDataURL`s); the gesture
  loop starved. After: 0 rAF gaps during the gesture, cold or warm cache;
  the only long tasks left are the selected model's own load at the click
  (4 / 463 ms). Pointer motion over the canvas counts as busy for the
  idle gate (300 ms) or a deferred build lands as the hand reaches the
  drag; `_loadTemplate` wall-clock in the harness includes that wait.
- Hover: three.js raycasts without a BVH cost ~0.6 ms per 1k triangles.
  Over `HOVER_TRIANGLE_BUDGET` (150k) hover highlight is off; a click
  still runs the full pick once. GPU picking (render part ids to a 1×1
  target) would restore hover on huge meshes; not built.
- `Reactor3D.readModelAsync(buffer, ext, baseUrl, texture, { beforeBuild })`
  is the seam between worker parse and main-thread build. Do not share an
  in-flight thumbnail template promise with the preview: the thumbnail's
  `beforeBuild` waits for `_loadingPreview` to clear, and the preview
  would wait on it (deadlock). The rare double parse is the price.
- Thumbnail cache lives outside the project (Dropbox/git noise otherwise);
  keyed by source path + size + mtime, so re-exports refresh.
- "Loading model…" hint added (keyed DB3D phrase block in `I18nManager.js`,
  17 locales) via `_refreshHint` while `_loadingPreview`.

## Plugin Manager Icon + Audio Pickers (2026-08-25, GitHub report)

- Report anchors (0.98.3 line numbers) matched the tree exactly; nothing
  was in place. The parser already carried `@type icon` and `@dir`; only
  the renderers were missing.
- `RRIconPicker` is the one IconSet picker; `DatabaseEditorUI.showIconPicker`
  is a delegate. Picker overlays inside the Plugin Manager need z-index
  10010 (its child modals sit at 10002+; the command editor's own file
  picker uses 10008).
- `RRAudioPickerModal` is the global (not `RRAudioPicker`); `levels: null`
  hides the level cards and `onOk` still returns `{name,...}`. `title` is
  translated inside the modal, so it must be a phrase in the locale tables
  ("Select Audio File" is).
- Fixture rig `picker-check.mjs` + `picker-demo/` (session scratchpad): a
  Demo copy with `PickerFixture.js` registered in `js/reactor_plugins.js`
  and an SE under `audio/se/battle/hits/`. `page.eval` bodies cannot
  `await`; split multi-step DOM drives into separate evals.
- Deliberately not built: vec4-rectangle/mat3 style parsers (unrelated),
  and a generic searchable picker for non-audio `file[]` elements (they get
  the dropdown).

## New Project Dialog, Anvil, List Menus (2026-08-25, GitHub feedback)

- `UIManager.showNewProjectDialog` follows `openThemedDialog`'s shape (ids
  `rr-new-project-*`, Escape cancels, Enter in the name field submits,
  focus restored). The FakeElement harness in
  `application-shortcuts.test.cjs` has no `classList`/`closest`/`select`,
  so the dialog uses `className` and guards `select()`. Cross-realm: a vm
  object fails strict `deepEqual` against a literal; compare fields.
- Blank project = the pre-existing `createStarterProject` fallback made a
  first-class choice (`options.blank`). It has one map and an empty
  database; "no assets" is literal.
- Empty-area `contextmenu` on the two lists skips targets inside
  `[data-map-id]` because row handlers don't stop propagation; the flag
  `__rrContextMenuBound` keeps `setupMapTabs` idempotent.
- Live rig `feedback-ui-check.mjs` (session scratchpad): loads the Demo by
  writing `localStorage.lastProjectPath` then `checkAutoLoadProject()`; the
  DevTools target changes during project load, so re-attach each poll.
  `pkill -f nwjs-linux/nw` kills the calling shell (its own command line
  matches); use `pkill -x nw`.

## vec2 Uniform Views + Full-Screen Filter Textures (2026-08-25, user-reported)

- Same reporter as the Effekseer pair; both records checked against the tree.
- vec2: v8 still has the "pixi point as vec2" parser (`libs/pixi.js`
  `uniformParsers`, test `data.value.x !== void 0`), but
  `generateUniformsSync` runs it against `group.uniformStructures[i].value`,
  the construction-time value, and caches per `group._signature` +
  `program._key`. Under our compat a pixi-filters v5 class constructs with
  no uniforms, so that value is the seeded `Float32Array(2)` and the point
  path never generates. `installVec2Compat` (mv_compat, above
  `constructCompatFilter`) makes `.x/.y` and `[0]/[1]` two views of one
  value so either generated path reads right. `UniformGroup` normalises the
  structures in place (`size: 1` on scalars), so "scalar" is `size <= 1`.
  vec4-as-rectangle and mat3-as-matrix parsers have the same hazard; no
  corpus plugin hits them, deliberately not covered.
- Full-screen textures: v8 `TexturePool.getOptimalTexture` always rounds
  to a power of two (`enableFullScreen` is vestigial); the filter vertex
  shader's `vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw)`
  then spans frame/source, not 0..1. `pixi_compat.js` wraps the pool
  instance (the module singleton every FilterSystem call goes through) for
  the one request matching `Graphics._canvas`; negative keys, lazy Graphics
  lookup, stale-size destroy on resize.
- Live pixel check (`filter-uv-probe.mjs`, session scratchpad): a v5-style
  filter on the Demo spriteset at 1280×720 drawing a disc at uv 0.5 centres
  at (639.5, 359.5) with the pool holding 1280×720 textures under key −1; a
  disc at `uCenter` in `filterArea.xy` pixels lands within 0.5 px for
  `[0,0]`+`.x/.y`, `{}`+`.x/.y`, array assignment, and a held point mutated
  after assignment.

## VisuStella Effekseer + Heat Distortion Draw Failures (2026-08-25, user-reported)

- Ported from a GitHub user's debug log against their VisuStella project;
  both diagnoses checked against our tree before porting.
- `PIXI.Sprite.prototype.updateTransform` is wrapped on v8 (no-args →
  `updateLocalTransform()` + return; `(opts)` passes through). Sprite-only:
  Container/Window/Tilemap plugin `updateTransform` chains have their
  post-super work skipped by the v8 throw today and `Tilemap._prepareV8Frame`
  expects it non-fatal. `Window.updateTransform` has branched on v8 since
  `2a4cb5a` (2026-08-06), so the June note that "removing the wrap keeps
  `_updateFilterArea` skipped" was stale and is rewritten.
- Our own `Sprite_Animation.targetSpritePosition` already skipped the call on
  v8, but VisuStella BattleCore replaces it with CoreEngine's projection, so
  the guard never ran in those projects. The per-frame
  `_doEffekseerDraw` catch now warns once (`_effekseerDrawWarned`).
- `buildUniformStructures` seeds scalar array uniforms; `UniformGroup`'s
  `getDefaultUniformValue` (`libs/pixi.js`) returns `0` for `f32` regardless
  of `size` and has no `i32` case. Vector/matrix defaults were always right.
- Corpus gap: Project3's animations are all MV-style (no `effectName`), so
  the VisuStella + Effekseer path has no local repro; the reporter's
  positioning after the fix is reasoned (worldTransform is a render-group
  getter, read after `_app.render()`), and a Demo-battle probe confirms the
  no-args call on a live battler leaves the projected position unchanged.
- Found in passing by the reporter, not addressed: no `webglcontextlost`
  handler anywhere in the runtime (PIXI, Effekseer overlay, three).

## Custom User Interfaces, Phase 1 (2026-08-24)

- Files: `runtime/reactor_ui.js` (runtime), `editor/src/database/
  DatabaseUserInterfaceEditor.js` (tab), `editor/src/event/commands/
  CallUserInterfaceEditor.js` (357 dialog), `data/UserInterfaces.json`
  (records, MZ-shaped, optional). Node/action/condition shapes are
  duplicated between the editor's `defaultNode` and the runtime's
  `normalizeNode`; a test pins the anchor/type/action lists equal.
- Runtime traps hit: (1) SceneManager rebuilds a popped-back-to scene from
  its class with no `prepare`, so `ReactorUI._resumeIds` carries the
  interface id across a pushed stock scene or sub-interface; (2) the file
  must stay out of `DataManager._databaseFiles` (missing ⇒ boot stalls) and
  out of `reactor_managers.js` entirely (`project-scaffold.test` regexes
  that file for `src: "*.json"`); (3) load order before `reactor_mv_compat`
  or `Window_ReactorUINode` misses the MV `(x,y,w,h)` wrapper snapshot.
- Editor traps hit: the record-templates test parses `getDefaultTemplates()`
  with a quote-aware brace scanner, so no apostrophes in comments inside
  that literal; list getters must `filter(null)` like the others or
  `populateList` dereferences the null slot; `canvas.focus()` inside
  mousedown scrolled the canvas and broke the drag's coordinates (now
  `focus({ preventScroll: true })` after measuring); `display:flex` on a
  block beats the `hidden` attribute (scoped `[hidden] { display: none
  !important }`).
- Live rigs in the session scratchpad: `ui-runtime-check.mjs` (boots the
  Demo with `test&rrui=1`, drives focus/actions through the scene's methods)
  and `ui-editor-check.mjs` / `ui-drag-probe.mjs` (open the tab, add/edit
  nodes, synthetic mouse drag and resize, the 357 dialog), and
  `ui-sweep.mjs` (viewport sweep 1280→2560 via
  `Emulation.setDeviceMetricsOverride`, unfolded action/condition states,
  empty record, light themes; one screenshot per state). All use the repo
  `scratchpad/cdp.mjs`. Layout rules that came out of the sweep: the
  properties panel is one 4-track grid (label|field|label|field) that
  collapses pairs below 340px; the workspace stacks below 1300px of detail
  width because three columns starve the canvas before that; sections in
  the editor column never flex-shrink; the settings line wraps by column.
- The canvas preview loads the project's `mainFontFilename` through
  `FontFace` and uses MZ's line metrics (line = fontSize + (36 − main size),
  baseline at half line + 0.35·size), so text measures as the game draws it.
  `ui-kinds-check.mjs` / `ui-kinds-editor.mjs` in the session scratchpad
  write a title screen, a yes/no dialog, and a HUD-style panel into the Demo
  file, drive them in the runtime (left/right focus, switch action with
  and-close, switch-driven visibility, the cancel soft-lock guard), and
  screenshot the same three in the editor for a fidelity comparison.
- Runtime guards: condition scripts compile once (`ReactorUI.compileScript`
  cache), and cancel closes an interface whose cancel is "Nothing" when no
  enabled button is on screen.
- From the "Character Sheet" pass (`ui-sheet-check.mjs` / `ui-sheet-editor.mjs`
  in the session scratchpad): Text nodes gain `wrap` (greedy word wrap
  measured through `textSizeEx` in the runtime, through the same font on
  the canvas); Image nodes can parent; a parent's opacity multiplies down
  its subtree; nodes always draw parents-first (`ReactorUI.orderNodes` and
  the editor's `orderNodes`, applied on load and after every reorder, so a
  box moved past its children never covers them); ▲/▼ swap *siblings* and
  carry the subtree; directional wrap-around prefers the same row/column
  (the sign on the sideways penalty was inverted); the tree marks
  conditionally visible nodes with ◐.
- Owner pass 2026-08-25 (Windows): **Playtest Interface is a preview**, not
  a game. `Scene_Boot.start` wrapper (end of reactor_ui.js) → `setupNewGame`
  + `goto(Scene_ReactorUI)`; `ReactorUI._preview` = black `ScreenSprite`
  background, and `Scene_ReactorUI.close` on the preview root
  (`SceneManager._stack` empty) calls `ReactorUI.endPreview()` →
  `SceneManager.exit()` (battle test's exit; the playtest is a separate NW
  process, so `nw.App.quit` never touches the editor). The old
  `isTitleSkip` + `Scene_Map.start` hooks are gone. **Fit text to size**
  (`fitText` on text and button nodes): runtime `applyFit` bisects
  `_uiFontScale` against `textSizeEx` of the re-wrapped label, floor
  `MIN_FONT_SIZE` 8 px on both sides; editor `layoutText` mirrors it over
  `parseText(node, scale)`. Two phrases added to all 17 locales by a
  scratchpad script keyed off the "Wraps at the node width…" line.
  Live-verified on Windows NW.js (`ui-preview-check.mjs` in the session
  scratchpad — a Windows port of `scratchpad/cdp.mjs`, which hardcodes
  `/mnt/sda1` + `nwjs-linux`): first scene Scene_ReactorUI, stack 0,
  ScreenSprite background, `$gameMap.mapId()` 0, `close()` exits the
  process; fit probe 585 px → 8 px floor, wrapped 200×60 → 10 px/2 lines.
  Rig gotcha: pass the ABSOLUTE project path as the app argument — `.`
  with `cwd` set raised NW's "manifest file" dialog from Git Bash.
- Known gaps (design phases 2+): no List/Gauge nodes, no overlay mode, no
  per-node focus order, no open/close transitions, no marquee or
  multi-select on the canvas.

## Audio Player Loop Points + Enemies Note Resize (2026-08-24, user-reported)

- `src/utils/AudioLoopTags.js` is the editor-side twin of the runtime's
  `WebAudio._read*LoopComments`; keep the two in step when a format gains
  loop tags (M4A has none in either). `loopPointsFromFile` returns a Promise
  on every host; desktop reads a 128K/1M/4M prefix and only reads a WAV
  whole when its `smpl` chunk trails the data.
- `AudioPlayer` channels: `loopWanted` is the switch, `loopPoints` the
  track's own points, `loopArmed` false after a seek past the end. Set the
  element's `loop` only through `setChannelLoop` (a test enforces this);
  with loop points present the element never loops itself.
- Live check recipe (scratchpad `loopfix/`): ffmpeg `-metadata LOOPSTART=
  -metadata LOOPLENGTH=` sine fixture, an NW.js page loading
  EncryptedAssets/AudioLoopTags/AudioPlayer with
  `--autoplay-policy=no-user-gesture-required`, `playExternal` on the `bgs`
  channel (the UI channel's `timeupdate` handler expects the modal DOM),
  sample `currentTime` at 40 ms.
- Flexbox trap behind the Enemies note: `flex: 1` is basis `0%`; in a
  definite-height column the resize handle's inline `height` is then
  ignored. The other note fields use `flex: 1 1 auto`. Measured in NW.js,
  not reasoned.

## In-Editor Rigging (2026-08-23, stage 1 SHIPPED)

Owner's direction: build rigging INTO Reactor rather than sending users to
Mixamo. Stage 1 (fit + bind + pose-on-bones) is done and verified live in
both the editor and the running game.

- **Solver**: `editor/src/database/ModelRigger.js` (pure, dual-export,
  headless-testable). 13 markers → `bonesFromMarkers` → 17-bone humanoid
  (Hips root; Spine/Chest/Neck/Head; per side UpperArm/LowerArm/Hand,
  UpperLeg/LowerLeg/Foot). `computeWeights`: d⁻⁴ segment falloff, side
  gate (sign of bone head+tail x vs vertex x, margin 3% of height),
  position-weld (UV-seam twins share weights — poses would crack seams
  otherwise), 6 Laplacian passes over mesh edges, top-4 quantized to
  Uint8 summing 255. 218 ms for the 30,940-vertex engineer.
- **Runtime**: `readModelRig` / `applyModelRig` / `decodeRigBytes` in
  reactor_3d.js. Bones are THREE.Bone with `userData.parts =
  [{name, pivot:[0,0,0]}]`; `prepareModelInstance` collects `isBone`
  entries, and the EXISTING rule engine drives them — local rotation
  about pivot [0,0,0] composed into base transform IS bone FK, hierarchy
  carries parents. SkinnedMesh binds through matrixWorld with auto
  inverses; skinned meshes are frustumCulled=false and excluded from
  carveTargetMeshes (which is why rig XOR carve: both count mesh indices
  and triangles over the uncarved model — the sync path and the editor
  both branch `rig ? applyModelRig : carve+pivots`).
- **Sidecar**: `model.json` `rig: { markers, bones:[{name,parent,head,
  tail}], weights: { "<meshIndex>": {count, indices, weights} } }` —
  base64 Uint8, positions in MODEL space (the carve-pivot frame).
  `mergeSidecar` preserves `rig` untouched; `saveRig()` read-modify-writes.
- **Editor UI**: Rig tool in the strip → marker spheres (L blue/R red/
  center gold, mirrored dragging in the camera plane) + live bone lines +
  rig bar (Bind/Reset/Remove). Click-to-pose resolves the dominant bone
  from skinIndex/skinWeight under the hit face. Bone highlight boxes via
  `_expandEntry` (bone head + child heads + leaf tails). The card hides
  its Pivot row for bones (bone pivots are their heads). Guards both
  directions between rig and carve, with status messages, 17 locales.
- **Verified live** (`scratchpad/rig-check.mjs`, editor; `rig-ingame.mjs`,
  game — both restore all files): bind → bones as card targets → pose
  moves skinned vertices → save → the RUNNING GAME loads the rig, plays
  Raise-Arm via `Reactor3D.playModelAnimation`, vertex swings 11.5 units
  and returns to rest exactly. Tests: `reactor-3d-rig.test.cjs` (real
  three.js, includes the FK bend + release-to-rest).
- **Harness gotchas**: `Reactor3D.viewport().scene` is a METHOD; in-game
  the instances live at `SceneManager._scene._spriteset._reactor3d.scene
  ._modelInstances` (keys "e<id>"/"p"). The i18n audit requires every
  `_t()` literal in RR_TEXT_TRANSLATIONS — DB3D phrases are curated in
  I18nManager.js `Object.assign` blocks (NOT I18nDeepTranslations).
- **Stage 2 (next)**: procedural walk/idle for the standard skeleton,
  driven by the existing moving/idle triggers, so any rigged character
  walks with zero authoring. Sketch: gait phase from state.distance,
  sinusoid hip/knee/arm swings per side offset by half a period —
  composable as generated pose rules or a dedicated rule type.
- **Stage 3**: keyframed clip authoring on the card (timeline), export
  as sidecar clips playable through the existing "clip" rule type.
- Known limits (v1, deliberate): no per-vertex weight painting —
  deformation quality rides on the d⁻⁴ falloff + smoothing, so elbows
  and knees read fine but extreme twists will candy-wrapper.

## Rig Templates, Preset Motions, Keyframes (2026-08-23, stages 2+3 SHIPPED)

- **Templates** (ModelRigger.TEMPLATES): humanoid (17), quadruped (18:
  spine chain + Tail + 4×3 legs, names Left/RightFront/RearUpperLeg…),
  plant (Base/Trunk/Crown), vehicle (Body + 4 point-like wheel bones —
  head==tail claims a sphere around the hub). Rig bar has the template
  picker; customRig.template persists. Solver gate generalized to TWO
  axes (x and z) with thresholds at 12% of the SKELETON's own spread per
  axis (margin 6%) — separates quadruped front/rear legs AND fixed the
  latent humanoid bug where an off-centre spine marker gated the torso.
- **Phase** on swing/bob rules (`sin(2π(t/period + phase))`) — a walk is
  just phase-offset swings sharing a period. **Keys** on pose rules:
  sorted [{at, rotate, move, resize}], action plays rest→stops→rest
  (looping on ambient triggers), per-segment smoothstep, euler-component
  lerp; keys force hold=false (duration would desync). Card gains a
  Keyframes section (capture-the-sliders stops) on on-demand poses.
- **Preset Motions** (`RigMotionPresets.js`, data-only): humanoid Walk/
  Run/Breathe/Wave/Take a Bow/Nod/Shake Head/Sit/Overhead Strike;
  quadruped Walk/Idle Sway/Pounce; plant Wind Sway/Rustle; vehicle Roll/
  Bounce. Multi-bone actions share one rule name (the engine fires every
  rule matching state.action.name). "Motions…" chip in the Animations
  header (rigged models only) → rr-modal grid; Apply replaces that
  preset's own rules, hand-authored ones untouched. Preset "Bow" was
  renamed "Take a Bow" — the deep catalog translates "Bow" as the weapon.
- **Verified live**: engineer Walk = legs counter-phase through 61°,
  keyframed Wave peaks at its authored 140° and returns to rest exactly
  (scratchpad/preset-check.mjs). Meshy stress test (Captain_Carol_
  Everson, 135MB GLB, 1,625,270 vertices): preview in 3 s, bind 6.0 s,
  walk at 185 fps (carol-check.mjs). **Flag: her weights make a 16.5 MB
  model.json** — works, but a future pass should move weights to a
  binary side file or gzip them (and Meshy models deserve decimation
  guidance).
- Preview camera now orbits the model's MID-HEIGHT (`_viewCenter`, from
  extent.y × scale / 2) — it aimed at the ground plane, which cropped
  tall characters' heads (owner-reported).
- Gotchas hit: the i18n MutationObserver reverts programmatic button
  labels — dynamic-label buttons need `data-rr-i18n-skip` (Preset
  Motions' Apply/✓ Applied). The i18n audit follows `_t(x.name)` into
  `name:` object literals in src/database/ — internal rule names
  (__manual/__preview/part-N) must be assigned via `obj.name =`, not
  object-literal properties.
- **Round 2 same day (owner asks)**: Jump (keyed ROOT MOTION on part ''
  — root dips, rises 0.5 tiles, lands; unit test pins it), Swim + Float
  (whole-model prone pose on moving/idle + stroke swings; Walk XOR Swim
  per model on the moving trigger), Slash/Thrust (keyed torso-coil
  combos), and HELD stances Aim Rifle / Aim Pistol / Dual Wield / Guard
  with **Lower Arms** as the universal release (an all-zero held pose on
  the same bones — the latch handover IS the release mechanism). Sim bar
  dedupes Play buttons by action name (six-rule stances were six
  buttons). All live-verified on the engineer: jump arc −5→+64.6→0 in
  model units, swim pitch exactly −80° with 107.6° strokes, aim latched
  at −70° past its window, Guard forearms −100° held, Lower Arms → 0.
- **Next**: weight painting brush; ~~weights out of model.json~~ DONE
  2026-08-23 — binary sidecar model.rig.bin (see its own section);
  camera-relative preset mirroring (poses assume +Z facing); death/
  knockback presets; bird/fish templates; retarget clips between
  same-template rigs; a terrain-driven rule-set switch (walk on land,
  swim in water) would make Swim automatic instead of per-model.

## Size Rule + Camera Easing (2026-08-23, owner-reported)

- Model size (tiles) = LARGEST dimension now, in the sync scale AND the
  collision footprint (reactor_3d.js, two sites — keep them agreeing).
  Footprint-only normalization made slim characters taller: same-height
  models diverged by shoulder width. Wide models (car/plant) unchanged.
- Preview "jitter" during orbit/zoom was NOT frame drops (probe: worst
  7ms gap at 596k tris) — it was discrete camera stepping. DB3D editor
  and the picker ease `_view` toward `_viewGoal` per frame
  (1-exp(-dt/0.07)); all input handlers write the goal, `_applyFraming`
  included. Probe pattern for future "jitter" reports: rAF gap
  histogram idle vs interacting before touching anything.

## Binary Weights Sidecar (2026-08-23, owner asks)

- `model.rig.bin`: RRWB u32 magic + version 1 + meshCount; per mesh
  meshIndex u32 + vertexCount u32 + count×4 Uint8 indices + count×4
  Uint8 weights. Encode in ModelRigger (buildRigBinary → {rig, binary});
  decode mirrored in Reactor3D.decodeRigWeightsBinary (parity test in
  reactor-3d-rig.test.cjs).
- JSON carries `rig.weightsFile` (bare filename only — slashes/.. are
  refused on BOTH read paths); the decoded map rides `rig.weightsBin`
  in memory and a JSON.stringify replacer keeps it out of model.json.
  readModelRig prefers weightsBin, falls back to legacy base64
  `weights` — old rigs load unchanged, migrate on next bindRig.
- Editor: bindRig sets customRig + _rigBinary; saveRig writes the bin
  (deletes it when the rig is removed); loadSidecar reads it back.
  Runtime: loadModelSidecar fetches the bin (XHR arraybuffer) and
  attaches weightsBin before resolving, so every consumer (sync loop,
  battlers, faces, editor) stays untouched.
- Engineer: model.json 330KB→7KB + 242KB bin; a Carol-scale rig drops
  16.5MB of JSON parse. Live-verified editor bind → disk reload → game
  skinning through the binary path.

## Editor Worker Previews + Folder Toggle Fix (2026-08-23, owner-reported)

- `Reactor3D.readModelAsync` = the worker-or-sync wrapper; used by the
  DB3D _loadTemplate, the model picker preview, and the event editor
  preview (all async already, all generation-guarded). DB3D
  _rebuildInstance warms (compile + initTexture) right after attach —
  first-seconds orbit hitches were trickling GPU uploads.
- FOLDER TOGGLE BUG: renderModelList auto-selected AFTER painting, so
  selectModel's _openFolders seed landed post-paint — glyph said ▸,
  state said open, first click "did nothing" (it closed the open
  state). Resolve the initial selection and seed the folder BEFORE
  painting rows. Lesson: anything that mutates render state from a
  post-render hook will desync glyphs; seed first, paint second.

## Deploy Dialog i18n + Quality Range (2026-08-23, owner-reported)

- The deploy modals bake tt() at CONSTRUCTION — translations existed
  (I18nDeepTranslations covers all 88 phrases; the audit scans all of
  src/ and passed correctly) but a language switch never re-baked.
  Fix: setupModal is idempotent + stamps `_builtLanguage`; open()
  rebuilds when the language changed and `!this.worker`. Pattern to
  reuse for any construction-baked dialog.
- Audio quality select: full 1–10 (anchors at 3/5/7/10, bare digits
  otherwise — digit-only labels need no translation);
  DeploymentAssetPreferences qualityChoices widened to match. The
  optimizer always clamped 0–10 continuously.

## Model Preload + Worker Parse + GPU Warm-up (2026-08-23, owner asks)

- `collectMapModelSpecs` (isMap3D-gated — NOT shouldRender3D: cold boot
  hasn't loaded THREE, preload is what loads it) → `preloadMapModels` →
  Scene_Map isReady gate (END-of-file wrappers, 8s fail-open).
- `warmLoadedTemplates`: renderer.compile + initTexture on unwarmed
  cached templates (Set-guarded), at Scene_Map.start + per sync tick.
- GLB worker: `reactorSplitGlb`/`reactorDecodeGlbImages` in
  reactor_3d.js, assembled via toString() into a Blob-URL worker
  (`_glbWorkerSource`) — the architecture tests forbid new runtime
  files (one-module rule + boot manifest) and a Blob worker satisfies
  both AND works in the editor. Buffer transferred in and back; error →
  sync fallback with the returned buffer; bitmaps decoded with
  imageOrientation 'none' + premultiplyAlpha 'none' (three ignores
  flipY for ImageBitmap — decode orientation is the contract).
  `buildGlbTemplate(json, bin, baseUrl, bitmaps)`; `_workerParts`
  exposed for parity tests. Non-GLB formats untouched.
- Verified live: gate holds, worker live, 5/5 instances attached ~1s
  after map-ready (was 10–15s of pop-in), OBJ sync path intact.

## Facing Camera, Animation Anchor, Thumb Deferral (2026-08-23)

- Picker default view yaw 25 → 0: users straighten models against the
  preview camera, baking a counter-yaw that only shows in game (owner's
  Fleagus stored yaw −27.27° ≈ the camera angle; data corrected, per-
  frame trace pinned it: dir8 resolved 2 everywhere, yaw constant).
- targetSpritePosition: hidden sprites never reach v8's render pass →
  stale worldTransform → animations on 3D model events anchored at a
  frozen point. Fallback: parent.worldTransform.apply(sprite.x/y) when
  the sprite is invisible or apply() returns non-finite. The stand-in
  sprite's x/y IS the 3D projection, so this is the right anchor.
- DB3D _fillThumbnails: deferred past the paint + setTimeout(0) yield
  before each uncached render — first-time model loads ate folder
  clicks ("click twice" reports).
- docs/demo-missing-se.md: 120 SE names animations reference but the
  Demo no longer ships (owner replacing stock audio as found).
- Owner asked about WebGPU: three's WebGPURenderer is a different
  bundle + material/TSL surface; our pipeline (offscreen renderers,
  drawImage to Bitmap, PIXI interop) is portable in principle but it is
  NOT a drop-in swap; NW.js Chromium supports WebGPU. Parked.

## Mini Previews, In-List (None), Stale-Sprite Skip (2026-08-23)

- attachRow `previewHost`+`thumbnail` → 96px cached model render under
  the icon; row hosted in `.db-form` (aligned with fields) for weapons/
  armors/items. `modelThumbnail` is the shared cached provider on
  RRDatabase3DBindings — GOTCHA: it initially wasn't exported and the
  synchronous throw inside sync() blanked the entire weapon detail;
  thumbnail calls are now `Promise.resolve().then(...)`-wrapped.
- RRPickerIndex `leadingItem` = pinned action row atop the file list;
  showImagePicker's (None) uses it. Face/enemy callbacks call
  refreshListIcon (applyListIcon already clears on empty names).
- Runtime: Sprite_Character.updateBitmap skips the 2D sheet when the
  character resolves a model (stale characterName from before going 3D
  404'd the map); tracks name/index so isImageChanged stays quiet;
  tileId characters exempt. END-of-file wrapper rule as always.

## Actor-Page Perf, (None) Graphics, Trim (2026-08-23, owner-reported)

- Slot thumbnails cache in `reactor3dEditor._thumbs` (data URLs by model
  name; refresh once at 1.8s for texture decode) — per-render clone+
  render of big models was the lag when clicking 3D-bound actors or
  typing. `showImagePicker` `options.allowNone` adds a (None) row
  (returns ''); character/face/SV/enemy pickers opt in and their
  empty-folder alerts are removed. Box labels pad both sides (centred).
- WEB TRIM: dist-editor-worker collects used models from event sidecars
  AND Database.r3d.json (flat + actor slots), and trims RECURSIVELY —
  the flat walk would have deleted all of Vehicles/ over one unused
  member, and DB-bound models were never counted as used. Demo now
  ships 3d/ organized as Actors/Enemies/Vehicles/Weapons; map sidecar
  refs remapped. Facing marks are now explicitly OPTIONAL: the
  markless default (dir8Yaw + authored yaw) IS the glTF convention
  (front toward +Z / the camera at rest) — contract test in
  database-3d-bindings.test.cjs — and the picker shows a status line +
  Clear marks button (visible only when marks exist). The 3D slot
  checkbox lives in a flex row beside the graphic's change button (no
  label padding; single-line titles).

## Nested Model Folders (2026-08-23, owner asks)

- Any folder under `3d/` holding a `source/` subfolder is a model, named
  by its path with forward slashes (`Weapons/Sword_Fleagus`). Lister:
  recursive walk in `ModelGraphicPicker.listModels` (skips source/
  textures dirs, depth cap 6, sorted); source-file match uses the LAST
  path segment. `splitModelRef` allows slashed segments (backslash →
  slash) but rejects empty/`.`/`..` — the traversal jail for note- and
  sidecar-sourced names. All path/URL builders concatenate `3d/<name>/…`
  so nothing else changed. Tests in database-3d-bindings.test.cjs; the
  old `model(a/b)` rejection pin in reactor-3d-models was updated to
  accept folders while keeping `../` refusals. UI: folders render as
  collapsible groups in the DB 3D Models list (`_openFolders` Set,
  selection's folder auto-opens via selectModel, search expands) and in
  `RRPickerIndex.createBrowser` behind an opt-in `folders: true`
  (model picker only; the item factory refactor is shared by all
  pickers).

## Per-Slot Actor 3D + Gait Triggers (2026-08-23, owner asks)

- **Slots**: Database.r3d.json actors."id" = { character, face, battler }
  (legacy flat spec = character slot, migrates on next slot write).
  Editor `Database3DBindings.get/set(…, slot)`, runtime
  `actorSlotSpec(id, slot)`; `databaseModelSpec('actors')` stays the
  character slot (map player/followers).
- **UI**: `decorateSlot` puts a corner 3D checkbox on each of the actor
  page's three `.graphic-preview-box`es; bound → retitle (Character/Face/
  Battler Model), 140px thumbnail (rendered TWICE — first render can
  precede embedded-texture decode → black silhouette), button opens the
  picker via a capture-phase listener; unbound → original 2D flow.
- **Face**: picker `show(current, cb, {framing:true})` adds Zoom/Height
  sliders → `spec.view {zoom 1-10, y 0-1}`; preview steers to the crop.
  Runtime `actorFaceState(actorId)`: 144² portrait, camera-side key
  light, repaints at 0/0.7/2.5 s (texture decode), waiters list refreshes
  windows that drew early. Wrapper on Window_StatusBase.drawActorFace at
  the END of reactor_windows.js (prototype-replacement rule).
- **Battler**: `updateActorModelSprite` renders into Sprite_Actor's
  _mainSprite (full-bitmap frame, motion cells bypassed via updateFrame
  wrapper, SV sheet load skipped — no art needed);
  `playActorBattlerAnimation(actorId, name)`. Wrappers at END of
  reactor_sprites.js. Stock MZ motions are NOT mapped to model actions
  yet — backlog.
- **Triggers**: `walking`/`dashing` join the set. `moveTriggerActive`
  grades them; clips pick most-specific-first (dashing→walking→moving;
  two clips on one trigger: FIRST in list wins, by design); rules
  compose as ever; spin gain + pose blends share the gate; map sync
  passes isDashing (followers mirror $gamePlayer); sim bar Dash toggle.
- **Picker centring gotchas**: Box3.setFromObject reads ~EMPTY on
  skinned meshes (vertices live on bones) — centre by
  userData.glbSize, never by measuring; `aimCamera` ADDS +0.5 to x/z
  (map cell centres) — pass −0.5 to aim the true origin.
- Windows check done: every editor 3D surface loads three.js through
  MapEditor3D.injectScript's Blob-URL path (the 1MB-stack rule).

## Preview Clock, Rig Orbit, Clip Rate (2026-08-23, owner-reported)

- The DB3D preview's `frame` was rAF-tick-counted — 120Hz monitors ran
  everything 2×. Now `frame = (performance.now() - start) * 0.06` and
  applyModelAnimation runs once per animation frame (`_lastAnimFrame`
  guard) because spin/perTile gains accumulate PER CALL. Runtime side,
  the clip mixer steps by frame delta (`binding.clipFrame`, capped 10),
  never a fixed 1/60 per call — correct at any caller rate.
- Rig tool: `'rig'` joined the orbit predicate in pointerdown — a press
  that misses every marker orbits; marker hits still start rigdrag.
- Clip rules: `rate` (0.25–3, omitted at 1) → `clipAction.timeScale` +
  scaled `modelRuleDuration`; Speed % slider on the card, threaded
  through defaultWork/_poseSnapshot/_applySnapshot/editRule/_workValues/
  savePose (stale-key delete). GOTCHA: `renderEditCard`'s hasParts gate
  hid the card on clip-only GLBs (no parts, no rig) — embedded clips now
  count, which is what "adopted clips have no settings" really was.
- Backlog (owner asks): cloth/limb interpenetration (long coat vs legs)
  — real fix is authoring-side skinning; possible engine-side mitigations
  are per-part depth bias or a "bake clip → keyed pose rules" pass, which
  would also need animated-GLB bones registered as parts. Bake-to-JSON of
  embedded clips = same prerequisite (bones-as-parts on the animated
  path) + sampling tracks into `keys` timelines; clean feature seam.

## Embedded Clips + Skinned GLB Bind Fix (2026-08-23, owner-reported)

- **Animations panel lists a GLB's baked clips** (`_renderEmbeddedClipRows`
  in Database3DEditor): ▶ plays through the sim's `__preview` action with
  a transient clip rule (`playEmbeddedClip`), ＋ adopts it as a saved
  on-demand clip rule named after the clip (`addEmbeddedClipRule`) — the
  sim bar and playModelAnimation/playBattlerAnimation pick it up by name.
  Adopted clips show ✓ / disabled. i18n gotcha again: the audit flags
  `name:` OBJECT-LITERAL keys even in `_sim.action = {name: '__preview'}`
  — use `name: someVar` or property assignment.
- **THE BIND FIX** (`buildAnimatedGlbTemplate`): skinned meshes bind with
  an IDENTITY bindMatrix, not `node.matrixWorld`. Three applies
  `boneWorld · IBM · bindMatrix` per vertex; glTF IBMs already map mesh
  space → joint space, so a mesh-world bind mixed the armature transform
  in twice. Meshy/Mixamo exports (cm rig under a 0.01-scale Armature)
  looked PERFECT at rest — the error is a uniform (0.01)² shrink the
  camera framing absorbs (glbSize measured 100× small, editor scale ~94)
  — and shredded on the first animated frame while every bone local/world
  stayed numerically correct. Diagnosis path worth remembering: bones
  sane + tracks all bound + render exploded ⇒ suspect the bind, and A/B
  raw-mixer vs rule-engine to clear the engine. Regression test: the
  synthetic cm-armature skinned clip in reactor-3d-models.test.cjs.
  Verified live on Captain_Carol_Everson_Reduced's six clips.

## Database 3D Bindings — Actors/Enemies/Weapons/Armors/Items (2026-08-23)

- **Sidecar**: `data/Database.r3d.json` — `{ version, actors: {id: spec},
  enemies/weapons/armors/items: … }`, spec identical to a map sidecar
  event entry (name/file/ext/size/scale/yaw°/pitch°/roll°/faces/texture).
  Editor side: `Database3DBindings.js` (dual-export; `set()` deletes the
  file when the last binding clears). Runtime: `loadDatabaseSidecar`
  (one-shot, NW disk-stat first so absence never logs) +
  `databaseModelSpec(section, id)` → `normalizeModelSpec` (extracted from
  eventModelSpec — single raw→validated path, degrees→radians).
- **Editor UI**: `RRDatabase3DBindings.attachRow(host, {projectManager,
  section, id})` renders checkbox + name + Change Model on all five
  detail pages. ModelGraphicPicker duck-types projectManager, but
  attachRow must hand it a shim carrying mapEditor3D (from
  window.reactor.projectController) — the DB editors' bare
  {getCurrentProject} shim can't load three.js and the preview stays
  black. The picker's CANCEL never calls back — the row MutationObserves for
  `#model-picker-modal` leaving the DOM and resyncs from the sidecar.
- **Map**: `characterModelSpec` answers for Game_Player (party leader's
  actor binding) and Game_Follower (its own actor); sync list includes
  $gamePlayer + visibleFollowers; instance keys `p` / `f<memberIndex>`.
- **Battle**: `Sprite_Enemy.update` wrapper → `updateEnemyModelSprite`:
  per-sprite `_reactorBattler` state, shared offscreen `_battlerRenderer`
  (alpha), model framed to its height, ambient rules on the battler's own
  frame clock, `playBattlerAnimation(enemyId, name)` queues actions
  (`_modelActions["b"+id]`), enemyId change (Enemy Transform) rebuilds.
  A bound enemy needs no battler art: `updateBitmap` skips the stock
  image load, holds an empty placeholder Bitmap (plugins read
  this.bitmap.height for state-icon placement — null crashed the update
  loop under PSYCHRONIC_BattleEngineMZ), and still runs initVisibility
  once. **GOTCHA**: reactor_sprites.js REDEFINES Sprite_Enemy's prototype
  wholesale (`prototype = Object.create(...)` mid-file) — the wrapper
  MUST sit at the end of the file; an early wrapper binds to the
  discarded prototype and silently never runs (function hoisting makes it
  load without error). Weapons/armors/items store bindings only for now.
- **Verified live** (`scratchpad/db-actors-check.mjs` + `battle-only-
  check.mjs`, restore files): row on all five pages, picker open/cancel/
  resync, binding round-trip, player walks the map as the rigged
  engineer (17 bones, Walk rules, position tracks), and troop 1's two
  goblins render as ready 3D battlers at 60 fps with opaque pixels in
  the bitmap — under the Demo's full 44-plugin stack. Tests:
  `database-3d-bindings.test.cjs` (roundtrip, file deletion, runtime
  normalize). Marker labels + orbit perf verified (`label-perf-check
  .mjs`: 13 labels, Carol 3.1M tris at ~6 ms/frame). The Demo is still
  missing some replaced MZ stock art (owner adding originals as found):
  img/characters/Actor1, sv_actors Actor1_2..8 + Actor2_2, sv_enemies
  Crow/Gnome/Goblin/Hi_monster/Treant, MOG icon-background.

## Classes UX Pass (2026-08-23, owner-reported)

- Parameter curves now author and plot the full 1..999 domain
  (`RR_LIMITS.ACTOR_LEVEL`). Graphs draw the runtime's exact series —
  stored values, then linear extrapolation dashed past a divider. The
  Generate Curve modal's second slider is the **Level 999 value**; Apply
  writes a 1000-entry per-level array. The runtime reads exact values
  first (`classParamAtLevel`), so no runtime change; legacy 100-entry MZ
  arrays keep extrapolating.
- Learnable Skill, Trait, Generate Curve, and EXP Curve dialogs converted
  to the rr-modal chrome (secondary Cancel + primary OK). Trait tabs
  rebuilt on the `.rr-trait-row` six-column grid (theme.css) — note the
  dropdown shim wraps selects in `.rr-shim-wrapper`, which must also get
  `width: 100%` or selects collapse to their shortest option.
- Trait strips in all six editors use `rr-btn-chip` (matching the
  Learnable/Effects/Action strips; the delete chip stays plain, the
  suite pins that).
- Tests: `class-curves-and-trait-ui-20260823.test.cjs`; live rig
  `scratchpad/class-ui-check.mjs` (restores Demo Classes.json). Suite at
  1,480. Gotcha for rigs: a hidden `#event-editor-modal.rr-modal-overlay`
  always exists — don't select modals by bare `.rr-modal-overlay`.

## App-wide UX/Responsiveness Pass (2026-08-23, owner-reported)

- All inline accent OK/Save/Apply buttons → `rr-button-primary` (65
  event-command dialogs via scripted sweep, Effect/Action editors,
  PluginManager, pickers, System1, movement route, the Troop/CommonEvent
  `createButton` factory). Stale JS hover handlers that overwrote
  backgroundColor were removed wherever a button got the class — inline
  hover writes beat CSS classes and freeze the wrong color.
- DatabaseEffectEditor rebuilt on the trait modal's chrome + `.rr-trait-row`
  grid; enemy Action Pattern modal on rr-modal chrome. Dropdown-less rows
  (Attack Speed etc.) put their number in the control column
  (`.rr-trait-lone-value`) — was the owner's red-boxed gap.
- Responsiveness: `.rr-modal` gets a global viewport max-width; the 65
  command dialogs got `width: min(Npx, calc(100vw-24px))` + max-height +
  scrolling body via scripted sweep (predicate: cssText with bg-surface +
  flex column + box-shadow + width≥300).
- Actors/Classes page layout moved from inline grid styles to
  `.database-actor-pair`/`.database-class-columns` CSS so the EXISTING
  `@container database-detail` query collapses them — the repo reflows the
  DB detail by CONTAINER query, never viewport @media (a test enforces
  this; my 1100px @media was rejected by the suite).
- Card fill: the fill chain now covers `.database-actor-pair`; the
  critical fix was `align-items: stretch` on `.db-form.db-fill >
  .db-row-grow` (`.db-row-cols`' `align-items: end` pinned the grown
  Profile field to the row bottom — looked like a missing field). Action
  strips (`*-action-buttons`) are CSS classes; in filled cards they pin
  bottom via `margin-top: auto`.
- Tests: `ux-pass-20260823.test.cjs`; live rig `scratchpad/ux-pass-check.mjs`.
- Round 2 (same day): ALL ~85 event-command dialog chromes converted by
  scripted pattern (84 h3 titles, 81 close buttons, 141 header/footer
  bars — they were near-byte-identical); Troop enemy picker / Conditions /
  raw-parameter dialog (+ Common Events twin) / BattleTestConfigModal on
  rr-modal chrome; troop `createSmallButton` → rr-btn-chip, Battle Test
  launcher → rr-btn-secondary; Animation editor SE picker + effect picker
  converted, `#3a3a3a` menu hover → token. `database-navigation.test.cjs`
  pinned the OLD chrome strings (bg-toolbar headers, footer class names) —
  updated to pin the new ones. Verified live: troop pickers, conditions,
  battle test, and a directly-instantiated ChangeGoldEditor all carry the
  chrome (`scratchpad/troop-cmd-check.mjs`). Dist/Build wizard h3s are
  content section headings, not modal chrome — left alone. Selection blue
  `--color-selection-deep` is a deliberate per-palette token used across
  all list surfaces — not slop, do not accent-ify piecemeal.
- A new completeness test fails loudly if tracked Demo assets go missing
  from disk, so intentional Demo asset removals must be staged with git rm.
- Deploy Game audio: one "Compress audio (lossy)" checkbox + quality tier,
  per-format in `asset-optimizer.js` (`optimizeAudioFile`): OGG→libvorbis
  -q, MP3→libmp3lame VBR (scale inverted via `lameQuality`), M4A→aac by
  bitrate, WAV/FLAC→convert to OGG (runtime prefers OGG for a shared
  name; skipped when a same-named OGG exists). WAV `smpl` loops are
  parsed with the runtime's exact semantics (LOOPSTART=start,
  LOOPLENGTH=end-start, first loop) and injected as vorbis comments;
  MP3 TXXX loops verified via `NAME\0digits`. Loop verification failure
  or a non-smaller result leaves the file untouched. Prefs migrated
  ogg/oggQuality→audio/audioQuality (legacy keys read); the checkbox is
  NEVER restored checked (per-deploy opt-in). The translation generator
  (`generate-deep-translations.cjs`) is broken — Microsoft's edge auth
  endpoint 404s — the three new phrases were hand-authored into all 17
  locales in `I18nDeepTranslations.js`.

## Database 3D Part Carving & Pose Card (2026-08-22)

Database > 3D carves arbitrary mesh regions into named parts (box-select,
touch-anywhere marquee — `triangleTouchesRect`) and authors EVERY animation
on one always-docked GalCiv-style card: click a part in the viewport (hover
highlights) or pick from the card's target dropdown (Whole model included),
choose the motion (Pose slider tabs / Swing / Spin / Bob / Clip), sliders
move the model live while every other ambient rule freezes so nothing fights
the hand. Logarithmic Duration 0.1–10 s, Play when trigger, At the end picks
Return to rest vs Stay posed (`hold` — latches in the runtime until another
held pose claims the part; tank-cannon semantics), Preview plays it once as
in game, one button saves/updates. Per-target working state (reselect
resumes the sliders) with per-target undo/redo (Ctrl+Z/Y, header arrows);
Escape releases; × folds the card to a button. The right panel is lists
only — the numeric rule form is gone. A fresh card defaults to On demand
(never inherits the previous rule's trigger — that stickiness shipped a
silent Always once in live testing). Built for "close the monster plant's
jaw" — models whose source ships as one anonymous mesh. No keyframes by
design: pose + duration + trigger + hold covers jaws/doors/lids/turrets;
sequencing would come later as chained animations if ever needed.
Quality pass (owner-tested on Oth97_CNO_Consul): marquee occlusion-aware by
default (screen-space depth grid + `triangleDepthAt`; Through toggle for
far-side), per-drag selection undo (Ctrl+Z / bar arrow, Escape cancels),
overlays excluded from carve numbering (`__reactorOverlay`), rule
suppression in place (never filter — index-keyed blends/latches scramble),
edited rule's sim Play routes to card Preview, card Reset clears latches.
Pivot pass (turret-ring request): `pivots` override map in model.json
(model space; `readModelPivots`/`applyPivotOverrides` convert to mesh-local
after carve, editor and game sync alike), card Pivot row (presets + ✛
toggles the Pivot tool), axes gizmo draggable in the camera plane, live
re-hinge. Card target dropdown retargets the edited animation (values
intact, dead targets shown `?`); canvas click no longer pins an open
dropdown (preventDefault was blocking light-dismiss).
Animation picker from the card: pass this.projectController (the
DatabaseEditorUI shim), NOT window.reactor.projectManager — wrong shape,
null project, startPlayback bails to black for both animation kinds.
Picker list has audio-scroll pill; footer bg-panel. Effekseer preview
verified by caption ("Effekseer: <name>"), not pixels — its GL canvas
reads back black without preserveDrawingBuffer.
Timed effects: on-demand rules carry effects[{at, se|animation|flash}];
fired once per play by the sync loop as the action clock crosses at×
duration (modelEffectsToFire pure helper). animation = database Animation
id via $gameTemp.requestAnimation (2D + Effekseer both). Model flash
tints per-instance materials — cloneModelTemplate clones materials AND
rebuilds userData.baseColor as a Colour (Material.clone JSON-degrades it
to a hex number; undefined channels poisoned the flash — found live on
the tank, guarded in updateModelFlash too). Card: Effects section with
timing sliders + shared pickers; editor preview plays SE/flashes.
Ancestry composition: per-mesh rule contributions sort by part-chain
depth (ancestors first, stable within a depth) before multiplying into
the accumulator — turn-then-fire recoils along the TURNED barrel in any
rule order. Authoring-order composition broke the moment the fire rule
preceded the turn or was the card's end-of-chain working copy. Proven
unit-level both orders and live on the tank (turnedDot 1.00 vs
originalDot 0.05, `db3d-canon.mjs` turn-then-fire block).
Event clipboard: 3D model entries (map.reactor3d.events[id]) now travel
with copy/cut/paste (payload field `models`, re-keyed to the new id),
delete purges the entry (ids are REUSED — stale entries haunted future
events), and event undo/redo snapshots {events, models} together.
Flow pass (owner's click orders): Animations-list highlight mirrors the
card (selectedRule syncs in editRule/select/deselect/＋/Add); card-filling
actions un-collapse the card; panel Add = neutral motionless new
animation (old swing default rocked the whole model while collapsed); ＋
labeled "＋ New"; latch release (card paths AND sim Reset pose) cancels a
matching in-flight _sim.action — long-window holds re-latched next frame.
Fulcrum anchoring: the pivot marker re-rides its OWNING mesh (parts[0]
match preferred — a nested child also carries the name but its own rules
would drag the marker) every frame via updateWorldMatrix+localToWorld;
one-shot placement read stale matrices post-rebuild (unscaled teleport)
and froze mid-pose. Verified spread 0.0000 across reselects on the real
tank. Probe lesson recorded twice now: Turn-Turret-Right is period 600 +
hold — its RELEASE also eases for 10 s, so quiet the stage
(rebuildPlayback) before measuring anything near it.
Fire-return fix: previewing a return-to-rest pose suppresses the card's
held working pose (`_workSuppressed`, cleared by `_syncWorkRule` on any
edit) so the preview ENDS at rest — the held pose easing back in read as
a second shot / "rests at the end". Hold poses keep the seamless
handover; swings stay live. Verified read-only on the owner's Fire Canon
(`db3d-canon.mjs`; note Turn-Turret-Right is a 600-frame hold — settle it
before measuring anything near it).
Feel pass (owner-tested, turret flow): Preview zeroes its blend slot +
releases same-part latches → visibly plays from rest while the card holds
the pose; editRule releases the rule's latch (no pop on deselect); card
button = Clear (sliders only); ＋ forks a second animation per part; pivot
gizmo bigger, depthTest off, draggable from any tool; addPart cancels a
running selection session; highlight boxes refit per frame. Test rigs:
`scratchpad/db3d-monkey.mjs` (seeded random-order UI actions vs invariants,
run it with MONKEY_MODEL/MONKEY_SEED/MONKEY_STEPS; clean on monster-plant
and Oth97_CNO_Consul) and `db3d-two-parts.mjs` (two-part independence:
play/resume/update/delete isolated).

- Runtime: `readModelParts`, `carveModelParts`, `partitionCarveIndex`,
  `compressTriRanges`/`expandTriRanges`, `loadModelSidecar` (disk-stat first),
  pose branch in `applyModelAnimation` (rotate + move + per-axis `resize`
  about the pivot; mesh base scale recorded in the binding) in
  `runtime/reactor_3d.js`; instance path carves the clone before
  `prepareModelInstance`.
- Editor: `editor/src/database/Database3DEditor.js` — tool strip (orbit /
  select / pivot), viewport hover+click part picking, marquee selection on
  the uncarved clone, pivot presets + raycast placement, the edit card
  (synthetic always-pose rule for live posing; timed `__preview` action rule
  for Preview; editing a saved rule filters it from playback).
- Sidecar shape: `parts: [{ name, pivot, meshes: { meshIndex: [[tri,count]] } }]`,
  pivot in model space, converted to mesh-local at carve. Overlapping
  definitions NEST: triangles group by the set of claiming parts, pieces
  carry all names as ancestry (fewest-triangles first, own pivot each) —
  cannon-inside-turret rides turret rules, answers its own. (First-wins
  used to zero out nested parts; caught on the real tank's Canon Shaft,
  verified read-only against the owner's own sidecar in
  `scratchpad/db3d-canon.mjs`.) Pose rules carry `rotate`/`move`/`resize`.
- Tests: `editor/tests/reactor-3d-carved-parts.test.cjs` (behavioral, real
  three.js). Suite at 1,450 passing. All UI phrases curated in 17 locales.
  Runtime synced to all templates.
- Live-verified over CDP (`scratchpad/db3d-card.mjs`, restores the Demo
  sidecar): carve → sliders move the mesh → preview timing → save → sim-bar
  replay → viewport pick → undo/redo → reselect-resume → 10 s duration →
  held pose latching past its action and easing home from the sim bar's
  Reset. Gotcha found there: a part with zero applied triangles poses
  nothing — the card now says so (that state, a "Lower-Jaw" part with 0
  triangles, was exactly the owner's first-session complaint). Closing the
  card eases the part home over one period rather than snapping — that is
  the blend slot handing over, and it reads as polish, not a bug.

## Event 3D Models (2026-08-15, shipped in 0.98.2)

Events can carry a GLB/OBJ/FBX/… mesh instead of a walking sheet. Demo: Map001 event 22 ("Tank"), Buick at
`template/Demo/3d/free-buick-riviera-car/source/`, sidecar
`template/Demo/data/Map001.r3d.json`.

### What is built

- **Sidecar, not notes.** `map.reactor3d.events[eventId][pageIndex] = { name,
  file, ext, size, scale, yaw, pitch, roll, faces? }`. Degrees in the file,
  radians at runtime. `characterModelSpec` prefers the sidecar, then `<r3d>`
  notes. `MapElevation.save` keeps `events` even on a flat map.
- **Folders.** `3d/<folder>/source` + `3d/<folder>/textures`. Legacy
  `3d/source/<file>` is still probed. The picker lists folder names.
- **Picker** (`editor/src/event/ModelGraphicPicker.js`). Orbit preview, gizmo,
  X/Y/Z, size in tiles. Front/Back/Left/Right are placeable colored dots
  parented to the mesh (not snap-yaw buttons). Dots persist as
  `faces: { front: [x,y,z], … }` in object-local space.
- **Event editor.** 3D checkbox, title "3D Model", live WebGL thumbnail, Down /
  Left / Right / Up buttons. Image preview (2D and 3D) flex-fills the leftover
  left column with no scrollbar. Specs reload from the sidecar even when
  `Reactor3D` is not loaded yet. Picker OK writes the map immediately; Event
  Editor Cancel restores the baseline; project save flushes pending models.
- **Runtime pose.** In-game the Front mark aims at the event facing
  (`characterModelDir8`, including 1/3/7/9). Preview aims the matching face
  mark at the camera. A turn that would swing the footprint onto the player or
  another solid event is refused.
- **Collision.** `size` is the ground footprint. After the GLB loads, the
  actual XZ AABB is used and rotated with facing. `Game_Event.pos` occupies
  every overlapping tile; the event does not collide with itself.
- **Depth.** On a map with event models, other characters become upright
  (not `THREE.Sprite`) billboards in the 3D below pass so the car's depth
  buffer can hide them when they stand north of it. PIXI character sprites
  are hidden on those maps.

### Fixed 2026-08-16 (owner-reported, verified over CDP)

- Character billboards drew upside down: `flipY = false` (a glTF convention)
  on the CanvasTexture under PlaneGeometry UVs. Three's default is kept now.
- The player could walk into the driving car. Two timing holes:
  `eventModelContains` now covers both `_x/_y` and `_realX/_realY` (a gliding
  body kept its trailing tiles), and `eventModelWouldOverlap` accepts the
  movement direction so a turning step is tested in both body orientations.
  `Game_Event.isCollidedWithEvents` also goes footprint-wide for model
  events (the car could previously plow through single-tile NPCs).
- The mesh pivoted 90° in one frame at route corners — a nine-tile car's
  ends teleport ±4.5 tiles, seen as "flashing back to its original
  position". `syncCharacterModels` eases the visible yaw along the shortest
  arc at `MODEL_TURN_SPEED` (0.1 rad/frame); facing and collision stay
  instant. Owner confirmed the smooth turn feels right.
- A sprite in front of the car lost its head to the car's depth buffer: the
  billboard lean (a drawing device against foreshortening) tips a quad's
  upper half into the mesh behind it, and per-pixel depth honestly buried
  it. `straightenBillboardDepth` writes each vertex's depth from a vertical
  twin at the anchor — screen shape keeps the lean, depth is the upright
  quad — applied to character billboards and the tile cut-out material.
  Rays cross a vertical plane in true near/far order, so in front / behind
  settles per pixel against any mesh with no sort rules. Verified south
  (fully in front) and north (correctly clear) of the parked Buick.

### Depth model as of 2026-08-16 (owner-driven, iterated live)

One rule: real per-pixel depth, with billboards depth-twinned vertical at
their anchor. Star tiles render in the world buffer on model maps. A
stationary event on a facade cell snaps to that wall's plane (facadeAt) with
a coplanar polygon-offset pull; a walking character ON a facade's footprint
gets its depth pushed just in front of that plane (rrDepthShift uniforms)
while its drawn position stays put — pressed against the console or crossing
the reactor's apron the player stays visible; off the footprint, behind
means hidden. Character billboards take the tile cut-outs' footward step so
2D-authored stacking holds from every camera position.

### What is still off

- The player/car relationship may still want tuning; walk front, beside, and
  behind the car while it drives and judge feet vs body.
- **Diagonal struts as single planes** (measured 2026-08-16): the reactor's
  legs merge with their foot pads, so the run roots at its southernmost row
  (plane z=22.5 while the strut's art spans rows 13-20) — its entire art
  therefore beats any character north of row 22, which reads as a head
  clipped under a pylon while standing at the strut's mid-height. The
  character push cannot fix this without also breaking genuinely-behind
  cases, because the plane really is south of the player. The design answer
  is per-column or per-cell depth for runs whose art descends across many
  rows (split the strut run at its diagonal), in `uprightRuns`/the footing
  merge. Facts: machine facade z=19.5 lift 0-6; console pedestal z=20.5;
  leg/foot-pad run z=22.5. Character push samples the max facade plane over
  the sprite's overlap cells (x±1, y and y-1), never south rows.

Open questions worth not re-fighting blindly:

- Should the sort line be the event tile, the south edge of the footprint, or
  true GPU depth only?
- `size` 9 on the Buick is the longest-axis fit. The collision box after load
  uses the real aspect; before the GLB arrives it is a square of `size`.
- Turn collision now covers the swing: a turning step and a turn in place
  must clear the sweep disc (`eventModelSweepRadius`, corner diagonal) in
  both swing directions, and `eventModelOccupies` keeps the arc solid for
  `MODEL_TURN_SWEEP_FRAMES` after a facing change so nothing steps into a
  playing swing. Verified live: a diagonal bystander outside both end
  rectangles blocks the turn either way, the turn frees when clear, and
  mid-swing entry is blocked then released.

### Key files

- `runtime/reactor_3d.js` — load, pose, footprint, billboards
- `runtime/reactor_objects.js` — `Game_Event.pos`, self-exclusion, can-face
- `runtime/reactor_sprites.js` — hide PIXI sprites, sync billboards
- `editor/src/event/ModelGraphicPicker.js`, `EventPageEditor.js`, `EventEditor.js`
- `editor/tests/reactor-3d-models.test.cjs`
- Sync copies with `node editor/build-scripts/sync-runtime.cjs`

World axes: X = map x, Y = up, Z = map y. Event Down = +Z.

---

# History (shipped cycles 0.98.0–0.98.2)

Narrative for fixes that shipped in earlier cycles. The public changelogs are
the authoritative record; these stay for the reasoning.

## Encrypted-Project Support (2026-08-16)

Sojourn Saga (`/home/doug/Desktop/SojournSaga`, MZ, VisuStella + heavy custom
plugins) joined the compatibility test pile. It ships standard MZ encryption
(`.png_`/`.ogg_`, key in `System.json`), which surfaced three editor defects:

- `editor/src/utils/EncryptedAssets.js` (new) installs the desktop
  `window.RPGReactorAssetUrl`: plain files pass through as `file://`, encrypted
  counterparts decrypt to cached `data:` URLs, and lookups fall back to a
  case-insensitive directory match. The key is read from `System.json` or
  recovered from the constant 16-byte PNG header (Petschko's trick).
  `AssetFiles.list/find` present encrypted files under their plain extension.
- `TilesetPaletteViewer.cacheCurrentLayer` no longer throws on a 0x0 canvas
  when every sheet of a layer failed to load.
- The splash screen sets `pointer-events: none` when its fade starts; it used
  to eat every map click while invisible.
- Runtime: `Utils.correctFileCase` + one-shot retries in `Bitmap._onError` and
  `WebAudio._onError` fix Windows-authored case mismatches (`bell3` vs
  `Bell3.ogg_`) on case-sensitive filesystems. Synced to all templates and
  copied into SojournSaga's `js/`.

A fourth defect was in-game only: the tavern rendered fully black tile layers
under moving characters. MultiTweaks' "Tilemap animation speed" option replaces
`Tilemap.prototype.update` with the stock MZ body — legal on PIXI v5, where
PIXI ran `updateTransform` during render, but fatal on the v8 runtime, whose
repaint lives in the update tail. `Tilemap.initialize` now installs an
`onRender` fallback driving the shared `_prepareV8Frame`; a
`Graphics.frameCount` stamp keeps preparation once-per-frame (the Project3
double-prep guarantee). See `tilemap-update-replacement.test.cjs`.

Two reported symptoms are the game's own configuration, not Reactor bugs:
VisuMZ CoreEngine ships `QoL > NewGameBoot: true`, which auto-starts a new
game and skips the title **only in playtest** (`test` mode — RPG Maker's
playtest does the same), and MultiTweaks' "Stop out-focus audio" pauses all
audio while the window is unfocused.

Verified over CDP against the real project: all 9 tavern tileset sheets render,
palette populates, Event mode selects and double-click opens the editor, no
console errors; in-game `new WebAudio('audio/se/bell3.ogg')` becomes ready and
the tavern paints 2,623 lower-layer tile rects at 144 FPS.
Harness gotcha: the splash hides ~2.5s after project load — a scripted click
before that lands on the (visible) splash and reads as a false selection
failure.

## Chinese Audience Usability Pass

The reported database and event workflow gaps are covered in 0.98.2:

- Class learnable skills now have complete CRUD rather than a read-only table.
- Skill/Item Effects and Enemy Action Patterns have visible controls,
  double-click editing, and keyboard actions.
- Troop Plugin Commands open the annotated plugin/command selector.
- Event-mode double-click is more forgiving, Enter creates/edits at the target,
  and context menus display the shortcuts that operate on that target.
- Four-column 144px face sheets can contain additional rows.
- Sprite-based animation conversion produces a valid editable MV record.
- Curated Simplified Chinese terms take precedence over generated translations,
  and database layouts reflow from the detail pane's available width.

The stock MZ Conditional Branch set was already complete; the selector now
labels it separately from Reactor's extra input conditions. Quick Event Creation
is now present on an empty Event-mode cell for Transfer, Door, Treasure, and Inn.
The four recipes emit stock MZ event-command arrays, use project graphics,
database records, currency and map locations, and commit as one Undo operation.

## Web 3D Fix

The Web checkbox was not disabled. It was checked and immediately rolled back
because `MapEditor3D.ensureLibraries()` only knew how to find a desktop
filesystem `runtime/` directory. WebHost has no Node `process`, and its immutable
runtime scripts are URL-addressable rather than available through synchronous
`readFileSync()`.

The Web package already ships the required canonical files under the bundled
project:

- `project/js/libs/three.js`
- `project/js/reactor_3d.js`

`MapEditor3D` now detects WebHost and loads those classic scripts lazily and in
order through `host.assetUrl()`. Desktop keeps the existing filesystem loader.
The in-flight promise is shared so rapid toggles cannot append duplicate scripts,
and a failed request clears the promise so a transient failure can be retried.

Regression coverage verifies:

- construction does not eagerly load three.js;
- WebHost requests both project runtime URLs in order without consulting the
  desktop runtime path;
- a second activation reuses the loaded globals;
- a failed dependency names its project path and remains retryable;
- a freshly built Web archive contains byte-identical copies of both canonical
  runtime files while the outer editor page does not load three.js eagerly.

## Desktop 3D Startup Recovery

0.98.0 persisted `map3DView: true` before renderer initialization. The setting
is global to the NW.js profile, so deleting the project does not remove it. Any
later project load retries 3D, and the old failure path changed the setting only
in memory. This explains reports that enabling 3D once makes every later project
open crash.

The post-release fix fails closed:

- a new process clears any saved 3D preference before auto-opening a project;
- durable state is false before any library, geometry, or WebGL work and becomes
  true only after a successful initial render;
- activation is single-flight and can be cancelled while libraries load;
- exceptions roll back to 2D instead of becoming unhandled rejections;
- Three.js shares PIXI's existing WebGL2 context instead of creating a second
  context that can terminate the Windows ANGLE path;
- teardown disposes Three-owned resources without losing PIXI's context, resets
  PIXI's GL state and dimensions, and resumes its ticker;
- stale asynchronous rebuilds cannot commit after teardown;
- project close tears down 3D before destroying the PIXI map;
- a render exception stops the frame loop and clears the preference; and
- maps above 40,000 cells or 400,000 estimated source quads are refused before
  full-scene allocation. The verified 200x200 production map remains supported.

The immediate Windows failure was reproduced by its platform boundary: native
Linux used its own EGL/GLES path successfully, while the Windows executable used
the Windows ANGLE/D3D path even under Wine. A real NW.js WebDriver smoke test now
opens a disposable copy of Reactor One, enables 3D, renders the complete 50x50
scene (10 sheets, 3 map meshes, and 63 events), disables 3D, and confirms PIXI's
canvas and ticker are restored. The same test passes in native Linux NW.js and in
the Windows NW.js binary under Wine.

## Stale Project Runtime Fix

The repeated `filterArea.zw` screenshot identifies the 0.98.0 translator, not a
new shader variant. Updating Reactor changed the editor's canonical `runtime/`,
but an existing project's copied `js/reactor_mv_compat.js` remained untouched and
was the file Playtest actually loaded.

`reactor_main.js` now carries the Reactor engine version. During project
population, a desktop project whose `index.html` already boots Reactor is
refreshed from the canonical runtime before database or map loading. The copy is
recursive but preserves `reactor_plugins.js` and unrelated third-party plugins.
Project metadata advances with the runtime, and a project already current for
the editor version is not rewritten. Raw RPG Maker projects are not converted or
modified by this path.

## Project3 Legacy Filter Fix

The ten Haven screenshots are one incident shown at different scroll positions.
Project3's bundled Pixelate filter declares PIXI 4/5's `filterArea` uniform and
uses `.xy` for the logical input size and `.zw` for the filter-frame origin. The
PIXI 8 bridge removed the declaration and translated only `.xy`, leaving the
undeclared `.zw` reads that fail shader compilation. `Bitmap.snap()` lazily
compiled that filter while capturing the battle background, after which PIXI
repeatedly attempted to bind the invalid program.

The bridge now:

- maps `filterArea.xy` to `uInputSize.xy` and `filterArea.zw` to
  `uOutputFrame.xy`;
- maps legacy `filterClamp` to `uInputClamp`;
- accepts low, medium, and high precision uniform declarations; and
- excludes all PIXI 8 filter globals from plugin-owned uniform discovery so
  zero defaults cannot overwrite PIXI's live frame values.

The runtime sync updated Demo plus the six local templates carrying this core.
A real NW.js Project3 render instantiated its bundled `PixelateFilter`, rendered
it through PIXI 8, and completed with no captured shader errors or warnings and
`glError: 0`.

For someone still running the affected 0.98.0 package, open Developer Tools at
the welcome screen and run:

```js
const s = JSON.parse(localStorage.getItem('rr-settings') || '{}');
s.map3DView = false;
localStorage.setItem('rr-settings', JSON.stringify(s));
location.reload();
```

If the last project auto-opens too quickly, temporarily rename that project
folder first. As a fallback, close every Reactor process and rename the NW.js
profile directory so a clean profile is created. Project files are not stored
in that profile.

## Project3 Camera-Pan Flicker Fix

The PIXI 8 tilemap update synchronized its transform and mesh before
`Spriteset_Map.update()` assigned the current camera origin. A later
render-transform pass could notice the new origin, call `_addAllSpots()`, clear
the visible mesh, and leave the replacement commands dirty until the following
frame. Diagonal movement made those one-frame gaps recur as flicker.

`Spriteset_Map` now assigns the current origin before the child update cascade.
Every repaint immediately synchronizes all tile layers, including plugin-added
layers, before returning. Regression coverage checks both ordering and atomic
repaint behavior.

Project3 still showed smaller distortions along object seams because the PIXI 8
compatibility bridge also invoked the complete plugin-wrapped tilemap transform
from `onRender`. Live instrumentation measured two or three preparations in one
frame. This matters for `TF_Billboard`, which composes tall objects from 19
independently positioned and sorted row layers. Tilemap preparation now runs
exactly once from `Tilemap.update()` before rendering; Window and TilingSprite
retain their required render hooks. A rebuilt Project3 smoke test drove 23 mesh
layers through a 360-frame diagonal out-and-back pan with one preparation per
frame and no hidden, dirty, fallback, or missing-layer frame.
