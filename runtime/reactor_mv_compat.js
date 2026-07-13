//=============================================================================
// reactor_mv_compat.js
//=============================================================================
// RPG Maker MV compatibility layer.
// Load after Reactor core scripts and before project plugins.
// Activates only for games authored in RPG Maker MV; dormant otherwise.

(function() {
    "use strict";

    const global = typeof window !== "undefined" ? window : globalThis;

    // This layer serves two distinct purposes, installed as two tiers:
    //
    // TIER 1 -- MV PLUGIN API SUPPORT (always installed). Gap-fills and
    // format-detecting wrappers that are inert unless MV plugin code calls
    // them: MV window/scene/manager APIs, MV-style constructor arguments,
    // the MV pluginCommand bridge, MV save/data/asset format handling, MV
    // textState upgrades. These are what let a project mix MV and MZ
    // plugins freely -- an MZ project that adds an MV plugin gets the APIs
    // that plugin expects, while pure-MZ code paths are untouched.
    //
    // TIER 2 -- MV GAME SEMANTICS (only for games authored in RPG Maker
    // MV). Deliberate global overrides that make the whole game measure
    // and behave like MV: MV window geometry (itemHeight/fittingHeight/
    // itemRect), MV scene layout (top help, no touch UI), MV battle flow
    // (input gate, turn flow, field offset), MV damage popups, MV save
    // encoding. A window cannot use MV and MZ metrics at the same time, so
    // these are mutually exclusive with MZ-authored UI -- applying them to
    // an MZ project visibly breaks it (squeezed command windows, missing
    // item backgrounds).
    //
    // Tier-2 detection: an explicit `window.$reactorMvCompat` boolean wins
    // (the editor's "Install Reactor Runtime" stamps it into index.html,
    // so deployed games -- which exclude the RPG Maker project marker
    // files from staging -- keep the correct mode). Without the flag,
    // probe for an MV project marker beside index.html, which covers
    // playtests of projects converted before the flag existed.
    function projectUsesMvCompat() {
        if (typeof global.$reactorMvCompat === "boolean") return global.$reactorMvCompat;
        // NW.js: probe via fs so a missing marker doesn't spam the console
        // with net::ERR_FILE_NOT_FOUND resource errors.
        try {
            if (typeof require === "function" && typeof process !== "undefined" &&
                process.mainModule && process.mainModule.filename) {
                const fs = require("fs");
                const path = require("path");
                const base = path.dirname(process.mainModule.filename);
                for (const marker of ["Game.rpgproject", "game.rpgproject"]) {
                    const file = path.join(base, marker);
                    if (fs.existsSync(file)) {
                        return /^RPGMV/.test(String(fs.readFileSync(file, "utf8")));
                    }
                }
                return false;
            }
        } catch (e) { /* fall through to the XHR probe */ }
        for (const marker of ["Game.rpgproject", "game.rpgproject"]) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", marker, false);
                xhr.send();
                if ((xhr.status === 200 || xhr.status === 0) &&
                        /^RPGMV/.test(String(xhr.responseText || ""))) {
                    return true;
                }
            } catch (e) { /* missing marker: fall through */ }
        }
        return false;
    }

    const mvGameSemantics = projectUsesMvCompat();

    function isRectangle(value) {
        return value && typeof value === "object" && "x" in value && "y" in value;
    }

    function makeRect(argsLike, owner) {
        const args = Array.prototype.slice.call(argsLike || []);
        if (isRectangle(args[0])) return args[0];
        const x = Number(args[0] || 0);
        const y = Number(args[1] || 0);
        let defaultWidth = Graphics.boxWidth || Graphics.width || 0;
        let defaultHeight = Graphics.boxHeight || Graphics.height || 0;
        // MV Window_Command.initialize builds the command list BEFORE
        // measuring; MZ builds it in refresh() afterwards. Plugin
        // windowWidth()/numVisibleRows() overrides routinely reference
        // maxItems() (YEP_MainMenuManager: Math.ceil(maxItems()/maxCols()))
        // — measured against an empty list the window collapses to
        // fittingHeight(0) = 24px. Build it here; refresh() rebuilds later.
        if (owner && typeof owner.makeCommandList === "function" &&
                owner._list === undefined) {
            try {
                if (typeof owner.clearCommandList === "function") {
                    owner.clearCommandList();
                } else {
                    owner._list = [];
                }
                owner.makeCommandList();
            } catch (e) { /* measurement aid only */ }
        }
        if (owner && typeof owner.windowWidth === "function") {
            try { defaultWidth = owner.windowWidth(); } catch (e) {}
        }
        if (owner && typeof owner.windowHeight === "function") {
            try { defaultHeight = owner.windowHeight(); } catch (e) {}
        }
        const width = Number(args[2] != null ? args[2] : defaultWidth);
        const height = Number(args[3] != null ? args[3] : defaultHeight);
        let finalX = x;
        let finalY = y;
        // MV battle windows position THEMSELVES inside initialize when
        // constructed without coordinates (Window_BattleStatus bottom-
        // right; Party/ActorCommand bottom). MZ deleted that logic — the
        // scene passes a Rectangle instead — so MV-style zero-arg
        // constructions (MOG_BattleHud wraps Window_BattleStatus.initialize
        // and drops the scene's rect) landed at 0,0.
        const noCoords = args[0] == null && args[1] == null;
        if (noCoords && owner) {
            if (global.Window_BattleStatus && owner instanceof Window_BattleStatus) {
                finalX = Graphics.boxWidth - width;
                finalY = Graphics.boxHeight - height;
            } else if ((global.Window_PartyCommand && owner instanceof Window_PartyCommand) ||
                       (global.Window_ActorCommand && owner instanceof Window_ActorCommand)) {
                finalY = Graphics.boxHeight - height;
            }
        }
        return new Rectangle(finalX, finalY, width, height);
    }

    function installJsonExCompatibility() {
        if (!global.JsonEx || !JsonEx.parse || JsonEx.parse.__mvCompatWrapped) return;

        const originalParse = JsonEx.parse;
        const hasOwn = function(value, key) {
            return Object.prototype.hasOwnProperty.call(value, key);
        };
        const resetPrototype = function(value) {
            if (value && typeof value === "object" && hasOwn(value, "@")) {
                if (value["@"] === null) {
                    Object.setPrototypeOf(value, null);
                } else if (value["@"] && global[value["@"]]) {
                    Object.setPrototypeOf(value, global[value["@"]].prototype);
                }
            }
            return value;
        };
        const decodeMvValue = function(value, circulars, registry) {
            if (!value || typeof value !== "object") return value;
            if (!Array.isArray(value) && hasOwn(value, "@a")) {
                const body = value["@a"];
                if (body && typeof body === "object" && hasOwn(value, "@c") && !hasOwn(body, "@c")) {
                    body["@c"] = value["@c"];
                }
                value = body;
            }
            if (!value || typeof value !== "object") return value;

            resetPrototype(value);
            if (hasOwn(value, "@c")) registry[value["@c"]] = value;

            for (const key of Object.keys(value)) {
                const child = value[key];
                if (child && typeof child === "object" && hasOwn(child, "@r")) {
                    circulars.push([value, key, child["@r"]]);
                } else {
                    value[key] = decodeMvValue(child, circulars, registry);
                }
            }
            return value;
        };
        const cleanMetadata = function(root) {
            // Iterative with a visited set: the @r pass above deliberately
            // restores circular references into the graph, so a naive
            // recursive walk chases cycles until the stack overflows
            // (RangeError on loading any MV save with shared refs).
            if (!root || typeof root !== "object") return;
            const visited = new Set();
            const stack = [root];
            while (stack.length > 0) {
                const value = stack.pop();
                if (!value || typeof value !== "object" || visited.has(value)) continue;
                visited.add(value);
                delete value["@"];
                delete value["@c"];
                delete value["@a"];
                delete value["@r"];
                for (const key of Object.keys(value)) {
                    const child = value[key];
                    if (child && typeof child === "object") stack.push(child);
                }
            }
        };
        const parseMvJson = function(json) {
            const circulars = [];
            const registry = {};
            const contents = decodeMvValue(JSON.parse(json), circulars, registry);
            for (const circular of circulars) {
                circular[0][circular[1]] = registry[circular[2]];
            }
            cleanMetadata(contents);
            return contents;
        };

        JsonEx.parse = function(json) {
            if (typeof json === "string" && /"@(a|r|c)"\s*:/.test(json)) {
                return parseMvJson(json);
            }
            const contents = originalParse.apply(this, arguments);
            cleanMetadata(contents);
            return contents;
        };
        JsonEx.parse.__mvCompatWrapped = true;

        // MV-format ENCODER (ported verbatim from MV rpg_core.js). Our
        // parse above faithfully restores MV saves' CIRCULAR references
        // (@r) into the live game objects — but MZ's stringify has no
        // cycle support and dies at maxDepth ("Object too deep") the
        // moment you re-save a game loaded from an MV save. MV's encoder
        // tags visited objects (@c), replaces re-encountered refs with
        // {@r: id} stubs, wraps arrays (@a), and repairs the live object
        // graph afterwards. Output stays loadable by BOTH our parse and
        // real RPG Maker MV.
        // TIER 2 ONLY: this changes the on-disk save format, so MZ-format
        // games keep MZ's encoder and stay byte-compatible with stock MZ.
        if (mvGameSemantics && !JsonEx.stringify.__mvCompatWrapped) {
            const mvGetConstructorName = function(value) {
                return value.constructor ? value.constructor.name : "Object";
            };
            const mvEncode = function(value, circulars, depth) {
                depth = depth || 0;
                if (++depth >= (JsonEx.maxDepth || 100)) {
                    throw new Error("Object too deep");
                }
                const type = Object.prototype.toString.call(value);
                if (type === "[object Object]" || type === "[object Array]") {
                    value["@c"] = JsonEx.__mvCompatId++;
                    const constructorName = mvGetConstructorName(value);
                    if (constructorName !== "Object" && constructorName !== "Array") {
                        value["@"] = constructorName;
                    }
                    for (const key in value) {
                        if ((!value.hasOwnProperty || value.hasOwnProperty(key)) && !key.match(/^@./)) {
                            if (value[key] && typeof value[key] === "object") {
                                if (value[key]["@c"]) {
                                    circulars.push([key, value, value[key]]);
                                    value[key] = { "@r": value[key]["@c"] };
                                } else {
                                    value[key] = mvEncode(value[key], circulars, depth + 1);
                                    if (value[key] instanceof Array) {
                                        // wrap array so @c/@ metadata survives
                                        circulars.push([key, value, value[key]]);
                                        value[key] = {
                                            "@c": value[key]["@c"],
                                            "@a": value[key]
                                        };
                                    }
                                }
                            } else {
                                value[key] = mvEncode(value[key], circulars, depth + 1);
                            }
                        }
                    }
                }
                depth--;
                return value;
            };
            const mvCleanAfterEncode = function(root) {
                // Encode-side cleaner, MV semantics: delete only @ and @c,
                // and KEEP traversing through @a wrappers so the arrays
                // inside get their @c stripped too (the parse-side
                // cleanMetadata deletes @a before traversal — using it here
                // would leave @c tags on live arrays, so the NEXT save
                // would see them as already-visited and emit @r stubs for
                // everything: silent save corruption).
                if (!root || typeof root !== "object") return;
                const visited = new Set();
                const stack = [root];
                while (stack.length > 0) {
                    const value = stack.pop();
                    if (!value || typeof value !== "object" || visited.has(value)) continue;
                    visited.add(value);
                    delete value["@"];
                    delete value["@c"];
                    for (const key of Object.keys(value)) {
                        const child = value[key];
                        if (child && typeof child === "object") stack.push(child);
                    }
                }
            };
            JsonEx.stringify = function(object) {
                const circulars = [];
                JsonEx.__mvCompatId = 1;
                const json = JSON.stringify(mvEncode(object, circulars, 0));
                // repair the LIVE object graph: strip @ metadata (cycles
                // are broken by the @r stubs at this point), then put the
                // real objects back where stubs/wrappers were placed.
                mvCleanAfterEncode(object);
                for (const circular of circulars) {
                    circular[1][circular[0]] = circular[2];
                }
                return json;
            };
            JsonEx.stringify.__mvCompatWrapped = true;
        }
    }

    function ensureArrayClone() {
        if (!Array.prototype.clone) {
            Array.prototype.clone = function() {
                return this.slice(0);
            };
        }
        if (!Array.prototype.contains) {
            Array.prototype.contains = function(element) {
                return this.includes(element);
            };
        }
    }

    function installTypeScriptHelpers() {
        global.__extends = global.__extends || function(d, b) {
            for (const p in b) {
                if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p];
            }
            function __() { this.constructor = d; }
            d.prototype = b === null
                ? Object.create(b)
                : (__.prototype = b.prototype, new __());
        };
    }

    function installUtilsCompatibility() {
        if (!global.Utils) return;

        Utils._id = Utils._id || 1;
        Utils.generateRuntimeId = Utils.generateRuntimeId || function() {
            return Utils._id++;
        };
        Utils.rgbToCssColor = Utils.rgbToCssColor || function(r, g, b) {
            return "rgb(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(b) + ")";
        };
        Utils.canReadGameFiles = Utils.canReadGameFiles || function() {
            const scripts = document.getElementsByTagName("script");
            const lastScript = scripts[scripts.length - 1];
            const xhr = new XMLHttpRequest();
            try {
                xhr.open("GET", lastScript.src, false);
                xhr.overrideMimeType("text/javascript");
                xhr.send();
                return true;
            } catch (e) {
                return false;
            }
        };
        Utils.isSupportPassiveEvent = Utils.isSupportPassiveEvent || function() {
            if (typeof Utils._supportPassiveEvent === "boolean") return Utils._supportPassiveEvent;
            let passive = false;
            const options = Object.defineProperty({}, "passive", {
                get: function() { passive = true; }
            });
            try {
                window.addEventListener("test", null, options);
                window.removeEventListener("test", null, options);
            } catch (e) {}
            Utils._supportPassiveEvent = passive;
            return passive;
        };
    }

    function installInputCompatibility() {
        if (!global.Input || Input.__mvCompatPhysicalKeysWrapped) return;

        Input._mvCompatPhysicalKeys = Input._mvCompatPhysicalKeys || {};
        const originalKeyDown = Input._onKeyDown;
        const originalKeyUp = Input._onKeyUp;
        const originalClear = Input.clear;

        Input.clear = function() {
            originalClear.apply(this, arguments);
            this._mvCompatPhysicalKeys = {};
        };
        Input._onKeyDown = function(event) {
            this._mvCompatPhysicalKeys = this._mvCompatPhysicalKeys || {};
            this._mvCompatPhysicalKeys[event.keyCode] = true;
            return originalKeyDown.apply(this, arguments);
        };
        Input._onKeyUp = function(event) {
            this._mvCompatPhysicalKeys = this._mvCompatPhysicalKeys || {};
            this._mvCompatPhysicalKeys[event.keyCode] = false;
            return originalKeyUp.apply(this, arguments);
        };
        Input.isPhysicalPressed = function(keyCode) {
            return !!(this._mvCompatPhysicalKeys && this._mvCompatPhysicalKeys[keyCode]);
        };
        Input.__mvCompatPhysicalKeysWrapped = true;
    }

    function installGraphicsCompatibility() {
        if (!global.Graphics) return;

        // The counter's positioning/stacking now ships inline in the
        // engine's FPSCounter._createElements; only the MV API names need
        // gap-filling here.
        Graphics.showFps = Graphics.showFps || function() {
            if (this._fpsCounter && this._fpsCounter._boxDiv) {
                this._fpsCounter._boxDiv.style.display = "block";
                this._fpsCounter._showFps = true;
                this._fpsCounter._update();
            }
        };
        Graphics.hideFps = Graphics.hideFps || function() {
            if (this._fpsCounter && this._fpsCounter._boxDiv) this._fpsCounter._boxDiv.style.display = "none";
        };
    }

    function installDecrypterCompatibility() {
        if (global.Decrypter) return;

        function Decrypter() {
            throw new Error("This is a static class");
        }
        Decrypter.hasEncryptedImages = Utils.hasEncryptedImages ? Utils.hasEncryptedImages() : false;
        Decrypter.hasEncryptedAudio = Utils.hasEncryptedAudio ? Utils.hasEncryptedAudio() : false;
        Decrypter._requestImgFile = [];
        Decrypter._headerlength = 16;
        Decrypter._xhrOk = 400;
        Decrypter._encryptionKey = "";
        Decrypter._ignoreList = [];
        Decrypter.checkImgIgnore = function(url) {
            return this._ignoreList && this._ignoreList.indexOf(url) >= 0;
        };
        Decrypter.extToEncryptExt = function(url) {
            const ext = String(url).split(".").pop();
            if (ext === "ogg") return String(url).replace(/\.ogg$/i, ".rpgmvo");
            if (ext === "m4a") return String(url).replace(/\.m4a$/i, ".rpgmvm");
            if (ext === "png") return String(url).replace(/\.png$/i, ".rpgmvp");
            return url;
        };
        Decrypter.cutArrayHeader = function(arrayBuffer, length) {
            return arrayBuffer.slice(length);
        };
        Decrypter.decryptArrayBuffer = function(arrayBuffer) {
            return arrayBuffer;
        };
        Decrypter.createBlobUrl = function(arrayBuffer) {
            return URL.createObjectURL(new Blob([arrayBuffer]));
        };
        Decrypter.decryptImg = function(url, bitmap) {
            if (bitmap && bitmap._image) bitmap._image.src = url;
        };
        Decrypter.decryptHTML5Audio = function(url, bgm, pos) {
            if (global.AudioManager && AudioManager.playBgm) AudioManager.playBgm(bgm, pos);
        };
        Decrypter.readEncryptionkey = function() {};
        global.Decrypter = Decrypter;
    }

    function installDataManagerCompatibility() {
        if (!global.DataManager) return;

        if (DataManager.loadGlobalInfo && !DataManager.loadGlobalInfo.__mvCompatWrapped) {
            const originalLoadGlobalInfo = DataManager.loadGlobalInfo;
            DataManager.loadGlobalInfo = function() {
                if (!this._globalInfo) originalLoadGlobalInfo.apply(this, arguments);
                return this._globalInfo;
            };
            DataManager.loadGlobalInfo.__mvCompatWrapped = true;
        }

        if (!DataManager.loadSavefileInfo) {
            DataManager.loadSavefileInfo = function(savefileId) {
                return this.savefileInfo ? this.savefileInfo(savefileId) : null;
            };
        }
        if (!DataManager.isThisGameFile) {
            DataManager.isThisGameFile = function(savefileId) {
                const info = this.loadSavefileInfo ? this.loadSavefileInfo(savefileId) : null;
                if (!info) return false;
                if (!$dataSystem || !info.title) return true;
                return info.title === $dataSystem.gameTitle;
            };
        }
    }

    function installStorageManagerCompatibility() {
        if (!global.StorageManager || !StorageManager.filePath || StorageManager.filePath.__mvCompatWrapped) return;

        // Format preference is native-first per game type. An MV-authored
        // game reads and writes .rpgsave; an MZ-authored game sticks to
        // .rmmzsave and only falls back to a leftover .rpgsave when no
        // native save exists for that slot (a project ported from MV can
        // carry stale .rpgsave files beside its real saves — preferring
        // them unconditionally made the save menu read an MV-era global
        // index and show none of the actual saves).
        const originalFilePath = StorageManager.filePath;
        StorageManager.filePath = function(saveName) {
            const name = String(saveName);
            if (/\.(rpgsave|rmmzsave)$/i.test(name)) {
                return this.fileDirectoryPath() + name;
            }
            const rpgPath = this.fileDirectoryPath() + name + ".rpgsave";
            const rmmzPath = originalFilePath.call(this, saveName);
            if (this.isLocalMode && this.isLocalMode()) {
                try {
                    const fs = require("fs");
                    const hasRpg = fs.existsSync(rpgPath);
                    const hasRmmz = fs.existsSync(rmmzPath);
                    if (mvGameSemantics) {
                        if (hasRpg || !hasRmmz) return rpgPath;
                    } else if (hasRpg && !hasRmmz) {
                        return rpgPath;
                    }
                } catch (e) {}
            } else if (mvGameSemantics) {
                return rpgPath;
            }
            return rmmzPath;
        };
        StorageManager.filePath.__mvCompatWrapped = true;

        if (StorageManager.zipToJson && !StorageManager.zipToJson.__mvCompatWrapped) {
            const originalZipToJson = StorageManager.zipToJson;
            StorageManager.zipToJson = function(zip) {
                return originalZipToJson.call(this, zip).catch(function() {
                    if (global.LZString && LZString.decompressFromBase64) {
                        const json = LZString.decompressFromBase64(zip);
                        if (json) return json;
                    }
                    throw new Error("Save data could not be decompressed");
                });
            };
            StorageManager.zipToJson.__mvCompatWrapped = true;
        }

        if (!StorageManager.__mvCompatSyncStorage) {
            const saveNameOf = function(savefileId) {
                if (typeof savefileId === "number" && global.DataManager && DataManager.makeSavename) {
                    return DataManager.makeSavename(savefileId);
                }
                return String(savefileId);
            };
            const decodeSaveData = function(data) {
                if (!data) return null;
                try { return pako.inflate(data, { to: "string" }); } catch (e) {}
                if (global.LZString && LZString.decompressFromBase64) {
                    const json = LZString.decompressFromBase64(data);
                    if (json) return json;
                }
                return data;
            };
            const encodeSaveData = function(json) {
                if (global.LZString && LZString.compressToBase64) {
                    return LZString.compressToBase64(json);
                }
                return pako.deflate(json, { to: "string", level: 1 });
            };

            StorageManager.load = function(savefileId) {
                const saveName = saveNameOf(savefileId);
                if (this.isLocalMode && this.isLocalMode()) {
                    return decodeSaveData(this.fsReadFile(this.filePath(saveName)));
                }
                const key = this.forageKey ? this.forageKey(saveName) : saveName;
                let data = null;
                if (global.localStorage) data = localStorage.getItem(key);
                return decodeSaveData(data);
            };

            StorageManager.save = function(savefileId, json) {
                const saveName = saveNameOf(savefileId);
                const data = encodeSaveData(json);
                if (this.isLocalMode && this.isLocalMode()) {
                    this.fsMkdir(this.fileDirectoryPath());
                    this.fsWriteFile(this.filePath(saveName), data);
                } else if (global.localStorage) {
                    const key = this.forageKey ? this.forageKey(saveName) : saveName;
                    localStorage.setItem(key, data);
                }
                return true;
            };

            StorageManager.__mvCompatSyncStorage = true;
        }
    }

    function installPluginCommandBridge() {
        global.oldCommand = function(oldPluginCommand) {
            const text = String(oldPluginCommand || "").trim();
            const args = text.split(/\s+/).filter(Boolean);
            const command = args.shift() || "";
            const interpreter = ($gameMap && $gameMap._interpreter) || new Game_Interpreter();
            interpreter._params = [text];
            interpreter.pluginCommand(command, args);
            return true;
        };
    }

    function installInterpreterCompatibility() {
        if (!global.Game_Interpreter || !Game_Interpreter.prototype) return;

        if (Game_Interpreter.prototype.executeCommand && !Game_Interpreter.prototype.executeCommand.__mvCompatWrapped) {
            const originalExecuteCommand = Game_Interpreter.prototype.executeCommand;
            Game_Interpreter.prototype.executeCommand = function() {
                const command = this.currentCommand && this.currentCommand();
                this._params = command && command.parameters ? command.parameters : [];
                return originalExecuteCommand.apply(this, arguments);
            };
            Game_Interpreter.prototype.executeCommand.__mvCompatWrapped = true;
        }

        for (const name of Object.getOwnPropertyNames(Game_Interpreter.prototype)) {
            if (!/^command\d+$/.test(name)) continue;
            const original = Game_Interpreter.prototype[name];
            if (typeof original !== "function" || original.__mvCompatWrapped || original.length === 0) continue;
            Game_Interpreter.prototype[name] = function(params) {
                return original.call(this, params || this._params || []);
            };
            Game_Interpreter.prototype[name].__mvCompatWrapped = true;
        }

        // MV's interpreter stores the character a route/animation/balloon
        // wait watches on `this._character`; MZ replaced that contract with
        // `this._characterId`. MV plugins that override command205 —
        // follower-control plugins routinely do — set only `_character`, so
        // MZ's updateWaitMode looked up characterId === undefined, which
        // this.character() resolves to the RUNNING EVENT, and the "route"
        // wait dissolved the same tick. Every move route after it then ran
        // in that one tick, each force-replacing the previous one before it
        // took a single step (SSR: the party never walked to the tribunal).
        // Keep both contracts alive: the native commands mirror their
        // target onto `_character`, and the wait check prefers `_character`
        // since it is fresh on either path.
        for (const name of ["command205", "command212", "command213"]) {
            const original = Game_Interpreter.prototype[name];
            if (typeof original !== "function" || original.__mvCharacterMirror) continue;
            Game_Interpreter.prototype[name] = function(params) {
                params = params || this._params || [];
                this._character = this.character(params.length ? params[0] : 0);
                return original.call(this, params);
            };
            Game_Interpreter.prototype[name].__mvCharacterMirror = true;
        }

        if (!Game_Interpreter.prototype.updateWaitMode.__mvCharacterMirror) {
            const baseUpdateWaitMode = Game_Interpreter.prototype.updateWaitMode;
            Game_Interpreter.prototype.updateWaitMode = function() {
                const mvChar = this._character;
                if (mvChar) {
                    let waiting = null;
                    if (this._waitMode === "route" &&
                        typeof mvChar.isMoveRouteForcing === "function") {
                        waiting = !!mvChar.isMoveRouteForcing();
                    } else if (this._waitMode === "animation" &&
                        typeof mvChar.isAnimationPlaying === "function") {
                        waiting = !!mvChar.isAnimationPlaying();
                    } else if (this._waitMode === "balloon" &&
                        typeof mvChar.isBalloonPlaying === "function") {
                        waiting = !!mvChar.isBalloonPlaying();
                    }
                    if (waiting !== null) {
                        if (!waiting) this._waitMode = "";
                        return waiting;
                    }
                }
                return baseUpdateWaitMode.call(this);
            };
            Game_Interpreter.prototype.updateWaitMode.__mvCharacterMirror = true;
        }
    }

    function installWindowCompatibility() {
        if (!global.Window_Base) return;

        Window_Base.prototype.checkRectObject = function(rect) {
            if (!isRectangle(rect)) {
                throw new Error("Argument must be a Rectangle");
            }
        };

        const wrapWindowInit = function(name) {
            const ctor = global[name];
            if (!ctor || !ctor.prototype || typeof ctor.prototype.initialize !== "function") return;
            if (ctor.prototype.initialize.__mvCompatWrapped) return;
            const original = ctor.prototype.initialize;
            ctor.prototype.initialize = function() {
                const args = Array.prototype.slice.call(arguments);
                if (args.length === 0 || !isRectangle(args[0])) {
                    if (name === "Window_Help" && typeof args[0] === "number") {
                        args[0] = new Rectangle(0, 0, Graphics.boxWidth, this.fittingHeight(args[0]));
                    } else {
                        args[0] = makeRect(args, this);
                    }
                    args.length = 1;
                }
                const result = original.apply(this, args);
                this._windowFrameSprite = this._frameSprite;
                this._windowContentsSprite = this._contentsSprite;
                this._windowCursorSprite = this._cursorSprite;
                return result;
            };
            ctor.prototype.initialize.__mvCompatWrapped = true;
        };

        for (const name of Object.keys(global)) {
            if (/^Window_/.test(name)) wrapWindowInit(name);
        }

        Window_Base.prototype.standardPadding = function() {
            return $gameSystem && $gameSystem.windowPadding ? $gameSystem.windowPadding() : 18;
        };
        Window_Base.prototype.textPadding = function() { return 6; };
        Window_Base.prototype.standardBackOpacity = function() {
            return $gameSystem && $gameSystem.windowOpacity ? $gameSystem.windowOpacity() : 192;
        };
        Window_Base.prototype.standardFontFace = function() {
            return $gameSystem && $gameSystem.mainFontFace ? $gameSystem.mainFontFace() : "GameFont";
        };
        Window_Base.prototype.standardFontSize = function() {
            return $gameSystem && $gameSystem.mainFontSize ? $gameSystem.mainFontSize() : 28;
        };
        Window_Base.prototype.textColor = function(n) { return ColorManager.textColor(n); };
        Window_Base.prototype.normalColor = function() { return ColorManager.normalColor(); };
        Window_Base.prototype.systemColor = function() { return ColorManager.systemColor(); };
        Window_Base.prototype.crisisColor = function() { return ColorManager.crisisColor(); };
        Window_Base.prototype.deathColor = function() { return ColorManager.deathColor(); };
        Window_Base.prototype.gaugeBackColor = function() { return ColorManager.gaugeBackColor(); };
        Window_Base.prototype.hpGaugeColor1 = function() { return ColorManager.hpGaugeColor1(); };
        Window_Base.prototype.hpGaugeColor2 = function() { return ColorManager.hpGaugeColor2(); };
        Window_Base.prototype.mpGaugeColor1 = function() { return ColorManager.mpGaugeColor1(); };
        Window_Base.prototype.mpGaugeColor2 = function() { return ColorManager.mpGaugeColor2(); };
        Window_Base.prototype.mpCostColor = function() { return ColorManager.mpCostColor(); };
        Window_Base.prototype.powerUpColor = function() { return ColorManager.powerUpColor(); };
        Window_Base.prototype.powerDownColor = function() { return ColorManager.powerDownColor(); };
        Window_Base.prototype.tpGaugeColor1 = function() { return ColorManager.tpGaugeColor1(); };
        Window_Base.prototype.tpGaugeColor2 = function() { return ColorManager.tpGaugeColor2(); };
        Window_Base.prototype.tpCostColor = function() { return ColorManager.tpCostColor(); };
        Window_Base.prototype.pendingColor = function() { return ColorManager.pendingColor(); };
        Window_Base.prototype.hpColor = function(actor) { return ColorManager.hpColor(actor); };
        Window_Base.prototype.mpColor = function(actor) { return ColorManager.mpColor(actor); };
        Window_Base.prototype.tpColor = function(actor) { return ColorManager.tpColor(actor); };
        Window_Base.prototype.paramchangeTextColor = function(change) {
            return ColorManager.paramchangeTextColor(change);
        };

        if (!Window_Base.prototype.drawGauge) {
            Window_Base.prototype.drawGauge = function(x, y, width, rate, color1, color2) {
                const fillW = Math.floor(width * rate);
                const gaugeY = y + this.lineHeight() - 8;
                this.contents.fillRect(x, gaugeY, width, 6, this.gaugeBackColor());
                this.contents.gradientFillRect(x, gaugeY, fillW, 6, color1, color2);
            };
        }

        Window_Base.prototype.reserveFaceImages = function() {
            if (this._actor && this._actor.faceName) ImageManager.loadFace(this._actor.faceName());
        };
        Window_Base.prototype.canvasToLocalX = function(x) {
            const local = this.worldTransform.applyInverse(new Point(x, TouchInput.y));
            return local.x;
        };
        Window_Base.prototype.canvasToLocalY = function(y) {
            const local = this.worldTransform.applyInverse(new Point(TouchInput.x, y));
            return local.y;
        };
        Window_Base.prototype.updateButtonsVisiblity = function() {};

        // MV font routing: MZ's resetFontSettings reads $gameSystem.
        // mainFontFace()/mainFontSize() directly, bypassing the
        // standardFontFace()/standardFontSize() hooks where MV plugins
        // apply the game's configured font (YEP_CoreEngine "Font Size" —
        // this game sets 23; MZ's default 26 rendered everything
        // oversized). MV verbatim; our standard* defaults below delegate
        // to $gameSystem main* anyway, so without plugin overrides the
        // behavior is unchanged.
        Window_Base.prototype.resetFontSettings = function() {
            this.contents.fontFace = this.standardFontFace();
            this.contents.fontSize = this.standardFontSize();
            this.resetTextColor();
        };

        if (global.Window_Selectable) {
            // MV plugins measure with spacing()/itemRectForText(), which MZ
            // removed. Pure gap-fills: under MZ metrics itemRectForText
            // resolves against MZ's itemRect, under MV metrics (tier 2)
            // against MV's.
            Window_Selectable.prototype.spacing = function() { return 12; };
            Window_Selectable.prototype.itemRectForText = function(index) {
                const rect = this.itemRect(index);
                rect.x += this.textPadding();
                rect.width -= this.textPadding() * 2;
                return rect;
            };
            if (Window_Selectable.prototype.setHandler && !Window_Selectable.prototype.setHandler.__mvCompatWrapped) {
                const originalSetHandler = Window_Selectable.prototype.setHandler;
                Window_Selectable.prototype.setHandler = function(symbol, method) {
                    this._handlers = this._handlers || {};
                    return originalSetHandler.call(this, symbol, method);
                };
                Window_Selectable.prototype.setHandler.__mvCompatWrapped = true;
            }
            if (Window_Selectable.prototype.isHandled && !Window_Selectable.prototype.isHandled.__mvCompatWrapped) {
                const originalIsHandled = Window_Selectable.prototype.isHandled;
                Window_Selectable.prototype.isHandled = function(symbol) {
                    this._handlers = this._handlers || {};
                    return originalIsHandled.call(this, symbol);
                };
                Window_Selectable.prototype.isHandled.__mvCompatWrapped = true;
            }
        }
        if (global.Window_Command) {
            // MV's Window_Command.refresh RECREATES contents; MZ's does not
            // (MZ windows are fixed-size from their rect). MV plugins resize
            // a window then call refresh() expecting a fresh contents bitmap
            // — YEP_SaveCore's confirm dialog set width to fit its text but
            // kept drawing on the old 240px-wide contents, clipping the text
            // ("Do you wish to load t…"). MV verbatim, deliberate override.
            Window_Command.prototype.refresh = function() {
                this.clearCommandList();
                this.makeCommandList();
                this.createContents();
                Window_Selectable.prototype.refresh.call(this);
            };
            Window_Command.prototype.windowWidth = Window_Command.prototype.windowWidth || function() { return 240; };
            Window_Command.prototype.windowHeight = Window_Command.prototype.windowHeight || function() {
                return this.fittingHeight(this.numVisibleRows());
            };
            // Own-property check, NOT `||`: MZ's Window_Selectable has an
            // inherited numVisibleRows that derives rows FROM innerHeight
            // (0 during construction) — the `||` saw it as present and MV's
            // maxItems-based version (which window HEIGHT derives from)
            // never installed. Result: every MV window sized via
            // fittingHeight(numVisibleRows()) measured zero rows
            // (LeTBS's "Begin Battle?" confirm lost its Confirm/Cancel row).
            if (!Object.prototype.hasOwnProperty.call(Window_Command.prototype, "numVisibleRows")) {
                Window_Command.prototype.numVisibleRows = function() {
                    return Math.ceil(this.maxItems() / Math.max(1, this.maxCols()));
                };
            }
            if (Window_Command.prototype.maxItems && !Window_Command.prototype.maxItems.__mvCompatWrapped) {
                const originalMaxItems = Window_Command.prototype.maxItems;
                Window_Command.prototype.maxItems = function() {
                    this._list = this._list || [];
                    return originalMaxItems.call(this);
                };
                Window_Command.prototype.maxItems.__mvCompatWrapped = true;
            }
            if (Window_Command.prototype.addCommand && !Window_Command.prototype.addCommand.__mvCompatWrapped) {
                const originalAddCommand = Window_Command.prototype.addCommand;
                Window_Command.prototype.addCommand = function() {
                    this._list = this._list || [];
                    return originalAddCommand.apply(this, arguments);
                };
                Window_Command.prototype.addCommand.__mvCompatWrapped = true;
            }
        }
        if (global.Window_HorzCommand) {
            if (!Object.prototype.hasOwnProperty.call(Window_HorzCommand.prototype, "numVisibleRows")) {
                Window_HorzCommand.prototype.numVisibleRows = function() {
                    return 1;
                };
            }
        }
        if (global.Window_Scrollable && Window_Scrollable.prototype.initialize &&
            !Window_Scrollable.prototype.initialize.__mvCompatScrollWrapped) {
            const originalScrollableInitialize = Window_Scrollable.prototype.initialize;
            Window_Scrollable.prototype.initialize = function() {
                this.clearScrollStatus = this.clearScrollStatus || function() {
                    this._scrollTargetX = 0;
                    this._scrollTargetY = 0;
                    this._scrollDuration = 0;
                    this._scrollAccelX = 0;
                    this._scrollAccelY = 0;
                    this._scrollTouching = false;
                    this._scrollLastTouchX = 0;
                    this._scrollLastTouchY = 0;
                };
                return originalScrollableInitialize.apply(this, arguments);
            };
            Window_Scrollable.prototype.initialize.__mvCompatScrollWrapped = true;
        }
        if (global.WindowLayer) {
            WindowLayer.prototype.move = function(x, y, width, height) {
                this.x = x;
                this.y = y;
                this.width = width;
                this.height = height;
            };
        }

        if (global.Window_Message) {
            if (!Object.prototype.hasOwnProperty.call(Window_Message.prototype, "numVisibleRows")) {
                Window_Message.prototype.numVisibleRows = function() { return 4; };
            }
            Window_Message.prototype.windowWidth = Window_Message.prototype.windowWidth || function() {
                return $gameSystem && $gameSystem.messageWidth ? $gameSystem.messageWidth() : Graphics.boxWidth;
            };
            Window_Message.prototype.windowHeight = Window_Message.prototype.windowHeight || function() {
                return this.fittingHeight(this.numVisibleRows());
            };
            Window_Message.prototype.createSubWindows = Window_Message.prototype.createSubWindows || function() {};
            Window_Message.prototype.subWindows = Window_Message.prototype.subWindows || function() {
                return [this._goldWindow, this._choiceWindow, this._numberWindow, this._itemWindow].filter(Boolean);
            };
            const getNameBox = function(messageWindow) {
                return messageWindow._nameBoxWindow || messageWindow._nameWindow;
            };
            const normalizeNameBox = function(messageWindow, nameBox) {
                nameBox = nameBox || getNameBox(messageWindow);
                if (!nameBox) {
                    nameBox = { openness: messageWindow.openness };
                }
                nameBox.setName = nameBox.setName || function(name) {
                    this._name = name || "";
                    if (this._name && this.refresh) this.refresh(this._name, 1);
                };
                nameBox.start = nameBox.start || function() {
                    if (this._name && this.refresh) this.refresh(this._name, 1);
                };
                nameBox.setMessageWindow = nameBox.setMessageWindow || function(parent) {
                    this._messageWindow = parent;
                    this._parentWindow = parent;
                };
                messageWindow._nameBoxWindow = nameBox;
                if (messageWindow._nameWindow && messageWindow._nameWindow !== nameBox) {
                    normalizeNameBox(messageWindow, messageWindow._nameWindow);
                }
                return nameBox;
            };
            if (Window_Message.prototype.synchronizeNameBox && !Window_Message.prototype.synchronizeNameBox.__mvCompatWrapped) {
                const originalSynchronizeNameBox = Window_Message.prototype.synchronizeNameBox;
                Window_Message.prototype.synchronizeNameBox = function() {
                    const nameBox = normalizeNameBox(this);
                    if (nameBox) {
                        if (nameBox._container && nameBox._container.scale) {
                            nameBox.openness = this.openness;
                        } else {
                            nameBox._openness = this.openness;
                        }
                        return;
                    }
                    try { return originalSynchronizeNameBox.apply(this, arguments); } catch (e) { return undefined; }
                };
                Window_Message.prototype.synchronizeNameBox.__mvCompatWrapped = true;
            }
            if (Window_Message.prototype.updateSpeakerName && !Window_Message.prototype.updateSpeakerName.__mvCompatWrapped) {
                const originalUpdateSpeakerName = Window_Message.prototype.updateSpeakerName;
                Window_Message.prototype.updateSpeakerName = function() {
                    normalizeNameBox(this);
                    if (this._nameBoxWindow && this._nameBoxWindow.setName) {
                        return originalUpdateSpeakerName.apply(this, arguments);
                    }
                    return undefined;
                };
                Window_Message.prototype.updateSpeakerName.__mvCompatWrapped = true;
            }
            if (Window_Message.prototype.startMessage && !Window_Message.prototype.startMessage.__mvCompatWrapped) {
                const originalStartMessage = Window_Message.prototype.startMessage;
                Window_Message.prototype.startMessage = function() {
                    normalizeNameBox(this);
                    return originalStartMessage.apply(this, arguments);
                };
                Window_Message.prototype.startMessage.__mvCompatWrapped = true;
            }
            if (Window_Message.prototype.terminateMessage && !Window_Message.prototype.terminateMessage.__mvCompatWrapped) {
                const originalTerminateMessage = Window_Message.prototype.terminateMessage;
                Window_Message.prototype.terminateMessage = function() {
                    if (!this._goldWindow) {
                        this._goldWindow = { close: function() {} };
                    }
                    return originalTerminateMessage.apply(this, arguments);
                };
                Window_Message.prototype.terminateMessage.__mvCompatWrapped = true;
            }
            if (Window_Message.prototype.isAnySubWindowActive && !Window_Message.prototype.isAnySubWindowActive.__mvCompatWrapped) {
                const originalIsAnySubWindowActive = Window_Message.prototype.isAnySubWindowActive;
                Window_Message.prototype.isAnySubWindowActive = function() {
                    try {
                        return originalIsAnySubWindowActive.apply(this, arguments);
                    } catch (e) {
                        return this.subWindows().some(window => window && window.active);
                    }
                };
                Window_Message.prototype.isAnySubWindowActive.__mvCompatWrapped = true;
            }
            const aliasSetter = function(name, aliasName) {
                const original = Window_Message.prototype[name];
                if (!original || original.__mvCompatWrapped) return;
                Window_Message.prototype[name] = function(window) {
                    const result = original.call(this, window);
                    this[aliasName] = window;
                    return result;
                };
                Window_Message.prototype[name].__mvCompatWrapped = true;
            };
            aliasSetter("setChoiceListWindow", "_choiceWindow");
            aliasSetter("setNumberInputWindow", "_numberWindow");
            aliasSetter("setEventItemWindow", "_itemWindow");
        }
    }

    // TIER 2 ONLY: MZ moved the actor-drawing family (drawActorName/Level/
    // Class/Icons/SimpleStatus/Face/...) from Window_Base onto a new
    // Window_StatusBase intermediate. MV plugins patch these on Window_Base
    // — the MZ copies sit CLOSER in the prototype chain and shadow every
    // such patch: the menu status drew MZ's default layout (level shown,
    // 128px sprite gauges) no matter what the game's plugins configured.
    // Delete the shadowing copies so lookups fall through to Window_Base,
    // where the MV-verbatim ports (installMVApiGapFills) and the plugins'
    // own patches live. Guarded per-method: only delete when Window_Base
    // actually provides the method.
    function installStatusBaseFallthroughCompatibility() {
        if (!global.Window_StatusBase || !global.Window_Base) return;
        const statusBase = Window_StatusBase.prototype;
        for (const name of Object.getOwnPropertyNames(statusBase)) {
            if (!/^drawActor/.test(name)) continue;
            if (typeof Window_Base.prototype[name] !== "function") continue;
            delete statusBase[name];
        }
    }

    // TIER 2 ONLY: MV-verbatim Scene_Menu window creation. MZ constructs
    // its menu windows from precomputed Rectangles (statusWindowRect()),
    // MV from (x, y) with the width coming from the window's own
    // windowWidth() at construction. MV plugins that WRAP these creators
    // (YEP_MainMenuManager wraps createStatusWindow and overrides
    // Window_MenuStatus.windowWidth = boxWidth - constructed x) capture the
    // MZ original under Reactor and their sizing never applies — the menu
    // status window kept MZ's boxWidth-240 width, got repositioned to the
    // plugin's x, and overflowed the screen. Installing the MV originals
    // BEFORE plugins load lets plugin wrappers capture the shapes they
    // were written against.
    function installMenuSceneCompatibility() {
        if (!global.Scene_Menu) return;
        Scene_Menu.prototype.createCommandWindow = function() {
            this._commandWindow = new Window_MenuCommand(0, 0);
            this._commandWindow.setHandler("item", this.commandItem.bind(this));
            this._commandWindow.setHandler("skill", this.commandPersonal.bind(this));
            this._commandWindow.setHandler("equip", this.commandPersonal.bind(this));
            this._commandWindow.setHandler("status", this.commandPersonal.bind(this));
            this._commandWindow.setHandler("formation", this.commandFormation.bind(this));
            this._commandWindow.setHandler("options", this.commandOptions.bind(this));
            this._commandWindow.setHandler("save", this.commandSave.bind(this));
            this._commandWindow.setHandler("gameEnd", this.commandGameEnd.bind(this));
            this._commandWindow.setHandler("cancel", this.popScene.bind(this));
            this.addWindow(this._commandWindow);
        };
        Scene_Menu.prototype.createGoldWindow = function() {
            this._goldWindow = new Window_Gold(0, 0);
            this._goldWindow.y = Graphics.boxHeight - this._goldWindow.height;
            this.addWindow(this._goldWindow);
        };
        Scene_Menu.prototype.createStatusWindow = function() {
            this._statusWindow = new Window_MenuStatus(this._commandWindow.width, 0);
            this.addWindow(this._statusWindow);
        };
    }

    // TIER 2 ONLY: MV window geometry and input semantics. These replace
    // MZ behavior wholesale and are mutually exclusive with MZ-authored UI.
    function installWindowMetricsCompatibility() {
        if (!global.Window_Base) return;

        // MV height semantics: MV's fittingHeight is numLines * lineHeight()
        // + padding*2 and MV's Window_Selectable.itemHeight === lineHeight().
        // MZ changed fittingHeight to multiply by itemHeight() and padded
        // itemHeight to lineHeight()+8. MV plugins overriding itemHeight
        // (LeTBSWindows' Window_TBSPositioning: lineHeight*4) get
        // catastrophically oversized windows under MZ semantics —
        // fittingHeight(12) returned 1752px instead of ~504. The two
        // overrides must ship together: MV fittingHeight alone would clip
        // the last row of every list drawn at MZ's padded row height.
        Window_Base.prototype.fittingHeight = function(numLines) {
            return numLines * this.lineHeight() + this.standardPadding() * 2;
        };
        if (global.Window_Selectable) {
            Window_Selectable.prototype.itemHeight = function() {
                return this.lineHeight();
            };

            // MV contents are exactly the visible area (height − padding*2,
            // inherited from Window_Base); MZ adds a one-row smooth-scroll
            // buffer (innerHeight + itemHeight). MV plugins size layouts
            // FROM contents.height — YEP_PartySystem's Window_PartySelect
            // itemRect uses this.contents.height as its cell height, so the
            // MZ buffer pushed the crew-select sprites ~36px below their MV
            // position. MV verbatim; the cost is a clipped partial row
            // during animated scrolls, which MV never rendered anyway.
            Window_Selectable.prototype.contentsHeight = function() {
                return this.height - this.standardPadding() * 2;
            };

            // MV's isOpenAndActive does NOT require visibility — MZ added
            // `this.visible` to the check. MV plugins routinely HIDE a
            // window while keeping it active as the input receiver
            // (MOG_BattleCursor hides Window_BattleEnemy and drives target
            // selection with its arrow sprite): under MZ the hidden window
            // stops processing input entirely — Enter never confirms the
            // target and the battle soft-locks. MV verbatim.
            Window_Selectable.prototype.isOpenAndActive = function() {
                return this.isOpen() && this.active;
            };

            // MZ draws a dark background box behind every selectable item
            // (drawItemBackground/contentsBack). MV has no such thing — the
            // boxes poke past decorative frame images MV plugins position
            // around their windows (MOG_BattleHud's command layout). FOSSIL
            // stubs this out for MV look as well. MV parity: no item boxes.
            Window_Selectable.prototype.drawItemBackground = function(index) {};

            // MV item geometry, verbatim (paired with the fittingHeight/
            // itemHeight pair above). MZ's itemRect INSETS each cell by
            // colSpacing/2 and rowSpacing/2 and shrinks it by the spacing —
            // so selection highlights sat a few px off and undersized
            // against what MV plugins draw (LeTBS positioning roster). MV's
            // rect is flush and full-size, with spacing only BETWEEN
            // columns. Base spacing is 12 in MV (48 is Window_ItemList/
            // SkillList's own per-class override — it was wrongly applied
            // to the base class here before, spreading Confirm/Cancel pairs
            // absurdly far apart). Scroll offset uses MZ's scrollBaseX/Y so
            // smooth-scrolled lists stay correct.
            Window_Selectable.prototype.itemWidth = function() {
                return Math.floor((this.width - this.padding * 2 +
                                   this.spacing()) / this.maxCols() - this.spacing());
            };
            Window_Selectable.prototype.itemRect = function(index) {
                const rect = new Rectangle();
                const maxCols = this.maxCols();
                rect.width = this.itemWidth();
                rect.height = this.itemHeight();
                const sx = this.scrollBaseX ? this.scrollBaseX() : (this._scrollX || 0);
                const sy = this.scrollBaseY ? this.scrollBaseY() : (this._scrollY || 0);
                rect.x = index % maxCols * (rect.width + this.spacing()) - sx;
                rect.y = Math.floor(index / maxCols) * rect.height - sy;
                return rect;
            };
        }
    }

    function installSceneCompatibility() {
        const installPictureChoiceWindowCompatibility = function() {
            if (!global.Window_PictureChoiceList || !Window_PictureChoiceList.prototype ||
                Window_PictureChoiceList.prototype.__mvCompatWrapped) return;

            const removeSprite = function(sprite) {
                if (sprite && sprite.parent && sprite.parent.removeChild) sprite.parent.removeChild(sprite);
            };
            const ensureOverlay = function(window) {
                if (!window.__mvCompatOverlay) {
                    window.__mvCompatOverlay = new PIXI.Container();
                    window.__mvCompatOverlay.zIndex = 2000;
                }
                const scene = global.SceneManager && SceneManager._scene;
                if (scene && !window.__mvCompatOverlay.parent) scene.addChild(window.__mvCompatOverlay);
                return window.__mvCompatOverlay;
            };
            const placePictureSprite = function(window, sprite, index) {
                const overlay = ensureOverlay(window);
                const cols = Math.max(1, Number($gameMessage.pictureChoiceGrid && $gameMessage.pictureChoiceGrid[0]) || 1);
                const rows = Math.max(1, Number($gameMessage.pictureChoiceGrid && $gameMessage.pictureChoiceGrid[1]) || 1);
                const width = Number($gameMessage.pictureChoiceSize && $gameMessage.pictureChoiceSize[0]) || Graphics.boxWidth;
                const height = Number($gameMessage.pictureChoiceSize && $gameMessage.pictureChoiceSize[1]) || Graphics.boxHeight;
                const col = index % cols;
                const row = Math.floor(index / cols);
                removeSprite(sprite);
                if (cols === 1) {
                    const itemHeight = Math.max(sprite.height || 40, 40);
                    const spacing = Math.max(8, Math.round(itemHeight * 0.35));
                    const count = Math.max(rows, ($gameMessage.choices && $gameMessage.choices().length) || rows);
                    const totalHeight = count * itemHeight + (count - 1) * spacing;
                    sprite.x = Graphics.boxWidth / 2;
                    sprite.y = Graphics.boxHeight - totalHeight - 16 + row * (itemHeight + spacing) + itemHeight / 2;
                } else {
                    sprite.x = (Graphics.boxWidth - width) / 2 + ((col + 0.5) * width) / cols;
                    sprite.y = (Graphics.boxHeight - height) / 2 + ((row + 0.5) * height) / rows;
                }
                sprite.visible = true;
                sprite.renderable = true;
                overlay.addChild(sprite);
            };
            const rebuildOverlay = function(window) {
                const choices = $gameMessage.choices ? $gameMessage.choices() : [];
                if (!choices.some(choice => /\\picture\[(.*)\]/i.test(choice))) return;
                const overlay = ensureOverlay(window);
                overlay.removeChildren();
                window._spriteChoices = window._spriteChoices || [];
                for (let i = 0; i < choices.length; i++) {
                    const match = /\\picture\[(.*)\]/i.exec(choices[i]);
                    if (!match) continue;
                    const bitmap = ImageManager.loadBitmap("img/SumRndmDde/choices/", match[1], 0, true);
                    const SpriteClass = global.Sprite_PictureChoice || Sprite;
                    const sprite = new SpriteClass(bitmap);
                    sprite.anchor.x = 0.5;
                    sprite.anchor.y = 0.5;
                    window._spriteChoices[i] = sprite;
                    bitmap.addLoadListener(function() { placePictureSprite(window, sprite, i); });
                    placePictureSprite(window, sprite, i);
                }
            };
            const originalStart = Window_PictureChoiceList.prototype.start;
            Window_PictureChoiceList.prototype.start = function() {
                if (this._spriteChoices) this._spriteChoices.forEach(removeSprite);
                if (this.__mvCompatOverlay) this.__mvCompatOverlay.removeChildren();
                const result = originalStart.apply(this, arguments);
                rebuildOverlay(this);
                return result;
            };
            const originalDrawItem = Window_PictureChoiceList.prototype.drawItem;
            Window_PictureChoiceList.prototype.drawItem = function(index) {
                if (this._spriteChoices) removeSprite(this._spriteChoices[index]);
                const result = originalDrawItem.apply(this, arguments);
                const sprite = this._spriteChoices && this._spriteChoices[index];
                if (sprite) placePictureSprite(this, sprite, index);
                return result;
            };
            const originalClose = Window_PictureChoiceList.prototype.close;
            Window_PictureChoiceList.prototype.close = function() {
                const result = originalClose.apply(this, arguments);
                if (this.__mvCompatOverlay) {
                    setTimeout(() => {
                        if (this.__mvCompatOverlay && this.__mvCompatOverlay.parent) {
                            this.__mvCompatOverlay.parent.removeChild(this.__mvCompatOverlay);
                        }
                    }, 1000);
                }
                return result;
            };
            Window_PictureChoiceList.prototype.__mvCompatWrapped = true;
        };

        if (global.Scene_Base && Scene_Base.prototype.addWindow && !Scene_Base.prototype.addWindow.__mvCompatWrapped) {
            const originalAddWindow = Scene_Base.prototype.addWindow;
            Scene_Base.prototype.addWindow = function(window) {
                if (!window) return undefined;
                return originalAddWindow.call(this, window);
            };
            Scene_Base.prototype.addWindow.__mvCompatWrapped = true;
        }

        if (global.Scene_Message && Scene_Message.prototype.associateWindows &&
            !Scene_Message.prototype.associateWindows.__mvCompatWrapped) {
            const originalAssociateWindows = Scene_Message.prototype.associateWindows;
            Scene_Message.prototype.associateWindows = function() {
                if (this._nameBoxWindow && typeof this._nameBoxWindow.setMessageWindow !== "function") {
                    this._nameBoxWindow.setMessageWindow = function(messageWindow) {
                        this._messageWindow = messageWindow;
                        this._parentWindow = messageWindow;
                    };
                }
                if (this._nameBoxWindow && typeof this._nameBoxWindow.setName !== "function") {
                    this._nameBoxWindow.setName = function(name) {
                        this._name = name || "";
                        if (this._name && typeof this.refresh === "function") {
                            this.refresh(this._name, 1);
                        } else if (this.close) {
                            this.close();
                        }
                    };
                }
                if (this._nameBoxWindow && typeof this._nameBoxWindow.start !== "function") {
                    this._nameBoxWindow.start = function() {
                        if (this._name && typeof this.refresh === "function") this.refresh(this._name, 1);
                    };
                }
                const result = originalAssociateWindows.call(this);
                const messageWindow = this._messageWindow;
                if (messageWindow && !messageWindow.__mvCompatSubWindowsCreated &&
                    typeof messageWindow.createSubWindows === "function") {
                    messageWindow.__mvCompatSubWindowsCreated = true;
                    messageWindow.createSubWindows();
                    if (messageWindow._nameWindow && !messageWindow._nameBoxWindow) {
                        messageWindow._nameBoxWindow = messageWindow._nameWindow;
                    }
                }
                installPictureChoiceWindowCompatibility();
                if (messageWindow && messageWindow._pictureChoiceWindow) {
                    const pictureChoiceWindow = messageWindow._pictureChoiceWindow;
                    if (typeof pictureChoiceWindow.setMessageWindow === "function") {
                        pictureChoiceWindow.setMessageWindow(messageWindow);
                    } else {
                        pictureChoiceWindow._messageWindow = messageWindow;
                    }
                    if (!pictureChoiceWindow.parent) this.addChild(pictureChoiceWindow);
                }
                if (messageWindow && typeof messageWindow.helpWindow === "function") {
                    const helpWindow = messageWindow.helpWindow();
                    if (helpWindow && !helpWindow.parent) this.addWindow(helpWindow);
                }
                return result;
            };
            Scene_Message.prototype.associateWindows.__mvCompatWrapped = true;
        }
    }

    function installMapDataReloadCompatibility() {
        // MV's Scene_Map.create ALWAYS reloads map data:
        //   var mapId = this._transfer ? $gamePlayer.newMapId() : $gameMap.mapId();
        //   DataManager.loadMapData(mapId);
        // MZ only reloads on transfer or when $dataMap is null — safe in
        // stock MZ (Scene_Title leaves $dataMap null) but WRONG when the
        // title screen is itself a map (HIME_PreTitleEvents): loading a
        // save then leaves $dataMap pointing at the TITLE map while
        // $gameMap holds the saved map — every event refresh reads the
        // wrong map's data (null lightData / null pages crashes, per-frame
        // soft-locks). Restore MV semantics: reload whenever not covered
        // by MZ's two branches.
        if (!global.Scene_Map || !Scene_Map.prototype.create ||
            Scene_Map.prototype.create.__mvCompatMapReload) return;
        const originalCreate = Scene_Map.prototype.create;
        Scene_Map.prototype.create = function() {
            const result = originalCreate.apply(this, arguments);
            if (!this._transfer && !this._lastMapWasNull &&
                    global.$gameMap && $gameMap.mapId() > 0) {
                DataManager.loadMapData($gameMap.mapId());
            }
            return result;
        };
        Scene_Map.prototype.create.__mvCompatMapReload = true;
    }

    function installStaleEventGuard() {
        // A save made on an older version of a map can restore Game_Events
        // whose $dataMap entries no longer exist (map edited since the
        // save). Every plugin that touches event data during map start
        // (MVNovaLighting lightData, CustomTranslationEngine pages) then
        // crashes per frame — a soft-lock. The versionId check heals this
        // on the Scene_Load path, but not mid-development workflows.
        // Reconcile at onMapLoaded: null out events with missing data,
        // warn, continue. Runs before createDisplayObjects/first update.
        if (!global.Scene_Map || !Scene_Map.prototype.onMapLoaded ||
            Scene_Map.prototype.onMapLoaded.__mvCompatStaleGuard) return;

        const reconcileStaleEvents = function() {
            if (!global.$gameMap || !global.$dataMap || !$gameMap._events) return 0;
            const events = $gameMap._events;
            let removed = 0;
            for (let i = 0; i < events.length; i++) {
                const ev = events[i];
                if (ev && ev._eventId != null && !$dataMap.events[ev._eventId]) {
                    events[i] = null;
                    removed++;
                }
            }
            if (removed > 0 && $gameMap.refreshTileEvents) {
                $gameMap.refreshTileEvents();
            }
            return removed;
        };

        // Second line of defense at the exact crash point: Game_Map.refresh
        // iterates events per frame when anything requests a refresh, and a
        // stale event can appear AFTER map load (mid-scene $dataMap swaps).
        if (global.Game_Map && Game_Map.prototype.refresh &&
                !Game_Map.prototype.refresh.__mvCompatStaleGuard) {
            const originalMapRefresh = Game_Map.prototype.refresh;
            Game_Map.prototype.refresh = function() {
                const removed = reconcileStaleEvents();
                if (removed > 0) {
                    console.warn("ReactorMVCompat: dropped " + removed +
                        " stale event(s) at map refresh (map " + this.mapId() + ").");
                }
                return originalMapRefresh.apply(this, arguments);
            };
            Game_Map.prototype.refresh.__mvCompatStaleGuard = true;
        }

        const originalOnMapLoaded = Scene_Map.prototype.onMapLoaded;
        Scene_Map.prototype.onMapLoaded = function() {
            // BEFORE the original: the crash sites live inside its
            // createDisplayObjects call. Skip transfers to a different
            // map — performTransfer rebuilds _events from $dataMap anyway
            // (and pre-transfer events would compare against the wrong
            // map's data, producing false positives).
            if (!this._transfer) {
                const removed = reconcileStaleEvents();
                if (removed > 0) {
                    console.warn("ReactorMVCompat: dropped " + removed +
                        " saved event(s) missing from the current map data " +
                        "(map " + $gameMap.mapId() + " was edited since this " +
                        "save was made). Re-save the game to clear this.");
                }
            }
            return originalOnMapLoaded.apply(this, arguments);
        };
        Scene_Map.prototype.onMapLoaded.__mvCompatStaleGuard = true;
    }

    function installBoxSizeCompatibility() {
        if (!global.Scene_Boot) return;
        // MV plugins define the UI box through SceneManager._boxWidth /
        // _boxHeight (YEP_CoreEngine assigns box and screen the SAME size,
        // which puts the window layer at (0,0)). The MZ boot computes
        // Graphics.boxWidth from $dataSystem.advanced — absent in MV data —
        // so the fallback leaves an 8px difference and the window layer
        // (and every window in it) renders shifted (4,4) relative to
        // screen-anchored plugin art like MOG hud layouts.
        var origAdjust = Scene_Boot.prototype.adjustBoxSize;
        Scene_Boot.prototype.adjustBoxSize = function() {
            origAdjust.apply(this, arguments);
            if (typeof SceneManager._boxWidth === "number") {
                Graphics.boxWidth = SceneManager._boxWidth;
            }
            if (typeof SceneManager._boxHeight === "number") {
                Graphics.boxHeight = SceneManager._boxHeight;
            }
        };
    }

    function installSceneLayoutCompatibility() {
        // MV scene geometry: the help window sits at the very top and the
        // main area spans the rest of the screen — there is no reserved
        // touch-button strip. MZ defaults to bottom help (isBottomHelpMode
        // true), which breaks every MV plugin that positions windows from
        // helpWindow.y + helpWindow.height: YEP_OptionsCore computed its
        // options window at y = 616 + 96 = 712 — exactly off the bottom of
        // the screen, its category window at height 0. Deliberate override,
        // not a gap-fill: MV layout fidelity requires it. The touch cancel
        // button keeps its top-right placement (buttonAreaTop stays 0 in
        // top-button mode, so buttonY is unchanged).
        if (global.Scene_Base) {
            Scene_Base.prototype.isBottomHelpMode = function() {
                return false;
            };
        }
        if (global.Scene_MenuBase) {
            Scene_MenuBase.prototype.helpAreaTop = function() {
                return 0;
            };
            Scene_MenuBase.prototype.mainAreaHeight = function() {
                return Graphics.boxHeight - this.helpAreaHeight();
            };
        }

        // MV has no touch UI — MZ's cancel/menu Sprite_Buttons (the stray
        // checkmark in the top-right corner of the map and every menu)
        // never existed in MV games. Force the config off; the setter
        // swallows config.rmmzsave restores too.
        if (global.ConfigManager) {
            Object.defineProperty(ConfigManager, "touchUI", {
                get: function() { return false; },
                set: function(value) { /* MV parity: never enable */ },
                configurable: true
            });
        }
    }

    function installSpriteBaseCompatibility() {
        if (global.Sprite_Base) return;

        function Sprite_Base() {
            this.initialize.apply(this, arguments);
        }

        Sprite_Base.prototype = Object.create(Sprite.prototype);
        Sprite_Base.prototype.constructor = Sprite_Base;
        Sprite_Base.prototype.initialize = function() {
            Sprite.prototype.initialize.apply(this, arguments);
            this._animationSprites = [];
            this._effectTarget = this;
            this._hiding = false;
        };
        Sprite_Base.prototype.update = function() {
            Sprite.prototype.update.apply(this, arguments);
            this.updateVisibility();
            this.updateAnimationSprites();
        };
        Sprite_Base.prototype.hide = function() {
            this._hiding = true;
            this.updateVisibility();
        };
        Sprite_Base.prototype.show = function() {
            this._hiding = false;
            this.updateVisibility();
        };
        Sprite_Base.prototype.updateVisibility = function() {
            this.visible = !this._hiding;
        };
        Sprite_Base.prototype.updateAnimationSprites = function() {
            const sprites = this._animationSprites.clone();
            this._animationSprites.length = 0;
            for (const sprite of sprites) {
                if (sprite && sprite.isPlaying && sprite.isPlaying()) {
                    this._animationSprites.push(sprite);
                } else if (sprite && sprite.destroy) {
                    sprite.destroy();
                }
            }
        };
        Sprite_Base.prototype.startAnimation = function(animation, mirror, delay) {
            if (!animation) return;
            const SpriteClass = animation.frames ? Sprite_AnimationMV : Sprite_Animation;
            const sprite = new SpriteClass();
            const target = this._effectTarget || this;
            if (animation.frames) {
                sprite.setup([target], animation, mirror, delay || 0, null);
            } else {
                sprite.setup([target], animation, mirror, delay || 0, null);
            }
            if (this.parent) this.parent.addChild(sprite);
            this._animationSprites.push(sprite);
        };
        Sprite_Base.prototype.isAnimationPlaying = function() {
            return this._animationSprites.length > 0;
        };

        global.Sprite_Base = Sprite_Base;

        // MV hosted animations and balloons on the character/battler
        // sprites themselves; MZ moved both to the Spriteset. Functional
        // ports (not silent stubs — LeTBS drives balloons through
        // updateBalloon and VE_ThrowableObjects/MOG expect setupAnimation
        // to actually play): each spawned animation sprite self-cleans
        // from its parent when it finishes.
        function mvStartAnimation(host, target, animation, mirror, delay) {
            if (!animation || !host.parent) return;
            var SpriteClass = animation.frames ? Sprite_AnimationMV : Sprite_Animation;
            var sprite = new SpriteClass();
            sprite.setup([target], animation, mirror, delay || 0, null);
            host.parent.addChild(sprite);
            host._animationSprites = host._animationSprites || [];
            host._animationSprites.push(sprite);
            var origUpdate = sprite.update.bind(sprite);
            sprite.update = function() {
                origUpdate();
                if (!sprite.isPlaying()) {
                    if (sprite.parent) sprite.parent.removeChild(sprite);
                    var list = host._animationSprites;
                    if (list) {
                        var idx = list.indexOf(sprite);
                        if (idx >= 0) list.splice(idx, 1);
                    }
                    if (sprite.destroy && !sprite.destroyed) sprite.destroy();
                }
            };
        }

        function installMVHostedAnimationApi(proto, targetOf) {
            if (!proto.startAnimation) {
                proto.startAnimation = function(animation, mirror, delay) {
                    mvStartAnimation(this, targetOf(this), animation, mirror, delay);
                };
            }
            if (!proto.isAnimationPlaying) {
                proto.isAnimationPlaying = function() {
                    return !!(this._animationSprites && this._animationSprites.length > 0);
                };
            }
            if (!proto.endAnimation) proto.endAnimation = function() {};
            if (!proto.updateAnimation) proto.updateAnimation = function() {};
        }

        if (global.Sprite_Character) {
            installMVHostedAnimationApi(Sprite_Character.prototype, function(s) { return s; });
            Sprite_Character.prototype.setupAnimation = Sprite_Character.prototype.setupAnimation || function() {
                if (this._character.animationId && this._character.animationId() > 0) {
                    var animation = $dataAnimations[this._character.animationId()];
                    this.startAnimation(animation, false, 0);
                    if (this._character.startAnimation) this._character.startAnimation();
                }
            };
            Sprite_Character.prototype.startBalloon = Sprite_Character.prototype.startBalloon || function() {
                if (!global.Sprite_Balloon) return;
                if (!this._balloonSprite) {
                    this._balloonSprite = new Sprite_Balloon();
                }
                // MZ Sprite_Balloon.setup takes (targetSprite, balloonId);
                // MV took (balloonId).
                if (Sprite_Balloon.prototype.setup.length >= 2) {
                    this._balloonSprite.setup(this, this._character.balloonId());
                } else {
                    this._balloonSprite.setup(this._character.balloonId());
                }
                if (this.parent) this.parent.addChild(this._balloonSprite);
            };
            Sprite_Character.prototype.setupBalloon = Sprite_Character.prototype.setupBalloon || function() {
                if (this._character.balloonId && this._character.balloonId() > 0) {
                    this.startBalloon();
                    if (this._character.startBalloon) this._character.startBalloon();
                }
            };
            Sprite_Character.prototype.endBalloon = Sprite_Character.prototype.endBalloon || function() {
                if (this._balloonSprite) {
                    if (this._balloonSprite.parent) {
                        this._balloonSprite.parent.removeChild(this._balloonSprite);
                    }
                    this._balloonSprite = null;
                }
            };
            Sprite_Character.prototype.updateBalloon = Sprite_Character.prototype.updateBalloon || function() {
                this.setupBalloon();
                if (this._balloonSprite) {
                    this._balloonSprite.x = this.x;
                    this._balloonSprite.y = this.y - this.height;
                    if (!this._balloonSprite.isPlaying()) {
                        this.endBalloon();
                    }
                }
            };
            Sprite_Character.prototype.isBalloonPlaying = Sprite_Character.prototype.isBalloonPlaying || function() {
                return !!this._balloonSprite;
            };
        }

        if (global.Sprite_Battler) {
            installMVHostedAnimationApi(Sprite_Battler.prototype, function(s) { return s; });
            Sprite_Battler.prototype.setupAnimation = Sprite_Battler.prototype.setupAnimation || function() {
                while (this._battler.isAnimationRequested && this._battler.isAnimationRequested()) {
                    var data = this._battler.shiftAnimation();
                    if (!data) break;
                    var animation = $dataAnimations[data.animationId];
                    if (!animation) continue;
                    var delay = animation.position === 3 ? 0 : data.delay;
                    this.startAnimation(animation, data.mirror, delay);
                    var sprites = this._animationSprites || [];
                    for (var i = 0; i < sprites.length; i++) {
                        sprites[i].visible = this._battler.isSpriteVisible();
                    }
                }
            };
        }
    }

    function installMessageSubWindowsCompatibility() {
        if (!global.Window_Message || !Window_Message.prototype) return;
        var P = Window_Message.prototype;
        if (P.__mvSubWindowsInstalled) return;
        P.__mvSubWindowsInstalled = true;

        // MV creates the message sub-windows from Window_Message itself
        // (createSubWindows, called during initialize); MZ creates them in
        // Scene_Message and injects them via associateWindows. Provide a
        // no-op base so MV plugin alias chains (YEP_X_MessageBacklog's
        // backlog window, SRD_PictureChoices, …) have something to chain
        // onto, and invoke the chain from initialize like MV did.
        if (!P.createSubWindows) P.createSubWindows = function() {};
        // Run the plugin sub-window chain ONLY for the scene's actual
        // message window, and only once. Hooking initialize ran the chain
        // for EVERY Window_Message instance (plugins construct extras for
        // measurement/backlog), spawning duplicate name boxes, backlog
        // windows and picture-choice lists that overlapped visually and
        // fought over choice input (breaking variable-setting events).
        // The scene assigns _messageWindow after construction, so defer
        // to update.
        var origUpdate = P.update;
        P.update = function() {
            if (!this.__mvCompatSubWindowsCreated) {
                // Fallback ONLY: the associateWindows wrapper already runs
                // the sub-window chain (same flag) for every Scene_Message
                // flow. This catches custom scenes (LeTBS battles) that
                // never call associateWindows. Sharing the flag is what
                // prevents double creation — duplicated backlog/name/choice
                // windows overlapped menus and broke choice input.
                var scene = SceneManager._scene;
                if (scene && scene._messageWindow === this) {
                    this.__mvCompatSubWindowsCreated = true;
                    this.createSubWindows();
                }
            }
            origUpdate.apply(this, arguments);
        };

        // Shared inert stand-in window (see alias getter below).
        var noop = function() {};
        var mvInertWindow = {
            active: false, visible: false, openness: 0,
            open: noop, close: noop, show: noop, hide: noop,
            activate: noop, deactivate: noop, refresh: noop,
            update: noop, setHelpWindow: noop, select: noop, deselect: noop,
            isOpen: function() { return false; },
            isClosed: function() { return true; },
            isOpenAndActive: function() { return false; }
        };

        // MV field names for the MZ-injected sub-windows.
        var map = {
            _choiceWindow: "_choiceListWindow",
            _numberWindow: "_numberInputWindow",
            _itemWindow: "_eventItemWindow"
        };
        Object.keys(map).forEach(function(mvName) {
            if (Object.prototype.hasOwnProperty.call(P, mvName)) return;
            var mzName = map[mvName];
            Object.defineProperty(P, mvName, {
                get: function() {
                    // Fall back to the scene's window when this message
                    // window was never associated (custom battle scenes
                    // create extra Window_Message instances): in MV these
                    // sub-windows always existed per message window. Last
                    // resort is a shared inert stand-in so MV plugins can
                    // poke flags/methods without crashing on null.
                    if (this[mzName]) return this[mzName];
                    var scene = SceneManager._scene;
                    if (scene && scene[mzName]) return scene[mzName];
                    return mvInertWindow;
                },
                set: function(value) { this[mzName] = value; },
                configurable: true
            });
        });

        if (!P.subWindows) {
            P.subWindows = function() {
                return [
                    this._goldWindow, this._choiceListWindow,
                    this._numberInputWindow, this._eventItemWindow
                ].filter(Boolean);
            };
        }
    }

    function installTextStateCompatibility() {
        // MV plugins (YEP_CoreEngine among them) REPLACE Window_Base.drawTextEx
        // with MV's implementation: a bare `{index, x, y, left}` textState and
        // a processCharacter loop with no flush — MV drew each character
        // immediately. MZ's processCharacter instead accumulates characters
        // into textState.buffer and only draws in flushTextState(), which
        // additionally requires textState.drawing === true. The combination
        // means every drawTextEx call silently draws NOTHING (and MV-style
        // textWidthEx measures 0, corrupting layouts). Upgrade MV-style
        // textStates in place and flush at end-of-text, so any MV-style
        // drawTextEx replacement on any window class works unmodified.
        if (!global.Window_Base || !Window_Base.prototype.processCharacter ||
            Window_Base.prototype.processCharacter.__mvCompatTextState) return;

        const originalProcessCharacter = Window_Base.prototype.processCharacter;
        Window_Base.prototype.processCharacter = function(textState) {
            if (textState && textState.drawing === undefined &&
                    !textState.__mvCompatTextState) {
                // MZ createTextState always sets drawing (true, or false for
                // textSizeEx measurement) — absent means an MV-style state.
                textState.__mvCompatTextState = true;
                textState.drawing = true;
                if (textState.buffer === undefined) textState.buffer = "";
                if (textState.rtl === undefined) textState.rtl = false;
                if (textState.startX === undefined) {
                    // MV processNewLine resets x to .left; MZ's to .startX
                    textState.startX = textState.left !== undefined
                        ? textState.left : textState.x;
                }
                if (textState.startY === undefined) textState.startY = textState.y;
                if (textState.outputWidth === undefined) textState.outputWidth = 0;
                if (textState.outputHeight === undefined) textState.outputHeight = 0;
                if (textState.width === undefined && this.contents) {
                    textState.width = this.contents.width - textState.x;
                }
            }
            originalProcessCharacter.apply(this, arguments);
            if (textState && textState.__mvCompatTextState &&
                    textState.index >= textState.text.length) {
                // MV loops end without flushing; draw the tail of the buffer.
                this.flushTextState(textState);
            }
        };
        Window_Base.prototype.processCharacter.__mvCompatTextState = true;

        // MV's processNormalCharacter, as a capture target only: MZ never
        // calls it and neither do we (deliberately — routing it FOSSIL-style
        // would double-draw with plugins like VE_ControlText that overwrite
        // it with immediate drawing; the buffered upgrade above already
        // draws their text). But MV plugins alias/wrap it at load, and a
        // wrapper capturing undefined crashes the moment it runs.
        if (!Window_Base.prototype.processNormalCharacter) {
            Window_Base.prototype.processNormalCharacter = function(textState) {
                var c = textState.text[textState.index++];
                var w = this.textWidth(c);
                this.contents.drawText(c, textState.x, textState.y, w * 2, textState.height);
                textState.x += w;
            };
        }
    }

    function installAudioCacheCompatibility() {
        if (!global.WebAudio || !WebAudio.prototype || WebAudio.prototype.__mvCacheDestroyGuard) return;
        WebAudio.prototype.__mvCacheDestroyGuard = true;

        // MZ treats WebAudio buffers as disposable: AudioManager.stopBgm/
        // stopSe call buffer.destroy(), which clears the decoded data.
        // MV-1.6-style AudioCaches (KODERA/plugins) hold those same buffer
        // objects for reuse and gate AudioManager.isReady() on ALL cached
        // items being ready — so an MZ destroy() turns a cached buffer
        // into a permanent zombie (buffers=[], never reloads) and
        // deadlocks every scene gated on audio readiness. If the buffer
        // is still cached, just stop playback and keep the decoded data.
        var origDestroy = WebAudio.prototype.destroy;
        WebAudio.prototype.destroy = function() {
            var cache = global.AudioManager && AudioManager._cache;
            var items = cache && cache._items;
            if (items) {
                for (var key in items) {
                    if (items[key] && items[key].buffer === this) {
                        this.stop();
                        return;
                    }
                }
            }
            origDestroy.apply(this, arguments);
        };
    }

    // Gap-fills discovered by a static scan: MV corescript APIs missing
    // from the runtime that this project's ENABLED plugins actually
    // reference. Bodies ported from MV corescript (js/MV Corescript/),
    // adapted to MZ internals where those moved. All guarded — never
    // clobber an existing implementation.
    function installMVApiGapFills() {
        var def = function(obj, name, fn) {
            // Own-property check, NOT an inherited lookup: MV subclasses
            // override metrics their base class also defines
            // (Window_ActorCommand.windowWidth 192 vs Window_Command 240).
            // An inherited-lookup guard sees the base method through the
            // prototype chain and skips the subclass override entirely, so
            // every battle window inherits the base metric.
            if (obj && !Object.prototype.hasOwnProperty.call(obj, name)) {
                obj[name] = fn;
            }
        };

        // ---- Game_Map.tileEvents (MV name) <-> _tileEvents (MZ rename).
        // MV saves serialize the field as `tileEvents`; Reactor reads
        // `_tileEvents` — every loaded MV save had it undefined, crashing
        // the first vanilla passability check before a map transfer
        // (tileEventsXy: reading 'filter' of undefined via moveStraight;
        // usually masked by AltimitMovement, surfaced by event movement).
        // A prototype accessor makes MV save deserialization WRITE THROUGH
        // to the MZ field (JsonEx assigns properties after the prototype
        // is restored, so the setter fires), and lets MV plugins that read
        // $gameMap.tileEvents keep working. ----
        if (global.Game_Map && !("tileEvents" in Game_Map.prototype)) {
            Object.defineProperty(Game_Map.prototype, "tileEvents", {
                get: function() { return this._tileEvents; },
                set: function(value) { this._tileEvents = value; },
                configurable: true
            });
        }
        if (global.DataManager && DataManager.extractSaveContents &&
                !DataManager.extractSaveContents.__mvCompatTileEvents) {
            const originalExtractSaveContents = DataManager.extractSaveContents;
            DataManager.extractSaveContents = function(contents) {
                const result = originalExtractSaveContents.apply(this, arguments);
                // safety net for saves carrying neither field
                if (global.$gameMap && !$gameMap._tileEvents &&
                        typeof $gameMap.refreshTileEvents === "function") {
                    try { $gameMap.refreshTileEvents(); } catch (e) { /* map not ready */ }
                }
                return result;
            };
            DataManager.extractSaveContents.__mvCompatTileEvents = true;
        }

        // ---- Game_Followers (referenced by 48 plugins) ----
        if (global.Game_Followers) {
            def(Game_Followers.prototype, "forEach", function(callback, thisObject) {
                this._data.forEach(callback, thisObject);
            });
            def(Game_Followers.prototype, "reverseEach", function(callback, thisObject) {
                this._data.reverse();
                this._data.forEach(callback, thisObject);
                this._data.reverse();
            });
        }

        // ---- Utils ----
        if (global.Utils) {
            Utils._id = Utils._id || 1;
            def(Utils, "generateRuntimeId", function() {
                return Utils._id++;
            });
        }

        // ---- Graphics statics (MV video/font/GL API) ----
        if (global.Graphics) {
            def(Graphics, "isWebGL", function() { return true; });
            def(Graphics, "hasWebGL", function() { return true; });
            def(Graphics, "canPlayVideoType", function(type) {
                return global.Video && Video._element
                    ? !!Video._element.canPlayType(type)
                    : !!document.createElement("video").canPlayType(type);
            });
            def(Graphics, "playVideo", function(src) {
                if (global.Video && Video.play) Video.play(src);
            });
            def(Graphics, "isVideoPlaying", function() {
                return !!(global.Video && Video.isPlaying && Video.isPlaying());
            });
            def(Graphics, "isFontLoaded", function(name) {
                // Only report a real in-flight load as not-ready. A font
                // MZ's FontManager has never heard of (MV's "GameFont")
                // must count as loaded, or MV boot gates (YEP_CoreEngine
                // waits on isFontLoaded("GameFont")) hang forever.
                if (global.FontManager && FontManager._states && FontManager._states[name]) {
                    return FontManager._states[name] === "loaded";
                }
                return true;
            });
            def(Graphics, "loadFont", function(name, url) {
                if (global.FontManager && FontManager.load) FontManager.load(name, url);
            });
            def(Graphics, "_createFontLoader", function() {});
        }

        // ---- SceneManager MV frame-loop API (MZ moved rendering into the
        // Graphics/PIXI ticker and deleted these). They must exist BEFORE
        // plugins load: TweenJS_MVPatch drives the ENTIRE tween engine from
        // a renderScene wrapper (captured undefined -> TWEEN.update() never
        // ran -> every LeTBS projectile froze at its origin, soft-locking
        // tactical battles), and YEP_FpsSynchOption's fps-synch-off path
        // calls both renderScene() and requestUpdate() directly. The
        // defaults are no-ops — the ticker already renders and schedules —
        // they exist as alias-chain anchors. renderScene is then invoked
        // once per frame from updateMain below so wrappers actually run. ----
        if (global.SceneManager) {
            def(SceneManager, "renderScene", function() {
                // rendering happens in the Graphics ticker under MZ
            });
            def(SceneManager, "requestUpdate", function() {
                // scheduling happens in the Graphics ticker under MZ
            });
            if (SceneManager.updateMain && !SceneManager.updateMain.__mvCompatRenderHook) {
                const originalUpdateMain = SceneManager.updateMain;
                SceneManager.updateMain = function() {
                    const result = originalUpdateMain.apply(this, arguments);
                    if (this.renderScene) this.renderScene();
                    return result;
                };
                SceneManager.updateMain.__mvCompatRenderHook = true;
            }
        }

        // ---- AudioManager.masterVolume (MV property; MZ dropped it) ----
        if (global.AudioManager && !("masterVolume" in AudioManager)) {
            AudioManager._masterVolume = 1;
            Object.defineProperty(AudioManager, "masterVolume", {
                get: function() { return this._masterVolume; },
                set: function(value) {
                    this._masterVolume = value;
                    if (global.WebAudio && WebAudio.setMasterVolume) {
                        WebAudio.setMasterVolume(value);
                    }
                    if (global.Video && Video.setVolume) {
                        Video.setVolume(value);
                    }
                },
                configurable: true
            });
        }

        // ---- StorageManager backup API (YEP_SaveCore calls cleanBackup
        // after every successful save) ----
        if (global.StorageManager) {
            def(StorageManager, "backupExists", function(savefileId) {
                try {
                    if (global.Utils && Utils.isNwjs && Utils.isNwjs() && this.filePath) {
                        var fs = require("fs");
                        return fs.existsSync(this.filePath(savefileId) + ".bak");
                    }
                } catch (e) { /* fall through */ }
                return false;
            });
            def(StorageManager, "cleanBackup", function(savefileId) {
                try {
                    if (this.backupExists(savefileId)) {
                        var fs = require("fs");
                        fs.unlinkSync(this.filePath(savefileId) + ".bak");
                    }
                } catch (e) { /* a missing backup must never break saving */ }
            });
        }

        // ---- ImageManager MV reservation/cache API ----
        if (global.ImageManager) {
            def(ImageManager, "loadEmptyBitmap", function() {
                if (!this._mvEmptyBitmap) this._mvEmptyBitmap = new Bitmap(1, 1);
                return this._mvEmptyBitmap;
            });
            def(ImageManager, "_generateCacheKey", function(path, hue) {
                return path + ":" + hue;
            });
            def(ImageManager, "reserveBitmap", function(folder, filename, hue, smooth, reservationId) {
                // MV semantics: no filename -> empty bitmap, NOT a load
                // call. Preloaders pass undefined for malformed list
                // entries, and translation plugins wrap loadBitmap with
                // unguarded filename.match(...) — an unguarded pass-through
                // here threw inside DataManager.onLoad and aborted the
                // whole boot preload chain (black screen at startup).
                if (!filename) return this.loadEmptyBitmap();
                return this.loadBitmap(folder, filename);
            });
            def(ImageManager, "reserveNormalBitmap", function(path, hue, reservationId) {
                if (!path) return this.loadEmptyBitmap();
                return this.loadBitmapFromUrl ? this.loadBitmapFromUrl(path) : Bitmap.load(path);
            });
            def(ImageManager, "reserveSystem", function(filename, hue, reservationId) {
                if (!filename) return this.loadEmptyBitmap();
                return this.loadSystem(filename);
            });
            def(ImageManager, "releaseReservation", function(reservationId) {});
            def(ImageManager, "setDefaultReservationId", function(reservationId) {});
        }

        // ---- Bitmap pixel-manipulation API ----
        if (global.Bitmap) {
            def(Bitmap.prototype, "_setDirty", function() {
                if (this._baseTexture && this._baseTexture.update) this._baseTexture.update();
            });
            def(Bitmap.prototype, "touch", function() {});
            def(Bitmap.prototype, "adjustTone", function(r, g, b) {
                if ((r || g || b) && this.width > 0 && this.height > 0) {
                    var context = this.context;
                    var imageData = context.getImageData(0, 0, this.width, this.height);
                    var pixels = imageData.data;
                    for (var i = 0; i < pixels.length; i += 4) {
                        pixels[i + 0] += r;
                        pixels[i + 1] += g;
                        pixels[i + 2] += b;
                    }
                    context.putImageData(imageData, 0, 0);
                    this._setDirty();
                }
            });
            def(Bitmap.prototype, "rotateHue", function(offset) {
                function rgbToHsl(r, g, b) {
                    var cmin = Math.min(r, g, b);
                    var cmax = Math.max(r, g, b);
                    var h = 0;
                    var s = 0;
                    var l = (cmin + cmax) / 2;
                    var delta = cmax - cmin;
                    if (delta > 0) {
                        if (r === cmax) {
                            h = 60 * (((g - b) / delta + 6) % 6);
                        } else if (g === cmax) {
                            h = 60 * ((b - r) / delta + 2);
                        } else {
                            h = 60 * ((r - g) / delta + 4);
                        }
                        s = delta / (255 - Math.abs(2 * l - 255));
                    }
                    return [h, s, l];
                }
                function hslToRgb(h, s, l) {
                    var c = (255 - Math.abs(2 * l - 255)) * s;
                    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
                    var m = l - c / 2;
                    var cm = c + m;
                    var xm = x + m;
                    if (h < 60) return [cm, xm, m];
                    if (h < 120) return [xm, cm, m];
                    if (h < 180) return [m, cm, xm];
                    if (h < 240) return [m, xm, cm];
                    if (h < 300) return [xm, m, cm];
                    return [cm, m, xm];
                }
                if (offset && this.width > 0 && this.height > 0) {
                    offset = ((offset % 360) + 360) % 360;
                    var context = this.context;
                    var imageData = context.getImageData(0, 0, this.width, this.height);
                    var pixels = imageData.data;
                    for (var i = 0; i < pixels.length; i += 4) {
                        var hsl = rgbToHsl(pixels[i + 0], pixels[i + 1], pixels[i + 2]);
                        var h = (hsl[0] + offset) % 360;
                        var rgb = hslToRgb(h, hsl[1], hsl[2]);
                        pixels[i + 0] = rgb[0];
                        pixels[i + 1] = rgb[1];
                        pixels[i + 2] = rgb[2];
                    }
                    context.putImageData(imageData, 0, 0);
                    this._setDirty();
                }
            });
        }

        // ---- ToneFilter (MV class; MZ replaced it with ColorFilter) ----
        var CMF = global.PIXI && (PIXI.ColorMatrixFilter || (PIXI.filters && PIXI.filters.ColorMatrixFilter));
        if (!global.ToneFilter && CMF) {
            // class syntax: v8's ColorMatrixFilter is an ES6 class and
            // cannot be .call()-constructed the ES5 way.
            class ToneFilter extends CMF {
                adjustHue(value) {
                    this.hue(value, true);
                }
                adjustSaturation(value) {
                    value = Math.max(-255, Math.min(255, value || 0)) / 255;
                    this.saturate(value, true);
                }
                adjustTone(r, g, b) {
                    r = Math.max(-255, Math.min(255, r || 0)) / 255;
                    g = Math.max(-255, Math.min(255, g || 0)) / 255;
                    b = Math.max(-255, Math.min(255, b || 0)) / 255;
                    if (r !== 0 || g !== 0 || b !== 0) {
                        var matrix = [
                            1, 0, 0, r, 0,
                            0, 1, 0, g, 0,
                            0, 0, 1, b, 0,
                            0, 0, 0, 1, 0
                        ];
                        this._loadMatrix(matrix, true);
                    }
                }
            }
            global.ToneFilter = ToneFilter;
        }

        // ---- Window_Selectable MV scroll/sound API ----
        if (global.Window_Selectable) {
            var WS = Window_Selectable.prototype;
            def(WS, "resetScroll", function() { this.setTopRow(0); });
            def(WS, "playOkSound", function() { SoundManager.playOk(); });
            def(WS, "playBuzzerSound", function() { SoundManager.playBuzzer(); });
            def(WS, "bottomRow", function() {
                return Math.max(0, this.topRow() + this.maxPageRows() - 1);
            });
            def(WS, "setBottomRow", function(row) {
                this.setTopRow(row - (this.maxPageRows() - 1));
            });
            def(WS, "isCursorVisible", function() {
                var row = this.row();
                return row >= this.topRow() && row <= this.bottomRow();
            });
            def(WS, "processWheel", function() {
                if (this.isOpenAndActive()) {
                    var threshold = 20;
                    if (TouchInput.wheelY >= threshold) this.scrollDown();
                    if (TouchInput.wheelY <= -threshold) this.scrollUp();
                }
            });
        }

        // ---- MV gauge/color API on Window_Base. Several Yanfly plugins
        // "define" these only as WRAPPERS around an original captured at
        // load time — if the base is missing, the wrapper crashes on
        // undefined.call. Install real MV-ported bases before plugins
        // load, delegating colors to MZ's ColorManager. ----
        if (global.Window_Base && global.ColorManager) {
            var WB = Window_Base.prototype;
            def(WB, "textColor", function(n) { return ColorManager.textColor(n); });
            def(WB, "normalColor", function() { return ColorManager.normalColor(); });
            def(WB, "systemColor", function() { return ColorManager.systemColor(); });
            def(WB, "crisisColor", function() { return ColorManager.crisisColor(); });
            def(WB, "deathColor", function() { return ColorManager.deathColor(); });
            def(WB, "gaugeBackColor", function() { return ColorManager.gaugeBackColor(); });
            def(WB, "hpColor", function(actor) { return ColorManager.hpColor(actor); });
            def(WB, "mpColor", function(actor) { return ColorManager.mpColor(actor); });
            def(WB, "tpColor", function(actor) { return ColorManager.tpColor(actor); });
            def(WB, "hpGaugeColor1", function() { return ColorManager.hpGaugeColor1(); });
            def(WB, "hpGaugeColor2", function() { return ColorManager.hpGaugeColor2(); });
            def(WB, "mpGaugeColor1", function() { return ColorManager.mpGaugeColor1(); });
            def(WB, "mpGaugeColor2", function() { return ColorManager.mpGaugeColor2(); });
            def(WB, "mpCostColor", function() { return ColorManager.mpCostColor(); });
            def(WB, "powerUpColor", function() { return ColorManager.powerUpColor(); });
            def(WB, "powerDownColor", function() { return ColorManager.powerDownColor(); });
            def(WB, "tpGaugeColor1", function() { return ColorManager.tpGaugeColor1(); });
            def(WB, "tpGaugeColor2", function() { return ColorManager.tpGaugeColor2(); });
            def(WB, "tpCostColor", function() { return ColorManager.tpCostColor(); });
            def(WB, "pendingColor", function() { return ColorManager.pendingColor(); });
            def(WB, "drawGauge", function(x, y, width, rate, color1, color2) {
                var fillW = Math.floor(width * rate);
                var gaugeY = y + this.lineHeight() - 8;
                this.contents.fillRect(x, gaugeY, width, 6, this.gaugeBackColor());
                this.contents.gradientFillRect(x, gaugeY, fillW, 6, color1, color2);
            });
            def(WB, "drawCurrentAndMax", function(current, max, x, y, width, color1, color2) {
                var labelWidth = this.textWidth("HP");
                var valueWidth = this.textWidth("0000");
                var slashWidth = this.textWidth("/");
                var x1 = x + width - valueWidth;
                var x2 = x1 - slashWidth;
                var x3 = x2 - valueWidth;
                if (x3 >= x + labelWidth) {
                    this.changeTextColor(color1);
                    this.drawText(current, x3, y, valueWidth, "right");
                    this.changeTextColor(color2);
                    this.drawText("/", x2, y, slashWidth, "right");
                    this.drawText(max, x1, y, valueWidth, "right");
                } else {
                    this.changeTextColor(color1);
                    this.drawText(current, x1, y, valueWidth, "right");
                }
            });
            def(WB, "drawActorHp", function(actor, x, y, width) {
                width = width || 186;
                var color1 = this.hpGaugeColor1();
                var color2 = this.hpGaugeColor2();
                this.drawGauge(x, y, width, actor.hpRate(), color1, color2);
                this.changeTextColor(this.systemColor());
                this.drawText(TextManager.hpA, x, y, 44);
                this.drawCurrentAndMax(actor.hp, actor.mhp, x, y, width, this.hpColor(actor), this.normalColor());
            });
            def(WB, "drawActorMp", function(actor, x, y, width) {
                width = width || 186;
                var color1 = this.mpGaugeColor1();
                var color2 = this.mpGaugeColor2();
                this.drawGauge(x, y, width, actor.mpRate(), color1, color2);
                this.changeTextColor(this.systemColor());
                this.drawText(TextManager.mpA, x, y, 44);
                this.drawCurrentAndMax(actor.mp, actor.mmp, x, y, width, this.mpColor(actor), this.normalColor());
            });
            def(WB, "drawActorTp", function(actor, x, y, width) {
                width = width || 96;
                var color1 = this.tpGaugeColor1();
                var color2 = this.tpGaugeColor2();
                this.drawGauge(x, y, width, actor.tpRate(), color1, color2);
                this.changeTextColor(this.systemColor());
                this.drawText(TextManager.tpA, x, y, 44);
                this.changeTextColor(this.tpColor(actor));
                this.drawText(actor.tp, x + width - 64, y, 64, "right");
            });
            def(WB, "drawActorSimpleStatus", function(actor, x, y, width) {
                var lineHeight = this.lineHeight();
                var x2 = x + 180;
                var width2 = Math.min(200, width - 180 - (this.textPadding ? this.textPadding() : this.itemPadding()));
                this.drawActorName(actor, x, y);
                this.drawActorLevel(actor, x, y + lineHeight * 1);
                this.drawActorIcons(actor, x, y + lineHeight * 2);
                this.drawActorClass(actor, x2, y);
                this.drawActorHp(actor, x2, y + lineHeight * 1, width2);
                this.drawActorMp(actor, x2, y + lineHeight * 2, width2);
            });
        }

        // ---- Window_Base actor drawing (MV: on Window_Base; MZ: moved
        // to Window_StatusBase — MV plugins subclass plain windows and
        // call these, e.g. LeTBSWindows' positioning roster) ----
        if (global.Window_Base && global.Window_StatusBase) {
            [
                "drawActorCharacter", "drawActorFace", "drawActorName",
                "drawActorClass", "drawActorNickname", "drawActorLevel",
                "drawActorIcons"
            ].forEach(function(name) {
                if (!Window_Base.prototype[name] && Window_StatusBase.prototype[name]) {
                    Window_Base.prototype[name] = Window_StatusBase.prototype[name];
                }
            });
        }

        // ---- Window_Base.textWidthEx (MZ: textSizeEx) ----
        if (global.Window_Base) {
            def(Window_Base.prototype, "textWidthEx", function(text) {
                return this.textSizeEx(text).width;
            });
        }

        // ---- MV battle window metrics (MV windows size themselves via
        // windowWidth/windowHeight/numVisibleRows in initialize; MZ scenes
        // pass a Rectangle instead and deleted the methods. Plugins that
        // wrap initialize MV-style with NO arguments — MOG_BattleHud's
        // Window_BattleStatus wrapper drops the scene's rect entirely —
        // fall through to makeRect, which needs these to avoid a
        // fullscreen default. All values are MV corescript verbatim;
        // plugin overrides load later and win.) ----
        if (global.Window_BattleStatus) {
            def(Window_BattleStatus.prototype, "windowWidth", function() {
                return Graphics.boxWidth - 192;
            });
            def(Window_BattleStatus.prototype, "windowHeight", function() {
                return this.fittingHeight(this.numVisibleRows());
            });
            def(Window_BattleStatus.prototype, "numVisibleRows", function() {
                return 4;
            });
        }
        [global.Window_PartyCommand, global.Window_ActorCommand].forEach(function(cls) {
            if (!cls) return;
            def(cls.prototype, "windowWidth", function() { return 192; });
            def(cls.prototype, "numVisibleRows", function() { return 4; });
        });
        if (global.Window_BattleEnemy) {
            def(Window_BattleEnemy.prototype, "windowWidth", function() {
                return Graphics.boxWidth - 192;
            });
            def(Window_BattleEnemy.prototype, "windowHeight", function() {
                return this.fittingHeight(this.numVisibleRows());
            });
            def(Window_BattleEnemy.prototype, "numVisibleRows", function() {
                return 4;
            });
        }

        // ---- Window_BattleStatus MV area layout ----
        if (global.Window_BattleStatus) {
            var WBS = Window_BattleStatus.prototype;
            def(WBS, "gaugeAreaWidth", function() { return 330; });
            def(WBS, "basicAreaRect", function(index) {
                var rect = this.itemRectForText(index);
                rect.width -= this.gaugeAreaWidth() + 15;
                return rect;
            });
            def(WBS, "gaugeAreaRect", function(index) {
                var rect = this.itemRectForText(index);
                rect.x += rect.width - this.gaugeAreaWidth();
                rect.width = this.gaugeAreaWidth();
                return rect;
            });
            def(WBS, "drawBasicArea", function(rect, actor) {
                this.drawActorName(actor, rect.x + 0, rect.y, 150);
                this.drawActorIcons(actor, rect.x + 156, rect.y, rect.width - 156);
            });
            def(WBS, "drawGaugeArea", function(rect, actor) {
                if ($dataSystem.optDisplayTp) {
                    this.drawGaugeAreaWithTp(rect, actor);
                } else {
                    this.drawGaugeAreaWithoutTp(rect, actor);
                }
            });
            def(WBS, "drawGaugeAreaWithTp", function(rect, actor) {
                this.drawActorHp(actor, rect.x + 0, rect.y, 108);
                this.drawActorMp(actor, rect.x + 123, rect.y, 96);
                this.drawActorTp(actor, rect.x + 234, rect.y, 96);
            });
            def(WBS, "drawGaugeAreaWithoutTp", function(rect, actor) {
                this.drawActorHp(actor, rect.x + 0, rect.y, 201);
                this.drawActorMp(actor, rect.x + 216, rect.y, 114);
            });
        }

        // ---- Window_BattleLog MV back-dimmer ----
        if (global.Window_BattleLog) {
            def(Window_BattleLog.prototype, "createBackBitmap", function() {
                this._backBitmap = new Bitmap(this.width, this.height);
            });
            def(Window_BattleLog.prototype, "createBackSprite", function() {
                this._backSprite = new Sprite();
                this._backSprite.bitmap = this._backBitmap;
                this._backSprite.y = this.y;
                this.addChildToBack(this._backSprite);
            });
        }

        // ---- Number/shop input button visibility (MZ kept _buttons) ----
        [global.Window_NumberInput, global.Window_ShopNumber].forEach(function(cls) {
            if (!cls) return;
            def(cls.prototype, "showButtons", function() {
                var buttons = this._buttons || [];
                for (var i = 0; i < buttons.length; i++) buttons[i].visible = true;
            });
            def(cls.prototype, "hideButtons", function() {
                var buttons = this._buttons || [];
                for (var i = 0; i < buttons.length; i++) buttons[i].visible = false;
            });
            def(cls.prototype, "updateButtonsVisiblity", function() {
                if (TouchInput.date > Input.date) this.showButtons();
                else this.hideButtons();
            });
        });
        // ---- Window_Gold MV metrics (MV self-sizes in initialize(x, y);
        // MZ deleted windowWidth/windowHeight so MV-style construction
        // defaulted to a fullscreen-tall gold window — YEP_ShopMenuCore
        // then computed its status window height as boxHeight minus the
        // gold window's 712px = NEGATIVE, wrecking the shop layout). ----
        if (global.Window_Gold) {
            def(Window_Gold.prototype, "windowWidth", function() { return 240; });
            def(Window_Gold.prototype, "windowHeight", function() {
                return this.fittingHeight(1);
            });
        }

        // ---- MV shop window constructor signatures. The generic MV-args
        // rect adapter assumes (x, y, width, height); MV's Window_ShopBuy
        // is (x, y, HEIGHT, shopGoods) and Window_ShopNumber is
        // (x, y, HEIGHT) — arg 3 landed in rect.width and the goods array
        // became rect.height (NaN): mis-sized windows covering the screen
        // and "_shopGoods is not iterable" when YEP_ShopMenuCore builds
        // the shop MV-style. ----
        if (global.Window_ShopBuy && !Window_ShopBuy.prototype.initialize.__mvCompatShopSig) {
            const originalShopBuyInit = Window_ShopBuy.prototype.initialize;
            Window_ShopBuy.prototype.initialize = function(x, y, height, shopGoods) {
                if (!isRectangle(x) && Array.isArray(shopGoods)) {
                    const width = typeof this.windowWidth === "function"
                        ? this.windowWidth() : 456;
                    const rect = new Rectangle(Number(x) || 0, Number(y) || 0,
                        width, Number(height) || 456);
                    const result = originalShopBuyInit.call(this, rect);
                    // MV tail, verbatim
                    this._shopGoods = shopGoods;
                    this._money = 0;
                    this.refresh();
                    this.select(0);
                    return result;
                }
                return originalShopBuyInit.apply(this, arguments);
            };
            Window_ShopBuy.prototype.initialize.__mvCompatShopSig = true;
            def(Window_ShopBuy.prototype, "windowWidth", function() { return 456; });
        }
        if (global.Window_ShopNumber && !Window_ShopNumber.prototype.initialize.__mvCompatShopSig) {
            const originalShopNumberInit = Window_ShopNumber.prototype.initialize;
            Window_ShopNumber.prototype.initialize = function(x, y, height) {
                if (!isRectangle(x) && arguments.length === 3 && typeof height === "number") {
                    const width = typeof this.windowWidth === "function"
                        ? this.windowWidth() : 456;
                    return originalShopNumberInit.call(this,
                        new Rectangle(Number(x) || 0, Number(y) || 0, width, height));
                }
                return originalShopNumberInit.apply(this, arguments);
            };
            Window_ShopNumber.prototype.initialize.__mvCompatShopSig = true;
            def(Window_ShopNumber.prototype, "windowWidth", function() { return 456; });
        }

        if (global.Window_ShopNumber) {
            def(Window_ShopNumber.prototype, "itemY", function() {
                return Math.round(this.contentsHeight() / 2 - this.lineHeight() * 1.5);
            });
            def(Window_ShopNumber.prototype, "priceY", function() {
                return Math.round(this.contentsHeight() / 2 + this.lineHeight() / 2);
            });
        }

        // ---- BattleManager status window (MV API; MZ moved refresh
        // responsibility onto the windows themselves). VE_ActiveTimeBattle
        // calls BattleManager.refreshStatus() from startActionInput. ----
        if (global.BattleManager) {
            def(BattleManager, "setStatusWindow", function(statusWindow) {
                this._statusWindow = statusWindow;
            });
            def(BattleManager, "refreshStatus", function() {
                if (this._statusWindow) this._statusWindow.refresh();
            });

            // MV actor-selection model: index-based (_actorIndex +
            // changeActor); MZ is reference-based (_currentActor +
            // changeCurrentActor). Bridge with an accessor so MV plugins
            // that read (PSYCHRONIC_ClassItems) or write (YEP_PartySystem)
            // _actorIndex directly stay in sync with MZ's _currentActor,
            // which the Reactor corescript keeps using untouched.
            if (!("_actorIndex" in BattleManager)) {
                Object.defineProperty(BattleManager, "_actorIndex", {
                    get: function() {
                        if (!this._currentActor || !global.$gameParty) return -1;
                        return $gameParty.members().indexOf(this._currentActor);
                    },
                    set: function(index) {
                        this._currentActor = (index >= 0 && global.$gameParty
                            ? $gameParty.members()[index]
                            : null) || null;
                    },
                    configurable: true
                });
            }
            // MV verbatim; _actorIndex accessor above keeps _currentActor
            // in sync. VE_ActiveTimeBattle.startActionInput calls both.
            def(BattleManager, "changeActor", function(newActorIndex, lastActorActionState) {
                var lastActor = this.actor();
                this._actorIndex = newActorIndex;
                var newActor = this.actor();
                if (lastActor) {
                    lastActor.setActionState(lastActorActionState);
                }
                if (newActor) {
                    newActor.setActionState("inputting");
                }
            });
            def(BattleManager, "clearActor", function() {
                this.changeActor(-1, "");
            });
            // MZ dropped _turnForced; undefined reads as MV's default false.
            def(BattleManager, "isForcedTurn", function() {
                return !!this._turnForced;
            });
            // Reactor's Scene_Battle.createDisplayObjects (MZ model) never
            // calls setStatusWindow. setLogWindow IS called there, after
            // createAllWindows, so the status window exists — and unlike
            // createStatusWindow/createDisplayObjects it is not replaced
            // wholesale by battle plugins (anchor lesson from the
            // battleback fix).
            if (BattleManager.setLogWindow && !BattleManager.setLogWindow.__mvCompatStatusHook) {
                const originalSetLogWindow = BattleManager.setLogWindow;
                BattleManager.setLogWindow = function(logWindow) {
                    originalSetLogWindow.apply(this, arguments);
                    const scene = global.SceneManager && SceneManager._scene;
                    if (scene && scene._statusWindow) {
                        this.setStatusWindow(scene._statusWindow);
                    }
                };
                BattleManager.setLogWindow.__mvCompatStatusHook = true;
            }
        }

        // ---- Scenes ----
        if (global.Scene_Battle) {
            def(Scene_Battle.prototype, "refreshStatus", function() {
                if (this._statusWindow) this._statusWindow.refresh();
            });
        }
        if (global.Scene_ItemBase) {
            def(Scene_ItemBase.prototype, "showSubWindow", function(win) {
                win.x = this.isCursorLeft() ? Graphics.boxWidth - win.width : 0;
                win.show();
                win.activate();
            });
            def(Scene_ItemBase.prototype, "hideSubWindow", function(win) {
                win.hide();
                win.deactivate();
            });
        }

    }

    // TIER 2 ONLY: full MV damage-popup restoration (deliberate override).
    // MZ redraws damage popups as plain text; MV renders them from the
    // img/system/Damage.png sheet — MV games often customize that sheet,
    // so the MZ look is visibly wrong for them. MV plugins also depend on
    // the MV internals: LeTBS_DamagePopupEX dereferences this._damageBitmap
    // (crash: reading measureTextWidth of undefined) and calls the MV
    // two-arg createDigits(baseRow, value) — MZ's one-arg version would
    // render the baseRow as the number. VE_DamagePopup's Sprite_CustomDamage
    // subclasses this prototype at load, so the MV shape must be in place
    // before plugins. All MV verbatim.
    function installDamagePopupCompatibility() {
        if (global.Sprite_Damage) {
            Sprite_Damage.prototype.initialize = function() {
                Sprite.prototype.initialize.call(this);
                this._duration = 90;
                this._flashColor = [0, 0, 0, 0];
                this._flashDuration = 0;
                this._damageBitmap = ImageManager.loadSystem("Damage");
            };
            Sprite_Damage.prototype.setup = function(target) {
                var result = target.result();
                if (result.missed || result.evaded) {
                    this.createMiss();
                } else if (result.hpAffected) {
                    this.createDigits(0, result.hpDamage);
                } else if (target.isAlive() && result.mpDamage !== 0) {
                    this.createDigits(2, result.mpDamage);
                }
                if (result.critical) {
                    this.setupCriticalEffect();
                }
            };
            Sprite_Damage.prototype.setupCriticalEffect = function() {
                this._flashColor = [255, 0, 0, 160];
                this._flashDuration = 60;
            };
            Sprite_Damage.prototype.digitWidth = function() {
                return this._damageBitmap ? this._damageBitmap.width / 10 : 0;
            };
            Sprite_Damage.prototype.digitHeight = function() {
                return this._damageBitmap ? this._damageBitmap.height / 5 : 0;
            };
            Sprite_Damage.prototype.createMiss = function() {
                var w = this.digitWidth();
                var h = this.digitHeight();
                var sprite = this.createChildSprite();
                sprite.setFrame(0, 4 * h, 4 * w, h);
                sprite.dy = 0;
            };
            Sprite_Damage.prototype.createDigits = function(baseRow, value) {
                var string = Math.abs(value).toString();
                var row = baseRow + (value < 0 ? 1 : 0);
                var w = this.digitWidth();
                var h = this.digitHeight();
                for (var i = 0; i < string.length; i++) {
                    var sprite = this.createChildSprite();
                    var n = Number(string[i]);
                    sprite.setFrame(n * w, row * h, w, h);
                    sprite.x = (i - (string.length - 1) / 2) * w;
                    sprite.dy = -i;
                }
            };
            Sprite_Damage.prototype.createChildSprite = function() {
                var sprite = new Sprite();
                sprite.bitmap = this._damageBitmap;
                sprite.anchor.x = 0.5;
                sprite.anchor.y = 1;
                sprite.y = -40;
                sprite.ry = sprite.y;
                this.addChild(sprite);
                return sprite;
            };
            // MZ's destroy() destroys each child's bitmap — correct for MZ,
            // where every popup draws its own bitmap, but fatal here: all MV
            // digit sprites share the ONE cached system Damage bitmap. The
            // first popup destroyed would kill the texture under every other
            // live popup (v8 renders a destroyed source -> whole-stage render
            // crash -> black screen). Destroy only the sprites.
            Sprite_Damage.prototype.destroy = function(options) {
                Sprite.prototype.destroy.call(this, options);
            };
            Sprite_Damage.prototype.update = function() {
                Sprite.prototype.update.call(this);
                if (this._duration > 0) {
                    this._duration--;
                    for (var i = 0; i < this.children.length; i++) {
                        this.updateChild(this.children[i]);
                    }
                }
                this.updateFlash();
                this.updateOpacity();
            };
            Sprite_Damage.prototype.updateChild = function(sprite) {
                sprite.dy += 0.5;
                sprite.ry += sprite.dy;
                if (sprite.ry >= 0) {
                    sprite.ry = 0;
                    sprite.dy *= -0.6;
                }
                sprite.y = Math.round(sprite.ry);
                sprite.setBlendColor(this._flashColor);
            };
            Sprite_Damage.prototype.updateFlash = function() {
                if (this._flashDuration > 0) {
                    var d = this._flashDuration--;
                    this._flashColor[3] *= (d - 1) / d;
                }
            };
            Sprite_Damage.prototype.updateOpacity = function() {
                if (this._duration < 10) {
                    this.opacity = 255 * this._duration / 10;
                }
            };
            Sprite_Damage.prototype.isPlaying = function() {
                return this._duration > 0;
            };
        }
    }

    function installButtonCompatibility() {
        if (!global.Sprite_Button || !Sprite_Button.prototype || Sprite_Button.prototype.__mvCompatWrapped) return;

        const originalCheckBitmap = Sprite_Button.prototype.checkBitmap;
        Sprite_Button.prototype.checkBitmap = function() {
            if (this.bitmap && this.bitmap.isReady && this.bitmap.isReady() && this.bitmap.width < this.blockWidth() * 11) {
                if (!this.__mvCompatButtonSetAdjusted) {
                    const table = {
                        down2: { x: 0, w: 1 },
                        pagedown: { x: 0, w: 1 },
                        down: { x: 1, w: 1 },
                        up: { x: 2, w: 1 },
                        pageup: { x: 3, w: 1 },
                        up2: { x: 3, w: 1 },
                        ok: { x: 4, w: 2 },
                        cancel: { x: 4, w: 2 },
                        menu: { x: 4, w: 2 }
                    };
                    const data = table[this._buttonType] || table.ok;
                    const x = data.x * this.blockWidth();
                    const width = data.w * this.blockWidth();
                    const height = this.blockHeight();
                    this.setColdFrame(x, 0, width, height);
                    this.setHotFrame(x, height, width, height);
                    this.__mvCompatButtonSetAdjusted = true;
                }
                return;
            }
            if (originalCheckBitmap) return originalCheckBitmap.call(this);
        };
        Sprite_Button.prototype.checkBitmap.__mvCompatWrapped = true;
        Sprite_Button.prototype.__mvCompatWrapped = true;
    }

    function installAnimationCompatibility() {
        if (global.Game_CharacterBase) {
            Game_CharacterBase.prototype.requestAnimation = function(animationId) {
                $gameTemp.requestAnimation([this], animationId);
            };
            Game_CharacterBase.prototype.requestBalloon = function(balloonId) {
                $gameTemp.requestBalloon(this, balloonId);
            };
        }
        if (global.Game_Battler) {
            Game_Battler.prototype.clearAnimations = Game_Battler.prototype.clearAnimations || function() {
                this._animations = [];
            };
            Game_Battler.prototype.startAnimation = function(animationId, mirror, delay) {
                if (animationId) {
                    this._animations = this._animations || [];
                    this._animations.push({ animationId: animationId, mirror: !!mirror, delay: delay || 0 });
                    $gameTemp.requestAnimation([this], animationId, mirror);
                }
            };
            Game_Battler.prototype.isAnimationRequested = function() {
                return !!(this._animations && this._animations.length > 0);
            };
            Game_Battler.prototype.shiftAnimation = function() {
                this._animations = this._animations || [];
                return this._animations.shift();
            };
        }
    }

    function installAnimationSpriteCompatibility() {
        if (!global.Sprite_Animation || !global.Sprite_AnimationMV) return;
        var P = Sprite_Animation.prototype;
        var MV = Sprite_AnimationMV.prototype;
        if (P.__mvAnimationApiInstalled) return;
        P.__mvAnimationApiInstalled = true;

        // MV plugins subclass Sprite_Animation expecting MV's cell-sheet
        // animation engine (LeTBS's Sprite_TBSAnimation calls remove/
        // setupRate/setupDuration/loadBitmaps/createSprites from its own
        // setup). MZ moved that entire engine to Sprite_AnimationMV and
        // turned Sprite_Animation into the Effekseer player. Gap-fill the
        // non-colliding MV methods straight from Sprite_AnimationMV…
        [
            "setupRate", "setupDuration", "loadBitmaps", "isReady",
            "createSprites", "createCellSprites", "createScreenFlashSprite",
            "updateFrame", "currentFrameIndex", "updateAllCellSprites",
            "updateCellSprite", "processTimingData", "startFlash",
            "startScreenFlash", "startHiding", "updateScreenFlash",
            "updateHiding", "updatePosition", "absoluteX", "absoluteY",
            "onEnd"
        ].forEach(function(name) {
            if (!P[name] && MV[name]) P[name] = MV[name];
        });

        // …hand-port createSprites (MZ dissolved it into direct
        // createCellSprites/createScreenFlashSprite calls in setup; MV's
        // version also deduped overlapping full-screen animations via
        // class-level checkers — skipped here, correctness over dedupe)…
        if (!P.createSprites) {
            P.createSprites = function() {
                this.createCellSprites();
                this.createScreenFlashSprite();
                this._duplicated = false;
            };
        }

        // …hand-port remove() (MZ dropped it; the MZ spriteset removes
        // ended animations itself)…
        if (!P.remove) {
            P.remove = function() {
                if (this.parent && this.parent.removeChild(this)) {
                    var targets = this._targets && this._targets.length
                        ? this._targets
                        : (this._target ? [this._target] : []);
                    for (var i = 0; i < targets.length; i++) {
                        var t = targets[i];
                        if (t && t.setBlendColor) t.setBlendColor([0, 0, 0, 0]);
                        if (t && t.show) t.show();
                    }
                }
            };
        }

        // …and dispatch the COLLIDING names per instance: once MV's
        // createSprites has run, the instance has _cellSprites and is in
        // MV cell mode — route to the MV engine; otherwise the MZ
        // Effekseer path runs untouched. Also normalize _target (MV
        // plugins set the singular) into the _targets array the MZ-hosted
        // MV methods iterate.
        ["update", "updateMain", "updateFlash", "isPlaying"].forEach(function(name) {
            var mz = P[name];
            if (!mz || !MV[name]) return;
            P[name] = function() {
                if (this._cellSprites) {
                    if (this._target && (!this._targets || this._targets[0] !== this._target)) {
                        this._targets = [this._target];
                    }
                    return MV[name].apply(this, arguments);
                }
                return mz.apply(this, arguments);
            };
        });
    }

    function installImageCompatibility() {
        if (!global.Bitmap || !global.ImageManager) return;

        Bitmap.request = Bitmap.request || function(url) {
            const bitmap = Bitmap.load(url);
            bitmap._requestOnly = true;
            return bitmap;
        };
        Bitmap.prototype.touch = Bitmap.prototype.touch || function() {
            this._touched = Date.now();
        };
        Bitmap.prototype.isRequestOnly = Bitmap.prototype.isRequestOnly || function() {
            return !!this._requestOnly;
        };
        Bitmap.prototype.startRequest = Bitmap.prototype.startRequest || function() {
            this._requestOnly = false;
        };
        Bitmap.prototype._setDirty = Bitmap.prototype._setDirty || function() {
            if (this._baseTexture && this._baseTexture.update) this._baseTexture.update();
        };
        Bitmap.prototype.rotateHue = Bitmap.prototype.rotateHue || function() {
            this._setDirty();
        };

        function ImageCache() { this.initialize.apply(this, arguments); }
        ImageCache.limit = ImageCache.limit || 10 * 1000 * 1000;
        ImageCache.prototype.initialize = function() { this._items = {}; };
        ImageCache.prototype.add = function(key, value) {
            this._items[key] = { bitmap: value, touch: Date.now(), key: key };
        };
        ImageCache.prototype.get = function(key) {
            const item = this._items[key];
            if (item) item.touch = Date.now();
            return item && item.bitmap;
        };
        ImageCache.prototype.reserve = function(key, value) { this.add(key, value); };
        ImageCache.prototype.releaseReservation = function() {};
        ImageCache.prototype.isReady = function() {
            return Object.keys(this._items).every(key => this._items[key].bitmap.isReady());
        };
        ImageCache.prototype.getErrorBitmap = function() {
            const key = Object.keys(this._items).find(k => this._items[k].bitmap.isError());
            return key ? this._items[key].bitmap : null;
        };
        global.ImageCache = global.ImageCache || ImageCache;

        function RequestQueue() { this.initialize.apply(this, arguments); }
        RequestQueue.prototype.initialize = function() { this._queue = []; };
        RequestQueue.prototype.enqueue = function(key, value) { this._queue.push({ key: key, value: value }); };
        RequestQueue.prototype.update = function() {
            const item = this._queue.shift();
            if (item && item.value && item.value.startRequest) item.value.startRequest();
        };
        RequestQueue.prototype.raisePriority = function(key) {
            const index = this._queue.findIndex(item => item.key === key);
            if (index > 0) this._queue.unshift(this._queue.splice(index, 1)[0]);
        };
        RequestQueue.prototype.clear = function() { this._queue.length = 0; };
        global.RequestQueue = global.RequestQueue || RequestQueue;

        ImageManager._imageCache = ImageManager._imageCache || new global.ImageCache();
        ImageManager._requestQueue = ImageManager._requestQueue || new global.RequestQueue();
        ImageManager.cache = ImageManager.cache || { _items: ImageManager._cache };
        ImageManager._generateCacheKey = ImageManager._generateCacheKey || function(path, hue) {
            return path + ":" + hue;
        };
        ImageManager.loadNormalBitmap = ImageManager.loadNormalBitmap || function(url) {
            return this.loadBitmapFromUrl(url);
        };
        ImageManager.loadEmptyBitmap = ImageManager.loadEmptyBitmap || function() {
            return this._emptyBitmap;
        };
        ImageManager.reserveBitmap = ImageManager.reserveBitmap || function(folder, filename, hue, smooth, reservationId) {
            if (!filename) return this._emptyBitmap;
            const bitmap = this.loadBitmap(folder, filename, hue, smooth);
            if (this._imageCache && this._imageCache.reserve) {
                const key = this._generateCacheKey ? this._generateCacheKey(folder, filename, hue) : folder + filename;
                this._imageCache.reserve(key, bitmap, reservationId);
            }
            return bitmap;
        };
        ImageManager.reserveNormalBitmap = ImageManager.reserveNormalBitmap || function(path, hue, reservationId) {
            const bitmap = this.loadNormalBitmap(path, hue || 0);
            if (this._imageCache && this._imageCache.reserve) {
                this._imageCache.reserve(this._generateCacheKey(path, hue || 0), bitmap, reservationId);
            }
            return bitmap;
        };

        for (const name of [
            "Animation", "Battleback1", "Battleback2", "Character", "Enemy",
            "Face", "Parallax", "Picture", "SvActor", "SvEnemy", "System",
            "Tileset", "Title1", "Title2"
        ]) {
            const loadName = "load" + name;
            const reserveName = "reserve" + name;
            if (!ImageManager[reserveName] && ImageManager[loadName]) {
                ImageManager[reserveName] = function(filename) {
                    return this[loadName](filename);
                };
            }
        }
    }

    function installTilemapCompatibility() {
        if (global.Tilemap) {
            if (!Object.getOwnPropertyDescriptor(Tilemap.prototype, "bitmaps")) {
                Object.defineProperty(Tilemap.prototype, "bitmaps", {
                    get: function() { return this._bitmaps; },
                    set: function(value) { this._bitmaps = value; },
                    configurable: true
                });
            }
            Tilemap.prototype.refreshTileset = Tilemap.prototype.refreshTileset || function() {
                this._needsRepaint = true;
            };
            Tilemap.prototype._paintAllTiles = Tilemap.prototype._paintAllTiles || function(startX, startY) {
                this._addAllSpots(startX || 0, startY || 0);
            };
            Tilemap.prototype._paintTiles = Tilemap.prototype._paintTiles || function(startX, startY, x, y) {
                this._addSpot(startX || 0, startY || 0, x || 0, y || 0);
            };
            global.ShaderTilemap = global.ShaderTilemap || function ShaderTilemap() {
                Tilemap.apply(this, arguments);
                this.roundPixels = true;
            };
            if (!global.ShaderTilemap.prototype || !(global.ShaderTilemap.prototype instanceof Tilemap)) {
                global.ShaderTilemap.prototype = Object.create(Tilemap.prototype);
                global.ShaderTilemap.prototype.constructor = global.ShaderTilemap;
            }
        }

        if (global.PIXI) {
            PIXI.tilemap = PIXI.tilemap || {};
            PIXI.tilemap.Constant = PIXI.tilemap.Constant || { maxTextures: 4 };
            PIXI.tilemap.shaderGenerator = PIXI.tilemap.shaderGenerator || {
                fillSamplers: function(shader, maxTextures) {
                    shader.uniforms = shader.uniforms || {};
                    shader.uniforms.uSamplers = Array.from({ length: maxTextures || 4 }, (_, i) => i);
                }
            };
            if (typeof PIXI.tilemap.TileRenderer !== "function") {
                PIXI.tilemap.TileRenderer = function TileRenderer(renderer) {
                    this.renderer = renderer || (Graphics && Graphics._renderer);
                    this.maxTextures = PIXI.tilemap.Constant.maxTextures;
                    this.indexBuffer = null;
                    this.glTextures = [];
                };
            }
            PIXI.tilemap.TileRenderer.prototype = PIXI.tilemap.TileRenderer.prototype || {};
            PIXI.tilemap.TileRenderer.prototype.onContextChange = PIXI.tilemap.TileRenderer.prototype.onContextChange || function() {};
            PIXI.tilemap.TileRenderer.prototype.bindTextures = PIXI.tilemap.TileRenderer.prototype.bindTextures || function() {};
            PIXI.tilemap.TileRenderer.prototype.destroy = PIXI.tilemap.TileRenderer.prototype.destroy || function() {};
            PIXI.tilemap.TileRenderer.prototype.getShader = PIXI.tilemap.TileRenderer.prototype.getShader || function() {
                return this._ultraMode7Shader || null;
            };
            PIXI.tilemap.TileRenderer.prototype.getVb = PIXI.tilemap.TileRenderer.prototype.getVb || function() {
                return null;
            };
            PIXI.tilemap.TileRenderer.prototype.checkIndexBuffer = PIXI.tilemap.TileRenderer.prototype.checkIndexBuffer || function() {};
            PIXI.tilemap.TileRenderer.SCALE_MODE = PIXI.tilemap.TileRenderer.SCALE_MODE || PIXI.SCALE_MODES.NEAREST;

            PIXI.tilemap.TilemapShader = PIXI.tilemap.TilemapShader || function TilemapShader(gl, maxTextures) {
                this.gl = gl;
                this.maxTextures = maxTextures || PIXI.tilemap.Constant.maxTextures;
                this.uniforms = {};
                this.attributes = {
                    aTextureId: "aTextureId",
                    aFrame: "aFrame",
                    aTextureCoord: "aTextureCoord",
                    aVertexPosition: "aVertexPosition",
                    aAnimation: "aAnimation"
                };
                this.indexBuffer = null;
            };
            PIXI.tilemap.TilemapShader.prototype = PIXI.tilemap.TilemapShader.prototype || {};
            PIXI.tilemap.TilemapShader.prototype.destroy = PIXI.tilemap.TilemapShader.prototype.destroy || function() {};

            PIXI.tilemap.RectTileLayer = PIXI.tilemap.RectTileLayer || function RectTileLayer() {
                PIXI.Container.call(this);
                this.pointsBuf = [];
                this.textures = [];
                this.vbs = null;
            };
            PIXI.tilemap.RectTileLayer.prototype = PIXI.tilemap.RectTileLayer.prototype || {};
            if (PIXI.Container && !(PIXI.tilemap.RectTileLayer.prototype instanceof PIXI.Container)) {
                PIXI.tilemap.RectTileLayer.prototype = Object.create(PIXI.Container.prototype);
                PIXI.tilemap.RectTileLayer.prototype.constructor = PIXI.tilemap.RectTileLayer;
            }
            PIXI.tilemap.RectTileLayer.prototype.renderWebGL = PIXI.tilemap.RectTileLayer.prototype.renderWebGL || function() {};
            PIXI.tilemap.RectTileLayer.prototype.renderWebGLCore = PIXI.tilemap.RectTileLayer.prototype.renderWebGLCore || function() {};
            PIXI.tilemap.RectTileLayer.prototype.destroyVb = PIXI.tilemap.RectTileLayer.prototype.destroyVb || function() {};
            PIXI.tilemap.RectTileLayer.prototype.clear = PIXI.tilemap.RectTileLayer.prototype.clear || function() {
                this.pointsBuf.length = 0;
            };

            PIXI.tilemap.CompositeRectTileLayer = PIXI.tilemap.CompositeRectTileLayer || function CompositeRectTileLayer() {
                PIXI.tilemap.RectTileLayer.call(this);
            };
            if (!(PIXI.tilemap.CompositeRectTileLayer.prototype instanceof PIXI.tilemap.RectTileLayer)) {
                PIXI.tilemap.CompositeRectTileLayer.prototype = Object.create(PIXI.tilemap.RectTileLayer.prototype);
                PIXI.tilemap.CompositeRectTileLayer.prototype.constructor = PIXI.tilemap.CompositeRectTileLayer;
            }

            PIXI.tilemap.ZLayer = PIXI.tilemap.ZLayer || function ZLayer() {
                PIXI.Container.call(this);
            };
            if (PIXI.Container && !(PIXI.tilemap.ZLayer.prototype instanceof PIXI.Container)) {
                PIXI.tilemap.ZLayer.prototype = Object.create(PIXI.Container.prototype);
                PIXI.tilemap.ZLayer.prototype.constructor = PIXI.tilemap.ZLayer;
            }
            PIXI.tilemap.ZLayer.prototype.clear = PIXI.tilemap.ZLayer.prototype.clear || function() {
                for (const child of this.children || []) {
                    if (child && child.clear) child.clear();
                }
            };
        }
    }

    function installPixiCompatibility() {
        if (!global.PIXI) return;

        if (PIXI.TextureSource && PIXI.Renderer) {
            // Pixi8 removed renderer plugins. Let legacy plugins register without
            // adding invalid renderer systems that break Application.init().
            PIXI.Renderer.registerPlugin = function() {};
            PIXI.Renderer.registerPlugin.__mvCompatNoop = true;
        }
        PIXI.particles = PIXI.particles || {};
        if (!PIXI.particles.ParticleContainer && PIXI.Container) {
            PIXI.particles.ParticleContainer = class MVParticleContainer extends PIXI.Container {
                constructor(maxSize, properties) {
                    super();
                    this.maxSize = maxSize || 0;
                    this.properties = properties || {};
                }
            };
        }
        PIXI.utils = PIXI.utils || {};
        PIXI.utils.hex2rgb = PIXI.utils.hex2rgb || function(hex, out) {
            out = out || [];
            out[0] = ((hex >> 16) & 0xff) / 255;
            out[1] = ((hex >> 8) & 0xff) / 255;
            out[2] = (hex & 0xff) / 255;
            return out;
        };
        PIXI.utils.rgb2hex = PIXI.utils.rgb2hex || function(rgb) {
            return ((rgb[0] * 255) << 16) + ((rgb[1] * 255) << 8) + (rgb[2] * 255 | 0);
        };
        if (PIXI.Filter && PIXI.GlProgram && PIXI.UniformGroup && !PIXI.Filter.__mvCompatWrapped) {
            const OriginalFilter = PIXI.Filter;
            const inferUniformType = function(glslType) {
                return ({
                    float: "f32",
                    int: "i32",
                    bool: "i32",
                    vec2: "vec2<f32>",
                    vec3: "vec3<f32>",
                    vec4: "vec4<f32>",
                    mat3: "mat3x3<f32>",
                    mat4: "mat4x4<f32>"
                })[glslType];
            };
            const buildUniformStructures = function(shaderSource, uniforms) {
                const structures = {};
                const uniformRegex = /uniform\s+(float|int|bool|vec2|vec3|vec4|mat3|mat4)\s+(\w+)\s*;/g;
                let match;
                while ((match = uniformRegex.exec(shaderSource))) {
                    const type = inferUniformType(match[1]);
                    const name = match[2];
                    if (type && name !== "filterArea") structures[name] = { value: uniforms && uniforms[name], type: type };
                }
                return structures;
            };
            const defaultFilterVertex = "in vec2 aPosition;\n" +
                "out vec2 vTextureCoord;\n" +
                "uniform highp vec4 uInputSize;\n" +
                "uniform vec4 uOutputFrame;\n" +
                "uniform vec4 uOutputTexture;\n" +
                "vec4 filterVertexPosition(void) {\n" +
                "    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;\n" +
                "    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;\n" +
                "    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;\n" +
                "    return vec4(position, 0.0, 1.0);\n" +
                "}\n" +
                "vec2 filterTextureCoord(void) {\n" +
                "    return aPosition * (uOutputFrame.zw * uInputSize.zw);\n" +
                "}\n" +
                "void main(void) {\n" +
                "    gl_Position = filterVertexPosition();\n" +
                "    vTextureCoord = filterTextureCoord();\n" +
                "}\n";
            const translateFragment = function(fragment) {
                fragment = String(fragment || "");
                fragment = fragment.replace(/varying\s+/g, "in ");
                fragment = fragment.replace(/uniform\s+sampler2D\s+uSampler\s*;/g, "uniform sampler2D uTexture;");
                fragment = fragment.replace(/uniform\s+vec4\s+filterArea\s*;/g, "uniform highp vec4 uInputSize;");
                fragment = fragment.replace(/\bfilterArea\s*\.\s*xy\b/g, "uInputSize.xy");
                fragment = fragment.replace(/\buSampler\b/g, "uTexture");
                fragment = fragment.replace(/\btexture2D\s*\(/g, "texture(");
                if (/\bgl_FragColor\b/.test(fragment) && !/out\s+vec4\s+finalColor\s*;/.test(fragment)) {
                    fragment = "out vec4 finalColor;\n" + fragment;
                }
                fragment = fragment.replace(/\bgl_FragColor\b/g, "finalColor");
                return fragment;
            };
            PIXI.Filter = class MVCompatFilter extends OriginalFilter {
                constructor(vertexSrc, fragmentSrc, uniforms) {
                    if (typeof vertexSrc === "string" || typeof fragmentSrc === "string") {
                        fragmentSrc = translateFragment(fragmentSrc);
                        const shaderSource = defaultFilterVertex + "\n" + (fragmentSrc || "");
                        const filterUniforms = new PIXI.UniformGroup(buildUniformStructures(shaderSource, uniforms));
                        super({
                            glProgram: PIXI.GlProgram.from({
                                vertex: defaultFilterVertex,
                                fragment: fragmentSrc,
                                name: "mv-compat-filter"
                            }),
                            resources: { filterUniforms: filterUniforms }
                        });
                        this.uniforms = filterUniforms.uniforms;
                        this.__mvCompatUniformGroup = filterUniforms;
                    } else {
                        super(vertexSrc);
                    }
                }
            };
            Object.setPrototypeOf(PIXI.Filter, OriginalFilter);
            PIXI.Filter.prototype.constructor = PIXI.Filter;
            PIXI.Filter.__mvCompatWrapped = true;
        }
        if (PIXI.Texture && PIXI.Texture.prototype &&
            !Object.getOwnPropertyDescriptor(PIXI.Texture.prototype, "frameBuffer")) {
            Object.defineProperty(PIXI.Texture.prototype, "frameBuffer", {
                get: function() {
                    const source = this.source || this._source || {};
                    const frame = this.frame || {};
                    return {
                        width: source.width || frame.width || 0,
                        height: source.height || frame.height || 0
                    };
                },
                configurable: true
            });
        }
        for (const RendererClass of [PIXI.Renderer, PIXI.WebGLRenderer, PIXI.WebGPURenderer]) {
            if (!RendererClass) continue;
            RendererClass.registerPlugin = function() {};
            RendererClass.registerPlugin.__mvCompatNoop = true;
            if (RendererClass.prototype && RendererClass.prototype._addSystem &&
                !RendererClass.prototype._addSystem.__mvCompatWrapped) {
                const originalAddSystem = RendererClass.prototype._addSystem;
                RendererClass.prototype._addSystem = function(ClassRef, name) {
                    if (typeof ClassRef !== "function") {
                        // Benign: v8 system tables carry undefined slots for
                        // systems this build doesn't ship.
                        (window.$reactorCompatLog || function() {})(
                            "ReactorMVCompat: skipped invalid Pixi renderer system", name, ClassRef);
                        return this;
                    }
                    return originalAddSystem.call(this, ClassRef, name);
                };
                RendererClass.prototype._addSystem.__mvCompatWrapped = true;
            }
        }

        PIXI.extras = PIXI.extras || {};
        if (!PIXI.extras.TilingSprite && PIXI.TilingSprite) {
            PIXI.extras.TilingSprite = function(texture, width, height) {
                let tex = texture;
                if (texture && texture._textureSource && global.PIXICreateTexture) {
                    tex = PIXICreateTexture(texture);
                }
                if (PIXI.TextureSource) {
                    return new PIXI.TilingSprite({ texture: tex, width: width, height: height });
                }
                return new PIXI.TilingSprite(tex, width, height);
            };
            PIXI.extras.TilingSprite.prototype = PIXI.TilingSprite.prototype;
        }

        if (PIXI.RenderTexture && PIXI.RenderTexture.create && !PIXI.RenderTexture.create.__mvCompatWrapped) {
            const originalCreate = PIXI.RenderTexture.create;
            PIXI.RenderTexture.create = function(width, height, scaleMode, resolution) {
                if (typeof width === "number") {
                    width = Math.max(1, width || 0);
                    height = Math.max(1, height || width);
                    if (scaleMode === 0) scaleMode = "linear";
                    if (scaleMode === 1) scaleMode = "nearest";
                    if (PIXI.TextureSource) {
                        const options = {
                            width: width,
                            height: height
                        };
                        if (scaleMode != null) options.scaleMode = scaleMode;
                        if (Number.isFinite(resolution) && resolution > 0) options.resolution = resolution;
                        return originalCreate.call(this, options);
                    }
                } else if (PIXI.TextureSource && width && typeof width === "object") {
                    const options = Object.assign({}, width);
                    options.width = Math.max(1, Number(options.width || 0));
                    options.height = Math.max(1, Number(options.height || 0));
                    if (!Number.isFinite(options.resolution) || options.resolution <= 0) {
                        delete options.resolution;
                    }
                    return originalCreate.call(this, options);
                }
                return originalCreate.apply(this, arguments);
            };
            PIXI.RenderTexture.create.__mvCompatWrapped = true;
        }

        const patchRenderer = function(renderer) {
            if (!renderer || renderer.render.__mvCompatWrapped) return;
            const originalRender = renderer.render;
            renderer.render = function(displayObject, renderTexture, clear, transform, skipUpdateTransform) {
                if (arguments.length > 1 && PIXI.TextureSource) {
                    if (renderTexture && renderTexture.source) {
                        const source = renderTexture.source;
                        if (!source.pixelWidth || !source.pixelHeight) {
                            try { source.resize(1, 1, source._resolution || source.resolution || 1); } catch (e) {}
                        }
                    }
                    return originalRender.call(this, {
                        container: displayObject,
                        target: renderTexture || undefined,
                        clear: clear,
                        transform: transform,
                        skipUpdateTransform: skipUpdateTransform
                    });
                }
                return originalRender.apply(this, arguments);
            };
            renderer.render.__mvCompatWrapped = true;
        };

        if (global.Graphics) {
            Graphics._clearUpperCanvas = Graphics._clearUpperCanvas || function() {};
            Graphics._upperCanvas = Graphics._upperCanvas || null;
            if (!Object.getOwnPropertyDescriptor(Graphics, "_renderer")) {
                Object.defineProperty(Graphics, "_renderer", {
                    get: function() { return this._app && this._app.renderer; },
                    configurable: true
                });
            }
            if (Graphics._createPixiApp && !Graphics._createPixiApp.__mvCompatWrapped) {
                const originalCreateApp = Graphics._createPixiApp;
                Graphics._createPixiApp = async function() {
                    const result = await originalCreateApp.apply(this, arguments);
                    patchRenderer(this._app && this._app.renderer);
                    return result;
                };
                Graphics._createPixiApp.__mvCompatWrapped = true;
            }
        }
    }

    function installAudioFontCompatibility() {
        const hasProjectFont = function(filename) {
            if (typeof require !== "function" || typeof process === "undefined") return false;
            try {
                const fs = require("fs");
                const path = require("path");
                const mainFile = process.mainModule && process.mainModule.filename;
                const root = mainFile ? path.dirname(mainFile) : process.cwd();
                return fs.existsSync(path.join(root, "fonts", filename));
            } catch (e) {
                return false;
            }
        };
        if (global.AudioManager && AudioManager.createBuffer && !AudioManager.createBuffer.__mvCompatWrapped) {
            const originalCreateBuffer = AudioManager.createBuffer;
            AudioManager.createBuffer = function(folder, name) {
                if (folder && folder[folder.length - 1] !== "/") folder += "/";
                return originalCreateBuffer.call(this, folder, name);
            };
            AudioManager.createBuffer.__mvCompatWrapped = true;
        }
        if (global.FontManager && FontManager.load && !FontManager.load.__mvCompatWrapped) {
            const originalFontLoad = FontManager.load;
            FontManager.load = function(family, filename) {
                if (filename) {
                    filename = String(filename).replace(/\\/g, "/");
                    const fontsIndex = filename.lastIndexOf("/fonts/");
                    if (fontsIndex >= 0) filename = filename.slice(fontsIndex + 7);
                    if (filename.indexOf("fonts/") === 0) filename = filename.slice(6);
                    if ((filename === "mplus-1m-regular.woff" || filename === "mplus-2p-bold-sub.woff") &&
                        !hasProjectFont(filename) && hasProjectFont("_decterm.ttf")) {
                        filename = "_decterm.ttf";
                    }
                }
                return originalFontLoad.call(this, family, filename);
            };
            FontManager.load.__mvCompatWrapped = true;
        }
        if (global.Graphics && global.FontManager) {
            Graphics.loadFont = function(name, url) {
                if (url) {
                    url = String(url).replace(/\\/g, "/");
                    const fontsIndex = url.lastIndexOf("/fonts/");
                    if (fontsIndex >= 0) url = url.slice(fontsIndex + 7);
                    if (url.indexOf("fonts/") === 0) url = url.slice(6);
                }
                FontManager.load(name, url);
            };
            Graphics.updateLoading = Graphics.updateLoading || function() {};
            Graphics.hasWebGL = function() {
                return Utils.canUseWebGL ? Utils.canUseWebGL() : !!(this._app && this._app.renderer);
            };
        }
    }

    function installPluginManagerCompatibility() {
        if (!global.PluginManager || !PluginManager.loadScript || PluginManager.loadScript.__mvCompatWrapped) return;
        const originalLoadScript = PluginManager.loadScript;
        PluginManager.loadScript = function(filename) {
            if (String(filename).slice(-3).toLowerCase() === ".js") {
                filename = String(filename).slice(0, -3);
            }
            const result = originalLoadScript.call(this, filename);
            setTimeout(installFinalPluginCompatibility, 0);
            setTimeout(installFinalPluginCompatibility, 250);
            setTimeout(installFinalPluginCompatibility, 1000);
            return result;
        };
        PluginManager.loadScript.__mvCompatWrapped = true;
        if (PluginManager.setup && !PluginManager.setup.__mvCompatWrapped) {
            const originalSetup = PluginManager.setup;
            PluginManager.setup = function() {
                const result = originalSetup.apply(this, arguments);
                setTimeout(installFinalPluginCompatibility, 0);
                setTimeout(installFinalPluginCompatibility, 250);
                setTimeout(installFinalPluginCompatibility, 1000);
                setTimeout(installFinalPluginCompatibility, 3000);
                return result;
            };
            PluginManager.setup.__mvCompatWrapped = true;
        }
    }

    function installFinalPluginCompatibility() {
        installFinalMessageCompatibility();
        installFinalSaveCompatibility();
        installFinalBitmapCompatibility();
        installFinalBattleLogCompatibility();
        installFinalAnimationCompatibility();
        installFinalLightingCompatibility();
        installFinalBattleHudCompatibility();
        installFinalLeTBSAiPerformance();
        installGraphicsCompatibility();
        installJsonExCompatibility();
        installDataManagerCompatibility();
        installStorageManagerCompatibility();
    }

    function installFinalAnimationCompatibility() {
        // MV plugins tune the cell-animation engine on Sprite_Animation;
        // MZ renamed that class Sprite_AnimationMV (Sprite_Animation is
        // now the Effekseer player), so those overrides never take effect
        // on the sprites that actually play MV animations. Propagate the
        // safe tuning methods to the MZ host class after plugins load:
        // YEP_CoreEngine's setupRate ("Animation Rate" speed param) and
        // MOG_BattleHud's updatePosition (screen-position centering).
        // Never propagate the per-instance dispatchers installed by
        // installAnimationSpriteCompatibility (__mvCompatDispatch).
        if (!global.Sprite_Animation || !global.Sprite_AnimationMV) return;
        ["setupRate", "setupDuration", "updatePosition"].forEach(function(name) {
            const fn = Sprite_Animation.prototype[name];
            if (typeof fn === "function" && !fn.__mvCompatDispatch &&
                    Sprite_AnimationMV.prototype[name] !== fn) {
                Sprite_AnimationMV.prototype[name] = fn;
            }
        });
    }

    function installFinalBattleHudCompatibility() {
        // MOG_BattleHud replaces the battle status UI with HUD sprites and
        // hides Window_BattleStatus in its initialize wrap (visible=false).
        // MV's Scene_Battle only ever open()s the status window, so the
        // hide held; Reactor's MZ scene flow calls show() (visible=true) in
        // five places, resurrecting a half-styled MZ status window over
        // MOG's HUD (clipped card at the screen edge in battles). Pin the
        // MV behavior when MOG's HUD owns the status display.
        if (!global.Imported || !Imported.MOG_BattleHud) return;
        if (!global.Window_BattleStatus ||
            Window_BattleStatus.prototype.show.__mvCompatMogHide) return;
        Window_BattleStatus.prototype.show = function() {
            // MOG_BattleHud owns the battle status display
        };
        Window_BattleStatus.prototype.show.__mvCompatMogHide = true;
    }

    function installFinalLeTBSAiPerformance() {
        // LeTBS's AI evaluates one skill by iterating every reachable move
        // cell x every action cell, rebuilding the AoE scope and running a
        // per-entity eval() for each combination — profiled at 80-146ms
        // per skill (a visible hitch on every enemy turn). The combination
        // space collapses: the AoE around a given action cell is identical
        // from every move cell that approaches it from the same direction,
        // and an entity's use-condition cannot change mid-evaluation.
        // Re-implementation of getAoEPossibleMoves with three memoizations:
        // scope/AoE data hoisted per call, AoE + filtered entities cached
        // per (aoeCenter, dir[, move cell when the AoE is LoS-sensitive]),
        // and the eval() verdict cached per entity. Guarded by a source
        // fingerprint so an edited or future LeTBS keeps its own version.
        if (!global.TBSAiManager || !TBSAiManager.prototype) return;
        var orig = TBSAiManager.prototype.getAoEPossibleMoves;
        if (!orig || orig.__mvCompatOptimized) return;
        var src = String(orig);
        if (src.indexOf("getEntitiesInScope(aoe)") < 0 ||
            src.indexOf("nbrAllies") < 0 ||
            src.indexOf("useCondition") < 0) {
            return; // unknown LeTBS variant; leave it alone
        }
        TBSAiManager.prototype.getAoEPossibleMoves = function (entity, obj, center) {
            var possibilities = [];
            var scope = this.BM().makeMoveScope(entity, true).cells;
            scope = scope.filter(function (cell) {
                return cell._walkable;
            });
            var moveScope = [entity.getCell()].concat(scope);

            var BM = this.BM();
            var isAttack = obj.id === entity._battler.attackSkillId();
            var data = isAttack ? entity.getAttackScopeData() : entity.getObjectScopeData(obj);
            var aoeData = isAttack ? entity.getAttackAoEData() : entity.getObjectAoEData(obj);
            var condition = obj.TagsLetbsAi.useCondition;
            var aoeCache = {};
            var evalCache = new Map();
            var self = this;

            while (moveScope.length > 0) {
                var moveCell = moveScope.shift();
                var currentCenter = moveCell.toCoords();
                var oldCell = entity.getCell();
                entity.setCell(moveCell);

                var actionScope = BM.makeActionScope(entity, data, obj, true)
                    .cells
                    .filter(function (cell) {
                        return !(!cell._selectable || (cell.isObstacleForLOS() && !cell.isThereEntity()));
                    });
                while (actionScope.length > 0) {
                    var actionCell = actionScope.shift();
                    var aoeCenter = actionCell.toCoords();
                    var param = BM.makeObjAoEParam(obj, entity, aoeCenter);
                    // Line-of-sight filtering is computed from the AoE
                    // center (checkScopeVisibility(cells, center)), so it is
                    // identical from every move cell. Only exclude_user,
                    // cells_reachable and select read the caster's position.
                    var posSensitive = !!(param.exclude_user ||
                        param.cells_reachable || param.select);
                    var key = aoeCenter.x + "," + aoeCenter.y + "," + param.dir +
                        (posSensitive ? "," + currentCenter.x + "," + currentCenter.y : "");
                    var hit = aoeCache[key];
                    if (!hit) {
                        var aoe = BM.getScopeFromData(aoeData, aoeCenter, param);
                        var entities = BM.getEntitiesInScope(aoe).filter(function (ent) {
                            var cached = evalCache.get(ent);
                            if (cached !== undefined) return cached;
                            var b = ent.battler();
                            var e = ent;
                            var result = !!eval(condition);
                            evalCache.set(ent, result);
                            return result;
                        });
                        hit = {
                            targets: entities,
                            nbrAllies: entities.filter(function (ent) {
                                return self.isAlly(ent);
                            }).length,
                            nbrEnemies: entities.filter(function (ent) {
                                return self.isEnemy(ent);
                            }).length
                        };
                        aoeCache[key] = hit;
                    }
                    if (hit.nbrAllies > 0 || hit.nbrEnemies > 0) {
                        possibilities.push({
                            moveCell: moveCell,
                            actionCell: actionCell,
                            nbrAllies: hit.nbrAllies,
                            nbrEnemies: hit.nbrEnemies,
                            targets: hit.targets
                        });
                    }
                }
                entity.setCell(oldCell);
            }
            return possibilities;
        };
        TBSAiManager.prototype.getAoEPossibleMoves.__mvCompatOptimized = true;
        (window.$reactorCompatLog || function () {})(
            "ReactorMVCompat: LeTBS AI AoE memoization installed");

        // closestWalkableCellTo / farthestWalkableCellTo ran TWO full A*
        // pathfinds inside the sort comparator, and each pathfind rebuilds
        // the entire walkability grid — sorting ~60 candidate cells cost
        // ~1200 grid builds + pathfinds (a measured 127-139ms hitch on
        // every AI move decision). The grid is a uniform 4-directional
        // walkability map, so a single BFS flood from the target yields
        // every cell's exact easystar path length in one O(map) pass. The
        // comparator semantics are preserved (path length in steps,
        // 999 for unreachable AND for the target cell itself, which the
        // original maps through `path.length === 0 ? 999 : ...`).
        var installPathSortFix = function (name, pick) {
            var origFn = global.BattleManagerTBS && BattleManagerTBS[name];
            if (typeof origFn !== "function" || origFn.__mvCompatOptimized) return;
            if (String(origFn).indexOf("getPathFromAToB") < 0) return;
            BattleManagerTBS[name] = function (cellTarget, scope) {
                var grid = this.getWalkableGridForEasyStar([cellTarget]);
                var height = grid.length;
                var width = height ? grid[0].length : 0;
                var INF = 999;
                var dist = [];
                for (var y = 0; y < height; y++) {
                    dist.push(new Array(width).fill(INF));
                }
                if (cellTarget.y < height && cellTarget.x < width) {
                    dist[cellTarget.y][cellTarget.x] = 0;
                    var qx = [cellTarget.x];
                    var qy = [cellTarget.y];
                    var head = 0;
                    while (head < qx.length) {
                        var cx = qx[head];
                        var cy = qy[head];
                        head++;
                        var nd = dist[cy][cx] + 1;
                        if (nd >= INF) continue;
                        if (cx + 1 < width && grid[cy][cx + 1] === 0 && dist[cy][cx + 1] > nd) { dist[cy][cx + 1] = nd; qx.push(cx + 1); qy.push(cy); }
                        if (cx - 1 >= 0 && grid[cy][cx - 1] === 0 && dist[cy][cx - 1] > nd) { dist[cy][cx - 1] = nd; qx.push(cx - 1); qy.push(cy); }
                        if (cy + 1 < height && grid[cy + 1][cx] === 0 && dist[cy + 1][cx] > nd) { dist[cy + 1][cx] = nd; qx.push(cx); qy.push(cy + 1); }
                        if (cy - 1 >= 0 && grid[cy - 1][cx] === 0 && dist[cy - 1][cx] > nd) { dist[cy - 1][cx] = nd; qx.push(cx); qy.push(cy - 1); }
                    }
                }
                var distOf = function (cell) {
                    var v = (cell.y < height && cell.x < width) ? dist[cell.y][cell.x] : INF;
                    return (v === INF || v === 0) ? 999 : v;
                };
                var sorted = scope.sort(function (a, b) {
                    var da = distOf(a);
                    var db = distOf(b);
                    return (da > db) ? 1 : ((da < db) ? -1 : 0);
                });
                return pick(sorted);
            };
            BattleManagerTBS[name].__mvCompatOptimized = true;
        };
        installPathSortFix("closestWalkableCellTo", function (s) { return s[0]; });
        installPathSortFix("farthestWalkableCellTo", function (s) { return s.pop(); });

        // LeTBS parks entity animations (state loop_animation sprites and
        // the like) on the shared "animations" layer, but only the OWNING
        // entity sprite ever removes them (Sprite_Base.updateAnimationSprites
        // iterates the host's _animationSprites). When the host sprite is
        // destroyed or replaced mid-battle — a defeated boss part, an
        // entity rebuild — the layer sprite is orphaned: it keeps rendering,
        // freezes on its last drawn frame once its cycle ends, and the
        // replacement entity's fresh loop then plays exactly on top of it
        // (SSR: the Inhibitor Field arc doubling over itself mid-battle).
        // Sweep the layer each battle tick and finish the job the dead host
        // no longer can: destroy finished sprites and sprites whose target
        // has left the scene. Live, still-playing animations are untouched.
        if (global.BattleManagerTBS && BattleManagerTBS.update &&
            !BattleManagerTBS.update.__mvCompatAnimSweep) {
            var origTbsUpdate = BattleManagerTBS.update;
            BattleManagerTBS.update = function () {
                origTbsUpdate.apply(this, arguments);
                try {
                    var layer = this.getLayer && this.getLayer("animations");
                    if (!layer || !layer.children) return;
                    for (var i = layer.children.length - 1; i >= 0; i--) {
                        var child = layer.children[i];
                        if (!child || !child._animation || typeof child.isPlaying !== "function") continue;
                        var finished = !child.isPlaying();
                        var target = child._target;
                        var targetGone = !!(target && target.destroyed);
                        var orphanedLoop = !!(child._isLoopAnim && target &&
                            (!target._animationSprites ||
                             target._animationSprites.indexOf(child) < 0));
                        if (finished || targetGone || orphanedLoop) {
                            layer.removeChild(child);
                            if (child.destroy && !child.destroyed) {
                                child.destroy();
                            }
                        }
                    }
                } catch (e) { /* sweeping is best-effort */ }
            };
            BattleManagerTBS.update.__mvCompatAnimSweep = true;
        }
    }

    function installFinalLightingCompatibility() {
        // MVNovaLighting paints its light sprites into a shared
        // RenderTexture from a custom Container.render() override — PIXI
        // v8's scene graph never calls per-instance render(), so the light
        // map stayed empty: the ambient-darkness filter worked (dark
        // scenes) but no light ever appeared. The display-list update
        // chain DOES reach LightMapContainer (direct child of the
        // spriteset), so drive both the light-sprite updates and the
        // texture paint from an update() method, using v8's
        // render-to-texture API outside the render pass.
        const Nova = global.Anisoft && global.Anisoft.Nova;
        if (!Nova || !Nova.LightMapContainer) return;
        const LMC = Nova.LightMapContainer;
        if (LMC.prototype.update && LMC.prototype.update.__reactorV8Light) return;

        const updateTree = function(node) {
            for (const child of node.children) {
                if (typeof child.update === "function") {
                    child.update();
                } else if (child.children && child.children.length > 0) {
                    updateTree(child);
                }
            }
        };
        LMC.prototype.update = function() {
            const renderContainer = this._lightMapRenderContainer;
            if (!renderContainer || !Nova.LightMapRenderTexture || !global.$gameMap) return;
            updateTree(renderContainer);
            renderContainer.x = -$gameMap.displayX() * $gameMap.tileWidth();
            renderContainer.y = -$gameMap.displayY() * $gameMap.tileHeight();
            renderContainer.renderable = true;
            const renderer = Graphics._app && Graphics._app.renderer;
            if (renderer) {
                if (global.PIXI && PIXI.TextureSource) {
                    // v8 signature
                    renderer.render({
                        container: renderContainer,
                        target: Nova.LightMapRenderTexture,
                        clear: true
                    });
                } else {
                    renderer.render(renderContainer, Nova.LightMapRenderTexture, true, null);
                }
            }
            renderContainer.renderable = false;
        };
        LMC.prototype.update.__reactorV8Light = true;
        (window.$reactorCompatLog || function() {})(
            "ReactorMVCompat: MVNovaLighting v8 light-map renderer installed");
    }

    function installFinalSaveCompatibility() {
        if (global.Window_SavefileList && Window_SavefileList.prototype &&
            !Window_SavefileList.prototype.drawFileId) {
            Window_SavefileList.prototype.drawFileId = function(id, x, y) {
                this.drawText(TextManager.file + " " + id, x, y, 180);
            };
        }

        if (!global.Scene_File || !Scene_File.prototype) return;

        if (!Scene_File.prototype.firstSavefileIndex) {
            Scene_File.prototype.firstSavefileIndex = function() {
                const savefileId = this.firstSavefileId ? this.firstSavefileId() : 1;
                if (this._listWindow && this._listWindow.savefileIdToIndex) {
                    return Math.max(0, this._listWindow.savefileIdToIndex(savefileId));
                }
                return Math.max(0, savefileId - 1);
            };
        }
    }

    function installFinalMessageCompatibility() {
        if (!global.Window_Message || !Window_Message.prototype) return;

        const isMessageAdvancePressed = function() {
            const fastKey = global.Yanfly && Yanfly.Param && Yanfly.Param.MSGFastForwardKey;
            return !!(
                (global.Input && (
                    Input.isPressed("ok") ||
                    Input.isPressed("cancel") ||
                    (fastKey && Input.isPressed(fastKey)) ||
                    (fastKey === "pagedown" && Input.isPhysicalPressed && Input.isPhysicalPressed(34))
                )) ||
                (global.TouchInput && TouchInput.isPressed && TouchInput.isPressed())
            );
        };

        if (Window_Message.prototype.isFastForward && !Window_Message.prototype.isFastForward.__mvCompatWrapped) {
            const originalIsFastForward = Window_Message.prototype.isFastForward;
            Window_Message.prototype.isFastForward = function() {
                const result = originalIsFastForward.apply(this, arguments);
                const key = global.Yanfly && Yanfly.Param && Yanfly.Param.MSGFastForwardKey;
                if (result && key === "pagedown" && Input.isPhysicalPressed) {
                    return Input.isPhysicalPressed(34);
                }
                return result;
            };
            Window_Message.prototype.isFastForward.__mvCompatWrapped = true;
        }

        if (Window_Message.prototype.processEscapeCharacter && !Window_Message.prototype.processEscapeCharacter.__mvCompatHardWaitWrapped) {
            const originalProcessEscapeCharacter = Window_Message.prototype.processEscapeCharacter;
            Window_Message.prototype.processEscapeCharacter = function(code, textState) {
                if (code === "." || code === "|") {
                    const count = code === "." ? 15 : 60;
                    this.__mvCompatHardWait = count;
                    this.__mvCompatWaitInputLock = true;
                    this._waitCount = count;
                    this._showFast = false;
                    this._lineShowFast = false;
                    return;
                }
                return originalProcessEscapeCharacter.call(this, code, textState);
            };
            Window_Message.prototype.processEscapeCharacter.__mvCompatHardWaitWrapped = true;
        }

        if (Window_Message.prototype.updateWait && !Window_Message.prototype.updateWait.__mvCompatHardWaitWrapped) {
            const originalUpdateWait = Window_Message.prototype.updateWait;
            Window_Message.prototype.updateWait = function() {
                if (this.__mvCompatHardWait > 0) {
                    this.__mvCompatHardWait--;
                    this._waitCount = this.__mvCompatHardWait;
                    return true;
                }
                if (this.__mvCompatWaitInputLock) {
                    this._showFast = false;
                    if (isMessageAdvancePressed()) return true;
                    this.__mvCompatWaitInputLock = false;
                }
                return originalUpdateWait.apply(this, arguments);
            };
            Window_Message.prototype.updateWait.__mvCompatHardWaitWrapped = true;
        }

        if (Window_Message.prototype.updateShowFast && !Window_Message.prototype.updateShowFast.__mvCompatHardWaitWrapped) {
            const originalUpdateShowFast = Window_Message.prototype.updateShowFast;
            Window_Message.prototype.updateShowFast = function() {
                if (this.__mvCompatWaitInputLock) {
                    this._showFast = false;
                    if (!isMessageAdvancePressed()) this.__mvCompatWaitInputLock = false;
                    return;
                }
                return originalUpdateShowFast.apply(this, arguments);
            };
            Window_Message.prototype.updateShowFast.__mvCompatHardWaitWrapped = true;
        }

        if (Window_Message.prototype.onEndOfText && !Window_Message.prototype.onEndOfText.__mvCompatFlushWrapped) {
            const originalOnEndOfText = Window_Message.prototype.onEndOfText;
            Window_Message.prototype.onEndOfText = function() {
                // MV-style updateMessage loops call onEndOfText (which nulls
                // _textState) in the same frame that processed the final
                // character — the post-updateMessage flush below never sees
                // it, so every message lost its last character(s). Flush
                // before the textState dies.
                const textState = this._textState;
                if (textState && textState.drawing && textState.buffer &&
                        this.flushTextState &&
                        textState.buffer !== (this.createTextBuffer
                            ? this.createTextBuffer(textState.rtl) : "")) {
                    this.flushTextState(textState);
                }
                return originalOnEndOfText.apply(this, arguments);
            };
            Window_Message.prototype.onEndOfText.__mvCompatFlushWrapped = true;
        }

        if (Window_Message.prototype.updateMessage && !Window_Message.prototype.updateMessage.__mvCompatHardWaitWrapped) {
            const originalUpdateMessage = Window_Message.prototype.updateMessage;
            Window_Message.prototype.updateMessage = function() {
                if (this.__mvCompatHardWait > 0) return true;
                const result = originalUpdateMessage.apply(this, arguments);
                // MV-style updateMessage replacements (YEP_X_MessageSpeedOpt
                // is a wholesale MV port) break on waits (\. \|), on the
                // per-character typing delay, and at end-of-text WITHOUT
                // flushing MZ's buffered characters — MV drew each character
                // immediately, so its loop has no flush anywhere. Buffered
                // text only appeared at the next \n or escape code, and the
                // final segment of every message (the whole message, if it
                // has no control characters) never drew at all. Flush any
                // leftover buffer once per frame; with per-character typing
                // this reproduces MV's letter-by-letter appearance exactly.
                const textState = this._textState;
                if (textState && textState.drawing && textState.buffer &&
                        this.flushTextState &&
                        textState.buffer !== (this.createTextBuffer
                            ? this.createTextBuffer(textState.rtl) : "")) {
                    this.flushTextState(textState);
                }
                return result;
            };
            Window_Message.prototype.updateMessage.__mvCompatHardWaitWrapped = true;
        }

        if (Window_Message.prototype.startWait && !Window_Message.prototype.startWait.__mvCompatHardWaitWrapped) {
            const originalStartWait = Window_Message.prototype.startWait;
            Window_Message.prototype.startWait = function(count) {
                const result = originalStartWait.call(this, count);
                if (this.__mvCompatHardWait > 0) this._waitCount = this.__mvCompatHardWait;
                return result;
            };
            Window_Message.prototype.startWait.__mvCompatHardWaitWrapped = true;
        }
    }

    function installFinalBitmapCompatibility() {
        if (!global.Bitmap || !Bitmap.prototype.drawText || Bitmap.prototype.drawText.__mvCompatSignatureWrapped) return;

        const originalDrawText = Bitmap.prototype.drawText;
        Bitmap.prototype.drawText = function(text, x, y, maxWidth, lineHeight, align) {
            if (typeof lineHeight === "string" && align === undefined) {
                align = lineHeight;
                lineHeight = global.Window_Base && Window_Base.prototype.lineHeight ? Window_Base.prototype.lineHeight.call({}) : 36;
            }
            if (typeof align !== "string") align = "left";
            if (!lineHeight || isNaN(lineHeight)) lineHeight = global.Window_Base && Window_Base.prototype.lineHeight ? Window_Base.prototype.lineHeight.call({}) : 36;
            return originalDrawText.call(this, text, x, y, maxWidth, lineHeight, align);
        };
        Bitmap.prototype.drawText.__mvCompatSignatureWrapped = true;
    }

    function installFinalBattleLogCompatibility() {
        if (!global.Window_BattleLog || !Window_BattleLog.prototype) return;

        Window_BattleLog.prototype.createBackBitmap = Window_BattleLog.prototype.createBackBitmap || function() {
            this._backBitmap = new Bitmap(Math.max(1, this.width || Graphics.boxWidth || 1), Math.max(1, this.height || this.fittingHeight(this.maxLines()) || 1));
        };
        Window_BattleLog.prototype.createBackSprite = Window_BattleLog.prototype.createBackSprite || function() {
            this._backSprite = new Sprite(this._backBitmap);
            this._backSprite.y = this.y || 0;
            if (this.addChildToBack) this.addChildToBack(this._backSprite);
            else this.addChildAt(this._backSprite, 0);
        };
    }

    function installBattleFieldOffsetCompatibility() {
        // MZ positions the battle field 24px higher than MV
        // (battleFieldOffsetY, to balance its bottom status window). MV
        // plugins parent their UI to _battleField (VE_ActiveTimeBattle's
        // ATB bar at configured y=35 rendered at y=11 with its frame top
        // clipped off-screen) and battler/troop coordinates in MV-authored
        // games assume MV's zero offset.
        if (global.Spriteset_Battle && Spriteset_Battle.prototype.battleFieldOffsetY) {
            Spriteset_Battle.prototype.battleFieldOffsetY = function() {
                return 0;
            };
        }
    }

    function installBattleInputGateCompatibility() {
        // MV's Scene_Battle.updateBattleProcess GATES the entire battle
        // update on !isAnyInputWindowActive() — that gate IS how MV-era
        // ATB systems implement "full wait": while the player is choosing
        // a command no BattleManager.update (and no ATB tick wrapped onto
        // it) ever runs. MZ removed the gate and updates every frame,
        // passing a timeActive flag only MZ's own TPB reads — so under
        // Reactor, VE_ActiveTimeBattle's ATB kept flowing during input:
        // enemies acted mid-selection and the state collision soft-locked
        // the battle on attack confirm. MV verbatim (Reactor already
        // carries MV-correct isAnyInputWindowActive/changeInputWindow).
        // Installed before plugins so VE's updateBattleProcess wrapper
        // captures the gated version.
        if (!global.Scene_Battle || !Scene_Battle.prototype.updateBattleProcess ||
            Scene_Battle.prototype.updateBattleProcess.__mvCompatGate) return;
        Scene_Battle.prototype.updateBattleProcess = function() {
            if (!this.isAnyInputWindowActive() || BattleManager.isAborting() ||
                    BattleManager.isBattleEnd()) {
                BattleManager.update(this.isTimeActive ? this.isTimeActive() : true);
                this.changeInputWindow();
            }
        };
        Scene_Battle.prototype.updateBattleProcess.__mvCompatGate = true;
    }

    function installBattleTurnFlowCompatibility() {
        // MZ's processTurn calls this.endAction() when a battler has NO
        // current action (stunned, all actions spent) — a code path MV
        // NEVER ran: MV's no-action branch does the onAllActionsEnd /
        // display* sequence and never touches the battle log's action-end
        // machinery. MV battle plugins (VE_BattleMotions) wrap
        // performActionEnd assuming a startAction always preceded it;
        // MZ's extra endAction hands them a null current action →
        // "Cannot read properties of null (reading 'action')" every time
        // any battler skips a turn. Restore MV's branch verbatim
        // (refreshStatus is our gap-fill; the action branch is identical
        // in MV and MZ). Installed before plugins load so their
        // processTurn wrappers stack on top.
        if (!global.BattleManager || !BattleManager.processTurn ||
            BattleManager.processTurn.__mvCompatWrapped) return;
        BattleManager.processTurn = function() {
            const subject = this._subject;
            const action = subject.currentAction();
            if (action) {
                action.prepare();
                if (action.isValid()) {
                    this.startAction();
                }
                subject.removeCurrentAction();
            } else {
                subject.onAllActionsEnd();
                this.refreshStatus();
                this._logWindow.displayAutoAffectedStatus(subject);
                this._logWindow.displayCurrentState(subject);
                this._logWindow.displayRegeneration(subject);
                this._subject = this.getNextSubject();
            }
        };
        BattleManager.processTurn.__mvCompatWrapped = true;

        // MV's endAction leaves _subject SET until processTurn's no-action
        // branch advances it via getNextSubject; MZ nulls _subject as soon
        // as the battler's actions run out. ATB systems key off that: VE's
        // canUpdateAtb gates new actor inputs on `!this._subject && ...`.
        // Under MZ semantics the subject vanished while the killing blow's
        // collapse was still animating — BattleManager.isBusy() skips the
        // update body that runs checkBattleEnd, but VE's appended updateAtb
        // is NOT busy-gated — so the next ready actor's input window opened
        // over an all-dead troop, and the input gate then blocked the
        // battle-end check until the player attacked the empty field.
        // MV verbatim: victory beats the next input every time.
        BattleManager.endAction = function() {
            this._logWindow.endAction(this._subject);
            this._phase = "turn";
        };
    }

    function installBattlebackCompatibility() {
        if (!global.Spriteset_Battle || !Spriteset_Battle.prototype) return;

        // MV puts battleback name/bitmap resolution on Spriteset_Battle;
        // MZ (and Reactor) put it on Sprite_Battleback. MV battleback
        // plugins (YEP_ImprovedBattlebacks, VE_*) replace Sprite_Battleback
        // with MV's dumb TilingSprite and call this.battleback1Bitmap() on
        // the Spriteset — which the MZ model never had there. Restore MV's
        // full Spriteset_Battle battleback chain (verbatim from the MV
        // corescript) as GAP-FILLED defaults: each is only defined if
        // absent, so Reactor's own path (which never calls these) and any
        // plugin that provides its own version both win. The shim loads
        // before plugins, so a plugin aliasing battleback1Bitmap captures
        // these as its "original".
        var P = Spriteset_Battle.prototype;
        var def = function(name, fn) { if (!P[name]) P[name] = fn; };

        def("battleback1Bitmap", function() {
            return ImageManager.loadBattleback1(this.battleback1Name());
        });
        def("battleback2Bitmap", function() {
            return ImageManager.loadBattleback2(this.battleback2Name());
        });
        def("battleback1Name", function() {
            if (BattleManager.isBattleTest()) return $dataSystem.battleback1Name;
            if ($gameMap.battleback1Name()) return $gameMap.battleback1Name();
            if ($gameMap.isOverworld()) return this.overworldBattleback1Name();
            return "";
        });
        def("battleback2Name", function() {
            if (BattleManager.isBattleTest()) return $dataSystem.battleback2Name;
            if ($gameMap.battleback2Name()) return $gameMap.battleback2Name();
            if ($gameMap.isOverworld()) return this.overworldBattleback2Name();
            return "";
        });
        def("overworldBattleback1Name", function() {
            if ($gameMap.battleback1Name() === "") return "";
            return $gamePlayer.isInVehicle() ? this.shipBattleback1Name() : this.normalBattleback1Name();
        });
        def("overworldBattleback2Name", function() {
            if ($gameMap.battleback2Name() === "") return "";
            return $gamePlayer.isInVehicle() ? this.shipBattleback2Name() : this.normalBattleback2Name();
        });
        def("normalBattleback1Name", function() {
            return this.terrainBattleback1Name(this.autotileType(1)) ||
                this.terrainBattleback1Name(this.autotileType(0)) ||
                this.defaultBattleback1Name();
        });
        def("normalBattleback2Name", function() {
            return this.terrainBattleback2Name(this.autotileType(1)) ||
                this.terrainBattleback2Name(this.autotileType(0)) ||
                this.defaultBattleback2Name();
        });
        def("terrainBattleback1Name", function(type) {
            switch (type) {
                case 24: case 25: return "Wasteland";
                case 26: case 27: return "DirtField";
                case 32: case 33: return "Desert";
                case 34: return "Lava1";
                case 35: return "Lava2";
                case 40: case 41: return "Snowfield";
                case 42: return "Clouds";
                case 4: case 5: return "PoisonSwamp";
                default: return null;
            }
        });
        def("terrainBattleback2Name", function(type) {
            switch (type) {
                case 20: case 21: return "Forest";
                case 22: case 30: case 38: return "Cliff";
                case 24: case 25: case 26: case 27: return "Wasteland";
                case 32: case 33: return "Desert";
                case 34: case 35: return "Lava";
                case 40: case 41: return "Snowfield";
                case 42: return "Clouds";
                case 4: case 5: return "PoisonSwamp";
                default: return null;
            }
        });
        def("defaultBattleback1Name", function() { return "Grassland"; });
        def("defaultBattleback2Name", function() { return "Grassland"; });
        def("shipBattleback1Name", function() { return "Ship"; });
        def("shipBattleback2Name", function() { return "Ship"; });
        def("autotileType", function(z) {
            return $gameMap.autotileType($gamePlayer.x, $gamePlayer.y, z);
        });
    }

    function installBattleFieldOrderCompatibility() {
        if (!global.Spriteset_Battle || !Spriteset_Battle.prototype) return;
        var proto = Spriteset_Battle.prototype;
        if (!proto.createBattleback || !proto.createBattleField) return;
        if (proto.createBattleback.__mvFieldOrderWrapped) return;

        // MV's Spriteset_Battle.createLowerLayer creates the battle FIELD
        // before the battlebacks; MZ creates battlebacks first. MV
        // battleback plugins (YEP_ImprovedBattlebacks and friends) read
        // this._battleField inside createBattleback and crash on the MZ
        // order, leaving the spriteset half-constructed — which then
        // cascades into every other battle plugin. Restore MV's order by
        // ensuring the field exists at the TOP of createLowerLayer and
        // making createBattleField idempotent so the MZ call site later
        // in the sequence becomes a no-op. Anchor choice matters:
        // createBattleback is wholesale REPLACED by battleback plugins and
        // createBackground is skipped entirely by Irina_PerformanceUpgrade
        // under WebGL — createLowerLayer is only ever aliased
        // (call-through), so a wrapper installed before plugins load stays
        // in the chain.
        var origField = proto.createBattleField;
        proto.createBattleField = function() {
            if (this._battleField) return;
            // createBattleField attaches to _baseSprite; when the early
            // ensure runs before Spriteset_Base built it, defer the
            // attachment until the base exists (the normal call later in
            // createLowerLayer will land here again via the ensure).
            if (!this._baseSprite) return;
            origField.apply(this, arguments);
        };
        var origBaseSprite = global.Spriteset_Base && Spriteset_Base.prototype.createBaseSprite;
        if (origBaseSprite) {
            Spriteset_Base.prototype.createBaseSprite = function() {
                origBaseSprite.apply(this, arguments);
                // MV order: the battle field exists before battlebacks.
                if (global.Spriteset_Battle && this instanceof Spriteset_Battle) {
                    this.createBattleField();
                }
            };
        }
        proto.createBattleback.__mvFieldOrderWrapped = true;
    }

    function installBattleStatusSlotCompatibility() {
        if (!global.Window_BattleStatus || !Window_BattleStatus.prototype) return;
        var proto = Window_BattleStatus.prototype;
        if (!proto.drawItem || proto.drawItem.__mvSlotGuarded) return;
        // MV ATB/party-slot plugins (VE_ActiveTimeBattle + MOG_BattleHud
        // fixed-slot layouts) draw a fixed number of member slots; slots
        // past the appeared battle members resolve actor(index) to
        // undefined, which crashes MZ-model drawItemImage (actor.faceName
        // of undefined) and aborts the whole battle scene. Empty slots
        // should simply draw nothing. Installed before plugins load, so
        // plugin drawItem wrappers keep this guard innermost.
        var origDrawItem = proto.drawItem;
        proto.drawItem = function(index) {
            if (typeof this.actor === "function" && !this.actor(index)) return;
            return origDrawItem.apply(this, arguments);
        };
        proto.drawItem.__mvSlotGuarded = true;
    }

    function installWindowInternalsCompatibility() {
        if (!global.Window || !Window.prototype) return;
        // MV plugins reach into Window's internal sprites by their MV
        // names (this._windowBackSprite.alpha = …); MZ renamed them all.
        // Alias the MV names to the MZ fields with get/set properties so
        // reads AND replacements both land on the real sprite. Guarded per
        // name so a plugin (e.g. FOSSIL) that defines its own wins.
        var map = {
            _windowBackSprite: "_backSprite",
            _windowFrameSprite: "_frameSprite",
            _windowContentsSprite: "_contentsSprite",
            _windowCursorSprite: "_cursorSprite",
            _windowPauseSignSprite: "_pauseSignSprite",
            _windowSpriteContainer: "_container"
        };
        Object.keys(map).forEach(function(mvName) {
            if (Object.prototype.hasOwnProperty.call(Window.prototype, mvName)) return;
            var mzName = map[mvName];
            Object.defineProperty(Window.prototype, mvName, {
                get: function() { return this[mzName]; },
                set: function(value) { this[mzName] = value; },
                configurable: true
            });
        });
    }

    // TIER 1 — MV plugin API support. Gap-fills, aliases, MV-argument
    // adapters, and format-detecting wrappers. Inert unless MV plugin code
    // (or MV-format data) exercises them, so they install for every game:
    // this is what lets MZ projects adopt MV plugins.
    ensureArrayClone();
    installTypeScriptHelpers();
    installUtilsCompatibility();
    installJsonExCompatibility();
    installInputCompatibility();
    installGraphicsCompatibility();
    installDecrypterCompatibility();
    installDataManagerCompatibility();
    installStorageManagerCompatibility();
    installPixiCompatibility();
    installPluginCommandBridge();
    installInterpreterCompatibility();
    installWindowCompatibility();
    installSceneCompatibility();
    installBoxSizeCompatibility();
    installStaleEventGuard();
    installSpriteBaseCompatibility();
    installButtonCompatibility();
    installAnimationCompatibility();
    installAnimationSpriteCompatibility();
    installMVApiGapFills();
    installTextStateCompatibility();
    installAudioCacheCompatibility();
    installMessageSubWindowsCompatibility();
    installImageCompatibility();
    installTilemapCompatibility();
    installAudioFontCompatibility();
    installPluginManagerCompatibility();
    installBattlebackCompatibility();
    installBattleFieldOrderCompatibility();
    installBattleStatusSlotCompatibility();
    installWindowInternalsCompatibility();

    // MV never subscribed to unhandledrejection; MV-era plugin code is full
    // of uncaught play()/decode() promises that were harmless there (e.g. a
    // video parallax whose source fails to load). MZ's core treats them as
    // fatal — printError + stop() froze the whole game on a rejected
    // video.play(). Log and keep running, like MV did.
    function installPromiseRejectionCompatibility() {
        if (!global.SceneManager) return;
        SceneManager.onReject = function(event) {
            console.warn(
                "Unhandled promise rejection (ignored per MV behavior):",
                event.reason);
        };
    }

    // TIER 2 — MV game semantics. Global overrides that make the whole
    // game measure and behave like MV; mutually exclusive with MZ-authored
    // UI, so only games authored in RPG Maker MV get them.
    if (mvGameSemantics) {
        installStatusBaseFallthroughCompatibility();
        installMenuSceneCompatibility();
        installWindowMetricsCompatibility();
        installSceneLayoutCompatibility();
        installMapDataReloadCompatibility();
        installDamagePopupCompatibility();
        installBattleTurnFlowCompatibility();
        installBattleFieldOffsetCompatibility();
        installBattleInputGateCompatibility();
        installPromiseRejectionCompatibility();
    }

    (window.$reactorCompatLog || function() {})(mvGameSemantics
        ? "reactor_mv_compat: MV game detected -- full MV compatibility active (plugin APIs + MV game semantics)"
        : "reactor_mv_compat: MV plugin API support installed; MV game semantics dormant (MZ-format game)");

    global.ReactorMVCompat = {
        version: "0.2.0",
        active: mvGameSemantics,
        pluginApiSupport: true
    };
})();
