#!/usr/bin/env node
/**
 * Make or update a vehicle type by script, as Database › Vehicles › New
 * will by clicking: the record, the model's `vehicle` block, the sounds.
 *
 *   node editor/build-scripts/make-vehicle.cjs <project> --name "Motorcycle" --kind motorcycle
 *        --model Vehicles/kawashaki_ninja_h2 [--size N | --fit] [--id N] [--reguess] [--front -x|+x|-z|+z]
 *        [--file <glb name>] [--sounds-from <folder>] [--check] [--force] [--json] [--strict]
 *
 *   --name N        what the game calls it
 *   --kind K        motorcycle (the kind fills every number the record leaves out)
 *   --model M       the model's folder under 3d/
 *   --size N        its longest side in tiles
 *   --fit           the largest size at which every starting party member who has a 3D body reaches both grips
 *                   and puts a foot on the ground; says who set the limit
 *   --id N          update that record (else a type of the same name is updated, else the next id is taken)
 *   --reguess       guess the model's block again, over one it already has
 *   --front F       say which end of the model is the front (and so confirm it)
 *   --file F        the model file's name in source/, without .glb, when it is not the folder's
 *   --sounds-from D copy the kind's stock sounds the project lacks from this folder into audio/se
 *   --check         say what would be written and write nothing
 *   --force         write in spite of FIX lines, and although the editor has the project open
 *   --strict        a note refuses too
 *
 * It writes `data/ReactorVehicles.json` (the record; keys an updated
 * record already has are kept) and, when the model has no `vehicle` block
 * or with --reguess, the block into the model's `model.json`: the front
 * found, the wheels found, a seat with its hands and feet set down on the
 * surface, the steering line through the hands (`Reactor3D.Vehicles.guess`,
 * the game's own). A hand that lands on a carved part rides that part,
 * and the part both hands hold is what turns. A Spin motion on a part
 * that is a wheel is removed: a wheel rolls with the road. Every other
 * key of both files is kept.
 *
 * It prints "added N" or "updated N", then the fit report (the game's own
 * seat arithmetic, run here): the front and why, each point's distance to
 * the surface, each limb's reach, the wheels, the sounds; then the
 * validator's lines for this type. Exit 0 written, 1 refused or a FIX
 * line (nothing written), 2 bad usage.
 */
const fs = require('node:fs');
const path = require('node:path');
const validate = require('./validate-vehicles.cjs');
const describer = require('./describe-model.cjs');

const round = (value, places = 2) => { const unit = Math.pow(10, places); const out = Math.round(Number(value) * unit) / unit; return Object.is(out, -0) ? 0 : out; };
const percent = share => `${Math.round(Number(share) * 100)}%`;
const LIMB_WORDS = { seat: 'seat', handL: 'left hand', handR: 'right hand', footL: 'left foot', footR: 'right foot' };
const AUDIO_EXTS = ['.ogg', '.m4a', '.mp3', '.wav', '.flac'];
const FRONTS = ['-x', '+x', '-z', '+z'];

/** A guessed block as a model's file keeps it: what the game cannot work out again, and `guessed` naming what nobody has confirmed. */
function fileBlock(block, confirmed) {
    const out = { forward: block.forward };
    if (block.stand) out.stand = { lean: block.stand.lean, side: block.stand.side };
    // A wheel's axle and radius are its part's own box: written only as names.
    out.wheels = (block.wheels || []).map(wheel => (wheel.with && wheel.with.length ? { part: wheel.part, with: wheel.with.slice() } : wheel.part));
    out.controls = (block.controls || []).map(control => {
        const entry = { input: control.input, shape: control.shape, part: control.part || '' };
        if (Array.isArray(control.at)) entry.at = control.at.map(value => round(value, 3));
        entry.axis = control.axis.map(value => round(value, 3));
        entry.degrees = control.degrees;
        entry.degreesAtSpeed = control.degreesAtSpeed;
        return entry;
    });
    out.seats = (block.seats || []).map(seat => {
        const entry = { posture: seat.posture };
        for (const limb of Object.keys(LIMB_WORDS)) {
            const point = seat[limb];
            if (!point || !Array.isArray(point.at)) continue;
            entry[limb] = { at: point.at.map(value => round(value, 3)) };
            if (point.part) entry[limb].part = point.part;
            if (Array.isArray(point.along)) entry[limb].along = point.along.map(value => round(value, 3));
        }
        return entry;
    });
    const guessed = ['forward', 'seats', 'wheels', 'controls'].filter(name => !(name === 'forward' && confirmed));
    if (guessed.length) out.guessed = guessed;
    return out;
}

/**
 * The carved part a point lies on: the smallest part that holds the
 * triangle nearest to it, when that surface is within a hundredth of the
 * model's length. '' for a point on the body.
 */
function partUnder(model, at) {
    const hit = model.nearest(at);
    if (!(hit.distance <= model.longest / 100) || hit.mesh < 0) return '';
    return model.carvedAt(hit.mesh, hit.triangle)[0] || '';
}

/**
 * A guessed block bound to the model's carved parts: each hand rides the
 * part it landed on, and a part both hands hold is what turns, about its
 * own pivot along the guessed line.
 */
function bindParts(model, block) {
    const seat = block.seats && block.seats[0];
    if (!seat) return block;
    for (const limb of ['handL', 'handR']) if (seat[limb] && Array.isArray(seat[limb].at)) seat[limb].part = partUnder(model, seat[limb].at);
    const held = seat.handL && seat.handR && seat.handL.part && seat.handL.part === seat.handR.part ? seat.handL.part : '';
    const control = (block.controls || []).find(each => each.input === 'steer');
    if (held && control) {
        control.part = held;
        const pivots = (model.json && model.json.pivots) || {}, part = (model.json.parts || []).find(each => each && each.name === held);
        const pivot = Array.isArray(pivots[held]) ? pivots[held] : part && Array.isArray(part.pivot) ? part.pivot : null;
        if (pivot) control.at = pivot.slice(0, 3);
    }
    return block;
}

/** Where the kind's stock sound of a name can be copied from: a file of that name in `folder`, in a format the game plays. */
function stockSound(folder, name) {
    if (!folder) return null;
    for (const ext of AUDIO_EXTS) {
        const file = path.join(folder, name + ext);
        if (fs.existsSync(file)) return { file, ext };
    }
    return null;
}

/** The folder the editor ships a kind's stock sounds in, when it ships them. */
const stockFolder = () => { const folder = path.join(validate.APP, 'vehicle-sounds'); return fs.existsSync(folder) ? folder : ''; };

/**
 * The fit report's lines for a type: the front, each rider point, the
 * wheels, the sounds. `fit` is `Reactor3D.Rider.fit`'s report for the
 * rider shown (null: nobody to measure), `scale` tiles a model unit.
 */
function fitReport(told) {
    const { model, block, fit, scale, front, sounds, name } = told, lines = [];
    const say = (label, text) => lines.push(`  ${label.padEnd(11)} ${text}`);
    say('front', `${front.forward || '?'} (${front.why})`);
    const seat = block && block.seats && block.seats[0];
    const near = at => (model ? `${round(model.surface(at) * scale)} from the surface` : '');
    if (seat && seat.seat) {
        const more = fit && fit.seated ? `; hips ${round(fit.hips.over)} over it; torso leans ${Math.round(fit.lean)} degrees` : '';
        say('seat', `${near(seat.seat.at)}${more}`);
        for (const limb of ['handL', 'handR', 'footL', 'footR']) {
            const point = seat[limb];
            if (!point || !Array.isArray(point.at)) { say(LIMB_WORDS[limb], 'no point: it stays in the stance'); continue; }
            const on = `on ${point.part || 'the body'}, ${near(point.at)}`;
            const measured = fit && fit.seated && fit.points ? fit.points[limb] : null;
            if (!measured) { say(LIMB_WORDS[limb], on); continue; }
            if (measured.short > 0.005) {
                const less = Number.isFinite(told.smaller) && told.smaller > 0 ? told.smaller : measured.reach > 1 ? fit.size * (1 - 1 / measured.reach) : measured.short;
                const what = limb.startsWith('hand') ? 'grip' : 'rest';
                say(LIMB_WORDS[limb], `${round(measured.short)} short of its ${what}. Move the ${what} ${round(measured.short)} toward the seat (${describer.axisWord3(measured.toward)}), or make the vehicle ${Math.max(0.1, Math.ceil(less * 10 - 1e-9) / 10)} smaller.`);
            } else if (limb.startsWith('hand')) say(LIMB_WORDS[limb], `${on}, reaches at ${percent(measured.reach)} of the arm (${percent(measured.reachAtLock)} at full lock)`);
            else {
                const ground = fit.foot && limb === (fit.foot.side === 'right' ? 'footR' : 'footL') ? (fit.foot.reachesGround ? '; reaches the ground at a stop' : `; ${round(fit.foot.short)} short of the ground at a stop`) : '';
                say(LIMB_WORDS[limb], `${on}, knee ${measured.knee} degrees${ground}`);
            }
        }
    } else say('seat', told.inside ? 'none: the party is inside' : 'none');
    const wheels = (block && block.wheels) || [];
    if (wheels.length) {
        const radii = wheels.map(wheel => {
            const box = model && !(wheel.radius > 0) ? model.partBox(wheel.part) : null;
            const radius = wheel.radius > 0 ? wheel.radius : box ? (box[3] - box[2]) / 2 : NaN;
            return Number.isFinite(radius) ? round(radius * scale) : '?';
        });
        say('wheels', `${wheels.length} found: ${radii.join(' and ')} tiles`);
    } else say('wheels', 'none found');
    say('sounds', sounds.length ? sounds.map(sound => `${sound.slot} ${sound.name}`).join(', ') : 'none');
    return [`${name}`].concat(lines);
}

/**
 * A type made or updated, worked out and (unless `order.check`) written.
 * `order`: `name`, `kind`, `model`, `file`, `size`, `fit`, `id`,
 * `reguess`, `front`, `soundsFrom`, `check`, `force`, `strict`. Returns
 * `{ exit, refused, id, added, head, report: [text], lines: [checker
 * lines for this type], sentence, wrote: [project-relative], would: [...],
 * notes: [tool lines] }`.
 */
function make(project, order, loaded = validate.world()) {
    const S = loaded.VehicleSetup, C = loaded.VehicleCheck, V = loaded.Vehicles, Rider = loaded.Rider, RRJson = loaded.RRJson;
    const out = { exit: 1, refused: '', id: 0, added: false, head: '', report: [], lines: [], sentence: '', wrote: [], would: [], notes: [], size: null, fittedTo: '' };
    const refuse = text => { out.refused = text; return out; };
    const kinds = C.kindsOf({ Vehicles: V });
    const kind = String(order.kind || 'motorcycle');
    if (!Object.prototype.hasOwnProperty.call(kinds, kind)) return refuse(`${kind} is not a kind of vehicle. The kinds are ${Object.keys(kinds).join(', ')}.`);
    const name = String(order.name || '').trim();
    const found = validate.modelFile(project, order.model, order.file);
    if (found.outside) return refuse(`${order.model} is not a model of this project: a model is a folder under 3d/.`);
    if (!found.glb) return refuse(`${name}: the model file ${found.relative} is missing.`);

    // The record that will be written over, if any.
    const typesFile = path.join(project, 'data', 'ReactorVehicles.json'), typesRel = 'data/ReactorVehicles.json';
    const typesText = fs.existsSync(typesFile) ? fs.readFileSync(typesFile, 'utf8') : null;
    let list = [null];
    if (typesText !== null) {
        try { list = RRJson.parse(typesText); } catch (error) { return refuse(`${typesRel} cannot be read (not valid JSON).`); }
        if (!Array.isArray(list)) return refuse(`${typesRel} cannot be read (not a list).`);
    }
    // A type is its place in the list, whatever `id` its record carries: a record of this name at another place is another type.
    const named = (entry, index) => index > 0 && !!entry && typeof entry === 'object' && !Array.isArray(entry) && entry.name === name;
    const otherAt = order.id ? list.findIndex((entry, index) => named(entry, index) && index !== Number(order.id)) : -1;
    if (otherAt > 0) return refuse(`Another type is already named ${name} (${otherAt}).`);
    const before = S.typeAt(list, order.id ? order.id : list.findIndex(named));

    // The model, measured; without the 3D world it is written about but not looked at.
    let model = null;
    if (loaded.Reactor3D) { try { model = validate.loadModel(project, { name: found.name, file: found.file, ext: found.ext }, loaded); } catch (error) { return refuse(error.message); } }
    if (model && !model.measured) return refuse(`${found.relative} has no mesh: there is nothing to seat a rider on.`);
    const sidecarText = fs.existsSync(found.sidecar) ? fs.readFileSync(found.sidecar, 'utf8') : null;
    let json = null;
    if (sidecarText !== null) { try { json = RRJson.parse(sidecarText); } catch (error) { return refuse(`${found.sidecarRelative} cannot be read (not valid JSON).`); } }
    const raw = json && json.vehicle && typeof json.vehicle === 'object' && !Array.isArray(json.vehicle) ? json.vehicle : null;
    const marks = describer.frontMarks(project, found.name);
    const front = model ? describer.frontOf(project, model, kind, loaded) : { forward: '', why: 'not looked at', guessed: true };

    // The block: guessed for a model that has none (or again, when asked), else the one it has.
    let vehicle;
    if (!raw || order.reguess) {
        if (V && typeof V.guess === 'function' && model) {
            const known = order.front || (!front.guessed ? front.forward : '');
            const guessed = bindParts(model, V.guess(model.box, kind, model.instance().object, { forward: known || undefined, marks: marks.map(mark => mark.front) }));
            vehicle = fileBlock(guessed, !!known);
            if (order.front) { front.forward = order.front; front.why = 'said with --front'; front.guessed = false; }
            else if (!known) { front.forward = vehicle.forward; }
        } else {
            out.notes.push(validate.toolLine('vehicleTool.noModelSide', 'note', { why: loaded.modelSide || loaded.problem || 'the 3D world could not be loaded' }, found.sidecarRelative));
            if (order.front) vehicle = Object.assign({}, raw || {}, { forward: order.front });
        }
    } else if (order.front) {
        vehicle = Object.assign({}, raw, { forward: order.front });
        if (Array.isArray(vehicle.guessed)) { vehicle.guessed = vehicle.guessed.filter(each => each !== 'forward'); if (!vehicle.guessed.length) delete vehicle.guessed; }
        front.forward = order.front; front.why = 'said with --front'; front.guessed = false;
    }
    const inForce = vehicle !== undefined ? vehicle : raw;
    // The wheels' parts, and with each what lies wholly inside it: a carved wheel's rim is still the file's own
    // node too, and a Spin motion left on that node would turn the rim a second time.
    const wheelNames = [];
    for (const wheel of (inForce && Array.isArray(inForce.wheels) ? inForce.wheels : [])) {
        for (const part of C.wheelParts(wheel)) {
            for (const each of [part].concat(model ? model.within(part) : [])) if (!wheelNames.includes(each)) wheelNames.push(each);
        }
    }
    const spins = S.spinsOn(json, wheelNames);
    const changesModel = vehicle !== undefined || spins.length > 0;
    const modelText = changesModel ? S.mergeModel(sidecarText, vehicle, null, { removeSpins: wheelNames }) : sidecarText;
    const nextJson = changesModel ? JSON.parse(modelText) : json;
    // Read as the game reads it: with the game's own measure of the model, so a front the block does not name is the one the game finds.
    const block = V && typeof V.read === 'function' && model ? V.read(nextJson || {}, validate.readBox(model, loaded), kind) : null;

    // The size: said, fitted to the party, or what the record has.
    const riders = [];
    const data = validate.read(project), looks = validate.lookups(project, data, loaded);
    if (typeof looks.rider === 'function') {
        for (const actorId of (data.system && Array.isArray(data.system.partyMembers) ? data.system.partyMembers : [])) {
            const body = looks.rider(actorId);
            if (body) riders.push(body);
        }
    }
    let size = Number(order.size) > 0 ? Number(order.size) : null, how = size ? 'set by --size' : '';
    if (order.fit) {
        if (!Rider || typeof Rider.fitSize !== 'function') return refuse(`--fit cannot work: ${loaded.riderSide || 'the rider code is not loaded'}. Pass --size.`);
        if (!block || !model) return refuse(`--fit cannot work: ${loaded.modelSide || 'the model could not be measured'}. Pass --size.`);
        if (!riders.length) return refuse('--fit has nobody to fit to: no starting party member has a 3D body. Pass --size.');
        const fitted = Rider.fitSize(riders.map(body => body.object), model.instance().object, block, kind);
        if (!(fitted.size > 0)) return refuse('--fit found no size: the model has no seat to fit to. Pass --size.');
        size = fitted.size;
        const who = fitted.limitedBy >= 0 && riders[fitted.limitedBy] ? riders[fitted.limitedBy].name : '';
        out.fittedTo = who;
        how = who ? `fitted to ${who} (${fitted.reason === 'foot' ? 'a foot reaches the ground' : 'the shortest reach'})` : 'fitted to the party';
    }
    if (!size && before && before.model && Number(before.model.size) > 0) { size = Number(before.model.size); how = 'the record\'s size'; }
    const drawn = size || kinds[kind].size;
    if (!size) how = `the ${kind}'s own size: no size is set`;
    out.size = size;

    // The record, with the kind's stock sounds named where it names none.
    const record = { name, kind, model: Object.assign({ name: found.name, file: found.file }, found.ext !== '.glb' ? { ext: found.ext } : {}, size ? { size } : {}) };
    const stock = V && V.KINDS && V.KINDS[kind] && V.KINDS[kind].sounds ? V.KINDS[kind].sounds : null;
    if (stock) {
        const sounds = {}, had = (before && before.sounds && typeof before.sounds === 'object' ? before.sounds : {});
        for (const slot of C.SOUND_SLOTS) {
            if (Object.prototype.hasOwnProperty.call(had, slot) || !stock[slot] || !stock[slot].name) continue;
            sounds[slot] = { name: stock[slot].name, volume: stock[slot].volume, pitch: stock[slot].pitch };
        }
        if (Object.keys(sounds).length) record.sounds = sounds;
    }
    let typed = null;
    try { typed = S.withType(typesText, record, { id: order.id }); } catch (error) { return refuse(`${typesRel}: ${error.message}`); }
    out.id = typed.id; out.added = typed.added;
    const nextList = JSON.parse(typed.text), written = nextList[typed.id];

    // The stock sounds the project lacks, copied from where the editor keeps them.
    const copies = [], folder = order.soundsFrom || stockFolder();
    const inProject = sound => AUDIO_EXTS.some(ext => looks.exists(`audio/${sound.kind}/${sound.name}${ext}`));
    for (const sound of C.soundsOf(written, { Vehicles: V })) {
        if (sound.kind !== 'se' || inProject(sound)) continue;
        const from = stockSound(folder, sound.name);
        if (from) copies.push({ from: from.file, relative: `audio/se/${sound.name}${from.ext}` });
    }

    // The project as it would be, checked: this type's lines decide.
    data.types = nextList;
    data.models[found.name] = nextJson;
    const planned = new Set(copies.map(copy => copy.relative));
    const report = C.problems(data, Object.assign({}, looks, { exists: relative => planned.has(relative) || looks.exists(relative) }));
    // This type's lines, and the note of each check that had to be left out.
    out.lines = report.lines.filter(line => line.typeId === typed.id || line.skipped);
    const fixes = out.lines.filter(line => line.level === 'fix').length, notes = out.lines.length - fixes;
    out.sentence = C.sentenceOf(fixes, notes).text;
    out.skipped = report.skipped;

    // The fit report, for the rider with the least reach in hand.
    const scale = model ? drawn / Math.max(1e-6, model.longest) : 0;
    let shown = null, fit = null, smaller = NaN;
    if (Rider && typeof Rider.fit === 'function' && block && model && block.seats.length) {
        for (const body of riders) {
            let each = null;
            try { each = Rider.fit(body.object, model.instance().object, block, drawn); } catch (error) { each = null; }
            if (!each || !each.seated) continue;
            const reach = Math.max(each.points.handL ? each.points.handL.reach : 0, each.points.handR ? each.points.handR.reach : 0);
            if (!fit || (out.fittedTo ? body.name === out.fittedTo : reach > shown.reach)) { fit = each; shown = { body, reach }; }
        }
        if (fit && !fit.ok && typeof Rider.fitSize === 'function') { try { smaller = drawn - Rider.fitSize([shown.body.object], model.instance().object, block, kind).size; } catch (error) { smaller = NaN; } }
    } else if (!Rider) out.notes.push(validate.toolLine('vehicleTool.noRiderSide', 'note', { why: loaded.riderSide || 'the 3D world could not be loaded' }, found.sidecarRelative));
    out.head = `${name} (${typed.id}): ${found.name} at ${drawn} tiles, ${how}${shown && !out.fittedTo ? `, with ${shown.body.name} on it` : ''}`;
    out.report = fitReport({ model, block, fit, scale, front, smaller, sounds: C.soundsOf(written, { Vehicles: V }).filter(sound => sound.kind === 'se'), name: out.head, inside: kinds[kind].rider === 'inside' }).slice(1);
    if (spins.length) out.report.push(`  ${'motions'.padEnd(11)} removed ${spins.map(rule => rule.name || rule.part).join(', ')}: a wheel rolls with the road`);

    // What changes on disk.
    const changes = [];
    if (changesModel && modelText !== sidecarText) changes.push({ relative: found.sidecarRelative, file: found.sidecar, text: modelText });
    if (typed.text !== typesText) changes.push({ relative: typesRel, file: typesFile, text: typed.text });
    out.would = changes.map(change => change.relative).concat(copies.map(copy => copy.relative));
    const stopped = fixes > 0 || (order.strict && notes > 0);
    if (stopped && !order.force) { out.exit = 1; return out; }
    if (order.check) { out.exit = stopped ? 1 : 0; return out; }
    if (!order.force && validate.lockOwner(project)) { out.refused = validate.TOOL['vehicleTool.locked']; out.locked = true; return out; }
    for (const copy of copies) { fs.mkdirSync(path.dirname(path.join(project, ...copy.relative.split('/'))), { recursive: true }); fs.copyFileSync(copy.from, path.join(project, ...copy.relative.split('/'))); }
    for (const change of changes) validate.writeAtomic(change.file, change.text);
    out.wrote = out.would;
    out.exit = 0;
    return out;
}

module.exports = { make, fileBlock, bindParts, partUnder, fitReport, stockSound };

function usage(problem) {
    if (problem) console.error(problem);
    console.error('usage: make-vehicle.cjs <project> --name "Motorcycle" --kind motorcycle --model Vehicles/kawashaki_ninja_h2 [--size N | --fit] [--id N] [--reguess]');
    console.error('       also: --front -x|+x|-z|+z, --file <glb name>, --sounds-from <folder>, --check, --force, --json, --strict');
    process.exit(2);
}

if (require.main === module) {
    const argv = process.argv.slice(2), plain = [], order = {};
    let json = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i], value = () => { if (i + 1 >= argv.length) usage(`${arg} needs a value`); return argv[++i]; };
        if (arg === '--name') order.name = String(value());
        else if (arg === '--kind') order.kind = String(value());
        else if (arg === '--model') order.model = String(value());
        else if (arg === '--file') order.file = String(value()).replace(/\.glb$/i, '');
        else if (arg === '--size') { order.size = Number(value()); if (!(order.size > 0 && order.size <= 200)) usage('--size takes a length in tiles'); }
        else if (arg === '--fit') order.fit = true;
        else if (arg === '--id') { order.id = Number(value()); if (!Number.isInteger(order.id) || order.id < 1) usage('--id takes a record number from 1'); }
        else if (arg === '--reguess') order.reguess = true;
        else if (arg === '--front') { order.front = String(value()).toLowerCase(); if (/^[xz]$/.test(order.front)) order.front = '+' + order.front; if (!FRONTS.includes(order.front)) usage('--front is -x, +x, -z or +z'); }
        else if (arg === '--sounds-from') order.soundsFrom = String(value());
        else if (arg === '--check') order.check = true;
        else if (arg === '--force') order.force = true;
        else if (arg === '--strict') order.strict = true;
        else if (arg === '--json') json = true;
        else if (arg.startsWith('--')) usage(`unknown option ${arg}`);
        else plain.push(arg);
    }
    const [project] = plain;
    if (!project || plain.length > 1) usage();
    if (!order.name || !order.name.trim()) usage('--name says what the game calls it');
    if (!order.model) usage('--model says which model it is (its folder under 3d/)');
    if (order.size && order.fit) usage('--size and --fit are two ways to say one thing: pass one');
    if (!fs.existsSync(path.join(project, 'data', 'System.json'))) usage(`not a project: ${project} (no data/System.json)`);
    const done = make(project, order);
    const lines = done.notes.concat(validate.jsonLines({ lines: done.lines }));
    if (done.refused) lines.unshift({ key: done.locked ? 'vehicleTool.locked' : 'vehicleTool.refused', level: 'fix', text: done.refused, args: {}, file: '', path: '' });
    if (json) {
        console.log(JSON.stringify({ ok: done.exit === 0, exit: done.exit, id: done.id, added: done.added, size: done.size, head: done.head, report: done.report, sentence: done.sentence, lines,
            wrote: done.wrote, would: done.would, skipped: done.skipped || [] }, null, 1));
        process.exit(done.exit);
    }
    if (done.refused) { console.log(`refused: ${done.refused}`); console.log('nothing written'); process.exit(1); }
    for (const note of done.notes) console.log(`note: ${note.text}`);
    console.log(`${done.added ? 'added' : 'updated'} ${done.id}`);
    console.log(done.head);
    for (const line of done.report) console.log(line);
    for (const line of done.lines) console.log(`${(line.level === 'fix' ? 'FIX' : 'note').padEnd(4)} ${validate.lineText(line)}`);
    if (order.check) console.log(done.would.length ? `--check: would write ${done.would.join(', ')}; nothing written` : '--check: nothing would change');
    else if (done.exit !== 0) console.log('nothing written');
    else if (done.wrote.length) for (const file of done.wrote) console.log(`wrote ${file}`);
    else console.log('nothing to change');
    console.log(done.sentence);
    process.exit(done.exit);
}
