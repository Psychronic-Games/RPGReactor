//=============================================================================
// reactor_objects_legacy.js v1.8.0
//=============================================================================
// Event commands of RPG Maker 2000/2003 that MZ lacks, [fN] character sheets,
// and Script commands that wait inside a loop.
// Part of reactor_objects.js; loads after reactor_objects_interpreter.js.

//-----------------------------------------------------------------------------
// Equivalents of RPG Maker 2000/2003 event commands that MZ has no command
// for: calling a map event's page, waiting on key input into a variable,
// waiting for or halting every move route, flashing one character, reading
// a tileset's terrain number, and resetting the camera after a pan. The
// legacy importer emits Script calls to these; they are ordinary engine
// features and work in any project. A class with an `expTable` uses it in
// place of the four EXP parameters, so an imported EXP curve is exact.

(function() {
    const _updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode === "rrSystemGraphic") {
            const skin = ColorManager._windowskin;
            if ((skin && !skin.isReady()) || !FontManager.isReady()) return true;
            this._waitMode = "";
            return false;
        }
        if (this._waitMode === "rrKeyInput") {
            const k = this._rrKeyInput;
            if (!k) { this._waitMode = ""; return false; }
            k.frames++;
            const code = this.rrKeyInputCheck(k.keys);
            if (code) {
                $gameVariables.setValue(k.variableId, code);
                if (k.timeVariableId) $gameVariables.setValue(k.timeVariableId, Math.floor(k.frames / 6));
                this._waitMode = "";
                this._rrKeyInput = null;
                return false;
            }
            return true;
        }
        if (this._waitMode === "rrPan") {
            if ($gameMap._rrPanReturn) return true;
            this._waitMode = "";
            return false;
        }
        if (this._waitMode === "rrAllMoves") {
            const moving = $gamePlayer.isMoveRouteForcing() || $gameMap.events().some(e => e.isMoveRouteForcing());
            if (!moving) this._waitMode = "";
            return moving;
        }
        return _updateWaitMode.call(this);
    };

    // Run another map event's page (1-based) here, the way a common event runs.
    Game_Interpreter.prototype.rrCallMapEvent = function(eventId, pageIndex) {
        const event = $gameMap.event(eventId);
        const page = event && event.event().pages[(pageIndex || 1) - 1];
        if (page) this.setupChild(page.list, eventId);
        return true;
    };

    // RPG Maker 2000/2003 variable arithmetic (System.json rrLegacyVariableLimit, 999999 or 9999999, which the
    // importer sets): whole numbers, division truncated toward zero, a division by zero leaves the variable as it
    // was and a remainder by zero is 0, every result clamped to the limit. A game that divides by a stat still 0
    // (Deep 8's HP bar: HP * 29 / max HP) got Infinity from MZ's arithmetic and drew no frame. EasyRPG's Game_Variables.
    const _operateVariable = Game_Interpreter.prototype.operateVariable;
    Game_Interpreter.prototype.operateVariable = function(variableId, operationType, value) {
        const limit = $dataSystem && $dataSystem.rrLegacyVariableLimit;
        if (!limit || typeof value !== "number" || operationType < 0 || operationType > 5) return _operateVariable.apply(this, arguments);
        const a = Math.trunc(Number($gameVariables.value(variableId)) || 0), b = Math.trunc(value) || 0;
        // A parallel event's bar can do this many times a frame: no list per operation.
        const result = operationType === 0 ? b : operationType === 1 ? a + b : operationType === 2 ? a - b
            : operationType === 3 ? a * b : operationType === 4 ? (b ? Math.trunc(a / b) : a) : (b ? a % b : 0);
        $gameVariables.setValue(variableId, Math.max(-limit, Math.min(limit, result)) || 0);
    };

    // RPG Maker 2000/2003 decide passage the old engine's way (System.json rrLegacyPassage, which the
    // importer sets): the upper tile first; when it is marked "above", the lower tile by its own direction
    // bits, "above" or not. MZ skips every star tile and blocks a cell where all of them are, which walled
    // off every lower tile a 2003 chipset marks "above". A tile event keeps its say first, as in both.
    const _checkPassage = Game_Map.prototype.checkPassage;
    Game_Map.prototype.checkPassage = function(x, y, bit) {
        if (!$dataSystem || !$dataSystem.rrLegacyPassage || (bit & ~0x0f)) return _checkPassage.call(this, x, y, bit);
        const flags = this.tilesetFlags();
        for (const event of this.tileEventsXy(x, y)) {
            const flag = flags[event.tileId()] || 0;
            if (!(flag & 0x10)) return (flag & bit) === 0;
        }
        const upper = flags[this.tileId(x, y, 2)] || 0;
        if (upper & bit) return false;
        if (!(upper & 0x10)) return true;
        const lower = this.tileId(x, y, 1) || this.tileId(x, y, 0);
        return ((flags[lower] || 0) & bit) === 0;
    };

    // RPG Maker 2000/2003 transparency: eight levels, opacity (8 - level) * 32 - 1; move routes step it from
    // the character's current level, and an event's page change resets it (3 for a translucent page, else 0)
    // when System.json rrLegacyPageOpacity is set. A page with rrSpin turns a quarter every 24/16/12/8/6/4
    // frames by move speed. EasyRPG's Game_Character and Game_Event.
    Game_CharacterBase.prototype.rrTransparency = function(delta) {
        const current = this._rrTransp ?? Math.max(0, Math.min(7, Math.round(8 - (this.opacity() + 1) / 32)));
        this._rrTransp = Math.max(0, Math.min(7, current + (Number(delta) || 0)));
        this.setOpacity(Math.max(0, Math.min(255, (8 - this._rrTransp) * 32 - 1)));
    };

    const _setupPageSettings = Game_Event.prototype.setupPageSettings;
    Game_Event.prototype.setupPageSettings = function() {
        _setupPageSettings.call(this);
        const page = this.page();
        if (page && $dataSystem && $dataSystem.rrLegacyPageOpacity) {
            this._rrTransp = page.rrTranslucent ? 3 : 0;
            this.setOpacity((8 - this._rrTransp) * 32 - 1);
        }
        this._rrSpin = !!(page && page.rrSpin);
        this._rrSpinCount = 0;
    };

    const SPIN_ORDER = { 8: 6, 6: 2, 2: 4, 4: 8 };
    const SPIN_FRAMES = [24, 16, 12, 8, 6, 4];
    const _Game_Event_updateSpin = Game_Event.prototype.update;
    Game_Event.prototype.update = function() {
        _Game_Event_updateSpin.call(this);
        if (!this._rrSpin) return;
        const limit = SPIN_FRAMES[Math.max(1, Math.min(6, this.realMoveSpeed())) - 1];
        if (++this._rrSpinCount >= limit) { this._rrSpinCount = 0; this._direction = SPIN_ORDER[this._direction] || 2; }
    };

    Game_Interpreter.prototype.rrMessageOptions = function(background, position) {
        const m = $gameSystem._rrMessage || ($gameSystem._rrMessage = { faceName: "", faceIndex: 0, background: 0, position: 2 });
        m.background = Number(background) || 0;
        m.position = Number.isFinite(Number(position)) ? Math.max(0, Math.min(2, Number(position))) : 2;
    };
    Game_Interpreter.prototype.rrMessageFace = function(name, index) {
        const m = $gameSystem._rrMessage || ($gameSystem._rrMessage = { faceName: "", faceIndex: 0, background: 0, position: 2 });
        m.faceName = String(name || "");
        m.faceIndex = Number(index) || 0;
    };

    Game_Interpreter.prototype.rrSystemGraphic = function(name, stretch, font) {
        const skins = $dataSystem && $dataSystem.rrLegacySkins;
        const selected = skins && skins[String(name || "").replace(/\.png$/i, "").toLowerCase()];
        if (!selected) return;
        $gameSystem._rrWindowSkin = { name: selected, stretch: Number(stretch) === 1 ? 1 : 0, font: Number(font) || 0 };
        $gameSystem._rrFontId = Number(font) === 1 ? 1 : 0;
        const info = $gameSystem.legacyFontInfo && $gameSystem.legacyFontInfo();
        if (info && typeof FontManager !== "undefined") FontManager.load("rmmz-legacy-font-" + $gameSystem._rrFontId, info.filename);
        ColorManager.loadWindowskin();
        // The following message/menu must use the selected font and palette.
        const skin = ColorManager._windowskin;
        if (info && typeof FontManager !== "undefined" && !FontManager.isReady()) this.setWaitMode("rrSystemGraphic");
        else if (skin && !skin.isReady()) this.setWaitMode("image");
    };

    // RPG Maker 2000/2003 motion (System.json rrLegacyMotion): a character covers 2^(speed + 1) / 256 of
    // a tile a frame, twice MZ's 2^speed at the same number, and a jump lasts 256 / (8, 12, 16, 24, 32,
    // 64) frames by speed whatever its length, rising at most 16 px (EasyRPG's Game_Character::Update
    // and GetJumpHeight). The stored speeds stay the old engine's 1-6.
    const legacyMotion = () => !!($dataSystem && $dataSystem.rrLegacyMotion);
    const _realMoveSpeed = Game_CharacterBase.prototype.realMoveSpeed;
    Game_CharacterBase.prototype.realMoveSpeed = function() {
        return _realMoveSpeed.call(this) + (legacyMotion() ? 1 : 0);
    };
    const JUMP_SPEED = [8, 12, 16, 24, 32, 64];
    const _jump = Game_CharacterBase.prototype.jump;
    Game_CharacterBase.prototype.jump = function(xPlus, yPlus) {
        _jump.call(this, xPlus, yPlus);
        if (!legacyMotion()) { this._rrJumpTotal = 0; return; }
        const total = Math.ceil(256 / JUMP_SPEED[Math.max(1, Math.min(6, this._moveSpeed)) - 1]);
        this._rrJumpTotal = total;
        this._jumpPeak = total / 2;
        this._jumpCount = total;
    };
    const _jumpHeight = Game_CharacterBase.prototype.jumpHeight;
    Game_CharacterBase.prototype.jumpHeight = function() {
        if (!this._rrJumpTotal || !legacyMotion()) return _jumpHeight.call(this);
        const remaining = 256 * this._jumpCount / this._rrJumpTotal;
        const h = Math.floor((remaining > 128 ? 256 - remaining : remaining) / 8);
        return h < 5 ? h * 2 : h < 13 ? h + 4 : 16;
    };

    // A move route runs its instant commands (sound, transparency, graphic, speed, switches, scripts) in the
    // same frame; only a step, jump, wait or turn ends it (EasyRPG's Game_Character::UpdateMoveRoute). MZ takes
    // a frame each, so Deep 8's troopers, faded in by a route that a later Set Move Route replaces six frames
    // on, lost their graphic change and came back invisible.
    const _updateRoutineMove = Game_Character.prototype.updateRoutineMove;
    Game_Character.prototype.updateRoutineMove = function() {
        _updateRoutineMove.call(this);
        if (!legacyMotion()) return;
        for (let guard = 0; guard < 256; guard++) {
            if (!this._moveRoute || this.isMoving() || this.isJumping() || this._waitCount > 0) return;
            const command = this._moveRoute.list[this._moveRouteIndex];
            if (!command || (command.code > 0 && command.code <= 26)) return;
            _updateRoutineMove.call(this);
            if (command.code === 0) return;
        }
    };

    // A route's face and turn commands turn the character even when its facing is fixed; the lock only keeps
    // steps from turning it (EasyRPG's UpdateMoveRoute sets the facing outright). Deep 8's village mother is a
    // fixed-graphic page turned left by a route onto her left-facing cell.
    const _processMoveCommand = Game_Character.prototype.processMoveCommand;
    Game_Character.prototype.processMoveCommand = function(command) {
        if (!legacyMotion() || !command || command.code < 16 || command.code > 26 || !this._directionFix) return _processMoveCommand.call(this, command);
        this._directionFix = false;
        try { return _processMoveCommand.call(this, command); } finally { this._directionFix = true; }
    };

    // A player moved by a Set Move Route starts no touch events, neither stepping onto one nor walking into one;
    // only the player's own steps do (EasyRPG's Game_Player::UpdateMovement and UpdateNextMovementAction, as
    // RPG_RT). A Blurred Line walks its hero through a dialogue event in the opening cutscene, which in MZ cut in
    // before the scene's own talk, with the screen still tinted.
    // The route counts as over once its last step has begun (EasyRPG ends it as that step is taken; MZ a frame
    // after), so the event a route walks the player onto still starts: A Blurred Line's route passes the dialogue
    // event and ends on the one that opens the scene.
    const routeHolds = (player) => {
        if (!player.isMoveRouteForcing()) return false;
        const route = player._moveRoute, next = route && route.list[player._moveRouteIndex];
        return !!route && (route.repeat || (next && next.code !== 0));
    };
    const _checkHere = Game_Player.prototype.checkEventTriggerHere;
    Game_Player.prototype.checkEventTriggerHere = function(triggers) {
        if (legacyMotion() && routeHolds(this) && triggers.some(t => t === 1 || t === 2)) return;
        _checkHere.call(this, triggers);
    };
    const _checkTouch = Game_Player.prototype.checkEventTriggerTouch;
    Game_Player.prototype.checkEventTriggerTouch = function(x, y) {
        if (legacyMotion() && routeHolds(this)) return;
        _checkTouch.call(this, x, y);
    };

    // A paused character (a route's Stop Animation) and, with rrLegacyMotion, a jumping one hold the middle
    // frame; a fixed-graphic page keeps its own (EasyRPG's Game_Character::UpdateAnimation / ResetAnimation).
    Game_CharacterBase.prototype.rrAnimPause = function(paused) {
        this._rrAnimPaused = !!paused;
    };
    const _updateAnimation = Game_CharacterBase.prototype.updateAnimation;
    Game_CharacterBase.prototype.updateAnimation = function() {
        if (this._rrAnimPaused || (this.isJumping() && legacyMotion())) {
            this._animationCount = 0;
            const page = this instanceof Game_Event && this.page ? this.page() : null;
            if (!(page && page.rrFixedGraphic)) this.resetPattern();
            return;
        }
        _updateAnimation.call(this);
    };

    // RPG Maker 2000/2003 Tile Substitution: the map keeps two 144-entry tables (lower and upper tiles)
    // and a substitution rewrites every entry that shows `old` to show `new`, over the whole map, until
    // the next map (EasyRPG's Game_Map::SubstituteDown/Up). An import writes lower tile n as B tile
    // 1 + n on layer 1 and upper tile n as C tile 256 + n on layer 2, so the tables apply to those
    // layers of the map as loaded; the tables live on $gameMap and so survive a save.
    const identity144 = () => Array.from({ length: 144 }, (_, i) => i);
    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        this._rrTileSub = null;
        _Game_Map_setup.call(this, mapId);
    };
    Game_Map.prototype.rrTileSubstitute = function(upper, oldId, newId) {
        const subs = this._rrTileSub || (this._rrTileSub = { lower: identity144(), upper: identity144() });
        const table = upper ? subs.upper : subs.lower;
        for (let i = 0; i < table.length; i++) if (table[i] === Number(oldId)) table[i] = Number(newId);
        this.rrApplyTileSub(true);
    };
    const rrOriginalLayers = new WeakMap();
    Game_Map.prototype.rrApplyTileSub = function(force) {
        const subs = this._rrTileSub, data = $dataMap && $dataMap.data;
        if (!subs || !data) return;
        let original = rrOriginalLayers.get($dataMap);
        if (!original) {
            const n = $dataMap.width * $dataMap.height;
            original = { n, lower: data.slice(n, 2 * n), upper: data.slice(2 * n, 3 * n) };
            rrOriginalLayers.set($dataMap, original);
        } else if (!force) return;
        const n = original.n;
        for (let i = 0; i < n; i++) {
            const lo = original.lower[i];
            if (lo >= 1 && lo <= 144) data[n + i] = 1 + subs.lower[lo - 1];
            const up = original.upper[i];
            if (up >= 256 && up < 400) data[2 * n + i] = 256 + subs.upper[up - 256];
            else if (up === 0 && subs.upper[0] !== 0) data[2 * n + i] = 256 + subs.upper[0];
        }
        const tilemap = SceneManager._scene && SceneManager._scene._spriteset && SceneManager._scene._spriteset._tilemap;
        if (tilemap && tilemap.refresh) tilemap.refresh();
    };

    // Key codes as the 2003 command reports them: 1 down, 2 left, 3 right, 4 up, 5 decision, 6 cancel,
    // 7 shift, 10-19 the number keys 0-9 (asked for as 10), 20-24 + - * / . (asked for as 20). Checked
    // in the old engine's order, highest code first. A command that waits takes a fresh press; one that
    // does not reads a key held down.
    const RR_KEYS = [[7, "shift"], [6, "cancel"], [5, "ok"], [4, "up"], [3, "right"], [2, "left"], [1, "down"]];
    const RR_OPERATORS = ["rrPlus", "rrMinus", "rrMultiply", "rrDivide", "rrPeriod"];
    Game_Interpreter.prototype.rrKeyInputCheck = function(keys, held) {
        const check = name => (held ? Input.isPressed(name) : Input.isTriggered(name));
        if (keys.includes(20)) for (let i = 4; i >= 0; i--) if (check(RR_OPERATORS[i])) return 20 + i;
        if (keys.includes(10)) for (let i = 9; i >= 0; i--) if (check("rrDigit" + i)) return 10 + i;
        for (const [code, name] of RR_KEYS) if (keys.includes(code) && check(name)) return code;
        return 0;
    };

    // The number and operator keys, main row and keypad, tracked beside Input's own mapping so a keypad
    // arrow keeps moving the player. Only rrKeyInput asks for them.
    const RR_EXTRA_KEYS = { 107: "rrPlus", 187: "rrPlus", 221: "rrPlus", 109: "rrMinus", 189: "rrMinus", 106: "rrMultiply", 111: "rrDivide", 110: "rrPeriod", 190: "rrPeriod" };
    for (let i = 0; i <= 9; i++) { RR_EXTRA_KEYS[48 + i] = "rrDigit" + i; RR_EXTRA_KEYS[96 + i] = "rrDigit" + i; }
    const _Input_onKeyDown = Input._onKeyDown;
    Input._onKeyDown = function(event) {
        _Input_onKeyDown.call(this, event);
        const name = RR_EXTRA_KEYS[event.keyCode];
        if (name) this._currentState[name] = true;
    };
    const _Input_onKeyUp = Input._onKeyUp;
    Input._onKeyUp = function(event) {
        _Input_onKeyUp.call(this, event);
        const name = RR_EXTRA_KEYS[event.keyCode];
        if (name) this._currentState[name] = false;
    };
    Game_Interpreter.prototype.rrKeyInput = function(variableId, keys, wait, timeVariableId) {
        if (wait) {
            if (variableId) $gameVariables.setValue(variableId, 0);
            this._rrKeyInput = { variableId, keys: keys || [5], timeVariableId: timeVariableId || 0, frames: 0 };
            this.setWaitMode("rrKeyInput");
        } else if (variableId) {
            $gameVariables.setValue(variableId, this.rrKeyInputCheck(keys || [], true));
        }
        return true;
    };

    Game_Interpreter.prototype.rrWaitForAllMoves = function() {
        this.setWaitMode("rrAllMoves");
        return true;
    };
    Game_Interpreter.prototype.rrHaltAllMoves = function() {
        for (const c of [$gamePlayer, ...$gameMap.events()]) if (c.isMoveRouteForcing()) c.restoreMoveRoute();
        return true;
    };

    // Flash one character a colour ([r, g, b, strength], 0-255) over `duration` frames.
    Game_Interpreter.prototype.rrFlashCharacter = function(characterId, color, duration, wait) {
        const c = this.character(characterId);
        if (c) c._rrFlash = { color, duration: Math.max(1, duration | 0), total: Math.max(1, duration | 0) };
        if (wait) this.wait(duration | 0);
        return true;
    };

    // The 2003 terrain number of the tile at (x, y), from the tileset note the importer writes:
    // <rrTerrain:{"<tileId>": <terrain>, ...}>. 0 when the tileset carries none.
    Game_Interpreter.prototype.rrTerrainId = function(x, y) {
        const tileset = $gameMap.tileset();
        if (!tileset) return 0;
        if (!tileset._rrTerrainMap) {
            const m = /<rrTerrain:(\{[\s\S]*?\})>/.exec(tileset.note || "");
            let map = {};
            if (m) { try { map = JSON.parse(m[1]); } catch (e) { map = {}; } }
            tileset._rrTerrainMap = map;
        }
        for (const tileId of $gameMap.layeredTiles(x, y)) {
            if (tileId > 0 && tileset._rrTerrainMap[tileId] !== undefined) return tileset._rrTerrainMap[tileId];
        }
        return 0;
    };

    // A transfer resets an unfinished camera return; lock/follow mode stays.
    const _Game_Map_setupLegacyPan = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function() {
        if ($dataSystem && $dataSystem.rrLegacyParallax) this._rrPanReturn = 0;
        _Game_Map_setupLegacyPan.apply(this, arguments);
    };

    // The old camera centres a whole tile left of the viewport midpoint
    // when its tile count is even. MZ's half-tile centre shifts a 320px
    // panorama by 8px on interior maps and misaligns authored picture setups.
    for (const name of ["centerX", "centerY"]) {
        const original = Game_Player.prototype[name];
        Game_Player.prototype[name] = function() {
            if (!$dataSystem || !$dataSystem.rrLegacyParallax) return original.apply(this, arguments);
            const tiles = name === "centerX" ? $gameMap.screenTileX() : $gameMap.screenTileY();
            return Math.ceil(tiles / 2) - 1;
        };
    }

    // 2000/2003 panning: a locked pan ($gameMap._rrPanLocked) keeps the camera where it is while the
    // player moves; returning the pan scrolls back to the player at the command's speed (1-6), by the
    // same scrolls a player's walk makes, so pictures fixed to the map ride along.
    Game_Interpreter.prototype.rrPanReset = function(speed, wait) {
        if (!speed) { $gamePlayer.center($gamePlayer.x, $gamePlayer.y); return true; }
        $gameMap._rrPanReturn = Math.pow(2, Number(speed)) / 256;
        if (wait) this.setWaitMode("rrPan");
        return true;
    };

    const _Game_Player_updateScroll = Game_Player.prototype.updateScroll;
    Game_Player.prototype.updateScroll = function(lastScrolledX, lastScrolledY) {
        if ($gameMap._rrPanLocked || $gameMap._rrPanReturn) return;
        _Game_Player_updateScroll.call(this, lastScrolledX, lastScrolledY);
    };

    const _Game_Map_updateScroll = Game_Map.prototype.updateScroll;
    Game_Map.prototype.updateScroll = function() {
        _Game_Map_updateScroll.call(this);
        const step = this._rrPanReturn;
        if (!step) return;
        const clampTo = (v, size, screen, loop) => (loop ? v : Math.max(0, Math.min(v, size - screen)));
        const tx = clampTo($gamePlayer._realX - $gamePlayer.centerX(), this.width(), this.screenTileX(), this.isLoopHorizontal());
        const ty = clampTo($gamePlayer._realY - $gamePlayer.centerY(), this.height(), this.screenTileY(), this.isLoopVertical());
        const dx = tx - this._displayX, dy = ty - this._displayY;
        if (dx > 0) this.scrollRight(Math.min(step, dx)); else if (dx < 0) this.scrollLeft(Math.min(step, -dx));
        if (dy > 0) this.scrollDown(Math.min(step, dy)); else if (dy < 0) this.scrollUp(Math.min(step, -dy));
        if (Math.abs(dx) <= step && Math.abs(dy) <= step) this._rrPanReturn = 0;
    };

    const _expForLevel = Game_Actor.prototype.expForLevel;
    Game_Actor.prototype.expForLevel = function(level) {
        const c = this.currentClass();
        if (c && Array.isArray(c.expTable) && c.expTable[level] !== undefined) return c.expTable[level];
        return _expForLevel.call(this, level);
    };

    if (typeof BattleManager !== "undefined" && BattleManager.processDefeat) {
        const _processDefeat = BattleManager.processDefeat;
        BattleManager.processDefeat = function() {
            $gameSystem._rrDefeatCount = ($gameSystem._rrDefeatCount || 0) + 1;
            return _processDefeat.apply(this, arguments);
        };
    }
})();

//-----------------------------------------------------------------------------
// A Script command that waits inside a loop (an RGSS `while … wait(30) end`)
// runs as a generator: each `yield n` waits n frames, and the event's next
// command runs once the generator finishes. A save made meanwhile keeps the
// event at that command; the rest of the script is dropped on load.
//-----------------------------------------------------------------------------

Game_Interpreter.prototype.rrRunScript = function(generator) {
    Object.defineProperty(this, "_rrScript", { value: generator, writable: true, configurable: true, enumerable: false });
    this.rrStepScript();
};

Game_Interpreter.prototype.rrStepScript = function() {
    const step = this._rrScript.next();
    if (step.done) {
        this._rrScript = null;
        return false;
    }
    this.wait(Math.max(1, Number(step.value) || 1));
    return true;
};

const _rrScriptUpdateWait = Game_Interpreter.prototype.updateWait;
Game_Interpreter.prototype.updateWait = function() {
    if (_rrScriptUpdateWait.call(this)) return true;
    // The frame a wait starts on is its first, as with the Wait command.
    return this._rrScript && this.rrStepScript() ? _rrScriptUpdateWait.call(this) : false;
};

const _rrScriptClear = Game_Interpreter.prototype.clear;
Game_Interpreter.prototype.clear = function() {
    _rrScriptClear.call(this);
    if (this._rrScript) this._rrScript = null;
};

//-----------------------------------------------------------------------------
// [fN] character sheets (see reactor_sprites.js): N frames, looping, resting on 0.
// Off unless System.json sets rrMultiFrames.
//-----------------------------------------------------------------------------

Game_CharacterBase.rrFramesOf = function(name) {
    if (!$dataSystem || !$dataSystem.rrMultiFrames) return 0;
    const m = /\[F(\d+)\]/i.exec(String(name || ""));
    return m ? Math.max(1, Number(m[1])) : 0;
};

const _rrMultiMaxPattern = Game_CharacterBase.prototype.maxPattern;
Game_CharacterBase.prototype.maxPattern = function() {
    return Game_CharacterBase.rrFramesOf(this._characterName) || _rrMultiMaxPattern.call(this);
};

const _rrMultiPattern = Game_CharacterBase.prototype.pattern;
Game_CharacterBase.prototype.pattern = function() {
    return Game_CharacterBase.rrFramesOf(this._characterName) ? this._pattern : _rrMultiPattern.call(this);
};

const _rrMultiResetPattern = Game_CharacterBase.prototype.resetPattern;
Game_CharacterBase.prototype.resetPattern = function() {
    if (Game_CharacterBase.rrFramesOf(this._characterName)) this.setPattern(0);
    else _rrMultiResetPattern.call(this);
};

const _rrMultiIsOriginalPattern = Game_CharacterBase.prototype.isOriginalPattern;
Game_CharacterBase.prototype.isOriginalPattern = function() {
    return Game_CharacterBase.rrFramesOf(this._characterName) ? this.pattern() === 0 : _rrMultiIsOriginalPattern.call(this);
};

const _rrMultiStraighten = Game_CharacterBase.prototype.straighten;
Game_CharacterBase.prototype.straighten = function() {
    if (!Game_CharacterBase.rrFramesOf(this._characterName)) return _rrMultiStraighten.call(this);
    if (this.hasWalkAnime() || this.hasStepAnime()) this._pattern = 0;
    this._animationCount = 0;
};
