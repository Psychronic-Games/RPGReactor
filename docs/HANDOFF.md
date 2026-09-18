# Handoff - 0.98.6 In Progress

## 2026-09-18 — Shatter, the eighth Collapse Effect (2D and 3D)

- Trait value 7 → `shatterCollapse` → `startParticleCollapse("shatter")`. **A dissolve and a break are different shapes of effect**: the first three presets drift cells off a climbing wave, Shatter throws polygons outward from the middle and drops them.
- **2D** (`reactor_sprites.js`): a preset carrying `fragments: true` takes `createFragmentCollapse`/`updateFragmentCollapse` instead of the particle path. A `PIXI.Particle` is a quad however small it is cut, so glass needs real polygons: the battler's frame is cut on a jittered grid, each cell split on a random diagonal, into one `PIXI.MeshGeometry` whose corner positions the sprite rewrites each frame (rotate the corner offsets about the triangle's middle, translate the middle). One draw call; a few hundred triangles is cheaper per frame than the particle path. `floor` is feet level, and `settle` freezes the outward throw after a beat so a landed shard does not slide on and smear the pile flat.
- **3D** (`reactor_battle_room.js`): `preset.fragments` swaps the `THREE.Points` shard layer for a `THREE.Mesh` from `fragmentGeometry`, three vertices per shard cut in the tangent plane of the sampled surface point (irregular angles and radii), carrying `aCentre`, `aAxis`, `aNormal`, `aSpin`, `aDelay`, `aSeed`. `fragmentMaterial` turns each shard about its own middle (Rodrigues), throws it out with `pow(min(age, uSettle), uHold)`, applies `uGravity * age²`, clamps at `uFloor`, and **lights it with the room's own lights** — a raw texture pixel is a fraction of what the lit model shows, so unlit shards read as near-black grit (measured: 0.06 against a model that looks pale grey).
- **Two shader traps cost several passes here.** A `ShaderMaterial` uniform must also be *declared* in the shader that uses it — `uCentre` was declared only in the fragment shader, so the vertex shader would not compile and the mesh drew nothing while the spark layer still did, which looks exactly like "sparse specks". And `LightGrid.glsl` brings its own `varying vec3 vRRWorldPos`, so declaring it again is a redefinition error. **A three.js shader failure is silent to `window.onerror`**: it arrives as `console.error`. Capture the console in the harness (`scratchpad/shatter-probe.cjs` does) before tuning numbers.
- Live checks: `scratchpad/demo-dissolve-check.cjs <outdir> shatter` (3D, the Demo's Tank) and `scratchpad/ssr-shatter-check.cjs <outdir> [troopId]` (2D, a real Star Shift Rebellion battle with its own battleback and battler art — the Demo ships no 2D enemy art, so it cannot show this path). Runtime 20260918.2.

## 2026-09-18 — PR #65 merged (Wisp collapse, tunable sparks) and the 3D presets brought level

- Merged cleanly (`b0ca53a`); see [PR-INTEGRATION-2026-09-18-pr65.md](PR-INTEGRATION-2026-09-18-pr65.md). **A new collapse kind has to be added in two places**: `Sprite_Enemy.PARTICLE_COLLAPSE` in `reactor_sprites.js` for flat battles, and `BattleRoomView.DISSOLVE` in `reactor_battle_room.js` for battle rooms, because `P.installRoomAnchors` passes the preset name straight through to `room.startDissolve` and an unknown name falls back to `ash`. The 3D preset now carries its own `spark` object (`count`, `colour`, `life`/`size`/`buoyancy`/`curl` as multipliers on the shard numbers, `fade`, `peak`, `core`); `peak` below 1 with `core` 0 is what makes overlapping sparks accumulate into a glow rather than read as grit. Runtime 20260918.1.

## 2026-09-18 — PR #64 merged (editor reads the project's parameter names)

- Merged cleanly (`a4920cd`); reviewed as a draft, no defects found; see [PR-INTEGRATION-2026-09-18.md](PR-INTEGRATION-2026-09-18.md). **Any editor surface that names a base parameter must call `globalThis.rrParamNames(translate)` from `src/utils/ParamNames.js`, never its own literal list** — the two literal lists left in `DatabaseEditorUI.js` are the Terms page's own field labels and must stay literal. The util falls back to the translated English default for a slot the project has not renamed, so sandboxed tests that assert English labels keep passing; a vm context needs `tests/helpers/param-names.cjs` or it throws `rrParamNames is not a function` on the first row rendered. Editor-only, no runtime revision bump. New guard: `editor-sources-parse.test.cjs` parses every script `index.html` loads.

## 2026-09-17 — PRs #62 and #63 merged (Ash/Ember collapse, class curve target level)

- Merged cleanly (`35bfc24`); see [PR-INTEGRATION-2026-09-17.md](PR-INTEGRATION-2026-09-17.md). Runtime revision 20260917.1, all bundled projects synced. Collapse Effect trait now has values 4 (Ash) and 5 (Ember) driven by `Sprite_Enemy._particleCollapse`. A room battler (`sprite._reactorRoomKey`) is routed in `P.installRoomAnchors` to `room.startDissolve(key, preset)` and its sprite's collapse runs as many frames (`_effectDuration`), so the battle waits.

## 2026-09-17 — 3D Ash and Ember

- `ReactorBattleRoomView.startDissolve(key, 'ash'|'ember')`: `surfaceShards(object, count, T)` samples the posed surface area-weighted (skinned meshes through `getVertexPosition`), colouring each point from the material's texture via `texturePixels` (canvas read once per texture, sRGB→linear, times `material.color` and vertex colour; material colour alone where no document); a `THREE.Points` with a `ShaderMaterial` (`shardMaterial`) runs each shard's own clock from `aDelay` (height fraction × `waveSpread` + jitter): buoyancy, curl, shrink, `pow(remaining, fadePower)`, size attenuation via `uScale` (`height / 2tan(fov/2)`; ortho flag). Ember adds a second additive Points of sparks. `updateDissolve` (called from `render()`) raises `material.userData.rrDissolve.value` from the box's minY to maxY over `waveSpread` frames, fades `record.dissolveShadow`, and at `duration` (waveSpread + shardLife + 8) hides the object and frees the points; `remove()` frees them too. `Reactor3D.injectDissolve` (in `litMaterial` after `injectBlendColor`) discards fragments with `vRRWorldPos.y < rrDissolve`. `P.mirrorSpriteLook` yields to a dissolving record and clears the hit blink's tint once (the first live run showed a white tank: the last blink frame's tint was left on). Presets in `BattleRoomView.DISSOLVE`. Test at the end of `battle-presentation.test.cjs`; live: `scratchpad/demo-dissolve-check.cjs <outdir> ash|ember` (Tank with trait 63/4 or 5 and one HP). Runtime 20260917.2.

## 2026-09-16 — Palette sideways scrollbar on the web

- `#tileset-preview-canvas`, `#region-palette-canvas` and `#object3d-palette-canvas` were `min-width: 100%; min-height: 100%` at their natural pixel size (8 × tile size) inside `overflow: auto` containers; `html.rr-web #sidebar` is `clamp(260px, 30vw, 380px)`, so 384px (48px tiles) or 512px (64px) always overflowed sideways. Now `width: 100%; height: auto` with the containers `overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable`. Click mapping already divides by `rect.width`, so hit-testing is unchanged. `map-objects-3d.test.cjs` pins the three. Live: `scratchpad/palette-fit-check.cjs` under the `rr-web` class reports canvas 369px in a 369px client with no sideways scroll at both 384 and 512 natural widths.

## 2026-09-16 — Reactor event commands translated (user zh-Hans patch)

- A zh-Hans patch (`RPG_Reactor_zh-Hans_patch_v0.98.6.zip`, one appended block) named six quest/media commands and the Reactor tab. The names live in `RR_EVENT_COMMAND_NAMES` (looked up by `tEventCommandName`, falling back to `tText`), which the i18n gate does not audit. **Load order matters:** `I18nReviewedTranslations.js` loads before `I18nManager.js` and the manager merges `RR_REVIEWED_TRANSLATIONS` over the base tables at its end, so the reviewed layer wins; an audit that loads the reviewed file last sees phantom gaps (Switch Light, Lighting, Game Flow are all reviewed-covered). The six names went into the reviewed `commands` tables for all 17 locales, and the tab qualifier into reviewed `sections` and `text` for the eight non-Latin-script locales (the manager's own IIFE forces `'Reactor'` back, but the reviewed merge runs after it). `i18n.test.cjs` requires reviewed Polish to cover the whole command catalog. Guard: `event-command-names-i18n.test.cjs` loads the three files in the app's order and requires every `name:`/`title:` in `EventCommandPicker.js` to resolve per locale.

## 2026-09-16 — PR #61 merged (enemy state conditions)

- Merged GitHub's `origin/main` (PR #61, Xehanort88) cleanly; see [PR-INTEGRATION-2026-09-16.md](PR-INTEGRATION-2026-09-16.md). Runtime revision 20260916.1, all bundled projects synced. `Game_Battler.actionConditionStateIds` and the `params` list on action conditions are the new data points; the forecast's `no-target` reason is new.

## 2026-09-15 — Spot light guide mirrored in 2D (Discord report)

- `LightingManager._aimPoint`, the cone lines in `_renderMarkers` and the `aim` drag used `+yaw` (aim = (sin yaw, cos yaw)); `FlatLightField2D.aim`, the game's `syncReactorFlatLights` (rotation π − scene yaw, scene yaw = −data yaw) and `Reactor3D` (setLights receives `-light.yaw`) all aim at (sin −yaw, cos −yaw). Guide and drag now negate yaw; the 3D rings already did (`RRPoseRings3D.sync(…, -light.yaw, …)`). Data and runtime untouched. Test at the end of `lighting-tool.test.cjs` pins the four against each other.

## 2026-09-15 — CI red since the 0.98.6 tag: tests read Star Shift Rebellion

- `clean-checkout` failed on every run since `v0.98.6` because `action-sequence-generations.test.cjs` required three corpora (Demo, Star Shift Rebellion, fixture) and `victor-motion-import.test.cjs` read Star Shift Rebellion's data; `template/Star Shift Rebellion` is gitignored, so CI never has it. The first now needs only the Demo and the fixture, the second skips when the project is absent. **Reproduce CI locally** with a fresh clone (`git clone --no-hardlinks file://<repo> /tmp/x`), `npm ci --ignore-scripts`, `npm test`: the clone holds only committed files, which is what catches a test leaning on a gitignored project.
- `gui-smokes` failed on a different step each run (web persistence on the tag, interaction order on the PR #60 merge); both pass in the clean clone here (`npm run smoke:web`, `npm run smoke:nw-interactions -- --nw-root=nwjs-linux`), so they are runner timing, not code. Read the step log on the Actions run page to see the assertion.

## 2026-09-15 — PR #60 merged (music sequence library, battle music, Quests tab)

- Merged GitHub's `origin/main` (PR #60, Xehanort88) over the 0.98.7 bump; one conflict in `editor/CHANGELOG.md` (heading), see [PR-INTEGRATION-2026-09-15.md](PR-INTEGRATION-2026-09-15.md). Runtime revision 20260915.1, all bundled projects synced.
- New editor modules: `database/DatabaseMusicSequenceEditor.js`, `utils/BattleMusic.js` (battle music resolution troop → Change Battle BGM → map → System), `utils/SequencePreview.js`, `database/DatabaseTextCodes.js`. Library lives on `System.json` as `reactorMusicSequences`. Quests: `QuestImporter.js` reads leading icon codes; **Quest log in game** switches the VisuStella plugin on save.

## 2026-09-13 — Web filename casing, Demo sounds

- `Utils.correctFileCase` on the web reads `js/reactor_files.json` (`Utils.loadWebFileIndex`, fetched once on first need, skipped under `window.RPGReactorHost`; `setWebFileIndex` builds a lowercase → real map; `correctFileCaseFromIndex`). `editor/build-scripts/web-file-index.cjs` writes the index; `build-worker.js` (web platform, after the copy) and `dist-editor-worker.js` (into `pkg-web/project`) call it. Tests: `web-file-index.test.cjs`.
- Demo `Animations.json` (421 timings, 112 names) and `System.json` sounds now name Demo files by family (mapping in `docs/demo-missing-se.md`); `demo-template-completeness.test.cjs` fails on any sound the Demo names but does not ship. Runtime revision 20260913.21.

## 2026-09-13 — PRs #57 and #58 merged

- `origin/main` (PRs #57, #58, three commits) merged into the local `main` that was two commits ahead; merge commit, not a rebase. One conflict in `I18nManager.js` (both sides appended translation blocks; both kept). Runtime **20260913.1**, `sync-runtime.cjs` refreshed 49 files across the 13 projects. Suite **3,130 passed**. [Details](PR-INTEGRATION-2026-09-13.md).
- New runtime surface: `Game_Action.itemRepeats` (rolled once per action, keyed by item; `repeatsMax` optional on skills/items), `Game_Action.setPlannedTargets/hasPlannedTargets/clearPlannedTargets/takePlannedTargets` (WeakMap, never serialized), and `addState` returning early when `addNewState` did not land the state. `Scene_ItemBase.applyItem` reads `numRepeats` once.

## 2026-09-13 — Sound export formats, pattern grid listeners, collapse restore

- **Export.** `editor/src/forge/SoundEffectGenerator/AudioExport.js` (`RRAudioExport`): `encodeWav` (all channels), `encodeMp3` through lamejs 1.2.1 (`loadLame(require)` first defines `MPEGMode`, `Lame`, `BitStream` as globals, which that package version reads but never defines), `encodeOggOpus` through WebCodecs `AudioEncoder` (opus at 48 kHz, resampled through an OfflineAudioContext; the OpusHead comes from `decoderConfig.description`, pre-skip read from it) packed by the pure `oggPage`/`oggOpusFile` (CRC 0x04c11db7 unreflected, lacing, BOS/EOS flags, granule = pre-skip + samples). `bitrateFor(format, 1..10)`. Generator: `saveFormat`/`saveQuality` in its config, Format select + Quality slider in the footer, `_qualityLabel`. Not tried in a live NW window (owner working): the Opus path is guarded by `isConfigSupported` and fails with a clear message; the Ogg writer and MP3 are unit-tested (`audio-export.test.cjs`). lamejs is LGPL; it is a dependency, not vendored.
- **Grid.** `_wireEvents` runs on every `_render` and registered mousedown/mousemove/mouseup on the persistent root each time; now an AbortController per wiring (`_gridWiring`) drops the previous set.
- **No shadows in battle rooms.** `Reactor3D.Shadows.appliesTo(renderer)` is true only for the map's renderer that owns the atlases; `ReactorBattleRoomView` has its own WebGLRenderer, so its lit materials compile without the shadow variant and nothing there ever cast one. Rather than teach the atlas a second renderer, battlers get a blob: `BattleRoomView.shadowTexture()` (a 64² DataTexture radial falloff, no canvas so it works under node), `ensureShadow(key, record)` (not for `prop:`/`event:`/`extra:` keys, not in the 2D projection) at the end of `addModel` and in `billboard()`, `shadowSize` from the model extent × scale × .85 or the billboard's width × .7, `place` keeps it at y .02 and shrinks it by 1/(1+lift·.35), `updateShadow` (from `render`) follows the object's visibility and first transparent material's opacity and fades 1/(1+lift·.6), `remove` disposes it. Test in `battle-sequence-expansion.test.cjs`. Proper cast shadows in rooms would mean an atlas per renderer; noted, not done.
- **Hand markers (rig).** `ModelRigger` humanoid template: `palmL/R` plus `<finger>Base<side>` / `<finger>Tip<side>` for thumb, index, middle, ring, pinky (`FINGERS`, `fingerKey`); finger markers carry `fine:true` (half-size dots, labels shown under distance .9). `completeMarkers` keeps placed markers and derives missing hand markers from the saved elbow→wrist (palm 1.33, bases 1.5, tips 1.66, thumb 1.32/1.48, spread along z by `FINGER_SPREAD`×forearm). Hand bone tail = middle fingertip. Runtime `attachRigHands` stores `__reactorPalm`, `__reactorKnuckles` (mean of bases), `__reactorFingers` (mean of tips) and `__reactorFingerPoints` on the hand joint, deriving from the joints themselves when unmarked (never from the template's bone table: a mapped file skeleton need not sit where the template does). Rig mode now rebuilds the instance at rest and skips `applyModelAnimation` (markers describe the bind pose). The DB 3D viewport has `_viewGoal.pan`: wheel zooms toward the point under the pointer (`_pointUnderPointer`: a rig marker within 36px, else a throttled model raycast, else the centre's depth plane; the camera stops .06 short of it; floor .12, camera near .02), Shift-drag or middle button pans (`_panView`); markers hold a constant screen size and labels grow with the square root of the zoom (`_updateRigOverlay`, `_placeRigLabel`). `editor/src/database/MeshSurfacePicker.js` (`RRMeshSurfacePicker`) is a triangle BVH built once per rig-mode instance from the posed surface (`_buildRigSurface`, ~240 ms for Carol's 149k triangles; three's own raycast on a skinned mesh costs ~270 ms per call, so never use it per pointer move): `_dragRigMarker` snaps through `_rigSurfacePoint` → `pickFlesh` (entry crossing to the next exit, midpoint when within `_rigThickness` = 30% of the model span, else 1 cm under the entry; off the model the drag stays in the camera plane), `_refreshRigMarkerFit` sets opacity .95 inside / .35 outside via `inside` (crossing parity, three axes, majority), `_updateRigHover` swells the marker under the pointer ×1.7 with a pointer cursor, and the wheel's `_pointUnderPointer` uses the tree's first crossing. Labels: `_makeMarkerLabel` sizes the canvas to the text (`__aspect`), finger markers use `marker.short` in the viewport, `_updateRigOverlay` caps `kLabel` so a main label is ≤46px on screen, and `_declutterRigLabels` runs every frame (hover/drag first, joints before fingers, fingers only under distance .9, any box crossing a placed one hides). `_updateHover` (part raycast, ~270 ms on Carol) is skipped in rig mode. Live checks: `scratchpad/db3d-rig-hand-check.cjs`, `scratchpad/db3d-rig-snap-check.cjs`.
- **Into the fist.** `attachmentQuaternion` now answers `{quaternion, forearm, fist}`: the forearm only from a joint above the hand (`isBone`, `__reactorRigBone` or carved parts, never the model root, which a unit test relies on), the fist from the finger roots when the file has them (70% of the way from the wrist to their mean) else .045 × model height along the forearm, plus .02 × height toward the inside of the elbow (the shoulder direction projected across the forearm) when the arm bends. `attachmentPoint` for a hand attachment with no bone name uses that fist. The editor re-runs its hold closures at the end of `paintSequenceLayers` (the flight maths re-pose the models) and attaches the updater per preview view (`_holdView`); before that, a second shot in the lab showed a pistol floating where the reach had put the hand while the arm was reset (probe: grip .14 tiles past the wrist on Fleagus at every frame of the slash). The Fleagus model carries its own sheathed sword at the left hip, which is not the held one.
- **Hit recoil and grip middle.** `BattleRoomView.recoilOffset(t, size)` (pure; back .4 tiles × min(1, 3/size) over 6 frames, spring past home, null after 18), `startRecoil(key, from)` from the presentation's `performDamage` wrap with the subject's room position, `applyRecoil` after `applyModelAnimation` in `render` offsets `object.position`, never `record.position`. `heldShape.grip` is now the middle of the narrow run behind the widest slice (within 1.4× of the narrowest), .15 on the Demo sword (fist mid-handle, pommel above, guard below) and .35 on the rifle (a real pistol-grip position); raises use a forearm bend of −30/−35 so the blade rises over the shoulder.
- **Imported effects.** Demo animations 125–132 are copies of Freelancers 727, 728, 793, 791, 698, 731, 786, 695 (`effects/*.efkefc` + `effects/Texture/DCSD_*` + `audio/se/<effect>.ogg` copied); the Demo icon sheet already carried icons 752/753/754/453. `demo-apply` also rewrites stock SE names in the built-in animations the Demo uses (Powerup, Magic4, Up1, Ice4, Attack1, Heal3, Saint2 → Demo sounds); 292 other stock names in unused built-in animations are still missing on purpose. The owner saw enemies vanish after hits: `P.mirrorSpriteLook` now treats `_effectType==='blink'` as a white tint on the off frames with opacity held at 255 (logged with a per-frame visibility tracker in `demo-battle-actions.cjs`). `cinematicCamera` glides every frame (`CAMERA_GLIDE` .12), `shot.side` remembers the swing-out choice, transitions are 36/30 frames.
- **Demo battle sequences (2026-09-13).** Authored in code: `scratchpad/seq-build.cjs` (step builders over `B.step`), `scratchpad/demo-seqs.cjs` (every sequence; pose conventions in the header: X bends forward/up, Z swings sideways with the left arm mirrored, Y twists; the sword is held at rotation 70 so the blade runs along the forearm, a gun at -8), `scratchpad/demo-apply.cjs` (writes sequences 18, 20–32 and the records: skills 4–7, items 20–21, weapon 50 Railgun Rifle bound to `Weapons/Railgun Rifle` at size 2.2, class 9/10 learnings, enemy actions and HP, Carol's equips, test battlers, BattlePresentation bindings). Re-run apply after editing demo-seqs. Review loop: `scratchpad/seq-lab.cjs <config>` opens the editor preview on a Demo copy with cast/orbit/lift/probe per shot and screenshots frames (`seq-sheet.py` tiles them); `scratchpad/demo-battle-actions.cjs` forces a queue of party actions in the battle test and captures the room per sequence. Tails after a hit are ≤ 12 frames on purpose: the impact shot holds the targets until the action ends.
- **Held by shape (2026-09-13, late).** `Reactor3D.heldShape(object)` (cached in `userData.__heldShape`): sampled vertices in the object's frame, bounding box, longest axis, 10 slices of max cross-radius, `widest` slice → the handle end is the end nearer it (`tipAtMax=widest<5`), `grip` = narrowest slice between the handle end and the widest one, `down` = mean off-axis offset (bulk), `base` = handle end point. `BattleRoomView.attachmentQuaternion` now returns `{quaternion, forearm}` (hand orientation and elbow→hand direction); `place()` with `p.frame` builds the model basis (axis→forward, up→world up) with the step's Tilt/Turn/Roll as an adjustment about the hand's axes and puts the grip point (`pivotY` 0 = `shape.grip`, else a fraction along the axis) at the hand. Both the game (`draw` in `P.sequenceVisuals`) and the editor (`paintSequenceLayers` → `hold()` closures run from `view.sequenceVisualUpdates` after the frame's animation) go through `room.holdHeld(ownerKey, heldKey, step, ownerPose, at, placement)`: `holdAim` (weapon `aim:'target'`: `reachArm` on the holding arm to `S + dir·d`, d = grip length + .12 for an item longer than 1.2 tiles, else .86 of the arm; the frame's forearm becomes the aim line, aimed at .55 × the target's size), then `attachmentPoint`, `place`, then `holdBoth` (weapon `hands:'both'`: the other arm reaches .3 of the way from grip to tip). `reachArm(key, side, point, {down})` is a two-bone reach in world space on the hand node's parents. `applyModelAnimation`: under a `pose:` action a model that is not moving plays its idle clip paused at time 0 (`key = clip + ':posed'`), never the bind pose. Weapon step fields `hands` (one|both) and `aim` (none|target) with 'Held With'/'Aim' selects in the inspector. The Demo's grip test labs (`scratchpad/lab10–17`) and the close-up battle audit (`scratchpad/demo-battle-audit.cjs`: the cinematic camera replaced by a pinned follow camera, 960×720 crops every 3 frames) are how this was verified; the owner's own eyes caught the reversed sword and the bazooka hold first.
- **Aimed pose parts.** Part entries carry `aim:'target'|'user'`; `B.aimedParts(step, aimOf)` resolves them to `rotate:[0,turn,0]` inside `B.partPoseRules(step, previous, aimOf)` / `B.posePlan(sequence, aimOf)`. `ReactorBattleRoomView.aimTurn(key, part, at)`: rest forward = pivot of the part nested inside (listed before it on a shared mesh: a turret's gun) minus the part's pivot, in the model frame (`binding.root`), else +Z; signed angle about +Y to the point. Runtime resolves at cue time on the live room; the editor resolves in `ensurePoseRules` by placing the model at the step's evaluated pose first, and recomputes until the binding has loaded. `keepPose` on a motion skips the release (runtime `releasing` and `B.posePlan`). UI: 'Aim at target' and 'Keep posed parts' checkboxes in the Pose Parts fold. A 179° aim (target behind) turned the wrong way in the lab; the room layout never asks for it.
- **Rule effects in rooms.** `fireRuleEffects(record, action)` from `render`: `R.modelEffectsToFire` over the action's rules, named effects from `record.effects` through `queueEffect(..., true)`, plain animations likewise, `se` through AudioManager; the Demo Tank's 'Fire Canon' rule got `effects:[{at:0,effect:'effect'}]` plus a recoil key. `attachmentWorld` falls back to a carved part's pivot for `bone` names (`bone:'Canon Shaft'` with attachment rightHand).
- **Cinematic camera, second pass.** Blockers are cached world boxes per shot (`eyeBlockers`, `Ray.intersectBox`, skipping boxes that contain the look-at point) instead of triangle casts every frame (the owner saw lag spikes); a shot whose clamped distance falls inside its subject (the tank against the west wall) tries the mirrored side then the far side; a barrage (more than one flight in the air, held for 24 frames after) is watched from the shooter.
- **Cinematic focus.** Owner: the cuts often missed the centre of the action (a projectile, an approach). `ReactorBattleRoomView.setCinematicFocus(points,{yawOffset,hold=3})` stores `shot.focus` (points in room tiles with `weight`, and `key` for a battler so `focusHeight(record)` sizes the shot); `cinematicCamera` uses a live report (weighted centroid, span from every point, told yaw offset) over the legacy user/targets framing and glides toward it through `cinematicTrack` (one 0.2 step per frame, yaw on the short arc; reset by begin/end). `P.sequenceVisuals` reports from `update()` each sequence frame (`reportFocus`): live flights (`entry.live`, `entry.point`) ×2 with each flight's target (yaw +35); during a user Move to `target`/`approach` (`approachUntil` noted in `cue`) user + first target (offset 90); in the impact phase the living targets (a dead enemy is dropped) plus the user when within 4 tiles (offset 70); otherwise the user plus an adjacent target (offset 45). Yaw is now relative to the user→target line in both paths: `Camera.place` puts the eye at (−sin yaw, cos yaw)·d, so `180−shot.yaw` is straight behind the user and the offset swings the eye round from there; the old `shot.yaw+60/100` landed on whichever side the absolute facing put it, which is why cuts sat inside the tank or behind the target. A told shot caps its span at `spanCap` (4 tiles; a projectile ×3 weight rides in frame and the target enters as it nears), and every cinematic camera, blended or not, passes `distanceInsideRoom(c)`: the eye stays a tile inside the map's width/height, under `map.reactor3d.room.height` (else `EYE_CEILING` 6), and in front of the first thing a ray from the look-at point toward the eye meets in `scene.children` minus the cast, held weapons, thrown things and shadows (cast every third frame, `_eyeRayCache`). The first attempts had the eye leaving the room on a 40-tile span and easing through a console on the way in from the overview. A report lapses after 3 frames, so plain MZ actions and the existing test path are unchanged. Test at the end of `battle-presentation.test.cjs`; checked live with `scratchpad/demo-graviton-check.cjs` (frames 5–64). Runtime 20260913.18.
- **Sequence poses compose from rest.** Owner: Jolt Eagle's Graviton Shot aim changed "right after the projectile". Reproduced in battle (`scratchpad/demo-graviton-check.cjs`, and `demo-graviton-pinned.cjs` with the impact camera cut disabled) and in the editor (`scratchpad/demo-editor-graviton.cjs`): the pose is a -93° RightLowerArm bend added onto the running clip; Jolt Eagle alone has an idle clip (Idle_10, a boxing guard with fists up) so the bend put the pistol at his head, and in the editor the projectile cue's own `applyModelAnimation` calls kept the Walking clip until the flight ended, then Idle_10 took over. Fix in `Reactor3D.applyModelAnimation`: keyed pose rules carry `fromRest` (set by `B.partPoseRules`; `readModelAnimationRules` sidecar poses do not), the keyed branch records `restWeight` (instant → 1, else progress) on the pooled action, and the base loop blends a clip-driven entry's base from `clipBase` toward `basePosition/baseQuaternion/baseScale` (the bind pose captured in `prepareModelInstance`) by the strongest matched `rest` before conjugating and composing. `B.partPoseRules` keeps a rule for any part the step lists even at rest (`listed`), so an author pins a part. Demo Graviton Shot pose step lists RightUpperArm at zero. Tests in `battle-sequence-expansion.test.cjs`. Runtime 20260913.17. The battle-side camera cut at impact (`cinematicImpact`) means in battle the user is never on screen after the hit; that is unchanged.
- **Start messages switch.** `P.settings.startMessages===false` makes the `BattleManager.displayStartMessages` wrap (installed beside the invokeAction wrap) return early; System › Options checkbox writes/deletes `battlePresentation.startMessages` via `data-presentation` on the shared `.system-checkbox` handler in `DatabaseSystem1Editor`; Demo off. Test in `battle-presentation.test.cjs`.
- **3D model folder headers.** `Database3DEditor.renderModelList` builds each folder head as `.database-list-item.r3d-folder-head` (`.open` when expanded, `aria-expanded`) holding `.r3d-folder-chevron` (rotates closed), `.r3d-folder-name` and `.r3d-folder-count`; styles at the end of `editor/css/styles.css` under `.r3d-model-list > .r3d-folder-head` (bg-toolbar bar, 3px accent strip, uppercase 11px, the Lighting/Map Properties family). Checked by a static render of the list markup with the editor's CSS in headless chromium, dark and light.
- **Step picker.** `DatabaseActionSequenceEditor.showStepPicker({phase,index})` builds an `.rr-modal-overlay` › `.rr-modal.rr-step-picker` (header, search input, one `.rr-step-picker-group` section per entry of `stepGroups()`, `.rr-step-picker-item` buttons carrying `data-step-value`), filters by label or type on input, Enter picks the first visible item, Escape/×/backdrop close through `RRKeyboardNavigation.modal`, and a choice runs `insertSteps(newSteps(value, phase), index)`. `stepGroups()` returns `[label, entries]` where an entry is `{value, key, label, extra, hint, raw}`: `key` (`data-step-value`) is `type` or `type:operation`, `extra` is spread into `B.step` by `newSteps(value, phase, extra)` (`se:system` → `{operation:'system'}`, `se:stop`), so the `se` command (relabelled 'Sound Effect'; runtime 20260913.16) is offered only for what Play Sound cannot do and each capability shows once. Groups: Templates, Movement, Battler, Action, Targets, Audio, Camera & Screen, Battle UI, Game Data, Logic; the body sits on `--color-bg-panel` and each group is a `.rr-step-picker-group` section (bordered, `--color-bg-surface`, the Database section pairing) with a `.rr-step-picker-head` bar (bg-toolbar, 3px accent strip, 11px uppercase, the Map Properties/Lighting section family) and content-width chips on `--color-bg-panel` (#111 dark, the field colour in light) wrapping in a flex row (`.rr-step-picker-groups` carries the 8px gap between sections; the search is a `database-field-value`); hints are chip tooltips. Rendered check without touching the owner's desktop: serialise the mini-DOM picker to a static page with the editor's CSS and screenshot it with headless chromium (`chromium --headless=new --screenshot`). `stepDescription` titles `se` rows by operation. Openers: the bottom Add Step… button (selected step's phase, `selected+1`), the context menu's Add Step…, and the phase head + (`phaseInsertIndex(phase)`). `this.stepType` and the button's drag-to-add are gone (`newSteps` defaults to `basic:Run to Target`; row dragging is unchanged). Styles at the end of `editor/css/styles.css`; four strings in 17 locales. Test in `action-sequence-editing.test.cjs` on `tests/helpers/mini-dom.cjs`, which gained `append`, `replaceChildren` and `classList`; a failing assertion there must compare booleans, not nodes, or the assert diff serialises the whole DOM and the runner is killed at 137. `nw-sequence-authoring.cjs` drives the picker natively (not run this session: the owner was working in the editor).
- **Projectile model unseen in battle.** `P.preloadBattleModels()` from `P.createRoom` (before `room.build`): `Reactor3D.loadModel` for every `step.model` on weapon/projectile steps across `P.sequences`, `databaseModelSpec` of the battle members' weapons and skills and the party's items; templates cache in `_glbCache`. The owner's Graviton Shot throws the converted 10 MB Black Hole GLB on a 20-frame flight; `room.addModel` awaits `assets.model(spec)`, so the first throw ended before the template existed. Test in `battle-presentation.test.cjs`.
- **Boss collapse duration.** `Sprite_Enemy.startBossCollapse` sets `_effectDuration = this.bitmap.height`; a room battler's sprite bitmap is the 1 px stand-in, so the boss collapse ran one frame (opacity 255→127, no shake, `collapsed` rule never met). `installRoomAnchors` wraps it: for a sprite with `_reactorRoomKey`, the duration is `max(48, round(_reactorRoomBounds.height))`. Test in `battle-presentation.test.cjs`.
- **Collapse.** The sequence adapter's cleanup restored `opacity`/tone/blend on every sprite it touched, so the collapse reaction (`performCollapse:'collapse'` state) stood a dead enemy back up at 255 when it ended; a dead enemy's sprite is skipped. `mirrorSpriteLook` also applies `sprite._shake` (boss collapse) along the room camera's right vector, undone each frame.

## 2026-09-13 — Room battlers wear sprite effects, cursor on models, battle tests read live data

- **Collapse and flashes on models.** `P.mirrorSpriteLook(sprite,battler,record)` (called from `P.updateRoom` for every battler with a record) mirrors `sprite.opacity`, the main sprite's `getBlendColor()` into `material.userData.rrBlend.value` {x,y,z,w}, additive `blendMode` into `material.blending`, and hides the model once `battler.isDead()` with no effect running and opacity < 32 (MZ leaves a collapsed sprite at ~7). `Reactor3D.injectBlendColor(material, shader)` (from `litMaterial`'s onBeforeCompile) adds `uniform vec4 rrBlend` mixed over the texel after `<map_fragment>`; the uniform is a plain {x,y,z,w} object so JSON-cloned materials keep their own. Test in `battle-presentation.test.cjs`.
- **Cursor.** MOG_BattleCursor wraps its class in an IIFE, so `root.BattleCursorSprite` was never there and the room anchor override never installed. `P.patchBattleCursors(spriteset)` patches the prototype of the instances `Spriteset_Battle.createBattleCursor` makes; Above = bounds.y − 8, Center = mid, Below = feet. Demo: Align for Enemy → Above.
- **Battle test data.** `BattleTestConfigModal` writes `Test_ActionSequences.json` and `Test_BattlePresentation.json`; `P.load` reads `data/Test_<file>` when `DataManager.isBattleTest()` and the file exists, else the plain file. The dialog's `close()` stores its party as `system.testBattlers` and calls `onClose`; the troop editor redraws its preview, whose room cast now comes from `battleTestParty` (the signature includes the party). Owner's "graviton pistol still punches": the test played the saved files while the assignment was unsaved.
- **Collapse Effect label.** `DatabaseCommonUI` summarised trait 63 with a three-entry list starting at Boss, so dataId 0 (Normal) read "Boss Collapse"; the editor stores the option index, which is what `Game_Enemy.performCollapse` switches on. Four entries now.
- No game harness was run for these (the owner was working in the editor); the mirror and the resolver are unit-tested, the cursor and the Test_ path are reasoned from the plugin source and MZ's loader.

## 2026-09-13 — Rig preview draws the marker chain

- Owner: "the bones extend past the nodes and aren't connected" in Database › 3D Models rig mode. A/B over today's, yesterday's and the September 11 builds (`scratchpad/demo-rig-lines-check.cjs <editorRoot> <png> [model]`) showed identical lines since the rigger was written on 2026-08-23: `_refreshRigBones` drew `bonesFromMarkers`, i.e. the skinning bones (Hand = elbow→wrist × 1.35, Foot = ankle→floor, UpperLeg from hip height beside the hips, no clavicle). Now `ModelRigger.previewLinks(markers, template)` gives the joint chain (humanoid 13 links through the shoulder midpoint, quadruped 15, other templates fall back to their bones) and the preview draws that; the bones the skin weights use are unchanged. Test in `reactor-3d-rig.test.cjs`. Worktrees `/tmp/claude-1000/rr-yesterday` (1d53e8c) and `/tmp/claude-1000/rr-sept11` (f0f659a) were used for the comparison and removed.

## 2026-09-13 — Demo battle HUD layout, command window on the actor, 3D enemies in the troop picker

- **Troop picker.** `showEnemyPicker`'s preview used `getEnemyBattlerUrl` only; `enemyModelSpec(enemy)` (graphic setting through `B.graphic`, else the binding) now feeds `RRDatabase3DBindings.modelThumbnail` for a model enemy.
- **Command window.** `P.battlerScreenBox(battler)` (room: `room.project` foot + `room.bounds(key)` top through the room sprite's `toGlobal`; flat: sprite global position and frame height) and `P.anchorCommandWindow(window)`, applied after `Window_ActorCommand.update` when `P.settings.commandWindow === 'battler'` (a top-level BattlePresentation.json key; no editor UI yet, the owner wants it in User Interfaces later). It overrules MOG_BattleHud's per-frame slide. Runtime **20260913.9**, synced.
- **HUD names.** `P.installMogHudNames` wraps `Battle_Hud.prototype.refresh_name`: MZ starts a bare Bitmap in sans-serif (MV in the game font), so the name was the one HUD label in the wrong face; it now takes `$gameSystem.mainFontFace()` and steps its size down from the plugin's Name Font Size until the name fits inside the box art's frame (box width − 28 − 2 × outline), and a centred name is centred on the box itself (the plugin parks the 200 px bitmap at Name X-Axis −25 beside a 160 px box, 5 px off centre). Verified: Fleagus Gustafario at 16 px / 120 px wide, the rest at 18 px, all in rmmz-mainfont.
- **Demo HUD.** MOG_BattleHud Custom Position 1–7 → x 370…1390 step 170, y 900 (160×170 boxes, 10 px from the bottom of 1920×1080); PSYCHRONIC_ATB-MZ bar centred: barX 335 (1250 wide) and nothing else: iconStartX/iconEndX/actionIconX/skillIconX/skillNameX are relative to the bar window (`sprite.x = iconStartX + progress × travel` inside the window at barX), so shifting them too had put the icons 315 px into the ready zone. Runtime **20260913.10**. Verified in `scratchpad/demo-battle-hud-check.cjs` (Demo copy, room troop 1, seven actors, waits for the first command window): window at 1034,124 over the actor at 1134 with top 379; screenshot checked.

## 2026-09-13 — Record copy carries the 3D binding

- Owner copied the Psychronic enemy to another line and got "Static Battler Image": `writeDatabaseEntryClipboard` carried the record and `battlePresentation` settings but not the `Database.r3d.json` binding. Now `readModelBinding(type,id)` (raw sidecar entry, every slot) rides in `listClipboard.bindings` and the cross-instance payload (kept only within the same project, like presentation), `pasteListEntries` writes it for the new id through `writeModelBinding` (slot by slot, clearing stale slots of the target), and `duplicateListEntry` copies both the binding and the presentation settings. `this.modelBindings` is an injectable seam for tests (the UI is vm-loaded). Test in `editor-name-ui.test.cjs`.

## 2026-09-13 — Effect folded into Execute

- **Why.** The owner saw two Execute sections in every Demo sequence and diagnosed it: the hit was a phase (Effect) rather than a step, so Execute was split around it. Effect is gone: five phases (`B.actionPhases`), the `effect` step type ("Play Effect Phase") is gone, and the hit is a Show Animation (animationSource action) + Apply Action Effect pair inside Execute (`B.builtinHit(context, role, targetIndex)`).
- **Migration.** `B.foldEffectPhase`: purpose effect → execute; steps marked effect keep their place as Execute steps; a placeholder takes the sequence's effect steps at that moment (or the built-in hit when it had none) and its frames become a wait after them; `sequence.phases` loses effect. `B.migrateSequence` = fold + `migratePhases`; `B.migrateSettings` drops `phases.effect` picks. Called by the editor on open (`DatabaseActionSequenceEditor`) and by the runtime when `ActionSequences.json` / `BattlePresentation.json` load (`reactor_battle_presentation.js`). Demo (14) and Star Shift Rebellion (197) sequences rewritten on disk; all validate.
- **Resolver.** No Effect splicing; runs of phases from one sequence still play in that sequence's order; an Execute with no impact/action step gets `builtinHit` after its last Execute step (before Return); the whole-sequence shortcut now requires the sequence to land a hit itself; `hitSource` is Execute's sequence. `validateSequence`: no effectCalls rules; a phased sequence may have at most one impact unless hits are authored; purpose execute likewise; "Apply Action Effect belongs in a Complete Action or Execute phase."
- **Importer.** `V.PHASES` five; Victor's `action: targets, effect` becomes animation + impact + popup wait inline (`V.effectSteps`); a record whose Execute lands no hit gets those appended; throws timed "after" go after that group. Tests rewritten in the four battle suites. Runtime **20260913.8**, synced.

## 2026-09-13 — "Two Execute phases"

- Owner asked why a Demo sequence shows Execute twice. By design: Execute "performs the action and calls Effect at the moment of contact", so `B.autoPhases` (and the starters) mark the recovery after the impact (wait, lowering the weapon, a boomerang's flight back) as Execute again, and `drawSteps` put a head at every phase change. Now the later run is headed "{phase} (continued)" (`phaseHead(phase,count,continued)`, class `rr-sequence-phase-continued`, tooltip explains) with no step count of its own; the number stays 3. Two strings in 17 locales; BATTLE-PRESENTATION.md says so.

## 2026-09-13 — Optimize converts to GLB with textures bundled

- **`RRGlbOptimizer.fromMesh(mesh, images, {name, texture})`** builds a GLB from a reader mesh: per part (group name) a node + mesh, per material run a primitive with its own welded vertices (Map on the position+UV tuple), V flipped (reader meshes use the bottom-left UV origin the three texture default expects; glTF is top-down), POSITION min/max, uint16/32 indices, materials as pbrMetallicRoughness with baseColorFactor [rgb, opacity], baseColorTexture from the colour picture (an alpha-only picture stands in as the colour picture, tinted by the factor), alphaMode BLEND when alpha or opacity < 1; images embedded once by file name from `images` or the file's own bytes; assembled through `rebuildGlb`. Unit test in `glb-optimizer.test.cjs`.
- **`Database3DEditor.optimizeSelectedModel`** on a non-GLB: `_convertModelToGlb` (runtime reader by extension, pictures gathered from textures/ beside source/, or the sidecar texture for a material-less format) → analysis and dialog on the GLB → optimize → validate → write `name.glb`, keep `name.fbx.orig`, remove the source, `_retargetModelExtension` rewrites `{name, ext}` in every `data/*.r3d.json`, caches cleared, the re-listed entry selected. `_hasOriginalBeside` reads "optimized" from any `name.*.orig`. Verified in `scratchpad/demo-fbx-optimize-check.cjs` (dialog stubbed): Black Hole 15.1 MB FBX → 10.3 MB GLB, 4 textures embedded and loading, 534k → 320k triangles under the optimize preset, a planted `.fbx` reference retargeted, cost panel reads the GLB. Runtime **20260913.7**: `loadModel` tries the named extension first, then the others, so a spec still saying `.fbx` finds the GLB.

## 2026-09-13 — FBX materials and textures, model cost for every format

- **Untextured FBX (Demo 3d/Animations/Black Hole, Blender 4.0 binary FBX 7400, 15 MB, 534k triangles, 3 meshes, 9 materials, 12 texture nodes).** `Reactor3D.readFbxBinary` only ever pulled the first Vertices/PolygonVertexIndex it met: no UVs, no materials, no transforms, one grey mesh. Now `_fbxTree` parses the whole node tree (typed arrays, pako-inflated when compressed, 64-bit ids as strings, "\0\1" typed names as "::", R as bytes) and `_fbxScene` walks Objects/Connections: geometry→model (OO), material→model in order (OO), texture→material by property (OP DiffuseColor / TransparencyFactor…), video→texture (OO, embedded Content); per-corner UVs by mapping/reference type; LayerElementMaterial ByPolygon/AllSame; Lcl Translation/Rotation(+order)/Scaling, PreRotation and Geometric* through THREE.Matrix4 when THREE is present; UpAxis Z rotated to Y. Output is the mesh shape `buildMeshTemplate` already took, plus `groups[].material` and `materials[]` {name, color, opacity, texture, alpha, embedded}. `buildMeshTemplate` makes one MeshBasicMaterial per material (colour map from textures/ beside source/ or a blob of the embedded bytes; an alpha picture that is not the colour map becomes alphaMap; transparent + depthWrite off when there is alpha or opacity < 1), splits parts by name and material, and applies the sidecar texture only when the file maps none of its own. The textures were never in the FBX: it references `D:\\artworks\\other\\black hole\\*.png` by absolute path; the basenames match textures/. Unit test on a hand-built tree in `reactor-3d-models.test.cjs`; verified in the editor harness (`scratchpad/demo-fbx-preview-check.cjs`): 4 mapped materials with loaded images, ring and lights textured.
- **Model cost for non-GLB.** `modelStats` only knew `RRGlbOptimizer.analyze`. `Reactor3D.modelCost(bytes, ext, sidecarTexture)` gives the same shape for FBX (full read: triangles, vertices, draw calls = runs, materials, named pictures, AnimationStack/Deformer counts) and the other formats (one mesh); `Database3DEditor.analyzeModelFile` sizes each picture from textures/ (`RRGlbOptimizer.imageDimensions` exported). Trap: the editor loads `reactor_3d.js` only inside the first preview draw, so the cost read at selection found no reader and cached null. `_statsPending` keeps that out of the cache and `selectModel` renders the cost again after `_drawPreview`. The heavy-model note for a non-GLB says to export as GLB rather than offering Optimize. Runtime **20260913.6**, synced.

## 2026-09-13 — Animation projectiles, flight card words

- **Invisible animation projectile (Demo Graviton Shot, Effekseer BlackHole-01 riding an 8-frame flight).** `ReactorBattleRoomView.updateEffects` sized every effect by `R.modelSpanTiles(owner.object)`, which reads `userData.glbSize` and returns 0 for any billboard plane (a sprite battler, or the 2 px carrier a projectile animation rides), so `setScale(0)`. Now `unit=(play.span||modelSpanTiles||2)/26` and `playAnimation(key,id,{span})` may pin it. Runtime **20260913.5**, synced. Verified in an editor harness on a Demo copy (`scratchpad/demo-flight-animation-check.cjs`): the cue play exists, has a handle and a visible quad mid-flight, and after landing the preview keeps the carrier (hidden) at the target while the effect finishes (`active` keeps a landed animation projectile while its ticket `isPlaying`), matching the game, which only hides the graphic.
- **Card rows.** `cardRow` tags X/Y/Z rows with the letter and any other row with a word (`row.short`, else the axis slot when it is a word, else the label without its unit): Arc, Turn, Spin, Scale. The flight-card labels gained 17-locale strings.

## 2026-09-13 — Preview interaction audit, import button retired

- **Audit.** `scratchpad/ssr-interaction-audit.cjs` (`--names`, `--steps`, `--scene=battle|grid`, `--verbose`) drives the Action Sequences preview with WebDriver pointer input over every editable step: a click on the gizmo anchor (no value change, no undo entry, the step's own preview frame), a plain drag (one undo entry, undo restores), each arrow tip (only that arrow's field moves, the right way, by a sane amount), the ring (only a rotation field moves), and a click on empty ground. Both scenes are clean; anchors the grid camera leaves off the canvas are reported and skipped (the grid framing does not follow an approach, the Battle layout does).
- **Found and fixed** (`ActionSequencePreview.js`, `AxisArrows3D.js`, `DatabaseActionSequenceEditor.js`): (1) a Projectile click jumped to the step's end where the flight had landed and been hidden (`showFlightFrame`: launch on Start/Look, halfway on Arrive); (2) every click pushed undo before any movement (`hold.pushed` after 2 px); (3) in the 2D projection the gizmos were placed at the unlifted height while sprites are drawn lifted, so the height arrow was edge-on and a drag on its base wrote −252 tiles (`sync` lifts the anchor, turns the height arrow's group up the screen, `RRAxisArrows3D.pick` reads each arrow's world direction); (4) with an overlapping target the raycast picked target0 and `e.edit` retargeted a weapon step on a plain click (`pickBattler` prefers the active key, lifts its markers, and takes the drawn `extra:held`/`extra:flight` billboard as a handle); (5) a Move drag measured against the full sequence while the pose came from the as-of-step `previewSequence`, so a later jump leaked into `step.z`; (6) unmoved fields were re-rounded (0.479 → 0.48) on every drag (`shift`). Flat mode keeps one ring: yaw geometry, writing `rotation` (held, thrown), `transform.rotateZ` (Motion) or `rotateZ`, clockwise positive as the game's `sprite.rotation`; battler billboards now draw `rotateZ`.
- **Editor.** Import Victor Notetags button and its 17-locale strings removed (`import-victor-motions.cjs` stays); the sequence header (name, Hits, Undo/Redo) heads the middle column.
- **Scene / Projection.** The owner found 'Battle layout' opaque and the per-project hidden options confusing. Now Projection is `3d` / `2d` (Horizontal) / `2d-vertical` (Vertical); the flat projections lay the cast out as the game does (`loadCast`: MZ's 600+32i / 280+48i column, or under Vertical the SVActorPosition spots else a bottom row at W/2+(i−(n−1)/2)·96, H−140; enemies from `scene.troop`; the Troop row shows for any flat projection without a room). Scene is the backdrop only and always lists Grid, Battleback (Floor/Wall pickers, a note when the project has none) and Battle Room (a greyed 'none set up under Troops' entry when there is none); both selects carry a tooltip. Saved prefs with `scene.kind==='battle'` migrate in `loadPrefs`. Six new strings in 17 locales; the 'Battle layout' strings are gone.
- Suite **3,151 passed**; runtime unchanged (20260913.4).

## 2026-09-13 — Parity audit after the owner's first look

- **Enemy sheets.** Victor read charset enemies from \`img/sv_enemies\` and the notes name \`!$X\` sheets whose file is \`$X\` in \`img/characters\`. \`V.locateSheet(name, exists)\` tries characters (both spellings) then sv_enemies then enemies; the CLI passes an \`exists\` over the project's img folders and a character graphic may carry a \`folder\` (\`B.graphic\` honours it). SSR: 166 from characters, 29 from sv_enemies, 5 sheets missing on disk (listed in the import report).
- **Blood splatter.** Pictures and icons on a battler are children of its sprite now (they follow moves and fade with a collapse); one made by a battler state or reaction (the collapse's \`picture: user, BloodSplatter…\`) stays on \`sprite._rrLayers\` after the state ends until a later \`picture: clear\` from any sequence on that battler, or \`P.clearBattlerLayers\` at \`Scene_Battle.terminate\`. \`P.extendAdapter\` now receives \`stateOnly\`; the first attempt referenced it out of scope and every icon/picture step aborted (caught by the sweep: 0-frame actions with one error each).
- **Idle running.** Stock \`Sprite_Actor.refreshMotion\` asks an undecided actor for 'walk' and a decided one for 'wait' (the side-view idle bob); on a character sheet that is the walk cycle, so every actor jogged in place. \`P.engineMotion\` maps those two engine requests to 'idle' for sheet battlers unless a sequence or state player is driving the sprite (the imported \`input\` state still walks while choosing). Idle probe (\`--idle-probe\`): one column per actor now; drones keep their authored hover.
- **Naming.** Shared battler states read 'Character enters battle · 53 actors', 'Enemy is hit', 'Character falls (variant 3)' (\`V.STATE_LABELS\`); weapon types 'Pistol attack · 18 weapons'; other shared sequences keep the first record's name plus the count. \`byType\` (CLI default) binds every weapon of a type to the type's most common choreography; \`V.similar\` merges near-twins; own-icon throws and icon lines read as the action icon. SSR: 269 sequences; 92 items → 17, 81 weapons → 11 (one per type).
- **Preview.** Scene 'Battle layout' (+ a Troop pick) places the cast at the flat battle's real screen positions: actor homes from SVActorPosition when the plugin is on, else MZ's 600+32i / 280+48i; enemies from the troop; each side faces the other's centroid; the orthographic camera frames exactly the game screen (\`system.advanced.screenWidth/Height\`). In the 2D projection a battler's height is drawn as a step up the screen (\`liftPose\`: jumps, lifts, held items, flights and layers), and a character-sheet battler turns by row instead of being mirrored.
- **Behind.** \`B.directionYaw\` 'behind' added 360 instead of 180 (a no-op); fixed.
- **Sweep.** \`ssr-battle-harness.cjs --sweep\` runs one weapon of every type on Jack, 28 skills across the party, three enemy skills and a lethal blow (44 actions), records what each waits on (\`waits\`) and, past 700 frames, the wait ticket's state (\`stuck\`). All land and come home. Two attacks (Graviton Disc, Spike Knuckles) once waited 20+ s on their action-animation ticket in sequence order, not in isolation and not on the instrumented rerun; the ticket now records `pending`, sprite count and durations past 700 frames (`stuck`) so a recurrence can be read. A real kill through the battle log (drone railgun on Mari at 1 HP, def and mdf zeroed) leaves `picture:BloodSplatter` on her sprite; forcing the death state bypasses `performCollapse` and is not a valid test.

## 2026-09-13 — Victor Battle Motions import, Star Shift Rebellion parity

- **Goal.** Star Shift Rebellion plays its Victor-era choreography through native sequences, in 2D with charset battlers, with VE_BattleMotions and VE_BattlerGraphicSetup off (the owner turned them off in `js/reactor_plugins.js`; `plugins.js` is the untouched MV list). Other VE plugins, MOG HUD, ATB and LeTBS stay on; `P.compatibility` now blocks native sequences only while `Lecode.S_TBS.commandOn`.
- **Engine additions (data module, shared with the editor).** `step.concurrent` (the next step starts on the same frame; `B.stepAdvance`, `cue.advance`, `cue.total`); move `speed` in frames per tile resolved by `B.timeline(sequence, context)` from the simulated positions (`B.moveGoal` factored out of `evaluate`); move `arc` (jump riding the travel); Face Direction `up`/`down` and `B.directionYaw`, with direction steps now part of the evaluated pose; `wait` with `waitFor: move|jump` resolved by the timeline and re-resolved in the Player from the branch that actually ran; blocking media/`waitFor` waits stretch the timeline by the frames they hold (`Player.held`) instead of freezing concurrent moves; a later move of the same battler cuts the earlier one where it starts (`cue.cut`, honoured by `evaluate`, the Player's shifts and `total`); `B.mostAlong` counts hits and effect calls along one branch path; every `effect` placeholder expands, and a sequence that both owns an Effect phase and calls it from Execute lands it once; character sheets stand on column 1 and walk 0,1,2,1; motion-purpose validation admits any decoration on the user. Runtime: `P.spriteYaw`/`P.usesSheet` (a character sheet turns by row, never by mirroring; idle faces the opponents' centroid), `Game_Action.isStepForward/isRanged`, `Game_Battler.isRangedWeapon`, `BattleManager.isSecondAttack` compat, enemy character sheets no longer mirrored.
- **Converter.** `editor/src/battle/VictorMotionImport.js` (UMD; `V.parseBlocks/parseMotions/parseThrows/parseSpriteMotion`, `V.subject`, `V.convertBlock` with Victor's queue timing, `V.collapseIconRuns` → weapon Show + tweened Move, `V.throwStep`, `V.convertRecord` (phases + generated Victor default Effect: animation waitForCompletion, impact, wait popup), `V.importDatabase` with dedupe by content and replacement of earlier imports). CLI `editor/build-scripts/import-victor-motions.cjs <project> [--vertical]`; editor button "Import Victor Notetags" in Database › Action Sequences (17 locales). Tests `victor-motion-import.test.cjs`; the pre-import SSR files live in `editor/tests/fixtures/battle-generations-2026-09-11` for the generations test.
- **SSR data.** 1,007 records → 269 shared sequences (+ the 17 hand-made), 1,086 reaction bindings, 315 charset graphics. Front distances follow the facing (vertical formation: actors up, enemies down). Sharing rules (owner's ask, 2026-09-13): a throw or icon line that shows the record's own icon is read as the action's icon, so like items share (92 items → 17; Med Kit +65 more items); `V.similar` treats sequences that differ only by hand-tuned numbers (`V.NEAR`: 1 tile, 24 px, 45°, 30 frames, 6 f/tile) as one; and `byType` (CLI default on) binds every weapon of a weapon type to the type's most common choreography, named '<Type> attack (N weapons)', so the 81 weapons use 11 sequences (one per type) and the report lists the weapons that took a sibling's choreography. Skills stay one per skill unless twins.
- **No stock side-step.** `Sprite_Actor.updateTargetPosition` (48 px forward while inputting or acting, back after, retreat on escape) is skipped for an actor drawn from a native graphic or with an authored `input` state (`P.authoredState`); the owner saw charset actors still stepping left on their turn. Runtime **20260913.4**.
- **Fast returns are authored.** The one- to six-frame dashes home in the trace (Polaron Rifle, Scythe, Railgun Rifle, Critter, Power Reaper) are Victor's `move: user, to home, 1` (speed 1 = one frame per 120 px); with one sequence per weapon type, raising that Return move's speed in the editor fixes the whole type.
- **Harness.** `scratchpad/ssr-battle-harness.cjs` boots a copy in `?test&btest` with the party of `save/file11.rpgsave` (the actors actually played: 1, 3, 4, 80, 81, 82, 83, with their equipment and skills), forces 16 actions, samples every frame, screenshots mid-action, dumps battlefield sprites; `scratchpad/ssr-compare.cjs` diffs two reports. `--victor` (plugins back on, fixture data) does not finish: with the ATB loop frozen Victor's log stack never drains. Judge parity by per-frame deltas (a jump over 40 px is a teleport).
- **Open.** Long waits are real: `wait popup` follows MZ's 90-frame damage sprites and the action animations run 60–128 frames. `<throw item>` (2 skills) is not resolved through the weapon's throw object. Held icons use `attachment: offset` with Victor's pixel offsets, not the hand attachment. Enemy `<enemy weapons>`/`<attack animation>` do not occur in SSR and are not read.

## 2026-09-13 — Sequence generations pinned, notes trimmed

- **`tests/action-sequence-generations.test.cjs`.** Loads every bundled project's `ActionSequences.json` and `BattlePresentation.json` (Star Shift Rebellion carries unphased whole actions, a `prepare`-purpose sequence and a `mode:'phases'` class binding; Demo carries phased starters and `mode:'sequence'` picks), validates every record and resolves every binding with no missing phase; the corpus must contain each generation or the test fails. Synthetic fixtures pin: an unphased whole action by reference before and after `migratePhases`, and contributing only Execute beneath a partial sequence; older per-phase picks (wrong purpose → missing, non-sequence → built-in) and the `unarmed` slot answering only a bare-handed normal attack; a partial sequence without Effect placing the built-in Effect after Execute and before Return; an Execute with its own impact skipping the built-in Effect; an Effect placeholder taking the Effect steps mid-swing with its duration as a trailing wait and `hitPolicy` from the Effect provider; and the resolved partial action driven through the `BattleManager.startAction/updateAction` override (movement before three hits, swing motion at impact, home afterwards). This closes the "Effect-after-Execute placement untested in battle" thread at the manager level; the real-game smokes still play whole starters only.
- **Unarmed fold.** `BattlePresentationEditor.assignment` folded a legacy `unarmed` override into `{mode, sequenceId, phases: undefined}`; the undefined key is now omitted. `nw-unarmed-punch.cjs` asserted the pre-fold card (two selects, `unarmed:'sequence:1'`); it now asserts the folded pick and the stored binding `{mode:'sequence', sequenceId:1}`.
- **Root `CHANGELOG.md` unreleased section** rewritten from 140 lines of handoff-style bullets to 58 lines grouped by area (Action sequences, Maps/assets/database, Keyboard, Fixed, Development, PR #52); features moved out of Fixed, runtime revision numbers and doc links dropped. `editor/CHANGELOG.md` keeps the detailed entries. The root section is the release body (`cut-release.cjs` `changelogSection`).
- Verification: **3,136 Node tests pass**; `nw-unarmed-punch`, `nw-battle-presentation` and `nw-battle-regressions` pass on a Demo copy. Not pushed.

## 2026-09-12 — Keyboard menus, dialogs and table headers

- **Phases inside the sequence (2026-09-12, late).** Data: `step.phase` (default execute), `sequence.phases` (explicit provided list, empties included); purposes `motion`/`routine` remain, phase purposes only for older records. Resolver rules: first non-inherit binding decides `existing`; a `sequence` binding whose sequence is unusable → missing; per phase, first provider down the chain (`sequence` providing it, or older `phases` pick), default filler otherwise; runs from one sequence keep authored order; Effect placed at the `effect` placeholder, else skipped if an impact already landed, else after Execute; `hitPolicy` from the Effect provider; whole returned by reference when it owns execute+effect and only fillers complete it. Validation for phased sequences: ≤1 impact (unless authored), impact required only when Effect has steps, placeholder only in Execute. Editor: `drawSteps` inserts `phaseHead` where the phase changes plus heads for provided-but-empty phases; `updateStepDrop` derives `stepDropPhase` from the head above the slot; `newSteps(value, phase)`; `phaseInsertIndex`; Phase select relocates; `showPhaseMenu` (add phase, auto-sort), `inheritPhase`. Assignment: one select (`inherit` / `existing` / `sequence:id` / `phases` only when already older-style), New Sequence builds all six default phases tagged. Open: the Effect-after-Execute placement for partial sequences is untested in battle; `autoPhases` is a heuristic (walk/run before an approach = Movement; walk home after the impact = Return; what follows = Finish).
- **Options and phases.** Battler Options are hidden again for model and non-explicit battlers and no longer carry Hide Shadow or Hold Weapon in Hand (the owner withdrew the idle hold; runtime idle-hold code and its test were removed, `graphic.hideShadow` data is still honoured by the runtime). `drawSteps` places empty provided phase heads in phase order (`emptyBefore`). Assignment card: `inherit` is labelled per level as "None (…)".
- **Preview camera.** `ActionSequencePreview`: `orbit` {yaw,pitch} and `pan` {x,y} overrides applied in `cameraPose`, right/middle pointer drags (`startCameraDrag`/`moveCameraDrag`/`endCameraDrag`), `resetView`; persisted in the shared prefs (`orbit`, `pan`).
- **Header grid.** The cast row and preview row are one `.rr-sequence-preview-grid` (also classed `rr-sequence-cast` for existing selectors): four columns, two rows, `Floor`/`Wall` span the row when the scene is a battleback, note spans the row; two columns under 1100px.
- **Sequence editor header/preview row, scrub-back hide, Railgun revision.** Options popover removed (`rr-sequence-settings` CSS gone); `showStarterMenu` uses `parent.showDatabaseActionMenu`; `paintProps` hides non-live `extra:held:*` / `extra:flight:*` models. `nw-sequence-expansion.cjs` now waits for battler sprites before reading them (the scene is ready a frame before `_battler` is assigned; it flaked once today). Railgun Shot starter: forward 1 tile (home anchor, face target), draw at tilt −30, raise to 0 over 6, fire, lower, hide, step back; Demo record 19 regenerated from the template with `B.template`.
- **Projectile panel (2026-09-12).** `DatabaseActionSequenceEditor.drawProjectile(step,change)` replaces the generic field loop for projectile steps (only sourceRole/bone/grip/equipIndex stay generic, under Advanced); card id `flight` with tabs start/arrive/look; the Z row is `startHeight` for attachment offset, else `z`. Preview: `ActionSequencePreview.flightStep/flightPoint`, gizmo anchored on the launch point (arrows; roll ring → `rotation`), `writePosition` branch. Sources: `iconSource` gains `model` (`step.model={name,file,ext,texture}` from `ModelGraphicPicker.listModels`) and `animation` (`step.animationId`): editor `weaponModelSpec` returns the model, `previewPropImage` gives an animation a clear 2×2 carrier and `paintProps` plays it on the carrier billboard (`flightAnimations` tickets, cancelled when the flight ends or media clears); runtime `make` adds the model in rooms (dot when flat) and `flightAnimation(entry)` plays on the carrier (room `playAnimation`, flat `Sprite_Animation`/`Sprite_AnimationMV` targeting the carrier sprite). Validation in `B.validateSequence`.
- **Rig on a skinned file (2026-09-12).** `Reactor3D.mapRigToSkeleton(root,rig)` (called first by `applyModelRig`): when the model already has skinned meshes, each rig bone is matched to a file joint by `RIG_BONE_ALIASES` name (halves the distance) and rest position in root space; the joint gets `userData.parts`, `__reactorRigBone`, `__reactorClipBone`, `__reactorBoneTail`; no second skeleton, no weight bind. File joints are often plain Groups, so bone checks go through `Reactor3D.isRigJoint`. `prepareModelInstance` gives such entries `clipBase`; `applyModelAnimation` restores clipBase before the mixer, refreshes it after, composes poses onto it, and conjugates `acc` into the joint's frame (`frame⁻¹·acc·frame`, chain of quaternions and scales up to `binding.root`) so poses read in the model frame. A pose's slide now composes before its turn. `B.partPoseRules` marks 0-frame poses `instant` (snap). Editor: `partAt` raycasts skinned meshes with a permissive bounding sphere (the preset rest sphere never intersects) and attributes hits to the nearest limb segment (tail for leaves, child wins ties); `pickPosePart` converts a clip Motion step to a pose and opens the fold (`openFold`); `limbDirection` for hinge axes in model space. Tests: `reactor-3d-rig.test.cjs` (mapping, layering, frame), `action-sequence-editing.test.cjs` (conversion).
- **Pose Parts.** Data: `step.parts`, `step.resetPose`, `step.motion==='__pose'` (`B.POSE_MOTION`); `B.hasPose`, `B.motionActionName` (`pose:<id>`), `B.spriteMotionName` (sheet battlers idle), `B.partPoseRules(step, previous)` → `{rules,next}` (keys from where each part stood; parts back at rest are dropped from `next`), `B.posePlan(sequence)` accumulates per role key. Animator: `stay` keyed poses hold progress 1 while their action is current; a different action drops them (rest), by design for now. Editor: `ensurePoseRules(view)` rebuilds `record.rules = record._baseRules + plan` when the pose steps change; `previewSequence()` truncates to the selected pose step at its end frame so a motion starting on that frame does not pre-empt it; `modelParts(role)` lists `binding.meshes[*].parts` with joint kind/hinge axis; `pickPosePart`, `posePartEntry`, `showPoseFrame`, `drawPoseParts`. Preview: `poseStep`, `partPivot` (bone world position or carved pivot), `partAt` (carved mesh part or nearest rig bone to the hit), rings scaled .55 with `rings.radius` scaled too (picking reads it). Runtime: motion cue in `reactor_battle_presentation.js` joins the synthesized rules into `state.rules`/`model.rules` (replacing same-named) with a per-battler `poseState` map. Release: `B.posePlan` returns `{rules, actions, releases}`; a plain motion step after posed parts gets action `pose:<id>`, `B.releasePoseRules` (parts → rest over `duration`, period ⌈d/2⌉, min 1 → a 0-frame step snaps) and `B.releaseMotionRules(plan, id, modelRules)` clones the model's action rules for the named motion under that action (editor: `ensurePoseRules` per record; game: the motion cue with `releasing`, `poseState` lives on `P.adapter`). `motionActionName(step, plan)` takes the plan. Open: per-joint limits and clothing/extra rigs are not modelled (the part list is whatever the model's rig or carving names); the owner said to hold extra rigs until the base is refined.
- **Sequence editor: transform card and held items.** `ActionSequencePreview.transformCard(host,spec)` / `cardRow` / `syncCards` replace the old transformControl rows; specs live in `DatabaseActionSequenceEditor.drawInspector` (ids `move`, `held`) and `ActionSequencePreview.transformFields` (`motion`). Held-item gizmos: `heldStep`, `heldPoint`, and the weapon branches in `sync`, `writePosition`, pointer down/move (ring axis map yaw→rotateY, pitch→rotation negated, roll→rotateZ). Placement: `B.heldPlacement(point,facing,step,spec)` → `ReactorBattleRoomView.place` honours `pivotY` (record.extent from the template's glbSize); runtime `sequenceVisuals.draw` and the editor's `paintProps.draw` both use it; `B.heldKeys` adds rotateY/rotateZ to the tween. Prefs: `prefsKey/readPrefs/loadPrefs/savePrefs` on the editor, called from every cast/scene/option control and `ActionSequencePreview.zoom`. Weapon field label `weaponGraphic` is now "Drawn As"; `bone` is "Bone Name (blank = the hand)". Move steps anchor their gizmo on the merged Show step (`DatabaseActionSequenceEditor.heldBase(step)` finds the last Show for the role; `heldPoint` merges weapon defaults, that base, then the move's `B.heldKeys`) and `selectStep` previews weapon moves at their end frame like move/motion steps. Tests in `battle-sequence-expansion.test.cjs` (placement/tween, prefs) and `action-sequence-editing.test.cjs` (move anchor/end frame). Owner's ask answered: the preview cast is never stored in the sequence; the runtime resolves the sequence per acting battler.
- **Event Model card, model offset and JPG media surfaces.** `EventModelPanel` (constructed in main.js beside the lighting manager, reached as `projectController.eventModelPanel`) is synced from `MapEditor3D.select()` and again from `previewEventModel` once the model loads; it writes through `Reactor3D.setEventModelSpec`, moves the placed object in place (`_place`), keeps the event diff snapshot in step via `MapEditor3D.noteEventModelEdited`, pushes `eventManager.saveState()` once per drag and calls `renderEvents()` when the drag ends; `refreshEvents` re-selects a rebuilt selection so an undo keeps the card. Event model specs carry `offset` (tiles east/south/up; `Reactor3D._normalizeModelSpecNow`, written by `setEventModelSpec` and the event editor's fallback writer); game (`reactor_3d.js` character placement) and editor (`MapEditor3D.previewEventModel`) add it. The event window's model picker has no offset field (the owner wanted it on the map, not in the event window) but carries a stored offset through a re-pick. Props keep their own x/y/z. Demo door (map 1, event 2) offset −0.32 south: the door is 0.36 tiles deep and centred, the room's north wall plane is at z 0. Shadows: `_focusPoint` order is player root → `Shadows.focus()` (editor sets it to `view.target` each frame, clears on teardown) → `Reactor3D.activeCamera()` position → first candidate; the old `viewport()._camera` read was null in the editor, so all moving rows went to lights ~35 tiles from the mascot (probe: `scratchpad/probe-shadow.cjs`). Row churn (owner: Tank shadow blinking): the Demo's screen glows ride swinging monitor arms, and `_incident` weighted the cone aim tenfold, so near-equal glows traded the 8 static / 3 dynamic rows every sweep. Now `_smoothedIncident` (per-id EMA, `SHADOW_RANK_SMOOTHING`), `SHADOW_AIM_FLOOR` 0.8 (aim ≤ hysteresis margin), `assign(candidates, count, previous, scope)` dwell (`SHADOW_ROW_DWELL` 90 frames, `_losing` per scope) with `SHADOW_ROW_TAKEOVER` 2× immediate; a light leaving reach still releases at once. `MapEditor3D.movesOnItsOwn(template, driver)`: clips or always/idle rules → dynamic; action-only rules (Tank) → static. Verified with `scratchpad/probe-flicker.cjs` (row-set change log, still vs pan). Still open from the trace: props animated by sidecar parts only that are marked static (none in Demo now: always-rule arms are dynamic) would have rows that never refresh (`_staticHashOf` hashes the root transform only). `Reactor3D.groundAnimatedTemplate(template, sidecar)` shifts the template's `content` group so the lowest point of the resting clip (idle rule → always rule → first clip, 12 samples, measured with `measureSkinnedBox`) sits at y 0; called before `cloneModelTemplate` at the four game sites and in `EventPreviewModels.templateFor`; flagged `userData.reactorClipGrounded` so it runs once. Media surfaces keep non-PNG extensions in `createImage()` (`ImageManager.loadBitmap` only implies `.png`). Runtime 20260912.2 synced to the 13 projects.
- Menubar headings, every context-menu family, database categories, Options dropdowns, the switch picker's rows and Trait/Effect tab strips now answer to the keyboard through a shared helper (`editor/src/utils/KeyboardNavigation.js`); Options, About, the command picker, Plugin Manager, the Database viewer, Trait/Effect editors and the themed dialogs take focus on open, contain Tab, close on Escape and restore their opener. Database Escape asks before discarding edits. Script editor Shift+Tab outdents. [Behaviour and limits](KEYBOARD-MENUS-AND-DIALOGS-2026-09-12.md).
- Database table column headers use the section-title treatment (panel surface, uppercase, no strip) in dark and light palettes; `npm run smoke:nw-table-headers` captures both.
- **Weapon steps: Show / Move / Hide.** One Show then tweened Move steps (offset, rotation, scale, easing) replace stacked one-frame shows; runtime and preview interpolate; Preview Weapon override in the editor Options. Demo's duplicate pistol removed; Railgun Shot bound to weapon 49.
- **Sequence preview scenes, ported Star Shift starters, model weapons, facing, state reactions.** Scene control (grid / battleback pair / any troop's Battle Room with its props, camera and formation); Item Toss, Sword Slash, Railgun Shot starters as native steps, assigned in Demo (new Graviton Pistol weapon bound to the bundled model); 3D-bound weapons and thrown items render as models in hand and in flight (runtime + preview); character-set Facing (auto from facing, or fixed) for vertical layouts; States own a Reaction Sequence, per-battler list drops Sleep/Abnormal. Editor toolbar regrouped. 2D rotation verified in both projections (Move › Turn Z; rings show with the Rotate tool).
- **Assignment cards collapse, sequence editor surfaces turns and model poses.** Cards open only when assigned (status pill), compact rows, Reactions and Idle Motions fold; Move steps expose Easing and a Turn and Scale fold; Motion steps list the model's authored poses/clips with a jump to Database › 3D Models. Learnable Skills row highlight fixed. Limb-level posing inside the sequence editor is not built; poses are authored per part in 3D Models and referenced by name.
- **Action sequence cards follow Victor's priority model.** Priority line, Whole Action control and six always-visible phases (Prepare, Movement, Execute, Effect, Return, Finish) on skills, items, weapons, classes, actors and enemies; the unarmed override is folded into the actor's Execute. Runtime **20260912.1** (phase names in the shared battle data), synced to all 13 projects; Demo's dormant unarmed entries dropped. Face/character/battler previews name their source file beneath the picture.
- **One battler control per record.** The Sept 11 Battler Graphic card duplicated the Images/General battler controls; its type selector now lives in the existing battler box (actors) and rows (enemies), with Battler Options folding out beneath. The i18n pass was reverting programmatic button text (stored source now moves with the text), and the enemy Battler Image row no longer clips its Change button.
- **Map switching regression fixed.** Since the September 11 commit the preview underlay Graphics was destroyed with the old tilemap container but reused on the next load, so loading a second map threw and the editor stayed on the first. Found because `smoke:nw-keyboard` (issue #54) failed on the committed baseline; fixed in `createTilemapContainer`, with a Node regression (`tests/map-preview-underlay.test.cjs`).
- The event double-click smoke written on September 11 passes in 2D and 3D and is now `npm run smoke:nw-event-double-click`, a CI gate alongside the new `smoke:nw-menus`.
- Verification: **3,089 Node tests pass**; `smoke:nw-menus` passes 33 real-key checks; the observational keyboard audit records every menu and dialog passing except Trait/Effect opener restoration, which correctly returns to the Database that opened them; `smoke:nw-keyboard` (issue #54, 117 checks), `smoke:nw-interactions` and `smoke:nw-event-double-click` pass. Runtime **20260912.1** (shared battle data labels only). Not committed or pushed.

## 2026-09-11 — Documentation and commit closeout

The [complete session summary](SESSION-2026-09-11.md) covers Chinese corrections, PR #56, rotating splash art, touch/keyboard work, asset sizes and framing, database/theme refinements, model lighting, and expanded action sequences with equipped items and throws. It also identifies earlier pending work included in this snapshot.

Current editor **0.98.6**, runtime **20260911.6**; latest full suite **3,082 passed**, zero failures/skips. Native authoring and held-item/throw checks pass in 2D/3D; all 13 local template runtimes match. Earlier entries retain intermediate versions/test counts and pre-commit status as history. Keyboard audit gaps remain explicit. This is a local development commit, not a release or push.

## 2026-09-11 — Equipped items and throws

Hand-attached equipment, action-item throws to comrades, arc/spin/return flights, shared 2D/3D previews, and 16 editable starter records are implemented. Existing assignments remain intact; the database has Add Starter Sequences for existing projects. Runtime `20260911.6`. [Behavior and verification](HELD-ITEMS-AND-THROWS-2026-09-11.md).

## 2026-09-11 — Action sequences and battler graphics

Six-phase assignments, class and state/reaction defaults, reusable routines, authored hit policy, 43 additional command types, and explicit actor/enemy graphics are implemented. Card spacing remains 16px; battle-room zoom is repaired. Runtime is now `20260911.5` across all 13 bundled projects. See [implementation and verification](ACTION-SEQUENCE-EXPANSION-2026-09-11.md).

## 2026-09-11 — Model inspection and richer light palettes

Inspection previews and thumbnails now use neutral lighting independent of the map, with theme-aware backdrops. Light palettes retain richer colored panels and readable cost badges. The cost card preserves a black header, bold white title and grey body in dark mode; colorful headers belong to light mode. Main editor scrollbars use the accent. Follow-up restores the original tileset palette background and gives the light-mode map controls a separate white strip. Native inspection, theme, effects and 2D event-lighting checks pass. [Details and evidence](MODEL-PREVIEWS-AND-LIGHT-THEME-2026-09-11.md).

## 2026-09-11 — Database and editor UI quality pass

Database category and record rows now have 6px side insets to keep selection fills clear of scrollbars; the category scrollbar uses the theme accent. The current quality pass addresses responsive layout and field symmetry across Database forms and main dialogs. All seven light palettes also have distinct menu/toolbar surfaces, stronger fields and selections, and full-brightness toolbar artwork. Verification includes 3,050 Node tests, 399 native screen/tab cases, 35 field checks, 14 icon theme variants, 112 light-theme text contrast pairs, and 33 asset checks. Native runner `editor/tests/smoke/nw-ui-quality.cjs` asserts field fit, paired widths, dialog bounds, and conditional spinner visibility using disposable projects. See [coverage and verification](UI-QUALITY-AUDIT-2026-09-11.md). Runtime remains 20260911.4; editor remains 0.98.6.


## 2026-09-11 — Editor event lighting and 48px icons

- System 2 follow-up: normal square Pixelated Rendering checkbox and flush SV Attack Motions table header, verified at 1280×720 and 1920×1080.

- Editor 2D model-event previews now share placed props' live lighting path. Added 48×48 icons throughout selection/source previews and runtime icon initialization.
- **3,050 Node tests**, **33 native icon/small-art checks**, and native GPU event-lighting/lifecycle checks pass. Runtime **20260911.4** matches all 13 bundled projects; editor **0.98.6**. [Scope and evidence](EVENT-LIGHTING-AND-ICONS-2026-09-11.md).

## 2026-09-11 — Audio keyboard focus appearance

- Removed the Audio Player list's clipped outer focus bar and added inset, themed keyboard focus to selected tracks and shared audio-picker rows.
- **36 native checks pass** in dark/light across all four audio categories and the shared picker. CSS-only change; editor/runtime versions unchanged. [Verification](SIDEBAR-AND-STATES-2026-09-11.md#audio-list-focus-follow-up).

## 2026-09-11 — States card arrangement and trait alignment

- Traits now sits beside General; Duration and Notes share the area beside Messages and wrap as space narrows. Main cards stack below the existing detail-width breakpoint. Trait hover/selection is inset in the Type cell, eliminating the offset marker column.
- **3,048 Node tests and 54 native checks pass.** [Layout verification](SIDEBAR-AND-STATES-2026-09-11.md#states-layout-revision). Editor-only changes; runtime remains **20260911.3**.

## 2026-09-11 — Sidebar Events and States layout

- Added Events list Up/Down/Home/End navigation and Enter editing, isolated from map cursor shortcuts. Replaced the clipped Database focus bar with an inset selected-row outline. Compacted States Duration labels, controls and checkboxes.
- **3,048 Node tests and 38 native checks pass**, including English/dark and Simplified Chinese/light. Editor remains **0.98.6**; runtime **20260911.3** unchanged. [Details and evidence](SIDEBAR-AND-STATES-2026-09-11.md).

## 2026-09-11 — Picker size follow-up

- Fixed Show Text source-cell sampling and preview sizing for non-144px faces, plus the 8px above-character star font. Actual Actor/Show Text picker clicks pass at 288px and 32px.
- **3,048 Node tests and 56 native checks pass.** Editor-only changes; runtime remains **20260911.3**. See [picker verification](CAMERA-AND-LARGE-FACES-2026-09-11.md#picker-follow-up).

## 2026-09-11 — 2D camera and 288px faces

- Completed the remaining camera request: System 2 Advanced has 1–8× zoom and X/Y framing offsets, with matching pointer navigation, bounds and saved scroll behavior. Added the 288×288 face option.
- **3,046 Node tests and 100 native checks pass** (75 camera, 25 large-face/small-art). Runtime **20260911.3**, editor **0.98.6**. See [behavior and verification](CAMERA-AND-LARGE-FACES-2026-09-11.md).

## 2026-09-11 — Expanded tile sizes and small pixel-art fixes

- Added 64px/8px tile support, tileset/character/interface preview zoom, configurable face slicing/runtime dimensions, native game-window sizing and opt-in whole-frame pixelated enlargement.
- **3,038 Node tests and 66 native checks pass**, with resized copies of real tileset art at 64, 16 and 8 pixels. Runtime **20260911.2** synchronized to all 13 bundled projects; editor remains **0.98.6**.
- The subsequent [camera follow-up](CAMERA-AND-LARGE-FACES-2026-09-11.md) completes default 2D zoom and framing offsets. See [details and evidence](TILE-SIZES-AND-SMALL-PIXEL-ART-2026-09-11.md).

## 2026-09-11 — Menu and shop touch buttons

- Restored the missing Pixi 8 `worldVisible` compatibility property, which caused visible menu/cancel and shop quantity/confirm buttons to reject all input. Removed duplicate touch processing so fast clicks dispatch once.
- **3,034 automated tests pass**. Native mouse and simulated-touch checks pass **nine cases each** in Hendrix Action Combat and Barebones, including menu open/close, all quantity arrows, and a single confirmed purchase.
- Runtime **20260911.1**, editor **0.98.6**. All 13 local project runtimes are synchronized; all 3,584 checked authored files and manifests remain byte-identical. Earlier local work is preserved. Details: [touch-button fix](TOUCH-BUTTON-FIX-2026-09-11.md).

## 2026-09-10 — PR #55 integration and issue #54 keyboard/UI fixes

- Fast-forwarded `main` to upstream merge **5732106** (PR #55: enemy Behaviour forecast), then restored existing local work. Reconciled the editor changelog and retained the prior 0.98.6 lifecycle, rendering and navigation fixes. Seven additional forecast regressions exposed and now cover selection-style, repeating-turn, zero-TP and resource-boundary errors in the incoming change.
- Fixed issue #54 list selection/focus, popup arrow handling, stable Trait/Effect dialog sizing, tileset filename readability and inactive event-condition displays. An isolated pre-fix application reproduced 23 failing UI checks. Added `npm run smoke:nw-keyboard` and a native CI gate with JSON/screenshot artifacts.
- **3,022 automated tests pass**. Native forecast checks pass 13 cases; the keyboard/UI audit passes 117 checks in English/dark at 1600×900 and Simplified Chinese/light at 1280×720, including real WebDriver arrow/Enter input. The existing 47-check interaction audit also passes. GitHub has not run the changed CI workflow.
- Editor **0.98.6**, runtime **20260907.3** unchanged. Authored projects and earlier local work are preserved. Integration fixes remain uncommitted; no push, publication or GitHub issue/comment update. Details: [PR integration](PR-INTEGRATION-2026-09-10.md), [keyboard/UI audit](UI-KEYBOARD-AUDIT-2026-09-10.md).

## 2026-09-07 — Interaction-order audit

- Reproduced and fixed cross-record Actor/Class field writes, repeated handler/preview setup, event-command shortcuts reaching outside their list, invisible selection after rapid navigation across a database batch boundary, and retired tileset pickers assigning into a later record.
- Added ten automated regressions and `npm run smoke:nw-interactions`. The native harness tests rapid revisits, nested keyboard scopes, queued retired-dialog actions, delayed/reordered map loads and seeded navigation. CI now includes this smoke and uploads seed/trace JSON plus a screenshot; that workflow update has been validated locally, not run on GitHub yet.
- **2,997 automated tests pass**. The 47-check native interaction audit passes with three seeds (120 navigation actions per seed). Fresh broader audits pass 405 database state checks, 123 command entries, 19 database sections, 56 nested dialogs and 32 menu cases. See [interaction-order audit](INTERACTION-ORDER-AUDIT-2026-09-07.md) for reproduction details and coverage limits.
- Editor-only 0.98.6 changes; runtime stays **20260907.3**. Previous working changes remain intact. No authored user project writes, commit, push or publication.

## 2026-09-07 — Map and Database navigation regressions (issue #53)

- Fixed map drag feedback jitter, cancelled-switch/Transfer Player ghost highlights, picker arrow-key routing, database boundary redraws and deferred preview/layout flicker.
- Wheel zoom now preserves the cursor anchor in 2D and 3D. 2D edge zoom can leave a bounded margin; panning cannot extend it, scrollbars cover its full range, and switching maps clears it.
- **2,987 automated tests and 73 native UI checks pass**, with no captured uncaught errors; 1,072 JavaScript syntax checks and patch hygiene pass. The native regression uses an isolated profile and disposable project/assets. See [navigation audit](UI-NAVIGATION-AUDIT-2026-09-07.md) for reproduced causes, measurements and coverage limits.
- Editor-only changes for 0.98.6; runtime revision remains **20260907.3**. Existing local work and PR #52 integration are retained. No publication or GitHub issue update.

## 2026-09-07 — PR #52 integrated into 0.98.6

- Fast-forwarded `main` from `fa81c96` to upstream merge `8bb3f5b`, then restored the existing working changes. The only conflict was the editor changelog; incoming notes and local 0.98.6 fixes are retained. Existing media, tileset-key, event-page and rendering work remains uncommitted.
- Incoming changes add music fade-in/crossfade, intros, pool ordering/shuffling, per-track volume and single-track palettes; isolate fades from volume/ducking; and correct comment/plugin-argument display and folding in map, troop and common-event lists.
- Runtime revision **20260907.3**, synchronized across all 13 bundled projects. All 30 project plugin manifests remain byte-identical.
- **2,984 automated tests pass**, plus 17 native UI checks and two real offline audio renders. Syntax checks and patch hygiene pass. See [integration details](PR-INTEGRATION-2026-09-07.md) for evidence, scope and retained backup/stash locations. No remote push.

## 2026-09-07 — 1440p movement performance on integrated Radeon

- Runtime **20260907.2**, synchronized to all 13 local projects. Keep up to four effect quads/materials per owning scene between loops while releasing textures/targets immediately; drain the cache on scene teardown. Conservatively skip a lower room floor fully covered by an unchanged opaque parallax, with decode readiness and camera/material/intervening-draw fallbacks.
- Preserve all authored quality settings. External Acer test uses a 2560×1440 rendering buffer and roughly 6.9 ms idle display intervals. Walking aggregate is 25.47 → 26.07 FPS across all seven samples, with substantial variation and unresolved spikes. Repeat shader compilations are 12 → zero per route. Do not claim smooth 60/144 FPS or a dependable large FPS improvement.
- 175 focused tests and both template synchronization tests pass; 11 floor and three effect-quad GPU comparisons match every channel. Title/map lifecycle, image reload and resizing pass. Full Windows suite initially has 2,912 passes, 34 failures, one skip; revision/sync corrections resolve 11 failures on rerun, leaving 23 outside rendering paths. Full suite not rerun after correction.
- [Performance report](PERFORMANCE.md) and [retained measurements](benchmarks/2026-09-07-potato-1440p.json) document methodology, rejected experiments and remaining work. Native diagnostic scripts/logs remain in ignored `scratchpad/perf-20260907/`. No new release, commit or authored-data changes; existing user edits are preserved.

## 2026-09-07 — Tileset flag key lifecycle

- Clicking an active tileset flag button now deselects it and hides the Key; every Key also has a localized Close button. Button highlights and accessible pressed states follow the active tool, and empty panels release their layout space. Keep the full Key reachable at 1280×720 when the sheet overflows horizontally.
- Reset the nested compact editor when leaving a database detail (including close/reopen, record/section changes and project changes), and after a successful map load. Clear passage brushes, pending paint/3D gestures and 3D selections without changing authored flags.
- Validation: **2,940 automated tests pass**. Native `editor/tests/smoke/nw-tileset-key.cjs` covers all eight flag modes, Close, brush reset, Database reopen, section/tileset changes and a map switch while Database is open; no captured uncaught errors and tileset data remains identical. `--before` reproduces the original passability toggle failure. Logs: `/tmp/rr-tileset-key-before.log`, `/tmp/rr-tileset-key-native.log`, `/tmp/rr-tileset-key-full.log`. Changed JavaScript syntax checks and `git diff --check` pass.
- Editor-only fix for 0.98.6; runtime revision remains **20260907.1**. Native checks use a disposable Demo copy and isolated profile.

## 2026-09-06 — Event-page layout and empty dropdowns

- Reproduced the audience report in English at 1280×720: page configuration overwrote its scrollable parent with `overflow:hidden`, and the flexible image area reached zero height. Keep settings scrollable, give the image section a compact non-shrinking basis, and reserve at least 88px for the preview canvas.
- Disabled Item/Actor conditions now display blank while retaining their saved IDs; re-enabling restores the prior choice. No project condition semantics or authored IDs are changed merely by opening the editor.
- Blank selections exposed a shared dropdown sizing bug: an empty label removed the line box and collapsed the trigger to 10px. The shared select shim now reserves one line plus padding/borders, preserving populated-control sizing for every locale.
- Validation: 2,937 automated tests pass. `editor/tests/smoke/nw-event-page-layout.cjs` checks the actual NW.js Event Editor at 1280×720, 1600×900 and 2560×1440 in English/Simplified Chinese/Traditional Chinese, light/dark themes, using a generated Chinese-named sprite. Checks include decoded pixels, preview size, dropdown dimensions, horizontal overflow, and condition ID round trips. `--before` reproduces the original zero-height preview. Logs: `/tmp/rr-event-page-layout-before.log`, `/tmp/rr-event-page-layout.log`, `/tmp/rr-event-page-tests.log`.
- Editor-only change; runtime revision remains **20260907.1**. Tileset dimension support is outside this fix. Tests use temporary assets and an isolated profile, without opening or saving the user's Demo project.

## 2026-09-06 — Web Battle Room media startup and cancellation

- Battle Room playback now distinguishes browser autoplay denial/cancellation from invalid media. Retry directly during pointer/key/touch gestures, prevent overlapping play requests, and release retry listeners on success, failure, and disposal. Guard duplicate media errors and keep texture creation behind decoded-frame readiness.
- MZ's promise-rejection handler ignores only `AbortError` messages identifying interrupted `play()` requests. This covers uncaught legacy-plugin video cancellation without suppressing fetch/storage cancellations or programming errors. No MV plugin behavior is replaced.
- Added five behavioral tests and `editor/tests/smoke/web-battle-room-media.cjs`. Real Chromium iframe smoke uses generated WebM with audio: ten blocked players recover on a real click; immediate disposal and native legacy play/pause cancellation stay nonfatal; missing image/video warn once each. The autoplay regression fails against the hosted 0.98.5 room player.
- Optional `ReactorQuests.json` and `.BattlePresentation.pending.json` requests already treat absence as empty data; their 404s are not fatal. Hosted itch policy/extension messages are separate from game media handling.
- Validation: **2,937 automated tests pass**, the Chromium iframe media regression passes, changed runtime syntax checks pass, and `git diff --check` is clean.
- Runtime revision **20260907.1**, synchronized to all 13 local projects. This is a source fix for the next 0.98.6 web build; the hosted archive has not been replaced. Full Demo browser battle verification hit a WebDriver timeout with software rendering; isolated real-browser media checks passed. Logs: `/tmp/rr-web-room-media-before.log`, `/tmp/rr-web-room-media-after.log`, `/tmp/rr-0.98.6-web-room-tests.log`.

## 2026-09-06 — 0.98.6 development opened

- The user reports 0.98.5 publication is complete. Start new work under **0.98.6**; keep the released 0.98.5 changelog and announcement documents as historical records.
- Update desktop/package-lock, About/localized version, browser fallback, and runtime version stamps to 0.98.6. Runtime behavior/revision remains **20260906.19**.
- Record upcoming changes under `[Unreleased - 0.98.6]` in both changelogs. Release instructions now target 0.98.6; the public download/source release reference remains 0.98.5 until the next release ships.

## 2026-09-06 — 0.98.5 release preparation

- Consolidated the release into coherent feature notes covering Battle Rooms/Action Sequences, lighting/media, quests/interfaces/audio, and compatibility/reliability. Root and editor changelogs now share the same current summary; historical development detail is retained in `docs/releases/0.98.5-development-notes.md`.
- Added `docs/posts/release-notes-0.98.5.md`, `docs/posts/itch-devlog-0.98.5.md`, and its plain-text copy. README and documentation index point to the new overview and authoring guides. Generated Battle Test database snapshots are ignored rather than committed.
- Verified 2,932 tests, 1,167 JavaScript syntax checks, zero npm audit findings, and matching runtimes in all 13 local bundled projects. Public itch page lists 0.98.5 desktop packages; their exact source correspondence has not been independently verified.
- GitHub publication is pending authentication: HTTPS push cannot obtain credentials and SSH has no accepted key. No authenticated itch.io publishing session is available; devlog files are ready for the dashboard. No binary uploads are performed by this source/announcement update.

## 2026-09-06 — Event height overwritten by Save Project

- Remove Save Project's unconditional event draft flush: a closed inspector retained its old elevation and rewrote it over a later 3D arrow drag. This also prevents stale drafts from affecting a different map.
- Keep page model selection in the draft until Apply/OK, so Cancel no longer leaks model changes into the sidecar.
- Regression: open/close Event 2 at Z=20, drag to Z=0, Save Project, reopen the editor and start a new game. Add behavioral coverage for zero/fractional heights, map switches, Cancel and Apply. 2,932 automated tests pass.

Native regression `editor/tests/smoke/nw-event-drag-save.cjs` fails before the fix (saved 20 instead of 0); validation logs `/tmp/rr-event-drag-save-before.log`, `/tmp/rr-event-drag-save-after.log`, `/tmp/rr-event-save-full.log`. Editor-only fix; runtime remains **20260906.19**. Restored the user's requested ground placement for Demo Reactor Room Event 2 by removing only its `eventZ` entry from `Map001.r3d.json`; all other authored data is preserved. Original file backup: `/tmp/rr-reactor-room-door-backup-oaahdrsq/Map001.r3d.json`.

## 2026-09-06 — Media surface source proportions

- Size newly selected media using decoded image/video dimensions instead of retaining the 320×180 placeholder. This also works in live map authoring without a local preview element.
- Keep Proportions links width/height as well as scale; turning it back on refits to the source ratio. Opening existing surfaces preserves their authored sizes. Guard late/cancelled metadata loads and preserve sparse transform commands. Update the tooltip in all 17 non-English languages.
- Validation: 2,930 automated tests pass; native portrait/square/wide resize-save-reopen checks pass in 2D and 3D, plus common-event workspace preview.

Evidence: `/tmp/rr-media-proportions-tests.log`, `/tmp/rr-media-proportions-native.log`; regression runners `editor/tests/media-surface-proportions.test.cjs` and `editor/tests/smoke/nw-media-surface-proportions.cjs`. Native tests use disposable project data and generated media. Editor-only change; runtime remains **20260906.19**.

## 2026-09-06 — Exclusive map tool ownership

- Centralize handoff between painting, Events, Media Surfaces, Lighting and 3D-M: release old panels, placements and pointer handlers before the next tool takes control. Synchronize toolbar/palette highlights and painting state; old tool resume flags cannot override the new owner.
- Direct tile/region/object selection releases Media Surfaces. Saved media hitboxes yield outside their tool while active draft gizmos retain input. Closing a tool restores the prior palette context; renderer changes cancel pending surface placement and map reloads preserve Lighting/Event/Model ownership. Project teardown releases tools.
- Keep palette tabs usable under Shadow Pen and restore a usable drawing tool when turning it off. Return region/object overlays with painting.
- Validation: **2,925 automated tests pass**; native `nw-map-tool-switching.cjs` passes **264 ordered transitions** in 2D/3D, **12 context-return toggles**, **3 direct palette selections**, and **15 renderer/map lifecycle checks**, with no captured uncaught errors. Disposable Demo copy; runtime remains **20260906.19**. Logs `/tmp/rr-map-tools-tests-final.log`, `/tmp/rr-map-tools-native-final.log`; transition details `/tmp/rr-map-tool-matrix.json`.

## 2026-09-06 — UX, themes and localization audit

- Fix English leaks in new battle authoring: 114 source phrases corrected/added across 17 non-English locales; parameterized labels, friendly enum/axis names, translated validation and live switching preserve authored data. Expand source inventory and native coverage to shared widgets, all step forms, room cameras and map media panels.
- Replace link-blue selected action buttons in older event editors and the animation Change button with theme action colors. Selected rows follow the palette; primary/hover contrast, light picker arrows, inactive condition labels and RTL spatial controls are corrected.
- Fix a detached-select MutationObserver crash discovered during live language switching. **2,924 automated tests pass**; native 36 sequence layouts and 18 room/media panels pass, preserving edits through language changes. See [UX/localization audit](UX-LOCALIZATION-AUDIT-2026-09-06.md) for the full theme matrix, evidence and coverage limits. Runtime remains **20260906.19**; editor-only changes.


## 2026-09-06 — Application workflow audit

- Catalogued and fixed **10 confirmed defects**, with **20 new regressions**. Event clipboard/delete/undo now preserves placement and selects live restored objects; height-only sidecars survive saving. Map copies preserve separate sidecar files, deletion removes them, failed writes roll back incomplete copies/metadata, and stale async operations cannot reach the next project. Same-name tilesets require matching content; failed imports retain the original database. Deletion stages starting-position repairs and handles failure without dropping map entries or leaving stale MapInfos aliases.
- **2,919 automated tests pass**. Fresh native checks pass: 405 database state checks, 123 command entries, 56 nested dialogs, 32 menu/theme/locale cases, separate Action Sequence authoring, map/event/region workflows, editor saving, Project Tools, battle/animation/layout regressions. Actual browser distribution/persistence passes. All 11 older 2D projects pass 92 startup/map/menu checks with no captured runtime/WebGL/missing-file errors; seven authored intros prevent testing directional input at the sampled start.
- Full catalogue, evidence and explicit coverage limits: [Application audit](APP-AUDIT-2026-09-06.md), [summary JSON](audits/2026-09-06-app-summary.json). Logs `/tmp/rr-app-audit-*.log`; runtime remains **20260906.19**. No authored project edits or publication.


## 2026-09-06 — Event OK commits and retained door elevation

- Event Editor now commits a new event even when its standard fields are unchanged or only its 3D model is selected. Apply inserts once and stays open; OK shares that commit and closes. Failed ID/map validation leaves the draft open and does not write model/elevation data.
- Removed sidecar writes from Cancel: an earlier session's `pendingZ` could overwrite a subsequently dragged/saved height. Initialize draft elevation per session, preserve the latest Apply baseline, and start new events without orphaned model/elevation entries from recycled IDs.
- Commit model/elevation changes before refreshing event previews. Elevation/model-only edits now notify EventManager and capture undo; event undo/redo includes heights while leaving unrelated media/sidecar fields untouched. Legacy undo snapshots without heights remain supported.
- Native `nw-event-commit.cjs` reproduced untouched OK dropping the event and Cancel reverting a saved arrow move. Fixed checks cover Static Room OK/Apply, model-only creation, Door event 2 arrow movement, Z-only OK, save/reload and a fresh game process: runtime model position `[24.5, 0.75, 0.5]`, lift `0.75`, no captured runtime errors. Synthetic test height in a disposable Demo copy only; authored Door still has its existing saved Z=20 and must be repositioned after restarting the editor. `/tmp/rr-event-commit-native.log`.
- **2,899 automated tests pass**, `/tmp/rr-event-commit-full.log`. Editor-only change; runtime remains **20260906.19**. No authored project edits or publication.


## 2026-09-06 — Create events on empty 3D map tiles

- Fixed empty-ground interaction in 3D Event mode: double-click now calls the normal event activation/creation path, and a single click selects the tile for Enter. Empty clicks clear stale event selection. Navigation mode retains double-click camera framing; active media authoring retains its own input.
- Reproduced on a disposable copy of Demo's Static Room after duplicating/editing a media surface. Media tool cleanup was already working; empty 3D double-clicks previously only reframed the camera. Native `nw-media-event-creation.cjs` verifies double-click, click + Enter, right-click New Event, switching away from unfinished media placement, cancel without insertion, and committed map saving. All five media descriptors remain identical in memory and the saved sidecar. No captured missing-file/runtime/WebGL errors; `/tmp/rr-media-event-native.log`.
- **2,893 automated tests pass**, `/tmp/rr-media-event-full.log`. Updated two old source assertions that assumed all empty double-clicks reset the camera. Editor-only change; runtime remains **20260906.19**, authored project data unchanged.


## 2026-09-06 — Independent media surface corners

- Fixed 2D corner/edge editing recalculating nominal width/height: these values affect standing lift and perspective, so changing them moved untouched corners. Quad edits now preserve the base dimensions/anchor; width/height inputs still resize explicitly. Numeric corner inputs resolve the current corner object after a drag. Canvas handle picking uses visible map coordinates, including when HD-2D prepasses leave PIXI's event boundary on an offscreen root; listeners are removed on backend teardown.
- Replaced 3D corner-driven whole-plane scaling with independent vertices. No Shift moves only the selected corner; Shift uniformly scales the original quad around its opposite corner, preserving an existing warp. Mid-drag modifier switching works. Position, elevation and scale fields stay unchanged by corner edits.
- Optional normalized `worldCorners` persists 3D shapes through Show/Transform commands and map-owned surfaces. Runtime planes and scanlines, plus Battle Room media and editor battle previews, use the same vertex ordering. Absent data preserves old rectangular 3D surfaces and existing 2D warps. Runtime revision **20260906.19**, synced to 13 templates without changing plugin lists.
- **2,892 automated tests pass**, `/tmp/rr-independent-corners-full-final.log`. Native toolbar test verifies actual unselected world vertices, proportional/normal modifier transitions, saved/reopened shapes and matching battle-media vertices; actual flat-map pointer drag confirms the other three projected corners/anchor stay fixed. Existing save/duplicate/undo/tool-switch/ceiling checks pass. `/tmp/rr-independent-corners-native-final.log`, `/tmp/rr-flat-corner.png`. Disposable test project only; no authored project data changes or publication.


## 2026-09-06 — Media Surface implementation naming

- Canonical editor classes/files are `MediaSurfaceEditor` and `MediaSurfacePreviewManager`; app/controller code uses `mediaSurfacePreviewManager`. Old CommonJS paths, browser globals and instance properties remain aliases to the same implementations. Pop-out shell is `media-surface-panel.html`, now explicitly included in editor distribution packaging.
- Runtime API is `RPGReactorMediaSurfaces` with `MediaSurfaceOwner`/`MediaSurfaceManager`; old API and class names remain aliases. Updated internal consumers, descriptive labels, handle accessibility text and diagnostics. Persistent command IDs, saved fields, preference keys/events and DOM hooks remain stable; no project migration. See [Media surfaces](MEDIA-SURFACES.md) for the mapping and compatibility contract.
- Runtime **20260906.18**, synced to all 13 templates without changing plugin lists. **2,888 automated tests passed**, `/tmp/rr-media-rename-tests-final.log`. Native toolbar workflow passed creation, Shift/free/mid-drag resizing, save/duplicate/undo/tool switching, ceiling authoring and battle media; `/tmp/rr-media-rename-native.log`. Added the scale-link/Shift tooltip to all locale text catalogs. No authored project-data edits or publication.


## 2026-09-06 — Shift to resize media surfaces proportionally

- Corner dragging in 3D now uses Shift for proportional resizing; without Shift, X/Y scale follows the pointer independently. Shift is accepted when starting a corner drag and is read on every move so it can be pressed/released mid-drag. Keep Proportions continues linking numeric scale fields/sliders; its tooltip explains the distinction.
- Flat-map, screen-overlay and dialog corner controls use the same modifier. Shift uniformly scales the original quad around its opposite corner, preserving its proportions/warp; releasing Shift restores free placement from the drag snapshot. Existing 3D centre anchoring and edge-handle behavior remain intact. Updated live help.
- Validation: 46 targeted media tests passed, `/tmp/rr-media-shift-tests.log`. Native `nw-media-surface-toolbar.cjs` passed Shift held before grabbing, unconstrained off-diagonal dragging with linked sliders enabled, and Shift press/release during the drag, plus existing placement/save/duplicate/undo/tool-switch/ceiling/battle-media checks; `/tmp/rr-media-shift-native.log`. No runtime or authored project-data changes.


## 2026-09-06 — 2D template audit, picture choices and video frames

- Audited all 11 non-3D templates in native NW.js: startup/map frames, six standard menu return paths, seven additional gameplay maps, and nine configured Battle Tests. Final sampled paths have no captured missing-file/runtime/WebGL errors. Seven battle probes reached attack invocation; Freelancers/Origins forced-action completion remains unverified. This is smoke coverage, not full playthrough or save/victory/transfer certification. Full matrix, limitations and reproduction: [2D compatibility audit](2D-COMPATIBILITY-AUDIT-2026-09-06.md).
- Fixed PSYCHRONIC picture-choice ownership across scene destruction (Freelancers null `scale.x` crash), refreshed choice icons after delayed IconSet loading (all six Origins nation flags visibly verified), and allocated video texture storage before decoded frames arrive (Origins Map 489 GPU texture overflow, now verified rendering nonblank video).
- Corrected only Freelancers enemy 354's entry notes: set down-facing direction after starting walk. Native Battle Test confirms all three robots face down toward up-facing actors. No runtime/plugin facing override retained. This is a local edit to ignored project `data/Enemies.json`; plugin lists and other enemy notes are preserved.
- Runtime **20260906.17**, synced to all 13 templates. **2,883 automated tests pass**, `/tmp/rr-template-audit-full-final.log`. Native evidence paths are in the audit report. Test setup uses disposable project copies and profiles. No commit/publication.


## 2026-09-06 — Unicode map loading and legacy 2D fog scrolling

- Added shared `RRJson` file decoding (`runtime/reactor_json.js`, mirrored as `editor/src/utils/JsonFiles.js`). Editor project/database/map readers, map sidecars and Battle Room readers accept UTF-8 with or without BOM and BOM-marked UTF-16 LE/BE. Runtime database/map XHR keeps its existing text interface for plugins and strips a leading BOM; native Chromium decoding was verified for all four encodings. Battle Room filesystem/fetch readers decode bytes through the same helper. Invalid bytes/JSON still fail, interior Unicode/BOM characters survive, and saves remain ordinary UTF-8 without BOM. No global JSON or filesystem monkeypatch and no legacy-codepage guessing.
- Fixed frozen VE fog/dust in Rebellion and the PSYCHRONIC MZ fog port: normalize numeric/string blend modes before comparing the fog sprite with game data. The old comparison recreated every layer each frame and wrote movement onto the discarded sprite. Stable fogs now retain their sprites; genuine name/hue/blend/depth changes still recreate and immediately position the replacement. Existing commands, movement speeds, opacity, zoom and numeric saved game data are preserved; legacy PIXI and unrelated fog plugins keep their methods.
- Follow-up opacity comparison: `RR_FOG_OPACITY=1 node editor/tests/smoke/nw-fog-scroll.cjs` renders the same sand texture through Rebellion’s original MV core + PIXI 4.8.9 and Reactor. Peak and summed alpha match exactly at opacity 0, 100, 192 and 255 (`/tmp/rr-fog-opacity.log`). Both authored title fogs use 100/255. The broken recreation path displayed fresh sprites at 255/255, so the corrected fog is lighter than the frozen version. No authored opacity adjustments were made.
- Runtime **20260906.16** synchronized to all 13 templates, preserving plugin lists and authored project data. Updated build preflights include the new JSON module.
- Validation: **2,871 automated tests passed, zero failures**, `/tmp/rr-encoding-fog-full.log`. Native `nw-json-encodings.cjs` passed editor load/save, sidecar, database and actual runtime XHR-hook checks for all four encodings, `/tmp/rr-json-native.log`. Native `nw-fog-scroll.cjs` followed Rebellion’s normal startup, confirmed stable fog objects, changing rendered sand pixels, matching scroll coordinates, all three visible title ships, and no missing-file/runtime/WebGL errors; `/tmp/rr-fog-native-final.log`, screenshot `/tmp/rr-fog-scroll.png`. Tests use disposable project copies. An initial diagnostic transfer moved the camera above the ships; the final test uses the authored startup transfer and preserves their visibility. No commit/publication.


## 2026-09-06 — Visible surface duplication and Event tool ownership

- Duplicate is now in the fixed footer of the live **Map Media Surface** editor, in addition to the list. It validates/applies the current form, then creates and opens a copy with a new ID. This preserves current adjustments and uses the existing history/persistence path.
- Enabling Event mode closes the map media tool and authoring gizmos before installing event interaction. The media toolbar highlight clears; saved previews remain visible but decline selection/context clicks, and PIXI/DOM surfaces yield pointer ownership. Returning to Media Surfaces disables Event mode, including direct manager opens. The existing close/cancel lifecycle still applies to unfinished forms when switching tools.
- Native `nw-media-surface-toolbar.cjs` passed: footer button visibility and duplication using current form values, mutually exclusive toolbar states, cleared authoring, a real pointer selection of event 24 after switching, and return to Media mode. Existing placement/resize/undo/save/ceiling/battle-media checks passed too. Log `/tmp/rr-media-tool-switch-native.log`, screenshot `/tmp/rr-media-duplicate-panel.png`. Targeted checks: 74 passed, `/tmp/rr-media-tool-switch-tests.log`. No authored map or runtime changes.


## 2026-09-06 — Duplicate media surfaces and align elevation controls

- Added Duplicate beside Delete in each Media Surfaces list card. The copy retains all source settings and its exact pose, receives an ID that avoids permanent and event-owned surfaces, is inserted immediately below the source, and opens for editing. Duplication and subsequent edits participate in existing undo/redo and map saving. Nested settings are copied independently. List actions have their own row to preserve filename space.
- Fixed Z/Elevation alignment in the shared media editor: revealing conditional fields now restores their flex layout instead of clearing it. Labels, number fields and sliders retain the same spacing as X/Y, including after target switches; Culling Distance receives the same correction.
- Validation: **64 targeted automated tests passed**, `/tmp/rr-media-duplicate-tests.log`. Expanded native `nw-media-surface-toolbar.cjs` passed on a disposable Demo copy, including Duplicate button → edit copy → save, original preservation, undo, and field/slider geometry at 440px and 360px panel widths. Existing resize, ceiling placement and battle-media checks also passed with no missing-file/WebGL errors. Log `/tmp/rr-media-duplicate-native.log`. No runtime changes or authored project data changes.


## 2026-09-06 — Map media toolbar, ceiling navigation, and surface transforms

- Added **Media Surfaces** beside Lighting with an angular cyan/magenta/metal SVG icon. Its map list offers placement, editing, deletion, undo and redo. Click a wall/floor/ceiling to align a new plane, choose an existing movie/picture in the shared picker, then use the live controls. Surface IDs share the event-command namespace; generated IDs avoid existing map and event surfaces.
- Permanent descriptors live in optional `reactor3d.mediaSurfaces` in the map sidecar and participate in normal map saving/dirty tracking, including flat maps. No synthetic events are inserted. Runtime seeds decorations once on map entry; ordinary Transform/Stop commands still address them and suspended state survives battles. Battle-owned viewports load their own image/video planes, transforms, opacity, rate, scanlines and culling, with resource cleanup. Runtime revision **20260906.15**, synced to all 13 templates without changing plugin lists.
- The editor camera now permits pitch from -89° to 89°. **Ctrl + right-drag** looks around from the same eye position (Alt-left-drag is also supported); WASD moves horizontally and Q/E changes height. Hidden dialogs no longer block navigation, while visible dialogs retain focus. The live media panel permits camera movement and prevents accidental tile/prop/event edits. Zero pitch remains level.
- Moved transforms directly below position: linked Scale X/Y sliders with **Keep Proportions**, separate X/Y/Z rotation sliders, existing rings/arrows and new yellow corner resize handles. All update numeric controls and preview live. Corner resizing holds the centre still; unlinked axes stretch independently. Existing serialized dimensions, signed scales and event commands remain supported.
- Verification: **2,855 automated tests passed, zero failures**, `/tmp/rr-media-toolbar-full.log`. Native `nw-media-surface-toolbar.cjs` passed using a disposable Demo copy and its actual PNG: toolbar placement, wall/floor normal alignment, linked scale and tilt sliders, actual pointer resizing (1.5 → ~1.795), saving/reopening, Cancel, undo, ceiling placement (90° tilt at Z 23.11), stationary-eye upward look, and battle-owned texture rendering/cleanup. No missing-file or WebGL context errors. Screenshots `/tmp/rr-media-toolbar.png`, `/tmp/rr-media-transform.png`, `/tmp/rr-media-ceiling.png`; log `/tmp/rr-media-toolbar-native.log`. Authored Demo maps, assets, party/formation settings and plugin lists preserved. No commit or publication.


## 2026-09-06 — Media surface position controls

- Event-command media surfaces now show X/Y/Z position sliders directly in Binding & Position, including the live map panel. Sliders use a useful local range, recenter after release, expand for typed/gizmo values, and retain 0.01 precision. Screen targets keep their existing 2D controls.
- The live 3D surface shows shared `RRAxisArrows3D` alongside its rotation rings. World X/Z map to command X/Y; world Y maps to Z elevation. Event/player-bound horizontal offsets convert through tile size while map offsets and elevation stay in tiles. Arrow edits affect only their axis, update numeric/slider values immediately, intercept camera gestures, and dispose with the authoring owner.
- Verification: **2,851 automated tests passed, zero failures**, `/tmp/rr-surface-position-full.log`; native `nw-media-surface-position.cjs` passed. The native check used an existing project PNG, raised the surface with a real pointer drag while retaining its X/Y and rotations, verified 5.49 in both numeric and slider controls, checked OK serialization and Cancel/owner cleanup, and found no missing-file/WebGL errors. Screenshot `/tmp/rr-media-position-arrows.png`, log `/tmp/rr-surface-position-native-final.log`.
- The user also asked whether Media Surfaces should have a toolbar tool for permanent map decoration. Recommended placement/editing alongside Lights and 3D Props, saving map-owned surfaces and loading them automatically in Battle Rooms; event commands remain the dynamic control path. This proposal is implemented in the later toolbar entry above.


## 2026-09-06 — Sequence media, live room effects and projected battler placement

- Runtime **20260906.14**: new Sound/Animation cues default to zero frame wait and optionally wait for their own completion. The player advances with a cue cursor, so zero-duration cues sharing a timestamp remain ordered and Skip applies impacts exactly once. Existing saved durations and untagged plugin animation behavior stay intact. Room and flat/MV animations accept tile offsets plus a scale multiplier; flat requests keep their normal lifecycle, with instance-owned transforms and explicit media tickets.
- Action Sequences uses the shared animation picker. Its Effekseer calls now select their owning context before playback/draw/release, verified while a live 3D view remains behind it. Hit Physical and other animation-owned sounds play on their authored frames; preview audio uses volume/pitch/pan. Sound has an explicit Choose Sound button, filename and read-only properties, with Wait (frames) and completion options. MV preview fallback uses the shared layer with optional sound callbacks and pause support. Preview cleanup releases owned sounds/effects/layers.
- 3D Models previews additional media surfaces concurrently, immediately starts a newly chosen file, keeps unsaved anchor/source changes live, avoids calling play on PNG images, and discards callbacks from disposed image textures.
- Battle Rooms now advance prop animation queues, selected effects, attached image/video planes and pulse/flicker lights. Media loads use existing project files and valid decoded texture dimensions, follow animated part anchors and release on owner/room disposal. Preview media is muted like the map editor; game media honors its saved audio setting.
- Troops draws E-number markers from the same formation as Set Up Room. Native pointer dragging on a marker/model changes only BattlePresentation enemy placement; legacy troop member coordinates remain unchanged. Camera freezing, grab offsets, height planes, pointer capture and cancellation keep dragging stable. Runtime sprites expose projected positions/home positions/dimensions and enemy screen coordinates without overwriting bitmap source frames. MOG Battle Cursor converts live projected bounds into its parent coordinates for above/center/side placement.
- Validation: **2,849 automated tests passed, zero failures**, `/tmp/rr-media-full-final.log`. Expanded native authoring and Battle Room checks passed, including Hit Physical audio, media completion/concurrency, room marker drag/save, animated media/lights, projected battler dimensions, map return and no missing-file/context/zero-size texture errors. Logs: `/tmp/rr-media-native-context.log`, `/tmp/rr-room-placement-native.log`. Shared runtime files match all 13 bundled projects; editor BattleData matches canonical runtime. Authored Demo maps/formations/assets and plugin lists were preserved. No commit or publication.


## 2026-09-06 — Descriptive action steps

- `DatabaseActionSequenceEditor.stepDescription` derives concise labels from motion, role/numbered target, destination, stopping distance/offsets, sound filename, database animation and weapon visibility/source. User motion Run/Walk informs later movement labels only when that motion applies to the moving battler; all-target movement keeps the generic Move label rather than assuming a shared motion. Exact home movements say Return Home, with Home Facing distinguished in secondary text. Unknown authored motion names preserve their spelling; missing animation IDs remain visible as numbered references.
- Both list/timeline rows use primary descriptions and smaller details/frame ranges, plus full native tooltips and accessible labels. `validate` refreshes existing description nodes; nonstructural inspector edits no longer rebuild rows, and duration changes refresh timeline proportions. Gizmo/picker updates therefore stay current. Dynamic composed rows bypass automatic whole-label translation and refresh their translated components on language changes; the listener is removed on disposal. The Motion dropdown now matches the runtime Idle default when no motion is explicitly stored.
- Existing native authoring coverage additionally checks Unarmed Punch’s Run/Target/Punch/Home labels, stopping distance and home-facing detail, changes Run to Walk through the inspector and checks the subsequent movement row updates without replacing either row, and checks the picked sound appears in its row. Validation: **2,840 automated tests passed, zero failures**; native authoring passed with the new descriptions. Logs: `/tmp/rr-step-descriptions-native.log`, `/tmp/rr-step-descriptions-full.log`; responsive screenshots `/tmp/rr-sequence-layout-2560.png` and `/tmp/rr-sequence-layout-1280.png`. Runtime/data schemas stay **20260906.13**; no authored Demo data changed, no commit or publication.

## 2026-09-06 — Concurrent motion gizmos and shared sequence sound picker

- Motion overrides now display both `RRAxisArrows3D` and `RRPoseRings3D`; the selected Move/Rotate tool only decides overlapping hit priority. Distinct arrow heads remain draggable while Rotate is selected. Axis mapping preserves map X/Y and height Z, updates the existing numeric fields live, and keeps one undo snapshot per drag. Other preview modes retain their existing tool visibility.
- `DatabaseActionSequenceEditor.pickSound` uses `RRAudioPickerModal` and `RRAssetFiles.AUDIO_EXTENSIONS`. Current name/volume/pitch/pan are passed to the picker and saved together on OK, preserving additional existing audio properties. Cancel does not mutate data, and stale callbacks cannot alter a different project, host, sequence or selected step. The sound inspector shows one filename/picker button instead of a separate file dropdown and duplicate level boxes. Sequence playback pauses while choosing sound.
- The persistent inspector header updates its translation source with each selected step/Preview Formation, preventing a shared picker translation pass from reverting Play Sound to the original Battler Motion title.
- Native authoring coverage now drags an offset arrow while the rings and Rotate tool remain active, checks single-axis changes/readout synchronization/Undo, and exercises the real audio picker with an existing project sound, level changes, Cancel, OK, reopening, Undo/Redo and save/reload. Validation: **2,840 automated tests passed, zero failures**, and the native authoring checks passed. Logs: `/tmp/rr-sequence-arrows-audio-native.log`, `/tmp/rr-sequence-arrows-audio-full.log`; screenshots `/tmp/rr-sequence-transform-rings.png`, `/tmp/rr-sequence-audio-picker.png`. Runtime and schemas remain **20260906.13**; no authored Demo data or plugin lists changed, no commit or publication.

## 2026-09-06 — Live Battler Motion transform sliders

- `ActionSequencePreview` now builds compact X/Y/Z-colored slider rows beside precise numeric fields for offset, rotation, proportional and per-axis scale. Slider input and numeric input paint immediately; slider gestures create one undo entry, and double-click resets to zero/one. Initial ranges are ±5 tiles, ±180 degrees and 0.01–4×; exact numeric values retain the existing schema limits and expand slider bounds when needed.
- Override Transform shows the shared rings immediately. Local Move/Rotate buttons mirror the preview toolbar. Disabled motion overrides hide their gizmos. Ring dragging updates existing slider/input nodes instead of rebuilding the inspector; selection, inspector scroll and layout remain stable. Shared ring highlighting shows the held axis. Runtime/model asset data formats are unchanged; revision stays **20260906.13**.
- Transform editing evaluates only through its motion at the end boundary, preventing a following zero-duration motion from overwriting the pose under adjustment. Explicit playback/scrubbing uses the full sequence; Undo restores the selected motion preview. A focused test covers this boundary.
- Native `nw-sequence-authoring.cjs` verifies enabling the override exposes seven sliders and rings, a real slider drag updates the rendered target and readouts before release, multiple input ticks produce one undo record, Undo restores values, numeric input updates immediately, and ring drags synchronize both control types before release. Existing clipboard, drag/reorder, Play Step, responsive and persistence checks pass. Log `/tmp/rr-motion-sliders-native.log`; inspected `/tmp/rr-sequence-transform-rings.png`. Full suite: **2,840 passed, zero failures**, `/tmp/rr-motion-sliders-full.log`. No Demo authored data changed, no commit or publication.

## 2026-09-06 — Step editing, single-step playback and cinematic cameras

- Runtime **20260906.13** (supersedes the abrupt-cut draft .12). Action Steps uses the shared typed clipboard, scoped Ctrl/Cmd+C/X/V and a context menu. Paste/add/duplicate insert below a captured selection; delayed clipboard operations are guarded against navigation and edited cut records. Drag rows or the Add Step button to explicit boundaries with edge scrolling. Existing scroll/focus preservation and native text editing remain intact.
- Play Step evaluates a prefix through the selected cue, replays only its effects, and stops at its boundary even with Loop or a following instantaneous step. Instant motion previews get 60 frames; other instant cues get one. Full playback remains available, and the step time label is relative to its own interval.
- Battle Room Setup exposes Cinematic Cuts only as a troop override and retains it while navigating the overview. Runtime shot transitions use smoothstep over 30/24/42 rendered frames for actor/impact/return, shortest yaw arcs and a bounded 18-degree sweep. Repeated target occurrences are deduplicated for framing, not combat resolution. Repeated impact/end callbacks do not restart transitions. Manual camera modes bypass automation; ordinary map cameras remain unchanged. No obstacle avoidance or cinematic battlebacks yet.
- Focused tests cover clipboard failures/stale panels/anchor insertion, pure camera sampling, smooth transitions, group framing, repeat stability, overview restoration and yaw wrapping. Native `nw-sequence-authoring.cjs` covers real pointer reordering, native keyboard copy/cut/paste, context menus, Add Step dragging, isolated Play Step, responsive layout and save/reload. `RR_CINEMATIC=1 nw-unarmed-punch.cjs` checks the actual rendered Fleagus punch, continuous camera angles and exact settled overview. `nw-battle-presentation.cjs` verifies cinematic selection/navigation/Apply/persistence alongside existing room lifecycle checks.
- Validation: **2,839 automated tests passed, zero failures**; the native authoring, cinematic punch and full Battle Room lifecycle checks passed. Logs: `/tmp/rr-step-camera-full-final.log`, `/tmp/rr-step-editing-native.log`, `/tmp/rr-cinematic-native.log`, `/tmp/rr-cinematic-setup-native.log`. Inspected `/tmp/rr-cinematic-actor.png` and `/tmp/rr-cinematic-impact.png`; the reactor-room approach and punch remain visible. All 17 non-English locales include the new controls/help. Three changed runtime files are synchronized to all 13 template copies; plugin lists and authored Demo formations/assets are preserved. No commit or publication.

## 2026-09-06 — Matching sequence inspector card

- The right inspector now uses the same `BattlePresentationEditor.section` structure as Action Steps: themed outer card, accent header and inset scrolling content. Step selection and Preview Formation update the persistent card header. Runtime and authored data are unchanged. Native authoring validation: `/tmp/rr-sequence-inspector-card-native.log`; screenshots retain `/tmp/rr-sequence-layout-2560.png` and `/tmp/rr-sequence-transform-rings.png`.

## 2026-09-06 — Action Steps sidebar and stable selection

- Action Steps moved from below the stage to the workspace’s left column; the preview and inspector occupy the other columns. The list takes available height, with its mode switch above and Add Step controls below. Columns narrow at the database detail’s existing container breakpoint. Runtime remains **20260906.11**; no sequence or project data changes.
- Selecting a step now updates row classes/ARIA state and the inspector without rebuilding step buttons, preserving native scroll and keyboard focus. Required rebuilds capture/restore both scroll axes and restore an existing focused step by ID with `preventScroll`.
- Native `nw-sequence-authoring.cjs` verifies a click on step 46 in a 69-step disposable sequence retains scroll, DOM identity and focus; inspector changes and horizontal timeline selection preserve scrolling too. It checks the left-column placement and no outer overflow at 1440p, 1080p and 720p, plus the existing target-placement/ring/scale/save checks. Log: `/tmp/rr-sequence-sidebar-native.log`; inspected `/tmp/rr-sequence-layout-2560.png`. Ring testing zooms out for the moved target and picks a point inside the resized stage. No commit or publication.

## 2026-09-06 — Action Sequence preview and transform authoring

- Runtime **20260906.11**. Fixed 720×340 preview was stretched in larger panels. `ActionSequencePreview` sizes both the composite canvas and Three renderer using the stage rectangle, DPR and 1.5× supersampling (width cap 2560), supplies preview zoom, and reuses `RRAxisArrows3D` / `RRPoseRings3D`. Its ResizeObserver and gizmos are disposed on teardown; old asynchronous cast loads still use generation guards. The inspector and Action Steps scroll independently, while the detail fits 2560×1440, 1920×1080 and 1280×720.
- Preview Formation owns temporary homes for each numbered target; field/marker/mesh/arrow selection edits only these homes. Model raycasting plus nearest foot markers prevents a neighboring battler intercepting a placement drag. Step Transform edits saved motion/move keys, with one undo snapshot per gesture. Model motion fields support offsets, rotations, proportional and per-axis scale. Temporary formations never write the sequence or Troops. No Demo authored data changed in this pass.
- Optional `motion.transform` interpolates a separate visual layer over travel, resets on the next unoverridden motion, and supports exact pure seeks. `visualPose` combines it for editor and runtime. Optional `targetIndex` selects a distinct target for choreography; original repeated target occurrences still flow through the unchanged impact resolver. Missing numbered targets skip presentation. Runtime models/billboards accept proportions, conventional model battlers accept rotations/depth scale, and cleanup restores saved model transforms plus the exact room home fields (preventing leftover scale axes).
- Validation: **2,835 automated tests pass**, `/tmp/rr-sequence-authoring-full-final.log`. `/tmp/rr-sequence-authoring-native-final.log` verifies responsive resolution/layout, Target 2 numeric and pointer placement with unchanged neighbors/data, actual ring dragging, scale and save/reload. `/tmp/rr-sequence-transformed-battle.log` verifies a real stretched/offset Fleagus punch and restoration, with no missing assets or WebGL errors. Screenshots `/tmp/rr-sequence-layout-2560.png` and `/tmp/rr-sequence-transform-rings.png` show the revised editor. New labels cover all 17 non-English locales.
- Four canonical runtime files match all 13 template copies; editor BattleData matches the shared runtime module. New helper is registered in editor/index.html and marked intent-to-add for shipped-file checks. No commit or publication.

## 2026-09-06 — First unarmed punch sequence

- Runtime **20260906.10** adds Unarmed Punch (96 frames; impact at 46), Run to Target / Punch / Return Home expansions, approach-relative spacing and explicit travel/target/home facing. These remain ordinary serial steps. The sprite adapter supports travel-facing changes and restores original scale; movement evaluation preserves facing on legacy homes without that field.
- Actor bindings may contain an optional `unarmed` assignment, checked only for weaponless normal attacks after explicit skill overrides and before the actor default. Assignment edits preserve nested fields; references protect nested sequence usage. Demo ActionSequences #1 and actors 1/2 unarmed assignments were saved through DatabaseManager’s pair writer. Existing troop settings, equipment, selected test party and plugin manifests are preserved. Prior presentation backup: `/tmp/rr-unarmed-before/BattlePresentation.json`.
- `BattleRoomView.prepareMotions` adds per-instance run/walk action aliases from configured travel clips and a generated 36-frame right-arm jab for compatible actual skinned humanoid bones. Explicit authored punch rules win. It never edits source clips/assets or props. Run aliases loop. Model preview seeks sample exact clip time without runtime crossfades; normal gameplay retains crossfades.
- Native `/tmp/rr-unarmed-punch.log` verifies a real Fleagus unarmed BattleManager action over rendered room frames: one impact, local fist travel over 0.6 model units, opposing approach/return facing and restored home. Editor verifies all three building blocks, repeatable backward/forward punch scrubbing and the actor unarmed dropdown/Open Sequence control. Screenshot `/tmp/rr-unarmed-punch-editor.png` inspected. Tests use disposable copies and actual assets.
- Validation: **2,832 tests pass**, `/tmp/rr-punch-full-final.log`; 22 focused battle tests pass, `/tmp/rr-punch-unit.log`. Existing native `/tmp/rr-punch-room-regression.log` verifies camera/drag/layout, repeats, room events, return cleanup and mixed 2D/3D battlers, with no missing assets or GPU errors. `git diff --check` has only pre-existing CRLF notices.
- All 13 template runtime copies and editor BattleData match canonical files. New authoring labels are translated across all 17 non-English locales. No commit or publication.

## 2026-09-06 — Battle asset diagnostics, upright ATB icons and database layout

- Runtime **20260906.9**. The owner’s actual Battle Test party is Fleagus + Karen, while earlier new-game smoke tests used Fleagus + Carol. Karen has no 3D battler binding and references absent `img/sv_actors/Actor1_4.png`; with PSYCHRONIC Charset mode enabled her absent character reference is `Actor1`. `BattleTestConfigModal.missingBattlerGraphics` checks selected actors against the active normal SV / supported PSYCHRONIC Charset path before writing test data or launching, honoring active battler models. It shows an inline actor/path diagnostic; encrypted imports keep runtime validation. Owner has not answered whether to replace Karen with Carol, so the authored test party is preserved.
- `DatabaseEditorUI` builds actor image slots without requesting their obsolete 2D art while the corresponding model is selected. The decorator invokes the deferred image load when switching back to 2D. Native checks verify Carol emits no `Actor1` request and Fleagus’s real sprite loads on demand when its character model is toggled off, then restores the model in a disposable copy. The logged `Actor2_2` error came from the actor image card, separate from the animation context problem.
- PSYCHRONIC ATB model icons derive the vertical UV correction from the bitmap’s external GPU source; copying another sprite’s current texture rotation is insufficient because its frame may have been rebuilt. The icon reasserts MIRROR_VERTICAL for bottom-up framebuffer rows and clears it for the canvas-copy fallback. This does not alter the model or world-facing data.
- Missing animation `Blow1` is a real absent SE reference. `AudioManager.playSe` now resolves known local formats/case/encryption before allocating a buffer, skips a confirmed missing file and logs once per URL. It rechecks subsequent plays so adding the intended asset restores playback. Remote and web URLs keep their normal loaders. This does not supply a substitute sound or change the animation record. Unit tests cover 40 repeated cues, import recovery, uppercase alternate formats, encrypted files and web/remote delegation.
- The Animations page and effect browser now make their Effekseer context current before updates, split draw passes, playback, stop and effect/context teardown. A native competing-context test draws two real effects while a separate context takes ownership every frame; sampled pixels change and there are no foreign-object/program/GL errors. Existing layer/room ownership is preserved.
- Traits tables in actors/classes/enemies/weapons/armors/states give the selection indicator a separate empty header cell, aligning Type/Content with their rows. Shared card headings use the theme accent border. Number-stepper wrappers fit the column rather than retaining their original pixel width; the Price row wraps whole field groups. Items now has General/Note in the left stack and Invocation/Damage/Effects in the right stack, collapsing through the existing narrow-pane query. Action Sequence stays below both. Inspected actual Potion screenshots `/tmp/rr-items-layout-1600.png` and `/tmp/rr-items-layout-1280.png`.
- Verification: full **2,829 passed, zero failed**, `/tmp/rr-battle-regressions-full-final.log`. New native `editor/tests/smoke/nw-battle-regressions.cjs` passes actor graphics toggle/restoration, Karen diagnostic versus configured model actors, Traits/Price/accent checks at 1600/1280, compact item stacks, concurrent-context animation pixels, the true `?test&btest` boot, upright shared ATB UVs, and 40 missing-sound cues with zero buffer requests/no stopped scene; `/tmp/rr-battle-regressions-native.log`. Existing expanded room native smoke also passes, `/tmp/rr-battle-regressions-room-native.log`, including navigation, prop transforms, no unused battleback requests, repeats, room events, teardown/return and mixed 2D/3D rendering.
- Canonical main/managers/battle-presentation match all 13 sample copies. Existing authored assets, maps, assignments and plugin manifests were preserved (owner disabled PSYCHRONIC Battle Engine during this diagnosis; do not silently re-enable it). All native writes used disposable projects. `git diff --check` passes with existing CRLF notices only. No commit, push or publication.

## 2026-09-06 — Room background loading, responsive Troops and prop orientation

- Runtime **20260906.8** establishes room mode before the original Scene_Battle.create call. Late-installed ImageManager battleback wrappers return a shared valid transparent 1×1 bitmap for room creation and later room requests, preserving plugin sprite interfaces without opening unused background files. Ordinary battleback loaders still delegate unchanged. The creation flag is restored in a finally block.
- Troops constrains its flex workspace to the available detail height. Its upper pane takes at most 52%/560px; the sidebar and event command list scroll independently. ResizeObserver fits and centers the canvas at its original aspect ratio, preserving canvas coordinate mapping for conventional enemy placement. Observers disconnect on detail teardown. Native checks report zero outer detail overflow and visible Battle Events at 2560×1440, 1920×1080 and 1280×720.
- The room had passed raw prop rotations to the battler preview pose path, interpreting authored degrees as radians and dropping the map direction. Props now normalize their map model spec and use the same directional pose convention as MapEditor3D.poseProp; authored scale is applied once instead of again as a sequence scale. Battler facing and action keys retain their existing path. No map data was rewritten.
- Validation: full suite **2,827 passed, zero failed**, `/tmp/rr-room-props-full.log`; 19 focused battle tests pass, `/tmp/rr-room-props-focused.log`. Native `/tmp/rr-room-props-native.log` compares all 11 actual room props against MapEditor3D.poseProp (matching scale and quaternion within floating-point tolerance), checks the same rotations in-game, and deliberately supplies nonexistent battleback names while asserting zero disk-image requests. Existing camera navigation, cursor dragging, save/reopen, battle repeats, local events, exploration return, mixed 2D/3D room and GPU/asset checks remain green. Inspected `/tmp/rr-battle-room-runtime.png`; responsive-layout screenshot is `/tmp/rr-troop-layout-720.png`.
- Three changed runtime files (main, battle presentation, battle room) match all 13 local sample copies. `git diff --check` passes with existing CRLF notices only. Native tests use disposable copies; owner-authored project data and plugin manifests are preserved. Existing room lighting/plugin coverage limits remain documented in the authoring guide. No commit, push or publication.

## 2026-09-06 — Free camera setup and live Troops room preview

- Owner requested map-style camera controls in Battle Room overrides, removal of the unused area below the 480px preview, and a live selected-room preview in Troops. Room setup now uses a bounded flex/grid dialog with a full-height stage, independently scrolling inspector and fixed footer. Native measurement at a 1000px window is an 835px stage in a 940px dialog, with an 8px footer gap. The canvas/renderer resize to the actual stage dimensions.
- `BattlePresentationEditor.cameraNavigation` adapts the existing MapEditor3D orbit/pan/zoom/timed-flight methods. Empty left-drag or Ctrl-drag orbits, Shift/right/middle-drag pans, wheel zooms, and the focused canvas accepts WASD/arrows/Q/E with Shift acceleration. Pointer movement while flying turns the camera. Keys stop on canvas/window blur, cleanup removes the window listener, and marker drags keep their separate stationary-camera behavior. Manual navigation captures the current camera pose as a fixed/free camera, clears follow easing, and synchronizes inspector fields. Selecting a follow preset restores follow behavior. Inherited map cameras ignore these gestures. Formation defaults are materialized into the modal draft so panning its camera cannot shift unplaced actor slots.
- Shared `loadRoomCast`/`drawRoomCast` methods serve setup and Troops. `previewTroop` builds a battle-owned view from the selected map, uses saved camera/formation data, animates models and attached effects, respects initially hidden members and supports the existing Show Battle UI overlay. Room mode bypasses the generic battleback loader/draw/drag path, hides its battleback controls and uses the available preview width. Apply, map/type changes and member changes refresh the view. The hidden embedded renderer pauses while setup is open. Project/DOM/lifetime guards dispose stale asynchronous results; changing sections or returning to Battleback stops rendering and releases the room.
- Validation: **2,825 passed, zero failed**, `/tmp/rr-room-navigation-full-final.log`. Expanded native smoke `/tmp/rr-room-navigation-native-final.log` passes initial live room rendering (13 meshes/15 model records in this fixture), marker drag stability, the full-height layout, actual pointer orbit/pan, wheel zoom, keyboard flight, camera-field synchronization, Apply refreshing the embedded camera, preservation of all untouched formation slots, disabled gestures under map inheritance, Cancel preserving the saved setup, and room-to-battleback teardown/re-entry. Existing runtime/repeats/events/return/2D-room checks still pass without missing assets or GPU errors. Inspected `/tmp/rr-battle-room-editor.png` and `/tmp/rr-troop-live-room.png`. `git diff --check` passes.
- Runtime remains **20260906.7**; this pass changes editor authoring and previews only. The live preview shows initial placement/model playback, not execution of room event pages. Existing room renderer limitations in the authoring guide remain. Original project/map/model data was preserved; smoke tests only saved disposable copies. No commit, push or publication.

## 2026-09-06 — Sharp enemy previews, party capacity and third-person setup dragging

- Runtime **20260906.7**. Enemy detail was enlarging a 64px shared thumbnail to 200px. The shared thumbnail renderer now produces 512px images, with cache version 3 replacing old low-resolution images and smooth CSS downsampling for models. Enemy list icons resolve the active 3D binding before attempting a legacy filename and use the cached model image. Binding changes refresh the list icon; asynchronous model responses check project and request ownership.
- System 1 / Starting Party exposes **Max Battle Members**, accepting 1–99 and storing the optional `System.json.maxBattleMembers`. Opening an old project does not write/migrate a value. A shared resolver reads known enabled PSYCHRONIC Party System, MOG Battle HUD and YEP Party System manifest defaults in order, otherwise four; Demo correctly displays seven immediately. **Use Existing Limit** deletes the override. Battle Room setup captures this effective count instead of `max(4, startingParty.length)`; empty starting-party positions still have markers. Native runtime overrides apply after plugins, while existing projects retain their original method and scripted `setMaxBattleMembers` changes retain save-game lifetime. HUD layout is still authored separately; arbitrary dynamic plugin limits cannot be inferred for editor previews.
- Owner clarified the jumpiness occurs while dragging a marker in third-person room setup. Following the dragged leader changes the cursor's ground ray each frame, causing feedback. Setup now freezes the effective camera during pointer capture, releases on up/cancel/lost capture, and eases back to third-person framing without changing ordinary runtime follow behavior. Initial third-person focus also uses the actual default party slot rather than the room center while models load.
- Validation: **2,825 passed, zero failed**, `/tmp/rr-party-preview-full-final.log`. Native `/tmp/rr-party-preview-native-final.log` verifies actual 512px preview at 200px display height plus list icon (inspected `/tmp/rr-enemy-sharp.png`), seven setup slots, System save/reopen, runtime capacity 7 → 5 → 7 despite the installed plugin, and an actual WebDriver mouse drag whose projected leader marker stays within the 0.1-tile snapping tolerance of the cursor. Existing battle sequence, camera, local event, exploration return, 2D room and no-missing-assets/no-GPU-errors checks remain green. Three new focused tests cover party defaults/overrides/save lifetime and drag freeze/easing. New controls and hints are translated into all 17 non-English editor locales.
- Four changed runtime files match all 13 sample copies; editor BattleData matches the canonical module. `git diff --check` passes. Original authored data, plugin manifests and model files were preserved; all native writes were confined to disposable copies. No commit or publication.

## 2026-09-06 — First Battle Rooms and visual Action Sequences implementation

- Runtime **20260906.6** adds `reactor_battle_data.js`, `reactor_battle_room.js`, `reactor_battle_events.js` and `reactor_battle_presentation.js`, loaded before plugins and installed afterward. All four modules and reactor_main.js match across the 13 local sample projects. Editor BattleData.js is byte-identical to the shared data module. Build whitelists include the new runtime modules. Project plugin manifests and authored map assets were preserved.
- Creator flow: Troops selects Battleback/Battle Room and a map, with exact formation/facing and map-camera inheritance or troop override. Action Sequences is a separate database list; assignments exist on skills/items, weapon attacks and actor/enemy defaults. Default preview formations face their opponent; model facing is degrees at the data boundary and radians at rendering. Assignment cards now sit inside each record's layout, with separate controls and an unobscured heading.
- Builder: five templates, live actor/enemy casting, mirrored/multiple-target preview, ordered steps/timeline, frame scrub/play, undo/redo, XYZ/rotation/scale keys, motions, audio, animations, weapon icons, colored projectiles, impact and waits. Exactly one impact cue preserves the original target occurrence list and skill repeats through the original resolver. Explicit existing behavior wins over fallback assignments. No automatic note migration or independent overlapping tracks yet.
- Room renderer uses explicit map data and battle-owned models, billboards, light uniforms, Effekseer targets and interpreters. It preserves exploration map identity/player coordinates and clears room interpreter context on teardown. Troop/common-event room context supports visual movement, waits, local self switches and supported event commands; unsupported map-changing operations warn/skip.
- Two regressions found during live testing are fixed: the late 3D bitmap adapter calls the captured canonical model hook, preserving the bitmap needed by enemy state icons; subpixel loading frames wait before canvas texture allocation, preventing 0×0 textures and repeated WebGL/mipmap errors. The PSYCHRONIC ATB adapter uses the live 3D enemy image instead of a stale Goblin/Actor1 path. Test projects link actual movies/assets; movement-only test events have no copied obsolete graphic. No substitute art was added to satisfy the test.
- Storage: optional ActionSequences.json/BattlePresentation.json with version validation, database dirty/save/cancel integration, a recoverable paired write, reference protection and same-project clipboard bindings. Missing sidecars retain old behavior; unsupported/newer schemas are not overwritten.
- Verification: **2,822 passed, zero failed**, `/tmp/rr-battle-full-final.log`. Native `editor/tests/smoke/nw-battle-presentation.cjs` passes with `/tmp/rr-battle-native-final.log`: editor save/reopen, assignment gap 8px/equal heights/no overlap, isometric and third-person camera inheritance, camera command override, 13 reactor-room meshes/14 model records, two original resolver calls for two repeats, local route/wait/self-switch behavior, original map/player return and zero retained room models/effects/interpreters. A separate 2D room has six map meshes, an actual 144px character frame and the 3D enemy. Browser logs and GPU upload probes reject missing assets, TypeErrors and WebGL errors; the final run has none. Fourteen focused tests cover data/playback/compatibility/loading-frame contracts. Syntax, runtime-copy checks and `git diff --check` pass.
- Inspected native screenshots: `/tmp/rr-sequence-editor.png`, `/tmp/rr-enemy-sequence-assignment.png`, `/tmp/rr-battle-room-editor.png`, `/tmp/rr-battle-room-runtime.png`. Fixtures are disposable Demo copies and do not save changes to the owner's battle map or assignments.
- Limits: room dynamic shadows, video surfaces, plugin fog/overlays, map-dependent plugin commands and performance profiling remain. VE/YEP/VisuStella/LeTBS choreography falls back with a diagnostic pending adapters. Scene_Battle retention and the tested Demo stack do not prove every MOG configuration or every counter/reflection/substitution/exit combination. See [the authoring guide](BATTLE-PRESENTATION.md) for the shipped scope and [the original design](DESIGN-BATTLE-ROOMS-AND-ACTION-SEQUENCES.md) for remaining acceptance gates. No commit, push or publication was performed.

## 2026-09-06 — Battle design and 3D enemy foundation fixes

- New proposal: [Battle Rooms and Action Sequences](DESIGN-BATTLE-ROOMS-AND-ACTION-SEQUENCES.md). Keep Scene_Battle/BattleManager and legacy default behavior; define room ownership and plugin adapters before the timeline UI. First-release assumption is normal battle targeting in a map arena, pending owner direction on tactical movement. The owner prepared Demo map 004, Reactor Room - Battle Map; preserve it and use disposable copies for tests.
- Enemy General uses the existing 3D toggle as an exclusive active-graphic choice. Image/hue controls hide and disable under 3D; switching off restores 2D and its stored filename. Model changes refresh the shared preview, with request/project ownership checks. The shared thumbnail renderer accepts a caller lifetime outside the 3D tab, fixing cold renders on other database tabs too. Troop previews cache model images by enemy ID and retain placement/hit bounds. Parameter steppers use one fixed width, with room for 15 digits.
- Runtime **20260906.5** removes misplaced flat-map registry/playback code referencing undefined `character` in updateEnemyModelSprite. Restores the whole model frame after plugins crop it as a character sheet, while keeping the boss-collapse crop. Canonical reactor_3d.js/reactor_main.js synchronized to all 13 sample projects; plugin manifests and authored data untouched.
- Validation: full **2,808 passed, zero failures**, `/tmp/rr-battle-foundation-full-final.log`; native `editor/tests/smoke/nw-enemy-model.cjs` passes exclusive controls and switching, equal stable fields, actual enemy/troop previews and 102 live battle frames with 6,563 visible target pixels and a complete 192×192 frame. No uncaught errors. Native log `/tmp/rr-enemy-model-native-final.log`; inspected screenshots `/tmp/rr-enemy-preview.png`, `/tmp/rr-troop-model-preview.png`, `/tmp/rr-enemy-battle.png`. Native fixtures copy data/runtime and preserve original Demo files.
- Limits: editor previews are cached still thumbnails, not a live action-sequence or exact battle-camera preview. This session verifies the existing Demo battle stack, not future Battle Room compatibility for every Star Shift plugin. No new room/sequence runtime or automatic note migration ships in this change.


## 2026-09-06 — Effekseer occlusion in the 2D model preview

Reproduced on the actual reactor: both Core animations were DOM canvases above
the map (`world=false`, `gpu=false`), drawing across the rear housing and upper
lip. `ModelPropEffects2D` now puts Effekseer previews in world mode before
playback and composites their shared-GPU textures on the same depth-tested,
anchor-standing quads used by the 3D view. Those quads render inside the prop's
retained target with its geometry. `ModelPropsPreview2D.paint` prepares them at
the final target size before rendering. The existing effect pixel budget is
retained; other authored effect settings are unchanged.

The rear effect is hidden by the reactor, while the exposed front effect ends
beneath the upper housing. MV sprite-sheet overlays and video behavior are
unchanged. This uses the existing 3D anchor-plane depth approximation; it does
not introduce per-particle depth for the effect texture. The canvas fallback
also composites through the depth-tested quad. Offscreen/suspended previews
hide effects and stop playback; disposal removes quads, layers and GPU targets.

Validation: **21 focused checks passed**; full Node suite **2,807 passed, zero
failures**. Native fixed-frame comparison on the actual reactor counted
**8,892 blocked pixels** and **7,884 visible effect pixels**, with successful
suspend/dispose cleanup. Before and after screenshots were visually inspected.
Reproduce: `node editor/tests/smoke/nw-flat-model-effects.cjs`.
Logs: `/tmp/rr-flat-effects-final.log`, `/tmp/rr-flat-effects-focused.log`,
`/tmp/rr-flat-effects-full.log`. Screenshots:
`/tmp/rr-reactor-effect-before.png`, `/tmp/rr-reactor-effect-after.png`.
No authored project data or runtime files changed in this pass.


## 2026-09-06 — Surface lighting in the editor's 2D map preview

Runtime **20260906.4** allows `packLightUniforms` to populate private uniform
sets while preserving its existing shared-state callers. Retained 2D props
previously forced their light count to zero and received only the manager's
ambient tint. Floor glows could therefore look correct while the reactor
stayed dark.

Each prop now samples the same point/spot/beam surface-light shader as the 3D
view. World light positions (including carried-light anchors) are translated
into its local render space, with height and editor/runtime yaw accounted for.
Nearby lights are selected conservatively against model extent, independently
of whether they reach the floor. Ambient is applied in the material once;
selection tint remains on the sprite. Changed illumination invalidates static
textures; unchanged fields and hidden models retain their targets. Light
collection precedes painting so carried lights reach other props in the frame.

This fixes the editor's placed-model preview. Existing projected floor shadows
remain; model self-shadowing/occlusion is not added by this pass. The game's
separate flat sprite lighting path is unchanged. No authored lights, model
assets or Demo event data were edited.

Native actual-reactor check: 228,563 pixels brightened under an elevated test
light with no floor footprint; alpha unchanged, light-off pixels restored
exactly, and mutation of shared preview uniforms left model pixels unchanged.
A reference render with the object/camera translated into map world space
matched within mean absolute channel error **0.000000113 / 255**. The test uses
an isolated profile and disposable Demo copy. Reproduce with
`node editor/tests/smoke/nw-flat-model-lighting.cjs`.
Final full Node suite: **2,805 passed, zero failures**
(`/tmp/rr-flat-full-final.log`). Source syntax and whitespace checks pass;
all 13 local template projects match the canonical runtime.
Log: `/tmp/rr-flat-native-final.log`; isolated model images:
`/tmp/rr-flat-reactor-dark.png` and `/tmp/rr-flat-reactor-lit.png`.


## 2026-09-06 — Full suite green; PR #46 already included

Reproduced and resolved all six outstanding checks. Stock-interface tests own
their System fixture and exercise database seeding/authored-layout preservation;
Delete behavior retains direct shortcut tests; two valid identical translations
are allowlisted. Synced 144 runtime files across the local template corpus,
with previous copies backed up and every plugin manifest preserved.
Final full suite: **2,804 passed, zero failures**; focused suite **50/50**.
Log: `/tmp/rr-six-full-final.log`.

PR #46's `fefa9a6` is patch-identical to the `5961354` commit included through
#48. A merge simulation finds only a changelog conflict and no additional code.
Recommend closing it as already included; no remote state was changed.
See [integration report](PR-INTEGRATION-2026-09-06.md) for evidence and backups.


## 2026-09-06 — Voice-only commands and approved PR integration

Runtime **20260906.3** removes speaker/text editing and message-window coupling
from Speak 3D Dialogue. Use a non-waiting voice command followed by Show Text
for simultaneous playback and messages. Legacy text arguments are ignored;
authored event JSON is not automatically rewritten. Audio levels stay in the
picker and lip animation is unchanged.

Merge `b38ee87` integrates `origin/main` at `853734b`: approved PRs #47 and #48,
including #46's passive-state implementation already present in that history.
The script-list conflict retains both local quest tools and incoming TraitHelp.
All existing working edits were restored; authored Demo data/assets are intact.
Details, checks and local recovery snapshots:
[September 6 integration](PR-INTEGRATION-2026-09-06.md).


## 2026-09-06 — Speech authoring, lip seam and mouth interior

Runtime **20260906.2**. Speak 3D Dialogue now uses themed modal/control styles;
volume, pitch and pan live in the audio picker and survive command reopen.
Face points use smaller lip dots and labels. Mouth/lip cards add an optional
colored dark cavity and a Preview mouth slider using the shared runtime.
Changing points or leaving the preview restores/disposes its generated geometry.

The actual mascot selected zero lip vertices because `bindModelLandmarks`
captured `SkinnedMesh.bindMatrixInverse` before its first render refresh.
Running the skinned `updateMatrixWorld` path before capture fixes that scale
mismatch. The former procedural morph also stretched triangles across the
mouth. With all three mouth/lip points the new fallback splits that seam,
preserves/interpolates attributes and skin weights, and adds an inset lining.
The source GLB and authored landmarks were not changed. The current mascot
mouth point opens low; use the live preview to refine it onto the closed lip
line. Authored mouth morphs/jaw rigs keep precedence; human teeth/tongues remain
asset work. Usage and limits: [face points and speech](3D-FACE-AND-SPEECH.md).

Validation: **205 passed / 2 failed** in the broader 207-check selection. The
remaining tests concern existing German/French lighting loanwords and ignored
local corpus runtime drift. Canonical changed runtime files match tracked Demo.
Native editor checks pass across 14 themes, picker roundtrip/Cancel, smaller
markers, live mouth preview/reset and saved interior settings. A real game
fixture using the actual mascot passes decoded/pitched audio, voiced/silent
intervals, completion/reset and interpreter waits. Fixtures use disposable
project copies. Reproduce with `editor/tests/smoke/nw-speech-3d.cjs` and
`editor/tests/smoke/nw-speech-runtime.cjs`; logs are `/tmp/rr-speech-editor.log`,
`/tmp/rr-speech-runtime.log` and `/tmp/rr-speech-broad.log`.


## 2026-09-05 — Shared effects and exact frame reuse

Runtime **20260905.5** is installed in source and tracked Demo. Attached effects use the owning GPU with original AA/sRGB behavior in game and editor previews. Map/viewport cleanup releases owned effects. Sparse light cells, validated media records, effect scissors and guarded neutral scene filters remove more work. The misplaced-animation duplicate draw remains fixed.

Final normal-backend 1080p samples at player [24,15]: **55.42 / 54.82 FPS**. Sustained 60 FPS remains unachieved. 180 focused checks pass; 185/186 in the broader selection, with the pre-existing Windows thumbnail-cache failure. Pixel, lifecycle, comparison methods and rejected experiments are in [PERFORMANCE.md](PERFORMANCE.md). Preserve unrelated author edits; no commit was made.

## 2026-09-05 — Invisible work and attached-effect ownership

Runtime **20260905.3** is in source and tracked Demo. The reported misplaced
flashes were duplicate 2D draws of hidden 3D-owned animation handles (730 in
12 seconds before the fix; zero afterward). New guards cover enqueue,
queued ownership changes and direct drawing. Shared renderer savings and
exactness tests are detailed in [PERFORMANCE.md](PERFORMANCE.md).

Controlled 1080p live samples: 41.5/45.4 FPS with new switches off and
44.8/45.8 on, with the animation fix active in both. 60 FPS is not reached.
Earlier free-camera numbers were affected by movement; do not present them
as controlled gains. Direct effect-image transfer and finer grids were
rejected. No backend flags, reduced quality settings or new encoder library
were retained. Preserve existing unrelated author edits.

## 2026-09-05 — Worker and cell-light performance pass

Runtime **20260905.2** is in the source runtime and tracked Demo. Map/model
editor views share the new drawing path and load workers through cached Blob
URLs. Cell masks retain exact light contributions; dense rigid models use
worker-generated index levels with estimated 0.35-pixel error and full geometry
for shadows, collision and close views. Runtime effect coverage uses a second
worker. Original assets and quality settings are retained.

Final same-process live comparisons: 25–28 FPS off, 40–41 FPS on. **60 FPS is
not achieved.** Frozen GPU savings vary by pose (31.1–46.3%); lighting-only
pixels match exactly, geometry has small differences needing wider content QA.
259 focused tests and 240 shadow frames pass. Full Windows suite: 2709
passed, 27 failed, 1 skipped; unrelated/platform/corpus failures remain.
All test NW.js windows and drivers are closed. No commit or author-project
autosave was made. See [PERFORMANCE.md](PERFORMANCE.md) for evidence, new
benchmark setup, quality caveats and the remaining live transfer/update costs.

## 2026-09-05 — Laptop performance pass

Runtime revision **20260905.1** adds a light-range rejection before fragment
distance calculations, shares beam model bounds within one light update, and
avoids the second ancestor walk for attachment rotations. Resolution, assets,
light falloff and shadow quality are retained. The tracked Demo is synchronized.

On the Ryzen 5 PRO 5650U integrated Radeon laptop at 1920×1080, the averages
of frozen GPU batch medians fell 13.2% and 5.4% across two A/B/A/B runs, with
identical pixels. Live samples varied around 19–23 FPS and do not establish
a stable FPS gain. See [PERFORMANCE.md](PERFORMANCE.md) for all measurements
and limits. 121 focused tests and the 240-frame animated-shadow probe pass.
The full suite was not rerun. The profile still shows expensive effect readbacks
and texture uploads. No asset reductions or commits were made.

## 2026-09-04 — Session closeout

[SESSION-2026-09-04.md](SESSION-2026-09-04.md) consolidates the day's work and
links the feature/performance/audit reports. The closeout includes current Demo
content and the new Graviton Pistol asset; the authored 1920×1080 settings and
three resulting title-layout test failures remain documented. Validation is
recorded by scope, with runtime still .17 and development version 0.98.5.

## 2026-09-04 — Database state and sequence audit

See [DATABASE_STATE_AUDIT.md](DATABASE_STATE_AUDIT.md) and its checked-in results.
405 live sequence checks pass with zero uncaught errors; 14 focused unit tests
cover delayed work and project/session boundaries. Latest full suite: 2,643
passed, the same three authored Demo title-layout failures (2,646 total).

Database detail cleanup now runs on every departure, including list resets,
Cancel, and project changes. Saves freeze controls and reject stale completion;
modals, row/command callbacks, and preview image loads reject obsolete contexts.
3D and tileset caches separate projects. Effekseer needed an update-entry guard:
its texture callbacks can run after releaseContext, before the onLoad guard.
Five placeholder trait Select All actions were removed. Model sidecar writes
still save immediately and are outside Database Cancel. Runtime stays .17.

Final evidence: `/tmp/rr-database-sequences-UPOAz7`, authoring repeat
`/tmp/rr-command-database-audit-Hc0Duj`, full suite
`/tmp/rr-db-state-audit-full.log`. Smoke projects/profiles are disposable; the
original Demo content and live project lock were preserved.

## 2026-09-04 — Event/database, language, and theme audit

See [EDITOR_AUDIT.md](EDITOR_AUDIT.md) and the checked-in coverage matrix for
scope, fixes, reproduction, and limits. All 123 picker items have valid sample
creation/reopening coverage (111 dialog roundtrips, 12 inserts), with 19 database
sections and 56 nested save/cancel cases. All 14 themes were sampled; the shared
context menu has 32 palette/locale cases. Added 1,496 translations and fixed
literal interpolation; the strengthened inventory finds zero gaps in 3,989
phrases. Native fluency and exhaustive runtime parameter combinations are not
certified by this pass.

Database and model write failures now show feedback and preserve drafts;
optimization rejects corrupt settings; corrupt binding files no longer blank
panels. Theme fixes include nested fields, warnings/errors, hover and selected
states. Model sidecar saves are still immediate. The Demo's missing SV actor
asset is diagnosed visibly and left untouched.

Final full suite: 2,628 passed, three existing Demo title-layout failures
(`/tmp/rr-command-database-full-final.log`). Theme matrix artifacts:
`/tmp/rr-command-database-audit-Ymwh4r`; menu/locale results:
`/tmp/rr-command-database-audit-tZoWSX` (also the clean nested screenshots).
The final 3D navigation-title correction passes all 22 localization tests and
adds one case beyond the full-suite count above. The repeatable smoke cleans its disposable
project and profile, retaining JSON and screenshots. Runtime stays .17.


Start with [Current project status](STATUS.md) for the verified version, rendering
defaults, test results, and open work as of 2026-09-04. This handoff is a dated
engineering journal: later entries supersede earlier implementations and
measurements. Scratchpad harnesses and ignored corpus projects named here are
local development aids, not files guaranteed to exist in a clean checkout.

## 2026-09-04 — Ground light alignment and flat preview profiling

`LightingManager` r14 replaces screen-space cone stamps with `FlatLightField2D`
footprints and a high-precision ground-light shader. Height, pitch, yaw, anchor
coordinates, range and cone/beam falloff now follow the 3D light field. Floor
lights share one layer below props; overlaps no longer depend on emitter sort
order. Flat additive brightness and ambient-tinted model sprites remain an
approximation; this does not add 3D walls/self-shadowing or event-model casters.
The runtime remains revision .17: these changes are to the editor preview.

Model targets follow display zoom/resolution with sampling headroom and MSAA;
60 Hz pose/media updates avoid redundant high-refresh work. Model material
uniforms are isolated from other previews. Shadow passes crop to the lit area,
cull using projected bounds, skip empty pools, and retain/grow mask targets.
The longer motion probe caught a bound-texture replacement error, now covered
by a regression. Original-space frustum culling is disabled only during the
shadow projection pass and restored afterward.

`editor/tests/perf/nw-flat-preview.cjs` now provides a repeatable disposable-Demo
GPU comparison and animated profile. Twenty-four actual 2D/3D light fields
match within one 8-bit level on NVIDIA and AMD integrated graphics. The probe
also checks shadow projection from outside the footprint, isolated model
lighting and resolution after zoom/pan. See [PERFORMANCE.md](PERFORMANCE.md)
for measured costs and scope. NVIDIA artifacts: `/tmp/rr-db-switch-E4tHCr`
(images retained; disposable project/profile removed). Final logs:
`/tmp/rr-flat-final3-nvidia.log`, `/tmp/rr-flat-final3-amd.log`. AMD images
are in `/tmp/rr-db-switch-dzXU4T`; final lifecycle smoke artifacts are in
`/tmp/rr-db-switch-1Y78dy`. Full suite: 2,595 passed, three existing Demo
title-layout expectation failures. The two intermediate packaging failures
were caused by exhausted test temp space and passed after cleanup.

## 2026-09-04 — Flat preview gradients, attached media and prop shadows

`LightingManager` r13 uses cached 1024-pixel, linearly filtered falloff textures
with stable sub-level dithering and continuous beam shoulders. Pixel-art
filtering for tiles/models is unchanged. The prop preview now includes authored
Always/chosen database animations and video/image effects. Videos use depth-tested
planes in the existing model target; database animations use the existing
`AnimationPreviewLayer` at the projected anchor. Viewport visibility and 3D mode
pause playback; deletion, project close and map changes dispose it. Video
readiness reads decoded dimensions, and only new video/pose frames request draws,
capped at 60 model draws per second.

Shadow-enabled native/carried lights project posed prop geometry onto the ground
using a cached GPU mask per light. Masks are at most 512 pixels on the long side,
linearly filtered; moving geometry refreshes at most 30 times per second. Static
poses, unchanged lights and flicker intensity/radius jitter reuse masks. A small
light shader samples the mask to attenuate only its own additive contribution,
so ambient and overlapping lights are preserved. Disabling a shadow releases its
mask. This is a flat ground projection from placed props; it does not reproduce
3D wall receivers or self-shadowing and does not add event-model casters.

NW.js on a disposable Demo verified 11 advancing screen videos, nonempty pixels
from both video planes and the reactor's database animation, 13 populated shadow
maps, mode/map switching and project-close cleanup. A pixel probe verifies a
masked red light leaves ambient unchanged while an overlapping green light still
illuminates the same pixel. Runtime revision stays `20260904.17`; this pass fixes
the editor's 2D preview. Local harness: `scratchpad/editor-flat-preview-check.cjs`.
Final NW.js artifact: `/tmp/rr-db-switch-rnPekU/switch.png`; full suite: 2,590
passed, with the same 3 existing Demo title-layout failures.

## 2026-09-04 — Live props and lighting in the 2D map editor

The flat map editor used still prop thumbnails and only ran lighting while its
tool was open. `ModelPropsPreview2D` now retains placed model instances and
shares the editor's PIXI WebGL2 context, sampling multisampled Three targets
without canvas readback/uploads. It reuses the 3D editor's animation driver,
including placement sequences, repeat and speed. Always/selected light effects
follow their animated anchors; native and model lights use the runtime's flat
ambient tint, translucent glow and tapered spotlight texture. Closing the
lighting tool removes its handles, leaving the scene preview running.

Unchanged poses and offscreen props reuse their textures; cached rigid/bone
bounds expand only when needed. Switching to 3D pauses flat rendering. Map
changes release textures, targets, instance materials and generated rig geometry;
late loads cannot attach to a replaced map. Database preview-cache invalidation
also reloads live props, and template/thumbnail cache keys include project paths.
This initial change targeted placed props and light effects; the later media
entry above adds non-light effects. Event-page model thumbnails remain separate.

The light-order follow-up interleaves each prop's carried glows immediately
behind its sprite, so its silhouette and nearer props cover the light. Ambient
now sits below the prop layer and applies to model sprite tints by the same
factor; this keeps model/floor brightness stable and avoids dimming the glow.
This is the editor's flat sprite depth order, not per-pixel 3D shadow casting.
The NW.js pixel probe verified an opaque emitter stayed `[68,68,68]` with the
light on/off, while adjacent floor changed from `[137,137,137]` to
`[157,137,137]`. It uses retained containers with no extra GPU render passes.

NW.js checks on a disposable Demo verified live motion, 11 carried lights,
nonempty GPU textures, selection retention, tool close, 2D → 3D → 2D, and map
switch/reopen cleanup with no captured browser errors. Local harness:
`scratchpad/editor-flat-preview-check.cjs`; final screenshot:
`/tmp/rr-db-switch-GFgXmS/switch.png`. Project close also releases the renderer
and unregisters its ticker. The final full suite after the light-order correction
passed 2,587 tests, with the same 3 Demo title-layout failures.
No Demo authoring files were changed by the checks. Runtime revision remains `20260904.17`; these changes are editor-side.

## 2026-09-04 — Face points, speech, prop playback and the flat renderer

Runtime revision `20260904.17`. [Usage/schema/limits](3D-FACE-AND-SPEECH.md)
cover the new Face points tool, Speak 3D Dialogue command and per-prop speed.
The first-person camera follows authored eyes or fitted model height, with
player/follower models visible. Actual skin skeleton bones take precedence over
same-named exported nodes. Generated lip morphs account for skinned bind space;
waveforms are reduced to a cached 60 Hz RMS envelope outside the frame loop.
The dedicated `reactor_speech_3d.js` is in the runtime manifest and all build
preflight lists. Waveform animation is amplitude-based, not phoneme recognition.

The menu bug was holder-owned playback being discarded when Scene_Map rebuilt
its spriteset. A weak character-keyed snapshot now preserves action phase,
sequence/rules and timed/toggled light state across reconstruction. Both map
renderers use the same action clock. Speed overrides scale that clock without
restarting the current action; default placement speed is 100%.

Flat fallback sprites could remain hidden by 3D tile-event claims, model light
effects were missing from flat light collection, and the duplicate animation
driver ignored repeat.
The flat ambient overlay also multiplied display pixels by linear brightness.
These paths now share the appropriate runtime state. The 3D cone texture
expected trapezoid geometry; stretching it onto a flat rectangle created broad
opaque-looking washes. The flat texture now supplies the taper, and body
opacity follows the volume renderer's reduced strengths.

Flat model rendering now adopts a GPU target like battlers, resetting GL state
around target allocation as well as drawing. The compatibility canvas path
remains. Flat target resolution is retained with up to four MSAA samples;
offscreen/catch-up draws are skipped without stopping simulation.

Follow-up: flat render frames originally enclosed only the rest pose. Cached
rigid-part boxes and per-bone bind-space boxes now track animated extents with
matrix transforms; vertices are scanned only during cache construction.
The render area grows with reserve space, preserving the ground anchor and
pixel density up to GPU/4096 texture limits. Culling includes centered anchors
and lift. Depth uses ground Y plus height toward the pitched camera, not the
lifted image's screen Y. The sorting wrapper retains this within equal-priority
layers even when `PSYCHRONIC_MZRX-FogAndOverlay` replaces the comparator.

The lift path now distinguishes synthetic model props from the older tile-event
`isEventProp` registry, which exists only for tile props built into a 3D scene.
Runtime prop normalization retains complete animation/effect lists and the
placement speed, rather than silently reducing them to legacy singular fields.

Verification used disposable Demo copies, leaving the user's model/map/settings
and active project lock intact. NW.js checked Face points save/reopen, authored
eye position, visible first-person body/followers, voice/silence/stop/waits,
and repeated prop cycles plus stop/menu/return in both map modes. The reviewed
flat screenshot retains floor detail beneath soft colored lights. Current full
suite results are maintained in STATUS.md; performance measurements and their
limits are in PERFORMANCE.md.

## 2026-09-04 — Empty-space menus and spotlight flicker in editor previews

The model record menu listener covered only the list elements, missing effect
form/footer whitespace. The right column now delegates by animation/effect
section, including headers and blank padding, while native text/select controls
retain their menus. The effects list has a 64px minimum height so an empty model
has a real paste target. Blank-space menus enable Paste without selecting a row.

Both `Database3DEditor._updateLightPreview` and
`MapEditor3D.updateEffectPlays` resolved carried lights at their anchors without
applying `Reactor3D.animateLight`. Both previews now use that shared flicker/pulse
routine and their preview clocks for point, spot and beam lights. Map previews
also carry its pre-flicker priority fields, preserving stable shadow assignment.
The game already animated these lights; runtime remains `20260904.16`.

Five behavioral regressions cover menu routing, all three preview light kinds,
steady zero-flicker lights, pulse, and map lights without model animations.
NW.js on a disposable Demo copy passed a real pointer right-click in the footer,
Paste, header and empty-list menus. Thirty live spotlight samples varied body
strength from about 0.15 to 0.29 and packed surface-light red from 0.51 to 0.97;
setting flicker to zero stayed steady. The test copy's inherited project lock
was removed before launch; the user's active project lock was untouched.

Latest full suite: 2,560 passing, three failures in `stock-interfaces.test.cjs`.
The working Demo's authored resolution changed during the session from 1280×720
to 1920×1080; those tests assume the old title layout and matching generated
interface records. The user's Demo settings were retained. Before that content
change, the database-only fixes passed all 2,562 tests; the subsequent map-light
regression and focused suites also pass. See STATUS.md for current validation.

## 2026-09-04 — Copy/paste model animations and effects; Dropbox conflict recovery

The right-hand saved-animation and effect lists now accept Ctrl/Cmd+C/V and
right-click Edit, Copy, Paste, Duplicate and Delete. Lists retain keyboard
focus through row redraws; text fields retain native clipboard behavior.
Typed `model3dRecord` clipboard payloads snapshot working edits, persist through
model changes and create unique names. Referenced named effects travel with an
animation, reusing identical definitions and remapping name conflicts only in
the pasted rule. Pasted entries save through the existing sidecar path and open
for editing. Baked clips/parts/assets remain references, not copied geometry.
Async paste cannot follow a model change or a closed panel. Deleting an edited
animation also now captures its index before deselection clears it.

Verified in NW.js: effect shortcuts, context-menu Duplicate, cross-model paste
and its saved sidecar, and animation shortcuts. Seven behavioral clipboard/menu
regressions added. Full suite: 2,558 passing in both the isolated verification
copy and the restored shared workspace. Runtime remains `20260904.16`.

Dropbox replaced newer session files with older committed versions and created
conflicted copies during verification. Both versions were backed up outside
Dropbox under `/home/doug/.local/share/rpg-reactor-recovery/20260904-150237`.
Verified newer code/docs were recovered, incoming Demo content retained, and
all conflict copies (including ignored corpus runtimes, save copies, a Git
index copy and logs) archived out of the project. All 13 template runtimes
match canonical runtime again. The active Git index and canonical saves were
not replaced by their conflict copies.

## 2026-09-04 — Database model previews no longer carry effects across selections

Owner reported old animations/effects appearing on the next model at the wrong
position. Reproduced in NW.js: Monitor Arm → Computer-01 changed the displayed
effect definition to Animated Screen but kept the old Static Video media. Both
were automatic effect index 0, so the playback check treated them as the same
effect. A manually selected video also followed the selection onto the mascot.

`Database3DEditor` now clears model-owned playback immediately on selection:
media, lights, animation layers/actions, sound, flashes, trigger indices and
anchor/edit state. The old object/binding are detached during loading while the
renderer remains reusable. Selection generations guard both preview and embedded
clip continuations, including A → B → A; stale requests cannot clear the latest
loading indicator, and disposal invalidates pending work.

Verified in the live editor with a disposable Demo copy: normal switching,
manual media → mascot, and rapid mascot → computer → arm now select the right
media/template/clips. Four behavioral Node regressions cover immediate cleanup,
out-of-order completions, the loading indicator and close-during-load. Full suite:
2,551 passing. This is an editor change; runtime revision remains `20260904.16`.

## 2026-09-04 — Overlapping lights: stable shadow ownership and paired refreshes

Owner reported shadows flipping on and off under overlapping lights. The .15
Demo probe recorded 24 dynamic-slot changes and 46 mismatched static/dynamic
pairs over 240 rendered frames. `_flush` could commit a moved static origin
without redrawing its dynamic partner, and `_publish` then correctly refused
the mismatched dynamic map, briefly removing the character shadow.

Runtime `20260904.16` queues those partners together and defers the static
origin change until both fit the existing budgets/intervals. Slot selection
also gives incumbents a 25% priority margin, smooths the cone's priority edge,
and uses pre-flicker intensity/reach for authored lights. Actual illumination
still flickers; deliberate fades and reach pulses still affect priority. Native,
model-effect and editor map lights carry the priority values. The per-light
shadow multiplication and additive lighting shader are unchanged.

Final NW probes: full/NVIDIA 240 frames, two slot changes, zero mismatched
pairs; weak/AMD integrated 240 frames, one change, zero mismatched pairs. Both
had zero GL errors and budget overruns. Different animation phases can change
the swap counts, and genuinely stronger/moved/removed lights still change
ownership. Four new Node regressions cover ties/replacement, cone continuity,
authored flicker, and budgeted paired refreshes with stationary casters.
Full suite: 2,547 passing. All 13 local template runtimes synchronized.
See [performance checks](PERFORMANCE.md) for the retained moving-scene probe.

## 2026-09-04 — Avoid zero-contribution spotlight shadows and duplicate anchor updates

Runtime revision `20260904.15`: a spotlight now exits the fragment light loop
when its cone falloff reaches zero, before fetching the shadow atlases. The
existing cone edge and all quality settings remain. `effectAnchorWorld` also
leaves the world-matrix update to Three.js `localToWorld`, removing a second
walk through the same ancestors for every anchor query.

Full suite: 2,543 passing. Runtime synced across all 13 local template projects.
The NW game profiler now times the update handler's Three draws as well as the
PIXI composite, and reports the actual GPU. A retained comparison setup freezes
scene/clocks/media and alternates baseline and production shaders. Full and weak
variants produced identical images on the AMD integrated GPU; full-quality
rendering cost fell about 19%, while weak quality had no consistent gain.
See [performance checks](PERFORMANCE.md) for samples, reproduction and limits.
An additional experimental branch skipping dynamic shadow reads when the static
sample was zero did not improve timings consistently and was not retained.

## 2026-09-04 — Actor shadows under the screen glows; editor/game brightness mismatch

Owner: "I'm still not seeing shadows for my actors in-game when the
monitor arm screens shine on me" and "the intensity seems different in
the editor for those lights vs in-game". Two causes, both found with
`scratchpad/shadow-actor-harness.cjs` (stands the player where a screen's
cone lands, freezes the clocks, on/off pixel diffs, samples floor
brightness at a camera pose the editor harness matches):

1. The dynamic rows (3 full / 1 weak) went to the lights NEAREST the
   player — the torch in hand, the door beam, the dying tube — never to
   the screens 11 tiles up. Rows are now ranked by `Shadows._incident`
   (falloff × cone × brightness at the player's body); the screen shining
   on the party outranks the torch lighting the floor. Weak tier now has
   2 dynamic rows, `dynamicTriangles` 200k (was 30k, which refused the
   149k actors outright) at half rate; full 600k.
2. The screen glows are anchored ON the monitor screen; the arm is an
   animated prop, so a DYNAMIC caster, and in the game its own geometry
   sat at the light's origin: every glow's rows were black from a hand's
   width away and the whole room fell to ambient (floor 26 with shadows
   on, 83 off; the editor, whose arm never animates, read 69). A model
   effect light now carries `carrier` and its rows render with that
   object hidden. After: floor 75 on / 87 off, in line with the editor.
   The packed light values (colour gain, reach, ambient) were identical in
   both apps all along — compare `Reactor3D.lightUniforms()` by candidate
   index before suspecting the pipeline.

Verified: with one screen glow left on and the player in its cone, the
actor's and the bike's shadows appear (4.7% of pixels darker). With all
eight 74-tile glows on, a single occluder blocks one of eight lights and
the shadow is faint — that is the authored reach, not a bug. Slider: the
panel's range inputs now draw a rail + accent fill + ringed thumb
(`--rr-fill` from `_trackFill`).

## 2026-09-04 — Shadow atlas: budgeted lights in reach, two samplers total

Owner rejected the nearest-4 rule ("all lights should cast shadows if
they're within the range of the light... we have to be smart about it")
and asked whether the lights should combine into one shadow texture. They
do now. `Reactor3D.Shadows` (runtime `20260904.13`) renders each casting
light's six 90-degree faces into a ROW of one 2D depth atlas
(`rrShadowAtlas`, 6×size wide, rows×size tall, R8 colour + UnsignedInt
depth in LessEqual compare mode, linear = hardware 2×2 PCF) and a second
small atlas for moving casters (`rrShadowDynAtlas`). The lit shader picks
the face from the major axis of light→fragment like a cube lookup, projects
with the face's right/up (`SHADOW_FACES`, right = dir × up as three's
lookAt has it), clamps taps inside the face by one texel, and offsets into
`row`. `rrShadowInfo[k] = (near, far, dynRow|-1, softness)`,
`rrShadowPos[k]` = the row's rendered origin, `rrShadowGrid = (1/6, 1/rows,
1/dynRows, 1/size)`. `SHADOW_SLOTS` (uniform array length) is 8;
`SHADOW_QUALITY.full = 8 rows / 3 dyn / 512 / 5 taps / 2 static + 2 dyn
rows per frame`, weak `4 / 1 / 256 / 1 tap / 1 + 1`.

How rows are rendered: NOT three's shadow pass any more (it cannot draw a
point light into a 2D target: `faceCount` comes from the map type). Each
face is `target.viewport/scissor` set, `renderer.clear(depth)`, then
`renderer.render(scene, faceCamera)` with the camera's layers set to the
caster layer, the casters' `material` swapped to their
`customDepthMaterial` (`casterMaterialFor`: MeshDepthMaterial, slope
offset, colorWrite off, side flipped like three does; one shared per
side×skinned, cut-outs their own with the map synced per pass), and
`scene.matrixWorldAutoUpdate=false`, `renderer.autoClear=false`,
`scene.background=null` for the duration. `_faceMask` skips faces with no
caster in them (a caster's centre vs the face's 90° frustum with its span
as slack). Statics render at coarsest LOD as before.

Who gets a row: candidates whose reach covers any caster
(`_castersWithin`), ranked by `rank` from `syncVolumeLights` (covering the
focus → distance; else 1e4+gap), so the torch in hand beats a 50-tile
screen glow. Dynamic rows: among assigned lights with a casting character
in reach, same rank. Dirty tracking is per row: `_changedRoots` reports
the old and new position of each static/dynamic root that changed, and a
row is dirty only if a point lies in its reach (`_touches`). A character
"changed" when its root or one of two bones moved `SHADOW_DYNAMIC_MOVE`
(0.03 tile) from where it was last reported — idle breathing no longer
redraws anything (was every frame). A light that drifts > 0.25 tile asks
for a new rendering (`tile.want`) but keeps reading the old one from its
old origin until it lands, and a valid row is redrawn no more often than
`SHADOW_STATIC_INTERVAL` (10 frames). A row for a NEW light is not read
until rendered (`tile.valid`). `_publish` writes the uniforms from row
state; `_flush` (sentinel hook) renders this frame's jobs then publishes.

Gotcha found live: the atlases are 2D compare-mode textures, and after
three's pass they stay bound on texture units. PIXI's batch shader
declares 16 `sampler2D`s pointing at units 0..15, and ANGLE refuses the
draw ("Mismatch between texture format and sampler type") if ANY of them
holds a compare texture, sampled or not — the old cube maps never
collided because cubes bind to a different target. `Viewport._resetPixi`
now calls `Shadows.unbindFrom(renderer)` (bind null on every 2D unit;
three's own cache is reset before its next pass). Diagnose this class by
wrapping `gl.drawElements` and reading the program's samplers + bound
textures on the first `getError()` (in `scratchpad/shadow-atlas-harness.cjs`).

Measured (`scratchpad/shadow-atlas-harness.cjs`, Demo copy, full tier,
dedicated GPU): 8 rows all valid, 16-19 candidates all wanting rows, no
GL errors, no failed programs; frozen-clock on/off screenshots differ in
29% of pixels, 99.9% of them darker with shadows on. Idle: 6/40 frames
render a dynamic row (the follower's sway), 18/40 a static row (six
screen glows riding animated arms, each ≤ 1 row per 10 frames). CPU per
row ~0.9 ms static / ~1.8 ms dynamic on this box. Weak tier (TIER=weak):
4 rows, 1 dyn, 1536×1024 atlas, same checks pass. Editor map view:
active, 8 rows, no failed programs (`editor-lighting-harness.cjs`, now
pointed at the session's Demo copy via SCRATCH). Not verified: a real
integrated GPU; the atlas is ~63 MB VRAM on full (3072×4096 depth + R8)
and ~10 MB on weak — drop `size` if a laptop objects.

## 2026-09-04 — Shadows: why some things cast and others do not; the per-frame static redraw

Owner: the screen spotlights shadow the plant and the tank but not the
reactor, the computers, the mascot or the actors. Probed in the running
Demo (`scratchpad/shadow-casters-harness.cjs`, which lists every caster
with its triangle count, whether it is casting, the slots and per-frame
map renders). Facts: (1) only `quality.slots` lights cast at once — the
nearest to the player (4 full / 2 weak) — every other light casts
nothing, whatever its flag; the Demo has 11 map lights + 8 screen glows
with shadows on, so most never get a slot. (2) Moving casters (characters,
events with models) share a per-map triangle budget, nearest first: full
320k / weak 30k. On my box: actors 149k+149k cast, plant 8k and tank 6.5k
cast, the two mascots 64k and the bike 227k do not (312k spent). On a WEAK
tier only the plant and the tank fit — which is exactly the owner's list,
so their game likely runs at the weak tier (two GPUs; the iGPU matches the
weak pattern). The shadow system now prints its tier/slots/budget once
(`RPG Reactor shadows: …`) — ask for that line. (3) Props are static
casters (reactor 370k, computers 488k each) and DO render into the static
map when their light has a slot. Found on the way and fixed: the static
maps re-rendered EVERY FRAME because the screen glows ride animated arms
and the slot key was the exact light position — `SHADOW_STATIC_MOVE`
origin hold (0.25 tile; maps rendered from and read from the held origin).
Dynamic maps still redraw each frame while any casting character animates,
by design. Also fixed: my tier line called a non-existent `gpuTier()` (it
is `tier()`) and crashed the game every frame for a few minutes of the
owner's session; Computer-01's stale `lods` list removed from the Demo.

## 2026-09-04 — A model sidecar save reaches the map view (for real this time)

Owner: editing a model's effects in the database did nothing on the map
until an app restart. `saveRules` called
`this.projectController?.refreshMap3DView?.()`, but the database hands its
3D editor a STAND-IN controller (`DatabaseEditorUI` `case 'reactor3d'`: three
fields) with no such method, so the optional call fell through; the 08-30
"reaches the map 3D view" fix had only pinned the source text. The stand-in
now forwards `refreshMap3DView` to `window.reactor.projectController`, and
`saveRules` falls back to the real controller. Probe
(`scratchpad/db3d-save-refresh-harness.cjs`): save radius 7.5 → one
refresh, one rebuild, prop 12 reads 7.5 with the database still open.
**Harness hazard found by that probe:** the scratch Demo copy had `3d/`
symlinked to the real Demo, so the save wrote into the owner's Monitor Arm
sidecar (restored to radius 3 by hand; `git diff` the two tracked
`model.json` files before committing — the mascot's laser and the arm's
glow are the owner's own edits). The copy's `3d/` is a real copy now.

## 2026-09-04 — Placed models: effect lists, animation sequences, light reach (runtime `20260904.11`)

Owner: a spot on the Monitor Arm set On demand and chosen on a placement
showed nowhere; Always in the DB killed it; the 3D-M tab took one
animation and one effect. Findings: the light WAS on and packed in game
and editor (`scratchpad/prop-light-game-harness.cjs`,
`prop-light-editor-harness.cjs`) — its authored 3-tile reach never grew
with the 9.2-tile placement mounted 7 tiles up. `effectLight` now scales
reach/width by instance span ÷ `Reactor3D.EFFECT_PREVIEW_SPAN` (1.6, the DB
preview's fit). The DB's `_updateTriggeredEffectPreview` previewed one
effect only (the arm's Always movie beat the light); a light now has its
own slot. Props: `animations[]` (sequence, `repeat` loops the list via
`playModelSequence` + the `sequence` field on the last queue entry) and
`effects[]`; 3D-M checkbox lists (`_fillChoiceSelects`, `_checkedNames`);
`MapEditor3D.animateModel` queue mirrors the game. Old single fields still
read. Verified: prop 12 reach 17.25, Walking→Running loop on event 2, arm
movie + light together, lists ticked (`db3d-arm-harness.cjs`,
`props-lists-harness.cjs`).

## 2026-09-04 — Light as a 3D model effect type (runtime `20260904.4`)

Queued item (3) from the lighting roadmap, built in two forks on a
contract I wrote first (`Reactor3D.readEffectLight`, `Reactor3D.effectLight`).
Runtime: `holder.lights`, `fireEffectLight` (duration>0 timed, 0 toggles),
state triggers in `updateTriggeredEffects`, `modelEffectLights()` into
`collectLights`, `wantsLights3D` via `hasLiveEffectLights()`, `groundY` now
absolute in both pools. Editor: Database3DEditor Light rows + preview body
(`_playLightPreview`; the DB preview materials are NOT lit, so the model
itself does not light up there — only the map view does, through
`Reactor3D._editorEffectLights` collected in `MapEditor3D.updateEffectPlays`
and appended in `LightingManager.feed3D`). Editor model lights are static
(no flicker/pulse).

Owner's review found the first cut sloppy: no presets, a "ball of light" on
every kind, and Always killed the preview. All three fixed (runtime
`20260904.5`): `RRMapLights.PRESETS` is the single preset table (tray +
form), the core is a `roundLightTexture` sprite, the preview model is lit
for real (`litMaterial` on its basics + `Reactor3D.packLightUniforms`, the
standalone packer; shared uniforms saved/restored around the preview), and
the triggered-preview simulation counts lights. Note for anyone touching
`_lightPreviewLit`: the uniforms are GLOBAL — the map view's `syncLights`
caches its ambient and only rewrites on change, so restore what you found
or the map behind the database stays at the preview's 0.35.
Then the owner asked for the rings/arrows on the light in the preview and
noted the card's tabs did nothing: `_syncLightGizmo` (RRPoseRings3D +
RRAxisArrows3D at the anchor, sized from `_previewSpan`), `_pickLightGizmo`
/ `_dragLightGizmo` / `_endLightGizmoDrag` on the preview's pointer path
(mode 'fxgizmo', before the anchor marker), the card's Rotate/Light tabs
(`_lightCardSlidersHtml`, `.r3d-fxcard-lslider`) and `_syncLightControls`.
Mascot pass (runtime `20260904.6`): the preview raycast missed skinned
meshes (stale cached bounds — `_raycastPointer` now calls
`computeBoundingBox/Sphere` on skinned meshes before the ray), so Place
never bound a bone and the light sat on the origin while the walk played;
bone-bound anchors always followed. Beams got `Reactor3D.beamBodyMaterial`
(brightness floor 0.45 at any angle) in the pool and the preview. And
`effectLight` aims in the MODEL frame × the part's pose delta
(`effectAnchorQuaternion`), not the bone's rest axes — a bone's +Z points
wherever the rig left it; `model-effects.test.cjs` pins rest-turn = no aim,
model facing = aim, part swing = aim. Then (runtime `20260904.7`): the
anchor marker syncs per frame in `_updateEffectPreview`; `_effectAnchorChoices`
lists `skeleton.bones` of every SkinnedMesh (the mascot's joints are NOT
`isBone`), the current part is always an option, and `syncWork` only reads
the select when it offers the previous part (else the form detached a bone
anchor on Play/Save); beam `width` = full thickness (half into `aim.w` and
the body scale; 2D bar = width × tw), floor 0.005, default 0.08, laser 0.04.
Laser landing (runtime `20260904.8`): `Reactor3D.beamHit` (march through
`lightBlockHeightAt` + model AABBs, own carrier excluded) in the volume
packer → reach shortened, dot point light packed as the next slot (counts
against SHADER_LIGHTS), `bodies.dots[]` sprite; DB preview `_beamLanding`
(rigid meshes precise, skinned via `_skinnedBounds` from bone positions,
150 ms rate limit). The dot hides when the camera is farther along the
beam than the landing (`hit.facesEye`; owner saw the dot on a hidden wall
from behind it). Not done: the 2D flat pool and the flat 2D compositor
draw the full-length bar with no dot. `scratchpad/beam-game-harness.cjs`
pushes a beam into `$dataMap.reactor3d.lights`, reads the packed uniforms,
and moves the camera behind/in front of the struck wall. **Harness rule (owner asked):** every
game harness that boots a project COPY calls
`scratchpad/harness-lib.cjs` `syncRuntimeInto(copyDir)` before spawning
NW.js — the copy's js/ is a snapshot and `sync-runtime.cjs` only knows the
bundled templates; the stale-runtime symptom was a `bodies.dots`
undefined in a game that had the new packer everywhere else.
`scratchpad/db3d-mascot-harness.cjs` selects the mascot, adds a laser,
places it on the head through `_placeEffectAnchor`, walks, samples the
anchor world position per frame, and screenshots edge-on and side views.
Verified: `scratchpad/db3d-light-harness.cjs` opens Database › 3D Models on
the Demo copy, switches an effect to Light, applies the Laser preset, aims a
spot down onto the console, sets Always, screenshots at 2200x1300 (resize
the NW window over CDP; closing the floating card DESELECTS the effect). Not verified live: a model light in the running game and in
the map view (the Demo has no light effect authored yet — author one on
the computer model and playtest next).

## 2026-09-04 — Lighting: panel r10, light commands, laser beam (runtime `20260904.3`)

Owner asks, all landed: a proper Tag dropdown (`_tagControl`: map tags +
preset tags + *New tag…* → inline field), XYZ position sliders and a
rotation group, the prop-style rings/arrows on the selected light in 3D
(`_syncGizmo3D`/`_pickGizmo3D`/`_dragGizmo3D` in LightingManager; picked in
the tool's own capture-phase `_pointer3DDown` BEFORE `_lightNear`; rings
yaw/pitch are `-light.yaw`/`-light.pitch` in the scene frame, same flip as
`feed3D`), cards with the accent-strip header + footer (`.lit-*` classes at
the end of styles.css — note `flex: 0 0 auto` on `.lit-section`, or the
fixed-height dock squeezes the ambient/tray cards to lines), an editable
light **ID** (`RRMapLights.rename`), the themed colour popover
(`RRColourPopover`, `src/utils/ColourPopover.js`), the **laser beam** type
(`width` field; runtime shader/body/2D bar by the runtime fork; editor
2D bar, marker line, laser chip), and three event commands
(`LightCommandEditor`; runtime `LightSwitch`/`TransformLight`/`AmbientLight`
with overrides on `$gameMap`). Ambient vs Tint Screen: separate systems —
the map ambient is a multiply darkness layer (2D) / material uniform (3D)
fed from the sidecar, Tint Screen is MZ's ColorFilter on the spriteset base
sprite; the flat lights sit above the base sprite on purpose so a tint does
not dim them. `AmbientLight` is the event-driven counterpart.

Verification: `scratchpad/editor-lighting-harness.cjs` (repo root) opens the
editor on a Demo copy in the session scratchpad (`rsync` minus 3d/audio —
the owner's editor holds the real Demo's lock), turns the tool on, selects
`door-beam`, aims `mapEditor3D.view` at the gizmo, and drives an arrow and
a yaw-ring drag through `Input.dispatchMouseEvent`. Pick a ring point at
45° between axes — on an axis the arrow wins the pick. The three
commands were then driven live (`scratchpad/light-commands-harness.cjs`:
boots the Demo copy — symlink `audio/`, `3d/`, `movies/` from the real
Demo into the copy or the title dies on a missing BGM — and calls
`PluginManager.callCommand` for each): tag switch-off drops the torch from
`nativeLights`, transform lands intensity/reach/colour, ambient eases
0.22→0.9 over 60 frames, reset and toggle restore, `$gameMap` round-trips
through JsonEx. Not verified live: a placed laser beam in the game.
The owner reported the commands "did nothing" from the event editor. The
cause was NOT a stale editor: the picker inserts with
`reactorEditor.show(null, callback, command.reactor)` and the dialog read
the name only off `command.parameters`, so a fresh insert returned null
silently; my synthetic check had opened it with a saved command. Fixed
(`nameHint`, the QuestCommandEditor pattern) and pinned in
`light-commands.test.cjs`; `scratchpad/editor-cmd-harness.cjs` now drives
the real path (event editor open → `commandList._reactorCommandEditor` →
`show(null, cb, name)` → OK) for all three.

## 2026-09-04 — BraverCoreEdits.js is gone; the compat layer carries it (runtime `20260904.2`)

Owner asked whether the modded-corescript plugin could live in the layer
proper. It can, as additive shims: `installModdedCorescriptCompatibility`
in `reactor_mv_compat.js` (tier 2), test
`editor/tests/mv-modded-corescript-compat.test.cjs`. One real hazard was
found and closed on the way: `result.target` is a circular reference
(actor → _result → target → actor when an actor heals itself from the
menu) that JsonEx cannot encode; Braver's own plugins clear or stash it by
hand (BraverMiscFixes, YEP_AbsorptionBarrier, YEP_BattleEngineCore), other
MV games would not, so it is stored non-enumerable and `Object.keys`-based
JsonEx never sees it. `result.dodged` moved into the stock engine as an
inert hook (`Game_ActionResult.clear` resets it; Braver never did, so a
target that dodged once stayed unhittable). The familiar-troop rule is
gated on `window.Braver` + HIME's counter, list from `Braver.familiarTroops`
when a game declares one. Project4's `js/plugins/BraverCoreEdits.js` is
removed from disk and from both plugin lists (a copy sits in the session
scratchpad only). Earlier notes below that say the plugin must load first
are historical. Live check: `scratchpad/battle-harness.cjs` (boot → map →
`BattleManager.setup(1)` → CTB phases → one `Game_Action.apply`).

## 2026-09-04 — Braver: game over, and the black room explained (runtime `20260904.1`)

The owner's next crash was `Scene_Gameover.update` in SRD_GameOverCore reading
`this._fadeSprite.opacity`. MV scenes own a `ScreenSprite` for fades and
plugins address it directly; MZ has `_fadeOpacity` on a colour filter and no
sprite. The 09-03 gap-fill of `createFadeSprite` made a REAL ScreenSprite and
added it to the scene, which BraverAutosave sets to 255 under its
"Autosaving..." notice and expects `fadeInForTransfer` to lift — under MZ the
filter faded and the sprite stayed black. That is the black room after the
first battle (the post-battle transfer autosaves). Fix in the audit gap-fill
block of `reactor_mv_compat.js`: `_fadeSprite` is a prototype accessor that
lazily makes a ScreenSprite whose `opacity`/`setBlack`/`setWhite` route to
`_fadeOpacity`/`_fadeWhite` + `updateColorFilter`, never on stage; assignments
are kept; `startFadeIn/Out` recreate a nulled one. Second contract behind it:
SRD runs `Scene_MenuBase.prototype.update` on the game-over scene, MZ's calls
`updatePageButtons` — `Scene_Base` now has the guarded body.

Verified with `scratchpad/gameover-harness.cjs` (repo root, gitignored, so it
survives the session; own `--user-data-dir`, CDP):
game over settles at phase 6 with fade 0 and the GAME OVER art on screen; a
`requestMapLoadSave(40)` + `reserveTransfer` + `goto(Scene_Map)` shows the
notice, fades 244 → 0 and the lit room renders. Harness lessons: connect to
the `/json` page target whose url is `index.html` (the first target is
pre-navigation and every evaluate returns a CDP error, not a value); set
`SceneManager.isGameActive = () => true` for an unfocused window; a message
on screen blocks `reserveTransfer`, so `$gameMessage.clear()` +
`$gameMap._interpreter.clear()` or go through `SceneManager.goto(Scene_Map)`;
`drawImage` from the WebGL canvas reads back black — judge pixels from
`Page.captureScreenshot`, never from a 2D copy.

Tests: 2,502 pass. Next in Braver: the real post-battle flow (victory →
transfer → autosave) end to end, then save/load through the storage bridge.

## 2026-09-03 — Star Shift Legacy as a second MV corpus (runtime `20260903.1`)

`template/Star-Shift Legacy` (untracked, like the other Star Shift copies;
both marker files present, MV plugin stack) is the owner's new error-hunting
project. First playtest findings, all fixed:

- **Resolution.** YEP_CoreEngine sets `SceneManager._screenWidth/_screenHeight`
  (1280x720) at load; MV data has no `advanced` block and the editor had
  written 816x624 into System.json, which `Scene_Boot.resizeScreen` took as
  authored. `installBoxSizeCompatibility` now wraps `resizeScreen`: under
  `mvGameSemantics`, a finite plugin-set size is written into
  `$dataSystem.advanced` (screen and UI area) before the MZ boot runs. The
  sibling Star Shift projects were unaffected only because their System.json
  already says 1280x720. Editor previews (message, troop, UI) still read
  `advanced` from disk, so for Legacy they show 816x624 until System 2 is set
  to 1280x720; the runtime no longer depends on that.
- **F2 crash.** Fullscreen_Options replaces `Graphics._onKeyDown` with MV's
  body, which calls `this._switchFPSMeter()`. Aliased to `_switchFPSCounter`
  in `installGraphicsCompatibility` (a plugin's own definition wins).
- **Scaling toast removed** (see the 09-02 fullscreen note below); the console
  report is `console.debug`, invisible unless Verbose is on.
- **Quest name collision (runtime `20260903.2`).** New Game crashed in
  `YEP_QuestJournal` `questAdd`: Reactor's `reactor_quests.js` loaded the
  project's `data/Quests.json` — a GS_QuestSystem file, present in five
  bundled MV projects — into `$dataQuests`, the global Yanfly builds from its
  parameters. Renamed Reactor's file to `data/ReactorQuests.json` and the
  global to `$dataReactorQuests` (runtime, DatabaseManager file map,
  ProjectManager defaults, tests, docs). The editor had already re-saved
  Legacy's and Freelancers' plugin files with Reactor's default fields merged
  in (plugin fields intact, GS_QuestSystem is not even in Legacy's plugin
  list); Origins, Rebellion and Project4 still hold the originals. Every
  project's `data/Quests.json` now belongs to its plugin again.
- **LeTBS animation crash (runtime `20260903.3`).** `this._reactor3dBaseUpdate
  is not a function` from `Sprite_AnimationMV.update` when mv_compat runs it
  on LeTBS's `Sprite_TBSAnimation` (a `Sprite_Animation` in cell mode). The
  3D wrappers in `reactor_sprites.js` now call
  `X.prototype._reactor3dBaseUpdate.call(this)` instead of looking it up on
  the instance. Rule for future wrappers there: never `this._reactor3dBase*()`.
- **Import dialog.** Owner asked for a generic Import button with a source
  picker. `QuestImporter.SOURCES` now has visustella / yanfly / gs;
  `available()` + `read()` drive `DatabaseQuestEditor.showImportDialog`.
  Legacy reads as Yanfly 14 quests (of 100 slots), GS 100. GS `item #1`
  rewards are real: that project's item 1 has an empty name.
- **Yanfly quest scene (runtime `20260903.4`).** `this._listWindow.scrollUp is
  not a function`: MV's `Window_Selectable.scrollUp/scrollDown/updateCursor`
  gap-filled in the "Window_Selectable MV scroll/sound API" block of
  mv_compat (whose `processWheel` already called them). Verified by opening
  `Scene_Quest` with `$gameTemp.reservedQuestOpen(1)` over CDP.
- **PR #41 merged (APNG/GIF playback, runtime `20260903.5`).** Branched
  from the 08-30 runtime; merged clean over today's work (stash, merge, pop:
  no conflicts). Its frame compositor uploads through
  `_baseTexture.update()` like the rest of Bitmap, which pixi_compat patches
  per instance on v8, so the deferred-upload batching covers it. Runtime
  re-synced into the 13 projects.
- **PR #42 merged (ReactorEvents, runtime `20260903.14`).** A read-only
  battle event feed (`docs/RUNTIME-EVENTS.md`); branched before today's
  work, merged clean with the stash/merge/pop flow again. Its `actionEnd`
  emit sits inside mv_compat's MV `endAction` override, so MV games feed it
  too. Project4's `BraverCoreEdits.js` replaces `Game_Action.apply` outright
  and now emits `actionApplied` itself, as the stock body does.

## 2026-09-03 — BGM sequences (GitHub #11), built on the sequence model

Owner accepted the contributor's plan with two changes (sequence model from
the start; generic carry-through in `saveMapProperties`). Runtime
`20260903.6`. Shape, engine and editor are described in
`editor/CHANGELOG.md`; what to know when picking this up:

- **Where things are.** Engine: `runtime/reactor_managers.js`, the "BGM
  sequences" block after `AudioManager.checkErrors` plus branches in
  `playBgm`, `replayBgm`, `updateBgmParameters`, `stopBgm`, `fadeOutBgm`,
  `fadeInBgm`, `playMe`, `stopMe`, `saveBgm`, `checkErrors`. Tick from
  `Scene_Base.update`. Map entry: `Game_Map.autoplay` and
  `Game_System.saveWalkingBgm2` go through `AudioManager.mapBgmObject`.
  Editor: `src/utils/BgmSequenceEditor.js`, `ProjectController`
  (`populateBgmSequenceForm`, `mapBgmSequenceFromForm`, `pickSequenceTrack`,
  the validation + carry-through in `saveMapProperties`), `index.html`
  under `#map-bgm-picker`.
- **Invariants.** `_bgmBuffer`/`_currentBgm` are null while a sequence
  plays; anything that reads them must branch on `_bgmSequence`. Every
  sequence buffer carries `_rrRetired` (set before destroy/fade so its
  stop listener, which `destroy()` also fires, starts nothing) and
  `_rrBaseVolume` (for ducking). `saveBgm()` → `{...fallback, pos: 0,
  sequence: mapId}`; `playBgm` of that restarts it, or parks it in
  `_pendingBgmSequence` until the map is current.
- **Not done / open.** No layer cap (measure on weak hardware first, per
  the plan). ME ducks to 0.25 (`BGM_SEQUENCE_ME_DUCK`); no per-map
  setting. Map-level Silent-then-fallback from the plan is expressed as a
  `[silence, track]` sequence. The contributor has not been told; the
  owner may want to reply on #11 (no gh CLI here, so by hand).
- **Harnesses.** scratchpad `seq-run.cjs` drives a Barebones copy
  (`seq-project`, Map001 hand-edited) through the whole cycle over CDP;
  `seq-preview` renders the list UI standalone for screenshots. Synthetic
  Enter did not reach the Barebones title (unfocused window); call
  `SceneManager._scene.commandNewGame()` instead.

## 2026-09-03 — Project4 / Braver corpus (runtime `20260903.9`)

`template/Project4` (untracked) is an MZ container holding the Braver 1.6.5
plugin set (~250 MV plugins, FFXI: Braver). Eight compat fixes got it from
"crash at load" to the first map with the intro playing; all in
`reactor_mv_compat.js` / `pixi_compat.js`, listed in `editor/CHANGELOG.md`.
Project-side, two things were done that are NOT Reactor's:

- `js/plugins/BraverCoreEdits.js`, first in both `plugins.js` and
  `reactor_plugins.js`: the game's hand-edited corescript (Scene_BattlePrep
  shell from its rpg_scenes.js; the rpg_objects.js tweaks recovered by
  diffing the copy in `js/plugins/rpg_objects.js` against stock 1.6.2).
  Any other core edits Braver made are unknown — `Braver-1.6.5/` holds only
  a LICENSE.
- `index.html`: `$reactorMvCompat` flipped `false` → `true`. The container
  was created in Reactor (no MV marker), so Tier-2 MV semantics were off
  for an all-MV plugin stack. The editor writes that flag at "Install
  Reactor Runtime" from the marker files; there is no UI toggle yet.

Method that worked: `scratchpad/boot-any.cjs <project> <port>` boots, skips
the splash with Enter, calls `commandNewGame`, and prints the error
printer's text plus `EXTRA=<js>` probes; the silent createContents case
was found by replaying `Window_Base.initialize` step by step inside the
live game (`updateBackOpacity` threw inside a swallowed sprite update).
**Audit workflow (use this before the next playtest, not after the crash):**

    node editor/build-scripts/plugin-compat-audit.cjs template/Project4 \
        --mv "template/Star-Shift Legacy/js/BACKUP" --json /tmp/audit.json
    node editor/build-scripts/plugin-compat-probe.cjs template/Project4 /tmp/audit.json

The audit's `mv-gap` lines are MV APIs the layer does not define statically;
the probe boots the game and says which are undefined on the live
prototypes (the layer fills many from loops). Fill those in mv_compat's
"MV APIs the plugin-compat-audit found" block, re-run the probe. `--all`
shows the this-call findings (plugin-to-plugin, mostly). Legacy's BACKUP
holds stock MV 1.6.2, the reference corescript.

Since then (runtime `20260903.17`): name entry, the main menu, map
animations, the Khas lighting layer (a real light map composited as
authored: dark rooms, lamp pools), entering a battle, the CTB turn flow
through actions, and state animations on battlers all run.
Contract differences the audit cannot see kept coming out of battle: MZ
makes actor sprites only in side view and defers the spriteset's first
update; MV's isInputting was phase-based; v4 filters/blend modes (numeric
ids through a pixi_compat registry, the filter bridge in mv_compat forcing
a pure-multiply filter's output opaque, `_createRenderer` called once from
`_createPixiApp`); the global upgrade dropping super-call arguments.
Expect more (victory, save/load through the storage bridge; Khas's
`Khas_Sprite._renderWebGL/prepareRender` never run on v8, so anything it
did per draw is silently missing).

Playtest checkpoints take the 20-45 minute walk out of the loop: in a
playtest the runtime saves slot 99 after every battle and map transfer,
F9 on the title loads it (the on-screen hint was removed 09-04 at the owner's request; the console line says so). Verified end to end
in the harness (save → title hint → F9 → map). Harness runs are not in
test mode (`Utils.isOptionValid("test")` is false under
`--remote-debugging-port`); force it with
`Utils.isOptionValid = n => n === "test" || orig(n)`.
`scratchpad/drive-to-battle.cjs` still does the intro unattended in about
six minutes; `boot-any.cjs` with a forced `BattleManager.setup` starts a
battle from the first map in seconds, and with
`$gamePlayer.reserveTransfer(40, 8, 8, 2, 0); SceneManager.goto(Scene_Map)`
lands in the lit room. The editor's Battle Test (Troops) is the same
shortcut for the owner. `scratchpad/drive-save.cjs <port> <slot>` loads a
save (`ENTRY='[map,x,y,dir]'` re-enters through a transfer so autoruns
start from the real spot; `TARGET` regex stops at a message) and presses
Enter through the scene with in-page KeyboardEvents (CDP key events never
reach `Input`). That is how the empty YEP name box beside unnamed messages
was found (compat `synchronizeNameBox` guard, runtime `20260903.18`). Next: the black-room soft lock the owner hit
after the first battle (the room now renders; whether the lock was the
lighting or an event wait is unconfirmed), victory, save/load.

Tests: `editor/tests/mv-screen-size-compat.test.cjs` (slices the two
installers into a sandbox). Live check: scratchpad `legacy-harness.cjs`
boots the project under `nwjs-linux/nw --remote-debugging-port=9333 . test`,
drives F2 and a real F4 over CDP, and screenshots — window 1280x720, then
2560x1440 at scale 2, no console errors. Gotcha that cost two shells:
`pkill -f <pattern>` matches the calling shell's own command line when the
pattern appears in it; build the pattern from two variables.

The project boots to `Scene_PretitleMap` (HIME_PreTitleEvents), not
`Scene_Title`, so a title-scene wait never returns.

## 2026-09-02 — Quest system (GitHub #9), first cut

Reactor's own, not an editor for a plugin's data: `data/ReactorQuests.json` (renamed from `Quests.json` on 09-03, see above; a
project gains the file when it authors a quest; absent reads as none),
`runtime/reactor_quests.js` (loads it like `reactor_ui.js` loads
interfaces; `$gameSystem.quests()` is the saved progress, class
`Game_Quests` on `window` so JsonEx restores it; rules run from
`Game_Map.update`), `Scene_Quest` (category strip, list active → complete
→ failed, scrolling detail, OK toggles tracking), four plugin commands
under `RPGReactor`, and Database › Quests (`DatabaseQuestEditor.js`) with
**Import from VisuStella…** (`QuestImporter.js`, layer-by-layer decode of
the plugin's `Categories` parameter; verified against the plugin's own
twelve sample quests in a local project, which the test does not depend on
because that project is gitignored).

**Follow-ups (updated for the 2026-09-03 importers):**
- An on-map tracker window for the tracked quest's open objectives (the
  `tracked` state exists; nothing draws it on the map yet).
- The log's labels (Objectives/Rewards/Complete/Failed/Tracked, All) read
  from `System.reactorQuests.labels` with English fallbacks; no editor
  field for them yet.
- Rewards are text only; a "give the reward" action (gold/items) is not
  modelled - VisuStella's are text too, so the import loses nothing.
- Further importers when representative projects are available. Yanfly and GS
  were added on 2026-09-03; Cyclone remains a possible follow-up.
- Category is free text on each quest; a picker of existing names is a
  `datalist`, not a managed list.

**Guards touched:** runtime root count 13 → 14 (`reactor-3d-foundation`),
`save-safety` knows ReactorQuests.json is optional like UserInterfaces.json, the
template slicer in `database-record-templates` cannot cope with an
apostrophe inside a comment in `getDefaultTemplates`.


### 2026-09-02, late: the owner's fullscreen still reads soft — open

The owner's 18:47 and 19:06 playtest screenshots (Demo, 2449x1324 region of
a fullscreen window) are interpolated at the single-pixel level: no 2x2
blocks anywhere. Every reproduction from this side is blocky and reports
`3D pass 1280x720 nearest into the store, MSAA 0, tier full (RTX 5070)`:
same `nwjs-linux/nw`, the editor's own playtest profile
(`PlaytestProfile/nwjs-0.107.0/f56758ae500e29d4`), a real F4 through
Chromium's input path, Continue from the autosave, captured both from the
framebuffer (CDP) and from the compositor (Spectacle, identical). Display
scale is 1 on all three monitors, XWayland scale 1, no GPU environment on
either side. The box has two GPUs (RTX 5070 and the AMD iGPU, which the
weak pattern matches); a launch that landed on the AMD would explain a
weak tier but not smooth sampling. Project3 has no 3D maps, so its 20:03
playtest is unrelated.

Done meanwhile, runtime `20260902.11`: pass targets are `NearestFilter`
unconditionally (`createTarget` no longer takes `{ nearest }`), so no
creation order can leave a linear target. A scaling toast drawn on screen
after every resize was added for this and **removed on 09-03** — the owner
does not want diagnostics on the game surface. The same line still reaches
the console as `console.debug` (enable Verbose in DevTools). **Next: ask
the owner for that console line after F4**. If it says
`tier weak` the game ran on the AMD iGPU; if the store is smaller than
the window and `enlarged linear`, `upscaleFilterInUse` chose linear for
a full-tier GPU on a 1x store (then look at `maxCanvasPixelRatio`).
Harnesses: scratchpad `playtest-like-f4.cjs` (real F4 + Spectacle),
`playtest-like-save.cjs` (Continue route), `playtest-like-filters.cjs`
(MZ's three ColorFilter passes on/off — they do not blur; bounds clamp to
the screen).

## Done on the Linux box, 2026-09-02

All three items below are settled. `npm test` runs **2,337 tests, all
passing**; the two `remapParts` tests pass in 74 ms and 1 ms, so the Windows
timeout was the harness, not the ring search. The runtime is synced into all
11 bundled projects. `.gitattributes` now pins `* text=auto eol=lf`, with
`template/*/js/plugins/**` and `template/*/js/BACKUP/**` left `-text` so the
third-party files keep the CRLF they shipped with.

**Two files came back from Windows damaged and were repaired**:
`runtime/reactor_3d.js` had CRLF endings, a UTF-8 BOM, and every non-ASCII
character double-encoded (`—` had become `â€”`, 373 times); `reactor_main.js`
had the BOM and one such dash. Both are restored byte-for-byte to HEAD's
characters and re-synced. Whatever editor wrote them there reads UTF-8 as
Windows-1252 on save — check before trusting a file it touched.

Sixteen tests failed on the first run, none of them on the new code: ten
pinned runtime revision `20260901.4`, one expected the deleted `.lod*.glb`
files (their deletion is now staged), three matched code that was
deliberately changed (`pickLod`'s screen pair, `shouldMeasure`'s settled
interval, the weak-tier policy of a capped ratio and no multisampling), one
counted the 3D card's headers before the cost panel, and one flagged the two
rewritten optimize-dialog descriptions, now hand-translated in all 17
locales.

## Do these first (next session, on the Linux box) — DONE, kept for the record

1. **`npm test`.** Two tests written this session have **never been executed** —
   the Windows box has no Node. They are the only verification that
   `RRGlbOptimizer.remapParts` works, and it is wired into the Optimize action:
   *"a carved part is re-derived across a reduction, not lost"* and *"remapping
   refuses rather than guessing when the models cannot be paired"* in
   `editor/tests/glb-optimizer.test.cjs`. An end-to-end run on Windows timed
   out without explanation; if the first test hangs or fails, the widening ring
   search in `remapParts` is the place to look. **Do not trust the part remap
   until this passes.** Six other new tests in the same file are also unrun.
   Also unrun there: *"FsAtomic retries a rename held by a sync client or
   scanner"* in `editor/tests/lifecycle-data-safety.test.cjs` — but unlike the
   remap tests, its assertions **have** been executed verbatim, under NW.js
   (see the sync-folder note below), so it is expected to pass as written. It
   deliberately spends ~2 s proving the give-up budget.
2. **`node editor/build-scripts/sync-runtime.cjs`**, then refresh the test count
   in both READMEs (was 2,069).
3. `core.autocrlf = true` is still unresolved and the repo has **no
   `.gitattributes`**, which is the actual hazard: this working copy is inside
   Dropbox and is shared with a Mac/Linux box, so the moment Git rewrites a
   `.sh` or `.command` file it lands on the other machine with CRLF and dies at
   `bash: \r: command not found`. Nothing has been converted yet (Git warns
   "LF will be replaced by CRLF the **next** time Git touches it"), so the
   window to fix it cleanly is still open: add a `.gitattributes` pinning
   `* text=auto eol=lf`.

   **The "unrelated modified files" were not modified — this is done.** They
   were pure mode noise: `git diff --summary` showed each as `mode change
   100755 => 100644`, with blob hashes identical to HEAD (`git hash-object
   editor/images/icon.png` == `git rev-parse HEAD:editor/images/icon.png`).
   Dropbox on Windows cannot preserve the executable bit and `core.filemode`
   was `true`, so Git called the whole set changed — the images, the `.sh` and
   `.command` launchers, the `.desktop` file. **`git config core.filemode
   false` is now set in this clone**, which took `git status` from 70 entries
   to 37, and all 37 remaining are genuine 0.98.5 work. Do not commit those
   mode changes if they reappear on another clone: committing them strips `+x`
   from the shell launchers on the machines where it matters.

**Asset state, for the commit.** `template/Demo/3d` is **200.8 MB -> 84.8 MB**,
optimized, with the `.orig` working copies deliberately cleared once the result
was checked. Git history is the way back to an original, not a sibling file.
That 116 MB is not only frame time: download size is an itch.io budget the
owner spends deliberately, which is also why separate `.lod*.glb` files were
rejected — they spend the same budget the reduction just freed. What is on disk
now is the good state:

| model | live | what it is |
|---|---|---|
| Aether Core Tower | 17.2 MB | 1,895,089 -> 506,341, crack repair on |
| RPGReactor-Computer-01 | 16.4 MB | 1,887,267 -> 488,186, crack repair on |
| Carol / Fleagus / Mascot | 8.7 / 9.1 / 4.8 MB | 75% each, skinning intact |
| Oth97_CNO_Consul | 11.4 MB | textures only, triangle list untouched (has parts) |
| RPGReactor-MonitorArm | 2.3 MB | restored, triangle list untouched (has parts) |
| kawashaki_ninja_h2 | 8.6 MB | refused: shared buffer views |
| Sword_Fleagus | 6.3 MB | tangents dropped |

Last updated 2026-09-02. 0.98.4 shipped 2026-08-31. Carried into 0.98.5:
the fs-backed editor prefs store (so future NW bumps stop resetting prefs),
`refreshMap3DView`'s awaiting fire-and-forget reconcile + full setEnabled
cycle on project change, and (optional) a web audio extension manifest to
silence the one-per-track BGM probe 404.

## 2026-09-02 — Playtest could not save inside Dropbox (EPERM on rename)

Playtest failed with *"not all the database files could be saved"*:

```
DatabaseManager.js:383 Error saving System.json: Error: EPERM: operation not
permitted, rename '...\data\System.json.tmp-rr-2984-2f481ec...' -> '...\data\System.json'
    at Object.renameSync (node:fs:1014:11)
    at writeFileAtomicSync (src/utils/FsAtomic.js:44:16)
```

**Not a permissions bug, and not a bug in the write.** Windows will not rename
a file — either end of the rename — while another process holds a handle to it
without delete sharing, and a Dropbox/OneDrive client, an antivirus scanner and
the search indexer all open a file the instant it appears or changes. This
atomic write invites exactly that at both ends: the temp file is brand new, and
the destination was just modified. `System.json` gets hit hardest because
`saveJSON` gives it a fresh `versionId` on every save, so it is the file the
sync client is most often mid-upload on. The write itself was complete and
correct on disk.

The fix is in `editor/src/utils/FsAtomic.js`, which is the single helper every
project write goes through (maps, database, plugins, `project.rpgreactor`,
optimized GLBs — 12 call sites), so all of them gain it:

- `renameWithRetry` retries `EPERM`/`EACCES`/`EBUSY` with a doubling backoff
  (1 ms to 64 ms) for a 2 s budget. **A lock that outlives the budget still
  throws** — no in-place fallback, because the previous good file is the whole
  point of the atomic write — and appends to the message that a program is
  holding the file, since the bare errno reads like an editor bug.
- Any other rename error is not retried at all (a full disk or cross-device
  path will not improve by waiting).
- `unlinkWithRetry` gives the failure-path cleanup the same wait on a 250 ms
  budget, so a failed save cannot leave `.tmp-rr-*` litter in the project for
  the sync client to upload.

**`Atomics.wait` is unavailable here.** Chrome forbids it on a renderer's main
thread, which is exactly where the editor calls this from — verified, it throws
— so the sync sleep spins on `Date.now()`. That is the live path, not the
fallback. It only ever runs on the error path.

**The fault reproduces on demand, and the fix absorbs it.** A second harness
ran 200 atomic writes of a System.json-shaped payload into the real, live
`template/Demo/data` folder (to a scratch filename — the project's own
`System.json` was never touched), wrapping `renameSync` to count what the
filesystem actually did: **209 rename attempts for 200 writes — 9 genuine
`EPERM` rejections by Dropbox, every one absorbed, 0 failed writes, no temp
litter.** That ~4.5% per-file rejection rate is why this looked like it failed
*every* playtest: `saveAllData` writes the whole database file list, so a save
of ~20 files had better than a 60% chance of hitting at least one.

**Verified under NW.js**, not just by syntax check: a harness in the renderer
main thread (`scratchpad/fsatomic-harness`, an `nw.exe` app that requires the
real `FsAtomic.js`) ran six cases, all passing — 5 injected EPERMs absorbed in
40 ms; a sustained EPERM giving up at 2056 ms with the old file intact, the
errno preserved, the message explaining the lock and no litter; a non-lock
error failing in under 500 ms; an ordinary write unchanged; and a locked temp
file not stalling cleanup past its budget. The same assertions are now
`editor/tests/lifecycle-data-safety.test.cjs` → *"FsAtomic retries a rename
held by a sync client or scanner"*, still to be run under `npm test`.

## 2026-09-02 — Demo characters reduced: 100 Hz reached

The skinned characters were 70% of GPU time (see the timing note below) and
had no distance levels because `lods()` refuses skins. **They did not need
the decimator extended — the weld path already carries them.**

`GlbOptimizer`'s merge handles `JOINTS_0`/`WEIGHTS_0` verbatim (it always
did; the comment at the top of `mergeVertices` says so), so `optimize()`
reduces a skinned model safely. What was wrong is only the **preset**:
`aggressive` uses `meshCells: 700`, which on a character is far too fine —
it took Carol from 596,461 triangles to 592,621. A tenth of a percent.

Measured on Carol, skin and all 20 animations intact at every level
(`JOINTS_0`, `WEIGHTS_0`, `skins: 1`, `animations: 20` all present after):

| meshCells | triangles | reduction | size |
|---|---|---|---|
| original | 596,461 | — | 23.2 MB |
| 700 (`aggressive`) | 592,621 | 0.6% | 23.0 MB |
| 400 | 334,214 | 44% | 14.1 MB |
| **250** | **148,566** | **75%** | **7.6 MB** |
| 150 | 57,782 | 90% | 3.9 MB |

Applied at **250** to the Demo's three actors (Carol, Fleagus, Mascot):
1,447,281 -> 475,004 triangles, 58.2 MB -> 24.1 MB, 0.2 s each. **Originals
are kept beside each file as `<name>.glb.orig`** — restore by copying them
back over the `.glb`.

**Result on the Demo's start map**: triangles drawn a frame 2,215,438 ->
838,813, draw calls 90 -> 54, the 3D passes 5.89 -> 2.65 ms of GPU, and the
frame 16.6 -> 10.6 ms — **100 Hz, which is this display's ceiling**. The
in-game counter read 104. The character reads correctly at gameplay
distance; a close inspection of faces and hands is still owed, since a weld
grid distorts UVs where it merges and that is where it would show.

**Why this is safe here specifically**: `lightGlsl` has no N·L term, so
normals never reach the image (see the open-threads note). A weld grid's
usual cost — shading breaking up over the merged surface — cannot appear.
Only silhouette and UV distortion matter. **That stops being true the moment
anything reads a normal**, so revisit this if the shader gains real lighting.

**Superseded the same day — the weld punched the model full of pinholes.**
See the next section. The reduction is now done by edge collapse and the
`.glb` files have been rebuilt from their `.orig` backups.

## 2026-09-02 — The pinholes, and why both reducers made them

Reported from play: the reduced characters looked right but had "little pin
holes punched through the model throughout". They were real and they were
everywhere. Counting **boundary edges** — an edge used by exactly one
triangle, after welding by exact position so UV splits cannot masquerade as
holes — puts a number on it:

| Carol | triangles | boundary edges | open |
|---|---|---|---|
| original | 596,461 | **216** | 0.02% |
| weld, 400 cells | 334,214 | 51,224 | 9.7% |
| weld, 250 cells (shipped) | 148,566 | **42,355** | **17.4%** |
| weld, 150 cells | 57,782 | 23,213 | 23.9% |

A finer grid does not help, so this was never a tuning problem. Swapping in
quadric edge collapse did not help either — 43,533 boundary edges at the same
triangle count — which killed the assumption that a collapse preserves
topology by construction and forced the real question.

**The cause is the source mesh, not the reducer.** Carol has 347,910 vertices
but only 298,269 distinct positions: **14.3% are duplicates**, one per side of
every UV seam, so each island can carry its own texture coordinate. In index
space the mesh therefore reads as **96,420 boundary edges** where in position
space there are **216**. Both reducers work on indices, so both see a surface
already torn into islands, and both let the two copies of a seam vertex
collapse in different directions. The seam opens. Every seam, everywhere —
which is exactly what a scatter of pinholes across a whole model looks like.

**The fix is to pin the seams.** `seamVertices()` in `GlbOptimizer` flags every
vertex sharing its position with another; `QuadricDecimator.decimate` takes
that as `mesh.locked` and will never remove or move a flagged vertex — an edge
with one pinned end folds the free end into the pinned one, and an edge with
two is refused outright. The rest of the mesh reduces around a fixed seam
network instead of tearing away from it. Result at the same 75%:

| Carol | triangles | boundary edges | open |
|---|---|---|---|
| original | 596,461 | 216 | 0.02% |
| **collapse, seams pinned** | **149,114** | **185** | **0.08%** |

Below the original, because the collapse also closes pre-existing slivers.

Applied to all three actors, rebuilt from `.orig`: Carol 596,461 -> 149,114
(216 -> 185 open), Fleagus 595,341 -> 148,835 (423 -> 249), Mascot 255,479 ->
63,870 (113 -> 26). 58.2 MB -> 22.6 MB. Verified in the running game: all four
skinned meshes load at the reduced counts with `skinIndex`/`skinWeight`
present, 24 bones each, all four animating, 96 FPS on the 100 Hz panel.

**Two things came with it.** `QuadricDecimator` now carries `JOINTS_0` and
`WEIGHTS_0` through a collapse, taken whole from the surviving endpoint and
never blended — a joint channel is a bone index, so the average of bones 3 and
9 is bone 6, an unrelated bone that would fling the vertex across the model.
Verified: no joint index out of range, no accessor desynced from `POSITION`.
And `optimize()` now prefers the collapse: `meshRatio` (0.6 on `optimize`,
0.25 on `aggressive`) is the share of triangles to keep, with `meshCells`
demoted to the fallback for primitives the collapse refuses. Because skins are
no longer a barrier, `lods()` could now build real distance levels for
characters instead of one flat reduction.

**The cost of pinning**: seams cannot be removed, so they put a floor under the
reduction. Carol stops at 105,938 triangles (82%) however hard she is pushed;
a run that misses its budget says so in the notes as `seam-limited`. The floor
is well past where these models need to go.

Pinning holds a vertex against being collapsed away. It cannot save one whose
surrounding triangles have all gone, so at a near-total reduction (an
18-triangle test grid cut to 6) a seam vertex can still be orphaned. Open
edges never rise, so this is not a tear — but it is why the test fixture asks
for a real reduction rather than the deepest the grid will take.

## 2026-09-02 — The optimizer reaches models already in a project

Importing was the only way in, which is no use for the models people actually
accumulate: copied into `3d/` by hand, taken from an asset pack, or imported
before the optimizer could reduce a mesh at all. **Optimize**, beside the model
list in the 3D database, runs the same choices over the selected model in
place (`Database3DEditor.optimizeSelectedModel`).

`UIManager.showModelOptimizeDialog` now takes `title`, `confirmLabel`,
`keepLabel` and `keepDetail`, defaulting to the import wording, so both callers
share one dialog. Its descriptions were also wrong after the change above -
they still promised a vertex weld.

Care taken, because this writes over a file the user already has: the original
is copied to `<name>.glb.orig` once and never overwritten by a second run;
distance levels are rebuilt from the new geometry with the stale ones deleted
and the sidecar's `lods` rewritten, since levels cut from the old mesh would
snap a prop back to its old shape as it recedes; and `_templates`,
`RREventPreviewModels` and the map's 3D view are all dropped, or the editor
keeps drawing the geometry it loaded at startup. Declining writes nothing.

## 2026-09-02 — Distance-level FILES are off; the cost panel; the Demo's props

**Level files are no longer written on import** (`buildLods: false` on both
presets, gated in `ResourceManager`). The owner's objection is the right one: a
level is another whole copy of the geometry beside the model, so the approach
grows a project faster than the reduction shrinks it, and every copy ships. Now
that the collapse reduces a mesh properly, reducing the base model is the
cheaper trade — nothing extra on disk, and it applies at every distance.
`lods()`, `lodsAsync`, `model-lods.cjs` and the runtime's level swapping are all
untouched, so turning `buildLods` back on restores the old behaviour exactly.

**Still open — the owner's own suggestion, and it is the right shape**: let a
level be *how the runtime interprets the model it already has* at a distance,
rather than another file. The runtime half already exists (`pickLod` swaps
geometry by distance); only the source of the levels would change, from files
to something derived in memory. The one hard constraint is cost: the decimator
takes 17-26 s on a 1.9M-triangle mesh and about 5 s at 600k, so this cannot
happen synchronously while a map loads. The shape that works is to derive
levels in the existing worker *after* the map is up, and cache them per machine
(keyed on the file's mtime, beside the thumbnail cache) so it is paid once and
never ships. Worth confirming the cache location before building it.

**A cost panel in the 3D database** (`modelStats` / `renderModelStats`). Read
off the file with `analyze`, cached on size+mtime. `analyze` gained
`primitives`, `meshes`, `materials`, `animations`, `skinned` and `bones` -
draw calls and rigs are half of why a model is expensive and it reported
neither. The notes matter more than the numbers: they name the *cause*
(posed every frame, no reduction, texture weight, draw calls) rather than
leaving someone to infer it from a triangle count.

**The Demo's props, reduced.** The panel immediately found them: the tower at
1,895,089 triangles / 54.2 MB and the computer at 1,887,267 / 53.6 MB, the
computer placed three times. Both are raw generator exports and neither was
ever watertight - the tower has **64,446 open edges before anything touches
it**, so the boundary-edge metric reads as a *relative* check on these, not an
absolute one. Reduction only lowers it (56,607 at a quarter, 45,039 at a tenth).

| tower | triangles | size | open edges |
|---|---|---|---|
| original | 1,895,089 | 54.2 MB | 64,446 |
| 0.25 | 473,771 | 16.3 MB | 56,607 |
| **0.10 (applied)** | **189,509** | **8.5 MB** | 45,039 |
| 0.05 | 129,248 (seam-limited) | 6.8 MB | 36,287 |

Applied at a tenth to both, textures recapped on the rest: **4,031,130 ->
627,009 triangles and 142.6 -> 45.4 MB** across the Demo's models. Verified in
the running game: the scene draws 189,509 and 3x188,726 for the props, 98 FPS,
and a screenshot of the console at 90% reduction shows crisp panel edges and no
faceting.

**One model refused: `kawashaki_ninja_h2`** (226,754 triangles, 35 draw calls).
Every primitive came back `mesh attributes share buffer views; geometry left
alone` - `decimatePrimitive` bails when an accessor's buffer view is shared,
because rewriting one primitive's attributes would corrupt its neighbours.
Splitting shared views before reducing is the fix and would unlock a whole
class of exports; nothing else in the Demo is affected.

**On the `.orig` files.** They are working copies, not archives: the owner
clears them once a result has been checked, and did. Git history is the way
back to an original. Worth remembering when describing the Optimize action as
reversible — say *git*, because the sibling file is not meant to live long, and
leaving it there spends the download budget the reduction just freed.

## 2026-09-02 — Crack repair, and the reduction floor it exposes

Reported from play: holes and waviness in the reduced props. Both are real and
both come from the same place — **those props were never watertight**. The
tower arrives with 64,446 open edges. The seam pin only protects vertices at
*exactly* the same position, so pre-existing cracks were not pinned, and a 90%
cut widened them.

`weldNearby` closes them: near-coincident vertices are snapped onto one
position before reducing. Positions move, nothing merges, so every vertex keeps
its own UV and skin weights and no texture seam smears. The repaired join is
then exactly coincident, so the seam pin holds it shut through the reduction.
An integer spatial hash, not string keys — the first cut took minutes on a
million vertices; it now runs in **4.6 s**.

Tolerance, measured on the tower (fraction of the model's largest dimension):

| tolerance | vertices moved | open edges (from 64,446) |
|---|---|---|
| 0.0002 | 3,875 | 59,524 |
| **0.0005 (default)** | 77,941 (8%) | **18,441** |
| 0.001 | 378,151 (38%) | 4,965 |
| 0.002 | 616,167 (61%) | 2,290 |

Past about 0.0005 the tolerance reaches the model's own triangle size, so it
stops closing cracks and starts flattening detail — the mistake the weld grid
used to make. Hence the default.

**The catch, and it is the next thing to fix.** Repair creates ~80,000 newly
coincident vertices, the pin refuses to remove any of them, and the mesh hits a
wall: the tower comes out at **506,341 triangles at 0.15, 0.10 and 0.05 alike**
— the same number, seam-limited every time. Repair on, holes close (64,446 ->
14,981) but the floor is 506k. Repair off, it reaches 189k but cracks widen to
45,039. Neither is right.

**The fix is to stop pinning and start locking.** A pin says "never remove this
vertex", which is far stronger than what is needed. What is actually needed is
"the copies of this point move together": collapse coincident duplicates as a
unit, redirecting each split of the removed vertex to the split of the survivor
with the nearest UV. The seam then simplifies without separating, and the floor
goes away. This is what meshoptimizer does and it is the honest version of the
whole feature — the pin was the cheap approximation. It is real surgery on
`decimate`'s bookkeeping: triangles stay in split space, quadrics and collapse
decisions move to welded space, and each welded vertex keeps the list of its
splits.

Current state on disk: every model rebuilt from `.orig` at 0.25 with repair on.
**5,478,411 -> 1,605,120 triangles, 200.8 -> 84.8 MB.** The two props are
506,341 and 488,186, which is a heavier frame than the 189k version that
measured 98 FPS — that earlier version had the holes.

`kawashaki_ninja_h2` still refuses entirely (35 primitives, all
`mesh attributes share buffer views`). Splitting shared views before reducing
would unlock it and every export shaped like it.

## 2026-09-02 — Carved parts: the bug, and re-deriving them

Reported from play: a monitor arm on the wall showing "one copy that stays in
place, and another duplicate copy moves right through it". Not a duplicate at
all — **a bug this session introduced.**

A carved part is stored in `model.json` as *positional triangle runs* into the
primitive's own triangle list: `parts[0].meshes["0"] = [[0,13],[19,4],…]`, 1,378
runs indexing triangles 0–14,443. `reorderForCache` (Tipsify) reorders that
list, so every run then names a different triangle. The piece that animates
became a scattered wrong set swinging through the model while the real monitor
stood still. `carveModelParts` splits a part into its own mesh, which is why
the scene showed `9,945 ×8` and `4,502 ×8` — 9,945 + 4,502 = 14,447, one arm.

Note this only bites a model that **already has parts**, so importing is safe
(nothing is carved yet). It is re-optimizing in place that is dangerous, which
is exactly what the new Optimize action does.

Three Demo models carry parts: `Map-Objects/RPGReactor-MonitorArm`,
`Vehicles/Oth97_CNO_Consul`, `Enemies/monster-plant`. The first two were
rebuilt with `cacheOrder` off and verified **byte-for-byte identical index
buffers** against the originals their parts were carved against; the Consul
kept its 17.6 -> 11.4 MB texture win.

**The fix is not to refuse.** An index is only how a part is written down — a
part is a *region of the surface*, and the region survives a reduction even
though the indices do not. `RRGlbOptimizer.remapParts(originalBytes,
resultBytes, parts)` re-derives it: every surviving triangle takes the
membership of the original triangle nearest its centre (spatial hash, widening
ring search), and the memberships are written back as fresh `[start, count]`
runs. The boundary can shift by a triangle, which is the tolerance the
reduction already applies to the silhouette. It returns null rather than guess
when the two models cannot be paired, or when a part would come back empty —
the caller then falls back to the passes that leave the triangle list alone.

**UNVERIFIED — do this first.** The remapper compiles and is wired in, but the
end-to-end run against the monitor arm timed out on the Windows box and the
cause is not yet known (a 14k-triangle model should take about a second, so
either the ring search or the harness is at fault). Two Node tests were written
to settle it and **have never been executed** — this box has no Node:
  - *a carved part is re-derived across a reduction, not lost* — builds a plane
    whose first half of triangles is exactly its left half, reduces to 0.3,
    remaps, and asserts the part stays on its own half and keeps its share.
  - *remapping refuses rather than guessing when the models cannot be paired*.

Run `npm test` before trusting `remapParts`. If the first test fails or hangs,
the ring search in `remapParts` is the place to look.

## 2026-09-02 — Harness note: what actually costs the ten minutes

The measurement scaffolding, not the optimizer. `openEdges` in the scratchpad
builds a string key per vertex *and* per edge — about 5.7M string allocations
on a 1.9M-triangle prop, called before and after every run. Launch-and-settle
adds another 15-25 s, and the two 54 MB props parse slowly. The real work is
small beside it: 17-38 s to reduce a 1.9M mesh, 4.6 s to weld it. Anyone
picking this up should port `openEdges` to the integer spatial hash
`weldNearby` uses before running another sweep.

## 2026-09-02 — A carried light follows the model, not the facing

Reported from play: the player's torch "looks like a flashlight at the foot of
the actor and stays fixed in direction". Two separate things, and the second
was the real one. `nativeLights` read `facingYaw(carrier.direction())` - one of
four discrete headings, changing in a single frame - while the mesh eases
between headings at `MODEL_TURN_SPEED` over about a quarter second. The light
and the character it belonged to were turning by different rules.

Whichever path draws the model (the 3D scene's `holder.smoothYaw`, or the
billboard path's `state.smoothYaw`) now calls `Reactor3D.noteModelFacing`, and
`carrierFacingYaw` reads that back for the light. Two details worth keeping:
the model spec's own yaw is an art correction for a model authored facing the
wrong way, so it comes back off before the light sees it; and a reading older
than `CARRIER_FACING_STALE_FRAMES` is refused, so a model that stopped updating
cannot pin a light to a heading its owner left long ago. A character drawn as a
sprite has no model heading and keeps the discrete facing.

Measured: a 180° turn sweeps the light from -90° to +90° over 31 frames in
steps of 5.73°, which is exactly `MODEL_TURN_SPEED` in degrees. The light's
yaw equals the model's at every sampled frame.

**Harness note**: none of this needed Node. `nwjs-win\nw.exe` pointed at a
throwaway app directory runs the editor's own `GlbOptimizer` with `require
('fs')` available, driven over CDP. The app's scripts must be **copied into
that directory** — an NW app runs on an extension origin and silently
refuses `file:///` scripts from outside it ("error loading extension").

## 2026-09-02 — Skinned frustum culling REVERTED (runtime 20260902.6)

Owner: "the main actors disappear when they should still be in the camera's
view." That is the culling switched on earlier the same day in
`presetSkinnedBounds`, and it is now off again.

**Why it cannot work that way.** The sphere it tested is the REST pose in
the geometry's own space, and a glTF skin puts its vertices wherever the
bones say — through inverse binds, an armature scale, and the identity bind
this loader deliberately uses (see `applyRestSkins`, and the note in
`buildAnimatedGlbTemplate` about an armature's 0.01 scale hiding inside the
inverse binds). `Frustum.intersectsObject` transforms that sphere by the
mesh's own `matrixWorld`, which for a skinned mesh is the node's transform
and **not where the skin ends up**. The test was being made against the
wrong place, so `SKINNED_BOUNDS_MARGIN` only made the failure rarer and
harder to reproduce — which is exactly how it slipped through: a check that
counted draws per frame showed the meshes drawing 1/frame and one correctly
skipped, and that was read as working.

`presetSkinnedBounds` still computes the sphere, which three wants for depth
sorting and which is why the function exists (`SkinnedMesh.
computeBoundingSphere` skins every vertex on the CPU — a third of a second
for a 600k-vertex character).

**Worth redoing correctly**, because the number was real: 137 -> 90 draw
calls, 2.53M -> 2.22M triangles. The right shape is a WORLD-space sphere
built from what the instance is actually doing — its placed position and
`instanceSpan` — tested in `syncCharacterModels`, where both are already
known, rather than handed to three per mesh. Same idea as the light cull,
same accessor (`Reactor3D.sphereInView`). The failure mode is a character
who is not there, so it wants a visual check across a walk, not a draw count.

## 2026-09-02 — Single-face spot shadows: measured, NOT worth building

Listed on 2026-09-02 as the next win on the reasoning that a 45-degree cone
is drawn into all six faces of a cube. **Measured afterwards, and the
premise is wrong** — do not build this.

With GPU timer queries at a light-rich viewpoint (24,45, facing the lit
wall, 8.8 lights in view, 2 shadow slots busy):

| | GPU ms/frame | statics rendered | dynamics rendered |
|---|---|---|---|
| shadows on | 15.06 | **0** | **0** |
| shadows off | 13.48 | — | — |

Shadows cost **1.58 ms while rendering no shadow maps at all**. The caching
added on 2026-09-01/02 means the maps are drawn once and held; per frame the
render cost really is zero. The 1.58 ms is **per-pixel sampling** in the lit
fragment shader — a `samplerCubeShadow` lookup per casting light per lit
fragment — and a single-face spot map costs exactly the same to sample.

So the change would add a second sampler kind and a second shader path (the
thing `_makeLight`'s comment deliberately avoided: "spots use a cube too —
one sampler kind, one code path") to optimise a number that is already 0.
The only way it pays is a scene that re-renders shadow maps constantly,
which is the thing to fix directly if it ever shows up.

**What the same measurement does say.** At that viewpoint the frame is
13.5 ms with shadows off and ~4.2 ms at a viewpoint with one light in view,
for the same geometry — roughly **1.1 ms per visible light per frame** at
1280x720. Every lit fragment runs the full loop over every uploaded light,
when most surfaces are within reach of one or two. **Per-object light lists
are the remaining lossless win and are worth several times what single-face
shadows would have been.** The obstacle is that `lightUniforms()` is one
shared uniform block bound to every lit program; per-object lists need the
list packed per draw (a mesh `onBeforeRender` rewriting the shared arrays
and `rrLightCount`, or per-material uniform objects). That is a real change
to the lighting path and wants the test suite.

## 2026-09-02 — Frustum-culled lights: 12.7 → 4.2 ms GPU (runtime 20260902.4)

Owner asked for more speed with **no perceived loss in quality**, which
rules out decimation and compressed textures and leaves only waste. This is
waste: `syncVolumeLights` uploaded every light on the map and every lit
fragment looped over all of them. **Nine of the Demo's ten lights are off
screen at any moment** (measured: `uploaded 10, inView 1`, every sample).

A light whose sphere of reach does not intersect the view frustum cannot
light any visible fragment — every visible fragment is inside the frustum by
definition — so skipping it is *identical output*, not a setting. Its
glowing body sits at the same place and is skipped with it.

- `Reactor3D.viewFrustum()` / `sphereInView(x, y, z, r)`, rebuilt at most
  once a frame; `syncVolumeLights` `continue`s on a miss, before the light
  takes a uniform slot, a body or a shadow candidate.
- **`Reactor3D.activeCamera()` is the camera accessor everything culling
  must use.** It returns `Reactor3D.cullCamera` first, then the viewport's.
  `MapEditor3D.render` sets `cullCamera` on every frame. Reaching straight
  for `Reactor3D.viewport()` is now the **third** bug of exactly this shape
  in one day (GPU tier, LOD screen, this) — the editor loads
  `reactor_3d.js` alone, so it has no `Graphics` and no `Viewport`.

**Result**: lights uploaded 10 → 1; 3D passes **12.7 → 4.2 ms GPU a frame**;
wall 15.6 ms / 62 Hz → 11.2 ms / 96 Hz. Verified identical by pixel-sampling
four regions with culling on and off — 24.70 / 22.33 / 21.11 / 12.44 in both.
(PNG hashes still differ: the map's lights flicker, so no two captures
seconds apart are byte-identical. Sample regions, not hashes.)

This also changes what lighting *costs a project*. The old shape was "every
light on the map, every frame, for ever"; the new one is "the lights that
can reach the screen", so a corridor of fifty lamps costs the few near the
player. `SHADER_LIGHTS` remains the ceiling on simultaneous visible lights.

## 2026-09-02 — GPU timer queries: where the frame actually goes

Owner reported the GPU pinned at 95% and asked what else can be squeezed.
Everything below is **`EXT_disjoint_timer_query_webgl2`**, not wall clock,
on the Demo's start map at 1280x720 standing among the props.

**Read this before trusting any GPU timing here.** WebGL2 allows exactly
**one `TIME_ELAPSED` query open at a time**, and the shadow flush runs
*nested inside* `renderInto` (the sentinel's `onBeforeRender`). A naive
per-stage wrapper therefore nests queries, which fails silently and returns
nonsense — the first run reported the whole 3D pass at **0.27 ms** when it
is really **12.6**. Gate every query on an `open` flag and rotate which
stage is measured across frames.

**Where the frame goes.**

| stage | GPU ms / frame |
|---|---|
| `below:world` pass | **12.6** |
| `above:overlay` pass | **0.009** (1 mesh, 0 triangles — already free) |
| PIXI's own render | 0.9 |

And inside that world pass, by switching features off:

| configuration | GPU ms | wall Hz |
|---|---|---|
| everything | 12.7 | 62 |
| no shadows | 9.6 | 78 |
| no shadows, no lights | 7.7 | 93 |

**The finding that matters, and it reverses an earlier conclusion.** Blank
the geometry properly — swap in an empty `BufferGeometry`, which `setPass`
cannot undo, unlike setting `visible = false`, which it restores — and:

| blanked | triangles removed | GPU ms | wall Hz |
|---|---|---|---|
| nothing | — | 13.2 | 59 |
| **the 4 skinned characters** | 1,702,760 | **4.0** | **100** |
| every mesh over 50k | 2,517,078 | 2.2 | 100 |
| all geometry | 2,831,693 | 0.13 | 100 |

**The four skinned character models are ~70% of all GPU time.** Removing
them alone reaches the display's own ceiling. The 2026-09-02 note above says
"we are fill-bound, hiding geometry saves nothing" — **that was wrong**, and
wrong for a specific reason: the test hid them via `visible = false`, which
`setPass` puts back before the pass draws. This is a **vertex/geometry**
bound frame, which is also why dropping `renderScale` barely moved it.

The models: 4 skinned meshes, 24 bones each, ~1.0M vertices, `position /
normal / uv / skinIndex / skinWeight`, and — worth noting —
`MeshBasicMaterial`, so they are not even taking the light shader. The cost
is vertex transform plus skinning, paid again in every shadow map they enter.

**So the single highest-value work left is skinned-mesh decimation**, and it
is now measured rather than assumed: worth roughly **9 ms a frame, 59 Hz to
100**. `lods()` refuses skins up front and `QuadricDecimator` leaves them
alone because JOINTS/WEIGHTS read as an extra attribute. The extension is
contained — carry `skinIndex`/`skinWeight` from the surviving endpoint
through a collapse, exactly as UVs already are — but it is **offline work
that needs Node**, and it must be verified on an animated model before it
ships: a collapse that mixes weights across a joint boundary tears a mesh
only once it moves. Do not blind-ship it.

**WebGPU: measured answer, still parked.** It would not help this. The frame
is vertex-bound on ~1.0M skinned vertices; WebGPU runs the same shading on
the same silicon and saves *driver* overhead, and the CPU here is already
~55% idle. Worse, the interop question has a hard answer: a canvas has one
context type, WebGL and WebGPU **cannot share textures or buffers**, and
this engine's whole design is three rendering into PIXI's *same* GL context
(`useSharedContext`, `_initializeShared` passing `context: pixi.gl`). PIXI's
WebGPU renderer and three's `WebGPURenderer` each create and own their own
`GPUDevice`, so a mixed frame would need a CPU round-trip per frame — the
very pattern that costs 7 ms in the anchored-effect path. The eventual
WebGPU argument is compute (skinning once into a cached buffer, GPU culling,
clustered lights), not raster; most of that is reachable in WebGL2 first.

## 2026-09-02 — LOD thrash, walking spikes, the editor's missing view (runtime 20260902.3)

Owner: "still getting lag spikes while walking around, also it seems a bit
worse in the editor than in the gameplay", on a **100 Hz** Dell.

**First, a measurement correction that reframes everything before it.** The
earlier passes treated ~16.6 ms as the floor because that is what an empty
rAF loop returned — on a 60 Hz panel. On the Dell an empty loop returns
**10.0 ms / 97.8 Hz**, so "we reached 60, done" was measuring against a
ceiling that no longer exists. `Win32_VideoController` still reports 60
(that is the internal laptop panel), so ask the browser, not Windows.
Walking measured 19.0 ms / 41.8 Hz against a 10 ms floor.

- **The LOD rule oscillated, and every swap re-rendered all static
  shadows.** `staticRendersPerFrame` was **2 on a still camera** — the
  cache that the 2026-09-01 work exists to maintain was being invalidated
  every frame. Cause: the budget hysteresis added on 2026-09-02 was
  asymmetric. It gave a finer level extra allowance *only while that level
  was not selected* (`current > i`), so level 1 fitted, was chosen, then
  stopped fitting and was dropped — **123 swaps in 40 frames, nothing
  moving**. `_lodSwaps` is in the static shadow hash, so each swap
  re-rendered every prop into both cube maps. Fixed by measuring both
  directions against the same current level: refining below it must clear
  `1 / LOD_BUDGET_HYSTERESIS`, holding or coarsening uses the plain budget.
  123 swaps → 2; static renders → 0.
- **The editor never applied the budget at all.** `pickLod` read its camera
  and target size from `Reactor3D.viewport()`, and the editor's map view has
  none — it builds its own `THREE.WebGLRenderer` and camera in
  `MapEditor3D`. So the factor came back 0, the screen-coverage half of the
  rule was skipped, and only the distance half applied — which, as the
  2026-09-01 note says, can never coarsen a large model on a small map. The
  editor was drawing every prop at full detail, ~7.5M triangles, beside a
  game drawing 2.2M. **That is the "worse in the editor" report.**
  `Reactor3D.lodScreen(camera, w, h)` now builds the pair from any camera,
  `pickLod` takes it as a fifth argument, and `pickPropLods` computes it
  once per frame from its own renderer. Same shape of bug as the GPU tier
  earlier the same day: **the editor loads `reactor_3d.js` alone, so
  anything that reaches for `Graphics` or `Reactor3D.viewport()` is silently
  wrong there.**
- **The learning cadence for an effect's reach was the other walking
  spike.** Settling takes `MEASURE_HISTORY` looks at one per
  `MEASURE_EVERY` frames — thirty looks ten frames apart, i.e. a readback
  every tenth frame for three hundred frames, and a readback is 30-70 ms
  here. Seven of nine spikes in a 600-frame walk were this.
  `MEASURE_EVERY_WEAK = 30` and `MEASURE_HISTORY_WEAK = 8` on a weak GPU:
  eight looks over 240 frames instead of thirty over 300.

**Result.** Walking **19.0 → 13.0 ms (41.8 → 59.2 Hz)**; the tour now reads
**up to 77 fps (engine counter 82)** with a mean of 61.5, which is the first
time anything here has gone past 60 — because 60 was never the ceiling, the
panel was.

**Remaining, in order.** Dynamic shadow re-renders while moving are now the
largest spike source (35 of 51 in a 600-frame walk): a moving character must
redraw its map, but **a spot light is drawn into a full cube — six faces
where a 45-degree cone needs one**. Giving spots a single-face shadow is the
next real win and is the reason the code comment says "one sampler kind, one
code path". After that, per-object light culling as noted on 2026-09-01.

**Harness trap, do not chase it.** Every walk run reports a ~2030 ms max
frame. That is the harness: `last = performance.now()` is set at script
evaluation and the first tick runs after a 2000 ms settle, so the first
delta swallows the wait. The real worst frame is ~66 ms. Fix the probe
before believing any "first frame" stall.

## 2026-09-02 — Carried lights: facing and body (runtime 20260902.2)

Owner: "I see what looks like a flashlight at the foot of the actor and
stays fixed in direction no matter what direction they're walking in, looks
defective." Two separate faults behind one symptom, both in the native
light path, plus Demo content authored around them.

- **Attachment moved a light and stopped there.** `nativeLights` resolved
  `attach` for position only (`x += carrier._realX + 0.5`) and passed `yaw`
  straight through, so a spot riding the player kept its authored compass
  bearing for ever. Now an attached **cone** adds `facingYaw(carrier
  .direction())` to its authored yaw, which becomes an offset (90 = held
  out to the left). `followFacing: false` restores a fixed bearing. Points
  are untouched — no direction to get wrong — and so are unattached spots,
  which is the regression to watch: the Demo's `door-beam` must stay at
  -180 through every player facing, and that is the control in the check
  below.
- **Every light drew a glowing body, including carried ones.** Right for a
  lamp on a wall, wrong for a torch: it renders as a bright blob at the
  carrier's feet, which is literally what was reported. New `body` flag,
  defaulting to **false when the light is attached** and true otherwise;
  `bodies.place` is now indexed by its own `bodyCount` so the pool stays
  packed when a light opts out, and `bodies.trim(bodyCount)`.
- **Demo content** (`template/Demo/data/Map001.r3d.json`, the `torch`
  light) was authored against the broken behaviour: `height` absent (so
  level with the floor), `yaw: 180`, and an intensity picked when the cone
  lit almost nothing. Now `height: 1.2, pitch: -30, yaw: 0, radius: 5,
  angle: 45, intensity: 0.9` — a pool on the ground ahead of the player.

**Verifying this is harder than it looks; three attempts were wrong.**
`$gamePlayer.setDirection(d)` does **not** stick — the third-person camera
drives facing and puts it back, so the first A/B compared two identical
frames. `setDirectionFix(true)` after setting it does stick. Synthetic
`Input._currentState[key] = true` does not move the player either, because
`Input.update()` rebuilds the state from real key events each frame. And
reading `rrLightAim` in the same call that sets the direction reads **one
frame stale** — the uniforms are written by the next `syncVolumeLights`, so
every reading looked like it lagged a step until that was accounted for.
The reliable check is: lock the facing, wait several frames, screenshot,
and **pixel-sample regions around the player** (`sample.ps1` in the session
scratchpad) rather than eyeballing a dark image — facing east must brighten
the east region and west the west, with `door-beam` unmoved throughout.

**Cost.** Measured directly by setting the torch's intensity to 0 and back
at the same spot: ~1 ms a frame, which is what a torch that actually lights
something costs. A 58 → 51 swing seen across runs that day was **not** this
— with the torch fully off the frame measured the same 19 ms — it is
run-to-run drift on a thermally limited laptop after hours of sustained 3D.
Worth remembering before attributing a few frames to the last edit.

## 2026-09-02 — Potato-PC pass: 2.4 → 59 fps (runtime 20260902.1)

Owner reported 3 fps in-game on their own laptop — a Ryzen 5 PRO 5650U with
integrated Radeon (Vega), 15 GB, 1920x1080. Reproduced at 2.4 fps and taken
to **58-60 fps at all seven sampled positions** on the Demo's start map
(median 16.6 ms, p95 18 ms, worst spot 58.1). Nothing disabled; the same
viewpoint as the original 3 fps capture renders identically. Seven faults,
all of them invisible on the hardware this was developed on.

**How it was measured, since there is no harness in the repo for this.**
No Node and no Git on that machine (see *Environment* below), so: launch
`nwjs-win\nw.exe template\Demo` with `--remote-debugging-port=9222
--remote-allow-origins=*` plus the three backgrounding flags, and drive it
over CDP from a PowerShell `ClientWebSocket`. `nwjc.exe in.js out.bin` is a
real compile check for runtime files (exit 0 = parses; its V8 log on stderr
is not an error). Two PowerShell 5.1 traps cost an hour: piping a string to
`ConvertTo-Json` wraps it in `{"value":...,"Length":...}` (use
`-InputObject`), and `New-Object System.ArraySegment[byte] -ArgumentList
@(,$b)` hangs where `[System.ArraySegment[byte]]::new($b,0,$b.Length)` works.
The `isGameActive` stale-frame trap recorded in the shadow-map section below
bit again immediately — force it true or every number is from a frozen game.

**The faults.**
- **`weakGpuPattern` had no AMD in it** (`reactor_core.js`). Intel, Mali,
  Adreno, PowerVR, SwiftShader, Mesa — and nothing for the second most
  common integrated family. `ANGLE (AMD, AMD Radeon(TM) Graphics ...)`
  matched none, so every Ryzen laptop, AMD handheld and desktop APU ran at
  `maxCanvasPixelRatio` 4, `renderTargetSamples` 4 and full shadow quality.
  New `weakAmdPattern` matches the APU naming (`Radeon(TM) Graphics`,
  `Vega n Graphics`, `AMD Custom GPU`, `Radeon(TM) R2-7`) and not discrete
  Radeons, which name a model instead of ending in "Graphics". Validated
  against 22 real renderer strings in-page before shipping.
- **The 3D scene rendered twice per displayed frame.** `SceneManager.update`
  runs `updateMain` up to twice when a frame runs long (stock MZ, capped at
  2 by `Math.min(deltaTime, 2)`), and `updateScene` reaches
  `Spriteset_Map.updateReactor3D`, which does the GPU passes. A slow frame
  bought two full scene renders, which made it slower, which kept it asking
  for two — a loop that only closes on weak hardware. `SceneManager.
  isFinalUpdateOfFrame()` (true outside the loop, so a plugin calling
  `updateMain` still draws) gates the whole of `updateReactor3D`; everything
  past its `state` guard is recomputed from current game state and
  accumulates nothing, so skipping a tick whose output is overwritten is
  free. Alone: 73 → 29 ms median. **Rule: logic per tick, pixels per frame.**
- **LOD never triggered.** `LOD_DISTANCES` ([4, 10]) multiplies the model's
  own size, so a 20-tile tower needed the camera 80 tiles out on a 50-tile
  map. Every instance sat at level 0 with levels built and unused: 7.5M
  triangles/frame. Added a screen-coverage rule beside the distance one
  (`LOD_TRIANGLES_PER_PIXEL = 1`) taking the coarser of the two. Two things
  learned the hard way: 0.5 is too aggressive (a screen-filling model went
  to 0.1 tri/covered-pixel, where silhouettes facet — the tower takes the
  quarter level at 1.0 and the small consoles are unaffected either way);
  and the covered-pixel figure **must be clamped to the pass's pixel count**
  (`_lodScreenPixels`), because a projected sphere grows without bound as
  the camera nears it and "covers several screens" made level 0 affordable
  again from a tile away.
- **Dynamic shadow maps redrew every frame with nothing moving, unbudgeted.**
  Statics were cached; characters were not. 1.93M triangles of casters into
  up to 4 cubes x 6 faces = 289 ms of a 392 ms frame, still. Now
  `_dynamicChanged()` hashes casting roots' `matrixWorld` **plus two bones
  per skinned root** — a character animating on the spot never moves its
  root, and hashing transforms alone would freeze its shadow, which is the
  exact artefact the dynamic map exists to prevent. `_budgetDynamic(focus)`
  picks nearest-the-eye first (not cheapest-first: the shadow a player looks
  for is the one under their own feet) to `quality.dynamicTriangles`, with
  `SHADOW_DYNAMIC_CEILING = 4` refusing even the nearest caster past 4x the
  budget — the Demo's 595k-triangle player is 3.6M a redraw and no shadow is
  worth that. Casters are held with hysteresis so walking past a lamp does
  not flicker a shadow on and off.
- **Skinned meshes had `frustumCulled = false`** (`presetSkinnedBounds`), on
  the note "One character is never worth frustum culling either" — true of a
  character built like one, false of a 596k-triangle export. Two 255k models
  22 and 28 tiles *behind* the camera were drawn in full every frame.
  Culling restored against the rest sphere x `SKINNED_BOUNDS_MARGIN` (2);
  three tests `object.boundingSphere` before the geometry's, so an animated
  pose has room and cannot pop out at the screen edge.
- **Anchored Effekseer effects cost a cross-context copy every frame.** The
  overlay is a second WebGL context, so its pixels reach three by going out
  to a 2D canvas and back up as a texture — 640x360 of that per frame, ~7 ms,
  for an effect that had not lit a pixel in 50 looks (`misses: 59`,
  `lastLit: 0`). `EMPTY_AFTER = 3`: an effect whose picture keeps coming
  back empty is skipped between looks, on exactly the cadence
  `shouldMeasure` already backs off to. For a genuinely visible effect the
  cost is the box, and it scales — 212k px = 49 fps, 111k = 55, 55k = 60,
  nothing below — so `BUDGET_WEAK = 0.06` on weak GPUs.
- **`measure`'s readback was the last thing breaking 60.** Over 400 frames
  there were exactly 4 slow frames and **all 4 were `measure`**, 31-42 ms
  each (zero from shadows, zero from LOD swaps, none unexplained). The code
  budgets ten, which is the discrete-card price. `SETTLED_EVERY_WEAK = 300`
  (x `MEASURE_EVERY` = every 3000 frames, ~50 s) once a reach has settled;
  it is already the widest of thirty looks. Also added `MEASURE_MISS_BACKOFF`
  — a track whose box comes back empty never settles, so without a backoff
  it paid the readback every 10 frames for ever.

**Two dead ends, both recorded in the code so they are not retried.**
Watching an empty effect cheaply *every* frame at 96 px measured **worse**
than the full-size copy (41 ms vs 24): the GPU **sync** is the cost, not the
pixels, so adding a sync per frame is strictly bad. Skip-and-recheck every 6
frames gave a 16 ms median with a 56 ms p95 — a stutter twice a second,
worse than a steady cost.

**Profiling lessons.** A synchronous readback shows up as the top CPU line
while really just absorbing the GPU backlog: `getImageData` was 38 % of the
profile and removing it moved the wait rather than removing it (`minMs` 26 →
349). Attribute GPU cost by toggling subsystems and comparing frame time.
Three of my own toggles were wrong and cost hours: `setPass()` re-shows
objects, so "hide the scene" was silently undone; "1/16 resolution saved
2 ms" correctly ruled out fill but I over-read it as ruling out geometry;
and run-to-run variance on this iGPU is ~40 %, which exceeded several
effects I tried to measure. **`renderer.info.render.triangles`, read inside
`renderInto`, is the number that settles it** — it should be the first thing
consulted, not the last (7.46M → 2.22M drawn, 137 → 90 calls).

**Sharpness, settled with the owner.** "Sharp but jaggy from lower
resolution looks better in 3d than blurring the fuck out of it when
enlarging the window for sure." Weak tier no longer clamps
`maxCanvasPixelRatio` to 1; it caps at `weakMaxCanvasPixelRatio` (2, so a 4K
panel cannot demand 9x the game's pixels) and drops `renderTargetSamples` to
0 instead. This is not a trade — at a 1904x993 window the blurred path
measured 55.8 ms against 47.9 native-with-none, because 720p x4 MSAA is
3.7M samples where native is 1.75M and the upscale adds a filter pass.

**Not done / next.** The four skinned characters are ~1.7M of the 2.2M
triangles still drawn, because `lods()` refuses skinned meshes so they have
no levels at all. It no longer costs frames (we are vsync-bound) but it is
the headroom for a busier map, a larger window or a weaker GPU. Extending
`QuadricDecimator` to carry JOINTS/WEIGHTS through a collapse — from the
surviving endpoint, exactly as UVs already are — is the next real win and
needs Node. Also untouched: the anchored-effect path could render into a
three render target in the shared context instead of copying between
contexts, which would remove that cost entirely rather than bounding it.

**Later the same day — the tier did not reach the editor.** Every cost above
that is settled by GPU class read `Graphics.gpuTier` directly, and
`MapEditor3D.loadLibraries` injects only `pako`, `three` and
`reactor_3d.js` — no `reactor_core.js`, so **there is no `Graphics` in the
editor at all** and every one of those checks took the full-power branch:
the map view ran four shadow slots at 512 with five taps on the same laptop
the game had just been tuned to two at 256. Now `Reactor3D.tier()` /
`isWeakGpu()` is what the 3D code asks (override → `Graphics.gpuTier` →
"full", so an unknown GPU stays sharp rather than being quietly demoted),
`Reactor3D.classifyGpu` / `rendererDescription` are the single reader and
classifier — `Graphics._sampleGpuTier` delegates to them, and `classifyGpu`
still honours `Graphics.weakGpuPattern` if a project replaced it — and
`MapEditor3D.reportGpuTier()` samples its own context after either renderer
is built and sets `gpuTierOverride`. **Anything added later that varies by
GPU class must go through `Reactor3D.tier()`, not `Graphics.gpuTier`, or it
will silently be wrong in the editor.**

Also fixed: `_lodScreenFactor` cached on `Graphics.frameCount`, which reads
as -1 for ever in the editor — the factor was computed once and never
followed a resized viewport or a changed fov. It is now keyed on the fov and
target size themselves, which both hosts have.

**Where the ceiling actually is.** At the game's own 1280x720 this map holds
60 everywhere. **Maximised to 1765x993 it holds 47-55**, and that is
fill, not geometry: at that size shadows measure ~2.9 ms, the light loop
~2.6 ms, and hiding every skinned character saves *nothing*. Dropping
`renderScale` recovers it (0.75 → 51-53, 0.5 → 56, 0.25 → 60) but that is
the upscale blur the owner explicitly rejected, so it was not taken. The
honest next win is **per-object or clustered light culling**: the shader
loops all ten of the map's lights for every pixel when most pixels are
reached by one or two, and it is worth ~2.6 ms at that resolution at no
cost in quality. It needs per-object light lists where the uniforms are
shared globals today, so it is a real piece of work rather than a knob.

**Verification status.** All five changed files compile under `nwjc`; the
game was driven through seven map positions, idle and moving, with the
engine's own F2 counter agreeing with independent rAF timing (56.4-60.8).
**`npm test` has NOT been run** — no Node on that machine. The
`SceneManager.update` change touches the core loop and the skinned-culling
change is the one most able to hide something that should be visible; both
want the suite before this is tagged.

Files: `runtime/reactor_core.js`, `reactor_3d.js`, `reactor_managers.js`,
`reactor_sprites.js`, `reactor_main.js` (revision stamp), plus
`editor/src/MapEditor3D.js` for the tier report.

**Before the suite runs, run `node editor/build-scripts/sync-runtime.cjs`.**
`runtime/` is the source of truth and every project under `template/` keeps
its own copy in `js/`; the Demo's was updated by hand here (it is tracked, so
those edits are wanted), but the nine local corpus projects — Star Shift x3,
Project2/3, MZ3D, Parallax, Hendrix, Barebones, ccv2 — are still on the old
runtime. `runtime-template-sync.test.cjs` checks **every** bundled project
present on the machine, not only the tracked Demo, so on the Linux box the
suite will fail on those nine until the sync is run. They are gitignored, so
this is a local-only step that never shows up in a diff.

## 2026-09-01 — Shadow maps (runtime 20260901.4)

Owner: "we do actually need shadows as well, should be based on the shape
of the 3d model... an option that doesn't cause too much performance
issues." `Reactor3D.Shadows` in reactor_3d.js, after `litMaterial`.
- **Maps.** three r185's own shadow pass (`renderer.shadowMap.render(
  lights, scene, camera)`) driven from OFF-SCENE `THREE.PointLight`s at
  intensity 0 (spots use a cube too — one sampler kind, one code path).
  r185 renders point shadows into a `WebGLCubeRenderTarget` with a
  `CubeDepthTexture` (compare mode) — sampled as `samplerCubeShadow` with
  hardware PCF; the compare depth is rebuilt from the major axis of the
  light-to-fragment vector exactly as three's `getPointShadow` does. Lit
  materials get a second program variant (`lightGlsl(true, taps)`, cache
  key `|shadowsN`) declaring `rrShadowMapK`/`rrShadowDynK` for
  `SHADOW_SLOTS = 4` plus `rrLightShadow[32]` (slot per light, -1 none)
  and `rrShadowInfo[4]` (near, far, dynOn, softness). No THREE light is
  ever in the scene, so no program's light counts change.
- **The pass must run INSIDE `renderer.render`.** `renderBufferDirect`
  reads `currentRenderState`, which is null outside a render — the first
  cut crashed the game with "Cannot read properties of null (reading
  'state')". `scene.onBeforeRender` fires BEFORE the state is set
  (three.js:77636 vs 77638); a mesh's `onBeforeRender` fires inside the
  draw loop with it set (the Reflector pattern). So: a zero-vertex
  "shadow-sentinel" mesh at renderOrder -1e9 on the scene root runs
  `_flush()` first in every pass; `render()` (called from
  `Viewport.renderPass` once a frame after `updateMatrixWorld`, and
  from `MapEditor3D.render` after `feed3D`) only decides and sets
  `_pending`. On activation the flush renders every slot's maps BEFORE
  `_active` flips and materials refresh — a shadow sampler bound to no
  depth texture is a draw-time INVALID_OPERATION in WebGL2.
- **Static / dynamic.** `markCaster(root, dynamic)`: meshes get
  `castShadow`, layer 1 (static) or 2 (dynamic), and a
  `customDistanceMaterial` with polygonOffset (2, 4) — without the slope
  offset a console a hand's width from its light shaded itself solid.
  three copies map/alphaTest/side onto the custom material per draw, so
  plain surfaces share one and alpha-tested billboards get their own
  (the map is part of the program). Probe `THREE.Camera`s with
  `layers.set(1|2)` are passed as the `camera` argument — that is what
  `renderObject` tests layers against. Static roots: props (event id ≥
  `PROP_EVENT_BASE` — NOT `isEventProp`, which is the claimed-tile set)
  and editor props/still previews; dynamic: event models, character
  billboards, animated editor previews. Static maps re-render on a
  transform hash over the static roots + `_lodSwaps` + `invalidate()`,
  drawn at the COARSEST level (`_atCoarsestLod`; pickLod now stamps
  `userData.lodKey` on instances). Dynamic maps render only when a
  dynamic root's sphere is within the slot's far.
- **Slots.** `syncVolumeLights` hands `setCandidates` every placed light
  with `shadow !== false` (id, loop index, world position, gap to focus);
  `assign()` keeps a chosen light in its slot. `farFor()` holds a far
  plane a little past the reach and only moves it when the reach leaves
  the band — flicker/pulse otherwise re-rendered the statics every frame
  (seen: `lastFrame.statics = 4` on a still scene). Quality by
  `Graphics.gpuTier`: full 4 slots / 512 / 5 Vogel taps, weak 2 / 256 / 1.
- **Schema.** Light `shadow` (default true) in readMapLights,
  MapLights.js, LightingManager (resolvedLights, feed3D — which now also
  carries `id`), panel flag `lit.shadow` "Casts shadows" (18 locales);
  sidecar `lighting.shadows === false` and `Reactor3D.SHADOWS = "off"`.
- **Verified** with `nw-game-profile.cjs --setup --shot` on the Demo (a
  `--setup` script may push lights into `$dataMap.reactor3d.lights`,
  reset `Reactor3D._nativeNorm = null`, `$gamePlayer.locate`, and
  `Reactor3D.Camera.change({mode:"fixed"}, 0)`): consoles throw their
  outlines across the floor, the tank hides the floor behind it, the
  player is shaded by the hull; 5.66 vs 5.55 ms/frame, dynamics 4/frame,
  statics 0/frame once cached. Slots go to the lights nearest the PLAYER,
  so a probe light far from the player gets none.
- Owner: "only seeing shadows on the walls, what about the floor?" The
  Demo rig's eight point lights have NO height (they were authored for
  the flat quads, which ignored it), so each sits in the floor plane and
  none reaches a prop; a floor-plane light's casters sit on the cube's
  equator and the floor compare comes out half-lit at best. Verified
  both renderers with a raised probe light beside a console (game:
  `--setup` on nw-game-profile; editor: nw-3d-profile on a copy of the
  Demo in /var/tmp/rr-scratch with the lock removed, `RRMapLights.add`
  + `feed3D()` + camera move): the console's outline lands on the floor
  in both. Tray presets now carry heights; the Demo rig is the owner's
  to lift (Height field, 1.5-3 tiles). Editor verification: fine.
  Owner: "a light on the floor would still cast a shadow from somebody
  walking over it" — yes, so `SHADOW_LIFT = 0.25`: the cube is rendered
  from `max(height, lift)` above where the light stands (candidate `y`,
  per-slot `rrShadowPos`; the shader measures `d` from it, the light term
  from the light) — the floor is then below the equator and a floor lamp
  streaks a passer-by across it.
- Owner: "I see the shadows on the characters, but nothing on the ground
  from the character's shape." Root cause after a long chase:
  `addParallaxGround` (a `!` parallax laid down as the map's ground —
  the Reactor Room's entire visible floor) set `__reactorShaded` but
  never called `litMaterial`, so that floor took only the ambient
  multiply: no light field, no shadow term, and the "pools" on it were
  the additive haze bodies. Shadows had only ever landed on painted
  tiles, room pieces and models. One line fixes it; the room now reads
  a good deal brighter under its lights (owner may want to re-tune
  ambient). Harness lessons that cost most of the chase, now baked in:
  MZ's `SceneManager.isGameActive()` (`window.top.document.hasFocus()`)
  gates `Scene.update` — an unfocused harness window keeps its frame
  counter running but updates nothing, and since the 3D passes render
  from `updateReactor3D`, every screenshot was a stale frame from the
  last moment the window had focus. `nw-game-profile.cjs` now forces
  `isGameActive = () => true` and passes Chromium's
  `disable-backgrounding-occluded-windows` / `-renderer-backgrounding` /
  `-background-timer-throttling` (both harnesses). The Demo's start map
  also runs an autorun intro (EV001) a few seconds in, with a fade and a
  reload that drops anything pushed into `$dataMap.reactor3d.lights`:
  a `--setup` should `eraseEvent` every trigger ≥ 3 page, clear the
  interpreter/fade, and hook `Reactor3D.readMapLights` rather than push.
  Pixel-sample screenshots (PIL) rather than eyeball dark floors; the
  in-page `canvas.toDataURL` is black (no preserveDrawingBuffer).
- Not done: the map's own sheet meshes and room walls do not cast (a
  wall still lets light through);
  in-shader tile billboards (foliage/upright cut-outs) cannot cast
  through three's depth pass (their vertex patch is not in it); no
  per-light shadow resolution or intensity; no game Options entry.

## 2026-09-01 — Quadric decimator, LOD worker, pointer BVH (editor-only)

- `editor/src/utils/QuadricDecimator.js` (`RRQuadricDecimator.decimate(
  {positions, normals, uvs, indices}, targetTriangles, {boundaryWeight})`):
  Garland–Heckbert with a typed-array lazy heap (entries carry both
  endpoints' version stamps; a collapse bumps both), boundary/seam planes
  (an edge with one face; seams are boundaries on both islands because
  their vertices are split) at weight 100, optimal point via the 3x3
  solve trusted only within 1.5 edge lengths of the midpoint, flip test
  (face normal dot < 0.2 → refuse), refused edges RE-PUSHED at a rising
  penalty (without that the queue drained at 573k of 1.9M tris however
  low the target), UVs from the nearer endpoint, normals averaged. 13.4 s
  for 1.9M → 25%, and lod2 is built FROM lod1 (3 s) — `lods()` chains
  `current = built`. Skinned meshes untouched (JOINTS/WEIGHTS = extra
  attribute → left alone → weld fallback... which also skips them; and
  `lods()` refuses skins/animations up front anyway).
- `lods()` now `decimatePrimitive` per primitive (budget share by its
  triangle fraction), weld grid as fallback; `LOD_LEVELS` carry both
  `ratio` and `meshCells`. `lodsAsync` = Web Worker built from the three
  script tags' fetched sources (VertexCacheOrder, QuadricDecimator,
  GlbOptimizer) + an onmessage shim; falls back to the main thread when
  a worker cannot be built. ResourceManager import uses it and shows
  "Building distance levels…". `model-lods.cjs` re-run on the Demo's two
  props (quadric levels replaced the weld ones).
- `editor/src/utils/MeshBvh.js` (`RRMeshBvh`): per-BufferGeometry tree
  (WeakMap cache, midpoint split with median fallback, leaves ≤ 8), slab
  traversal nearer-child-first, Möller–Trumbore, `side`-aware culling
  (FrontSide walls are passed through from outside exactly like three).
  Bug found in testing: partitioning wrote the right half back into
  `order` while still reading it — use two scratch buffers.
  `MapEditor3D.raycastMapMeshes()` replaces both
  `intersectObjects(this.mapScene._meshes)` sites (tileAt,
  groundPointAt): 0.773 → 0.018 ms per raycast on the Demo (8,482 sheet
  tris, 13 meshes, 6 ms first build); 94/100 tiles identical, the rest
  are wall hits at z = ±1e-7 where floor() lands on either side — not
  tiles either way.
- Owner's link (utsubo "100 three.js tips"): applicable and already
  done here — batch buffer updates, dispose, renderer.info + GPU timer
  queries, BVH raycasts, workers for heavy work, LOD, per-frame
  allocation discipline. Worth considering later: KTX2/Basis GPU-
  compressed textures (VRAM + bandwidth on potato GPUs; needs a
  transcoder shipped offline), Meshopt/Draco geometry compression (file
  size only; decoder wasm), `precision mediump` on the weak tier (our
  light loop would band — test first), WebGL context-lost/restored
  handling in PIXI/three (Effekseer guard already re-arms), fixed-bound
  shader loops for old mobile GPUs (our `for (i<32) if (i>=count) break`
  is GLSL ES 3.0-legal but a constant-count variant per program would be
  faster on Mali-class chips). Not applicable: WebGPU/TSL (parked),
  React Three Fiber, pmndrs postprocessing, shadow maps (we have none).

## 2026-09-01 — Distance levels, cache order, GPU tier (runtime 20260901.3)

Owner approved the four-item list (LOD, weak-GPU defaults, cache order,
Demo props) and "keep optimizing for a potato PC, bang for buck".
- **LOD.** `RRGlbOptimizer.lods(bytes, {levels, minTriangles})` → geometry-
  only GLBs at coarser weld grids (`LOD_LEVELS` 300/120 cells; the
  optimizer's "aggressive" is a weld grid, NOT decimation — 1600 cells is
  pixel-identical, 400 crackled hair per an earlier note; LOD is fine with
  120 because it is only shown far away). Images/textures/materials/
  samplers/animations/skins are deleted, `prim.material` removed,
  `collectGarbage` (extracted from dropTangents) drops the orphan views.
  Skinned/animated models and < 20k tris get none; a level that is not
  under 70% of the one above is skipped. Import: `extraSourceFiles` +
  `sidecar` options on `importModelFolder` write `source/<stem>.lodN.glb`
  and a root `model.json {lods:[...]}` in the same staged rename; rollback
  unlinks all. Only in the optimize/aggressive branch (as-is = every byte
  unchanged and nothing else). Existing models:
  `node editor/build-scripts/model-lods.cjs <project> [folders]` (merges
  `lods` into model.json, replaces old lodN files). Runtime: static
  templates tag `child.userData.lodIndex` (flattened order) —
  `buildGlbTemplate` static exit only; `loadModel` → `loadLodLevels`
  (sidecar `lods` list, XHR each, `attachLodLevels`: builds each level
  with `buildGlbTemplate(json, bin, "", {})`, pairs meshes BY INDEX, refuses
  a count mismatch, keeps only geometries in `_lodCache[key].levels`
  (level 0 = base geometries), marks `template.userData.lodKey`).
  `pickLod(object, spanTiles, eye, cacheKey?)` swaps `mesh.geometry` per
  instance with hysteresis (`LOD_DISTANCES [4,10]` × span,
  `LOD_HYSTERESIS 0.85`); the runtime passes `holder.spec` (the cache key)
  because instances clone BEFORE the levels arrive and `userData` copies
  by JSON. Editor: `EventPreviewModels.templateFor` reads the lod files
  sync (`fs.existsSync`) and attaches; `MapEditor3D.pickPropLods()` runs
  per frame on `propGroup`. Editor event-preview models and skinned
  characters have no levels. Geometry is in the flattened world space of
  the base (same nodes, same bake), so swapping geometry alone never
  moves anything — the recentre lives on `child.position`. Verified: Demo
  editor 8.2M → 2.86M tris/frame, 13.7 → 10.7 ms; game instances report
  level 2 at ~34 tiles; the 20-tile tower stays at 0 (correct: it fills
  the view).
- **Cache order.** `editor/src/utils/VertexCacheOrder.js` (Tipsify +
  `acmr`); `reorderForCache` in the optimizer runs in every preset
  (`cacheOrder: true`) and on LOD levels; skips lists under 64 tris or
  already < 0.75 ACMR. Computer-01: 2.06 → 0.62 in 387 ms, triangle
  multiset + winding verified identical. Vertex-bound scenes only; the
  Demo is fill-bound, so no editor-side number to show.
- **GPU tier.** `Graphics._sampleGpuTier(renderer)` after `app.init`
  (`WEBGL_debug_renderer_info` UNMASKED_RENDERER, else RENDERER):
  `weakGpuPattern` (Intel/UHD/Iris/HD Graphics/Mali/Adreno/PowerVR/
  VideoCore/SwiftShader/llvmpipe/Software/Microsoft Basic Render/Mesa)
  → `maxCanvasPixelRatio = min(., 1)` and `Reactor3D.renderTargetSamples
  = min(., 2)`. "unknown" when unreadable (no guess). `gpuTierOverride`
  pins. Sharp-first untouched on a capable GPU (3060 reads "full").
- **CPU churn.** `mapMode` WeakMap memo validated against note/meta/
  sidecar.mode; `Tilemap._sortChildren` sortedness pass first, bound
  comparator cached, no slice; `billboardUp`/`aimCharacterBillboard`
  scratch objects (callers all read on the spot — checked all four);
  `Game_Map.events` walks `Object.keys` past 512 slots.
- Not done / next: editor event-preview sprites unlit and un-LODed;
  characters (skinned) have no LOD; Tipsify is not applied to the Demo's
  SOURCE files (lossless but the owner's untracked art — one command:
  optimize with `{cacheOrder:true}` only); a true quadric decimator would
  give better LOD silhouettes than the weld grid; the editor's pointer
  raycast still has no BVH; `updateMatrixWorld` is once per frame in the
  runtime but still per pass in the editor.

## 2026-09-01 — Game update loop: 30 ms → 2 ms (runtime 20260901.2)

`editor/tests/perf/nw-game-profile.cjs` boots a project as the GAME under
chromedriver (nwapp=<project>), waits for the title (NOT Scene_Boot — a
map started before boot draws into a 0×0 Graphics and the window is black,
which is what the owner saw the first time), starts a new game, and
records rAF deltas / update+render CPU / a CDP profile. Demo start map:
34 ms/frame, `updateMsPerFrame` 30.3. Root cause: props are synthetic
events at `PROP_EVENT_BASE + id` (10000+) in `$dataMap.events`, so
`$gameMap._events` is a 10k-slot sparse array and stock
`Game_Map.events()` (`this._events.filter(Boolean)`) walked it on EVERY
call — hundreds a frame via isEventRunning → isAnyEventStarting,
canMove, setupStartingMapEvent, updateEvents, the 3D sync and plugins.
Fix: memo in a module-level WeakMap keyed on the array + length +
`Graphics.frameCount` (NOT a property on Game_Map: JsonEx would serialize
every event twice into saves). A spawner assigning into an existing hole
mid-frame is seen next frame. Also `Viewport.renderPass` sets
`scene.matrixWorldAutoUpdate = false` and calls `updateMatrixWorld()` once
per frame (was once per pass, ~1.8 ms), and `EffekseerScene.shouldMeasure`
re-looks every 300 frames once settled (was 30; each look is a
whole-overlay drawImage + getImageData ≈ 10 ms sync = a hitch twice a
second). After: 6.9 ms/frame (full 144 Hz), update 2.1 ms, 45% idle.
Left: `Game_Map.events` still walks the 10k slots once per frame
(0.12 ms) — an `Object.keys` walk would make it O(events); PIXI
`_getGlobalBoundsRecursive` from Window/Sprite refresh (~1%);
`getAttribLocation` per frame from something re-looking-up attributes.
Triangle facts for the owner's stress test: Computer-01 is 1.89M tris /
0.99M verts (53.6 MB GLB, one primitive, ACMR 2.06 — no vertex-cache
ordering at all), placed 3×; the reactor 1.9M. GPU is fill-bound in the
editor (9.3 ms at 860×598 vs 2.75 ms at 96×64 with identical geometry),
props ≈ 3 ms of GPU. The GPU timer includes CPU submission gaps and the
mobile GPU downclocks under light load, so partial hide/show deltas are
noisy; trust viewport-size and all-or-nothing comparisons.

## 2026-09-01 — Lights in volume (runtime 20260901.1)

Owner: "in 3D mode they appear as a flat disk on the ground. Lights should be
totally 3D — cube, sphere, cone, not a slice." The flat quads (`lightPool` /
`syncLights`, phase 1) discarded `height` (written by `nativeLights`, read by
nothing in 3D), forced a spot's aim to y=0, and drew in a `"lights"` pass
composited additively. Now `Reactor3D.LIGHT_MODE = "volume"` (default; a
sidecar `lighting.mode = "flat"` or the global restores the quads):
- `Reactor3D.litMaterial(material)` composes an `onBeforeCompile` (after any
  earlier one: clampToTile, billboard quad, straightenBillboardDepth) that
  injects `vRRWorldPos` after `#include <project_vertex>` (post-skinning,
  post-billboard `transformed`) and replaces
  `vec4 diffuseColor = vec4( diffuse, opacity );` with
  `diffuse * rrLight(vRRWorldPos)`, so `texel * base * (ambient + Σ lights)`.
  Extends `customProgramCacheKey` with `|reactor3d-lit`. Sites: tile blend
  + opaque-core materials, room pieces, GLB materials + defaultMat, mesh
  models, character billboards, `syncEventModels` tagging, and BOTH clone
  paths (`instanceMaterial`, COLOR_0 clone) — `Material.clone()` drops
  onBeforeCompile/cacheKey/custom flags, which is why the props first came
  out unlit-bright in a dark room (12 lit / 157 unlit until fixed).
- Uniforms are shared value objects from `Reactor3D.lightUniforms()`
  (`rrLightPos/Color/Aim` Float32Array ×32 vec4, `rrLightCount`,
  `rrAmbient` Float32Array(3)); `syncVolumeLights` writes them once a
  frame — no bufferSubData, no pass. Selection: nearest 32 to the focus by
  (distance − radius). Position: `x+0.5`, `standsOn+lift+height`,
  `facade.z || y+1` (the flat pool's centre plus height). Spot aim from yaw
  + new `pitch` (schema/editor/normalize: −90..90; NOT sign-flipped like
  yaw). `VOLUME_LIGHT_GAIN = 2` ≈ the quads' double add.
- `syncLights`: ambient multiply now `continue`s on `__reactorLit` (they
  read `rrAmbient`), then branches to `syncVolumeLights`; the flat branch
  zeroes `rrLightCount`. `lightBodies()`: per light a Sprite core
  (round texture), a SphereGeometry haze (0.45·radius) or a ConeGeometry
  (apex at origin, opens −Y, `setFromUnitVectors(down, aim)`, scale
  `(tan(half)·r, r, tan(half)·r)`), ShaderMaterial additive, depthTest on,
  depthWrite off, fresnel-ish `pow(|n·v|,1.6)` × `(1−along)²`. Group
  `_lightBodyGroup` is visible in all/world/below passes (setPass),
  disposed in `clear()`.
- Runtime: `_reactor3dLights` (the additive pass sprite) is only built when
  `lightModeFor($dataMap) === "flat"`; `updateReactorLighting2D` also stands
  down when `_reactor3dBelow` exists in volume mode (else the 2D multiply
  sprite would paint over the 3D map). Editor: `renderLightsPass` skips
  itself because `hasLights()` sees no pool meshes.
- Not done: the eye→light occlusion march is flat-mode only (a body is
  hidden by depth; surfaces have no shadows — a light reaches through a
  wall, as the quads did); editor event-preview sprites (MapEditor3D's own
  eventGroup) are unlit; no normal term (distance-only, by design — keep
  the 2D-match rule); no per-map mode UI (sidecar key only; the editor's
  `lightModeFor()` sees no `$dataMap`, so it follows the global).
- Verified: CDP screenshot of the Demo Reactor Room in the editor's 3D view
  (spheres of haze with cores, lit floor, dimmed tank/bike), 102 lighting +
  model tests green, `volume-lights.test.cjs` new.

## 2026-09-01 — 3D performance audit (editor 25.5 → 13.7 ms/frame)

Owner: "choppy in the editor and especially on web; per-frame work is always
the culprit; a 3060m should handle this." Measured with a chromedriver
harness against the real NW editor on the Demo (now
`editor/tests/perf/nw-3d-profile.cjs`; rAF deltas, CDP CPU profile,
EXT_disjoint_timer_query GPU time, mutation counts). Findings, in order:
1. **Effekseer `setRestorationOfStatesFlag(true)` = a `gl.getParameter`
   sync stall.** The model-effect preview layer (one Effekseer WebGL1
   context per playing effect) read state back every draw; the first
   `getParameter(DEPTH_WRITEMASK)` of a frame blocked 15 ms waiting for
   the GPU process to drain three's queued frame. 65% of sampled CPU.
   The game overlay had the same flag. Fix: `RREffekseerStateGuard`
   (editor) / `Graphics.rearmEffekseerState + settleEffekseerState`
   (runtime): restoration on until the first draw re-asserts state, off
   after, re-armed on focus/visibilitychange/webglcontextrestored (the
   reset the flag guarded against). The Animations page's MAIN preview
   context (`effekseerContext`, receives a Canvas2D blit per draw) keeps
   the flag; its standalone Effect File preview is guarded.
   `effekseer-state-guard.test.cjs`.
2. **I18n observer fed itself.** `applyText` rewrote every label's
   textContent unconditionally → added text nodes → `observe()` re-ran
   `applyText(document)` → ~1000 mutation records/frame, forever, on every
   editor screen (querySelectorAll+closest 17% CPU). Now writes only on
   change.
3. **Editor lights pass redrew the world.** Editor props/events/effect
   quads hang off the scene directly, so `renderLightsPass` put the Demo's
   7.7M prop triangles through the GPU again (GPU 26 ms/frame → 13.7).
   Now hides every scene child but the light group.
4. `VideoSurfacePreviewManager` set `material.needsUpdate = true` per frame
   per surface (program params rebuilt per pass). Room textures
   (2400² non-atlas) had no mipmaps. Both fixed.
Still open, with numbers: the Demo's `RPGReactor-Computer-01` prop is
1.89M triangles (placed 3×) and `RPGReactor` 1.9M — 8.2M tris/frame in the
world pass, ~10.7 ms GPU on a 3060m; run the GLB optimizer's aggressive
mode on them (content decision). Web-specific: `Graphics.canvasPixelRatio`
inflates the 3 MSAA render targets by up to 4× area-squared on a stretched
browser window with `adaptiveResolution` off (owner's sharp-first ruling;
`Graphics.maxCanvasPixelRatio = 1..2` is the knob). The GPU driver on the
owner's Windows laptop is 497.29 (2021). `--disable-direct-composition` in
`chromium-args` is worth an A/B. Per-frame allocation list from the audit
(billboardUp Vector3s, aimCharacterBillboard, applyEventModelPose closure,
`Tilemap._sortChildren` slice+bind, `mapMode` regex per sprite,
`suppressReactor3DGroundParallaxes` Set per frame) is secondary now.
Baseline on this laptop after the fixes: 13.7 ms mean, p50 13.9 (2 refresh
intervals at 144 Hz), 68% idle, 0 frames over 33 ms; before: 25.5 ms, 0%
idle, 9 frames/6 s over 33 ms.

## 2026-08-31 — Windows no-launch: unsigned binaries vs fresh Windows

The locally built Windows editor zip (dist-editor GUI, unsigned) would not
launch on a fresh Windows 11 VM but ran under Wine; the same build's Linux
artifact boots here and the payload zip is valid (checked: appended-zip
readable, longest path 120 chars, all NW runtime files present). Diagnosis:
unsigned 441MB appended-payload exe vs Windows trust machinery — Smart App
Control (ON by default on fresh Win11, blocks unsigned silently),
SmartScreen (MotW), Defender heuristics (vary per build = the chronic
"inconsistent releases"). Wine enforces none of it. RULES: itch/GitHub
Windows+macOS binaries must be the SIGNED CI release-candidate artifacts,
never local builds (now at the top of RELEASE-CHECKLIST); every win package
ships `Launch with log.bat` (exit code + %TEMP% log) so a silent no-launch
always produces data.

ROOT CAUSE FOUND (after the SmartScreen-approved-then-nothing report):
`template/Demo/data/nul` — 38 bytes of "(eval):1: command not found:
taskkill", a `> nul` redirect run in a Linux shell, TRACKED SINCE 0.95.0 —
plus untracked copies in Barebones/Parallax data/. Windows reserves nul/con/
aux/prn/com1-9/lpt1-9 as device names and cannot create them as files; NW's
payload self-extraction died on it, silently, in EVERY Windows package since
0.95.0. Wine reserves nothing, hence "runs on wine". Fixed: files deleted,
`assertWindowsSafeNames` guard in dist-editor-worker (createNwPackage +
universal), `windows-safe-filenames.test.cjs` (tracked files + on-disk
template/runtime walk), Desktop win zip patched in place (payload zip split
from the exe at byte 3189760, zip -d, re-concatenated; SHA256SUMS updated;
old zip kept as .BROKEN-nul). LESSON: "works on Wine" clears nothing about
native Windows file-name and trust semantics.

ROOT CAUSE #2 (nul alone was not enough; diagnosed by a Claude session ON
the Windows VM with --enable-logging=stderr): fatal
`web_app_database.cc CHECK: metadata.version() 7 vs 5` during profile init,
exit 0. NW.js derives the Chromium user-data dir from manifest `name`
(`%LOCALAPPDATA%\rpg-reactor\User Data`), every build ever shipped shared
it, and Chromium NEVER migrates a profile backwards — one run of a
newer-Chromium build bricks all older-runtime builds on that machine,
invisibly on clean testers. Fixes: bundled manifest name is now
`rpg-reactor-<appVersion>-nw<major><minor>` (owner ruling after users
confirmed profile deletion also fixed OLDER versions: a FRESH profile every
release, zero stale-profile risk, prefs re-seed per release until the
0.98.5 fs-backed store; games stay runtime-scoped only — plugins may keep
real data in browser storage) (repo manifest untouched; nothing reads
manifest.name at runtime — guarded by profile-scoped-runtime.test.cjs);
build refuses NW downgrades below build-scripts/shipped-runtime.json
(RPGREACTOR_ALLOW_RUNTIME_DOWNGRADE=1 overrides). DEFERRED to 0.98.5: move
editor prefs out of the Chromium profile (localStorage/IndexedDB) into an
fs-backed store — until then every future NW bump resets editor prefs once.
User repair for old builds: delete `%LOCALAPPDATA%\rpg-reactor\User
Data\Default\Sync Data`. Games deployed by Reactor carried the same
landmine — FIXED same night: build-worker normalizeStagedPackage appends
-nw<major><minor> to every game name (saves/config are files, unaffected);
build.js (dev CLI, no NW selection) left alone.

## 2026-08-30 — web (itch) console cleanup (runtime 20260830.33)

From the owner's itch web-editor test. Ours vs not-ours: `Unrecognized
feature: monetization/xr/web-share` + `html-callback ERR_BLOCKED_BY_CLIENT`
are itch's iframe and the user's adblocker — never chase those. Fixed:
video-surface AbortError spam (play() aborted by pause/teardown at scene
switches is lifecycle — `failed()` and the play().catch now skip
`error.name === "AbortError"`); `SceneManager.onError` printed "undefined
undefined" for promise rejections (no filename/lineno — now guarded); the
map view's Effekseer preview on web threw "not preloaded for synchronous
access" — `WebHost.preloadForSync(dir)` fetches a subtree into the sync
`contents` cache (12MB for Demo effects/), `RR_loadEffekseerEffectFromFile`
throws a shared retryable `rrWebWarming` miss, `AnimationPreviewLayer`
retries when the warm-up resolves. The one-per-track BGM 404 on web is BY
DESIGN: extensionless refs probe .ogg first, `WebAudio._onError` walks the
other extensions (reactor_core ~7620) — only a host-provided extension
manifest could remove the network-log line; noted as a future option.
.35: web playtest is an IFRAME OVER THE LIVE EDITOR (WebHost
openPlaytest/createPlaytestModal) - editor app.stop() + MapEditor3D
.suspended gate while it is open (resume must NOT app.start() when 3D owns
rendering); MSAA capped at 2x once canvasPixelRatio >= 2;
Graphics.maxCanvasPixelRatio is the opt-down knob.
.36: _disposeTargets destroyed pass textures the instant a resize rebuilt
them; the pass sprites rebuild off generation() one update LATER, so one
render walked a dead texture (SpritePipe guard skipped it + logged the
"destroy() leak" warning, ground blinked a frame). Same cure as the pool:
defer the reap two rAF. Pattern: anything torn down mid-frame that a PIXI
node still references gets the two-frame grace. Browser rAF is
vsync-locked: 60 on a 60Hz panel is full speed, desktop 180 is an uncapped
panel, not a Reactor difference.
Also .34: `Graphics._defaultStretchMode` returns true everywhere — web
playtests (itch) opened at native size until F3; no persistence involved,
the F3 toggle at reactor_core ~1649 is per-session.

## 2026-08-30 — pre-release: issue #33 remainder + black map on project switch

Issue #33 audit: sections 1 (User/Target Lacks State via `!meetsStateCondition`)
and 4 (enemy Max TP) were already shipped. Landed tonight: the scope fix —
`actionTargetCandidates` now asks a probe `Game_Action`'s isFor* predicates
instead of numeric scope lists (a `<Target: ...>` notetag string matched no
list → zero candidates → Target State silently never held; the probe inherits
plugin predicate redefinitions) — and ratings 1-9 (label/max/clamp, 17 locales
by digit rewrite). Test harness loads the REAL predicate slice from
reactor_objects into the vm; remember [[feedback-vm-realm-deepequal]]: `.map`
on a vm array stays vm-realm, use `Array.from(list, fn)`.

Black map opening project B over project A (Explore-agent trace): the switch
path never called `disableMap3DView()` (closeProject does), so three kept the
shared canvas through the TilemapManager rebuild; and `MapEditor3D._framedMap`
("mapId:WxH", usually "1:WxH" in both projects) plus `this.view` survived, so
the camera stayed aimed at project A's last orbit. Fixed: disable-first in
`populateProjectUI`'s projectHasChanged branch, `_framedMap`/`view` reset in
the project-change purge, `RREventPreviewModels.clear()` in
`_notifyProjectChanged` (cache keys are model-name-only — cross-project mesh
bleed). DEFERRED (post-0.98.4): awaiting `refreshMap3DView`'s fire-and-forget
reconcile; forcing full setEnabled cycle on project change in the
wanted===enabled short-circuit.

## 2026-08-30 — Show Text live miniature

`MessageCommandEditor.renderMiniPreview()`: a canvas under the text field
reusing `drawPreview` cropped to the window — width from
`messageTextWidth(plugins, false) + 24`, height `rows*36+24` plus 60px
headroom only when a speaker name exists; header copied with
`positionType: 2` so the window pins to the canvas floor and the headroom
is exactly the name box's band. Caret decides the chunk
(`splitLines(textLines, rows)`, caret line ÷ rows); `updateGuide()` redraws
it and keyup/click on the textarea cover pure caret moves. No new i18n
strings. Guarded in `message-text-codes.test.cjs`.

## 2026-08-30 — sharp by default (runtime 20260830.29/.30)

Second regression (.31): the pool shim's `getOptimalTexture` destroyed a
stale-sized full-screen texture mid-render — "[BindGroup] destroyed while
still bound to a shader" pairs on every size change with a filter live
(Haven's Pixelate; user's final-testing report). The popped texture is out
of circulation the moment it's rejected, so destroy is deferred two
`requestAnimationFrame`s (immediate fallback when rAF is absent — the vm
tests). Verified on a HavenCopy harness: full-screen ColorMatrixFilter +
6-step resize storm, 12 retired, 0 warnings. `logcap.js` via
`inject_js_start` captures console.warn/error from boot.

F4-spam regression from the pixel-ratio work, repro'd in the harness (new
game → `$gameScreen.startTint` → six alternating `nw.Window.get().resizeTo`
calls): PIXI v8's `FilterSystem._filterStack` keeps entries whose
`inputTexture` was destroyed with the old targets; `_findFilterResolution`
derefs the null source and EVERY later frame throws — the game freezes, not
just glitches. A control run with `canvasPixelRatio` pinned to 1 stayed
clean, so resolution change is the trigger. Fix: null-guarded
`_findFilterResolution` shim in `runtime/libs/pixi_compat.js` (v8-gated,
`__reactorNullGuarded`); dead entries fall back to root resolution. Verified:
same storm, zero errors, frames advancing. Harness gotcha: `rsync
--include='reactor_*.js' --exclude='*'` copies NOTHING (exclude wins for
the directory walk) — use plain `cp runtime/reactor_*.js`.

Second blur source: fullscreen/stretch enlarges the finished frame with the
browser's bilinear filter. First attempt — `image-rendering: pixelated` on
the canvas — made the UI jagged too and was REVERTED on the owner's call
("3D jagged, normal stuff smoothed"). The shipped fix renders the backing
store at the on-screen size instead: `Graphics.canvasPixelRatio()` =
clamp(realScale, 1, 4); `_updateCanvas` sets `renderer.resolution = ratio` +
`renderer.resize(w, h)` (CSS size forced back to logical × realScale — 
`_centerElement` reads the inflated backing width, don't trust it alone);
`Viewport.targetSize()` multiplies by the ratio and `Viewport.resize()`
treats a ratio change as a resize (targets rebuild via generation). Result:
3D renders at physical pixels (sharp), UI bitmaps enlarge via GPU linear
sampling (smooth as ever). A dedicated 3D canvas CANNOT work here: the two
passes ("below"/"above") sandwich 2D sprites inside the tilemap, so the 3D
must stay in the PIXI scene. Effekseer's overlay canvas still CSS-stretches
(glowy content, acceptable); in-scene effect quads are placed in clip space
and keyed to the overlay's pixels, so the ratio doesn't move them — their
textures just magnify inside the native-res pass.

## 2026-08-30 — adaptive resolution off by default (runtime 20260830.27)

`Reactor3D.adaptiveResolution` now defaults to `false`: the under-load render
scale drop upscaled into a blur layer that lingered until five calm seconds
passed, and the owner ruled sharp-first — soften only through a deliberate
setting, never in anticipation. The controller is intact; a project opts in
with `Reactor3D.adaptiveResolution = true`. MSAA (`renderTargetSamples`) is
unrelated and stays. Test pins live as REGEXES (`20260830\.26`) in 4 test
files — grep for the escaped form when bumping, a plain-string grep misses
them.

## 2026-08-30 — GLB optimizer: import dialog + Demo shrink

`editor/src/utils/GlbOptimizer.js` (`RRGlbOptimizer`): `analyze` / `optimize` /
`canvasEncoder` / `PRESETS`. DataView-only so node tests run it directly;
texture encoding is an injected hook. Structure is preserved by in-place
accessor/bufferView substitution everywhere except the tangent drop, which
garbage-collects with a full reference remap (primitives, morph targets,
animation samplers, skin bind matrices, images). Guards: `extensionsRequired`
or sparse accessors bail unchanged; unknown vertex attributes (COLOR_0…) skip
the weld; weights quantize only on solely-owned unstrided views. Wired into
ResourceManager's models import via `UIManager.showModelOptimizeDialog`
(optimize / aggressive / as-is, Cancel aborts); `validateModelBytes` still
gates whatever comes out. Ten dialog phrases hand-translated into all 17
`RR_TEXT_TRANSLATIONS` locales.

Demo models replaced in place (owner has backups): Reactor 139→54, Computer-01
138→54 (2K JPEG, tangents dropped, 900-cell decimation), MonitorArm 56→2.3 (an
8K texture was the whole file), Carol 55.6→23.2, Fleagus 42.4→23.6, Mascot
37.9→11.4 (2K JPEG + u16 weights + weld). Demo 767→467MB — under itch's 500MB.

Verification pattern that worked: CDP harness on the scratchpad DemoCopy,
`readModelAsync` load + clip parity via `root.__reactorClips` (clips are NOT in
userData), and offscreen THREE render shots (bind pose) compared by eye — a
400-cell grid showed hair crackle on Carol, the weld-level grid was
pixel-identical. LESSON: putting quantized UV in the cluster key only dedups
(neighbouring UVs differ by more than 1/1024); real collapse needs position
buckets with a UV *tolerance* plus a normal-dot guard for hair cards. Skinned
`glbSize` shifts ~1% after welding (bone-sampled box over merged weights) —
compare heights with tolerance, not string equality.

## 2026-08-30 — vertical Z coordinate (runtime 20260830.8)

Height is a coordinate now, not an offset. `_reactorLift` is every character's
current height in tiles (was props-only), eased toward `_reactorZTarget` in the
`updateMove` wrapper at `distancePerFrame` — `isMoving` includes the climb, so
Wait for Completion holds. `Reactor3D.eventZAt/setEventZ` keep per-event heights
in the sidecar (`reactor3d.eventZ`, zero leaves no record); `verticalCeiling` is
the room height or 64. Collision is vertical overlap (`charactersOverlapVertically`,
character height from `characterHeightTiles`); all heights zero degenerates to
always-overlap, so 2D maps are untouched. Flat maps lift only props
(`reactor_sprites.js` gates on `isEventProp`).

Move routes: **Rise / Descend / Set Height…** are code-45 Script steps whose body
is guarded (`typeof this.reactorRise === "function"`), so MZ ignores them; the
codec marker (kind `route`) is what the editor reads back
(`SetMovementRouteEditor.routeCommand/parseRouteCommand`).

Editor: EventEditor's Position row is editable X/Y/Z (z commits through
`_writePendingModels` and counts as a model change); `MapEditor3D.placeEvent` and
`previewEventModel` add `eventZAt`; the selected event grows `RRAxisArrows3D`
drag arrows (new util, PoseRings3D pattern — X/Z snap to tiles via `dragEventTo`,
Y writes `setEventZ` freely, pointer ray dropped onto the axis line in
`axisTravel`); `syncGridLevel` draws a second grid plane plus the column's corner
lines at the selection's height. Passage overlays skip placements with z > 0.5
(a model in the air blocks nothing on the ground).

Backdrop-close sweep (editor-only): clicking beside any dialog no longer
closes it — 110 `target === modal/overlay` close handlers excised across 102
files; only UIManager's stateless confirm/alert/reload keep the gesture and
VideoSurfaceEditor's off-surface pointerdown stays (canvas tool exit, not a
dialog). Guarded by `no-backdrop-close.test.cjs`. LESSON: the sweep's
"nearest preceding if" heuristic ate ModelGraphicPicker's OK-commit block,
because `backdropPressed = e.target === modal;` is an ASSIGNMENT — always
audit a mass edit with `git diff` + a removed-lines classifier before
trusting it; `git grep` at the base commit for non-if-form matches found the
one collateral site.

Per-event 3D refresh + selection fixes (editor-only): `rr-events-changed`
used to route into the throttled FULL rebuild — deleting one event blinked
and reset every model on the map. It now calls `refreshEvents`, which diffs
`_eventIdentity` snapshots (x/y/name/note/page image/spec/z) and tears down
or builds only the affected events' pieces (`_buildOneEvent`, carved out of
buildEvents; sheet animations tagged `eventId`; effects/animated
models/pickables/billboards/labels follow their event out). UIManager's
capture-phase Delete yields to an active props selection
(`propsManager.remove` — records undo), so DEL deletes the prop, not the
map. Clicking a previewed event model used to crash `highlight()` on the
Group's missing material — the outlines and labels died until restart;
preview roots are now box-picked in `eventAt` (select their event) and
`highlight` skips them.

Scoped Wait (runtime 20260830.20-22): grew out of "Wait for 3D" when the
user hit the real issue — ANY wait in an action-button event locks the
player (Game_Player.canMove -> $gameMap.isEventRunning). Scoped Wait is
defined as a BACKGROUND wait: `Game_Map.isEventRunning` reports false while
the only running interpreter sits in waitMode `reactorScopedWait` (never
while an event is starting), and the invoking event unlocks at wait start
("This event keeps moving" checkbox, default on). Four modes decided by
`Reactor3D.scopedWaitHolding`: last actions (animation queue +
isMoveRouteForcing, 60 s deadline), duration (frames), switch flipped,
variable compares (>=,>,=,<,<=,!=) — switch/variable carry NO deadline (they
are "resume when it happens"). Command `ScopedWait`; `WaitForModelAnimation`
stays registered as an alias for events saved in the hour it existed.
20260830.23 unified the rule after a live repro of the user's tank flow
(fx-tanklock.cjs: locate beside the event, event.start(), sample canMove):
`reactorModelAnimation` (Play Model Animation's Wait for Completion) is
background too — a Reactor wait sequences the SCRIPT, never freezes the
world; stock Wait (230) remains the blocking tool. Movement and animation
are independent axes: a 3D event can walk its route while a pose plays.
The freedom exposed a second-order trap (20260830.25): the now-walking
player bumping into (or pressing action on) the waiting event re-armed
`start()` EVERY FRAME via `checkEventTriggerTouchFront` — `_starting` stayed
true, `isAnyEventStarting()` vetoed the exemption, player froze again.
Diagnosed by wrapping `Game_Event.start` with a stack capture in the live
game (fx-diag2.cjs). Guard: `start()` no-ops while the map interpreter is
running that same event. `RPG_REACTOR_RUNTIME_REVISION` is now a console
global — first question for any "fix didn't work" report.
Parked scripts (20260830.26): a background-waiting interpreter used to make
the NEXT interaction queue behind it (second event `_starting` -> exemption
vetoed -> frozen until the first script finished). `Game_Map.updateInterpreter`
now parks the waiting interpreter onto `$gameMap._reactorParked` (serialized
with the map; ticked each frame; event unlocked on completion) and hands the
map a fresh Game_Interpreter, so each interaction runs — and locks — on its
own merits. Live-verified: tank parked mid-routine while the plant monster's
script ran and released. The self-retrigger guard covers parked ids.

Animation sequencing (runtime 20260830.17-19): `_modelActions[characterKey]`
is a QUEUE — Play Model Animation commands chain one after another (empty
name stops and clears), a repeating action yields when something waits
behind it, and the event ends immediately so the player is never frozen by
an object going through its motions. Per-command "Wait for Completion"
checkbox (waitMode `reactorModelAnimation`, repeat releases after one
cycle) and the scoped **Wait for 3D** command (`WaitForModelAnimation`,
target id/0/-1/'all', waitMode `reactorModelWait` on
`Reactor3D.modelAnimationsBusy`). Flash timings on Effekseer animations
carry `scope` (2 screen / 3 hide target), honoured in Sprite_Animation.
CAUTION from this stretch: a python splice cut a block at the wrong brace
and the broken runtime was SYNCED before the syntax check ran — gate
`sync-runtime.cjs` behind `node -e "new vm.Script(...)"` in the same chain,
and brace-match blocks instead of taking the first `}`.
UNVERIFIED: the DB 3D editor's rule-attached Effekseer effect preview (user
report) — the live editor repro needs the user's editor closed; in-game the
same chain works (fx-cannon.cjs proved action+anchored animation fire).

Turn sweep is an arc, not a disc (runtime 20260830.16): `eventModelSweepHits`
takes from/to yaws and samples the real footprint (mask included) along the
short arc — the whole-disc rule meant a size-19 tank could not turn with
anything inside ~10 tiles in ANY direction, including behind it. Model
overlap loops (`eventModelCanFace`, `eventModelWouldOverlapEvents`, the
player check) also skip characters that fail `charactersOverlapVertically`.
Diagnosed with `scratchpad/fx-tank.cjs` (boots DemoCopy, tracks an event's
route progress, then dumps canPass/canFace/overlap blockers for its next
step). The Demo tank's remaining stops are genuine: its rear really reaches
9.9 tiles, and EV026 — an invisible priority-1 event at (24,22) — plus the
player sit inside real swept arcs.

Placement trigger override (runtime 20260830.14): a prop/event choosing an
animation fires it as an ACTION, but the fire and restart lookups only
matched `trigger === 'action'` rules — an Always-authored pose extended once
and froze (MonitorArmExtend). `rulesForPlacement` clones the chosen rule as
action (+ placement repeat) at the game holder's pending-fire and in the map
editor's drivers; authored rules untouched, ambient double-play impossible
(the clone replaces in place). DB editor: keyframes render for every
trigger; `_workValues` strips keys only from the live slider stand-in;
`_healAllAnchorBindings` after carve; `deletePart` unbinds effects with the
offset converted out of the dying frame.

Whole-model target (runtime 20260830.13) + the MonitorArm post-mortem: the
user's 'Monitor+Arm' part turned out to cover 10 of 14,447 triangles (a
marquee sliver) and the effect's anchor.part was still '' — so nothing could
have tracked. Structural fixes: `effectAnchorNode` resolves '' to the
anim-root (rest turn stamped in `prepareModelInstance`), so an unanchored
effect rides whole-model poses; carved pieces answer to every owner in
`userData.parts`, not just their node name; `_healAnchorBinding` rebinds
origin anchors to the containing piece on selection; and the parts list
opens with a built-in "Whole model" row — no carving needed to pose a model
or hang effects on it. Functional coverage drives applyModelAnimation inside
a three.js vm (`effect-anchor-tracking.test.cjs`).

Anchor binding was the real gap behind "video doesn't track": the Place
tool never set `anchor.part` (kept whatever the dropdown said, i.e. ''), so
every anchor lived on the model origin and there was nothing to track.
`_placeEffectAnchor` now binds the part under the click (carved part name,
dominant bone on rigs; origin only off-part) and stores the offset in that
part's frame; the anchor-part dropdown converts the offset between frames so
the dot stays put. Existing effects saved with part '' need one re-place
click to bind. Editor-only, no runtime bump.

Part-anchored effects track their part (runtime 20260830.11):
`effectAnchorWorld` always followed the part node's POSITION, but every
consumer oriented the plane by the whole model's quaternion, so a video on a
swinging monitor arm slid after its point without turning. Fix:
`prepareModelInstance` stamps `__restQuaternion` on each posed node, and
`Reactor3D.effectAnchorQuaternion(object, effect)` returns the part's pose
delta (identity at rest); applied in the game surface placement
(`reactor_video_surfaces`), `MapEditor3D.updateEffectPlays` (conjugated into
the plane's local frame) and the DB preview. A part RENAME now also renames
`rawEffects[].anchor.part` — before, a renamed screen's video fell back to
the model origin silently (this is likely what "doesn't track" looked like
when the part was renamed after anchoring). Prop pose rings orient from the
placed object's real rotation (`object.rotation`), not the spec's bare
yaw/pitch, so a facing-turned model's rings sit on the axes the drag turns.

Database 3D Models editor effect flow (editor-only, same day): the video
surface's placement card seemed to vanish because `_pickPart` swapped the
effect card for a part card on ANY model click — with a whole-object part
that is every click; it now returns early in effect mode (parts stay
reachable via list + card chooser). `selectEffect` auto-starts
`_playVideoPreview` for video effects, and the frame gate counts
`_fxVideo`/active `_fxPreview` as activity (idle-throttled video read as
"not playing"/choppy). DB nav section renamed 3D Models (`RR_DB_TYPE_KEYS`
has no reactor3d entry, so the fallback string IS the label in every
locale). MonitorArm's authored effect has no `trigger` → defaults to
on-demand; choose it on the prop, or set Play when: Always on the card.

Lights flat + poses (runtime 20260830.10): the light quads are no longer
camera billboards — they lie flat on the ground (`syncLights` basis right=+x,
up=north; facade lift is plain vertical now), so a pool is a thing on the
floor, a flashlight is a wedge along it, and nothing floats onto the wall a
player faces. Route steps Face Ceiling / Face Ground / Stand Up / Rotate…:
`reactorFacePose(±1|0)` and `reactorRotate(deg)` on `Game_CharacterBase`
(installed by `installVerticalMotion`), models get `rotateX(-pose·π/2)` +
`rotateZ(-spin)` after facing in the model loop, sprites get feet-anchored
`rotation` in reactor_sprites (works flat and stood-up — the 3D stand is
scale+skew). Same code-45 codec rails (`routeBody` ops
faceceiling/faceground/standup/rotate). Pose sign convention is untested
visually: ceiling = model front tips to +y; flip the sign in ONE place (the
model loop) if it lands face-down.

RaveLighting in 3D (runtime 20260830.9): the rave shim fed the plugin's
clockwise-from-south angles (smooth flashlight angle, `facingYaw`) straight
into the scene's anticlockwise east-positive aim (`sin/cos` of yaw), mirroring
every beam east-west — the nova shim negates for exactly this reason, rave now
does too. Light quads deliberately draw with `depthTest: false`, so walls are
honoured CPU-side instead: `lightSolidGrid` (per-map cache; on room maps a
cell without any tile is wall at room height) + `lightBlockHeightAt` +
`lightSegmentBlocked` (height-aware cell march — a high camera sees over a
wall) + `clampConeReach`. `syncLights` skips lights whose cell the camera
can't see and shortens cones to `beamReach`; kill switch
`Reactor3D.LIGHT_OCCLUSION = false`. The transform card follows 3D drags now:
`_syncCard` on every ring/arrow/carry move, and `_cardFor = null` on release
so the ±4-tile slider ranges rebuild around the new spot.

Same-day follow-ups: `ModelGraphicPicker._placeFaceAt` snaps face marks to the
nearest 45° within 15° (an off-centre dot was a permanent in-game tilt) and its
pointer-move work is RAF-coalesced; `MapEditor3D.refreshEvents` (called from
`EventManager.renderEvents` when 3D is up) rebuilds just the event group so a
changed event model shows without a restart — buildEvents draws start markers
itself, don't call `buildStartMarkers` again; the selected prop gets
`RRAxisArrows3D` beside its rings (`dragPropAlongAxis`: x/y fractional,
z ≤ PROP_MAX_LIFT) and the card tab reads Coordinates; EventEditor header
inputs use `--color-bg-input-alt` so they read as fields on the header strip.

Also fixed here: the web trim (`dist-editor-worker.js`) never scanned the new
`props` array for used models, so every prop-placed model was dropped from web
bundles; and the web build test pinned `free-buick-riviera-car`, which the Demo
no longer places (it is `kawashaki_ninja_h2`'s event now). Tests:
`editor/tests/vertical-position.test.cjs`.

## Historical state snapshot — 2026-08-29 to 2026-09-02

This snapshot is preserved as history. Its runtime revision, test status, asset
tracking, and issue backlog are superseded by [Current project status](STATUS.md)
and the later dated entries above.

- **0.98.4** is tagged and published at
  <https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.98.4>
  (2026-08-31): height as a coordinate, 3D props and passage, in-world
  model effects and video surfaces, Scoped Wait, the Show Text overhaul,
  the GLB import optimizer, native-resolution fullscreen 3D, database
  parity fixes, and the Windows no-launch root causes (`nul` file, shared
  Chromium profile).
- **0.98.5** is open in `editor/package.json`, both READMEs, and the
  `[Unreleased - 0.98.5]` sections of both changelogs: native lighting
  (phase 1 quads → the Lighting tool → lights in volume, 2026-09-01),
  shadow maps, distance levels and the quadric decimator, the 3D
  performance audit, the potato-PC pass (2026-09-02, runtime
  `20260902.1`), SE variants everywhere, MP/TP recovery sounds,
  still-image media surfaces, the animation timing-row fix, vehicle sprite
  previews. Carried over: the fs-backed prefs store, the awaited
  `refreshMap3DView` reconcile, the optional web audio extension manifest.
- The **root changelog's 0.98.5 section was empty until 2026-09-02** and has
  now been written. It is the section `publish-release.yml` turns into the
  GitHub release, so a tag cut before that point would have published a
  blank release note — worth a glance each cycle, since the editor changelog
  fills up continuously and the root one does not. Its pre-2026-09-02
  entries were summarised *from* the editor changelog rather than written
  alongside the work, so they are worth a read for emphasis and accuracy.
- **Runtime revision is `20260902.1`** (`runtime/reactor_main.js`, and
  `RPG_REACTOR_RUNTIME_REVISION` in the F12 console).
- **The suite has not been run since 2026-08-29.** The count in the READMEs
  (2,069) predates volume lights, shadow maps, distance levels, the BVH, the
  update-loop change and the potato-PC pass, and at least two suites were
  added in that time (`volume-lights`, `system1-vehicle-art`). It must be
  re-run and the count refreshed in both READMEs before a release commit —
  `cut-release.cjs` asserts on it.
- The 0.98.4 tree, for the record — in addition to the custom
  interfaces, GitHub fixes, PIXI 8 compatibility, 3D performance, browser-save,
  localization, plugin schema, database, audio, animation, and Resource Manager
  work described below, the current tree now includes native Video Surface
  commands/runtime/live-map authoring; transactional single-model import into
  the deletion-disabled 3D catalog; PNG/JPG/JPEG/WebP/safe-SVG/GIF handling
  across converted consumers with animated GIF refresh; exact-version verified
  desktop H.264/AAC codec overlays and redistribution metadata; actor/model
  preview lifecycle cleanup; and an expanded themed SVG toolbar set including Fill, Shadow Pen,
  Undo/Redo, draw modes, layers, Audio, Database, Plugins, Resource Manager, and
  Forge.
- Validation: **2,069 passing Node tests**, no failures, skips, or TODOs
  (`cd editor && npm test`, ~60 s), re-run 2026-08-29 on the committed tree
  (runtime revision `20260829.45`). Focused Resource Manager, model transaction,
  image-format, Video Surface, actor-preview, localization, asset URL, and System
  browser suites pass. `npm audit` reports zero vulnerabilities; source syntax,
  runtime-focused checks, and `git diff --check` pass. Existing real Web
  persistence, NW.js launch/save, NW.js UI-layout (1280x720 through 2560x1440),
  and read-only State/Animation screenshot results remain valid.
- Manual status: animated GIF playback in the actual editor/runtime, live 3D
  Video Surface placement and right-click navigation (2D placement, warp,
  resize, and playback were driven in the real NW.js editor on 2026-08-29),
  actor-preview
  performance under repeated selection, and final toolbar-icon inspection in
  dark/light themes have not yet been run. No full end-user playtest is claimed.
- 2026-08-29 3D authoring day (details in the dated sections below): Map
  Properties 3D switch + room + Default Camera; five camera modes and the
  Change 3D Camera command; 3D-M model props; Database → 3D Effects
  (animations and video surfaces, anchors, triggers, model-relative scale,
  face occlusion) with Play 3D Effect; mesh collision; third/first person
  mouse look + WASD, look-up over the shoulder, head lean, Escape → menu;
  player start facing with 3D start markers; themed steppers app-wide.
- NOT tracked (owner decision pending, ~410 MB): `template/Demo/3d/Map-Objects/`
  and `template/Demo/3d/Room-Rings/`, which Demo Map001 references. A clean
  checkout's Demo shows that map without its props and room rings until
  they are added or replaced with smaller models.
- GitHub issues triage (2026-08-29 evening, all 13 open issues read):
  DONE in the tree — #28 ColorFilter `.uniforms` on PIXI 8 (contributed
  patch applied), #32 User/Target Lacks State, #7 folder-aware plugin file
  picker (rest of #7 and all of #6 Resource Manager were already shipped),
  #23 Referenced by (contributed code applied; `databaseListLabels` →
  `databaseEntryLabels` was the one live fix), #31 enemy Max TP + layout,
  #16 Add State duration override, #15 Grow Max TP + ranges + Change
  Parameter Random; then #29/#30 (below). Later the same evening: anchored
  Effekseer effects drawn inside the 3D scene (game and editor), and model
  maps drawn under one depth buffer. Runtime revision `20260829.45`.
  Also DONE: #29 Show Text multi-box/text codes/preview (contributed diff
  applied selectively; review fixes: scripts wired, IconPickerModal dropped
  for RRIconPicker, Window.png via RREncryptedAssets, byte-identical OK on
  untouched boxes, web `require` guard; locales hand-written) and #30 database
  text codes (the base was never attached — written here to the issue's spec;
  the attached addendum gives Skill Message 3/4 runtime meaning).
  REMAINING (all L): #17 multi-element skills (needs a VisuStella
  `getActionObjectElements` shim + an element-set popover), #11 BGM
  palettes (design question: the plan puts new keys on Map###.json top level;
  this codebase's convention is a sidecar — decide before building), #9 Quest
  Manager (VisuStella-specific; suggest a read-only first cut without the
  QuestUsageIndex rewrite). Contributed diffs are in the session scratchpad
  `patches/`; re-download from the issues if lost.
- `template/Demo` is the only git-tracked template. The other folders under
  `template/` are local compatibility-corpus projects (Star Shift
  Freelancers / Origins / Rebellion, Project2/3, MZ3D, Parallax, Hendrix,
  Barebones) and are ignored; tests must not depend on them.

## 3D-M Transform Card, Ghosts, Undo, Transform 3D Model (2026-08-30, owner asks)

- Card in the 3D-M panel (`_renderCard`): offset/rotate/scale sliders with
  numbers; live via `update(id, patch, {silent:true})`, one undo per drag.
  Props gained `stretch` [x,y,z]; every consumer of `spec.scale` also reads
  `spec.stretch` (instance, poseProp, play-time placement, mask, footprint,
  thumbnail size). Prop undo is on `MapEditor.undoStack` (`kind: 'props'`).
- Ghosts: 3D `updatePlacementGhost` (faded instance at the ground point),
  2D `_showGhost` (half-alpha thumbnail sprite). Hidden over a prop, off the
  map, and on deactivate.
- `TransformModel3D` plugin command: `character._reactorTransform` eased
  over the pose each frame (`applyLiveTransform` after `position.set` in
  the model loop). Visual only: collision stays at the placed pose (by
  design; note it if a moved model must block where it shows).
- Not live-tested in the editor: the card, ghosts and the command dialog
  (structure mirrors `Camera3DEditor`); runtime tween has unit tests.

## Sharp In-Scene Effects, Seamless Loops, Autotile Pick (2026-08-30, owner-reported)

- Blur: the game drew anchored Effekseer effects at half the screen and
  stretched them; the map view into a 512 square; the DB preview at 1:1
  (why it looked right). Now the game draws the effect's own box at 1:1
  (`EffekseerScene.trackedRect`/`measure`, world-space cylinder learned from
  the drawn pixels, `BUDGET` unchanged at a quarter screen) and the map
  view keeps its old mechanism with a view-sized layer canvas, plus
  `previewActive` true while an effect plays (video previews OFF in the
  owner's profile left the view at 10 renders/s: choppy). DEAD ENDS: a box
  tracked as screen fractions drifts as the camera turns (this shipped
  into the templates for an hour and looked like the effect "losing" the
  model); a sphere costs 4× on a tall beam; the frozen effect bound to
  the screen the owner saw was the WINDOW RESIZE: three allocates a
  canvas texture immutably at its first size, a grown canvas never uploads
  again; `texture.dispose()` on a source size change (editor and game).
  Repro: open the 3D view, maximise the window. Harness limits:
  CDP mouse drags and `m.orbit()` did not turn the camera under the
  owner's profile copy; readPixels on three's context sees nothing under
  the shared strategy (use screenshots); the video panel pollutes a
  "cyan" mask (use a bright-core mask).
- Loops: `visibleFrames` learned from the last lit measurement, longest
  seen; the next play starts there (`entry.restarted`), tail underneath.
- Harness gotchas: third person's default camera looks down and cannot
  see the core (dispatch `mousemove` with decreasing clientY to look up);
  the Demo core restarts every ~2 s, so a fresh tracker per play blurs.
  `fx-verify.mjs` reports lit/dark/clipped frames and box sizes;
  `fx-editor.mjs` orbits the map view and samples picture-vs-anchor.
- Not live-tested: the Animations page Repeat path (code only; same
  32-px readback as the layer).
- Autotile: single-cell right-click keeps the exact piece for Shift-paint.
- Collision (owner: "invisible walls"): tiles are blocked by mesh
  COVERAGE (`mask.blocksTile`), not by a 0.34-tile body circle at the
  tile centre; vertical faces no longer leak a quarter tile. The props
  panel has one Size; the selected prop's blocked tiles draw in red (3D
  and flat map) via `Reactor3D.blockedTilesFor`. Measure with
  `scratchpad/fx-collide.mjs` (prints each prop's mask and a blocked-tile
  map). Not done: a per-prop footprint override (none needed once the
  mask is right; `collision: "box"` in model.json is the escape hatch).
  The in-game "2-3 tile buffer" was NOT the model: `fx-canpass.mjs`
  showed `m` (map passability) on cells with no tile at all under and
  around the reactor; a 3D room's bare floor now passes
  (`installRoomFloorPassage`). The header's Passage toggle draws what the
  game reads, plus model footprints (props AND model-bound events, via
  `TilemapManager.modelPlacements`), in the flat map and the 3D view;
  a tileset saved in the database refreshes it. When the editor's red
  squares and the game disagree for ONE prop, run `fx-prop2.mjs`: it
  prints both tile sets with the spec and yaw each side used (the last
  such gap was the rounded-tile second centre in `eventModelContains`).
- WebGL context budget (16 in Chromium): `AnimationPreviewLayer.dispose()`
  now loses its context; live prop edits rebuild effect layers per edit
  and evicted the map view's context (white screen). Any new context
  owner must `WEBGL_lose_context.loseContext()` on dispose.

## Conditional Branch: RPG Maker Layout (2026-08-30, user reports)

- Users found the dropdown-driven dialog foreign. It is now MZ's four
  numbered tabs of radio rows plus a fifth **Reactor** tab for the input
  conditions (keyboard/mouse/wheel/pointer); nothing was dropped.
  Reference screenshots of MZ's dialog are in `scratchpad/Conditional/`.
- Rendering only: `parseCommand`/`buildParameters`/the advanced-input codec
  are untouched, so round-trips stay byte-identical. `show()` gained
  `options.troop` for enemy names in troop events.
- Harnesses: `scratchpad/cb-shots.mjs` (every tab, dark + light, cropped to
  the modal) and `scratchpad/cb-func.mjs` (clicks radios/tabs in the real
  editor and checks `buildParameters`). The first shot run showed `0001
  Missing` in every database select: the database had not finished loading
  2 s after `isProjectLoaded`; wait on `getActors().length` instead.
- Also today: Three.js named beside PixiJS on every description surface
  (both READMEs, package.json, the itch blurb); Three.js 0.185.1 is npm
  `latest`; the stale "stacked canvases" header in `reactor_3d.js` now
  describes the shared-context path with the canvas fallback.

## Video Effects, Mesh Collision, Relative Controls, Editor Playback (2026-08-29, owner-reported)

- **Use the current Demo.** The scratchpad `DemoCopy` had drifted; refresh
  with `rsync -a --delete --exclude .rpgreactor.lock template/Demo/ DemoCopy/`
  then rsync `runtime/` into its `js/`. The real repro was
  `Map-Objects/RPGReactor` (size 20, no rules, effect `Core` trigger
  Always) placed as a prop with `effect: "Core"`.
- Effects for models without animation rules never ran: the effect pass
  lived inside `if (holder.binding && holder.rules.length)`. Now separate.
- Runaway: `spawnAnchoredAnimation` ended by calling
  `updateAnchoredAnimations`, whose loop restart called spawn again →
  recursion until the stack died (1,832 sprites, then a frozen list).
  Restarts are collected and run after the pass; `MAX_ANCHORED_PER_MODEL`
  = 8; a sprite is "playing" iff the spriteset still parents it.
- Mesh collision is the DEFAULT (`collision: "box"` opts out). Mask per
  model+pose: quarter-tile cells from triangles under 1.2 tiles;
  `mask.touches(x, z, r)` tests the walking body (r = 0.34 tile) so tile
  granularity no longer makes walls. Built in `preloadMapModels` under the
  fade (reactor: 3.09M triangles, ~300 ms). Verified: reactor 117 tiles as
  a round base vs 173 box; 1 µs per `pos()`.
- Third/first person: mouse look (pointer lock; `Camera.look`) + WASD/arrows
  relative to the camera (`Camera.relativeMove`, 8-way via
  `moveDiagonally`); first person turns the body to the look when still.
  Verified in game: yaw 90 → W walks east, A strafes north. Harness sets
  `look.locked = true` and dispatches `mousemove` (no real pointer lock).
  Look-up: third-person pitch range [-25, 80]; the mouse turns the look
  unlocked too (client deltas). Head lean (`applyLookLean`) MUST run after
  `applyModelAnimation` — the mixer writes every bone each frame, so a lean
  applied before it read as rotX 0. Looking up is over the shoulder: the eye
  stays at focus height and slides in (75% at full look-up, min 1.5 tiles),
  the view pitches up — never under the floor. Verified: eye y 1.0, 2 tiles
  behind, head −30°. Escape while pointer-locked is swallowed by Chrome:
  `lockReleased` on `pointerlockchange` (window focused) sets `menuCalling`;
  F3/F4 and `fullscreenchange` suppress it for 1.5 s (fullscreen drops the
  lock too). The DB effect preview must read the WORKING copy once its
  effect is selected (`_fxPreviewDef = wanted`), else sliders look dead.
  The overlay canvases grow to the shown size (≤1024) — at 384 they were
  blurry over a big model.
- Effect scale contract (owner asked for model-relative): scale 1 = the
  animation's authored screen is the model's longest side. Game:
  `effectModelScale` = spanTiles × tileHeight / Graphics.height on the
  axes; editor layer: `setSpan(tiles)`, q = span/8, MV cells
  (size/8)×span/screenHeight. Earlier bugs fixed on the way: the DB layer
  was 1.875× too small at 720p and capped at 1024 px. Verified: Core beam
  1.35× tower in DB, ~1.25× in game (its beam clips the frame).
  `effectFacesCamera`: box-face heuristic, no geometry; interior anchors
  always show — now only for MV sheet animations. Effekseer effects on 3D
  maps are drawn in the scene (`Reactor3D.EffekseerScene`): the hidden
  sprite's handle is drawn with the 3D camera into a corner of the existing
  overlay canvas, copied out, and shown on a screen-sized quad at the
  anchor's clip depth. TWO DEAD ENDS, do not retry: (1) Effekseer 1.70b on
  three's WebGL 2 context — `useProgram` INVALID_OPERATION, even `init`
  alone leaves PIXI's filter draws failing → black frame; (2) a second
  Effekseer context (own WebGL 1 canvas) — the library's object table is
  global, so both contexts bind each other's programs/textures ("object
  does not belong to this context" spam, massive lag). One context only. Verified in third person on the Demo: the core
  glows inside the tower chamber, hidden by the frame and by the player. NOTE: Demo Map001 event 2 (EV002) has a note
  `flashlight 20 25 #5555FF 0 -24 1` that the light shim draws as a huge
  purple cone over the reactor — that is what looks like a giant "effect",
  not the Core animation. Left as authored.
- Model maps draw under ONE depth buffer (editor `render()` → `setPass('world')`,
  runtime `scene.modelsInWorld`): the split passes with `clearDepth()` are the
  2D sandwich for sprite maps only. Symptom when wrong: a layer ≥ 5 video
  surface or star tile paints over a tower it stands behind as you rotate.
  Editor effect previews on the map use `AnimationPreviewLayer.setWorld` +
  the runtime's depth quad (`quadFor`): a 600-tile VERTICAL plane stood on
  the anchor facing the camera (`standQuad`), not a screen-depth plane —
  from above the tower base is farther than the mid-height anchor. A WebGL
  canvas source ignores three's flipY: use the quad's `flip` uniform.
- Player start facing: `System.json.startDirection`; 3D start markers are
  in `eventGroup` (not pickable), rebuilt by `refreshStartMarkers`.
- Editor 3D view plays rules + Always effects + a prop's chosen effect
  (`RRAnimationPreviewLayer` per effect: one WebGL context each — keep
  Always effects few on a map; video effects are `VideoTexture` planes).
- Perf pass (owner rule: potato PCs): editor profile showed no per-frame
  texture churn; the real per-move cost was `propAt` raycasting whole
  meshes — now `Box3` per prop, hover throttled to 30 Hz. Game frame with
  the reactor + Core effect: p50 7 ms, max 12 ms.

## Props Panel via Picker + Start Animation/Effect (2026-08-29, owner-reported)

- 3D-M panel: picture/Choose button → `ModelGraphicPicker`; its pose
  (yaw/pitch/roll/size) lands on the prop. Animation/Effect dropdowns read
  the chosen model's model.json (`PlayModelAnimationEditor.modelActionNames`
  / `PlayModelEffectEditor.modelActionNames`). Runtime queues both after
  `setupEvents` (verified in game: the plant prop's queued `peck` was
  consumed and one anchored `zap` was live). A start animation plays once
  unless the rule has Repeat.

## Effect Triggers, Free Scale, Global Steppers (2026-08-29, owner-reported)

- Effect `trigger` mirrors rule triggers; runtime `updateTriggeredEffects`
  runs in the holder loop with the same moving/dashing state as the rules.
  Editor preview: `_updateTriggeredEffectPreview` picks the first active
  triggered effect (one overlay layer = one animation at a time).
- Scale is `number | [x,y,z]` in model.json (`transform.scale`, effect
  `scale`); the runtime's `scaleAxes` normalises. Non-uniform effect scale
  in play patches the sprite instance's `updateEffectGeometry` because the
  stock pass calls `setScale(s,s,s)` every frame.
- The preview follows the live `_effectWork` (was a normalised snapshot, so
  placing the anchor did nothing until Play).
- `NumberSteppers.js` wraps every number input app-wide on load and via
  MutationObserver; hand-authored `.rr-number-stepper` markup is skipped.
  If a field must keep the bare input (none known), add `data-no-stepper`.

## 3D Editor Card Rework (2026-08-29, owner-reported)

- The card (upper right now) is one surface for three targets, chosen from
  a grouped searchable dropdown (`utils/SearchSelect.js`): `__model` →
  transform mode (`_transformWork`, live via `_applyBaseTransform`, saved
  as model.json `transform`; Animations tab = the old whole-model card),
  a part/bone → the pose card as before, `fx:<name>` → effect mode
  (`_effectWork` offset/rotate/scale sliders, marker drag, Play, Save).
  `_cardMode` is 'part' | 'effect'; `_modelTab` 'transform' | 'animation';
  `editRule` forces the animation tab for whole-model rules.
- Base transform is a wrapper group inside the instance
  (`Reactor3D.applyModelTransform`), applied at every clone site. Rigs and
  carved parts sit under it; verified the rigged Fleagus still binds.
- Repeat: rule `repeat` (on-demand only). Runtime restarts the action at
  `until`; `PlayModelAnimation` with an empty name stops it. Editor preview
  restarts `_sim.action` for repeat rules and for any preview whose trigger
  is not on-demand (the "why doesn't Always repeat" report).
- Effect `rotate` is degrees on top of the record's rotation; MV sheets
  only honour Z (2D) in the preview; Effekseer takes all three in play and
  preview.

## Model Effects + Play 3D Effect (2026-08-29, owner-reported)

- model.json `effects[]` are first-class (Effects section under Animations
  in the 3D database editor); rule timelines reference them by name
  (`{ at, effect }`, the ✦ rows; clicking a row steps to the next named
  effect). Runtime: `readModelEffects`, `fireNamedEffect`,
  `spawnAnchoredAnimation` (stand-in target sprite in `_effectsContainer`,
  `sprite._targets = [standIn]`, repositioned per frame from
  `effectAnchorWorld` + `projectToScreen`), queue via `playModelEffect`.
  Anchors only project on 3D-scene maps; flat maps play on the character.
- Editor preview: `RRAnimationPreviewLayer` (transparent WebGL canvas for
  Effekseer with `premultipliedAlpha: true, alpha: true`; 2D canvas for MV
  sheets) inside `.r3d-canvas-wrap`, moved by `_updateEffectPreview` each
  tick; sized to the model's on-screen height × effect scale. Inline
  animation effects on rules preview at the origin now (they did not before).
- Markup-escaping guard: an i18n key ending in `.name` inside `${…}` reads
  as a field access — keys are `r3dfx.effectName`, not `r3dfx.name`.
- Not done: anchors in 2D sprite mode, per-effect rotation/mirror, effect
  tracks on the rule timeline UI beyond the name step, deleting an SE from
  the runtime SE cache.

## Model Props (2026-08-29, owner: "computer consoles in a 3D map")

- Palette M tab (`TilesetPaletteViewer.tabIcon('model3d')`, container
  `model-props-ui-container`) → `ModelPropsManager` (main.js creates it on
  map load, `projectController.modelPropsManager`; `activate()` disables the
  tile painter and binds PIXI pointer handlers on the tilemap container,
  `deactivate()` restores it). Panel: model list from
  `ModelGraphicPicker.listModels`, thumbnail via `RREventPreviewModels`,
  Size/Scale/Facing/Lift/Passable, Remove/Deselect. Fields become the
  selected prop's values and edit it live.
- Data: `RRMapElevation.props/addProp/updateProp/removeProp`; a sidecar with
  only props is kept. Runtime: `Reactor3D.installProps` → synthetic events
  at `PROP_EVENT_BASE + id` with `reactorProp`, page `through = passable`,
  `directionFix`, empty list; `installPropHooks` (from reactor_sprites.js)
  sets fractional `_realX/_realY`, `_reactorLift`, and pins `isMoving()`
  false (else `updateMove` slides the event home to its cell — seen in the
  harness as x drifting 12.35→12.29). Verified in game: event exists, faces
  6, `canPass` into the Buick's footprint false, passable bike true, lift 1.
- 3D editor: `buildProps` after `buildEvents` (own `propGroup`, instances
  tagged `userData.propId`), pointer-down order: prop ring → prop pick/drag
  → ground click places (with a chosen model) → else events/orbit. Rings
  come from `utils/PoseRings3D.js` (extracted; the video-surface manager
  still carries its own copy — fold it in when touching that code next).
- Not done: undo/redo for props (events have it; props edit the sidecar
  directly), a prop context menu, multi-select, snapping to the grid in 3D,
  and per-prop animation rules (a prop's model.json rules would run through
  the event-model driver already — untested).

## 3D View Memory + Preview Rebuild (2026-08-29, owner-reported)

- Preview Event chosen in 3D never rebuilt the 3D event layer (rebuild
  generation stayed put; harness `preview3d`), so vehicles appeared only at
  the next open. `setEventPreview` now calls `refreshMap3DView`.
- The 3D toolbar box is a per-map, per-project memory in localStorage
  (`rrMap3DViewMaps:<projectPath>` → `{ "<mapId>": true }`), off until
  ticked; `refreshMap3DView` reconciles on every map load, so switching maps
  switches the view, and reopening restores it. `OptionsManager.map3DView`
  remains only the crash-safety flag; a detected crash sets
  `_map3DCrashGuard` so remembered maps stay 2D until ticked by hand.
  Chosen over the sidecar so a view toggle never dirties the map; the
  trade-off is that the memory is per machine.

## 3D Camera Modes + Change 3D Camera (2026-08-29)

- `Reactor3D.Camera` lives at the end of `reactor_3d.js` (the foundation test
  keeps the 3D subsystem to one runtime file and the js/ root at 13). It
  loads before the game classes, so `installHooks()` + `registerCommands()`
  are called from `reactor_sprites.js` next to `updateReactor3DCamera`, which
  delegates to `Camera.update(spriteset)` and keeps the old display-following
  aim as the fallback.
- Modes: fixed 55°/fov 30 over the display centre (unchanged default),
  topDown 89° (90 degenerates `lookAt`), isometric 35.264°/yaw 45/fov 15
  (perspective with a narrow FOV, not an OrthographicCamera, so projection,
  `standScaleAt` and the billboard shader are untouched; `frameDistance(fov)`
  keeps the tile scale), thirdPerson 25°/distance 8/lift 1 behind the player
  (`yawForDirection` 8→0 2→180 4→270 6→90, yaw override adds), firstPerson at
  eye height 0.8 looking along the facing, party sprites + billboards +
  models hidden via `Reactor3D.characterHiddenByCamera`.
- State: `Game_Map._reactorCamera3d` (saved), reset on `setup` to
  `mapDefault($dataMap)` unless `$gameSystem._reactorCamera3d` (command's
  "keep"); tween `{frames,total,from}` counted down in `step`, `from`
  captured from the spriteset's `cameraCurrent` on the first update so a
  command issued before the scene is built still lands (verified:
  `cam-debug.cjs`). Wait mode `reactorCamera3D`.
- Editor: Map Properties 3D options gain Default Camera + pitch/yaw/
  distance/FOV (blank = mode value; `RRMapElevation.setCamera` drops the
  record for the stock view). `Camera3DEditor` modal (keyed `cam3d.*`
  strings) reachable from the picker's 3D section, event pages and Common
  Events; Troops fall through to the generic plugin-command editor (camera
  is map-only). Verified in the running game for all five modes with
  `cam-game.cjs` screenshots (DemoCopy, striped test walls).
- Not done: the editor's 3D viewport still uses its own flight camera; a
  "view through the map's default camera" toggle would help isometric/
  top-down authoring. No per-event camera targets beyond focus; no cutscene
  paths (a sequence of Change 3D Camera commands with waits does that).

## Map Room + Map Audio Picker (2026-08-29)

- Map Properties has a 3D section. `map-3d-checkbox` is the `<3d>` note
  (hidden from the note textarea, written back on save; a typed tag counts).
  Under it: Room Height (1-512 tiles, the map size ceiling, default 4) and Parallax Floor / Walls /
  Ceiling from `img/parallaxes`. Stored as `reactor3d.room` in
  `Map###.r3d.json` (`RRMapElevation.room/setRoom/setMode3D`; the room is
  dropped when all defaults, and a sidecar holding only a room is kept).
- Runtime revision `20260829.17`: `Reactor3D.roomFor` + `MapScene.addRoom`.
  Floor a layer step under the parallax grounds, ceiling at `height` facing
  down, four `FrontSide` walls facing inward (image height = wall height,
  repeats along the wall by aspect). The near wall and the ceiling are
  back-face culled from the usual camera, so the room reads as a room from
  outside and from inside. `MapScene.clear` counts `_build` so a late bitmap
  load cannot add to a rebuilt scene. The editor's `loadParallaxes` fetches
  the room images. Verified in the real editor (walls stand on N/E/W, south
  culled, ceiling hidden from above) and the running game (`room-flow.js`,
  `vs-game.cjs` in the scratchpad against a DemoCopy with `!TestWall.png`).
- Map Properties BGM/BGS: track row + levels line, `Choose…` opens
  `RRAudioPickerModal` (levels cards on); the dropdown, inline transport and
  volume/pitch/pan steppers are gone. `_mapAudio` holds the choice.
- **Next (owner direction): vertical events.** With a room the map has a Z
  axis, so events need a height of their own: a character `z` in tiles
  (float) seeded from the painted elevation under it, `Sprite_Character` /
  the billboard placing the sprite at `z`, move-route steps that change it
  (up/down a level, jump to a level, ramp along stairs by interpolating
  `elevationAt` across the step), per-level passability (regions or terrain
  tags naming floors so a two-storey room does not collide across floors),
  and an elevator = an event whose `z` animates while the player stands on
  it. Nothing in `Game_Map` knows about height yet; the sidecar's elevation
  is render-only. Start with the character `z` + billboard placement + two
  move-route commands, then passability.

## Native Media, Resource, And Toolbar Pass (2026-08-28)

- **Video Surfaces:** `runtime/reactor_media_surfaces.js` (named `reactor_video_surfaces.js` until 2026-09-03) owns the canonical
  Show/Transform/Stop implementation; runtime revision `20260828.3` adds it to
  the boot manifest and is synchronized across all ten bundled projects. Commands
  remain code 357 under `RPGReactor`; stock movie command 261 and
  `PSYCHRONIC_VideoOverlay` are untouched. Screen coordinates are absolute
  pixels, map X/Y are tiles, event/player X/Y are anchor-relative pixels, and
  all corners are local pixel offsets. Since revision `20260829.16` map/event/
  player surfaces stand on their anchor (centre lifted by half the scaled
  height) in 2D as well as 3D; screen surfaces stay centred. Runtime PIXI/Three backends cover waits,
  persistence, autoplay retry, culling, audio/playback rate, layers, scanlines,
  map/event/player/screen binding, same-map suspension, and deterministic
  cleanup. Runtime PIXI handles 2D/all screen targets, projectively warps corners,
  ignores Z (3D elevation only; the drag is the whole 2D placement), and
  measures culling in screen pixels; rectangular Three.js planes
  handle 3D map/event/player targets with Z/world-camera culling and ignore
  corners. `VideoSurfacePreviewManager` scans pages, resolves sparse transforms,
  owns every resource, and exposes direct move, anchors, synchronized fields,
  and source navigation. Preview PIXI warps projectively; 3D-screen DOM changes a
  bounding-box clip without perspective-correct pixels; Three.js stays
  rectangular. Editor previews omit scanlines; only Three.js previews apply
  culling. The map
  display is deliberately an authoring composite: each page is reduced
  independently without evaluating page conditions/runtime command flow, and
  preview media is forced muted/looping while playtest honors authored settings.
  Preview state never enters map JSON or 3D sidecars. Common Events use the
  isolated editor preview; Troops allow Stop only. 2026-08-29: PIXI previews
  keep a placeholder texture until the movie's first frame (PIXI's
  `VideoSource.load()` restarts the element load, which aborts any earlier
  `play()`; never call `play()` before it, let `autoPlay` do it); edge handles
  resize along their normal (`resizeEdge`), corners warp; `revealAuthoringSurface`
  pans the surface clear of the live panel, which is draggable by its title.
  `convertTargetPosition` keeps the surface in place when the target changes;
  `_syncTargetFields` greys the Event control beside Target (naming this event, Player, or None) and hides Z/culling when the target has no use for them; panel drags blur the active control so a native dropdown cannot stay behind;
  `_popOut` adopts the panel element into a child NW.js window
  (`editor/video-surface-panel.html`, stylesheets copied, `close()` docks first).
  3D authoring: `_buildSurfaceRings` ports ModelGraphicPicker's pose rings
  (torus yaw/pitch/roll, gimbal-nested, screen-distance picking in
  `_pickSurfaceRing`, plane-drag angle in `_dragSurfaceRing`) around the
  authoring Three owner; `_attachThreeInput` tries a ring grab before a move
  and emphasises the hovered ring.
  `editRecord` opens a saved surface's Show command from a click on any backend
  (its own preview hides via `replacedKey` while editing); `context.fromMap`
  adds Go to Event. `EventCommandList` names `RPGReactor` 357 commands by
  their label rather than Plugin Command. `PIXI_BANDS` (`under`/`mid`/`over`/
  `top`) are roots inserted into the tilemap container at the game's z
  boundaries (`_placePixiBands`); `_updatePixiOwner` re-parents on layer change.
  The 3D backend already mirrored the runtime (`layer >= 5` above pass,
  `renderOrder = layer * 1000 + depth`). Editor previews now draw scanlines
  (PIXI multiply mesh, Three repeat texture, DOM gradient; 1px line every
  2px, alpha = scanlines * 0.5, the PSYCHRONIC_VideoOverlay pitch); panel numbers
  clamp to their range on input/change; `setEnabled` backs the toolbar Video
  box (`OptionsManager.showVideoPreviews`). EventManager's Preview Event
  (`_eventPreviewMenu`/`setEventPreview`/`renderEventPreviews`) stores
  `map.reactor3d.eventPreviews[eventId] = pageIndex` and MapElevation keeps
  the sidecar for it; previews render under `eventContainer` in 2D, and in 3D
  `MapEditor3D.previewPageIndex` swaps the billboard to the chosen page.
  Stepping pages animate (0,1,2,1 at `(9 - moveSpeed) * 3` frames) through a
  PIXI ticker in 2D and `animateEventPreviews` in 3D. Model-bound pages use
  `utils/EventPreviewModels.js` (`templateFor`/`instance`/`thumbnail`): the
  placed model in 3D, a front orthographic render at footprint size in 2D
  (three.js is loaded on demand for it). Runtime `Reactor3D.updateMapModelSprite`
  (revision `20260829.6`) gives model-bound characters on flat maps the same
  render as their sprite through `paintBattlerFrame` with `state.copyOnly`
  (canvas path: the shared-context target the battlers adopt is wiped by
  PIXI's next canvas upload unless repainted every frame); `Sprite_Character.updateVisibility`
  only hides model/billboard characters when a 3D scene draws them.
  `Reactor3D.mapMode`: the note (`<3d>`, or `meta['3d']`) is the switch and
  the sidecar may only downgrade to `2d`; `DataManager.loadMapSidecar` fetches
  for any map whose file exists on disk (web: note or database sidecar), so
  flat maps keep their event models/previews. Sprite-mode models pose with
  `applyEventModelPose` and animate with the scene's driver (no scene-side
  effects). `startPlayback` (PIXI) waits for `loadedmetadata` before
  `VideoSource.load()`: an async PIXI load restarts the element's own load,
  whose `abort` the runtime treats as failure (why 2D video failed silently).
  `Reactor3D.frameModelSprite(object, unit, camera)` (revision `20260829.9`):
  orthographic camera pitched `MODEL_SPRITE_PITCH` (55, the 3D view default)
  about the model's ground origin, frame = bounding sphere (constant across
  turns), anchors 0.5/0.5 with the runtime adding half a tile so the origin
  sits on the tile centre; the editor thumbnail uses the same helper and
  places the sprite at the tile centre. Revision `20260829.10`:
  `paintModelSpriteCanvas` (defined before the battler painters) keeps flat
  maps off the shared viewport; `clearUnpackState(gl)` precedes every three
  renderer created on PIXI's context (runtime and editor);
  `updateOffscreenCulling` calls `update()` on culled sprites and
  `Sprite_Character.update` runs `updatePosition()` before its culled
  early-out (plugins read `this.x/y` after wrapping it); event priority 3
  (`event.aboveCharactersSorted`): `screenZ` 5, `Spriteset_Map.update`
  collects `_reactorSortedAbove`, `Sprite_Character.reactorSortedZ` lifts an
  overlapping character in front (feet lower) to z 5 so the tilemap y-sort
  orders the pair; MZ itself reads priority 3 as z 7 (above), passability is
  the tile's. 3D is deliberately left as it was after the 2D fix: the page is
  an ordinary depth-tested billboard there (facade snap and bias apply as for
  any event). Three 3D variants were tried on 2026-08-29 (depth-free
  distance sort, depth-tested without writing, and a map-space lift that
  repaints lifted characters after the event); each fixed one case and broke
  another for model characters, so they were reverted. Standing inside a
  painted 3D object's rows is occluded by that object's geometry regardless
  of the priority; pixi_compat
  replaces PIXI's deprecated Graphics shims with silent equivalents. Plugin
  defect fixed in the Demo's RaveLighting: beam sprites cached across scenes.
  3D: `_threeGroupFor` puts layer >= 5 into `aboveBillboardsGroup` and
  `MapEditor3D.render` gives that group its own depth-cleared `overlay` pass
  (hidden during the star-tile `above` pass), matching the runtime's third
  slot; lower layers depth-sort with the models. Depth (revision
  `20260829.4`) is the 3D forward/back control: `worldZ = feetRow + 0.5 +
  depth` in both runtime and editor (the 3D drag subtracts it back), so a
  surface is pulled in front of the reactor without moving its 2D feet row.
  In 2D depth stays the sub-layer sort key.
  Verified through a WebDriver NW.js harness (real pointer events, pixel readback).
- **Transactional model import:** Resource Manager keeps the `3d/` category
  `readOnly` for deletion but sets `allowImport` for one model-creation path.
  GLB, OBJ, FBX, STL, USDZ, 3MF, and DXF geometry is validated; GLB dependencies
  must be embedded and `.blend` is refused with export guidance. A user-named
  nested destination receives `source/<case-preserved filename>` and empty
  `textures/`. Source/project/staging identities, a per-destination lock, and an
  atomically created exact destination reservation are checked before publish;
  ordinary concurrent creators cannot be replaced. Windows removes only its
  owned reservation before relying on Windows rename's no-replace behavior.
  Existing folders are never merged or replaced, and failures clean owned
  staging and newly created empty parents.
- **Image formats:** shared editor/runtime resolution now supports PNG,
  JPG/JPEG, WebP, safe SVG, and GIF. PNG remains extensionless; explicit modern
  extensions remain stored and retry legacy `<name>.<ext>.png`. Import validates
  signatures and permits only restricted self-contained SVG content. Encrypted
  decoding preserves MIME, WebHost serves each format correctly, and animated
  GIF sprites/tiling sprites refresh their PIXI sources while visible. This pass
  covers converted battleback/parallax/enemy-detail/title/animation/event
  character-face/Change Actor Images/Change Vehicle Image/System 1 vehicle/
  Picture/Reactor UI Picture consumers. Tilesets, plugin-parameter fields,
  database actor/list thumbnails, Reactor UI character/face/party-face/System/
  Title/Icon sources, balloon sheets, and fixed sheets such as IconSet retain
  PNG-oriented/storage contracts.
- **Preview lifecycle:** actor/model selection generation-cancels stale loads,
  disposes superseded templates, avoids the HiDPI resize feedback loop,
  deduplicates concurrent thumbnail renders, and performs one close refresh.
  Shared cleanup releases cloned geometry, materials, textures, object URLs,
  controls, renderer resources, and WebGL contexts.
- **Desktop codecs:** eligible full desktop packages default to an exact-version
  `nwjs-ffmpeg-prebuilt` overlay. Acquisition uses checked-in trusted archive
  hashes plus binary validation and a separate cache; disabling the option
  reacquires a clean official runtime. Packages carry
  `rpg-reactor-codec.json`, `RPG_REACTOR_CODEC_NOTICE.txt`, complete LGPL text,
  immutable build/source revisions, hashes, and patent guidance. Minimal/Web
  packages never include an overlay.
- **Toolbar SVGs:** the current set includes Undo, Redo, single tile, rectangle,
  circle, Fill, Shadow Pen, Eraser, Auto, Layer 1-4, Database, Plugins, Resource
  Manager, Audio, and Forge. Fill is a traditional pouring bucket; Shadow Pen's
  cool-metal nib applies a black tile shadow with no spark cues; Undo/Redo are a
  mirrored curved pair. New/Open/Save/Playtest/Event remain their existing PNGs,
  so this is an expanded themed set rather than a claim that every toolbar image
  has been converted.

## GitHub Fix Batch (2026-08-28)

- **#6 Resource Manager:** Tools opens a recursive searchable catalog spanning
  every MZ image/audio category, effects, movies, fonts, application icons, and
  Reactor 3D models, with categories locale-sorted and a dedicated futuristic SVG
  toolbar icon. Image, audio, video, and font previews share the editor's safe
  asset resolver; 3D reuses the existing Reactor3D loader, texture resolution,
  camera, orbit/zoom, and cleanup path. Existing 3D content remains deletion-
  disabled, while the dedicated transactional model import above creates new
  validated folders without merge or replacement. Ctrl/Cmd and
  Shift multi-selection batch-exports decrypted assets while preserving nested
  paths. Effects remain metadata-only. Desktop batch imports validate names,
  extensions, PNG signatures, existing subfolders, collisions, symlink ancestry,
  current project identity, and the live project lock before an atomic write.
  Encrypted projects receive correctly encrypted bytes or fail closed; exports
  are decrypted. Delete rechecks physical identity and warns that references are
  not scanned. Web remains browse/preview/export-only. Regression coverage spans
  catalog/encryption/format twins, paths, ownership, ordinary import/delete,
  model geometry, staging, destination races, rollback, and shell integration.
- **RPG Catalyst community link:** `https://rpgcatalyst.com` is available from
  both Help menu implementations, the projectless welcome screen, and About.
  Desktop activations route to the user's default browser, and the product name
  participates in all 18 locale dictionaries without translation.
- **Plugin Manager link and scrollbar polish:** parsed plugin URLs now route
  through `nw.Shell.openExternal()` to the user's default browser instead of a
  child NW.js window. Main and nested Plugin Manager scroll regions share the
  slim accent scrollbar and derive track, thumb, and hover colors from the theme.
- **Animation database polish:** the full Animation index now owns a stable native
  scrollbar extent. Preview battlebacks use the shared recursive image browser;
  effect files use a wide folder/search/alphabet browser beside their live preview;
  and timing sounds use the shared audio picker with volume, pitch, pan, seek, and
  nested folders. Pan persists through both animation formats, Duration has themed
  step controls, stale Effekseer loads are generation-guarded and released, image
  picker utility actions have visible theme contrast, and the Forge spark sits
  separately in the anvil's upper-left corner.
- **#27 multiple enemy action conditions:** action patterns now hold an AND list
  authored through named Turn, HP, MP, TP, User State, Target State, Party Level,
  and Switch rows; no checked rows remains Always. Target State derives living or
  dead candidates from stock skill scopes before normal target selection. Legacy
  actions still use their original triple, edited actions mirror the first list
  entry, unsupported plugin records survive, malformed entries fail closed, and
  all dispatch helpers are actor-safe on `Game_Battler`. Four phrases are reviewed
  in all 17 non-English locales. Runtime revision `20260828.2` refreshed the
  bundle (since superseded by `20260828.3`).
- **#26 complete image browse controls:** the recursive preview picker now backs
  all eight bare image-name fields in Show Picture, Change Battle Background,
  Change Parallax, Change Actor Images, and Change Vehicle Image. Character and
  face picks also synchronize their sheet index. Map Properties and Troop
  battleback dropdowns retain their fast text lists and add Browse controls;
  parallax and battleback clearing use the picker's pinned `(None)` action.
  Nested relative names remain unchanged, event-command pickers stack above
  their parent dialogs only while open, and five phrases are reviewed in all 17
  non-English locales.
- **#25 Add State Normal Attack:** Add State exposes and preserves RPG Maker
  MZ's `dataId: 0` sentinel, including existing effects and interaction round
  trips. Remove State still lists only real states, and its zero value is no
  longer mislabeled as Normal Attack.
- **#24 Effekseer preview repair:** plugin animation parameters and Show Battle
  Animation use the live picker; direct project paths, synchronous cached
  loads, repeated pending selections, opaque additive compositing, and a
  remembered light/mid/dark backdrop are handled. The Animations page blits its
  battle scene into WebGL before background capture, avoids unchanged uploads,
  restores shared GL state, and applies effect-file transforms. Editor, Forge,
  and game matrices now share aspect-correct positive-Y projection and authored
  X rotation. Runtime revision `20260828.1` upgrades existing 0.98.4 projects
  once while preserving plugins, with `reactor_main.js` copied last so an
  interrupted refresh retries.

## GitHub Fix Batch (2026-08-27)

- **#20 recursive asset folders:** `PickerIndex` and `AudioPickerModal` share an
  arbitrary-depth folder tree with descendant totals, full relative values,
  selected-ancestor expansion, search filtering, and accessible keyboard
  toggles. Characters, tilesets, database images, title images, models, and
  message faces opt in; flat folders keep their A-Z sections.
- **#21 asset URLs:** `EncryptedAssets.fileUrl` uses standards-compliant file
  URL conversion for POSIX, Windows drive, and UNC paths. Character, face,
  battler, tileset, event-face, database-icon, and IconSet previews use the
  shared resolver. Reserved characters and Unicode round-trip;
  encrypted/WebHost behavior is unchanged.
- **#19 scaled windows:** Reactor writes world-scaled filter dimensions and the
  PIXI 8 compatibility step localizes dimensions as well as position. Plugin
  and stock-style producers, rotation/reflection, zero scale, and old PIXI are
  covered; all runtime copies are synchronized.
- **#18 complete:** Plugin Manager and Plugin Command Editor share annotation,
  widget, complex-codec, and database-reference helpers. Choices, all 19
  database/System reference types and arrays, colors, Boolean labels,
  multiline values, and recursive structs preserve RPG Maker storage. MZ 357
  commands regenerate readable ordered 657 rows, preserve rows unknown to
  partial metadata, and remain atomic across map, Common Event, and Troop edit,
  insertion, selection, and clipboard paths. Malformed complex values stay raw
  and typed blank defaults save the values displayed by their controls. The
  broader #22 image-file follow-up is also complete: `img/...` fields use the
  recursive browser and image/dimension preview on desktop and Web, including
  encrypted assets and key recovery.
- **#10 editor-only database names:** the eight player-facing database types
  store optional labels in `data/Database.names.json`, never in RPG Maker data.
  Lists search both names and follow the Editor-first, Game-first, or Game-only
  preference; typed plugin references follow it too. Cancel, Apply, dirty-state,
  Undo, pruning, duplicate, cross-project clipboard, malformed-file protection,
  Web flush, and deployment exclusion are covered.
- **#13 animation-preview fidelity:** MV sprite previews update at the engine's
  60 Hz rate while retaining 15 fps authored cells, with target, screen, and
  hide flashes; MZ/Effekseer previews consume target flashes and finish late
  timing work. Sprite blends and position anchors match rendering and picking,
  static views reseed after edits, Effekseer draw/catch-up/cleanup paths are
  guarded, and zero SE volume survives editing.
- **#12 system-sound variation:** all 24 slots are visible and can keep a stock
  primary plus uniformly selected variants and an optional absolute 50-150
  pitch range. The Cancel-safe modal reuses the recursive audio picker and
  preserves unknown keys. Runtime preload and playback handle complete pools;
  extension-free projects keep exact stock behavior without consuming RNG.
  Older runtimes play the primary; RPG Maker MZ can discard the optional inline
  keys if its own editor rewrites `System.json`.
- **Audio command parity:** Play BGM/BGS/ME/SE now bypasses the duplicated old
  inline browser and opens the current shared Audio Player UI from map, Common,
  and Troop events. Stock command serialization is unchanged. Plugin audio
  arguments share matching loop defaults; the picker now honors native loop
  points and the main player's Wine HTML-audio fallback.
- **Shared album art:** `RRAudioCoverArt.forFile()` owns one Promise cache used
  by the Audio Player, shared picker, System 1 music/system sounds, event audio,
  and plugin audio. The selected header/row loads eagerly and the remaining
  recursive list stays lazy, so one metadata extraction serves every surface.
- **Animation scale/layout:** the canonical workload-aware animation maximum is
  5,000 in database growth, Change Maximum, direct Show Animation IDs, tests,
  and documentation. The editor keeps SE/Flash timings in a separate right-side
  scrolling column; the Properties, sprite sheets, frames, and preview retain
  a stable content column, with narrow container reflow below it.
- **State and shared database polish:** State Duration and Messages are
  controls-first aligned grids, conditional rows remain symmetric, and `%1 =
  Actor / Enemy Name` is visible beside message authoring. Actor, Class, Weapon,
  Armor, State, and Enemy trait headers no longer render an empty indicator-cell
  spur. Database lists use a themed scrollbar, Change Maximum hides the native
  spinner without losing keyboard stepping, and recent System/audio/plugin
  controls preserve theme, focus, Escape, backdrop, and responsive behavior.

## Environment

The owner's Windows laptop (the Dropbox-synced working copy) has **no Node,
no npm and no Git on PATH** — PATH is the system directories plus
`~/.local/bin`, and there is nothing under Program Files. So `npm test`,
`cut-release.cjs` and every `.cjs` build script **cannot run there**; the
Linux box is the one that can (handoff notes referencing `/var/tmp/rr-scratch`
are from it). What does work on Windows, and is enough to profile and verify
the running game, is written up in the 2026-09-02 section above:
`nwjs-win\nw.exe` with `--remote-debugging-port` driven over CDP, and
`nwjs-win\nwjc.exe` as a compile check. It is also a genuinely useful
reference machine — a Ryzen 5 PRO 5650U with integrated Radeon is exactly
the "potato PC" the owner wants the engine to run well on, and four of the
seven faults found on 2026-09-02 were invisible anywhere else.

## Open Threads (pick up from here)

Reviewed 2026-09-04; see [Current project status](STATUS.md) for current priorities
and verification limits. Measurements below retain their original workload/date
context and should be repeated before selecting an optimization.

Performance, highest value first:

- **The lit shader never reads a normal.** `lightGlsl` builds
  `rrLight(p)` from distance and cone angle only — there is no N·L term, and
  the materials it patches are `MeshBasicMaterial`. So a model's normals do
  not reach the image at all: geometry buys **silhouette and UV mapping**,
  nothing else. That is the licence to decimate hard — the usual reason to
  keep triangles on a character (shading breaking up over a low-poly
  surface) does not apply here, and normal maps would do nothing either
  until the shader gains a lighting term. Worth re-reading this note before
  anyone adds one.
- **Generated distance levels remain open.** The optimizer now reduces base
  skinned geometry with joint/weight handling (see the 2026-09-02 character
  reduction notes); the former claim that skinned meshes cannot be reduced is
  obsolete. Automatic skinned distance levels are still absent, and both import
  presets disable separate LOD-file generation. Runtime `pickLod` still supports
  existing files. Deriving levels in a worker and caching them per machine is a
  proposal; validate animated joints as well as still silhouettes.
- **Per-object light lists.** Measured at roughly **1.1 ms per visible light
  per frame** at 1280x720: a viewpoint with one light in view renders in
  ~4.2 ms of GPU, one with nine in view takes ~13.5 ms for the same
  geometry. Every lit fragment loops over every uploaded light although most
  surfaces are reached by one or two. Frustum culling (2026-09-02) removed
  the lights that reach nothing visible; this removes the ones that reach
  nothing *on this object*. Output is identical. The obstacle:
  `lightUniforms()` is one shared block bound to every lit program, so the
  list has to be packed per draw — a mesh `onBeforeRender` rewriting the
  shared arrays and `rrLightCount`, or per-material uniform objects. Wants
  the test suite. **This is the largest lossless win left.**
- **Anchored effects copy between WebGL contexts every frame.** The overlay
  is its own context, so an effect's pixels go out to a 2D canvas and back
  up as a texture. 2026-09-02 bounded the cost (`BUDGET_WEAK`) rather than
  removing it; rendering the effect into a three render target in the shared
  context would remove it, and would also retire the readback that is still
  the single most expensive call in the frame.
- **Single-face spot shadows: measured and rejected**, see the dated note.
  That 2026-09-02 experiment found sampling dominant. The current atlases
  redraw dirty rows within per-frame budgets, so zero shadow rendering per
  frame is not a general claim about the current scene.
- **A frame-time governor.** The GPU tier is a name denylist, which by
  construction fails open — it missed the second most common integrated
  family for a whole release cycle, and will miss the next one. Something
  that watches actual frame time and steps settings down would catch an
  unknown GPU without anyone having to name it. `adaptiveResolution` is the
  shape of this but is resolution-only and off by default.

Feature work, in the order the owner has been asking:

- **Rigging backlog** (see the rigging sections below): weight-painting
  brush; camera-relative preset mirroring (poses assume +Z facing);
  death/knockback presets; bird/fish templates; retargeting clips between
  same-template rigs; a terrain-driven rule-set switch so Swim is automatic;
  decimation guidance for Meshy-scale models.
- **Custom user interfaces** - the current Reactor system is complete through
  typed Lists/contexts, actor bindings/tokens, expanded Gauges, seven generated
  baselines and replacement roles, functional Options and Save/Load, styling,
  focus overrides, and transitions. Remaining product scope is dedicated
  workflow adapters for any future Item/Skill/Equip/Shop/Formation/Name Input,
  message-input, or Battle replacement. There is no active next interface task;
  the standalone MZ plugin is explicitly deferred per owner direction.
- **Stock MZ battler motions are not mapped to model actions** — a 3D
  battler plays its ambient rules and named actions, but walk/attack/damage
  motion cells do not yet trigger model animations.
- **Animation-preview follow-up:** broader asynchronous Web-host effect loading
  remains separate. Desktop background capture/compositing is complete in #24.
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
- **WebGPU**: parked, and 2026-09-02 measurement supports keeping it parked.
  Three's WebGPURenderer is a different bundle and material surface; our
  offscreen-renderer → Bitmap → PIXI pipeline is portable in principle but
  not a drop-in swap. Two harder facts on top of that: a canvas has one
  context type and WebGL/WebGPU **cannot share textures or buffers**, while
  this engine's design is three rendering into PIXI's *same* GL context — and
  PIXI's WebGPU renderer and three's each own their own `GPUDevice`, so a
  mixed frame needs a CPU round-trip, the pattern that already costs 7 ms in
  the anchored-effect path. And it would not help the current bottleneck
  anyway: the frame is vertex-bound with the CPU ~55% idle, and WebGPU saves
  driver overhead, not shading. Its real argument is compute — skinning once
  into a cached buffer, GPU culling, clustered lights — most of which is
  reachable in WebGL2 first.

Content and tooling:

- **Demo art gaps** (owner replacing stock assets as originals are made):
  `img/characters/Actor1` (actors 2–8), `sv_actors/Actor1_2..8` and
  `Actor2_2`, all five enemies have no battler art on disk, and
  `docs/demo-missing-se.md` lists the 121 SE names animations still
  reference. Intentional Demo removals must be staged with `git rm` or the
  completeness test fails.
- **Translations are stored and reviewed locally, by decision (2026-08-25).**
  The owner does not want the app depending on an online translation engine,
  so the obsolete Microsoft-based generator was deleted. The checked-in
  `I18nDeepTranslations.js` remains the broad offline baseline;
  `I18nReviewedTranslations.js` is the maintained final-precedence layer for
  exact text, keyed UI, event commands, and event sections. Add new phrases to
  all 17 non-English locale maps there. `i18n.test.cjs` enforces source
  coverage, locale parity, placeholders, reviewed precedence, known
  wrong-language regressions, Thai normalization, and Polish event coverage.
- **GitHub feedback round-up, open items** (the closed ones are in the
  cycle note below): documentation/wiki and a compatible-plugin list;
  Android APK and ARM64 (RG34xx-class) game deploys; a plugin boilerplate
  generator in the Forge or Plugin Manager; an action battle system under
  System 1. Gamepad and touch already work in games (stock `Input` /
  `TouchInput`).
- **Audit backlog** (`AUDIT-BACKLOG-2026-07-25.md`) still awaits owner
  decisions on three authored-data items; these are authored-data/format questions rather than identified code defects.

## Manual Release Gates

The real Chromium Web persistence and Linux NW.js launch/save smokes are now
automated in CI. The following visual and native signing checks still require
release hardware.

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
- Check a directional/model Effekseer effect in the Animations page, event
  picker, plugin picker, Forge, and a playtest; confirm it stays upright and its
  depth/facing matches. Check additive effects on all three picker backdrops and
  a distortion effect over an enabled battleback. This is the remaining manual
  visual gate for #24.

Windows 3D-checkbox crash: **resolved and confirmed on native Windows
2026-08-22** (inline three.js injection overflowed the 1MB main-thread stack;
Blob-URL loading fixed it in 0.98.2 — `f3f87cc`, `97e0457`).

---

# Cycle Notes (newest first)

Engineering notes and gotchas from each piece of work, kept because the
suite and the next session both lean on them. Shipped-cycle narrative starts
at *History* below.

## Effekseer Preview Repair and Add State Sentinel (2026-08-28)

- `AnimationPickerModal` is now the common visible animation chooser for
  database fields, plugin references, and battle-animation commands. Pending
  effects are cached by name and generation-gated, so selecting the same effect
  during a load cannot create two handles or requestAnimationFrame loops.
- Standalone pickers share a persisted three-swatch backdrop. Their WebGL
  canvases are opaque, while the Animations page instead uploads its battleback,
  target, and flash scene into the effect context before background capture.
  Uploads occur only after the Canvas2D scene changes.
- The old `180 - rotation.x` compensation was removed everywhere. Positive-Y,
  aspect-correct projection keeps 2D direction upright without reversing model
  Z/depth. The editor's effect-file preview now applies authored transforms.
- Runtime revision `20260828.1` closes the same-version deployment gap. The
  marker file is copied last, making it a reliable completion marker after a
  failed runtime refresh.
- Add State code 21 alone offers `dataId: 0` as Normal Attack. Remove State has
  no runtime sentinel and remains limited to real state IDs.

## Persistence, Lists, HUDs, Replacement Scenes, GUI Smokes (2026-08-27)

- `ProjectController.saveAll` now awaits the Web host's IndexedDB `flush()`
  before advancing saved-state snapshots or reporting success. A failed
  transaction restores the prior dirty baselines and reports a browser-storage
  save error. The real Chromium smoke gates that flush, proves Save stays
  pending, checks `project.rpgreactor` in IndexedDB, reloads, and verifies the
  saved token comes back.
- Reactor-authored `Database.r3d.json`, `Map###.r3d.json`,
  `Tilesets.r3d.json`, `model.json`, and `model.rig.bin` use the shared atomic
  writer on desktop. Missing sidecars remain a valid empty state; malformed or
  unreadable sidecars are no longer treated as empty and cannot be overwritten
  by the next edit.
- List nodes bind to party members, categorized inventory, actor skills,
  parameters, equipment, states, Options, save slots, variable ranges, or
  literal rows. Every typed row has stable source-qualified identity and is
  published immediately under an authored context name. Text/detail nodes,
  actor-aware nodes, and semantic actor actions can consume that context; List
  confirmation can also write row ID/value before its action. Lists use
  `Window_Selectable` for engine input and scrolling.
- Text, `partyFace`, Gauge, and actor Lists share fixed party-slot, fixed actor,
  current-menu-actor, variable actor-ID, and named-context actor bindings.
  Tokens cover actor identity/level/profile, resources, EXP, and parameters.
  Gauges cover HP/MP/TP, level-relative EXP, MHP/MMP, all combat parameters,
  and variables, with authored maximums, value formats, colors, back color, and
  bar height. Actor parameter/equipment/state Lists feed the Status baseline.
- Generated records append at stable IDs: 1 Title Screen, 2 Main Menu, 3 Game
  End, 4 Status, 5 Options, 6 Save, 7 Load. Existing interface files are not
  regenerated. The Demo carries all seven records and no System replacement
  binding, so it remains stock by default.
- Exact replaceable roles are Title, Main Menu, Status, Game End, Options, Save,
  and Load. Records are explicitly role-tagged. Zero, missing/malformed,
  overlay, ID-mismatched, and role-mismatched bindings fall back to stock.
  Routing wraps the latest plugin `SceneManager.goto/push` after plugins load.
  Item, Skill, Equip, Shop, Formation, Name Input/message inputs, and Battle
  remain stock/unreplaceable. Main Menu can choose an actor, then launch stock
  Skill/Equip or configured Status.
- Options rows mutate MZ configuration and persist it on termination. Save/Load
  rows expose slot metadata and enabled state; async actions lock duplicate
  activation, preserve stock lifecycle order, recover on failure, and enter the
  map only after successful Load.
- Typography covers face/size/bold/italic/color/outline/letter spacing;
  nine-slice is restricted to Picture/System images. Buttons and Lists have
  inheritable focused/pressed/disabled overrides and directional focus targets
  with geometric fallback. Scene transitions are none/fade/slide-left; overlays
  are display-only/input-transparent and can fade with visibility.
- `npm run smoke:web` and `npm run smoke:nw` use a dependency-free W3C
  WebDriver client. CI runs them in a separate job; the NW.js 0.107.0 SDK
  archive is hash-verified before use. The NW smoke launches the actual editor,
  saves a temporary project through `ProjectController`, and checks the native
  file without initializing map rendering.

## Interface Capture from Game (2026-08-25, owner: "see the current menus, with plugins")

- The only faithful source is the running game, so the tab launches the
  playtest process with `test&rrcapture=<scene>&rrcapturedir=<dir>`; the
  runtime writes and exits (Demo main menu: 1.4 s). Windows path caveat:
  the mode token rides in the profile path on win32 (`optionToken`), and
  `encodeURIComponent` output (`%`) is valid there; untested on Windows.
- Capture folder: `RREditorCache.dir('InterfaceCaptures', projectPath, scene)`
  → `~/.cache/rpg-reactor/interface-captures/<sha1-16>/<scene>/`
  (`%LOCALAPPDATA%\RPGReactor\InterfaceCaptures\…` on Windows). The
  reference layer is per open view: nothing is restored on a record switch
  or a reopen (owner: a capture "followed" every record and survived the
  database's Cancel), a Clear chip drops it, and picking the scene in the
  dropdown loads the cached capture on demand. Capture itself never saves the
  project; explicit node imports remain unsaved database edits, while Picture
  immediately copies a PNG into `img/pictures`. The status says when there are
  unsaved changes.
- Menus are captured OVER A RUNNING MAP (new game → Scene_Map → 30 frames
  → snapForBackground → push). Booting straight into Scene_Menu crashed
  SSR's `Irina_PerformanceUpgrade` on the missing background snapshot;
  other plugins will assume the same. The capture tick is hooked at boot
  (`beginCapture` wraps `SceneManager.updateMain`); a wrapper installed
  when reactor_ui.js loads was replaced under the MV layer and never ran.
- "I see nothing in User Interfaces" on an older project = no
  `UserInterfaces.json`. `DatabaseManager.loadProject` now seeds
  `RRStockInterfaces.build(data)` (Title / Main Menu / Game End / Status /
  Options / Save / Load, `stock`
  key on each) into that case; a file holding `[null]` stays empty and
  shows the first-run panel. The baselines use the Scene_* rect math with
  `isRightInputMode() === true` (commands on the right). Runtime:
  `partyFace` image source, typed actor bindings and named List contexts. Main
  Menu publishes `selectedActor`; the appended read-only Status baseline uses
  `menuActor`, actor gauges/lists and previous/next paging. Options, Save, and
  Load now have dedicated functional adapters. Item, Skill, Equip, Shop,
  Formation, Name Input/message inputs, and Battle remain stock.
- The title also needs `setupNewGame` first (title plugins read game
  objects); `extract.canvas` must be given the screen `frame`, or a stage
  whose bounds include an off-screen sprite asks for a texture too large
  ("Array buffer allocation failed" in the Demo battle). A crash inside
  the captured scene is reported through `capture.json` `{ error }`.
- `collectWindows` accumulates parent x/y down the tree (windows sit in
  `_windowLayer`, itself offset); scale/rotation are ignored.
- The web build cannot write files: `capture()` reports "Capture needs the
  desktop editor." rather than launching.
- Live drive: `ui-capture-tab.mjs` (session scratchpad) opens the tab,
  selects a record (the detail does not render until one is), presses
  Capture, and reads the list; `capture-run.mjs` exercises the runtime
  alone from the launch line.
- Owner pass 2026-08-26 (1440p, Windows): the tab scrolled; Delete after
  clicking a node/captured row cleared the *record*; the capture followed
  every record. Fixes: workspace flexes to the window and the canvas fits
  both ways (`--rr-ui-fit`), note folded into General Settings; one
  `onKey` on the wrapper that stops propagation, focusable rows whose
  focus survives `renderTree`/`renderCaptureList` (a rebuild dropped focus
  to the body, where `DatabaseEditorUI`'s document-level Delete lives, and
  that handler now ignores targets inside `#database-detail`); Add Box
  from a capture was a no-op default box because `addNode` returned
  nothing. Live rig: `ui-fit-check.mjs` (session scratchpad; resizes the
  editor window through `nw.Window.get().resizeTo`, measures
  `scrollHeight` vs `clientHeight`, drives a real capture, Add Box, Delete,
  Clear, and a new record): 1080p fits with the canvas at 62 %, 1440p at
  100 %.
- Owner UX correction 2026-08-27: the rejected Interface form slab was removed.
  A single compact toolbar contains Name, Presentation, Use As, Interface
  Settings, and Playtest. Use As retains its searchable checkbox combobox and
  System-pointer-derived Custom semantics. Interface behavior, transitions, and
  Note render in Inspector when no layer is selected; selecting a layer switches
  the header and properties. Practical desktop widths show all three panels in
  one row. At intermediate widths Layers stays beside Layout and Inspector is a
  closable contained drawer, never a second document row; one-column begins only
  below a 620px detail container. Workspace fitting remains `--rr-ui-fit: both`.
  Layers, subtree drag/reparent, pinned Game Reference, capture tray, and explicit
  imports are unchanged.
- Real NW.js validation: `npm run smoke:nw-ui` opens the tracked Demo without
  saving and uses matching Chromium/ChromeDriver 144.0.7559.59. At outer/inner
  1280x720 the detail is 804x590, toolbar 780x70, workspace 780x490, Layers
  230x490, and Layout 538x490. The Inspector is initially `display: none` and
  opens as a contained 390x490 drawer after selection. At 1600x900,
  1920x1080, and 2560x1440 the detail widths are 1124, 1444, and 2084; toolbar
  heights are 48 and workspace heights are 692, 872, and 1232, with all three
  panels in one row. Document/editor scrollHeight equals clientHeight at every
  size, including 1280 after closing the drawer. There is no measured horizontal
  overflow or panel overlap at wide sizes. Game Reference is 30px high and in
  view at 720p; Capture/Undo/Redo are 28px, and Add Node/layer/reorder controls
  are 30px. The pass also opens the Use As popover across the toolbar boundary,
  selects a layer, returns to Interface Settings, and closes the drawer.
  Existing capture files remain scene-elements-then-windows; true mixed plugin
  sprite/window order is not claimed. The editor accepts a future `layers`
  sequence without requiring it.
- **Capture → nodes (2026-08-26, owner: "make it more automatic... creates
  the layers... why only the windows?").** Hooks install in `beginCapture`
  (after plugins), never at load: `Bitmap` primitives log to
  `bitmap.__rrDraws`; semantic wrappers (`drawTextEx`, `drawItemName`,
  `drawCurrencyValue`, `Window_StatusBase.drawActor*`,
  `Window_Command.drawItem`) push coded elements and suppress the
  primitives beneath them via `_captureSuppress`. Text merging is per line
  keyed on y (icons at y+2 → key y−2), gap ≤ 6 px joins, `measured` from
  `measureTextWidth` gives the run end. A subclass override of a wrapped
  method (VisuStella's `drawItem`) bypasses the semantic hook and falls
  back to primitives → Text nodes, not Buttons. **Canvas-painted content is
  invisible** (the Demo's `PSYCHRONIC_MenuManagerMZ` chamfered gauges draw
  on `contents.context` directly): the Picture button copies the captured
  `window-N.png` into `img/pictures/Capture_<class>.png`. Found and fixed
  in passing: `\PCLASS[n]` drew as `[n]` in the game — `currentText`
  ran `convertPartyCodes` but `drawTextEx` did not; `Window_ReactorUINode`
  now overrides `convertEscapeCharacters`. Live rig `ui-capture-nodes.mjs`
  (session scratchpad): blank record + Capture, Picture row, save, boot
  the game with `test&rrui=<id>` on port 9400, screenshot, restore the
  three project files and delete the picture.
- Capture is a visual draft. Recognized draws become editable nodes and a
  Picture preserves direct canvas content, but arbitrary plugin behavior,
  complete transactions, touch controls, and every override cannot be inferred.
  Shop/Battle capture does not make those scenes replaceable. Capture itself
  never saves the project; the explicit Picture import is the exception that
  immediately copies an asset into `img/pictures`.

## GPU-Side Pass: Window Stencil Clip, Shared Billboard Sheets, Frozen World, Texture Cap (2026-08-25)

- Measured with `EXT_disjoint_timer_query_webgl2` (`gpu-probe.mjs`,
  `window-mask-check.mjs`): on the RTX the 3D passes are ~0.5 ms and PIXI
  ~0.9 ms per frame, so PIXI's own pass is the bigger GPU cost; MSAA 4/2/0
  and scale 1/0.75/0.5 are within noise here. Weak-GPU work is therefore
  about passes and bandwidth, not shader cost: MZ's AlphaFilter window clip
  (a render-to-texture pass per window per frame) is the standout.
- `Window.clipWithMask`: stencil rect (`StencilMask`; PIXI 8 has no scissor
  fast path for Graphics masks, `ScissorMask` is exported but never chosen).
  Never set `renderable = false` on a mask yourself. Item screen A/B
  pixel-equivalent; 2.12 → 1.96 ms/frame PIXI GPU here.
- Map-frame A/B is NOT deterministic on the Demo (a vehicle event drives,
  lights animate): two frames 1.5 s apart differ by mean 33. Freeze the
  world or compare a still map before reading a "regression" into a diff.
- Billboards: `sheetTextureFor` + `billboardView`; three keys GL uploads by
  image source so the per-billboard clones share one upload. Verified by
  teleporting next to EV023 (`!$Computer-Console-017`, screen 640,241).
- Texture cap applies in three places (worker bitmaps, TextureLoader data
  URIs, Image files); `Reactor3D.maxTextureSize` is the knob.
- Not done: RaveLighting on the GPU (PIXI erase blend into a render
  texture), three's two-pass double-sided model materials, and the
  remaining `updateMatrixWorld` allocation inside three.

## Per-Frame Churn Pass (2026-08-25, owner: "destroy-and-recreate each frame")

- Measure with `alloc-profile.mjs` (HeapProfiler sampling, 2 KB interval,
  walk 8.5 s + battle 8 s). Walking: 250 → 146 MB. Battle: 151 → 110 MB.
- Standing rule from the owner (2026-08-25): anything that helps weak
  hardware without losing functionality is the default methodology;
  per-frame destroy-and-recreate is the pattern to hunt, in the runtime,
  the editor, and the PSYCHRONIC_* plugins alike.
- Findings and fixes are in the editor changelog. Traps: three renders a
  `DoubleSide` + `transparent` material twice with `needsUpdate` toggled
  per pass (`libs/three.js` ~78118); `forceSinglePass` is the switch, and
  it is NOT safe for additive blending (double contribution is baked into
  the authored intensities: the lights material keeps two passes).
- What is left, by size per 8.5 s of walking: three `getParameters`
  16 MB (glTF model materials with `doubleSided` + BLEND still two-pass;
  single-pass there risks sorting artefacts on hair cards, not taken);
  three `updateMatrixWorld` 12 MB (internal); `applyModelAnimation`
  iterator `next` 5 MB (for-of over pooled arrays; indexed loops would
  finish it); `Sprite._refresh` under `Window.updateTransform` 2.8 MB
  (window contents sprites on the mutate path; what remains is the
  `update()` emit); `reactor_objects.js:7242` `projectToScreen` 2 MB (the
  one caller that returns the record to others, so it allocates).
- `Sprite._refresh` v8 path: textures the sprite makes are `dynamic: true`
  so PIXI's Sprite subscribes to `update`; the earlier "mutation leaves
  bounds at the 1x1 stub" note was true only without that flag.

## Potato-PC Pass: Adaptive Resolution, Overlay Discipline, Idle Previews (2026-08-25)

- Levers that were already right: unlit `MeshBasicMaterial` for the world,
  no shadow maps, pixel ratio 1. What was left: fill rate of the passes,
  a plugin overlay re-uploaded every frame, and editor previews rendering
  at the display rate while still.
- Adaptive resolution lives in the viewport (`_trackFrame` → `adaptScale`);
  the target is a fixed 60 fps frame, NOT the display period (see the
  changelog note on the 240 Hz mistake). Verified live: a 26 ms per-frame
  burn takes the scale 1 → 0.75 → 0.5 within seconds; removing it climbs
  back at ~5 s per step. A forced 0.5 measures mean diff ~26 against
  native (blur, expected); the controller never gets there on a machine
  that holds 60.
- `Reactor3D.renderScale` is a script-level knob; no Options-menu row was
  added (that would change every game's options menu). A System-1
  "3D quality" setting is the natural home if the owner wants one.
- RaveLighting on the Demo map: 20 lights, three animated types, so the
  signature skip never fires there; the half-res bitmap and 30 Hz cadence
  are what save it (60 → 30 uploads/s at a quarter of the bytes). A map
  with only static lights uploads nothing while the map is still.
- Editor previews idle at 10 fps by cadence, not by dirty flags: any
  missed trigger shows within 100 ms. Ambient animation rules keep the DB3D
  preview at full rate by design (it is animating).
- Not done: draw-call/overdraw work in the map scene (unmeasured on a real
  weak GPU); a GPU-side RaveLighting (PIXI erase blend into a render
  texture) would remove its uploads entirely.

## Shared-Context 3D Rendering (2026-08-25, owner: "refactor the per-frame copy")

- Map passes render into `WebGLRenderTarget`s on PIXI's GL context; PIXI
  samples the GL textures through seeded `_gpuData`. Pixel-identical to
  the copy path (`shared-ab.mjs`, mean diff 0.00 over 921,600 px).
- Traps: (1) `isXRRenderTarget = true` is what makes three encode sRGB
  in-shader for a target (else output is linear); (2) with it, three
  forces RGBA8 on the multisample renderbuffer but still allocates the
  texture SRGB8_ALPHA8 → `glBlitFramebuffer` INVALID_OPERATION; naming
  `texture.internalFormat = "RGBA8"` bypasses both; (3) PIXI's
  `resetState` marks EMPTY bound on every unit, so null the cache after;
  (4) never let PIXI `destroy` a source whose `_gpuData` points at three's
  texture (it would `deleteTexture` it); drop the entry first; (5) a
  one-off `gl.getError() === 1282` shows after the very first shared
  render with no observable effect and no console error; a per-call GL
  tracer could not reproduce it.
- What this did NOT change on this machine: CPU profile `texSubImage2D`
  ~310 ms per 8 s of walking is **PSYCHRONIC_RaveLighting.js**
  (`updateToneOverlay`, ~L3114) clearing and redrawing a 1280×720 tone
  overlay bitmap so PIXI re-uploads it ~20×/s. That is the Demo's own
  plugin, not the engine; a dirty check (tone + light set unchanged →
  skip) or drawing lights as PIXI sprites would remove it.
- Battlers done the same way (`paintBattlerFrame` → `_paintBattlerShared`):
  a target per battler state adopted into `bitmap.baseTexture.source`
  (v8: `baseTexture` is a Texture, its `.source` the TextureSource); the
  sprite texture is rebuilt by `_refresh` on frame change, so the vertical
  flip is re-asserted per frame; targets are disposed on id change and in
  a `Sprite_Battler.prototype.destroy` wrapper (end of reactor_sprites.js,
  after the Sprite_Enemy prototype replacement). The face paint (one-off)
  keeps the copy path. Battle profile: `texSubImage2D` 52 → 29 ms per 3 s,
  the rest is HUD/window bitmaps.
- Still per frame, by design of the plugins: `PSYCHRONIC_RaveLighting`'s
  tone overlay (above). Editor previews (`MapEditor3D`, DB3D) keep their
  own three renderers; they are not composited through PIXI.

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
  `scratchpad/cdp.mjs`. Historical phase-1 layout rules from that sweep: the
  properties panel is one 4-track grid (label|field|label|field) that
  collapses pairs below 340px; the workspace originally stacked below 1300px of
  detail width. The 2026-08-27 redesign above supersedes that with a contained
  drawer below 1050px and one-column reflow below 620px. Sections in
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
- Current boundaries: no Container node, general flow layout, alignment guides,
  marquee, or multi-select. Item/Skill/Equip/Shop/Formation/Name Input,
  message-input, and Battle replacements await dedicated workflow adapters.
  The standalone MZ plugin is deferred by owner direction. Gauge now covers
  HP/MP/TP/EXP, MHP/MMP and combat stats through all actor sources, plus a
  variable against a fixed or variable maximum; `Sprite_ReactorUIGauge` remains
  an inner child with opacity mirrored from `contentsOpacity`.

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
  NEVER restored checked (per-deploy opt-in). The obsolete online translation
  generator was subsequently removed; reviewed additions now live in all 17
  locale maps in `I18nReviewedTranslations.js`.

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
