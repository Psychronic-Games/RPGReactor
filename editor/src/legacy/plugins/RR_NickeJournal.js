/*:
 * @target MZ
 * @plugindesc Nicke's Simple Journal (VX), on Reactor's quests
 * @author Nicke; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_NickeJournal.js
 *
 * The journal's quests were imported into Database › Quests (keys main-N and
 * side-N, the script's own numbering), and the game's calls drive them:
 * add_quest, complete_quest and fail_quest. Completing or failing a quest
 * that is in the journal counts it in a variable, as the script did. The
 * journal itself is Reactor's quest log.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script. Turning the plugin off leaves the calls doing nothing.
 *
 * @param completeVariable
 * @text Completed quests variable
 * @type variable
 * @default 0
 *
 * @param failVariable
 * @text Failed quests variable
 * @type variable
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_NickeJournal');
    const COUNT = { complete: Number(params.completeVariable || 0), fail: Number(params.failVariable || 0) };

    Game_Interpreter.prototype.rrNickeQuest = function(action, id, type) {
        if (typeof ReactorQuests === 'undefined' || !$gameSystem.quests) return;
        const quest = ReactorQuests.find(`${type}-${id}`);
        if (!quest) return;
        const quests = $gameSystem.quests();
        if (action === 'add') { quests.discover(quest.id); return; }
        // The script only moved a quest that was in the journal, and counted it.
        if (!quests.isActive(quest.id)) return;
        if (action === 'complete') quests.complete(quest.id);
        else if (action === 'fail') quests.fail(quest.id);
        else return;
        const variable = COUNT[action];
        if (variable > 0) $gameVariables.setValue(variable, $gameVariables.value(variable) + 1);
    };
})();
