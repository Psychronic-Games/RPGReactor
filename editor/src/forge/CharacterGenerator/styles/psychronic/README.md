Psychronic character style
==========================

This style uses the same ASCII JavaScript part format and parts folder layout as Looseleaf.
Add part descriptors under `parts/<category>/`, tagged with `psychronic` and the applicable gender tag.

Current state
-------------

- Built-in body base: `parts/body/male/body-psychronic-psychronic-body-male-01.js`.
- Outfit Forge support is wired through `procgen/styles/psychronic.js` and the shared `procgen/outfits/nova_sentinel.js` recipe.
- Psychronic can use the same Outfit Forge config schema as Looseleaf, but generation routes through Psychronic-specific anatomy, classifiers, painters, masks, and extensions inside `procgen/outfit_engine.js`.
- Generated Psychronic full-outfit library files should be saved under `parts/full outfits/` and tagged with `psychronic`.

Next validation target: open Forge -> Character Generator -> Outfit Forge, switch Style to Psychronic, and inspect Nova Sentinel across all four directions and three walk frames before treating generated Psychronic outfit output as production-ready.
