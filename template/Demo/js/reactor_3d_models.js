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
        roll: number("roll", 0) * Math.PI / 180,
        ...((body.match(/variant\s*\(\s*([^)]+?)\s*\)/i) || [])[1] ? { variant: body.match(/variant\s*\(\s*([^)]+?)\s*\)/i)[1] } : null)
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
    if (known && known.forName === spec.name && known.forExt === spec.ext && known.forVariant === spec.variant) return known.value;
    const value = this._normalizeModelSpecNow(spec);
    cache.set(spec, { forName: spec.name, forExt: spec.ext, forVariant: spec.variant, value });
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
    // Which of the model's variants this use wears (its color, texture,
    // surface and media): only on a use that names one.
    const variant = typeof spec.variant === "string" && spec.variant.trim() ? { variant: spec.variant.trim() } : null;
    return {
        ...variant,
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
    if (typeof spec.variant === "string" && spec.variant.trim()) written.variant = spec.variant.trim();
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
    return this.variantSpecOf(character, this._characterModelSpec(character));
};

Reactor3D._characterModelSpec = function(character) {
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
    // A battle test reads the Test_ copy the editor wrote from its unsaved database, when it wrote one.
    const testing = typeof DataManager !== "undefined" && typeof DataManager.isBattleTest === "function" && DataManager.isBattleTest();
    const urls = testing ? [this.DATABASE_SIDECAR_URL.replace(/([^/]+)$/, "Test_$1"), this.DATABASE_SIDECAR_URL] : [this.DATABASE_SIDECAR_URL];
    // The absent file is the normal state for most projects; ask the disk
    // first so it never logs an unsuppressible network error.
    if (typeof Utils !== "undefined" && Utils.isNwjs()) {
        try {
            const fs = require("fs");
            const path = require("path");
            for (const url of urls) {
                const full = path.join(path.dirname(process.mainModule.filename), url);
                if (fs.existsSync(full)) return finish(JSON.parse(fs.readFileSync(full, "utf8")));
            }
            return finish(null);
        } catch (error) {
            return finish(null);
        }
    }
    const request = index => {
        const xhr = new XMLHttpRequest();
        const next = () => (index + 1 < urls.length ? request(index + 1) : finish(null));
        xhr.open("GET", urls[index]);
        xhr.overrideMimeType("application/json");
        xhr.onload = () => {
            if (xhr.status >= 400) return next();
            try {
                finish(JSON.parse(xhr.responseText));
            } catch (error) {
                finish(null);
            }
        };
        xhr.onerror = next;
        xhr.send();
    };
    request(0);
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
        // What a battle here will show, readied under the same fade (a preparation, never a reason to fail the load).
        let battle = null;
        try { battle = this.preloadBattleModels(mapData); } catch (error) { battle = null; }
        const settled = battle ? battle.catch(() => null) : Promise.resolve(null);
        return settled.then(() => Promise.all(specs.map(spec => Promise.all([
            this.loadModel(spec.name, spec.ext, spec.file, spec.texture),
            this.loadModelSidecar(spec.name)
        ]).then(loaded => {
            // The collision footprint costs a walk over every triangle
            // (a third of a second on a three-million-triangle model);
            // taken here, under the loading fade, not on the first step
            // beside it.
            try { this.modelCollisionMask(spec); } catch (error) { /* the box remains */ }
            this.boundModelTemplate(loaded[0]);
            return loaded;
        }))).then(loaded => {
            // One model at another size (a captain a fifth taller than his men) has a footprint of its own, kept per
            // pose: taken here too, or it was walked out on the frame its event first stood on the map (a battle's first).
            for (const spec of this.collectMapPoseSpecs(mapData)) { try { this.modelCollisionMask(spec); } catch (error) { /* the box remains */ } }
            return loaded;
        }));
    });
};

/** Every size and pose the map's events give their models, one spec for each (a footprint is kept per pose). */
/**
 * A loaded model's rest bounds, worked out while the map loads: every copy, finger skin and detail level takes them
 * from the model's own geometry, and the first thing to ask for a missing box (the lit region, on the frame a
 * battle's units appear) walked every vertex of it there and then.
 */
Reactor3D.boundModelTemplate = function(template) {
    if (!template || typeof template.traverse !== "function") return template;
    template.traverse(child => {
        const geometry = child.isMesh ? child.geometry : null;
        if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
        try {
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        } catch (error) { /* asked for when first needed, as before */ }
    });
    return template;
};

Reactor3D.collectMapPoseSpecs = function(mapData) {
    const specs = [], seen = new Set();
    const events = (mapData && mapData.reactor3d && mapData.reactor3d.events) || {};
    for (const pages of Object.values(events)) {
        for (const raw of Object.values(pages || {})) {
            const spec = this.normalizeModelSpec(raw);
            const key = spec && this.collisionKeysFor(spec).pose;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            specs.push(spec);
        }
    }
    return specs;
};

/**
 * The models a battle on this map will bring that the map itself does not
 * place: the Database models of the records its unit events and Spawn Unit
 * commands name (`units`), and the weapon models the party and those actors
 * carry (`held`). Deduped by cache key, each list on its own.
 */
Reactor3D.collectBattleModelSpecs = function(mapData) {
    const out = { units: [], held: [] }, seen = { units: new Set(), held: new Set() };
    const add = (list, raw) => {
        const spec = this.normalizeModelSpec(raw);
        if (!spec) return;
        const key = this.modelCacheKey(spec.name, spec.ext, spec.file);
        if (seen[list].has(key)) return;
        seen[list].add(key);
        out[list].push(spec);
    };
    const carried = battler => {
        const weapons = battler && typeof battler.weapons === "function" ? battler.weapons() : [];
        for (const weapon of weapons || []) if (weapon) add("held", this.databaseModelSpec("weapons", weapon.id));
    };
    const record = (kind, id) => {
        id = Math.floor(Number(id) || 0);
        if (!(id > 0)) return;
        add("units", this.databaseModelSpec(kind === "actor" ? "actors" : "enemies", id));
        if (kind === "actor" && typeof $gameActors !== "undefined" && $gameActors) carried($gameActors.actor(id));
    };
    const F = globalThis.ReactorFight;
    const worn = (mapData && mapData.reactor3d && mapData.reactor3d.events) || {};
    for (const event of (mapData && mapData.events) || []) {
        if (!event) continue;
        let named = F && F.dataUnitSpec ? F.dataUnitSpec(event) : null, unit = !!named;
        if (named && named.record) record(named.record, named.id);
        for (const page of event.pages || []) {
            const list = (page && page.list) || [];
            // A unit named by a comment on a page, and the records its commands spawn.
            named = F && F.unitSpecOf && !event.rrUnit ? F.unitSpecOf({ note: "" }, list) : null;
            if (named) unit = true;
            if (named && named.record) record(named.record, named.id);
            for (const command of list) {
                if (!command || command.code !== 357) continue;
                const parameters = command.parameters || [];
                if (parameters[0] === "RPGReactor" && parameters[1] === "SpawnUnit" && parameters[3]) record(parameters[3].record === "actor" ? "actor" : "enemy", parameters[3].id);
            }
        }
        // A unit event's own models, on whatever page: a raider who steps out when the battle begins has not been drawn yet.
        if (unit) for (const raw of Object.values(worn[event.id] || {})) add("units", raw);
    }
    if (typeof $gameParty !== "undefined" && $gameParty && typeof $gameParty.allMembers === "function") for (const actor of $gameParty.allMembers()) carried(actor);
    return out;
};

/**
 * Ready what a battle on this map will show, before one starts: the models
 * loaded and built, their pictures queued for the GPU (`prewarmTextures`
 * sends them through the warm-up's pump, a frame's budget at a time), and
 * each weapon's held shape and surface measured (once per model for the
 * session: `heldMeasured`). All of it stood on the first frames of a battle
 * before: 52 ms to build a model, 22 to 40 to decode a picture, 60 to measure
 * a weapon for the first hand that took it.
 */
Reactor3D.preloadBattleModels = function(mapData) {
    const specs = this.collectBattleModelSpecs(mapData);
    const ready = (spec, held) => Promise.all([
        this.loadModel(spec.name, spec.ext, spec.file, spec.texture),
        this.loadModelSidecar(spec.name)
    ]).then(([template, sidecar]) => {
        if (!template) return null;
        this.boundModelTemplate(template);
        (this._prewarmTemplates || (this._prewarmTemplates = [])).push(template);
        // A unit's collision footprint, as the map's own models have theirs taken under the fade.
        if (!held) { try { this.modelCollisionMask(spec, true); } catch (error) { /* the box remains */ } }
        if (held && this.MapHeld && this.MapHeld.build) {
            // A copy made as a hand would be given it, measured, and let go: the measures stay with the model.
            let object = null;
            try {
                object = this.MapHeld.build(template, sidecar, spec);
                object.updateMatrixWorld(true);
                this.heldShape(object); this.heldCloud(object);
            } catch (error) { /* measured when first held, as before */ }
            if (object) {
                object.traverse(child => { for (const material of [].concat(child.material || [])) if (material && material.dispose) material.dispose(); });
                this.releaseModelInstance(object, template);
            }
        }
        return template;
    }).catch(() => null);
    return Promise.all(specs.units.map(spec => ready(spec, false)).concat(specs.held.map(spec => ready(spec, true))));
};

/**
 * The pictures of the models readied for a battle go to the GPU ahead of
 * it: one model a frame is handed to the warm-up, which decodes off the
 * main thread where it can and uploads inside its per-frame budget.
 */
Reactor3D.prewarmTextures = function(renderer) {
    const pending = this._prewarmTemplates, W = this.ShaderWarmup;
    if (!pending || !pending.length || !renderer || !W || !W.enabled || !W.supported(renderer)) return;
    const template = pending.shift();
    for (const texture of (template && template.userData.glbTextures) || []) {
        if (texture && texture.isTexture && texture.image && !W.uploaded(renderer, texture)) W.request(renderer, texture);
    }
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
    this.prewarmTextures(renderer);
    // Where shaders compile in parallel, each placed model warms itself where
    // it will be drawn (ShaderWarmup): the right program variants, pictures
    // under a per-frame budget. This throwaway-scene pass compiled other
    // variants and uploaded every picture of a model in one frame.
    if (this.ShaderWarmup && this.ShaderWarmup.enabled && this.ShaderWarmup.supported(renderer)) return;
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
    const entry = this._glbCache[this.specCacheKey(spec)];
    return !!(entry && entry.template);
};

/**
 * `modelCacheKey` for a spec, remembered beside it: asked per character
 * sprite per frame, and building the string afresh made every lookup hash
 * a new one. Checked against the three fields it is made of.
 */
Reactor3D.specCacheKey = function(spec) {
    const memo = this._specKeys || (this._specKeys = new WeakMap());
    const known = memo.get(spec);
    if (known && known.name === spec.name && known.ext === spec.ext && known.file === spec.file) return known.key;
    const key = this.modelCacheKey(spec.name, spec.ext, spec.file);
    memo.set(spec, { name: spec.name, ext: spec.ext, file: spec.file, key });
    return key;
};

Reactor3D.characterModelYaw = function(character, extra) {
    return this.dir8Yaw(this.characterModelDir8(character)) + (extra || 0);
};

// Asked for every placed model every frame; one table, not one per call.
const DIR8_YAWS = {
    2: 0,
    3: Math.PI / 4,
    6: Math.PI / 2,
    9: 3 * Math.PI / 4,
    8: Math.PI,
    7: -3 * Math.PI / 4,
    4: -Math.PI / 2,
    1: -Math.PI / 4
};
Reactor3D.dir8Yaw = function(direction) {
    return DIR8_YAWS[direction] != null ? DIR8_YAWS[direction] : 0;
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
/**
 * A unit is solid as high as a character stands: a walker meets every rigid
 * part of it up to here (a gun barrel at head height), not only what is
 * below walking height.
 */
Reactor3D.COLLISION_UNIT_HEIGHT = 3;
/** Past this many triangles a model's footprint is read from its vertices alone, this many of them. */
Reactor3D.DENSE_TRIANGLES = 50000;
Reactor3D.DENSE_SAMPLES = 250000;
Reactor3D.COLLISION_MASK_LIMIT = 64;
/** Footprint cells per tile side: a quarter tile, fine enough to walk along a curved base. */
Reactor3D.COLLISION_SUBDIV = 4;
/** The walking body's radius in tiles; a character is narrower than its cell. */
Reactor3D.COLLISION_BODY_RADIUS = 0.34;

/**
 * The model key and the mask's pose key for a spec. Collision asks for
 * them for every model event several times a frame, and specs are stable
 * objects, so both strings are kept beside the spec and rebuilt only when a
 * field they are made from has changed.
 */
Reactor3D.collisionKeysFor = function(spec) {
    const memo = this._collisionKeys || (this._collisionKeys = new WeakMap());
    const stretch = spec.stretch || null;
    let keys = memo.get(spec);
    let same = !!keys && keys.name === spec.name && keys.ext === spec.ext && keys.file === spec.file
        && keys.size === spec.size && keys.scale === spec.scale && keys.pitch === spec.pitch && keys.roll === spec.roll
        && (stretch ? keys.stretch !== null && keys.stretch.length === stretch.length : keys.stretch === null);
    for (let i = 0; same && stretch && i < stretch.length; i++) same = keys.stretch[i] === stretch[i];
    if (same) return keys;
    const model = this.modelCacheKey(spec.name, spec.ext, spec.file);
    const pose = `${model}|${spec.size}|${spec.scale}|${(spec.stretch || []).join(",")}|${spec.pitch}|${spec.roll}`;
    keys = {
        name: spec.name, ext: spec.ext, file: spec.file, size: spec.size, scale: spec.scale,
        pitch: spec.pitch, roll: spec.roll, stretch: stretch ? Array.from(stretch) : null,
        model,
        pose,
        // The same pose worn by a unit (`modelCollisionMask(spec, true)`).
        unitPose: pose + "|unit"
    };
    memo.set(spec, keys);
    return keys;
};

/**
 * Whether a model has a mesh that is drawn where it was built (a hull, a
 * turret). A skinned mesh is drawn where its animation puts it: only its
 * stance, below walking height, is known from the file.
 */
Reactor3D.modelHasRigidMesh = function(template) {
    if (!template || typeof template.traverse !== "function") return false;
    const data = template.userData || (template.userData = {});
    if (data.__reactorRigid === undefined) {
        let rigid = false;
        template.traverse(node => { if (node.isMesh && !node.isSkinnedMesh) rigid = true; });
        data.__reactorRigid = rigid;
    }
    return data.__reactorRigid;
};

/**
 * Which tiles a model's mesh actually covers, in the body's own frame.
 *
 * The triangles below walking height are projected onto the ground at the
 * instance's size, base transform and pitch/roll (facing is applied by the
 * caller, as for the box), and every cell a triangle touches is marked. So
 * a reactor with a wide crown and a narrow stem blocks its stem, not the
 * square its crown would draw; a table blocks under its top. Computed once
 * per model and pose and kept.
 *
 * With `unit` it is the footprint of the model worn by a unit: its rigid
 * meshes count up to a character's height (`COLLISION_UNIT_HEIGHT`), so a
 * tank's barrel and the nose under it are part of its body. A model of
 * skinned meshes alone has the one footprint.
 */
Reactor3D.modelCollisionMask = function(spec, unit) {
    if (!spec || typeof THREE === "undefined") return null;
    const keys = this.collisionKeysFor(spec);
    const entry = this._glbCache && this._glbCache[keys.model];
    const template = entry && entry.template;
    if (!template) return null;
    const masks = this._collisionMasks || (this._collisionMasks = {});
    let mask = masks[keys.pose];
    if (mask === undefined) mask = masks[keys.pose] = this.buildModelCollisionMask(template, this._sidecarJson && this._sidecarJson[spec.name], spec);
    if (!unit) return mask;
    let tall = masks[keys.unitPose];
    if (tall === undefined) {
        tall = masks[keys.unitPose] = mask && this.modelHasRigidMesh(template)
            ? this.buildModelCollisionMask(template, this._sidecarJson && this._sidecarJson[spec.name], spec, this.COLLISION_UNIT_HEIGHT)
            : mask;
    }
    return tall;
};

/**
 * The mask itself, from a loaded template and its sidecar json; the editor
 * builds one from its own copy. `height`: how high its rigid meshes count
 * (a unit's body); without it, and for every skinned mesh, walking height.
 */
Reactor3D.buildModelCollisionMask = function(template, json, spec, height) {
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
    const stance = this.COLLISION_WALK_HEIGHT, reach = height > stance ? height : stance;
    let dense = false;
    template.traverse(node => {
        if (!node.isMesh && !node.isSkinnedMesh) return;
        const geometry = node.geometry;
        const position = geometry && geometry.getAttribute("position");
        if (!position) return;
        // The file holds a skinned mesh in its bind pose, arms out; above its stance it is drawn wherever it is animated.
        const walk = node.isSkinnedMesh ? stance : reach;
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
 * footprint display; the game tests tiles as it goes. `unit`: the model is
 * worn by a unit, whose rigid meshes block to a character's height.
 */
Reactor3D.blockedTilesFor = function(template, json, spec, direction, px, py, unit) {
    if (!template || !spec) return [];
    // Built once per pose and kept on the template: the editor asks for
    // the same footprint from its 3D view and its flat map on every edit.
    const masks = template.userData.__reactorMasks || (template.userData.__reactorMasks = {});
    const poseKey = `${spec.size}|${spec.scale}|${(spec.stretch || []).join(",")}|${spec.pitch}|${spec.roll}`;
    if (masks[poseKey] === undefined) masks[poseKey] = this.buildModelCollisionMask(template, json, spec);
    let mask = masks[poseKey];
    if (unit && mask && this.modelHasRigidMesh(template)) {
        if (masks[poseKey + "|unit"] === undefined) masks[poseKey + "|unit"] = this.buildModelCollisionMask(template, json, spec, this.COLLISION_UNIT_HEIGHT);
        mask = masks[poseKey + "|unit"];
    }
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

/**
 * A model's footprint as it stands at `yaw`: its mask (or its box) and the
 * bounds of it. `unit`: the footprint of the model as a unit's body, solid
 * to a character's height (`modelCollisionMask(spec, true)`); `eventBody`
 * asks for that one by itself.
 */
Reactor3D.eventModelFootprint = function(character, spec, yaw, unit) {
    spec = spec || this.characterModelSpec(character);
    const size = spec && spec.size > 0 ? spec.size : 2;
    const extra = spec && spec.scale > 0 ? spec.scale : 1;
    const entry = spec ? this._glbCache[this.collisionKeysFor(spec).model] : null;
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
    const mask = spec ? this.modelCollisionMask(spec, !!unit) : null;
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
    if (!character) return true;
    // The mesh eases through every angle on the way to the new facing, so a
    // turn in place must clear everything its corners sweep, not only the
    // tiles it ends on. A body of one tile turns on the spot.
    const step = this._bodyStepOf(character, direction);
    if (!step || !step.swept) return true;
    const shape = step.shape, swept = step.swept, x = character._x, y = character._y;
    const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
    if (player && !(player.isThrough && player.isThrough())) {
        if (this._bodyTurnStrikes(character, shape, swept, player)) return false;
        const followers = player.followers ? player.followers() : null;
        const list = followers && followers._data;
        if (list && followers.isVisible()) {
            for (let i = 0; i < list.length; i++) if (list[i].isVisible() && this._bodyTurnStrikes(character, shape, swept, list[i])) return false;
        }
    }
    const now = this._bodyRead();
    const events = now.map && now.map.events ? now.map.events() : null;
    if (!events) return true;
    for (let i = 0; i < events.length; i++) {
        const other = events[i];
        if (!other || other === character || this._bodyFar(other, x, y, swept.reach, now)) continue;
        if (other.isThrough && other.isThrough()) continue;
        if (other.isNormalPriority && !other.isNormalPriority()) continue;
        if (!this._bodyOverlap(swept, x, y, other, now)) continue;
        // A wall light nine tiles up does not stop a tank underneath it.
        if (!this._bodyHeights(character, other) || this.eventIsFallen(other)) continue;
        // A body it already stands on (a unit placed over another) is not asked: the two may turn, and step apart.
        if (this._bodyOverlap(shape, x, y, other, now)) continue;
        return false;
    }
    return true;
};

/** Whether a turn in place swings the body onto a party member who is not under it already. */
Reactor3D._bodyTurnStrikes = function(character, shape, swept, member) {
    const dx = member._x - character._x, dy = member._y - character._y;
    return this.bodyHas(swept, dx, dy) && !this.bodyHas(shape, dx, dy) && this._bodyHeights(character, member);
};

/**
 * Whether a character, stepping so its own tile is (x, y) and turning as a
 * step in `direction` turns it, would put its body on `other`'s: the two end
 * shapes and what the turn sweeps between them, at the tile it leaves and
 * the tile it enters (the body rule, for one pair).
 */
Reactor3D.eventModelWouldOverlap = function(character, x, y, other, direction) {
    if (!character || !other) return false;
    const step = this._bodyStepOf(character, direction);
    const now = this._bodyRead();
    if (!step) return this._bodyCovers(other, x, y, now);
    return this._bodyOverlap(step.moved, x, y, other, now) > 0
        || (!!step.swept && this._bodyOverlap(step.swept, character._x, character._y, other, now) > 0);
};

/** Whether moving the model event's center to (x, y) would put its body on another solid event's (`bodyMeetsEvents`). */
Reactor3D.eventModelWouldOverlapEvents = function(character, x, y, direction) {
    return !!character && this.bodyMeetsEvents(character, x, y, direction);
};

Reactor3D.aimCharacterBillboard = function(object, camera) {
    if (!object || !camera || typeof THREE === "undefined") return;
    // Scratch objects: this runs once per billboard per frame, and six
    // fresh allocations per call was a steady garbage-collector tax.
    const scratch = this._aimScratch || (this._aimScratch = {
        right: new THREE.Vector3(), forward: new THREE.Vector3(),
        trueUp: new THREE.Vector3(), basis: new THREE.Matrix4()
    });
    const cache = this._billboardFacing || (this._billboardFacing = new WeakMap());
    let facing = cache.get(camera);
    const rotation = camera.quaternion, tilt = this.BILLBOARD_TILT;
    if (!facing || facing.x !== rotation.x || facing.y !== rotation.y || facing.z !== rotation.z || facing.w !== rotation.w || facing.tilt !== tilt) {
        const right = scratch.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0;
        if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
        else right.normalize();
        const up = this.billboardUp(camera);
        const forward = scratch.forward.crossVectors(right, up).normalize();
        const trueUp = scratch.trueUp.crossVectors(forward, right).normalize();
        if (!facing) { facing = { value: new THREE.Quaternion() }; cache.set(camera, facing); }
        facing.value.setFromRotationMatrix(scratch.basis.makeBasis(right, trueUp, forward));
        facing.x = rotation.x; facing.y = rotation.y; facing.z = rotation.z; facing.w = rotation.w; facing.tilt = tilt;
    }
    if (!object.quaternion.equals(facing.value)) object.quaternion.copy(facing.value);
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
    return !!character && this.eventBodyCovers(character, x, y);
};

//-----------------------------------------------------------------------------
// Bodies
//
// One answer to "which tiles does this character's body cover", asked by map
// collision, the Tactical grid and the Action driver alike:
//   - an event with a typed size (`reactor3d.eventSize`) covers that
//     rectangle, whatever it is drawn as;
//   - an event that stands as a model, its own or the one the Database binds
//     to a unit's record, covers the tiles under the model as it faces;
//   - anyone else (an event drawn from a sheet of any size, the player, a
//     follower, a vehicle) covers its own tile.
// A body is a shape: a rectangle of tiles round the character's own tile,
// with a mark for each tile it covers. A shape is worked out once and shared
// (forty raiders wearing one model at one facing have one between them).
// What a character's shape is made from is looked at once a frame, and only
// when asked; a new shape is taken only when its page, model, facing or size
// has changed. A collision test reads marks and measures nothing.

/** The body of anyone who stands on one tile. Shared and read-only, like every shape. */
Reactor3D.BODY_TILE = Object.freeze({ ox: 0, oy: 0, w: 1, h: 1, cells: null, count: 1, reach: 0, model: false, sweep: 0, depth: Uint8Array.of(1) });

/** Whether a shape covers the tile (dx, dy) away from the character's own. */
Reactor3D.bodyHas = function(shape, dx, dy) {
    const i = dx - shape.ox, j = dy - shape.oy;
    if (!(i >= 0 && j >= 0 && i < shape.w && j < shape.h)) return false;
    return shape.cells === null || shape.cells[j * shape.w + i] === 1;
};

/** A shape kept under `key`; `null` when none is. They are few (one per model, size and facing), so the table is small. */
Reactor3D._bodyShapeAt = function(key) {
    const shapes = this._bodyShapes || (this._bodyShapes = new Map());
    if (shapes.size > 4096) shapes.clear();
    return shapes.get(key) || null;
};

/** The shape of marks on a square of `side` tiles whose middle tile is the character's own. */
Reactor3D._bodyFromMarks = function(marks, side, sweep) {
    const mid = (side - 1) / 2;
    let x0 = mid, y0 = mid, x1 = mid, y1 = mid, count = 0;
    for (let j = 0; j < side; j++) {
        for (let i = 0; i < side; i++) {
            if (!marks[j * side + i]) continue;
            count++;
            if (i < x0) x0 = i;
            if (i > x1) x1 = i;
            if (j < y0) y0 = j;
            if (j > y1) y1 = j;
        }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, ox = x0 - mid, oy = y0 - mid;
    let cells = null;
    if (count < w * h) {
        cells = new Uint8Array(w * h);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cells[j * w + i] = marks[(y0 + j) * side + x0 + i];
    }
    return { ox, oy, w, h, cells, count, reach: Math.max(-ox, -oy, ox + w - 1, oy + h - 1), model: true, sweep, depth: null };
};

/**
 * Marks the tiles under a model's footprint turned to `yaw`, by the rule
 * `eventModelContains` walks against: the mesh's own mask where it has one,
 * else its box. (`fx`, `fy`) is how far off its tile's middle the model
 * stands (a prop placed between tiles).
 */
Reactor3D._markModelBody = function(marks, side, foot, yaw, fx, fy) {
    const mid = (side - 1) / 2, cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (let j = 0; j < side; j++) {
        for (let i = 0; i < side; i++) {
            if (marks[j * side + i]) continue;
            const dx = i - mid - fx, dy = j - mid - fy;
            const localX = dx * cos - dy * sin, localZ = dx * sin + dy * cos;
            const covered = foot.mask ? foot.mask.blocksTile(localX, localZ)
                : Math.abs(localX) <= foot.rawX + 1e-6 && Math.abs(localZ) <= foot.rawZ + 1e-6;
            if (covered) marks[j * side + i] = 1;
        }
    }
};

/** The square of tiles a model can reach from its own at any facing, as a side length; and its corner radius. */
Reactor3D._modelBodySide = function(foot) {
    const far = Math.hypot(foot.rawX, foot.rawZ);
    return { far, side: Math.min(this.EVENT_SIZE_MAX, Math.ceil(far) + 1) * 2 + 1 };
};

/**
 * The shape of a model standing at `yaw`. `state` says what the footprint
 * was read from ("m" the mesh's mask, "b" its box, "u" a model not loaded
 * yet), so a shape taken before the model came in is not kept for it after.
 * A unit always covers its own tile, whatever its mesh leaves open there.
 */
Reactor3D._modelBody = function(character, spec, pose, state, yaw, fx, fy, unit) {
    const key = "m|" + pose + "|" + state + "|" + Math.round(yaw * 1e4) + "|" + Math.round(fx * 1e3) + "|" + Math.round(fy * 1e3) + (unit ? "|u" : "");
    let shape = this._bodyShapeAt(key);
    if (shape) return shape;
    const foot = this.eventModelFootprint(character, spec, yaw, unit);
    const { far, side } = this._modelBodySide(foot);
    const marks = new Uint8Array(side * side);
    this._markModelBody(marks, side, foot, yaw, fx, fy);
    if (unit) marks[(side * side - 1) / 2] = 1;
    shape = this._bodyFromMarks(marks, side, far);
    this._bodyShapes.set(key, shape);
    return shape;
};

/**
 * Every tile a model passes over as it turns from one yaw to another the
 * short way round, as the drawn turn goes: the two end shapes and what the
 * corners sweep between them.
 */
Reactor3D._sweepBody = function(character, spec, pose, state, fromYaw, toYaw, unit) {
    const key = "w|" + pose + "|" + state + "|" + Math.round(fromYaw * 1e4) + "|" + Math.round(toYaw * 1e4) + (unit ? "|u" : "");
    let shape = this._bodyShapeAt(key);
    if (shape) return shape;
    let delta = toYaw - fromYaw;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const foot = this.eventModelFootprint(character, spec, fromYaw, unit);
    const { far, side } = this._modelBodySide(foot);
    const marks = new Uint8Array(side * side);
    const steps = Math.max(2, Math.ceil(Math.abs(delta) / 0.15));
    for (let i = 0; i <= steps; i++) this._markModelBody(marks, side, foot, fromYaw + delta * (i / steps), 0, 0);
    if (unit) marks[(side * side - 1) / 2] = 1;
    shape = this._bodyFromMarks(marks, side, far);
    this._bodyShapes.set(key, shape);
    return shape;
};

/** The rectangle of a typed size, centred on the event when the map says so, else counted right and down from it. */
Reactor3D._sizeBody = function(w, h, centered) {
    const key = "s|" + w + "|" + h + (centered ? "|c" : "");
    let shape = this._bodyShapeAt(key);
    if (shape) return shape;
    const ox = centered ? 0 - Math.floor((w - 1) / 2) : 0, oy = centered ? 0 - Math.floor((h - 1) / 2) : 0;
    shape = { ox, oy, w, h, cells: null, count: w * h, reach: Math.max(-ox, -oy, ox + w - 1, oy + h - 1), model: false, sweep: 0, depth: null };
    this._bodyShapes.set(key, shape);
    return shape;
};

/** Whether an event is a battle unit (`rrUnit`, or a `<unit: ...>` note). */
Reactor3D.eventIsUnit = function(character) {
    const F = root.ReactorFight;
    if (!F || !F.dataUnitSpec || !character || typeof character.event !== "function") return false;
    return !!F.dataUnitSpec(character.event());
};

/**
 * Whether a battle sequence holds a character: it is drawn where the sequence
 * puts it (`_realX`, `_realY`, a lift) and has not left its cell.
 */
Reactor3D.characterIsStaged = function(character) {
    return !!(character && character._rrStage);
};

/**
 * The body of a character: the tiles it covers round its own, as a shape
 * `{ ox, oy, w, h, cells, count, reach, model, sweep }`: the rectangle's
 * first tile from the character's own (`ox`, `oy`, zero or less), its size,
 * and `cells[j * w + i] === 1` for each tile covered (`null`: all of them;
 * ask `bodyHas`). `reach` is the furthest covered tile from its own, in
 * tiles; `sweep` a model's corner radius. The shape is shared and must not
 * be changed.
 *
 * What made it is kept beside the character and looked at again once a frame
 * (and, within a frame, when the character has turned or changed page), so
 * asking is a lookup.
 */
Reactor3D.eventBody = function(character) {
    const now = this._bodyRead();
    return this._bodyOf(character, now.frame, now.data);
};

/**
 * What a run of body questions reads once: the frame's number, the map's
 * data, the map, and whether it loops. One kept record, filled again by
 * each caller: a collision test asks about every event, and none of them
 * needs these looked up again.
 */
Reactor3D._bodyNow = { frame: -1, data: null, map: null, loops: false };
Reactor3D._bodyRead = function() {
    const now = this._bodyNow;
    now.frame = typeof Graphics !== "undefined" && Graphics ? Graphics.frameCount : -1;
    now.data = typeof $dataMap !== "undefined" ? $dataMap : null;
    now.map = typeof $gameMap !== "undefined" ? $gameMap : null;
    now.loops = !!now.map && !!now.map.isLoopHorizontal && (now.map.isLoopHorizontal() || now.map.isLoopVertical());
    return now;
};

Reactor3D._bodyOf = function(character, frame, map) {
    // The party and vehicles stand on one tile; so does anything that is no event.
    if (!character || typeof character.event !== "function") return this.BODY_TILE;
    let held = character._reactorBody;
    // A character a battle sequence has taken (`_rrStage`) is drawn where the sequence puts it, lunging or lifted,
    // and has not left its cell: its body stays there.
    const staged = !!character._rrStage;
    const offGrid = !staged && (character._realX !== character._x || character._realY !== character._y);
    const sidecar = map && map.reactor3d;
    const raw = sidecar && sidecar.eventSize && character._eventId > 0 ? sidecar.eventSize[character._eventId] : null;
    // Before the first frame has been counted (and where frames are not counted at all) nothing is taken on trust.
    if (held && held.frame === frame && frame > 0 && held.map === map && held.page === character._pageIndex
        && held.erased === !!character._erased && held.variant === character._reactorModelVariant && held.raw === (Array.isArray(raw) ? raw : null)) {
        if (!held.model) return held.shape;
        // Within a frame a model can only have turned, or stopped between tiles.
        const moving = offGrid && (typeof character.isMoving !== "function" || character.isMoving());
        const standsOff = offGrid && !moving;
        if (held.dir === this.characterModelDir8(character)
            && held.fx === (standsOff ? character._realX - character._x : 0)
            && held.fy === (standsOff ? character._realY - character._y : 0)) {
            held.moving = moving;
            return held.shape;
        }
    }
    if (!held) {
        held = { frame: -2, map: null, page: 0, erased: false, variant: undefined, shape: this.BODY_TILE, model: false, moving: false,
            raw: null, sized: null, w: 1, h: 1, centered: false, spec: null, pose: "", state: "", template: null, mask: null,
            specYaw: 0, front: null, yaw: 0, dir: 0, fx: 0, fy: 0, unit: false, turnFrom: null, turnDir: 0, turnStamp: null, swept: null, far: 0,
            faced: null, facedYaw: null, sweeps: null };
        // Kept on the character, where every test finds it at once, and not enumerable: a save writes a character's
        // own listed fields and never this.
        Object.defineProperty(character, "_reactorBody", { value: held, writable: true, configurable: true, enumerable: false });
    }
    held.frame = frame; held.map = map; held.page = character._pageIndex;
    held.erased = !!character._erased; held.variant = character._reactorModelVariant;
    // A typed size wins over what the event is drawn as.
    held.raw = Array.isArray(raw) ? raw : null;
    if (held.raw) {
        const max = this.EVENT_SIZE_MAX;
        const w = Math.max(1, Math.min(max, Math.floor(Number(raw[0])) || 1)), h = Math.max(1, Math.min(max, Math.floor(Number(raw[1])) || 1));
        if (w > 1 || h > 1) {
            const centered = sidecar.eventSizeAnchor === "center";
            if (!held.sized || held.w !== w || held.h !== h || held.centered !== centered) {
                held.w = w; held.h = h; held.centered = centered;
                held.sized = this._sizeBody(w, h, centered);
            }
            held.shape = held.sized;
            held.model = false; held.moving = false; held.spec = null;
            held.far = held.shape.reach;
            return held.shape;
        }
    }
    const spec = this.characterModelSpec(character);
    if (!spec) {
        held.model = false; held.moving = false; held.spec = null;
        held.shape = this.BODY_TILE;
        held.far = 0;
        return held.shape;
    }
    const keys = this.collisionKeysFor(spec);
    const entry = this._glbCache ? this._glbCache[keys.model] : null;
    const template = (entry && entry.template) || null;
    const unit = this.eventIsUnit(character);
    const mask = this.modelCollisionMask(spec, unit);
    const moving = offGrid && (typeof character.isMoving !== "function" || character.isMoving());
    const standsOff = offGrid && !moving;
    const fx = standsOff ? character._realX - character._x : 0, fy = standsOff ? character._realY - character._y : 0;
    const dir = this.characterModelDir8(character);
    const front = (spec.faces && spec.faces.front) || null;
    const sameModel = held.model && held.spec === spec && held.pose === keys.pose && held.template === template && held.mask === mask
        && held.specYaw === (spec.yaw || 0) && held.front === front && held.fx === fx && held.fy === fy && held.unit === unit;
    held.moving = moving;
    if (sameModel && held.dir === dir) return held.shape;
    if (sameModel) {
        // The same model at a new facing has turned: where it turned from is kept for the swing (`eventBodyCovers`).
        held.turnFrom = held.yaw; held.turnDir = held.dir;
        held.turnStamp = character._reactorTurnStamp == null ? null : character._reactorTurnStamp;
    } else {
        // Another model, size or stance: what was kept by facing was the old one's.
        held.turnFrom = null; held.turnDir = 0; held.turnStamp = null;
        if (!held.faced) { held.faced = new Array(10).fill(null); held.facedYaw = new Float64Array(10); }
        held.faced.fill(null); held.facedYaw.fill(NaN);
        if (held.sweeps) held.sweeps.fill(null);
    }
    held.swept = null;
    held.model = true; held.spec = spec; held.pose = keys.pose; held.template = template; held.mask = mask;
    held.dir = dir; held.specYaw = spec.yaw || 0; held.front = front; held.fx = fx; held.fy = fy; held.unit = unit;
    held.state = mask ? "m" : template ? "b" : "u";
    // Each facing's shape is looked up once and kept: a unit that turns to and fro builds nothing.
    const slot = dir >= 1 && dir <= 9 ? dir : 0;
    if (!held.faced[slot]) {
        held.facedYaw[slot] = this.eventModelWorldYaw(character, spec, dir);
        held.faced[slot] = this._modelBody(character, spec, keys.pose, held.state, held.facedYaw[slot], fx, fy, unit);
    }
    held.yaw = held.facedYaw[slot];
    held.shape = held.faced[slot];
    // Whatever its facing, and while it glides or swings, no part of it is further from its own tile than this.
    held.far = Math.ceil(held.shape.sweep) + 2;
    return held.shape;
};

/** What a model sweeps turning from one facing to another, kept beside the character by the pair of facings. */
Reactor3D._heldSweep = function(character, held, fromDir, fromYaw, toDir, toYaw) {
    const at = (fromDir >= 1 && fromDir <= 9 ? fromDir : 0) * 10 + (toDir >= 1 && toDir <= 9 ? toDir : 0);
    const sweeps = held.sweeps || (held.sweeps = new Array(100).fill(null));
    return sweeps[at] || (sweeps[at] = this._sweepBody(character, held.spec, held.pose, held.state, fromYaw, toYaw, held.unit));
};

/**
 * Whether a character's body is on tile (x, y). A model that is gliding
 * between tiles is on the tiles it is going to and still on those it is
 * leaving, and one easing into a new facing is on everything its corners
 * swing over until the turn has played out.
 */
Reactor3D.eventBodyCovers = function(character, x, y) {
    return this._bodyCovers(character, x, y, this._bodyRead());
};

Reactor3D._bodyCovers = function(character, x, y, now) {
    const shape = this._bodyOf(character, now.frame, now.data);
    let dx = x - character._x, dy = y - character._y;
    if (dx > shape.reach || dx < -shape.reach || dy > shape.reach || dy < -shape.reach) {
        // Out of its reach by plain counting, which is nearly every event asked about. What is left: the short way
        // round a looping map, and the tiles a model trails or swings over.
        if (now.loops) {
            dx = now.map.deltaX(x, character._x);
            dy = now.map.deltaY(y, character._y);
        } else if (!shape.model) return false;
    }
    if (this.bodyHas(shape, dx, dy)) return true;
    if (!shape.model) return false;
    const held = character._reactorBody;
    if (!held.moving && character._reactorTurnStamp == null) return false;
    // The tile it is leaving while it glides: its own, back along the way it came.
    let backX = 0, backY = 0;
    if (held.moving) {
        const lagX = character._x - character._realX, lagY = character._y - character._realY;
        backX = lagX > 0 ? Math.ceil(lagX) : -Math.ceil(-lagX);
        backY = lagY > 0 ? Math.ceil(lagY) : -Math.ceil(-lagY);
        if (this.bodyHas(shape, dx + backX, dy + backY)) return true;
    }
    // A body of one tile turns on the spot; a larger one swings its corners over the tiles between its two facings.
    if (shape.count <= 1 || !this._bodySwings(character, held, now)) return false;
    if (!held.swept) held.swept = this._heldSweep(character, held, held.turnDir, held.turnFrom, held.dir, held.yaw);
    return this.bodyHas(held.swept, dx, dy) || (held.moving && this.bodyHas(held.swept, dx + backX, dy + backY));
};

/**
 * Whether a body is still swinging into a facing it turned to, while the
 * drawn turn plays out. Only a turn the body was seen to make: the facing a
 * page gives an event as the map is set up is the one its model is first
 * drawn at, and nothing swings.
 */
Reactor3D._bodySwings = function(character, held, now) {
    const stamp = character._reactorTurnStamp;
    return stamp != null && now.frame >= 0 && now.frame - stamp < this.MODEL_TURN_SWEEP_FRAMES && held.turnStamp === stamp;
};

/** How deep inside a shape a tile is: steps to the nearest tile the shape leaves free (1 at its edge), 0 when not covered. */
Reactor3D.bodyDepth = function(shape, dx, dy) {
    if (!this.bodyHas(shape, dx, dy)) return 0;
    if (!shape.depth) {
        const w = shape.w, h = shape.h, depth = new Uint8Array(w * h);
        const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : depth[j * w + i]);
        for (let n = 0; n < w * h; n++) depth[n] = shape.cells === null || shape.cells[n] ? 255 : 0;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (depth[j * w + i]) depth[j * w + i] = Math.min(depth[j * w + i], at(i - 1, j) + 1, at(i, j - 1) + 1);
        for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) if (depth[j * w + i]) depth[j * w + i] = Math.min(depth[j * w + i], at(i + 1, j) + 1, at(i, j + 1) + 1);
        shape.depth = depth;
    }
    return shape.depth[(dy - shape.oy) * shape.w + (dx - shape.ox)];
};

/**
 * Whether an event is a unit that has fallen in the battle under way: it is
 * still drawn while it fades, and stands in nobody's way.
 */
Reactor3D.eventIsFallen = function(event) {
    const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
    if (!fight || !fight._active || typeof fight.unitOfEvent !== "function" || !(event._eventId > 0)) return false;
    const unit = fight.unitOfEvent(event._eventId);
    return !!unit && unit.team !== "neutral" && !fight.isAlive(unit);
};

/**
 * A walker already standing inside an event's body (a unit placed or
 * spawned over it, a battle begun where it stood) is not held there: a step
 * that takes it nearer the body's edge is let through, one deeper in or
 * along it is not.
 */
Reactor3D.bodyLetsOut = function(mover, event, x, y) {
    const shape = this.eventBody(event);
    const from = this.bodyDepth(shape, mover._x - event._x, mover._y - event._y);
    return from > 0 && this.bodyDepth(shape, x - event._x, y - event._y) < from;
};

/** Placed props with a continuous animation cast moving shadows, as walking events do. */
Reactor3D.modelCasterMoves = function(character, rules) {
    if (!(character && typeof character.eventId === "function" && character.eventId() >= this.PROP_EVENT_BASE)) return true;
    return Array.isArray(rules) && rules.some(rule => rule && (rule.trigger === "always" || rule.trigger === "idle"));
};

/**
 * Whether two characters are within each other's height, as collision counts
 * it. A battle sequence lifts a character it has taken (a leap, a float) by
 * drawing it higher; it still stands where it stood, so that lift is left
 * out.
 */
Reactor3D._bodyHeights = function(a, b, at) {
    const stageA = a._rrStage, stageB = b._rrStage;
    const liftA = stageA && stageA.world ? stageA.z || 0 : 0, liftB = stageB && stageB.world ? stageB.z || 0 : 0;
    if (!liftA && !liftB) return this.charactersOverlapVertically(a, b, at);
    const wasA = a._reactorLift, wasB = b._reactorLift;
    if (liftA) a._reactorLift = (wasA || 0) - liftA;
    if (liftB) b._reactorLift = (wasB || 0) - liftB;
    const meet = this.charactersOverlapVertically(a, b, at);
    a._reactorLift = wasA;
    b._reactorLift = wasB;
    return meet;
};

/**
 * Whether an event is certainly nowhere near tile (x, y), `margin` tiles
 * allowed for: its body was looked at this frame, it is on the same page,
 * and the tile is further from its own than any part of it reaches. Nearly
 * every event asked about is, and is passed over with no more than this.
 */
Reactor3D._bodyFar = function(event, x, y, margin, now) {
    const held = event._reactorBody;
    if (held === undefined || held.frame !== now.frame || !(now.frame > 0) || now.loops || held.page !== event._pageIndex || held.map !== now.data) return false;
    const far = held.far + margin, dx = x - event._x, dy = y - event._y;
    return dx > far || dx < -far || dy > far || dy < -far;
};

/**
 * Whether tile (x, y) is taken, for a walker on one tile (the player, a
 * follower, a vehicle, an event with no body of its own), by the body of an
 * event that stands in the way: normal priority, not walked through, within
 * the walker's height, not a fallen unit. A walker inside a body may step
 * toward its edge (`bodyLetsOut`) unless the tile is asked about as a place
 * to be put down (`strict`).
 */
Reactor3D._bodyAt = { x: 0, y: 0 };
Reactor3D.bodyBlocksTile = function(mover, x, y, strict) {
    const now = this._bodyRead();
    const events = now.map && now.map.events ? now.map.events() : null;
    if (!events) return false;
    // The party is measured against the ground of the tile asked about; an event has no altitude of its own to compare.
    let at = null;
    if (typeof Game_Event === "undefined" || !(mover instanceof Game_Event)) { at = this._bodyAt; at.x = x; at.y = y; }
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        if (event === mover || this._bodyFar(event, x, y, 0, now)) continue;
        if (!event.isNormalPriority() || event.isThrough()) continue;
        if (!this._bodyCovers(event, x, y, now)) continue;
        if (!this._bodyHeights(mover, event, at)) continue;
        if (this.eventIsFallen(event) || (!strict && this.bodyLetsOut(mover, event, x, y))) continue;
        return true;
    }
    return false;
};

/** How many tiles of shape `mine`, its own tile at (mx, my), lie on another event's body. */
Reactor3D._bodyOverlap = function(mine, mx, my, other, now) {
    const theirs = this._bodyOf(other, now.frame, now.data);
    const held = theirs.model ? other._reactorBody : null;
    const loose = !!held && (held.moving || (theirs.count > 1 && this._bodySwings(other, held, now)));
    const far = mine.reach + theirs.reach + (loose ? Math.ceil(theirs.sweep) + 2 : 0);
    const ex = other._x, ey = other._y;
    if (mx - ex > far || ex - mx > far || my - ey > far || ey - my > far) return 0;
    let count = 0;
    if (loose) {
        // Gliding or mid-turn it is on more than its shape where it stands: each tile is asked.
        for (let j = 0; j < mine.h; j++) {
            for (let i = 0; i < mine.w; i++) {
                if (mine.cells !== null && !mine.cells[j * mine.w + i]) continue;
                if (this._bodyCovers(other, mx + mine.ox + i, my + mine.oy + j, now)) count++;
            }
        }
        return count;
    }
    const x0 = Math.max(mx + mine.ox, ex + theirs.ox), x1 = Math.min(mx + mine.ox + mine.w, ex + theirs.ox + theirs.w);
    const y0 = Math.max(my + mine.oy, ey + theirs.oy), y1 = Math.min(my + mine.oy + mine.h, ey + theirs.oy + theirs.h);
    if (x0 >= x1 || y0 >= y1) return 0;
    if (mine.cells === null && theirs.cells === null) return (x1 - x0) * (y1 - y0);
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            if (this.bodyHas(mine, x - mx, y - my) && this.bodyHas(theirs, x - ex, y - ey)) count++;
        }
    }
    return count;
};

/**
 * What a body covers as it takes a step: its shape, or, when the step turns
 * it (a model faces the way it goes), everything the turn sweeps. Null for a
 * body of one tile. Left in `_bodyStep` for the caller: `moved` is tested
 * round the tile it enters, `swept` (when set) also round the tile it leaves;
 * `ended` is its shape once the step, and its turn, are over.
 */
Reactor3D._bodyStep = { shape: null, moved: null, swept: null, ended: null };
Reactor3D._bodyStepOf = function(mover, direction) {
    const step = this._bodyStep;
    const shape = this.eventBody(mover);
    step.shape = shape; step.moved = shape; step.swept = null; step.ended = shape;
    if (shape.count <= 1) return null;
    if (shape.model && direction >= 1 && direction <= 9) {
        const held = mover._reactorBody;
        // NaN until this facing's yaw has been asked for.
        let toYaw = held.facedYaw[direction];
        if (toYaw !== toYaw) toYaw = held.facedYaw[direction] = this.eventModelWorldYaw(mover, held.spec, direction);
        if (toYaw !== held.yaw) {
            step.swept = this._heldSweep(mover, held, held.dir, held.yaw, direction, toYaw);
            step.moved = step.swept;
            step.ended = held.faced[direction] || (held.faced[direction] = this._modelBody(mover, held.spec, held.pose, held.state, toYaw, held.fx, held.fy, held.unit));
        }
    }
    return step;
};

/**
 * Whether an event, stepping so its own tile is (x, y) and turning as a step
 * in `direction` turns it, would put its body on another event that stands
 * in the way. A body already on another (two units placed over each other)
 * may take a step that leaves fewer tiles shared, whatever its turn sweeps
 * of that body on the way.
 */
Reactor3D.bodyMeetsEvents = function(mover, x, y, direction) {
    return this._bodyMeetsEvents(mover, x, y, direction, false);
};

Reactor3D._bodyMeetsEvents = function(mover, x, y, direction, strict) {
    const step = this._bodyStepOf(mover, direction);
    if (!step) return this.bodyBlocksTile(mover, x, y, strict);
    const shape = step.shape, moved = step.moved, swept = step.swept, ended = step.ended;
    const now = this._bodyRead();
    const events = now.map && now.map.events ? now.map.events() : null;
    if (!events) return false;
    const reach = moved.reach;
    for (let i = 0; i < events.length; i++) {
        const other = events[i];
        if (other === mover) continue;
        if (this._bodyFar(other, x, y, reach, now) && (!swept || this._bodyFar(other, mover._x, mover._y, reach, now))) continue;
        if (!other.isNormalPriority() || other.isThrough()) continue;
        if (!this._bodyOverlap(moved, x, y, other, now) && !(swept && this._bodyOverlap(swept, mover._x, mover._y, other, now))) continue;
        // A wall light nine tiles up does not stop a tank underneath it.
        if (!this._bodyHeights(mover, other) || this.eventIsFallen(other)) continue;
        if (!strict) {
            const under = this._bodyOverlap(shape, mover._x, mover._y, other, now);
            if (under && this._bodyOverlap(ended, x, y, other, now) < under) continue;
        }
        return true;
    }
    return false;
};

/**
 * The same for the player and the followers who are not walked through: a
 * body may not step, or turn, onto one of them.
 */
Reactor3D.bodyMeetsParty = function(mover, x, y, direction) {
    return this._bodyMeetsParty(mover, x, y, direction, false);
};

Reactor3D._bodyMeetsParty = function(mover, x, y, direction, strict) {
    const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
    if (!player) return false;
    const step = this._bodyStepOf(mover, direction);
    if (!step) {
        if (!this._bodyHeights(mover, player)) return false;
        return player.isCollided(x, y);
    }
    if (player.isThrough()) return false;
    if (this._bodyMeetsOne(mover, step, x, y, player, strict)) return true;
    const followers = player.followers ? player.followers() : null;
    const list = followers && followers._data;
    if (!list || !followers.isVisible()) return false;
    for (let i = 0; i < list.length; i++) {
        if (list[i].isVisible() && this._bodyMeetsOne(mover, step, x, y, list[i], strict)) return true;
    }
    return false;
};

/**
 * Whether a step would put the body on one party member. A member already
 * under it (a unit placed over the party) is in the way only of a step that
 * leaves it there.
 */
Reactor3D._bodyMeetsOne = function(mover, step, x, y, member, strict) {
    const mx = member._x, my = member._y;
    const under = !strict && this.bodyHas(step.shape, mx - mover._x, my - mover._y);
    const meets = under ? this.bodyHas(step.ended, mx - x, my - y)
        : this.bodyHas(step.moved, mx - x, my - y) || (!!step.swept && this.bodyHas(step.swept, mx - mover._x, my - mover._y));
    return meets && this._bodyHeights(mover, member);
};

/**
 * Whether an event's body, with its own tile at (x, y), is clear of every
 * other body, the player and the followers: where a unit can be put down.
 * Nothing it stands on now is allowed for.
 */
Reactor3D.bodyFits = function(character, x, y) {
    return !this._bodyMeetsEvents(character, x, y, 0, true) && !this._bodyMeetsParty(character, x, y, 0, true);
};

/**
 * Whether an event touches the player with a step it was refused: its body,
 * with its own tile at (x, y) and turned as that step turns it, would be on
 * the player. What an Event Touch trigger asks.
 */
Reactor3D.bodyTouchesPlayer = function(event, x, y) {
    const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
    if (!player) return false;
    const dx = x - event._x, dy = y - event._y;
    const step = this._bodyStepOf(event, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : dy > 0 ? 2 : dy < 0 ? 8 : 0);
    if (!step) return player.pos(x, y);
    return this._bodyMeetsOne(event, step, x, y, player, false);
};

/**
 * How far a point of the ground (tiles, as `_realX + 0.5`) is from a
 * character's body: 0 on a tile it covers, else the distance to the nearest
 * such tile's edge.
 */
Reactor3D.eventBodyGap = function(character, wx, wz) {
    const shape = this.eventBody(character);
    // Where it is drawn as it glides; a character a battle sequence has taken stands on its cell.
    const staged = !!character._rrStage;
    const bx = (staged ? character._x : character._realX) + shape.ox, bz = (staged ? character._y : character._realY) + shape.oy;
    let best = Infinity;
    for (let j = 0; j < shape.h; j++) {
        for (let i = 0; i < shape.w; i++) {
            if (shape.cells !== null && !shape.cells[j * shape.w + i]) continue;
            const dx = wx < bx + i ? bx + i - wx : wx > bx + i + 1 ? wx - bx - i - 1 : 0;
            const dz = wz < bz + j ? bz + j - wz : wz > bz + j + 1 ? wz - bz - j - 1 : 0;
            if (!dx && !dz) return 0;
            const d = Math.hypot(dx, dz);
            if (d < best) best = d;
        }
    }
    return best;
};

/**
 * Nobody of the party is left standing inside a body bigger than a tile (a
 * unit placed or spawned over it, a battle begun where it stood): each member
 * under one is put on the nearest tile it can walk to that is free, of
 * bodies, of events in the way and of the other members. Returns how many
 * were moved.
 */
Reactor3D.BODY_EXIT_REACH = 24;
Reactor3D.freePartyOfBodies = function() {
    const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
    const map = typeof $gameMap !== "undefined" ? $gameMap : null;
    if (!player || !map || !map.events) return 0;
    // The bodies that can be stood inside, as they stand: what a hull trails or swings over is not where it is.
    const big = [];
    for (const event of map.events()) {
        if (event && event.isNormalPriority() && !event.isThrough() && this.eventBody(event).count > 1 && !this.eventIsFallen(event)) big.push(event);
    }
    if (!big.length) return 0;
    const followers = player.followers ? player.followers() : null;
    const members = [player];
    if (followers && followers._data && followers.isVisible()) for (const follower of followers._data) if (follower.isVisible()) members.push(follower);
    const at = this._bodyAt;
    const covered = (member, x, y) => {
        for (let i = 0; i < big.length; i++) {
            const event = big[i];
            if (!this.bodyHas(this.eventBody(event), x - event._x, y - event._y)) continue;
            at.x = x; at.y = y;
            if (this._bodyHeights(member, event, at)) return true;
        }
        return false;
    };
    let moved = 0;
    for (const member of members) {
        if (!covered(member, member._x, member._y)) continue;
        // Outward over ground it can walk, nearest first.
        const seen = new Set([member._x + "," + member._y]);
        let ring = [[member._x, member._y]], spot = null;
        for (let depth = 0; depth < this.BODY_EXIT_REACH && ring.length && !spot; depth++) {
            const next = [];
            for (const [cx, cy] of ring) {
                for (const d of [2, 4, 6, 8]) {
                    const nx = map.roundXWithDirection(cx, d), ny = map.roundYWithDirection(cy, d);
                    const key = nx + "," + ny;
                    if (seen.has(key) || !map.isValid(nx, ny) || !member.isMapPassable(cx, cy, d)) continue;
                    seen.add(key);
                    if (!covered(member, nx, ny) && !member.isCollidedWithCharacters(nx, ny)
                        && !members.some(other => other !== member && other._x === nx && other._y === ny)) { spot = [nx, ny]; break; }
                    next.push([nx, ny]);
                }
                if (spot) break;
            }
            ring = next;
        }
        if (!spot) continue;
        Game_CharacterBase.prototype.locate.call(member, spot[0], spot[1]);
        if (member === player && player.center) player.center(spot[0], spot[1]);
        moved++;
    }
    return moved;
};

// A battle begins with the party clear of every big body: the party steps aside, the unit keeps the place the map gave
// it. This runs before a battle mode settles its own units, which then find the party out of the way.
if (typeof ReactorEvents !== "undefined" && ReactorEvents && typeof ReactorEvents.on === "function") {
    ReactorEvents.on("mapBattleStart", () => Reactor3D.freePartyOfBodies());
}

const NO_FACES = Object.freeze({});
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
    // A stand-in character facing `dir`, for characterModelYaw below; one
    // kept and re-pointed rather than an object and a closure per call.
    const character = this._poseFacing || (this._poseFacing = { _reactorDir8: 2, direction() { return this._reactorDir8; } });
    character._reactorDir8 = dir;
    const faces = spec.faces || NO_FACES;
    const used = preview
        ? (faces[this.eventModelFaceName(dir)] || faces.front || null)
        : (faces.front || this.eventModelInterpolatedMark(faces, dir));
    let target = preview ? faceYaw : this.dir8Yaw(dir);
    if (preview && !faces[this.eventModelFaceName(dir)] && faces.front) {
        target -= this.eventModelFaceTurn(dir);
    }
    if (used && typeof THREE !== "undefined") {
        const local = (this._poseMarkScratch || (this._poseMarkScratch = new THREE.Vector3())).set(used[0], used[1], used[2]);
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

/**
 * Which loaded models the game still needs. Every `loadModel` call claims
 * its model for the map being played; when another map opens, the models it
 * did not claim are let go: the newest of them stay while they fit
 * `graceBytes` (a house and the street outside it trade places freely), the
 * rest leave the GPU and the cache. A model asked for again loads again.
 */
Reactor3D.ModelUse = {
    enabled: true,
    /** What unclaimed models may keep: geometry and pictures, both sides. */
    graceBytes: 96 * 1024 * 1024,
    lowMemoryGraceBytes: 32 * 1024 * 1024,
    generation: 0,
    mapId: 0,
    pending: false,
    released: 0,
    releasedBytes: 0,

    /** A map's data arrived. Returning to the map already played (a menu, a battle scene) changes nothing. */
    begin(mapId) {
        mapId = Number(mapId) || 0;
        if (mapId === this.mapId) return false;
        this.mapId = mapId;
        this.generation++;
        this.pending = true;
        return true;
    },

    claim(entry, name) {
        entry.used = this.generation;
        if (name && !entry.name) entry.name = name;
    },

    /** Every cache key the map and a battle on it name, whatever has loaded so far. */
    namedKeys(mapData) {
        const R = Reactor3D, keys = new Set();
        const note = spec => { if (spec && spec.name) keys.add(R.modelCacheKey(spec.name, spec.ext, spec.file)); };
        try { for (const spec of R.collectMapModelSpecs(mapData)) note(spec); } catch (error) { /* claims remain */ }
        try { const battle = R.collectBattleModelSpecs(mapData); for (const spec of battle.units.concat(battle.held)) note(spec); } catch (error) { /* claims remain */ }
        // The party as battlers, and the troops this map's encounters bring.
        try {
            if (typeof $gameParty !== "undefined" && $gameParty && $gameParty.allMembers) {
                for (const actor of $gameParty.allMembers()) if (actor) for (const slot of ["battler", "face"]) note(R.actorSlotSpec(actor.actorId(), slot));
            }
            const troops = typeof $dataTroops !== "undefined" && $dataTroops ? $dataTroops : [];
            for (const encounter of (mapData && mapData.encounterList) || []) {
                const troop = troops[encounter && encounter.troopId];
                for (const member of (troop && troop.members) || []) note(R.databaseModelSpec("enemies", member.enemyId));
            }
        } catch (error) { /* claims remain */ }
        return keys;
    },

    /** The text a model's name would appear in when an event names it by a command or a script. */
    eventText(mapData) {
        if (!mapData) return "";
        if (this._textOf !== mapData) {
            this._textOf = mapData;
            try { this._text = JSON.stringify(mapData.events || []); } catch (error) { this._text = ""; }
        }
        if (this._commonText === undefined) {
            try { this._commonText = typeof $dataCommonEvents !== "undefined" && $dataCommonEvents ? JSON.stringify($dataCommonEvents) : ""; } catch (error) { this._commonText = ""; }
        }
        return this._text + this._commonText;
    },

    bytesOf(key, entry) {
        if (entry.bytes > 0) return entry.bytes;
        const R = Reactor3D, template = entry.template, seen = new Set();
        let bytes = 0;
        const geometry = g => {
            if (!g || seen.has(g)) return;
            seen.add(g);
            for (const name in g.attributes) { const array = g.attributes[name] && g.attributes[name].array; if (array && !seen.has(array)) { seen.add(array); bytes += array.byteLength * 2; } }
            if (g.index && g.index.array) bytes += g.index.array.byteLength * 2;
        };
        template.traverse(node => geometry(node.geometry));
        const lod = R._lodCache && R._lodCache[key];
        for (const level of (lod && lod.levels) || []) for (const g of level) geometry(g);
        const cap = R.textureCap ? R.textureCap() : 2048;
        for (const texture of template.userData.glbTextures || []) {
            if (texture && texture.isCompressedTexture) { bytes += R.KTX2.bytes(texture); continue; }
            const image = texture && (R.ShaderWarmup && R.ShaderWarmup.sourceImage ? R.ShaderWarmup.sourceImage(texture) : texture.image);
            const width = Math.min(cap, image && (image.naturalWidth || image.width) || 0), height = Math.min(cap, image && (image.naturalHeight || image.height) || 0);
            bytes += width * height * 4 * (texture.generateMipmaps === false ? 1 : 1.33);
        }
        return entry.bytes = Math.max(1, Math.round(bytes));
    },

    busy() {
        try {
            if (typeof $gameParty !== "undefined" && $gameParty && $gameParty.inBattle && $gameParty.inBattle()) return true;
            if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isHere && $gameFight.isHere()) return true;
            // Models waiting to join a running battle hold their templates.
            const joins = Reactor3D.ModelJoins;
            if (joins && joins.queue && joins.queue.length) return true;
        } catch (error) { return true; }
        return false;
    },

    /**
     * Once the map's own models have been claimed and the scene before it is
     * gone: let go of what no map names any more. Returns the keys released.
     */
    sweep(mapData, early) {
        if (!this.pending || !this.enabled) return [];
        if (this.busy()) return [];
        // Early (the map's data has arrived, nothing of it is loaded yet): what it names stays and
        // the rest goes before its own models come in; the sweep at its start is still owed.
        if (!early) this.pending = false;
        const R = Reactor3D, cache = R._glbCache, named = this.namedKeys(mapData), text = this.eventText(mapData), idle = [];
        for (const key in cache) {
            const entry = cache[key];
            if (!entry.template) continue;
            if (!(entry.used < this.generation) || named.has(key)) continue;
            if (entry.name && text.indexOf(entry.name) >= 0) continue;
            idle.push(key);
        }
        // The newest first: they stay while they fit.
        idle.sort((a, b) => (cache[b].used || 0) - (cache[a].used || 0));
        let room = R.lowMemory && R.lowMemory() ? this.lowMemoryGraceBytes : this.graceBytes;
        const gone = [];
        for (const key of idle) {
            const bytes = this.bytesOf(key, cache[key]);
            if (bytes <= room) { room -= bytes; continue; }
            gone.push(key);
        }
        if (gone.length) this.release(gone);
        return gone;
    },

    /** Drop these models: the GPU side now, the rest when nothing drawn holds it any more. */
    release(keys) {
        const R = Reactor3D, cache = R._glbCache, going = new Set(keys), kept = new Set();
        const each = (key, entry, visit) => {
            entry.template.traverse(node => {
                if (node.geometry) visit(node.geometry);
                for (const material of [].concat(node.material || [])) if (material) visit(material);
                if (node.skeleton) visit(node.skeleton);
            });
            const lod = R._lodCache && R._lodCache[key];
            for (const level of (lod && lod.levels) || []) for (const geometry of level) visit(geometry);
            for (const texture of entry.template.userData.glbTextures || []) if (texture) visit(texture);
        };
        // What a model that stays shares with one that goes (a picture two variants draw from) stays.
        for (const key in cache) if (!going.has(key) && cache[key].template) each(key, cache[key], item => kept.add(item));
        const uuids = [];
        for (const key of keys) {
            const entry = cache[key];
            if (!entry || !entry.template) continue;
            const template = entry.template;
            each(key, entry, item => {
                if (kept.has(item)) return;
                kept.add(item);
                if (item.isBufferGeometry) uuids.push(item.uuid);
                if (item.isTexture) {
                    if (R.ShaderWarmup && R.ShaderWarmup.forget) R.ShaderWarmup.forget(item);
                }
                try { if (typeof item.dispose === "function") item.dispose(); } catch (error) { /* a renderer already gone */ }
            });
            this.releasedBytes += entry.bytes || 0;
            this.released++;
            delete cache[key];
            if (R._lodCache) delete R._lodCache[key];
            if (R._warmedTemplates) R._warmedTemplates.delete(key);
            if (R._prewarmTemplates) { const at = R._prewarmTemplates.indexOf(template); if (at >= 0) R._prewarmTemplates.splice(at, 1); }
        }
        // A held weapon's measures are kept by the geometry they were taken from.
        if (uuids.length && R._heldMeasures) {
            for (const measured of Array.from(R._heldMeasures.keys())) {
                for (const uuid of uuids) if (measured.indexOf(uuid) >= 0) { R._heldMeasures.delete(measured); break; }
            }
        }
    }
};

Reactor3D.loadGlb = function(name) {
    return this.loadModel(name, ".glb");
};

Reactor3D.loadModel = function(name, ext, file, texture) {
    const key = this.modelCacheKey(name, ext, file);
    const cached = this._glbCache[key];
    if (cached) { this.ModelUse.claim(cached, name); return cached.promise; }
    const entry = { promise: null, template: null, failed: false };
    this.ModelUse.claim(entry, name);
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
                    // The container split and JSON parse run off-thread;
                    // the buffer travels there and back.
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

/**
 * The part of a GLB's binary chunk the runtime reads: every accessor's view,
 * packed into a buffer of its own (each view keeps its offset's remainder by
 * 16, so every typed array over it stays aligned), and the pictures a
 * material draws with (its base color) as Blobs on their `images` entries
 * (`rrBlob`). Normal, roughness and occlusion maps and pictures nothing
 * names are left behind, with the rest of the file. `json` is updated in
 * place to the new offsets. Returns the packed ArrayBuffer.
 */
function reactorCompactGlb(json, buffer, binOffset, binLength) {
    const views = json.bufferViews || [], read = {}, drawn = {};
    for (const accessor of json.accessors || []) {
        if (accessor.bufferView != null) read[accessor.bufferView] = true;
        if (accessor.sparse) { read[accessor.sparse.indices.bufferView] = true; read[accessor.sparse.values.bufferView] = true; }
    }
    for (const material of json.materials || []) {
        const pbr = material.pbrMetallicRoughness || {}, specgloss = material.extensions && material.extensions.KHR_materials_pbrSpecularGlossiness;
        const info = pbr.baseColorTexture || (specgloss && specgloss.diffuseTexture);
        const texture = info && json.textures && json.textures[info.index];
        if (texture && texture.source != null) drawn[texture.source] = true;
        // And its block-compressed copy (KHR_texture_basisu).
        const basisu = texture && texture.extensions && texture.extensions.KHR_texture_basisu;
        if (basisu && basisu.source != null) drawn[basisu.source] = true;
    }
    const source = new Uint8Array(buffer, binOffset, binLength), placed = [];
    let size = 0;
    for (let i = 0; i < views.length; i++) {
        if (!read[i]) continue;
        const from = views[i].byteOffset || 0, length = views[i].byteLength || 0;
        const at = size + ((from % 16) - (size % 16) + 16) % 16;
        placed.push([i, from, length, at]);
        size = at + length;
    }
    const packed = new Uint8Array(size);
    for (const [i, from, length, at] of placed) {
        packed.set(source.subarray(from, from + length), at);
        views[i].byteOffset = at;
    }
    (json.images || []).forEach((image, index) => {
        if (!drawn[index] || image.uri || image.bufferView == null || typeof Blob === "undefined") return;
        const view = views[image.bufferView], from = view.byteOffset || 0;
        // A view an accessor also reads has moved already.
        const bytes = read[image.bufferView] ? packed.subarray(from, from + view.byteLength) : source.subarray(from, from + view.byteLength);
        image.rrBlob = new Blob([bytes], { type: image.mimeType || "image/png" });
    });
    return packed.buffer;
}

// Exposed for tests: the worker runs exactly these functions.
Reactor3D._workerParts = { splitGlb: reactorSplitGlb, compactGlb: reactorCompactGlb };

/**
 * A model keeps only what it reads of its file: the geometry and animation
 * data in a packed buffer and its base color pictures. Off, its arrays are
 * views into the whole file, which then stays in memory for as long as the
 * model does, pictures nothing samples included.
 */
Reactor3D.GlbCompact = { enabled: true };

// The worker splits the container and parses its JSON. A model's pictures are
// not decoded here: each one is decoded when it is first drawn (ShaderWarmup),
// at this machine's size, and that copy is closed once it is on the GPU.
Reactor3D._glbWorkerSource = function() {
    return reactorSplitGlb.toString() + "\n" + reactorCompactGlb.toString() + "\n"
        + "self.onmessage = function(event) {\n"
        + "    var data = event.data || {};\n"
        + "    var buffer = data.buffer;\n"
        + "    Promise.resolve().then(function() {\n"
        + "        var parsed = reactorSplitGlb(buffer);\n"
        + "        if (data.compact) {\n"
        + "            var packed = reactorCompactGlb(parsed.json, buffer, parsed.bin.offset, parsed.bin.length);\n"
        + "            self.postMessage({ id: data.id, json: parsed.json, binOffset: 0, binLength: packed.byteLength, buffer: packed }, [packed]);\n"
        + "            return;\n"
        + "        }\n"
        + "        self.postMessage({ id: data.id, json: parsed.json,\n"
        + "            binOffset: parsed.bin.offset, binLength: parsed.bin.length,\n"
        + "            buffer: buffer }, [buffer]);\n"
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

/**
 * A worker's message arrives with every array holey and generic, whatever it
 * holds. A node's matrix read from one by three's math (Matrix4.fromArray)
 * taught it to convert every array it reads to the generic kind, and from
 * there every matrix in the game held its numbers boxed: a matrix product
 * allocated 84 bytes. The parsed glTF's arrays of numbers are rebuilt packed.
 */
Reactor3D.packJsonArrays = function(value) {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) {
        let numbers = value.length > 0;
        for (let i = 0; i < value.length; i++) {
            const item = value[i];
            if (typeof item !== "number") numbers = false;
            if (item && typeof item === "object") value[i] = this.packJsonArrays(item);
        }
        if (!numbers) return value;
        // Its own array literal: one that ever held an object makes every array it makes generic.
        const packed = [];
        for (let i = 0; i < value.length; i++) packed.push(value[i]);
        return packed;
    }
    for (const key in value) {
        const item = value[key];
        if (item && typeof item === "object") value[key] = this.packJsonArrays(item);
    }
    return value;
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
                json: Reactor3D.packJsonArrays(data.json),
                bin: new Uint8Array(data.buffer, data.binOffset, data.binLength),
                bitmaps: data.bitmaps || {}
            });
        });
        try {
            worker.postMessage({ id, buffer, compact: !!(this.GlbCompact && this.GlbCompact.enabled) }, [buffer]);
            Reactor3D.IdleWorkers?.touch("glb", () => this._parsePending.size > 0, () => { const idle = this._parseWorker; this._parseWorker = undefined; if (idle) idle.terminate(); });
        } catch (error) {
            this._parsePending.delete(id);
            resolve(null);
        }
    });
};

/**
 * readModel with the GLB half off-thread: the worker splits and parses,
 * and the template is assembled from the transferred buffer. Every other format — and any worker failure — resolves through
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

/**
 * A machine with little memory keeps model textures at half that. A 2048 sheet with its mipmaps
 * is 21 MB of video memory, which integrated graphics take from the machine's own RAM: a dozen
 * models are a quarter of a gigabyte. `memoryTier` is "auto" (low when the browser reports 4 GB or
 * less), "low" or "normal".
 */
Reactor3D.memoryTier = "auto";
Reactor3D.lowMemoryTextureSize = 1024;
Reactor3D.lowMemory = function() {
    if (this.memoryTier === "low") return true;
    if (this.memoryTier === "normal") return false;
    const reported = typeof navigator !== "undefined" ? Number(navigator.deviceMemory) : 0;
    return reported > 0 && reported <= 4;
};
/**
 * A weak GPU keeps model textures at this side (0: the usual cap). Its picture is drawn below the
 * screen's size, so a model rarely shows a 2048 sheet's top level; the sheet would still cost
 * 21 MB of the machine's own RAM and the bandwidth to read it.
 */
Reactor3D.weakTextureSize = 1024;
/** The largest side a model texture keeps on this machine. */
Reactor3D.textureCap = function() {
    let cap = Math.max(64, Math.floor(this.maxTextureSize || 0));
    if (this.lowMemory()) cap = Math.min(cap, Math.max(64, Math.floor(this.lowMemoryTextureSize || cap)));
    if (this.weakTextureSize > 0 && typeof this.isWeakGpu === "function" && this.isWeakGpu()) cap = Math.min(cap, Math.max(64, Math.floor(this.weakTextureSize)));
    return cap;
};

/** The main-thread twin of capBitmapSize for images decoded by the browser: a canvas at the capped size. */
Reactor3D.capImage = function(image) {
    // Only a picture the browser draws: a compressed texture's levels are capped where they are transcoded.
    if (!image || !(image.tagName || typeof image.getContext === "function" || typeof image.close === "function")) return image;
    const cap = this.textureCap();
    const width = image && (image.naturalWidth || image.width);
    const height = image && (image.naturalHeight || image.height);
    if (!image || !(width > cap || height > cap) || typeof document === "undefined") return image;
    // Under the usual cap and over a low-memory one: it is resampled where it is decoded
    // (ShaderWarmup's bitmap, off the main thread), so it stays an <img> here.
    const usual = Math.max(64, Math.floor(this.maxTextureSize || 0));
    if (cap < usual && width <= usual && height <= usual && image.tagName === "IMG" && this.ShaderWarmup && this.ShaderWarmup.resamplesModelSheets()) return image;
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
    const cap = this.textureCap();
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
        if (this.GlbCompact && this.GlbCompact.enabled && parsed.bin) {
            parsed.bin = new Uint8Array(reactorCompactGlb(parsed.json, parsed.bin.buffer, parsed.bin.byteOffset, parsed.bin.byteLength));
        }
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
        map.userData.rrModelTexture = true;
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
    // Without a view the values start as zeros; sparse values are laid over
    // them (a face's morph targets move only a few vertices).
    if (accessor.bufferView == null || accessor.sparse) return this._glbSparseAccessor(json, bin, accessor);
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
    // A photo studio a shiny surface can read: sky overhead, a bright horizon,
    // a dark floor, and two softboxes for the crisp highlights chrome needs.
    // Faces in three's order: +X, -X, +Y, -Y, +Z, -Z.
    const size = 64;
    const faces = [0, 1, 2, 3, 4, 5].map(face => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (face === 2 || face === 3) {
            const top = face === 2;
            const glow = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size * 0.75);
            glow.addColorStop(0, top ? "rgb(236,242,250)" : "rgb(58,54,50)");
            glow.addColorStop(1, top ? "rgb(150,182,222)" : "rgb(30,28,26)");
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, size, size);
            return canvas;
        }
        const wall = ctx.createLinearGradient(0, 0, 0, size);
        wall.addColorStop(0, "rgb(142,176,220)");
        wall.addColorStop(0.46, "rgb(226,232,238)");
        wall.addColorStop(0.52, "rgb(250,248,244)");
        wall.addColorStop(0.58, "rgb(120,114,106)");
        wall.addColorStop(1, "rgb(44,40,38)");
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, size, size);
        if (face === 0 || face === 4) {
            ctx.fillStyle = "rgb(255,255,255)";
            ctx.fillRect(size * 0.3, size * 0.14, size * 0.4, size * 0.22);
        }
        return canvas;
    });
    const cube = new THREE.CubeTexture(faces);
    cube.needsUpdate = true;
    if (THREE.SRGBColorSpace) cube.colorSpace = THREE.SRGBColorSpace;
    this._studioEnv = cube;
    return cube;
};

/**
 * Block-compressed model pictures. A model compressed at import carries a KTX2
 * (Basis Universal) copy of each base color picture beside the picture itself
 * (glTF's KHR_texture_basisu). It is transcoded in a worker to the first
 * format this GPU samples directly: BC7, then ETC2, then S3TC (BC3, or BC1 for
 * an opaque picture). A BC7 sheet is a byte a texel on the GPU (a quarter of
 * plain color) and is read with a quarter of the bandwidth. Where none of the
 * three is supported, or the transcoder cannot run, the file's own picture is
 * drawn as before. A machine's texture cap is kept by starting at the mip
 * level under it. A picture the file samples with nearest filtering is never
 * block-compressed. Off: every model draws its own picture.
 */
Reactor3D.KTX2 = {
    enabled: true,
    TRANSCODER: "basis/basis_transcoder.js",
    WASM: "basis/basis_transcoder.wasm",
    // Per target: the transcoder's format with and without alpha, and the three.js format each lands in.
    TARGETS: {
        bc7: { extensions: ["EXT_texture_compression_bptc"], basis: [7, 7], formats: ["RGBA_BPTC_Format", "RGBA_BPTC_Format"] },
        etc2: { extensions: ["WEBGL_compressed_texture_etc"], basis: [0, 1], formats: ["RGB_ETC2_Format", "RGBA_ETC2_EAC_Format"] },
        s3tc: { extensions: ["WEBGL_compressed_texture_s3tc", "WEBGL_compressed_texture_s3tc_srgb"], basis: [2, 3], formats: ["RGB_S3TC_DXT1_Format", "RGBA_S3TC_DXT5_Format"] }
    },
    ORDER: ["bc7", "etc2", "s3tc"],
    _jobs: new Map(),
    _serial: 0,
    /** The extension names this machine's WebGL 2 offers (asked once, of a context made for the purpose and let go). */
    supportedExtensions() {
        if (this._extensions !== undefined) return this._extensions;
        this._extensions = [];
        try {
            const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
            const gl = canvas && canvas.getContext("webgl2");
            if (gl) {
                this._extensions = gl.getSupportedExtensions() || [];
                const lose = gl.getExtension("WEBGL_lose_context");
                if (lose) lose.loseContext();
            }
        } catch (error) { this._extensions = []; }
        return this._extensions;
    },
    /** The first target this GPU samples, or null. */
    target() {
        if (this._target !== undefined) return this._target;
        const have = new Set(this.supportedExtensions());
        this._target = this.ORDER.find(name => this.TARGETS[name].extensions.every(ext => have.has(ext))) || null;
        return this._target;
    },
    usable() {
        return !!this.enabled && typeof Worker !== "undefined" && typeof Blob !== "undefined" && typeof fetch === "function"
            && typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && !!this.target();
    },
    /** Whether a glTF texture may be drawn from its compressed copy: never one the file samples nearest (pixel art). */
    allowed(json, textureDef) {
        const sampler = textureDef.sampler != null && json.samplers ? json.samplers[textureDef.sampler] : null;
        return !(sampler && (sampler.magFilter === 9728 || sampler.minFilter === 9728 || sampler.minFilter === 9984 || sampler.minFilter === 9986));
    },
    /** The transcoder worker, made from the transcoder's own script and the message loop below. */
    worker() {
        if (this._ready) return this._ready;
        const url = name => Reactor3D.workerUrl(name);
        this._ready = Promise.all([
            fetch(url(this.TRANSCODER)).then(response => { if (!response.ok && response.status !== 0) throw new Error("transcoder " + response.status); return response.text(); }),
            fetch(url(this.WASM)).then(response => { if (!response.ok && response.status !== 0) throw new Error("transcoder wasm " + response.status); return response.arrayBuffer(); })
        ]).then(([script, wasm]) => {
            const source = script + "\n;\n(" + reactorKtx2Worker.toString() + ")(self);";
            const blobUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
            const worker = new Worker(blobUrl, { name: "Reactor texture transcode" });
            URL.revokeObjectURL(blobUrl);
            worker.onmessage = event => {
                const job = this._jobs.get(event.data && event.data.id);
                if (!job) return;
                this._jobs.delete(job.id);
                if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data);
            };
            worker.onerror = event => {
                if (event && event.preventDefault) event.preventDefault();
                for (const job of this._jobs.values()) job.reject(new Error("transcoder worker failed"));
                this._jobs.clear();
                this._ready = null;
            };
            worker.postMessage({ init: true, wasm }, [wasm]);
            return worker;
        });
        // A transcoder that could not be made is tried again by the next picture (the editor names its
        // files once a 3D view is open); this picture is drawn as the file has it.
        const made = this._ready;
        made.catch(() => { if (this._ready === made) this._ready = null; });
        return this._ready;
    },
    /** Transcode KTX2 bytes (a Blob or bytes) at most `cap` texels on a side: { mipmaps, width, height, format, alpha }. */
    transcode(bytes, cap) {
        const target = this.target();
        return this.worker().then(worker => new Promise((resolve, reject) => {
            const id = ++this._serial;
            this._jobs.set(id, { id, resolve, reject });
            worker.postMessage({ id, bytes, cap, basis: this.TARGETS[target].basis });
            Reactor3D.IdleWorkers?.touch("ktx2", () => this._jobs.size > 0, () => {
                const ready = this._ready;
                this._ready = null;
                if (ready) ready.then(idle => idle.terminate(), () => {});
            });
        })).then(data => {
            const name = this.TARGETS[target].formats[data.alpha ? 1 : 0];
            return { mipmaps: data.mipmaps, width: data.width, height: data.height, format: THREE[name], alpha: data.alpha, target };
        });
    },
    /** A transcoded picture put on a texture made to wait for it: from then on it is three's CompressedTexture. */
    wear(texture, made) {
        Object.setPrototypeOf(texture, THREE.CompressedTexture.prototype);
        texture.isCompressedTexture = true;
        texture.image = { width: made.width, height: made.height };
        texture.mipmaps = made.mipmaps;
        texture.format = made.format;
        texture.type = THREE.UnsignedByteType;
        texture.generateMipmaps = false;
        texture.flipY = false;
        texture.minFilter = made.mipmaps.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
        texture.userData.rrCompressed = made.target;
        delete texture.userData.rrPending;
        texture.needsUpdate = true;
    },
    /** GPU bytes of a compressed texture's levels. */
    bytes(texture) {
        let total = 0;
        for (const level of texture.mipmaps || []) total += level && level.data ? level.data.byteLength : 0;
        return total;
    },
    /**
     * A model texture from a glTF texture's KTX2 copy, or null to take the file's own picture.
     * The texture waits (ShaderWarmup holds what wears it) until the transcode comes back; if it
     * fails, it takes the file's picture after all.
     */
    fromGlb(json, bin, textureDef, image, textures) {
        const basisu = textureDef.extensions && textureDef.extensions.KHR_texture_basisu;
        const ktx = basisu && json.images ? json.images[basisu.source] : null;
        if (!ktx || ktx.uri || ktx.bufferView == null || !this.usable() || !this.allowed(json, textureDef)) return null;
        const R = Reactor3D;
        const map = new THREE.Texture();
        map.userData.rrModelTexture = true;
        map.userData.rrPending = true;
        map.flipY = false;
        if (THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
        const bytes = R._glbImageBlob(json, bin, ktx);
        const fallback = image && !image.uri && image.bufferView != null ? R._glbImageBlob(json, bin, image) : null;
        this.transcode(bytes, R.textureCap()).then(made => this.wear(map, made), () => {
            if (!fallback) { delete map.userData.rrPending; return; }
            const url = URL.createObjectURL(fallback);
            new THREE.ImageLoader().load(url, img => {
                URL.revokeObjectURL(url);
                if (R.ImageWorker && R.ImageWorker.blobs) R.ImageWorker.blobs.set(img, fallback);
                map.image = R.capImage(img);
                delete map.userData.rrPending;
                map.needsUpdate = true;
            }, undefined, () => { URL.revokeObjectURL(url); delete map.userData.rrPending; });
        });
        textures.push(map);
        return map;
    }
};

/**
 * The transcoder worker's message loop, run after basis_transcoder.js in the worker (so `BASIS` is
 * there). The first message brings the WebAssembly; each later one a KTX2 file to transcode from the
 * first level at most `cap` on a side, its levels sent back as they will be uploaded.
 */
function reactorKtx2Worker(scope) {
    let ready = null;
    scope.onmessage = async event => {
        const job = event.data;
        if (job.init) {
            ready = new Promise(resolve => {
                const module = { wasmBinary: job.wasm, onRuntimeInitialized: () => resolve(module) };
                BASIS(module); // eslint-disable-line no-undef
            }).then(module => { module.initializeBasis(); return module; });
            return;
        }
        let file = null;
        try {
            const basis = await ready;
            const buffer = job.bytes && typeof job.bytes.arrayBuffer === "function" ? await job.bytes.arrayBuffer() : job.bytes;
            file = new basis.KTX2File(new Uint8Array(buffer));
            if (!file.isValid()) throw new Error("not a KTX2 file this transcoder reads");
            if (!file.startTranscoding()) throw new Error("the transcode could not start");
            const levels = Math.max(1, file.getLevels()), alpha = !!file.getHasAlpha(), format = job.basis[alpha ? 1 : 0];
            let first = 0;
            for (;;) {
                const info = file.getImageLevelInfo(first, 0, 0);
                if (first >= levels - 1 || !(job.cap > 0) || Math.max(info.origWidth, info.origHeight) <= job.cap) break;
                first++;
            }
            const mipmaps = [], transfer = [];
            for (let level = first; level < levels; level++) {
                const info = file.getImageLevelInfo(level, 0, 0);
                const data = new Uint8Array(file.getImageTranscodedSizeInBytes(level, 0, 0, format));
                if (!file.transcodeImage(data, level, 0, 0, format, 0, -1, -1)) throw new Error("level " + level + " did not transcode");
                mipmaps.push({ data, width: levels > 1 ? info.origWidth : info.width, height: levels > 1 ? info.origHeight : info.height });
                transfer.push(data.buffer);
            }
            scope.postMessage({ id: job.id, mipmaps, width: mipmaps[0].width, height: mipmaps[0].height, alpha }, transfer);
        } catch (error) {
            scope.postMessage({ id: job.id, error: String(error && error.message || error) });
        } finally {
            if (file) { try { file.close(); file.delete(); } catch (error) { /* already gone */ } }
        }
    };
}
Reactor3D._workerParts.ktx2Worker = reactorKtx2Worker;

Reactor3D._glbImageUrl = function(json, bin, image, baseUrl) {
    if (image.uri) {
        if (/^(data:|blob:|https?:|file:)/i.test(image.uri)) return image.uri;
        const cleaned = String(image.uri).replace(/\\/g, "/").replace(/^\.\//, "");
        return (baseUrl || "") + cleaned;
    }
    return URL.createObjectURL(this._glbImageBlob(json, bin, image));
};

/**
 * An embedded picture's bytes as a Blob: the one the GLB worker made, else cut from the binary chunk.
 * The worker's Blob serves every texture that names the picture (materials sharing one sheet): a
 * compacted chunk no longer holds those bytes.
 */
Reactor3D._glbImageBlob = function(json, bin, image) {
    if (image.rrBlob) return image.rrBlob;
    const view = json.bufferViews[image.bufferView];
    const bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    return new Blob([bytes], { type: image.mimeType || "image/png" });
};

Reactor3D._loadGlbTexture = function(json, bin, texInfo, baseUrl, textures, bitmaps, usedBitmaps) {
    if (!texInfo || !json.textures || !json.images) return null;
    const textureDef = json.textures[texInfo.index];
    if (!textureDef) return null;
    const image = json.images[textureDef.source];
    // A block-compressed copy of the picture (KHR_texture_basisu), where this GPU takes one.
    const compressed = this.KTX2.fromGlb(json, bin, textureDef, image, textures);
    if (compressed) return compressed;
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
    map.userData.rrModelTexture = true;
    map.flipY = false;
    if (THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
    // An embedded picture's Blob goes with its <img> to the image worker, which decodes from it (its
    // object URL is given back as soon as the <img> has loaded).
    const blob = !image.uri && image.bufferView != null && typeof Blob !== "undefined" ? this._glbImageBlob(json, bin, image) : null;
    const primary = blob ? URL.createObjectURL(blob) : this._glbImageUrl(json, bin, image, baseUrl);
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
                if (blob && Reactor3D.ImageWorker && Reactor3D.ImageWorker.blobs) Reactor3D.ImageWorker.blobs.set(loaded.image, blob);
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
        embedded.userData.rrModelTexture = true;
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

Reactor3D._glbSparseAccessor = function(json, bin, accessor) {
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT3: 9, MAT4: 16 }[accessor.type] || 1;
    const out = new Float32Array(accessor.count * comps);
    const views = json.bufferViews;
    const dense = (bufferView, byteOffset, componentType, count, type) =>
        this._glbAccessor({ accessors: [{ bufferView, byteOffset, componentType, count, type }], bufferViews: views }, bin, 0);
    if (accessor.bufferView != null) {
        const base = dense(accessor.bufferView, accessor.byteOffset || 0, accessor.componentType, accessor.count, accessor.type);
        const scale = accessor.normalized ? ({ 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[accessor.componentType] || 1) : 1;
        for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, base[i] / scale);
    }
    const sparse = accessor.sparse;
    if (!sparse || !sparse.count) return out;
    const indices = dense(sparse.indices.bufferView, sparse.indices.byteOffset || 0, sparse.indices.componentType, sparse.count, "SCALAR");
    const values = dense(sparse.values.bufferView, sparse.values.byteOffset || 0, accessor.componentType, sparse.count, accessor.type);
    // Normalized integers (KHR_mesh_quantization) read as -1..1.
    const unit = accessor.normalized ? ({ 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[accessor.componentType] || 1) : 1;
    for (let i = 0; i < sparse.count; i++) for (let c = 0; c < comps; c++) out[indices[i] * comps + c] = Math.max(-1, values[i * comps + c] / unit);
    return out;
};

/**
 * What Material.clone loses of a model material's surface (it copies userData
 * through JSON): its normal and emissive pictures, shared, and its glow, its
 * own (so one instance's glow can be changed alone).
 */
Reactor3D.carrySurfaceData = function(from, to) {
    const a = from && from.userData, b = to && to.userData;
    if (!a || !b) return to;
    if (a.rrNormalMap && a.rrNormalMap.isTexture) { b.rrNormalMap = a.rrNormalMap; b.rrNormalScale = a.rrNormalScale && a.rrNormalScale.clone ? a.rrNormalScale.clone() : a.rrNormalScale; if (a.rrNormalUv1) b.rrNormalUv1 = true; }
    if (a.rrEmissiveMap && a.rrEmissiveMap.isTexture) b.rrEmissiveMap = a.rrEmissiveMap;
    if (a.rrEmissive && a.rrEmissive.isColor) b.rrEmissive = a.rrEmissive.clone();
    if (a.rrHair) b.rrHair = true;
    return to;
};

Reactor3D.cloneSurfaceMaterial = function(material) {
    const data = material.userData;
    material.userData = Object.assign({}, data);
    if (data?.rrNormalMap?.isTexture) delete material.userData.rrNormalMap;
    if (data?.rrEmissiveMap?.isTexture) delete material.userData.rrEmissiveMap;
    let cloned;
    try {
        cloned = material.clone();
    } finally {
        material.userData = data;
    }
    return Reactor3D.carrySurfaceData(material, cloned);
};

/**
 * Per vertex, the way the picture's v runs over the surface (dP/dv), summed
 * over the triangles a vertex shares and normalized: a hair card's strand
 * direction, root to tip, smooth along the card. Zero where it cannot be told.
 */
Reactor3D.hairStrandDirections = function(geometry) {
    const pos = geometry.attributes.position, uv = geometry.attributes.uv, n = pos.count, out = new Float32Array(n * 3);
    const index = geometry.index ? geometry.index.array : null, count = index ? index.length : n;
    for (let t = 0; t + 2 < count; t += 3) {
        const a = index ? index[t] : t, b = index ? index[t + 1] : t + 1, c = index ? index[t + 2] : t + 2;
        const e1x = pos.getX(b) - pos.getX(a), e1y = pos.getY(b) - pos.getY(a), e1z = pos.getZ(b) - pos.getZ(a);
        const e2x = pos.getX(c) - pos.getX(a), e2y = pos.getY(c) - pos.getY(a), e2z = pos.getZ(c) - pos.getZ(a);
        const du1 = uv.getX(b) - uv.getX(a), dv1 = uv.getY(b) - uv.getY(a), du2 = uv.getX(c) - uv.getX(a), dv2 = uv.getY(c) - uv.getY(a);
        const det = du1 * dv2 - du2 * dv1;
        if (!(Math.abs(det) > 1e-12)) continue;
        const r = 1 / det;
        const bx = (e2x * du1 - e1x * du2) * r, by = (e2y * du1 - e1y * du2) * r, bz = (e2z * du1 - e1z * du2) * r;
        for (const v of [a, b, c]) { out[v * 3] += bx; out[v * 3 + 1] += by; out[v * 3 + 2] += bz; }
    }
    for (let v = 0; v < n; v++) {
        const x = out[v * 3], y = out[v * 3 + 1], z = out[v * 3 + 2], l = Math.hypot(x, y, z);
        if (l > 1e-12) { out[v * 3] = x / l; out[v * 3 + 1] = y / l; out[v * 3 + 2] = z / l; }
    }
    return out;
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
        // Its normal map, where it shares the picture's coordinates: lit by which way each texel faces
        // (Reactor3D.MODEL_FACING). Kept linear; a block-compressed copy is left out (its format is a color's).
        const normalInfo = def.normalTexture;
        // A normal map on the second coordinates (TEXCOORD_1): a fine repeating tile, a cloth's weave from the
        // Character Builder. Its own coordinates make the frame, so it needs no picture beside it.
        if (normalInfo && normalInfo.texCoord === 1) {
            const normal = this._loadGlbTexture(json, bin, normalInfo, baseUrl, textures, bitmaps, usedBitmaps);
            if (normal && !normal.isCompressedTexture) {
                normal.colorSpace = THREE.NoColorSpace || "";
                normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
                normal.needsUpdate = true;
                mat.userData.rrNormalMap = normal;
                mat.userData.rrNormalUv1 = true;
                // glTF's green points up the picture, against +v: the frame's v runs the other way.
                const k = normalInfo.scale != null ? Number(normalInfo.scale) : 1;
                mat.userData.rrNormalScale = new THREE.Vector2(k, -k);
            }
        } else if (map && normalInfo && !(normalInfo.texCoord > 0) && (!texInfo || !(texInfo.texCoord > 0))) {
            const normal = this._loadGlbTexture(json, bin, normalInfo, baseUrl, textures, bitmaps, usedBitmaps);
            if (normal && !normal.isCompressedTexture) {
                normal.colorSpace = THREE.NoColorSpace || "";
                normal.needsUpdate = true;
                mat.userData.rrNormalMap = normal;
                const k = normalInfo.scale != null ? Number(normalInfo.scale) : 1;
                mat.userData.rrNormalScale = new THREE.Vector2(k, k);
            }
        }
        // Its glow (emissiveFactor x KHR_materials_emissive_strength, times its emissive picture where that
        // shares the base picture's coordinates): added over the light (Reactor3D.injectSurfaceGlow).
        const emissive = Array.isArray(def.emissiveFactor) ? def.emissiveFactor : null;
        if (emissive && (emissive[0] > 0 || emissive[1] > 0 || emissive[2] > 0)) {
            const strength = def.extensions && def.extensions.KHR_materials_emissive_strength
                && Number(def.extensions.KHR_materials_emissive_strength.emissiveStrength) > 0
                ? Number(def.extensions.KHR_materials_emissive_strength.emissiveStrength) : 1;
            mat.userData.rrEmissive = new THREE.Color(emissive[0] * strength, emissive[1] * strength, emissive[2] * strength);
            const emitInfo = def.emissiveTexture;
            if (map && emitInfo && !(emitInfo.texCoord > 0) && (!texInfo || !(texInfo.texCoord > 0))) {
                const glow = this._loadGlbTexture(json, bin, emitInfo, baseUrl, textures, bitmaps, usedBitmaps);
                if (glow) mat.userData.rrEmissiveMap = glow;
            }
        }
        // Hair, as the Character Builder names it: a strand sheen over the light.
        if (/^(Hair|Beard)\b/.test(String(def.name || ""))) mat.userData.rrHair = true;
        // A file's own polished metal is remembered as a starting point for its
        // Surface; nothing reflects until the model's surface says so.
        const metallic = pbr.metallicFactor != null ? pbr.metallicFactor : 1;
        const roughness = pbr.roughnessFactor != null ? pbr.roughnessFactor : 1;
        if (metallic > 0.25 && roughness < 0.65) {
            const round = v => Math.round(v * 100) / 100;
            mat.userData.glbShine = { reflect: round(Math.max(0.2, metallic * (1 - roughness * 0.65))), gloss: round(1 - roughness), metal: round(metallic), tint: "#ffffff" };
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
            }
            if (prim.attributes.TEXCOORD_0 != null) {
                geometry.setAttribute("uv", new THREE.BufferAttribute(
                    this._glbAccessor(json, bin, prim.attributes.TEXCOORD_0), 2));
            }
            // The second coordinates, where a material's normal map rides them.
            if (prim.attributes.TEXCOORD_1 != null && materials[prim.material] && materials[prim.material].userData.rrNormalUv1) {
                geometry.setAttribute("uv1", new THREE.BufferAttribute(
                    this._glbAccessor(json, bin, prim.attributes.TEXCOORD_1), 2));
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
            // Morph targets (relative POSITION deltas), named from the mesh's extras.targetNames so
            // every Mesh made over this geometry finds them by name in its morphTargetDictionary.
            if (prim.targets && prim.targets.length && prim.targets.every(t => t.POSITION != null)) {
                const names = (mesh.extras && mesh.extras.targetNames) || [];
                geometry.morphAttributes.position = prim.targets.map((t, i) => {
                    const attribute = new THREE.BufferAttribute(this._glbAccessor(json, bin, t.POSITION), 3);
                    attribute.name = names[i] || "morph" + i;
                    return attribute;
                });
                geometry.morphTargetsRelative = true;
            }
            // After the index: computed without it, the vertices were taken three at a time as
            // triangles, and reading past the last one left a vector holding undefined, which boxes
            // every number three's vectors are given for the rest of the session.
            if (prim.attributes.NORMAL == null) geometry.computeVertexNormals();
            if (prim.attributes.JOINTS_0 != null && prim.attributes.WEIGHTS_0 != null) {
                geometry.userData.joints = this._glbAccessor(json, bin, prim.attributes.JOINTS_0);
                geometry.userData.weights = this._glbAccessor(json, bin, prim.attributes.WEIGHTS_0);
            }
            let material = materials[prim.material] || defaultMat;
            if (prim.attributes.COLOR_0 != null) {
                const source = material;
                material = Reactor3D.cloneSurfaceMaterial(material);
                Reactor3D.carrySurfaceData(source, material);
                material.vertexColors = true;
                material.__reactorModel = true;
                Reactor3D.litMaterial(material);
            }
            // Hair: the way each strand runs, smooth along the card, for its sheen.
            if (material.userData && material.userData.rrHair && geometry.attributes.uv) {
                geometry.setAttribute("rrHairDir", new THREE.BufferAttribute(Reactor3D.hairStrandDirections(geometry), 3));
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
 * The parts of a held thing that hang off its long axis on one side (a grip,
 * a magazine, a stock's toe; on the other side a scope), read from its
 * outline in `K` slices counted from the handle end. `points` are in the
 * thing's frame; `o` gives the slicing (`K`, `sliceK`), the side (`side` 1
 * for `down`, -1 for the other), `down`, the barrel's own `line` across the
 * two axes `others`, and the `length`. Returns `{ list, drop, under, wide }`:
 * each part as `{ from, to, centre, half, deep, wide, under }` (slices;
 * where it is and half its depth front to back as fractions of the length;
 * how far it hangs, half its thickness and the frame's level just ahead of
 * it, in the thing's units), the outline itself, the barrel's own thickness
 * and each slice's half thickness below the barrel. Null when nothing hangs.
 */
Reactor3D.heldLobes = function(points, o) {
    const K = o.K, drop = new Float32Array(K), wide = new Float32Array(K), seen = new Uint8Array(K), others = o.others, down = o.down, line = o.line;
    const d0 = down[others[0]] * o.side, d1 = down[others[1]] * o.side;
    let deepest = 0;
    for (const p of points) {
        const h = (p[others[0]] - line[others[0]]) * d0 + (p[others[1]] - line[others[1]]) * d1, k = o.sliceK(p);
        if (h > drop[k]) drop[k] = h;
        if (h > deepest) deepest = h;
        seen[k] = 1;
    }
    // A slice with no point of its own (a long flat face between its corners) is as deep as the shallower of its neighbors.
    for (let k = 0, before = -1; k < K; k++) {
        if (seen[k]) { before = k; continue; }
        let after = k + 1;
        while (after < K && !seen[after]) after++;
        const fill = before < 0 ? (after < K ? drop[after] : 0) : after >= K ? drop[before] : Math.min(drop[before], drop[after]);
        for (let j = k; j < after; j++) drop[j] = fill;
        k = after - 1;
    }
    // The barrel's own thickness is what its tip end reaches on this side of its line.
    let under = 0;
    for (let k = K - 3; k < K; k++) under = Math.max(under, drop[k]);
    // A hanging part is whatever reaches well below the barrel's own underside, however deep the deepest one
    // is: a rifle's grip is shallower than its magazine and still the grip.
    // (`o.hangs` gives the level instead: the other side of a part already found is read at that part's own measure.)
    const hangs = o.hangs || Math.max(o.length * .07, under * 2.2);
    if (!o.hangs && deepest < Math.max(o.length * .1, under * 2.2)) return null;
    // Sideways is square to the long axis and to down; a part's thickness is what hangs below the barrel there.
    for (const p of points) {
        const a = p[others[0]] - line[others[0]], b = p[others[1]] - line[others[1]];
        if (a * d0 + b * d1 <= hangs) continue;
        const k = o.sliceK(p), w = Math.abs(a * -d1 + b * d0);
        if (w > wide[k]) wide[k] = w;
    }
    const list = [];
    // A run of hanging slices is one part, or two where the outline comes nearly all the way back up between them.
    const split = (from, to) => {
        let best = -1, bestGap = 0;
        for (let k = from + 1; k < to; k++) {
            let left = 0, right = 0;
            for (let j = from; j < k; j++) left = Math.max(left, drop[j]);
            for (let j = k + 1; j <= to; j++) right = Math.max(right, drop[j]);
            const low = Math.min(left, right), gap = low - drop[k];
            if (gap > bestGap && drop[k] - hangs < (low - hangs) * .25) { bestGap = gap; best = k; }
        }
        if (best >= 0) { split(from, best - 1); split(best + 1, to); return; }
        let deep = 0;
        for (let k = from; k <= to; k++) deep = Math.max(deep, drop[k]);
        // Where the part is, and its depth front to back, are read where it is nearly as deep as its foot.
        const level = hangs + (deep - hangs) * .75;
        let first = -1, last = -1, thick = 0;
        for (let k = from; k <= to; k++) if (drop[k] >= level) { if (first < 0) first = k; last = k; thick = Math.max(thick, wide[k]); }
        let ahead = 0;
        for (let k = to + 1; k <= Math.min(K - 1, to + 2); k++) ahead = Math.max(ahead, drop[k]);
        list.push({ from, to, deep, centre: (first + last + 1) / 2 / K, half: (last - first + 1) / K / 2, wide: thick, under: Math.min(deep * .6, ahead || under) });
    };
    for (let k = 0; k < K; k++) {
        if (drop[k] <= hangs) continue;
        let to = k;
        while (to + 1 < K && drop[to + 1] > hangs) to++;
        split(k, to);
        k = to;
    }
    return list.length ? { list, drop, under, wide, hangs } : null;
};

/**
 * A held thing seen from its side, as filled cells: columns along its long
 * axis from the handle end, rows from above its barrel's line to its lowest
 * hanging point. `{ W, H, cell, lo, grid }` (`lo` the first row's height
 * below the line, negative above it), or null. Read from its whole surface,
 * so a hole through it (a skeleton stock, a trigger guard) shows as one.
 */
Reactor3D.heldSide = function(object) {
    const shape = this.heldShape(object);
    if (!shape) return null;
    if (shape.side !== undefined) return shape.side;
    shape.side = null;
    const cloud = this.heldCloud(object);
    if (!cloud || !cloud.count) return null;
    const W = 120, cell = shape.length / W, P = cloud.points, a = shape.axis, d = shape.down, b = shape.base, l = shape.line;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < cloud.count; i++) { const h = (P[i * 3] - l[0]) * d[0] + (P[i * 3 + 1] - l[1]) * d[1] + (P[i * 3 + 2] - l[2]) * d[2]; if (h < lo) lo = h; if (h > hi) hi = h; }
    const H = Math.ceil((hi - lo) / cell) + 1, grid = new Uint8Array(W * H);
    for (let i = 0; i < cloud.count; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        const c = Math.max(0, Math.min(W - 1, Math.floor(((x - b[0]) * a[0] + (y - b[1]) * a[1] + (z - b[2]) * a[2]) / cell)));
        grid[Math.floor(((x - l[0]) * d[0] + (y - l[1]) * d[1] + (z - l[2]) * d[2] - lo) / cell) * W + c] = 1;
    }
    return shape.side = { W, H, cell, lo, grid, sections: new Map() };
};

/**
 * Where fingers `need` thick (in the thing's own units) can take a gun's
 * grip: the rows of the grip, from just under the frame (the trigger guard)
 * down to its foot, where there is room for a finger in front of its front
 * strap. `{ top, foot, front, back, cell }`: the heights below the barrel's
 * line of the highest place a finger fits and of the foot, and per row from
 * `top` how far along the thing the front strap and the back strap are. A
 * grip that is one side of a loop (a skeleton stock) is read as that side.
 * Null for a thing with no hanging grip.
 */
Reactor3D.gripSection = function(object, need) {
    const shape = this.heldShape(object), side = shape && shape.handle ? this.heldSide(object) : null;
    if (!side) return null;
    const { W, H, cell, lo, grid } = side, room = Math.max(2, Math.round(need / cell));
    if (side.sections.has(room)) return side.sections.get(room);
    const filled = (r, c) => c >= 0 && c < W && r >= 0 && r < H && grid[r * W + c] === 1;
    // The grip's own run of filled cells in a row: the run that holds column `c` (or the nearest within a few
    // cells), a one-cell gap in the surface's points bridged.
    const run = (r, c) => {
        if (!filled(r, c)) { let found = -1; for (let k = 1; k <= 3 && found < 0; k++) { if (filled(r, c - k)) found = c - k; else if (filled(r, c + k)) found = c + k; } if (found < 0) return null; c = found; }
        let back = c, front = c;
        while (filled(r, back - 1) || filled(r, back - 2)) back--;
        while (filled(r, front + 1) || filled(r, front + 2)) front++;
        while (!filled(r, back)) back++;
        while (!filled(r, front)) front--;
        return [back, front];
    };
    const h = shape.handle, r0 = Math.max(0, Math.min(H - 1, Math.floor((h.drop - lo) / cell))), c0 = Math.round(h.along * W);
    const fronts = new Map(), backs = new Map();
    let section = null;
    const start = run(r0, c0);
    if (start) {
        fronts.set(r0, start[1]); backs.set(r0, start[0]);
        // Up to the frame: the row where the front strap runs on forward (the frame, the trigger guard) or leaves no room for a finger.
        const clear = (r, front) => { for (let k = 1; k <= room; k++) if (filled(r, front + k)) return false; return true; };
        let top = r0, c = Math.round((start[0] + start[1]) / 2);
        for (let r = r0 - 1; r >= 0; r--) {
            const at = run(r, c);
            if (!at || at[1] > fronts.get(r + 1) + Math.max(2, room) || !clear(r, at[1])) break;
            fronts.set(r, at[1]); backs.set(r, at[0]); top = r; c = Math.round((at[0] + at[1]) / 2);
        }
        // Down to the foot: where the grip ends, or a bar under the hand (a loop's lower side) runs on forward from it.
        let foot = r0; c = Math.round((start[0] + start[1]) / 2);
        for (let r = r0 + 1; r < H; r++) {
            const at = run(r, c);
            if (!at || at[1] > fronts.get(r - 1) + Math.max(2, room)) break;
            fronts.set(r, at[1]); backs.set(r, at[0]); foot = r; c = Math.round((at[0] + at[1]) / 2);
        }
        const front = new Float32Array(foot - top + 1), back = new Float32Array(foot - top + 1);
        for (let r = top; r <= foot; r++) { front[r - top] = (fronts.get(r) + 1) * cell; back[r - top] = backs.get(r) * cell; }
        section = { top: lo + top * cell, foot: lo + (foot + 1) * cell, front, back, cell };
    }
    side.sections.set(room, section);
    return section;
};

/** How far below its barrel's line a held thing's underside is, `along` it (a distance from its handle end), in its own units. */
Reactor3D.heldUnderside = function(object, along) {
    const side = this.heldSide(object);
    if (!side) return 0;
    const c = Math.max(0, Math.min(side.W - 1, Math.floor(along / side.cell)));
    for (let r = side.H - 1; r >= 0; r--) if (side.grid[r * side.W + c]) return side.lo + (r + 1) * side.cell;
    return 0;
};

/** The rig templates for things held in a hand, and the markers each cannot do without. */
Reactor3D.HELD_RIGS = { blade: ["gripTop", "gripBottom", "tip"], gun: ["gripTop", "gripBottom", "muzzle", "rear"] };

/**
 * A held thing's own markers: a model.json `rig` of template `blade` or
 * `gun` (markers only, in the model's frame), or null. A blade has
 * `gripTop`, `gripBottom`, `tip` and `edge`; a gun `gripTop`, `gripBottom`,
 * `trigger`, `muzzle`, `rear`, `foreGrip` and `stock`.
 */
Reactor3D.readHeldRig = function(json) {
    const raw = json && json.rig, need = raw && typeof raw === "object" ? this.HELD_RIGS[raw.template] : null;
    if (!need || !raw.markers || typeof raw.markers !== "object") return null;
    const markers = {};
    for (const key of Object.keys(raw.markers)) {
        const value = raw.markers[key];
        if (Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(n => Number.isFinite(Number(n)))) markers[key] = value.slice(0, 3).map(Number);
    }
    return need.every(key => markers[key]) ? { template: raw.template, markers } : null;
};

/**
 * Lay a held thing's markers over what its shape was read as; they win.
 * A blade: the handle runs Grip bottom to Grip top and the fist takes it
 * with the index finger at Grip top; the length is out to Tip, and Edge
 * (off the grip-to-tip line) says which way the edge faces. A gun: the
 * barrel's line is Rear to Muzzle, the grip hangs from Grip top to Grip
 * bottom, and `marks` keeps Trigger, Fore grip and a Stock that lies well
 * behind Rear (a long gun's butt, for the shoulder).
 */
Reactor3D.markHeldShape = function(shape, rig, cloud) {
    const m = rig.markers, sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const mix = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s], size = a => Math.hypot(a[0], a[1], a[2]);
    const unit = a => { const l = size(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : null; };
    const square = (a, axis) => unit(mix(a, axis, -dot(a, axis)));
    const each = visit => { if (cloud) for (let i = 0; i < cloud.count; i++) visit([cloud.points[i * 3], cloud.points[i * 3 + 1], cloud.points[i * 3 + 2]]); };
    if (rig.template === "gun") {
        const axis = unit(sub(m.muzzle, m.rear)), down = axis && square(sub(m.gripBottom, m.gripTop), axis);
        if (!axis || !down) return shape;
        const barrel = dot(sub(m.muzzle, m.rear), axis), behind = m.stock ? dot(sub(m.rear, m.stock), axis) : 0, stock = behind > barrel * .1;
        const base = mix(m.rear, axis, stock ? -behind : 0), length = barrel + (stock ? behind : 0);
        const mid = mix(m.gripTop, sub(m.gripBottom, m.gripTop), .5), h = p => dot(sub(p, m.rear), down), t = p => dot(sub(p, base), axis);
        const sideways = [axis[1] * down[2] - axis[2] * down[1], axis[2] * down[0] - axis[0] * down[2], axis[0] * down[1] - axis[1] * down[0]];
        // The grip's thickness and depth: its surface between the two markers, near the line through them.
        const top = h(m.gripTop), foot = h(m.gripBottom), span = Math.max(1e-6, foot - top);
        let wide = 0, front = -Infinity, back = Infinity;
        each(p => {
            const f = (h(p) - top) / span;
            if (f < .25 || f > .9) return;
            const off = t(p) - (t(m.gripTop) + (t(m.gripBottom) - t(m.gripTop)) * f);
            if (Math.abs(off) > span * .6) return;
            wide = Math.max(wide, Math.abs(dot(sub(p, m.rear), sideways)));
            if (off > front) front = off;
            if (off < back) back = off;
        });
        const radius = front > back ? (front - back) / 2 : span * .25;
        Object.assign(shape, { axis, down, up: down.map(n => -n), base, length, line: m.rear.slice(), side: undefined, grip: t(mid) / length, profile: null,
            handle: { at: mid, along: t(mid) / length, radius, side: wide || radius * .6, drop: h(mid), deep: foot, under: top },
            marks: { template: "gun", trigger: m.trigger || null, foreGrip: m.foreGrip || null, stock: stock ? m.stock : null } });
        return shape;
    }
    const axis = unit(sub(m.gripTop, m.gripBottom));
    if (!axis) return shape;
    const handle = size(sub(m.gripTop, m.gripBottom)), reach = dot(sub(m.tip, m.gripBottom), axis), length = reach > handle ? reach : Math.max(handle, size(sub(m.tip, m.gripBottom)));
    let up = null;
    if (m.edge) {
        const line = unit(sub(m.tip, m.gripTop)) || axis, off = sub(m.edge, m.gripTop), away = mix(off, line, -dot(off, line));
        if (size(away) > length * .01) up = square(away, axis);
    }
    if (!up) up = square(shape.up, axis) || square([axis[1], axis[2], axis[0]], axis);
    let radius = 0, count = 0;
    each(p => { const d = sub(p, m.gripBottom), a = dot(d, axis); if (a < handle * .2 || a > handle * .8) return; radius += size(mix(d, axis, -a)); count++; });
    Object.assign(shape, { axis, up, down: up.map(n => -n), base: m.gripBottom.slice(), length, grip: handle / 2 / length, gripRadius: count ? radius / count : shape.gripRadius,
        handle: null, profile: null, side: undefined, marks: { template: "blade", handle } });
    return shape;
};

/**
 * Where a held thing's markers start, read from its own shape (the model's
 * frame): what an author then nudges. `template` is `blade` or `gun`.
 */
Reactor3D.heldMarkerDefaults = function(object, template) {
    const s = object && this.HELD_RIGS[template] ? this.heldShape(object) : null;
    if (!s) return null;
    const off = [0, 1, 2].map(i => s.line[i] - s.base[i]), on = off[0] * s.axis[0] + off[1] * s.axis[1] + off[2] * s.axis[2];
    const origin = [0, 1, 2].map(i => s.base[i] + off[i] - s.axis[i] * on);
    const at = (from, along, drop) => [0, 1, 2].map(i => from[i] + s.axis[i] * s.length * along + s.down[i] * drop);
    if (template === "blade") {
        const wide = Math.max(s.gripRadius * 2, s.length * .03);
        return { gripBottom: at(s.base, s.grip * .35, 0), gripTop: at(s.base, Math.min(.5, s.grip * 1.65), 0), tip: at(s.base, 1, 0), edge: at(s.base, .6, -wide) };
    }
    const h = s.handle;
    if (!h) {
        const r = s.gripRadius;
        return { gripTop: at(origin, s.grip, r), gripBottom: at(origin, Math.max(0, s.grip - .06), r * 3), trigger: at(origin, s.grip + .08, r), muzzle: at(origin, 1, 0), rear: at(origin, s.grip, 0), foreGrip: at(origin, Math.min(.8, s.grip + .3), r), stock: at(origin, 0, r) };
    }
    const long = h.along * s.length > s.length * .15 && !!s.profile && h.along > .15, rear = at(origin, long ? h.along : 0, 0);
    return { gripTop: at(origin, h.along, h.under), gripBottom: at(origin, h.along, h.deep * .97), trigger: at(origin, h.along + h.radius / s.length + .04, h.under * .9),
        muzzle: at(origin, 1, 0), rear, foreGrip: at(origin, Math.min(.85, h.along + .3), h.under * .8), stock: long ? at(origin, 0, h.under * .5) : rear.slice() };
};

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
    const measured = this.heldMeasured(object);
    if (measured && measured.shape) return object.userData.__heldShape = measured.shape;
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
    // What a fist closes on. A slim thing (a sword, a staff): its handle, as thick as its narrowest slice there.
    // A thing with a part hanging off its long axis (a pistol, a rifle): that part, the grip. Of several hanging
    // parts the grip is the one nearest the handle end that is not the end itself (a stock), else the only one.
    const gripRadius = best < Infinity ? best : Math.max(length * .02, Math.min(...slices.filter(n => n > 0)));
    // The grip hangs on one side only (a sword's guard reaches both ways and is no grip), well clear of the
    // barrel's own thickness, over a short run of the length.
    let handle = null, hung = down, profile = null;
    // The thing's outline under (and over) its barrel's own line, in fine slices counted from the handle end.
    const K = 48, sliceK = p => Math.max(0, Math.min(K - 1, Math.floor(sign * (p[axis] - base[axis]) / length * K)));
    for (const side of [1, -1]) {
        const lobes = this.heldLobes(points, { K, sliceK, side, down, line, others, length });
        if (!lobes) continue;
        // The grip is the first part that hangs ahead of the stock (a part that reaches the very end is the
        // stock, unless it is the only one: a pistol's grip is at its rear), and it is in the rear of the thing:
        // a part hanging further forward is a magazine or a foregrip, and the hand takes the stock's neck instead.
        const ahead = lobes.list.filter(lobe => lobe.from > 0);
        // (A lone part at the end is a grip when it is a good part of the thing's length deep, as a pistol's is; a rifle's stock is not.)
        const lobe = ahead.length ? ahead[0] : lobes.list.length === 1 && lobes.list[0].deep > length * .25 ? lobes.list[0] : null;
        if (!lobe || lobe.centre > .45) continue;
        // A part that reaches as far the other way at the same place is a guard (a sword's), not a grip.
        const mirror = this.heldLobes(points, { K, sliceK, side: -side, down, line, others, length, hangs: lobes.hangs * .6 });
        if (mirror && mirror.list.some(other => { const both = Math.min(lobe.to, other.to) - Math.max(lobe.from, other.from) + 1, all = Math.max(lobe.to, other.to) - Math.min(lobe.from, other.from) + 1; return both / all > .6 && other.deep > lobe.deep * .6 && other.deep < lobe.deep * 1.6; })) continue;
        // Of two sides with a grip (a scope over a rifle is a hanging part too), the one nearer the handle end.
        if (handle && handle.along <= lobe.centre) continue;
        const at = [0, 0, 0];
        hung = down.map(n => n * side);
        at[axis] = base[axis] + sign * length * lobe.centre;
        for (const a of others) at[a] = line[a] + hung[a] * lobe.deep * .55;
        // `radius` is half the grip's depth along the barrel, `side` half its thickness across, `under` how far
        // below the barrel's line the frame is just ahead of it (where the trigger guard meets it), `deep` its foot.
        handle = { at, along: lobe.centre, radius: Math.max(length * .015, Math.min(length * .08, lobe.half * length)), side: lobe.wide || Math.min(size[others[0]], size[others[1]]) / 2, drop: lobe.deep * .55, deep: lobe.deep, under: lobe.under };
        profile = { K, drop: lobes.drop, under: lobes.under, wide: lobes.wide };
    }
    // A long gun with no grip of its own (a straight stock): the hand takes the wrist of the stock, just ahead of
    // where the butt stops hanging, with the fingers under it. A part as deep on the other side is a pommel, not a butt.
    if (!handle) {
        const lobes = this.heldLobes(points, { K, sliceK, side: 1, down, line, others, length }), stock = lobes && lobes.list[0];
        const mirror = stock && stock.from === 0 ? this.heldLobes(points, { K, sliceK, side: -1, down, line, others, length }) : null;
        if (stock && stock.from === 0 && stock.to < K * .45 && !(mirror && mirror.list[0].from === 0 && mirror.list[0].deep > stock.deep * .6)) {
            const k = Math.min(K - 1, stock.to + 2), drop = Math.max(lobes.drop[k], lobes.under), at = [0, 0, 0];
            at[axis] = base[axis] + sign * length * (k + .5) / K;
            for (const a of others) at[a] = line[a] + down[a] * drop * .5;
            handle = { at, along: (k + .5) / K, radius: length / K, side: lobes.wide[k] || Math.min(size[others[0]], size[others[1]]) / 2, drop: drop * .5, deep: drop, under: drop, stock: true };
            profile = { K, drop: lobes.drop, under: lobes.under, wide: lobes.wide };
        }
    }
    // `hang` is how far the bulk hangs off the long axis, as a fraction of the length: nothing for a sword, a good deal for a pistol's grip.
    const shape = { axis: unit, up: hung.map(n => -n), down: hung, length, base, centre, grip, slices: slices.map(n => Math.round(n * 1000) / 1000), size, widest, hang: hang / length, gripRadius, handle, profile, line };
    // The model's own markers (a Blade or Gun rig) say what its shape can only guess.
    if (object.userData.__heldRig) this.markHeldShape(shape, object.userData.__heldRig, this.heldCloud(object));
    object.userData.__heldShape = shape;
    if (measured) measured.shape = shape;
    return shape;
};

/**
 * Where a held model's measures are kept for the session: every copy of one
 * model laid out the same way (the same geometries in the same places under
 * it, the same markers) reads one shape and one surface. They were measured
 * again for every hand that took the model: 60 ms a weapon on the frame a
 * battle began. A copy with geometry of its own (a carved part) has its own.
 */
Reactor3D._heldMeasures = new Map();
Reactor3D.heldMeasured = function(object) {
    if (typeof THREE === "undefined") return null;
    const inverse = this._heldInverse || (this._heldInverse = new THREE.Matrix4()), m = this._heldRelative || (this._heldRelative = new THREE.Matrix4());
    inverse.copy(object.matrixWorld).invert();
    let key = "";
    object.traverse(mesh => {
        if (!mesh.isMesh || !mesh.geometry || !mesh.geometry.attributes || !mesh.geometry.attributes.position) return;
        const e = m.multiplyMatrices(inverse, mesh.matrixWorld).elements;
        key += mesh.geometry.uuid;
        for (let i = 0; i < 16; i++) key += "," + Math.round(e[i] * 1e4);
        key += "|";
    });
    if (!key) return null;
    if (object.userData.__heldRig) key += "#" + JSON.stringify(object.userData.__heldRig);
    let entry = this._heldMeasures.get(key);
    if (!entry) this._heldMeasures.set(key, entry = { shape: null, cloud: undefined });
    return entry;
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
    const rules = sidecar ? this.readModelAnimationRules(sidecar, clips) : [];
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
        const cloned = Reactor3D.cloneSurfaceMaterial(mat);
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
        Reactor3D.carrySurfaceData(mat, cloned);
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
 * Free what an instance of `template` holds on the GPU of its own: carved
 * part geometries and its skeletons' bone textures. On a shared renderer
 * nothing else frees them. A carved part draws from the template's vertex
 * buffers, which stay for every other copy; only its own index goes.
 * Materials are the caller's.
 */
Reactor3D.releaseModelInstance = function(object, template) {
    if (!object || !template) return;
    const geometries = new Set(), buffers = new Set(), skeletons = new Set();
    template.traverse(node => {
        const geometry = node.geometry;
        if (geometry) {
            geometries.add(geometry);
            for (const name of Object.keys(geometry.attributes)) buffers.add(geometry.attributes[name]);
            if (geometry.index) buffers.add(geometry.index);
        }
        if (node.skeleton) skeletons.add(node.skeleton);
    });
    object.traverse(node => {
        const geometry = node.geometry;
        if (geometry && !geometries.has(geometry)) {
            for (const name of Object.keys(geometry.attributes)) if (buffers.has(geometry.attributes[name])) delete geometry.attributes[name];
            if (geometry.index && buffers.has(geometry.index)) geometry.index = null;
            geometry.dispose();
        }
        if (node.skeleton && !skeletons.has(node.skeleton)) node.skeleton.dispose();
    });
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
        // The box likewise: Box3.setFromObject (the beam's hit test) otherwise
        // runs every vertex through its bones the first time it meets one.
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        if (geometry.boundingBox && !child.boundingBox) child.boundingBox = geometry.boundingBox.clone();
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
 *       releases; an action pose plays in and out over its period),
 *       "drive" (turns `degrees` times an input of the state, -1 to 1,
 *       about `axisVector`: a steered part).
 *       "glow" (a light that lives: the emissive of the part's materials —
 *       or of materials named by `material` — breathes, flickers or
 *       scrolls; `mode` "pulse" | "flicker" | "scroll", `period` frames,
 *       `min`/`max` the share of the authored emissive intensity, `uv`
 *       [u, v] emissive map turns per second for a scroll. Only uniforms
 *       change: nothing is rebuilt or recompiled).
 * trigger: "always", "idle", "moving", or "action" — actions play on
 * demand by name (the Play Model Animation event command).
 * part: prefix of a named part recorded by the readers ("" = whole model);
 * rules turn parts about their own recorded pivots. "parts" entries carve
 * regions the source file never named into parts of their own — see
 * readModelParts/carveModelParts below.
 * `clips` (optional): the clips in the model's file (AnimationClips or
 * names); those named for a movement state play in it (ownClipAnimations).
 */
Reactor3D.readModelAnimationRules = function(json, clips) {
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
            const key = {
                at: Math.min(1, Math.max(0, Number(raw.at) || 0)),
                rotate: vec3(raw.rotate),
                move: vec3(raw.move),
                resize: vec3(raw.resize, 1)
            };
            // How the step into this key goes (Reactor3D.KEY_EASES); none flows smoothly through.
            if (Reactor3D.KEY_EASES.includes(raw.ease)) key.ease = raw.ease;
            keys.push(key);
        }
        keys.sort((a, b) => a.at - b.at);
        return keys;
    };
    for (let i = 0; i < list.length; i++) {
        const raw = list[i] || {};
        const type = raw.type === "swing" || raw.type === "bob" || raw.type === "clip"
            || raw.type === "pose" || raw.type === "drive" || raw.type === "glow" ? raw.type : "spin";
        const keys = readKeys(raw.keys);
        const rule = {
            name: String(raw.name || raw.part || type + "-" + i),
            part: String(raw.part || ""),
            // `library` names a motion of the shared motion library (attachLibraryMotions) in place of a clip in the file.
            clip: raw.library ? Reactor3D.LIBRARY_CLIP_PREFIX + String(raw.library) : String(raw.clip || ""),
            // Playback-rate multiplier for embedded clips (1 = authored speed).
            rate: Number(raw.rate) > 0 ? Number(raw.rate) : 1,
            type,
            axis: raw.axis === "x" || raw.axis === "z" ? raw.axis : "y",
            trigger: ["idle", "moving", "walking", "dashing", "jumping", "swimming", "treading", "climbing", "riding", "action"].indexOf(raw.trigger) >= 0
                ? raw.trigger : "always",
            speed: Number(raw.speed) > 0 ? Number(raw.speed) : 90,
            perTile: Number(raw.perTile) > 0 ? Number(raw.perTile) : 0,
            // A drive rule's turn at full input is signed, and may be none; every other rule's is a size.
            degrees: type === "drive" && raw.degrees !== undefined && raw.degrees !== null && Number.isFinite(Number(raw.degrees))
                ? Number(raw.degrees) : (Number(raw.degrees) > 0 ? Number(raw.degrees) : 15),
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
            effects: readEffects(raw.effects),
            // One of the rig's own default motions, not the model's (reactor_rig_motions.js).
            defaultMotion: !!raw.defaultMotion
        };
        // A clip in the model's file playing in the state its name says, not an animation of the sidecar's.
        if (raw.ownClip) rule.ownClip = true;
        if (raw.library) rule.library = String(raw.library);
        // What a wheel and a steered part carry (a vehicle's rules), kept only on a rule that has them:
        // `exact` reaches the part by its whole name, not by prefix; `axisVector` is the line it turns
        // about (model space, kept at unit length) in place of `axis`; `radius` (model units) rolls a
        // spin with the road; `input` names what a drive rule follows (only a drive rule has one).
        if (raw.exact === true) rule.exact = true;
        if (Array.isArray(raw.axisVector)) {
            const x = Number(raw.axisVector[0]), y = Number(raw.axisVector[1]), z = Number(raw.axisVector[2]);
            const length = Math.hypot(x, y, z);
            if (Number.isFinite(length) && length > 1e-9) rule.axisVector = [x / length, y / length, z / length];
        }
        if (Number.isFinite(Number(raw.radius)) && Number(raw.radius) > 0) rule.radius = Number(raw.radius);
        if (type === "drive") rule.input = String(raw.input || "");
        if (type === "glow") {
            rule.mode = raw.mode === "flicker" || raw.mode === "scroll" ? raw.mode : "pulse";
            rule.material = String(raw.material || "");
            const lo = Number.isFinite(Number(raw.min)) ? Number(raw.min) : 0.35, hi = Number.isFinite(Number(raw.max)) ? Number(raw.max) : 1;
            rule.min = Math.max(0, Math.min(lo, hi));
            rule.max = Math.max(rule.min, Math.max(lo, hi));
            const uv = Array.isArray(raw.uv) ? raw.uv : [0, 0];
            rule.uv = [Number(uv[0]) || 0, Number(uv[1]) || 0];
        }
        rules.push(rule);
    }
    // A rigged model plays its template's default motion for every state it
    // has none of its own for: it climbs, swims and jumps before anyone
    // animates it. `defaultMotions: false` in the sidecar turns that off.
    const own = this.ownClipAnimations(list, clips, json);
    let all = own.length ? list.concat(own) : list;
    if (own.length) rules.push(...this.readModelAnimationRules({ animations: own }));
    const rig = json && json.rig && typeof json.rig === "object" ? json.rig : null;
    // The shared library's motions (attachLibraryMotions) for the states still open, then the rig's own procedural ones.
    const library = rig && json.defaultMotions !== false ? this.libraryMotionRules(all, clips) : [];
    if (library.length) {
        rules.push(...this.readModelAnimationRules({ animations: library }));
        all = all.concat(library);
    }
    const presets = rig && json.defaultMotions !== false ? Reactor3D.rigMotionPresets() : null;
    if (presets && presets.defaultRules) {
        const extra = presets.defaultRules(String(rig.template || "humanoid"), all);
        if (extra.length) return rules.concat(this.readModelAnimationRules({ animations: extra }));
    }
    return rules;
};

/**
 * The words a clip in a model's file is named by for each movement state: "Walk" or "Walking"
 * plays while walking, "Run" or "Sprint" while dashing, "Idle" or "Breathe" when still.
 */
Reactor3D.CLIP_STATE_NAMES = {
    idle: ["idle", "breathe", "breathing", "stand", "standing"],
    walking: ["walk", "walking"],
    dashing: ["run", "running", "dash", "dashing", "sprint", "sprinting"],
    jumping: ["jump", "jumping"],
    swimming: ["swim", "swimming"],
    treading: ["tread", "treading", "tread water", "treading water"],
    climbing: ["climb", "climbing"],
    riding: ["ride", "riding"]
};

/**
 * The movement state a clip's name says it is for, or null: `{ state, exact }`. An exporter's
 * "Armature|" prefix, a trailing number ("Idle_9") and "loop" or "in place" are not part of the
 * name; `exact` is false when one of those was taken off.
 */
Reactor3D.clipStateOf = function(name) {
    let text = String(name || "");
    text = text.slice(text.lastIndexOf("|") + 1).replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const whole = text;
    for (let previous = null; previous !== text;) {
        previous = text;
        text = text.replace(/\s*(?:\d+|loop|looped|cycle|in ?place)$/, "").trim();
    }
    for (const state of Object.keys(this.CLIP_STATE_NAMES)) {
        if (this.CLIP_STATE_NAMES[state].indexOf(text) >= 0) return { state, exact: text === whole };
    }
    return null;
};

/**
 * Clip rules for the clips in a model's file that name a movement state its
 * own animations leave open (`list`, the sidecar's), so a model with a
 * "Walking" clip walks with it before anyone adds the clip. An animation set
 * for the state wins over the clip, and the clip over the rig's default
 * motion. A clip named exactly wins over a numbered or "in place" one, then
 * the first in the file. A walk with no run beside it also plays while
 * dashing, unless the rig's default run does.
 */
Reactor3D.ownClipAnimations = function(list, clips, json) {
    if (!Array.isArray(clips) || !clips.length) return [];
    const covers = state => (list || []).some(rule => rule && rule.trigger && (rule.trigger === state
        || (rule.trigger === "moving" && (state === "walking" || state === "dashing"))
        || (state === "treading" && rule.trigger === "swimming" && rule.type === "clip")));
    const best = {};
    for (const clip of clips) {
        const name = clip && typeof clip === "object" ? clip.name : clip;
        const match = name ? this.clipStateOf(name) : null;
        if (!match || covers(match.state)) continue;
        const kept = best[match.state];
        if (!kept || (match.exact && !kept.exact)) best[match.state] = { name: String(name), exact: match.exact };
    }
    const out = [];
    for (const state of Object.keys(this.CLIP_STATE_NAMES)) {
        if (best[state]) out.push({ name: best[state].name, type: "clip", clip: best[state].name, trigger: state, ownClip: true });
    }
    const walk = out.find(rule => rule.trigger === "walking");
    if (walk && !best.dashing && !covers("dashing")) {
        const rig = json && json.rig && typeof json.rig === "object" ? json.rig : null;
        const presets = rig && json.defaultMotions !== false ? this.rigMotionPresets() : null;
        const table = presets && presets.DEFAULTS ? presets.DEFAULTS[String(rig.template || "humanoid")] : null;
        if (!(table && table.dashing)) walk.trigger = "moving";
    }
    return out;
};

/** The rig presets (reactor_rig_motions.js), wherever this runs; null when absent. */
Reactor3D.rigMotionPresets = function() {
    const root = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : null);
    if (root && root.RigMotionPresets) return root.RigMotionPresets;
    if (typeof module !== "undefined" && typeof require === "function") {
        try { return require("./reactor_rig_motions.js"); } catch (error) { return null; }
    }
    return null;
};

/**
 * The shared motion library (reactor_3d_motions.js, its data in
 * reactor_3d_motions.bin beside it): the motion-captured walk, run, jump,
 * swim, treading and ladder climb a rigged humanoid plays in each state it
 * has no motion of its own for. Read from the disk the first time a rigged
 * humanoid's model.json loads; a browser fetches it then (whenMotionLibrary).
 * Null while it is not in.
 */
Reactor3D.motionLibrary = function() {
    const root = typeof window !== "undefined" ? window : globalThis;
    let library = root.RRMotionLibrary || null;
    if (!library && !this._motionLibraryTried) {
        this._motionLibraryTried = true;
        try {
            if (typeof window === "undefined" && typeof require === "function") library = require("./reactor_3d_motions.js");
            else if (typeof require === "function" && typeof document !== "undefined" && typeof process !== "undefined" && process.mainModule) {
                const fs = require("fs");
                const path = require("path");
                const file = path.join(path.dirname(process.mainModule.filename), "js", "reactor_3d_motions.js");
                if (fs.existsSync(file)) {
                    // On the page itself, so its arrays are the page's own.
                    const script = document.createElement("script");
                    script.textContent = fs.readFileSync(file, "utf8") + "\n//# sourceURL=" + file;
                    document.head.appendChild(script);
                    script.remove();
                    library = root.RRMotionLibrary || null;
                    if (library && !library.dataPath) library.dataPath = path.join(path.dirname(file), "reactor_3d_motions.bin");
                }
            }
        } catch (error) {
            library = null;
        }
    }
    if (!library || !library.STATE_MOTIONS) return null;
    if (library.ready()) return library;
    if (this._motionLibraryUnread) return null;
    if (library.load()) return library;
    // Where the disk can be read and holds no data, it is not looked for again.
    if (typeof require === "function") this._motionLibraryUnread = true;
    return null;
};

/** Resolves once the motion library is in, or will not be, for a model.json whose rig is a humanoid's. */
Reactor3D.whenMotionLibrary = function(json) {
    const rig = json && json.rig;
    if (!rig || typeof rig !== "object" || (rig.template && rig.template !== "humanoid") || json.defaultMotions === false
        || this.motionLibrary() || typeof document === "undefined" || typeof window === "undefined") return Promise.resolve();
    if (!this._motionLibraryLoading) {
        this._motionLibraryLoading = new Promise(resolve => {
            const fetchData = () => {
                const library = window.RRMotionLibrary;
                if (!library) { resolve(); return; }
                library.loadAsync("js/reactor_3d_motions.bin").then(resolve, resolve);
            };
            if (window.RRMotionLibrary) { fetchData(); return; }
            const script = document.createElement("script");
            script.src = "js/reactor_3d_motions.js";
            script.async = true;
            script.onload = fetchData;
            script.onerror = () => resolve();
            document.head.appendChild(script);
        });
    }
    return this._motionLibraryLoading;
};

/** The names the motion library knows a humanoid rig's joints by. */
Reactor3D.LIBRARY_BONE_NAMES = {
    Hips: "Hips", Spine: "Spine", Chest: "Spine2", Neck: "Neck", Head: "Head",
    LeftUpperArm: "LeftArm", LeftLowerArm: "LeftForeArm", LeftHand: "LeftHand",
    LeftUpperLeg: "LeftUpLeg", LeftLowerLeg: "LeftLeg", LeftFoot: "LeftFoot",
    RightUpperArm: "RightArm", RightLowerArm: "RightForeArm", RightHand: "RightHand",
    RightUpperLeg: "RightUpLeg", RightLowerLeg: "RightLeg", RightFoot: "RightFoot"
};

/** The start of a library motion's clip name: no movement state reads it as its own (clipStateOf). */
Reactor3D.LIBRARY_CLIP_PREFIX = "__reactor_motion_";

/**
 * A rigged humanoid's skeleton at rest, as the motion library reads one:
 * its joints in the root's frame (the rig's), in order, parents first, each
 * one's parent the nearest joint above it the library moves. Besides the
 * rig's own joints, a file's collarbones, the joint between the spine and
 * the chest and the toes. `holders` are the file's other joints, which the
 * motions keep at rest. Null without the hips, an arm and a leg.
 */
Reactor3D.libraryRestSkeleton = function(root) {
    const byRig = new Map();
    root.traverse(node => {
        const part = node.userData && node.userData.__reactorRigBone && node.userData.parts && node.userData.parts[0];
        if (part && !byRig.has(part.name)) byRig.set(part.name, node);
    });
    const picked = new Map();
    for (const name of Object.keys(this.LIBRARY_BONE_NAMES)) if (byRig.has(name)) picked.set(byRig.get(name), this.LIBRARY_BONE_NAMES[name]);
    const fileJoint = node => !!node && node !== root && this.isRigJoint(node) && !(node.userData && node.userData.__reactorFinger);
    const chest = byRig.get("Chest"), spine = byRig.get("Spine");
    for (const side of ["Left", "Right"]) {
        const arm = byRig.get(side + "UpperArm");
        if (arm && chest && fileJoint(arm.parent) && !picked.has(arm.parent) && arm.parent.parent === chest) picked.set(arm.parent, side + "Shoulder");
        const foot = byRig.get(side + "Foot");
        const toe = foot ? foot.children.find(child => fileJoint(child) && !picked.has(child)) : null;
        if (toe) picked.set(toe, side + "ToeBase");
    }
    if (spine && chest && fileJoint(chest.parent) && !picked.has(chest.parent) && chest.parent.parent === spine) picked.set(chest.parent, "Spine1");
    const named = new Set(picked.values());
    if (!["Hips", "LeftArm", "LeftForeArm", "LeftUpLeg"].every(name => named.has(name))) return null;
    root.updateMatrixWorld(true);
    const unturn = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const turn = new THREE.Quaternion();
    const turnOf = node => (node && node !== root ? unturn.clone().multiply(node.getWorldQuaternion(turn)) : new THREE.Quaternion()).toArray();
    const order = [];
    const holders = [];
    root.traverse(node => {
        if (picked.has(node)) order.push(node);
        else if (fileJoint(node) && (node.isBone || (node.userData && node.userData.__reactorClipBone))) holders.push({ node, rest: node.quaternion.toArray() });
    });
    const at = new Map(order.map((node, i) => [node, i]));
    const round = v => Math.round(v * 1e4) / 1e4;
    const joints = order.map(node => {
        let above = node.parent;
        while (above && above !== root && !at.has(above)) above = above.parent;
        const head = node.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot).toArray();
        const joint = { node, name: picked.get(node), parent: above && at.has(above) ? at.get(above) : -1, head,
            rest: turnOf(node), parentRest: turnOf(node.parent), position: node.position.toArray() };
        if (joint.parent < 0 && node.parent) {
            // A rise in the root's frame, in the hips' parent's own (turned, and scaled for a file's armature).
            const toParent = new THREE.Matrix4().copy(toRoot).multiply(node.parent.matrixWorld).invert();
            const origin = new THREE.Vector3().applyMatrix4(toParent);
            joint.up = new THREE.Vector3(0, 1, 0).applyMatrix4(toParent).sub(origin).toArray();
        }
        return joint;
    });
    const signature = joints.map(j => [j.name, j.parent, ...j.head, ...j.rest, ...j.parentRest, ...j.position, ...(j.up || [])].map(v => typeof v === "number" ? round(v) : v).join(","))
        .concat(holders.map(h => h.rest.map(round).join(","))).join("|");
    return { joints, holders, signature };
};

/**
 * Gives a rigged humanoid (applyModelRig) the library's motions as clips:
 * one for each state the file's own clips are not named for, played there,
 * and the rest for the model's own rules to name (`library` on a clip rule). A clip holds
 * no keys until it first plays (resolveLibraryMotion); readModelAnimationRules
 * plays each in its state where the model's own animations leave it open.
 */
Reactor3D.attachLibraryMotions = function(root, rig) {
    if (!root || !rig || (rig.template || "humanoid") !== "humanoid" || typeof THREE === "undefined" || !THREE.AnimationMixer) return;
    const library = this.motionLibrary();
    if (!library) return;
    const own = root.__reactorClips || [];
    const named = new Set();
    for (const clip of own) {
        const match = clip && clip.name ? this.clipStateOf(clip.name) : null;
        if (match) named.add(match.state);
    }
    // The states the file leaves open play the library's motion for them; every other motion (Guard, Sword
    // Swing, Hit, Death...) is there too, for a rule of the model's own to name (`library`). None holds keys until it plays.
    const open = new Map(library.STATE_MOTIONS.filter(motion => !named.has(motion.state)).map(motion => [motion.id, motion]));
    const wanted = Array.from(open.values());
    for (const pose of library.POSES || []) if (!open.has(pose.id)) wanted.push({ id: pose.id, state: null, name: pose.label });
    if (!wanted.length) return;
    const skeleton = this.libraryRestSkeleton(root);
    if (!skeleton) return;
    const clips = wanted.map(motion => {
        const clip = new THREE.AnimationClip(this.LIBRARY_CLIP_PREFIX + motion.id, 1, []);
        clip.__reactorLibrary = { id: motion.id, state: motion.state, name: motion.name, skeleton, resolved: false };
        return clip;
    });
    root.__reactorClips = own.concat(clips);
    // The rig's own bones follow the clips as a file's do, and a pose bends them from the clip's pose.
    for (const joint of skeleton.joints) if (joint.node.isBone) joint.node.userData.__reactorClipBone = true;
};

/** The rules that play a model's library motions (attachLibraryMotions) in the states `list` leaves open. */
Reactor3D.libraryMotionRules = function(list, clips) {
    if (!Array.isArray(clips) || !clips.length) return [];
    const presets = this.rigMotionPresets();
    const covers = presets && presets.covers ? presets.covers : (rules, state) => rules.some(rule => rule && rule.trigger === state);
    const out = [];
    for (const clip of clips) {
        const info = clip && clip.__reactorLibrary;
        if (!info || !info.state || covers(list || [], info.state) || out.some(rule => rule.trigger === info.state)) continue;
        out.push({ name: info.name, type: "clip", clip: clip.name, trigger: info.state, defaultMotion: true });
    }
    return out;
};

/**
 * Fills a library motion's clip with its keys the first time it plays: the
 * library's motion made for this skeleton, each joint's turn carried into
 * its own frame, worked out once for every copy of the model.
 */
Reactor3D.resolveLibraryMotion = function(clip) {
    const info = clip && clip.__reactorLibrary;
    if (!info || info.resolved) return clip;
    info.resolved = true;
    const cache = this._libraryMotions || (this._libraryMotions = new Map());
    let made = cache.get(info.skeleton.signature);
    if (!made) {
        made = new Map();
        cache.set(info.skeleton.signature, made);
        if (cache.size > 48) cache.delete(cache.keys().next().value);
    }
    let data = made.get(info.id);
    if (data === undefined) {
        const library = this.motionLibrary();
        data = library ? this.retargetLibraryMotion(library, info.skeleton, info.id) : null;
        made.set(info.id, data);
    }
    if (!data) return clip;
    const { joints, holders } = info.skeleton;
    for (const track of data.tracks) {
        const node = track.joint >= 0 ? joints[track.joint].node : holders[track.holder].node;
        const Track = track.path === "position" ? THREE.VectorKeyframeTrack : THREE.QuaternionKeyframeTrack;
        clip.tracks.push(new Track(node.uuid + "." + track.path, track.times, track.values));
    }
    clip.duration = data.duration;
    return clip;
};

/**
 * One library motion on a skeleton (libraryRestSkeleton): { duration,
 * tracks: [{ joint | holder, path, times, values }] }. The library turns
 * joints that rest unturned; a joint of this skeleton turns by its parent's
 * rest frame undone, the library's turn, then its own rest frame. The hips
 * rise in their parent's frame.
 */
Reactor3D.retargetLibraryMotion = function(library, skeleton, id) {
    const bones = skeleton.joints.map(joint => ({ name: joint.name, parent: joint.parent, head: joint.head }));
    let motion = null;
    try {
        motion = library.stateClip(bones, id);
    } catch (error) {
        console.error("Reactor3D: the motion library's " + id + " could not be made for this model.", error);
        return null;
    }
    if (!motion || !motion.times.length) return null;
    const mul = (a, b, out, o) => {
        out[o] = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1];
        out[o + 1] = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0];
        out[o + 2] = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3];
        out[o + 3] = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
    };
    const duration = Math.max(1 / 30, motion.times[motion.times.length - 1]);
    const tracks = [];
    const left = [0, 0, 0, 1], key = [0, 0, 0, 1], step = [0, 0, 0, 0];
    for (const track of motion.tracks) {
        const joint = skeleton.joints[track.bone];
        const times = track.times || motion.times;
        if (!joint) continue;
        if (track.path === "translation") {
            if (!joint.up) continue;
            const values = new Float32Array(times.length * 3);
            for (let f = 0; f < times.length; f++) {
                const rise = track.values[f * 3 + 1] - joint.head[1];
                for (let k = 0; k < 3; k++) values[f * 3 + k] = joint.position[k] + joint.up[k] * rise;
            }
            tracks.push({ joint: track.bone, path: "position", times, values });
            continue;
        }
        const p = joint.parentRest;
        left[0] = -p[0]; left[1] = -p[1]; left[2] = -p[2]; left[3] = p[3];
        const values = new Float32Array(times.length * 4);
        for (let f = 0; f < times.length; f++) {
            for (let k = 0; k < 4; k++) key[k] = track.values[f * 4 + k];
            mul(left, key, step, 0);
            mul(step, joint.rest, values, f * 4);
        }
        tracks.push({ joint: track.bone, path: "quaternion", times, values });
    }
    // The file's other joints hold their rest through the motion, whatever a clip before it left them at.
    const still = Float32Array.of(0, duration);
    skeleton.holders.forEach((holder, index) => {
        tracks.push({ holder: index, joint: -1, path: "quaternion", times: still, values: Float32Array.from(holder.rest.concat(holder.rest)) });
    });
    return { duration, tracks };
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
            // Its bounds are the whole mesh's: three measures a geometry by every vertex of its attributes,
            // whichever its index names, so each copy of a model measured the same vertices again for each
            // part (a detailed vehicle's fourteen, a quarter of a frame's time each time one came into view).
            if (!geometry.boundingSphere) geometry.computeBoundingSphere();
            sub.boundingSphere = geometry.boundingSphere.clone();
            if (geometry.boundingBox) sub.boundingBox = geometry.boundingBox.clone();
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
 * that bone registers as the part. A rig bone whose nearest bone went to
 * another takes the free bone of its own name, and the rig's root is a
 * bone that carries what its children took. The clips keep driving those bones;
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
    const REACH = 0.35;
    const aliasesOf = def => this.RIG_BONE_ALIASES[def.name] || [this.normalizeBoneName(def.name)];
    const scoreOf = (index, j, named) => { const distance = places[j].distanceTo(heads[index]) / span; return named ? distance * 0.5 : distance; };
    const picks = rig.bones.map((def, index) => {
        const aliases = aliasesOf(def);
        let bone = -1;
        let score = Infinity;
        bones.forEach((candidate, j) => {
            const value = scoreOf(index, j, aliases.indexOf(names[j]) >= 0);
            if (value < score) { score = value; bone = j; }
        });
        return { index, bone, score };
    });
    // The surest matches claim their bones first; a rig bone whose bone is
    // already taken, or that stands nowhere near one, stays unmapped.
    picks.sort((a, b) => a.score - b.score);
    const taken = new Set();
    const chosen = rig.bones.map(() => -1);
    for (const pick of picks) {
        if (pick.bone < 0 || taken.has(pick.bone) || pick.score > REACH) continue;
        taken.add(pick.bone);
        chosen[pick.index] = pick.bone;
    }
    // The nearest free bone that bears a rig bone's name, within reach; -1 for none. `fits` narrows the choice.
    const namedFor = (index, fits) => {
        const aliases = aliasesOf(rig.bones[index]);
        let bone = -1;
        let score = REACH;
        bones.forEach((candidate, j) => {
            if (taken.has(j) || aliases.indexOf(names[j]) < 0 || (fits && !fits(candidate))) return;
            const value = scoreOf(index, j, true);
            if (value <= score) { score = value; bone = j; }
        });
        return bone;
    };
    // One left without (its nearest bone went to a surer match: a thigh's to the forearm hanging beside it) takes
    // the bone that bears its name.
    rig.bones.forEach((def, index) => {
        if (chosen[index] >= 0) return;
        const bone = namedFor(index);
        if (bone >= 0) { taken.add(bone); chosen[index] = bone; }
    });
    // The rig's root stands over the rest: a bone that carries none of what the root's children took (a coat's, a
    // belt's, nearer the marker than the pelvis) gives way to the bone of its name that carries them all.
    const isAbove = (above, bone) => { for (let node = bone; node; node = node.parent) if (node === above) return true; return false; };
    rig.bones.forEach((def, index) => {
        if (def.parent >= 0 || chosen[index] < 0) return;
        const under = [];
        rig.bones.forEach((other, j) => { if (other.parent === index && chosen[j] >= 0) under.push(bones[chosen[j]]); });
        const carries = bone => under.every(child => isAbove(bone, child));
        if (!under.length || carries(bones[chosen[index]])) return;
        const bone = namedFor(index, carries);
        if (bone < 0) return;
        taken.delete(chosen[index]);
        taken.add(bone);
        chosen[index] = bone;
    });
    let mapped = 0;
    chosen.forEach((j, index) => {
        if (j < 0) return;
        const bone = bones[j];
        const def = rig.bones[index];
        bone.userData.parts = [{ name: def.name, pivot: [0, 0, 0] }];
        bone.userData.__reactorRigBone = true;
        bone.userData.__reactorClipBone = true;
        bone.userData.__reactorBoneTail = def.tail.slice();
        mapped++;
    });
    root.userData.rigged = true;
    root.userData.rigMapped = mapped;
    this.attachRigHands(root, rig, bones.filter(b => b.userData && b.userData.__reactorRigBone));
    // A file with no finger bones of its own: the new finger joints take their share of the hands' skin.
    this.skinRigFingers(root);
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
        // (A model stood on its idle clip's lowest point has been moved under its own frame by that much: the
        // markers were placed on the model as it loads, so they go with it. Else every finger joint sits off its finger.)
        const ground = Number(root.userData && root.userData.reactorClipGround) || 0;
        const local = point => point ? hand.worldToLocal(root.localToWorld(new THREE.Vector3(point[0], point[1] - ground, point[2]))).toArray() : null;
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
        // The fingers themselves: joints under the hand, so it can close on what it holds.
        this.attachRigFingers(root, hand, side, points, palm);
    }
};

/**
 * Fingers. A rig's hand markers place each finger and thumb by a base and a
 * tip; from those the hand gains two joints per finger (base to middle,
 * middle to tip: RightIndex1, RightIndex2 and so on), which is what lets a
 * hand close round a held thing. A model whose file already has finger bones
 * uses those. The joints are plain nodes, not rig parts: they are not posed
 * by hand and not listed anywhere; `Reactor3D.HandGrip` turns them.
 */
Reactor3D.RIG_FINGERS = ["thumb", "index", "middle", "ring", "pinky"];

/** The finger joints a rig's markers describe, in the model's frame; none without a base and a tip. */
Reactor3D.rigFingerDefs = function(rig) {
    const out = [], markers = (rig && rig.markers) || {};
    for (const side of ["Left", "Right"]) {
        for (const finger of this.RIG_FINGERS) {
            const base = markers[finger + "Base" + side[0]], tip = markers[finger + "Tip" + side[0]];
            if (!Array.isArray(base) || !Array.isArray(tip)) continue;
            if (!(Math.hypot(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]) > 1e-6)) continue;
            const label = side + finger[0].toUpperCase() + finger.slice(1);
            out.push({ side, finger, hand: side + "Hand", names: [label + "1", label + "2"], base: base.slice(0, 3), mid: [0, 1, 2].map(i => (base[i] + tip[i]) / 2), tip: tip.slice(0, 3) });
        }
    }
    return out;
};

/** How a file's own first finger bone is named (Mixamo, VRM, Blender), as `normalizeBoneName` reads it. */
Reactor3D.fingerBoneAliases = function(side, finger) {
    const s = side.toLowerCase(), c = s[0];
    const list = [s + "hand" + finger + "1", s + finger + "1", s + finger + "01", s + finger + "proximal", finger + "1" + c, finger + "01" + c,
        "f" + finger + "01" + c, finger + "proximal" + c, c + finger + "1", s + "hand" + finger + "proximal"];
    if (finger === "thumb") list.unshift(s + "thumbmetacarpal", "thumbmetacarpal" + c);
    if (finger === "pinky") list.push(s + "handlittle1", s + "little1", s + "littleproximal", "little1" + c, "flittle01" + c, "fpinky01" + c);
    return list;
};

/**
 * How a hand's fingers are laid out and how each may turn, from points in the
 * hand joint's own frame (`points[finger] = { base, tip }`, the wrist at the
 * origin). Pure numbers: the palm's frame (`along` wrist to knuckles,
 * `across` index to little finger, `normal` the way the palm faces), and for
 * each finger its base, middle and tip, the axis it closes about (toward the
 * palm; the thumb across it), how far it may open (straight, never behind the
 * palm) and close, and its thickness.
 */
Reactor3D.handGripLayout = function(points, side, palm) {
    const order = this.RIG_FINGERS.filter(f => points && points[f] && points[f].base && points[f].tip);
    const four = order.filter(f => f !== "thumb");
    if (!order.length) return null;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s], length = a => Math.hypot(a[0], a[1], a[2]);
    const unit = a => { const l = length(a); return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]; };
    const bases = (four.length ? four : order).map(f => points[f].base);
    const knuckles = bases.reduce((sum, p) => [sum[0] + p[0] / bases.length, sum[1] + p[1] / bases.length, sum[2] + p[2] / bases.length], [0, 0, 0]);
    const along = unit(knuckles);
    let across = four.length >= 2 ? sub(points[four[four.length - 1]].base, points[four[0]].base) : null;
    const span = across ? length(across) : 0;
    if (!across || span < 1e-9) {
        // One finger alone: any direction square to the hand's length serves.
        across = Math.abs(along[0]) < 0.9 ? cross(along, [1, 0, 0]) : cross(along, [0, 1, 0]);
    }
    across = unit(sub(across, scale(along, dot(across, along))));
    // Right hand: along x across faces out of the palm; the left is its mirror.
    const normal = unit(side === "Right" ? cross(along, across) : cross(across, along));
    const radius = four.length >= 2 ? span / (four.length - 1) / 2 : length(sub(points[order[0]].tip, points[order[0]].base)) * 0.3;
    const fingers = [];
    for (const finger of order) {
        const base = points[finger].base.slice(0, 3), tip = points[finger].tip.slice(0, 3), reach = sub(tip, base), size = length(reach), dir = unit(reach);
        if (!(size > 1e-9)) continue;
        const thumb = finger === "thumb";
        let hinge;
        if (thumb) {
            // The thumb closes across the palm: about the hand's length, the way that brings it round to the palm's side.
            hinge = along.slice();
            if (dot(cross(hinge, dir), normal) < 0) hinge = scale(hinge, -1);
            if (length(cross(hinge, dir)) < 0.2) { hinge = unit(cross(dir, normal)); }
        } else {
            hinge = unit(sub(across, scale(dir, dot(across, dir))));
            if (dot(cross(hinge, dir), normal) < 0) hinge = scale(hinge, -1);
        }
        const rest = Math.asin(Math.max(-1, Math.min(1, dot(dir, normal))));
        fingers.push({
            finger, thumb, base, tip, mid: [0, 1, 2].map(i => (base[i] + tip[i]) / 2), length: size, hinge,
            // A finger closes from where it rests and never opens past it (a relaxed hand rests a little closed).
            open: 0,
            max1: thumb ? 1.2 : Math.max(0.25, 1.45 - Math.max(0, rest)),
            max2: thumb ? 1.0 : 1.65,
            radius: thumb ? radius * 1.1 : radius
        });
    }
    return { side, along, across, normal, knuckles, radius, palm: palm ? palm.slice(0, 3) : scale(knuckles, 0.7), fingers };
};

Reactor3D._handGrips = new WeakMap();

/**
 * Give a hand its finger joints: the file's own finger bones when it has
 * them, else new joints at the marked bases and middles. `skinRigFingers`
 * then lets the new ones carry the fingers' skin.
 */
Reactor3D.attachRigFingers = function(root, hand, side, points, palm) {
    const layout = this.handGripLayout(points, side, palm);
    if (!layout || !layout.fingers.length) return null;
    const V = a => new THREE.Vector3().fromArray(a);
    hand.updateMatrixWorld(true);
    const handQuat = hand.getWorldQuaternion(new THREE.Quaternion());
    const named = new Map();
    hand.traverse(node => { if (node !== hand) named.set(this.normalizeBoneName(node.name), node); });
    for (const entry of layout.fingers) {
        const hinge = V(entry.hinge);
        let first = null;
        for (const alias of this.fingerBoneAliases(side, entry.finger)) { if (named.has(alias)) { first = named.get(alias); break; } }
        if (first) {
            // The file's own finger: its bones, down the chain, each turned about the hinge as its parent sees it.
            const chain = [];
            for (let node = first; node && chain.length < 3; node = node.children.find(c => c.isBone || c.children.length || c.userData.__reactorClipBone) || node.children[0]) chain.push(node);
            entry.file = true;
            entry.joints = chain.map(node => {
                const parentQuat = node.parent.getWorldQuaternion(new THREE.Quaternion());
                return { node, rest: node.quaternion.clone(), axis: hinge.clone().applyQuaternion(parentQuat.invert().multiply(handQuat)).normalize() };
            });
            const at = chain.map(node => hand.worldToLocal(node.getWorldPosition(new THREE.Vector3())).toArray());
            entry.base = at[0];
            if (at[1]) entry.mid = at[1];
        } else {
            const one = new THREE.Object3D(), two = new THREE.Object3D();
            const label = side + entry.finger[0].toUpperCase() + entry.finger.slice(1);
            one.name = label + "1"; two.name = label + "2";
            one.userData.__reactorFinger = true; two.userData.__reactorFinger = true;
            one.position.fromArray(entry.base);
            two.position.set(entry.mid[0] - entry.base[0], entry.mid[1] - entry.base[1], entry.mid[2] - entry.base[2]);
            one.add(two); hand.add(one);
            entry.joints = [{ node: one, rest: one.quaternion.clone(), axis: hinge.clone() }, { node: two, rest: two.quaternion.clone(), axis: hinge.clone() }];
        }
        entry.now = [0, 0];
        entry.goal = [0, 0];
    }
    hand.updateMatrixWorld(true);
    const grip = { hand, layout, file: layout.fingers.some(f => f.file), stamp: -1, held: null, last: null, closed: false };
    this._handGrips.set(hand, grip);
    return grip;
};

/** The finger joints a model's hands gained that are not in its file (they need skin of their own). */
Reactor3D.rigFingerJoints = function(root) {
    const out = [];
    root.traverse(node => {
        const grip = this._handGrips.get(node);
        if (!grip) return;
        for (const entry of grip.layout.fingers) if (!entry.file) out.push({ hand: node, entry, one: entry.joints[0].node, two: entry.joints[1].node });
    });
    return out;
};

/**
 * Share a hand's skin among its finger joints. `read(i, c)` and `weight(i, c)`
 * give vertex i's four bone indices and weights; `toHand` maps a bind-pose
 * vertex into the hand joint's frame. A vertex the hand carries that lies
 * along a finger (within reach of its line, past its base) hands that share
 * to the finger's first joint, and past its middle to the second, easing over
 * the knuckle so the palm does not crease. Returns { index, weight } (four per
 * vertex) and how many vertices changed.
 */
Reactor3D.fingerSkinWeights = function(count, position, read, weight, hands, triangles) {
    const index = new Uint16Array(count * 4), out = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) for (let c = 0; c < 4; c++) { index[i * 4 + c] = read(i, c); out[i * 4 + c] = weight(i, c); }
    // A file's end bone on a hand (a leaf that only marks where the hand stops) often carries the fingertips'
    // skin. It never moves on its own, so that skin is the hand's: counted as the hand's here, it goes on to the fingers.
    for (const hand of hands) {
        if (!hand.ends || !hand.ends.length) continue;
        for (let i = 0; i < count; i++) {
            let mine = -1;
            for (let c = 0; c < 4; c++) if (index[i * 4 + c] === hand.index && out[i * 4 + c] > 0) { mine = c; break; }
            for (let c = 0; c < 4; c++) {
                if (out[i * 4 + c] <= 0 || hand.ends.indexOf(index[i * 4 + c]) < 0) continue;
                if (mine < 0) { index[i * 4 + c] = hand.index; mine = c; }
                else { out[i * 4 + mine] += out[i * 4 + c]; out[i * 4 + c] = 0; }
            }
        }
    }
    const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const p = [0, 0, 0], slots = new Array(6), shares = new Float32Array(6);
    let changed = 0;
    for (const hand of hands) {
        const m = hand.toHand;
        // With the mesh's triangles in hand, each finger is the part of the surface that grows from its tip.
        const regions = triangles !== undefined ? this.fingerRegions(count, position, triangles, hand, index, out) : null;
        hand.mitt = !!(regions && regions.mitt);
        hand.shared = regions ? [regions.joined || 0, regions.own || 0] : null;
        for (let i = 0; i < count; i++) {
            let at = -1;
            for (let c = 0; c < 4; c++) if (index[i * 4 + c] === hand.index && out[i * 4 + c] > 0.01) { at = c; break; }
            if (at < 0) continue;
            const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
            p[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; p[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; p[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
            let best = null, bestD = Infinity, bestT = 0;
            if (regions) {
                const label = regions.label[i];
                if (label < 0) continue;
                // Fingers the mesh does not separate turn as one, on one finger's joints, measured along the hand's middle.
                const own = hand.fingers[label];
                best = regions.mitt && !own.thumb ? hand.fingers[regions.carrier] : own;
                bestT = regions.t[i];
                // One mitt bends along one line across the hand: its place along the hand's middle, not each finger's own.
                if (regions.mitt && !own.thumb) {
                    const line = regions.mittLine;
                    bestT = Math.min(bestT + 0.25, ((p[0] - line.base[0]) * (line.tip[0] - line.base[0]) + (p[1] - line.base[1]) * (line.tip[1] - line.base[1]) + (p[2] - line.base[2]) * (line.tip[2] - line.base[2])) / (line.length * line.length));
                }
                bestD = 0;
            } else for (const f of hand.fingers) {
                const ux = (f.tip[0] - f.base[0]) / f.length, uy = (f.tip[1] - f.base[1]) / f.length, uz = (f.tip[2] - f.base[2]) / f.length;
                const dx = p[0] - f.base[0], dy = p[1] - f.base[1], dz = p[2] - f.base[2];
                const along = dx * ux + dy * uy + dz * uz, t = along / f.length;
                if (t < -0.3 || t > 1.5) continue;
                const d = Math.hypot(dx - ux * along, dy - uy * along, dz - uz * along) / (f.radius * 1.7);
                if (d < 1 && d < bestD) { best = f; bestD = d; bestT = t; }
            }
            if (!best) continue;
            const share = smooth(-0.25, 0.2, bestT) * (1 - smooth(0.8, 1, bestD));
            if (share < 0.004) continue;
            const second = smooth(0.34, 0.66, bestT), own = out[i * 4 + at];
            let n = 0;
            for (let c = 0; c < 4; c++) if (c !== at && out[i * 4 + c] > 0) { slots[n] = index[i * 4 + c]; shares[n++] = out[i * 4 + c]; }
            slots[n] = hand.index; shares[n++] = own * (1 - share);
            slots[n] = best.one; shares[n++] = own * share * (1 - second);
            slots[n] = best.two; shares[n++] = own * share * second;
            // The four strongest, made to sum to what they summed to.
            let total = 0; for (let k = 0; k < n; k++) total += shares[k];
            for (let c = 0; c < 4; c++) {
                let top = -1;
                for (let k = 0; k < n; k++) if (shares[k] >= 0 && (top < 0 || shares[k] > shares[top])) top = k;
                if (top < 0 || shares[top] <= 0) { index[i * 4 + c] = 0; out[i * 4 + c] = 0; continue; }
                index[i * 4 + c] = slots[top]; out[i * 4 + c] = shares[top]; shares[top] = -1;
            }
            let kept = 0; for (let c = 0; c < 4; c++) kept += out[i * 4 + c];
            if (kept > 0) for (let c = 0; c < 4; c++) out[i * 4 + c] *= total / kept;
            changed++;
        }
        // Fingers modelled touching share a triangle here and there (too few for a mitt). A triangle whose corners
        // are different fingers' would tear when they close unequally: each of its places takes the mean of the
        // triangle's corners instead, so that strip of skin turns with both fingers.
        if (regions && regions.node && !hand.mitt) {
            const node = regions.node, label = regions.label, all = triangles ? triangles.count / 3 : Math.floor(count / 3), corner = k => (triangles ? triangles.getX(k) : k);
            const mixes = new Map();
            for (let t = 0; t < all; t++) {
                const a = corner(t * 3), b = corner(t * 3 + 1), c = corner(t * 3 + 2);
                if (node[a] < 0 || node[b] < 0 || node[c] < 0) continue;
                // Corners of two fingers or more (a corner of none is not counted).
                const la = label[a], lb = label[b], lc = label[c];
                if (!((la >= 0 && lb >= 0 && la !== lb) || (la >= 0 && lc >= 0 && la !== lc) || (lb >= 0 && lc >= 0 && lb !== lc))) continue;
                const tri = [a, b, c];
                const mean = new Map();
                for (const i of tri) for (let c = 0; c < 4; c++) if (out[i * 4 + c] > 0) mean.set(index[i * 4 + c], (mean.get(index[i * 4 + c]) || 0) + out[i * 4 + c] / 3);
                for (const i of tri) {
                    let mix = mixes.get(node[i]);
                    if (!mix) mixes.set(node[i], mix = new Map());
                    for (const [bone, w] of mean) mix.set(bone, (mix.get(bone) || 0) + w);
                }
            }
            if (mixes.size) for (let i = 0; i < count; i++) {
                const mix = node[i] >= 0 ? mixes.get(node[i]) : null;
                if (!mix) continue;
                let whole = 0;
                for (let c = 0; c < 4; c++) whole += out[i * 4 + c];
                const top = [...mix].sort((a, b) => b[1] - a[1]).slice(0, 4), kept = top.reduce((sum, e) => sum + e[1], 0);
                for (let c = 0; c < 4; c++) { index[i * 4 + c] = top[c] ? top[c][0] : 0; out[i * 4 + c] = top[c] && kept > 0 ? top[c][1] / kept * whole : 0; }
            }
        }
    }
    return { index, weight: out, changed };
};

/**
 * Which finger each of a hand's vertices belongs to, from the mesh itself:
 * the surface is walked outward from each fingertip at once, across shared
 * edges (vertices at one place count as one, so a seam does not stop it),
 * and a vertex is the finger whose tip it is nearest along the surface, as
 * far down as that finger's knuckle. So a finger is all of its own surface,
 * however thick or curled, and nothing of its neighbour. Where neighbouring
 * fingers turn out to share triangles along their length (a mitten, fingers
 * only painted on), `mitt` says so: the four turn as one. `triangles` is the
 * geometry's index (or null for three vertices a triangle). Returns
 * `{ label: Int8Array (finger index or -1), mitt, carrier, mittLine }`.
 */
Reactor3D.fingerRegions = function(count, position, triangles, hand, skinIndex, skinWeight) {
    const m = hand.toHand, fingers = hand.fingers, label = new Int8Array(count).fill(-1);
    // The hand's own vertices, in the hand's frame, one node for each place.
    const node = new Int32Array(count).fill(-1), places = new Map(), at = [];
    let radius = 0;
    for (const f of fingers) radius = Math.max(radius, f.radius);
    const quantum = Math.max(radius * 0.01, 1e-9);
    for (let i = 0; i < count; i++) {
        let mine = false;
        for (let c = 0; c < 4; c++) if (skinIndex[i * 4 + c] === hand.index && skinWeight[i * 4 + c] > 0.01) { mine = true; break; }
        if (!mine) continue;
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        const px = m[0] * x + m[4] * y + m[8] * z + m[12], py = m[1] * x + m[5] * y + m[9] * z + m[13], pz = m[2] * x + m[6] * y + m[10] * z + m[14];
        const key = Math.round(px / quantum) + "," + Math.round(py / quantum) + "," + Math.round(pz / quantum);
        let n = places.get(key);
        if (n === undefined) { n = at.length / 3; places.set(key, n); at.push(px, py, pz); }
        node[i] = n;
    }
    const nodes = at.length / 3;
    if (!nodes) return { label, mitt: false, carrier: -1, mittLine: null };
    const edges = Array.from({ length: nodes }, () => []);
    const total = triangles ? triangles.count / 3 : Math.floor(count / 3), corner = k => (triangles ? triangles.getX(k) : k);
    const link = (a, b) => { if (a !== b && edges[a].indexOf(b) < 0) { edges[a].push(b); edges[b].push(a); } };
    const faces = [];
    for (let t = 0; t < total; t++) {
        const a = node[corner(t * 3)], b = node[corner(t * 3 + 1)], c = node[corner(t * 3 + 2)];
        if (a < 0 || b < 0 || c < 0) continue;
        link(a, b); link(b, c); link(c, a); faces.push(a, b, c);
    }
    // How far along its finger a place is (0 the base, 1 the tip), by its way over the surface from the tip:
    // a field with no seams, that fades into the palm on every side of the knuckle alike. A finger's surface
    // from tip to base is a little longer than the straight line between its markers.
    const reach = 1.1;
    const owner = new Int8Array(nodes).fill(-1), far = new Float64Array(nodes).fill(Infinity);
    const along = (f, n) => 1 - far[n] / (f.length * reach);
    // Whose knuckle each place is nearest, over the surface: a place can only start the finger it belongs to by
    // that measure, so a tip marker set nearer a neighbour's fingertip does not start on the neighbour.
    const home = new Int8Array(nodes).fill(-1), walk = new Float64Array(nodes).fill(Infinity);
    let ring = [];
    fingers.forEach((f, fi) => {
        let best = -1, bestD = Infinity;
        for (let n = 0; n < nodes; n++) { const d = Math.hypot(at[n * 3] - f.base[0], at[n * 3 + 1] - f.base[1], at[n * 3 + 2] - f.base[2]); if (d < bestD) { bestD = d; best = n; } }
        if (best >= 0 && bestD < walk[best]) { walk[best] = bestD; home[best] = fi; ring.push(best); }
    });
    while (ring.length) {
        const next = [];
        for (const a of ring) for (const b of edges[a]) {
            const d = walk[a] + Math.hypot(at[a * 3] - at[b * 3], at[a * 3 + 1] - at[b * 3 + 1], at[a * 3 + 2] - at[b * 3 + 2]);
            if (d >= walk[b] - 1e-12) continue;
            walk[b] = d; home[b] = home[a]; next.push(b);
        }
        ring = next;
    }
    let front = [];
    fingers.forEach((f, fi) => {
        let best = -1, bestD = Infinity;
        for (let n = 0; n < nodes; n++) { const d = Math.hypot(at[n * 3] - f.tip[0], at[n * 3 + 1] - f.tip[1], at[n * 3 + 2] - f.tip[2]); if (d < bestD) { bestD = d; best = n; } }
        if (best < 0) return;
        let seeded = 0;
        const mine = n => home[n] < 0 || home[n] === fi;
        // The start is the skin nearest the tip's marker (and whatever is as near): measured on Fleagus and
        // Carol, starting from the whole fingertip moved the bend off the joint and stretched more.
        const tipReach = bestD < f.radius * 3 && owner[best] < 0 && mine(best) ? bestD * 1.02 : -1;
        for (let n = 0; n < nodes; n++) {
            const reachHere = Math.hypot(at[n * 3] - f.tip[0], at[n * 3 + 1] - f.tip[1], at[n * 3 + 2] - f.tip[2]);
            if (owner[n] >= 0 || reachHere > tipReach || !mine(n)) continue;
            // Only what is nearer this tip than any other finger's: fingertips that lie close together keep their own.
            let nearer = false;
            for (const other of fingers) if (other !== f && Math.hypot(at[n * 3] - other.tip[0], at[n * 3 + 1] - other.tip[1], at[n * 3 + 2] - other.tip[2]) < reachHere) { nearer = true; break; }
            if (nearer) continue;
            // The marker stands inside the fingertip, about a finger's thickness from its skin.
            owner[n] = fi; far[n] = Math.max(0, reachHere - f.radius); front.push(n); seeded++;
        }
        if (seeded) return;
        // A tip marker placed by hand can stand off the skin, or nearer a neighbour's fingertip than its own: the
        // finger then starts from the skin furthest out along its own line (base to tip), among the skin that lies
        // nearer this finger's line than any other's. With no such skin past the finger's middle, it has no start.
        const line = (g, n) => {
            const ax = g.tip[0] - g.base[0], ay = g.tip[1] - g.base[1], az = g.tip[2] - g.base[2], px = at[n * 3] - g.base[0], py = at[n * 3 + 1] - g.base[1], pz = at[n * 3 + 2] - g.base[2];
            const t = (px * ax + py * ay + pz * az) / (ax * ax + ay * ay + az * az), c = Math.max(0, Math.min(1.25, t));
            return [t, Math.hypot(px - ax * c, py - ay * c, pz - az * c)];
        };
        let start = -1, startT = 0.5;
        for (let n = 0; n < nodes; n++) {
            if (owner[n] >= 0 || !mine(n)) continue;
            const [t, d] = line(f, n);
            if (t <= startT || t > 1.25 || d > f.radius * 3) continue;
            let theirs = false;
            if (home[n] < 0) for (const other of fingers) if (other !== f && line(other, n)[1] < d) { theirs = true; break; }
            if (!theirs) { start = n; startT = t; }
        }
        if (start >= 0) { owner[start] = fi; far[start] = Math.max(0, (1 - Math.min(1, startT)) * f.length); front.push(start); }
    });
    // Every tip's surface grows at once; a place goes to the tip it is nearest along the surface.
    while (front.length) {
        const next = [];
        for (const a of front) {
            const f = fingers[owner[a]];
            for (const b of edges[a]) {
                const d = far[a] + Math.hypot(at[a * 3] - at[b * 3], at[a * 3 + 1] - at[b * 3 + 1], at[a * 3 + 2] - at[b * 3 + 2]);
                if (d >= far[b] - 1e-12 || d > f.length * reach * 1.3) continue;
                far[b] = d; owner[b] = owner[a]; next.push(b);
            }
        }
        front = next;
    }
    // A hand built of separate pieces (armour plates, a glove's own shell): a piece no tip's walk can reach
    // goes to the finger whose line it lies along, by its place on that line.
    const piece = new Int32Array(nodes).fill(-1), walked = [];
    let pieces = 0;
    for (let n = 0; n < nodes; n++) {
        if (piece[n] >= 0) continue;
        let reached = false;
        const stack = [n]; piece[n] = pieces;
        while (stack.length) { const a = stack.pop(); if (far[a] === 0) reached = true; for (const b of edges[a]) if (piece[b] < 0) { piece[b] = pieces; stack.push(b); } }
        walked.push(reached); pieces++;
    }
    const loose = new Float32Array(nodes);
    for (let n = 0; n < nodes; n++) {
        if (walked[piece[n]]) continue;
        let bestD = 1;
        fingers.forEach((f, fi) => {
            const dx = at[n * 3] - f.base[0], dy = at[n * 3 + 1] - f.base[1], dz = at[n * 3 + 2] - f.base[2];
            const ux = (f.tip[0] - f.base[0]) / f.length, uy = (f.tip[1] - f.base[1]) / f.length, uz = (f.tip[2] - f.base[2]) / f.length;
            const run = dx * ux + dy * uy + dz * uz, t = run / f.length;
            if (t < -0.3 || t > 1.5) return;
            const d = Math.hypot(dx - ux * run, dy - uy * run, dz - uz * run) / (f.radius * 1.7);
            if (d < bestD) { bestD = d; owner[n] = fi; loose[n] = t; far[n] = (1 - t) * f.length * reach; }
        });
    }
    // Triangles that join two fingers well up their length: the mesh does not separate them.
    let joined = 0, own = 0;
    for (let t = 0; t < faces.length; t += 3) {
        const a = owner[faces[t]], b = owner[faces[t + 1]], c = owner[faces[t + 2]];
        if (a < 0 || b < 0 || c < 0 || fingers[a].thumb || fingers[b].thumb || fingers[c].thumb) continue;
        if (Math.min(along(fingers[a], faces[t]), along(fingers[b], faces[t + 1]), along(fingers[c], faces[t + 2])) < 0.3) continue;
        own++;
        if (a !== b || b !== c) joined++;
    }
    const four = fingers.map((f, i) => i).filter(i => !fingers[i].thumb);
    // (A few shared triangles at a web or a touching fingertip do not make a mitten.)
    const mitt = four.length > 1 && joined > Math.max(6, own * 0.04);
    let carrier = -1, mittLine = null;
    if (mitt) {
        carrier = four[Math.floor((four.length - 1) / 2)];
        const base = [0, 0, 0], tip = [0, 0, 0];
        for (const i of four) for (let k = 0; k < 3; k++) { base[k] += fingers[i].base[k] / four.length; tip[k] += fingers[i].tip[k] / four.length; }
        mittLine = { base, tip, length: Math.hypot(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]) || 1 };
    }
    const t = new Float32Array(count);
    for (let i = 0; i < count; i++) if (node[i] >= 0 && owner[node[i]] >= 0) { label[i] = owner[node[i]]; t[i] = along(fingers[label[i]], node[i]); }
    return { label, t, mitt, carrier, mittLine, joined, own, node };
};

/**
 * The fingers' share of a hand's skin, worked out off the main thread: 40 to
 * 170 ms a model (more on a slow CPU) that otherwise lands on the frame the
 * model first appears in. The worker runs `fingerSkinWeights` and
 * `fingerRegions` as written above, over flat copies of the inputs, so the
 * result is the one the main thread would make. Until it comes back the mesh
 * wears the skin it had: at rest the fingers' joints sit where the hand
 * holds them, so nothing moves when the new skin is put on. Off (or with no
 * workers), the skin is worked out where it is asked for, as before.
 */
Reactor3D.FingerSkin = {
    worker: true,
    // The two functions the worker runs, kept as defined (a profiler's wrapper must not stand in for them).
    kernels: { weights: Reactor3D.fingerSkinWeights, regions: Reactor3D.fingerRegions },
    _jobs: new Map(),
    _serial: 0,
    source() {
        return [
            "'use strict';",
            "const R = {};",
            "R.fingerSkinWeights = " + this.kernels.weights.toString() + ";",
            "R.fingerRegions = " + this.kernels.regions.toString() + ";",
            "self.onmessage = function(event) {",
            "    const job = event.data, P = job.position, I = job.index, W = job.weight, T = job.triangles;",
            "    try {",
            "        const position = { getX: i => P[i * 3], getY: i => P[i * 3 + 1], getZ: i => P[i * 3 + 2] };",
            "        const triangles = T ? { count: T.length, getX: k => T[k] } : null;",
            "        const made = R.fingerSkinWeights(job.count, position, (i, c) => I[i * 4 + c], (i, c) => W[i * 4 + c], job.hands, triangles);",
            "        self.postMessage({ id: job.id, index: made.index, weight: made.weight, changed: made.changed, hands: job.hands.map(h => ({ mitt: h.mitt, shared: h.shared })) }, [made.index.buffer, made.weight.buffer]);",
            "    } catch (error) { self.postMessage({ id: job.id, error: String(error && error.message || error) }); }",
            "};"
        ].join("\n");
    },
    available() {
        return !!this.worker && typeof Worker !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
    },
    ensure() {
        if (this._worker !== undefined) return this._worker;
        this._worker = null;
        if (!this.available()) return null;
        try {
            const url = URL.createObjectURL(new Blob([this.source()], { type: "text/javascript" }));
            const worker = new Worker(url, { name: "Reactor finger skin" });
            URL.revokeObjectURL(url);
            worker.onmessage = event => {
                const job = this._jobs.get(event.data && event.data.id);
                if (!job) return;
                this._jobs.delete(job.id);
                if (event.data.error) job.fallback(); else job.done(event.data);
            };
            worker.onerror = event => {
                if (event && event.preventDefault) event.preventDefault();
                // What was out is worked out here instead; later skins too.
                this.worker = false;
                this._worker = null;
                const jobs = [...this._jobs.values()];
                this._jobs.clear();
                for (const job of jobs) job.fallback();
            };
            this._worker = worker;
        } catch (error) { this._worker = null; }
        return this._worker;
    },
    /** A typed copy of four components a vertex, as `getComponent` reads them. */
    flat(source, count, Ctor) {
        if (ArrayBuffer.isView(source)) return new Ctor(source.subarray(0, count * 4));
        const array = source.array;
        if (!source.isInterleavedBufferAttribute && source.itemSize === 4 && array) {
            const part = array.subarray(0, count * 4);
            return source.normalized ? Ctor.from(part, v => THREE.MathUtils.denormalize(v, array)) : new Ctor(part);
        }
        const out = new Ctor(count * 4);
        for (let i = 0; i < count; i++) for (let c = 0; c < 4; c++) out[i * 4 + c] = source.getComponent(i, c);
        return out;
    },
    /** Positions as `getX`/`getY`/`getZ` read them, three a vertex. */
    positions(position, count) {
        const array = position.array;
        if (!position.isInterleavedBufferAttribute && position.itemSize === 3 && !position.normalized && array) return new Float64Array(array.subarray(0, count * 3));
        const out = new Float64Array(count * 3);
        for (let i = 0; i < count; i++) { out[i * 3] = position.getX(i); out[i * 3 + 1] = position.getY(i); out[i * 3 + 2] = position.getZ(i); }
        return out;
    },
    /**
     * Work out a skin: `index` and `weight` are a skin attribute or a flat array (four a vertex),
     * `hands` the list fingerSkinWeights takes (each gains `mitt` and `shared`). `done(made)` gets
     * { index, weight, changed }, now when no worker can take it, else once the worker answers.
     * Returns true when the answer is still to come.
     */
    run(count, position, index, weight, hands, triangles, done) {
        const here = () => {
            const indexOf = ArrayBuffer.isView(index) ? (i, c) => index[i * 4 + c] : (i, c) => index.getComponent(i, c);
            const weightOf = ArrayBuffer.isView(weight) ? (i, c) => weight[i * 4 + c] : (i, c) => weight.getComponent(i, c);
            done(Reactor3D.fingerSkinWeights(count, position, indexOf, weightOf, hands, triangles));
        };
        const worker = this.ensure();
        if (!worker) { here(); return false; }
        const id = ++this._serial;
        const job = {
            id, fallback: here,
            done: data => {
                data.hands.forEach((h, i) => { hands[i].mitt = h.mitt; hands[i].shared = h.shared; });
                done({ index: data.index, weight: data.weight, changed: data.changed });
            }
        };
        let payload;
        try {
            const tri = triangles ? (triangles.array ? new Uint32Array(triangles.array.subarray(0, triangles.count)) : Uint32Array.from({ length: triangles.count }, (_, k) => triangles.getX(k))) : null;
            payload = { id, count, position: this.positions(position, count), index: this.flat(index, count, Uint16Array), weight: this.flat(weight, count, Float32Array),
                triangles: tri, hands: hands.map(h => ({ index: h.index, ends: h.ends, fingers: h.fingers, toHand: Array.from(h.toHand) })) };
        } catch (error) { here(); return false; }
        this._jobs.set(id, job);
        const transfer = [payload.position.buffer, payload.index.buffer, payload.weight.buffer];
        if (payload.triangles) transfer.push(payload.triangles.buffer);
        try { worker.postMessage(payload, transfer); } catch (error) { this._jobs.delete(id); here(); return false; }
        Reactor3D.IdleWorkers?.touch("finger", () => this._jobs.size > 0, () => { const idle = this._worker; this._worker = undefined; if (idle) idle.terminate(); });
        return true;
    },
    /** A rig's worked-out skins, by the weights record they came from and the hands' places. */
    _rigSkins: new WeakMap()
};

Reactor3D._fingerGeometries = new WeakMap();

/**
 * Bind new finger joints into a model's skinned meshes: each mesh keeps its
 * bones and gains the finger joints after them, and wears a copy of its
 * geometry that shares every attribute but the skin's. The copy is made once
 * per geometry and shared by every instance; the file's own geometry is left
 * as it was for whatever else draws it.
 */
Reactor3D.skinRigFingers = function(root) {
    const joints = this.rigFingerJoints(root);
    if (!joints.length) return 0;
    const meshes = [];
    root.traverse(child => { if (child.isSkinnedMesh && child.skeleton && child.geometry) meshes.push(child); });
    const made = new Map();
    let bound = 0;
    for (const mesh of meshes) {
        const old = mesh.skeleton;
        let entry = made.get(old);
        if (!entry) {
            const bones = old.bones.slice(), inverses = old.boneInverses.map(m => m.clone()), hands = new Map();
            for (const joint of joints) {
                const at = old.bones.indexOf(joint.hand);
                if (at < 0) continue;
                const handInverse = old.boneInverses[at], e = joint.entry;
                let hand = hands.get(joint.hand);
                // (The hand's own end bones: leaves of the file's skeleton under it that are not fingers of ours.)
                if (!hand) hands.set(joint.hand, hand = { index: at, inverse: handInverse, fingers: [], ends: old.bones.map((bone, i) => bone.parent === joint.hand && !bone.userData.__reactorFinger && !bone.children.some(child => child.isBone) ? i : -1).filter(i => i >= 0) });
                const one = bones.length;
                bones.push(joint.one); inverses.push(new THREE.Matrix4().makeTranslation(-e.base[0], -e.base[1], -e.base[2]).multiply(handInverse));
                const two = bones.length;
                bones.push(joint.two); inverses.push(new THREE.Matrix4().makeTranslation(-e.mid[0], -e.mid[1], -e.mid[2]).multiply(handInverse));
                hand.fingers.push({ base: e.base, tip: e.tip, length: e.length, radius: e.radius, thumb: e.thumb, one, two });
            }
            entry = { hands: [...hands.values()], skeleton: hands.size ? new THREE.Skeleton(bones, inverses) : null };
            made.set(old, entry);
        }
        if (!entry.skeleton) continue;
        // Fingers the mesh does not separate close as one (once its skin is worked out).
        const geometry = this.fingerSkinnedGeometry(mesh, entry.hands, made => {
            for (const joint of joints) if (made.userData.__reactorMitt.indexOf(old.bones.indexOf(joint.hand)) >= 0) this._handGrips.get(joint.hand).layout.mitt = true;
        });
        if (!geometry) continue;
        mesh.geometry = geometry;
        mesh.bind(entry.skeleton, mesh.bindMatrix);
        bound++;
    }
    return bound;
};

/**
 * A copy of a skinned mesh's geometry wearing the fingers' share of its hands' skin; `onSkin(geometry)`
 * runs once the copy wears it (now, or when the finger skin worker answers: until then the copy wears
 * the file's own skin).
 */
Reactor3D.fingerSkinnedGeometry = function(mesh, hands, onSkin) {
    const source = mesh.geometry, position = source.getAttribute("position"), skinIndex = source.getAttribute("skinIndex"), skinWeight = source.getAttribute("skinWeight");
    if (!position || !skinIndex || !skinWeight) return null;
    const round = v => Math.round(v * 1e4) / 1e4;
    const signature = mesh.bindMatrix.elements.map(round).join(",") + "|" + hands.map(h => h.index + ":" + h.inverse.elements.map(round).join(",") + ":"
        + h.fingers.map(f => [f.one, f.two, ...f.base.map(round), ...f.tip.map(round), round(f.radius)].join(",")).join(";")).join("|");
    // The skin is worked out once per geometry and shared; the geometry that wears it is each instance's own
    // (releaseModelInstance takes an instance's geometry apart, and leaves what it shares with the template).
    const versions = this._fingerGeometries.get(source) || [];
    let skin = versions.find(entry => entry.signature === signature);
    if (!skin) {
        const list = hands.map(h => ({ index: h.index, ends: h.ends, fingers: h.fingers, toHand: new THREE.Matrix4().multiplyMatrices(h.inverse, mesh.bindMatrix).elements }));
        skin = { signature, index: null, weight: null, waiting: [] };
        versions.push(skin);
        this._fingerGeometries.set(source, versions);
        const entry = skin;
        this.FingerSkin.run(position.count, position, skinIndex, skinWeight, list, source.index || null, made => {
            Object.assign(entry, { index: new THREE.BufferAttribute(made.index, 4), weight: new THREE.BufferAttribute(made.weight, 4), changed: made.changed,
                mitt: list.filter(h => h.mitt).map(h => h.index), shared: list.map(h => [h.index].concat(h.shared || [])) });
            const waiting = entry.waiting;
            entry.waiting = null;
            for (const [copy, then] of waiting) this.wearFingerSkin(copy, entry, then);
        });
    }
    // The rest bounds are the source's, worked out once for every copy: with none to share, each new instance's
    // geometry had its box walked out again by the first thing that asked (10 ms a unit on the frame it joined).
    if (!source.boundingBox) source.computeBoundingBox();
    if (!source.boundingSphere) source.computeBoundingSphere();
    const geometry = new THREE.BufferGeometry();
    for (const name of Object.keys(source.attributes)) if (name !== "skinIndex" && name !== "skinWeight") geometry.setAttribute(name, source.attributes[name]);
    geometry.setAttribute("skinIndex", skin.index || skinIndex);
    geometry.setAttribute("skinWeight", skin.weight || skinWeight);
    geometry.setIndex(source.index);
    geometry.morphAttributes = source.morphAttributes;
    geometry.morphTargetsRelative = source.morphTargetsRelative;
    for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    geometry.drawRange.start = source.drawRange.start; geometry.drawRange.count = source.drawRange.count;
    geometry.boundingBox = source.boundingBox; geometry.boundingSphere = source.boundingSphere;
    geometry.name = source.name;
    geometry.userData = Object.assign({}, source.userData);
    if (skin.waiting) skin.waiting.push([geometry, onSkin]);
    else this.wearFingerSkin(geometry, skin, onSkin);
    return geometry;
};

/** A finger-skinned geometry puts on its worked-out skin. */
Reactor3D.wearFingerSkin = function(geometry, skin, onSkin) {
    if (geometry.getAttribute("skinIndex") !== skin.index) geometry.setAttribute("skinIndex", skin.index);
    if (geometry.getAttribute("skinWeight") !== skin.weight) geometry.setAttribute("skinWeight", skin.weight);
    Object.assign(geometry.userData, { __reactorFingerSkin: skin.changed, __reactorMitt: skin.mitt, __reactorShared: skin.shared });
    if (typeof onSkin === "function") onSkin(geometry);
};

Reactor3D._heldClouds = new WeakMap();

/**
 * A held model's surface as points in its own frame, one per small cell
 * (a two-hundredth of its length), so fingers can close on it wherever its
 * triangles are large or small. `{ points: Float32Array, count, cell }`, or
 * null for a thing with no geometry.
 */
Reactor3D.heldCloud = function(object) {
    if (!object) return null;
    if (this._heldClouds.has(object)) return this._heldClouds.get(object);
    object.updateMatrixWorld(true);
    const measured = this.heldMeasured(object);
    if (measured && measured.cloud !== undefined) { this._heldClouds.set(object, measured.cloud); return measured.cloud; }
    const toLocal = new THREE.Matrix4().copy(object.matrixWorld).invert(), box = new THREE.Box3(), m = new THREE.Matrix4();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
    const meshes = [];
    let triangles = 0;
    object.traverse(mesh => {
        const position = mesh.isMesh && mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.position;
        if (!position) return;
        meshes.push(mesh);
        triangles += (mesh.geometry.index ? mesh.geometry.index.count : position.count) / 3;
        m.multiplyMatrices(toLocal, mesh.matrixWorld);
        const stride = Math.max(1, Math.floor(position.count / 3000));
        for (let i = 0; i < position.count; i += stride) box.expandByPoint(p.fromBufferAttribute(position, i).applyMatrix4(m));
    });
    let cloud = null;
    if (meshes.length && !box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3()), cell = Math.max(size.x, size.y, size.z, 1e-6) / 200;
        const seen = new Set(), points = [];
        const add = v => {
            const ix = Math.floor((v.x - box.min.x) / cell), iy = Math.floor((v.y - box.min.y) / cell), iz = Math.floor((v.z - box.min.z) / cell);
            const key = ix + 256 * (iy + 256 * iz);
            if (seen.has(key)) return;
            seen.add(key); points.push(v.x, v.y, v.z);
        };
        const skip = Math.max(1, Math.floor(triangles / 120000));
        for (const mesh of meshes) {
            const position = mesh.geometry.attributes.position, index = mesh.geometry.index, count = (index ? index.count : position.count) / 3;
            m.multiplyMatrices(toLocal, mesh.matrixWorld);
            for (let t = 0; t < count; t += skip) {
                const i0 = index ? index.getX(t * 3) : t * 3, i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1, i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
                a.fromBufferAttribute(position, i0).applyMatrix4(m); b.fromBufferAttribute(position, i1).applyMatrix4(m); c.fromBufferAttribute(position, i2).applyMatrix4(m);
                // A triangle larger than a cell is covered across, not only at its corners.
                const n = Math.max(1, Math.min(16, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / cell)));
                for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
                    const u = i / n, w = j / n;
                    add(p.set(a.x + (b.x - a.x) * u + (c.x - a.x) * w, a.y + (b.y - a.y) * u + (c.y - a.y) * w, a.z + (b.z - a.z) * u + (c.z - a.z) * w));
                }
            }
        }
        cloud = { points: Float32Array.from(points), count: points.length / 3, cell };
    }
    this._heldClouds.set(object, cloud);
    if (measured) measured.cloud = cloud;
    return cloud;
};

/**
 * How far each finger of a hand closes on what it holds. `layout` is
 * `handGripLayout`'s; `cloud` holds `count` points of the held thing in the
 * hand joint's frame (Float32Array, x y z each); `pad` is how far apart those
 * points lie. Each finger starts open and closes, both joints together,
 * until it meets the thing (a point within its own thickness); when the
 * first segment has met it the second closes on alone, so a finger wraps
 * round a handle. A part of a finger already against the thing when open is
 * left out of the test (closing cannot free it). The thumb closes last, on
 * the thing or on the fingers. With nothing to meet (`count` 0: a picture in
 * the hand) the hand makes a loose fist. Writes two angles per finger, in
 * radians from rest, into `out`, in the layout's finger order.
 */
// With `thumbStays` (a gun's grip) a thumb that lies against the thing when open stays open: closing would only sink it in.
Reactor3D.solveGrip = function(layout, cloud, count, pad, out, thumbStays) {
    const fingers = layout.fingers, S = this._gripScratch || (this._gripScratch = {
        near: new Int32Array(4096), nearCount: 0, s: new Float32Array(12), extra: new Float32Array(5 * 12), extras: 0, mask: [false, false, false, false],
        f: null, thr2: 0, v1: [0, 0, 0], v2: [0, 0, 0], cloud: null
    });
    if (S.near.length < count) S.near = new Int32Array(count * 2);
    S.extras = 0; S.cloud = cloud;
    if (!S.blocked || S.blocked.length < fingers.length) S.blocked = new Uint8Array(Math.max(8, fingers.length));
    let blocked = 0, closed = 0, sum1 = 0, sum2 = 0;
    const order = layout.order || (layout.order = fingers.map((f, i) => i).sort((x, y) => (fingers[x].thumb ? 1 : 0) - (fingers[y].thumb ? 1 : 0)));
    for (const fi of order) {
        const f = fingers[fi];
        if (!count) {
            // Nothing to meet: a loose fist.
            out[fi * 2] = f.thumb ? f.max1 * 0.45 : f.open + (f.max1 - f.open) * 0.78;
            out[fi * 2 + 1] = f.max2 * (f.thumb ? 0.4 : 0.8);
            continue;
        }
        S.f = f;
        for (let i = 0; i < 3; i++) { S.v1[i] = f.mid[i] - f.base[i]; S.v2[i] = f.tip[i] - f.mid[i]; }
        const thr = f.radius + pad, reach = f.length + thr, reach2 = reach * reach;
        S.thr2 = thr * thr;
        // Only the points this finger could ever touch.
        let near = 0;
        for (let i = 0; i < count; i++) {
            const dx = cloud[i * 3] - f.base[0], dy = cloud[i * 3 + 1] - f.base[1], dz = cloud[i * 3 + 2] - f.base[2];
            if (dx * dx + dy * dy + dz * dz < reach2) S.near[near++] = i;
        }
        S.nearCount = near;
        this._gripPlace(S, f.open, 0);
        for (let k = 0; k < 4; k++) S.mask[k] = this._gripTouches(S, k);
        const ratio = f.thumb ? 0.5 : 0.9, step = 0.09;
        let t1 = f.open, t2 = 0, met = 0, from = f.open;
        const stays = !!thumbStays && f.thumb && (S.mask[0] || S.mask[1] || S.mask[2] || S.mask[3]);
        // A gun's guard (or the loop of a skeleton stock) can stand where an open finger lies: the finger closes
        // past it to where it is clear, and on from there until it meets the grip.
        if (thumbStays && !f.thumb && S.mask[0] && S.mask[1] && S.mask[2] && S.mask[3]) {
            // (Clear here is the finger's own middle clear of it: a loop only just a finger wide still takes a finger.)
            const full = S.thr2;
            S.thr2 = f.radius * f.radius * 0.5;
            for (let t = f.open + step; t <= f.max1 + 1e-6; t += step) {
                this._gripPlace(S, t, Math.min(f.max2, Math.max(0, (t - f.open) * ratio)));
                if (this._gripTouches(S, 0) || this._gripTouches(S, 1) || this._gripTouches(S, 2) || this._gripTouches(S, 3)) continue;
                from = t; S.mask[0] = S.mask[1] = S.mask[2] = S.mask[3] = false;
                break;
            }
            S.thr2 = full;
        }
        if (!stays && !(S.mask[0] && S.mask[1] && S.mask[2] && S.mask[3])) {
            // Both joints close together until some part meets the thing.
            let free = from;
            for (let t = from + step; t <= f.max1 + 1e-6; t += step) {
                met = this._gripMeets(S, t, Math.min(f.max2, Math.max(0, (t - f.open) * ratio)));
                if (met) {
                    let lo = free, hi = t;
                    for (let k = 0; k < 3; k++) { const mid = (lo + hi) / 2; if (this._gripMeets(S, mid, Math.min(f.max2, Math.max(0, (mid - f.open) * ratio)))) hi = mid; else lo = mid; }
                    free = lo; break;
                }
                free = t;
            }
            t1 = free; t2 = Math.min(f.max2, Math.max(0, (free - f.open) * ratio));
            // The first segment is on it and the second is not: the second closes on alone.
            if (met === 1) {
                let last = t2;
                for (let t = t2 + step; t <= f.max2 + 1e-6; t += step) {
                    if (this._gripMeets(S, t1, t) & 2) { let lo = last, hi = t; for (let k = 0; k < 3; k++) { const mid = (lo + hi) / 2; if (this._gripMeets(S, t1, mid) & 2) hi = mid; else lo = mid; } last = lo; break; }
                    last = t;
                }
                t2 = last;
            }
        } else met = 4;
        out[fi * 2] = t1; out[fi * 2 + 1] = t2;
        if (!f.thumb) { if (t1 - f.open < 0.2 && met) { S.blocked[fi] = 1; blocked++; } else { S.blocked[fi] = 0; sum1 += t1; sum2 += t2; closed++; } }
        // Where this finger ended up, for the thumb to stop on.
        if (!f.thumb && S.extras + 4 <= S.extra.length / 3) {
            this._gripPlace(S, t1, t2);
            for (let k = 0; k < 12; k++) S.extra[S.extras * 3 + k] = S.s[k];
            S.extras += 4;
        }
    }
    // A finger that touches first stops there; the rest keep closing. None is carried on through the thing.
    return out;
};

/**
 * Grips solved before, kept per held thing's points: a hand of the same model
 * holding the same thing the same way closes its fingers as the solve found
 * the first time (15 to 25 ms a battle start on a slow machine, one solve
 * per unit's hand). The key is the hand's layout and where the thing is in
 * the hand, to a ten-thousandth; a thing held at a new place each frame (a
 * gun cupped while aiming) fills a list that is emptied past `LIMIT`.
 * `enabled = false` solves every time.
 */
Reactor3D.GripMemo = {
    enabled: true,
    LIMIT: 64,
    _byCloud: new WeakMap(),
    layoutKey(layout) {
        if (layout.__rrGripKey) return layout.__rrGripKey;
        const r = v => Math.round(v * 1e4);
        const parts = [layout.side, layout.mitt ? 1 : 0, layout.radius, ...(layout.knuckles || [])].map(v => typeof v === "number" ? r(v) : String(v));
        for (const f of layout.fingers) {
            parts.push(f.finger, f.thumb ? 1 : 0, r(f.radius), r(f.length), r(f.open), r(f.max1), r(f.max2));
            for (const key of ["base", "mid", "tip", "hinge"]) for (const v of f[key] || []) parts.push(r(v));
        }
        Object.defineProperty(layout, "__rrGripKey", { value: parts.join(","), configurable: true, writable: true, enumerable: false });
        return layout.__rrGripKey;
    },
    key(layout, trigger, e) {
        let key = this.layoutKey(layout) + (trigger ? "|t" : "|-");
        for (let i = 0; i < 15; i++) key += "," + Math.round(e[i] * 1e4);
        return key;
    },
    get(cloud, key) {
        const kept = cloud && this._byCloud.get(cloud);
        return kept ? kept.get(key) : null;
    },
    set(cloud, key, solved) {
        if (!cloud) return;
        let kept = this._byCloud.get(cloud);
        if (!kept) this._byCloud.set(cloud, kept = new Map());
        if (kept.size >= this.LIMIT) kept.clear();
        kept.set(key, Float32Array.from(solved));
    }
};

/** The four places a finger is tested, with its joints at `t1` and `t2`: along and at the end of each segment. */
Reactor3D._gripPlace = function(S, t1, t2) {
    const f = S.f, hx = f.hinge[0], hy = f.hinge[1], hz = f.hinge[2], v1 = S.v1, v2 = S.v2;
    const c1 = Math.cos(t1), s1 = Math.sin(t1), d1 = hx * v1[0] + hy * v1[1] + hz * v1[2];
    const ax = v1[0] * c1 + (hy * v1[2] - hz * v1[1]) * s1 + hx * d1 * (1 - c1), ay = v1[1] * c1 + (hz * v1[0] - hx * v1[2]) * s1 + hy * d1 * (1 - c1), az = v1[2] * c1 + (hx * v1[1] - hy * v1[0]) * s1 + hz * d1 * (1 - c1);
    const c2 = Math.cos(t1 + t2), s2 = Math.sin(t1 + t2), d2 = hx * v2[0] + hy * v2[1] + hz * v2[2];
    const bx = v2[0] * c2 + (hy * v2[2] - hz * v2[1]) * s2 + hx * d2 * (1 - c2), by = v2[1] * c2 + (hz * v2[0] - hx * v2[2]) * s2 + hy * d2 * (1 - c2), bz = v2[2] * c2 + (hx * v2[1] - hy * v2[0]) * s2 + hz * d2 * (1 - c2);
    const s = S.s, mx = f.base[0] + ax, my = f.base[1] + ay, mz = f.base[2] + az;
    s[0] = f.base[0] + ax * 0.6; s[1] = f.base[1] + ay * 0.6; s[2] = f.base[2] + az * 0.6;
    s[3] = mx; s[4] = my; s[5] = mz;
    s[6] = mx + bx * 0.5; s[7] = my + by * 0.5; s[8] = mz + bz * 0.5;
    s[9] = mx + bx; s[10] = my + by; s[11] = mz + bz;
};

/** Whether tested place `k` of the finger is against the thing (or, for the thumb, a closed finger). */
Reactor3D._gripTouches = function(S, k) {
    const x = S.s[k * 3], y = S.s[k * 3 + 1], z = S.s[k * 3 + 2], cloud = S.cloud, near = S.near, thr2 = S.thr2;
    for (let j = 0; j < S.nearCount; j++) {
        const i = near[j] * 3, dx = cloud[i] - x, dy = cloud[i + 1] - y, dz = cloud[i + 2] - z;
        if (dx * dx + dy * dy + dz * dz < thr2) return true;
    }
    if (S.f.thumb) for (let j = 0; j < S.extras; j++) {
        const dx = S.extra[j * 3] - x, dy = S.extra[j * 3 + 1] - y, dz = S.extra[j * 3 + 2] - z;
        if (dx * dx + dy * dy + dz * dz < thr2 * 1.2) return true;
    }
    return false;
};

/** 1 when the first segment meets the thing at these angles, 2 when the second does, 3 both; places already against it when open do not count. */
Reactor3D._gripMeets = function(S, t1, t2) {
    this._gripPlace(S, t1, t2);
    const mask = S.mask;
    return (((!mask[0] && this._gripTouches(S, 0)) || (!mask[1] && this._gripTouches(S, 1))) ? 1 : 0)
        | (((!mask[2] && this._gripTouches(S, 2)) || (!mask[3] && this._gripTouches(S, 3))) ? 2 : 0);
};

/**
 * Hands closing on what they hold. The battle room says each frame which
 * hand holds which thing (`hold`), after the thing is placed; `update`, once
 * a frame, turns the finger joints toward where the fingers meet it, and
 * opens a hand again a moment after it stops being held. A hand whose
 * holding has not changed is not solved again.
 */
Reactor3D.HandGrip = {
    hands: new Set(),
    last: 0,
    HELD_FOR: 140,
    // How far a wrist turns to take a handle, in radians: a hand cannot close on a handle that lies along its fingers.
    TURN_MAX: 0.8,
    // A thing whose bulk hangs this far off its long axis (a pistol, a rifle) is held by that bulk, the grip; anything slimmer by its long axis.
    GRIP_HANG: 0.06,
    _m: null,
    _cloud: new Float32Array(3 * 2048),
    now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); },
    /**
     * Before a held thing is placed in a hand: the wrist turns so the
     * knuckles run along what the fingers will close on (a sword's handle,
     * with the blade leaving the fist by the thumb; a gun's grip, with the
     * little finger at its foot), as far as `TURN_MAX`. The turn is put on
     * top of the hand's pose each time and taken off again first, so it
     * never builds up. `object` is the thing as it was last placed.
     */
    turn(hand, object) {
        const R = Reactor3D, grip = hand ? R._handGrips.get(hand) : null;
        if (!grip || !hand.parent) return false;
        const W = this._w || (this._w = { world: new THREE.Quaternion(), q: new THREE.Quaternion(), t: new THREE.Vector3(), k: new THREE.Vector3() });
        if (!grip.turn) { grip.turn = new THREE.Quaternion(); grip.turnGoal = new THREE.Quaternion(); grip.turnBase = new THREE.Quaternion(); grip.turnOut = new THREE.Quaternion(); grip.turned = false; grip.turnAt = 0; }
        if (grip.turned && hand.quaternion.equals(grip.turnOut)) hand.quaternion.copy(grip.turnBase);
        grip.turnBase.copy(hand.quaternion);
        grip.turnGoal.identity();
        const shape = object && grip.thing === object ? R.heldShape(object) : null;
        if (shape) {
            const byGrip = !!shape.handle;
            W.t.fromArray(byGrip ? shape.down : shape.axis).transformDirection(object.matrixWorld);
            if (!byGrip) W.t.negate();
            hand.parent.getWorldQuaternion(W.world).multiply(grip.turnBase).invert();
            W.t.applyQuaternion(W.world).normalize();
            W.k.fromArray(grip.layout.across);
            grip.turnGoal.setFromUnitVectors(W.k, W.t);
            const angle = 2 * Math.acos(Math.min(1, Math.abs(grip.turnGoal.w)));
            if (angle > this.TURN_MAX) grip.turnGoal.copy(W.q.identity().slerp(grip.turnGoal, this.TURN_MAX / angle));
        }
        const now = this.now(), dt = now - grip.turnAt;
        grip.turnAt = now;
        grip.turn.slerp(grip.turnGoal, dt > 100 ? 1 : 1 - Math.exp(-dt / 45));
        hand.quaternion.copy(grip.turnBase).multiply(grip.turn);
        grip.turnOut.copy(hand.quaternion);
        grip.turned = true;
        hand.updateMatrixWorld(true);
        return true;
    },
    /**
     * The natural hold (a weapon step's Held By › In the fist): where a thing sits in a hand, in the
     * hand's own frame, so it stays in the fist however the arm turns. The handle lies across the palm
     * along the knuckles, a finger's thickness off the palm and a little back from the knuckles, where
     * the fingers close round it. A slim thing leaves the fist on the thumb's side (a sword's blade,
     * a hammer's head) with its broad way along the hand; a thing with a hanging grip (a gun) is held
     * by that grip, its foot at the little finger and its long axis (the barrel) along the hand.
     * `along` is where on a slim thing the hand is, 0 its own grip. `offset` (tiles) moves it in the
     * hand: x toward the fingers, y toward the thumb, z out of the palm. Returns the room point for
     * the thing's hold point, that point in the thing's frame, and where its long axis and its up go,
     * or null for a hand without fingers.
     */
    fistFrame(hand, object, along, offset) {
        const R = Reactor3D, grip = hand ? R._handGrips.get(hand) : null, shape = object ? R.heldShape(object) : null;
        if (!grip || !shape) return null;
        const L = grip.layout;
        hand.updateWorldMatrix(true, false);
        const q = hand.getWorldQuaternion(new THREE.Quaternion()), scale = hand.getWorldScale(new THREE.Vector3()).x || 1;
        const A = new THREE.Vector3().fromArray(L.along).applyQuaternion(q), C = new THREE.Vector3().fromArray(L.across).applyQuaternion(q), N = new THREE.Vector3().fromArray(L.normal).applyQuaternion(q);
        const byGrip = !!shape.handle, item = object.scale.x || 1;
        const thick = (byGrip ? shape.handle.radius : shape.gripRadius) * item, finger = L.radius * scale;
        const position = hand.localToWorld(new THREE.Vector3().fromArray(L.knuckles));
        const K = L.knuckles, four = L.fingers.filter(f => !f.thumb);
        const across = f => f ? ((f.base[0] - K[0]) * L.across[0] + (f.base[1] - K[1]) * L.across[1] + (f.base[2] - K[2]) * L.across[2]) * scale : 0;
        let local = null, aim = null;
        if (byGrip) {
            // A gun's grip stands along the knuckle line with its side panel flat on the palm and its front strap
            // just behind the knuckles, so the fingers close round the front of it and on to its far side. The
            // middle finger lies right under the frame (the trigger guard, or the marked top of the grip where that
            // is lower); the trigger finger above it. The front strap is read where those fingers lie.
            const h = shape.handle, middle = four.find(f => f.finger === "middle") || four[Math.min(1, four.length - 1)], last = four[four.length - 1];
            const top = (middle ? across(middle) : -finger) - finger, section = h.stock ? null : R.gripSection(object, finger * 2 / item);
            let under = h.under || 0, front = h.along * shape.length + h.radius;
            if (section) {
                under = shape.marks ? Math.max(section.top, Math.min(h.under, section.foot - section.cell)) : section.top;
                const first = Math.max(0, Math.min(section.front.length - 1, Math.round((under - section.top) / section.cell)));
                const rows = Math.max(1, Math.round((across(last) - across(middle) + finger * 2) / item / section.cell));
                front = 0;
                for (let r = first; r < Math.min(section.front.length, first + rows); r++) front = Math.max(front, section.front[r]);
            }
            const off = [0, 1, 2].map(i => shape.line[i] - shape.base[i]), on = off[0] * shape.axis[0] + off[1] * shape.axis[1] + off[2] * shape.axis[2];
            local = [0, 1, 2].map(i => shape.base[i] + off[i] + shape.axis[i] * (front - on) + shape.down[i] * under);
            position.addScaledVector(N, finger + (h.side || h.radius) * item).addScaledVector(A, -finger).addScaledVector(C, top);
            // Where the barrel's line passes the hand, for aiming: ahead of the wrist, below it (above when negative), off to the palm's side;
            // how far the butt (a pistol's rear) is behind the fingers, and whether it goes to the shoulder.
            const wrist = hand.getWorldPosition(new THREE.Vector3()), rel = position.clone().addScaledVector(C, -under * item).sub(wrist);
            aim = { along: rel.dot(A), down: rel.dot(C), side: rel.dot(N), butt: front * item, shoulder: shape.marks ? !!shape.marks.stock : !!h.stock || front * item >= .2 };
        } else {
            position.addScaledVector(N, finger + thick).addScaledVector(A, -(finger + thick) * .9);
            // A marked handle is taken with the index finger at its top (the guard); a handle shorter than the fist by its middle.
            const handle = shape.marks && shape.marks.handle, half = four.length > 1 ? (across(four[four.length - 1]) - across(four[0])) / 2 + finger : finger * 4;
            const grip = handle ? Math.max(handle / 2, handle - half / item) / shape.length : shape.grip;
            local = [0, 1, 2].map(i => shape.base[i] + shape.axis[i] * shape.length * (along ? Math.max(0, Math.min(1, along)) : grip));
        }
        if (offset) position.addScaledVector(A, offset[0] || 0).addScaledVector(C, -(offset[1] || 0)).addScaledVector(N, offset[2] || 0);
        return { position, local, forward: byGrip ? A : C.clone().negate(), up: byGrip ? C.clone().negate() : A, byGrip, hand, along: A, across: C, normal: N, aim };
    },
    /** Turn a hand so a gun held in its fist points along `direction` (room), its grip hanging down. */
    aimHand(hand, direction) {
        const grip = hand ? Reactor3D._handGrips.get(hand) : null;
        if (!grip || !hand.parent) return false;
        const L = grip.layout, forward = direction.clone().normalize();
        const down = new THREE.Vector3(0, -1, 0).addScaledVector(forward, forward.y);
        if (down.lengthSq() < 1e-6) return false;
        down.normalize();
        const world = new THREE.Matrix4().makeBasis(forward, down, new THREE.Vector3().crossVectors(forward, down));
        const A = new THREE.Vector3().fromArray(L.along), C = new THREE.Vector3().fromArray(L.across);
        C.addScaledVector(A, -C.dot(A)).normalize();
        const local = new THREE.Matrix4().makeBasis(A, C, new THREE.Vector3().crossVectors(A, C));
        const target = new THREE.Quaternion().setFromRotationMatrix(world.multiply(local.transpose()));
        return this.setTurn(hand, target);
    },
    /**
     * Give a hand a turn in the room for this frame (aiming, or taking a gun from below). The turn it had is kept
     * and put back when it lets go, where its pose has not been written over since.
     */
    setTurn(hand, target) {
        const grip = hand ? Reactor3D._handGrips.get(hand) : null;
        if (!grip || !hand.parent) return false;
        if (!grip.setBase) { grip.setBase = new THREE.Quaternion(); grip.setOut = new THREE.Quaternion(); grip.isSet = false; }
        if (!(grip.isSet && hand.quaternion.equals(grip.setOut))) grip.setBase.copy(hand.quaternion);
        hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(target));
        grip.setOut.copy(hand.quaternion); grip.isSet = true;
        this.hands.add(grip);
        hand.updateMatrixWorld(true);
        return true;
    },
    /**
     * The other hand under a long gun: palm up against its underside, fingers across it so they close up its far
     * side. `forward` and `down` are the gun's, in the room. Returns the hand's turn and where its palm is from
     * its wrist with that turn, so the arm reaches first and `setTurn` turns the hand after.
     */
    cupFrame(hand, forward, down) {
        const grip = hand ? Reactor3D._handGrips.get(hand) : null;
        if (!grip) return null;
        const L = grip.layout, left = L.side !== "Right", scale = hand.getWorldScale(new THREE.Vector3()).x || 1;
        const A = new THREE.Vector3().crossVectors(forward, down).multiplyScalar((left ? -1 : 1) * Math.cos(.6)).addScaledVector(forward, Math.sin(.6)).normalize();
        const N = down.clone().negate(), C = left ? new THREE.Vector3().crossVectors(A, N) : new THREE.Vector3().crossVectors(N, A);
        const a = new THREE.Vector3().fromArray(L.along), c = new THREE.Vector3().fromArray(L.across);
        c.addScaledVector(a, -c.dot(a)).normalize();
        const world = new THREE.Matrix4().makeBasis(A, C, new THREE.Vector3().crossVectors(A, C)), local = new THREE.Matrix4().makeBasis(a, c, new THREE.Vector3().crossVectors(a, c));
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(world.multiply(local.transpose()));
        const palm = new THREE.Vector3().fromArray(L.palm).multiplyScalar(scale).applyQuaternion(quaternion).addScaledVector(down, -L.radius * scale);
        return { quaternion, palm };
    },
    /** A hand whose fingers are one piece of mesh closes them together: as far as the one that met the thing first. */
    asOne(grip) {
        const fingers = grip.layout.fingers;
        if (!grip.layout.mitt) return;
        let one = Infinity, two = Infinity;
        for (let i = 0; i < fingers.length; i++) if (!fingers[i].thumb) { one = Math.min(one, grip.solved[i * 2]); two = Math.min(two, grip.solved[i * 2 + 1]); }
        for (let i = 0; i < fingers.length; i++) if (!fingers[i].thumb) { grip.solved[i * 2] = one; grip.solved[i * 2 + 1] = two; }
    },
    /** A hand's world orientation with the grip's turn taken off again: the hand as its pose left it. */
    unturned(hand, quaternion) {
        const grip = hand ? Reactor3D._handGrips.get(hand) : null;
        if (!grip || !grip.turned) return quaternion;
        const W = this._w;
        return quaternion.multiply(W.q.copy(grip.turn).invert());
    },
    hold(hand, object, trigger) {
        const R = Reactor3D, grip = hand ? R._handGrips.get(hand) : null;
        if (!grip) return false;
        // A trigger finger lies along the frame instead of wrapping the grip.
        if (!!trigger !== !!grip.trigger) { grip.trigger = !!trigger; grip.relSet = false; }
        const layout = grip.layout, n = layout.fingers.length;
        if (!grip.solved) { grip.solved = new Float32Array(n * 2); grip.rel = new Float32Array(16); grip.relSet = false; }
        grip.heldAt = this.now();
        this.hands.add(grip);
        const cloud = object ? R.heldCloud(object) : null;
        if (!cloud || !cloud.count) {
            if (grip.thing !== null || !grip.relSet) { R.solveGrip(layout, this._cloud, 0, 0, grip.solved); this.asOne(grip); grip.thing = null; grip.relSet = true; }
            return true;
        }
        const M = this._m || (this._m = { a: new THREE.Matrix4(), b: new THREE.Matrix4() });
        hand.updateWorldMatrix(true, false); object.updateMatrixWorld(true);
        M.a.copy(hand.matrixWorld).invert().multiply(object.matrixWorld);
        const e = M.a.elements;
        // The same thing, held the same way: the fingers are where they were.
        const span = Math.hypot(e[0], e[1], e[2]);
        let same = grip.thing === object && grip.relSet;
        if (same) { const turn = span * 0.004, slide = layout.radius * 0.08; for (let i = 0; i < 15 && same; i++) if (Math.abs(e[i] - grip.rel[i]) > (i < 12 ? turn : slide)) same = false; }
        if (same) return true;
        grip.rel.set(e); grip.relSet = true; grip.thing = object;
        // Held this way before, by this hand or another of the same model: the fingers the solve found then.
        const memo = R.GripMemo.enabled ? R.GripMemo.key(layout, grip.trigger, e) : null;
        if (memo) {
            const hit = R.GripMemo.get(cloud, memo);
            if (hit && hit.length === grip.solved.length) { grip.solved.set(hit); return true; }
        }
        // The thing's points near the hand, in the hand's frame.
        let reach = 0;
        for (const f of layout.fingers) reach = Math.max(reach, Math.hypot(f.base[0] - layout.knuckles[0], f.base[1] - layout.knuckles[1], f.base[2] - layout.knuckles[2]) + f.length + f.radius * 2);
        const reach2 = reach * reach, kx = layout.knuckles[0], ky = layout.knuckles[1], kz = layout.knuckles[2], points = cloud.points;
        if (this._cloud.length < cloud.count * 3) this._cloud = new Float32Array(cloud.count * 3);
        const local = this._cloud;
        let count = 0;
        for (let i = 0; i < cloud.count; i++) {
            const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
            const px = e[0] * x + e[4] * y + e[8] * z + e[12], py = e[1] * x + e[5] * y + e[9] * z + e[13], pz = e[2] * x + e[6] * y + e[10] * z + e[14];
            const dx = px - kx, dy = py - ky, dz = pz - kz;
            if (dx * dx + dy * dy + dz * dz > reach2) continue;
            local[count * 3] = px; local[count * 3 + 1] = py; local[count * 3 + 2] = pz; count++;
        }
        R.solveGrip(layout, local, count, cloud.cell * span * 0.6, grip.solved, grip.trigger);
        // Nothing of it within reach of the fingers: a loose fist all the same.
        if (!count) R.solveGrip(layout, local, 0, 0, grip.solved);
        this.asOne(grip);
        if (grip.trigger && !layout.mitt) layout.fingers.forEach((f, i) => {
            if (f.finger !== "index") return;
            grip.solved[i * 2] = 0; grip.solved[i * 2 + 1] = 0;
            // A marked trigger: the finger bends to lay its tip there.
            const shape = R.heldShape(object), mark = shape && shape.marks && shape.marks.trigger;
            if (!mark) return;
            const S = R._gripScratch, x = e[0] * mark[0] + e[4] * mark[1] + e[8] * mark[2] + e[12], y = e[1] * mark[0] + e[5] * mark[1] + e[9] * mark[2] + e[13], z = e[2] * mark[0] + e[6] * mark[1] + e[10] * mark[2] + e[14];
            S.f = f;
            for (let k = 0; k < 3; k++) { S.v1[k] = f.mid[k] - f.base[k]; S.v2[k] = f.tip[k] - f.mid[k]; }
            let best = Infinity;
            for (let one = 0; one <= f.max1 * .7 + 1e-6; one += .08) for (let two = 0; two <= f.max2 * .8 + 1e-6; two += .1) {
                R._gripPlace(S, one, two);
                const d = Math.hypot(S.s[9] - x, S.s[10] - y, S.s[11] - z);
                if (d < best - 1e-9) { best = d; grip.solved[i * 2] = one; grip.solved[i * 2 + 1] = two; }
            }
        });
        if (memo) R.GripMemo.set(cloud, memo, grip.solved);
        return true;
    },
    update() {
        // A chest turned for a long gun's stance (Held.blade) goes back when no hold laid it this frame.
        if (Reactor3D.Held && Reactor3D.Held.stances.size) Reactor3D.Held.unblade(null);
        if (!this.hands.size) return;
        const now = this.now(), dt = now - this.last;
        this.last = now;
        const ease = dt > 100 || dt <= 0 ? 1 : 1 - Math.exp(-dt / 45);
        const Q = this._q || (this._q = { q: new THREE.Quaternion() });
        for (const grip of this.hands) {
            // (A pinned hand holds until it is unpinned: the map's held things say so once, not every frame.)
            const held = grip.pinned || now - grip.heldAt <= this.HELD_FOR, fingers = grip.layout.fingers;
            let moving = false;
            for (let i = 0; i < fingers.length; i++) {
                const f = fingers[i];
                let turned = grip.file;
                for (let j = 0; j < 2; j++) {
                    const goal = held ? grip.solved[i * 2 + j] : 0, delta = goal - f.now[j];
                    if (Math.abs(delta) < 0.002) { if (delta !== 0) { f.now[j] = goal; turned = true; } }
                    else { f.now[j] += delta * ease; turned = true; if (Math.abs(goal - f.now[j]) >= 0.002) moving = true; else f.now[j] = goal; }
                }
                if (!turned) continue;
                for (let j = 0; j < f.joints.length; j++) {
                    const joint = f.joints[j], angle = j === 0 ? f.now[0] : j === 1 ? f.now[1] : f.now[1] * 0.7;
                    joint.node.quaternion.copy(Q.q.setFromAxisAngle(joint.axis, angle)).multiply(joint.rest);
                }
            }
            // Let go: the wrist's turn eases off, where the hand's pose has not been written over it since.
            if (!held && grip.turned) {
                const untouched = grip.hand.quaternion.equals(grip.turnOut);
                grip.turn.slerp(Q.q.identity(), ease);
                if (Math.abs(grip.turn.w) > 0.99999) { grip.turn.identity(); grip.turned = false; } else moving = true;
                if (untouched) { grip.hand.quaternion.copy(grip.turnBase).multiply(grip.turn); grip.turnOut.copy(grip.hand.quaternion); }
            }
            // A turn given for aiming is taken off again, where the pose has not replaced it.
            if (!held && grip.isSet) { if (grip.hand.quaternion.equals(grip.setOut)) grip.hand.quaternion.copy(grip.setBase); grip.isSet = false; }
            // Open again and still: nothing more to do for this hand until it holds something.
            if (!held && !moving) { this.hands.delete(grip); grip.thing = undefined; grip.relSet = false; }
        }
    }
};

/**
 * Holding a thing in a model's hand, for any stage that shows models (the
 * Battle Room, the map). A model is a record `{ object, extent, scale }`
 * (its hand joints are cached on it as `attachmentBones`); a held thing is
 * `{ object, scale, spec }`. Points and directions are the stage's own
 * world. In order, for one frame or one solve: `begin` (the aiming arm
 * reaches and the fist's frame is read), the stage puts the thing at the
 * hand's point, `orient` turns it in the hand, `finish` brings the other
 * hand to it and closes the fingers.
 */
Reactor3D.Held = {
    HANDS: ["rightHand", "leftHand"],
    /** The hand (or named bone) an attachment names, as the Battle Room reads it: `{ quaternion, forearm, fist }` or null. */
    frame(record, attachment, boneName) {
        const View = globalThis.ReactorBattleRoomView;
        if (!View || !attachment || attachment === "offset" || attachment === "center") return null;
        return View.attachmentQuaternion(record, attachment, boneName);
    },
    /** The joint an attachment names on a model (`rightHand`, `leftHand`, or a bone's name), or null. */
    joint(record, attachment, boneName) {
        const View = globalThis.ReactorBattleRoomView;
        if (!View || !record || !record.object) return null;
        View.attachmentWorld(record, attachment, boneName || "");
        return (record.attachmentBones && record.attachmentBones.get(boneName || attachment)) || null;
    },
    /**
     * Bends an arm so its hand lands on a point (two-bone reach): the upper arm turns so the elbow sits on the
     * shoulder-to-point line, off toward where it already bends and downward (`down`), then the forearm turns
     * to the point. Works on the joints the pose rules already move, after them.
     */
    reachArm(record, side, target, down = .5) {
        const T = THREE;
        if (!record || !record.object || !target) return false;
        const hand = this.joint(record, side + "Hand"), fore = hand && hand.parent, upper = fore && fore.parent;
        if (!upper || !upper.parent) return false;
        upper.updateMatrixWorld(true);
        const S = upper.getWorldPosition(new T.Vector3()), E = fore.getWorldPosition(new T.Vector3()), H = hand.getWorldPosition(new T.Vector3());
        const a = S.distanceTo(E), b = E.distanceTo(H);
        if (a < 1e-4 || b < 1e-4) return false;
        const goal = target.clone();
        let d = S.distanceTo(goal);
        if (d < 1e-4) return false;
        d = Math.max(Math.abs(a - b) + 1e-3, Math.min(a + b - 1e-3, d));
        const dir = goal.clone().sub(S).normalize();
        let pole = E.clone().sub(S);
        pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
        if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0);
        pole.normalize();
        pole.lerp(new T.Vector3(0, -1, 0), down);
        pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
        if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0);
        pole.normalize();
        const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))), angA = Math.acos(cosA);
        const elbow = S.clone().add(dir.clone().multiplyScalar(Math.cos(angA) * a)).add(pole.clone().multiplyScalar(Math.sin(angA) * a));
        const turn = (bone, from, to) => { this.turnJoint(bone, new T.Quaternion().setFromUnitVectors(from.normalize(), to.normalize())); };
        turn(upper, E.clone().sub(S), elbow.clone().sub(S));
        const E2 = fore.getWorldPosition(new T.Vector3()), H2 = hand.getWorldPosition(new T.Vector3());
        turn(fore, H2.clone().sub(E2), goal.clone().sub(E2));
        return true;
    },
    /** How far round from the body's front, either way, an arm aims (radians); past it the aim stops at the edge. */
    AIM_ARC: 70 * Math.PI / 180,
    /**
     * Where an aimed arm points: the goal, or, when it lies further round than `AIM_ARC` from the way the
     * shoulders face (a unit still turning to its target, a rider facing along the ride), the edge of that arc
     * at the same distance and height. An arm that reached the goal itself went behind the back, the gun through
     * the body. The front is square to the line between the shoulders.
     */
    frontGoal(record, side, shoulder, goal) {
        const T = THREE, torso = this.torso(record, side);
        if (!torso || !shoulder || !goal) return goal;
        const up = new T.Vector3(0, 1, 0), S = shoulder.getWorldPosition(new T.Vector3()), O = torso.across.getWorldPosition(new T.Vector3());
        const forward = new T.Vector3().crossVectors(O.sub(S), up).setY(0), flat = goal.clone().sub(S).setY(0);
        if (side === "left") forward.negate();
        if (forward.lengthSq() < 1e-10 || flat.lengthSq() < 1e-10) return goal;
        forward.normalize();
        const length = flat.length();
        flat.divideScalar(length);
        if (Math.acos(Math.max(-1, Math.min(1, forward.dot(flat)))) <= this.AIM_ARC) return goal;
        const sign = new T.Vector3().crossVectors(forward, flat).y < 0 ? -1 : 1;
        forward.applyAxisAngle(up, sign * this.AIM_ARC);
        return new T.Vector3(S.x + forward.x * length, goal.y, S.z + forward.z * length);
    },
    /** Turn a joint by a turn given in the world, on top of the pose it has. */
    turnJoint(bone, q) {
        const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
        bone.quaternion.premultiply(parentQ.clone().invert().multiply(q).multiply(parentQ));
        bone.updateMatrixWorld(true);
    },
    /** The joint both arms hang from (the chest), and the head on it: what a stance turns. */
    torso(record, side) {
        const hand = this.joint(record, side + "Hand"), other = this.joint(record, (side === "right" ? "left" : "right") + "Hand");
        const upper = hand && hand.parent && hand.parent.parent, across = other && other.parent && other.parent.parent;
        if (!upper || !across) return null;
        let chest = upper.parent;
        const under = node => { for (let n = across; n; n = n.parent) if (n === node) return true; return false; };
        while (chest && !under(chest)) chest = chest.parent;
        if (!chest || !chest.parent || chest === record.object) return null;
        let head = null;
        chest.traverse(node => { if (!head && node !== chest && /head$/i.test(String(node.name).replace(/[^a-z0-9]/gi, "")) && (node.isBone || (node.userData && (node.userData.__reactorRigBone || (node.userData.parts && node.userData.parts.length))))) head = node; });
        return { chest, head, upper, across };
    },
    /** How far along a gun (from its butt end, in its own units) the other hand holds: its marked Fore grip, else a way ahead of the grip. */
    foreAlong(shape) {
        const m = shape.marks && shape.marks.foreGrip;
        if (!m) return shape.length * Math.min(.85, shape.handle.along + .3);
        return (m[0] - shape.base[0]) * shape.axis[0] + (m[1] - shape.base[1]) * shape.axis[1] + (m[2] - shape.base[2]) * shape.axis[2];
    },
    /**
     * A long gun held in both hands, its butt at the shoulder: when the other arm is too short to reach its
     * fore grip with the shoulders square to the target, the chest turns the other shoulder forward (a
     * shooter's bladed stance), as little as brings the fore grip within reach, and the head stays on the target.
     */
    blade(record, side, held, shape, goal) {
        const T = THREE, torso = this.torso(record, side);
        if (!torso) return 0;
        const off = this.joint(record, (side === "right" ? "left" : "right") + "Hand"), item = held.object.scale.x || 1;
        const S = torso.upper.getWorldPosition(new T.Vector3()), O = torso.across.getWorldPosition(new T.Vector3()), pivot = torso.chest.getWorldPosition(new T.Vector3());
        const reach = O.distanceTo(off.parent.getWorldPosition(new T.Vector3())) + off.parent.getWorldPosition(new T.Vector3()).distanceTo(off.getWorldPosition(new T.Vector3()));
        const a = .04 + this.foreAlong(shape) * item, drop = Reactor3D.heldUnderside(held.object, this.foreAlong(shape)) * item + .03, up = new T.Vector3(0, 1, 0);
        const flat = goal.clone().sub(S).setY(0);
        if (flat.lengthSq() < 1e-8) return 0;
        const sign = new T.Vector3().crossVectors(up, O.clone().sub(pivot)).dot(flat) > 0 ? 1 : -1, q = new T.Quaternion(), s = new T.Vector3(), o = new T.Vector3();
        let angle = 0;
        for (; angle <= .96; angle += .08) {
            q.setFromAxisAngle(up, sign * angle);
            s.copy(S).sub(pivot).applyQuaternion(q).add(pivot); o.copy(O).sub(pivot).applyQuaternion(q).add(pivot);
            const dir = goal.clone().sub(s).normalize();
            if (s.addScaledVector(dir, a).distanceTo(o.setY(o.y + drop)) <= reach * .97) break;
        }
        angle = Math.min(.96, angle);
        if (!angle) return 0;
        const head = torso.head && torso.head.parent ? torso.head : null;
        const stance = { owner: record, head, chestBase: torso.chest.quaternion.clone(), headBase: head ? head.quaternion.clone() : null, chestOut: null, headOut: null, fresh: true };
        q.setFromAxisAngle(up, sign * angle);
        this.turnJoint(torso.chest, q);
        if (head) this.turnJoint(head, q.invert());
        stance.chestOut = torso.chest.quaternion.clone();
        if (head) stance.headOut = head.quaternion.clone();
        this.stances.set(torso.chest, stance);
        return sign * angle;
    },
    /**
     * The stance `blade` last put on a chest, by chest: the chest's and head's turns before it and after it. The
     * chest it turns need not be a joint the model's own motion writes every frame (on a Mixamo body it is the file's
     * Spine, between the rig's Chest and the shoulders, which only a walk or run clip moves), so the turn is taken
     * off again before the next one is worked out, and when no hold has laid it for a frame, the way a wrist's grip
     * turn is (HandGrip.turn, setTurn). Laid on top of the last one instead, the turns added up frame after frame:
     * the shooter spun round with the gun, and stayed turned after putting it away.
     */
    stances: new Map(),
    /**
     * Takes stance turns off again, where nothing has posed those joints since they went on: `owner`'s before its
     * next aim is worked out, or (no owner, once a frame from HandGrip.update) every one no hold laid this frame.
     */
    unblade(owner) {
        for (const [chest, s] of this.stances) {
            if (owner ? s.owner !== owner : s.fresh) { if (!owner) s.fresh = false; continue; }
            this.stances.delete(chest);
            if (chest.quaternion.equals(s.chestOut)) chest.quaternion.copy(s.chestBase);
            if (s.head && s.head.quaternion.equals(s.headOut)) s.head.quaternion.copy(s.headBase);
            chest.updateMatrixWorld(true);
        }
    },
    /**
     * Holds a shown weapon the way its step asks: aimed, the shooting arm reaches down the line to `goal` so the
     * barrel (laid along that line) points at it and the stock sits back by the shoulder. Returns the hand frame
     * to place the thing with. `note`, when given, is told the line (`heldAimLine`).
     */
    aim(owner, held, step, goal, note) {
        const T = THREE, R = Reactor3D, side = step.attachment === "leftHand" ? "left" : "right";
        // The stance last laid on this body comes off first: the aim is worked out from the pose, not from the last aim.
        if (this.stances.size) this.unblade(owner);
        const frame = this.frame(owner, step.attachment, step.bone);
        if (!frame || step.aim !== "target" || !goal) return frame;
        const hand = this.joint(owner, side + "Hand"), upper = hand && hand.parent && hand.parent.parent;
        if (!upper) return frame;
        goal = this.frontGoal(owner, side, upper, goal);
        const shape = held && held.object ? R.heldShape(held.object) : null, scale = held ? held.scale || 1 : 1;
        // Held in the fist by its grip: the barrel's own line (Rear to Muzzle on a marked gun) is laid on the line from the shoulder
        // to the target, and the wrist goes where that puts the grip. A long gun's butt sits at the shoulder; a short one is held out.
        const gun = step.hold === "fist" && shape && shape.handle ? (R.HandGrip.fistFrame(hand, held.object, 0, null) || {}).aim || null : null;
        if (gun && gun.shoulder && step.hands === "both") this.blade(owner, side, held, shape, goal);
        const S = upper.getWorldPosition(new T.Vector3()), dir = goal.clone().sub(S);
        if (dir.lengthSq() < 1e-6) return frame;
        dir.normalize();
        const gripLength = shape ? shape.grip * shape.length * scale : .3, itemLength = shape ? shape.length * scale : 0;
        // A long gun is shouldered (the stock ends by the shoulder); a short one is held out at arm's length.
        const fore = hand.parent, E = fore.getWorldPosition(new T.Vector3()), H = hand.getWorldPosition(new T.Vector3()), reach = S.distanceTo(E) + E.distanceTo(H);
        const distance = itemLength > 1.2 ? Math.max(.35, gripLength + .12) : reach * .86;
        if (note) note.heldAimLine = { from: S.clone(), to: goal.clone() };
        if (gun) {
            const down = new T.Vector3(0, -1, 0).addScaledVector(dir, dir.y);
            if (down.lengthSq() > 1e-6) {
                down.normalize();
                const sideways = new T.Vector3().crossVectors(dir, down).multiplyScalar(side === "left" ? -1 : 1);
                const out = gun.shoulder ? Math.max(reach * .3, gun.butt + .04 - gun.along) : reach * .86;
                this.reachArm(owner, side, S.clone().addScaledVector(dir, out).addScaledVector(down, -gun.down).addScaledVector(sideways, -gun.side), .65);
                R.HandGrip.aimHand(hand, dir);
            }
        } else this.reachArm(owner, side, S.clone().add(dir.clone().multiplyScalar(distance)), .65);
        const after = this.frame(owner, step.attachment, step.bone) || frame;
        after.forearm = dir;
        return after;
    },
    /**
     * Turn a held thing in the hand, its position already the hand's point: the model's long axis lies along the
     * forearm with its tip forward and its bulk hanging down (or, held in the fist, where the fist's frame says),
     * the grip point (`pivotY` of the way along, or the fist's) in the hand; Tilt, Turn and Roll (`rotateX`,
     * `rotateY`, `rotateZ`, degrees) then adjust that about the hand's own axes.
     */
    orient(held, p) {
        const T = THREE, object = held.object, shape = Reactor3D.heldShape(object), hand = p.frame.quaternion, fist = p.frame.grip || null;
        const forward = fist ? fist.forward.clone() : p.frame.forearm ? p.frame.forearm.clone() : new T.Vector3(0, 0, 1).applyQuaternion(hand);
        const up = fist ? fist.up.clone() : new T.Vector3(0, 1, 0);
        up.sub(forward.clone().multiplyScalar(up.dot(forward)));
        if (up.lengthSq() < 1e-6) up.set(0, 0, 1);
        up.normalize();
        const right = new T.Vector3().crossVectors(forward, up);
        const la = new T.Vector3().fromArray(shape ? shape.axis : [0, 1, 0]), lu = new T.Vector3().fromArray(shape ? shape.up : [0, 0, 1]);
        lu.sub(la.clone().multiplyScalar(lu.dot(la)));
        if (lu.lengthSq() < 1e-6) lu.set(0, 0, 1);
        lu.normalize();
        const lr = new T.Vector3().crossVectors(la, lu);
        const world = new T.Matrix4().makeBasis(forward, up, right), local = new T.Matrix4().makeBasis(la, lu, lr);
        const base = new T.Quaternion().setFromRotationMatrix(world.multiply(local.transpose()));
        const adjust = new T.Quaternion().setFromEuler(new T.Euler((p.rotateX || 0) * Math.PI / 180, (p.rotateY || 0) * Math.PI / 180, (p.rotateZ || 0) * Math.PI / 180, "XYZ"));
        object.quaternion.copy(hand).multiply(adjust).multiply(hand.clone().invert()).multiply(base);
        const stretch = (held.spec && held.spec.stretch) || null, size = (held.scale || 1) * (p.scale ?? 1);
        object.scale.set(size * (p.scaleX ?? 1) * (stretch ? stretch[0] ?? 1 : 1), size * (p.scaleY ?? 1) * (stretch ? stretch[1] ?? 1 : 1), size * (p.scaleZ ?? 1) * (stretch ? stretch[2] ?? 1 : 1));
        if (shape) {
            // Held By 0 (the base) is the model's own grip; any other value is that fraction of the way from the handle end to the tip.
            const along = p.pivotY ? Math.max(0, Math.min(1, p.pivotY)) : shape.grip;
            const gripPoint = fist ? new T.Vector3().fromArray(fist.local) : new T.Vector3().fromArray(shape.base).add(new T.Vector3().fromArray(shape.axis).multiplyScalar(shape.length * along));
            object.position.sub(gripPoint.multiplyScalar(object.scale.x).applyQuaternion(object.quaternion));
        }
    },
    /** The other hand takes the held thing a little way out along it, as far as an arm reaches. `note` is told where (`heldOffHand`). */
    both(owner, held, step, note) {
        const T = THREE, R = Reactor3D;
        if (step.hands !== "both" || !held || !held.object) return;
        const shape = R.heldShape(held.object);
        if (!shape) return;
        const other = step.attachment === "leftHand" ? "right" : "left", m = held.object.matrixWorld;
        held.object.updateMatrixWorld(true);
        const handle = step.hold === "fist" ? shape.handle : null;
        if (handle) {
            // Where the other hand holds: the marked Fore grip, else a good way ahead of the grip, as far out as its arm reaches;
            // there it comes up under the gun, palm on its underside, and its fingers close up the far side.
            const hand = this.joint(owner, other + "Hand"), upper = hand && hand.parent && hand.parent.parent;
            const axis = new T.Vector3().fromArray(shape.axis), down = new T.Vector3().fromArray(shape.down), origin = new T.Vector3().fromArray(shape.line);
            origin.addScaledVector(axis, -origin.clone().sub(new T.Vector3().fromArray(shape.base)).dot(axis));
            const mark = shape.marks && shape.marks.foreGrip ? this.foreAlong(shape) : null;
            let along = mark ?? this.foreAlong(shape);
            const forward = axis.clone().transformDirection(m), under = down.clone().transformDirection(m);
            const at = a => origin.clone().addScaledVector(axis, a).addScaledVector(down, R.heldUnderside(held.object, a)).applyMatrix4(m);
            if (upper && hand) {
                const S = upper.getWorldPosition(new T.Vector3()), reach = S.distanceTo(hand.parent.getWorldPosition(new T.Vector3())) + hand.parent.getWorldPosition(new T.Vector3()).distanceTo(hand.getWorldPosition(new T.Vector3()));
                const near = shape.length * handle.along + handle.radius * 2;
                // (The wrist is what must be within the arm's reach: the palm lies past it, across the gun.)
                const palm = (R.HandGrip.cupFrame(hand, forward, under) || {}).palm || new T.Vector3();
                for (let i = 0; i < 40 && along > near && at(along).sub(palm).distanceTo(S) > reach * .98; i++) along -= shape.length * .01;
                if (note) note.heldOffHand = { along: along / shape.length, marked: mark !== null, reached: mark === null || Math.abs(along - mark) < 1e-6 };
            }
            const cup = hand ? R.HandGrip.cupFrame(hand, forward, under) : null, point = at(along);
            this.reachArm(owner, other, cup ? point.clone().sub(cup.palm) : point, .7);
            if (cup) R.HandGrip.setTurn(hand, cup.quaternion);
            return;
        }
        const grip = new T.Vector3().fromArray(shape.base).add(new T.Vector3().fromArray(shape.axis).multiplyScalar(shape.length * shape.grip)), tip = new T.Vector3().fromArray(shape.base).add(new T.Vector3().fromArray(shape.axis).multiplyScalar(shape.length));
        this.reachArm(owner, other, grip.lerp(tip, .3).applyMatrix4(m), .7);
    },
    /**
     * Before a held thing is placed: the wrist's own turn eases off, the aiming arm reaches (bending the arm), and
     * the hand's frame is read from the bent arm; held in the fist, the fist's frame goes with it (`frame.grip`).
     * `goal` is what an aimed step points at, or null. Returns `{ frame, fist }`.
     */
    begin(owner, held, step, goal, placement, note) {
        const G = Reactor3D.HandGrip, inHand = this.HANDS.indexOf(step.attachment) >= 0 && !step.bone, thing = (held && held.object) || null;
        if (this.stances.size) this.unblade(owner);
        // In the fist the thing goes where the hand is. The older hold leaves the hand as its pose has it and the thing where it
        // always was: only the fingers close, as far as they meet it. A wrist turn in progress eases off.
        if (owner && owner.object && placement.visible !== false && inHand) G.turn(this.joint(owner, step.attachment), null);
        const frame = this.aim(owner, held, step, goal, note);
        // The step's own Tilt, Turn and Roll stay about the hand as it was posed, not as the grip turned it.
        if (frame && frame.quaternion) G.unturned(this.joint(owner, step.attachment, step.bone), frame.quaternion);
        // In the fist: the hand's own frame places the thing, the step's offset moving it within the hand.
        const fist = step.hold === "fist" && inHand && frame && thing
            ? G.fistFrame(this.joint(owner, step.attachment), thing, placement.pivotY, [placement.offsetX || 0, placement.offsetY || 0, placement.offsetZ || 0]) : null;
        if (fist) frame.grip = fist;
        return { frame, fist };
    },
    /** After a held thing is placed: the other hand takes it when both hold it, and the fingers close on what each hand holds. */
    finish(owner, held, step, frame, fist, visible, note) {
        const G = Reactor3D.HandGrip, thing = (held && held.object) || null;
        if (visible) this.both(owner, held, step, note);
        if (!owner || !owner.attachmentBones || !frame || !visible) return;
        G.hold(owner.attachmentBones.get(step.bone || step.attachment), thing, !!(fist && fist.byGrip));
        if (step.hands === "both" && thing) G.hold(owner.attachmentBones.get(step.attachment === "leftHand" ? "rightHand" : "leftHand"), thing);
    }
};

/**
 * Things held by characters on the map: a tactical battle's weapon steps
 * (`show`, `move`, `hide`: the Action Sequence weapon step as stored, plus
 * `battler`, `item`, `targetCharacter`), and the weapon a unit carries
 * between its actions (`carry`, `aim`, `drop`). A character with a 3D model
 * holds the model bound to the weapon or item, the way the Battle Room does
 * (`Reactor3D.Held`). The hold is worked out once, when it changes: the
 * thing then rides the hand as its child, and the arm's joints are set to
 * what was worked out each frame, so a held thing follows walking, turning,
 * height and the model's own animation at no cost, and one hold eases into
 * the next. A character without a model is left alone (every call answers
 * false). `clear` frees everything; leaving the map does it too.
 */
Reactor3D.MapHeld = {
    states: new Map(),
    count: 0,
    mapId: -1,
    frame: -1,
    // The frame a carried weapon was last worked into a hand (one unit a frame takes its weapon up).
    carriedAt: -1,
    // Frames a held thing takes to ease from one hold to another when the step gives none.
    EASE: 14,
    MOVE: ["x", "y", "z", "rotation", "rotateY", "rotateZ", "scale", "gripY", "easing"],
    // A blade carried at the side is tilted this far in the hand (degrees; negative dips its point toward the ground ahead).
    BLADE_TILT: -50,
    FACING: { 1: [-1, 1], 2: [0, 1], 3: [1, 1], 4: [-1, 0], 6: [1, 0], 7: [-1, -1], 8: [0, -1], 9: [1, -1] },
    usable(character) {
        return typeof THREE !== "undefined" && !!character && !!Reactor3D.characterModelSpec && !!Reactor3D.characterModelSpec(character);
    },
    /** The model a weapon step holds: the battler's equipped weapon (`iconSource` "weapon", `equipIndex`), the action's item or skill ("action"), or `weaponId`. */
    specFor(options) {
        const R = Reactor3D, source = options.iconSource || "weapon", battler = options.battler;
        if (options.weaponId) return R.databaseModelSpec("weapons", options.weaponId);
        if (source === "weapon") {
            const list = battler && battler.weapons ? battler.weapons() : [], weapon = list[Math.max(0, (options.equipIndex || 1) - 1)];
            return weapon ? R.databaseModelSpec("weapons", weapon.id) : null;
        }
        if (source === "action" && options.item) {
            const skill = typeof DataManager !== "undefined" && DataManager.isSkill && DataManager.isSkill(options.item);
            return R.databaseModelSpec(skill ? "skills" : "items", options.item.id);
        }
        return null;
    },
    keyOf(spec) {
        return Reactor3D.modelCacheKey(spec.name, spec.ext, spec.file) + "|" + (spec.variant || "") + "|" + (spec.size || 2) + "|" + (spec.scale || 1);
    },
    state(character, create) {
        const map = typeof $gameMap !== "undefined" && $gameMap && $gameMap.mapId ? $gameMap.mapId() : 0;
        if (map !== this.mapId) { this.clear(); this.mapId = map; }
        const key = Reactor3D.modelInstanceKey(character);
        let state = this.states.get(key);
        if (state && state.character !== character) { this.free(state); state = null; }
        if (!state && create) {
            state = { key, character, battler: null, carry: null, sequence: false, step: null, target: null, spec: null, specKey: "", record: null, template: null, loading: null,
                owner: null, shown: false, solved: true, t: 1, frames: 0, easing: "", slots: [], local: null, pinned: [], goalLocal: new THREE.Vector3(), aimed: false, idle: false, flat: false, lit: null };
            this.states.set(key, state);
            this.count = this.states.size;
        }
        return state || null;
    },
    /** Show a weapon step's thing in the character's hand. False when the character has no model, or nothing with a model is held. */
    show(character, options) {
        options = options || {};
        if (!this.usable(character)) return false;
        const spec = this.specFor(options);
        if (!spec) return false;
        const state = this.state(character, true), same = state.shown && state.specKey === this.keyOf(spec);
        if (options.battler) state.battler = options.battler;
        state.sequence = true;
        state.target = options.targetCharacter || null;
        const step = Object.assign({}, options);
        delete step.battler; delete step.item; delete step.targetCharacter;
        // A thing already in the hand (carried) eases into the step's hold; one that appears is there at once.
        // (`instant`: a run rebuilt after a load, or cut short, is there at once.)
        this.want(state, spec, step, options.instant ? 0 : Math.max(Number(options.duration) || 0, same ? 8 : 0));
        return true;
    },
    /** Move the thing a step showed: where it sits in the hand and how it is turned, eased over the step's `duration`. */
    move(character, options) {
        options = options || {};
        const state = character && this.usable(character) ? this.state(character, false) : null;
        if (!state || !state.shown || !state.step) return false;
        const step = Object.assign({}, state.step);
        for (const field of this.MOVE) if (options[field] !== undefined) step[field] = options[field];
        if (options.targetCharacter) state.target = options.targetCharacter;
        this.want(state, state.spec, step, options.instant ? 0 : Math.max(0, Number(options.duration) || 0));
        return true;
    },
    /** A sequence's thing leaves the hand: a unit that carries a weapon eases back to carrying it; another's fingers open and the thing is put away. */
    hide(character, options) {
        const state = character && typeof THREE !== "undefined" ? this.state(character, false) : null;
        if (!state) return false;
        state.sequence = false;
        state.target = null;
        if (!this.settle(state, options && options.instant ? 0 : this.EASE)) this.put(state);
        return true;
    },
    /** The unit carries its battler's weapon in hand between actions (and has it ready for the first step that shows it). */
    carry(character, options) {
        options = options || {};
        if (!this.usable(character)) return false;
        const state = this.state(character, true);
        if (options.battler) state.battler = options.battler;
        state.carry = { battler: options.battler || state.battler, weaponId: options.weaponId || 0, aim: null };
        if (state.sequence) return true;
        return this.settle(state, state.shown ? this.EASE : 0);
    },
    /** A carrying unit takes aim at a character (a gun comes up on the line to it), or with no target lowers it again. */
    aim(character, target) {
        const state = character && typeof THREE !== "undefined" ? this.state(character, false) : null;
        if (!state || !state.carry) return false;
        state.carry.aim = target || null;
        return state.sequence ? true : this.settle(state, 10);
    },
    /** The unit stops carrying: the weapon is put away (after the sequence that holds it, if one does). */
    drop(character) {
        const state = character && typeof THREE !== "undefined" ? this.state(character, false) : null;
        if (!state) return false;
        state.carry = null;
        if (!state.sequence) this.put(state);
        return true;
    },
    /** Whether the character has its thing out to use it: a sequence shows it, or it aims at somebody. Carried at the side is not. */
    inUse(character) {
        const state = character && typeof THREE !== "undefined" ? this.states.get(Reactor3D.modelInstanceKey(character)) : null;
        return !!state && state.character === character && !state.idle && state.shown && (state.sequence || !!(state.carry && state.carry.aim));
    },
    /** Where the tip of what the character holds is (a muzzle, a blade's point), in the map's scene, or null when it holds nothing there. */
    tipPoint(character) {
        const state = character && typeof THREE !== "undefined" ? this.states.get(Reactor3D.modelInstanceKey(character)) : null;
        const object = state && state.character === character && state.shown && !state.flat && state.record ? state.record.object : null;
        if (!object || !object.parent) return null;
        const shape = Reactor3D.heldShape(object);
        object.updateWorldMatrix(true, false);
        return new THREE.Vector3(shape.base[0] + shape.axis[0] * shape.length, shape.base[1] + shape.axis[1] * shape.length, shape.base[2] + shape.axis[2] * shape.length).applyMatrix4(object.matrixWorld);
    },
    /** Back to the carried weapon, eased over `frames`. False when nothing is carried. */
    settle(state, frames) {
        const carry = state.carry, spec = carry ? this.specFor({ battler: carry.battler, weaponId: carry.weaponId }) : null;
        if (!spec) return false;
        this.want(state, spec, { carry: true, hold: "fist", attachment: "rightHand", gripY: 0 }, frames);
        return true;
    },
    want(state, spec, step, frames) {
        const key = this.keyOf(spec);
        if (state.specKey !== key) { this.release(state); state.spec = spec; state.specKey = key; }
        state.step = step; state.shown = true; state.solved = false; state.frames = frames; state.easing = step.easing || ""; state.idle = false;
        this.load(state);
    },
    /** The thing leaves the hand: fingers open, the arms ease back to the model's own motion. */
    put(state) {
        state.shown = false; state.step = null; state.solved = true; state.aimed = false;
        this.unpin(state);
        const object = state.record && state.record.object;
        if (object && object.parent) object.parent.remove(object);
        for (const slot of state.slots) { if (slot.hasFrom || slot.hasTo) { slot.from.copy(slot.cur); slot.hasFrom = true; } slot.hasTo = false; }
        state.t = 0; state.frames = this.EASE; state.easing = ""; state.idle = false;
    },
    unpin(state) {
        for (const grip of state.pinned) grip.pinned = false;
        state.pinned.length = 0;
    },
    /** Put the held thing away for a climb: it leaves the picture and the arms go back to the model's own motion. */
    stow(state) {
        if (state.stowed) return;
        state.stowed = true;
        const object = state.record && state.record.object;
        if (object) object.visible = false;
        for (const slot of state.slots) if (slot && slot.node && slot.node.quaternion.equals(slot.out)) slot.node.quaternion.copy(slot.base);
    },
    /** Back in the hand after the climb: the arms ease from the model's own motion to the hold. */
    unstow(state) {
        state.stowed = false;
        const object = state.record && state.record.object;
        if (object) object.visible = true;
        for (const slot of state.slots) if (slot && slot.node) slot.hasFrom = false;
        if (state.shown) { state.t = 0; state.frames = this.EASE; }
    },
    /** A copy of a held model as a hand is given it: its transform, its rig or carved parts, its markers. */
    build(template, sidecar, spec) {
        const R = Reactor3D, object = R.cloneModelTemplate(template);
        R.applyModelTransform(object, R.readModelTransform(sidecar, spec));
        const rig = R.readModelRig(sidecar);
        if (rig) R.applyModelRig(object, rig);
        else { R.carveModelParts(object, R.readModelParts(sidecar)); R.applyPivotOverrides(object, R.readModelPivots(sidecar)); }
        const marks = R.readHeldRig(sidecar);
        if (marks) object.userData.__heldRig = marks;
        // What is held is part of whoever holds it: in a battle the map's fades pass a body by (Reactor3D.cutawayMarkBody).
        if (R.cutawayMarkMaterials) { object.__rrCutBody = true; R.cutawayMarkMaterials(object); }
        return object;
    },
    load(state) {
        const R = Reactor3D, spec = state.spec, key = state.specKey;
        if (state.record || state.loading === key) return;
        state.loading = key;
        Promise.all([R.loadModel(spec.name, spec.ext, spec.file, spec.texture), R.loadModelSidecar(spec.name)]).then(([template, sidecar]) => {
            if (state.loading === key) state.loading = null;
            if (!template || state.specKey !== key || state.record || this.states.get(state.key) !== state) return;
            const object = this.build(template, sidecar, spec);
            const e = template.userData.glbSize || { x: 1, y: 1, z: 1 }, scale = (spec.size || 2) * (spec.scale || 1) / Math.max(e.x, e.y, e.z, .001);
            object.scale.setScalar(scale);
            if (spec.variant && R.refreshModelVariant) R.refreshModelVariant({ object }, spec);
            state.record = { object, scale, spec, extent: e };
            state.template = template; state.lit = null; state.solved = false;
            // Its shape and surface are read here, once, so the first hold does not stall on them.
            object.updateMatrixWorld(true);
            R.heldShape(object); R.heldCloud(object);
        }).catch(() => { if (state.loading === key) state.loading = null; });
    },
    /** The held model goes: its copy's share of the GPU with it. */
    release(state) {
        this.unpin(state);
        const record = state.record;
        if (record) {
            if (record.object.parent) record.object.parent.remove(record.object);
            if (state.template) Reactor3D.releaseModelInstance(record.object, state.template);
        }
        state.record = null; state.template = null; state.local = null; state.loading = null;
    },
    free(state) {
        this.release(state);
        for (const slot of state.slots) if (slot && slot.node && slot.node.quaternion.equals(slot.out)) slot.node.quaternion.copy(slot.base);
        state.slots.length = 0;
        if (this.states.get(state.key) === state) this.states.delete(state.key);
        this.count = this.states.size;
    },
    /** Everything held on the map goes (a battle ends, the map is left). */
    clear() {
        for (const state of [...this.states.values()]) this.free(state);
        this.states.clear();
        this.count = 0;
    },
    /** A character's model is going (rebuilt, or left the view): its held thing comes off it, to be put back on the next one. */
    detach(holder) {
        const state = holder && holder.character ? this.states.get(Reactor3D.modelInstanceKey(holder.character)) : null;
        if (!state || !state.owner || state.owner.object !== holder.object) return;
        this.unbind(state);
    },
    unbind(state) {
        const object = state.record && state.record.object;
        if (object && object.parent) object.parent.remove(object);
        state.owner = null; state.slots.length = 0; state.pinned.length = 0; state.local = null;
        state.solved = !state.shown;
    },
    scratch() {
        return this._s || (this._s = { one: new THREE.Quaternion(), q: new THREE.Quaternion(), m: new THREE.Matrix4(), goal: new THREE.Vector3(), v: new THREE.Vector3() });
    },
    /** What an aimed hold points at, in the model's own stage: the target character, or (a long gun at the ready) low ahead of the unit. */
    goalOf(state, step, owner) {
        const R = Reactor3D, S = this.scratch(), c = state.character, o = owner.object.position;
        if (step.aim === "target" && state.target) {
            const t = state.target, spec = R.characterModelSpec(t), tall = spec ? (spec.size > 0 ? spec.size : 2) * (spec.scale > 0 ? spec.scale : 1) : 1.5;
            const map = typeof $dataMap !== "undefined" ? $dataMap : null;
            const rise = state.flat || !R.characterGround ? 0 : R.characterGround(map, t) - R.characterGround(map, c);
            return S.goal.set(o.x + (t._realX - c._realX), o.y + rise + tall * .6, o.z + (t._realY - c._realY));
        }
        if (step.aim === "ready") {
            const f = this.FACING[R.characterModelDir8(c)] || this.FACING[2], n = Math.hypot(f[0], f[1]), tall = (owner.extent.y || 1) * owner.object.scale.y;
            return S.goal.set(o.x + f[0] / n * tall * .6, o.y + tall * .42, o.z + f[1] / n * tall * .6);
        }
        return null;
    },
    /** Once a frame for each character that has a model, after its animation: true when what it holds changed the picture. */
    update(holder, character, scene, hidden) {
        const state = this.states.get(Reactor3D.modelInstanceKey(character));
        if (!state || state.character !== character || state.idle || !holder.object) return false;
        // Both hands are on the bars of what it rides (seated from the hop on to the hop off): the thing is put away, and the arms are the ride's.
        // One who takes aim from the seat, or whose sequence shows the thing, has it out: the ride lets the arms go (`inUse`).
        if (character._rrSeated && !this.inUse(character)) { this.stow(state); return false; }
        // Both hands are on the ledge it climbs: the thing is put away, and the arms are the climb's.
        if (character._reactorMantle) { this.stow(state); return false; }
        if (state.stowed) this.unstow(state);
        if (!state.owner || state.owner.object !== holder.object) {
            if (state.owner) this.unbind(state);
            state.owner = { object: holder.object, attachmentBones: new Map(), extent: holder.object.userData.glbSize || { x: 1, y: 1, z: 1 }, scale: 1 };
            state.flat = !scene;
        }
        if (hidden) return false;
        const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : -1;
        if (frame < 0 || frame !== this.frame) { this.frame = frame; this.tick = true; }
        if (state.shown && state.record) {
            if (!state.solved) {
                // Units taking up their weapons together (a battle begins) do it one a frame: a hold is the arms and
                // every finger worked out, 10 ms of it. A sequence's own step is never kept waiting.
                const carried = !!(state.step && state.step.carry) && !state.sequence;
                if (!carried || this.carriedAt !== this.frame) { if (carried) this.carriedAt = this.frame; this.solve(state, scene); }
            }
            else if (state.aimed) {
                // An aimed hold follows what it points at: worked out again when that has moved, as seen from the unit.
                const goal = this.goalOf(state, state.aimStep, state.owner);
                // (And every few frames while it aims: the body under the arms sways with its own motion, and the barrel stays on the line.)
                if (goal && (this.frame - state.solvedAt >= 6 || state.owner.object.worldToLocal(this.scratch().v.copy(goal)).distanceToSquared(state.goalLocal) > .0025)) { state.frames = 6; this.solve(state, scene); }
            }
        }
        const changed = this.replay(state);
        if (this.tick) { this.tick = false; Reactor3D.HandGrip.update(); }
        return changed;
    },
    /** Work the hold out: the arms as the step poses them, the thing in the hand, the fingers on it. */
    solve(state, scene) {
        const R = Reactor3D, H = R.Held, G = R.HandGrip, S = this.scratch(), owner = state.owner, held = state.record, object = held.object, raw = state.step;
        owner.object.updateMatrixWorld(true);
        owner.scale = owner.object.scale.y;
        const was = object.parent, local = state.local || (state.local = { fromP: new THREE.Vector3(), fromQ: new THREE.Quaternion(), fromS: new THREE.Vector3(1, 1, 1), toP: new THREE.Vector3(), toQ: new THREE.Quaternion(), toS: new THREE.Vector3(1, 1, 1), done: false });
        if (was) { local.fromP.copy(object.position); local.fromQ.copy(object.quaternion); local.fromS.copy(object.scale); was.remove(object); }
        object.position.set(0, 0, 0); object.quaternion.identity(); object.scale.setScalar(held.scale); object.updateMatrixWorld(true);
        const shape = R.heldShape(object);
        let step = raw;
        if (raw.carry) {
            // Carried: a blade at the side, a pistol lowered in the hand, a long gun in both hands at the ready; a gun comes up when the unit takes aim.
            const hand = H.joint(owner, "rightHand"), gun = shape && shape.handle && hand ? (G.fistFrame(hand, object, 0, null) || {}).aim : null;
            const long = !!(gun && gun.shoulder), aiming = !!(gun && state.carry && state.carry.aim);
            step = { carry: true, hold: "fist", attachment: "rightHand", gripY: 0, hands: long ? "both" : "one", aim: aiming ? "target" : long ? "ready" : "none", rotation: shape && !shape.handle ? this.BLADE_TILT : 0 };
            state.target = aiming ? state.carry.aim : null;
        }
        const main = H.HANDS.indexOf(step.attachment) >= 0 && !step.bone ? H.joint(owner, step.attachment) : null;
        if (!main) { state.solved = true; state.aimed = false; return; }
        const side = step.attachment === "leftHand" ? "left" : "right", off = H.joint(owner, (side === "right" ? "left" : "right") + "Hand"), torso = H.torso(owner, side);
        const nodes = [main.parent && main.parent.parent, main.parent, main, off && off.parent && off.parent.parent, off && off.parent, off, torso && torso.chest, torso && torso.head];
        // Each joint a hold can set, back at what the model's own motion gave it this frame.
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            let slot = state.slots[i];
            if (!node) { state.slots[i] = slot && slot.node ? slot : { node: null }; continue; }
            if (!slot || slot.node !== node) slot = state.slots[i] = { node, delta: i >= 6, base: node.quaternion.clone(), out: node.quaternion.clone(), from: new THREE.Quaternion(), to: new THREE.Quaternion(), cur: node.quaternion.clone(), hasFrom: false, hasTo: false };
            else if (node.quaternion.equals(slot.out)) node.quaternion.copy(slot.base);
            else slot.base.copy(node.quaternion);
            if (slot.hasFrom || slot.hasTo) { slot.from.copy(slot.cur); slot.hasFrom = true; }
        }
        const goal = this.goalOf(state, step, owner), now = step.aim === "ready" ? Object.assign({}, step, { aim: "target" }) : step;
        const B = globalThis.ReactorBattleData;
        const placement = B && B.heldPlacement ? B.heldPlacement({ x: 0, y: 0, z: 0 }, 0, step, held.spec)
            : { rotateX: -(step.rotation || 0), rotateY: step.rotateY || 0, rotateZ: step.rotateZ || 0, scale: step.scale ?? 1, pivotY: step.gripY ?? .5, offsetX: step.x || 0, offsetY: step.y || 0, offsetZ: step.z || 0 };
        const begun = H.begin(owner, held, now, goal, placement, state), frame = begun.frame, fist = begun.fist;
        const point = fist ? fist.position : frame && frame.fist ? frame.fist : null;
        if (!point) { state.solved = true; state.aimed = false; return; }
        object.position.copy(point);
        if (!fist) object.position.y += step.z || 0;
        placement.frame = frame;
        H.orient(held, placement);
        object.updateMatrixWorld(true);
        H.finish(owner, held, now, frame, fist, true, state);
        // The thing rides the hand from here on: where it sits in the hand, as worked out with the hand posed.
        main.updateWorldMatrix(true, false);
        S.m.copy(main.matrixWorld).invert().multiply(object.matrixWorld).decompose(local.toP, local.toQ, local.toS);
        if (was !== main) { local.fromP.copy(local.toP); local.fromQ.copy(local.toQ); local.fromS.copy(local.toS); }
        local.done = false;
        // What the hold set on the arms is kept and laid over the model's motion each frame; the joints go back to that motion for now.
        const aimed = now.aim === "target" && !!goal, both = step.hands === "both";
        for (let i = 0; i < nodes.length; i++) {
            const slot = state.slots[i];
            if (!slot.node) continue;
            const set = i < 3 ? aimed : i < 6 ? both : aimed;
            if (set && slot.delta) { slot.to.copy(slot.node.quaternion).multiply(S.q.copy(slot.base).invert()); slot.hasTo = Math.abs(slot.to.w) < .999999; }
            else if (set) { slot.to.copy(slot.node.quaternion); slot.hasTo = true; }
            else slot.hasTo = false;
            slot.node.quaternion.copy(slot.base);
            slot.out.copy(slot.base);
        }
        // The map lays the stance itself (the chest's slot), over the motion each frame; the Battle Room's undo of it is not wanted here.
        if (torso) H.stances.delete(torso.chest);
        main.add(object);
        object.position.copy(local.fromP); object.quaternion.copy(local.fromQ); object.scale.copy(local.fromS);
        this.unpin(state);
        for (const hand of both ? [main, off] : [main]) { const grip = hand ? R._handGrips.get(hand) : null; if (grip) { grip.pinned = true; state.pinned.push(grip); } }
        state.solved = true; state.t = state.frames > 0 ? 0 : 1; state.solvedAt = this.frame;
        state.aimed = step.aim === "target" && !!goal; state.aimStep = step;
        if (goal) owner.object.worldToLocal(state.goalLocal.copy(goal));
        if (scene && state.lit !== scene) this.light(state, scene);
    },
    /** A held model on a lit map takes the map's lights, as the character's own model does. */
    light(state, scene) {
        state.lit = scene;
        state.record.object.traverse(child => {
            const mats = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
            for (const mat of mats) {
                mat.__reactorModel = true; mat.fog = false;
                if (mat.color && !mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
                if (Reactor3D.litMaterial) Reactor3D.litMaterial(mat);
                if (scene._materials && scene._materials.indexOf(mat) < 0) scene._materials.push(mat);
            }
        });
        scene._ambientLevel = undefined;
    },
    /** Lay the hold over this frame's motion: the arm joints it set, eased from the hold before, and the thing's place in the hand. */
    replay(state) {
        const S = this.scratch(), easing = state.t < 1;
        if (easing) state.t = Math.min(1, state.t + 1 / Math.max(1, state.frames));
        const k = state.easing === "linear" ? state.t : state.t * state.t * (3 - 2 * state.t);
        let held = false;
        for (const slot of state.slots) {
            if (!slot.node || (!slot.hasFrom && !slot.hasTo)) continue;
            const node = slot.node;
            if (!node.quaternion.equals(slot.out)) slot.base.copy(node.quaternion);
            const a = slot.hasFrom ? slot.from : slot.delta ? S.one : slot.base, b = slot.hasTo ? slot.to : slot.delta ? S.one : slot.base;
            slot.cur.copy(a).slerp(b, k);
            if (slot.delta) node.quaternion.copy(slot.cur).multiply(slot.base); else node.quaternion.copy(slot.cur);
            slot.out.copy(node.quaternion);
            if (state.t >= 1 && !slot.hasTo) slot.hasFrom = false; else held = true;
        }
        const local = state.local, object = state.record && state.record.object;
        if (local && object && object.parent && !local.done) {
            object.position.lerpVectors(local.fromP, local.toP, k); object.quaternion.slerpQuaternions(local.fromQ, local.toQ, k); object.scale.lerpVectors(local.fromS, local.toS, k);
            local.done = state.t >= 1;
        }
        // Nothing shown and nothing left to ease: the unit is done with until it holds again.
        if (!state.shown && !held && state.t >= 1) { if (state.carry) state.idle = true; else this.free(state); }
        return easing || held;
    }
};

/**
 * A body pulling itself up a ledge keeps its hands on the edge
 * (`ReactorPhysics.updateMantle` moves the body; this poses the arms). Each
 * frame of a mantle, after the model's own motion, both arms reach for the lip
 * of the ledge where the body meets the wall: up at it while the body hangs
 * below, down on it as the body rises past, let go as it steps over. A climb
 * down holds the edge it left while that is within reach. The arms ease back
 * to the model's own motion when it is done. Models without hand joints keep
 * their motion.
 */
Reactor3D.MantlePose = {
    /** Frames the hands take onto the edge, and the arms back to the model's own motion afterwards. */
    IN: 5,
    OUT: 10,
    /** How far onto the top the hands lie, and over it, in tiles. */
    INSET: 0.08,
    LIFT: 0.03,
    /** The joints of both arms on a model, as slots that give the motion back what it did not rewrite; [] without hands. */
    slots(record) {
        const H = Reactor3D.Held, slots = [];
        for (const side of ["right", "left"]) {
            const hand = H.joint(record, side + "Hand"), fore = hand && hand.parent, upper = fore && fore.parent;
            if (!upper || !upper.parent || upper === record.object) return [];
            for (const node of [upper, fore]) slots.push({ node, side, base: node.quaternion.clone(), out: node.quaternion.clone(), set: false });
        }
        return slots;
    },
    /** Where the edge is, in the map's own space: on the wall's face between the two cells, at the height the hands take. */
    lip(mantle, out) {
        const step = Reactor3D.MantlePose.STEPS[mantle.d] || [0, 0];
        // Up: the top is the cell it goes to. Down: the cell it left.
        const onto = mantle.down ? -1 : 1;
        const height = mantle.down ? mantle.from : (Number.isFinite(mantle.lip) ? mantle.lip : mantle.to);
        return out.set(mantle.x + 0.5 - step[0] * 0.5 + step[0] * onto * this.INSET, height + this.LIFT, mantle.y + 0.5 - step[1] * 0.5 + step[1] * onto * this.INSET);
    },
    STEPS: { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] },
    /** How much of the pose shows this frame (0-1). */
    weight(mantle, character, state) {
        if (mantle.down) {
            // While the edge it left is within the arms' reach.
            const reach = state.reach || 1;
            return Math.max(0, Math.min(1, (reach * 1.2 - state.far) / (reach * 0.3)));
        }
        if (!mantle.over) return Math.min(1, (mantle.t || 0) / this.IN);
        // Over the edge: the hands push off and let go as the body comes onto the top.
        const rx = Number.isFinite(character._realX) ? character._realX : character.x, ry = Number.isFinite(character._realY) ? character._realY : character.y;
        const left = Math.abs(character._x - rx) + Math.abs(character._y - ry);
        return Math.max(0, Math.min(1, (left - 0.3) / 0.4));
    },
    /** Once a frame for a character with a model, after its animation: true when the pose changed the picture. */
    update(holder, character) {
        const mantle = character._reactorMantle, object = holder.object;
        let state = holder.mantlePose;
        if (!mantle && !state) return false;
        if (typeof THREE === "undefined" || !object || !object.parent || !Reactor3D.Held || !globalThis.ReactorBattleRoomView) { holder.mantlePose = null; return false; }
        if (!state || state.object !== object) {
            const record = { object, attachmentBones: new Map(), extent: object.userData.glbSize || { x: 1, y: 1, z: 1 }, scale: 1 };
            state = holder.mantlePose = { object, record, slots: this.slots(record), w: 0, fade: 0, reach: 0, far: 0, half: 0,
                lip: new THREE.Vector3(), right: new THREE.Vector3(), left: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion() };
        }
        if (!state.slots.length) { if (!mantle) holder.mantlePose = null; return false; }
        // What the motion did not rewrite goes back to what it last was, so the pose is laid over the motion, not over itself.
        for (const slot of state.slots) {
            if (slot.set && slot.node.quaternion.equals(slot.out)) slot.node.quaternion.copy(slot.base); else slot.base.copy(slot.node.quaternion);
            slot.set = false;
        }
        object.updateMatrixWorld(true);
        let weight;
        if (mantle) {
            const upperR = state.slots[0].node, upperL = state.slots[2].node;
            upperR.getWorldPosition(state.a); upperL.getWorldPosition(state.b);
            state.half = state.a.distanceTo(state.b) / 2;
            if (!state.reach) {
                const elbow = state.slots[1].node.getWorldPosition(new THREE.Vector3()), hand = Reactor3D.Held.joint(state.record, "rightHand").getWorldPosition(new THREE.Vector3());
                state.reach = state.a.distanceTo(elbow) + elbow.distanceTo(hand);
            }
            object.parent.localToWorld(this.lip(mantle, state.lip));
            // Each hand on the edge in front of its own shoulder.
            const step = this.STEPS[mantle.d] || [0, 0];
            state.right.copy(state.a).sub(state.b);
            const along = state.right.x * -step[1] + state.right.z * step[0], sign = along >= 0 ? 1 : -1;
            state.right.set(state.lip.x - step[1] * state.half * sign, state.lip.y, state.lip.z + step[0] * state.half * sign);
            state.left.set(state.lip.x + step[1] * state.half * sign, state.lip.y, state.lip.z - step[0] * state.half * sign);
            state.far = state.a.add(state.b).multiplyScalar(0.5).distanceTo(state.lip);
            weight = this.weight(mantle, character, state);
            state.w = weight; state.fade = this.OUT;
        } else {
            state.fade--;
            weight = state.w * Math.max(0, state.fade) / this.OUT;
            if (state.fade <= 0) { holder.mantlePose = null; return true; }
        }
        if (weight <= 0.001) return false;
        Reactor3D.Held.reachArm(state.record, "right", state.right, 0.35);
        Reactor3D.Held.reachArm(state.record, "left", state.left, 0.35);
        for (const slot of state.slots) {
            state.q.copy(slot.base).slerp(slot.node.quaternion, weight);
            slot.node.quaternion.copy(state.q);
            slot.out.copy(state.q); slot.set = true;
        }
        return true;
    }
};

/** How far toward the wall a body pulling itself up a ledge is drawn: its front against the wall's face, by how far the physics says it leans. */
Reactor3D.mantleHold = function(holder, character) {
    const mantle = character._reactorMantle;
    if (!mantle || !holder) return 0;
    if (holder.mantleDepth === undefined) {
        const extent = holder.object && holder.object.userData.glbSize;
        holder.mantleDepth = extent ? Math.min(0.42, Math.max(0.12, extent.z * (holder.object.scale.z || 1) / 2)) : 0.3;
    }
    const full = (typeof ReactorPhysics !== "undefined" && ReactorPhysics.MANTLE_LEAN) || 0.32;
    return Math.min(1, (mantle.lean || 0) / full) * Math.max(0, 0.5 - holder.mantleDepth - Reactor3D.MANTLE_WALL_GAP);
};
/** The gap left between a climber's front and the wall it climbs, in tiles. */
Reactor3D.MANTLE_WALL_GAP = 0.03;

/** A node that hinges like a bone: a THREE.Bone, or a file joint (often a plain Group) the rig names. */
Reactor3D.isRigJoint = function(node) {
    return !!node && (node.isBone || !!(node.userData && node.userData.__reactorClipBone));
};

Reactor3D.applyModelRig = function(root, rig) {
    if (typeof THREE === "undefined" || !root || !rig || !rig.bones.length) return;
    if (this.mapRigToSkeleton(root, rig)) {
        this.attachLibraryMotions(root, rig);
        return;
    }
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
    // The finger joints the hands gained follow the rig's own bones in the skeleton.
    const fingerJoints = this.rigFingerJoints(root), fingerHands = new Map();
    for (const joint of fingerJoints) {
        const at = bones.indexOf(joint.hand), e = joint.entry;
        if (at < 0) continue;
        let hand = fingerHands.get(joint.hand);
        if (!hand) fingerHands.set(joint.hand, hand = { index: at, node: joint.hand, fingers: [] });
        hand.fingers.push({ base: e.base, tip: e.tip, length: e.length, radius: e.radius, thumb: e.thumb, one: bones.length, two: bones.length + 1 });
        bones.push(joint.one, joint.two);
    }
    if (fingerHands.size) root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    for (const key of Object.keys(rig.weights)) {
        const mesh = meshes[Number(key)];
        const data = rig.weights[key];
        if (!mesh || !mesh.geometry) continue;
        const geometry = mesh.geometry;
        const position = geometry.getAttribute("position");
        if (!position || position.count !== data.count) continue;
        const weightScale = 1 / 255;
        let skinWeights = new Float32Array(data.count * 4);
        for (let i = 0; i < data.count * 4; i++) skinWeights[i] = data.weights[i] * weightScale;
        let skinIndices = Uint16Array.from(data.indices);
        let fingerSkin = null;
        if (fingerHands.size) {
            // The hands' share of the skin goes on to their finger joints, in each hand's own frame at rest:
            // worked out once for every copy of this rig, off the main thread where it can be.
            mesh.updateMatrixWorld(true);
            const handList = [...fingerHands.values()];
            const list = handList.map(hand => ({ index: hand.index, fingers: hand.fingers,
                toHand: new THREE.Matrix4().copy(hand.node.matrixWorld).invert().multiply(mesh.matrixWorld).elements }));
            const round = v => Math.round(v * 1e4) / 1e4;
            const signature = data.count + "|" + (geometry.index ? geometry.index.count : 0) + "|" + list.map(h => h.index + ":" + h.toHand.map(round).join(",") + ":"
                + h.fingers.map(f => [f.one, f.two, ...f.base.map(round), ...f.tip.map(round), round(f.radius)].join(",")).join(";")).join("|");
            const versions = this.FingerSkin._rigSkins.get(data) || [];
            this.FingerSkin._rigSkins.set(data, versions);
            fingerSkin = versions.find(entry => entry.signature === signature);
            if (!fingerSkin) {
                const entry = fingerSkin = { signature, index: null, weight: null, mitts: null, waiting: [] };
                versions.push(entry);
                this.FingerSkin.run(data.count, position, skinIndices, skinWeights, list, geometry.index || null, made => {
                    Object.assign(entry, { index: made.index, weight: made.weight, mitts: list.map(h => !!h.mitt) });
                    const waiting = entry.waiting;
                    entry.waiting = null;
                    for (const wear of waiting) wear();
                });
            }
            const entry = fingerSkin;
            const wear = () => {
                geometry.setAttribute("skinIndex", new THREE.BufferAttribute(entry.index, 4));
                geometry.setAttribute("skinWeight", new THREE.BufferAttribute(entry.weight, 4));
                handList.forEach((hand, i) => { if (entry.mitts[i]) this._handGrips.get(hand.node).layout.mitt = true; });
            };
            if (entry.waiting) entry.waiting.push(wear);
            else { skinIndices = entry.index; skinWeights = entry.weight; handList.forEach((hand, i) => { if (entry.mitts[i]) this._handGrips.get(hand.node).layout.mitt = true; }); }
        }
        geometry.setAttribute("skinIndex",
            new THREE.BufferAttribute(skinIndices, 4));
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
    this.attachLibraryMotions(root, rig);
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
            // A rigged humanoid's motions come from the shared library: in before the model is.
            const done = () => Reactor3D.whenMotionLibrary(parsed).then(() => resolve(parsed));
            const rig = parsed && parsed.rig;
            if (!rig || !rig.weightsFile || rig.weights) {
                done();
                return;
            }
            // The pointer is a bare filename inside the model's folder;
            // anything path-like is refused.
            const file = String(rig.weightsFile);
            if (/[\\/]/.test(file) || file.indexOf("..") >= 0) {
                done();
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
                done();
            };
            binXhr.onerror = () => done();
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
 * Whether the camera is inside the player's own model: pulled in close by a
 * wall, a bank or a look up, it would show the inside of the body. The model
 * steps aside until the camera backs off (first person has its own rule).
 */
Reactor3D.CAMERA_INSIDE_REACH = 0.9;
Reactor3D.cameraInsideModel = function(character, object) {
    if (typeof $gamePlayer === "undefined" || character !== $gamePlayer || !object || !this.activeCamera) return false;
    const camera = this.activeCamera();
    if (!camera) return false;
    const box = object.userData.__reactorHeight || (object.userData.__reactorHeight = (() => {
        const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
        return Number.isFinite(size.y) && size.y > 0 ? size.y : 3;
    })());
    const p = camera.position, o = object.position;
    // The nearest point of the body's upright line to the camera.
    const y = Math.max(o.y, Math.min(o.y + box, p.y));
    return Math.hypot(p.x - o.x, p.y - y, p.z - o.z) < this.CAMERA_INSIDE_REACH;
};

/**
 * Where a climber hangs on its ladder. The rungs stand LADDER_RUNGS tiles ahead
 * of the cell's middle (the ladder piece's rung plane); the climber is placed
 * so its chest is LADDER_CHEST_GAP behind them, measured on its own model
 * (models stand with their chests ahead of their feet by differing amounts),
 * which leaves reaching hands on the rungs and the body clear of the wall.
 */
Reactor3D.LADDER_RUNGS = 0.39;
Reactor3D.LADDER_CHEST_GAP = 0.45;
/** Tiles climbed for one whole climbing cycle: two rungs, one reach of each hand. */
Reactor3D.CLIMB_CYCLE = 1;

/**
 * A limp body (a fatal fall): the rig's joints become points under gravity,
 * held apart at their bone lengths, braced across the hips and shoulders so
 * the torso stays one piece, landing on the map's own ground. Each frame
 * the model's bones turn to lie along them: the hips and chest as whole
 * frames, every other bone aimed at the next joint down its limb. Nothing
 * holds a limb up, so it falls wherever the body's momentum and the ground
 * take it. Works on a rig built in the editor and on a model's own bones.
 */
Reactor3D.RAGDOLL_BONES = [
    ["Hips", null], ["Spine", "Hips"], ["Chest", "Spine"], ["Neck", "Chest"], ["Head", "Neck"],
    ["LeftUpperArm", "Chest"], ["LeftLowerArm", "LeftUpperArm"], ["LeftHand", "LeftLowerArm"],
    ["RightUpperArm", "Chest"], ["RightLowerArm", "RightUpperArm"], ["RightHand", "RightLowerArm"],
    ["LeftUpperLeg", "Hips"], ["LeftLowerLeg", "LeftUpperLeg"], ["LeftFoot", "LeftLowerLeg"],
    ["RightUpperLeg", "Hips"], ["RightLowerLeg", "RightUpperLeg"], ["RightFoot", "RightLowerLeg"]
];
/** Constraint passes a frame, air damping, and the share of sliding speed ground contact keeps. */
Reactor3D.RAGDOLL_ITERATIONS = 6;
Reactor3D.RAGDOLL_DAMPING = 0.995;
Reactor3D.RAGDOLL_GROUND_KEEP = 0.8;
/** Share of a hard landing's speed a body bounces back with. */
Reactor3D.RAGDOLL_BOUNCE = 0.4;
/** How hard the impact flings each hand and foot its own way (tiles a frame, per unit of impact). */
Reactor3D.RAGDOLL_FLING = 0.9;

Reactor3D.startRagdoll = function(holder, character) {
    if (typeof THREE === "undefined" || !holder.binding || !holder.object) return null;
    const object = holder.object;
    object.updateMatrixWorld(true);
    // The body leaves the model's standing bounds as it falls.
    object.traverse(node => { if (node.isMesh) node.frustumCulled = false; });
    object.userData.rrNoCull = true;
    const nodes = {};
    for (const entry of holder.binding.meshes) for (const part of entry.parts) if (!nodes[part.name]) nodes[part.name] = entry.mesh;
    const bones = Reactor3D.RAGDOLL_BONES.filter(([name]) => nodes[name]);
    if (!nodes.Hips || bones.length < 6) return { rigid: true };
    const points = [], index = {};
    const add = (name, at, radius) => { index[name] = points.length; points.push({ p: at.clone(), q: at.clone(), r: radius }); };
    for (const [name] of bones) add(name, nodes[name].getWorldPosition(new THREE.Vector3()), name === "Head" ? 0.16 : 0.08);
    // A bone at the end of a chain gets a tip to aim at: the head's crown, a hand's fingers, a foot's toes.
    const height = Math.max(0.5, (points[index.Head ?? index.Chest].p.y - object.position.y) || 1.5);
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const tip = (name, from, length, dir) => {
        if (index[name] === undefined) return;
        const base = points[index[name]].p;
        const d = dir || base.clone().sub(points[index[from]].p).normalize();
        add(name + "Tip", base.clone().addScaledVector(d, length), 0.06);
    };
    tip("Head", nodes.Neck ? "Neck" : "Chest", height * 0.1);
    for (const side of ["Left", "Right"]) {
        if (index[side + "LowerArm"] !== undefined) tip(side + "Hand", side + "LowerArm", height * 0.07);
        tip(side + "Foot", null, height * 0.09, facing);
    }
    // A rig without a spine, chest or neck part reaches past the gap to the next joint it has.
    const first = (...names) => names.find(name => index[name] !== undefined);
    const constraints = [];
    const tie = (a, b, stiff = 1) => {
        if (index[a] === undefined || index[b] === undefined) return;
        constraints.push([index[a], index[b], points[index[a]].p.distanceTo(points[index[b]].p), stiff]);
    };
    // Each joint ties to its nearest ancestor the rig has.
    const parentOf = Object.fromEntries(Reactor3D.RAGDOLL_BONES);
    const present = name => { let at = parentOf[name]; while (at && !nodes[at]) at = parentOf[at]; return at; };
    for (const [name] of bones) { const up = present(name); if (up) tie(name, up); }
    for (const name of ["Head", "LeftHand", "RightHand", "LeftFoot", "RightFoot"]) tie(name, name + "Tip");
    // Braces: the pelvis, the ribcage and the shoulders keep their shape; a neck is stiff.
    const torso = first("Chest", "Spine", "Neck");
    tie("LeftUpperLeg", "RightUpperLeg"); tie("LeftUpperArm", "RightUpperArm");
    tie("Hips", torso); tie(first("Spine", "Chest"), "LeftUpperArm"); tie(first("Spine", "Chest"), "RightUpperArm");
    // Only loosely: a limp body folds at the waist and its head lolls.
    tie("Hips", "LeftUpperArm", 0.25); tie("Hips", "RightUpperArm", 0.25);
    tie("Chest", "LeftUpperLeg", 0.25); tie("Chest", "RightUpperLeg", 0.25);
    tie("Chest", "Head", 0.15);
    // The fall's speed carries on: the character's own run, the impact, and a topple
    // that grows with height so the body folds and goes over rather than dropping straight.
    const start = character._reactorRagdoll || {};
    const side = new THREE.Vector3(facing.z, 0, -facing.x);
    const lean = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.5);
    const topple = facing.clone().multiplyScalar(0.8 + Math.random() * 0.4).addScaledVector(side, lean).normalize();
    const ground = object.position.y;
    // The impact flings each hand and foot (and its end) its own way, up and out: limbs flail.
    const impact = Math.min(1, Math.abs(start.vy || 0) / 0.3);
    const flung = {};
    for (const name of ["LeftHand", "RightHand", "LeftFoot", "RightFoot", "LeftLowerArm", "RightLowerArm", "Head"]) {
        const angle = Math.random() * Math.PI * 2;
        const share = name.includes("Lower") ? 0.6 : name === "Head" ? 0.4 : 1;
        const kick = Reactor3D.RAGDOLL_FLING * impact * share * (0.5 + Math.random() * 0.5) * 0.2;
        flung[name] = new THREE.Vector3(Math.cos(angle) * kick, kick * (0.8 + Math.random() * 0.6), Math.sin(angle) * kick);
        flung[name + "Tip"] = flung[name];
    }
    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const up = Math.max(0, (point.p.y - ground) / height);
        const v = new THREE.Vector3(start.vx || 0, Math.min(0, start.vy || 0) * 0.25 * up, start.vz || 0)
            .addScaledVector(topple, 0.055 * up);
        const name = Object.keys(index).find(key => index[key] === i);
        if (flung[name]) v.add(flung[name]);
        point.q.sub(v);
    }
    // Each driven bone: what it aims at and how it lay when the body went limp.
    const aim = { Hips: first("Spine", "Chest", "Neck", "Head"), Spine: first("Chest", "Neck", "Head"), Chest: first("Neck", "Head"), Neck: "Head", Head: "HeadTip",
        LeftUpperArm: "LeftLowerArm", LeftLowerArm: "LeftHand", LeftHand: "LeftHandTip",
        RightUpperArm: "RightLowerArm", RightLowerArm: "RightHand", RightHand: "RightHandTip",
        LeftUpperLeg: "LeftLowerLeg", LeftLowerLeg: "LeftFoot", LeftFoot: "LeftFootTip",
        RightUpperLeg: "RightLowerLeg", RightLowerLeg: "RightFoot", RightFoot: "RightFootTip" };
    const across = { Hips: ["RightUpperLeg", "LeftUpperLeg"], Chest: ["RightUpperArm", "LeftUpperArm"] };
    const drive = [];
    for (const [name] of bones) {
        const to = aim[name];
        if (index[to] === undefined) continue;
        const bone = { name, node: nodes[name], from: index[name], to: index[to], rest: nodes[name].getWorldQuaternion(new THREE.Quaternion()) };
        const pair = across[name];
        if (pair && index[pair[0]] !== undefined && index[pair[1]] !== undefined) bone.across = [index[pair[0]], index[pair[1]]];
        bone.basis = Reactor3D.ragdollBasis(points, bone);
        drive.push(bone);
    }
    return { points, constraints, drive, frame: -1, still: 0 };
};

/** A bone's frame from the points: along it, and across it where it has a width (hips, shoulders). */
Reactor3D.ragdollBasis = function(points, bone) {
    const along = points[bone.to].p.clone().sub(points[bone.from].p).normalize();
    if (!bone.across) return along;
    const x = points[bone.across[1]].p.clone().sub(points[bone.across[0]].p);
    x.addScaledVector(along, -x.dot(along)).normalize();
    const z = new THREE.Vector3().crossVectors(x, along);
    return new THREE.Matrix4().makeBasis(x, along, z);
};

Reactor3D.stepRagdoll = function(holder, character) {
    // A body that cannot go limp (an odd rig, a failure) still falls over rather than stopping the game.
    try {
        Reactor3D.runRagdoll(holder, character);
    } catch (error) {
        console.error("Reactor3D: ragdoll failed; the model tips over instead.", error);
        holder.ragdoll = { rigid: true };
        character._reactorPosePitch = -1;
    }
};

Reactor3D.runRagdoll = function(holder, character) {
    if (!holder.ragdoll) holder.ragdoll = Reactor3D.startRagdoll(holder, character) || { rigid: true };
    const doll = holder.ragdoll;
    const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : (doll.frame + 1);
    if (doll.rigid) {
        // No rig to go limp with: the whole model tips over onto its face.
        character._reactorPosePitch = -1;
        return;
    }
    if (frame === doll.frame) return;
    doll.frame = frame;
    const map = typeof $dataMap !== "undefined" ? $dataMap : null;
    const physics = typeof ReactorPhysics !== "undefined" ? ReactorPhysics : null;
    const gravity = physics ? physics.gravityPerFrame() : 0.0045;
    let moving = 0;
    for (const point of doll.points) {
        const vx = (point.p.x - point.q.x) * Reactor3D.RAGDOLL_DAMPING;
        const vy = (point.p.y - point.q.y) * Reactor3D.RAGDOLL_DAMPING;
        const vz = (point.p.z - point.q.z) * Reactor3D.RAGDOLL_DAMPING;
        point.q.copy(point.p);
        point.p.x += vx; point.p.y += vy - gravity; point.p.z += vz;
        moving = Math.max(moving, Math.abs(vx) + Math.abs(vy) + Math.abs(vz));
    }
    for (let pass = 0; pass < Reactor3D.RAGDOLL_ITERATIONS; pass++) {
        for (const [a, b, length, stiff] of doll.constraints) {
            const pa = doll.points[a].p, pb = doll.points[b].p;
            const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
            const k = (d - length) / d * 0.5 * stiff;
            pa.x += dx * k; pa.y += dy * k; pa.z += dz * k;
            pb.x -= dx * k; pb.y -= dy * k; pb.z -= dz * k;
        }
        for (const point of doll.points) {
            const floor = (map && Reactor3D.groundHeightAt ? Reactor3D.groundHeightAt(map, point.p.x, point.p.z, point.p.y) : 0) + point.r;
            if (point.p.y < floor) {
                const into = point.p.y - point.q.y;
                point.p.y = floor;
                // Ground contact scrubs the slide, once a frame (every pass stopped a body dead):
                // a body skids and rolls a little and stops.
                if (pass === 0) {
                    point.q.x = point.p.x - (point.p.x - point.q.x) * Reactor3D.RAGDOLL_GROUND_KEEP;
                    point.q.z = point.p.z - (point.p.z - point.q.z) * Reactor3D.RAGDOLL_GROUND_KEEP;
                }
                // The first touch bounces a little; after that the ground just holds it.
                point.q.y = pass === 0 && into < -0.03 ? point.p.y + into * Reactor3D.RAGDOLL_BOUNCE : Math.max(point.q.y, point.p.y);
            }
        }
    }
    doll.still = moving < 0.001 ? doll.still + 1 : 0;
    Reactor3D.poseRagdoll(holder, doll);
};

/** Turn each driven bone, parent before child, so it lies along its points. */
Reactor3D.poseRagdoll = function(holder, doll) {
    const turn = new THREE.Quaternion(), world = new THREE.Quaternion(), parentWorld = new THREE.Quaternion();
    const rest = new THREE.Matrix4(), now = new THREE.Matrix4();
    for (const bone of doll.drive) {
        const current = Reactor3D.ragdollBasis(doll.points, bone);
        if (bone.across) {
            rest.copy(bone.basis).invert();
            now.copy(current).multiply(rest);
            turn.setFromRotationMatrix(now);
        } else {
            turn.setFromUnitVectors(bone.basis, current);
        }
        world.copy(turn).multiply(bone.rest);
        const node = bone.node, parent = node.parent;
        if (parent) {
            parent.updateMatrixWorld(true);
            parent.getWorldQuaternion(parentWorld);
            node.quaternion.copy(parentWorld.invert().multiply(world));
            if (bone.name === "Hips") node.position.copy(parent.worldToLocal(doll.points[bone.from].p.clone()));
        } else {
            node.quaternion.copy(world);
        }
        node.updateMatrixWorld(true);
    }
};

/** How far ahead of its feet a model's chest stands, in world tiles (0 when it has none). */
Reactor3D.chestForward = function(holder) {
    if (typeof THREE === "undefined" || !holder || !holder.binding || !holder.object) return 0;
    for (const entry of holder.binding.meshes) {
        if (!entry.parts.some(part => part.name === "Chest" || part.name === "Spine")) continue;
        holder.object.updateMatrixWorld(true);
        const at = entry.mesh.getWorldPosition(new THREE.Vector3());
        holder.object.worldToLocal(at);
        return at.z * (holder.object.scale.z || 1);
    }
    return 0;
};

/** Whether a character is climbing by the physics: on a ladder, or pulling itself up (or lowering itself down) beside a ledge. */
Reactor3D.isClimbing = function(character) {
    // (Over the edge of a ledge the body steps onto the top: a walk, not a climb.)
    return !!(character && (character._reactorOnLadder || (character._reactorMantle && !character._reactorMantle.over)));
};

/** Whether a character is swimming by the physics. */
Reactor3D.isSwimming = function(character) {
    return !!(character && character._reactorSwim);
};

/** Whether a character is in the air by the physics (a jump, a fall). */
Reactor3D.isAirborne = function(character) {
    const physics = typeof ReactorPhysics !== "undefined" ? ReactorPhysics : null;
    return !!(physics && physics.isAirborne && physics.isAirborne(character));
};

/**
 * Movement triggers by specificity: "moving" is any travel, "walking" is
 * travel without dashing, "dashing" is travel while dashing, "jumping" is
 * any time in the air (the rise and the fall), "swimming" moving through
 * deep water and "treading" floating still in it. "idle" is standing still
 * on the ground. "riding" is seated on a vehicle, and outranks every one of
 * them. Returns true/false for those triggers and null for every other
 * trigger.
 */
/** Standing still on the ground: not moving, in the air, in deep water, on a ladder or seated on a vehicle. */
Reactor3D.isIdleState = function(state) {
    return !state.moving && !state.airborne && !state.swimming && !state.climbing && !state.riding;
};

Reactor3D.moveTriggerActive = function(trigger, state) {
    // A seated rider (`state.riding`) plays its riding motion whatever the vehicle under it does: rolling,
    // in the air or through a ford, none of the body's own states is in force. Rules that play always or
    // on demand are not movement triggers and answer null as for anyone.
    if (trigger === "riding") return !!state.riding;
    if (state.riding) return trigger === "always" || trigger === "action" ? null : false;
    if (trigger === "jumping") return !!state.airborne;
    if (trigger === "swimming") return !!state.swimming && !!state.moving;
    if (trigger === "treading") return !!state.swimming && !state.moving;
    if (trigger === "idle") return Reactor3D.isIdleState(state);
    if (trigger === "climbing") return !!state.climbing;
    if (trigger === "moving") return !!state.moving;
    // A gait is walked on the ground: in the air, in deep water or on a ladder the state's own motion plays.
    const grounded = !state.airborne && !state.swimming && !state.climbing;
    if (trigger === "walking") return !!state.moving && !state.dashing && grounded;
    if (trigger === "dashing") return !!(state.moving && state.dashing) && grounded;
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
        const clip = Reactor3D.resolveLibraryMotion((clips || []).find(c => c.name === rule.clip));
        return clip ? Math.max(1, Math.round(clip.duration * 60 / (rule.rate || 1))) : 60;
    }
    // A pose goes there and back: in over one period, out over another —
    // unless it holds, in which case the action only needs the way in and
    // the latch keeps it there.
    // A staying pose is never over while its action stands.
    // A keyed one that ends on its last pose eases back to rest after it.
    if (rule.type === "pose") return rule.stay ? Infinity : rule.hold ? rule.period : rule.period * 2 * rule.cycles + (Reactor3D.poseSettles(rule) ? Reactor3D.POSE_SETTLE_FRAMES : 0);
    return rule.period * rule.cycles;
};

/** How many frames a one-off keyed motion that ends on a pose takes to ease back to rest after it. */
Reactor3D.POSE_SETTLE_FRAMES = 12;

/**
 * Whether a keyed pose played once ends away from rest: its last key at the
 * end and not at rest. Its timeline stops on that pose (the motion ends where
 * its author left it), and the part eases back to rest over
 * POSE_SETTLE_FRAMES after, rather than jumping there when the action ends.
 */
Reactor3D.poseSettles = function(rule) {
    if (!rule || rule.type !== "pose" || rule.trigger !== "action" || rule.hold || rule.stay || rule.instant || rule.repeat) return false;
    const keys = rule.keys;
    if (!Array.isArray(keys) || !keys.length) return false;
    const last = keys[keys.length - 1];
    if (!last || !(last.at >= 1)) return false;
    const off = (values, rest) => Array.isArray(values) && values.some(value => Math.abs((Number(value) || 0) - rest) > 1e-6);
    return off(last.rotate, 0) || off(last.move, 0) || off(last.resize, 1);
};

/** How many frames a state's looping motion takes to fade in or out. */
Reactor3D.MOTION_FADE_FRAMES = 8;

/** Smoothstep: pose blends accelerate in and settle out. */
Reactor3D.poseEase = function(blend) {
    const b = Math.min(1, Math.max(0, blend));
    return b * b * (3 - 2 * b);
};

/**
 * How a step into a key may go, by the key's `ease`: steady (one speed all
 * the way), in (starts slow, ends fast), out (starts fast, ends slow), both
 * (slow at both ends, stopping at the key), snap (there almost at once, in
 * the first fifth of the step, then holding), overshoot (goes past the key and settles back). A key with none
 * flows through on the timeline's curve.
 */
Reactor3D.KEY_EASES = ["steady", "in", "out", "both", "snap", "overshoot"];

/** A step's progress (0..1) eased as `ease` says. */
Reactor3D.keyEase = function(ease, t) {
    switch (ease) {
        case "in": return t * t * t;
        case "out": { const u = 1 - t; return 1 - u * u * u; }
        case "both": return t * t * (3 - 2 * t);
        case "snap": { const u = 1 - Math.min(1, t * 5); return 1 - u * u * u; }
        case "overshoot": { const c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
        default: return t;
    }
};

/**
 * Sample a keyed pose timeline at progress p (0..1). The timeline starts
 * at rest and returns to rest at the end unless the final key sits at 1.
 * Between stops it follows a monotone cubic through them, per euler
 * component: it slows to a stop only where the motion turns back or
 * holds, never overshoots a stop, and passes through every other stop
 * at speed. Easing in and out of every stop made a swing sampled into
 * keys (a breath, a stride) stop dead at each one, a visible judder.
 * The first and last stops ease from and to stillness; a looping
 * timeline (any trigger but an action) whose ends meet runs through
 * the seam instead, a rotation meeting itself a whole turn on.
 */
Reactor3D.sampleModelKeys = function(rule, p) {
    const REST = [0, 0, 0], ONE = [1, 1, 1];
    const stops = [{ at: 0, rotate: REST, move: REST, resize: ONE }].concat(rule.keys);
    // A key at 0 replaces the rest stop rather than sitting on top of it.
    if (stops.length > 1 && stops[1].at <= 0) stops.shift();
    const last = stops[stops.length - 1];
    if (last.at < 1) stops.push({ at: 1, rotate: REST, move: REST, resize: ONE });
    const n = stops.length;
    let k = 0;
    while (k + 2 < n && p > stops[k + 1].at) k++;
    const a = stops[k], b = stops[Math.min(n - 1, k + 1)];
    const span = b.at - a.at;
    if (!(span > 0)) return { rotate: b.rotate.slice(), move: (b.move || REST).slice(), resize: (b.resize || ONE).slice() };
    const t = Math.min(1, Math.max(0, (p - a.at) / span));
    const loops = !!rule.trigger && rule.trigger !== "action";
    const field = (stop, name, i) => (stop[name] || (name === "resize" ? ONE : REST))[i];
    // Slope of segment j (stops j..j+1), wrapping for a loop.
    // A turn that ends a whole revolution from where it began (an arm's windmill) meets itself.
    const meets = (name, i) => {
        const gap = field(stops[n - 1], name, i) - field(stops[0], name, i);
        return name === "rotate" ? Math.abs(gap - 360 * Math.round(gap / 360)) < 1e-6 : gap === 0;
    };
    const slope = (name, i, j) => {
        if (j < 0 || j >= n - 1) {
            if (!loops || n < 3 || !meets(name, i)) return null;
            j = j < 0 ? n - 2 : 0;
        }
        const h = stops[j + 1].at - stops[j].at;
        return h > 0 ? (field(stops[j + 1], name, i) - field(stops[j], name, i)) / h : 0;
    };
    const width = j => {
        if (j < 0) j = n - 2; else if (j >= n - 1) j = 0;
        return stops[j + 1].at - stops[j].at;
    };
    // Fritsch-Butland tangent at stop j: zero at a turn or a hold.
    const tangent = (name, i, j) => {
        const d0 = slope(name, i, j - 1), d1 = slope(name, i, j);
        if (d0 === null || d1 === null || d0 * d1 <= 0) return 0;
        const h0 = width(j - 1), h1 = width(j);
        return 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
    };
    if (b.ease) {
        // A step with its own ease goes straight from one key to the next at that pace.
        const e = Reactor3D.keyEase(b.ease, t);
        const line = name => [0, 1, 2].map(i => field(a, name, i) + (field(b, name, i) - field(a, name, i)) * e);
        return { rotate: line("rotate"), move: line("move"), resize: line("resize") };
    }
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    const curve = name => [0, 1, 2].map(i => {
        const v0 = field(a, name, i), v1 = field(b, name, i);
        return h00 * v0 + h10 * span * tangent(name, i, k) + h01 * v1 + h11 * span * tangent(name, i, k + 1);
    });
    return { rotate: curve("rotate"), move: curve("move"), resize: curve("resize") };
};

/*
 * `sampleModelKeys` for the frame loop: the same timeline and the same
 * arithmetic, in the same order, written into the caller's arrays. The
 * public one built a stops array, six closures and a dozen small arrays per
 * keyed rule per model per frame; this one reads the stops in place (the
 * rest stop, the rule's own keys, the closing rest stop) and allocates
 * nothing. The public one stays as it was for the editor's callers, and a
 * test holds the two to the same numbers.
 */
const KEY_REST = [0, 0, 0], KEY_ONE = [1, 1, 1];
const KEY_REST_STOP = { at: 0, rotate: KEY_REST, move: KEY_REST, resize: KEY_ONE };
const KEY_END_STOP = { at: 1, rotate: KEY_REST, move: KEY_REST, resize: KEY_ONE };
const keyTimeline = { keys: null, lead: 0, count: 0, n: 0, loops: false };
function keyStop(line, j) {
    if (line.lead && j === 0) return KEY_REST_STOP;
    const index = j - line.lead;
    return index < line.count ? line.keys[index] : KEY_END_STOP;
}
function keyField(stop, name, i) {
    return (stop[name] || (name === "resize" ? KEY_ONE : KEY_REST))[i];
}
function keyMeets(line, name, i) {
    const gap = keyField(keyStop(line, line.n - 1), name, i) - keyField(keyStop(line, 0), name, i);
    return name === "rotate" ? Math.abs(gap - 360 * Math.round(gap / 360)) < 1e-6 : gap === 0;
}
function keySlope(line, name, i, j) {
    const n = line.n;
    if (j < 0 || j >= n - 1) {
        if (!line.loops || n < 3 || !keyMeets(line, name, i)) return null;
        j = j < 0 ? n - 2 : 0;
    }
    const h = keyStop(line, j + 1).at - keyStop(line, j).at;
    return h > 0 ? (keyField(keyStop(line, j + 1), name, i) - keyField(keyStop(line, j), name, i)) / h : 0;
}
function keyWidth(line, j) {
    const n = line.n;
    if (j < 0) j = n - 2; else if (j >= n - 1) j = 0;
    return keyStop(line, j + 1).at - keyStop(line, j).at;
}
function keyTangent(line, name, i, j) {
    const d0 = keySlope(line, name, i, j - 1), d1 = keySlope(line, name, i, j);
    if (d0 === null || d1 === null || d0 * d1 <= 0) return 0;
    const h0 = keyWidth(line, j - 1), h1 = keyWidth(line, j);
    return 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
}
Reactor3D._sampleModelKeysInto = function(rule, p, out) {
    const line = keyTimeline;
    const keys = rule.keys;
    line.keys = keys;
    line.count = keys.length;
    // A key at 0 replaces the rest stop rather than sitting on top of it.
    line.lead = keys.length > 0 && keys[0].at <= 0 ? 0 : 1;
    const last = keyStop(line, line.lead + line.count - 1);
    const n = line.lead + line.count + (last.at < 1 ? 1 : 0);
    line.n = n;
    let k = 0;
    while (k + 2 < n && p > keyStop(line, k + 1).at) k++;
    const a = keyStop(line, k), b = keyStop(line, Math.min(n - 1, k + 1));
    const span = b.at - a.at;
    if (!(span > 0)) {
        const move = b.move || KEY_REST, resize = b.resize || KEY_ONE;
        for (let i = 0; i < 3; i++) {
            out.rotate[i] = b.rotate[i];
            out.move[i] = move[i];
            out.resize[i] = resize[i];
        }
        line.keys = null;
        return;
    }
    const t = Math.min(1, Math.max(0, (p - a.at) / span));
    line.loops = !!rule.trigger && rule.trigger !== "action";
    if (b.ease) {
        // A step with its own ease goes straight from one key to the next at that pace.
        const e = Reactor3D.keyEase(b.ease, t);
        for (let c = 0; c < 3; c++) {
            const name = c === 0 ? "rotate" : c === 1 ? "move" : "resize";
            const target = out[name];
            for (let i = 0; i < 3; i++) {
                const v0 = keyField(a, name, i), v1 = keyField(b, name, i);
                target[i] = v0 + (v1 - v0) * e;
            }
        }
        line.keys = null;
        return;
    }
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    for (let c = 0; c < 3; c++) {
        const name = c === 0 ? "rotate" : c === 1 ? "move" : "resize";
        const target = out[name];
        for (let i = 0; i < 3; i++) {
            const v0 = keyField(a, name, i), v1 = keyField(b, name, i);
            target[i] = h00 * v0 + h10 * span * keyTangent(line, name, i, k) + h01 * v1 + h11 * span * keyTangent(line, name, i, k + 1);
        }
    }
    line.keys = null;
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

/*
 * The animation pool's hand-outs, as plain functions over counters kept on
 * the pool itself. As closures they were made afresh on every call: seven
 * allocations per animated model per frame, for the same four lines.
 */
function animNextVec(pool) {
    const v = pool.vec[pool.vecAt] || (pool.vec[pool.vecAt] = new THREE.Vector3());
    pool.vecAt++;
    return v;
}
function animNextQuat(pool) {
    const q = pool.quat[pool.quatAt] || (pool.quat[pool.quatAt] = new THREE.Quaternion());
    pool.quatAt++;
    return q;
}
function animNextMat(pool) {
    const m = pool.mat[pool.matAt] || (pool.mat[pool.matAt] = new THREE.Matrix4());
    pool.matAt++;
    return m;
}
function animPivotTurn(pool, pivot, quat) {
    const p = animNextVec(pool).fromArray(pivot);
    const m = animNextMat(pool).makeRotationFromQuaternion(quat);
    const turned = animNextVec(pool).copy(p).applyQuaternion(quat);
    m.setPosition(p.sub(turned));
    return m;
}
function animPivotGrow(pool, pivot, size) {
    const p = animNextVec(pool).fromArray(pivot);
    const m = animNextMat(pool).makeScale(size.x, size.y, size.z);
    const grown = animNextVec(pool).copy(p).multiply(size);
    m.setPosition(p.sub(grown));
    return m;
}

/*
 * A node's quaternion, written only when it changes. three re-derives a
 * node's Euler angles from its quaternion on every write — a rotation
 * matrix and three inverse trig calls — and the pass wrote every part of
 * every animated model every frame, most of them the value already there.
 * Skipped only when both the quaternion and the Euler angles are exactly
 * what this pass left behind the last time it wrote: the angles are then
 * already the ones the write would derive, so nothing observable differs.
 * `Reactor3D.AnimationWrites.enabled = false` writes every time.
 */
Reactor3D.AnimationWrites = { enabled: true };
function animSetQuaternion(entry, q) {
    const node = entry.mesh.quaternion;
    const memo = entry.quatMemo;
    if (memo && Reactor3D.AnimationWrites.enabled
        && q._x === node._x && q._y === node._y && q._z === node._z && q._w === node._w) {
        const euler = entry.mesh.rotation;
        if (memo[0] === node._x && memo[1] === node._y && memo[2] === node._z && memo[3] === node._w
            && memo[4] === euler._x && memo[5] === euler._y && memo[6] === euler._z && memo[7] === euler._order) return;
    }
    node.copy(q);
    const euler = entry.mesh.rotation;
    const note = memo || (entry.quatMemo = [0, 0, 0, 0, 0, 0, 0, ""]);
    note[0] = node._x; note[1] = node._y; note[2] = node._z; note[3] = node._w;
    note[4] = euler._x; note[5] = euler._y; note[6] = euler._z; note[7] = euler._order;
}

/**
 * Which rules reach which of a binding's meshes, worked out once instead of
 * every frame. A rule names a part; a mesh answers to it through the first
 * name in its ancestry chain that starts with it (the part's own name first,
 * its parents after). That was asked afresh each frame for every mesh, every
 * active rule and every name in the chain — on a rigged character or a
 * vehicle cut into dozens of parts it was most of the animation pass — yet
 * it only changes when a rule's part or a part's name does.
 *
 * Per mesh, the table lists the rules that reach it already in the order
 * their contributions compose (deepest match first, then rule order), so a
 * frame only has to skip the rules that are not playing. It is checked
 * against everything it was built from on every use — the rules array and
 * each rule in it, the part each names, the mesh list, each mesh's part
 * chain and every name in it — so carving, rigging, a rename or a new rule
 * list rebuilds it before it can answer. `enabled = false` matches every
 * frame as before.
 */
Reactor3D.AnimationMatches = {
    enabled: true,
    table(binding, rules) {
        const table = binding._matchTable;
        if (table && this.current(table, binding, rules)) return table;
        return (binding._matchTable = this.build(binding, rules));
    },
    current(table, binding, rules) {
        const meshes = binding.meshes;
        if (table.rules !== rules || table.ruleCount !== rules.length
            || table.meshes !== meshes || table.meshCount !== meshes.length) return false;
        for (let i = 0; i < rules.length; i++) {
            if (table.ruleList[i] !== rules[i] || table.ruleParts[i] !== rules[i].part) return false;
        }
        let at = 0;
        for (let e = 0; e < meshes.length; e++) {
            const entry = meshes[e];
            const parts = entry.parts;
            if (table.entries[e] !== entry || table.chains[e] !== parts || table.chainCounts[e] !== parts.length) return false;
            for (let d = 0; d < parts.length; d++, at++) {
                if (table.parts[at] !== parts[d] || table.names[at] !== parts[d].name) return false;
            }
        }
        return true;
    },
    build(binding, rules) {
        const meshes = binding.meshes;
        const table = {
            rules, ruleCount: rules.length, ruleList: rules.slice(), ruleParts: rules.map(rule => rule.part),
            meshes, meshCount: meshes.length, entries: meshes.slice(),
            chains: [], chainCounts: [], parts: [], names: [], reach: []
        };
        for (const rule of rules) {
            if (rule.part && rule._partLowerOf !== rule.part) {
                rule._partLower = String(rule.part).toLowerCase();
                rule._partLowerOf = rule.part;
            }
        }
        for (const entry of meshes) {
            table.chains.push(entry.parts);
            table.chainCounts.push(entry.parts.length);
            for (const part of entry.parts) {
                table.parts.push(part);
                table.names.push(part.name);
            }
            const reach = [];
            for (let i = 0; i < rules.length; i++) {
                const rule = rules[i];
                if (!rule.part) continue;
                for (let d = 0; d < entry.parts.length; d++) {
                    const part = entry.parts[d];
                    if (part.nameLower === undefined || part.nameLowerOf !== part.name) {
                        part.nameLower = String(part.name).toLowerCase();
                        part.nameLowerOf = part.name;
                    }
                    // (An `exact` rule answers to the whole name only: a wheel rule on Wheel1 leaves Wheel10 alone.)
                    if (rule.exact ? part.nameLower === rule._partLower : part.nameLower.indexOf(rule._partLower) === 0) {
                        reach.push({ rule: i, depth: d });
                        break;
                    }
                }
            }
            reach.sort((a, b) => b.depth - a.depth || a.rule - b.rule);
            table.reach.push(reach);
        }
        return table;
    }
};

/**
 * A glow rule's frame: the share (min..max) of each reached material's own
 * emissive intensity, or its emissive map's offset for a scroll. The
 * materials are found once per binding and made the instance's own (a
 * shallow clone: same program, same texture source), so one model's lights
 * never drive another's; after that a frame writes two numbers per material.
 * An inactive trigger puts the authored values back.
 */
Reactor3D.modelGlowValue = function(rule, frame) {
    const period = Math.max(2, rule.period), t = frame / period;
    if (rule.mode === "flicker") {
        // Steps of a tenth of the period, eased into each other: a held value with quick changes, the same every run.
        const step = Math.floor(t * 10), f = t * 10 - step;
        const at = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
        const a = at(step), b = at(step + 1), k = f < 0.8 ? a : a + (b - a) * (f - 0.8) / 0.2;
        return rule.min + (rule.max - rule.min) * k;
    }
    if (rule.mode === "scroll") return rule.max;
    return rule.min + (rule.max - rule.min) * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
};
Reactor3D.applyModelGlow = function(binding, rule, index, state) {
    const all = binding._glow || (binding._glow = []);
    let glow = all[index];
    if (!glow || glow.rule !== rule) {
        const part = rule.part.toLowerCase(), named = rule.material.toLowerCase(), list = [], seen = new Map();
        const answers = (object) => {
            for (let node = object; node && node !== binding.root.parent; node = node.parent) {
                const names = [node.name].concat((node.userData && node.userData.parts || []).map(p => p && p.name));
                if (names.some(n => n && String(n).toLowerCase().indexOf(part) === 0)) return true;
            }
            return false;
        };
        binding.root.traverse(object => {
            if (!object.isMesh || !object.material) return;
            const many = Array.isArray(object.material), mats = many ? object.material.slice() : [object.material];
            let changed = false;
            for (let k = 0; k < mats.length; k++) {
                const m = mats[k];
                if (!m || !m.emissive) continue;
                if (named ? String(m.name || "").toLowerCase().indexOf(named) !== 0 : (part && !answers(object))) continue;
                let own = seen.get(m);
                if (!own) {
                    own = m.clone();
                    if (rule.mode === "scroll" && own.emissiveMap) {
                        own.emissiveMap = own.emissiveMap.clone();
                        own.emissiveMap.wrapS = own.emissiveMap.wrapT = THREE.RepeatWrapping;
                        own.emissiveMap.needsUpdate = true;
                    }
                    seen.set(m, own);
                    list.push({ material: own, intensity: own.emissiveIntensity, offset: own.emissiveMap ? own.emissiveMap.offset.clone() : null });
                }
                mats[k] = own; changed = true;
            }
            if (changed) object.material = many ? mats : mats[0];
        });
        glow = all[index] = { rule, list, lit: false };
    }
    let active = rule.trigger === "always"
        || (rule.trigger === "idle" && Reactor3D.isIdleState(state))
        || Reactor3D.moveTriggerActive(rule.trigger, state) === true;
    let t = state.frame || 0;
    if (rule.trigger === "action") {
        active = !!(state.action && state.action.name === rule.name && t - state.action.frame < this.modelRuleDuration(rule));
        if (active) t -= state.action.frame;
    }
    if (!active) {
        if (glow.lit) for (const g of glow.list) { g.material.emissiveIntensity = g.intensity; if (g.offset) g.material.emissiveMap.offset.copy(g.offset); }
        glow.lit = false;
        return;
    }
    glow.lit = true;
    const k = this.modelGlowValue(rule, t), seconds = t / 60;
    for (const g of glow.list) {
        g.material.emissiveIntensity = g.intensity * k;
        if (rule.mode === "scroll" && g.offset) {
            const map = g.material.emissiveMap;
            map.offset.set(((g.offset.x + rule.uv[0] * seconds) % 1 + 1) % 1, ((g.offset.y + rule.uv[1] * seconds) % 1 + 1) % 1);
        }
    }
};

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
        vec: [], quat: [], mat: [], match: [], action: [], actions: [], byRule: [],
        vecAt: 0, quatAt: 0, matAt: 0,
        sampled: { rotate: [0, 0, 0], move: [0, 0, 0], resize: [1, 1, 1] },
        euler: new THREE.Euler(), scratch: new THREE.Matrix4(),
        outPos: new THREE.Vector3(), outQuat: new THREE.Quaternion(), outScale: new THREE.Vector3()
    });
    pool.vecAt = 0;
    pool.quatAt = 0;
    pool.matAt = 0;
    let matchAt = 0, actionAt = 0;
    const euler = pool.euler;
    // Counted rather than truncated: setting an array's length every call
    // was a measurable share of this pass.
    const partActions = pool.actions;
    let actionCount = 0;
    // The action each rule contributes this frame, by rule index, for the
    // match table; filled in as the actions are made.
    const matches = this.AnimationMatches.enabled ? this.AnimationMatches.table(binding, rules) : null;
    const byRule = pool.byRule;
    if (matches) for (let i = 0; i < rules.length; i++) byRule[i] = null;
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (rule.type === "clip") continue;
        if (rule.type === "glow") { this.applyModelGlow(binding, rule, i, state); continue; }
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
            let weight = 1;
            const duration = Math.max(1, rule.period * 2 * rule.cycles);
            if (rule.trigger === "action") {
                binding.angles[i] = 0;
                if (state.action && state.action.name === rule.name) {
                    const t = state.frame - state.action.frame;
                    // A zero-frame pose is there the frame its action starts.
                    if (rule.instant) progress = 1;
                    else if (t < duration) progress = t / duration;
                    else if (rule.stay) progress = 1;
                    else if (t < duration + Reactor3D.POSE_SETTLE_FRAMES && Reactor3D.poseSettles(rule)) {
                        // Ended on its last pose: from there back to rest, eased.
                        progress = 1;
                        weight = this.poseEase(1 - (t - duration) / Reactor3D.POSE_SETTLE_FRAMES);
                    }
                }
            } else {
                const active = rule.trigger === "always"
                    || (rule.trigger === "idle" && Reactor3D.isIdleState(state))
                    || Reactor3D.moveTriggerActive(rule.trigger, state) === true;
                // A state's motion fades in as the state begins and out as it
                // ends (a jump, a dive, a ladder), rather than snapping on.
                const fade = Math.max(0, Math.min(1, (binding.angles[i] || 0) + (active ? 1 : -1) / Reactor3D.MOTION_FADE_FRAMES));
                binding.angles[i] = fade;
                // A jump's motion plays once from the takeoff and holds its last frame
                // through a long fall, as a jump clip does, unless it repeats.
                const once = rule.trigger === "jumping" && !rule.repeat;
                if (once) {
                    const live = binding.stateLive || (binding.stateLive = []);
                    const starts = binding.stateStarts || (binding.stateStarts = []);
                    if (active && !live[i]) starts[i] = state.frame;
                    live[i] = active;
                }
                // A climb moves with the climbing, not the clock: it stands still on a
                // held ladder and runs backward on the way down.
                const byHeight = rule.trigger === "climbing" && Number.isFinite(state.climbHeight);
                if (fade > 0) {
                    progress = once
                        ? Math.min(1, Math.max(0, state.frame - (binding.stateStarts[i] ?? state.frame)) / duration)
                        : byHeight
                            ? ((state.climbHeight / Reactor3D.CLIMB_CYCLE) % 1 + 1) % 1
                            : (state.frame % duration) / duration;
                    weight = this.poseEase(fade);
                }
            }
            if (progress === null) continue;
            const sampled = pool.sampled;
            this._sampleModelKeysInto(rule, progress, sampled);
            if (weight < 1) {
                for (let k = 0; k < 3; k++) {
                    sampled.rotate[k] *= weight;
                    sampled.move[k] *= weight;
                    sampled.resize[k] = 1 + (sampled.resize[k] - 1) * weight;
                }
            }
            if (rule.fromRest) restWeight = rule.instant ? 1 : Math.max(0, Math.min(1, progress));
            const toRad = Math.PI / 180;
            quat = animNextQuat(pool).setFromEuler(euler.set(
                sampled.rotate[0] * toRad, sampled.rotate[1] * toRad, sampled.rotate[2] * toRad, "XYZ"));
            if (sampled.move[0] || sampled.move[1] || sampled.move[2]) {
                slide = animNextVec(pool).set(sampled.move[0], sampled.move[1], sampled.move[2])
                    .multiplyScalar((state.moveScale || 1) / (state.scale || 1));
            }
            if (sampled.resize[0] !== 1 || sampled.resize[1] !== 1 || sampled.resize[2] !== 1) {
                grow = animNextVec(pool).set(sampled.resize[0], sampled.resize[1], sampled.resize[2]);
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
                    || (rule.trigger === "idle" && Reactor3D.isIdleState(state))
                    || gate === true;
                const step = 1 / Math.max(1, rule.period);
                blend = Math.min(1, Math.max(0,
                    (binding.angles[i] || 0) + (active ? step : -step)));
            }
            binding.angles[i] = blend;
            if (!blend) continue;
            const eased = this.poseEase(blend);
            const toRad = Math.PI / 180;
            quat = animNextQuat(pool).setFromEuler(euler.set(
                rule.rotate[0] * eased * toRad,
                rule.rotate[1] * eased * toRad,
                rule.rotate[2] * eased * toRad, "XYZ"));
            if (rule.move[0] || rule.move[1] || rule.move[2]) {
                slide = animNextVec(pool).set(rule.move[0], rule.move[1], rule.move[2])
                    .multiplyScalar(eased * (state.moveScale || 1) / (state.scale || 1));
            }
            if (rule.resize[0] !== 1 || rule.resize[1] !== 1 || rule.resize[2] !== 1) {
                grow = animNextVec(pool).set(
                    1 + (rule.resize[0] - 1) * eased,
                    1 + (rule.resize[1] - 1) * eased,
                    1 + (rule.resize[2] - 1) * eased);
            }
        } else {
            let t = state.frame;
            const gate = Reactor3D.moveTriggerActive(rule.trigger, state);
            if (rule.trigger === "idle" && !Reactor3D.isIdleState(state)) continue;
            // A movement-driven spin holds its angle when travel stops — a
            // wheel does not snap back to rest — it simply stops gaining.
            if (gate === false && rule.type !== "spin") continue;
            if (rule.trigger === "action") {
                if (!state.action || state.action.name !== rule.name) continue;
                t = state.frame - state.action.frame;
                if (t >= this.modelRuleDuration(rule)) continue;
            }
            if (rule.type === "spin") {
                // The road rolled under it in this call: a ridden vehicle's state says how far, signed along
                // its heading (`travel`, so a wheel rolls back in reverse); anything else rolls by the
                // distance it covered. A wheel that knows its radius (model units) turns exactly with the
                // road at any bound size; one with `perTile` turns that many degrees a tile.
                const travel = Number.isFinite(state.travel) ? state.travel : state.distance;
                const gain = rule.radius
                    ? travel / (rule.radius * (state.scale || 1)) * (180 / Math.PI)
                    : rule.perTile
                        ? travel * rule.perTile
                        : (gate === false ? 0 : rule.speed / 60);
                // The angle stays one a part can be drawn at. A gain that is no such number adds nothing:
                // a caller that says neither how far it rolled nor how far it went (a preview posing the
                // model at one frame), or a radius, a scale or a travel at the edge of what a number
                // holds. The wheel keeps the angle it had and rolls on from it when the road is known again.
                const had = binding.angles[i];
                const kept = had > -1e300 && had < 1e300 ? had : 0;
                const rolled = kept + gain;
                binding.angles[i] = rolled > -1e300 && rolled < 1e300 ? rolled : kept;
                quat = animNextQuat(pool).setFromAxisAngle(animNextVec(pool).fromArray(rule.axisVector || this.AXIS_VECTORS[rule.axis]), binding.angles[i] * Math.PI / 180);
            } else if (rule.type === "drive") {
                // A part that follows its driver (the bars by the steering): `degrees` at an input of 1,
                // about the rule's own line. With no inputs on the state every input is 0 and the part
                // rests. It joins the part actions below like any rule, so a wheel nested in it spins
                // about the turned axle. Nothing is kept from frame to frame: the turn is the input's.
                const inputs = state.inputs;
                const input = inputs ? inputs[rule.input] : 0;
                const angle = Number.isFinite(input) ? rule.degrees * input : 0;
                // (No turn, or one past any a part can be drawn at: the part rests.)
                if (!angle || !(angle > -1e300 && angle < 1e300)) continue;
                quat = animNextQuat(pool).setFromAxisAngle(animNextVec(pool).fromArray(rule.axisVector || this.AXIS_VECTORS[rule.axis]), angle * Math.PI / 180);
            } else if (rule.type === "swing") {
                const angle = rule.degrees * Math.sin(2 * Math.PI * (t / rule.period + rule.phase));
                quat = animNextQuat(pool).setFromAxisAngle(animNextVec(pool).fromArray(this.AXIS_VECTORS[rule.axis]), angle * Math.PI / 180);
            } else {
                const offset = rule.amount * (state.moveScale || 1) * Math.sin(2 * Math.PI * (t / rule.period + rule.phase)) / (state.scale || 1);
                slide = animNextVec(pool).fromArray(this.AXIS_VECTORS[rule.axis]).multiplyScalar(offset);
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
            action.order = actionCount;
            action.partLower = rule._partLower;
            action.exact = rule.exact === true;
            action.quat = quat;
            action.slide = slide;
            action.grow = grow;
            action.rest = restWeight;
            partActions[actionCount++] = action;
            if (matches) byRule[i] = action;
        }
    }
    // Per mesh, contributions compose by ANCESTRY, not authoring order: a
    // part's chain lists its own name first and its parents after, so the
    // turret's turn applies before the cannon's recoil and the recoil
    // slides along the turned barrel — whichever rule was written or
    // edited first. Same-depth contributions keep their rule order.
    const meshes = binding.meshes;
    for (let e = 0; e < meshes.length; e++) {
        const entry = meshes[e];
        let matched = null;
        if (matches) {
            // The table's order is already the composing order, and a rule
            // makes at most one action, so the hits need no sort.
            const reach = matches.reach[e];
            let hits = 0;
            for (let r = 0; r < reach.length; r++) {
                const action = byRule[reach[r].rule];
                if (!action) continue;
                if (!matched) matched = entry.matched || (entry.matched = []);
                const hit = pool.match[matchAt] || (pool.match[matchAt] = {});
                matchAt++;
                hit.action = action;
                hit.depth = reach[r].depth;
                hit.pivot = entry.parts[reach[r].depth].pivot;
                matched[hits++] = hit;
            }
            if (matched && matched.length !== hits) matched.length = hits;
        }
        if (!matches) for (let a = 0; a < actionCount; a++) {
            const action = partActions[a];
            let depth = -1;
            let pivot = null;
            for (let d = 0; d < entry.parts.length; d++) {
                const part = entry.parts[d];
                if (part.nameLower === undefined || part.nameLowerOf !== part.name) {
                    part.nameLower = String(part.name).toLowerCase();
                    part.nameLowerOf = part.name;
                }
                if (action.exact ? part.nameLower === action.partLower : part.nameLower.indexOf(action.partLower) === 0) {
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
        if (!matches) matched.sort((a, b) => b.depth - a.depth || a.action.order - b.action.order);
        entry.acc = (entry.accMatrix || (entry.accMatrix = new THREE.Matrix4())).identity();
        for (let m = 0; m < matched.length; m++) {
            const action = matched[m].action;
            const pivot = matched[m].pivot;
            const turn = action.quat;
            const slide = action.slide;
            // The slide comes first: an offset is in the model's frame, not
            // in the frame the same pose's turn leaves behind.
            if (slide) {
                entry.acc.multiply(animNextMat(pool).makeTranslation(slide.x, slide.y, slide.z));
            }
            if (turn) entry.acc.multiply(animPivotTurn(pool, pivot, turn));
            if (action.grow) entry.acc.multiply(animPivotGrow(pool, pivot, action.grow));
        }
    }
    if (binding.mixer) {
        // Clip-driven bones go back to the clip's last pose before the mixer
        // runs, so a pose composed onto them last frame never compounds.
        for (const entry of binding.meshes) {
            if (!entry.clipBase) continue;
            entry.mesh.position.copy(entry.clipBase.position);
            animSetQuaternion(entry, entry.clipBase.quaternion);
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
            // Seated on a vehicle the riding clip outranks everything, and loops: the body's own states
            // (a gait, a jump, a swim) are the vehicle's doing and none of their clips plays on a rider.
            const riding = !!state.riding;
            const ride = riding ? pick("riding") : null;
            if (ride) {
                desired = ride.clip;
                key = ride.clip;
                rate = ride.rate || 1;
            }
            // On a ladder the climb clip, and in the water the swim clip, outrank every gait, and loop.
            // Floating still takes a tread clip, or the swim clip when there is none.
            const swim = riding ? null : (state.climbing ? pick("climbing") : null)
                || (state.swimming ? (moving ? pick("swimming") : pick("treading") || pick("swimming")) : null);
            if (swim) {
                desired = swim.clip;
                key = swim.clip;
                rate = swim.rate || 1;
            }
            // In the air the jump clip outranks every gait. It plays once and
            // holds its last frame through a long fall unless it repeats;
            // its own key restarts it on every new jump.
            const jump = !riding && !swim && state.airborne ? pick("jumping") : null;
            if (jump) {
                desired = jump.clip;
                key = jump.clip + ":air";
                once = !jump.repeat;
                rate = jump.rate || 1;
            }
            // A state with a motion of its own but no clip (a rig's default Jump, Swim or
            // Climb) plays it from the rest pose: a gait clip under it would fight it.
            const procedural = trigger => rules.some(r => r.trigger === trigger && r.type !== "clip");
            // (A rider with no riding clip plays its riding motion, the rig's own Ride, from the rest pose.)
            const stateMotion = riding ? !ride && procedural("riding") : !jump && !swim && ((state.climbing && procedural("climbing"))
                || (state.swimming && procedural(moving ? "swimming" : "treading")) || (state.airborne && procedural("jumping")));
            const rule = ride || jump || swim || stateMotion ? null : (riding ? null : moving
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
                const clip = Reactor3D.resolveLibraryMotion(binding.clips.find(c => c.name === desired));
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
            animSetQuaternion(entry, baseQuaternion);
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
        animSetQuaternion(entry, outQuat);
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
            this.applyModelTransform(object, this.readModelTransform(sidecar, spec));
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
            state.template = template;
            state.scene = scene;
            state.camera = camera;
            state.scale = scale;
            state.binding = this.prepareModelInstance(object, object.__reactorClips);
            state.rules = sidecar ? this.readModelAnimationRules(sidecar, object.__reactorClips) : [];
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
        this.applyModelTransform(object, this.readModelTransform(sidecar, spec));
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
            this.applyModelTransform(object, this.readModelTransform(sidecar, spec));
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
            state.template = template;
            state.scene = scene;
            state.camera = camera;
            state.scale = scale;
            state.binding = this.prepareModelInstance(object, object.__reactorClips);
            state.rules = sidecar ? this.readModelAnimationRules(sidecar, object.__reactorClips) : [];
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
        this.releaseBattlerState(state, true);
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
 * What a flat map's picture of a model is scaled by while a battle runs on
 * this map, so a fighter one tile big stands no taller than a unit's picture
 * (ReactorFightLook.modelFit): the map's units and the party, who are all
 * the same size as each other with a battle or without. 1 with no battle
 * here, for anyone who is no fighter, and for a body bigger than its tile
 * (Reactor3D.eventBody), which is drawn as big as it is. Who is a fighter is
 * read as a battle starts or ends and again on the look's beat; the size is
 * eased, so nobody jumps.
 */
Reactor3D.flatUnitFit = function(sprite, character) {
    const rule = root.ReactorFightLook, F = root.ReactorFight;
    if (!rule || !F || !F.eventLook || !character) return 1;
    const frame = typeof Graphics !== "undefined" && Graphics ? Graphics.frameCount : 0;
    const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
    const battle = fight && fight._active ? fight._serial || 1 : 0;
    const kept = sprite._reactorUnitFit || (sprite._reactorUnitFit = { at: -1, battle: 0, want: 1, now: 0 });
    if (kept.at < 0 || kept.battle !== battle || !(frame > 0) || frame < kept.at || frame - kept.at >= (F.LOOK_BEAT || 12)) {
        kept.at = frame; kept.battle = battle;
        let fighter = false;
        if (battle && fight.isHere && fight.isHere()) {
            fighter = typeof character.event === "function" ? !!F.eventLook(character) : this.partyCharacter(character);
        }
        kept.want = fighter && this.eventBody(character).count === 1 ? rule.modelFit(this.characterHeightTiles(character)) : 1;
    }
    if (!kept.now) kept.now = kept.want;
    else if (kept.now !== kept.want) kept.now = Math.abs(kept.want - kept.now) < 0.01 ? kept.want : kept.now + (kept.want - kept.now) * 0.2;
    return kept.now;
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
    // The size a unit was drawn at for a battle (below) is taken off again first, whatever the sprite shows now.
    if (sprite && sprite._reactorFlatFit) {
        sprite.scale.x /= sprite._reactorFlatFit; sprite.scale.y /= sprite._reactorFlatFit;
        sprite._reactorFlatFit = 0;
    }
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
    // A unit of a Tactical battle on this flat map is drawn to fit the cells it stands on (a figure three tiles
    // tall would hide whoever stands behind it): the battle says how (flatFit). In a battle of any mode here a
    // fighter one tile big stands no taller than a unit's picture (flatUnitFit). Put on before anything below can
    // leave: a sprite whose model is being changed for another (the party back in its order as a battle ends)
    // shows the old picture at the size it had until the new one is drawn.
    const fight = typeof ReactorFight !== "undefined" && ReactorFight && ReactorFight.flatFit ? ReactorFight : null;
    const fit = Math.min(fight ? fight.flatFit(character) : 1, this.flatUnitFit(sprite, character));
    if (fit !== 1 && fit > 0) { sprite.scale.x *= fit; sprite.scale.y *= fit; sprite._reactorFlatFit = fit; }
    this.ensureLoaded();
    if (!this.isLoaded()) return;
    // Another variant of the same model is another picture: the sprite is drawn again.
    const key = spec.variant ? this.modelCacheKey(spec.name, spec.ext, spec.file) + "|" + spec.variant : this.modelCacheKey(spec.name, spec.ext, spec.file);
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
            this.applyModelTransform(object, this.readModelTransform(sidecar, spec));
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
            state.template = template;
            state.scene = scene;
            state.camera = camera;
            state.scale = 1 / span;
            state.binding = this.prepareModelInstance(object, object.__reactorClips);
            state.rules = sidecar ? this.readModelAnimationRules(sidecar, object.__reactorClips) : [];
            state.effects = sidecar ? this.readModelEffects(sidecar, spec) : [];
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
    // A unit of a Tactical battle on this flat map is lit to read on a dark floor: the battle says how (flatLight).
    const lit = fight && fight.flatLight ? fight.flatLight(character) : 0;
    if ((state.fightLit || 0) !== lit) { state.fightLit = lit; state.dirty = true; }
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
            airborne: Reactor3D.isAirborne(character),
            swimming: Reactor3D.isSwimming(character),
            climbing: Reactor3D.isClimbing(character),
            climbHeight: Reactor3D.isClimbing(character) ? character._reactorAlt : undefined,
            distance,
            scale: state.scale,
            playbackRate: state.playbackRate,
            action: state.action || null
        });
        state.dirty = true;
    }
    // A held thing is part of the picture: the same holder the 3D scene uses, on the sprite's own model.
    if (this.MapHeld.count && this.MapHeld.update(state, character, null, !!sprite._rrCulled)) state.dirty = true;
    for (const name of this.takeModelEffects(character)) {
        const effect = this.modelEffectByName(state.effects, name);
        if (effect && effect.trigger === "action") this.fireNamedEffect(effect, character, state);
    }
    this.updateTriggeredEffects(state, character, {
        moving: !!character.isMoving?.(), dashing: !!character.isDashing?.(), airborne: Reactor3D.isAirborne(character), swimming: Reactor3D.isSwimming(character)
    });
    this.updateAnchoredAnimations(state);
    if (this.updateModelFlash(state)) state.dirty = true;
    if (!state.dirty || sprite._rrCulled) return;
    if (typeof SceneManager !== "undefined" && SceneManager.isFinalUpdateOfFrame
        && !SceneManager.isFinalUpdateOfFrame()) return;
    this.expandModelSpriteFrame(state);
    state.dirty = false;
    // A flat map has no lights of its own: its pictures are drawn evenly lit. The game's model shader reads the
    // lights from shared uniforms, which still hold whatever the last 3D map left there (a night's ambient drew
    // every model nearly black); the unit of a battle is drawn a little brighter (`fightLit`).
    if (this.packLightUniforms) {
        const ambient = this._flatAmbient || (this._flatAmbient = { intensity: 1, colour: 0xffffff });
        ambient.intensity = 1 + (state.fightLit || 0);
        this.packLightUniforms(this._flatLights || (this._flatLights = []), ambient);
    }
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

/**
 * A model's surface (off unless a model has one): how much it reflects the world (0-1), how glossy it is
 * (1 a mirror, lower blurs the reflection), how metal (1 reflects as
 * strongly face on as at an angle, as chrome does; 0 only at glancing
 * angles, as paint or plastic does) and the reflection's tint (white for
 * chrome, yellow for gold).
 * Null when the model has none (its file's own metal, if any, stands).
 */
Reactor3D.readModelSurface = function(json) {
    const raw = json && json.surface && typeof json.surface === "object" ? json.surface : null;
    if (!raw) return null;
    const unit = (value, fallback) => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback; };
    return {
        reflect: unit(raw.reflect, 0),
        gloss: unit(raw.gloss, 0.8),
        metal: unit(raw.metal, 0),
        tint: typeof raw.tint === "string" && /^#[0-9a-f]{6}$/i.test(raw.tint) ? raw.tint : "#ffffff",
        // How much of the texture stays under the reflection: 0 a mirror, 1 a clear lacquer over the paint.
        texture: unit(raw.texture, 0)
    };
};

/** Give one lit material a surface (or take it away), recompiling only when it starts or stops shining. */
Reactor3D.setMaterialShine = function(material, surface) {
    if (!material || typeof THREE === "undefined") return;
    const shines = !!surface && surface.reflect > 0;
    const had = !!this.shineOf(material);
    if (shines) {
        if (!material.userData.rrShine || !material.userData.rrShine.vector || !material.userData.rrShine.vector.isVector4) {
            material.userData.rrShine = { vector: new THREE.Vector4(), tint: new THREE.Color() };
        }
        const shine = material.userData.rrShine;
        shine.vector.set(surface.reflect, 1 - surface.gloss, surface.metal, Number(surface.texture) || 0);
        shine.tint.set(surface.tint || "#ffffff");
        if (this.Reflections) { this.Reflections.wanted = true; this.Reflections.hook(material); }
    } else if (material.userData.rrShine) {
        material.userData.rrShine.vector.x = 0;
    }
    // three keeps one uniform set per material, from its latest compile: back on a
    // program it cached earlier it would draw with the other program's uniforms
    // (no reflection sampler, every draw dropped). Dispose so the next draw compiles
    // afresh; the GL program itself is shared and reused.
    if (had !== shines) { material.dispose(); material.needsUpdate = true; }
};

/** A model's surface on every lit material it has; with none, nothing reflects. */
Reactor3D.applyModelSurface = function(object, surface) {
    if (!object || typeof THREE === "undefined") return;
    object.traverse(node => {
        if (!node.isMesh || !node.material) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if (!material.__reactorLit) continue;
            this.setMaterialShine(material, surface || null);
        }
    });
};

//-----------------------------------------------------------------------------
// Variants: one model worn several ways. `model.json › variants` is a list of
// `{ name, color?, texture?, surface?, media? }`; a use of the model (an event
// page, a placed prop, a Database binding) names one in its spec (`variant`).
// What a variant does not say is the model's own. Geometry, skeleton, clips
// and textures are shared; an instance's materials are its own already (a
// flash tints one tank, not every tank), so a variant costs no extra copies.
//
//   color    an adjustment of the model's own picture, as an image editor's
//            Hue/Saturation does it: { mode: "colorize", color, strength,
//            lightness } gives every texel the color's hue and saturation and
//            keeps its own light and dark; { mode: "adjust", hue, saturation,
//            brightness } shifts the colors it has. Run in the material's
//            shader on the texel (flat material colors are adjusted the same
//            way), so it needs no second copy of the texture.
//   texture  another picture from the model's textures folder in place of
//            its own.
//   surface  the Surface settings for this variant, or false for none.
//   media    { "<video effect's name>": { file } | false }: another picture
//            or movie on that media surface, or the surface left off.

Reactor3D.readVariantColor = function(raw) {
    if (!raw || typeof raw !== "object") return null;
    const number = (value, fallback, low, high) => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : fallback;
    };
    if (raw.mode === "colorize") {
        const strength = number(raw.strength, 1, 0, 1);
        const color = typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : "#ffffff";
        const lightness = number(raw.lightness, 0, -1, 1);
        return strength > 0 ? { mode: "colorize", color, strength, lightness } : null;
    }
    if (raw.mode === "adjust") {
        const hue = number(raw.hue, 0, -180, 180), saturation = number(raw.saturation, 1, 0, 2), brightness = number(raw.brightness, 1, 0, 2);
        return hue || saturation !== 1 || brightness !== 1 ? { mode: "adjust", hue, saturation, brightness } : null;
    }
    return null;
};

/** A model's variants, validated, in file order; a name appears once. */
Reactor3D.readModelVariants = function(json) {
    const list = json && Array.isArray(json.variants) ? json.variants : [];
    const variants = [], seen = new Set();
    for (const raw of list) {
        if (!raw || typeof raw !== "object" || typeof raw.name !== "string" || !raw.name.trim()) continue;
        const name = raw.name.trim();
        if (seen.has(name)) continue;
        seen.add(name);
        const variant = { name };
        const color = this.readVariantColor(raw.color);
        if (color) variant.color = color;
        if (typeof raw.texture === "string" && raw.texture && !/[\\/]|\.\./.test(raw.texture)) variant.texture = raw.texture;
        if (raw.surface === false) variant.surface = false;
        else if (raw.surface && typeof raw.surface === "object") variant.surface = this.readModelSurface({ surface: raw.surface });
        if (raw.media && typeof raw.media === "object" && !Array.isArray(raw.media)) {
            const media = {};
            for (const key of Object.keys(raw.media)) {
                const entry = raw.media[key];
                if (entry === false) media[key] = false;
                else if (entry && typeof entry === "object" && typeof entry.file === "string" && entry.file) media[key] = { file: entry.file };
            }
            if (Object.keys(media).length) variant.media = media;
        }
        variants.push(variant);
    }
    return variants;
};

/**
 * The variant a use names, or null for the model's own look. A name the
 * model no longer has is said once and falls back to the model's own.
 */
Reactor3D.modelVariant = function(json, name) {
    if (!name || !json) return null;
    const cache = this._variantCache || (this._variantCache = new WeakMap());
    let variants = cache.get(json);
    if (!variants || variants.from !== json.variants) {
        variants = { from: json.variants, list: this.readModelVariants(json) };
        cache.set(json, variants);
    }
    const found = variants.list.find(variant => variant.name === name);
    if (found) return found;
    const missed = this._variantMissed || (this._variantMissed = new Set());
    if (!missed.has(name)) {
        missed.add(name);
        console.warn("Reactor3D: no variant named \"" + name + "\" on this model; it shows its own look.");
    }
    return null;
};

/** The look a spec's variant gives a model: its color adjustment, texture and which model's folder the texture is in. */
Reactor3D.modelLook = function(json, spec) {
    const variant = spec && spec.variant ? this.modelVariant(json, spec.variant) : null;
    if (!variant || (!variant.color && !variant.texture)) return null;
    return { color: variant.color || null, texture: variant.texture || "", model: spec.name || "" };
};

/** A color adjusted as the shader adjusts a texel (sRGB in and out, 0-1): for flat material colors and the editor's swatches. */
Reactor3D.adjustLookRgb = function(rgb, color) {
    if (!color) return rgb.slice();
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, s = 0;
    if (d > 1e-6) {
        s = d / (1 - Math.abs(2 * l - 1));
        h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h /= 6;
    }
    const toRgb = (hue, sat, light) => {
        const a = sat * Math.min(light, 1 - light);
        return [0, 8, 4].map(n => {
            const k = (n + hue * 12) % 12;
            return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        });
    };
    if (color.mode === "colorize") {
        const target = this.hexHueSaturation(color.color);
        const light = Math.max(0, Math.min(1, l + color.lightness * (color.lightness > 0 ? 1 - l : l)));
        const tinted = toRgb(target[0], target[1], light);
        return [0, 1, 2].map(i => rgb[i] + (tinted[i] - rgb[i]) * color.strength);
    }
    return toRgb((h + color.hue / 360 + 1) % 1, Math.max(0, Math.min(1, s * color.saturation)), l)
        .map(v => Math.max(0, Math.min(1, v * color.brightness)));
};

/** A "#rrggbb" as [hue 0-1, saturation 0-1] (HSL). */
Reactor3D.hexHueSaturation = function(hex) {
    const value = parseInt(String(hex || "#ffffff").slice(1), 16) || 0;
    const r = (value >> 16 & 255) / 255, g = (value >> 8 & 255) / 255, b = (value & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d < 1e-6) return [0, 0];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, Math.min(1, s)];
};

/** A material's color adjustment, or null: `userData.rrLook` holds the two uniform vectors. */
Reactor3D.lookOf = function(material) {
    const look = material && material.userData && material.userData.rrLook;
    if (!look || !look.a || !(look.a.x > 0)) return null;
    // A cloned material copies its userData through JSON: the vectors arrive as plain objects.
    if (!look.a.isVector4 && typeof THREE !== "undefined") {
        look.a = new THREE.Vector4(look.a.x, look.a.y, look.a.z, look.a.w);
        look.b = new THREE.Vector4(look.b.x, look.b.y, look.b.z, look.b.w);
    }
    return look;
};

Reactor3D.LOOK_GLSL = [
    "uniform vec4 rrLookA;",
    "uniform vec4 rrLookB;",
    "vec3 rrLookHsl(vec3 c) {",
    "\tfloat hi = max(c.r, max(c.g, c.b)), lo = min(c.r, min(c.g, c.b)), l = (hi + lo) * 0.5, d = hi - lo;",
    "\tif (d < 1e-5) return vec3(0.0, 0.0, l);",
    "\tfloat s = d / (1.0 - abs(2.0 * l - 1.0));",
    "\tfloat h = hi == c.r ? mod((c.g - c.b) / d + 6.0, 6.0) : hi == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0;",
    "\treturn vec3(h / 6.0, s, l);",
    "}",
    "vec3 rrLookRgb(vec3 hsl) {",
    "\tvec3 k = mod(vec3(0.0, 8.0, 4.0) + hsl.x * 12.0, 12.0);",
    "\tfloat a = hsl.y * min(hsl.z, 1.0 - hsl.z);",
    "\treturn hsl.z - a * max(vec3(-1.0), min(min(k - 3.0, 9.0 - k), vec3(1.0)));",
    "}",
    // The texel in display values (as an image editor sees it), adjusted, and back to linear.
    "vec3 rrLookAdjust(vec3 linear) {",
    "\tvec3 c = pow(max(linear, vec3(0.0)), vec3(1.0 / 2.2));",
    "\tvec3 hsl = rrLookHsl(c);",
    "\tif (rrLookA.x < 1.5) {",
    "\t\tfloat l = clamp(hsl.z + rrLookA.z * (rrLookA.z > 0.0 ? 1.0 - hsl.z : hsl.z), 0.0, 1.0);",
    "\t\tc = mix(c, rrLookRgb(vec3(rrLookB.x, rrLookB.y, l)), rrLookA.y);",
    "\t} else {",
    "\t\tc = clamp(rrLookRgb(vec3(fract(hsl.x + rrLookB.x + 1.0), clamp(hsl.y * rrLookB.y, 0.0, 1.0), hsl.z)) * rrLookB.z, 0.0, 1.0);",
    "\t}",
    "\treturn pow(c, vec3(2.2));",
    "}"
].join("\n");

/**
 * The color adjustment in a material's program: the texel is adjusted before
 * the material's own color multiplies it, so a flash or the ambient over the
 * material is not recolored. Called last in a lit material's chain
 * (`litMaterial`) and by `lookMaterial` for one that is not lit.
 */
Reactor3D.injectLook = function(material, shader) {
    const look = this.lookOf(material);
    if (!look || !shader) return;
    shader.uniforms.rrLookA = { value: look.a };
    shader.uniforms.rrLookB = { value: look.b };
    if (shader.fragmentShader.indexOf("rrLookAdjust(") >= 0) return;
    shader.fragmentShader = this.LOOK_GLSL + "\n" + shader.fragmentShader.replace(
        "#include <map_fragment>",
        [
            "#ifdef USE_MAP",
            "\tvec4 rrLookBase = diffuseColor;",
            "\tdiffuseColor = vec4(1.0);",
            "#endif",
            "\t#include <map_fragment>",
            "#ifdef USE_MAP",
            "\tdiffuseColor.rgb = rrLookAdjust(diffuseColor.rgb);",
            "\tdiffuseColor *= rrLookBase;",
            "#endif"
        ].join("\n")
    );
};

/** A material that can carry a color adjustment whether or not it is lit: its own program key while it has one. */
Reactor3D.lookMaterial = function(material) {
    if (!material || material.__reactorLook) return material;
    material.__reactorLook = true;
    const earlier = material.onBeforeCompile;
    material.onBeforeCompile = function(shader, renderer) {
        if (typeof earlier === "function") earlier.call(this, shader, renderer);
        // A lit material's own chain places the adjustment (last, so the texel is adjusted before anything mixed over it).
        if (!this.__reactorLit) Reactor3D.injectLook(this, shader);
    };
    const earlierKey = material.customProgramCacheKey;
    material.customProgramCacheKey = function() {
        return (typeof earlierKey === "function" ? earlierKey.call(this) : "") + (!this.__reactorLit && Reactor3D.lookOf(this) ? "|look" : "");
    };
    return material;
};

/** A variant's replacement picture, loaded once per file and per way of reading it, shared by every instance. */
Reactor3D.variantTexture = function(model, file, like) {
    if (typeof THREE === "undefined" || !model || !file) return null;
    const flip = like ? !!like.flipY : false;
    const key = model + "/" + file + (flip ? "|flip" : "");
    const cache = this._variantTextures || (this._variantTextures = new Map());
    let texture = cache.get(key);
    if (texture) return texture;
    // The editor draws a project that is not its own page: it says where the file is.
    const hook = typeof globalThis !== "undefined" && typeof globalThis.RRVariantTextureUrl === "function" ? globalThis.RRVariantTextureUrl : null;
    const url = (hook ? hook(model, file) : null) || this.modelTextureDir(model) + file;
    texture = new THREE.TextureLoader().load(url, () => { if (Reactor3D.onVariantTextureLoaded) Reactor3D.onVariantTextureLoaded(texture); },
        undefined, () => {
            console.warn("Reactor3D: variant texture " + url + " could not be loaded.");
            // A missing file shows the model's own picture, not a black model.
            if (like && like.image && !like.isCompressedTexture) { texture.image = like.image; texture.needsUpdate = true; }
        });
    // Read as the model's own picture is: a GLB's is not flipped, and repeats as the file says.
    texture.flipY = flip;
    if (like) { texture.wrapS = like.wrapS; texture.wrapT = like.wrapT; texture.colorSpace = like.colorSpace; texture.channel = like.channel || 0; }
    else if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, texture);
    return texture;
};

/**
 * Put a look (a variant's color adjustment and texture, or null for the
 * model's own) on an instance's materials. What each material had is kept,
 * so a look can change or go while the instance lives.
 */
Reactor3D.applyModelLook = function(object, look) {
    if (!object || typeof THREE === "undefined") return;
    const own = this._lookOwn || (this._lookOwn = new WeakMap());
    const color = look && look.color ? look.color : null;
    let a = null, b = null;
    if (color) {
        if (color.mode === "colorize") {
            const target = this.hexHueSaturation(color.color);
            a = [1, color.strength, color.lightness, 0]; b = [target[0], target[1], 0, 0];
        } else {
            a = [2, 0, 0, 0]; b = [color.hue / 360, color.saturation, color.brightness, 0];
        }
    }
    const scratch = this._lookScratch || (this._lookScratch = new THREE.Color());
    object.traverse(node => {
        if (!node.isMesh || !node.material || (node.userData && node.userData.__reactorOverlay)) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if (!material || !material.color || material.__reactorSelfLit) continue;
            let mine = own.get(material);
            if (!mine) {
                if (!look) continue;
                const base = material.userData.baseColor && material.userData.baseColor.isColor ? material.userData.baseColor : material.color;
                mine = { color: base.clone(), map: material.map || null };
                own.set(material, mine);
            }
            // The picture: the variant's own in place of the file's.
            const map = look && look.texture ? (this.variantTexture(look.model, look.texture, mine.map) || mine.map) : mine.map;
            if (material.map !== map) {
                const had = !!material.map;
                material.map = map;
                if (had !== !!map) material.needsUpdate = true;
            }
            // The color adjustment: in the program for a textured material, on the color itself for a flat one.
            const had = !!this.lookOf(material);
            const adjusts = !!color && !!material.map;
            if (adjusts) {
                // A lit material's chain already places the adjustment; wrapping it too would change the
                // program key three derives from the outermost onBeforeCompile, and with it the program.
                if (!material.__reactorLit) this.lookMaterial(material);
                let slot = material.userData.rrLook;
                if (!slot || !slot.a || !slot.a.isVector4) slot = material.userData.rrLook = { a: new THREE.Vector4(), b: new THREE.Vector4() };
                slot.a.fromArray(a); slot.b.fromArray(b);
            } else if (material.userData.rrLook && material.userData.rrLook.a) {
                material.userData.rrLook.a.x = 0;
            }
            // three keeps one uniform set per material, from its latest compile (see setMaterialShine).
            if (had !== adjusts) { material.dispose(); material.needsUpdate = true; }
            if (!material.userData.baseColor || !material.userData.baseColor.isColor) material.userData.baseColor = material.color.clone();
            const base = material.userData.baseColor;
            base.copy(mine.color);
            if (color && !material.map) {
                base.getRGB(scratch, THREE.SRGBColorSpace);
                const out = this.adjustLookRgb([scratch.r, scratch.g, scratch.b], color);
                base.setRGB(out[0], out[1], out[2], THREE.SRGBColorSpace);
            }
            material.color.copy(base);
        }
    });
};

/**
 * Give a live character another of its model's variants ("" for the model's
 * own look), from a script or a plugin. Kept on the character, so it is saved
 * with it; the model takes it on its next sync.
 */
Reactor3D.setModelVariant = function(character, name) {
    if (!character) return;
    const next = typeof name === "string" ? name.trim() : "";
    if ((character._reactorModelVariant || "") === next && character._reactorModelVariant !== undefined) return;
    character._reactorModelVariant = next;
};

/**
 * A live instance takes another variant of its model: its surface, color
 * adjustment and texture change on the materials it has, and its media
 * surfaces start again with the variant's pictures.
 */
Reactor3D.refreshModelVariant = function(holder, spec) {
    if (!holder || !spec) return;
    holder.variant = spec.variant || "";
    const json = this._sidecarJson ? this._sidecarJson[spec.name] : null;
    if (!holder.object) return;
    this.applyModelSurface(holder.object, this.variantSurface(json, spec));
    this.applyModelLook(holder.object, this.modelLook(json, spec));
    if (!json || !this.readModelEffects) return;
    if (holder.videos && holder.effects && this.stopVideoEffect) {
        for (const effect of holder.effects) if (holder.videos[effect.name]) this.stopVideoEffect(effect, holder.character, holder);
    }
    holder.effects = this.readModelEffects(json, spec);
    // What the new variant does not wear goes out: its lights, and its animations that play on their own.
    const worn = new Set(holder.effects.map(effect => effect.name));
    if (holder.lights) for (const name of Object.keys(holder.lights)) if (!worn.has(name)) delete holder.lights[name];
    if (holder.anchored && this.stopAnchoredAnimation) {
        for (const entry of holder.anchored) if (entry.triggered && !worn.has(entry.triggered)) this.stopAnchoredAnimation(entry);
    }
};

/** A character's spec with the variant a script gave it, built once per change. */
Reactor3D.variantSpecOf = function(character, spec) {
    if (!spec || !character || character._reactorModelVariant === undefined) return spec;
    const specs = this._variantSpecs || (this._variantSpecs = new WeakMap());
    const held = specs.get(character);
    if (held && held.from === spec && held.variant === character._reactorModelVariant) return held.spec;
    const next = Object.assign({}, spec);
    if (character._reactorModelVariant) next.variant = character._reactorModelVariant;
    else delete next.variant;
    specs.set(character, { from: spec, variant: character._reactorModelVariant, spec: next });
    return next;
};

Reactor3D.readModelTransform = function(json, spec) {
    const raw = json && json.transform && typeof json.transform === "object" ? json.transform : {};
    const vec = value => [0, 1, 2].map(i => {
        const list = Array.isArray(value) ? value : [];
        const number = Number(list[i]);
        return Number.isFinite(number) ? number : 0;
    });
    return {
        offset: vec(raw.offset),
        rotate: vec(raw.rotate),
        scale: this.readScale(raw.scale, 1),
        surface: this.variantSurface(json, spec),
        // The variant's color adjustment and texture; null is the model's own picture.
        look: this.modelLook(json, spec)
    };
};

/** The surface a use shows: its variant's own (or none, when the variant says so), else the model's. */
Reactor3D.variantSurface = function(json, spec) {
    const variant = spec && spec.variant ? this.modelVariant(json, spec.variant) : null;
    if (variant && variant.surface === false) return null;
    if (variant && variant.surface) return variant.surface;
    return this.readModelSurface(json);
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
    // The surface goes with the transform, so every place a model is put down shines alike.
    if (transform && "surface" in transform) this.applyModelSurface(object, transform.surface);
    if (transform && "look" in transform) this.applyModelLook(object, transform.look);
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
            // Nothing timed on this rule: nothing to fire, so nothing to measure.
            if (!rule.effects || !rule.effects.length) continue;
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
    return this._liveTransformInto(state, frame, { offset: [0, 0, 0], rotate: [0, 0, 0], scale: [0, 0, 0], done: false });
};

/** `liveTransformAt` into the caller's record: the placement asks every frame. */
Reactor3D._liveTransformInto = function(state, frame, out) {
    const to = state.to, from = state.from || this.IDENTITY_TRANSFORM();
    const duration = Math.max(0, state.duration || 0);
    let t = duration > 0 ? (frame - state.frame) / duration : 1;
    t = Math.max(0, Math.min(1, t));
    // Ease in and out, so a move settles rather than stops.
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    for (let i = 0; i < 3; i++) {
        out.offset[i] = from.offset[i] + (to.offset[i] - from.offset[i]) * e;
        out.rotate[i] = from.rotate[i] + (to.rotate[i] - from.rotate[i]) * e;
        out.scale[i] = from.scale[i] + (to.scale[i] - from.scale[i]) * e;
    }
    out.done = t >= 1;
    return out;
};

/**
 * The level axis a character goes over about when it falls along `yaw` (the angle on the map of the way it is
 * thrown, 0 down the map: `ReactorFight.fallYaw`), or null when it has none. One shared vector: read it at once.
 */
Reactor3D.fallAxis = function(yaw) {
    if (typeof yaw !== "number" || !Number.isFinite(yaw)) return null;
    const axis = Reactor3D._fallAxis || (Reactor3D._fallAxis = new THREE.Vector3());
    return axis.set(Math.cos(yaw), 0, -Math.sin(yaw));
};

Reactor3D.applyLiveTransform = function(object, character) {
    const state = character && character._reactorTransform;
    if (!state || !object) return;
    const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
    const live = this._liveTransformInto(state, frame, this._liveScratch
        || (this._liveScratch = { offset: [0, 0, 0], rotate: [0, 0, 0], scale: [0, 0, 0], done: false }));
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
        // Where `InstanceCull` finds the placed instances from the scene alone.
        this._scene.userData.rrModelsGroup = this._modelsGroup;
    }
    return this._modelsGroup;
};

/**
 * Culling a placed instance that has a skin, the correct way round (see
 * `presetSkinnedBounds` for why three cannot): a sphere in WORLD space built
 * from where the instance stands and how big it is, never from the skin's
 * rest geometry. Its centre is half the instance's span above its feet and
 * its radius one and a half spans and a tile, which holds a body whatever its
 * bones do in place (a swing, a lunge, a jump). An instance outside a
 * camera's frustum by that sphere is hidden for that one draw: a shadow face
 * that looks away from it (four or five of a light's six, each of which
 * skinned a whole character to draw nothing), or the view when it is behind
 * the camera. A body in a ragdoll leaves its bounds and is never culled.
 * Rigid meshes are left to three, which culls them itself.
 */
Reactor3D.InstanceCull = {
    enabled: true,
    SPAN_REACH: 1.5,
    PAD: 1,
    hide(scene, camera) {
        const group = this.enabled && scene && camera && scene.userData && scene.userData.rrModelsGroup;
        if (!group || !group.visible || !group.children.length || typeof THREE === "undefined") return null;
        const frustum = this._frustum || (this._frustum = new THREE.Frustum());
        const matrix = this._matrix || (this._matrix = new THREE.Matrix4());
        const sphere = this._sphere || (this._sphere = new THREE.Sphere());
        if (camera.parent === null && camera.matrixWorldAutoUpdate !== false) camera.updateMatrixWorld();
        frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        let hidden = null;
        for (const object of group.children) {
            if (!object.visible || object.userData.rrNoCull || !this.skinned(object)) continue;
            const span = Reactor3D.instanceSpan(object);
            sphere.center.setFromMatrixPosition(object.matrixWorld);
            sphere.center.y += span * 0.5;
            sphere.radius = span * this.SPAN_REACH + this.PAD;
            if (frustum.intersectsSphere(sphere)) continue;
            object.visible = false;
            (hidden || (hidden = [])).push(object);
        }
        return hidden;
    },
    show(hidden) {
        if (hidden) for (const object of hidden) object.visible = true;
    },
    /** Whether an instance draws a skinned mesh (asked once per instance). */
    skinned(object) {
        let known = object.userData.rrSkinned;
        if (known === undefined) {
            known = false;
            object.traverse(node => { if (node.isSkinnedMesh) known = true; });
            object.userData.rrSkinned = known;
        }
        return known;
    }
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

const STILL_UNIT_EXTENT = { x: 1, y: 1, z: 1 };
const STILL_NO_STRETCH = [1, 1, 1];

/**
 * A model standing where it stood last frame is not placed again.
 *
 * Placing one — its size, its authored turn and front mark, the eased
 * facing, the ladder hold, its lift, a Transform 3D Model, a Face Ceiling
 * or a Rotate — is a dozen trigonometric calls and three rebuilt rotations,
 * and every prop on a map paid it every frame to arrive where it already
 * was. The placement is a function of its inputs, so when every one of them
 * is what it was the last time the placement ran, and the model still
 * stands exactly as that placement left it, what it would write is already
 * written. Its inputs: the spec, the model's size, the ground under it
 * (read fresh each frame, so a changed map is seen), its cell position,
 * eight-way facing, lift, air, pose pitch and spin, and the Transform 3D
 * Model it carries — only once that has finished easing, and only while
 * its numbers are the ones it was placed with. The facing has to have
 * finished its turn too. The player (the look lean writes its turn), a
 * climber and a ragdoll are always placed.
 *
 * While settled the model's own matrix is composed once and frozen, as the
 * static world's meshes are; its first change thaws it before placing it.
 * Only the root: parts under it are animation's to move. `enabled = false`
 * places every model every frame, as before.
 */
Reactor3D.StillModels = {
    enabled: true,
    settled(holder, character, object, spec, extent, ground, dir8) {
        const placed = holder.placed;
        if (!placed || placed.object !== object || !placed.yawSettled || !placed.eligible) return false;
        if (!this.eligible(character)) return false;
        if (placed.spec !== spec || placed.ground !== ground || placed.dir8 !== dir8
            || placed.realX !== character._realX || placed.realY !== character._realY
            || placed.lift !== (character._reactorLift || 0) || placed.air !== (character._reactorAir || 0)
            || placed.pitch !== (character._reactorPosePitch || 0) || placed.spin !== (character._reactorSpin || 0)
            || placed.fallYaw !== (character._reactorFallYaw ?? null)
            || placed.ex !== extent.x || placed.ey !== extent.y || placed.ez !== extent.z
            || placed.smoothYaw !== holder.smoothYaw) return false;
        if (!this.sameTransform(placed, character._reactorTransform)) return false;
        // Untouched since: anything that moved, turned or scaled it outside
        // the placement is overwritten by a full placement, as it always was.
        const p = object.position, q = object.quaternion, r = object.rotation, s = object.scale;
        return p.x === placed.px && p.y === placed.py && p.z === placed.pz
            && q.x === placed.qx && q.y === placed.qy && q.z === placed.qz && q.w === placed.qw
            && r.x === placed.rx && r.y === placed.ry && r.z === placed.rz && r.order === placed.order
            && s.x === placed.sx && s.y === placed.sy && s.z === placed.sz;
    },
    eligible(character) {
        return !character._reactorRagdoll && !character._reactorOnLadder
            && !(typeof $gamePlayer !== "undefined" && character === $gamePlayer);
    },
    note(holder, character, object, spec, extent, ground, dir8, lodSpan, targetYaw) {
        const placed = holder.placed || (holder.placed = { numbers: [] });
        placed.object = object;
        // Placed while climbing or limp, or as the player, it is placed again.
        placed.eligible = this.eligible(character);
        placed.spec = spec;
        placed.ground = ground;
        placed.dir8 = dir8;
        placed.realX = character._realX;
        placed.realY = character._realY;
        placed.lift = character._reactorLift || 0;
        placed.air = character._reactorAir || 0;
        placed.pitch = character._reactorPosePitch || 0;
        placed.spin = character._reactorSpin || 0;
        placed.fallYaw = character._reactorFallYaw ?? null;
        placed.ex = extent.x;
        placed.ey = extent.y;
        placed.ez = extent.z;
        placed.smoothYaw = holder.smoothYaw;
        placed.yawSettled = holder.smoothYaw === targetYaw;
        placed.lodSpan = lodSpan;
        const state = character._reactorTransform || null;
        placed.transform = state;
        placed.transformDone = !!state && this.transformDone(state);
        if (state) this.transformNumbers(state, placed.numbers);
        const p = object.position, q = object.quaternion, r = object.rotation, s = object.scale;
        placed.px = p.x; placed.py = p.y; placed.pz = p.z;
        placed.qx = q.x; placed.qy = q.y; placed.qz = q.z; placed.qw = q.w;
        placed.rx = r.x; placed.ry = r.y; placed.rz = r.z; placed.order = r.order;
        placed.sx = s.x; placed.sy = s.y; placed.sz = s.z;
    },
    /** Whether a Transform 3D Model has eased all the way, by `liveTransformAt`'s own clock. */
    transformDone(state) {
        const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
        const duration = Math.max(0, state.duration || 0);
        let t = duration > 0 ? (frame - state.frame) / duration : 1;
        t = Math.max(0, Math.min(1, t));
        return t >= 1;
    },
    /** Every number `liveTransformAt` reads, flat. */
    transformNumbers(state, out) {
        const from = state.from || Reactor3D.IDENTITY_TRANSFORM(), to = state.to;
        out[0] = state.frame;
        out[1] = state.duration;
        for (let i = 0; i < 3; i++) {
            out[2 + i] = from.offset[i];
            out[5 + i] = from.rotate[i];
            out[8 + i] = from.scale[i];
            out[11 + i] = to.offset[i];
            out[14 + i] = to.rotate[i];
            out[17 + i] = to.scale[i];
        }
        return out;
    },
    sameTransform(placed, state) {
        if (placed.transform !== (state || null)) return false;
        if (!state) return true;
        if (!placed.transformDone || !this.transformDone(state)) return false;
        const numbers = this.transformNumbers(state, this._numbers || (this._numbers = []));
        const was = placed.numbers;
        for (let i = 0; i < numbers.length; i++) if (numbers[i] !== was[i]) return false;
        return true;
    },
    freeze(holder, object) {
        if (!object.matrixAutoUpdate) return;
        object.updateMatrix();
        object.matrixAutoUpdate = false;
        holder.rootFrozen = true;
    },
    thaw(holder, object) {
        if (!holder.rootFrozen) return;
        object.matrixAutoUpdate = true;
        holder.rootFrozen = false;
    }
};

/**
 * How often a character model's motion is sampled, by how much of the view it
 * takes: every frame when it is plain to see, every other frame when it is
 * small (under ANIMATION_SMALL of the view's height: smaller than a unit in the
 * tactical view), every fourth when it is
 * a speck or behind the eye. The clip follows the frame clock, so a model
 * sampled less often is in the same pose at the same moment, only stepped;
 * where it stands is still placed every frame. The same rule in every mode
 * (exploration, Tactical, Action): a crowd's far side is what it saves on.
 */
Reactor3D.ANIMATION_SMALL = 0.05;
Reactor3D.ANIMATION_SPECK = 0.02;
Reactor3D.animationStride = function(x, y, z, span, camera) {
    if (!camera || !camera.position || !(span > 0)) return 1;
    const eye = camera.position, dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance < span * 2) return 1;
    // Behind the eye (with the body's own size to spare): nobody is looking.
    const e = camera.matrixWorld && camera.matrixWorld.elements;
    if (e && -(dx * e[8] + dy * e[9] + dz * e[10]) < -span) return 4;
    const fov = camera.fov > 0 ? camera.fov : 50;
    const share = span / (2 * distance * Math.tan(fov * Math.PI / 360));
    return share < Reactor3D.ANIMATION_SPECK ? 4 : share < Reactor3D.ANIMATION_SMALL ? 2 : 1;
};

/**
 * Whether a placed model's motion is sampled this frame: the player's own
 * body and one playing an action asked of it always are; the rest by their
 * stride, each on its own frame of it so a crowd's samples are spread.
 */
Reactor3D.animationDue = function(holder, character, object, camera) {
    holder.sampled = true;
    if (!camera || holder.action || (typeof $gamePlayer !== "undefined" && character === $gamePlayer)) return true;
    const span = Reactor3D.instanceSpan(object);
    const stride = Reactor3D.animationStride(object.position.x, object.position.y + span / 2, object.position.z, span, camera);
    if (stride === 1) return true;
    if (holder.strideAt === undefined) holder.strideAt = (Reactor3D._strideSeed = (Reactor3D._strideSeed || 0) + 1);
    // Kept for what is laid over the motion each frame (the look's lean): a frame not sampled keeps last frame's pose whole.
    return (holder.sampled = ((typeof Graphics !== "undefined" ? Graphics.frameCount : 0) + holder.strideAt) % stride === 0);
};

/**
 * New models built a few a frame while a battle runs on the map, and while a map is laid as it loads
 * (Reactor3D.Arrival): each is a clone, a rig, its fingers and materials (3 to 5 ms, a hundred and more for a
 * rigged hand), and an army arriving together was one frame of 200 ms. Also while worlds stand past the borders
 * of the map played (Reactor3D.Neighbors): their models, and the entered map's after a crossing, arrive in
 * bursts (18 ms in the crossing frame into North Haven on an integrated GPU). The first of a frame is always
 * built, more only inside BUDGET ms a frame; otherwise every model is built the moment its files are in.
 */
Reactor3D.ModelJoins = {
    BUDGET: 4,
    spent: 0,
    queue: [],
    limited() {
        if (Reactor3D.Arrival && Reactor3D.Arrival.pacing) return true;
        if (Reactor3D.Neighbors && Reactor3D.Neighbors.streaming && Reactor3D.Neighbors.streaming()) return true;
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        return !!(fight && typeof fight.isActive === "function" && fight.isActive());
    },
    now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); },
    /** A model whose files are in: built now, or after those already waiting. */
    add(job) {
        if (this.limited() && (this.queue.length || this.spent >= this.BUDGET)) { this.queue.push(job); return; }
        const start = this.now();
        try { job(); } finally { this.spent += this.now() - start; }
    },
    /** Once a frame, before the frame's own new models: those waiting, oldest first. */
    drain() {
        // The budget is the frame's in play: every scene synced this frame (a neighbor's world beside the map's own)
        // drains from it. A map laid while the screen is dark (Arrival) takes it again at each ask.
        const frame = typeof Graphics !== "undefined" && Graphics && Number.isFinite(Graphics.frameCount) ? Graphics.frameCount : null;
        if (frame === null || frame !== this._frame || (Reactor3D.Arrival && Reactor3D.Arrival.pacing)) { this._frame = frame; this.spent = 0; }
        while (this.queue.length && (this.spent < this.BUDGET || !this.limited())) {
            const start = this.now();
            try { this.queue.shift()(); } catch (error) { console.error("Reactor3D: a model could not join the map", error); }
            this.spent += this.now() - start;
        }
    }
};

Reactor3D.MapScene.prototype.syncCharacterModels = function(characters) {
    if (typeof THREE === "undefined") return;
    const group = this.modelsGroup();
    Reactor3D.ModelJoins.drain();
    if (!this._modelInstances) this._modelInstances = new Map();
    const live = new Set();
    // The camera is aimed for this frame before the models are synced;
    // distance levels are picked against where it stands.
    const lodViewport = Reactor3D.viewport();
    const lodCamera = lodViewport && lodViewport.camera ? lodViewport.camera() : null;
    const lodEye = lodCamera ? lodCamera.position : null;
    // The screen the distance levels are budgeted against, read once a sync
    // rather than once a model: it is the same camera and viewport for all.
    let lodScreen = null;
    let commandsAsked = false;
    const still = Reactor3D.StillModels;
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
            ]).then(([template, sidecar]) => Reactor3D.ModelJoins.add(() => {
                if (!template || !this._modelsGroup) return;
                const current = this._modelInstances.get(key);
                if (current !== holder || current.spec !== Reactor3D.modelCacheKey(spec.name, spec.ext, spec.file)) return;
                Reactor3D.groundAnimatedTemplate(template, sidecar);
                const object = Reactor3D.cloneModelTemplate(template);
                Reactor3D.applyModelTransform(object, Reactor3D.readModelTransform(sidecar, spec));
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
                current.rules = sidecar ? Reactor3D.readModelAnimationRules(sidecar, object.__reactorClips) : [];
                current.effects = sidecar ? Reactor3D.readModelEffects(sidecar, spec) : [];
                current.variant = spec.variant || "";
                group.add(object);
                // Animated prop silhouettes use the moving budget; still props keep cached rows.
                Reactor3D.Shadows.markCaster(object, Reactor3D.modelCasterMoves(character, current.rules));
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
            })).finally(() => { holder.settled = true; });
        }
        const object = holder.object;
        if (!object) continue;
        // Another variant of the same model (a page change, or a script): the look changes on the instance it has.
        if (holder.variant !== (spec.variant || "")) Reactor3D.refreshModelVariant(holder, spec);
        Reactor3D.resumeModelPlayback(holder, character, Reactor3D.currentFrame());
        const extent = object.userData.glbSize || STILL_UNIT_EXTENT;
        // Largest dimension, matching the collision footprint's rule.
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
        const fit = (spec.size > 0 ? spec.size : 2) / span;
        const scale = fit * (spec.scale > 0 ? spec.scale : 1);
        const ground = Reactor3D.characterGround(
            typeof $dataMap !== "undefined" ? $dataMap : null, character);
        const dir8 = Reactor3D.characterModelDir8(character);
        if (lodEye && !lodScreen) {
            lodScreen = this._lodScreenScratch || (this._lodScreenScratch = { factor: 0, pixels: 0 });
            lodScreen.factor = Reactor3D._lodScreenFactor();
            lodScreen.pixels = Reactor3D._lodScreenPixels();
        }
        if (still.enabled && still.settled(holder, character, object, spec, extent, ground, dir8)) {
            // Placed last frame from these same inputs and untouched since:
            // everything the placement below would write is already there.
            if (lodEye) Reactor3D.pickLod(object, holder.placed.lodSpan, lodEye, holder.spec, lodScreen);
            Reactor3D.noteModelFacing(character, holder.smoothYaw - (spec.yaw || 0));
            still.freeze(holder, object);
        } else {
            still.thaw(holder, object);
            const stretch = spec.stretch || STILL_NO_STRETCH;
            object.scale.set(scale * stretch[0], scale * stretch[1], scale * stretch[2]);
            const lodSpan = Reactor3D.instanceSpan(object);
            if (lodEye) Reactor3D.pickLod(object, lodSpan, lodEye, holder.spec, lodScreen);
            Reactor3D.applyEventModelPose(object, spec, dir8);
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
            // A jump or a fall (reactor_physics) lifts the model by its air.
            const air = character._reactorAir || 0;
            // A climber hangs against its ladder, not in the middle of the cell.
            if (character._reactorOnLadder && holder.chestForward === undefined) holder.chestForward = Reactor3D.chestForward(holder);
            // (A body pulling itself up a ledge leans to the wall it climbs: the physics says how far.)
            const hold = character._reactorOnLadder ? Reactor3D.LADDER_RUNGS - Reactor3D.LADDER_CHEST_GAP - (holder.chestForward || 0)
                : character._reactorMantle ? Reactor3D.mantleHold(holder, character) : 0;
            const holdX = hold * ((character.direction && character.direction() === 6) ? 1 : (character.direction && character.direction() === 4) ? -1 : 0);
            const holdZ = hold * ((character.direction && character.direction() === 2) ? 1 : (character.direction && character.direction() === 8) ? -1 : 0);
            // A sized event's model stands at the middle of its footprint.
            const middle = Reactor3D.eventGraphicOffset(character);
            const middleX = middle ? middle[0] : 0, middleZ = middle ? middle[1] : 0;
            object.position.set(character._realX + 0.5 + middleX + offset[0] + holdX, ground + (character._reactorLift || 0) + air + offset[2], character._realY + 0.5 + middleZ + offset[1] + holdZ);
            holder.cameraBaseX = character._realX;
            holder.cameraBaseY = ground + (character._reactorLift || 0) + air;
            holder.cameraBaseZ = character._realY;
            Reactor3D.applyLiveTransform(object, character);
            // Face Ceiling / Face Ground and Rotate route steps. Local axes,
            // after the facing yaw: a model falls onto its own back or face
            // whichever way it points, and rolls the way a sprite would turn.
            const posePitch = character._reactorPosePitch || 0;
            const poseSpin = character._reactorSpin || 0;
            // One felled by a blow goes over along the blow's line on the map (`_reactorFallYaw`), whichever way it faced.
            const fallAxis = posePitch > 0 ? Reactor3D.fallAxis(character._reactorFallYaw) : null;
            if (fallAxis) object.rotateOnWorldAxis(fallAxis, posePitch * Math.PI / 2);
            else if (posePitch) object.rotateX(-posePitch * Math.PI / 2);
            if (poseSpin) object.rotateZ(-poseSpin * Math.PI / 180);
            if (still.enabled) still.note(holder, character, object, spec, extent, ground, dir8, lodSpan, targetYaw);
        }
        object.visible = !(character.isTransparent && character.isTransparent())
            && !Reactor3D.cameraInsideModel(character, object)
            && !Reactor3D.characterHiddenByCamera(character, true);
        // Idempotent; asked once a sync, at the first placed model, which is
        // when the first of the per-model calls it replaces used to run.
        if (!commandsAsked) {
            commandsAsked = true;
            Reactor3D.registerPluginCommands();
        }
        // A limp body (a fatal fall) is the ragdoll's, not the animation's.
        if (character._reactorRagdoll && holder.binding) {
            Reactor3D.stepRagdoll(holder, character);
        } else if (holder.binding && holder.rules && holder.rules.length && Reactor3D.animationDue(holder, character, object, lodCamera)) {
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
                airborne: Reactor3D.isAirborne(character),
                swimming: Reactor3D.isSwimming(character),
                climbing: Reactor3D.isClimbing(character),
                climbHeight: Reactor3D.isClimbing(character) ? character._reactorAlt : undefined,
                distance,
                scale,
                // A part's move is authored against the Database preview, where every model stands as
                // tall as a character (3 tiles): a placed model of another size moves in proportion
                // (a room's door rose a fifth of its travel). The party keeps its moves as tuned.
                moveScale: Reactor3D.partyCharacter(character) ? 1 : Math.max(0.05, (spec.size > 0 ? spec.size : 2) * (spec.scale > 0 ? spec.scale : 1) / Reactor3D.MOVE_REFERENCE_TILES),
                playbackRate: holder.playbackRate,
                action: holder.action || null
            });
        }
        // After the animation pass: a clip writes every bone each frame, so
        // the look's lean goes on top of whatever the head was doing.
        if (!character._reactorRagdoll && holder.sampled !== false) Reactor3D.applyLookLean(object, character);
        // A body on a ledge keeps its hands on the edge: Reactor3D.MantlePose.
        if (character._reactorMantle || holder.mantlePose) Reactor3D.MantlePose.update(holder, character);
        // What the character holds (a tactical battle's weapons) is laid over the motion: Reactor3D.MapHeld.
        if (Reactor3D.MapHeld.count) Reactor3D.MapHeld.update(holder, character, this, !object.visible);
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
                    : !!(character.isDashing && character.isDashing()),
                airborne: Reactor3D.isAirborne(character),
                swimming: Reactor3D.isSwimming(character)
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
        if (Reactor3D.MapHeld.count) Reactor3D.MapHeld.detach(holder);
        Reactor3D.releaseModelHolder(holder);
        this._modelInstances.delete(key);
    }
};

/** A character model going for good: what its copy holds on the GPU goes with it (the renderer outlives map scenes). */
Reactor3D.releaseModelHolder = function(holder) {
    const entry = holder && holder.object && this._glbCache[holder.spec];
    if (entry && entry.template) this.releaseModelInstance(holder.object, entry.template);
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
            holder = { texture, geometry, object, stampFields: null, view: null, above: false };
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
    // A battle unit that stands as a battler picture or a plain figure (Sprite_Character.updateReactorLook) is
    // drawn from the larger copy of that picture, whole, at the size in tiles the look rule gives it.
    const look = sprite._rrLook && sprite._rrLook.full ? sprite._rrLook : null;
    const bitmap = look ? look.full : sprite.bitmap;
    const frame = look ? look.frame : sprite._frame;
    const ready = bitmap && (!bitmap.isReady || bitmap.isReady())
        && frame && frame.width > 0 && frame.height > 0;
    const hidden = (character.isTransparent && character.isTransparent())
        || Reactor3D.characterHiddenByCamera(character);
    holder.object.visible = !!(ready && !hidden);
    if (!ready) return;
    const mirrored = !!(sprite.scale && sprite.scale.x < 0);
    // Flip (upside down) reads its rows bottom to top: the picture turns over in its own place, as the 2D sprite does.
    const flipped = !!(sprite.scale && sprite.scale.y < 0);
    // What the frame was cut from last time, field by field: joining them
    // into a string made one per billboard per frame to find nothing new.
    const url = bitmap.url || bitmap._url || "";
    const stamp = holder.stampFields || (holder.stampFields = { url: null, bitmap: null, x: 0, y: 0, width: 0, height: 0, mirrored: false, flipped: false });
    // (The bitmap itself as well as its file: two drawn pictures of one size have no file to tell them apart.)
    if (stamp.url !== url || stamp.bitmap !== bitmap || stamp.x !== frame.x || stamp.y !== frame.y
        || stamp.width !== frame.width || stamp.height !== frame.height || stamp.mirrored !== mirrored || stamp.flipped !== flipped) {
        stamp.url = url;
        stamp.bitmap = bitmap;
        stamp.x = frame.x;
        stamp.y = frame.y;
        stamp.width = frame.width;
        stamp.height = frame.height;
        stamp.mirrored = mirrored;
        stamp.flipped = flipped;
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
            const v0 = 1 - (frame.y + frame.height) / H, vh = frame.height / H;
            view.repeat.set(mirrored ? -uw : uw, flipped ? -vh : vh);
            view.offset.set(mirrored ? u0 + uw : u0, flipped ? v0 + vh : v0);
        }
    }
    const map = typeof $gameMap !== "undefined" ? $gameMap : null;
    const tw = map && map.tileWidth ? map.tileWidth() : 48;
    const th = map && map.tileHeight ? map.tileHeight() : 48;
    if (look) holder.object.scale.set(look.wide, look.tall, 1);
    else holder.object.scale.set(frame.width / tw, frame.height / th, 1);
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
    // A sized event's picture stands at the middle of its footprint.
    const middle = Reactor3D.eventGraphicOffset(character);
    let baseX = character._realX + 0.5 + footX + (middle ? middle[0] : 0);
    let baseY = ground;
    let baseZ = character._realY + 0.5 + footZ + (middle ? middle[1] : 0);
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
    Reactor3D.turnCharacterBillboard(holder.object, sprite.rotation, character._rrSpinPivot === "center");
};

/**
 * The sprite's turn on its billboard (Rotate, Face Ceiling / Face Ground, a
 * page's angle): rolled in the billboard's own plane, clockwise as the camera
 * sees it, about its feet (the geometry's origin) or, `center`, about its
 * middle, so it turns in place. Upright (0) leaves the aimed billboard alone.
 */
Reactor3D.turnCharacterBillboard = function(object, radians, center) {
    const turn = Number(radians) || 0;
    if (!object || !turn) return;
    if (center) {
        const half = (object.scale ? object.scale.y : 1) / 2;
        object.translateX(-Math.sin(turn) * half);
        object.translateY(half - Math.cos(turn) * half);
    }
    object.rotateZ(-turn);
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
            Reactor3D.releaseModelHolder(holder);
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
        // Per-axis stretch on top of size and scale, as the editor saves it.
        stretch: [0, 1, 2].map(i => {
            const v = Array.isArray(raw.stretch) ? Number(raw.stretch[i]) : 1;
            return Number.isFinite(v) && v > 0 ? v : 1;
        }),
        passable: raw.passable === true || raw.passable === "true",
        // An action rule and an effect the prop starts with, by name.
        animations, animation: animations[0] || "",
        animationSpeed: Math.max(1, Math.min(1000, number(raw.animationSpeed, 100))),
        repeat: raw.repeat === true || raw.repeat === "true",
        effects, effect: effects[0] || "",
        // Which of the model's variants it wears: only on a prop that names one.
        ...(typeof raw.variant === "string" && raw.variant.trim() ? { variant: raw.variant.trim() } : null)
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
        yaw: prop.yaw, pitch: prop.pitch, roll: prop.roll,
        ...(prop.variant ? { variant: prop.variant } : null)
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

/**
 * An event's footprint in tiles, `[w, h]` (`reactor3d.eventSize[id]`; 1 by 1
 * when unset). One event can stand over a whole ramp or doorway: touching or
 * facing any tile of it counts, and it blocks all of them as it would its
 * own. 2D maps too.
 *
 * With `reactor3d.eventSizeAnchor: "center"` the footprint is centred on the
 * event: tiles x - floor((w - 1) / 2) to x + floor(w / 2), the same for y,
 * and an even size's middle is a tile's edge, so the event's graphic is drawn
 * half a tile on (`eventGraphicOffset`). A map without the mark (saved by
 * 0.98.8) counts the footprint from the event's tile rightward and down and
 * draws the graphic on that tile, as it always did; the editor converts a
 * map when it opens it.
 */
Reactor3D.EVENT_SIZE_MAX = 64;
Reactor3D.eventSizeAt = function(mapData, eventId) {
    const store = mapData && mapData.reactor3d && mapData.reactor3d.eventSize;
    const raw = store ? store[String(eventId)] : null;
    if (!Array.isArray(raw)) return [1, 1];
    const n = v => Math.max(1, Math.min(this.EVENT_SIZE_MAX, Math.floor(Number(v)) || 1));
    return [n(raw[0]), n(raw[1])];
};

/** Whether the map's footprints are centred on their events. */
Reactor3D.eventSizeCentered = function(mapData) {
    return !!(mapData && mapData.reactor3d && mapData.reactor3d.eventSizeAnchor === "center");
};

/** The footprint's first tile, in tiles from the event's own (zero or less). */
Reactor3D.eventFootprintOrigin = function(mapData, eventId) {
    if (!this.eventSizeCentered(mapData)) return [0, 0];
    const [w, h] = this.eventSizeAt(mapData, eventId);
    return [0 - Math.floor((w - 1) / 2), 0 - Math.floor((h - 1) / 2)];
};

/**
 * How far from the middle of its tile a sized event's graphic stands, in
 * tiles: half a tile along each axis its centred footprint is even on, else
 * nothing. Returns a shared pair (read it before the next call); `null` for
 * a character that is no sized event, which is nearly every one.
 */
Reactor3D._graphicOffset = [0, 0];
Reactor3D.eventGraphicOffset = function(character) {
    const map = typeof $dataMap !== "undefined" ? $dataMap : null;
    const sidecar = map && map.reactor3d;
    if (!sidecar || !sidecar.eventSize || sidecar.eventSizeAnchor !== "center" || !character || !(character._eventId > 0)) return null;
    const raw = sidecar.eventSize[String(character._eventId)];
    if (!Array.isArray(raw)) return null;
    const w = Math.floor(Number(raw[0])) || 1, h = Math.floor(Number(raw[1])) || 1;
    if (w % 2 !== 0 && h % 2 !== 0) return null;
    const offset = this._graphicOffset;
    offset[0] = w % 2 === 0 ? 0.5 : 0;
    offset[1] = h % 2 === 0 ? 0.5 : 0;
    return offset;
};

Reactor3D.setEventSize = function(mapData, eventId, size) {
    if (!mapData || !eventId) return;
    const n = v => Math.max(1, Math.min(this.EVENT_SIZE_MAX, Math.floor(Number(v)) || 1));
    const w = n(size && size[0]), h = n(size && size[1]);
    if (w === 1 && h === 1) {
        if (mapData.reactor3d && mapData.reactor3d.eventSize) {
            delete mapData.reactor3d.eventSize[String(eventId)];
            if (!Object.keys(mapData.reactor3d.eventSize).length) delete mapData.reactor3d.eventSize;
        }
        return;
    }
    if (!mapData.reactor3d || typeof mapData.reactor3d !== "object") mapData.reactor3d = { version: 1 };
    if (!mapData.reactor3d.eventSize || typeof mapData.reactor3d.eventSize !== "object") mapData.reactor3d.eventSize = {};
    mapData.reactor3d.eventSize[String(eventId)] = [w, h];
};

/**
 * A sized event is at every tile of its footprint (triggers, the action
 * button and collision all ask `pos`), and its sprite, with the balloon and
 * animations that follow it, is drawn at the footprint's middle.
 */
Reactor3D.installEventFootprints = function() {
    if (typeof Game_Event === "undefined" || Game_Event.prototype.pos.__reactorFootprint) return;
    const basePos = Game_Event.prototype.pos;
    Game_Event.prototype.pos = function(x, y) {
        const map = typeof $dataMap !== "undefined" ? $dataMap : null;
        if (!map || !map.reactor3d || !map.reactor3d.eventSize) return basePos.call(this, x, y);
        const [w, h] = Reactor3D.eventSizeAt(map, this._eventId);
        if (w === 1 && h === 1) return basePos.call(this, x, y);
        const [ox, oy] = Reactor3D.eventFootprintOrigin(map, this._eventId);
        const x0 = this._x + ox, y0 = this._y + oy;
        return x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
    };
    Game_Event.prototype.pos.__reactorFootprint = true;
    // The base methods are looked up as they are called, so a plugin's own screenX on the classes below still runs.
    Game_Event.prototype.screenX = function() {
        const x = Game_Character.prototype.screenX.call(this);
        const offset = Reactor3D.eventGraphicOffset(this);
        return offset && offset[0] ? x + Math.floor(offset[0] * $gameMap.tileWidth()) : x;
    };
    Game_Event.prototype.screenY = function() {
        const y = Game_Character.prototype.screenY.call(this);
        const offset = Reactor3D.eventGraphicOffset(this);
        return offset && offset[1] ? y + Math.floor(offset[1] * $gameMap.tileHeight()) : y;
    };
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
/**
 * Where a character's feet are, in tiles: the physics altitude when it has one
 * (the ground, a roof, a ladder rung), else its scripted lift. A player on a
 * roof 120 up is not in the way of a tree standing on the ground below it.
 */
Reactor3D.characterFeet = function(c) {
    const lift = c._reactorLift || 0;
    return Number.isFinite(c._reactorAlt) ? Math.max(c._reactorAlt, lift) : lift;
};

/** How tall a model's moves are authored against: the Database preview shows every model as tall as a character. */
Reactor3D.MOVE_REFERENCE_TILES = 3;

/** The player or a follower (their moves are tuned as they are). */
Reactor3D.partyCharacter = function(character) {
    return !!character && ((typeof Game_Player !== "undefined" && character instanceof Game_Player)
        || (typeof Game_Follower !== "undefined" && character instanceof Game_Follower));
};

Reactor3D.charactersOverlapVertically = function(a, b, at) {
    if (!a || !b) return true;
    let za = this.characterFeet(a), zb = this.characterFeet(b);
    // At a tile (`at`): an event stands at least on that tile's ground. One physics never moves has
    // no altitude of its own (it read as 0 and a walker on a ramp passed through it), and a sized
    // event spans ground of several heights.
    if (at && typeof $dataMap !== "undefined" && $dataMap && this.groundHeightAt && typeof Game_Event !== "undefined") {
        const ground = this.groundHeightAt($dataMap, at.x + 0.5, at.y + 0.5, za);
        if (b instanceof Game_Event && Number.isFinite(ground)) zb = Math.max(zb, ground + (b._reactorLift || 0));
    }
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
        this._reactorFallYaw = null;
        this._reactorPosePitch = pose > 0 ? 1 : pose < 0 ? -1 : 0;
    };
    /** Turn the drawn character to `degrees` on screen; a model rolls the same way. 0 stands it straight. `pivot` "center": about its middle. */
    proto.reactorRotate = function(degrees, pivot) {
        // Sprite Transforms off (Database > Reactor Features): a Rotate step does nothing, as in MZ.
        if (typeof ReactorFeatures !== "undefined" && !ReactorFeatures.on("spriteTransforms")) return;
        this._reactorSpin = Number(degrees) || 0;
        this._rrSpinPivot = pivot === "center" ? "center" : undefined;
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
    // Collision by height is part of the body rule: `isCollidedWithEvents` and
    // `isCollidedWithPlayerCharacters` ask Reactor3D.bodyBlocksTile / bodyMeetsEvents / bodyMeetsParty.
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
    Reactor3D.installEventFootprints();
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
