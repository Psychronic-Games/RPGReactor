// Psychronic Outfit Forge style adapter.
// Psychronic uses the shared outfit config, palette, and layer system with
// its own anatomy, classifiers, painters, masks, and extensions.

'use strict';

module.exports = function createPsychronicAdapter(ctx) {
    return {
        painters: ctx.PSYCHRONIC_PAINTERS,
        extensions: ctx.PSYCHRONIC_EXTENSIONS,
        analyze: ctx.analyzeFramePsychronic,
        classify: ctx.classifyPixelPsychronic,
        face: ctx.psychronicFaceBand
    };
};
