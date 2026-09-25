'use strict';
// Plugin parameters for RR_VersionNumber from the game's copy of Vlue's Version/Build Number script, and the
// build number the game shipped with (System/Version.vmdt, a Marshal integer the script counts up at start).

const M = require('../RubyMarshal.js');
const C = require('../RgssConvert.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants: all = {}, read = () => null } = {}) {
    const source = scripts.map(text).find(s => /Window_Version\b/.test(s) && /VERSION\s*=/.test(s)) || '';
    const constants = C.scriptConstants([source]);
    const k = (name, d) => (constants[name] === undefined ? d : constants[name]);
    let build = 0;
    try { const bytes = read('System/Version.vmdt'); if (bytes) build = Number(M.load(bytes)) || 0; } catch (_) { build = 0; }
    // Its text is drawn in the game's font: RGSS sizes by the cell, a browser by the em.
    const font = C.chooseFont(C.fontDefaults(scripts.map(text), all).name || [], []);
    const scale = (font && font.scale) || 0.787;
    // The script counts the start it draws on, so a fresh start shows one more than the file holds.
    if (k('RELEASE', false) !== true) build += 1;
    return {
        flavor: String(k('FLAVORTEXT', '')),
        version: String(k('VERSION', '')),
        versionOnly: String(k('VERSION_ONLY', false) === true),
        build: String(build),
        fontSize: String(Math.round(Number(k('VFONT_SIZE', 12)) * scale * 10) / 10),
        x: String(Number(k('VWINDOW_X', 10))),
        y: String(Number(k('VWINDOW_Y', 440)))
    };
}

module.exports = { extract };
