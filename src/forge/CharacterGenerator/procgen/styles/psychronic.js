// Psychronic Outfit Forge style adapter.
// Psychronic uses the shared outfit config/palette/layer system, but its body
// proportions and armour shapes differ from Looseleaf.

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
