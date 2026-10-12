'use strict';
// Pinnacle's kingdom layer: the party's story journal, its buildings' daily income, the special-offer shops, its
// armies (the Troop table and the commanders), and the DataManager edits (text keys, a new game on any map).
// Events read and change these on $game_party, build armies with the Troop table, total the production, and open
// shops paid in a resource (SceneManager.scene.prepare(goods, true, item)).
module.exports = () => ({
    key: 'pinnacleKingdom', detect: /attr_accessor :daily_income[\s\S]*@daily_income = \[\]/, plugin: 'RR_PinnacleKingdom',
    members: {
        'party.story': ['$gameParty.rrStory()', 'array'],
        'party.daily_income': ['$gameParty.rrDailyIncome()', 'array'],
        'party.shops': ['$gameParty.rrShops()', 'any'],
        'party.party_mode': ['$gameParty.rrPartyMode()', 'any'],
        'party.saved_party': ['$gameParty.rrSavedParty()', 'array'],
        'party.saved_troops': ['$gameParty.rrSavedTroops()', 'array'],
        'party.consumed_item_value': ['$gameParty.rrConsumedItemValue()', 'number'],
        'party.max_gold': ['$gameParty.rrMaxGold()', 'any'],
        'party.flag': ['$gameParty.rrFlag()', 'any'],
        'party.name': ['$gameParty.name()', 'string']
    },
    setters: {
        'party.story': '$gameParty.rrSetStory(%v)',
        'party.daily_income': '$gameParty.rrSetDailyIncome(%v)',
        'party.shops': '$gameParty.rrSetShops(%v)',
        'party.party_mode': '$gameParty.rrSetPartyMode(%v)',
        'party.saved_party': '$gameParty.rrSetSavedParty(%v)',
        'party.saved_troops': '$gameParty.rrSetSavedTroops(%v)',
        'party.consumed_item_value': '$gameParty.rrSetConsumedItemValue(%v)',
        'party.max_gold': '$gameParty.rrSetMaxGold(%v)',
        'party.flag': '$gameParty.rrSetFlag(%v)',
        'party.name': '$gameParty.rrSetName(%v)'
    },
    objects: {
        party: { remove_actor: '$.removeActor(%0, %1)' },
        // Army creation: a troop actor is set up afresh, given its class and brought back to level 1.
        actor: { setup: '$.setup(%0)', change_class: '$.changeClass(%0, !!%1)', level_down: '$.levelDown()', level_up: '$.levelUp()', 'is_army?': '$.isPreserveTp()' },
        map: { localize_maplines: 'void 0' },
        // Ruby's Array#include? and #delete compare with ==, an array element by element (a building,
        // ["[3778", [nil, 100], [151, 1]], is found by its contents); delete takes every equal element out.
        array: {
            'include?': '(window.RRPinnacleKingdom ? RRPinnacleKingdom.includes($, %0) : $.includes(%0))',
            delete: '(window.RRPinnacleKingdom ? RRPinnacleKingdom.remove($, %0) : ((a, v) => { let f = null; for (let i = a.length - 1; i >= 0; i--) if (a[i] === v) { f = a[i]; a.splice(i, 1); } return f; })($, %0))'
        },
        scene: { prepare: '$?.prepare?.(%*)' }
    },
    event: {
        troop_data: ['(window.RRPinnacleKingdom?.troopData() ?? {})', 'any'],
        troop_class: ['window.RRPinnacleKingdom?.troopData()[%0]?.[0]', 'number'],
        troop_graphicname: ['window.RRPinnacleKingdom?.troopData()[%0]?.[1]', 'string'],
        troop_graphicindex: ['window.RRPinnacleKingdom?.troopData()[%0]?.[2]', 'number'],
        total_production: ['(window.RRPinnacleKingdom?.totalProduction(%0) ?? null)', 'any']
    },
    modules: {
        DataManager: {
            lookup_loc_text: ['(window.RRKeyedText ? RRKeyedText.resolve(%0) : %0)', 'any'],
            'save_file_exists?': ['DataManager.isAnySavefileExists()', 'bool'],
            setup_new_game: 'DataManager.setupNewGame(%*)'
        },
        // SceneManager.scene is the scene a call just made, or the one running (Ruby sets @scene at once).
        SceneManager: {
            // (call and goto as the translator writes them: a scene whose port is off is no scene.)
            scene: ['SceneManager.rrScene()', 'scene'], call: '((s) => s && SceneManager.push(s))(%0)', goto: '((s) => s && SceneManager.goto(s))(%0)',
            return: 'SceneManager.pop()', exit: 'SceneManager.exit()',
            'scene_is?': ['(SceneManager.rrScene() instanceof %0)', 'bool']
        },
        Troop: {
            troop_data: ['(window.RRPinnacleKingdom?.troopData() ?? {})', 'any'],
            troop_nameflag: ['(window.RRPinnacleKingdom?.troopNameflag() ?? [])', 'array'],
            faction_names: ['(window.RRPinnacleKingdom?.factionNames() ?? {})', 'any']
        }
    }
});
