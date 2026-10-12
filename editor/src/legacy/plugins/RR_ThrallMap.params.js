'use strict';
// Plugin parameters for RR_ThrallMap from Thrall's edits to the stock sections: the switch Game_Map#autoplay
// asks before playing map music, the switch Game_Map#passable? reverses layer 2 with, the switch
// Scene_Map#call_battle asks before the battle music, and Scene_Map#perform_battle_transition's wipe.

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const all = scripts.map(text);
    const out = {};
    const map = all.find(s => /class Game_Map\b/.test(s) && /def autoplay\b/.test(s)) || '';
    const bgm = /@map\.bgm\.play if @map\.autoplay_bgm and \$game_switches\[(\d+)\]/.exec(map);
    if (bgm) out.bgmSwitch = bgm[1];
    const passage = /def passable\?[\s\S]*?if i == 2[\s\S]*?\$game_switches\[(\d+)\]/.exec(map);
    if (passage) out.passageSwitch = passage[1];
    const scene = all.find(s => /class Scene_Map\b/.test(s) && /def call_battle\b/.test(s)) || '';
    const battle = /def call_battle\b[\s\S]*?if \$game_switches\[(\d+)\][\s\S]*?battle_bgm\.play/.exec(scene);
    if (battle) out.battleBgmSwitch = battle[1];
    const wipe = /def perform_battle_transition\b\s*Graphics\.transition\(\s*(\d+)\s*,\s*"Graphics\/System\/([^"]+)"\s*,\s*(\d+)\s*\)/.exec(scene);
    if (wipe) Object.assign(out, { transitionDuration: wipe[1], transitionImage: wipe[2], transitionVague: wipe[3] });
    return out;
}

module.exports = { extract };
