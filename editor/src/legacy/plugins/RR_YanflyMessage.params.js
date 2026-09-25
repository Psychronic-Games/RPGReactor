'use strict';
// Plugin parameters for RR_YanflyMessage from the game's copy of Yanfly's Ace Message System (YEA::MESSAGE).
// The message font carries over when it is a Windows font every player had; a shipped font file would
// need loading of its own, so the game's font is used then.

const C = require('../RgssConvert.js');

function extract({ constants = {} } = {}) {
    const k = (name, d) => (Object.prototype.hasOwnProperty.call(constants, 'YEA::MESSAGE::' + name) ? constants['YEA::MESSAGE::' + name] : d);
    const names = k('MESSAGE_WINDOW_FONT_NAME', []);
    const font = C.chooseFont(Array.isArray(names) ? names : [names], []);
    const size = Number(k('MESSAGE_WINDOW_FONT_SIZE', 0)) || 0;
    const system = font && font.family;
    return {
        rowsVariable: String(Number(k('VARIABLE_ROWS', 0)) || 0),
        widthVariable: String(Number(k('VARIABLE_WIDTH', 0)) || 0),
        faceIndent: String(Number(k('FACE_INDENT_X', 112))),
        fontFace: system ? [font.family, ...font.fallbacks].map(n => (/^[A-Za-z-]+$/.test(n) ? n : `"${n}"`)).concat(['sans-serif']).join(', ') : '',
        fontSize: String(system && size ? Math.round(size * font.scale * 10) / 10 : 0),
        bold: String(k('MESSAGE_WINDOW_FONT_BOLD', false) === true),
        italic: String(k('MESSAGE_WINDOW_FONT_ITALIC', false) === true)
    };
}

module.exports = { extract };
