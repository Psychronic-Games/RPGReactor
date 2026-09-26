/*:
 * @target MZ
 * @plugindesc Battler Shakes when hit (VX Ace), for imported games
 * @author unknown; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_BattlerShake.js
 *
 * A battler that would blink when hit shakes instead: each frame of the
 * blink it is pushed right (and down) by a random amount up to the maximum,
 * less and less as the blink runs out when the power diminishes. It stays
 * fully visible. Only a whole-pixel push shows, so a maximum of 0 moves it
 * not at all.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param shakeX
 * @text Maximum x displacement
 * @type number
 * @default 30
 *
 * @param shakeY
 * @text Maximum y displacement
 * @type number
 * @default 0
 *
 * @param diminish
 * @text Lose power over time
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_BattlerShake');
    const SHAKE_X = Math.trunc(Number(params.shakeX ?? 30) || 0);
    const SHAKE_Y = Math.trunc(Number(params.shakeY ?? 0) || 0);
    const DIMINISH = String(params.diminish) !== 'false';
    // A random whole number below the maximum; a maximum of 0 gives a fraction below 1.
    const rand = (max) => (max > 0 ? Math.randomInt(max) : Math.random());

    function updateBlink() {
        const rate = DIMINISH ? (this._rrShakeMax > 0 ? this._effectDuration / this._rrShakeMax : 0) : 1;
        this.x = Math.trunc(this.x + rand(SHAKE_X) * rate);
        this.y = Math.trunc(this.y + rand(SHAKE_Y) * rate);
    }
    Sprite_Battler.prototype.updateBlink = updateBlink;
    // The battler sprites that run effects of their own (enemies; actors where a battle port gives them effects).
    for (const Sprite_Class of [Sprite_Battler, Sprite_Enemy, Sprite_Actor]) {
        const proto = Sprite_Class.prototype;
        if (Object.prototype.hasOwnProperty.call(proto, 'updateBlink')) proto.updateBlink = updateBlink;
        if (!Object.prototype.hasOwnProperty.call(proto, 'startEffect')) continue;
        const _startEffect = proto.startEffect;
        proto.startEffect = function(effectType) {
            _startEffect.call(this, effectType);
            this._rrShakeMax = this._effectDuration;
        };
    }
})();
