'use strict';
// Plugin parameters for RR_NeonLockpick from the game's copy of Neon Black's Lockpicking (CP::LOCKPICK::SETTINGS,
// LOCK, PICK and KEY), the variable its change_pick lowers per lost pick, and whether it rumbles a WolfPad.

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const s = (name, d) => (constants['CP::LOCKPICK::SETTINGS::' + name] === undefined ? d : constants['CP::LOCKPICK::SETTINGS::' + name]);
    const g = (part, d) => ({
        name: String(constants[`CP::LOCKPICK::${part}::GRAPHIC`] ?? d.name),
        x: Number(constants[`CP::LOCKPICK::${part}::X_OFFSET`] ?? d.x), y: Number(constants[`CP::LOCKPICK::${part}::Y_OFFSET`] ?? d.y)
    });
    const sound = (name, d) => ({ name: String(s(name + '_SOUND', d[0]) ?? ''), volume: Number(s(name + '_VOLUME', d[1])), pitch: Number(s(name + '_PITCH', d[2])) });
    const source = scripts.map(text).find(t => /class Lockpick < Scene_MenuBase/.test(t)) || '';
    const change = /def change_pick\b([\s\S]*?)\n\s*def /.exec(source);
    const count = change && /\$game_variables\[(\d+)\]\s*-=\s*1/.exec(change[1]);
    // Ruby truth: only false and nil turn a setting off.
    const on = (v) => v !== false && v !== null;
    return {
        pickItem: String(Number(s('PICK_ITEM', 0))),
        goldPickItem: String(Number(s('G_PICK_ITEM', 0))),
        useGoldPick: String(on(s('USE_G_PICK', false))),
        variable: String(Number(s('VARIABLE', 0))),
        sounds: JSON.stringify({ lock: sound('LOCK', ['', 100, 100]), unlock: sound('UNLOCK', ['', 100, 100]), break: sound('BREAK', ['', 100, 100]) }),
        breakPickSwitch: String(Number(s('BREAK_PICK_SWITCH', 0))),
        breakPicks: String(on(s('BREAK_PICKS', false))),
        lockDurability: String(Number(s('LOCK_DURABILITY', 200))),
        pickDurability: String(Number(s('PICK_DURABILITY', 100))),
        brokenText: String(s('BROKEN', '')),
        showRemaining: String(on(s('SHOW_REMAINING', true))),
        itemName: String(s('ITEM_NAME', '')),
        graphics: JSON.stringify({ lock: g('LOCK', { name: 'Lock', x: 0, y: 0 }), pick: g('PICK', { name: 'Pick', x: 0, y: 30 }), key: g('KEY', { name: 'Key', x: 0, y: -20 }) }),
        countVariable: count ? count[1] : '0',
        vibrate: String(/\bWolfPad\.vibrate\b/.test(source))
    };
}

module.exports = { extract };
