'use strict';
// Plugin parameters for RR_ThrallTitle from the game's copy of Discovery Title Screen (Rekx::CustomTitle and
// the picture names its start sets), its Scene_Title (the font and window size its config picks) and Main.

const path = require('path');
const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

/** NAME = <literal> inside module CustomTitle, or undefined. */
function constant(text, name) {
    const m = new RegExp(`^\\s*${name}\\s*=\\s*`, 'm').exec(text);
    if (!m) return undefined;
    try { return readLiteral(text, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

/** `case $game_variables[N]` / `when v` blocks that set `what`: N and, per v, the block's text. */
function cases(text, what) {
    const at = text.search(new RegExp(`case \\$game_variables\\[\\d+\\]\\s*\\n(?:(?!\\bend\\b)[\\s\\S])*?${what}`));
    if (at < 0) return null;
    const body = text.slice(at, text.indexOf('\n    end', at) > 0 ? text.indexOf('\n    end', at) : undefined);
    const variable = Number(/\$game_variables\[(\d+)\]/.exec(body)[1]);
    const out = {};
    for (const m of body.matchAll(/when (\d+)\s*\n([\s\S]*?)(?=\n\s*when |\s*$)/g)) out[m[1]] = m[2];
    return { variable, out };
}

function extract({ scripts = [], read } = {}) {
    const out = {};
    const title = scripts.find(s => /module CustomTitle\b/.test(s));
    if (!title) return out;
    const custom = title.slice(title.search(/module CustomTitle\b/));
    const get = (name) => constant(custom, name);
    const bool = (name) => { const v = get(name); if (typeof v === 'boolean') out[{ FALLING: 'falling', ALLOW_SLIDE: 'allowSlide' }[name]] = String(v); };
    bool('FALLING'); bool('ALLOW_SLIDE');
    for (const [name, key] of [['STYLE', 'style'], ['PLACEMENT', 'placement'], ['SLIDE_SPEED', 'slideSpeed'], ['TITLE_X', 'titleX'], ['TITLE_Y', 'titleY'], ['COMMAND_OPA', 'commandOpacity']]) {
        const v = get(name); if (typeof v === 'number') out[key] = String(v);
    }
    for (const [name, key] of [['COMMAND_X', 'commandX'], ['COMMAND_Y', 'commandY']]) {
        const v = get(name); if (Array.isArray(v)) out[key] = JSON.stringify(v);
    }
    const commands = ['NEW_GAME_GRAPHICS', 'CONTINUE_GRAPHICS', 'ERASE_GRAPHICS', 'SETTINGS_GRAPHICS', 'SHUTDOWN_GRAPHICS'].map(get);
    if (commands.every(Array.isArray)) out.commands = JSON.stringify(commands);
    // The pictures the scene's start names.
    for (const [ivar, key] of [['nBgImage', 'background'], ['ntitle', 'logo'], ['nfall1', 'fall1'], ['nfall2', 'fall2']]) {
        const m = new RegExp(`@${ivar}\\s*=\\s*"([^"]*)"`).exec(title);
        if (m) out[key] = m[1];
    }

    // Scene_Title: New Game needs a free slot (Dir.glob('Save*.rvdata').size < n), the font and window size by variable.
    const scene = scripts.find(s => /class Scene_Title < Scene_Base[\s\S]*def check_newgame/.test(s)) || '';
    const slots = /def check_newgame[\s\S]*?\.size\s*<\s*(\d+)/.exec(scene);
    if (slots) out.maxSaves = slots[1];
    const fonts = cases(scene, 'Font\\.default_name');
    if (fonts) {
        let C = null;
        try { C = require(path.join(__dirname, '..', 'RgssConvert.js')); } catch (_) { C = null; }
        const list = [];
        for (const [v, body] of Object.entries(fonts.out)) {
            const name = (/Font\.default_name\s*=\s*\[?\s*"([^"]+)"/.exec(body) || [])[1];
            const size = Number((/Font\.default_size\s*=\s*(\d+)/.exec(body) || [])[1]) || 20;
            list[Number(v)] = [name, size];
        }
        // The first is the game's main font (the importer's); the others are files in Fonts/, sized by RGSS's rule.
        const main = list[0] && list[0][0];
        out.fonts = JSON.stringify(Array.from(list, (f) => {
            if (!f) return null;
            if (f[0] === main) return ['', f[1], 0];
            const file = FONT_FILES[f[0]] || f[0].replace(/\s+/g, '') + '-Regular.ttf';
            let scale = FONT_SCALES[file] || 0;
            const bytes = read && read('Fonts/' + file);
            if (bytes && C) scale = C.rgssFontScale(bytes) || scale;
            return [file, f[1], scale ? Math.round(f[1] * scale * 10) / 10 : 0];
        }));
        out.fontVariable = String(fonts.variable);
    }
    const sizes = cases(scene, 'Resolution\\.resize');
    if (sizes) {
        const list = [];
        for (const [v, body] of Object.entries(sizes.out)) {
            const m = /Resolution\.resize\((\d+)\s*,\s*(\d+)\)/.exec(body);
            if (m) list[Number(v)] = [Number(m[1]), Number(m[2])];
        }
        out.sizes = JSON.stringify(Array.from(list, s => s || null));
        out.sizeVariable = String(sizes.variable);
    }
    return out;
}

// The fonts Thrall ships, by the names its scripts give them, and RGSS's size scale for each
// (RgssConvert.rgssFontScale of the file, for when the importer passes no file reader).
const FONT_FILES = { Roboto: 'Roboto-Regular.ttf', 'Eagle Lake': 'EagleLake-Regular.ttf' };
const FONT_SCALES = { 'Roboto-Regular.ttf': 0.8332, 'EagleLake-Regular.ttf': 0.6123 };

module.exports = { extract };
