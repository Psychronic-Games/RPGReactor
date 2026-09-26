'use strict';
// Plugin parameters for RR_MouseEnemySelect from the game's copy of the patch (Mouse::Selection).

const { setting } = require('./RR_YanflySkillCost.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /def enemySelectionSetup\b/.test(s)) || '';
    const get = (name, d) => { const v = setting(source, name, d); return String(typeof v === 'number' ? v : d); };
    return { offsetX: get('DEFAULT_ENEMY_OFFSET_X', 0), offsetY: get('DEFAULT_ENEMY_OFFSET_Y', -8) };
}

module.exports = { extract };
