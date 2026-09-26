'use strict';
// Plugin parameters for RR_YanflyAdjustLimits from the game's copy of Yanfly's Ace Adjust Limits (YEA::LIMIT).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const k = (name, d) => (constants['YEA::LIMIT::' + name] === undefined ? d : constants['YEA::LIMIT::' + name]);
    const size = /Font\.default_size\s*=\s*(\d+)/.exec(scripts.map(text).join('\n'));
    const core = constants['YEA::CORE::FONT_SIZE'];
    return {
        goldMax: String(Number(k('GOLD_MAX', 99999999))), goldIcon: String(Number(k('GOLD_ICON', 0)) || 0), goldFont: String(Number(k('GOLD_FONT', 0)) || 0),
        tooMuchGold: String(k('TOO_MUCH_GOLD', 'MAX!')), itemMax: String(Number(k('ITEM_MAX', 99))), itemFont: String(Number(k('ITEM_FONT', 0)) || 0),
        itemPrefix: String(k('ITEM_PREFIX', '×%s')), levelMax: String(Number(k('LEVEL_MAX', 99))),
        mhpMax: String(Number(k('MAXHP_MAX', 9999))), mmpMax: String(Number(k('MAXMP_MAX', 9999))), paramMax: String(Number(k('PARAM_MAX', 999))),
        defaultFontSize: String(Number(core) || (size ? Number(size[1]) : 24))
    };
}

module.exports = { extract };
