# RPG Reactor 0.98.6 — Sequences That Hold, Aim and Fight

0.98.6 finishes what 0.98.5 started. Action sequences are phased, pose the model's own parts, hold and aim real weapons, throw items and follow the action with the camera. Victor Engine battle motions import as native sequences. Rigging gains hands. The Demo ships a full 3D fight built on all of it.

[Download the binaries on itch.io](https://psychronic.itch.io/rpg-reactor). GitHub provides the source release. Existing projects keep their current battle behaviour until they opt in.

## Action sequences

- **Phases live inside the sequence.** Prepare, Movement, Execute, Return and Finish are sections of one step list. A record picks one Action Sequence and inherits the rest down the Skill / Item › Weapon › Class › Actor / Enemy chain. Effect is folded into Execute: the hit is an Apply Action Effect step wherever it belongs. Older data migrates on load.
- **Pose Parts.** A Motion step can pose a rigged model's parts: click a part, drag its rings, and the pose holds until a later step moves it. A part can **Aim at target** (a tank turret turns itself), a later motion can **Keep posed parts**, and poses compose from rest so an aim reads the same under any idle clip. Models with their own skeleton pose their real bones.
- **Weapons in hand.** Weapon steps are Show, Move and Hide. A bound 3D model is read by its own shape: blade or barrel out, handle in the fist, no Tilt, Turn or Roll to set. **Held With** both hands and **Aim** at the target make the arms reach for real: a rifle shoulders, a pistol goes out at arm's length, the other hand takes the forestock.
- **Projectiles.** One panel for what flies (dot, icon, picture, the item, the weapon, any 3D model or an animation riding the flight), where it starts and lands, arc, spin and return. Shots leave the muzzle of a held gun or the end of a carved part.
- **Starters and throws.** Sixteen editable starters including Item Toss, Sword Slash and Railgun Shot. Items, weapons and pictures can be thrown to allies or enemies.
- **Timing.** Concurrent steps, moves by speed (frames per tile) with arcs, waits that follow a move or slide the timeline instead of freezing it, Up and Down facings for character sheets.
- **Assignment and battlers.** Class defaults, battler states and reactions, reusable routines, explicit multi-hit behaviour, 43 more command types, and one battler control per actor or enemy (SV sheet, character set, image or 3D model).
- **Editor.** Add Step opens a grouped, searchable picker. Free preview camera, previews as of the selected step, Scene and Projection controls (3D, 2D horizontal, 2D vertical), Swap Sides, one Offset / Rotate / Scale card with one undo per drag, and preview choices remembered per sequence.
- **Camera and hits.** Cinematic cuts follow the action: a projectile rides in frame with its target, a charge is framed from the side, the hit frames the targets. Shots glide instead of snapping. A hit knocks a 3D model back and it springs forward; the damage blink is a white flash instead of five frames of nothing.

## Victor Engine import

- `import-victor-motions.cjs` reads Victor Battle Motions and Battler Graphic Setup notetags on skills, items, weapons, actors, enemies and classes into native sequences, reactions, projectiles and charset battlers. Like records share one sequence. Star Shift Rebellion ships imported, with Victor's plugins off.

## Battle rooms and 3D battlers

- Battlers cast a soft floor shadow in rooms. 3D battlers take the engine's sprite effects: hit flash, collapse fade, boss shake, gone when dead. The battle cursor stands on models. The actor command window can open over the acting battler.
- Sidecar rule effects (a muzzle flash) fire in rooms. Models a battle may throw or hold are preloaded when the room opens. Battle tests read the editor's current sequences and assignments.
- Battle start messages are optional (System › Options › Announce enemies at battle start).

## 3D models and rigging

- **Hands on the rig.** The humanoid rig gains a palm centre and base and tip markers for all five fingers per hand. Rig mode holds the model still. The viewport zooms toward the pointer, pans with Shift-drag or the middle button, and a dragged marker snaps into the middle of the limb under the pointer, so its depth is right from every angle; a marker outside the model draws faint. Labels fit their words and never overlap.
- **FBX and other formats** keep their materials and textures, and Optimize converts any of them to a GLB with textures bundled. The cost panel reads every format.
- **Event Model card** in the 3D map view: offset, rotate and scale a modelled event live. Copy, paste and duplicate carry a record's 3D binding. Model folders are strip section headers.

## Database, maps and editor

- System 2 sizes and framing: 48×48 icons, 288×288 faces, 64×64 and 8×8 tiles, default 2D zoom and framing, pixelated whole-frame rendering.
- Enemy Action Patterns show a behaviour forecast. Skills and items can hit a random number of times (PR #57). A plugin can hand an action its planned targets (PR #58) and waive an item's stock check alone (PR #59). A state a plugin refuses is no longer reported as added.
- Every menu and dialog answers to the keyboard. Themes, database tables, event editing, rapid navigation, map wheel zoom and Unicode map names are tightened across the editor.
- Sound Effect Generator saves WAV, OGG or MP3 with a quality step. Media surfaces load JPG and WebP. Random startup splash. Map toolbar toggles are one size.
- Music sequences gain fade-in, crossfade, intros, pools and per-track volume (PR #52).
- Fixed: loading a second map, shadows blinking on still models, menus and shops under Pixi 8 mouse and touch, web battle room video after blocked autoplay.

## Demo

- Fleagus swings the 3D short sword (Sword Slash, Heavy Cleave, Double Slash, Cross Slash, Spin Crash, Willpower). Carol carries the Railgun Rifle with Overcharge Shot and Suppressing Fire. Jolt keeps the Graviton Pistol. Frag Grenade and Med-Kit are thrown. The Tank aims its turret and fires or rams; Psychronic fires a Reactor Beam. Eight Effekseer effects from Star Shift Freelancers with their sounds. HUD along the bottom with a centred timeline.

Validation at release preparation: **3,177 automated tests pass**, plus native NW.js editor and game checks driven by real pointer input over the sequence editor, the rig editor and the Demo battle. See [BATTLE-PRESENTATION.md](https://github.com/Psychronic-Games/RPGReactor/blob/v0.98.6/docs/BATTLE-PRESENTATION.md) and [RIGGING-MODELS.md](https://github.com/Psychronic-Games/RPGReactor/blob/v0.98.6/docs/RIGGING-MODELS.md) for authoring and limits.

Thanks to the community contributors for PRs #52, #57, #58 and #59 and to everyone reporting reproducible issues.
