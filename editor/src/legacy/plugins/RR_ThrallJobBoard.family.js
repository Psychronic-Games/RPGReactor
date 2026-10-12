'use strict';
// Thrall's Game_System (jobs, the blackjack deck and hands, tutorials, the loot pity lists, the save stamps) and
// Strak's Job Board, the scene the guild's board opens with $scene = Scene_JobBoard.new.
// The lists are the game's own arrays: events push, delete (every equal entry, as Ruby's Array#delete) and index them.
const list = (name) => [`($.rr${name}?.() ?? [])`, 'arrayThrall'];
const LISTS = { accepted_jobs: 'AcceptedJobs', jobs: 'Jobs', deck: 'Deck', hand_1: 'Hand1', hand_2: 'Hand2', weapon_list: 'WeaponList', armor_list: 'ArmorList',
    weapon_types: 'WeaponTypes', armor_types: 'ArmorTypes', tutorials: 'Tutorials' };

module.exports = {
    key: 'thrallJobBoard', detect: /def get_job_index\(dungeon\)[\s\S]*def get_cleared_index\b/, plugin: 'RR_ThrallJobBoard',
    members: Object.assign(Object.fromEntries(Object.entries(LISTS).map(([k, v]) => ['system.' + k, list(v)])), {
        'system.get_job_index': ['($.rrGetJobIndex?.(%0) ?? 0)', 'number'],
        'system.get_cleared_index': ['($.rrGetClearedIndex?.() ?? 0)', 'number'],
        'system.check_floor': ['($.rrCheckFloor?.(%0) ?? false)', 'bool'],
        'system.check_cleared': ['($.rrCheckCleared?.() ?? false)', 'bool'],
        'system.generate_jobs': ['$.rrGenerateJobs?.(%*)', 'any'],
        'system.job_detail': ['($.rrJobDetail?.(%0) ?? "")', 'string'],
        'system.version_id': ['$.versionId()', 'number'],
        'system.validator': ['($.rrValidator?.() ?? 0)', 'any'],
        'system.time_check': ['($.rrTimeCheck?.() ?? 0)', 'any'],
        'table.version_id': ['$dataSystem.versionId', 'number']
    }),
    setters: Object.assign(Object.fromEntries(Object.entries(LISTS).map(([k, v]) => ['system.' + k, `$.rrSetList?.("${v}", %v)`])), {
        'system.validator': '$._rrValidator = %v', 'system.time_check': '$._rrTimeCheck = %v'
    }),
    // Ruby's Array#delete / delete_at on the game's lists (the other array methods are the translator's own).
    objects: {
        arrayThrall: {
            delete: '((a, v) => { const k = JSON.stringify(v); let found = null; for (let i = a.length - 1; i >= 0; i--) if (a[i] === v || JSON.stringify(a[i]) === k) { found = a[i]; a.splice(i, 1); } return found; })($, %0)',
            delete_at: '((a, i) => (i < a.length && i >= -a.length ? a.splice(i < 0 ? a.length + i : i, 1)[0] : null))($, %0)',
            clear: '$.splice(0)'
        }
    },
    scenes: { Scene_JobBoard: '(typeof Scene_RRThrallJobBoard === "function" && SceneManager.push(Scene_RRThrallJobBoard))' },
    classes: { Scene_JobBoard: 'Scene_RRThrallJobBoard' }
};
