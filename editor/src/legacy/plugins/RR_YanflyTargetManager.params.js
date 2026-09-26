'use strict';
// Plugin parameters for RR_YanflyTargetManager from the game's copy of Yanfly's Target Manager (YEA::TARGET).

const { setting } = require('./RR_YanflySkillCost.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const DETECT = /\$imported\["YEA-TargetManager"\]\s*=\s*true/;

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => DETECT.test(s)) || '';
    return { randomRedirect: String(setting(source, 'RANDOM_REDIRECT', true) !== false) };
}

module.exports = { extract };
