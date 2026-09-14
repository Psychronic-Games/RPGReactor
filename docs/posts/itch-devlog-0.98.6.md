# RPG Reactor 0.98.6: Sequences That Hold, Aim and Fight

0.98.5 put battle choreography in the editor. 0.98.6 makes it fight for real. Sequences now pose a model's own limbs, hold weapons by their handles, aim guns at the target, throw grenades and med-kits, and keep the camera on the action. Rigging gains hands. And the Demo ships a full 3D battle built on all of it.

RPG Reactor is a free, open-source RPG editor and runtime for RPG Maker MV and MZ projects. Same data files, same plugins, no conversion. Everything here is optional: an existing project keeps its battles exactly as they are until you opt in.

## One sequence, five phases

An Action Sequence is one step list divided into Prepare, Movement, Execute, Return and Finish. A skill, item, weapon, class, actor or enemy picks one sequence and inherits whatever it does not provide from the next record down the chain. The hit is just a step in Execute now, placed wherever in the swing it belongs. Adding a step opens a grouped, searchable picker instead of a hidden dropdown.

## Pose the model itself

A Motion step can pose a rigged model's parts. Click the arm, drag its rings, and the pose holds until a later step moves it. A part can aim at the target on its own, so a tank turret turns to whoever it is shooting without an authored turn, and a firing motion can keep that aim. Models that bring their own skeleton, like a Mixamo character, pose their real bones.

## Weapons held right

A weapon bound to a 3D model is read by its own shape: blade or barrel out, handle in the fist. No tilt, turn or roll to fiddle with. Set a gun to be held with both hands and aimed at the target, and the arms do the rest: a rifle shoulders with the off hand on the forestock, a pistol goes out at arm's length, and the shot leaves the muzzle. Items and weapons can be thrown to allies or enemies with arcs and spin.

## A camera that watches the fight

Cinematic cuts now follow the action every frame. A projectile rides in the shot with its target ahead of it, a charge is framed from the side, and the hit frames the targets. Shots glide instead of snapping. A hit knocks a 3D battler back and it springs forward, and the damage blink is a white flash instead of the model vanishing. Battlers cast shadows in rooms, 3D battlers take the engine's hit flash and collapse, and the actor command window can open right over the acting battler.

## Victor Engine motions, imported

A build script reads Victor Engine Battle Motions and Battler Graphic Setup notetags and writes native sequences, reactions, projectiles and character-sheet battlers. Doing that faithfully forced real engine work: concurrent steps, moves by speed, jump arcs, waits that follow a move, and up and down facings. Star Shift Rebellion ships imported, with Victor's plugins switched off.

## Hands on the rig

The humanoid rig now marks the palm and the base and tip of all five fingers on each hand. Rig mode holds the model still while you place markers. Zoom toward the pointer until a fingertip fills the view, pan with Shift-drag, and a dragged marker snaps into the middle of the finger under the pointer, so it is right from every angle. A marker floating outside the model draws faint. Labels fit their words and never pile up.

FBX, OBJ, STL, 3MF, USDZ and DXF models keep their materials and textures, and Optimize converts any of them to a GLB with the textures bundled inside.

## The Demo fights back

Fleagus swings a 3D short sword through six authored attacks. Carol shoulders a Railgun Rifle. Jolt draws the Graviton Pistol. Frag Grenades and Med-Kits get thrown. The Tank aims its cannon at each target and fires, or rams. Psychronic fires a Reactor Beam from its head lamp. Eight Effekseer effects come over from Star Shift Freelancers with their sounds.

## Around the editor

- Every menu and dialog answers to the keyboard.
- System 2 gains icon, face and tile sizes, default zoom and framing, and pixelated rendering.
- Enemy Action Patterns forecast what an enemy will actually do.
- The Sound Effect Generator saves OGG and MP3 as well as WAV.
- Skills can hit a random number of times, plugins can hand an action its targets, music sequences gain fades and pools, thanks to community pull requests.
- Fixes for loading a second map, blinking shadows, mouse and touch in menus under Pixi 8, and many database, theme and event editing details.

The source passes **3,177 automated tests**, with native editor and game checks driven by real pointer input over the sequence editor, the rig editor and the Demo battle. Full-game and plugin-combination testing remains ongoing.

Thank you to everyone contributing code and reporting issues with examples and screenshots.

[Download RPG Reactor](https://psychronic.itch.io/rpg-reactor) · [0.98.6 release notes](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.98.6) · [Battle Rooms and Action Sequences guide](https://github.com/Psychronic-Games/RPGReactor/blob/v0.98.6/docs/BATTLE-PRESENTATION.md)
