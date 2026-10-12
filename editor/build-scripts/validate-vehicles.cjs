#!/usr/bin/env node
/**
 * A project's vehicles, for a person or a generator to read before riding.
 *
 *   node editor/build-scripts/validate-vehicles.cjs <project> [--json] [--strict]
 *
 * Every vehicle type, every vehicle model, every vehicle placed on every
 * map: a type with no model or a model file that is missing, a kind the
 * game does not have, a key that is not a setting (with the one that was
 * probably meant), a rider's hand or foot on a part the model no longer
 * has or holding nothing, a party member who cannot reach the grips, a
 * wheel that also has a Spin motion, a sound that is missing, a vehicle
 * whose type is not in the Database or that stands where it does not fit,
 * a name two vehicles share. A line marked FIX stops the ride; a note does
 * not. The last line is "Ready to ride." when nothing is to fix.
 *
 * Exit 0 with nothing to fix (notes are allowed), 1 with a FIX line, 2 on
 * bad usage. `--strict` exits 1 on a note too. `--json` prints one JSON
 * document: `{ ok, exit, sentence, lines: [{ key, level, text, args, file,
 * path, value? }], types, vehicles, skipped }` (`file` is project-relative,
 * `path` the key inside it).
 *
 * What it reads:
 *
 *   data/ReactorVehicles.json   [null, { "id": 1, "name": "Motorcycle", "kind": "motorcycle",
 *                                 "model": { "name": "Vehicles/kawashaki_ninja_h2", "file": "kawashaki_ninja_h2" } }]
 *   3d/<model>/model.json       "vehicle": { "forward": "-x", "wheels": [...], "controls": [...], "seats": [...] }
 *   data/MapNNN.json            an event with "rrVehicle": { "type": 1, "yaw": 180 }
 *
 * The same checker (src/utils/VehicleCheck.js) will write the Vehicles
 * page's status line. make-vehicle.cjs, carve-part.cjs and
 * place-vehicle.cjs write the three by script; describe-model.cjs shows a
 * model. This file also holds what the five tools share: the project and
 * model readers, the measures of a model, the editor's lock test.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const battle = require('./validate-battle.cjs');

// The editor's own folder: editor/ in a source checkout, the app folder in a packaged editor.
const APP = battle.APP;
const source = (...parts) => path.join(APP, 'src', ...parts);
const three = id => String(id).padStart(3, '0');
const rel = (...parts) => parts.join('/');

// What a tool says that the editor never shows: English, keyed for --json.
const TOOL = {
    'vehicleTool.locked': 'The project is open in the editor. Close it, or pass --force.',
    'vehicleTool.noModelSide': 'The vehicle model code is not loaded ({why}): the model was not measured.',
    'vehicleTool.noRiderSide': 'The rider code is not loaded ({why}): the fit was not checked.'
};
const fill = (text, args) => String(text).replace(/\{(\w+)\}/g, (token, key) => (args && Object.prototype.hasOwnProperty.call(args, key) ? String(args[key]) : token));
/** A tool's own line: `{ key, level, text, args, file, path }`. */
const toolLine = (key, level, args, file) => ({ key, level, args: args || {}, text: fill(TOOL[key], args), file: file || '', path: '' });

let shared = null;
/**
 * What `validate-battle.cjs` loads (the battle checker, the editor's JSON
 * reader, the game's 3D world and physics), with the vehicle checker, the
 * pure helpers, and the game's vehicle and rider code (`Vehicles`,
 * `Rider`: null when the runtime has neither; `modelSide`, `riderSide`
 * say why).
 */
function world() {
    if (shared) return shared;
    const loaded = battle.world();
    shared = Object.assign({}, loaded, {
        VehicleSetup: require(source('event', 'VehicleSetup.js')), VehicleCheck: require(source('utils', 'VehicleCheck.js')),
        Vehicles: null, Rider: null, modelSide: '', riderSide: ''
    });
    const R = loaded.Reactor3D;
    for (const [file, namespace, usable, side] of [['reactor_3d_vehicles.js', 'Vehicles', 'typeOf', 'modelSide'], ['reactor_3d_rider.js', 'Rider', 'fit', 'riderSide']]) {
        if (!R) { shared[side] = loaded.problem || 'the 3D world could not be loaded'; continue; }
        try {
            // In the runtime's own list the file loads with the 3D world; until it is there, from the runtime's folder.
            if (!(R[namespace] && typeof R[namespace][usable] === 'function')) {
                const at = path.join(require(source('legacy', 'EditorPaths.js')).runtime(), file);
                if (fs.existsSync(at)) require(at);
                else shared[side] = `${file} is not in the runtime`;
            }
            if (R[namespace] && typeof R[namespace][usable] === 'function') { shared[namespace] = R[namespace]; shared[side] = ''; }
            else if (!shared[side]) shared[side] = `${file} has no ${usable}() yet`;
        } catch (error) {
            shared[side] = error && error.message ? error.message : String(error);
        }
    }
    return shared;
}

//-----------------------------------------------------------------------------
// The editor's lock.

/**
 * Whether the editor that wrote a project lock still runs: its process is
 * alive, and the lock was written since this machine started (a process id
 * is handed out again after a restart). The test of
 * `ProjectController.projectLockOwnerLives`.
 */
function ownerLives(lock) {
    if (!lock || !lock.pid) return false;
    let running = false;
    try { process.kill(lock.pid, 0); running = true; } catch (error) { running = !!error && error.code === 'EPERM'; }
    if (!running) return false;
    try {
        const bootedAt = Date.now() - os.uptime() * 1000;
        const openedAt = Date.parse(lock.openedAt);
        // Ten seconds of grace for a clock corrected at startup.
        if (Number.isFinite(openedAt) && Number.isFinite(bootedAt) && openedAt < bootedAt - 10000) return false;
    } catch (error) { /* no uptime to read: the process id's word stands */ }
    return true;
}

/** The project's lock when a living editor holds it; null otherwise (no lock, a lock nobody holds, one that cannot be read). */
function lockOwner(project) {
    const file = path.join(project, '.rpgreactor.lock');
    if (!fs.existsSync(file)) return null;
    try {
        const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
        return ownerLives(lock) ? lock : null;
    } catch (error) {
        return null;
    }
}

//-----------------------------------------------------------------------------
// The project's files.

/** A file's JSON, or `fallback` when it is absent; a file that is not JSON is named in `unreadable` and reads as `broken`. */
function readData(project, relative, unreadable, fallback = null, broken = undefined) {
    const file = path.join(project, ...relative.split('/'));
    if (!fs.existsSync(file)) return fallback;
    try { return world().RRJson.read(fs, file); } catch (error) { unreadable.push(relative); return broken === undefined ? fallback : broken; }
}

/** The plugins a project lists, as `[{ name, status }]`: a Reactor project's js/reactor_plugins.js, else js/plugins.js. */
function readPlugins(project) {
    for (const name of ['reactor_plugins.js', 'plugins.js']) {
        const file = path.join(project, 'js', name);
        if (!fs.existsSync(file)) continue;
        try {
            const text = fs.readFileSync(file, 'utf8');
            const list = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
            return (Array.isArray(list) ? list : []).filter(Boolean).map(plugin => ({ name: String(plugin.name || ''), status: !!plugin.status }));
        } catch (error) { /* a list this cannot read names no plugin */ }
    }
    return [];
}

/**
 * Where a model's files are: `{ name, file, ext, glb, relative, sidecar,
 * sidecarRelative, outside }`. The model file is `source/<file><ext>`
 * (`file` the last part of the name when not given), else the one `.glb`
 * in `source/` that is not a distance level; `glb` is null when there is
 * none. A name or a file that would lead out of the project's `3d` folder
 * (a `..`, a path in the file's name) is `outside`: it has no model file,
 * and no tool reads or writes there.
 */
function modelFile(project, name, file, ext) {
    const clean = String(name || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const folder = path.join(project, '3d', ...clean.split('/'));
    const out = { name: clean, file: String(file || '') || clean.split('/').pop() || '', ext: String(ext || '') || '.glb', glb: null, relative: '',
        sidecar: path.join(folder, 'model.json'), sidecarRelative: rel('3d', clean, 'model.json'), outside: false };
    out.outside = !clean || clean.split('/').some(part => part === '' || part === '.' || part === '..') || /[\\/]|^\.\.?$/.test(out.file) || /[\\/]/.test(out.ext);
    out.relative = rel('3d', clean, 'source', out.file + out.ext);
    if (out.outside) return out;
    const direct = path.join(folder, 'source', out.file + out.ext);
    if (fs.existsSync(direct)) out.glb = direct;
    else if (!file && fs.existsSync(path.join(folder, 'source'))) {
        const others = fs.readdirSync(path.join(folder, 'source')).filter(entry => /\.glb$/i.test(entry) && !/\.lod\d+\.glb$/i.test(entry));
        if (others.length === 1) { out.file = others[0].replace(/\.glb$/i, ''); out.ext = others[0].slice(out.file.length); out.glb = path.join(folder, 'source', others[0]); }
    }
    out.relative = rel('3d', clean, 'source', out.file + out.ext);
    return out;
}

/**
 * Everything the checker reads of a project: the Database lists, the
 * vehicle types, every map with its sidecar, each vehicle model's
 * `model.json`, the plugin list. A file that is not JSON is named in
 * `unreadable` and its checks are left out.
 */
function read(project) {
    const unreadable = [];
    const data = {
        system: readData(project, 'data/System.json', unreadable), actors: readData(project, 'data/Actors.json', unreadable),
        enemies: readData(project, 'data/Enemies.json', unreadable), troops: readData(project, 'data/Troops.json', unreadable),
        tilesets: readData(project, 'data/Tilesets.json', unreadable), bindings: readData(project, 'data/Database.r3d.json', unreadable),
        mapInfos: readData(project, 'data/MapInfos.json', unreadable), commonEvents: readData(project, 'data/CommonEvents.json', unreadable),
        types: readData(project, 'data/ReactorVehicles.json', unreadable), maps: [], models: {}, plugins: readPlugins(project), unreadable
    };
    if (data.types !== null && !Array.isArray(data.types)) { unreadable.push('data/ReactorVehicles.json'); data.types = null; }
    const folder = path.join(project, 'data');
    const ids = fs.existsSync(folder) ? fs.readdirSync(folder).map(name => /^Map(\d+)\.json$/.exec(name)).filter(Boolean).map(match => Number(match[1])).sort((a, b) => a - b) : [];
    for (const id of ids) {
        try {
            const map = battle.readMap(project, id);
            if (map) data.maps.push(map);
        } catch (error) {
            if (!error.unreadable) throw error;
            unreadable.push('data/' + error.unreadable);
        }
    }
    for (const record of Array.isArray(data.types) ? data.types : []) {
        const name = record && record.model && record.model.name;
        if (!name || Object.prototype.hasOwnProperty.call(data.models, name)) continue;
        const found = modelFile(project, name, record.model.file, record.model.ext);
        data.models[name] = found.outside ? null : readData(project, found.sidecarRelative, unreadable, null);
    }
    return data;
}

//-----------------------------------------------------------------------------
// A model, measured.

function glbParts(bytes) {
    // A whole file read by Node is its own buffer: used as it is. Anything else (a slice of a shared pool) is copied out.
    const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
    const buffer = whole ? bytes.buffer : new Uint8Array(bytes).buffer, view = new DataView(buffer);
    let offset = 12, json = null, bin = null;
    while (offset + 8 <= view.byteLength) {
        const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true), at = offset + 8;
        if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(buffer, at, length)));
        else if (type === 0x004E4942) bin = new Uint8Array(buffer, at, length);
        offset = at + length;
    }
    return { json, bin };
}

/** The squared distance from point (px, py, pz) to triangle abc. */
function triangleDistance2(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    let qx, qy, qz;
    if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
    else {
        const bpx = px - bx, bpy = py - by, bpz = pz - bz;
        const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
        if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
        else {
            const vc = d1 * d4 - d3 * d2;
            if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz; }
            else {
                const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
                const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
                if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
                else {
                    const vb = d5 * d2 - d1 * d6;
                    if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz; }
                    else {
                        const va = d3 * d6 - d5 * d4;
                        if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
                            const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
                            qx = bx + w * (cx - bx); qy = by + w * (cy - by); qz = bz + w * (cz - bz);
                        } else {
                            const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
                            qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w;
                        }
                    }
                }
            }
        }
    }
    const dx = px - qx, dy = py - qy, dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
}

const models = new Map();
/** A file as it is on disk now: one written over since it was read is read again. */
const fileStamp = file => { const stat = fs.statSync(file); return `${stat.size}:${stat.mtimeMs}`; };
/**
 * A model of a project as the game builds it, measured in model space
 * (centered on x and z, standing on y = 0, in the file's own units):
 *
 *   { name, file, ext, glb, relative, sidecar, sidecarRelative, text, json,   the files; `json` its model.json (null: none)
 *     template,                                                               the game's own template of it
 *     box: { min, max }, size: [x, y, z], longest,   of every mesh, plain or skinned
 *     meshes: [{ index, names, origin, triangles, box, positions, order, offset }],   the carve target meshes, in carve order
 *     skinned: [{ name, vertices, triangles, box, positions, order }],   the meshes that follow the file's own skeleton, at rest (no carve index)
 *     measured,                          false for a file with no mesh at all: its box is nothing and no surface is near
 *     parts: [names],                    every name a point or a rule can ride: file nodes, carved parts, bones
 *     nodes: [names],                    the file's own named nodes
 *     rigged,                            it has a rig (and so no carved parts)
 *     surface(at) -> distance,           from a point to its nearest surface, in model units
 *     nearest(at) -> { distance, mesh, triangle }   that surface: the carve index (-1 on a skinned mesh) and the triangle it is on
 *     carvedAt(mesh, triangle) -> [names]  the carved parts that hold a triangle, the smallest first
 *     partBox(name) -> [x0, x1, y0, y1, z0, z1] | null   a part's own box: a carved part's or a file node's
 *     within(name) -> [names]            the carved parts and file nodes every triangle of which is that part's:
 *                                        a motion on one of them moves the part's pieces too
 *     instance() -> { object, binding }  a copy built as the game builds one, at rest, unscaled
 *   }
 *
 * Null when the file is not there; throws when it cannot be read. The
 * model file is read and measured once per run (again when the file was
 * written over); its `model.json` is read again whenever its text has
 * changed, so a tool that has just written one sees it.
 */
function loadModel(project, spec, loaded = world()) {
    const R = loaded.Reactor3D;
    if (!R || !spec || !spec.name) return null;
    const found = modelFile(project, spec.name, spec.file, spec.ext);
    if (!found.glb) return null;
    const key = found.glb, stamp = fileStamp(found.glb);
    const kept = models.get(key);
    if (kept && kept.stamp === stamp) return kept.sidecarRead();
    const parts = glbParts(fs.readFileSync(found.glb));
    if (!parts.json) throw new Error(`${found.relative} is not a .glb the game can read`);
    const template = R.buildGlbTemplate(parts.json, parts.bin, '', null);
    template.updateMatrixWorld(true);
    // The model's own file, read by `sidecarRead` below.
    let text, json = null;
    const meshes = [], skinned = [], nodes = new Set(), bones = new Set();
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    // Every mesh is measured. Carve indices count over the plain meshes only (`carveTargetMeshes`): a mesh that
    // follows the file's own skeleton has none, and is measured where its bones hold it at rest.
    const targets = R.carveTargetMeshes(template), drawn = [];
    template.traverse(child => { if (child.isMesh && !(child.userData && child.userData.__reactorOverlay) && child.geometry) drawn.push(child); });
    const held = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
    drawn.forEach(mesh => {
        const attribute = mesh.geometry.getAttribute('position');
        if (!attribute) return;
        const index = targets.indexOf(mesh), boned = !!(mesh.isSkinnedMesh && mesh.skeleton && held && typeof mesh.applyBoneTransform === 'function');
        if (index < 0 && !boned) return;
        const count = attribute.count, positions = new Float32Array(count * 3);
        // A flattened template's mesh holds its vertices in the file's space and stands at the recentring offset.
        const matrix = mesh.matrixWorld.elements;
        if (boned) mesh.skeleton.update();
        for (let i = 0; i < count; i++) {
            let x = attribute.getX(i), y = attribute.getY(i), z = attribute.getZ(i);
            if (boned) { held.set(x, y, z); mesh.applyBoneTransform(i, held); x = held.x; y = held.y; z = held.z; }
            positions[i * 3] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
            positions[i * 3 + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
            positions[i * 3 + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
        }
        const source = mesh.geometry.getIndex();
        const order = source ? source.array : null;
        const triangles = Math.floor((order ? order.length : count) / 3);
        const box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
        for (let i = 0; i < count; i++) {
            for (let axis = 0; axis < 3; axis++) {
                const value = positions[i * 3 + axis];
                if (value < box[axis * 2]) box[axis * 2] = value;
                if (value > box[axis * 2 + 1]) box[axis * 2 + 1] = value;
            }
        }
        for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], box[axis * 2]); max[axis] = Math.max(max[axis], box[axis * 2 + 1]); }
        const chain = Array.isArray(mesh.userData.parts) ? mesh.userData.parts : [];
        for (const part of chain) nodes.add(part.name);
        const offset = [matrix[12], matrix[13], matrix[14]];
        // The innermost named node's own origin: where the file hinges this mesh.
        const pivot = chain[0] && Array.isArray(chain[0].pivot) ? chain[0].pivot : [0, 0, 0];
        const measure = { index, names: chain.map(part => part.name).reverse(), origin: [pivot[0] + offset[0], pivot[1] + offset[1], pivot[2] + offset[2]], triangles, box, positions, order, offset };
        if (index >= 0) meshes.push(measure);
        else skinned.push(Object.assign(measure, { index: -1, name: mesh.name || '', vertices: count }));
    });
    meshes.sort((a, b) => a.index - b.index);
    // With nothing to measure the box is nothing: `measured` says so, and no surface is asked.
    const surfaces = meshes.concat(skinned);
    if (!surfaces.length) { for (let axis = 0; axis < 3; axis++) { min[axis] = 0; max[axis] = 0; } }
    template.traverse(child => { if (child.isBone && child.name) bones.add(child.name); });
    const model = Object.assign(found, {
        stamp, text: null, json: null, template, box: { min, max }, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
        longest: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]), meshes, skinned, measured: surfaces.length > 0,
        parts: [], nodes: [...nodes], rigged: false,
        // What the model's own file adds: its text, its carved parts and bones among the names, whether it has a
        // rig. Read when the model is loaded and again whenever the file's text has changed; an instance built
        // from the text before is then let go.
        sidecarRead() {
            const now = fs.existsSync(model.sidecar) ? fs.readFileSync(model.sidecar, 'utf8') : null;
            if (now === text) return model;
            const parsed = now === null ? null : loaded.RRJson.parse(now);
            text = now; json = parsed;
            const named = new Set([...nodes, ...bones]);
            for (const part of (json && Array.isArray(json.parts) ? json.parts : [])) if (part && part.name) named.add(String(part.name));
            const rig = json && json.rig && Array.isArray(json.rig.bones) ? json.rig.bones : [];
            for (const bone of rig) if (bone && bone.name) named.add(String(bone.name));
            Object.assign(model, { text, json, parts: [...named], rigged: rig.length > 0, built: null });
            return model;
        },
        nearest(at) {
            const px = Number(at[0]) || 0, py = Number(at[1]) || 0, pz = Number(at[2]) || 0;
            let best = Infinity, where = -1, which = -1;
            for (const mesh of surfaces) {
                // A mesh whose box is further than the best found so far holds nothing nearer.
                const b = mesh.box;
                const dx = Math.max(b[0] - px, 0, px - b[1]), dy = Math.max(b[2] - py, 0, py - b[3]), dz = Math.max(b[4] - pz, 0, pz - b[5]);
                if (dx * dx + dy * dy + dz * dz >= best) continue;
                const p = mesh.positions, order = mesh.order;
                for (let t = 0; t < mesh.triangles; t++) {
                    const a = (order ? order[t * 3] : t * 3) * 3, b2 = (order ? order[t * 3 + 1] : t * 3 + 1) * 3, c = (order ? order[t * 3 + 2] : t * 3 + 2) * 3;
                    const far = triangleDistance2(px, py, pz, p[a], p[a + 1], p[a + 2], p[b2], p[b2 + 1], p[b2 + 2], p[c], p[c + 1], p[c + 2]);
                    if (far < best) { best = far; where = mesh.index; which = t; }
                }
            }
            return { distance: Math.sqrt(best), mesh: where, triangle: which };
        },
        surface(at) { return model.nearest(at).distance; },
        carvedAt(index, triangle) {
            const carved = json && Array.isArray(json.parts) ? json.parts.filter(part => part && part.name && part.meshes) : [];
            const count = part => Object.values(part.meshes).reduce((sum, runs) => sum + (Array.isArray(runs) ? runs.reduce((n, run) => n + run[1], 0) : 0), 0);
            return carved.filter(part => (part.meshes[String(index)] || []).some(run => triangle >= run[0] && triangle < run[0] + run[1]))
                .sort((a, b) => count(a) - count(b)).map(part => part.name);
        },
        partBox(name) {
            const box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
            const grow = (mesh, t) => {
                for (let k = 0; k < 3; k++) {
                    const at = (mesh.order ? mesh.order[t * 3 + k] : t * 3 + k) * 3;
                    for (let axis = 0; axis < 3; axis++) {
                        const value = mesh.positions[at + axis];
                        if (value < box[axis * 2]) box[axis * 2] = value;
                        if (value > box[axis * 2 + 1]) box[axis * 2 + 1] = value;
                    }
                }
            };
            const part = (json && Array.isArray(json.parts) ? json.parts : []).find(each => each && each.name === name && each.meshes);
            if (part) {
                for (const key of Object.keys(part.meshes)) {
                    const mesh = meshes.find(each => each.index === Number(key));
                    if (mesh) for (const [start, count] of part.meshes[key]) for (let t = start; t < Math.min(start + count, mesh.triangles); t++) grow(mesh, t);
                }
            } else {
                for (const mesh of meshes) if (mesh.names.includes(name)) for (let t = 0; t < mesh.triangles; t++) grow(mesh, t);
            }
            return Number.isFinite(box[0]) ? box : null;
        },
        within(name) {
            // The triangles a name holds, by carve index: a carved part's own runs, a file node's whole meshes.
            const carved = json && Array.isArray(json.parts) ? json.parts.filter(part => part && part.name && part.meshes) : [];
            const runsOf = each => {
                const part = carved.find(entry => entry.name === each);
                const out = {};
                if (part) for (const key of Object.keys(part.meshes)) out[key] = loaded.VehicleSetup.joinRuns(part.meshes[key], []);
                else for (const mesh of meshes) if (mesh.names.includes(each)) out[String(mesh.index)] = [[0, mesh.triangles]];
                return out;
            };
            const outer = runsOf(name);
            if (!Object.keys(outer).length) return [];
            const holds = (runs, start, count) => (runs || []).some(run => start >= run[0] && start + count <= run[0] + run[1]);
            const others = new Set(carved.map(part => part.name).concat(...meshes.map(mesh => mesh.names)));
            others.delete(name);
            return [...others].filter(each => {
                const inner = runsOf(each), keys = Object.keys(inner);
                return keys.length > 0 && keys.every(key => inner[key].length > 0 && inner[key].every(run => holds(outer[key], run[0], run[1])));
            });
        },
        instance() {
            if (model.built) return model.built;
            R.groundAnimatedTemplate && R.groundAnimatedTemplate(template, json);
            const object = R.cloneModelTemplate(template);
            if (R.applyModelTransform && R.readModelTransform) R.applyModelTransform(object, R.readModelTransform(json, spec));
            object.userData.glbSize = template.userData.glbSize;
            const bones = R.readModelRig ? R.readModelRig(json) : null;
            if (bones) R.applyModelRig(object, bones);
            else { R.carveModelParts(object, R.readModelParts(json)); R.applyPivotOverrides(object, R.readModelPivots(json)); }
            const binding = R.prepareModelInstance(object, object.__reactorClips);
            if (R.bindModelLandmarks && R.readModelLandmarks) R.bindModelLandmarks(object, R.readModelLandmarks(json));
            object.updateMatrixWorld(true);
            return (model.built = { object, binding });
        }
    });
    model.sidecarRead();
    models.set(key, model);
    return model;
}

/** A front as a unit vector on the ground from a block's `forward` (`"-x"`, a vector); null for neither. */
const frontOf = forward => world().VehicleCheck.frontOf(forward);

/**
 * The box the game's block reader is handed for a model: the game's own
 * measure of its template (`Reactor3D.Vehicles.boxOf`), with which the
 * reader looks at the model for a front its file does not name, as it
 * does in the game. The model's own measure where that code is not loaded.
 */
function readBox(model, loaded = world()) {
    if (!model) return null;
    const V = loaded.Vehicles;
    if (model.gameBox === undefined) {
        model.gameBox = null;
        if (V && typeof V.boxOf === 'function') { try { model.gameBox = V.boxOf(model.template) || null; } catch (error) { model.gameBox = null; } }
    }
    return model.gameBox || model.box;
}

/**
 * What `RRVehicleCheck.problems` is given for a project: the game's code,
 * whether a file exists, each model measured, each starting party
 * member's 3D body, the tiles a vehicle's model covers at its heading,
 * and what the stand test asks of the map.
 */
function lookups(project, data, loaded = world()) {
    const R = loaded.Reactor3D, S = loaded.VehicleSetup;
    const measured = R ? battle.models(project, loaded) : null;
    const db = { system: data.system, actors: data.actors, enemies: data.enemies, troops: data.troops, tilesets: data.tilesets, bindings: data.bindings, mapInfos: data.mapInfos };
    const bodies = new Map(), riders = new Map();
    const quiet = make => { try { return make(); } catch (error) { return null; } };
    return {
        system: data.system, actors: data.actors, enemies: data.enemies, troops: data.troops, tilesets: data.tilesets, bindings: data.bindings,
        Reactor3D: R, ReactorPhysics: loaded.ReactorPhysics, Vehicles: loaded.Vehicles, Rider: loaded.Rider, BattleCheck: loaded.BattleCheck,
        // A picture or a sound may be stored encrypted (a trailing underscore). A path that leads out of the project is no file of it.
        exists: relative => !relative.split('/').includes('..') && (fs.existsSync(path.join(project, ...relative.split('/'))) || fs.existsSync(path.join(project, ...(relative + '_').split('/')))),
        model: R ? spec => {
            const model = quiet(() => loadModel(project, spec, loaded));
            if (!model) return null;
            // The instance is built only when the fit asks for it: a carve of a quarter million triangles is not free.
            return { box: model.box, parts: model.parts, surface: model.surface, template: model.template, within: model.within,
                get object() { const built = quiet(() => model.instance()); return built ? built.object : null; } };
        } : null,
        rider: R ? actorId => {
            if (riders.has(actorId)) return riders.get(actorId);
            const entry = data.bindings && data.bindings.actors ? data.bindings.actors[String(actorId)] : null;
            const raw = entry ? (R.actorEntrySlots ? R.actorEntrySlots(entry).character : entry.character || entry) : null;
            const spec = raw && raw.name ? R.normalizeModelSpec(raw) : null;
            const model = spec ? quiet(() => loadModel(project, spec, loaded)) : null;
            const built = model ? quiet(() => model.instance()) : null;
            let body = null;
            if (built) {
                // Drawn at its bound size, as the game draws it: its longest side that many tiles.
                const extent = model.template.userData.glbSize || { x: 1, y: 1, z: 1 };
                built.object.scale.setScalar((spec.size || 2) * (spec.scale || 1) / Math.max(extent.x, extent.y, extent.z, 0.001));
                built.object.updateMatrixWorld(true);
                // The actor at that place in the list, as the game finds one.
                const actor = Array.isArray(data.actors) ? data.actors[Number(actorId)] : null;
                body = { name: (actor && actor.name) || `Actor ${actorId}`, object: built };
            }
            riders.set(actorId, body);
            return body;
        } : null,
        body: R ? (map, event, spec, yaw) => {
            const model = quiet(() => loadModel(project, spec, loaded));
            if (!model) return null;
            // The front the game takes: its own reader's, which looks at the model where the file names none.
            let front = loaded.Vehicles && typeof loaded.Vehicles.read === 'function' ? quiet(() => frontOf(loaded.Vehicles.read(model.json || {}, readBox(model, loaded)).f)) : null;
            // Without the game's code: the file's own word.
            const block = model.json && model.json.vehicle && typeof model.json.vehicle === 'object' ? model.json.vehicle : null;
            if (!front && block) front = frontOf(block.forward);
            // With no front known the long side still lies along the heading: the positive end leads.
            if (!front) front = model.size[0] >= model.size[2] ? [1, 0, 0] : [0, 0, 1];
            const direction = S.dir8OfYaw(yaw);
            const key = [spec.name, spec.file, spec.size, spec.scale, front.join(','), direction].join('|');
            if (bodies.has(key)) return bodies.get(key);
            const normal = R.normalizeModelSpec(Object.assign({}, spec, { faces: { front } }));
            const tiles = quiet(() => R.blockedTilesFor(model.template, model.json, normal, direction, 0, 0).map(tile => [tile.x, tile.y]));
            bodies.set(key, tiles);
            return tiles;
        } : null,
        unitBody: measured ? (map, event, unit) => measured.bodies(map, db)(event, unit) : null,
        props: measured ? map => measured.props(map) : null
    };
}

/** A project, checked: `{ data, report }`. `context` may hand in `data` (from `read`) and `loaded`. */
function check(project, context = {}) {
    const loaded = context.loaded || world(), data = context.data || read(project);
    return { data, report: loaded.VehicleCheck.problems(data, context.lookups || lookups(project, data, loaded)) };
}

/**
 * What to do about a front nobody has confirmed, where the model was looked
 * at: the end the game takes, and what writes it. Where the file carries a
 * guess that is another end than the front finder sees, both are said.
 */
function frontHint(line) {
    if ((line.key !== 'vehicleCheck.frontGuess' && line.key !== 'vehicleCheck.badFront') || !line.value) return '';
    if (line.taken && line.value !== line.taken) return ` The game takes ${line.taken}; the front finder says ${line.value} (make-vehicle.cjs --front ${line.value} writes it).`;
    return ` The game takes ${line.value} (make-vehicle.cjs --front ${line.value} ${line.key === 'vehicleCheck.badFront' ? 'writes' : 'confirms'} it).`;
}

/** A line as a tool prints it: its sentence, why a place was refused, the tile of a vehicle that does not fit, and the front the finder found. */
const lineText = line => line.text + (line.whyText ? ' ' + line.whyText : '') + (line.key === 'vehicleCheck.noFit' && Number.isFinite(line.x) ? ` (${line.x}, ${line.y})` : '') + frontHint(line);

/** A report as the lines this tool prints: `[{ mark: 'FIX' | 'note' | 'ok', text }]`, the sentence last. */
function print(report, loaded = world()) {
    const out = [], say = (mark, text) => out.push({ mark, text });
    for (const type of report.types) say('ok', `${type.name} (${type.id}): ${type.kind}${type.model ? `, ${type.model} at ${type.size} tiles` : ''}, on the maps ${type.placed} time(s)`);
    for (const vehicle of report.vehicles) {
        const type = report.types.find(each => each.id === vehicle.type);
        say('ok', `  ${three(vehicle.eventId)} ${vehicle.name} on ${vehicle.mapName} at (${vehicle.x}, ${vehicle.y}), facing ${loaded.VehicleSetup.faceWord(vehicle.yaw)} (${vehicle.yaw}): ${type ? type.name : 'type ' + vehicle.type}${vehicle.key ? `, named ${vehicle.key}` : ''}${vehicle.board === 'command' ? ', boarded by a command' : ''}`);
    }
    // A check that was left out is one of the report's own notes: printed once, counted in the sentence.
    for (const line of report.lines) say(line.level === 'fix' ? 'FIX' : 'note', lineText(line));
    say(report.ok ? 'ok' : 'FIX', report.sentence.text);
    return out;
}

/** The exit code a report asks for: 1 with a line to fix, and with `strict` on a note too (a check that was left out is a note). */
const exitOf = (report, strict) => (report.fixes > 0 || (strict && report.notes > 0) ? 1 : 0);

/** A report's lines as `--json` prints them: `{ key, level, text, args, file, path, value? }` and what else the line carries. */
const jsonLines = report => report.lines.map(line => Object.assign({ key: line.key, level: line.level, text: line.text + (line.whyText ? ' ' + line.whyText : ''), args: line.args, file: line.file, path: line.path }, line.value !== undefined ? { value: line.value } : {},
    line.mapId ? { mapId: line.mapId } : {}, line.eventId ? { eventId: line.eventId } : {}, line.typeId ? { typeId: line.typeId } : {}, line.skipped ? { skipped: line.skipped } : {}, line.taken ? { taken: line.taken } : {}));

/** A file written whole or not at all. */
function writeAtomic(file, text) {
    const temp = `${file}.tmp-${process.pid}`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temp, text, 'utf8');
    fs.renameSync(temp, file);
}

/** Forget every model read so far and give its memory back. (A `model.json` written since is read again without this.) */
const forget = () => models.clear();

module.exports = { APP, TOOL, toolLine, world, read, readPlugins, modelFile, loadModel, readBox, lookups, check, print, lineText, exitOf, jsonLines, lockOwner, ownerLives, writeAtomic, forget, frontOf, three };

if (require.main === module) {
    const args = process.argv.slice(2), json = args.includes('--json'), strict = args.includes('--strict');
    const unknown = args.find(arg => arg.startsWith('--') && !['--json', '--strict'].includes(arg));
    const plain = args.filter(arg => !arg.startsWith('--'));
    if (unknown || plain.length !== 1) { console.error(unknown ? `unknown option ${unknown}` : 'usage: validate-vehicles.cjs <project> [--json] [--strict]'); if (unknown) console.error('usage: validate-vehicles.cjs <project> [--json] [--strict]'); process.exit(2); }
    const project = plain[0];
    if (!fs.existsSync(path.join(project, 'data', 'System.json'))) { console.error(`not a project: ${project} (no data/System.json)`); process.exit(2); }
    const loaded = world(), { report } = check(project, { loaded });
    const code = exitOf(report, strict);
    if (json) {
        console.log(JSON.stringify({ ok: report.ok, exit: code, sentence: report.sentence.text, lines: jsonLines(report), types: report.types, vehicles: report.vehicles, skipped: report.skipped,
            modelSide: loaded.modelSide, riderSide: loaded.riderSide }, null, 1));
        process.exit(code);
    }
    if (loaded.problem) console.log(`note: the 3D world could not be loaded (${loaded.problem})`);
    else {
        if (loaded.modelSide) console.log(`note: ${fill(TOOL['vehicleTool.noModelSide'], { why: loaded.modelSide })}`);
        if (loaded.riderSide) console.log(`note: ${fill(TOOL['vehicleTool.noRiderSide'], { why: loaded.riderSide })}`);
    }
    const lines = print(report, loaded);
    for (const line of lines.slice(0, -1)) console.log(`${line.mark.padEnd(4)} ${line.text}`);
    console.log(lines[lines.length - 1].text);
    process.exit(code);
}
