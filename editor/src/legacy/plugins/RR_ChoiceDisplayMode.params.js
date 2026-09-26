'use strict';
// Plugin parameters for RR_ChoiceDisplayMode from the game's copy of HMS: Choice Display Mode (TH::Choice_Display_Mode)
// and whether its scroll patch (three visible rows) was in the game.

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const main = sources.find(s => /TH_HMSChoiceDisplayMode/.test(s)) || '';
    // The script's initialize sets the mode itself; the Default_Mode constant is what it would read.
    const init = /@choice_display_mode\s*=\s*:(\w+)/.exec(main);
    const mode = init ? init[1] : String(constants['TH::Choice_Display_Mode::Default_Mode'] || 'embed').replace(/^:/, '');
    const patch = sources.some(s => /final_fix_update_placement/.test(s) && /fitting_height\((\d+)\)/.test(s));
    const rows = patch ? Number(/fitting_height\((\d+)\)/.exec(sources.find(s => /final_fix_update_placement/.test(s)))[1]) : 0;
    return { mode: mode === 'default' ? 'default' : 'embed', indent: String(Number(constants['TH::Choice_Display_Mode::Indent'] ?? 36)), rows: String(rows) };
}

module.exports = { extract };
