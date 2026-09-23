'use strict';
// Reads Enhanced Camera's settings from the game's own copy of the script.

const DEFAULT_DECELERATION = 22;

function extract({ scripts = [], constants = {} } = {}) {
    let value = constants['MakerSystems::EnhancedCamera::Deceleration_Value'];
    if (typeof value !== 'number') value = constants['EnhancedCamera::Deceleration_Value'];
    if (typeof value !== 'number') {
        for (const text of scripts) {
            const m = /^\s*Deceleration_Value\s*=\s*(\d+(?:\.\d+)?)/m.exec(String(text || ''));
            if (m) { value = Number(m[1]); break; }
        }
    }
    if (typeof value !== 'number' || !(value > 0)) value = DEFAULT_DECELERATION;
    return { deceleration: String(value) };
}

module.exports = { extract };
