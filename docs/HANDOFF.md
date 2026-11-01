# Handoff

Read [STATUS.md](STATUS.md) for open work. Earlier: [archive/handoff](archive/handoff/).

Changes belong in the editor changelog; behavior goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-10-30)

- **0.99.3 source release:** runtime **20261028.11**, [release notes](posts/release-notes-0.99.3.md) and [editor changelog](../editor/changelog/0.99.3.md). **0.99.4** is open after the release push; binary publishing is separate.
- **Forge** (2026-10-30): Preview 62 adds eight Wasteland vehicles, seven-seat minivan and non-clothing construction repairs; Preview 61’s full clothing audit remains documented. Reload/re-export models. [Props](PROP-BUILDER.md), [clothing](CHARACTER-QUALITY.md).
- **0.99.4:** runtime **20261030.3**, PixiJS **8.22.0**, Three.js **0.187.0**; [legacy import audit](IMPORTING-LEGACY-PROJECTS.md#reliability-audit). Shared skins (20261029.8) raised North Haven Tactical from 76–81 to 158 pictures/s on RTX; CPU throttling and iGPU acceptance remain. [Performance](PERFORMANCE.md).
- **Battle/world presentation:** occupant-only cutaways, grapple arms, sleeping combat ragdolls and target hit badges pass native checks. Auto keeps cheaper shadows. Roof flicker needs a house/location; no fix claimed. Evidence: [PERFORMANCE.md](PERFORMANCE.md).
- **Border feedback:** a deferred cube face inherited its own sampler before plain water drew. Fixed at capture entry. Reproduce with `smoke/nw-border-feedback.cjs --uncapped` (continue west through Forest Road); short edge trips miss it. Evidence: `scratchpad/border-feedback-20261029/`.
- **Database/pop-out audit:** `smoke/nw-popout-audit.cjs`, evidence `scratchpad/popout-audit-20261029/`: all 25 pages and 136 command entries; nested and save/cancel flows. Menus, animation placement, Common Events and Fadein fixed. Rapid Database hide/reopen hung once on RTX; still open (STATUS).
- **Remaining work:** [OPEN-ITEMS.md](OPEN-ITEMS.md). Keep gameplay timing fixed; render available refreshes without imposing a cadence cap.
- **Older threads:** unused-file/playtest records, Braver port and Linux pop-out transparency remain; see STATUS and [PERFORMANCE.md](PERFORMANCE.md).
- **Testing (2026-10-31):** use `npm run test:changed`; never run the whole suite locally. See the entry below.

## 2026-10-30 — End-of-day checkpoint

The last prior commit was October 28. This checkpoint captures the outstanding 0.99.4 work carried through October 29–30: Forge tools/exports and prop construction, clothing and hair, web Forge packaging, legacy import reliability, Database/Common Events fixes, rendering/presentation work, pinned Three.js r187 and PixiJS 8.22.0, and the Tactical status-panel opacity repair. The detailed record is the [editor changelog](../editor/changelog/0.99.4.md); this is a development checkpoint, not a release or deployment.

That checkpoint used runtime **20261030.3** and **Preview 61**; the later prop continuation below advances the current resume point to **Preview 62**. Reload the editor and regenerate existing baked props to receive generator changes. The final clothing pass covers all **152 defaults**, eight views each, save/reopen and the actual game GLB reader. Its **126 focused checks** pass across recorded runs/rechecks; the final seam/budget run passes 12 and documentation/runtime-sync checks pass 10. Triangle maxima are **82,556 total / 51,412 outfit**, within the existing ceilings. [Quality record](CHARACTER-QUALITY.md#clothing-texture-and-seam-close-ups--2026-10-30-preview-61); [tracked per-item findings and provenance](archive/evidence/clothing-texture-seams-20261030.json).

Local galleries and logs remain in ignored `scratchpad/clothing-texture-seams-20261030/`: `comparison.html`, `native/review.html`, `native/export-audit.json` and `verification.json`. Larger earlier prop/renderer/native evidence is linked from the quality and performance guides. These rendered artifacts are local evidence, not committed project assets. The Demo checkpoint also preserves North Haven placement/Smithy edits, its usage record and the newly added `SCControllerMain` source GLB.

Next work: imported Carol/Jolt/Max/Vay borders/cuts still need source mesh/art repairs; some procedural inward joins retain angular facets. Chibi appearance, physical hardware acceptance, the Database rapid-close freeze and the unreproduced roof-flicker report remain in [OPEN-ITEMS.md](OPEN-ITEMS.md). Four wider-integration assertions already fail with both the old and new Three.js: the old armor ceiling, one-bone accessory assumption, furniture uniqueness and keycap legends. See [renderer validation](PERFORMANCE.md#threejs-r187-upgrade-2026-10-30-runtime-202610301). No fresh full-repository pass is claimed; the October 29 full-suite result is historical.

For substantial checks use `/home/doug/.local/bin/codex-check`, one at a time, with `node --test --test-concurrency=1`; native clothing batches stay at four entries (two for large Jolt/Max imports). Avoid deep-diffing texture/mesh arrays. Closeout validation passes **141 checks** covering documentation, runtime copies, renderer versions/compatibility, Tactical HUD, Common Events, legacy imports, web Forge and distribution staging. Logs: `scratchpad/closeout-20261030/checks.log`.

## 2026-10-30 — Non-clothing props and passenger minivan

Preview **62** adds eight salvaged vehicles under Vehicles → Wasteland and the seven-seat minivan under Modern. Rebuilt furniture, tools and salvage construction accompany the new models; rust maps and patch variation are editable. Minivan Details authors sliding doors, liftgate and a cabin cutaway. The existing game rider solver poses seven generated 1.75 m adults in the furnished three-row cabin. Runtime stays **20261030.3**. [Guide and evidence](PROP-BUILDER.md#non-clothing-props-and-new-vehicles-preview-62).

The baseline captured all 282 existing non-garment entries in three views; every front contact received review. Retained items are recorded separately from rebuilt forms. Local comparisons and captured exports live under `scratchpad/prop-audit-wasteland-20261030/`. This is procedural asset improvement, not a claim that all source shapes are photorealistic or that every vehicle has received an in-game boarding/playthrough audit. Regenerate older saved GLBs to receive generator changes.

Final evidence: **291** defaults, **1,063** native captures, save/reopen and **291** actual game-reader reloads. Four occupied variants also reload; native fit checks pose **23** adults (7 / 12 / 2 / 2). The final **39 focused checks** and the existing character triangle-budget ratchet pass. Logs and source provenance are in the [audit ledger](archive/evidence/prop-audit-wasteland-20261030.json); local gallery: `scratchpad/prop-audit-wasteland-20261030/comparison.html`. The shader diagnosis repaired collapsed tangent charts on salvage faces and weapon reinforcing plates. A stale Carol QA assertion now compares lining positions spatially after independent UV splits; garment geometry is unchanged. No fresh full-repository or exhaustive vehicle playthrough is claimed.

Resume with **Preview 62** and runtime **20261030.3**. Reload the editor and regenerate older baked models before judging the updated generators. The comparison gallery and per-item ledger distinguish rebuilt props from retained forms; use them to guide the next visual review. Source, tests and documentation belong in this checkpoint; rendered galleries and sample exports remain local, ignored evidence under `scratchpad/`.

## 2026-10-31 — Test redesign and uncommitted work

The suite took 21 minutes and later runs hit 26 GB, which systemd-oomd killed. `npm run test:all` now runs all 9,223 tests in 6 min 53 s on ten workers, peaking at 9.8 GB. Local and CI run the same tests.

- `tests/helpers/coverage.cjs`: sweeps test every value paired instead of multiplied. `RR_TEST_EXHAUSTIVE=1` walks every combination; no job sets it yet.
- `tests/helpers/small-pictures.cjs`: small default pictures. An explicit size wins.
- `tests/run-tier.cjs`, `tests/helpers/test-graph.cjs`: `test:changed` skips files that passed on exactly this code. Passes persist in `~/.cache/rpg-reactor-tests`.
- Atlas painting, cloth baking and vehicle finishing got faster with identical output, which also helps Forge sliders.

Costs are generator work, not checks: clipping is already math, and a fight file with 42 world boots runs in 0.4 s. Slowest files by CPU: `character-3d-model` 340 s, `prop-nature` 198 s, `prop-catalog` 184 s, `vehicle-bodywork` 171 s, `character-species-quality` 164 s, `character-fabric-materials` 162 s, `prop-vehicles` 130 s.

Everything from 2026-10-31 is uncommitted: the test failures fixed, the Prop Builder worker, the live character worker (`_rebuildOffPage`) and the generator speedups. The last full run had 6 failures, since fixed and passing individually, not in another full run. The cloth floor limit is doubled to 0.1% for the hard-leaning clip sample. The character slider worker has one Node test and has not been driven in the real editor.

## 2026-10-31 — Talking animals

`CreatureMouth.js` gives four-legged creatures a real mouth at the end of the build: the Body is sliced along a lip curve measured from the muzzle, a `Jaw` bone takes the lower skin, fur and whiskers, and a lining, tongue and teeth go inside. Mouth opening is `recipe.mouthOpen`; the builder's Head section has it and Talk (`_talkJaw`). The game's `talkRig` falls back to a Jaw bone, so Show Text moves it without a voice clip. Runtime 20261031.1.

Checked by Node tests and software renders of the geometry only. Not yet driven in the real builder or a game. Not covered: birds, reptiles and other body plans, blinking, ears or brows as expressions.

## 2026-10-31 — Clothing fit, Grey head, faces

`CharacterFit.js` is the last word on clipping, run from `CharacterWardrobe.build` after every garment is laid. Order per garment, skin outward: `tent` (thin tops only, not under a coat), `settlePiece` (vertices against skin and lower layers, spread and softened), `hug` (skin and lower-layer points against this garment's faces), then `tuck` presses finished layers under it, and a last sweep puts skin first. Skirts and linings are skipped on purpose: the cloth rig measures both from where they were laid; they still count as surfaces. `reveal` keeps skin near openings.

`CharacterDrape.drape` now starts cloth outside the layers under it (moved straight out from the trunk). Without this a hem starts inside a waistband and folds.

Debugging: model output is shifted so the feet touch the floor, so anything read from `built.shaped` (the fit's frame) sits about 2 cm from `result.parts`. Compare within one frame. Cross-sections of the actual triangles found the hem fold, the false pit and the skull shelf in minutes after renders hadn't; `tests/smoke/nw-character-review.cjs` gained `mouth` and `eyes` targets.

The Grey's skull is `greyDome` in `HumanBody.js`: a ball placed relative to the eyes and chin (`GREY_SKULL`), tangent lines to the chin, vertices cast out from a point inside the head. Don't cast from the ball's center: on a small skull it lies near the surface. The scalp's few vertices are evened over the surface afterward, which is what rounds the outline. `lipSculpt` is laid under every target, so sliders and expressions still work on top of it.

Lips are a detail patch like the areolas: `lipPatch`, `lipTexture`, `lipPart` in `CharacterDetail.js`, added in `CharacterModel.build`. Its UVs are mapped flat from the final shaped mouth (`lipFit`), not the rest mesh: mapping from rest bent the outline at every triangle, the lumpy edge. It follows expressions through `source`. The skin paint keeps only the inner roll, or a blurry second mouth shows round it. `sealMouth` (`HumanBody.js`) lays the two lip rims on one curve so a closed mouth has no slit; the cottage-cheese shelf under the lip and the flecks in the mouth line were the base mesh's own shape showing, which smoothing could not fix. Check grey geometry first when a face flaw appears.

Lashes are strands in `buildLashes` (no card picture), rooted on the skin; `lashTexture` remains exported but unused by the build. Lower lashes must fan down: pointing forward they read as dots.

Face form: `FaceFieldData.js` holds per-vertex moves, one set per sex, draped onto two CC-BY sculpted heads after their proportions were moved to an averaged landmark set, blended by gender and applied at the end of `shape` by `faceField`. Generated by `tests/tools/face-proportions/drape.py`, which replaced every earlier correction layer. Keep the attribution in THIRD_PARTY_NOTICES.md. Applies to `species: human` only so far. Every worker module list must include FaceFieldData.

Budget policy (owner, 2026-10-31): reach the look first, then cut from the good result. Ratchets raised today are not targets; optimize later.

`tests/smoke/nw-builder-controls.cjs --recipe=<file> --tab=face [--only=a,b]` drives every control in the real editor and reports any that don't stay, change nothing, or raise an error. Use it for UI work: unit tests never caught these.

Known limits: hanging skirts can still touch skin by a vertex or two; the drifter's open-coat-edge limit is widened for extreme bodies only (0.046); chest and belt parts fit before CharacterFit runs. Expression review found three open flaws: the smile crease curls sharply past the mouth corners; open-mouth teeth need better placement (a visible center gap, gum above them); crying tears render as bright jagged shards. A small bright tick can remain at the lip corners. Her saved thumbnail for Robust Grey Alien Female is stale until re-saved in the editor.

## 2026-10-31 — Human face, unfinished

The owner does not accept the faces yet and is handing this to someone else. Start at [HUMAN-FACE-HANDOFF.md](HUMAN-FACE-HANDOFF.md): how the face mask is built, how the owner judges, verified lessons, known faults and the test state. This replaces the Face form paragraph above: `FaceFieldData` is no longer blended by gender, and `CharacterHeadMesh.js` draws the visible face.
