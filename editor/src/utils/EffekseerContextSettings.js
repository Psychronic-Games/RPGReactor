/**
 * EffekseerContextSettings - what every Effekseer context the editor creates
 * for an animation preview is initialized with, matching the runtime's
 * `Graphics.effekseerContextSettings` (runtime/reactor_core.js).
 *
 * Effekseer keeps a fixed pool of particle instances per context (its own
 * default is 4000) and silently skips a new particle when the pool is full,
 * so the layers that spawn first keep everything and later ones lose
 * particles. A preview with a smaller pool than the game would show a
 * different effect. Each instance reserves about 5 KB of Effekseer's heap.
 */
(function(root) {
    'use strict';

    const EffekseerContextSettings = { instanceMaxCount: 16000, squareMaxCount: 40000 };

    root.RREffekseerContextSettings = EffekseerContextSettings;
    if (typeof module !== 'undefined' && module.exports) module.exports = EffekseerContextSettings;
})(typeof globalThis !== 'undefined' ? globalThis : window);
