'use strict';
// Plugin parameters for RR_ThrallMenu from the game's copies of Scene Menu ReDux (YE::REDUX::MENU), Simple Sort
// Inventory (COZZIEKUNS::SSI), KGC Overdrive's gauge size, and the locker its Data/Validation.rvdata shipped with.
const path = require('path');
const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

/** NAME = <literal> in the script that defines `module`, or undefined. */
function literal(scripts, moduleRe, name) {
    const text = scripts.find(s => moduleRe.test(s));
    if (!text) return undefined;
    const m = new RegExp(`^\\s*${name}\\s*=\\s*`, 'm').exec(text);
    if (!m) return undefined;
    try { return readLiteral(text, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}
const plain = (value) => (value instanceof Map ? Object.fromEntries(Array.from(value, ([k, v]) => [k, plain(v)])) : Array.isArray(value) ? value.map(plain) : value);

/** A VX weapon or armour record as the locker keeps it: its own fields, the class marker dropped. */
function record(r) {
    if (!r || typeof r !== 'object' || !/^RPG::(Weapon|Armor)$/.test(r.__class || '')) return null;
    const out = {};
    for (const [k, v] of Object.entries(r)) if (k !== '__class' && k !== 'id') out[k] = Array.isArray(v) ? v.slice() : v;
    return out;
}

function extract({ scripts = [], constants = {}, read } = {}) {
    const out = {};
    const redux = /module REDUX\b[\s\S]*module MENU\b/;
    const commands = literal(scripts, redux, 'MENU_COMMANDS');
    if (Array.isArray(commands)) out.menuCommands = JSON.stringify(commands);
    const icons = literal(scripts, redux, 'ICON_SETS');
    if (icons instanceof Map) out.iconSets = JSON.stringify(plain(icons));
    const k = (name) => constants['YE::REDUX::MENU::' + name];
    if (typeof k('START_INDEX') === 'number') out.startIndex = String(k('START_INDEX'));
    if (typeof k('EXP_GAUGE_1') === 'number') out.expGauge1 = String(k('EXP_GAUGE_1'));
    if (typeof k('EXP_GAUGE_2') === 'number') out.expGauge2 = String(k('EXP_GAUGE_2'));
    if (typeof k('PERCENT_EXP') === 'string') out.percentExp = k('PERCENT_EXP');
    if (typeof constants['KGC::OverDrive::GAUGE_MAX'] === 'number') out.odGaugeMax = String(constants['KGC::OverDrive::GAUGE_MAX']);
    const ssi = /module SSI\b[\s\S]*MOD_ALG_ITEM_CATEGORIES/;
    const categories = literal(scripts, ssi, 'MOD_ALG_ITEM_CATEGORIES');
    if (categories instanceof Map) out.categories = JSON.stringify(plain(categories));
    if (typeof constants['COZZIEKUNS::SSI::MOD_ALG_ITEM_CATEGORY_WIDTH'] === 'number') out.categoryWidth = String(constants['COZZIEKUNS::SSI::MOD_ALG_ITEM_CATEGORY_WIDTH']);
    if (typeof constants['COZZIEKUNS::SSI::CATEGORY_TEXT'] === 'string') out.categoryText = constants['COZZIEKUNS::SSI::CATEGORY_TEXT'];
    // Validation.rvdata: [four time stamps, weapons 524-526, armour 488-490].
    const bytes = read ? read('Data/Validation.rvdata') : null;
    if (bytes) {
        try {
            const valid = require(path.join(__dirname, '..', 'RubyMarshal.js')).load(bytes);
            if (Array.isArray(valid)) out.locker = JSON.stringify({ weapons: [4, 5, 6].map(i => record(valid[i])), armors: [7, 8, 9].map(i => record(valid[i])) });
        } catch (_) { /* no locker */ }
    }
    return out;
}

module.exports = { extract };
