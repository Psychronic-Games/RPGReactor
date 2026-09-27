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
     * On a 3D map with jumping on, the jump keys and buttons jump; off it they
     * go back to exactly what they did (only those entries are touched).
     */
    ReactorControls.setField3D = function(on) {
        if (typeof Input === "undefined") return;
        const want = !!on && (root.ReactorPhysics ? root.ReactorPhysics.jumpAllowed() : false);
        if (want === !!this._saved) return;
        if (want) {
            const settings = this.settings();
            this._saved = { keys: {}, pads: {} };
            for (const code of settings.jumpKeys) { this._saved.keys[code] = Input.keyMapper[code]; Input.keyMapper[code] = "jump"; }
            for (const button of settings.jumpButtons) { this._saved.pads[button] = Input.gamepadMapper[button]; Input.gamepadMapper[button] = "jump"; }
        } else {
            const put = (target, saved) => { for (const [k, v] of Object.entries(saved)) { if (target[k] !== "jump") continue; if (v === undefined) delete target[k]; else target[k] = v; } };
            put(Input.keyMapper, this._saved.keys);
            put(Input.gamepadMapper, this._saved.pads);
            this._saved = null;
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
        const settings = this.settings();
        const lostKey = settings.jumpKeys.find(code => Input.keyMapper[code] !== "jump");
        const lostPad = settings.jumpButtons.find(button => Input.gamepadMapper[button] !== "jump");
        if (lostKey === undefined && lostPad === undefined) return false;
        if (typeof console !== "undefined") console.warn("RPG Reactor: the jump " + (lostKey !== undefined ? "key " + lostKey + " had become \"" + Input.keyMapper[lostKey] + "\"" : "button " + lostPad + " had become \"" + Input.gamepadMapper[lostPad] + "\"") + "; put back.");
        this._saved = null;
        this.setField3D(true);
        return true;
    };
    if (typeof Scene_Map !== "undefined") {
        const _update = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            _update.apply(this, arguments);
            if (typeof Graphics !== "undefined" && Graphics.frameCount % 60 === 0) ReactorControls.checkField3D(this);
        };
    }

    if (typeof module !== "undefined" && module.exports) module.exports = ReactorControls;
})(typeof window !== "undefined" ? window : globalThis);
