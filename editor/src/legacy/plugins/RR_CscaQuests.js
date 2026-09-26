/*:
 * @target MZ
 * @plugindesc CSCA Quest System (VX Ace), for imported games
 * @author Casper Gaming; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_CscaQuests.js
 *
 * The game's CSCA quests are Reactor quests (Database › Quests, the quest log
 * in the menu); this plugin keeps the CSCA rules that drive them. A quest
 * moves through its steps: each advance completes the current objective and
 * shows the next, and advancing past the last completes the quest. A quest
 * that earns its rewards automatically pays them on completion and takes
 * them back if it fails.
 *
 * Script calls (the import writes them from the game's Ruby):
 *   this.rrCscaQuest("start" | "advance" | "complete" | "fail", key)
 *   this.rrCscaQuestProgress(key, n)       advance until the progress is n
 *   this.rrCscaQuestState(key, "complete" | "failed" | "started" | "progress")
 *
 * The original's quest_failed? read the completion list, so it is true for a
 * completed quest and false for a failed one; the game's events expect that.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param quests
 * @type multiline_string
 * @default []
 * @desc JSON: [{ key, steps, autoEarn, rewards: [{ type, id, amount }] }].
 *
 * @param showLevelUp
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_CscaQuests');
    let QUESTS = [];
    try { QUESTS = JSON.parse(params.quests || '[]') || []; } catch (_) { QUESTS = []; }
    const SHOW_LEVELUP = String(params.showLevelUp) !== 'false';
    const quest = (key) => QUESTS.find(q => q.key === String(key));

    const state = () => {
        const csca = $gameSystem.rrCsca ? $gameSystem.rrCsca() : ($gameSystem._rrCsca = $gameSystem._rrCsca || {});
        if (!csca.quests) csca.quests = {};
        if (!csca.questInfo) csca.questInfo = { completed: 0, failed: 0, list: {} };
        return csca;
    };
    const progressOf = (key) => {
        const s = state().quests;
        if (!s[key]) s[key] = { progress: 0, started: false, completed: false, failed: false };
        return s[key];
    };
    // The Reactor quest with the same key: discovered, its objectives following the progress.
    const reactor = (key) => (window.ReactorQuests && ReactorQuests.find ? ReactorQuests.find(String(key)) : null);
    const syncReactor = (key) => {
        const data = reactor(key), p = progressOf(key);
        if (!data || !$gameSystem.quests) return;
        const log = $gameSystem.quests();
        if (p.started || p.completed || p.failed) log.discover(data.id);
        const count = (data.objectives || []).length;
        for (let i = 0; i < count; i++) {
            if (p.completed || i < p.progress) log.setObjective(data.id, i, 'complete');
            else if (i === p.progress && p.started && !p.failed) log.setObjective(data.id, i, 'show');
            else log.setObjective(data.id, i, 'reset');
        }
        if (p.completed) log.complete(data.id);
        else if (p.failed) log.fail(data.id);
    };

    const pay = (q, sign) => {
        for (const r of q.rewards || []) {
            const amount = Number(r.amount) * sign;
            const table = { item: $dataItems, weapon: $dataWeapons, armor: $dataArmors }[r.type];
            if (table) $gameParty.gainItem(table[Number(r.id)], amount);
            else if (r.type === 'gold') $gameParty.gainGold(amount);
            else if (r.type === 'exp') for (const actor of $gameParty.members()) actor.changeExp(actor.currentExp() + amount, sign > 0 && SHOW_LEVELUP);
        }
    };

    const actions = {
        start(key) { progressOf(key).started = true; },
        advance(key) {
            const p = progressOf(key), q = quest(key);
            p.progress++;
            p.started = true;
            if (q && p.progress >= q.steps && !p.completed && !p.failed) actions.complete(key);
        },
        complete(key) {
            const p = progressOf(key), q = quest(key);
            if (p.completed || p.failed) return;
            p.completed = true;
            const info = state().questInfo;
            info.completed++;
            info.list[key] = true;
            if (q && q.autoEarn) pay(q, 1);
        },
        fail(key) {
            const p = progressOf(key), q = quest(key);
            if (p.completed || p.failed) return;
            p.failed = true;
            p.progress = 0;
            const info = state().questInfo;
            info.failed++;
            info.list[key] = false;
            if (q && q.autoEarn) pay(q, -1);
        }
    };

    Game_Interpreter.prototype.rrCscaQuest = function(action, key) {
        key = String(key);
        if (!actions[action]) return;
        actions[action](key);
        syncReactor(key);
    };
    Game_Interpreter.prototype.rrCscaQuestProgress = function(key, n) {
        key = String(key);
        const p = progressOf(key), q = quest(key);
        // The original advances until the progress matches; one below the current would loop forever, so it stops at the end.
        const limit = (q ? q.steps : 0) + Number(n) + 1;
        for (let i = 0; p.progress !== Number(n) && i < limit; i++) actions.advance(key);
        syncReactor(key);
    };
    Game_Interpreter.prototype.rrCscaQuestState = function(key, what) {
        key = String(key);
        const p = progressOf(key), list = state().questInfo.list;
        if (what === 'complete' || what === 'failed') return list[key];
        if (what === 'started') return p.started;
        return p.progress;
    };
})();
