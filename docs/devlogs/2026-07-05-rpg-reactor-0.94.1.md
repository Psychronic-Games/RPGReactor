# RPG Reactor 0.94.1: Make Your Own Effects with the Forge

RPG Reactor 0.94.1 is out. The headline this release is the Forge, the set of in-editor generators for making your own game assets without leaving the editor and without external tools.

## Effekseer Animation Generator

You can now build native Effekseer particle effects (.efkefc) entirely inside RPG Reactor. Pick a recipe, turn the sliders, watch the live 3D preview, and export straight into your project. No Effekseer editor required, and the format engine is validated byte-for-byte against all 120 stock MZ effects.

What's new in 0.94.1:

- **21 sci-fi interface instruments, rebuilt in true 3D.** Orbital Survey lets you build your own solar system with per-planet sizes and custom planet textures. Starship Analysis draws a parametric wireframe ship with tracking callouts. There's a Reactor Core, Circular Gauge, Bar Meter, a segmented 3D Battery with drain/fill/short patterns, Behavior Matrix, Flight Prediction, and a living Composite Waveform oscilloscope. Every instrument rotates properly in 3D and takes your own text, so one recipe can mean whatever your game needs it to mean.
- **A 10-recipe Physical attack pack** for battle effects: Slash, Bite, Punch, Impale, Claw Rake, Crush, Arrow Hit, Parry, Whip Crack, and Blood with adjustable splatter patterns and full color control.
- **New Energy spells and symbols**: Energy Boost, Energy Column, Binding Circle, Hex Forcefield, four Christian Cross variants (Latin, Orthodox, Greek, Celtic), and jagged Ice Shards.

Everything supports layers, keyframes, custom textures, randomize, and presets. If you can describe the effect you want, you can probably assemble it here in a few minutes.

## The Forge keeps growing

The same idea runs through the whole Forge: generate assets, preview them live, save them into your project.

- **Animation Generator**: 80+ procedural 2D animations with layered composition and keyframe timelines, exported as bake-ready sprite sheets.
- **Character Generator**: procedural Outfit Forge and Hair Forge tools that produce RPG Maker-style walking-sheet parts with live 4-direction previews.

More generators and more recipes are on the way. If there's an asset type you keep buying or hand-drawing that you'd rather generate, tell us in the comments.

## Fixes worth knowing about

- **Map editing**: MZ-style tile-layer dimming landed. Select layer 1 through 4 and the other layers fade, so you always know which layer you're painting. Layer erasing and imported-map autotile handling got fixes in the recent releases too.
- **Playtest**: launching and relaunching playtests is reliable now, with proper profile isolation on Windows and a clean runtime layout in packaged builds.
- **The silent black screen is fixed.** Resource loads that die without an error (common on slow or cloud-synced drives) used to hang games forever. The runtime now retries them automatically and reports genuinely missing files in the console instead of freezing.
- All new Forge content is localized across the editor's 17 languages.

## On RPG Maker compatibility

The direction is unchanged: RPG Reactor aims to run your existing MV and MZ projects and plugins on its modern PIXI 8 runtime, even mixed in one project, while the editor and Forge move things forward in ways the original tools can't. Compatibility work continues every release; 0.94.1 shipped a large batch of MV runtime fixes, with more to come.

Source and full release notes are on GitHub. If something breaks, a screenshot plus your console output (F12) is the fastest way to get it fixed.
