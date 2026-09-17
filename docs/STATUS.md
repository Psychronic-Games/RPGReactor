# Current project status

## 2026-09-16 — PRs #60 and #61 in, CI green again, Discord and translation fixes

- **PR #60** (music sequence library, battle music resolution troop → Change Battle BGM → map → System, sequence preview and starters, Quests tab fixes, Reactor or VisuStella quest log) and **PR #61** (passive states on both sides of an enemy state condition, several states per condition row, forecast `no-target`) are merged locally; notes in [PR-INTEGRATION-2026-09-15.md](PR-INTEGRATION-2026-09-15.md) and [PR-INTEGRATION-2026-09-16.md](PR-INTEGRATION-2026-09-16.md). Runtime revision 20260916.1.
- **CI** had failed every run since `v0.98.6`: two suites read the gitignored Star Shift Rebellion. They skip or use the fixture now; a fresh clone reproduces CI.
- **Spot light guide** in the 2D map view was mirrored against the glow, the game and the 3D cone (Discord report); the guide, cone lines and aim drag follow the renderers.
- **Reactor event commands** (six quest and media surface names) are translated in all 17 locales from a user's zh-Hans patch, and the Reactor tab is qualified in non-Latin scripts; a test covers every picker entry per locale.
- Verification: **3,247 Node tests pass**; clean-clone run passes with one skip; live checks of the 2D lighting guide and the Chinese picker. Not pushed.

## 2026-09-14 — 0.98.6 released; 0.98.7 open

- `v0.98.6` is tagged and published on GitHub from the changelog section (Publish Release succeeded); signed binaries and the itch channels follow from the Actions tab (Release Candidate → Release). The itch devlog is `docs/posts/itch-devlog-0.98.6-plain.txt`.
- Package version is 0.98.7; both changelogs carry an `[Unreleased - 0.98.7]` section for the bug fixes and features planned before next week.

## 2026-09-13 — Demo fight, held weapons, cinematic focus, hands on the rig

- **Held and aimed weapons.** A bound model is read by its shape (`Reactor3D.heldShape`: widest slice = handle end, grip = narrow run behind it) and sits at the hand's palm; weapon steps carry **Held With** (both hands) and **Aim** (two-bone reach down the line to the target). Projectiles leave the muzzle or a carved part's end. Pose Parts can **Aim at target**; motions can **Keep posed parts**; sequence poses compose from rest.
- **Camera and hits.** The running sequence reports its focus every frame and the cinematic camera glides after it (flights, charges, impacts); shots stay inside the room and clear of props. Hits knock a model back with a spring; the damage blink is a white flash. Run-ins move per tile.
- **Demo battle** authored in `scratchpad/demo-seqs.cjs` / `demo-apply.cjs`: sword skills for Fleagus, Railgun Rifle and gun skills for Carol, Graviton Pistol for Jolt, Frag Grenade and Med-Kit, Tank cannon aim/fire and ram, Reactor Beam; eight Star Shift Freelancers effects with sounds; start messages off (`startMessages:false`, System › Options).
- **Rig hands.** Humanoid template: palm plus base and tip for five fingers per hand; `attachRigHands` gives every hand joint its palm, knuckle and fingertip points. Rig mode holds the rest pose; the DB 3D viewport zooms toward the pointer, pans, snaps dragged markers into the flesh through a triangle BVH (`MeshSurfacePicker`), draws outside markers faint, keeps labels sized and unstacked. Carol's rig has placed hand markers.
- **Editor.** Add Step picker (grouped, searchable, strip headers); 3D model folders as strip headers; map toolbar toggles one size.
- Docs: [release notes](posts/release-notes-0.98.6.md), [itch devlog](posts/itch-devlog-0.98.6.md), [rigging guide](RIGGING-MODELS.md). Verification: **3,181 Node tests pass**; live NW.js checks of the Demo battle, held items, rig zoom/snap/labels.

## 2026-09-13 — Victor Battle Motions import; Star Shift Rebellion on native sequences

- A converter reads Victor Engine Battle Motions and Battler Graphic Setup notetags into native action sequences, battler states and charset battlers (`VictorMotionImport.js`, CLI `import-victor-motions.cjs`; the editor button was removed on 2026-09-13, the converter having served to seed the native system). Star Shift Rebellion is imported: 269 shared sequences (92 items share 17, the 81 weapons one per weapon type), 1,086 reactions, 315 charset graphics, with VE_BattleMotions and VE_BattlerGraphicSetup off.
- Parity forced engine additions: concurrent steps, speed-based moves, jump arcs on moves, up/down facings for character sheets, wait-for-move, blocking waits that stretch the timeline instead of freezing moves, a later move cutting the earlier one, hits counted per branch, LeTBS blocking only while it runs a battle.
- A seven-member battle harness from the latest save drives sixteen real actions frame by frame (`scratchpad/ssr-battle-harness.cjs`). PR #59 merged. Suite **3,150 Node tests pass**.

## 2026-09-13 — PRs merged, sequence generations pinned

- Upstream PRs #57 (Max Repeats range) and #58 (refused states not reported; planned targets for `startAction`) are merged over the local September 11–12 commits with one translation-block conflict kept both ways. Runtime **20260913.1**, synced to all 13 projects. [Integration notes](PR-INTEGRATION-2026-09-13.md).
- `action-sequence-generations.test.cjs` loads every bundled project's sequences and assignments (Star Shift Rebellion's unphased whole actions and per-phase class pick, Demo's phased starters) and pins the resolver for whole, per-phase and partial phased sequences, including Effect placement after Execute and the resolved action driven through the battle manager override. The editor's legacy unarmed fold no longer writes an undefined `phases` key; the unarmed punch smoke asserts the folded card.
- Root `CHANGELOG.md` unreleased notes trimmed to release shape; `editor/CHANGELOG.md` keeps the detail.
- Verification: **3,136 Node tests pass**; `nw-unarmed-punch`, `nw-battle-presentation` and `nw-battle-regressions` pass. Not pushed.

## 2026-09-12 — 3D sequences: rigged parts, projectiles, shadows, event models

- **Part posing on rigged models.** Every rigged model's Motion steps show a Pose Parts fold beside Whole Model; clicking a rigged part on the model in the preview (or choosing one in the fold) turns the step into a pose of that part with the gizmos at its joint. Models that ship their own skeleton and clips (Demo Carol) now pose their real bones: `Reactor3D.mapRigToSkeleton` names the file's joints instead of binding a second, motionless skeleton, `Reactor3D.isRigJoint` covers file joints that are plain Groups, and the animator composes poses onto the clip pose in the joint's own frame (`clipBase`, conjugated at compose time). Zero-frame poses snap; a pose's offset applies in the model frame before its turn. See [Battle Rooms and Action Sequences](BATTLE-PRESENTATION.md#pose-parts-2026-09-12).
- **Projectile panel.** Projectile steps have their own inspector (what flies, Thrown To, Flight, Starts From, a Start / Arrive / Look slider card) with the launch point dragged by arrows in the preview; sources gain any project 3D model and a database animation that rides the flight, in the editor and in battle (rooms and flat). Graphic Owner, bone and grip stay under Advanced.
- **Gizmo and card consistency.** Preview arrows share the card's axis colours (X red forward, Y green depth, Z blue up); Move: Weapon steps anchor their gizmo on the held weapon and preview at the end of the move; the Prepare phase badge stays round in narrow windows.
- **Sequence editor.** Free camera in the 3D preview (orbit, pan, zoom, Reset View, remembered per project); as-of-step previews; phases live inside the sequence with one Action Sequence pick per record and per-level "None (…)" labels; Advanced fold, header grid and step-list scrollbar tidied; Hold Weapon in Hand and Hide Shadow withdrawn.
- **Editor 3D view.** Event Model card docked over the viewport for modelled events (offset/rotate/scale, per-drag undo); animated templates are grounded on their resting clip (the mascot no longer floats); shadow rows dwell and smooth their ranking (`SHADOW_ROW_DWELL`, `SHADOW_RANK_SMOOTHING`, `SHADOW_AIM_FLOOR`) so still models keep their shadow and the Tank stops blinking; JPG media surfaces load as JPG.
- Verification: **3,107 Node tests pass**; runtime sync clean; live NW.js probes covered the elbow bend and arrow lift on Carol, the projectile drag, model and animation flights, and the narrow-window phase badge.

## 2026-09-12 — Keyboard menus, dialogs and table headers

- **Phases inside the sequence; one pick per record.** `step.phase` + optional `sequence.phases` (`B.isPhased`, `sequencePhases`, `phaseSteps`, `migratePhases`, `autoPhases`, `phaseIds`); `B.resolvePresentation` takes each phase from the first chain member whose sequence provides it (older `phases` bindings still honoured), coalesces runs from one sequence in authored order, places Effect at the placeholder or after the impact, and hands a self-sufficient whole back by reference. `B.template()` tags phases and provides all six. Editor: phase section heads in the step list (`phaseHead`, drop-into, `phaseInsertIndex`), Phase select moves the step, `Phases…` menu, Used As in the footer, Timeline/quick buttons removed. Assignment card: one Action Sequence select + provides/inherits readout (`BattlePresentationEditor.assignment`). Demo: 12 starters regenerated with phases, 2 older records migrated. `attachmentWorld` prefers rig bones. Verified in the harness (Railgun list sections, Phase move, weapon card readout, pistol at the rig hand).
- **Sequence editor header and preview row.** Options popover removed: Impact Behavior in the header, Skill / Item + Weapon in Hand + Projection in a `rr-sequence-preview-row` under the cast; `showStarterMenu` (Starters… button in the step-modes row) replaces the preselected template select. `paintProps` hides `extra:held:*`/`extra:flight:*` models that are not live (scrub-back bug). Railgun Shot starter rewritten as a gun sequence (no charge); Demo record 19 regenerated (16 steps, 56 frames).
- **Pose Parts in the sequence editor.** Motion steps can carry `parts:[{part,rotate,move,resize}]` (+ `resetPose`); `ReactorBattleData.posePlan` turns them into keyed, staying pose rules (`stay:true`, new in `readModelAnimationRules`/`applyModelAnimation`, `modelRuleDuration` → Infinity) named `pose:<stepId>`, joined to the model's rules in the editor (`ensurePoseRules`) and the game (`sequenceVisuals` motion cue, per-battler pose state). Humanoid joint table (`B.humanoidJoints`, `partLabel`, `hingeAxis`) names parts and puts Bend first on hinges. Editor: Pose Parts section, part picking by clicking the model (`ActionSequencePreview.partAt`), part rings at the pivot (`partPivot`), card id `part`. Release: a plain motion after a pose becomes its own action (`plan.actions`, `plan.releases`) with release rules (posed parts → rest over the step's frames, 0 = snap) plus the model's rules for the named motion cloned under that action (`B.releaseMotionRules`); the game does the same at cue time from the adapter's per-battler `poseState`. Verified on Carol (17 rig parts listed, elbow bent by card and by a real ring drag 90 → 124.6, pose shown at the step's end frame, hand eases home across a 12-frame Run and snaps on 0). Steps list scrollbar restyled.
- **Sequence editor transform card, held-item placement, remembered preview choices.** `ActionSequencePreview.transformCard` (Offset / Rotate / Scale slider tabs, one undo per drag, Reset per tab) now serves weapon steps, motion model transforms and move steps; held items have gizmos (arrows → x/y/z in the hand's frame, rings → Tilt/Turn/Roll). `ReactorBattleData.heldPlacement` places held models at a grip fraction (`gripY`, default middle; sword starter base) via `place({pivotY})`, facing the holder when the model has an authored front. Demo bindings: pistol size 0.5, sword 1.3; Railgun starter retuned (x .35, z .45, tilt 0). Preview prefs in localStorage (`rrSequencePreview:<project>`), per sequence + shared. Verified by a real arrow drag in the harness (z 0.9 → 1.29, undo grew).
- **Event Model card, model offset and JPG media surfaces.** Selecting a modelled event in the 3D view docks an Event Model card (`editor/src/EventModelPanel.js`) over the viewport: Offset / Rotate / Scale sliders edit the sidecar live, one undo step per drag, Reset per tab, card survives an undo rebuild. Event model specs carry `offset` (tiles east/south/up); game and editor 3D placement apply it; the event window's picker carries a stored offset through a re-pick but has no field for it. Demo door (map 1, event 2) offset −0.32 south so its back meets the north wall (measured: door depth 0.36 tiles, centred on the tile). Shadow row stability: rank on smoothed incident (`SHADOW_RANK_SMOOTHING` 0.01/frame), aim worth ≤ 25% (`SHADOW_AIM_FLOOR` 0.8), dwell 90 frames before a held row is traded (`SHADOW_ROW_DWELL`), immediate takeover only at 2× (`SHADOW_ROW_TAKEOVER`); editor marks only clip-bearing or always/idle-rule models as moving casters (`MapEditor3D.movesOnItsOwn`). Probe: still camera on the Tank, rows settle in ~4 s then 0 changes over 12 s; panning trades one or two rows. Editor shadows: `Reactor3D.Shadows.focus` (set by MapEditor3D to the orbit target) decides where moving-caster rows are spent; previously the editor fell to the first candidate light and the mascot's row never existed. Casters are marked after `animateModel`. Animated templates are grounded on their resting clip (`Reactor3D.groundAnimatedTemplate`, once per template at every template+sidecar site); the mascot's feet now meet the floor (skinned minimum y 0.157 → 0). Media surfaces keep non-PNG extensions when loading through ImageManager (JPG posters no longer report a missing PNG). Runtime **20260912.2**; tests in `event-model-panel`, `reactor-3d-models`, `database-3d-bindings`, `video-surface-runtime`; card verified by a real click in the 3D harness (drag, typed yaw, undo, deselect).
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

- Database category and record rows have 6px side insets, keeping highlights clear of the scrollbar. The category scrollbar is accent-colored, including in dark mode.
- Shared forms adapt to card width and align paired controls; Actor cards use independent columns, trait markers stay within table cells, and States labels precede their inputs.
- Fixed System 1/2 wrapping, hidden spinner controls, empty tileset buttons, interface heading wrapping, 3D inspector overflow, and Plugin Manager positioning after viewport changes.
- All seven light palettes now separate menu/toolbar surfaces, strengthen field and selection contrast, and preserve icon brightness.
- Verification: 3,050 Node tests, 399 native screen/tab cases, 35 field checks, 14 icon theme variants, 112 light-theme text contrast pairs, and 33 asset checks pass. Native coverage includes all 20 Database pages, 22 dialogs, and 15 nested tab views per size. [Audit and verification](UI-QUALITY-AUDIT-2026-09-11.md).

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

- Runtime **20260907.2** retains a bounded set of 3D effect quads between loops, eliminating repeat shader compilation after warmup, and skips a room floor only when a proven opaque parallax fully hides it. Preserve authored resolution, textures, shadows, antialiasing and model detail.
- Tested a full 2560×1440 rendering buffer on the external Acer at 144 Hz. All seven walking samples aggregate to 25.47 FPS baseline versus 26.07 FPS optimized, with substantial variation and persistent spikes. Repeat shader compilations fall from 12 to zero per route; sustained 60/144 FPS remains unachieved. See [performance evidence and limits](PERFORMANCE.md).
- Eleven full-resolution floor comparisons and three effect-quad comparisons match every channel. Image decoding, title/map cleanup and resizing pass; 175 focused tests and both synchronization checks pass. All 13 local projects carry the runtime. The broader Windows suite retains 23 failures outside the rendering paths after revision/sync corrections; it is not green. Authored data and unrelated changes are preserved.

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


Reviewed against the working tree on **2026-09-06**. This is the current
orientation and verification summary. [HANDOFF.md](HANDOFF.md) preserves dated
engineering history; its older measurements and proposed next steps describe
those sessions, not necessarily the present implementation.

The [September 4 closeout](SESSION-2026-09-04.md) brings together the day's changes,
authored Demo updates, and verification reports.

## Version and validation

- Action Steps and Timeline now use descriptive role/motion/destination labels, clip and animation names, and weapon visibility/source. Secondary text shows frame ranges and relevant offset/facing details. Edits update rows in place, retaining focus and scroll behavior. Runtime remains **20260906.13**. **2,840 automated tests pass**, and native responsive/description/editing checks pass.

- Battler Motion offset arrows now remain visible alongside rotation rings. Play Sound uses the shared SE picker, including volume/pitch/pan, with no duplicate level fields in the step inspector. Existing audio values are retained on reopen and Cancel. Runtime stays **20260906.13**. **2,840 automated tests and native authoring checks pass**.

- Battler Motion overrides now expose live position/rotation/scale sliders, precise numeric inputs and local Move/Rotate controls. Enabling an override shows the shared rings. Slider/ring gestures synchronize values without replacing inspector fields; slider drags undo as one change. A selected motion’s final transform remains visible before following instantaneous cues. Runtime remains **20260906.13**. **2,840 automated tests pass**, plus the native authoring checks.

- Runtime **20260906.13** adds opt-in Cinematic Cuts for Battle Rooms, with eased actor/impact/overview transitions and bounded orbiting. Action Steps now supports insertion below selection, typed clipboard shortcuts/context menus, explicit drag boundaries, draggable Add Step and isolated Play Step. Native checks cover pointer reordering, clipboard, exact step boundaries, saved cinematic setup and rendered punch framing/overview restoration. **2,839 automated tests pass, zero failures**; native authoring, cinematic punch and full Battle Room lifecycle checks also pass. Logs are recorded in the latest handoff.

- Action Steps now occupies a full-height left column beside the preview. Selection preserves row identity, scroll and keyboard focus; inspector edits preserve scrolling across rebuilds. Native long-list and responsive layout checks cover 1440p/1080p/720p. Runtime remains **20260906.11**.

- Runtime **20260906.11** adds motion transform overrides, numbered target choreography and complete transform restoration. Action Sequences has a responsive supersampled preview, zoom, shared arrows/rings, separate preview formation placement and a bounded stage/inspector/timeline layout. **2,835 tests pass**; native checks cover three resolutions, independent Target 2 dragging, rotation rings, proportions, save/reload and a rendered transformed punch returning home. Existing Demo sequences, formations and plugin choices remain unchanged in this pass.

- Runtime **20260906.10** adds an asset-independent Unarmed Punch template and Run to Target / Punch / Return Home building blocks, with diagonal approach and travel/home facing. Separate actor unarmed bindings preserve equipped and unrelated action behavior. Compatible humanoid rigs get an instance-local jab; authored punch actions win. Demo Fleagus and Carol are assigned; remove the weapon in Battle Test to exercise it. **2,832 automated tests pass**. Exact preview scrubbing and real rendered skeleton/impact/home checks pass, as does the existing native Battle Room lifecycle/mixed-battler suite with no missing assets or GPU errors.

- Runtime **20260906.9** fixes upright 3D ATB thumbnails and skips known-missing local one-shot sounds without repeated requests or a combat halt. Battle Test identifies missing graphics in its selected party; actor cards defer inactive 2D image loads and restore them on demand. Animations select their own Effekseer context throughout playback and cleanup. Traits headers align, cards use theme accent strips, Price fields fit, and Items cards stack independently. **2,829 tests pass** plus native competing-context animation, actual Battle Test, ATB, asset, layout and room lifecycle checks. Karen’s current test-party entry still requires a graphic or a different selected actor; no authored assets or party choices were substituted.

- Runtime **20260906.8** prevents unused battleback file requests in Battle Rooms and preserves the map’s authored prop direction, degree rotations and scale. Troops now fits its preview above Battle Events, with independent sidebar/command scrolling. **2,827 tests pass**; native checks verify all 11 room props against the map editor, matching runtime orientations, zero unused battleback requests despite deliberately missing filenames, and no outer scrolling at 1440p/1080p/720p. All 13 sample runtimes carry the changed files.

- Battle Room Setup now fills the dialog with its preview, scrolls the inspector independently, and offers the map editor’s orbit/pan/zoom/keyboard flight controls for troop overrides. Manual navigation stores a free camera without moving formation slots. Troops renders the selected room live, refreshes on Apply, and restores the old preview when switched to Battleback. **2,825 tests pass**; native navigation, layout, camera inheritance, Apply/Cancel, formation preservation and preview disposal checks pass. Runtime remains **20260906.7**; these changes are in the editor.

- Runtime **20260906.7** adds a database-owned maximum battle-party size beside Starting Party in System 1; room setup uses that capacity and recognizes Demo’s existing seven-member plugin limit without migrating it. Enemy previews render at 512×512 and the selected model appears in the enemy list. Third-person marker dragging freezes the camera/picking ray, then eases back on release. Full suite: **2,825 passed, zero failures**; native checks verify seven slots, save/reopen, a five-member database override over the seven-member plugin, actual cursor/marker tracking, sharp preview/list icon, and clean battle/return rendering.

- Runtime **20260906.5** fixes the live 3D enemy's invalid map-character reference and plugin character-sheet cropping. Enemy graphics now expose one active type, with hidden/disabled image and hue controls while 3D is selected; enemy/troop previews load model thumbnails outside the 3D tab. All nine parameter boxes have equal widths. Native disposable-Demo checks show the complete Psychronic model over 100 frames, 6,563 visible target pixels, correct 192×192 sprite framing and no uncaught errors. Full suite: **2,808 passed, zero failures**. All 13 sample runtimes carry the two changed engine files.

- Runtime **20260906.6** adds the first opt-in [Battle Rooms and visual Action Sequences](BATTLE-PRESENTATION.md): map arenas/cameras/formations, room events, standalone sequence authoring, skill/item/weapon assignments and actor/enemy defaults. The initial PSYCHRONIC adapter preserves combat resolution. 3D loading bitmap and zero-size room texture fixes pass native tests with no missing-file or GPU errors. Full suite: **2,822 passed, zero failures**. Native checks cover save/reopen, assignment layout, reactor-room battle and exploration return, repeats, room-event isolation and a 2D room with mixed sprite/model graphics. Dynamic room shadows, plugin fog/video, additional sequencer adapters and the broader battle-outcome matrix remain open; see the guide for precise limits.

- The editor’s 2D placed-model preview now depth-tests attached Effekseer effects against model geometry. The reactor’s rear beam and upper-lip overlap are corrected. Actual-model pixel and cleanup checks pass; full suite **2,807 passed, zero failures**. See the latest [handoff](HANDOFF.md).

- Runtime **20260906.4** fixes placed-model surface illumination in the editor’s 2D view. Models use private light fields with world height/position, receive nearby point/spot/beam lights and apply ambient only once. Native reactor pixels agree with a world-space reference render. Full suite: **2,805 passed, zero failures**; all 13 runtime copies match. See the latest [handoff](HANDOFF.md).

- September 6: integrated approved PRs #47/#48, including the passive-state work carried by #48. After the six-failure cleanup, the full suite passes **2,804/2,804**. All 13 local template projects match the canonical runtime. PR #46 is an identical patch already included through #48; its remaining conflict is changelog-only. See [integration report](PR-INTEGRATION-2026-09-06.md).

- Runtime **20260906.3** fixes speech setup on freshly imported skinned models and adds a generated lip seam with an optional colored dark interior. The face-point card has smaller lip markers and a shared-runtime mouth preview. Speak 3D Dialogue uses themed controls, keeps audio levels in its picker, and handles voice only; Show Text owns dialogue. Native checks cover the actual mascot, decoded pitched audio, silent intervals, stop/reset and wait completion. See [speech authoring and limits](3D-FACE-AND-SPEECH.md).

- Runtime **20260905.5** includes shared GPU effects in editor/runtime, exact frame caches and guarded neutral colour-pass removal. Final gameplay samples measured 55.4/54.8 FPS at 1080p; sustained 60 FPS is still open. Quality settings are unchanged. All 180 focused checks pass; the broader selection retains one existing Windows thumbnail-cache failure. See [PERFORMANCE.md](PERFORMANCE.md) for paired measurements, visual checks and limitations.

- The September 5 shared runtime/editor pass adds conservative light indexing,
  worker-generated model detail and asynchronous runtime effect measurement.
  Final paired live samples improved from 25–28 to 40–41 FPS at 1920×1080;
  sustained 60 FPS remains unachieved. Lighting-only images match exactly;
  subpixel geometry has small measured differences and limited visual QA.
  All 259 focused tests and 240 animated shadow frames pass. See
  [PERFORMANCE.md](PERFORMANCE.md) for methods, quality limits and full results.

- The [database sequence audit](DATABASE_STATE_AUDIT.md) passes 405 live checks
  across all 19 sections, with zero uncaught errors. It covers navigation,
  edit/switch/return, Apply/Cancel, stale callbacks, and project cache isolation.
- Development version: **0.98.5** (`editor/package.json`).
- Runtime revision: **20260906.9** (`runtime/reactor_main.js`); inspect
  `RPG_REACTOR_RUNTIME_REVISION` in a running game's console to identify its copy.
- Latest local release tag: **v0.98.4**, dated 2026-08-31 in the changelog.
- Final full Windows suite on 2026-09-05: **2709 passed, 27 failed,
  1 skipped**. Remaining failures cover Windows path/tool/symlink
  assumptions, existing authored UI/content expectations and ignored corpus
  runtime drift. This is not a clean release run.
- The initial documentation-only review did not run GUI smokes. Subsequent
  feature/audit GUI results are listed below; native signing and a complete
  game playthrough remain open. Recorded passes cover their tested scope.
- The subsequent lighting optimization passed NW.js frozen-frame image
  comparisons on an actual AMD integrated GPU at both full and weak shadow
  quality. Full-quality GPU rendering cost fell roughly 19% in the recorded
  comparison. See [performance checks](PERFORMANCE.md) for methodology and limits.
- Revision .16 also passed 240-frame moving-scene shadow continuity probes at
  full quality on NVIDIA and weak quality on AMD integrated graphics: no
  mismatched static/dynamic pairs, WebGL errors or per-frame budget overruns.
- Database model switching was checked in the live NW.js editor on a disposable
  Demo copy: Monitor Arm → Computer-01, manual media → mascot, and rapid
  mascot → computer → arm selections retained only the selected model's preview.
- Clipboard shortcuts, context-menu duplication and cross-model paste/save were
  checked in NW.js on a disposable Demo copy. The right-hand animation/effect
  lists support Ctrl/Cmd+C/V and Edit, Copy, Paste, Duplicate and Delete menus.
- Follow-up NW.js checks passed real right-click/Paste in the blank effect
  footer, section-header menus and an empty effects list. Database spotlight
  flicker changed both body and surface-light values across 30 live samples;
  zero flicker stayed steady. Database and map previews now animate carried
  point/spot/beam lights through the game's shared flicker/pulse routine.

- The 2D map editor now previews placed prop motion and native/carried lights
  outside the props/lighting tools. NW.js checks passed selection retention,
  tool close, 2D/3D switching, and map-switch cleanup on a disposable Demo.
  Model textures stay on the GPU; static/offscreen poses avoid redraws.
  Carried glows sit behind their emitter; a GPU pixel check confirms the
  emitter covers the glow while floor illumination and ambient tint remain correct.

- The current 2D editor light field uses the 3D source height/aim and falloff,
  verified against 24 GPU-rendered 3D references within one 8-bit level. Model
  textures follow zoom, shadows crop/cull/skip empty pools, and flat model
  lighting is isolated from other previews. Animated NW.js checks passed on
  NVIDIA and AMD integrated graphics; see [PERFORMANCE.md](PERFORMANCE.md).
  Attached animation/video effects and mode/map/project cleanup remain covered.
  This is an editor ground-light approximation, retaining flat brightness and
  ambient model tint; walls, self-shadowing and event-model casters differ.
- Revision .17 adds authored eye/mouth/lip points, first-person bodies and
  followers, and waveform-driven Speak 3D Dialogue. NW.js checks verified
  face-point save/reopen without changing the rig, exact authored eye placement,
  visible bodies, synthetic voiced/silent audio segments, mouth reset and
  dialogue/voice waits. See [feature usage and limits](3D-FACE-AND-SPEECH.md).
- Menu-return checks passed repeated prop cycles and explicit stops in both
  3D and 2D. The flat path now includes prop sprites and carried effect lights,
  display-correct ambient tint, tapered translucent cones and direct GPU model
  textures. Prop animation speed can be set per placement and changed by event.
  Cached part/bone bounds prevent animated models clipping their sprite frames;
  drawing depth accounts for lift independently of screen position and supports
  the Demo fog plugin's sorting override.

CI runs syntax checks, the full Node suite, dependency audit, patch hygiene,
and a clean-tree check. Its separate GUI job runs Web persistence and NW.js
save smokes. The UI-layout smoke and native Windows/macOS release checks are
additional gates; see [the release checklist](RELEASE-CHECKLIST.md).

## Editor audit on 2026-09-04

The [editor audit](EDITOR_AUDIT.md) records 123 command items, 19 database
sections, 56 nested dialog cases, 14 themes, and 18 locale catalogs. It fixes
silent save paths, invalid model-settings handling, unavailable quest commands,
and editor contrast/fallback colors. The expanded source inventory has 3,989
routed phrases and no missing entries; 88 phrases were added in 17 locales.
The report distinguishes GUI roundtrips from runtime scenario and native-language
coverage. Runtime revision remains .17.

## Current behavior that supersedes older notes

- **3D rendering:** Three.js normally shares PIXI's WebGL context. A canvas-copy
  fallback remains. World passes are capped at game resolution
  (`maxPassPixelRatio = 1`), use nearest sampling, and default to no MSAA
  (`renderTargetSamples = 0`). Adaptive resolution is opt-in. UI scaling follows
  the main canvas, whose backing resolution also depends on GPU tier.
- **Lighting:** the default volume path lights surfaces from world position,
  distance, and point/spot/beam shape. It does not use surface normals or normal
  maps. The older flat-light path remains available. Map lights, compatible
  plugin lights, and model light effects feed the shared light field.
- **Shadows:** two depth atlases hold static and moving casters. Full quality
  has 8 light rows and 3 dynamic rows at 512 pixels per face; weak quality has
  4 and 2 at 256. Moving-caster triangle budgets are 600,000 and 200,000.
  Rows prioritize light incident on the player and refresh within frame budgets.
  A light marked to cast can still lack an atlas row; not every in-range light
  casts simultaneously. Model effect lights exclude their own carrier from
  their shadow passes.
  Slot selection has a 25% incumbent priority margin and excludes authored
  flicker from priority; cone-edge priority changes smoothly. When a cached
  light origin changes, its static and existing dynamic rows refresh together
  within the existing budgets, retaining the previous matching pair meanwhile.
- **Model optimization:** both import presets can reduce geometry; the
  aggressive preset targets a larger reduction. Optimize also handles existing
  GLBs. Both presets disable generation of separate distance-level files.
  Existing authored LOD files remain supported. In-memory generation/caching of
  distance levels is a proposal, not shipped behavior.
- **Model effects:** animation, video/image surface, and light effects can
  attach to model parts. Placed props can list effects and animation sequences.
  In-world effects use scene depth; they are not simply screen overlays.
  Database model changes stop the previous preview immediately; stale model
  and clip loads cannot overwrite a later selection or reopen a closed preview.
  Clipboard copies preserve working edits and create uniquely named entries;
  copied animation rules carry their referenced named effects. Part/bone and
  embedded-clip names are preserved and may need retargeting on another model.
- **Quests:** Reactor owns `data/ReactorQuests.json` and `$dataReactorQuests`.
  Imports support VisuStella, Yanfly, and GS. Progress saves with the game;
  rewards are descriptive text and an on-map objective tracker is not built.
- **Custom interfaces:** seven opt-in stock-scene replacements are implemented.
  Item, Skill, Equip, Shop, Formation, Name Input/message-input, and Battle
  replacements still need dedicated adapters. The standalone MZ plugin is
  deferred. See [the interface design](DESIGN-USER-INTERFACES.md).
- **Compatibility:** Braver's recovered corescript adaptations now live in the
  MV compatibility layer. The earlier requirement for a project-local
  `BraverCoreEdits.js` is superseded. A working scene or isolated battle does
  not establish compatibility for an entire game.

## Open work and verification

- Complete moving-scene shadow/caster-budget verification on integrated GPUs.
  Revisions .15/.16 have frozen-view comparisons and short moving-scene probes
  on AMD integrated graphics; those do not establish sustained playthrough performance.
- Reproduce the owner's reported fullscreen softness in the actual launch path;
  the harness and owner screenshots did not agree. The console scaling report
  remains available; the temporary on-screen diagnostic was removed.
- Complete Braver's real victory → transfer → autosave flow and save/load through
  the storage bridge. Forced scene transitions and isolated action probes cover
  only parts of that sequence.
- Performance candidates: per-object light lists, removal of anchored-effect
  cross-context copies, generated/cached distance levels, and settings informed
  by measured frame time. Base skinned-mesh reduction exists; automatic skinned
  distance levels do not.
- 3D authoring: Block primitives and reusable structure stamping remain planned.
  Model/event transform gizmos exist; they do not complete the proposed generic
  tileset-structure manipulation tool. Weapon/armor/item bindings store data but
  do not yet draw equipment; stock battler motions do not automatically map to
  model actions.
- Content: the Demo has missing stock character/battler references and **121**
  distinct missing animation SE names. See [the verified inventory](demo-missing-se.md).
  The [July authored-data backlog](AUDIT-BACKLOG-2026-07-25.md) is separate from
  engine defects and records the date of its last corpus verification.
- Remaining visual/native checks are listed in
  [the handoff's release gates](HANDOFF.md#manual-release-gates) and
  [the release checklist](RELEASE-CHECKLIST.md).

## Documentation verification — 2026-09-04

The review covered the 40 tracked/new Markdown documents, checking current
claims against source, test results, and the Demo/corpus data where available.
Local Markdown file and heading links resolve. The 23 distinct external
Markdown links responded successfully; RPG Catalyst requires a normal GET
request because its HEAD response is 404. This checks availability, not the
future availability or every assertion on third-party pages. The six NW.js
archive hashes in the release checklist match the upstream 0.107.0 manifest.

The documentation, runtime-event contract, and release-infrastructure checks
passed after editing (30 tests). No runtime/editor code was changed by this
review. Dated release notes and art-pattern analyses remain historical records;
the review does not claim a new visual acceptance pass for their screenshots or
art recommendations.

## Keeping this summary current

Update behavior and verification separately: a passing Node run does not clear
a GUI gate, and a recorded GUI pass does not cover later renderer changes.
Record the date, runtime revision, and tested tree when reporting measurements.
Keep release devlogs and dated engineering entries as history, with explicit
supersession notes where an old claim could guide current work incorrectly.
