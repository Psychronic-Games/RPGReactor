'use strict';
// GubiD's Tactical Battle System as Pinnacle uses it (its GTBS setup sections, Scene_Battle_TBS, battlers, sprites
// and windows, with VE Damage Popup and Zoro's Army Switcher), and the game's battle-side edits of the stock
// scripts. Events reach the battle through SceneManager.scene (cursor_move, update_screen, set_character,
// end_battle …), set its goal with tbs_victory/tbs_failure, and the damage formulas call GTBS's unit methods.
module.exports = () => ({
    key: 'pinnacleGtbs',
    detect: /class Scene_Battle_TBS < Scene_Base[\s\S]*def prepare_GTBS/,
    plugin: 'RR_PinnacleGtbsScene',
    requires: ['RR_PinnacleGtbs', 'RR_PinnacleGtbsBattlers', 'RR_VictorDamagePopup', 'RR_PinnacleGtbsWindows', 'RR_PinnacleGtbsSprites'],
    event: {
        tbs_victory: 'this.rrTbsVictory?.(%*)', tbs_failure: 'this.rrTbsFailure?.(%*)', tbs_override_map: 'this.rrTbsOverrideMap?.(%0)',
        force_player_turn: 'this.rrForcePlayerTurn?.()', force_enemy_turn: 'this.rrForceEnemyTurn?.()',
        enable_tbs: 'this.rrEnableTbs?.()', disable_tbs: 'this.rrDisableTbs?.()', foe_team: 'this.rrFoeTeam?.(%0, %1)',
        'tbs_occuppied?': ['(this.rrTbsOccupied?.(%*) ?? false)', 'bool'], tbs_get_occupant: ['this.rrTbsGetOccupant?.()', 'actor'],
        switch_to_main_party: 'this.rrSwitchToMainParty?.()', switch_to_troops_party: 'this.rrSwitchToTroopsParty?.()'
    },
    // SceneManager.scene: the scene about to open if one is (a shop being prepared), else the current one.
    modules: {
        SceneManager: {
            scene: ['(SceneManager._nextScene || SceneManager._scene)', 'scene'],
            call: '((s) => s && SceneManager.push(s))(%0)', goto: '((s) => s && SceneManager.goto(s))(%0)',
            return: 'SceneManager.pop()', exit: 'SceneManager.exit()'
        }
    },
    objects: {
        scene: {
            cursor_move: '$?.cursorMove?.(%0, %1)', cursor_moveto: '$?.cursorMoveto?.(%0)', update_screen: '$?.updateScreen?.()',
            set_character: '$?.setCharacter?.(%*)', end_battle: '$?.endBattle?.(%0)', dispose_character: '$?.disposeCharacter?.(%0)',
            active_battler: '($?.activeBattler?.() ?? null)', tactics_all: '($?.tacticsAll?.() ?? [])', tactics_actors: '($?.tacticsActors?.() ?? [])',
            tactics_enemies: '($?.tacticsEnemies?.() ?? [])', prepare: '$?.prepare?.(%*)'
        }
    },
    members: {
        'actor.x': ['$.x', 'number'], 'actor.y': ['$.y', 'number'],
        'actor.knock_back': ['$.tbsKnockBack?.(%0)', 'any'], 'actor.can_occupy?': ['($.tbsCanOccupy?.(%0) ?? false)', 'bool'],
        'actor.maximize_state_counts': ['$.maximizeStateCounts?.(%0)', 'any'], 'actor.is_army?': ['($.isArmy?.() ?? false)', 'bool'],
        'actor.level_up': ['$.levelUp()', 'any'], 'actor.level_down': ['$.levelDown()', 'any'], 'actor.refresh': ['$.refresh()', 'any'],
        // The skills' damage formulas.
        'actor.tele_to_closest_loc': ['$.tbsTeleToClosestLoc?.(%0, %1)', 'any'], 'actor.flying_unit_effectiveness': ['$.tbsFlyingUnitEffectiveness()', 'number'],
        'actor.infantry_effectiveness': ['$.tbsInfantryEffectiveness()', 'number'], 'actor.terrain_def': ['$.tbsTerrainDef()', 'number'],
        'actor.terrain_eva': ['$.tbsTerrainEva()', 'number'], 'actor.atk_elements': ['$.attackElements()', 'array'],
        'actor.flying_unit': ['$.tbsFlyingUnit()', 'bool'], 'actor.tiles_moved': ['$.tilesMoved', 'number'],
        'actor.moved': ['$.moved', 'bool'], 'actor.perf_action': ['$.perfAction', 'bool']
    },
    setters: {
        'actor.moved': '$.moved = %v', 'actor.perf_action': '$.perfAction = %v', 'actor.tiles_moved': '$.tilesMoved = %v'
    }
});
