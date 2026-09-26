/*:
 * @target MZ
 * @plugindesc The Art of Screenshake (VX Ace), for imported games
 * @author TheoAllen; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoScreenShake.js
 *
 * A screen shake that jolts the map in both directions at once: every frame
 * the map (tiles, parallax and characters; not pictures, weather or windows)
 * jumps to a random offset of up to `power` pixels across and down, and the
 * offset shrinks steadily to nothing over `duration` frames. While it runs,
 * an ordinary Shake Screen no longer moves the map.
 *   this.rrShakeScreen(duration, power)      (the game's shake_screen)
 * A power below 1 (or 0) shakes by less than a pixel, which does not show.
 * It is not saved; a menu pauses it and a transfer carries it over.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's shake_screen calls into the
 * call above.
 */
(() => {
    'use strict';

    // Ruby's Kernel#rand(n): an integer below |n| truncated, or a fraction below 1 when that is 0.
    const rubyRand = (n) => {
        const max = Math.trunc(Math.abs(Number(n) || 0));
        return max === 0 ? Math.random() : Math.floor(Math.random() * max);
    };

    Game_Interpreter.prototype.rrShakeScreen = function(duration, power) {
        $gameTemp._rrShakeMaxDur = duration;
        $gameTemp._rrShakeDur = duration;
        $gameTemp._rrShakePower = power;
    };

    const _update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _update.call(this);
        this.rrUpdateTheoShake();
    };

    Spriteset_Map.prototype.rrUpdateTheoShake = function() {
        const base = this._baseSprite;
        if (!base || !$gameTemp) return;
        if (($gameTemp._rrShakeDur || 0) > 0) {
            $gameTemp._rrShakeDur -= 1;
            const rate = $gameTemp._rrShakeDur / Number($gameTemp._rrShakeMaxDur);
            const power = $gameTemp._rrShakePower;
            // The layer's origin moved by a whole pixel count, as a viewport's is.
            const ox = Math.trunc(rubyRand(power) * rate * (Math.random() > 0.5 ? 1 : -1));
            const oy = Math.trunc(rubyRand(power) * rate * (Math.random() > 0.5 ? 1 : -1));
            // The spriteset already carries the stock shake; the map layer cancels it and takes this one.
            const scale = this.scale.x || 1;
            base.x = (-ox - Math.round($gameScreen.shake())) / scale;
            base.y = -oy / scale;
            this._rrTheoShaking = true;
        } else if (this._rrTheoShaking) {
            base.x = 0;
            base.y = 0;
            this._rrTheoShaking = false;
        }
    };
})();
