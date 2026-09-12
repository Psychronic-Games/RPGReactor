# Action sequences and battler graphics — 2026-09-11

The Database now separates whole actions, action phases, battler states/reactions, and reusable routines. Actor and enemy battle graphics have an explicit type selector. The existing dark card styling is preserved, with a 16px gap above the action assignment card.

## Simpler authoring interface

Common actions have Run, Punch and Return buttons beside the step list. The full command picker is grouped into Templates, Movement, Action, Targets, Audio, Visual Effects, Game Data and Logic. The preview stays beside the steps, with essential fields in the inspector.

Advanced targeting, media levels, sprite parameters and transform controls are expandable. Commands hide fields that their selected operation does not use. Impact behavior lives under Options. Expanded sections remain open during edits, and Options handles Escape locally.

Phase assignments use compact numbered rows, accessible selector labels, and expandable Help explaining execution and inheritance. Battler graphics put the type, file and preview first; extra graphic settings, sprite motion mappings and state overrides are expandable. The existing dark headers and card colors remain intact.

Native checks cover quick-step insertion, all command options, disclosure persistence, operation-dependent fields, and dark/light layouts at 1280×720 and 1920×1080. The compact layout has no horizontal or vertical workspace overflow at those sizes; the step list retains 277px of height at 1280×720. Screenshots are in `battle-sequence-expansion-2026-09-11/`.

## Assignment and playback

Skills/items take priority, followed by weapons for normal attacks, the actor's class, then the actor or enemy. An unequipped actor can also have an unarmed override. Existing complete-action assignments remain supported.

- **Follow Lower-Priority Defaults** continues through that chain.
- **Use Engine / Plugin Action** stops inheritance and retains the existing engine/plugin action.
- **Assign Each Action Phase** exposes Prepare, Movement, Execute/Attack, Effect/Impact, Return, and Finish/Cleanup. Each phase can inherit, use its built-in behavior, or reference a sequence of the corresponding purpose.
- **A named complete sequence** owns the whole action.

Execute calls Effect at its Play Effect Phase cue. Phase selectors filter out sequences with incompatible purposes and provide Create Phase/Open Sequence buttons. Missing references are visible and fall back to existing action behavior at runtime instead of partially executing an invalid sequence.

Battler state/reaction assignments cover idle, movement, command selection, ready, chant, guard, damage, evasion, magic evasion, abnormal state, sleep, low HP, defeated, entry, victory, escape, escape failure and collapse. Skills/items can override target damage/evasion/collapse reactions. Class state settings take precedence over actor settings. Repeating states replay while active. An active action owns its participating sprites; state players yield to it and queued reactions can play afterward.

**Impact Behavior** is explicit:

- **One Impact · Skill Repeats** preserves the original occurrence list, including repeated targets. The normal battle resolver still owns substitutions, counters, reflection and damage results.
- **Authored Hits · Each Impact Applies Once** applies each impact cue once to its chosen unique battlers; skill repeats are not multiplied on top. Each impact can supply a damage percentage/expression.

## Command coverage

Reference material: [Victor's Battle Motions](https://victorenginescripts.wordpress.com/rpg-maker-mv/battle-motions/) and [Battler Graphic Setup](https://victorenginescripts.wordpress.com/rpg-maker-mv/battler-graphic-setup/), checked against the original scripts in the local Star Shift Rebellion project. The implementation uses Reactor's structured records and rendering/battle adapters; it does not embed or import Victor's plugin implementation.

Every command family in the Battle Motions help has a Reactor counterpart. Forty-three additional step types join the existing movement, motion, sound, animation, projectile, weapon, impact, wait, camera and effect-phase steps.

| Reference family | Reactor controls |
| --- | --- |
| Action; if / else if / else / end | Reusable Routine calls, nested visual branch steps, condition expressions |
| Target; clear targets | Target groups, filters, indexed members, selected targets, pending target clearing |
| Effect; formula; element | Impact cues, explicit hit policy, per-hit rate, temporary formula and element overrides |
| Move; home; direction | Home/target/approach anchors, relative forward/backward and absolute positions, offsets, easing, facing, changed home position |
| Jump; leap; float; fall | Jump up/down, leap and remain aloft, relative floating offsets, fall to a specified landing height |
| Motion; pose; weapon | Named motions, custom sprite index/frame/speed/playback, held frames, weapon icons and weapon-sheet frames |
| Animation; balloon; opacity; whiten | Selected/current-action/weapon animations, balloon cues, opacity interpolation, white flashes |
| Flash; tint; shake | Screen flash/shake, battler or screen/backdrop tones |
| Picture; icon; plane | Identified layers, show/move/clear, battler/screen placement, scale/rotation/spin/opacity, scrolling tiled planes |
| Battleback; battlestatus; battlelog | Background change/save/restore, status visibility, log text/show/hide/clear |
| BGM; BGS; SE; movie | Audio files and levels, fades, stop, save/resume, system sounds, movies |
| HP; MP; TP; buff; state; kill | Resource changes (points/percent), buff/state operations, explicit defeat |
| Item; switch; variable | Inventory/gold, switches, variable arithmetic |
| Eval; event; wait | Authored JavaScript, immediately processed common events, frame/media/battler waits |

Targets include user, calling subject, current/selected targets, all action targets, actors, enemies, friends, opponents and all battlers. Filters include alive/dead, appeared/hidden, movable/moving, other and random. Indexed member controls apply after filtering. Visual targets are deduplicated; ordinary impact repetitions are preserved separately.

Routine calls detect cycles and missing records, cap nesting at 16, and cap expanded steps at 4096. Referenced routines are protected from deletion/truncation alongside assignments. Movies and common events block through owned tickets; cancellation clears their active work. Formula/element/rate changes are scoped around each invocation and restored even if the resolver throws. Presentation cleanup restores sprite transforms, opacity, tones, held poses, camera, background/window changes and created layers. Resource, inventory, variable and switch commands deliberately change game state; audio commands follow their explicit save/resume/stop instructions.

## Battler graphics

Actors and enemies can use the existing graphic, an SV sheet, a character set, a static image, or a 3D model. The selection is stored in the Database working copy, separately from map-character and face bindings. When an explicit type is active, the obsolete legacy battler preview is hidden rather than displaying a conflicting model/image.

SV/character controls include frame count, frame interval, SV motion rows/columns, scale, mirror, vertical offset, shadow and weapon visibility, per-motion index/direction/frame count/speed, and loop/play-once/hold-last behavior. Character battlers support a separate defeated image/index/direction. Enemy controls include up to two weapons and an attack animation. States can override an idle motion with priority, frame settings and speed multiplier.

The same graphic resolver/crop calculation is used for runtime battlers, action-sequence previews, room casts and explicit enemy troop previews. Battle Test checks explicitly selected actor assets. Model selection uses the existing model picker and its model settings.

## Preview and compatibility

The preview uses the selected sample cast. Movement, sprite crops, held frames, opacity, jump/leap/float/fall, image layers and screen effects have preview representations. Branches expose a **Preview Condition Result** so both routes can be inspected without executing a game's scripts inside the editor. Game-changing commands appear in the preview trace; use Battle Test for their real gameplay results and common events. The sample preview is not a live game-state simulator.

This is a visual Reactor implementation of the conventions, not a parser for old notetag scripts. Existing incompatible battle-engine plugins continue to use their original action path through the compatibility guard. Named 3D model motions use the model's action rules; sprite grid/frame settings apply to sprite battlers.

## Verification

- Full Node suite: **3,074 tests**. Focused Node coverage checks phases, priority, explicit existing behavior, authored vs ordinary hits, temporary damage overrides, branches, routine calls/cycles/references, target filtering, resource commands, common events, scripts, media cleanup, sprite cropping and lift behavior.
- `nw-sequence-expansion.cjs`: two window sizes, 16px card spacing, all 43 new command inspectors, create/save phase flow, real runtime custom 4×14 SV sheet and character-set enemy, six-phase playback preserving two original hit occurrences. Evidence: `battle-sequence-expansion-native-2026-09-11.json`.
- `nw-sequence-authoring.cjs`: sharp/responsive previews, formation and transforms, native dragging, clipboard, audio/animation pickers and completion waits, undo/redo and persistence. Passed after correcting full-duration calculation when leaving a blocking preview cue.
- `nw-battle-presentation.cjs`: full editor/room/runtime regression, map-return cleanup, sprite/model rooms and media; no missing assets or GPU errors. This found and fixed the shared camera zoom helper regression.
- Localization coverage and interpolation checks pass for all 17 non-English locales. New Chinese battle terminology was reviewed; prior reviewed translations remain intact.
- Runtime revision **20260911.5**, editor **0.98.6**. Canonical runtime synchronized across all 13 bundled projects.
