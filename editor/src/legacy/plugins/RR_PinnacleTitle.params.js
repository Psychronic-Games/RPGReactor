'use strict';
// Plugin parameters for RR_PinnacleTitle from the game's Scene_Title (the tutorial's map and place, the command
// window's opacity) and Window_TitleCommand (its commands, skin, font, row height and shadow).

const path = require('path');

/** A TrueType/OpenType file's family names (name table, IDs 1 and 4), or []. */
function fontNames(bytes) {
    try {
        const b = Buffer.from(bytes);
        const tables = {};
        for (let i = 0; i < b.readUInt16BE(4); i++) { const o = 12 + i * 16; tables[b.toString('latin1', o, o + 4)] = b.readUInt32BE(o + 8); }
        const at = tables.name;
        if (at === undefined) return [];
        const count = b.readUInt16BE(at + 2), strings = at + b.readUInt16BE(at + 4), out = new Set();
        for (let i = 0; i < count; i++) {
            const r = at + 6 + i * 12;
            const platform = b.readUInt16BE(r), id = b.readUInt16BE(r + 6), len = b.readUInt16BE(r + 8), off = b.readUInt16BE(r + 10);
            if (id !== 1 && id !== 4) continue;
            const raw = b.subarray(strings + off, strings + off + len);
            if (platform === 0 || platform === 3) { let s = ''; for (let k = 0; k + 1 < raw.length; k += 2) s += String.fromCharCode(raw.readUInt16BE(k)); out.add(s); }
            else out.add(raw.toString('latin1'));
        }
        return Array.from(out);
    } catch (_) { return []; }
}

/** winAscent / (winAscent + winDescent) of a font file, or null. */
function winAscent(bytes) {
    try {
        const b = Buffer.from(bytes);
        const tables = {};
        for (let i = 0; i < b.readUInt16BE(4); i++) { const o = 12 + i * 16; tables[b.toString('latin1', o, o + 4)] = b.readUInt32BE(o + 8); }
        const os = tables['OS/2'];
        if (os === undefined) return null;
        const a = b.readUInt16BE(os + 74), d = b.readUInt16BE(os + 76);
        return a + d > 0 ? a / (a + d) : null;
    } catch (_) { return null; }
}

/** The file in Fonts/ whose family is `name`, or null. */
function fontFile(name, read, list) {
    const files = (list ? list('Fonts') : []).filter(f => /\.(ttf|otf)$/i.test(f));
    const want = String(name).toLowerCase();
    for (const f of files) {
        const bytes = read ? read('Fonts/' + f) : null;
        if (bytes && fontNames(bytes).some(n => n.toLowerCase() === want)) return { file: f, bytes };
    }
    return null;
}

function extract({ scripts = [], read, list } = {}) {
    const out = {};
    const scene = scripts.find(s => /class Scene_Title < Scene_Base[\s\S]*def command_tutorial/.test(s));
    if (scene) {
        const start = /def command_tutorial\s*\n\s*DataManager\.setup_new_game\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/.exec(scene);
        if (start) out.tutorialStart = JSON.stringify([Number(start[1]), Number(start[2]), Number(start[3])]);
        const back = /@command_window\.back_opacity\s*=\s*(\d+)/.exec(scene);
        if (back) out.backOpacity = back[1];
    }
    const win = scripts.find(s => /class Window_TitleCommand < Window_Command[\s\S]*def make_command_list/.test(s));
    if (win) {
        const skin = /self\.windowskin\s*=\s*Cache\.system\("([^"]+)"\)/.exec(win);
        if (skin) out.windowskin = skin[1];
        const row = /def item_height\s*\n\s*return (\d+)/.exec(win);
        if (row) out.itemHeight = row[1];
        const shadow = /shadow_rect\.x\s*-=\s*(\d+)/.exec(win);
        if (shadow) out.shadowOffset = shadow[1];
        const body = (/def make_command_list([\s\S]*?)\n\s*end/.exec(win) || [])[1] || '';
        const commands = [];
        for (const m of body.matchAll(/add_command\(\s*("([^"]*)"|[A-Za-z0-9_:]+)\s*,\s*:(\w+)/g)) {
            // A string is the game's text (or key); a constant is a database term, except the options' own.
            let text = m[2] !== undefined ? m[2] : '';
            if (m[2] === undefined && /OPTION_COMMAND/.test(m[1])) {
                const opt = scripts.map(s => /OPTION_COMMAND\s*=\s*"([^"]*)"/.exec(s)).find(Boolean);
                text = opt ? opt[1] : 'Options';
            }
            commands.push([text, m[3]]);
        }
        if (commands.length) out.commands = JSON.stringify(commands);
        const font = /contents\.font\.name\s*=\s*"([^"]+)"/.exec(win);
        const size = Number((/contents\.font\.size\s*=\s*(\d+)/.exec(win) || [])[1]) || 22;
        if (font) {
            const found = fontFile(font[1], read, list);
            if (found) {
                out.fontFile = found.file;
                let C = null;
                try { C = require(path.join(__dirname, '..', 'RgssConvert.js')); } catch (_) { C = null; }
                const scale = (C && C.rgssFontScale(found.bytes)) || 1;
                out.fontSize = String(Math.round(size * scale * 10) / 10);
                // RGSS gives the text a cell `size` pixels high, centred in the row unless it is taller (then from
                // the row's top), with the baseline the font's ascent into it.
                const ascent = winAscent(found.bytes);
                const row = Number(out.itemHeight) || 24;
                if (ascent !== null) out.baseline = String(Math.round((Math.max(0, (row - size) / 2) + size * ascent) * 10) / 10);
            } else {
                out.fontFile = '';
                out.fontSize = String(Math.round(size * 0.8333 * 10) / 10);
            }
        }
    }
    return out;
}

module.exports = { extract, fontNames };
