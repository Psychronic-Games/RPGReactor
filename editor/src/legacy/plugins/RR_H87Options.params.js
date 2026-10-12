'use strict';
// Plugin parameters for RR_H87Options from the game's copy of Holy87's Options (H87Options::ELEMENTS and its
// words, the menu command's text) and the settings file the game shipped (H87 Universal Module's
// game_settings.rvdata2, which every save shares).

const path = require('path');
const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const plain = (v) => (v instanceof Map ? Object.fromEntries(Array.from(v, ([k, x]) => [k, plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

/** NAME = <literal> inside the text, or undefined. */
function constant(text, name) {
    const m = new RegExp(`^[ \\t]*${name}\\s*=\\s*`, 'm').exec(text);
    if (!m) return undefined;
    try { return readLiteral(text, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

function extract({ scripts = [], read } = {}) {
    const out = {};
    const text = scripts.find(s => /module H87Options\b[\s\S]*ELEMENTS\s*=\s*\[/.test(s));
    if (text) {
        const elements = constant(text, 'ELEMENTS');
        if (Array.isArray(elements)) out.elements = JSON.stringify(plain(elements));
        for (const [name, key] of [['OPTION_COMMAND', 'command'], ['OFF_BAR', 'offBar'], ['TOGGLE_SOUND', 'toggleSound']]) {
            const v = constant(text, name);
            if (typeof v === 'string') out[key] = v;
        }
        for (const [name, key] of [['SHOW_ON_TITLE', 'showOnTitle'], ['SHOW_ON_MENU', 'showOnMenu']]) {
            const v = constant(text, name);
            if (typeof v === 'boolean') out[key] = String(v);
        }
        const menu = /def add_original_commands[\s\S]*?add_command\("([^"]*)",\s*:options/.exec(text);
        if (menu) out.menuCommand = menu[1];
    }
    // The settings the game shipped are where a first run starts.
    const module = scripts.map(s => /SETTINGNAME\s*=\s*"([^"]+)"/.exec(s)).find(Boolean);
    const bytes = read ? read(module ? module[1] : 'game_settings.rvdata2') : null;
    if (bytes) {
        try {
            const data = require(path.join(__dirname, '..', 'RubyMarshal.js')).load(bytes);
            const settings = data && (data.settings || data['@settings']);
            const values = settings instanceof Map ? Object.fromEntries(settings) : settings;
            if (values && typeof values === 'object') out.defaults = JSON.stringify(values);
        } catch (_) { /* unreadable: the options' own defaults */ }
    }
    return out;
}

module.exports = { extract };
