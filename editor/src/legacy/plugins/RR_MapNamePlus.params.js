'use strict';
// Plugin parameters for RR_MapNamePlus from the game's copy of MapName Plus+ (ACE::MAPNAME).

const C = require('../RgssConvert.js');

function extract({ constants = {} } = {}) {
    const k = (name, d) => (constants['ACE::MAPNAME::' + name] === undefined ? d : constants['ACE::MAPNAME::' + name]);
    const font = C.chooseFont([k('FONT_TYPE', '')].flat(), []);
    const size = Number(k('FONT_SIZE', 0)) || 0;
    return {
        align: ['left', 'center', 'right'][Number(k('NAME_ALIGN', 1))] || 'center',
        fontFace: font && font.family ? [font.family, ...font.fallbacks].map(n => (/^[A-Za-z-]+$/.test(n) ? n : `"${n}"`)).concat(['sans-serif']).join(', ') : '',
        fontSize: String(font && font.family && size ? Math.round(size * font.scale * 10) / 10 : 0)
    };
}

module.exports = { extract };
