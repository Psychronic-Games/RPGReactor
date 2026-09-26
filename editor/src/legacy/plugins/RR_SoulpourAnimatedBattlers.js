/*:
 * @target MZ
 * @plugindesc Animated Battlers (VX Ace), for imported games
 * @author Soulpour777 (edited by Euphoria); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_SoulpourAnimatedBattlers.js
 *
 * Listed enemies move in battle: those that breathe stretch up and down,
 * those that float bob a couple of pixels, those that move sideways sway
 * from side to side. A state in the cancel list stops them while it lasts.
 * Every enemy stands 5 pixels left of its place, as the script's sideways
 * offset started at 5 for all of them.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param breathSpeed
 * @type number
 * @default 3
 *
 * @param breathEnemies
 * @type multiline_string
 * @default []
 *
 * @param floatEnemies
 * @type multiline_string
 * @default []
 *
 * @param movesideEnemies
 * @type multiline_string
 * @default []
 *
 * @param cancelStates
 * @type multiline_string
 * @default []
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_SoulpourAnimatedBattlers');
    const list = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.map(Number) : []; } catch (_) { return []; } };
    const BREATH_SPEED = Number(params.breathSpeed ?? 3) || 0;
    const BREATH = list(params.breathEnemies), FLOAT = list(params.floatEnemies), MOVESIDE = list(params.movesideEnemies);
    const CANCEL = list(params.cancelStates);
    const rand = (n) => Math.randomInt(n);

    //-------------------------------------------------------------------------
    // The enemy's flags: set from its id as it is made (a transformed enemy keeps them)
    //-------------------------------------------------------------------------
    const E = Game_Enemy.prototype;
    const _initialize = E.initialize;
    E.initialize = function(enemyId, x, y) {
        _initialize.call(this, enemyId, x, y);
        this._rrBreath = BREATH.includes(this._enemyId);
        this._rrFloat = FLOAT.includes(this._enemyId);
        this._rrMoveside = MOVESIDE.includes(this._enemyId);
    };
    const _addState = Game_Battler.prototype.addState;
    Game_Battler.prototype.addState = function(stateId) {
        _addState.call(this, stateId);
        if (!this.isEnemy()) return;
        if (CANCEL.some(id => this._states.includes(id))) this._rrBreath = this._rrFloat = this._rrMoveside = false;
    };
    const _removeState = Game_Battler.prototype.removeState;
    Game_Battler.prototype.removeState = function(stateId) {
        _removeState.call(this, stateId);
        if (!this.isEnemy()) return;
        if (CANCEL.some(id => this._states.includes(id))) return;
        if (BREATH.includes(this._enemyId)) this._rrBreath = true;
        if (FLOAT.includes(this._enemyId)) this._rrFloat = true;
        if (MOVESIDE.includes(this._enemyId)) this._rrMoveside = true;
    };

    //-------------------------------------------------------------------------
    // The sprite: its origin moves (in pixels from the frame's top-left) and its height breathes
    //-------------------------------------------------------------------------
    const S = Sprite_Enemy.prototype;
    const _spriteInitialize = S.initialize;
    S.initialize = function(battler) {
        _spriteInitialize.call(this, battler);
        this._rrOxOffset = 5;
        this._rrMovesideDuration = rand(30);
        this._rrMovesideSpeed = 0;
        this._rrFloatDuration = rand(40);
        this._rrBreathPhase = 0;
        this._rrBreathSpeed = 0;
        this._rrZoomY = 1;
        const enemy = this._battler;
        if (enemy && enemy.isEnemy() && enemy._rrBreath) {
            const initial = Math.min(1.1, Math.max(0.9, 1.0 + enemy.screenX() * 0.001 - enemy.screenY() * 0.001));
            this._rrZoomY = initial;
            this._rrBreathSpeed = Math.min(Math.max(BREATH_SPEED, 1), 9) * 0.001 + rand(99) * 0.00001;
        }
    };
    const _update = S.update;
    S.update = function() {
        _update.call(this);
        if (!this._battler || !this._battler.isEnemy()) return;
        this.rrUpdateBreath();
        this.rrUpdateFloat();
        this.rrUpdateMoveside();
        this.rrApplyOrigin();
    };
    S.rrUpdateOx = function() { this._rrOx = (this._frame ? this._frame.width : 0) / 2 + this._rrOxOffset; };
    S.rrUpdateOy = function() { this._rrOy = this._frame ? this._frame.height : 0; };
    S.rrUpdateBreath = function() {
        this.rrUpdateOx();
        this.rrUpdateOy();
        if (!this._battler._rrBreath) return;
        if (this._rrBreathSpeed === 0) {
            this._rrBreathSpeed = Math.min(Math.max(BREATH_SPEED, 1), 9) * 0.001 + rand(99) * 0.00001;
            this._rrZoomY = 1 + rand(10) * 0.01;
        }
        if (this._rrBreathPhase === 0) {
            this._rrZoomY += this._rrBreathSpeed;
            if (this._rrZoomY >= 1.05) this._rrBreathPhase = 1;
        } else {
            this._rrZoomY -= this._rrBreathSpeed;
            if (this._rrZoomY <= 0.9) this._rrBreathPhase = 0;
        }
    };
    // The bob is two pixels up or down from the feet each frame, never more (the origin is set anew first).
    S.rrUpdateFloat = function() {
        this.rrUpdateOx();
        this.rrUpdateOy();
        if (!this._battler._rrFloat) return;
        const d = ++this._rrFloatDuration;
        if (d <= 20) this._rrOy += 2;
        else if (d <= 40) this._rrOy -= 2;
        else this._rrFloatDuration = 0;
    };
    S.rrUpdateMoveside = function() {
        if (!this._battler._rrMoveside) return;
        if (++this._rrMovesideSpeed < 4) return;
        this._rrMovesideSpeed = 0;
        const d = ++this._rrMovesideDuration;
        if (d <= 10) this._rrOxOffset += 2;
        else if (d <= 15) this._rrOxOffset += 1;
        else if (d <= 25) this._rrOxOffset -= 2;
        else if (d <= 30) this._rrOxOffset -= 1;
        else this._rrMovesideDuration = 0;
        this.rrUpdateOx();
    };
    // RGSS origins as anchors; a mirrored sheet (Battle Symphony's holder battlers) counts its origin from the other side.
    S.rrApplyOrigin = function() {
        const w = this._frame ? this._frame.width : 0, h = this._frame ? this._frame.height : 0;
        if (w > 0) this.anchor.x = this._rrMirror ? 1 - this._rrOx / w : this._rrOx / w;
        if (h > 0) this.anchor.y = this._rrOy / h;
        this.scale.y = this._rrZoomY;
    };
})();
