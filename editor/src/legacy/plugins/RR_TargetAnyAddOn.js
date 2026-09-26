/*:
 * @target MZ
 * @plugindesc Target Any Add-On (VX Ace), for imported games
 * @author Racheal; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TargetAnyAddOn.js
 *
 * Skills and items that may be aimed at either side, set in their notes:
 *   <targets: any>       one enemy or one ally
 *   <targets: any all>   all enemies or all allies
 * Choosing the target starts on the side the database scope names. Down
 * while choosing an enemy moves the choice over to the party, Up while
 * choosing an actor moves it back to the enemies; with any other skill the
 * key only plays the cursor sound. The help window names "All Allies" or
 * "All Foes" for <targets: any all>.
 *
 * A battler using such a skill without choosing (an enemy) aims it at its
 * opponents, at the target -1 reads: the last opponent when alive.
 *
 * Needs RR_YanflyTargetManager and RR_YanflyBattleEngine.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const TM = window.RRTargetManager;
    const Scope = window.RRYanflyBattleScope;
    if (!TM || !Scope) return;
    const HELP = Object.assign({ allFoes: 'All Foes', allAllies: 'All Allies' }, (() => {
        try { return JSON.parse(PluginManager.parameters('RR_YanflyBattleEngine').helpTexts || '{}') || {}; } catch (_) { return {}; }
    })());

    const ANY = 'target_any', ANY_ALL = 'target_any_all';
    const forAny = (item) => !!item && item.scope === ANY;
    const forAnyAll = (item) => !!item && item.scope === ANY_ALL;
    const eitherSide = (item) => forAny(item) || forAnyAll(item);

    // Read after the Target Manager's notes: the side the item opens on is its scope before the tag.
    const readNotes = (item) => {
        if (!item || item._rrAnyNotes) return;
        item._rrAnyNotes = true;
        item._rrDefaultForFriend = Scope.forFriend(item);
        for (const line of String(item.note || '').split(/[\r\n]+/)) {
            const m = /<(?:TARGETS|target):[ ](.*)>/i.exec(line);
            if (!m) continue;
            if (/ANY ALL/i.test(m[1])) item.scope = ANY_ALL;
            else if (/ANY/i.test(m[1])) item.scope = ANY;
        }
    };
    const _isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_isDatabaseLoaded.call(this)) return false;
        for (const table of [$dataSkills, $dataItems]) {
            if (!table || table._rrAnyNotes) continue;
            table._rrAnyNotes = true;
            for (const item of table) readNotes(item);
        }
        return true;
    };
    const defaultForFriend = (item) => !!(item && item._rrDefaultForFriend);

    // Both sides answer for these scopes; any all is for all, any needs a choice. The Target Manager's
    // scope tests (the engine's and the battle windows') read these sets.
    const GA = Game_Action.prototype;
    for (const set of [TM.OPPONENT, TM.FRIEND]) { set.add(ANY); set.add(ANY_ALL); }
    TM.ALL.add(ANY_ALL);
    TM.SELECTION.add(ANY);

    //-------------------------------------------------------------------------
    // The action remembers which side was chosen
    //-------------------------------------------------------------------------
    const _clear = GA.clear;
    GA.clear = function() {
        _clear.call(this);
        this._rrAlly = false;
    };
    for (const name of ['setSkill', 'setItem']) {
        const base = GA[name];
        GA[name] = function(id) {
            base.call(this, id);
            this._rrAlly = defaultForFriend(this.item());
        };
    }
    GA.rrAlly = function() { return !!this._rrAlly; };
    GA.rrSetAlly = function(ally) { this._rrAlly = !!ally; };
    const _makeCustomTargets = GA.rrMakeCustomTargets;
    GA.rrMakeCustomTargets = function() {
        let list = _makeCustomTargets.call(this);
        const item = this.item();
        const unit = this._rrAlly ? this.friendsUnit() : this.opponentsUnit();
        if (forAny(item)) list = list.concat([TM.smoothTarget(unit, this._targetIndex)]);
        else if (forAnyAll(item)) TM.union(list, unit.aliveMembers());
        return list;
    };

    //-------------------------------------------------------------------------
    // Help: all allies or all foes, by the side chosen
    //-------------------------------------------------------------------------
    const inputAction = () => (BattleManager.actor() ? BattleManager.actor().inputtingAction() : null);
    const _refreshSpecialCase = Window_BattleHelp.prototype.rrRefreshSpecialCase;
    Window_BattleHelp.prototype.rrRefreshSpecialCase = function() {
        if (!forAnyAll($gameTemp._rrBattleAid)) return _refreshSpecialCase.call(this);
        const action = inputAction();
        const text = action && action._rrAlly ? HELP.allAllies : HELP.allFoes;
        if (text === this._text) return;
        this._text = text;
        this.contents.clear();
        this.resetFontSettings();
        this.drawText(text, 0, Math.floor(this.lineHeight() / 2), this.innerWidth, 'center');
    };

    //-------------------------------------------------------------------------
    // Up in the actor list, Down in the enemy list: the other side
    //-------------------------------------------------------------------------
    const sideKey = (key, symbol) => function() {
        if (!this.isOpenAndActive()) return;
        if (Input.isRepeated(key)) {
            SoundManager.playCursor();
            Input.update();
            this.deactivate();
            this.callHandler(symbol);
            return;
        }
        Window_Selectable.prototype.processHandling.call(this);
    };
    Window_BattleActor.prototype.processHandling = sideKey('up', 'dir8');
    Window_BattleEnemy.prototype.processHandling = sideKey('down', 'dir2');

    const SB = Scene_Battle.prototype;
    const _createActorWindow = SB.createActorWindow;
    SB.createActorWindow = function() {
        _createActorWindow.call(this);
        this._actorWindow.setHandler('dir8', this.rrOnTargetChange.bind(this));
    };
    const _createEnemyWindow = SB.createEnemyWindow;
    SB.createEnemyWindow = function() {
        _createEnemyWindow.call(this);
        this._enemyWindow.setHandler('dir2', this.rrOnTargetChange.bind(this));
    };
    const _onActorCancel = SB.onActorCancel;
    SB.onActorCancel = function() {
        _onActorCancel.call(this);
        if (this._actorCommandWindow.currentSymbol() === 'attack') {
            this._statusWindow.show();
            this._actorCommandWindow.activate();
            this._helpWindow.hide();
        }
    };
    // The skill and item choices replace the ones before them: an item that opens on the party goes there
    // first even though it may also be aimed at enemies.
    const chooseTarget = function(item, list) {
        if (defaultForFriend(item)) this.rrSelectActorSelection();
        else if (Scope.forOpponent(item)) this.rrSelectEnemySelection();
        else if (Scope.forFriend(item)) this.rrSelectActorSelection();
        else {
            list.hide();
            this.rrNextCommand();
            $gameTemp._rrBattleAid = null;
        }
    };
    SB.onSkillOk = function() {
        const skill = this._skillWindow.item();
        $gameTemp._rrBattleAid = skill;
        inputAction().setSkill(skill.id);
        BattleManager.actor().setLastBattleSkill(skill);
        chooseTarget.call(this, skill, this._skillWindow);
    };
    SB.onItemOk = function() {
        const item = this._itemWindow.item();
        $gameTemp._rrBattleAid = item;
        inputAction().setItem(item.id);
        chooseTarget.call(this, item, this._itemWindow);
        $gameParty.setLastItem(item);
    };
    SB.rrOnTargetChange = function() {
        if (!eitherSide($gameTemp._rrBattleAid)) {
            if (this._enemyWindow.visible) this._enemyWindow.activate();
            else this._actorWindow.activate();
            return;
        }
        if (this._enemyWindow.visible) {
            this._enemyWindow.hide();
            this.rrSelectActorSelection();
            inputAction()?.rrSetAlly(true);
        } else {
            this._actorWindow.hide();
            const symbol = this._actorCommandWindow.currentSymbol();
            if (symbol === 'attack') this._statusWindow.show();
            else if (symbol === 'skill') this._skillWindow.show();
            else if (symbol === 'item') this._itemWindow.show();
            this.rrSelectEnemySelection();
            inputAction()?.rrSetAlly(false);
        }
    };
})();
