/*:
 * @target MZ
 * @plugindesc Trace Stealth System (VX Ace), for imported games
 * @author Prof. Meow Meow, converted by LiTTleDRAgo; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_PmmStealth.js
 *
 * Guards that see and hear the player. Every event with "tracer" in its name
 * is a guard. When the guard or the player moves, the guard looks: the player
 * must stand in a square of sight ahead of it (sight range 9 = a 9×9 square
 * starting on the tile in front), be visible (not transparent, opacity above
 * the hide opacity, hide switch off), and a line from the guard to the player
 * must not cross a blocked tile. Seen, every active guard shows "!", the alert
 * switch turns on and a countdown starts; when it runs out (it pauses while a
 * message is up) every guard shows "?" and the alert switch turns off. Guards
 * do not look again while the alert switch is on.
 *
 * Noise: a guard within range of a noise gets its caution self switch and
 * shows "?"; its route then walks toward the noise, and within one tile of
 * it the caution self switch turns off. The player makes noise every sixth
 * step while dashing. A guard is deaf and blind when erased or when its
 * disabling self switch is on.
 *
 * Move route Script (this = the character):
 *   this.rrTssNoise(range)    a noise at the character
 *   this.rrTssInvestigate()   one step toward the last noise heard
 * Script calls: this.rrTssHuh() / this.rrTssHey() show ? / ! over every
 * active guard. $gameMap.rrSetTraceRange(n), $gamePlayer.rrSetSprintNoise(n).
 *
 * Kept as the game played it: the line of sight tests only every 17th pixel
 * along the line, and a tile counts as blocked when the player could not step
 * from it in the guard's facing direction (so the player's own tile can hide
 * them when the tile beyond is a wall). A guard walking toward a noise tries
 * only the longer axis and does not step around what blocks it. A guard
 * created with the map listens toward tile (0, 0) until it hears a noise.
 * A balloon asked for while one plays on the same character is dropped.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param alertSwitch
 * @type switch
 * @default 1
 *
 * @param alertCountdown
 * @type number
 * @default 1800
 * @desc Frames the alert switch stays on after a guard sees the player.
 *
 * @param traceRange
 * @type number
 * @default 5
 *
 * @param hideOpacity
 * @type number
 * @default 50
 *
 * @param hideSwitch
 * @type switch
 * @default 2
 *
 * @param cautionSelfSwitch
 * @default C
 *
 * @param sprintNoise
 * @type number
 * @default 6
 *
 * @param allowDisabling
 * @type boolean
 * @default true
 *
 * @param disablingSelfSwitch
 * @default D
 *
 * @param showAlert
 * @type boolean
 * @default true
 *
 * @param playAlert
 * @type boolean
 * @default false
 *
 * @param alertMe
 * @param alertVolume
 * @type number
 * @default 100
 * @param alertPitch
 * @type number
 * @default 100
 *
 * @param showQuit
 * @type boolean
 * @default true
 *
 * @param showCaution
 * @type boolean
 * @default true
 *
 * @param playCaution
 * @type boolean
 * @default false
 *
 * @param cautionMe
 * @param cautionVolume
 * @type number
 * @default 100
 * @param cautionPitch
 * @type number
 * @default 100
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_PmmStealth');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const bool = (v, d) => (v === undefined || v === '' ? d : String(v) === 'true');
    const S = {
        alertSwitch: num(params.alertSwitch, 1), alertCountdown: num(params.alertCountdown, 1800), traceRange: num(params.traceRange, 5),
        hideOpacity: num(params.hideOpacity, 50), hideSwitch: num(params.hideSwitch, 2), caution: String(params.cautionSelfSwitch || 'C'),
        sprintNoise: num(params.sprintNoise, 6), allowDisabling: bool(params.allowDisabling, true), disabling: String(params.disablingSelfSwitch || 'D'),
        showAlert: bool(params.showAlert, true), playAlert: bool(params.playAlert, false), alertMe: String(params.alertMe || ''),
        alertVolume: num(params.alertVolume, 100), alertPitch: num(params.alertPitch, 100), showQuit: bool(params.showQuit, true),
        showCaution: bool(params.showCaution, true), playCaution: bool(params.playCaution, false), cautionMe: String(params.cautionMe || ''),
        cautionVolume: num(params.cautionVolume, 100), cautionPitch: num(params.cautionPitch, 100)
    };
    const CHECK_INTERVAL = 16;
    const TILE = 32;

    const selfSwitch = (ev, letter) => $gameSelfSwitches.value([ev._mapId, ev._eventId, letter]);
    const setSelfSwitch = (ev, letter, value) => { $gameSelfSwitches.setValue([ev._mapId, ev._eventId, letter], value); $gameMap.requestRefresh(); };
    const isTracer = (ev) => !!(ev && ev instanceof Game_Event && ev.event() && String(ev.event().name).includes('tracer') && !ev._erased);
    const disabled = (ev) => S.allowDisabling && selfSwitch(ev, S.disabling);
    // The guards that can see and hear: tracers, not erased, disabling self switch off.
    const activeTracers = () => $gameMap.events().filter(ev => isTracer(ev) && !disabled(ev));
    const playMe = (name, volume, pitch) => { if (name) AudioManager.playMe({ name, volume, pitch, pan: 0 }); };

    // A balloon set while one plays is lost when that one ends; set twice before it starts, the last one shows.
    const balloon = (ch, id) => {
        const pending = ($gameTemp._balloonQueue || []).find(r => r.target === ch);
        if (pending) { pending.balloonId = id; return; }
        if (ch.isBalloonPlaying && ch.isBalloonPlaying()) return;
        $gameTemp.requestBalloon(ch, id);
    };

    // Bresenham's line between two pixel points, ordered from (x0, y0).
    const getLine = (x0, y0, x1, y1) => {
        const ox = x0, oy = y0, points = [];
        const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
        if (steep) { [x0, y0] = [y0, x0]; [x1, y1] = [y1, x1]; }
        if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
        const dx = x1 - x0, dy = Math.abs(y1 - y0);
        let error = Math.floor(dx / 2), y = y0;
        const ystep = y0 < y1 ? 1 : -1;
        for (let x = x0; x <= x1; x++) {
            points.push(steep ? { x: y, y: x } : { x, y });
            error -= dy;
            if (error < 0) { y += ystep; error += dx; }
        }
        if (ox !== points[0].x || oy !== points[0].y) points.reverse();
        return points;
    };

    //--------------------------------------------------------------------------
    // Game_Map: sight range and the alert countdown

    Object.assign(Game_Map.prototype, {
        rrTraceRange() { return this._rrTraceRange; },
        rrSetTraceRange(n) { this._rrTraceRange = Number(n); },
        rrAlertCountdown() { return this._rrAlertCountdown || 0; },
        rrSetAlertCountdown(n) { this._rrAlertCountdown = Number(n); }
    });

    const _Game_Map_update = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        _Game_Map_update.apply(this, arguments);
        // The range is first set after the first map update: guards that look before it skip the square of sight.
        if (this._rrTraceRange === undefined || this._rrTraceRange === null) this._rrTraceRange = S.traceRange;
        if (this._rrAlertCountdown === undefined || this._rrAlertCountdown === null) this._rrAlertCountdown = 0;
        if (this._rrAlertCountdown > 0 && !$gameMessage.isBusy()) {
            this._rrAlertCountdown -= 1;
        } else if (this._rrAlertCountdown <= 0 && $gameSwitches.value(S.alertSwitch)) {
            if (S.showQuit) for (const ev of activeTracers()) balloon(ev, 2);
            $gameSwitches.setValue(S.alertSwitch, false);
            this.requestRefresh();
        }
    };

    //--------------------------------------------------------------------------
    // Game_Character: guards look after they update

    const _Game_Character_update = Object.prototype.hasOwnProperty.call(Game_Character.prototype, 'update') ? Game_Character.prototype.update : null;
    Game_Character.prototype.update = function() {
        if (_Game_Character_update) _Game_Character_update.apply(this, arguments);
        else Game_CharacterBase.prototype.update.apply(this, arguments);
        if (isTracer(this)) this.rrTssUpdate();
    };

    Object.assign(Game_Character.prototype, {
        rrTssUpdate() {
            const t = this._rrTss || (this._rrTss = { oldX: 0, oldY: 0, oldPx: 0, oldPy: 0, ax: 0, ay: 0 });
            if (t.oldX !== this._x || t.oldY !== this._y || t.oldPx !== $gamePlayer.x || t.oldPy !== $gamePlayer.y) {
                if (!$gameSwitches.value(S.alertSwitch) && this.rrTssTrace()) {
                    if (S.playAlert) playMe(S.alertMe, S.alertVolume, S.alertPitch);
                    if (S.showAlert) for (const ev of activeTracers()) balloon(ev, 1);
                    $gameSwitches.setValue(S.alertSwitch, true);
                    $gameMap._rrAlertCountdown = S.alertCountdown;
                    $gameMap.requestRefresh();
                }
                t.oldX = this._x; t.oldY = this._y;
                t.oldPx = $gamePlayer.x; t.oldPy = $gamePlayer.y;
            }
            if (Math.max(Math.abs(this._x - t.ax), Math.abs(this._y - t.ay)) < 2 && selfSwitch(this, S.caution)) {
                if (S.showQuit) balloon(this, 2);
                setSelfSwitch(this, S.caution, false);
            }
        },

        // Whether this guard sees the player now.
        rrTssTrace(range = $gameMap._rrTraceRange) {
            if (disabled(this)) return false;
            const p = $gamePlayer;
            if (p.isTransparent() || $gameSwitches.value(S.hideSwitch) || p.opacity() <= S.hideOpacity) return false;
            if ((range || 0) > 0 && !this.rrTssInSightField()) return false;
            const line = getLine(this._x * TILE + 16, this._y * TILE + 16, p.x * TILE + 16, p.y * TILE + 16);
            let countdown = CHECK_INTERVAL;
            for (const point of line) {
                if (countdown > 0) { countdown -= 1; continue; }
                countdown = CHECK_INTERVAL;
                const x = Math.floor(point.x / TILE), y = Math.floor(point.y / TILE);
                if (!p.canPass(x, y, this._direction) && !this.pos(x, y)) break;
                if (p.pos(x, y)) return true;
            }
            return false;
        },

        // The square of sight: side (range | 1), its near edge on the tile in front of the guard.
        rrTssInSightField() {
            const range = 1 + Math.floor(($gameMap._rrTraceRange || 0) / 2);
            let cx = this._x, cy = this._y;
            if (this._direction === 2) cy += range;
            if (this._direction === 4) cx -= range;
            if (this._direction === 6) cx += range;
            if (this._direction === 8) cy -= range;
            return Math.max(Math.abs(cx - $gamePlayer.x), Math.abs(cy - $gamePlayer.y)) < range;
        },

        // A noise at this character: guards within range (in tiles, square) turn toward it. Unheard during an alert.
        rrTssNoise(range = 0) {
            if ($gameSwitches.value(S.alertSwitch) !== false) return;
            for (const ev of activeTracers()) {
                if (Math.max(Math.abs(ev.x - this._x), Math.abs(ev.y - this._y)) > Number(range)) continue;
                if (S.playCaution) playMe(S.cautionMe, S.cautionVolume, S.cautionPitch);
                const t = ev._rrTss || (ev._rrTss = { oldX: 0, oldY: 0, oldPx: 0, oldPy: 0, ax: 0, ay: 0 });
                t.ax = this._x; t.ay = this._y;
                if (S.showCaution) balloon(ev, 2);
                setSelfSwitch(ev, S.caution, true);
            }
        },

        // One step of a guard's search: toward the noise (4 in 6), a random step, or straight on; random when 20+ tiles off.
        rrTssInvestigate() {
            const t = this._rrTss || { ax: 0, ay: 0 };
            const sx = this._x - t.ax, sy = this._y - t.ay;
            if (Math.abs(sx) + Math.abs(sy) >= 20) { this.moveRandom(); return; }
            const roll = Math.randomInt(6);
            if (roll <= 3) this.rrTssMoveToward(t.ax, t.ay);
            else if (roll === 4) this.moveRandom();
            else this.moveForward();
        },

        // One step along the longer axis toward (x, y), vertical on a tie. No second try on the other axis.
        rrTssMoveToward(x, y) {
            const sx = this._x - x, sy = this._y - y;
            if (sx === 0 && sy === 0) return;
            if (Math.abs(sx) > Math.abs(sy)) this.moveStraight(sx > 0 ? 4 : 6);
            else this.moveStraight(sy > 0 ? 8 : 2);
        }
    });

    //--------------------------------------------------------------------------
    // Game_Player: dashing makes noise every sixth step

    Object.assign(Game_Player.prototype, {
        rrSprintNoise() { return this._rrSprintNoise; },
        rrSetSprintNoise(n) { this._rrSprintNoise = Number(n); }
    });

    const _Game_Player_update = Game_Player.prototype.update;
    Game_Player.prototype.update = function(sceneActive) {
        _Game_Player_update.apply(this, arguments);
        if (this._rrOldSteps === undefined) this._rrOldSteps = 0;
        // A range of 0 is kept (Ruby's ||= only replaces nil): it wakes guards on the player's own tile.
        if (this._rrSprintNoise === undefined || this._rrSprintNoise === null) this._rrSprintNoise = S.sprintNoise;
        if ($gameParty.steps() > this._rrOldSteps + 5 && this.isMoving() && this.isDashing()) {
            this.rrTssNoise(this._rrSprintNoise);
            this._rrOldSteps = $gameParty.steps();
        }
    };

    //--------------------------------------------------------------------------
    // Script calls

    Game_Interpreter.prototype.rrTssHuh = function() { for (const ev of activeTracers()) balloon(ev, 2); };
    Game_Interpreter.prototype.rrTssHey = function() { for (const ev of activeTracers()) balloon(ev, 1); };
})();
