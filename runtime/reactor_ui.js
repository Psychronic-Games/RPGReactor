//=============================================================================
// reactor_ui.js - Custom user interfaces authored in the database
//=============================================================================
//
// An interface is a record in data/UserInterfaces.json: a tree of Box,
// Image, Text, and Button nodes with anchored positions, each button wired
// to an action (close, call another interface, run a common event, open a
// stock scene, a plugin command, a switch, a variable, or a script). The
// file is optional: a project without one has no interfaces and boots
// exactly as before. Every node draws through Window_Base so it inherits the
// window skin, the game font, escape codes, input handling, and whatever
// plugins do to windows.
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
    ReactorUI.NODE_TYPES = ["box", "image", "text", "button"];
    ReactorUI.ANCHORS = {
        topLeft: [0, 0], top: [0.5, 0], topRight: [1, 0],
        left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
        bottomLeft: [0, 1], bottom: [0.5, 1], bottomRight: [1, 1]
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
    // Interface ids to resume: SceneManager rebuilds a popped-back-to scene
    // from its class alone, so an interface that pushed another scene (or
    // another interface) leaves its id here for the instance that returns.
    ReactorUI._resumeIds = [];
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
        this._resumeIds.length = 0;
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

    /** A CSS color from "#rrggbb" and an 0-255 alpha. */
    ReactorUI.cssColor = function(hex, alpha) {
        const color = isHexColor(hex) ? hex : "#000000";
        const a = clamp(finite(alpha, 255), 0, 255) / 255;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    };

    ReactorUI.normalizeCondition = function(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        const type = oneOf(source.type, ["always", "never", "switch", "variable", "script"], "always");
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
            "pluginCommand", "switch", "variable", "script"
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

    ReactorUI.normalizeNode = function(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        const type = oneOf(source.type, this.NODE_TYPES, "box");
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
            fill: oneOf(source.fill, ["window", "color", "gradient", "none"], type === "text" || type === "image" ? "none" : "window"),
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
            // Image
            source: oneOf(source.source, ["picture", "system", "face", "character", "icon"], "picture"),
            file: text(source.file, ""),
            index: Math.max(0, Math.floor(finite(source.index, 0))),
            fit: oneOf(source.fit, ["none", "stretch", "contain"], "none"),
            // Button
            action: this.normalizeAction(source.action),
            enabled: this.normalizeCondition(source.enabled),
            highlightColor: isHexColor(source.highlightColor) ? source.highlightColor : "#ffffff",
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
        return {
            id: Math.max(0, Math.floor(finite(source.id, 0))),
            name: text(source.name, ""),
            mode: oneOf(source.mode, ["scene", "overlay"], "scene"),
            background: oneOf(source.background, ["blur", "dim", "none"], "blur"),
            cancel: this.normalizeAction(source.cancel || { type: "close" }),
            firstFocus: Math.max(0, Math.floor(finite(source.firstFocus, 0))),
            nodes: unique,
            note: text(source.note, "")
        };
    };

    //-------------------------------------------------------------------------
    // Layout and conditions

    /**
     * Nodes in draw order: every parent before its children, siblings in
     * authored order, so a child never hides under its own parent.
     */
    ReactorUI.orderNodes = function(nodes) {
        const byParent = new Map();
        const ids = new Set(nodes.map(node => node.id));
        for (const node of nodes) {
            const parent = ids.has(node.parent) && node.parent !== node.id ? node.parent : 0;
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

    /** Open the requested scene the way the game would. */
    ReactorUI.beginCapture = function(request) {
        const sceneClass = window[request.sceneClass];
        if (typeof sceneClass !== "function") return false;
        this._capture = { request, frames: 0, sceneClass, done: false };
        if (request.scene === "title") {
            SceneManager.goto(sceneClass);
            return true;
        }
        DataManager.setupNewGame();
        if (request.scene === "battle") {
            const troopId = ($dataTroops || []).findIndex((troop, index) => index > 0 && troop);
            BattleManager.setup(troopId > 0 ? troopId : 1, true, true);
            SceneManager.goto(sceneClass);
            return true;
        }
        if (request.scene === "menu") Window_MenuCommand.initCommandPosition();
        SceneManager.goto(sceneClass);
        if (request.scene === "shop") {
            const goods = [];
            for (let id = 1; id < ($dataItems || []).length && goods.length < 6; id++) {
                if ($dataItems[id] && $dataItems[id].name) goods.push([0, id, 0, 0]);
            }
            SceneManager.prepareNextScene(goods, false);
        }
        return true;
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
        const canvas = PIXI.TextureSource
            ? extract.canvas({ target: app.stage })
            : extract.canvas(app.stage);
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
                return record;
            });
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
                windows: entries
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
        if (!(scene instanceof capture.sceneClass) || !scene.isStarted || !scene.isStarted()) return;
        if (SceneManager.isSceneChanging && SceneManager.isSceneChanging()) return;
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

    Window_ReactorUINode.prototype.resetFontSettings = function() {
        Window_Base.prototype.resetFontSettings.call(this);
        const node = this._uiNode;
        let size = node.fontSize > 0 ? node.fontSize : this.contents.fontSize;
        if (this._uiFontScale < 1) size = Math.max(ReactorUI.MIN_FONT_SIZE, Math.round(size * this._uiFontScale));
        this.contents.fontSize = size;
        this.contents.outlineWidth = node.outline ? 3 : 0;
        this.changeTextColor(isHexColor(node.textColor) ? node.textColor : ColorManager.textColor(node.textColor));
    };

    /** The node's text with escape codes resolved, as the game shows it now. */
    Window_ReactorUINode.prototype.currentText = function() {
        const node = this._uiNode;
        if (node.type !== "text" && node.type !== "button") return "";
        return this.convertEscapeCharacters(node.text);
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
        if (!node.wrap || !(node.width > 0)) return node.text;
        return this.wrapText(node.text, this.contentsWidth() || node.width);
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
        }
        const opacity = this._uiOpacity === undefined ? 255 : this._uiOpacity;
        this.contentsOpacity = this._uiEnabled ? opacity : Math.round(opacity * 160 / 255);
        this._uiLastText = this.currentText();
    };

    Window_ReactorUINode.prototype.drawSurface = function() {
        const node = this._uiNode;
        if (node.fill === "window" || node.fill === "none") {
            if (node.fill === "window" && node.borderWidth > 0) this.drawBorder(this.contents);
            return;
        }
        const bitmap = this.contentsBack || this.contents;
        const width = this.contentsWidth();
        const height = this.contentsHeight();
        const color1 = ReactorUI.cssColor(node.color, node.fillOpacity);
        const color2 = ReactorUI.cssColor(node.color2, node.fillOpacity);
        const context = bitmap.context;
        context.save();
        if (node.radius > 0) {
            roundedPath(context, 0, 0, width, height, node.radius);
            context.clip();
        }
        if (node.fill === "gradient") {
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
        if (node.source === "face") {
            const pw = ImageManager.faceWidth, ph = ImageManager.faceHeight;
            sx = (node.index % 4) * pw;
            sy = Math.floor(node.index / 4) * ph;
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
            return;
        }
        if (!this._uiFocused) return;
        this.drawBorder(this.contents, ReactorUI.cssColor(node.highlightColor, 255), Math.max(2, node.borderWidth));
    };

    Window_ReactorUINode.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (this._uiNode.type === "text" || this._uiNode.type === "button") {
            if (this.currentText() !== this._uiLastText) this.refresh();
        }
    };

    Window_ReactorUINode.prototype.containsPoint = function(x, y) {
        if (!this.visible) return false;
        const local = this.worldTransform.applyInverse(new Point(x, y));
        return local.x >= 0 && local.y >= 0 && local.x < this.width && local.y < this.height;
    };

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
    };

    Scene_ReactorUI.prototype.prepare = function(interfaceId) {
        this._interfaceId = Number(interfaceId) || 0;
    };

    Scene_ReactorUI.prototype.interfaceId = function() {
        return this._interfaceId;
    };

    Scene_ReactorUI.prototype.create = function() {
        if (!this._interfaceId && ReactorUI._resumeIds.length) {
            this._interfaceId = ReactorUI._resumeIds.pop();
        }
        this._interface = ReactorUI.interface(this._interfaceId);
        Scene_MenuBase.prototype.create.call(this);
        if (this._interface) this.createNodes();
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
        const root = new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight);
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
            const window = new Window_ReactorUINode(rect, this, node);
            const opacity = opacityOf(node, new Set());
            window.opacity = Math.min(window.opacity, opacity);
            window.contentsOpacity = opacity;
            window._uiOpacity = opacity;
            this._nodeWindows.push(window);
            this.addWindow(window);
        }
        this.updateConditions();
        this.focusInitial();
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
            this.popScene();
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

    Scene_ReactorUI.prototype.updateConditions = function() {
        for (const window of this._nodeWindows) {
            const node = window.node();
            window.visible = ReactorUI.evaluateCondition(node.visible, this);
            if (node.type === "button") window.setEnabled(ReactorUI.evaluateCondition(node.enabled, this));
        }
        // Hidden ancestors hide their subtree.
        const byId = new Map();
        for (const window of this._nodeWindows) byId.set(window.node().id, window);
        for (const window of this._nodeWindows) {
            let parent = byId.get(window.node().parent);
            let guard = 0;
            while (parent && guard++ < ReactorUI.MAX_NESTING * 4) {
                if (!parent.visible) { window.visible = false; break; }
                parent = byId.get(parent.node().parent);
            }
        }
        const focused = this.focusedWindow();
        if (focused && !this.canFocus(focused)) {
            this.setFocus(this._nodeWindows.findIndex(window => this.canFocus(window)));
        }
    };

    Scene_ReactorUI.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        if (!this._interface || this._closing || !this.isActive()) return;
        this.updateConditions();
        this.updateTouch();
        this.updateInput();
    };

    Scene_ReactorUI.prototype.updateTouch = function() {
        if (!TouchInput.isHovered() && !TouchInput.isTriggered()) return;
        // Topmost hit wins, so a button over a box is the one that reacts.
        for (let i = this._nodeWindows.length - 1; i >= 0; i--) {
            const window = this._nodeWindows[i];
            if (!this.canFocus(window) || !window.containsPoint(TouchInput.x, TouchInput.y)) continue;
            this.setFocus(i);
            if (TouchInput.isTriggered()) this.activateFocused();
            return;
        }
    };

    Scene_ReactorUI.prototype.updateInput = function() {
        if (Input.isTriggered("ok")) {
            this.activateFocused();
        } else if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
            SoundManager.playCancel();
            // An interface with nothing to press and no cancel action would
            // trap the player; cancel closes it instead.
            const cancel = this._interface.cancel;
            const stuck = cancel.type === "none" && !this._nodeWindows.some(window => this.canFocus(window) && window.isEnabled());
            this.runAction(stuck ? { type: "close" } : cancel);
        } else {
            for (const direction of ["down", "up", "left", "right"]) {
                if (Input.isRepeated(direction)) {
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
        const node = window.node();
        if (node.se) AudioManager.playSe(node.se);
        else SoundManager.playOk();
        this.runAction(node.action);
    };

    Scene_ReactorUI.prototype.closeAll = function() {
        const stack = SceneManager._stack;
        while (stack.length > 0 && stack[stack.length - 1] === Scene_ReactorUI) {
            stack.pop();
            ReactorUI._resumeIds.pop();
        }
        this.close();
    };

    /** Leaves for another scene that will come back here when it pops. */
    Scene_ReactorUI.prototype.pushScene = function(sceneClass) {
        ReactorUI._resumeIds.push(this._interfaceId);
        SceneManager.push(sceneClass);
    };

    /** True when this interface is the preview's root: nothing sits under it. */
    Scene_ReactorUI.prototype.isPreviewRoot = function() {
        return ReactorUI.isPreview() && SceneManager._stack.length === 0;
    };

    Scene_ReactorUI.prototype.close = function() {
        this._closing = true;
        if (this.isPreviewRoot()) {
            ReactorUI.endPreview();
            return;
        }
        this.popScene();
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
                ReactorUI._resumeIds.push(this._interfaceId);
                if (!ReactorUI.call(action.id)) {
                    ReactorUI._resumeIds.pop();
                    SoundManager.playBuzzer();
                }
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
                        ReactorUI._resumeIds.length = 0;
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
    };

    //-------------------------------------------------------------------------
    // Boot hooks

    const _Scene_Boot_create = Scene_Boot.prototype.create;
    Scene_Boot.prototype.create = function() {
        _Scene_Boot_create.apply(this, arguments);
        ReactorUI.load();
    };

    const _Scene_Boot_isReady = Scene_Boot.prototype.isReady;
    Scene_Boot.prototype.isReady = function() {
        return _Scene_Boot_isReady.apply(this, arguments) && ReactorUI.isReady();
    };

    // `test&rrui=N` on the launch line (the editor's Playtest Interface
    // button) is a preview: the game objects are set up so escape codes and
    // actions have data to read, but no title or map ever opens. Interface N
    // is the first scene, over black, and closing it ends the playtest.
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
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

    const _SceneManager_updateScene = SceneManager.updateScene;
    SceneManager.updateScene = function() {
        _SceneManager_updateScene.apply(this, arguments);
        if (ReactorUI._capture) ReactorUI.updateCapture();
    };
})();
