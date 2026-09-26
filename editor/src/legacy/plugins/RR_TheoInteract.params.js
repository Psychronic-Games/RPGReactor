'use strict';
// Plugin parameters for RR_TheoInteract from the game's copy of TheoAllen's Interact Hover Notification (THEO::Interact).

const C = require('../RgssConvert.js');

function extract({ constants = {} } = {}) {
    const k = (name, d) => (constants['THEO::Interact::' + name] === undefined ? d : constants['THEO::Interact::' + name]);
    const names = k('FontName', []);
    const font = C.chooseFont(Array.isArray(names) ? names : [names], []);
    const size = Number(k('FontSize', 18)) || 18;
    return {
        defaultText: String(k('DefaultNotif', '...')), fadeSpeed: String(Number(k('FadeSpeed', 20))), displacement: String(Number(k('Displacement', 15))),
        width: String(Number(k('Width', 300))),
        fontFace: font && font.family ? [font.family, ...font.fallbacks].map(n => (/^[A-Za-z-]+$/.test(n) ? n : `"${n}"`)).concat(['sans-serif']).join(', ') : '',
        fontSize: String(font && font.family ? Math.round(size * font.scale * 10) / 10 : 0),
        lineHeight: String(size), bold: String(k('FontBold', true) === true), italic: String(k('FontItalic', false) === true)
    };
}

module.exports = { extract };
