/*:
 * @target MZ
 * @plugindesc Ace Battle Engine (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyBattleEngine.js
 *
 * The battle screen of Yanfly's Ace Battle Engine:
 *   - Battles open straight on the first actor's commands; the party
 *     commands (Fight, Escape) come up only when the player cancels out of
 *     them. Left cancels in the actor commands, Right goes on.
 *   - The status strip has a column per party slot: the face, the name with
 *     the chosen action's icon, states, HP and MP (or TP) gauges with their
 *     current values.
 *   - Skills and items open over the status strip, beside a small window
 *     showing the actor who chooses. Targets are chosen on the field: the
 *     help window at the top names the target with its states, or says
 *     "All Foes", "2 Random Foes" … for the scopes that hit several.
 *   - Damage, healing, misses, element weaknesses, states and buffs pop up
 *     over the battlers.
 *   - Enemies play their attack animations (<atk ani 1: n>, <atk ani 2: n>
 *     in the enemy's note), flash white as they start acting, and each
 *     message of the battle log can be switched off.
 *   - Skills and items with <one animation> play their animation once
 *     however many times they hit; <popup add: RULE>, <popup rem: RULE>,
 *     <popup dur: RULE> and <popup hide add|rem|dur> in a state's note choose
 *     its popups.
 *   - In test play F5 recovers the party, F6 leaves it at 1 HP and 0 MP and
 *     TP, F7 fills TP and F8 defeats the enemies. (F5 and F8 also reload the
 *     game and open the developer tools in Reactor's test play.)
 *
 * The battle system is chosen here: the default below, or an event's
 *   $gameSystem.rrSetBattleSystem('catb')
 * 'catb' runs the Classical ATB port when it is installed; anything else is
 * the turn-based system. Turning the plugin off gives the database's.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param battleSystem
 * @default dtb
 *
 * @param blink
 * @text Battlers blink when hit
 * @type boolean
 * @default true
 *
 * @param flashWhite
 * @text Enemies flash white as they act
 * @type boolean
 * @default true
 *
 * @param screenShake
 * @text Screen shakes when an actor is hit
 * @type boolean
 * @default false
 *
 * @param skipPartyCommand
 * @type boolean
 * @default true
 *
 * @param autoFast
 * @text Battle log waits half as long
 * @type boolean
 * @default true
 *
 * @param enemyAttackAnimation
 * @type animation
 * @default 0
 *
 * @param hidePopupSwitch
 * @type switch
 * @default 0
 *
 * @param nameFontSize
 * @type number
 * @default 20
 *
 * @param textFontSize
 * @type number
 * @default 16
 *
 * @param noActionIcon
 * @type number
 * @default 185
 *
 * @param hpGaugeYPlus
 * @type number
 * @min -99
 * @default 11
 *
 * @param centerFaces
 * @type boolean
 * @default false
 *
 * @param helpTexts
 * @type multiline_string
 * @default {}
 *
 * @param enablePopups
 * @type boolean
 * @default true
 *
 * @param flashCritical
 * @type boolean
 * @default true
 *
 * @param popupSettings
 * @type multiline_string
 * @default
 *
 * @param popupRules
 * @type multiline_string
 * @default
 * @desc JSON: rule → [zoom from, zoom to, size, bold, italic, red, green, blue, [fonts]].
 *
 * @param messages
 * @type multiline_string
 * @default {}
 *
 * @param rgssFontSize
 * @text The game's Font.default_size
 * @type number
 * @default 24
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyBattleEngine');
    const bool = (v, d) => (v === undefined || v === '' ? d : String(v) === 'true');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const json = (v, d) => { try { return v ? JSON.parse(v) || d : d; } catch (_) { return d; } };

    const BLINK = bool(params.blink, true), FLASH_WHITE = bool(params.flashWhite, true), SCREEN_SHAKE = bool(params.screenShake, false);
    const SKIP_PARTY = bool(params.skipPartyCommand, true), AUTO_FAST = bool(params.autoFast, true);
    const ENEMY_ATK_ANI = num(params.enemyAttackAnimation, 0), HIDE_POPUP_SWITCH = num(params.hidePopupSwitch, 0);
    const BATTLE_SYSTEM = String(params.battleSystem || 'dtb').replace(/^:/, '');
    const NAME_SIZE = num(params.nameFontSize, 20), TEXT_SIZE = num(params.textFontSize, 16);
    const NO_ACTION_ICON = num(params.noActionIcon, 185), HPGAUGE_Y_PLUS = num(params.hpGaugeYPlus, 11), CENTER_FACES = bool(params.centerFaces, false);
    const HELP = Object.assign({ allFoes: 'All Foes', oneRandomFoe: 'One Random Foe', manyRandomFoes: '%d Random Foes', allAllies: 'All Allies',
        allDeadAllies: 'All Dead Allies', oneRandomAlly: 'One Random Ally', randomAllies: '%d Random Allies' }, json(params.helpTexts, {}));
    const ENABLE_POPUPS = bool(params.enablePopups, true), FLASH_CRITICAL = bool(params.flashCritical, true);
    const SETTINGS = Object.assign({ fade: 12, full: 60, hp_dmg: '-%s ', hp_heal: '+%s ', mp_dmg: '-%s MP', mp_heal: '+%s MP', tp_dmg: '-%s TP', tp_heal: '+%s TP',
        drained: 'DRAIN', missed: 'MISS', evaded: 'EVADE', nulled: 'NULL', failed: 'FAILED', add_state: '+%s', rem_state: '-%s', dur_state: '%s',
        weakpoint: 'WEAKPOINT', resistant: 'RESIST', immune: 'IMMUNE', absorbed: 'ABSORB', add_buff: '%s↑', add_debuff: '%s↓' }, json(params.popupSettings, {}));
    const RULE = (r, g, b, zoom = [0.7, 1.0]) => [zoom[0], zoom[1], 24, true, false, r, g, b, ['Arial']];
    const RULES = Object.assign({ DEFAULT: RULE(255, 255, 255), CRITICAL: RULE(255, 80, 80) }, json(params.popupRules, {}));
    const MSG = Object.assign({ enemyAppears: false }, json(params.messages, {}));
    const msg = (key) => MSG[key] !== false;
    const RGSS_SIZE = num(params.rgssFontSize, 24) || 24;
    const px = (size) => $gameSystem.mainFontSize() * size / RGSS_SIZE;

    // Ruby reads a negative index from the end of an array.
    const rubyAt = (array, index) => (index < 0 ? array[array.length + index] : array[index]);
    const fmt = (format, value) => String(format).replace(/%[sd]/, value);
    const group = (value) => (Window_Base.prototype.rrAceGroup ? Window_Base.prototype.rrAceGroup(value) : String(value));
    const inBattle = () => SceneManager._scene instanceof Scene_Battle;
    const battleScene = () => (inBattle() ? SceneManager._scene : null);

    // VX Ace's scope tests on an item (scopes 12-14 are MZ's and read as their nearest Ace kind).
    const scopeOf = (item) => (item ? item.scope : 0);
    const Scope = {
        forOpponent: (item) => [1, 2, 3, 4, 5, 6].includes(scopeOf(item)),
        forFriend: (item) => [7, 8, 9, 10, 11, 12, 13].includes(scopeOf(item)),
        forDeadFriend: (item) => [9, 10].includes(scopeOf(item)),
        forUser: (item) => scopeOf(item) === 11,
        forRandom: (item) => [3, 4, 5, 6].includes(scopeOf(item)),
        forAll: (item) => [2, 8, 10, 13, 14].includes(scopeOf(item)),
        needSelection: (item) => [1, 7, 9, 12].includes(scopeOf(item)),
        numberOfTargets: (item) => (Scope.forRandom(item) ? scopeOf(item) - 2 : 0)
    };
    window.RRYanflyBattleScope = Scope;

    //-------------------------------------------------------------------------
    // Note tags (read once per database object)
    //-------------------------------------------------------------------------
    const lines = (obj) => String((obj && obj.note) || '').split(/[\r\n]+/);
    const oneAnimation = (item) => {
        if (!item) return false;
        if (item._rrOneAnimation === undefined) item._rrOneAnimation = lines(item).some(l => /<(?:ONE_ANIMATION|one animation)>/i.test(l));
        return item._rrOneAnimation;
    };
    const enemyAttackAnimations = (enemy) => {
        if (!enemy._rrAtkAni) {
            let a1 = ENEMY_ATK_ANI, a2 = 0;
            for (const line of lines(enemy)) {
                let m;
                if ((m = /<(?:ATK_ANI_1|atk ani 1):[ ]*(\d+)>/i.exec(line))) a1 = Number(m[1]);
                else if ((m = /<(?:ATK_ANI_2|atk ani 2):[ ]*(\d+)>/i.exec(line))) a2 = Number(m[1]);
            }
            enemy._rrAtkAni = [a1, a2];
        }
        return enemy._rrAtkAni;
    };
    const statePopupRules = (state) => {
        if (!state._rrPopupRules) {
            const rules = { add_state: 'ADDSTATE', rem_state: 'REMSTATE', dur_state: null };
            for (const line of lines(state)) {
                let m;
                if ((m = /<(?:POPUP_ADD_RULE|popup add rule|popup add):[ ](.*)>/i.exec(line))) rules.add_state = m[1].toUpperCase();
                else if ((m = /<(?:POPUP_REM_RULE|popup rem rule|popup rem):[ ](.*)>/i.exec(line))) rules.rem_state = m[1].toUpperCase();
                else if ((m = /<(?:POPUP_DUR_RULE|popup dur rule|popup dur):[ ](.*)>/i.exec(line))) rules.dur_state = m[1].toUpperCase();
                else if (/<(?:POPUP_HIDE_ADD|popup hide add|hide add)>/i.test(line)) rules.add_state = null;
                else if (/<(?:POPUP_HIDE_REM|popup hide rem|hide rem)>/i.test(line)) rules.rem_state = null;
                else if (/<(?:POPUP_HIDE_DUR|popup hide dur|hide dur)>/i.test(line)) rules.dur_state = null;
            }
            state._rrPopupRules = rules;
        }
        return state._rrPopupRules;
    };

    //-------------------------------------------------------------------------
    // Battle system
    //-------------------------------------------------------------------------
    // Only the turn-based system is known here; the Classical ATB port adds 'catb'.
    Game_System.prototype.rrBattleSystemCorrected = function() { return 'dtb'; };
    Game_System.prototype.rrBattleSystem = function() {
        return this.rrBattleSystemCorrected(this._rrBattleSystem == null ? BATTLE_SYSTEM : this._rrBattleSystem);
    };
    Game_System.prototype.rrSetBattleSystem = function(type) {
        this._rrBattleSystem = this.rrBattleSystemCorrected(String(type).replace(/^:/, ''));
    };
    BattleManager.rrInitBattleType = function() { this._rrBattleType = $gameSystem.rrBattleSystem(); };
    BattleManager.rrBtype = function(type) { return this._rrBattleType === String(type).replace(/^:/, ''); };
    // The turn-based system chosen here overrides the database's time progress setting.
    const _isTpb = BattleManager.isTpb;
    BattleManager.isTpb = function() {
        if ($gameParty.inBattle() && this._rrBattleType === 'dtb') return false;
        return _isTpb.call(this);
    };
    const _isActiveTpb = BattleManager.isActiveTpb;
    BattleManager.isActiveTpb = function() {
        if ($gameParty.inBattle() && this._rrBattleType === 'dtb') return false;
        return _isActiveTpb.call(this);
    };
    const _createSpriteset = Scene_Battle.prototype.createSpriteset;
    Scene_Battle.prototype.createSpriteset = function() {
        BattleManager.rrInitBattleType();
        _createSpriteset.call(this);
    };

    // Enemies' names and the preemptive/surprise lines only when the game kept that message.
    const _displayStartMessages = BattleManager.displayStartMessages;
    BattleManager.displayStartMessages = function() {
        if (msg('enemyAppears')) _displayStartMessages.call(this);
    };

    // Action speed is AGI plus the item's speed (and the attack speed for attacks), with no random part.
    Game_Action.prototype.speed = function() {
        const subject = this.subject(), item = this.item();
        let speed = subject.agi;
        if (item) speed += item.speed;
        if (this.isAttack()) speed += subject.attackSpeed();
        return speed;
    };

    //-------------------------------------------------------------------------
    // Popups
    //-------------------------------------------------------------------------
    Game_ActionResult.prototype.rrClearStoredDamage = function() {
        this._rrStored = { hp: 0, mp: 0, tp: 0, hpDrain: 0, mpDrain: 0 };
    };
    const _resultClear = Game_ActionResult.prototype.clear;
    Game_ActionResult.prototype.clear = function() {
        _resultClear.call(this);
        this._rrHpDrain = 0;
        this._rrMpDrain = 0;
        this.rrClearStoredDamage();
    };
    Game_ActionResult.prototype.rrStoreDamage = function() {
        if (!this._rrStored) this.rrClearStoredDamage();
        const s = this._rrStored;
        s.hp += this.hpDamage; s.mp += this.mpDamage; s.tp += this.tpDamage;
        s.hpDrain += this._rrHpDrain || 0; s.mpDrain += this._rrMpDrain || 0;
    };
    Game_ActionResult.prototype.rrRestoreDamage = function() {
        if (!this._rrStored) this.rrClearStoredDamage();
        const s = this._rrStored;
        this.hpDamage = s.hp; this.mpDamage = s.mp; this.tpDamage = s.tp;
        this._rrHpDrain = s.hpDrain; this._rrMpDrain = s.mpDrain;
        this.rrClearStoredDamage();
    };
    Game_ActionResult.prototype.rrClearDamageValues = function() {
        this.hpDamage = 0; this.mpDamage = 0; this.tpDamage = 0;
        this._rrHpDrain = 0; this._rrMpDrain = 0;
    };

    Object.assign(Game_BattlerBase.prototype, {
        rrCreatePopup(value, rules = 'DEFAULT', flags = []) {
            if (!inBattle() || !ENABLE_POPUPS) return;
            if (HIDE_POPUP_SWITCH > 0 && $gameSwitches.value(HIDE_POPUP_SWITCH)) return;
            (this._rrPopups = this._rrPopups || []).push([value, rules, flags]);
        },
        rrMakeDamagePopups(user) {
            const r = this.result();
            const drain = (amount, heal, dmg) => {
                user.rrCreatePopup(SETTINGS.drained, 'DRAIN');
                // MP drains pop up in the HP colours.
                user.rrCreatePopup(fmt(SETTINGS[amount > 0 ? heal : dmg], group(Math.abs(amount))), amount > 0 ? 'HP_HEAL' : 'HP_DMG');
            };
            if (r._rrHpDrain) drain(r._rrHpDrain, 'hp_heal', 'hp_dmg');
            if (r._rrMpDrain) drain(r._rrMpDrain, 'mp_heal', 'mp_dmg');
            const flags = r.critical ? ['critical'] : [];
            const damage = (value, key, flagged) => {
                if (!value) return;
                const hurt = value > 0;
                this.rrCreatePopup(fmt(SETTINGS[key + (hurt ? '_dmg' : '_heal')], group(Math.abs(value))), key.toUpperCase() + (hurt ? '_DMG' : '_HEAL'), flagged ? flags : []);
            };
            damage(r.hpDamage, 'hp', true);
            damage(r.mpDamage, 'mp', true);
            damage(r.tpDamage, 'tp', false);
            r.rrStoreDamage();
            r.rrClearDamageValues();
        },
        rrMakeMissPopups(user, item) {
            if (this.isDead()) return;
            const r = this.result();
            if (r.missed) this.rrCreatePopup(SETTINGS.missed, 'DEFAULT');
            if (r.evaded) this.rrCreatePopup(SETTINGS.evaded, 'DEFAULT');
            if (r.isHit() && !r.success) this.rrCreatePopup(SETTINGS.failed, 'DEFAULT');
            if (r.isHit() && item && [1, 3, 5].includes(item.damage.type) && r.hpDamage === 0) this.rrCreatePopup(SETTINGS.nulled, 'DEFAULT');
        },
        rrMakeRatePopup(rate) {
            if (rate === 1) return;
            let text, rules, flag;
            if (rate > 1) [text, rules, flag] = [SETTINGS.weakpoint, 'WEAK_ELE', 'weakness'];
            else if (rate === 0) [text, rules, flag] = [SETTINGS.immune, 'IMMU_ELE', 'immune'];
            else if (rate < 0) [text, rules, flag] = [SETTINGS.absorbed, 'ABSB_ELE', 'absorbed'];
            else [text, rules, flag] = [SETTINGS.resistant, 'REST_ELE', 'resistant'];
            this.rrCreatePopup(text, rules, [flag]);
        },
        rrMakeStatePopup(stateId, type) {
            const state = $dataStates[stateId];
            if (!state || state.iconIndex === 0) return;
            const rules = statePopupRules(state)[type];
            if (rules == null) return;
            this.rrCreatePopup(fmt(SETTINGS[type], state.name), rules, ['state', state.iconIndex]);
        },
        rrMakeDuringStatePopup() {
            const state = this.states().find(s => s.message3);
            if (state) this.rrMakeStatePopup(state.id, 'dur_state');
        },
        rrMakeBuffPopup(paramId, positive) {
            if (!inBattle() || !this.isAlive()) return;
            const text = fmt(SETTINGS[positive ? 'add_buff' : 'add_debuff'], TextManager.param(paramId));
            const rules = positive ? 'BUFF' : 'DEBUFF';
            const flags = ['buff', this.buffIconIndex(positive ? 1 : -1, paramId)];
            const key = JSON.stringify([text, rules, flags]);
            if ((this._rrPopups || []).some(p => JSON.stringify(p) === key)) return;
            this.rrCreatePopup(text, rules, flags);
        }
    });

    const _eraseState = Game_BattlerBase.prototype.eraseState;
    Game_BattlerBase.prototype.eraseState = function(stateId) {
        if (this._states.includes(stateId)) this.rrMakeStatePopup(stateId, 'rem_state');
        _eraseState.call(this, stateId);
    };
    const _addNewState = Game_Battler.prototype.addNewState;
    Game_Battler.prototype.addNewState = function(stateId) {
        _addNewState.call(this, stateId);
        if (this._states.includes(stateId)) this.rrMakeStatePopup(stateId, 'add_state');
    };
    const _addBuff = Game_Battler.prototype.addBuff;
    Game_Battler.prototype.addBuff = function(paramId, turns) {
        this.rrMakeBuffPopup(paramId, true);
        _addBuff.call(this, paramId, turns);
    };
    const _addDebuff = Game_Battler.prototype.addDebuff;
    Game_Battler.prototype.addDebuff = function(paramId, turns) {
        this.rrMakeBuffPopup(paramId, false);
        _addDebuff.call(this, paramId, turns);
    };
    const _regenerateAll = Game_Battler.prototype.regenerateAll;
    Game_Battler.prototype.regenerateAll = function() {
        _regenerateAll.call(this);
        if (this.isAlive()) this.rrMakeDamagePopups(this);
    };
    const _onBattleEnd = Game_Battler.prototype.onBattleEnd;
    Game_Battler.prototype.onBattleEnd = function() {
        _onBattleEnd.call(this);
        this._rrPopups = [];
    };
    // The popups replace MZ's damage numbers.
    Game_Battler.prototype.startDamagePopup = function() {};

    const _evaluateWithTarget = Game_Action.prototype.evaluateWithTarget;
    Game_Action.prototype.evaluateWithTarget = function(target) {
        $gameTemp._rrEvaluating = true;
        try { return _evaluateWithTarget.call(this, target); } finally { $gameTemp._rrEvaluating = false; }
    };
    const _makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        const value = _makeDamageValue.call(this, target, critical);
        if (!$gameTemp._rrEvaluating) target.rrMakeRatePopup(this.calcElementRate(target));
        return value;
    };
    const _executeHpDamage = Game_Action.prototype.executeHpDamage;
    Game_Action.prototype.executeHpDamage = function(target, value) {
        _executeHpDamage.call(this, target, value);
        if (this.isDrain()) target.result()._rrHpDrain = target.result().hpDamage;
    };
    const _executeMpDamage = Game_Action.prototype.executeMpDamage;
    Game_Action.prototype.executeMpDamage = function(target, value) {
        _executeMpDamage.call(this, target, value);
        if (this.isDrain()) target.result()._rrMpDrain = target.result().mpDamage;
    };
    const _executeDamage = Game_Action.prototype.executeDamage;
    Game_Action.prototype.executeDamage = function(target, value) {
        _executeDamage.call(this, target, value);
        target.rrMakeDamagePopups(this.subject());
    };
    for (const name of ['itemEffectRecoverHp', 'itemEffectRecoverMp', 'itemEffectGainTp']) {
        const base = Game_Action.prototype[name];
        Game_Action.prototype[name] = function(target, effect) {
            base.call(this, target, effect);
            target.rrMakeDamagePopups(this.subject());
        };
    }
    const _applyItemUserEffect = Game_Action.prototype.applyItemUserEffect;
    Game_Action.prototype.applyItemUserEffect = function(target) {
        _applyItemUserEffect.call(this, target);
        target.result().rrRestoreDamage();
    };
    const _apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _apply.call(this, target);
        target.rrMakeMissPopups(this.subject(), this.item());
    };

    // Where a battler's popups start: the middle of an enemy, the top of an actor.
    Sprite_Battler.prototype.rrScreenX = function() { return (this.parent ? this.parent.x : 0) + this._homeX; };
    Sprite_Battler.prototype.rrScreenY = function() { return (this.parent ? this.parent.y : 0) + this._homeY; };
    Sprite_Battler.prototype.rrPopupOy = function() {
        const s = this.mainSprite();
        return s && s.bitmap && s._frame ? s._frame.height : 0;
    };

    function Sprite_RRPopup() { this.initialize(...arguments); }
    Sprite_RRPopup.prototype = Object.create(Sprite.prototype);
    Sprite_RRPopup.prototype.constructor = Sprite_RRPopup;
    window.Sprite_RRPopup = Sprite_RRPopup;
    Sprite_RRPopup.prototype.initialize = function(battlerSprite, value, rules, flags) {
        Sprite.prototype.initialize.call(this);
        this._value = String(value);
        this._rule = RULES[rules] || window.RRYanflyElementalPopups?.rules?.[rules] || RULES.DEFAULT;
        this._fade = Number(SETTINGS.fade) || 0;
        this._full = Number(SETTINGS.full) || 0;
        this.flags = flags;
        this._battlerSprite = battlerSprite;
        this.createPopupBitmap();
    };
    Sprite_RRPopup.prototype.createPopupBitmap = function() {
        const rule = this._rule, flags = this.flags;
        const state = flags.includes('state'), critical = flags.includes('critical');
        const bw = Graphics.width + (state ? 48 : 0), bh = RGSS_SIZE * 3;
        const bitmap = new Bitmap(bw, bh);
        bitmap.fontFace = [].concat(rule[8] || []).concat($gameSystem.mainFontFace()).join(', ');
        bitmap.fontSize = px(critical ? rule[2] * 1.2 : rule[2]);
        bitmap.fontBold = !!rule[3];
        bitmap.fontItalic = !!rule[4];
        const crit = RULES.CRITICAL || rule;
        bitmap.outlineColor = critical ? `rgba(${crit[5]},${crit[6]},${crit[7]},1)` : 'rgba(0,0,0,1)';
        const dx = state ? 24 : 0, dw = dx;
        if (state || flags.includes('buff')) {
            const icon = flags.find(f => typeof f === 'number') || 0;
            const width = Math.floor(bitmap.measureTextWidth(this._value));
            const pw = ImageManager.iconWidth, ph = ImageManager.iconHeight;
            bitmap.blt(ImageManager.loadSystem('IconSet'), (icon % 16) * pw, Math.floor(icon / 16) * ph, pw, ph, dx + Math.floor((bw - width) / 2) - 36, Math.floor((bh - 24) / 2));
        }
        bitmap.textColor = `rgb(${rule[5]},${rule[6]},${rule[7]})`;
        bitmap.drawText(this._value, dx, 0, bw - dw, bh, 'center');
        this.bitmap = bitmap;
        const sprite = this._battlerSprite, battler = sprite._battler;
        this.x = sprite.rrScreenX();
        if ((sprite._rrPopups || []).length >= 1) this.x += Math.randomInt(4) - Math.randomInt(4);
        const oy = sprite.rrPopupOy();
        this.y = sprite.rrScreenY() - Math.floor(oy / 2);
        if (battler.isActor()) this.y -= Math.floor(oy / 2);
        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
        const zoom = flags.includes('no zoom') ? rule[1] : rule[0];
        this.scale.x = this.scale.y = zoom;
        this._targetZoom = rule[1];
        this._zoomUp = zoom <= this._targetZoom;
        this._hue = 0;
    };
    Sprite_RRPopup.prototype.update = function() {
        Sprite.prototype.update.call(this);
        if (this.flags.includes('critical') && FLASH_CRITICAL) {
            if (!this._hueDuration) this._hueDuration = 2;
            this._hueDuration--;
            if (this._hueDuration <= 0) this.setHue((this._hue = (this._hue + 15) % 360));
        }
        const z = this.scale.x;
        this.scale.x = this.scale.y = this._zoomUp ? Math.min(z + 0.075, this._targetZoom) : Math.max(z - 0.075, this._targetZoom);
        this._full--;
        if (this._full > 0) return;
        this.y -= 1;
        this.opacity -= this._fade;
    };

    Sprite_Battler.prototype.rrSetupPopups = function() {
        const battler = this._battler;
        if (!battler.isEnemy() && !battler.isActor()) return;
        battler._rrPopups = battler._rrPopups || [];
        if (!battler._rrPopups.length) return;
        const [value, rules, flags] = battler._rrPopups.shift();
        this.rrCreateNewPopup(value, rules, flags);
    };
    Sprite_Battler.prototype.rrCreateNewPopup = function(value, rules, flags) {
        this._rrPopups = this._rrPopups || [];
        this._rrPopupFlags = this._rrPopupFlags || [];
        if (flags.some(f => this._rrPopupFlags.includes(f))) return;
        for (const popup of this._rrPopups) popup.y -= 24;
        const scene = battleScene();
        if (!scene || !scene._rrPopupLayer) return;
        const popup = new Sprite_RRPopup(this, value, rules, flags);
        scene._rrPopupLayer.addChild(popup);
        this._rrPopups.push(popup);
        for (const f of ['weakness', 'resistant', 'immune', 'absorbed']) if (flags.includes(f)) this._rrPopupFlags.push(f);
    };
    Sprite_Battler.prototype.rrUpdatePopups = function() {
        const popups = this._rrPopups || [];
        // A spent popup is dropped where it stands, so the one after it waits a frame.
        for (let i = 0; i < popups.length; i++) {
            const popup = popups[i];
            popup.update();
            if (popup.opacity > 0) continue;
            popups.splice(i, 1);
            if (popup.parent) popup.parent.removeChild(popup);
            popup.bitmap.destroy();
            popup.destroy();
        }
        if (!popups.length) this._rrPopupFlags = [];
        if (!inBattle()) return;
        if (this._rrActiveSubject !== BattleManager._subject) {
            this._rrActiveSubject = BattleManager._subject;
            this._rrPopupFlags = [];
        }
    };
    const _spriteBattlerUpdate = Sprite_Battler.prototype.update;
    Sprite_Battler.prototype.update = function() {
        _spriteBattlerUpdate.call(this);
        if (this._battler) this.rrSetupPopups();
        this.rrUpdatePopups();
    };

    //-------------------------------------------------------------------------
    // Actors on the field: without side view they stand over their status
    // columns, where their animations and popups play
    //-------------------------------------------------------------------------
    Game_Actor.prototype.rrScreenX = function() {
        const scene = battleScene(), status = scene && scene._statusWindow;
        if (!status) return 0;
        const width = Math.floor((status.width - 24) / $gameParty.maxBattleMembers());
        const rect = status.itemRect(this.index());
        return 128 + 12 + rect.x + Math.floor(width / 2) - (scene._rrInfoOx || 0);
    };
    Game_Actor.prototype.rrScreenY = function() {
        const scene = battleScene(), status = scene && scene._statusWindow;
        if (!status) return Graphics.height - 120;
        return Graphics.height - Math.floor(status.height * 7 / 8);
    };
    const frontView = () => !$gameSystem.isSideView();
    const _createActors = Spriteset_Battle.prototype.createActors;
    Spriteset_Battle.prototype.createActors = function() {
        if (!frontView()) return _createActors.call(this);
        this._actorSprites = [];
        for (let i = 0; i < $gameParty.maxBattleMembers(); i++) {
            const sprite = new Sprite_Actor();
            this._actorSprites.push(sprite);
            this._battleField.addChild(sprite);
        }
    };
    const _actorUpdatePosition = Sprite_Actor.prototype.updatePosition;
    Sprite_Actor.prototype.updatePosition = function() {
        if (!frontView() || !this._actor) return _actorUpdatePosition.call(this);
        const parent = this.parent;
        this._homeX = this._actor.rrScreenX() - (parent ? parent.x : 0);
        this._homeY = this._actor.rrScreenY() - (parent ? parent.y : 0);
        this.x = this._homeX;
        this.y = this._homeY;
    };
    const _moveToStartPosition = Sprite_Actor.prototype.moveToStartPosition;
    Sprite_Actor.prototype.moveToStartPosition = function() { if (!frontView()) _moveToStartPosition.call(this); };
    const _startEntryMotion = Sprite_Actor.prototype.startEntryMotion;
    Sprite_Actor.prototype.startEntryMotion = function() { if (!frontView()) _startEntryMotion.call(this); };

    //-------------------------------------------------------------------------
    // Damage effects and attack animations
    //-------------------------------------------------------------------------
    Game_Actor.prototype.performDamage = function() {
        Game_Battler.prototype.performDamage.call(this);
        if (this.isSpriteVisible()) this.requestMotion('damage');
        if (SCREEN_SHAKE) $gameScreen.startShake(5, 5, 10);
        SoundManager.playActorDamage();
    };
    Game_Enemy.prototype.performDamage = function() {
        Game_Battler.prototype.performDamage.call(this);
        if (BLINK) this.requestEffect('blink');
        SoundManager.playEnemyDamage();
    };
    const _enemyPerformActionStart = Game_Enemy.prototype.performActionStart;
    Game_Enemy.prototype.performActionStart = function(action) {
        if (FLASH_WHITE) _enemyPerformActionStart.call(this, action);
        else Game_Battler.prototype.performActionStart.call(this, action);
    };
    Game_Enemy.prototype.attackAnimationId1 = function() { return enemyAttackAnimations(this.enemy())[0]; };
    Game_Enemy.prototype.attackAnimationId2 = function() { return enemyAttackAnimations(this.enemy())[1]; };

    // The second attack animation (mirrored) waits for the first to finish.
    Window_BattleLog.prototype.showAttackAnimation = function(subject, targets) {
        this.showNormalAnimation(targets, subject.attackAnimationId1(), false);
        const second = subject.attackAnimationId2();
        if ($dataAnimations[second]) {
            this._methods.unshift({ name: 'showNormalAnimation', params: [targets, second, true] });
            this._methods.unshift({ name: 'rrWaitForAnimation', params: [] });
        }
    };
    Window_BattleLog.prototype.rrWaitForAnimation = function() { this.setWaitMode('rrAnimation'); };
    const _updateWaitMode = Window_BattleLog.prototype.updateWaitMode;
    Window_BattleLog.prototype.updateWaitMode = function() {
        if (this._waitMode !== 'rrAnimation') return _updateWaitMode.call(this);
        if ($gameTemp._animationQueue.length > 0 || (this._spriteset && this._spriteset.isAnimationPlaying())) return true;
        this._waitMode = '';
        return false;
    };

    // Animations: one for every target at once when the item says <one animation> or plays on the screen,
    // otherwise one before each hit on a target still standing. (-1, the attack animation, reads the
    // database's last animation to decide, as a negative index did in Ruby.)
    const animationFor = (item) => (item ? rubyAt($dataAnimations, item.animationId) : null);
    const showAllAnimation = (item) => oneAnimation(item) || (!!animationFor(item) && animationFor(item).position === 3);
    const separateAnimation = (target, item) => {
        if (oneAnimation(item) || !animationFor(item) || animationFor(item).position === 3) return false;
        return target.isDead() === Scope.forDeadFriend(item);
    };
    Window_BattleLog.prototype.startAction = function(subject, action, targets) {
        const item = action.item();
        this.push('performActionStart', subject, action);
        this.push('waitForMovement');
        this.push('performAction', subject, action);
        this.displayAction(subject, item);
        if (showAllAnimation(item)) {
            this.push('showAnimation', subject, targets.clone(), item.animationId);
            this.push('wait');
            this.push('rrWaitForAnimation');
        }
    };
    const _startAction = BattleManager.startAction;
    BattleManager.startAction = function() {
        this._rrAnimatedTarget = null;
        _startAction.call(this);
        battleScene()?.rrStatusRedrawTarget(this._subject);
    };
    const _updateAction = BattleManager.updateAction;
    BattleManager.updateAction = function() {
        const target = this._targets[0], item = this._action && this._action.item();
        if (target && this._rrAnimatedTarget !== this._targets.length && separateAnimation(target, item)) {
            this._rrAnimatedTarget = this._targets.length;
            this._logWindow.push('showAnimation', this._subject, [target], item.animationId);
            this._logWindow.push('wait');
            this._logWindow.push('rrWaitForAnimation');
            return;
        }
        _updateAction.call(this);
    };
    // A hit on a target that has fallen (or risen, for revival) since the action began is skipped.
    const _invokeAction = BattleManager.invokeAction;
    BattleManager.invokeAction = function(subject, target) {
        if (target.isDead() !== Scope.forDeadFriend(this._action.item())) {
            subject.setLastTarget(target);
            return;
        }
        _invokeAction.call(this, subject, target);
        const scene = battleScene();
        if (scene) {
            scene.rrStatusRedrawTarget(subject);
            if (target !== subject) scene.rrStatusRedrawTarget(target);
        }
    };
    const _endBattlerActions = BattleManager.endBattlerActions;
    BattleManager.endBattlerActions = function(battler) {
        _endBattlerActions.call(this, battler);
        battleScene()?.rrStatusRedrawTarget(battler);
    };
    const _endAllBattlersTurn = BattleManager.endAllBattlersTurn;
    BattleManager.endAllBattlersTurn = function() {
        _endAllBattlersTurn.call(this);
        battleScene()?._statusWindow.refresh();
    };
    // Auto-battling actors show their chosen action's icon as soon as it is made.
    const _unitMakeActions = Game_Unit.prototype.makeActions;
    Game_Unit.prototype.makeActions = function() {
        _unitMakeActions.call(this);
        const scene = battleScene();
        if (scene && this === $gameParty) for (const member of $gameParty.battleMembers()) if (member.isAutoBattle()) scene.rrStatusRedrawTarget(member);
    };
    // An actor always has an action to fill in.
    const _inputtingAction = Game_Actor.prototype.inputtingAction;
    Game_Actor.prototype.inputtingAction = function() {
        if (this._actionInputIndex == null) this._actionInputIndex = 0;
        if (!this._actions[this._actionInputIndex]) this._actions[this._actionInputIndex] = new Game_Action(this);
        return _inputtingAction.call(this);
    };

    //-------------------------------------------------------------------------
    // The battle log
    //-------------------------------------------------------------------------
    if (AUTO_FAST) {
        const _messageSpeed = Window_BattleLog.prototype.messageSpeed;
        Window_BattleLog.prototype.messageSpeed = function() { return Math.ceil(_messageSpeed.call(this) / 2); };
    }
    const gate = (name, key, otherwise) => {
        const base = Window_BattleLog.prototype[name];
        Window_BattleLog.prototype[name] = function(...args) {
            if (msg(key)) return base.apply(this, args);
            if (otherwise) otherwise.apply(this, args);
        };
    };
    const _displayCurrentState = Window_BattleLog.prototype.displayCurrentState;
    Window_BattleLog.prototype.displayCurrentState = function(subject) {
        subject.rrMakeDuringStatePopup();
        if (msg('currentState')) _displayCurrentState.call(this, subject);
    };
    gate('displayAction', 'currentAction');
    gate('displayCounter', 'counterattack', function(target) { this.push('performCounter', target); });
    gate('displayReflection', 'reflectMagic', function(target) { this.push('performReflection', target); });
    gate('displaySubstitute', 'substituteHit');
    gate('displayFailure', 'failureHit');
    gate('displayCritical', 'criticalHit');
    gate('displayMiss', 'hitMissed');
    gate('displayEvasion', 'evasion', function(target) { this.push(target.result().physical ? 'performEvasion' : 'performMagicEvasion', target); });
    gate('displayHpDamage', 'hpDamage', function(target) {
        const r = target.result();
        if (!r.hpAffected) return;
        if (r.hpDamage > 0 && !r.drain) this.push('performDamage', target);
        if (r.hpDamage < 0) this.push('performRecovery', target);
    });
    gate('displayMpDamage', 'mpDamage');
    gate('displayTpDamage', 'tpDamage');
    gate('displayAddedStates', 'addedStates', function(target) {
        if (target.result().addedStateObjects().some(s => s.id === target.deathStateId())) this.push('performCollapse', target);
    });
    gate('displayRemovedStates', 'removedStates');
    gate('displayChangedBuffs', 'changedBuffs');

    //-------------------------------------------------------------------------
    // Status: a column per party slot
    //-------------------------------------------------------------------------
    const WS = Window_BattleStatus.prototype;
    const _statusInitialize = WS.initialize;
    WS.initialize = function(rect) {
        _statusInitialize.call(this, rect);
        this.frameVisible = true;
    };
    WS.updatePadding = function() { this.padding = $gameSystem.windowPadding(); };
    WS.maxCols = function() { return $gameParty.maxBattleMembers(); };
    WS.itemHeight = function() { return this.innerHeight; };
    WS.itemRect = function(index) {
        const width = Math.floor(this.innerWidth / $gameParty.maxBattleMembers());
        let x = index * width;
        if (CENTER_FACES) x += Math.floor((this.innerWidth - $gameParty.members().length * width) / 2);
        return new Rectangle(x, 0, width, this.innerHeight);
    };
    const drawsTp = (actor) => $dataSystem.optDisplayTp && actor.skills().some(s => actor.addedSkillTypes().includes(s.stypeId) && s.tpCost > 0);
    const drawsMp = (actor) => !drawsTp(actor) || actor.skills().some(s => actor.addedSkillTypes().includes(s.stypeId) && s.mpCost > 0);
    Game_Actor.prototype.rrDrawTp = function() { return drawsTp(this); };
    Game_Actor.prototype.rrDrawMp = function() { return drawsMp(this); };
    const coreOutline = () => {
        const core = PluginManager.parameters('RR_YanflyCore');
        return Object.keys(core).length > 0 && String(core.gaugeOutline) !== 'false';
    };
    WS.rrActionIcon = function(actor) {
        const action = actor.currentAction();
        return action && action.item() ? action.item().iconIndex : NO_ACTION_ICON;
    };
    WS.drawItem = function(index) {
        if (index == null) return;
        this.clearItem(index);
        const actor = rubyAt($gameParty.battleMembers(), index);
        const rect = this.itemRect(index), lh = this.lineHeight();
        if (!actor) return;
        this.rrDrawFace(actor.faceName(), actor.faceIndex(), rect.x + 2, rect.y + 2, actor.isAlive());
        this.rrAceDrawActorName(actor, rect.x, rect.y, rect.width - 8);
        this.drawIcon(this.rrActionIcon(actor), rect.x, rect.y);
        this.rrAceDrawActorIcons(actor, rect.x, lh, rect.width);
        this.contents.fontSize = px(TEXT_SIZE);
        this.rrAceDrawActorHp(actor, rect.x + 2, lh * 2 + HPGAUGE_Y_PLUS, rect.width - 4);
        const tp = actor.rrDrawTp(), mp = actor.rrDrawMp(), half = Math.floor(rect.width / 2);
        if (tp && mp) {
            this.rrAceDrawActorTp(actor, rect.x + 2, lh * 3, half - 2 + (coreOutline() ? 1 : 0));
            this.rrAceDrawActorMp(actor, rect.x + half, lh * 3, rect.width - half - 2);
        } else if (tp) {
            this.rrAceDrawActorTp(actor, rect.x + 2, lh * 3, rect.width - 4);
        } else {
            this.rrAceDrawActorMp(actor, rect.x + 2, lh * 3, rect.width - 4);
        }
    };
    // The face, cropped to the column (92 square, 2 in from the cell's corner).
    WS.rrDrawFace = function(faceName, faceIndex, dx, dy, enabled) {
        const bitmap = ImageManager.loadFace(faceName);
        const fw = ImageManager.faceWidth, fh = ImageManager.faceHeight, cell = this.itemRect(0).width;
        const fx = Math.max(Math.floor((fw - cell + 1) / 2), 0);
        const width = Math.min(cell - 4, fw - 4);
        const opacity = this.contents.paintOpacity;
        this.contents.paintOpacity = enabled ? 255 : this.translucentOpacity();
        this.contents.blt(bitmap, (faceIndex % 4) * fw + fx, Math.floor(faceIndex / 4) * fh + 2, width, fh - 4, dx, dy);
        this.contents.paintOpacity = opacity;
    };
    // VX Ace's class-level methods: they win over the Window_Base versions other scripts replace.
    const statusCy = function() {
        return Math.floor((RGSS_SIZE - this.contents.fontSize * RGSS_SIZE / $gameSystem.mainFontSize()) / 2) + 1;
    };
    WS.rrAceDrawActorName = function(actor, x, y, width = 112) {
        this.resetFontSettings();
        this.contents.fontSize = px(NAME_SIZE);
        this.changeTextColor(this.rrAceHpColor(actor));
        this.drawText(actor.name(), x + 24, y, width - 24);
    };
    WS.rrAceDrawCurrentAndMaxValues = function(x, y, width, current, max, color1) {
        this.changeTextColor(color1);
        this.drawText(group(current), x, y, width, 'right');
    };
    WS.rrAceDrawActorHp = function(actor, x, y, width = 124) {
        this.rrAceGauge(x, y, width, actor.hpRate(), ColorManager.hpGaugeColor1(), ColorManager.hpGaugeColor2());
        this.changeTextColor(ColorManager.systemColor());
        const cy = statusCy.call(this);
        this.drawText(TextManager.hpA, x + 2, y + cy, 30);
        this.rrAceDrawCurrentAndMaxValues(x, y + cy, width, actor.hp, actor.mhp, this.rrAceHpColor(actor), ColorManager.normalColor());
    };
    WS.rrAceDrawActorMp = function(actor, x, y, width = 124) {
        this.rrAceGauge(x, y, width, actor.mpRate(), ColorManager.mpGaugeColor1(), ColorManager.mpGaugeColor2());
        this.changeTextColor(ColorManager.systemColor());
        const cy = statusCy.call(this);
        this.drawText(TextManager.mpA, x + 2, y + cy, 30);
        this.rrAceDrawCurrentAndMaxValues(x, y + cy, width, actor.mp, actor.mmp, this.rrAceMpColor(actor), ColorManager.normalColor());
    };
    WS.rrAceDrawActorTp = function(actor, x, y, width = 124) {
        this.rrAceGauge(x, y, width, actor.tpRate(), ColorManager.tpGaugeColor1(), ColorManager.tpGaugeColor2());
        this.changeTextColor(ColorManager.systemColor());
        const cy = statusCy.call(this);
        this.drawText(TextManager.tpA, x + 2, y + cy, 30);
        this.changeTextColor(this.rrAceTpColor(actor));
        this.drawText(Math.floor(actor.tp), x + width - 42, y + cy, 42, 'right');
    };

    // The chooser beside the skill and item lists: the choosing actor's column.
    function Window_BattleStatusAid() { this.initialize(...arguments); }
    Window_BattleStatusAid.prototype = Object.create(Window_BattleStatus.prototype);
    Window_BattleStatusAid.prototype.constructor = Window_BattleStatusAid;
    window.Window_BattleStatusAid = Window_BattleStatusAid;
    Window_BattleStatusAid.prototype.initialize = function(rect) {
        this._rrStatusWindow = null;
        Window_BattleStatus.prototype.initialize.call(this, rect);
        this.visible = false;
        this.openness = 255;
    };
    Window_BattleStatusAid.prototype.show = function() {
        Window_BattleStatus.prototype.show.call(this);
        this.refresh();
    };
    Window_BattleStatusAid.prototype.refresh = function() {
        this.contents.clear();
        if (!this._rrStatusWindow) return;
        this.drawItem(this._rrStatusWindow.index());
    };
    Window_BattleStatusAid.prototype.itemRect = function() { return new Rectangle(0, 0, this.innerWidth, this.innerHeight); };

    //-------------------------------------------------------------------------
    // Target windows
    //-------------------------------------------------------------------------
    const aid = () => $gameTemp._rrBattleAid || null;
    const setSelectFlag = function(flag) {
        this._rrSelectFlag = flag;
        this.setCursorAll(['all', 'all_dead', 'random'].includes(flag));
        this.setCursorFixed(flag === 'user');
        this.refreshCursor();
    };
    Window_BattleActor.prototype.rrSetSelectFlag = setSelectFlag;
    Window_BattleActor.prototype.rrCreateFlags = function() {
        this.rrSetSelectFlag('any');
        this.select(0);
        const item = aid();
        if (!item) return;
        if (Scope.needSelection(item)) {
            this.select(0);
            if (Scope.forDeadFriend(item)) this.rrSetSelectFlag('dead');
        } else if (Scope.forUser(item)) {
            const actor = BattleManager.actor();
            this.select(actor ? $gameParty.battleMembers().indexOf(actor) : 0);
            this.rrSetSelectFlag('user');
        } else if (Scope.forAll(item)) {
            this.select(0);
            this.rrSetSelectFlag(Scope.forDeadFriend(item) ? 'all_dead' : 'all');
        } else if (Scope.forRandom(item)) {
            this.select(0);
            this.rrSetSelectFlag('random');
        }
    };
    const _actorWindowShow = Window_BattleActor.prototype.show;
    Window_BattleActor.prototype.show = function() {
        _actorWindowShow.call(this);
        this.rrCreateFlags();
    };
    Window_BattleActor.prototype.isCurrentItemEnabled = function() {
        const item = aid();
        if (!item) return true;
        if (Scope.needSelection(item)) {
            const member = $gameParty.battleMembers()[this.index()];
            if (Scope.forDeadFriend(item)) return !!member && member.isDead();
        } else if (Scope.forDeadFriend(item)) {
            return $gameParty.battleMembers().some(m => m.isDead());
        }
        return true;
    };

    // Every enemy a scope covers is highlighted.
    Window_BattleEnemy.prototype.rrSetSelectFlag = function(flag) {
        setSelectFlag.call(this, flag);
        if (this._cursorAll) for (const enemy of this._enemies) enemy.select();
    };
    Window_BattleEnemy.prototype.maxCols = function() { return this.maxItems(); };
    Window_BattleEnemy.prototype.drawItem = function() {};
    // Enemies are chosen left to right across the field.
    const _validTargets = Window_BattleEnemy.prototype.validTargets;
    Window_BattleEnemy.prototype.validTargets = function() {
        const list = _validTargets.call(this);
        if (list.some(b => !b.isEnemy())) return list;
        return list.slice().sort((a, b) => a.screenX() - b.screenX());
    };
    Window_BattleEnemy.prototype.rrCreateFlags = function() {
        this.rrSetSelectFlag('any');
        this.select(0);
        const item = aid();
        if (!item) return;
        if (Scope.needSelection(item)) this.select(0);
        else if (Scope.forAll(item)) { this.select(0); this.rrSetSelectFlag('all'); }
        else if (Scope.forRandom(item)) { this.select(0); this.rrSetSelectFlag('random'); }
    };
    const _enemyWindowShow = Window_BattleEnemy.prototype.show;
    Window_BattleEnemy.prototype.show = function() {
        _enemyWindowShow.call(this);
        this.rrCreateFlags();
    };
    const _enemyWindowHide = Window_BattleEnemy.prototype.hide;
    Window_BattleEnemy.prototype.hide = function() {
        _enemyWindowHide.call(this);
        this.rrSetSelectFlag('any');
    };

    //-------------------------------------------------------------------------
    // Help: the target's name and states, or the scope's words
    //-------------------------------------------------------------------------
    function Window_BattleHelp() { this.initialize(...arguments); }
    Window_BattleHelp.prototype = Object.create(Window_Help.prototype);
    Window_BattleHelp.prototype.constructor = Window_BattleHelp;
    window.Window_BattleHelp = Window_BattleHelp;
    Window_BattleHelp.prototype.update = function() {
        Window_Help.prototype.update.call(this);
        if (!this.visible && this._text !== '') {
            this._text = '';
            this.refresh();
            return;
        }
        this.rrUpdateBattlerName();
    };
    Window_BattleHelp.prototype.rrUpdateBattlerName = function() {
        const actorWindow = this.actorWindow, enemyWindow = this.enemyWindow;
        if (!actorWindow || !enemyWindow || !(actorWindow.active || enemyWindow.active)) return;
        const battler = actorWindow.active ? $gameParty.battleMembers()[actorWindow.index()] : enemyWindow.enemy();
        if (this.rrSpecialDisplay()) this.rrRefreshSpecialCase();
        else if (battler && battler.name() !== this._text) this.rrRefreshBattlerName(battler);
    };
    Window_BattleHelp.prototype.rrRefreshBattlerName = function(battler) {
        this.contents.clear();
        this.resetFontSettings();
        this.resetTextColor();
        this._text = battler.name();
        const icons = battler.allIcons(), lh = this.lineHeight();
        this.drawText(this._text, 0, icons.length <= 0 ? Math.floor(lh / 2) : 0, this.innerWidth, 'center');
        this.rrAceDrawActorIcons(battler, Math.floor((this.innerWidth - icons.length * 24) / 2), lh, this.innerWidth);
    };
    Window_BattleHelp.prototype.rrSpecialDisplay = function() {
        const item = aid();
        return !!item && !Scope.forUser(item) && !Scope.needSelection(item);
    };
    Window_BattleHelp.prototype.rrRefreshSpecialCase = function() {
        const item = aid(), count = Scope.numberOfTargets(item);
        let text;
        if (Scope.forOpponent(item)) text = Scope.forAll(item) ? HELP.allFoes : count === 1 ? HELP.oneRandomFoe : fmt(HELP.manyRandomFoes, count);
        else if (Scope.forDeadFriend(item)) text = HELP.allDeadAllies;
        else if (Scope.forRandom(item)) text = count === 1 ? HELP.oneRandomAlly : fmt(HELP.randomAllies, count);
        else text = HELP.allAllies;
        if (text === this._text) return;
        this._text = text;
        this.contents.clear();
        this.resetFontSettings();
        this.drawText(text, 0, Math.floor((this.lineHeight() * 2 - this.lineHeight()) / 2), this.innerWidth, 'center');
    };

    //-------------------------------------------------------------------------
    // Scene_Battle
    //-------------------------------------------------------------------------
    const SB = Scene_Battle.prototype;
    const infoWidth = 128;
    SB.skillWindowRect = function() {
        const h = this.calcWindowHeight(4, true);
        return new Rectangle(0, Graphics.boxHeight - h, Graphics.boxWidth - infoWidth, h);
    };
    SB.itemWindowRect = function() { return this.skillWindowRect(); };
    SB.actorWindowRect = function() { return this.skillWindowRect(); };
    SB.enemyWindowRect = function() { return new Rectangle(0, Graphics.boxHeight, Graphics.boxWidth - infoWidth, this.calcWindowHeight(1, true)); };
    SB.createHelpWindow = function() {
        this._helpWindow = new Window_BattleHelp(this.helpWindowRect());
        this._helpWindow.hide();
        this.addWindow(this._helpWindow);
    };
    const _createAllWindows = SB.createAllWindows;
    SB.createAllWindows = function() {
        _createAllWindows.call(this);
        const h = this.calcWindowHeight(4, true);
        this._statusAidWindow = new Window_BattleStatusAid(new Rectangle(Graphics.boxWidth - infoWidth, Graphics.boxHeight - h, infoWidth, h));
        this._statusAidWindow._rrStatusWindow = this._statusWindow;
        this.addWindow(this._statusAidWindow);
        this._helpWindow.actorWindow = this._actorWindow;
        this._helpWindow.enemyWindow = this._enemyWindow;
        // Popups show over the windows; each is moved by its battler's sprite.
        this._rrPopupLayer = new Sprite();
        this._rrPopupLayer.update = function() {};
        this.addChild(this._rrPopupLayer);
    };
    const _createPartyCommandWindow = SB.createPartyCommandWindow;
    SB.createPartyCommandWindow = function() {
        _createPartyCommandWindow.call(this);
        this._partyCommandWindow.setHandler('dir6', this.commandFight.bind(this));
    };
    const _createActorCommandWindow = SB.createActorCommandWindow;
    SB.createActorCommandWindow = function() {
        _createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler('dir4', () => this.rrPriorCommand());
        this._actorCommandWindow.setHandler('dir6', () => this.rrNextCommand());
    };
    // Left cancels in the actor commands, Right calls dir6 in both command windows.
    const dirHandling = (left) => function() {
        if (!this.isOpenAndActive()) return;
        const dir = Input.isRepeated('right') ? 'dir6' : left && Input.isRepeated('left') ? 'cancel' : null;
        if (!dir) return Window_Selectable.prototype.processHandling.call(this);
        SoundManager.playCursor();
        Input.update();
        this.deactivate();
        this.callHandler(dir);
    };
    Window_PartyCommand.prototype.processHandling = dirHandling(false);
    Window_ActorCommand.prototype.processHandling = dirHandling(true);

    // Skill and item lists in battle keep 8 between their columns.
    for (const Win of [Window_SkillList, Window_ItemList]) {
        const base = Win.prototype.rrAceSpacing;
        Win.prototype.rrAceSpacing = function() { return $gameParty.inBattle() ? 8 : base ? base.call(this) : 32; };
    }

    SB.rrStatusRedrawTarget = function(target) {
        if (!target || !target.isActor()) return;
        const index = $gameParty.battleMembers().indexOf(target);
        if (index >= 0) this._statusWindow.drawItem(index);
    };
    SB.rrRedrawCurrentStatus = function() {
        if (this._statusWindow.index() >= 0) this._statusWindow.drawItem(this._statusWindow.index());
    };
    const inputAction = () => (BattleManager.actor() ? BattleManager.actor().inputtingAction() : null);

    // The turn-based flow moves to the next actor or starts the turn; Classical ATB replaces these two.
    SB.rrStockNextCommand = function() { this.selectNextCommand(); };
    SB.rrStockPriorCommand = function() { this.selectPreviousCommand(); };
    SB.rrNextCommand = function() {
        this._statusWindow.show();
        this.rrRedrawCurrentStatus();
        this._actorCommandWindow.show();
        this._statusAidWindow.hide();
        this.rrStockNextCommand();
    };
    SB.rrPriorCommand = function() {
        this.rrRedrawCurrentStatus();
        this.rrStockPriorCommand();
    };
    SB.commandCancel = function() { this.rrPriorCommand(); };
    SB.commandAttack = function() {
        $gameTemp._rrBattleAid = $dataSkills[BattleManager.actor().attackSkillId()];
        inputAction().setAttack();
        this.rrSelectEnemySelection();
    };
    SB.commandGuard = function() {
        inputAction().setGuard();
        this.rrNextCommand();
    };
    const _commandSkill = SB.commandSkill;
    SB.commandSkill = function() {
        _commandSkill.call(this);
        this._statusWindow.hide();
        this._actorCommandWindow.hide();
        this._statusAidWindow.show();
    };
    const _commandItem = SB.commandItem;
    SB.commandItem = function() {
        _commandItem.call(this);
        this._statusWindow.hide();
        this._actorCommandWindow.hide();
        this._statusAidWindow.show();
    };
    SB.rrChooseTarget = function(item, list) {
        $gameTemp._rrBattleAid = item;
        if (Scope.forOpponent(item)) this.rrSelectEnemySelection();
        else if (Scope.forFriend(item)) this.rrSelectActorSelection();
        else {
            list.hide();
            this.rrNextCommand();
            $gameTemp._rrBattleAid = null;
        }
    };
    SB.onSkillOk = function() {
        const skill = this._skillWindow.item();
        inputAction().setSkill(skill.id);
        BattleManager.actor().setLastBattleSkill(skill);
        this.rrChooseTarget(skill, this._skillWindow);
    };
    SB.onItemOk = function() {
        const item = this._itemWindow.item();
        inputAction().setItem(item.id);
        this.rrChooseTarget(item, this._itemWindow);
        $gameParty.setLastItem(item);
    };
    const _onSkillCancel = SB.onSkillCancel;
    SB.onSkillCancel = function() {
        _onSkillCancel.call(this);
        this._statusAidWindow.hide();
    };
    const _onItemCancel = SB.onItemCancel;
    SB.onItemCancel = function() {
        _onItemCancel.call(this);
        this._statusAidWindow.hide();
    };
    SB.rrSelectActorSelection = function() {
        this._statusAidWindow.refresh();
        this._actorWindow.refresh();
        this._actorWindow.show();
        this._actorWindow.activate();
        this._statusWindow.hide();
        this._skillWindow.hide();
        this._itemWindow.hide();
        this._helpWindow.show();
    };
    SB.startActorSelection = SB.rrSelectActorSelection;
    SB.onActorOk = function() {
        $gameTemp._rrBattleAid = null;
        inputAction().setTarget(this._actorWindow.index());
        this._actorWindow.hide();
        this._skillWindow.hide();
        this._itemWindow.hide();
        this.rrNextCommand();
        this._statusWindow.show();
        this._actorCommandWindow.show();
        this._statusAidWindow.hide();
    };
    SB.onActorCancel = function() {
        inputAction().clear();
        this._statusAidWindow.refresh();
        $gameTemp._rrBattleAid = null;
        this._actorWindow.hide();
        const symbol = this._actorCommandWindow.currentSymbol();
        if (symbol === 'skill') { this._skillWindow.activate(); this._skillWindow.show(); }
        if (symbol === 'item') { this._itemWindow.activate(); this._itemWindow.show(); }
    };
    SB.rrSelectEnemySelection = function() {
        this._statusAidWindow.refresh();
        this._enemyWindow.refresh();
        this._enemyWindow.show();
        this._enemyWindow.activate();
        this._helpWindow.show();
    };
    SB.startEnemySelection = SB.rrSelectEnemySelection;
    SB.onEnemyOk = function() {
        $gameTemp._rrBattleAid = null;
        const action = inputAction(), enemy = this._enemyWindow.enemy();
        if (enemy && action.setTargetBattler) action.setTargetBattler(enemy);
        else action.setTarget(enemy ? enemy.index() : -1);
        this._enemyWindow.hide();
        this._skillWindow.hide();
        this._itemWindow.hide();
        this.rrNextCommand();
    };
    SB.onEnemyCancel = function() {
        inputAction().clear();
        this._statusAidWindow.refresh();
        $gameTemp._rrBattleAid = null;
        this._enemyWindow.hide();
        const symbol = this._actorCommandWindow.currentSymbol();
        if (symbol === 'attack') this._actorCommandWindow.activate();
        if (symbol === 'skill') this._skillWindow.activate();
        if (symbol === 'item') this._itemWindow.activate();
        if (this._skillWindow.visible || this._itemWindow.visible) this._helpWindow.show();
        else this._helpWindow.hide();
    };

    // Each new turn opens on the first actor's commands; cancelling back from them still reaches the
    // party commands.
    const _startInput = BattleManager.startInput;
    BattleManager.startInput = function() {
        this._rrSkipPartyCommand = SKIP_PARTY;
        _startInput.call(this);
    };
    const _startPartyCommandSelection = SB.startPartyCommandSelection;
    SB.startPartyCommandSelection = function() {
        if (!SceneManager.isSceneChanging()) this._statusWindow.refresh();
        _startPartyCommandSelection.call(this);
        if (!BattleManager._rrSkipPartyCommand) return;
        BattleManager._rrSkipPartyCommand = false;
        this._partyCommandWindow.deactivate();
        this.commandFight();
    };

    //-------------------------------------------------------------------------
    // Test play keys
    //-------------------------------------------------------------------------
    const debugKey = (code) => Input.keyMapper[code] || (Input.keyMapper[code] = 'rrF' + (code - 111));
    const F5 = debugKey(116), F6 = debugKey(117), F7 = debugKey(118), F8 = debugKey(119);
    const _sceneUpdate = SB.update;
    SB.update = function() {
        _sceneUpdate.call(this);
        if ($gameTemp.isPlaytest()) this.rrUpdateDebug();
    };
    SB.rrUpdateDebug = function() {
        if (Input.isTriggered(F5)) {
            SoundManager.playRecovery();
            for (const member of $gameParty.battleMembers()) member.recoverAll();
            this._statusWindow.refresh();
        }
        if (Input.isTriggered(F6)) {
            SoundManager.playActorDamage();
            for (const member of $gameParty.aliveMembers()) { member.setHp(1); member.setMp(0); member.setTp(0); }
            this._statusWindow.refresh();
        }
        if (Input.isTriggered(F7)) {
            SoundManager.playRecovery();
            for (const member of $gameParty.aliveMembers()) member.setTp(member.maxTp());
            this._statusWindow.refresh();
        }
        if (Input.isTriggered(F8)) {
            for (const enemy of $gameTroop.aliveMembers()) { enemy.setHp(0); enemy.performCollapse(); }
        }
    };
})();
