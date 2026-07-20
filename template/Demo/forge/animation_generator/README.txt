Animation Generator
===================

Forge tool that bakes procedural animation sprite sheets for use
in the engine animation system. Sheets are 5 columns × N rows of
192x192 frames (max 100 frames per sheet — engine constraint).

Animations are stacked as LAYERS (Photoshop-style). Each layer is
one animation type with its own params, blend mode, and opacity.
Mix and match for combinations like "lightning hypercube" or
"water explosion".

Output is saved to img/animations/<name>.png.

config.json stores frame size, frame count, and the layer stack.

textures/ holds media files used by shape animations (Cube, Pyramid,
Cylinder, etc.) as wrap-around textures. Drop images, animated GIFs,
WebP files, or videos in there and pick them via the Texture parameter.
