/*:
 * @target MZ
 * @plugindesc Galv's Move Route Extras (VX Ace), for imported games
 * @author Galv; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_GalvMoveRouteExtras.js
 *
 * Move route Script calls: set_char(name, index, pattern, direction) freezes
 * the character on one cell of a sheet until restore_char; jump_to,
 * jump_to_char, jump_forward, move_toward_event, move_away_from_event,
 * move_toward_xy, move_away_from_xy, self_switch, fadeout, fadein, wait(low,
 * high), repeat / end_repeat / repeat_next.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * below. Turning the plugin off leaves those calls doing nothing.
 */
(() => {
    'use strict';
    const _rrGalvUpdatePattern = Game_CharacterBase.prototype.updatePattern;
    Game_CharacterBase.prototype.updatePattern = function() {
        if (this._rrAnimeStop) return;
        _rrGalvUpdatePattern.call(this);
    };

    Game_Character.prototype.rrSetChar = function(name, index, pattern, direction) {
        this._rrAnimeStop = true;
        this.setImage(String(name), Math.max(0, Number(index) - 1));
        this._pattern = Math.max(0, Number(pattern) - 1);
        if (direction) this._direction = Number(direction);
    };

    Game_Character.prototype.rrRestoreChar = function() {
        this._rrAnimeStop = false;
    };

    Game_Character.prototype.rrJumpTo = function(x, y) {
        this.jump(x - this.x, y - this.y);
    };

    Game_Character.prototype.rrJumpToChar = function(id) {
        const target = id <= 0 ? $gamePlayer : $gameMap.event(id);
        if (target) this.jump(target.x - this.x, target.y - this.y);
    };

    Game_Character.prototype.rrJumpForward = function(count) {
        const d = this.direction();
        this.jump(d === 4 ? -count : d === 6 ? count : 0, d === 8 ? -count : d === 2 ? count : 0);
    };

    Game_Character.prototype.rrMoveTowardXy = function(x, y) {
        const sx = this.deltaXFrom(x), sy = this.deltaYFrom(y);
        if (Math.abs(sx) > Math.abs(sy)) {
            this.moveStraight(sx > 0 ? 4 : 6);
            if (!this.isMovementSucceeded() && sy !== 0) this.moveStraight(sy > 0 ? 8 : 2);
        } else if (sy !== 0) {
            this.moveStraight(sy > 0 ? 8 : 2);
            if (!this.isMovementSucceeded() && sx !== 0) this.moveStraight(sx > 0 ? 4 : 6);
        }
    };

    Game_Character.prototype.rrMoveAwayFromXy = function(x, y) {
        const sx = this.deltaXFrom(x), sy = this.deltaYFrom(y);
        if (Math.abs(sx) > Math.abs(sy)) {
            this.moveStraight(sx > 0 ? 6 : 4);
            if (!this.isMovementSucceeded() && sy !== 0) this.moveStraight(sy > 0 ? 2 : 8);
        } else if (sy !== 0) {
            this.moveStraight(sy > 0 ? 2 : 8);
            if (!this.isMovementSucceeded() && sx !== 0) this.moveStraight(sx > 0 ? 6 : 4);
        }
    };

    Game_Character.prototype.rrSelfSwitch = function(letter, value, id) {
        const eventId = id === undefined ? (this.eventId ? this.eventId() : 0) : id;
        if (eventId > 0) $gameSelfSwitches.setValue([$gameMap.mapId(), eventId, String(letter)], !!value);
    };

    // Fades step the opacity each frame by repeating their own route command.
    Game_Character.prototype.rrFadeOut = function(speed) {
        this.setOpacity(Math.max(0, this.opacity() - speed));
        if (this.opacity() > 0) this._moveRouteIndex--;
    };

    Game_Character.prototype.rrFadeIn = function(speed) {
        this.setOpacity(Math.min(255, this.opacity() + speed));
        if (this.opacity() < 255) this._moveRouteIndex--;
    };

    Game_Character.prototype.rrWaitBetween = function(low, high) {
        const a = Math.min(low, high), b = Math.max(low, high);
        this._waitCount = a + Math.randomInt(b - a + 1) - 1;
    };

    Game_Character.prototype.rrRepeat = function(times) {
        this._rrRepeats = times - 1;
        this._rrRepeatAt = this._moveRouteIndex;
    };

    Game_Character.prototype.rrEndRepeat = function() {
        if (this._rrRepeats > 0) {
            this._rrRepeats--;
            this._moveRouteIndex = this._rrRepeatAt;
        }
    };

    Game_Character.prototype.rrRepeatNext = function(times) {
        this._rrRepeatNext = times - 1;
    };

    const _rrGalvProcessMoveCommand = Game_Character.prototype.processMoveCommand;
    Game_Character.prototype.processMoveCommand = function(command) {
        _rrGalvProcessMoveCommand.call(this, command);
        // repeat_next: the command after the call runs again until the count is spent.
        if (this._rrRepeatNext > 0 && !(command.code === Game_Character.ROUTE_SCRIPT && /rrRepeatNext/.test(command.parameters[0]))) {
            this._rrRepeatNext--;
            this._moveRouteIndex--;
        }
    };
})();
