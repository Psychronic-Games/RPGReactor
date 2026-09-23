//=============================================================================
// reactor_3d_effects.js — RPG Reactor 3D model effects
//=============================================================================
/*
 * An extension of Reactor3D (reactor_3d.js): the effects that ride a model.
 * Loaded after reactor_3d_models.js, in the game from scriptUrls, in the
 * editor from Reactor3D.EXTENSIONS, and in Node by the core's own tail.
 *
 * In order: model effects (database animations, video surfaces and lights
 * anchored to a model's parts and landmarks, fired on demand or by movement
 * state); light effects (a light riding a model's anchor, the Effekseer
 * scene, GPU effect measurement, anchored animation playback); and the
 * RPGReactor plugin commands for lights, models and effects.
 */

(function(root) {
    // Node alone takes the core from require; the NW.js page and the browser
    // find it on the global object, booted from scriptUrls.
    const node = typeof process !== "undefined" && process.versions && process.versions.node
        && !process.versions.nw && typeof require === "function";
    const Reactor3D = node ? require("./reactor_3d.js") : root.Reactor3D;
    if (!Reactor3D) return;

//-----------------------------------------------------------------------------
// Model effects
//
// A model's own effects list (`effects` in model.json): each one names a
// database animation (MV sheet or Effekseer), optionally a sound and a
// flash, and says where on the model it plays — an anchor, either the
// model's origin or a named part or bone, plus an offset in model space.
// Animation rules fire them by name (`{ at, effect }`) and the Play 3D
// Effect command fires them on demand. The animation is shown through the
// stock animation sprites, aimed at a stand-in sprite that follows the
// anchor's projected position every frame, so it sits on the antenna, the
// muzzle or the screen it was placed on rather than on the character's feet.
//-----------------------------------------------------------------------------

Reactor3D.readModelEffects = function(json) {
    const list = json && Array.isArray(json.effects) ? json.effects : [];
    const effects = [];
    const seen = new Set();
    for (const raw of list) {
        if (!raw || typeof raw !== "object" || !raw.name) continue;
        const name = String(raw.name);
        if (seen.has(name)) continue;
        seen.add(name);
        const anchorRaw = raw.anchor && typeof raw.anchor === "object" ? raw.anchor : {};
        const offsetRaw = Array.isArray(anchorRaw.offset) ? anchorRaw.offset : [];
        const triggers = ["action", "always", "moving", "walking", "dashing", "idle"];
        const videoRaw = raw.video && typeof raw.video === "object" ? raw.video : null;
        const effect = {
            // What it shows: a database animation, or a video surface on a
            // plane at the anchor — an animated screen on a console.
            type: raw.type === "video" ? "video" : raw.type === "light" ? "light" : "animation",
            // A light riding the anchor: the map-light schema, in the
            // model's own frame, switched by the trigger or the command.
            light: raw.type === "light" ? this.readEffectLight(raw.light) : null,
            // Width and height are fractions of the model's longest side
            // (0.3 = a screen a third as wide as the model), so the same
            // numbers read the same on any model and the screen scales with
            // it wherever it is placed. Values above 4 are pixels from before
            // this rule and are read as 96 px = the model's width.
            video: videoRaw && videoRaw.file ? {
                file: String(videoRaw.file),
                width: this.videoEffectFraction(videoRaw.width, 0.3),
                height: this.videoEffectFraction(videoRaw.height, 0.2),
                loop: videoRaw.loop !== false,
                audio: videoRaw.audio === true,
                volume: Number.isFinite(Number(videoRaw.volume)) ? Number(videoRaw.volume) : 100
            } : null,
            // When it plays: on demand (a rule or the command names it), or
            // on its own while the character is in a state, like a rule.
            trigger: triggers.indexOf(raw.trigger) >= 0 ? raw.trigger : "action",
            // An effect on one face of the model hides when that face turns
            // away; `occlude: false` keeps it drawn from every side.
            occlude: raw.occlude !== false,
            name,
            animation: Number(raw.animation) > 0 ? Math.floor(Number(raw.animation)) : 0,
            anchor: {
                part: anchorRaw.part ? String(anchorRaw.part) : "",
                offset: [0, 1, 2].map(i => Number.isFinite(Number(offsetRaw[i])) ? Number(offsetRaw[i]) : 0)
            },
            scale: this.readScale(raw.scale, 1),
            rotate: [0, 1, 2].map(i => {
                const raw3 = Array.isArray(raw.rotate) ? raw.rotate : [];
                const value = Number(raw3[i]);
                return Number.isFinite(value) ? value : 0;
            }),
            loop: raw.loop === true,
            se: null,
            flash: null
        };
        if (raw.se && raw.se.name) {
            effect.se = {
                name: String(raw.se.name),
                volume: Number.isFinite(Number(raw.se.volume)) ? Number(raw.se.volume) : 90,
                pitch: Number.isFinite(Number(raw.se.pitch)) ? Number(raw.se.pitch) : 100,
                pan: Number.isFinite(Number(raw.se.pan)) ? Number(raw.se.pan) : 0
            };
        }
        if (raw.flash && typeof raw.flash === "object") {
            const color = Array.isArray(raw.flash.color) ? raw.flash.color : [];
            effect.flash = {
                target: raw.flash.target === "model" ? "model" : "screen",
                color: [0, 1, 2, 3].map(i => {
                    const channel = Number(color[i]);
                    return Number.isFinite(channel) ? Math.min(255, Math.max(0, Math.floor(channel))) : (i === 3 ? 180 : 255);
                }),
                duration: Number(raw.flash.duration) > 0 ? Math.floor(Number(raw.flash.duration)) : 20
            };
        }
        effects.push(effect);
    }
    return effects;
};

/**
 * The light a light-type effect carries: the map-light fields, bounded the
 * way `readMapLights` bounds them, plus `duration` — how many frames a
 * fired light stays on (0: until it is fired again, which switches it off).
 * Yaw and pitch are in the anchor's frame: yaw 0 aims along the anchor
 * node's own +Z, so a light on a turret turns with the turret.
 */
Reactor3D.readEffectLight = function(raw) {
    const entry = raw && typeof raw === "object" ? raw : {};
    const number = (value, fallback, min, max) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    };
    const type = entry.type === "spot" ? this.LIGHT_SPOT : entry.type === "beam" ? this.LIGHT_BEAM : this.LIGHT_POINT;
    return {
        type,
        radius: number(entry.radius, type === this.LIGHT_SPOT ? this.DEFAULT_CONE_LENGTH
            : type === this.LIGHT_BEAM ? this.DEFAULT_BEAM_LENGTH : 3, 0.1, 200),
        angle: number(entry.angle, this.DEFAULT_CONE_ANGLE, 1, 179),
        width: number(entry.width, this.DEFAULT_BEAM_WIDTH, 0.005, 5),
        yaw: number(entry.yaw, 0, -100000, 100000),
        pitch: number(entry.pitch, 0, -90, 90),
        colour: this.parseColour(entry.color !== undefined ? entry.color : (entry.colour !== undefined ? entry.colour : 0xffffff)),
        intensity: number(entry.intensity, 1, 0, 4),
        occlude: entry.occlude !== false,
        shadow: entry.shadow === true,
        body: entry.body !== false,
        flicker: number(entry.flicker, 0, 0, 1),
        pulse: entry.pulse && typeof entry.pulse === "object" ? {
            min: number(entry.pulse.min, 0.6, 0, 10),
            max: number(entry.pulse.max, 1, 0, 10),
            period: number(entry.pulse.period, 90, 2, 100000)
        } : null,
        duration: Math.max(0, Math.floor(number(entry.duration, 0, 0, 1000000)))
    };
};

/**
 * A light-type effect resolved into the compositor's shape, at its anchor:
 * the anchor's world position becomes the light's tile position and an
 * absolute height (`groundY: 0`), and the authored aim is turned by the
 * anchor node's world pose, so a light on a part aims where the part does
 * and a light on the model aims where the model faces. Yaw comes out in
 * the scene's frame, ready for the packer.
 */
Reactor3D.effectLight = function(object, effect, key) {
    if (!object || !effect || !effect.light || typeof THREE === "undefined") return null;
    const transform = this.effectAnchorTransform(object, effect, this._fxLightTransform, effect.light.type !== this.LIGHT_POINT);
    if (!transform) return null;
    this._fxLightTransform = transform;
    const world = transform.world;
    const spec = effect.light;
    // Reach and width were authored on the model as the database shows it
    // — longest side EFFECT_PREVIEW_SPAN tiles — and scale with the
    // instance, as an anchored animation does: a glow that lit a two-tile
    // console lights the nine-tile one the same way, and a light on an
    // arm mounted seven tiles up still reaches the floor.
    const extent = object.userData && object.userData.glbSize;
    const span = extent ? Math.max(extent.x || 0, extent.y || 0, extent.z || 0) : 0;
    let grow = 1;
    if (span > 0) {
        const worldScale = transform.scale.x;
        const size = worldScale * span / this.EFFECT_PREVIEW_SPAN;
        if (size > 0) grow = size;
    }
    let yaw = 0;
    let pitch = spec.pitch;
    if (spec.type !== this.LIGHT_POINT) {
        // The aim is authored in the MODEL's frame — yaw 0 is the model's
        // own forward, wherever it faces — and then turned by how far the
        // anchor part has moved from its rest pose, so a light on a turret
        // turns with the turret and a light on a head nods with the head. A
        // bone's own axes never enter it: they point wherever the rig's
        // author left them, which is nowhere an author can reason about.
        const turn = transform.turn;
        const pose = transform.pose;
        const y = (spec.yaw * Math.PI) / 180;
        const p = (spec.pitch * Math.PI) / 180;
        const aim = (this._fxLightAim || (this._fxLightAim = new THREE.Vector3()))
            .set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p))
            .applyQuaternion(turn)
            .applyQuaternion(pose);
        yaw = (Math.atan2(aim.x, aim.z) * 180) / Math.PI;
        pitch = (Math.asin(Math.max(-1, Math.min(1, aim.y))) * 180) / Math.PI;
    }
    return {
        id: key || effect.name, type: spec.type,
        x: world.x - 0.5, y: world.z - 1, height: world.y, groundY: 0,
        radius: spec.radius * grow, colour: spec.colour, intensity: spec.intensity,
        angle: spec.angle, width: spec.width * grow, yaw, pitch,
        occlude: spec.occlude, shadow: spec.shadow, body: spec.body,
        // The model the light rides. Its own geometry stands at the light's
        // origin — a screen glow sits on the screen — and must not shadow
        // the light it carries.
        carrier: object
    };
};

Reactor3D.videoEffectFraction = function(value, fallback) {
    const number = Number(value);
    if (!(number > 0)) return fallback;
    return number > 4 ? number / 96 : number;
};

/** A video effect's plane in the model's own units, from its fractions. */
Reactor3D.videoEffectSize = function(effect, extent) {
    const size = extent || { x: 1, y: 1, z: 1 };
    const span = Math.max(size.x || 0, size.y || 0, size.z || 0, 0.0001);
    return [effect.video.width * span, effect.video.height * span];
};

Reactor3D.modelEffectByName = function(effects, name) {
    if (!Array.isArray(effects) || !name) return null;
    return effects.find(effect => effect.name === String(name)) || null;
};

/**
 * Where an effect plays, in world space: the anchor part's (or bone's)
 * frame plus the offset, or the model's frame when no part is named. The
 * offset is in model units, so it scales and turns with the model.
 */
/**
 * How far an effect's anchor part is currently turned from its rest:
 * identity for an unanchored effect or a still part, the pose's own turn
 * while an animation holds it — so a screen's video turns WITH the screen
 * as the arm carrying it swings, instead of only sliding after its point.
 */
/**
 * The node a part name means on a carved model. A piece cut where several
 * authored parts overlap is NAMED after only one of them (the most specific),
 * but it carries every owner in `userData.parts` — so a lookup by node name
 * alone misses a perfectly good binding.
 */
Reactor3D.effectAnchorNode = function(object, name) {
    if (!object) return null;
    // No part means the whole model — which is the animation root when one
    // has been prepared, so a whole-model pose carries the anchor with it.
    if (!name) return object.getObjectByName("anim-root") || null;
    const named = object.getObjectByName(name);
    if (named) return named;
    let found = null;
    object.traverse(node => {
        if (found || !node.userData || !node.userData.parts) return;
        if (node.userData.parts.some(part => part && part.name === name)) found = node;
    });
    return found;
};

Reactor3D.effectAnchorQuaternion = function(object, effect, out) {
    const target = out || new THREE.Quaternion();
    target.identity();
    const part = object
        ? this.effectAnchorNode(object, effect && effect.anchor ? effect.anchor.part : "") : null;
    if (!part || !part.userData.__restQuaternion || !part.parent) return target;
    // Refresh the part and its ancestors once. getWorldQuaternion on the
    // parent would walk the same chain a second time. Keep Three's matrix
    // decomposition so scaled parents retain the existing rotation result.
    part.updateWorldMatrix(true, false);
    const scratch = this._effectQuaternionScratch || (this._effectQuaternionScratch = {
        position: new THREE.Vector3(), scale: new THREE.Vector3(), rest: new THREE.Quaternion()
    });
    part.matrixWorld.decompose(scratch.position, target, scratch.scale);
    part.parent.matrixWorld.decompose(scratch.position, scratch.rest, scratch.scale);
    scratch.rest.multiply(part.userData.__restQuaternion);
    return target.multiply(scratch.rest.invert());
};

/** Resolve one fresh attachment frame for position, scale and rotation together. */
Reactor3D.effectAnchorTransform = function(object, effect, out, wantPose = true) {
    if (!object || typeof THREE === 'undefined') return null;
    const result = out || { world: new THREE.Vector3(), scale: new THREE.Vector3(),
        turn: new THREE.Quaternion(), pose: new THREE.Quaternion(),
        position: new THREE.Vector3(), scratchScale: new THREE.Vector3(), rest: new THREE.Quaternion() };
    const part = this.effectAnchorNode(object, effect?.anchor?.part || '');
    const node = part || object;
    node.updateWorldMatrix(true, false);
    const offset = effect?.anchor?.offset || [0, 0, 0];
    result.world.set(offset[0] || 0, offset[1] || 0, offset[2] || 0).applyMatrix4(node.matrixWorld);
    object.matrixWorld.decompose(result.position, result.turn, result.scale);
    result.pose.identity();
    if (wantPose && part?.userData.__restQuaternion && part.parent) {
        part.matrixWorld.decompose(result.position, result.pose, result.scratchScale);
        part.parent.matrixWorld.decompose(result.position, result.rest, result.scratchScale);
        result.rest.multiply(part.userData.__restQuaternion);
        result.pose.multiply(result.rest.invert());
    }
    return result;
};

Reactor3D.effectAnchorWorld = function(object, effect, out) {
    if (!object || typeof THREE === "undefined") return null;
    const target = out || new THREE.Vector3();
    const offset = effect && effect.anchor ? effect.anchor.offset : [0, 0, 0];
    target.set(offset[0] || 0, offset[1] || 0, offset[2] || 0);
    const part = this.effectAnchorNode(object, effect && effect.anchor ? effect.anchor.part : "");
    // localToWorld updates this node and its ancestors itself.
    return (part || object).localToWorld(target);
};

/** Optional semantic points, authored in the same bone/part frame as effects. */
Reactor3D.readModelLandmarks = function(json) {
    const source = json && json.landmarks;
    const points = {};
    for (const name of ["eyes", "mouth", "upperLip", "lowerLip"]) {
        const point = source && source[name];
        if (!point || !Array.isArray(point.offset) || point.offset.length !== 3
            || !point.offset.every(value => typeof value === "number" && Number.isFinite(value))) continue;
        points[name] = { part: typeof point.part === "string" ? point.part : "", offset: point.offset.slice() };
        if (name === "mouth") {
            if (point.interior === "none" || point.interior === "dark") points[name].interior = point.interior;
            if (typeof point.interiorColor === "string" && /^#[0-9a-f]{6}$/i.test(point.interiorColor)) points[name].interiorColor = point.interiorColor;
        }
    }
    return points;
};

/** Resolve named nodes once when the instance is built, never scan meshes per frame. */
Reactor3D.landmarkNode = function(object, name) {
    if (!name) return this.effectAnchorNode(object, "") || object;
    // Rebinding an imported mesh can leave the original export's same-named
    // nodes in the tree. Follow the skeleton that actually deforms the mesh.
    let bone = null;
    object.traverse(node => {
        if (!bone && node.isSkinnedMesh && node.skeleton) {
            bone = node.skeleton.bones.find(entry => entry.name === name) || null;
        }
    });
    return bone || this.effectAnchorNode(object, name);
};

Reactor3D.bindModelLandmarks = function(object, points) {
    object.__reactorEyeRoot = this.effectAnchorNode(object, "") || object;
    const bound = object.__reactorLandmarks = {};
    for (const name of Object.keys(points || {})) {
        const point = points[name];
        const node = this.landmarkNode(object, point.part);
        // A removed/renamed bone must not reinterpret its local offset at the feet.
        if (point.part && !node) continue;
        bound[name] = { node: node || object, offset: point.offset.slice() };
    }
    // Rest-space landmarks and mesh transforms are captured once for optional
    // procedural lip morphs; animated vertices are never scanned per frame.
    const rest = object.__reactorLandmarkRest = { points: {}, meshes: [] };
    rest.interior = points?.mouth?.interior === "none" ? "none" : "dark";
    rest.interiorColor = /^#[0-9a-f]{6}$/i.test(points?.mouth?.interiorColor || "") ? points.mouth.interiorColor : "#080808";
    object.updateWorldMatrix(true, false);
    // SkinnedMesh refreshes bindMatrixInverse in updateMatrixWorld, not
    // updateWorldMatrix. A freshly cloned/import-scaled mesh otherwise keeps
    // its old inverse until the first render and speech samples the wrong size.
    object.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(object.matrixWorld).invert();
    for (const name of Object.keys(bound)) {
        const point = this.modelLandmarkWorld(object, name, new THREE.Vector3());
        rest.points[name] = point.applyMatrix4(inverse);
    }
    if (bound.mouth) object.traverse(mesh => {
        if (mesh.isMesh && !mesh.userData.__reactorOverlay) {
            const entry = { mesh, matrix: new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld) };
            if (mesh.isSkinnedMesh && mesh.skeleton) entry.skin = {
                bind: mesh.bindMatrix.clone(), inverse: mesh.bindMatrixInverse.clone(),
                matrices: mesh.skeleton.bones.map((bone, i) => new THREE.Matrix4()
                    .multiplyMatrices(bone.matrixWorld, mesh.skeleton.boneInverses[i]))
            };
            rest.meshes.push(entry);
        }
    });
};

Reactor3D.modelLandmarkWorld = function(object, name, out) {
    const point = object && object.__reactorLandmarks && object.__reactorLandmarks[name];
    if (!point) return null;
    return point.node.localToWorld((out || new THREE.Vector3()).fromArray(point.offset));
};

/** Queue a named effect on a character's model, played on its next frame. */
Reactor3D.playModelEffect = function(character, name) {
    if (!name) return;
    if (!this._modelEffectQueue) this._modelEffectQueue = {};
    const key = this.modelInstanceKey(character);
    (this._modelEffectQueue[key] || (this._modelEffectQueue[key] = [])).push(String(name));
};

/**
 * Whether any model animation is still playing or queued: for one
 * character, or — with no character — anywhere on the map. The scoped
 * Wait for 3D command holds on this.
 */
Reactor3D.modelAnimationsBusy = function(character) {
    if (character) {
        const key = this.modelInstanceKey(character);
        const queue = this._modelActions && this._modelActions[key];
        if (Array.isArray(queue) && queue.some(entry => entry && entry.name)) return true;
        const holder = this.modelHolderFor ? this.modelHolderFor(character) : null;
        return !!(holder && holder.action);
    }
    if (this._modelActions) {
        for (const key of Object.keys(this._modelActions)) {
            const queue = this._modelActions[key];
            if (Array.isArray(queue) ? queue.some(entry => entry && entry.name) : !!queue) return true;
        }
    }
    const spriteset = typeof SceneManager !== "undefined" && SceneManager._scene
        ? SceneManager._scene._spriteset : null;
    const scene = spriteset && spriteset._reactor3d && spriteset._reactor3d.scene;
    if (scene && scene._modelInstances) {
        for (const holder of scene._modelInstances.values()) {
            if (holder && holder.action) return true;
        }
    }
    return false;
};

/** The wait modes that hold a script in the background: the world never freezes for these. */
Reactor3D.BACKGROUND_WAIT_MODES = ["reactorScopedWait", "reactorModelAnimation"];

/** Whether a scoped wait still holds, whatever it watches. */
Reactor3D.scopedWaitHolding = function(wait) {
    if (!wait) return false;
    const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
    if (frame >= wait.deadline) return false;
    if (wait.mode === "duration") return frame < wait.until;
    if (wait.mode === "switch") {
        return typeof $gameSwitches !== "undefined" && $gameSwitches
            && $gameSwitches.value(wait.switchId) !== wait.switchValue;
    }
    if (wait.mode === "variable") {
        if (typeof $gameVariables === "undefined" || !$gameVariables) return false;
        const current = Number($gameVariables.value(wait.variableId)) || 0;
        const value = wait.value;
        switch (wait.op) {
            case "=": return !(current === value);
            case ">": return !(current > value);
            case "<": return !(current < value);
            case "<=": return !(current <= value);
            case "!=": return !(current !== value);
            default: return !(current >= value);
        }
    }
    return this.scopedActionsBusy(wait.character);
};

/** What a scoped wait watches: the animation queue, and for one character a forced route too. */
Reactor3D.scopedActionsBusy = function(character) {
    if (this.modelAnimationsBusy(character)) return true;
    if (character && character.isMoveRouteForcing && character.isMoveRouteForcing()) return true;
    return false;
};

/** Whether a Play Model Animation wait is still holding. */
Reactor3D.modelAnimationWaiting = function(wait) {
    if (!wait || !wait.character || !wait.name) return false;
    const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
    if (frame >= wait.deadline) return false;
    const key = this.modelInstanceKey(wait.character);
    const pending = this._modelActions && this._modelActions[key];
    if (Array.isArray(pending) && pending.some(entry => entry && entry.name === wait.name)) return true;
    const holder = this.modelHolderFor ? this.modelHolderFor(wait.character) : null;
    const action = holder && holder.action;
    if (action && action.name === wait.name) {
        if (!wait.started) {
            wait.started = true;
            wait.startedFrame = action.frame;
            return true;
        }
        // A repeat restarted: one full play has finished; the wait lets go.
        return action.frame === wait.startedFrame;
    }
    // Neither queued nor playing: over, or the name matched nothing.
    return false;
};

Reactor3D.takeModelEffects = function(character) {
    const queue = this._modelEffectQueue;
    if (!queue) return [];
    const key = this.modelInstanceKey(character);
    const names = queue[key] || [];
    delete queue[key];
    return names;
};

/** Fire one named effect: sound and flash at once, the animation at its anchor. */
Reactor3D.fireNamedEffect = function(effect, character, holder) {
    if (!effect) return;
    if (effect.se && typeof AudioManager !== "undefined") {
        AudioManager.playSe(effect.se);
    }
    if (effect.flash) {
        if (effect.flash.target === "screen") {
            if (typeof $gameScreen !== "undefined") $gameScreen.startFlash(effect.flash.color.slice(), effect.flash.duration);
        } else if (holder) {
            holder.flash = { color: effect.flash.color, duration: effect.flash.duration, t: 0 };
        }
    }
    if (effect.type === "video" && effect.video) this.spawnVideoEffect(effect, character, holder);
    else if (effect.type === "light" && effect.light) this.fireEffectLight(effect, holder);
    else if (effect.animation > 0) this.spawnAnchoredAnimation(effect, character, holder);
};

//-----------------------------------------------------------------------------
// Light effects: a light riding a model's anchor. Live ones sit on the
// holder as `holder.lights[name] = { effect, until }`, `until` the frame
// it goes out (0: until something switches it off), and every frame's
// `collectLights` reads them through `effectLight` at the anchor's current
// place and turn.

Reactor3D.currentFrame = function() {
    return typeof Graphics !== "undefined" && Graphics.frameCount ? Graphics.frameCount : 0;
};

/** Switch a light effect on (for `until` frames, or open-ended) or off. */
Reactor3D.setEffectLight = function(holder, effect, on, until) {
    if (!holder || !effect || !effect.light) return;
    if (!holder.lights) holder.lights = {};
    if (on) holder.lights[effect.name] = { effect, until: until || 0 };
    else delete holder.lights[effect.name];
};

/**
 * Firing a light effect: with a duration it burns that long and a refire
 * restarts the clock; without one it is a switch, and firing again turns
 * it off.
 */
Reactor3D.fireEffectLight = function(effect, holder) {
    if (!holder || !effect || !effect.light) return;
    const duration = effect.light.duration;
    if (duration > 0) {
        this.setEffectLight(holder, effect, true, this.currentFrame() + duration);
        return;
    }
    const live = holder.lights && holder.lights[effect.name];
    this.setEffectLight(holder, effect, !live, 0);
};

/** Drop the timed lights whose frame has come. */
Reactor3D.expireEffectLights = function(holder, frame) {
    const lights = holder && holder.lights;
    if (!lights) return;
    for (const name in lights) {
        const entry = lights[name];
        if (entry && entry.until > 0 && frame >= entry.until) delete lights[name];
    }
};

/** Script access: a named light effect on a character's model, on or off. */
Reactor3D.setModelEffectLight = function(character, name, on) {
    const holder = this.modelHolderFor ? this.modelHolderFor(character) : null;
    const effect = holder ? this.modelEffectByName(holder.effects, name) : null;
    if (!effect || effect.type !== "light") return false;
    this.setEffectLight(holder, effect, !!on, 0);
    return true;
};

/** The scene's model instances, when a 3D map is up. */
Reactor3D.modelInstances = function() {
    const spriteset = typeof SceneManager !== "undefined" && SceneManager._scene
        ? SceneManager._scene._spriteset : null;
    const scene = spriteset && spriteset._reactor3d && spriteset._reactor3d.scene;
    return scene && scene._modelInstances ? scene._modelInstances : (spriteset?._reactorFlatModelInstances || null);
};

/** Whether any placed model has a light effect burning right now. Allocation-free. */
Reactor3D.hasLiveEffectLights = function() {
    const instances = this.modelInstances();
    if (!instances) return false;
    for (const holder of instances.values()) {
        const lights = holder && holder.lights;
        if (!lights) continue;
        for (const name in lights) if (lights[name]) return true;
    }
    return false;
};

/**
 * This frame's lights from every placed model's live light effects, in
 * the compositor's shape, at their anchors, breathing like the map's own.
 */
Reactor3D.modelEffectLights = function() {
    const instances = this.modelInstances();
    if (!instances) return [];
    const out = [];
    const frame = this.currentFrame();
    let seed = 1000;
    for (const [key, holder] of instances) {
        const lights = holder && holder.lights;
        if (!lights || !holder.object) continue;
        for (const name in lights) {
            const entry = lights[name];
            seed++;
            if (!entry || !entry.effect || !entry.effect.light) continue;
            if (entry.until > 0 && frame >= entry.until) continue;
            const light = this.effectLight(holder.object, entry.effect, key + ":" + name);
            if (!light) continue;
            if (holder.flat) {
                const point = this.flatModelAnchor(holder, entry.effect, this._flatLightPoint || (this._flatLightPoint = {}));
                if (!point) continue;
                const tile = $gameMap.tileWidth(), grow = holder.unit / tile;
                light.x = point.x / tile + $gameMap.displayX();
                light.y = point.y / $gameMap.tileHeight() + $gameMap.displayY();
                light.height = 0;
                light.radius *= grow; light.width *= grow;
            }
            const animated = this.animateLight(entry.effect.light, frame, seed, light.radius, light.intensity);
            light.radius = animated.radius;
            light.intensity = animated.intensity;
            light.priorityRadius = animated.priorityRadius;
            light.priorityIntensity = animated.priorityIntensity;
            out.push(light);
        }
    }
    return out;
};

/** The 3D scene's instance for a character, when the map draws one. */
Reactor3D.modelHolderFor = function(character) {
    const spriteset = typeof SceneManager !== "undefined" && SceneManager._scene
        ? SceneManager._scene._spriteset : null;
    const scene = spriteset && spriteset._reactor3d && spriteset._reactor3d.scene;
    const instances = scene?._modelInstances || spriteset?._reactorFlatModelInstances;
    return character && instances ? instances.get(this.modelInstanceKey(character)) || null : null;
};

/**
 * A video effect is a video surface bound to the character, with the
 * effect's anchor riding along so the plane sits on the model — the
 * surface system draws it, plays it and stops it.
 */
Reactor3D.VIDEO_EFFECT_ID_BASE = 900000;

Reactor3D.videoEffectId = function(character, effect) {
    let hash = 0;
    const text = this.modelInstanceKey(character) + ":" + effect.name;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) & 0x7fffffff;
    return this.VIDEO_EFFECT_ID_BASE + (hash % 90000);
};

Reactor3D.spawnVideoEffect = function(effect, character, holder) {
    const surfaces = typeof RPGReactorMediaSurfaces !== "undefined" ? RPGReactorMediaSurfaces : null;
    if (!surfaces || !surfaces.manager || !character || !character.eventId && !(typeof Game_Player !== "undefined" && character instanceof Game_Player)) return;
    const video = effect.video;
    const id = this.videoEffectId(character, effect);
    const axes = this.scaleAxes(effect.scale);
    // The surface itself is sized in pixels; the anchor carries the model
    // units and the placement scales the plane to them each frame.
    const tile = typeof $gameMap !== "undefined" && $gameMap && $gameMap.tileWidth ? $gameMap.tileWidth() : 48;
    surfaces.manager.show({
        id, file: video.file,
        target: character.eventId ? "event" : "player",
        eventId: character.eventId ? character.eventId() : 0,
        width: tile, height: tile * (video.height / video.width),
        loop: video.loop, muted: !video.audio, volume: video.volume,
        rotationX: effect.rotate ? effect.rotate[0] : 0,
        rotationY: effect.rotate ? effect.rotate[1] : 0,
        rotationZ: effect.rotate ? effect.rotate[2] : 0,
        scaleX: axes[0], scaleY: axes[1],
        anchor: { part: effect.anchor.part, offset: effect.anchor.offset.slice(),
            size: this.videoEffectSize(effect, holder && holder.object && holder.object.userData.glbSize) }
    }, null);
    if (holder) {
        if (!holder.videos) holder.videos = {};
        holder.videos[effect.name] = id;
    }
};

Reactor3D.stopVideoEffect = function(effect, character, holder) {
    const surfaces = typeof RPGReactorMediaSurfaces !== "undefined" ? RPGReactorMediaSurfaces : null;
    if (!surfaces || !surfaces.manager) return;
    const id = holder && holder.videos && holder.videos[effect.name];
    if (id) {
        surfaces.manager.stop({ id });
        delete holder.videos[effect.name];
    }
};

/**
 * Play a database animation at an effect's anchor on a placed model.
 *
 * The stock pipeline positions an animation on its target sprite, so the
 * target here is a stand-in sprite that `updateAnchoredAnimations` moves
 * to the anchor's screen position every frame. Without a scene to project
 * through (a flat map) the animation plays on the character as before.
 */
Reactor3D.spawnAnchoredAnimation = function(effect, character, holder) {
    const spriteset = typeof SceneManager !== "undefined" && SceneManager._scene
        ? SceneManager._scene._spriteset : null;
    const animation = typeof $dataAnimations !== "undefined" ? $dataAnimations[effect.animation] : null;
    if (!spriteset || !animation || !character) return;
    const object = holder && holder.object;
    if (!object || !spriteset._effectsContainer || !spriteset.createAnimationSprite) {
        if (typeof $gameTemp !== "undefined" && $gameTemp.requestAnimation) $gameTemp.requestAnimation([character], effect.animation);
        return;
    }
    const standIn = new Sprite();
    standIn.visible = false;
    spriteset._effectsContainer.addChild(standIn);
    // The stock factory returns nothing; the sprite it made is the newest
    // entry of the spriteset's own list.
    const list = spriteset._animationSprites || [];
    const count = list.length;
    const previousContext = this._spawningEffectContext;
    try {
        this._spawningEffectContext = animation.effectName ? this.GpuEffects.forViewport(spriteset._reactor3d?.viewport) : null;
        spriteset.createAnimationSprite([character], animation, false, 0);
    } finally { this._spawningEffectContext = previousContext; }
    const sprite = list.length > count ? list[list.length - 1] : null;
    if (!sprite) {
        spriteset._effectsContainer.removeChild(standIn);
        return;
    }
    sprite._targets = [standIn];
    // Placed on its anchor now; the per-frame pass keeps it there.
    this.placeStandIn(holder, effect, standIn);
    // The effect's own turn and size ride on the database record's, on a
    // copy: the record is shared by every other place that plays it.
    // The model's own turn joins the effect's, so a screen placed on a
    // console faces the way the console does.
    const modelYaw = holder && holder.object ? holder.object.rotation.y * 180 / Math.PI : 0;
    const turned = (effect.rotate && effect.rotate.some(value => value)) || Math.abs(modelYaw) > 0.01;
    // Sized against the model: scale 1 is a model-sized frame, on this
    // instance, so a tower placed twenty tiles tall carries its effect
    // twenty tiles tall too.
    const model = this.effectModelScale(object);
    const axes = this.scaleAxes(effect.scale).map(value => value * model);
    // An MV sheet has no scale record to carry the factor; its sprite is
    // scaled through the stand-in instead.
    standIn._reactorExtra = animation.effectName ? 1 : axes[0];
    const proportional = !Array.isArray(effect.scale);
    if (turned || axes.some(value => value !== 1)) {
        const rotation = animation.rotation || { x: 0, y: 0, z: 0 };
        sprite._animation = Object.assign({}, animation, {
            rotation: {
                x: (rotation.x || 0) + (effect.rotate ? effect.rotate[0] : 0),
                y: (rotation.y || 0) + (effect.rotate ? effect.rotate[1] : 0) + modelYaw,
                z: (rotation.z || 0) + (effect.rotate ? effect.rotate[2] : 0)
            },
            scale: (animation.scale || 100) * (proportional ? axes[0] : 1)
        });
        if (!proportional && sprite.updateEffectGeometry) {
            // The stock geometry pass scales uniformly; a free scale is put
            // on the handle after it, per axis.
            const base = sprite.updateEffectGeometry;
            sprite.updateEffectGeometry = function() {
                base.call(this);
                if (!this._handle) return;
                const uniform = (this._animation.scale / 100) * (this.reactor3DScale ? this.reactor3DScale() : 1);
                this._handle.setScale(uniform * axes[0], uniform * axes[1], uniform * axes[2]);
            };
        }
    }
    if (!holder.anchored) holder.anchored = [];
    const entry = { effect, sprite, standIn, loop: effect.loop, character };
    // An Effekseer effect on a 3D map is drawn inside the scene instead of
    // on the overlay: at the anchor, in world units, behind what is in
    // front of it. The sprite stays for its timings.
    const viewport = spriteset._reactor3d ? spriteset._reactor3d.viewport : null;
    if (viewport && animation.effectName) {
        const play = this.EffekseerScene.begin(viewport, animation, sprite);
        if (play) {
            entry.fx3d = play;
            // The box tracker outlives the play: an Always effect restarts
            // every few seconds, and a fresh tracker would draw the whole
            // frame (small, stretched) until it had looked again.
            const tracks = holder._fxTracks || (holder._fxTracks = Object.create(null));
            const key = effect.name || `#${animation.id}`;
            play.track = tracks[key] || (tracks[key] = this.EffekseerScene.boxTracker());
            // World units: the authored scale only. The screen factor in
            // `axes` is for the overlay's screen-relative drawing rule.
            entry.axes = this.scaleAxes(effect.scale);
            entry.rotate = [
                ((animation.rotation && animation.rotation.x) || 0) + (effect.rotate ? effect.rotate[0] : 0),
                ((animation.rotation && animation.rotation.y) || 0) + (effect.rotate ? effect.rotate[1] : 0) + modelYaw,
                ((animation.rotation && animation.rotation.z) || 0) + (effect.rotate ? effect.rotate[2] : 0)
            ];
            sprite.visible = false;
        }
    }
    holder.anchored.push(entry);
};

Reactor3D.MAX_ANCHORED_PER_MODEL = 8;

/*
 * Anchored Effekseer effects, in the 3D scene.
 *
 * The game's animation sprites draw on a 2D overlay above everything, so an
 * effect on a model could never go behind the model's own struts or a wall,
 * and its place came from projecting the anchor with last frame's camera.
 * Effekseer cannot draw on the scene's WebGL 2 context (its programs are
 * WebGL 1), and a second Effekseer context fights the first over one global
 * object table. So the effect stays on the overlay's own context: its
 * sprite's handle is drawn - during the update, before the game renders -
 * from the scene's camera into a corner of the overlay canvas, that corner
 * is copied into a texture, and the overlay is cleared again by the frame's
 * ordinary overlay pass. The texture goes into the scene as a screen-sized
 * quad standing at the anchor's depth: the effect lands exactly where the
 * anchor is, and whatever the scene has in front of the anchor hides it.
 * Cost: one draw and one canvas copy per live effect per frame, of the
 * effect's own screen rectangle at full resolution (`screenRect`): the
 * anchor and the effect's model-relative frame project to a box, only
 * that box is drawn and copied, and the quad maps it back to the same
 * screen pixels. A box past `BUDGET` of the screen is rendered smaller
 * instead, so a screen-filling effect never costs more than a quarter
 * screen of pixels. The sprite itself stays hidden and keeps the record's
 * sound and flash timings and its lifetime.
 */
/** Attached effects stay on the view's GPU; normal screen effects retain their overlay. */
Reactor3D.GpuEffects = {
    enabled: true,
    _runtime: new Map(),
    _reads: new Set(),
    restoreDefault() {
        if (typeof Graphics !== 'undefined') Graphics.effekseer?._makeContextCurrent?.();
    },
    create(renderer, samples) {
        if (!this.enabled || !renderer || typeof effekseer === 'undefined') return null;
        const gl = renderer.getContext();
        if (!gl || typeof gl.fenceSync !== 'function' || gl.isContextLost()) return null;
        // Match the original context's antialiasing, including a device that supplies none.
        samples = Math.max(0, samples || 0);
        if (samples && !Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES)).includes(samples)) return null;
        let context;
        try {
            renderer.resetState();
            context = effekseer.createContext();
            context.init(gl);
            // This pass owns GL until it invalidates Three/PIXI's caches below.
            context.setRestorationOfStatesFlag(false);
            return { renderer, gl, context, samples, cache: new Map(), targets: new Set(), disposed: false, loading: 0 };
        } catch (error) {
            if (context) { try { context._makeContextCurrent(); effekseer.releaseContext(context); } catch (_) {} }
            return null;
        } finally { this.restoreDefault(); renderer.resetState(); }
    },
    forViewport(viewport) {
        if (!this.enabled || !viewport?._shared) return null;
        const renderer = viewport.renderer();
        let entry = this._runtime.get(renderer);
        if (entry) return entry.disposed ? null : entry;
        const gl = Graphics._effekseerGL;
        entry = this.create(renderer, gl.getParameter(gl.SAMPLES));
        if (entry) { entry.viewport = viewport; this._runtime.set(renderer, entry); }
        viewport._resetPixi();
        return entry;
    },
    load(entry, name) {
        if (!name || entry.disposed) return null;
        if (entry.cache.has(name)) return entry.cache.get(name);
        entry.loading++;
        try {
            entry.context._makeContextCurrent();
            const url = EffectManager.makeUrl(name);
            const effect = entry.context.loadEffect(url, 1, () => this.loaded(entry), () => {
                const cancelled = entry.disposed; this.loaded(entry); if (!cancelled) EffectManager.onError(url);
            });
            entry.cache.set(name, effect);
            return effect;
        } catch (error) { this.loaded(entry); throw error; }
        finally { this.restoreDefault(); }
    },
    loaded(entry) {
        entry.loading = Math.max(0, entry.loading - 1);
        if (entry.disposed && !entry.loading) this.releaseContext(entry);
        this.restoreDefault();
    },
    update() {
        try {
            for (const entry of this._runtime.values()) {
                if (!entry.disposed && !entry.gl.isContextLost()) { entry.context._makeContextCurrent(); entry.context.update(); }
            }
        } finally { this.restoreDefault(); }
    },
    release(entry) {
        if (!entry || entry.disposed) return;
        entry.disposed = true;
        if (this._runtime.get(entry.renderer) === entry) this._runtime.delete(entry.renderer);
        for (const read of Array.from(this._reads)) if (read.entry === entry) read.cancel();
        for (const target of entry.targets) target.dispose();
        entry.targets.clear();
        entry.colourMaterial?.dispose(); entry.colourMesh?.geometry.dispose();
        entry.cache.clear();
        // Native image callbacks finish their reload before invoking loaded(); keep
        // the native context alive until then rather than reloading a freed pointer.
        if (!entry.loading) this.releaseContext(entry);
    },
    releaseContext(entry) {
        if (entry.released) return; entry.released = true;
        try { entry.context._makeContextCurrent(); effekseer.releaseContext(entry.context); }
        finally { this.restoreDefault(); entry.renderer.resetState(); }
    },
    target(entry, holder, width, height, colour = false) {
        const key = colour ? '_gpuColourTarget' : '_gpuEffectTarget';
        let target = holder[key];
        if (!target) {
            target = holder[key] = new THREE.WebGLRenderTarget(width, height, {
                minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: !colour,
                stencilBuffer: false, generateMipmaps: false, samples: colour ? 0 : entry.samples
            });
            if (colour) target.texture.colorSpace = THREE.SRGBColorSpace;
            entry.targets.add(target);
            target.addEventListener('dispose', () => entry.targets.delete(target));
        } else if (target.width !== width || target.height !== height) {
            target.setSize(width, height);
            entry.targets.add(target);
        }
        return target;
    },
    draw(entry, holder, width, height, box, projection, view, handle, premultiplied = false) {
        if (entry.disposed || entry.gl.isContextLost()) return null;
        const renderer = entry.renderer, gl = entry.gl, context = entry.context;
        const previous = renderer.getRenderTarget(), target = this.target(entry, holder, width, height);
        try {
            renderer.resetState(); renderer.setRenderTarget(target);
            for (const flag of [gl.STENCIL_TEST, gl.RASTERIZER_DISCARD, gl.SAMPLE_ALPHA_TO_COVERAGE, gl.SAMPLE_COVERAGE]) gl.disable(flag);
            gl.colorMask(true, true, true, true); gl.depthMask(true); gl.clearDepth(1);
            gl.viewport(box.x, box.y, box.width, box.height);
            gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, width, height);
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            context._makeContextCurrent(); context.setProjectionMatrix(projection); context.setCameraMatrix(view);
            context.beginDraw(); if (handle?.exists) context.drawHandle(handle); context.endDraw();
            gl.disable(gl.SCISSOR_TEST);
            if (target.samples) {
                const props = renderer.properties.get(target);
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, props.__webglMultisampledFramebuffer);
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, props.__webglFramebuffer);
                gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
            }
            return this.convert(entry, holder, target, premultiplied);
        } finally {
            renderer.resetState(); renderer.setRenderTarget(previous);
            entry.viewport?._resetPixi(); this.restoreDefault();
        }
    },
    convert(entry, holder, source, premultiplied) {
        const renderer = entry.renderer;
        const target = this.target(entry, holder, source.width, source.height, true);
        if (!entry.colourMaterial) {
            entry.colourMaterial = new THREE.ShaderMaterial({
                uniforms: { map: { value: null }, premultiplied: { value: 0 } },
                vertexShader: 'varying vec2 tc;void main(){tc=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
                // A linear native attachment keeps Effekseer's encoded bytes unchanged.
                // Decode once at its own resolution, then let the sRGB attachment encode
                // for storage. The quad can use the original hardware sRGB filtering.
                fragmentShader: 'varying vec2 tc;uniform sampler2D map;uniform float premultiplied;void main(){vec4 c=texture2D(map,tc);' +
                    'if(premultiplied>0.5)c.rgb=c.a>0.0?clamp(floor(c.rgb/c.a*255.0+0.5)/255.0,0.0,1.0):vec3(0.0);' +
                    'c.rgb=mix(pow(c.rgb*0.9478672986+0.0521327014,vec3(2.4)),c.rgb*0.0773993808,lessThanEqual(c.rgb,vec3(0.04045)));gl_FragColor=c;}',
                depthTest: false, depthWrite: false, blending: THREE.NoBlending
            });
            entry.colourMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), entry.colourMaterial);
            entry.colourMesh.frustumCulled = false;
            entry.colourScene = new THREE.Scene(); entry.colourScene.add(entry.colourMesh);
            entry.colourCamera = new THREE.Camera();
        }
        entry.colourMaterial.uniforms.map.value = source.texture;
        entry.colourMaterial.uniforms.premultiplied.value = premultiplied ? 1 : 0;
        renderer.resetState(); renderer.setRenderTarget(target);
        renderer.render(entry.colourScene, entry.colourCamera);
        return target;
    },
    bindQuad(quad, target) {
        if (quad.texture === target.texture) return;
        quad.texture.dispose(); quad.texture = target.texture;
        quad.material.uniforms.map.value = target.texture;
        quad.material.uniforms.flip.value = 0;
    },
    /** Never wait on the GPU on the main thread, including timeout and context-loss paths. */
    read(entry, target, callback) {
        if (entry.disposed || entry.gl.isContextLost() || this._reads.size >= 4) return false;
        const gl = entry.gl, width = target.width, height = target.height;
        const previous = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), pack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
        const buffer = gl.createBuffer(); let fence, timer, finished = false;
        const read = { entry, cancel: () => finish(null) };
        const finish = pixels => {
            if (finished) return; finished = true; clearTimeout(timer);
            if (fence) gl.deleteSync(fence); if (buffer) gl.deleteBuffer(buffer);
            this._reads.delete(read); callback(pixels, width, height);
        };
        try {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, entry.renderer.properties.get(target).__webglFramebuffer);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer); gl.bufferData(gl.PIXEL_PACK_BUFFER, width * height * 4, gl.STREAM_READ);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
            fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
        } catch (_) { finish(null); return false; }
        finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous); }
        if (!fence) { finish(null); return false; }
        this._reads.add(read);
        const deadline = performance.now() + 2000;
        const poll = () => {
            if (finished) return;
            if (entry.disposed || gl.isContextLost() || performance.now() >= deadline) { finish(null); return; }
            const result = gl.clientWaitSync(fence, 0, 0);
            if (result === gl.TIMEOUT_EXPIRED) { timer = setTimeout(poll, 4); return; }
            if (result !== gl.ALREADY_SIGNALED && result !== gl.CONDITION_SATISFIED) { finish(null); return; }
            const saved = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
            let pixels = null;
            try { pixels = new Uint8Array(width * height * 4); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels); }
            catch (_) { pixels = null; }
            finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, saved); }
            finish(pixels);
        };
        timer = setTimeout(poll, 4); return true;
    },
    downsample(pixels, width, height, mw, mh) {
        const source = this._source || (this._source = document.createElement('canvas'));
        const mini = this._mini || (this._mini = document.createElement('canvas'));
        source.width = width; source.height = height; mini.width = mw; mini.height = mh;
        const flipped = new Uint8ClampedArray(pixels.length), row = width * 4;
        for (let y = 0; y < height; y++) flipped.set(pixels.subarray(y * row, (y + 1) * row), (height - y - 1) * row);
        source.getContext('2d').putImageData(new ImageData(flipped, width, height), 0, 0);
        const context = mini.getContext('2d', { willReadFrequently: true });
        context.drawImage(source, 0, 0, mw, mh);
        return context.getImageData(0, 0, mw, mh).data;
    },
    measure(play, entry, target, rect, width, height, anchor, pxPerUnit, limit, upY) {
        const M = Reactor3D.EffectMeasure, track = play.track;
        if (track._measurePending || M._pending.size >= 4) return;
        const mw = Math.max(1, Math.min(64, Math.round(64 * rect.w / Math.max(rect.w, rect.h))));
        const mh = Math.max(1, Math.min(64, Math.round(64 * rect.h / Math.max(rect.w, rect.h))));
        const id = ++M._serial, job = { play, track, frame: play.frames, mw, mh,
            args: [{ ...rect }, width, height, { ...anchor }, pxPerUnit, limit, upY] };
        M._pending.set(id, job); track._measurePending = id;
        const queued = this.read(entry, target, (pixels, sourceWidth, sourceHeight) => {
            if (!pixels || play.done || play.track !== track || !M._pending.has(id)) { M.finish(id); return; }
            try {
                if (M.enabled && !M._failed && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
                    if (!M._worker) {
                        M._worker = new Worker(Reactor3D.workerUrl('reactor_effect_measure_worker.js'), { name: 'Reactor effect coverage' });
                        M._worker.onmessage = event => M.receive(event.data);
                        M._worker.onerror = M._worker.onmessageerror = () => M.fail();
                    }
                    M._worker.postMessage({ id, pixels, sourceWidth, sourceHeight, width: mw, height: mh }, [pixels.buffer]);
                    return;
                }
            } catch (_) { M.fail(); }
            M.finish(id);
            const data = this.downsample(pixels, sourceWidth, sourceHeight, mw, mh);
            if (Reactor3D.EffekseerScene.measurePixels(track, data, mw, mh, ...job.args)) play.lastLit = job.frame;
        });
        if (!queued) M.finish(id);
    }
};

/** Effect coverage is advisory; drawing never waits for a readback. */
Reactor3D.EffectMeasure = {
    enabled: true,
    _pending: new Map(),
    _serial: 0,
    request(play, source, rect, width, height, anchor, pxPerUnit, limit, upY) {
        if (!this.enabled || this._failed || typeof Worker === 'undefined'
            || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return false;
        if (play.track._measurePending || this._pending.size >= 4) return true;
        try {
            if (!this._worker) {
                const url = Reactor3D.workerUrl('reactor_effect_measure_worker.js');
                this._worker = new Worker(url, { name: 'Reactor effect coverage' });
                this._worker.onmessage = event => this.receive(event.data);
                this._worker.onerror = () => this.fail();
                this._worker.onmessageerror = () => this.fail();
            }
            const mw = Math.max(1, Math.min(64, Math.round(64 * rect.w / Math.max(rect.w, rect.h))));
            const mh = Math.max(1, Math.min(64, Math.round(64 * rect.h / Math.max(rect.w, rect.h))));
            const id = ++this._serial, track = play.track;
            const job = { play, track, frame: play.frames, mw, mh,
                args: [{ ...rect }, width, height, { ...anchor }, pxPerUnit, limit, upY] };
            this._pending.set(id, job); track._measurePending = id;
            createImageBitmap(source).then(bitmap => {
                if (!this._pending.has(id) || this._failed || play.done || play.track !== track) {
                    bitmap.close(); this.finish(id); return;
                }
                this._worker.postMessage({ id, bitmap, width: mw, height: mh }, [bitmap]);
            }).catch(() => this.fail());
            return true;
        } catch (error) { this.fail(); return false; }
    },
    finish(id) {
        const job = this._pending.get(id);
        if (job?.track._measurePending === id) delete job.track._measurePending;
        this._pending.delete(id);
        return job;
    },
    receive(message) {
        const job = this.finish(message.id);
        if (message.error) return this.fail();
        if (!job || job.play.done || job.play.track !== job.track) return;
        const lit = Reactor3D.EffekseerScene.measurePixels(job.track, message.pixels, job.mw, job.mh, ...job.args);
        if (lit) job.play.lastLit = job.frame;
    },
    fail() {
        this._failed = true;
        this._worker?.terminate(); this._worker = null;
        for (const id of this._pending.keys()) this.finish(id);
    }
};


Reactor3D.EffekseerScene = {
    /** The most pixels one effect draws and copies per frame, as a fraction of the screen. */
    BUDGET: 0.25,
    /**
     * The same on a weak GPU, where that copy is the frame's largest single
     * cost. An anchored effect's pixels live in a second WebGL context, so
     * every frame they go out to a 2D canvas and back up as a texture, and
     * the cost scales with the box: on the Demo's start map, standing at
     * the reactor core, 212k pixels a frame measured 49 fps, 111k measured
     * 55, and 55k measured 60 — below which nothing further is gained
     * because the copy has stopped being the bottleneck. The effect is then
     * drawn at about half its screen size and stretched onto its quad,
     * which for additive glow is the softest thing in the frame to give up
     * and is why this is the knob that moves rather than the geometry's.
     * A capable GPU keeps the full quarter-screen.
     */
    BUDGET_WEAK: 0.06,

    /** The share of the screen one effect may cost this frame, by GPU class. */
    passBudget() {
        return Reactor3D.isWeakGpu() ? this.BUDGET_WEAK : this.BUDGET;
    },
    /** The effect's reach, in frames: the authored screen is one frame tall; a beam may run past it. */
    RADIUS_FRAMES: 1.25,
    /** Frames between looks at what the effect actually covers of its box. */
    MEASURE_EVERY: 10,
    /** Margin kept around the measured reach: a share of it, plus tiles. */
    MEASURE_PAD: 0.08,
    MEASURE_PAD_TILES: 0.25,
    /** Measurements remembered: the reach is the largest of them, so a bolt every few seconds keeps its room. */
    MEASURE_HISTORY: 30,
    /**
     * The most the interval between looks may be multiplied by after
     * consecutive looks that found nothing lit. A look costs a readback,
     * and a readback is a GPU sync — about ten milliseconds on a discrete
     * card, but ~250 ms on an integrated one, where the whole frame is only
     * meant to take sixteen.
     */
    MEASURE_MISS_BACKOFF: 30,
    /**
     * Consecutive empty looks after which an effect stops being drawn and
     * copied between looks.
     *
     * The copy is the expensive part of an anchored effect, not the draw:
     * the overlay is a second WebGL context, so its pixels reach three by
     * going out to a 2D canvas and back up as a texture — 640x360 of it a
     * frame on the Demo's start map, about 7 ms of a 24 ms frame, for an
     * effect that had not lit a single pixel in fifty looks. `begin` starts
     * every play at zero misses, so an effect that is fired and draws is
     * never held back; only a long-lived one that keeps coming back empty
     * goes quiet, and it wakes on its next look.
     */
    EMPTY_AFTER: 3,
    /** Multiples of `MEASURE_EVERY` between looks once a reach has settled, by GPU class. */
    SETTLED_EVERY: 30,
    SETTLED_EVERY_WEAK: 300,

    settledInterval() {
        return Reactor3D.isWeakGpu() ? this.SETTLED_EVERY_WEAK : this.SETTLED_EVERY;
    },

    /**
     * The same two numbers for the period *before* a reach has settled,
     * which is where the cost actually lands.
     *
     * Settling takes `MEASURE_HISTORY` looks at one per `MEASURE_EVERY`
     * frames — thirty looks, ten frames apart, so three hundred frames of
     * paying a readback every tenth one. That is invisible at ten
     * milliseconds a look and a stutter at forty, which is what it costs on
     * an integrated GPU: seven of the nine remaining spikes in a six-hundred
     * frame walk were this, at 33 to 72 ms each. So a weak GPU looks three
     * times less often and settles on a third of the samples — eight looks
     * over 240 frames instead of thirty over 300 — which is a coarser reach
     * held sooner, and a reach is only a box that has to contain the effect.
     */
    MEASURE_EVERY_WEAK: 30,
    MEASURE_HISTORY_WEAK: 8,

    learnInterval() {
        return Reactor3D.isWeakGpu() ? this.MEASURE_EVERY_WEAK : this.MEASURE_EVERY;
    },

    historyWanted() {
        return Reactor3D.isWeakGpu() ? this.MEASURE_HISTORY_WEAK : this.MEASURE_HISTORY;
    },
    /** The effect plane's side, in tiles: enough to cover the view from any distance a map allows. */
    QUAD_SPAN: 600,
    _live: [],
    _pass: "all",
    scissorEnabled: true,
    reuseQuads: true,
    _quadPools: new WeakMap(),

    /** The screen-sized quad that carries one effect's picture at its anchor's depth. */
    quadFor(scratch, scene) {
        const texture = new THREE.Texture(scratch);
        texture.flipY = true;
        texture.premultiplyAlpha = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        // Keep a few tiny drawing quads between loops. Disposing the last
        // material releases three's program AND shader-source cache entries,
        // forcing the same shader to compile again when the effect restarts.
        // Textures and render targets still belong to a single play.
        const reused = this.reuseQuads && scene && this._quadPools.get(scene)?.pop();
        if (reused) {
            reused.texture = texture;
            const uniforms = reused.material.uniforms;
            uniforms.map.value = texture;
            uniforms.resolution.value.set(1, 1);
            uniforms.depth.value = uniforms.flip.value = 0;
            uniforms.rectMin.value.set(0, 0);
            uniforms.rectSize.value.set(1, 1);
            reused.mesh.visible = false;
            return reused;
        }
        const material = new THREE.ShaderMaterial({
            // `flip`: 1 when the source's rows arrive top-down regardless of
            // the texture's flipY (a WebGL canvas handed to three directly).
            // `rectMin`/`rectSize`: the part of the screen the texture covers,
            // in screen fractions (the whole screen by default).
            uniforms: { map: { value: texture }, resolution: { value: new THREE.Vector2(1, 1) }, depth: { value: 0 }, flip: { value: 0 },
                rectMin: { value: new THREE.Vector2(0, 0) }, rectSize: { value: new THREE.Vector2(1, 1) } },
            // A big vertical plane standing on the anchor, turned to face the
            // camera: its depth follows real height, so the part of a tall
            // effect near the floor is judged against what stands at the
            // floor and the part up high against what stands up high. A flat
            // screen-depth plane got a tower's base wrong from above.
            vertexShader: [
                "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
            ].join("\n"),
            fragmentShader: [
                "uniform sampler2D map;",
                "uniform vec2 resolution;",
                "uniform float flip;",
                "uniform vec2 rectMin;",
                "uniform vec2 rectSize;",
                "void main() {",
                "    vec2 uv = (gl_FragCoord.xy / resolution - rectMin) / rectSize;",
                "    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;",
                "    if (flip > 0.5) uv.y = 1.0 - uv.y;",
                "    vec4 c = texture2D(map, uv);",
                "    if (c.a <= 0.002) discard;",
                "    gl_FragColor = c;",
                "}"
            ].join("\n"),
            transparent: true,
            depthTest: true,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        mesh.scale.setScalar(Reactor3D.EffekseerScene.QUAD_SPAN);
        mesh.frustumCulled = false;
        mesh.renderOrder = 5000;
        mesh.visible = false;
        mesh.userData.reactorEffectQuad = true;
        const quad = { mesh, texture, material };
        this.installQuadScissor(quad);
        return quad;
    },

    /** Reject the pixels the effect shader already discards, before rasterization. */
    installQuadScissor(quad) {
        const mesh = quad.mesh, saved = new THREE.Vector4(), crop = new THREE.Vector4();
        mesh.onBeforeRender = function(renderer) {
            this._effectScissorActive = false;
            if (!Reactor3D.EffekseerScene.scissorEnabled || !renderer.state?.scissor) return;
            const target = renderer.getRenderTarget(), uniforms = quad.material.uniforms, size = uniforms.resolution.value;
            const width = target?.width || renderer.domElement.width, height = target?.height || renderer.domElement.height;
            // Leave custom scissors and other passes (including shadows) to their owners.
            if (width !== size.x || height !== size.y || target?.scissorTest || renderer.getScissorTest()) return;
            if (target) saved.copy(target.scissor);
            else renderer.getScissor(saved).multiplyScalar(renderer.getPixelRatio()).floor();
            const x = Math.max(0, Math.floor(uniforms.rectMin.value.x * width));
            const y = Math.max(0, Math.floor(uniforms.rectMin.value.y * height));
            const right = Math.min(width, Math.ceil((uniforms.rectMin.value.x + uniforms.rectSize.value.x) * width));
            const top = Math.min(height, Math.ceil((uniforms.rectMin.value.y + uniforms.rectSize.value.y) * height));
            crop.set(x, y, Math.max(0, right - x), Math.max(0, top - y));
            // Touch the GL state cache, not the caller's saved target/default scissor settings.
            renderer.state.scissor(crop); renderer.state.setScissorTest(true);
            this._effectScissorActive = true;
        };
        mesh.onAfterRender = function(renderer) {
            if (!this._effectScissorActive) return;
            renderer.state.setScissorTest(false); renderer.state.scissor(saved);
            this._effectScissorActive = false;
        };
    },

    /** Begin an anchored animation in the scene for `sprite`'s handle; null when it cannot. */
    begin(viewport, animation, sprite) {
        if (!animation || !animation.effectName || !viewport || !sprite || typeof THREE === "undefined") return null;
        if (typeof Graphics === "undefined" || !Graphics.effekseer || !Graphics._effekseerGL || !Graphics._effekseerCanvas) return null;
        const scene = viewport._scene;
        if (!scene || typeof document === "undefined") return null;
        const scratch = document.createElement("canvas");
        scratch.width = 4;
        scratch.height = 4;
        const quad = this.quadFor(scratch, viewport._scene);
        scene.add(quad.mesh);
        // The sprite keeps its hands off the handle: the anchor owns its place.
        sprite._reactorInScene = true;
        const play = { scene, viewport, animation, sprite, scratch, done: false, quad, world: new THREE.Vector3(), scale: [1, 1, 1], rotation: [0, 0, 0], placed: false, ready: false, track: this.boxTracker(), frames: 0, lastLit: 0 };
        this._live.push(play);
        return play;
    },

    /**
     * Keep a play on its anchor. The effect's frame is model-sized: one
     * Effekseer unit is (span * scale / 26) tiles - the animation picker's
     * canvas is 26 units tall - times the record's own scale.
     */
    sync(play, holder, effect, axes, rotate) {
        if (!play || play.done || !holder || !holder.object) return;
        if (!Reactor3D.effectAnchorWorld(holder.object, effect, play.world)) return;
        const span = Reactor3D.modelSpanTiles(holder.object) || 1;
        const unit = span / 26 * ((play.animation.scale || 100) / 100);
        play.scale = [unit * axes[0], unit * axes[1], unit * axes[2]];
        play.radius = Reactor3D.EffekseerScene.effectRadius(span, play.animation, axes);
        const r = Math.PI / 180;
        play.rotation = [rotate[0] * r, rotate[1] * r, rotate[2] * r];
        play.placed = true;
    },

    stop(play) {
        if (!play || play.done) return;
        play.done = true;
        if (play._gpuEffectTarget) { play._gpuEffectTarget.dispose(); play._gpuEffectTarget = null; }
        if (play._gpuColourTarget) { play._gpuColourTarget.dispose(); play._gpuColourTarget = null; }
        // Where this play's picture ended: the next loop starts over there.
        // The longest seen, since a play the camera looked away from ends
        // early on screen and the picture's length does not change.
        if (play.track && play.lastLit > 0) play.track.visibleFrames = Math.max(play.track.visibleFrames || 0, play.lastLit);
        const quad = play.quad;
        if (quad) {
            if (quad.mesh.parent) quad.mesh.parent.remove(quad.mesh);
            quad.texture.dispose();
            // Never retain a play's native image, GPU target or scratch canvas.
            // The pool is bounded per owning scene and drained by stopScene.
            let pool = play.scene && this._quadPools.get(play.scene);
            if (this.reuseQuads && play.scene && quad.material.uniforms?.map && (!pool || pool.length < 4)) {
                if (!pool) this._quadPools.set(play.scene, pool = []);
                quad.texture = null;
                quad.material.uniforms.map.value = null;
                quad.mesh.visible = false;
                pool.push(quad);
            } else {
                quad.mesh.geometry.dispose();
                quad.material.dispose();
            }
        }
        const at = this._live.indexOf(play);
        if (at >= 0) this._live.splice(at, 1);
    },

    /** A map owns its attached effects, including native handles and GPU pictures. */
    stopScene(scene) {
        if (!scene) return;
        for (const play of this._live.slice()) {
            if (play.scene !== scene) continue;
            const sprite = play.sprite;
            try {
                if (sprite?._handle && !sprite._effectContext?.disposed) {
                    (sprite._effectContext?.context || Graphics.effekseer)?._makeContextCurrent?.();
                    sprite._handle.stop();
                }
            } catch (_) { /* A lost native context still needs all of its pictures released. */ }
            finally {
                if (sprite) { sprite._handle = null; sprite._playing = false; }
                this.stop(play); Reactor3D.GpuEffects.restoreDefault();
            }
        }
        const pool = this._quadPools.get(scene);
        if (pool) {
            this._quadPools.delete(scene);
            for (const quad of pool) {
                quad.mesh.geometry.dispose();
                quad.material.dispose();
            }
        }
    },

    /** Stand the plane on the anchor, facing the camera about the vertical. */
    standQuad(mesh, world, camera) {
        mesh.position.copy(world);
        const target = this._standTarget || (this._standTarget = new THREE.Vector3());
        target.set(camera.position.x, world.y, camera.position.z);
        mesh.lookAt(target);
        mesh.updateMatrixWorld();
    },

    /** How far an effect may reach from its anchor, in tiles: its frame times `RADIUS_FRAMES`. */
    effectRadius(span, animation, axes) {
        const frame = (span || 1) * (((animation && animation.scale) || 100) / 100);
        const stretch = Math.max(axes ? axes[0] : 1, axes ? axes[1] : 1, axes ? axes[2] : 1, 0.01);
        return frame * stretch * this.RADIUS_FRAMES;
    },

    /**
     * The unclamped box (floats, GL origin) of a cylinder of `radius`
     * around `world`, from `below` to `above` (tiles from the anchor, up;
     * ±radius by default), on a `width` x `height` screen; null when it is
     * entirely behind the camera, the whole screen when a corner is.
     */
    frameBox(camera, world, radius, width, height, below, above) {
        const clip = this._rectClip || (this._rectClip = new THREE.Vector4());
        const view = camera.matrixWorldInverse;
        const projection = camera.projectionMatrix;
        const y0 = below != null ? below : -radius;
        const y1 = above != null ? above : radius;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, behind = 0;
        for (let i = 0; i < 8; i++) {
            clip.set(world.x + (i & 1 ? radius : -radius), world.y + (i & 2 ? y1 : y0),
                world.z + (i & 4 ? radius : -radius), 1).applyMatrix4(view).applyMatrix4(projection);
            if (clip.w <= 0) { behind++; continue; }
            const x = (clip.x / clip.w + 1) * 0.5 * width;
            const y = (clip.y / clip.w + 1) * 0.5 * height;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        if (behind === 8) return null;
        if (behind > 0) return { x0: 0, y0: 0, x1: width, y1: height };
        return { x0: minX, y0: minY, x1: maxX, y1: maxY };
    },

    /**
     * A reach tracker: how far from its anchor an effect's picture actually
     * goes, in tiles, learned from the pictures drawn - a cylinder: a
     * radius about the anchor and a range below and above it. It starts at
     * the authored reach (`effectRadius`) and keeps the widest of the last
     * `MEASURE_HISTORY` looks, so a bolt that recurs every few seconds
     * keeps its room instead of making the box pulse. A picture touching
     * an edge of the box it was given goes on past it: that reach grows by
     * half. A cylinder in the world looks the same from every yaw, so the
     * box stays right as the camera turns; a box learned on the screen did
     * not. It also remembers the last frame anything was lit, so a looping
     * effect can start over when its picture ends rather than when its
     * last invisible particle does.
     */
    boxTracker() {
        return { radius: null, below: null, above: null, history: [], visibleFrames: null, mini: null, misses: 0 };
    },

    /** Remember a measured reach `{ radius, below, above }` and keep the widest remembered. */
    remember(track, reach) {
        const history = track.history || (track.history = []);
        history.push(reach);
        const keep = this.historyWanted();
        if (history.length > keep) history.splice(0, history.length - keep);
        let radius = 0, below = Infinity, above = -Infinity;
        for (const box of history) {
            if (box.radius > radius) radius = box.radius;
            if (box.below < below) below = box.below;
            if (box.above > above) above = box.above;
        }
        track.radius = radius;
        track.below = below;
        track.above = above;
    },

    /**
     * The screen box (pixels, GL origin) to draw this frame: the sphere of
     * the tracker's learned reach (the authored `radius` until it has
     * looked) around `world`, clamped to the screen and rounded out to
     * `step`, with `scale` (1 = full resolution) how much smaller than 1:1
     * it must be drawn to stay within `budget` pixels. Null when there is
     * nothing on screen.
     */
    trackedRect(track, camera, world, radius, width, height, budget, step) {
        const learned = track && track.radius != null;
        const reach = learned ? Math.min(radius, track.radius) : radius;
        const below = learned ? Math.max(-radius, track.below) : -radius;
        const above = learned ? Math.min(radius, track.above) : radius;
        const frame = this.frameBox(camera, world, reach, width, height, below, above);
        if (!frame) return null;
        const quantum = step || 32;
        const x0 = Math.max(0, Math.floor(frame.x0 / quantum) * quantum);
        const y0 = Math.max(0, Math.floor(frame.y0 / quantum) * quantum);
        const x1 = Math.min(width, Math.ceil(frame.x1 / quantum) * quantum);
        const y1 = Math.min(height, Math.ceil(frame.y1 / quantum) * quantum);
        if (x1 - x0 < 1 || y1 - y0 < 1) return null;
        const area = (x1 - x0) * (y1 - y0);
        const scale = budget > 0 && area > budget ? Math.sqrt(budget / area) : 1;
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, scale, reach, below, above };
    },

    /** As `trackedRect` with no tracker: the whole frame box. */
    screenRect(camera, world, radius, width, height, budget, step) {
        return this.trackedRect(null, camera, world, radius, width, height, budget, step);
    },

    /**
     * Look at the picture just drawn for `rect` (`source` holds the box at
     * `rect.scale`, top row first) and move the tracker: the box is drawn
     * no larger than 64 px, its alpha scanned, and the farthest lit pixel
     * from the anchor (`anchor`, screen px, GL origin; `pxPerUnit` pixels
     * per tile at its depth) becomes a reach in tiles, padded, no more than
     * `limit`. Cheap: one small draw and a 64-px readback. Returns whether
     * anything was lit.
     */
    measure(track, source, rect, width, height, anchor, pxPerUnit, limit, upY) {
        if (!track || !source || !rect || !anchor || !(pxPerUnit > 0)) return false;
        const mini = track.mini || (track.mini = document.createElement("canvas"));
        const mw = Math.max(1, Math.min(64, Math.round(64 * rect.w / Math.max(rect.w, rect.h))));
        const mh = Math.max(1, Math.min(64, Math.round(64 * rect.h / Math.max(rect.w, rect.h))));
        if (mini.width !== mw || mini.height !== mh) { mini.width = mw; mini.height = mh; }
        const ctx = mini.getContext("2d", { willReadFrequently: true });
        ctx.clearRect(0, 0, mw, mh);
        ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, mw, mh);
        let data;
        try { data = ctx.getImageData(0, 0, mw, mh).data; } catch (e) { return false; }
        return this.measurePixels(track, data, mw, mh, rect, width, height, anchor, pxPerUnit, limit, upY);
    },

    measurePixels(track, data, mw, mh, rect, width, height, anchor, pxPerUnit, limit, upY) {
        if (!track || !data || data.length !== mw * mh * 4) return false;
        let minX = mw, minY = mh, maxX = -1, maxY = -1;
        for (let y = 0; y < mh; y++) {
            for (let x = 0; x < mw; x++) {
                if (data[(y * mw + x) * 4 + 3] < 4) continue;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < 0) {
            // Nothing lit: count it, so `shouldMeasure` can back off rather
            // than pay this readback again in ten frames' time.
            track.misses = (track.misses || 0) + 1;
            return false;
        }
        track.misses = 0;
        // Mini pixels to screen pixels (the mini's first row is the box's top).
        const sx = rect.w / mw, sy = rect.h / mh;
        const lit = {
            x0: rect.x + minX * sx, x1: rect.x + (maxX + 1) * sx,
            y0: rect.y + rect.h - (maxY + 1) * sy, y1: rect.y + rect.h - minY * sy
        };
        // Sideways, the farther lit column from the anchor is the radius.
        // Up and down, the screen's vertical is the world's scaled by how
        // upright the camera is (`upY`, the camera up axis's world y): a
        // flat view sees a beam at full height, a steep one foreshortened.
        const pad = 1 + this.MEASURE_PAD;
        const tiles = this.MEASURE_PAD_TILES;
        const upright = Math.max(0.3, upY != null ? upY : 1);
        let radius = Math.max(Math.abs(lit.x0 - anchor.x), Math.abs(lit.x1 - anchor.x)) / pxPerUnit * pad + tiles;
        let below = Math.min(0, (lit.y0 - anchor.y) / pxPerUnit / upright) * pad - tiles;
        let above = Math.max(0, (lit.y1 - anchor.y) / pxPerUnit / upright) * pad + tiles;
        // Touching an edge of the box that is not the screen's edge: the
        // picture goes on past it, so that reach grows by half (the next
        // look sees whether it still does).
        const edge = Math.max(sx, sy);
        const had = track.radius != null;
        const curRadius = had ? track.radius : (rect.reach || limit);
        const curBelow = had ? track.below : (rect.below != null ? rect.below : -limit);
        const curAbove = had ? track.above : (rect.above != null ? rect.above : limit);
        if ((lit.x0 <= rect.x + edge && rect.x > 0) || (lit.x1 >= rect.x + rect.w - edge && rect.x + rect.w < width)) {
            radius = Math.max(radius, curRadius * 1.5);
        }
        if (lit.y0 <= rect.y + edge && rect.y > 0) below = Math.min(below, curBelow - 0.5 * (curAbove - curBelow));
        if (lit.y1 >= rect.y + rect.h - edge && rect.y + rect.h < height) above = Math.max(above, curAbove + 0.5 * (curAbove - curBelow));
        if (limit > 0) {
            radius = Math.min(radius, limit);
            below = Math.max(below, -limit);
            above = Math.min(above, limit);
        }
        this.remember(track, { radius, below, above });
        return true;
    },

    /**
     * Whether this is a frame to look at the picture: early once, then
     * every `MEASURE_EVERY` while the reach is still being learned, and a
     * third as often once `MEASURE_HISTORY` looks are in - the readback
     * stalls the GPU, and a settled reach only needs the odd check.
     */
    shouldMeasure(frames, track) {
        if (frames === 3) return true;
        const settled = track && track.history && track.history.length >= this.historyWanted();
        // An effect whose box comes back empty never remembers a reach, so
        // it never settles either — and without a backoff it pays the
        // readback every `MEASURE_EVERY` frames for as long as it lives.
        // The Demo's start map holds exactly one such effect, and it was
        // spending ~250 ms every ten frames, for ever, measuring nothing.
        // Each consecutive miss doubles the wait to a ceiling; one look
        // that finds anything resets it, so an effect that fires once in a
        // while is still measured the moment it does.
        const misses = track && track.misses ? track.misses : 0;
        const backoff = misses > 0 ? Math.min(1 << Math.min(misses, 5), this.MEASURE_MISS_BACKOFF) : 1;
        if (backoff > 1) {
            const base = settled ? this.learnInterval() * this.settledInterval() : this.learnInterval();
            return frames % (base * backoff) === 0;
        }
        // A settled look is a whole-overlay drawImage plus a readback — a
        // GPU sync of about ten milliseconds, which at every thirtieth frame
        // was a visible hitch twice a second on a map with an always-on
        // effect. Every three hundred frames keeps a slowly growing effect
        // honest and costs a hitch every five seconds instead.
        //
        // Ten milliseconds is the discrete-card price. On an integrated one
        // the same sync measured 31 to 42 ms — two and a half frames — and
        // with everything else on the Demo's start map down to vsync it was
        // the *only* thing left that broke sixty: four slow frames in four
        // hundred, all of them this. A settled reach is already the widest
        // of thirty looks, so on that hardware the refinement is worth far
        // less than the stutter it costs, and it drops to once every fifty
        // seconds rather than stopping — an effect that genuinely grows is
        // still caught, just not at the price of a visible hitch.
        const every = settled
            ? this.learnInterval() * this.settledInterval()
            : this.learnInterval();
        return frames % every === 0;
    },

    setPass(which) {
        this._pass = which;
        const shown = which === "all" || which === "world" || which === "below";
        for (const play of this._live) if (play.quad) play.quad.mesh.visible = shown && play.ready === true;
    },

    /**
     * Draw every live play from the scene's camera and hand the pictures to
     * their quads. Called once per frame before the 3D passes render; the
     * frame's overlay pass clears the corner again afterwards.
     */
    render(viewport) {
        if (!this._live.length) return;
        const camera = viewport && viewport._camera;
        const renderer = viewport && viewport.renderer ? viewport.renderer() : null;
        const efx = typeof Graphics !== "undefined" ? Graphics.effekseer : null;
        const gl = typeof Graphics !== "undefined" ? Graphics._effekseerGL : null;
        const overlay = typeof Graphics !== "undefined" ? Graphics._effekseerCanvas : null;
        if (!camera || !renderer || !efx || !gl || !overlay) return;
        const screenW = overlay.width;
        const screenH = overlay.height;
        const budget = screenW * screenH * this.passBudget();
        const size = viewport.targetSize ? viewport.targetSize() : { width: screenW, height: screenH };
        camera.updateMatrixWorld();
        const clip = this._clip || (this._clip = new THREE.Vector4());
        try {
            for (const play of this._live) {
                if (play.done || !play.placed || play.viewport !== viewport || play.scene !== viewport._scene) continue;
                const handle = play.sprite && play.sprite._handle;
                if (!handle || !handle.exists) { play.ready = false; play.quad.mesh.visible = false; continue; }
                handle.setLocation(play.world.x, play.world.y, play.world.z);
                handle.setScale(play.scale[0], play.scale[1], play.scale[2]);
                handle.setRotation(play.rotation[0], play.rotation[1], play.rotation[2]);
                // The anchor's depth in clip space is where the quad stands.
                clip.set(play.world.x, play.world.y, play.world.z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
                if (clip.w <= 0) { play.ready = false; play.quad.mesh.visible = false; continue; }
                // The effect's own box on screen, drawn 1:1 (smaller only past the budget).
                const rect = this.trackedRect(play.track, camera, play.world, play.radius || 1, screenW, screenH, budget, 32);
                if (!rect) { play.ready = false; play.quad.mesh.visible = false; continue; }
                // An effect whose picture keeps coming back empty costs
                // nothing between looks: no scissored draw, no copy out of
                // the overlay, no upload. It is looked at on exactly the
                // cadence `shouldMeasure` already backs off to, because a
                // look is a readback and a readback is the single most
                // expensive thing in this frame — 30 to 60 ms on an
                // integrated GPU. Watching cheaply every frame does not
                // work: the sync is what costs, not the pixels, so a 96 px
                // look every frame measured worse than the full-size copy
                // it replaced (41 ms a frame against 24).
                const empty = play.track && play.track.misses >= this.EMPTY_AFTER;
                if (empty && !this.shouldMeasure(play.frames + 1, play.track)) {
                    play.frames++;
                    play.ready = false;
                    play.quad.mesh.visible = false;
                    continue;
                }
                const s = rect.scale;
                const drawW = Math.max(1, Math.round(rect.w * s));
                const drawH = Math.max(1, Math.round(rect.h * s));
                const drawX = Math.round(rect.x * s);
                const drawY = Math.round(rect.y * s);
                // The whole screen's viewport at scale `s` keeps the camera's
                // projection honest; the scissor limits the work to the box.
                const entry = play.sprite._effectContext;
                if (entry) {
                    const target = Reactor3D.GpuEffects.draw(entry, play, drawW, drawH,
                        { x: -drawX, y: -drawY, width: Math.round(screenW * s), height: Math.round(screenH * s) },
                        camera.projectionMatrix.elements, camera.matrixWorldInverse.elements, handle);
                    if (!target) { play.ready = false; play.quad.mesh.visible = false; continue; }
                    Reactor3D.GpuEffects.bindQuad(play.quad, target, false);
                    play.frames++;
                    if (this.shouldMeasure(play.frames, play.track)) {
                        const anchor = { x: (clip.x / clip.w + 1) * 0.5 * screenW, y: (clip.y / clip.w + 1) * 0.5 * screenH };
                        const pxPerUnit = camera.projectionMatrix.elements[5] * screenH * 0.5 / (camera.isPerspectiveCamera ? clip.w : 1);
                        Reactor3D.GpuEffects.measure(play, entry, target, rect, screenW, screenH, anchor, pxPerUnit, play.radius || 1, camera.matrixWorld.elements[5]);
                    }
                } else {
                    efx._makeContextCurrent?.();
                    gl.viewport(0, 0, Math.round(screenW * s), Math.round(screenH * s));
                    gl.enable(gl.SCISSOR_TEST);
                    gl.scissor(drawX, drawY, drawW, drawH);
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    efx.setProjectionMatrix(camera.projectionMatrix.elements);
                    efx.setCameraMatrix(camera.matrixWorldInverse.elements);
                    efx.beginDraw();
                    efx.drawHandle(handle);
                    efx.endDraw();
                    if (typeof Graphics !== "undefined" && Graphics.settleEffekseerState) Graphics.settleEffekseerState();
                    gl.disable(gl.SCISSOR_TEST);
                    // The box, copied out before the next play draws over it: the
                    // GL origin is the bottom left, the canvas's the top left.
                    const scratch = play.scratch;
                    if (scratch.width !== drawW || scratch.height !== drawH) {
                        scratch.width = drawW;
                        scratch.height = drawH;
                        // three allocates a canvas texture once, at its first
                        // size (immutable storage on WebGL 2); a bigger box
                        // would not upload. Let go of the GL texture so the
                        // next upload allocates it at the new size.
                        play.quad.texture.dispose();
                    }
                    const ctx = scratch.getContext("2d");
                    ctx.clearRect(0, 0, drawW, drawH);
                    ctx.drawImage(overlay, drawX, overlay.height - drawY - drawH, drawW, drawH, 0, 0, drawW, drawH);
                    play.frames++;
                    if (this.shouldMeasure(play.frames, play.track)) {
                        const anchor = { x: (clip.x / clip.w + 1) * 0.5 * screenW, y: (clip.y / clip.w + 1) * 0.5 * screenH };
                        const pxPerUnit = camera.projectionMatrix.elements[5] * screenH * 0.5 / (camera.isPerspectiveCamera ? clip.w : 1);
                        const queued = Reactor3D.EffectMeasure.request(play, scratch, rect, screenW, screenH, anchor, pxPerUnit, play.radius || 1, camera.matrixWorld.elements[5]);
                        if (!queued && this.measure(play.track, scratch, rect, screenW, screenH, anchor, pxPerUnit, play.radius || 1, camera.matrixWorld.elements[5])) play.lastLit = play.frames;
                    }
                    play.quad.texture.needsUpdate = true;
                    renderer.initTexture(play.quad.texture);
                }
                this.standQuad(play.quad.mesh, play.world, camera);
                const uniforms = play.quad.material.uniforms;
                uniforms.resolution.value.set(size.width, size.height);
                // The box the quad samples has to be the box that was
                // actually drawn, which is the rounded one: `drawX` and the
                // rest are snapped to whole pixels *at the reduced scale*,
                // so at a quarter scale a rounding of one drawn pixel is
                // four on screen. Handing the shader the unrounded rect put
                // the picture up to several pixels off its anchor and moved
                // it about as the rounding crossed — an effect that jumps
                // aside for a frame and snaps back. Invisible while the
                // scale was 1 and plain once a weak GPU drew these smaller.
                uniforms.rectMin.value.set((drawX / s) / screenW, (drawY / s) / screenH);
                uniforms.rectSize.value.set((drawW / s) / screenW, (drawH / s) / screenH);
                play.ready = true;
                play.quad.mesh.visible = this._pass === "all" || this._pass === "world" || this._pass === "below";
            }
        } catch (error) {
            console.error("Reactor3D: Effekseer scene draw failed:", error);
        }
    }
};

/** The longest side of a model instance, in tiles. */
Reactor3D.modelSpanTiles = function(object) {
    const size = object && object.userData ? object.userData.glbSize : null;
    if (!size) return 0;
    const span = Math.max(size.x || 0, size.y || 0, size.z || 0, 0.0001);
    const scale = object.scale && object.scale.y > 0 ? object.scale.y : 1;
    return scale * span;
};

/**
 * An effect's scale is relative to its model: at 1, the animation's frame
 * (the screen it was authored on, `screenHeight` tall) is as big as the
 * model's longest side. The factor that turns "one screen" into that many
 * tiles, at this instance's size, against the animation's own screen-sized
 * drawing rule.
 */
Reactor3D.effectModelScale = function(object) {
    const span = this.modelSpanTiles(object);
    if (!(span > 0)) return 1;
    const tile = typeof $gameMap !== "undefined" && $gameMap && $gameMap.tileHeight ? $gameMap.tileHeight() : 48;
    const screen = typeof Graphics !== "undefined" && Graphics.height > 0 ? Graphics.height : 624;
    return span * tile / screen;
};

/** An anchor within this fraction of a side's extent belongs to that face. */
Reactor3D.EFFECT_FACE_DEPTH = 0.2;

/**
 * Whether an anchored effect's face is toward the camera.
 *
 * A 2D animation is drawn over the whole scene, so one placed on the front
 * of a console showed through the console from behind. The model's box
 * says which face an anchor sits on (an anchor deep inside belongs to
 * none and always shows; the underside is never a face, ground rings live
 * there); the effect shows while that face is toward the eye, with a
 * little hysteresis so a grazing view does not flicker. Cheap: one matrix
 * inverse per effect per frame, no geometry.
 */
Reactor3D.effectFacesCamera = function(holder, effect, entry) {
    if (!effect || effect.occlude === false || !holder || !holder.object || typeof THREE === "undefined") return true;
    const object = holder.object;
    const size = object.userData.glbSize;
    const spriteset = typeof SceneManager !== "undefined" && SceneManager._scene ? SceneManager._scene._spriteset : null;
    const camera = spriteset && spriteset._reactor3d ? spriteset._reactor3d.camera : null;
    if (!size || !camera) return true;
    const world = this._faceWorld || (this._faceWorld = new THREE.Vector3());
    const local = this._faceLocal || (this._faceLocal = new THREE.Vector3());
    const normal = this._faceNormal || (this._faceNormal = new THREE.Vector3());
    const inverse = this._faceInverse || (this._faceInverse = new THREE.Matrix4());
    if (!this.effectAnchorWorld(object, effect, world)) return true;
    inverse.copy(object.matrixWorld).invert();
    local.copy(world).applyMatrix4(inverse);
    // The model stands on y = 0, centred in x and z (see the GLB loader).
    const faces = [
        [size.x / 2 - local.x, size.x, 1, 0, 0], [local.x + size.x / 2, size.x, -1, 0, 0],
        [size.y - local.y, size.y, 0, 1, 0],
        [size.z / 2 - local.z, size.z, 0, 0, 1], [local.z + size.z / 2, size.z, 0, 0, -1]
    ];
    let best = null, depth = Infinity;
    for (const face of faces) {
        const ratio = face[1] > 0 ? face[0] / face[1] : Infinity;
        if (ratio < depth) { depth = ratio; best = face; }
    }
    if (!best || depth > this.EFFECT_FACE_DEPTH) return true;
    normal.set(best[2], best[3], best[4]).transformDirection(object.matrixWorld);
    local.copy(camera.position).sub(world).normalize();
    const facing = normal.dot(local);
    const hidden = entry && entry.hidden;
    const show = facing > 0.05 || (facing > -0.05 && !hidden);
    if (entry) entry.hidden = !show;
    return show;
};

/** Project a model anchor into its flat sprite's bitmap, without a readback. */
Reactor3D.flatModelAnchor = function(holder, effect, out) {
    const world = this.effectAnchorWorld(holder.object, effect,
        this._flatAnchorScratch || (this._flatAnchorScratch = new THREE.Vector3()));
    if (!world) return null;
    world.project(holder.camera);
    const sprite = holder.sprite;
    out = out || {};
    out.x = sprite.x + ((world.x + 1) * 0.5 - sprite.anchor.x) * holder.size;
    out.y = sprite.y + ((1 - world.y) * 0.5 - sprite.anchor.y) * holder.size;
    return out;
};

/**
 * Put a stand-in on its anchor's screen position, at the scale the world is
 * drawn there. The animation sprite asks its target for `reactor3DScale`,
 * the way it asks a character, so the effect shrinks into the distance and
 * grows up close with the model rather than playing at flat pixel size —
 * which is what drew a reactor's core as a beam the size of the screen.
 */
Reactor3D.placeStandIn = function(holder, effect, standIn) {
    const spriteset = typeof SceneManager !== "undefined" && SceneManager._scene
        ? SceneManager._scene._spriteset : null;
    const camera = spriteset && spriteset._reactor3d ? spriteset._reactor3d.camera : null;
    if (holder?.flat && holder.object) {
        const point = this.flatModelAnchor(holder, effect, this._flatStandPoint || (this._flatStandPoint = {}));
        if (!point) return false;
        standIn.x = point.x; standIn.y = point.y;
        const tile = $gameMap.tileWidth();
        standIn._reactorStand = { x: holder.unit / tile * (standIn._reactorExtra || 1), y: holder.unit / tile * (standIn._reactorExtra || 1) };
        if (!standIn.reactor3DScale) standIn.reactor3DScale = function() { return this._reactorStand; };
        return true;
    }
    if (!camera || !holder || !holder.object || typeof THREE === "undefined") return false;
    const scratch = this._anchorScratch || (this._anchorScratch = new THREE.Vector3());
    const point = this._anchorPoint || (this._anchorPoint = {});
    const above = this._anchorAbove || (this._anchorAbove = {});
    const world = this.effectAnchorWorld(holder.object, effect, scratch);
    if (!world || !this.projectToScreen(camera, world.x, world.y, world.z, point)) return false;
    standIn.x = point.x;
    standIn.y = point.y;
    // One tile up, projected: its screen distance is the pixels a tile
    // covers here, against the flat tile height.
    if (this.projectToScreen(camera, world.x, world.y + 1, world.z, above)) {
        const tile = typeof $gameMap !== "undefined" && $gameMap && $gameMap.tileHeight ? $gameMap.tileHeight() : 48;
        const k = Math.max(0.02, Math.hypot(above.x - point.x, above.y - point.y) / tile) * (standIn._reactorExtra || 1);
        standIn._reactorStand = { x: k, y: k };
        if (!standIn.reactor3DScale) standIn.reactor3DScale = function() { return this._reactorStand; };
    }
    return true;
};

/** End an anchored animation now: its sprite and stand-in leave the scene. */
Reactor3D.stopAnchoredAnimation = function(entry) {
    if (!entry) return;
    entry.loop = false;
    if (entry.fx3d) this.EffekseerScene.stop(entry.fx3d);
    const spriteset = typeof SceneManager !== "undefined" && SceneManager._scene
        ? SceneManager._scene._spriteset : null;
    if (spriteset && spriteset.removeAnimation && entry.sprite.parent) spriteset.removeAnimation(entry.sprite);
    else if (entry.sprite.parent) entry.sprite.parent.removeChild(entry.sprite);
    if (entry.standIn.parent) entry.standIn.parent.removeChild(entry.standIn);
};

/**
 * Effects that play on their own: while the character is in the state
 * their trigger names, they loop at their anchor; when it leaves the state
 * they stop. The same conditions the animation rules use.
 */
Reactor3D.updateTriggeredEffects = function(holder, character, state) {
    if (!holder || !holder.effects) return;
    if (holder.lights) this.expireEffectLights(holder, this.currentFrame());
    for (const effect of holder.effects) {
        const isVideo = effect.type === "video" && effect.video;
        const isLight = effect.type === "light" && effect.light;
        if (effect.trigger === "action" || (!isVideo && !isLight && !(effect.animation > 0))) continue;
        const active = effect.trigger === "always"
            || (effect.trigger === "moving" && state.moving)
            || (effect.trigger === "walking" && state.moving && !state.dashing)
            || (effect.trigger === "dashing" && state.dashing)
            || (effect.trigger === "idle" && !state.moving);
        if (isVideo) {
            const playing = !!(holder.videos && holder.videos[effect.name]);
            if (active && !playing) this.spawnVideoEffect(effect, character, holder);
            else if (!active && playing) this.stopVideoEffect(effect, character, holder);
            continue;
        }
        if (isLight) {
            const burning = !!(holder.lights && holder.lights[effect.name]);
            if (active !== burning) this.setEffectLight(holder, effect, active, 0);
            continue;
        }
        const live = (holder.anchored || []).find(entry => entry.triggered === effect.name);
        if (active && !live) {
            if ((holder.anchored || []).length >= this.MAX_ANCHORED_PER_MODEL) continue;
            this.spawnAnchoredAnimation(Object.assign({}, effect, { loop: true }), character, holder);
            const spawned = holder.anchored && holder.anchored[holder.anchored.length - 1];
            if (spawned && spawned.effect.name === effect.name) spawned.triggered = effect.name;
        } else if (!active && live) {
            this.stopAnchoredAnimation(live);
        }
    }
};

/**
 * Keep every anchored animation on its anchor; drop the ones that finished
 * and start their loops over. The spriteset is the judge of "finished": it
 * removes an animation sprite from the scene when it stops playing, so a
 * sprite still attached is still running (or waiting for its effect file).
 * Loops restart after the pass, never inside it — a restart inside the
 * walk re-entered this function and recursed until the stack gave out.
 */
Reactor3D.updateAnchoredAnimations = function(holder) {
    if (!holder || !holder.anchored || !holder.anchored.length) return;
    const kept = [];
    const restart = [];
    for (const entry of holder.anchored) {
        if (!entry.sprite.parent) {
            if (entry.standIn.parent) entry.standIn.parent.removeChild(entry.standIn);
            if (entry.fx3d) this.EffekseerScene.stop(entry.fx3d);
            if (entry.loop && !entry.restarted && holder.object) restart.push(entry);
            continue;
        }
        this.placeStandIn(holder, entry.effect, entry.standIn);
        if (entry.fx3d) {
            // Drawn in the scene: the model's own turn is in `rotate` already.
            this.EffekseerScene.sync(entry.fx3d, holder, entry.effect, entry.axes, entry.rotate);
            entry.sprite.visible = false;
            // A loop starts over where its picture ended last time, not
            // when its last invisible particle dies: no dark gap between
            // plays. The tail keeps running underneath.
            const track = entry.fx3d.track;
            if (entry.loop && !entry.restarted && track && track.visibleFrames > 0 && entry.fx3d.frames >= track.visibleFrames) {
                entry.restarted = true;
                restart.push(entry);
            }
        } else {
            entry.sprite.visible = this.effectFacesCamera(holder, entry.effect, entry);
        }
        kept.push(entry);
    }
    holder.anchored = kept;
    for (const entry of restart) {
        if (holder.anchored.length >= this.MAX_ANCHORED_PER_MODEL) break;
        this.spawnAnchoredAnimation(Object.assign({}, entry.effect, { loop: true }), entry.character, holder);
        const again = holder.anchored[holder.anchored.length - 1];
        if (entry.triggered && again && again !== entry) again.triggered = entry.triggered;
    }
};


//-----------------------------------------------------------------------------
// Plugin commands

Reactor3D.registerPluginCommands = function() {
    if (this._pluginCommandsRegistered) return;
    if (typeof PluginManager === "undefined" || !PluginManager.registerCommand) return;
    this._pluginCommandsRegistered = true;
    PluginManager.registerCommand("RPGReactor", "TransformModel3D", function(args) {
        const target = Number((args && args.target) || 0);
        const character = this.character ? this.character(target) : null;
        if (!character) return;
        const n = key => Number((args && args[key]) || 0);
        const s = key => { const v = Number(args && args[key]); return Number.isFinite(v) && v > 0 ? v : 1; };
        const duration = Math.max(0, Math.round(n("duration")));
        Reactor3D.transformModel(character, {
            offset: [n("offsetX"), n("offsetZ"), n("offsetY")],
            rotate: [n("yaw"), n("pitch"), n("roll")],
            scale: [s("scaleX"), s("scaleY"), s("scaleZ")]
        }, duration);
        if (args && String(args.wait) === "true" && duration > 0 && this.wait) this.wait(duration);
    });
    // Lights: on/off, an eased transform, and the map's ambient.
    PluginManager.registerCommand("RPGReactor", "LightSwitch", function(args) {
        Reactor3D.switchLight(args && args.target, args && args.state);
    });
    PluginManager.registerCommand("RPGReactor", "TransformLight", function(args) {
        const duration = Math.max(0, Math.round(Number(args && args.duration) || 0));
        if (args && String(args.reset) === "true") {
            Reactor3D.transformLight(args.target, null);
            return;
        }
        Reactor3D.transformLight(args && args.target, args || {}, duration);
        if (args && String(args.wait) === "true" && duration > 0 && this.wait) this.wait(duration);
    });
    PluginManager.registerCommand("RPGReactor", "AmbientLight", function(args) {
        const duration = Math.max(0, Math.round(Number(args && args.duration) || 0));
        if (args && String(args.reset) === "true") {
            Reactor3D.setMapAmbient(null);
            return;
        }
        Reactor3D.setMapAmbient(args || {}, duration);
        if (args && String(args.wait) === "true" && duration > 0 && this.wait) this.wait(duration);
    });
    PluginManager.registerCommand("RPGReactor", "SetModelAnimationSpeed", function(args) {
        const target = Number(args?.target) || 0;
        const character = target < -1 ? $gamePlayer.followers().follower(-target - 2) : this.character?.(target);
        Reactor3D.setModelAnimationSpeed(character, args?.speed);
    });
    PluginManager.registerCommand("RPGReactor", "PlayModelAnimation", function(args) {
        const target = Number((args && args.target) || 0);
        const character = this.character ? this.character(target) : null;
        if (!character) return;
        const name = String((args && args.animation) || "");
        Reactor3D.playModelAnimation(character, name);
        if (args && String(args.wait) === "true" && name && this.setWaitMode) {
            // The wait outlives the model's own async load: while the queued
            // action is still pending the wait holds, once it starts it holds
            // until the action ends — and a repeating action releases after
            // its first full cycle (the restart bumps the action's frame).
            this._reactorAnimWait = {
                character, name, started: false, startedFrame: null,
                deadline: (typeof Graphics !== "undefined" ? Graphics.frameCount : 0) + 1800
            };
            this.setWaitMode("reactorModelAnimation");
        }
    });
    if (typeof Game_Interpreter !== "undefined" && Game_Interpreter.prototype.updateWaitMode
        && !Game_Interpreter.prototype.updateWaitMode.__reactorModelAnimation) {
        const baseWait = Game_Interpreter.prototype.updateWaitMode;
        Game_Interpreter.prototype.updateWaitMode = function() {
            if (this._waitMode === "reactorModelAnimation") {
                const waiting = Reactor3D.modelAnimationWaiting(this._reactorAnimWait);
                if (!waiting) {
                    this._waitMode = "";
                    this._reactorAnimWait = null;
                }
                return waiting;
            }
            return baseWait.apply(this, arguments);
        };
        Game_Interpreter.prototype.updateWaitMode.__reactorModelAnimation = true;
    }
    const reactorScopedWait = function(args) {
        // A BACKGROUND wait: the player keeps walking while it holds — MZ's
        // own Wait exists for blocking. Scope: an event id, 0 for this
        // event, -1 for the player, or "all". Mode "actions" holds until the
        // scope's last actions finish (model animation queue, and for one
        // character a forced move route too); mode "duration" holds a set
        // number of frames.
        const raw = String((args && args.target) != null ? args.target : "all");
        let character = null;
        if (raw !== "all") {
            const target = Number(raw) || 0;
            character = this.character ? this.character(target) : null;
            if (!character) return;
        }
        if (!this.setWaitMode) return;
        const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
        const duration = Math.max(0, Math.round(Number(args && args.duration) || 0));
        const modes = ["actions", "duration", "switch", "variable"];
        const mode = modes.indexOf(String(args && args.mode)) >= 0 ? String(args.mode) : "actions";
        this._reactorScopedWait = {
            character,
            mode,
            until: frame + duration,
            // A switch or variable wait is "resume when it happens": it may
            // legitimately hold for minutes, so only the bounded modes carry
            // the safety deadline.
            deadline: mode === "actions" ? frame + 3600 : Infinity,
            switchId: Math.max(1, Math.round(Number(args && args.switchId) || 1)),
            switchValue: String(args && args.switchValue) !== "false",
            variableId: Math.max(1, Math.round(Number(args && args.variableId) || 1)),
            op: String((args && args.op) || ">="),
            value: Number(args && args.value) || 0
        };
        this.setWaitMode("reactorScopedWait");
        // The waiting event can let go of itself — resume its own route
        // instead of standing at attention while the wait holds. On by
        // default; unchecked, it stands locked the MZ way.
        if (String(args && args.resume) !== "false"
            && this._eventId > 0 && typeof $gameMap !== "undefined") {
            const owner = $gameMap.event(this._eventId);
            if (owner && owner.unlock) owner.unlock();
        }
    };
    PluginManager.registerCommand("RPGReactor", "ScopedWait", reactorScopedWait);
    // The first shipping name; events saved with it keep working.
    PluginManager.registerCommand("RPGReactor", "WaitForModelAnimation", reactorScopedWait);
    if (typeof Game_Interpreter !== "undefined" && Game_Interpreter.prototype.updateWaitMode
        && !Game_Interpreter.prototype.updateWaitMode.__reactorScopedWait) {
        const baseWait = Game_Interpreter.prototype.updateWaitMode;
        Game_Interpreter.prototype.updateWaitMode = function() {
            if (this._waitMode === "reactorScopedWait") {
                const waiting = Reactor3D.scopedWaitHolding(this._reactorScopedWait);
                if (!waiting) {
                    this._waitMode = "";
                    this._reactorScopedWait = null;
                }
                return waiting;
            }
            return baseWait.apply(this, arguments);
        };
        Game_Interpreter.prototype.updateWaitMode.__reactorScopedWait = true;
    }
    if (typeof Game_Map !== "undefined" && Game_Map.prototype.updateInterpreter
        && !Game_Map.prototype.updateInterpreter.__reactorBackgroundWait) {
        const baseUpdateInterpreter = Game_Map.prototype.updateInterpreter;
        Game_Map.prototype.updateInterpreter = function() {
            // A script holding in a background wait must not make the next
            // interaction queue behind it: when another event starts, the
            // waiting script PARKS onto its own runner (kept on the map, so
            // saves carry it) and the map interpreter is handed over fresh.
            // The tank finishes its routine on the side while the plant
            // monster's script runs — and locks — on its own merits.
            if (this._interpreter && this._interpreter.isRunning()
                && Reactor3D.BACKGROUND_WAIT_MODES.indexOf(this._interpreter._waitMode) >= 0
                && this.isAnyEventStarting()) {
                if (!this._reactorParked) this._reactorParked = [];
                this._reactorParked.push(this._interpreter);
                this._interpreter = new Game_Interpreter();
            }
            baseUpdateInterpreter.call(this);
            if (this._reactorParked && this._reactorParked.length) {
                for (const parked of this._reactorParked.slice()) {
                    parked.update();
                    if (!parked.isRunning()) {
                        if (parked.eventId && parked.eventId() > 0) this.unlockEvent(parked.eventId());
                        const at = this._reactorParked.indexOf(parked);
                        if (at >= 0) this._reactorParked.splice(at, 1);
                    }
                }
            }
        };
        Game_Map.prototype.updateInterpreter.__reactorBackgroundWait = true;
    }
    if (typeof Game_Event !== "undefined" && Game_Event.prototype.start
        && !Game_Event.prototype.start.__reactorBackgroundWait) {
        const baseStart = Game_Event.prototype.start;
        Game_Event.prototype.start = function() {
            // While this event's own script holds in a background wait, the
            // free-to-walk player can bump into it or press action on it —
            // and stock start() would re-arm the starting flag every frame,
            // which vetoed the background exemption and froze the player
            // after all. An event whose script is the one running cannot be
            // started again; in stock MZ this cannot even be attempted.
            const map = typeof $gameMap !== "undefined" ? $gameMap : null;
            const interpreter = map ? map._interpreter : null;
            if (interpreter && interpreter.isRunning()
                && interpreter.eventId && interpreter.eventId() === this.eventId()) {
                return;
            }
            if (map && map._reactorParked
                && map._reactorParked.some(parked => parked.eventId && parked.eventId() === this.eventId())) {
                return;
            }
            baseStart.apply(this, arguments);
        };
        Game_Event.prototype.start.__reactorBackgroundWait = true;
    }
    if (typeof Game_Map !== "undefined" && Game_Map.prototype.isEventRunning
        && !Game_Map.prototype.isEventRunning.__reactorScopedWait) {
        const baseRunning = Game_Map.prototype.isEventRunning;
        Game_Map.prototype.isEventRunning = function() {
            if (!baseRunning.call(this)) return false;
            // An interpreter held only by a Reactor wait is background work:
            // watching a model animate must never freeze the player, so both
            // the scoped wait and Play Model Animation's Wait for Completion
            // let the player walk. Freezing on purpose is what the stock
            // Wait command is for.
            const interpreter = this._interpreter;
            if (interpreter
                && Reactor3D.BACKGROUND_WAIT_MODES.indexOf(interpreter._waitMode) >= 0
                && !this.isAnyEventStarting()) {
                return false;
            }
            return true;
        };
        Game_Map.prototype.isEventRunning.__reactorScopedWait = true;
    }
    PluginManager.registerCommand("RPGReactor", "PlayModelEffect", function(args) {
        const target = Number((args && args.target) || 0);
        const character = this.character ? this.character(target) : null;
        if (character) Reactor3D.playModelEffect(character, String((args && args.effect) || ""));
    });
};
Reactor3D.registerPluginCommands();

Reactor3D.Effects = { file: "reactor_3d_effects.js" };
})(typeof globalThis !== "undefined" ? globalThis : this);
