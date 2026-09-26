'use strict';
// Plugin parameters for RR_VlueWindowEffects from the game's copy of Vlue's Special Window Effects
// (WEFF_OPEN_STYLE, WEFF_CLOSE_STYLE, WEFF_SPEED).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const STYLES = ['none', 'fade', 'slide', 'book', 'book_oat'];

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /^\s*WEFF_OPEN_STYLE\s*=/m.test(s)) || '';
    const style = (name) => { const m = new RegExp('^\\s*' + name + '\\s*=\\s*:(\\w+)', 'm').exec(source); return m && STYLES.includes(m[1]) ? m[1] : 'none'; };
    const speed = constants.WEFF_SPEED;
    return { openStyle: style('WEFF_OPEN_STYLE'), closeStyle: style('WEFF_CLOSE_STYLE'), speed: String(typeof speed === 'number' && speed > 0 ? speed : 5) };
}

module.exports = { extract };
