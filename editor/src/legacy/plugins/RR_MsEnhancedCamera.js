/*:
 * @target MZ
 * @plugindesc Enhanced Camera (VX Ace), for imported games
 * @author RPG Maker Source (Maker Systems); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_MsEnhancedCamera.js
 *
 * A camera that glides after the player instead of snapping, eases to points
 * and characters, can follow an event, and can be locked in place.
 *
 * Script calls (Game_Interpreter):
 *   this.rrCamCenterAt(x, y, frames)      ease the camera to centre on a tile
 *   this.rrCamCenterAtChar(id, frames)    same, on a character's tile
 *                                         (-1 player, 0 this event, n event)
 *   this.rrCamWaitForScrolling()          wait until the camera stops
 *   this.rrCamFocusOn(id, canCancel, key) follow a character; -1 returns to
 *                                         the player. key ("CTRL", "SHIFT",
 *                                         "C"...) lets the player cancel it.
 *   this.rrCamOnScreen(id)                true when the character is on screen
 * Game_Map:
 *   $gameMap.rrCamIgnorePlayer(bool)      stop/resume following the player
 *   $gameMap.rrCamLock(bool)              freeze the camera
 *   $gameMap.rrCamStrength(value)         follow deceleration; no value resets
 * $gameSystem._rrCamDisabled = true turns the camera back to stock scrolling.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * above. Turning the plugin off leaves those calls doing nothing.
 *
 * @param deceleration
 * @text Deceleration
 * @type number
 * @decimals 2
 * @min 1
 * @default 22
 * @desc How slowly the camera catches up while following (1 = snaps like stock). The original's Deceleration_Value.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_MsEnhancedCamera');
    const DECELERATION = Number(params.deceleration) > 0 ? Number(params.deceleration) : 22;

    // VX Ace Input symbols → MZ key names. X/Y/Z and F5-F8 have no MZ name; they get
    // one (on their Ace keyboard keys) only when a focus call asks for them.
    const KEYS = { DOWN: 'down', LEFT: 'left', RIGHT: 'right', UP: 'up', A: 'shift', B: 'cancel', C: 'ok', L: 'pageup', R: 'pagedown',
        SHIFT: 'shift', CTRL: 'control', ALT: 'control', F9: 'debug' };
    const EXTRA_KEYS = { X: 65, Y: 83, Z: 68, F5: 116, F6: 117, F7: 118, F8: 119 };
    const keyName = (key) => {
        const name = String(key == null ? 'CTRL' : key).replace(/^:/, '').toUpperCase();
        if (KEYS[name]) return KEYS[name];
        const code = EXTRA_KEYS[name];
        if (!code) return 'control';
        if (!Input.keyMapper[code]) Input.keyMapper[code] = 'rr' + name;
        return Input.keyMapper[code];
    };
    const mod = (v, n) => ((v % n) + n) % n;
    const disabled = () => !!($gameSystem && $gameSystem._rrCamDisabled);

    //-------------------------------------------------------------------------
    // Game_Interpreter
    //-------------------------------------------------------------------------
    Game_Interpreter.prototype.rrCamCenterAt = function(x, y, frames) {
        $gameMap.rrCamGoTo(Number(x), Number(y), frames);
    };

    Game_Interpreter.prototype.rrCamCenterAtChar = function(id, frames) {
        const character = this.character(id);
        if (character) $gameMap.rrCamGoTo(character.x, character.y, frames);
    };

    Game_Interpreter.prototype.rrCamWaitForScrolling = function() {
        this.setWaitMode('rrCamScroll');
    };

    Game_Interpreter.prototype.rrCamFocusOn = function(id, canCancel = false, key = 'CTRL') {
        const character = this.character(id);
        if (!character) return;
        if (character === $gamePlayer) {
            $gameMap._rrCamTargetId = 0;
            $gameMap._rrCamIgnorePlayer = false;
            $gameMap.rrCamCenter(character._realX, character._realY);
        } else if (character instanceof Game_Event) {
            // An id, not the event: a saved object reference would come back as a detached copy.
            $gameMap._rrCamTargetId = character.eventId();
            $gameMap._rrCamCancel = !!canCancel;
            $gameMap._rrCamCancelKey = keyName(key);
        }
    };

    Game_Interpreter.prototype.rrCamOnScreen = function(id) {
        const character = this.character(id);
        if (!character) return false;
        const sx = character.screenX(), sy = character.screenY();
        return sx > 0 && sx < Graphics.width && sy > 0 && sy < Graphics.height;
    };

    const _rrCamUpdateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode !== 'rrCamScroll') return _rrCamUpdateWaitMode.call(this);
        // A pending ease never advances with the camera disabled, so it can't hold the event then.
        const waiting = $gameMap.isScrolling() || ($gameMap._rrCamIter != null && !disabled());
        if (!waiting) this._waitMode = '';
        return waiting;
    };

    //-------------------------------------------------------------------------
    // Game_Map
    //-------------------------------------------------------------------------
    Game_Map.prototype.rrCamIgnorePlayer = function(value) { this._rrCamIgnorePlayer = !!value; };
    Game_Map.prototype.rrCamLock = function(value) { this._rrCamLocked = !!value; };
    Game_Map.prototype.rrCamStrength = function(value) {
        this._rrCamStr = value === undefined || value === null ? DECELERATION : Number(value);
    };
    Game_Map.prototype.rrCamStr = function() {
        const str = this._rrCamStr === undefined ? DECELERATION : this._rrCamStr;
        return str > 0 ? str : 1;
    };

    /** Sets where the camera heads: the display position that centres (realX, realY). */
    Game_Map.prototype.rrCamCenter = function(realX, realY, hard = false) {
        const stx = this.screenTileX(), sty = this.screenTileY();
        let x = realX - Math.floor(stx / 2);
        let y = realY - Math.floor(sty / 2);
        if (!this.isLoopHorizontal()) x = Math.min(Math.max(x, 0), Math.max(this.width() - stx, 0));
        if (!this.isLoopVertical()) y = Math.min(Math.max(y, 0), Math.max(this.height() - sty, 0));
        this._rrCamRealX = mod(x, this.width());
        this._rrCamRealY = mod(y, this.height());
        if (hard) {
            this._displayX = this._rrCamRealX;
            this._displayY = this._rrCamRealY;
        }
    };

    /** Shortest signed distance from current to target, across the map edge when the axis loops. */
    Game_Map.prototype.rrCamAmplitude = function(current, target, limit, loops) {
        if (!loops) return target - current;
        const forward = mod(target - current, limit), back = mod(current - target, limit);
        return forward < back ? forward : -back;
    };

    Game_Map.prototype.rrCamGoTo = function(x, y, frames = 60) {
        if (this._rrCamLocked) return;
        const period = Number(frames);
        if (!(period > 0)) {
            // The original divides by the period; zero frames would never finish, so it's a cut.
            this.rrCamCenter(x, y, true);
            this._rrCamIter = null;
            return;
        }
        this.rrCamCenter(x, y);
        this._rrCamAmpX = this.rrCamAmplitude(this._displayX, this._rrCamRealX, this.width(), this.isLoopHorizontal());
        this._rrCamAmpY = this.rrCamAmplitude(this._displayY, this._rrCamRealY, this.height(), this.isLoopVertical());
        this._rrCamIter = 0;
        this._rrCamOrigX = this._displayX;
        this._rrCamOrigY = this._displayY;
        this._rrCamPeriod = period;
    };

    Game_Map.prototype.rrCamUpdateFocus = function() {
        if (!this._rrCamTargetId) return;
        const target = this.event(this._rrCamTargetId);
        if (!target) {
            this._rrCamTargetId = 0;
        } else if (this._rrCamCancel && Input.isTriggered(this._rrCamCancelKey)) {
            this._rrCamTargetId = 0;
            this.rrCamCenter($gamePlayer._realX, $gamePlayer._realY);
        } else {
            this.rrCamCenter(target._realX, target._realY);
        }
    };

    const _rrCamUpdateScroll = Game_Map.prototype.updateScroll;
    Game_Map.prototype.updateScroll = function() {
        if (disabled()) return _rrCamUpdateScroll.call(this);
        // Locked freezes everything, event-command scrolls included, as in the original.
        if (this._rrCamLocked) return;
        // A save from before the plugin was on has no camera target yet.
        if (this._rrCamRealX == null) { this._rrCamRealX = this._displayX; this._rrCamRealY = this._displayY; }
        this.rrCamUpdateFocus();
        if (this._rrCamIter != null) {
            // Sine ease over frames + 1 updates, ending at sin(1.57), as the original does.
            const t = Math.min(this._rrCamIter / this._rrCamPeriod, 1);
            const s = Math.sin(t * 1.57);
            this._displayX = mod(this._rrCamOrigX + this._rrCamAmpX * s, this.width());
            this._displayY = mod(this._rrCamOrigY + this._rrCamAmpY * s, this.height());
            if (t >= 1) {
                this._rrCamIter = null;
                this._rrCamRealX = this._displayX;
                this._rrCamRealY = this._displayY;
            } else {
                this._rrCamIter++;
            }
        } else if (this.isScrolling()) {
            this._rrCamRealX = this._displayX;
            this._rrCamRealY = this._displayY;
        } else {
            const str = this.rrCamStr();
            this._displayX = mod(this._displayX + this.rrCamAmplitude(this._displayX, this._rrCamRealX, this.width(), this.isLoopHorizontal()) / str, this.width());
            this._displayY = mod(this._displayY + this.rrCamAmplitude(this._displayY, this._rrCamRealY, this.height(), this.isLoopVertical()) / str, this.height());
        }
        _rrCamUpdateScroll.call(this);
    };

    // The followed event belongs to the map it was on.
    const _rrCamSetup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _rrCamSetup.call(this, mapId);
        this._rrCamTargetId = 0;
    };

    //-------------------------------------------------------------------------
    // Game_Player
    //-------------------------------------------------------------------------
    const _rrCamPlayerUpdate = Game_Player.prototype.update;
    Game_Player.prototype.update = function(sceneActive) {
        this._rrCamLastRealX = this._realX;
        this._rrCamLastRealY = this._realY;
        _rrCamPlayerUpdate.call(this, sceneActive);
    };

    Game_Player.prototype.rrCamMoving = function() {
        return this.isMoving() || this._rrCamLastRealX !== this._realX || this._rrCamLastRealY !== this._realY;
    };

    // Replaced, not wrapped: the stock edge-scroll would fight the camera's own
    // follow every frame. Disabled hands back to the stock method.
    const _rrCamPlayerUpdateScroll = Game_Player.prototype.updateScroll;
    Game_Player.prototype.updateScroll = function(lastScrolledX, lastScrolledY) {
        if (disabled()) return _rrCamPlayerUpdateScroll.call(this, lastScrolledX, lastScrolledY);
        const map = $gameMap;
        if (map._rrCamTargetId || map._rrCamIter != null || map._rrCamIgnorePlayer || !this.rrCamMoving()) return;
        map.rrCamCenter(this._realX, this._realY);
    };

    // Replaced for the same reason: the camera centres on whole tiles and a lock must hold.
    const _rrCamPlayerCenter = Game_Player.prototype.center;
    Game_Player.prototype.center = function(x, y) {
        if (disabled()) return _rrCamPlayerCenter.call(this, x, y);
        if ($gameMap._rrCamLocked) return;
        $gameMap.rrCamCenter(Number(x), Number(y), true);
    };
})();
