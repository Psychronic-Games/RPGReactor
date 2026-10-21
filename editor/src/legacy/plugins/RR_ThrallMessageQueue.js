/*:
 * @target MZ
 * @plugindesc Message Queue v1.0 (VX), for imported games
 * @author Marc (of Fall From Eden); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallMessageQueue.js
 *
 * A banner across the top of the map shows short notes one after another:
 * each fades in over a half-transparent black strip, stays two seconds and
 * fades out before the next. A note already waiting is not queued twice.
 * The banner shows while the switch is on (on from a new game); turning it
 * off empties the queue. A map entered with the switch off has no banner
 * until it is entered again.
 *
 * The events add notes with $game_map.queue.push("text"), which the importer
 * writes as $gameMap.rrMessageQueue().push("text"). The queue is saved with
 * the map. The script's automatic notes (map names, gold, items, party,
 * stats) were all turned off in the game and are not ported.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param switchId
 * @text Banner switch
 * @type switch
 * @default 6
 *
 * @param enabled
 * @text Switch on in a new game
 * @type boolean
 * @default true
 *
 * @param alignment
 * @text Alignment (0 left, 1 centre, 2 right)
 * @type number
 * @default 1
 *
 * @param background
 * @text Strip colour (r,g,b,a)
 * @default 0,0,0,128
 *
 * @param fadeStep
 * @type number
 * @default 8
 *
 * @param wait
 * @text Frames shown
 * @type number
 * @default 120
 *
 * @param removeDuplicates
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_ThrallMessageQueue');
    const SWITCH = Number(P.switchId || 6);
    const ENABLED = P.enabled !== 'false';
    const ALIGN = ['left', 'center', 'right'][Number(P.alignment || 1)] || 'center';
    const BG = String(P.background || '0,0,0,128').split(',').map(Number);
    const FADE = Number(P.fadeStep || 8);
    const WAIT = Number(P.wait || 120);
    const UNIQUE = P.removeDuplicates !== 'false';

    if (ENABLED) {
        const _initialize = Game_Switches.prototype.initialize;
        Game_Switches.prototype.initialize = function() {
            _initialize.call(this);
            this._data[SWITCH] = true;
        };
    }

    /** $game_map.queue: the notes waiting, the one showing first. */
    Game_Map.prototype.rrMessageQueue = function() {
        if (!Array.isArray(this._rrQueue)) this._rrQueue = [];
        return this._rrQueue;
    };

    function Sprite_RRMessageQueue() { this.initialize(...arguments); }
    Sprite_RRMessageQueue.prototype = Object.create(Sprite.prototype);
    Sprite_RRMessageQueue.prototype.constructor = Sprite_RRMessageQueue;
    Sprite_RRMessageQueue.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this);
        this._counter = 0;
        this.opacity = 0;
    };
    Sprite_RRMessageQueue.prototype.update = function() {
        const queue = $gameMap.rrMessageQueue();
        if (!queue.length) return;
        if (UNIQUE) { const seen = [...new Set(queue)]; queue.length = 0; queue.push(...seen); }
        if (!this.bitmap && this._counter === 0) {
            const w = Graphics.width;
            const bitmap = new Bitmap(w, 24);
            bitmap.fillRect(0, 0, w, 24, `rgba(${BG[0]},${BG[1]},${BG[2]},${(BG[3] === undefined ? 255 : BG[3]) / 255})`);
            bitmap.fontFace = $gameSystem.mainFontFace();
            bitmap.fontSize = $gameSystem.mainFontSize();
            bitmap.fontBold = true;
            bitmap.outlineWidth = 0;
            bitmap.drawText(String(queue[0]), 0, 0, w - 4, 24, ALIGN);
            this.bitmap = bitmap;
        }
        if (this.opacity < 255 && this._counter < WAIT) this.opacity += FADE;
        if (this._counter < WAIT) this._counter++;
        else {
            if (this.opacity > 0) this.opacity -= FADE;
            if (this.opacity <= 0) {
                if (this.bitmap) this.bitmap.destroy();
                this.bitmap = null;
                this._counter = 0;
                queue.shift();
            }
        }
    };
    window.Sprite_RRMessageQueue = Sprite_RRMessageQueue;

    // Over the pictures and the timer, under the windows.
    const _createUpperLayer = Spriteset_Map.prototype.createUpperLayer;
    Spriteset_Map.prototype.createUpperLayer = function() {
        _createUpperLayer.call(this);
        if ($gameSwitches.value(SWITCH)) {
            this._rrMessageQueue = new Sprite_RRMessageQueue();
            this.addChild(this._rrMessageQueue);
        }
    };
    const _update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        if ($gameSwitches.value(SWITCH)) {
            if (this._rrMessageQueue) this._rrMessageQueue.update();
        } else $gameMap.rrMessageQueue().length = 0;
        _update.call(this);
    };
})();
