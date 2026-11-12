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
    PORTRAIT_PIXELS: 288,
    PORTRAIT_SHARE: 0.2,
    PORTRAIT_EYES: 0.42,
    PORTRAIT_ABOVE_HEAD: 0.13,
    MAGIC: 0x48435252, // "RRCH"
    VERSION: 1,

    pending: false,
    models: new Map(),
    modelIds: new Map(),
    faces: new Map(),
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
        // The builder's 25 MB of body, clothes and motions start downloading now, while sign-in and the opening fade go on.
        if (this.pending && config.mode === "build" && typeof Worker === "function") this.ask({ type: "warm" }).catch(() => null);
    },

    /**
     * The event command. `once` skips it for a player who already has their character
     * (an intro replayed, an account that has one); `required` takes away the way back,
     * for an intro that can't go on without one; `switchId` says how it ended.
     */
    open(options = {}) {
        const config = this.config();
        if (!config) return false;
        this.call = { required: !!options.required, switchId: Number(options.switchId) || 0 };
        if (options.once && this.current()) {
            this.settle(true);
            return true;
        }
        SceneManager.push(config.mode === "build" ? Scene_CharacterCreator : Scene_CharacterChoice);
        return true;
    },

    /** Whether the player must finish: an intro that asked for that. */
    isRequired() {
        return !this.starting && !!this.call?.required;
    },

    /** An event's call is over: its switch says whether the player has their character. */
    settle(done) {
        if (this.call?.switchId) $gameSwitches.setValue(this.call.switchId, done);
        this.call = null;
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
        const json = new TextEncoder().encode(JSON.stringify({ recipe: made.recipe, sidecar: made.sidecar, height: made.height, face: made.face || "" }));
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
    async install(id, buffer, own) {
        if (this.isInstalled(id)) return this.models.get(id);
        const R = Reactor3D;
        await R.ensureLoaded();
        const unpacked = this.unpack(buffer), file = "Character-" + id.slice(0, 16), name = "Characters/" + file;
        const key = R.modelCacheKey(name, ".glb", file);
        const entry = { promise: null, template: null, failed: false };
        // Another player's character keeps smaller pictures (Reactor3D.remoteTextureCap); this player's own, the full ones.
        const mine = own || id === this.current()?.id;
        entry.promise = this.template(unpacked.glb, mine ? 0 : (R.remoteTextureCap ? R.remoteTextureCap() : 0)).then(template => (entry.template = template));
        R._glbCache[key] = entry;
        R._sidecarCache = R._sidecarCache || {};
        R._sidecarJson = R._sidecarJson || {};
        const sidecar = unpacked.sidecar || {};
        if (sidecar.rig && unpacked.rig) sidecar.rig.weightsBin = R.decodeRigWeightsBinary(unpacked.rig);
        R._sidecarJson[name] = sidecar;
        R._sidecarCache[name] = R.whenMotionLibrary(sidecar).then(() => sidecar);
        await entry.promise;
        this.modelIds.set(name, id);
        // A portrait is a picture carried in the package itself. An address would be fetched by every game that meets
        // this character, telling whoever made it where each of them is. Only this player's own is decoded and kept:
        // nothing shows another player's portrait, and each one met stayed in memory for the session.
        if (mine && typeof unpacked.face === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(unpacked.face) && unpacked.face.length <= 4194304) {
            try { await this.keepFace(id, unpacked.face); } catch (error) { console.warn("A character's portrait could not be read.", error); }
        }
        const size = R.databaseModelSpecOfProject ? R.databaseModelSpecOfProject(this.baseActorId())?.size : 0;
        const spec = R.normalizeModelSpec({ name, file, ext: ".glb", size: size || 3, scale: 1, yaw: 0, pitch: 0, roll: 0, faces: {}, texture: "" });
        this.models.set(id, spec);
        return spec;
    },

    /** The name a built character's portrait goes by, where an actor's face file name would. */
    faceName(id) {
        return "Character-" + id.slice(0, 16);
    },

    /** Its portrait, ready for the game's windows, and worn at once by the actor it belongs to. */
    async keepFace(id, url) {
        const name = this.faceName(id);
        if (!this.faces.has(name)) {
            const picture = new Image();
            picture.src = url;
            await picture.decode();
            const bitmap = new Bitmap(ImageManager.faceWidth, ImageManager.faceHeight);
            bitmap.context.drawImage(picture, 0, 0, bitmap.width, bitmap.height);
            bitmap.baseTexture?.update?.();
            this.faces.set(name, bitmap);
        }
        const character = this.current();
        if (character?.id === id) this.wearFace(character);
    },

    /** The character being made, as a face its actor wears until the finished one replaces it (`wearFace`). */
    async wearPreviewFace(actor, url) {
        const picture = new Image();
        picture.src = url;
        await picture.decode();
        const name = "Character-preview", bitmap = this.faces.get(name) || new Bitmap(ImageManager.faceWidth, ImageManager.faceHeight);
        bitmap.clear();
        bitmap.context.drawImage(picture, 0, 0, bitmap.width, bitmap.height);
        bitmap.baseTexture?.update?.();
        this.faces.set(name, bitmap);
        if (actor) actor.setFaceImage(name, 0);
    },

    wearFace(character) {
        const actor = $gameActors?.actor(character.actorId), name = this.faceName(character.id);
        if (actor && this.faces.has(name)) actor.setFaceImage(name, 0);
    },

    /**
     * A built model has no file for the runtime to read again, so once a map change lets go
     * of it the only way back is its package. Anyone asking for it gets it, or nothing.
     */
    reinstall(id) {
        const going = this._reinstalling || (this._reinstalling = new Map());
        if (!going.has(id)) going.set(id, this.fetch(id).then(buffer => (buffer ? this.install(id, buffer) : null))
            .catch(error => { console.warn("A character could not be loaded.", error); return null; }).finally(() => going.delete(id)));
        return going.get(id);
    },

    /**
     * The character's model, ready to clone. In the world its parts that draw alike are merged first
     * (Reactor3D.LayeredParts: a few draws, not 17 to 39); the creator's own view (`preview`) shows each
     * build at once and leaves them apart.
     */
    async template(glb, textureCap, preview) {
        // Its pictures decoded in the parse worker at this character's size, off the main thread (merged at once below).
        const machine = Reactor3D.textureCap ? Reactor3D.textureCap() : 2048, cap = textureCap > 0 ? Math.min(machine, textureCap) : machine;
        const parsed = await Reactor3D.parseGlbAsync(glb.slice(0), preview ? undefined : { decode: cap });
        const template = parsed && parsed.json
            ? Reactor3D.buildGlbTemplate(parsed.json, parsed.bin, "", parsed.bitmaps, textureCap > 0 ? { textureCap } : undefined)
            : Reactor3D.readModel(glb, ".glb", "", "");
        if (!preview && Reactor3D.LayeredParts) {
            // The build and the merge in frames of their own (a crowd arrives one character after another).
            try { await Reactor3D.LayeredParts.nextFrame(); await Reactor3D.LayeredParts.apply(template); } catch (error) { console.warn("Reactor3D: a character's parts stay apart:", error && error.message || error); }
        }
        return template;
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
    if (ReactorCharacters.isRequired()) {
        SoundManager.playBuzzer();
        this._listWindow.activate();
        return;
    }
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
        this.settle(true);
        SceneManager.pop();
    }
};

ReactorCharacters.leave = function() {
    if (this.starting) {
        this.starting = false;
        if (typeof ReactorOnline !== "undefined") ReactorOnline.gameStarted = false;
        SceneManager.goto(Scene_Title);
    } else {
        this.settle(false);
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
            for (const call of this._calls.values()) call.reject(new Error(event.message || "The character builder's files did not load."));
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

/**
 * What is being built, and the small 3D view of it. It outlives its scene, because
 * typing a name is a scene of its own and leaving a scene makes a fresh one. The view
 * has its own canvas, laid over the game's inside a window's frame, because the game's
 * renderer is busy being the game.
 */
class ReactorCharacterStudio {
    constructor() {
        this.config = ReactorCharacters.config();
        this.rules = this.config.rules || {};
        this.recipe = { hair: {}, eyes: {} };
        this.request = {};
        this.chosen = {};
        this.tabs = [];
        this.name = "";
        this.message = "";
        this.bad = false;
    }

    /** Loads the Forge once; the scene hears of it through onReady and onStatus. */
    async open() {
        if (this.opened) return;
        this.opened = true;
        this.status("Loading the character builder…");
        const character = ReactorCharacters.current(), profile = ReactorCharacters.profile();
        const account = typeof ReactorOnline !== "undefined" ? ReactorOnline.account?.name : "";
        this.name = character?.name || profile.name || account || "";
        try {
            // The builder's files, three.js and a saved character all download at once; the tabs also start the body data.
            const three = Reactor3D.ensureLoaded(), tabs = ReactorCharacters.ask({ type: "tabs", rules: this.rules });
            const saved = character?.id ? ReactorCharacters.fetch(character.id) : null;
            three.catch(() => null);
            tabs.catch(() => null);
            if (saved) {
                const buffer = await saved;
                if (buffer) this.recipe = ReactorCharacters.unpack(buffer).recipe;
            }
            this.tabs = await tabs;
            this.dressFirst();
            await three;
            if (this.closed) return;
            this.startView();
            this.onReady?.();
            this.rebuild();
        } catch (error) {
            this.status("The character builder could not start: " + error.message, true);
        }
    }

    /** A new character starts in everyday clothes, whatever the project lets a player take off later. */
    dressFirst() {
        if (this.recipe.outfit?.length) return;
        const control = this.tabs.flatMap(tab => tab.controls).find(entry => entry.path === "outfitPreset");
        const first = control?.options.find(option => option.group === "Everyday") || control?.options[0];
        if (first) this.chosen.outfitPreset = this.request.preset = first.id;
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

    /** A slider's value, or where it rests until the Forge has given one. */
    sliderValue(control) {
        const value = this.valueAt(control.path);
        if (typeof value === "number") return value;
        return control.path.startsWith("shapes.") ? 0 : (control.min + control.max) / 2;
    }

    /** What a list control holds now. An outfit is a set of garments, so its name is only known from the choice. */
    optionValue(control) {
        return control.path === "outfitPreset" ? this.chosen.outfitPreset : this.valueAt(control.path);
    }

    /** A list's highlighted choice, worn for a look before it is chosen. The first try remembers how things were. */
    tryOn(control, id) {
        if (!this._tried) this._tried = { recipe: JSON.parse(JSON.stringify(this.recipe)), chosen: Object.assign({}, this.chosen) };
        this.chosen[control.path] = id;
        if (control.path === "outfitPreset") { this.request.preset = id; delete this.request.species; }
        else if (control.path === "species") { this.request.species = id; delete this.request.preset; }
        else this.setValue(control.path, id);
        clearTimeout(this._soon);
        this._lookDue = true;
        this._soon = setTimeout(() => this.rebuild(), 220);
    }

    /** The list closed: kept, or back as it was before the first try. */
    endTry(keep) {
        const tried = this._tried;
        this._tried = null;
        if (!tried || keep) return;
        clearTimeout(this._soon);
        this.recipe = tried.recipe;
        this.chosen = tried.chosen;
        this.request = {};
        this.generation = (this.generation || 0) + 1;
        this.rebuild();
    }

    choose(control, id) {
        if (this._tried) { this._tried = null; clearTimeout(this._soon); }
        this.chosen[control.path] = id;
        if (control.path === "outfitPreset") this.request.preset = id;
        else if (control.path === "species") this.request.species = id;
        else this.setValue(control.path, id);
        this.rebuild();
    }

    rebuildSoon() {
        clearTimeout(this._soon);
        this._lookDue = true;
        this._soon = setTimeout(() => this.rebuild(), 120);
    }

    /** One build at a time: the latest settings win, and those in between are skipped. */
    async rebuild() {
        if (this.closed) return;
        if (this.busy) { this.again = true; return; }
        this.busy = true;
        this.status("Building…");
        let request = null;
        try {
            const edits = this.edits || 0, generation = this.generation || 0, triedAtStart = this._tried;
            request = this.request;
            this.request = {};
            this._lookDue = false;
            const made = await ReactorCharacters.ask(Object.assign({ type: "build", recipe: this.recipe, rules: this.rules }, request));
            // An outfit or species chosen before a list's try-on began, landing during it: it is part of "how things
            // were" for that try. Left out, cancelling the list put the outfit from before the choice back on, while
            // its row still named the one chosen.
            const tried = this._tried;
            if (tried && !triedAtStart && (this.generation || 0) === generation) {
                if (request.species) tried.recipe = JSON.parse(JSON.stringify(made.recipe));
                else if (request.preset) tried.recipe.outfit = JSON.parse(JSON.stringify(made.recipe.outfit || []));
            }
            // A try-on put back while this was building: its recipe is no longer wanted, and the rebuild after it shows the old one.
            if ((this.generation || 0) !== generation) { this.again = true; return; }
            // The worker's recipe is the whole of it, a new species' defaults among them; a change
            // made while it was building is newer, and the rebuild that follows carries it.
            if ((this.edits || 0) === edits) this.recipe = made.recipe;
            else if (request.species || request.preset) { const kept = this.recipe; this.recipe = Object.assign(made.recipe, kept, { species: made.recipe.species, outfit: made.recipe.outfit }); }
            await this.show(made);
            if (this.closed) return;
            this.status("");
            this.onRecipe?.();
        } catch (error) {
            // What was asked for is still wanted: kept for the next build unless something newer was asked since.
            if (request) this.request = Object.assign({}, request, this.request);
            if (!this.closed) this.status("That could not be built: " + error.message, true);
        } finally {
            this.busy = false;
            if (this.again && !this.closed) { this.again = false; this.rebuild(); }
        }
    }

    /** The look on screen brought up to what was last asked for, before the character is finished from it. */
    async settle() {
        clearTimeout(this._soon);
        const idle = async () => { while (this.busy && !this.closed) await new Promise(done => setTimeout(done, 30)); };
        for (let tries = 0; tries < 3 && !this.closed; tries++) {
            await idle();
            if (!this._lookDue && !Object.keys(this.request).length) break;
            await this.rebuild();
        }
        await idle();
    }

    startView() {
        const canvas = this.canvas = document.createElement("canvas");
        canvas.id = "reactorCharacterView";
        canvas.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;z-index:2;cursor:grab;touch-action:none";
        document.body.appendChild(canvas);
        const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
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
        canvas.addEventListener("pointerdown", event => { dragging = event.clientX; this.turned = true; canvas.setPointerCapture(event.pointerId); });
        canvas.addEventListener("pointermove", event => { if (dragging !== null) { this.turn += (event.clientX - dragging) * 0.01; dragging = event.clientX; } });
        canvas.addEventListener("pointerup", () => { dragging = null; });
        let last = performance.now();
        const frame = now => {
            if (this.closed) return;
            this._frame = requestAnimationFrame(frame);
            const seconds = Math.min(0.1, Math.max(0, (now - last) / 1000)), size = canvas.getBoundingClientRect();
            last = now;
            if (size.width !== this._width || size.height !== this._height) {
                this._width = size.width; this._height = size.height;
                renderer.setSize(size.width, size.height, false);
                this.camera.aspect = size.width / Math.max(1, size.height);
                this.camera.updateProjectionMatrix();
            }
            // It turns by itself for a player on keys or a gamepad, until someone takes hold of it.
            if (!this.turned) this.turn += seconds * 0.35;
            if (this.mixer) this.mixer.update(seconds);
            if (this.model) this.model.rotation.y = this.turn;
            renderer.render(scene, this.camera);
        };
        frame(last);
    }

    /** Lays the view over a place in the game's own coordinates, however the game is scaled in its window. */
    place(x, y, width, height) {
        if (!this.canvas || !Graphics._canvas) return;
        const box = Graphics._canvas.getBoundingClientRect(), scale = box.width / Math.max(1, Graphics.width), style = this.canvas.style;
        style.left = box.left + x * scale + "px";
        style.top = box.top + y * scale + "px";
        style.width = width * scale + "px";
        style.height = height * scale + "px";
    }

    setShown(shown) {
        if (this.canvas) this.canvas.style.display = shown ? "" : "none";
    }

    /** The newest build in the view; the last goes only once this one is ready to replace it. */
    async show(made) {
        const template = await ReactorCharacters.template(made.glb, 0, true);
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

    /**
     * The character's portrait, framed as the Forge frames a face sheet: the eyes on one line, 42% of the
     * way down a square that spans a little more than the head. Drawn from the view's own scene, so it
     * has the same lights, then the view goes back as it was.
     */
    portrait() {
        const { model, renderer, scene } = this;
        if (!model || !renderer) return "";
        const size = ReactorCharacters.PORTRAIT_PIXELS, turn = model.rotation.y, camera = new THREE.PerspectiveCamera(18, 1, 0.05, 40);
        model.rotation.y = 0;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model), top = box.max.y, height = top - box.min.y;
        const eye = new THREE.Vector3(), head = model.getObjectByName("Head") || model.getObjectByName("head");
        if (head) head.getWorldPosition(eye); else eye.y = top - height * 0.08;
        const span = height * ReactorCharacters.PORTRAIT_SHARE, eyes = head ? eye.y + span * ReactorCharacters.PORTRAIT_ABOVE_HEAD : eye.y;
        const center = eyes + span * (0.5 - ReactorCharacters.PORTRAIT_EYES), distance = span / 2 / Math.tan(camera.fov * Math.PI / 360);
        const front = head ? eye.z : 0;
        camera.position.set(head ? eye.x : 0, center, front + distance);
        camera.lookAt(head ? eye.x : 0, center, front);
        const canvas = renderer.domElement, width = canvas.width, tall = canvas.height;
        renderer.setPixelRatio(1);
        renderer.setSize(size, size, false);
        renderer.render(scene, camera);
        const url = canvas.toDataURL("image/png");
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(this._width || width, this._height || tall, false);
        model.rotation.y = turn;
        return url;
    }

    dispose(object) {
        // Its materials and their pictures on the graphics card too: each look tried on is a template of its own, and
        // they waited for the garbage collector while the game's own renderer was loaded beside this one.
        object.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            for (const material of [].concat(child.material || [])) {
                for (const value of Object.values(material)) if (value && value.isTexture) value.dispose();
                material.dispose();
            }
        });
    }

    status(text, bad) {
        this.message = text;
        this.bad = !!bad;
        this.onStatus?.();
    }

    /** The finished character: built whole, kept, sent to the server when there is one, and worn. */
    async finish() {
        // Not from a look still on its way: pressed before an outfit just picked had landed, Done kept the outfit and
        // the portrait from before it (the pick had already left with that look's request).
        await this.settle();
        this.status("Finishing your character…");
        const times = ReactorCharacters.lastTimes = { started: performance.now() };
        const made = await ReactorCharacters.ask(Object.assign({ type: "build", recipe: this.recipe, rules: this.rules, final: true, quality: this.config.quality }, this.request));
        times.built = performance.now();
        made.face = this.portrait();
        const buffer = ReactorCharacters.pack(made), actorId = ReactorCharacters.baseActorId(), name = this.name;
        ReactorCharacters.applyActor(actorId, name);
        let id = ReactorCharacters.localId();
        if (typeof ReactorOnline !== "undefined" && ReactorOnline.config()) {
            id = await ReactorOnline.uploadCharacter(buffer, percent => this.status("Sending your character… " + percent + "%"));
        }
        times.uploaded = performance.now();
        await ReactorCharacters.store(id, buffer);
        await ReactorCharacters.install(id, buffer, true);
        times.installed = performance.now();
        times.bytes = buffer.byteLength;
        ReactorCharacters.setCurrent({ actorId, id, name });
        ReactorCharacters.wearFace(ReactorCharacters.current());
        ReactorCharacters.saveProfile({ actorId, name });
    }

    close() {
        this.closed = true;
        clearTimeout(this._soon);
        cancelAnimationFrame(this._frame);
        if (this.model) this.dispose(this.model);
        // (The view's own graphics context is given back now, not when the collector reaches its canvas.)
        if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss?.(); }
        this.canvas?.remove();
    }
}

// The creator's windows are the game's own, so they wear the project's window skin and
// font, answer keys, gamepads, mouse and touch, and take on what a window plugin changes.

/** Body, Face, Hair and the rest, then Name and Done. */
function Window_CreatorTabs() {
    this.initialize(...arguments);
}

Window_CreatorTabs.prototype = Object.create(Window_Command.prototype);
Window_CreatorTabs.prototype.constructor = Window_CreatorTabs;

Window_CreatorTabs.prototype.initialize = function(rect, studio, columns) {
    this._studio = studio;
    this._columns = columns;
    Window_Command.prototype.initialize.call(this, rect);
};

Window_CreatorTabs.prototype.maxCols = function() {
    return this._columns;
};

Window_CreatorTabs.prototype.makeCommandList = function() {
    for (const tab of this._studio.tabs) this.addCommand(tab.label, "tab", true, tab);
    if (this._studio.config.askName !== false) this.addCommand("Name", "name", this._studio.tabs.length > 0);
    this.addCommand("Done", "done", this._studio.tabs.length > 0);
};

Window_CreatorTabs.prototype.tab = function() {
    return this.currentSymbol() === "tab" ? this.currentExt() : null;
};

Window_CreatorTabs.prototype.select = function(index) {
    const changed = index !== this.index();
    Window_Command.prototype.select.call(this, index);
    if (this._controls) this._controls.setTab(this.tab());
    if (changed) SceneManager._scene?.onTabChanged?.();
};

Window_CreatorTabs.prototype.setControls = function(controls) {
    this._controls = controls;
    controls.setTab(this.tab());
};

/** Down from the last row of tabs moves into the list, as the cursor would expect. */
Window_CreatorTabs.prototype.cursorDown = function(wrap) {
    const lastRow = this.row() >= this.maxRows() - 1;
    if (!lastRow) Window_Command.prototype.cursorDown.call(this, wrap);
    else if (this.tab() && this._controls?.maxItems()) this.processOk();
};

/** One row for each thing a tab lets a player change, with the Forge's own group headings. */
function Window_CreatorControls() {
    this.initialize(...arguments);
}

Window_CreatorControls.prototype = Object.create(Window_Selectable.prototype);
Window_CreatorControls.prototype.constructor = Window_CreatorControls;

Window_CreatorControls.GAUGE_HEIGHT = 12;

Window_CreatorControls.prototype.initialize = function(rect, studio) {
    this._studio = studio;
    this._rows = [];
    this._dragRow = -1;
    Window_Selectable.prototype.initialize.call(this, rect);
};

Window_CreatorControls.prototype.setTab = function(tab) {
    if (this._tab === tab) return;
    this._tab = tab;
    this._rows = [];
    let group = null;
    for (const control of tab?.controls || []) {
        if (control.group && control.group !== group) {
            group = control.group;
            this._rows.push({ kind: "group", label: group });
        }
        this._rows.push(control);
    }
    this.refresh();
    this.scrollTo(0, 0);
    this.select(this.active ? this.firstRow() : -1);
};

Window_CreatorControls.prototype.firstRow = function() {
    return this._rows.findIndex(row => row.kind !== "group");
};

Window_CreatorControls.prototype.maxItems = function() {
    return this._rows.length;
};

Window_CreatorControls.prototype.currentRow = function() {
    return this._rows[this.index()];
};

Window_CreatorControls.prototype.isCurrentItemEnabled = function() {
    const row = this.currentRow();
    return !!row && row.kind !== "group";
};

/** A heading can't be landed on, by key or by pointer. */
Window_CreatorControls.prototype.hitIndex = function() {
    const hit = Window_Selectable.prototype.hitIndex.call(this);
    return this._rows[hit]?.kind === "group" ? -1 : hit;
};

Window_CreatorControls.prototype.cursorDown = function(wrap) {
    let index = this.index() + 1;
    while (this._rows[index]?.kind === "group") index++;
    if (index < this._rows.length) this.smoothSelect(index);
    else if (wrap) this.smoothSelect(this.firstRow());
};

/** Up from the top row goes back to the tabs. */
Window_CreatorControls.prototype.cursorUp = function() {
    let index = this.index() - 1;
    while (this._rows[index]?.kind === "group") index--;
    if (index >= 0) this.smoothSelect(index);
    else if (Input.isTriggered("up")) { this.playCursorSound(); this.backToTabs(); }
};

Window_CreatorControls.prototype.backToTabs = function() {
    this.updateInputData();
    this.deactivate();
    this.callCancelHandler();
};

Window_CreatorControls.prototype.cursorLeft = function() {
    this.adjust(-1);
};

Window_CreatorControls.prototype.cursorRight = function() {
    this.adjust(1);
};

/** Left and right change the row. Shift makes it fine. */
Window_CreatorControls.prototype.adjust = function(direction) {
    const row = this.currentRow();
    if (!row) return;
    if (row.kind === "slider") {
        const coarse = (row.max - row.min) / 40, step = Input.isPressed("shift") ? row.step : Math.max(row.step, coarse);
        this.setSlider(row, this.sliderValue(row) + direction * step);
        this.playCursorSound();
    } else if (row.kind === "select") {
        const options = row.options, at = options.findIndex(option => option.id === this._studio.optionValue(row));
        const next = options[(Math.max(at, 0) + direction + options.length) % options.length];
        this._studio.choose(row, next.id);
        this.redrawCurrentItem();
        this.playCursorSound();
    }
};

Window_CreatorControls.prototype.sliderValue = function(row) {
    return this._studio.sliderValue(row);
};

Window_CreatorControls.prototype.setSlider = function(row, value) {
    const step = row.step || 0.01, held = Math.max(row.min, Math.min(row.max, Math.round(value / step) * step));
    this._studio.setValue(row.path, Number(held.toFixed(4)));
    this._studio.rebuildSoon();
    this.redrawItem(this._rows.indexOf(row));
};

/** OK has nothing to open on a slider, and says nothing. */
Window_CreatorControls.prototype.processOk = function() {
    if (this.currentRow()?.kind === "slider") return;
    Window_Selectable.prototype.processOk.call(this);
};

Window_CreatorControls.prototype.gaugeRect = function(index) {
    const rect = this.itemLineRect(index), width = Math.floor(rect.width * 0.5), height = Window_CreatorControls.GAUGE_HEIGHT;
    return new Rectangle(rect.x + rect.width - width, rect.y + Math.floor((rect.height - height) / 2), width, height);
};

Window_CreatorControls.prototype.update = function() {
    Window_Selectable.prototype.update.call(this);
    this.updateSliderDrag();
};

Window_CreatorControls.prototype.isTouchScrollEnabled = function() {
    return this._dragRow < 0 && Window_Selectable.prototype.isTouchScrollEnabled.call(this);
};

/** Press on a slider's bar and drag: the value follows the pointer. */
Window_CreatorControls.prototype.updateSliderDrag = function() {
    if (this._dragRow < 0) {
        if (!this.isOpenAndActive() || !TouchInput.isTriggered()) return;
        const hit = this.hitIndex();
        if (this._rows[hit]?.kind !== "slider" || this.touchFraction(hit) === null) return;
        this._dragRow = hit;
    }
    if (!TouchInput.isPressed()) { this._dragRow = -1; return; }
    const row = this._rows[this._dragRow], fraction = this.touchFraction(this._dragRow, true);
    if (fraction !== null) this.setSlider(row, row.min + (row.max - row.min) * fraction);
};

/** Where the pointer is along a row's bar, 0 to 1. Null when off it, unless already dragging it. */
Window_CreatorControls.prototype.touchFraction = function(index, dragging) {
    const local = this.worldTransform.applyInverse(new Point(TouchInput.x, TouchInput.y));
    const gauge = this.gaugeRect(index), x = this.origin.x + local.x - this.padding;
    if (!dragging && (x < gauge.x - 8 || x > gauge.x + gauge.width + 8)) return null;
    return Math.max(0, Math.min(1, (x - gauge.x) / gauge.width));
};

Window_CreatorControls.prototype.drawItem = function(index) {
    const row = this._rows[index], rect = this.itemLineRect(index);
    this.resetTextColor();
    if (row.kind === "group") {
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(row.label, rect.x, rect.y, rect.width);
        this.resetTextColor();
        return;
    }
    const half = Math.floor(rect.width * 0.5) - this.itemPadding();
    this.drawText(row.label, rect.x, rect.y, row.kind === "select" ? half : rect.width);
    if (row.kind === "slider") this.drawSlider(index, row);
    else if (row.kind === "select") this.drawOption(rect, half, row);
    else this.drawSwatch(rect, row);
};

Window_CreatorControls.prototype.drawItemBackground = function(index) {
    if (this._rows[index]?.kind !== "group") Window_Selectable.prototype.drawItemBackground.call(this, index);
};

Window_CreatorControls.prototype.drawSlider = function(index, row) {
    const gauge = this.gaugeRect(index), fraction = (this.sliderValue(row) - row.min) / Math.max(0.0001, row.max - row.min);
    const fill = Math.round(gauge.width * Math.max(0, Math.min(1, fraction)));
    this.contents.fillRect(gauge.x, gauge.y, gauge.width, gauge.height, ColorManager.gaugeBackColor());
    this.contents.gradientFillRect(gauge.x, gauge.y, fill, gauge.height, ColorManager.tpGaugeColor1(), ColorManager.tpGaugeColor2());
};

Window_CreatorControls.prototype.drawOption = function(rect, half, row) {
    const value = this._studio.optionValue(row), option = row.options.find(entry => entry.id === value);
    this.changeTextColor(ColorManager.systemColor());
    this.drawText("< " + (option ? option.label : "Choose") + " >", rect.x + half, rect.y, rect.width - half, "right");
    this.resetTextColor();
};

Window_CreatorControls.prototype.drawSwatch = function(rect, row) {
    const width = Math.floor(rect.width * 0.5), height = rect.height - 8, x = rect.x + rect.width - width, y = rect.y + 4;
    const color = this._studio.valueAt(row.path);
    this.contents.fillRect(x, y, width, height, ColorManager.gaugeBackColor());
    if (/^#[0-9a-f]{6}$/i.test(color || "")) this.contents.fillRect(x + 2, y + 2, width - 4, height - 4, color);
};

/** All of a list control's choices at once, over the controls. */
function Window_CreatorOptions() {
    this.initialize(...arguments);
}

Window_CreatorOptions.prototype = Object.create(Window_Selectable.prototype);
Window_CreatorOptions.prototype.constructor = Window_CreatorOptions;

Window_CreatorOptions.prototype.initialize = function(rect) {
    this._options = [];
    Window_Selectable.prototype.initialize.call(this, rect);
    this.hide();
};

Window_CreatorOptions.prototype.setup = function(control, value) {
    this._options = control.options;
    this.refresh();
    this.scrollTo(0, 0);
    this.select(Math.max(0, this._options.findIndex(option => option.id === value)));
    this.show();
    this.activate();
};

/** Moving through the list tries each choice on. */
Window_CreatorOptions.prototype.select = function(index) {
    const before = this.index();
    Window_Selectable.prototype.select.call(this, index);
    if (index !== before && index >= 0 && this.visible && this.active && this._options[index]) this._onHighlight?.(this._options[index]);
};

Window_CreatorOptions.prototype.maxItems = function() {
    return this._options.length;
};

Window_CreatorOptions.prototype.option = function() {
    return this._options[this.index()];
};

Window_CreatorOptions.prototype.drawItem = function(index) {
    const option = this._options[index], rect = this.itemLineRect(index);
    this.resetTextColor();
    this.drawText(option.label, rect.x, rect.y, rect.width);
    if (option.group) {
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(option.group, rect.x, rect.y, rect.width, "right");
        this.resetTextColor();
    }
};

/** A color by its hue, strength and brightness, on the same bars as every other slider. */
function Window_CreatorColor() {
    this.initialize(...arguments);
}

Window_CreatorColor.prototype = Object.create(Window_CreatorControls.prototype);
Window_CreatorColor.prototype.constructor = Window_CreatorColor;

Window_CreatorColor.prototype.initialize = function(rect, studio) {
    Window_CreatorControls.prototype.initialize.call(this, rect, studio);
    this._hsv = [0, 0, 1];
    this.hide();
};

Window_CreatorColor.prototype.setup = function(control) {
    this._control = control;
    this._start = this._studio.valueAt(control.path) || "#808080";
    this._hsv = ReactorCharacters.toHsv(this._start);
    this._rows = [{ kind: "group", label: control.label },
        { kind: "slider", label: "Hue", part: 0, min: 0, max: 360, step: 1 },
        { kind: "slider", label: "Strength", part: 1, min: 0, max: 1, step: 0.01 },
        { kind: "slider", label: "Brightness", part: 2, min: 0, max: 1, step: 0.01 }];
    this.refresh();
    this.scrollTo(0, 0);
    this.select(1);
    this.show();
    this.activate();
};

Window_CreatorColor.prototype.sliderValue = function(row) {
    return this._hsv[row.part];
};

Window_CreatorColor.prototype.setSlider = function(row, value) {
    this._hsv[row.part] = Math.max(row.min, Math.min(row.max, value));
    this._studio.setValue(this._control.path, ReactorCharacters.toHex(this._hsv));
    this._studio.rebuildSoon();
    this.refresh();
};

/** The heading wears the color being mixed. */
Window_CreatorColor.prototype.drawItem = function(index) {
    if (index === 0) this.drawSwatch(this.itemLineRect(0), this._control);
    Window_CreatorControls.prototype.drawItem.call(this, index);
};

Window_CreatorColor.prototype.cursorUp = function(wrap) {
    if (this.index() > 1) this.smoothSelect(this.index() - 1);
    else if (wrap) this.smoothSelect(3);
};

Window_CreatorColor.prototype.processOk = function() {
    this.playOkSound();
    this.updateInputData();
    this.deactivate();
    this.callOkHandler();
};

Window_CreatorColor.prototype.revert = function() {
    this._studio.setValue(this._control.path, this._start);
    this._studio.rebuildSoon();
};

ReactorCharacters.toHsv = function(hex) {
    const value = parseInt(String(hex).slice(1), 16) || 0;
    const r = (value >> 16 & 255) / 255, g = (value >> 8 & 255) / 255, b = (value & 255) / 255;
    const max = Math.max(r, g, b), span = max - Math.min(r, g, b);
    const hue = !span ? 0 : max === r ? ((g - b) / span + 6) % 6 : max === g ? (b - r) / span + 2 : (r - g) / span + 4;
    return [hue * 60, max ? span / max : 0, max];
};

ReactorCharacters.toHex = function([hue, strength, brightness]) {
    const channel = shift => {
        const k = (shift + hue / 60) % 6;
        return Math.round((brightness - brightness * strength * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    return "#" + [channel(5), channel(3), channel(1)].map(part => part.toString(16).padStart(2, "0")).join("");
};

function Scene_CharacterCreator() {
    this.initialize(...arguments);
}

Scene_CharacterCreator.prototype = Object.create(Scene_MenuBase.prototype);
Scene_CharacterCreator.prototype.constructor = Scene_CharacterCreator;

Scene_CharacterCreator.prototype.create = function() {
    Scene_MenuBase.prototype.create.call(this);
    const studio = this._studio = ReactorCharacters.studio || (ReactorCharacters.studio = new ReactorCharacterStudio());
    this._helpWindow = new Window_Help(new Rectangle(0, this.helpAreaTop(), Graphics.boxWidth, this.helpAreaHeight()));
    this.addWindow(this._helpWindow);
    const top = this.mainAreaTop(), height = this.mainAreaHeight();
    const left = Math.max(Math.min(360, Graphics.boxWidth - 160), Math.floor(Graphics.boxWidth * 0.46));
    this.createTabs(left, top);
    const below = top + this._tabsWindow.height, rest = new Rectangle(0, below, left, height - this._tabsWindow.height);
    this._controlsWindow = new Window_CreatorControls(rest, studio);
    this._optionsWindow = new Window_CreatorOptions(rest);
    this._colorWindow = new Window_CreatorColor(rest, studio);
    this._stageWindow = new Window_Base(new Rectangle(left, top, Graphics.boxWidth - left, height));
    for (const entry of [this._controlsWindow, this._optionsWindow, this._colorWindow, this._stageWindow]) this.addWindow(entry);
    this._controlsWindow.setHandler("ok", this.onControlOk.bind(this));
    this._controlsWindow.setHandler("cancel", this.onControlCancel.bind(this));
    this._controlsWindow.setHandler("pageup", () => this.changeTab(-1));
    this._controlsWindow.setHandler("pagedown", () => this.changeTab(1));
    this._optionsWindow.setHandler("ok", this.onOptionOk.bind(this));
    this._optionsWindow.setHandler("cancel", this.onOptionCancel.bind(this));
    this._optionsWindow._onHighlight = option => studio.tryOn(this._controlsWindow.currentRow(), option.id);
    this._colorWindow.setHandler("ok", this.onPopupCancel.bind(this));
    this._colorWindow.setHandler("cancel", this.onColorCancel.bind(this));
    this._tabsWindow.setControls(this._controlsWindow);
    this._tabsWindow.activate();
};

/** As many tabs to a row as read well; a narrow screen takes two rows. */
Scene_CharacterCreator.prototype.createTabs = function(width, top) {
    const studio = this._studio, count = studio.tabs.length + (studio.config.askName !== false ? 2 : 1);
    // Six tabs and Name and Done is the most there can be: room for those is kept before they are known.
    const columns = Math.max(3, Math.min(Math.max(count, 8), Math.floor(width / 104))), rows = Math.ceil(Math.max(count, 8) / columns);
    this._tabsWindow = new Window_CreatorTabs(new Rectangle(0, top, width, this.calcWindowHeight(rows, true)), studio, columns);
    this._tabsWindow.setHandler("ok", this.onTabOk.bind(this));
    this._tabsWindow.setHandler("cancel", this.onBack.bind(this));
    this.addWindow(this._tabsWindow);
};

Scene_CharacterCreator.prototype.needsCancelButton = function() {
    return !ReactorCharacters.isRequired();
};

Scene_CharacterCreator.prototype.start = function() {
    Scene_MenuBase.prototype.start.call(this);
    const studio = this._studio;
    studio.onReady = () => this.onStudioReady();
    studio.onRecipe = () => this._controlsWindow.refresh();
    studio.onStatus = () => this.showStatus();
    if (studio.opened) this.onStudioReady();
    studio.setShown(true);
    this.showStatus();
    if (ReactorCharacters.naming) this.onNamed();
    studio.open();
};

Scene_CharacterCreator.prototype.stop = function() {
    Scene_MenuBase.prototype.stop.call(this);
    const studio = this._studio;
    studio.onReady = studio.onRecipe = studio.onStatus = null;
    if (ReactorCharacters.naming) { studio.setShown(false); return; }
    studio.close();
    ReactorCharacters.studio = null;
};

Scene_CharacterCreator.prototype.onStudioReady = function() {
    this._tabsWindow.refresh();
    this._controlsWindow.setTab(this._tabsWindow.tab());
};

Scene_CharacterCreator.prototype.update = function() {
    Scene_MenuBase.prototype.update.call(this);
    const stage = this._stageWindow, inset = stage.padding;
    this._studio.place(this._windowLayer.x + stage.x + inset, this._windowLayer.y + stage.y + inset, stage.width - inset * 2, stage.height - inset * 2);
    this.updateTouchFocus();
};

/** The tabs and the controls take turns holding the cursor; a click or tap goes where it lands. */
Scene_CharacterCreator.prototype.updateTouchFocus = function() {
    if (this._finishing || !TouchInput.isTriggered() || this._optionsWindow.visible || this._colorWindow.visible) return;
    const tabs = this._tabsWindow, controls = this._controlsWindow;
    if (!tabs.active && tabs.hitIndex() >= 0) { controls.deactivate(); tabs.activate(); tabs.onTouchSelect(true); }
    else if (!controls.active && controls.hitIndex() >= 0) { tabs.deactivate(); controls.activate(); controls.onTouchSelect(true); controls.updateSliderDrag(); }
};

Scene_CharacterCreator.prototype.showStatus = function() {
    const studio = this._studio, title = studio.config.prompt || "Create your character";
    const hint = studio.message ? (studio.bad ? "\\C[2]" : "") + studio.message.replace(/\\/g, "") : this.nameLine();
    this._helpWindow.setText(title.replace(/\\/g, "") + "\n" + hint);
};

Scene_CharacterCreator.prototype.nameLine = function() {
    const name = this._studio.name;
    return this._studio.config.askName === false || !name ? "" : "Name: " + name.replace(/\\/g, "");
};

Scene_CharacterCreator.prototype.onTabOk = function() {
    const symbol = this._tabsWindow.currentSymbol();
    if (symbol === "tab") {
        this._controlsWindow.activate();
        if (this._controlsWindow.index() < 0) this._controlsWindow.select(this._controlsWindow.firstRow());
    } else if (symbol === "name") this.openName();
    else this.finish();
};

Scene_CharacterCreator.prototype.changeTab = function(direction) {
    const tabs = this._tabsWindow, count = this._studio.tabs.length;
    if (count > 1) {
        tabs.select((tabs.index() + direction + count) % count);
        SoundManager.playCursor();
    }
    this._controlsWindow.activate();
    if (this._controlsWindow.index() < 0) this._controlsWindow.select(this._controlsWindow.firstRow());
};

Scene_CharacterCreator.prototype.onControlCancel = function() {
    this._controlsWindow.deselect();
    this._tabsWindow.activate();
};

Scene_CharacterCreator.prototype.onControlOk = function() {
    const row = this._controlsWindow.currentRow(), studio = this._studio;
    this._controlsWindow.hide();
    if (row.kind === "select") this._optionsWindow.setup(row, studio.optionValue(row));
    else this._colorWindow.setup(row);
};

Scene_CharacterCreator.prototype.onOptionOk = function() {
    this._studio.choose(this._controlsWindow.currentRow(), this._optionsWindow.option().id);
    this.onPopupCancel();
};

/** Back without choosing: whatever was tried on comes off. */
Scene_CharacterCreator.prototype.onOptionCancel = function() {
    this._studio.endTry(false);
    this.onPopupCancel();
};

/** Closes the list or color page, back to the controls; a color stays as it was mixed. */
Scene_CharacterCreator.prototype.onPopupCancel = function() {
    this._optionsWindow.hide();
    this._colorWindow.hide();
    this._controlsWindow.show();
    this._controlsWindow.refresh();
    this._controlsWindow.activate();
};

Scene_CharacterCreator.prototype.onColorCancel = function() {
    this._colorWindow.revert();
    this.onPopupCancel();
};

/**
 * The project's own name screen, on the actor this character plays as, wearing the character being made: the actor
 * kept its own face until the character was finished, so the name screen showed the Demo's actor.
 */
Scene_CharacterCreator.prototype.openName = async function() {
    if (this._openingName) return;
    this._openingName = true;
    try {
        const id = ReactorCharacters.baseActorId(), actor = $gameActors.actor(id);
        if (this._studio.name) actor.setName(this._studio.name);
        const url = typeof this._studio.portrait === "function" ? this._studio.portrait() : "";
        if (url) await ReactorCharacters.wearPreviewFace(actor, url).catch(() => null);
        ReactorCharacters.naming = true;
        SceneManager.push(Scene_Name);
        SceneManager.prepareNextScene(id, Number(this._studio.config.nameLength) || 16);
    } finally {
        this._openingName = false;
    }
};

Scene_CharacterCreator.prototype.onNamed = function() {
    ReactorCharacters.naming = false;
    this._studio.name = $gameActors.actor(ReactorCharacters.baseActorId()).name();
    this.showStatus();
    this._tabsWindow.activate();
    if (ReactorCharacters.finishAfterName) {
        ReactorCharacters.finishAfterName = false;
        if (this._studio.name) this.finish();
    }
};

Scene_CharacterCreator.prototype.finish = async function() {
    if (this._finishing) return;
    const studio = this._studio;
    if (studio.config.askName !== false && !studio.name) {
        ReactorCharacters.finishAfterName = true;
        return this.openName();
    }
    this._finishing = true;
    this._tabsWindow.deactivate();
    try {
        await studio.finish();
        ReactorCharacters.finish();
    } catch (error) {
        this._finishing = false;
        this._tabsWindow.activate();
        studio.status("Your character could not be saved: " + error.message, true);
    }
};

Scene_CharacterCreator.prototype.onBack = function() {
    if (ReactorCharacters.isRequired()) {
        SoundManager.playBuzzer();
        this._tabsWindow.activate();
        return;
    }
    // Back is one key from a lot of slider work, so it asks once.
    if (this._studio.edits && !this._leaving) {
        this._leaving = true;
        this._tabsWindow.activate();
        this._studio.status("Press Back again to leave without keeping this character.");
        return;
    }
    ReactorCharacters.leave();
};

Scene_CharacterCreator.prototype.onTabChanged = function() {
    if (!this._leaving) return;
    this._leaving = false;
    this._studio.status("");
};

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
        if (typeof ReactorOnline !== "undefined") ReactorOnline.onGameStarted();
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
    const loadFace = ImageManager.loadFace;
    ImageManager.loadFace = function(filename) {
        // Its package isn't here yet, or never will be: a clear face, not a missing file.
        if (String(filename).startsWith("Character-")) return ReactorCharacters.faces.get(filename) || (ReactorCharacters._noFace ||= new Bitmap(ImageManager.faceWidth, ImageManager.faceHeight));
        return loadFace.apply(this, arguments);
    };
    const actorSpec = Reactor3D.databaseModelSpec;
    Reactor3D.databaseModelSpec = function(section, id) {
        if (section === "actors" && !ReactorCharacters._bypass) {
            const character = ReactorCharacters.current();
            if (character && character.actorId === id && ReactorCharacters.models.has(character.id)) return ReactorCharacters.models.get(character.id);
        }
        return actorSpec.call(this, section, id);
    };
    const loadModel = Reactor3D.loadModel;
    Reactor3D.loadModel = function(name, ext, file, texture) {
        const id = ReactorCharacters.modelIds.get(name);
        if (!id || this._glbCache[this.modelCacheKey(name, ext, file)]) return loadModel.call(this, name, ext, file, texture);
        return ReactorCharacters.reinstall(id).then(spec => (spec ? loadModel.call(this, name, ext, file, texture) : null));
    };
    Reactor3D.databaseModelSpecOfProject = function(id) {
        ReactorCharacters._bypass = true;
        try { return this.databaseModelSpec("actors", id); } finally { ReactorCharacters._bypass = false; }
    };
}

if (typeof PluginManager !== "undefined") {
    PluginManager.registerCommand("RPGReactor", "CharacterCreation", function(args) {
        ReactorCharacters.open(args);
    });
}
