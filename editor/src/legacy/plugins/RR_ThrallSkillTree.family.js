'use strict';
// Deity's SkillTree as Thrall edited it (three-branch class trees, skill pages as pictures) and Strak's Respec
// System built on it: the menu's Skills command opens Scene_ThrallSkills, an event $scene = Scene_Respec.new(1).
const push = (scene) => `(typeof ${scene} === "function" && SceneManager.push(${scene}))`;
module.exports = [
    {
        key: 'thrallSkillTree', detect: /module Deity\s*\n\s*module SkillTree\b[\s\S]*class Scene_SkillTree < Scene_Base/, plugin: 'RR_ThrallSkillTree',
        scenes: {
            Scene_SkillTree: `(${push('Scene_RRThrallSkillTree')} && SceneManager.prepareNextScene(%0))`,
            Scene_Respec: push('Scene_RRThrallRespec')
        },
        classes: { Scene_SkillTree: 'Scene_RRThrallSkillTree', Scene_Respec: 'Scene_RRThrallRespec' },
        members: { 'actor.skill_points': ['($.rrSkillPoints?.() ?? 0)', 'number'] },
        setters: { 'actor.skill_points': '$.rrSetSkillPoints?.(%v)' }
    }
];
