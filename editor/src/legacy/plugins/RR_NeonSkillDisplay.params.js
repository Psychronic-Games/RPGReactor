'use strict';
// Plugin parameters for RR_NeonSkillDisplay from the game's copy of Neon Black's Skill Display (the constants
// it puts in Window_BattleLog).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** NAME = <literal> at the start of a line (undefined when absent or unreadable). */
function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["CP-SkillDisplay"\]\s*=\s*true/.test(s)) || '';
    const get = (name, d) => { const v = literal(source, name); return v === undefined ? d : v; };
    // nil turns a line off ("null"); a string is shown, an empty one as nothing.
    const word = (name, d) => { const v = get(name, d); return v === null ? 'null' : String(v); };
    const colour = /^[ \t]*BACK_COLOR\s*=\s*Color\.new\(([^)]*)\)/m.exec(source);
    const back = colour ? colour[1].split(',').map(n => Number(n.trim())) : [0, 0, 0, 255];
    if (back.length === 3) back.push(255);
    return {
        counterText: word('COUNTER', 'Counter-Attack!'),
        reflectText: word('REFLECT', 'Reflect'),
        substituteText: word('SUB', 'Protect'),
        offsetX: String(Number(get('X_OFFSET', 0)) || 0),
        offsetY: String(Number(get('Y_OFFSET', 0)) || 0),
        backColor: JSON.stringify(back),
        backPicture: String(get('BACK_PIC', '') ?? ''),
        actionSpeed: String(Number(get('ACTION_SPEED', 0)) || 0)
    };
}

module.exports = { extract };
