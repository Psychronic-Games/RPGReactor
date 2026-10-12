'use strict';
// Plugin parameters for RR_HollowMessageBusts from the game's copy of Simple Message Busts (module HMB), and
// the edits a game made to it: the bust moved to the right of a narrower window, one file per character.

function extract({ scripts = [], constants = {} } = {}) {
    const k = (name, d) => (Object.prototype.hasOwnProperty.call(constants, 'HMB::' + name) ? constants['HMB::' + name] : d);
    const text = scripts.find(s => /module HMB\b/.test(s)) || '';
    const right = /@bust\.x\s*=\s*Graphics\.width\s*-\s*(\d+)/.exec(text);
    return {
        symbol: String(k('BUST_SYMBOL', '§')),
        indent: String(Number(k('BUST_INDENT', 155))),
        offset: String(Number(k('BUST_OFFSET', -90))),
        rightWidth: String(right ? Number(right[1]) : 0),
        singleFile: String(/name\s*\+=\s*"1"/.test(text))
    };
}

module.exports = { extract };
