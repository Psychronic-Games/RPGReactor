# RPG Reactor 0.94.1: Black Screen Fixes, Big MV Compatibility Gains, and a Bigger Effekseer Forge

Hey everyone! The last few days were a heads-down push on runtime reliability and RPG Maker MV compatibility, plus a pile of new content for the Effekseer Animation Generator. Here's what's new in 0.94.1.

## The black screen bug is dead

If your game ever froze on a black screen with nothing in the console, this one's for you. It turned out that resource loads (data files, images, audio) can silently die on slow or cloud-synced drives: no error, no timeout, nothing. The game would sit there waiting forever.

The runtime now watches every load from its own frame tick. Stalled requests retry automatically until they arrive, and files that are genuinely missing degrade gracefully (silent audio, blank image) with a clear console error instead of hanging your game. This works no matter which plugins you run, including plugins that replace the engine's own loading code.

## RPG Maker MV compatibility took a big leap

The goal is simple: your MV and MZ plugins should run on Reactor's modern PIXI 8 runtime without rewrites, even mixed together in one project. To stress-test that, we've been running a huge commercial MV game with a 168-plugin stack (Yanfly, Victor Engine, MOG, SRD, LeTBS, and more) on Reactor.

As of 0.94.1 it boots, plays its cutscenes, saves and loads through its own custom menus, and runs LeTBS tactical battles all the way into combat turns with the movement grid, turn order, and battle HUD rendering correctly. Getting there meant restoring a long list of MV-era APIs the plugins expect: MV's battle scene structure, its sprite animation engine, character balloons, message sub-windows, gauge drawing, tone filters, and about 25 more gap-fills. There's more to do, but the foundation is now solid.

## Effekseer Animation Generator: more toys

- The Interface category was rebuilt as true 3D instruments and grew to 21 recipes, including a build-your-own solar system (Orbital Survey), Starship Analysis, Reactor Core, Circular Gauge, Bar Meter, a 3D Battery, Behavior Matrix, Flight Prediction, and a living Composite Waveform oscilloscope. Every panel rotates properly in 3D and can display your own text.
- A new 10-recipe Physical attack pack: Slash, Bite, Punch, Impale, Claw Rake, Crush, Arrow Hit, Parry, Whip Crack, and Blood with adjustable splatter patterns.
- New Energy spells (Energy Boost, Energy Column, Binding Circle, Hex Forcefield), Christian Cross variants (Latin, Orthodox, Greek, Celtic), and jagged Ice Shards.

## Editor quality of life

- MZ-style tile-layer dimming in the map editor: pick layer 1 through 4 and the other layers fade so you can always see what you're editing.
- All the new Forge content is localized across the editor's 17 languages.
- Fixed Effekseer previews in the Database and Event animation pickers, plus a PIXI v8 compatibility fix for plugin hit-testing.

## Grab it

The full source and release notes are on GitHub, and updated builds are coming to this page. As always, if something breaks, a screenshot plus your console output (F12) is the fastest way to get it fixed.

Thanks for playing with RPG Reactor!
