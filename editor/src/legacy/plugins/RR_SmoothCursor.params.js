'use strict';
// Plugin parameters for RR_SmoothCursor from the game's copy of Smooth Cursor
// (MakerSystems::SmoothCursor::DELAY_LEVEL).

function extract({ constants = {} } = {}) {
    const delay = constants['MakerSystems::SmoothCursor::DELAY_LEVEL'];
    return typeof delay === 'number' ? { delayLevel: String(delay) } : {};
}

module.exports = { extract };
