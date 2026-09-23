'use strict';
// Plugin parameters for RR_TheoChoices from the game's copy of Napoleon's Window ChoiceList Enhanced
// (Window_ChoiceList LOCATION / OFFSET_X / OFFSET_Y / Z_INDEX / AUTO_RESET). VX style choices has no settings.

const DEFAULTS = { location: 'default', offsetX: 0, offsetY: 0, zIndex: 320, autoReset: true };
const LOCATIONS = ['default', 'center', 'top_left', 'top_center', 'top_right', 'center_left', 'center_right', 'left_center', 'right_center',
    'msg_left', 'msg_center', 'msg_right', 'bot_left', 'bot_center', 'bot_right'];

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /\$choicelist_options/.test(s) && /\bLOCATION\s*=/.test(s)) || '';
    const scoped = (name) => constants['Window_ChoiceList::' + name];
    const find = (name, pattern) => { const m = new RegExp('^\\s*' + name + '\\s*=\\s*' + pattern, 'm').exec(source); return m ? m[1] : undefined; };

    let location = find('LOCATION', ':(\\w+)');
    if (!LOCATIONS.includes(location)) location = DEFAULTS.location;
    const num = (name, fallback) => {
        const v = find(name, '(-?\\d+)');
        if (v !== undefined) return parseInt(v, 10);
        return typeof scoped(name) === 'number' ? scoped(name) : fallback;
    };
    const reset = find('AUTO_RESET', '(true|false)\\b');
    const autoReset = reset !== undefined ? reset === 'true' : typeof scoped('AUTO_RESET') === 'boolean' ? scoped('AUTO_RESET') : DEFAULTS.autoReset;

    return {
        location,
        offsetX: String(num('OFFSET_X', DEFAULTS.offsetX)),
        offsetY: String(num('OFFSET_Y', DEFAULTS.offsetY)),
        zIndex: String(num('Z_INDEX', DEFAULTS.zIndex)),
        autoReset: String(autoReset)
    };
}

module.exports = { extract, DEFAULTS };
