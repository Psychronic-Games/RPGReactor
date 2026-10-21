//=============================================================================
// reactor_controls.js - RPG Reactor controls
//=============================================================================
//
// A project may set its own keys and gamepad buttons (Database › Controls,
// System.json `reactorControls`); they are applied once at boot as the game's
// defaults, so a player's own changes in game (a key config screen, a plugin)
// are never undone. Without them the stock mapping stands untouched. Jump has
// its own keys and buttons; on a 3D map with jumping on they jump instead of
// whatever else they do (by default Space jumps there and confirms elsewhere),
// and leaving the map gives those keys back exactly.
//=============================================================================

(function(root) {
    "use strict";

    const ReactorControls = root.ReactorControls = {};

    /** Actions a control can do, as Input knows them, and the jump. */
    ReactorControls.ACTIONS = ["ok", "cancel", "menu", "shift", "pageup", "pagedown", "up", "down", "left", "right", "jump"];

    /** The stock keyboard mapping, what a project gets until it sets its own. */
    ReactorControls.DEFAULT_KEYS = {
        9: "tab", 13: "ok", 16: "shift", 17: "control", 18: "control", 27: "escape", 32: "ok", 33: "pageup", 34: "pagedown",
        37: "left", 38: "up", 39: "right", 40: "down", 45: "escape", 81: "pageup", 87: "pagedown", 88: "escape", 90: "ok",
        96: "escape", 98: "down", 100: "left", 102: "right", 104: "up", 120: "debug"
    };
    ReactorControls.DEFAULT_GAMEPAD = { 0: "ok", 1: "cancel", 2: "shift", 3: "menu", 4: "pageup", 5: "pagedown", 12: "up", 13: "down", 14: "left", 15: "right" };
    /** Jump on a 3D map: Space, and the gamepad's X (dash stays on Shift and Always Dash). */
    ReactorControls.DEFAULT_JUMP_KEYS = [32];
    ReactorControls.DEFAULT_JUMP_BUTTONS = [2];

    /** The project's controls, filled with the stock ones where it says nothing. */
    ReactorControls.settings = function() {
        const own = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.reactorControls && typeof $dataSystem.reactorControls === "object"
            ? $dataSystem.reactorControls : {};
        const numbers = list => (Array.isArray(list) ? list : []).map(Number).filter(Number.isFinite);
        return {
            keys: own.keys && typeof own.keys === "object" ? own.keys : null,
            gamepad: own.gamepad && typeof own.gamepad === "object" ? own.gamepad : null,
            jump: own.jump !== false,
            jumpKeys: Array.isArray(own.jumpKeys) ? numbers(own.jumpKeys) : this.DEFAULT_JUMP_KEYS.slice(),
            jumpButtons: Array.isArray(own.jumpButtons) ? numbers(own.jumpButtons) : this.DEFAULT_JUMP_BUTTONS.slice()
        };
    };

    /**
     * The project's own keys and buttons, once, when the game boots: they are
     * the game's defaults. A player's changes made later in game (a key
     * config screen, a plugin) are never undone by this.
     */
    ReactorControls.applyProject = function() {
        if (typeof Input === "undefined" || this._projectApplied) return;
        this._projectApplied = true;
        const settings = this.settings();
        const replace = (target, source) => { for (const k of Object.keys(target)) delete target[k]; Object.assign(target, source); };
        if (settings.keys) replace(Input.keyMapper, settings.keys);
        if (settings.gamepad) replace(Input.gamepadMapper, settings.gamepad);
    };

    /**
     * A key or button whose name changes while it is held can never be released under the old name: its
     * release clears the name it gives by then. So every name a change takes away is let go at the change.
     */
    ReactorControls.letGo = function(name) {
        if (name && typeof Input !== "undefined" && Input._currentState) Input._currentState[name] = false;
    };

    /**
     * On a 3D map with jumping on, the jump keys and buttons jump; off it they
     * go back to exactly what they did (only those entries are touched). A key
     * held across the change is let go.
     */
    ReactorControls.setField3D = function(on) {
        if (typeof Input === "undefined") return;
        const want = !!on && (root.ReactorPhysics ? root.ReactorPhysics.jumpAllowed() : false);
        if (want === !!this._saved) return;
        if (want) {
            const settings = this.settings();
            this._saved = { keys: {}, pads: {} };
            for (const code of settings.jumpKeys) { this._saved.keys[code] = Input.keyMapper[code]; if (Input.keyMapper[code] !== "jump") this.letGo(Input.keyMapper[code]); Input.keyMapper[code] = "jump"; }
            for (const button of settings.jumpButtons) { this._saved.pads[button] = Input.gamepadMapper[button]; if (Input.gamepadMapper[button] !== "jump") this.letGo(Input.gamepadMapper[button]); Input.gamepadMapper[button] = "jump"; }
        } else {
            let changed = false;
            const put = (target, saved) => { for (const [k, v] of Object.entries(saved)) { if (target[k] !== "jump") continue; if (v !== "jump") changed = true; if (v === undefined) delete target[k]; else target[k] = v; } };
            put(Input.keyMapper, this._saved.keys);
            put(Input.gamepadMapper, this._saved.pads);
            if (changed) this.letGo("jump");
            this._saved = null;
        }
    };

    /**
     * An action battle's own keys and buttons (reactor_fight_action.js): attack, aim, dodge, guard, reload,
     * the next weapon, the lock and the hotbar. The mouse's left and right buttons attack and aim besides.
     * A project sets its own in `reactorControls.actionKeys` / `actionButtons` ({ code: name }).
     */
    ReactorControls.BATTLE_ACTIONS = ["attack", "aim", "dodge", "guard", "reload", "weapon", "lock",
        "hotbar1", "hotbar2", "hotbar3", "hotbar4", "hotbar5", "hotbar6", "hotbar7", "hotbar8"];
    ReactorControls.DEFAULT_ACTION_KEYS = { 70: "attack", 71: "aim", 67: "dodge", 86: "guard", 82: "reload", 81: "weapon", 9: "lock",
        49: "hotbar1", 50: "hotbar2", 51: "hotbar3", 52: "hotbar4", 53: "hotbar5", 54: "hotbar6", 55: "hotbar7", 56: "hotbar8" };
    ReactorControls.DEFAULT_ACTION_BUTTONS = { 7: "attack", 6: "aim", 1: "dodge", 5: "guard", 3: "reload", 4: "weapon", 11: "lock", 9: "menu" };

    /**
     * While an action battle runs its keys and buttons do what the battle needs; when it ends they go back
     * to exactly what they did (only those entries are touched, and one changed meanwhile is left alone).
     * A key held across either change is let go: one held when a battle ends would otherwise stay pressed
     * under its battle name (an attack that fires by itself in the next battle, a guard that never drops).
     */
    ReactorControls.setAction = function(on) {
        if (typeof Input === "undefined" || !!on === !!this._savedAction) return;
        if (on) {
            const own = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.reactorControls && typeof $dataSystem.reactorControls === "object"
                ? $dataSystem.reactorControls : {};
            const keys = own.actionKeys && typeof own.actionKeys === "object" ? own.actionKeys : this.DEFAULT_ACTION_KEYS;
            const buttons = own.actionButtons && typeof own.actionButtons === "object" ? own.actionButtons : this.DEFAULT_ACTION_BUTTONS;
            this._savedAction = { keys: {}, pads: {}, set: { keys, buttons } };
            const take = (target, kept, set) => { for (const [k, name] of Object.entries(set)) { kept[k] = target[k]; if (target[k] !== name) this.letGo(target[k]); target[k] = name; } };
            take(Input.keyMapper, this._savedAction.keys, keys);
            take(Input.gamepadMapper, this._savedAction.pads, buttons);
            // Nothing is pressed under a battle name before the battle has read a key.
            for (const name of this.BATTLE_ACTIONS) this.letGo(name);
        } else {
            const saved = this._savedAction;
            this._savedAction = null;
            const put = (target, kept, set) => { for (const [k, v] of Object.entries(kept)) { if (target[k] !== set[k]) continue; if (v !== set[k]) this.letGo(set[k]); if (v === undefined) delete target[k]; else target[k] = v; } };
            put(Input.keyMapper, saved.keys, saved.set.keys);
            put(Input.gamepadMapper, saved.pads, saved.set.buttons);
            for (const name of this.BATTLE_ACTIONS) this.letGo(name);
        }
    };

    /**
     * A tactical battle's own keys and buttons (reactor_fight_tactical.js): turn the view, move the view,
     * the cursor to the cell's next level, back to the acting unit, end a unit's turn (held: fast-forward).
     * A project sets its own in `reactorControls.tacticalKeys` / `tacticalButtons` ({ code: name }); without
     * them each stands on the keys and buttons of an ordinary action (`TACTICAL_SYMBOLS`), wherever the
     * project put those, the view takes W A S D and E (`TACTICAL_VIEW_KEYS`), and the next level and the
     * acting unit take R3 and L3 where those do nothing else.
     */
    ReactorControls.TACTICAL_ACTIONS = ["viewLeft", "viewRight", "panUp", "panDown", "panLeft", "panRight", "level", "unit", "skip"];
    ReactorControls.TACTICAL_SYMBOLS = { viewLeft: "pageup", viewRight: "pagedown", level: "control", unit: "tab", skip: "shift" };
    /** W A S D move the view and E turns it right (Q, a page key, turns it left): each on a key the game gives nothing, or only what the stock keys give it. */
    ReactorControls.TACTICAL_VIEW_KEYS = { 87: "panUp", 65: "panLeft", 83: "panDown", 68: "panRight", 69: "viewRight" };
    ReactorControls.TACTICAL_VIEW_STOCK = { 87: "pagedown" };
    ReactorControls.DEFAULT_TACTICAL_KEYS = { 33: "viewLeft", 81: "viewLeft", 34: "viewRight", 69: "viewRight", 87: "panUp", 65: "panLeft", 83: "panDown", 68: "panRight", 17: "level", 18: "level", 9: "unit", 16: "skip" };
    ReactorControls.DEFAULT_TACTICAL_BUTTONS = { 4: "viewLeft", 5: "viewRight", 2: "skip", 11: "level", 10: "unit" };

    /** The tactical bindings a mapper gives when the project names none: by the ordinary action on each key or button. */
    ReactorControls.tacticalFrom = function(mapper, extras, view) {
        const out = {}, taken = {};
        for (const [code, symbol] of Object.entries(mapper || {})) {
            for (const name of this.TACTICAL_ACTIONS) if (this.TACTICAL_SYMBOLS[name] === symbol) { out[code] = name; taken[name] = true; }
        }
        // An action with nothing to stand on takes its stock button, where that button does nothing else.
        for (const [code, name] of Object.entries(extras || {})) if (!taken[name] && mapper[code] === undefined) out[code] = name;
        // The view's keys: a key that moves the cursor or does anything else in the game keeps doing it.
        for (const [code, name] of Object.entries(view || {})) {
            const symbol = (mapper || {})[code];
            if (symbol === undefined || symbol === this.TACTICAL_VIEW_STOCK[code]) out[code] = name;
        }
        return out;
    };

    /** Whether a tactical battle's own bindings are in force (the driver then reads the named actions). */
    ReactorControls.isTactical = function() {
        return !!this._savedTactical;
    };

    /**
     * While a tactical battle is on the map its keys and buttons do what the battle needs; when it ends, or
     * another scene opens, they go back to exactly what they did (as `setAction`). A key held across the
     * change is let go, so nothing stays pressed under a name its key no longer gives.
     */
    ReactorControls.setTactical = function(on) {
        if (typeof Input === "undefined" || !!on === !!this._savedTactical) return;
        const letGo = name => { if (name && Input._currentState) Input._currentState[name] = false; };
        if (on) {
            const own = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.reactorControls && typeof $dataSystem.reactorControls === "object"
                ? $dataSystem.reactorControls : {};
            const keys = own.tacticalKeys && typeof own.tacticalKeys === "object" ? own.tacticalKeys : this.tacticalFrom(Input.keyMapper, null, this.TACTICAL_VIEW_KEYS);
            const buttons = own.tacticalButtons && typeof own.tacticalButtons === "object" ? own.tacticalButtons
                : this.tacticalFrom(Input.gamepadMapper, this.DEFAULT_TACTICAL_BUTTONS);
            this._savedTactical = { keys: {}, pads: {}, set: { keys, buttons } };
            for (const [code, name] of Object.entries(keys)) { this._savedTactical.keys[code] = Input.keyMapper[code]; letGo(Input.keyMapper[code]); Input.keyMapper[code] = name; }
            for (const [button, name] of Object.entries(buttons)) { this._savedTactical.pads[button] = Input.gamepadMapper[button]; letGo(Input.gamepadMapper[button]); Input.gamepadMapper[button] = name; }
        } else {
            const saved = this._savedTactical;
            this._savedTactical = null;
            const put = (target, kept, set) => { for (const [k, v] of Object.entries(kept)) { if (target[k] !== set[k]) continue; letGo(set[k]); if (v === undefined) delete target[k]; else target[k] = v; } };
            put(Input.keyMapper, saved.keys, saved.set.keys);
            put(Input.gamepadMapper, saved.pads, saved.set.buttons);
        }
    };

    /** Whether the scene is a 3D map, where jumping and gravity work. */
    ReactorControls.isField3D = function(scene) {
        return !!(scene && typeof Scene_Map !== "undefined" && scene instanceof Scene_Map
            && typeof Reactor3D !== "undefined" && Reactor3D.isMap3D && typeof $dataMap !== "undefined" && $dataMap && Reactor3D.isMap3D($dataMap));
    };

    if (typeof Scene_Base !== "undefined") {
        const _start = Scene_Base.prototype.start;
        Scene_Base.prototype.start = function() {
            _start.apply(this, arguments);
            ReactorControls.applyProject();
            ReactorControls.setField3D(ReactorControls.isField3D(this));
        };
    }

    /**
     * On a 3D map the jump keys must say "jump". Something can write them back (a plugin's key
     * config, a scene that restores the maps) and Jump then quietly confirms instead: checked
     * about once a second, put back, and said on the console so the culprit can be found.
     */
    ReactorControls.checkField3D = function(scene) {
        if (typeof Input === "undefined" || !this._saved || !this.isField3D(scene)) return false;
        // A battle on the map has its own keys until it ends, a jump key among them where the two share one: taken
        // back here, the key would be given back as the battle's when the map is left.
        if (this._savedAction || this._savedTactical) return false;
        const settings = this.settings();
        const lostKey = settings.jumpKeys.find(code => Input.keyMapper[code] !== "jump");
        const lostPad = settings.jumpButtons.find(button => Input.gamepadMapper[button] !== "jump");
        if (lostKey === undefined && lostPad === undefined) return false;
        if (typeof console !== "undefined") console.warn("RPG Reactor: the jump " + (lostKey !== undefined ? "key " + lostKey + " had become \"" + Input.keyMapper[lostKey] + "\"" : "button " + lostPad + " had become \"" + Input.gamepadMapper[lostPad] + "\"") + "; put back.");
        // Re-taken, a key that still said "jump" must keep what it did before the map, or it jumps everywhere after.
        const before = this._saved;
        this._saved = null;
        this.setField3D(true);
        for (const kind of ["keys", "pads"]) {
            for (const [k, v] of Object.entries(this._saved ? this._saved[kind] : {})) if (v === "jump" && k in before[kind]) this._saved[kind][k] = before[kind][k];
        }
        return true;
    };
    if (typeof Scene_Map !== "undefined") {
        const _update = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            _update.apply(this, arguments);
            if (typeof Graphics !== "undefined" && Graphics.frameCount % 60 === 0) ReactorControls.checkField3D(this);
        };
    }

    //-------------------------------------------------------------------------
    // The names of keys and buttons as a player knows them, and the device used
    // last: what a battle's hint line, its menu and a HUD show for a control.

    ReactorControls.KEY_NAMES = { 8: "Backspace", 9: "Tab", 13: "Enter", 16: "Shift", 17: "Ctrl", 18: "Alt", 27: "Esc", 32: "Space", 33: "PgUp", 34: "PgDn", 35: "End", 36: "Home",
        37: "Left", 38: "Up", 39: "Right", 40: "Down", 45: "Ins", 46: "Del" };
    ReactorControls.BUTTON_NAMES = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Back", "Start", "L3", "R3", "D-pad Up", "D-pad Down", "D-pad Left", "D-pad Right"];

    /** A key as a player knows it: the letter or digit, a function or keypad key, or the key's short name; "" for one with no name. */
    ReactorControls.keyName = function(code) {
        code = Number(code);
        if (code >= 48 && code <= 57) return String(code - 48);
        if (code >= 65 && code <= 90) return String.fromCharCode(code);
        if (code >= 96 && code <= 105) return "Num " + (code - 96);
        if (code >= 112 && code <= 123) return "F" + (code - 111);
        return ReactorControls.KEY_NAMES[code] || "";
    };

    ReactorControls.buttonName = function(index) {
        return ReactorControls.BUTTON_NAMES[Number(index)] || "";
    };

    /**
     * Which of several keys bound to one action is named: the keys everyone knows first (Enter, Esc, Shift, Tab,
     * Ctrl, Space), then a letter or a digit, then the rest (Page Up, Insert, the keypad), the lowest code among equals.
     */
    ReactorControls.keyRank = function(code) {
        code = Number(code);
        const tier = [13, 27, 16, 9, 17, 32].includes(code) ? 0 : (code >= 48 && code <= 57) || (code >= 65 && code <= 90) ? 1 : 2;
        return tier * 1000 + code;
    };

    // The device used last, and who is told when it changes.
    let deviceNow = "keys";
    const deviceListeners = [];

    /**
     * The name of the key (for a pad: the button) that gives an Input symbol, the best known of them; "" when none
     * does. `device`: "keys" or "pad"; without it, the device used last.
     */
    ReactorControls.labelFor = function(symbol, device) {
        if (typeof Input === "undefined" || !Input.keyMapper) return "";
        const pad = (device || deviceNow) === "pad";
        const mapper = pad ? Input.gamepadMapper : Input.keyMapper;
        let best = "", rank = Infinity;
        for (const code in mapper) {
            const name = mapper[code];
            // Cancel and the menu both answer to a key that says "escape".
            if (name !== symbol && !(name === "escape" && (symbol === "cancel" || symbol === "menu"))) continue;
            const label = pad ? ReactorControls.buttonName(code) : ReactorControls.keyName(code), at = pad ? Number(code) : ReactorControls.keyRank(code);
            if (label && at < rank) { best = label; rank = at; }
        }
        return best;
    };

    /** The device used last: "keys" (a key or the mouse) or "pad" (a gamepad). */
    ReactorControls.device = function() {
        return deviceNow;
    };

    /** A key or the mouse was used ("keys"), or a gamepad ("pad"): whoever shows the names of controls is told when it changes. */
    ReactorControls.noteDevice = function(device) {
        if (deviceNow === device) return;
        deviceNow = device;
        for (let i = 0; i < deviceListeners.length; i++) deviceListeners[i](device);
    };

    /** `listener(device)` is called each time the device used last changes. */
    ReactorControls.onDevice = function(listener) {
        if (typeof listener === "function") deviceListeners.push(listener);
    };

    // Each way in notes its device: a key pressed, a pad button held, a mouse button pressed.
    if (typeof Input !== "undefined" && Input._onKeyDown && Input._updateGamepadState) {
        const onKeyDown = Input._onKeyDown, updatePad = Input._updateGamepadState;
        Input._onKeyDown = function(event) {
            ReactorControls.noteDevice("keys");
            return onKeyDown.call(this, event);
        };
        Input._updateGamepadState = function(gamepad) {
            updatePad.call(this, gamepad);
            const state = this._gamepadStates ? this._gamepadStates[gamepad.index] : null;
            if (state) for (let i = 0; i < state.length; i++) if (state[i]) { ReactorControls.noteDevice("pad"); break; }
        };
    }
    if (typeof TouchInput !== "undefined" && TouchInput._onMouseDown) {
        const onMouseDown = TouchInput._onMouseDown;
        TouchInput._onMouseDown = function(event) {
            ReactorControls.noteDevice("keys");
            return onMouseDown.call(this, event);
        };
    }

    if (typeof module !== "undefined" && module.exports) module.exports = ReactorControls;
})(typeof window !== "undefined" ? window : globalThis);
