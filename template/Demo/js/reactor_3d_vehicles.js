//=============================================================================
// reactor_3d_vehicles.js — RPG Reactor vehicles: the model's side
//=============================================================================
/*
 * An extension of Reactor3D (reactor_3d.js): in the game from scriptUrls, in
 * the editor from Reactor3D.EXTENSIONS, in Node by the core's own tail. It
 * names no game global unguarded.
 *
 * Reactor3D.Vehicles holds what is true of a vehicle whatever drives it:
 *
 *   KINDS, typeOf(record)        a kind's defaults; a type record with every
 *                                field filled
 *   read, guess, findFront,      the `vehicle` block of a model's sidecar
 *   findWheels                   (3d/<model>/model.json), normalized; what is
 *                                guessed where the file says nothing
 *   step(state, input, type,     the handling arithmetic: one logic tick of
 *        env, dt)                steering and speed, pure
 *   inputs, pose, heading,       what a ridden vehicle's model is drawn from:
 *   pointWorld                   the part inputs, its attitude, its points
 *
 * Model space is the space pivots and carve pivots use: the model centered on
 * x and z, standing on y = 0, in the file's own units. A heading is radians,
 * 0 north, clockwise seen from above; on the map it points along
 * (sin(yaw), -cos(yaw)). Pitch is radians, nose up positive. Lean is radians,
 * positive to the vehicle's right.
 *
 * The game's files write the ride onto characters as saved fields (_rrYaw, _rrPitch,
 * _rrLean, _rrSteer, _rrTravel, _rrSpeed, _rrPose, _rrBoarded on the vehicle's
 * event; _rrSeated, _rrMount, _rrRide, _rrDrive on the rider). This file only
 * reads them.
 */
(function(root) {
    "use strict";
    const node = typeof process !== "undefined" && process.versions && process.versions.node
        && !process.versions.nw && typeof require === "function";
    const R = root.Reactor3D || (node ? require("./reactor_3d.js") : null);
    if (!R || (R.Vehicles && R.Vehicles.step)) return;

    const DEG = Math.PI / 180;
    const TICK = 1 / 60;
    const clamp = (value, low, high) => value < low ? low : value > high ? high : value;
    const finite = value => typeof value === "number" && Number.isFinite(value);
    const isObject = value => !!value && typeof value === "object" && !Array.isArray(value);
    // A key a table itself holds: a name out of a file ("constructor", "toString") is never one by inheritance.
    const own = (table, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key);
    const num = value => finite(value) ? value : 0;
    const freeze = value => {
        if (value && typeof value === "object" && !Object.isFrozen(value)) {
            Object.freeze(value);
            for (const key of Object.keys(value)) freeze(value[key]);
        }
        return value;
    };

    //-------------------------------------------------------------------------
    // Kinds

    const sound = (name, volume = 90, pitch = 100) => ({ name, volume, pitch });
    // The motorcycle's sounds are files the Demo has on disk until the editor ships a set per kind.
    const STAND_IN_SOUNDS = { engine: sound("drone-01"), engineRate: [0.6, 1.5], start: sound("powerup-01"), stop: sound("equip-01"),
        bump: sound("hit-01"), land: sound("hit-02"), scrape: null, skid: null };
    const kind = (arrives, medium, switches, size, handling, body, rider, posture, stance, encounters, prompt, leave, minDistance) => ({
        arrives, medium, turnsInPlace: !!switches.turnsInPlace, leans: !!switches.leans, walks: !!switches.walks, size,
        handling, body, rider, posture, stance, encounters, prompt, leave,
        sounds: STAND_IN_SOUNDS,
        camera: { speedDistance: 35, speedFov: 11, lookAhead: 3, minDistance }
    });
    // speed tiles/s; toTopSpeed s to 90%; turnCircle tiles across; turnRate and turnInPlace degrees/s; brake and coast s
    // from top speed; reverse tiles/s; lean degrees at the grip limit (negative leans out of the turn); jump, step and
    // wade tiles; grip tiles/s2. Every row but the motorcycle's is a starting value until a model proves it.
    const KINDS = freeze({
        motorcycle: kind("V1", "ground", { leans: true, walks: true }, 3.5,
            { speed: 20, toTopSpeed: 3, turnCircle: 3, turnRate: 150, turnInPlace: 0, brake: 0.67, coast: 2.5, reverse: 3, lean: 40, jump: 0.75, step: 0.75, wade: 0.45, grip: 32 },
            { height: 2.6, radius: 0.45 }, "seat", "astride", "ride", "none", "ride", "getOff", 0),
        tank: kind("V2", "ground", { turnsInPlace: true }, 12,
            { speed: 9, toTopSpeed: 3, turnCircle: 0, turnRate: 50, turnInPlace: 50, brake: 0.4, coast: 1, reverse: 4, lean: 0, jump: 0, step: 1, wade: 0.9, grip: 32 },
            { height: 4, radius: 2.2 }, "inside", "", "", "none", "drive", "getOut", 13),
        airship: kind("V3", "air", { turnsInPlace: true }, 12,
            { speed: 14, toTopSpeed: 4, turnCircle: 0, turnRate: 60, turnInPlace: 60, brake: 2, coast: 4, reverse: 3, lean: 10, jump: 0, step: 0, wade: 0, grip: 32 },
            { height: 6, radius: 3 }, "inside", "", "", "none", "board", "getOut", 16),
        shuttle: kind("V3", "air", { turnsInPlace: true }, 9,
            { speed: 22, toTopSpeed: 2, turnCircle: 0, turnRate: 55, turnInPlace: 80, brake: 1, coast: 2.9, reverse: 4, lean: 35, jump: 0, step: 0, wade: 0, grip: 32 },
            { height: 3.4, radius: 2 }, "inside", "", "", "none", "fly", "getOut", 14),
        car: kind("Later", "ground", {}, 5,
            { speed: 16, toTopSpeed: 3.5, turnCircle: 5, turnRate: 110, turnInPlace: 0, brake: 0.6, coast: 2.3, reverse: 5, lean: -4, jump: 0, step: 0.75, wade: 0.45, grip: 32 },
            { height: 2.2, radius: 0.9 }, "seat", "seated", "drive", "none", "drive", "getOut", 0),
        boat: kind("Later", "water", {}, 6,
            { speed: 10, toTopSpeed: 4, turnCircle: 6, turnRate: 70, turnInPlace: 0, brake: 1.7, coast: 4, reverse: 2, lean: 6, jump: 0, step: 0, wade: 0, grip: 32 },
            { height: 2.5, radius: 1.2 }, "seat", "seated", "drive", "normal", "board", "getOff", 10),
        hover: kind("Later", "ground", { turnsInPlace: true }, 4,
            { speed: 16, toTopSpeed: 3, turnCircle: 4, turnRate: 120, turnInPlace: 30, brake: 1.1, coast: 3.2, reverse: 4, lean: 15, jump: 0, step: 0.75, wade: 99, grip: 32 },
            { height: 2.4, radius: 0.8 }, "seat", "astride", "ride", "none", "ride", "getOff", 0)
    });
    /** Presets share the mover; a type explicitly decides whether it is rideable. */
    const PLAYED = freeze(Object.keys(KINDS));

    // Each number of a type record: where it lives, and the range the game holds it to.
    const RANGES = freeze({
        handling: { speed: [1, 30], toTopSpeed: [0.5, 10], turnCircle: [0, 16], turnRate: [1, 720], turnInPlace: [0, 360], brake: [0.1, 10],
            coast: [0.2, 30], reverse: [0, 30], lean: [-45, 60], jump: [0, 2], step: [0, 3], wade: [0, 99], grip: [1, 200] },
        body: { height: [0.5, 20], radius: [0.1, 10] },
        camera: { speedDistance: [0, 200], speedFov: [0, 40], lookAhead: [0, 12], minDistance: [0, 60] }
    });
    const RECORD_KEYS = freeze(["id", "name", "note", "classId", "initialLevel", "equips", "traits", "learnings", "ridable", "graphic3d", "medium", "turnsInPlace", "leans", "walks", "passability", "kind", "prompt", "model", "sheet", "rider", "encounters", "handling", "body", "sounds", "bgm", "camera", "flight"]);
    const MODEL_KEYS = freeze(["name", "file", "ext", "size", "scale", "variant", "texture", "offset"]);
    const SOUND_KEYS = freeze(["engine", "engineRate", "idle", "accelerate", "slowdown", "start", "stop", "bump", "land", "scrape", "skid"]);
    /** Keys later versions read; this one notes them and reads none. */
    const RESERVED_KEYS = freeze(["onBoard", "onLeave", "fire", "battle"]);
    // What someone writing a record by hand is likely to have meant.
    const MEANT = freeze({ topSpeed: "handling.speed", maxSpeed: "handling.speed", speed: "handling.speed", acceleration: "handling.toTopSpeed",
        accel: "handling.toTopSpeed", toTopSpeed: "handling.toTopSpeed", turnCircle: "handling.turnCircle", turnRadius: "handling.turnCircle",
        turning: "handling.turnCircle", turnRate: "handling.turnRate", jump: "handling.jump", jumpHeight: "handling.jump", brake: "handling.brake",
        coast: "handling.coast", reverse: "handling.reverse", lean: "handling.lean", step: "handling.step", wade: "handling.wade", grip: "handling.grip",
        size: "model.size", file: "model.file", height: "body.height", radius: "body.radius", engine: "sounds.engine", sound: "sounds.engine",
        fit: "model.size", minDistance: "camera.minDistance", lookAhead: "camera.lookAhead" });

    const types = new WeakMap();
    const typeNotesOf = new WeakMap();
    /** The row of a kind by its name; null for a name the table does not hold. */
    const kindRow = name => own(KINDS, name) ? KINDS[name] : null;
    const meant = (name, path) => own(MEANT, name) && MEANT[name] !== path ? MEANT[name] : "";

    // A number held to a range; one that had to be moved is noted.
    function inRange(value, low, high, notes, field) {
        if (value >= low && value <= high) return value;
        if (notes) notes.push({ key: "clamped", level: "note", args: { field, value, min: low, max: high } });
        return clamp(value, low, high);
    }

    function soundOf(value, fallback, notes, slot, folder) {
        if (value === undefined) return fallback ? Object.assign({}, fallback) : null;
        if (value === null) return null;
        if (typeof value === "string") return value ? Object.assign(sound(value),folder?{folder}:null) : null;
        if (isObject(value) && typeof value.name === "string" && value.name) {
            const result={ name: value.name, volume: finite(value.volume) ? inRange(value.volume, 0, 100, notes, "sounds." + slot + ".volume") : 90,
                pitch: finite(value.pitch) ? inRange(value.pitch, 50, 150, notes, "sounds." + slot + ".pitch") : 100 };
            if (folder) { result.folder=value.folder==="se"?"se":folder; result.pan=finite(value.pan)?inRange(value.pan,-100,100,notes,"sounds."+slot+".pan"):0; }
            else if (finite(value.pan)) result.pan=inRange(value.pan,-100,100,notes,"sounds."+slot+".pan");
            return result;
        }
        if (notes) notes.push({ key: "badSound", level: "fix", args: { slot } });
        return fallback ? Object.assign({}, fallback) : null;
    }

    function numbersOf(group, source, defaults, notes) {
        const out = {}, ranges = RANGES[group];
        for (const name of Object.keys(defaults)) {
            let value = source && source[name];
            if (value === undefined || value === null) { out[name] = defaults[name]; continue; }
            if (!finite(value)) {
                if (notes) notes.push({ key: "notNumber", level: "fix", args: { field: group + "." + name } });
                out[name] = defaults[name];
                continue;
            }
            const range = ranges[name];
            if (value < range[0] || value > range[1]) {
                if (notes) notes.push({ key: "clamped", level: "note", args: { field: group + "." + name, value, min: range[0], max: range[1] } });
                value = clamp(value, range[0], range[1]);
            }
            out[name] = value;
        }
        if (notes && isObject(source)) {
            for (const name of Object.keys(source)) {
                if (!own(defaults, name)) notes.push({ key: "unknownKey", level: "fix", args: { key: group + "." + name, meant: meant(name, group + "." + name) } });
            }
        }
        return out;
    }

    function makeType(record, notes, index) {
        const source = isObject(record) ? record : {};
        // A kind that is written and is not a row of the table is a motorcycle, and said to be.
        const said = source.kind;
        const kindName = own(KINDS, said) ? said : "motorcycle";
        if (notes && said !== undefined && kindName !== said) {
            notes.push({ key: "unknownKind", level: "fix", args: { kind: typeof said === "string" ? said : JSON.stringify(said) } });
        }
        const base = KINDS[kindName];
        const played = source.ridable !== false;
        const handling = numbersOf("handling", source.handling, base.handling, notes);
        const body = numbersOf("body", source.body, base.body, notes);
        const camera = numbersOf("camera", source.camera, base.camera, notes);
        let model = null;
        if (source.graphic3d !== false && isObject(source.model) && typeof source.model.name === "string" && source.model.name) {
            const raw = source.model, name = raw.name;
            model = { name, file: typeof raw.file === "string" && raw.file ? raw.file : name.split("/").pop(),
                ext: typeof raw.ext === "string" && raw.ext ? raw.ext : ".glb",
                size: finite(raw.size) && raw.size > 0 ? inRange(raw.size, 0.1, 200, notes, "model.size") : base.size };
            if (notes && !(finite(raw.size) && raw.size > 0)) notes.push({ key: "noSize", level: "note", args: { size: base.size } });
            if (finite(raw.scale) && raw.scale > 0) model.scale = raw.scale;
            if (typeof raw.variant === "string" && raw.variant) model.variant = raw.variant;
            if (typeof raw.texture === "string" && raw.texture) model.texture = raw.texture;
            if (Array.isArray(raw.offset) && raw.offset.length === 3 && raw.offset.every(finite)) model.offset = raw.offset.slice();
            if (notes) for (const name of Object.keys(raw)) {
                if (MODEL_KEYS.indexOf(name) < 0) notes.push({ key: "unknownKey", level: "fix", args: { key: "model." + name, meant: "" } });
            }
        } else if (notes && !(source.sheet && source.sheet.characterName)) {
            notes.push({ key: "noModel", level: "fix", args: {} });
        }
        const rawSounds = isObject(source.sounds) ? source.sounds : {};
        const sounds = {};
        for (const slot of ["engine", "start", "stop", "bump", "land", "scrape", "skid"]) sounds[slot] = soundOf(rawSounds[slot], base.sounds[slot], notes, slot);
        for (const slot of ["idle", "accelerate", "slowdown"]) sounds[slot] = soundOf(rawSounds[slot], null, notes, slot, "bgs");
        const rate = Array.isArray(rawSounds.engineRate) && rawSounds.engineRate.length === 2 && rawSounds.engineRate.every(finite)
            ? rawSounds.engineRate : base.sounds.engineRate;
        sounds.engineRate = [inRange(rate[0], 0.1, 4, notes, "sounds.engineRate"), inRange(rate[1], 0.1, 4, notes, "sounds.engineRate")];
        if (notes) for (const name of Object.keys(rawSounds)) {
            if (SOUND_KEYS.indexOf(name) < 0) notes.push({ key: "unknownKey", level: "fix", args: { key: "sounds." + name, meant: "" } });
        }
        if (notes) for (const name of Object.keys(source)) {
            if (RESERVED_KEYS.indexOf(name) >= 0) notes.push({ key: "reserved", level: "note", args: { key: name } });
            else if (RECORD_KEYS.indexOf(name) < 0) notes.push({ key: "unknownKey", level: "fix", args: { key: name, meant: meant(name, name) } });
        }
        const sheet = isObject(source.sheet) ? source.sheet : {};
        const turnRate = handling.turnRate * DEG;
        return freeze({
            // A record that writes no id is its place in the list, when the caller says which that is.
            id: Number.isInteger(source.id) && source.id > 0 ? source.id : (Number.isInteger(index) && index > 0 ? index : 0),
            name: typeof source.name === "string" ? source.name : "",
            note: typeof source.note === "string" ? source.note : "",
            kind: kindName,
            prompt: typeof source.prompt === "string" ? source.prompt : "",
            medium: ["ground", "water", "air"].includes(source.medium) ? source.medium : base.medium,
            turnsInPlace: typeof source.turnsInPlace === "boolean" ? source.turnsInPlace : base.turnsInPlace,
            leans: typeof source.leans === "boolean" ? source.leans : base.leans, walks: typeof source.walks === "boolean" ? source.walks : base.walks,
            passability: source.passability === "ship" ? "ship" : "boat", flight: { height: Math.max(0, Math.min(99, finite(source.flight && source.flight.height) ? source.flight.height : 3)) },
            played, arrives: base.arrives, promptTerm: base.prompt, leaveTerm: base.leave, posture: base.posture, stance: base.stance,
            model,
            sheet: { characterName: typeof sheet.characterName === "string" ? sheet.characterName : "",
                characterIndex: Number.isInteger(sheet.characterIndex) ? clamp(sheet.characterIndex, 0, 7) : 0 },
            rider: source.rider === "seat" || source.rider === "inside" ? source.rider : base.rider,
            encounters: source.encounters === "none" || source.encounters === "half" || source.encounters === "normal" ? source.encounters : base.encounters,
            handling, body, sounds,
            bgm: isObject(source.bgm) && typeof source.bgm.name === "string" && source.bgm.name
                ? { name: source.bgm.name, volume: finite(source.bgm.volume) ? source.bgm.volume : 90, pitch: finite(source.bgm.pitch) ? source.bgm.pitch : 100, pan: finite(source.bgm.pan) ? source.bgm.pan : 0 }
                : null,
            camera,
            // What step() reads, worked out once: tiles, seconds and radians.
            k: {
                radius: handling.turnCircle / 2,
                launch: 2.303 * handling.speed / handling.toTopSpeed,
                brakeA: handling.speed / handling.brake,
                coastA: handling.speed / handling.coast,
                turnRate,
                corner: handling.grip / turnRate,
                turnInPlace: handling.turnInPlace * DEG,
                walkRate: 120 * DEG,
                leanRad: handling.lean * DEG
            }
        });
    }

    let defaultType = null;
    const stockTypes = new WeakMap();
    /**
     * A vehicle record is placed once by its own `startMapId`, `startX`, `startY`, `startDirection`, and again by
     * each entry of its `copies` (`{ id, startMapId, startX, startY, startDirection }`, `id` from 2 up and never
     * given twice): so many vehicles of that kind, each with its own place, condition and equipment. A copy is
     * told from the others by its number in the identity: the first is `0:<type>`, copy `n` is
     * `0:<type + COPY * (n - 1)>`.
     */
    const COPY = 10000;
    const identityOf = (type, copy) => '0:' + (type + COPY * ((copy > 1 ? Math.floor(copy) : 1) - 1));
    /** The placements of a record, the first copy first: `[{ copy, mapId, x, y, direction }]`, unplaced ones (map 0) among them. */
    function startsOf(record) {
        const starts = [];
        if (!record || typeof record !== 'object') return starts;
        const read = (source, copy) => starts.push({ copy, mapId: Math.floor(Number(source.startMapId)) || 0, x: Number(source.startX || 0), y: Number(source.startY || 0),
            direction: [1,2,3,4,6,7,8,9].includes(source.startDirection) ? source.startDirection : 2 });
        read(record, 1);
        for (const entry of Array.isArray(record.copies) ? record.copies : []) {
            const copy = entry && typeof entry === 'object' ? Math.floor(Number(entry.id)) : 0;
            if (copy > 1 && copy < COPY && !starts.some(start => start.copy === copy)) read(entry, copy);
        }
        return starts;
    }

    /** The placement an identity (`0:<number>`) names, as `startingEvents` makes it, wherever it starts (an unplaced copy too); null for none. */
    function placementOf(types, identity) {
        const number = Number(String(identity).split(':')[1]), type = number % COPY, copy = Math.floor(number / COPY) + 1;
        if (!Array.isArray(types) || String(identity).split(':')[0] !== '0' || !(type > 0) || !types[type]) return null;
        const start = startsOf(types[type]).find(entry => entry.copy === copy);
        return start ? startingEvents(types, start.mapId, 1, { type, copy })[0] || null : null;
    }

    /** Database placements use the event renderer and driver without authoring map events. `only` (`{ type, copy }`) asks for that one, placed or not. */
    function startingEvents(types, mapId, firstId = 1, only = null) {
        const events = [];
        if (!Array.isArray(types) || (!(mapId > 0) && !only)) return events;
        for (let type = 1; type < types.length; type++) {
            const record = types[type];
            if (!record || (only && only.type !== type)) continue;
            const starts = startsOf(record), several = starts.filter(start => start.mapId > 0).length > 1;
            for (let at = 0; at < starts.length; at++) {
            const start = starts[at];
            if (only ? start.copy !== only.copy : start.mapId !== mapId) continue;
            const x = start.x, y = start.y;
            if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) continue;
            const direction = start.direction;
            const yaw = {8:0,9:45,6:90,3:135,2:180,1:225,4:270,7:315}[direction];
            events.push({ id: firstId + events.length, name: (record.name || 'Vehicle') + (several ? ' ' + (at + 1) : ''), note: '', x, y,
                _rrDatabaseVehicle: type, _rrVehicleCopy: start.copy, _rrVehicleIdentity: identityOf(type, start.copy), rrVehicle: { type, yaw },
                pages: [{ conditions: { actorId:1, actorValid:false, itemId:1, itemValid:false,
                    selfSwitchCh:'A', selfSwitchValid:false, switch1Id:1, switch1Valid:false,
                    switch2Id:1, switch2Valid:false, variableId:1, variableValid:false, variableValue:0 },
                    image: { tileId:0, characterName:'', characterIndex:0, direction, pattern:1 },
                    moveType:0, moveSpeed:3, moveFrequency:3,
                    moveRoute: { list:[{code:0,parameters:[]}], repeat:true, skippable:false, wait:false },
                    priorityType:1, walkAnime:true, stepAnime:false, directionFix:true, through:false,
                    trigger:0, list:[{code:0,indent:0,parameters:[]}] }] });
            }
        }
        return events;
    }

    /**
     * A type record of data/ReactorVehicles.json with every field filled: its own value, else its kind's. Numbers
     * are held to their ranges. The same object for the same record; nothing a caller may write to. `index` is the
     * record's place in its list: the id of a record that writes none (asked without it, such a record's id is 0
     * until a caller says its place).
     */
    function typeOf(record, index) {
        if (!isObject(record)) return defaultType || (defaultType = makeType(null, null));
        let type = types.get(record);
        if (!type || (type.id === 0 && Number.isInteger(index) && index > 0)) {
            const notes = [];
            type = makeType(record, notes, index);
            types.set(record, type);
            typeNotesOf.set(record, freeze(notes));
        }
        return type;
    }
    /** Native vehicles retain their original silence unless sounds are explicitly assigned. */
    function stockTypeOf(record) {
        if (!isObject(record)) return null;
        let type = stockTypes.get(record);
        if (!type) {
            const sounds = { engine: null, start: null, stop: null, bump: null, land: null, scrape: null, skid: null, ...record.sounds };
            type = makeType({ ...record, sounds }, null);
            stockTypes.set(record, type);
        }
        return type;
    }
    /** What typeOf changed or could not read in a record: [{ key, level: "fix" | "note", args }]. */
    function typeNotes(record) {
        if (!isObject(record)) return [];
        typeOf(record);
        return typeNotesOf.get(record) || [];
    }
    /** Forget what was made of a record: after it was changed in place, it is read again. */
    function forgetType(record) {
        if (!isObject(record)) return;
        types.delete(record);
        stockTypes.delete(record);
        typeNotesOf.delete(record);
    }
    /** The parsed file as a list of types with its null first slot; a missing or broken file is `[null]`. */
    function typesOf(list) {
        const out = [null];
        if (!Array.isArray(list)) return out;
        for (let i = 1; i < list.length; i++) out[i] = isObject(list[i]) ? typeOf(list[i], i) : null;
        return out;
    }

    //-------------------------------------------------------------------------
    // The handling step

    const STEP_MAX = 0.4;
    const STEER_IN = 0.18, STEER_OUT = 0.10;
    const ROLL_EASE = 0.15, TILT_EASE = 0.08;
    const SQUAT_GO = 2 * DEG, SQUAT_BRAKE = -4 * DEG, SQUAT_RATE = 60 * DEG;
    const AIR_NOSE = 10 * DEG, AIR_NOSE_MOST = -25 * DEG;
    const REVERSE_TICKS = 6;

    /** A vehicle's state at a standstill, heading `yaw` radians. */
    function newState(yaw) {
        return { x: 0, y: 0, yaw: finite(yaw) ? yaw : 0, v: 0, steer: 0, vz: 0, pitch: 0, roll: 0, travel: 0, rest: 0,
            turn: 0, go: 0, rate: 0, tilt: 0, squat: 0 };
    }

    /**
     * One logic tick of handling: the steering eases, the speed answers throttle, brake, slope and a held corner,
     * and the turn and the travel it wants are left in `state.turn` (radians, signed for reverse) and `state.go`
     * (tiles along the heading). The caller applies them after its own tests; with `env.alone` they are applied
     * here. `state.roll` and `state.pitch` are drawn values only: nothing here reads them back.
     * input: { gas 0..1, brake 0..1, steer -1..1, analog }. env: { slope, water, air, pitch, alone }.
     */
    /** The pace of a vehicle walked along the bed under water, in tiles a second. */
    const FLOODED_SPEED = 2;
    function step(state, input, type, env, dt) {
        const h = type.handling, k = type.k;
        const air = !!(env && env.air);
        const gas = input && input.gas > 0 ? (input.gas > 1 ? 1 : input.gas) : 0;
        const brake = input && input.brake > 0 ? (input.brake > 1 ? 1 : input.brake) : 0;
        const want = input && input.steer ? clamp(input.steer, -1, 1) : 0;
        let v = state.v || 0, steer = state.steer || 0;

        // The steering: a stick is taken as it comes; a key is ramped, slower toward lock than back from it.
        if (input && input.analog) {
            steer = want;
        } else if (steer !== want) {
            const back = steer !== 0 && (want === 0 || (want > 0) !== (steer > 0) || Math.abs(want) < Math.abs(steer));
            const most = dt / (back ? STEER_OUT : STEER_IN);
            let next = steer + clamp(want - steer, -most, most);
            // Crossing the middle, the fast way back ends there; the slower ramp to the other lock starts next tick.
            if (back && steer !== 0 && (next > 0) !== (steer > 0) && next !== 0) next = 0;
            steer = next;
        }

        const slope = env && finite(env.slope) ? env.slope : 1;
        // Under water it is pushed along the bed at a walk, whatever is held.
        const flooded = !!(env && env.flooded);
        const cap = flooded ? Math.min(FLOODED_SPEED, h.speed) : h.speed * slope * (env && env.water ? 0.7 : 1);
        const shed = clamp((Math.abs(steer) - 0.6) / 0.4, 0, 1);
        const top = cap - (cap - Math.min(cap, k.corner)) * shed;
        const was = v;
        if (!air) {
            if (v > cap) v = Math.max(cap, v - 0.5 * k.brakeA * dt);
            if (v > top) v = Math.max(top, v - 20 * shed * dt);
            if (gas) {
                if (v < top && top > 0) v += k.launch * gas * (1 - v / top) * dt;
            } else if (brake) {
                if (v > 0) v = Math.max(0, v - k.brakeA * brake * dt);
                // Held six ticks at rest it backs up; already rolling back, it goes on backing.
                else if (h.reverse > 0 && (v < 0 || (state.rest || 0) >= REVERSE_TICKS)) v = Math.max(-(flooded ? Math.min(FLOODED_SPEED, h.reverse) : h.reverse), v - 0.5 * k.launch * dt);
                else v = 0;
            } else if (v > 0) {
                v = Math.max(0, v - k.coastA * dt);
            } else if (v < 0) {
                v = Math.min(0, v + k.coastA * dt);
            }
        }
        // The ticks the brake has been held with the vehicle standing or backing for the whole tick.
        state.rest = brake && !gas && was <= 0 && v <= 0 ? (state.rest || 0) + 1 : 0;

        const speed = Math.abs(v);
        let rate = speed > 1e-9 ? steer * Math.min(k.radius > 0 ? speed / k.radius : Infinity, k.turnRate, h.grip / speed) : 0;
        let signed = true;
        if (type.walks && speed < 1 && !gas && !brake && !air) { rate = steer * k.walkRate; signed = false; }
        if (type.turnsInPlace && speed < 1) { rate = steer * k.turnInPlace; signed = false; }
        if (air) rate /= 4;
        const turn = rate * (signed ? (v > 0 ? 1 : v < 0 ? -1 : 0) : 1) * dt;
        const go = v * dt;

        // Drawn only. The lean goes into the turn by how hard the tires are worked.
        const work = h.grip > 0 ? Math.min(1, speed * Math.abs(rate) / h.grip) : 0;
        const lean = (type.leans === false ? 0 : k.leanRad) * work * (turn > 0 ? 1 : turn < 0 ? -1 : 0);
        state.roll = (state.roll || 0) + (lean - (state.roll || 0)) * (1 - Math.exp(-dt / ROLL_EASE));
        // The nose lifts under the throttle from slow and dips under the brake; in the air it drops.
        const wantSquat = air ? 0 : gas && v >= 0 ? SQUAT_GO * gas * Math.max(0, 1 - v / (top > 0 ? top : 1)) : brake && v > 0.05 ? SQUAT_BRAKE * brake : 0;
        const squat = state.squat || 0;
        state.squat = squat + clamp(wantSquat - squat, -SQUAT_RATE * dt, SQUAT_RATE * dt);
        let tilt = state.tilt || 0;
        if (air) tilt = Math.max(AIR_NOSE_MOST, tilt - AIR_NOSE * dt);
        else tilt += ((env && finite(env.pitch) ? env.pitch : 0) - tilt) * (1 - Math.exp(-dt / TILT_EASE));
        state.tilt = tilt;
        state.pitch = tilt + state.squat;

        state.v = v;
        state.steer = steer;
        state.rate = rate;
        state.turn = turn;
        state.go = go;
        if (env && env.alone) {
            // A travel longer than STEP_MAX is taken in equal parts, each turned as it goes.
            const parts = Math.max(1, Math.ceil(Math.abs(go) / STEP_MAX));
            let yaw = state.yaw || 0, x = state.x || 0, y = state.y || 0;
            for (let i = 0; i < parts; i++) {
                yaw += turn / parts;
                x += Math.sin(yaw) * go / parts;
                y -= Math.cos(yaw) * go / parts;
            }
            state.yaw = yaw;
            state.x = x;
            state.y = y;
            state.travel = (state.travel || 0) + go;
        }
        return state;
    }

    //-------------------------------------------------------------------------
    // A model's frame, its box and its shape

    const AXES = freeze({ "+x": [1, 0, 0], "-x": [-1, 0, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] });

    /** A front as a unit vector on the ground: an axis name or [x, y, z]; null when it is neither. */
    function forwardVector(forward) {
        if (typeof forward === "string") return own(AXES, forward) ? AXES[forward].slice() : null;
        if (!Array.isArray(forward) || forward.length !== 3 || !forward.every(finite)) return null;
        const length = Math.hypot(forward[0], forward[2]);
        return length > 1e-6 ? [forward[0] / length, 0, forward[2] / length] : null;
    }
    /** The axis name nearest a front vector. */
    function forwardName(vector) {
        const f = forwardVector(vector);
        if (!f) return "";
        return Math.abs(f[0]) >= Math.abs(f[2]) ? (f[0] >= 0 ? "+x" : "-x") : (f[2] >= 0 ? "+z" : "-z");
    }
    /** A vehicle's own axes in model space: its front, its left (up x front) and up. */
    function frame(forward) {
        const f = forwardVector(forward);
        if (!f) return null;
        return { f, l: [f[2], 0, -f[0]], u: [0, 1, 0] };
    }

    /** A box in model space: { min, max }; from { size }, it stands on the ground round the origin. */
    function boxFrom(box) {
        if (!box || typeof box !== "object") return null;
        if (Array.isArray(box.min) && Array.isArray(box.max) && box.min.length === 3 && box.max.length === 3
            && box.min.every(finite) && box.max.every(finite)) return { min: box.min.slice(), max: box.max.slice() };
        const size = Array.isArray(box.size) ? box.size : (finite(box.x) && finite(box.y) && finite(box.z) ? [box.x, box.y, box.z] : null);
        if (size && size.length === 3 && size.every(finite)) return { min: [-size[0] / 2, 0, -size[2] / 2], max: [size[0] / 2, size[1], size[2] / 2] };
        return null;
    }
    // The model each box of `boxOf` was measured from: what is read with that box can look at the model.
    const measured = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    /**
     * A built model's box in model space: what its loader measured, else its meshes. The box remembers its model, so
     * `read(json, boxOf(object))` finds the front of a model whose file names none (a plain `{ min, max }` cannot).
     */
    function boxOf(object) {
        if (!object) return null;
        const size = object.userData && object.userData.glbSize;
        let box = null;
        if (size && finite(size.x) && finite(size.y) && finite(size.z)) box = boxFrom({ size: [size.x, size.y, size.z] });
        else {
            const shape = shapeOf(object);
            box = shape && shape.count ? { min: shape.min.slice(), max: shape.max.slice() } : null;
        }
        if (box && measured) measured.set(box, object);
        return box;
    }
    // Length, width and height along a front, with the middle on the ground.
    function spanOf(box, f) {
        const alongX = Math.abs(f[0]) >= Math.abs(f[2]);
        const sx = box.max[0] - box.min[0], sz = box.max[2] - box.min[2];
        return { L: alongX ? sx : sz, W: alongX ? sz : sx, H: box.max[1] - box.min[1],
            mid: [(box.min[0] + box.max[0]) / 2, box.min[1], (box.min[2] + box.max[2]) / 2] };
    }

    const shapes = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    let shapeScratch = null;
    function meshMatrix(object, mesh) {
        const s = shapeScratch || (shapeScratch = { inverse: new THREE.Matrix4(), matrix: new THREE.Matrix4() });
        s.inverse.copy(object.matrixWorld).invert();
        return s.matrix.multiplyMatrices(s.inverse, mesh.matrixWorld).elements;
    }
    /**
     * A built model's triangles in model space, read once and kept with the object: `points` holds three vertices a
     * triangle, `owner` the mesh each triangle is of. For the tools and the editor; the game asks only to find the
     * front of a model whose file names none, once a model, and lets them go again.
     */
    function shapeOf(object) {
        if (!object || typeof THREE === "undefined") return null;
        let shape = shapes.get(object);
        if (shape) return shape;
        object.updateMatrixWorld(true);
        const meshes = [];
        object.traverse(child => {
            if (child.isMesh && !(child.userData && child.userData.__reactorOverlay) && child.geometry && child.geometry.getAttribute("position")) meshes.push(child);
        });
        let total = 0;
        const counts = meshes.map(mesh => {
            const index = mesh.geometry.getIndex();
            const count = Math.floor((index ? index.count : mesh.geometry.getAttribute("position").count) / 3);
            total += count;
            return count;
        });
        const points = new Float32Array(total * 9), owner = new Uint16Array(total);
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        let at = 0, tri = 0;
        meshes.forEach((mesh, m) => {
            const e = meshMatrix(object, mesh);
            const position = mesh.geometry.getAttribute("position"), index = mesh.geometry.getIndex();
            const array = position.array, stride = position.isInterleavedBufferAttribute ? position.data.stride : 3;
            const offset = position.isInterleavedBufferAttribute ? position.offset : 0;
            const source = position.isInterleavedBufferAttribute ? position.data.array : array;
            for (let t = 0; t < counts[m]; t++, tri++) {
                owner[tri] = m;
                for (let c = 0; c < 3; c++) {
                    const i = (index ? index.array[t * 3 + c] : t * 3 + c) * stride + offset;
                    const x = source[i], y = source[i + 1], z = source[i + 2];
                    const px = e[0] * x + e[4] * y + e[8] * z + e[12], py = e[1] * x + e[5] * y + e[9] * z + e[13], pz = e[2] * x + e[6] * y + e[10] * z + e[14];
                    points[at++] = px; points[at++] = py; points[at++] = pz;
                    if (px < min[0]) min[0] = px; if (py < min[1]) min[1] = py; if (pz < min[2]) min[2] = pz;
                    if (px > max[0]) max[0] = px; if (py > max[1]) max[1] = py; if (pz > max[2]) max[2] = pz;
                }
            }
        });
        shape = { points, owner, meshes, count: total, min, max };
        shapes.set(object, shape);
        return shape;
    }
    /** Forget a model's kept triangles (after carving it, or to give the memory back). */
    function forgetShape(object) { if (object && shapes) shapes.delete(object); }

    // The distance from a point to the model's nearest surface, and that place in `out`. A tube's vertices are at
    // its ends, so the triangles are asked, not the vertices.
    function nearestSurface(shape, x, y, z, out) {
        const p = shape.points;
        let best = Infinity, reach = Infinity, bx = x, by = y, bz = z;
        for (let i = 0; i < p.length; i += 9) {
            const ax = p[i] - x, ay = p[i + 1] - y, az = p[i + 2] - z, cx = p[i + 3] - x, cy = p[i + 4] - y, cz = p[i + 5] - z, ex = p[i + 6] - x, ey = p[i + 7] - y, ez = p[i + 8] - z;
            // A triangle wholly beyond what is already found on any axis cannot be nearer.
            if ((ax > reach && cx > reach && ex > reach) || (ax < -reach && cx < -reach && ex < -reach)
                || (ay > reach && cy > reach && ey > reach) || (ay < -reach && cy < -reach && ey < -reach)
                || (az > reach && cz > reach && ez > reach) || (az < -reach && cz < -reach && ez < -reach)) continue;
            // The nearest point of triangle a, c, e to the origin, by its regions.
            const abx = cx - ax, aby = cy - ay, abz = cz - az, acx = ex - ax, acy = ey - ay, acz = ez - az;
            const d1 = -(abx * ax + aby * ay + abz * az), d2 = -(acx * ax + acy * ay + acz * az);
            let qx, qy, qz;
            if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
            else {
                const d3 = -(abx * cx + aby * cy + abz * cz), d4 = -(acx * cx + acy * cy + acz * cz);
                if (d3 >= 0 && d4 <= d3) { qx = cx; qy = cy; qz = cz; }
                else {
                    const vc = d1 * d4 - d3 * d2;
                    if (vc <= 0 && d1 >= 0 && d3 <= 0) { const t = d1 / (d1 - d3); qx = ax + abx * t; qy = ay + aby * t; qz = az + abz * t; }
                    else {
                        const d5 = -(abx * ex + aby * ey + abz * ez), d6 = -(acx * ex + acy * ey + acz * ez);
                        if (d6 >= 0 && d5 <= d6) { qx = ex; qy = ey; qz = ez; }
                        else {
                            const vb = d5 * d2 - d1 * d6;
                            if (vb <= 0 && d2 >= 0 && d6 <= 0) { const t = d2 / (d2 - d6); qx = ax + acx * t; qy = ay + acy * t; qz = az + acz * t; }
                            else {
                                const va = d3 * d6 - d5 * d4;
                                if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
                                    const t = (d4 - d3) / ((d4 - d3) + (d5 - d6));
                                    qx = cx + (ex - cx) * t; qy = cy + (ey - cy) * t; qz = cz + (ez - cz) * t;
                                } else {
                                    const sum = va + vb + vc;
                                    if (!(Math.abs(sum) > 1e-30)) continue;
                                    const v = vb / sum, w = vc / sum;
                                    qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w;
                                }
                            }
                        }
                    }
                }
            }
            const d = qx * qx + qy * qy + qz * qz;
            if (d < best) { best = d; reach = Math.sqrt(d); bx = x + qx; by = y + qy; bz = z + qz; }
        }
        if (out) { out[0] = bx; out[1] = by; out[2] = bz; }
        return Math.sqrt(best);
    }
    // The highest surface under (x, z) no higher than `from`; -Infinity when a line straight down meets nothing.
    function surfaceBelow(shape, x, z, from) {
        const p = shape.points;
        let best = -Infinity;
        for (let i = 0; i < p.length; i += 9) {
            const ax = p[i], az = p[i + 2], bx = p[i + 3], bz = p[i + 5], cx = p[i + 6], cz = p[i + 8];
            if ((ax < x && bx < x && cx < x) || (ax > x && bx > x && cx > x) || (az < z && bz < z && cz < z) || (az > z && bz > z && cz > z)) continue;
            const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
            if (Math.abs(d) < 1e-12) continue;
            const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, w = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, t = 1 - u - w;
            if (u < 0 || w < 0 || t < 0) continue;
            const y = u * p[i + 1] + w * p[i + 4] + t * p[i + 7];
            if (y <= from && y > best) best = y;
        }
        return best;
    }

    /**
     * How far a point (model space, [x, y, z]) is from a built model's nearest surface, in model units; the place
     * on the surface goes into `out`. For the tools' reports: Infinity for a model with nothing to measure.
     */
    function surfaceNear(object, at, out) {
        const shape = shapeOf(object);
        return shape && shape.count ? nearestSurface(shape, at[0], at[1], at[2], out) : Infinity;
    }
    /** The height of the highest surface straight under (x, z), no higher than `from`; null when there is none. */
    function surfaceUnder(object, x, z, from) {
        const shape = shapeOf(object);
        const y = shape && shape.count ? surfaceBelow(shape, x, z, finite(from) ? from : Infinity) : -Infinity;
        return Number.isFinite(y) ? y : null;
    }

    /**
     * Which end of a model is its front. A front mark of any use of the model decides (`marks`: [x, y, z], a list of
     * them, or { front }); else, for a kind with a seat and a model to look at, the end where the kind's guessed
     * hands lie nearer a surface, a tie going to the end where the seat is lower than what stands ahead of it;
     * else the positive end of the longer side.
     */
    function findFront(box, kindName, object, marks) {
        const mark = Array.isArray(marks) ? (finite(marks[0]) ? marks : marks.find(entry => forwardVector(entry) || (entry && forwardVector(entry.front))))
            : (marks && marks.front) || null;
        const marked = forwardName(mark && mark.front ? mark.front : mark);
        if (marked) return marked;
        const b = boxFrom(box) || boxOf(object);
        if (!b) return "+x";
        const long = (b.max[0] - b.min[0]) >= (b.max[2] - b.min[2]) ? "x" : "z";
        const base = kindRow(kindName) || KINDS.motorcycle;
        const shape = base.rider === "seat" && object ? shapeOf(object) : null;
        if (shape && shape.count) {
            const score = name => {
                const block = guessBlock(b, kindName, name);
                const seat = block.seats[0];
                if (!seat || !seat.handL || !seat.handR) return null;
                const f = block.f, span = spanOf(b, f);
                const hands = nearestSurface(shape, seat.handL.at[0], seat.handL.at[1], seat.handL.at[2])
                    + nearestSurface(shape, seat.handR.at[0], seat.handR.at[1], seat.handR.at[2]);
                const sx = seat.seat.at[0], sz = seat.seat.at[2];
                const ahead = surfaceBelow(shape, sx + f[0] * 0.23 * span.L, sz + f[2] * 0.23 * span.L, Infinity);
                const under = surfaceBelow(shape, sx, sz, Infinity);
                return { hands, rise: (Number.isFinite(ahead) ? ahead : b.min[1]) - (Number.isFinite(under) ? under : b.min[1]), L: span.L };
            };
            const plus = score("+" + long), minus = score("-" + long);
            if (plus && minus) {
                if (Math.abs(plus.hands - minus.hands) > 0.01 * plus.L) return plus.hands < minus.hands ? "+" + long : "-" + long;
                if (Math.abs(plus.rise - minus.rise) > 1e-6) return plus.rise > minus.rise ? "+" + long : "-" + long;
            }
        }
        return "+" + long;
    }

    /**
     * The parts of a model that are wheels: round seen from the side, thin across, standing on the ground line,
     * grouped by axle. The axle and the radius come from each part's own box (a file's wheel nodes may all share the
     * model's origin). Front first. [{ part, with: [names on the same axle], at: [x, y, z], radius, side }]
     */
    function findWheels(object, forward) {
        const shape = shapeOf(object), axes = frame(forward || "+x");
        if (!shape || !shape.count || !axes) return [];
        const f = axes.f, l = axes.l;
        // Each mesh's own box along the front, up and across; then each named part's, over the meshes that carry its name.
        const boxes = shape.meshes.map(() => [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]);
        const p = shape.points;
        for (let t = 0; t < shape.count; t++) {
            const box = boxes[shape.owner[t]];
            for (let c = 0; c < 3; c++) {
                const i = t * 9 + c * 3, a = p[i] * f[0] + p[i + 2] * f[2], y = p[i + 1], s = p[i] * l[0] + p[i + 2] * l[2];
                if (a < box[0]) box[0] = a; if (a > box[1]) box[1] = a;
                if (y < box[2]) box[2] = y; if (y > box[3]) box[3] = y;
                if (s < box[4]) box[4] = s; if (s > box[5]) box[5] = s;
            }
        }
        const parts = new Map();
        shape.meshes.forEach((mesh, m) => {
            const box = boxes[m];
            if (!(box[1] >= box[0])) return;
            const chain = (mesh.userData && mesh.userData.parts) || [];
            chain.forEach((entry, depth) => {
                if (!entry || !entry.name) return;
                let part = parts.get(entry.name);
                if (!part) parts.set(entry.name, part = { name: entry.name, box: [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity], meshes: new Set(), depth: 0 });
                part.meshes.add(m);
                part.depth = Math.max(part.depth, depth);
                for (let i = 0; i < 6; i += 2) { if (box[i] < part.box[i]) part.box[i] = box[i]; if (box[i + 1] > part.box[i + 1]) part.box[i + 1] = box[i + 1]; }
            });
        });
        const height = shape.max[1] - shape.min[1], ground = shape.min[1];
        const round = [];
        for (const part of parts.values()) {
            const long = part.box[1] - part.box[0], tall = part.box[3] - part.box[2], wide = part.box[5] - part.box[4];
            const across = Math.max(long, tall);
            if (!(across > 0.04 * height) || Math.abs(long - tall) > 0.12 * across || wide > 0.75 * across) continue;
            round.push({ name: part.name, meshes: part.meshes, depth: part.depth, radius: tall / 2, wide,
                a: (part.box[0] + part.box[1]) / 2, y: (part.box[2] + part.box[3]) / 2, s: (part.box[4] + part.box[5]) / 2, low: part.box[2] });
        }
        // A name that covers no more than another round part does says the same thing twice: the wider name stands.
        const covers = (big, small) => { for (const m of small.meshes) if (!big.meshes.has(m)) return false; return true; };
        const kept = round.filter(part => !round.some(other => other !== part && covers(other, part)
            && (other.meshes.size > part.meshes.size || other.depth > part.depth || (other.depth === part.depth && other.name < part.name))));
        kept.sort((x, y) => y.radius - x.radius);
        const groups = [];
        for (const part of kept) {
            const group = groups.find(g => Math.abs(g.a - part.a) <= 0.25 * g.radius && Math.abs(g.y - part.y) <= 0.25 * g.radius
                && Math.abs(g.s - part.s) <= Math.max(g.wide, part.wide));
            if (group) group.with.push(part.name);
            else groups.push({ part: part.name, with: [], a: part.a, y: part.y, s: part.s, radius: part.radius, wide: part.wide, low: part.low });
        }
        const width = Math.max(1e-6, shape.max[0] - shape.min[0], shape.max[2] - shape.min[2]);
        return groups
            .filter(group => group.low - ground <= 0.16 * group.radius + 0.01 * height)
            .sort((x, y) => y.a - x.a)
            .map(group => ({ part: group.part, with: group.with.sort(),
                at: [round3(f[0] * group.a + l[0] * group.s), round3(group.y), round3(f[2] * group.a + l[2] * group.s)],
                radius: round3(group.radius), side: Math.abs(group.s) < 0.02 * width ? "" : group.s > 0 ? "left" : "right" }));
    }
    const round3 = value => Math.round(value * 1000) / 1000 + 0;

    //-------------------------------------------------------------------------
    // The `vehicle` block

    const POINTS = freeze(["seat", "handL", "handR", "footL", "footR"]);
    const INPUTS = freeze(["steer", "throttle", "brake", "aim", "aimPitch"]);
    const BAR_RAKE = 24 * DEG, WHEEL_RAKE = 25 * DEG;

    const point = (at, part, follows, along) => ({ at, part: part || "", follows: follows || "", along: along || null });
    const mix = (mid, f, l, ahead, up, left) => [round3(mid[0] + f[0] * ahead + l[0] * left), round3(mid[1] + up), round3(mid[2] + f[2] * ahead + l[2] * left)];

    // The block a kind's proportions give a box facing `forward`, nothing dropped onto the model.
    function guessBlock(box, kindName, forward) {
        const base = kindRow(kindName) || KINDS.motorcycle;
        const axes = frame(forward) || frame("+x"), f = axes.f, l = axes.l;
        const block = { forward: forwardName(f), f, left: l, stand: base.leans && base.medium === "ground" ? { lean: 10, side: "left" } : null,
            wheels: [], controls: [], seats: [], tracks: [],
            guessed: { forward: true, wheels: true, controls: true, seats: true }, problems: [] };
        if (!box || base.rider !== "seat") return block;
        const span = spanOf(box, f), L = span.L, W = span.W, H = span.H, mid = span.mid;
        if (base.posture === "astride") {
            const handL = mix(mid, f, l, 0.18 * L, 0.74 * H, 0.36 * W), handR = mix(mid, f, l, 0.18 * L, 0.74 * H, -0.36 * W);
            block.seats.push({ posture: "astride",
                seat: point(mix(mid, f, l, -0.13 * L, 0.725 * H, 0)),
                handL: point(handL, "", "steer"), handR: point(handR, "", "steer"),
                footL: point(mix(mid, f, l, -0.12 * L, 0.35 * H, 0.28 * W)), footR: point(mix(mid, f, l, -0.12 * L, 0.35 * H, -0.28 * W)) });
            block.controls.push(steerControl("bars", handL, handR, f));
        } else {
            const seat = mix(mid, f, l, -0.05 * L, 0.45 * H, 0.25 * W);
            const hub = [seat[0] + f[0] * 0.12 * L, seat[1] + 0.2 * H, seat[2] + f[2] * 0.12 * L];
            const handL = [round3(hub[0] + l[0] * 0.1 * H), round3(hub[1]), round3(hub[2] + l[2] * 0.1 * H)];
            const handR = [round3(hub[0] - l[0] * 0.1 * H), round3(hub[1]), round3(hub[2] - l[2] * 0.1 * H)];
            const foot = side => [round3(seat[0] + f[0] * 0.2 * L + l[0] * side * 0.06 * W), round3(mid[1] + 0.15 * H), round3(seat[2] + f[2] * 0.2 * L + l[2] * side * 0.06 * W)];
            block.seats.push({ posture: "seated", seat: point(seat), handL: point(handL, "", "steer"), handR: point(handR, "", "steer"),
                footL: point(foot(1)), footR: point(foot(-1)) });
            block.controls.push(steerControl("wheel", handL, handR, f));
        }
        return block;
    }
    // A steering line through the middle of the two hands, leaning back from upright by the shape's rake.
    function steerControl(shape, handL, handR, f) {
        const rake = shape === "bars" ? BAR_RAKE : WHEEL_RAKE;
        const degrees = shape === "bars" ? 30 : 90;
        return { input: "steer", shape, part: "",
            at: [round3((handL[0] + handR[0]) / 2), round3((handL[1] + handR[1]) / 2), round3((handL[2] + handR[2]) / 2)],
            axis: [round3(-f[0] * Math.sin(rake)), round3(Math.cos(rake)), round3(-f[2] * Math.sin(rake))],
            degrees, degreesAtSpeed: shape === "bars" ? 7 : degrees };
    }

    /**
     * What a model's box and kind suggest: the front, one seat with its hands and feet, the steering line and, with a
     * model to look at, its wheels and each point set down on its surface (seat and feet straight down onto what is
     * under them, hands onto the nearest surface within a tenth of the length). `options.forward` names the front
     * when it is known; `options.marks` are the front marks of the model's uses.
     */
    function guess(box, kindName, object, options) {
        const b = boxFrom(box) || boxOf(object);
        const named = options && forwardName(options.forward);
        const forward = named || findFront(b, kindName, object, options && options.marks);
        const block = guessBlock(b, kindName, forward);
        if (named) block.guessed.forward = false;
        const shape = object ? shapeOf(object) : null;
        if (!b || !shape || !shape.count) return block;
        block.wheels = findWheels(object, forward);
        const span = spanOf(b, block.f), seat = block.seats[0];
        if (seat) {
            const top = surfaceBelow(shape, seat.seat.at[0], seat.seat.at[2], Infinity);
            if (Number.isFinite(top)) seat.seat.at[1] = round3(top);
            for (const name of ["footL", "footR"]) {
                const at = seat[name].at, under = surfaceBelow(shape, at[0], at[2], at[1] + 0.1 * span.H);
                if (Number.isFinite(under) && Math.abs(under - at[1]) <= 0.1 * span.H) at[1] = round3(under);
            }
            const near = [0, 0, 0];
            for (const name of ["handL", "handR"]) {
                const at = seat[name].at;
                if (nearestSurface(shape, at[0], at[1], at[2], near) <= 0.1 * span.L) { at[0] = round3(near[0]); at[1] = round3(near[1]); at[2] = round3(near[2]); }
            }
            if (block.controls[0]) block.controls[0] = steerControl(block.controls[0].shape, seat.handL.at, seat.handR.at, block.f);
        }
        return block;
    }

    const blocks = new WeakMap();
    const BLOCK_KEYS = ["forward", "stand", "wheels", "controls", "seats", "tracks"];
    // The `vehicle` object a sidecar carries, or the object itself when it is one; null when it has none.
    function blockSource(json) {
        if (!isObject(json)) return null;
        if (isObject(json.vehicle)) return json.vehicle;
        if ("vehicle" in json) return null;
        return BLOCK_KEYS.some(key => key in json) && !("animations" in json) && !("parts" in json) ? json : null;
    }
    const vec3 = value => Array.isArray(value) && value.length === 3 && value.every(finite) ? value.slice() : null;
    const unit = value => {
        const v = vec3(value);
        if (!v) return null;
        const length = Math.hypot(v[0], v[1], v[2]);
        return length > 1e-6 ? [v[0] / length, v[1] / length, v[2] / length] : null;
    };

    function readPoint(raw, name, seatIndex, problems) {
        if (raw === undefined || raw === null) return null;
        const at = isObject(raw) ? vec3(raw.at) : vec3(raw);
        if (!at) { problems.push({ key: "badPoint", args: { point: "ride." + seatIndex + "." + name } }); return null; }
        const hand = name === "handL" || name === "handR";
        return point(at, isObject(raw) && typeof raw.part === "string" ? raw.part : "",
            isObject(raw) && typeof raw.follows === "string" ? raw.follows : (hand ? "steer" : ""),
            isObject(raw) ? unit(raw.along) : null);
    }

    function normalize(source, box, kindName, json) {
        const base = kindRow(kindName) || KINDS.motorcycle;
        const said = Array.isArray(source && source.guessed) ? source.guessed : [];
        const block = { forward: "", f: null, left: null, stand: null, wheels: [], controls: [], seats: [], tracks: [],
            guessed: { forward: false, wheels: false, controls: false, seats: false }, problems: [] };
        // The front: the file's. With none it is the positive end of the longer side until an instance of the
        // model is bound, which looks for it (`frontOpen`).
        let f = source ? forwardVector(source.forward) : null;
        const open = !f;
        if (!f) {
            f = forwardVector(findFront(box, kindName, null));
            block.guessed.forward = true;
            if (source && source.forward !== undefined) block.problems.push({ key: "badForward", args: {} });
        }
        const axes = frame(f);
        block.f = axes.f;
        block.left = axes.l;
        block.forward = typeof (source && source.forward) === "string" && own(AXES, source.forward) ? source.forward
            : (Math.abs(Math.abs(f[0]) - 1) < 1e-9 || Math.abs(Math.abs(f[2]) - 1) < 1e-9 ? forwardName(f) : f.slice());
        // A key that is written and is not what the format asks for is left out and said.
        const wrong = key => !!source && source[key] !== undefined && source[key] !== null;
        if (source && isObject(source.stand) && finite(source.stand.lean)) {
            block.stand = { lean: clamp(source.stand.lean, 0, 45), side: source.stand.side === "right" ? "right" : "left" };
        } else if (wrong("stand")) {
            block.problems.push({ key: "badStand", args: {} });
        }
        if (wrong("wheels") && !Array.isArray(source.wheels)) block.problems.push({ key: "badWheels", args: {} });
        if (wrong("seats") && !Array.isArray(source.seats)) block.problems.push({ key: "badSeats", args: {} });
        if (wrong("controls") && !Array.isArray(source.controls)) block.problems.push({ key: "badControls", args: {} });
        if (wrong("tracks") && !Array.isArray(source.tracks)) block.problems.push({ key: "badTracks", args: {} });
        if (source && Array.isArray(source.wheels)) {
            source.wheels.forEach((raw, i) => {
                const name = typeof raw === "string" ? raw : (isObject(raw) && typeof raw.part === "string" ? raw.part : "");
                if (!name) { block.problems.push({ key: "badWheel", args: { index: i } }); return; }
                const entry = isObject(raw) ? raw : {};
                block.wheels.push({ part: name, with: Array.isArray(entry.with) ? entry.with.filter(n => typeof n === "string" && n) : [],
                    at: vec3(entry.at), radius: finite(entry.radius) && entry.radius > 0 ? entry.radius : null,
                    side: entry.side === "left" || entry.side === "right" ? entry.side : "",
                    // Whether the file wrote the axle; one taken from the part's box is not written back.
                    written: !!vec3(entry.at) });
            });
        } else {
            block.guessed.wheels = true;
        }
        if (source && Array.isArray(source.tracks)) {
            for (const raw of source.tracks) {
                if (isObject(raw) && typeof raw.part === "string" && raw.part) block.tracks.push({ part: raw.part, side: raw.side === "left" || raw.side === "right" ? raw.side : "" });
            }
        }
        if (source && Array.isArray(source.seats)) {
            source.seats.forEach((raw, i) => {
                if (!isObject(raw)) { block.problems.push({ key: "noSeatPoint", args: { seat: i } }); return; }
                const seat = { posture: raw.posture === "seated" || raw.posture === "standing" || raw.posture === "astride" ? raw.posture : (base.posture || "astride") };
                for (const name of POINTS) seat[name] = readPoint(raw[name], name, i, block.problems);
                if (!seat.seat) { block.problems.push({ key: "noSeatPoint", args: { seat: i } }); return; }
                block.seats.push(seat);
            });
        } else {
            block.guessed.seats = true;
        }
        if (source && Array.isArray(source.controls)) {
            source.controls.forEach((raw, i) => {
                if (!isObject(raw)) { block.problems.push({ key: "controlNeedsAt", args: { control: i } }); return; }
                const shape = raw.shape === "wheel" || raw.shape === "levers" ? raw.shape : "bars";
                const input = INPUTS.indexOf(raw.input) >= 0 ? raw.input : "steer";
                let axis = unit(raw.axis);
                // A line the file does not give leans back from upright along the front (laid again if the front is found later).
                const raked = !axis;
                if (!axis) axis = rakedLine(block.f, shape);
                // The line is kept pointing up, so a turn to the right is one sense for every model.
                if (axis[1] < 0) axis = [-axis[0], -axis[1], -axis[2]];
                const degrees = finite(raw.degrees) && raw.degrees > 0 ? clamp(raw.degrees, 0, 180) : (shape === "bars" ? 30 : 90);
                let atSpeed = finite(raw.degreesAtSpeed) && raw.degreesAtSpeed >= 0 ? Math.min(raw.degreesAtSpeed, degrees) : (shape === "bars" ? Math.min(7, degrees) : degrees);
                if (shape === "wheel") atSpeed = Math.min(atSpeed, 90);
                const part = typeof raw.part === "string" ? raw.part : "";
                const at = vec3(raw.at);
                if (!part && !at) { block.problems.push({ key: "controlNeedsAt", args: { control: i } }); return; }
                const control = { input, shape, part, at, axis, degrees, degreesAtSpeed: atSpeed, written: !!at };
                Object.defineProperty(control, "raked", { value: raked, enumerable: false });
                block.controls.push(control);
            });
        } else {
            block.guessed.controls = true;
        }
        for (const name of said) if (own(block.guessed, name)) block.guessed[name] = true;
        // What the sidecar's own lists already say about a part's pivot.
        Object.defineProperty(block, "pivoted", { value: new Set(json && isObject(json.pivots) ? Object.keys(json.pivots) : []), enumerable: false });
        Object.defineProperty(block, "carved", { value: new Set(json && Array.isArray(json.parts) ? json.parts.map(part => part && part.name).filter(Boolean) : []), enumerable: false });
        Object.defineProperty(block, "kind", { value: kindName, enumerable: false, writable: true });
        Object.defineProperty(block, "boxed", { value: false, enumerable: false, writable: true });
        Object.defineProperty(block, "wants", { value: { seats: !(source && Array.isArray(source.seats)), controls: !(source && Array.isArray(source.controls)) }, enumerable: false });
        // Nobody wrote the front: the first instance bound looks for it. `frontFound` says that is where it came from.
        Object.defineProperty(block, "frontOpen", { value: open, enumerable: false, writable: true });
        Object.defineProperty(block, "frontFound", { value: false, enumerable: false, writable: true });
        complete(block, box);
        return block;
    }
    // A steering line leaning back from upright along a front, by the shape's rake.
    function rakedLine(f, shape) {
        const rake = shape === "bars" ? BAR_RAKE : WHEEL_RAKE;
        return [round3(-f[0] * Math.sin(rake)), round3(Math.cos(rake)), round3(-f[2] * Math.sin(rake))];
    }
    // A block's front named after it was read: its axes, each line that was raked along the old front, and (when
    // the box next comes) the seat and the steering line its kind's proportions lay out along it.
    function setFront(block, forward) {
        const axes = frame(forward);
        if (!axes) return;
        block.f = axes.f;
        block.left = axes.l;
        block.forward = forwardName(axes.f);
        for (const control of block.controls) if (control.raked) control.axis = rakedLine(block.f, control.shape);
        if (block.wants.seats || block.wants.controls) block.boxed = false;
    }
    // With the model's box in hand: the seat a kind's proportions give where the file has none, and the steering
    // line through its hands.
    function complete(block, box) {
        if (block.boxed || !box || !block.wants) return block;
        block.boxed = true;
        const base = kindRow(block.kind) || KINDS.motorcycle;
        if (block.wants.seats) block.seats = guessBlock(box, block.kind, block.f).seats;
        if (block.wants.controls) {
            const seat = block.seats[0];
            if (seat && seat.handL && seat.handR) block.controls = [steerControl(base.posture === "seated" ? "wheel" : "bars", seat.handL.at, seat.handR.at, block.f)];
        }
        return block;
    }

    /**
     * A model's `vehicle` block, normalized: every list present, every point `{ at, part, follows, along }` or null,
     * every control's line a point and a unit direction pointing up. Where the file says nothing a seat, the steering
     * line and the front are filled from the box by the kind's proportions (`guessed` says which), without setting
     * anything down on the model. The same `json` answers the same block, completed in place the first time a box
     * comes with it. `json` is a sidecar, or the block itself. A front the file does not name is the positive end
     * of the longer side until the model comes to hand (a box from `boxOf`, or the first instance bound): then it is
     * looked for, once a model.
     */
    function read(json, box, kindName) {
        const b = boxFrom(box);
        const name = own(KINDS, kindName) ? kindName : "motorcycle";
        // A box `boxOf` measured brings its model: a front the file does not name is looked for on it.
        const model = box && measured ? measured.get(box) : null;
        if (!isObject(json)) return fronted(normalize(null, b, name, null), model, b);
        const source = blockSource(json);
        const held = blocks.get(json);
        // A sidecar given another `vehicle` object since (the editor's tool) is read again.
        if (held && held.source === source && (held.kind === name || !kindName)) return complete(fronted(held, model, null), b);
        const block = normalize(source, b, name, json);
        Object.defineProperty(block, "source", { value: source, enumerable: false });
        blocks.set(json, block);
        return fronted(block, model, b);
    }
    // A block whose front nobody wrote, read with its model in hand: the front is looked for, and what was laid
    // out along the first guess is laid out again.
    function fronted(block, model, box) {
        if (!model || !block.frontOpen || typeof THREE === "undefined") return block;
        openFront(model, block, "");
        return box ? complete(block, box) : block;
    }
    /** Forget what was read of a sidecar: after its `vehicle` block was changed in place. */
    function forget(json) { if (isObject(json)) blocks.delete(json); }

    /** A point turned about a line (a point and a unit direction) by radians; arrays in, `out` back. */
    function turnAbout(p, at, axis, radians, out) {
        const x = p[0] - at[0], y = p[1] - at[1], z = p[2] - at[2];
        const c = Math.cos(radians), s = Math.sin(radians), d = (axis[0] * x + axis[1] * y + axis[2] * z) * (1 - c);
        out[0] = at[0] + x * c + (axis[1] * z - axis[2] * y) * s + axis[0] * d;
        out[1] = at[1] + y * c + (axis[2] * x - axis[0] * z) * s + axis[1] * d;
        out[2] = at[2] + z * c + (axis[0] * y - axis[1] * x) * s + axis[2] * d;
        return out;
    }

    /** The names a block's points are bound and asked by: ride.<seat>.<point>, wheel.<n>, control.<n>. */
    function pointNames(block) {
        const names = [];
        block.seats.forEach((seat, s) => { for (const name of POINTS) if (seat[name]) names.push("ride." + s + "." + name); });
        block.wheels.forEach((wheel, w) => { if (wheel.at) names.push("wheel." + w); });
        block.controls.forEach((control, c) => { if (control.at) names.push("control." + c); });
        return names;
    }
    // A block's points as landmarks: model space, each naming the part it rides.
    function landmarksOf(block, out) {
        block.seats.forEach((seat, s) => {
            for (const name of POINTS) if (seat[name]) out["ride." + s + "." + name] = { part: seat[name].part, offset: seat[name].at.slice(), space: "model" };
        });
        block.wheels.forEach((wheel, w) => { if (wheel.at) out["wheel." + w] = { part: wheel.part, offset: wheel.at.slice(), space: "model" }; });
        // A control's line belongs to the body, not to the part that turns about it.
        block.controls.forEach((control, c) => { if (control.at) out["control." + c] = { part: "", offset: control.at.slice(), space: "model" }; });
        return out;
    }

    // The rules a block makes: a wheel rolls by the road, a control follows an input. `left` is up x front, so a
    // wheel's forward roll is a positive turn about it; a control's line points up, so a turn to the right is a
    // positive turn about its opposite.
    function rulesOf(block) {
        const raw = [];
        block.wheels.forEach((wheel, w) => {
            if (!(wheel.radius > 0)) return;
            [wheel.part].concat(wheel.with).forEach((part, i) => raw.push({ name: "vehicle-wheel-" + w + (i ? "-" + i : ""), type: "spin", trigger: "always",
                part, radius: wheel.radius, axisVector: block.left.slice(), exact: true }));
        });
        block.controls.forEach((control, c) => {
            if (!control.part) return;
            raw.push({ name: "vehicle-control-" + c, type: "drive", trigger: "always", part: control.part, input: control.input,
                axisVector: [-control.axis[0], -control.axis[1], -control.axis[2]], degrees: control.degrees, exact: true });
        });
        return raw;
    }
    // The pivots a block gives its parts: an axle or a line the file wrote always; one taken from a part's box only
    // for a part no list of the sidecar gives a pivot.
    function pivotsOf(block, out) {
        const give = (part, at, written) => {
            if (!part || !at) return;
            if (!written && ((block.pivoted && block.pivoted.has(part)) || (block.carved && block.carved.has(part)))) return;
            out[part] = at.slice();
        };
        for (const wheel of block.wheels) {
            give(wheel.part, wheel.at, wheel.written);
            for (const other of wheel.with) give(other, wheel.at, wheel.written);
        }
        for (const control of block.controls) give(control.part, control.at, control.written);
        return out;
    }

    //-------------------------------------------------------------------------
    // A built instance

    let bindScratch = null;
    // The box, in model space, of the meshes that carry a part's name: [min, max] or null.
    function partBox(object, name) {
        let min = null, max = null;
        object.traverse(mesh => {
            if (!mesh.isMesh || !mesh.geometry || !mesh.userData || !mesh.userData.parts) return;
            if (!mesh.userData.parts.some(part => part && part.name === name)) return;
            const position = mesh.geometry.getAttribute("position"), index = mesh.geometry.getIndex();
            if (!position || position.isInterleavedBufferAttribute) return;
            const e = meshMatrix(object, mesh), array = position.array, count = index ? index.count : position.count;
            for (let n = 0; n < count; n++) {
                const i = (index ? index.array[n] : n) * 3, x = array[i], y = array[i + 1], z = array[i + 2];
                const px = e[0] * x + e[4] * y + e[8] * z + e[12], py = e[1] * x + e[5] * y + e[9] * z + e[13], pz = e[2] * x + e[6] * y + e[10] * z + e[14];
                if (!min) { min = [px, py, pz]; max = [px, py, pz]; continue; }
                if (px < min[0]) min[0] = px; if (py < min[1]) min[1] = py; if (pz < min[2]) min[2] = pz;
                if (px > max[0]) max[0] = px; if (py > max[1]) max[1] = py; if (pz > max[2]) max[2] = pz;
            }
        });
        return min ? [min, max] : null;
    }

    // Where a part turns about, in model space: the pivot its meshes record, else the origin of the bone or node of
    // that name. Null for a model with no such part.
    function partPivot(object, name) {
        let found = null;
        object.traverse(mesh => {
            if (found || !mesh.isMesh || !mesh.userData || !mesh.userData.parts) return;
            const part = mesh.userData.parts.find(entry => entry && entry.name === name);
            if (!part || !vec3(part.pivot)) return;
            const e = meshMatrix(object, mesh), x = part.pivot[0], y = part.pivot[1], z = part.pivot[2];
            found = [round3(e[0] * x + e[4] * y + e[8] * z + e[12]), round3(e[1] * x + e[5] * y + e[9] * z + e[13]), round3(e[2] * x + e[6] * y + e[10] * z + e[14])];
        });
        if (found) return found;
        const node = R.landmarkNode ? R.landmarkNode(object, name) : null;
        if (!node || node === object) return null;
        const e = meshMatrix(object, node);
        return [round3(e[12]), round3(e[13]), round3(e[14])];
    }

    // The fronts already looked for: by a model's name (`key`), and by the measure every instance of one loaded
    // file shares with its template (`userData.glbSize`), each per kind.
    const fronts = new Map();
    const frontsOf = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    // The front of a model whose file names none, looked for on the first instance (or the template) of it that
    // comes to hand: the end where its kind's hands lie nearer a surface. Once a block; once a model, where the
    // model can be told (its name, or the measure its instances share). The triangles read for it are let go again.
    function openFront(object, block, key) {
        block.frontOpen = false;
        block.frontFound = true;
        const known = key ? key + "|" + block.kind : "";
        const model = frontsOf && object.userData && object.userData.glbSize && typeof object.userData.glbSize === "object" ? object.userData.glbSize : null;
        const byModel = model ? frontsOf.get(model) : null;
        let forward = (known && fronts.get(known)) || (byModel && byModel[block.kind]) || "";
        if (!forward) {
            const kept = shapes.has(object);
            forward = findFront(boxOf(object), block.kind, object);
            if (!kept) forgetShape(object);
            if (model) {
                if (byModel) byModel[block.kind] = forward;
                else frontsOf.set(model, { [block.kind]: forward });
            }
        }
        if (known && !fronts.has(known)) fronts.set(known, forward);
        if (forward !== block.forward) setFront(block, forward);
    }

    /**
     * Ties a block to a built instance at rest. A front the file does not name is looked for (once a block; with
     * `key`, a name for the model, once a model). A wheel the file names without an axle gets it from its part's box
     * and a control with a part and no place its part's pivot (once a model: the block keeps them); wheel and control
     * parts get their pivots; each point of `points` marked as model space is turned into the frame of the part it
     * rides, and one whose part the model lacks is dropped and reported in `block.problems`. The block is kept on
     * the object.
     */
    function bind(object, block, points, key) {
        if (!object || !block || typeof THREE === "undefined") return null;
        object.updateMatrixWorld(true);
        if (block.frontOpen) openFront(object, block, key);
        complete(block, boxOf(object));
        const node = name => (R.landmarkNode ? R.landmarkNode(object, name) : null) || (name ? null : object);
        const missing = (point, part) => {
            if (!block.problems.some(p => p.key === "missingPart" && p.args.point === point)) block.problems.push({ key: "missingPart", args: { point, part } });
        };
        block.wheels.forEach((wheel, w) => {
            if (wheel.at && wheel.radius) return;
            const box = partBox(object, wheel.part);
            if (!box) { missing("wheel." + w, wheel.part); return; }
            if (!wheel.at) wheel.at = [round3((box[0][0] + box[1][0]) / 2), round3((box[0][1] + box[1][1]) / 2), round3((box[0][2] + box[1][2]) / 2)];
            if (!wheel.radius) wheel.radius = round3((box[1][1] - box[0][1]) / 2);
            if (!wheel.side) {
                const across = wheel.at[0] * block.left[0] + wheel.at[2] * block.left[2];
                wheel.side = Math.abs(across) < 0.02 * Math.max(box[1][0] - box[0][0], box[1][2] - box[0][2]) ? "" : across > 0 ? "left" : "right";
            }
        });
        if (R.applyPivotOverrides) R.applyPivotOverrides(object, pivotsOf(block, {}));
        // A control that names a part and no place turns about its part's own pivot: that is its line's place, so
        // a hand that follows it without riding the part swings about the same line.
        block.controls.forEach((control, c) => {
            if (control.at || !control.part) return;
            control.at = partPivot(object, control.part);
            if (!control.at) missing("control." + c, control.part);
        });
        const s = bindScratch || (bindScratch = { v: new THREE.Vector3() });
        // A seat filled in from the box and an axle measured just now were not among the points the reader made.
        const marks = points || {}, all = landmarksOf(block, {});
        for (const name of Object.keys(all)) if (!marks[name]) marks[name] = all[name];
        const follow = {};
        for (const name of Object.keys(marks)) {
            const mark = marks[name];
            if (!mark || mark.space !== "model") continue;
            const part = node(mark.part);
            if (!part) {
                missing(name, mark.part);
                delete marks[name];
                continue;
            }
            part.worldToLocal(object.localToWorld(s.v.fromArray(mark.offset)));
            mark.offset = [s.v.x, s.v.y, s.v.z];
            mark.space = "part";
        }
        // A point that follows a control without riding its part is turned by arithmetic when it is asked for.
        block.seats.forEach((seat, n) => {
            for (const name of POINTS) {
                const at = seat[name];
                if (!at || !at.follows) continue;
                const c = block.controls.findIndex(control => control.input === at.follows && control.at);
                if (c >= 0 && !(block.controls[c].part && block.controls[c].part === at.part)) follow["ride." + n + "." + name] = c;
            }
        });
        object.__reactorVehicle = block;
        object.__reactorVehicleBound = { block, follow, inputs: null, kind: block.kind };
        if (!points) {
            // Bound by hand (a model with no block of its own): the points are kept as landmarks are.
            const bound = object.__reactorLandmarks || (object.__reactorLandmarks = {});
            for (const name of Object.keys(marks)) bound[name] = { node: node(marks[name].part) || object, offset: marks[name].offset };
        }
        return block;
    }

    /**
     * The block a built instance was bound with. With a `kindName`, an instance that has none is given a guess
     * (its front looked for once a model, by `key`), and one whose seat or steering line was filled in for another
     * kind (the readers do not know the kind) has them filled in again for this one.
     */
    function blockOf(object, kindName, key) {
        if (!object) return null;
        const block = object.__reactorVehicle;
        if (block) {
            const bound = object.__reactorVehicleBound;
            if (kindName && (bound ? bound.kind : block.kind) !== kindName && own(KINDS, kindName)) rekind(object, block, kindName, key);
            return block;
        }
        if (!kindName) return null;
        // Read from the bare box: the binder looks for the front itself, by the model's name.
        return bind(object, read(null, boxFrom(boxOf(object)), kindName), null, key);
    }
    // An instance bound for one kind, asked for as another: what was guessed for the first kind (a seat, a steering
    // line, a front that was looked for) is guessed again and bound again. What the file wrote stands. The block is
    // one for every instance of its file, so another instance may have had it guessed again already: this one's own
    // points of the first guess are dropped and bound again all the same.
    function rekind(object, block, kindName, key) {
        // A block put on an object by hand was never bound: it is bound as it stands first.
        if (!object.__reactorVehicleBound) bind(object, block, null, key);
        const bound = object.__reactorVehicleBound;
        if (!bound) return;
        bound.kind = kindName;
        if (!block.wants || !(block.wants.seats || block.wants.controls || block.frontFound)) return;
        const marks = object.__reactorLandmarks;
        if (marks) for (const name of Object.keys(marks)) {
            if ((block.wants.seats && name.indexOf("ride.") === 0) || (block.wants.controls && name.indexOf("control.") === 0)) delete marks[name];
        }
        if (block.kind !== kindName) {
            block.kind = kindName;
            block.boxed = false;
            if (block.wants.seats) block.seats = [];
            if (block.wants.controls) block.controls = [];
            if (block.frontFound) block.frontOpen = true;
        }
        bind(object, block, null, key);
    }

    let pointScratch = null;
    /**
     * Where a named point of a built vehicle is now, in world space: it rides its part, and a point that follows a
     * control with no part of its own is turned about the control's line by the drawn angle. Null for a model with
     * no such point.
     */
    function pointWorld(object, name, out) {
        const marks = object && object.__reactorLandmarks, mark = marks && marks[name];
        if (!mark || !out) return null;
        mark.node.localToWorld(out.fromArray(mark.offset));
        const bound = object.__reactorVehicleBound;
        const c = bound ? bound.follow[name] : undefined;
        if (c === undefined || !bound.inputs) return out;
        const control = bound.block.controls[c], amount = bound.inputs[control.input] || 0;
        const line = marks["control." + c];
        if (!amount || !line) return out;
        const s = pointScratch || (pointScratch = { at: new THREE.Vector3(), axis: new THREE.Vector3() });
        line.node.localToWorld(s.at.fromArray(line.offset));
        s.axis.set(control.axis[0], control.axis[1], control.axis[2]).transformDirection(line.node.matrixWorld);
        // A turn to the right is a negative turn about a line that points up.
        return out.sub(s.at).applyAxisAngle(s.axis, -control.degrees * DEG * amount).add(s.at);
    }

    //-------------------------------------------------------------------------
    // The ride as it is drawn

    // `active`: how many holders carry the ride (0, 1 or 2). `seen`: a vehicle was posed or ridden since the scene
    // was last cleared; on a map with no vehicle the per-model wrappers test one of these two flags and nothing more.
    const rides = { active: 0, seen: false, vehicle: null, rider: null, byBinding: new WeakMap() };
    /** How often this file's own work ran, for the tests that pin what a map with no vehicle pays. */
    const counts = { ask: 0, drive: 0, look: 0, pose: 0, rest: 0 };
    const SPRING = 18, DAMPING = 0.5;
    const ALPHA = 2 * DAMPING * SPRING * TICK, BETA = SPRING * SPRING * TICK * TICK;
    const SINK_MOST = 0.2, RISE_MOST = 0.25;
    // FOOT_STILL: how far the foot may have moved since the vehicle was last drawn before it is drawn again
    // (a hundredth of a degree of tip).
    const NOD = 6 * DEG, NOD_SPEED = 6, FOOT_TIP = 5 * DEG, FOOT_STILL = 0.002;
    const CATCH_UP = 6, LONG_GAP = 30;

    const typeFor = character => {
        const world = root.ReactorVehicles;
        const type = world && typeof world.type === "function" && character ? world.type(character._rrVehicle) : null;
        return type && type.handling ? type : typeOf(null);
    };
    const playerNow = () => typeof $gamePlayer !== "undefined" && $gamePlayer ? $gamePlayer : null;

    /** A character's heading when it carries one (a vehicle), else NaN. */
    function heading(character) {
        return character && finite(character._rrYaw) ? character._rrYaw : NaN;
    }

    /**
     * What a ridden vehicle's parts follow this frame, kept on its holder: `steer` is the drawn share of full lock
     * (bars barely move at speed; the lean does the turning). Null for anything that is not being ridden. No field
     * of the ride carries throttle or brake yet: they read 0.
     */
    function inputs(holder, character, scale) {
        if (!holder || !character || !character._rrBoarded) return null;
        const out = holder.rrInputs || (holder.rrInputs = { steer: 0, throttle: 0, brake: 0, aim: 0, aimPitch: 0, lift: 0, bank: 0 });
        const block = holder.object ? holder.object.__reactorVehicle : null;
        let ratio = 7 / 30;
        if (block) for (let i = 0; i < block.controls.length; i++) {
            const control = block.controls[i];
            if (control.input === "steer" && control.degrees > 0) { ratio = control.degreesAtSpeed / control.degrees; break; }
        }
        const top = typeFor(character).handling.speed;
        const share = Math.min(1, Math.abs(num(character._rrSpeed)) / top);
        out.steer = clamp(num(character._rrSteer), -1, 1) * (1 + (ratio - 1) * share);
        return out;
    }

    let poseScratch = null;
    const scratch = () => poseScratch || (poseScratch = { q: new THREE.Quaternion(), euler: new THREE.Euler(), v: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) });

    // What turns a model so its front lies along +Z with its top up: the spec's own tilt, then the turn that brings
    // its front mark (the spec's, else the block's front) round. Kept per holder until the spec or the block changes.
    function baseTurn(draw, spec, block, out) {
        const front = spec && spec.faces && Array.isArray(spec.faces.front) ? spec.faces.front : (block ? block.f : null);
        if (draw.baseSpec === spec && draw.baseFront === front) return draw.base;
        const s = scratch();
        out.setFromEuler(s.euler.set((spec && spec.pitch) || 0, 0, (spec && spec.roll) || 0, "YXZ"));
        if (front) {
            s.v.set(front[0], front[1], front[2]).applyQuaternion(out);
            s.v.y = 0;
            if (s.v.lengthSq() > 1e-8) out.premultiply(s.q.setFromAxisAngle(s.up, -Math.atan2(s.v.x, s.v.z)));
        } else if (spec && spec.yaw) {
            out.premultiply(s.q.setFromAxisAngle(s.up, spec.yaw));
        }
        draw.baseSpec = spec;
        draw.baseFront = front;
        return out;
    }
    // Heading, then pitch about the side it now has, then lean about its own length, over the base turn.
    function attitude(out, yaw, pitch, lean, base) {
        const s = scratch();
        out.setFromEuler(s.euler.set(-pitch, Math.PI - yaw, lean, "YXZ"));
        return base ? out.multiply(base) : out;
    }

    const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    // How far onto its stand a vehicle is: 1 parked; coming upright over the last four ticks of the hop on, and
    // going back over through the hop off.
    function standShare(character) {
        if (!character._rrBoarded) return 1;
        const player = playerNow(), mount = player && player._rrMount;
        if (!mount || !(mount.n > 0)) return 0;
        if (mount.on) return 1 - smooth((mount.t - (mount.n - 4)) / 4);
        return smooth(mount.t / mount.n);
    }

    function drawOf(holder) {
        return holder.rrDraw || (holder.rrDraw = { base: new THREE.Quaternion(), baseSpec: undefined, baseFront: undefined,
            y: 0, vy: 0, target: 0, nod: 0, nodV: 0, frame: -1, speed: 0, foot: 0, busy: false });
    }
    // How far the rider's stand-side foot is down under the ridden vehicle, 0 to 1: the rider's own foot when the
    // rider's file keeps one (a sole that cannot reach the ground is not down), else the mover's. Through the hop
    // off it is what it was when the hop began, whatever the leg does on its way: the vehicle leans from where the
    // foot held it.
    function footOf(draw) {
        const player = playerNow(), mount = player && player._rrMount;
        if (mount && mount.n > 0 && !mount.on) return draw.foot;
        const drive = player && player._rrDrive;
        const riderHolder = rides.rider, rider = riderHolder && riderHolder.rider;
        return clamp(num(rider && finite(rider.footDown) ? rider.footDown : (drive ? drive.foot : 0)), 0, 1);
    }

    /**
     * A built vehicle stood at a heading with nobody driving it (a battle's stage): its attitude only, upright or leant.
     * Returns its block.
     */
    function stand(object, spec, yaw, kindName, lean) {
        if (!object || typeof THREE === "undefined") return null;
        const block = blockOf(object, kindName, spec);
        const draw = object.__reactorStand || (object.__reactorStand = { base: new THREE.Quaternion(), baseSpec: undefined, baseFront: undefined });
        // (`lean`: over on its side by that much, a wreck.)
        attitude(object.quaternion, num(yaw), 0, num(lean), baseTurn(draw, spec, block, draw.base));
        return block;
    }

    /**
     * Writes a vehicle's drawn attitude over what the placement gave it: its heading, pitch and lean, the lean of its
     * stand while nobody rides it, the tip onto the rider's foot at a stop; its height through a spring, so a curb
     * is a bounce and a landing a dip; a nod of the nose when it is stopped dead. For a seated character it asks the
     * rider's file for the seat. Called as the last step of a model's placement. A pitch, lean or speed that is not
     * a finite number reads 0.
     */
    function pose(holder, character, object, spec, ground) {
        if (!holder || !character || !object || typeof THREE === "undefined") return;
        if (!character._rrVehicle) {
            if (character._rrSeated || character._rrMount) seatRider(holder, character, object, spec);
            return;
        }
        const yaw = character._rrYaw;
        if (!finite(yaw)) return;
        // Ridden, it is its rider's body: nothing thins it for standing between the eye and the rider.
        if (!!object.__rrCutRide !== !!character._rrBoarded && typeof R.cutawayMarkRide === "function") R.cutawayMarkRide(object, !!character._rrBoarded);
        counts.pose++;
        rides.seen = true;
        const draw = drawOf(holder);
        const type = typeFor(character);
        const block = blockOf(object, type.kind, holder.spec);
        // The ticks since it was last drawn: the springs move by the game's clock, not by the frame rate. With no
        // clock (the editor), after a long gap and the first time, the height is where the placement put it.
        const clocked = typeof Graphics !== "undefined" && !!Graphics && finite(Graphics.frameCount);
        const now = clocked ? Graphics.frameCount : 0;
        const first = !clocked || draw.frame < 0 || now < draw.frame || now - draw.frame > LONG_GAP;
        const ticks = first ? 0 : Math.min(CATCH_UP, now - draw.frame);
        draw.frame = clocked ? now : -1;
        const target = object.position.y;
        const speed = num(character._rrSpeed);
        if (first) {
            draw.y = target; draw.vy = 0; draw.nod = 0; draw.nodV = 0;
        } else if (ticks === 0) {
            // Drawn twice in one tick: what the spring holds is kept over wherever the target now is.
            draw.y += target - draw.target;
        } else {
            // Stopped dead (a wall, an event's tile): the nose dips by how fast it was going and comes back.
            const lost = Math.abs(draw.speed) - Math.abs(speed);
            if (Math.abs(speed) < 0.5 && lost / ticks > 2) draw.nodV -= NOD * Math.min(1, lost / NOD_SPEED) * SPRING / 0.55;
            for (let i = 0; i < ticks; i++) {
                // The height follows its target with no lag on a slope and a bounce over a step.
                const ahead = draw.y + draw.vy * TICK, miss = target - ahead;
                draw.y = ahead + ALPHA * miss;
                draw.vy += BETA / TICK * miss;
                draw.nodV += (-SPRING * SPRING * draw.nod - 2 * DAMPING * SPRING * draw.nodV) * TICK;
                draw.nod += draw.nodV * TICK;
            }
            if (draw.y < target - SINK_MOST) { draw.y = target - SINK_MOST; if (draw.vy < 0) draw.vy = 0; }
            if (draw.y > target + RISE_MOST) { draw.y = target + RISE_MOST; if (draw.vy > 0) draw.vy = 0; }
        }
        draw.speed = speed;
        draw.target = target;
        draw.busy = Math.abs(draw.y - target) > 0.002 || Math.abs(draw.vy) > 0.05 || Math.abs(draw.nod) > 0.0005 || Math.abs(draw.nodV) > 0.005;

        // Toward its stand's side: the stand's lean by how far onto the stand it is, and off the stand the tip onto
        // the rider's foot. The two are one blend, so getting off goes from the foot onto the stand without coming
        // upright between.
        const stand = block && block.stand ? block.stand : null;
        const side = stand && stand.side === "right" ? 1 : -1;
        const parked = standShare(character);
        if (character._rrBoarded) draw.foot = footOf(draw);
        const lean = num(character._rrLean) + side * (FOOT_TIP * draw.foot * (1 - parked) + (stand ? stand.lean * DEG * parked : 0));
        const base = baseTurn(draw, spec, block, draw.base);
        attitude(object.quaternion, yaw, num(character._rrPitch) + draw.nod, lean, base);
        object.position.y = draw.y;
    }

    // The rider's place on the seat: the rider's file's, when it is loaded; else the seat point with the vehicle's
    // attitude, standing in it.
    function seatRider(holder, character, object, spec) {
        const ride = character._rrRide;
        // The leader's is the ridden vehicle; a follower's is the one its own ride names.
        let vehicleHolder = rides.vehicle;
        if (typeof character._memberIndex === "number" && character !== playerNow() && ride && typeof $gameMap !== "undefined" && $gameMap && typeof R.modelHolderFor === "function") {
            const event = $gameMap.event(ride.id);
            vehicleHolder = event ? R.modelHolderFor(event) : null;
        }
        if (!vehicleHolder || !vehicleHolder.object || !ride || !vehicleHolder.character
            || (vehicleHolder.character.eventId && vehicleHolder.character.eventId() !== ride.id)) return;
        if (R.Rider && typeof R.Rider.seat === "function") { R.Rider.seat(holder, character, object, vehicleHolder); return; }
        if (!character._rrSeated) return;
        const vehicle = vehicleHolder.character, draw = drawOf(holder), s = scratch();
        const size = object.userData && object.userData.glbSize;
        const tall = (size ? size.y : 1.7) * object.scale.y;
        if (!pointWorld(vehicleHolder.object, "ride.0.seat", s.v)) s.v.copy(vehicleHolder.object.position).y += 0.5 * tall;
        const x = s.v.x, y = s.v.y, z = s.v.z;
        const vehicleDraw = vehicleHolder.rrDraw;
        attitude(object.quaternion, num(vehicle._rrYaw), num(vehicle._rrPitch) + (vehicleDraw ? vehicleDraw.nod : 0), num(vehicle._rrLean), baseTurn(draw, spec, null, draw.base));
        // The hips of a standing figure are a little over half its height up.
        s.v.set(0, 1, 0).applyQuaternion(object.quaternion);
        object.position.set(x - s.v.x * 0.47 * tall, y - s.v.y * 0.47 * tall, z - s.v.z * 0.47 * tall);
    }

    /**
     * How far each axle is from a vehicle's middle along its heading, in tiles at the size it is bound at: into
     * `out.front` and `out.rear`, from the wheels of its model's block. `out` is left as it came while the model is
     * not built yet or names fewer than two axles.
     */
    function axles(event, type, out) {
        const holder = event && typeof R.modelHolderFor === "function" ? R.modelHolderFor(event) : null;
        const object = holder && holder.object;
        if (!object || !out) return out;
        const kept = holder.rrAxles || (holder.rrAxles = { object: null, block: null, size: 0, front: NaN, rear: NaN });
        const block = blockOf(object, type && type.kind, holder.spec);
        const spec = typeof R.characterModelSpec === "function" ? R.characterModelSpec(event) : null;
        const model = spec || (type && type.model) || null;
        const size = model && model.size > 0 ? model.size * (model.scale > 0 ? model.scale : 1) : 0;
        if (kept.object !== object || kept.block !== block || kept.size !== size) {
            kept.object = object; kept.block = block; kept.size = size;
            kept.front = kept.rear = NaN;
            const extent = object.userData && object.userData.glbSize;
            const span = extent ? Math.max(extent.x, extent.y, extent.z) : 0;
            if (block && span > 0 && size > 0) {
                let front = -Infinity, rear = Infinity, count = 0;
                for (const wheel of block.wheels) {
                    if (!wheel.at) continue;
                    const along = wheel.at[0] * block.f[0] + wheel.at[2] * block.f[2];
                    if (along > front) front = along;
                    if (along < rear) rear = along;
                    count++;
                }
                if (count >= 2 && front > rear) { kept.front = front * size / span; kept.rear = -rear * size / span; }
            }
        }
        if (finite(kept.front) && finite(kept.rear)) { out.front = kept.front; out.rear = kept.rear; }
        return out;
    }

    /** The ride kept on a model's holder: { riding, inputs, travel } while it is the ridden vehicle or its rider. */
    function rideOf(holder) { return (holder && holder.rrRide) || null; }

    function attach(holder, riding) {
        if (!holder) return null;
        const ride = holder.rrRide || (holder.rrRide = { riding: false, inputs: null, travel: undefined, travelWas: NaN, binding: null });
        ride.riding = riding;
        if (holder.binding && ride.binding !== holder.binding) {
            ride.binding = holder.binding;
            rides.byBinding.set(holder.binding, ride);
        }
        return ride;
    }
    function detach(holder) {
        if (!holder || !holder.rrRide) return;
        if (holder.rrRide.binding) rides.byBinding.delete(holder.rrRide.binding);
        holder.rrRide = null;
        // Its parts were where the ride left them: one more pass puts the bars straight (`parkedAtRest`).
        holder.rrSettle = true;
        const bound = holder.object && holder.object.__reactorVehicleBound;
        if (bound) bound.inputs = null;
    }

    /**
     * Says which two model holders are the ridden vehicle and its rider this frame (either may be null), and works
     * out what the vehicle's parts follow. The game's sync does this by itself from the saved fields; the editor's
     * canvas and a test call it with their own holders. `drive(null, null)` ends the ride.
     */
    function drive(vehicleHolder, riderHolder, scale) {
        counts.drive++;
        if (vehicleHolder || riderHolder) rides.seen = true;
        if (rides.vehicle && rides.vehicle !== vehicleHolder) detach(rides.vehicle);
        if (rides.rider && rides.rider !== riderHolder) detach(rides.rider);
        rides.vehicle = vehicleHolder || null;
        rides.rider = riderHolder || null;
        rides.active = (vehicleHolder ? 1 : 0) + (riderHolder ? 1 : 0);
        if (vehicleHolder) {
            const ride = attach(vehicleHolder, false), character = vehicleHolder.character;
            ride.inputs = inputs(vehicleHolder, character, scale);
            const bound = vehicleHolder.object && vehicleHolder.object.__reactorVehicleBound;
            if (bound) bound.inputs = ride.inputs;
            // The road rolled since the wheels were last turned, signed along the heading.
            const travel = character && finite(character._rrTravel) ? character._rrTravel : NaN;
            const rolled = travel - ride.travelWas;
            ride.travel = finite(rolled) && Math.abs(rolled) < 8 ? rolled : 0;
            ride.travelWas = travel;
        }
        if (riderHolder) {
            const character = riderHolder.character;
            attach(riderHolder, !!(character && character._rrSeated));
        }
    }

    // The game's own ride: the player's saved fields name the vehicle; the two holders are this scene's.
    function driveFromGame(scene, player) {
        counts.ask++;
        let ride = player && (player._rrSeated || player._rrMount) ? player._rrRide : null;
        // A ride saved on another map is not this map's event of the same id.
        if (ride && finite(ride.map) && typeof $gameMap !== "undefined" && $gameMap && typeof $gameMap.mapId === "function" && $gameMap.mapId() !== ride.map) ride = null;
        const instances = scene && scene._modelInstances;
        if (!ride || !instances) { if (rides.active) { drive(null, null); driveConvoy(null, null); } return; }
        const vehicleHolder = instances.get("e" + ride.id) || null;
        const riderHolder = instances.get(R.modelInstanceKey ? R.modelInstanceKey(player) : "p") || null;
        const vehicle = vehicleHolder && vehicleHolder.character;
        const aboard = vehicle && vehicle._rrVehicle && vehicle._rrBoarded ? vehicleHolder : null;
        drive(aboard, aboard ? riderHolder : null, 1);
        driveConvoy(instances, player);
    }

    // The followers that ride vehicles of their own (ReactorVehicles.Convoy): each one's vehicle turns its wheels by
    // the road it rolled, and its rider's motion is the riding one. Holders that rode last frame and do not now are let go.
    let convoyHeld = [];
    function driveConvoy(instances, player) {
        const followers = player && player._followers && Array.isArray(player._followers._data) ? player._followers._data : null;
        const now = [];
        if (followers && instances) for (let i = 0; i < followers.length; i++) {
            const follower = followers[i], ride = follower._rrSeated ? follower._rrRide : null;
            if (!ride) continue;
            const vehicleHolder = instances.get("e" + ride.id) || null, vehicle = vehicleHolder && vehicleHolder.character;
            if (!vehicle || !vehicle._rrVehicle || !vehicle._rrBoarded) continue;
            const turned = attach(vehicleHolder, false);
            turned.inputs = inputs(vehicleHolder, vehicle, 1);
            const bound = vehicleHolder.object && vehicleHolder.object.__reactorVehicleBound;
            if (bound) bound.inputs = turned.inputs;
            const travel = finite(vehicle._rrTravel) ? vehicle._rrTravel : NaN, rolled = travel - turned.travelWas;
            turned.travel = finite(rolled) && Math.abs(rolled) < 8 ? rolled : 0;
            turned.travelWas = travel;
            now.push(vehicleHolder);
            const riderHolder = instances.get(R.modelInstanceKey ? R.modelInstanceKey(follower) : "") || null;
            if (riderHolder) { attach(riderHolder, true); now.push(riderHolder); }
        }
        for (let i = 0; i < convoyHeld.length; i++) if (now.indexOf(convoyHeld[i]) < 0 && convoyHeld[i] !== rides.vehicle && convoyHeld[i] !== rides.rider) detach(convoyHeld[i]);
        convoyHeld = now;
        if (now.length) { rides.seen = true; rides.active += now.length; }
    }

    // Whether a vehicle nobody rides has nothing for an animation pass to do: its rules are only its block's (a
    // wheel rolls by the road, a control follows a driver), it stands where the last pass left it, nothing was
    // asked of it (a motion, a flash), and its parts are not where a ride left them.
    function parkedAtRest(holder, character) {
        if (holder.rrSettle || holder.action || holder.flash) return false;
        if (character._realX !== holder.lastX || character._realY !== holder.lastY) return false;
        const rules = holder.rules;
        let rest = holder.rrRest;
        if (!rest || rest.rules !== rules) {
            let only = !!(rules && rules.length);
            if (only) for (let i = 0; i < rules.length; i++) if (!rules[i].rrVehicle) { only = false; break; }
            rest = holder.rrRest = { rules, only };
        }
        return rest.only;
    }

    //-------------------------------------------------------------------------
    // Wrappers. Each is installed only when what it wraps is loaded, and each passes a model or a
    // character that is no vehicle and no rider straight through after one test of its own argument.

    const wrap = (owner, name, make) => {
        const base = owner && owner[name];
        if (typeof base !== "function" || base.__rrVehicles) return;
        const wrapped = make(base);
        Object.assign(wrapped, base);
        wrapped.__rrVehicles = true;
        owner[name] = wrapped;
    };

    // Whether the rule reader keeps what a vehicle's rules need (the `drive` type and a rule's own axis). Asked once.
    let rulesReady = null;
    function rulesKept(reader, owner) {
        if (rulesReady === null) {
            const made = reader.call(owner, { animations: [{ type: "drive", part: "x", input: "steer", axisVector: [0, 1, 0], degrees: 30, exact: true }] });
            rulesReady = !!(made && made[0] && made[0].type === "drive" && Array.isArray(made[0].axisVector) && made[0].exact === true);
        }
        return rulesReady;
    }

    // The face points plus the vehicle's points, each marked as model space; the block rides along.
    wrap(R, "readModelLandmarks", base => function(json) {
        const points = base.apply(this, arguments);
        if (!json || !isObject(json.vehicle)) return points;
        const block = read(json, null);
        landmarksOf(block, points);
        Object.defineProperty(points, "__rrVehicle", { value: block, enumerable: false });
        return points;
    });
    // Before the points are bound: each of the vehicle's turned into the frame of the part it rides.
    wrap(R, "bindModelLandmarks", base => function(object, points) {
        if (points && points.__rrVehicle && object) bind(object, points.__rrVehicle, points);
        return base.apply(this, arguments);
    });
    // The rules a block makes, read by the reader itself so they are in its own form.
    wrap(R, "readModelAnimationRules", base => function(json) {
        const rules = base.apply(this, arguments);
        if (!json || !isObject(json.vehicle) || !rulesKept(base, this)) return rules;
        const raw = rulesOf(read(json, null));
        if (!raw.length) return rules;
        // Marked as the block's own, so a parked vehicle that has no other rule skips its animation pass.
        const made = base.call(this, { animations: raw });
        for (const rule of made) rule.rrVehicle = true;
        return rules.concat(made);
    });
    // A wheel's axle and a control's line are written once, in the block.
    wrap(R, "readModelPivots", base => function(json) {
        const pivots = base.apply(this, arguments);
        if (!json || !isObject(json.vehicle)) return pivots;
        return pivotsOf(read(json, null), pivots);
    });
    if (R.StillModels) {
        // A vehicle and a seated rider are posed as the last step of their placement, so what is noted is what is drawn.
        wrap(R.StillModels, "note", base => function(holder, character, object, spec, extent, ground) {
            const ours = character && (character._rrVehicle || character._rrSeated || character._rrMount);
            if (ours) pose(holder, character, object, spec, ground);
            const result = base.apply(this, arguments);
            if (ours && holder.placed) holder.placed.rrPose = character._rrPose;
            return result;
        });
        // A vehicle is placed again when what is drawn of it changed, while its springs are still moving, and while
        // the foot it is tipped onto is not where it was drawn (the rider's leg comes down over several frames).
        wrap(R.StillModels, "settled", base => function(holder, character) {
            if (character && character._rrVehicle) {
                if (!holder.placed || holder.placed.rrPose !== character._rrPose) return false;
                const draw = holder.rrDraw;
                if (draw && (draw.busy || (character._rrBoarded && Math.abs(footOf(draw) - draw.foot) > FOOT_STILL))) return false;
            }
            return base.apply(this, arguments);
        });
    }
    // The vehicles a sync placed while the still-model rule is switched off, to be posed after it.
    const loose = { on: false, count: 0, list: [] };
    // What rides a vehicle (a carried light) swings with its heading.
    wrap(R, "noteModelFacing", base => function(character, radians) {
        if (character) {
            if (character._rrVehicle && finite(character._rrYaw)) {
                if (loose.on) loose.list[loose.count++] = character;
                return base.call(this, character, Math.PI - character._rrYaw);
            }
            if (character._rrSeated && rides.vehicle && rides.vehicle.character && finite(rides.vehicle.character._rrYaw)) {
                return base.call(this, character, Math.PI - rides.vehicle.character._rrYaw);
            }
        }
        return base.apply(this, arguments);
    });
    // The ridden vehicle's rules read its inputs and the road it rolled; its rider's motion is the riding one.
    wrap(R, "applyModelAnimation", base => function(binding, rules, state) {
        if (rides.active && binding && state) {
            counts.look++;
            const ride = rides.byBinding.get(binding);
            if (ride) {
                state.riding = ride.riding;
                if (ride.inputs) state.inputs = ride.inputs;
                if (ride.travel !== undefined) state.travel = ride.travel;
            }
        }
        return base.apply(this, arguments);
    });
    // The ridden vehicle and its rider move every frame; a vehicle nobody rides, with nothing to play, is not
    // sampled at all (its wheels and bars stay as the last pass left them).
    wrap(R, "animationDue", base => function(holder, character) {
        if (rides.seen && holder) {
            if (holder.rrRide) { holder.sampled = true; return true; }
            if (character && character._rrVehicle) {
                counts.rest++;
                if (parkedAtRest(holder, character)) { holder.sampled = false; return false; }
                // The pass that follows a ride (or a move) is the one that puts its parts at rest.
                const due = base.apply(this, arguments);
                if (due) holder.rrSettle = false;
                return due;
            }
        }
        return base.apply(this, arguments);
    });
    if (R.MapScene && R.MapScene.prototype) {
        wrap(R.MapScene.prototype, "syncCharacterModels", base => function() {
            const player = playerNow();
            if ((player && player._rrRide) || rides.active) driveFromGame(this, player);
            if (!R.StillModels || R.StillModels.enabled) return base.apply(this, arguments);
            // With the still-model rule switched off nothing is noted: every vehicle the sync placed (each
            // publishes its facing as it is placed) is posed here, then the rider.
            loose.count = 0;
            loose.on = true;
            let result;
            try { result = base.apply(this, arguments); } finally { loose.on = false; }
            const map = typeof $dataMap !== "undefined" ? $dataMap : null, instances = this._modelInstances;
            for (let i = 0; i < loose.count; i++) {
                const character = loose.list[i];
                loose.list[i] = null;
                const holder = instances ? instances.get(R.modelInstanceKey(character)) : null;
                if (!holder || !holder.object) continue;
                pose(holder, character, holder.object, R.characterModelSpec(character), R.characterGround(map, character));
            }
            const rider = rides.rider;
            if (rider && rider.object && rider.character) {
                pose(rider, rider.character, rider.object, R.characterModelSpec(rider.character), R.characterGround(map, rider.character));
            }
            return result;
        });
        // A scene that drops its models drops the ride kept on them, and has seen no vehicle yet.
        wrap(R.MapScene.prototype, "clear", base => function() {
            if (rides.active) drive(null, null);
            rides.seen = false;
            return base.apply(this, arguments);
        });
    }

    R.Vehicles = {
        file: "reactor_3d_vehicles.js",
        KINDS, PLAYED, RANGES, STEP_MAX, POINTS,
        typeOf, stockTypeOf, typeNotes, forgetType, types: typesOf, startingEvents, startsOf, identityOf, placementOf, COPY,
        step, newState,
        frame, forwardName, boxOf, shapeOf, forgetShape, surfaceNear, surfaceUnder,
        read, forget, guess, findFront, findWheels, pointNames, turnAbout,
        bind, blockOf, pointWorld,
        inputs, pose, stand, heading, drive, rideOf, axles, counts,
        // The pieces the wrappers are made of, for the tools and the tests.
        rulesOf: block => rulesOf(block), pivotsOf: block => pivotsOf(block, {}), landmarksOf: block => landmarksOf(block, {}),
        attitude, standShare
    };
    if (typeof module !== "undefined" && module.exports) module.exports = R;
})(typeof globalThis !== "undefined" ? globalThis : this);
