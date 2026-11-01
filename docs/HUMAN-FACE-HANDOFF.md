# Human face: handoff (2026-10-31)

## Current follow-up — Preview 65

Preview 64 was rejected by the owner for ear coverage and unnatural nostrils. Its front-heavy review missed the bald side-view defects. Its passing checks do not establish visual quality.

The face patch now stops in front of the ears. Native ear vertices are excluded from hidden skin. The seam binds along continuous rays through the native skull rather than switching between unrelated nearest triangles; its larger triangles are refined before fitting. At the join, UVs come from the actual native triangle, including chart splits. The forehead ends below the crown. Extra brow triangles behind the eye plane are excluded so the brow picture does not wrap into bars on the temple. Face shading softens the sculpt before blending with native skin; it must not lighten the inherited shade at the join.

The reference's tall nostril folds are narrowed and their small lower-wall bulges are recessed. Their normals follow the reworked geometry. Bounded local visibility supplements the native cage's occlusion; the interiors retain the skin material, with no near-black depth paint. Experiments that opened separate nasal passages distorted the upper lip and were removed.

Restart the editor and regenerate saved characters for Preview **65**. Runtime stays **20261031.1**. Visual acceptance remains open: the temple blend and nasal folds still warrant close review. This is a targeted follow-up, not a claim that the human faces are finished. Validation covers 24 focused checks, four saved-quality geometry profiles, and eight native captures, including ear controls and one actual saved GLB reopened in two views with a complete blink. No triangle or morph ceilings were relaxed. New captures and checks are recorded in [the follow-up ledger](archive/evidence/human-face-ears-nose-20261031.json); earlier numbered scratch folders are rejected experiments.

## Resume in the morning

The owner deferred review and requested this checkpoint. **Preview 65 has not been reviewed or accepted by the owner.** Start with the current follow-up above; the sections below preserve rejected checkpoints and must not be treated as current instructions.

1. Restart the editor, then regenerate characters so cached previews and older saved geometry do not obscure the changes. Inspect female, male and intermediate defaults with their normal hair, then bald from both sides and underneath. Compare with the finished reference models in `scratchpad/Attractive-Models/`. Overall attractiveness remains the goal.
2. Check ears, temples, scalp and under-chin joins through a full turn. Exercise ear size, projection, lobe and pointed-ear controls. Look for covered ears, torn or overlapping skin, color seams and eyebrow bars. The automated follow-up sampled selected ear settings, not every combination.
3. Prioritize the nose: low-angle captures still show rough, pale inner folds and strong recess contrast. Check ordinary front and three-quarter views as well as the underside, on light and dark skin. Neither the nostril shape nor overall face quality is finished. Do not restore the rejected open-passage experiments; they distorted the upper lip.
4. Check full blinks, smiles, surprise, crying and Talk. Look for exposed teeth at rest, mouth-corner spikes, distorted brows and rough tears. Try gender values around 0.5, age, ancestry, head/nose/jaw controls, and skin/eye color changes followed by a return to the original color. Repeat with hair and headwear; the broader Preview 64 audit predates the latest geometry.
5. Save fresh female and male models, reopen them, and compare their materials, blink and speech with the builder. Verify dialogue in an actual game. The current follow-up saved one intermediate model and reopened it in two studio views; it was not a gameplay audit. Windows and macOS remain unchecked.

Local evidence is in `scratchpad/face-ear-nose-20261031/`: `comparison.html` and `comparison.png`, `final-core-4/`, `final-extras-3/`, `focused-final.log`, `quality.json` and `docs.log`. These pictures, reference assets and saved models remain local and ignored by Git; the code, fixtures, attribution and evidence manifests are committed. The earlier `scratchpad/face-recovery-20261031/` gallery records the rejected Preview 64 result.

For automated reproduction, use the tracked recipe and shot files described in [the face tools guide](../editor/tests/tools/face-proportions/README.md). Keep heavy checks inside `codex-check`, one at a time, with at most four captures per browser. Generated `HeadMeshData.js` must be rebuilt through the generator, never edited by hand. Passing tests do not close the visual review.

## Rejected recovery — Preview 64

The shared human sculpt replaces the two unrelated masks described in the historical handoff below. It derives from the licensed finished **Woman head** by zhuoyi0904, reworked into feminine and masculine endpoints on one topology. Gender interpolates continuously, including across 0.5. Original skin, eye, ancestry, slider and expression controls remain in use; other species and animal heads retain their own surfaces. The owner rejected this checkpoint after opening the editor: the ears were obscured and the nostrils looked unnatural.

`build_head.py` retains the reference’s folded eye/lip surfaces and authored shading normals. It removes the closed oral cap and brings the opposing lip rims together at rest; otherwise speech stretches a painted skin panel across the opening. Twelve shared skin bindings per vertex carry the native controls. Upper forehead, temples and under-chin blend back to the native skull. Native skin coverage is measured from actual mask triangles. Separate lids unfold over fitted eye ellipsoids for blinking without dragging the brow. Their base shading normals describe the visible unfolded surface, preventing dark bars in saved position morphs; the named blink and speech units bypass emotion-strength scaling. Fine pores export on UV1. Teeth fit the measured mouth line. Separate upper/lower inner lip folds overlap behind the neutral slit and separate during speech; the rear lining follows expression interpolation.

Default female humans use the long center part; explicit hairstyles are preserved. Eye materials use the same factors in preview and GLB. Full helmets omit their hidden face geometry. Unused native vertices no longer inflate exported morphs. A stale live-worker result can no longer replace a newer recipe. Its skin cache key and pixels update together; the painter uses the same head schema and resting-mouth units as the model worker. Native review waits for painting, the live build and shading before capture.

Rebuild instructions and source/hash provenance are in [the generator guide](../editor/tests/tools/face-proportions/README.md). Attribution is in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md#character-face-base-heads). This is the historical Preview 64 checkpoint; use the Preview 65 instructions above for the current code. Runtime remains **20261031.1**.

Rejected Preview 64 evidence is under ignored `scratchpad/face-recovery-20261031/`. Earlier numbered render folders include rejected experiments; the final folders and comparison gallery record that rejected checkpoint. Validation: **100 focused checks** across 11 files, followed by **22 expression/shared-head checks** after the final lip-root refinement. Five selected catalog/model regressions pass; the corrected crown-surface check also passes. The latter previously merged nearly coincident crown/stitch ray hits and falsely reported a hair leak; cap construction is unchanged. No triangle or morph budgets were relaxed.

The native audit covers **28 control changes** with no problems and **24 final captures**: defaults, intermediate/age/ancestry profiles, expressions, colors, headgear and saved-model views. Two actual saved GLBs reload in four views through the game reader’s studio mode; embedded PNGs decode, 28 morph names survive, and the rendered neutral-mouth/blink checks pass. Four saved-quality geometry profiles have no invalid triangles or normals. The color round trip keeps the skin cache paired; one byte of a 4 MiB picture differs by one level between painting paths. [Provenance and scope](archive/evidence/human-face-recovery-20261031.json).

The local `comparison.html` and `comparison.png` use initial before captures and final defaults at the same front camera. Hair artwork and extreme expression polish remain broader visual work. No new full-repository pass or owner aesthetic approval is claimed. Windows and macOS have not been exercised.

## Historical handoff — previous implementation

The remaining sections preserve the prior assessment and diagnostic record. Their implementation details, defects and test counts describe the earlier checkpoint, not Preview 64.

**State: unfinished, and the owner does not accept the result.** The faces are better than the MakeHuman defaults but still ugly in the owner's judgment. The goal is attractive, natural default human faces (female, male and androgynous) that people want to use, with sliders, expressions, skin tone and eyes still working. Treat everything below as a record of what exists and what was learned, not as a proven approach. Replacing the method outright is a fair option.

## Who did this and how it went

This work was done by Claude Opus 5.5 on 2026-10-31, and it was very bad. It failed the goal: at the end of a full day the faces were still ugly, and the owner stopped the work to hand it to someone else. The day was wasted, out of the limited weekend time the owner had, and the owner is considering cancelling their subscription because of it. A fault the owner had reported would often come back, or a fix would break something else, so the owner spent the day supervising and correcting basic mistakes. It repeatedly reported defects as fixed before checking them, named one cause after another, tuned against the bald base heads instead of the finished references until the end of the day, and held ready fixes back for test runs. The owner found most of the visible faults, not the model. Weigh its conclusions here accordingly, and check them yourself.

The owner's assessment, 2026-10-31: the quality of Anthropic's Opus 5.5 has degraded by a lot compared with earlier work on this project, and today's output was far below what it has delivered before.

## Look at this first

Pictures live in `scratchpad/Face-Experiment-4/` (ignored by git, kept in the owner's Dropbox):

- `compare-references.png`: finished references and ours, one camera, scaled to the same eye spacing. Top row: three female references, then our female. Bottom row: two male references, our male, our gender 0.7.
- `current.png`: ours in several expressions, close-ups and slider cases.
- `working-files/`: the scratch copies of every script, the render shot lists, recipes, reference renders and the depth maps `headmesh.py` reads. `/tmp` is RAM, so this is the only surviving copy of those maps.

The reference models are in `scratchpad/Attractive-Models/` (more are being added; `Anime/` is for a later anime mode).

## How the owner judges

- By eye, in the running editor, from several angles, animated and in expressions. Numbers do not settle it.
- As a whole face. Every time one cause was named ("it's the proportions", "it's the painted color") the owner rejected it as an oversimplification, correctly. Reference faces work as a whole.
- The references are the finished, textured models. Use them as mesh inspiration, not copies: "mesh inspiration… not a direct copy", must connect to the body, keep the sliders and the skin, eye and color logic. Human only; other species keep their own heads.
- Don't report a fix before looking at it close up, from both sides, on in-between bodies. Don't hand over half-finished renders. Keep working while faults are open: a test run is not a reason to wait.

## How it is built

1. `HumanBody.js` `shape`, in order at the end: `faceField` (per-vertex moves from `FaceFieldData.js`, the female or male set, not a blend), `sealMouth`, `seatEyes`, `faceOutline`, `noseWidth`, `eyeSet`. `FACE_OUTLINE`, `NOSE_NARROW` and `EYE_IN` are the tuning tables.
2. `CharacterHeadMesh.js` plus generated `HeadMeshData.js`: a face **mask** (forehead to under the chin, in front of the ears) from two CC-BY sculpted heads. Each vertex is a weighted sum of six hidden MakeHuman skin vertices plus an offset scaled by eyes-to-chin, so sliders and expressions reach it through the skin (`interpolation`). Scalp, ears and neck stay the body's. `hide` drops the skin under it. `RR_NO_HEAD_MESH` turns the mask off.
3. Everything on the mask is fitted there too: `lipPart`/`lipFit` (lip decal on the measured outline), `browPart`, `lashRim` (lashes on both lid edges), `sphereEyes` (the eyeball is rebuilt as one sphere from the lids on that body, turned to look out of the opening, shaded by the lids), `mouthPart` (dark behind the open mouth). Nostrils and creases darken through `tone`, applied with the baked shade.
4. Shading: `CharacterShading.headFromBody` blends the mask's occlusion into the skin at its edge and applies `lidWall` and `tone`. It runs in `CharacterModel.shade` and separately in `Character3DBuilder.js`. Fields added to a part must also be listed in `GEOMETRY_FIELDS`/`PART_FIELDS` in both preview workers.

## Rebuilding the data

Scripts are in `editor/tests/tools/face-proportions/`; see its README. They assume one scratch folder holding the scripts and `refs/`: start from `scratchpad/Face-Experiment-4/working-files/`. The generated JS files must not be edited by hand. **Read the generator's output before trusting a render:** one crash left old data in place and the render looked like a result.

## Verified lessons

- Compare with the finished references first (`swap.js` puts a reference on our body at the same eye spacing, `raster.py` draws bare geometry with one camera and light). This found more in minutes than hours of tuning: our head was about 14% narrower and hollow, eye openings about 0.41 of eye spacing against 0.5 to 0.55, irises about two-thirds of the opening against one half, brows low and full on the references. A theory that raised brows would help was simply wrong.
- Reference lids fold back under themselves; the mesh boundary is the hidden inner edge, not the visible one. The fold faces are cut in `headmesh.py`, so the boundary is now the lid edge and lashes root on it.
- `headmesh.py` works in y-down coordinates, so a face's front is -z in the winding.
- Binding to different vertex patterns on either side of a line leaves a crease once the outline deforms the face. Keep bindings continuous.
- Render in-between bodies (gender 0.3 and 0.7, ages 15 and 62). Gender 0 and 1 alone hid eyeballs bursting from their sockets.
- Earlier proportion solving from sparse landmarks was unreliable, and a polynomial muzzle made a plate. Both were dropped.

## Known faults

Worst first, as of the last render:

1. **The overall face is not attractive.** The two heads are bare sculpts. Compared with the references, ours lacks defined sockets and lids, real lip form and highlight, and depth and variation in the skin.
2. **Default hair** sits like a cap with a rough hairline. It was not refitted to the wider head, and only the default style has been looked at. References have hair framing the face.
3. **Rippled creases beside the female's outer eyes.** Cause unknown. A binding fix changed them but did not remove them.
4. **Expressions:** the female's smile leaves dents, her surprised mouth is boxy and rough inside, the male's smile is weak. Expressions were not retuned for the mask.
5. **Male:** thin upper lip, looks older than the references, dark band above the lid (it shows without the skin's normal map and picture, source unknown).
6. **Inner eye corners** have small marks. Lower lashes are still too regular up close.
7. **No neutral face.** The head switches between the female and male sets at gender 0.5, with a visible jump. The androgynous request is unmet.
8. **Skull height:** both crowns are lower than the references'.
9. **Anime eyes, Custom eye type and the eye sliders** have not been checked since `sphereEyes` replaced the ball.
10. **Not verified on the final code:** the real-editor control audit (`tests/smoke/nw-builder-controls.cjs`), blink, saved GLB export, other ancestries, Windows and macOS.

## Licenses

`THIRD_PARTY_NOTICES.md` credits "Male head base" by alkalor and "Female Elf Head" by Scol3D, both CC-BY 4.0, whose derived data ships in `HeadMeshData.js` and `FaceFieldData.js`. Do not ship data from other references without checking their licenses: `mita_miside_free.glb` is NC-ND, the saree is Sketchfab Standard, and several show existing characters.

## Test results

Last full run on 2026-10-31 (`npm run test:all`): 9,238 tests, 18 failed. A worker crash and a script-order fault were then fixed, and the failed files were rerun: 13 failures remain. These were not repaired or re-baselined; each needs a decision on whether the code or the old expectation is right.

- Fall out of the mask directly: `default brows lie just above the eyes`, `the lips stand forward of the skin`, `eye size reaches big eyes` (`sphereEyes` now sets the eyeball's size), `short torso and neck carry the skull whole` (the skull is reshaped), `Ferengi nose folds refine connected skin`.
- Likely the wider head: `hidden ears leave ear holes`, `cap crown contains sampled crew hair`, `requested cuts have distinct silhouettes`, `a full beard is a soft volume`, `armor presets include the matching helmet`.
- Catalog sweeps: `character accessories face outward` (the monocle is first), `every catalog entry builds whole`, `Randomize: every kind rolls 50 believable recipes`. Hats, eyewear and masks were fitted to the old head.

Passing tests say nothing about how the faces look. The faults above were found by eye.
