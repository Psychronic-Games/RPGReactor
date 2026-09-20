//=============================================================================
// reactor_3d_models.js — RPG Reactor 3D models
//=============================================================================
/*
 * An extension of Reactor3D (reactor_3d.js): how a character, an event, a
 * vehicle or a placed prop becomes a model in the scene. Loaded right after
 * the core, in the game from scriptUrls, in the editor from
 * Reactor3D.EXTENSIONS, and in Node by the core's own tail.
 *
 * In order: character models (a model per character, its facing, footprint
 * and ground); distance levels (loading GLB and VRM files, level of detail,
 * rigs and skinned meshes); the model's authored base transform; the look,
 * playback and live transform of a model; the scene's character model and
 * billboard sync; and placed model props. Effects that ride a model are in
 * reactor_3d_effects.js, which loads after this file.
 */

(function(root) {
    // Node alone takes the core from require; the NW.js page and the browser
    // find it on the global object, booted from scriptUrls.
    const node = typeof process !== "undefined" && process.versions && process.versions.node
        && !process.versions.nw && typeof require === "function";
    const Reactor3D = node ? require("./reactor_3d.js") : root.Reactor3D;
    if (!Reactor3D) return;

//-----------------------------------------------------------------------------
// Character models
//
// An event can stand as a sprite (the default, and what RPG Maker authored)
// or as a model in `3d/<name>/source/`. GLB, OBJ, FBX, STL, USDZ, 3MF, DXF
// and Blend are accepted. The note is Reactor-only and ignored by MZ:
//
//   <r3d>
//   model(Oth97_CNO_Consul)
//   size(2)
//   yaw(0)
//   scale(1)
//   </r3d>
//
// `size` fits the longest ground axis to that many tiles. `scale` is an extra
// multiplier. `yaw` is degrees added on top of the event's facing.

Reactor3D.MODEL_DIR = "3d/";
Reactor3D.MODEL_EXTS = [".glb", ".obj", ".fbx", ".stl", ".usdz", ".3mf", ".dxf", ".blend"];
Reactor3D._glbCache = Object.create(null);

Reactor3D.splitModelRef = function(named) {
    // Models organize into folders (3d/Weapons/long-sword/source/…), so a
    // name may carry forward-slash segments — but never an empty, ".", or
    // ".." segment: names come from map notes and sidecars, and a crafted
    // ref must not walk out of the 3d directory.
    let raw = String(named || "").trim().replace(/\\/g, "/");
    if (!raw) return null;
    let ext = "";
    const match = raw.match(/(\.[a-z0-9]+)$/i);
    if (match && this.MODEL_EXTS.indexOf(match[1].toLowerCase()) >= 0) {
        ext = match[1].toLowerCase();
        raw = raw.slice(0, -ext.length);
    }
    if (!raw) return null;
    const segments = raw.split("/");
    if (segments.some(part => !part || part === "." || part === "..")) return null;
    return { name: segments.join("/"), ext };
};

Reactor3D.modelSpecFromNote = function(note) {
    if (typeof note !== "string" || !note) return null;
    // Asked for every character every frame; a note parses once.
    const cache = this._noteSpecCache || (this._noteSpecCache = new Map());
    if (cache.has(note)) return cache.get(note);
    const spec = this._parseModelSpecFromNote(note);
    if (cache.size > 2000) cache.clear();
    cache.set(note, spec);
    return spec;
};

Reactor3D._parseModelSpecFromNote = function(note) {
    const block = note.match(/<\s*r3d\s*>([\s\S]*?)<\s*\/\s*r3d\s*>/i);
    const body = block ? block[1] : "";
    const named = (body.match(/model\s*\(\s*([^)\s]+)\s*\)/i)
        || note.match(/<\s*r3d\s*:\s*model\s*:\s*([^>\s]+)\s*>/i)
        || [])[1];
    const ref = this.splitModelRef(named);
    if (!ref) return null;
    const number = (label, fallback) => {
        const match = body.match(new RegExp(label + "\\s*\\(\\s*([-+0-9.]+)\\s*\\)", "i"));
        if (!match) return fallback;
        const value = Number(match[1]);
        return Number.isFinite(value) ? value : fallback;
    };
    return {
        name: ref.name,
        ext: ref.ext,
        size: number("size", 2),
        scale: number("scale", 1),
        yaw: number("yaw", 0) * Math.PI / 180,
        pitch: number("pitch", 0) * Math.PI / 180,
        roll: number("roll", 0) * Math.PI / 180
    };
};

Reactor3D.modelSourceName = function(name, ext, file) {
    if (file) {
        const ref = this.splitModelRef(file);
        if (ref) return ref.name + (ref.ext || ext || ".glb");
        const cleaned = String(file).replace(/[\\/]/g, "").trim();
        if (cleaned) return cleaned + (ext || ".glb");
    }
    return name + (ext || ".glb");
};

Reactor3D.modelUrls = function(name, ext, file) {
    const source = this.modelSourceName(name, ext, file);
    return ["3d/" + name + "/source/" + source, "3d/source/" + source];
};

Reactor3D.modelUrl = function(name, ext, file) {
    return this.modelUrls(name, ext, file)[0];
};

Reactor3D.modelTextureDir = function(name) {
    return "3d/" + name + "/textures/";
};

Reactor3D.modelCacheKey = function(name, ext, file) {
    return name + (ext || "") + (file ? ":" + file : "");
};

Reactor3D.eventModelSpec = function(mapData, eventId, pageIndex) {
    const pages = mapData && mapData.reactor3d && mapData.reactor3d.events
        && mapData.reactor3d.events[String(eventId)];
    if (!pages || typeof pages !== "object") return null;
    const spec = pages[String(pageIndex == null ? 0 : pageIndex)] || pages[pageIndex];
    return this.normalizeModelSpec(spec);
};

/** One raw sidecar entry → the validated spec every consumer shares. */
Reactor3D.normalizeModelSpec = function(spec) {
    if (!spec || !spec.name) return null;
    // Sidecar entries are stable objects asked about every frame per
    // character; the validated form is kept beside them.
    const cache = this._normalizedSpecs || (this._normalizedSpecs = new WeakMap());
    const known = cache.get(spec);
    if (known && known.forName === spec.name && known.forExt === spec.ext) return known.value;
    const value = this._normalizeModelSpecNow(spec);
    cache.set(spec, { forName: spec.name, forExt: spec.ext, value });
    return value;
};

Reactor3D._normalizeModelSpecNow = function(spec) {
    if (!spec || !spec.name) return null;
    const ref = this.splitModelRef(spec.name);
    if (!ref) return null;
    // Validated by lowercase, stored as shipped: the load URL must match the
    // file's real name (Plant_001.OBJ) on a case-sensitive filesystem.
    const ext = spec.ext && this.MODEL_EXTS.indexOf(String(spec.ext).toLowerCase()) >= 0
        ? String(spec.ext)
        : ref.ext;
    const size = Number(spec.size);
    const scale = Number(spec.scale);
    const yaw = Number(spec.yaw);
    const pitch = Number(spec.pitch);
    const roll = Number(spec.roll);
    const fileRef = spec.file ? this.splitModelRef(spec.file) : null;
    return {
        name: ref.name,
        file: fileRef ? fileRef.name : (spec.file ? String(spec.file) : ""),
        ext,
        size: Number.isFinite(size) && size > 0 ? size : 2,
        scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        // Per-axis stretch on top of the uniform size and scale.
        stretch: this.scaleAxes(spec.stretch).map(v => (Number(v) > 0 ? Number(v) : 1)),
        // Where the model stands relative to its event or character, in
        // tiles: x east, y south, z up. The event keeps its own tile; only
        // the model moves, so a door can sit flush against a wall.
        offset: (Array.isArray(spec.offset) ? spec.offset : [0, 0, 0]).slice(0, 3)
            .concat([0, 0, 0]).slice(0, 3).map(v => (Number.isFinite(Number(v)) ? Number(v) : 0)),
        yaw: Number.isFinite(yaw) ? yaw * Math.PI / 180 : 0,
        pitch: Number.isFinite(pitch) ? pitch * Math.PI / 180 : 0,
        roll: Number.isFinite(roll) ? roll * Math.PI / 180 : 0,
        faces: this.readModelFaces(spec.faces),
        texture: spec.texture ? String(spec.texture) : "",
        // Face-slot framing: how far in and how high up the camera looks.
        view: spec.view && typeof spec.view === "object"
            ? {
                zoom: Math.min(10, Math.max(1, Number(spec.view.zoom) || 3)),
                y: Math.min(1, Math.max(0, Number(spec.view.y) || 0.82))
            }
            : null
    };
};

Reactor3D.readModelFaces = function(faces) {
    if (!faces || typeof faces !== "object") return null;
    const out = {};
    const names = ["front", "back", "left", "right"];
    for (let i = 0; i < names.length; i++) {
        const point = faces[names[i]];
        if (!Array.isArray(point) || point.length < 3) continue;
        const x = Number(point[0]);
        const y = Number(point[1]);
        const z = Number(point[2]);
        if (![x, y, z].every(Number.isFinite)) continue;
        out[names[i]] = [x, y, z];
    }
    return Object.keys(out).length ? out : null;
};

Reactor3D.setEventModelSpec = function(mapData, eventId, pageIndex, spec) {
    if (!mapData || !eventId) return null;
    if (!mapData.reactor3d || typeof mapData.reactor3d !== "object") {
        mapData.reactor3d = { version: 1, mode: this.MODE_3D };
    }
    const store = mapData.reactor3d;
    if (!store.events || typeof store.events !== "object") store.events = {};
    const key = String(eventId);
    const page = String(pageIndex == null ? 0 : pageIndex);
    if (!spec || !spec.name) {
        if (store.events[key]) delete store.events[key][page];
        if (store.events[key] && !Object.keys(store.events[key]).length) delete store.events[key];
        if (!Object.keys(store.events).length) delete store.events;
        return null;
    }
    if (!store.events[key] || typeof store.events[key] !== "object") store.events[key] = {};
    const ref = this.splitModelRef(spec.name);
    if (!ref) return null;
    const ext = spec.ext && this.MODEL_EXTS.indexOf(String(spec.ext).toLowerCase()) >= 0
        ? String(spec.ext)
        : ref.ext;
    const fileRef = spec.file ? this.splitModelRef(spec.file) : null;
    const written = {
        name: ref.name,
        file: fileRef ? fileRef.name : "",
        ext,
        size: Number(spec.size) > 0 ? Number(spec.size) : 2,
        scale: Number(spec.scale) > 0 ? Number(spec.scale) : 1,
        yaw: Number.isFinite(Number(spec.yaw)) ? Number(spec.yaw) : 0,
        pitch: Number.isFinite(Number(spec.pitch)) ? Number(spec.pitch) : 0,
        roll: Number.isFinite(Number(spec.roll)) ? Number(spec.roll) : 0
    };
    const faces = this.readModelFaces(spec.faces);
    if (faces) written.faces = faces;
    if (spec.texture) written.texture = String(spec.texture);
    // A model nudged off its tile keeps the nudge; one standing on it writes nothing.
    const offset = this._normalizeModelSpecNow(Object.assign({ name: ref.name }, spec)).offset;
    if (offset.some(v => v)) written.offset = offset;
    store.events[key][page] = written;
    return store.events[key][page];
};

Reactor3D.hasEventModels = function(mapData) {
    // Asked per character sprite per frame; a map's answer never changes
    // while it is loaded.
    if (!mapData || typeof mapData !== "object") return this._hasEventModelsNow(mapData);
    const cache = this._hasEventModelsCache || (this._hasEventModelsCache = new WeakMap());
    if (cache.has(mapData)) return cache.get(mapData);
    const value = this._hasEventModelsNow(mapData);
    cache.set(mapData, value);
    return value;
};

Reactor3D._hasEventModelsNow = function(mapData) {
    const sidecar = mapData && mapData.reactor3d;
    // Props are models too (the game makes events of them at load; the
    // editor holds them as props).
    if (sidecar && Array.isArray(sidecar.props) && sidecar.props.some(prop => prop && prop.name)) return true;
    const events = sidecar && sidecar.events;
    if (!events || typeof events !== "object") return false;
    return Object.keys(events).some(id => {
        const pages = events[id];
        return pages && typeof pages === "object"
            && Object.keys(pages).some(page => pages[page] && pages[page].name);
    });
};

Reactor3D.characterModelSpec = function(character) {
    if (!character) return null;
    if (typeof character.event === "function") {
        const data = character.event();
        const pageIndex = character._pageIndex != null ? character._pageIndex : 0;
        const fromSidecar = this.eventModelSpec(
            typeof $dataMap !== "undefined" ? $dataMap : null,
            character.eventId ? character.eventId() : data && data.id,
            pageIndex
        );
        return fromSidecar || this.modelSpecFromNote(data && data.note);
    }
    // The player and followers carry the model of the actor they show:
    // an actor entry in the database sidecar puts the whole party in 3D.
    if (typeof Game_Player !== "undefined" && character instanceof Game_Player) {
        const leader = typeof $gameParty !== "undefined" && $gameParty ? $gameParty.leader() : null;
        return leader ? this.databaseModelSpec("actors", leader.actorId()) : null;
    }
    if (typeof Game_Follower !== "undefined" && character instanceof Game_Follower) {
        const actor = character.actor ? character.actor() : null;
        return actor ? this.databaseModelSpec("actors", actor.actorId()) : null;
    }
    return null;
};

/**
 * Database-wide 3D bindings: `data/Database.r3d.json` maps database ids
 * to model specs, exactly the shape a map sidecar's event entries use —
 * and kept out of the MZ database files so an RPG Maker editor never
 * sees an unfamiliar field.
 *   { "actors": { "<id>": spec }, "enemies": {...}, "weapons": {...},
 *     "armors": {...}, "items": {...} }
 */
Reactor3D.DATABASE_SIDECAR_URL = "data/Database.r3d.json";

Reactor3D.loadDatabaseSidecar = function() {
    if (this._databaseSidecarState) return;
    this._databaseSidecarState = "loading";
    const finish = parsed => {
        this._databaseSidecar = parsed && typeof parsed === "object" ? parsed : null;
        this._databaseSidecarState = "done";
    };
    // The absent file is the normal state for most projects; ask the disk
    // first so it never logs an unsuppressible network error.
    if (typeof Utils !== "undefined" && Utils.isNwjs()) {
        try {
            const fs = require("fs");
            const path = require("path");
            const full = path.join(path.dirname(process.mainModule.filename), this.DATABASE_SIDECAR_URL);
            if (!fs.existsSync(full)) return finish(null);
            return finish(JSON.parse(fs.readFileSync(full, "utf8")));
        } catch (error) {
            return finish(null);
        }
    }
    const xhr = new XMLHttpRequest();
    xhr.open("GET", this.DATABASE_SIDECAR_URL);
    xhr.overrideMimeType("application/json");
    xhr.onload = () => {
        try {
            finish(xhr.status < 400 ? JSON.parse(xhr.responseText) : null);
        } catch (error) {
            finish(null);
        }
    };
    xhr.onerror = () => finish(null);
    xhr.send();
};

// True once the sidecar has answered — instantly on NW.js, after one
// fetch in a browser. Callers that would fall back to 2D art must not
// commit while this is false: the fallback sheet may no longer exist.
Reactor3D.isDatabaseSidecarReady = function() {
    this.loadDatabaseSidecar();
    return this._databaseSidecarState !== "loading";
};

Reactor3D.databaseModelSpec = function(section, id) {
    this.loadDatabaseSidecar();
    const sidecar = this._databaseSidecar;
    let entry = sidecar && sidecar[section] && sidecar[section][String(id)];
    if (section === 'enemies') {
        const graphic = globalThis.ReactorBattlePresentation?.settings?.enemies?.[id]?.graphic;
        if (graphic?.mode && graphic.mode !== 'auto') entry = graphic.mode === 'model' ? graphic.model || entry : null;
    }
    // An actor binds per surface: character (map model), face, battler.
    // A flat legacy entry is its character slot.
    if (section === "actors") entry = this.actorEntrySlots(entry).character;
    return this.normalizeModelSpec(entry);
};

Reactor3D.actorEntrySlots = function(entry) {
    if (!entry || typeof entry !== "object") return {};
    if (entry.name) return { character: entry };
    return {
        character: entry.character || null,
        face: entry.face || null,
        battler: entry.battler || null
    };
};

Reactor3D.actorSlotSpec = function(actorId, slot) {
    this.loadDatabaseSidecar();
    const sidecar = this._databaseSidecar;
    const entry = sidecar && sidecar.actors && sidecar.actors[String(actorId)];
    const graphic = slot === 'battler' && globalThis.ReactorBattlePresentation?.settings?.actors?.[actorId]?.graphic;
    if (graphic?.mode && graphic.mode !== 'auto') return this.normalizeModelSpec(graphic.mode === 'model' ? graphic.model || this.actorEntrySlots(entry)[slot] : null);
    return this.normalizeModelSpec(this.actorEntrySlots(entry)[slot]);
};

/**
 * Every model a map can possibly show, before its first frame: the map
 * sidecar's event specs plus each actor's character-slot binding (the
 * player and any follower). Deduped by cache key.
 */
Reactor3D.collectMapModelSpecs = function(mapData) {
    // The map's own intent, not the runtime gates: on a cold boot THREE
    // is not loaded yet — preloading is exactly what loads it.
    // Flat maps draw their model-bound characters as sprites, so they
    // preload the same models a 3D map does.
    const specs = [];
    const seen = new Set();
    const note = raw => {
        const spec = this.normalizeModelSpec(raw);
        if (!spec) return;
        const key = this.modelCacheKey(spec.name, spec.ext, spec.file);
        if (seen.has(key)) return;
        seen.add(key);
        specs.push(spec);
    };
    const events = (mapData && mapData.reactor3d && mapData.reactor3d.events) || {};
    for (const pages of Object.values(events)) {
        for (const raw of Object.values(pages || {})) note(raw);
    }
    this.loadDatabaseSidecar();
    const actors = (this._databaseSidecar && this._databaseSidecar.actors) || {};
    for (const entry of Object.values(actors)) {
        note(this.actorEntrySlots(entry).character);
    }
    return specs;
};

/**
 * Load every model the map references while its loading fade still hides
 * the work, so nothing loads — or hitches — mid-play. Memoized per call
 * site; safe to call for maps with nothing to load.
 */
Reactor3D.preloadMapModels = function(mapData) {
    const specs = this.collectMapModelSpecs(mapData);
    if (!specs.length) return Promise.resolve([]);
    return this.ensureLoaded().then(ok => {
        if (!ok) return [];
        return Promise.all(specs.map(spec => Promise.all([
            this.loadModel(spec.name, spec.ext, spec.file, spec.texture),
            this.loadModelSidecar(spec.name)
        ]).then(loaded => {
            // The collision footprint costs a walk over every triangle
            // (a third of a second on a three-million-triangle model);
            // taken here, under the loading fade, not on the first step
            // beside it.
            try { this.modelCollisionMask(spec); } catch (error) { /* the box remains */ }
            return loaded;
        })));
    });
};

/**
 * Shader compilation and texture upload happen on a model's first visible
 * frame unless something asks earlier — this asks earlier. Every cached
 * template not yet warmed joins a throwaway scene for one compile pass,
 * and its textures upload, while the loading fade still covers the cost.
 */
Reactor3D.warmLoadedTemplates = function() {
    const viewport = this._viewport;
    const renderer = viewport && viewport._renderer;
    if (!renderer || typeof THREE === "undefined") return;
    if (!this._warmedTemplates) this._warmedTemplates = new Set();
    // Runs every frame; on the steady state it must allocate nothing.
    const pending = [];
    for (const key in this._glbCache) {
        const template = this._glbCache[key].template;
        if (!template || this._warmedTemplates.has(key)) continue;
        this._warmedTemplates.add(key);
        pending.push(template);
    }
    if (!pending.length) return;
    const scene = new THREE.Scene();
    for (const template of pending) scene.add(template);
    try {
        const camera = this.createCamera({ fov: 40 });
        camera.position.set(0, 2, 6);
        camera.lookAt(0, 1, 0);
        renderer.compile(scene, camera);
        for (const template of pending) {
            for (const texture of template.userData.glbTextures || []) {
                if (texture && texture.image && renderer.initTexture) {
                    renderer.initTexture(texture);
                }
            }
        }
    } catch (error) {
        console.error("Reactor3D: warm-up pass failed.", error);
    }
    // Templates live outside any scene; hand them back.
    for (const template of pending) scene.remove(template);
};

Reactor3D.hasCharacterModel = function(character) {
    const spec = this.characterModelSpec(character);
    if (!spec) return false;
    const entry = this._glbCache[this.modelCacheKey(spec.name, spec.ext, spec.file)];
    return !!(entry && entry.template);
};

Reactor3D.characterModelYaw = function(character, extra) {
    return this.dir8Yaw(this.characterModelDir8(character)) + (extra || 0);
};

Reactor3D.dir8Yaw = function(direction) {
    const yaws = {
        2: 0,
        3: Math.PI / 4,
        6: Math.PI / 2,
        9: 3 * Math.PI / 4,
        8: Math.PI,
        7: -3 * Math.PI / 4,
        4: -Math.PI / 2,
        1: -Math.PI / 4
    };
    return yaws[direction] != null ? yaws[direction] : 0;
};

Reactor3D.characterModelDir8 = function(character) {
    if (!character) return 2;
    if (character.isMoving && character.isMoving()) {
        const dx = character._x - character._realX;
        const dy = character._y - character._realY;
        if (Math.abs(dx) > 0.001 && Math.abs(dy) > 0.001) {
            return dy > 0 ? (dx > 0 ? 3 : 1) : (dx > 0 ? 9 : 7);
        }
        if (Math.abs(dx) > 0.001) return dx > 0 ? 6 : 4;
        if (Math.abs(dy) > 0.001) return dy > 0 ? 2 : 8;
    }
    const stored = character._reactorDir8;
    if (stored === 1 || stored === 3 || stored === 7 || stored === 9) return stored;
    return character.direction ? character.direction() : 2;
};

Reactor3D.eventModelFaceName = function(direction) {
    return { 2: "front", 4: "left", 6: "right", 8: "back" }[direction] || "front";
};

Reactor3D.eventModelFaceTurn = function(direction) {
    return this.dir8Yaw(direction);
};

Reactor3D.eventModelInterpolatedMark = function(faces, direction) {
    if (!faces) return null;
    const pairs = {
        2: ["front"],
        4: ["left"],
        6: ["right"],
        8: ["back"],
        1: ["front", "left"],
        3: ["front", "right"],
        7: ["back", "left"],
        9: ["back", "right"]
    };
    const names = pairs[direction] || ["front"];
    if (names.length === 1) return faces[names[0]] || faces.front || null;
    const a = faces[names[0]];
    const b = faces[names[1]];
    if (a && b) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    return a || b || faces.front || null;
};

/**
 * The yaw the mesh actually stands at in the world: the authored spec
 * rotation plus the front-mark aim, exactly as `applyEventModelPose`
 * computes it. The collision footprint must rotate by THIS — rotating by
 * the facing alone left a model posed with an authored yaw (a motorcycle
 * turned 163 degrees in the picker) colliding crosswise to its visible
 * body, so a character clipped into the metal from one side and was
 * stopped short of it from another.
 */
Reactor3D.eventModelWorldYaw = function(character, spec, direction) {
    spec = spec || this.characterModelSpec(character);
    if (!spec) return 0;
    const dir = direction || this.characterModelDir8(character);
    const target = this.dir8Yaw(dir);
    const yaw = spec.yaw || 0;
    const pitch = spec.pitch || 0;
    const roll = spec.roll || 0;
    const front = spec.faces && spec.faces.front;
    if (!front) return target + yaw;
    // The front mark through the spec's YXZ rotation, without THREE.
    const cz = Math.cos(roll), sz = Math.sin(roll);
    let x = front[0] * cz - front[1] * sz;
    let y = front[0] * sz + front[1] * cz;
    let z = front[2];
    const cx = Math.cos(pitch), sx = Math.sin(pitch);
    const y2 = y * cx - z * sx;
    const z2 = y * sx + z * cx;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const wx = x * cy + z2 * sy;
    const wz = -x * sy + z2 * cy;
    if (wx * wx + wz * wz < 1e-8) return target + yaw;
    return yaw + (target - Math.atan2(wx, wz));
};

/**
 * How a model blocks: the shape of its mesh (default) or its bounding box
 * (`collision: "box"`, for a model whose geometry reads badly as a floor
 * plan — a hollow shell, a cloud of leaves).
 */
Reactor3D.readModelCollision = function(json) {
    return json && json.collision === "box" ? "box" : "mesh";
};

Reactor3D.COLLISION_WALK_HEIGHT = 1.2;
/** Past this many triangles a model's footprint is read from its vertices alone, this many of them. */
Reactor3D.DENSE_TRIANGLES = 50000;
Reactor3D.DENSE_SAMPLES = 250000;
Reactor3D.COLLISION_MASK_LIMIT = 64;
/** Footprint cells per tile side: a quarter tile, fine enough to walk along a curved base. */
Reactor3D.COLLISION_SUBDIV = 4;
/** The walking body's radius in tiles; a character is narrower than its cell. */
Reactor3D.COLLISION_BODY_RADIUS = 0.34;

/**
 * Which tiles a model's mesh actually covers, in the body's own frame.
 *
 * The triangles below walking height are projected onto the ground at the
 * instance's size, base transform and pitch/roll (facing is applied by the
 * caller, as for the box), and every cell a triangle touches is marked. So
 * a reactor with a wide crown and a narrow stem blocks its stem, not the
 * square its crown would draw; a table blocks under its top. Computed once
 * per model and pose and kept.
 */
Reactor3D.modelCollisionMask = function(spec) {
    if (!spec || typeof THREE === "undefined") return null;
    const key = this.modelCacheKey(spec.name, spec.ext, spec.file);
    const entry = this._glbCache && this._glbCache[key];
    const template = entry && entry.template;
    if (!template) return null;
    const json = this._sidecarJson && this._sidecarJson[spec.name];
    const poseKey = `${key}|${spec.size}|${spec.scale}|${(spec.stretch || []).join(",")}|${spec.pitch}|${spec.roll}`;
    if (!this._collisionMasks) this._collisionMasks = {};
    if (this._collisionMasks[poseKey] !== undefined) return this._collisionMasks[poseKey];
    const mask = this.buildModelCollisionMask(template, json, spec);
    this._collisionMasks[poseKey] = mask;
    return mask;
};

/** The mask itself, from a loaded template and its sidecar json; the editor builds one from its own copy. */
Reactor3D.buildModelCollisionMask = function(template, json, spec) {
    if (!template || !spec || typeof THREE === "undefined") return null;
    if (this.readModelCollision(json) !== "mesh") return null;
    const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
    const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
    const fit = (spec.size > 0 ? spec.size : 2) / span * (spec.scale > 0 ? spec.scale : 1);
    const stretch = spec.stretch || [1, 1, 1];
    const base = this.readModelTransform(json);
    const baseAxes = this.scaleAxes(base.scale);
    const baseMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(base.offset[0], base.offset[1], base.offset[2]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(base.rotate[0] * Math.PI / 180, base.rotate[1] * Math.PI / 180, base.rotate[2] * Math.PI / 180, "YXZ")),
        new THREE.Vector3(baseAxes[0], baseAxes[1], baseAxes[2]));
    // Pitch and roll only: facing and the spec's yaw turn the query instead.
    const pose = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(spec.pitch || 0, 0, spec.roll || 0, "YXZ"));
    const total = new THREE.Matrix4().multiplyMatrices(pose, baseMatrix);
    template.updateMatrixWorld(true);
    // A byte grid over the reach, not a hash set: a reactor is three
    // million triangles, and a set operation per edge sample was the
    // whole cost of a footprint (a two-second stall on the passage
    // toggle). Cell (i, j) is a quarter tile at ((i, j) + half) * sub.
    const sub = this.COLLISION_SUBDIV;
    const limit = this.COLLISION_MASK_LIMIT * sub;
    const side = limit * 2 + 1;
    const grid = new Uint8Array(side * side);
    let count = 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const markCell = (i, j) => {
        if (i < -limit || i > limit || j < -limit || j > limit) return;
        const at = (i + limit) * side + (j + limit);
        if (grid[at]) return;
        grid[at] = 1;
        count++;
        if (i < minX) minX = i; if (i > maxX) maxX = i;
        if (j < minZ) minZ = j; if (j > maxZ) maxZ = j;
    };
    const mark = (x, z) => markCell(Math.floor(x * sub), Math.floor(z * sub));
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const walk = this.COLLISION_WALK_HEIGHT;
    let dense = false;
    template.traverse(node => {
        if (!node.isMesh && !node.isSkinnedMesh) return;
        const geometry = node.geometry;
        const position = geometry && geometry.getAttribute("position");
        if (!position) return;
        const matrix = new THREE.Matrix4().multiplyMatrices(total, node.matrixWorld);
        const index = geometry.getIndex();
        const count3 = index ? index.count : position.count;
        const read = (n, out) => {
            const i = index ? index.getX(n) : n;
            out.fromBufferAttribute(position, i).applyMatrix4(matrix);
            out.x *= fit * stretch[0]; out.y *= fit * stretch[1]; out.z *= fit * stretch[2];
        };
        // A dense mesh's vertices carpet its footprint hundreds of times
        // per quarter-tile cell, so the outline needs no triangles at all:
        // every k-th vertex, `DENSE_SAMPLES` of them, marks its cell. The
        // triangle walk below is for low-poly models, where one big face
        // can span many cells.
        if (count3 / 3 > Reactor3D.DENSE_TRIANGLES) {
            const stride = Math.max(1, Math.floor(position.count / Reactor3D.DENSE_SAMPLES));
            for (let v = 0; v < position.count; v += stride) {
                a.fromBufferAttribute(position, v).applyMatrix4(matrix);
                a.x *= fit * stretch[0]; a.y *= fit * stretch[1]; a.z *= fit * stretch[2];
                if (a.y <= walk) mark(a.x, a.z);
            }
            dense = true;
            return;
        }
        for (let t = 0; t + 2 < count3; t += 3) {
            read(t, a); read(t + 1, b); read(t + 2, c);
            if (Math.min(a.y, b.y, c.y) > walk) continue;
            const lox = Math.min(a.x, b.x, c.x), hix = Math.max(a.x, b.x, c.x);
            const loz = Math.min(a.z, b.z, c.z), hiz = Math.max(a.z, b.z, c.z);
            const i0 = Math.floor(lox * sub), i1 = Math.floor(hix * sub);
            const j0 = Math.floor(loz * sub), j1 = Math.floor(hiz * sub);
            // A triangle inside one cell (most of a dense mesh): that cell.
            if (i0 === i1 && j0 === j1) { markCell(i0, j0); continue; }
            // A vertical face (a box's wall) is a line from above: its edge
            // is marked toward the model's middle, and it has no inside.
            const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
            const flat = area < 1e-9;
            // Corners and edges are marked a hair inside the triangle: a
            // vertex exactly on a cell line (every box's edge) otherwise
            // marks the cell beyond it, a quarter tile the model is not in.
            const gx = flat ? 0 : (a.x + b.x + c.x) / 3, gz = flat ? 0 : (a.z + b.z + c.z) / 3;
            const inward = (x, z) => mark(x + (gx - x) * 1e-3, z + (gz - z) * 1e-3);
            inward(a.x, a.z); inward(b.x, b.z); inward(c.x, c.z);
            for (const [p, q] of [[a, b], [b, c], [c, a]]) {
                const steps = Math.min(64, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) * sub * 2));
                for (let s = 1; s < steps; s++) inward(p.x + (q.x - p.x) * s / steps, p.z + (q.z - p.z) * s / steps);
            }
            if (flat) continue;
            if (i1 - i0 > limit * 2 || j1 - j0 > limit * 2) continue;
            for (let i = i0; i <= i1; i++) {
                for (let j = j0; j <= j1; j++) {
                    const cx = (i + 0.5) / sub, cz = (j + 0.5) / sub;
                    if (Reactor3D.pointInTriangle2D(cx, cz, a.x, a.z, b.x, b.z, c.x, c.z)) markCell(i, j);
                }
            }
        }
    });
    // Vertices outline a dense model's surface; the inside of its base (a
    // hollow ring, a flat underside fanned from one vertex) has few. Fill
    // between the outline's marks, along rows and along columns, and keep
    // a cell both agree on: a model's inside is not floor either.
    if (dense && count && maxX >= minX) {
        const rows = new Uint8Array(side * side);
        for (let i = minX; i <= maxX; i++) {
            let first = null, last = null;
            for (let j = minZ; j <= maxZ; j++) if (grid[(i + limit) * side + (j + limit)]) { if (first === null) first = j; last = j; }
            if (first === null) continue;
            for (let j = first; j <= last; j++) rows[(i + limit) * side + (j + limit)] = 1;
        }
        for (let j = minZ; j <= maxZ; j++) {
            let first = null, last = null;
            for (let i = minX; i <= maxX; i++) if (grid[(i + limit) * side + (j + limit)]) { if (first === null) first = i; last = i; }
            if (first === null) continue;
            for (let i = first; i <= last; i++) {
                const at = (i + limit) * side + (j + limit);
                if (rows[at] && !grid[at]) { grid[at] = 1; count++; }
            }
        }
    }
    const has = (i, j) => i >= -limit && i <= limit && j >= -limit && j <= limit && grid[(i + limit) * side + (j + limit)] === 1;
    const mask = count
        ? {
            count, sub, has,
            minX: minX / sub, maxX: (maxX + 1) / sub, minZ: minZ / sub, maxZ: (maxZ + 1) / sub,
            /**
             * Whether a walking body centred at (x, z) tiles touches the
             * footprint: any occupied quarter-cell within the body's radius.
             */
            touches: (x, z, radius) => {
                const r = radius == null ? Reactor3D.COLLISION_BODY_RADIUS : radius;
                const i0 = Math.floor((x - r) * sub), i1 = Math.floor((x + r) * sub);
                const j0 = Math.floor((z - r) * sub), j1 = Math.floor((z + r) * sub);
                for (let i = i0; i <= i1; i++) {
                    for (let j = j0; j <= j1; j++) {
                        if (!has(i, j)) continue;
                        // The nearest point of the cell to the body's centre.
                        const nx = Math.max(i / sub, Math.min(x, (i + 1) / sub));
                        const nz = Math.max(j / sub, Math.min(z, (j + 1) / sub));
                        if (Math.hypot(nx - x, nz - z) <= r) return true;
                    }
                }
                return false;
            },
            /**
             * Whether the tile centred at (x, z) is blocked: the mesh covers
             * the middle of it, or at least half of it. The body-radius test
             * (`touches`) at a tile's centre padded every model by a third
             * of a tile on every side, which kept the player a whole tile
             * away from a console: an invisible wall around everything.
             */
            blocksTile: (x, z) => {
                const mi = Math.floor(x * sub), mj = Math.floor(z * sub);
                // The middle: the quarter-cells around the centre point.
                for (let i = mi - 1; i <= mi; i++) {
                    for (let j = mj - 1; j <= mj; j++) if (has(i, j)) return true;
                }
                const i0 = Math.round((x - 0.5) * sub), j0 = Math.round((z - 0.5) * sub);
                let covered = 0;
                for (let i = i0; i < i0 + sub; i++) {
                    for (let j = j0; j < j0 + sub; j++) if (has(i, j)) covered++;
                }
                return covered >= sub * sub / 2;
            }
        }
        : null;
    return mask;
};

/**
 * The map tiles a placed model blocks: its mask (or, with `collision:
 * "box"`, its box) turned to its facing and laid over the tiles around
 * (`px`, `py`), by the same rule the game walks against. For the editor's
 * footprint display; the game tests tiles as it goes.
 */
Reactor3D.blockedTilesFor = function(template, json, spec, direction, px, py) {
    if (!template || !spec) return [];
    // Built once per pose and kept on the template: the editor asks for
    // the same footprint from its 3D view and its flat map on every edit.
    const masks = template.userData.__reactorMasks || (template.userData.__reactorMasks = {});
    const poseKey = `${spec.size}|${spec.scale}|${(spec.stretch || []).join(",")}|${spec.pitch}|${spec.roll}`;
    if (masks[poseKey] === undefined) masks[poseKey] = this.buildModelCollisionMask(template, json, spec);
    const mask = masks[poseKey];
    const fake = { direction: function() { return direction || 2; }, _reactorDir8: direction || 2 };
    const yaw = this.eventModelWorldYaw(fake, spec, direction || 2);
    const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
    const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
    const scale = (spec.size > 0 ? spec.size : 2) / span * (spec.scale > 0 ? spec.scale : 1);
    const stretch = spec.stretch || [1, 1, 1];
    const halfX = mask ? Math.max(Math.abs(mask.minX), Math.abs(mask.maxX)) : extent.x * scale * stretch[0] / 2;
    const halfZ = mask ? Math.max(Math.abs(mask.minZ), Math.abs(mask.maxZ)) : extent.z * scale * stretch[2] / 2;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const reach = Math.ceil(Math.hypot(halfX, halfZ)) + 1;
    const cx = Math.round(px), cy = Math.round(py);
    const tiles = [];
    for (let ty = cy - reach; ty <= cy + reach; ty++) {
        for (let tx = cx - reach; tx <= cx + reach; tx++) {
            const dx = tx - px, dy = ty - py;
            const localX = dx * cos - dy * sin;
            const localZ = dx * sin + dy * cos;
            const blocked = mask ? mask.blocksTile(localX, localZ)
                : Math.abs(localX) <= halfX + 1e-6 && Math.abs(localZ) <= halfZ + 1e-6;
            if (blocked) tiles.push({ x: tx, y: ty });
        }
    }
    return tiles;
};

Reactor3D.pointInTriangle2D = function(px, py, ax, ay, bx, by, cx, cy) {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    const negative = d1 < 0 || d2 < 0 || d3 < 0;
    const positive = d1 > 0 || d2 > 0 || d3 > 0;
    return !(negative && positive);
};

Reactor3D.eventModelFootprint = function(character, spec, yaw) {
    spec = spec || this.characterModelSpec(character);
    const size = spec && spec.size > 0 ? spec.size : 2;
    const extra = spec && spec.scale > 0 ? spec.scale : 1;
    const entry = spec ? this._glbCache[this.modelCacheKey(spec.name, spec.ext, spec.file)] : null;
    const extent = entry && entry.template && entry.template.userData.glbSize;
    let halfX = size * extra / 2;
    let halfZ = halfX;
    if (extent) {
        // Size is the model's LARGEST dimension in tiles: characters size
        // by their height, vehicles and props by their footprint — a slim
        // character no longer balloons to fill two tiles of width.
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
        const scale = size / span * extra;
        const stretch = (spec && spec.stretch) || [1, 1, 1];
        halfX = extent.x * scale * stretch[0] / 2;
        halfZ = extent.z * scale * stretch[2] / 2;
    }
    if (yaw == null) yaw = this.eventModelWorldYaw(character, spec);
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    const mask = spec ? this.modelCollisionMask(spec) : null;
    if (mask) {
        // The mesh's own footprint; the box stays as the quick-reject bound.
        halfX = Math.max(Math.abs(mask.minX), Math.abs(mask.maxX)) + this.COLLISION_BODY_RADIUS;
        halfZ = Math.max(Math.abs(mask.minZ), Math.abs(mask.maxZ)) + this.COLLISION_BODY_RADIUS;
    }
    return {
        mask,
        // The axis-aligned bounds, for quick rejection and the sweep radius.
        halfX: halfX * cos + halfZ * sin,
        halfZ: halfX * sin + halfZ * cos,
        // The true rotated rectangle: at an angle the AABB of a long car
        // balloons to near-square, and a character was stopped tiles away
        // from the visible body at its corners. Containment rotates into
        // this frame instead, so walking right up to the metal is allowed
        // from every side at every angle.
        rawX: halfX,
        rawZ: halfZ,
        yaw
    };
};

Reactor3D.eventModelContains = function(character, foot, x, y) {
    const map = typeof $gameMap !== "undefined" ? $gameMap : null;
    // With the body's own frame available, containment is the true rotated
    // rectangle; a plain { halfX, halfZ } falls back to the axis-aligned box.
    const oriented = foot.yaw != null && foot.rawX != null;
    const cos = oriented ? Math.cos(foot.yaw) : 1;
    const sin = oriented ? Math.sin(foot.yaw) : 0;
    const contains = (cx, cy) => {
        const dx = map && map.deltaX ? map.deltaX(x, cx) : x - cx;
        const dy = map && map.deltaY ? map.deltaY(y, cy) : y - cy;
        if (oriented) {
            const localX = dx * cos - dy * sin;
            const localZ = dx * sin + dy * cos;
            // The mesh's own footprint: does a body standing on that tile
            // touch it? Walking along a curved base is allowed right up to
            // the metal, tile grid or not.
            if (foot.mask) return foot.mask.blocksTile(localX, localZ);
            // A box blocks the tiles whose centres it reaches (half a tile
            // covered counts, as for the mask).
            return Math.abs(localX) <= foot.rawX + 1e-6
                && Math.abs(localZ) <= foot.rawZ + 1e-6;
        }
        return Math.abs(dx) <= foot.halfX + 1e-6
            && Math.abs(dy) <= foot.halfZ + 1e-6;
    };
    const offGrid = character._realX !== character._x || character._realY !== character._y;
    // One standing still off the grid - a prop placed freely - is only
    // where it really is: testing its rounded tile too widened a console
    // by half a tile on one side, a tile the editor showed free.
    const moving = typeof character.isMoving === "function" ? character.isMoving() : offGrid;
    if (offGrid && !moving) return contains(character._realX, character._realY);
    if (contains(character._x, character._y)) return true;
    // While the event glides, _x/_y already sit on the destination tile but
    // the body is still back at _realX/_realY. A long vehicle would otherwise
    // free its trailing tiles the instant a step begins, and a character
    // could walk into the middle of it from behind.
    return offGrid && contains(character._realX, character._realY);
};

Reactor3D.eventModelCanFace = function(character, direction) {
    const spec = this.characterModelSpec(character);
    if (!spec || !character) return true;
    // The mesh eases through every angle on the way to the new facing, so a
    // turn in place must clear the disc its corners sweep, not only the
    // destination rectangle. A half-turn sweeps it twice over.
    const fromYaw = this.eventModelWorldYaw(character, spec);
    const toYaw = this.eventModelWorldYaw(character, spec, direction);
    const turning = this.dir8Yaw(direction) !== this.dir8Yaw(this.characterModelDir8(character));
    const blockedBy = (x, y) => {
        const foot = this.eventModelFootprint(character, spec, toYaw);
        if (this.eventModelContains(character, foot, x, y)) return true;
        return turning
            && this.eventModelSweepHits(character, spec, character._x, character._y, x, y, fromYaw, toYaw);
    };
    if (typeof $gamePlayer !== "undefined" && $gamePlayer
        && this.charactersOverlapVertically(character, $gamePlayer)
        && blockedBy($gamePlayer._x, $gamePlayer._y)) {
        return false;
    }
    const map = typeof $gameMap !== "undefined" ? $gameMap : null;
    const events = map && map.events ? map.events() : null;
    if (!events) return true;
    for (let i = 0; i < events.length; i++) {
        const other = events[i];
        if (!other || other === character) continue;
        if (other.isThrough && other.isThrough()) continue;
        if (other.isNormalPriority && !other.isNormalPriority()) continue;
        // A wall light nine tiles up does not stop a tank underneath it.
        if (!this.charactersOverlapVertically(character, other)) continue;
        if (blockedBy(other._x, other._y)) return false;
    }
    return true;
};

/**
 * The circle a model's corners trace when it turns: the radius of its
 * unrotated footprint's diagonal. Rotation-invariant, so it is measured at
 * yaw zero — a rotated footprint's halves are axis projections and their
 * diagonal overstates the body.
 */
Reactor3D.eventModelSweepRadius = function(character, spec) {
    const foot = this.eventModelFootprint(character, spec, 0);
    return Math.hypot(foot.halfX, foot.halfZ);
};

Reactor3D.eventModelWouldOverlap = function(character, x, y, other, direction) {
    if (!character || !other) return false;
    const spec = this.characterModelSpec(character);
    if (!spec) return false;
    // The body sweeps through both orientations during the step: the test
    // yaw list carries the current facing and, when the move implies a turn,
    // the facing the glide will visually snap to. Testing only the current
    // one let a long vehicle rotate 90 degrees mid-step straight over a
    // standing character.
    const yaws = [this.eventModelWorldYaw(character, spec)];
    let turning = false;
    if (direction) {
        const moveYaw = this.eventModelWorldYaw(character, spec, direction);
        if (moveYaw !== yaws[0]) {
            yaws.push(moveYaw);
            turning = true;
        }
    }
    const ox = character._x;
    const oy = character._y;
    character._x = x;
    character._y = y;
    let hit = false;
    for (const yaw of yaws) {
        const foot = this.eventModelFootprint(character, spec, yaw);
        if (this.eventModelContains(character, foot, other._x, other._y)) {
            hit = true;
            break;
        }
    }
    character._x = ox;
    character._y = oy;
    // A turn does not jump between its two end rectangles — the mesh eases
    // through every angle between them, and a long body's corners trace an
    // arc that reaches beyond both. So a turning step must also clear the
    // disc those corners sweep, at the tile it leaves and the tile it
    // enters; without this a bystander standing diagonally off the car was
    // inside neither end rectangle and still swept through.
    if (!hit && turning) {
        hit = this.eventModelSweepHits(character, spec, x, y, other._x, other._y, yaws[0], yaws[1])
            || this.eventModelSweepHits(character, spec, ox, oy, other._x, other._y, yaws[0], yaws[1]);
    }
    return hit;
};

/**
 * Whether (x, y) is touched while the body turns from one yaw to the other,
 * centred at (cx, cy). The old test was a whole disc of the corner radius,
 * which stopped a long vehicle from turning anywhere near ANYTHING — a
 * nineteen-tile tank could not face down with a bystander ten tiles off its
 * bow. The body only covers what its footprint passes over, so the arc is
 * sampled and each sample asks the real footprint (mesh mask included).
 */
Reactor3D.eventModelSweepHits = function(character, spec, cx, cy, x, y, fromYaw, toYaw) {
    const map = typeof $gameMap !== "undefined" ? $gameMap : null;
    const dx = map && map.deltaX ? map.deltaX(x, cx) : x - cx;
    const dy = map && map.deltaY ? map.deltaY(y, cy) : y - cy;
    const reach = Math.hypot(dx, dy);
    if (reach >= this.eventModelSweepRadius(character, spec) + 0.5 - 1e-6) return false;
    if (fromYaw == null || toYaw == null) return true;
    // The short way round, like the drawn turn.
    let delta = toYaw - fromYaw;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(delta) / 0.15));
    for (let i = 0; i <= steps; i++) {
        const yaw = fromYaw + delta * (i / steps);
        const foot = this.eventModelFootprint(character, spec, yaw);
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const localX = dx * cos - dy * sin;
        const localZ = dx * sin + dy * cos;
        const hit = foot.mask
            ? foot.mask.blocksTile(localX, localZ)
            : Math.abs(localX) <= foot.rawX + 1e-6 && Math.abs(localZ) <= foot.rawZ + 1e-6;
        if (hit) return true;
    }
    return false;
};

/** Whether moving the model event's center to (x, y) would cover another solid event. */
Reactor3D.eventModelWouldOverlapEvents = function(character, x, y, direction) {
    if (!character) return false;
    const map = typeof $gameMap !== "undefined" ? $gameMap : null;
    const events = map && map.events ? map.events() : null;
    if (!events) return false;
    for (let i = 0; i < events.length; i++) {
        const other = events[i];
        if (!other || other === character) continue;
        if (other.isThrough && other.isThrough()) continue;
        if (other.isNormalPriority && !other.isNormalPriority()) continue;
        if (!this.charactersOverlapVertically(character, other)) continue;
        if (this.eventModelWouldOverlap(character, x, y, other, direction)) return true;
    }
    return false;
};

Reactor3D.aimCharacterBillboard = function(object, camera) {
    if (!object || !camera || typeof THREE === "undefined") return;
    // Scratch objects: this runs once per billboard per frame, and six
    // fresh allocations per call was a steady garbage-collector tax.
    const scratch = this._aimScratch || (this._aimScratch = {
        right: new THREE.Vector3(), forward: new THREE.Vector3(),
        trueUp: new THREE.Vector3(), basis: new THREE.Matrix4()
    });
    const right = scratch.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    else right.normalize();
    const up = this.billboardUp(camera);
    const forward = scratch.forward.crossVectors(right, up).normalize();
    const trueUp = scratch.trueUp.crossVectors(forward, right).normalize();
    object.quaternion.setFromRotationMatrix(scratch.basis.makeBasis(right, trueUp, forward));
};

Reactor3D.characterIsBehindModel = function(character, event) {
    if (!character || !event) return false;
    const spec = this.characterModelSpec(event);
    if (!spec) return false;
    const foot = this.eventModelFootprint(event, spec);
    const map = typeof $gameMap !== "undefined" ? $gameMap : null;
    const dx = map && map.deltaX ? map.deltaX(character._realX, event._realX)
        : character._realX - event._realX;
    const dy = map && map.deltaY ? map.deltaY(character._realY, event._realY)
        : character._realY - event._realY;
    return Math.abs(dx) <= foot.halfX + 0.51 && dy < -0.01;
};

Reactor3D.eventModelOccupies = function(character, x, y) {
    if (!character) return false;
    const spec = this.characterModelSpec(character);
    if (!spec) return character._x === x && character._y === y;
    if (this.eventModelContains(character, this.eventModelFootprint(character, spec), x, y)) {
        return true;
    }
    // While the mesh is still easing into a new facing, the body occupies
    // the swing arc, not just the settled rectangle — without this a
    // character could step into the sweep during the quarter second the
    // turn takes and be passed through.
    if (character._reactorTurnStamp != null && typeof Graphics !== "undefined"
        && Graphics.frameCount - character._reactorTurnStamp < this.MODEL_TURN_SWEEP_FRAMES) {
        return this.eventModelSweepHits(character, spec, character._x, character._y, x, y)
            || this.eventModelSweepHits(character, spec, character._realX, character._realY, x, y);
    }
    return false;
};

Reactor3D.applyEventModelPose = function(object, spec, direction, options) {
    if (!object || !spec) return;
    const preview = options && typeof options === "object" && options.preview;
    const faceYaw = preview ? (options.faceYaw != null ? options.faceYaw : 0) : null;
    const pitch = spec.pitch || 0;
    const yaw = spec.yaw || 0;
    const roll = spec.roll || 0;
    object.rotation.order = "YXZ";
    object.rotation.set(pitch, yaw, roll);
    if (object.updateMatrix) object.updateMatrix();
    const dir = direction || 2;
    const character = { direction: function() { return dir; }, _reactorDir8: dir };
    const faces = spec.faces || {};
    const used = preview
        ? (faces[this.eventModelFaceName(dir)] || faces.front || null)
        : (faces.front || this.eventModelInterpolatedMark(faces, dir));
    let target = preview ? faceYaw : this.dir8Yaw(dir);
    if (preview && !faces[this.eventModelFaceName(dir)] && faces.front) {
        target -= this.eventModelFaceTurn(dir);
    }
    if (used && typeof THREE !== "undefined") {
        const local = new THREE.Vector3(used[0], used[1], used[2]);
        local.applyQuaternion(object.quaternion);
        local.y = 0;
        if (local.lengthSq() > 1e-8) {
            object.rotation.y += target - Math.atan2(local.x, local.z);
            return;
        }
    }
    if (preview) {
        object.rotation.y = yaw + this.eventModelFaceTurn(dir);
        return;
    }
    object.rotation.y = this.characterModelYaw(character, yaw);
};

Reactor3D.readGlb = function(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546C67) {
        throw new Error("not a GLB");
    }
    let offset = 12;
    let json = null;
    let bin = null;
    while (offset + 8 <= view.byteLength) {
        const length = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        const start = offset + 8;
        if (start + length > view.byteLength) break;
        const bytes = new Uint8Array(buffer, start, length);
        if (type === 0x4E4F534A) {
            json = JSON.parse(new TextDecoder("utf-8").decode(bytes));
        } else if (type === 0x004E4942) {
            bin = bytes;
        }
        offset = start + length;
    }
    if (!json) throw new Error("GLB has no JSON chunk");
    return { json, bin };
};

Reactor3D.loadGlb = function(name) {
    return this.loadModel(name, ".glb");
};

Reactor3D.loadModel = function(name, ext, file, texture) {
    const key = this.modelCacheKey(name, ext, file);
    const cached = this._glbCache[key];
    if (cached) return cached.promise;
    const entry = { promise: null, template: null, failed: false };
    this._glbCache[key] = entry;
    const jobs = [];
    // The named extension first; a model converted to GLB since it was picked is still found under the others.
    const kinds = ext ? [ext].concat(this.MODEL_EXTS.filter(kind => kind !== ext)) : this.MODEL_EXTS;
    for (let i = 0; i < kinds.length; i++) {
        const next = kinds[i];
        const urls = this.modelUrls(name, next, file);
        for (let u = 0; u < urls.length; u++) jobs.push({ url: urls[u], ext: next });
        // A note-based spec names no extension, and files ship in whatever
        // case they were exported with — Plant_001.OBJ — which a
        // case-sensitive filesystem will not serve for the lowercase guess.
        if (!ext) {
            const upper = next.toUpperCase();
            if (upper !== next) {
                const upperUrls = this.modelUrls(name, upper, file);
                for (let u = 0; u < upperUrls.length; u++) {
                    jobs.push({ url: upperUrls[u], ext: next });
                }
            }
        }
    }
    entry.promise = new Promise(resolve => {
        if (typeof XMLHttpRequest === "undefined") {
            entry.failed = true;
            resolve(null);
            return;
        }
        const tryAt = index => {
            if (index >= jobs.length) {
                entry.failed = true;
                console.error("Reactor3D: could not load " + this.modelUrl(name, ext));
                resolve(null);
                return;
            }
            const job = jobs[index];
            const xhr = new XMLHttpRequest();
            xhr.open("GET", job.url);
            xhr.responseType = "arraybuffer";
            xhr.onload = () => {
                if (xhr.status >= 400 || !xhr.response) {
                    tryAt(index + 1);
                    return;
                }
                const baseUrl = job.url.replace(/[^/]+$/, "");
                const buildFrom = builder => {
                    try {
                        entry.template = builder();
                        resolve(entry.template);
                    } catch (error) {
                        entry.failed = true;
                        console.error("Reactor3D: " + name + job.ext + " could not be built.", error);
                        resolve(null);
                    }
                };
                if (job.ext === ".glb") {
                    // The container split, JSON parse, and texture decode
                    // run off-thread; the buffer travels there and back.
                    // A failed or absent worker hands the bytes back to the
                    // synchronous parser.
                    this.parseGlbAsync(xhr.response).then(parsed => {
                        if (parsed && parsed.json) {
                            buildFrom(() => this.buildGlbTemplate(
                                parsed.json, parsed.bin, baseUrl, parsed.bitmaps));
                            // Distance levels, if the import wrote any: listed
                            // in the sidecar, so nothing is probed for.
                            if (entry.template && !entry.template.userData.animated) {
                                this.loadLodLevels(entry.template, key, name, baseUrl);
                            }
                        } else {
                            const buffer = (parsed && parsed.buffer) || xhr.response;
                            buildFrom(() => this.readModel(buffer, job.ext, baseUrl, texture));
                        }
                    });
                    return;
                }
                buildFrom(() => this.readModel(xhr.response, job.ext, baseUrl, texture));
            };
            xhr.onerror = () => tryAt(index + 1);
            xhr.send();
        };
        tryAt(0);
    });
    return entry.promise;
};

/**
 * Off-thread GLB parsing: a worker splits the container, parses the JSON
 * chunk, and decodes embedded textures to ImageBitmaps, transferring the
 * file buffer there and back. The worker's source is assembled from the
 * two functions below and spawned from a Blob URL, so the runtime stays
 * one module and the same worker serves the game and the editor alike.
 * Any failure hands the buffer back and the caller parses synchronously.
 */
function reactorSplitGlb(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546C67) {
        throw new Error("not a GLB");
    }
    let offset = 12;
    let json = null;
    let bin = { offset: 0, length: 0 };
    while (offset + 8 <= view.byteLength) {
        const length = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        const start = offset + 8;
        if (type === 0x4E4F534A) {
            json = JSON.parse(new TextDecoder("utf-8").decode(
                new Uint8Array(buffer, start, length)));
        } else if (type === 0x004E4942) {
            bin = { offset: start, length };
        }
        offset = start + length;
    }
    if (!json) throw new Error("GLB carries no JSON chunk");
    return { json, bin };
}

function reactorDecodeGlbImages(json, buffer, binOffset) {
    if (typeof createImageBitmap === "undefined") return Promise.resolve({});
    const jobs = [];
    (json.images || []).forEach((image, index) => {
        if (image.uri || image.bufferView == null) return;
        const view = (json.bufferViews || [])[image.bufferView];
        if (!view) return;
        const bytes = new Uint8Array(buffer,
            binOffset + (view.byteOffset || 0), view.byteLength);
        const blob = new Blob([bytes], { type: image.mimeType || "image/png" });
        // glTF textures are unflipped and unpremultiplied; match what the
        // synchronous TextureLoader path produces.
        jobs.push(createImageBitmap(blob, {
            imageOrientation: "none",
            premultiplyAlpha: "none"
        }).then(bitmap => Reactor3D.capBitmapSize(bitmap)).then(bitmap => [index, bitmap], () => null));
    });
    return Promise.all(jobs).then(pairs => {
        const bitmaps = {};
        for (const pair of pairs) {
            if (pair) bitmaps[pair[0]] = pair[1];
        }
        return bitmaps;
    });
}

// Exposed for tests: the worker runs exactly these functions.
Reactor3D._workerParts = { splitGlb: reactorSplitGlb, decodeImages: reactorDecodeGlbImages };

Reactor3D._glbWorkerSource = function() {
    return reactorSplitGlb.toString() + "\n"
        + reactorDecodeGlbImages.toString() + "\n"
        + "self.onmessage = function(event) {\n"
        + "    var data = event.data || {};\n"
        + "    var buffer = data.buffer;\n"
        + "    Promise.resolve().then(function() {\n"
        + "        var parsed = reactorSplitGlb(buffer);\n"
        + "        return reactorDecodeGlbImages(parsed.json, buffer, parsed.bin.offset)\n"
        + "            .then(function(bitmaps) {\n"
        + "                var transfers = [buffer];\n"
        + "                for (var key in bitmaps) transfers.push(bitmaps[key]);\n"
        + "                self.postMessage({ id: data.id, json: parsed.json,\n"
        + "                    binOffset: parsed.bin.offset, binLength: parsed.bin.length,\n"
        + "                    buffer: buffer, bitmaps: bitmaps }, transfers);\n"
        + "            });\n"
        + "    }).catch(function(error) {\n"
        + "        self.postMessage({ id: data.id,\n"
        + "            error: String(error && error.message || error),\n"
        + "            buffer: buffer }, [buffer]);\n"
        + "    });\n"
        + "};\n";
};

Reactor3D._ensureParseWorker = function() {
    if (this._parseWorker !== undefined) return this._parseWorker;
    this._parseWorker = null;
    try {
        if (typeof Worker !== "undefined" && typeof Blob !== "undefined"
            && typeof URL !== "undefined" && URL.createObjectURL) {
            const blob = new Blob([this._glbWorkerSource()], { type: "text/javascript" });
            const worker = new Worker(URL.createObjectURL(blob));
            this._parsePending = new Map();
            worker.onmessage = event => {
                const data = event.data || {};
                const resolve = this._parsePending.get(data.id);
                if (!resolve) return;
                this._parsePending.delete(data.id);
                resolve(data);
            };
            worker.onerror = () => {
                for (const resolve of this._parsePending.values()) {
                    resolve({ error: "worker failed" });
                }
                this._parsePending.clear();
                this._parseWorker = null;
            };
            this._parseWorker = worker;
        }
    } catch (error) {
        this._parseWorker = null;
    }
    return this._parseWorker;
};

Reactor3D.parseGlbAsync = function(buffer) {
    const worker = this._ensureParseWorker();
    if (!worker) return Promise.resolve(null);
    this._parseId = (this._parseId || 0) + 1;
    const id = this._parseId;
    return new Promise(resolve => {
        this._parsePending.set(id, data => {
            if (data.error || !data.json) {
                resolve({ error: data.error || "parse failed", buffer: data.buffer || null });
                return;
            }
            resolve({
                json: data.json,
                bin: new Uint8Array(data.buffer, data.binOffset, data.binLength),
                bitmaps: data.bitmaps || {}
            });
        });
        try {
            worker.postMessage({ id, buffer }, [buffer]);
        } catch (error) {
            this._parsePending.delete(id);
            resolve(null);
        }
    });
};

/**
 * readModel with the GLB half off-thread: the worker splits, parses, and
 * decodes textures, and the template is assembled from the transferred
 * buffers. Every other format — and any worker failure — resolves through
 * the synchronous reader unchanged.
 */
// options.beforeBuild: awaited between the worker parse and the main-thread
// template build, so a caller can hold the build until the thread is free
// (the editor's thumbnail pass waits for the preview to sit idle).
/**
 * The largest side a model texture keeps. Exporters ship 4K sheets for a
 * character that is 200 pixels tall on screen; on a weak GPU that is video
 * memory and bandwidth for nothing visible. Decoded bitmaps over the cap
 * are resampled down in the worker before they are ever uploaded.
 */
Reactor3D.maxTextureSize = 2048;

/** The main-thread twin of capBitmapSize for images decoded by the browser: a canvas at the capped size. */
Reactor3D.capImage = function(image) {
    const cap = Math.max(64, Math.floor(this.maxTextureSize || 0));
    const width = image && (image.naturalWidth || image.width);
    const height = image && (image.naturalHeight || image.height);
    if (!image || !(width > cap || height > cap) || typeof document === "undefined") return image;
    const scale = cap / Math.max(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
};

Reactor3D.capBitmapSize = function(bitmap) {
    const cap = Math.max(64, Math.floor(this.maxTextureSize || 0));
    if (!bitmap || !(bitmap.width > cap || bitmap.height > cap) || typeof createImageBitmap !== "function") {
        return bitmap;
    }
    const scale = cap / Math.max(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    return createImageBitmap(bitmap, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
        imageOrientation: "none",
        premultiplyAlpha: "none"
    }).then(smaller => {
        if (bitmap.close) bitmap.close();
        return smaller;
    }, () => bitmap);
};

Reactor3D.readModelAsync = function(buffer, ext, baseUrl, texture, options) {
    const kind = String(ext || ".glb").toLowerCase();
    const beforeBuild = options && typeof options.beforeBuild === "function"
        ? options.beforeBuild : () => null;
    if (kind === ".glb") {
        return this.parseGlbAsync(buffer)
            .then(parsed => Promise.resolve().then(beforeBuild).then(() => parsed, error => {
                for (const bitmap of Object.values((parsed && parsed.bitmaps) || {})) {
                    if (bitmap && bitmap.close) bitmap.close();
                }
                throw error;
            }))
            .then(parsed => {
                if (parsed && parsed.json) {
                    return this.buildGlbTemplate(parsed.json, parsed.bin, baseUrl, parsed.bitmaps);
                }
                return this.readModel((parsed && parsed.buffer) || buffer, kind, baseUrl, texture);
            });
    }
    return Promise.resolve(beforeBuild()).then(() => this.readModel(buffer, ext, baseUrl, texture));
};

Reactor3D.readModel = function(buffer, ext, baseUrl, texture) {
    const kind = String(ext || ".glb").toLowerCase();
    if (kind === ".glb") {
        const parsed = this.readGlb(buffer);
        return this.buildGlbTemplate(parsed.json, parsed.bin, baseUrl);
    }
    if (kind === ".obj") return this.buildMeshTemplate(this.readObj(buffer), baseUrl, texture);
    if (kind === ".stl") return this.buildMeshTemplate(this.readStl(buffer), baseUrl, texture);
    if (kind === ".dxf") return this.buildMeshTemplate(this.readDxf(buffer), baseUrl, texture);
    if (kind === ".fbx") return this.buildMeshTemplate(this.readFbx(buffer), baseUrl, texture);
    if (kind === ".3mf") return this.buildMeshTemplate(this.read3mf(buffer), baseUrl, texture);
    if (kind === ".usdz") return this.buildMeshTemplate(this.readUsdz(buffer), baseUrl, texture);
    if (kind === ".blend") throw new Error("export Blend files as GLB, OBJ or FBX");
    throw new Error("unsupported model type " + kind);
};

Reactor3D._modelText = function(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return new TextDecoder("utf-8").decode(bytes);
};

Reactor3D._zipFiles = function(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const files = Object.create(null);
    let offset = 0;
    while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
        const method = view.getUint16(offset + 8, true);
        const compSize = view.getUint32(offset + 18, true);
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const nameStart = offset + 30;
        const name = this._modelText(bytes.subarray(nameStart, nameStart + nameLen)).replace(/\\/g, "/");
        const start = nameStart + nameLen + extraLen;
        if (start + compSize > bytes.length) break;
        const packed = bytes.subarray(start, start + compSize);
        if (method === 0) files[name] = packed;
        else if (method === 8 && typeof pako !== "undefined") files[name] = pako.inflate(packed);
        offset = start + compSize;
    }
    return files;
};

Reactor3D.readObj = function(buffer) {
    const verts = [];
    const coords = [];
    const faces = [];
    const outPositions = [];
    const outUvs = [];
    // OBJ indexes positions and texture coordinates separately; a textured
    // corner is welded per unique v/vt pair so the geometry can carry a
    // single uv attribute. Position-only files keep the plain index path.
    const welded = new Map();
    const weld = (vi, ti) => {
        const key = vi + "/" + ti;
        let at = welded.get(key);
        if (at === undefined) {
            at = outPositions.length / 3;
            welded.set(key, at);
            outPositions.push(verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2]);
            outUvs.push(coords[ti * 2] || 0, coords[ti * 2 + 1] || 0);
        }
        return at;
    };
    let anyUv = false;
    // Group runs let a multi-part OBJ keep its named pieces as separate
    // meshes, which is what animation rules need to move a jaw without
    // moving the body.
    let groupName = "";
    const groupRuns = [];
    const lines = this._modelText(buffer).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts[0] === "v" && parts.length >= 4) {
            verts.push(+parts[1], +parts[2], +parts[3]);
        } else if (parts[0] === "vt" && parts.length >= 3) {
            coords.push(+parts[1], +parts[2]);
        } else if ((parts[0] === "g" || parts[0] === "o") && parts.length >= 2) {
            groupName = parts.slice(1).join(" ");
        } else if (parts[0] === "f" && parts.length >= 4) {
            const run = groupRuns[groupRuns.length - 1];
            if (!run || run.name !== groupName) {
                groupRuns.push({ name: groupName, start: faces.length });
            }
            const ids = [];
            for (let p = 1; p < parts.length; p++) {
                const pieces = parts[p].split("/");
                const raw = parseInt(pieces[0], 10);
                if (!Number.isFinite(raw) || raw === 0) continue;
                const vi = raw < 0 ? verts.length / 3 + raw : raw - 1;
                const rawT = parseInt(pieces[1], 10);
                const ti = Number.isFinite(rawT) && rawT !== 0
                    ? (rawT < 0 ? coords.length / 2 + rawT : rawT - 1)
                    : -1;
                if (ti >= 0) anyUv = true;
                ids.push(weld(vi, ti));
            }
            for (let t = 1; t + 1 < ids.length; t++) faces.push(ids[0], ids[t], ids[t + 1]);
        }
    }
    if (!faces.length) throw new Error("OBJ has no faces");
    const mesh = { positions: new Float32Array(outPositions), indices: faces };
    if (anyUv) mesh.uvs = new Float32Array(outUvs);
    for (let i = 0; i < groupRuns.length; i++) {
        groupRuns[i].count = (i + 1 < groupRuns.length
            ? groupRuns[i + 1].start : faces.length) - groupRuns[i].start;
    }
    const named = new Set(groupRuns.map(run => run.name).filter(name => name));
    if (named.size >= 2) mesh.groups = groupRuns;
    return mesh;
};

Reactor3D.readStl = function(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const asText = this._modelText(bytes.subarray(0, Math.min(bytes.length, 80)));
    const ascii = /^solid\b/i.test(asText) && bytes.length !== 84 + 50 * view.getUint32(80, true);
    const positions = [];
    if (!ascii && bytes.length >= 84) {
        const count = view.getUint32(80, true);
        if (bytes.length >= 84 + count * 50) {
            for (let i = 0; i < count; i++) {
                const base = 84 + i * 50 + 12;
                for (let v = 0; v < 9; v++) positions.push(view.getFloat32(base + v * 4, true));
            }
            if (positions.length) return { positions: new Float32Array(positions) };
        }
    }
    const text = this._modelText(bytes);
    const vertex = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
    let match;
    while ((match = vertex.exec(text))) {
        positions.push(+match[1], +match[2], +match[3]);
    }
    if (positions.length < 9) throw new Error("STL has no triangles");
    return { positions: new Float32Array(positions) };
};

Reactor3D.readDxf = function(buffer) {
    const lines = this._modelText(buffer).split(/\r?\n/);
    const positions = [];
    const take = (start, codes) => {
        const point = {};
        for (let i = start; i + 1 < lines.length; i += 2) {
            const code = lines[i].trim();
            if (code === "0") break;
            if (codes.indexOf(code) >= 0) point[code] = +lines[i + 1];
        }
        return point;
    };
    for (let i = 0; i + 1 < lines.length; i++) {
        if (lines[i].trim() !== "0" || String(lines[i + 1]).trim().toUpperCase() !== "3DFACE") continue;
        const face = take(i + 2, ["10", "20", "30", "11", "21", "31", "12", "22", "32", "13", "23", "33"]);
        const pts = [
            [face["10"], face["20"], face["30"]],
            [face["11"], face["21"], face["31"]],
            [face["12"], face["22"], face["32"]],
            [face["13"], face["23"], face["33"]]
        ].filter(p => p.every(Number.isFinite));
        if (pts.length < 3) continue;
        const push = (a, b, c) => positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        push(pts[0], pts[1], pts[2]);
        if (pts.length > 3) push(pts[0], pts[2], pts[3]);
    }
    if (positions.length < 9) throw new Error("DXF has no 3DFACE triangles");
    return { positions: new Float32Array(positions) };
};

Reactor3D._fbxPolygons = function(vertices, indices) {
    const positions = [];
    let poly = [];
    for (let i = 0; i < indices.length; i++) {
        const value = indices[i];
        const end = value < 0;
        poly.push(end ? ~value : value);
        if (!end) continue;
        for (let t = 1; t + 1 < poly.length; t++) {
            for (const index of [poly[0], poly[t], poly[t + 1]]) {
                positions.push(vertices[index * 3] || 0, vertices[index * 3 + 1] || 0, vertices[index * 3 + 2] || 0);
            }
        }
        poly = [];
    }
    if (positions.length < 9) throw new Error("FBX has no polygons");
    return { positions: new Float32Array(positions) };
};

Reactor3D.readFbxAscii = function(text) {
    const block = (label) => {
        const match = text.match(new RegExp(label + "\\s*:\\s*\\*\\d+\\s*\\{([\\s\\S]*?)\\}", "i"));
        if (!match) return null;
        const numbers = (match[1].match(/[-+0-9.eE]+/g) || []).map(Number).filter(Number.isFinite);
        return numbers.length ? numbers : null;
    };
    const vertices = block("Vertices");
    const indices = block("PolygonVertexIndex");
    if (!vertices || !indices) throw new Error("FBX has no mesh");
    return this._fbxPolygons(vertices, indices);
};

Reactor3D.readFbxBinary = function(buffer) {
    return this._fbxScene(this._fbxTree(buffer));
};

/**
 * The whole node tree of a binary FBX: every node as {name, props, children},
 * numbers as numbers, 64-bit ids as decimal strings, strings decoded (the
 * "\0" of a typed name reads as "::"), raw data as bytes, and arrays as
 * typed arrays, inflated through pako when the file compressed them.
 */
Reactor3D._fbxTree = function(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint32(23, true);
    const wide = version >= 7500;
    let cursor = 27;
    const u32 = () => {
        const value = wide ? Number(view.getBigUint64(cursor, true)) : view.getUint32(cursor, true);
        cursor += wide ? 8 : 4;
        return value;
    };
    const readArray = type => {
        const count = view.getUint32(cursor, true);
        const encoding = view.getUint32(cursor + 4, true);
        const length = view.getUint32(cursor + 8, true);
        cursor += 12;
        let data = bytes.subarray(cursor, cursor + length);
        cursor += length;
        if (encoding === 1) {
            if (typeof pako === "undefined") throw new Error("FBX arrays are compressed and pako is not loaded");
            data = pako.inflate(data);
        }
        const Kind = { d: Float64Array, f: Float32Array, i: Int32Array, l: BigInt64Array, b: Uint8Array, c: Uint8Array }[type];
        const size = Kind.BYTES_PER_ELEMENT;
        const copy = new Uint8Array(count * size);
        copy.set(data.subarray(0, count * size));
        const out = new Kind(copy.buffer);
        return type === "l" ? Array.from(out, v => String(v)) : out;
    };
    const readProperty = () => {
        const type = String.fromCharCode(bytes[cursor++]);
        if (type === "Y") { const v = view.getInt16(cursor, true); cursor += 2; return v; }
        if (type === "C") return bytes[cursor++];
        if (type === "I") { const v = view.getInt32(cursor, true); cursor += 4; return v; }
        if (type === "F") { const v = view.getFloat32(cursor, true); cursor += 4; return v; }
        if (type === "D") { const v = view.getFloat64(cursor, true); cursor += 8; return v; }
        if (type === "L") { const v = view.getBigInt64(cursor, true); cursor += 8; return String(v); }
        if (type === "S" || type === "R") {
            const length = view.getUint32(cursor, true);
            cursor += 4;
            const data = bytes.subarray(cursor, cursor + length);
            cursor += length;
            return type === "S" ? this._modelText(data).replace(/\u0000\u0001/g, "::") : data;
        }
        if ("fdilbc".indexOf(type) >= 0) return readArray(type);
        throw new Error("FBX property " + type);
    };
    const readNode = () => {
        const end = u32();
        const count = u32();
        u32();
        const nameLen = bytes[cursor++];
        if (!end) return null;
        const name = this._modelText(bytes.subarray(cursor, cursor + nameLen));
        cursor += nameLen;
        const props = [];
        for (let i = 0; i < count; i++) props.push(readProperty());
        const children = [];
        while (cursor < end) {
            const child = readNode();
            if (!child) break;
            children.push(child);
        }
        cursor = end;
        return { name, props, children };
    };
    const roots = [];
    while (cursor + (wide ? 25 : 13) <= bytes.length) {
        const node = readNode();
        if (!node) break;
        roots.push(node);
    }
    return roots;
};

/**
 * The meshes of an FBX scene as one unwelded triangle list: positions and UVs
 * per corner, a group per model part and material, and the materials with
 * their colour, opacity and colour map (a file name beside the model, or
 * bytes embedded in the file). Each part is placed by its model transforms.
 */
Reactor3D._fbxScene = function(roots) {
    const find = (list, name) => list.find(node => node.name === name);
    const objects = find(roots, "Objects");
    const connections = find(roots, "Connections");
    if (!objects) throw new Error("FBX has no objects");
    const properties = node => {
        const out = {};
        const block = find(node.children, "Properties70");
        for (const p of block ? block.children : []) if (p.name === "P") out[p.props[0]] = p.props.slice(4);
        return out;
    };
    const geometries = new Map(), models = new Map(), materials = new Map(), textures = new Map(), videos = new Map();
    for (const node of objects.children) {
        const id = String(node.props[0]), name = String(node.props[1] || "").replace(/::.*$/, "");
        if (node.name === "Geometry") {
            const vertices = find(node.children, "Vertices"), indices = find(node.children, "PolygonVertexIndex");
            if (!vertices || !indices) continue;
            const uvLayer = find(node.children, "LayerElementUV"), materialLayer = find(node.children, "LayerElementMaterial");
            const value = (layer, key) => { const child = layer && find(layer.children, key); return child ? child.props[0] : null; };
            geometries.set(id, {
                vertices: vertices.props[0], indices: indices.props[0],
                uv: uvLayer ? { values: value(uvLayer, "UV"), index: value(uvLayer, "UVIndex"), mapping: value(uvLayer, "MappingInformationType"), reference: value(uvLayer, "ReferenceInformationType") } : null,
                material: materialLayer ? { values: value(materialLayer, "Materials"), mapping: value(materialLayer, "MappingInformationType") } : null
            });
        } else if (node.name === "Model") models.set(id, { id, name, props: properties(node), parent: null, geometry: null, materials: [] });
        else if (node.name === "Material") {
            const props = properties(node);
            const color = props.DiffuseColor || props.Diffuse || [0.8, 0.8, 0.8];
            const opacity = props.Opacity ? Number(props.Opacity[0]) : props.TransparencyFactor ? 1 - Number(props.TransparencyFactor[0]) : 1;
            materials.set(id, { id, name, color: [Number(color[0]), Number(color[1]), Number(color[2])], opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1, texture: "", alpha: "", embedded: null });
        } else if (node.name === "Texture") {
            const file = value => value ? String(value).replace(/\\/g, "/").replace(/^.*\//, "") : "";
            const relative = find(node.children, "RelativeFilename"), absolute = find(node.children, "FileName");
            textures.set(id, { id, file: file(relative && relative.props[0]) || file(absolute && absolute.props[0]), video: null });
        } else if (node.name === "Video") {
            const content = find(node.children, "Content");
            videos.set(id, { id, content: content && content.props[0] instanceof Uint8Array && content.props[0].length ? content.props[0] : null });
        }
    }
    for (const c of connections ? connections.children : []) {
        if (c.name !== "C") continue;
        const kind = c.props[0], child = String(c.props[1]), parent = String(c.props[2]);
        if (kind === "OO") {
            if (models.has(child) && models.has(parent)) models.get(child).parent = parent;
            else if (geometries.has(child) && models.has(parent)) models.get(parent).geometry = child;
            else if (materials.has(child) && models.has(parent)) models.get(parent).materials.push(child);
            else if (videos.has(child) && textures.has(parent)) textures.get(parent).video = child;
        } else if (kind === "OP" && textures.has(child) && materials.has(parent)) {
            const property = String(c.props[3] || ""), material = materials.get(parent), texture = textures.get(child);
            if (/^(DiffuseColor|Diffuse|BaseColor|Maya\|baseColor|3dsMax\|base_color_map)$/i.test(property) || !material.texture && /Color/i.test(property)) material.texture = texture.file;
            if (/Transparen|Opacity|alpha/i.test(property)) material.alpha = texture.file;
            const video = texture.video && videos.get(texture.video);
            if (video && video.content && !material.embedded && material.texture === texture.file) material.embedded = video.content;
        }
    }
    // A model's place in the world: its parents' transforms, then translation, pre-rotation, rotation and scaling; geometric transforms move only its own mesh.
    const hasThree = typeof THREE !== "undefined";
    const numbers = (list, fallback) => list && list.length >= 3 ? [Number(list[0]) || 0, Number(list[1]) || 0, Number(list[2]) || 0] : fallback;
    const rotation = (degrees, order) => {
        const e = new THREE.Euler(degrees[0] * Math.PI / 180, degrees[1] * Math.PI / 180, degrees[2] * Math.PI / 180, ["XYZ", "XZY", "YZX", "YXZ", "ZXY", "ZYX"][order] || "XYZ");
        return new THREE.Matrix4().makeRotationFromEuler(e);
    };
    const local = model => {
        const p = model.props, order = Number((p.RotationOrder || [0])[0]) || 0;
        const m = new THREE.Matrix4().makeTranslation(...numbers(p["Lcl Translation"], [0, 0, 0]));
        if (p.PreRotation) m.multiply(rotation(numbers(p.PreRotation, [0, 0, 0]), 0));
        m.multiply(rotation(numbers(p["Lcl Rotation"], [0, 0, 0]), order));
        m.multiply(new THREE.Matrix4().makeScale(...numbers(p["Lcl Scaling"], [1, 1, 1])));
        return m;
    };
    const worlds = new Map();
    const world = model => {
        if (worlds.has(model.id)) return worlds.get(model.id);
        const own = local(model), parent = model.parent && models.get(model.parent);
        const m = parent ? world(parent).clone().multiply(own) : own;
        worlds.set(model.id, m);
        return m;
    };
    const geometric = model => {
        const p = model.props;
        const m = new THREE.Matrix4().makeTranslation(...numbers(p.GeometricTranslation, [0, 0, 0]));
        m.multiply(rotation(numbers(p.GeometricRotation, [0, 0, 0]), 0));
        m.multiply(new THREE.Matrix4().makeScale(...numbers(p.GeometricScaling, [1, 1, 1])));
        return m;
    };
    const settings = find(roots, "GlobalSettings");
    const upAxis = settings ? Number((properties(settings).UpAxis || [1])[0]) : 1;
    const up = hasThree && upAxis === 2 ? new THREE.Matrix4().makeRotationX(-Math.PI / 2) : null;
    const groups = [], materialList = [], materialIndex = new Map();
    const materialFor = id => {
        const material = id && materials.get(id);
        const key = material ? material.id : "";
        if (!materialIndex.has(key)) {
            materialIndex.set(key, materialList.length);
            materialList.push(material ? { name: material.name, color: material.color, opacity: material.opacity, texture: material.texture, alpha: material.alpha, embedded: material.embedded } : { name: "", color: [0.53, 0.53, 0.53], opacity: 1, texture: "", alpha: "", embedded: null });
        }
        return materialIndex.get(key);
    };
    let anyUv = false;
    const point = hasThree ? new THREE.Vector3() : null;
    for (const model of models.values()) {
        const g = model.geometry && geometries.get(model.geometry);
        if (!g) continue;
        const transform = hasThree ? (up ? up.clone().multiply(world(model)) : world(model)).multiply(geometric(model)) : null;
        const uv = g.uv && g.uv.values && g.uv.values.length ? g.uv : null;
        if (uv) anyUv = true;
        const uvAt = (corner, vertex) => {
            if (!uv) return [0, 0];
            const mapping = uv.mapping || "ByPolygonVertex", byIndex = uv.reference === "IndexToDirect" && uv.index && uv.index.length;
            let i = mapping === "ByPolygonVertex" ? corner : mapping === "AllSame" ? 0 : vertex;
            if (byIndex) i = uv.index[i];
            return [uv.values[i * 2] || 0, uv.values[i * 2 + 1] || 0];
        };
        const materialAt = polygon => {
            const layer = g.material, list = layer && layer.values;
            if (!list || !list.length) return model.materials[0] || null;
            const slot = layer.mapping === "ByPolygon" ? list[polygon] : list[0];
            return model.materials[slot] || model.materials[0] || null;
        };
        // One run per material of this model, each collecting its own corners; runs are laid out one after another below.
        const runs = new Map();
        let poly = [], polygon = 0;
        for (let corner = 0; corner < g.indices.length; corner++) {
            const raw = g.indices[corner], end = raw < 0, vertex = end ? ~raw : raw;
            poly.push({ vertex, corner });
            if (!end) continue;
            const index = materialFor(materialAt(polygon));
            let run = runs.get(index);
            if (!run) { run = { name: model.name, material: index, positions: [], uvs: [] }; runs.set(index, run); groups.push(run); }
            for (let t = 1; t + 1 < poly.length; t++) {
                for (const c of [poly[0], poly[t], poly[t + 1]]) {
                    let x = g.vertices[c.vertex * 3] || 0, y = g.vertices[c.vertex * 3 + 1] || 0, z = g.vertices[c.vertex * 3 + 2] || 0;
                    if (transform) { point.set(x, y, z).applyMatrix4(transform); x = point.x; y = point.y; z = point.z; }
                    run.positions.push(x, y, z);
                    const st = uvAt(c.corner, c.vertex);
                    run.uvs.push(st[0], st[1]);
                }
            }
            poly = [];
            polygon++;
        }
    }
    const total = groups.reduce((sum, run) => sum + run.positions.length, 0);
    if (total < 9) throw new Error("FBX has no polygons");
    const positions = new Float32Array(total), uvs = new Float32Array(total / 3 * 2);
    let cursor = 0;
    for (const run of groups) {
        positions.set(run.positions, cursor);
        uvs.set(run.uvs, cursor / 3 * 2);
        run.start = cursor / 3;
        run.count = run.positions.length / 3;
        cursor += run.positions.length;
        delete run.positions;
        delete run.uvs;
    }
    const indices = new Uint32Array(total / 3);
    for (let i = 0; i < indices.length; i++) indices[i] = i;
    return { positions, uvs: anyUv ? uvs : null, indices, groups, materials: materialList };
};

/**
 * What a model file costs, in the shape RRGlbOptimizer.analyze gives for a
 * GLB: triangles, vertices, draw calls, materials, the pictures it names (by
 * file, sized by the caller from disk), rig and animation counts. An FBX is
 * read in full; the other formats give one mesh and the sidecar's texture.
 */
Reactor3D.modelCost = function(buffer, ext, textureFile) {
    const kind = String(ext || ".glb").toLowerCase();
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const cost = { bytes: bytes.length, images: [], tangentBytes: 0, floatWeightBytes: 0, triangles: 0, vertices: 0, animated: false, primitives: 0, materials: 0, animations: 0, skinned: false, bones: 0 };
    if (kind === ".fbx" && this._modelText(bytes.subarray(0, 20)).indexOf("Kaydara FBX Binary") === 0) {
        const tree = this._fbxTree(bytes), mesh = this._fbxScene(tree);
        const objects = tree.find(node => node.name === "Objects"), children = objects ? objects.children : [];
        cost.triangles = mesh.positions.length / 9;
        cost.primitives = mesh.groups.length;
        cost.materials = mesh.materials.length;
        for (const node of children) {
            if (node.name === "Geometry") { const v = node.children.find(c => c.name === "Vertices"); if (v && v.props[0]) cost.vertices += v.props[0].length / 3; }
            if (node.name === "AnimationStack") cost.animations++;
            if (node.name === "Deformer" && /Skin/i.test(String(node.props[2] || ""))) cost.skinned = true;
            if (node.name === "Deformer" && /Cluster/i.test(String(node.props[2] || ""))) cost.bones++;
        }
        cost.animated = cost.animations > 0;
        const named = new Set();
        for (const material of mesh.materials) for (const name of [material.texture, material.alpha]) if (name && !named.has(name)) { named.add(name); cost.images.push({ name, bytes: 0, width: 0, height: 0, embedded: !!material.embedded && name === material.texture }); }
        return cost;
    }
    const mesh = this.readModel(bytes, kind, "", "");
    cost.triangles = mesh.indices && mesh.indices.length ? mesh.indices.length / 3 : mesh.positions.length / 9;
    cost.vertices = mesh.positions.length / 3;
    cost.primitives = mesh.groups ? new Set(mesh.groups.map(run => run.name)).size || 1 : 1;
    cost.materials = 1;
    if (textureFile && mesh.uvs) cost.images.push({ name: textureFile, bytes: 0, width: 0, height: 0, embedded: false });
    return cost;
};

Reactor3D.readFbx = function(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const magic = this._modelText(bytes.subarray(0, 20));
    if (magic.indexOf("Kaydara FBX Binary") === 0) return this.readFbxBinary(bytes);
    return this.readFbxAscii(this._modelText(bytes));
};

Reactor3D._xmlAttr = function(tag, name) {
    const match = String(tag).match(new RegExp("\\b" + name + "\\s*=\\s*[\"']([^\"']+)[\"']", "i"));
    return match ? match[1] : "";
};

Reactor3D.read3mf = function(buffer) {
    const files = this._zipFiles(buffer);
    const names = Object.keys(files).filter(name => /\.model$/i.test(name));
    if (!names.length) throw new Error("3MF has no model");
    const verts = [];
    const faces = [];
    for (let n = 0; n < names.length; n++) {
        const text = this._modelText(files[names[n]]);
        const base = verts.length / 3;
        const vertex = /<vertex\b([^>]*)>/gi;
        let match;
        while ((match = vertex.exec(text))) {
            verts.push(+this._xmlAttr(match[1], "x"), +this._xmlAttr(match[1], "y"), +this._xmlAttr(match[1], "z"));
        }
        const triangle = /<triangle\b([^>]*)>/gi;
        while ((match = triangle.exec(text))) {
            faces.push(base + (+this._xmlAttr(match[1], "v1")),
                base + (+this._xmlAttr(match[1], "v2")),
                base + (+this._xmlAttr(match[1], "v3")));
        }
    }
    if (!faces.length) throw new Error("3MF has no triangles");
    return { positions: new Float32Array(verts), indices: faces };
};

Reactor3D.readUsdaMesh = function(text) {
    const points = [];
    const pointBlock = text.match(/point3f\[\]\s+points\s*=\s*\[([\s\S]*?)\]/i);
    if (pointBlock) {
        const nums = pointBlock[1].match(/[-+0-9.eE]+/g) || [];
        for (let i = 0; i + 2 < nums.length; i += 3) points.push(+nums[i], +nums[i + 1], +nums[i + 2]);
    }
    const counts = [];
    const countBlock = text.match(/int\[\]\s+faceVertexCounts\s*=\s*\[([\s\S]*?)\]/i);
    if (countBlock) {
        const nums = countBlock[1].match(/[-+0-9]+/g) || [];
        for (let i = 0; i < nums.length; i++) counts.push(+nums[i]);
    }
    const indices = [];
    const indexBlock = text.match(/int\[\]\s+faceVertexIndices\s*=\s*\[([\s\S]*?)\]/i);
    if (indexBlock) {
        const nums = indexBlock[1].match(/[-+0-9]+/g) || [];
        for (let i = 0; i < nums.length; i++) indices.push(+nums[i]);
    }
    if (!points.length || !indices.length) throw new Error("USDZ has no mesh");
    const faces = [];
    let cursor = 0;
    const rings = counts.length ? counts : [3];
    for (let r = 0; r < rings.length; r++) {
        const count = rings[r];
        const ring = indices.slice(cursor, cursor + count);
        cursor += count;
        for (let t = 1; t + 1 < ring.length; t++) faces.push(ring[0], ring[t], ring[t + 1]);
    }
    return { positions: new Float32Array(points), indices: faces };
};

Reactor3D.readUsdz = function(buffer) {
    const files = this._zipFiles(buffer);
    const names = Object.keys(files).filter(name => /\.usda$/i.test(name));
    if (!names.length) throw new Error("USDZ needs a USDA mesh (USDC is not read)");
    return this.readUsdaMesh(this._modelText(files[names[0]]));
};

Reactor3D.buildMeshTemplate = function(mesh, baseUrl, textureFile) {
    if (typeof THREE === "undefined") throw new Error("three.js is not loaded");
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    if (mesh.uvs && mesh.uvs.length) {
        geometry.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
    }
    if (mesh.indices && mesh.indices.length) {
        const max = mesh.indices.reduce((high, value) => value > high ? value : high, 0);
        const Index = max > 65535 ? Uint32Array : Uint16Array;
        geometry.setIndex(new THREE.BufferAttribute(new Index(mesh.indices), 1));
    }
    geometry.computeVertexNormals();
    // A colour map from the model's textures/ folder, when the format
    // carries UVs and the sidecar names one — chosen by the picker, since
    // these formats do not embed their images the way GLB does. Image-based
    // loading works from both the editor's file:// base and the game's
    // relative one, where fetch would not.
    const textures = [];
    const loadMap = (file, embedded) => {
        const direct = /^(?:blob:|data:)/i.test(file || "");
        if (!mesh.uvs || !(file || embedded) || !(baseUrl || direct || embedded)) return null;
        const map = new THREE.Texture();
        if (THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
        const candidates = embedded && typeof URL !== "undefined" && typeof Blob !== "undefined" ? [URL.createObjectURL(new Blob([embedded]))]
            : direct ? [file] : [
                baseUrl.replace(/\/source\/$/, "/textures/") + file,
                baseUrl + file
            ];
        const tryAt = index => {
            if (index >= candidates.length) return;
            const img = new Image();
            img.onload = () => {
                map.image = img;
                map.needsUpdate = true;
            };
            img.onerror = () => tryAt(index + 1);
            img.src = candidates[index];
        };
        tryAt(0);
        textures.push(map);
        return map;
    };
    // The format's own materials when it carries them (FBX): each with its
    // colour, opacity and colour map from the model's textures/ folder or the
    // bytes embedded in the file; the sidecar's texture covers any material
    // without one. Other formats get the one material the sidecar names.
    // The sidecar's texture stands in only when the file names none of its own; a file that maps some of its materials means the bare ones to be plain colour.
    const anyOwnTexture = !!(mesh.materials || []).some(def => def.texture || def.embedded);
    const makeMaterial = def => {
        const map = loadMap(def && (def.texture || def.embedded) ? def.texture : anyOwnTexture ? "" : textureFile, def && def.embedded);
        const color = def && !map && def.color ? new THREE.Color(def.color[0], def.color[1], def.color[2]) : null;
        const material = new THREE.MeshBasicMaterial(map
            ? { color: 0xffffff, map, side: THREE.FrontSide, fog: false }
            : { color: color || 0x888888, side: THREE.FrontSide, fog: false });
        Reactor3D.litMaterial(material);
        material.__reactorModel = true;
        if (def && (def.alpha || def.opacity < 1)) {
            // Its own colour map's alpha cuts it out; a separate alpha picture is read as an alpha map.
            if (def.alpha && def.alpha !== def.texture) material.alphaMap = loadMap(def.alpha, null);
            material.transparent = true;
            material.opacity = def.opacity < 1 ? def.opacity : 1;
            material.alphaTest = def.alpha ? 0.02 : 0;
            material.depthWrite = false;
        }
        return material;
    };
    const materials = mesh.materials && mesh.materials.length ? mesh.materials.map(makeMaterial) : null;
    const material = materials ? materials[0] : makeMaterial(null);
    const materialAt = run => materials && run && run.material !== undefined && materials[run.material] ? materials[run.material] : material;
    const root = new THREE.Group();
    root.name = "model";
    if (mesh.groups) {
        // Each named group becomes its own mesh sharing the welded
        // attributes, with the group's centre recorded as a pivot so an
        // animation rule can hinge it. The whole-model mesh keeps working
        // for files without groups.
        const byName = new Map();
        for (const run of mesh.groups) {
            const key = run.name + (run.material !== undefined ? "\u0000" + run.material : "");
            const list = byName.get(key) || [];
            list.push(run);
            byName.set(key, list);
        }
        for (const [key, runs] of byName) {
            const name = key.split("\u0000")[0];
            const ids = [];
            for (const run of runs) {
                for (let i = 0; i < run.count; i++) ids.push(mesh.indices[run.start + i]);
            }
            if (!ids.length) continue;
            const part = new THREE.BufferGeometry();
            part.setAttribute("position", geometry.getAttribute("position"));
            if (geometry.getAttribute("uv")) part.setAttribute("uv", geometry.getAttribute("uv"));
            const Index = ids.reduce((h, v) => v > h ? v : h, 0) > 65535 ? Uint32Array : Uint16Array;
            part.setIndex(new THREE.BufferAttribute(new Index(ids), 1));
            part.computeVertexNormals();
            const bounds = new THREE.Box3();
            const point = new THREE.Vector3();
            for (const id of ids) {
                point.set(mesh.positions[id * 3], mesh.positions[id * 3 + 1], mesh.positions[id * 3 + 2]);
                bounds.expandByPoint(point);
            }
            const pivot = bounds.getCenter(new THREE.Vector3());
            const piece = new THREE.Mesh(part, materialAt(runs[0]));
            piece.name = name || "model";
            piece.userData.parts = name
                ? [{ name, pivot: [pivot.x, pivot.y, pivot.z] }]
                : [];
            root.add(piece);
        }
    } else {
        root.add(new THREE.Mesh(geometry, material));
    }
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    for (const child of root.children) {
        child.position.x -= center.x;
        child.position.y -= box.min.y;
        child.position.z -= center.z;
    }
    root.userData.glbSize = { x: size.x, y: size.y, z: size.z };
    root.userData.glbTextures = textures;
    return root;
};

Reactor3D._glbAccessor = function(json, bin, index) {
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT3: 9, MAT4: 16 }[accessor.type] || 1;
    const bytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
    const stride = view.byteStride || bytes * comps;
    const ctor = {
        5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
        5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array
    }[accessor.componentType];
    const packed = stride === bytes * comps;
    if (packed && ctor) {
        return new ctor(bin.buffer, bin.byteOffset + offset, accessor.count * comps);
    }
    const out = new Float32Array(accessor.count * comps);
    const src = new DataView(bin.buffer, bin.byteOffset + offset);
    const reader = {
        5120: (v, o) => v.getInt8(o),
        5121: (v, o) => v.getUint8(o),
        5122: (v, o) => v.getInt16(o, true),
        5123: (v, o) => v.getUint16(o, true),
        5125: (v, o) => v.getUint32(o, true),
        5126: (v, o) => v.getFloat32(o, true)
    }[accessor.componentType];
    for (let i = 0; i < accessor.count; i++) {
        for (let c = 0; c < comps; c++) {
            out[i * comps + c] = reader(src, i * stride + c * bytes);
        }
    }
    return out;
};

Reactor3D.studioEnvMap = function() {
    if (this._studioEnv !== undefined) return this._studioEnv;
    if (typeof document === "undefined" || typeof THREE === "undefined") {
        this._studioEnv = null;
        return null;
    }
    const size = 32;
    const stops = [
        [[228, 232, 236], [118, 122, 128]],
        [[176, 180, 186], [86, 90, 96]],
        [[248, 246, 242], [198, 194, 188]],
        [[72, 70, 68], [36, 34, 32]],
        [[210, 214, 218], [102, 106, 112]],
        [[164, 168, 174], [78, 82, 88]]
    ];
    const faces = stops.map(([hi, lo]) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        const gradient = ctx.createLinearGradient(0, 0, 0, size);
        gradient.addColorStop(0, "rgb(" + hi.join(",") + ")");
        gradient.addColorStop(1, "rgb(" + lo.join(",") + ")");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        return canvas;
    });
    const cube = new THREE.CubeTexture(faces);
    cube.needsUpdate = true;
    if (THREE.SRGBColorSpace) cube.colorSpace = THREE.SRGBColorSpace;
    this._studioEnv = cube;
    return cube;
};

Reactor3D._glbImageUrl = function(json, bin, image, baseUrl) {
    if (image.uri) {
        if (/^(data:|blob:|https?:|file:)/i.test(image.uri)) return image.uri;
        const cleaned = String(image.uri).replace(/\\/g, "/").replace(/^\.\//, "");
        return (baseUrl || "") + cleaned;
    }
    const view = json.bufferViews[image.bufferView];
    const bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const blob = new Blob([bytes], { type: image.mimeType || "image/png" });
    return URL.createObjectURL(blob);
};

Reactor3D._loadGlbTexture = function(json, bin, texInfo, baseUrl, textures, bitmaps, usedBitmaps) {
    if (!texInfo || !json.textures || !json.images) return null;
    const textureDef = json.textures[texInfo.index];
    if (!textureDef) return null;
    const image = json.images[textureDef.source];
    if (!image) return null;
    // The worker already decoded this image off-thread.
    if (bitmaps && bitmaps[textureDef.source]) {
        if (usedBitmaps) usedBitmaps.add(textureDef.source);
        const decoded = new THREE.Texture(bitmaps[textureDef.source]);
        decoded.flipY = false;
        if (THREE.SRGBColorSpace) decoded.colorSpace = THREE.SRGBColorSpace;
        decoded.needsUpdate = true;
        textures.push(decoded);
        return decoded;
    }
    const map = new THREE.Texture();
    map.flipY = false;
    if (THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
    const primary = this._glbImageUrl(json, bin, image, baseUrl);
    if (/^(blob:|data:)/i.test(primary)) {
        const ownedObjectUrl = !image.uri && /^blob:/i.test(primary);
        let objectUrlReleased = false;
        const releaseObjectUrl = () => {
            if (!ownedObjectUrl || objectUrlReleased) return;
            objectUrlReleased = true;
            URL.revokeObjectURL(primary);
        };
        let embedded;
        try {
            embedded = new THREE.TextureLoader().load(primary, loaded => {
                loaded.image = Reactor3D.capImage(loaded.image);
                loaded.needsUpdate = true;
                releaseObjectUrl();
                if (loaded.userData) delete loaded.userData.reactorObjectUrl;
            }, undefined, releaseObjectUrl);
        } catch (error) {
            releaseObjectUrl();
            throw error;
        }
        embedded.flipY = false;
        if (THREE.SRGBColorSpace) embedded.colorSpace = THREE.SRGBColorSpace;
        if (ownedObjectUrl && !objectUrlReleased) embedded.userData.reactorObjectUrl = primary;
        textures.push(embedded);
        return embedded;
    }
    const candidates = [primary];
    if (image.uri && baseUrl && /\/source\/$/.test(baseUrl)) {
        const name = String(image.uri).replace(/\\/g, "/").split("/").pop();
        candidates.push(baseUrl.replace(/\/source\/$/, "/textures/") + name);
    }
    const tryAt = index => {
        if (index >= candidates.length) return;
        const img = new Image();
        img.onload = () => {
            map.image = Reactor3D.capImage(img);
            map.needsUpdate = true;
        };
        img.onerror = () => tryAt(index + 1);
        img.src = candidates[index];
    };
    tryAt(0);
    textures.push(map);
    return map;
};

Reactor3D.buildGlbTemplate = function(json, bin, baseUrl, bitmaps) {
    if (typeof THREE === "undefined") throw new Error("three.js is not loaded");
    const root = new THREE.Group();
    root.name = "glb";
    const textures = [];
    const usedMaterials = new Set();
    for (const mesh of json.meshes || []) {
        for (const primitive of mesh.primitives || []) {
            if (primitive.material != null) usedMaterials.add(primitive.material);
        }
    }
    const usedBitmaps = new Set();
    const materials = (json.materials || []).map((def, materialIndex) => {
        if (!usedMaterials.has(materialIndex)) return null;
        const specgloss = def.extensions && def.extensions.KHR_materials_pbrSpecularGlossiness;
        const pbr = def.pbrMetallicRoughness || {};
        const color = pbr.baseColorFactor || (specgloss && specgloss.diffuseFactor) || [1, 1, 1, 1];
        const blend = def.alphaMode === "BLEND" || color[3] < 1;
        const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(color[0], color[1], color[2]),
            transparent: blend,
            opacity: color[3],
            depthWrite: !blend,
            side: def.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
            fog: false
        });
        if (def.alphaMode === "MASK") mat.alphaTest = def.alphaCutoff != null ? def.alphaCutoff : 0.5;
        mat.__reactorModel = true;
        mat.userData.baseColor = mat.color.clone();
        Reactor3D.litMaterial(mat);
        const texInfo = pbr.baseColorTexture || (specgloss && specgloss.diffuseTexture);
        const map = this._loadGlbTexture(
            json, bin, texInfo, baseUrl, textures, bitmaps, usedBitmaps);
        if (map) mat.map = map;
        const metallic = pbr.metallicFactor != null ? pbr.metallicFactor : 1;
        const roughness = pbr.roughnessFactor != null ? pbr.roughnessFactor : 1;
        const env = this.studioEnvMap();
        if (env && metallic > 0.25 && roughness < 0.65) {
            mat.envMap = env;
            mat.combine = THREE.MultiplyOperation;
            mat.reflectivity = Math.max(0.2, metallic * (1 - roughness * 0.65));
        }
        return mat;
    });
    for (const [source, bitmap] of Object.entries(bitmaps || {})) {
        if (!usedBitmaps.has(Number(source)) && bitmap?.close) bitmap.close();
    }
    const defaultMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.FrontSide, fog: false });
    defaultMat.__reactorModel = true;
    Reactor3D.litMaterial(defaultMat);
    defaultMat.userData.baseColor = defaultMat.color.clone();
    const meshes = (json.meshes || []).map(mesh => {
        const group = new THREE.Group();
        group.name = mesh.name || "";
        for (const prim of mesh.primitives || []) {
            if (prim.mode != null && prim.mode !== 4) continue;
            const pos = this._glbAccessor(json, bin, prim.attributes.POSITION);
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
            if (prim.attributes.NORMAL != null) {
                geometry.setAttribute("normal", new THREE.BufferAttribute(
                    this._glbAccessor(json, bin, prim.attributes.NORMAL), 3));
            } else {
                geometry.computeVertexNormals();
            }
            if (prim.attributes.TEXCOORD_0 != null) {
                geometry.setAttribute("uv", new THREE.BufferAttribute(
                    this._glbAccessor(json, bin, prim.attributes.TEXCOORD_0), 2));
            }
            if (prim.attributes.COLOR_0 != null) {
                const color = this._glbAccessor(json, bin, prim.attributes.COLOR_0);
                const comps = color.length && (json.accessors[prim.attributes.COLOR_0].type === "VEC4") ? 4 : 3;
                geometry.setAttribute("color", new THREE.BufferAttribute(color, comps));
            }
            if (prim.indices != null) {
                const idx = this._glbAccessor(json, bin, prim.indices);
                geometry.setIndex(new THREE.BufferAttribute(idx, 1));
            }
            if (prim.attributes.JOINTS_0 != null && prim.attributes.WEIGHTS_0 != null) {
                geometry.userData.joints = this._glbAccessor(json, bin, prim.attributes.JOINTS_0);
                geometry.userData.weights = this._glbAccessor(json, bin, prim.attributes.WEIGHTS_0);
            }
            let material = materials[prim.material] || defaultMat;
            if (prim.attributes.COLOR_0 != null) {
                material = material.clone();
                material.vertexColors = true;
                material.__reactorModel = true;
                Reactor3D.litMaterial(material);
            }
            group.add(new THREE.Mesh(geometry, material));
        }
        return group;
    });
    const nodes = (json.nodes || []).map(node => {
        const object = node.mesh != null ? meshes[node.mesh].clone() : new THREE.Group();
        object.name = node.name || object.name;
        if (node.translation) object.position.fromArray(node.translation);
        if (node.rotation) object.quaternion.fromArray(node.rotation);
        if (node.scale) object.scale.fromArray(node.scale);
        if (node.matrix) {
            const matrix = new THREE.Matrix4().fromArray(node.matrix);
            object.applyMatrix4(matrix);
        }
        if (node.skin != null && json.skins && json.skins[node.skin]) {
            object.userData.skin = json.skins[node.skin];
        }
        return object;
    });
    (json.nodes || []).forEach((node, index) => {
        for (const child of node.children || []) nodes[index].add(nodes[child]);
    });
    const scene = json.scenes && json.scenes[json.scene || 0];
    const tops = scene && scene.nodes ? scene.nodes : nodes.map((_, i) => i);
    for (const index of tops) {
        const node = nodes[index];
        if (node && !node.parent) root.add(node);
    }
    root.updateMatrixWorld(true);
    if ((json.animations || []).length) {
        return this.buildAnimatedGlbTemplate(json, bin, root, nodes, textures);
    }
    this.applyRestSkins(json, bin, root, nodes);
    // Named ancestry must survive the flatten: each mesh keeps the chain
    // of named nodes above it with their world pivots, so an animation
    // rule can still turn a wheel about its own axle after the hierarchy
    // is baked away. Pivots share the space the geometry is baked into.
    root.traverse(child => {
        if (!child.isMesh) return;
        const chain = [];
        for (let node = child; node && node !== root; node = node.parent) {
            if (!node.name) continue;
            const pivot = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
            chain.push({ name: node.name, pivot: [pivot.x, pivot.y, pivot.z] });
        }
        child.userData.parts = chain;
    });
    this.flattenModelWorld(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    for (const child of root.children) {
        child.position.x -= center.x;
        child.position.y -= box.min.y;
        child.position.z -= center.z;
    }
    // Each mesh remembers its place in the flattened order, so a distance
    // level built from the same file (same nodes, same order) can hand it
    // a coarser geometry by index. A number, so clones keep it.
    root.children.forEach((child, index) => { if (child.isMesh) child.userData.lodIndex = index; });
    root.userData.glbSize = { x: size.x, y: size.y, z: size.z };
    root.userData.glbTextures = textures;
    return root;
};

//-----------------------------------------------------------------------------
// Distance levels
//
// A heavy model far from the camera covers a few pixels and still costs
// every one of its triangles. The import optimizer writes geometry-only
// copies at coarser weld grids beside the source (`<name>.lod1.glb`,
// `.lod2.glb`, listed in model.json `lods`), and here each placed instance
// swaps its meshes' geometry by distance — the object, its materials,
// textures, recentring and collision stay the base model's, so a swap
// never moves or re-lights anything. Geometry is shared per level across
// every instance of the model.

/**
 * Switch to level N when the camera is further than this many times the
 * model's size. At four spans away a model covers about a quarter of the
 * view's height; a quarter of its triangles is not a visible change there,
 * and at ten spans a twentieth is not.
 */
Reactor3D.LOD_DISTANCES = [4, 10];
/** Come back a level only once this much nearer than the switch, so a hovering distance does not flicker. */
Reactor3D.LOD_HYSTERESIS = 0.85;

/**
 * Attach distance levels to a base template: `buffers` are the LOD GLBs'
 * bytes in level order. Levels whose flattened mesh count differs from the
 * base are refused. Idempotent per cache key.
 */
Reactor3D.attachLodLevels = function(template, key, buffers) {
    if (!template || !key || !buffers || !buffers.length || typeof THREE === "undefined") return null;
    if (template.userData.animated) return null;
    if (!this._lodCache) this._lodCache = Object.create(null);
    if (this._lodCache[key]) return this._lodCache[key];
    const base = template.children.filter(child => child.isMesh && child.userData.lodIndex !== undefined);
    if (!base.length) return null;
    const levels = [base.map(mesh => mesh.geometry)];
    for (const buffer of buffers) {
        let built = null;
        try {
            const parsed = this.readGlb(buffer);
            if (!parsed || !parsed.json) continue;
            built = this.buildGlbTemplate(parsed.json, parsed.bin, "", {});
        } catch (error) {
            console.warn("Reactor3D: a distance level of " + key + " could not be built.", error);
            continue;
        }
        const meshes = built.children.filter(child => child.isMesh);
        if (meshes.length !== base.length) {
            console.warn("Reactor3D: a distance level of " + key + " has " + meshes.length
                + " meshes where the model has " + base.length + "; ignored.");
            continue;
        }
        // The level's own materials are throwaway; its geometry is in the
        // same flattened space as the base (same nodes, same bake).
        for (const mesh of meshes) { if (mesh.material && mesh.material.dispose) mesh.material.dispose(); }
        levels.push(meshes.map(mesh => mesh.geometry));
    }
    if (levels.length < 2) return null;
    template.userData.lodKey = key;
    const entry = { levels };
    this._lodCache[key] = entry;
    return entry;
};

/**
 * Pick an instance's level from its distance to the camera and swap its
 * meshes' geometry. `size` is the model's size in tiles (its largest span
 * after scaling); `eye` the camera's world position.
 */
/**
 * Triangles a model may spend per pixel it covers on screen.
 *
 * The distance rule below is relative to the model's own size, which is
 * right for "is this thing far away" and useless as a cost ceiling: a
 * twenty-tile tower has to be eighty tiles off before it coarsens, which on
 * a fifty-tile map it never is, so the Demo's start map drew 7.5M triangles
 * a frame with every level built and unused.
 *
 * One triangle per pixel is the honest ceiling: at that point every pixel
 * on the model already has a triangle of its own and more geometry cannot
 * show up. Measured on the Demo's start map, a tighter 0.5 dropped the
 * screen-filling tower to a twentieth (0.1 triangles per covered pixel),
 * which is past the point where a silhouette starts to read as faceted; at
 * 1.0 it takes the quarter level instead and the small consoles, which are
 * coarser than the budget however far they drop, are unaffected.
 */
Reactor3D.LOD_TRIANGLES_PER_PIXEL = 1;
/** Refining again needs this much more room than coarsening did, so a level cannot flicker. */
Reactor3D.LOD_BUDGET_HYSTERESIS = 1.4;

/** Triangles in one built level, counted once and kept on the entry. */
Reactor3D._levelTriangles = function(entry, index) {
    const counts = entry.triangleCounts || (entry.triangleCounts = []);
    if (counts[index] !== undefined) return counts[index];
    let total = 0;
    for (const geometry of entry.levels[index] || []) {
        if (!geometry) continue;
        if (geometry.index) total += geometry.index.count / 3;
        else if (geometry.attributes && geometry.attributes.position) total += geometry.attributes.position.count / 3;
    }
    counts[index] = total;
    return total;
};

/**
 * Pixels per world unit at one unit of depth: the factor that turns a span
 * and a distance into a size on screen. Read from the live camera once a
 * frame — every placed instance asks, and the answer only changes when the
 * camera or the window does.
 */
/**
 * The two numbers the budget needs, for any camera and target: pixels per
 * world unit at one unit of depth, and how many pixels there are to fill.
 *
 * Taken as an argument rather than read from the viewport, because the
 * editor's map view has neither — it builds its own `THREE.WebGLRenderer`
 * and camera and never creates a `Reactor3D.Viewport`. Reading the viewport
 * there returned nothing, the budget was skipped, and the editor drew every
 * prop at full detail while the game beside it drew a twentieth: 7.5M
 * triangles against 2.2M, which is why the editor felt heavier than play.
 */
Reactor3D.lodScreen = function(camera, width, height) {
    if (!camera || !camera.isPerspectiveCamera || !(height > 0) || !(width > 0)) return null;
    return {
        factor: height / (2 * Math.tan((camera.fov * Math.PI) / 360)),
        pixels: width * height
    };
};

Reactor3D._lodScreenFactor = function() {
    // Keyed on what the answer is actually made of, not on the frame
    // counter: `Graphics` does not exist in the editor, so a frame key read
    // as -1 for ever and the factor computed once would never follow a
    // resized viewport or a changed field of view.
    let camera = null;
    let width = 0;
    let height = 0;
    try {
        const viewport = this.viewport ? this.viewport() : null;
        camera = viewport && viewport.camera ? viewport.camera() : null;
        const size = viewport && viewport.targetSize ? viewport.targetSize() : null;
        height = size && size.height > 0 ? size.height
            : (typeof Graphics !== "undefined" ? Graphics.height : 0);
        width = size && size.width > 0 ? size.width
            : (typeof Graphics !== "undefined" ? Graphics.width : 0);
    } catch (e) {
        camera = null;
    }
    if (!camera || !camera.isPerspectiveCamera || !(height > 0)) {
        this._lodFactor = 0;
        this._lodPixels = 0;
        return 0;
    }
    const key = camera.fov + "|" + width + "x" + height;
    if (this._lodFactorKey === key) return this._lodFactor;
    this._lodFactorKey = key;
    this._lodFactor = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this._lodPixels = width * height;
    return this._lodFactor;
};

/** Pixels in the pass being drawn, read alongside the factor above. */
Reactor3D._lodScreenPixels = function() {
    return this._lodPixels || (typeof Graphics !== "undefined" ? Graphics.width * Graphics.height : 1);
};

Reactor3D.pickLod = function(object, size, eye, cacheKey, screen) {
    if (!object || !eye) return;
    // The levels may arrive after an instance was cloned from its template
    // (they load behind the model in the game), so a caller that knows the
    // model's cache key passes it; the template's own mark serves otherwise.
    const key = cacheKey || object.userData.lodKey;
    const entry = key && this._lodCache && this._lodCache[key];
    if (!entry) return;
    const levels = entry.levels;
    const dx = object.position.x - eye.x;
    const dy = object.position.y - eye.y;
    const dz = object.position.z - eye.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const span = Math.max(size || 0, 0.5);
    const current = object.userData.lodLevel || 0;
    let level = 0;
    for (let i = 0; i < this.LOD_DISTANCES.length && i + 1 < levels.length; i++) {
        // Going further out switches at the threshold; coming back needs
        // to be clearly inside it.
        const threshold = this.LOD_DISTANCES[i] * span * (current > i ? this.LOD_HYSTERESIS : 1);
        if (distance > threshold) level = i + 1;
    }
    // …and never finer than the pixels it covers can show. The distance
    // rule asks "is it far away"; this asks "is this detail visible at all",
    // which is the question that actually bounds the cost.
    // The caller's own view when it has one (the editor), the viewport's
    // otherwise (the game).
    const factor = screen && screen.factor > 0 ? screen.factor : this._lodScreenFactor();
    const screenPixels = screen && screen.pixels > 0 ? screen.pixels : this._lodScreenPixels();
    if (factor > 0 && distance > 0.0001) {
        const radius = (span * 0.5) / distance * factor;
        // Clamped to the screen, because the projection of a sphere grows
        // without bound as the camera approaches it and nothing can cover
        // more than every pixel there is. Unclamped, standing beside the
        // Demo's tower asked for 1.9M triangles again — the budget said a
        // model covering "several screens" could afford anything.
        const pixels = Math.min(Math.PI * radius * radius, screenPixels);
        let budgetLevel = levels.length - 1;
        for (let i = 0; i < levels.length; i++) {
            // Refining below the level already in use has to clear a
            // margin; holding or coarsening uses the plain budget. Both
            // directions must be measured against the SAME current level or
            // the rule oscillates: giving the finer level extra allowance
            // only while it is not selected means it fits, gets chosen,
            // stops fitting, and is dropped again — which is exactly what
            // happened, 123 swaps in 40 frames on a still camera. Every
            // swap bumps `_lodSwaps`, that invalidates the static shadow
            // hash, and the whole prop set re-rendered into both cube maps
            // every frame for a scene where nothing was moving.
            const margin = i < current ? 1 / this.LOD_BUDGET_HYSTERESIS : 1;
            if (this._levelTriangles(entry, i) <= pixels * this.LOD_TRIANGLES_PER_PIXEL * margin) {
                budgetLevel = i;
                break;
            }
        }
        if (budgetLevel > level) level = budgetLevel;
    }
    if (level === current && object.userData.lodApplied) return;
    if (!object.userData.lodKey) object.userData.lodKey = key;
    if (level !== current) this._lodSwaps++;
    object.userData.lodLevel = level;
    object.userData.lodApplied = true;
    const geometries = levels[level];
    object.traverse(child => {
        if (!child.isMesh) return;
        const index = child.userData.lodIndex;
        if (index === undefined) return;
        const geometry = geometries[index];
        if (geometry && child.geometry !== geometry) child.geometry = geometry;
    });
};

/** The size, in tiles, a placed instance stands at: its largest span times its scale. */
Reactor3D.instanceSpan = function(object) {
    const extent = object && object.userData.glbSize;
    if (!extent) return 2;
    return Math.max(extent.x, extent.y, extent.z, 0.0001) * Math.max(object.scale.x, object.scale.y, object.scale.z);
};

/**
 * A GLB with embedded animations keeps its node hierarchy live instead of
 * being baked flat: joints stay real objects, skinned meshes become GPU
 * SkinnedMesh bound to a Skeleton, and every clip is parsed into a
 * THREE.AnimationClip playable by name through a model.json "clip" rule.
 */
Reactor3D.buildAnimatedGlbTemplate = function(json, bin, root, nodes, textures) {
    // Track names bind by node name, so names must be unique and safe for
    // three's property-path parser.
    const used = new Set();
    for (let i = 0; i < nodes.length; i++) {
        let name = (nodes[i].name || "node").replace(/[^A-Za-z0-9_]/g, "_");
        let unique = name;
        let n = 1;
        while (used.has(unique)) unique = name + "_" + n++;
        used.add(unique);
        nodes[i].name = unique;
    }
    const skeletons = new Map();
    const skeletonFor = skin => {
        if (skeletons.has(skin)) return skeletons.get(skin);
        const bones = (skin.joints || []).map(j => nodes[j]).filter(Boolean);
        const raw = skin.inverseBindMatrices != null
            ? this._glbAccessor(json, bin, skin.inverseBindMatrices) : null;
        const inverses = bones.map((bone, j) =>
            raw && raw.length >= (j + 1) * 16
                ? new THREE.Matrix4().fromArray(raw, j * 16)
                : new THREE.Matrix4());
        const skeleton = new THREE.Skeleton(bones, inverses);
        skeletons.set(skin, skeleton);
        return skeleton;
    };
    for (const node of nodes) {
        const skin = node.userData.skin;
        if (!skin) continue;
        const skeleton = skeletonFor(skin);
        for (const child of node.children.slice()) {
            if (!child.isMesh || !child.geometry.userData.joints) continue;
            const geometry = child.geometry;
            if (!geometry.getAttribute("skinIndex")) {
                const joints = geometry.userData.joints;
                const weights = geometry.userData.weights;
                let normalized = weights;
                if (!(weights instanceof Float32Array)) {
                    const scale = weights instanceof Uint8Array ? 255 : 65535;
                    normalized = new Float32Array(weights.length);
                    for (let i = 0; i < weights.length; i++) normalized[i] = weights[i] / scale;
                }
                geometry.setAttribute("skinIndex", new THREE.BufferAttribute(Uint16Array.from(joints), 4));
                geometry.setAttribute("skinWeight", new THREE.BufferAttribute(normalized, 4));
            }
            const skinned = new THREE.SkinnedMesh(geometry, child.material);
            skinned.name = child.name;
            // Skinned bounds follow bones the culler cannot see.
            skinned.frustumCulled = false;
            node.remove(child);
            node.add(skinned);
            skinned.updateMatrixWorld(true);
            // Identity bind: three applies boneWorld · IBM · bindMatrix to
            // each vertex, and glTF's inverse binds already map mesh space
            // to joint space — any extra bindMatrix mixes the mesh node's
            // transform (an Armature's 0.01 cm-scale, typically) into the
            // skinning. At rest that error hides as a uniform shrink the
            // camera framing absorbs; the first animated frame shreds the
            // mesh.
            skinned.bind(skeleton, new THREE.Matrix4());
        }
    }
    root.updateMatrixWorld(true);
    // Recentre through a wrapper group: offsetting a SkinnedMesh itself
    // would not move it — its vertices follow the bones.
    const content = new THREE.Group();
    content.name = "content";
    for (const child of root.children.slice()) content.add(child);
    root.add(content);
    // Rest-pose bounds are measured by actually skinning a sample of
    // vertices on the CPU — the only size that matches what renders.
    // Guessing from bone positions undersized a Source-style rig whose
    // armature scale hides inside the inverse binds (the model normalised
    // down to a speck), and raw geometry boxes miss the rest pose's
    // Z-up-to-Y-up turn.
    const box = this.measureSkinnedBox(root);
    if (box.isEmpty()) box.setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    content.position.set(-center.x, -box.min.y, -center.z);
    root.updateMatrixWorld(true);
    root.userData.glbSize = { x: size.x, y: size.y, z: size.z };
    root.userData.glbTextures = textures;
    root.userData.animated = true;
    root.__reactorClips = this.readGlbClips(json, bin, nodes);
    return root;
};

/**
 * The box a rig's meshes occupy right now, in the root's frame: skinned
 * vertices are actually skinned on the CPU (a sample of them), since a
 * skinned geometry's own box is the unposed mesh, wherever the bones are.
 */
/**
 * What a held model is shaped like, in its own frame: the long axis (a
 * blade, a barrel) signed toward the thin end (the tip, the muzzle), the
 * side its bulk hangs off that axis (a grip, a magazine: "down"), and the
 * handle end. A hand lays the long axis along the forearm, tip forward,
 * bulk down, handle end in the fist, so no per-weapon turns are needed.
 */
Reactor3D.heldShape = function(object) {
    if (!object) return null;
    if (object.userData.__heldShape) return object.userData.__heldShape;
    object.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(object.matrixWorld).invert(), points = [];
    const v = new THREE.Vector3();
    object.traverse(mesh => {
        if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
        const position = mesh.geometry.attributes.position, m = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
        const stride = Math.max(1, Math.floor(position.count / 4000));
        for (let i = 0; i < position.count; i += stride) { v.fromBufferAttribute(position, i).applyMatrix4(m); points.push([v.x, v.y, v.z]); }
    });
    if (points.length < 8) return null;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of points) for (let a = 0; a < 3; a++) { if (p[a] < min[a]) min[a] = p[a]; if (p[a] > max[a]) max[a] = p[a]; }
    const size = [0, 1, 2].map(a => max[a] - min[a]), axis = size.indexOf(Math.max(...size)), centre = [0, 1, 2].map(a => (min[a] + max[a]) / 2);
    const others = [0, 1, 2].filter(a => a !== axis), length = size[axis] || 1;
    // The handle end is the end nearer the widest cross-section: a sword's
    // guard, a rifle's receiver and stock, a pistol's grip and slide all sit
    // toward the hand; a broad blade tip can still be wider than a pommel,
    // so the thin end alone would be fooled.
    const N = 20, slices = new Array(N).fill(0), sliceOf = p => Math.min(N - 1, Math.floor((p[axis] - min[axis]) / length * N));
    for (const p of points) { const t = sliceOf(p); const r = Math.hypot(p[others[0]] - centre[others[0]], p[others[1]] - centre[others[1]]); if (r > slices[t]) slices[t] = r; }
    let widest = 0; for (let i = 1; i < N; i++) if (slices[i] > slices[widest]) widest = i;
    const tipAtMax = widest < N / 2, sign = tipAtMax ? 1 : -1;
    // Where the bulk hangs: the mean offset across the line that runs through
    // the tip's own cross-section (the muzzle, the blade), not the box centre.
    const tipSlice = tipAtMax ? N - 1 : 0, line = [0, 0, 0]; let onTip = 0;
    for (const p of points) { if (sliceOf(p) !== tipSlice) continue; onTip++; for (const a of others) line[a] += p[a]; }
    for (const a of others) line[a] = onTip ? line[a] / onTip : centre[a];
    const mean = [0, 0, 0]; for (const p of points) for (const a of others) mean[a] += p[a] - line[a];
    for (const a of others) mean[a] /= points.length;
    const hang = Math.hypot(mean[others[0]], mean[others[1]]);
    const down = [0, 0, 0];
    if (hang > length * .005) { for (const a of others) down[a] = mean[a] / hang; }
    else { const second = others[0], third = others[1]; down[size[second] >= size[third] ? second : third] = -1; }
    const unit = [0, 0, 0]; unit[axis] = sign;
    const base = centre.slice(); base[axis] = tipAtMax ? min[axis] : max[axis];
    // The grip: the narrowest slice between the handle end and the widest
    // one (a sword's grip behind its guard, a rifle's neck behind the
    // receiver), as a fraction of the length from the handle end; a thing
    // with nothing narrower there is held a fifth of the way along.
    const order = []; for (let k = 0; k < N; k++) order.push(tipAtMax ? k : N - 1 - k);
    // The handle is the narrow run between the end slice (a pommel, a
    // buttplate) and the widest slice; the fist closes on its middle, so a
    // long two-hand grip shows as much handle below the hand as above it.
    let grip = .2, best = Infinity;
    for (let k = 1; k < N; k++) { const i = order[k]; if (i === widest) break; if (slices[i] > 0 && slices[i] < best) best = slices[i]; }
    if (best < Infinity) { let sum = 0, count = 0; for (let k = 1; k < N; k++) { const i = order[k]; if (i === widest) break; if (slices[i] > 0 && slices[i] <= best * 1.4) { sum += k; count++; } } if (count) grip = (sum / count + .5) / N; }
    const shape = { axis: unit, up: down.map(n => -n), down, length, base, centre, grip, slices: slices.map(n => Math.round(n * 1000) / 1000), size, widest };
    object.userData.__heldShape = shape;
    return shape;
};

Reactor3D.measureSkinnedBox = function(root) {
    const box = new THREE.Box3();
    const temp = new THREE.Vector3();
    root.updateMatrixWorld(true);
    root.traverse(child => {
        if (!child.isMesh) return;
        if (!child.isSkinnedMesh) {
            box.expandByObject(child);
            return;
        }
        child.skeleton.update();
        const pos = child.geometry.getAttribute("position");
        const step = Math.max(1, Math.floor(pos.count / 2000));
        for (let i = 0; i < pos.count; i += step) {
            temp.fromBufferAttribute(pos, i);
            if (child.applyBoneTransform) child.applyBoneTransform(i, temp);
            box.expandByPoint(temp.applyMatrix4(child.matrixWorld));
        }
    });
    return box;
};

/**
 * Stand an animated template on the pose it actually shows.
 *
 * The loader grounds a rig on its rest pose, but what plays is a clip, and
 * a clip can hold the whole body above (or below) where the rest pose put
 * the feet — the Demo's mascot idled a sixth of a tile in the air. The
 * clip the rules play at rest (the idle rule's, else an always rule's,
 * else the first) is sampled across its length and the lowest point it
 * reaches becomes the ground. Once per template; instances inherit it.
 */
Reactor3D.groundAnimatedTemplate = function(template, sidecar) {
    if (!template || !template.userData || !template.userData.animated || typeof THREE === "undefined") return template;
    if (template.userData.reactorClipGrounded) return template;
    template.userData.reactorClipGrounded = true;
    const clips = template.__reactorClips || [];
    if (!clips.length || !THREE.AnimationMixer) return template;
    const content = template.children.find(child => child.name === "content");
    if (!content) return template;
    const rules = sidecar ? this.readModelAnimationRules(sidecar) : [];
    const byTrigger = trigger => rules.find(rule => rule.type === "clip" && rule.trigger === trigger && rule.clip);
    const named = (byTrigger("idle") || byTrigger("always") || {}).clip;
    const clip = clips.find(entry => entry.name === named) || clips[0];
    if (!clip || !(clip.duration > 0)) return template;
    // Remember every node's rest transform: the mixer writes straight into
    // the bones, and the template must be handed back exactly as it was.
    const rest = [];
    template.traverse(node => {
        rest.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(),
            morphs: node.morphTargetInfluences ? node.morphTargetInfluences.slice() : null });
    });
    let lowest = Infinity;
    try {
        const mixer = new THREE.AnimationMixer(template);
        const action = mixer.clipAction(clip);
        action.play();
        const samples = 12;
        for (let i = 0; i < samples; i++) {
            mixer.setTime(clip.duration * i / samples);
            const box = this.measureSkinnedBox(template);
            if (!box.isEmpty() && box.min.y < lowest) lowest = box.min.y;
        }
        action.stop();
        mixer.uncacheRoot(template);
    } catch (error) {
        lowest = Infinity;
    }
    for (const entry of rest) {
        entry.node.position.copy(entry.position);
        entry.node.quaternion.copy(entry.quaternion);
        entry.node.scale.copy(entry.scale);
        if (entry.morphs) for (let i = 0; i < entry.morphs.length; i++) entry.node.morphTargetInfluences[i] = entry.morphs[i];
    }
    template.updateMatrixWorld(true);
    if (Number.isFinite(lowest) && Math.abs(lowest) > 1e-4) {
        content.position.y -= lowest;
        template.updateMatrixWorld(true);
        template.userData.reactorClipGround = lowest;
    }
    return template;
};

/** Parse glTF animation channels into THREE.AnimationClips. */
Reactor3D.readGlbClips = function(json, bin, nodes) {
    const clips = [];
    (json.animations || []).forEach((anim, index) => {
        const tracks = [];
        for (const channel of anim.channels || []) {
            const sampler = (anim.samplers || [])[channel.sampler];
            if (!sampler || !channel.target || channel.target.node == null) continue;
            const node = nodes[channel.target.node];
            const path = channel.target.path;
            if (!node || (path !== "translation" && path !== "rotation" && path !== "scale")) continue;
            const times = this._glbAccessor(json, bin, sampler.input);
            let values = this._glbAccessor(json, bin, sampler.output);
            if (!times || !values || !times.length) continue;
            const itemSize = path === "rotation" ? 4 : 3;
            if (sampler.interpolation === "CUBICSPLINE") {
                // Values come as [in-tangent, value, out-tangent] triplets;
                // keep the value and play it linearly.
                const picked = new Float32Array(times.length * itemSize);
                for (let k = 0; k < times.length; k++) {
                    for (let c = 0; c < itemSize; c++) {
                        picked[k * itemSize + c] = values[(k * 3 + 1) * itemSize + c];
                    }
                }
                values = picked;
            }
            const interpolation = sampler.interpolation === "STEP"
                ? THREE.InterpolateDiscrete : THREE.InterpolateLinear;
            const Track = path === "rotation" ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
            const target = path === "rotation" ? ".quaternion" : path === "scale" ? ".scale" : ".position";
            try {
                tracks.push(new Track(node.name + target, Array.from(times), Array.from(values), interpolation));
            } catch (error) {
                // A malformed channel loses its track, not the whole clip.
            }
        }
        if (tracks.length) clips.push(new THREE.AnimationClip(anim.name || "clip-" + index, -1, tracks));
    });
    return clips;
};

/**
 * Clone a template for an instance. A flattened template clones plainly;
 * an animated one must rebind each SkinnedMesh to ITS OWN cloned bones —
 * a plain clone leaves the copy following the template's skeleton, which
 * lives outside every scene and never moves.
 */
Reactor3D.cloneModelTemplate = function(template) {
    // Object3D.copy duplicates userData through JSON, and the root's
    // glbTextures are THREE.Texture objects whose toJSON serialises every
    // image to a data URL: hundreds of milliseconds per clone, on the main
    // thread, as each character or battler appeared. Textures are shared
    // between instances by design, so they step out of the copy and come
    // back by reference.
    const textures = template.userData.glbTextures;
    if (textures) delete template.userData.glbTextures;
    let clone;
    try {
        clone = template.clone(true);
    } finally {
        if (textures) template.userData.glbTextures = textures;
    }
    if (textures) clone.userData.glbTextures = textures;
    clone.__reactorClips = template.__reactorClips;
    this.presetSkinnedBounds(clone);
    // Materials are per instance (textures stay shared) so a model flash
    // tints one tank, not every clone of it. Material.clone drops custom
    // properties, so the model marker is carried by hand.
    const instanceMaterial = mat => {
        const cloned = mat.clone();
        cloned.__reactorModel = mat.__reactorModel;
        // Nor the light injection, which lives in onBeforeCompile and the
        // program cache key — neither of which clone copies.
        if (mat.__reactorLit) Reactor3D.litMaterial(cloned);
        // Material.clone copies userData through JSON, which degrades a
        // stored base colour to its hex number; rebuild it as a Colour or
        // every later read of .r comes back undefined.
        if (cloned.userData && cloned.userData.baseColor != null
            && !cloned.userData.baseColor.isColor) {
            cloned.userData.baseColor = new THREE.Color(cloned.userData.baseColor);
        }
        return cloned;
    };
    clone.traverse(child => {
        if (!child.isMesh || !child.material) return;
        child.material = Array.isArray(child.material)
            ? child.material.map(instanceMaterial)
            : instanceMaterial(child.material);
    });
    if (!template.userData.animated) return clone;
    const twins = new Map();
    const walk = (source, copy) => {
        twins.set(source, copy);
        for (let i = 0; i < source.children.length; i++) walk(source.children[i], copy.children[i]);
    };
    walk(template, clone);
    const pairs = [];
    template.traverse(node => {
        if (node.isSkinnedMesh) pairs.push(node);
    });
    for (const source of pairs) {
        const copy = twins.get(source);
        const bones = source.skeleton.bones.map(bone => twins.get(bone) || bone);
        copy.bind(
            new THREE.Skeleton(bones, source.skeleton.boneInverses.map(m => m.clone())),
            source.bindMatrix.clone());
    }
    return clone;
};

/**
 * Give every skinned mesh under `object` its bounds up front. three's
 * renderer wants a skinned mesh's bounding sphere before its first draw
 * (for depth sorting, culling or not), and SkinnedMesh.computeBoundingSphere
 * runs every vertex through its bones on the CPU: a third of a second for
 * a 600k-vertex character, once per instance, exactly as it steps into
 * view or a battle opens. The rest geometry's sphere is a plain vertex
 * pass, computed once per template because the geometry is shared, and it
 * sorts a character just as well. It does NOT cull one — see below.
 */

Reactor3D.presetSkinnedBounds = function(object) {
    object.traverse(child => {
        if (!child.isSkinnedMesh || !child.geometry) return;
        const geometry = child.geometry;
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        if (geometry.boundingSphere) child.boundingSphere = geometry.boundingSphere.clone();
        // Culling stays OFF, and the sphere above is for depth sorting only.
        //
        // It was switched on for a while, against that sphere grown by a
        // margin, and characters vanished on screen — reported as "the main
        // actors disappear when they should still be in the camera's view".
        // The reason it cannot work this way: the sphere describes the REST
        // pose in the geometry's own space, and a glTF skin puts its
        // vertices wherever the bones say — through inverse binds, an
        // armature scale, and the identity bind this loader uses (see
        // `applyRestSkins`). `Frustum.intersectsObject` transforms that
        // sphere by the mesh's `matrixWorld`, which for a skinned mesh is
        // the node's transform and not where the skin actually ends up, so
        // the test is being made against the wrong place entirely. No
        // margin fixes a sphere in the wrong space; it only makes the bug
        // rarer and stranger.
        //
        // A correct cull needs a sphere built in WORLD space from what the
        // instance is actually doing — its placed position and
        // `instanceSpan` — checked in `syncCharacterModels` where both are
        // known, not handed to three per mesh. Worth doing: it measured
        // 137 -> 90 draw calls and 2.53M -> 2.22M triangles. Worth doing
        // correctly, though, because the failure is a character that is not
        // there.
        child.frustumCulled = false;
    });
    return object;
};

Reactor3D.applyRestSkins = function(json, bin, root, nodes) {
    root.traverse(object => {
        const skin = object.userData.skin;
        if (!skin || !skin.joints) return;
        const ibm = this._glbAccessor(json, bin, skin.inverseBindMatrices);
        if (!ibm || ibm.length < skin.joints.length * 16) return;
        const binds = [];
        for (let j = 0; j < skin.joints.length; j++) {
            const bone = nodes[skin.joints[j]];
            const world = bone ? bone.matrixWorld : new THREE.Matrix4();
            const inv = new THREE.Matrix4().fromArray(ibm, j * 16);
            binds.push(new THREE.Matrix4().multiplyMatrices(world, inv));
        }
        object.traverse(child => {
            if (!child.isMesh || !child.geometry || !child.geometry.userData.joints) return;
            this.skinGeometryAtRest(child.geometry, binds);
            child.userData.skinned = true;
        });
    });
};

Reactor3D.skinGeometryAtRest = function(geometry, binds) {
    const pos = geometry.getAttribute("position");
    const nor = geometry.getAttribute("normal");
    const joints = geometry.userData.joints;
    const weights = geometry.userData.weights;
    if (!pos || !joints || !weights) return;
    const mixed = new THREE.Matrix4();
    const vertex = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const normalMat = new THREE.Matrix3();
    for (let i = 0; i < pos.count; i++) {
        for (let e = 0; e < 16; e++) mixed.elements[e] = 0;
        for (let k = 0; k < 4; k++) {
            const weight = weights[i * 4 + k];
            if (!weight) continue;
            const bind = binds[joints[i * 4 + k]];
            if (!bind) continue;
            const els = bind.elements;
            for (let e = 0; e < 16; e++) mixed.elements[e] += els[e] * weight;
        }
        vertex.fromBufferAttribute(pos, i).applyMatrix4(mixed);
        pos.setXYZ(i, vertex.x, vertex.y, vertex.z);
        if (nor) {
            normalMat.getNormalMatrix(mixed);
            normal.fromBufferAttribute(nor, i).applyMatrix3(normalMat).normalize();
            nor.setXYZ(i, normal.x, normal.y, normal.z);
        }
    }
    pos.needsUpdate = true;
    if (nor) nor.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
};

Reactor3D.flattenModelWorld = function(root) {
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverse(child => {
        if (child.isMesh) meshes.push(child);
    });
    for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        mesh.geometry = mesh.geometry.clone();
        if (!mesh.userData.skinned) mesh.geometry.applyMatrix4(mesh.matrixWorld);
        if (mesh.parent) mesh.parent.remove(mesh);
        mesh.position.set(0, 0, 0);
        mesh.quaternion.identity();
        mesh.scale.set(1, 1, 1);
        root.add(mesh);
    }
    const leftover = root.children.slice();
    for (let i = 0; i < leftover.length; i++) {
        if (!leftover[i].isMesh) root.remove(leftover[i]);
    }
};

/**
 * Procedural model animation. A model folder may carry `model.json`:
 *   { "animations": [ { name, part, type, axis, trigger, ... }, ... ],
 *     "parts": [ { name, pivot, meshes }, ... ] }
 * type: "spin" (speed deg/sec, or perTile deg per tile travelled),
 *       "swing" (degrees amplitude, period frames, cycles for actions),
 *       "bob" (amount in tiles, period frames),
 *       "pose" (rotate [x,y,z] degrees and move [x,y,z] tiles: ease to
 *       that end pose while the trigger holds and back to rest when it
 *       releases; an action pose plays in and out over its period).
 * trigger: "always", "idle", "moving", or "action" — actions play on
 * demand by name (the Play Model Animation event command).
 * part: prefix of a named part recorded by the readers ("" = whole model);
 * rules turn parts about their own recorded pivots. "parts" entries carve
 * regions the source file never named into parts of their own — see
 * readModelParts/carveModelParts below.
 */
Reactor3D.readModelAnimationRules = function(json) {
    const list = json && Array.isArray(json.animations) ? json.animations : [];
    const rules = [];
    const vec3 = (value, fallback) => {
        const raw = Array.isArray(value) ? value : [];
        return [0, 1, 2].map(i => Number.isFinite(Number(raw[i])) ? Number(raw[i]) : (fallback || 0));
    };
    // Timed effects along an on-demand play: at a fraction of the
    // animation, play an SE, request a database animation (2D or
    // Effekseer alike — the stock pipeline shows it on the event), or
    // flash the screen or the model itself.
    const readEffects = value => {
        if (!Array.isArray(value)) return [];
        const effects = [];
        for (const raw of value) {
            if (!raw || typeof raw !== "object") continue;
            const at = Math.min(1, Math.max(0, Number(raw.at) || 0));
            if (raw.effect) {
                // A named effect from the model's own effects list, resolved
                // when it fires so an edit to the effect reaches every rule.
                effects.push({ at, effect: String(raw.effect) });
            } else if (raw.se && raw.se.name) {
                effects.push({ at, se: {
                    name: String(raw.se.name),
                    volume: Number.isFinite(Number(raw.se.volume)) ? Number(raw.se.volume) : 90,
                    pitch: Number.isFinite(Number(raw.se.pitch)) ? Number(raw.se.pitch) : 100,
                    pan: Number.isFinite(Number(raw.se.pan)) ? Number(raw.se.pan) : 0
                } });
            } else if (Number(raw.animation) > 0) {
                effects.push({ at, animation: Math.floor(Number(raw.animation)) });
            } else if (raw.flash) {
                const color = Array.isArray(raw.flash.color) ? raw.flash.color : [];
                effects.push({ at, flash: {
                    target: raw.flash.target === "model" ? "model" : "screen",
                    color: [0, 1, 2, 3].map(i => {
                        const channel = Number(color[i]);
                        return Number.isFinite(channel)
                            ? Math.min(255, Math.max(0, Math.floor(channel)))
                            : (i === 3 ? 180 : 255);
                    }),
                    duration: Number(raw.flash.duration) > 0 ? Math.floor(Number(raw.flash.duration)) : 20
                } });
            }
        }
        return effects;
    };
    // A pose may carry a keyframe timeline: sorted stops the action (or a
    // looping ambient trigger) interpolates through, starting from rest
    // and returning to rest unless the last key sits at 1. Keys make the
    // scalar in-out blend (and hold) irrelevant for that rule.
    const readKeys = value => {
        if (!Array.isArray(value)) return [];
        const keys = [];
        for (const raw of value) {
            if (!raw || typeof raw !== "object") continue;
            keys.push({
                at: Math.min(1, Math.max(0, Number(raw.at) || 0)),
                rotate: vec3(raw.rotate),
                move: vec3(raw.move),
                resize: vec3(raw.resize, 1)
            });
        }
        keys.sort((a, b) => a.at - b.at);
        return keys;
    };
    for (let i = 0; i < list.length; i++) {
        const raw = list[i] || {};
        const type = raw.type === "swing" || raw.type === "bob" || raw.type === "clip"
            || raw.type === "pose" ? raw.type : "spin";
        const keys = readKeys(raw.keys);
        rules.push({
            name: String(raw.name || raw.part || type + "-" + i),
            part: String(raw.part || ""),
            clip: String(raw.clip || ""),
            // Playback-rate multiplier for embedded clips (1 = authored speed).
            rate: Number(raw.rate) > 0 ? Number(raw.rate) : 1,
            type,
            axis: raw.axis === "x" || raw.axis === "z" ? raw.axis : "y",
            trigger: ["idle", "moving", "walking", "dashing", "action"].indexOf(raw.trigger) >= 0
                ? raw.trigger : "always",
            speed: Number(raw.speed) > 0 ? Number(raw.speed) : 90,
            perTile: Number(raw.perTile) > 0 ? Number(raw.perTile) : 0,
            degrees: Number(raw.degrees) > 0 ? Number(raw.degrees) : 15,
            amount: Number(raw.amount) > 0 ? Number(raw.amount) : 0.1,
            period: Number(raw.period) > 0 ? Number(raw.period) : 60,
            cycles: Number(raw.cycles) > 0 ? Number(raw.cycles) : 1,
            // Phase offsets a swing or bob within its period — the whole
            // of a walk cycle is swings sharing a period at 0/0.5 phases.
            phase: Math.min(1, Math.max(0, Number(raw.phase) || 0)),
            rotate: vec3(raw.rotate),
            move: vec3(raw.move),
            resize: vec3(raw.resize, 1),
            // A keyed timeline owns its whole shape; hold belongs to the
            // scalar blend and would desync the action duration.
            hold: keys.length ? false : !!raw.hold,
            // A keyed pose that stays at its last key once played, for as
            // long as its action is the current one: a stance taken and
            // kept, rather than a movement that returns to rest.
            stay: !!(keys.length && raw.stay),
            // An on-demand animation that starts over when it ends, until
            // another is played or an empty name stops it.
            repeat: !!raw.repeat,
            keys,
            effects: readEffects(raw.effects)
        });
    }
    return rules;
};

/**
 * Carved parts: a model.json "parts" list names regions of the model's
 * geometry, selected in the Database 3D section by dragging a box over
 * the mesh. Each entry is
 *   { name, pivot: [x,y,z], meshes: { "<meshIndex>": [[tri,count], ...] } }
 * with triangle runs against the source geometry's triangle order and the
 * pivot in model space. carveModelParts splits those triangles into
 * meshes of their own, registered exactly like reader-named parts, so
 * every animation rule can hinge a jaw or wave a branch the source file
 * shipped as one anonymous mesh.
 */
Reactor3D.readModelParts = function(json) {
    const list = json && Array.isArray(json.parts) ? json.parts : [];
    const parts = [];
    for (const raw of list) {
        if (!raw || !raw.name || !raw.meshes) continue;
        const pivotRaw = Array.isArray(raw.pivot) ? raw.pivot : [];
        const pivot = [0, 1, 2].map(i =>
            Number.isFinite(Number(pivotRaw[i])) ? Number(pivotRaw[i]) : 0);
        const meshes = {};
        let any = false;
        for (const key of Object.keys(raw.meshes)) {
            const index = Number(key);
            if (!Number.isInteger(index) || index < 0) continue;
            const ranges = [];
            for (const pair of Array.isArray(raw.meshes[key]) ? raw.meshes[key] : []) {
                const start = Array.isArray(pair) ? Math.floor(Number(pair[0])) : NaN;
                const count = Array.isArray(pair) ? Math.floor(Number(pair[1])) : NaN;
                if (!(start >= 0) || !(count > 0)) continue;
                ranges.push([start, count]);
                any = true;
            }
            if (ranges.length) meshes[index] = ranges;
        }
        if (any) parts.push({ name: String(raw.name), pivot, meshes });
    }
    return parts;
};

/**
 * Pivot overrides: model.json may carry `pivots: { "<partName>": [x,y,z] }`
 * in model space, moving the point a part hinges about — a turret turns
 * from its ring, not the centre the exporter happened to record. Keys
 * match part names exactly; carved and reader-named parts alike.
 */
Reactor3D.readModelPivots = function(json) {
    const raw = json && json.pivots && typeof json.pivots === "object"
        && !Array.isArray(json.pivots) ? json.pivots : {};
    const pivots = {};
    for (const name of Object.keys(raw)) {
        const value = Array.isArray(raw[name]) ? raw[name] : [];
        const pivot = [0, 1, 2].map(i => Number(value[i]));
        if (name && pivot.every(Number.isFinite)) pivots[name] = pivot;
    }
    return pivots;
};

/**
 * Rewrite the recorded pivots of every part an override names, converting
 * the model-space point into each mesh's local space. Runs on a clone,
 * after carving, before the binding is prepared.
 */
Reactor3D.applyPivotOverrides = function(root, pivots) {
    if (typeof THREE === "undefined" || !root || !pivots) return;
    if (!Object.keys(pivots).length) return;
    for (const mesh of this.carveTargetMeshes(root)) {
        const parts = mesh.userData.parts;
        if (!parts || !parts.length) continue;
        let inverse = null;
        for (const part of parts) {
            const pivot = pivots[part.name];
            if (!pivot) continue;
            if (!inverse) {
                const relative = new THREE.Matrix4();
                for (let node = mesh; node && node !== root; node = node.parent) {
                    node.updateMatrix();
                    relative.premultiply(node.matrix);
                }
                inverse = relative.invert();
            }
            const local = new THREE.Vector3(pivot[0], pivot[1], pivot[2]).applyMatrix4(inverse);
            part.pivot = [local.x, local.y, local.z];
        }
    }
};

/** Sorted triangle ids -> compact [start,count] runs. Duplicates collapse. */
Reactor3D.compressTriRanges = function(ids) {
    const sorted = Array.from(ids).sort((a, b) => a - b);
    const ranges = [];
    for (const id of sorted) {
        const last = ranges[ranges.length - 1];
        if (last && id < last[0] + last[1]) continue;
        if (last && id === last[0] + last[1]) last[1]++;
        else ranges.push([id, 1]);
    }
    return ranges;
};

Reactor3D.expandTriRanges = function(ranges) {
    const ids = [];
    for (const [start, count] of ranges || []) {
        for (let t = start; t < start + count; t++) ids.push(t);
    }
    return ids;
};

/**
 * The meshes carve indices count over: every plain mesh in traversal
 * order. Skinned meshes follow bones, not carve rules, and are skipped —
 * as are the editor's selection-highlight overlays, which live as
 * children of the real meshes and must never shift this numbering.
 * The editor's selection and the runtime's carve share this enumeration.
 */
Reactor3D.carveTargetMeshes = function(root) {
    const meshes = [];
    root.traverse(child => {
        if (child.isMesh && !child.isSkinnedMesh && !child.userData.__reactorOverlay) {
            meshes.push(child);
        }
    });
    return meshes;
};

/**
 * Partition one mesh's triangles among carve definitions. Pure index
 * work: returns { remainder, groups: [{ defs, ids }] } where ids are
 * vertex indices ready for a BufferGeometry index. A triangle may belong
 * to several definitions — a cannon shaft selected inside a full turret —
 * so triangles are grouped by the exact set of definitions claiming them
 * and every group becomes one piece carrying ALL of its names: the
 * turret's rule carries the cannon, the cannon's rule moves only itself.
 * Out-of-range runs are clamped. At most 32 definitions per mesh.
 */
Reactor3D.partitionCarveIndex = function(triCount, defs, vertexAt) {
    const at = vertexAt || (n => n);
    const masks = new Uint32Array(triCount);
    defs.slice(0, 32).forEach((def, bit) => {
        for (const [start, count] of def.ranges) {
            const end = Math.min(start + count, triCount);
            for (let t = Math.max(0, start); t < end; t++) masks[t] |= (1 << bit);
        }
    });
    const byMask = new Map();
    const remainder = [];
    for (let t = 0; t < triCount; t++) {
        if (!masks[t]) {
            remainder.push(at(t * 3), at(t * 3 + 1), at(t * 3 + 2));
            continue;
        }
        let ids = byMask.get(masks[t]);
        if (!ids) byMask.set(masks[t], ids = []);
        ids.push(at(t * 3), at(t * 3 + 1), at(t * 3 + 2));
    }
    const groups = [];
    for (const [mask, ids] of byMask) {
        groups.push({ defs: defs.filter((def, bit) => mask & (1 << bit)), ids });
    }
    return { remainder, groups };
};

/**
 * Split a model instance's geometry along its carved part definitions.
 * Runs on a clone, never the template: the original meshes get a fresh
 * geometry holding the remaining triangles (attributes stay shared), and
 * each carved region becomes a sibling mesh carrying the part name and
 * its pivot in mesh-local space, plus the source mesh's named ancestry so
 * rules aimed at either still match.
 */
Reactor3D.carveModelParts = function(root, parts) {
    if (typeof THREE === "undefined" || !root || !parts || !parts.length) return;
    const meshes = this.carveTargetMeshes(root);
    // A part's overall triangle count orders nested names: the smaller
    // selection is the more specific one — the cannon before the turret
    // it sits inside — so a piece answers to its own pivot first.
    const sizeOf = new Map(parts.map(part => [part, Object.values(part.meshes)
        .reduce((sum, runs) => sum + runs.reduce((n, [, count]) => n + count, 0), 0)]));
    meshes.forEach((mesh, meshIndex) => {
        const defs = parts
            .map(part => ({ part, ranges: part.meshes[meshIndex] }))
            .filter(entry => entry.ranges && entry.ranges.length);
        if (!defs.length) return;
        const geometry = mesh.geometry;
        const position = geometry.getAttribute("position");
        if (!position) return;
        const source = geometry.getIndex();
        const indices = source ? source.array : null;
        const triCount = Math.floor((indices ? indices.length : position.count) / 3);
        const { remainder, groups } = this.partitionCarveIndex(
            triCount, defs, indices ? (n => indices[n]) : null);
        if (!groups.length) return;
        const subGeometry = ids => {
            const sub = new THREE.BufferGeometry();
            for (const name of Object.keys(geometry.attributes)) {
                sub.setAttribute(name, geometry.attributes[name]);
            }
            sub.setIndex(new THREE.BufferAttribute(Uint32Array.from(ids), 1));
            if (!geometry.getAttribute("normal")) sub.computeVertexNormals();
            return sub;
        };
        // The pivot is authored in model space; the mesh may sit offset
        // under the root (recentring), so convert through the chain.
        const relative = new THREE.Matrix4();
        for (let node = mesh; node && node !== root; node = node.parent) {
            node.updateMatrix();
            relative.premultiply(node.matrix);
        }
        const inverse = relative.clone().invert();
        const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        for (const { defs: members, ids } of groups) {
            const ordered = members.slice().sort((a, b) =>
                sizeOf.get(a.part) - sizeOf.get(b.part));
            const piece = new THREE.Mesh(subGeometry(ids), material);
            piece.name = ordered[0].part.name;
            piece.userData.parts = ordered.map(member => {
                const pivot = new THREE.Vector3(
                    member.part.pivot[0], member.part.pivot[1], member.part.pivot[2])
                    .applyMatrix4(inverse);
                return { name: member.part.name, pivot: [pivot.x, pivot.y, pivot.z] };
            }).concat(mesh.userData.parts || []);
            piece.position.copy(mesh.position);
            piece.quaternion.copy(mesh.quaternion);
            piece.scale.copy(mesh.scale);
            mesh.parent.add(piece);
        }
        mesh.geometry = subGeometry(remainder);
    });
};

/**
 * A rig authored in the editor: a bone skeleton fitted to a static model
 * plus per-vertex skin weights, stored in model.json as
 *   rig: { bones: [{ name, parent, head, tail }],
 *          weights: { "<meshIndex>": { count, indices, weights } } }
 * with positions in model space and weights base64 bytes (4 influences
 * per vertex, indices Uint8, weights Uint8 summing 255). Mesh indices
 * count over carveTargetMeshes' enumeration of the UNRIGGED model, which
 * is also why a model carries a rig OR carved parts, never both.
 */
Reactor3D.decodeRigBytes = function(text) {
    const clean = String(text || "").replace(/[^A-Za-z0-9+/]/g, "");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
    let o = 0;
    for (let i = 0; i + 1 < clean.length; i += 4) {
        const a = alphabet.indexOf(clean[i]);
        const b = alphabet.indexOf(clean[i + 1]);
        const c = i + 2 < clean.length ? alphabet.indexOf(clean[i + 2]) : -1;
        const d = i + 3 < clean.length ? alphabet.indexOf(clean[i + 3]) : -1;
        out[o++] = (a << 2) | (b >> 4);
        if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
        if (d >= 0) out[o++] = ((c & 3) << 6) | d;
    }
    return out;
};

Reactor3D.readModelRig = function(json) {
    const raw = json && json.rig;
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.bones) || !raw.bones.length) return null;
    const vec3 = value => {
        const list = Array.isArray(value) ? value : [];
        return [0, 1, 2].map(i => Number.isFinite(Number(list[i])) ? Number(list[i]) : 0);
    };
    const bones = [];
    for (const entry of raw.bones) {
        if (!entry || !entry.name) return null;
        const parent = Number.isInteger(entry.parent) && entry.parent >= 0
            && entry.parent < bones.length ? entry.parent : -1;
        bones.push({
            name: String(entry.name),
            parent,
            head: vec3(entry.head),
            tail: vec3(entry.tail)
        });
    }
    const markers = {};
    if (raw.markers && typeof raw.markers === "object") for (const key of Object.keys(raw.markers)) if (Array.isArray(raw.markers[key])) markers[key] = vec3(raw.markers[key]);
    const weights = {};
    // Weights arrive either decoded from the binary sidecar (weightsBin,
    // attached by loadModelSidecar or the editor) or as the legacy base64
    // blocks inside the JSON itself.
    const rawWeights = raw.weightsBin && typeof raw.weightsBin === "object"
        ? raw.weightsBin
        : (raw.weights && typeof raw.weights === "object" ? raw.weights : {});
    const binary = rawWeights === raw.weightsBin;
    for (const key of Object.keys(rawWeights)) {
        const meshIndex = Number(key);
        const entry = rawWeights[key];
        if (!Number.isInteger(meshIndex) || meshIndex < 0 || !entry) continue;
        const count = Math.floor(Number(entry.count) || 0);
        if (count <= 0) continue;
        const indices = binary ? entry.indices : this.decodeRigBytes(entry.indices);
        const values = binary ? entry.weights : this.decodeRigBytes(entry.weights);
        if (!indices || !values || indices.length < count * 4 || values.length < count * 4) continue;
        weights[meshIndex] = { count, indices, weights: values };
    }
    return {
        template: typeof raw.template === "string" ? raw.template : "humanoid",
        markers,
        bones,
        weights
    };
};

/**
 * Grow the skeleton inside a model instance and bind its weighted meshes
 * as GPU-skinned meshes. Runs on a clone, never the template — the same
 * contract as carveModelParts. Each bone registers as a part with pivot
 * [0,0,0]: a rule rotation composed into the bone's local transform IS
 * forward kinematics, and the scene graph carries parent motion to the
 * children, so the whole pose card drives bones with no new rule types.
 */
/**
 * How a rig template's bones are named in exported skeletons (Mixamo,
 * VRM, Blender's Rigify), as `normalizeBoneName` reads them.
 */
Reactor3D.RIG_BONE_ALIASES = {
    Hips: ["hips", "pelvis"],
    Spine: ["spine", "spine1", "spine01", "lowerspine"],
    Chest: ["chest", "spine2", "spine02", "spine3", "spine03", "upperchest", "upperspine"],
    Neck: ["neck", "neck1"],
    Head: ["head"],
    LeftUpperArm: ["leftarm", "leftupperarm", "upperarml", "lupperarm", "larm", "armupperl", "upperarmleft"],
    LeftLowerArm: ["leftforearm", "leftlowerarm", "forearml", "lowerarml", "lforearm", "llowerarm", "armlowerl", "lowerarmleft"],
    LeftHand: ["lefthand", "handl", "lhand", "handleft"],
    LeftUpperLeg: ["leftupleg", "leftupperleg", "leftthigh", "thighl", "upperlegl", "lthigh", "lupperleg", "upperlegleft"],
    LeftLowerLeg: ["leftleg", "leftlowerleg", "leftshin", "leftcalf", "calfl", "shinl", "lowerlegl", "llowerleg", "lowerlegleft"],
    LeftFoot: ["leftfoot", "footl", "lfoot", "footleft"],
    RightUpperArm: ["rightarm", "rightupperarm", "upperarmr", "rupperarm", "rarm", "armupperr", "upperarmright"],
    RightLowerArm: ["rightforearm", "rightlowerarm", "forearmr", "lowerarmr", "rforearm", "rlowerarm", "armlowerr", "lowerarmright"],
    RightHand: ["righthand", "handr", "rhand", "handright"],
    RightUpperLeg: ["rightupleg", "rightupperleg", "rightthigh", "thighr", "upperlegr", "rthigh", "rupperleg", "upperlegright"],
    RightLowerLeg: ["rightleg", "rightlowerleg", "rightshin", "rightcalf", "calfr", "shinr", "lowerlegr", "rlowerleg", "lowerlegright"],
    RightFoot: ["rightfoot", "footr", "rfoot", "footright"]
};

/** A bone name with its namespace, case and punctuation stripped: "mixamorig:RightArm" reads "rightarm". */
Reactor3D.normalizeBoneName = function(name) {
    return String(name || "").toLowerCase().replace(/^.*[:|]/, "").replace(/^mixamorig/, "").replace(/[^a-z0-9]/g, "");
};

/**
 * A model that already skins its meshes over the file's own skeleton
 * keeps that skeleton: each rig bone names the file's bone that stands
 * where its head was fitted (a matching name counts for half the
 * distance, so Mixamo's inverted Spine/Spine02 still lands by place), and
 * that bone registers as the part. The clips keep driving those bones;
 * a pose bends them from wherever the clip holds them. Returns false when
 * nothing under `root` is skinned, so the rig binds its own skeleton.
 */
Reactor3D.mapRigToSkeleton = function(root, rig) {
    const bones = [];
    const seen = new Set();
    root.traverse(child => {
        if (!child.isSkinnedMesh || !child.skeleton) return;
        for (const bone of child.skeleton.bones) {
            if (bone && !seen.has(bone)) { seen.add(bone); bones.push(bone); }
        }
    });
    if (!bones.length) return false;
    root.updateMatrixWorld(true);
    const places = bones.map(bone => root.worldToLocal(bone.getWorldPosition(new THREE.Vector3())));
    const names = bones.map(bone => this.normalizeBoneName(bone.name));
    const heads = rig.bones.map(def => new THREE.Vector3().fromArray(def.head));
    const reach = new THREE.Box3().setFromPoints(heads).getSize(new THREE.Vector3());
    const span = Math.max(reach.x, reach.y, reach.z, 0.001);
    const picks = rig.bones.map((def, index) => {
        const aliases = this.RIG_BONE_ALIASES[def.name] || [this.normalizeBoneName(def.name)];
        let bone = -1;
        let score = Infinity;
        bones.forEach((candidate, j) => {
            const distance = places[j].distanceTo(heads[index]) / span;
            const value = aliases.indexOf(names[j]) >= 0 ? distance * 0.5 : distance;
            if (value < score) { score = value; bone = j; }
        });
        return { index, bone, score };
    });
    // The surest matches claim their bones first; a rig bone whose bone is
    // already taken, or that stands nowhere near one, stays unmapped.
    picks.sort((a, b) => a.score - b.score);
    const taken = new Set();
    let mapped = 0;
    for (const pick of picks) {
        if (pick.bone < 0 || taken.has(pick.bone) || pick.score > 0.35) continue;
        taken.add(pick.bone);
        const bone = bones[pick.bone];
        const def = rig.bones[pick.index];
        bone.userData.parts = [{ name: def.name, pivot: [0, 0, 0] }];
        bone.userData.__reactorRigBone = true;
        bone.userData.__reactorClipBone = true;
        bone.userData.__reactorBoneTail = def.tail.slice();
        mapped++;
    }
    root.userData.rigged = true;
    root.userData.rigMapped = mapped;
    this.attachRigHands(root, rig, bones.filter(b => b.userData && b.userData.__reactorRigBone));
    return true;
};

/**
 * Where a hand's palm and fingertips are, as points in the hand joint's own
 * frame: from the rig's palm and fingertip markers when it has them, else a
 * third and two thirds of a forearm past the wrist. Held things sit at the
 * palm.
 */
Reactor3D.attachRigHands = function(root, rig, bones) {
    if (typeof THREE === "undefined" || !rig || !bones) return;
    root.updateMatrixWorld(true);
    const markers = rig.markers || {}, defs = rig.bones || [];
    for (const side of ["Left", "Right"]) {
        const hand = bones.find(b => b.userData?.parts?.[0]?.name === side + "Hand");
        if (!hand) continue;
        const short = side === "Left" ? "L" : "R";
        hand.updateMatrixWorld(true);
        const local = point => point ? hand.worldToLocal(root.localToWorld(new THREE.Vector3().fromArray(point))).toArray() : null;
        // Placed markers are points in the model's frame. Without them the
        // palm and fingertips come from the joints themselves, in the room
        // (a mapped file skeleton need not sit where the template's bones do).
        let palm = markers["palm" + short] ? local(markers["palm" + short]) : null, knuckles = null, fingers = null;
        // Each finger's base and tip, when the rig places them; the knuckle
        // line and fingertip point are their means.
        const points = {};
        const mean = list => list.length ? list.reduce((a, p) => [a[0] + p[0] / list.length, a[1] + p[1] / list.length, a[2] + p[2] / list.length], [0, 0, 0]) : null;
        for (const finger of ["thumb", "index", "middle", "ring", "pinky"]) {
            const base = markers[finger + "Base" + short], tip = markers[finger + "Tip" + short];
            if (base || tip) points[finger] = { base: local(base), tip: local(tip) };
        }
        const bases = Object.values(points).map(p => p.base).filter(Boolean), tips = Object.values(points).map(p => p.tip).filter(Boolean);
        if (bases.length) knuckles = mean(bases);
        if (tips.length) fingers = mean(tips);
        if (Object.keys(points).length) hand.userData.__reactorFingerPoints = points;
        if (!palm || !fingers || !knuckles) {
            const elbowNode = hand.parent && hand.parent.getWorldPosition ? hand.parent : null;
            if (elbowNode) {
                const wristWorld = hand.getWorldPosition(new THREE.Vector3()), elbowWorld = elbowNode.getWorldPosition(new THREE.Vector3());
                const along = t => hand.worldToLocal(elbowWorld.clone().lerp(wristWorld, t)).toArray();
                if (!palm) palm = along(1.33);
                if (!knuckles) knuckles = along(1.5);
                if (!fingers) fingers = along(1.66);
            }
        }
        if (palm) hand.userData.__reactorPalm = palm;
        if (knuckles) hand.userData.__reactorKnuckles = knuckles;
        if (fingers) hand.userData.__reactorFingers = fingers;
    }
};

/** A node that hinges like a bone: a THREE.Bone, or a file joint (often a plain Group) the rig names. */
Reactor3D.isRigJoint = function(node) {
    return !!node && (node.isBone || !!(node.userData && node.userData.__reactorClipBone));
};

Reactor3D.applyModelRig = function(root, rig) {
    if (typeof THREE === "undefined" || !root || !rig || !rig.bones.length) return;
    if (this.mapRigToSkeleton(root, rig)) return;
    const meshes = this.carveTargetMeshes(root);
    const bones = rig.bones.map(def => {
        const bone = new THREE.Bone();
        bone.name = def.name;
        bone.userData.parts = [{ name: def.name, pivot: [0, 0, 0] }];
        bone.userData.__reactorRigBone = true;
        bone.userData.__reactorBoneTail = def.tail.slice();
        return bone;
    });
    rig.bones.forEach((def, i) => {
        const parentHead = def.parent >= 0 ? rig.bones[def.parent].head : [0, 0, 0];
        bones[i].position.set(
            def.head[0] - parentHead[0],
            def.head[1] - parentHead[1],
            def.head[2] - parentHead[2]);
        if (def.parent >= 0) bones[def.parent].add(bones[i]);
    });
    const rootBones = bones.filter((bone, i) => rig.bones[i].parent < 0);
    // Bones join the same frame the carve authors pivots in: root's local
    // space. Weighted meshes may sit offset under recentring wrappers, so
    // each binds through its own world matrix — the skeleton and the mesh
    // agree on world space no matter how either is parented.
    for (const bone of rootBones) root.add(bone);
    root.updateMatrixWorld(true);
    this.attachRigHands(root, rig, bones);
    const skeleton = new THREE.Skeleton(bones);
    for (const key of Object.keys(rig.weights)) {
        const mesh = meshes[Number(key)];
        const data = rig.weights[key];
        if (!mesh || !mesh.geometry) continue;
        const geometry = mesh.geometry;
        const position = geometry.getAttribute("position");
        if (!position || position.count !== data.count) continue;
        const weightScale = 1 / 255;
        const skinWeights = new Float32Array(data.count * 4);
        for (let i = 0; i < data.count * 4; i++) skinWeights[i] = data.weights[i] * weightScale;
        geometry.setAttribute("skinIndex",
            new THREE.BufferAttribute(Uint16Array.from(data.indices), 4));
        geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeights, 4));
        const skinned = new THREE.SkinnedMesh(geometry, mesh.material);
        skinned.name = mesh.name;
        skinned.userData.parts = mesh.userData.parts;
        // Skinned bounds follow bones the culler cannot see.
        skinned.frustumCulled = false;
        skinned.position.copy(mesh.position);
        skinned.quaternion.copy(mesh.quaternion);
        skinned.scale.copy(mesh.scale);
        const parent = mesh.parent;
        parent.remove(mesh);
        parent.add(skinned);
        skinned.updateMatrixWorld(true);
        skinned.bind(skeleton, skinned.matrixWorld.clone());
    }
    root.userData.rigged = true;
    this.presetSkinnedBounds(root);
};

Reactor3D.modelAnimationUrl = function(name) {
    return "3d/" + name + "/model.json";
};

/**
 * The raw model.json, cached per model: animation rules and carved parts
 * both come from it. A missing sidecar is a normal state — when the disk
 * is reachable it is checked first so the absent file never logs a
 * network error the page cannot suppress.
 */
/**
 * Decode the model.rig.bin weight container — the runtime mirror of
 * ModelRigger.decodeWeightsBinary, parity-pinned by tests.
 */
Reactor3D.decodeRigWeightsBinary = function(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 12 || view.getUint32(0, true) !== 0x42575252) return null;
    if (view.getUint32(4, true) !== 1) return null;
    const meshCount = view.getUint32(8, true);
    const out = {};
    let at = 12;
    for (let i = 0; i < meshCount; i++) {
        if (at + 8 > view.byteLength) return null;
        const meshIndex = view.getUint32(at, true);
        const count = view.getUint32(at + 4, true);
        at += 8;
        const span = count * 4;
        if (at + span * 2 > view.byteLength) return null;
        out[String(meshIndex)] = {
            count,
            indices: new Uint8Array(buffer, at, span).slice(),
            weights: new Uint8Array(buffer, at + span, span).slice()
        };
        at += span * 2;
    }
    return out;
};

/**
 * Fetch the distance levels model.json lists for a loaded static template
 * and attach them. Absent list, absent files: nothing is asked for, nothing
 * is logged. Instances pick the levels up on their next frame.
 */
Reactor3D.loadLodLevels = function(template, key, name, baseUrl) {
    if (!template || !key || typeof XMLHttpRequest === "undefined") return;
    this.loadModelSidecar(name).then(sidecar => {
        const files = sidecar && Array.isArray(sidecar.lods) ? sidecar.lods : null;
        if (!files || !files.length || (this._lodCache && this._lodCache[key])) return;
        const safe = files.filter(file => typeof file === "string" && file && !/[\\/]/.test(file) && file.indexOf("..") < 0);
        if (!safe.length) return;
        Promise.all(safe.map(file => new Promise(resolve => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", baseUrl + file);
            xhr.responseType = "arraybuffer";
            xhr.onload = () => resolve(xhr.status < 400 ? xhr.response : null);
            xhr.onerror = () => resolve(null);
            xhr.send();
        }))).then(buffers => {
            const loaded = buffers.filter(Boolean);
            if (loaded.length) this.attachLodLevels(template, key, loaded);
        });
    });
};

Reactor3D.loadModelSidecar = function(name) {
    if (!this._sidecarCache) this._sidecarCache = {};
    const cached = this._sidecarCache[name];
    if (cached) return cached;
    this._sidecarCache[name] = new Promise(resolve => {
        if (typeof XMLHttpRequest === "undefined" || !name) {
            resolve(null);
            return;
        }
        const url = this.modelAnimationUrl(name);
        if (typeof Utils !== "undefined" && Utils.isNwjs && Utils.isNwjs()) {
            const fs = require("fs");
            const path = require("path");
            const base = path.dirname(process.mainModule.filename);
            if (!fs.existsSync(path.join(base, url))) {
                resolve(null);
                return;
            }
        }
        // A rig that keeps its weights in the binary sidecar needs that
        // file fetched and attached before consumers see the JSON.
        const finish = parsed => {
            // Kept in plain form for the readers that cannot wait: the
            // collision footprint asks per step.
            if (!Reactor3D._sidecarJson) Reactor3D._sidecarJson = {};
            Reactor3D._sidecarJson[name] = parsed || null;
            const rig = parsed && parsed.rig;
            if (!rig || !rig.weightsFile || rig.weights) {
                resolve(parsed);
                return;
            }
            // The pointer is a bare filename inside the model's folder;
            // anything path-like is refused.
            const file = String(rig.weightsFile);
            if (/[\\/]/.test(file) || file.indexOf("..") >= 0) {
                resolve(parsed);
                return;
            }
            const binUrl = "3d/" + name + "/" + file;
            const binXhr = new XMLHttpRequest();
            binXhr.open("GET", binUrl);
            binXhr.responseType = "arraybuffer";
            binXhr.onload = () => {
                if (binXhr.status < 400 && binXhr.response) {
                    rig.weightsBin = Reactor3D.decodeRigWeightsBinary(binXhr.response);
                }
                resolve(parsed);
            };
            binXhr.onerror = () => resolve(parsed);
            binXhr.send();
        };
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        xhr.responseType = "text";
        xhr.onload = () => {
            if (xhr.status >= 400 || !xhr.responseText) {
                resolve(null);
                return;
            }
            try {
                finish(JSON.parse(xhr.responseText));
            } catch (error) {
                console.error("Reactor3D: " + name + "/model.json could not be read.", error);
                resolve(null);
            }
        };
        xhr.onerror = () => resolve(null);
        xhr.send();
    });
    return this._sidecarCache[name];
};

Reactor3D.loadModelAnimations = function(name) {
    return this.loadModelSidecar(name).then(json =>
        json ? this.readModelAnimationRules(json) : []);
};

/**
 * Ready a cloned instance for animation: an inner group receives every
 * child so whole-model rules can move the body under the pose the sync
 * rewrites each frame, and each part-carrying mesh records the transform
 * it stands at so rules compose against it and reset cleanly.
 */
Reactor3D.prepareModelInstance = function(object, clips) {
    if (typeof THREE === "undefined" || !object) return null;
    const inner = new THREE.Group();
    inner.name = "anim-root";
    // The root is an anchor frame like any part: a whole-model pose turns
    // this node, and an effect anchored to the model (no part) rides it.
    inner.userData.__restQuaternion = new THREE.Quaternion();
    for (const child of object.children.slice()) inner.add(child);
    object.add(inner);
    const meshes = [];
    inner.traverse(child => {
        if (child.isSkinnedMesh) Reactor3D.SkeletonUpdates.install(child.skeleton);
        // Rig bones register as parts too: rotating a bone's local
        // transform about its own origin is bone FK, and the bone
        // hierarchy carries parent motion to children on its own.
        if (!(child.isMesh || Reactor3D.isRigJoint(child)) || !child.userData.parts
            || !child.userData.parts.length) return;
        // The rest turn stays on the node itself so anything holding only
        // the node — a video surface anchored to this part — can ask how
        // far the pose has turned it.
        child.userData.__restQuaternion = child.quaternion.clone();
        meshes.push({
            mesh: child,
            parts: child.userData.parts,
            basePosition: child.position.clone(),
            baseQuaternion: child.quaternion.clone(),
            baseScale: child.scale.clone(),
            // A bone the file's clips drive rests wherever the clip holds
            // it this frame; the animator refreshes this after the mixer.
            clipBase: child.userData.__reactorClipBone && clips && clips.length
                ? { position: child.position.clone(), quaternion: child.quaternion.clone(), scale: child.scale.clone() }
                : null,
            acc: null
        });
    });
    return {
        root: inner,
        meshes,
        angles: {},
        clips: clips || [],
        mixer: clips && clips.length && THREE.AnimationMixer
            ? new THREE.AnimationMixer(inner)
            : null,
        clipKey: null,
        clipAction: null
    };
};

Reactor3D.AXIS_VECTORS = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1]
};

/**
 * Movement triggers by specificity: "moving" is any travel, "walking" is
 * travel without dashing, "dashing" is travel while dashing. Returns
 * true/false for those triggers and null for every other trigger.
 */
Reactor3D.moveTriggerActive = function(trigger, state) {
    if (trigger === "moving") return !!state.moving;
    if (trigger === "walking") return !!state.moving && !state.dashing;
    if (trigger === "dashing") return !!(state.moving && state.dashing);
    return null;
};

/**
 * The rules as one placement sees them: the animation a prop or event
 * chose plays ON DEMAND for that instance, whatever trigger it was
 * authored with — a map placement picking "MonitorArmExtend" (authored
 * Always) fires it, and its Repeat loops it. Other rules keep their
 * authored triggers.
 */
Reactor3D.rulesForPlacement = function(rules, animation, repeat) {
    if (!animation || !Array.isArray(rules)) return rules;
    return rules.map(rule => rule && rule.name === animation
        ? Object.assign({}, rule, { trigger: "action", repeat: !!repeat || rule.repeat })
        : rule);
};

Reactor3D.modelRuleDuration = function(rule, clips) {
    if (rule.type === "clip") {
        const clip = (clips || []).find(c => c.name === rule.clip);
        return clip ? Math.max(1, Math.round(clip.duration * 60 / (rule.rate || 1))) : 60;
    }
    // A pose goes there and back: in over one period, out over another —
    // unless it holds, in which case the action only needs the way in and
    // the latch keeps it there.
    // A staying pose is never over while its action stands.
    if (rule.type === "pose") return rule.stay ? Infinity : rule.hold ? rule.period : rule.period * 2 * rule.cycles;
    return rule.period * rule.cycles;
};

/** Smoothstep: pose blends accelerate in and settle out. */
Reactor3D.poseEase = function(blend) {
    const b = Math.min(1, Math.max(0, blend));
    return b * b * (3 - 2 * b);
};

/**
 * Sample a keyed pose timeline at progress p (0..1). The timeline starts
 * at rest, eases smoothly between the authored stops, and returns to
 * rest at the end unless the final key sits at 1. Rotations interpolate
 * per-euler-component — authored stops, not arbitrary orientations, so
 * component lerp reads exactly as the author dragged the sliders.
 */
Reactor3D.sampleModelKeys = function(rule, p) {
    const rest = { at: 0, rotate: [0, 0, 0], move: [0, 0, 0], resize: [1, 1, 1] };
    const stops = [rest].concat(rule.keys);
    const last = rule.keys[rule.keys.length - 1];
    if (!last || last.at < 1) stops.push({ at: 1, rotate: [0, 0, 0], move: [0, 0, 0], resize: [1, 1, 1] });
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let k = 0; k + 1 < stops.length; k++) {
        if (p >= stops[k].at && p <= stops[k + 1].at) {
            a = stops[k];
            b = stops[k + 1];
            break;
        }
    }
    const span = b.at - a.at;
    const s = this.poseEase(span > 0 ? (p - a.at) / span : 1);
    const mix = (from, to) => [0, 1, 2].map(i => from[i] + (to[i] - from[i]) * s);
    return { rotate: mix(a.rotate, b.rotate), move: mix(a.move, b.move), resize: mix(a.resize, b.resize) };
};

/** Drive one instance's rules for this frame. */
/**
 * Logic frames a movement clip keeps playing after movement stops being
 * reported, before idle takes over. Long enough to ride out the frame
 * between one step landing and the next starting, and any frame that
 * caught no logic tick at all; short enough that stopping still reads as
 * stopping. Frames, not milliseconds, so it is the same on any display.
 */
Reactor3D.MOVE_CLIP_GRACE = 8;

Reactor3D.applyModelAnimation = function(binding, rules, state) {
    if (typeof THREE === "undefined" || !binding || !rules || !rules.length) return;
    binding.root.position.set(0, 0, 0);
    binding.root.quaternion.identity();
    binding.root.scale.set(1, 1, 1);
    for (const entry of binding.meshes) entry.acc = null;
    // Runs every frame for every animated instance; every vector, matrix
    // and record it needs comes from a pool that is reset per call, so a
    // walking character allocates nothing. Nothing handed out here outlives
    // the call: results are copied into the root and the per-entry matrix.
    const pool = this._animPool || (this._animPool = {
        vec: [], quat: [], mat: [], match: [], action: [], actions: [],
        euler: new THREE.Euler(), scratch: new THREE.Matrix4(),
        outPos: new THREE.Vector3(), outQuat: new THREE.Quaternion(), outScale: new THREE.Vector3()
    });
    let vecAt = 0, quatAt = 0, matAt = 0, matchAt = 0, actionAt = 0;
    const takeVec = () => pool.vec[vecAt] || (pool.vec[vecAt] = new THREE.Vector3()), nextVec = () => { const v = takeVec(); vecAt++; return v; };
    const nextQuat = () => { const q = pool.quat[quatAt] || (pool.quat[quatAt] = new THREE.Quaternion()); quatAt++; return q; };
    const nextMat = () => { const m = pool.mat[matAt] || (pool.mat[matAt] = new THREE.Matrix4()); matAt++; return m; };
    const euler = pool.euler;
    const axisOf = rule => nextVec().fromArray(this.AXIS_VECTORS[rule.axis]);
    const pivotTurn = (pivot, quat) => {
        const p = nextVec().fromArray(pivot);
        const m = nextMat().makeRotationFromQuaternion(quat);
        const turned = nextVec().copy(p).applyQuaternion(quat);
        m.setPosition(p.sub(turned));
        return m;
    };
    const pivotGrow = (pivot, size) => {
        const p = nextVec().fromArray(pivot);
        const m = nextMat().makeScale(size.x, size.y, size.z);
        const grown = nextVec().copy(p).multiply(size);
        m.setPosition(p.sub(grown));
        return m;
    };
    const partActions = pool.actions;
    partActions.length = 0;
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (rule.type === "clip") continue;
        let quat = null;
        let restWeight = 0;
        let slide = null;
        let grow = null;
        if (rule.type === "pose" && rule.keys.length) {
            // A keyed pose plays its timeline rather than blending one
            // target in and out: once through on an action, looping on an
            // ambient trigger. The timeline owns easing, so a cancelled
            // action simply rests.
            let progress = null;
            const duration = Math.max(1, rule.period * 2 * rule.cycles);
            if (rule.trigger === "action") {
                if (state.action && state.action.name === rule.name) {
                    const t = state.frame - state.action.frame;
                    // A zero-frame pose is there the frame its action starts.
                    if (rule.instant) progress = 1;
                    else if (t < duration) progress = t / duration;
                    else if (rule.stay) progress = 1;
                }
            } else {
                const active = rule.trigger === "always"
                    || (rule.trigger === "idle" && !state.moving)
                    || (rule.trigger === "moving" && state.moving);
                if (active) progress = (state.frame % duration) / duration;
            }
            binding.angles[i] = 0;
            if (progress === null) continue;
            const sampled = this.sampleModelKeys(rule, progress);
            if (rule.fromRest) restWeight = rule.instant ? 1 : Math.max(0, Math.min(1, progress));
            const toRad = Math.PI / 180;
            quat = nextQuat().setFromEuler(euler.set(
                sampled.rotate[0] * toRad, sampled.rotate[1] * toRad, sampled.rotate[2] * toRad, "XYZ"));
            if (sampled.move[0] || sampled.move[1] || sampled.move[2]) {
                slide = nextVec().set(sampled.move[0], sampled.move[1], sampled.move[2])
                    .multiplyScalar(1 / (state.scale || 1));
            }
            if (sampled.resize[0] !== 1 || sampled.resize[1] !== 1 || sampled.resize[2] !== 1) {
                grow = nextVec().set(sampled.resize[0], sampled.resize[1], sampled.resize[2]);
            }
        } else if (rule.type === "pose") {
            // The pose blend persists across frames (in binding.angles) so
            // a released trigger eases back to rest instead of snapping —
            // which is why an inactive pose cannot simply be skipped.
            let blend;
            if (rule.trigger === "action") {
                const fired = state.action && state.action.name === rule.name;
                if (rule.hold) {
                    // A held pose latches on its action and stays — a tank
                    // keeps its cannon raised — until another held pose
                    // claims the same part, which eases this one home.
                    if (!binding.latch) binding.latch = {};
                    if (fired) {
                        binding.latch[i] = true;
                        for (let k = 0; k < rules.length; k++) {
                            if (k !== i && rules[k].type === "pose" && rules[k].hold
                                && rules[k].part === rule.part) {
                                binding.latch[k] = false;
                            }
                        }
                    }
                    const step = 1 / Math.max(1, rule.period);
                    blend = Math.min(1, Math.max(0,
                        (binding.angles[i] || 0) + (binding.latch[i] ? step : -step)));
                } else if (!fired) {
                    blend = 0;
                } else {
                    const t = state.frame - state.action.frame;
                    if (t >= this.modelRuleDuration(rule)) {
                        blend = 0;
                    } else {
                        const phase = (t % (rule.period * 2)) / rule.period;
                        blend = phase < 1 ? phase : 2 - phase;
                    }
                }
            } else {
                const gate = Reactor3D.moveTriggerActive(rule.trigger, state);
                const active = rule.trigger === "always"
                    || (rule.trigger === "idle" && !state.moving)
                    || gate === true;
                const step = 1 / Math.max(1, rule.period);
                blend = Math.min(1, Math.max(0,
                    (binding.angles[i] || 0) + (active ? step : -step)));
            }
            binding.angles[i] = blend;
            if (!blend) continue;
            const eased = this.poseEase(blend);
            const toRad = Math.PI / 180;
            quat = nextQuat().setFromEuler(euler.set(
                rule.rotate[0] * eased * toRad,
                rule.rotate[1] * eased * toRad,
                rule.rotate[2] * eased * toRad, "XYZ"));
            if (rule.move[0] || rule.move[1] || rule.move[2]) {
                slide = nextVec().set(rule.move[0], rule.move[1], rule.move[2])
                    .multiplyScalar(eased / (state.scale || 1));
            }
            if (rule.resize[0] !== 1 || rule.resize[1] !== 1 || rule.resize[2] !== 1) {
                grow = nextVec().set(
                    1 + (rule.resize[0] - 1) * eased,
                    1 + (rule.resize[1] - 1) * eased,
                    1 + (rule.resize[2] - 1) * eased);
            }
        } else {
            let t = state.frame;
            const gate = Reactor3D.moveTriggerActive(rule.trigger, state);
            if (rule.trigger === "idle" && state.moving) continue;
            // A movement-driven spin holds its angle when travel stops — a
            // wheel does not snap back to rest — it simply stops gaining.
            if (gate === false && rule.type !== "spin") continue;
            if (rule.trigger === "action") {
                if (!state.action || state.action.name !== rule.name) continue;
                t = state.frame - state.action.frame;
                if (t >= this.modelRuleDuration(rule)) continue;
            }
            if (rule.type === "spin") {
                const gain = rule.perTile
                    ? state.distance * rule.perTile
                    : (gate === false ? 0 : rule.speed / 60);
                binding.angles[i] = (binding.angles[i] || 0) + gain;
                quat = nextQuat().setFromAxisAngle(axisOf(rule), binding.angles[i] * Math.PI / 180);
            } else if (rule.type === "swing") {
                const angle = rule.degrees * Math.sin(2 * Math.PI * (t / rule.period + rule.phase));
                quat = nextQuat().setFromAxisAngle(axisOf(rule), angle * Math.PI / 180);
            } else {
                const offset = rule.amount * Math.sin(2 * Math.PI * (t / rule.period + rule.phase)) / (state.scale || 1);
                slide = axisOf(rule).multiplyScalar(offset);
            }
        }
        if (!rule.part) {
            if (quat) binding.root.quaternion.premultiply(quat);
            if (slide) binding.root.position.add(slide);
            if (grow) binding.root.scale.multiply(grow);
            continue;
        }
        // A pin (a sequence pose listing a part at rest) turns nothing, but still claims the part.
        if (quat || slide || grow || restWeight > 0) {
            if (rule._partLowerOf !== rule.part) {
                rule._partLower = String(rule.part).toLowerCase();
                rule._partLowerOf = rule.part;
            }
            const action = pool.action[actionAt] || (pool.action[actionAt] = {});
            actionAt++;
            action.order = partActions.length;
            action.partLower = rule._partLower;
            action.quat = quat;
            action.slide = slide;
            action.grow = grow;
            action.rest = restWeight;
            partActions.push(action);
        }
    }
    // Per mesh, contributions compose by ANCESTRY, not authoring order: a
    // part's chain lists its own name first and its parents after, so the
    // turret's turn applies before the cannon's recoil and the recoil
    // slides along the turned barrel — whichever rule was written or
    // edited first. Same-depth contributions keep their rule order.
    for (const entry of binding.meshes) {
        let matched = null;
        for (const action of partActions) {
            let depth = -1;
            let pivot = null;
            for (let d = 0; d < entry.parts.length; d++) {
                const part = entry.parts[d];
                if (part.nameLower === undefined || part.nameLowerOf !== part.name) {
                    part.nameLower = String(part.name).toLowerCase();
                    part.nameLowerOf = part.name;
                }
                if (part.nameLower.indexOf(action.partLower) === 0) {
                    depth = d;
                    pivot = entry.parts[d].pivot;
                    break;
                }
            }
            if (depth < 0) continue;
            if (!matched) {
                matched = entry.matched || (entry.matched = []);
                matched.length = 0;
            }
            const hit = pool.match[matchAt] || (pool.match[matchAt] = {});
            matchAt++;
            hit.action = action;
            hit.depth = depth;
            hit.pivot = pivot;
            matched.push(hit);
        }
        if (!matched) continue;
        matched.sort((a, b) => b.depth - a.depth || a.action.order - b.action.order);
        entry.acc = (entry.accMatrix || (entry.accMatrix = new THREE.Matrix4())).identity();
        for (let m = 0; m < matched.length; m++) {
            const action = matched[m].action;
            const pivot = matched[m].pivot;
            const turn = action.quat;
            const slide = action.slide;
            // The slide comes first: an offset is in the model's frame, not
            // in the frame the same pose's turn leaves behind.
            if (slide) {
                entry.acc.multiply(nextMat().makeTranslation(slide.x, slide.y, slide.z));
            }
            if (turn) entry.acc.multiply(pivotTurn(pivot, turn));
            if (action.grow) entry.acc.multiply(pivotGrow(pivot, action.grow));
        }
    }
    if (binding.mixer) {
        // Clip-driven bones go back to the clip's last pose before the mixer
        // runs, so a pose composed onto them last frame never compounds.
        for (const entry of binding.meshes) {
            if (!entry.clipBase) continue;
            entry.mesh.position.copy(entry.clipBase.position);
            entry.mesh.quaternion.copy(entry.clipBase.quaternion);
            entry.mesh.scale.copy(entry.clipBase.scale);
        }
        // The same rules array asks every frame; filter it once per array.
        if (binding._clipRulesFor !== rules) {
            binding._clipRules = rules.filter(rule => rule.type === "clip");
            binding._clipRulesFor = rules;
        }
        const clipRules = binding._clipRules;
        let desired = null;
        let once = false;
        let key = "";
        let rate = 1;
        if (state.action) {
            const rule = clipRules.find(r => r.trigger === "action" && r.name === state.action.name);
            if (rule) {
                desired = rule.clip;
                once = !rule.repeat;
                key = rule.clip + ":" + state.action.frame;
                rate = rule.rate || 1;
            }
        }
        // A pose step holds the whole model at rest while it stands (a clip
        // would move the spine and shoulders under the posed arm, and the
        // editor shows the pose on a still model): only travel plays a clip.
        const posed = !!state.action && String(state.action.name).startsWith("pose:") && !state.moving;
        if (!desired) {
            // Movement is held for a moment after it stops being reported.
            //
            // A step lands on its tile a frame before the next one starts,
            // and a frame that catches no logic tick sees no movement at
            // all — so `moving` reads false for a single frame while a
            // character is plainly running. That frame picked "idle", and a
            // model with no idle rule got *no rule*, which empties `key`,
            // tears the clip down, and makes the next frame `reset()` a
            // fresh one: the run restarts from its first frame. Reported as
            // dashing that "stops in place and replays the animation", and
            // measured as `Running -> null -> Running` off one such frame.
            //
            // The grace is in logic frames, so it is the same fifth of a
            // second whatever the display is doing. A character that has
            // genuinely stopped is still idle a breath later.
            if (state.moving) {
                binding.movingAt = state.frame;
                binding.movingDash = !!state.dashing;
            }
            const held = binding.movingAt !== undefined
                && state.frame - binding.movingAt <= Reactor3D.MOVE_CLIP_GRACE;
            const moving = state.moving || held;
            // Keep the gait that was actually running, so the last frames of
            // a dash do not drop into the walk clip on the way to idle.
            const dashing = state.moving ? state.dashing : !!binding.movingDash;
            // The most specific movement clip wins: a dashing character
            // prefers "dashing" over plain "moving"; two clips on the same
            // trigger never fight — the first in the list plays.
            const pick = trigger => clipRules.find(r => r.trigger === trigger);
            const rule = (moving
                ? (dashing ? pick("dashing") : pick("walking")) || pick("moving")
                : pick("idle")) || pick("always");
            if (rule) {
                desired = rule.clip;
                key = rule.clip;
                rate = rule.rate || 1;
            }
        }
        // Under a pose the idle plays its first frame and stays there: a
        // still stance for the posed arm to work from, never the bind T-pose.
        if (posed && desired && !state.moving) { key = desired + ':posed'; once = false; }
        if (binding.clipKey !== key) {
            binding.clipKey = key;
            const previous = binding.clipAction;
            let next = null;
            if (desired) {
                const clip = binding.clips.find(c => c.name === desired);
                if (clip) {
                    next = binding.mixer.clipAction(clip);
                    next.reset();
                    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
                    next.clampWhenFinished = once;
                    next.fadeIn(0.2);
                    next.play();
                    if (once && state.action) next.time = Math.max(0, (state.frame - state.action.frame) / 60 * rate);
                }
            }
            if (previous && previous !== next) previous.fadeOut(0.2);
            binding.clipAction = next;
            if (next && posed) { next.paused = true; next.time = 0; }
        }
        if (binding.clipAction) binding.clipAction.timeScale = rate;
        // The mixer follows the caller's frame clock, not the call rate:
        // the editor's preview loop runs at the display's refresh, and a
        // fixed 1/60 step there played every clip at 120Hz-monitor speed.
        const step = binding.clipFrame == null
            ? 1
            : Math.max(0, Math.min(10 * Math.max(1, state.playbackRate || 1), state.frame - binding.clipFrame));
        binding.clipFrame = state.frame;
        if (state.seek) {
            // Timeline scrubbing samples an exact pose, including backwards
            // seeks. Runtime playback keeps its normal crossfades below.
            binding.mixer.stopAllAction();
            const action = binding.clipAction;
            if (action) {
                const elapsed = Math.max(0, (state.frame - (state.action?.frame || 0)) / 60 * rate);
                action.reset().setEffectiveWeight(1).play();
                action.time = once ? Math.min(elapsed, action.getClip().duration) : elapsed % Math.max(.001, action.getClip().duration);
            }
            binding.mixer.update(0);
        } else binding.mixer.update(step / 60);
        for (const entry of binding.meshes) {
            if (!entry.clipBase) continue;
            entry.clipBase.position.copy(entry.mesh.position);
            entry.clipBase.quaternion.copy(entry.mesh.quaternion);
            entry.clipBase.scale.copy(entry.mesh.scale);
        }
    }
    const scratch = pool.scratch;
    const outPos = pool.outPos;
    const outQuat = pool.outQuat;
    const outScale = pool.outScale;
    for (const entry of binding.meshes) {
        // A sidecar pose bends a clip-driven bone from the clip's pose. A
        // sequence pose (fromRest) starts the parts it lists from the model's
        // rest pose instead, so an authored aim reads the same whatever clip
        // is playing — a boxing-guard idle no longer lifts the pistol to the
        // head — and a listed part at zero pins to rest while the pose stands.
        let basePosition = entry.clipBase ? entry.clipBase.position : entry.basePosition;
        let baseQuaternion = entry.clipBase ? entry.clipBase.quaternion : entry.baseQuaternion;
        let baseScale = entry.clipBase ? entry.clipBase.scale : entry.baseScale;
        if (entry.acc && entry.clipBase && entry.matched) {
            let rest = 0;
            for (const hit of entry.matched) if (hit.action.rest > rest) rest = hit.action.rest;
            if (rest > 0) {
                const restPos = pool.restPos || (pool.restPos = new THREE.Vector3());
                const restQuat = pool.restQuat || (pool.restQuat = new THREE.Quaternion());
                const restScale = pool.restScale || (pool.restScale = new THREE.Vector3());
                basePosition = restPos.copy(entry.clipBase.position).lerp(entry.basePosition, rest);
                baseQuaternion = restQuat.copy(entry.clipBase.quaternion).slerp(entry.baseQuaternion, rest);
                baseScale = restScale.copy(entry.clipBase.scale).lerp(entry.baseScale, rest);
            }
        }
        if (!entry.acc) {
            entry.mesh.position.copy(basePosition);
            entry.mesh.quaternion.copy(baseQuaternion);
            if (baseScale) entry.mesh.scale.copy(baseScale);
            continue;
        }
        if (entry.clipBase) {
            // A pose is authored in the model's frame — the rings and arrows
            // the author dragged. A file joint's own frame is turned and
            // scaled by its skeleton (and by whatever its parents' poses did
            // this frame, settled above), so the pose is carried into that
            // frame here: acc ← frame⁻¹ · acc · frame.
            const chain = pool.chain || (pool.chain = new THREE.Quaternion());
            chain.identity();
            let units = 1;
            for (let node = entry.mesh; node && node !== binding.root; node = node.parent) {
                chain.premultiply(node === entry.mesh ? baseQuaternion : node.quaternion);
                units *= node.scale.x || 1;
            }
            const frame = pool.frame || (pool.frame = new THREE.Matrix4());
            const unframe = pool.unframe || (pool.unframe = new THREE.Matrix4());
            frame.makeRotationFromQuaternion(chain).scale(outScale.set(units, units, units));
            unframe.copy(frame).invert();
            entry.acc.premultiply(unframe).multiply(frame);
        }
        scratch.compose(basePosition, baseQuaternion, baseScale || entry.mesh.scale);
        scratch.multiply(entry.acc);
        scratch.decompose(outPos, outQuat, outScale);
        entry.mesh.position.copy(outPos);
        entry.mesh.quaternion.copy(outQuat);
        entry.mesh.scale.copy(outScale);
    }
};

/**
 * Which of a rule's timed effects fire as the action clock moves from
 * previousT (exclusive) to t (inclusive). Pure, so the window logic is
 * testable; each effect fires exactly once per play.
 */
Reactor3D.modelEffectsToFire = function(rule, duration, previousT, t) {
    if (!rule.effects || !rule.effects.length) return [];
    const fired = [];
    for (const effect of rule.effects) {
        const fireAt = Math.min(Math.max(1, duration) - 1, Math.round(effect.at * duration));
        if (fireAt > previousT && fireAt <= t) fired.push(effect);
    }
    return fired;
};

/** Deliver one fired effect into the running game. */
Reactor3D.fireModelEffect = function(effect, character, holder) {
    if (effect.effect) {
        const definition = this.modelEffectByName(holder && holder.effects, effect.effect);
        if (definition) this.fireNamedEffect(definition, character, holder);
        return;
    }
    if (effect.se) {
        if (typeof AudioManager !== "undefined") {
            // Passed whole: rebuilding it from four fields would drop the
            // variant pool and pitch range AudioManager resolves.
            AudioManager.playSe(effect.se);
        }
    } else if (effect.animation) {
        // A database animation — MV sprite sheet or Effekseer alike —
        // through the stock request pipeline, shown on the character.
        if (typeof $gameTemp !== "undefined" && $gameTemp.requestAnimation && character) {
            $gameTemp.requestAnimation([character], effect.animation);
        }
    } else if (effect.flash) {
        if (effect.flash.target === "screen") {
            if (typeof $gameScreen !== "undefined") {
                $gameScreen.startFlash(effect.flash.color.slice(), effect.flash.duration);
            }
        } else if (holder) {
            holder.flash = { color: effect.flash.color, duration: effect.flash.duration, t: 0 };
        }
    }
};

/**
 * Tint an instance's materials toward the flash colour, fading over the
 * duration. Materials are cloned per instance, so only this model
 * flashes. Returns true on the frame the flash ends, so the caller can
 * hand the materials back to the ambient tint.
 */
Reactor3D.updateModelFlash = function(holder) {
    if (!holder || !holder.flash || !holder.object) return false;
    const flash = holder.flash;
    const strength = (flash.color[3] / 255) * Math.max(0, 1 - flash.t / flash.duration);
    holder.object.traverse(child => {
        const mats = child.material
            ? (Array.isArray(child.material) ? child.material : [child.material])
            : [];
        for (const mat of mats) {
            if (!mat.color) continue;
            // A JSON-degraded base colour (a bare hex number) reads as
            // undefined channels; recapture it as a real Colour.
            if (!mat.userData.baseColor || !mat.userData.baseColor.isColor) {
                mat.userData.baseColor = mat.color.clone();
            }
            const base = mat.userData.baseColor;
            mat.color.setRGB(
                base.r + (flash.color[0] / 255 - base.r) * strength,
                base.g + (flash.color[1] / 255 - base.g) * strength,
                base.b + (flash.color[2] / 255 - base.b) * strength);
        }
    });
    flash.t++;
    if (flash.t > flash.duration) {
        holder.flash = null;
        holder.object.traverse(child => {
            const mats = child.material
                ? (Array.isArray(child.material) ? child.material : [child.material])
                : [];
            for (const mat of mats) {
                if (mat.color && mat.userData.baseColor && mat.userData.baseColor.isColor) {
                    mat.color.copy(mat.userData.baseColor);
                }
            }
        });
        return true;
    }
    return false;
};

Reactor3D.modelInstanceKey = function(character) {
    if (!character) return "p";
    if (character.eventId) return "e" + character.eventId();
    if (typeof Game_Follower !== "undefined" && character instanceof Game_Follower) {
        return "f" + (character._memberIndex != null ? character._memberIndex : 0);
    }
    return "p";
};

/**
 * 3D enemy battlers, without touching the battle renderer: an enemy
 * bound to a model in the database sidecar gets its battler bitmap from
 * a live offscreen Three render, refreshed every frame. The battle
 * scene keeps compositing ordinary sprites — appear, collapse, flashes
 * and plugin effects all still apply — while the bitmap underneath is a
 * breathing, animated model driven by the same rule engine as the map.
 */
Reactor3D.updateEnemyModelSprite = function(sprite) {
    if (!sprite || !sprite._enemy || typeof sprite._enemy.enemyId !== "function") return;
    const enemyId = sprite._enemy.enemyId();
    const spec = this.databaseModelSpec("enemies", enemyId);
    let state = sprite._reactorBattler;
    if (!spec) {
        if (state) {
            this.releaseBattlerState(state);
            sprite._reactorBattler = null;
            // Reload the stock battler art the model had replaced.
            sprite._battlerName = "";
        }
        return;
    }
    this.ensureLoaded();
    if (!this.isLoaded()) return;
    if (state && state.enemyId !== enemyId) {
        // Enemy Transform: rebuild for the new enemy.
        this.releaseBattlerState(state);
        sprite._reactorBattler = state = null;
    }
    if (!state) {
        state = sprite._reactorBattler = { enemyId, frame: 0, ready: false, building: true };
        const size = Math.max(48, Math.min(480, Math.round(spec.size * 96 * spec.scale)));
        Promise.all([
            this.loadModel(spec.name, spec.ext, spec.file, spec.texture),
            this.loadModelSidecar(spec.name)
        ]).then(([template, sidecar]) => {
            if (sprite._reactorBattler !== state || !template) return;
            this.groundAnimatedTemplate(template, sidecar);
            const object = this.cloneModelTemplate(template);
            this.applyModelTransform(object, this.readModelTransform(sidecar));
            const rig = this.readModelRig(sidecar);
            if (rig) {
                this.applyModelRig(object, rig);
            } else {
                this.carveModelParts(object, this.readModelParts(sidecar));
                this.applyPivotOverrides(object, this.readModelPivots(sidecar));
            }
            const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
            const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
            const scale = 1.6 / span;
            object.scale.setScalar(scale);
            this.applyEventModelPose(object, {
                pitch: spec.pitch, yaw: spec.yaw, roll: spec.roll, faces: spec.faces
            }, 2, { preview: true, faceYaw: 0 });
            const scene = new THREE.Scene();
            scene.add(object);
            scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
            const sun = new THREE.DirectionalLight(0xffffff, 0.9);
            sun.position.set(1.4, 2.2, 1.8);
            scene.add(sun);
            const height = Math.max(0.2, extent.y * scale);
            const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
            const distance = (height / (2 * Math.tan(17.5 * Math.PI / 180))) * 1.25;
            camera.position.set(0, height * 0.52, Math.max(distance, 0.8));
            camera.lookAt(0, height * 0.48, 0);
            state.object = object;
            state.scene = scene;
            state.camera = camera;
            state.scale = scale;
            state.binding = this.prepareModelInstance(object, object.__reactorClips);
            state.rules = sidecar ? this.readModelAnimationRules(sidecar) : [];
            state.size = size;
            state.bitmap = new Bitmap(size, size);
            state.ready = true;
        }).catch(() => {
            state.building = false;
        });
        return;
    }
    if (!state.ready) return;
    if (sprite.bitmap !== state.bitmap) {
        sprite.bitmap = state.bitmap;
    }
    // Plugin battlers may crop every bitmap as a character sheet. A model
    // texture is one complete frame; preserve only the stock collapse crop.
    sprite.setFrame(0, 0, state.size, sprite._effectType === "bossCollapse"
        ? Math.max(0, Math.min(state.size, sprite._effectDuration)) : state.size);
    state.frame++;
    const pending = this._modelActions && this._modelActions["b" + enemyId];
    if (pending) {
        delete this._modelActions["b" + enemyId];
        state.action = { name: pending.name, frame: state.frame };
    }
    if (state.action && state.frame - state.action.frame
        >= Math.max(...state.rules.map(rule => this.modelRuleDuration(rule, state.binding.clips)), 1)) {
        state.action = null;
    }
    if (state.binding && state.rules.length) {
        this.applyModelAnimation(state.binding, state.rules, {
            frame: state.frame,
            moving: false,
            distance: 0,
            scale: state.scale,
            action: state.action ? { name: state.action.name, frame: state.action.frame } : null
        });
    }
    this.paintBattlerFrame(state, sprite);
};

/**
 * A face-slot binding renders the model's head into a 144×144 face
 * bitmap, framed by the spec's view (zoom, height fraction). The render
 * is a still: it happens once when the model finishes loading, and any
 * window that asked before then is refreshed after.
 */
Reactor3D.actorFaceState = function(actorId) {
    if (!this._faceStates) this._faceStates = {};
    let state = this._faceStates[actorId];
    if (state) return state;
    const spec = this.actorSlotSpec(actorId, "face");
    if (!spec) return null;
    const size = 144;
    state = this._faceStates[actorId] = {
        ready: false,
        bitmap: new Bitmap(size, size),
        waiters: []
    };
    this.ensureLoaded();
    Promise.all([
        this.loadModel(spec.name, spec.ext, spec.file, spec.texture),
        this.loadModelSidecar(spec.name)
    ]).then(([template, sidecar]) => {
        if (!template || !this.isLoaded()) return;
        this.groundAnimatedTemplate(template, sidecar);
        const object = this.cloneModelTemplate(template);
        this.applyModelTransform(object, this.readModelTransform(sidecar));
        const rig = this.readModelRig(sidecar);
        if (rig) {
            this.applyModelRig(object, rig);
        } else {
            this.carveModelParts(object, this.readModelParts(sidecar));
            this.applyPivotOverrides(object, this.readModelPivots(sidecar));
        }
        const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
        const scale = 1.6 / span;
        object.scale.setScalar(scale);
        this.applyEventModelPose(object, {
            pitch: spec.pitch, yaw: spec.yaw, roll: spec.roll, faces: spec.faces
        }, 2, { preview: true, faceYaw: 0 });
        const scene = new THREE.Scene();
        scene.add(object);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.35));
        const view = spec.view || { zoom: 3, y: 0.82 };
        const height = Math.max(0.2, extent.y * scale);
        const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
        const visible = height / view.zoom;
        const distance = Math.max(0.3, (visible / (2 * Math.tan(17.5 * Math.PI / 180))) * 1.1);
        camera.position.set(0, height * view.y, distance);
        camera.lookAt(0, height * view.y, 0);
        // A close-up lights from beside the camera, not from overhead —
        // an overhead sun leaves the face itself in its own shadow side.
        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.position.set(distance * 0.6, height * view.y + distance * 0.5, distance * 1.4);
        scene.add(sun);
        const paint = () => {
            const renderer = this._battlerRenderer || (this._battlerRenderer =
                new THREE.WebGLRenderer({ antialias: true, alpha: true }));
            renderer.setSize(size, size, false);
            renderer.setClearColor(0x000000, 0);
            renderer.render(scene, camera);
            const context = state.bitmap.context;
            context.clearRect(0, 0, size, size);
            context.drawImage(renderer.domElement, 0, 0, size, size);
            state.bitmap.baseTexture.update();
            state.ready = true;
            for (const waiter of state.waiters.slice()) {
                if (waiter && typeof waiter.refresh === "function" && !waiter._destroyed) {
                    waiter.refresh();
                }
            }
        };
        paint();
        // Embedded textures decode after the model resolves; a single
        // early render bakes an untextured silhouette. Paint again once
        // they have settled, then let the scene go.
        setTimeout(paint, 700);
        setTimeout(() => {
            paint();
            state.waiters.length = 0;
        }, 2500);
    }).catch(error => {
        console.error("Reactor3D: face render failed.", error);
    });
    return state;
};

/**
 * A battler-slot binding shows the actor as a live 3D render in
 * side-view battles, exactly the way a bound enemy renders. The stock
 * motion cells do not apply: ambient rules and named actions drive it.
 */
Reactor3D.updateActorModelSprite = function(sprite) {
    if (!sprite || !sprite._actor || typeof sprite._actor.actorId !== "function") return;
    const actorId = sprite._actor.actorId();
    const spec = this.actorSlotSpec(actorId, "battler");
    const main = sprite._mainSprite;
    let state = sprite._reactorBattler;
    if (!spec || !main) {
        if (state) {
            this.releaseBattlerState(state);
            sprite._reactorBattler = null;
            sprite._battlerName = "";
        }
        return;
    }
    this.ensureLoaded();
    if (!this.isLoaded()) return;
    if (state && state.actorId !== actorId) {
        this.releaseBattlerState(state);
        sprite._reactorBattler = state = null;
    }
    if (!state) {
        state = sprite._reactorBattler = { actorId, frame: 0, ready: false, building: true };
        const size = Math.max(48, Math.min(480, Math.round(spec.size * 96 * spec.scale)));
        Promise.all([
            this.loadModel(spec.name, spec.ext, spec.file, spec.texture),
            this.loadModelSidecar(spec.name)
        ]).then(([template, sidecar]) => {
            if (sprite._reactorBattler !== state || !template) return;
            this.groundAnimatedTemplate(template, sidecar);
            const object = this.cloneModelTemplate(template);
            this.applyModelTransform(object, this.readModelTransform(sidecar));
            const rig = this.readModelRig(sidecar);
            if (rig) {
                this.applyModelRig(object, rig);
            } else {
                this.carveModelParts(object, this.readModelParts(sidecar));
                this.applyPivotOverrides(object, this.readModelPivots(sidecar));
            }
            const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
            const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
            const scale = 1.6 / span;
            object.scale.setScalar(scale);
            // Side view faces the enemies: the model looks left.
            this.applyEventModelPose(object, {
                pitch: spec.pitch, yaw: spec.yaw, roll: spec.roll, faces: spec.faces
            }, 4, { preview: true, faceYaw: 0 });
            const scene = new THREE.Scene();
            scene.add(object);
            scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
            const sun = new THREE.DirectionalLight(0xffffff, 0.9);
            sun.position.set(1.4, 2.2, 1.8);
            scene.add(sun);
            const height = Math.max(0.2, extent.y * scale);
            const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
            const distance = (height / (2 * Math.tan(17.5 * Math.PI / 180))) * 1.25;
            camera.position.set(0, height * 0.52, Math.max(distance, 0.8));
            camera.lookAt(0, height * 0.48, 0);
            state.object = object;
            state.scene = scene;
            state.camera = camera;
            state.scale = scale;
            state.binding = this.prepareModelInstance(object, object.__reactorClips);
            state.rules = sidecar ? this.readModelAnimationRules(sidecar) : [];
            state.size = size;
            state.bitmap = new Bitmap(size, size);
            state.ready = true;
        }).catch(() => {
            state.building = false;
        });
        return;
    }
    if (!state.ready) return;
    if (main.bitmap !== state.bitmap) {
        main.bitmap = state.bitmap;
    }
    main.setFrame(0, 0, state.size, state.size);
    state.frame++;
    const pending = this._modelActions && this._modelActions["a" + actorId];
    if (pending) {
        delete this._modelActions["a" + actorId];
        state.action = { name: pending.name, frame: state.frame };
    }
    if (state.action && state.frame - state.action.frame
        >= Math.max(...state.rules.map(rule => this.modelRuleDuration(rule, state.binding.clips)), 1)) {
        state.action = null;
    }
    if (state.binding && state.rules.length) {
        this.applyModelAnimation(state.binding, state.rules, {
            frame: state.frame,
            moving: false,
            distance: 0,
            scale: state.scale,
            action: state.action ? { name: state.action.name, frame: state.action.frame } : null
        });
    }
    this.paintBattlerFrame(state, main);
};

/** Queue a named action on a 3D actor battler. */
/** The pitch a flat map is looked at from, the same the 3D view defaults to. */
Reactor3D.MODEL_SPRITE_PITCH = 55;

/**
 * Frame a model for its sprite: an orthographic camera pitched down like the
 * map view, sized to the model's bounding sphere about its ground origin so
 * the frame stays the same however the model turns. `unit` is the pixel size
 * of one model unit (the footprint). Returns the sizes and where the ground
 * origin lands in the frame, as anchors.
 */
Reactor3D.frameModelSprite = function(object, unit, camera, pitchDegrees) {
    const pitch = ((pitchDegrees == null ? this.MODEL_SPRITE_PITCH : pitchDegrees) * Math.PI) / 180;
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const corners = [];
    for (let i = 0; i < 8; i++) {
        corners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    }
    let radius = 0.5;
    for (const corner of corners) radius = Math.max(radius, corner.length());
    const distance = radius * 4 + 10;
    camera.position.set(0, Math.sin(pitch) * distance, Math.cos(pitch) * distance);
    camera.lookAt(0, 0, 0);
    camera.left = -radius;
    camera.right = radius;
    camera.top = radius;
    camera.bottom = -radius;
    camera.near = 0.01;
    camera.far = distance * 2 + radius * 2;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const pixels = Math.max(8, Math.min(2048, Math.round(radius * 2 * unit)));
    return { pixels, radius, anchorX: 0.5, anchorY: 0.5 };
};

/** Cache conservative skin bounds in each influencing bone's bind space.
 * Vertex data is read once per geometry/bind; moving frames only transform
 * these small boxes. Weighted skin positions stay inside their union. */
Reactor3D.prepareFlatModelBounds = function(object) {
    const entries = [];
    const cache = this._flatSkinBounds || (this._flatSkinBounds = new WeakMap());
    object.traverse(mesh => {
        if (!mesh.isMesh || !mesh.geometry || mesh.userData.__reactorOverlay) return;
        const geometry = mesh.geometry, positions = geometry.getAttribute("position");
        if (!positions) return;
        const indices = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
        if (mesh.isSkinnedMesh && mesh.skeleton && indices && weights) {
            const signature = mesh.bindMatrix.elements.join(",") + ":" + mesh.skeleton.boneInverses.map(m => m.elements.join(",")).join(";");
            const versions = cache.get(geometry) || [];
            let cached = versions.find(entry => entry.signature === signature);
            if (!cached) {
                const boxes = mesh.skeleton.bones.map(() => new THREE.Box3());
                const transforms = mesh.skeleton.boneInverses.map(m => new THREE.Matrix4().multiplyMatrices(m, mesh.bindMatrix));
                const vertex = new THREE.Vector3(), local = new THREE.Vector3();
                for (let i = 0; i < positions.count; i++) {
                    vertex.fromBufferAttribute(positions, i);
                    for (let j = 0; j < 4; j++) {
                        if (!(weights.getComponent(i, j) > 0)) continue;
                        const index = indices.getComponent(i, j);
                        if (boxes[index]) boxes[index].expandByPoint(local.copy(vertex).applyMatrix4(transforms[index]));
                    }
                }
                cached = { signature, boxes }; versions.push(cached); cache.set(geometry, versions);
            }
            entries.push({ mesh, bones: cached.boxes });
        } else {
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            if (geometry.boundingBox) entries.push({ mesh, box: geometry.boundingBox });
        }
    });
    return entries;
};

/** Grow a flat sprite only when its posed parts leave the current frame.
 * The ground anchor and pixels per model unit stay fixed, so growth neither
 * shifts the sprite nor shrinks its art. Frames never oscillate in size. */
Reactor3D.expandModelSpriteFrame = function(state) {
    if (!state.bounds) state.bounds = this.prepareFlatModelBounds(state.object);
    state.object.updateMatrixWorld(true);
    const box = this._flatBoundsBox || (this._flatBoundsBox = new THREE.Box3());
    const piece = this._flatBoundsPiece || (this._flatBoundsPiece = new THREE.Box3());
    const transform = this._flatBoundsTransform || (this._flatBoundsTransform = new THREE.Matrix4());
    const skinRoot = this._flatBoundsSkinRoot || (this._flatBoundsSkinRoot = new THREE.Matrix4());
    box.makeEmpty();
    for (const entry of state.bounds) {
        const mesh = entry.mesh;
        if (entry.bones) {
            skinRoot.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
            for (let i = 0; i < entry.bones.length; i++) {
                if (entry.bones[i].isEmpty()) continue;
                transform.multiplyMatrices(skinRoot, mesh.skeleton.bones[i].matrixWorld);
                box.union(piece.copy(entry.bones[i]).applyMatrix4(transform));
            }
        } else box.union(piece.copy(entry.box).applyMatrix4(mesh.matrixWorld));
    }
    if (box.isEmpty()) return false;
    const reach = Math.hypot(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
        Math.max(Math.abs(box.min.y), Math.abs(box.max.y)), Math.max(Math.abs(box.min.z), Math.abs(box.max.z)));
    if (reach <= state.radius) return false;
    // A small reserve avoids repeated target allocations as an arm extends.
    const radius = reach * 1.1;
    if (!state.maxPixels) {
        const gl = typeof Graphics !== "undefined" && Graphics._app?.renderer?.gl;
        state.maxPixels = gl ? Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048) : 2048;
    }
    const size = Math.max(8, Math.min(state.maxPixels, Math.ceil(radius * 2 * state.pixelsPerUnit)));
    const camera = state.camera;
    camera.position.normalize().multiplyScalar(radius * 4 + 10);
    camera.left = camera.bottom = -radius; camera.right = camera.top = radius;
    camera.far = radius * 10 + 20;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    state.radius = radius;
    state.pixelsPerUnit = size / (radius * 2);
    if (size !== state.size) {
        this.releaseBattlerState(state);
        const previous = state.bitmap;
        state.size = size; state.bitmap = new Bitmap(size, size);
        const sprite = state.sprite;
        sprite.bitmap = state.bitmap; sprite.setFrame(0, 0, size, size);
        const tile = typeof $gameMap !== "undefined" ? $gameMap.tileHeight() : 48;
        sprite.anchor.y = state.anchorY + tile / 2 / size;
        if (previous && previous.destroy) previous.destroy();
    }
    return true;
};

/** Lift brings a model toward the pitched camera even as it moves upward
 * on screen. Never use that lifted screen Y as its drawing depth. */
Reactor3D.flatModelLift = function(character) {
    const lifted = typeof character.eventId !== "function"
        || character.eventId() >= this.PROP_EVENT_BASE || this.isEventProp(character.eventId());
    return lifted ? (character._reactorLift || 0) : 0;
};
Reactor3D.flatModelSortY = function(character) {
    const tile = typeof $gameMap !== "undefined" ? $gameMap.tileHeight() : 48;
    const height = this.flatModelLift(character);
    return character.screenY() + height * tile * Math.tan(this.MODEL_SPRITE_PITCH * Math.PI / 180);
};

/** Unregister a replaced flat holder before its replacement loads. */
Reactor3D.releaseMapModelState = function(state) {
    if (!state) return;
    const key = this.modelInstanceKey(state.character);
    if (state.registry?.get(key) === state) state.registry.delete(key);
    this.releaseBattlerState(state);
};

/**
 * A model-bound character on a map that is not rendered in 3D is still a
 * sprite: an orthographic render of the model from the map's pitch, its
 * footprint one `size` tiles across, its ground origin on the tile centre,
 * turned with the character's direction and refreshed while its animation
 * rules play. The editor's Preview Event draws this same view.
 */
Reactor3D.updateMapModelSprite = function(sprite) {
    const character = sprite && sprite._character;
    if (!character || typeof character.tileId === "function" && character.tileId() > 0) return;
    const spec = this.characterModelSpec(character);
    let state = sprite._reactorMapModel;
    const inScene = typeof $dataMap !== "undefined" && this.shouldRender3D($dataMap);
    if (!spec || inScene) {
        if (state) {
            this.releaseMapModelState(state);
            sprite._reactorMapModel = null;
        }
        return;
    }
    this.ensureLoaded();
    if (!this.isLoaded()) return;
    const key = this.modelCacheKey(spec.name, spec.ext, spec.file);
    if (state && state.key !== key) {
        this.releaseMapModelState(state);
        sprite._reactorMapModel = state = null;
    }
    if (!state) {
        const tw = typeof $gameMap !== "undefined" && $gameMap.tileWidth ? $gameMap.tileWidth() : 48;
        const size = Math.max(8, Math.min(2048, Math.round(
            (spec.size > 0 ? spec.size : 2) * (spec.scale > 0 ? spec.scale : 1) * Math.max.apply(null, spec.stretch || [1]) * tw)));
        state = sprite._reactorMapModel = { key, character, sprite, flat: true, size, frame: 0, ready: false, direction: 0, dirty: true };
        Promise.all([
            this.loadModel(spec.name, spec.ext, spec.file, spec.texture),
            this.loadModelSidecar(spec.name)
        ]).then(([template, sidecar]) => {
            if (sprite._reactorMapModel !== state || !template) return;
            this.groundAnimatedTemplate(template, sidecar);
            const object = this.cloneModelTemplate(template);
            this.applyModelTransform(object, this.readModelTransform(sidecar));
            const rig = this.readModelRig(sidecar);
            if (rig) {
                this.applyModelRig(object, rig);
            } else {
                this.carveModelParts(object, this.readModelParts(sidecar));
                this.applyPivotOverrides(object, this.readModelPivots(sidecar));
            }
            const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
            const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
            object.scale.setScalar(1 / span);
            const scene = new THREE.Scene();
            scene.add(object);
            scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
            const sun = new THREE.DirectionalLight(0xffffff, 0.9);
            sun.position.set(1.4, 2.2, 1.8);
            scene.add(sun);
            const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 100);
            const framing = this.frameModelSprite(object, state.size, camera);
            state.object = object;
            state.scene = scene;
            state.camera = camera;
            state.scale = 1 / span;
            state.binding = this.prepareModelInstance(object, object.__reactorClips);
            state.rules = sidecar ? this.readModelAnimationRules(sidecar) : [];
            state.effects = sidecar ? this.readModelEffects(sidecar) : [];
            object.userData.glbSize = extent;
            this.bindModelLandmarks(object, this.readModelLandmarks(sidecar));
            state.unit = state.size;
            state.size = framing.pixels;
            state.radius = framing.radius;
            state.pixelsPerUnit = framing.pixels / (2 * framing.radius);
            state.anchorX = framing.anchorX;
            state.anchorY = framing.anchorY;
            state.bitmap = new Bitmap(state.size, state.size);
            state.ready = true;
            state.dirty = true;
        }).catch(() => {});
        return;
    }
    if (!state.ready) return;
    const spriteset = typeof SceneManager !== "undefined" && SceneManager._scene?._spriteset;
    if (spriteset) {
        if (!spriteset._reactorFlatModelInstances) spriteset._reactorFlatModelInstances = new Map();
        state.registry = spriteset._reactorFlatModelInstances;
        state.registry.set(this.modelInstanceKey(character), state);
    }
    this.resumeModelPlayback(state, character, this.currentFrame());
    sprite._reactorSortY = this.flatModelSortY(character);
    if (sprite.bitmap !== state.bitmap) sprite.bitmap = state.bitmap;
    sprite.setFrame(0, 0, state.size, state.size);
    if (state.target && sprite.texture && typeof PIXI !== "undefined") {
        sprite.texture.rotate = PIXI.groupD8.MIRROR_VERTICAL;
        sprite.texture.updateUvs?.();
    }
    // The sprite sits at the character's feet (the tile's bottom edge); the
    // model's ground origin belongs on the tile centre, half a tile up.
    const th = typeof $gameMap !== "undefined" && $gameMap.tileHeight ? $gameMap.tileHeight() : 48;
    sprite.anchor.x = state.anchorX;
    sprite.anchor.y = state.anchorY + (th / 2) / state.size;
    // Same pose and turn as the 3D scene gives the model.
    this.applyEventModelPose(state.object, spec, this.characterModelDir8(character));
    const targetYaw = state.object.rotation.y;
    if (state.smoothYaw === undefined) {
        state.smoothYaw = targetYaw;
    } else if (state.smoothYaw !== targetYaw) {
        const delta = Math.atan2(Math.sin(targetYaw - state.smoothYaw), Math.cos(targetYaw - state.smoothYaw));
        state.smoothYaw = Math.abs(delta) <= this.MODEL_TURN_SPEED
            ? targetYaw
            : state.smoothYaw + Math.sign(delta) * this.MODEL_TURN_SPEED;
    }
    if (state.object.rotation.y !== state.smoothYaw || state.shownYaw !== state.smoothYaw) {
        state.object.rotation.y = state.smoothYaw;
        state.shownYaw = state.smoothYaw;
        state.dirty = true;
    }
    // Same as the 3D path: a carried light follows the drawn heading.
    this.noteModelFacing(character, state.smoothYaw - (spec.yaw || 0));
    // Same animation driver as the scene: walk/idle by movement, actions
    // from Play Model Animation, including placement sequences and repeats.
    if (state.binding && state.rules.length) {
        let frame = typeof Graphics !== "undefined" ? Graphics.frameCount : ++state.frame;
        const distance = state.lastX === undefined
            ? 0
            : Math.hypot(character._realX - state.lastX, character._realY - state.lastY);
        state.lastX = character._realX;
        state.lastY = character._realY;
        frame = this.advanceModelAction(state, character, frame);
        this.applyModelAnimation(state.binding, state.rules, {
            frame,
            moving: !!(character.isMoving && character.isMoving()) || distance > 0.0001,
            dashing: typeof Game_Follower !== "undefined" && character instanceof Game_Follower
                ? $gamePlayer.isDashing()
                : !!(character.isDashing && character.isDashing()),
            distance,
            scale: state.scale,
            playbackRate: state.playbackRate,
            action: state.action || null
        });
        state.dirty = true;
    }
    for (const name of this.takeModelEffects(character)) {
        const effect = this.modelEffectByName(state.effects, name);
        if (effect && effect.trigger === "action") this.fireNamedEffect(effect, character, state);
    }
    this.updateTriggeredEffects(state, character, {
        moving: !!character.isMoving?.(), dashing: !!character.isDashing?.()
    });
    this.updateAnchoredAnimations(state);
    if (this.updateModelFlash(state)) state.dirty = true;
    if (!state.dirty || sprite._rrCulled) return;
    if (typeof SceneManager !== "undefined" && SceneManager.isFinalUpdateOfFrame
        && !SceneManager.isFinalUpdateOfFrame()) return;
    this.expandModelSpriteFrame(state);
    state.dirty = false;
    this.paintModelSpriteCanvas(state);
};

Reactor3D.playActorBattlerAnimation = function(actorId, name) {
    if (!name) return;
    if (!this._modelActions) this._modelActions = {};
    this._modelActions["a" + actorId] = { name: String(name), frame: 0 };
};

/** Queue a named action on a 3D enemy battler, by troop member index. */
Reactor3D.playBattlerAnimation = function(enemyId, name) {
    if (!name) return;
    if (!this._modelActions) this._modelActions = {};
    // The frame stamps on pickup: each battler runs its own clock.
    this._modelActions["b" + enemyId] = { name: String(name), frame: 0 };
};

//-----------------------------------------------------------------------------
// Model base transform
//
// A model's own correction, authored once in the database and applied to
// every instance: an offset in the model's units, a turn in degrees and a
// scale, kept in model.json as `transform`. It sits inside the instance on a
// wrapper group, so placement, facing and the pose rules still act on the
// root exactly as before.
//-----------------------------------------------------------------------------

/** A scale as authored: one number for proportional, [x, y, z] for free. */
Reactor3D.readScale = function(raw, fallback) {
    if (Array.isArray(raw)) {
        const axes = [0, 1, 2].map(i => {
            const value = Number(raw[i]);
            return Number.isFinite(value) && value > 0 ? value : 1;
        });
        return axes;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : (fallback === undefined ? 1 : fallback);
};

/** The three factors of an authored scale. */
Reactor3D.scaleAxes = function(scale) {
    return Array.isArray(scale) ? scale : [scale || 1, scale || 1, scale || 1];
};

Reactor3D.readModelTransform = function(json) {
    const raw = json && json.transform && typeof json.transform === "object" ? json.transform : {};
    const vec = value => [0, 1, 2].map(i => {
        const list = Array.isArray(value) ? value : [];
        const number = Number(list[i]);
        return Number.isFinite(number) ? number : 0;
    });
    return {
        offset: vec(raw.offset),
        rotate: vec(raw.rotate),
        scale: this.readScale(raw.scale, 1)
    };
};

Reactor3D.isIdentityTransform = function(transform) {
    return !transform || (transform.offset.every(v => !v) && transform.rotate.every(v => !v)
        && this.scaleAxes(transform.scale).every(v => v === 1));
};

/**
 * Put the base transform on an instance. The children move onto a wrapper
 * group the first time; later calls just set the wrapper, so the editor can
 * slide the sliders live.
 */
Reactor3D.applyModelTransform = function(object, transform) {
    if (!object || typeof THREE === "undefined") return null;
    let wrapper = object.children.find(child => child.userData && child.userData.__reactorTransform);
    if (!wrapper) {
        if (this.isIdentityTransform(transform)) return null;
        wrapper = new THREE.Group();
        wrapper.name = "base-transform";
        wrapper.userData.__reactorTransform = true;
        for (const child of object.children.slice()) wrapper.add(child);
        object.add(wrapper);
    }
    const t = transform || this.readModelTransform(null);
    wrapper.position.set(t.offset[0], t.offset[1], t.offset[2]);
    wrapper.rotation.order = "YXZ";
    wrapper.rotation.set(t.rotate[0] * Math.PI / 180, t.rotate[1] * Math.PI / 180, t.rotate[2] * Math.PI / 180);
    const axes = this.scaleAxes(t.scale);
    wrapper.scale.set(axes[0], axes[1], axes[2]);
    wrapper.updateMatrix();
    return wrapper;
};


//-----------------------------------------------------------------------------
// Model look, playback and live transform

/**
 * The joint that carries a model's head, for the look to pitch: the rig's
 * own Head joint first, then a joint named Head, then any head-named joint
 * that is not a tip (head_end, headfront). A rig mapped onto a file's joints
 * marks plain Groups as joints, so the test is isRigJoint, never isBone
 * alone: on every bundled actor the head is a Group, and a Bone-only search
 * found nothing and leaned the whole body instead.
 */
Reactor3D.findHeadJoint = function(object) {
    let best = null;
    let bestRank = Infinity;
    const tip = /(_end$|end$|tip|top|front)/i;
    object.traverse(node => {
        if (!this.isRigJoint(node)) return;
        const part = (node.userData && node.userData.parts && node.userData.parts[0] && node.userData.parts[0].name) || "";
        const name = node.name || "";
        const rank = /^head$/i.test(part) ? 0
            : /^head$/i.test(name) ? 1
            : /head/i.test(name) && !tip.test(name) ? 2
            : /head/i.test(part) && !tip.test(part) ? 3
            : Infinity;
        if (rank < bestRank) { best = node; bestRank = rank; }
    });
    return best;
};

/**
 * In third person the player looks where the camera looks: the head joint
 * pitches with the look when the model has one, else the body leans a
 * little. Applied after the animation pass, on top of the joint's pose. The
 * pitch turns about the model's own side axis, carried into the joint's
 * parent frame, so a joint authored on any axis nods rather than rolls; and
 * a joint no clip rewrote since last frame is put back before the new lean
 * goes on, so an idle model does not wind its head up frame by frame.
 */
Reactor3D.applyLookLean = function(object, character) {
    if (!object || !this.Camera || typeof $gamePlayer === "undefined" || character !== $gamePlayer) return;
    const lean = this.Camera.lookLean() * Math.PI / 180;
    if (!object.userData.__reactorHeadSearched) {
        object.userData.__reactorHeadSearched = true;
        object.userData.__reactorHead = this.findHeadJoint(object);
    }
    const head = object.userData.__reactorHead;
    if (!head) {
        object.rotation.x += lean;
        return;
    }
    const memo = head.userData.__reactorLean || (head.userData.__reactorLean = {
        base: new THREE.Quaternion(), result: new THREE.Quaternion(), applied: false
    });
    if (memo.applied && head.quaternion.equals(memo.result)) head.quaternion.copy(memo.base);
    memo.base.copy(head.quaternion);
    if (lean) {
        const scratch = Reactor3D._leanScratch || (Reactor3D._leanScratch = {
            model: new THREE.Quaternion(), parent: new THREE.Quaternion(), turn: new THREE.Quaternion(), axis: new THREE.Vector3()
        });
        object.getWorldQuaternion(scratch.model);
        (head.parent || object).getWorldQuaternion(scratch.parent).invert();
        scratch.axis.set(1, 0, 0).applyQuaternion(scratch.model).applyQuaternion(scratch.parent).normalize();
        head.quaternion.premultiply(scratch.turn.setFromAxisAngle(scratch.axis, lean));
    }
    memo.result.copy(head.quaternion);
    memo.applied = true;
    head.updateMatrix();
};

/** Placement and event overrides are percentages; old maps default to 100. */
Reactor3D.modelAnimationSpeed = function(character) {
    const value = character?._reactorAnimationSpeed ?? character?.event?.()?.reactorProp?.animationSpeed ?? 100;
    return Math.max(1, Math.min(1000, Number(value) || 100));
};
Reactor3D.setModelAnimationSpeed = function(character, percent) {
    if (!character) return;
    character._reactorAnimationSpeed = Math.max(1, Math.min(1000, Number(percent) || 100));
};
Reactor3D.modelPlaybackFrame = function(holder, character, frame) {
    const delta = holder.animationRealFrame === undefined ? 0 : Math.max(0, frame - holder.animationRealFrame);
    holder.playbackRate = this.modelAnimationSpeed(character) / 100;
    holder.animationFrame = (holder.animationFrame ?? frame) + delta * holder.playbackRate;
    holder.animationRealFrame = frame;
    return holder.animationFrame;
};

/** The same action clock drives map models in both renderers. */
Reactor3D.advanceModelAction = function(holder, character, frame) {
    this.resumeModelPlayback(holder, character, frame);
    frame = this.modelPlaybackFrame(holder, character, frame);
    const key = this.modelInstanceKey(character);
    const queue = Reactor3D._modelActions && Reactor3D._modelActions[key];
    if (queue && queue.length) {
        const pending = queue[0];
        if (!pending.name) {
            // A stop: ends the play and everything queued behind it.
            queue.length = 0;
            holder.action = null;
        } else if (!holder.action) {
            queue.shift();
            // The placement chose this animation: it plays on demand
            // for this instance whatever trigger it was authored
            // with, and the placement's Repeat loops it.
            holder.rules = Reactor3D.rulesForPlacement(holder.rules, pending.name, pending.repeat);
            let until = frame;
            for (const rule of holder.rules) {
                if (rule.trigger !== "action" || rule.name !== pending.name) continue;
                until = Math.max(until,
                    frame + Reactor3D.modelRuleDuration(rule, holder.binding.clips));
            }
            holder.action = until > frame
                ? { name: pending.name, frame, until, repeat: !!pending.repeat, sequence: pending.sequence || null }
                : null;
        }
        if (!queue.length) delete Reactor3D._modelActions[key];
    }
    if (holder.action && frame >= holder.action.until) {
        // A repeating animation starts over — unless something is
        // queued behind it, which takes the stage after this cycle.
        const queued = Reactor3D._modelActions && Reactor3D._modelActions[key];
        const rule = holder.rules.find(entry => entry.trigger === "action" && entry.name === holder.action.name);
        const ended = holder.action;
        holder.action = !ended.sequence && rule && (rule.repeat || holder.action.repeat) && !(queued && queued.length)
            ? { name: holder.action.name, frame, until: frame + Reactor3D.modelRuleDuration(rule, holder.binding.clips), repeat: holder.action.repeat }
            : null;
        // The last play of a looping list: the list goes round again.
        if (!holder.action && ended.sequence && !(queued && queued.length)) {
            Reactor3D.playModelSequence(character, ended.sequence, true);
        }
    }
    // Timed effects ride the action clock, each firing once.
    const fxKey = holder.action ? holder.action.name + ":" + holder.action.frame : "";
    if (holder.fxKey !== fxKey) {
        holder.fxKey = fxKey;
        holder.fxT = -1;
    }
    if (holder.action) {
        const fxNow = frame - holder.action.frame;
        for (const rule of holder.rules) {
            if (rule.trigger !== "action" || rule.name !== holder.action.name) continue;
            const duration = Reactor3D.modelRuleDuration(rule, holder.binding.clips);
            for (const effect of Reactor3D.modelEffectsToFire(rule, duration, holder.fxT, fxNow)) {
                Reactor3D.fireModelEffect(effect, character, holder);
            }
        }
        holder.fxT = fxNow;
    }
    return frame;
};

// Hold only playback data across a spriteset rebuild, never meshes or textures.
// Weak character keys keep an old map from retaining its events after transfer.
Reactor3D._pausedModelPlayback = new WeakMap();
Reactor3D.pauseModelPlayback = function(holder) {
    if (!holder || !holder.character || !holder.object) return;
    this._pausedModelPlayback.set(holder.character, {
        spec: holder.spec || holder.key, frame: this.currentFrame(),
        action: holder.action && { ...holder.action }, rules: holder.rules,
        fxT: holder.fxT, animationFrame: holder.animationFrame, lights: holder.lights && Object.fromEntries(
            Object.entries(holder.lights).map(([name, entry]) => [name, { ...entry }]))
    });
};
Reactor3D.resumeModelPlayback = function(holder, character, frame) {
    const saved = this._pausedModelPlayback.get(character);
    if (!saved) return;
    this._pausedModelPlayback.delete(character);
    if (saved.spec !== (holder.spec || holder.key)) return;
    const elapsed = frame - saved.frame;
    holder.animationFrame = (saved.animationFrame ?? saved.frame) + elapsed;
    holder.animationRealFrame = frame;
    holder.rules = saved.rules || holder.rules;
    holder.action = saved.action;
    if (holder.action) {
        holder.action.frame += elapsed;
        holder.action.until += elapsed;
        holder.fxKey = holder.action.name + ":" + holder.action.frame;
        holder.fxT = saved.fxT;
    }
    holder.lights = saved.lights;
    for (const entry of Object.values(holder.lights || {})) if (entry.until > 0) entry.until += elapsed;
};

/** Queue a named action animation on a character's model. */
Reactor3D.playModelAnimation = function(character, name, options) {
    if (!this._modelActions) this._modelActions = {};
    const key = this.modelInstanceKey(character);
    const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
    const entry = { name: String(name), frame, repeat: !!(options && options.repeat),
        // The whole list this play belongs to, on its last entry, when the
        // list loops: the end of this play starts the list again.
        sequence: options && Array.isArray(options.sequence) ? options.sequence.slice() : null };
    // Plays QUEUE: several Play Model Animation commands in a row run one
    // after another on the model, so an event can fire a whole sequence and
    // end at once — no Waits, no player standing frozen while a tank goes
    // through its motions. An empty name stops the play and drops the queue.
    if (!entry.name) {
        this._modelActions[key] = [entry];
        return;
    }
    const queue = Array.isArray(this._modelActions[key]) ? this._modelActions[key] : [];
    queue.push(entry);
    this._modelActions[key] = queue;
};

/**
 * Play several animations one after another: a door's open, then its
 * settle; a turret's raise, then its sweep. `repeat` loops the whole list.
 * One name with repeat is the plain repeating play.
 */
Reactor3D.playModelSequence = function(character, names, repeat) {
    const list = (Array.isArray(names) ? names : [names]).map(name => String(name || "")).filter(Boolean);
    if (!list.length) return;
    if (list.length === 1) {
        this.playModelAnimation(character, list[0], { repeat: !!repeat });
        return;
    }
    for (let i = 0; i < list.length; i++) {
        this.playModelAnimation(character, list[i], { sequence: repeat && i === list.length - 1 ? list : null });
    }
};

/** The animations a placed prop plays, in order: the list, or the one older files hold. */
Reactor3D.propAnimationList = function(prop) {
    if (!prop) return [];
    const list = Array.isArray(prop.animations) ? prop.animations : (prop.animation ? [prop.animation] : []);
    return list.map(name => String(name || "")).filter(Boolean);
};

/** The effects a placed prop plays, all at once: the list, or the one older files hold. */
Reactor3D.propEffectList = function(prop) {
    if (!prop) return [];
    const list = Array.isArray(prop.effects) ? prop.effects : (prop.effect ? [prop.effect] : []);
    return list.map(name => String(name || "")).filter(Boolean);
};

/*
 * Transform 3D Model: an offset (tiles), a turn (degrees) and a scale
 * (multipliers) laid over a model's placed pose, eased there over a number
 * of frames. Kept on the character (so it survives the sprite and the
 * save) and applied after the pose every frame; the footprint the game
 * walks against stays where the model was placed.
 */
Reactor3D.IDENTITY_TRANSFORM = function() {
    return { offset: [0, 0, 0], rotate: [0, 0, 0], scale: [1, 1, 1] };
};

/** The transform a character shows this frame, eased between the one it had and the one it was given. */
Reactor3D.liveTransformAt = function(state, frame) {
    if (!state) return null;
    const to = state.to, from = state.from || this.IDENTITY_TRANSFORM();
    const duration = Math.max(0, state.duration || 0);
    let t = duration > 0 ? (frame - state.frame) / duration : 1;
    t = Math.max(0, Math.min(1, t));
    // Ease in and out, so a move settles rather than stops.
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const mix = (a, b) => a + (b - a) * e;
    return {
        offset: [0, 1, 2].map(i => mix(from.offset[i], to.offset[i])),
        rotate: [0, 1, 2].map(i => mix(from.rotate[i], to.rotate[i])),
        scale: [0, 1, 2].map(i => mix(from.scale[i], to.scale[i])),
        done: t >= 1
    };
};

Reactor3D.applyLiveTransform = function(object, character) {
    const state = character && character._reactorTransform;
    if (!state || !object) return;
    const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
    const live = this.liveTransformAt(state, frame);
    if (!live) return;
    const r = Math.PI / 180;
    object.position.x += live.offset[0];
    object.position.y += live.offset[1];
    object.position.z += live.offset[2];
    object.rotation.y += live.rotate[0] * r;
    object.rotation.x += live.rotate[1] * r;
    object.rotation.z += live.rotate[2] * r;
    object.scale.x *= live.scale[0];
    object.scale.y *= live.scale[1];
    object.scale.z *= live.scale[2];
};

/** Give a character's model a transform to ease to over `duration` frames (0: at once). */
Reactor3D.transformModel = function(character, target, duration) {
    if (!character) return;
    const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
    const current = character._reactorTransform
        ? this.liveTransformAt(character._reactorTransform, frame) : this.IDENTITY_TRANSFORM();
    const vec = (value, fallback) => [0, 1, 2].map(i => {
        const n = Number(Array.isArray(value) ? value[i] : value);
        return Number.isFinite(n) ? n : fallback;
    });
    character._reactorTransform = {
        from: { offset: current.offset, rotate: current.rotate, scale: current.scale },
        to: { offset: vec(target && target.offset, 0), rotate: vec(target && target.rotate, 0), scale: vec(target && target.scale, 1).map(v => (v > 0 ? v : 1)) },
        frame,
        duration: Math.max(0, Math.round(Number(duration) || 0))
    };
};


//-----------------------------------------------------------------------------
// Scene character models and billboards

Reactor3D.MapScene.prototype.modelsGroup = function() {
    if (!this._modelsGroup) {
        this._modelsGroup = new THREE.Group();
        this._modelsGroup.name = "character-models";
        this._scene.add(this._modelsGroup);
    }
    return this._modelsGroup;
};

/** Billboards for above-characters events, rendered with the above pass. */
Reactor3D.MapScene.prototype.aboveBillboardsGroup = function() {
    if (!this._aboveBillboardsGroup) {
        this._aboveBillboardsGroup = new THREE.Group();
        this._aboveBillboardsGroup.name = "above-character-billboards";
        this._scene.add(this._aboveBillboardsGroup);
    }
    return this._aboveBillboardsGroup;
};

/**
 * Whether any event page on the map is set "Above characters". Read from the
 * raw data — every page, not only the active ones — because the above render
 * pass is created once at scene build and a page switch must not need it to
 * appear later.
 */
Reactor3D.mapHasAboveEvents = function(mapData) {
    const events = (mapData && mapData.events) || [];
    for (const event of events) {
        if (!event || !event.pages) continue;
        for (const page of event.pages) {
            if (page && page.priorityType === 2) return true;
        }
    }
    return false;
};

Reactor3D.MapScene.prototype.syncCharacterModels = function(characters) {
    if (typeof THREE === "undefined") return;
    const group = this.modelsGroup();
    if (!this._modelInstances) this._modelInstances = new Map();
    const live = new Set();
    // The camera is aimed for this frame before the models are synced;
    // distance levels are picked against where it stands.
    const lodViewport = Reactor3D.viewport();
    const lodCamera = lodViewport && lodViewport.camera ? lodViewport.camera() : null;
    const lodEye = lodCamera ? lodCamera.position : null;
    for (const character of characters || []) {
        const spec = Reactor3D.characterModelSpec(character);
        if (!spec) continue;
        const key = Reactor3D.modelInstanceKey(character);
        live.add(key);
        let holder = this._modelInstances.get(key);
        if (!holder) {
            holder = { character, spec: Reactor3D.modelCacheKey(spec.name, spec.ext, spec.file), object: null };
            this._modelInstances.set(key, holder);
            Promise.all([
                Reactor3D.loadModel(spec.name, spec.ext, spec.file, spec.texture),
                Reactor3D.loadModelSidecar(spec.name)
            ]).then(([template, sidecar]) => {
                if (!template || !this._modelsGroup) return;
                const current = this._modelInstances.get(key);
                if (current !== holder || current.spec !== Reactor3D.modelCacheKey(spec.name, spec.ext, spec.file)) return;
                Reactor3D.groundAnimatedTemplate(template, sidecar);
                const object = Reactor3D.cloneModelTemplate(template);
                Reactor3D.applyModelTransform(object, Reactor3D.readModelTransform(sidecar));
                object.userData.glbSize = template.userData.glbSize;
                // Carved parts (or the rig's bones) must exist before the
                // binding is prepared, or the new pieces would be invisible
                // to every rule. A rig and carved parts are exclusive: both
                // count mesh indices over the uncarved model.
                const rig = Reactor3D.readModelRig(sidecar);
                if (rig) {
                    Reactor3D.applyModelRig(object, rig);
                } else {
                    Reactor3D.carveModelParts(object, Reactor3D.readModelParts(sidecar));
                    Reactor3D.applyPivotOverrides(object, Reactor3D.readModelPivots(sidecar));
                }
                current.object = object;
                current.binding = Reactor3D.prepareModelInstance(object, object.__reactorClips);
                Reactor3D.bindModelLandmarks(object, Reactor3D.readModelLandmarks(sidecar));
                current.rules = sidecar ? Reactor3D.readModelAnimationRules(sidecar) : [];
                current.effects = sidecar ? Reactor3D.readModelEffects(sidecar) : [];
                group.add(object);
                // A prop never moves; its map is cached. An event walks.
                Reactor3D.Shadows.markCaster(object, !(typeof character.eventId === "function"
                    && character.eventId() >= Reactor3D.PROP_EVENT_BASE));
                // The shadow budget is measured from the player, not the eye.
                object.userData.reactorPlayer = typeof $gamePlayer !== "undefined" && character === $gamePlayer;
                object.traverse(child => {
                    const mats = child.material
                        ? (Array.isArray(child.material) ? child.material : [child.material])
                        : [];
                    for (const mat of mats) {
                        mat.__reactorModel = true;
                        mat.fog = false;
                        if (!mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
                        // Whatever loader or clone it came through, a model
                        // standing on a lit map takes the lights.
                        Reactor3D.litMaterial(mat);
                        if (this._materials.indexOf(mat) < 0) this._materials.push(mat);
                    }
                });
                this._ambientLevel = undefined;
            });
        }
        const object = holder.object;
        if (!object) continue;
        Reactor3D.resumeModelPlayback(holder, character, Reactor3D.currentFrame());
        const extent = object.userData.glbSize || { x: 1, y: 1, z: 1 };
        // Largest dimension, matching the collision footprint's rule.
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
        const fit = (spec.size > 0 ? spec.size : 2) / span;
        const scale = fit * (spec.scale > 0 ? spec.scale : 1);
        const stretch = spec.stretch || [1, 1, 1];
        const ground = Reactor3D.characterGround(
            typeof $dataMap !== "undefined" ? $dataMap : null, character);
        object.scale.set(scale * stretch[0], scale * stretch[1], scale * stretch[2]);
        if (lodEye) Reactor3D.pickLod(object, Reactor3D.instanceSpan(object), lodEye, holder.spec);
        Reactor3D.applyEventModelPose(object, spec, Reactor3D.characterModelDir8(character));
        // Facing is discrete, so the pose above pivots a long model 90 degrees
        // in one frame — the ends of a nine-tile vehicle teleport sideways.
        // Ease the visible yaw toward the pose's target along the shortest
        // arc; collision already accounts for both orientations of a turning
        // step, so only the drawing needs the swing.
        const targetYaw = object.rotation.y;
        if (holder.smoothYaw === undefined) {
            holder.smoothYaw = targetYaw;
        } else {
            const delta = Math.atan2(
                Math.sin(targetYaw - holder.smoothYaw),
                Math.cos(targetYaw - holder.smoothYaw));
            const maxStep = Reactor3D.MODEL_TURN_SPEED;
            holder.smoothYaw = Math.abs(delta) <= maxStep
                ? targetYaw
                : holder.smoothYaw + Math.sign(delta) * maxStep;
        }
        object.rotation.y = holder.smoothYaw;
        // Publish the heading the model is actually drawn at, so a light this
        // character carries swings with the mesh instead of snapping between
        // compass points. The spec's own yaw is an art correction for a model
        // authored facing the wrong way, not part of where the character
        // looks, so it comes back off.
        Reactor3D.noteModelFacing(character, holder.smoothYaw - (spec.yaw || 0));
        const offset = spec.offset || [0, 0, 0];
        object.position.set(character._realX + 0.5 + offset[0], ground + (character._reactorLift || 0) + offset[2], character._realY + 0.5 + offset[1]);
        holder.cameraBaseX = character._realX;
        holder.cameraBaseY = ground + (character._reactorLift || 0);
        holder.cameraBaseZ = character._realY;
        Reactor3D.applyLiveTransform(object, character);
        // Face Ceiling / Face Ground and Rotate route steps. Local axes,
        // after the facing yaw: a model falls onto its own back or face
        // whichever way it points, and rolls the way a sprite would turn.
        const posePitch = character._reactorPosePitch || 0;
        const poseSpin = character._reactorSpin || 0;
        if (posePitch) object.rotateX(-posePitch * Math.PI / 2);
        if (poseSpin) object.rotateZ(-poseSpin * Math.PI / 180);
        object.visible = !(character.isTransparent && character.isTransparent())
            && !Reactor3D.characterHiddenByCamera(character, true);
        Reactor3D.registerPluginCommands();
        if (holder.binding && holder.rules && holder.rules.length) {
            let frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
            const distance = holder.lastX === undefined
                ? 0
                : Math.hypot(character._realX - holder.lastX, character._realY - holder.lastY);
            holder.lastX = character._realX;
            holder.lastY = character._realY;
            frame = Reactor3D.advanceModelAction(holder, character, frame);
            if (Reactor3D.updateModelFlash(holder)) this._ambientLevel = undefined;
            Reactor3D.applyModelAnimation(holder.binding, holder.rules, {
                frame,
                moving: !!(character.isMoving && character.isMoving()) || distance > 0.0001,
                // Followers keep the party leader's gait: their own
                // isDashing is the CharacterBase stub and never true.
                dashing: typeof Game_Follower !== "undefined" && character instanceof Game_Follower
                    ? $gamePlayer.isDashing()
                    : !!(character.isDashing && character.isDashing()),
                distance,
                scale,
                playbackRate: holder.playbackRate,
                action: holder.action || null
            });
        }
        // After the animation pass: a clip writes every bone each frame, so
        // the look's lean goes on top of whatever the head was doing.
        Reactor3D.applyLookLean(object, character);
        // Effects run for every placed model, rules or none: a reactor with
        // no animation of its own still plays its core glow. Asked for by
        // name (the Play 3D Effect command, a rule that names one), by
        // state (their trigger), and the anchored animations they left.
        if (holder.effects && holder.effects.length) {
            const moving = !!(character.isMoving && character.isMoving())
                || (holder.lastX !== undefined && (character._realX !== holder.lastX || character._realY !== holder.lastY));
            for (const name of Reactor3D.takeModelEffects(character)) {
                const definition = Reactor3D.modelEffectByName(holder.effects, name);
                // An effect that plays on its own by trigger is not also
                // fired by name, or a prop's "always" glow would play twice.
                if (definition && definition.trigger !== "action") continue;
                Reactor3D.fireNamedEffect(definition, character, holder);
            }
            Reactor3D.updateTriggeredEffects(holder, character, {
                moving,
                dashing: typeof Game_Follower !== "undefined" && character instanceof Game_Follower
                    ? $gamePlayer.isDashing()
                    : !!(character.isDashing && character.isDashing())
            });
            Reactor3D.updateAnchoredAnimations(holder);
            if (!(holder.binding && holder.rules && holder.rules.length)) {
                holder.lastX = character._realX;
                holder.lastY = character._realY;
                if (Reactor3D.updateModelFlash(holder)) this._ambientLevel = undefined;
            }
        }
    }
    for (const [key, holder] of this._modelInstances) {
        if (live.has(key)) continue;
        if (holder.object && holder.object.parent) holder.object.parent.remove(holder.object);
        this._modelInstances.delete(key);
    }
};

Reactor3D.MapScene.prototype.syncCharacterBillboards = function(sprites) {
    if (typeof THREE === "undefined") return;
    if (typeof $dataMap === "undefined" || !Reactor3D.hasEventModels($dataMap)) {
        this._clearCharacterBillboards();
        return;
    }
    const group = this.modelsGroup();
    if (!this._billboards) this._billboards = new Map();
    const live = new Set();
    for (const sprite of sprites || []) {
        const character = sprite && sprite._character;
        if (!character) continue;
        if (Reactor3D.hasCharacterModel(character)) continue;
        if (typeof character.eventId === "function" && Reactor3D.isEventProp(character.eventId())) continue;
        if (sprite.isEmptyCharacter && sprite.isEmptyCharacter()) continue;
        const key = typeof character.eventId === "function"
            ? "e" + character.eventId()
            : (typeof $gamePlayer !== "undefined" && character === $gamePlayer
                ? "p"
                : "c" + (character._memberIndex != null ? character._memberIndex : live.size));
        live.add(key);
        let holder = this._billboards.get(key);
        if (!holder) {
            // The material starts on an empty texture and is pointed at the
            // character's sheet on the first update; every character on the
            // same sheet shares that one upload, and a frame change moves
            // the texture's offset/repeat instead of copying pixels.
            const texture = new THREE.Texture();
            if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
            const geometry = new THREE.PlaneGeometry(1, 1);
            geometry.translate(0, 0.5, 0);
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                depthTest: true,
                depthWrite: true,
                alphaTest: 0.35,
                side: THREE.DoubleSide,
                // Flat quads: one pass. three renders a double-sided transparent
                // material twice a frame otherwise, toggling needsUpdate each time,
                // which rebuilds its shader parameters every frame.
                forceSinglePass: true,
                fog: false
            });
            // The quad is leaned towards the camera, which tips its upper half
            // into whatever stands on the tiles behind it — a sprite in front
            // of a car lost its head to the car's depth buffer. Depth is
            // written as if the quad stood bolt upright at its anchor instead:
            // rays cross a vertical plane in true north/south order, so in
            // front and behind settle per pixel against any mesh while the
            // drawn shape keeps its lean.
            Reactor3D.straightenBillboardDepth(material);
            Reactor3D.litMaterial(material);
            const object = new THREE.Mesh(geometry, material);
            group.add(object);
            // The quad leans towards the camera; seen from a light it is a
            // cut-out of the sprite, which is the shadow a sprite should cast.
            Reactor3D.Shadows.markCaster(object, true);
            holder = { texture, geometry, object, stamp: "", view: null, above: false };
            this._billboards.set(key, holder);
        }
        this._updateCharacterBillboard(holder, sprite, character);
    }
    for (const [key, holder] of this._billboards) {
        if (live.has(key)) continue;
        if (holder.object && holder.object.parent) holder.object.parent.remove(holder.object);
        // Sheet textures are shared and cached; a billboard's own view of one is disposed with it.
        if (holder.view) holder.view.dispose();
        else if (holder.texture && !holder.texture.__reactorSheet) holder.texture.dispose();
        if (holder.geometry) holder.geometry.dispose();
        if (holder.object && holder.object.material) holder.object.material.dispose();
        this._billboards.delete(key);
    }
};

/**
 * One three texture per character sheet, uploaded once. Keyed by the
 * bitmap; a sheet whose pixels are replaced (it finished loading) gets a
 * fresh texture.
 */
Reactor3D.sheetTextureFor = function(bitmap) {
    const src = bitmap && (bitmap.canvas || bitmap._canvas || bitmap._image);
    if (!src) return null;
    const cache = this._sheetTextures || (this._sheetTextures = new WeakMap());
    let entry = cache.get(bitmap);
    if (!entry || entry.src !== src) {
        const texture = new THREE.Texture(src);
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        texture.__reactorSheet = true;
        entry = { src, texture };
        cache.set(bitmap, entry);
    }
    return entry.texture;
};

/**
 * A billboard's frame lives in its texture's offset/repeat, and the sheet
 * is shared, so each billboard reads the sheet through a clone that
 * shares the sheet's image. three keys GL uploads by the image's source,
 * so the clones cost one upload between them; a frame change is two
 * uniforms.
 */
Reactor3D.billboardView = function(holder, sheet) {
    let view = holder.view;
    if (!view || view.image !== sheet.image) {
        if (view) view.dispose();
        view = sheet.clone();
        view.__reactorSheet = false;
        view.needsUpdate = true;
        holder.view = view;
        holder.texture = view;
        const material = holder.object.material;
        material.map = view;
        material.needsUpdate = true;
    }
    return view;
};

Reactor3D.MapScene.prototype._updateCharacterBillboard = function(holder, sprite, character) {
    const bitmap = sprite.bitmap;
    const frame = sprite._frame;
    const ready = bitmap && (!bitmap.isReady || bitmap.isReady())
        && frame && frame.width > 0 && frame.height > 0;
    const hidden = (character.isTransparent && character.isTransparent())
        || Reactor3D.characterHiddenByCamera(character);
    holder.object.visible = !!(ready && !hidden);
    if (!ready) return;
    const mirrored = !!(sprite.scale && sprite.scale.x < 0);
    const stamp = [
        bitmap.url || bitmap._url || "",
        frame.x, frame.y, frame.width, frame.height,
        mirrored ? 1 : 0
    ].join(":");
    if (holder.stamp !== stamp) {
        holder.stamp = stamp;
        const sheet = Reactor3D.sheetTextureFor(bitmap);
        if (sheet && sheet.image) {
            const view = Reactor3D.billboardView(holder, sheet);
            // flipY textures count v from the bottom: the frame's top row is
            // 1 - (y + h) / H up. A mirrored sprite reads its columns right
            // to left with a negative repeat.
            const W = sheet.image.width || 1;
            const H = sheet.image.height || 1;
            const u0 = frame.x / W;
            const uw = frame.width / W;
            view.repeat.set(mirrored ? -uw : uw, frame.height / H);
            view.offset.set(mirrored ? u0 + uw : u0, 1 - (frame.y + frame.height) / H);
        }
    }
    const map = typeof $gameMap !== "undefined" ? $gameMap : null;
    const tw = map && map.tileWidth ? map.tileWidth() : 48;
    const th = map && map.tileHeight ? map.tileHeight() : 48;
    holder.object.scale.set(frame.width / tw, frame.height / th, 1);
    const ground = Reactor3D.characterGround(
        typeof $dataMap !== "undefined" ? $dataMap : null, character);
    const viewport = Reactor3D.viewport();
    const camera = viewport && viewport.camera && viewport.camera();
    // The same half-cell step towards the camera the tile cut-out shader
    // takes (`footward`), for the same reason — and, more than that, so a
    // character billboard and the tile art on its cell keep the alignment
    // they were authored with in 2D. Without it a console screen event
    // drifted off its tile-drawn pedestal as the camera crossed the map:
    // the pedestal's anchor slid with the view while the event's stood
    // still, and only agreed at dead centre.
    let footX = 0;
    let footZ = 0;
    if (camera && camera.matrixWorld) {
        const e = camera.matrixWorld.elements;
        const reach = Math.hypot(e[8], e[10]);
        if (reach > 0.0001) {
            footX = (e[8] / reach) * 0.5;
            footZ = (e[10] / reach) * 0.5;
        }
    }
    let baseX = character._realX + 0.5 + footX;
    let baseY = ground;
    let baseZ = character._realY + 0.5 + footZ;
    // A decoration drawn over the scene follows the art it decorates. If its
    // cell was stood into a facade, the builder recorded where that wall's
    // plane is and how far up it the cell sits (`facadeAt`); anchoring there,
    // lifted along the same leaning up axis the wall's quads use, keeps a
    // console screen glued to its tile-drawn pedestal from every camera
    // position. Left at its own row it sat a tile nearer the camera than the
    // art it belongs to and slid against it as the view crossed the map.
    // A stationary event standing on a cell whose art was stood into a
    // facade belongs to that facade, whatever its priority: in 2D the event
    // simply draws over the tile art on its own cell, and the 3D equivalent
    // is sitting on the same wall plane, whatever way it leans. The player
    // and anything mid-step stay on the ground — a character walking under
    // an archway must not snap onto its wall.
    let depthLift = 0;
    let snapped = false;
    if (typeof character.eventId === "function"
        && !(character.isMoving && character.isMoving())) {
        const facade = Reactor3D.facadeAt(
            Math.round(character._realX), Math.round(character._realY));
        if (facade) {
            snapped = true;
            baseY = facade.height;
            baseZ = facade.z + footZ;
            const up = camera ? Reactor3D.billboardUp(camera) : null;
            if (up && facade.lift) {
                baseX += up.x * facade.lift;
                baseY += up.y * facade.lift;
                baseZ += up.z * facade.lift;
                depthLift = facade.lift;
            }
        }
    }
    // A walking character standing on a facade's footprint wins against
    // that wall: their cell's art draws under them in 2D, so their depth is
    // pushed just in front of the wall's plane while their drawn position
    // stays put. Off the footprint, real depth rules — genuinely behind the
    // structure still means hidden. This is the bias that lets a player
    // pressed right up against a console, or crossing a machine's apron
    // rows, stay visible instead of sinking behind art rooted south of them.
    let shiftX = 0;
    let shiftZ = 0;
    if (!snapped) {
        // The nearest facade plane among the cells the sprite overlaps: the
        // one underfoot, its east/west neighbours, and the head row. A large
        // structure's facade splits into runs with different base rows, and
        // clearing only the run underfoot left the head clipped by the
        // neighbouring run's art one plane nearer. Cells south of the
        // character are never sampled, so standing genuinely behind a wall
        // still hides.
        const rx = Math.round(character._realX);
        const ry = Math.round(character._realY);
        let planeZ = null;
        for (let dy = -1; dy <= 0; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const facade = Reactor3D.facadeAt(rx + dx, ry + dy);
                if (facade && (planeZ === null || facade.z > planeZ)) {
                    planeZ = facade.z;
                }
            }
        }
        if (planeZ !== null) {
            const towardX = footX * 2;
            const towardZ = footZ * 2;
            const aheadZ = planeZ + footZ + towardZ * 0.35;
            // Only ever push towards the camera: a plane already behind the
            // character must not drag their depth backwards.
            if (aheadZ - baseZ > 0) {
                shiftX = towardX * 0.35;
                shiftZ = aheadZ - baseZ;
            }
        }
    }
    // Depth-test as part of the wall it sits on: the twin walks the lift
    // back to the facade base (see straightenBillboardDepth).
    const userData = holder.object.material.userData || {};
    if (userData.rrDepthLift) userData.rrDepthLift.value = depthLift;
    if (userData.rrDepthShiftX) userData.rrDepthShiftX.value = shiftX;
    if (userData.rrDepthShiftZ) userData.rrDepthShiftZ.value = shiftZ;
    // Snapped onto a wall, the billboard is coplanar with the wall's own
    // quads; a depth bias pulls it just ahead of them — over its pedestal,
    // never over a genuinely nearer character, who wins by real depth.
    const biased = snapped || character._priorityType === 2;
    if (holder.biased !== biased) {
        holder.biased = biased;
        holder.object.material.polygonOffset = biased;
        holder.object.material.polygonOffsetFactor = biased ? -4 : 0;
        holder.object.material.polygonOffsetUnits = biased ? -4 : 0;
        holder.object.renderOrder = biased ? 2 : 0;
        holder.object.material.needsUpdate = true;
    }
    holder.object.position.set(baseX, baseY, baseZ);
    Reactor3D.aimCharacterBillboard(holder.object, camera);
};

Reactor3D.MapScene.prototype._clearCharacterBillboards = function() {
    if (!this._billboards) return;
    for (const holder of this._billboards.values()) {
        if (holder.object && holder.object.parent) holder.object.parent.remove(holder.object);
        // Sheet textures are shared and cached; a billboard's own view of one is disposed with it.
        if (holder.view) holder.view.dispose();
        else if (holder.texture && !holder.texture.__reactorSheet) holder.texture.dispose();
        if (holder.geometry) holder.geometry.dispose();
        if (holder.object && holder.object.material) holder.object.material.dispose();
    }
    this._billboards.clear();
};

const _reactorClearModels = Reactor3D.MapScene.prototype.clear;
Reactor3D.MapScene.prototype.clear = function() {
    if (this._modelInstances) {
        for (const holder of this._modelInstances.values()) {
            Reactor3D.pauseModelPlayback(holder);
            if (holder.object && holder.object.parent) holder.object.parent.remove(holder.object);
        }
        this._modelInstances.clear();
    }
    this._clearCharacterBillboards();
    if (this._modelsGroup && this._modelsGroup.parent) {
        this._modelsGroup.parent.remove(this._modelsGroup);
    }
    this._modelsGroup = null;
    if (this._aboveBillboardsGroup && this._aboveBillboardsGroup.parent) {
        this._aboveBillboardsGroup.parent.remove(this._aboveBillboardsGroup);
    }
    this._aboveBillboardsGroup = null;
    return _reactorClearModels.apply(this, arguments);
};

// Models' pass visibility lives in setPass itself now. A tail wrapper used to
// re-clamp _modelsGroup to the below/all passes, which silently overrode any
// new pass the base method learned — the "world" pass rendered an empty
// models group and every character and vehicle vanished.

//-----------------------------------------------------------------------------
// Model props
//
// A 3D model placed on the map from the palette rather than through an event:
// a console, a crate, a lamp post. The sidecar keeps them as `reactor3d.props`
// — `{ id, name, ext, file, texture, x, y, z, yaw, pitch, roll, direction,
// size, scale, passable }`, position in tiles (fractional in 3D), z a lift off
// the ground in tiles, angles in degrees, size the model's longest side in
// tiles like an event model's.
//
// The running game does not learn a second kind of thing. A prop becomes a
// synthetic event bound to its model when the sidecar loads: the model-bound
// event machinery already draws it (as a mesh in 3D, as a sprite on a flat
// map), poses it by direction, and blocks movement over its footprint. Ids
// start at PROP_EVENT_BASE so they never meet an authored event, and nothing
// about them is written back to Map###.json.
//-----------------------------------------------------------------------------

Reactor3D.PROP_EVENT_BASE = 10000;
Reactor3D.PROP_MAX_LIFT = 512;

Reactor3D.normalizeProp = function(raw, mapData) {
    if (!raw || typeof raw !== "object" || !raw.name) return null;
    const number = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const width = mapData && mapData.width > 0 ? mapData.width : Infinity;
    const height = mapData && mapData.height > 0 ? mapData.height : Infinity;
    const direction = Number(raw.direction);
    const size = number(raw.size, 2);
    const scale = number(raw.scale, 1);
    const animations = this.propAnimationList(raw), effects = this.propEffectList(raw);
    return {
        id: Math.max(1, Math.floor(number(raw.id, 1))),
        name: String(raw.name),
        ext: raw.ext ? String(raw.ext) : "",
        file: raw.file ? String(raw.file) : "",
        texture: raw.texture ? String(raw.texture) : "",
        x: Math.max(0, Math.min(width - 1, number(raw.x, 0))),
        y: Math.max(0, Math.min(height - 1, number(raw.y, 0))),
        z: Math.max(0, Math.min(this.PROP_MAX_LIFT, number(raw.z, 0))),
        yaw: number(raw.yaw, 0),
        pitch: number(raw.pitch, 0),
        roll: number(raw.roll, 0),
        direction: [2, 4, 6, 8].indexOf(direction) >= 0 ? direction : 2,
        size: size > 0 ? size : 2,
        scale: scale > 0 ? scale : 1,
        passable: raw.passable === true || raw.passable === "true",
        // An action rule and an effect the prop starts with, by name.
        animations, animation: animations[0] || "",
        animationSpeed: Math.max(1, Math.min(1000, number(raw.animationSpeed, 100))),
        repeat: raw.repeat === true || raw.repeat === "true",
        effects, effect: effects[0] || ""
    };
};

/** The map's props, validated, in sidecar order. */
Reactor3D.mapProps = function(mapData) {
    const sidecar = mapData && mapData.reactor3d;
    const list = sidecar && Array.isArray(sidecar.props) ? sidecar.props : [];
    const props = [];
    for (const raw of list) {
        const prop = this.normalizeProp(raw, mapData);
        if (prop) props.push(prop);
    }
    return props;
};

/** The model spec a prop binds its event to, in the sidecar's own shape. */
Reactor3D.propModelSpec = function(prop) {
    return {
        name: prop.name, ext: prop.ext, file: prop.file, texture: prop.texture,
        size: prop.size, scale: prop.scale, stretch: prop.stretch,
        yaw: prop.yaw, pitch: prop.pitch, roll: prop.roll
    };
};

/** The event a prop stands in the map as. */
Reactor3D.propEvent = function(prop) {
    const id = this.PROP_EVENT_BASE + prop.id;
    return {
        id: id,
        name: "Prop: " + prop.name,
        note: "",
        meta: {},
        x: Math.round(prop.x),
        y: Math.round(prop.y),
        // What the game reads back to place it between tiles and off the ground.
        reactorProp: prop,
        pages: [{
            conditions: {
                actorId: 1, actorValid: false, itemId: 1, itemValid: false,
                selfSwitchCh: "A", selfSwitchValid: false,
                switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
                variableId: 1, variableValid: false, variableValue: 0
            },
            directionFix: true,
            image: { characterIndex: 0, characterName: "", direction: prop.direction, pattern: 1, tileId: 0 },
            list: [{ code: 0, indent: 0, parameters: [] }],
            moveFrequency: 3,
            moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
            moveSpeed: 3,
            moveType: 0,
            priorityType: 1,
            stepAnime: false,
            through: prop.passable,
            trigger: 0,
            walkAnime: false
        }]
    };
};

/**
 * Stand the map's props in it as model-bound events. Idempotent per map
 * object; returns how many were placed.
 */
Reactor3D.installProps = function(mapData) {
    if (!mapData || !Array.isArray(mapData.events) || mapData.__reactorPropsInstalled) return 0;
    mapData.__reactorPropsInstalled = true;
    const props = this.mapProps(mapData);
    if (!props.length) return 0;
    const sidecar = mapData.reactor3d;
    if (!sidecar.events || typeof sidecar.events !== "object") sidecar.events = {};
    let placed = 0;
    for (const prop of props) {
        const event = this.propEvent(prop);
        if (mapData.events[event.id]) continue;
        mapData.events[event.id] = event;
        sidecar.events[String(event.id)] = { "0": this.propModelSpec(prop) };
        placed++;
    }
    return placed;
};

/** Whether an event is a prop the sidecar stood in the map. */
Reactor3D.isPropEvent = function(eventData) {
    return !!(eventData && eventData.reactorProp);
};

/**
 * After `Game_Map.setupEvents`: a prop's event stands where the prop was
 * put, between tiles if it was placed freely, and lifted off the ground.
 */
/*
 * Height: the third coordinate.
 *
 * A character's height above its cell's ground, in tiles, is
 * `_reactorLift` (props had it as their lift; every character has it now).
 * It is saved with the character, moves smoothly toward `_reactorZTarget`
 * like `_realX` toward `_x`, and comes from the sidecar for events
 * (`reactor3d.eventZ[id]`). On a flat map it is kept and does nothing.
 * Collision is by vertical overlap: two characters block each other only
 * while their height ranges cross.
 */
Reactor3D.VERTICAL_CEILING = 64;

Reactor3D.eventZAt = function(mapData, eventId) {
    const store = mapData && mapData.reactor3d && mapData.reactor3d.eventZ;
    const z = store ? Number(store[String(eventId)]) : 0;
    return Number.isFinite(z) && z > 0 ? z : 0;
};

Reactor3D.setEventZ = function(mapData, eventId, z) {
    if (!mapData || !eventId) return;
    const value = Math.round(Math.max(0, Math.min(this.VERTICAL_CEILING * 8, Number(z) || 0)) * 100) / 100;
    if (!value) {
        if (mapData.reactor3d && mapData.reactor3d.eventZ) {
            delete mapData.reactor3d.eventZ[String(eventId)];
            if (!Object.keys(mapData.reactor3d.eventZ).length) delete mapData.reactor3d.eventZ;
        }
        return;
    }
    if (!mapData.reactor3d || typeof mapData.reactor3d !== "object") mapData.reactor3d = { version: 1, mode: this.MODE_3D };
    if (!mapData.reactor3d.eventZ || typeof mapData.reactor3d.eventZ !== "object") mapData.reactor3d.eventZ = {};
    mapData.reactor3d.eventZ[String(eventId)] = value;
};

/** The height a character may rise to: the room's ceiling, else a tall default. */
Reactor3D.verticalCeiling = function() {
    const map = typeof $dataMap !== "undefined" ? $dataMap : null;
    const room = map && this.roomFor ? this.roomFor(map) : null;
    return room && room.height > 0 ? room.height : this.VERTICAL_CEILING;
};

/** How tall a character stands, in tiles: its model's height, else a sprite's tile and a half. */
Reactor3D.characterHeightTiles = function(character) {
    const spec = character && this.characterModelSpec ? this.characterModelSpec(character) : null;
    if (spec) {
        const entry = this._glbCache && this._glbCache[this.modelCacheKey(spec.name, spec.ext, spec.file)];
        const extent = entry && entry.template && entry.template.userData.glbSize;
        if (extent) {
            const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
            const stretch = spec.stretch || [1, 1, 1];
            return Math.max(0.25, extent.y / span * (spec.size > 0 ? spec.size : 2) * (spec.scale > 0 ? spec.scale : 1) * stretch[1]);
        }
        return Math.max(0.25, spec.size > 0 ? spec.size : 2);
    }
    return 1.5;
};

/** Whether two characters' height ranges cross; on a flat map (all heights 0) always. */
Reactor3D.charactersOverlapVertically = function(a, b) {
    if (!a || !b) return true;
    const za = a._reactorLift || 0, zb = b._reactorLift || 0;
    if (!za && !zb) return true;
    const ha = this.characterHeightTiles(a), hb = this.characterHeightTiles(b);
    return za < zb + hb - 1e-6 && zb < za + ha - 1e-6;
};

Reactor3D.installVerticalMotion = function() {
    if (typeof Game_CharacterBase === "undefined" || Game_CharacterBase.prototype.__reactorVertical) return;
    const proto = Game_CharacterBase.prototype;
    proto.__reactorVertical = true;
    proto.reactorZ = function() { return this._reactorLift || 0; };
    /** Rise (or, negative, descend) by `tiles`, smoothly, within the floor and the ceiling. */
    proto.reactorRise = function(tiles) {
        const goal = (this._reactorZTarget != null ? this._reactorZTarget : this.reactorZ()) + (Number(tiles) || 0);
        this.reactorSetHeight(goal);
    };
    proto.reactorSetHeight = function(z) {
        const ceiling = Reactor3D.verticalCeiling();
        this._reactorZTarget = Math.round(Math.max(0, Math.min(ceiling, Number(z) || 0)) * 1000) / 1000;
    };
    proto.reactorVerticalPending = function() {
        return this._reactorZTarget != null && Math.abs(this._reactorZTarget - this.reactorZ()) > 1e-6;
    };
    /** Lie facing the ceiling (1) or the ground (-1), or stand back up (0) — a bed, a knockout. */
    proto.reactorFacePose = function(pose) {
        this._reactorPosePitch = pose > 0 ? 1 : pose < 0 ? -1 : 0;
    };
    /** Turn the drawn character to `degrees` on screen; a model rolls the same way. 0 stands it straight. */
    proto.reactorRotate = function(degrees) {
        this._reactorSpin = Number(degrees) || 0;
    };
    const baseIsMoving = proto.isMoving;
    proto.isMoving = function() {
        return baseIsMoving.call(this) || this.reactorVerticalPending();
    };
    const baseUpdateMove = proto.updateMove;
    proto.updateMove = function() {
        if (this.reactorVerticalPending()) {
            const step = this.distancePerFrame();
            const z = this.reactorZ(), goal = this._reactorZTarget;
            this._reactorLift = goal > z ? Math.min(z + step, goal) : Math.max(z - step, goal);
            if (!(this._reactorLift > 0)) this._reactorLift = 0;
        }
        baseUpdateMove.call(this);
    };
    const baseCollided = proto.isCollidedWithEvents;
    proto.isCollidedWithEvents = function(x, y) {
        if (typeof $gameMap === "undefined" || !$gameMap || !$gameMap.eventsXyNt) return baseCollided.call(this, x, y);
        const events = $gameMap.eventsXyNt(x, y);
        return events.some(event => event.isNormalPriority() && Reactor3D.charactersOverlapVertically(this, event));
    };
    if (typeof Game_Event !== "undefined" && Game_Event.prototype.isCollidedWithPlayerCharacters) {
        const basePlayer = Game_Event.prototype.isCollidedWithPlayerCharacters;
        Game_Event.prototype.isCollidedWithPlayerCharacters = function(x, y) {
            if (typeof $gamePlayer !== "undefined" && $gamePlayer && !Reactor3D.charactersOverlapVertically(this, $gamePlayer)) return false;
            return basePlayer.call(this, x, y);
        };
    }
};

/**
 * In a room (`reactor3d.room`) the floor is the parallax plane, so a cell
 * with no tile painted is still floor: RPG Maker's rule that an empty
 * cell cannot be walked on kept the player a room's width from a model
 * standing on bare floor.
 */
Reactor3D.installRoomFloorPassage = function() {
    if (typeof Game_Map === "undefined" || !Game_Map.prototype.checkPassage
        || Game_Map.prototype.checkPassage.__reactorRoom) return;
    const baseCheckPassage = Game_Map.prototype.checkPassage;
    Game_Map.prototype.checkPassage = function(x, y, bit) {
        if (typeof $dataMap !== "undefined" && $dataMap && Reactor3D.roomFor($dataMap) && Reactor3D.isMap3D($dataMap)) {
            const flags = this.tilesetFlags();
            const solid = this.allTiles(x, y).some(tile => tile > 0 && (flags[tile] & 0x10) === 0);
            if (!solid) return true;
        }
        return baseCheckPassage.call(this, x, y, bit);
    };
    Game_Map.prototype.checkPassage.__reactorRoom = true;
};

Reactor3D.installPropHooks = function() {
    Reactor3D.installRoomFloorPassage();
    Reactor3D.installVerticalMotion();
    if (typeof Game_Map === "undefined" || !Game_Map.prototype.setupEvents
        || Game_Map.prototype.setupEvents.__reactorProps) return;
    const baseSetupEvents = Game_Map.prototype.setupEvents;
    Game_Map.prototype.setupEvents = function() {
        const result = baseSetupEvents.apply(this, arguments);
        const events = this._events || [];
        // Events start at the height the sidecar gives them.
        const mapData = typeof $dataMap !== "undefined" ? $dataMap : null;
        for (let i = 1; i < Math.min(events.length, Reactor3D.PROP_EVENT_BASE); i++) {
            const event = events[i];
            if (!event) continue;
            const z = Reactor3D.eventZAt(mapData, i);
            if (z > 0) { event._reactorLift = z; event._reactorZTarget = z; }
        }
        for (let i = Reactor3D.PROP_EVENT_BASE; i < events.length; i++) {
            const event = events[i];
            const data = event && event.event ? event.event() : null;
            const prop = data && data.reactorProp;
            if (!prop) continue;
            event._realX = prop.x;
            event._realY = prop.y;
            event._reactorLift = prop.z;
            // Directly: the synthetic page carries direction-fix, and under
            // it setDirection is a silent no-op — the stored facing must win
            // over whatever the page dance left behind.
            event.setDirection(prop.direction);
            event._direction = prop.direction;
            const animations = Reactor3D.propAnimationList(prop);
            if (animations.length) Reactor3D.playModelSequence(event, animations, !!prop.repeat);
            for (const name of Reactor3D.propEffectList(prop)) Reactor3D.playModelEffect(event, name);
            // A character whose real position differs from its cell is one
            // mid-step, and the stock update slides it home every frame. A
            // prop placed between tiles is not mid-step: it stands there.
            event.isMoving = function() { return false; };
            event.updateMove = function() {};
        }
        return result;
    };
    Game_Map.prototype.setupEvents.__reactorProps = true;
};

Reactor3D.Models = { file: "reactor_3d_models.js" };
})(typeof globalThis !== "undefined" ? globalThis : this);
