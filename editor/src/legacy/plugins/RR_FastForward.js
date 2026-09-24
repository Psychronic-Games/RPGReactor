/*:
 * @target MZ
 * @plugindesc Hold F or G to fast-forward the game, as EasyRPG Player does
 * @author RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_FastForward.js
 *
 * Installed by File › Import Project… with every RPG Maker 2000/2003 game:
 * EasyRPG Player, which most of them are played in now, runs the game faster
 * while a fast-forward key is held, and players of those games expect it.
 *
 * While F is held the game runs Speed A times as fast, while G is held Speed
 * B times (EasyRPG's defaults, 3 and 10); G wins when both are. Everything
 * speeds up together (movement, events, waits, animation, battles), the way
 * several game frames pass in one; music and sound keep their own pace.
 *
 * Turning the plugin off removes the keys.
 *
 * @param speedA
 * @text Speed A (F)
 * @desc How many times as fast the game runs while F is held.
 * @type number
 * @min 2
 * @max 100
 * @default 3
 *
 * @param speedB
 * @text Speed B (G)
 * @desc How many times as fast the game runs while G is held.
 * @type number
 * @min 2
 * @max 100
 * @default 10
 */
(() => {
    'use strict';

    const params = PluginManager.parameters('RR_FastForward');
    const speedA = Math.max(1, Math.min(100, Number(params.speedA) || 3));
    const speedB = Math.max(1, Math.min(100, Number(params.speedB) || 10));

    // F and G, unless the game or another plugin already gave those keys a meaning
    if (!Input.keyMapper[70]) Input.keyMapper[70] = 'rrFastForwardA';
    if (!Input.keyMapper[71]) Input.keyMapper[71] = 'rrFastForwardB';

    function speed() {
        if (Input.isPressed('rrFastForwardB')) return speedB;
        if (Input.isPressed('rrFastForwardA')) return speedA;
        return 1;
    }

    // Each extra step is a whole game frame: input is read again (so a press counts once and a held key
    // stays held), then the scene updates. A scene change ends the burst; the next frame picks it up.
    const _updateMain = SceneManager.updateMain;
    SceneManager.updateMain = function() {
        _updateMain.call(this);
        const steps = speed();
        for (let i = 1; i < steps; i++) {
            if (this._nextScene || !this._scene || !this._scene.isStarted() || !this.isGameActive()) break;
            this.updateFrameCount();
            this.updateInputData();
            this.updateEffekseer();
            this.updateScene();
        }
    };
})();
