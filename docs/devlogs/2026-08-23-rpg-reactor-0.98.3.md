# RPG Reactor 0.98.3: Rig It Yourself

RPG Reactor is a free, open-source game engine and editor that runs your RPG Maker MZ and MV projects as-is, then adds features RPG Maker never had. Same data files, same plugins, no conversion. Open your project and keep working.

0.98.3 is our biggest 3D release yet.

## Rig 3D models inside the editor

Drop a static 3D model into your project, drag a handful of joint markers onto it, and press Bind. That's it. No Blender, no Mixamo, no export round-trips. Your model is rigged and ready to animate.

Then open the Preset Motions library and apply real animations in one click: walking and running with proper gaits, idle breathing, sword slashes, aimed rifles, jumping, swimming, and more. Skeleton templates cover humanoids, quadrupeds, plants, and vehicles. Every applied motion becomes plain, editable animation data you can tweak.

Models that come with their own animations work too. Embedded GLB clips show up in the editor, playable with one click.

## 3D anywhere you want it, 2D everywhere else

Actors, enemies, weapons, armor, and items can all carry 3D models now. Actors bind per surface: keep painted face portraits over a 3D world map, put a live 3D battler in combat, or mix however you like. Everything stores in sidecar files next to your MZ data, so RPG Maker can still open the same project without seeing a thing.

## Fast

Every model a map needs loads behind the loading fade, parsed on a background thread with shaders precompiled. Models are simply there when the map appears. No pop-in, no stutter.

## Also in this release

* MP3, WAV, and FLAC audio support with loop tags and album art
* A full editor polish pass: better dialogs, responsive layouts, localized deploy windows
* PixiJS 8.20 under the hood, tested against plugin-heavy MV and MZ projects

## Try it

Download RPG Reactor free at <https://psychronic.itch.io/rpg-reactor>, or try the browser editor right on the page. Point it at an existing RPG Maker project or start fresh with the bundled demo. Source code is at <https://github.com/Psychronic-Games/RPGReactor>.

If you rig one of your own models, tell us how it went. That feedback drives what gets built next.
