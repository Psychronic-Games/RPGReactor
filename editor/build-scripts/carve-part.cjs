#!/usr/bin/env node
/**
 * Carve a named part out of a model by script, as the Select tool of
 * Database › 3D Models does by dragging a box: the part that turns with
 * the steering, a wheel that is not a piece of its own.
 *
 *   node editor/build-scripts/carve-part.cjs <project> <model> --name Steering --box x0,x1,y0,y1,z0,z1
 *        [--mesh i,j] [--pivot x,y,z] [--box ... [--mesh ...]]... [--except x0,x1,y0,y1,z0,z1]...
 *        [--add] [--remove] [--check] [--force] [--json]
 *
 *   <model>      the model's folder under 3d/ (Vehicles/kawashaki_ninja_h2)
 *   --name N     the part's name
 *   --box B      a box in model space (the model centered on x and z, standing on y = 0, in the file's own
 *                units): every connected piece whose middle lies in it is taken. Repeat it for more boxes
 *   --mesh I     carve indices, as describe-model.cjs lists them: after a --box, that box looks only in those
 *                meshes; before any --box, every box does
 *   --except B   a box whose pieces are left where they are, whatever box took them
 *   --pivot P    the point the part turns about (else the middle of what was taken)
 *   --add        add to the part of that name (else a part of that name is replaced)
 *   --remove     take the part of that name out
 *   --check      say what would be carved and write nothing
 *   --force      write although the editor has the project open
 *
 * A piece is a set of triangles joined through vertices that share a
 * place: a grip, a lever, a fender. A piece is taken whole or not at all,
 * so a box drawn through a fairing does not cut it. Its middle is the
 * middle of its own box; `describe-model.cjs <project> <model> --pieces
 * <mesh>` lists each mesh's pieces. Parts nest by size, as in the editor:
 * where two parts take the same triangles, the smaller is the child.
 *
 * What it writes is the Select tool's own format, in the model's
 * `model.json`: `parts[]: { name, pivot, meshes: { "<carve index>":
 * [[start, count]] } }`; every other key of the file is kept. A model
 * keeps a rig or carved parts, never both: a rigged model is refused, and
 * so is a name one of the file's own nodes has. Exit 0 carved, 1 refused
 * (nothing written), 2 bad usage.
 */
const fs = require('node:fs');
const path = require('node:path');
const validate = require('./validate-vehicles.cjs');

const round = (value, places = 3) => { const unit = Math.pow(10, places); return Math.round(Number(value) * unit) / unit; };
const inBox = (point, box) => point[0] >= box[0] && point[0] <= box[1] && point[1] >= box[2] && point[1] <= box[3] && point[2] >= box[4] && point[2] <= box[5];

/** Sorted triangle numbers as `[start, count]` runs. */
function runsOf(ids) {
    const runs = [];
    for (const id of ids) {
        const last = runs[runs.length - 1];
        if (last && id === last[0] + last[1]) last[1]++;
        else runs.push([id, 1]);
    }
    return runs;
}

/**
 * The connected pieces of one mesh: triangles joined through vertices at
 * the same place (welded to `quantum`, so a seam cut for its normals does
 * not part a piece). `positions` are x, y, z per vertex, `order` the
 * triangles' vertex numbers (null: three vertices a triangle, in order).
 * Each piece is `{ number, triangles, runs, box: [x0, x1, y0, y1, z0, z1],
 * middle }`, numbered by its first triangle.
 */
function pieces(positions, order, quantum) {
    const count = Math.floor(positions.length / 3), triangles = Math.floor((order ? order.length : count) / 3);
    const scale = 1 / Math.max(1e-9, quantum || 1e-4);
    const welded = new Int32Array(count), places = new Map();
    let places_ = 0;
    for (let i = 0; i < count; i++) {
        const key = Math.round(positions[i * 3] * scale) + ',' + Math.round(positions[i * 3 + 1] * scale) + ',' + Math.round(positions[i * 3 + 2] * scale);
        let id = places.get(key);
        if (id === undefined) { id = places_++; places.set(key, id); }
        welded[i] = id;
    }
    const parent = new Int32Array(places_);
    for (let i = 0; i < places_; i++) parent[i] = i;
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const vertex = n => (order ? order[n] : n);
    for (let t = 0; t < triangles; t++) {
        const a = find(welded[vertex(t * 3)]), b = find(welded[vertex(t * 3 + 1)]);
        if (a !== b) parent[a] = b;
        const c = find(welded[vertex(t * 3 + 2)]), b2 = find(b);
        if (c !== b2) parent[c] = b2;
    }
    const groups = new Map(), list = [];
    for (let t = 0; t < triangles; t++) {
        const root = find(welded[vertex(t * 3)]);
        let group = groups.get(root);
        if (!group) { group = { ids: [], box: [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity] }; groups.set(root, group); list.push(group); }
        group.ids.push(t);
        for (let k = 0; k < 3; k++) {
            const at = vertex(t * 3 + k) * 3;
            for (let axis = 0; axis < 3; axis++) {
                const value = positions[at + axis];
                if (value < group.box[axis * 2]) group.box[axis * 2] = value;
                if (value > group.box[axis * 2 + 1]) group.box[axis * 2 + 1] = value;
            }
        }
    }
    return list.map((group, number) => ({
        number, triangles: group.ids.length, runs: runsOf(group.ids), box: group.box,
        middle: [(group.box[0] + group.box[1]) / 2, (group.box[2] + group.box[3]) / 2, (group.box[4] + group.box[5]) / 2]
    }));
}

/** A model's pieces, mesh by mesh, found once: `piecesOf(model, carveIndex)`. */
function piecesOf(model, index) {
    const kept = model.pieces || (model.pieces = new Map());
    if (kept.has(index)) return kept.get(index);
    const mesh = model.meshes.find(each => each.index === index);
    const found = mesh ? pieces(mesh.positions, mesh.order, model.longest / 5000) : [];
    kept.set(index, found);
    return found;
}

/**
 * What a set of boxes takes of a model: every piece whose middle lies in
 * a box (`{ box, meshes }`, `meshes` the carve indices it looks in, null
 * for all) and in no box of `excepts`. `{ meshes: { "<index>": runs },
 * taken: [{ mesh, piece, triangles, box, middle }], triangles, box }`.
 */
function select(model, boxes, excepts = []) {
    const chosen = new Map(), taken = [];
    for (const mesh of model.meshes) {
        const mine = boxes.filter(each => !each.meshes || each.meshes.includes(mesh.index));
        if (!mine.length) continue;
        for (const piece of piecesOf(model, mesh.index)) {
            if (!mine.some(each => inBox(piece.middle, each.box)) || excepts.some(box => inBox(piece.middle, box))) continue;
            if (!chosen.has(mesh.index)) chosen.set(mesh.index, []);
            chosen.get(mesh.index).push(piece);
            taken.push({ mesh: mesh.index, piece: piece.number, triangles: piece.triangles, box: piece.box, middle: piece.middle });
        }
    }
    const meshes = {}, box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    let triangles = 0;
    for (const [index, list] of [...chosen].sort((a, b) => a[0] - b[0])) {
        const ids = [];
        for (const piece of list) {
            for (const [start, count] of piece.runs) for (let t = start; t < start + count; t++) ids.push(t);
            triangles += piece.triangles;
            for (let axis = 0; axis < 3; axis++) { box[axis * 2] = Math.min(box[axis * 2], piece.box[axis * 2]); box[axis * 2 + 1] = Math.max(box[axis * 2 + 1], piece.box[axis * 2 + 1]); }
        }
        meshes[String(index)] = runsOf(ids.sort((a, b) => a - b));
    }
    return { meshes, taken, triangles, box };
}

/** How many triangles a part's runs hold, and whether every one of them is among another's. */
const sizeOf = meshes => Object.values(meshes || {}).reduce((sum, runs) => sum + runs.reduce((n, run) => n + run[1], 0), 0);
function within(inner, outer) {
    for (const key of Object.keys(inner || {})) {
        const has = new Set();
        for (const [start, count] of (outer && outer[key]) || []) for (let t = start; t < start + count; t++) has.add(t);
        for (const [start, count] of inner[key]) for (let t = start; t < start + count; t++) if (!has.has(t)) return false;
    }
    return true;
}

/**
 * A carve, worked out: `order` is `{ name, boxes, excepts, pivot, add,
 * remove }`. Returns `{ part, taken, triangles, inside, holds, refused }`:
 * `part` the entry to write (`{ name, pivot, meshes }`), `inside` the
 * parts it is a piece of and `holds` the parts that are pieces of it (by
 * the triangles they share), `refused` the sentence when nothing can be
 * written.
 */
function carve(model, order) {
    const out = { part: null, taken: [], triangles: 0, inside: [], holds: [], refused: '' };
    const name = String(order.name || '').trim();
    if (!name) { out.refused = 'A part needs a name.'; return out; }
    if (model.rigged) { out.refused = `${model.name} has a rig: a model keeps a rig or carved parts, never both.`; return out; }
    if (model.nodes.includes(name)) { out.refused = `${name} is the name of one of the file's own parts: pick another.`; return out; }
    const others = (model.json && Array.isArray(model.json.parts) ? model.json.parts : []).filter(part => part && part.name !== name);
    const before = (model.json && Array.isArray(model.json.parts) ? model.json.parts : []).find(part => part && part.name === name) || null;
    if (order.remove) {
        if (!before) out.refused = `${model.name} has no part named ${name}.`;
        else out.part = { name, pivot: before.pivot, meshes: {} };
        return out;
    }
    // A model whose every mesh follows its own skeleton has nothing a carve can take: bones move it, not parts.
    if (!model.meshes.length) { out.refused = `${model.name} has no mesh a carve can take from${model.skinned && model.skinned.length ? ': its meshes follow the file\'s own skeleton' : ''}.`; return out; }
    for (const each of order.boxes || []) {
        const lost = (each.meshes || []).find(index => !model.meshes.some(mesh => mesh.index === index));
        if (lost !== undefined) { out.refused = `${model.name} has no mesh ${lost}: its carve indices run from 0 to ${model.meshes.length - 1}.`; return out; }
    }
    const found = select(model, order.boxes || [], order.excepts || []);
    if (!found.triangles) { out.refused = 'No piece has its middle in that box.'; return out; }
    let meshes = found.meshes;
    if (order.add && before) {
        const S = validate.world().VehicleSetup;
        meshes = Object.assign({}, before.meshes);
        for (const key of Object.keys(found.meshes)) meshes[key] = S.joinRuns(meshes[key], found.meshes[key]);
    }
    const pivot = order.pivot || (order.add && before && Array.isArray(before.pivot) ? before.pivot : [(found.box[0] + found.box[1]) / 2, (found.box[2] + found.box[3]) / 2, (found.box[4] + found.box[5]) / 2].map(value => round(value, 4)));
    out.part = { name, pivot, meshes };
    out.taken = found.taken;
    out.triangles = sizeOf(meshes);
    for (const other of others) {
        const mine = within(meshes, other.meshes), theirs = within(other.meshes, meshes);
        if (mine && (!theirs || sizeOf(other.meshes) > out.triangles)) out.inside.push(other.name);
        else if (theirs) out.holds.push(other.name);
    }
    return out;
}

module.exports = { pieces, piecesOf, select, carve, runsOf };

function usage(problem) {
    if (problem) console.error(problem);
    console.error('usage: carve-part.cjs <project> <model> --name Steering --box x0,x1,y0,y1,z0,z1 [--mesh i,j] [--pivot x,y,z]');
    console.error('       also: --box and --mesh repeated, --except x0,x1,y0,y1,z0,z1, --add, --remove, --check, --force, --json');
    process.exit(2);
}

if (require.main === module) {
    const argv = process.argv.slice(2), plain = [], order = { name: '', boxes: [], excepts: [], pivot: null, add: false, remove: false };
    let check = false, force = false, json = false, everywhere = null;
    const numbers = (text, count, what) => {
        const list = String(text).split(',').map(Number);
        if (list.length !== count || !list.every(Number.isFinite)) usage(`${what} takes ${count} numbers with commas between them`);
        return list;
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i], value = () => { if (i + 1 >= argv.length) usage(`${arg} needs a value`); return argv[++i]; };
        if (arg === '--name') order.name = String(value());
        else if (arg === '--box' || arg === '--except') {
            const b = numbers(value(), 6, arg);
            const box = [Math.min(b[0], b[1]), Math.max(b[0], b[1]), Math.min(b[2], b[3]), Math.max(b[2], b[3]), Math.min(b[4], b[5]), Math.max(b[4], b[5])];
            if (arg === '--box') order.boxes.push({ box, meshes: everywhere }); else order.excepts.push(box);
        } else if (arg === '--mesh') {
            const list = String(value()).split(',').map(Number);
            if (!list.length || !list.every(index => Number.isInteger(index) && index >= 0)) usage('--mesh takes carve indices with commas between them');
            if (order.boxes.length) order.boxes[order.boxes.length - 1].meshes = list; else everywhere = list;
        } else if (arg === '--pivot') order.pivot = numbers(value(), 3, '--pivot');
        else if (arg === '--add') order.add = true;
        else if (arg === '--remove') order.remove = true;
        else if (arg === '--check') check = true;
        else if (arg === '--force') force = true;
        else if (arg === '--json') json = true;
        else if (arg.startsWith('--')) usage(`unknown option ${arg}`);
        else plain.push(arg);
    }
    const [project, name] = plain;
    if (!project || !name || plain.length > 2) usage();
    if (!order.name) usage('--name says what the part is called');
    if (!order.remove && !order.boxes.length) usage('--box x0,x1,y0,y1,z0,z1 says what to take');
    if (!fs.existsSync(path.join(project, 'data', 'System.json'))) usage(`not a project: ${project} (no data/System.json)`);
    const loaded = validate.world(), lines = [];
    const finish = (code, more) => {
        if (json) console.log(JSON.stringify(Object.assign({ ok: code === 0, exit: code, lines }, more), null, 1));
        process.exit(code);
    };
    const refuse = (text, key = 'vehicleTool.refused') => {
        lines.push({ key, level: 'fix', text, args: {}, file: '', path: '' });
        if (!json) { console.log(`refused: ${text}`); console.log('nothing written'); }
        finish(1, { wrote: [] });
    };
    if (!loaded.Reactor3D) refuse(`the 3D world could not be loaded (${loaded.problem}): a model cannot be read`);
    let model = null;
    try { model = validate.loadModel(project, { name }, loaded); } catch (error) { refuse(error.message); }
    if (!model) refuse(`${validate.modelFile(project, name).relative} is missing.`);
    const done = carve(model, order);
    if (done.refused) refuse(done.refused);
    if (!check && !force && validate.lockOwner(project)) refuse(validate.TOOL['vehicleTool.locked'], 'vehicleTool.locked');
    const S = loaded.VehicleSetup;
    const text = S.withPart(model.text, done.part, { add: false, remove: order.remove });
    const changed = text !== model.text;
    if (!json) {
        if (order.remove) console.log(`${order.name}: taken out of ${model.name}`);
        else {
            const meshes = Object.keys(done.part.meshes);
            console.log(`${order.name}: ${done.triangles} triangles in ${meshes.length} mesh(es) (${meshes.join(', ')}), pivot (${done.part.pivot.map(value => round(value)).join(', ')})`);
            const perMesh = new Map();
            for (const piece of done.taken) perMesh.set(piece.mesh, (perMesh.get(piece.mesh) || []).concat([piece]));
            for (const [index, list] of perMesh) console.log(`  mesh ${index}: ${list.length} piece(s), ${list.reduce((sum, piece) => sum + piece.triangles, 0)} triangles`);
            if (done.inside.length) console.log(`  inside ${done.inside.join(', ')}: it turns with it, and by itself`);
            if (done.holds.length) console.log(`  holds ${done.holds.join(', ')}`);
        }
    }
    const wrote = [];
    if (check) { if (!json) console.log(changed ? `--check: would write ${model.sidecarRelative}; nothing written` : '--check: nothing would change'); }
    else if (changed) {
        validate.writeAtomic(model.sidecar, text);
        wrote.push(model.sidecarRelative);
        if (!json) console.log(`wrote ${model.sidecarRelative}`);
    } else if (!json) console.log('nothing to change');
    finish(0, { part: done.part, taken: done.taken, triangles: done.triangles, inside: done.inside, holds: done.holds, wrote, file: model.sidecarRelative });
}
