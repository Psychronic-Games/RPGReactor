'use strict';
// Plugin parameters for RR_BlizzBars from the game's copy of the BlizzArt Gradient Styler (BAGS_BAR_STYLE, BAGS_BAR_OPACITY).

function extract({ constants = {} } = {}) {
    const style = Number(constants.BAGS_BAR_STYLE ?? 1);
    const opacity = Number(constants.BAGS_BAR_OPACITY ?? 155);
    return { style: String(Number.isFinite(style) ? style : 1), opacity: String(Number.isFinite(opacity) ? opacity : 155) };
}

module.exports = { extract };
