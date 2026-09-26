/*:
 * @target MZ
 * @plugindesc DirtTrail (VX Ace), for imported games
 * @author Claude; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_SmokePuffs.js
 *
 * Small bright chips kicked up behind the player and the visible followers
 * while they move with the dash button held. Each chip is a tiny rectangle
 * of near-white (drawn additively, so it brightens what is under it), spun,
 * thrown up and sideways, pulled back down and faded out over a few frames.
 * A character keeps a handful at most; the oldest goes first.
 *
 * The chips are placed on the screen, not on the map: while the map scrolls
 * they keep their screen place. They move in whole pixels, so a sideways
 * kick below one pixel a frame leaves a chip in place when it points right
 * and moves it a pixel left each frame when it points left.
 *
 * An event throws chips whenever it moves, dash or not, once flagged:
 *   $gameMap.event(id)._rrSmokeTrail = true | false
 * (the game's `$game_map.events[id].smoke_trail = true`). The flag is saved
 * with the event and lasts until the map is loaded again.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param puffCount
 * @text Chips per character
 * @type number
 * @default 8
 *
 * @param chipWidth
 * @type number
 * @default 3
 *
 * @param chipHeight
 * @type number
 * @default 2
 *
 * @param chipBrightness
 * @type number
 * @max 255
 * @default 200
 * @desc Grey level of a chip, each channel varied by -15 to +14.
 *
 * @param startOpacity
 * @type number
 * @max 255
 * @default 220
 *
 * @param fadeSpeed
 * @type number
 * @default 14
 * @desc Opacity lost per frame.
 *
 * @param spawnInterval
 * @type number
 * @default 4
 * @desc Frames between spawns (one chip, or two half the time).
 *
 * @param kickY
 * @type number
 * @decimals 2
 * @min -99
 * @default -1.8
 * @desc Upward speed at spawn, pixels a frame (negative is up), varied 70-130 %.
 *
 * @param kickXRange
 * @type number
 * @decimals 2
 * @default 1.4
 * @desc Sideways speed at spawn, up to this many pixels a frame either way.
 *
 * @param gravity
 * @type number
 * @decimals 2
 * @default 0.18
 *
 * @param trailOffset
 * @type number
 * @default 4
 * @desc Pixels behind the character, against its facing.
 *
 * @param feetOffset
 * @type number
 * @min -99
 * @default 2
 * @desc Pixels below the character's feet.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_SmokePuffs');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const CFG = {
        PUFF_COUNT: num(params.puffCount, 8), CHIP_W: num(params.chipWidth, 3), CHIP_H: num(params.chipHeight, 2),
        CHIP_BRIGHTNESS: num(params.chipBrightness, 200), START_OPACITY: num(params.startOpacity, 220), FADE_SPEED: num(params.fadeSpeed, 14),
        SPAWN_INTERVAL: num(params.spawnInterval, 4), KICK_Y: num(params.kickY, -1.8), KICK_X_RANGE: num(params.kickXRange, 1.4),
        GRAVITY: num(params.gravity, 0.18), TRAIL_OFFSET: num(params.trailOffset, 4), FEET_OFFSET: num(params.feetOffset, 2)
    };
    const CHIP_Z = 3;   // the tilemap's normal-character layer, sorted against characters by y

    const rubyRand = (n) => {
        const max = Math.trunc(Math.abs(Number(n) || 0));
        return max === 0 ? Math.random() : Math.floor(Math.random() * max);
    };
    const rubyRound = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));   // halves away from zero
    const clampByte = (v) => Math.max(0, Math.min(255, v));

    // The dash button as the moment's input: no forced route, dashing allowed on the map, no vehicle.
    Game_Player.prototype.rrDashNow = function() {
        return !this._moveRouteForcing && !$gameMap.isDashDisabled() && !this.isInVehicle() && this.isDashButtonPressed();
    };

    class DirtEmitter {
        constructor(spriteset, character, forceOn) {
            this.spriteset = spriteset;
            this.character = character;
            this.forceOn = !!forceOn;
            this.chips = [];
            this.timer = 0;
        }

        update() {
            for (const chip of this.chips) chip.rrUpdateChip();
            this.chips = this.chips.filter(chip => chip.opacity > 0 || (this.spriteset.rrFreeChip(chip), false));
            const c = this.character;
            if (c.isMoving() && (this.forceOn || ($gamePlayer && $gamePlayer.rrDashNow()))) {
                this.timer -= 1;
                if (this.timer <= 0) {
                    this.timer = CFG.SPAWN_INTERVAL;
                    this.spawn();
                    if (rubyRand(2) === 0) this.spawn();
                }
            }
        }

        spawn() {
            if (this.chips.length >= CFG.PUFF_COUNT) this.spriteset.rrFreeChip(this.chips.shift());
            const c = this.character;
            const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
            // The character's feet on screen, 4 px up from its tile's bottom (0 for "!" files), less any jump.
            let px = $gameMap.adjustX(c._realX) * tw + tw / 2;
            let py = $gameMap.adjustY(c._realY) * th + th - (c.isObjectCharacter() ? 0 : 4) - c.jumpHeight();
            py += CFG.FEET_OFFSET;
            const off = CFG.TRAIL_OFFSET;
            switch (c.direction()) {
                case 2: py -= off; break;
                case 8: py += off; break;
                case 4: px += off; break;
                case 6: px -= off; break;
            }
            px += rubyRand(5) - 2;
            py += rubyRand(3) - 1;
            this.chips.push(this.spriteset.rrNewChip(rubyRound(px), rubyRound(py)));
        }

        dispose() {
            for (const chip of this.chips) this.spriteset.rrFreeChip(chip);
            this.chips = [];
        }
    }

    // Chips are pooled per map screen and share one white rectangle, coloured by tint.
    Spriteset_Map.prototype.rrNewChip = function(x, y) {
        if (!this._rrDirtBitmap) {
            this._rrDirtBitmap = new Bitmap(CFG.CHIP_W, CFG.CHIP_H);
            this._rrDirtBitmap.fillAll('#ffffff');
        }
        this._rrDirtPool = this._rrDirtPool || [];
        let chip = this._rrDirtPool.pop();
        if (!chip) {
            chip = new Sprite(this._rrDirtBitmap);
            chip.rrUpdateChip = rrUpdateChip;
            chip.anchor.x = Math.floor(CFG.CHIP_W / 2) / CFG.CHIP_W;
            chip.anchor.y = Math.floor(CFG.CHIP_H / 2) / CFG.CHIP_H;
            chip.blendMode = 1;
            chip.z = CHIP_Z;
        }
        chip._rrVx = (Math.random() * 2 - 1) * CFG.KICK_X_RANGE;
        chip._rrVy = CFG.KICK_Y * (0.7 + Math.random() * 0.6);
        chip.opacity = clampByte(Math.trunc(CFG.START_OPACITY));
        chip.x = x;
        chip.y = y;
        const b = CFG.CHIP_BRIGHTNESS;
        const channel = () => clampByte(b + rubyRand(30) - 15);
        chip.tint = (channel() << 16) | (channel() << 8) | channel();
        chip._rrAngle = rubyRand(360);
        chip.rotation = -chip._rrAngle * Math.PI / 180;
        this._tilemap.addChild(chip);
        return chip;
    };

    Spriteset_Map.prototype.rrFreeChip = function(chip) {
        if (!chip) return;
        if (chip.parent) chip.parent.removeChild(chip);
        (this._rrDirtPool = this._rrDirtPool || []).push(chip);
    };

    // Positions and opacity are whole numbers, truncated after each step; the angle is not.
    function rrUpdateChip() {
        this.opacity = clampByte(this.opacity - CFG.FADE_SPEED);
        this._rrVy += CFG.GRAVITY;
        this.x = Math.trunc(this.x + this._rrVx);
        this.y = Math.trunc(this.y + this._rrVy);
        this._rrAngle = (this._rrAngle + 8) % 360;
        this.rotation = -this._rrAngle * Math.PI / 180;
    }

    Spriteset_Map.prototype.rrUpdateDirtEmitters = function() {
        const emitters = (this._rrDirtEmitters = this._rrDirtEmitters || new Map());
        if (!$gamePlayer) return;
        if (!emitters.has($gamePlayer)) emitters.set($gamePlayer, new DirtEmitter(this, $gamePlayer, false));
        // Followers join and leave as the party changes.
        for (const follower of $gamePlayer.followers()._data || []) {
            if (!follower) continue;
            const visible = !!follower.isVisible();
            if (visible && !emitters.has(follower)) emitters.set(follower, new DirtEmitter(this, follower, false));
            else if (!visible && emitters.has(follower)) {
                emitters.get(follower).dispose();
                emitters.delete(follower);
            }
        }
        for (const event of $gameMap.events()) {
            if (event._rrSmokeTrail && !emitters.has(event)) emitters.set(event, new DirtEmitter(this, event, true));
            else if (!event._rrSmokeTrail && emitters.has(event)) {
                emitters.get(event).dispose();
                emitters.delete(event);
            }
        }
        for (const emitter of emitters.values()) emitter.update();
    };

    const _update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _update.call(this);
        this.rrUpdateDirtEmitters();
    };

    const _destroy = Spriteset_Map.prototype.destroy;
    Spriteset_Map.prototype.destroy = function(options) {
        for (const emitter of (this._rrDirtEmitters || new Map()).values()) emitter.dispose();
        for (const chip of this._rrDirtPool || []) chip.destroy();
        this._rrDirtEmitters = null;
        this._rrDirtPool = null;
        _destroy.call(this, options);
    };
})();
