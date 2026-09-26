/*:
 * @target MZ
 * @plugindesc Yanfly Engine Ace - Death Common Events (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_DeathCommonEvents.js
 *
 * In battle, a battler that collapses runs its common event at once: the
 * action that killed it waits (the battle log stops) until the event and any
 * messages it shows are done, then carries on. The event comes from the note
 * tag <death event: x> on the enemy, or on the actor (else the actor's class).
 * An optional wipe-out event runs when the whole party falls; if it revives
 * anyone, the battle is not lost.
 *
 * A death event that kills another battler with a death event queues that
 * one after it (the original tried to run it inside the first and stopped
 * with an error). A Force Action in a death event acts at the next turn step
 * rather than inside the action that is waiting.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param wipeOutEvent
 * @text Party wipe-out common event
 * @type common_event
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_DeathCommonEvents');
    const WIPE_OUT = Number(params.wipeOutEvent) || 0;
    // Read line by line; a later tag wins.
    const TAG = /<(?:DEATH_EVENT|death event):[ ](\d+)>/i;
    const tagged = (obj) => {
        let id = 0;
        for (const line of String((obj && obj.note) || '').split(/[\r\n]+/)) {
            const m = TAG.exec(line);
            if (m) id = Number(m[1]);
        }
        return id;
    };

    Game_Battler.prototype.rrDeathEventId = function() { return 0; };
    Game_Actor.prototype.rrDeathEventId = function() { return tagged(this.actor()) || tagged(this.currentClass()); };
    Game_Enemy.prototype.rrDeathEventId = function() { return tagged(this.enemy()); };

    const inBattle = () => typeof Scene_Battle === 'function' && SceneManager._scene instanceof Scene_Battle;
    for (const cls of [Game_Actor, Game_Enemy]) {
        const _performCollapse = cls.prototype.performCollapse;
        cls.prototype.performCollapse = function() {
            _performCollapse.apply(this, arguments);
            if (inBattle()) BattleManager.rrProcessDeathEvent(this);
        };
    }

    BattleManager.rrProcessDeathEvent = function(target) {
        if (!target.isDead()) return;
        const id = target.rrDeathEventId();
        if (!id) return;
        $gameTemp.reserveCommonEvent(id);
        this._rrDeathEvent = true;
    };

    const _processDefeat = BattleManager.processDefeat;
    BattleManager.processDefeat = function() {
        if (inBattle() && WIPE_OUT > 0 && $gameParty.isAllDead()) {
            $gameTemp.reserveCommonEvent(WIPE_OUT);
            this._rrDeathEvent = true;
            this._rrAfterDeathEvent = () => { if ($gameParty.isAllDead()) _processDefeat.call(this); };
            return;
        }
        if (!$gameParty.isAllDead()) return;
        _processDefeat.call(this);
    };

    // While a death event runs, the battle runs only the troop's interpreter; the rest waits for it.
    const _update = BattleManager.update;
    BattleManager.update = function(timeActive) {
        if (this._rrDeathEvent) {
            this.rrUpdateDeathEvent();
            return;
        }
        _update.call(this, timeActive);
    };
    BattleManager.rrUpdateDeathEvent = function() {
        if (!SceneManager.isSceneChanging()) {
            if ($gameMessage.isBusy()) return;
            // With every enemy down, the collapses finish before the event goes on.
            if ($gameTroop.isAllDead() && this._spriteset && this._spriteset.isEffecting()) return;
            $gameTroop.updateInterpreter();
            if ($gameTroop.isEventRunning()) return;
            $gameTroop.setupBattleEvent();
            if ($gameTroop.isEventRunning()) return;
        }
        this._rrDeathEvent = false;
        const after = this._rrAfterDeathEvent;
        this._rrAfterDeathEvent = null;
        if (after) after();
    };

    const _updateWait = Window_BattleLog.prototype.updateWait;
    Window_BattleLog.prototype.updateWait = function() {
        return !!BattleManager._rrDeathEvent || _updateWait.call(this);
    };

    const _setup = BattleManager.setup;
    BattleManager.setup = function() {
        _setup.apply(this, arguments);
        this._rrDeathEvent = false;
        this._rrAfterDeathEvent = null;
    };
})();
