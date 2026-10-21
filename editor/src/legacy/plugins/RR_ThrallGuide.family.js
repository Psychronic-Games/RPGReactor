'use strict';
// Thrall's Guide (Strak, on modern algebra's Quest Journal and Catalogue Base): $game_party.guides[id] (made on
// first use, as the script's Game_Guides#[] does), reveal_guide(id), and the scene $scene = Scene_Guide.new opens.
module.exports = {
    key: 'thrallGuide', detect: /module GuideData\b[\s\S]*def self\.guide_data\b/, plugin: 'RR_ThrallGuide',
    members: { 'party.guides': ['($.rrGuides?.() ?? [])', 'array:thrallGuide'] },
    objects: {
        thrallGuide: {
            auto_reveal: '($?.auto_reveal ?? [])', concealed: '($?.concealed ?? true)', name: '($?.name ?? "")', parags: '($?.parags ?? [])',
            icon_index: '($?.icon_index ?? 0)', id: '($?.id ?? 0)'
        }
    },
    setters: { 'thrallGuide.concealed': '((g) => g && (g.concealed = %v))($)' },
    event: {
        reveal_guide: '$gameParty.rrRevealGuide?.(%0)',
        'guide_revealed?': ['($gameParty.rrGuideRevealed?.(%0) ?? false)', 'bool'],
        guide: ['$gameParty.rrGuides?.()?.[%0]', 'thrallGuide'],
        call_guide: '(typeof Scene_RRThrallGuide === "function" && SceneManager.push(Scene_RRThrallGuide))'
    },
    scenes: { Scene_Guide: '(typeof Scene_RRThrallGuide === "function" && (SceneManager.push(Scene_RRThrallGuide), SceneManager.prepareNextScene(%0, %1)))' },
    classes: { Scene_Guide: 'Scene_RRThrallGuide' }
};
