#!/usr/bin/env node
/**
 * A model as a vehicle, in words and numbers: what a person sees in the 3D
 * Models page, for someone (or a generator) who has only a terminal.
 * It looks and writes nothing.
 *
 *   node editor/build-scripts/describe-model.cjs <project> <model> [--kind motorcycle] [--json] [--pieces <mesh>] [--min N]
 *
 *   <model>         the model's folder under 3d/ (Vehicles/kawashaki_ninja_h2)
 *   --kind K        the kind of vehicle its points are guessed for (motorcycle)
 *   --pieces I      list the connected pieces of the mesh with carve index I, for carve-part.cjs
 *   --min N         with --pieces: leave out pieces of fewer than N triangles
 *   --json          print the description as one JSON document
 *
 * Everything is in model space at the rest pose: the model centered on x
 * and z, standing on y = 0, in the file's own units (the space of
 * `model.json`'s `pivots`, of a carved part's pivot and of the `vehicle`
 * block's points). It prints:
 *
 *   front    which end is the front, and why (the file says so, a front mark on a map says so, or a guess)
 *   box      length, width and height along that front
 *   meshes   every mesh a carve can take from, with its carve index, the file's node names, its triangles,
 *            its box and its origin (where the file hinges it)
 *   skinned  the meshes that follow the file's own skeleton, measured where their bones hold them at rest
 *            (a carve cannot take from them)
 *   parts    the carved parts the model has, each with its triangles, its box and its pivot
 *   wheels   the wheels the finder sees: the part, its axle, its radius
 *   points   the kind's guessed rider points (seat, hands, feet), each with its distance to the nearest surface
 *
 * The front, the wheels and the guess are the game's own
 * (`Reactor3D.Vehicles`); without that code loaded those lines say so.
 * Exit 0, 1 when the model cannot be read, 2 on bad usage.
 */
const fs = require('node:fs');
const path = require('node:path');
const validate = require('./validate-vehicles.cjs');
const carver = require('./carve-part.cjs');

const round = (value, places = 3) => { const unit = Math.pow(10, places); const out = Math.round(Number(value) * unit) / unit; return Object.is(out, -0) ? 0 : out; };
const point = at => `(${at.map(value => round(value)).join(', ')})`;
const plain = text => String(text).replace(/[^\x20-\x7e]/g, '?');
const LIMB_WORDS = { seat: 'seat', handL: 'left hand', handR: 'right hand', footL: 'left foot', footR: 'right foot' };
const LIMBS = Object.keys(LIMB_WORDS);

/** Every front mark a use of this model carries on the project's maps: `[{ front: [x, y, z], where }]`. */
function frontMarks(project, name) {
    const marks = [], folder = path.join(project, 'data');
    if (!fs.existsSync(folder)) return marks;
    for (const file of fs.readdirSync(folder).filter(entry => /^Map\d+\.r3d\.json$/.test(entry)).sort()) {
        let side = null;
        try { side = validate.world().RRJson.read(fs, path.join(folder, file)); } catch (error) { continue; }
        const events = side && side.events && typeof side.events === 'object' ? side.events : {};
        for (const id of Object.keys(events)) {
            for (const page of Object.keys(events[id] || {})) {
                const spec = events[id][page];
                const front = spec && spec.name === name && spec.faces && Array.isArray(spec.faces.front) ? spec.faces.front.map(Number) : null;
                if (front && front.length >= 3 && front.every(Number.isFinite)) marks.push({ front, where: `${file.replace('.r3d.json', '')} event ${id}` });
            }
        }
    }
    return marks;
}

/** A unit vector on the ground as the axis word it is nearest: `-x`, `+z`. */
function axisWord(vector) {
    if (!vector) return '';
    return Math.abs(vector[0]) >= Math.abs(vector[2]) ? (vector[0] < 0 ? '-x' : '+x') : (vector[2] < 0 ? '-z' : '+z');
}

/** A model-space direction as the axis it mostly lies along, up and down included: `+x`, `-y`. */
function axisWord3(vector) {
    if (!Array.isArray(vector)) return '';
    let at = 0;
    for (let i = 1; i < 3; i++) if (Math.abs(Number(vector[i]) || 0) > Math.abs(Number(vector[at]) || 0)) at = i;
    return (Number(vector[at]) < 0 ? '-' : '+') + 'xyz'[at];
}

/**
 * The front in force and why. In order: what the model's own file says
 * (unless it lists the front as a guess), a front mark on a use of the
 * model, the game's finder. `{ forward, vector, why, guessed, hands }`;
 * `forward` is '' when nothing can say.
 */
function frontOf(project, model, kind, loaded) {
    const V = loaded.Vehicles, block = model.json && model.json.vehicle && typeof model.json.vehicle === 'object' ? model.json.vehicle : null;
    const listed = !!(block && Array.isArray(block.guessed) && block.guessed.includes('forward'));
    const own = block ? validate.frontOf(block.forward) : null;
    // A front the game's reader cannot take (a capital, a word, two numbers) is no front: the finder answers, and the caller says so.
    const unread = block && block.forward !== undefined && !own ? JSON.stringify(block.forward) : '';
    const answer = found => (unread ? Object.assign(found, { unread }) : found);
    if (own && !listed) return { forward: typeof block.forward === 'string' ? block.forward : axisWord(own), vector: own, why: 'the model\'s file says so', guessed: false };
    const marks = frontMarks(project, model.name);
    const marked = marks.map(mark => Object.assign({ vector: validate.frontOf(mark.front) }, mark)).find(mark => mark.vector);
    if (marked) return answer({ forward: axisWord(marked.vector), vector: marked.vector, why: `a front mark on ${marked.where} says so`, guessed: false });
    if (!V || typeof V.findFront !== 'function') {
        if (own) return { forward: axisWord(own), vector: own, why: 'guessed earlier; nobody has confirmed it', guessed: true };
        return answer({ forward: '', vector: null, why: `not known: ${loaded.modelSide || 'the vehicle model code is not loaded'}`, guessed: true });
    }
    let found = '';
    try { found = V.findFront(model.box, kind, model.instance().object, marks.map(mark => mark.front)); } catch (error) { found = ''; }
    const vector = validate.frontOf(found);
    if (!vector) return answer({ forward: '', vector: null, why: 'the finder gave no answer', guessed: true });
    // What the finder weighs: how near the kind's guessed hands lie to a surface at each end of the long side.
    const hands = {};
    if (typeof V.read === 'function') {
        const long = model.size[0] >= model.size[2] ? ['-x', '+x'] : ['-z', '+z'];
        for (const end of long) {
            try {
                const seat = V.read({ vehicle: { forward: end } }, model.box).seats[0];
                if (seat && seat.handL && seat.handR) hands[end] = [round(model.surface(seat.handL.at)), round(model.surface(seat.handR.at))];
            } catch (error) { /* a kind with no seat has no hands to weigh */ }
        }
    }
    const other = Object.keys(hands).find(end => end !== found);
    const why = hands[found] && other && Math.max(...hands[found]) < Math.max(...hands[other])
        ? `guessed: the hands find the bars at this end (${hands[found].join(' and ')} from a surface, against ${hands[other].join(' and ')} at ${other})`
        : 'guessed from the model\'s shape';
    return answer({ forward: found, vector, why, guessed: true, hands });
}

/** A seat's five points as `{ seat: { at, part, surface }, ... }`, each with its distance to the model's nearest surface (model units). */
function pointsOf(model, seat) {
    const out = {};
    for (const limb of LIMBS) {
        const entry = seat && seat[limb];
        if (!entry || !Array.isArray(entry.at)) continue;
        out[limb] = { at: entry.at.map(value => round(value, 4)), part: entry.part || '', surface: round(model.surface(entry.at)) };
    }
    return out;
}

/**
 * A model described: `{ model, file, sidecar, kind, front, box, unit,
 * meshes, parts, wheels, guess, points, pieces, notes }` (the head of this
 * file says what each is). `options`: `kind`, `pieces` (a carve index),
 * `min`. Null when the project has no such model file.
 */
function describe(project, name, options = {}, loaded = validate.world()) {
    const model = validate.loadModel(project, { name, file: options.file }, loaded);
    if (!model) return null;
    const V = loaded.Vehicles, C = loaded.VehicleCheck;
    const kinds = C.kindsOf({ Vehicles: V }), kind = Object.prototype.hasOwnProperty.call(kinds, options.kind || 'motorcycle') ? options.kind || 'motorcycle' : 'motorcycle';
    const notes = [];
    if (!V) notes.push(validate.toolLine('vehicleTool.noModelSide', 'note', { why: loaded.modelSide || 'the 3D world could not be loaded' }, model.sidecarRelative));
    if (!model.measured) notes.push({ key: 'vehicleTool.noMesh', level: 'note', text: 'the file has no mesh: there is nothing to measure', args: {}, file: model.relative, path: '' });
    const front = frontOf(project, model, kind, loaded);
    if (front.unread) notes.push({ key: 'vehicleCheck.badFront', level: 'fix', text: `the file's front ${front.unread} cannot be read: it is "+x", "-x", "+z", "-z" or three numbers`, args: { model: model.name, value: front.unread }, file: model.sidecarRelative, path: 'vehicle.forward' });
    const f = front.vector || (model.size[0] >= model.size[2] ? [1, 0, 0] : [0, 0, 1]);
    const along = Math.abs(f[0]) >= Math.abs(f[2]) ? 0 : 2;
    const out = {
        model: model.name, file: model.relative, sidecar: model.json ? model.sidecarRelative : '', kind,
        front: { forward: front.forward, why: front.why, guessed: front.guessed },
        box: { length: round(model.size[along]), width: round(model.size[along === 0 ? 2 : 0]), height: round(model.size[1]), min: model.box.min.map(value => round(value)), max: model.box.max.map(value => round(value)) },
        // One model unit in tiles when the model is drawn at the kind's own size.
        unit: round(kinds[kind].size / Math.max(1e-6, model.longest), 4), size: kinds[kind].size,
        meshes: [], skinned: [], parts: [], wheels: null, guess: null, points: null, pieces: null, notes
    };
    for (const mesh of model.skinned) out.skinned.push({ name: mesh.name, vertices: mesh.vertices, triangles: mesh.triangles, box: mesh.box.map(value => round(value)) });
    const carved = model.json && Array.isArray(model.json.parts) ? model.json.parts.filter(part => part && part.name && part.meshes) : [];
    // Names every mesh has above it say nothing about one mesh: left out of the list.
    const shared = model.meshes.length > 1 ? model.meshes[0].names.filter(each => model.meshes.every(mesh => mesh.names.includes(each))) : [];
    for (const mesh of model.meshes) {
        out.meshes.push({
            index: mesh.index, names: mesh.names.filter(each => !shared.includes(each)), triangles: mesh.triangles,
            box: mesh.box.map(value => round(value)), origin: mesh.origin.map(value => round(value)),
            carved: carved.filter(part => Array.isArray(part.meshes[String(mesh.index)]) && part.meshes[String(mesh.index)].length).map(part => part.name)
        });
    }
    const count = meshes => Object.values(meshes).reduce((sum, runs) => sum + runs.reduce((n, run) => n + run[1], 0), 0);
    for (const part of carved) {
        const partBox = model.partBox(part.name);
        out.parts.push({ name: part.name, pivot: (model.json.pivots && model.json.pivots[part.name]) || part.pivot, triangles: count(part.meshes), meshes: Object.keys(part.meshes).map(Number), box: partBox ? partBox.map(value => round(value)) : null });
    }
    if (V && front.forward && model.measured) {
        if (typeof V.findWheels === 'function') {
            try {
                out.wheels = (V.findWheels(model.instance().object, front.forward) || []).map(wheel => ({
                    part: wheel.part, with: wheel.with || [], at: Array.isArray(wheel.at) ? wheel.at.map(value => round(value)) : null,
                    radius: wheel.radius === null || wheel.radius === undefined ? null : round(wheel.radius), side: wheel.side || ''
                }));
            } catch (error) { notes.push({ key: 'vehicleTool.finder', level: 'note', text: `the wheel finder failed: ${error.message}`, args: {}, file: model.relative, path: '' }); }
        }
        if (kinds[kind].rider === 'seat' && typeof V.guess === 'function') {
            try {
                const guessed = V.guess(model.box, kind, model.instance().object);
                out.guess = { forward: typeof guessed.forward === 'string' ? guessed.forward : axisWord(validate.frontOf(guessed.forward)), points: pointsOf(model, guessed.seats && guessed.seats[0]) };
            } catch (error) { notes.push({ key: 'vehicleTool.finder', level: 'note', text: `the guess failed: ${error.message}`, args: {}, file: model.relative, path: '' }); }
        }
    }
    const block = model.json && model.json.vehicle && typeof model.json.vehicle === 'object' ? model.json.vehicle : null;
    if (block && Array.isArray(block.seats) && block.seats[0]) out.points = pointsOf(model, block.seats[0]);
    if (options.pieces !== undefined && options.pieces !== null) {
        const index = Number(options.pieces), min = Math.max(1, Number(options.min) || 1);
        const all = carver.piecesOf(model, index);
        out.pieces = { mesh: index, count: all.length, shown: 0, list: [] };
        for (const piece of all) {
            if (piece.triangles < min) continue;
            out.pieces.list.push({ number: piece.number, triangles: piece.triangles, runs: piece.runs, box: piece.box.map(value => round(value)), middle: piece.middle.map(value => round(value)) });
        }
        out.pieces.shown = out.pieces.list.length;
    }
    return out;
}

/** A description as the lines this tool prints. */
function print(told) {
    const lines = [], say = text => lines.push(text);
    const box = b => `x ${b[0]}..${b[1]}  y ${b[2]}..${b[3]}  z ${b[4]}..${b[5]}`;
    say(`${told.model}   ${told.file}${told.sidecar ? '' : '   (no model.json)'}`);
    say('in model space: centered on x and z, standing on y = 0, in the file\'s own units');
    say(`front       ${told.front.forward || '?'} (${told.front.why})`);
    say(`box         ${told.box.length} long, ${told.box.width} wide, ${told.box.height} tall (x ${told.box.min[0]}..${told.box.max[0]}, y ${told.box.min[1]}..${told.box.max[1]}, z ${told.box.min[2]}..${told.box.max[2]})`);
    say(`size        a ${told.kind} is drawn ${told.size} tiles long when its record has no size: one unit is then ${told.unit} tiles`);
    say(`meshes      ${told.meshes.length} (carve index: the file's nodes, triangles, box, origin)`);
    for (const mesh of told.meshes) {
        say(`  ${String(mesh.index).padStart(3)}  ${plain(mesh.names.join(' > ')) || '(unnamed)'}  ${mesh.triangles} triangles  ${box(mesh.box)}  origin ${point(mesh.origin)}${mesh.carved.length ? `  carved: ${mesh.carved.join(', ')}` : ''}`);
    }
    if (told.skinned.length) {
        say(`skinned     ${told.skinned.length} that follow the file's own skeleton, measured at rest (a carve cannot take from them)`);
        for (const mesh of told.skinned) say(`    -  ${plain(mesh.name) || '(unnamed)'}  ${mesh.triangles} triangles  ${box(mesh.box)}`);
    }
    if (told.parts.length) {
        say(`parts       ${told.parts.length} carved`);
        for (const part of told.parts) say(`  ${part.name}: ${part.triangles} triangles in mesh(es) ${part.meshes.join(', ')}${part.box ? `  ${box(part.box)}` : ''}  pivot ${point(part.pivot)}`);
    } else say('parts       none carved');
    if (told.wheels === null) say('wheels      not looked for');
    else if (!told.wheels.length) say('wheels      none found');
    else {
        say(`wheels      ${told.wheels.length} found`);
        for (const wheel of told.wheels) say(`  ${plain(wheel.part)}${wheel.with.length ? ` with ${wheel.with.map(plain).join(', ')}` : ''}: axle ${wheel.at ? point(wheel.at) : '?'}, radius ${wheel.radius === null ? '?' : wheel.radius}`);
    }
    const points = (title, set) => {
        say(title);
        for (const limb of LIMBS) {
            if (!set[limb]) continue;
            say(`  ${LIMB_WORDS[limb].padEnd(11)} ${point(set[limb].at).padEnd(26)} ${set[limb].surface} from the surface${set[limb].part ? `, on ${plain(set[limb].part)}` : ''}`);
        }
    };
    if (told.points) points('points      as the model\'s file has them', told.points);
    if (told.guess) points(`points      the ${told.kind}'s guess, dropped onto the model (front ${told.guess.forward})`, told.guess.points);
    else if (!told.points) say('points      not guessed');
    if (told.pieces) {
        say(`pieces      mesh ${told.pieces.mesh}: ${told.pieces.count} connected piece(s)${told.pieces.shown < told.pieces.count ? `, ${told.pieces.shown} shown` : ''} (number: triangles, box, middle)`);
        for (const piece of told.pieces.list) say(`  ${String(piece.number).padStart(4)}  ${String(piece.triangles).padStart(6)} triangles  ${box(piece.box)}  middle ${point(piece.middle)}`);
    }
    for (const note of told.notes) say(`note: ${note.text}`);
    return lines;
}

module.exports = { describe, print, frontMarks, frontOf, pointsOf, axisWord, axisWord3 };

function usage(problem) {
    if (problem) console.error(problem);
    console.error('usage: describe-model.cjs <project> <model> [--kind motorcycle] [--json] [--pieces <mesh>] [--min N]');
    process.exit(2);
}

if (require.main === module) {
    const argv = process.argv.slice(2), names = [], options = {};
    let json = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i], value = () => { if (i + 1 >= argv.length) usage(`${arg} needs a value`); return argv[++i]; };
        if (arg === '--kind') options.kind = String(value());
        else if (arg === '--pieces') { options.pieces = Number(value()); if (!Number.isInteger(options.pieces) || options.pieces < 0) usage('--pieces takes a carve index'); }
        else if (arg === '--min') { options.min = Number(value()); if (!(options.min >= 1)) usage('--min takes a number of triangles'); }
        else if (arg === '--file') options.file = String(value());
        else if (arg === '--json') json = true;
        else if (arg.startsWith('--')) usage(`unknown option ${arg}`);
        else names.push(arg);
    }
    const [project, name] = names;
    if (!project || !name || names.length > 2) usage();
    if (!fs.existsSync(path.join(project, 'data', 'System.json'))) usage(`not a project: ${project} (no data/System.json)`);
    const loaded = validate.world();
    const fail = text => {
        if (json) console.log(JSON.stringify({ ok: false, exit: 1, lines: [{ key: 'vehicleTool.refused', level: 'fix', text, args: {}, file: '', path: '' }] }, null, 1));
        else console.log(`refused: ${text}`);
        process.exit(1);
    };
    if (!loaded.Reactor3D) fail(`the 3D world could not be loaded (${loaded.problem}): a model cannot be read`);
    if (options.kind && !Object.prototype.hasOwnProperty.call(loaded.VehicleCheck.kindsOf({ Vehicles: loaded.Vehicles }), options.kind)) fail(`${options.kind} is not a kind of vehicle.`);
    let told = null;
    try { told = describe(project, name, options, loaded); } catch (error) { fail(error.message); }
    if (!told) fail(`${validate.modelFile(project, name, options.file).relative} is missing.`);
    if (options.pieces !== undefined && !told.meshes.some(mesh => mesh.index === options.pieces)) {
        fail(told.meshes.length ? `${told.model} has no mesh ${options.pieces}: its carve indices run from 0 to ${told.meshes.length - 1}.` : `${told.model} has no mesh a carve can take from.`);
    }
    if (json) console.log(JSON.stringify(Object.assign({ ok: true, exit: 0, lines: told.notes }, told), null, 1));
    else for (const line of print(told)) console.log(line);
    process.exit(0);
}
