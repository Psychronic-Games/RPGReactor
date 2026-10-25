# Body data

`human.json`, `human.bin` and `eye-brown.png` are converted from MakeHuman's base mesh (hm08), shape targets, default skeleton and weights, and high-poly eyes, by `editor/build-scripts/build-human-pack.cjs`.

Source: https://github.com/makehumancommunity/makehuman (`makehuman/data`). These assets were released by their copyright holders under CC0 1.0 Universal in September 2020 (`LICENSE.ASSETS.md` in that repository): no rights reserved, no attribution required. Original copyright (C) 2014 Manuel Bastioni; (C) 2020 Data Collection AB, Joel Palmius, Jonas Hauquier.

`expressions.json` and `expressions.bin` (the face's expression units) are converted from MakeHuman's expression unit targets (`targets/expression/units`, one set per ancestry) by `editor/build-scripts/build-expression-pack.cjs`, from the same repository and under the same CC0 1.0 release.

# Motion data

The builder's poses and motions are the runtime's shared motion library: its data and credit are in `runtime/reactor_3d_motions.LICENSE.md`.
