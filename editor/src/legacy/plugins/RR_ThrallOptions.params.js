'use strict';
// Plugin parameters for RR_ThrallOptions: every YE::SYSTEM setting of the game's Menu System Options (texts,
// variables, switches, colours), as one JSON object.
function extract({ constants = {} } = {}) {
    const system = {};
    for (const [name, value] of Object.entries(constants)) {
        const m = /^YE::SYSTEM::([A-Z0-9_]+)$/.exec(name);
        if (m && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) system[m[1]] = value;
    }
    return Object.keys(system).length ? { system: JSON.stringify(system) } : {};
}
module.exports = { extract };
