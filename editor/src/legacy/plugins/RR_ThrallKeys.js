/*:
 * @target MZ
 * @plugindesc Key Module, Gamepad Module and Read Controls (VX), for imported games
 * @author Strak; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallKeys.js
 *
 * The game's own key configuration drives every button. Twelve controls,
 * each with its keys and one gamepad button, as the game's config files set
 * them (Data/ConfigKey.rvdata and ConfigCon.rvdata):
 *
 *   control   keys (shipped)   pad (shipped)   MZ button name
 *   dash      C                X               shift
 *   cancel    X, Esc           B               escape (cancel, and the menu)
 *   confirm   Z, Space         A               ok
 *   page up   A                LB              pageup
 *   page down S                RB              pagedown
 *   compare   Q                Y               rgssX
 *   sort      W                Back            rgssY
 *   menu      D                Start           rgssZ
 *   up, left, down, right: the arrow keys and the d-pad
 *
 * No other key does any of these (Enter, Shift, the number pad and Page
 * Up/Down do nothing, as in the original). Held keys repeat after 16 frames,
 * then every 4. Direction keys held together go down before left, left
 * before right, right before up, as the original's dir4 had it.
 *
 * The configuration (with the options the game keeps beside it: the
 * variables and switches its title loaded from Data/ConfigVar.rvdata and
 * ConfigSwi.rvdata) is the player's: it is loaded into every new and loaded
 * game, and kept in the player's config file once the game saves it.
 *
 * Switch 59 turns on when the gamepad was used last and off when the
 * keyboard was; Config.read_input_A … _Z (an event's Script command) gives
 * the icon of the first key or button of a control, the gamepad's when the
 * switch is on (switch 60 picks the PlayStation glyphs).
 *
 * Script calls (for the ports of the game's scripts):
 *   Input.isTriggered('ok') etc.          by the MZ names above
 *   Input.rrGamepadTriggered(i)           the game's Gamepad.trigger?(i),
 *   Input.rrGamepadPressed(i)             i = 0 dash … 7 menu, 8 up, 9 left,
 *   Input.rrGamepadRepeated(i)            10 down, 11 right
 *   Input.rrKeyTriggered(code)            the game's Keys.trigger?(code):
 *   Input.rrKeyPressed(code) …Repeated    a key code, a list of them, or 256
 *   …Released(code)                       for any key
 *   Input.rrKeyCharacter('trigger')       the character typed this frame
 *   $gameSystem.rrControls()              keyboard controls (key code lists)
 *   $gameSystem.rrControlsGamepad()       gamepad controls (VX Input numbers)
 *   $gameSystem.rrSetControls(keys, pad)  change them; the keys follow at once
 *   $gameSystem.rrReadInput(i)            Config.read_input_*: icon index
 *   ConfigManager.rrThrallLoadConfig()    the title's and Scene_File's load
 *   ConfigManager.rrThrallSaveConfig()    Menu System Options' save
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param controls
 * @text Keyboard controls
 * @desc JSON: twelve lists of key codes (dash, cancel, confirm, page up, page down, compare, sort, menu, up, left, down, right).
 * @default [[67],[88,27],[90,32],[65],[83],[81],[87],[68],[38],[37],[40],[39]]
 *
 * @param controlsGamepad
 * @text Gamepad controls
 * @desc JSON: twelve VX Input buttons (11 A, 12 B, 13 C, 14 X, 15 Y, 16 Z, 17 L, 18 R, 8 up, 4 left, 2 down, 6 right).
 * @default [13,12,11,15,16,14,17,18,8,4,2,6]
 *
 * @param configVariables
 * @text Config variables
 * @desc JSON: {"id": value} the title loads into the game (Data/ConfigVar.rvdata).
 * @default {}
 *
 * @param configSwitches
 * @text Config switches
 * @desc JSON: {"id": true/false} the title loads into the game (Data/ConfigSwi.rvdata).
 * @default {}
 *
 * @param deviceSwitch
 * @text Gamepad-in-use switch
 * @type switch
 * @default 59
 *
 * @param glyphSwitch
 * @text PlayStation glyphs switch
 * @type switch
 * @default 60
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallKeys');
    const json = (text, fallback) => { try { return JSON.parse(text); } catch (_) { return fallback; } };
    const DEFAULT_KEYS = [[67], [88, 27], [90, 32], [65], [83], [81], [87], [68], [38], [37], [40], [39]];
    const DEFAULT_PAD = [13, 12, 11, 15, 16, 14, 17, 18, 8, 4, 2, 6];
    const KEYS = json(params.controls, DEFAULT_KEYS);
    const PAD = json(params.controlsGamepad, DEFAULT_PAD);
    const CONFIG_VARIABLES = json(params.configVariables, {}) || {};
    const CONFIG_SWITCHES = json(params.configSwitches, {}) || {};
    const DEVICE_SWITCH = Number(params.deviceSwitch || 59);
    const GLYPH_SWITCH = Number(params.glyphSwitch || 60);
    const ANYKEY = 0x100;

    /** The MZ button each of the game's twelve controls drives (Gamepad.dash … Gamepad.right). */
    const NAMES = ['shift', 'escape', 'ok', 'pageup', 'pagedown', 'rgssX', 'rgssY', 'rgssZ', 'up', 'left', 'down', 'right'];
    Input.RR_THRALL_BUTTONS = NAMES.slice();
    // The names this configuration owns: no other key or button keeps them.
    const MANAGED = new Set(NAMES.concat(['cancel', 'menu', 'rgssL2', 'rgssR2']));
    /** VX's Input buttons as a standard gamepad's (A, B, X, Y, LB, RB, Back, Start; the d-pad), as the game's icons show them. */
    const PAD_BUTTON = { 11: 0, 12: 1, 13: 2, 14: 3, 15: 4, 16: 5, 17: 8, 18: 9, 8: 12, 2: 13, 4: 14, 6: 15 };

    const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
    const copyKeys = (keys) => list(keys).map(k => list(k).map(Number));

    //-------------------------------------------------------------------------
    // The configuration: the shipped files', then the player's own
    //-------------------------------------------------------------------------
    ConfigManager.rrThrallConfig = null;
    const shipped = () => ({ variables: Object.assign({}, CONFIG_VARIABLES), switches: Object.assign({}, CONFIG_SWITCHES), controls: copyKeys(KEYS), controlsGamepad: list(PAD).map(Number) });
    const config = () => ConfigManager.rrThrallConfig || (ConfigManager.rrThrallConfig = shipped());
    const _makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const data = _makeData.call(this);
        if (this.rrThrallConfig) data.rrThrallConfig = this.rrThrallConfig;
        return data;
    };
    const _applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(data) {
        _applyData.call(this, data);
        const own = data && data.rrThrallConfig;
        if (own && typeof own === 'object') {
            const base = shipped();
            this.rrThrallConfig = {
                variables: Object.assign(base.variables, own.variables), switches: Object.assign(base.switches, own.switches),
                controls: Array.isArray(own.controls) && own.controls.length === 12 ? copyKeys(own.controls) : base.controls,
                controlsGamepad: Array.isArray(own.controlsGamepad) && own.controlsGamepad.length === 12 ? own.controlsGamepad.map(Number) : base.controlsGamepad
            };
        }
        if (typeof $gameSystem !== 'undefined' && $gameSystem) this.rrThrallLoadConfig();
    };
    /** The config into the game: its variables and switches, and the controls (the title's create_game_objects, Scene_File's do_load). */
    ConfigManager.rrThrallLoadConfig = function() {
        const c = config();
        if (typeof $gameVariables !== 'undefined' && $gameVariables) for (const [id, value] of Object.entries(c.variables)) $gameVariables._data[Number(id)] = value;
        if (typeof $gameSwitches !== 'undefined' && $gameSwitches) for (const [id, value] of Object.entries(c.switches)) $gameSwitches._data[Number(id)] = value;
        if (typeof $gameSystem !== 'undefined' && $gameSystem) $gameSystem.rrSetControls(c.controls, c.controlsGamepad);
    };
    /** The game's options and controls into the config, kept for every game after (Menu System Options' return_scene). */
    ConfigManager.rrThrallSaveConfig = function() {
        const c = config();
        for (const id of Object.keys(c.variables)) c.variables[id] = $gameVariables.value(Number(id));
        for (const id of Object.keys(c.switches)) c.switches[id] = $gameSwitches.value(Number(id));
        c.controls = copyKeys($gameSystem.rrControls());
        c.controlsGamepad = $gameSystem.rrControlsGamepad().map(Number);
        this.save();
    };
    // Every new game and every loaded one starts with the config, as the title and the load screen gave it.
    const _createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        _createGameObjects.call(this);
        ConfigManager.rrThrallLoadConfig();
    };
    const _extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _extractSaveContents.call(this, contents);
        ConfigManager.rrThrallLoadConfig();
    };

    //-------------------------------------------------------------------------
    // $game_system.controls / controls_g, and MZ's buttons following them
    //-------------------------------------------------------------------------
    Game_System.prototype.rrControls = function() { return this._rrControls || (this._rrControls = copyKeys(config().controls)); };
    Game_System.prototype.rrControlsGamepad = function() { return this._rrControlsGamepad || (this._rrControlsGamepad = config().controlsGamepad.slice()); };
    Game_System.prototype.rrSetControls = function(keys, pad) {
        if (keys) this._rrControls = copyKeys(keys);
        if (pad) this._rrControlsGamepad = list(pad).map(Number);
        applyMapping(this.rrControls(), this.rrControlsGamepad());
    };
    const _onAfterLoad = Game_System.prototype.onAfterLoad;
    Game_System.prototype.onAfterLoad = function() {
        _onAfterLoad.call(this);
        applyMapping(this.rrControls(), this.rrControlsGamepad());
    };

    let mappedKeys = new Set();
    /** A key given to two controls does the first one's. */
    function applyMapping(keys, pad) {
        for (const code of Object.keys(Input.keyMapper)) if (MANAGED.has(Input.keyMapper[code])) delete Input.keyMapper[code];
        for (const b of Object.keys(Input.gamepadMapper)) if (MANAGED.has(Input.gamepadMapper[b])) delete Input.gamepadMapper[b];
        mappedKeys = new Set();
        keys.forEach((codes, i) => {
            for (const code of list(codes)) {
                mappedKeys.add(Number(code));
                if (!MANAGED.has(Input.keyMapper[code])) Input.keyMapper[code] = NAMES[i];
            }
        });
        pad.forEach((button, i) => {
            const b = PAD_BUTTON[button];
            if (b !== undefined && !MANAGED.has(Input.gamepadMapper[b])) Input.gamepadMapper[b] = NAMES[i];
        });
    }
    Input.rrThrallApplyMapping = applyMapping;
    // The Key Module's repeat: a held key repeats after 16 frames, then every 4.
    Input.keyRepeatWait = 16;
    Input.keyRepeatInterval = 4;
    const _bootStart = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _bootStart.call(this);
        applyMapping(($gameSystem && $gameSystem.rrControls()) || config().controls, ($gameSystem && $gameSystem.rrControlsGamepad()) || config().controlsGamepad);
    };

    //-------------------------------------------------------------------------
    // Keys: every key by its code, pressed, triggered, repeated, released
    //-------------------------------------------------------------------------
    const raw = { down: new Set(), press: new Set(), trigger: new Set(), repeat: new Set(), release: new Set(), counter: new Map(), chars: new Map() };
    const pad = { press: new Set(), trigger: new Set(), repeat: new Set(), counter: new Map() };
    const _onKeyDown = Input._onKeyDown;
    Input._onKeyDown = function(event) {
        _onKeyDown.call(this, event);
        raw.down.add(event.keyCode);
        if (event.key && event.key.length === 1) raw.chars.set(event.keyCode, event.key);
    };
    const _onKeyUp = Input._onKeyUp;
    Input._onKeyUp = function(event) {
        _onKeyUp.call(this, event);
        raw.down.delete(event.keyCode);
    };
    const _clear = Input.clear;
    Input.clear = function() {
        _clear.call(this);
        if (raw.down) for (const k of Object.keys(raw)) raw[k].clear();
        if (pad.press) for (const k of Object.keys(pad)) pad[k].clear();
    };
    // One frame of the Key Module: a change triggers (or releases) and repeats; a held key repeats every 4th frame after 16.
    function step(state, down) {
        state.trigger.clear(); state.repeat.clear();
        if (state.release) state.release.clear();
        for (const code of new Set([...state.press, ...down])) {
            const now = down.has(code), was = state.press.has(code);
            let counter = state.counter.get(code) || 0;
            if (now !== was) {
                if (now) { state.trigger.add(code); if (counter <= 0) { state.repeat.add(code); counter = 15; } }
                else { if (state.release) state.release.add(code); counter = 0; }
            } else if (now) {
                if (counter > 0) counter--;
                else { state.repeat.add(code); counter = 3; }
            }
            if (now) state.press.add(code); else state.press.delete(code);
            if (counter) state.counter.set(code, counter); else state.counter.delete(code);
        }
    }
    const _update = Input.update;
    Input.update = function() {
        _update.call(this);
        step(raw, raw.down);
        const buttons = new Set();
        for (const state of this._gamepadStates || []) if (state) state.forEach((on, b) => on && buttons.add(b));
        step(pad, buttons);
        this.rrUpdateDevice();
    };
    const keyState = (set, key) => {
        if (Array.isArray(key)) return key.some(k => keyState(set, k));
        const code = Number(key);
        if (!(code >= 1 && code <= ANYKEY)) return false;
        return code === ANYKEY ? set.size > 0 : set.has(code);
    };
    Input.rrKeyPressed = (key) => keyState(raw.press, key);
    Input.rrKeyTriggered = (key) => keyState(raw.trigger, key);
    Input.rrKeyRepeated = (key) => keyState(raw.repeat, key);
    Input.rrKeyReleased = (key) => keyState(raw.release, key);
    /** The character of a letter, digit, punctuation or space key pressed ('press'), just pressed ('trigger') or repeating ('repeat'), or ''. */
    Input.rrKeyCharacter = function(mode = 'trigger') {
        const set = mode === 'press' ? raw.press : mode === 'repeat' ? raw.repeat : raw.trigger;
        for (const code of set) if (raw.chars.has(code)) return raw.chars.get(code);
        return '';
    };

    //-------------------------------------------------------------------------
    // Gamepad: a control by its keys, or its pad button while no key is held
    //-------------------------------------------------------------------------
    const setDevice = (gamepad) => {
        if (typeof $gameSwitches === 'undefined' || !$gameSwitches || !DEVICE_SWITCH) return;
        if ($gameSwitches.value(DEVICE_SWITCH) !== gamepad) $gameSwitches.setValue(DEVICE_SWITCH, gamepad);
    };
    // The device last used: a configured key, or a configured button pressed while no key is held.
    Input.rrUpdateDevice = function() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
        for (const code of raw.trigger) if (mappedKeys.has(code)) { setDevice(false); return; }
        if (raw.press.size) return;
        for (const button of $gameSystem.rrControlsGamepad()) if (pad.trigger.has(PAD_BUTTON[button])) { setDevice(true); return; }
    };
    const control = (keySet, padSet) => (index) => {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return false;
        if (keyState(keySet, $gameSystem.rrControls()[index] || [])) return true;
        const b = PAD_BUTTON[$gameSystem.rrControlsGamepad()[index]];
        return b !== undefined && padSet.has(b) && raw.press.size === 0;
    };
    Input.rrGamepadPressed = control(raw.press, pad.press);
    Input.rrGamepadTriggered = control(raw.trigger, pad.trigger);
    Input.rrGamepadRepeated = control(raw.repeat, pad.repeat);

    // dir4 and dir8 by the controls, down before left before right before up.
    Input._updateDirection = function() {
        const down = this.isPressed('down'), left = this.isPressed('left'), right = this.isPressed('right'), up = this.isPressed('up');
        this._dir4 = down ? 2 : left ? 4 : right ? 6 : up ? 8 : 0;
        this._dir8 = down && left ? 1 : down && right ? 3 : up && left ? 7 : up && right ? 9 : this._dir4;
    };

    //-------------------------------------------------------------------------
    // Read Controls: the icon of a control's first key or button
    //-------------------------------------------------------------------------
    const KEY_ICON = { 32: 816, 27: 853, 40: 857, 37: 858, 39: 859, 38: 860 };
    for (let i = 0; i < 26; i++) KEY_ICON[65 + i] = 817 + i;            // A … Z
    for (let i = 1; i <= 9; i++) KEY_ICON[48 + i] = 842 + i;            // 1 … 9
    KEY_ICON[48] = 852;                                                 // 0
    // VX's Input buttons: Xbox glyphs, or PlayStation's with the glyph switch on.
    const PAD_ICON = { 13: [178, 186], 12: [177, 185], 11: [176, 184], 15: [180, 188], 16: [181, 189], 14: [179, 187], 17: [182, 190], 18: [183, 191] };
    Game_System.prototype.rrFindButton = function(button) {
        if (KEY_ICON[button] !== undefined) return KEY_ICON[button];
        const icons = PAD_ICON[button];
        if (icons) return icons[GLYPH_SWITCH && $gameSwitches.value(GLYPH_SWITCH) ? 1 : 0];
        return 854;
    };
    /** Config.read_input_A … _Z: index 0 A, 1 B, 2 C, 3 L, 4 R, 5 X, 6 Y, 7 Z. */
    Game_System.prototype.rrReadInput = function(index) {
        const button = DEVICE_SWITCH && $gameSwitches.value(DEVICE_SWITCH) ? [this.rrControlsGamepad()[index]] : list(this.rrControls()[index]);
        return this.rrFindButton(button[0]);
    };
})();
