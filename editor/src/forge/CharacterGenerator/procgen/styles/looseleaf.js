// Looseleaf Outfit Forge style adapter.
// Receives the shared engine context so the public engine can keep one stable
// generation pipeline while style-specific anatomy/painters live behind an
// adapter seam.

'use strict';

module.exports = function createLooseleafAdapter(ctx) {
    return {
        painters: ctx.PAINTERS,
        extensions: ctx.EXTENSIONS,
        analyze: ctx.analyzeFrame,
        classify: ctx.classifyPixel,
        face: ctx.faceBand
    };
};
