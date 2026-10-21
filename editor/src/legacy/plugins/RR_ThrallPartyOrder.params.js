'use strict';
// Plugin parameters for RR_ThrallPartyOrder from the game's copy of Change Party Order: its freeze switch.
function extract({ scripts = [] } = {}) {
    for (const text of scripts) {
        const m = /^\s*ORDER_FREEZE_SWITCH_ID\s*=\s*(\d+)/m.exec(String(text || ''));
        if (m) return { freezeSwitch: m[1] };
    }
    return {};
}
module.exports = { extract };
