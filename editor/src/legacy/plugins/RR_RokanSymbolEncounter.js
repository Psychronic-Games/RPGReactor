/*:
 * @target MZ
 * @plugindesc Symbol Encounter Simplifying Script (VX Ace), for imported games
 * @author Rokan (translated by kirinelf); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_RokanSymbolEncounter.js
 *
 * Touch-encounter symbols: an event that wanders or stands until the player
 * comes within range, then chases (or flees once the party outlevels it).
 *
 * Move route Script (Autonomous Movement › Custom, the event itself):
 *   this.rrEnableSymbolEncounter(type)   use row `type` of the Symbol types
 * From then on the page's own move route is ignored; a page change turns the
 * symbol off again. The symbol does not turn toward the player when its event
 * starts.
 *
 * Stealth: an item or skill whose note has <stealth:N> hides the player from
 * every symbol for N steps. $gamePlayer._rrStealthCount holds the steps left
 * (set it to 0 to cancel).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * above. Turning the plugin off leaves those calls doing nothing.
 *
 * @param types
 * @text Symbol types
 * @type multiline_string
 * @default {"0":[0,2,1,2,0,0,2,4,5,5,0,[]]}
 * @desc JSON: type → [flee level, level type (0 average, 1 highest, 2 leader), range, dash range, idle (0 random, 1 stand), visibility, speed before, speed after, frequency before, frequency after, balloon, [blocked regions]].
 *
 * @param followerContact
 * @text Followers start battles
 * @type boolean
 * @default false
 * @desc Touching a follower starts the symbol's event too. The original's FOLLOWER_CONTACT.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_RokanSymbolEncounter');
    let TYPES = {};
    try { TYPES = JSON.parse(params.types || '{}') || {}; } catch (_) { TYPES = {}; }
    const FOLLOWER_CONTACT = params.followerContact === 'true';

    const interpreterRunning = () => $gameMap._interpreter.isRunning();

    //-------------------------------------------------------------------------
    // Stealth
    //-------------------------------------------------------------------------
    const stealthSteps = (item) => {
        for (const line of String((item && item.note) || '').split(/\r?\n/)) {
            const m = /stealth:(\d+)/i.exec(line);
            if (m) return Number(m[1]);
        }
        return 0;
    };

    const _rrSymbolUseItem = Game_Battler.prototype.useItem;
    Game_Battler.prototype.useItem = function(item) {
        if (this.isActor()) {
            const steps = stealthSteps(item);
            if (steps > 0) $gamePlayer._rrStealthCount = steps;
        }
        _rrSymbolUseItem.call(this, item);
    };

    Game_Player.prototype.rrStealthed = function() {
        return !!this._rrStealthCount;
    };

    const _rrSymbolIncreaseSteps = Game_Player.prototype.increaseSteps;
    Game_Player.prototype.increaseSteps = function() {
        _rrSymbolIncreaseSteps.call(this);
        if (this.rrStealthed()) this._rrStealthCount--;
    };

    //-------------------------------------------------------------------------
    // Game_Event
    //-------------------------------------------------------------------------
    const _rrSymbolSetupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function() {
        this._rrSymbol = null;
        this._rrSymbolForming = false;
        _rrSymbolSetupPage.call(this);
    };

    Game_Event.prototype.rrEnableSymbolEncounter = function(type) {
        const row = TYPES[type];
        if (!Array.isArray(row)) return;
        this._rrSymbol = {
            awayLevel: Number(row[0]) || 0, levelType: Number(row[1]) || 0,
            range: Number(row[2]) || 0, dashRange: Number(row[3]) || 0, idle: Number(row[4]) || 0,
            speedBefore: Number(row[6]) || 0, speedAfter: Number(row[7]) || 0,
            freqBefore: Number(row[8]) || 0, freqAfter: Number(row[9]) || 0,
            balloon: Number(row[10]) || 0, regions: Array.isArray(row[11]) ? row[11].map(Number) : []
        };
    };

    const _rrSymbolCanPass = Game_Event.prototype.canPass;
    Game_Event.prototype.canPass = function(x, y, d) {
        if (this._rrSymbol) {
            const x2 = $gameMap.roundXWithDirection(x, d), y2 = $gameMap.roundYWithDirection(y, d);
            if (this._rrSymbol.regions.includes($gameMap.regionId(x2, y2))) return false;
        }
        return _rrSymbolCanPass.call(this, x, y, d);
    };

    // A symbol keeps its facing when its event starts, so the stock turn toward
    // the player is skipped for symbols only; every other event runs the original.
    const _rrSymbolLock = Game_Event.prototype.lock;
    Game_Event.prototype.lock = function() {
        if (!this._rrSymbol) return _rrSymbolLock.call(this);
        if (!this._locked) {
            this._prelockDirection = this.direction();
            this._locked = true;
        }
    };

    Game_Event.prototype.rrPlayerLevel = function() {
        const members = $gameParty.members();
        if (!members.length) return 0;
        switch (this._rrSymbol.levelType) {
            case 0: return Math.floor(members.reduce((sum, actor) => sum + actor.level, 0) / members.length);
            case 1: return Math.max(...members.map(actor => actor.level));
            default: return members[0].level;
        }
    };

    Game_Event.prototype.rrDistanceFromPlayer = function() {
        return Math.abs(this.deltaXFrom($gamePlayer.x)) + Math.abs(this.deltaYFrom($gamePlayer.y));
    };

    // Once chasing, the symbol only loses the player one tile beyond its dash range.
    Game_Event.prototype.rrReactionDistance = function() {
        const s = this._rrSymbol;
        if (this._rrSymbolForming) return s.dashRange + 1;
        if ($gamePlayer.isDashing() && $gamePlayer.isMoving()) return s.dashRange;
        return s.range;
    };

    Game_Event.prototype.rrSymbolActive = function() {
        if (interpreterRunning()) return false;
        if (this._erased || $gamePlayer.rrStealthed()) {
            this._rrSymbolForming = false;
            return false;
        }
        return true;
    };

    Game_Event.prototype.rrStartForming = function() {
        const s = this._rrSymbol;
        AudioManager.playSe({ name: 'Absorb1', volume: 70, pitch: 150, pan: 0 });
        this._moveSpeed = s.speedAfter;
        this._moveFrequency = s.freqAfter;
        if (s.balloon) {
            // The original plays the cue a second time with the balloon.
            AudioManager.playSe({ name: 'Absorb1', volume: 70, pitch: 150, pan: 0 });
            $gameTemp.requestBalloon(this, s.balloon);
        }
    };

    Game_Event.prototype.rrEndForming = function() {
        this._moveSpeed = this._rrSymbol.speedBefore;
        this._moveFrequency = this._rrSymbol.freqBefore;
    };

    Game_Event.prototype.rrUpdateSymbolReaction = function() {
        if (!this.rrSymbolActive()) return;
        const reacting = this.rrDistanceFromPlayer() <= this.rrReactionDistance();
        if (!this._rrSymbolForming && reacting) this.rrStartForming();
        else if (this._rrSymbolForming && !reacting) this.rrEndForming();
        this._rrSymbolForming = reacting;
    };

    Game_Event.prototype.rrReactionMovement = function() {
        const s = this._rrSymbol;
        this._moveSpeed = s.speedAfter;
        this._moveFrequency = s.freqAfter;
        if (s.awayLevel && this.rrPlayerLevel() > s.awayLevel) this.moveAwayFromPlayer();
        else this.moveTypeTowardPlayer();
    };

    Game_Event.prototype.rrNonreactionMovement = function() {
        const s = this._rrSymbol;
        this._moveSpeed = s.speedBefore;
        this._moveFrequency = s.freqBefore;
        if (s.idle === 0) this.moveTypeRandom();
    };

    const _rrSymbolUpdate = Game_Event.prototype.update;
    Game_Event.prototype.update = function() {
        if (this._rrSymbol && this._waitCount <= 0 && !this.isMoveRouteForcing()) this.rrUpdateSymbolReaction();
        _rrSymbolUpdate.call(this);
    };

    const _rrSymbolUpdateSelfMovement = Game_Event.prototype.updateSelfMovement;
    Game_Event.prototype.updateSelfMovement = function() {
        if (!this._rrSymbol) return _rrSymbolUpdateSelfMovement.call(this);
        if (!this.isNearTheScreen() || !this.checkStop(this.stopCountThreshold())) return;
        if (this.rrSymbolActive() && this._rrSymbolForming) this.rrReactionMovement();
        else this.rrNonreactionMovement();
    };

    const _rrSymbolCheckTouch = Game_Event.prototype.checkEventTriggerTouch;
    Game_Event.prototype.checkEventTriggerTouch = function(x, y) {
        if (!(this._rrSymbol && FOLLOWER_CONTACT)) return _rrSymbolCheckTouch.call(this, x, y);
        // Followers count as the player here.
        if (interpreterRunning()) return;
        if (this._trigger === 2 && this.isCollidedWithPlayerCharacters(x, y) && !this.isJumping()) this.start();
    };
})();
