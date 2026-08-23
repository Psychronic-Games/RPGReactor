# Handoff - 0.98.3 In Progress

Last updated 2026-08-22.

## Release State

- 0.98.2 is tagged and published at
  <https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.98.2>.
- 0.98.3 is open in package metadata, application startup surfaces, both
  READMEs, and `[Unreleased - 0.98.3]` sections in both changelogs.
- The 0.98.2 event 3D models, encrypted-project, stale-runtime-refresh, and
  database/event workflow changes are preserved in the immutable `v0.98.2`
  tag. New reports belong to 0.98.3.
- Current validation is **1,464 passing tests** with no failures, skips, or
  TODOs. Syntax and `git diff --check` also pass.
- Picking up (2026-08-23): the Database 3D part/animation system is
  feature-complete through timed effects and owner-tested on the tank
  (Oth97_CNO_Consul) and monster-plant; the live rigs are
  `scratchpad/db3d-canon.mjs` (targeted, runs against the owner's real
  sidecar), `db3d-card.mjs` (full card flow), `db3d-monkey.mjs` (seeded
  random-order UI actions, MONKEY_MODEL/SEED/STEPS), and
  `db3d-two-parts.mjs` (two-part independence). Demo content now carries
  the owner's turret/cannon parts and animations.

## Event 3D Models (active, 2026-08-15)

Events can now carry a GLB/OBJ/FBX/… mesh instead of a walking sheet. This is
the work to pick up first. Demo: Map001 event 22 ("Tank"), Buick at
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

## Open 0.98.3 Reports

- **RESOLVED (confirmed on native Windows, 2026-08-22):** checking 3D no
  longer terminates the editor process. The 0.98.1 shared-context work was
  chasing the wrong layer — the actual killer was injecting the 2MB three.js
  bundle as *inline* script text: V8's recursive parser overflows Windows'
  1MB main-thread stack (STATUS_ACCESS_VIOLATION), which Linux and Wine never
  hit with their 8MB stacks. Fixed in 0.98.2 by loading 3D libraries through
  Blob URLs with external-script semantics (`f3f87cc`), backed by
  crash-surviving breadcrumbs that name the stage that died and auto-switch
  context strategies, refusing to arm rather than crash a third time
  (`97e0457`). Both in `editor/src/MapEditor3D.js`.

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

## Deployment Note

Publishing the 0.98.2 source will not modify the 0.98.1 Web ZIP or an itch.io Web
channel. Build and deploy a new 0.98.2 Web artifact from the patch tag. Browsers
may retain an older service worker briefly; after deployment, reload the page
once (or clear the site's service worker/cache) before testing the checkbox.

## Remaining Manual Gates

- Open the rebuilt Web package over HTTPS or localhost and confirm the 3D
  checkbox stays checked, the canvas appears, and switching back restores the
  2D map.
- ~~On physical Windows, open Reactor One, enable 3D, orbit the map, disable
  and re-enable 3D, and confirm the editor process and 2D map remain intact.~~
  Confirmed working on native Windows, 2026-08-22.
- Run Windows launch and Authenticode checks on Windows with release credentials.
- Run macOS launch, signing, notarization, stapling, and Gatekeeper checks on
  macOS with release credentials.
- Region and object-designation overlays remain absent from the 3D viewport;
  this is an existing editor affordance gap, not part of the Web loading bug.
