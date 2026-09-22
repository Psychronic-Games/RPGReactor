# 2D template compatibility audit — 2026-09-06

Runtime: **20260906.17**. Native NW.js startup, selected maps, six stock menu
scenes with return to map, and configured Battle Tests were sampled across the
11 non-3D templates. Demo and MZ3D were excluded from this 2D pass.

This is a smoke audit, not a whole-game compatibility certification. The audit
found real problems; it does not establish that every problem originated in
that day's 3D changes.

## Findings and fixes

- **Freelancers picture choices:** the plugin kept global references to sprites
  owned by an old scene and never populated its cleanup list. Returning from a
  menu could animate a destroyed sprite whose `scale` was null. The runtime
  adapter tracks ownership, detaches/destroys owned sprites, and clears stale
  references without deleting image definitions or a newer window's sprites.
  Native startup and all six menu return paths now complete without that crash.
- **Origins language flags:** choices drew while IconSet was still loading after
  a cache/preload transition. The window now refreshes its current choices when
  the sheet becomes ready, coalescing listeners and ignoring destroyed windows.
  Native startup visibly shows all six nation icons.
- **Origins video parallax:** metadata exposed 1280×720 dimensions before a
  decoded frame existed. PIXI's uploader recorded those dimensions after a
  failed upload while the GPU still held its old small allocation. Allocate
  matching transparent storage until a frame is ready, then use the normal
  uploader. Map 489 now renders without texture-overflow errors; extraction
  confirms nonblank video pixels, a playing video at time 2.90s, and matching
  1280×720 resource/source/sprite sizes.
- **Freelancers robot facing (authored notes):** enemy 354, Reznorian Power Mech,
  set `direction: subject, down` before starting a new motion. The existing
  plugin resets direction on motion changes, and its vertical walking default
  selects the up-facing sheet row. Move the direction command after
  `motion: subject, walk` in this enemy's entry notes. Native Battle Test confirms
  all three robots use row 0 (down), while actors use row 3 (up).
  **No runtime or plugin facing override was retained.** Only this enemy's entry
  command order changed; other enemies and phases retain authored behavior.
  `template/Star Shift Freelancers/data/Enemies.json` is ignored project data,
  so this local content correction is not part of a normal tracked-code commit.

Previously verified fog scrolling and opacity fixes remain in place. Rebellion's
native fog test confirmed moving dust, three visible title ships, and alpha
matching the original MV renderer at opacity 0, 100, 192 and 255.

## Coverage

All rows completed startup, map frame updates and the six stock menu scene/return
probes. Some probes deliberately enter standard scenes that a project's custom
UI normally replaces; they do not establish coverage of those custom UIs.

| Template | Additional map/input coverage | Configured Battle Test |
| --- | --- | --- |
| Barebones | Starting map, directional input | Loaded; attack invocation observed |
| Hendrix RPG Maker Action Combat MZ (v166a) | Map 69; tutorial blocks movement | Not a conventional battle probe |
| Parallax | Starting map, directional input | Custom simulation not exercised |
| Project2 | Starting map, directional input | Loaded; attack invocation observed |
| Project3 — Haven | Map 48; movement 27,27 → 32,27 | Loaded; attack invocation observed |
| Project4 — FFXI: Braver | Map 7; movement 32,23 → 36,23 | Loaded; attack invocation observed |
| Star Shift Freelancers | Map 3; movement 9,10 → 13,10 | Loaded; corrected robot entry facing; forced-action completion not established |
| Star Shift Origins | Map 489; movement 18,17 → 21,17; video parallax and language flags | Loaded; forced-action completion not established |
| Star Shift Rebellion | Map 6; movement 14,3 → 18,3 | Loaded; attack invocation observed |
| Star-Shift Legacy | Map 6; movement 14,3 → 18,3 | Loaded; attack invocation observed |
| ccv2 | Starting map, directional input | Loaded; attack invocation observed |

Final sampled paths had no captured missing-file, runtime or WebGL errors.
Freelancers and Origins did not invoke the forced test action within the sampled
4.5-second interval; this remains a coverage limitation, not an asserted engine
failure or a successful action test. Other projects reaching `invokeAction` also
does not prove complete action choreography, victory, rewards or cleanup.

Not covered: complete playthroughs, every map/encounter/plugin command, Hendrix
combat, Parallax simulation, tactical deployment, full battle-end → transfer →
autosave, save/load round trips, and custom minigames. Braver's previously noted
victory/transfer/autosave coverage remains open.

## Reproduction and evidence

`editor/tests/smoke/nw-template-2d-audit.cjs` makes disposable copies of writable
project state and uses separate profiles. It does not write source maps, plugin
lists or saves. Project2's raw MZ launch is converted only in that temporary copy.
The single robot note correction above is a deliberate local project edit,
separate from test setup. Runtime syncing preserves `reactor_plugins.js`.

```sh
node editor/tests/smoke/nw-template-2d-audit.cjs
node editor/tests/smoke/nw-template-2d-audit.cjs --explore '--projects=Project3|Project4|Star Shift Freelancers|Star Shift Origins|Star Shift Rebellion|Star-Shift Legacy'
node editor/tests/smoke/nw-template-2d-audit.cjs --battle '--projects=Barebones|Project2|Project3|Project4|Star Shift Freelancers|Star Shift Origins|Star Shift Rebellion|Star-Shift Legacy|ccv2'
```

Local evidence (temporary files, not committed):

- Initial maps/menus: `/tmp/rr-template-2d-audit/`; corrected menu/startup reruns:
  `/tmp/rr-template-2d-fixed/`.
- Additional maps: `/tmp/rr-template-2d-maps/`; final Origins video rendering:
  `/tmp/rr-origins-video-pixels/`.
- Battle probes: `/tmp/rr-template-2d-actions/`; final robot notes-only correction:
  `/tmp/rr-freelancers-facing-notes/` (JSON includes measured frame rows).
- Automated suite: **2,883 passed, zero failed**,
  `/tmp/rr-template-audit-full-final.log`. Twelve new focused checks cover picture
  sprite ownership, delayed choice icons, and pre-frame video upload allocation.
