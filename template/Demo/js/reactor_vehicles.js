//=============================================================================
// reactor_vehicles.js - vehicles in the world
//=============================================================================
// Database starting placements and legacy `rrVehicle: { type }` events share
// the event driver. Their records live in data/ReactorVehicles.json; identities
// are "0:<vehicleId>" for database placements and "<mapId>:<eventId>" for legacy events.
// This file holds:
//   - the types ($dataReactorVehicles) and the words the player reads (TERMS);
//   - the vehicles of the map the party is on, and the saved registry of
//     where each stands once it has left its authored tile
//     ($gameMap._rrVehicles);
//   - what $gamePlayer answers while it rides one: `_vehicleType` is
//     "reactor", `isInVehicle()` is true, `vehicle()` is the event, and the
//     event answers every method a caller of `vehicle()` uses;
//   - which vehicle OK would board (`offered`), the two hops as state
//     (`_rrMount`), Confirm to interact and Cancel to get off aboard, parking and the place to stand
//     beside it, and the rule for a battle that starts on the map;
//   - the script calls and the three plugin commands.
// `$gameMap._vehicles` stays the native three. Optional database extensions
// add battler data and image bindings without replacing their movement or commands.
//
// What is saved is plain data on $gamePlayer, on the event and on $gameMap;
// no saved object holds a character. Every cache is in this module and is
// rebuilt on demand, so a save made before this file existed loads and plays.
//
// Moving the ridden vehicle is reactor_vehicles_drive.js; drawing it and its
// rider is reactor_3d_vehicles.js and reactor_3d_rider.js. This file meets
// them in saved fields only: `_rrDrive.v`, `.air`, `.alt` and `.fade` are read,
// `_rrDrive.leave` written.
//=============================================================================

(function() {
    "use strict";

    const root = typeof window !== "undefined" ? window : globalThis;
    const V = root.ReactorVehicles = root.ReactorVehicles || {};
    if (V._world) return;
    V._world = true;

    V.DATA_URL = "data/ReactorVehicles.json";
    /** Ticks a hop on or off takes. */
    V.HOP = 14;
    /** Ticks a press to get off is kept once the vehicle no longer slows or comes down, and ticks the "no room" word shows. */
    V.KEEP = 90;
    /** Ticks between two looks for the vehicle OK would board. */
    V.LOOK = 6;
    /** Ticks between two looks for the events whose body is more than their own tile (asked about the tile the leader faces). */
    V.BODIES = 120;
    /** How near the leader's middle a vehicle's body has to be, and how near in height, in tiles. */
    V.REACH = 1.25;
    V.REACH_HEIGHT = 1.5;
    /** How far off his facing the nearest point of the body may lie, in degrees. */
    V.FACING = 75;
    /** A command boards with the hop from this near, and at once from further. */
    V.HOP_REACH = 3;
    /** Under this speed (tiles a second) the party can get off, and a rider beside someone talks to him. */
    V.SLOW = 1;
    /** How far OK reaches from the saddle, in tiles: past the vehicle's nose, and to either side of its middle. */
    V.AHEAD = 1.5;
    V.ASIDE = 1.5;

    const RAD = Math.PI / 180;
    // Facings as headings: degrees, 0 north, clockwise.
    const DEGREES_OF_DIR = { 8: 0, 9: 45, 6: 90, 3: 135, 2: 180, 1: 225, 4: 270, 7: 315 };
    const DIR8_OF_STEP = [8, 9, 6, 3, 2, 1, 4, 7];
    const DIR4_OF_STEP = [8, 6, 2, 4];

    const world = () => (typeof Reactor3D !== "undefined" && Reactor3D ? Reactor3D : null);
    const physics = () => (typeof ReactorPhysics !== "undefined" && ReactorPhysics ? ReactorPhysics : null);
    const models = () => { const R = world(); return R && R.Vehicles ? R.Vehicles : null; };
    const mapData = () => (typeof $dataMap !== "undefined" && $dataMap ? $dataMap : null);
    const player = () => (typeof $gamePlayer !== "undefined" && $gamePlayer ? $gamePlayer : null);
    const map3D = () => { const R = world(), data = mapData(); return !!(R && data && R.isMap3D && R.isMap3D(data)); };
    const fightHere = () => typeof $gameFight !== "undefined" && !!$gameFight && typeof $gameFight.isHere === "function" && $gameFight.isHere();
    const number = value => (typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN);
    const flag = (value, otherwise) => (value === true || value === "true" ? true : value === false || value === "false" ? false : otherwise);
    const round3 = value => Math.round(value * 1000) / 1000;

    /** A heading in degrees as one in 0..360. */
    const turn360 = degrees => { const d = degrees % 360; return d < 0 ? d + 360 : d; };
    V.degrees = radians => turn360(radians / RAD);
    V.radians = degrees => turn360(Number(degrees) || 0) * RAD;
    const dir8Of = radians => DIR8_OF_STEP[Math.round(V.degrees(radians) / 45) % 8];
    const dir4Of = radians => DIR4_OF_STEP[Math.round(V.degrees(radians) / 90) % 4];
    const facingOf = character => {
        const d8 = character._reactorDir8;
        const d = d8 === 1 || d8 === 3 || d8 === 7 || d8 === 9 ? d8 : character._direction;
        return (DEGREES_OF_DIR[d] === undefined ? 180 : DEGREES_OF_DIR[d]) * RAD;
    };
    /** A vehicle's facing on the grid, from its heading: the nearest of four, and of eight for its body and its model. */
    const face = function(character, radians) {
        character._direction = dir4Of(radians);
        character._reactorDir8 = dir8Of(radians);
    };

    //-------------------------------------------------------------------------
    // The types and the words.

    /** Loads the types once; a missing or malformed file is an empty list. */
    V.load = function() {
        if (this._state) return;
        this._state = "loading";
        const finish = parsed => {
            root.$dataReactorVehicles = Array.isArray(parsed) ? parsed : [null];
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
            console.warn("ReactorVehicles: could not read " + this.DATA_URL, error);
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

    V.isReady = function() {
        this.load();
        return this._state === "done";
    };

    /** The words the player reads: English, unless the project has its own (System.json reactorVehicles.terms). */
    V.TERMS = Object.assign({
        ride: "Ride", drive: "Drive", board: "Board", fly: "Fly",
        getOff: "Get off", getOut: "Get out",
        go: "Go", brake: "Brake", steer: "Steer", jump: "Jump",
        turnRound: "Turn round", noRoom: "No room to get off here"
    }, V.TERMS || null);

    const settings = function() {
        const system = typeof $dataSystem !== "undefined" && $dataSystem ? $dataSystem.reactorVehicles : null;
        return system && typeof system === "object" ? system : null;
    };

    V.term = function(key) {
        const own = settings(), terms = own && own.terms;
        return (terms && typeof terms[key] === "string" && terms[key]) || V.TERMS[key] || "";
    };

    /** False when the project's file switches the new vehicles off: each then stands as scenery. */
    V.free = function() {
        const own = settings();
        return !(own && own.free === false);
    };

    // A type without reactor_3d_vehicles.js: what this file itself reads of one, with the motorcycle's values.
    const plainTypes = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    const plainType = function(record) {
        let type = plainTypes.get(record);
        if (type) return type;
        const kind = typeof record.kind === "string" && record.kind ? record.kind : "motorcycle";
        const model = record.graphic3d !== false && record.model && typeof record.model === "object" && record.model.name ? Object.assign({}, record.model) : null;
        if (model) {
            if (!model.file) model.file = String(model.name).split("/").pop();
            if (!model.ext) model.ext = ".glb";
            if (!(Number(model.size) > 0)) model.size = 3.5;
        }
        type = {
            id: record.id, name: record.name || "", kind, prompt: record.prompt || "",
            promptTerm: "ride", leaveTerm: "getOff", played: record.ridable !== false, medium: record.medium || "ground",
            sheet: record.sheet || {},
            model, rider: record.rider === "inside" ? "inside" : "seat", bgm: record.bgm || null,
            handling: Object.assign({ speed: 20, brake: 0.67 }, record.handling || null),
            body: Object.assign({ height: 2.6, radius: 0.45 }, record.body || null),
            sounds: record.sounds || {}
        };
        plainTypes.set(record, type);
        return type;
    };

    /** A type record filled from its kind, or null where the list has none under that id. The same object every time. */
    V.type = function(id) {
        const list = root.$dataReactorVehicles;
        const record = list && id > 0 ? list[id] : null;
        if (!record || typeof record !== "object") return null;
        const M = models();
        return M && typeof M.typeOf === "function" ? M.typeOf(record) : plainType(record);
    };

    /** The two words of a type's label: what OK does beside it, and what OK does aboard. */
    const WORDS = { prompt: "", leave: "" };
    V.words = function(type) {
        WORDS.prompt = (type && type.prompt) || V.term((type && type.promptTerm) || "ride");
        WORDS.leave = V.term((type && type.leaveTerm) || "getOff");
        return WORDS;
    };

    //-------------------------------------------------------------------------
    // The look: an event with no picture or model of its own wears its type's.

    // One kept spec per type: the body rule, the collision keys and the still-model test compare a spec by identity.
    const looks = typeof WeakMap !== "undefined" ? new WeakMap() : null;

    /** A model's front as a unit vector in its own space, from `vehicle.forward`; null when it says none. */
    const forwardOf = function(value) {
        if (typeof value === "string") {
            const axis = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] }[value.trim().toLowerCase()];
            return axis || null;
        }
        if (Array.isArray(value) && value.length >= 3) {
            const x = Number(value[0]), z = Number(value[2]), length = Math.hypot(x, z);
            return length > 1e-6 ? [x / length, 0, z / length] : null;
        }
        return null;
    };

    const lookOf = function(type) {
        if (!type || !type.model || !type.model.name || !looks) return null;
        let look = looks.get(type);
        if (!look) {
            const R = world();
            const normal = R && R.normalizeModelSpec ? R.normalizeModelSpec(type.model) : null;
            // Its own object: the front mark is written into it below, and the engine's shared copy stays as read.
            look = { spec: normal ? Object.assign({}, normal) : null, fronted: false, front: null, dims: null, cached: null };
            looks.set(type, look);
        }
        if (look.spec && !look.fronted) front(look, type);
        return look;
    };

    /**
     * The spec's front mark, from the model's own `vehicle.forward`, once its sidecar has been read (it is preloaded
     * with the map). A spec with a front mark of its own keeps it. Written into the kept spec, so the body is
     * taken again with the model's true front.
     */
    const front = function(look, type) {
        const R = world(), spec = look.spec;
        if (spec.faces && spec.faces.front) { look.fronted = true; look.front = forwardOf(spec.faces.front); return; }
        const json = R && R._sidecarJson ? R._sidecarJson[spec.name] : undefined;
        if (json === undefined) return;
        const entry = R._glbCache && R.modelCacheKey ? R._glbCache[R.modelCacheKey(spec.name, spec.ext, spec.file)] : null;
        const template = entry && entry.template ? entry.template : null;
        const M = models();
        let forward = forwardOf(json && json.vehicle && json.vehicle.forward);
        if (!forward && M && typeof M.read === "function") {
            // The file names no front: the model file's guess, which needs the model's box.
            if (!template && !(entry && entry.failed)) return;
            try {
                const block = M.read(json || {}, template && typeof M.boxOf === "function" ? M.boxOf(template) : null);
                forward = block ? forwardOf(block.f || block.forward) : null;
            } catch (error) { forward = null; }
        }
        look.fronted = true;
        if (!forward) return;
        look.front = forward;
        spec.faces = Object.assign({}, spec.faces || null, { front: forward });
    };

    /** How long a vehicle is, in tiles: its model's box along its front at the size it is drawn, else its size. */
    const DIMS = { length: 3.5 };
    const dimsOf = function(type) {
        const look = lookOf(type);
        if (look && look.dims) return look.dims;
        const spec = look && look.spec;
        DIMS.length = spec ? spec.size * spec.scale : 3.5;
        const R = world();
        const entry = spec && R && R._glbCache && R.modelCacheKey ? R._glbCache[R.modelCacheKey(spec.name, spec.ext, spec.file)] : null;
        const extent = entry && entry.template && entry.template.userData ? entry.template.userData.glbSize : null;
        if (!extent || !look.fronted) return DIMS;
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001), fit = spec.size / span * spec.scale;
        const f = look.front || [0, 0, 1], stretch = spec.stretch || [1, 1, 1];
        const sx = extent.x * fit * stretch[0], sz = extent.z * fit * stretch[2];
        look.dims = { length: Math.abs(f[0]) * sx + Math.abs(f[2]) * sz };
        return look.dims;
    };

    /** A map's vehicle rows: `fn(data, typeId)` for each event of the data that has one with a type that exists. */
    const eachRow = function(data, fn) {
        const events = data && data.events;
        const types = root.$dataReactorVehicles;
        if (!events || !types || types.length < 2) return;
        for (let i = 1; i < events.length; i++) {
            const row = events[i] && events[i].rrVehicle;
            if (!row || typeof row !== "object") continue;
            const id = Math.floor(Number(row.type)) || 0;
            if (id > 0 && V.type(id)) fn(events[i], id);
        }
    };

    const installLooks = function() {
        const R = world();
        if (!R || typeof R.characterModelSpec !== "function" || R.characterModelSpec.__rrVehicles) return;
        const characterModelSpec = R.characterModelSpec;
        R.characterModelSpec = function(character) {
            const stock = character && ["boat","ship","airship"].includes(character._type) && root.$dataSystem && root.$dataSystem[character._type];
            if (stock && stock.reactorVehicle && stock.reactorVehicle.model && stock.reactorVehicle.model.name) {
                const look = lookOf(models().typeOf(stock.reactorVehicle));
                if (look && look.spec) return look.spec;
            }
            if (!character || !character._rrVehicle) return characterModelSpec.call(this, character);
            // Its own picture or model comes first; an erased event and one with no page in force show nothing.
            if (character._erased || character._pageIndex < 0 || character._characterName || character._tileId > 0) return characterModelSpec.call(this, character);
            const F = root.ReactorFight;
            const own = F && typeof F.ownModelSpec === "function" ? F.ownModelSpec(character) : characterModelSpec.call(this, character);
            if (own) return own;
            const look = lookOf(V.type(character._rrVehicle));
            if (!look || !look.spec) return characterModelSpec.call(this, character);
            return this.variantSpecOf ? this.variantSpecOf(character, look.spec) : look.spec;
        };
        R.characterModelSpec.__rrVehicles = true;

        // A vehicle's model is readied with the map, not at the first boarding.
        if (typeof R.collectMapModelSpecs === "function") {
            const collectMapModelSpecs = R.collectMapModelSpecs;
            R.collectMapModelSpecs = function(data) {
                const specs = collectMapModelSpecs.call(this, data);
                for (const key of ["boat","ship","airship"]) {
                    const entry = root.$dataSystem && root.$dataSystem[key] && root.$dataSystem[key].reactorVehicle;
                    const look = entry && models() && lookOf(models().typeOf(entry));
                    if (look && look.spec) specs.push(look.spec);
                }
                eachRow(data, (event, id) => {
                    const look = lookOf(V.type(id)), spec = look && look.spec;
                    if (!spec) return;
                    const key = this.modelCacheKey(spec.name, spec.ext, spec.file);
                    if (!specs.some(other => this.modelCacheKey(other.name, other.ext, other.file) === key)) specs.push(spec);
                });
                return specs;
            };
        }
        // A map whose only model is a vehicle's is a map with models.
        if (typeof R._hasEventModelsNow === "function") {
            const hasEventModelsNow = R._hasEventModelsNow;
            R._hasEventModelsNow = function(data) {
                if (hasEventModelsNow.call(this, data)) return true;
                let found = false;
                eachRow(data, (event, id) => { const type = V.type(id); if (type && type.model && type.model.name) found = true; });
                return found;
            };
        }
    };

    //-------------------------------------------------------------------------
    // The vehicles of the map the party is on.

    // Kept between frames: this map's vehicle events, each with its row's `board` and `key`. Rebuilt whenever the
    // map's event list is another array (a map entered, a save loaded).
    const kept = { events: null, list: [], board: [], keys: [], types: [] };
    // The event `ridden()` last answered, and whether its ride has begun (`getOn()` has run and `getOff()` has not).
    let carried = null, riding = false;
    // The event list is being rebuilt: `ridden()` answers the event it knew until the new one is bound.
    let rebuilding = false;
    // Ticks left of a kept press to get off, and of the "no room" word.
    let keep = 0, noRoom = 0;
    // The speed and, in the air, the height the ridden vehicle had on the last tick of a kept press.
    let slowFrom = NaN, downFrom = NaN;

    V.idOf = function(event) {
        return event && event._eventId > 0 ? event._rrIdentity || (event._mapId || 0) + ":" + event._eventId : "";
    };

    /** Whether an event is a vehicle now: marked, not erased, and one of its pages in force. */
    V.isVehicle = function(event) {
        return !!event && event._rrVehicle > 0 && !event._erased && event._pageIndex >= 0;
    };

    const rowOf = function(event) {
        const data = mapData(), p = player();
        // While a transfer waits, the data is the next map's.
        if (!data || !data.events || (p && p.isTransferring && p.isTransferring())) return null;
        const authored = event._rrAuthored || data.events[event._eventId];
        return authored && authored.rrVehicle && typeof authored.rrVehicle === "object" ? authored.rrVehicle : null;
    };

    const rebuild = function(map) {
        kept.events = map._events;
        kept.list.length = 0; kept.board.length = 0; kept.keys.length = 0; kept.types.length = 0;
        const events = map.events();
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (!event || !(event._rrVehicle > 0)) continue;
            const row = rowOf(event);
            kept.list.push(event);
            kept.board.push(row && row.board === "command" ? "command" : "ok");
            kept.keys.push(row && typeof row.key === "string" ? row.key : "");
            kept.types.push(V.type(event._rrVehicle));
        }
    };

    /** This map's vehicle events. The array is this module's: read it, do not keep or change it. */
    V.list = function() {
        const map = typeof $gameMap !== "undefined" ? $gameMap : null;
        if (!map) return kept.list;
        if (kept.events !== map._events) rebuild(map);
        return kept.list;
    };

    V.any = function() {
        return V.list().length > 0;
    };

    const indexOf = event => V.list().indexOf(event);

    const registry = function(make) {
        const map = typeof $gameMap !== "undefined" ? $gameMap : null;
        if (!map) return null;
        if (!map._rrVehicles && make) map._rrVehicles = { v: 1, at: {} };
        return map._rrVehicles && map._rrVehicles.at ? map._rrVehicles : null;
    };

    // A vehicle can reuse Class/Weapon/Armor/State rules without becoming a party member.
    if (typeof Game_Actor !== "undefined") {
        function Game_ReactorVehicle() { this.initialize.apply(this, arguments); }
        Game_ReactorVehicle.prototype = Object.create(Game_Actor.prototype);
        Game_ReactorVehicle.prototype.constructor = Game_ReactorVehicle;
        Game_ReactorVehicle.prototype.initialize = function(typeId, identity) {
            Game_Battler.prototype.initialize.call(this);
            this._rrVehicleType = typeId; this._rrVehicleIdentity = identity;
            const record = this.actor();
            this._name = record.name; this._classId = record.classId;
            this._level = Math.max(1, Math.min(999, Math.floor(Number(record.initialLevel) || 1)));
            this.initExp(); this.initSkills(); this.initEquips(record.equips || []);
            this.recoverAll();
        };
        Game_ReactorVehicle.prototype.actor = function() {
            const record = typeof this._rrVehicleType === "string" ? root.$dataSystem && root.$dataSystem[this._rrVehicleType] && root.$dataSystem[this._rrVehicleType].reactorVehicle || {}
                : root.$dataReactorVehicles && root.$dataReactorVehicles[this._rrVehicleType] || {};
            return Object.assign({ name: "Vehicle", nickname: "", profile: "", note: "", traits: [], equips: [], maxLevel: 999,
                characterName: "", characterIndex: 0, faceName: "", faceIndex: 0, battlerName: "" }, record);
        };
        // Class is optional: intrinsic traits, skills and equipment still work.
        const transportClass = {id:0,traits:[],learnings:[],expParams:[30,20,30,30],
            params:Array.from({length:8},(_,param)=>Array(1000).fill(param === 0 ? 1 : 0))};
        Game_ReactorVehicle.prototype.currentClass = function() { return root.$dataClasses && root.$dataClasses[this._classId] || transportClass; };
        // Inherit Actor slots: class/vehicle/equipment/state traits supply
        // permissions, seals and Dual Wield, including on classless vehicles.
        Game_ReactorVehicle.prototype.initSkills = function() {
            Game_Actor.prototype.initSkills.call(this);
            for (const learning of this.actor().learnings || []) if (learning.level <= this._level) this.learnSkill(learning.skillId);
        };
        Game_ReactorVehicle.prototype.levelUp = function() {
            Game_Actor.prototype.levelUp.call(this);
            for (const learning of this.actor().learnings || []) if (learning.level === this._level) this.learnSkill(learning.skillId);
        };
        // A vehicle never trades with the party just to validate its initial loadout.
        Game_ReactorVehicle.prototype.tradeItemWithParty = function() { return true; };
        Game_ReactorVehicle.prototype.index = function() { return -1; };
        root.Game_ReactorVehicle = Game_ReactorVehicle;
    }

    V.battler = function(what) {
        const stockKey = typeof what === "string" && /^(?:stock:)?(boat|ship|airship)$/.test(what) ? what.replace(/^stock:/, "")
            : what && typeof what === "object" && !what._rrVehicle && ["boat","ship","airship"].includes(what._type) ? what._type : "";
        if (stockKey) {
            const record = root.$dataSystem && root.$dataSystem[stockKey] && root.$dataSystem[stockKey].reactorVehicle;
            if (!record || !root.Game_ReactorVehicle || !(root.$dataClasses && root.$dataClasses[record.classId] || record.traits?.length || record.learnings?.length || record.equips?.some(id => id > 0))) return null;
            const store = registry(true), identity = "stock:" + stockKey;
            if (!store.battlers) store.battlers = {};
            return store.battlers[identity] || (store.battlers[identity] = new root.Game_ReactorVehicle(stockKey, identity));
        }
        const event = V.find(what), identity = event ? V.idOf(event) : typeof what === "string" ? what.trim() : "";
        const store = registry(false);
        if (store && store.battlers && store.battlers[identity]) {
            const battler = store.battlers[identity];
            if (!event || battler._rrVehicleType === event._rrVehicle) return battler;
            delete store.battlers[identity];
        }
        const record = event && root.$dataReactorVehicles && root.$dataReactorVehicles[event._rrVehicle];
        if (!record || !root.Game_ReactorVehicle) return null;
        const hasClass = record.classId && root.$dataClasses && root.$dataClasses[record.classId];
        const intrinsic = record.traits && record.traits.length || record.learnings && record.learnings.length || record.equips && record.equips.some(id => id > 0);
        if (!hasClass && !intrinsic) return null;
        const live = registry(true);
        if (!live.battlers) live.battlers = {};
        return live.battlers[identity] = new root.Game_ReactorVehicle(event._rrVehicle, identity);
    };

    const groundOf = function(character) {
        if (Number.isFinite(character._reactorGround)) return character._reactorGround;
        const R = world();
        return R && R.characterGround && map3D() ? R.characterGround($dataMap, character) : 0;
    };

    /** Where a vehicle stands, into the registry. Plain fields only: the map's data may already be another map's. */
    const note = function(event, gone) {
        const home = event._rrHome, store = registry(true);
        if (!home || !store) return;
        const entry = {
            map: event._mapId, x: round3(event._realX), y: round3(event._realY),
            z: Number.isFinite(event._reactorGround) ? round3(event._reactorGround + (event._rrFree ? 0 : event._reactorLift || 0)) : null,
            yaw: round3(V.degrees(headingOf(event))), type: event._rrVehicle, home: [home[0], home[1]]
        };
        if (gone) entry.gone = true;
        const previous = store.at[V.idOf(event)];
        if (previous && previous.event) {
            entry.event = previous.event;
            if (previous.models) entry.models = previous.models;
        }
        if (!entry.event && event._rrAuthored && event._rrAuthored._rrDatabaseVehicle) entry.event = copy(event._rrAuthored);
        store.at[V.idOf(event)] = entry;
    };

    /** A vehicle's heading: its own while the mover holds it; on the grid, the facing a route or a command gave it. */
    const headingOf = function(event) {
        const yaw = event._rrYaw;
        if (!Number.isFinite(yaw)) return facingOf(event);
        if (event._rrFree || event._rrBoarded) return yaw;
        const d8 = event._reactorDir8;
        const facing = d8 === 1 || d8 === 3 || d8 === 7 || d8 === 9 ? d8 : event._direction;
        return dir8Of(yaw) === facing || dir4Of(yaw) === facing ? yaw : facingOf(event);
    };

    const atHome = function(event) {
        const home = event._rrHome;
        return !!home && !event._rrIdentity && !event._rrFree && event._realX === home[0] && event._realY === home[1]
            && Math.abs(turn360(V.degrees(headingOf(event)) - home[2] + 180) - 180) < 0.01;
    };

    /** Puts a vehicle where a registry entry or a command says: its middle off the grid, its height its own. */
    const place = function(event, x, y, z, degrees) {
        event._realX = x; event._realY = y;
        event._x = Math.round(x); event._y = Math.round(y);
        event._rrFree = 1;
        event._rrYaw = V.radians(degrees);
        face(event, event._rrYaw);
        if (Number.isFinite(z)) { event._reactorGround = z; event._reactorAlt = z; }
        event._reactorLift = 0; event._reactorZTarget = 0;
        event._reactorAir = 0; event._reactorVz = 0;
        event._rrSpeed = 0; event._rrSteer = 0; event._rrLean = 0;
        event._rrSink = undefined;
        event._rrPose = (event._rrPose || 0) + 1;
    };

    /** Marks an event as the vehicle its row makes it, with its home; false when the row names no type that exists. */
    const mark = function(event, authored) {
        const row = authored.rrVehicle;
        const id = Math.floor(Number(row.type)) || 0;
        if (!(id > 0) || !V.type(id)) return false;
        const asked = number(row.yaw);
        const degrees = Number.isFinite(asked) ? turn360(asked) : DEGREES_OF_DIR[event._direction] === undefined ? 180 : DEGREES_OF_DIR[event._direction];
        if (authored._rrVehicleIdentity) {
            event._rrIdentity = authored._rrVehicleIdentity;
            event._rrAuthored = authored;
        }
        event._rrVehicle = id;
        event._rrHome = [authored.x, authored.y, degrees];
        event._rrYaw = degrees * RAD;
        face(event, event._rrYaw);
        return true;
    };

    /**
     * After the map's events are made: each vehicle event is marked, given its home and put where the registry
     * says. An entry is used only while its type and its event's authored tile are the ones it was written for.
     */
    const enterMap = function(map) {
        const data = mapData(), store = registry(false);
        const authored = data && data.events;
        const p = player(), transfer = p && p._rrVehicleTransfer;
        const types = root.$dataReactorVehicles;
        if (authored && types && types.length > 1) {
            for (let i = 1; i < authored.length; i++) {
                const row = authored[i] && authored[i].rrVehicle;
                const event = row && typeof row === "object" ? map._events[authored[i].id] : null;
                if (!event || !mark(event, authored[i])) continue;
                if (event._rrIdentity) event.refresh();
                const id = V.idOf(event), entry = store ? store.at[id] : null;
                if (!entry) continue;
                if (entry.type !== event._rrVehicle || !entry.home || (!event._rrIdentity && (entry.home[0] !== authored[i].x || entry.home[1] !== authored[i].y))) {
                    delete store.at[id];
                } else if (entry.map !== map._mapId) {
                    event._rrAway = true;
                    event.erase();
                } else if (entry.gone) {
                    if (event._rrIdentity) event._rrHome = [entry.home[0], entry.home[1], entry.yaw];
                    event.erase();
                } else {
                    if (event._rrIdentity) event._rrHome = [entry.home[0], entry.home[1], entry.yaw];
                    place(event, entry.x, entry.y, entry.z, entry.yaw);
                }
                if (transfer && transfer.map === map._mapId && V.idOf(event) === transfer.identity && !event._erased) {
                    p._rrRide = { map: map._mapId, id: event._eventId };
                    event._rrBoarded = true;
                }
            }
        }
        rebuild(map);
        offer.event = null; offer.stamp = -1;
        if (V.bind && !transfer) V.bind();
        // The followers that rode vehicles of their own ride them here: come with the leader, or as a save left them.
        if (transfer && transfer.map === map._mapId && transfer.convoy) {
            if (transfer.shift) V.Convoy.shift(transfer.shift[0], transfer.shift[1], map._mapId);
            V.Convoy.resume(transfer.convoy);
        } else if (!transfer) V.Convoy.resume(null);
    };

    /** Before another map is set up: where each vehicle of this one stands, unless it is at its home. */
    const leaveMap = function(map) {
        if (!map || !map._events || !map._events.length) return;
        const events = map.events();
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (!event || !(event._rrVehicle > 0) || !event._rrHome || event._rrAway) continue;
            const store = registry(false), id = V.idOf(event), entry = store ? store.at[id] : null;
            if (entry && entry.gone) continue;
            if (atHome(event)) { if (entry) delete store.at[id]; continue; }
            note(event, false);
        }
    };

    /**
     * A map whose events came from a save, not from `setupEvents`: an event the data has since made a vehicle is
     * marked where it stands, and one the data no longer makes a vehicle is an ordinary event again.
     */
    V.refresh = function() {
        const map = typeof $gameMap !== "undefined" ? $gameMap : null, data = mapData();
        const p = player();
        if (!map || !data || !data.events || (p && p.isTransferring && p.isTransferring())) return;
        const events = map.events();
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (!event || !(event._eventId > 0)) continue;
            if (event._rrAuthored) data.events[event._eventId] = event._rrAuthored;
            const authored = event._rrAuthored || data.events[event._eventId];
            const row = authored && authored.rrVehicle && typeof authored.rrVehicle === "object" ? authored.rrVehicle : null;
            if (row && !event._rrVehicle) mark(event, authored);
            else if (!row && event._rrVehicle && !event._rrBoarded) {
                event._rrVehicle = 0; event._rrHome = null; event._rrYaw = undefined;
                if (event._rrFree) { event._rrFree = 0; event._realX = event._x; event._realY = event._y; }
            }
        }
        rebuild(map);
    };

    /** Why this version rides no vehicle on this map now, whatever its type: "" when it does. */
    const mapRule = function() {
        if (!map3D()) return "";
        const map = $gameMap;
        if (map.isLoopHorizontal() || map.isLoopVertical()) return "loop";
        const camera = map._reactorCamera3d || (typeof map.reactorCamera3D === "function" ? map.reactorCamera3D() : null);
        return camera && camera.mode === "firstPerson" ? "firstPerson" : "";
    };

    /** Why this version does not ride a type anywhere: there is none, or its kind arrives later. */
    const kindRule = function(type) {
        return !type ? "type" : type.played === false ? "disabled" : "";
    };

    /** Whether a type has nothing to be drawn as: it names no model, or its model's file could not be read. */
    const modelRule = function(type, event) {
        const sprite = !!(type && type.sheet && type.sheet.characterName || event && (event._characterName || event._tileId > 0));
        if (!map3D()) return sprite ? "" : "image";
        const look = lookOf(type);
        if (!look || !look.spec) return sprite ? "" : "model";
        // The model's cache entry is looked up once it exists and kept: only its `failed` mark is read after.
        if (!look.cached || look.cached.failed) {
            const R = world();
            look.cached = (R && R._glbCache && R.specCacheKey && R._glbCache[R.specCacheKey(look.spec)]) || null;
        }
        return look.cached && look.cached.failed ? "model" : "";
    };

    /**
     * Whether a ground vehicle nobody rides stands in water deeper than it wades ("sunk"). It can be boarded there (by
     * a swimmer who has dived down to it, too) and walked out along the bed: it runs again once it is out. The bed
     * it is going down to counts while it is still sinking.
     */
    const waterRule = function(type, event) {
        if (!event || !type || event._rrBoarded || (type.medium && type.medium !== "ground") || !map3D()) return "";
        const R = world();
        if (!R || !R.waterSurfaceAt || !R.hasWater || !R.hasWater($dataMap)) return "";
        const level = R.waterSurfaceAt($dataMap, event._realX + 0.5, event._realY + 0.5);
        if (level === null || level === undefined) return "";
        const wade = type.handling && type.handling.wade >= 0 ? type.handling.wade : 0.45;
        const stands = Number.isFinite(event._rrSink) ? event._rrSink : groundOf(event);
        return level - stands > wade ? "sunk" : "";
    };

    /** Whether a vehicle stands under water deeper than it wades: where it sank, until it is walked or put out of it. */
    V.sunk = function(event) {
        return !!(event && event._rrVehicle && waterRule(V.type(event._rrVehicle), event));
    };

    /**
     * Why this version does not ride a vehicle here: "" when it does. In this order: the project's switch ("free"),
     * its type ("type", "kind"), the map ("flat", "loop", "firstPerson"), its model ("model").
     */
    V.scenery = function(event) {
        if (!V.free()) return "free";
        const type = event ? V.type(event._rrVehicle) : null;
        return kindRule(type) || mapRule() || modelRule(type,event);
    };

    /**
     * A vehicle of this map: an event, an event id, an identity "<mapId>:<eventId>", "ridden", "nearest", or a name
     * (`rrVehicle.key`; of several that carry it, the nearest to the leader).
     */
    V.find = function(what) {
        if (what && typeof what === "object") return V.isVehicle(what) ? what : null;
        const map = typeof $gameMap !== "undefined" ? $gameMap : null;
        if (!map) return null;
        if (typeof what === "number") { const event = map._events[what]; return V.isVehicle(event) ? event : null; }
        const name = String(what == null ? "" : what).trim();
        if (!name) return null;
        if (name === "ridden") return V.ridden();
        const identity = /^(\d+):(\d+)$/.exec(name);
        if (identity) {
            return V.list().find(event => V.idOf(event) === name && V.isVehicle(event)) || null;
        }
        const list = V.list(), p = player();
        let best = null, bestGap = Infinity;
        for (let i = 0; i < list.length; i++) {
            const event = list[i];
            if (!V.isVehicle(event) || (name !== "nearest" && kept.keys[i] !== name)) continue;
            const gap = p ? Math.hypot(event._realX - p._realX, event._realY - p._realY) : i;
            if (gap < bestGap) { best = event; bestGap = gap; }
        }
        return best;
    };

    /** Where a vehicle is: `{ map, x, y, z, yaw }`, tiles as `_realX`, degrees. From its event, else from the registry. */
    V.where = function(what) {
        const event = V.find(what);
        if (event) {
            return { map: event._mapId, x: round3(event._realX), y: round3(event._realY),
                z: round3(groundOf(event) + (event._rrFree ? 0 : event._reactorLift || 0)), yaw: round3(V.degrees(headingOf(event))) };
        }
        const store = registry(false), entry = store && typeof what === "string" ? store.at[what.trim()] : null;
        return entry && !entry.gone ? { map: entry.map, x: entry.x, y: entry.y, z: entry.z, yaw: entry.yaw } : null;
    };

    //-------------------------------------------------------------------------
    // Riding: the one invariant, and what the engine asks of a vehicle.

    const aboard = function(on, instant) {
        // In a battle on the map each unit gets on and off for itself: the leader's doing so moves nobody else.
        if (fightHere()) return;
        const p = player(), followers = p && p._followers;
        // The ride ends for the followers that rode vehicles of their own, too: each is parked where it stands.
        if (!on && V.Convoy) V.Convoy.disband();
        if (followers && typeof followers.rrAboard === "function") followers.rrAboard(on, instant);
    };

    const emit = function(name, event) {
        if (typeof ReactorEvents === "undefined" || !ReactorEvents || typeof ReactorEvents.emit !== "function") return;
        ReactorEvents.emit(name, { vehicle: V.idOf(event), type: event._rrVehicle || 0, eventId: event._eventId });
    };

    const sound = function(name) {
        if (V.Feel && typeof V.Feel.sound === "function") V.Feel.sound(name);
    };

    /** A ride that ends while the mover has the screen dipped to put the vehicle back (`_rrDrive.fade`) gives the screen back. */
    const endDip = function(p) {
        const drive = p._rrDrive;
        if (drive && drive.fade > 0 && typeof $gameScreen !== "undefined" && $gameScreen) $gameScreen.startFadeIn(drive.fade);
    };

    /** The ride that began ends: the vehicle's `getOff()` and the event, once. */
    const endRide = function(event) {
        if (!riding) return;
        riding = false;
        if (!event) return;
        sound("stop");
        if (typeof event.getOff === "function") event.getOff();
        emit("vehicleGetOff", event);
    };

    /**
     * The party on foot where it stands. Plain assignments on the player; the map's data and its events' data are
     * not read, so it is safe while a transfer has already loaded the next map.
     */
    V.putOnFoot = function() {
        const p = player();
        if (!p) return;
        const was = p._rrWas, event = carried;
        p._vehicleType = "walk";
        p._rrFree = 0;
        p._rrSeated = false;
        endDip(p);
        p._rrDrive = null;
        p._rrMount = null;
        p._rrRide = null;
        p._reactorRiding = false;
        p._reactorAir = 0;
        p._reactorVz = 0;
        if (was) { p._moveSpeed = was.speed; p._transparent = !!was.transparent; }
        p._rrWas = null;
        keep = 0; noRoom = 0; carried = null;
        if (event) { event._rrBoarded = false; event._reactorRiding = false; if (event._rrFree === 2) event._rrFree = 1; }
        aboard(false, true);
        endRide(event);
    };

    /**
     * The ridden vehicle's event, or null. While `_vehicleType` is "reactor" this answers an event of this map that
     * is a vehicle, has a page in force and is boarded; when there is none the party is put on foot first, so no
     * caller of `vehicle()` meets a null while `isInVehicle()` is true.
     */
    V.ridden = function() {
        const p = player();
        if (!p || p._vehicleType !== "reactor") return null;
        if (rebuilding) return carried;
        const ride = p._rrRide, map = $gameMap;
        if (ride && ride.map === map._mapId) {
            // While no map's data is loaded (a scene reads it again) the data is not asked: it decides once it is back.
            // Nor on the way to another map: the data loaded may already be that map's (a border crossed without a break).
            const event = map._events[ride.id], data = p._transferring && p._newMapId !== map._mapId ? null : mapData();
            if (event && event._rrVehicle > 0 && !event._erased && event._pageIndex >= 0 && event._rrBoarded
                && (!data || (data.events && data.events[ride.id]))) {
                if (carried !== event) {
                    // Another object than the one known (a save loaded, the map's events made again): its ride has
                    // begun unless the hop on is still playing.
                    carried = event;
                    riding = !(p._rrMount && p._rrMount.on);
                }
                return event;
            }
        }
        V.putOnFoot();
        return null;
    };

    V.isRiding = function(query) {
        const event = V.ridden();
        if (!event) return false;
        if (query == null || query === "") return true;
        if (typeof query === "object") return query.type == null || event._rrVehicle === Number(query.type);
        const name = String(query);
        return name === V.idOf(event) || kept.keys[indexOf(event)] === name;
    };

    /** Tiles a second, signed; 0 on foot. */
    V.speed = function() {
        const p = player(), drive = p && p._vehicleType === "reactor" ? p._rrDrive : null;
        return drive && Number.isFinite(drive.v) ? drive.v : 0;
    };

    /** The carried event takes the player's place, heights and heading, and is walked through. Counts a change. */
    const carry = function(event, p) {
        const drive = p._rrDrive;
        let changed = event._realX !== p._realX || event._realY !== p._realY || event._reactorGround !== p._reactorGround || event._reactorAir !== p._reactorAir;
        event._x = p._x; event._y = p._y;
        event._realX = p._realX; event._realY = p._realY;
        event._direction = p._direction; event._reactorDir8 = p._reactorDir8;
        event._reactorGround = p._reactorGround; event._reactorAlt = p._reactorAlt;
        event._reactorAir = p._reactorAir; event._reactorVz = p._reactorVz;
        event._reactorRiding = true;
        event._through = true;
        if (drive && Number.isFinite(drive.yaw) && event._rrYaw !== drive.yaw) { event._rrYaw = drive.yaw; changed = true; }
        if (changed) event._rrPose = (event._rrPose || 0) + 1;
    };

    /** The page's own Through, for a vehicle that stands by itself again. */
    const pageThrough = function(event) {
        const data = mapData(), authored = data && data.events ? data.events[event._eventId] : null;
        const page = authored && authored.pages ? authored.pages[event._pageIndex] : null;
        return !!(page && page.through);
    };

    /** A vehicle's lift is spent the first time it is ridden or placed: where it stood lifted is the ground it stands on. */
    const spendLift = function(event) {
        const R = world(), P = physics();
        let ground = groundOf(event);
        const lift = Number(event._reactorLift) || 0;
        if (lift > 0) {
            let best = ground + lift, gap = 0.5;
            const levels = P && P.levelsAt && map3D() ? P.levelsAt($dataMap, Math.round(event._realX), Math.round(event._realY)) : null;
            if (levels) for (let i = 0; i < levels.length; i++) {
                const off = Math.abs(levels[i].top - (ground + lift));
                if (off < gap) { gap = off; best = levels[i].top; }
            }
            ground = best;
        } else if (!Number.isFinite(ground)) ground = R && map3D() ? R.groundHeightAt($dataMap, event._realX + 0.5, event._realY + 0.5) : 0;
        event._reactorGround = ground; event._reactorAlt = ground;
        event._reactorLift = 0; event._reactorZTarget = 0;
        return ground;
    };

    /**
     * Parks a vehicle where it stands: held by nobody, solid again, its place written. Its heading, height and
     * pitch are kept.
     */
    V.park = function(event) {
        if (!event) return;
        event._rrFree = 1;
        event._x = Math.round(event._realX); event._y = Math.round(event._realY);
        if (Number.isFinite(event._rrYaw)) face(event, event._rrYaw);
        event._through = pageThrough(event);
        event._rrSpeed = 0;
        event._reactorAir = 0; event._reactorVz = 0;
        event._rrPose = (event._rrPose || 0) + 1;
        if (V.Drive && typeof V.Drive.leave === "function") V.Drive.leave(event);
        note(event, false);
    };

    /** Whether the party can be put down on a tile: a place to stand near that height, and nobody's body on it. */
    const canStand = function(x, y, ground, out) {
        if (!$gameMap.isValid(x, y)) return false;
        const R = world(), P = physics(), p = player();
        let height = ground;
        if (P && P.standingAt && map3D()) {
            const at = P.standingAt($dataMap, x, y, ground, STAND);
            if (at === null) return false;
            height = at;
        } else if (!$gameMap.checkPassage(x, y, 0x0f)) return false;
        if (map3D() && R && R.bodyBlocksTile) { if (R.bodyBlocksTile(p, x, y, true)) return false; }
        else if ($gameMap.eventsXyNt(x, y).some(event => event.isNormalPriority())) return false;
        if (out) out[2] = height;
        return true;
    };
    const STAND = { within: 1 };

    const coversTile = function(event, x, y) {
        if (event._x === x && event._y === y) return true;
        const R = world();
        return !!(map3D() && R && R.eventBodyCovers && R.eventBodyCovers(event, x, y));
    };

    /**
     * Where the leader gets off a parked vehicle: left of it (its body's radius and 0.8 tile from its middle), then
     * right, behind and ahead (half its length and 0.8); the first tile there that is no tile of the vehicle itself,
     * has a place to stand and is free of bodies. `out` is filled with `[x, y, ground]`; null when no side has one.
     */
    const SIDES = [0, 0, 0, 0, 0, 0, 0, 0];
    V.landingSpot = function(event, out) {
        out = out || [0, 0, 0];
        const yaw = Number.isFinite(event._rrYaw) ? event._rrYaw : facingOf(event);
        const type = V.type(event._rrVehicle);
        const mx = event._realX + 0.5, my = event._realY + 0.5;
        const fx = Math.sin(yaw), fy = -Math.cos(yaw), lx = fy, ly = -fx;
        const side = map3D() ? (type && type.body && type.body.radius > 0 ? type.body.radius : 0.45) + 0.8 : 1, end = map3D() ? dimsOf(type).length / 2 + 0.8 : 1;
        const ground = groundOf(event);
        SIDES[0] = lx * side; SIDES[1] = ly * side; SIDES[2] = -lx * side; SIDES[3] = -ly * side;
        SIDES[4] = -fx * end; SIDES[5] = -fy * end; SIDES[6] = fx * end; SIDES[7] = fy * end;
        for (let n = 0; n < 4; n++) {
            const ox = SIDES[n * 2], oy = SIDES[n * 2 + 1], reach = Math.hypot(ox, oy);
            let lastX = NaN, lastY = NaN;
            // Outward past whatever of that side the vehicle's own body still covers.
            for (let more = 0; more <= 1.5; more += 0.5) {
                const scale = (reach + more) / reach;
                const x = $gameMap.roundX(Math.floor(mx + ox * scale)), y = $gameMap.roundY(Math.floor(my + oy * scale));
                if (x === lastX && y === lastY) continue;
                lastX = x; lastY = y;
                if (coversTile(event, x, y)) continue;
                if (canStand(x, y, ground, out)) { out[0] = x; out[1] = y; return out; }
                break;
            }
        }
        return null;
    };

    /** Tile passage and authored 3D water for the selected travel medium. */
    V.surfacePassable = function(type, x, y) {
        if (!$gameMap.isValid(x,y)) return false;
        if (type.medium === "air") return true;
        if (type.medium !== "water") return $gameMap.checkPassage(x,y,0x0f);
        const R=world();
        if (map3D() && R.waterSurfaceAt && Number.isFinite(R.waterSurfaceAt($dataMap,x+0.5,y+0.5))) return true;
        return type.passability === "ship" ? $gameMap.isShipPassable(x,y) : $gameMap.isBoatPassable(x,y);
    };

    /** Whether the vehicle body fits at a heading and the nearest standing height. */
    V.fits = function(event, x, y, radians, height) {
        if (!event || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        const R = world(), type = V.type(event._rrVehicle);
        if (!map3D() || type && type.medium !== "ground") {
            const tx = $gameMap.roundX(Math.round(x)), ty = $gameMap.roundY(Math.round(y));
            if (!$gameMap.isValid(tx,ty)) return false;
            if (type && type.medium === "air") return true;
            if (type && !V.surfacePassable(type,tx,ty)) return false;
            if ((!type || type.medium === "ground") && !$gameMap.checkPassage(tx,ty,0x0f)) return false;
            return !$gameMap.eventsXyNt(tx,ty).some(other => other !== event && other.isNormalPriority());
        }
        const from = Number.isFinite(height) ? height : groundOf(event);
        const was = [event._x, event._y, event._realX, event._realY, event._direction, event._reactorDir8, event._rrFree, event._through];
        const p = player(), ignoreRider = p && event._rrBoarded && p._rrRide && p._rrRide.map === event._mapId && p._rrRide.id === event._eventId;
        const through = p && p._through;
        if (ignoreRider) p._through = true;
        try {
            event._x = Math.round(x); event._y = Math.round(y); event._realX = x; event._realY = y;
            if (Number.isFinite(radians)) face(event, radians);
            event._rrFree = 1;
            // Its middle's tile has a place to stand (a tile off the map has none); then every tile of its body is on the
            // map, has one within a step of that, and is free of bodies.
            const P = physics(), deep = !!(P && P.standingAt && map3D());
            const near = deep ? P.standingAt($dataMap, event._x, event._y, from, null) : 0;
            let ok = !(deep && near === null);
            const shape = ok && R && R.eventBody ? R.eventBody(event) : null;
            if (shape) {
                for (let j = 0; ok && j < shape.h; j++) for (let i = 0; ok && i < shape.w; i++) {
                    if (shape.cells !== null && !shape.cells[j * shape.w + i]) continue;
                    const tx = event._x + shape.ox + i, ty = event._y + shape.oy + j;
                    if (!$gameMap.isValid(tx, ty) || (deep && P.standingAt($dataMap, tx, ty, near, STAND) === null)) ok = false;
                }
                if (ok && R.bodyFits && !R.bodyFits(event, event._x, event._y)) ok = false;
            } else if (ok && (!$gameMap.isValid(event._x, event._y) || $gameMap.eventsXyNt(event._x, event._y).some(other => other !== event && other.isNormalPriority()))) ok = false;
            return ok;
        } finally {
            event._x = was[0]; event._y = was[1]; event._realX = was[2]; event._realY = was[3];
            event._direction = was[4]; event._reactorDir8 = was[5]; event._rrFree = was[6]; event._through = was[7];
            if (ignoreRider) p._through = through;
        }
    };

    /**
     * Puts a parked vehicle with its middle on (x + 0.5, y + 0.5), facing `degrees`. False where its body does not
     * fit. Where a tile has several floors it arrives on the lowest it can stand on, as a transfer lands on the
     * ground floor, whatever height it stood at before; with `z` (a height, as `where()` answers it), on the floor
     * nearest that.
     */
    V.setLocation = function(what, x, y, degrees, z) {
        x = number(x); y = number(y);
        const asked = number(degrees), height = number(z);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        const name = typeof what === "string" ? what.trim() : what;
        let event = V.find(name);
        if (!event && typeof name === "string") {
            // One that was taken out of the world comes back where it is put: found by its identity among this
            // map's vehicle events, whatever event id it has here.
            const gone = /^\d+:\d+$/.test(name) ? V.list().find(other => V.idOf(other) === name) : null;
            if (gone && gone._rrVehicle > 0 && gone._erased) event = gone;
        }
        if (!event) return false;
        if (event._rrBoarded || event === carried) return false;
        const radians = Number.isFinite(asked) ? V.radians(asked) : headingOf(event);
        const erased = event._erased;
        const P = physics(), deep = !!(P && P.standingAt && map3D());
        const ground = deep ? P.standingAt($dataMap, Math.round(x), Math.round(y), Number.isFinite(height) ? height : undefined, null) : 0;
        if (ground === null || !V.fits(event, x, y, radians, ground)) return false;
        if (erased) { event._erased = false; event.refresh(); }
        place(event, x, y, deep ? world().groundHeightAt($dataMap, x + 0.5, y + 0.5, ground) : 0, V.degrees(radians));
        event._through = pageThrough(event);
        note(event, false);
        offer.stamp = -1;
        return true;
    };

    /**
     * Puts a vehicle of the Vehicles page (`identity`, `0:<number>`) on tile (x, y) of any map, wherever it is now:
     * what Set Vehicle Location does for it. On this map it is moved (`setLocation`); from this map to another it
     * leaves and waits there; from another map to this one it appears. Its heading is kept. False for one that is
     * ridden, that the Database does not have, or that does not fit there.
     */
    V.moveTo = function(identity, mapId, x, y) {
        const map = typeof $gameMap !== "undefined" ? $gameMap : null, data = mapData();
        identity = String(identity == null ? "" : identity).trim();
        mapId = Math.floor(number(mapId)); x = Math.floor(number(x)); y = Math.floor(number(y));
        if (!map || !/^0:\d+$/.test(identity) || !(mapId > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        const live = V.list().find(event => V.idOf(event) === identity) || null;
        if (live && (live._rrBoarded || live === carried)) return false;
        const store = registry(true);
        if (mapId === map._mapId) {
            if (live) {
                // Here already, or one of this map's that is away or was taken out: it stands here again.
                const yaw = V.degrees(headingOf(live));
                if (live._erased) { live._erased = false; live._rrAway = false; live.refresh(); }
                place(live, x, y, undefined, yaw);
                live._reactorGround = undefined; live._reactorAlt = undefined;
                live._through = pageThrough(live);
                note(live, false);
                offer.stamp = -1;
                return true;
            }
            // On another map until now: its event is made on this one.
            const entry = store.at[identity], authored = entry && entry.event ? copy(entry.event) : models().placementOf && models().placementOf(root.$dataReactorVehicles, identity);
            if (!authored || !data || !Array.isArray(data.events)) return false;
            const vacancy = data.events.findIndex((row, index) => index > 0 && !row), id = vacancy > 0 ? vacancy : Math.max(1, data.events.length);
            authored.id = id; authored.x = x; authored.y = y; authored._rrVehicleIdentity = identity;
            data.events[id] = authored;
            const event = map._events[id] = new Game_Event(map._mapId, id);
            if (!mark(event, authored)) { map._events[id] = null; data.events[id] = null; return false; }
            event.refresh();
            place(event, x, y, undefined, entry && Number.isFinite(entry.yaw) ? entry.yaw : V.degrees(event._rrYaw));
            event._reactorGround = undefined; event._reactorAlt = undefined;
            event._through = pageThrough(event);
            // (The map's own list of its events is made once a frame: an event made now is not in it until the next.)
            rebuild(map);
            if (kept.list.indexOf(event) < 0) { kept.list.push(event); kept.board.push("ok"); kept.keys.push(""); kept.types.push(V.type(event._rrVehicle)); }
            note(event, false);
            const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null, sprites = scene && scene._spriteset;
            if (sprites && typeof sprites.rrAddCharacter === "function") sprites.rrAddCharacter(event);
            offer.stamp = -1;
            return true;
        }
        // To another map: it waits there. One that stands on this map leaves it.
        let entry = store.at[identity];
        if (live && !live._erased) { note(live, false); entry = store.at[identity]; }
        if (!entry) {
            const authored = models().placementOf && models().placementOf(root.$dataReactorVehicles, identity);
            if (!authored) return false;
            entry = store.at[identity] = { map: mapId, x, y, z: null, yaw: authored.rrVehicle.yaw, type: authored.rrVehicle.type, home: [authored.x, authored.y] };
        }
        if (!entry.event) {
            const authored = (live && live._rrAuthored) || (models().placementOf && models().placementOf(root.$dataReactorVehicles, identity));
            if (authored) entry.event = copy(authored);
        }
        Object.assign(entry, { map: mapId, x, y, z: null });
        delete entry.gone;
        if (live && !live._erased) { live._rrAway = true; live.erase(); rebuild(map); }
        offer.stamp = -1;
        return true;
    };

    /** Takes a parked vehicle out of the world; it is put back by `setLocation`. */
    V.remove = function(what) {
        const event = V.find(what);
        if (!event || event._rrBoarded) return false;
        note(event, true);
        event.erase();
        offer.stamp = -1;
        return true;
    };

    //-------------------------------------------------------------------------
    // Which vehicle OK would board.

    const offer = { event: null, stamp: -1 };
    const NEAR = { x: 0, z: 0 };

    const heightOf = character => (Number.isFinite(character._reactorGround) ? character._reactorGround : 0) + (character._reactorLift || 0) + (character._reactorAir > 0 ? character._reactorAir : 0);

    /** How far a point of the ground is from a vehicle's body, with the nearest point of the body left in NEAR. */
    const gapTo = function(R, event, wx, wz) {
        const shape = R && R.eventBody ? R.eventBody(event) : null;
        // A vehicle that stands off the grid has its body marked round its own tile; one that glides is where it is drawn.
        const off = event._rrFree || !shape || !shape.model;
        const bx = (off ? event._x : event._realX) + (shape ? shape.ox : 0), bz = (off ? event._y : event._realY) + (shape ? shape.oy : 0);
        const w = shape ? shape.w : 1, h = shape ? shape.h : 1, cells = shape ? shape.cells : null;
        let best = Infinity;
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                if (cells !== null && !cells[j * w + i]) continue;
                const cx = wx < bx + i ? bx + i : wx > bx + i + 1 ? bx + i + 1 : wx;
                const cz = wz < bz + j ? bz + j : wz > bz + j + 1 ? bz + j + 1 : wz;
                const d = Math.hypot(cx - wx, cz - wz);
                if (d < best) { best = d; NEAR.x = cx; NEAR.z = cz; }
            }
        }
        return best;
    };

    const hasList = function(data, event) {
        if (event._erased || event._pageIndex < 0) return false;
        const authored = data && data.events ? data.events[event._eventId] : null;
        const page = authored && authored.pages ? authored.pages[event._pageIndex] : null;
        return !!(page && page.list && page.list.length > 1);
    };

    // The events whose body is more than their own tile, each with how far from its own tile a tile of it can lie.
    // Asking an event for its body costs a few microseconds the first time in a frame, and a map has dozens of
    // events and a handful of big ones: only those are asked, and of those only the ones near the tile in question.
    // `events` is the map's events as `$gameMap.events()` answers them. The map's own array is never walked by
    // index: it has a slot for every id up to the highest, and a map's props are numbered from 10000 up.
    const big = { events: null, stamp: -1, list: [], far: [] };
    const bigBodies = function(map, R, events) {
        const tick = Graphics.frameCount >= 0 ? Graphics.frameCount : -1;
        if (big.events === map._events && tick >= 0 && big.stamp >= 0 && tick >= big.stamp && tick - big.stamp < V.BODIES) return big.list;
        big.events = map._events; big.stamp = tick; big.list.length = 0; big.far.length = 0;
        // Without the 3D runtime every body is its own tile.
        if (!R || !R.eventBody) return big.list;
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (event._erased || event._rrFree === 2) continue;
            // A sized event is its rectangle whatever it is drawn as; a model, the tiles under it.
            const shape = R.eventBody(event);
            if (!(shape.count > 1 || shape.ox !== 0 || shape.oy !== 0)) continue;
            big.list.push(event);
            // The engine's own bound for it at any facing, gliding or turning; without one, its reach turned a corner
            // and a tile more.
            const held = event._reactorBody;
            big.far.push(held && held.far >= shape.reach ? held.far : Math.ceil(shape.reach * Math.SQRT2) + 1);
        }
        return big.list;
    };

    /** Whether a press of OK starts an event: its trigger and priority are the press's, its page has commands, and it is no vehicle OK boards. */
    const pressed = function(event, data, normal, except) {
        if (event === except || event._erased) return false;
        const trigger = event._trigger;
        if (normal ? trigger !== 0 && trigger !== 1 && trigger !== 2 : trigger !== 0) return false;
        if ((event._priorityType === 1) !== normal || !hasList(data, event)) return false;
        // A vehicle OK boards is not started by the press: its page is not what the press is for.
        const at = event._rrVehicle > 0 ? indexOf(event) : -1;
        return !(at >= 0 && kept.board[at] !== "command");
    };

    /**
     * Whether a press of OK would start an event on a tile: normal priority and an action or touch trigger, or one
     * under or over the party. `events` is the map's events, listed once for the whole look.
     */
    const pressStarts = function(events, data, x, y, normal, except) {
        // Whoever has that tile as its own, by plain counting.
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (event._x === x && event._y === y && pressed(event, data, normal, except)) return true;
        }
        // A body that is more than its tile: asked only when it is near enough for a tile of it to lie there, and
        // still one of the map's events (the list of them is up to `BODIES` ticks old).
        const bodies = big.list, own = big.events;
        for (let i = 0; i < bodies.length; i++) {
            const event = bodies[i], far = big.far[i];
            if (event._x - x > far || x - event._x > far || event._y - y > far || y - event._y > far) continue;
            if (own[event._eventId] === event && pressed(event, data, normal, except) && event.pos(x, y)) return true;
        }
        return false;
    };

    /** Whether the tile the leader faces (and the one past a counter) holds an event OK would start. */
    const pressAhead = function(map, events, data, p, except) {
        const d = p._direction;
        const x2 = map.roundXWithDirection(p._x, d), y2 = map.roundYWithDirection(p._y, d);
        if (pressStarts(events, data, x2, y2, true, except)) return true;
        // Whether that tile is a counter is asked only when somebody stands past it: the map makes a list of the
        // tile's layers to answer.
        return pressStarts(events, data, map.roundXWithDirection(x2, d), map.roundYWithDirection(y2, d), true, except) && map.isCounter(x2, y2);
    };

    const doorNear = function(R, map, data, p) {
        if (!R || typeof R.doorAt !== "function" || !data) return false;
        const d = p._direction;
        return !!(R.doorAt(data, map.roundXWithDirection(p._x, d), map.roundYWithDirection(p._y, d)) || R.doorAt(data, p._x, p._y));
    };

    /** On foot and free to board: no event, no message, not climbing or in the air, no battle on the map. (A swimmer is free: what it may board is `pick`'s to say.) */
    const partyFree = function(p, map, busy) {
        if (p._vehicleType !== "walk" || p._rrMount) return false;
        if (p._reactorOnLadder || p._reactorMantle) return false;
        // In the air as the physics counts it: a jump or a fall, not a step down.
        if (!p._reactorSwim && !p._reactorRiding && !p._reactorStepDown && (p._reactorAir > 0.02 || p._reactorVz > 0)) return false;
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        if (fight && fight.isHere()) return false;
        if (busy) return true;
        // An event that runs, by the map's interpreter. This is asked every drawn frame while a label may show, so
        // the map's events are not gone through for one that is only starting: no press is read on such a tick.
        const interpreter = map._interpreter;
        return !(interpreter && interpreter.isRunning()) && !$gameMessage.isBusy();
    };

    const pick = function(p, map) {
        const list = kept.list, R = world(), data = mapData();
        if (!R || !data || !V.free() || mapRule()) return null;
        if (!map3D()) {
            const dx = map.roundXWithDirection(p.x,p.direction()), dy = map.roundYWithDirection(p.y,p.direction());
            const candidate = list.find((event,i) => !event._erased && event._pageIndex >= 0 && kept.board[i] !== "command" &&
                !V.scenery(event) && (event.pos(dx,dy) || event.pos(p.x,p.y)));
            if (!candidate || map.eventsXy(dx,dy).some(other => other !== candidate && !V.isVehicle(other) && other.isNormalPriority() && other.isTriggerIn([0,1,2]))) return null;
            const battler = V.battler(candidate);
            return battler && battler.isDead() ? null : candidate;
        }
        const wx = p._realX + 0.5, wz = p._realY + 0.5, height = heightOf(p), facing = facingOf(p);
        const within = Math.cos(V.FACING * RAD), sin = Math.sin(facing), cos = Math.cos(facing);
        let best = null, bestGap = Infinity, bestFaced = false;
        for (let i = 0; i < list.length; i++) {
            const event = list[i], type = kept.types[i];
            // One that is no longer among the map's events (taken out of its array by other code) is no vehicle here.
            if (event._erased || event._pageIndex < 0 || kept.board[i] === "command" || !type || map._events[event._eventId] !== event) continue;
            // Too far by plain counting for any part of it to be in reach: nothing of its body is asked.
            const far = (type.model && type.model.size > 0 ? type.model.size : 4) + V.REACH + 1;
            if (Math.abs(event._realX + 0.5 - wx) > far || Math.abs(event._realY + 0.5 - wz) > far) continue;
            // A swimmer boards only a vehicle that lies under the water, and only from down beside it: dived to.
            if (p._reactorSwim) {
                if (!waterRule(type, event)) continue;
                if (Math.abs(heightOf(event) - (Number.isFinite(p._reactorAlt) ? p._reactorAlt : height)) > V.REACH_HEIGHT + 1) continue;
            } else if (Math.abs(heightOf(event) - height) > V.REACH_HEIGHT) continue;
            const gap = gapTo(R, event, wx, wz);
            if (gap > V.REACH) continue;
            // The direction to the nearest point of its body against his facing; on its body he faces it.
            const dx = NEAR.x - wx, dz = NEAR.z - wz, length = Math.hypot(dx, dz);
            const faced = length < 1e-6 || (dx * sin - dz * cos) / length >= within - 1e-9;
            if (!(faced === bestFaced ? gap < bestGap : faced) || kindRule(type) || modelRule(type,event)) continue;
            const battler = V.battler(event);
            if (battler && battler.isDead()) continue;
            best = event; bestGap = gap; bestFaced = faced;
        }
        if (!best) return null;
        // With a vehicle in reach the map's events are listed, once for this look.
        const events = map.events();
        bigBodies(map, R, events);
        // Someone on the tile he faces keeps the press, whichever way the vehicle lies.
        if (pressAhead(map, events, data, p, best)) return null;
        // Not faced, it answers only when the press has nothing else to do.
        if (!bestFaced && (pressStarts(events, data, p._x, p._y, false, best) || doorNear(R, map, data, p))) return null;
        return best;
    };

    /**
     * The vehicle OK boards now, or null. Looked for every `LOOK` ticks while a vehicle event is on the map; between
     * looks the answer is kept, and it is null the moment the party is not free. `now` looks at once.
     */
    V.offered = function(now) {
        const map = $gameMap;
        if (!map) return null;
        if (kept.events !== map._events) rebuild(map);
        if (!kept.list.length) return null;
        const p = $gamePlayer;
        if (!p || !partyFree(p, map, false)) return null;
        const frames = Graphics.frameCount, tick = frames >= 0 ? frames : -1;
        if (now || tick < 0 || offer.stamp < 0 || tick < offer.stamp || tick - offer.stamp >= V.LOOK) {
            offer.stamp = tick;
            offer.event = pick(p, map);
        }
        const event = offer.event;
        return event && event._rrVehicle > 0 && !event._erased && event._pageIndex >= 0 ? event : null;
    };

    /**
     * What the label says now: `{ event, word, action }`, or null. On foot, the word of the vehicle OK boards;
     * aboard, the leaving word while a press to get off is kept, and the "no room" word (no key: `action` is "")
     * after a place to stand was not found. The same object every time: read it, do not keep it.
     */
    const PROMPT = { event: null, word: "", action: "ok" };
    V.prompt = function() {
        const p = player();
        if (!p) return null;
        if (p._vehicleType === "reactor") {
            const event = p._rrMount ? null : V.ridden();
            if (!event) return null;
            const drive = p._rrDrive;
            if (noRoom > 0) { PROMPT.event = event; PROMPT.word = V.term("noRoom"); PROMPT.action = ""; return PROMPT; }
            if (!drive || drive.leave !== "ok") return null;
            PROMPT.event = event; PROMPT.word = V.words(V.type(event._rrVehicle)).leave; PROMPT.action = "cancel";
            return PROMPT;
        }
        const event = V.offered(false);
        if (!event) return null;
        PROMPT.event = event; PROMPT.word = V.words(kept.types[kept.list.indexOf(event)]).prompt; PROMPT.action = "ok";
        return PROMPT;
    };

    //-------------------------------------------------------------------------
    // Getting on and off: the two hops as state.

    const ease = k => k * k * (3 - 2 * k);

    /** Whether a vehicle's own model says where its rider sits (the Rig tool's Vehicle rider): a seat that was placed, not one guessed for its kind. */
    const seatPlaced = function(event) {
        const R = world(), holder = R && typeof R.modelHolderFor === "function" ? R.modelHolderFor(event) : null;
        const block = holder && holder.object ? holder.object.__reactorVehicle : null;
        if (block) return Array.isArray(block.seats) && !!block.seats[0] && !!block.seats[0].seat && !(block.wants && block.wants.seats);
        // (Its model is not built yet: the file as it was read.)
        const type = V.type(event._rrVehicle), json = type && type.model && R && R._sidecarJson ? R._sidecarJson[type.model.name] : null;
        const seats = json && json.vehicle && Array.isArray(json.vehicle.seats) ? json.vehicle.seats : null;
        return !!(seats && seats[0] && seats[0].seat);
    };

    /**
     * The rider nobody draws on the seat: the vehicle's Rider setting says inside; or it says nothing, its kind
     * keeps its rider inside and its model places no seat; or the leader has no model. Left to itself, a seat placed
     * on the model shows its rider there, whatever the kind.
     */
    /** Whether a vehicle keeps its rider inside it (its Rider setting; left to itself, its kind unless its model places a seat). */
    V.riderInside = function(event) {
        if (!event || !(event._rrVehicle > 0)) return false;
        const type = V.type(event._rrVehicle), record = root.$dataReactorVehicles ? root.$dataReactorVehicles[event._rrVehicle] : null;
        const own = record && (record.rider === "seat" || record.rider === "inside") ? record.rider : "";
        return own === "inside" || (!own && !!type && type.rider === "inside" && !seatPlaced(event));
    };

    const hidesRider = function(type, p, event) {
        if (!map3D()) return true;
        if (event && V.riderInside(event)) return true;
        const R = world();
        return !!(R && R.characterModelSpec && map3D() && !R.characterModelSpec(p));
    };

    /** Tick 0 of the hop on. The vehicle stays where it is, solid; the player stands still and is moved by the hop. */
    const board = function(event, instant) {
        const p = player();
        if (!p || !V.isVehicle(event) || p._vehicleType !== "walk" || p._rrMount || (fightHere() && !fightBoards) || V.scenery(event)) return false;
        const battler = V.battler(event);
        if (battler && battler.isDead()) return false;
        const yaw = headingOf(event);
        event._rrYaw = yaw;
        p._rrWas = { speed: p._moveSpeed, transparent: !!p._transparent };
        p._vehicleType = "reactor";
        p._rrRide = { map: $gameMap._mapId, id: event._eventId };
        p._rrSeated = true;
        p._rrFree = 1;
        p._rrDrive = { v: 0, steer: 0, yaw, vz: 0, pitch: 0, roll: 0, travel: 0, leave: "", rest: 0, foot: 0, grid: 0, dry: null };
        // Boarded where it sank: it is walked along the bed, and runs again when it is out of the water.
        if (V.sunk(event)) p._rrDrive.flooded = true;
        p._reactorSwim = false; p._reactorDive = 0;
        p._rrMount = { t: 0, n: V.HOP, on: true, drawn: false, fx: p._realX, fy: p._realY, fz: p._rrDrive.flooded && Number.isFinite(p._reactorAlt) ? p._reactorAlt : groundOf(p), fyaw: facingOf(p),
            tx: event._realX, ty: event._realY, tz: groundOf(event) + (event._reactorLift || 0) };
        p._x = Math.round(event._realX); p._y = Math.round(event._realY);
        event._rrBoarded = true;
        event._rrFree = 1;
        event._rrSpeed = 0;
        event._rrPose = (event._rrPose || 0) + 1;
        carried = event; riding = false; keep = 0; noRoom = 0;
        offer.event = null; offer.stamp = -1;
        if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp.clearDestination) $gameTemp.clearDestination();
        aboard(true, false);
        if (instant) V.settle();
        return true;
    };

    /** Tick 14 of the hop on: seated. The vehicle is carried from here. */
    const seat = function(event, p) {
        const ground = spendLift(event);
        event._rrFree = 2;
        event._through = true;
        event._x = Math.round(event._realX); event._y = Math.round(event._realY);
        p._realX = event._realX; p._realY = event._realY; p._x = event._x; p._y = event._y;
        if (p._rrDrive) { p._rrDrive.yaw = event._rrYaw; p._rrDrive.v = 0; p._rrDrive.leave = ""; }
        face(p, event._rrYaw);
        p._reactorGround = ground; p._reactorAlt = ground; p._reactorAir = 0; p._reactorVz = 0;
        p._reactorRiding = true; event._reactorRiding = true;
        if (hidesRider(V.type(event._rrVehicle), p, event)) p._transparent = true;
        p._rrMount = null;
        event._rrPose = (event._rrPose || 0) + 1;
        if (V.Drive && typeof V.Drive.board === "function") V.Drive.board(event);
        riding = true;
        sound("start");
        event.getOn();
        V.Convoy.form();
        emit("vehicleGetOn", event);
        if (V.Hints && typeof V.Hints.note === "function") V.Hints.note("boarded");
    };

    /** Tick 14 of the hop off: on foot on the tile, facing the way the vehicle faces. */
    const alight = function(event, p, mount) {
        const was = p._rrWas;
        p._rrSeated = false;
        p._rrFree = 0;
        p._vehicleType = "walk";
        p._rrRide = null;
        event._rrBoarded = false;
        if (was) { p._moveSpeed = was.speed; p._transparent = !!was.transparent; }
        p._rrWas = null;
        p._reactorRiding = false; event._reactorRiding = false;
        p._x = mount.tx; p._y = mount.ty; p._realX = mount.tx; p._realY = mount.ty;
        const ground = Number.isFinite(mount.tz) ? mount.tz : groundOf(p);
        p._reactorGround = ground; p._reactorAlt = ground; p._reactorAir = 0; p._reactorVz = 0;
        face(p, Number.isFinite(event._rrYaw) ? event._rrYaw : mount.fyaw);
        endDip(p);
        p._rrDrive = null;
        p._rrMount = null;
        keep = 0; noRoom = 0; carried = null;
        event._rrPose = (event._rrPose || 0) + 1;
        if (p.makeEncounterCount) p.makeEncounterCount();
        aboard(false, false);
        endRide(event);
    };

    /**
     * One tick of a hop: the player's place eases to where the hop ends, and the last tick seats the party or puts
     * it on foot. A hop that is only drawn (a battle began aboard) counts its ticks and moves nothing.
     */
    V.hop = function() {
        const p = player(), mount = p && p._rrMount;
        if (!mount) return;
        mount.t++;
        if (mount.drawn) {
            if (mount.t >= mount.n) p._rrMount = null;
            return;
        }
        const event = V.ridden();
        if (!event) return;
        const k = ease(Math.min(1, mount.t / mount.n));
        if (mount.on) { mount.tx = event._realX; mount.ty = event._realY; mount.tz = groundOf(event) + (event._reactorLift || 0); }
        p._realX = mount.fx + (mount.tx - mount.fx) * k;
        p._realY = mount.fy + (mount.ty - mount.fy) * k;
        if (Number.isFinite(mount.fz) && Number.isFinite(mount.tz)) {
            p._reactorGround = mount.fz + (mount.tz - mount.fz) * k;
            if (Number.isFinite(p._reactorAlt)) p._reactorAlt = p._reactorGround;
        }
        event._rrPose = (event._rrPose || 0) + 1;
        if (mount.t < mount.n) return;
        if (mount.on) seat(event, p);
        else alight(event, p, mount);
    };

    /** Finishes a hop at once: seated, or on foot on its tile. */
    V.settle = function() {
        const p = player();
        for (let guard = 0; p && p._rrMount && guard < 64; guard++) V.hop();
    };


    //-------------------------------------------------------------------------
    // The convoy: followers who ride vehicles of their own behind the leader.
    //
    // When the leader is seated, each follower in the line takes the nearest free vehicle within `CONVOY_REACH`
    // tiles of the leader's (one that could be boarded: not sunk, not scenery, nobody on it); a follower with none
    // rides unseen, as before. A convoy vehicle is not driven: it rides the leader's own trail, `CONVOY_GAP` behind
    // the one ahead, at the heights, headings and leans the leader had there, so it goes wherever the leader went
    // and nowhere else. When the ride ends, each is parked where it stands and its rider is on foot with the others.
    // What is saved is on the followers (`_rrRide`, `_rrSeated`) and the events (`_rrBoarded`); the trail is not.

    /** Tiles from the leader's vehicle within which a follower finds one of its own. */
    // (About what the party sees round it: at 10, vehicles parked along one street 11 to 16 tiles apart left a follower without.)
    V.CONVOY_REACH = 20;
    /** Tiles between two vehicles of the convoy, bumper to bumper. */
    V.CONVOY_GAP = 1.5;

    const Convoy = V.Convoy = {};
    // Set while a battle's own Mount boards the leader: a battle on the map refuses every other boarding.
    let fightBoards = false;
    /** The leader gets on a vehicle during a battle on the map, at once: a unit's Mount. False when it cannot. */
    V.boardInFight = function(event) {
        fightBoards = true;
        try { const on = board(event, true); if (on) V.settle(); return on; } finally { fightBoards = false; }
    };
    /** One follower takes a vehicle of its own, at once. False for a vehicle that is taken or is none. */
    V.seatFollower = function(follower, event) {
        if (!follower || !V.isVehicle(event) || event._rrBoarded || event._erased) return false;
        convoySeat(follower, event);
        return true;
    };
    /** One follower gets off its vehicle, which is parked where it stands; the vehicle, or null. The follower is left where it is. */
    V.unseatFollower = function(follower) {
        if (!follower || (!follower._rrSeated && !follower._rrRide)) return null;
        const ride = follower._rrRide, map = typeof $gameMap !== "undefined" ? $gameMap : null;
        const event = ride && map && ride.map === map._mapId ? map._events[ride.id] : null;
        follower._rrSeated = false; follower._rrRide = null; follower._reactorRiding = false; follower._rrFree = 0;
        if (!event || !event._rrVehicle) return null;
        event._rrBoarded = false; event._reactorRiding = false;
        event._rrLean = 0; event._rrSteer = 0;
        if (!event._erased) { V.park(event); convoySettle(event, null); }
        return event;
    };
    // The leader's trail, newest last: places it was (x, y: tiles as `_realX`), its height, heading, pitch and lean
    // there, and `s`, the road it had ridden by then. `total` is the road ridden now.
    const trail = { list: [], total: 0, x: NaN, y: NaN, map: 0 };
    /** The trail itself, for whoever draws or checks it: read it, do not change it. */
    Convoy.trail = trail;

    const convoyFollowers = function() {
        const p = player(), followers = p && p._followers, data = followers && followers._data;
        return Array.isArray(data) ? data : [];
    };

    /** The followers that ride, in the line's order, each with its vehicle: `[{ follower, event }]`. */
    Convoy.riders = function() {
        const out = [], map = typeof $gameMap !== "undefined" ? $gameMap : null;
        if (!map) return out;
        for (const follower of convoyFollowers()) {
            const ride = follower._rrSeated ? follower._rrRide : null;
            const event = ride && ride.map === map._mapId ? map._events[ride.id] : null;
            if (event && event._rrVehicle && event._rrBoarded && !event._erased) out.push({ follower, event });
        }
        return out;
    };

    const convoySeat = function(follower, event) {
        follower._rrRide = { map: $gameMap._mapId, id: event._eventId };
        follower._rrSeated = true;
        follower._rrLeave = 0; follower._rrAppear = 0;
        if (follower.setOpacity) follower.setOpacity(255);
        follower._realX = event._realX; follower._realY = event._realY; follower._x = Math.round(event._realX); follower._y = Math.round(event._realY);
        follower._reactorGround = groundOf(event); follower._reactorAlt = follower._reactorGround; follower._reactorAir = 0; follower._reactorVz = 0;
        follower._reactorRiding = true; follower._rrFree = 1;
        if (!Number.isFinite(event._rrYaw)) event._rrYaw = headingOf(event);
        face(follower, event._rrYaw);
        event._rrBoarded = true;
        event._rrFree = 2;
        event._through = true;
        event._rrSpeed = 0;
        event._reactorRiding = true;
        event._rrPose = (event._rrPose || 0) + 1;
    };

    /** The leader is seated: each follower of the line that finds a free vehicle near takes it. Returns how many did. */
    Convoy.form = function() {
        const p = player(), lead = V.ridden(), followers = p && p._followers;
        trail.list.length = 0; trail.total = 0; trail.x = NaN; trail.y = NaN; trail.map = $gameMap ? $gameMap._mapId : 0;
        if (fightHere()) return 0;
        if (!p || !lead || !map3D() || !followers || (followers.isVisible && !followers.isVisible())) return 0;
        const leadType = V.type(lead._rrVehicle);
        if (leadType && leadType.medium && leadType.medium !== "ground") return 0;
        const free = V.list().filter(event => event !== lead && V.isVehicle(event) && !event._rrBoarded && !V.scenery(event) && !V.sunk(event)
            && !(V.battler(event) && V.battler(event).isDead())
            && Math.hypot(event._realX - lead._realX, event._realY - lead._realY) <= V.CONVOY_REACH
            && (() => { const type = V.type(event._rrVehicle); return !type || !type.medium || type.medium === "ground"; })());
        let seated = 0;
        for (const follower of convoyFollowers()) {
            if (!free.length) break;
            if (follower._rrOrder || follower._rrHidden || !(follower.actor && follower.actor())) continue;
            // The one nearest to where this follower stands.
            let best = 0, gap = Infinity;
            for (let i = 0; i < free.length; i++) { const d = Math.hypot(free[i]._realX - follower._realX, free[i]._realY - follower._realY); if (d < gap) { gap = d; best = i; } }
            convoySeat(follower, free.splice(best, 1)[0]);
            seated++;
        }
        if (seated) offer.stamp = -1;
        return seated;
    };

    /** The ride is over: each convoy vehicle is parked where it stands, and its rider is a follower on foot again. */
    Convoy.disband = function() {
        for (const follower of convoyFollowers()) {
            if (!follower._rrSeated && !follower._rrRide) continue;
            const ride = follower._rrRide, map = typeof $gameMap !== "undefined" ? $gameMap : null;
            const event = ride && map && ride.map === map._mapId ? map._events[ride.id] : null;
            follower._rrSeated = false; follower._rrRide = null; follower._reactorRiding = false; follower._rrFree = 0;
            if (!event || !event._rrVehicle) continue;
            event._rrBoarded = false; event._reactorRiding = false;
            event._rrLean = 0; event._rrSteer = 0;
            if (!event._erased) { V.park(event); convoySettle(event, follower); }
        }
        trail.list.length = 0; trail.total = 0; trail.x = NaN; trail.y = NaN;
    };

    /**
     * A convoy vehicle is left where the trail had it, which is where the leader went: off a bank, out over a lake.
     * One left above the ground comes down to it (`sinkTick`: it falls through the air and goes down slowly through
     * water), and its rider is on foot at the height it had, for the map's own fall or swim to take from there.
     */
    const convoySettle = function(event, follower) {
        const R = world();
        if (!map3D() || !R || !R.groundHeightAt) return;
        const alt = Number.isFinite(event._reactorAlt) ? event._reactorAlt : groundOf(event);
        const bed = R.groundHeightAt($dataMap, event._realX + 0.5, event._realY + 0.5, alt);
        if (!Number.isFinite(bed) || alt - bed < 0.05) return;
        // Where it will stand is what is kept of it (a map left and come back to finds it there).
        event._reactorGround = bed; event._reactorAlt = bed;
        note(event, false);
        event._reactorGround = alt; event._reactorAlt = alt;
        event._rrSink = bed;
        event._rrPose = (event._rrPose || 0) + 1;
        if (follower) { follower._reactorGround = bed; follower._reactorAlt = alt; follower._reactorAir = alt - bed; follower._reactorVz = 0; }
    };

    /** The place on the trail `s` tiles of road from its start, into `at` (x, y, alt, yaw, pitch, roll); false before its first place. */
    const trailAt = function(s, at) {
        const list = trail.list, n = list.length;
        if (!n || s < list[0].s) return false;
        let hi = n - 1;
        if (s >= list[hi].s) { Object.assign(at, list[hi]); return true; }
        let lo = 0;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (list[mid].s <= s) lo = mid; else hi = mid; }
        const a = list[lo], b = list[hi], k = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
        at.x = a.x + (b.x - a.x) * k; at.y = a.y + (b.y - a.y) * k; at.alt = a.alt + (b.alt - a.alt) * k;
        // (The short way round from one heading to the next.)
        at.yaw = a.yaw + (turn360((b.yaw - a.yaw) / RAD + 180) - 180) * RAD * k;
        at.pitch = a.pitch + (b.pitch - a.pitch) * k; at.roll = a.roll + (b.roll - a.roll) * k;
        return true;
    };
    const AT = { x: 0, y: 0, alt: 0, yaw: 0, pitch: 0, roll: 0, s: 0 };

    /**
     * One tick of the convoy, after the leader's own: where the leader is goes onto the trail, and each convoy
     * vehicle is put on the trail behind the one ahead of it. One that has not reached the trail yet (it stood
     * beside it when the ride began) rides to it. `speed` is the leader's, signed.
     */
    Convoy.follow = function(p, lead, speed) {
        const riders = Convoy.riders();
        if (!riders.length || !lead) return;
        const map = $gameMap, x = p._realX, y = p._realY;
        const alt = Number.isFinite(p._reactorAlt) ? p._reactorAlt : groundOf(p);
        // A leader put somewhere else (a transfer on this map): the trail begins again there, the convoy with it.
        const jumped = Number.isFinite(trail.x) && Math.hypot(x - trail.x, y - trail.y) > 3;
        if (trail.map !== map._mapId || jumped) {
            trail.list.length = 0; trail.total = 0; trail.map = map._mapId;
            if (jumped) for (const rider of riders) { rider.event._realX = x; rider.event._realY = y; }
        }
        const list = trail.list, last = list[list.length - 1];
        const moved = Number.isFinite(trail.x) && !jumped ? Math.hypot(x - trail.x, y - trail.y) : 0;
        trail.x = x; trail.y = y;
        if (speed < 0 && moved > 0) {
            // Backing up: the road is given back, and the convoy backs up along it.
            trail.total = Math.max(list.length ? list[0].s : 0, trail.total - moved);
            while (list.length > 1 && list[list.length - 1].s > trail.total) list.pop();
        } else if (!last || moved > 0) {
            trail.total += moved;
            const yaw = Number.isFinite(lead._rrYaw) ? lead._rrYaw : 0;
            const sample = { x, y, alt, yaw, pitch: Number(lead._rrPitch) || 0, roll: Number(lead._rrLean) || 0, s: trail.total };
            // A place a tenth of a tile on from the last kept; nearer, the newest is moved up to here.
            if (!last || list.length < 2 || trail.total - list[list.length - 2].s >= 0.1) list.push(sample); else list[list.length - 1] = sample;
        }
        let back = dimsOf(V.type(lead._rrVehicle)).length / 2;
        for (let i = 0; i < riders.length; i++) {
            const event = riders[i].event, follower = riders[i].follower;
            const half = dimsOf(V.type(event._rrVehicle)).length / 2;
            back += half + V.CONVOY_GAP;
            const wasX = event._realX, wasY = event._realY;
            let nx = wasX, ny = wasY, height = Number.isFinite(event._reactorAlt) ? event._reactorAlt : groundOf(event), yaw = event._rrYaw, pitch = 0, roll = 0;
            if (trailAt(trail.total - back, AT)) {
                const gap = Math.hypot(AT.x - wasX, AT.y - wasY);
                // On the trail it is where the trail is; off it (the ride began, or the trail began again) it rides to it.
                const reach = Math.max(Math.abs(speed) * 1.5, 6) / 60;
                if (gap <= reach || event._rrOnTrail) {
                    nx = AT.x; ny = AT.y; height = AT.alt; yaw = AT.yaw; pitch = AT.pitch; roll = AT.roll;
                    event._rrOnTrail = gap <= Math.max(reach, 1.5);
                } else {
                    nx = wasX + (AT.x - wasX) * reach / gap; ny = wasY + (AT.y - wasY) * reach / gap;
                    yaw = Math.atan2(AT.x - wasX, -(AT.y - wasY));
                    const R = world();
                    if (R && R.groundHeightAt) height = R.groundHeightAt($dataMap, nx + 0.5, ny + 0.5, height);
                }
            } else event._rrOnTrail = false;
            back += half;
            const went = Math.hypot(nx - wasX, ny - wasY);
            if (went === 0 && event._rrSpeed === 0 && follower._realX === nx && follower._realY === ny) continue;
            event._realX = nx; event._realY = ny; event._x = Math.round(nx); event._y = Math.round(ny);
            event._rrYaw = yaw; event._rrPitch = pitch; event._rrLean = roll; event._rrSteer = 0;
            event._rrTravel = (Number(event._rrTravel) || 0) + (speed < 0 ? -went : went);
            event._rrSpeed = went * 60 * (speed < 0 ? -1 : 1);
            event._reactorGround = height; event._reactorAlt = height; event._reactorAir = 0; event._reactorVz = 0;
            event._through = true; event._rrFree = 2;
            face(event, yaw);
            event._rrPose = ((event._rrPose | 0) + 1) % 1000000000;
            follower._realX = nx; follower._realY = ny; follower._x = event._x; follower._y = event._y;
            follower._reactorGround = height; follower._reactorAlt = height; follower._reactorAir = 0; follower._reactorVz = 0;
            follower._reactorRiding = true;
            face(follower, yaw);
            follower._rrPose = event._rrPose;
        }
        // The road behind the last of them is of no more use.
        const keep = trail.total - back - 4;
        let drop = 0;
        while (drop < list.length - 2 && list[drop + 1].s < keep) drop++;
        if (drop) list.splice(0, drop);
    };

    /** The trail and the convoy's places counted from another map's corner: the map entered over a border (`dx`, `dy` tiles). */
    Convoy.shift = function(dx, dy, mapId) {
        for (const sample of trail.list) { sample.x -= dx; sample.y -= dy; }
        if (Number.isFinite(trail.x)) { trail.x -= dx; trail.y -= dy; }
        trail.map = mapId;
    };

    /** After a map's events were made (a transfer, a save loaded): the followers that ride are on their vehicles again. */
    Convoy.resume = function(moved) {
        const map = typeof $gameMap !== "undefined" ? $gameMap : null;
        if (!map) return;
        const list = V.list();
        for (const follower of convoyFollowers()) {
            if (!follower._rrSeated) continue;
            const identity = follower._rrConvoy, ride = follower._rrRide;
            const event = identity ? list.find(other => V.idOf(other) === identity && !other._erased) : ride && ride.map === map._mapId ? map._events[ride.id] : null;
            follower._rrConvoy = undefined;
            if (!event || !event._rrVehicle || !player() || player()._vehicleType !== "reactor") {
                follower._rrSeated = false; follower._rrRide = null; follower._reactorRiding = false; follower._rrFree = 0;
                continue;
            }
            const at = moved && moved[identity];
            if (at) { event._realX = at[0]; event._realY = at[1]; event._reactorGround = at[2]; event._reactorAlt = at[2]; event._rrYaw = at[3]; event._rrOnTrail = true; }
            convoySeat(follower, event);
            if (at) { follower._reactorGround = at[2]; follower._reactorAlt = at[2]; }
        }
    };

    /** How fast a vehicle goes down through water, in tiles a tick. */
    V.SINK = 0.03;

    /**
     * The ridden vehicle is in water deeper than it wades (`bed`: the ground under it). Its rider is in the water
     * where the vehicle is, on foot at once, afloat where the water is deep; the vehicle is nobody's and goes down
     * to the bed (`sinkTick`), where it stays until it is boarded there and walked out, or put somewhere else.
     * False when nobody rides, or a hop on or off is under way.
     */
    V.sink = function(bed, quiet) {
        const p = player(), event = V.ridden();
        if (!p || !event || p._vehicleType !== "reactor" || p._rrMount) return false;
        const drive = p._rrDrive;
        const alt = drive && Number.isFinite(drive.alt) ? drive.alt : groundOf(event);
        const falling = drive && drive.air > 0 && drive.vz < 0 ? drive.vz : 0;
        const floor = Number.isFinite(bed) ? Math.min(bed, alt) : alt;
        V.park(event);
        // The rider, as `alight` leaves it, but where it is and at the height it has: the water takes it from here.
        const was = p._rrWas;
        p._rrSeated = false;
        p._rrFree = 0;
        p._vehicleType = "walk";
        p._rrRide = null;
        event._rrBoarded = false;
        if (was) { p._moveSpeed = was.speed; p._transparent = !!was.transparent; }
        p._rrWas = null;
        p._reactorRiding = false; event._reactorRiding = false;
        p._x = Math.round(p._realX); p._y = Math.round(p._realY); p._realX = p._x; p._realY = p._y;
        p._reactorGround = floor; p._reactorAlt = alt; p._reactorAir = alt - floor; p._reactorVz = falling;
        if (Number.isFinite(event._rrYaw)) face(p, event._rrYaw);
        endDip(p);
        p._rrDrive = null;
        p._rrMount = null;
        keep = 0; noRoom = 0; carried = null;
        if (p.makeEncounterCount) p.makeEncounterCount();
        aboard(false, true);
        endRide(event);
        // The vehicle: where it will stand is what is kept of it (a map left and come back to finds it on the bed).
        event._reactorGround = floor; event._reactorAlt = floor;
        note(event, false);
        event._reactorGround = alt; event._reactorAlt = alt;
        event._rrSink = floor;
        event._rrPose = (event._rrPose || 0) + 1;
        offer.event = null; offer.stamp = -1;
        // (Got off a vehicle already lying under water, nothing sank: nothing is said.)
        if (!quiet) emit("vehicleSink", event);
        return true;
    };

    /** One tick of a vehicle going down to the bed it sinks to. */
    V.sinkTick = function(event) {
        const to = event._rrSink;
        if (!Number.isFinite(to)) { event._rrSink = undefined; falls.delete(event); return; }
        const from = Number.isFinite(event._reactorAlt) ? event._reactorAlt : to;
        // Above the water (or where there is none) it falls; in the water it goes down slowly.
        const R = world(), level = R && R.waterSurfaceAt && map3D() ? R.waterSurfaceAt($dataMap, event._realX + 0.5, event._realY + 0.5) : null;
        const wet = level !== null && level !== undefined && Number.isFinite(level);
        let step = V.SINK;
        if (!wet || from > level) {
            step = Math.min(V.FALL_MAX, (falls.get(event) || 0) + V.FALL);
            falls.set(event, step);
            // It meets the water at the surface, and goes on from there at the water's pace.
            if (wet && from - step < level && level > to) step = from - level;
        } else falls.delete(event);
        const height = from - step > to ? from - step : to;
        event._reactorGround = height; event._reactorAlt = height; event._reactorAir = 0; event._reactorVz = 0;
        event._rrPose = (event._rrPose || 0) + 1;
        if (height <= to) { event._rrSink = undefined; falls.delete(event); }
    };
    /** How much faster a vehicle nobody rides falls each tick through the air, and the fastest it falls, in tiles a tick. */
    V.FALL = 0.012;
    V.FALL_MAX = 0.6;
    // How fast each falling vehicle is falling now (not saved: one loaded in mid-air starts its fall again).
    const falls = new WeakMap();

    /**
     * The party gets off a vehicle that is slow enough: it is parked first, then a place beside it is looked for.
     * With none it is carried again, the buzzer plays and the label says so.
     */
    const SPOT = [0, 0, 0];
    const dismount = function(event, p) {
        const drive = p._rrDrive;
        if (drive) { drive.leave = ""; drive.v = 0; }
        keep = 0;
        // Under water there is no tile to step onto: the rider lets go of it where it is and is in the water.
        if (drive && drive.flooded) return V.sink(Number.isFinite(drive.alt) ? drive.alt : groundOf(event), true);
        V.park(event);
        const spot = V.landingSpot(event, SPOT);
        if (!spot) {
            event._rrFree = 2;
            event._through = true;
            noRoom = V.KEEP;
            if (typeof SoundManager !== "undefined" && SoundManager.playBuzzer) SoundManager.playBuzzer();
            return false;
        }
        const was = p._rrWas;
        if (was) p._transparent = !!was.transparent;
        p._rrMount = { t: 0, n: V.HOP, on: false, drawn: false, fx: p._realX, fy: p._realY, fz: groundOf(p),
            fyaw: Number.isFinite(event._rrYaw) ? event._rrYaw : facingOf(p), tx: spot[0], ty: spot[1], tz: spot[2] };
        p._x = spot[0]; p._y = spot[1];
        noRoom = 0;
        return true;
    };

    const slowEnough = function(p) {
        const drive = p._rrDrive;
        return !(drive && Math.abs(drive.v || 0) >= V.SLOW) && !(p._reactorAir > 0.02) && !(drive && drive.air > 0);
    };

    /** A press to get off: kept while the vehicle slows by itself; the hop starts with it when it is slow already. */
    const leave = function() {
        const p = player(), event = V.ridden();
        if (!event) return false;
        const mount = p._rrMount;
        if (mount) return !mount.on;
        if (!p._rrDrive) p._rrDrive = { v: 0, steer: 0, yaw: event._rrYaw, vz: 0, pitch: 0, roll: 0, travel: 0, leave: "", rest: 0, foot: 0, grid: 0, dry: null };
        p._rrDrive.leave = "ok";
        keep = V.KEEP; noRoom = 0;
        slowFrom = NaN; downFrom = NaN;
        if (slowEnough(p)) dismount(event, p);
        return true;
    };

    /** One tick aboard, after the vehicle has taken the player's place: the kept press, and the word that runs out. */
    const aboardTick = function(event, p) {
        if (noRoom > 0) noRoom--;
        const drive = p._rrDrive;
        if (!drive || drive.leave !== "ok" || p._rrMount) return;
        // A press a save carried is kept from the tick the game goes on.
        if (keep <= 0) keep = V.KEEP;
        // While the vehicle still answers the press (it slows, or it comes down to land) the press does not run out.
        const speed = Math.abs(drive.v || 0), height = drive.air > 0 && Number.isFinite(drive.alt) ? drive.alt : NaN;
        const answering = speed < slowFrom - 1e-9 || height < downFrom - 1e-9;
        slowFrom = speed; downFrom = height;
        if (!answering && --keep <= 0) { drive.leave = ""; return; }
        if (slowEnough(p)) dismount(event, p);
    };

    /** Boards a vehicle by name, identity or event. False when it cannot be boarded here. */
    V.getOn = function(what, options) {
        const event = V.find(what), p = player();
        if (!event || !p) return false;
        const far = Math.hypot(event._realX - p._realX, event._realY - p._realY) > V.HOP_REACH + dimsOf(V.type(event._rrVehicle)).length / 2;
        return board(event, !!(options && options.instant) || far);
    };

    /**
     * The party goes aboard the boat, the ship or the airship (`type`), wherever on this map it stands: it is put
     * where RPG Maker boards from (on the airship's tile; on a tile beside a boat or a ship, facing it), and RPG
     * Maker's own boarding does the rest. False when the vehicle is on another map, switched off as rideable, has
     * no tile beside it to board from, or the party already rides something.
     */
    V.getOnStock = function(type) {
        const p = player(), map = typeof $gameMap !== "undefined" ? $gameMap : null;
        const vehicle = map && typeof map.vehicle === "function" ? map.vehicle(type) : null;
        if (!p || !vehicle || p._vehicleType !== "walk" || p._rrMount || vehicle._mapId !== map._mapId) return false;
        const entry = root.$dataSystem && root.$dataSystem[type] && root.$dataSystem[type].reactorVehicle;
        if (entry && entry.ridable === false) return false;
        if (type === "airship") {
            if (p.x !== vehicle.x || p.y !== vehicle.y) p.setPosition(vehicle.x, vehicle.y);
        } else {
            // Beside it already: turned to it. Else onto the first tile beside it that can be stood on.
            const sides = [[0, 1, 8], [-1, 0, 6], [1, 0, 4], [0, -1, 2]];
            let from = sides.find(side => p.x === vehicle.x + side[0] && p.y === vehicle.y + side[1]);
            if (!from) {
                from = sides.find(side => map.isValid(vehicle.x + side[0], vehicle.y + side[1]) && map.checkPassage(vehicle.x + side[0], vehicle.y + side[1], 0x0f));
                if (!from) return false;
                p.setPosition(vehicle.x + from[0], vehicle.y + from[1]);
            }
            p.setDirection(from[2]);
        }
        return !!p.getOnVehicle();
    };

    /** Gets the party off: braking first, then the hop. With `instant` at once, and false when there is nowhere to stand. */
    V.getOff = function(options) {
        const p = player();
        if (!p || p._vehicleType !== "reactor") return false;
        if (!(options && options.instant)) return leave();
        V.settle();
        if (p._vehicleType !== "reactor") return true;
        const event = V.ridden();
        if (!event) return true;
        if (!dismount(event, p)) return false;
        V.settle();
        return true;
    };

    /** Whether a hop is running or a press to get off is kept: what the wait mode waits for. */
    V.isBusy = function() {
        const p = player();
        if (!p) return false;
        if (p._rrMount && !p._rrMount.drawn) return true;
        return p._vehicleType === "reactor" && !!p._rrDrive && p._rrDrive.leave === "ok";
    };

    /**
     * After the map's events were made again, or a save was loaded: the ridden vehicle is found by `_rrRide` and
     * holds the carried state. Returns it, or null on foot.
     */
    V.bind = function() {
        const p = player();
        if (!p || p._vehicleType !== "reactor") return null;
        const ride = p._rrRide, map = $gameMap;
        const event = ride && ride.map === map._mapId ? map._events[ride.id] : null;
        if (event && event._rrVehicle > 0 && !event._erased && event._pageIndex >= 0) {
            event._rrBoarded = true;
            const mount = p._rrMount;
            // In a hop the vehicle stands by itself; seated, it is carried.
            if (mount && !mount.drawn) event._rrFree = 1;
            else { event._rrFree = 2; carry(event, p); }
        }
        return V.ridden();
    };

    //-------------------------------------------------------------------------
    // OK aboard: someone to act on, before getting off.

    // A line over the grid from a point: the tiles it passes through, in order, each with how far along the line it
    // begins. A tile is in a reach when it begins within it, whichever way the line runs. One kept record per line.
    const line = () => ({ x: 0, y: 0, t: 0, stepX: 0, stepY: 0, nextX: 0, nextY: 0, perX: 0, perY: 0 });
    const AHEAD = line(), LEFT = line(), RIGHT = line();
    const lineFrom = function(ray, mx, my, dx, dy) {
        ray.x = Math.floor(mx); ray.y = Math.floor(my); ray.t = 0;
        ray.stepX = dx > 0 ? 1 : -1; ray.stepY = dy > 0 ? 1 : -1;
        // A direction that runs along one axis crosses no line of the other.
        ray.perX = Math.abs(dx) > 1e-9 ? 1 / Math.abs(dx) : Infinity;
        ray.perY = Math.abs(dy) > 1e-9 ? 1 / Math.abs(dy) : Infinity;
        ray.nextX = ray.perX === Infinity ? Infinity : (dx > 0 ? ray.x + 1 - mx : mx - ray.x) * ray.perX;
        ray.nextY = ray.perY === Infinity ? Infinity : (dy > 0 ? ray.y + 1 - my : my - ray.y) * ray.perY;
    };
    /** Moves a line onto its next tile; false when that tile begins further than `reach` from where the line starts. */
    const lineNext = function(ray, reach) {
        const alongX = ray.nextX <= ray.nextY, t = alongX ? ray.nextX : ray.nextY;
        if (!(t <= reach + 1e-6)) return false;
        if (alongX) { ray.x += ray.stepX; ray.nextX += ray.perX; } else { ray.y += ray.stepY; ray.nextY += ray.perY; }
        ray.t = t;
        return true;
    };

    /** Starts what a press of OK would start on a tile (`events`: the map's, listed once for the press); true when an event is starting. */
    const actOn = function(events, x, y, normal, except) {
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (event === except || event._erased || event._rrBoarded) continue;
            const trigger = event._trigger;
            if (normal ? trigger !== 0 && trigger !== 1 && trigger !== 2 : trigger !== 0) continue;
            if (event.isNormalPriority() !== normal || !event.pos(x, y)) continue;
            event.start();
        }
        return $gameMap.isAnyEventStarting() && $gameMap.setupStartingEvent();
    };

    /**
     * Whoever the rider can act on from the saddle: under the vehicle's middle; then ahead along its heading, every
     * tile that begins within half its length and a tile and a half of its middle (one tile further past a
     * counter); then, stopped or nearly, every tile that begins within a tile and a half of its middle to either
     * side, the nearer first and its left before its right. The same tiles whichever way it heads. True when an
     * event started: that was the press.
     */
    const actAboard = function(event, p) {
        if ($gameMap.isEventRunning()) return false;
        const mx = p._realX + 0.5, my = p._realY + 0.5, events = $gameMap.events();
        if (actOn(events, Math.floor(mx), Math.floor(my), false, event)) return true;
        const yaw = Number.isFinite(event._rrYaw) ? event._rrYaw : facingOf(p);
        const fx = Math.sin(yaw), fy = -Math.cos(yaw);
        let reach = dimsOf(V.type(event._rrVehicle)).length / 2 + V.AHEAD, counter = false;
        lineFrom(AHEAD, mx, my, fx, fy);
        while (lineNext(AHEAD, reach)) {
            if (actOn(events, AHEAD.x, AHEAD.y, true, event)) return true;
            // A counter on the last tile in reach passes the reach on by one tile, once.
            if (!counter && Math.min(AHEAD.nextX, AHEAD.nextY) > reach + 1e-6 && $gameMap.isCounter(AHEAD.x, AHEAD.y)) { counter = true; reach += 1; }
        }
        if (Math.abs(V.speed()) >= V.SLOW) return false;
        lineFrom(LEFT, mx, my, fy, -fx);
        lineFrom(RIGHT, mx, my, -fy, fx);
        let left = lineNext(LEFT, V.ASIDE), right = lineNext(RIGHT, V.ASIDE);
        while (left || right) {
            const ray = left && (!right || LEFT.t <= RIGHT.t) ? LEFT : RIGHT;
            if (actOn(events, ray.x, ray.y, true, event)) return true;
            if (ray === LEFT) left = lineNext(LEFT, V.ASIDE); else right = lineNext(RIGHT, V.ASIDE);
        }
        return false;
    };

    //-------------------------------------------------------------------------
    // A battle that starts on the map while the party is aboard.

    /**
     * Before the battle places anyone: the hop is finished, the vehicle is parked where it is, and the party is on
     * foot beside it (on its own tile, and then clear of its body, when no side is free). The leader's hop is only
     * drawn from here on.
     */
    const dismountForBattle = function() {
        const p = player();
        V.settle();
        const event = p._vehicleType === "reactor" ? V.ridden() : null;
        if (!event) return;
        const fx = p._realX, fy = p._realY, fz = groundOf(p), fyaw = Number.isFinite(event._rrYaw) ? event._rrYaw : facingOf(p);
        if (p._rrDrive) p._rrDrive.v = 0;
        V.park(event);
        const spot = V.landingSpot(event, SPOT);
        const tx = spot ? spot[0] : event._x, ty = spot ? spot[1] : event._y, tz = spot ? spot[2] : groundOf(event);
        p._x = tx; p._y = ty; p._realX = tx; p._realY = ty;
        face(p, fyaw);
        sound("bump");
        V.putOnFoot();
        p._reactorGround = tz; p._reactorAlt = tz;
        const R = world();
        if (!spot && R && R.freePartyOfBodies) R.freePartyOfBodies();
        p._rrMount = { t: 0, n: V.HOP, on: false, drawn: true, fx, fy, fz, fyaw, tx: p._x, ty: p._y, tz: groundOf(p) };
        event._rrPose = (event._rrPose || 0) + 1;
    };

    V.dismountForBattle = dismountForBattle;

    /**
     * A ride whose vehicle type was written over from outside (`$gamePlayer._vehicleType = "walk"`, the usual line to
     * force a party out of a vehicle) while everything else still said aboard: the vehicle is parked where it is and
     * the party is on foot beside it, or on its tile and then clear of its body. The type that was written is kept.
     */
    const strand = function(p) {
        const written = p._vehicleType, ride = p._rrRide, map = typeof $gameMap !== "undefined" ? $gameMap : null;
        // The event of this map the saved ride names (after a load the one known here is the game's before it).
        const found = ride && map && ride.map === map._mapId ? map._events[ride.id]
            : carried && map && map._events[carried._eventId] === carried ? carried : null;
        const event = found && found._rrVehicle > 0 && !found._erased ? found : null;
        if (event) {
            carried = event;
            V.park(event);
            const spot = V.landingSpot(event, SPOT);
            const tx = spot ? spot[0] : event._x, ty = spot ? spot[1] : event._y, tz = spot ? spot[2] : groundOf(event);
            p._x = tx; p._y = ty; p._realX = tx; p._realY = ty;
            if (Number.isFinite(event._rrYaw)) face(p, event._rrYaw);
            V.putOnFoot();
            p._reactorGround = tz; p._reactorAlt = tz;
            const R = world();
            if (!spot && R && R.freePartyOfBodies) R.freePartyOfBodies();
            event._rrPose = (event._rrPose || 0) + 1;
        } else {
            V.putOnFoot();
        }
        p._vehicleType = written;
    };

    /** A battle on the battle screen: the vehicle is at a standstill when the party comes back to it. */
    const halt = function() {
        const p = player();
        if (!p || p._vehicleType !== "reactor") return;
        V.settle();
        const event = V.ridden(), drive = p._rrDrive;
        if (drive) { drive.v = 0; drive.leave = ""; }
        if (event) event._rrSpeed = 0;
        keep = 0;
    };

    //-------------------------------------------------------------------------
    // What the engine's own code is given.

    const cancelPressed = function() {
        return Input.isTriggered("cancel") || TouchInput.isCancelled();
    };
    let cancelFrame = -1;
    const cancelRide = function(p) {
        if (!p || p._vehicleType !== "reactor" || !V.ridden() || !cancelPressed()) return false;
        if (cancelFrame !== Graphics.frameCount) {
            // Escape is also the menu key. Keep ownership through the last tick of a dismount, when the player
            // becomes a walker before the scene checks its menu, and never request the same landing twice.
            cancelFrame = Graphics.frameCount;
            if (!p._rrMount && p.canMove()) leave();
        }
        return true;
    };

    const installPlayer = function() {
        if (typeof Game_Player === "undefined" || Game_Player.prototype.isInVehicle.__rrVehicles) return;
        const proto = Game_Player.prototype;

        const isInVehicle = proto.isInVehicle;
        proto.isInVehicle = function() {
            if (this._vehicleType === "reactor") return V.ridden() !== null;
            return isInVehicle.call(this);
        };
        proto.isInVehicle.__rrVehicles = true;

        // On foot, OK boards the vehicle the label shows for. The engine's scripted vehicle toggle still gets
        // the party off aboard; anything else is the boat's, the ship's and the airship's own.
        const getOnOffVehicle = proto.getOnOffVehicle;
        proto.getOnOffVehicle = function() {
            if (this._vehicleType === "reactor") {
                if (V.ridden()) return leave();
            } else if (this._vehicleType === "walk" && V.any()) {
                // A command asks while its own event runs: the pick is made without that. A press looks afresh: the
                // look the label keeps is up to five ticks old, and he may have turned to someone since.
                const busy = $gameMap.isEventRunning() || $gameMessage.isBusy();
                const event = busy ? (partyFree(this, $gameMap, true) ? pick(this, $gameMap) : null) : V.offered(true);
                if (event && board(event, false)) return true;
            }
            return getOnOffVehicle.call(this);
        };

        // Aboard, Cancel gets off and OK is for whoever is in reach: neither falls through to the stock vehicle
        // toggle or a door beside the player's own tile.
        const triggerButtonAction = proto.triggerButtonAction;
        proto.triggerButtonAction = function() {
            if (this._vehicleType !== "reactor") return triggerButtonAction.call(this);
            if (cancelRide(this)) return true;
            if (!Input.isTriggered("ok")) return false;
            const event = V.ridden();
            if (!event) return triggerButtonAction.call(this);
            actAboard(event, this);
            return true;
        };

        // Aboard, a click starts nothing. On foot, a click on a tile of the vehicle OK would board boards it.
        const triggerTouchAction = proto.triggerTouchAction;
        proto.triggerTouchAction = function() {
            if (this._vehicleType === "reactor") return false;
            if (this._vehicleType === "walk" && V.any() && $gameTemp.isDestinationValid() && TouchInput.isTriggered()) {
                const event = V.offered(true);
                if (event && coversTile(event, $gameTemp.destinationX(), $gameTemp.destinationY()) && board(event, false)) return true;
            }
            return triggerTouchAction.call(this);
        };

        // A hop is advanced once a tick, after the player's own update; the scroll follows it from where it was.
        // A ride that other code ended by writing the vehicle type is ended in full first.
        const update = proto.update;
        proto.update = function(sceneActive) {
            if (this._rrFree && this._vehicleType !== "reactor") strand(this);
            // A grid vehicle may still be moving, so its normal button-action update need not run this tick.
            if (!this._rrMount) {
                const result = update.call(this, sceneActive);
                if (sceneActive) cancelRide(this);
                return result;
            }
            // Consume Cancel during the hop too, including the tick on which it ends on foot.
            if (sceneActive) cancelRide(this);
            const sx = this.scrolledX(), sy = this.scrolledY();
            update.call(this, sceneActive);
            V.hop();
            this.updateScroll(sx, sy);
        };
    };

    const copy = value => JSON.parse(JSON.stringify(value));

    V.prepareTransfer = function(mapId, x, y, direction) {
        const p = player(), event = V.ridden();
        if (p) p._rrVehicleTransfer = null;
        if (!p || !event || mapId === $gameMap._mapId) return false;
        note(event, false);
        const entry = registry(true).at[V.idOf(event)];
        // Keep the original pages, key and optional graphic binding. Never write to a project map file.
        if (!entry.event) entry.event = copy(event._rrAuthored || event.event());
        const data = mapData(), models = data && data.reactor3d && data.reactor3d.events;
        if (!entry.models && models && models[event._eventId]) entry.models = copy(models[event._eventId]);
        p._rrVehicleTransfer = { identity: V.idOf(event), map: mapId, x, y,
            yaw: direction ? DEGREES_OF_DIR[direction] : V.degrees(headingOf(event)) };
        // The convoy goes too: what is kept of each of its vehicles is written now, and where each arrives when the
        // map is set up (`setup`), once it is known whether a border is crossed into a map shown past it.
        const riders = V.Convoy.riders();
        if (riders.length) {
            const convoy = p._rrVehicleTransfer.convoy = {};
            for (const rider of riders) {
                const vehicle = rider.event, identity = V.idOf(vehicle);
                note(vehicle, false);
                const kept = registry(true).at[identity];
                if (!kept.event) kept.event = copy(vehicle._rrAuthored || vehicle.event());
                if (!kept.models && models && models[vehicle._eventId]) kept.models = copy(models[vehicle._eventId]);
                rider.follower._rrConvoy = identity;
                convoy[identity] = null;
            }
        }
        return true;
    };

    /** Add visiting vehicles to runtime map data before constructing its events. */
    const visitingVehicles = function(map) {
        const data = mapData(), store = registry(false);
        if (!data || !Array.isArray(data.events)) return;
        // setupEvents can run again on the same in-memory map. Retire generated
        // records first so event IDs and parked positions do not accumulate.
        for (let i = 1; i < data.events.length; i++) {
            if (data.events[i] && data.events[i]._rrDatabaseVehicle) data.events[i] = null;
        }
        const placements = models()?.startingEvents?.(root.$dataReactorVehicles, map._mapId) || [];
        for (const authored of placements) {
            const entry = store && store.at[authored._rrVehicleIdentity];
            // One taken out of the world here still has its event (erased as the map is entered), so it can be put back.
            if (entry && entry.map !== map._mapId) continue;
            if (authored.x >= data.width || authored.y >= data.height) continue;
            const vacancy = data.events.findIndex((row, index) => index > 0 && !row);
            authored.id = vacancy > 0 ? vacancy : Math.max(1, data.events.length);
            data.events[authored.id] = authored;
        }
        if (!store) return;
        for (const [identity, entry] of Object.entries(store.at)) {
            if (!entry.event || entry.map !== map._mapId || Number(identity.split(":")[0]) === map._mapId) continue;
            if (data.events.some(event => event && event._rrVehicleIdentity === identity)) continue;
            const authored = copy(entry.event), id = Math.max(1, data.events.length);
            authored.id = id; authored.x = Math.round(entry.x); authored.y = Math.round(entry.y);
            authored._rrVehicleIdentity = identity;
            data.events[id] = authored;
            if (entry.models) {
                if (!data.reactor3d) data.reactor3d = {};
                if (!data.reactor3d.events) data.reactor3d.events = {};
                data.reactor3d.events[id] = copy(entry.models);
            }
        }
    };

    const installMap = function() {
        if (typeof Game_Map === "undefined" || Game_Map.prototype.vehicle.__rrVehicles) return;
        const proto = Game_Map.prototype;

        const vehicle = proto.vehicle;
        proto.vehicle = function(type) {
            if (type === "reactor") return V.ridden();
            return vehicle.call(this, type);
        };
        proto.vehicle.__rrVehicles = true;

        const setupEvents = proto.setupEvents;
        proto.setupEvents = function() {
            visitingVehicles(this);
            rebuilding = true;
            let result;
            try { result = setupEvents.apply(this, arguments); } finally { rebuilding = false; }
            enterMap(this);
            return result;
        };

        const setup = proto.setup;
        proto.setup = function(mapId) {
            const p = player();
            // The same map set up again under a party that is aboard: the ride goes on where it was.
            resumeAt = p && p._vehicleType === "reactor" && p._rrRide && this._mapId === mapId && !p._rrMount
                ? [p._realX, p._realY, p._reactorGround, p._reactorAlt] : null;
            leaveMap(this);
            const transfer = p && p._rrVehicleTransfer;
            if (transfer && transfer.map === mapId) {
                const entry = registry(true).at[transfer.identity];
                if (entry) Object.assign(entry, { map: mapId, x: transfer.x, y: transfer.y, z: null, yaw: transfer.yaw });
                // The convoy: over a border into the map shown past it, each keeps its place behind the leader, counted
                // from that map's corner (`shift`); by any other transfer they arrive where the leader does.
                if (transfer.convoy) {
                    const R = world(), cross = R && R.Neighbors && R.Neighbors.crossing && R.Neighbors.crossing.to === mapId ? R.Neighbors.crossing : null;
                    if (cross) transfer.shift = [cross.offset.x, cross.offset.z];
                    const here = V.list();
                    for (const identity of Object.keys(transfer.convoy)) {
                        const vehicle = here.find(other => V.idOf(other) === identity), kept = registry(true).at[identity];
                        const height = vehicle && Number.isFinite(vehicle._reactorAlt) ? vehicle._reactorAlt : null;
                        const at = transfer.convoy[identity] = cross && vehicle ? [vehicle._realX - cross.offset.x, vehicle._realY - cross.offset.z, height, vehicle._rrYaw]
                            : [transfer.x, transfer.y, null, RAD * transfer.yaw];
                        if (kept) Object.assign(kept, { map: mapId, x: at[0], y: at[1], z: at[2], yaw: V.degrees(at[3]) });
                    }
                }
            }
            return setup.apply(this, arguments);
        };

        // A map that plays its music on arrival plays it for a party aboard a vehicle that has no music of its own.
        const autoplay = proto.autoplay;
        proto.autoplay = function() {
            autoplay.apply(this, arguments);
            const data = mapData(), p = player();
            if (data && data.autoplayBgm && p && ridesSilent(p)) AudioManager.playBgm(AudioManager.mapBgmObject(data, this.mapId()));
        };
    };
    let resumeAt = null;

    /** Aboard a vehicle whose boarding left the music alone: one of this file's with no BGM, or a boat, ship or airship that played none. */
    const ridesSilent = function(p) {
        if (p._vehicleType === "reactor") {
            const event = V.ridden(), type = event ? V.type(event._rrVehicle) : null;
            return !!event && !(type && type.bgm && type.bgm.name);
        }
        const stock = p.isInVehicle() ? p.vehicle() : null;
        return !!stock && stock._rrVehicleBgm === false;
    };

    /**
     * The map scene starts: events a save brought are matched to the data, and a ride a save or a reload of the
     * map carried goes on exactly where it was (the reload puts the player on a whole tile).
     */
    V.resume = function() {
        V.refresh();
        const p = player(), at = resumeAt;
        resumeAt = null;
        const event = V.bind();
        if (!event || !at || p._rrMount) return event;
        if (Math.round(at[0]) === p._x && Math.round(at[1]) === p._y) {
            p._realX = at[0]; p._realY = at[1];
            if (Number.isFinite(at[2])) p._reactorGround = at[2];
            if (Number.isFinite(at[3])) p._reactorAlt = at[3];
            carry(event, p);
        }
        return event;
    };

    const installEvent = function() {
        if (typeof Game_Event === "undefined" || Game_Event.prototype.pos.__rrVehicles) return;
        const proto = Game_Event.prototype;
        const characterName = proto.characterName, characterIndex = proto.characterIndex;
        const inheritedSheet = event => !event._erased && event._pageIndex >= 0 && !event._characterName && !event._tileId &&
            event._rrVehicle && V.type(event._rrVehicle) && V.type(event._rrVehicle).sheet;
        proto.characterName = function() { const sheet = inheritedSheet(this); return sheet && sheet.characterName || characterName.call(this); };
        proto.characterIndex = function() { const sheet = inheritedSheet(this); return sheet && sheet.characterName ? sheet.characterIndex || 0 : characterIndex.call(this); };
        const eventData = proto.event;
        proto.event = function() { return this._rrAuthored || eventData.call(this); };
        const meetsConditions = proto.meetsConditions;
        proto.meetsConditions = function(page) {
            if (!this._rrIdentity || !page.conditions.selfSwitchValid) return meetsConditions.call(this, page);
            const home = this._rrIdentity.split(":").map(Number);
            if (!$gameSelfSwitches.value([home[0], home[1], page.conditions.selfSwitchCh])) return false;
            return meetsConditions.call(this, Object.assign({}, page, { conditions: Object.assign({}, page.conditions, { selfSwitchValid: false }) }));
        };

        // The carried event is one tile to the grid: its body is the mover's, and no shape is built for a place it
        // holds for one tick.
        const pos = proto.pos;
        proto.pos = function(x, y) {
            if (this._rrFree === 2 || this._rrVehicle && !map3D()) return this._x === x && this._y === y;
            return pos.call(this, x, y);
        };
        proto.pos.__rrVehicles = true;

        // A vehicle that is spoken to does not turn to the speaker, and is not turned back afterwards.
        const lock = proto.lock;
        proto.lock = function() {
            if (!this._rrVehicle) return lock.call(this);
            if (Number.isFinite(this._rrYaw)) this._rrYaw = headingOf(this);
            if (!this._locked) { this._prelockDirection = 0; this._locked = true; }
        };

        // A page change gives an event its page's facing; a vehicle keeps its heading. One whose data has gone
        // (the map's data is another map's) is left as it is.
        const refresh = proto.refresh;
        proto.refresh = function() {
            if (!this._rrVehicle) return refresh.call(this);
            const data = mapData();
            if (!data || !data.events || !data.events[this._eventId]) return;
            // On the grid, a facing a command gave it since is its heading now.
            if (Number.isFinite(this._rrYaw)) this._rrYaw = headingOf(this);
            const page = this._pageIndex;
            refresh.call(this);
            if (this._pageIndex === page) return;
            if (Number.isFinite(this._rrYaw)) face(this, this._rrYaw);
            if (this._rrFree === 2) this._through = true;
            offer.stamp = -1;
        };

        // A boarded vehicle and one the mover parked run no movement type of their own.
        const updateSelfMovement = proto.updateSelfMovement;
        proto.updateSelfMovement = function() {
            if (this._rrFree || this._rrBoarded) {
                // One that is going down through water goes down a little more.
                if (this._rrSink !== undefined) V.sinkTick(this);
                return;
            }
            updateSelfMovement.call(this);
        };

        // What a caller of `vehicle()` asks, answered by an event. A plain event answers as something that is no
        // vehicle; no kind answers to the names of the boat, the ship or the airship.
        proto.canMove = function() {
            if (!this._rrVehicle || !this._rrBoarded) return true;
            const p = player(), mount = p && p._rrMount;
            return !(mount && !mount.drawn);
        };
        proto.isLandOk = function(x, y, d) {
            if (!this._rrVehicle) return false;
            // A tile of the vehicle itself is no place to get off onto: parked, its body is there.
            return !coversTile(this, x, y) && canStand(x, y, groundOf(this), null);
        };
        proto.isLowest = function() { return true; };
        proto.isHighest = function() { return true; };
        proto.maxAltitude = function() { return 1; };
        proto.isBoat = function() { return false; };
        proto.isShip = function() { return false; };
        proto.isAirship = function() { return false; };
        proto.getOn = function() {
            const type = this._rrVehicle ? V.type(this._rrVehicle) : null;
            if (!type || !type.bgm || !type.bgm.name) return;
            $gameSystem.saveWalkingBgm();
            AudioManager.playBgm(type.bgm);
        };
        proto.getOff = function() {
            const type = this._rrVehicle ? V.type(this._rrVehicle) : null;
            if (type && type.bgm && type.bgm.name) $gameSystem.replayWalkingBgm();
        };
        proto.syncWithPlayer = function() {
            if (!this._rrVehicle || !this._rrBoarded) return;
            const p = player();
            if (!p || p._vehicleType !== "reactor") return;
            if (this._rrFree === 2) carry(this, p);
            aboardTick(this, p);
        };
    };

    const installRest = function() {
        // A land vehicle fights on the ground's battleback, not the ship's.
        if (typeof Sprite_Battleback !== "undefined" && !Sprite_Battleback.prototype.overworldBattleback1Name.__rrVehicles) {
            const land = function() {
                const p = player(), event = p && p._vehicleType === "reactor" ? V.ridden() : null;
                const type = event ? V.type(event._rrVehicle) : null;
                return !!type && (type.medium === undefined || String(type.medium).indexOf("ground") >= 0);
            };
            const name1 = Sprite_Battleback.prototype.overworldBattleback1Name;
            Sprite_Battleback.prototype.overworldBattleback1Name = function() {
                return land() ? this.normalBattleback1Name() : name1.call(this);
            };
            Sprite_Battleback.prototype.overworldBattleback1Name.__rrVehicles = true;
            const name2 = Sprite_Battleback.prototype.overworldBattleback2Name;
            Sprite_Battleback.prototype.overworldBattleback2Name = function() {
                return land() ? this.normalBattleback2Name() : name2.call(this);
            };
        }

        if (typeof Game_Interpreter !== "undefined" && !Game_Interpreter.prototype.updateWaitMode.__rrVehicles) {
            const selfSwitch = Game_Interpreter.prototype.command123;
            Game_Interpreter.prototype.command123 = function(params) {
                const event = $gameMap && this._mapId === $gameMap._mapId ? $gameMap.event(this._eventId) : null;
                if (!event || !event._rrIdentity) return selfSwitch.call(this, params);
                const home = event._rrIdentity.split(":").map(Number);
                $gameSelfSwitches.setValue([home[0], home[1], params[0]], params[1] === 0);
                return true;
            };
            // Game_Action ordinarily identifies subjects through Actors or Troop indices.
            // Vehicles use their own saved identity; no synthetic Actor database record is needed.
            if (typeof Game_Action !== "undefined" && !Game_Action.prototype.subject.__rrVehicles) {
                const setSubject = Game_Action.prototype.setSubject, subject = Game_Action.prototype.subject;
                Game_Action.prototype.setSubject = function(battler) {
                    this._rrVehicleSubject = battler && battler._rrVehicleIdentity || "";
                    return setSubject.call(this, battler);
                };
                Game_Action.prototype.subject = function() { return this._rrVehicleSubject ? V.battler(this._rrVehicleSubject) : subject.call(this); };
                Game_Action.prototype.subject.__rrVehicles = true;
            }
            const updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
            Game_Interpreter.prototype.updateWaitMode = function() {
                if (this._waitMode === "reactorVehicle") {
                    if (V.isBusy()) return true;
                    this._waitMode = "";
                    return false;
                }
                return updateWaitMode.call(this);
            };
            Game_Interpreter.prototype.updateWaitMode.__rrVehicles = true;
        }

        if (typeof Game_Fight !== "undefined" && !Game_Fight.prototype.start.__rrVehicles) {
            const start = Game_Fight.prototype.start;
            Game_Fight.prototype.start = function(options) {
                const p = player();
                const riding = !this._active && p && p._vehicleType === "reactor";
                // A battle fought on a grid keeps the party in the saddle (reactor_vehicles_mount.js); any other puts it on foot.
                const mounted = riding && V.Mount && V.Mount.keeps(options);
                if (mounted) halt();
                else if (riding) dismountForBattle();
                const count = start.call(this, options);
                if (mounted && this._active) V.Mount.begin(this);
                return count;
            };
            Game_Fight.prototype.start.__rrVehicles = true;
        }

        if (typeof BattleManager !== "undefined" && typeof BattleManager.setup === "function" && !BattleManager.setup.__rrVehicles) {
            const setup = BattleManager.setup;
            BattleManager.setup = function() {
                halt();
                return setup.apply(this, arguments);
            };
            BattleManager.setup.__rrVehicles = true;
        }

        if (typeof Scene_Map !== "undefined" && !Scene_Map.prototype.start.__rrVehicles) {
            const start = Scene_Map.prototype.start;
            Scene_Map.prototype.start = function() {
                start.apply(this, arguments);
                V.resume();
            };
            Scene_Map.prototype.start.__rrVehicles = true;
        }

        if (typeof Scene_Map !== "undefined" && typeof Scene_Map.prototype.updateCallMenu === "function" && !Scene_Map.prototype.updateCallMenu.__rrVehicles) {
            const updateCallMenu = Scene_Map.prototype.updateCallMenu;
            Scene_Map.prototype.updateCallMenu = function() {
                const p = player();
                if (cancelFrame === Graphics.frameCount || (p && p._vehicleType === "reactor" && V.ridden() && cancelPressed())) {
                    this.menuCalling = false;
                    return;
                }
                return updateCallMenu.apply(this, arguments);
            };
            Scene_Map.prototype.updateCallMenu.__rrVehicles = true;
        }

        // The file loads with the database, and the boot scene waits for it.
        if (typeof Scene_Boot !== "undefined" && !Scene_Boot.prototype.isReady.__rrVehicles) {
            const create = Scene_Boot.prototype.create;
            Scene_Boot.prototype.create = function() {
                create.apply(this, arguments);
                V.load();
            };
            const isReady = Scene_Boot.prototype.isReady;
            Scene_Boot.prototype.isReady = function() {
                return isReady.apply(this, arguments) && V.isReady();
            };
            Scene_Boot.prototype.isReady.__rrVehicles = true;
        }
    };

    //-------------------------------------------------------------------------
    // The event commands (code 357, plugin "RPGReactor").

    /** The vehicle a command names: "this" is the event the command runs in. */
    const commandVehicle = function(interpreter, name) {
        const what = name == null || name === "" ? "this" : name;
        if (what !== "this") return V.find(typeof what === "string" && /^\d+$/.test(what.trim()) ? Number(what) : what);
        const id = interpreter && typeof interpreter.eventId === "function" ? interpreter.eventId() : 0;
        return id > 0 ? V.find(id) : null;
    };

    const installCommands = function() {
        if (typeof PluginManager === "undefined" || !PluginManager.registerCommand || V._commands) return;
        V._commands = true;
        PluginManager.registerCommand("RPGReactor", "GetOnVehicle", function(args) {
            args = args || {};
            // The boat, the ship and the airship are RPG Maker's own: boarded as its own command boards them.
            const stock = String(args.vehicle == null ? "" : args.vehicle).trim().toLowerCase();
            if (stock === "boat" || stock === "ship" || stock === "airship") { V.getOnStock(stock); return; }
            const event = commandVehicle(this, args.vehicle);
            if (!event || !V.getOn(event, { instant: flag(args.instant, false) })) return;
            if (flag(args.wait, true) && V.isBusy()) this.setWaitMode("reactorVehicle");
        });
        PluginManager.registerCommand("RPGReactor", "GetOffVehicle", function(args) {
            args = args || {};
            if (!V.getOff({ instant: flag(args.instant, false) })) return;
            if (flag(args.wait, true) && V.isBusy()) this.setWaitMode("reactorVehicle");
        });
        PluginManager.registerCommand("RPGReactor", "SetVehicleLocation", function(args) {
            args = args || {};
            const name = args.vehicle == null || args.vehicle === "" ? "this" : args.vehicle;
            if (flag(args.remove, false)) {
                const event = commandVehicle(this, name);
                if (!event || !V.remove(event)) console.warn("Set Vehicle Location: no parked vehicle \"" + name + "\" to take out of the world.");
                return;
            }
            const x = number(args.x), y = number(args.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                console.warn("Set Vehicle Location: x and y are not set; \"" + name + "\" was not moved.");
                return;
            }
            let target = name === "this" ? (this && typeof this.eventId === "function" ? $gameMap._mapId + ":" + this.eventId() : "") : name;
            if (typeof target === "string" && /^\d+$/.test(target.trim())) target = $gameMap._mapId + ":" + target.trim();
            const asked = number(args.yaw);
            // `z` is not in the command's form: a script that names a floor writes it (a height, as `where()` answers).
            if (!V.setLocation(target, x, y, Number.isFinite(asked) ? asked : 0, args.z)) {
                console.warn("Set Vehicle Location: \"" + name + "\" was not moved to (" + x + ", " + y + "): it is ridden, it is not on this map, or its body does not fit there.");
            }
        });
    };

    if (typeof Game_Player !== "undefined") {
        const nativeGetOn = Game_Player.prototype.getOnVehicle;
        Game_Player.prototype.getOnVehicle = function() {
            const x = this.x, y = this.y, d = this.direction(), nx = $gameMap.roundXWithDirection(x,d), ny = $gameMap.roundYWithDirection(y,d);
            const key = $gameMap.airship().pos(x,y) ? "airship" : $gameMap.ship().pos(nx,ny) ? "ship" : $gameMap.boat().pos(nx,ny) ? "boat" : "";
            const entry = key && root.$dataSystem && root.$dataSystem[key] && root.$dataSystem[key].reactorVehicle;
            if (entry && entry.ridable === false) return false;
            return nativeGetOn.apply(this,arguments);
        };
    }
    installLooks();
    installPlayer();
    installMap();
    installEvent();
    installRest();
    installCommands();
})();
