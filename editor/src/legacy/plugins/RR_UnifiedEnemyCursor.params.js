'use strict';
// Plugin parameters for RR_UnifiedEnemyCursor from the game's copy of the script (module BattleCursor) and the
// game's Font.default_size.

const C = require('../RgssConvert.js');
const { setting } = require('./RR_YanflySkillCost.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const script = sources.find(s => /\$imported\["Unified-Enemy-Cursor-AOE-Cone-Refactored"\]\s*=\s*true/.test(s)) || '';
    const at = script.search(/^\s*module BattleCursor\b/m);
    const source = at >= 0 ? script.slice(at, script.indexOf('\nend', at) + 4) : '';
    const get = (name, d) => { const v = setting(source, name, d); return String(typeof v === typeof d ? v : d); };
    const size = C.fontDefaults(sources, constants).size;
    return {
        filename: get('FILENAME', 'cursor'), offsetX: get('OFFSET_X', 0), offsetY: get('OFFSET_Y', 0), textOffset: get('TEXT_OFFSET', -50),
        bob: get('BOB', 0), slideSpeed: get('SLIDE_SPEED', 0.5), nameWidth: get('NAME_WIDTH', 200), nameHeight: get('NAME_HEIGHT', 64),
        coneUserOffsetX: get('CONE_USER_OFFSET_X', 0), coneUserOffsetY: get('CONE_USER_OFFSET_Y', 0),
        rgssFontSize: String(typeof size === 'number' ? size : 24)
    };
}

module.exports = { extract };
