/*:
 * @target MZ
 * @plugindesc Yanfly Engine Ace - Command Equip (VX Ace), for imported games
 * @author Yanfly (modified by Doogy); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyCommandEquip.js
 *
 * An Equip command in battle opens the equipment screen for the actor
 * choosing; closing it returns to the battle as it was, on the same command
 * (the screens cross-fade in 10 frames each way, the battle stays stopped
 * meanwhile). Actors cannot be switched on that screen. Changing anything
 * starts the cooldown: the command stays greyed out for that many turns.
 * The equipment types listed as fixed cannot be changed in battle.
 *
 * The command sits where the Battle Command List port's EQUIP puts it;
 * without that port it comes last.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param commandText
 * @default Equip
 *
 * @param cooldown
 * @text Turns before re-equipping
 * @type number
 * @default 0
 *
 * @param skipTurn
 * @text Equipping costs the turn
 * @type boolean
 * @default false
 *
 * @param fixedSlots
 * @text Types fixed in battle
 * @default []
 * @desc JSON list of equipment types as the original numbered them (0 = weapon).
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyCommandEquip');
    const json = (v, d) => { try { return v ? JSON.parse(v) ?? d : d; } catch (_) { return d; } };
    const TEXT = params.commandText === undefined ? 'Equip' : String(params.commandText);
    const COOLDOWN = Number(params.cooldown) || 0;
    const SKIP_TURN = String(params.skipTurn) === 'true';
    // Ace types count from 0 (weapon), the database's from 1.
    const FIXED = json(params.fixedSlots, []).map(n => Number(n) + 1);
    const TRANSITION = 10;

    //-------------------------------------------------------------------------
    // Cooldown
    //-------------------------------------------------------------------------
    const B = Game_Battler.prototype;
    B.rrResetEquipCooldown = function() { this._rrEquipCooldown = 0; };
    B.rrUpdateEquipCooldown = function() {
        if (this._rrEquipCooldown == null) this.rrResetEquipCooldown();
        this._rrEquipCooldown = Math.max(this._rrEquipCooldown - 1, 0);
    };
    B.rrBattleEquippable = function() {
        if (this._rrEquipCooldown == null) this.rrResetEquipCooldown();
        return this._rrEquipCooldown <= 0;
    };
    B.rrSetEquipCooldown = function() { this._rrEquipCooldown = COOLDOWN; };
    for (const [name, then] of [['onBattleStart', 'rrResetEquipCooldown'], ['onTurnEnd', 'rrUpdateEquipCooldown'], ['onBattleEnd', 'rrResetEquipCooldown']]) {
        const base = B[name];
        B[name] = function(...args) {
            base.apply(this, args);
            this[then]();
        };
    }

    // The fixed types are locked only while the battle's equipment screen is open.
    const _isEquipTypeLocked = Game_Actor.prototype.isEquipTypeLocked;
    Game_Actor.prototype.isEquipTypeLocked = function(etypeId) {
        return (this._rrBattleFixedEtypes || []).includes(etypeId) || _isEquipTypeLocked.call(this, etypeId);
    };

    //-------------------------------------------------------------------------
    // Windows
    //-------------------------------------------------------------------------
    // No switching actors on the equipment screen in battle.
    const _isHandled = Window_EquipCommand.prototype.isHandled;
    Window_EquipCommand.prototype.isHandled = function(symbol) {
        if ((symbol === 'pageup' || symbol === 'pagedown') && $gameParty.inBattle()) return false;
        return _isHandled.call(this, symbol);
    };
    const _needsPageButtons = Scene_Equip.prototype.needsPageButtons;
    Scene_Equip.prototype.needsPageButtons = function() {
        return $gameParty.inBattle() ? false : _needsPageButtons.call(this);
    };

    const W = Window_ActorCommand.prototype;
    W.rrAddEquipCommand = function() {
        this.addCommand(TEXT, 'equip', this._actor.rrBattleEquippable());
    };
    // Without the Battle Command List port the command comes after the others.
    if (!W.rrBattleCommandList) {
        const _makeCommandList = W.makeCommandList;
        W.makeCommandList = function() {
            _makeCommandList.call(this);
            if (this._actor && !this.rrBattleCommandList) this.rrAddEquipCommand();
        };
    }

    //-------------------------------------------------------------------------
    // Transitions: the frozen last frame of one screen over the next, fading
    // out in 10 frames while nothing else on the screen runs
    //-------------------------------------------------------------------------
    const startTransition = (scene, bitmap, done) => {
        const sprite = new Sprite(bitmap);
        scene.addChild(sprite);
        scene._rrTransition = { sprite, frames: TRANSITION, done };
    };
    /** One frame of the scene's transition; false when none is running. */
    const stepTransition = (scene) => {
        const t = scene._rrTransition;
        if (!t) return false;
        t.frames--;
        t.sprite.opacity = Math.round(255 * t.frames / TRANSITION);
        if (t.frames > 0) return true;
        scene._rrTransition = null;
        scene.removeChild(t.sprite);
        t.sprite.bitmap.destroy();
        if (t.done) t.done();
        return true;
    };

    //-------------------------------------------------------------------------
    // Scene_Battle: the equipment screen runs in its place, then the battle
    // carries on from where it stopped
    //-------------------------------------------------------------------------
    const SB = Scene_Battle.prototype;
    const _createActorCommandWindow = SB.createActorCommandWindow;
    SB.createActorCommandWindow = function() {
        _createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler('equip', this.rrCommandEquip.bind(this));
    };
    // The screen changes once this frame's battle update has finished.
    SB.rrCommandEquip = function() { this._rrEquipPending = true; };
    const _update = SB.update;
    SB.update = function() {
        if (stepTransition(this)) return;
        _update.call(this);
        if (this._rrEquipPending) {
            this._rrEquipPending = false;
            this.rrOpenBattleEquip();
        }
    };
    // The windows along the bottom are left out of the equipment screen's background.
    SB.rrInfoWindows = function() {
        return [this._statusWindow, this._partyCommandWindow, this._actorCommandWindow, this._statusAidWindow].filter(Boolean);
    };
    SB.rrOpenBattleEquip = function() {
        const actor = $gameParty.battleMembers()[this._statusWindow.index()];
        if (!actor) return this._actorCommandWindow.activate();
        const frozen = SceneManager.snap();
        const info = this.rrInfoWindows(), shown = info.map(w => w.visible);
        for (const w of info) w.visible = false;
        SceneManager.snapForBackground();
        info.forEach((w, i) => { w.visible = shown[i]; });
        actor._rrBattleFixedEtypes = FIXED.filter(etypeId => !actor.isEquipTypeLocked(etypeId));
        $gameParty.setMenuActor(actor);
        const w = this._actorCommandWindow;
        this._rrEquipReturn = { actor, previous: actor.equips().slice(), index: w.index(), scrollY: w.scrollY() };
        const scene = new Scene_Equip();
        scene._rrBattleScene = this;
        scene._rrFrozen = frozen;
        SceneManager._scene = scene;
        scene.create();
        SceneManager.onSceneCreate();
    };
    SB.rrCloseBattleEquip = function(frozen) {
        const r = this._rrEquipReturn;
        this._rrEquipReturn = null;
        const actor = r.actor, now = actor.equips();
        if (now.length !== r.previous.length || now.some((e, i) => e !== r.previous[i])) actor.rrSetEquipCooldown();
        this._statusWindow.refresh();
        const w = this._actorCommandWindow;
        w.setup(actor);
        w.select(r.index);
        w.scrollTo(w.scrollX(), r.scrollY);
        actor._rrBattleFixedEtypes = null;
        startTransition(this, frozen, () => {
            if (SKIP_TURN) this.rrNextCommand ? this.rrNextCommand() : this.selectNextCommand();
        });
    };

    // The screen comes in under the frozen battle before its windows arrive (Special Window Effects waits
    // while a scene fades); leaving, their exit runs first, then the battle comes back under the last frame.
    const E = Scene_Equip.prototype;
    const _start = E.start;
    E.start = function() {
        _start.call(this);
        if (this._rrFrozen) { startTransition(this, this._rrFrozen); this._rrFrozen = null; }
    };
    const _isFading = E.isFading;
    E.isFading = function() { return !!this._rrTransition || _isFading.call(this); };
    const _popScene = E.popScene;
    E.popScene = function() {
        if (this._rrBattleScene) this._rrLeaving = true;
        else _popScene.call(this);
    };
    const _equipUpdate = E.update;
    E.update = function() {
        if (stepTransition(this)) return;
        if (!this._rrLeaving) _equipUpdate.call(this);
        if (this._rrLeaving && !SceneManager.isCurrentSceneBusy()) this.rrReturnToBattle();
    };
    E.rrReturnToBattle = function() {
        const battle = this._rrBattleScene, frozen = SceneManager.snap();
        this._rrBattleScene = null;
        this._rrLeaving = false;
        this.stop();
        this.terminate();
        SceneManager._scene = battle;
        Graphics.setStage(battle);
        this.destroy();
        battle.rrCloseBattleEquip(frozen);
    };
})();
