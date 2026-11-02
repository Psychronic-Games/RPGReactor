//=============================================================================
// reactor_character_creator.js — Character Creation
//
// Off unless Database › Character Creation turns it on (data/ReactorCharacters.json).
// Works in single-player and online games alike: choosing
// from the project's actors, or building a character with the Forge's own
// modules. What can be changed comes from the Forge, so an update there reaches
// the game with its next build; none of it is listed here.
//
// A built character is a package (RRCH): the Builder's GLB, its motions and rig,
// and the recipe, so it can be edited again. A single-player game keeps it on
// the player's machine; an online game also gives it to the server, which hands
// it to everyone who meets that player. docs/DESIGN-ONLINE.md
//=============================================================================

/**
 * A project's optional settings live in files of their own, so a game that doesn't
 * use them has none and the core data stays exactly as RPG Maker wrote it.
 */
const ReactorProjectData = {
    FILES: { $dataReactorCharacters: "data/ReactorCharacters.json", $dataReactorOnline: "data/ReactorOnline.json" },
    _left: -1,

    load() {
        if (this._left >= 0) return;
        const names = Object.keys(this.FILES);
        this._left = names.length;
        const finish = (name, value) => { window[name] = value && typeof value === "object" && !Array.isArray(value) ? value : null; this._left--; };
        for (const name of names) {
            const url = this.FILES[name];
            if (Utils.isNwjs()) {
                try {
                    const fs = require("fs"), file = require("path").join(require("path").dirname(process.mainModule.filename), url);
                    finish(name, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
                } catch (error) { console.warn("Could not read " + url, error); finish(name, null); }
                continue;
            }
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            xhr.overrideMimeType("application/json");
            xhr.onload = () => { let value = null; if (xhr.status < 400) { try { value = JSON.parse(xhr.responseText); } catch (error) { value = null; } } finish(name, value); };
            xhr.onerror = () => finish(name, null);
            xhr.send();
        }
    },

    isLoaded() {
        this.load();
        return this._left === 0;
    }
};

const _reactorDataLoaded = DataManager.isDatabaseLoaded;
DataManager.isDatabaseLoaded = function() {
    return ReactorProjectData.isLoaded() && _reactorDataLoaded.call(this);
};

const ReactorCharacters = {
    WORKER: "reactor-builder/src/forge/Character3D/CharacterGameWorker.js",
    MAGIC: 0x48435252, // "RRCH"
    VERSION: 1,

    pending: false,
    models: new Map(),
    _modelLoading: null,

    config() {
        const config = window.$dataReactorCharacters;
        return config && (config.mode === "choose" || config.mode === "build") ? config : null;
    },

    /** The characters to choose from, or the actor a built character plays as. */
    choices() {
        const chosen = this.config()?.actors;
        const ids = Array.isArray(chosen) && chosen.length ? chosen : $dataSystem.partyMembers;
        return ids.filter(id => $dataActors[id]).map(id => $dataActors[id]);
    },

    /** A built character plays as an actor: its stats, skills and class are the project's. */
    baseActorId() {
        return this.choices()[0]?.id || $dataSystem.partyMembers[0] || 1;
    },

    /** This save's character: { actorId, id, name }, or nothing. */
    current() {
        return typeof $gameSystem !== "undefined" && $gameSystem ? $gameSystem._reactorCharacter || null : null;
    },

    setCurrent(character) {
        $gameSystem._reactorCharacter = character;
    },

    /** The opening of a new game: a game with creation on asks who the player is first. */
    onNewGame() {
        const config = this.config();
        this.pending = !!(config && config.onNewGame !== false && (config.mode === "build" || this.choices().length));
    },

    open() {
        const config = this.config();
        if (!config) return false;
        SceneManager.push(config.mode === "build" ? Scene_CharacterCreator : Scene_CharacterChoice);
        return true;
    },

    /** The party the player chose leads, or is alone, as the game is set up. */
    applyActor(actorId, name) {
        const actor = $gameActors.actor(actorId);
        if (name && actor) actor.setName(name);
        const online = typeof ReactorOnline !== "undefined" && ReactorOnline.config();
        if (online && online.party !== "party") {
            $gameParty._actors = [actorId];
        } else {
            $gameParty._actors = [actorId].concat($gameParty._actors.filter(id => id !== actorId));
        }
        if ($gamePlayer) $gamePlayer.refresh();
    },

    /** What this player chose last, so a new game starts from it. */
    profileKey() {
        return "reactorCharacter.profile." + ($dataSystem.advanced?.gameId || $dataSystem.gameTitle || "game");
    },

    profile() {
        try { return JSON.parse(localStorage.getItem(this.profileKey())) || {}; } catch (error) { return {}; }
    },

    saveProfile(profile) {
        try { localStorage.setItem(this.profileKey(), JSON.stringify(profile)); } catch (error) { /* it is only a convenience */ }
    },

    // ---- Packages ----

    pack(made) {
        const json = new TextEncoder().encode(JSON.stringify({ recipe: made.recipe, sidecar: made.sidecar, height: made.height }));
        const rig = made.rig ? new Uint8Array(made.rig) : new Uint8Array(0), glb = new Uint8Array(made.glb);
        const out = new Uint8Array(16 + json.length + rig.length + glb.length), view = new DataView(out.buffer);
        view.setUint32(0, this.MAGIC, true);
        view.setUint32(4, this.VERSION, true);
        view.setUint32(8, json.length, true);
        view.setUint32(12, rig.length, true);
        out.set(json, 16);
        out.set(rig, 16 + json.length);
        out.set(glb, 16 + json.length + rig.length);
        return out.buffer;
    },

    unpack(buffer) {
        const view = new DataView(buffer);
        if (buffer.byteLength < 16 || view.getUint32(0, true) !== this.MAGIC) throw new Error("Not a character.");
        const jsonLength = view.getUint32(8, true), rigLength = view.getUint32(12, true);
        const info = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 16, jsonLength)));
        const rigStart = 16 + jsonLength, glbStart = rigStart + rigLength;
        return { ...info, rig: rigLength ? buffer.slice(rigStart, glbStart) : null, glb: buffer.slice(glbStart) };
    },

    // ---- Keeping them ----

    folder() {
        const path = require("path");
        return path.join(path.dirname(process.mainModule.filename), "save", "characters");
    },

    async store(id, buffer) {
        if (Utils.isNwjs()) {
            const fs = require("fs"), path = require("path"), folder = this.folder();
            fs.mkdirSync(folder, { recursive: true });
            fs.writeFileSync(path.join(folder, id + ".rrch"), Buffer.from(buffer));
        } else {
            await localforage.setItem("reactorCharacter." + id, buffer);
        }
    },

    async fetch(id) {
        if (Utils.isNwjs()) {
            const fs = require("fs"), path = require("path"), file = path.join(this.folder(), id + ".rrch");
            if (fs.existsSync(file)) { const data = fs.readFileSync(file); return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); }
        } else {
            const kept = await localforage.getItem("reactorCharacter." + id).catch(() => null);
            if (kept) return kept;
        }
        return typeof ReactorOnline !== "undefined" && ReactorOnline.config() ? ReactorOnline.downloadCharacter(id) : null;
    },

    // ---- In the 3D world ----

    /** Installed and still held: changing maps lets go of models the new map doesn't use, and those must be installed again. */
    isInstalled(id) {
        const spec = this.models.get(id), R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        return !!spec && !!R?._glbCache?.[R.modelCacheKey(spec.name, spec.ext, spec.file)];
    },

    /** Hands a package to the 3D runtime as if it were a model on disk. Returns its model spec. */
    async install(id, buffer) {
        if (this.isInstalled(id)) return this.models.get(id);
        const R = Reactor3D;
        await R.ensureLoaded();
        const unpacked = this.unpack(buffer), file = "Character-" + id.slice(0, 16), name = "Characters/" + file;
        const key = R.modelCacheKey(name, ".glb", file);
        const entry = { promise: null, template: null, failed: false };
        entry.promise = this.template(unpacked.glb).then(template => (entry.template = template));
        R._glbCache[key] = entry;
        R._sidecarCache = R._sidecarCache || {};
        R._sidecarJson = R._sidecarJson || {};
        const sidecar = unpacked.sidecar || {};
        if (sidecar.rig && unpacked.rig) sidecar.rig.weightsBin = R.decodeRigWeightsBinary(unpacked.rig);
        R._sidecarJson[name] = sidecar;
        R._sidecarCache[name] = R.whenMotionLibrary(sidecar).then(() => sidecar);
        await entry.promise;
        const size = R.databaseModelSpecOfProject ? R.databaseModelSpecOfProject(this.baseActorId())?.size : 0;
        const spec = R.normalizeModelSpec({ name, file, ext: ".glb", size: size || 3, scale: 1, yaw: 0, pitch: 0, roll: 0, faces: {}, texture: "" });
        this.models.set(id, spec);
        return spec;
    },

    async template(glb) {
        const parsed = await Reactor3D.parseGlbAsync(glb.slice(0));
        if (parsed && parsed.json) return Reactor3D.buildGlbTemplate(parsed.json, parsed.bin, "", parsed.bitmaps);
        return Reactor3D.readModel(glb, ".glb", "", "");
    },

    /** This save's model, loaded before its map is shown. */
    prepareCurrent() {
        const character = this.current();
        if (!character || !character.id || this.isInstalled(character.id) || this._modelLoading === character.id) return;
        this._modelLoading = character.id;
        this.fetch(character.id).then(buffer => {
            if (buffer) return this.install(character.id, buffer);
            console.warn("Character " + character.id + " is not on this device; showing the actor's own model.");
            return null;
        }).catch(error => console.error("Character could not be loaded.", error)).finally(() => { this._modelLoading = null; });
    },

    isCurrentReady() {
        return !this._modelLoading;
    }
};

// ---- Choosing from the project's actors ----

function Window_CharacterChoice() {
    this.initialize(...arguments);
}

Window_CharacterChoice.prototype = Object.create(Window_Selectable.prototype);
Window_CharacterChoice.prototype.constructor = Window_CharacterChoice;

Window_CharacterChoice.prototype.initialize = function(rect) {
    Window_Selectable.prototype.initialize.call(this, rect);
    this._actors = ReactorCharacters.choices();
    this.refresh();
};

Window_CharacterChoice.prototype.maxItems = function() {
    return this._actors ? this._actors.length : 0;
};

Window_CharacterChoice.prototype.itemHeight = function() {
    return Math.min(ImageManager.faceHeight, 144) + 16;
};

Window_CharacterChoice.prototype.actor = function() {
    return this._actors[this.index()];
};

Window_CharacterChoice.prototype.selectActor = function(actorId) {
    this.select(Math.max(0, this._actors.findIndex(actor => actor.id === actorId)));
};

Window_CharacterChoice.prototype.drawItem = function(index) {
    const actor = this._actors[index], rect = this.itemRect(index), size = rect.height - 8;
    if (actor.faceName) this.drawFace(actor.faceName, actor.faceIndex, rect.x + 4, rect.y + 4, size, size);
    const x = rect.x + size + 20, width = rect.width - size - 28, className = $dataClasses[actor.classId]?.name || "";
    this.resetTextColor();
    this.drawText(actor.name, x, rect.y + 6, width);
    this.changeTextColor(ColorManager.systemColor());
    this.drawText(className, x, rect.y + 6 + this.lineHeight(), width);
    this.resetTextColor();
    if (actor.profile) this.drawTextEx(actor.profile.split("\n")[0], x, rect.y + 6 + this.lineHeight() * 2, width);
};

function Scene_CharacterChoice() {
    this.initialize(...arguments);
}

Scene_CharacterChoice.prototype = Object.create(Scene_MenuBase.prototype);
Scene_CharacterChoice.prototype.constructor = Scene_CharacterChoice;

Scene_CharacterChoice.prototype.create = function() {
    Scene_MenuBase.prototype.create.call(this);
    for (const actor of ReactorCharacters.choices()) if (actor.faceName) ImageManager.loadFace(actor.faceName);
    this._helpWindow = new Window_Help(new Rectangle(0, this.helpAreaTop(), Graphics.boxWidth, this.helpAreaHeight()));
    this._helpWindow.setText(ReactorCharacters.config().prompt || "Choose your character");
    this.addWindow(this._helpWindow);
    this._listWindow = new Window_CharacterChoice(new Rectangle(0, this.mainAreaTop(), Graphics.boxWidth, this.mainAreaHeight()));
    this._listWindow.setHandler("ok", this.onChosen.bind(this));
    this._listWindow.setHandler("cancel", this.onBack.bind(this));
    this._listWindow.selectActor(ReactorCharacters.profile().actorId);
    this._listWindow.activate();
    this.addWindow(this._listWindow);
};

Scene_CharacterChoice.prototype.needsCancelButton = function() {
    return false;
};

Scene_CharacterChoice.prototype.start = function() {
    Scene_MenuBase.prototype.start.call(this);
    // Back from typing a name: leaving a scene makes a fresh one, so the choice is kept outside it.
    const naming = ReactorCharacters.namingActor;
    if (naming) {
        ReactorCharacters.namingActor = 0;
        ReactorCharacters.saveProfile({ actorId: naming, name: $gameActors.actor(naming).name() });
        ReactorCharacters.finish();
        return;
    }
    this._listWindow.refresh();
};

Scene_CharacterChoice.prototype.onChosen = function() {
    const config = ReactorCharacters.config(), id = this._listWindow.actor().id, actor = $gameActors.actor(id);
    ReactorCharacters.applyActor(id, null);
    ReactorCharacters.setCurrent({ actorId: id });
    const profile = ReactorCharacters.profile();
    if (config.askName === false) {
        ReactorCharacters.saveProfile({ actorId: id, name: actor.name() });
        ReactorCharacters.finish();
        return;
    }
    if (profile.name) actor.setName(profile.name);
    ReactorCharacters.namingActor = id;
    SceneManager.push(Scene_Name);
    SceneManager.prepareNextScene(id, Number(config.nameLength) || 16);
};

Scene_CharacterChoice.prototype.onBack = function() {
    ReactorCharacters.leave();
};

/** Done: into the game when this began a new game, else back where the event called it from. */
ReactorCharacters.finish = function() {
    if (typeof ReactorOnline !== "undefined") ReactorOnline.announceCharacter();
    if (this.starting) {
        this.starting = false;
        SceneManager._scene.fadeOutAll();
        SceneManager.goto(Scene_Map);
    } else {
        SceneManager.pop();
    }
};

ReactorCharacters.leave = function() {
    if (this.starting) {
        this.starting = false;
        if (typeof ReactorOnline !== "undefined") ReactorOnline.gameStarted = false;
        SceneManager.goto(Scene_Title);
    } else {
        SceneManager.pop();
    }
};

// ---- Building a character ----

/** The worker that holds the Forge's modules, kept for the session once it has loaded. */
ReactorCharacters.worker = function() {
    if (!this._worker) {
        this._worker = new Worker(this.WORKER);
        this._calls = new Map();
        this._callId = 0;
        this._worker.onmessage = event => {
            const call = this._calls.get(event.data.id);
            this._calls.delete(event.data.id);
            if (call) { if (event.data.error) call.reject(new Error(event.data.error)); else call.resolve(event.data.value); }
        };
        this._worker.onerror = event => {
            for (const call of this._calls.values()) call.reject(new Error(event.message || "The character builder could not start."));
            this._calls.clear();
            this._worker = null;
        };
    }
    return this._worker;
};

ReactorCharacters.ask = function(message) {
    const worker = this.worker(), id = ++this._callId;
    return new Promise((resolve, reject) => {
        this._calls.set(id, { resolve, reject });
        worker.postMessage(Object.assign({ id }, message));
    });
};

function Scene_CharacterCreator() {
    this.initialize(...arguments);
}

Scene_CharacterCreator.prototype = Object.create(Scene_Base.prototype);
Scene_CharacterCreator.prototype.constructor = Scene_CharacterCreator;

Scene_CharacterCreator.prototype.create = function() {
    Scene_Base.prototype.create.call(this);
    this._panel = new ReactorCharacterPanel();
};

Scene_CharacterCreator.prototype.start = function() {
    Scene_Base.prototype.start.call(this);
    this._panel.open();
};

Scene_CharacterCreator.prototype.stop = function() {
    Scene_Base.prototype.stop.call(this);
    this._panel.close();
};

/**
 * The creator's page: controls beside a turning character. It is ordinary HTML over
 * the game, which gives players real sliders, text and color pickers, and it has its
 * own small 3D view because the game's renderer is busy being the game.
 */
class ReactorCharacterPanel {
    constructor() {
        this.config = ReactorCharacters.config();
        this.rules = this.config.rules || {};
        this.recipe = { hair: {}, eyes: {} };
        this.request = {};
        this.building = 0;
    }

    async open() {
        this.buildPage();
        this.status("Loading the character builder…");
        const character = ReactorCharacters.current(), profile = ReactorCharacters.profile();
        this.nameInput.value = character?.name || profile.name || "";
        try {
            if (character?.id) {
                const buffer = await ReactorCharacters.fetch(character.id);
                if (buffer) this.recipe = ReactorCharacters.unpack(buffer).recipe;
            }
            this.tabs = await ReactorCharacters.ask({ type: "tabs", rules: this.rules });
            await Reactor3D.ensureLoaded();
            this.startView();
            this.showTabs();
            this.rebuild();
        } catch (error) {
            this.status("The character builder could not start: " + error.message, true);
        }
    }

    element(tag, style, text) {
        const node = document.createElement(tag);
        if (style) node.style.cssText = style;
        if (text != null) node.textContent = text;
        return node;
    }

    buildPage() {
        const root = this.root = this.element("div", "position:fixed;inset:0;z-index:900;display:flex;background:#0b0c14;color:#e8e9f2;font:14px/1.35 system-ui,sans-serif");
        root.id = "reactorCharacterCreator";
        const side = this.element("div", "flex:0 0 min(420px,44vw);display:flex;flex-direction:column;background:#141626;border-right:1px solid #2a2e4a;min-height:0");
        side.appendChild(this.element("div", "padding:14px 16px 8px;font-size:18px;font-weight:600", this.config.prompt || "Create your character"));
        this.tabBar = this.element("div", "display:flex;flex-wrap:wrap;gap:4px;padding:0 12px 8px");
        this.body = this.element("div", "flex:1;overflow-y:auto;padding:4px 16px 16px;min-height:0");
        side.append(this.tabBar, this.body);
        const footer = this.element("div", "padding:12px 16px;border-top:1px solid #2a2e4a;display:flex;flex-direction:column;gap:8px");
        this.nameInput = this.element("input", "padding:8px;background:#0b0c14;color:inherit;border:1px solid #39406a;border-radius:4px;font:inherit");
        this.nameInput.placeholder = "Your name";
        this.nameInput.maxLength = Number(this.config.nameLength) || 16;
        this.nameInput.autocomplete = "off";
        if (this.config.askName === false) this.nameInput.style.display = "none";
        const row = this.element("div", "display:flex;gap:8px");
        this.cancelButton = this.button("Back", () => this.back());
        this.doneButton = this.button("Done", () => this.finish(), true);
        row.append(this.cancelButton, this.doneButton);
        footer.append(this.nameInput, row);
        side.appendChild(footer);
        const stage = this.stage = this.element("div", "flex:1;position:relative;min-width:0;cursor:grab;touch-action:none");
        this.canvas = this.element("canvas", "width:100%;height:100%;display:block");
        this.message = this.element("div", "position:absolute;left:0;right:0;bottom:16px;text-align:center;color:#aab0d6;pointer-events:none");
        stage.append(this.canvas, this.message);
        root.append(side, stage);
        document.body.appendChild(root);
        for (const type of ["keydown", "keyup", "wheel", "pointerdown"]) root.addEventListener(type, event => event.stopPropagation());
    }

    button(label, action, main) {
        const node = this.element("button", "flex:1;padding:9px;border-radius:4px;font:inherit;font-weight:600;cursor:pointer;color:#fff;border:1px solid #4a52a0;background:" + (main ? "#3a3fa8" : "transparent"), label);
        node.type = "button";
        node.addEventListener("click", action);
        return node;
    }

    showTabs() {
        this.tabBar.textContent = "";
        this.tabs.forEach((tab, index) => {
            const node = this.element("button", "padding:6px 10px;border:1px solid #39406a;border-radius:4px;color:inherit;font:inherit;cursor:pointer;background:transparent", tab.label);
            node.type = "button";
            node.addEventListener("click", () => this.showTab(index));
            tab.node = node;
            this.tabBar.appendChild(node);
        });
        this.showTab(0);
    }

    valueAt(path) {
        return path.split(".").reduce((value, key) => (value == null ? value : value[key]), this.recipe);
    }

    setValue(path, value) {
        const keys = path.split("."), last = keys.pop();
        let at = this.recipe;
        for (const key of keys) at = at[key] || (at[key] = {});
        at[last] = value;
        this.edits = (this.edits || 0) + 1;
    }

    showTab(index) {
        this.tabs.forEach((tab, i) => { tab.node.style.background = i === index ? "#3a3fa8" : "transparent"; });
        this.body.textContent = "";
        let group = null;
        for (const control of this.tabs[index].controls) {
            if (control.group && control.group !== group) {
                group = control.group;
                this.body.appendChild(this.element("div", "margin:14px 0 4px;color:#8f96c8;font-size:12px;text-transform:uppercase;letter-spacing:.04em", group));
            }
            this.body.appendChild(this.control(control));
        }
    }

    control(control) {
        const row = this.element("label", "display:block;margin:10px 0"), title = this.element("div", "margin-bottom:3px", control.label);
        row.appendChild(title);
        if (control.kind === "slider") {
            const input = this.element("input", "width:100%");
            Object.assign(input, { type: "range", min: control.min, max: control.max, step: control.step });
            const value = this.valueAt(control.path);
            input.value = typeof value === "number" ? value : (control.min + control.max) / 2;
            if (control.path.startsWith("shapes.") && typeof value !== "number") input.value = 0;
            input.addEventListener("input", () => { this.setValue(control.path, Number(input.value)); this.rebuildSoon(); });
            row.appendChild(input);
        } else if (control.kind === "select") {
            const input = this.element("select", "width:100%;padding:6px;background:#0b0c14;color:inherit;border:1px solid #39406a;border-radius:4px;font:inherit");
            const groups = new Map();
            for (const option of control.options) {
                let parent = groups.get(option.group);
                if (!parent) { parent = this.element("optgroup"); parent.label = option.group || ""; groups.set(option.group, parent); input.appendChild(parent); }
                const node = this.element("option", null, option.label);
                node.value = option.id;
                parent.appendChild(node);
            }
            const value = control.path === "outfitPreset" ? this.request.preset : this.valueAt(control.path);
            if (value != null) input.value = value;
            input.addEventListener("change", () => {
                if (control.path === "outfitPreset") this.request.preset = input.value;
                else if (control.path === "species") this.request.species = input.value;
                else this.setValue(control.path, input.value);
                this.rebuild();
            });
            row.appendChild(input);
        } else {
            const input = this.element("input", "width:100%;height:32px;padding:0;background:none;border:1px solid #39406a;border-radius:4px");
            input.type = "color";
            const value = this.valueAt(control.path);
            if (/^#[0-9a-f]{6}$/i.test(value || "")) input.value = value;
            input.addEventListener("input", () => { this.setValue(control.path, input.value); this.rebuildSoon(); });
            row.appendChild(input);
        }
        return row;
    }

    rebuildSoon() {
        clearTimeout(this._soon);
        this._soon = setTimeout(() => this.rebuild(), 120);
    }

    /** One build at a time: the latest settings win, and those in between are skipped. */
    async rebuild() {
        if (this.busy) { this.again = true; return; }
        this.busy = true;
        this.status("Building…");
        try {
            const edits = this.edits || 0, request = this.request;
            this.request = {};
            const made = await ReactorCharacters.ask(Object.assign({ type: "build", recipe: this.recipe, rules: this.rules }, request));
            // The worker's recipe is the whole of it, a new species' defaults among them; a change
            // made while it was building is newer, and the rebuild that follows carries it.
            if ((this.edits || 0) === edits) this.recipe = made.recipe;
            else if (request.species || request.preset) { const kept = this.recipe; this.recipe = Object.assign(made.recipe, kept, { species: made.recipe.species, outfit: made.recipe.outfit }); }
            await this.show(made);
            if (this.closed) return;
            this.status("");
        } catch (error) {
            if (!this.closed) this.status("That could not be built: " + error.message, true);
        } finally {
            this.busy = false;
            if (this.again && !this.closed) { this.again = false; this.rebuild(); }
        }
    }

    startView() {
        const canvas = this.canvas, renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = this.scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.6));
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(1.5, 3, 3);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x99aaff, 1.1);
        rim.position.set(-2, 2, -2.5);
        scene.add(rim);
        this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
        this.turn = 0;
        let dragging = null;
        this.stage.addEventListener("pointerdown", event => { dragging = event.clientX; this.stage.setPointerCapture(event.pointerId); });
        this.stage.addEventListener("pointermove", event => { if (dragging !== null) { this.turn += (event.clientX - dragging) * 0.01; dragging = event.clientX; } });
        this.stage.addEventListener("pointerup", () => { dragging = null; });
        const clock = new THREE.Timer ? new THREE.Timer() : null;
        const frame = () => {
            if (this.closed) return;
            this._frame = requestAnimationFrame(frame);
            const size = this.stage.getBoundingClientRect();
            if (size.width !== this._width || size.height !== this._height) {
                this._width = size.width; this._height = size.height;
                renderer.setSize(size.width, size.height, false);
                this.camera.aspect = size.width / Math.max(1, size.height);
                this.camera.updateProjectionMatrix();
            }
            clock?.update?.();
            if (this.mixer) this.mixer.update(clock?.getDelta?.() || 1 / 60);
            if (this.model) this.model.rotation.y = this.turn;
            renderer.render(scene, this.camera);
        };
        frame();
    }

    /** The newest build in the view; the last goes only once this one is ready to replace it. */
    async show(made) {
        const template = await ReactorCharacters.template(made.glb);
        if (this.closed) return;
        const model = Reactor3D.cloneModelTemplate(template);
        const box = new THREE.Box3().setFromObject(model), height = Math.max(0.5, box.max.y - box.min.y);
        model.position.y = -box.min.y;
        if (this.model) { this.scene.remove(this.model); this.dispose(this.model); }
        this.model = model;
        this.scene.add(model);
        this.camera.position.set(0, height * 0.55, height * 2.9);
        this.camera.lookAt(0, height * 0.5, 0);
        const clips = model.__reactorClips || template.__reactorClips || [], idle = clips.find?.(clip => clip.name === "Idle");
        this.mixer = idle ? new THREE.AnimationMixer(model) : null;
        if (idle) this.mixer.clipAction(idle).play();
    }

    dispose(object) {
        object.traverse(child => { if (child.geometry) child.geometry.dispose(); });
    }

    status(text, bad) {
        this.message.textContent = text;
        this.message.style.color = bad ? "#ff9a9a" : "#aab0d6";
    }

    back() {
        ReactorCharacters.leave();
    }

    async finish() {
        if (this.finishing) return;
        const name = this.nameInput.value.trim();
        if (this.config.askName !== false && !name) { this.status("Enter a name first.", true); this.nameInput.focus(); return; }
        this.finishing = true;
        this.doneButton.disabled = this.cancelButton.disabled = true;
        try {
            this.status("Finishing your character…");
            const times = ReactorCharacters.lastTimes = { started: performance.now() };
            const made = await ReactorCharacters.ask(Object.assign({ type: "build", recipe: this.recipe, rules: this.rules, final: true, quality: this.config.quality }, this.request));
            times.built = performance.now();
            const buffer = ReactorCharacters.pack(made), actorId = ReactorCharacters.baseActorId();
            ReactorCharacters.applyActor(actorId, name);
            let id = ReactorCharacters.localId();
            if (typeof ReactorOnline !== "undefined" && ReactorOnline.config()) {
                id = await ReactorOnline.uploadCharacter(buffer, percent => this.status("Sending your character… " + percent + "%"));
            }
            times.uploaded = performance.now();
            await ReactorCharacters.store(id, buffer);
            await ReactorCharacters.install(id, buffer);
            times.installed = performance.now();
            times.bytes = buffer.byteLength;
            ReactorCharacters.setCurrent({ actorId, id, name });
            ReactorCharacters.saveProfile({ actorId, name });
            ReactorCharacters.finish();
        } catch (error) {
            this.finishing = false;
            this.doneButton.disabled = this.cancelButton.disabled = false;
            this.status("Your character could not be saved: " + error.message, true);
        }
    }

    close() {
        this.closed = true;
        clearTimeout(this._soon);
        cancelAnimationFrame(this._frame);
        if (this.model) this.dispose(this.model);
        if (this.renderer) this.renderer.dispose();
        this.root?.remove();
    }
}

ReactorCharacters.localId = function() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
};

// ---- The game ----

const _reactorCharactersGoto = SceneManager.goto;
SceneManager.goto = function(sceneClass) {
    if (sceneClass === Scene_Map && ReactorCharacters.pending) {
        ReactorCharacters.pending = false;
        ReactorCharacters.starting = true;
        sceneClass = ReactorCharacters.config().mode === "build" ? Scene_CharacterCreator : Scene_CharacterChoice;
    }
    _reactorCharactersGoto.call(this, sceneClass);
};

/** Runs `begin` with a new game's setup marked as the player's own, not the one made at boot. */
ReactorCharacters.markNewGame = function(begin) {
    const original = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        original.call(this);
        ReactorCharacters.onNewGame();
        if (typeof ReactorOnline !== "undefined") ReactorOnline.onGameStarted(true);
    };
    try { begin(); } finally { DataManager.setupNewGame = original; }
};

const _reactorCharactersNewGame = Scene_Title.prototype.commandNewGame;
Scene_Title.prototype.commandNewGame = function() {
    ReactorCharacters.markNewGame(() => _reactorCharactersNewGame.call(this));
};

if (typeof Scene_ReactorUI === "function") {
    const runAction = Scene_ReactorUI.prototype.runAction;
    Scene_ReactorUI.prototype.runAction = function(action) {
        if (action && action.type === "titleNewGame") ReactorCharacters.markNewGame(() => runAction.call(this, action));
        else runAction.call(this, action);
    };
}

const _reactorCharactersMapCreate = Scene_Map.prototype.create;
Scene_Map.prototype.create = function() {
    ReactorCharacters.prepareCurrent();
    _reactorCharactersMapCreate.call(this);
};

const _reactorCharactersMapReady = Scene_Map.prototype.isReady;
Scene_Map.prototype.isReady = function() {
    return ReactorCharacters.isCurrentReady() && _reactorCharactersMapReady.call(this);
};

if (typeof Reactor3D !== "undefined") {
    // A built character is that actor's model, on the map, in menus and in battle alike.
    const actorSpec = Reactor3D.databaseModelSpec;
    Reactor3D.databaseModelSpec = function(section, id) {
        if (section === "actors" && !ReactorCharacters._bypass) {
            const character = ReactorCharacters.current();
            if (character && character.actorId === id && ReactorCharacters.models.has(character.id)) return ReactorCharacters.models.get(character.id);
        }
        return actorSpec.call(this, section, id);
    };
    Reactor3D.databaseModelSpecOfProject = function(id) {
        ReactorCharacters._bypass = true;
        try { return this.databaseModelSpec("actors", id); } finally { ReactorCharacters._bypass = false; }
    };
}

if (typeof PluginManager !== "undefined") {
    PluginManager.registerCommand("RPGReactor", "CharacterCreation", function() {
        ReactorCharacters.open();
    });
}
