//=============================================================================
// reactor_ui.js - Custom user interfaces authored in the database
//=============================================================================
//
// An interface is a record in data/UserInterfaces.json: a tree of Box,
// Image, Text, Button, List, and Gauge nodes with anchored positions, each
// control wired to an action (close, call another interface, run a common event, open a
// stock scene, a plugin command, a switch, a variable, or a script). The
// file is optional: a project without one has no interfaces and boots
// exactly as before. Every node draws through Window_Base so it inherits the
// window skin, the game font, escape codes, input handling, and whatever
// plugins do to windows. Scene interfaces take focus; overlay interfaces
// attach to Scene_Map and remain input-transparent.
//
// `Call User Interface` is the code-357 plugin command RPGReactor /
// CallUserInterface; a runtime without this file ignores it.

(function() {
    "use strict";

    const ReactorUI = {};
    window.ReactorUI = ReactorUI;
    window.$dataUserInterfaces = [];

    ReactorUI.DATA_URL = "data/UserInterfaces.json";
    ReactorUI.PLUGIN_NAME = "RPGReactor";
    ReactorUI.COMMAND_NAME = "CallUserInterface";
    ReactorUI.BOOT_OPTION = "rrui";
    ReactorUI.CAPTURE_OPTION = "rrcapture";
    /** Scenes the editor can capture, by key; the values are class names. */
    ReactorUI.CAPTURE_SCENES = {
        title: "Scene_Title", menu: "Scene_Menu", item: "Scene_Item", skill: "Scene_Skill",
        equip: "Scene_Equip", status: "Scene_Status", options: "Scene_Options", save: "Scene_Save",
        load: "Scene_Load", shop: "Scene_Shop", gameEnd: "Scene_GameEnd", battle: "Scene_Battle"
    };
    ReactorUI.MAX_NESTING = 16;
    // "Fit text to size" never shrinks a font below this many pixels.
    ReactorUI.MIN_FONT_SIZE = 8;
    ReactorUI.NODE_TYPES = ["box", "image", "text", "button", "list", "gauge"];
    ReactorUI.GAUGE_KINDS = ["hp", "mp", "tp", "exp", "mhp", "mmp", "atk", "def", "mat", "mdf", "agi", "luk", "variable"];
    ReactorUI.LIST_SOURCES = ["party", "inventory", "skills", "actorParameters", "actorEquipment", "actorStates", "options", "saveSlots", "variableRange", "literal"];
    ReactorUI.INVENTORY_CATEGORIES = ["all", "item", "weapon", "armor", "keyItem"];
    ReactorUI.IMAGE_SOURCES = ["picture", "system", "face", "character", "icon", "partyFace", "title1", "title2"];
    ReactorUI.ACTOR_SOURCES = ["partySlot", "actorId", "menuActor", "variable", "context"];
    ReactorUI.ANCHORS = {
        topLeft: [0, 0], top: [0.5, 0], topRight: [1, 0],
        left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
        bottomLeft: [0, 1], bottom: [0.5, 1], bottomRight: [1, 1]
    };

    /** Physical screen and centred UI-area metrics used by every interface. */
    ReactorUI.screenMetrics = function() {
        const width = typeof Graphics !== "undefined" && Number(Graphics.width) || 816;
        const height = typeof Graphics !== "undefined" && Number(Graphics.height) || 624;
        const boxWidth = typeof Graphics !== "undefined" && Number(Graphics.boxWidth) || width;
        const boxHeight = typeof Graphics !== "undefined" && Number(Graphics.boxHeight) || height;
        return {
            width, height, boxWidth, boxHeight,
            boxX: Math.floor((width - boxWidth) / 2),
            boxY: Math.floor((height - boxHeight) / 2)
        };
    };

    /** Re-expresses legacy UI-area root offsets in physical screen pixels. */
    ReactorUI.migrateLegacyCoordinates = function(nodes, metrics) {
        const m = metrics || this.screenMetrics();
        const ids = new Set(nodes.map(node => node.id));
        for (const node of nodes) {
            if (node.parent > 0 && ids.has(node.parent)) continue;
            const [ax, ay] = this.ANCHORS[node.anchor] || [0, 0];
            node.x += Math.round(m.boxX + m.boxWidth * ax - m.width * ax);
            node.y += Math.round(m.boxY + m.boxHeight * ay - m.height * ay);
        }
        return nodes;
    };

    /** Converts a physical rectangle to coordinates local to the scene's WindowLayer. */
    ReactorUI.windowRect = function(rect, scene) {
        const owner = scene && scene._mapScene || scene;
        const layer = owner && owner._windowLayer;
        const metrics = this.screenMetrics();
        const x = layer && Number.isFinite(Number(layer.x)) ? Number(layer.x) : metrics.boxX;
        const y = layer && Number.isFinite(Number(layer.y)) ? Number(layer.y) : metrics.boxY;
        return new Rectangle(rect.x - x, rect.y - y, rect.width, rect.height);
    };
    ReactorUI.SCENES = {
        item: "Scene_Item", skill: "Scene_Skill", equip: "Scene_Equip",
        status: "Scene_Status", save: "Scene_Save", load: "Scene_Load",
        options: "Scene_Options", gameEnd: "Scene_GameEnd", menu: "Scene_Menu",
        title: "Scene_Title"
    };

    //-------------------------------------------------------------------------
    // Data

    ReactorUI._state = null;
    // SceneManager rebuilds a popped-back-to scene from its class alone. A
    // single snapshot preserves all state needed by that rebuilt interface.
    ReactorUI._resumeStates = [];
    // True while the game is a preview booted by the editor's Playtest
    // Interface button: no title, no map, a black screen behind the
    // interface, and closing the last interface ends the playtest.
    ReactorUI._preview = false;

    ReactorUI.isPreview = function() {
        return this._preview;
    };

    /** Ends the interface preview; there is no game underneath to return to. */
    ReactorUI.endPreview = function() {
        this._preview = false;
        this._resumeStates.length = 0;
        if (typeof AudioManager !== "undefined" && AudioManager.stopAll) AudioManager.stopAll();
        if (!(typeof Utils !== "undefined" && Utils.isNwjs())) {
            try { window.close(); } catch (error) { /* a tab the script did not open stays; the canvas goes black */ }
        }
        SceneManager.exit();
    };

    /** Loads the interfaces file once; missing or malformed means none. */
    ReactorUI.load = function() {
        if (this._state) return;
        this._state = "loading";
        const finish = parsed => {
            window.$dataUserInterfaces = Array.isArray(parsed) ? parsed : [];
            this._state = "done";
        };
        try {
            if (typeof Utils !== "undefined" && Utils.isNwjs()) {
                const fs = require("fs");
                const path = require("path");
                const full = path.join(path.dirname(process.mainModule.filename), this.DATA_URL);
                if (!fs.existsSync(full)) return finish(null);
                return finish(JSON.parse(fs.readFileSync(full, "utf8")));
            }
        } catch (error) {
            console.warn("ReactorUI: could not read " + this.DATA_URL, error);
            return finish(null);
        }
        try {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", this.DATA_URL);
            xhr.overrideMimeType("application/json");
            xhr.onload = () => {
                let parsed = null;
                if (xhr.status < 400) {
                    try { parsed = JSON.parse(xhr.responseText); } catch (error) { parsed = null; }
                }
                finish(parsed);
            };
            xhr.onerror = () => finish(null);
            xhr.send();
        } catch (error) {
            finish(null);
        }
    };

    ReactorUI.isReady = function() {
        this.load();
        return this._state === "done";
    };

    ReactorUI.interface = function(id) {
        const list = window.$dataUserInterfaces;
        const raw = Array.isArray(list) ? list[Number(id)] : null;
        return raw ? this.normalizeInterface(raw) : null;
    };

    function finite(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function text(value, fallback) {
        return typeof value === "string" ? value : fallback;
    }

    function oneOf(value, options, fallback) {
        return options.indexOf(value) >= 0 ? value : fallback;
    }

    function isHexColor(value) {
        return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
    }

    function optionalByte(source, key) {
        if (!Object.prototype.hasOwnProperty.call(source, key) || source[key] === "" || source[key] == null) return "";
        return clamp(Math.round(finite(source[key], 255)), 0, 255);
    }

    /** A CSS color from "#rrggbb" and an 0-255 alpha. */
    ReactorUI.cssColor = function(hex, alpha) {
        const color = isHexColor(hex) ? hex : "#000000";
        const a = clamp(finite(alpha, 255), 0, 255) / 255;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    };

    /** Sparse visual-state values resolved without changing the authored node. */
    ReactorUI.controlStyle = function(node, state) {
        const focused = state === "focused";
        const pressed = state === "pressed";
        const disabled = state === "disabled";
        return {
            fillColor: disabled ? node.disabledFillColor : focused ? node.focusedFillColor : "",
            textColor: disabled ? node.disabledTextColor : focused ? node.focusedTextColor : "",
            borderColor: focused ? (node.focusedBorderColor || node.highlightColor) : "",
            opacity: disabled ? node.disabledOpacity : pressed ? node.pressedOpacity : focused ? node.focusedOpacity : "",
            offsetX: pressed ? node.pressedOffsetX : 0,
            offsetY: pressed ? node.pressedOffsetY : 0
        };
    };

    /** Source and destination rectangles for a clamped nine-slice draw. */
    ReactorUI.nineSliceSegments = function(sw, sh, dw, dh, insets) {
        const pair = (a, b, total) => {
            a = clamp(finite(a, 0), 0, Math.max(0, total));
            b = clamp(finite(b, 0), 0, Math.max(0, total));
            if (a + b > total && a + b > 0) {
                const scale = total / (a + b);
                a *= scale;
                b *= scale;
            }
            return [a, b];
        };
        sw = Math.max(0, finite(sw, 0)); sh = Math.max(0, finite(sh, 0));
        dw = Math.max(0, finite(dw, 0)); dh = Math.max(0, finite(dh, 0));
        const [sl, sr] = pair(insets && insets.left, insets && insets.right, sw);
        const [st, sb] = pair(insets && insets.top, insets && insets.bottom, sh);
        const [dl, dr] = pair(sl, sr, dw);
        const [dt, db] = pair(st, sb, dh);
        const sx = [0, sl, sw - sr], sy = [0, st, sh - sb];
        const dx = [0, dl, dw - dr], dy = [0, dt, dh - db];
        const widths = [[sl, Math.max(0, sw - sl - sr), sr], [dl, Math.max(0, dw - dl - dr), dr]];
        const heights = [[st, Math.max(0, sh - st - sb), sb], [dt, Math.max(0, dh - dt - db), db]];
        const segments = [];
        for (let row = 0; row < 3; row++) {
            for (let column = 0; column < 3; column++) {
                const segment = { sx: sx[column], sy: sy[row], sw: widths[0][column], sh: heights[0][row],
                    dx: dx[column], dy: dy[row], dw: widths[1][column], dh: heights[1][row] };
                if (segment.sw > 0 && segment.sh > 0 && segment.dw > 0 && segment.dh > 0) segments.push(segment);
            }
        }
        return segments;
    };

    ReactorUI.normalizeCondition = function(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        const type = oneOf(source.type, ["always", "never", "saveExists", "switch", "variable", "script"], "always");
        return {
            type,
            id: Math.max(0, Math.floor(finite(source.id, 0))),
            on: source.on !== false,
            op: oneOf(source.op, ["==", "!=", ">", ">=", "<", "<="], "=="),
            value: finite(source.value, 0),
            script: text(source.script, "")
        };
    };

    ReactorUI.normalizeAction = function(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        const type = oneOf(source.type, [
            "none", "close", "closeAll", "callInterface", "commonEvent", "scene",
            "pluginCommand", "switch", "variable", "script", "setMenuActor",
            "personalSkill", "personalEquip", "personalStatus", "titleNewGame",
            "titleContinue", "titleOptions", "gameEndToTitle", "previousMenuActor", "nextMenuActor",
            "optionChange", "saveSlot", "loadSlot"
        ], "none");
        let args = {};
        if (source.args && typeof source.args === "object" && !Array.isArray(source.args)) {
            for (const key of Object.keys(source.args)) args[key] = String(source.args[key]);
        }
        return {
            type,
            id: Math.max(0, Math.floor(finite(source.id, 0))),
            scene: oneOf(source.scene, Object.keys(this.SCENES), "menu"),
            plugin: text(source.plugin, ""),
            command: text(source.command, ""),
            args,
            on: source.on !== false,
            op: oneOf(source.op, ["set", "add", "sub"], "set"),
            value: finite(source.value, 0),
            script: text(source.script, ""),
            contextName: text(source.contextName, "selection").trim() || "selection",
            andClose: !!source.andClose
        };
    };

    ReactorUI.normalizeSe = function(raw) {
        if (!raw || typeof raw !== "object" || !text(raw.name, "")) return null;
        return {
            name: raw.name,
            volume: clamp(finite(raw.volume, 90), 0, 100),
            pitch: clamp(finite(raw.pitch, 100), 50, 150),
            pan: clamp(finite(raw.pan, 0), -100, 100)
        };
    };

    ReactorUI.normalizeLiteralItems = function(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.slice(0, 1000).map((entry, index) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                const value = typeof entry === "number" || typeof entry === "string" ? entry : "";
                return { id: index + 1, value, text: String(value), enabled: true };
            }
            const primitive = (value, fallback) => typeof value === "number" || typeof value === "string" ? value : fallback;
            return {
                id: primitive(entry.id, index + 1),
                value: primitive(entry.value, primitive(entry.id, index + 1)),
                text: text(entry.text, String(primitive(entry.value, primitive(entry.id, index + 1)))),
                enabled: entry.enabled !== false
            };
        });
    };

    ReactorUI.normalizeNode = function(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        const type = oneOf(source.type, this.NODE_TYPES, "box");
        const legacyActorSource = source.actorMode === "actor" ? "actorId" : "partySlot";
        const actorSource = oneOf(source.actorSource, this.ACTOR_SOURCES, legacyActorSource);
        const node = {
            id: Math.max(1, Math.floor(finite(source.id, 1))),
            type,
            name: text(source.name, ""),
            parent: Math.max(0, Math.floor(finite(source.parent, 0))),
            anchor: Object.prototype.hasOwnProperty.call(this.ANCHORS, source.anchor) ? source.anchor : "topLeft",
            x: Math.round(finite(source.x, 0)),
            y: Math.round(finite(source.y, 0)),
            width: Math.max(0, Math.round(finite(source.width, 0))),
            height: Math.max(0, Math.round(finite(source.height, 0))),
            opacity: clamp(Math.round(finite(source.opacity, 255)), 0, 255),
            visible: this.normalizeCondition(source.visible),
            // Box / button surface
            fill: oneOf(source.fill, ["window", "color", "gradient", "none"], type === "text" || type === "image" || type === "gauge" ? "none" : "window"),
            color: isHexColor(source.color) ? source.color : "#000000",
            color2: isHexColor(source.color2) ? source.color2 : "#000000",
            fillOpacity: clamp(Math.round(finite(source.fillOpacity, 160)), 0, 255),
            vertical: source.vertical !== false,
            borderWidth: clamp(Math.round(finite(source.borderWidth, 0)), 0, 32),
            borderColor: isHexColor(source.borderColor) ? source.borderColor : "#ffffff",
            radius: clamp(Math.round(finite(source.radius, 0)), 0, 200),
            // Text / button label
            text: text(source.text, ""),
            align: oneOf(source.align, ["left", "center", "right"], type === "button" ? "center" : "left"),
            wrap: !!source.wrap,
            fitText: !!source.fitText,
            fontSize: clamp(Math.round(finite(source.fontSize, 0)), 0, 200),
            textColor: isHexColor(source.textColor) ? source.textColor
                : clamp(Math.round(finite(source.textColor, 0)), 0, 31),
            outline: source.outline !== false,
            fontFace: text(source.fontFace, ""),
            fontBold: !!source.fontBold,
            fontItalic: !!source.fontItalic,
            outlineColor: isHexColor(source.outlineColor) ? source.outlineColor : "",
            outlineWidth: source.outline === false ? 0 : clamp(Math.round(finite(source.outlineWidth, 3)), 0, 32),
            letterSpacing: clamp(Math.round(finite(source.letterSpacing, 0)), -20, 100),
            // Image
            source: oneOf(source.source, this.IMAGE_SOURCES, "picture"),
            file: text(source.file, ""),
            index: Math.max(0, Math.floor(finite(source.index, 0))),
            fit: oneOf(source.fit, ["none", "stretch", "contain"], "none"),
            nineSlice: !!source.nineSlice && ["picture", "system"].includes(oneOf(source.source, this.IMAGE_SOURCES, "picture")),
            sliceLeft: clamp(Math.round(finite(source.sliceLeft, 0)), 0, 9999),
            sliceTop: clamp(Math.round(finite(source.sliceTop, 0)), 0, 9999),
            sliceRight: clamp(Math.round(finite(source.sliceRight, 0)), 0, 9999),
            sliceBottom: clamp(Math.round(finite(source.sliceBottom, 0)), 0, 9999),
            // Actor binding. `index` and actorMode remain compatibility shorthands.
            actorSource,
            actorVariableId: Math.max(1, Math.floor(finite(source.actorVariableId, 1))),
            actorContextName: text(source.actorContextName, "selection").trim() || "selection",
            // Gauge: hp/mp/tp of the party member in slot `index`, or a variable against `max`
            gauge: oneOf(source.gauge, this.GAUGE_KINDS, "hp"),
            variableId: Math.max(1, Math.floor(finite(source.variableId, 1))),
            max: Math.max(1, Math.round(finite(source.max, 100))),
            maxVariableId: Math.max(0, Math.floor(finite(source.maxVariableId, 0))),
            label: text(source.label, ""),
            showLabel: source.showLabel !== false,
            showValue: source.showValue !== false,
            valueFormat: oneOf(source.valueFormat, ["current", "currentMax", "percent", "hidden"], source.showValue === false ? "hidden" : "current"),
            gaugeColor1: isHexColor(source.gaugeColor1) ? source.gaugeColor1 : "",
            gaugeColor2: isHexColor(source.gaugeColor2) ? source.gaugeColor2 : "",
            gaugeBackColor: isHexColor(source.gaugeBackColor) ? source.gaugeBackColor : "",
            gaugeHeight: clamp(Math.round(finite(source.gaugeHeight, 0)), 0, 240),
            // List
            dataSource: oneOf(source.dataSource, this.LIST_SOURCES, "literal"),
            category: oneOf(source.category, this.INVENTORY_CATEGORIES, "all"),
            actorMode: oneOf(source.actorMode, ["party", "actor"], "party"),
            actorId: Math.max(1, Math.floor(finite(source.actorId, 1))),
            skillTypeId: Math.max(0, Math.floor(finite(source.skillTypeId, 0))),
            includeAutosave: !!source.includeAutosave,
            rangeStart: Math.max(1, Math.floor(finite(source.rangeStart, 1))),
            rangeEnd: Math.max(1, Math.floor(finite(source.rangeEnd, 10))),
            items: this.normalizeLiteralItems(source.items),
            rowText: text(source.rowText, ""),
            rowHeight: clamp(Math.round(finite(source.rowHeight, 36)), 24, 240),
            contextName: text(source.contextName, "selection").trim() || "selection",
            selectionVariableId: Math.max(0, Math.floor(finite(source.selectionVariableId, 0))),
            selectionValue: oneOf(source.selectionValue, ["id", "value"], "id"),
            // Button / list
            action: this.normalizeAction(source.action),
            enabled: this.normalizeCondition(source.enabled),
            highlightColor: isHexColor(source.highlightColor) ? source.highlightColor : "#ffffff",
            focusedFillColor: isHexColor(source.focusedFillColor) ? source.focusedFillColor : "",
            focusedTextColor: isHexColor(source.focusedTextColor) ? source.focusedTextColor : "",
            focusedBorderColor: isHexColor(source.focusedBorderColor) ? source.focusedBorderColor : "",
            focusedOpacity: optionalByte(source, "focusedOpacity"),
            pressedOffsetX: clamp(Math.round(finite(source.pressedOffsetX, 0)), -32, 32),
            pressedOffsetY: clamp(Math.round(finite(source.pressedOffsetY, 0)), -32, 32),
            pressedOpacity: optionalByte(source, "pressedOpacity"),
            disabledFillColor: isHexColor(source.disabledFillColor) ? source.disabledFillColor : "",
            disabledTextColor: isHexColor(source.disabledTextColor) ? source.disabledTextColor : "",
            disabledOpacity: optionalByte(source, "disabledOpacity"),
            focusUp: Math.max(0, Math.floor(finite(source.focusUp, 0))),
            focusDown: Math.max(0, Math.floor(finite(source.focusDown, 0))),
            focusLeft: Math.max(0, Math.floor(finite(source.focusLeft, 0))),
            focusRight: Math.max(0, Math.floor(finite(source.focusRight, 0))),
            se: this.normalizeSe(source.se)
        };
        return node;
    };

    ReactorUI.normalizeInterface = function(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        const nodes = Array.isArray(source.nodes) ? source.nodes.map(node => this.normalizeNode(node)) : [];
        const ids = new Set();
        const unique = [];
        for (const node of nodes) {
            if (ids.has(node.id)) continue;
            ids.add(node.id);
            unique.push(node);
        }
        if (source.coordinateSpace !== "screen") this.migrateLegacyCoordinates(unique);
        return {
            id: Math.max(0, Math.floor(finite(source.id, 0))),
            name: text(source.name, ""),
            mode: oneOf(source.mode, ["scene", "overlay"], "scene"),
            background: oneOf(source.background, ["blur", "dim", "none"], "blur"),
            visible: this.normalizeCondition(source.visible),
            cancel: this.normalizeAction(source.cancel || { type: "close" }),
            firstFocus: Math.max(0, Math.floor(finite(source.firstFocus, 0))),
            openTransition: oneOf(source.openTransition, ["none", "fade", "slideLeft"], "none"),
            closeTransition: oneOf(source.closeTransition, ["none", "fade", "slideLeft"], "none"),
            transitionDuration: clamp(Math.round(finite(source.transitionDuration, 18)), 1, 120),
            coordinateSpace: "screen",
            nodes: this.orderNodes(unique),
            note: text(source.note, ""),
            stock: text(source.stock, ""),
            roles: Array.from(new Set((Array.isArray(source.roles) ? source.roles : source.stock ? [source.stock] : [])
                .filter(role => Object.prototype.hasOwnProperty.call(this.REPLACEMENTS || {}, role))))
        };
    };

    //-------------------------------------------------------------------------
    // Layout and conditions

    /**
     * Nodes in draw order: every parent before its children, siblings in
     * authored order, so a child never hides under its own parent.
     */
    ReactorUI.orderNodes = function(nodes) {
        nodes = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
        const byParent = new Map();
        const byId = new Map(nodes.map(node => [node.id, node]));
        const effectiveParent = node => {
            let parentId = node.parent;
            const trail = new Set([node.id]);
            while (parentId && byId.has(parentId)) {
                if (trail.has(parentId)) return 0;
                trail.add(parentId);
                parentId = byId.get(parentId).parent;
            }
            return byId.has(node.parent) && node.parent !== node.id ? node.parent : 0;
        };
        for (const node of nodes) {
            const parent = effectiveParent(node);
            if (!byParent.has(parent)) byParent.set(parent, []);
            byParent.get(parent).push(node);
        }
        const ordered = [];
        const visit = (parent, trail) => {
            for (const node of byParent.get(parent) || []) {
                if (trail.has(node.id)) continue;
                ordered.push(node);
                trail.add(node.id);
                visit(node.id, trail);
            }
        };
        visit(0, new Set());
        // Nodes inside a parent cycle never get visited; append them so
        // nothing authored silently disappears.
        for (const node of nodes) if (!ordered.includes(node)) ordered.push(node);
        return ordered;
    };

    /** Screen-space rectangle of a node given its parent's rectangle. */
    ReactorUI.resolveRect = function(node, parentRect, measured) {
        const [ax, ay] = this.ANCHORS[node.anchor] || [0, 0];
        const width = node.width > 0 ? node.width : (measured ? measured.width : 0);
        const height = node.height > 0 ? node.height : (measured ? measured.height : 0);
        return new Rectangle(
            Math.round(parentRect.x + parentRect.width * ax - width * ax + node.x),
            Math.round(parentRect.y + parentRect.height * ay - height * ay + node.y),
            width,
            height
        );
    };

    ReactorUI.evaluateCondition = function(condition, scene) {
        switch (condition.type) {
            case "never": return false;
            case "saveExists": return typeof DataManager !== "undefined" && DataManager.isAnySavefileExists ? DataManager.isAnySavefileExists() : false;
            case "switch": return $gameSwitches.value(condition.id) === condition.on;
            case "variable": {
                const value = Number($gameVariables.value(condition.id));
                const target = condition.value;
                switch (condition.op) {
                    case "!=": return value !== target;
                    case ">": return value > target;
                    case ">=": return value >= target;
                    case "<": return value < target;
                    case "<=": return value <= target;
                    default: return value === target;
                }
            }
            case "script": {
                const fn = this.compileScript(condition.script);
                if (!fn) return false;
                try {
                    return !!fn.call(scene, scene);
                } catch (error) {
                    console.warn("ReactorUI: condition script failed", error);
                    return false;
                }
            }
            default: return true;
        }
    };

    // Conditions run every frame; compile each script once.
    ReactorUI._scriptCache = new Map();
    ReactorUI.compileScript = function(source) {
        if (this._scriptCache.has(source)) return this._scriptCache.get(source);
        let fn = null;
        try {
            fn = new Function("scene", source);
        } catch (error) {
            console.warn("ReactorUI: script does not compile", error);
        }
        this._scriptCache.set(source, fn);
        return fn;
    };

    ReactorUI.bootInterfaceId = function() {
        const read = arg => {
            for (const token of String(arg).split("&")) {
                const match = /^rrui=(\d+)$/.exec(token);
                if (match) return Number(match[1]);
            }
            return 0;
        };
        let id = read(location.search.slice(1));
        if (!id && typeof Utils !== "undefined" && Utils.isNwjs() && typeof nw !== "undefined") {
            for (const arg of nw.App.argv) {
                id = read(arg);
                if (id) break;
            }
        }
        return id;
    };

    //-------------------------------------------------------------------------
    // Capturing a stock scene for the editor
    //
    // `test&rrcapture=menu&rrcapturedir=<encoded dir>` on the launch line: the
    // game boots, opens that scene with the project's plugins in place, waits
    // for its windows to open, and writes what is on screen for the editor's
    // reference layer. The only faithful answer to "what does my menu look
    // like" is the running game; this asks it and leaves.

    /** Every `&`-delimited launch-line token, from the URL and NW's argv. */
    ReactorUI.launchTokens = function() {
        const tokens = [];
        const add = arg => { for (const token of String(arg || "").split("&")) if (token) tokens.push(token); };
        try { add(location.search.slice(1)); } catch (e) { /* no location */ }
        if (typeof Utils !== "undefined" && Utils.isNwjs() && typeof nw !== "undefined" && nw.App) {
            for (const arg of nw.App.argv || []) add(arg);
        }
        return tokens;
    };

    /** The capture request on the launch line, or null. */
    ReactorUI.captureRequest = function(tokens) {
        let scene = "";
        let dir = "";
        for (const token of tokens || this.launchTokens()) {
            const eq = token.indexOf("=");
            if (eq < 0) continue;
            const key = token.slice(0, eq);
            const value = token.slice(eq + 1);
            if (key === this.CAPTURE_OPTION) scene = value;
            else if (key === "rrcapturedir") {
                try { dir = decodeURIComponent(value); } catch (e) { dir = value; }
            }
        }
        if (!scene || !this.CAPTURE_SCENES[scene]) return null;
        return { scene, dir, sceneClass: this.CAPTURE_SCENES[scene] };
    };

    ReactorUI._capture = null;

    /**
     * Open the requested scene the way the game would: every menu opens
     * over the map (plugins snapshot it for the menu background and assume
     * it is there), a battle starts from the map, and the title stands on
     * its own. So a new game is set up, the map starts, and only then is
     * the scene pushed.
     */
    ReactorUI.beginCapture = function(request) {
        const sceneClass = window[request.sceneClass];
        if (typeof sceneClass !== "function") return false;
        this._capture = { request, frames: 0, waited: 0, sceneClass, done: false, stage: "map", mapFrames: 0 };
        this.installCaptureHooks();
        // The capture window opens behind the editor; an unfocused game
        // pauses its scene updates, and windows only open while updated.
        SceneManager.isGameActive = function() { return true; };
        // The per-frame check is hooked here, at boot, after every plugin
        // and compatibility layer has had its say about SceneManager: a
        // wrapper installed at load time was replaced under MV projects.
        if (!SceneManager.__reactorCaptureHooked) {
            SceneManager.__reactorCaptureHooked = true;
            const _updateMain = SceneManager.updateMain;
            SceneManager.updateMain = function() {
                _updateMain.apply(this, arguments);
                if (ReactorUI._capture) ReactorUI.updateCapture();
            };
        }
        // A crash anywhere in the scene must not leave the editor waiting:
        // it is written as the capture's result, and the game exits.
        const _catchException = SceneManager.catchException;
        SceneManager.catchException = function(error) {
            const capture = ReactorUI._capture;
            if (capture && !capture.done && request.dir && typeof require === "function") {
                capture.done = true;
                try {
                    const fs = require("fs");
                    fs.mkdirSync(request.dir, { recursive: true });
                    fs.writeFileSync(require("path").join(request.dir, "capture.json"),
                        JSON.stringify({ error: String(error && error.message || error) }));
                } catch (e) { /* nothing more to do */ }
                setTimeout(() => SceneManager.exit(), 300);
            }
            return _catchException.apply(this, arguments);
        };
        // Game objects exist before the title too: Scene_Boot sets up a new
        // game on the way there, and title plugins read them.
        DataManager.setupNewGame();
        if (request.scene === "title") {
            this._capture.stage = "scene";
            Window_TitleCommand.initCommandPosition();
            SceneManager.goto(sceneClass);
            return true;
        }
        SceneManager.goto(Scene_Map);
        return true;
    };

    /** From a running map, open the requested scene as the game would. */
    ReactorUI.openCaptureScene = function() {
        const capture = this._capture;
        const request = capture.request;
        const sceneClass = capture.sceneClass;
        capture.stage = "scene";
        if (request.scene === "battle") {
            const troopId = ($dataTroops || []).findIndex((troop, index) => index > 0 && troop);
            BattleManager.setup(troopId > 0 ? troopId : 1, true, true);
            SceneManager.push(sceneClass);
            return;
        }
        SceneManager.snapForBackground();
        if (request.scene === "menu") Window_MenuCommand.initCommandPosition();
        SceneManager.push(sceneClass);
        if (request.scene === "shop") {
            const goods = [];
            for (let id = 1; id < ($dataItems || []).length && goods.length < 6; id++) {
                if ($dataItems[id] && $dataItems[id].name) goods.push([0, id, 0, 0]);
            }
            SceneManager.prepareNextScene(goods, false);
        }
    };

    //-------------------------------------------------------------------------
    // Capture: what a scene draws, as interface elements
    //
    // A capture records every draw primitive that lands on a window's
    // contents (or a sprite's drawn bitmap) while the scene builds, and the
    // higher-level draws whose meaning matters (an actor's name, the gold
    // value, a command) as elements that already carry escape codes and
    // party codes. The editor turns the result into nodes.

    ReactorUI._captureSuppress = 0;
    ReactorUI._captureHooked = false;

    ReactorUI.wrapMethod = function(proto, name, wrapper) {
        if (!proto) return;
        const original = proto[name];
        if (typeof original !== "function") return;
        proto[name] = function() {
            return wrapper.call(this, original, Array.prototype.slice.call(arguments));
        };
    };

    ReactorUI.drawLog = function(bitmap) {
        if (!bitmap) return [];
        if (!bitmap.__rrDraws) bitmap.__rrDraws = [];
        return bitmap.__rrDraws;
    };

    /** 0-based party slot of an actor, or -1 when it is not in the party. */
    ReactorUI.partySlot = function(actor) {
        const party = typeof $gameParty !== "undefined" && $gameParty;
        if (!party || !actor) return -1;
        return party.members().indexOf(actor);
    };

    /** A slot-bound code for a party member, or the literal for anyone else. */
    ReactorUI.slotCode = function(actor, code, literal) {
        const slot = this.partySlot(actor);
        return slot >= 0 ? "\\" + code + "[" + (slot + 1) + "]" : literal;
    };

    ReactorUI.installCaptureHooks = function() {
        if (this._captureHooked) return;
        this._captureHooked = true;
        const self = this;
        const quiet = () => self._captureSuppress > 0;
        const semantic = (proto, name, record) => this.wrapMethod(proto, name, function(original, args) {
            if (!quiet()) {
                try { record.apply(this, args); } catch (e) { /* the draw still happens */ }
            }
            self._captureSuppress++;
            try { return original.apply(this, args); } finally { self._captureSuppress--; }
        });
        const textEntry = (win, text, x, y, width, align, codes) => ({
            kind: "text", text, x, y, width, height: win.lineHeight(), align: align || "left",
            fontSize: win.contents.fontSize, color: win.contents.textColor, outline: win.contents.outlineWidth > 0,
            opacity: win.contents.paintOpacity, codes: !!codes
        });
        if (typeof Bitmap !== "undefined") {
            this.wrapMethod(Bitmap.prototype, "drawText", function(original, args) {
                const [text, x, y, maxWidth, lineHeight, align] = args;
                if (!quiet()) {
                    const value = String(text == null ? "" : text);
                    self.drawLog(this).push({
                        kind: "text", text: value, x, y, width: maxWidth, height: lineHeight, align: align || "left",
                        fontSize: this.fontSize, color: this.textColor, outline: this.outlineWidth > 0,
                        opacity: this.paintOpacity, measured: this.measureTextWidth(value)
                    });
                }
                return original.apply(this, args);
            });
            this.wrapMethod(Bitmap.prototype, "blt", function(original, args) {
                const [source, sx, sy, sw, sh, dx, dy, dw, dh] = args;
                if (!quiet() && source) {
                    self.drawLog(this).push({
                        kind: "blt", url: source.url || source._url || "", sx, sy, sw, sh, x: dx, y: dy,
                        width: dw || sw, height: dh || sh, sourceWidth: source.width, sourceHeight: source.height,
                        opacity: this.paintOpacity
                    });
                }
                return original.apply(this, args);
            });
            this.wrapMethod(Bitmap.prototype, "fillRect", function(original, args) {
                const [x, y, width, height, color] = args;
                if (!quiet()) self.drawLog(this).push({ kind: "fill", x, y, width, height, color, opacity: this.paintOpacity });
                return original.apply(this, args);
            });
            this.wrapMethod(Bitmap.prototype, "gradientFillRect", function(original, args) {
                const [x, y, width, height, color, color2, vertical] = args;
                if (!quiet()) self.drawLog(this).push({ kind: "gradient", x, y, width, height, color, color2, vertical: !!vertical, opacity: this.paintOpacity });
                return original.apply(this, args);
            });
            this.wrapMethod(Bitmap.prototype, "clear", function(original, args) {
                this.__rrDraws = [];
                return original.apply(this, args);
            });
            this.wrapMethod(Bitmap.prototype, "clearRect", function(original, args) {
                const [x, y, width, height] = args;
                if (this.__rrDraws) {
                    this.__rrDraws = this.__rrDraws.filter(d => !(d.x >= x && d.y >= y && d.x + (d.width || 0) <= x + width && d.y + (d.height || 0) <= y + height));
                }
                return original.apply(this, args);
            });
        }
        if (typeof Window_Base !== "undefined") {
            semantic(Window_Base.prototype, "drawTextEx", function(text, x, y, width) {
                self.drawLog(this.contents).push({ kind: "textEx", text: String(text == null ? "" : text), x, y, width, fontSize: this.contents.fontSize, opacity: this.contents.paintOpacity });
            });
            semantic(Window_Base.prototype, "drawItemName", function(item, x, y, width) {
                if (item) self.drawLog(this.contents).push({ kind: "textEx", text: "\\I[" + (item.iconIndex || 0) + "]" + item.name, x, y, width, fontSize: this.contents.fontSize, opacity: this.contents.paintOpacity });
            });
            semantic(Window_Base.prototype, "drawCurrencyValue", function(value, unit, x, y, width) {
                const unitWidth = Math.min(80, this.textWidth(unit));
                const gold = typeof $gameParty !== "undefined" && $gameParty && value === $gameParty.gold();
                const log = self.drawLog(this.contents);
                log.push(textEntry(this, gold ? "\\GOLD" : String(value), x, y, width - unitWidth - 6, "right", true));
                log.push(textEntry(this, "\\C[16]\\G", x + width - unitWidth, y, unitWidth, "right", true));
            });
        }
        if (typeof Window_StatusBase !== "undefined") {
            semantic(Window_StatusBase.prototype, "drawActorName", function(actor, x, y, width) {
                const entry = textEntry(this, self.slotCode(actor, "P", actor.name()), x, y, width || 168, "left", true);
                entry.color = typeof ColorManager !== "undefined" ? ColorManager.hpColor(actor) : entry.color;
                self.drawLog(this.contents).push(entry);
            });
            semantic(Window_StatusBase.prototype, "drawActorClass", function(actor, x, y, width) {
                self.drawLog(this.contents).push(textEntry(this, self.slotCode(actor, "PCLASS", actor.currentClass().name), x, y, width || 168, "left", true));
            });
            semantic(Window_StatusBase.prototype, "drawActorNickname", function(actor, x, y, width) {
                self.drawLog(this.contents).push(textEntry(this, actor.nickname(), x, y, width || 270, "left", true));
            });
            semantic(Window_StatusBase.prototype, "drawActorLevel", function(actor, x, y) {
                const log = self.drawLog(this.contents);
                log.push(textEntry(this, "\\C[16]" + TextManager.levelA, x, y, 48, "left", true));
                log.push(textEntry(this, self.slotCode(actor, "PLV", String(actor.level)), x + 72, y, 48, "right", true));
            });
            semantic(Window_StatusBase.prototype, "drawActorFace", function(actor, x, y, width, height) {
                const slot = self.partySlot(actor);
                self.drawLog(this.contents).push({
                    kind: "image", source: slot >= 0 ? "partyFace" : "face", file: actor.faceName(), index: slot >= 0 ? slot : actor.faceIndex(),
                    x, y, width: width || ImageManager.faceWidth, height: height || ImageManager.faceHeight, opacity: this.contents.paintOpacity
                });
            });
            semantic(Window_StatusBase.prototype, "drawActorCharacter", function(actor, x, y) {
                const bitmap = ImageManager.loadCharacter(actor.characterName());
                const big = ImageManager.isBigCharacter(actor.characterName());
                const pw = bitmap.width > 0 ? bitmap.width / (big ? 3 : 12) : 48;
                const ph = bitmap.height > 0 ? bitmap.height / (big ? 4 : 8) : 48;
                self.drawLog(this.contents).push({
                    kind: "image", source: "character", file: actor.characterName(), index: actor.characterIndex(),
                    x: Math.round(x - pw / 2), y: Math.round(y - ph), width: Math.round(pw), height: Math.round(ph), opacity: this.contents.paintOpacity
                });
            });
        }
        if (typeof Window_Command !== "undefined") {
            semantic(Window_Command.prototype, "drawItem", function(index) {
                const rect = this.itemRect(index);
                self.drawLog(this.contents).push({
                    kind: "button", text: String(this.commandName(index)), symbol: String(this.commandSymbol(index) || ""),
                    x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                    align: this.itemTextAlign ? this.itemTextAlign() : "center", enabled: !!this.isCommandEnabled(index)
                });
            });
        }
    };

    /** Window-skin index of a text colour the game drew with, or the colour itself. */
    ReactorUI.colorIndex = function(color) {
        if (typeof color !== "string" || typeof ColorManager === "undefined" || typeof ColorManager.textColor !== "function") return color;
        if (!this._colorIndexCache) {
            this._colorIndexCache = new Map();
            for (let i = 0; i < 32; i++) {
                try {
                    const hex = String(ColorManager.textColor(i)).toLowerCase();
                    if (!this._colorIndexCache.has(hex)) this._colorIndexCache.set(hex, i);
                } catch (e) { /* skin not ready */ }
            }
        }
        const key = color.toLowerCase();
        return this._colorIndexCache.has(key) ? this._colorIndexCache.get(key) : color;
    };

    /** "#rrggbb" + 0..255 alpha from a CSS colour the engine drew with. */
    ReactorUI.cssToHex = function(color) {
        const value = String(color || "").trim();
        let m = /^#([0-9a-f]{6})$/i.exec(value);
        if (m) return { hex: "#" + m[1].toLowerCase(), alpha: 255 };
        m = /^#([0-9a-f]{3})$/i.exec(value);
        if (m) return { hex: "#" + m[1].split("").map(c => c + c).join("").toLowerCase(), alpha: 255 };
        m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
        if (m) {
            const hex = "#" + [m[1], m[2], m[3]].map(n => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0")).join("");
            return { hex, alpha: m[4] === undefined ? 255 : Math.round(Math.max(0, Math.min(1, Number(m[4]))) * 255) };
        }
        return { hex: "#000000", alpha: 255 };
    };

    /** Image-node source and file for an image URL the engine loaded, or null. */
    ReactorUI.imageSourceFromUrl = function(url) {
        let value = String(url || "");
        try { value = decodeURIComponent(value); } catch (e) { /* as is */ }
        const m = /(?:^|[\/\\])img[\/\\]([^\/\\]+)[\/\\]([^?]+)(?:\?.*)?$/i.exec(value);
        if (!m) return null;
        const folder = m[1].toLowerCase();
        const file = m[2].replace(/(?:\.png_|\.rpgmvp)$/i, "").replace(/\.png$/i, "");
        const source = { pictures: "picture", system: "system", faces: "face", characters: "character", titles1: "title1", titles2: "title2" }[folder];
        return source ? { source, file, folder } : null;
    };

    /** An image element (or {icon}) for a blt / sprite frame off a loaded image. */
    ReactorUI.imageFromFrame = function(frame) {
        const parsed = this.imageSourceFromUrl(frame.url);
        if (!parsed) return null;
        const base = { kind: "image", source: parsed.source, file: parsed.file, index: 0, x: frame.x, y: frame.y, width: frame.width, height: frame.height, opacity: frame.opacity === undefined ? 255 : frame.opacity };
        if (parsed.source === "system" && /^IconSet$/i.test(parsed.file)) {
            const iw = typeof ImageManager !== "undefined" && ImageManager.iconWidth || 32;
            const ih = typeof ImageManager !== "undefined" && ImageManager.iconHeight || 32;
            return { icon: Math.floor(frame.sx / iw) + Math.floor(frame.sy / ih) * 16, x: frame.x, y: frame.y, width: frame.width, height: frame.height };
        }
        if (parsed.source === "face") {
            const fw = typeof ImageManager !== "undefined" && ImageManager.faceWidth || 144;
            const fh = typeof ImageManager !== "undefined" && ImageManager.faceHeight || 144;
            base.index = Math.floor(frame.sx / fw) + Math.floor(frame.sy / fh) * 4;
            return base;
        }
        if (parsed.source === "character") {
            const big = /\$/.test(parsed.file);
            const pw = frame.sourceWidth > 0 ? frame.sourceWidth / (big ? 3 : 12) : frame.sw;
            const ph = frame.sourceHeight > 0 ? frame.sourceHeight / (big ? 4 : 8) : frame.sh;
            base.index = big || !(pw > 0 && ph > 0) ? 0 : Math.max(0, Math.round((frame.sx / pw - 1) / 3) + Math.floor(frame.sy / ph / 4) * 4);
            return base;
        }
        // A part of a system sheet (a button set) has no node that shows a sub-frame.
        if (parsed.source === "system" && (frame.sx > 0 || frame.sy > 0 || (frame.sourceWidth > 0 && frame.sw < frame.sourceWidth))) return null;
        return base;
    };

    /**
     * Text primitives on one line become one Text element with \C[n] and
     * \I[n] codes; centred / right-aligned draws and code-carrying draws
     * stand alone. `ctx.mainFontSize` and `ctx.lineHeight` describe the
     * window font so a line's y can be re-expressed for a text node, whose
     * line box is fontSize + (lineHeight - mainFontSize) tall.
     */
    ReactorUI.mergeTextRuns = function(runs, ctx) {
        const main = ctx && ctx.mainFontSize || 26;
        const lineHeight = ctx && ctx.lineHeight || 36;
        const out = [];
        const finish = (text, first, opts) => {
            const fontSize = first.fontSize || main;
            const nodeLine = fontSize + (lineHeight - main);
            const element = {
                kind: "text", text, x: Math.round(first.x), y: Math.round(first.y + ((first.height || nodeLine) - nodeLine) / 2),
                width: opts.width || 0, height: 0, align: opts.align || "left",
                fontSize: fontSize === main ? 0 : fontSize, textColor: opts.color === undefined ? 0 : opts.color,
                outline: first.outline !== false, opacity: first.opacity === undefined ? 255 : first.opacity
            };
            if (opts.fitText) element.fitText = true;
            out.push(element);
        };
        const lines = new Map();
        for (const run of runs) {
            if (run.kind === "textEx") {
                out.push({ kind: "text", text: run.text, x: Math.round(run.x), y: Math.round(run.y), width: 0, height: 0, align: "left", fontSize: 0, textColor: 0, outline: true, opacity: run.opacity === undefined ? 255 : run.opacity });
                continue;
            }
            if (run.kind === "text" && (run.codes || run.align !== "left")) {
                const color = run.codes ? 0 : this.colorIndex(run.color);
                const wide = run.width > 0 && run.width < 100000 ? Math.round(run.width) : 0;
                finish(run.text, run, { width: wide, align: run.align, color });
                continue;
            }
            const key = Math.round(run.kind === "icon" ? run.y - 2 : run.y);
            if (!lines.has(key)) lines.set(key, []);
            lines.get(key).push(run);
        }
        for (const items of lines.values()) {
            items.sort((a, b) => a.x - b.x);
            let text = "", first = null, end = 0, color = null, startColor = 0, count = 0;
            const flush = () => {
                if (first && text) {
                    const squeezed = count === 1 && first.measured !== undefined && first.width > 0 && first.width < 100000 && first.measured > first.width;
                    finish(text, first, { color: startColor, width: squeezed ? Math.round(first.width) : 0, fitText: squeezed });
                }
                text = ""; first = null; count = 0;
            };
            for (const item of items) {
                const gap = first ? item.x - end : 0;
                if (first && (gap > 6 || gap < -4 || (item.kind === "text" && first.fontSize !== item.fontSize))) flush();
                count++;
                if (item.kind === "icon") {
                    if (!first) { first = { x: item.x - 2, y: item.y - 2, height: null, fontSize: main, outline: true, opacity: 255 }; color = 0; startColor = 0; }
                    text += "\\I[" + item.icon + "]";
                    end = item.x + (item.width || 32) + 2;
                    continue;
                }
                const index = this.colorIndex(item.color);
                if (!first) { first = item; color = index; startColor = index; text = typeof index === "number" && index !== 0 ? "\\C[" + index + "]" : ""; }
                else if (index !== color) { text += typeof index === "number" ? "\\C[" + index + "]" : ""; color = index; }
                text += item.text;
                end = item.x + (item.measured !== undefined ? item.measured : Math.min(item.width || 0, 4096));
            }
            flush();
        }
        return out;
    };

    /** Elements from a bitmap's draw log (text merged, icons folded into text, images and fills kept). */
    ReactorUI.elementsFromDraws = function(draws, ctx) {
        const out = [];
        const runs = [];
        for (const d of draws || []) {
            switch (d.kind) {
                case "text": case "textEx": runs.push(d); break;
                case "blt": {
                    const element = this.imageFromFrame(d);
                    if (!element) break;
                    if (element.icon !== undefined) runs.push(Object.assign({ kind: "icon" }, element));
                    else out.push(element);
                    break;
                }
                case "fill": case "gradient": {
                    const c1 = this.cssToHex(d.color);
                    const c2 = d.kind === "gradient" ? this.cssToHex(d.color2) : null;
                    out.push({ kind: "box", x: d.x, y: d.y, width: d.width, height: d.height, color: c1.hex, color2: c2 ? c2.hex : c1.hex,
                        gradient: !!c2, vertical: !!d.vertical, fillOpacity: c1.alpha, opacity: d.opacity === undefined ? 255 : d.opacity });
                    break;
                }
                case "image": case "button": out.push(Object.assign({}, d)); break;
                default: break;
            }
        }
        for (const element of this.mergeTextRuns(runs, ctx)) out.push(element);
        return out.map(element => { delete element.url; return element; });
    };

    ReactorUI.fontContext = function(win) {
        return {
            mainFontSize: typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem.mainFontSize ? $gameSystem.mainFontSize() : 26,
            lineHeight: win && typeof win.lineHeight === "function" ? win.lineHeight() : 36
        };
    };

    /** Elements of an inner sprite of a window (gauges, names) or a scene sprite, at (x, y). */
    ReactorUI.spriteElements = function(sprite, x, y, ctx) {
        if (!sprite || sprite.visible === false) return [];
        if (typeof Sprite_Gauge !== "undefined" && sprite instanceof Sprite_Gauge) {
            const kind = sprite._statusType;
            if (!this.GAUGE_KINDS.includes(kind)) return [];
            const slot = this.partySlot(sprite._battler);
            if (slot < 0) return [];
            return [{ kind: "gauge", gauge: kind, index: slot, x, y, width: sprite.bitmapWidth(), height: sprite.textHeight() }];
        }
        if (typeof Sprite_Name !== "undefined" && sprite instanceof Sprite_Name) {
            const actor = sprite._battler;
            if (!actor) return [];
            const color = this.colorIndex(sprite.textColor());
            return [{ kind: "text", text: this.slotCode(actor, "P", actor.name()), x, y, width: sprite.bitmapWidth(), height: 0, align: "left", fontSize: 0,
                textColor: typeof color === "number" ? color : 0, outline: true, opacity: 255 }];
        }
        if (typeof Sprite_StateIcon !== "undefined" && sprite instanceof Sprite_StateIcon) return [];
        if (typeof Sprite_Button !== "undefined" && sprite instanceof Sprite_Button) return [];
        const bitmap = sprite.bitmap;
        if (!bitmap) return [];
        const anchorX = sprite.anchor ? sprite.anchor.x : 0;
        const anchorY = sprite.anchor ? sprite.anchor.y : 0;
        const scaleX = sprite.scale ? sprite.scale.x : 1;
        const scaleY = sprite.scale ? sprite.scale.y : 1;
        const url = bitmap.url || bitmap._url || "";
        if (url) {
            const frame = sprite._frame || { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
            const width = Math.round((frame.width || bitmap.width) * scaleX);
            const height = Math.round((frame.height || bitmap.height) * scaleY);
            const element = this.imageFromFrame({ url, sx: frame.x, sy: frame.y, sw: frame.width, sh: frame.height,
                sourceWidth: bitmap.width, sourceHeight: bitmap.height, x: Math.round(x - width * anchorX), y: Math.round(y - height * anchorY),
                width, height, opacity: sprite.opacity });
            if (!element || element.icon !== undefined) return [];
            if (scaleX !== 1 || scaleY !== 1) element.fit = "stretch";
            return [element];
        }
        if (!bitmap.__rrDraws || !bitmap.__rrDraws.length) return [];
        const ox = Math.round(x - bitmap.width * anchorX);
        const oy = Math.round(y - bitmap.height * anchorY);
        return this.elementsFromDraws(bitmap.__rrDraws, ctx).map(element => Object.assign(element, { x: element.x + ox, y: element.y + oy }));
    };

    /** Everything a window shows, in window-local pixels. */
    ReactorUI.windowElements = function(win) {
        const ctx = this.fontContext(win);
        const pad = Number(win.padding) || 0;
        const out = [];
        const contents = win.contents;
        if (contents && contents.__rrDraws) {
            for (const element of this.elementsFromDraws(contents.__rrDraws, ctx)) {
                element.x += pad;
                element.y += pad;
                out.push(element);
            }
        }
        for (const child of win._innerChildren || []) {
            for (const element of this.spriteElements(child, pad + (Number(child.x) || 0), pad + (Number(child.y) || 0), ctx)) out.push(element);
        }
        // Sprites a plugin adds straight to the window sit beside the
        // window's own container and client area, in window pixels.
        const own = new Set([win._container, win._clientArea, win._windowContentsSprite, win._windowBackSprite, win._windowFrameSprite,
            win._windowCursorSprite, win._windowSpriteContainer, win._downArrowSprite, win._upArrowSprite, win._windowPauseSignSprite, win._dimmerSprite]);
        for (const child of win.children || []) {
            if (own.has(child) || (win._innerChildren || []).includes(child)) continue;
            for (const element of this.spriteElements(child, Number(child.x) || 0, Number(child.y) || 0, ctx)) out.push(element);
        }
        return out;
    };

    /** Sprites of the scene outside windows (title art, drawn titles), in screen pixels. */
    ReactorUI.sceneElements = function(scene) {
        const out = [];
        const ctx = this.fontContext(null);
        const background = typeof SceneManager !== "undefined" ? SceneManager._backgroundBitmap : null;
        const walk = (node, ox, oy) => {
            if (!node || node.visible === false) return;
            const x = ox + (Number(node.x) || 0);
            const y = oy + (Number(node.y) || 0);
            if (typeof Window_Base !== "undefined" && node instanceof Window_Base) return;
            if (typeof WindowLayer !== "undefined" && node instanceof WindowLayer) return;
            if (typeof Spriteset_Base !== "undefined" && node instanceof Spriteset_Base) return;
            if (node.bitmap && background && node.bitmap === background) return;
            if (node.bitmap && node !== scene) {
                for (const element of this.spriteElements(node, x, y, ctx)) out.push(element);
            }
            for (const child of node.children || []) walk(child, x, y);
        };
        walk(scene, 0, 0);
        return out;
    };

    /** Every window in the scene tree with its screen rect. */
    ReactorUI.collectWindows = function(scene) {
        const out = [];
        const walk = (node, ox, oy) => {
            if (!node) return;
            const x = ox + (Number(node.x) || 0);
            const y = oy + (Number(node.y) || 0);
            if (typeof Window_Base !== "undefined" && node instanceof Window_Base) {
                const cursor = node._cursorRect || { x: 0, y: 0, width: 0, height: 0 };
                out.push({
                    window: node,
                    className: (node.constructor && node.constructor.name) || "Window",
                    x, y,
                    width: node.width, height: node.height,
                    padding: node.padding,
                    opacity: node.opacity, backOpacity: node.backOpacity, contentsOpacity: node.contentsOpacity,
                    openness: node.openness, visible: !!node.visible, active: !!node.active,
                    cursorRect: { x: cursor.x, y: cursor.y, width: cursor.width, height: cursor.height },
                    windowskinName: node.windowskin && (node.windowskin.url || node.windowskin._url || "")
                });
            }
            for (const child of node.children || []) walk(child, x, y);
        };
        walk(scene, 0, 0);
        return out;
    };

    ReactorUI._pngBytes = function(dataUrl) {
        const comma = dataUrl.indexOf(",");
        return Buffer.from(dataUrl.slice(comma + 1), "base64");
    };

    ReactorUI.screenshotDataUrl = function() {
        const app = Graphics._app;
        if (!app || !app.renderer || !app.renderer.extract) return null;
        const extract = app.renderer.extract;
        // The screen, not the stage's bounds: an off-screen sprite (a 3D
        // pass, an effect overlay) can stretch those to a texture too big
        // to allocate.
        const frame = new PIXI.Rectangle(0, 0, Graphics.width, Graphics.height);
        const canvas = PIXI.TextureSource
            ? extract.canvas({ target: app.stage, frame, resolution: 1 })
            : extract.canvas(app.stage, frame);
        return canvas && canvas.toDataURL ? canvas.toDataURL("image/png") : null;
    };

    /** Write the scene to the request's directory; true when written. */
    ReactorUI.performCapture = function() {
        const capture = this._capture;
        if (!capture || capture.done) return false;
        capture.done = true;
        const request = capture.request;
        if (!request.dir || typeof require !== "function") return false;
        const fs = require("fs");
        const path = require("path");
        try {
            fs.mkdirSync(request.dir, { recursive: true });
            const scene = SceneManager._scene;
            const windows = this.collectWindows(scene);
            const entries = windows.map((entry, index) => {
                const record = Object.assign({}, entry);
                delete record.window;
                const contents = entry.window.contents;
                const canvas = contents && (contents.canvas || contents._canvas);
                if (canvas && canvas.toDataURL && canvas.width > 0 && canvas.height > 0) {
                    const file = "window-" + index + ".png";
                    fs.writeFileSync(path.join(request.dir, file), this._pngBytes(canvas.toDataURL("image/png")));
                    record.contentsFile = file;
                    record.contentsWidth = canvas.width;
                    record.contentsHeight = canvas.height;
                }
                try { record.elements = this.windowElements(entry.window); } catch (e) { record.elements = []; }
                return record;
            });
            let sceneElements = [];
            try { sceneElements = this.sceneElements(scene); } catch (e) { sceneElements = []; }
            const shot = this.screenshotDataUrl();
            if (shot) fs.writeFileSync(path.join(request.dir, "screen.png"), this._pngBytes(shot));
            const plugins = (typeof $plugins !== "undefined" ? $plugins : [])
                .filter(plugin => plugin && plugin.status).map(plugin => plugin.name);
            fs.writeFileSync(path.join(request.dir, "capture.json"), JSON.stringify({
                scene: request.scene,
                sceneClass: scene && scene.constructor ? scene.constructor.name : request.sceneClass,
                width: Graphics.width, height: Graphics.height,
                capturedAt: new Date().toISOString(),
                screenFile: shot ? "screen.png" : null,
                plugins,
                windows: entries,
                elements: sceneElements
            }, null, 1));
            return true;
        } catch (error) {
            console.error("ReactorUI: capture failed.", error);
            try { fs.writeFileSync(path.join(request.dir, "capture.json"), JSON.stringify({ error: String(error && error.message || error) })); } catch (e) { /* nothing to do */ }
            return false;
        }
    };

    /**
     * Once per frame while a capture is pending: wait for the scene to be
     * the requested one, started, settled, and its windows fully open
     * (or 3 seconds, whichever comes first), then capture and exit.
     */
    ReactorUI.updateCapture = function() {
        const capture = this._capture;
        if (!capture || capture.done) return;
        const scene = SceneManager._scene;
        // MZ marks the scene started; an MV-compatible project marks the
        // manager instead. Either counts, and a scene that never starts
        // within ten seconds is captured as it stands rather than never.
        const started = !!scene && (
            (typeof scene.isStarted === "function" && scene.isStarted())
            || SceneManager._sceneStarted === true
            || (typeof SceneManager.isCurrentSceneStarted === "function" && SceneManager.isCurrentSceneStarted()));
        const changing = SceneManager.isSceneChanging && SceneManager.isSceneChanging();
        if (capture.stage === "map") {
            // Let the map run a moment (fade-in, autorun events settling)
            // before the scene opens over it.
            const onMap = typeof Scene_Map !== "undefined" && scene instanceof Scene_Map && started && !changing
                && !(typeof $gamePlayer !== "undefined" && $gamePlayer && $gamePlayer.isTransferring());
            if (onMap) capture.mapFrames++;
            if (capture.mapFrames >= 30 || ++capture.waited >= 900) this.openCaptureScene();
            return;
        }
        if (!(scene instanceof capture.sceneClass) || !started || changing) {
            if (++capture.waited >= 600) {
                this.performCapture();
                SceneManager.exit();
            }
            return;
        }
        capture.frames++;
        const windows = this.collectWindows(scene);
        const settled = windows.every(entry => !entry.visible || entry.openness >= 255 || !entry.window.isOpening || !entry.window.isOpening());
        if ((settled && capture.frames >= 20) || capture.frames >= 180) {
            this.performCapture();
            SceneManager.exit();
        }
    };

    //-------------------------------------------------------------------------
    // Calling

    ReactorUI.call = function(id) {
        const record = this.interface(id);
        if (!record) {
            console.warn("ReactorUI: no user interface with id " + id);
            return false;
        }
        if (record.mode === "overlay") {
            const scene = SceneManager._scene;
            if (typeof Scene_Map !== "undefined" && scene instanceof Scene_Map && scene.ensureReactorUIOverlay) {
                scene.ensureReactorUIOverlay(record);
                return true;
            }
            console.warn("ReactorUI: overlay interface " + id + " requires Scene_Map");
            return false;
        }
        let depth = 0;
        for (const scene of SceneManager._stack) if (scene === Scene_ReactorUI) depth++;
        if (depth >= this.MAX_NESTING) {
            console.warn("ReactorUI: interface nesting limit reached");
            return false;
        }
        SceneManager.push(Scene_ReactorUI);
        SceneManager.prepareNextScene(Number(id));
        return true;
    };

    ReactorUI.registerPluginCommands = function() {
        if (this._pluginCommandsRegistered) return;
        if (typeof PluginManager === "undefined" || !PluginManager.registerCommand) return;
        this._pluginCommandsRegistered = true;
        PluginManager.registerCommand(this.PLUGIN_NAME, this.COMMAND_NAME, function(args) {
            const id = Number((args && args.interfaceId) || 0);
            if (id > 0 && !$gameParty.inBattle()) ReactorUI.call(id);
        });
    };
    ReactorUI.registerPluginCommands();

    //-------------------------------------------------------------------------
    // Window_ReactorUINode
    //
    // One window per node. Skin-filled boxes and buttons are ordinary
    // windows; everything else hides its frame and back and paints on its
    // contents, so pictures, text, and flat panels sit in the same layer,
    // in authoring order, under the same plugins.

    function Window_ReactorUINode() {
        this.initialize(...arguments);
    }

    window.Window_ReactorUINode = Window_ReactorUINode;
    Window_ReactorUINode.prototype = Object.create(Window_Base.prototype);
    Window_ReactorUINode.prototype.constructor = Window_ReactorUINode;

    Window_ReactorUINode.prototype.initialize = function(rect, scene, node) {
        this._uiScene = scene;
        this._uiNode = node;
        this._uiFocused = false;
        this._uiPressed = false;
        this._uiEnabled = true;
        this._uiLastText = null;
        this._uiBitmap = null;
        this._uiFontScale = 1;
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = this.usesSkin() ? 255 : 0;
        this.frameVisible = this.usesSkin();
        if (node.type === "image") this.requestBitmap();
        this.refresh();
    };

    Window_ReactorUINode.prototype.node = function() {
        return this._uiNode;
    };

    Window_ReactorUINode.prototype.usesSkin = function() {
        const node = this._uiNode;
        return (node.type === "box" || node.type === "button") && node.fill === "window";
    };

    Window_ReactorUINode.prototype.updatePadding = function() {
        this.padding = this.usesSkin() ? $gameSystem.windowPadding() : 0;
    };

    Window_ReactorUINode.prototype.updateBackOpacity = function() {
        this.backOpacity = this.usesSkin() ? $gameSystem.windowOpacity() : 0;
    };

    Window_ReactorUINode.prototype.isFocusable = function() {
        return this._uiNode.type === "button";
    };

    Window_ReactorUINode.prototype.isEnabled = function() {
        return this._uiEnabled;
    };

    Window_ReactorUINode.prototype.setEnabled = function(enabled) {
        if (this._uiEnabled === enabled) return;
        this._uiEnabled = enabled;
        this.refresh();
    };

    Window_ReactorUINode.prototype.setFocused = function(focused) {
        if (this._uiFocused === focused) return;
        this._uiFocused = focused;
        this.refresh();
    };

    Window_ReactorUINode.prototype.setPressed = function(pressed) {
        pressed = !!pressed && this._uiEnabled;
        if (this._uiPressed === pressed) return;
        this._uiPressed = pressed;
        this.refresh();
    };

    Window_ReactorUINode.prototype.controlState = function() {
        return !this._uiEnabled ? "disabled" : this._uiPressed ? "pressed" : this._uiFocused ? "focused" : "base";
    };

    Window_ReactorUINode.prototype.syncVisualState = function() {
        const style = ReactorUI.controlStyle(this._uiNode, this.controlState());
        const base = this._uiOpacity === undefined ? 255 : this._uiOpacity;
        const stateOpacity = style.opacity === "" ? 255 : style.opacity;
        const opacity = Math.round(base * stateOpacity / 255);
        this.contentsOpacity = opacity;
        this.opacity = this.usesSkin() ? opacity : 0;
        const x = this._uiLayoutX === undefined ? this.x : this._uiLayoutX;
        const y = this._uiLayoutY === undefined ? this.y : this._uiLayoutY;
        this.x = x + style.offsetX + (this._uiTransitionX || 0);
        this.y = y + style.offsetY + (this._uiTransitionY || 0);
        this.alpha = this._uiTransitionAlpha === undefined ? 1 : this._uiTransitionAlpha;
        if (this._uiGauge) this._uiGauge.opacity = opacity;
    };

    Window_ReactorUINode.prototype.resetFontSettings = function() {
        Window_Base.prototype.resetFontSettings.call(this);
        const node = this._uiNode;
        let size = node.fontSize > 0 ? node.fontSize : this.contents.fontSize;
        if (this._uiFontScale < 1) size = Math.max(ReactorUI.MIN_FONT_SIZE, Math.round(size * this._uiFontScale));
        this.contents.fontSize = size;
        if (node.fontFace) this.contents.fontFace = node.fontFace;
        this.contents.fontBold = node.fontBold;
        this.contents.fontItalic = node.fontItalic;
        this.contents.outlineWidth = node.outline ? node.outlineWidth : 0;
        if (node.outlineColor) this.contents.outlineColor = node.outlineColor;
        const context = this.contents.context;
        if (context) {
            if ("letterSpacing" in context) context.letterSpacing = node.letterSpacing + "px";
            if ("textLetterSpacing" in context) context.textLetterSpacing = node.letterSpacing + "px";
        }
        const override = ReactorUI.controlStyle(node, this.controlState()).textColor;
        this.changeTextColor(override || (isHexColor(node.textColor) ? node.textColor : ColorManager.textColor(node.textColor)));
    };

    /** Party codes resolve before the stock codes, for drawing and measuring alike. */
    Window_ReactorUINode.prototype.convertEscapeCharacters = function(text) {
        const bound = ReactorUI.resolveActorTokens(text, this._uiNode, this._uiScene);
        return Window_Base.prototype.convertEscapeCharacters.call(this, ReactorUI.convertPartyCodes(bound));
    };

    /** The node's text with escape codes resolved, as the game shows it now. */
    Window_ReactorUINode.prototype.currentText = function() {
        const node = this._uiNode;
        if (node.type !== "text" && node.type !== "button") return "";
        return this.convertEscapeCharacters(node.text);
    };

    /** The party member in a 0-based slot, or null past the party's end. */
    ReactorUI.partyMember = function(slot) {
        const party = typeof $gameParty !== "undefined" && $gameParty;
        if (!party) return null;
        const members = party.members();
        return members[Math.max(0, Math.floor(slot))] || null;
    };

    ReactorUI.actorFromContext = function(scene, name) {
        const row = scene && scene.context ? scene.context(name) : null;
        if (!row) return null;
        if (row.data && typeof row.data.actorId === "function") return row.data;
        const id = Number(row.actorId || (row.kind === "actor" ? row.id : 0)) || 0;
        return id > 0 && typeof $gameActors !== "undefined" && $gameActors && $gameActors.actor ? $gameActors.actor(id) : null;
    };

    /** Resolves the common actor binding carried by Text, Image, Gauge, and actor Lists. */
    ReactorUI.resolveActor = function(node, scene) {
        if (!node) return null;
        switch (node.actorSource) {
            case "actorId":
                return typeof $gameActors !== "undefined" && $gameActors && $gameActors.actor ? $gameActors.actor(node.actorId) : null;
            case "menuActor":
                return typeof $gameParty !== "undefined" && $gameParty && $gameParty.menuActor ? $gameParty.menuActor() : null;
            case "variable": {
                const id = typeof $gameVariables !== "undefined" && $gameVariables ? Number($gameVariables.value(node.actorVariableId)) || 0 : 0;
                return id > 0 && typeof $gameActors !== "undefined" && $gameActors && $gameActors.actor ? $gameActors.actor(id) : null;
            }
            case "context":
                return this.actorFromContext(scene, node.actorContextName);
            default:
                return this.partyMember(node.index);
        }
    };

    ReactorUI.ACTOR_PARAMS = ["mhp", "mmp", "atk", "def", "mat", "mdf", "agi", "luk"];

    ReactorUI.actorTextValue = function(actor, token) {
        if (!actor) return "";
        const key = String(token).toLowerCase();
        const call = (name, fallback) => typeof actor[name] === "function" ? actor[name]() : fallback;
        const currentExp = Number(call("currentExp", 0)) || 0;
        const levelExp = Number(call("currentLevelExp", 0)) || 0;
        const nextLevelExp = Number(call("nextLevelExp", currentExp)) || currentExp;
        const maxLevel = !!call("isMaxLevel", false);
        const param = name => {
            const id = this.ACTOR_PARAMS.indexOf(name);
            return id >= 0 && actor.param ? actor.param(id) : actor[name];
        };
        const values = {
            name: call("name", ""), nickname: call("nickname", ""),
            class: call("currentClass", null) ? call("currentClass", null).name : "",
            level: actor.level, profile: call("profile", ""), hp: actor.hp, mp: actor.mp, tp: actor.tp,
            mhp: actor.mhp, maxhp: actor.mhp, mmp: actor.mmp, maxmp: actor.mmp,
            maxtp: call("maxTp", 100), currentexp: maxLevel ? 0 : Math.max(0, currentExp - levelExp),
            totalexp: currentExp, nextexp: maxLevel ? currentExp : nextLevelExp,
            nextrequiredexp: maxLevel ? 0 : Number(call("nextRequiredExp", Math.max(0, nextLevelExp - currentExp))) || 0
        };
        for (const name of this.ACTOR_PARAMS.slice(2)) values[name] = param(name);
        const value = values[key];
        return value == null ? "" : String(value);
    };

    ReactorUI.CONTEXT_FIELDS = ["key", "kind", "id", "value", "name", "description", "icon", "iconIndex", "count",
        "playtime", "index", "paramName", "paramValue", "price", "level", "symbol", "valueText", "title", "timestamp",
        "date", "partyCharacters", "partyFaces", "existing", "enabled"];

    ReactorUI.resolveContextTokens = function(value, node, scene) {
        const row = scene && scene.context ? scene.context(node && node.contextName) : null;
        const fields = this.CONTEXT_FIELDS.join("|");
        return String(value == null ? "" : value).replace(new RegExp("\\{context\\.(" + fields + ")\\}", "gi"), (match, token) => {
            if (!row) return "";
            const field = this.CONTEXT_FIELDS.find(name => name.toLowerCase() === token.toLowerCase());
            const result = row[field];
            return result == null ? "" : String(result);
        });
    };

    ReactorUI.resolveActorTokens = function(value, node, scene) {
        const actor = this.resolveActor(node, scene);
        const contextBound = this.resolveContextTokens(value, node, scene);
        return contextBound.replace(/\{actor\.(name|nickname|class|level|profile|hp|mp|tp|mhp|maxHp|mmp|maxMp|maxTp|currentExp|totalExp|nextExp|nextRequiredExp|atk|def|mat|mdf|agi|luk)\}/gi,
            (match, token) => this.actorTextValue(actor, token));
    };

    // Party codes are slot-based like \P[n] and resolve before the stock
    // escape codes: \GOLD, and per member \PLV[n] level, \PCLASS[n] class,
    // \PHP[n] \PMHP[n] \PMP[n] \PMMP[n] \PTP[n]. An empty slot reads as "".
    ReactorUI.PARTY_CODES = {
        PLV: actor => actor.level, PCLASS: actor => actor.currentClass().name,
        PHP: actor => actor.hp, PMHP: actor => actor.mhp, PMP: actor => actor.mp,
        PMMP: actor => actor.mmp, PTP: actor => actor.tp
    };

    ReactorUI.convertPartyCodes = function(text) {
        let out = String(text == null ? "" : text);
        if (out.indexOf("\\") < 0) return out;
        out = out.replace(/\\\\/g, "\u0000");
        out = out.replace(/\\GOLD/gi, () => typeof $gameParty !== "undefined" && $gameParty ? String($gameParty.gold()) : "0");
        out = out.replace(/\\(PLV|PCLASS|PHP|PMHP|PMP|PMMP|PTP)\[(\d+)\]/gi, (match, code, n) => {
            const member = this.partyMember(Number(n) - 1);
            return member ? String(this.PARTY_CODES[code.toUpperCase()](member)) : "";
        });
        return out.replace(/\u0000/g, "\\\\");
    };

    ReactorUI.formatListRow = function(template, row) {
        const source = template || row.defaultText || "{name}";
        return source.replace(/\{(key|kind|id|value|name|description|icon|iconIndex|count|playtime|index|paramName|paramValue|price|level|symbol|valueText|title|timestamp|date|partyCharacters|partyFaces|existing|enabled)\}/gi, (match, key) => {
            const field = { iconindex: "iconIndex", paramname: "paramName", paramvalue: "paramValue", valuetext: "valueText",
                partycharacters: "partyCharacters", partyfaces: "partyFaces" }[key.toLowerCase()] || key.toLowerCase();
            const value = row[field];
            return value == null ? "" : String(value);
        });
    };

    ReactorUI.listRowsSignature = function(rows) {
        return JSON.stringify(rows.map(row => Object.keys(row).filter(key => key !== "data").sort().map(key => [key, row[key]])));
    };

    /** Rows for the fixed declarative List sources. */
    ReactorUI.listRows = function(node, scene) {
        const rows = [];
        const add = row => {
            const base = {
                key: String(row.kind || "row") + ":" + String(row.id), kind: "row", id: 0, value: 0,
                name: "", description: "", iconIndex: 0, icon: 0, count: "", enabled: true, data: null,
                playtime: "", paramName: "", paramValue: "", price: "", level: "", actorId: 0,
                symbol: "", valueText: "", title: "", timestamp: "", date: "", partyCharacters: "", partyFaces: "", existing: false
            };
            row = Object.assign(base, row);
            const baseKey = row.key;
            let duplicate = 1;
            while (rows.some(existing => existing.key === row.key)) row.key = baseKey + ":" + duplicate++;
            row.icon = row.iconIndex;
            row.index = rows.length + 1;
            row.text = this.formatListRow(node.rowText, row);
            rows.push(row);
        };
        switch (node.dataSource) {
            case "party": {
                const members = typeof $gameParty !== "undefined" && $gameParty && $gameParty.members ? $gameParty.members() : [];
                for (const actor of members) {
                    const id = actor && actor.actorId ? actor.actorId() : 0;
                    if (actor) add({ key: "actor:" + id, kind: "actor", id, value: id, actorId: id, name: actor.name(),
                        description: actor.profile ? actor.profile() : "", level: actor.level, data: actor, defaultText: "{name}" });
                }
                break;
            }
            case "inventory": {
                const party = typeof $gameParty !== "undefined" && $gameParty;
                const items = party && party.allItems ? party.allItems() : [];
                const includes = item => {
                    if (node.category === "all") return true;
                    if (typeof DataManager === "undefined") return false;
                    if (node.category === "weapon") return DataManager.isWeapon(item);
                    if (node.category === "armor") return DataManager.isArmor(item);
                    if (!DataManager.isItem(item)) return false;
                    return node.category === "keyItem" ? item.itypeId === 2 : item.itypeId === 1;
                };
                for (const item of items.filter(includes)) {
                    const count = party.numItems ? party.numItems(item) : 0;
                    const kind = typeof DataManager !== "undefined" && DataManager.isWeapon(item) ? "weapon"
                        : typeof DataManager !== "undefined" && DataManager.isArmor(item) ? "armor" : "item";
                    add({ key: kind + ":" + item.id, kind, id: item.id, value: item.id, name: item.name,
                        description: item.description || "", iconIndex: item.iconIndex || 0, count, price: item.price || 0, data: item,
                        defaultText: "\\I[" + (item.iconIndex || 0) + "]{name}  x{count}" });
                }
                break;
            }
            case "skills": {
                const actor = this.resolveActor(node, scene);
                const skills = actor && actor.skills ? actor.skills() : [];
                for (const skill of skills) {
                    if (node.skillTypeId > 0 && skill.stypeId !== node.skillTypeId) continue;
                    add({ key: "skill:" + skill.id, kind: "skill", id: skill.id, value: skill.id, actorId: actor.actorId ? actor.actorId() : 0,
                        name: skill.name, description: skill.description || "", iconIndex: skill.iconIndex || 0, price: skill.mpCost || 0,
                        enabled: !actor.canUse || actor.canUse(skill), data: skill, defaultText: "\\I[" + (skill.iconIndex || 0) + "]{name}" });
                }
                break;
            }
            case "actorParameters": {
                const actor = this.resolveActor(node, scene);
                if (!actor) break;
                for (let id = 0; id < this.ACTOR_PARAMS.length; id++) {
                    const name = typeof TextManager !== "undefined" && TextManager.param ? TextManager.param(id) : this.ACTOR_PARAMS[id].toUpperCase();
                    const value = actor.param ? actor.param(id) : actor[this.ACTOR_PARAMS[id]];
                    add({ key: "parameter:" + id, kind: "parameter", id, value, actorId: actor.actorId ? actor.actorId() : 0,
                        name, paramName: name, paramValue: value, data: actor, defaultText: "{paramName}: {paramValue}" });
                }
                break;
            }
            case "actorEquipment": {
                const actor = this.resolveActor(node, scene);
                const equips = actor && actor.equips ? actor.equips() : [];
                const slots = actor && actor.equipSlots ? actor.equipSlots() : [];
                for (let slot = 0; slot < equips.length; slot++) {
                    const item = equips[slot];
                    const slotName = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.equipTypes ? $dataSystem.equipTypes[slots[slot]] || "" : "";
                    add({ key: "equipment:" + slot, kind: "equipment", id: item ? item.id : 0, value: item ? item.id : 0,
                        actorId: actor.actorId ? actor.actorId() : 0, name: item ? item.name : slotName, description: item && item.description || "",
                        iconIndex: item && item.iconIndex || 0, price: item && item.price || 0, count: item ? 1 : 0,
                        enabled: !!item, data: item, paramName: slotName, defaultText: item ? "\\I[" + (item.iconIndex || 0) + "]{name}" : "{paramName}: -" });
                }
                break;
            }
            case "actorStates": {
                const actor = this.resolveActor(node, scene);
                const states = actor && actor.states ? actor.states() : [];
                for (const state of states) add({ key: "state:" + state.id, kind: "state", id: state.id, value: state.id,
                    actorId: actor.actorId ? actor.actorId() : 0, name: state.name, description: state.message3 || state.message1 || "",
                    iconIndex: state.iconIndex || 0, data: state, defaultText: "\\I[" + (state.iconIndex || 0) + "]{name}" });
                break;
            }
            case "options": {
                const terms = typeof TextManager !== "undefined" ? TextManager : {};
                const config = typeof ConfigManager !== "undefined" ? ConfigManager : {};
                const descriptors = [
                    ["alwaysDash", terms.alwaysDash || "Always Dash"],
                    ["commandRemember", terms.commandRemember || "Command Remember"]
                ];
                if (terms.touchUI != null && config.touchUI !== undefined) descriptors.push(["touchUI", terms.touchUI]);
                descriptors.push(
                    ["bgmVolume", terms.bgmVolume || "BGM Volume"], ["bgsVolume", terms.bgsVolume || "BGS Volume"],
                    ["meVolume", terms.meVolume || "ME Volume"], ["seVolume", terms.seVolume || "SE Volume"]
                );
                for (const [symbol, name] of descriptors) {
                    const volume = symbol.includes("Volume");
                    const value = volume ? Math.max(0, Math.min(100, Number(config[symbol]) || 0)) : !!config[symbol];
                    add({ key: "option:" + symbol, kind: "option", id: symbol, value, symbol, name,
                        valueText: volume ? value + "%" : value ? "ON" : "OFF", defaultText: "{name}  {valueText}" });
                }
                break;
            }
            case "saveSlots": {
                const first = node.includeAutosave ? 0 : 1;
                const max = typeof DataManager !== "undefined" && DataManager.maxSavefiles ? DataManager.maxSavefiles() : 20;
                for (let id = first; id < max; id++) {
                    const info = typeof DataManager !== "undefined" && DataManager.savefileInfo ? DataManager.savefileInfo(id) : null;
                    const name = id === 0 && typeof TextManager !== "undefined" ? TextManager.autosave
                        : (typeof TextManager !== "undefined" ? TextManager.file : "File") + " " + id;
                    const timestamp = info && Number(info.timestamp) || 0;
                    const existing = !!info;
                    const action = node.action && node.action.type;
                    const enabled = action === "saveSlot" ? id > 0 : action === "loadSlot" ? existing : true;
                    const partyCharacters = info && Array.isArray(info.characters) ? info.characters.map(entry => entry[0] + "[" + entry[1] + "]").join(", ") : "";
                    const partyFaces = info && Array.isArray(info.faces) ? info.faces.map(entry => entry[0] + "[" + entry[1] + "]").join(", ") : "";
                    add({ key: "save:" + id, kind: "save", id, value: id, name, title: info && info.title || "",
                        playtime: info && info.playtime || "", timestamp: timestamp || "", date: timestamp ? new Date(timestamp).toLocaleString() : "",
                        partyCharacters, partyFaces, existing, enabled, data: info,
                        defaultText: info && info.playtime ? "{name}  {playtime}" : "{name}" });
                }
                break;
            }
            case "variableRange": {
                const start = Math.min(node.rangeStart, node.rangeEnd);
                const end = Math.min(9999, Math.max(node.rangeStart, node.rangeEnd), start + 999);
                for (let id = start; id <= end; id++) {
                    const value = typeof $gameVariables !== "undefined" && $gameVariables ? $gameVariables.value(id) : 0;
                    const variableName = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.variables ? $dataSystem.variables[id] : "";
                    add({ key: "variable:" + id, kind: "variable", id, value, name: variableName || "Variable " + id,
                        defaultText: "{name}: {value}" });
                }
                break;
            }
            default:
                for (const item of node.items) add({ key: "literal:" + String(item.id), kind: "literal", id: item.id,
                    value: item.value, name: item.text, enabled: item.enabled, data: item, defaultText: "{name}" });
                break;
        }
        return rows;
    };

    /** Natural size of an auto-sized text node. */
    Window_ReactorUINode.prototype.measure = function() {
        this.applyFit();
        const size = this.textSizeEx(this.labelText());
        return { width: Math.ceil(size.width) + 4, height: Math.ceil(size.height) };
    };

    /**
     * "Fit text to size": finds the largest font scale (never above 1) at
     * which the label fits every authored dimension of the node, and leaves
     * it in `_uiFontScale` for resetFontSettings. Wrapping re-flows at each
     * candidate size, so a wrapped paragraph shrinks until its lines fit
     * the height, and an unwrapped line shrinks until it fits the width.
     */
    Window_ReactorUINode.prototype.applyFit = function() {
        this._uiFontScale = 1;
        const node = this._uiNode;
        if (!node.fitText || (!(node.width > 0) && !(node.height > 0))) return 1;
        const inset = this.padding * 2;
        const maxWidth = node.width - inset;
        const maxHeight = node.height - inset;
        const fits = () => {
            const size = this.textSizeEx(this.labelText());
            return (!(node.width > 0) || size.width <= maxWidth)
                && (!(node.height > 0) || size.height <= maxHeight);
        };
        if (fits()) return 1;
        const base = node.fontSize > 0 ? node.fontSize : $gameSystem.mainFontSize();
        let low = Math.min(1, ReactorUI.MIN_FONT_SIZE / base);
        let high = 1;
        for (let step = 0; step < 8; step++) {
            const middle = (low + high) / 2;
            this._uiFontScale = middle;
            if (fits()) low = middle;
            else high = middle;
        }
        this._uiFontScale = low;
        return low;
    };

    /** The node's text, word-wrapped to the node width when asked to. */
    Window_ReactorUINode.prototype.labelText = function() {
        const node = this._uiNode;
        const value = ReactorUI.resolveActorTokens(node.text, node, this._uiScene);
        if (!node.wrap || !(node.width > 0)) return value;
        return this.wrapText(value, node.width - this.padding * 2);
    };

    /**
     * Greedy word wrap measured through textSizeEx, so escape codes, icons,
     * and size changes count exactly as they draw. Authored line breaks
     * are kept.
     */
    Window_ReactorUINode.prototype.wrapText = function(text, width) {
        const lines = [];
        for (const paragraph of String(text).split("\n")) {
            const words = paragraph.split(" ");
            let line = "";
            for (const word of words) {
                const candidate = line ? line + " " + word : word;
                if (line && this.textSizeEx(candidate).width > width) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            }
            lines.push(line);
        }
        return lines.join("\n");
    };

    Window_ReactorUINode.prototype.requestBitmap = function() {
        const node = this._uiNode;
        let bitmap = null;
        switch (node.source) {
            case "picture": bitmap = node.file ? ImageManager.loadPicture(node.file) : null; break;
            case "system": bitmap = node.file ? ImageManager.loadSystem(node.file) : null; break;
            case "face": bitmap = node.file ? ImageManager.loadFace(node.file) : null; break;
            case "character": bitmap = node.file ? ImageManager.loadCharacter(node.file) : null; break;
            case "icon": bitmap = ImageManager.loadSystem("IconSet"); break;
            case "partyFace": {
                const member = ReactorUI.resolveActor(node, this._uiScene);
                bitmap = member ? ImageManager.loadFace(member.faceName()) : null;
                this._uiPartyFaceKey = member
                    ? [member.actorId ? member.actorId() : "", member.faceName(), member.faceIndex()].join("|") : "";
                break;
            }
            case "title1": bitmap = node.file ? ImageManager.loadTitle1(node.file) : null; break;
            case "title2": bitmap = node.file ? ImageManager.loadTitle2(node.file) : null; break;
        }
        this._uiBitmap = bitmap;
        if (bitmap && !bitmap.isReady()) bitmap.addLoadListener(() => this.refresh());
    };

    Window_ReactorUINode.prototype.refresh = function() {
        if (!this.contents) return;
        this.contents.clear();
        if (this.contentsBack) this.contentsBack.clear();
        switch (this._uiNode.type) {
            case "box": this.drawSurface(); break;
            case "image": this.drawImage(); break;
            case "text": this.drawLabel(); break;
            case "button": this.drawSurface(); this.drawLabel(); this.drawFocus(); break;
            case "gauge": this.drawGauge(); break;
        }
        this.syncVisualState();
        this._uiLastText = this.currentText();
    };

    /** A gauge node hosts the engine's own gauge sprite, sized to the node. */
    Window_ReactorUINode.prototype.drawGauge = function() {
        const node = this._uiNode;
        if (typeof Sprite_Gauge === "undefined") return;
        if (!this._uiGauge) {
            this._uiGauge = new (ReactorUI.gaugeSpriteClass())(node);
            this.addInnerChild(this._uiGauge);
        }
        const battler = node.gauge === "variable" ? null : ReactorUI.resolveActor(node, this._uiScene);
        this._uiGauge.setup(battler, node.gauge);
        this._uiGaugeBattler = battler;
    };

    /**
     * Sprite_Gauge at the node's size: the bar is the lower half, label and
     * value fonts scale with the height (24 px is the engine's own), and a
     * "variable" gauge reads a game variable against the node's max.
     */
    ReactorUI.gaugeSpriteClass = function() {
        if (this._GaugeSprite) return this._GaugeSprite;
        function Sprite_ReactorUIGauge() { this.initialize(...arguments); }
        const P = Sprite_ReactorUIGauge.prototype = Object.create(Sprite_Gauge.prototype);
        P.constructor = Sprite_ReactorUIGauge;
        P.initialize = function(node) {
            this._uiNode = node;
            Sprite_Gauge.prototype.initialize.call(this);
        };
        P.isVariable = function() { return this._uiNode.gauge === "variable"; };
        P.isExp = function() { return this._uiNode.gauge === "exp"; };
        P.isActorParam = function() { return ReactorUI.ACTOR_PARAMS.includes(this._uiNode.gauge); };
        P.bitmapWidth = function() { return Math.max(1, this._uiNode.width); };
        P.bitmapHeight = function() { return Math.max(1, this._uiNode.height); };
        P.textHeight = function() { return Math.max(1, this._uiNode.height); };
        P.gaugeHeight = function() { return this._uiNode.gaugeHeight > 0 ? this._uiNode.gaugeHeight : Math.max(4, Math.floor(this._uiNode.height / 2)); };
        P.labelFontSize = function() { return Math.max(ReactorUI.MIN_FONT_SIZE, Math.round(($gameSystem.mainFontSize() - 2) * this.textHeight() / 24)); };
        P.valueFontSize = function() { return Math.max(ReactorUI.MIN_FONT_SIZE, Math.round(($gameSystem.mainFontSize() - 6) * this.textHeight() / 24)); };
        P.gaugeX = function() { return this._uiNode.showLabel ? Sprite_Gauge.prototype.gaugeX.call(this) : 0; };
        P.label = function() {
            if (this._uiNode.label) return this._uiNode.label;
            if (this.isExp()) return typeof TextManager !== "undefined" ? TextManager.expA : "EXP";
            if (this.isActorParam()) {
                const id = ReactorUI.ACTOR_PARAMS.indexOf(this._uiNode.gauge);
                return typeof TextManager !== "undefined" && TextManager.param ? TextManager.param(id) : this._uiNode.gauge.toUpperCase();
            }
            return this.isVariable() ? "" : Sprite_Gauge.prototype.label.call(this);
        };
        P.measureLabelWidth = function() {
            if (!this.isVariable()) return Sprite_Gauge.prototype.measureLabelWidth.call(this);
            this.setupLabelFont();
            return Math.ceil(this.bitmap.measureTextWidth(this.label()));
        };
        P.isValid = function() {
            if (this.isVariable()) return true;
            if (this.isExp() || this.isActorParam()) return !!this._battler;
            if (this._statusType === "tp") return !!this._battler;
            return Sprite_Gauge.prototype.isValid.call(this);
        };
        P.currentValue = function() {
            if (this.isVariable()) return Number($gameVariables.value(this._uiNode.variableId)) || 0;
            if (this.isExp()) {
                if (!this._battler || (this._battler.isMaxLevel && this._battler.isMaxLevel())) return this._battler ? 1 : 0;
                return Math.max(0, this._battler.currentExp() - this._battler.currentLevelExp());
            }
            if (this.isActorParam()) return this._battler && this._battler.param ? this._battler.param(ReactorUI.ACTOR_PARAMS.indexOf(this._uiNode.gauge)) : 0;
            return Sprite_Gauge.prototype.currentValue.call(this);
        };
        P.currentMaxValue = function() {
            if (this.isVariable()) return this._uiNode.maxVariableId > 0 ? Math.max(1, Number($gameVariables.value(this._uiNode.maxVariableId)) || 0) : this._uiNode.max;
            if (this.isExp()) {
                if (!this._battler || (this._battler.isMaxLevel && this._battler.isMaxLevel())) return 1;
                return Math.max(1, this._battler.nextLevelExp() - this._battler.currentLevelExp());
            }
            if (this.isActorParam()) return this._uiNode.max;
            return Sprite_Gauge.prototype.currentMaxValue.call(this);
        };
        P.gaugeBackColor = function() { return this._uiNode.gaugeBackColor || Sprite_Gauge.prototype.gaugeBackColor.call(this); };
        P.gaugeColor1 = function() { return this._uiNode.gaugeColor1 || Sprite_Gauge.prototype.gaugeColor1.call(this); };
        P.gaugeColor2 = function() { return this._uiNode.gaugeColor2 || Sprite_Gauge.prototype.gaugeColor2.call(this); };
        P.drawLabel = function() { if (this._uiNode.showLabel) Sprite_Gauge.prototype.drawLabel.call(this); };
        P.drawValue = function() {
            const format = this._uiNode.valueFormat;
            if (format === "hidden") return;
            const value = this.currentValue();
            const max = this.currentMaxValue();
            const shown = format === "currentMax" ? value + "/" + max
                : format === "percent" ? Math.round((max > 0 ? value / max : 0) * 100) + "%" : String(value);
            this.setupValueFont();
            this.bitmap.drawText(shown, 0, 0, this.bitmapWidth(), this.textHeight(), "right");
        };
        this._GaugeSprite = Sprite_ReactorUIGauge;
        return Sprite_ReactorUIGauge;
    };

    Window_ReactorUINode.prototype.drawSurface = function() {
        const node = this._uiNode;
        const stateFill = ReactorUI.controlStyle(node, this.controlState()).fillColor;
        if (!stateFill && (node.fill === "window" || node.fill === "none")) {
            if (node.fill === "window" && node.borderWidth > 0) this.drawBorder(this.contents);
            return;
        }
        const bitmap = this.contentsBack || this.contents;
        const width = this.contentsWidth();
        const height = this.contentsHeight();
        const color1 = ReactorUI.cssColor(stateFill || node.color, node.fillOpacity);
        const color2 = ReactorUI.cssColor(stateFill || node.color2, node.fillOpacity);
        const context = bitmap.context;
        context.save();
        if (node.radius > 0) {
            roundedPath(context, 0, 0, width, height, node.radius);
            context.clip();
        }
        if (!stateFill && node.fill === "gradient") {
            const gradient = node.vertical
                ? context.createLinearGradient(0, 0, 0, height)
                : context.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, color1);
            gradient.addColorStop(1, color2);
            context.fillStyle = gradient;
        } else {
            context.fillStyle = color1;
        }
        context.fillRect(0, 0, width, height);
        context.restore();
        if (node.borderWidth > 0) this.drawBorder(bitmap);
        touch(bitmap);
    };

    Window_ReactorUINode.prototype.drawBorder = function(bitmap, color, width) {
        const node = this._uiNode;
        const lineWidth = width || node.borderWidth;
        const context = bitmap.context;
        const w = this.contentsWidth();
        const h = this.contentsHeight();
        context.save();
        context.strokeStyle = color || ReactorUI.cssColor(node.borderColor, 255);
        context.lineWidth = lineWidth;
        const inset = lineWidth / 2;
        if (node.radius > 0) {
            roundedPath(context, inset, inset, w - lineWidth, h - lineWidth, Math.max(0, node.radius - inset));
            context.stroke();
        } else {
            context.strokeRect(inset, inset, w - lineWidth, h - lineWidth);
        }
        context.restore();
        touch(bitmap);
    };

    Window_ReactorUINode.prototype.drawImage = function() {
        const node = this._uiNode;
        const bitmap = this._uiBitmap;
        if (!bitmap || !bitmap.isReady()) return;
        let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
        if (node.source === "face" || node.source === "partyFace") {
            const member = node.source === "partyFace" ? ReactorUI.resolveActor(node, this._uiScene) : null;
            const index = member ? member.faceIndex() : node.index;
            const pw = ImageManager.faceWidth, ph = ImageManager.faceHeight;
            sx = (index % 4) * pw;
            sy = Math.floor(index / 4) * ph;
            sw = pw;
            sh = ph;
        } else if (node.source === "character") {
            const big = ImageManager.isBigCharacter(node.file);
            const pw = bitmap.width / (big ? 3 : 12);
            const ph = bitmap.height / (big ? 4 : 8);
            const n = big ? 0 : node.index;
            sx = ((n % 4) * 3 + 1) * pw;
            sy = Math.floor(n / 4) * 4 * ph;
            sw = pw;
            sh = ph;
        } else if (node.source === "icon") {
            const pw = ImageManager.iconWidth, ph = ImageManager.iconHeight;
            sx = (node.index % 16) * pw;
            sy = Math.floor(node.index / 16) * ph;
            sw = pw;
            sh = ph;
        }
        const w = this.contentsWidth();
        const h = this.contentsHeight();
        if (node.nineSlice && (node.source === "picture" || node.source === "system")) {
            const insets = { left: node.sliceLeft, top: node.sliceTop, right: node.sliceRight, bottom: node.sliceBottom };
            for (const part of ReactorUI.nineSliceSegments(sw, sh, w, h, insets)) {
                this.contents.blt(bitmap, sx + part.sx, sy + part.sy, part.sw, part.sh, part.dx, part.dy, part.dw, part.dh);
            }
            return;
        }
        let dx = 0, dy = 0, dw = sw, dh = sh;
        if (node.fit === "stretch") {
            dw = w;
            dh = h;
        } else if (node.fit === "contain" && sw > 0 && sh > 0) {
            const scale = Math.min(w / sw, h / sh);
            dw = Math.round(sw * scale);
            dh = Math.round(sh * scale);
            dx = Math.floor((w - dw) / 2);
            dy = Math.floor((h - dh) / 2);
        }
        this.contents.blt(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
    };

    Window_ReactorUINode.prototype.drawLabel = function() {
        const node = this._uiNode;
        this.applyFit();
        const label = this.labelText();
        if (!label) return;
        const size = this.textSizeEx(label);
        const w = this.contentsWidth();
        const h = this.contentsHeight();
        let x = 0;
        if (node.align === "center") x = Math.max(0, Math.floor((w - size.width) / 2));
        else if (node.align === "right") x = Math.max(0, w - size.width);
        const y = node.type === "button" ? Math.max(0, Math.floor((h - size.height) / 2)) : 0;
        this.drawTextEx(label, x, y, w - x);
    };

    Window_ReactorUINode.prototype.drawFocus = function() {
        const node = this._uiNode;
        if (this.usesSkin()) {
            if (this._uiFocused) this.setCursorRect(0, 0, this.contentsWidth(), this.contentsHeight());
            else this.setCursorRect(0, 0, 0, 0);
            if (this._uiFocused && node.focusedBorderColor) {
                this.drawBorder(this.contents, ReactorUI.cssColor(node.focusedBorderColor, 255), Math.max(2, node.borderWidth));
            }
            return;
        }
        if (!this._uiFocused) return;
        const color = ReactorUI.controlStyle(node, "focused").borderColor;
        if (color) this.drawBorder(this.contents, ReactorUI.cssColor(color, 255), Math.max(2, node.borderWidth));
    };

    Window_ReactorUINode.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (this._uiNode.type === "text" || this._uiNode.type === "button") {
            if (this.currentText() !== this._uiLastText) {
                if (this._uiNode.type === "text" && (this._uiNode.width === 0 || this._uiNode.height === 0)
                    && this._uiScene && this._uiScene.refreshNodeLayouts) this._uiScene.refreshNodeLayouts();
                this.refresh();
            }
        }
        if (this._uiNode.type === "image" && this._uiNode.source === "partyFace") {
            const member = ReactorUI.resolveActor(this._uiNode, this._uiScene);
            const key = member ? [member.actorId ? member.actorId() : "", member.faceName(), member.faceIndex()].join("|") : "";
            if (key !== this._uiPartyFaceKey) {
                this.requestBitmap();
                this.refresh();
            }
        }
        if (this._uiNode.type === "gauge" && this._uiNode.gauge !== "variable" && this._uiGauge) {
            const battler = ReactorUI.resolveActor(this._uiNode, this._uiScene);
            if (battler !== this._uiGaugeBattler) {
                this._uiGauge.setup(battler, this._uiNode.gauge);
                this._uiGaugeBattler = battler;
            }
        }
    };

    Window_ReactorUINode.prototype.containsPoint = function(x, y) {
        if (!this.visible) return false;
        const local = this.worldTransform.applyInverse(new Point(x, y));
        return local.x >= 0 && local.y >= 0 && local.x < this.width && local.y < this.height;
    };

    //-------------------------------------------------------------------------
    // Window_ReactorUIList

    function Window_ReactorUIList() {
        this.initialize(...arguments);
    }

    window.Window_ReactorUIList = Window_ReactorUIList;
    Window_ReactorUIList.prototype = Object.create(Window_Selectable.prototype);
    Window_ReactorUIList.prototype.constructor = Window_ReactorUIList;

    Window_ReactorUIList.prototype.initialize = function(rect, scene, node) {
        this._uiScene = scene;
        this._uiNode = node;
        this._uiFocused = false;
        this._uiPressed = false;
        this._uiEnabled = true;
        this._uiRows = ReactorUI.listRows(node, scene);
        this._uiRowsSignature = ReactorUI.listRowsSignature(this._uiRows);
        this._uiRefreshWait = 0;
        Window_Selectable.prototype.initialize.call(this, rect);
        this.opacity = this.usesSkin() ? 255 : 0;
        this.frameVisible = this.usesSkin();
        this.setHandler("ok", () => this._uiScene.activateWindow(this));
        this.setHandler("cancel", () => this._uiScene.cancelInterface(true));
        if (this.maxItems() > 0) {
            const initial = this.initialIndex();
            this.select(initial);
            if (this.setTopRow) this.setTopRow(initial - 2);
        }
        else this.deselect();
        this.deactivate();
        this.refresh();
    };

    Window_ReactorUIList.prototype.node = function() { return this._uiNode; };
    Window_ReactorUIList.prototype.usesSkin = function() { return this._uiNode.fill === "window"; };
    Window_ReactorUIList.prototype.updatePadding = function() { this.padding = this.usesSkin() ? $gameSystem.windowPadding() : 0; };
    Window_ReactorUIList.prototype.updateBackOpacity = function() { this.backOpacity = this.usesSkin() ? $gameSystem.windowOpacity() : 0; };
    Window_ReactorUIList.prototype.isFocusable = function() { return true; };
    Window_ReactorUIList.prototype.isEnabled = function() { return this._uiEnabled; };
    Window_ReactorUIList.prototype.setEnabled = function(enabled) {
        if (this._uiEnabled === enabled) return;
        this._uiEnabled = enabled;
        this.refresh();
    };
    Window_ReactorUIList.prototype.setFocused = function(focused) {
        if (this._uiFocused === focused) return;
        this._uiFocused = focused;
        if (focused) {
            if (this.index() < 0 && this.maxItems() > 0) this.select(0);
            if (!this._uiScene.acceptsInput || this._uiScene.acceptsInput()) this.activate();
            else this.deactivate();
        } else {
            this.deactivate();
        }
        this.refresh();
        this.refreshCursor();
    };
    Window_ReactorUIList.prototype.setPressed = Window_ReactorUINode.prototype.setPressed;
    Window_ReactorUIList.prototype.controlState = Window_ReactorUINode.prototype.controlState;
    Window_ReactorUIList.prototype.syncVisualState = Window_ReactorUINode.prototype.syncVisualState;
    Window_ReactorUIList.prototype.resetFontSettings = function() {
        Window_Base.prototype.resetFontSettings.call(this);
        const node = this._uiNode;
        if (node.fontSize > 0) this.contents.fontSize = node.fontSize;
        if (node.fontFace) this.contents.fontFace = node.fontFace;
        this.contents.fontBold = node.fontBold;
        this.contents.fontItalic = node.fontItalic;
        this.contents.outlineWidth = node.outline ? node.outlineWidth : 0;
        if (node.outlineColor) this.contents.outlineColor = node.outlineColor;
        const context = this.contents.context;
        if (context) {
            if ("letterSpacing" in context) context.letterSpacing = node.letterSpacing + "px";
            if ("textLetterSpacing" in context) context.textLetterSpacing = node.letterSpacing + "px";
        }
        const override = ReactorUI.controlStyle(node, this.controlState()).textColor;
        this.changeTextColor(override || (isHexColor(node.textColor) ? node.textColor : ColorManager.textColor(node.textColor)));
    };
    Window_ReactorUIList.prototype.convertEscapeCharacters = Window_ReactorUINode.prototype.convertEscapeCharacters;
    Window_ReactorUIList.prototype.maxItems = function() { return this._uiRows.length; };
    Window_ReactorUIList.prototype.itemHeight = function() { return this._uiNode.rowHeight; };
    Window_ReactorUIList.prototype.rowSpacing = function() { return 0; };
    Window_ReactorUIList.prototype.colSpacing = function() { return 0; };
    Window_ReactorUIList.prototype.selectedRow = function() { return this._uiRows[this.index()] || null; };
    Window_ReactorUIList.prototype.initialIndex = function() {
        let id = null;
        if (this._uiNode.action.type === "saveSlot" && typeof $gameSystem !== "undefined" && $gameSystem) id = $gameSystem.savefileId();
        if (this._uiNode.action.type === "loadSlot" && typeof DataManager !== "undefined" && DataManager.latestSavefileId) id = DataManager.latestSavefileId();
        const index = id == null ? -1 : this._uiRows.findIndex(row => row.id === id);
        return index >= 0 ? index : 0;
    };
    Window_ReactorUIList.prototype.publishSelection = function() {
        if (this._uiScene && this._uiScene.setContext) this._uiScene.setContext(this._uiNode.contextName, this.selectedRow());
    };
    Window_ReactorUIList.prototype.select = function(index) {
        Window_Selectable.prototype.select.call(this, index);
        this.publishSelection();
    };
    Window_ReactorUIList.prototype.isCurrentItemEnabled = function() {
        const row = this.selectedRow();
        return this._uiEnabled && !!row && row.enabled !== false;
    };
    Window_ReactorUIList.prototype.itemPadding = function() { return 8; };
    Window_ReactorUIList.prototype.playOkSound = function() {
        const type = this._uiNode.action && this._uiNode.action.type;
        if (!this._uiNode.se && !["optionChange", "saveSlot", "loadSlot"].includes(type)) SoundManager.playOk();
    };
    Window_ReactorUIList.prototype.changeOption = function(forward, wrap) {
        const row = this.selectedRow();
        if (!row || row.kind !== "option") return false;
        const changed = ReactorUI.changeOption(row.symbol, forward, wrap);
        if (changed) {
            if (this._uiScene) this._uiScene._optionsChanged = true;
            const key = row.key;
            this._uiRows = ReactorUI.listRows(this._uiNode, this._uiScene);
            this._uiRowsSignature = ReactorUI.listRowsSignature(this._uiRows);
            this.select(Math.max(0, this._uiRows.findIndex(entry => entry.key === key)));
            this.refresh();
        }
        return changed;
    };
    Window_ReactorUIList.prototype.cursorRight = function() {
        if (this._uiNode.dataSource === "options") this.changeOption(true, false);
        else Window_Selectable.prototype.cursorRight.call(this);
    };
    Window_ReactorUIList.prototype.cursorLeft = function() {
        if (this._uiNode.dataSource === "options") this.changeOption(false, false);
        else Window_Selectable.prototype.cursorLeft.call(this);
    };
    Window_ReactorUIList.prototype.drawItemBackground = function(index) {
        if (this.usesSkin()) Window_Selectable.prototype.drawItemBackground.call(this, index);
        if (this._uiFocused && index === this.index()) {
            const rect = this.itemRect(index);
            const color = this._uiNode.focusedFillColor || this._uiNode.highlightColor;
            const alpha = this._uiNode.focusedFillColor ? 255 : 96;
            this.contentsBack.fillRect(rect.x, rect.y, rect.width, rect.height, ReactorUI.cssColor(color, alpha));
        }
    };
    Window_ReactorUIList.prototype.drawItem = function(index) {
        const row = this._uiRows[index];
        if (!row) return;
        const rect = this.itemLineRect(index);
        this.resetFontSettings();
        const node = this._uiNode;
        const rowState = !this._uiEnabled || row.enabled === false ? "disabled"
            : this._uiFocused && index === this.index() ? "focused" : "base";
        const override = ReactorUI.controlStyle(node, rowState).textColor;
        this.changeTextColor(override || (isHexColor(node.textColor) ? node.textColor : ColorManager.textColor(node.textColor)));
        this.changePaintOpacity(this._uiEnabled && row.enabled !== false);
        if (!this._uiEnabled || row.enabled === false) this.contents.paintOpacity = node.disabledOpacity === "" ? 255 : node.disabledOpacity;
        const size = this.textSizeEx(row.text);
        let x = rect.x;
        if (this._uiNode.align === "center") x += Math.max(0, Math.floor((rect.width - size.width) / 2));
        else if (this._uiNode.align === "right") x += Math.max(0, rect.width - size.width);
        this.drawTextEx(row.text, x, rect.y, rect.width);
        this.changePaintOpacity(true);
    };
    Window_ReactorUIList.prototype.drawBorder = Window_ReactorUINode.prototype.drawBorder;
    Window_ReactorUIList.prototype.drawSurface = Window_ReactorUINode.prototype.drawSurface;
    Window_ReactorUIList.prototype.paint = function() {
        if (!this.contents) return;
        this.contents.clear();
        this.contentsBack.clear();
        this.drawSurface();
        this.drawAllItems();
        if (this._uiFocused && this._uiNode.focusedBorderColor) {
            this.drawBorder(this.contents, ReactorUI.cssColor(this._uiNode.focusedBorderColor, 255), Math.max(2, this._uiNode.borderWidth));
        }
        this.syncVisualState();
    };
    Window_ReactorUIList.prototype.refreshCursor = function() {
        this.setCursorRect(0, 0, 0, 0);
    };
    Window_ReactorUIList.prototype.update = function() {
        Window_Selectable.prototype.update.call(this);
        if (++this._uiRefreshWait < 15) return;
        this._uiRefreshWait = 0;
        const rows = ReactorUI.listRows(this._uiNode, this._uiScene);
        const signature = ReactorUI.listRowsSignature(rows);
        const selected = this.selectedRow();
        if (signature === this._uiRowsSignature) {
            this._uiRows = rows;
            const index = selected ? rows.findIndex(row => row.key === selected.key) : -1;
            if (index !== this.index()) this.select(index);
            else this.publishSelection();
            return;
        }
        const top = this.topRow ? this.topRow() : 0;
        this._uiRows = rows;
        this._uiRowsSignature = signature;
        let index = selected ? rows.findIndex(row => row.key === selected.key) : -1;
        if (index < 0 && rows.length) index = Math.min(Math.max(this.index(), 0), rows.length - 1);
        this.select(index);
        if (this.setTopRow) this.setTopRow(Math.min(top, Math.max(0, rows.length - 1)));
        this.refresh();
    };
    Window_ReactorUIList.prototype.containsPoint = Window_ReactorUINode.prototype.containsPoint;

    function roundedPath(context, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(x + w - radius, y);
        context.arcTo(x + w, y, x + w, y + radius, radius);
        context.lineTo(x + w, y + h - radius);
        context.arcTo(x + w, y + h, x + w - radius, y + h, radius);
        context.lineTo(x + radius, y + h);
        context.arcTo(x, y + h, x, y + h - radius, radius);
        context.lineTo(x, y + radius);
        context.arcTo(x, y, x + radius, y, radius);
        context.closePath();
    }

    function touch(bitmap) {
        if (bitmap._baseTexture && bitmap._baseTexture.update) bitmap._baseTexture.update();
        else if (bitmap.baseTexture && bitmap.baseTexture.update) bitmap.baseTexture.update();
    }

    //-------------------------------------------------------------------------
    // Scene_ReactorUI

    function Scene_ReactorUI() {
        this.initialize(...arguments);
    }

    window.Scene_ReactorUI = Scene_ReactorUI;
    Scene_ReactorUI.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_ReactorUI.prototype.constructor = Scene_ReactorUI;

    Scene_ReactorUI.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._interfaceId = 0;
        this._interface = null;
        this._nodeWindows = [];
        this._focusIndex = -1;
        this._closing = false;
        this._transitionPhase = "idle";
        this._transitionFrame = 0;
        this._closeCallback = null;
        this._role = "";
        this._contexts = new Map();
        this._resumeState = null;
        this._filePending = false;
        this._loadSuccess = false;
        this._optionsChanged = false;
    };

    Scene_ReactorUI.prototype.prepare = function(interfaceId, role) {
        this._interfaceId = Number(interfaceId) || 0;
        this._role = role || "";
    };

    Scene_ReactorUI.prototype.interfaceId = function() {
        return this._interfaceId;
    };

    Scene_ReactorUI.prototype.context = function(name) {
        return this._contexts.get(String(name || "selection")) || null;
    };

    Scene_ReactorUI.prototype.setContext = function(name, value) {
        const key = String(name || "selection");
        if (value == null) this._contexts.delete(key);
        else this._contexts.set(key, value);
    };

    Scene_ReactorUI.prototype.resumeState = function() {
        const focused = this.focusedWindow();
        const lists = [];
        for (const window of this._nodeWindows) {
            if (window.node().type !== "list") continue;
            const row = window.selectedRow();
            lists.push({ nodeId: window.node().id, key: row && row.key, index: window.index(), topRow: window.topRow ? window.topRow() : 0 });
        }
        return {
            interfaceId: this._interfaceId, role: this._role, focusedNodeId: focused ? focused.node().id : 0,
            contexts: Array.from(this._contexts.entries()), lists
        };
    };

    Scene_ReactorUI.prototype.restoreResumeState = function(state) {
        for (const saved of state.lists || []) {
            const window = this._nodeWindows.find(candidate => candidate.node().id === saved.nodeId && candidate.node().type === "list");
            if (!window) continue;
            let index = saved.key ? window._uiRows.findIndex(row => row.key === saved.key) : -1;
            if (index < 0) index = Math.min(Math.max(Number(saved.index) || 0, 0), Math.max(0, window.maxItems() - 1));
            if (window.maxItems() > 0) window.select(index); else window.deselect();
            if (window.setTopRow) window.setTopRow(Math.min(Math.max(Number(saved.topRow) || 0, 0), Math.max(0, window.maxItems() - 1)));
        }
        const focus = this._nodeWindows.findIndex(window => window.node().id === state.focusedNodeId && this.canFocus(window));
        if (focus >= 0) this.setFocus(focus);
    };

    Scene_ReactorUI.prototype.rememberForPush = function() {
        ReactorUI._resumeStates.push(this.resumeState());
    };

    Scene_ReactorUI.prototype.create = function() {
        if (!this._interfaceId && ReactorUI._resumeStates.length) {
            this._resumeState = ReactorUI._resumeStates.pop();
            this._interfaceId = this._resumeState.interfaceId;
            this._role = this._resumeState.role || "";
            this._contexts = new Map(this._resumeState.contexts || []);
        }
        this._interface = ReactorUI.interface(this._interfaceId);
        if (this._interface && this._interface.openTransition !== "none") this._transitionPhase = "opening";
        Scene_MenuBase.prototype.create.call(this);
        if (this._interface) {
            this.createNodes();
            if (this._resumeState) this.restoreResumeState(this._resumeState);
            this.applyInterfaceTransition(this._transitionPhase === "opening" ? 0 : 1);
        }
    };

    Scene_ReactorUI.prototype.isReady = function() {
        return ReactorUI.isReady() && Scene_MenuBase.prototype.isReady.call(this);
    };

    Scene_ReactorUI.prototype.createBackground = function() {
        if (ReactorUI.isPreview()) {
            // The preview has no map behind it: a plain black screen shows
            // the interface exactly as authored, whatever its background.
            const black = new ScreenSprite();
            black.setBlack();
            black.opacity = 255;
            this.addChild(black);
            return;
        }
        const background = this._interface ? this._interface.background : "blur";
        if (background === "blur") {
            Scene_MenuBase.prototype.createBackground.call(this);
            return;
        }
        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
        this.addChild(this._backgroundSprite);
        if (background === "dim") {
            const dimmer = new ScreenSprite();
            dimmer.setBlack();
            dimmer.opacity = 128;
            this.addChild(dimmer);
        }
    };

    Scene_ReactorUI.prototype.createNodes = function() {
        const root = new Rectangle(0, 0, Graphics.width, Graphics.height);
        const rects = new Map();
        const byId = new Map();
        for (const node of this._interface.nodes) byId.set(node.id, node);
        // Parents resolve before children whatever the authoring order;
        // a cycle or a missing parent roots the node on the screen.
        const resolve = (node, trail) => {
            if (rects.has(node.id)) return rects.get(node.id);
            let parentRect = root;
            const parent = byId.get(node.parent);
            if (parent && parent !== node && !trail.has(node.id)) {
                trail.add(node.id);
                parentRect = resolve(parent, trail);
            }
            let measured = null;
            if (node.type === "text" && (node.width === 0 || node.height === 0)) {
                measured = this.measureText(node);
            }
            const rect = ReactorUI.resolveRect(node, parentRect, measured);
            rects.set(node.id, rect);
            return rect;
        };
        // A parent's opacity fades its whole subtree, the way a group would.
        const opacities = new Map();
        const opacityOf = (node, trail) => {
            if (opacities.has(node.id)) return opacities.get(node.id);
            const parent = byId.get(node.parent);
            let factor = node.opacity / 255;
            if (parent && parent !== node && !trail.has(node.id)) {
                trail.add(node.id);
                factor *= opacityOf(parent, trail) / 255;
            }
            const value = Math.round(factor * 255);
            opacities.set(node.id, value);
            return value;
        };
        for (const node of ReactorUI.orderNodes(this._interface.nodes)) {
            const rect = resolve(node, new Set());
            if (rect.width <= 0 || rect.height <= 0) continue;
            const WindowClass = node.type === "list" ? Window_ReactorUIList : Window_ReactorUINode;
            const window = new WindowClass(ReactorUI.windowRect(rect, this), this, node);
            window._uiPhysicalRect = rect;
            window._uiLayoutX = window.x;
            window._uiLayoutY = window.y;
            const opacity = opacityOf(node, new Set());
            window.opacity = Math.min(window.opacity, opacity);
            window.contentsOpacity = opacity;
            window._uiOpacity = opacity;
            window.syncVisualState();
            this._nodeWindows.push(window);
            this.addWindow(window);
        }
        this.updateConditions();
        this.focusInitial();
    };

    /** Re-measures auto-sized text and repositions it and anchored descendants. */
    Scene_ReactorUI.prototype.refreshNodeLayouts = function() {
        if (!this._interface) return;
        const root = new Rectangle(0, 0, Graphics.width, Graphics.height);
        const rects = new Map();
        const byId = new Map(this._interface.nodes.map(node => [node.id, node]));
        const resolve = (node, trail) => {
            if (rects.has(node.id)) return rects.get(node.id);
            let parentRect = root;
            const parent = byId.get(node.parent);
            if (parent && parent !== node && !trail.has(node.id)) {
                trail.add(node.id);
                parentRect = resolve(parent, trail);
            }
            const measured = node.type === "text" && (node.width === 0 || node.height === 0) ? this.measureText(node) : null;
            const rect = ReactorUI.resolveRect(node, parentRect, measured);
            rects.set(node.id, rect);
            return rect;
        };
        for (const window of this._nodeWindows) {
            const rect = resolve(window.node(), new Set());
            const local = ReactorUI.windowRect(rect, this);
            const resized = window.width !== local.width || window.height !== local.height;
            if (window.x !== local.x || window.y !== local.y || resized) window.move(local.x, local.y, local.width, local.height);
            if (resized && window.createContents) window.createContents();
            window._uiPhysicalRect = rect;
            window._uiLayoutX = local.x;
            window._uiLayoutY = local.y;
            if (resized) window.refresh();
            else window.syncVisualState();
        }
    };

    Scene_ReactorUI.prototype.measureText = function(node) {
        if (!this._measureWindow) {
            this._measureWindow = new Window_ReactorUINode(new Rectangle(0, 0, 8, 8), this, node);
            this._measureWindow.visible = false;
        }
        this._measureWindow._uiNode = node;
        return this._measureWindow.measure();
    };

    Scene_ReactorUI.prototype.start = function() {
        Scene_MenuBase.prototype.start.call(this);
        if (!this._interface) {
            console.warn("ReactorUI: user interface " + this._interfaceId + " does not exist");
            if (this._role) ReactorUI.gotoStockRole(this._role);
            else this.popScene();
            return;
        }
        if (this._role === "title") {
            if (SceneManager.clearStack) SceneManager.clearStack();
            if (typeof AudioManager !== "undefined" && typeof $dataSystem !== "undefined" && $dataSystem) {
                AudioManager.playBgm($dataSystem.titleBgm);
                AudioManager.stopBgs();
                AudioManager.stopMe();
            }
            if (this.startFadeIn) this.startFadeIn(this.fadeSpeed(), false);
        }
    };

    Scene_ReactorUI.prototype.terminate = function() {
        Scene_MenuBase.prototype.terminate.call(this);
        if ((this._role === "options" || this._optionsChanged) && typeof ConfigManager !== "undefined" && ConfigManager.save) ConfigManager.save();
        if (this._loadSuccess && typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem.onAfterLoad) $gameSystem.onAfterLoad();
        if (this._role === "title" && SceneManager.snapForBackground) SceneManager.snapForBackground();
    };

    Scene_ReactorUI.prototype.needsCancelButton = function() {
        return this._role !== "title";
    };

    Scene_ReactorUI.prototype.needsPageButtons = function() {
        return this._role === "status";
    };

    Scene_ReactorUI.prototype.onActorChange = function() {
        Scene_MenuBase.prototype.onActorChange.call(this);
        for (const window of this._nodeWindows) {
            if (window.node().type === "list") window._uiRefreshWait = 14;
            else window.refresh();
        }
    };

    Scene_ReactorUI.prototype.buttons = function() {
        return this._nodeWindows.filter(window => window.isFocusable());
    };

    Scene_ReactorUI.prototype.focusedWindow = function() {
        return this._focusIndex >= 0 ? this._nodeWindows[this._focusIndex] : null;
    };

    Scene_ReactorUI.prototype.canFocus = function(window) {
        return window && window.isFocusable() && window.visible;
    };

    Scene_ReactorUI.prototype.acceptsInput = function() {
        return !this._closing && this._transitionPhase === "idle" && this.isActive();
    };

    Scene_ReactorUI.prototype.focusInitial = function() {
        const first = this._interface.firstFocus;
        let index = this._nodeWindows.findIndex(window => window.node().id === first && this.canFocus(window));
        if (index < 0) index = this._nodeWindows.findIndex(window => this.canFocus(window));
        this.setFocus(index);
    };

    Scene_ReactorUI.prototype.setFocus = function(index) {
        if (index === this._focusIndex) return;
        const previous = this.focusedWindow();
        if (previous) previous.setFocused(false);
        this._focusIndex = index;
        const next = this.focusedWindow();
        if (next) next.setFocused(true);
    };

    Scene_ReactorUI.prototype.applyInterfaceTransition = function(progress) {
        if (!this._interface) return;
        const opening = this._transitionPhase === "opening";
        const type = opening ? this._interface.openTransition : this._interface.closeTransition;
        const alpha = type === "fade" ? (opening ? progress : 1 - progress) : 1;
        const x = type === "slideLeft" ? Math.round(Graphics.width * (opening ? 1 - progress : -progress)) : 0;
        for (const window of this._nodeWindows) {
            window._uiTransitionAlpha = alpha;
            window._uiTransitionX = x;
            window._uiTransitionY = 0;
            window.syncVisualState();
        }
    };

    Scene_ReactorUI.prototype.updateInterfaceTransition = function() {
        if (this._transitionPhase === "idle") return;
        const duration = this._interface ? this._interface.transitionDuration : 1;
        this._transitionFrame = Math.min(duration, this._transitionFrame + 1);
        this.applyInterfaceTransition(this._transitionFrame / duration);
        if (this._transitionFrame < duration) return;
        if (this._transitionPhase === "opening") {
            this._transitionPhase = "idle";
            const focused = this.focusedWindow();
            if (focused && focused.node().type === "list") focused.activate();
            return;
        }
        this._transitionPhase = "idle";
        const callback = this._closeCallback;
        this._closeCallback = null;
        if (callback) callback();
    };

    Scene_ReactorUI.prototype.beginCloseTransition = function(callback) {
        if (this._closing) return false;
        this._closing = true;
        this._closeCallback = callback;
        const focused = this.focusedWindow();
        if (focused) focused.setPressed(false);
        if (focused && focused.node().type === "list") focused.deactivate();
        if (!this._interface || !this._interface.closeTransition || this._interface.closeTransition === "none") {
            const next = this._closeCallback;
            this._closeCallback = null;
            if (next) next();
            return true;
        }
        this._transitionPhase = "closing";
        this._transitionFrame = 0;
        this.applyInterfaceTransition(0);
        return true;
    };

    Scene_ReactorUI.prototype.updateConditions = function() {
        const authored = new Map(this._interface.nodes.map(node => [node.id, node]));
        const shown = (node, trail) => {
            if (!node || trail.has(node.id) || !ReactorUI.evaluateCondition(node.visible, this)) return false;
            const parent = authored.get(node.parent);
            if (!parent || parent === node) return true;
            trail.add(node.id);
            return shown(parent, trail);
        };
        for (const window of this._nodeWindows) {
            const node = window.node();
            window.visible = shown(node, new Set());
            if (node.type === "button" || node.type === "list") window.setEnabled(ReactorUI.evaluateCondition(node.enabled, this));
        }
        const focused = this.focusedWindow();
        if (focused && !this.canFocus(focused)) {
            this.setFocus(this._nodeWindows.findIndex(window => this.canFocus(window)));
        }
    };

    Scene_ReactorUI.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        if (!this._interface) return;
        this.updateInterfaceTransition();
        if (!this.acceptsInput()) return;
        this.updateConditions();
        this.updateTouch();
        this.updateControlStates();
        this.updateInput();
    };

    Scene_ReactorUI.prototype.updateControlStates = function() {
        const focused = this.focusedWindow();
        const keyPressed = typeof Input !== "undefined" && Input.isPressed && Input.isPressed("ok");
        const pointerPressed = typeof TouchInput !== "undefined" && TouchInput.isPressed && TouchInput.isPressed();
        for (const window of this._nodeWindows) {
            const underPointer = pointerPressed && window === focused && window.containsPoint(TouchInput.x, TouchInput.y);
            window.setPressed(window === focused && (keyPressed || underPointer));
        }
    };

    Scene_ReactorUI.prototype.updateTouch = function() {
        if (!TouchInput.isHovered() && !TouchInput.isTriggered()) return;
        // Topmost hit wins, so a button over a box is the one that reacts.
        for (let i = this._nodeWindows.length - 1; i >= 0; i--) {
            const window = this._nodeWindows[i];
            if (!this.canFocus(window) || !window.containsPoint(TouchInput.x, TouchInput.y)) continue;
            this.setFocus(i);
            if (TouchInput.isTriggered()) window.setPressed(true);
            // Window_Selectable handles List hover, touch selection, and the
            // engine's select-then-confirm gesture after it receives focus.
            if (window.node().type !== "list" && TouchInput.isTriggered()) this.activateFocused();
            return;
        }
    };

    Scene_ReactorUI.prototype.cancelInterface = function(alreadyPlayed) {
        if (!alreadyPlayed) SoundManager.playCancel();
        const cancel = this._interface.cancel;
        const stuck = cancel.type === "none" && !this._nodeWindows.some(window => this.canFocus(window) && window.isEnabled());
        this.runAction(stuck ? { type: "close" } : cancel);
    };

    Scene_ReactorUI.prototype.updateInput = function() {
        const focused = this.focusedWindow();
        const listOwnsInput = focused && focused.node().type === "list";
        if (this._role === "status" && Input.isTriggered("pageup")) {
            this.previousActor();
        } else if (this._role === "status" && Input.isTriggered("pagedown")) {
            this.nextActor();
        } else if (Input.isTriggered("ok") && !listOwnsInput) {
            this.activateFocused();
        } else if ((Input.isTriggered("cancel") || TouchInput.isCancelled()) && !listOwnsInput) {
            this.cancelInterface();
        } else {
            for (const direction of ["down", "up", "left", "right"]) {
                if (Input.isRepeated(direction)) {
                    if (focused && focused.node().type === "list" && ((direction === "down" || direction === "up")
                        || focused.node().dataSource === "options")) break;
                    this.moveFocus(direction);
                    break;
                }
            }
        }
    };

    /** Nearest focusable button in a direction; wraps to the far side. */
    Scene_ReactorUI.prototype.moveFocus = function(direction) {
        const current = this.focusedWindow();
        const candidates = this._nodeWindows.map((window, index) => ({ window, index }))
            .filter(entry => this.canFocus(entry.window) && entry.window !== current);
        if (!candidates.length) return;
        if (!current) {
            this.setFocus(candidates[0].index);
            SoundManager.playCursor();
            return;
        }
        const explicitId = Number(current.node()["focus" + direction[0].toUpperCase() + direction.slice(1)]) || 0;
        if (explicitId > 0) {
            const explicit = this._nodeWindows.findIndex(window => window !== current && window.node().id === explicitId && this.canFocus(window));
            if (explicit >= 0) {
                this.setFocus(explicit);
                SoundManager.playCursor();
                return;
            }
        }
        const center = window => ({ x: window.x + window.width / 2, y: window.y + window.height / 2 });
        const from = center(current);
        const axis = direction === "left" || direction === "right" ? "x" : "y";
        const sign = direction === "right" || direction === "down" ? 1 : -1;
        const score = entry => {
            const to = center(entry.window);
            const forward = (to[axis] - from[axis]) * sign;
            const sideways = Math.abs(axis === "x" ? to.y - from.y : to.x - from.x);
            return { forward, sideways, distance: forward + sideways * 2 };
        };
        let best = null;
        for (const entry of candidates) {
            const s = score(entry);
            if (s.forward <= 0) continue;
            if (!best || s.distance < best.distance) best = { entry, distance: s.distance };
        }
        if (!best) {
            // Wrap: the candidate farthest behind on the axis.
            for (const entry of candidates) {
                const s = score(entry);
                const behind = -s.forward - s.sideways * 2;
                if (s.forward < 0 && (!best || behind > best.distance)) best = { entry, distance: behind };
            }
        }
        if (!best) return;
        this.setFocus(best.entry.index);
        SoundManager.playCursor();
    };

    Scene_ReactorUI.prototype.activateFocused = function() {
        const window = this.focusedWindow();
        if (!window || !this.canFocus(window)) return;
        if (!window.isEnabled()) {
            SoundManager.playBuzzer();
            return;
        }
        this.activateWindow(window);
    };

    Scene_ReactorUI.prototype.activateWindow = function(window) {
        if (!window || !this.canFocus(window) || this._filePending) return;
        const node = window.node();
        if (!window.isEnabled() || (node.type === "list" && !window.isCurrentItemEnabled())) {
            SoundManager.playBuzzer();
            if (node.type === "list") window.activate();
            return;
        }
        if (node.type === "list") {
            const row = window.selectedRow();
            if (!row) return;
            if (node.selectionVariableId > 0) {
                $gameVariables.setValue(node.selectionVariableId, row[node.selectionValue]);
            }
            if (node.action.type === "optionChange") {
                this._optionsChanged = window.changeOption(true, true) || this._optionsChanged;
                return;
            }
            if (node.action.type === "saveSlot" || node.action.type === "loadSlot") {
                this.executeFileAction(node.action.type, row, window);
                return;
            }
        }
        if (node.se) AudioManager.playSe(node.se);
        else if (node.type !== "list") SoundManager.playOk();
        this.runAction(node.action);
    };

    Scene_ReactorUI.prototype.closeAll = function() {
        this.beginCloseTransition(() => {
            const stack = SceneManager._stack;
            while (stack.length > 0 && stack[stack.length - 1] === Scene_ReactorUI) {
                stack.pop();
                ReactorUI._resumeStates.pop();
            }
            this.performClose();
        });
    };

    /** Leaves for another scene that will come back here when it pops. */
    Scene_ReactorUI.prototype.pushScene = function(sceneClass) {
        this.beginCloseTransition(() => {
            this.rememberForPush();
            SceneManager.push(sceneClass);
        });
    };

    /** True when this interface is the preview's root: nothing sits under it. */
    Scene_ReactorUI.prototype.isPreviewRoot = function() {
        return ReactorUI.isPreview() && SceneManager._stack.length === 0;
    };

    Scene_ReactorUI.prototype.performClose = function() {
        if (this.isPreviewRoot()) {
            ReactorUI.endPreview();
            return;
        }
        if (this._role === "title" && SceneManager._stack.length === 0) {
            ReactorUI._resumeStates.length = 0;
            ReactorUI.gotoStockTitle();
            return;
        }
        this.popScene();
    };

    Scene_ReactorUI.prototype.close = function() {
        // Legacy/un-normalized test and plugin records had no transition key;
        // their synchronous close behavior remains repeatable after a pop.
        if (this._closing && this._interface && this._interface.closeTransition === undefined) {
            this.performClose();
            return;
        }
        this.beginCloseTransition(() => this.performClose());
    };

    Scene_ReactorUI.prototype.runAction = function(action) {
        if (!action) return;
        switch (action.type) {
            case "close":
                this.close();
                break;
            case "closeAll":
                this.closeAll();
                break;
            case "callInterface":
                this.beginCloseTransition(() => {
                    this.rememberForPush();
                    if (!ReactorUI.call(action.id)) {
                        ReactorUI._resumeStates.pop();
                        SoundManager.playBuzzer();
                    }
                });
                break;
            case "commonEvent":
                if ($dataCommonEvents && $dataCommonEvents[action.id]) {
                    $gameTemp.reserveCommonEvent(action.id);
                    this.closeAll();
                } else {
                    SoundManager.playBuzzer();
                }
                break;
            case "scene": {
                const name = ReactorUI.SCENES[action.scene];
                const sceneClass = name ? window[name] : null;
                if (typeof sceneClass === "function") {
                    if (action.scene === "menu") Window_MenuCommand.initCommandPosition();
                    if (action.scene === "title") {
                        this._closing = true;
                        ReactorUI._resumeStates.length = 0;
                        if (ReactorUI.isPreview()) ReactorUI.endPreview();
                        else SceneManager.goto(sceneClass);
                    } else {
                        this.pushScene(sceneClass);
                    }
                } else {
                    SoundManager.playBuzzer();
                }
                break;
            }
            case "setMenuActor": {
                const actor = ReactorUI.actorFromContext(this, action.contextName);
                if (actor && $gameParty.setMenuActor) $gameParty.setMenuActor(actor);
                else SoundManager.playBuzzer();
                break;
            }
            case "personalSkill":
            case "personalEquip":
            case "personalStatus": {
                const actor = ReactorUI.actorFromContext(this, action.contextName);
                const classes = { personalSkill: "Scene_Skill", personalEquip: "Scene_Equip", personalStatus: "Scene_Status" };
                const sceneClass = window[classes[action.type]];
                if (actor && typeof sceneClass === "function" && $gameParty.setMenuActor) {
                    $gameParty.setMenuActor(actor);
                    this.pushScene(sceneClass);
                } else SoundManager.playBuzzer();
                break;
            }
            case "previousMenuActor":
                if (this.previousActor) this.previousActor();
                break;
            case "nextMenuActor":
                if (this.nextActor) this.nextActor();
                break;
            case "titleNewGame":
                this._closing = true;
                ReactorUI._resumeStates.length = 0;
                if (ReactorUI.isPreview()) ReactorUI.endPreview();
                else {
                    DataManager.setupNewGame();
                    if (this.fadeOutAll) this.fadeOutAll();
                    SceneManager.goto(Scene_Map);
                }
                break;
            case "titleContinue":
                if (typeof Scene_Load === "function") this.pushScene(Scene_Load);
                else SoundManager.playBuzzer();
                break;
            case "titleOptions":
                if (typeof Scene_Options === "function") this.pushScene(Scene_Options);
                else SoundManager.playBuzzer();
                break;
            case "gameEndToTitle":
                this._closing = true;
                ReactorUI._resumeStates.length = 0;
                if (this.fadeOutAll) this.fadeOutAll();
                if (ReactorUI.isPreview()) ReactorUI.endPreview();
                else SceneManager.goto(Scene_Title);
                if (typeof Window_TitleCommand !== "undefined" && Window_TitleCommand.initCommandPosition) Window_TitleCommand.initCommandPosition();
                break;
            case "pluginCommand": {
                const interpreter = $gameMap && $gameMap._interpreter ? $gameMap._interpreter : new Game_Interpreter();
                PluginManager.callCommand(interpreter, action.plugin, action.command, action.args);
                if (action.andClose) this.close();
                break;
            }
            case "switch":
                $gameSwitches.setValue(action.id, action.on);
                if (action.andClose) this.close();
                break;
            case "variable": {
                const current = Number($gameVariables.value(action.id)) || 0;
                const value = action.op === "add" ? current + action.value
                    : action.op === "sub" ? current - action.value : action.value;
                $gameVariables.setValue(action.id, value);
                if (action.andClose) this.close();
                break;
            }
            case "script":
                try {
                    (new Function("scene", action.script)).call(this, this);
                } catch (error) {
                    console.error("ReactorUI: action script failed", error);
                }
                if (action.andClose && !this._closing) this.close();
                break;
            default:
                break;
        }
        const focused = this.focusedWindow();
        if (!this._closing && focused && focused.node().type === "list") focused.activate();
    };

    ReactorUI.changeOption = function(symbol, forward, wrap) {
        if (typeof ConfigManager === "undefined" || !symbol) return false;
        const volume = symbol.includes("Volume");
        const previous = ConfigManager[symbol];
        let value;
        if (volume) {
            const offset = 20;
            value = (Number(previous) || 0) + (forward ? offset : -offset);
            if (value > 100 && wrap) value = 0;
            else value = Math.max(0, Math.min(100, value));
        } else {
            value = forward;
            if (wrap) value = !previous;
        }
        if (previous === value) return false;
        ConfigManager[symbol] = value;
        if (typeof SoundManager !== "undefined" && SoundManager.playCursor) SoundManager.playCursor();
        return true;
    };

    Scene_ReactorUI.prototype.executeFileAction = function(type, row, window) {
        if (this._filePending || !row || row.enabled === false) return;
        const id = Number(row.id);
        this._filePending = true;
        window.deactivate();
        let operation;
        try {
            if (type === "saveSlot") {
                $gameSystem.setSavefileId(id);
                $gameSystem.onBeforeSave();
                operation = DataManager.saveGame(id);
            } else {
                operation = DataManager.loadGame(id);
            }
        } catch (error) {
            this.onFileFailure(type, window, error);
            return;
        }
        Promise.resolve(operation).then(() => {
            if (type === "saveSlot") {
                SoundManager.playSave();
                this.beginCloseTransition(() => this.popScene());
            } else {
                SoundManager.playLoad();
                this.fadeOutAll();
                this.reloadMapIfUpdated();
                ReactorUI._resumeStates.length = 0;
                SceneManager.goto(Scene_Map);
                this._loadSuccess = true;
            }
        }).catch(error => this.onFileFailure(type, window, error));
    };

    Scene_ReactorUI.prototype.onFileFailure = function(type, window, error) {
        this._filePending = false;
        if (error) console.error("ReactorUI: " + (type === "saveSlot" ? "save" : "load") + " failed", error);
        SoundManager.playBuzzer();
        if (window && window.activate) window.activate();
    };

    Scene_ReactorUI.prototype.reloadMapIfUpdated = function() {
        if ($gameSystem.versionId() === $dataSystem.versionId) return;
        $gamePlayer.reserveTransfer($gameMap.mapId(), $gamePlayer.x, $gamePlayer.y, $gamePlayer.direction(), 0);
        $gamePlayer.requestMapReload();
    };

    //-------------------------------------------------------------------------
    // Map overlays and stock-scene bindings

    ReactorUI.createOverlay = function(scene, record) {
        const overlay = {
            _mapScene: scene,
            _interfaceId: record.id,
            _interface: record,
            _nodeWindows: [],
            _focusIndex: -1,
            _contexts: new Map(),
            _visibilityAlpha: ReactorUI.evaluateCondition(record.visible, scene) ? 1 : 0,
            addWindow(window) { scene.addWindow(window); },
            measureText: Scene_ReactorUI.prototype.measureText,
            refreshNodeLayouts: Scene_ReactorUI.prototype.refreshNodeLayouts,
            updateConditions: Scene_ReactorUI.prototype.updateConditions,
            context: Scene_ReactorUI.prototype.context,
            setContext: Scene_ReactorUI.prototype.setContext,
            focusedWindow() { return null; },
            canFocus() { return false; },
            setFocus() {},
            focusInitial() {},
            activateWindow() {},
            cancelInterface() {}
        };
        Scene_ReactorUI.prototype.createNodes.call(overlay);
        overlay.update = function() {
            const shown = ReactorUI.evaluateCondition(this._interface.visible, scene);
            const transition = shown ? this._interface.openTransition : this._interface.closeTransition;
            const step = transition === "fade" ? 1 / this._interface.transitionDuration : 1;
            this._visibilityAlpha = shown ? Math.min(1, this._visibilityAlpha + step) : Math.max(0, this._visibilityAlpha - step);
            this.updateConditions();
            for (const window of this._nodeWindows) {
                window._uiTransitionAlpha = this._visibilityAlpha;
                window._uiTransitionX = 0;
                window._uiTransitionY = 0;
                window.syncVisualState();
                if (this._visibilityAlpha <= 0) window.visible = false;
            }
        };
        overlay.update();
        return overlay;
    };

    Scene_Map.prototype.ensureReactorUIOverlay = function(record) {
        if (!record || record.mode !== "overlay") return null;
        if (!this._reactorUIOverlays) this._reactorUIOverlays = new Map();
        if (!this._reactorUIOverlays.has(record.id)) {
            this._reactorUIOverlays.set(record.id, ReactorUI.createOverlay(this, record));
        }
        return this._reactorUIOverlays.get(record.id);
    };

    Scene_Map.prototype.createReactorUIOverlays = function() {
        const records = Array.isArray(window.$dataUserInterfaces) ? window.$dataUserInterfaces : [];
        for (const raw of records) {
            if (!raw) continue;
            const record = ReactorUI.normalizeInterface(raw);
            if (record.mode === "overlay") this.ensureReactorUIOverlay(record);
        }
    };

    const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    if (typeof _Scene_Map_createDisplayObjects === "function") {
        Scene_Map.prototype.createDisplayObjects = function() {
            _Scene_Map_createDisplayObjects.apply(this, arguments);
            this.createReactorUIOverlays();
        };
    }

    const _Scene_Map_update = Scene_Map.prototype.update;
    if (typeof _Scene_Map_update === "function") {
        Scene_Map.prototype.update = function() {
            _Scene_Map_update.apply(this, arguments);
            if (this._reactorUIOverlays) for (const overlay of this._reactorUIOverlays.values()) overlay.update();
        };
    }

    ReactorUI.REPLACEMENTS = {
        title: { field: "reactorTitleInterfaceId", scene: "Scene_Title" },
        menu: { field: "reactorMenuInterfaceId", scene: "Scene_Menu" },
        status: { field: "reactorStatusInterfaceId", scene: "Scene_Status" },
        gameEnd: { field: "reactorGameEndInterfaceId", scene: "Scene_GameEnd" },
        options: { field: "reactorOptionsInterfaceId", scene: "Scene_Options" },
        save: { field: "reactorSaveInterfaceId", scene: "Scene_Save" },
        load: { field: "reactorLoadInterfaceId", scene: "Scene_Load" }
    };

    ReactorUI.replacementRole = function(sceneClass) {
        for (const role of Object.keys(this.REPLACEMENTS)) {
            const stock = window[this.REPLACEMENTS[role].scene];
            if (typeof stock === "function" && sceneClass === stock) return role;
        }
        return "";
    };

    ReactorUI.replacementId = function(role) {
        const replacement = this.REPLACEMENTS[role];
        if (!replacement || typeof $dataSystem === "undefined" || !$dataSystem) return 0;
        const id = Math.max(0, Math.floor(Number($dataSystem[replacement.field]) || 0));
        if (!(id > 0)) return 0;
        const list = window.$dataUserInterfaces;
        const raw = Array.isArray(list) ? list[id] : null;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
        const record = this.normalizeInterface(raw);
        return record.id === id && record.mode === "scene" && (record.roles || []).includes(role) ? id : 0;
    };

    ReactorUI._bypassReplacements = new Set();
    ReactorUI._routingDepth = 0;

    ReactorUI.gotoStockRole = function(role) {
        const replacement = this.REPLACEMENTS[role];
        const sceneClass = replacement && window[replacement.scene];
        if (typeof sceneClass !== "function" || !SceneManager.goto) return;
        if (role === "title") this._resumeStates.length = 0;
        this.installSceneRouting();
        this._bypassReplacements.add(role);
        try { SceneManager.goto(sceneClass); } finally { this._bypassReplacements.delete(role); }
    };

    ReactorUI.gotoStockTitle = function() {
        this.gotoStockRole("title");
    };

    ReactorUI.sceneRouter = function(method, base) {
        const router = function(sceneClass) {
            if (ReactorUI._routingDepth > 0) return base.apply(this, arguments);
            const role = ReactorUI.replacementRole(sceneClass);
            const id = role && !ReactorUI._bypassReplacements.has(role) ? ReactorUI.replacementId(role) : 0;
            if (!id) return base.apply(this, arguments);
            ReactorUI._routingDepth++;
            try {
                const result = base.call(this, Scene_ReactorUI);
                this.prepareNextScene(id, role);
                return result;
            } finally {
                ReactorUI._routingDepth--;
            }
        };
        router._reactorUIRouter = method;
        router._reactorUIBase = base;
        return router;
    };

    /** Wraps the latest plugin-provided methods; safe to verify repeatedly. */
    ReactorUI.installSceneRouting = function() {
        for (const method of ["goto", "push"]) {
            const current = SceneManager[method];
            if (typeof current !== "function" || current._reactorUIRouter === method) continue;
            SceneManager[method] = this.sceneRouter(method, current);
        }
    };

    ReactorUI.sceneRoutingInstalled = function() {
        return ["goto", "push"].every(method => SceneManager[method] && SceneManager[method]._reactorUIRouter === method);
    };

    // Install against the engine now, then verify again from Scene_Boot after
    // project plugins have had their chance to replace goto/push.
    ReactorUI.installSceneRouting();

    //-------------------------------------------------------------------------
    // Boot hooks

    const _Scene_Boot_create = Scene_Boot.prototype.create;
    Scene_Boot.prototype.create = function() {
        ReactorUI.installSceneRouting();
        _Scene_Boot_create.apply(this, arguments);
        ReactorUI.load();
    };

    const _Scene_Boot_isReady = Scene_Boot.prototype.isReady;
    Scene_Boot.prototype.isReady = function() {
        ReactorUI.installSceneRouting();
        return _Scene_Boot_isReady.apply(this, arguments) && ReactorUI.isReady();
    };

    // `test&rrui=N` on the launch line (the editor's Playtest Interface
    // button) is a preview: the game objects are set up so escape codes and
    // actions have data to read, but no title or map ever opens. Interface N
    // is the first scene, over black, and closing it ends the playtest.
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        ReactorUI.installSceneRouting();
        const request = ReactorUI.captureRequest();
        if (request && !DataManager.isBattleTest() && !DataManager.isEventTest()) {
            Scene_Base.prototype.start.call(this);
            SoundManager.preloadImportantSounds();
            if (ReactorUI.beginCapture(request)) {
                this.resizeScreen();
                this.updateDocumentTitle();
                return;
            }
        }
        const id = ReactorUI.bootInterfaceId();
        if (!(id > 0) || DataManager.isBattleTest() || DataManager.isEventTest()) {
            return _Scene_Boot_start.apply(this, arguments);
        }
        Scene_Base.prototype.start.call(this);
        SoundManager.preloadImportantSounds();
        DataManager.setupNewGame();
        ReactorUI._preview = true;
        SceneManager.goto(Scene_ReactorUI);
        SceneManager.prepareNextScene(id);
        this.resizeScreen();
        this.updateDocumentTitle();
    };

})();
