# Face tools

Builds the human face data and compares it with the reference heads. State, findings and open faults are in [docs/HUMAN-FACE-HANDOFF.md](../../../../docs/HUMAN-FACE-HANDOFF.md).

## Shared sculpt (Preview 65)

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
