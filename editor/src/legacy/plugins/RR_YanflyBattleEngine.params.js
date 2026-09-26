'use strict';
// Plugin parameters for RR_YanflyBattleEngine from the game's copy of Yanfly's Ace Battle Engine (module
// YEA::BATTLE): the general switches, the status window, help texts, popup settings and rules, the log
// switches, and the game's Font.default_size.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)])) : Array.isArray(v) ? v.map(plain) : v);
const truth = (v) => v !== false && v !== null && v !== undefined;

function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

const MESSAGES = {
    enemyAppears: 'MSG_ENEMY_APPEARS', currentState: 'MSG_CURRENT_STATE', currentAction: 'MSG_CURRENT_ACTION',
    counterattack: 'MSG_COUNTERATTACK', reflectMagic: 'MSG_REFLECT_MAGIC', substituteHit: 'MSG_SUBSTITUTE_HIT',
    failureHit: 'MSG_FAILURE_HIT', criticalHit: 'MSG_CRITICAL_HIT', hitMissed: 'MSG_HIT_MISSED', evasion: 'MSG_EVASION',
    hpDamage: 'MSG_HP_DAMAGE', mpDamage: 'MSG_MP_DAMAGE', tpDamage: 'MSG_TP_DAMAGE', addedStates: 'MSG_ADDED_STATES',
    removedStates: 'MSG_REMOVED_STATES', changedBuffs: 'MSG_CHANGED_BUFFS'
};
const HELP = {
    allFoes: 'HELP_TEXT_ALL_FOES', oneRandomFoe: 'HELP_TEXT_ONE_RANDOM_FOE', manyRandomFoes: 'HELP_TEXT_MANY_RANDOM_FOE',
    allAllies: 'HELP_TEXT_ALL_ALLIES', allDeadAllies: 'HELP_TEXT_ALL_DEAD_ALLIES', oneRandomAlly: 'HELP_TEXT_ONE_RANDOM_ALLY',
    randomAllies: 'HELP_TEXT_RANDOM_ALLIES'
};

/** POPUP_RULES: "NAME" => [zoom1, zoom2, size, bold, italic, red, green, blue, font], the font a constant or an array. */
function popupRules(source, constants) {
    const block = /POPUP_RULES\s*=\s*\{([\s\S]*?)\n\s*\}/.exec(source);
    const rules = {};
    if (!block) return rules;
    for (const line of block[1].split('\n')) {
        const m = /^\s*"([^"]+)"\s*=>\s*\[(.*)\]\s*,?\s*(#.*)?$/.exec(line);
        if (!m) continue;
        const values = m[2].split(',', 8).map(s => s.trim());
        if (values.length < 8) continue;
        const tail = m[2].split(',').slice(8).join(',').trim();
        let font = ['Arial'];
        if (tail.startsWith('[') || tail.startsWith('"')) {
            try { font = readLiteral(tail, 0)[0]; } catch (_) { font = ['Arial']; }
        } else if (tail) {
            const v = constants['YEA::BATTLE::' + tail] ?? constants[tail];
            if (Array.isArray(v)) font = v; else if (typeof v === 'string') font = [v];
        }
        const n = (s) => Number(s);
        rules[m[1]] = [n(values[0]), n(values[1]), n(values[2]), values[3] === 'true', values[4] === 'true', n(values[5]), n(values[6]), n(values[7]), [].concat(font).map(String)];
    }
    return rules;
}

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\["YEA-BattleEngine"\]\s*=\s*true/.test(s)) || '';
    const k = (name, d) => { const v = constants['YEA::BATTLE::' + name]; return v === undefined || v === null ? d : v; };
    const system = /^[ \t]*DEFAULT_BATTLE_SYSTEM\s*=\s*:(\w+)/m.exec(source);
    // Font.default_size = 18, or = SOME::CONSTANT; RGSS3's own default is 24.
    let fontSize = 24;
    for (const s of sources) {
        const m = /^[ \t]*Font\.default_size\s*=\s*([\w:]+)/m.exec(s);
        if (!m) continue;
        const v = /^\d+$/.test(m[1]) ? Number(m[1]) : constants[m[1]];
        if (typeof v === 'number' && v > 0) fontSize = v;
    }
    const settings = literal(source, 'POPUP_SETTINGS');
    return {
        blink: String(truth(k('BLINK_EFFECTS', true))),
        flashWhite: String(truth(k('FLASH_WHITE_EFFECT', true))),
        screenShake: String(truth(k('SCREEN_SHAKE', false))),
        skipPartyCommand: String(truth(k('SKIP_PARTY_COMMAND', true))),
        autoFast: String(truth(k('AUTO_FAST', true))),
        enemyAttackAnimation: String(Number(k('ENEMY_ATK_ANI', 0)) || 0),
        hidePopupSwitch: String(Number(k('HIDE_POPUP_SWITCH', 0)) || 0),
        battleSystem: system ? system[1] : 'dtb',
        nameFontSize: String(Number(k('BATTLESTATUS_NAME_FONT_SIZE', 20)) || 20),
        textFontSize: String(Number(k('BATTLESTATUS_TEXT_FONT_SIZE', 16)) || 16),
        noActionIcon: String(Number(k('BATTLESTATUS_NO_ACTION_ICON', 185)) || 0),
        hpGaugeYPlus: String(Number(k('BATTLESTATUS_HPGAUGE_Y_PLUS', 11)) || 0),
        centerFaces: String(truth(k('BATTLESTATUS_CENTER_FACES', false))),
        helpTexts: JSON.stringify(Object.fromEntries(Object.entries(HELP).map(([key, name]) => [key, String(k(name, ''))]).filter(([, v]) => v !== ''))),
        enablePopups: String(truth(k('ENABLE_POPUPS', true))),
        flashCritical: String(truth(k('FLASH_CRITICAL', true))),
        popupSettings: settings instanceof Map ? JSON.stringify(plain(settings)) : '',
        popupRules: JSON.stringify(popupRules(source, constants)),
        messages: JSON.stringify(Object.fromEntries(Object.entries(MESSAGES).map(([key, name]) => [key, truth(k(name, true))]))),
        rgssFontSize: String(fontSize)
    };
}

module.exports = { extract, popupRules };
