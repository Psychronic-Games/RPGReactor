//=============================================================================
// reactor_mv_compat.js
//=============================================================================
// Star Shift Rebellion local MV compatibility layer.
// Load after Reactor core scripts and before project plugins.

(function() {
    "use strict";

    const global = typeof window !== "undefined" ? window : globalThis;

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
        if (owner && typeof owner.windowWidth === "function") {
            try { defaultWidth = owner.windowWidth(); } catch (e) {}
        }
        if (owner && typeof owner.windowHeight === "function") {
            try { defaultHeight = owner.windowHeight(); } catch (e) {}
        }
        const width = Number(args[2] != null ? args[2] : defaultWidth);
        const height = Number(args[3] != null ? args[3] : defaultHeight);
        return new Rectangle(x, y, width, height);
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
        const cleanMetadata = function(value) {
            if (!value || typeof value !== "object") return;
            delete value["@"];
            delete value["@c"];
            delete value["@a"];
            delete value["@r"];
            for (const key of Object.keys(value)) cleanMetadata(value[key]);
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

        const styleFpsCounter = function() {
            const counter = Graphics._fpsCounter && Graphics._fpsCounter._boxDiv;
            if (!counter) return;
            counter.style.position = "fixed";
            counter.style.left = "4px";
            counter.style.top = "4px";
            counter.style.zIndex = "2147483647";
            counter.style.pointerEvents = "none";
            counter.style.background = "rgba(0, 0, 0, 0.65)";
            counter.style.color = "white";
            counter.style.fontFamily = "monospace";
            counter.style.fontSize = "12px";
            counter.style.lineHeight = "1.2";
            counter.style.padding = "4px 6px";
            counter.style.borderRadius = "3px";
        };

        if (Graphics._createFPSCounter && !Graphics._createFPSCounter.__mvCompatWrapped) {
            const originalCreateFPSCounter = Graphics._createFPSCounter;
            Graphics._createFPSCounter = function() {
                const result = originalCreateFPSCounter.apply(this, arguments);
                styleFpsCounter();
                return result;
            };
            Graphics._createFPSCounter.__mvCompatWrapped = true;
        }
        if (Graphics._switchFPSCounter && !Graphics._switchFPSCounter.__mvCompatWrapped) {
            const originalSwitchFPSCounter = Graphics._switchFPSCounter;
            Graphics._switchFPSCounter = function() {
                const result = originalSwitchFPSCounter.apply(this, arguments);
                styleFpsCounter();
                return result;
            };
            Graphics._switchFPSCounter.__mvCompatWrapped = true;
        }
        Graphics.showFps = Graphics.showFps || function() {
            if (this._fpsCounter && this._fpsCounter._boxDiv) {
                this._fpsCounter._boxDiv.style.display = "block";
                this._fpsCounter._showFps = true;
                this._fpsCounter._update();
                styleFpsCounter();
            }
        };
        Graphics.hideFps = Graphics.hideFps || function() {
            if (this._fpsCounter && this._fpsCounter._boxDiv) this._fpsCounter._boxDiv.style.display = "none";
        };
        styleFpsCounter();
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
                    if (fs.existsSync(rpgPath) || !fs.existsSync(rmmzPath)) {
                        return rpgPath;
                    }
                } catch (e) {}
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

        if (global.Window_Selectable) {
            Window_Selectable.prototype.spacing = function() { return 48; };
            Window_Selectable.prototype.itemRectForText = function(index) {
                return this.itemRectWithPadding ? this.itemRectWithPadding(index) : this.itemRect(index);
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
            Window_Command.prototype.windowWidth = Window_Command.prototype.windowWidth || function() { return 240; };
            Window_Command.prototype.windowHeight = Window_Command.prototype.windowHeight || function() {
                return this.fittingHeight(this.numVisibleRows());
            };
            Window_Command.prototype.numVisibleRows = Window_Command.prototype.numVisibleRows || function() {
                return Math.ceil(this.maxItems() / Math.max(1, this.maxCols()));
            };
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
            Window_HorzCommand.prototype.numVisibleRows = Window_HorzCommand.prototype.numVisibleRows || function() {
                return 1;
            };
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
            Window_Message.prototype.numVisibleRows = Window_Message.prototype.numVisibleRows || function() { return 4; };
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
            if (obj && !obj[name]) obj[name] = fn;
        };

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

        // ---- Window_BattleStatus MV area layout ----
        if (global.Window_BattleStatus) {
            var WBS = Window_BattleStatus.prototype;
            def(WBS, "gaugeAreaWidth", function() { return 330; });
            def(WBS, "basicAreaRect", function(index) {
                var rect = this.itemRectWithPadding ? this.itemRectWithPadding(index) : this.itemRect(index);
                rect.width -= this.gaugeAreaWidth() + 15;
                return rect;
            });
            def(WBS, "gaugeAreaRect", function(index) {
                var rect = this.itemRectWithPadding ? this.itemRectWithPadding(index) : this.itemRect(index);
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
        if (global.Window_ShopNumber) {
            def(Window_ShopNumber.prototype, "itemY", function() {
                return Math.round(this.contentsHeight() / 2 - this.lineHeight() * 1.5);
            });
            def(Window_ShopNumber.prototype, "priceY", function() {
                return Math.round(this.contentsHeight() / 2 + this.lineHeight() / 2);
            });
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

        // ---- Sprite_Damage MV digit metrics (harmless 0 when the MV
        // damage sheet isn't in use) ----
        if (global.Sprite_Damage) {
            def(Sprite_Damage.prototype, "digitWidth", function() {
                return this._damageBitmap ? this._damageBitmap.width / 10 : 0;
            });
            def(Sprite_Damage.prototype, "digitHeight", function() {
                return this._damageBitmap ? this._damageBitmap.height / 5 : 0;
            });
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
                        console.warn("ReactorMVCompat: skipped invalid Pixi renderer system", name, ClassRef);
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
        installGraphicsCompatibility();
        installJsonExCompatibility();
        installDataManagerCompatibility();
        installStorageManagerCompatibility();
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

        if (Window_Message.prototype.updateMessage && !Window_Message.prototype.updateMessage.__mvCompatHardWaitWrapped) {
            const originalUpdateMessage = Window_Message.prototype.updateMessage;
            Window_Message.prototype.updateMessage = function() {
                if (this.__mvCompatHardWait > 0) return true;
                return originalUpdateMessage.apply(this, arguments);
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
    installSpriteBaseCompatibility();
    installButtonCompatibility();
    installAnimationCompatibility();
    installAnimationSpriteCompatibility();
    installMVApiGapFills();
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

    global.ReactorMVCompat = {
        version: "0.1.0",
        active: true
    };
})();
