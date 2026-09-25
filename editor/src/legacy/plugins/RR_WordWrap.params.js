'use strict';
// Plugin parameters for RR_WordWrap from the game's copy of KilloZapit's Word Wrapping Message Boxes.

function extract({ constants = {} } = {}) {
    const k = (name, d) => {
        const v = constants['KZIsAwesome::WordWrap::' + name];
        return v === undefined ? d : v;
    };
    return {
        wordwrap: String(k('DEFAULT_WORDWRAP', true) === true),
        whitespace: String(k('DEFAULT_WHITESPACE', false) === true),
        collapse: String(k('DEFAULT_COLLAPSE', true) === true),
        rightMargin: String(Number(k('DEFAULT_RIGHT_MARGIN', 0)) || 0)
    };
}

module.exports = { extract };
