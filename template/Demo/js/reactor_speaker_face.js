//=============================================================================
// reactor_speaker_face.js: the message box shows who is talking
//=============================================================================
// A Show Text with no face picture shows its speaker's face when the game can
// tell who speaks and has a picture of them.
//
// Who speaks, in this order:
//   1. the speaker name, with \N[n], \P[n] and \V[n] resolved, is an actor's
//      name: that actor;
//   2. it is the name of an event on the map (the same, or the event's name
//      begins with it: "Rhea" is the event "Rhea Voss"): that event;
//   3. it is empty: the event that runs the command.
// A name that fits nobody gets no face. Several events of one name: the one
// that runs the command, else the look they share; when those that have a
// look do not look alike, no face.
//
// Their picture, in this order:
//   - an actor's face picture;
//   - a portrait of the model they wear (an actor's face or map model from
//     data/Database.r3d.json, an event's own model), head and shoulders;
//   - for an event drawn from a character sheet, the face file of the same
//     name and index in img/faces, when the project has one;
//   - none: the text keeps the full width.
//
// The format (docs/AUTHORING.md):
//   System.json   "reactorSpeakerFace": true    what a Show Text that does not
//                                               say does; absent is false
//   a Show Text   "reactorFace": "auto"|"none"  beside code, indent and
//                                               parameters: this message's own
//                                               choice; the five parameters are
//                                               RPG Maker's, untouched
// A message with a face picture (parameters[0]) always shows that picture.
//
// The automatic face reaches the message window as an ordinary face: a face
// file's own name and index, or a portrait served by ImageManager.loadFace
// under a reserved name (FACE_PREFIX) with index 0, set on $gameMessage like
// any face. Nothing here draws in a window, and nothing runs per frame: a
// portrait is drawn once per model and look into a small bounded cache, by a
// loop that lives only while one is being made.
//
// The first part of this file (names, rules, framing) touches no game global:
// the editor's Show Text dialog and Node tools load it for the same answers.

(function(root) {
    "use strict";

    const S = {};

    //-------------------------------------------------------------------------
    // The format

    /** System.json: what a Show Text with no face picture does when it does not say. */
    S.SYSTEM_FIELD = "reactorSpeakerFace";
    /** A Show Text command's own choice, beside its code, indent and parameters. */
    S.COMMAND_FIELD = "reactorFace";
    S.AUTO = "auto";
    S.NONE = "none";
    /** Face names that begin with this are portraits made here, never files in img/faces. */
    S.FACE_PREFIX = "rr-speaker-";

    S.isOn = function(system) {
        return !!system && system[S.SYSTEM_FIELD] === true;
    };

    /** A Show Text command's own choice: "auto", "none", or "" when it does not say. */
    S.choiceOf = function(command) {
        const choice = command ? command[S.COMMAND_FIELD] : "";
        return choice === S.AUTO || choice === S.NONE ? choice : "";
    };

    /** Whether a Show Text with no face picture shows its speaker's face. */
    S.wantsFace = function(system, command) {
        const choice = S.choiceOf(command);
        return choice === S.AUTO || (choice !== S.NONE && S.isOn(system));
    };

    S.isReservedFace = function(name) {
        return typeof name === "string" && name.startsWith(S.FACE_PREFIX);
    };

    //-------------------------------------------------------------------------
    // The name

    const ESC = "\x1b";
    const escaped = text => String(text == null ? "" : text).replace(/\\/g, ESC).replace(/\x1b\x1b/g, "\\");
    /** The codes that draw no letters: color, icon, size, waits. */
    const withoutSilentCodes = text => text.replace(/\x1b[A-Z]+\[[^\]]*\]/gi, "").replace(/\x1b[A-Z]+/gi, "").replace(/\x1b./g, "");
    const norm = text => String(text == null ? "" : text).trim().toLowerCase();
    const wordEnds = ch => ch === "" || !/[\p{L}\p{N}]/u.test(ch);

    /**
     * A speaker name as the player reads it: \V[n], \N[n], \P[n] and \G
     * replaced through `lookup` (variable, actorName, partyMemberName,
     * currency), every other code removed. `known` is false when a value
     * was needed that `lookup` could not give (the editor has no variables).
     */
    S.plainName = function(text, lookup) {
        const from = lookup || {};
        let known = true;
        const ask = (fn, n) => {
            const value = typeof fn === "function" ? fn(parseInt(n, 10)) : undefined;
            if (value === undefined || value === null) { known = false; return ""; }
            return String(value);
        };
        let out = escaped(text);
        for (let depth = 0; depth < 8 && /\x1bV\[\d+\]/i.test(out); depth++) out = out.replace(/\x1bV\[(\d+)\]/gi, (_, n) => ask(from.variable, n));
        out = out.replace(/\x1bN\[(\d+)\]/gi, (_, n) => ask(from.actorName, n));
        out = out.replace(/\x1bP\[(\d+)\]/gi, (_, n) => ask(from.partyMemberName, n));
        out = out.replace(/\x1bG/gi, typeof from.currency === "string" ? from.currency : "");
        return { text: withoutSilentCodes(out).trim(), known };
    };

    /** The actor a name names outright: it is one \N[n], or one \P[n] (through `lookup.partyMemberId`), and nothing else that shows. 0 when not. */
    S.directActor = function(text, lookup) {
        const only = escaped(text).replace(/\x1b(?![NP]\[)[A-Z]+\[[^\]]*\]/gi, "").replace(/\x1b[{}$.|!><^]/g, "").trim();
        let match = /^\x1bN\[(\d+)\]$/i.exec(only);
        if (match) return parseInt(match[1], 10) || 0;
        match = /^\x1bP\[(\d+)\]$/i.exec(only);
        if (match && lookup && typeof lookup.partyMemberId === "function") return lookup.partyMemberId(parseInt(match[1], 10)) || 0;
        return 0;
    };

    /**
     * Who a Show Text's speaker is.
     *
     * `world`: { actors: [{ id, name }], party: [actorId], events: [{ id,
     * name }], runningEventId, lookup }. Returns one of
     *   { kind: "actor", id, rule: "code" | "actor" }
     *   { kind: "event", id, rule: "name" | "prefix" | "running" }
     *   { kind: "events", ids, rule }   several events share the name and
     *                                   none of them runs the command
     *   { kind: "none", why: "unknown" | "noEvent" | "nobody" }
     */
    S.whoSpeaks = function(name, world) {
        const lookup = world.lookup || {};
        const actors = world.actors || [], events = world.events || [];
        const running = Number(world.runningEventId) || 0;
        const direct = S.directActor(name, lookup);
        if (direct && actors.some(actor => actor.id === direct)) return { kind: "actor", id: direct, rule: "code" };
        const plain = S.plainName(name, lookup);
        if (!plain.known) return { kind: "none", why: "unknown" };
        const said = norm(plain.text);
        if (!said) return running > 0 ? { kind: "event", id: running, rule: "running" } : { kind: "none", why: "noEvent" };
        // An actor's name: one in the party before one who is not.
        const party = world.party || [];
        let actorId = 0;
        for (const actor of actors) {
            if (norm(actor.name) !== said) continue;
            if (party.indexOf(actor.id) >= 0) { actorId = actor.id; break; }
            if (!actorId) actorId = actor.id;
        }
        if (actorId) return { kind: "actor", id: actorId, rule: "actor" };
        // An event's name: the same before one that begins with it, the one that runs the command before any other.
        const same = [], begins = [];
        for (const event of events) {
            const own = norm(event.name);
            if (!own) continue;
            if (own === said) same.push(event.id);
            else if (own.startsWith(said) && wordEnds(own.charAt(said.length))) begins.push(event.id);
        }
        const found = same.length ? same : begins;
        if (!found.length) return { kind: "none", why: "nobody" };
        const rule = same.length ? "name" : "prefix";
        if (found.indexOf(running) >= 0) return { kind: "event", id: running, rule };
        if (found.length === 1) return { kind: "event", id: found[0], rule };
        return { kind: "events", ids: found, rule };
    };

    //-------------------------------------------------------------------------
    // The portrait's scene: one framing for every model, the same in the game
    // and in the editor's preview. `R` is Reactor3D, `T` is THREE.

    /** A model is drawn this large (its longest side, in world units) whatever its file's own units are. */
    S.MODEL_SPAN = 1.6;
    /** The picture is this many head heights tall, and the eyes sit this far down it. */
    S.HEADS_TALL = 1.85;
    S.EYE_LINE = 0.47;
    /** A head's share of a humanoid's height, where no marker says. */
    S.HEAD_SHARE = 0.135;

    /**
     * The head of a posed model: { eyes, chin, height } in world space, or
     * null when it has none to frame (a vehicle, a prop). The size comes from
     * the rig's head-top and chin markers, else from the model's height; the
     * anchor is the model's eyes point when it has one.
     */
    S.headOf = function(R, T, object, rig, sidecar, box) {
        const size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
        const grown = box.clone().expandByScalar(Math.max(size.x, size.y, size.z) * 0.08);
        let top = null, chin = null, eyes = null;
        // A model stood on its idle clip's lowest point has been moved under its own frame by that much: a point
        // placed on the model as it loads (a marker, an eyes point on the whole model) goes with it.
        const ground = Number(object.userData && object.userData.reactorClipGround) || 0;
        const placed = point => object.localToWorld(new T.Vector3(point[0], point[1] - ground, point[2]));
        const markers = rig && rig.markers ? rig.markers : null;
        if (markers && markers.headTop && markers.chin) {
            const t = placed(markers.headTop), c = placed(markers.chin);
            if (grown.containsPoint(t) && grown.containsPoint(c) && t.y > c.y) { top = t; chin = c; }
        }
        if (sidecar && R.readModelLandmarks && R.bindModelLandmarks && R.modelLandmarkWorld) {
            const points = R.readModelLandmarks(sidecar);
            if (points && points.eyes) {
                // The eyes alone: the mouth's capture of every mesh is for speech, not for a still.
                R.bindModelLandmarks(object, { eyes: points.eyes });
                let e = R.modelLandmarkWorld(object, "eyes", new T.Vector3());
                // An eyes point on a bone moved with the bone; one on the whole model is moved here.
                if (e && !points.eyes.part && ground) e = placed(points.eyes.offset);
                if (e && grown.containsPoint(e) && (!top || (e.y < top.y && e.y > chin.y))) eyes = e;
            }
        }
        const humanoid = !!(sidecar && sidecar.rig && sidecar.rig.template === "humanoid");
        if (!top && !eyes && !humanoid) return null;
        const height = top ? top.y - chin.y : size.y * S.HEAD_SHARE;
        if (!eyes) {
            eyes = top
                ? new T.Vector3((top.x + chin.x) / 2, chin.y + height / 2, (top.z + chin.z) / 2)
                : new T.Vector3(center.x, box.max.y - height / 2, center.z);
        }
        return { eyes, chin: chin || new T.Vector3(eyes.x, eyes.y - height / 2, eyes.z), height };
    };

    /** Aim at a head: head and shoulders, turned a little toward the text, lit from beside the camera. */
    S.aimAtHead = function(T, head, camera, sun) {
        const span = head.height * S.HEADS_TALL;
        const middle = new T.Vector3(head.eyes.x, head.eyes.y - span * (0.5 - S.EYE_LINE), head.eyes.z);
        const distance = Math.max(0.2, (span / 2) / Math.tan(camera.fov * Math.PI / 360));
        camera.position.copy(middle).addScaledVector(new T.Vector3(0.2, 0.04, 1).normalize(), distance);
        camera.lookAt(middle);
        camera.updateProjectionMatrix();
        sun.position.copy(camera.position).add(new T.Vector3(0.6, 0.9, 0.4));
        sun.target.position.copy(head.chin);
    };

    /** Aim at the whole of a model with no head: from the front quarter, as close as keeps every corner of its box in the picture. */
    S.aimAtWhole = function(T, box, camera, sun) {
        const center = box.getCenter(new T.Vector3());
        const yaw = 0.6, pitch = 0.32, tan = Math.tan(camera.fov * Math.PI / 360);
        const back = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        const right = new T.Vector3(0, 1, 0).cross(back).normalize(), up = back.clone().cross(right).normalize();
        const corner = new T.Vector3();
        let distance = 0.1;
        for (let i = 0; i < 8; i++) {
            corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
            distance = Math.max(distance, corner.dot(back) + Math.max(Math.abs(corner.dot(right)), Math.abs(corner.dot(up))) / tan);
        }
        camera.position.copy(center).addScaledVector(back, distance * 1.04);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
        sun.position.copy(camera.position).add(new T.Vector3(0.6, 0.9, 0.4));
        sun.target.position.copy(center);
    };

    /**
     * A loaded model, dressed as `spec` wears it and stood before a camera:
     * { scene, camera, object, head }. `head` is true for a head-and-shoulders
     * picture, false for the whole of a model that has no head.
     */
    S.buildScene = function(R, T, template, sidecar, spec) {
        if (R.groundAnimatedTemplate) R.groundAnimatedTemplate(template, sidecar);
        const object = R.cloneModelTemplate(template);
        if (R.applyModelTransform && R.readModelTransform) R.applyModelTransform(object, R.readModelTransform(sidecar, spec));
        const rig = R.readModelRig ? R.readModelRig(sidecar) : null;
        if (rig && R.applyModelRig) R.applyModelRig(object, rig);
        else {
            if (R.carveModelParts && R.readModelParts) R.carveModelParts(object, R.readModelParts(sidecar));
            if (R.applyPivotOverrides && R.readModelPivots) R.applyPivotOverrides(object, R.readModelPivots(sidecar));
        }
        // The variant this speaker wears: its surface, color adjustment and texture.
        if (R.applyModelSurface && R.variantSurface) R.applyModelSurface(object, R.variantSurface(sidecar, spec));
        if (R.applyModelLook && R.modelLook) R.applyModelLook(object, R.modelLook(sidecar, spec));
        const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
        object.scale.setScalar(S.MODEL_SPAN / Math.max(extent.x, extent.y, extent.z, 0.0001));
        if (R.applyEventModelPose) R.applyEventModelPose(object, { pitch: spec.pitch, yaw: spec.yaw, roll: spec.roll, faces: spec.faces }, 2, { preview: true, faceYaw: 0 });
        // A posed, skinned mesh is not where its resting bounds say: in a close-up it would be culled away.
        object.traverse(child => { if (child.isMesh) child.frustumCulled = false; });
        const scene = new T.Scene();
        scene.add(object);
        scene.add(new T.HemisphereLight(0xffffff, 0x8a94a6, 1.7));
        const camera = new T.PerspectiveCamera(30, 1, 0.05, 50);
        const sun = new T.DirectionalLight(0xffffff, 1.8);
        scene.add(sun);
        scene.add(sun.target);
        object.updateMatrixWorld(true);
        // The model's resting size, standing on the ground about its middle (a skinned mesh has no box worth measuring until it is drawn).
        const half = new T.Vector3(extent.x, extent.y, extent.z).multiplyScalar(object.scale.x / 2);
        const box = new T.Box3(new T.Vector3(-half.x, 0, -half.z), new T.Vector3(half.x, half.y * 2, half.z));
        const head = S.headOf(R, T, object, rig, sidecar, box);
        if (head) S.aimAtHead(T, head, camera, sun);
        else S.aimAtWhole(T, box, camera, sun);
        return { scene, camera, object, head: !!head };
    };

    root.ReactorSpeakerFace = S;
    if (typeof module !== "undefined" && module.exports) module.exports = S;

    //=========================================================================
    // The game. Nothing below runs in the editor or in Node tools.
    //=========================================================================

    if (typeof Game_Interpreter === "undefined" || typeof Game_Message === "undefined" || typeof ImageManager === "undefined") return;

    /** Portraits kept, at most: the least lately shown goes first. */
    S.KEEP = 16;
    /** Portraits a map may ask for when it loads, at most. */
    S.PREWARM_MAX = 8;
    /** What portraits have cost this session: how many, their drawings, and the main thread's time in them. */
    S.cost = { portraits: 0, drawings: 0, drawMs: 0, worstMs: 0, late: 0 };
    /** The last message looked at: its speaker name, who that was, and the face it got. */
    S.last = { name: "", who: "", rule: "", picture: "", face: "" };

    const faces = new Map();
    const byName = new Map();
    const faceFiles = new Map();
    let portraits = null, clock = 0, ticking = false, seen = -1, armed = false, blank = null, sawAuto = false;
    // The maps and the command lists already looked through: a parallel event sets its list up again every time it ends.
    let prewarmed = new WeakSet();
    let eventNames = { events: null, count: -1, list: [] };

    const R3 = () => (typeof Reactor3D !== "undefined" ? Reactor3D : null);
    const projectOn = () => typeof $dataSystem !== "undefined" && !!$dataSystem && $dataSystem[S.SYSTEM_FIELD] === true;
    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

    //-------------------------------------------------------------------------
    // Portraits

    /**
     * The portrait maker: the Tactical HUD's own (ReactorUI.FightPortraits:
     * one drawing a frame at most on the map's renderer, read back without
     * waiting for the graphics card, done when two drawings agree), with a
     * queue, a target and pictures of its own at the face size, this file's
     * framing, and a light of its own (ownLight).
     */
    function maker() {
        if (portraits) return portraits;
        const base = typeof ReactorUI !== "undefined" && ReactorUI.FightPortraits;
        if (!base) return null;
        const size = Math.max(32, Math.round(ImageManager.faceWidth || 144));
        const P = Object.create(base);
        // Everything the base keeps is kept here separately: the two never share a queue, a target or a picture.
        Object.assign(P, {
            SIZE: size,
            // Drawn at twice the face size and brought down: the picture is sharp at the size the window shows it.
            DRAWN: Math.max(192, Math.min(512, size * 2)),
            // The map's renderer writes display colors into the target it is handed (Viewport.createTarget), as it
            // does on the screen: the picture read back is the portrait's as it is, with nothing encoded again.
            encode: false,
            KEEP: S.KEEP, version: 0, entries: new Map(), queue: [], pending: null,
            target: null, targetGeneration: -1, pixels: null, scratch: null, lut: null, clearColor: null
        });
        P.load = function(entry) {
            const R = Reactor3D, spec = entry.model;
            Promise.all([R.loadModel(spec.name, spec.ext, spec.file, spec.texture), R.loadModelSidecar ? R.loadModelSidecar(spec.name) : null]).then(([template, sidecar]) => {
                if (this.entries.get(entry.key) !== entry) return;
                if (!template) { this.fail(entry); return; }
                Object.assign(entry, S.buildScene(R, THREE, template, sidecar, spec), { template, loading: false, wait: 0 });
            }).catch(error => {
                console.warn("ReactorSpeakerFace: no portrait for " + spec.name, error);
                this.fail(entry);
            });
        };
        P.paint = function(entry) {
            const from = now();
            const own = ownLight();
            // The drawing itself is done when paint returns (only the picture's way back may still be pending).
            try { return base.paint.call(this, entry); } finally {
                if (own) mapLightBack();
                spent(now() - from);
                S.cost.drawings++;
            }
        };
        P.develop = function(entry, pixels) {
            const from = now();
            try { return base.develop.call(this, entry, pixels); } finally { spent(now() - from); }
        };
        portraits = P;
        return P;
    }

    /** The portrait maker (null with no HUD runtime), for tests and for looking at what it holds. */
    S.portraits = maker;

    function spent(ms) {
        S.cost.drawMs += ms;
        if (ms > S.cost.worstMs) S.cost.worstMs = ms;
    }

    /** false draws a portrait in the light of the map it is made on. */
    S.ownLight = true;

    // What switches the map's light on in a lit material, beside its ambient: its lights, their grid, the light
    // volume, the moving lights and the glowing water.
    const MAP_LIGHTS = ["rrLightCount", "rrLightGridEnabled", "rrVolumeOn", "rrDynOn", "rrWaterFarEdge"];
    // The map's light as it stood, kept while one portrait is drawn.
    const mapLight = { uniforms: null, ambient: [1, 1, 1], values: MAP_LIGHTS.map(() => 0) };

    /**
     * A portrait is lit by its own two lights: the same picture on every map
     * at every hour. A model's materials read the map's light from values
     * every lit material shares, so while one portrait is drawn those read
     * as full ambient and nothing else. Returns whether they were changed;
     * `mapLightBack` then puts back what the map had, before anything of
     * the map is drawn again.
     */
    function ownLight() {
        const R = R3();
        const uniforms = S.ownLight !== false && R && R.lightUniforms ? R.lightUniforms() : null;
        if (!uniforms || !uniforms.rrAmbient || mapLight.uniforms) return false;
        const ambient = uniforms.rrAmbient.value;
        for (let i = 0; i < 3; i++) { mapLight.ambient[i] = ambient[i]; ambient[i] = 1; }
        for (let i = 0; i < MAP_LIGHTS.length; i++) {
            const uniform = uniforms[MAP_LIGHTS[i]];
            if (!uniform) continue;
            mapLight.values[i] = uniform.value;
            uniform.value = 0;
        }
        mapLight.uniforms = uniforms;
        return true;
    }

    function mapLightBack() {
        const uniforms = mapLight.uniforms;
        if (!uniforms) return;
        mapLight.uniforms = null;
        const ambient = uniforms.rrAmbient.value;
        for (let i = 0; i < 3; i++) ambient[i] = mapLight.ambient[i];
        for (let i = 0; i < MAP_LIGHTS.length; i++) {
            const uniform = uniforms[MAP_LIGHTS[i]];
            if (uniform) uniform.value = mapLight.values[i];
        }
    }

    /** A short, file-safe name for a model and look, the same every session. */
    function reservedName(key, spec) {
        let hash = 2166136261;
        for (let i = 0; i < key.length; i++) { hash ^= key.charCodeAt(i); hash = Math.imul(hash, 16777619); }
        const words = (String(spec.name).split("/").pop() + (spec.variant ? "-" + spec.variant : "")).replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
        return S.FACE_PREFIX + words + "-" + (hash >>> 0).toString(36);
    }

    /** A clear face-sized picture: what a reserved name with no portrait behind it is served. */
    function blankBitmap() {
        const size = Math.max(32, Math.round(ImageManager.faceWidth || 144));
        if (!blank || blank.width !== size || !blank.canvas) blank = new Bitmap(size, size);
        return blank;
    }

    /** ImageManager serves the reserved names from here, above whatever a plugin did to the loaders; nothing reserved ever asks the disk. */
    function arm() {
        if (armed) return;
        armed = true;
        const loadFace = ImageManager.loadFace;
        ImageManager.loadFace = function(filename) {
            if (S.isReservedFace(filename)) return S.bitmapFor(filename);
            return loadFace.apply(this, arguments);
        };
        const loadBitmap = ImageManager.loadBitmap;
        ImageManager.loadBitmap = function(folder, filename) {
            if (folder === "img/faces/" && S.isReservedFace(filename)) return S.bitmapFor(filename);
            return loadBitmap.apply(this, arguments);
        };
    }

    /** The picture behind a reserved face name: its portrait, or a clear one when that portrait is no longer kept. */
    S.bitmapFor = function(name) {
        const face = byName.get(name);
        if (!face || !face.bitmap) return blankBitmap();
        face.used = ++clock;
        return face.bitmap;
    };

    /**
     * The face of a model and look: { name, state } with state "making",
     * "ready" or "failed", or null when no portrait can be made here (no 3D).
     * The first call for a model starts its portrait.
     */
    S.modelFace = function(spec) {
        const P = maker();
        const key = P ? P.keyOf(spec) : "";
        if (!key) return null;
        let face = faces.get(key);
        if (face) { face.used = ++clock; return face; }
        if (!P.available()) return null;
        arm();
        const size = P.SIZE;
        face = { key, name: reservedName(key, spec), bitmap: new Bitmap(size, size), state: "making", tries: -1, used: ++clock };
        faces.set(key, face);
        byName.set(face.name, face);
        S.cost.portraits++;
        trim();
        P.get(spec);
        pump();
        return face;
    };

    /** Keep the cache within its bound: the least lately shown goes, never the face on screen. */
    function trim() {
        const shown = typeof $gameMessage !== "undefined" && $gameMessage ? $gameMessage.faceName() : "";
        while (faces.size > S.KEEP) {
            let oldest = null;
            for (const face of faces.values()) if (face.name !== shown && (!oldest || face.used < oldest.used)) oldest = face;
            if (!oldest) return;
            forget(oldest);
        }
    }

    function forget(face) {
        faces.delete(face.key);
        byName.delete(face.name);
        const P = portraits, entry = P ? P.entries.get(face.key) : null;
        if (entry) {
            P.release(entry);
            P.entries.delete(face.key);
            const at = P.queue.indexOf(entry);
            if (at >= 0) P.queue.splice(at, 1);
            if (P.pending === entry) P.pending = null;
        }
        if (face.bitmap) { try { face.bitmap.destroy(); } catch (e) { /* already gone */ } }
        face.bitmap = null;
    }

    /** Every portrait goes (another project's models, a test). */
    S.forget = function() {
        for (const face of Array.from(faces.values())) forget(face);
        if (portraits) rest(portraits);
        faceFiles.clear();
        eventNames = { events: null, count: -1, list: [] };
        prewarmed = new WeakSet();
    };

    S.cached = function() {
        return faces.size;
    };

    /** The loop that makes portraits: it runs only while one is being made. */
    function pump() {
        if (ticking) return;
        ticking = true;
        (typeof requestAnimationFrame === "function" ? requestAnimationFrame : fn => setTimeout(fn, 16))(tick);
    }

    function tick() {
        ticking = false;
        const P = portraits;
        if (!P) return;
        P.update(false);
        if (P.version !== seen) { seen = P.version; settle(P); }
        if (P.queue.length || P.pending) pump();
        else rest(P);
    }

    /** What the maker has drawn since the last look goes into the faces' own pictures; a finished portrait leaves the maker. */
    function settle(P) {
        for (const face of faces.values()) {
            if (face.state !== "making") continue;
            const entry = P.entries.get(face.key);
            if (!entry || entry.failed) {
                face.state = "failed";
                if (entry) P.entries.delete(face.key);
                continue;
            }
            if (entry.canvas && entry.tries !== face.tries) {
                face.tries = entry.tries;
                const context = face.bitmap.context;
                context.clearRect(0, 0, face.bitmap.width, face.bitmap.height);
                context.drawImage(entry.canvas, 0, 0, face.bitmap.width, face.bitmap.height);
                if (face.bitmap.baseTexture && face.bitmap.baseTexture.update) face.bitmap.baseTexture.update();
                redraw(face);
            }
            if (entry.canvas && !entry.scene && !entry.loading && P.queue.indexOf(entry) < 0) {
                face.state = "ready";
                P.entries.delete(face.key);
            }
        }
    }

    /** Nothing left to draw: the target and the buffers a drawing needs are given back. */
    function rest(P) {
        if (P.target) { try { P.target.dispose(); } catch (e) { /* already gone */ } }
        P.target = null;
        P.pixels = null;
        P.scratch = null;
    }

    /** A portrait that arrived while its message is up: the window draws its face again, in the room it kept for it. */
    function redraw(face) {
        if (typeof $gameMessage === "undefined" || !$gameMessage || $gameMessage.faceName() !== face.name) return;
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        const win = scene ? scene._messageWindow : null;
        if (!win || !win.contents || typeof win.drawMessageFace !== "function" || !(win.openness > 0)) return;
        const width = ImageManager.faceWidth;
        const x = $gameMessage.isRTL && $gameMessage.isRTL() ? win.innerWidth - width - 4 : 4;
        win.contents.clearRect(x, 0, width, win.innerHeight);
        win.drawMessageFace();
        S.cost.late++;
    }

    //-------------------------------------------------------------------------
    // Who speaks, from the running game

    const lookup = {
        variable: n => $gameVariables.value(n),
        actorName: n => {
            const data = $dataActors[n];
            if (!data) return "";
            const live = $gameActors && $gameActors._data ? $gameActors._data[n] : null;
            return live ? live.name() : data.name;
        },
        partyMemberName: n => { const actor = n >= 1 ? $gameParty.members()[n - 1] : null; return actor ? actor.name() : ""; },
        partyMemberId: n => { const actor = n >= 1 ? $gameParty.members()[n - 1] : null; return actor ? actor.actorId() : 0; },
        currency: ""
    };
    const world = { actors: [], party: [], events: [], runningEventId: 0, lookup };

    /** The actors, the party and the map's events as the rules read them. An actor's name can change; an event's cannot. */
    function readWorld(runningEventId) {
        world.actors.length = 0;
        for (let id = 1; id < $dataActors.length; id++) if ($dataActors[id]) world.actors.push({ id, name: lookup.actorName(id) });
        world.party = $gameParty && $gameParty.allMembers ? $gameParty.allMembers().map(actor => actor.actorId()) : [];
        const events = typeof $gameMap !== "undefined" && $gameMap ? $gameMap._events : null;
        if (!events) eventNames = { events: null, count: -1, list: [] };
        else if (eventNames.events !== events || eventNames.count !== events.length) {
            const list = [];
            for (const event of events) {
                const data = event && event.event ? event.event() : null;
                if (data) list.push({ id: event.eventId(), name: data.name || "" });
            }
            eventNames = { events, count: events.length, list };
        }
        world.events = eventNames.list;
        world.runningEventId = runningEventId || 0;
        lookup.currency = typeof TextManager !== "undefined" ? TextManager.currencyUnit : "";
        return world;
    }

    /** The character that shows an actor on the map now: the player for the leader, a follower, else nobody. */
    function actorCharacter(actorId) {
        const leader = $gameParty.leader ? $gameParty.leader() : null;
        if (leader && leader.actorId() === actorId) return $gamePlayer;
        const followers = $gamePlayer && $gamePlayer.followers ? $gamePlayer.followers()._data : null;
        for (const follower of followers || []) {
            const actor = follower && follower.actor ? follower.actor() : null;
            if (actor && actor.actorId() === actorId) return follower;
        }
        return null;
    }

    const picture = { kind: "", name: "", index: 0, spec: null };
    const face = (name, index) => { picture.kind = "face"; picture.name = name; picture.index = index || 0; picture.spec = null; return picture; };
    const model = spec => { picture.kind = "model"; picture.name = ""; picture.index = 0; picture.spec = spec; return picture; };

    /** An actor's picture: its face picture, else the model it wears. The one result object is written again by the next call. */
    S.actorPicture = function(actorId) {
        const data = $dataActors[actorId];
        if (!data) return null;
        const live = $gameActors && $gameActors._data ? $gameActors._data[actorId] : null;
        const faceName = live ? live.faceName() : data.faceName;
        if (faceName) return face(faceName, live ? live.faceIndex() : data.faceIndex);
        const R = R3();
        if (!R || !R.databaseModelSpec || (R.isDatabaseSidecarReady && !R.isDatabaseSidecarReady())) return null;
        let spec = R.actorSlotSpec ? R.actorSlotSpec(actorId, "face") : null;
        if (!spec && R.characterModelSpec) {
            const character = actorCharacter(actorId);
            try { spec = character ? R.characterModelSpec(character) : null; } catch (e) { spec = null; }
        }
        spec = spec || R.databaseModelSpec("actors", actorId);
        return spec ? model(spec) : null;
    };

    /** An event's picture: the model it wears, else the face file named as its character sheet. */
    S.eventPicture = function(event) {
        if (!event) return null;
        const R = R3();
        let spec = null;
        if (R && R.characterModelSpec) { try { spec = R.characterModelSpec(event) || null; } catch (e) { spec = null; } }
        if (spec) return model(spec);
        const sheet = event.characterName ? event.characterName() : "";
        if (!sheet || (event.tileId && event.tileId() > 0) || ImageManager.isObjectCharacter(sheet)) return null;
        if (!S.hasFaceFile(sheet)) return null;
        return face(sheet, ImageManager.isBigCharacter(sheet) ? 0 : event.characterIndex());
    };

    /**
     * Whether img/faces holds a file of this name. Asked of the disk where
     * there is one (a face the project never shipped must not be requested:
     * a missing image stops the game); in a browser it is asked once in the
     * background and is false until the answer is in.
     */
    S.hasFaceFile = function(name) {
        if (faceFiles.has(name)) return faceFiles.get(name) === true;
        const encrypted = typeof Utils !== "undefined" && Utils.hasEncryptedImages && Utils.hasEncryptedImages();
        const explicit = (ImageManager._imageExtensions || [".png"]).some(extension => name.toLowerCase().endsWith(extension));
        const files = explicit ? [name] : [name + ".png"];
        if (encrypted) files.push(files[0] + "_");
        if (typeof Utils !== "undefined" && Utils.isNwjs && Utils.isNwjs() && typeof require === "function" && typeof process !== "undefined" && process.mainModule) {
            let found = false;
            try {
                const fs = require("fs"), path = require("path");
                const folder = path.join(path.dirname(process.mainModule.filename), "img", "faces");
                found = files.some(file => fs.existsSync(path.join(folder, file)));
            } catch (e) { found = false; }
            faceFiles.set(name, found);
            return found;
        }
        faceFiles.set(name, null);
        if (typeof XMLHttpRequest === "undefined") return false;
        const ask = at => {
            if (at >= files.length) { faceFiles.set(name, false); return; }
            const xhr = new XMLHttpRequest();
            xhr.open("HEAD", "img/faces/" + Utils.encodeURI(files[at]));
            xhr.onload = () => { if (xhr.status < 400) faceFiles.set(name, true); else ask(at + 1); };
            xhr.onerror = () => ask(at + 1);
            xhr.send();
        };
        ask(0);
        return false;
    };

    /**
     * The picture of whoever `who` is (S.whoSpeaks), or null. Several events
     * of one name: those that have a look must all look alike (one that
     * shows nothing is not the one the player sees).
     */
    S.pictureOf = function(who) {
        if (!who) return null;
        if (who.kind === "actor") return S.actorPicture(who.id);
        if (who.kind === "event") return S.eventPicture($gameMap.event(who.id));
        if (who.kind !== "events") return null;
        let kind = "", name = "", index = 0, key = "", spec = null;
        const P = maker();
        for (let i = 0; i < who.ids.length; i++) {
            const one = S.eventPicture($gameMap.event(who.ids[i]));
            if (!one) continue;
            const oneKey = one.kind === "model" ? (P ? P.keyOf(one.spec) : one.spec.name) : "";
            if (!kind) { kind = one.kind; name = one.name; index = one.index; key = oneKey; spec = one.spec; }
            else if (one.kind !== kind || one.name !== name || one.index !== index || oneKey !== key) return null;
        }
        if (!kind) return null;
        return kind === "face" ? face(name, index) : model(spec);
    };

    /**
     * The face a Show Text's speaker gets: { name, index } to set on the
     * message, or null for none. `out` is written and returned.
     */
    S.faceFor = function(speakerName, runningEventId, out) {
        const who = S.whoSpeaks(speakerName, readWorld(runningEventId));
        const found = S.pictureOf(who);
        const last = S.last;
        last.name = String(speakerName == null ? "" : speakerName);
        last.who = who.kind === "actor" ? "actor " + who.id : who.kind === "event" ? "event " + who.id : who.kind === "events" ? "events " + who.ids.join(",") : "nobody (" + who.why + ")";
        last.rule = who.rule || "";
        last.picture = found ? found.kind : "";
        last.face = "";
        if (!found) return null;
        if (found.kind === "face") { out.name = found.name; out.index = found.index; }
        else {
            const made = S.modelFace(found.spec);
            if (!made || made.state === "failed") { last.picture = ""; return null; }
            out.name = made.name;
            out.index = 0;
        }
        last.face = out.name;
        return out;
    };

    //-------------------------------------------------------------------------
    // The Show Text command

    const chosen = { name: "", index: 0 };

    /**
     * A Show Text that shows its speaker's face: the command below runs with
     * the face in its first two parameters, as if the author had picked it.
     * The command's own parameters are never written.
     */
    function showText(interpreter, command101, params, args) {
        const own = params || interpreter._params || [];
        // A picture of its own, a message still up (the command is asked again every frame until it can run), or
        // an imported game's own face setting: the stock command, as it is.
        if (own[0] || $gameMessage.isBusy() || ($gameSystem && $gameSystem._rrMessage)) return command101.apply(interpreter, args);
        const running = interpreter.isOnCurrentMap && interpreter.isOnCurrentMap() ? interpreter._eventId : 0;
        if (!S.faceFor(own[4], running, chosen)) return command101.apply(interpreter, args);
        const withFace = own.slice();
        withFace[0] = chosen.name;
        withFace[1] = chosen.index;
        // A command that reads its parameters from the interpreter (the MV way) finds the same face there.
        const held = interpreter._params === own;
        if (held) interpreter._params = withFace;
        try { return command101.call(interpreter, withFace); } finally { if (held) interpreter._params = own; }
    }

    /** Whether the Show Text commands of a list are looked at before they run. */
    const prewarms = () => projectOn() || sawAuto;

    /** A Show Text that will show its speaker's face has that face asked for now, so it is there when the message opens. */
    function prewarmCommand(command, runningEventId, done) {
        if (!command || command.code !== 101 || !command.parameters || command.parameters[0]) return;
        const choice = command[S.COMMAND_FIELD];
        if (choice === S.NONE || (choice !== S.AUTO && !projectOn())) return;
        const name = command.parameters[4] || "";
        const key = runningEventId + "|" + name;
        if (done.has(key)) return;
        done.add(key);
        const found = S.pictureOf(S.whoSpeaks(name, readWorld(runningEventId)));
        if (!found) return;
        if (found.kind === "face") ImageManager.loadFace(found.name);
        else S.modelFace(found.spec);
    }

    /** The commands an event is about to run (the first 200, as the stock preload reads them). */
    S.prewarmList = function(list, runningEventId) {
        if (!Array.isArray(list) || prewarmed.has(list)) return;
        prewarmed.add(list);
        const done = new Set(), count = Math.min(list.length, 200);
        for (let i = 0; i < count; i++) if (list[i] && list[i].code === 101) prewarmCommand(list[i], runningEventId, done);
    };

    /**
     * A map that has just loaded: the speakers of every page of every event
     * are looked up once, and the first few portraits they need are started,
     * so that talking to someone finds the face made. A speaker whose model
     * belongs to another page of its event is found when that event runs.
     */
    S.prewarmMap = function() {
        if (typeof $dataMap === "undefined" || !$dataMap || !$gameMap || !Array.isArray($dataMap.events)) return;
        if (prewarmed.has($dataMap)) return;
        prewarmed.add($dataMap);
        const done = new Set(), before = S.cost.portraits;
        for (const data of $dataMap.events) {
            if (!data || !Array.isArray(data.pages)) continue;
            for (const page of data.pages) {
                const list = page && page.list;
                if (!Array.isArray(list)) continue;
                for (let i = 0; i < list.length; i++) {
                    if (list[i].code !== 101) continue;
                    prewarmCommand(list[i], data.id, done);
                    if (S.cost.portraits - before >= S.PREWARM_MAX) return;
                }
            }
        }
    };

    /**
     * The hooks, put on once every plugin has loaded so they sit outside
     * whatever a plugin did to the same functions. With the project's switch
     * off and no choice of its own on the command, a Show Text runs the
     * command below untouched: one test of the switch and one of the command.
     */
    S.install = function() {
        // A hook keeps the marks other code left on the function under it (the MV layer marks a message command it
        // has taught to step by itself, and would teach it again if the mark were hidden).
        const hook = (owner, name, make) => {
            const under = owner[name];
            if (typeof under !== "function" || under._reactorSpeakerFace) return;
            owner[name] = Object.assign(make(under), under, { _reactorSpeakerFace: true });
        };
        hook(Game_Interpreter.prototype, "command101", command101 => function(params) {
            const command = this._list ? this._list[this._index] : null;
            const choice = command ? command[S.COMMAND_FIELD] : undefined;
            if (choice === S.NONE || (choice !== S.AUTO && !projectOn())) return command101.apply(this, arguments);
            if (choice === S.AUTO) sawAuto = true;
            return showText(this, command101, params, arguments);
        });
        hook(Game_Interpreter.prototype, "setup", setup => function(list) {
            setup.apply(this, arguments);
            if (prewarms()) S.prewarmList(list, this._eventId);
        });
        if (typeof Scene_Map !== "undefined") {
            hook(Scene_Map.prototype, "start", start => function() {
                start.apply(this, arguments);
                if (projectOn()) S.prewarmMap();
            });
        }
    };

    if (typeof Scene_Boot !== "undefined") {
        const start = Scene_Boot.prototype.start;
        Scene_Boot.prototype.start = function() {
            S.install();
            return start.apply(this, arguments);
        };
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
