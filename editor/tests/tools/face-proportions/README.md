# Face tools

Builds the human face data and compares it with the reference heads. State, findings and open faults are in [docs/HUMAN-FACE-HANDOFF.md](../../../../docs/HUMAN-FACE-HANDOFF.md).

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
