'use strict';
// Plugin parameters for RR_ScreenshotTaker from the game's copy of cremno's Screenshot taker (Screenshot::KEY, SE,
// FORMAT, DIRECTORY, FILENAME).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
// RGSS buttons as MZ's Input names them in an imported game.
const BUTTONS = { A: 'shift', B: 'cancel', C: 'ok', X: 'rgssX', Y: 'rgssY', Z: 'rgssZ', L: 'pageup', R: 'pagedown', SHIFT: 'shift', CTRL: 'control', ALT: 'alt' };
const button = (symbol) => (/^F[5-9]$/i.test(symbol) ? symbol.toUpperCase() : BUTTONS[symbol.toUpperCase()] || 'F5');

/** Graphics/Pictures → img/pictures; a folder MZ does not have keeps its name under img/. */
const imgFolder = (dir) => {
    const m = /^Graphics\/(.+?)\/?$/i.exec(String(dir).replace(/\\/g, '/'));
    if (!m) return String(dir).replace(/\/?$/, '/');
    const standard = ['Animations', 'Battlebacks1', 'Battlebacks2', 'Battlers', 'Characters', 'Faces', 'Parallaxes', 'Pictures', 'System', 'Tilesets', 'Titles1', 'Titles2'];
    const hit = standard.find(s => s.toLowerCase() === m[1].toLowerCase());
    return 'img/' + (hit ? (hit === 'Battlers' ? 'enemies' : hit.toLowerCase()) : m[1]) + '/';
};

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /module Screenshot\b/.test(s)) || '';
    const symbol = (name, d) => { const m = new RegExp('^\\s*' + name + '\\s*=\\s*:?(\\w+)', 'm').exec(source); return m ? m[1] : d; };
    const k = (name, d) => (constants['Screenshot::' + name] === undefined ? d : constants['Screenshot::' + name]);
    return {
        key: button(symbol('KEY', 'F5')),
        se: String(k('SE', '')),
        format: /^jpe?g$/i.test(symbol('FORMAT', 'png')) ? 'jpg' : 'png',
        folder: imgFolder(k('DIRECTORY', 'Graphics/Screenshots')),
        filename: String(k('FILENAME', 'Screenshot'))
    };
}

module.exports = { extract, imgFolder, button };
