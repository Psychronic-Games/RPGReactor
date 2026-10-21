'use strict';
// Plugin parameters for RR_YanflyMessage from the game's copy of Yanfly's Ace Message System (YEA::MESSAGE).
// The message font carries over when it is a Windows font every player had; a shipped font file would
// need loading of its own, so the game's font is used then. Font.default_name (the game's own font) keeps
// the size, scaled as the import scales the game's font.

const C = require('../RgssConvert.js');

/** The em scale of the font the game's scripts made the default (as the importer sizes it), or null. */
function defaultFontScale(scripts, constants, read, list) {
    const names = C.fontDefaults(scripts, constants).name;
    const files = (list('Fonts') || []).filter(f => /\.(ttf|otf|woff2?)$/i.test(f));
    const chosen = C.chooseFont(names || ['VL Gothic'], files) || C.chooseFont(['VL Gothic'], files);
    if (chosen && chosen.family) return chosen.scale;
    const bytes = chosen && chosen.file ? read('Fonts/' + chosen.file) : null;
    return (bytes && C.rgssFontScale(bytes)) || 0.787;
}

function extract({ scripts = [], constants = {}, read = () => null, list = () => [] } = {}) {
    const has = (name) => Object.prototype.hasOwnProperty.call(constants, 'YEA::MESSAGE::' + name);
    const k = (name, d) => (has(name) ? constants['YEA::MESSAGE::' + name] : d);
    const text = scripts.find(s => /\$imported\["YEA-MessageSystem"\]\s*=\s*true/.test(s)) || '';
    const names = k('MESSAGE_WINDOW_FONT_NAME', []);
    const font = C.chooseFont(Array.isArray(names) ? names : [names], []);
    const size = Number(k('MESSAGE_WINDOW_FONT_SIZE', 0)) || 0;
    const system = font && font.family;
    // MESSAGE_WINDOW_FONT_NAME = Font.default_name: the game's font, its size scaled the same way.
    const ownFont = !system && /MESSAGE_WINDOW_FONT_NAME\s*=\s*Font\.default_name/.test(text);
    let fontSize = 0;
    if (system && size) fontSize = Math.round(size * font.scale * 10) / 10;
    else if (ownFont && size) fontSize = Math.round(size * defaultFontScale(scripts, constants, read, list) * 10) / 10;
    // Variable.message_rows: the rows when the variable is 0 (4), and values that mean the same (a game's edit).
    const rowsBody = (/def self\.message_rows\b([\s\S]*?)\n\s*end\b/.exec(text) || [, ''])[1];
    const defaultRows = Number((/return\s+(\d+)\s+if\s+YEA::MESSAGE::VARIABLE_ROWS\s*<=\s*0/.exec(rowsBody) || [, 4])[1]);
    const alsoDefault = [...rowsBody.matchAll(/return\s+\d+\s+if\s+\$game_variables\[YEA::MESSAGE::VARIABLE_ROWS\]\s*==\s*(\d+)/g)].map(m => m[1]);
    const continueAbove = Number((/next_event_code\s*==\s*101\s*&&\s*Variable\.message_rows\s*>\s*(\d+)/.exec(text) || [, 4])[1]);
    // The name window: Yanfly's adds the X buffer on the left and takes it off on the right; a game may keep it right only.
    const leftBody = (/when 1 # Left([\s\S]*?)when 2/.exec(text) || [, ''])[1];
    const skip = String(k('TEXT_SKIP', 'A')).replace(/^:/, '');
    const BUTTONS = { A: 'shift', B: 'cancel', C: 'ok', X: 'rgssX', Y: 'rgssY', Z: 'rgssZ', L: 'pageup', R: 'pagedown', CTRL: 'control', SHIFT: 'shift', ALT: 'shift' };
    return {
        rowsVariable: String(Number(k('VARIABLE_ROWS', 0)) || 0),
        widthVariable: String(Number(k('VARIABLE_WIDTH', 0)) || 0),
        defaultRows: String(defaultRows),
        rowsAlsoDefault: alsoDefault.join(','),
        continueAbove: String(continueAbove),
        faceIndent: String(Number(k('FACE_INDENT_X', 112))),
        fontFace: system ? [font.family, ...font.fallbacks].map(n => (/^[A-Za-z-]+$/.test(n) ? n : `"${n}"`)).concat(['sans-serif']).join(', ') : '',
        fontSize: String(fontSize),
        bold: String(k('MESSAGE_WINDOW_FONT_BOLD', false) === true),
        italic: String(k('MESSAGE_WINDOW_FONT_ITALIC', false) === true),
        outline: String(k('MESSAGE_WINDOW_FONT_OUTLINE', true) !== false),
        textSkip: BUTTONS[skip.toUpperCase()] || '',
        nameWindow: String(/class Window_NameMessage\b/.test(text)),
        nameXBuffer: String(Number(k('NAME_WINDOW_X_BUFFER', -20)) || 0),
        nameYBuffer: String(Number(k('NAME_WINDOW_Y_BUFFER', 0)) || 0),
        namePadding: String(Number(k('NAME_WINDOW_PADDING', 0)) || 0),
        nameColour: String(Number(k('NAME_WINDOW_COLOUR', 6)) || 0),
        nameLeftBuffer: String(!text || /NAME_WINDOW_X_BUFFER/.test(leftBody)),
        // Yanfly's draws the name NAME_WINDOW_PADDING in; a game may draw it at the edge.
        nameTextX: String(!text || /draw_text_ex\(\s*YEA::MESSAGE::NAME_WINDOW_PADDING/.test(text) ? Number(k('NAME_WINDOW_PADDING', 0)) || 0 : 0)
    };
}

module.exports = { extract };
