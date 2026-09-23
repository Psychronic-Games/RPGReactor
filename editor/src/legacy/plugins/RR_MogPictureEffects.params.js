'use strict';
/**
 * RR_MogPictureEffects parameters from the game's own copy of MOG Picture
 * Effects: DEFAULT_SCREEN_Z in its settings module (spelt MOG_PICURE_EFFECTS
 * in the original). Values are strings, as MZ stores plugin parameters.
 */
const DEFAULTS = { screenZ: '100' };

function sources(scripts) {
    const list = Array.isArray(scripts) ? scripts : [scripts];
    return list.map(s => (typeof s === 'string' ? s : s && (s.text || s.source || s.code || s.body) || '')).filter(Boolean);
}

function integerIn(text, name) {
    const m = new RegExp('^[ \\t]*' + name + '[ \\t]*=[ \\t]*(-?\\d+)\\b', 'm').exec(text || '');
    return m ? Number(m[1]) : undefined;
}

function extract({ scripts = [], constants = {} } = {}) {
    const out = Object.assign({}, DEFAULTS);
    const script = sources(scripts).find(t => /module\s+MOG_PIC(?:T)?URE_EFFECTS\b|MOG\s*-\s*Picture Effects|def picture_effect\b/i.test(t));
    let z;
    if (script) {
        const module = /^[ \t]*module\s+MOG_PIC(?:T)?URE_EFFECTS\b([\s\S]*?)^[ \t]*end\b/m.exec(script);
        z = integerIn(module ? module[1] : script, 'DEFAULT_SCREEN_Z');
    }
    if (z === undefined) {
        for (const key of ['MOG_PICURE_EFFECTS::DEFAULT_SCREEN_Z', 'MOG_PICTURE_EFFECTS::DEFAULT_SCREEN_Z', 'DEFAULT_SCREEN_Z']) {
            if (constants && typeof constants[key] === 'number') { z = constants[key]; break; }
        }
    }
    if (Number.isFinite(z)) out.screenZ = String(z);
    return out;
}

module.exports = { extract, DEFAULTS };
