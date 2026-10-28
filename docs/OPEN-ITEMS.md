# Open items (2026-10-28)

Open after runtime 20261028.11. Builder export/loading, Database zoom/orbit, chibi frame consistency and portrait grading fixes are recorded in the [changelog](../editor/changelog/0.99.3.md).

1. **Optional distance/night readability tuning.** Material images now survive loading, and game shaders sample normal, glow, roughness/metalness and occlusion maps. Database Builder-model inspection uses studio PBR materials. The game still uses map lighting and defaults to render scale 0.75; Auto quality can reduce that further while frames are slow. No global resolution or night-lighting defaults changed. Rhea's generated GLB materials and all four new Demo heroes' face sheets are refreshed; re-export other older characters to carry updated material settings. Wider visual acceptance at the owner's usual night-map battle zoom remains useful.
2. **Height reach "no limit"**: the owner asked; the fields are 0-10 (0 = off). Options: a No limit checkbox, or a maximum of 30 (the reach cap).
3. **Rhea's lines in North Haven** (Map005 event 12) have no face; her face set exists now.

Harness notes: a temp Demo copy must keep the Demo's own `js/reactor_plugins.js` (copying `runtime/*.js` over it empties the plugin list, and the Demo's plugins matter: PSYCHRONIC_KeyboardConfigMZ swaps the key map on every Input.clear). Run substantial suites through `/home/doug/.local/bin/codex-check node --test --test-concurrency=1` with literal test filenames, as required by the workstation's resource limits.
