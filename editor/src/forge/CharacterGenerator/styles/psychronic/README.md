Psychronic character style
==========================

This is RPG Reactor's sole bundled character style. Add part descriptors under
`parts/<category>/`, tagged with `psychronic` and the applicable gender tag.

Current state
-------------

- Built-in body base: `parts/body/male/body-psychronic-psychronic-body-male-01.js`.
- Outfit Forge support is wired through `procgen/styles/psychronic.js` and the shared `procgen/outfits/nova_sentinel.js` recipe.
- Generation routes through Psychronic-specific anatomy, classifiers, painters, masks, and extensions inside `procgen/outfit_engine.js`.
- Generated Psychronic full-outfit library files should be saved under `parts/full outfits/` and tagged with `psychronic`.
- Automated generation tests cover all four directions and three walk frames for the bundled Psychronic outfit recipes.
