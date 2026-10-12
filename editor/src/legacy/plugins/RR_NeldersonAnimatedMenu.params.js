'use strict';
// Plugin parameters for RR_NeldersonAnimatedMenu from the game's NEL::TRANS_SPEED and the direction its windows
// come from (the script's `dir = n # (rand(4) + 1).round`, doubled).

function extract({ scripts = [] } = {}) {
    const text = scripts.find(s => /module NEL\b[\s\S]*TRANS_SPEED\s*=/.test(s));
    if (!text) return {};
    const out = {};
    for (const [sym, key] of [['gold', 'goldSpeed'], ['command', 'commandSpeed'], ['actor', 'actorSpeed']]) {
        const m = new RegExp(`:${sym}\\s*=>\\s*(\\d+)`).exec(text);
        if (m) out[key] = m[1];
    }
    const dir = /def create_command_window[\s\S]*?dir\s*=\s*(\d+)/.exec(text);
    if (dir) out.direction = String(Number(dir[1]) * 2);
    return out;
}

module.exports = { extract };
