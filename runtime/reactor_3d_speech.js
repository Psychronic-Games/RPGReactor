/* Waveform-driven 3D speech. PCM is reduced once per decoded chunk; each tick
 * reads an envelope sample and changes a jaw or morph weight. No vertex loops
 * or audio sample scans run in the frame loop. */
(function(root) {
    "use strict";
    // An extension of Reactor3D (reactor_3d.js), booted right after the core.
    // Node alone takes the core from require; the NW.js page and the browser
    // find it on the global object. The game classes it hooks load later, so
    // install() runs again from reactor_sprites.js once they exist.
    const node = typeof process !== "undefined" && process.versions && process.versions.node
        && !process.versions.nw && typeof require === "function";
    const R = node ? require("./reactor_3d.js") : root.Reactor3D;
    if (!R) return;
    const active = new Map(), drivers = new WeakMap(), envelopes = new WeakMap();
    const trackedBuffers = new WeakMap();
    let serial = 0;
    const RATE = 60;

    function envelope(chunk) {
        let cached = envelopes.get(chunk);
        if (cached) return cached;
        const channels = [];
        for (let c = 0; c < chunk.numberOfChannels; c++) channels.push(chunk.getChannelData(c));
        const samples = new Float32Array(Math.max(1, Math.ceil(chunk.duration * RATE)));
        let previous = 0;
        for (let b = 0; b < samples.length; b++) {
            const start = Math.floor(b * chunk.sampleRate / RATE);
            const end = Math.min(chunk.length, Math.floor((b + 1) * chunk.sampleRate / RATE));
            let energy = 0, count = 0;
            for (const channel of channels) for (let i = start; i < end; i++) { energy += channel[i] * channel[i]; count++; }
            const rms = count ? Math.sqrt(energy / count) : 0;
            previous = rms < 0.004 ? 0 : Math.min(1, rms * 6) * 0.7 + previous * 0.3;
            samples[b] = previous;
        }
        envelopes.set(chunk, samples);
        return samples;
    }

    function levelAt(buffer, seconds) {
        if (!(seconds >= 0)) return 0;
        for (const chunk of buffer._buffers || []) {
            if (seconds >= chunk.duration) { seconds -= chunk.duration; continue; }
            const values = envelopes.get(chunk);
            if (!values) return 0;
            const at = seconds * RATE, index = Math.floor(at);
            const a = values[index] || 0, b = values[Math.min(index + 1, values.length - 1)] || 0;
            return a + (b - a) * (at - index);
        }
        return 0;
    }

    // Split the authored lip line once. Both copies coincide at rest; the GPU
    // morph separates them during speech, instead of stretching bridging faces.
    function splitLipSeam(original, modelPoints, center, up, influence, vertexMatrix) {
        const position = original.getAttribute("position"), count = position.count;
        const index = original.getIndex(), total = index ? index.count : count;
        if (original.drawRange.start !== 0 || original.drawRange.count < total) return null;
        const extra = [], triangles = [], seams = [], groups = [];
        const point = i => new THREE.Vector3().fromArray(modelPoints, i * 3);
        const signed = i => point(i).sub(center).dot(up);
        const epsilon = 1e-8;
        for (let at = 0; at + 2 < total; at += 3) {
            const ids = [0, 1, 2].map(j => index ? index.getX(at + j) : at + j);
            const distances = ids.map(signed), crossings = [], cache = new Map();
            for (let j = 0; j < 3; j++) {
                const k = (j + 1) % 3, a = distances[j], b = distances[k];
                if (Math.abs(a) <= epsilon) crossings.push({ a: ids[j], b: ids[j], t: 0 });
                else if (a * b < 0 && Math.abs(b) > epsilon) crossings.push({ a: ids[j], b: ids[k], t: a / (a - b) });
            }
            const cutPoint = cut => point(cut.a).lerp(point(cut.b), cut.t);
            const crosses = distances.some(d => d > epsilon) && distances.some(d => d < -epsilon);
            const affected = crossings.length === 2 && (influence(cutPoint(crossings[0])) > 0
                || influence(cutPoint(crossings[1])) > 0 || influence(cutPoint(crossings[0]).lerp(cutPoint(crossings[1]), 0.5)) > 0);
            const group = original.groups.find(g => at >= g.start && at < g.start + g.count);
            const materialIndex = group ? group.materialIndex : 0;
            const start = triangles.length;
            if (!crosses || !affected) triangles.push(...ids);
            else {
                const append = (cut, side) => {
                    const key = `${cut.a}:${cut.b}:${side}`;
                    if (!cache.has(key)) { cache.set(key, count + extra.length); extra.push({ ...cut, side }); }
                    return cache.get(key);
                };
                for (const side of [1, -1]) {
                    const polygon = [];
                    for (let j = 0; j < 3; j++) {
                        const k = (j + 1) % 3, d = distances[j], next = distances[k];
                        if (d * side >= -epsilon) polygon.push(Math.abs(d) <= epsilon
                            ? append({ a: ids[j], b: ids[j], t: 0 }, side) : ids[j]);
                        if (d * next < 0 && Math.abs(d) > epsilon && Math.abs(next) > epsilon) {
                            const cut = crossings.find(c => c.a === ids[j] && c.b === ids[k]);
                            polygon.push(append(cut, side));
                        }
                    }
                    for (let j = 1; j + 1 < polygon.length; j++) triangles.push(polygon[0], polygon[j], polygon[j + 1]);
                }
                seams.push([append(crossings[0], 1), append(crossings[1], 1), append(crossings[0], -1), append(crossings[1], -1)]);
            }
            const previous = groups[groups.length - 1];
            if (previous && previous.materialIndex === materialIndex) previous.count += triangles.length - start;
            else groups.push({ start, count: triangles.length - start, materialIndex });
        }
        if (!seams.length) return null;
        const geometry = original.clone(), size = count + extra.length;
        const expand = attribute => {
            const result = new THREE.BufferAttribute(new attribute.array.constructor(size * attribute.itemSize), attribute.itemSize, attribute.normalized);
            for (let i = 0; i < count; i++) for (let c = 0; c < attribute.itemSize; c++) result.setComponent(i, c, attribute.getComponent(i, c));
            extra.forEach((v, j) => { for (let c = 0; c < attribute.itemSize; c++) result.setComponent(count + j, c,
                attribute.getComponent(v.a, c) * (1 - v.t) + attribute.getComponent(v.b, c) * v.t); });
            return result;
        };
        for (const [name, attribute] of Object.entries(original.attributes)) geometry.setAttribute(name, expand(attribute));
        for (const [name, attributes] of Object.entries(original.morphAttributes)) geometry.morphAttributes[name] = attributes.map(expand);
        const skinIndex = geometry.getAttribute("skinIndex"), skinWeight = geometry.getAttribute("skinWeight");
        if (skinIndex && skinWeight) extra.forEach((v, j) => {
            const weights = new Map();
            for (const [i, factor] of [[v.a, 1 - v.t], [v.b, v.t]]) for (let c = 0; c < 4; c++) {
                const bone = skinIndex.getComponent(i, c), w = skinWeight.getComponent(i, c) * factor;
                weights.set(bone, (weights.get(bone) || 0) + w);
            }
            const best = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = best.reduce((n, p) => n + p[1], 0) || 1;
            for (let c = 0; c < 4; c++) { skinIndex.setComponent(count + j, c, best[c]?.[0] || 0); skinWeight.setComponent(count + j, c, (best[c]?.[1] || 0) / sum); }
        });
        // Interpolated bone weights need a corresponding rest-space position.
        // Otherwise vertices influenced by different bones pull the new seam apart.
        extra.forEach((v, j) => {
            const p = point(v.a).lerp(point(v.b), v.t), matrix = vertexMatrix(geometry, count + j).invert();
            p.applyMatrix4(matrix); geometry.attributes.position.setXYZ(count + j, p.x, p.y, p.z);
        });
        geometry.setIndex(triangles); geometry.clearGroups();
        if (original.groups.length) for (const g of groups) geometry.addGroup(g.start, g.count, g.materialIndex);
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        return { geometry, seams, extra, originalCount: count };
    }

    function makeMouthInterior(mesh, geometry, morphIndex, seams, vertexMatrix, forward, depth, influence, color) {
        const vertices = [], targets = [], indices = [], boneIndices = [], boneWeights = [];
        const position = geometry.attributes.position, target = geometry.morphAttributes.position[morphIndex];
        const si = geometry.attributes.skinIndex, sw = geometry.attributes.skinWeight;
        const relative = geometry.morphTargetsRelative;
        for (const seam of seams) {
            const start = vertices.length / 3;
            for (let j = 0; j < 6; j++) {
                const i = seam[j < 4 ? j : j - 4];
                const rest = new THREE.Vector3().fromBufferAttribute(position, i);
                const open = new THREE.Vector3().fromBufferAttribute(target, i);
                if (relative) open.add(rest);
                if (j >= 4) {
                    const lower = new THREE.Vector3().fromBufferAttribute(target, seam[j - 2]);
                    if (relative) lower.add(new THREE.Vector3().fromBufferAttribute(position, seam[j - 2]));
                    open.lerp(lower, 0.5);
                    const matrix = vertexMatrix(geometry, i), model = rest.clone().applyMatrix4(matrix);
                    const inset = forward.clone().multiplyScalar(-depth * influence(model))
                        .applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix.invert()));
                    rest.add(inset); open.add(inset);
                }
                rest.toArray(vertices, vertices.length); open.sub(rest).toArray(targets, targets.length);
                if (si && sw) for (let c = 0; c < 4; c++) { boneIndices.push(si.getComponent(i, c)); boneWeights.push(sw.getComponent(i, c)); }
            }
            for (const i of [0,1,5,0,5,4,4,5,3,4,3,2]) indices.push(start + i);
        }
        const lining = new THREE.BufferGeometry();
        lining.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        lining.morphTargetsRelative = true;
        lining.morphAttributes.position = [new THREE.Float32BufferAttribute(targets, 3)];
        lining.setIndex(indices);
        const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
        const cavity = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(lining, material) : new THREE.Mesh(lining, material);
        cavity.name = "Reactor mouth interior";
        cavity.userData.__reactorOverlay = true; // Never a new collision or landmark target.
        cavity.frustumCulled = false; cavity.visible = false;
        if (mesh.isSkinnedMesh && si && sw) {
            lining.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(boneIndices, 4));
            lining.setAttribute("skinWeight", new THREE.Float32BufferAttribute(boneWeights, 4));
            cavity.bindMode = mesh.bindMode; cavity.bind(mesh.skeleton, mesh.bindMatrix);
        }
        mesh.add(cavity);
        return cavity;
    }

    function prepare(object) {
        if (!object || typeof THREE === "undefined") return null;
        if (drivers.has(object)) return drivers.get(object);
        const morphs = [], owned = [];
        let jaw = null;
        object.traverse(node => {
            const dictionary = node.morphTargetDictionary;
            const name = dictionary && Object.keys(dictionary).find(key => /^(jaw[_ -]?open|mouth[_ -]?open|viseme[_ -]?(aa|a))$/i.test(key));
            if (name && node.morphTargetInfluences) morphs.push({ mesh: node, index: dictionary[name], base: 0 });
            const bones = node.skeleton && node.skeleton.bones;
            if (!jaw && bones) jaw = bones.find(bone => /^(.*[:_])?(jaw|lowerjaw)$/i.test(bone.name)) || null;
        });
        // A rig's authored jaw/open-mouth shape wins. Otherwise use a small,
        // smooth lip morph around the designated mouth and lip points.
        const rest = object.__reactorLandmarkRest;
        if (!morphs.length && !jaw && rest && rest.points.mouth) {
            const center = rest.points.mouth;
            const height = Math.max(0.0001, object.userData.glbSize?.y || 1);
            const lipSpan = rest.points.upperLip && rest.points.lowerLip
                ? rest.points.upperLip.distanceTo(rest.points.lowerLip) : 0;
            const up = lipSpan > 0 ? rest.points.upperLip.clone().sub(rest.points.lowerLip).normalize() : new THREE.Vector3(0, 1, 0);
            const forward = new THREE.Vector3(0, 0, 1).addScaledVector(up, -up.z).normalize();
            if (!forward.lengthSq()) forward.set(1, 0, 0);
            const right = new THREE.Vector3().crossVectors(up, forward).normalize();
            const radiusX = lipSpan ? Math.max(height * 0.025, Math.min(height * 0.065, lipSpan * 2.4)) : height * 0.06;
            const radiusY = lipSpan ? Math.max(height * 0.012, lipSpan * 1.25) : height * 0.045;
            const radiusZ = lipSpan ? Math.max(height * 0.015, lipSpan * 1.4) : height * 0.065;
            const opening = lipSpan ? Math.min(height * 0.035, lipSpan * 0.9) : height * 0.035;
            const scratch = new THREE.Vector3();
            const influence = point => {
                scratch.copy(point).sub(center);
                const distance = Math.pow(scratch.dot(right) / radiusX, 2)
                    + Math.pow(scratch.dot(up) / radiusY, 2) + Math.pow(scratch.dot(forward) / radiusZ, 2);
                return Math.pow(Math.max(0, 1 - distance), 2);
            };
            for (const entry of rest.meshes) {
                const mesh = entry.mesh, original = mesh.geometry;
                if (!original.getAttribute("position")) continue;
                const blended = new THREE.Matrix4(), vertexToModel = new THREE.Matrix4();
                const vertexMatrix = (geometry, i) => {
                    const indices = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
                    const skin = entry.skin && indices && weights ? entry.skin : null;
                    if (!skin) return vertexToModel.copy(entry.matrix);
                    blended.elements.fill(0);
                    for (let j = 0; j < 4; j++) {
                        const weight = weights.getComponent(i, j), matrix = skin.matrices[indices.getComponent(i, j)];
                        if (matrix && weight) for (let k = 0; k < 16; k++) blended.elements[k] += matrix.elements[k] * weight;
                    }
                    return vertexToModel.copy(entry.matrix).multiply(skin.inverse).multiply(blended).multiply(skin.bind);
                };
                const originalPosition = original.getAttribute("position"), modelPoints = new Float32Array(originalPosition.count * 3);
                const local = new THREE.Vector3(), model = new THREE.Vector3(), delta = new THREE.Vector3();
                for (let i = 0; i < originalPosition.count; i++) {
                    model.fromBufferAttribute(originalPosition, i).applyMatrix4(vertexMatrix(original, i)).toArray(modelPoints, i * 3);
                }
                const split = lipSpan > height * 0.001 ? splitLipSeam(original, modelPoints, center, up, influence, vertexMatrix) : null;
                const geometry = split ? split.geometry : original.clone(), position = geometry.getAttribute("position");
                const values = new Float32Array(position.count * 3), directionInverse = new THREE.Matrix3();
                let affected = 0;
                for (let i = 0; i < position.count; i++) {
                    local.fromBufferAttribute(position, i);
                    const matrix = vertexMatrix(geometry, i);
                    model.copy(local).applyMatrix4(matrix);
                    const weight = influence(model);
                    const forcedSide = split && i >= split.originalCount ? split.extra[i - split.originalCount].side : 0;
                    const side = (forcedSide || Math.sign(model.clone().sub(center).dot(up))) >= 0 ? 0.25 : -1;
                    delta.copy(up).multiplyScalar(opening * side * weight)
                        .applyMatrix3(directionInverse.setFromMatrix4(matrix.invert()));
                    if (weight > 0.001) affected++;
                    if (!geometry.morphTargetsRelative) delta.add(local);
                    delta.toArray(values, i * 3);
                }
                if (!affected) { geometry.dispose(); continue; }
                geometry.morphAttributes.position = (geometry.morphAttributes.position || []).slice();
                const index = geometry.morphAttributes.position.length;
                geometry.morphAttributes.position.push(new THREE.BufferAttribute(values, 3));
                for (const kind of Object.keys(geometry.morphAttributes)) {
                    if (kind === "position" || !geometry.morphAttributes[kind].length) continue;
                    const base = geometry.getAttribute(kind);
                    if (base) geometry.morphAttributes[kind].push(geometry.morphTargetsRelative
                        ? new THREE.BufferAttribute(new Float32Array(base.count * base.itemSize), base.itemSize) : base.clone());
                }
                const oldWeights = mesh.morphTargetInfluences, oldNames = mesh.morphTargetDictionary;
                mesh.geometry = geometry; mesh.updateMorphTargets();
                if (oldWeights) oldWeights.forEach((value, i) => { mesh.morphTargetInfluences[i] = value; });
                const cavity = split && rest.interior !== "none" ? makeMouthInterior(mesh, geometry, index,
                    split.seams, vertexMatrix, forward, opening * 0.6, influence, rest.interiorColor || "#080808") : null;
                owned.push({ mesh, original, geometry, oldWeights, oldNames, cavity });
                morphs.push({ mesh, index, base: 0 });
                if (cavity) morphs.push({ mesh: cavity, index: 0, base: 0 });
            }
        }
        const rotation = jaw ? new THREE.Quaternion() : null;
        let applied = false;
        const driver = {
            kind: morphs.length ? (owned.length ? "lipMorph" : "morph") : jaw ? "jaw" : "none",
            restore() {
                if (!applied) return;
                if (morphs.length) for (const entry of morphs) entry.mesh.morphTargetInfluences[entry.index] = entry.base;
                else if (jaw) jaw.quaternion.copy(rotation);
                for (const entry of owned) if (entry.cavity) entry.cavity.visible = false;
                applied = false;
            },
            apply(value) {
                this.restore();
                if (morphs.length) for (const entry of morphs) {
                    entry.base = entry.mesh.morphTargetInfluences[entry.index] || 0;
                    entry.mesh.morphTargetInfluences[entry.index] = Math.min(1, entry.base + value);
                } else if (jaw) { rotation.copy(jaw.quaternion); jaw.rotation.x += value * 0.28; }
                for (const entry of owned) if (entry.cavity) entry.cavity.visible = value > 0.0001;
                applied = true;
            },
            dispose() {
                this.restore();
                for (const entry of owned) {
                    entry.mesh.geometry = entry.original;
                    entry.mesh.morphTargetInfluences = entry.oldWeights;
                    entry.mesh.morphTargetDictionary = entry.oldNames;
                    entry.geometry.dispose();
                    if (entry.cavity) { entry.cavity.removeFromParent(); entry.cavity.geometry.dispose(); entry.cavity.material.dispose(); }
                }
                drivers.delete(object);
            }
        };
        drivers.set(object, driver);
        return driver;
    }

    function stop(character) {
        const state = active.get(character);
        if (!state) return;
        active.delete(character);
        trackedBuffers.set(state.buffer, Math.max(0, (trackedBuffers.get(state.buffer) || 1) - 1));
        state.driver?.restore();
        if (state.owned) { state.buffer.stop(); state.buffer.destroy(); }
    }

    /** Attach a voice system's existing WebAudio buffer without taking ownership. */
    function attach(character, buffer, owned = false) {
        stop(character);
        if (!character || !buffer) return 0;
        const state = { token: ++serial, buffer, owned, object: null, driver: null };
        active.set(character, state);
        trackedBuffers.set(buffer, (trackedBuffers.get(buffer) || 0) + 1);
        // Loading already-ready clips must also populate the cache immediately.
        const cache = () => { for (const chunk of buffer._buffers || []) envelope(chunk); };
        cache(); buffer.addLoadListener?.(cache);
        buffer.addStopListener?.(() => { if (active.get(character) === state) stop(character); });
        return state.token;
    }

    function play(character, audio) {
        if (!character || !audio?.name || typeof AudioManager === "undefined") { stop(character); return 0; }
        const buffer = AudioManager.createBuffer("se/", audio.name);
        AudioManager.updateSeParameters(buffer, { volume: 90, pitch: 100, pan: 0, ...audio });
        const token = attach(character, buffer, true);
        const holder = R.modelHolderFor(character);
        if (holder?.object) prepare(holder.object);
        buffer.play(false);
        return token;
    }

    function tick(scene) {
        for (const [character, state] of active) {
            const buffer = state.buffer;
            if (buffer.isError?.() || !buffer.isPlaying()) { stop(character); continue; }
            const holder = scene._modelInstances?.get(R.modelInstanceKey(character));
            if (!holder?.object) { state.driver?.restore(); continue; }
            if (state.object !== holder.object) {
                state.driver?.restore(); state.object = holder.object; state.driver = prepare(holder.object);
            }
            // AudioContext time includes suspension and playback pitch; display
            // FPS and the text window's typewriter speed cannot desynchronize it.
            const seconds = typeof WebAudio !== "undefined" && Number.isFinite(buffer._startTime)
                ? (WebAudio._currentTime() - buffer._startTime) * buffer._pitch : buffer.seek();
            state.driver?.apply(levelAt(buffer, seconds));
        }
    }

    function target(interpreter, value) {
        const id = Number(value) || 0;
        return id < -1 && typeof $gamePlayer !== "undefined"
            ? $gamePlayer.followers().follower(-id - 2) : interpreter.character(id);
    }

    function startCommand(interpreter, args) {
        const character = target(interpreter, args.target);
        if (args.operation === "stop") { stop(character); return; }
        const token = play(character, { name: String(args.audio || ""), volume: Number(args.volume ?? 90),
            pitch: Number(args.pitch ?? 100), pan: Number(args.pan || 0) });
        // Message windows belong to Show Text. A non-waiting voice can run
        // alongside that command without changing its speaker or contents.
        interpreter._reactorSpeechWait = String(args.wait) !== "false"
            ? { target: args.target, token } : null;
        if (interpreter._reactorSpeechWait) interpreter.setWaitMode("reactorSpeech3D");
    }

    function install() {
        if (typeof WebAudio !== "undefined" && WebAudio.prototype._onDecode
            && !WebAudio.prototype._onDecode.__reactorSpeech3D) {
            const decode = WebAudio.prototype._onDecode;
            WebAudio.prototype._onDecode = function(chunk) {
                if (trackedBuffers.get(this)) envelope(chunk);
                return decode.apply(this, arguments);
            };
            WebAudio.prototype._onDecode.__reactorSpeech3D = true;
        }
        if (typeof Game_Interpreter !== "undefined" && !Game_Interpreter.prototype.updateWaitMode.__reactorSpeech3D) {
            const previous = Game_Interpreter.prototype.updateWaitMode;
            Game_Interpreter.prototype.updateWaitMode = function() {
                if (this._waitMode !== "reactorSpeech3D") return previous.apply(this, arguments);
                const wait = this._reactorSpeechWait;
                const character = wait && target(this, wait.target);
                let state = character && active.get(character);
                if (state && (state.buffer.isError?.() || !state.buffer.isPlaying())) { stop(character); state = null; }
                if (wait && state && state.token === wait.token) return true;
                this._reactorSpeechWait = null; this._waitMode = ""; return false;
            };
            Game_Interpreter.prototype.updateWaitMode.__reactorSpeech3D = true;
        }
        if (typeof PluginManager !== "undefined" && typeof PluginManager.registerCommand === "function" && !install.__command) {
            install.__command = true;
            PluginManager.registerCommand("RPGReactor", "SpeakModel3D", function(args) {
                startCommand(this, args);
            });
        }
        if (typeof Scene_Map !== "undefined" && !Scene_Map.prototype.update.__reactorSpeech3D) {
            const update = Scene_Map.prototype.update;
            Scene_Map.prototype.update = function() {
                for (const [character, state] of active) {
                    if (state.buffer.isError?.() || !state.buffer.isPlaying()) stop(character);
                }
                return update.apply(this, arguments);
            };
            Scene_Map.prototype.update.__reactorSpeech3D = true;
            const terminate = Scene_Map.prototype.terminate;
            Scene_Map.prototype.terminate = function() {
                for (const character of Array.from(active.keys())) stop(character);
                return terminate.apply(this, arguments);
            };
        }
    }

    const sync = R.MapScene.prototype.syncCharacterModels;
    R.MapScene.prototype.syncCharacterModels = function() {
        for (const state of active.values()) state.driver?.restore();
        const result = sync.apply(this, arguments); tick(this); return result;
    };
    const clear = R.MapScene.prototype.clear;
    R.MapScene.prototype.clear = function() {
        for (const character of Array.from(active.keys())) stop(character);
        for (const holder of this._modelInstances?.values() || []) drivers.get(holder.object)?.dispose();
        return clear.apply(this, arguments);
    };
    R.Speech = { RATE, envelope, levelAt, prepare, attach, play, stop, tick, active, install };
    install();
    if (typeof module !== "undefined" && module.exports) module.exports = R;
})(typeof globalThis !== "undefined" ? globalThis : this);
