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
    // A disabled control or row left at the default opacity dims as stock windows do (translucentOpacity).
    ReactorUI.DISABLED_OPACITY = 160;
    ReactorUI.NODE_TYPES = ["box", "image", "text", "button", "list", "gauge", "input", "battleWindow", "battleCursor",
        "fightUnit", "fightTurnOrder", "fightInfo", "fightWindow",
        "actionCrosshair", "actionVitals", "actionWeapon", "actionHotbar", "actionTarget", "actionBars", "actionDamage", "actionInfo",
        "victoryParty", "victoryLevels", "victoryRewards", "victoryText"];
    /** Nodes that can be turned by an Angle about their center. */
    ReactorUI.TURNABLE_TYPES = ["box", "image", "text", "button", "gauge", "input"];
    /** The Victory interface's shared half (reactor_ui_victory.js): node settings, pages, the fill and drawing. */
    const VictoryHud = () => window.ReactorVictoryHud || null;
    /** The Action and First Person battle HUD's shared half (reactor_ui_action.js). */
    const ActionHud = () => window.ReactorActionHud || null;
    /** The Tactical battle HUD's shared half (reactor_ui_fight.js): node settings, layout and drawing. */
    const FightHud = () => window.ReactorFightHud || null;
    ReactorUI.TACTICAL_FIELD = "reactorTacticalInterfaceId";
    /** The stock battle windows a Battle Window node places, by scene property. */
    ReactorUI.BATTLE_WINDOWS = {
        partyCommand: "_partyCommandWindow", actorCommand: "_actorCommandWindow", help: "_helpWindow",
        skill: "_skillWindow", item: "_itemWindow", actor: "_actorWindow", enemy: "_enemyWindow",
        status: "_statusWindow", log: "_logWindow"
    };
    ReactorUI.BATTLE_FIELD = "reactorBattleInterfaceId";
    /**
     * Commands a Battle Window node can list. Actor Command takes attack,
     * skillTypes (one per skill type the actor has, as stock), skillType (one
     * type), guard, item, escape and skill (use one skill directly); Party
     * Command takes fight and escape. Both take commonEvent, which runs a
     * common event on the spot and then lets the same window choose again.
     * An empty list keeps the stock commands.
     */
    ReactorUI.BATTLE_COMMANDS = {
        actorCommand: ["attack", "skillTypes", "skillType", "guard", "item", "escape", "skill", "commonEvent"],
        partyCommand: ["fight", "escape", "commonEvent"]
    };
    ReactorUI.GAUGE_KINDS = ["hp", "mp", "tp", "exp", "mhp", "mmp", "atk", "def", "mat", "mdf", "agi", "luk", "variable"];
    ReactorUI.LIST_SOURCES = ["party", "inventory", "skills", "actorParameters", "actorEquipment", "actorStates", "options", "saveSlots", "variableRange", "literal",
        "itemCategories", "skillTypes", "equipCandidates", "shopGoods", "shopSell"];
    ReactorUI.INVENTORY_CATEGORIES = ["all", "item", "weapon", "armor", "keyItem"];
    ReactorUI.IMAGE_SOURCES = ["picture", "system", "face", "character", "icon", "partyFace", "title1", "title2"];
    ReactorUI.ACTOR_SOURCES = ["partySlot", "actorId", "menuActor", "variable", "context", "sceneActor"];
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
    ReactorUI.windowRect = function(rect, scene, fit) {
        const owner = scene && scene._mapScene || scene;
        const layer = owner && owner._windowLayer;
        const metrics = this.screenMetrics();
        const x = layer && Number.isFinite(Number(layer.x)) ? Number(layer.x) : metrics.boxX;
        const y = layer && Number.isFinite(Number(layer.y)) ? Number(layer.y) : metrics.boxY;
        // A fitted record's rectangles are in its own units: the place is on the screen, the size stays the
        // window's own (it is shown at fit.scale).
        if (fit) return new Rectangle(Math.round(rect.x * fit.scale) - x, Math.round(rect.y * fit.scale) - y, rect.width, rect.height);
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

    ReactorUI.TEST_DATA_URL = "data/Test_UserInterfaces.json";

    /** The files to read, first found wins: a battle test reads the Test_ copy the editor wrote from its unsaved database, when it wrote one. */
    ReactorUI.dataUrls = function() {
        const testing = typeof DataManager !== "undefined" && typeof DataManager.isBattleTest === "function" && DataManager.isBattleTest();
        return testing ? [this.TEST_DATA_URL, this.DATA_URL] : [this.DATA_URL];
    };

    /** Loads the interfaces file once; missing or malformed means none. */
    ReactorUI.load = function() {
        if (this._state) return;
        this._state = "loading";
        const finish = parsed => {
            window.$dataUserInterfaces = Array.isArray(parsed) ? parsed : [];
            this._state = "done";
        };
        const urls = this.dataUrls();
        try {
            if (typeof Utils !== "undefined" && Utils.isNwjs()) {
                const fs = require("fs");
                const path = require("path");
                for (const url of urls) {
                    const full = path.join(path.dirname(process.mainModule.filename), url);
                    if (!fs.existsSync(full)) continue;
                    try {
                        return finish(JSON.parse(fs.readFileSync(full, "utf8")));
                    } catch (error) {
                        console.warn("ReactorUI: could not read " + url, error);
                    }
                }
                return finish(null);
            }
        } catch (error) {
            console.warn("ReactorUI: could not read " + this.DATA_URL, error);
            return finish(null);
        }
        const request = index => {
            if (index >= urls.length) return finish(null);
            try {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", urls[index]);
                xhr.overrideMimeType("application/json");
                xhr.onload = () => {
                    let parsed = null;
                    if (xhr.status < 400) {
                        try { parsed = JSON.parse(xhr.responseText); } catch (error) { parsed = null; }
                    }
                    if (parsed === null && index + 1 < urls.length) request(index + 1); else finish(parsed);
                };
                xhr.onerror = () => request(index + 1);
                xhr.send();
            } catch (error) {
                request(index + 1);
            }
        };
        request(0);
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

    function battleCommands(value) {
        const kinds = ["attack", "skillTypes", "skillType", "guard", "item", "escape", "skill", "fight", "commonEvent"];
        return (Array.isArray(value) ? value : []).filter(entry => entry && typeof entry === "object" && kinds.includes(entry.kind)).slice(0, 32)
            .map(entry => ({ kind: entry.kind, label: text(entry.label, ""), id: Math.max(0, Math.floor(finite(entry.id, 0))), knownOnly: entry.knownOnly !== false }));
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
            opacity: disabled ? (node.disabledOpacity === "" ? ReactorUI.DISABLED_OPACITY : node.disabledOpacity) : pressed ? node.pressedOpacity : focused ? node.focusedOpacity : "",
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

    ReactorUI.normalizeActorElements = function(raw) {
        const result = {};
        const keys = ['portrait','name','class','level','states','atb', ...['hp','mp','tp','exp'].flatMap(k => [k,k+'Label',k+'Value'])];
        keys.push(...Object.keys(raw || {}).filter(key => /^custom_[1-9]\d*$/.test(key)).slice(0,100));
        for (const key of keys) {
            const source = raw && raw[key];
            if (!source || typeof source !== 'object') continue;
            const value = {};
            if (key.startsWith('custom_')) {
                value.kind = ['box','label','value','gauge','image'].includes(source.kind) ? source.kind : 'label';
                value.name = typeof source.name === 'string' ? source.name : '';
                value.gauge = ['hp','mp','tp','exp','atb','mhp','mmp','atk','def','mat','mdf','agi','luk','variable'].includes(source.gauge) ? source.gauge : 'variable';
                for (const prop of ['variableId','maxVariableId','max']) value[prop] = Math.min(999999999,Math.max(0,Number(source[prop]) || (prop==='max'?100:0)));
            }
            for (const prop of ['x','y','width','height','fontSize','corner','thickness','iconSize','iconGap']) {
                if (source[prop] === '' || source[prop] == null || !Number.isFinite(Number(source[prop]))) continue;
                value[prop] = Math.min(9999, Math.max(['x','y'].includes(prop) ? -9999 : ['corner','iconGap'].includes(prop) ? 0 : 1, Number(source[prop])));
            }
            for (const prop of ['color','color2','backColor']) {
                if (/^#[0-9a-f]{6}$/i.test(source[prop])) value[prop] = source[prop];
            }
            if (['left','center','right'].includes(source.align)) value.align = source.align;
            if (['rectangle','rounded','chamfer','circular'].includes(source.shape)) value.shape = source.shape;
            if (['current','currentMax','percent'].includes(source.valueFormat)) value.valueFormat = source.valueFormat;
            if (typeof source.text === 'string') value.text = source.text;
            if (typeof source.visible === 'boolean') value.visible = source.visible;
            // Battle HUD styling: image meters and digit sheets from img/pictures,
            // states one at a time, parts for the acting actor only, parts
            // drawn behind the rest, a picture that turns.
            for (const prop of ['meterImage','numberImage','file']) if (typeof source[prop] === 'string' && source[prop]) value[prop] = source[prop];
            if (['row','cycle'].includes(source.statesMode)) value.statesMode = source.statesMode;
            if (Number(source.meterRows) === 2) value.meterRows = 2;
            if (typeof source.onlyActive === 'boolean') value.onlyActive = source.onlyActive;
            if (typeof source.behind === 'boolean') value.behind = source.behind;
            if (Number.isFinite(Number(source.rotation)) && source.rotation !== '' && source.rotation != null) value.rotation = Math.max(-60, Math.min(60, Number(source.rotation)));
            result[key] = value;
        }
        return result;
    };

    ReactorUI.actorPanelLayout = function(node, width, height, fontSize) {
        const fields = new Set(node.actorFields || ['portrait','name','class','level','hp','mp','exp','states']);
        const pad = node.actorPadding ?? 12, gap = node.actorGap ?? 4;
        const size = Math.max(0, Math.min(node.portraitSize || 144, height - pad * 2, (width - pad * 2) / 3));
        const x = pad + (fields.has('portrait') ? size + gap + 8 : 0);
        const w = Math.max(1, width - pad - x);
        const gauges = ['hp','mp','tp','exp'].filter(k => fields.has(k));
        const barHeight = key => node.actorElements?.[key]?.height || 6;
        const barSpace = gauges.reduce((sum,key)=>sum+barHeight(key)+2,0);
        const lines = Number(fields.has('name')) + Number(fields.has('class') || fields.has('level')) + gauges.length;
        const textHeight = Math.max(10, Math.floor(Math.min(fontSize + 8, (height - pad * 2 - gap * Math.max(0,lines-1) - barSpace) / Math.max(1,lines))));
        const textSize = Math.max(8, Math.min(fontSize, textHeight - 8));
        const result = {};
        const add = (key, kind, rect, props = {}) => {
            result[key] = Object.assign({ kind, visible: true, fontSize: textSize, align: 'left', ...rect }, props, node.actorElements?.[key] || {});
        };
        if(fields.has('portrait')) add('portrait','portrait',{x:pad,y:pad,width:size,height:size});
        let y = pad;
        if(fields.has('name')) { add('name','text',{x,y,width:fields.has('states')&&!fields.has('portrait')?Math.max(1,w-160):w,height:textHeight},{text:'{actor.name}'}); y+=textHeight+gap; }
        if(fields.has('class') || fields.has('level')) {
            const levelWidth = Math.min(w / 3, Math.max(64,textSize * 5));
            if(fields.has('class')) add('class','text',{x,y,width:w-(fields.has('level')?levelWidth+gap:0),height:textHeight},{text:'{actor.class}'});
            if(fields.has('level')) add('level','text',{x:x+w-levelWidth,y,width:levelWidth,height:textHeight},{align:'right',text:'{levelLabel} {actor.level}'});
            y+=textHeight+gap;
        }
        for(const key of gauges) {
            const valueWidth = Math.min(w / 2, Math.max(88,textSize * 9));
            add(key+'Label','label',{x,y,width:Math.max(1,w-valueWidth-gap),height:textHeight},{gauge:key,text:''});
            add(key+'Value','value',{x:x+w-valueWidth,y,width:valueWidth,height:textHeight},{gauge:key,align:'right',valueFormat:key==='exp'?'percent':'currentMax'});
            add(key,'gauge',{x,y:y+textHeight+2,width:w,height:barHeight(key)},{gauge:key,shape:'rectangle',corner:4,thickness:8});
            y+=textHeight+barHeight(key)+2+gap;
        }
        if(fields.has('atb')) { add('atb','gauge',{x,y,width:w,height:barHeight('atb')},{gauge:'atb',shape:'rectangle',corner:4,thickness:8}); y+=barHeight('atb')+gap; }
        if(fields.has('states')) add('states','states',{
            x:fields.has('portrait')?pad:Math.max(pad,width-pad-160), y:fields.has('portrait')?pad+size+gap:pad,
            width:fields.has('portrait')?size:160,height:32},{iconSize:28,iconGap:4});
        for(const [key,element] of Object.entries(node.actorElements || {})) {
            if(!/^custom_[1-9]\d*$/.test(key)) continue;
            result[key]=Object.assign({kind:'label',visible:true,x:pad,y:pad,width:160,height:32,fontSize:fontSize,
                align:'left',text:'',shape:'rectangle',corner:4,thickness:8,valueFormat:'current',gauge:'variable',max:100},element);
        }
        return result;
    };

    ReactorUI.actorGaugePath = function(ctx, rect, shape, corner) {
        const {x,y,width:w,height:h}=rect;
        const c=Math.max(0,Math.min(corner || 0,w/2,h/2));
        ctx.beginPath();
        if(shape==='rounded') {
            ctx.moveTo(x+c,y); ctx.lineTo(x+w-c,y); ctx.quadraticCurveTo(x+w,y,x+w,y+c);
            ctx.lineTo(x+w,y+h-c); ctx.quadraticCurveTo(x+w,y+h,x+w-c,y+h);
            ctx.lineTo(x+c,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-c);
            ctx.lineTo(x,y+c); ctx.quadraticCurveTo(x,y,x+c,y);
        } else if(shape==='chamfer') {
            ctx.moveTo(x+c,y); ctx.lineTo(x+w,y); ctx.lineTo(x+w,y+h-c);
            ctx.lineTo(x+w-c,y+h); ctx.lineTo(x,y+h); ctx.lineTo(x,y+c);
        } else ctx.rect(x,y,w,h);
        ctx.closePath();
    };

    ReactorUI.drawActorGauge = function(ctx, rect, element, rate, colors) {
        const {x,y,width:w,height:h}=rect;
        rate=Math.max(0,Math.min(1,Number(rate)||0));
        ctx.save();
        const gradient=ctx.createLinearGradient(x,y,x+w,y);
        gradient.addColorStop(0,element.color||colors[0]);gradient.addColorStop(1,element.color2||colors[1]);
        if(element.shape==='circular') {
            const thickness=Math.min(Math.max(1,element.thickness||8),Math.min(w,h)/2);
            const radius=Math.max(0,(Math.min(w,h)-thickness)/2);
            ctx.lineWidth=thickness;ctx.lineCap='butt';
            ctx.beginPath();ctx.arc(x+w/2,y+h/2,radius,0,Math.PI*2);ctx.strokeStyle=element.backColor||colors[2];ctx.stroke();
            if(rate>0) {ctx.beginPath();ctx.arc(x+w/2,y+h/2,radius,-Math.PI/2,-Math.PI/2+Math.PI*2*rate);ctx.strokeStyle=gradient;ctx.stroke();}
        } else {
            this.actorGaugePath(ctx,rect,element.shape,element.corner);ctx.clip();
            ctx.fillStyle=element.backColor||colors[2];ctx.fillRect(x,y,w,h);
            ctx.fillStyle=gradient;ctx.fillRect(x,y,w*rate,h);
        }
        ctx.restore();
    };

    ReactorUI.normalizeAction = function(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        const type = oneOf(source.type, [
            "none", "close", "closeAll", "callInterface", "commonEvent", "scene",
            "pluginCommand", "switch", "variable", "script", "setMenuActor",
            "personalSkill", "personalEquip", "personalStatus", "titleNewGame",
            "titleContinue", "titleOptions", "gameEndToTitle", "previousMenuActor", "nextMenuActor",
            "optionChange", "saveSlot", "loadSlot", "formation", "pluginScene",
            "use", "equip", "equipOptimize", "equipClear", "focusNode", "shopBuy", "shopSell"
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
            sceneClass: text(source.sceneClass, ""), argsExpression: text(source.argsExpression, ""), actorFirst: !!source.actorFirst,
            args,
            on: source.on !== false,
            op: oneOf(source.op, ["set", "add", "sub"], "set"),
            value: finite(source.value, 0),
            script: text(source.script, ""),
            contextName: text(source.contextName, "selection").trim() || "selection",
            chooseActor: source.chooseActor !== false,
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
            angle: this.TURNABLE_TYPES.includes(type) ? clamp(Math.round(finite(source.angle, 0)), -180, 180) : 0,
            visible: this.normalizeCondition(source.visible),
            // Box / button surface
            fill: oneOf(source.fill, ["window", "color", "gradient", "none"], type === "text" || type === "image" || type === "gauge" || type === "fightTurnOrder" || type === "fightInfo"
                || (type.startsWith("action") && type !== "actionVitals" && type !== "actionWeapon") || type.startsWith("victory") ? "none" : "window"),
            color: isHexColor(source.color) ? source.color : "#000000",
            color2: isHexColor(source.color2) ? source.color2 : "#000000",
            fillOpacity: clamp(Math.round(finite(source.fillOpacity, 160)), 0, 255),
            vertical: source.vertical !== false,
            borderWidth: clamp(Math.round(finite(source.borderWidth, 0)), 0, 32),
            borderColor: isHexColor(source.borderColor) ? source.borderColor : "#ffffff",
            radius: clamp(Math.round(finite(source.radius, 0)), 0, 200),
            // Text / button label
            text: text(source.text, ""),
            labelScript: text(source.labelScript, ""),
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
            // Battle Window: which stock window, and how it behaves.
            battleWindow: oneOf(source.battleWindow, Object.keys(this.BATTLE_WINDOWS), "actorCommand"),
            hideWindow: !!source.hideWindow,
            followActor: !!source.followActor,
            // What a following window follows: the actor's row in the party panel ("slot"), or the actor as it stands in the battle ("model").
            followTarget: source.followTarget === "model" ? "model" : "slot",
            slideX: clamp(Math.round(finite(source.slideX, 0)), -2000, 2000),
            slideY: clamp(Math.round(finite(source.slideY, 0)), -2000, 2000),
            slideDuration: clamp(Math.round(finite(source.slideDuration, 12)), 1, 120),
            windowColumns: clamp(Math.round(finite(source.windowColumns, 0)), 0, 12),
            commandAlign: oneOf(source.commandAlign, ["center", "left", "right"], "center"),
            commands: battleCommands(source.commands),
            imageX: clamp(Math.round(finite(source.imageX, 0)), -2000, 2000),
            imageY: clamp(Math.round(finite(source.imageY, 0)), -2000, 2000),
            // Target Cursor: animation and placement over the chosen battler.
            frames: clamp(Math.round(finite(source.frames, 1)), 1, 60),
            frameSpeed: clamp(Math.round(finite(source.frameSpeed, 8)), 1, 120),
            floatRange: clamp(Math.round(finite(source.floatRange, 6)), 0, 100),
            showName: source.showName !== false,
            actorFile: text(source.actorFile, ""),
            cursorSlide: source.cursorSlide !== false,
            enemyOffsetX: clamp(Math.round(finite(source.enemyOffsetX, 0)), -2000, 2000),
            enemyOffsetY: clamp(Math.round(finite(source.enemyOffsetY, 0)), -2000, 2000),
            actorOffsetX: clamp(Math.round(finite(source.actorOffsetX, 0)), -2000, 2000),
            actorOffsetY: clamp(Math.round(finite(source.actorOffsetY, 0)), -2000, 2000),
            // Actor Panel portraits: a face or a picture per actor, with MOG-style
            // expression frames and reactions.
            portraitSource: oneOf(source.portraitSource, ["face", "picture"], "face"),
            portraitPattern: text(source.portraitPattern, "Face_{id}"),
            portraitFrames: source.portraitFrames === 5 || source.portraitFrames === "5" ? 5 : 1,
            portraitMotion: !!source.portraitMotion,
            portraitBreath: !!source.portraitBreath,
            // Text input: what it edits, how long it may be, how it shows.
            inputTarget: oneOf(source.inputTarget, ["variable", "actorName", "actorNickname"], "variable"),
            maxLength: clamp(Math.round(finite(source.maxLength, 16)), 1, 99),
            mask: !!source.mask,
            onScreenKeys: !!source.onScreenKeys,
            autoEdit: !!source.autoEdit,
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
            rowLayout: source.rowLayout === "actorPanel" ? "actorPanel" : "text",
            portraitSize: clamp(Math.round(finite(source.portraitSize, 144)), 32, 144),
            actorPadding: clamp(finite(source.actorPadding, 12), 0, 200),
            actorGap: clamp(finite(source.actorGap, 4), 0, 200),
            actorElements: this.normalizeActorElements(source.actorElements),
            actorLayoutVersion: 3,
            actorFields: Array.isArray(source.actorFields) ? source.actorFields.filter(key => ["portrait","name","class","level","hp","mp","tp","exp","states","atb"].includes(key)) : ["portrait","name","class","level","hp","mp","exp","states"],
            dataSource: source.rowLayout === "actorPanel" ? "party" : oneOf(source.dataSource, this.LIST_SOURCES, "literal"),
            category: oneOf(source.category, this.INVENTORY_CATEGORIES, "all"),
            actorMode: oneOf(source.actorMode, ["party", "actor"], "party"),
            actorId: Math.max(1, Math.floor(finite(source.actorId, 1))),
            skillTypeId: Math.max(0, Math.floor(finite(source.skillTypeId, 0))),
            includeAutosave: !!source.includeAutosave,
            rangeStart: Math.max(1, Math.floor(finite(source.rangeStart, 1))),
            rangeEnd: Math.max(1, Math.floor(finite(source.rangeEnd, 10))),
            items: this.normalizeLiteralItems(source.items),
            rowText: text(source.rowText, ""),
            rowHeight: source.rowLayout==='actorPanel' && !source.actorLayoutVersion && source.rowHeight===192 ? 256 : clamp(Math.round(finite(source.rowHeight, 36)), 24, 9999),
            contextName: text(source.contextName, "selection").trim() || "selection",
            // A list whose rows follow another list's selection: the category,
            // skill type or equipment slot chosen there.
            filterContext: text(source.filterContext, "").trim(),
            // Parameter rows compare against the equipment chosen in this context.
            compareContext: text(source.compareContext, "").trim(),
            // Cancel on this control moves focus to that node instead of
            // running the interface's cancel.
            backFocus: Math.max(0, Math.floor(finite(source.backFocus, 0))),
            // Rows side by side: a category bar, an item grid.
            columns: clamp(Math.round(finite(source.columns, 1)), 1, 12),
            // A list that only displays (equipment comparison) can stay out of focus.
            focusable: source.focusable !== false,
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
        if(node.rowLayout==='actorPanel' && (source.actorLayoutVersion || 0)<3 && !node.actorFields.includes('states')) node.actorFields.push('states');
        const fightHud = FightHud();
        if (fightHud && fightHud.isFightNode(type)) Object.assign(node, fightHud.normalizeProps(source, type));
        const actionHud = ActionHud();
        if (actionHud && actionHud.isActionNode(type)) Object.assign(node, actionHud.normalizeProps(source, type));
        const victoryHud = VictoryHud();
        if (victoryHud) {
            // In a Victory record any node may belong to one page; the victory nodes carry their own settings too.
            node.victoryPage = victoryHud.normalizePage(source.victoryPage);
            if (victoryHud.isVictoryNode(type)) Object.assign(node, victoryHud.normalizeProps(source, type));
        }
        return node;
    };

    ReactorUI.upgradeMenuActorPanel = function(entry) {
        const nodes = Array.isArray(entry.nodes) ? entry.nodes : [];
        if (entry.stock !== 'menu' || nodes.some(node => node.rowLayout === 'actorPanel')) return nodes;
        const party = nodes.find(node => node.type === 'box' && node.name === 'Party');
        if (!party) return nodes;
        const legacyNames = ['Party members', 'Selected face', 'Selected name', 'Selected level and class', 'Selected HP', 'Selected MP', 'Selected EXP'];
        const panel = Object.assign({}, party, { type: 'list', name: 'Actor Panel', dataSource: 'party',
            rowLayout: 'actorPanel', rowHeight: 256, portraitSize: 144,
            actorFields: ['portrait', 'name', 'class', 'level', 'hp', 'mp', 'exp', 'states'], contextName: 'selectedActor' });
        return nodes.filter(node => node.parent !== party.id || !legacyNames.includes(node.name))
            .map(node => node === party ? panel : node);
    };

    ReactorUI.upgradeMenuFormation = function(entry, enabled, label) {
        const nodes=Array.isArray(entry.nodes)?entry.nodes:[];
        if(entry.stock!=='menu' || entry.menuCommandVersion>=2 || !enabled || nodes.some(n=>n.action?.type==='formation')) return nodes;
        const status=nodes.find(n=>n.type==='button' && n.action?.type==='personalStatus');
        const parent=nodes.find(n=>n.id===status?.parent && n.name==='Commands');
        if(!status || !parent) return nodes;
        const id=Math.max(0,...nodes.map(n=>n.id))+1;
        const button={...status,id,name:'Formation',text:label||'Formation',labelScript:'',y:status.y+status.height,
            action:{type:'formation',contextName:'selectedActor'},
            enabled:{type:'script',script:'$gameParty.size() > 1 && $gameSystem.isFormationEnabled()'},
            focusUp:0,focusDown:0,focusLeft:0,focusRight:0};
        return nodes.flatMap(n=>n===status?[n,button]:[{...n,...(n.parent===parent.id && n.y>=button.y?{y:n.y+button.height}:{})}]);
    };

    ReactorUI.normalizeInterface = function(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        const system=typeof $dataSystem!=='undefined' && $dataSystem || {};
        const upgraded={...source,nodes:this.upgradeMenuActorPanel(source)};
        const nodes = this.upgradeMenuFormation(upgraded,system.menuCommands?.[4]!==false,system.terms?.commands?.[8]).map(node => this.normalizeNode(node));
        const ids = new Set();
        const unique = [];
        for (const node of nodes) {
            if (ids.has(node.id)) continue;
            ids.add(node.id);
            unique.push(node);
        }
        if (source.coordinateSpace !== "screen") this.migrateLegacyCoordinates(unique);
        return this.fitRecord({
            id: Math.max(0, Math.floor(finite(source.id, 0))),
            design: this.normalizeDesign(source.design),
            name: text(source.name, ""),
            mode: oneOf(source.mode === "fight" ? "tactical" : source.mode, ["scene", "overlay", "battle", "tactical", "action", "firstPerson", "victory"], "scene"),
            hideStatusWindow: source.hideStatusWindow !== false,
            background: oneOf(source.background, ["blur", "dim", "none"], "blur"),
            visible: this.normalizeCondition(source.visible),
            cancel: this.normalizeAction(source.cancel || { type: "close" }),
            firstFocus: Math.max(0, Math.floor(finite(source.firstFocus, 0))),
            openTransition: oneOf(source.openTransition, ["none", "fade", "slideLeft", "slideUp"], "none"),
            closeTransition: oneOf(source.closeTransition, ["none", "fade", "slideLeft", "slideUp"], "none"),
            transitionDuration: clamp(Math.round(finite(source.transitionDuration, 18)), 1, 120),
            coordinateSpace: "screen",
            nodes: this.orderNodes(unique),
            note: text(source.note, ""),
            stock: text(source.stock, ""),
            menuCommandVersion: 2,
            roles: Array.from(new Set((Array.isArray(source.roles) ? source.roles : source.stock ? [source.stock] : [])
                .filter(role => Object.prototype.hasOwnProperty.call(this.REPLACEMENTS || {}, role))))
        });
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

    // <interface-fit>
    // The same text stands in editor/src/utils/InterfaceFit.js (a test pins the two), so the editor's canvas
    // previews a record at another screen size exactly as the game lays it out.
    /**
     * A record designed for one screen, laid out for another. Returns null when the sizes are the same (nothing
     * changes), else { scale, width, height, nodes }: `scale` is the one factor everything is shown at (the
     * smaller of the two ratios, so nothing leaves the screen), `width` x `height` is the screen in the record's
     * own units (the design frame, wider or taller where the screen's shape differs), and `nodes` are the nodes
     * placed in that frame. Sizes are not stretched: in a scene the design frame stands in the middle of the
     * screen; in a HUD each node keeps to the edge or the middle it stood at. A node that covers its frame from
     * side to side keeps covering it.
     */
    function fitInterfaceNodes(nodes, design, screen, mode, anchors, mainFontSize) {
        const dw = Math.round(Number(design && design.width) || 0), dh = Math.round(Number(design && design.height) || 0);
        const sw = Math.round(Number(screen && screen.width) || 0), sh = Math.round(Number(screen && screen.height) || 0);
        if (!(dw > 0 && dh > 0 && sw > 0 && sh > 0) || (dw === sw && dh === sh)) return null;
        const base = Math.min(sw / dw, sh / dh);
        const SPAN = 0.05, NEAR = 0.02;
        const list = Array.isArray(nodes) ? nodes : [];
        const byId = new Map(list.map(node => [node.id, node]));
        // Text that would show smaller than is easy to read (12 px on a screen 480 high, 14 px from 720 up) is
        // shown at that size instead, when every layer still stands on the screen clear of its neighbours.
        const main = Number(mainFontSize) > 0 ? Number(mainFontSize) : 0;
        const sizes = main ? list.filter(node => node && !["box", "image", "battleCursor"].includes(node.type)).map(node => Number(node.fontSize) > 0 ? Number(node.fontSize) : main) : [];
        const floor = Math.max(12, Math.min(14, 12 + (sh - 480) / 120));
        const larger = sizes.length ? [floor / Math.min(...sizes), floor / main].map(f => Math.min(1, f)).filter((f, i, all) => f > base + 0.001 && all.indexOf(f) === i).sort((p, q) => q - p) : [];
        for (const scale of larger) {
            const fit = layoutAt(scale, Math.round(sw / scale), Math.round(sh / scale), true);
            if (fit) return fit;
        }
        return layoutAt(base, Math.max(dw, Math.round(sw / base)), Math.max(dh, Math.round(sh / base)), false);

      function layoutAt(scale, width, height, strict) {
        const before = new Map(), after = new Map();
        const designFrame = { x: 0, y: 0, width: dw, height: dh }, screenFrame = { x: 0, y: 0, width, height };
        const spans = (m0, m1, size, frame) => size > 0 && frame > 0 && Math.abs(m0) <= frame * SPAN && Math.abs(m1) <= frame * SPAN;
        // One axis of one node: where it starts and how long it is in the new frame.
        const place = (p0, size, f0, fsize, F0, Fsize, framed) => {
            const m0 = p0 - f0, m1 = f0 + fsize - (p0 + size);
            if (framed) return [F0 + (Fsize - fsize) / 2 + m0, size];
            if (!(fsize > 0)) return [F0 + m0, size];
            if (spans(m0, m1, size, fsize)) return [F0 + m0, Math.max(0, Fsize - m0 - m1)];
            if (Math.abs(m0 - m1) <= Math.max(2, fsize * NEAR)) return [F0 + (Fsize - size) / 2 + (m0 - m1) / 2, size];
            return m0 <= m1 ? [F0 + m0, size] : [F0 + Fsize - m1 - size, size];
        };
        const solve = (node, trail) => {
            if (after.has(node.id)) return;
            const parent = byId.get(node.parent);
            let from = designFrame, to = screenFrame, root = true;
            if (parent && parent !== node && !trail.has(node.id)) {
                trail.add(node.id);
                solve(parent, trail);
                from = before.get(parent.id); to = after.get(parent.id); root = false;
            }
            const a = anchors[node.anchor] || [0, 0];
            const w = Math.max(0, Number(node.width) || 0), h = Math.max(0, Number(node.height) || 0);
            const rect = { x: from.x + from.width * a[0] - w * a[0] + (Number(node.x) || 0), y: from.y + from.height * a[1] - h * a[1] + (Number(node.y) || 0), width: w, height: h };
            before.set(node.id, rect);
            // An offset from something that moves (the acting actor's row, a battler) is not a place on the screen.
            if (node.type === "battleCursor" || (node.type === "battleWindow" && node.followActor)) {
                after.set(node.id, { x: to.x + rect.x - from.x, y: to.y + rect.y - from.y, width: w, height: h, keep: true });
                return;
            }
            const wide = spans(rect.x - from.x, from.x + from.width - rect.x - w, w, from.width);
            const tall = spans(rect.y - from.y, from.y + from.height - rect.y - h, h, from.height);
            const framed = root && mode === "scene" && !(wide && tall);
            const [x, fw] = place(rect.x, w, from.x, from.width, to.x, to.width, framed);
            const [y, fh] = place(rect.y, h, from.y, from.height, to.y, to.height, framed);
            after.set(node.id, { x, y, width: fw, height: fh, to, a });
        };
        for (const node of list) solve(node, new Set());
        if (strict) {
            // Nothing that stood inside its parent leaves it, and no two neighbours that stood apart now touch.
            const inside = (r, f) => r.x >= f.x - 1 && r.y >= f.y - 1 && r.x + r.width <= f.x + f.width + 1 && r.y + r.height <= f.y + f.height + 1;
            const apart = (p, q) => p.x + p.width <= q.x + 1 || q.x + q.width <= p.x + 1 || p.y + p.height <= q.y + 1 || q.y + q.height <= p.y + 1;
            const frameOf = (node, map, whole) => { const parent = byId.get(node.parent); return parent && parent !== node && map.has(parent.id) ? map.get(parent.id) : whole; };
            for (let i = 0; i < list.length; i++) {
                const node = list[i], was = before.get(node.id), now = after.get(node.id);
                if (!now || now.keep) continue;
                if (inside(was, frameOf(node, before, designFrame)) && !inside(now, frameOf(node, after, screenFrame))) return null;
                for (let j = i + 1; j < list.length; j++) {
                    const other = list[j], then = after.get(other.id);
                    if (!then || then.keep || (other.parent || 0) !== (node.parent || 0)) continue;
                    if (apart(was, before.get(other.id)) && !apart(now, then)) return null;
                }
            }
        }
        const fitted = list.map(node => {
            const rect = after.get(node.id);
            if (!rect || rect.keep) return node;
            const w = node.width > 0 ? Math.round(rect.width) : 0, h = node.height > 0 ? Math.round(rect.height) : 0;
            return Object.assign({}, node, {
                x: Math.round(rect.x - (rect.to.x + rect.to.width * rect.a[0] - rect.width * rect.a[0])),
                y: Math.round(rect.y - (rect.to.y + rect.to.height * rect.a[1] - rect.height * rect.a[1])),
                width: w, height: h
            });
        });
        return { scale, width, height, nodes: fitted };
      }
    }
    // </interface-fit>

    ReactorUI.fitInterfaceNodes = fitInterfaceNodes;

    /** The size a record was designed for: { width, height }, or null when it does not say. */
    ReactorUI.normalizeDesign = function(raw) {
        const width = Math.round(Number(raw && raw.width) || 0), height = Math.round(Number(raw && raw.height) || 0);
        return width >= 160 && height >= 120 && width <= 16384 && height <= 16384 ? { width, height } : null;
    };

    /**
     * Fits a normalized record to the screen it runs on (or to `screen`, for a preview). A record that names no
     * design size, or whose design size is the screen's, is returned as it is: `fit` stays null and nothing in
     * its layout changes. Otherwise its nodes are placed in the screen's frame in the record's own units and
     * `fit` says how large to show them: every window is made at its designed size and shown at `fit.scale`,
     * so text, padding and line height shrink or grow together.
     */
    ReactorUI.fitRecord = function(record, screen) {
        record.fit = null;
        if (!record.design) return record;
        const target = screen || (typeof Graphics !== "undefined" && Number(Graphics.width) > 0 && Number(Graphics.height) > 0
            ? { width: Graphics.width, height: Graphics.height } : null);
        const font = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.advanced ? Number($dataSystem.advanced.fontSize) || 26 : 26;
        // A Victory record keeps its layers together in the middle of the screen, as a scene does.
        const fit = target ? fitInterfaceNodes(record.nodes, record.design, target, record.mode === "victory" ? "scene" : record.mode, this.ANCHORS, font) : null;
        if (!fit) return record;
        record.nodes = fit.nodes;
        record.fit = { scale: fit.scale, width: fit.width, height: fit.height };
        return record;
    };

    /** How large a node window is shown: 1 unless its record was fitted to another screen. */
    ReactorUI.shownScale = function(window) {
        return window && window._uiFitScale > 0 ? window._uiFitScale : 1;
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
                const fn = this.compileCondition(condition.script);
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
    ReactorUI._conditionCache = new Map();
    ReactorUI.compileCondition = function(source) {
        if (this._conditionCache.has(source)) return this._conditionCache.get(source);
        let fn;
        try {
            fn = new Function("scene", "return (\n" + String(source).trim().replace(/;+$/, "") + "\n);");
        } catch (_) {
            // Explicit return statements and multi-line bodies remain valid.
            fn = this.compileScript(source);
        }
        this._conditionCache.set(source, fn);
        return fn;
    };
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
                if (Window_StatusBase.rrShowsModelCharacter && Window_StatusBase.rrShowsModelCharacter(actor)) return;
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
        for (const scene of SceneManager._stack) if (this.isInterfaceClass(scene)) depth++;
        if (depth >= this.MAX_NESTING) {
            console.warn("ReactorUI: interface nesting limit reached");
            return false;
        }
        // Called over an open interface (by its action, a plugin or a script), that one comes back when this closes.
        const current = SceneManager._scene;
        if (current instanceof Scene_ReactorUI && !current._closing) current.rememberForPush();
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

    /**
     * The class as the game made it: the PIXI 8 compatibility layer replaces
     * each window class on `window` with one that builds the real PIXI
     * container (MZGlobalUpgrade), and the names in this file still hold the
     * originals, which build a stand-in and copy it over (half a millisecond
     * a window as an Action battle starts). The original where there is no
     * replacement.
     */
    const built = cls => {
        const made = typeof globalThis !== "undefined" ? globalThis[cls.name] : null;
        return typeof made === "function" && made !== cls && made.prototype === cls.prototype ? made : cls;
    };
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
        return (node.type === "box" || node.type === "button" || node.type === "input") && node.fill === "window";
    };

    Window_ReactorUINode.prototype.updatePadding = function() {
        this.padding = this.usesSkin() ? $gameSystem.windowPadding() : 0;
    };

    Window_ReactorUINode.prototype.updateBackOpacity = function() {
        this.backOpacity = this.usesSkin() ? $gameSystem.windowOpacity() : 0;
    };

    Window_ReactorUINode.prototype.isFocusable = function() {
        return this._uiNode.type === "button" || this._uiNode.type === "input";
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
        const x = this._uiLayoutX === undefined ? this.x - (this._uiTurnX || 0) : this._uiLayoutX;
        const y = this._uiLayoutY === undefined ? this.y - (this._uiTurnY || 0) : this._uiLayoutY;
        // An Angle turns the node about its center; x and y stay its top-left corner unturned.
        const angle = this._uiNode.angle || 0;
        if (angle || this.rotation) {
            this.pivot.set(angle ? this.width / 2 : 0, angle ? this.height / 2 : 0);
            this.rotation = angle * Math.PI / 180;
        }
        this._uiTurnX = angle ? this.width / 2 * this.scale.x : 0;
        this._uiTurnY = angle ? this.height / 2 * this.scale.y : 0;
        this.x = x + style.offsetX + (this._uiTransitionX || 0) + this._uiTurnX;
        this.y = y + style.offsetY + (this._uiTransitionY || 0) + this._uiTurnY;
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

    Window_ReactorUINode.prototype.labelValue = function() {
        if(this._uiNode.type==='button' && this._uiNode.labelScript) {
            try {
                const value=ReactorUI.compileCondition(this._uiNode.labelScript)?.call(this._uiScene,this._uiScene);
                if(value!=null) return String(value);
            } catch(error) {
                if(this._labelError!==this._uiNode.labelScript) console.warn('ReactorUI: label expression failed',error);
                this._labelError=this._uiNode.labelScript;
            }
        }
        return this._uiNode.text;
    };

    /** The node's text with escape codes resolved, as the game shows it now. */
    Window_ReactorUINode.prototype.currentText = function() {
        const node = this._uiNode;
        if (node.type !== "text" && node.type !== "button") return "";
        return this.convertEscapeCharacters(this.labelValue());
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
            case "sceneActor":
                // The actor a Name Input screen was opened for; the menu actor elsewhere.
                return scene && scene.sceneActor ? scene.sceneActor()
                    : typeof $gameParty !== "undefined" && $gameParty && $gameParty.menuActor ? $gameParty.menuActor() : null;
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
        "date", "partyCharacters", "partyFaces", "existing", "enabled", "cost", "slot", "newValue", "change"];

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
        return source.replace(/\{(key|kind|id|value|name|description|icon|iconIndex|count|playtime|index|paramName|paramValue|price|level|symbol|valueText|title|timestamp|date|partyCharacters|partyFaces|existing|enabled|cost|slot|newValue|change)\}/gi, (match, key) => {
            const field = { iconindex: "iconIndex", paramname: "paramName", paramvalue: "paramValue", valuetext: "valueText",
                partycharacters: "partyCharacters", partyfaces: "partyFaces", newvalue: "newValue" }[key.toLowerCase()] || key.toLowerCase();
            const value = row[field];
            return value == null ? "" : String(value);
        });
    };

    ReactorUI.listRowsSignature = function(rows) {
        return JSON.stringify(rows.map(row => Object.keys(row).filter(key => key !== "data").sort().map(key => [key, row[key]])));
    };

    /** The row selected in the list a node follows (its filterContext), or null. */
    ReactorUI.filterRow = function(node, scene) {
        return node && node.filterContext && scene && scene.context ? scene.context(node.filterContext) : null;
    };

    /** The inventory category a node shows: the chosen category row's, else its own. */
    ReactorUI.filterCategory = function(node, scene) {
        const row = this.filterRow(node, scene);
        if (row && row.kind === "category") return String(row.id);
        return node.filterContext ? "none" : node.category;
    };

    ReactorUI.inCategory = function(item, category) {
        if (!item || category === "none") return false;
        if (category === "all") return true;
        if (typeof DataManager === "undefined") return false;
        if (category === "weapon") return DataManager.isWeapon(item);
        if (category === "armor") return DataManager.isArmor(item);
        if (!DataManager.isItem(item)) return false;
        return category === "keyItem" ? item.itypeId === 2 : item.itypeId === 1;
    };

    ReactorUI.itemKind = function(item) {
        if (typeof DataManager === "undefined") return "item";
        return DataManager.isWeapon(item) ? "weapon" : DataManager.isArmor(item) ? "armor" : DataManager.isSkill && DataManager.isSkill(item) ? "skill" : "item";
    };

    /** A Shop Processing goods entry [type, id, priceType, price] as its database record. */
    ReactorUI.goodsItem = function(good) {
        if (!Array.isArray(good)) return null;
        const table = [window.$dataItems, window.$dataWeapons, window.$dataArmors][good[0]];
        return table ? table[good[1]] || null : null;
    };

    /** A skill's cost the way the stock skill list prints it: TP first, then MP. */
    ReactorUI.skillCostText = function(actor, skill) {
        if (!actor || !skill) return "";
        const tp = actor.skillTpCost ? actor.skillTpCost(skill) : 0;
        const mp = actor.skillMpCost ? actor.skillMpCost(skill) : 0;
        if (tp > 0) return "\\C[29]" + tp + "\\C[0]";
        if (mp > 0) return "\\C[23]" + mp + "\\C[0]";
        return "";
    };

    /**
     * The actor as it would be with the equipment chosen in compareContext,
     * while that list has focus - the stock equip screen's comparison. Null
     * when there is nothing to compare.
     */
    ReactorUI.equipPreviewActor = function(node, scene, actor) {
        if (!node.compareContext || !scene || !scene.context || typeof JsonEx === "undefined") return null;
        const focused = scene.focusedWindow ? scene.focusedWindow() : null;
        if (!focused || !focused.node || focused.node().contextName !== node.compareContext) return null;
        const row = scene.context(node.compareContext);
        if (!row || row.slot === "" || row.slot == null || !actor.forceChangeEquip) return null;
        const preview = JsonEx.makeDeepCopy(actor);
        preview.forceChangeEquip(Number(row.slot) || 0, row.data || null);
        return preview;
    };

    /** Rows for the fixed declarative List sources. */
    ReactorUI.listRows = function(node, scene) {
        const rows = [];
        const add = row => {
            const base = {
                key: String(row.kind || "row") + ":" + String(row.id), kind: "row", id: 0, value: 0,
                name: "", description: "", iconIndex: 0, icon: 0, count: "", enabled: true, data: null,
                playtime: "", paramName: "", paramValue: "", price: "", level: "", actorId: 0,
                symbol: "", valueText: "", title: "", timestamp: "", date: "", partyCharacters: "", partyFaces: "", existing: false,
                cost: "", slot: "", newValue: "", change: ""
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
                const category = this.filterCategory(node, scene);
                const using = node.action && node.action.type === "use";
                for (const item of items.filter(item => this.inCategory(item, category))) {
                    const count = party.numItems ? party.numItems(item) : 0;
                    const kind = this.itemKind(item);
                    add({ key: kind + ":" + item.id, kind, id: item.id, value: item.id, name: item.name,
                        description: item.description || "", iconIndex: item.iconIndex || 0, count, price: item.price || 0, data: item,
                        enabled: using ? !!(party.canUse && party.canUse(item)) : true,
                        defaultText: "\\I[" + (item.iconIndex || 0) + "]{name}  x{count}" });
                }
                break;
            }
            case "shopSell": {
                const party = typeof $gameParty !== "undefined" && $gameParty;
                const items = party && party.allItems ? party.allItems() : [];
                const category = this.filterCategory(node, scene);
                for (const item of items.filter(item => this.inCategory(item, category))) {
                    const kind = this.itemKind(item);
                    const price = Math.floor((item.price || 0) / 2);
                    add({ key: kind + ":" + item.id, kind, id: item.id, value: item.id, name: item.name,
                        description: item.description || "", iconIndex: item.iconIndex || 0, count: party.numItems(item),
                        price, data: item, enabled: (item.price || 0) > 0,
                        defaultText: "\\I[" + (item.iconIndex || 0) + "]{name}  x{count}" });
                }
                break;
            }
            case "shopGoods": {
                const party = typeof $gameParty !== "undefined" && $gameParty;
                const goods = scene && scene.shopGoods ? scene.shopGoods() : [];
                for (const good of goods) {
                    const item = this.goodsItem(good);
                    if (!item || !party) continue;
                    const kind = this.itemKind(item);
                    const price = good[2] === 0 ? item.price || 0 : Number(good[3]) || 0;
                    const count = party.numItems(item);
                    add({ key: kind + ":" + item.id, kind, id: item.id, value: item.id, name: item.name,
                        description: item.description || "", iconIndex: item.iconIndex || 0, count, price, data: item,
                        enabled: price <= party.gold() && count < party.maxItems(item),
                        defaultText: "\\I[" + (item.iconIndex || 0) + "]{name}  {price}" });
                }
                break;
            }
            case "itemCategories": {
                const flags = typeof $dataSystem !== "undefined" && $dataSystem && Array.isArray($dataSystem.itemCategories)
                    ? $dataSystem.itemCategories : [true, true, true, true];
                const terms = typeof TextManager !== "undefined" ? TextManager : {};
                const categories = [["item", terms.item || "Items"], ["weapon", terms.weapon || "Weapons"],
                    ["armor", terms.armor || "Armors"], ["keyItem", terms.keyItem || "Key Items"]];
                categories.forEach(([id, name], index) => {
                    if (flags[index] !== false) add({ key: "category:" + id, kind: "category", id, value: id, name, defaultText: "{name}" });
                });
                break;
            }
            case "skillTypes": {
                const actor = this.resolveActor(node, scene);
                const types = actor && actor.skillTypes ? actor.skillTypes() : [];
                const names = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.skillTypes ? $dataSystem.skillTypes : [];
                for (const id of types) add({ key: "skillType:" + id, kind: "skillType", id, value: id, name: names[id] || "",
                    actorId: actor.actorId ? actor.actorId() : 0, defaultText: "{name}" });
                break;
            }
            case "equipCandidates": {
                const actor = this.resolveActor(node, scene);
                const party = typeof $gameParty !== "undefined" && $gameParty;
                if (!actor || !party || !actor.equipSlots) break;
                const slotRow = this.filterRow(node, scene);
                const slot = slotRow && slotRow.kind === "equipment" ? Number(slotRow.slot) || 0 : 0;
                const etypeId = actor.equipSlots()[slot];
                const changeOk = actor.isEquipChangeOk ? actor.isEquipChangeOk(slot) : true;
                const actorId = actor.actorId ? actor.actorId() : 0;
                for (const item of party.allItems()) {
                    if (!item || item.etypeId !== etypeId || !actor.canEquip(item)) continue;
                    const kind = this.itemKind(item);
                    add({ key: kind + ":" + item.id, kind, id: item.id, value: item.id, actorId, name: item.name,
                        description: item.description || "", iconIndex: item.iconIndex || 0, count: party.numItems(item),
                        price: item.price || 0, slot, data: item, enabled: changeOk,
                        defaultText: "\\I[" + (item.iconIndex || 0) + "]{name}  x{count}" });
                }
                // The empty row takes the slot's equipment off.
                add({ key: "equip:none", kind: "none", id: 0, value: 0, actorId, slot, data: null, enabled: changeOk, defaultText: "" });
                break;
            }
            case "skills": {
                const actor = this.resolveActor(node, scene);
                const skills = actor && actor.skills ? actor.skills() : [];
                const typeRow = this.filterRow(node, scene);
                const skillTypeId = typeRow && typeRow.kind === "skillType" ? Number(typeRow.id) || 0 : node.skillTypeId;
                if (node.filterContext && !typeRow) break;
                for (const skill of skills) {
                    if (skillTypeId > 0 && skill.stypeId !== skillTypeId) continue;
                    add({ key: "skill:" + skill.id, kind: "skill", id: skill.id, value: skill.id, actorId: actor.actorId ? actor.actorId() : 0,
                        name: skill.name, description: skill.description || "", iconIndex: skill.iconIndex || 0, price: skill.mpCost || 0,
                        cost: this.skillCostText(actor, skill),
                        enabled: !actor.canUse || actor.canUse(skill), data: skill, defaultText: "\\I[" + (skill.iconIndex || 0) + "]{name}" });
                }
                break;
            }
            case "actorParameters": {
                const actor = this.resolveActor(node, scene);
                if (!actor) break;
                const preview = this.equipPreviewActor(node, scene, actor);
                for (let id = 0; id < this.ACTOR_PARAMS.length; id++) {
                    const name = typeof TextManager !== "undefined" && TextManager.param ? TextManager.param(id) : this.ACTOR_PARAMS[id].toUpperCase();
                    const value = actor.param ? actor.param(id) : actor[this.ACTOR_PARAMS[id]];
                    let newValue = "", change = "";
                    if (preview) {
                        const next = preview.param(id);
                        change = next - value;
                        newValue = "\\C[" + (change > 0 ? 24 : change < 0 ? 25 : 0) + "]" + next + "\\C[0]";
                    }
                    add({ key: "parameter:" + id, kind: "parameter", id, value, actorId: actor.actorId ? actor.actorId() : 0,
                        name, paramName: name, paramValue: value, newValue, change, data: actor,
                        defaultText: preview ? "{paramName}: {paramValue} \u2192 {newValue}" : "{paramName}: {paramValue}" });
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
                        iconIndex: item && item.iconIndex || 0, price: item && item.price || 0, count: item ? 1 : 0, slot,
                        enabled: actor.isEquipChangeOk ? actor.isEquipChangeOk(slot) : true, data: item, paramName: slotName,
                        valueText: item ? "\\I[" + (item.iconIndex || 0) + "]" + item.name : "", defaultText: item ? "\\I[" + (item.iconIndex || 0) + "]{name}" : "{paramName}: -" });
                }
                break;
            }
            case "actorStates": {
                const actor = this.resolveActor(node, scene);
                const states = actor && actor.states ? actor.states() : [];
                for (const state of states) add({ key: "state:" + state.id, kind: "state", id: state.id, value: state.id,
                    actorId: actor.actorId ? actor.actorId() : 0, name: state.name, description: state.description || state.message3 || state.message1 || "",
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

    /** "Fit text to size" for one plain line (an input's value): shrinks the font until it fits the width. */
    Window_ReactorUINode.prototype.fitLine = function(line, maxWidth) {
        this._uiFontScale = 1;
        this.resetFontSettings();
        const node = this._uiNode;
        if (!node.fitText || !line || this.textWidth(line) <= maxWidth) return;
        const base = node.fontSize > 0 ? node.fontSize : $gameSystem.mainFontSize();
        let low = Math.min(1, ReactorUI.MIN_FONT_SIZE / base), high = 1;
        for (let step = 0; step < 8; step++) {
            const middle = (low + high) / 2;
            this._uiFontScale = middle;
            this.resetFontSettings();
            if (this.textWidth(line) <= maxWidth) low = middle;
            else high = middle;
        }
        this._uiFontScale = low;
        this.resetFontSettings();
    };

    /** The node's text, word-wrapped to the node width when asked to. */
    Window_ReactorUINode.prototype.labelText = function() {
        const node = this._uiNode;
        const value = ReactorUI.resolveActorTokens(this.labelValue(), node, this._uiScene);
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
            case "input": this.drawSurface(); this.drawInput(); this.drawFocus(); break;
        }
        this.syncVisualState();
        this._uiLastText = this.currentText();
    };

    //-------------------------------------------------------------------------
    // Text input: a field that edits a variable or an actor's name. Typing
    // goes through a hidden HTML input (keyboard layouts, IME, paste); the
    // stock character grid is offered too, for gamepad and touch.

    /** The text the field holds now: its draft while editing, else the stored value. */
    Window_ReactorUINode.prototype.inputValue = function() {
        if (this._uiDraft != null) return this._uiDraft;
        return ReactorUI.readInput(this._uiNode, this._uiScene);
    };

    ReactorUI.readInput = function(node, scene) {
        if (node.inputTarget === "variable") {
            const value = typeof $gameVariables !== "undefined" && $gameVariables ? $gameVariables.value(node.variableId) : "";
            return value === 0 ? "" : String(value == null ? "" : value);
        }
        const actor = this.resolveActor(node, scene);
        if (!actor) return "";
        return String(node.inputTarget === "actorNickname" ? actor.nickname() : actor.name());
    };

    ReactorUI.writeInput = function(node, scene, value) {
        const text = String(value == null ? "" : value).slice(0, node.maxLength);
        if (node.inputTarget === "variable") {
            $gameVariables.setValue(node.variableId, text);
            return true;
        }
        const actor = this.resolveActor(node, scene);
        if (!actor) return false;
        if (node.inputTarget === "actorNickname") actor.setNickname(text); else actor.setName(text);
        return true;
    };

    Window_ReactorUINode.prototype.drawInput = function() {
        const node = this._uiNode;
        const editing = this._uiDraft != null;
        const value = this.inputValue();
        const shown = node.mask ? "\u2022".repeat(value.length) : value;
        const placeholder = !shown && !editing && node.text ? this.convertEscapeCharacters(node.text).replace(/\x1b\w+\[\d*\]/g, "") : "";
        this.fitLine(placeholder || shown + (editing ? "|" : ""), this.contentsWidth() - 8);
        const h = this.contentsHeight();
        const y = Math.max(0, Math.floor((h - this.lineHeight()) / 2));
        if (placeholder) {
            this.changePaintOpacity(false);
            this.drawText(placeholder, 4, y, this.contentsWidth() - 8, node.align);
            this.changePaintOpacity(true);
            return;
        }
        // Plain text: what a player types is never read as escape codes.
        const caret = editing && this._uiCaretOn ? "|" : editing ? " " : "";
        this.drawText(shown + caret, 4, y, this.contentsWidth() - 8, node.align);
    };

    Window_ReactorUINode.prototype.isEditing = function() {
        return this._uiDraft != null;
    };

    Window_ReactorUINode.prototype.beginEdit = function() {
        if (this.isEditing()) return;
        this._uiDraft = ReactorUI.readInput(this._uiNode, this._uiScene).slice(0, this._uiNode.maxLength);
        this._uiInitial = this._uiDraft;
        this._uiCaretOn = true;
        this._uiCaretTimer = 0;
        this.openDomInput();
        this.refresh();
    };

    Window_ReactorUINode.prototype.setDraft = function(text) {
        this._uiDraft = String(text || "").slice(0, this._uiNode.maxLength);
        if (this._uiDom && this._uiDom.value !== this._uiDraft) this._uiDom.value = this._uiDraft;
        this._uiCaretOn = true;
        this._uiCaretTimer = 0;
        this.refresh();
    };

    /** Ends the edit; commit writes the draft and returns true when it was taken. */
    Window_ReactorUINode.prototype.endEdit = function(commit) {
        if (!this.isEditing()) return false;
        const draft = this._uiDraft;
        this._uiDraft = null;
        this.closeDomInput();
        if (typeof Input !== "undefined" && Input.clear) Input.clear();
        const written = commit ? ReactorUI.writeInput(this._uiNode, this._uiScene, draft) : false;
        this.refresh();
        return written;
    };

    Window_ReactorUINode.prototype.openDomInput = function() {
        if (typeof document === "undefined" || !document.body) return;
        const dom = document.createElement("input");
        dom.type = "text";
        dom.maxLength = this._uiNode.maxLength;
        dom.value = this._uiDraft;
        dom.setAttribute("autocomplete", "off");
        dom.setAttribute("aria-label", this._uiNode.name || "Text input");
        dom.style.cssText = "position:fixed;left:-10000px;top:0;width:200px;opacity:0;";
        // The game's Input listens on the document and cancels Backspace,
        // arrows and Tab; keys typed here stop at the field.
        // With the character grid up, the keys that drive it (arrows, OK,
        // cancel, page) go on to the game's Input as on the stock screen.
        const gridKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "PageUp", "PageDown", "Shift"];
        const keydown = event => {
            if (this._uiScene._characterGrid && gridKeys.includes(event.key)) { event.preventDefault(); return; }
            event.stopPropagation();
            if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); this._uiScene.commitInput(this); }
            else if (event.key === "Escape") { event.preventDefault(); this._uiScene.cancelInput(this); }
        };
        dom.addEventListener("keydown", keydown);
        // Key releases go on to the game: a movement key held as the field opened and let go
        // while typing stayed down for the 3D camera, and the player walked on by itself after.
        dom.addEventListener("input", () => this.setDraft(dom.value));
        // Clicking the game canvas takes focus away; typing should still land here.
        dom.addEventListener("blur", () => setTimeout(() => { if (this._uiDom === dom) dom.focus(); }, 0));
        document.body.appendChild(dom);
        this._uiDom = dom;
        dom.focus();
    };

    Window_ReactorUINode.prototype.closeDomInput = function() {
        const dom = this._uiDom;
        this._uiDom = null;
        if (dom && dom.parentNode) dom.parentNode.removeChild(dom);
    };

    Window_ReactorUINode.prototype.destroy = function(options) {
        this.closeDomInput();
        Window_Base.prototype.destroy.call(this, options);
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

    // Isolate atlas tiles before scaling or fractional placement. Canvas filtering
    // otherwise samples neighboring icons, leaving bright seams at tile edges.
    ReactorUI.iconBitmap = function(sheet, index) {
        this._iconTiles ||= new WeakMap();
        let tiles = this._iconTiles.get(sheet);
        if (!tiles) { tiles = new Map(); this._iconTiles.set(sheet, tiles); }
        if (!tiles.has(index)) {
            const w = ImageManager.iconWidth, h = ImageManager.iconHeight;
            const tile = new Bitmap(w, h);
            tile.context.imageSmoothingEnabled = false;
            tile.blt(sheet, index % 16 * w, Math.floor(index / 16) * h, w, h, 0, 0);
            tiles.set(index, tile);
        }
        return tiles.get(index);
    };
    ReactorUI.drawWindowIcon = function(index, x, y) {
        const sheet = ImageManager.loadSystem('IconSet');
        if (sheet.isReady()) {
            const tile = ReactorUI.iconBitmap(sheet, index);
            this.contents.blt(tile, 0, 0, tile.width, tile.height, x, y);
        } else if (!this._uiWaitingForIcons) {
            this._uiWaitingForIcons = true;
            sheet.addLoadListener(() => { if (!this.destroyed && this.contents) this.refresh(); });
        }
    };
    Window_ReactorUINode.prototype.drawIcon = ReactorUI.drawWindowIcon;

    // Borrow the engine's escape parser without creating an extra window.
    ReactorUI.gaugeLabelRenderer = function(gauge) {
        if (gauge._uiLabelRenderer) return gauge._uiLabelRenderer;
        const renderer = Object.create(Window_Base.prototype);
        Object.defineProperty(renderer, 'contents', { get: () => gauge.bitmap });
        renderer.resetFontSettings = () => gauge.setupLabelFont();
        renderer.calcTextHeight = () => gauge.textHeight();
        renderer.processDrawIcon = function(index, state) {
            const size = Math.min(ImageManager.iconWidth, Math.max(1, gauge.textHeight() - 2));
            if (state.drawing) {
                const bitmap = ImageManager.loadSystem('IconSet');
                if (bitmap.isReady()) {
                    const tile = ReactorUI.iconBitmap(bitmap, index);
                    gauge.bitmap.blt(tile, 0, 0, tile.width, tile.height,
                        state.x + 2, state.y + (gauge.textHeight() - size) / 2, size, size);
                } else if (!gauge._uiWaitingForIcons) {
                    gauge._uiWaitingForIcons = true;
                    bitmap.addLoadListener(() => { if (!gauge.destroyed && gauge.bitmap) gauge.redraw(); });
                }
            }
            state.x += size + 4;
        };
        gauge._uiLabelRenderer = renderer;
        return renderer;
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
            // PIXI 8's Container constructor writes an own `label` string, which
            // shadows Sprite_Gauge.prototype.label() and makes redraw() throw
            // "this.label is not a function" for any gauge that draws its label
            // - taking the whole scene down with it. js/libs/pixi_compat.js
            // deletes such shadows for the global MZ classes it wraps, but this
            // class is created here at runtime and never passes through that
            // wrapper, so it has to clear its own.
            for (const key of Object.keys(this)) {
                if (typeof P[key] === "function") delete this[key];
            }
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
            if (this.label().includes("\\")) return Math.ceil(ReactorUI.gaugeLabelRenderer(this).textSizeEx(this.label()).width);
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
        P.drawLabel = function() {
            if (!this._uiNode.showLabel) return;
            if (!this.label().includes("\\")) { Sprite_Gauge.prototype.drawLabel.call(this); return; }
            this.bitmap.paintOpacity = this.labelOpacity();
            ReactorUI.gaugeLabelRenderer(this).drawTextEx(this.label(), this.labelOutlineWidth() / 2, 0, this.bitmapWidth());
            this.bitmap.paintOpacity = 255;
        };
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
        let bitmap = this._uiBitmap;
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
            bitmap = ReactorUI.iconBitmap(bitmap, node.index);
            sw = bitmap.width;
            sh = bitmap.height;
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
        // Buttons inside a shared title/menu panel have no window fill of
        // their own. They still need the skin's normal selection cursor.
        const cursor = this._uiFocused && !node.focusedFillColor;
        this.setCursorRect(0, 0, cursor ? this.contentsWidth() : 0, cursor ? this.contentsHeight() : 0);
        if (this._uiFocused && node.focusedBorderColor) {
            this.drawBorder(this.contents, ReactorUI.cssColor(node.focusedBorderColor, 255), Math.max(2, node.borderWidth));
        }
    };

    Window_ReactorUINode.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (this.isEditing && this.isEditing() && ++this._uiCaretTimer >= 30) {
            this._uiCaretTimer = 0;
            this._uiCaretOn = !this._uiCaretOn;
            this.refresh();
        }
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
    Window_ReactorUIList.prototype.drawIcon = ReactorUI.drawWindowIcon;

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
        // In a screen that pages actors, Q/W change the actor instead of scrolling a page.
        if (scene && scene.pagesActors && scene.pagesActors()) {
            this.setHandler("pagedown", () => { this._uiScene.nextActor(); this.activate(); });
            this.setHandler("pageup", () => { this._uiScene.previousActor(); this.activate(); });
        }
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
    Window_ReactorUIList.prototype.isFocusable = function() { return this._uiNode.focusable !== false; };
    Window_ReactorUIList.prototype.maxCols = function() { return this._uiNode.columns || 1; };
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
        if (this._uiNode.dataSource === "party") {
            const actor = ReactorUI.actorFromContext(this._uiScene, this._uiNode.contextName);
            if (actor) id = actor.actorId();
        }
        if (this._uiNode.action.type === "saveSlot" && typeof $gameSystem !== "undefined" && $gameSystem) id = $gameSystem.savefileId();
        if (this._uiNode.action.type === "loadSlot" && typeof DataManager !== "undefined" && DataManager.latestSavefileId) id = DataManager.latestSavefileId();
        const index = id == null ? -1 : this._uiRows.findIndex(row => row.id === id);
        return index >= 0 ? index : 0;
    };
    Window_ReactorUIList.prototype.publishSelection = function() {
        if (this._uiScene && this._uiScene.setContext) this._uiScene.setContext(this._uiNode.contextName, this.selectedRow());
    };
    Window_ReactorUIList.prototype.select = function(index) {
        const previous = this.index();
        Window_Selectable.prototype.select.call(this, index);
        // A text row's highlight is painted with the row, not drawn as a
        // cursor, so moving the selection repaints (the surface under the
        // rows may be a fill, so the whole list rather than two rows).
        if (previous !== index && this._uiFocused && this._uiNode.rowLayout !== "actorPanel" && this.contents) this.paint();
        this.publishSelection();
    };
    Window_ReactorUIList.prototype.isCurrentItemEnabled = function() {
        const row = this.selectedRow();
        if(this._uiScene?._actorSelection?.action.type==='formation'
            && (!$gameSystem.isFormationEnabled() || !row?.data?.isFormationChangeOk())) return false;
        return this._uiEnabled && !!row && row.enabled !== false;
    };
    Window_ReactorUIList.prototype.itemPadding = function() { return 8; };
    Window_ReactorUIList.prototype.playOkSound = function() {
        const type = this._uiNode.action && this._uiNode.action.type;
        // Workflows play their own sound once they know whether the row can be used.
        if (!this._uiNode.se && !["optionChange", "saveSlot", "loadSlot", "use", "equip", "shopBuy", "shopSell"].includes(type)) SoundManager.playOk();
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
        if(this._uiScene?._actorSelection?.pending && this._uiScene._actorSelection.pending===this._uiRows[index]?.data) {
            const r=this.itemRect(index); this.contentsBack.fillRect(r.x,r.y,r.width,r.height,ColorManager.pendingColor());
        }
        if (this._uiFocused && index === this.index() && (this._uiNode.rowLayout !== "actorPanel" || this._uiNode.focusedFillColor)) {
            const rect = this.itemRect(index);
            const color = this._uiNode.focusedFillColor || this._uiNode.highlightColor;
            const alpha = this._uiNode.focusedFillColor ? 255 : 96;
            this.contentsBack.fillRect(rect.x, rect.y, rect.width, rect.height, ReactorUI.cssColor(color, alpha));
        }
    };
    /** The actor choosing commands now, or acting now: the one a turn marker points at. */
    ReactorUI.isActiveActor = function(actor) {
        if (!actor || typeof BattleManager === "undefined" || typeof $gameParty === "undefined" || !$gameParty.inBattle()) return false;
        return (BattleManager.actor && BattleManager.actor() === actor) || BattleManager._subject === actor;
    };

    /** Whether a panel draws its portrait as an animated sprite rather than into the row. */
    ReactorUI.spritePortrait = function(node) {
        return !!(node.portraitMotion || node.portraitBreath || node.portraitSource === "picture" || node.portraitFrames === 5);
    };

    /** Parts that change every frame live in sprites over the row, so the row itself is not repainted. */
    ReactorUI.isSpriteElement = function(node, element) {
        if (element.kind === "portrait") return this.spritePortrait(node);
        if (element.kind === "gauge" && (element.gauge === "atb" || (element.meterImage && element.meterRows === 2))) return true;
        return element.kind === "image";
    };

    /**
     * A HUD picture by reference: "system/Name" (or any img/ folder before
     * the slash), else img/pictures. Loaded outside ImageManager's cache, so
     * a missing file leaves the drawn fallback instead of stopping the game
     * with a load error; a project without the HUD's art still plays.
     */
    ReactorUI._softImages = new Map();
    ReactorUI.softImage = function(ref) {
        const text = String(ref || "").trim();
        if (!text) return null;
        if (this._softImages.has(text)) return this._softImages.get(text);
        const slash = text.indexOf("/");
        const folder = slash > 0 ? text.slice(0, slash) : "pictures";
        const name = slash > 0 ? text.slice(slash + 1) : text;
        const bitmap = Bitmap.load("img/" + folder + "/" + Utils.encodeURI(name) + ".png");
        this._softImages.set(text, bitmap);
        return bitmap;
    };

    /** Whether a soft image failed to load (the caller draws its fallback). */
    ReactorUI.softFailed = function(bitmap) {
        // A missing file is loaded as a blank stand-in after its retries, which is not art either.
        return !bitmap || !!(bitmap.isError && bitmap.isError()) || !!bitmap._degradedToBlank;
    };

    ReactorUI.whenReady = function(bitmap, redraw) {
        if (this.softFailed(bitmap)) return false;
        if (bitmap.isReady()) return true;
        if (!bitmap._rrRedraws) {
            bitmap._rrRedraws = [];
            const settle = () => {
                const redraws = bitmap._rrRedraws;
                bitmap._rrRedraws = null;
                if (redraws) for (const fn of redraws) fn();
            };
            bitmap.addLoadListener(settle);
            // A picture that fails calls no load listener; its parts redraw then, with their fallback.
            const watch = () => {
                if (!bitmap._rrRedraws) return;
                if (bitmap.isError && bitmap.isError()) settle();
                else setTimeout(watch, 100);
            };
            setTimeout(watch, 100);
        }
        if (bitmap._rrRedraws && !bitmap._rrRedraws.includes(redraw)) bitmap._rrRedraws.push(redraw);
        return false;
    };

    /** A meter picture cut to the rate, stretched to the part's box. */
    /**
     * A meter picture cut to the rate and stretched to the part's box. A
     * two-row picture (MOG's) holds the meter on top and the damage trail
     * underneath; the trail is drawn at `trail` first. Returns false when the
     * picture is missing, so the caller can draw the plain gauge instead.
     */
    ReactorUI.drawImageMeter = function(bitmap, r, file, rate, redraw, rows, trail) {
        const image = this.softImage(file);
        if (this.softFailed(image)) return false;
        if (!this.whenReady(image, redraw)) return true;
        const bands = rows === 2 ? 2 : 1, ch = Math.floor(image.height / bands);
        const cut = (value, row) => {
            value = Math.max(0, Math.min(1, Number(value) || 0));
            const sw = Math.floor(image.width * value);
            if (sw > 0) bitmap.blt(image, 0, row * ch, sw, ch, r.x, r.y, Math.round(r.width * value), r.height);
        };
        if (bands === 2 && trail > rate) cut(trail, 1);
        cut(rate, 0);
        return true;
    };

    /** Digits from a sheet of ten (0-9) side by side, scaled to the part's height; other characters leave a gap. */
    ReactorUI.drawImageNumber = function(bitmap, r, file, text, align, redraw) {
        const sheet = this.softImage(file);
        if (this.softFailed(sheet)) return false;
        if (!this.whenReady(sheet, redraw)) return true;
        const cw = Math.floor(sheet.width / 10), ch = sheet.height;
        if (!(cw > 0)) return;
        const scale = r.height / ch, dw = Math.round(cw * scale);
        const chars = String(text).split("");
        const width = chars.length * dw;
        let x = r.x + (align === "right" ? r.width - width : align === "center" ? (r.width - width) / 2 : 0);
        for (const c of chars) {
            const digit = c.charCodeAt(0) - 48;
            if (digit >= 0 && digit <= 9) bitmap.blt(sheet, digit * cw, 0, cw, ch, Math.round(x), r.y, dw, r.height);
            x += dw;
        }
        return true;
    };

    //-------------------------------------------------------------------------
    // Portrait reactions: a hit shakes the face, healing and acting zoom it,
    // and a sheet of five frames shows normal, healed, acting, hurt (also
    // below 30% HP) and dead, as MOG's battle HUD does.

    ReactorUI._faceEvents = new WeakMap();
    ReactorUI.FACE_EVENTS = { hurt: { frame: 3, time: 60 }, heal: { frame: 1, time: 70 }, act: { frame: 2, time: 70 } };

    ReactorUI.faceEvent = function(actor, kind) {
        if (actor && this.FACE_EVENTS[kind]) this._faceEvents.set(actor, { kind, timer: this.FACE_EVENTS[kind].time, frame: Graphics.frameCount });
    };

    /** The portrait's frame and motion for an actor now; timers run down once a frame. */
    ReactorUI.faceState = function(actor) {
        const event = this._faceEvents.get(actor);
        if (event && event.frame !== Graphics.frameCount) { event.frame = Graphics.frameCount; event.timer--; }
        if (event && event.timer > 0) {
            const time = this.FACE_EVENTS[event.kind].time;
            const t = 1 - event.timer / time;
            return { frame: this.FACE_EVENTS[event.kind].frame, shake: event.kind === "hurt" ? Math.random() * 12 - 6 : 0,
                zoom: event.kind === "hurt" ? 1 : 1 + 0.25 * Math.sin(Math.PI * t) };
        }
        if (event) this._faceEvents.delete(actor);
        const frame = actor.isDead() ? 4 : actor.hp <= actor.mhp * 0.3 ? 3 : 0;
        return { frame, shake: 0, zoom: 1 };
    };

    if (typeof Game_Actor !== "undefined") {
        const inBattle = () => typeof $gameParty !== "undefined" && $gameParty && $gameParty.inBattle();
        const _performDamage = Game_Actor.prototype.performDamage;
        Game_Actor.prototype.performDamage = function() {
            _performDamage.apply(this, arguments);
            if (inBattle()) ReactorUI.faceEvent(this, "hurt");
        };
        const _performRecovery = Game_Battler.prototype.performRecovery;
        Game_Battler.prototype.performRecovery = function() {
            _performRecovery.apply(this, arguments);
            if (inBattle() && this.isActor && this.isActor()) ReactorUI.faceEvent(this, "heal");
        };
        const _performActionStart = Game_Actor.prototype.performActionStart;
        Game_Actor.prototype.performActionStart = function() {
            _performActionStart.apply(this, arguments);
            if (inBattle()) ReactorUI.faceEvent(this, "act");
        };
    }

    /** An actor's time gauge in a time-progress battle (0 to 1), else 0. */
    ReactorUI.atbRate = function(actor) {
        if (!actor || typeof BattleManager === "undefined" || !BattleManager.isTpb || !BattleManager.isTpb() || !actor.tpbChargeTime) return 0;
        return Math.max(0, Math.min(1, actor.tpbChargeTime()));
    };

    ReactorUI.actorGaugeData = function(actor, key, element = {}) {
        if(key==='atb') {
            const rate=this.atbRate(actor);
            return {value:Math.round(rate*100),max:100,rate,label:'',color:ColorManager.ctGaugeColor1?ColorManager.ctGaugeColor1():'#a0a0ff',color2:ColorManager.ctGaugeColor2?ColorManager.ctGaugeColor2():'#c0c0ff'};
        }
        if(key==='variable') {
            const value=Number($gameVariables.value(element.variableId)) || 0;
            const max=element.maxVariableId?Number($gameVariables.value(element.maxVariableId)) || 0:element.max || 100;
            return {value,max,rate:max>0?Math.max(0,Math.min(1,value/max)):0,label:'',color:ColorManager.textColor(14),color2:ColorManager.textColor(6)};
        }
        if(!['hp','mp','tp','exp'].includes(key)) {
            const value=Number(actor[key]) || 0,max=element.max || 100;
            return {value,max,rate:Math.max(0,Math.min(1,value/max)),label:key.toUpperCase(),color:ColorManager.textColor(14),color2:ColorManager.textColor(6)};
        }
        const exp=key==='exp';
        const value=exp?(actor.isMaxLevel()?1:actor.currentExp()-actor.currentLevelExp()):actor[key];
        const max=exp?(actor.isMaxLevel()?1:actor.nextLevelExp()-actor.currentLevelExp()):key==='tp'?actor.maxTp():actor['m'+key];
        return {value,max,rate:Math.max(0,Math.min(1,value/Math.max(1,max))),label:TextManager[key+'A'],
            color:exp?ColorManager.textColor(14):ColorManager[key+'GaugeColor1'](),
            color2:exp?ColorManager.textColor(6):ColorManager[key+'GaugeColor2']()};
    };
    Window_ReactorUIList.prototype.drawActorPanelRow = function(actor, rect) {
        if (!actor) return;
        this.resetFontSettings();
        // Behind parts go on the back layer, under the portrait sprites; the rest on the front.
        this.drawActorPanelParts(actor, rect, this.contentsBack, true);
        this.drawActorPanelParts(actor, rect, this.contents, false);
    };

    Window_ReactorUIList.prototype.drawActorPanelParts = function(actor, rect, bitmap, behind) {
        const node=this._uiNode, ctx=bitmap.context;
        bitmap.fontSize=this.contents.fontSize;
        const elements=ReactorUI.actorPanelLayout(node,rect.width,rect.height,bitmap.fontSize);
        const active=ReactorUI.isActiveActor(actor);
        // Parts marked Behind draw first; animated parts (sprite portraits,
        // the ATB bar, turning pictures) live in the sprite layer instead.
        const ordered=Object.values(elements).filter(element=>!!element.behind===behind);
        ctx.save(); ctx.beginPath(); ctx.rect(rect.x,rect.y,rect.width,rect.height); ctx.clip();
        for(const element of ordered) {
            if(!element.visible || (element.onlyActive && !active) || ReactorUI.isSpriteElement(node,element)) continue;
            const r={x:rect.x+element.x,y:rect.y+element.y,width:element.width,height:element.height};
            ctx.save(); ctx.beginPath(); ctx.rect(r.x,r.y,r.width,r.height); ctx.clip();
            if(element.kind==='portrait') {
                const face=ImageManager.loadFace(actor.faceName());
                this._actorFaceLoads ||= new Set();
                if(!face.isReady() && !this._actorFaceLoads.has(face)) {
                    this._actorFaceLoads.add(face);
                    face.addLoadListener(()=>{if(!this.destroyed && this.contents) this.refresh();});
                }
                ctx.translate(r.x,r.y);
                ctx.scale(r.width/ImageManager.faceWidth,r.height/ImageManager.faceHeight);
                Window_StatusBase.prototype.drawActorFace.call(this,actor,0,0,ImageManager.faceWidth,ImageManager.faceHeight);
            } else if(element.kind==='states') {
                const sheet=ImageManager.loadSystem('IconSet');
                if(!sheet.isReady()) {
                    if(!this._uiWaitingForIcons) {this._uiWaitingForIcons=true;sheet.addLoadListener(()=>{if(!this.destroyed&&this.contents)this.refresh();});}
                } else {
                    const size=Math.min(element.iconSize,r.height), gap=element.iconGap;
                    let icons=actor.allIcons();
                    // Cycle: one icon at a time, a second each.
                    if(element.statesMode==='cycle' && icons.length>1) icons=[icons[Math.floor(Graphics.frameCount/60)%icons.length]];
                    const count=Math.max(0,Math.floor((r.width+gap)/(size+gap)));
                    icons.slice(0,count).forEach((id,index)=>{const tile=ReactorUI.iconBitmap(sheet,id);bitmap.blt(tile,0,0,tile.width,tile.height,r.x+index*(size+gap),r.y,size,size);});
                }
            } else if(element.kind==='box') {
                ReactorUI.drawActorGauge(ctx,r,element,1,[element.color||'#30343c',element.color2||element.color||'#30343c','#30343c']);
            } else {
                const data=element.gauge?ReactorUI.actorGaugeData(actor,element.gauge,element):null;
                const numberText=!data?'':element.valueFormat==='percent'?String(Math.round(data.rate*100)):element.valueFormat==='current'?String(data.value):data.value+'/'+data.max;
                if(element.kind==='gauge' && element.meterImage && ReactorUI.drawImageMeter(bitmap,r,element.meterImage,data.rate,()=>this.refresh(),element.meterRows,data.rate)) {
                    // drawn from the picture
                } else if(element.kind==='gauge') {
                    ReactorUI.drawActorGauge(ctx,r,element,data.rate,[data.color,data.color2,ColorManager.gaugeBackColor()]);
                } else if(element.kind==='value' && element.numberImage && ReactorUI.drawImageNumber(bitmap,r,element.numberImage,numberText,element.align,()=>this.refresh())) {
                    // drawn from the digit sheet
                } else {
                    let label=element.kind==='value'?(element.valueFormat==='percent'?Math.round(data.rate*100)+'%':element.valueFormat==='current'?String(data.value):data.value+' / '+data.max)
                        :element.kind==='label'?(element.text||data.label):element.text;
                    label=String(label).replace(/\{levelLabel\}/g,TextManager.levelA).replace(/\{actor\.([^}]+)\}/gi,(_,key)=>ReactorUI.actorTextValue(actor,key));
                    // Keep fonts and icons inside the element's own rectangle;
                    // drawTextEx on the list itself resets the authored font.
                    const renderer=ReactorUI.gaugeLabelRenderer({bitmap,textHeight:()=>r.height,
                        setupLabelFont:()=>{this.resetFontSettings(); bitmap.fontSize=element.fontSize; if(element.color) bitmap.textColor=element.color;},
                        redraw:()=>this.refresh()});
                    const measured=renderer.textSizeEx(label).width;
                    const x=r.x+(element.align==='right'?Math.max(0,r.width-measured):element.align==='center'?Math.max(0,(r.width-measured)/2):0);
                    renderer.drawTextEx(label,x,r.y,r.width);
                }
            }
            ctx.restore();
        }
        ctx.restore(); touch(bitmap);
    };

    Window_ReactorUIList.prototype.drawItem = function(index) {
        const row = this._uiRows[index];
        if (!row) return;
        if (this._uiNode.rowLayout === "actorPanel") { this.drawActorPanelRow(row.data, this.itemRect(index)); return; }
        const rect = this.itemLineRect(index);
        this.resetFontSettings();
        const node = this._uiNode;
        const rowState = !this._uiEnabled || row.enabled === false ? "disabled"
            : this._uiFocused && index === this.index() ? "focused" : "base";
        const override = ReactorUI.controlStyle(node, rowState).textColor;
        this.changeTextColor(override || (isHexColor(node.textColor) ? node.textColor : ColorManager.textColor(node.textColor)));
        this.changePaintOpacity(this._uiEnabled && row.enabled !== false);
        if (!this._uiEnabled || row.enabled === false) this.contents.paintOpacity = node.disabledOpacity === "" ? ReactorUI.DISABLED_OPACITY : node.disabledOpacity;
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
        if (this._uiCursorAll && this._uiFocused && this.maxItems() > 0) {
            const last = this.itemRect(this.maxItems() - 1);
            this.setCursorRect(0, 0, this.innerWidth, Math.min(this.innerHeight, last.y + last.height));
            return;
        }
        if (this._uiNode.rowLayout === "actorPanel" && this._uiFocused && !this._uiNode.focusedFillColor && this.index() >= 0) {
            const rect = this.itemRect(this.index());
            this.setCursorRect(rect.x, rect.y, rect.width, rect.height);
        } else this.setCursorRect(0, 0, 0, 0);
    };
    ReactorUI.actorPanelRevision = function(node, rows) {
        const variables=new Set();
        for(const element of Object.values(node.actorElements || {})) {
            if(element.gauge==='variable') {variables.add(element.variableId);variables.add(element.maxVariableId);}
            for(const match of String(element.text || '').matchAll(/\\V\[(\d+)\]/gi)) variables.add(Number(match[1]));
        }
        const cycling=Object.values(node.actorElements || {}).some(element=>element.statesMode==='cycle');
        return JSON.stringify([rows.map(row=>{
            const a=row.data;
            return [a.hp,a.mp,a.tp,a.mhp,a.mmp,a.currentExp?.(),a.currentClass?.()?.name,a.allIcons?.(),
                ...['mhp','mmp','atk','def','mat','mdf','agi','luk'].map(key=>a[key]),ReactorUI.isActiveActor(a)];
        }),[...variables].filter(Boolean).map(id=>$gameVariables.value(id)),cycling?Math.floor(Graphics.frameCount/60):0]);
    };
    //-------------------------------------------------------------------------
    // Actor Panel sprite layer: portraits with reactions, ATB bars and turning
    // pictures, over the row backgrounds and under the row text, moved and
    // redrawn per frame without repainting the rows.

    Window_ReactorUIList.prototype.panelSpriteElements = function() {
        const node = this._uiNode;
        if (node.rowLayout !== "actorPanel" || !this._uiRows.length) return [];
        const rect = this.itemRect(0);
        const key = rect.width + "x" + rect.height + ":" + this.contents.fontSize + ":" + JSON.stringify(node.actorElements || {});
        if (key !== this._uiPanelLayoutKey) {
            this._uiPanelLayoutKey = key;
            const elements = ReactorUI.actorPanelLayout(node, rect.width, rect.height, this.contents.fontSize);
            this._uiPanelSpriteElements = Object.entries(elements).filter(([, element]) => element.visible && ReactorUI.isSpriteElement(node, element))
                .sort((a, b) => Number(!!b[1].behind) - Number(!!a[1].behind));
        }
        return this._uiPanelSpriteElements;
    };

    Window_ReactorUIList.prototype.panelLayer = function() {
        if (!this._uiPanelLayer) {
            this._uiPanelLayer = new Sprite();
            this._uiPanelSprites = new Map();
            const area = this._clientArea;
            const back = area ? area.children.indexOf(this._contentsBackSprite) : -1;
            if (area) area.addChildAt(this._uiPanelLayer, back + 1);
            else this.addChild(this._uiPanelLayer);
        }
        return this._uiPanelLayer;
    };

    Window_ReactorUIList.prototype.updatePanelSprites = function() {
        const elements = this.panelSpriteElements();
        if (!elements.length && !this._uiPanelLayer) return;
        const layer = this.panelLayer();
        const node = this._uiNode;
        const seen = new Set();
        this._uiRows.forEach((row, index) => {
            const actor = row.data;
            if (!actor) return;
            const rect = this.itemRect(index);
            const active = ReactorUI.isActiveActor(actor);
            for (const [key, element] of elements) {
                const id = (actor.actorId ? actor.actorId() : index) + ":" + key;
                seen.add(id);
                let sprite = this._uiPanelSprites.get(id);
                if (!sprite) {
                    sprite = new Sprite();
                    sprite._rrKind = element.kind === "portrait" ? "portrait" : element.kind === "image" ? "image" : "gauge";
                    this._uiPanelSprites.set(id, sprite);
                    layer.addChild(sprite);
                }
                const cx = rect.x + element.x + element.width / 2;
                const cy = rect.y + element.y + element.height / 2;
                sprite.visible = !element.onlyActive || active;
                if (sprite._rrKind === "portrait") this.updatePortraitSprite(sprite, actor, element, cx, cy);
                else if (sprite._rrKind === "image") {
                    if (sprite._rrFile !== element.file) { sprite._rrFile = element.file; sprite.bitmap = element.file ? ReactorUI.softImage(element.file) : null; }
                    if (ReactorUI.softFailed(sprite.bitmap)) sprite.visible = false;
                    sprite.anchor.set(0.5, 0.5);
                    sprite.move(cx, cy);
                    if (element.rotation) sprite.rotation += element.rotation * Math.PI / 180;
                } else this.updateGaugeSprite(sprite, actor, element, rect.x + element.x, rect.y + element.y);
            }
        });
        for (const [id, sprite] of this._uiPanelSprites) {
            if (seen.has(id)) continue;
            layer.removeChild(sprite);
            if (sprite._rrOwnBitmap && sprite.bitmap) sprite.bitmap.destroy();
            this._uiPanelSprites.delete(id);
        }
    };

    Window_ReactorUIList.prototype.updatePortraitSprite = function(sprite, actor, element, cx, cy) {
        const node = this._uiNode;
        const picture = node.portraitSource === "picture";
        const file = picture ? node.portraitPattern.replace(/\{id\}/g, String(actor.actorId())) : actor.faceName();
        if (sprite._rrFile !== file) {
            sprite._rrFile = file;
            sprite.bitmap = picture ? ReactorUI.softImage(file.includes("/") ? file : "pictures/" + file) : ImageManager.loadFace(file);
        }
        const bitmap = sprite.bitmap;
        if (!bitmap || !bitmap.isReady()) return;
        const state = node.portraitMotion || node.portraitFrames === 5 ? ReactorUI.faceState(actor) : { frame: 0, shake: 0, zoom: 1 };
        let fw, fh, fx = 0, fy = 0;
        if (picture) {
            const frames = node.portraitFrames;
            fw = Math.floor(bitmap.width / frames);
            fh = bitmap.height;
            fx = fw * Math.min(frames - 1, frames === 5 ? state.frame : 0);
        } else {
            fw = ImageManager.faceWidth;
            fh = ImageManager.faceHeight;
            const index = actor.faceIndex();
            fx = (index % 4) * fw;
            fy = Math.floor(index / 4) * fh;
        }
        sprite.setFrame(fx, fy, fw, fh);
        const fit = Math.min(element.width / fw, element.height / fh);
        const zoom = node.portraitMotion ? state.zoom : 1;
        let breath = 1;
        if (node.portraitBreath && (state.frame === 0 || state.frame === 3)) breath = 1 + 0.015 * Math.sin(Graphics.frameCount / 24 + actor.actorId());
        // Breathing grows from the feet up; the other motions from the centre.
        sprite.anchor.set(0.5, breath !== 1 ? 1 : 0.5);
        sprite.scale.set(fit * zoom, fit * zoom * breath);
        sprite.move(cx + (node.portraitMotion ? state.shake : 0), breath !== 1 ? cy + fh * fit / 2 : cy);
        // A fallen actor's face goes grey.
        const dead = actor.isDead();
        if (sprite._rrDead !== dead) {
            sprite._rrDead = dead;
            sprite.setColorTone(dead ? [0, 0, 0, 255] : [0, 0, 0, 0]);
        }
    };

    Window_ReactorUIList.prototype.updateGaugeSprite = function(sprite, actor, element, x, y) {
        const w = Math.max(1, Math.round(element.width)), h = Math.max(1, Math.round(element.height));
        if (!sprite.bitmap || sprite.bitmap.width !== w || sprite.bitmap.height !== h) {
            if (sprite._rrOwnBitmap && sprite.bitmap) sprite.bitmap.destroy();
            sprite.bitmap = new Bitmap(w, h);
            sprite._rrOwnBitmap = true;
            sprite._rrRate = -1;
        }
        sprite.move(x, y);
        const data = ReactorUI.actorGaugeData(actor, element.gauge || "atb", element);
        if (element.gauge === "atb") sprite.visible = sprite.visible && typeof BattleManager !== "undefined" && !!BattleManager.isTpb && BattleManager.isTpb();
        const rate = Math.round(data.rate * w) / w;
        // The damage trail falls after the meter, 1% a frame; a rise is instant.
        const trail = sprite._rrTrail == null || rate >= sprite._rrTrail ? rate : Math.max(rate, sprite._rrTrail - 0.01);
        if (rate === sprite._rrRate && trail === sprite._rrTrail) return;
        sprite._rrRate = rate;
        sprite._rrTrail = trail;
        const bitmap = sprite.bitmap;
        bitmap.clear();
        const box = { x: 0, y: 0, width: w, height: h };
        const drawn = element.meterImage && ReactorUI.drawImageMeter(bitmap, box, element.meterImage, rate, () => { sprite._rrRate = -1; }, element.meterRows, trail);
        if (!drawn) ReactorUI.drawActorGauge(bitmap.context, box, element, rate, [data.color, data.color2, ColorManager.gaugeBackColor()]);
        touch(bitmap);
    };

    Window_ReactorUIList.prototype.destroy = function(options) {
        if (this._uiPanelSprites) for (const sprite of this._uiPanelSprites.values()) if (sprite._rrOwnBitmap && sprite.bitmap) sprite.bitmap.destroy();
        Window_Selectable.prototype.destroy.call(this, options);
    };

    Window_ReactorUIList.prototype.update = function() {
        if (this._uiFocused && this._uiScene.acceptsInput()) this.activate();
        else this.deactivate();
        Window_Selectable.prototype.update.call(this);
        if (this._uiNode.rowLayout === "actorPanel") this.updatePanelSprites();
        if (++this._uiRefreshWait < 15) return;
        this._uiRefreshWait = 0;
        const rows = ReactorUI.listRows(this._uiNode, this._uiScene);
        const signature = ReactorUI.listRowsSignature(rows) + (this._uiNode.rowLayout==='actorPanel'?ReactorUI.actorPanelRevision(this._uiNode,rows):'');
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

    /**
     * Whether a class on SceneManager's stack is this scene. pixi_compat wraps
     * the global after this file loads, so the stack holds the wrapper, which
     * shares this prototype.
     */
    ReactorUI.isInterfaceClass = function(sceneClass) {
        return !!sceneClass && sceneClass.prototype === Scene_ReactorUI.prototype;
    };

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
        // Shop Processing prepares the shop scene after the router has
        // prepared this one: its goods arrive as a second prepare.
        if (this._role === "shop" && Array.isArray(interfaceId)) {
            this._shopGoods = interfaceId;
            this._purchaseOnly = !!role;
            return;
        }
        // Name Input prepares (actorId, maxLength) the same way.
        if (this._role === "name" && this._interfaceId > 0) {
            this._nameActorId = Number(interfaceId) || 0;
            this._nameMaxLength = Number(role) || 0;
            return;
        }
        this._interfaceId = Number(interfaceId) || 0;
        this._role = role || "";
    };

    /** Shop Processing's goods, [type, id, priceType, price] each; empty outside a shop. */
    Scene_ReactorUI.prototype.shopGoods = function() {
        return Array.isArray(this._shopGoods) ? this._shopGoods : [];
    };

    Scene_ReactorUI.prototype.isPurchaseOnly = function() {
        return !!this._purchaseOnly;
    };

    /** The actor a Name Input screen was opened for, else the menu actor. */
    Scene_ReactorUI.prototype.sceneActor = function() {
        if (this._nameActorId > 0) return $gameActors.actor(this._nameActorId);
        return typeof $gameParty !== "undefined" && $gameParty && $gameParty.menuActor ? $gameParty.menuActor() : null;
    };

    /** The longest name Name Input allows here, 0 when none was given. */
    Scene_ReactorUI.prototype.nameMaxLength = function() {
        return this._nameMaxLength || 0;
    };

    /** True while a Use action waits for its target in the party panel. */
    Scene_ReactorUI.prototype.isSelectingTarget = function() {
        return !!(this._targetPending || (this._actorSelection && this._actorSelection.action.type === "use"));
    };

    /** The focused control's node id, for conditions such as help text that follows focus. */
    Scene_ReactorUI.prototype.focusedNodeId = function() {
        const focused = this.focusedWindow();
        return focused ? focused.node().id : 0;
    };

    /** Roles whose Q/W (page up/down) change the menu actor, as the stock scenes do. */
    Scene_ReactorUI.prototype.pagesActors = function() {
        return ["status", "skill", "equip"].includes(this._role);
    };

    Scene_ReactorUI.prototype.interfaceId = function() {
        return this._interfaceId;
    };

    Scene_ReactorUI.prototype.context = function(name) {
        return this._contexts.get(String(name || "selection")) || null;
    };

    Scene_ReactorUI.prototype.setContext = function(name, value) {
        const key = String(name || "selection");
        const previous = this._contexts.get(key) || null;
        if (value == null) this._contexts.delete(key);
        else this._contexts.set(key, value);
        // Lists that follow this selection redraw on their next update rather
        // than at their quarter-second poll.
        if ((previous && previous.key) !== (value && value.key)) this.refreshDependents(key);
    };

    Scene_ReactorUI.prototype.refreshDependents = function(name) {
        for (const window of this._nodeWindows || []) {
            const node = window.node();
            if (node.type === "list" && (node.filterContext === name || node.compareContext === name)) window._uiRefreshWait = 15;
        }
    };

    /** Every list re-reads its rows on its next update: after an item is used, equipped, bought or sold. */
    Scene_ReactorUI.prototype.refreshAllLists = function() {
        for (const window of this._nodeWindows) if (window.node().type === "list") window._uiRefreshWait = 15;
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
            contexts: Array.from(this._contexts.entries()), lists,
            shopGoods: this._shopGoods || null, purchaseOnly: !!this._purchaseOnly
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

    /** Keeps this interface's state for when the scene pushed over it pops back; once per push. */
    Scene_ReactorUI.prototype.rememberForPush = function() {
        if (this._pushRemembered) return;
        ReactorUI._resumeStates.push(this.resumeState());
        this._pushRemembered = true;
    };

    /** Takes back the state rememberForPush kept, when the push it was for did not happen. */
    Scene_ReactorUI.prototype.forgetPush = function() {
        if (!this._pushRemembered) return;
        ReactorUI._resumeStates.pop();
        this._pushRemembered = false;
    };

    Scene_ReactorUI.prototype.create = function() {
        if (!this._interfaceId && ReactorUI._resumeStates.length) {
            this._resumeState = ReactorUI._resumeStates.pop();
            this._interfaceId = this._resumeState.interfaceId;
            this._role = this._resumeState.role || "";
            this._contexts = new Map(this._resumeState.contexts || []);
            this._shopGoods = this._resumeState.shopGoods || null;
            this._purchaseOnly = !!this._resumeState.purchaseOnly;
        }
        this._interface = ReactorUI.interface(this._interfaceId);
        if (this._interface && this._interface.openTransition !== "none") this._transitionPhase = "opening";
        Scene_MenuBase.prototype.create.call(this);
        // A Victory record is drawn by the Victory interface itself, over this scene (Playtest Interface).
        if (this._interface && this._interface.mode !== "victory") {
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
        if (this.prepareActorContexts) this.prepareActorContexts();
        // A record fitted to another screen is laid out in its own units and shown at fit.scale.
        const fit = this._interface.fit || null;
        const root = fit ? new Rectangle(0, 0, fit.width, fit.height) : new Rectangle(0, 0, Graphics.width, Graphics.height);
        const onScreen = rect => fit ? new Rectangle(Math.round(rect.x * fit.scale), Math.round(rect.y * fit.scale), Math.round(rect.width * fit.scale), Math.round(rect.height * fit.scale)) : rect;
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
            // Battle Window and Target Cursor nodes steer stock objects; they have no window of their own.
            if (node.type === "battleWindow" || node.type === "battleCursor") {
                (this._battleNodes || (this._battleNodes = [])).push({ node, rect });
                continue;
            }
            // Tactical nodes exist in a Tactical Battle HUD alone: in any other record (a Classic Battle HUD, a scene) they are nothing.
            const tacticalNode = node.type === "fightUnit" || node.type === "fightTurnOrder" || node.type === "fightInfo" || node.type === "fightWindow";
            if (tacticalNode && this._interface.mode !== "tactical") continue;
            // And the Action nodes in an Action or First Person Battle HUD alone. Three of them are sprites, not windows.
            const actionNode = node.type.startsWith("action") && ReactorUI.NODE_TYPES.includes(node.type);
            if (actionNode && this._interface.mode !== "action" && this._interface.mode !== "firstPerson") continue;
            if (node.type === "actionCrosshair" || node.type === "actionBars" || node.type === "actionDamage") {
                (this._actionNodes || (this._actionNodes = [])).push({ node, rect: onScreen(rect) });
                continue;
            }
            // A Tactical Window node places a stock tactical window the same way.
            if (node.type === "fightWindow") {
                (this._fightNodes || (this._fightNodes = [])).push({ node, rect });
                continue;
            }
            // The Victory nodes exist in a Victory record alone.
            const victoryNode = node.type.startsWith("victory") && ReactorUI.NODE_TYPES.includes(node.type);
            if (victoryNode && this._interface.mode !== "victory") continue;
            if (rect.width <= 0 || rect.height <= 0) continue;
            const WindowClass = node.type === "list" ? Window_ReactorUIList
                : node.type === "fightUnit" || node.type === "fightTurnOrder" || node.type === "fightInfo" ? Window_ReactorUIFight
                : actionNode ? Window_ReactorUIAction : victoryNode ? Window_ReactorUIVictory : Window_ReactorUINode;
            const window = new (built(WindowClass))(ReactorUI.windowRect(rect, this, fit), this, node);
            if (fit && window.scale) { window.scale.set(fit.scale, fit.scale); window._uiFitScale = fit.scale; }
            window._uiPhysicalRect = rect;
            window._uiLayoutX = window.x - (window._uiTurnX || 0);
            window._uiLayoutY = window.y - (window._uiTurnY || 0);
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
        const fit = this._interface.fit || null;
        const root = fit ? new Rectangle(0, 0, fit.width, fit.height) : new Rectangle(0, 0, Graphics.width, Graphics.height);
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
            const local = ReactorUI.windowRect(rect, this, fit);
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
            this._measureWindow = new (built(Window_ReactorUINode))(new Rectangle(0, 0, 8, 8), this, node);
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
        if (this._interface.mode === "victory") {
            Victory.preview(this);
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
        if (this._editingWindow) this._editingWindow.endEdit(false);
        Scene_MenuBase.prototype.terminate.call(this);
        if ((this._role === "options" || this._optionsChanged) && typeof ConfigManager !== "undefined" && ConfigManager.save) ConfigManager.save();
        if (this._loadSuccess && typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem.onAfterLoad) $gameSystem.onAfterLoad();
        if (this._role === "title" && SceneManager.snapForBackground) SceneManager.snapForBackground();
    };

    Scene_ReactorUI.prototype.needsCancelButton = function() {
        if (this._role === "title") return false;
        // A record with a Close button of its own needs no touch Back button standing over it.
        const nodes = (this._interface && this._interface.nodes) || [];
        return !nodes.some(node => node.type === "button" && node.action && (node.action.type === "close" || node.action.type === "closeAll"));
    };

    Scene_ReactorUI.prototype.needsPageButtons = function() {
        return this.pagesActors();
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
        return window && (!this._actorSelection || window === this._actorSelection.window) && window.isFocusable() && window.visible;
    };

    Scene_ReactorUI.prototype.acceptsInput = function() {
        return !this._closing && !this._inputHandled && !this._filePending && !this._quantityWindow && !this._editingWindow
            && this._transitionPhase === "idle" && this.isActive();
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
        // Slides come in from the right (or from below) and leave the other way.
        const x = type === "slideLeft" ? Math.round(Graphics.width * (opening ? 1 - progress : -progress)) : 0;
        const y = type === "slideUp" ? Math.round(Graphics.height * (opening ? 1 - progress : -progress)) : 0;
        for (const window of this._nodeWindows) {
            window._uiTransitionAlpha = alpha;
            window._uiTransitionX = x;
            window._uiTransitionY = y;
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

    /** Undoes a close whose next interface could not open: this one shows again and takes input. */
    Scene_ReactorUI.prototype.cancelClose = function() {
        this._closing = false;
        this._transitionPhase = "opening";
        this.applyInterfaceTransition(1);
        this._transitionPhase = "idle";
        const focused = this.focusedWindow();
        if (focused && focused.node().type === "list") focused.activate();
    };

    Scene_ReactorUI.prototype.updateConditions = function() {
        // Runs every frame: the node table is kept per interface, and a parent chain longer than the
        // node count is a cycle (shown as hidden).
        if (this._authoredFor !== this._interface) {
            this._authoredFor = this._interface;
            this._authoredNodes = new Map(this._interface.nodes.map(node => [node.id, node]));
        }
        const authored = this._authoredNodes;
        const shown = node => {
            for (let depth = 0; node && depth <= authored.size; depth++) {
                if (!ReactorUI.evaluateCondition(node.visible, this)) return false;
                const parent = authored.get(node.parent);
                if (!parent || parent === node) return true;
                node = parent;
            }
            return false;
        };
        for (const window of this._nodeWindows) {
            const node = window.node();
            window.visible = shown(node);
            if (node.type === "button" || node.type === "list") window.setEnabled(ReactorUI.evaluateCondition(node.enabled, this));
        }
        const focused = this.focusedWindow();
        if (focused && !this.canFocus(focused)) {
            this.setFocus(this._nodeWindows.findIndex(window => this.canFocus(window)));
        }
    };

    Scene_ReactorUI.prototype.update = function() {
        this._inputHandled = false;
        Scene_MenuBase.prototype.update.call(this);
        if (!this._interface || this._interface.mode === "victory") return;
        this.updateInterfaceTransition();
        if (!this.acceptsInput()) return;
        // A field marked to start typing does so once the interface is up (Name Input, a terminal prompt).
        if (!this._autoEditDone) {
            this._autoEditDone = true;
            const focused = this.focusedWindow();
            if (focused && focused.node().type === "input" && focused.node().autoEdit && focused.isEnabled()) {
                this.beginInput(focused, true);
                return;
            }
        }
        this.updateConditions();
        this.updateTouch();
        if (!this.acceptsInput()) return;
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
        this._inputHandled = true;
        if (!alreadyPlayed) SoundManager.playCancel();
        if (this._actorSelection) { this.endActorSelection(false); return; }
        const focused = this.focusedWindow();
        const back = focused && focused.node().backFocus;
        if (back > 0) {
            const index = this._nodeWindows.findIndex(window => window !== focused && window.node().id === back && this.canFocus(window));
            if (index >= 0) { this.setFocus(index); return; }
        }
        const cancel = this._interface.cancel;
        const stuck = cancel.type === "none" && !this._nodeWindows.some(window => this.canFocus(window) && window.isEnabled());
        this.runAction(stuck ? { type: "close" } : cancel);
    };

    Scene_ReactorUI.prototype.updateInput = function() {
        const focused = this.focusedWindow();
        const listOwnsInput = focused && focused.node().type === "list";
        // A focused list pages actors through its own handlers.
        if (this.pagesActors() && !listOwnsInput && Input.isTriggered("pageup")) {
            this.previousActor();
        } else if (this.pagesActors() && !listOwnsInput && Input.isTriggered("pagedown")) {
            this.nextActor();
        } else if (Input.isTriggered("ok") && !listOwnsInput) {
            this.activateFocused();
        } else if ((Input.isTriggered("cancel") || TouchInput.isCancelled()) && !listOwnsInput) {
            this.cancelInterface();
        } else {
            for (const direction of ["down", "up", "left", "right"]) {
                if (Input.isRepeated(direction)) {
                    if (focused && focused.node().type === "list" && ((direction === "down" || direction === "up")
                        || focused.node().dataSource === "options" || focused.node().columns > 1)) break;
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
        this._inputHandled = true;
        const node = window.node();
        if (!window.isEnabled() || (node.type === "list" && !window.isCurrentItemEnabled())) {
            SoundManager.playBuzzer();
            if (node.type === "list") window.activate();
            return;
        }
        if (this._actorSelection && window === this._actorSelection.window) {
            this.endActorSelection(true);
            return;
        }
        if (node.type === "input") { this.beginInput(window); return; }
        if (node.action.type === "formation") {
            if(node.se) AudioManager.playSe(node.se); else SoundManager.playOk();
            this.beginActorSelection(node.action); return;
        }
        if (node.type === "button" && (node.action.actorFirst || node.action.chooseActor !== false) && ReactorUI.isPersonalAction(node.action)) {
            if (node.se) AudioManager.playSe(node.se);
            else SoundManager.playOk();
            this.beginActorSelection(node.action);
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
            if (node.action.type === "use") { this.beginUse(node.action, row, window); return; }
            if (node.action.type === "equip") { this.executeEquip(node.action, row, window); return; }
            if (node.action.type === "shopBuy" || node.action.type === "shopSell") { this.beginQuantity(node.action, row, window); return; }
        }
        if (node.se) AudioManager.playSe(node.se);
        else if (node.type !== "list") SoundManager.playOk();
        this.runAction(node.action);
    };

    Scene_ReactorUI.prototype.closeAll = function() {
        this.beginCloseTransition(() => {
            const stack = SceneManager._stack;
            while (stack.length > 0 && ReactorUI.isInterfaceClass(stack[stack.length - 1])) {
                stack.pop();
                ReactorUI._resumeStates.pop();
            }
            this.performClose();
        });
    };

    /** Leaves for another scene that will come back here when it pops. */
    Scene_ReactorUI.prototype.pushScene = function(sceneClass, args = []) {
        this.beginCloseTransition(() => {
            this.rememberForPush();
            const depth = SceneManager._stack.length;
            try {
                SceneManager.push(sceneClass);
                if(args.length) SceneManager.prepareNextScene(...args);
            } catch (error) {
                // A scene that throws while being made leaves this interface open and taking input.
                console.error("ReactorUI: scene failed to open", error);
                SceneManager._stack.length = depth;
                SceneManager._nextScene = null;
                this.forgetPush();
                SoundManager.playBuzzer();
                this.cancelClose();
            }
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

    ReactorUI.isPersonalAction = function(action) {
        return action && (["personalSkill", "personalEquip", "personalStatus"].includes(action.type) || (action.type === "scene" && action.scene === "item") || (["pluginScene","pluginCommand","script"].includes(action.type) && action.actorFirst));
    };

    // A missing list must not strand commands bound to its actor context.
    Scene_ReactorUI.prototype.prepareActorContexts = function() {
        const rows = ReactorUI.listRows(ReactorUI.normalizeNode({ type: "list", dataSource: "party" }), this);
        const actor = $gameParty.menuActor && $gameParty.menuActor();
        const initial = rows.find(row => actor && row.id === actor.actorId()) || rows[0];
        if (!initial) return;
        for (const node of this._interface.nodes) {
            if (!ReactorUI.isPersonalAction(node.action) || (node.action.chooseActor === false && !node.action.actorFirst)) continue;
            const name = node.action.contextName || "selection";
            if (!this.context(name)) this.setContext(name, initial);
        }
    };

    Scene_ReactorUI.prototype.beginActorSelection = function(action, use) {
        if (this._actorSelection) return;
        if(action.type==='formation' && ($gameParty.size()<2 || !$gameSystem.isFormationEnabled())) {SoundManager.playBuzzer();return;}
        const name = action.contextName || "selection";
        // A panel shown only while choosing a target (visible: scene.isSelectingTarget())
        // has to be visible before it can be found.
        if (use) { this._targetPending = true; this.updateConditions(); this._targetPending = false; }
        const candidates = this._nodeWindows.filter(win => win.node().type === "list" && win.node().dataSource === "party"
            && win.visible && win.isEnabled() && win.maxItems() > 0);
        const picker = candidates.find(win => win.node().rowLayout === "actorPanel" && win.node().contextName === name)
            || candidates.find(win => win.node().rowLayout === "actorPanel")
            || candidates.find(win => win.node().contextName === name);
        // With no party panel to pick in, the action goes to the menu actor, as with Select Actor off.
        if (!picker && !use && action.type !== "formation") { this.runAction(action); return; }
        if (!picker) { SoundManager.playBuzzer(); if (use) this.updateConditions(); return; }
        const source = this.focusedWindow(), previous = picker.selectedRow();
        this._actorSelection = { action, window: picker, source, previous, pending: null, use: use || null };
        this.setFocus(this._nodeWindows.indexOf(picker));
        if (use) {
            if (use.forUser) {
                const index = picker._uiRows.findIndex(row => row.data === use.user);
                if (index >= 0) picker.select(index);
            }
            picker.setCursorFixed(!!use.forUser);
            picker._uiCursorAll = !!use.all;
            picker.refreshCursor();
        }
    };

    Scene_ReactorUI.prototype.endActorSelection = function(confirm) {
        const selection = this._actorSelection;
        if (!selection) return;
        const actor = selection.window.selectedRow()?.data;
        if (confirm && (!actor || !$gameParty.members().includes(actor))) {
            SoundManager.playBuzzer();
            return;
        }
        if (selection.use) {
            if (confirm) { this.executeUse(selection.use, actor); return; }
            selection.window.setCursorFixed(false);
            selection.window._uiCursorAll = false;
        }
        if(selection.action.type==='formation') {
            if(confirm) {
                if(!$gameSystem.isFormationEnabled() || !actor.isFormationChangeOk()) {SoundManager.playBuzzer();return;}
                if(!selection.pending) {selection.pending=actor;selection.window.refresh();return;}
                const members=$gameParty.members(), first=members.indexOf(selection.pending), second=members.indexOf(actor);
                if(first<0 || !selection.pending.isFormationChangeOk()) {selection.pending=null;selection.window.refresh();SoundManager.playBuzzer();return;}
                $gameParty.swapOrder(first,second); selection.pending=null;
                const win=selection.window;
                win._uiRows=ReactorUI.listRows(win.node(),this); win._uiRowsSignature=ReactorUI.listRowsSignature(win._uiRows);
                win.select(second);win.refresh();return;
            }
            if(selection.pending) {selection.pending=null;selection.window.refresh();return;}
        }
        this._actorSelection = null;
        selection.window.refresh?.();
        this.setFocus(this._nodeWindows.indexOf(selection.source));
        if (selection.use) {
            this.setContext(selection.action.contextName, selection.previous);
            this.updateConditions();
            return;
        }
        if (!confirm) {
            this.setContext(selection.action.contextName, selection.previous);
            const index = selection.window._uiRows.findIndex(row => selection.previous && row.key === selection.previous.key);
            selection.window.select(index);
        }
        if (confirm) {
            this.setContext(selection.action.contextName, selection.window.selectedRow());
            $gameParty.setMenuActor(actor);
            this.runAction(selection.action);
        }
    };

    Scene_ReactorUI.prototype.runAction = function(action) {
        if (!action) return;
        const stackDepth=SceneManager._stack?.length || 0;
        const actor=['script','pluginCommand'].includes(action.type) ? ReactorUI.actorFromContext(this,action.contextName) || (typeof $gameParty!=='undefined' && $gameParty.menuActor?.()) : null;
        switch (action.type) {
            case "formation": this.beginActorSelection(action); break;
            case "pluginScene": {
                try {
                    const actor=ReactorUI.actorFromContext(this,action.contextName) || $gameParty.menuActor();
                    const sceneClass=window[action.sceneClass];
                    const args=action.argsExpression.trim() ? (new Function('actor','scene','return ('+action.argsExpression+');'))(actor,this) : [];
                    if(typeof sceneClass!=='function' || !Array.isArray(args)) throw Error('A plugin scene class and an array of arguments are required');
                    this.pushScene(sceneClass,args);
                } catch(error) {console.error('ReactorUI: plugin scene failed',error);SoundManager.playBuzzer();}
                break;
            }
            case "close":
                this.close();
                break;
            case "focusNode": {
                const index = this._nodeWindows.findIndex(window => window.node().id === action.id && this.canFocus(window));
                if (index < 0) { SoundManager.playBuzzer(); break; }
                const target = this._nodeWindows[index];
                this.setFocus(index);
                if (target.node().type === "list" && target.maxItems() > 0) target.select(0);
                break;
            }
            case "equipOptimize":
            case "equipClear": {
                const actor = ReactorUI.actorFromContext(this, action.contextName) || $gameParty.menuActor();
                if (!actor) { SoundManager.playBuzzer(); break; }
                if (action.type === "equipOptimize") actor.optimizeEquipments(); else actor.clearEquipments();
                SoundManager.playEquip();
                this.refreshAllLists();
                break;
            }
            case "closeAll":
                this.closeAll();
                break;
            case "callInterface":
                this.beginCloseTransition(() => {
                    this.rememberForPush();
                    if (!ReactorUI.call(action.id)) {
                        this.forgetPush();
                        SoundManager.playBuzzer();
                        this.cancelClose();
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
                const args=Object.fromEntries(Object.entries(action.args || {}).map(([key,value])=>[key,String(value).replace(/\{actor\.(id|name)\}/g,(_,field)=>actor?(field==='id'?actor.actorId():actor.name()):'')]));
                PluginManager.callCommand(interpreter, action.plugin, action.command, args);
                if (action.andClose && (SceneManager._stack?.length || 0)===stackDepth) this.close();
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
                    (new Function("scene", "actor", action.script)).call(this, this, actor);
                } catch (error) {
                    console.error("ReactorUI: action script failed", error);
                }
                if (action.andClose && !this._closing && (SceneManager._stack?.length || 0)===stackDepth) this.close();
                break;
            default:
                break;
        }
        if(['pluginCommand','script'].includes(action.type) && !this._closing && (SceneManager._stack?.length || 0)>stackDepth) {
            this.rememberForPush(); this._closing=true;
        }
        const focused = this.focusedWindow();
        if (!this._closing && focused && focused.node().type === "list") focused.activate();
    };

    //-------------------------------------------------------------------------
    // Workflows the stock Item, Skill, Equip and Shop scenes run

    /** Who uses a row: the skill list's actor, or for an item the stock Scene_Item's pick (best PHA). */
    Scene_ReactorUI.prototype.useUser = function(row) {
        if (row.kind === "skill") return row.actorId > 0 ? $gameActors.actor(row.actorId) : $gameParty.menuActor();
        const members = $gameParty.movableMembers();
        if (!members.length) return null;
        const best = Math.max(...members.map(member => member.pha));
        return members.find(member => member.pha === best) || null;
    };

    ReactorUI.canUseOn = function(user, item, targets) {
        if (!user || !item || !user.canUse(item)) return false;
        const action = new Game_Action(user);
        action.setItemObject(item);
        return !action.isForFriend() || targets.some(target => action.testApply(target));
    };

    /**
     * Use on a list row: an item or skill for friends picks its target in
     * the party panel (one actor, everyone, or the user alone, by scope);
     * anything else is used at once, as Scene_ItemBase does.
     */
    Scene_ReactorUI.prototype.beginUse = function(action, row, window) {
        const item = row.data;
        const user = this.useUser(row);
        if (!item || !user || !user.canUse(item)) { SoundManager.playBuzzer(); window.activate(); return; }
        SoundManager.playOk();
        const probe = new Game_Action(user);
        probe.setItemObject(item);
        if (!probe.isForFriend()) {
            this.executeUse({ item, user, all: false, forUser: false }, null, window);
            return;
        }
        this.beginActorSelection(action, { item, user, all: probe.isForAll(), forUser: probe.isForUser(), row, window });
    };

    Scene_ReactorUI.prototype.executeUse = function(use, actor, window) {
        const item = use.item;
        const user = use.user;
        const action = new Game_Action(user);
        action.setItemObject(item);
        const targets = !action.isForFriend() ? [] : use.all ? $gameParty.members() : use.forUser ? [user] : actor ? [actor] : [];
        if (!ReactorUI.canUseOn(user, item, targets)) {
            SoundManager.playBuzzer();
            if (window) window.activate();
            return;
        }
        if (DataManager.isSkill(item)) SoundManager.playUseSkill(); else SoundManager.playUseItem();
        user.useItem(item);
        for (const target of targets) {
            for (let i = 0; i < action.numRepeats(); i++) action.apply(target);
        }
        action.applyGlobal();
        this.refreshAllLists();
        if ($gameTemp.isCommonEventReserved()) {
            ReactorUI._resumeStates.length = 0;
            this._closing = true;
            SceneManager.goto(Scene_Map);
            return;
        }
        if (window) window.activate();
    };

    /** Equip the chosen candidate into its slot, then hand focus back (action id, else the Back node). */
    Scene_ReactorUI.prototype.executeEquip = function(action, row, window) {
        const actor = ReactorUI.resolveActor(window.node(), this) || $gameParty.menuActor();
        const slot = Number(row.slot) || 0;
        if (!actor || !actor.isEquipChangeOk(slot) || (row.data && !actor.canEquip(row.data))) {
            SoundManager.playBuzzer();
            window.activate();
            return;
        }
        SoundManager.playEquip();
        actor.changeEquip(slot, row.data || null);
        this.refreshAllLists();
        const back = action.id || window.node().backFocus;
        const index = this._nodeWindows.findIndex(other => other !== window && other.node().id === back && this.canFocus(other));
        if (index >= 0) this.setFocus(index);
        else window.activate();
    };

    /** A text input starts editing: typing always, the stock character grid when the node asks for it. */
    Scene_ReactorUI.prototype.beginInput = function(window, quiet) {
        if (this._editingWindow) return;
        if (!quiet) SoundManager.playOk();
        const node = window.node();
        if (this._role === "name" && this.nameMaxLength() > 0) node.maxLength = Math.min(node.maxLength, this.nameMaxLength());
        this._editingWindow = window;
        window.beginEdit();
        if (node.onScreenKeys && typeof Window_NameInput === "function") this.openCharacterGrid(window);
    };

    Scene_ReactorUI.prototype.commitInput = function(window, soundPlayed) {
        if (window !== this._editingWindow) return;
        const node = window.node();
        this.closeCharacterGrid();
        this._editingWindow = null;
        const written = window.endEdit(true);
        this._inputHandled = true;
        if (!written) { SoundManager.playBuzzer(); return; }
        if (!soundPlayed) SoundManager.playOk();
        this.runAction(node.action);
    };

    Scene_ReactorUI.prototype.cancelInput = function(window) {
        if (window !== this._editingWindow) return;
        this.closeCharacterGrid();
        this._editingWindow = null;
        window.endEdit(false);
        this._inputHandled = true;
        SoundManager.playCancel();
    };

    /**
     * The stock name-entry grid under the field, bound to the field's draft
     * through a small stand-in for Window_NameEdit: its OK commits and its
     * cancel deletes a character, as on the stock screen.
     */
    Scene_ReactorUI.prototype.openCharacterGrid = function(field) {
        const node = field.node();
        const edit = {
            name: () => field.inputValue(), index: () => field.inputValue().length, maxLength: () => node.maxLength,
            add: ch => { const text = field.inputValue(); if (text.length >= node.maxLength) return false; field.setDraft(text + ch); return true; },
            back: () => { const text = field.inputValue(); if (!text.length) return false; field.setDraft(text.slice(0, -1)); return true; },
            restoreDefault: () => { if (!field._uiInitial) return false; field.setDraft(field._uiInitial); return true; },
            refresh() {}
        };
        const height = this.calcWindowHeight(9, true);
        const width = Math.min(Graphics.boxWidth, 624);
        // Under the box the field stands in (its face and frame), not under the field alone: the grid covered
        // the lower part of the Name box on every screen size.
        let under = field.y + field.height * ReactorUI.shownScale(field);
        // (A record whose parents name each other is walked once round.)
        const walked = new Set([node.id]);
        for (let id = node.parent; id && !walked.has(id); ) {
            walked.add(id);
            const holder = (this._nodeWindows || []).find(candidate => candidate.node().id === id);
            if (!holder) break;
            under = Math.max(under, holder.y + holder.height * ReactorUI.shownScale(holder));
            id = holder.node().parent;
        }
        const y = Math.min(under + 8, Graphics.boxHeight - height);
        const grid = new Window_NameInput(new Rectangle(Math.floor((Graphics.boxWidth - width) / 2), Math.max(0, y), width, height));
        grid.setEditWindow(edit);
        grid.setHandler("ok", () => this.commitInput(field, true));
        grid.activate();
        this._characterGrid = grid;
        this.addWindow(grid);
    };

    Scene_ReactorUI.prototype.closeCharacterGrid = function() {
        const grid = this._characterGrid;
        this._characterGrid = null;
        if (!grid) return;
        grid.deactivate();
        if (grid.parent) grid.parent.removeChild(grid);
        if (grid.destroy) grid.destroy();
    };

    /** Buy or sell: the stock number window over the list asks how many. */
    Scene_ReactorUI.prototype.beginQuantity = function(action, row, window) {
        const item = row.data;
        const buying = action.type === "shopBuy";
        const price = Number(row.price) || 0;
        let max;
        if (buying) {
            const room = $gameParty.maxItems(item) - $gameParty.numItems(item);
            max = price > 0 ? Math.min(room, Math.floor($gameParty.gold() / price)) : room;
        } else {
            max = $gameParty.numItems(item);
        }
        if (!item || max < 1 || (!buying && !(item.price > 0))) { SoundManager.playBuzzer(); window.activate(); return; }
        SoundManager.playOk();
        const rect = new Rectangle(window.x, window.y, Math.max(window.width, 360), Math.max(window.height, this.calcWindowHeight(4, true)));
        const quantity = new Window_ShopNumber(rect);
        quantity.setup(item, max, price);
        quantity.setCurrencyUnit(TextManager.currencyUnit);
        quantity.setHandler("ok", () => {
            const number = quantity.number();
            if (buying) {
                $gameParty.loseGold(number * price);
                $gameParty.gainItem(item, number);
            } else {
                $gameParty.gainGold(number * price);
                $gameParty.loseItem(item, number);
            }
            SoundManager.playShop();
            this.endQuantity(window);
        });
        quantity.setHandler("cancel", () => this.endQuantity(window));
        quantity.show();
        quantity.activate();
        this._quantityWindow = quantity;
        this.addWindow(quantity);
    };

    Scene_ReactorUI.prototype.endQuantity = function(window) {
        const quantity = this._quantityWindow;
        this._quantityWindow = null;
        if (quantity) {
            quantity.deactivate();
            if (quantity.parent) quantity.parent.removeChild(quantity);
            if (quantity.destroy) quantity.destroy();
        }
        this._inputHandled = true;
        this.refreshAllLists();
        if (window) window.activate();
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

    ReactorUI.createOverlay = function(scene, record, options = {}) {
        const overlay = {
            _mapScene: scene,
            _interfaceId: record.id,
            _interface: record,
            _nodeWindows: [],
            _focusIndex: -1,
            _contexts: new Map(),
            _visibilityAlpha: ReactorUI.evaluateCondition(record.visible, scene) ? 1 : 0,
            addWindow(window) { if (options.addWindow) options.addWindow(window); else scene.addWindow(window); },
            measureText: Scene_ReactorUI.prototype.measureText,
            refreshNodeLayouts: Scene_ReactorUI.prototype.refreshNodeLayouts,
            updateConditions: Scene_ReactorUI.prototype.updateConditions,
            context: Scene_ReactorUI.prototype.context,
            setContext: Scene_ReactorUI.prototype.setContext,
            refreshDependents: Scene_ReactorUI.prototype.refreshDependents,
            focusedWindow() { return null; },
            canFocus() { return false; },
            setFocus() {},
            focusInitial() {},
            activateWindow() {},
            cancelInterface() {}
        };
        Scene_ReactorUI.prototype.createNodes.call(overlay);
        overlay.update = function() {
            // `_standDown`: its owner has it leave for now (a battle HUD while the battle's results are shown).
            const shown = !this._standDown && ReactorUI.evaluateCondition(this._interface.visible, scene);
            const transition = shown ? this._interface.openTransition : this._interface.closeTransition;
            const step = transition === "none" ? 1 : 1 / this._interface.transitionDuration;
            this._visibilityAlpha = shown ? Math.min(1, this._visibilityAlpha + step) : Math.max(0, this._visibilityAlpha - step);
            this.updateConditions();
            // Slides move the whole overlay in over its fade.
            const slide = 1 - this._visibilityAlpha;
            const moving = transition === "slideLeft" || transition === "slideUp";
            for (const window of this._nodeWindows) {
                window._uiTransitionAlpha = moving ? 1 : this._visibilityAlpha;
                window._uiTransitionX = transition === "slideLeft" ? Math.round(96 * slide) : 0;
                window._uiTransitionY = transition === "slideUp" ? Math.round(96 * slide) : 0;
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

    //-------------------------------------------------------------------------
    // Tactical battle HUD: a Tactical Battle HUD record over Scene_Map while
    // a Tactical battle runs on the map. It is its own thing: a Classic
    // battle (Scene_Battle, its Battle HUD record, its stock windows) never
    // reads any of it, and the other map modes (Action, First Person) show
    // none of it. Unit Panels, the Turn Order strip and Battle Text lines draw
    // the battle's own values (reactor_ui_fight.js draws them, the same on
    // the editor's canvas); Tactical Window nodes place the stock tactical
    // command, skill and item windows. A node redraws only when the battle
    // says something it shows has changed. A project that binds no record
    // gets the stock layout, sized for its screen.

    function Window_ReactorUIFight() {
        this.initialize(...arguments);
    }

    window.Window_ReactorUIFight = Window_ReactorUIFight;
    Window_ReactorUIFight.prototype = Object.create(Window_ReactorUINode.prototype);
    Window_ReactorUIFight.prototype.constructor = Window_ReactorUIFight;

    Window_ReactorUIFight.prototype.initialize = function(rect, scene, node) {
        const hud = FightHud();
        this._fightReader = null;
        this._fightRevision = NaN;
        this._fightShown = false;
        this._fightAlpha = 1;
        this._fightAwaited = false;
        this._fightUnit = null;
        this._fightView = hud ? hud.newUnitView() : null;
        this._fightText = "";
        this._fightTeam = "";
        this._fightPortraits = 0;
        this._fightViewKey = NaN;
        this._fightHold = 0;
        this._fightCycle = 0;
        this._fightCycleFrame = 0;
        this._fightArea = {};
        this._fightMenuKey = 0;
        this._fightMenu = { kind: "", symbol: "", enabled: true, item: null };
        this._banner = hud ? hud.bannerState() : null;
        this._bannerHold = false;
        this._turnLayout = { size: 0, big: 0, top: 0, count: 0, marker: 0, ids: [], xs: [], sizes: [], entries: [] };
        this._turnBefore = [];
        this._turnTileSize = 0;
        this._turnSlides = [];
        this._turnHp = {};
        this._turnSprites = new Map();
        this._turnPool = [];
        this._turnMoving = false;
        this._turnStamp = 0;
        this._turnMore = [];
        Window_ReactorUINode.prototype.initialize.call(this, rect, scene, node);
    };

    Window_ReactorUIFight.prototype.usesSkin = function() {
        return this._uiNode.fill === "window";
    };

    /** Room between a painted panel's edge and its parts (a skinned one has the window's own padding). */
    Window_ReactorUIFight.prototype.fightInset = function() {
        const node = this._uiNode;
        return node.type === "fightUnit" && (node.fill === "color" || node.fill === "gradient") ? 8 : 0;
    };

    Window_ReactorUIFight.prototype.refresh = function() {
        if (!this.contents) return;
        this.contents.clear();
        if (this.contentsBack) this.contentsBack.clear();
        this.drawSurface();
        this.drawFight();
        this.syncVisualState();
    };

    Window_ReactorUIFight.prototype.drawFight = function() {
        const hud = FightHud();
        const node = this._uiNode;
        this._fightAwaited = false;
        if (!hud || !this._fightReader) return;
        const theme = ReactorUI.fightTheme();
        const context = this.contents.context;
        const inset = this.fightInset();
        const width = this.contentsWidth() - inset * 2, height = this.contentsHeight() - inset * 2;
        let ready = true;
        context.save();
        context.translate(inset, inset);
        if (node.type === "fightUnit") {
            if (this._fightUnit) ready = hud.drawUnit(context, width, height, node, this._fightView, theme);
        } else if (node.type === "fightInfo") {
            hud.drawInfo(context, width, height, node, this._fightText, theme, this._fightTeam);
        }
        context.restore();
        this._fightAwaited = !ready;
        touch(this.contents);
    };

    /** Once a frame while the battle runs: redraw what changed, and say whether the node shows at all. */
    Window_ReactorUIFight.prototype.updateFight = function(reader) {
        const hud = FightHud();
        const node = this._uiNode;
        if (!hud || !reader) { this._fightShown = false; return; }
        this._fightReader = reader;
        const revision = reader.tacticalRevision();
        // A picture that was still loading is drawn on the frame it arrives; a model's portrait on the frame it is made.
        const portraits = ReactorUI.FightPortraits.version;
        const pictured = portraits !== this._fightPortraits;
        let changed = revision !== this._fightRevision || pictured || (this._fightAwaited && ReactorUI.fightTheme().settled());
        this._fightPortraits = portraits;
        // An army's units act together and the battle changes many times a second: its unit panels and turn strip
        // follow a few times a second then, the last change always shown. The player's own turn is followed at once.
        if (node.type !== "fightInfo") {
            if (this._fightHold > 0) this._fightHold--;
            if (changed && this._fightHold > 0 && !pictured && reader.overlaps && reader.overlaps() && !reader.awaitsPlayer()) changed = false;
            else if (changed) this._fightHold = ReactorUI.FIGHT_ARMY_FRAMES;
        }
        if (node.type === "fightUnit") {
            // An action that lands on several units: the focused panel steps through them, a couple of seconds each.
            if (node.fightUnit === "focused") {
                if (revision !== this._fightRevision) { this._fightCycle = 0; this._fightCycleFrame = 0; }
                else if (this._fightView.area && ++this._fightCycleFrame >= ReactorUI.FIGHT_CYCLE_FRAMES) {
                    this._fightCycleFrame = 0;
                    this._fightCycle++;
                    changed = true;
                }
            }
            if (changed) {
                this._fightRevision = revision;
                const unit = hud.panelUnit(node, reader, this._fightCycle);
                this._fightUnit = unit;
                if (unit) {
                    const before = this._fightView.id === unit.id ? (this._fightView.hpShown >= 0 ? this._fightView.hpShown : this._fightView.hp) : -1;
                    // The forecast is for a unit the aimed action would land on: never the acting unit under its own cursor.
                    const view = hud.fillUnitView(this._fightView, reader, unit, typeof $dataSystem === "undefined" || !$dataSystem || $dataSystem.optDisplayTp !== false,
                        node.fightUnit === "focused" ? hud.previewFor(reader, unit) : null);
                    // The same unit with other HP: the bar runs to it over the next frames. Another unit: its bar as it is.
                    view.hpShown = before >= 0 && before !== view.hp ? before : -1;
                    if (!view.model) view.model = ReactorUI.fightModelOf(unit);
                    if (view.preview) view.area = hud.areaSummary(reader, unit, this._fightArea);
                }
                // The battle says something changed many times a second while an army acts; this panel is drawn again
                // only when what it shows did (another unit, other numbers, a picture that arrived).
                const key = unit ? hud.viewKey(this._fightView) : 0;
                if (key !== this._fightViewKey || pictured || this._fightAwaited || this._fightView.hpShown >= 0) {
                    this._fightViewKey = key;
                    this.refresh();
                }
            }
            else if (this._fightUnit && this._fightView.hpShown >= 0) {
                const view = this._fightView, gap = view.hp - view.hpShown;
                view.hpShown = Math.abs(gap) <= Math.max(1, view.mhp * 0.004) ? -1 : view.hpShown + gap * 0.16;
                this.refresh();
            }
            this._fightShown = !!this._fightUnit;
        } else if (node.type === "fightTurnOrder") {
            if (changed) {
                this._fightRevision = revision;
                this.layoutTurnOrder(hud, reader, pictured);
            }
            if (this._turnMoving) this.moveTurnSprites();
            this._fightShown = this._turnLayout.count > 0;
        } else if (node.fightInfo === "phase") {
            // The banner plays the phase's words each time the turn passes to a side, and after them what the
            // battle announces (a new goal): `bannerStep` keeps their order. Behind the battle menu it waits.
            const banner = this._banner || (this._banner = hud.bannerState());
            let team = banner.team, phase = "", notice = banner.notice;
            if (changed) {
                this._fightRevision = revision;
                team = reader.currentTeam ? reader.currentTeam() : "any";
                phase = hud.phaseText(node, reader);
                notice = hud.bannerNotice(reader);
            }
            if (hud.bannerStep(banner, node.bannerFrames, changed, team, phase, notice, this._bannerHold)) {
                this._fightText = banner.text;
                this._fightTeam = banner.team;
                this.refresh();
            }
            this._fightAlpha = banner.alpha;
            this._fightShown = banner.alpha > 0;
        } else {
            // The hint also follows the highlighted row of the menu that is up (why it cannot be chosen).
            let menu = null;
            if (node.fightInfo === "hint") {
                menu = ReactorUI.fightMenuRow(this._fightMenu);
                const key = menu ? menu.key : 0;
                if (key !== this._fightMenuKey) { this._fightMenuKey = key; changed = true; }
            }
            if (changed) {
                this._fightRevision = revision;
                let value = hud.infoText(node, reader, menu, ReactorUI.fightTheme().terms);
                // An army rests for a frame or two between its units' acts: the line stays up rather than blink.
                if (!value && node.fightInfo === "hint" && this._fightText && reader.tacticalState() === "idle"
                    && reader.overlaps && reader.overlaps() && !reader.awaitsPlayer()) value = this._fightText;
                const team = reader.currentTeam ? reader.currentTeam() : "any";
                if (value !== this._fightText || team !== this._fightTeam) {
                    this._fightText = value;
                    this._fightTeam = team;
                    this.refresh();
                }
            }
            this._fightShown = this._fightText !== "";
        }
    };

    /**
     * One sprite per turn tile: a tile is redrawn when what it shows changes (its side, whether it acts or has
     * acted, its size, its HP line), and moves when its place does. Tiles that keep their order slide together; a
     * tile that would cross others on its way (it acted and goes behind them, the sides changed places), a new
     * one and a count box come up at their place once whatever is sliding has left it: no two ever overlap.
     */
    Window_ReactorUIFight.prototype.layoutTurnOrder = function(hud, reader, redraw) {
        const node = this._uiNode;
        const layout = hud.turnLayout(node, this.contentsWidth(), this.contentsHeight(), reader.turnOrder() || [], this._turnLayout);
        const theme = ReactorUI.fightTheme();
        const stamp = ++this._turnStamp;
        // Every tile's picture is as large as the acting unit's: a unit whose turn begins grows in the picture it has.
        const cellWidth = layout.big, cellHeight = layout.big + layout.marker + 2;
        const before = this._turnBefore;
        for (let i = 0; i < layout.count; i++) {
            const known = this._turnSprites.get(layout.ids[i]);
            before[i] = known && !known._turnArrives ? known.x : NaN;
        }
        // Tiles that grew (units fell and the rest have more room) would stand on their neighbors at their old places:
        // that layout is taken at once, with no sliding.
        const grew = this._turnTileSize > 0 && layout.size > this._turnTileSize;
        this._turnTileSize = layout.size;
        const animate = node.turnAnimate && !grew;
        const slides = animate ? hud.turnSliders(before, layout.count, this._turnSlides) : null;
        let awaited = false;
        for (let i = 0; i < layout.count; i++) {
            const id = layout.ids[i], entry = layout.entries[i], size = layout.sizes[i];
            let sprite = this._turnSprites.get(id);
            const fresh = !sprite;
            if (fresh) {
                sprite = this._turnPool.pop() || new Sprite(ReactorUI.hudBitmap(cellWidth, cellHeight));
                sprite._turnKey = -1;
                sprite.visible = true;
                sprite._turnArrives = false;
                this._turnSprites.set(id, sprite);
                if (!sprite.parent) {
                    if (this.addInnerChild) this.addInnerChild(sprite); else this.addChild(sprite);
                }
            }
            if (sprite.bitmap.width !== cellWidth || sprite.bitmap.height !== cellHeight) {
                const old = sprite.bitmap;
                sprite.bitmap = ReactorUI.hudBitmap(cellWidth, cellHeight);
                if (old && old._rrHud && old.destroy) { old._rrHud = false; old.destroy(); }
                sprite._turnKey = -1;
            }
            sprite._turnStamp = stamp;
            sprite._turnX = layout.xs[i];
            sprite._turnSize = size;
            sprite.y = entry.active ? 0 : layout.top;
            // The acting tile reaches a little past its place on both sides: one that begins (or ends) acting on its
            // way keeps the place it is at, and grows (or shrinks) around it.
            const over = entry.active ? layout.top : 0;
            if (!fresh) sprite.x += (sprite._turnOver || 0) - over;
            sprite._turnOver = over;
            if (!animate) { sprite.x = sprite._turnX; sprite.alpha = 1; sprite._turnArrives = false; }
            else if (fresh || !slides[i]) {
                // One already coming up at this very place goes on coming up; any other starts unseen at its new place.
                if (fresh || !sprite._turnArrives || Math.abs(sprite._turnX - sprite.x) > 0.5) { sprite.x = sprite._turnX; sprite.alpha = 0; sprite._turnArrives = true; }
            }
            const unit = reader.unit ? reader.unit(id) : null;
            // Only the battler is needed to know whether the tile changed: the unit's full details are read when it is drawn.
            const battler = !unit ? null : typeof reader.battler === "function" ? reader.battler(unit) : (reader.unitInfo(unit) || {}).battler;
            // The HP line as it will be drawn: its filled pixels, and whether it is in the warning color.
            const hp = battler && battler.mhp > 0
                ? hud.turnHpFill(hud.turnHpRect(size, entry.active ? 3 : 2, this._turnHp).width, battler.hp, battler.mhp) + (battler.hp / battler.mhp < 0.25 ? 512 : 0) : -1;
            const key = (entry.active ? 1 : 0) + (entry.acted ? 2 : 0) + (entry.team === "enemy" ? 4 : entry.team === "neutral" ? 8 : 0) + size * 16 + (entry.watch ? 8192 : 0) + (hp + 1) * 16384;
            if (key !== sprite._turnKey || sprite._turnAwaited || redraw) {
                sprite.bitmap.clear();
                if (unit) {
                    const view = hud.fillUnitView(this._fightView, reader, unit, false, null);
                    if (!view.model) view.model = ReactorUI.fightModelOf(unit);
                    sprite._turnAwaited = !hud.drawTurnCell(sprite.bitmap.context, size, layout.marker, node, entry, this._fightView, theme);
                }
                sprite._turnKey = key;
                touch(sprite.bitmap);
            }
            awaited = awaited || !!sprite._turnAwaited;
        }
        for (const [id, sprite] of this._turnSprites) {
            if (sprite._turnStamp === stamp) continue;
            sprite.visible = false;
            this._turnSprites.delete(id);
            this._turnPool.push(sprite);
        }
        // The units the strip has no room for: a box with their count at the end of each side (two at most), redrawn
        // only when its count or its side changes.
        for (let i = 0; i < layout.chipCount; i++) {
            const chip = layout.chips[i];
            let more = this._turnMore[i];
            if (!more || more.bitmap.width !== layout.size) {
                if (more && more.parent) more.parent.removeChild(more);
                if (more && more.bitmap && more.bitmap._rrHud && more.bitmap.destroy) { more.bitmap._rrHud = false; more.bitmap.destroy(); }
                more = this._turnMore[i] = new Sprite(ReactorUI.hudBitmap(layout.size, layout.size));
                more._moreKey = "";
                more.visible = false;
                if (this.addInnerChild) this.addInnerChild(more); else this.addChild(more);
            }
            if (!animate) { more.alpha = 1; more._turnArrives = false; }
            else if (!more.visible || more.x !== chip.x) { more.alpha = 0; more._turnArrives = true; }
            more.visible = true;
            more.x = more._turnX = chip.x;
            more.y = layout.top;
            more._turnSize = layout.size;
            const key = chip.count * 4 + (chip.team === "enemy" ? 1 : chip.team === "ally" ? 2 : chip.team ? 3 : 0);
            if (key !== more._moreKey) {
                more._moreKey = key;
                more.bitmap.clear();
                hud.drawTurnMore(more.bitmap.context, layout.size, chip.count, theme, chip.team ? hud.teamColor(node, chip.team) : "");
                touch(more.bitmap);
            }
        }
        for (let i = layout.chipCount; i < this._turnMore.length; i++) this._turnMore[i].visible = false;
        // Whatever stands still (a tile coming up, a count box) and now lies on a sliding tile's way goes out of
        // sight until the way is clear.
        if (animate) {
            for (const sprite of this._turnSprites.values()) if (sprite._turnArrives && sprite.alpha > 0 && this.turnPlaceCrossed(sprite)) sprite.alpha = 0;
            for (const more of this._turnMore) if (more.visible && more.alpha > 0 && this.turnPlaceCrossed(more)) { more.alpha = 0; more._turnArrives = true; }
        }
        this._fightAwaited = awaited;
        this._turnMoving = true;
    };

    /** Whether a sliding tile stands on a still one's place now or has yet to pass over it. */
    Window_ReactorUIFight.prototype.turnPlaceCrossed = function(sprite) {
        const left = sprite.x, right = sprite.x + sprite._turnSize;
        for (const other of this._turnSprites.values()) {
            if (other === sprite || other._turnArrives) continue;
            if (Math.min(other.x, other._turnX) < right && left < Math.max(other.x, other._turnX) + other._turnSize) return true;
        }
        return false;
    };

    Window_ReactorUIFight.prototype.moveTurnSprites = function() {
        let moving = false;
        for (const sprite of this._turnSprites.values()) {
            if (sprite._turnArrives) continue;
            const distance = sprite._turnX - sprite.x;
            if (Math.abs(distance) > 0.5) { sprite.x += distance * 0.25; moving = true; } else sprite.x = sprite._turnX;
        }
        for (const sprite of this._turnSprites.values()) if (sprite._turnArrives && this.arriveTurnSprite(sprite)) moving = true;
        for (const more of this._turnMore) if (more.visible && more._turnArrives && this.arriveTurnSprite(more)) moving = true;
        this._turnMoving = moving;
    };

    /**
     * A tile coming up at its place, a step more visible; it waits, unseen, while a sliding tile stands on its
     * place or has yet to pass over it. Returns whether it is still on its way.
     */
    Window_ReactorUIFight.prototype.arriveTurnSprite = function(sprite) {
        if (sprite.alpha <= 0 && this.turnPlaceCrossed(sprite)) return true;
        sprite.alpha = Math.min(1, sprite.alpha + 0.125);
        if (sprite.alpha < 1) return true;
        sprite._turnArrives = false;
        return false;
    };

    /**
     * The unit whose turn tile is under a point of the screen, or 0: the Tactical HUD's strip can be clicked to
     * look at a unit (the battle asks this of a press before it reads the press for the map under the strip).
     */
    ReactorUI.fightStripUnit = function(x, y) {
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        const hud = scene && scene._reactorFightHud;
        if (!hud || !hud._nodeWindows || !(hud._visibilityAlpha === undefined || hud._visibilityAlpha > 0)) return 0;
        const layer = scene._windowLayer;
        const ox = layer ? Number(layer.x) || 0 : 0, oy = layer ? Number(layer.y) || 0 : 0;
        for (const window of hud._nodeWindows) {
            if (!window._turnSprites || !window.visible || !window._fightShown) continue;
            // A record fitted to another screen is shown at its fit's scale; its tiles are laid out in its own units.
            const scale = window._uiFitScale > 0 ? window._uiFitScale : 1, padding = Number(window.padding) || 0;
            const px = (x - ox - window.x) / scale - padding, py = (y - oy - window.y) / scale - padding;
            for (const [id, sprite] of window._turnSprites) {
                if (!sprite.visible || !(sprite.alpha > 0)) continue;
                if (px >= sprite.x && py >= sprite.y && px < sprite.x + sprite._turnSize && py < sprite.y + sprite._turnSize) return id;
            }
        }
        return 0;
    };

    /**
     * Whether a point of the screen is on one of the HUD's unit panels that can be seen. A panel covers the map:
     * what lies behind it is not pointed at through it.
     */
    ReactorUI.fightPanelAt = function(x, y) {
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        const hud = scene && scene._reactorFightHud;
        if (!hud || !hud._nodeWindows || !(hud._visibilityAlpha === undefined || hud._visibilityAlpha > 0)) return false;
        const layer = scene._windowLayer;
        const px = x - (layer ? Number(layer.x) || 0 : 0), py = y - (layer ? Number(layer.y) || 0 : 0);
        for (const window of hud._nodeWindows) {
            const node = window._uiNode;
            if (!node || node.type !== "fightUnit" || !window.visible || !window._fightShown) continue;
            // One that lets a unit or the cursor show through is pointed through as well.
            if (window._coverAlpha !== undefined && window._coverAlpha < 1) continue;
            // A record fitted to another screen is shown at its fit's scale.
            const scale = window._uiFitScale > 0 ? window._uiFitScale : 1;
            if (px >= window.x && py >= window.y && px < window.x + window.width * scale && py < window.y + window.height * scale) return true;
        }
        return false;
    };

    /** Fonts, colors, terms and pictures as the game has them, for the shared drawing. */
    ReactorUI.fightTheme = function() {
        if (this._fightTheme) return this._fightTheme;
        const face = $gameSystem.mainFontFace();
        const theme = {
            _pending: null,
            font: (size, bold) => (bold ? "bold " : "") + size + "px " + face,
            textColor: ColorManager.normalColor(), systemColor: ColorManager.systemColor(),
            outlineColor: ColorManager.outlineColor(), outlineWidth: 3,
            crisisColor: ColorManager.crisisColor(), deathColor: ColorManager.deathColor(),
            gauge: {
                hp: [ColorManager.hpGaugeColor1(), ColorManager.hpGaugeColor2()],
                mp: [ColorManager.mpGaugeColor1(), ColorManager.mpGaugeColor2()],
                tp: [ColorManager.tpGaugeColor1(), ColorManager.tpGaugeColor2()],
                back: ColorManager.gaugeBackColor()
            },
            terms: { level: TextManager.levelA, hp: TextManager.hpA, mp: TextManager.mpA, tp: TextManager.tpA },
            paletteColor: index => ColorManager.textColor(index),
            iconSize: ImageManager.iconWidth || 32,
            faceSize: ImageManager.faceWidth || 144,
            // A picture as something a canvas draws: null while it loads, false when there is none.
            picture(bitmap) {
                if (!bitmap || (bitmap.isError && bitmap.isError())) return false;
                if (!bitmap.isReady()) { this._pending = bitmap; return null; }
                return bitmap._canvas || bitmap._image || bitmap.canvas || false;
            },
            face(name) { return this.picture(ImageManager.loadFace(name)); },
            character(name) { return this.picture(ImageManager.loadCharacter(name)); },
            // Outside the image cache: a map battle may never have shown this picture, and a missing one must not stop the game.
            enemy(name) { return this.picture(ReactorUI.softImage(($gameSystem.isSideView() ? "sv_enemies/" : "enemies/") + name)); },
            icons() { return this.picture(ImageManager.loadSystem("IconSet")); },
            // A model's portrait: a canvas, null while it is being made, false when there is none to be had.
            thumbnail(model) { return ReactorUI.fightThumbnail(model); },
            /** Whether the picture a drawing last waited for has arrived (or failed). */
            settled() {
                const bitmap = this._pending;
                if (bitmap && !bitmap.isReady() && !(bitmap.isError && bitmap.isError())) return false;
                this._pending = null;
                return true;
            }
        };
        this._fightTheme = theme;
        return theme;
    };

    //-------------------------------------------------------------------------
    // Model portraits. A unit shown by a 3D model has its portrait made
    // from the model itself: a copy of the model, lit from beside the camera,
    // drawn once into a small target on the map's own renderer and read back
    // into a canvas the HUD draws like any picture. A rigged humanoid is
    // framed on its head and shoulders (the rig's head-top and chin markers),
    // anything else whole, from the front quarter. One portrait is worked on
    // per frame at most and never while a unit walks or an action plays; a
    // model's pictures and shaders arrive late, so it is drawn again until
    // two drawings agree. The picture is fetched from the graphics card
    // without waiting for it (a fetch that waits costs a whole frame's work
    // each time), and a finished portrait is kept by model and variant for the
    // session, so the next battle makes none again. Nothing here runs without
    // the 3D runtime.

    ReactorUI.FIGHT_CYCLE_FRAMES = 110;
    // Frames between two redraws of a unit panel or the turn strip while an army acts by itself.
    ReactorUI.FIGHT_ARMY_FRAMES = 10;

    ReactorUI.FightPortraits = {
        SIZE: 128,
        // Drawn at twice the size it is kept at: the model is found in the picture and cut out to fill the portrait.
        DRAWN: 256,
        // The target holds linear light; a picture holds sRGB bytes.
        encode: true,
        // Frames between drawings of one portrait, and how many drawings at most.
        WAIT: 24,
        TRIES: 8,
        CONTEXT: { willReadFrequently: true },
        // Finished portraits kept across battles, at most.
        KEEP: 96,
        version: 0,
        entries: new Map(),
        queue: [],
        // The portrait whose picture is on its way back from the graphics card.
        pending: null,
        target: null,
        targetGeneration: -1,
        pixels: null,
        scratch: null,
        lut: null,

        available() {
            return typeof Reactor3D !== "undefined" && typeof THREE !== "undefined" && !!Reactor3D.isLoaded && Reactor3D.isLoaded()
                && !!Reactor3D.loadModel && !!Reactor3D.cloneModelTemplate && !!Reactor3D.acquireViewport;
        },

        keyOf(model) {
            return model && model.name ? [model.name, model.file || "", model.ext || "", model.variant || "", model.texture || ""].join("|") : "";
        },

        /** The portrait of a model if it has been made already; nothing is started. */
        peek(model) {
            const entry = this.entries.get(this.keyOf(model));
            return entry && !entry.failed && entry.canvas ? entry.canvas : false;
        },

        /** The portrait of a model: a canvas, null while it is being made, false when there is none to be had. */
        get(model) {
            const key = this.keyOf(model);
            if (!key) return false;
            let entry = this.entries.get(key);
            if (!entry) {
                if (!this.available()) return false;
                entry = { key, model, canvas: null, failed: false, scene: null, camera: null, object: null, template: null, tries: 0, wait: 0, coverage: -1, loading: true };
                this.entries.set(key, entry);
                this.queue.push(entry);
                this.load(entry);
            }
            return entry.failed ? false : entry.canvas;
        },

        fail(entry) {
            entry.failed = true;
            entry.loading = false;
            this.release(entry);
            this.version++;
        },

        load(entry) {
            const R = Reactor3D, spec = entry.model;
            Promise.all([R.loadModel(spec.name, spec.ext, spec.file, spec.texture), R.loadModelSidecar ? R.loadModelSidecar(spec.name) : null]).then(([template, sidecar]) => {
                if (this.entries.get(entry.key) !== entry) return;
                if (!template) { this.fail(entry); return; }
                if (R.groundAnimatedTemplate) R.groundAnimatedTemplate(template, sidecar);
                const object = R.cloneModelTemplate(template);
                if (R.applyModelTransform && R.readModelTransform) R.applyModelTransform(object, R.readModelTransform(sidecar, spec));
                const rig = R.readModelRig ? R.readModelRig(sidecar) : null;
                if (rig && R.applyModelRig) R.applyModelRig(object, rig);
                else {
                    if (R.carveModelParts && R.readModelParts) R.carveModelParts(object, R.readModelParts(sidecar));
                    if (R.applyPivotOverrides && R.readModelPivots) R.applyPivotOverrides(object, R.readModelPivots(sidecar));
                }
                // The variant this unit wears: its surface, color adjustment and texture.
                if (R.applyModelSurface && R.variantSurface) R.applyModelSurface(object, R.variantSurface(sidecar, spec));
                if (R.applyModelLook && R.modelLook) R.applyModelLook(object, R.modelLook(sidecar, spec));
                const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
                object.scale.setScalar(1.6 / Math.max(extent.x, extent.y, extent.z, 0.0001));
                if (R.applyEventModelPose) R.applyEventModelPose(object, { pitch: spec.pitch, yaw: spec.yaw, roll: spec.roll, faces: spec.faces }, 2, { preview: true, faceYaw: 0 });
                // A posed, skinned mesh is not where its resting bounds say: in a close-up it would be culled away.
                object.traverse(child => { if (child.isMesh) child.frustumCulled = false; });
                const scene = new THREE.Scene();
                scene.add(object);
                scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94a6, 1.7));
                const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
                const sun = new THREE.DirectionalLight(0xffffff, 1.8);
                scene.add(sun);
                entry.head = this.frame(object, rig, sidecar, extent, camera, sun);
                Object.assign(entry, { scene, camera, object, template, loading: false, wait: 0 });
            }).catch(error => {
                console.warn("ReactorUI: no portrait for " + spec.name, error);
                this.fail(entry);
            });
        },

        /**
         * Aim the camera: at the head and shoulders of a rigged humanoid (the
         * rig's head-top and chin markers, where they fall inside the model,
         * else its top seventh), else at the whole model from the front quarter.
         */
        frame(object, rig, sidecar, extent, camera, sun) {
            object.updateMatrixWorld(true);
            // The model's resting size, standing on the ground about its middle (a skinned mesh has no box worth
            // measuring until it has been drawn once).
            const half = new THREE.Vector3(extent.x, extent.y, extent.z).multiplyScalar(object.scale.x / 2);
            const box = new THREE.Box3(new THREE.Vector3(-half.x, 0, -half.z), new THREE.Vector3(half.x, half.y * 2, half.z));
            const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
            const fov = camera.fov * Math.PI / 180;
            const markers = rig && rig.markers ? rig.markers : null;
            let head = null;
            if (markers && markers.headTop && markers.chin) {
                const top = object.localToWorld(new THREE.Vector3(...markers.headTop)), chin = object.localToWorld(new THREE.Vector3(...markers.chin));
                const grown = box.clone().expandByScalar(Math.max(size.x, size.y, size.z) * 0.08);
                if (grown.containsPoint(top) && grown.containsPoint(chin) && top.y > chin.y) head = { top, chin };
            }
            // A humanoid whose markers do not sit in this copy: the top seventh of it is its head.
            if (!head && sidecar && sidecar.rig && sidecar.rig.template === "humanoid") {
                head = { top: new THREE.Vector3(center.x, box.max.y, center.z), chin: new THREE.Vector3(center.x, box.max.y - size.y * 0.14, center.z) };
            }
            if (head) {
                const span = (head.top.y - head.chin.y) * 2.15;
                const middle = new THREE.Vector3((head.top.x + head.chin.x) / 2, head.top.y - span * 0.4, (head.top.z + head.chin.z) / 2);
                const distance = Math.max(0.2, (span / 2) / Math.tan(fov / 2));
                camera.position.set(middle.x + distance * 0.22, middle.y + distance * 0.05, middle.z + distance);
                camera.lookAt(middle);
            } else {
                // From the front quarter, as close as keeps every corner of its box in the picture.
                const yaw = 0.6, pitch = 0.32, tan = Math.tan(fov / 2);
                const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
                const right = new THREE.Vector3(0, 1, 0).cross(back).normalize(), up = back.clone().cross(right).normalize();
                const corner = new THREE.Vector3();
                let distance = 0.1;
                for (let i = 0; i < 8; i++) {
                    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
                    distance = Math.max(distance, corner.dot(back) + Math.max(Math.abs(corner.dot(right)), Math.abs(corner.dot(up))) / tan);
                }
                camera.position.copy(center).addScaledVector(back, distance * 1.04);
                camera.lookAt(center);
            }
            camera.updateProjectionMatrix();
            // A close-up lights from beside the camera, not from overhead.
            sun.position.copy(camera.position).add(new THREE.Vector3(0.6, 0.9, 0.4));
            sun.target.position.copy(head ? head.chin : center);
            if (!sun.target.parent && object.parent) object.parent.add(sun.target);
            return !!head;
        },

        /**
         * One drawing of one portrait. Returns how much of the picture it filled (0 to 1), -1 when it could not draw,
         * or a promise of that share when the picture is fetched without waiting for the graphics card.
         */
        paint(entry) {
            const R = Reactor3D, size = this.SIZE, drawn = this.DRAWN;
            const viewport = R.acquireViewport();
            if (!viewport || !viewport.createTarget || !viewport.renderer || (viewport.isShared && !viewport.isShared())) return -1;
            const renderer = viewport.renderer();
            if (!this.target || this.targetGeneration !== R.contextGeneration) {
                if (this.target) { try { this.target.dispose(); } catch (e) { /* already gone */ } }
                renderer.resetState();
                if (R.clearUnpackState && viewport.pixi) R.clearUnpackState(viewport.pixi().gl);
                this.target = viewport.createTarget(drawn, drawn, 1, { samples: 4 });
                this.targetGeneration = R.contextGeneration;
            }
            if (!this.pixels) this.pixels = new Uint8Array(drawn * drawn * 4);
            const pixels = this.pixels;
            // Drawn outright, shaders and pictures made ready on the spot: the frame it costs is spent while the
            // battle rests, and a portrait that waited for them would show a model with half its parts.
            const color = renderer.getClearColor(this.clearColor || (this.clearColor = new THREE.Color())), alpha = renderer.getClearAlpha();
            let fetched = null;
            try {
                renderer.resetState();
                renderer.setRenderTarget(this.target);
                renderer.setClearColor(0x000000, 0);
                renderer.clear();
                if (R._renderScene) R._renderScene(renderer, entry.scene, entry.camera); else renderer.render(entry.scene, entry.camera);
                // Leaving the target resolves its samples; the picture is read from what is left.
                renderer.setRenderTarget(null);
                if (this.wait !== true && renderer.readRenderTargetPixelsAsync) {
                    // Fetched when the graphics card has it ready: reading it back at once waits for everything the
                    // card still has to draw, 25 to 35 ms a portrait on a weak one.
                    fetched = renderer.readRenderTargetPixelsAsync(this.target, 0, 0, drawn, drawn, pixels);
                    // three leaves its pack buffer bound while it waits; nothing else may read pixels with it bound.
                    const gl = renderer.getContext();
                    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
                } else {
                    renderer.readRenderTargetPixels(this.target, 0, 0, drawn, drawn, pixels);
                }
            } finally {
                renderer.setClearColor(color, alpha);
                renderer.setRenderTarget(null);
                if (viewport._resetPixi) viewport._resetPixi();
            }
            if (fetched) return fetched.then(() => this.develop(entry, pixels));
            return this.develop(entry, pixels);
        },

        /** The picture read back, made into the portrait's canvas. Returns how much of the picture was filled. */
        develop(entry, pixels) {
            const size = this.SIZE, drawn = this.DRAWN;
            if (!this.scratch) {
                this.scratch = document.createElement("canvas");
                this.scratch.width = this.scratch.height = drawn;
                this.lut = new Uint8Array(256);
                for (let i = 0; i < 256; i++) { const c = i / 255; this.lut[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
            }
            // Both canvases are kept in memory (willReadFrequently): a picture the graphics card holds would have to be
            // fetched back, a frame's wait each time, by every panel and turn box drawn from it.
            const scratch = this.scratch.getContext("2d", this.CONTEXT);
            const image = scratch.createImageData(drawn, drawn);
            const data = image.data, lut = this.lut, encode = this.encode;
            let filled = 0, left = drawn, top = drawn, right = -1, bottom = -1;
            // The target's first row is its bottom; its color is multiplied by its alpha.
            for (let y = 0; y < drawn; y++) {
                let from = (drawn - 1 - y) * drawn * 4, to = y * drawn * 4;
                for (let x = 0; x < drawn; x++, from += 4, to += 4) {
                    const a = pixels[from + 3];
                    if (a === 0) continue;
                    const r = Math.min(255, Math.round(pixels[from] * 255 / a)), g = Math.min(255, Math.round(pixels[from + 1] * 255 / a)), b = Math.min(255, Math.round(pixels[from + 2] * 255 / a));
                    data[to] = encode ? lut[r] : r; data[to + 1] = encode ? lut[g] : g; data[to + 2] = encode ? lut[b] : b; data[to + 3] = a;
                    if (a > 24) {
                        filled++;
                        if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
                    }
                }
            }
            scratch.putImageData(image, 0, 0);
            if (!entry.canvas && !entry.staged) {
                entry.staged = document.createElement("canvas");
                entry.staged.width = entry.staged.height = size;
            }
            const context = (entry.canvas || entry.staged).getContext("2d", this.CONTEXT);
            context.clearRect(0, 0, size, size);
            if (right < left) return 0;
            if (entry.head) {
                // Head and shoulders: the picture as it was aimed.
                context.drawImage(this.scratch, 0, 0, drawn, drawn, 0, 0, size, size);
            } else {
                // The whole model: the square round what was drawn, with a little air.
                const side = Math.min(drawn, Math.ceil(Math.max(right - left + 1, bottom - top + 1) * 1.08));
                const sx = Math.round((left + right + 1 - side) / 2), sy = Math.round((top + bottom + 1 - side) / 2);
                context.drawImage(this.scratch, sx, sy, side, side, 0, 0, size, size);
            }
            return filled / (drawn * drawn);
        },

        release(entry) {
            if (entry.object && entry.template && typeof Reactor3D !== "undefined" && Reactor3D.releaseModelInstance) {
                try { Reactor3D.releaseModelInstance(entry.object, entry.template); } catch (e) { /* the model is already gone */ }
            }
            entry.scene = entry.camera = entry.object = entry.template = null;
        },

        /** Once a frame: the pauses run down, and with the battle at rest the first portrait that is due is drawn. */
        update(busy) {
            const queue = this.queue;
            let due = null;
            for (let i = 0; i < queue.length; i++) {
                const entry = queue[i];
                if (entry.failed) { queue.splice(i--, 1); continue; }
                if (entry.loading) continue;
                if (entry.wait > 0) entry.wait--;
                else if (!due) due = entry;
            }
            // One picture at a time: they share the target and the buffer it is read into.
            if (!due || busy || this.pending) return;
            const entry = due;
            let coverage = -1;
            try { coverage = this.paint(entry); } catch (error) {
                console.warn("ReactorUI: portrait drawing failed for " + entry.model.name, error);
                coverage = -2;
            }
            if (coverage && typeof coverage.then === "function") {
                const generation = typeof Reactor3D !== "undefined" ? Reactor3D.contextGeneration : 0;
                this.pending = entry;
                coverage.then(share => share, error => { console.warn("ReactorUI: portrait drawing failed for " + entry.model.name, error); return -2; }).then(share => {
                    if (this.pending === entry) this.pending = null;
                    // The battle ended, or the context was lost, while the picture was on its way.
                    if (this.entries.get(entry.key) !== entry || !entry.scene) return;
                    this.settle(entry, typeof Reactor3D !== "undefined" && Reactor3D.contextGeneration !== generation ? -1 : share);
                });
                return;
            }
            this.settle(entry, coverage);
        },

        /** What a drawing showed: the portrait is put up once something is in it, and is done when two drawings agree. */
        settle(entry, coverage) {
            const queue = this.queue;
            entry.tries++;
            // Shown once something is in the picture; done when two drawings in a row fill the same share of it.
            const settled = coverage > 0.02 && Math.abs(coverage - entry.coverage) < 0.004;
            if (coverage > 0.02) {
                if (!entry.canvas) entry.canvas = entry.staged;
                this.version++;
            }
            entry.coverage = coverage;
            if (settled || coverage === -2 || entry.tries >= this.TRIES) {
                const at = queue.indexOf(entry);
                if (at >= 0) queue.splice(at, 1);
                if (entry.canvas) this.release(entry); else this.fail(entry);
            } else {
                entry.wait = this.WAIT;
            }
        },

        /**
         * The battle is over: what made the portraits goes (the models' copies, the target), and so does a portrait
         * still being made. A finished portrait is a small picture in memory and is kept for the next battle.
         */
        clear() {
            for (const [key, entry] of this.entries) {
                const done = !!entry.canvas && !entry.failed && !entry.scene && !entry.loading && this.queue.indexOf(entry) < 0;
                this.release(entry);
                if (!done) this.entries.delete(key);
            }
            // The oldest go first when a long game has met more models than are worth keeping.
            for (const key of this.entries.keys()) { if (this.entries.size <= this.KEEP) break; this.entries.delete(key); }
            this.queue.length = 0;
            this.pending = null;
            if (this.target) { try { this.target.dispose(); } catch (e) { /* already gone */ } }
            this.target = null;
            this.version++;
        },

        /** Every portrait goes, kept ones too (another project's models, a test). */
        forget() {
            this.clear();
            this.entries.clear();
            this.version++;
        }
    };

    /** A model's portrait for the HUD: a canvas, null while it is being made, false when there is none. */
    ReactorUI.fightThumbnail = function(model) {
        return this.FightPortraits.get(model);
    };

    /** The model a unit is shown by on this map (a flat map draws models too), or null. */
    ReactorUI.fightModelOf = function(unit) {
        if (typeof Reactor3D === "undefined" || !Reactor3D.characterModelSpec || !Reactor3D.isLoaded || !Reactor3D.isLoaded()) return null;
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        const character = fight && fight.character ? fight.character(unit) : null;
        try { return character ? Reactor3D.characterModelSpec(character) || null : null; } catch (error) { return null; }
    };

    /**
     * The highlighted row of the map battle menu that is up, written into
     * `out` (`kind`, `symbol`, `enabled`, `item`, and `key`, a number that
     * changes when the row does), or null with no menu up.
     */
    ReactorUI.fightMenuRow = function(out) {
        const shared = FightHud();
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        if (!shared || !scene) return null;
        const kinds = ReactorUI.FIGHT_MENU_KINDS;
        for (let i = 0; i < kinds.length; i++) {
            const win = scene[shared.WINDOWS[kinds[i]]];
            if (!win || !win.active || !(win.openness > 0) || !win.index) continue;
            const index = win.index();
            if (index < 0) continue;
            out.kind = kinds[i];
            if (kinds[i] === "command") {
                out.symbol = win.commandSymbol ? win.commandSymbol(index) : "";
                out.enabled = win.isCommandEnabled ? win.isCommandEnabled(index) : true;
                out.item = null;
            } else {
                out.symbol = "";
                out.item = win.item ? win.item() : null;
                out.enabled = !out.item || !win.isEnabled || win.isEnabled(out.item);
            }
            out.key = (i + 1) * 100000 + index * 2 + (out.enabled ? 0 : 1);
            return out;
        }
        return null;
    };
    ReactorUI.FIGHT_MENU_KINDS = ["command", "skill", "item"];

    /** Whether the project's icon sheet has a picture at an index (an empty cell has none). */
    ReactorUI.fightIconExists = function(index) {
        const known = this._fightIcons || (this._fightIcons = new Map());
        if (known.has(index)) return known.get(index);
        const bitmap = ImageManager.loadSystem("IconSet");
        if (!bitmap || !bitmap.isReady()) return true;
        const size = ImageManager.iconWidth || 32;
        const source = bitmap._image || bitmap._canvas || bitmap.canvas;
        let exists = index >= 0 && Math.floor(index / 16) * size < bitmap.height;
        if (exists && source) {
            try {
                const probe = this._fightIconProbe || (this._fightIconProbe = document.createElement("canvas"));
                probe.width = probe.height = size;
                const context = probe.getContext("2d", { willReadFrequently: true });
                context.clearRect(0, 0, size, size);
                context.drawImage(source, (index % 16) * size, Math.floor(index / 16) * size, size, size, 0, 0, size, size);
                const data = context.getImageData(0, 0, size, size).data;
                exists = false;
                for (let i = 3; i < data.length; i += 4) if (data[i] > 0) { exists = true; break; }
            } catch (error) { /* a sheet that cannot be read is taken at its word */ }
        }
        known.set(index, exists);
        return exists;
    };

    /**
     * The battle's own commands (Mount, Dismount, Overwatch, Wait, End Turn) on the stock
     * command window, written the way the project writes Attack, Skill and
     * Item so the window draws all its rows alike: the node's word, else the
     * project's (System.json `reactorBattle.terms`), else the stock word in
     * the case of those three; and, where those carry icons, an icon from the
     * project's sheet as the same icon code (the HUD's own drawing only where
     * the sheet has no picture there). The rows share one alignment.
     */
    ReactorUI.styleFightCommands = function(win, node) {
        const shared = FightHud();
        if (!shared || !win.commandSymbol || !win.commandName) return;
        const style = shared.commandStyle([TextManager.attack, TextManager.skill, TextManager.item]);
        const own = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.reactorBattle && $dataSystem.reactorBattle.terms || {};
        const texts = {}, glyphs = {}, words = {};
        for (const key of shared.WINDOW_LABELS) {
            texts[key] = shared.commandText(node, key, own[key], style, index => ReactorUI.fightIconExists(index));
            glyphs[key] = shared.commandGlyph(node, key, texts[key], style);
            words[key] = shared.commandLabel(node, key, own[key], style);
        }
        const commandName = win.commandName, drawItem = win.drawItem;
        win.commandName = function(index) {
            const symbol = this.commandSymbol(index);
            return texts[symbol] !== undefined ? texts[symbol] : commandName.call(this, index);
        };
        win.itemTextAlign = () => node.commandAlign;
        win._fightTextWidth = function(index) {
            const symbol = this.commandSymbol(index);
            if (glyphs[symbol]) return (ImageManager.iconWidth || 32) + 4 + this.textWidth(" " + words[symbol]);
            return this.textSizeEx ? this.textSizeEx(this.commandName(index)).width : this.textWidth(this.commandName(index));
        };
        win.drawItem = function(index) {
            const symbol = this.commandSymbol(index);
            if (!glyphs[symbol]) { drawItem.call(this, index); return; }
            drawGlyphRow(shared, this, index, symbol, words[symbol]);
        };
    };

    // A command row with an icon the HUD draws itself, as a command with an icon code draws: the icon in its 36 pixels, a space, the word.
    function drawGlyphRow(shared, win, index, symbol, name) {
        const rect = win.itemLineRect(index), align = win.itemTextAlign();
        const word = " " + name;
        win.resetFontSettings();
        win.changePaintOpacity(win.isCommandEnabled(index));
        const icon = ImageManager.iconWidth || 32, wordWidth = win.textWidth(word), width = icon + 4 + wordWidth;
        const x = align === "center" ? rect.x + Math.floor((rect.width - width) / 2) : align === "right" ? rect.x + rect.width - width : rect.x;
        const context = win.contents.context;
        context.save();
        context.globalAlpha = win.contents.paintOpacity / 255;
        shared.drawGlyph(context, symbol, x + 2, rect.y + Math.floor((rect.height - icon) / 2), icon, ColorManager.normalColor());
        context.restore();
        // (A word longer than its row is drawn narrower, as a command's is.)
        win.drawText(word, x + icon + 4, rect.y, Math.min(wordWidth + 4, Math.max(8, rect.x + rect.width - (x + icon + 4))), "left");
        touch(win.contents);
    }

    /**
     * A list window sized to what it lists, inside its node's rectangle and
     * against the edges its anchor names: the command window as wide as its
     * widest row and as tall as its rows (squeezed to keep the node's height
     * where they allow, so it stands as tall as the panel beside it); the
     * skill and item lists cut to whole rows.
     */
    ReactorUI.fitFightWindow = function(scene, entry, win) {
        const shared = FightHud(), node = entry.node, state = entry.state;
        // A record fitted to another screen: the window keeps its own size and is shown at the fit's scale.
        const shown = entry.fit ? entry.fit.scale : 1;
        const rect = this.windowRect(entry.rect, scene, entry.fit);
        if (entry.fit && win.scale) win.scale.set(shown, shown);
        let width = rect.width, height = rect.height;
        if (!(width > 0 && height > 0)) return;
        if (node.fightWindow === "command" && node.fitCommands && win._fightTextWidth && win.maxItems) {
            const count = win.maxItems();
            const widths = state.widths || (state.widths = []);
            widths.length = 0;
            for (let i = 0; i < count; i++) widths.push(win._fightTextWidth(i));
            const fit = shared.fitCommands(rect.height, widths, { padding: win.padding, lineHeight: win.lineHeight(), itemPadding: win.itemPadding(),
                colSpacing: win.colSpacing(), iconSize: ImageManager.iconWidth || 32 }, state.fit || (state.fit = {}));
            const itemHeight = fit.itemHeight;
            win.itemHeight = () => itemHeight;
            width = Math.min(Math.max(fit.width, 96), Math.max(rect.width, fit.width));
            height = fit.height;
        } else if (win.itemHeight && win.padding >= 0) {
            const row = win.itemHeight();
            if (row > 0) height = Math.max(1, Math.floor((rect.height - win.padding * 2) / row)) * row + win.padding * 2;
        }
        const ax = (this.ANCHORS[node.anchor] || [0, 0])[0], ay = (this.ANCHORS[node.anchor] || [0, 0])[1];
        const x = Math.round(rect.x + (rect.width - width) * ax * shown), y = Math.round(rect.y + (rect.height - height) * ay * shown);
        if (win.x !== x || win.y !== y || win.width !== width || win.height !== height || state.rows !== (win.maxItems ? win.maxItems() : 0)) {
            win.move(x, y, width, height);
            if (win.createContents) win.createContents();
            try { if (win.refresh) win.refresh(); } catch (error) { console.warn("ReactorUI: " + node.fightWindow + " window refresh", error); }
            state.rows = win.maxItems ? win.maxItems() : 0;
        }
        state.x = x;
        state.y = y;
    };

    /** The Tactical battle running on the map the party stands on, or null (no battle, another map, another mode). */
    ReactorUI.fightNow = function() {
        const shared = FightHud();
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        if (!shared || !fight || typeof fight.isActive !== "function" || !fight.isActive()) return null;
        if (typeof fight.mode === "function" && fight.mode() !== shared.BATTLE_MODE) return null;
        return typeof fight.isHere !== "function" || fight.isHere() ? fight : null;
    };

    /**
     * The Tactical battle HUD record: the one System binds as Tactical Battle
     * (`reactorTacticalInterfaceId`, a Tactical Battle HUD), else the stock
     * layout sized for this screen.
     */
    ReactorUI.fightInterface = function() {
        const hud = FightHud();
        if (!hud || typeof $dataSystem === "undefined" || !$dataSystem) return null;
        const id = hud.boundId($dataSystem);
        const list = window.$dataUserInterfaces;
        const raw = id > 0 && Array.isArray(list) ? list[id] : null;
        if (raw && typeof raw === "object") {
            const record = this.normalizeInterface(raw);
            if (record.id === id && record.mode === hud.MODE) return record;
        }
        const lineHeight = typeof Window_Base !== "undefined" && Window_Base.prototype.lineHeight ? Window_Base.prototype.lineHeight.call({}) : 36;
        return this.normalizeInterface(hud.stockRecord({ width: Graphics.width, height: Graphics.height,
            itemHeight: (Number(lineHeight) || 36) + 8, padding: $gameSystem.windowPadding() }));
    };

    /**
     * A picture a map battle HUD draws into (a turn box, the crosshair, a bar). It is marked as the HUD's own, so
     * the HUD can let it go when the battle ends: a sprite's destruction frees its texture but not the picture
     * behind it, and one battle after another would leave them all with the graphics card's texture list.
     */
    ReactorUI.hudBitmap = function(width, height) {
        const bitmap = new Bitmap(width, height);
        bitmap._rrHud = true;
        return bitmap;
    };

    /** Let go of every picture the HUD made under a window or layer (see hudBitmap). Returns how many. */
    ReactorUI.releaseHudBitmaps = function(container) {
        let freed = 0;
        const visit = object => {
            if (!object) return;
            const bitmap = object._bitmap || null;
            if (bitmap && bitmap._rrHud && bitmap.destroy) { bitmap._rrHud = false; try { bitmap.destroy(); freed++; } catch (error) { /* already gone */ } }
            const children = object.children;
            if (children) for (let i = 0; i < children.length; i++) visit(children[i]);
        };
        visit(container);
        // Pooled sprites wait outside the tree.
        for (const key of ["_turnPool", "_turnMore"]) if (container && Array.isArray(container[key])) for (const sprite of container[key]) visit(sprite);
        if (container && container._turnSprites && container._turnSprites.values) for (const sprite of container._turnSprites.values()) visit(sprite);
        return freed;
    };

    ReactorUI.createFightHud = function(scene, record) {
        let insert = 0;
        const layer = scene._windowLayer;
        this._fightTheme = null;
        // Under the stock windows, so the command menu and messages draw over the panels.
        const hud = this.createOverlay(scene, record, { addWindow: window => layer.addChildAt(window, Math.min(insert++, layer.children.length)) });
        hud._fightNodes = hud._fightNodes || [];
        if (record.openTransition !== "none") hud._visibilityAlpha = 0;
        return hud;
    };

    ReactorUI.destroyFightHud = function(scene, hud) {
        for (const window of hud._nodeWindows) {
            if (window.parent) window.parent.removeChild(window);
            this.releaseHudBitmaps(window);
            if (window.destroy) window.destroy();
        }
        hud._nodeWindows.length = 0;
        if (hud._measureWindow && hud._measureWindow.destroy) hud._measureWindow.destroy();
        this.FightPortraits.clear();
    };

    ReactorUI.updateFightHud = function(scene, hud, fight) {
        const shared = FightHud();
        const reader = shared ? shared.reader(fight) : null;
        // A camera director's shot fades the unit panels and the menus (0 to 1); the strip and the text lines stay.
        const director = typeof ReactorFight !== "undefined" && ReactorFight.Director && ReactorFight.Director.presentation ? ReactorFight.Director.presentation() : null;
        const shot = director && director.hud >= 0 && director.hud < 1 ? director.hud : 1;
        hud._shotAlpha = shot;
        // The battle menu is up: the lines that speak to the player (the hint, the phase banner) stand down behind it.
        const windows = typeof ReactorFight !== "undefined" && ReactorFight.Windows ? ReactorFight.Windows : null;
        const paused = !!(windows && windows.isMenuOpen && windows.isMenuOpen());
        for (const window of hud._nodeWindows) {
            if (!window.updateFight) continue;
            window._bannerHold = paused;
            window.updateFight(reader);
            const info = paused && window.node().type === "fightInfo" ? window.node().fightInfo : "";
            if (!window._fightShown || info === "hint" || info === "phase") window.visible = false;
            else {
                if (window._fightAlpha < 1) window.alpha *= window._fightAlpha;
                if (shot < 1 && window.node().type === "fightUnit") window.alpha *= shot;
                // A unit panel over a unit or the cursor (a small map leaves them under it) lets them show through.
                if (window.node().type === "fightUnit") {
                    const want = this.fightPanelCovers(scene, window, fight) ? this.FIGHT_COVER_ALPHA : 1;
                    const was = window._coverAlpha === undefined ? 1 : window._coverAlpha;
                    window._coverAlpha = Math.abs(want - was) <= this.FIGHT_COVER_STEP ? want : was + Math.sign(want - was) * this.FIGHT_COVER_STEP;
                    if (window._coverAlpha < 1) window.alpha *= window._coverAlpha;
                }
            }
        }
        for (const entry of hud._fightNodes) this.placeFightWindow(scene, hud, entry);
        // Portraits are made while the battle is at rest: never as a unit walks or an action plays.
        if (reader && this.FightPortraits.queue.length) {
            const state = reader.tacticalState();
            this.FightPortraits.update(state === "acting" || state === "moving" || state === "ending");
        }
    };

    // How much of a unit panel shows while a unit or the cursor is under it, and how fast it goes to that and back.
    ReactorUI.FIGHT_COVER_ALPHA = 0.3;
    ReactorUI.FIGHT_COVER_STEP = 0.1;

    /** Whether a unit panel's window lies over a unit or the cursor's cell on the screen. */
    ReactorUI.fightPanelCovers = function(scene, window, fight) {
        const marks = typeof ReactorFight !== "undefined" ? ReactorFight.UnitMarks : null;
        if (!marks || typeof marks.covers !== "function" || !fight || !window.visible) return false;
        const layer = scene._windowLayer, scale = window._uiFitScale > 0 ? window._uiFitScale : 1;
        const x = window.x + (layer ? Number(layer.x) || 0 : 0), y = window.y + (layer ? Number(layer.y) || 0 : 0);
        return marks.covers(fight, x, y, window.width * scale, window.height * scale);
    };

    /** A stock map battle window, moved and sized to its node; it slides in each time it opens. */
    ReactorUI.placeFightWindow = function(scene, hud, entry) {
        const shared = FightHud();
        const node = entry.node;
        const win = shared ? scene[shared.WINDOWS[node.fightWindow]] : null;
        if (!win) return;
        const state = entry.state || (entry.state = {});
        if (state.window !== win) {
            state.window = win;
            entry.fit = hud._interface && hud._interface.fit || null;
            const rect = this.windowRect(entry.rect, scene, entry.fit);
            if (node.windowColumns > 0) win.maxCols = () => node.windowColumns;
            if (node.fightWindow === "command") this.styleFightCommands(win, node);
            state.x = rect.x;
            state.y = rect.y;
            this.fitFightWindow(scene, entry, win);
            state.shown = false;
            state.slide = 0;
        }
        const shown = win.visible && win.openness > 0;
        // Each time it opens its list may be another (a unit with Overwatch, a longer skill list): fitted again. So is
        // a command list that changes while it is up (a unit got on or off a vehicle).
        if (shown && !state.shown) {
            this.fitFightWindow(scene, entry, win);
            state.slide = node.slideDuration;
        } else if (shown && node.fightWindow === "command" && win.maxItems && state.rows !== win.maxItems()) this.fitFightWindow(scene, entry, win);
        state.shown = shown;
        let x = state.x, y = state.y;
        if (state.slide > 0) {
            const t = state.slide / node.slideDuration;
            const shown = entry.fit ? entry.fit.scale : 1;
            x += Math.round(node.slideX * t * shown);
            y += Math.round(node.slideY * t * shown);
            state.slide--;
        }
        win.x = x;
        win.y = y;
        if (node.fill === "none") win.opacity = 0;
        const visible = !node.hideWindow && this.evaluateCondition(node.visible, scene) && hud._visibilityAlpha > 0;
        win.alpha = visible ? node.opacity / 255 * (hud._shotAlpha >= 0 ? hud._shotAlpha : 1) : 0;
    };

    /**
     * The HUD a battle on this map would open, made ahead on a quiet map frame and kept out of sight, so the battle's
     * first frame has only to show it (its windows were the longest thing on that frame). Made only where the map
     * names a unit or spawns one; `scene._reactorFightHudReady` is it, or false where there is nothing to ready.
     */
    ReactorUI.readyFightHud = function(scene) {
        scene._reactorFightHudReady = false;
        const Stage = globalThis.ReactorFight ? globalThis.ReactorFight.Stage : null;
        if (!scene._windowLayer || !FightHud() || !Stage || !Stage.mapRecords || typeof $dataMap === "undefined" || !$dataMap) return null;
        try {
            if (!Stage.mapRecords($dataMap).length) return null;
            const record = this.fightInterface();
            if (!record) return null;
            const hud = this.createFightHud(scene, record);
            for (const window of hud._nodeWindows) window.visible = false;
            scene._reactorFightHudReady = { hud, source: JSON.stringify(record) };
        } catch (error) { scene._reactorFightHudReady = false; }
        return scene._reactorFightHudReady || null;
    };

    /** The HUD for a battle that begins: the one made ahead when it was made from this same record, else a new one. */
    ReactorUI.takeFightHud = function(scene, record) {
        const ready = scene._reactorFightHudReady;
        scene._reactorFightHudReady = undefined;
        if (ready && ready.source === JSON.stringify(record)) { this._fightTheme = null; return ready.hud; }
        // The record was edited, or the screen resized, since: what was made ahead is let go.
        if (ready) this.destroyFightHud(scene, ready.hud);
        return this.createFightHud(scene, record);
    };

    /** Once a frame on the map: the HUD exists exactly while a battle runs here. */
    ReactorUI.updateFightScene = function(scene) {
        const fight = this.fightNow();
        let hud = scene._reactorFightHud;
        if (!fight) {
            // A battle just over: the next one's HUD is made again once the map has had a second to itself.
            if (hud) { this.destroyFightHud(scene, hud); scene._reactorFightHudWait = 60; }
            scene._reactorFightHud = null;
            if (scene._reactorFightHudWait > 0) scene._reactorFightHudWait--;
            else if (scene._reactorFightHudReady === undefined) this.readyFightHud(scene);
            return;
        }
        if (hud === null || hud === undefined) {
            if (!scene._windowLayer) return;
            const record = this.fightInterface();
            scene._reactorFightHud = hud = record ? this.takeFightHud(scene, record) : false;
            // Made on this frame, drawn from the next: the two together are the longest thing the HUD ever does.
            if (hud) { for (const window of hud._nodeWindows) window.visible = false; return; }
        }
        if (hud) {
            // A HUD that fails must never stop the map: it is taken down and the battle plays on without it.
            try {
                hud.update();
                this.updateFightHud(scene, hud, fight);
            } catch (error) {
                console.error("ReactorUI: the map battle HUD failed and was closed", error);
                this.destroyFightHud(scene, hud);
                scene._reactorFightHud = false;
            }
        }
    };

    if (typeof _Scene_Map_update === "function") {
        const _Scene_Map_update_overlays = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            _Scene_Map_update_overlays.apply(this, arguments);
            ReactorUI.updateFightScene(this);
        };
    }

    //-------------------------------------------------------------------------
    // Action and First Person battle HUDs: an Action Battle HUD or a First
    // Person Battle HUD record over Scene_Map while a battle of that mode runs
    // on the map. They are their own thing, as the Tactical HUD is: a Classic
    // battle and a Tactical battle read none of it, and it reads none of
    // theirs. The battle hands over one HUD object (`$gameFight.actionHud()`,
    // refreshed in place every frame); each node is redrawn only when the
    // whole numbers it shows change (a cooldown's shade in 24 steps, a reload
    // in 40), the crosshair, the world bars and the damage marks are sprites
    // that only move, and nothing is allocated or measured per frame.

    function Window_ReactorUIAction() {
        this.initialize(...arguments);
    }

    window.Window_ReactorUIAction = Window_ReactorUIAction;
    Window_ReactorUIAction.prototype = Object.create(Window_ReactorUINode.prototype);
    Window_ReactorUIAction.prototype.constructor = Window_ReactorUIAction;

    Window_ReactorUIAction.prototype.initialize = function(rect, scene, node) {
        this._actionKey = NaN;
        this._actionShown = false;
        this._actionAwaited = false;
        this._actionHud = null;
        this._actionState = null;
        this._flash = null;
        Window_ReactorUINode.prototype.initialize.call(this, rect, scene, node);
    };

    Window_ReactorUIAction.prototype.usesSkin = function() {
        return this._uiNode.fill === "window";
    };

    Window_ReactorUIAction.prototype.refresh = function() {
        if (!this.contents) return;
        this.contents.clear();
        if (this.contentsBack) this.contentsBack.clear();
        this.drawSurface();
        const shared = ActionHud(), hud = this._actionHud, state = this._actionState, node = this._uiNode;
        if (shared && hud && state) {
            const theme = ReactorUI.fightTheme(), context = this.contents.context;
            const width = this.contentsWidth(), height = this.contentsHeight();
            let ready = true;
            if (node.type === "actionVitals") ready = shared.drawVitals(context, width, height, node, hud, state.unit, theme);
            else if (node.type === "actionWeapon") ready = shared.drawWeapon(context, width, height, node, hud, theme, state.extra);
            else if (node.type === "actionHotbar") ready = shared.drawHotbar(context, width, height, node, hud, theme, state.extra);
            else if (node.type === "actionTarget") shared.drawTarget(context, width, height, node, hud, theme);
            else if (node.type === "actionInfo") shared.drawInfo(context, width, height, node, hud, theme, state.feed);
            this._actionAwaited = !ready;
            touch(this.contents);
        }
        this.syncVisualState();
    };

    /** What the node shows now, as one number; a drawing is made only when it changes. */
    Window_ReactorUIAction.prototype.actionKey = function(shared, hud, state) {
        const node = this._uiNode, mix = shared.mix;
        let key = 17;
        if (node.type === "actionVitals") {
            key = mix(mix(mix(mix(mix(key, hud.hp), hud.mhp), hud.mp), hud.mmp), hud.tp);
            key = mix(mix(key, state.iconsKey), state.unitKey);
        } else if (node.type === "actionWeapon") {
            const weapon = hud.weapon, ammo = hud.ammo;
            key = mix(mix(mix(mix(key, weapon.id), weapon.index), weapon.count), ammo.magazine);
            key = mix(mix(mix(mix(key, ammo.capacity), hud.combo), Math.round(ammo.reload * 40)), state.extra.switching ? 1 : 0);
            key = mix(mix(key, state.extra.steps), state.extra.picture ? 1 : 0);
        } else if (node.type === "actionHotbar") {
            const slots = hud.hotbar;
            for (let i = 0; i < slots.length; i++) key = mix(mix(mix(key, slots[i].id), slots[i].usable ? 1 : 0), Math.ceil(slots[i].cooldown * 24));
            key = mix(key, state.revision);
        } else if (node.type === "actionTarget") {
            const target = hud.target;
            key = target ? mix(mix(mix(mix(key, target.unitId), target.hp), target.mhp), target.locked ? 1 : 0) : 0;
        } else if (node.type === "actionInfo") {
            key = node.actionInfo === "feed" ? mix(key, state.feedVersion) : mix(key, state.objectiveVersion);
        }
        return key;
    };

    Window_ReactorUIAction.prototype.updateAction = function(shared, hud, state) {
        const node = this._uiNode;
        this._actionHud = hud;
        this._actionState = state;
        const key = this.actionKey(shared, hud, state);
        if (key !== this._actionKey || (this._actionAwaited && ReactorUI.fightTheme().settled()) || state.pictured) {
            this._actionKey = key;
            this.refresh();
        }
        this._actionShown = node.type === "actionTarget" ? !!hud.target : node.type === "actionHotbar" ? hud.hotbar.length > 0
            : node.type === "actionInfo" ? (node.actionInfo === "feed" ? state.feed.length > 0 : !!hud.objective) : true;
        // Hurt: the vitals flash, as a sprite over them that only fades.
        if (node.type === "actionVitals" && node.damageFlash) {
            const pulse = hud.damage.pulse;
            if (pulse > 0 && !this._flash) {
                this._flash = new Sprite(ReactorUI.hudBitmap(8, 8));
                this._flash.bitmap.fillAll("#d82828");
                this._flash.scale.set(this.width / 8, this.height / 8);
                this.addChild(this._flash);
            }
            if (this._flash) this._flash.opacity = pulse > 0 ? Math.round(pulse * 110) : 0;
        }
    };

    /** The battle of a real-time mode (Action, First Person) running on the map the party stands on, or null. */
    ReactorUI.actionNow = function() {
        const shared = ActionHud();
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        if (!shared || !fight || typeof fight.isActive !== "function" || !fight.isActive() || typeof fight.actionHud !== "function") return null;
        if (typeof fight.mode !== "function" || !shared.isMode(fight.mode())) return null;
        return typeof fight.isHere !== "function" || fight.isHere() ? fight : null;
    };

    /**
     * A real-time mode's HUD record: the one System binds for that mode
     * (`reactorActionInterfaceId` / `reactorFirstPersonInterfaceId`, a record
     * presented as that mode's HUD), else the mode's stock layout.
     */
    ReactorUI.actionInterface = function(mode) {
        const shared = ActionHud();
        if (!shared || !shared.isMode(mode) || typeof $dataSystem === "undefined" || !$dataSystem) return null;
        const id = shared.boundId($dataSystem, mode);
        const list = window.$dataUserInterfaces;
        const raw = id > 0 && Array.isArray(list) ? list[id] : null;
        if (raw && typeof raw === "object") {
            const record = this.normalizeInterface(raw);
            if (record.id === id && record.mode === mode) return record;
        }
        return this.normalizeInterface(shared.stockRecord(mode, { width: Graphics.width, height: Graphics.height }));
    };

    ReactorUI.createActionHud = function(scene, record, mode) {
        let insert = 0;
        const layer = scene._windowLayer, shared = ActionHud(), fightHud = FightHud();
        this._fightTheme = null;
        const hud = this.createOverlay(scene, record, { addWindow: window => layer.addChildAt(window, Math.min(insert++, layer.children.length)) });
        hud._actionMode = mode;
        hud._actionNodes = hud._actionNodes || [];
        if (record.openTransition !== "none") hud._visibilityAlpha = 0;
        // The crosshair, the world bars and the damage marks: sprites under the windows, over the map.
        const sprites = hud._actionLayer = new Sprite();
        if (scene.addChildAt && scene.children) scene.addChildAt(sprites, Math.max(0, scene.children.indexOf(layer)));
        const unit = fightHud ? fightHud.newUnitView() : { icons: [] };
        unit.team = "ally";
        hud._actionState = {
            revision: NaN, unitId: 0, unit, unitKey: 0, iconsKey: 0, iconsFrame: 0, pictured: false, portraits: this.FightPortraits.version,
            extra: { steps: 0, picture: null, carried: [], switching: false, keys: [], costs: [], costColors: [] },
            weaponId: -1, weaponIndex: -1, switchFrames: 0, objective: "", objectiveVersion: 0, feed: [], feedVersion: 0, feedPool: [],
            cross: { gap: 0, onTarget: 0, hit: 0, kill: 0, aiming: 0, reload: 0, sprinting: 0, ranged: 0 }, crossKey: -1, crossSprite: null,
            bars: [], seen: new Map(), lockSprite: null, arcSprite: null, vignetteSprite: null, frame: 0
        };
        // Notices: who fell. Heard only while this HUD is up.
        hud._onDefeated = payload => {
            const state = hud._actionState, node = hud._nodeWindows.map(window => window.node()).find(entry => entry.type === "actionInfo" && entry.actionInfo === "feed");
            if (!node || !payload || !payload.battler || !payload.battler.name) return;
            const line = state.feedPool.pop() || {};
            line.text = shared.label(node, "defeated").replace("%1", payload.battler.name());
            line.color = payload.team === "ally" ? ColorManager.deathColor() : "";
            line.frames = node.feedFrames;
            state.feed.unshift(line);
            if (state.feed.length > node.feedLines) state.feedPool.push(state.feed.pop());
            state.feedVersion++;
        };
        if (typeof ReactorEvents !== "undefined" && ReactorEvents.on) ReactorEvents.on("unitDefeated", hud._onDefeated);
        // The battle's own small HUD stands down while this one is up.
        if (typeof ReactorFight !== "undefined") { hud._stockWas = ReactorFight.stockActionHud; ReactorFight.stockActionHud = false; }
        return hud;
    };

    ReactorUI.destroyActionHud = function(scene, hud) {
        for (const window of hud._nodeWindows) {
            if (window.parent) window.parent.removeChild(window);
            this.releaseHudBitmaps(window);
            if (window.destroy) window.destroy();
        }
        hud._nodeWindows.length = 0;
        if (hud._measureWindow && hud._measureWindow.destroy) hud._measureWindow.destroy();
        if (hud._actionLayer) {
            this.releaseHudBitmaps(hud._actionLayer);
            if (hud._actionLayer.parent) hud._actionLayer.parent.removeChild(hud._actionLayer);
            if (hud._actionLayer.destroy) hud._actionLayer.destroy({ children: true });
        }
        if (hud._onDefeated && typeof ReactorEvents !== "undefined" && ReactorEvents.off) ReactorEvents.off("unitDefeated", hud._onDefeated);
        if (typeof ReactorFight !== "undefined" && ReactorFight.stockActionHud === false) ReactorFight.stockActionHud = hud._stockWas === false ? false : true;
        this.FightPortraits.clear();
    };

    /** What changes only when the battle says so: the player's unit, the weapon's picture and steps, the keys and costs. */
    ReactorUI.refreshActionState = function(fight, hud, data, state) {
        const shared = ActionHud();
        const unit = fight.unit ? fight.unit(data.unitId) : null, battler = unit ? fight.battler(unit) : null;
        const view = state.unit, actor = battler && battler.isActor && battler.isActor();
        view.id = data.unitId; view.name = data.name;
        view.faceName = actor && battler.faceName ? battler.faceName() : "";
        view.faceIndex = actor && battler.faceIndex ? battler.faceIndex() : 0;
        const character = unit && fight.character ? fight.character(unit) : null;
        view.characterName = character && character.characterName ? character.characterName() : "";
        view.characterIndex = character && character.characterIndex ? character.characterIndex() : 0;
        view.model = unit ? this.fightModelOf(unit) : null;
        state.unitKey = data.unitId * 31 + view.faceIndex;
        const extra = state.extra, driver = typeof ReactorFight !== "undefined" ? ReactorFight.Action : null;
        extra.steps = 0;
        if (driver && driver.profile && battler) { try { extra.steps = Number(driver.profile(battler).combo) || 0; } catch (error) { extra.steps = 0; } }
        extra.carried.length = 0;
        const models = typeof Reactor3D !== "undefined" && Reactor3D.databaseModelSpec && Reactor3D.isLoaded && Reactor3D.isLoaded();
        if (driver && driver.weaponsOf && actor) {
            for (const weapon of driver.weaponsOf(battler)) {
                extra.carried.push(weapon.iconIndex || 0);
                // As the battle opens: the portraits of everything carried, so a switch later costs nothing.
                const spec = models && state.frame <= this.ACTION_WARMUP_FRAMES ? Reactor3D.databaseModelSpec("weapons", weapon.id) : null;
                if (spec) this.FightPortraits.get(spec);
            }
        }
        state.weaponSpec = models && data.weapon.id > 0 ? Reactor3D.databaseModelSpec("weapons", data.weapon.id) : null;
        shared.hotbarKeys(typeof Input !== "undefined" ? Input.keyMapper : null, data.hotbar.length, extra.keys);
        extra.costs.length = extra.costColors.length = 0;
        for (const slot of data.hotbar) {
            let cost = "", color = "";
            const skill = slot.kind === "skill" && typeof $dataSkills !== "undefined" ? $dataSkills[slot.id] : null;
            if (skill && battler) {
                const tp = battler.skillTpCost ? battler.skillTpCost(skill) : skill.tpCost, mp = battler.skillMpCost ? battler.skillMpCost(skill) : skill.mpCost;
                if (tp > 0) { cost = String(tp); color = ColorManager.tpCostColor(); } else if (mp > 0) { cost = String(mp); color = ColorManager.mpCostColor(); }
            } else if (slot.kind === "item" && typeof $gameParty !== "undefined" && typeof $dataItems !== "undefined" && $dataItems[slot.id]) {
                cost = "x" + $gameParty.numItems($dataItems[slot.id]);
            }
            extra.costs.push(cost);
            extra.costColors.push(color);
        }
        if (data.objective !== state.objective) { state.objective = data.objective; state.objectiveVersion++; }
    };

    ReactorUI.ACTION_SWITCH_FRAMES = 90;
    ReactorUI.ACTION_WARMUP_FRAMES = 240;
    ReactorUI.ACTION_ICON_FRAMES = 20;

    ReactorUI.updateActionHud = function(scene, hud, fight) {
        const shared = ActionHud(), state = hud._actionState;
        const data = fight.actionHud();
        if (!shared || !data || !data.unitId) return;
        state.frame++;
        const revision = fight.actionRevision ? fight.actionRevision() : state.frame;
        if (revision !== state.revision || data.unitId !== state.unitId) {
            state.revision = revision;
            state.unitId = data.unitId;
            this.refreshActionState(fight, hud, data, state);
        }
        // States come and go without the battle saying so: looked at a few times a second.
        if (state.frame - state.iconsFrame >= this.ACTION_ICON_FRAMES || state.frame === 1) {
            state.iconsFrame = state.frame;
            const unit = fight.unit ? fight.unit(data.unitId) : null, battler = unit ? fight.battler(unit) : null;
            const icons = battler && battler.allIcons ? battler.allIcons() : null;
            let key = 0;
            state.unit.icons.length = 0;
            if (icons) for (let i = 0; i < icons.length; i++) { state.unit.icons.push(icons[i]); key = shared.mix(key, icons[i]); }
            state.iconsKey = key;
        }
        // A weapon change shows what is carried for a moment.
        if (data.weapon.id !== state.weaponId || data.weapon.index !== state.weaponIndex) {
            if (state.weaponId >= 0) state.switchFrames = this.ACTION_SWITCH_FRAMES;
            state.weaponId = data.weapon.id; state.weaponIndex = data.weapon.index;
        }
        if (state.switchFrames > 0) state.switchFrames--;
        state.extra.switching = state.switchFrames > 0;
        // The weapon's own model as its picture. A portrait costs a long frame to make, so every carried weapon's is
        // made as the battle opens; one that turns up later keeps its icon.
        const picture = state.weaponSpec ? (state.frame <= this.ACTION_WARMUP_FRAMES ? this.FightPortraits.get(state.weaponSpec) : this.FightPortraits.peek(state.weaponSpec)) : false;
        state.extra.picture = picture || null;
        if (this.FightPortraits.queue.length) this.FightPortraits.update(false);
        state.pictured = this.FightPortraits.version !== state.portraits;
        state.portraits = this.FightPortraits.version;
        // Notices run out.
        for (let i = state.feed.length - 1; i >= 0; i--) {
            if (--state.feed[i].frames > 0) continue;
            state.feedPool.push(state.feed[i]);
            state.feed.splice(i, 1);
            state.feedVersion++;
        }
        for (const window of hud._nodeWindows) {
            if (!window.updateAction) continue;
            window.updateAction(shared, data, state);
            if (!window._actionShown) window.visible = false;
        }
        for (const entry of hud._actionNodes) {
            const shown = this.evaluateCondition(entry.node.visible, scene) && hud._visibilityAlpha > 0;
            if (entry.node.type === "actionCrosshair") this.updateActionCrosshair(hud, entry, data, state, shown);
            else if (entry.node.type === "actionBars") this.updateActionBars(hud, entry, data, state, shown);
            else this.updateActionDamage(hud, entry, data, state, shown);
        }
    };

    /** The crosshair: one sprite at the battle's aim point, redrawn when its whole-number state changes. */
    ReactorUI.updateActionCrosshair = function(hud, entry, data, state, shown) {
        const shared = ActionHud(), node = entry.node;
        let sprite = state.crossSprite;
        if (!sprite) {
            const size = Math.max(128, Math.max(entry.rect.width, entry.rect.height));
            sprite = state.crossSprite = new Sprite(ReactorUI.hudBitmap(size, size));
            sprite.anchor.set(0.5, 0.5);
            hud._actionLayer.addChild(sprite);
        }
        const cross = shared.crossState(data, typeof $gamePlayer !== "undefined" && $gamePlayer.isDashing && $gamePlayer.isDashing() && $gamePlayer.isMoving(), state.cross);
        // Where the camera does not look down the aim (isometric, top-down, 2D) the battle draws its own mark on the
        // ground: here only the hit and kill markers show.
        const driver = typeof ReactorFight !== "undefined" ? ReactorFight.Action : null;
        const relative = !driver || !driver.relative || driver.relative();
        sprite.visible = shown && (relative || cross.hit > 0 || cross.kill > 0);
        if (!sprite.visible) return;
        sprite.x = Math.round(data.crosshair.x);
        sprite.y = Math.round(data.crosshair.y);
        const key = shared.crossKey(cross);
        if (key !== state.crossKey) {
            state.crossKey = key;
            sprite.bitmap.clear();
            shared.drawCrosshair(sprite.bitmap.context, sprite.bitmap.width, node, cross);
            touch(sprite.bitmap);
        }
    };

    /** Bars over opponents that were hit a moment ago or are aimed at, from a pool; and the mark on the locked one. */
    ReactorUI.updateActionBars = function(hud, entry, data, state, shown) {
        const shared = ActionHud(), node = entry.node, enemies = data.enemies, bars = state.bars;
        const width = node.barWidth, height = node.barHeight, target = data.target;
        let used = 0, locked = null;
        for (let i = 0; shown && i < enemies.length; i++) {
            const enemy = enemies[i];
            let seen = state.seen.get(enemy.unitId);
            if (!seen) state.seen.set(enemy.unitId, seen = { hp: enemy.hp, timer: 0 });
            if (enemy.hp < seen.hp) seen.timer = node.barFrames;
            seen.hp = enemy.hp;
            if (seen.timer > 0) seen.timer--;
            const aimed = !!target && target.unitId === enemy.unitId;
            if (aimed && target.locked) locked = enemy;
            if (!enemy.visible || !(seen.timer > 0 || aimed)) continue;
            let sprite = bars[used];
            if (!sprite) {
                sprite = bars[used] = new Sprite(ReactorUI.hudBitmap(width, height));
                sprite._barKey = -1;
                hud._actionLayer.addChild(sprite);
            }
            used++;
            sprite.visible = true;
            sprite.x = Math.round(enemy.x - width / 2);
            sprite.y = Math.round(enemy.y - height);
            const key = (enemy.mhp > 0 ? Math.round(width * enemy.hp / enemy.mhp) : 0) + (enemy.alerted ? 100000 : 0);
            if (key !== sprite._barKey) {
                sprite._barKey = key;
                sprite.bitmap.clear();
                shared.drawWorldBar(sprite.bitmap.context, width, height, node, enemy.mhp > 0 ? enemy.hp / enemy.mhp : 0, enemy.alerted);
                touch(sprite.bitmap);
            }
        }
        for (let i = used; i < bars.length; i++) bars[i].visible = false;
        state.barsShown = used;
        if (node.lockMarker) {
            let marker = state.lockSprite;
            if (locked && locked.visible && !marker) {
                const size = Math.max(40, Math.round(width * 0.9));
                marker = state.lockSprite = new Sprite(ReactorUI.hudBitmap(size, size));
                marker.anchor.set(0.5, 0);
                shared.drawLockMarker(marker.bitmap.context, size, ColorManager.crisisColor());
                touch(marker.bitmap);
                hud._actionLayer.addChild(marker);
            }
            if (marker) {
                marker.visible = !!locked && locked.visible;
                if (marker.visible) { marker.x = Math.round(locked.x); marker.y = Math.round(locked.y + height); }
            }
        }
    };

    /** Where a hit came from (an arc that turns toward it and fades) and the low-HP edge (one small picture, stretched). */
    ReactorUI.updateActionDamage = function(hud, entry, data, state, shown) {
        const shared = ActionHud(), node = entry.node, damage = data.damage;
        if (node.showDirection) {
            let arc = state.arcSprite;
            const on = shown && damage.pulse > 0 && damage.angle !== null && damage.angle !== undefined;
            if (on && !arc) {
                const size = Math.round(Math.min(Graphics.height * 0.46, 440));
                arc = state.arcSprite = new Sprite(ReactorUI.hudBitmap(size, size));
                arc.anchor.set(0.5, 0.5);
                shared.drawDamageArc(arc.bitmap.context, size, node.enemyColor);
                touch(arc.bitmap);
                hud._actionLayer.addChildAt(arc, 0);
            }
            if (arc) {
                arc.visible = on;
                if (on) {
                    arc.x = Graphics.width / 2; arc.y = Graphics.height / 2;
                    arc.rotation = damage.angle * Math.PI / 180;
                    arc.opacity = Math.round(Math.min(1, damage.pulse * 1.2) * 255);
                }
            }
        }
        if (node.showVignette) {
            const alpha = shown ? shared.vignetteAlpha(node, data.hp, data.mhp) : 0;
            let edge = state.vignetteSprite;
            if (alpha > 0 && !edge) {
                edge = state.vignetteSprite = new Sprite(ReactorUI.hudBitmap(160, 90));
                shared.drawVignette(edge.bitmap.context, 160, 90, node.enemyColor);
                touch(edge.bitmap);
                edge.scale.set(Graphics.width / 160, Graphics.height / 90);
                hud._actionLayer.addChildAt(edge, 0);
            }
            if (edge) {
                edge.visible = alpha > 0;
                // A slow beat, so the edge reads as a warning and not as a tint.
                if (alpha > 0) edge.opacity = Math.round(255 * alpha * (0.82 + 0.18 * Math.sin(state.frame * 0.1)));
            }
        }
    };

    /** Once a frame on the map: the HUD of a real-time mode exists exactly while a battle of that mode runs here. */
    ReactorUI.updateActionScene = function(scene) {
        const fight = this.actionNow();
        let hud = scene._reactorActionHud;
        if (hud && (!fight || hud._actionMode !== fight.mode())) {
            this.destroyActionHud(scene, hud);
            hud = scene._reactorActionHud = null;
        }
        if (!fight) { scene._reactorActionHud = null; return; }
        if (hud === null || hud === undefined) {
            if (!scene._windowLayer) return;
            const record = this.actionInterface(fight.mode());
            scene._reactorActionHud = hud = record ? this.createActionHud(scene, record, fight.mode()) : false;
            // Made on this frame, drawn from the next (as the Tactical HUD is).
            if (hud) { for (const window of hud._nodeWindows) window.visible = false; return; }
        }
        if (hud) {
            // A HUD that fails must never stop the map: it is taken down and the battle's own small one comes back.
            try {
                // The battle is over, or a message is up (the battle waits for it): the HUD leaves the screen to it.
                hud._standDown = !!fight._ending || (typeof $gameMessage !== "undefined" && !!$gameMessage && $gameMessage.isBusy());
                hud.update();
                this.updateActionHud(scene, hud, fight);
            } catch (error) {
                console.error("ReactorUI: the action battle HUD failed and was closed", error);
                this.destroyActionHud(scene, hud);
                scene._reactorActionHud = false;
            }
        }
    };

    if (typeof _Scene_Map_update === "function") {
        const _Scene_Map_update_fight = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            _Scene_Map_update_fight.apply(this, arguments);
            ReactorUI.updateActionScene(this);
        };
    }

    /**
     * A map scene's battle HUDs are let go with it. A scene that ends under a battle (the menu, a transfer, a load,
     * Game Over) never sees the frame on which the battle is over, and what its HUD holds outside the scene would
     * stay for good: the pictures it made, the listener of its feed, the built-in HUD's stand-down.
     */
    ReactorUI.releaseMapHuds = function(scene) {
        const ready = scene._reactorFightHudReady;
        if (ready && ready.hud) this.destroyFightHud(scene, ready.hud);
        scene._reactorFightHudReady = false;
        if (scene._reactorFightHud) this.destroyFightHud(scene, scene._reactorFightHud);
        scene._reactorFightHud = null;
        if (scene._reactorActionHud) this.destroyActionHud(scene, scene._reactorActionHud);
        scene._reactorActionHud = null;
    };

    // As the scene is destroyed, not as it ends: the picture it leaves on screen while the next scene loads keeps its HUD.
    // (The scene's own destroy is its parent's, asked for when called.)
    Scene_Map.prototype.destroy = function() {
        try { ReactorUI.releaseMapHuds(this); } catch (error) { console.warn("ReactorUI: a map battle HUD could not be let go", error); }
        const parent = Object.getPrototypeOf(Scene_Map.prototype);
        if (parent && typeof parent.destroy === "function") return parent.destroy.apply(this, arguments);
    };

    //-------------------------------------------------------------------------
    // Battle HUD: a Battle HUD record over Scene_Battle. Its nodes draw
    // under the stock battle windows; Battle Window nodes place, size and
    // skin those windows (the battle's own flow stays stock, so battle
    // plugins keep working), and a Target Cursor points at the target.

    /** The project's battle HUD record (System 2), or null. */
    ReactorUI.battleInterface = function() {
        if (typeof $dataSystem === "undefined" || !$dataSystem) return null;
        const id = Math.max(0, Math.floor(Number($dataSystem[this.BATTLE_FIELD]) || 0));
        const list = window.$dataUserInterfaces;
        const raw = id > 0 && Array.isArray(list) ? list[id] : null;
        if (!raw || typeof raw !== "object") return null;
        const record = this.normalizeInterface(raw);
        return record.id === id && record.mode === "battle" ? record : null;
    };

    ReactorUI.createBattleHud = function(scene, record) {
        let insert = 0;
        const layer = scene._windowLayer;
        const hud = this.createOverlay(scene, record, { addWindow: window => layer.addChildAt(window, Math.min(insert++, layer.children.length)) });
        hud._battleNodes = hud._battleNodes || [];
        hud._statusPlaced = hud._battleNodes.some(entry => entry.node.type === "battleWindow" && entry.node.battleWindow === "status");
        if (window.Imported && (window.Imported.MOG_BattleHud || window.Imported.VisuMZ_1_BattleCore)) {
            console.warn("ReactorUI: a battle HUD interface is bound while another battle HUD plugin is on; both will draw.");
        }
        hud.slotRect = actor => ReactorUI.battleSlotRect(hud, actor);
        hud.updateBattle = () => ReactorUI.updateBattleHud(scene, hud);
        return hud;
    };

    /** An actor's row in the HUD's party panel, in window-layer coordinates. */
    ReactorUI.battleSlotRect = function(hud, actor) {
        if (!actor) return null;
        for (const window of hud._nodeWindows) {
            const node = window.node();
            if (node.type !== "list" || node.dataSource !== "party" || !window.visible) continue;
            const index = window._uiRows.findIndex(row => row.data === actor);
            if (index < 0) continue;
            const rect = window.itemRect(index), shown = ReactorUI.shownScale(window);
            return { x: window.x + (window.padding + rect.x) * shown, y: window.y + (window.padding + rect.y) * shown, width: rect.width * shown, height: rect.height * shown };
        }
        return null;
    };

    ReactorUI.updateBattleHud = function(scene, hud) {
        if (hud._interface.hideStatusWindow && !hud._statusPlaced && scene._statusWindow) scene._statusWindow.visible = false;
        for (const entry of hud._battleNodes) {
            if (entry.node.type === "battleWindow") this.placeBattleWindow(scene, hud, entry);
            else this.updateBattleCursor(scene, hud, entry);
        }
        // Choosing an ally: a click on their HUD row picks them.
        const actorWindow = scene._actorWindow;
        if (actorWindow && actorWindow.active && TouchInput.isTriggered() && typeof $gameTemp !== "undefined") {
            const x = TouchInput.x - scene._windowLayer.x, y = TouchInput.y - scene._windowLayer.y;
            for (const actor of $gameParty.battleMembers()) {
                const slot = hud.slotRect(actor);
                if (slot && x >= slot.x && y >= slot.y && x < slot.x + slot.width && y < slot.y + slot.height) {
                    $gameTemp.setTouchState(actor, "click");
                    break;
                }
            }
        }
    };

    ReactorUI.placeBattleWindow = function(scene, hud, entry) {
        const node = entry.node;
        const win = scene[this.BATTLE_WINDOWS[node.battleWindow]];
        if (!win) return;
        const state = entry.state || (entry.state = {});
        if (!state.ready) {
            state.ready = true;
            const fit = hud._interface && hud._interface.fit || null;
            const rect = this.windowRect(entry.rect, scene, fit);
            state.scale = fit ? fit.scale : 1;
            if (fit && win.scale) win.scale.set(fit.scale, fit.scale);
            if (node.windowColumns > 0) win.maxCols = () => node.windowColumns;
            // A target window the HUD hides is picked on the battlefield: its order is the
            // battlers' on screen and the arrows step round them (Window_BattleEnemy.visualPick).
            if (node.hideWindow && (node.battleWindow === "enemy" || node.battleWindow === "actor")) win._reactorVisualPick = true;
            this.customizeBattleCommands(scene, win, node);
            if (rect.width > 0 && rect.height > 0) {
                win.move(rect.x, rect.y, rect.width, rect.height);
                if (win.createContents) win.createContents();
                try { if (win.refresh) win.refresh(); } catch (error) { console.warn("ReactorUI: " + node.battleWindow + " window refresh", error); }
            }
            state.x = win.x;
            state.y = win.y;
            if (node.file) {
                state.back = new Sprite(ReactorUI.softImage(node.file));
                state.back.move(node.imageX, node.imageY);
                win.addChildAt(state.back, 0);
            }
            state.shown = false;
            state.slide = 0;
        }
        let x = state.x, y = state.y;
        if (node.followActor) {
            // Between actors (target selection, a turn resolving) it stays where it last followed.
            const actor = typeof BattleManager !== "undefined" ? BattleManager.actor() : null;
            let followed = false;
            if (node.followTarget === "model" && actor) {
                // Over the actor as it stands in the battle (its model in a Battle Room, else its sprite): the window is
                // centered on it, its bottom edge at the top of the figure, and X and Y are offsets from there.
                const sprites = scene._spriteset && scene._spriteset._actorSprites;
                const sprite = sprites ? sprites.find(other => other._battler === actor) : null;
                if (sprite) {
                    const top = this.battlerTop(scene, sprite), layer = scene._windowLayer;
                    state.follow = { x: Math.round(top.x - (layer ? layer.x : 0) - win.width * state.scale / 2 + node.x * state.scale),
                        y: Math.round(top.y - (layer ? layer.y : 0) - win.height * state.scale + node.y * state.scale) };
                    followed = true;
                }
            }
            const slot = followed ? null : hud.slotRect(actor);
            if (slot) state.follow = { x: slot.x + Math.round(node.x * state.scale), y: slot.y + Math.round(node.y * state.scale) };
            // Kept on the screen: on a small game (640x480) the slot's offset would stand it above the top edge.
            if (state.follow) {
                x = state.follow.x; y = state.follow.y;
                if (typeof Graphics !== "undefined" && Graphics.width > 0 && Graphics.height > 0) {
                    x = Math.max(0, Math.min(x, Graphics.width - Math.round(win.width * state.scale)));
                    y = Math.max(0, Math.min(y, Graphics.height - Math.round(win.height * state.scale)));
                }
            }
        }
        const shown = win.visible && win.openness > 0;
        if (shown && !state.shown) state.slide = node.slideDuration;
        state.shown = shown;
        if (state.slide > 0) {
            const t = state.slide / node.slideDuration;
            x += Math.round(node.slideX * t * state.scale);
            y += Math.round(node.slideY * t * state.scale);
            state.slide--;
        }
        win.x = x;
        win.y = y;
        if (node.fill === "none") win.opacity = 0;
        const visible = !node.hideWindow && this.evaluateCondition(node.visible, scene) && hud._visibilityAlpha > 0;
        win.alpha = visible ? node.opacity / 255 : 0;
        if (state.back) {
            state.back.visible = visible && shown;
            state.back.alpha = win.openness / 255;
        }
    };

    /** Command alignment and an authored command list on the Actor or Party Command window. */
    ReactorUI.customizeBattleCommands = function(scene, win, node) {
        const kinds = this.BATTLE_COMMANDS[node.battleWindow];
        if (!kinds) return;
        win.itemTextAlign = () => node.commandAlign;
        const commands = node.commands.filter(command => kinds.includes(command.kind));
        if (!commands.length) return;
        const label = (command, fallback) => command.label || fallback;
        const addCommonEvent = (target, command) => {
            const event = typeof $dataCommonEvents !== "undefined" ? $dataCommonEvents[command.id] : null;
            if (event) target.addCommand(label(command, event.name || "#" + event.id), "rrCommonEvent", true, event.id);
        };
        win.setHandler("rrCommonEvent", () => ReactorUI.runCommandEvent(scene, win, win.currentExt()));
        if (node.battleWindow === "partyCommand") {
            win.makeCommandList = function() {
                for (const command of commands) {
                    if (command.kind === "fight") this.addCommand(label(command, TextManager.fight), "fight");
                    else if (command.kind === "escape") this.addCommand(label(command, TextManager.escape), "escape", BattleManager.canEscape());
                    else addCommonEvent(this, command);
                }
            };
            return;
        }
        win.makeCommandList = function() {
            const actor = this._actor;
            if (!actor) return;
            for (const command of commands) {
                switch (command.kind) {
                    case "attack":
                        // (One who rides a vehicle that can attack may attack with it: reactor_vehicles_mount.js.)
                        this.addCommand(label(command, TextManager.attack), "attack", this.canChooseAttack ? this.canChooseAttack() : actor.canAttack());
                        break;
                    case "skillTypes": this.addSkillCommands(); break;
                    case "skillType":
                        if (!command.knownOnly || actor.skillTypes().includes(command.id)) {
                            this.addCommand(label(command, $dataSystem.skillTypes[command.id] || ""), "skill", true, command.id);
                        }
                        break;
                    case "guard": this.addCommand(label(command, TextManager.guard), "guard", actor.canGuard()); break;
                    case "item": this.addCommand(label(command, TextManager.item), "item"); break;
                    case "escape": this.addCommand(label(command, TextManager.escape), "rrEscape", BattleManager.canEscape()); break;
                    case "skill": {
                        const skill = $dataSkills[command.id];
                        if (skill && (!command.knownOnly || actor.hasSkill(skill.id))) {
                            this.addCommand(label(command, skill.name), "rrSkill", actor.canUse(skill), skill.id);
                        }
                        break;
                    }
                    case "commonEvent": addCommonEvent(this, command); break;
                    default: break;
                }
            }
        };
        win.setHandler("rrEscape", () => ReactorUI.escapeFromActorCommand(scene));
        win.setHandler("rrSkill", () => {
            const skill = $dataSkills[win.currentExt()];
            const action = BattleManager.inputtingAction();
            const actor = BattleManager.actor();
            if (!skill || !action || !actor) return;
            action.setSkill(skill.id);
            actor.setLastBattleSkill(skill);
            scene.onSelectAction();
        });
    };

    /**
     * A Common Event command: the event runs now while the battle waits (time
     * progress stops, its messages show), then the window that chose it opens
     * again for the same actor, or the party. It is not the actor's action;
     * a skill with a Common Event effect is.
     */
    ReactorUI.runCommandEvent = function(scene, win, commonEventId) {
        const event = $dataCommonEvents[commonEventId];
        if (!event) { win.activate(); return; }
        const interpreter = new Game_Interpreter();
        interpreter.setup(event.list, 0);
        scene._rrCommandEvent = { interpreter, party: win === scene._partyCommandWindow };
        win.deactivate();
    };

    /** Runs a Common Event command each frame; returns true while one runs. */
    ReactorUI.updateCommandEvent = function(scene) {
        const running = scene._rrCommandEvent;
        if (!running) return false;
        running.interpreter.update();
        if (running.interpreter.isRunning()) return true;
        scene._rrCommandEvent = null;
        let actor = BattleManager.actor();
        if (actor && !$gameParty.battleMembers().includes(actor)) {
            // The event took the choosing actor out of the party: nobody is choosing now. With time progress
            // the next ready member opens through the usual check; turn-based input goes back to the party.
            BattleManager.cancelActorInput();
            BattleManager._currentActor = null;
            if (BattleManager.isTpb()) BattleManager._inputting = false;
            actor = null;
        }
        if (running.party && BattleManager.isInputting() && !actor) scene.startPartyCommandSelection();
        else if (actor && actor.canInput()) scene.startActorCommandSelection();
        else scene.changeInputWindow();
        return false;
    };

    /**
     * Escape chosen by an actor: the party gives up its choices first, as
     * when Escape is chosen before anyone acts, so a failed escape starts the
     * turn (turn-based) or leaves the party charging (time progress) instead
     * of reopening a command window.
     */
    ReactorUI.escapeFromActorCommand = function(scene) {
        BattleManager.cancelActorInput();
        BattleManager._currentActor = null;
        if (BattleManager.isTpb()) BattleManager._inputting = false;
        scene.commandEscape();
    };

    /** A small downward arrow, the cursor when no image is chosen. */
    ReactorUI.defaultCursorBitmap = function() {
        if (this._defaultCursor) return this._defaultCursor;
        const bitmap = new Bitmap(32, 28);
        const ctx = bitmap.context;
        ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(29, 3); ctx.lineTo(16, 25); ctx.closePath();
        ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.lineWidth = 3;
        ctx.stroke(); ctx.fill();
        touch(bitmap);
        this._defaultCursor = bitmap;
        return bitmap;
    };

    /**
     * The top centre of a battler as it is drawn, in the scene's coordinates:
     * the projected box of a 3D model in a battle room, else the sprite's own
     * picture (its feet are at x, y) wherever the battlefield sits on screen.
     */
    ReactorUI.battlerTop = function(scene, sprite) {
        const spriteset = scene._spriteset;
        const bounds = sprite._reactorRoomBounds, room = spriteset && spriteset._reactorRoomSprite;
        let point;
        if (bounds && room && room.toGlobal) point = room.toGlobal(new Point(bounds.x + bounds.width / 2, bounds.y));
        else {
            const height = sprite.bitmap && sprite.bitmap.isReady && sprite.bitmap.isReady() ? (sprite._frame ? sprite._frame.height : sprite.bitmap.height) * Math.abs(sprite.scale.y) : 64;
            point = sprite.parent && sprite.parent.toGlobal ? sprite.parent.toGlobal(new Point(sprite.x, sprite.y - height)) : new Point(sprite.x, sprite.y - height);
        }
        return scene.toLocal ? scene.toLocal(point) : point;
    };

    /** Where the cursor points: over the chosen enemy, or the chosen ally's HUD row (else their sprite). */
    ReactorUI.battleTarget = function(scene, hud, node) {
        const spriteset = scene._spriteset;
        const enemyWindow = scene._enemyWindow, actorWindow = scene._actorWindow;
        if (enemyWindow && enemyWindow.active && enemyWindow.enemy()) {
            const enemy = enemyWindow.enemy();
            const sprite = spriteset && spriteset._enemySprites ? spriteset._enemySprites.find(s => s._battler === enemy) : null;
            const top = sprite ? this.battlerTop(scene, sprite) : { x: enemy.screenX(), y: enemy.screenY() - 64 };
            return { battler: enemy, x: top.x + node.enemyOffsetX, y: top.y + node.enemyOffsetY };
        }
        if (actorWindow && actorWindow.active) {
            const actor = actorWindow.actor(actorWindow.index());
            if (!actor) return null;
            const slot = hud.slotRect(actor);
            if (slot) return { battler: actor, x: slot.x + slot.width / 2 + scene._windowLayer.x + node.actorOffsetX, y: slot.y + scene._windowLayer.y + node.actorOffsetY };
            const sprite = spriteset && spriteset._actorSprites ? spriteset._actorSprites.find(s => s._battler === actor) : null;
            if (sprite) { const top = this.battlerTop(scene, sprite); return { battler: actor, x: top.x + node.actorOffsetX, y: top.y + node.actorOffsetY }; }
        }
        return null;
    };

    ReactorUI.updateBattleCursor = function(scene, hud, entry) {
        const node = entry.node;
        const state = entry.state || (entry.state = {});
        if (!state.root) {
            state.root = new Sprite();
            const image = ref => ref ? this.softImage(ref.includes("/") ? ref : (node.source === "system" ? "system/" : "pictures/") + ref) : null;
            state.enemyBitmap = image(node.file);
            state.actorBitmap = image(node.actorFile) || state.enemyBitmap;
            state.arrow = new Sprite(this.defaultCursorBitmap());
            state.arrow.anchor.set(0.5, 1);
            state.name = new Sprite(new Bitmap(240, 40));
            state.name.anchor.set(0.5, 1);
            state.root.addChild(state.arrow);
            state.root.addChild(state.name);
            scene.addChild(state.root);
        }
        const target = this.battleTarget(scene, hud, node);
        const visible = !!target && hud._visibilityAlpha > 0 && this.evaluateCondition(node.visible, scene);
        if (!visible) { state.root.visible = false; state.at = null; return; }
        const arrow = state.arrow;
        // Allies and enemies can have their own cursor; a missing picture keeps the plain arrow.
        const wanted = target.battler.isActor && target.battler.isActor() ? state.actorBitmap : state.enemyBitmap;
        const chosen = wanted && !this.softFailed(wanted) ? wanted : this.defaultCursorBitmap();
        if (arrow.bitmap !== chosen) arrow.bitmap = chosen;
        const bitmap = arrow.bitmap;
        if (bitmap && bitmap.isReady()) {
            const fw = Math.floor(bitmap.width / node.frames);
            const frame = Math.floor(Graphics.frameCount / node.frameSpeed) % node.frames;
            arrow.setFrame(fw * frame, 0, fw, bitmap.height);
        }
        const float = node.floatRange ? Math.round(Math.sin(Graphics.frameCount / 10) * node.floatRange) : 0;
        // Sliding eases the cursor from one target to the next.
        if (node.cursorSlide && state.at) {
            state.at.x += (target.x - state.at.x) * 0.35;
            state.at.y += (target.y - state.at.y) * 0.35;
        } else state.at = { x: target.x, y: target.y };
        state.root.move(Math.round(state.at.x), Math.round(state.at.y) + float - node.floatRange);
        state.name.visible = node.showName;
        if (node.showName && state.battler !== target.battler) {
            state.battler = target.battler;
            const name = state.name.bitmap;
            name.clear();
            name.fontSize = node.fontSize > 0 ? node.fontSize : Math.max(16, $gameSystem.mainFontSize() - 4);
            if (node.fontFace) name.fontFace = node.fontFace;
            name.drawText(target.battler.name(), 0, 0, name.width, name.height, "center");
        }
        state.name.y = -(arrow.height || 28) - 2;
        state.root.visible = true;
        state.root.alpha = node.opacity / 255;
    };

    const _Scene_Battle_createDisplayObjects = typeof Scene_Battle !== "undefined" ? Scene_Battle.prototype.createDisplayObjects : null;
    if (_Scene_Battle_createDisplayObjects) {
        Scene_Battle.prototype.createDisplayObjects = function() {
            _Scene_Battle_createDisplayObjects.apply(this, arguments);
            const record = ReactorUI.battleInterface();
            if (record) this._reactorBattleHud = ReactorUI.createBattleHud(this, record);
        };
        const _Scene_Battle_update = Scene_Battle.prototype.update;
        Scene_Battle.prototype.update = function() {
            _Scene_Battle_update.apply(this, arguments);
            ReactorUI.updateCommandEvent(this);
            if (this._reactorBattleHud) {
                this._reactorBattleHud.update();
                this._reactorBattleHud.updateBattle();
            }
        };
    }

    // While a Common Event command runs, battle time stands still and the command windows stay closed.
    if (typeof Scene_Battle !== "undefined") {
        const _isTimeActive = Scene_Battle.prototype.isTimeActive;
        Scene_Battle.prototype.isTimeActive = function() {
            return this._rrCommandEvent ? false : _isTimeActive.apply(this, arguments);
        };
        const _needsInputWindowChange = Scene_Battle.prototype.needsInputWindowChange;
        Scene_Battle.prototype.needsInputWindowChange = function() {
            return this._rrCommandEvent ? false : _needsInputWindowChange.apply(this, arguments);
        };
        // Cancelling the target of a Use a Skill command goes back to the command window, as Attack does.
        const _onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
        Scene_Battle.prototype.onEnemyCancel = function() {
            _onEnemyCancel.apply(this, arguments);
            if (this._actorCommandWindow && this._actorCommandWindow.currentSymbol() === "rrSkill") {
                this._statusWindow.show();
                this._actorCommandWindow.activate();
            }
        };
        const _onActorCancel = Scene_Battle.prototype.onActorCancel;
        Scene_Battle.prototype.onActorCancel = function() {
            _onActorCancel.apply(this, arguments);
            if (this._actorCommandWindow && this._actorCommandWindow.currentSymbol() === "rrSkill") this._actorCommandWindow.activate();
        };
    }

    //-------------------------------------------------------------------------
    // Victory: a Victory record (bound as Victory in Use As,
    // `reactorVictoryInterfaceId`) shown after a won battle, over the battle
    // scene of a Classic battle or over the map of a battle fought on it.
    // The game's own functions give the rewards; each actor is read before
    // and after, so what is shown is what was given. Party Experience, Level
    // Up, Rewards and Victory Text nodes draw the result
    // (reactor_ui_victory.js draws them, the same on the editor's canvas).
    // A project that binds no record keeps the game's message lines. A plugin
    // that replaced the whole victory step never reaches the engine's own, so
    // it keeps the victory; one that words the rewards its own way
    // (BattleManager.displayRewards is no longer the engine's function) keeps
    // its lines. A plugin that only wraps the step and calls on is left to.

    function Window_ReactorUIVictory() {
        this.initialize(...arguments);
    }

    window.Window_ReactorUIVictory = Window_ReactorUIVictory;
    Window_ReactorUIVictory.prototype = Object.create(Window_ReactorUINode.prototype);
    Window_ReactorUIVictory.prototype.constructor = Window_ReactorUIVictory;

    Window_ReactorUIVictory.prototype.initialize = function(rect, scene, node) {
        this._victoryRun = null;
        this._victoryIndex = -1;
        this._victoryMoved = false;
        this._victoryFilling = false;
        this._victoryAwaited = false;
        this._victoryPortraits = 0;
        this._victoryText = "";
        this._victorySize = { width: 0, height: 0 };
        Window_ReactorUINode.prototype.initialize.call(this, rect, scene, node);
    };

    Window_ReactorUIVictory.prototype.usesSkin = function() {
        return this._uiNode.fill === "window";
    };

    /** Room between a painted panel's edge and its parts (a skinned one has the window's own padding). */
    Window_ReactorUIVictory.prototype.victoryInset = function() {
        const node = this._uiNode;
        return node.type !== "victoryText" && (node.fill === "color" || node.fill === "gradient") ? 8 : 0;
    };

    /** The room the node's parts are laid out in; the pages are worked out from it. */
    Window_ReactorUIVictory.prototype.victorySize = function() {
        const inset = this.victoryInset(), size = this._victorySize;
        size.width = Math.max(0, this.contentsWidth() - inset * 2);
        size.height = Math.max(0, this.contentsHeight() - inset * 2);
        return size;
    };

    Window_ReactorUIVictory.prototype.refresh = function() {
        if (!this.contents) return;
        this.contents.clear();
        if (this.contentsBack) this.contentsBack.clear();
        this.drawSurface();
        this.drawVictory(true);
        this.syncVisualState();
    };

    /** Draws the node for the run's page: everything, or only what a frame of the fill changes. */
    Window_ReactorUIVictory.prototype.drawVictory = function(whole) {
        const hud = VictoryHud(), run = this._victoryRun, node = this._uiNode;
        // Only a whole drawing asks for the pictures, so only it says whether one is still awaited.
        if (whole) this._victoryAwaited = false;
        if (!hud || !run) return;
        const theme = ReactorUI.victoryTheme();
        const page = hud.page(run);
        const inset = this.victoryInset(), size = this.victorySize();
        const front = this.contents.context, back = (this.contentsBack || this.contents).context;
        let ready = true;
        front.save();
        front.translate(inset, inset);
        if (node.type === "victoryParty") {
            if (page.kind === "exp") {
                // The cards, pictures and names stay; the bars and numbers are drawn over them each frame of the fill.
                if (whole) {
                    back.save();
                    back.translate(inset, inset);
                    ready = hud.drawParty(back, size.width, size.height, node, run, page, theme, "static");
                    back.restore();
                }
                hud.drawParty(front, size.width, size.height, node, run, page, theme, "moving");
            }
        } else if (node.type === "victoryLevels") {
            if (page.kind === "levelUp") ready = hud.drawLevels(front, size.width, size.height, node, run.summary, page, theme);
        } else if (node.type === "victoryRewards") {
            if (page.kind === "rewards") ready = hud.drawRewards(front, size.width, size.height, node, run.summary, page, theme);
        } else {
            this._victoryText = hud.textOf(node, run, theme);
            hud.drawText(front, size.width, size.height, node, this._victoryText, theme);
        }
        front.restore();
        // A picture file still loading is asked after once a frame; a model's portrait announces itself
        // (FightPortraits.version), so waiting for one draws nothing again until it is made.
        if (whole) this._victoryAwaited = !ready && !!theme._pending;
        touch(this.contents);
        if (whole && this.contentsBack) touch(this.contentsBack);
    };

    /** Once a frame while the interface is up: the node is drawn again only when what it shows has changed. */
    Window_ReactorUIVictory.prototype.updateVictory = function(run) {
        const hud = VictoryHud(), node = this._uiNode;
        if (!hud || !run) return;
        const first = this._victoryRun !== run;
        this._victoryRun = run;
        const portraits = ReactorUI.FightPortraits.version;
        // A picture that was still loading is drawn on the frame it arrives; a model's portrait on the frame it is made.
        const pictured = portraits !== this._victoryPortraits || (this._victoryAwaited && ReactorUI.victoryTheme().settled());
        this._victoryPortraits = portraits;
        if (first || run.index !== this._victoryIndex || pictured) {
            this._victoryIndex = run.index;
            this._victoryMoved = hud.isAnimating(run);
            this._victoryFilling = hud.isFilling(run);
            this.refresh();
            return;
        }
        if (node.type === "victoryParty") {
            // While the bars fill, and once more as they come to rest.
            const moving = hud.isAnimating(run);
            if (moving || this._victoryMoved) {
                this.contents.clear();
                if (node.fill === "window" && node.borderWidth > 0) this.drawBorder(this.contents);
                this.drawVictory(false);
            }
            this._victoryMoved = moving;
        } else if (node.type === "victoryText") {
            // On one page its words change only as the fill ends (the hint appears): nothing is worked out on other frames.
            const filling = hud.isFilling(run);
            if (filling !== this._victoryFilling) {
                this._victoryFilling = filling;
                if (hud.textOf(node, run, ReactorUI.victoryTheme()) !== this._victoryText) this.refresh();
            }
        }
    };

    /** Fonts, colors, pictures and the game's own words, for the shared drawing. */
    ReactorUI.victoryTheme = function() {
        if (this._victoryTheme) return this._victoryTheme;
        const base = this.fightTheme();
        const theme = Object.create(base);
        theme._pending = null;
        const params = [];
        for (let id = 0; id < 8; id++) params.push(TextManager.param(id));
        theme.terms = Object.assign({}, base.terms, {
            exp: TextManager.expA, expName: TextManager.exp, currency: TextManager.currencyUnit, params,
            obtainExp: TextManager.obtainExp, obtainGold: TextManager.obtainGold
        });
        theme.own = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.reactorBattle && $dataSystem.reactorBattle.terms || {};
        this._victoryTheme = theme;
        return theme;
    };

    const Victory = ReactorUI.Victory = {
        FIELD: "reactorVictoryInterfaceId",
        // Frames the interface takes to fade away once closed (the game has its control back at once).
        CLOSE_FRAMES: 10,
        // The least frames between two level-up sounds, so several members leveling together do not stack them.
        SOUND_FRAMES: 10,
        // Frames a won battle waits for a scene to open the interface before it ends without it.
        OPEN_FRAMES: 60,
        _session: null,
        _giving: false,
        // True while the scene under the interface is ending: nothing could show another one then.
        _ending: false,
        _input: { ok: false, cancel: false, held: false },
        // A mouse button that went down while the interface is up (see the listener below).
        _clicked: false,
        // The engine's own wording of the rewards, as it stood before any plugin loaded.
        _engine: typeof BattleManager !== "undefined" ? { displayRewards: BattleManager.displayRewards } : null,

        /** The stored record System binds as Victory (System 2), or null. Nothing is built: it may be asked every frame. */
        bound() {
            const hud = VictoryHud();
            if (!hud || typeof $dataSystem === "undefined" || !$dataSystem) return null;
            const id = hud.boundId($dataSystem);
            const list = window.$dataUserInterfaces;
            const raw = id > 0 && Array.isArray(list) ? list[id] : null;
            if (!raw || typeof raw !== "object") return null;
            return Math.floor(Number(raw.id) || 0) === id && raw.mode === hud.MODE ? raw : null;
        },

        /** The project's Victory record laid out for this screen, or null. Built anew on each call: once a victory. */
        record() {
            const raw = this.bound();
            return raw ? ReactorUI.normalizeInterface(raw) : null;
        },

        /** Whether the project has put a Victory interface to use. */
        isInUse() {
            return !!this.bound();
        },

        /** Whether a plugin words a Classic battle's rewards its own way: its lines play then, and the interface stands down. */
        standsDown() {
            const engine = this._engine;
            return !!engine && typeof BattleManager !== "undefined" && BattleManager.displayRewards !== engine.displayRewards;
        },

        /** True while the rewards are being given: a level gained then is shown by the interface, not by a message. */
        isGiving() {
            return this._giving;
        },

        /** True from the rewards being given until the player closes the interface. */
        isRunning() {
            return !!this._session && !this._session.closed;
        },

        modelOf(actor) {
            if (typeof Reactor3D === "undefined" || !Reactor3D.actorSlotSpec) return null;
            const id = actor.actorId();
            try { return Reactor3D.actorSlotSpec(id, "face") || Reactor3D.actorSlotSpec(id, "character") || Reactor3D.actorSlotSpec(id, "battler") || null; }
            catch (error) { return null; }
        },

        /** What an actor is now: its level, EXP, parameters and skills. */
        snapshot(actor) {
            const params = [];
            for (let id = 0; id < 8; id++) params.push(actor.param(id));
            return {
                actorId: actor.actorId(), name: actor.name(), level: actor.level, exp: actor.currentExp(), params,
                skills: actor.skills(), dead: actor.isDead(), reserve: !actor.isBattleMember(),
                faceName: actor.faceName(), faceIndex: actor.faceIndex(), characterName: actor.characterName(), characterIndex: actor.characterIndex(),
                model: this.modelOf(actor)
            };
        },

        /** The rewards as the game gives them when the caller names no way of its own. */
        give(rewards) {
            if (rewards.gold > 0) $gameParty.gainGold(rewards.gold);
            for (const item of rewards.items || []) $gameParty.gainItem(item, 1);
            for (const actor of $gameParty.allMembers()) actor.gainExp(rewards.exp || 0);
        },

        /**
         * Gives a won battle's rewards and shows them. `rewards` is `{ exp,
         * gold, items }` as the battle made it. `options.give(rewards)` gives
         * them (the default gives gold, items and each member's EXP through
         * the game's own functions); `options.onClose()` is called once, when
         * the player closes the interface; `options.record` shows that record
         * in place of the bound one. Returns false, having done
         * nothing, when the project has no Victory interface in use, one is
         * still being read (`isRunning()`), or the scene under one is ending
         * at this moment: the caller then gives and words the rewards itself.
         * One the player has closed gives way at once, so the next may be
         * started from its `onClose`.
         */
        run(rewards, options) {
            const hud = VictoryHud();
            options = options || {};
            const record = hud && !this.isRunning() && !this._ending ? options.record || this.record() : null;
            if (!record) return false;
            // The one before is only fading away: it is taken down now.
            if (this._session) { this.destroy(this._session); this._session = null; }
            rewards = rewards || {};
            const actors = $gameParty.allMembers();
            const before = actors.map(actor => this.snapshot(actor));
            this._giving = true;
            try { (options.give || this.give).call(this, rewards); } finally { this._giving = false; }
            const members = actors.map((actor, index) => hud.member(before[index], this.snapshot(actor), level => actor.expForLevel(level), actor.isMaxLevel()));
            const summary = { exp: Math.max(0, Number(rewards.exp) || 0), gold: Math.max(0, Number(rewards.gold) || 0), members, items: hud.groupItems(rewards.items) };
            this._session = { summary, record, overlay: null, run: null, scene: null, battle: false, onClose: options.onClose || null, closed: false, fade: 0, sound: 0, frame: 0, waited: 0 };
            return true;
        },

        /**
         * Playtest Interface on a Victory record: a won battle made up from
         * the database (the leader gains a level), shown over the preview's
         * black screen. In a running game the record is not a scene to call.
         */
        preview(scene) {
            const leader = ReactorUI.isPreview() ? $gameParty.leader() : null;
            if (!leader) { scene.popScene(); return; }
            const named = list => (list || []).filter(entry => entry && entry.name);
            const item = named($dataItems)[0], weapon = named($dataWeapons)[0], armor = named($dataArmors)[0];
            const items = [item, item, weapon, armor].filter(Boolean);
            const next = leader.nextLevelExp();
            const exp = Math.max(1, next - leader.currentExp() + Math.round((leader.expForLevel(leader.level + 2) - next) * 0.3));
            if (!this.run({ exp, gold: 120, items }, { record: scene._interface, onClose: () => scene.performClose() })) scene.popScene();
        },

        /** A Classic battle's victory: false where the game's own message lines are to play. */
        classic(manager) {
            if (this.standsDown()) return false;
            if (!this.run(manager._rewards, { give: () => manager.gainRewards() })) return false;
            this._session.battle = true;
            return true;
        },

        /**
         * Asked once a frame by a won battle that waits on the interface:
         * true when no scene has opened it within a second (a plugin's battle
         * scene that never reaches the engine's update), so the battle ends
         * without it. The rewards have been given already.
         */
        unopened() {
            const session = this._session;
            if (!session || session.closed || session.overlay) return false;
            if (++session.waited < this.OPEN_FRAMES) return false;
            console.warn("ReactorUI: no scene opened the Victory interface; the battle ends without it");
            this._session = null;
            this.finish(session);
            return true;
        },

        /**
         * A Classic battle's own windows from the moment the result opens
         * until the battle scene is gone: its HUD interface is hidden and its
         * status window closed, as the game's victory messages close it.
         */
        standDown(scene) {
            const battleHud = scene._reactorBattleHud;
            if (battleHud) for (const window of battleHud._nodeWindows) window.visible = false;
            const status = scene._statusWindow;
            if (status && typeof status.close === "function") status.close();
        },

        open(scene, session) {
            const hud = VictoryHud();
            const layer = scene._windowLayer;
            ReactorUI._fightTheme = null;
            ReactorUI._victoryTheme = null;
            // Over everything else on the screen's window layer.
            const overlay = ReactorUI.createOverlay(scene, session.record, { addWindow: window => layer.addChild(window) });
            if (session.record.openTransition !== "none") overlay._visibilityAlpha = 0;
            const sizes = new Map();
            for (const window of overlay._nodeWindows) if (window.victorySize) sizes.set(window.node().id, window.victorySize());
            const nodes = session.record.nodes;
            const pages = hud.pages(nodes, session.summary, node => sizes.get(node.id) || { width: node.width, height: node.height });
            session.run = hud.newRun(session.summary, pages, nodes.find(node => node.type === "victoryParty") || null);
            session.party = nodes.find(node => node.type === "victoryParty") || null;
            session.overlay = overlay;
            session.scene = scene;
            if (session.battle) scene._reactorVictoryStood = true;
            Input.clear();
            TouchInput.clear();
            this._clicked = false;
        },

        playLevelUp(session) {
            const node = session.party;
            if (node && !node.levelUpSound) return;
            if (session.sound > 0) return;
            session.sound = this.SOUND_FRAMES;
            if (node && node.se) AudioManager.playSe(node.se);
            else SoundManager.playUseItem();
        },

        destroy(session) {
            const overlay = session.overlay;
            session.overlay = null;
            if (!overlay) return;
            for (const window of overlay._nodeWindows) {
                if (window.parent) window.parent.removeChild(window);
                if (window.destroy) window.destroy();
            }
            overlay._nodeWindows.length = 0;
            if (overlay._measureWindow && overlay._measureWindow.destroy) overlay._measureWindow.destroy();
        },

        /** The player closed it (or its scene ended under it): whoever waits is told, once. */
        finish(session) {
            if (session.closed) return;
            session.closed = true;
            const done = session.onClose;
            session.onClose = null;
            if (done) {
                try { done(); } catch (error) { console.error("ReactorUI: the Victory interface's onClose failed", error); }
            }
        },

        /** Once a frame from the scene the interface stands over. */
        updateScene(scene) {
            if (scene._reactorVictoryStood) this.standDown(scene);
            const session = this._session;
            if (!session) return;
            if (session.scene && session.scene !== scene) return;
            // An interface that fails must never hold the game: it is taken down and the wait ends.
            try {
                if (!session.overlay && !session.closed) {
                    if (!scene._windowLayer) return;
                    this.open(scene, session);
                    if (session.battle) this.standDown(scene);
                }
                this.updateSession(session);
            } catch (error) {
                console.error("ReactorUI: the Victory interface failed and was closed", error);
                this.destroy(session);
                // Whoever is told may start the next one: this one is let go of first.
                if (this._session === session) this._session = null;
                this.finish(session);
            }
        },

        updateSession(session) {
            const hud = VictoryHud(), overlay = session.overlay, run = session.run;
            if (session.closed) {
                // Fading away while the game goes on.
                if (++session.fade >= this.CLOSE_FRAMES) { this.destroy(session); this._session = null; return; }
            } else {
                const input = this._input;
                // A click heard by the listener and the same click as TouchInput reports it a frame later are one
                // step: the first is followed by the moment in which no press is heard (ReactorVictoryHud.LOCK_FRAMES).
                input.ok = Input.isTriggered("ok") || this._clicked || TouchInput.isTriggered();
                this._clicked = false;
                input.cancel = Input.isTriggered("cancel") || TouchInput.isCancelled();
                input.held = Input.isLongPressed("ok") || TouchInput.isLongPressed();
                const events = hud.step(run, input);
                if (session.sound > 0) session.sound--;
                if (events & hud.EVENT_LEVEL) this.playLevelUp(session);
                if (events & hud.EVENT_CLOSE) SoundManager.playOk();
                else if (events & (hud.EVENT_PAGE | hud.EVENT_SKIP)) SoundManager.playCursor();
                // Whoever is told may start the next one, which takes this one down: nothing more is done with it this frame.
                if (run.closed) { this.finish(session); return; }
            }
            session.frame++;
            overlay.update();
            const kind = hud.page(run).kind;
            const out = session.closed ? 1 - session.fade / this.CLOSE_FRAMES : 1;
            for (const window of overlay._nodeWindows) {
                const node = window.node();
                const page = hud.pageOf(node);
                if (page && page !== kind) { window.visible = false; continue; }
                if (!window.visible) continue;
                if (window.updateVictory) window.updateVictory(run);
                if (out < 1) window.alpha *= out;
                // The hint breathes, so it reads as waiting for a key.
                else if (node.type === "victoryText" && node.victoryText === "hint") window.alpha *= 0.7 + 0.3 * Math.abs(Math.sin(session.frame / 22));
            }
            if (ReactorUI.FightPortraits.queue.length) ReactorUI.FightPortraits.update(false);
        },

        /** The scene under the interface is ending: nothing is left waiting on it. */
        sceneEnds(scene) {
            const session = this._session;
            if (!session || (session.scene && session.scene !== scene)) return;
            this.destroy(session);
            this._session = null;
            this._ending = true;
            try { this.finish(session); } finally { this._ending = false; }
        }
    };
    window.ReactorVictory = Victory;

    // On a 3D map a click also takes the mouse for the look, and taking it clears TouchInput before the frame
    // that would have read the click: the button is heard here, so one click is always one step.
    if (typeof document !== "undefined" && document.addEventListener) {
        document.addEventListener("mousedown", event => {
            if (event.button === 0 && Victory._session && Victory._session.overlay && !Victory._session.closed) Victory._clicked = true;
        });
    }

    if (typeof BattleManager !== "undefined") {
        // A won battle ends when the player closes the Victory interface.
        const _updateBattleEnd = BattleManager.updateBattleEnd;
        BattleManager.updateBattleEnd = function() {
            if (Victory.isRunning() && !Victory.unopened()) return;
            _updateBattleEnd.apply(this, arguments);
        };
    }
    for (const sceneClass of [typeof Scene_Battle !== "undefined" ? Scene_Battle : null, typeof Scene_Map !== "undefined" ? Scene_Map : null, Scene_ReactorUI]) {
        if (!sceneClass || typeof sceneClass.prototype.update !== "function") continue;
        const _update = sceneClass.prototype.update;
        sceneClass.prototype.update = function() {
            _update.apply(this, arguments);
            Victory.updateScene(this);
        };
        const _terminate = sceneClass.prototype.terminate;
        sceneClass.prototype.terminate = function() {
            Victory.sceneEnds(this);
            if (_terminate) _terminate.apply(this, arguments);
        };
    }
    // On the map the party stands still and the menu stays shut while the result is read.
    if (typeof Game_Player !== "undefined" && typeof Game_Player.prototype.canMove === "function") {
        const _canMove = Game_Player.prototype.canMove;
        Game_Player.prototype.canMove = function() {
            return !Victory.isRunning() && _canMove.apply(this, arguments);
        };
    }
    if (typeof Scene_Map !== "undefined" && typeof Scene_Map.prototype.isMenuEnabled === "function") {
        const _isMenuEnabled = Scene_Map.prototype.isMenuEnabled;
        Scene_Map.prototype.isMenuEnabled = function() {
            return !Victory.isRunning() && _isMenuEnabled.apply(this, arguments);
        };
    }

    ReactorUI.REPLACEMENTS = {
        title: { field: "reactorTitleInterfaceId", scene: "Scene_Title" },
        menu: { field: "reactorMenuInterfaceId", scene: "Scene_Menu" },
        status: { field: "reactorStatusInterfaceId", scene: "Scene_Status" },
        gameEnd: { field: "reactorGameEndInterfaceId", scene: "Scene_GameEnd" },
        options: { field: "reactorOptionsInterfaceId", scene: "Scene_Options" },
        save: { field: "reactorSaveInterfaceId", scene: "Scene_Save" },
        load: { field: "reactorLoadInterfaceId", scene: "Scene_Load" },
        item: { field: "reactorItemInterfaceId", scene: "Scene_Item" },
        skill: { field: "reactorSkillInterfaceId", scene: "Scene_Skill" },
        equip: { field: "reactorEquipInterfaceId", scene: "Scene_Equip" },
        shop: { field: "reactorShopInterfaceId", scene: "Scene_Shop" },
        name: { field: "reactorNameInterfaceId", scene: "Scene_Name" }
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
    // The route a router outside the engine's goto opened, until the call returns.
    ReactorUI._pendingRoute = null;
    // Which methods already have the router installed next to the engine's own.
    ReactorUI._engineRouted = {};

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

    /** The record bound in place of a stock scene class, or 0. */
    ReactorUI.routedId = function(sceneClass) {
        const role = this.replacementRole(sceneClass);
        return role && !this._bypassReplacements.has(role) ? this.replacementId(role) : 0;
    };

    /**
     * The scene is swapped as late as possible, so plugins wrapped around goto
     * and push see the stock class: a pre-title splash that steps in for
     * Scene_Title still plays before a replaced title. The router next to the
     * engine's goto (`engine`, installed before plugins load) makes the swap,
     * and push reaches it through goto. A router installed over plugins only
     * opens a route and, if no call ever reached the engine's router (a plugin
     * that replaced goto outright), swaps the stock scene it left queued.
     */
    ReactorUI.sceneRouter = function(method, base, engine) {
        const router = function(sceneClass) {
            const route = ReactorUI._pendingRoute;
            if (engine && method === "goto") {
                if (route) route.reached = true;
                const id = ReactorUI.routedId(sceneClass);
                if (!id) return base.apply(this, arguments);
                const result = base.call(this, Scene_ReactorUI);
                this.prepareNextScene(id, ReactorUI.replacementRole(sceneClass));
                return result;
            }
            if (route) return base.apply(this, arguments);
            const id = ReactorUI.routedId(sceneClass);
            if (!id) return base.apply(this, arguments);
            const opened = ReactorUI._pendingRoute = { reached: false };
            try {
                const result = base.apply(this, arguments);
                const queued = this._nextScene;
                if (!opened.reached && queued && queued.constructor === sceneClass) {
                    this._nextScene = new Scene_ReactorUI();
                    this.prepareNextScene(id, ReactorUI.replacementRole(sceneClass));
                }
                return result;
            } finally {
                ReactorUI._pendingRoute = null;
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
            const engine = !this._engineRouted[method];
            this._engineRouted[method] = true;
            SceneManager[method] = this.sceneRouter(method, current, engine);
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
        // Both branches below skip the stock start, and a preview can still
        // use an item or open a battle. Installing twice is a no-op.
        if (typeof Game_Action === "function") Game_Action.installMultiElementShim();
        const request = ReactorUI.captureRequest();
        if (request && !DataManager.isBattleTest() && !DataManager.isEventTest()) {
            Scene_Base.prototype.start.call(this);
            // A capture can open Scene_Battle; the stock start that installs the gate is skipped.
            if (typeof Game_Battler === "function") Game_Battler.installBuffRateGate();
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
        // The preview can use an Add Buff item on the party.
        if (typeof Game_Battler === "function") Game_Battler.installBuffRateGate();
        SoundManager.preloadImportantSounds();
        DataManager.setupNewGame();
        ReactorUI._preview = true;
        SceneManager.goto(Scene_ReactorUI);
        SceneManager.prepareNextScene(id);
        this.resizeScreen();
        this.updateDocumentTitle();
    };

})();
