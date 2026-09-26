'use strict';
// Plugin parameters for RR_YanflyAreaOfEffect from the game's copy of Yanfly's Area of Effect (YEA::AOE).

const { setting } = require('./RR_YanflySkillCost.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["YEA-AreaofEffect"\]\s*=\s*true/.test(s)) || '';
    const get = (name, d) => { const v = setting(source, name, d); return String(typeof v === typeof d ? v : d); };
    return {
        circleImage: get('DEFAULT_CIRCLE', 'circle'), circleBlend: get('CIRCULAR_BLEND', 1), defaultHeight: get('DEFAULT_HEIGHT', 0.33),
        enemyOffsetX: get('DEFAULT_ENEMY_OFFSET_X', 0), enemyOffsetY: get('DEFAULT_ENEMY_OFFSET_Y', -8),
        squareImage: get('DEFAULT_SQUARE', 'square'), squareBlend: get('SQUARISH_BLEND', 1)
    };
}

module.exports = { extract };
