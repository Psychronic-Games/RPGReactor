'use strict';
// Plugin parameters for RR_DocumentReader from the game's copy of the Document Reader script (module DocumentReader).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /module DocumentReader\b/.test(s) && /class Scene_DocumentReader/.test(s)) || '';
    const k = (name, d) => (constants['DocumentReader::' + name] === undefined ? d : constants['DocumentReader::' + name]);
    const num = (name, d) => { const v = Number(k(name, d)); return Number.isFinite(v) ? v : d; };
    // Icon ids are constants of the module; the lines name them.
    const icons = {};
    for (const m of source.matchAll(/^\s*(ICON_\w+)\s*=\s*(\d+)/gm)) icons[m[1]] = Number(m[2]);
    let lines = [];
    const at = /^\s*HUD_LINES\s*=\s*/m.exec(source);
    if (at) {
        const body = source.slice(at.index + at[0].length).replace(/\b(ICON_\w+)\b/g, (n) => String(icons[n] ?? 0));
        try { lines = readLiteral(body, 0)[0]; } catch (_) { lines = []; }
    }
    return {
        settings: JSON.stringify({
            moveSpeed: num('MOVE_SPEED', 8), zoomStep: num('ZOOM_STEP', 0.1), minZoom: num('MIN_ZOOM', 0.5), maxZoom: num('MAX_ZOOM', 3),
            slideFrames: num('SLIDE_FRAMES', 14), blurPasses: k('BACKGROUND_MODE', ':map_blur') === ':none' ? 0 : num('MAP_BLUR_PASSES', 2),
            dimOpacity: num('MAP_DIM_OPACITY', 120), hud: k('HUD_ENABLED', true) !== false, hudWidth: num('HUD_WIDTH', 560),
            hudHeight: num('HUD_HEIGHT', 60), hudY: num('HUD_Y_OFFSET', 18), hudBackOpacity: num('HUD_BACK_OPACITY', 160),
            hudIdleFrames: num('HUD_IDLE_FADE_FRAMES', 180), hudFadeStep: num('HUD_FADE_STEP', 6), hudMinAlpha: num('HUD_MIN_ALPHA', 0),
            hudLines: Array.isArray(lines) ? lines : []
        })
    };
}

module.exports = { extract };
