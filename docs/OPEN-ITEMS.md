# Open items (2026-10-30)

Open during 0.99.4, runtime 20261030.3. Builder export/loading, Database zoom/orbit, chibi frame consistency and portrait grading fixes are recorded in the [changelog](../editor/changelog/0.99.3.md).

1. **0.99.4 priority: chibi visual quality.** The owner rejected the current chibi output as visually poor. Frame-to-frame consistency is fixed in 0.99.3; the style itself needs a quality pass. Improve head/body/hair balance, outfit silhouettes and facial readability at the target sprite size. Review complete exported front/side/back walking sheets at native size and enlarged, across representative bodies and outfits, before featuring chibi output publicly.

2. **Physical refresh and lighting acceptance.** Runtime 20261028.14 fixes metallic lamp response, local probe selection, capped presentation and the F2 callback count. Native controlled-clock and GPU checks are documented in [performance notes](PERFORMANCE.md#display-cadence-0994-runtime-2026102814). A visible 180 Hz town walk, vehicle ride and sustained low-end check remain useful; controlled clocks do not establish physical display throughput. Chibi visual quality remains the first content priority.
3. **Height reach "no limit"**: the owner asked; the fields are 0-10 (0 = off). Options: a No limit checkbox, or a maximum of 30 (the reach cap).
4. **Rhea's lines in North Haven** (Map005 event 12) have no face; her face set exists now.

5. **Rapid Database close/reopen freeze.** During the 2026-10-29 native pop-out audit, hiding the Database after Enemies/action-dialog checks hung both renderer pages on RTX 5070/ANGLE OpenGL; the browser CDP endpoint still answered. Earlier coverage only reproduced a close stall with SwiftShader. No app fix yet. Evidence: `scratchpad/popout-audit-20261029/close-hang-gpu.json`; ordinary nested checks allow 1 s before hiding. Investigate the native hide/preview cleanup path separately from the fixed popup bounds and animation-dialog ownership.

6. **Reported wall/roof flicker.** Not reproduced in the latest North Haven runtime. Native camera views cover the inn, north/south town houses and west cottage; sampled gable walls remain at least 0.034 tiles below roof skins across all 16 gabled building groups. No geometry change claimed. Need the affected house/location and whether it occurs in the game, editor or both. Evidence: `scratchpad/roof-refinement-20261029/`; inspection harness `smoke/nw-roof-sweep.cjs`.

7. **Imported wearable artwork and cuts.** Previews 60–61 repair shared garment construction, fabric finishes and seams; the close-up review still identifies source-art defects. Carol/Jolt/Max/Vay still have irregular source panel cuts and rough edge painting that need asset work. Preserve intentional armor segmentation while rebuilding damaged cuts; verify source meshes as well as fitted/exported pieces. [Audit and evidence](CHARACTER-QUALITY.md#clothing-texture-and-seam-close-ups--2026-10-30-preview-61).

Harness notes: a temp Demo copy must keep the Demo's own `js/reactor_plugins.js` (copying `runtime/*.js` over it empties the plugin list, and the Demo's plugins matter: PSYCHRONIC_KeyboardConfigMZ swaps the key map on every Input.clear). Run substantial suites through `/home/doug/.local/bin/codex-check node --test --test-concurrency=1` with literal test filenames, as required by the workstation's resource limits.

Native capture note: when `Viewport.enlargedInComposite("below")` is true, capture its `_workTarget("below")`; the full-size target is not refreshed because PIXI performs the upscale. Reading the full-size target can make a changed camera or material look unchanged.
