'use strict';
// Plugin parameters for RR_ThrallMessages from the game's copy of STR22 MWEXT++: the customisation section's
// constants, the core's rotate switch, the gold window's place in Window_Message, Font.default_size from Main,
// and STR11b's band (the battle message's background) when the game has it.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** NAME = <literal> at the start of a line, or undefined. */
function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}
const numbers = (s) => s.split(',').map(x => Number(x.trim())).filter(x => !isNaN(x));
/** NAME = Color.new(r, g, b[, a]) or Rect.new(x, y, w, h). */
function call(source, name, kind) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*' + kind + '\\.new\\(([^)]*)\\)', 'm').exec(source);
    return m ? numbers(m[1]) : undefined;
}
const rgba = (c) => (c ? [c[0], c[1], c[2], c[3] === undefined ? 255 : c[3]] : undefined);
/** NAME = { n => Color.new(...), ... } */
function colorHash(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*\\{([\\s\\S]*?)\\}', 'm').exec(source);
    if (!m) return undefined;
    const out = {};
    for (const e of m[1].matchAll(/(\d+)\s*=>\s*Color\.new\(([^)]*)\)/g)) out[e[1]] = rgba(numbers(e[2]));
    return out;
}
const plainHash = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), x])) : undefined);

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const edit = sources.find(s => /^\s*WINDOW_RECT\s*=\s*Rect\.new/m.test(s) && /MESBACK_LIST/.test(s)) || '';
    const core = sources.find(s => /def map_name_strextpp\b/.test(s)) || '';
    const out = {};
    const put = (key, value, f = String) => { if (value !== undefined && value !== null) out[key] = f(value); };
    const list = (v) => [].concat(v).join(',');
    const bool = (v) => String(v !== false && v !== null);

    put('windowRect', call(edit, 'WINDOW_RECT', 'Rect'), list);
    put('screen', literal(edit, 'STR22900'), list);
    put('battleMode', literal(edit, 'BTMESMODE'));
    put('fadeType', literal(edit, 'FADE_TYPE'));
    put('fadeSpeed', literal(edit, 'STR22011'));
    put('slimWindow', literal(edit, 'S_WINDOW'), bool);
    const sw = literal(edit, 'S_WINDOW_W'), sh = literal(edit, 'S_WINDOW_H');
    if (sw !== undefined && sh !== undefined) out.slimSize = `${sw},${sh}`;
    put('lineHeight', literal(edit, 'WLH'));
    put('align', literal(edit, 'ALIGN'));
    put('nameColor', call(edit, 'N_WINDOW_CO', 'Color'), list);
    put('nameEdge', literal(edit, 'N_WINDOW_ED'), bool);
    put('nameEdgeColor', call(edit, 'N_WINDOW_CE', 'Color'), list);
    put('nameSize', literal(edit, 'N_WINDOW_WH'), list);
    put('nameOffset', literal(edit, 'N_WINDOW_XY'), list);
    put('nameOpacity', literal(edit, 'N_WINDOW_OPC'));
    put('pausePlace', literal(edit, 'P_WINDOW'));
    put('pauseOffset', literal(edit, 'P_WINDOW_XY'), list);
    put('pauseSpeed', literal(edit, 'STR22010'));
    put('faceSize', literal(edit, 'FACE_SIZE'), list);
    put('faceOffset', literal(edit, 'FACE_XY'), list);
    put('faceSpace', literal(edit, 'FACE_SPACE'));
    put('backVariable', literal(edit, 'MESBACK_VA'));
    put('backImages', plainHash(literal(edit, 'MESBACK_LIST')), JSON.stringify);
    put('moveSwitch', literal(edit, 'MESMOVE'));
    put('noSkipSwitch', literal(edit, 'PSID'));
    put('noDashSwitch', literal(edit, 'SSID'));
    put('noDoubleSwitch', literal(edit, 'FSID'));
    put('endWait', literal(edit, 'F_WAIT'));
    put('autoFast', literal(edit, 'F_AUTO'), bool);
    put('edgeColors', colorHash(edit, 'EDGE_COLOR'), JSON.stringify);
    put('macros', plainHash(literal(edit, 'MACRO')), JSON.stringify);
    put('autoNames', plainHash(literal(edit, 'A_N_WINDOW')), JSON.stringify);
    // The term list's own strings (the rest are Vocab's terms, which the plugin reads from the database).
    const vo = /@vo\s*=\s*\{([\s\S]*?)\n\s*\}/.exec(edit);
    if (vo) {
        const extra = {};
        for (const e of vo[1].matchAll(/(\d+)\s*=>\s*"([^"]*)"/g)) extra[e[1]] = e[2];
        out.vocabExtra = JSON.stringify(extra);
    }

    // The core's edit: the arrow keys turn while a switch is on.
    const turn = /\$game_switches\[(\d+)\]\s*\?\s*move_right\s*:\s*move_down/.exec(core);
    if (turn) out.rotateSwitch = turn[1];

    // Window_Message's gold window (Window_Gold.new(x, y)).
    for (const s of sources) {
        const m = /def create_gold_window[\s\S]*?Window_Gold\.new\((\d+)\s*,/.exec(s);
        if (m) out.goldX = m[1];
    }

    // Font.default_size = 20 (or = SOME::CONSTANT) in Main.
    for (const s of sources) {
        const m = /^[ \t]*Font\.default_size\s*=\s*([\w:]+)/m.exec(s);
        if (!m) continue;
        const v = /^\d+$/.test(m[1]) ? Number(m[1]) : constants[m[1]];
        if (typeof v === 'number' && v > 0) { out.fontSize = String(v); break; }
    }

    // STR11b's band under battle messages: two colours across, a width, how fast it fades.
    const band = sources.find(s => /class Window_BattleMessage < Window_Message/.test(s) && /TEXT_B_COLOR\s*=/.test(s));
    if (band) {
        if (literal(band, 'N_WINDOW') === true) out.battleBand = '';
        else {
            const m = /^[ \t]*TEXT_B_COLOR\s*=\s*\[([^\]]*)\]/m.exec(band);
            const colors = m ? [...m[1].matchAll(/Color\.new\(([^)]*)\)/g)].map(c => rgba(numbers(c[1]))) : [[0, 0, 0, 224], [0, 0, 0, 196]];
            out.battleBand = JSON.stringify({
                colors, width: Number(literal(band, 'BTWIDTH')) || 608, step: Number(literal(band, 'W_OPACITY')) || 96,
                speed: Number(literal(band, 'SPEED')) || 1, move: literal(band, 'MOVE') !== false
            });
        }
    } else out.battleBand = '';
    return out;
}

module.exports = { extract };
