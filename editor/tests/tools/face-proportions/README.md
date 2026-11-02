# Face tools

Builds the human face data and compares it with the reference heads. State, findings and open faults are in [docs/HUMAN-FACE-HANDOFF.md](../../../../docs/HUMAN-FACE-HANDOFF.md).

## Shared sculpt (Preview 69)

Preview 66 studied proportions and repairs the temple/forehead transition for both endpoints. Human skull width, eye spacing, lids/globes, iris scale and the nose-to-mouth interval are coordinated. Gender remains continuous. Native ears and the other species retain their own surfaces. The boundary's position, normals, skin charts and baked shade now blend across the transition instead of completing their blend halfway through it. Visual acceptance is still the owner's judgment.

Preview 69 tapers the lower jaw separately from the cranium, reduces masculine jaw/chin exaggeration, rebalances mouth/nasal widths and refines the cheek planes and smooths broad shading normals. Source eye sockets are opened and their rims faired before adding their lining; native lids remain hidden. The separate blink sheet folds straight behind the rim, avoiding exposed canthus flaps. The generator remains the only source of `HeadMeshData.js`.

Live slider validation adds `--continuous` to `nw-builder-controls.cjs --drag-release`: 24 pointer moves test that distinct completed worker samples appear before the last input, then compare held/released positions, normals and camera. Completed samples are permitted only within one active scalar gesture with all other recipe fields unchanged.

### Research and measurements

[Pallett, Link and Lee (2010)](https://pmc.ncbi.nlm.nih.gov/articles/PMC2814183/) define `L = eye-to-mouth / hairline-to-chin` and `W = pupil spacing / width between inner ear edges`. Their fitted functions include `T(L) = -51 L² + 37 L - 6` and `T(W) = -89 W² + 82 W - 19`; differentiating gives optima about 0.363 and 0.461. These describe spacing changes within female photographs, not universal scores for people or male faces. [A 3D study](https://pmc.ncbi.nlm.nih.gov/articles/PMC9452610/) found most proposed ideal measurements did not track attractiveness. Use these as guides alongside whole-face, profile and expression review.

`measure-head.cjs` reports camera-independent pupil spacing, an explicitly labeled ear-root width **proxy**, and eye-to-mouth distance for the female, intermediate and male defaults. Its mask-defined roots are not the study's manually marked photographic landmarks. It deliberately produces no attractiveness score and does not substitute crown height for hairline height.

```bash
/home/doug/.local/bin/codex-check node editor/tests/tools/face-proportions/measure-head.cjs scratchpad/face-metrics.json
```

The geometric transition uses `6t⁵ - 15t⁴ + 10t³`, whose first and second derivatives vanish at both ends, plus constrained surface fairing. This is a surface continuity construction, not a formula for beauty. The default proportion warp preserves transverse vertex ordering and leaves the lip/eyelid folds usable.

### Side-cheek transition (Preview 98)

The minimum-slider side view exposed a separate join issue. `cheekSurface` in `HumanBody.js` now carries native side-cheek skin through the contour change, so retracting only the replacement cannot leave the surrounding skin standing proud. `CharacterHeadMesh.positions` uses the transition’s existing barycentric triangle bindings to bound inward clearance, with a small, smoothly introduced positive margin to avoid coplanar overlap. The head inherits the body’s actual shaded normals; the body smooths the same cheek field. The focused minimum-cheek regression measures signed overlap at the native triangles on female/intermediate/male heads. Runtime stays 20261101.24, and generated head data remains unchanged. Full acceptance remains visual.

### Broad cheek surface (Preview 97)

The owner’s marked region is lower and broader than the upper malar ridge: the anterior cheek beside the nose and below the outer eye. `CharacterHeadMesh` now applies separate ridge and cheek projection fields on the visible sculpt. The cheek’s neutral projection is reduced, **Cheeks** changes its forward fullness, and **Cheekbones** contributes to the adjoining plane. Masks are cached per pack/data/gender using the same reference vertex identities, so target narrowing cannot weaken the correction by moving vertices out of its mask. Six local normal-averaging passes smooth broad satin highlights while keeping the surrounding feature/seam support. `HeadMeshData.js` remains generator-owned and unchanged by this runtime sculpt correction. New focused projection coverage samples the marked lower cheek on female/intermediate/male heads; full visual acceptance remains open.

### Cheekbone control (Preview 96)

The native Cheekbones target mainly changes transverse width. The visible human sculpt also needs a local projection control: `CharacterHeadMesh.positions` applies a smooth, bounded malar field below the eyelids, with a softer neutral ridge and signed projection/width changes from `shapes.cheekBones`. It is separate from `shapes.cheeks` fullness. Corrected-region normals follow the deformed surface; eyelid anchors and the outside seam are preserved. This runs in preview, expressions and saved geometry without editing generated `HeadMeshData.js`. The focused Cheekbones test checks forward projection on female, intermediate and male faces. Visual acceptance remains open.

### Slider release consistency

The older browser shaper omitted both the current head schema and the expression data that sets the resting mouth. It also stretched an old fitted head while release rebuilt its offsets and fittings. Shared human heads now use the same complete worker build during input and release; work remains off the page and obsolete recipes are coalesced. A busy generator can delay a preview update. The alternate shaper also receives the correct schema and rest units.

`nw-builder-controls.cjs --drag-release` uses real held mouse input, retains the last drag geometry, releases, and compares positions, normals, topology, recipe and camera with the rebuilt result. Use at most four selected controls per browser. For example:

```bash
/home/doug/.local/bin/codex-check node editor/tests/smoke/nw-builder-controls.cjs --recipe=editor/tests/smoke/fixtures/human-face-bald-recipe.json --tab=face --only=shapes.headWidth,shapes.noseWidth,shapes.chinWidth,morph.eyeWide --exact --drag-release --out=scratchpad/face-slider-review
```

`human-face-proportions.json` supplies four matching bald default views; `human-face-proportion-exports.json` saves both endpoints through the real Builder and checks both saved blinks through the game reader. The prior Preview 65 fixtures below remain useful for noses, ears and intermediate profiles.

### Rebuild the data

The current generator is independent of the older depth maps and scratch scripts. From the repository root:

```bash
/home/doug/.local/bin/codex-check node editor/tests/tools/face-proportions/build-head-driver.cjs scratchpad/face-driver.json
/home/doug/.local/bin/codex-check python3 editor/tests/tools/face-proportions/build_head.py scratchpad/Attractive-Models/woman_head.glb scratchpad/face-driver.json editor/src/forge/Character3D/HeadMeshData.js
```

Python needs NumPy and Pillow. The source is **Woman head** by zhuoyi0904, CC-BY 4.0; its embedded metadata and attribution are retained in the generated data and `THIRD_PARTY_NOTICES.md`. The original textures, hair and rig are not included. Both endpoints share triangles, feature anchors and twelve skin bindings per vertex. The generator preserves the eye/lip folds and authored normals, removes the closed oral cap and closes the opposing rims at rest, refines and fits the edge by radial intersections with native skin triangles, carries their exact UV charts, preserves native ears, and writes atomically with source/driver/generator hashes and an output checksum. A failed command must never be treated as a new candidate.

`build-head-driver.cjs` captures the native body with its mouth closed; the earlier face warp is inactive for this sculpt. Rebuild the driver after changing the native body's default proportions or its schema (Preview 65 adds ear weights and per-triangle UVs). The face keeps its own offsets while the native skin carries sliders and expressions. Separate folded lid surfaces carry the blink. Named blinks and visemes retain their physical range at every expression strength.

The nasal folds use bounded local hemispherical visibility rather than a near-black depth tint. The original continuous floor is retained; rejected open-passage experiments are not in the generator. `human-face-ears-nose.json` captures both default noses from below and bald profiles. Owner visual acceptance remains open.

`tests/smoke/nw-character-review.cjs` accepts `reset: true` per shot for an independent scene and waits for painting, the current live-worker recipe **and shading**. `expectClosedEyes: true` checks actual rendered skin coverage over both irises. `expectClosedMouth: true` checks the neutral slit for exposed teeth in the natural-skin fixtures. `exportModel: true` also uses the real Save command in the disposable project and reloads its PNG-bearing GLB with the game reader; `exportBlink: true` applies the exported blink morphs; `exportFrom` reuses a preceding saved model for another view. Run at most four captures per browser. `nw-builder-controls.cjs --only=... --exact` selects exact control paths; the default substring filter can include related fields.

## Repeat the Preview 65 review

Run from the repository root, sequentially. These are the exact bald recipe and two four-shot batches used in the follow-up. The second batch saves an intermediate character and reuses those bytes for the blink view. Use a new output directory for a new review; the latest recorded evidence remains in `scratchpad/face-ear-nose-20261031/`.

```bash
/home/doug/.local/bin/codex-check node editor/tests/smoke/nw-character-review.cjs --recipe=editor/tests/smoke/fixtures/human-face-bald-recipe.json --shots=editor/tests/smoke/fixtures/human-face-ears-nose.json --out=scratchpad/face-review-morning/core
/home/doug/.local/bin/codex-check node editor/tests/smoke/nw-character-review.cjs --recipe=editor/tests/smoke/fixtures/human-face-bald-recipe.json --shots=editor/tests/smoke/fixtures/human-face-ear-controls-exports.json --out=scratchpad/face-review-morning/ear-controls-exports
/home/doug/.local/bin/codex-check node --test --test-concurrency=1 editor/tests/character-shared-head.test.cjs editor/tests/character-3d-expressions.test.cjs
```

These checks supplement [the morning visual checklist](../../../../docs/HUMAN-FACE-HANDOFF.md#resume-in-the-morning). Normal-haired defaults, whole-face attractiveness and actual gameplay still need review.

## Earlier experiments (historical)

Scripts expect one scratch folder holding them and a `refs/` folder (`S` below); start from `scratchpad/Face-Experiment-4/working-files/`, which also has the depth maps. Run from `editor/`, with `D` the `scratchpad/Attractive-Models` folder.

- `final2.cjs`: `node $S/final2.cjs "$PWD" $S/grey.json` writes our shaped body to `refs/final_F.json` and `final_M.json` (with the head mesh off).
- `drape.py`: builds `src/forge/Character3D/FaceFieldData.js`. `fieldsmooth.py` eases that field's edge in place.
- `headmesh.py`: `python3 $S/headmesh.py $S src/forge/Character3D/HeadMeshData.js "$D"` builds the mask. Read its output: a crash leaves the old data.
- `outline.py`: from `ms3.cjs` output, prints the `FACE_OUTLINE` table for `HumanBody.js`.
- `lipm.py`: draws the mouth outline read from the surface, the source of the `LIP` table in `headmesh.py`.
- `raster.py` with `ms4.cjs`: bare reference and ours, one camera and one light.
- `swap.js`: shot script for `tests/smoke/nw-character-review.cjs` that puts a finished reference on our body. Placeholders: `__FILE__`, `__EYE__`, `__DW__`, `__E__`. The shot lists in the working files show its use.

`measure.py`, `solve.py`, `wrap.py`, `warp.py`, `face.py`, `response.cjs`, `our_heads.cjs` and `load_refs.py` are earlier attempts or their helpers: their ratios were unreliable, though `drape.py` and `headmesh.py` still read a few things from `wrap.py`.

Base heads, both CC-BY 4.0 from Sketchfab: "male head base" by alkalor (https://sketchfab.com/3d-models/male-head-base-3bcf954d4f6846d6b665b057c7c8d795) and "female elf head" by Scol3D (https://sketchfab.com/3d-models/female-elf-head-ff52160ba5184ea5968715c01c64d0f8). Keep the attribution in THIRD_PARTY_NOTICES.md.

The skin painter also needs the head schema and the resting-mouth expression units: its anatomical rest field must match the full model worker. The live builder must update the cached skin pixels together with `skinKey`. The color fixture checks rebuild/return behavior with a one-level byte tolerance.

### Preview 69 follow-up reproduction

Use `nw-character-review.cjs` with `fixtures/human-face-followup-recipe.json` and `fixtures/human-face-followup.json` for the inner-eye, female/male underside and intermediate front views. `fixtures/human-bust-shading-recipe.json` and `fixtures/human-bust-shading.json` explicitly enable anatomical detail for a separate clinical shading review at natural and extreme bust sizes. Keep each batch under `codex-check`; close one browser before starting another. Face endpoint and saved/blink fixtures above remain applicable.

`--reuse` verifies compatible completed samples reuse existing render buffers. The structure key is assigned after clearing the old model, so disposal cannot immediately invalidate it. `--smooth` additionally requires interpolated display frames; the settle check waits for the final tween. Geometry with different topology is never interpolated. Extreme `shapes.abs` retains the natural flat target and adds a cached rectus field with continuous paired columns, three sections and tendon separation, eased in only above 1. Restrained crease occlusion multiplies the skin equally across RGB and survives export. Bust smoothing excludes the defined muscles. Cached finite differences of the continuous relief field supply their normals, including in expressions and saved models. The original body topology stays intact.

Current retained evidence lives in `scratchpad/face-followup-20261101/`; diagnostics are labeled separately from final comparisons. Extreme bust contours still reveal the coarse source silhouette. The two exact chin spikes in the owner's screenshot have not been reproduced at the default recipe and remain open.

The lightweight body shaper sends the same gathered skin normals as complete builds, including bust smoothing and abdominal definition. Browser-worker parity covers both positions and normals, with a Grey body case as well as human endpoints.
