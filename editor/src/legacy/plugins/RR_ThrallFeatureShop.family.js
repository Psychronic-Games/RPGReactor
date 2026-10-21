'use strict';
// Thrall's Feature Shop (Strak): Scene_Appraise, the shop events open with $scene = Scene_Appraise.new(n) —
// 0 the backpack and storage upgrades, 1 appraising equipment, 2 the bestiary entries.
module.exports = {
    key: 'thrallFeatureShop', detect: /module APPRAISE\b[\s\S]*class Scene_Appraise < Scene_Base/, plugin: 'RR_ThrallFeatureShop',
    scenes: { Scene_Appraise: '(typeof Scene_RRThrallAppraise === "function" && (SceneManager.push(Scene_RRThrallAppraise), SceneManager.prepareNextScene(%0)))' },
    classes: { Scene_Appraise: 'Scene_RRThrallAppraise' }
};
