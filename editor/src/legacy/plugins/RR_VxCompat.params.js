'use strict';
// Plugin parameters for RR_VxCompat from the game's scripts: the default font size rrVxFontSize measures from
// (the first Font.default_size the scripts set; a game that switches fonts later sets its default first) and
// whether text keeps VX's drop shadow (Font.default_shadow = false turns it off).

function extract({ scripts = [] } = {}) {
    const out = {};
    const all = (name) => scripts.flatMap(s => Array.from(String(s || '').matchAll(new RegExp(`^\\s*Font\\.default_${name}\\s*=\\s*(\\S+)`, 'gm')), m => m[1]));
    const size = all('size').map(Number).find(n => n > 0);
    if (size) out.fontSize = String(size);
    const shadow = all('shadow');
    if (shadow.length) out.textShadow = shadow[shadow.length - 1] === 'false' ? 'false' : 'true';
    return out;
}

module.exports = { extract };
