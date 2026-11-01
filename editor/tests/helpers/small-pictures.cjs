'use strict';
// Preloaded by `npm test` and tests/run-tier.cjs. Most tests judge geometry, skinning and coordinates, yet a default
// build paints production pictures (a 2048 outfit atlas, 1024 skin and shoes, 1024 prop surfaces): most of the suite's
// time and memory, for pixels nothing reads. These are the defaults under test. An explicit size in a call still wins,
// and a file that judges pixels puts `delete globalThis.RR_DEFAULT_PICTURES;` at its top.
globalThis.RR_DEFAULT_PICTURES = { atlas: 256, picture: 256, skin: 64, prop: 512 };
