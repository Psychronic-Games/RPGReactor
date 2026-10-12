'use strict';
// Plugin parameters for RR_ThrallRecharge from the game's copy of Recharge Skills: its CLASS_RECHARGE_MODS and
// ACTOR_RECHARGE_MODS hashes. Values keep their Ruby text, since 1.0 (a Float) multiplies where 1 adds.

/** NAME = { id => value, … } as { id: "value" }, or undefined. */
function modHash(text, name) {
    const m = new RegExp(`^\\s*${name}\\s*=\\s*\\{([\\s\\S]*?)\\}`, 'm').exec(text);
    if (!m) return undefined;
    const out = {};
    for (const e of m[1].replace(/#.*$/gm, '').matchAll(/(\d+)\s*=>\s*(-?\d+(?:\.\d+)?)/g)) out[e[1]] = e[2];
    return out;
}

function extract({ scripts = [] } = {}) {
    const text = scripts.find(s => /def update_single_skill_recharge\(skill, turns\)|ACTOR_RECHARGE_MODS\s*=/.test(String(s))) || '';
    const out = {};
    const classMods = modHash(text, 'CLASS_RECHARGE_MODS');
    const actorMods = modHash(text, 'ACTOR_RECHARGE_MODS');
    if (classMods) out.classMods = JSON.stringify(classMods);
    if (actorMods) out.actorMods = JSON.stringify(actorMods);
    const se = /def update_skill_recharge[\s\S]*?Audio\.se_play\("Audio\/SE\/([^"]+)"/.exec(text);
    if (se) out.readySe = se[1];
    return out;
}

module.exports = { extract };
