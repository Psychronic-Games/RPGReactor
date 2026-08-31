# RPG Reactor 0.98.4: Build the World, Not Just the Map

RPG Reactor is a free, open-source game engine and editor that runs your RPG Maker MZ and MV projects as-is, then adds features RPG Maker never had. Same data files, same plugins, no conversion. Open your project and keep working.

0.98.3 let you rig and animate 3D models. 0.98.4 puts them in the world and makes the world behave.

## Height is a coordinate now

Every event and prop has a Z, in tiles. Type it in the Event Editor, drag it with 3D arrows in the map view, or move it in play with the new Rise, Descend, and Set Height route steps (saved as steps RPG Maker simply ignores). Collision is vertical overlap: a catwalk over the street blocks nobody walking under it. On a flat 2D map, none of this touches anything.

## Props you can trust

Placing a 3D model on a map got a full toolset: a ghost preview follows your cursor, placement is one Ctrl+Z from undone, and a transform card gives you offset, rotation, and per-axis scale as live sliders. Collision now matches the actual mesh, so a long car blocks a long footprint and you can stand right next to a console instead of a tile away. A Passage toggle draws exactly what the game will block, in the 2D and the 3D view, including under your models.

## Effects live inside the world

An Effekseer effect anchored on a model is now part of the scene: it sits at its anchor's depth, hides behind walls and characters, scales with its model, and draws at full resolution. Video surfaces play on model parts, so a screen on a swinging monitor arm keeps its movie on the glass, in the game, the map editor, and the database preview. Animations can fire sounds, flashes, and database animations at timed moments.

## Events that don't freeze the player

Scoped Wait holds an event's script in the background while the player keeps moving: wait on animations, a duration, a switch, or a variable comparison. Play Model Animation commands queue, so an event fires a whole sequence and ends immediately. Transform 3D Model eases any model to a new offset, rotation, and scale over time. The Demo's tank runs its entire firing sequence while you walk away from it.

## Show Text became a conversation editor

One dialog edits a whole run of message boxes as a strip: add, remove, reorder, no four-line truncation. A live miniature of the box you're editing renders right under the text field with your project's windowskin, face, name box, colors, and icons, in your project's own font and resolution. Overflow marks are pixel-identical to the game, with escape codes measured the way the game measures them. And the right-click text-code menu knows your plugins.

## Models shrink on import

AI-generated and store-bought models ship heavy. The new import optimizer caps textures at 2K, packs skin weights, drops data the engine never reads, and welds duplicate vertices, with no visible change; an aggressive mode adds mesh simplification. The Demo's six biggest models went from 469MB to 168MB this way, and they look the same.

## Sharp, fast, everywhere

Fullscreen now renders at your monitor's actual pixels: 3D geometry comes out native-resolution sharp while windows and text keep their smooth scaling. The adaptive-resolution controller that quietly blurred the screen under load is opt-in now. If your game softens, it's because you chose to soften it. Browser games launch scaled to their window instead of a tiny box, the browser editor's playtest runs at full speed, and the browser demo opens straight into the 3D view.

## Community fixes

This cycle closed a stack of GitHub issues: Referenced By on every database record (#23), RPG Maker's familiar four-tab Conditional Branch, text codes with a live reference on descriptions and messages (#29, #30), enemy Max TP and smarter drop slots (#31), per-effect state durations (#16), random ranges on Grow and Change Parameter (#15), plugin-command file pickers that browse the right folder (#7), enemy action conditions for missing states (#32), a PIXI 8 crash under VisuStella battle transitions (#28), and the #33 follow-ups: AI target grouping that honors plugin-rewritten scopes, and ratings authored 1-9. A weekend of hard release testing also fixed a fullscreen freeze under screen tints, a black map when opening one project over another, and a pile of web console noise.

## Try it

Download RPG Reactor free at <https://psychronic.itch.io/rpg-reactor>, or try the browser editor right on the page. Point it at an existing RPG Maker project or start fresh with the bundled demo. Source code is at <https://github.com/Psychronic-Games/RPGReactor>.

Walk up to the reactor in the demo, poke the tank, and watch it not freeze you. That's the update.
