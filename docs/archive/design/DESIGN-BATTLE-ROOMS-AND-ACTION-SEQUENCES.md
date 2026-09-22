# Battle Rooms and Action Sequences

**Archived 2026-09-21.** This is the design and staged roadmap written on 2026-09-06, before the system shipped; the current behaviour and limits are in [BATTLE-PRESENTATION.md](../../BATTLE-PRESENTATION.md). Design and staged roadmap, 2026-09-06. The first room renderer, standalone sequence builder, assignments and runtime playback are now implemented in **20260906.6**. See [the authoring guide and current limits](../../BATTLE-PRESENTATION.md) for what is available and verified. The proposals and acceptance gates below also describe later work; they are not a claim that every planned feature or compatibility case is complete. Battles retain ordinary targeting and turn/ATB rules; tactical movement is separate scope.

## Intended result

A creator selects **Battleback** or **Battle Room** in Troops. Battleback preserves today's behavior. Battle Room selects an existing map, a camera and starting positions, while keeping the battle's party, enemies, troop events, windows and battle rules.

A new **Action Sequences** database section lets the creator start from a working template, preview it with any compatible 2D/3D battlers, adjust movement and impact timing, and assign it to a skill, item or weapon. A single Railgun Shot sequence can replace dozens of near-identical weapon notes. Damage, costs, targeting and states remain in the existing skill/item system.

The room and sequence features work independently: sequences also work over battlebacks, and rooms can use existing battle presentation without a new sequence.

## What the existing code and projects establish

- `runtime/reactor_scenes.js`: `Scene_Battle.createDisplayObjects` owns a `Spriteset_Battle`, message/windows, and the BattleManager/log-window connection. Keeping this ownership is essential for existing HUDs.
- `runtime/reactor_sprites.js`: `Spriteset_Battle` owns `_battleField`, `_actorSprites`, `_enemySprites`, target lookup and busy checks. `Sprite_Enemy` and `Sprite_Actor` already display 3D battlers through offscreen model textures. This is useful for conventional battles, but a texture alone cannot give a battler correct depth against a room's 3D geometry.
- `runtime/reactor_managers.js`: `startAction` pays costs and applies global effects; `updateAction` consumes the target list; `invokeAction` handles counter/reflection and delegates substitution, application and battle-log results. Presentation must not apply damage independently or pay costs again.
- `runtime/reactor_objects.js`: `Game_Interpreter.character` returns null in battle. Transfer Player returns false while in battle, and Scroll Map skips its work. Merely putting a map behind Scene_Battle does not make these commands work.
- `runtime/reactor_3d.js` and map sprites reference `$dataMap`, `$gameMap` and map-specific playback ownership. A reusable room renderer needs explicit world context; this is the first technical feasibility gate.
- [ReactorEvents](../../RUNTIME-EVENTS.md) is a read-only observation feed. It cannot become the scheduler that pauses or redirects battle actions, and plugins replacing an emitting method can bypass it.
- `editor/src/database/DatabaseTroopEditor.js`: troop membership, screen-coordinate placement and native event-page command lists already exist. Preserve them and add room configuration alongside them.
- `Database3DBindings.js`, `DatabaseManager.js`, and the UI/quest loaders establish optional sidecar data and separate database lists. Reuse the database's list, preview/inspector, save/cancel and reference conventions.

The local sample projects contain substantial real compatibility fixtures:

| Project | Entries containing `<action sequence` | Enabled systems relevant to the design |
| --- | --- | --- |
| Star Shift Rebellion | 260 skills, 81 weapons, 92 items | VE Battle Motions, Counter/Reflect/Charge Actions and Active Time Battle; MOG Battle HUD/Cursor; LeTBS and its extensions; battle common-event plugins |
| Star Shift Freelancers | 274 skills, 141 weapons, 77 items | PSYCHRONIC BattleEngineMZ, ATB-MZ and PTBS; MOG Battle HUD/Cursor |

These counts describe notes, not verified conversions or proof that all entries use the same parser. Rebellion's weapon 1 (G1 Railgun Pistol) contains movement, per-frame icon rotation/position, sound and `action: all targets, effect`; its skill 128 (Scan) has separate movement/execute/return phases. Freelancers' weapon 9 (XT-1 Railgun Cannon) includes a PTBS sequence with `aimImage`, `projectile`, `applyActionEffect(all targets)` and image restoration. Notes also contain unrelated equipment, scope and targeting data.

The dialects overlap in tag names but differ in syntax and execution model. VE Battle Motions changes counter/end-action behavior. Rebellion's MOG Battle HUD aliases `Scene_Battle.createSpriteset` and also creates front-view actor sprites. Preserving Scene_Battle helps compatibility; it does not prove the complete stack will work unchanged with world-space battlers.

## First authored room fixture

The owner has prepared Demo map **004, “Reactor Room - Battle Map”**, under the **Battle Rooms** map-tree folder (map 003). Map 004 is 50×50, uses tileset 2, has the same tile data as map 001, retains the `<3d>` marker and fog note, and has no live map events at this review. Its `Map004.r3d.json` retains the room surfaces, isometric camera and 11 reactor/computer/monitor props. Two copied event-model bindings still refer to removed events; room loading must ignore absent event IDs rather than spawn ghosts. Preserve this authored map; automated tests use disposable copies.

Use map 004 for the first arena prototype and map 001 as the exploration return destination. Test camera/formation setup, reactor surface lighting, attached-effect occlusion at the reactor's rear and upper lip, mixed 2D/3D battler depth, HUD/cursor projection and all battle exits. Add temporary room-event fixtures in test copies for movement/animation/wait tests, since the prepared room currently has no events. The copied fog plugin note is also an explicit compatibility fixture: loading the room must route it to the room renderer without affecting the exploration map.

## Troops: proposed authoring flow

1. Keep the existing troop list, enemy members and event pages. Add **Battle Scene: Battleback / Battle Room** above the preview, defaulting to Battleback when no new data exists.
2. Battleback keeps the current battleback rules and screen-coordinate placement. Switching modes retains both layouts, so experimentation is reversible.
3. Battle Room reveals **Map**, **Set Up Room**, and **Battle Test**. The map picker shows names and thumbnails. Set Up Room opens a large preview with a compact inspector, using the same selection, drag, XYZ steppers, reset, camera and snapping conventions as the map/model tools.
4. Provide a useful initial camera and two formations automatically. Markers represent **party slots** and **troop members**, not fixed actor identities. Party substitution and changes in party size must work. Creators can drag markers or type exact values; facing and height are explicit. Preview 2D/3D battlers in place.
5. Camera and formation settings belong to the troop's room configuration. Reuse the same map across troops without changing the exploration map or duplicating map assets. Offer Copy Room Setup for sharing configurations; a separate room database list is unnecessary initially.
6. Keep troop event pages in the familiar location. Add room-target pickers when a room is selected, with Room Event and Battler as distinct target kinds. A room event numbered 1 must never be confused with enemy slot 1.

First release is a staged arena: moving a battler during an attack is visual choreography. It does not add walkable turns, pathfinding, range checks, cover rules or tactical AI. Existing tactical plugins retain their own mode; room selection must not silently convert that mode.

A 2D room uses the map's tiles, authored layers, props and event graphics. A 3D room uses its geometry, lighting and depth. A 2D battler may be a billboard in a 3D room; a 3D battler may appear in a 2D room. Explicit placement/facing and size conventions are shared; the room's projection changes their screen position.

## Runtime boundaries and map commands

Keep **Scene_Battle + BattleManager + Spriteset_Battle**. Add a room presentation component to the battle spriteset rather than entering Scene_Map. Retain the existing battler sprite objects as the identities plugins address, even when their visible graphics are rendered by the room. Maintain screen-projected positions, bounds, home positions, hit targets and attachment points for cursors, gauges, damage popups and animations. Camera movement must update those projections; compatibility cannot stop at HUD creation.

A battle-owned room context loads map data and sidecars separately from the exploration map. It owns its event instances, camera, weather/lighting, surfaces, media, update loop and renderer resources. Refactor map rendering dependencies to accept this context. Do not repeatedly swap `$gameMap`/`$dataMap`: asynchronous loaders, plugin callbacks and reserved events can otherwise access the wrong world.

Use a single room depth pipeline for room geometry, model/billboard battlers, weapons and effects. Do not declare 3D room support complete with foreground objects baked behind all battlers. Explicit foreground/screen effects remain available where intended. Budget render targets and dispose them on every exit; share reusable asset templates rather than live instances.

| Command family | Proposed behavior in Battle Room |
| --- | --- |
| Existing troop conditions, switches/variables, messages, audio, enemy changes and Force Action | Keep battle semantics, page conditions and battle/turn/moment spans. Global switches/variables remain global. |
| Event position, movement route, event animation, balloon | Resolve explicitly against room event instances; waiting belongs to the executing room-aware interpreter. Support room target selectors in the editor. |
| Room camera, scroll, lights, props and attached effects | Use room context and the existing command UI where applicable. Ordinary battlebacks retain their current behavior. |
| Pictures, screen tint/shake and weather | Specify ownership: existing screen effects retain battle-wide behavior; room camera/weather affect the room. Define the composition order so screen shake and camera shake do not double-apply. |
| Common Event | Inherit the caller's room context and wait/cancellation ownership, including deferred/reserved calls. Do not globally reinterpret unrelated common events. |
| Self switches / Erase Event | Room-local state, isolated per encounter by default; persistent world changes use ordinary switches/variables explicitly. |
| Player transfer, vehicles, followers, map encounters and nested Battle Processing | Not room navigation. Explain in the editor; ensure unsupported commands terminate without an infinite wait. A post-battle transfer can be explicitly queued as an exit operation in a later phase. |
| Plugin commands / script calls | Work when they use ordinary battle APIs or a supported room adapter. Commands hardcoding `$gameMap`, `$gamePlayer` or Scene_Map require an adapter; show that limitation. |

Do not automatically run every map autorun/parallel event or map audio on entry. Opt room events into **On Room Enter**, **Parallel During Battle**, or **Called Only**. Create their interpreters with room context; ordinary map behavior remains unchanged. Troop pages stay the primary battle controller and can invoke room events. Specify update ordering and wait release before implementation, including Force Action interrupting a sequence.

On victory, defeat, escape, abort, retry or load: cancel room interpreters and sequence work, stop owned media, release targets/listeners, restore camera/graphics state, and leave the exploration map's position, events and BGM continuation intact. Battle save-state support should follow the engine's existing policy; no new mid-sequence serialization is implied.

## Action Sequences: the beginner workflow

**New → choose a template → choose preview battlers → Play → adjust → assign.** A creator should be able to produce their first working attack without a note tag, plugin command, script or manually created keyframe.

Use the database's list on the left, a large preview in the center, and the same compact inspector on the right. Beneath the preview show a readable **Steps** list by default; **Timeline** exposes the same data with tracks and keyframes. These are two views of one sequence, never competing copies to synchronize.

Starter templates: Melee Strike, Projectile Shot, Cast on Target, Heal, and Self Buff. Each supplies safe defaults, an impact cue and a return to the starting pose. Preview casting is temporary: choose actor/enemy, 2D sprite or 3D model, one or several targets, and optional room/battleback. Changing the preview cast must not edit actor/enemy database bindings or save a chosen actor into a reusable sequence.

Example **Railgun Shot**:

| Step | Creator controls | Default role |
| --- | --- | --- |
| Ready | Motion, facing, duration | User |
| Aim | Weapon/attachment, target, duration | User toward current target |
| Fire | Sound, muzzle effect, projectile appearance and travel time | User to current target |
| Impact | Hit effect and **Apply Action Effect** cue | Resolved target |
| Recover | Motion and return duration | User/home |

Start with role names **User**, **Current Target**, **All Targets**, and **Home**, not database IDs or raw coordinates. Advanced options add weapon, projectile and camera tracks. Position is relative to home/target/attachment by default. Show units and coordinate space; prevent a sequence authored on the left from moving an enemy offscreen when used from the right. Provide Preview as Enemy and Preview Multiple Targets actions.

For precision: drag playhead, select key, move object with gizmos, edit numeric XYZ/rotation/scale, set duration/easing, duplicate/delete/reorder steps, undo/redo, frame-step, loop and reset. Avoid automatic key creation from merely orbiting the preview camera. Use a fixed logical timeline (60 ticks/second, displayed as frames or seconds) with interpolated rendering; changing preview speed must not alter saved timings.

Separate continuous tracks (transform, opacity, camera) from discrete cues (sound, effect, motion, impact, event). Scrubbing evaluates poses without paying costs, applying damage, firing common events or changing switches. Provide **Play Preview** for visuals and **Battle Test** for gameplay validation. All cleanup restores borrowed model poses, textures, weapon visibility and camera state.

The inspector shows only controls relevant to the selected step; asset, audio and animation pickers retain existing themed controls. Start with explicit Add Step; scripts/plugin commands remain an advanced escape hatch. Do not create a large collection of mandatory tracks before the first playback.

### 2D/3D capability handling

Use a battler presentation adapter with common operations: pose/motion, move, face, attachment point, visibility, effects, and restore. Map semantic motions (Idle, Attack, Cast, Hurt) to SV sprite cells, imported clips or authored 3D rules. A static enemy image can still translate, flash or shake. Missing a named motion should be visible in validation and use a documented fallback; it must not leave the action waiting forever.

Attachment points such as Hand, Weapon and Muzzle need per-asset mappings, including 2D offsets and 3D bones/parts. A sequence requests a role; it does not hardcode Psychronic's bone names. Editing those mappings belongs to existing model/battler setup, with a shortcut from the warning.

## Assignment, ownership and combat correctness

Add an **Action Sequence** card to Skills, Items and Weapons, then actor/enemy presentation defaults when supported. Keep **Use Existing Behavior** as the default. Offer a sequence picker, preview and Open Sequence. Display the resolved source so a creator can see why a particular attack uses a sequence.

Proposed resolution:

1. An explicit skill/item assignment wins.
2. For the normal Attack action only, use the attacking weapon's assignment if the skill has no explicit sequence. Dual wield resolves the appropriate weapon per existing action semantics; it must not play the complete action twice merely because two weapons are equipped.
3. Use the actor/enemy default for the applicable action category.
4. Otherwise use the existing engine/plugin path unchanged.

Distinguish **Inherit**, **Use Existing Behavior** (explicitly stop lookup), and a sequence ID. Do not overload ID 0 to mean both inheritance and an override. Initially assign the primary action presentation only. Intro, victory, hurt/counter and state-loop sequences can extend the model later with separate ownership rules.

An action has exactly one presentation owner: native, an existing plugin adapter, or Reactor's sequencer. Selected Reactor sequences must not also run VE/PTBS/Yanfly choreography for the same action. Detect known stacks and gate unsupported combinations with useful diagnostics; do not disable project plugins globally. Do not use plugin file-name detection as proof of compatibility with every version or plugin order.

At action start, preserve the existing cost/global-effect processing and make an execution ticket for each target occurrence in the existing target list, including repeats. **Apply Action Effect** releases the appropriate pending ticket through the battle resolver. It does not call a new damage formula or bypass `invokeAction` and its plugin adapter. Counter, reflection, substitution, miss/evasion, drain, death and battle-log results must follow the active battle system's semantics.

Templates include an impact cue. Validation detects missing, duplicated and unreachable effects. Multi-hit visuals do not multiply damage automatically: intentional multiple hits must correspond to authored repeats or explicit supported hit allocation. An area effect can release several tickets at one cue, preserving result order. Visual hit reactions use the actual outcome/recipient after resolution, including substitution and reflection.

Skip/fast-forward consumes outstanding effect tickets exactly once in their defined order. Abort/defeat/scene teardown cancels pending tickets according to battle rules and cleans visuals. Force Action needs a defined suspend/resume or cancel boundary; it cannot share a mutable global timeline with the interrupted action. Timeouts and missing assets cannot wedge `isBusy` or an interpreter wait.

Extend action scheduling through an explicit presentation contract, with a legacy no-op path. Preserve ReactorEvents observation timing and payloads. Test changed hook order; existing events are not a substitute for this contract.

## Persistence and backward compatibility

Proposed files, following optional sidecar conventions:

- `data/ActionSequences.json`: versioned envelope with a stable-ID entries array and null slot 0; each entry has name, editor name, version, role requirements, steps/tracks/cues and optional preview settings.
- `data/BattlePresentation.json`: versioned troop scene settings and bindings keyed by troop/skill/item/weapon/actor/enemy ID. A troop's entry stores scene type, map ID, camera and room formation. Keep legacy troop member x/y and battle pages unchanged.

Finalize exact schemas after the renderer and one-action prototypes. No eager migration and no sidecar writes when simply opening an existing project. Missing files mean the current behavior. Missing room/sequence references produce editor diagnostics and a documented runtime fallback to existing presentation before any new effects start. Malformed or newer schemas must never be overwritten with empty defaults. Preserve unknown fields where safe.

Use database working copies, Apply/OK/Cancel, undo and atomic writes. A binding and a newly created sequence must save as one recoverable operation, not leave dangling references after a partial write. Give room formation members stable sidecar identities reconciled with troop add/copy/remove/reorder; array-index-only bindings will silently move the wrong enemy after editing.

Register the new data in desktop/browser loading, project creation, runtime revision refresh, deployment/copy, dependency collection, asset pruning and missing-asset reporting. Copy/delete/import needs reference handling and a Where Used view. Never compact stable sequence IDs after deletion. Deleting a sequence offers replacement or clearing references; deleting a map reports its battle-room uses. Include model clips, sound, animation/effect and room assets in export dependencies.

Opening an old project must preserve its note text and plugin manifest byte-for-byte unless the user edits them. Existing save files need no new mandatory members; optional state initializes on demand. RPG Maker MV/MZ can still read the ordinary database. Stock MV/MZ runtimes will not execute these new sidecars without a separate compatibility plugin; this proposal does not promise such a plugin.

### Existing-sequence import

Ship reusable templates before an importer. An importer later needs named dialect adapters and an explicit source preview. Convert a documented subset to a **new** sequence, report every unmapped instruction, and leave source notes/common events untouched. Show converted/unmapped counts and require a creator's deliberate assignment after preview. Do not label a partial import equivalent to the original.

Start with a narrow VE example (movement, motion, waits, sound, icon transform, impact and return). Treat PTBS's tactical state, targeting and projectile semantics separately. Arbitrary JavaScript and project-specific plugin commands remain unmapped/advanced calls unless an adapter defines their behavior.

## Delivery order and acceptance gates

| Phase | Deliverable | Must demonstrate before moving on |
| --- | --- | --- |
| 1. Arena feasibility | Internal room renderer in Scene_Battle; one 2D map, then one 3D map with mixed battlers | Existing windows/target cursors; depth around geometry; no global map replacement; return to original map intact; compare a battleback against the unchanged baseline |
| 2. Room authoring | Troop selector, camera/formation setup, map-reference validation and Battle Test | Save/cancel/reopen; automatic formations; member reorder; all exits; supported room event commands and waits; real MOG HUD fixture |
| 3. One reusable action | One Melee/Railgun sequence through a formal presentation adapter, assigned to one skill | Same costs/results/targets as original; exactly-once effect cues; repeat/counter/reflection/substitute; abort/forced action; works in room and battleback |
| 4. Beginner builder | Steps + Timeline, templates, preview cast, gizmos/inspector, undo and assignment cards | First action without scripts/notes; preview swap 2D↔3D; scrub causes no gameplay mutations; several target counts; theme/narrow-panel fit; save/cancel |
| 5. Compatibility and reuse | Weapon/default resolution, known plugin adapters, Where Used/copy/export; then limited imports | Actual Star Shift stacks and relevant plugin order tested in disposable copies; old project results preserved; assets deploy correctly; partial imports are clearly identified |

Avoid building a large timeline UI before the one-action runtime contract works. Prototype the beginner workflow early with that single working action, then expand the track set based on real authoring tasks.

Regression matrix: absent sidecars, Battleback, 2D Room, 3D Room; front/side view; static/SV/3D battlers; one/all/random/repeated/self/dead targets; miss, evade, counter, reflection, substitute, death/revival; turn-based and supported ATB; normal/forced/common-event actions; start, victory, defeat, escape, abort, retry and scene changes. Check projected HUD/cursor positions while the camera moves, room depth, event waits, teardown and loading failures. Compare result logs and RNG consumption for unopted actions where deterministic fixtures permit.

Use full unit checks plus native editor/runtime fixtures. Keep authored sample projects untouched; tests use disposable copies. Record the exact plugin stack and version for each claim. Performance acceptance includes a bounded frame cost and target/memory cleanup under repeated entry/exit, with a baseline measured before picking numeric budgets.

## Decisions before implementation

- Confirm whether the first release is ordinary combat in a staged map arena (recommended here) or includes tactical movement/range rules. These have different combat and plugin ownership requirements.
- Confirm the first supported integration target: recommend stock Reactor + MOG HUD first, then the specific Star Shift battle engines through named adapters. Old project behavior remains a regression gate from phase 1.
- Keep cinematic camera tracks and basic weapon/projectile attachments in the planned builder; defer arbitrary scripting, automatic note conversion, tactical rules and stock-MZ plugin distribution until their own requirements are defined.
