/**
 * VehicleCheck - what is wrong with a project's vehicles, in sentences.
 *
 * One reading of a project for the Vehicles page's status line and for
 * build-scripts/validate-vehicles.cjs: every type of
 * data/ReactorVehicles.json, every vehicle model's `model.json › vehicle`
 * block, every database starting placement and legacy vehicle event on each map.
 *
 *   RRVehicleCheck.problems(project, lookups) -> { lines, ok, fixes, notes, sentence, types, vehicles, skipped }
 *
 * `project` is plain data the caller has read: `types`
 * (ReactorVehicles.json), `system`, `actors`, `tilesets`, `bindings`
 * (Database.r3d.json), `mapInfos`, `commonEvents`, `maps` (each map's JSON
 * with its `id` and its 3D sidecar as `map.reactor3d`), `models`
 * (`{ "<model name>": its parsed model.json | null }`), `plugins`
 * (`[{ name, status }]`), `unreadable` (file names that are not JSON).
 *
 * `lookups` holds what the caller can measure: `Vehicles` and `Rider` (the
 * game's own `Reactor3D.Vehicles` and `Reactor3D.Rider`; `Reactor3D`'s when
 * not given), `Reactor3D`, `ReactorPhysics`, `BattleCheck`,
 * `exists(relativePath)`, `model(spec)` (`{ box, parts, surface(at),
 * object, template, within(part) }` of a model in model space: `template`
 * is the game's own template of it, with which the game's reader looks at
 * the model for a front its file does not name, as it does in the game;
 * `within(part)` names what lies wholly inside a part, so a motion on one
 * of those also moves the part), `rider(actorId)` (`{ name, object }`
 * of a starting party member's 3D body, or null), `body(map, event, spec,
 * yaw)` (the tiles a vehicle's model covers round its event). A check that
 * lacks what it needs is left out, named in `skipped` and said as a note
 * (`vehicleCheck.skip.*`), so the sentence counts it.
 *
 * A type is the record at its place in the list (`types[n]`), which is how
 * the game finds it; a record's own `id` is only compared with that place.
 * What the game's readers report of a record or a block (`typeNotes`,
 * `read(...).problems`) is said line for line.
 *
 * A line is `{ key, level, text, args, file, path, value? }`: `fix` when
 * the vehicle will not ride or the rider will visibly not hold, `note` for
 * everything else. `file` is project-relative and `path` the key inside
 * it. Every sentence is a key of `MESSAGES` (`vehicleCheck.*`): `text` is
 * the English, `say(item, t)` any other language. No DOM, no file access.
 */
(function(root) {
    'use strict';

    const S = (typeof root.RRVehicles !== 'undefined' && root.RRVehicles)
        || (typeof module !== 'undefined' && module.exports ? require('../event/VehicleSetup.js') : null);

    const TYPES_FILE = 'data/ReactorVehicles.json';
    // A seated rider's point further than this from every surface holds nothing, in tiles at the bound size.
    const HOLD = 0.15;
    // A map a vehicle crosses in under this many seconds at top speed is small for it.
    const CROSSING = 8;
    // How far a front mark may point from the vehicle's own front before it is another way, as a cosine (45 degrees).
    const FRONT_AGREES = Math.SQRT1_2;

    // The kinds, where the runtime's own table (Reactor3D.Vehicles.KINDS) is not loaded.
    const KINDS = {
        motorcycle: { size: 3.5, speed: 20, arrives: 'V1', rider: 'seat', medium: 'ground', played: true },
        tank: { size: 12, speed: 9, arrives: 'V2', rider: 'inside', medium: 'ground', played: true },
        airship: { size: 12, speed: 14, arrives: 'V3', rider: 'inside', medium: 'air', played: true },
        shuttle: { size: 9, speed: 22, arrives: 'V3', rider: 'inside', medium: 'air', played: true },
        car: { size: 5, speed: 16, arrives: 'Later', rider: 'seat', medium: 'ground', played: true },
        boat: { size: 6, speed: 10, arrives: 'Later', rider: 'seat', medium: 'water', played: true },
        hover: { size: 4, speed: 16, arrives: 'Later', rider: 'seat', medium: 'ground', played: true }
    };

    // The keys each of the three pieces of data has. A key that is not here is not a setting.
    const FORMAT = {
        type: {
            id: true, name: true, note: true, startMapId: true, startX: true, startY: true, startDirection: true, copies: true, copyCount: true, classId: true, initialLevel: true, equips: true, traits: true, learnings: true, ridable: true, graphic3d: true, medium: true, passability: true, leans: true, walks: true, turnsInPlace: true, kind: true, prompt: true, rider: true, encounters: true, bgm: true, flight: true,
            model: ['name', 'file', 'ext', 'size', 'scale', 'variant', 'texture', 'offset'],
            sheet: ['characterName', 'characterIndex'],
            handling: ['speed', 'toTopSpeed', 'turnCircle', 'jump', 'brake', 'coast', 'reverse', 'lean', 'step', 'wade', 'turnInPlace', 'grip', 'turnRate'],
            body: ['height', 'radius'],
            sounds: ['engine', 'engineRate', 'idle', 'accelerate', 'slowdown', 'start', 'stop', 'bump', 'land', 'scrape', 'skid'],
            camera: ['speedDistance', 'speedFov', 'lookAhead', 'minDistance']
        },
        // Read by later versions; named, not refused.
        later: ['onBoard', 'onLeave', 'fire', 'battle'],
        block: {
            forward: true, guessed: true, stand: ['lean', 'side'],
            wheels: ['part', 'with', 'at', 'radius', 'side'],
            controls: ['input', 'shape', 'part', 'at', 'axis', 'degrees', 'degreesAtSpeed'],
            seats: ['posture', 'seat', 'handL', 'handR', 'footL', 'footR'],
            tracks: ['part', 'side']
        },
        point: ['at', 'part', 'follows', 'along'],
        row: ['type', 'yaw', 'board', 'key', 'visiting']
    };
    // The ranges the game holds a number to (tiles, seconds), where the runtime's own clamp is not loaded.
    const RANGES = { 'handling.speed': [1, 30], 'handling.toTopSpeed': [0.5, 10], 'handling.turnCircle': [0, 16], 'handling.jump': [0, 2] };
    // Words people write for a setting that has another name.
    const ALIASES = {
        topspeed: 'handling.speed', maxspeed: 'handling.speed', speed: 'handling.speed', acceleration: 'handling.toTopSpeed', accel: 'handling.toTopSpeed',
        turnradius: 'handling.turnCircle', turningcircle: 'handling.turnCircle', turn: 'handling.turnCircle', jumpheight: 'handling.jump', braking: 'handling.brake',
        friction: 'handling.coast', size: 'model.size', scale: 'model.scale', file: 'model.file', modelname: 'model.name', engine: 'sounds.engine',
        sound: 'sounds.engine', enginesound: 'sounds.engine', music: 'bgm', height: 'body.height', radius: 'body.radius', fov: 'camera.speedFov',
        type: 'kind', label: 'prompt', word: 'prompt', character: 'sheet', picture: 'sheet', sprite: 'sheet', seat: 'rider', passengers: 'rider',
        front: 'vehicle.forward', facing: 'vehicle.forward', steering: 'vehicle.controls', handlebars: 'vehicle.controls', wheel: 'vehicle.wheels',
        seat0: 'vehicle.seats', riders: 'vehicle.seats', lefthand: 'handL', righthand: 'handR', leftfoot: 'footL', rightfoot: 'footR',
        position: 'at', pos: 'at', point: 'at', bone: 'part', node: 'part', angle: 'yaw', direction: 'yaw', rotation: 'yaw', name: 'key', id: 'type', vehicle: 'type'
    };
    const LIMBS = ['seat', 'handL', 'handR', 'footL', 'footR'];
    // Plugins that move the player their own way, and ones whose regions close tiles, by the name in the plugin list.
    const MOVERS = ['DotMoveSystem', 'DotMoveSystem_FunctionEx', 'Galv_PixelMove', 'GALV_PixelMove', 'AltimitMovement', 'Cyclone-Movement-MV', 'Cyclone-Movement', 'SAN_AnalogMove', 'QMovement'];
    const REGIONS = ['YEP_RegionRestrictions', 'VisuMZ_1_EventsMoveCore'];
    // The plugin commands that name a vehicle.
    const COMMANDS = ['GetOnVehicle', 'SetVehicleLocation', 'CallVehicle', 'LockVehicle', 'DriveVehicleRoute', 'FireVehicleWeapon', 'FlyVehicle'];

    const MESSAGES = Object.assign({
        'vehicleCheck.ready': 'Ready to ride.',
        'vehicleCheck.readyNote': 'Ready to ride. 1 note.',
        'vehicleCheck.readyNotes': 'Ready to ride. {count} notes.',
        'vehicleCheck.notReady': 'Not ready to ride. To fix: {count}.',
        'vehicleCheck.none': 'No vehicles in this project.',
        'vehicleCheck.unreadable': '{file} cannot be read (not valid JSON).',
        'vehicleCheck.noModel': '{name} has no model.',
        'vehicleCheck.modelMissing': '{name}: the model file {path} is missing.',
        'vehicleCheck.badKind': '{name}: {kind} is not a kind of vehicle.',
        'vehicleCheck.notSetting': '{file}: {key} is not a setting. Did you mean {suggestion}?',
        'vehicleCheck.notSettingPlain': '{file}: {key} is not a setting.',
        'vehicleCheck.noSeat': '{name}: the model has no place to sit.',
        'vehicleCheck.lostPart': '{name}: the {limb} is on a part the model no longer has ({part}).',
        'vehicleCheck.lostControl': '{name}: what turns ({part}) is not a part of the model.',
        'vehicleCheck.holdsNothing': '{name}: the {limb} holds nothing. The nearest surface is {d} tiles away.',
        'vehicleCheck.short': '{rider}: the {limb} is {d} short of its grip. Move the grip {d} toward the seat ({axis}), or make {name} {s} smaller.',
        'vehicleCheck.shortRest': '{rider}: the {limb} is {d} short of its rest. Move the rest {d} toward the seat ({axis}), or make {name} {s} smaller.',
        'vehicleCheck.badFront': '{model}: the front {value} cannot be read. It is "+x", "-x", "+z", "-z" or three numbers.',
        'vehicleCheck.badPoint': '{name}: the {limb} has no place the game can read. "at" is three numbers.',
        'vehicleCheck.badControl': '{name}: {key} has neither a part nor an "at". Nothing turns and the hands stay still.',
        'vehicleCheck.lostWheel': '{name}: the wheel {part} is not a part of the model.',
        'vehicleCheck.unread': '{file}: the game cannot read {key}.',
        'vehicleCheck.idDiffers': '{name}: "id" is {id}, but it is number {n} in the list. The game goes by its place: {n}.',
        'vehicleCheck.notMeasured': '{model}: the model could not be measured. Its points were not checked.',
        'vehicleCheck.wheelSpin': '{name}: {part} is a wheel and also has a Spin motion. Remove the motion.',
        'vehicleCheck.soundMissing': '{name}: the sound {file} is missing.',
        'vehicleCheck.noType': '{event} on {map}: vehicle type {id} is not in the Database.',
        'vehicleCheck.noFit': '{name} ({event}) on {map} stands where it does not fit.',
        'vehicleCheck.badName': '{name} ({event}): {key} cannot be a vehicle\'s name.',
        'vehicleCheck.sameName': 'Two vehicles are named {key}: {a} and {b}. {command} reaches the nearest.',
        'vehicleCheck.sameNameScript': 'Two vehicles are named {key}: {a} and {b}. A script that names it reaches the nearest.',
        'vehicleCheck.sameNameUnused': 'Two vehicles are named {key}: {a} and {b}. A command that names it reaches the nearest.',
        'vehicleCheck.frontGuess': '{model}: nobody has confirmed which end is the front.',
        'vehicleCheck.pointsGuess': '{model}: the rider\'s points are a guess nobody has looked at.',
        'vehicleCheck.frontMark': '{name} ({event}): its own front mark points another way than the vehicle\'s.',
        'vehicleCheck.pivotDiffers': '{model}: {part} has a pivot of its own and a vehicle axle that differ. The vehicle\'s is used.',
        'vehicleCheck.noSize': '{name}: no size is set; it is drawn {n} tiles. make-vehicle --fit fits it to the party.',
        'vehicleCheck.clamped': '{name}: {key} is {value}; the game uses {clamped}.',
        'vehicleCheck.notRead': '{name}: this version does not read {key}.',
        'vehicleCheck.footShort': '{rider}\'s foot does not reach the ground at a stop.',
        'vehicleCheck.noSteering': '{name}: nothing on the model turns with the steering.',
        'vehicleCheck.noWheels': '{name}: no wheels were found. They will not roll.',
        'vehicleCheck.noEngine': '{name} has no engine sound.',
        'vehicleCheck.noSkeleton': '{rider} has no 3D skeleton: nobody is shown on the seat.',
        'vehicleCheck.laterKind': '{name} is {kind}: this version does not drive those yet.',
        'vehicleCheck.flatMap': '{name} on {map}: this version rides on 3D maps.',
        'vehicleCheck.noSprite': '{name} on {map} needs a 2D image.',
        'vehicleCheck.notRidable': '{name}: Rideable is switched off.',
        'vehicleCheck.loopMap': '{name} on {map}: this map loops.',
        'vehicleCheck.firstPersonMap': '{name} on {map}: this map\'s camera is first person.',
        'vehicleCheck.freeOff': '{name} on {map}: free riding is switched off in this project.',
        'vehicleCheck.commandsIdle': '{name} ({event}): its commands never run, because OK rides it.',
        'vehicleCheck.noBoarder': '{name} ({event}) is boarded only by a command, and no event has Get On Vehicle for it.',
        'vehicleCheck.movesAlone': '{name} ({event}) on {map} moves by itself: once someone has ridden it, it stays where it is left.',
        'vehicleCheck.fast': '{name} is faster than this map is wide: it crosses {map} in {seconds} seconds.',
        'vehicleCheck.unplaced': 'No {name} is on any map.',
        'vehicleCheck.pluginMoves': '{plugin} moves the player its own way: free riding is not supported beside it.',
        'vehicleCheck.pluginRegions': '{plugin}: its regions are not asked while riding free.',
        'vehicleCheck.skip.model': 'The vehicle model code is not loaded: models were not measured.',
        'vehicleCheck.skip.fit': 'The rider code is not loaded: whether the party reaches was not checked.',
        'vehicleCheck.skip.stand': 'Where vehicles stand was not checked: the 3D world could not be loaded.',
        'vehicleCheck.limb.seat': 'seat',
        'vehicleCheck.limb.handL': 'left hand',
        'vehicleCheck.limb.handR': 'right hand',
        'vehicleCheck.limb.footL': 'left foot',
        'vehicleCheck.limb.footR': 'right foot',
        'vehicleCheck.kind.motorcycle': 'a motorcycle',
        'vehicleCheck.kind.tank': 'a tank',
        'vehicleCheck.kind.airship': 'an airship',
        'vehicleCheck.kind.shuttle': 'a shuttle',
        'vehicleCheck.kind.car': 'a car',
        'vehicleCheck.kind.boat': 'a boat',
        'vehicleCheck.kind.hover': 'a hovercraft'
    }, S ? S.MESSAGES : {});

    const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const fill = (text, args) => String(text).replace(/\{(\w+)\}/g, (token, key) => (args && has(args, key) ? String(args[key]) : token));
    const pad = id => String(id).padStart(3, '0');
    const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    // A Database record by its number: the one at that place in its list, as the game finds it (`$dataActors[id]`).
    const recordOf = (list, id) => (Array.isArray(list) && Number(id) > 0 && isObject(list[Math.floor(Number(id))]) ? list[Math.floor(Number(id))] : null);
    const round = (value, places = 2) => { const unit = Math.pow(10, places); return Math.round(Number(value) * unit) / unit; };

    /**
     * A sentence's values with its keyed words filled in: a value `x` that
     * has `xKey` beside it is that key's word (a limb, a kind), through
     * `t` when given.
     */
    function worded(args, t) {
        const out = Object.assign({}, args || {});
        for (const key of Object.keys(out)) {
            if (!key.endsWith('Key') || typeof out[key] !== 'string') continue;
            const told = typeof t === 'function' ? t(out[key], {}) : null;
            out[key.slice(0, -3)] = told && told !== out[key] ? told : MESSAGES[out[key]] || out[key.slice(0, -3)];
        }
        return out;
    }
    const item = (key, args, more) => Object.assign({ key, args: args || {}, text: fill(MESSAGES[key], worded(args)) }, more);

    /** An item's sentence through a translator `t(key, args)`; the English without one, or where it has no such key. */
    function say(entry, t) {
        if (!entry) return '';
        const args = worded(entry.args, t);
        if (typeof t === 'function') {
            const told = t(entry.key, args);
            if (told && told !== entry.key) return told;
        }
        return fill(MESSAGES[entry.key] || entry.text || entry.key, args);
    }

    const world = lookups => (lookups && lookups.Reactor3D) || (typeof root.Reactor3D !== 'undefined' ? root.Reactor3D : null) || null;
    // The game's vehicle and rider code: what the caller hands in (null: it has none), else the 3D world's own.
    const sideOf = (lookups, name) => (lookups && has(lookups, name) ? lookups[name] || null : (world(lookups) && world(lookups)[name]) || null);
    const vehiclesOf = lookups => sideOf(lookups, 'Vehicles');
    const riderOf = lookups => sideOf(lookups, 'Rider');
    const battleCheck = lookups => (lookups && lookups.BattleCheck) || (typeof root.RRBattleCheck !== 'undefined' ? root.RRBattleCheck : null)
        || (typeof module !== 'undefined' && module.exports ? require('./BattleCheck.js') : null);

    /**
     * A type record as the game fills it (`Reactor3D.Vehicles.typeOf`):
     * every number held to its range, the model a whole spec. Null without
     * the game's code, and for a record its reader cannot take.
     */
    function typeOf(record, lookups, index) {
        const V = vehiclesOf(lookups);
        if (!V || typeof V.typeOf !== 'function' || !isObject(record)) return null;
        // Told its place in the list, a record that writes no id is that number, as in the game.
        try { return (Number.isInteger(index) && index > 0 ? V.typeOf(record, index) : V.typeOf(record)) || null; } catch (error) { return null; }
    }
    /** What the game's reader changed or could not take in a record: `[{ key, level, args }]`; none without its code. */
    function typeNotes(record, lookups) {
        const V = vehiclesOf(lookups);
        if (!V || typeof V.typeNotes !== 'function' || !isObject(record)) return [];
        try { const notes = V.typeNotes(record); return Array.isArray(notes) ? notes : []; } catch (error) { return []; }
    }
    // The reader's notes this file says in its own sentences (a kind that is none, a key that is no setting, a number out of range, ...).
    const TYPE_NOTES_SAID = ['unknownKind', 'kindLater', 'notNumber', 'clamped', 'unknownKey', 'noModel', 'noSize', 'reserved'];
    // The groups whose numbers this file compares with the game's own answer. A number the game holds to a range
    // anywhere else (the model's size, a sound's volume or pitch, the engine's rate) is said from the reader's note.
    const RANGED_GROUPS = ['handling', 'body', 'camera'];
    // What the block reader reports of a whole key it could not take, and the key each is.
    const BLOCK_LISTS = { badStand: 'stand', badWheels: 'wheels', badSeats: 'seats', badControls: 'controls', badTracks: 'tracks' };

    /** The kinds as this file reads them, from the runtime's table when it is loaded. */
    function kindsOf(lookups) {
        const V = vehiclesOf(lookups);
        if (!V || !isObject(V.KINDS)) return KINDS;
        const out = {};
        for (const name of Object.keys(V.KINDS)) {
            const kind = V.KINDS[name] || {}, mine = KINDS[name] || {};
            out[name] = {
                size: Number(kind.size) || mine.size || 3.5,
                speed: Number(kind.handling && kind.handling.speed) || Number(kind.speed) || mine.speed || 20,
                arrives: kind.arrives || mine.arrives || 'Later',
                rider: kind.rider || mine.rider || 'seat',
                medium: kind.medium || mine.medium || 'ground',
                played: Array.isArray(V.PLAYED) ? V.PLAYED.includes(name) : !!mine.played
            };
        }
        return out;
    }

    //-------------------------------------------------------------------------
    // Keys that are not settings.

    /** How many single-letter changes turn one word into another. */
    function distance(a, b) {
        const row = [];
        for (let j = 0; j <= b.length; j++) row[j] = j;
        for (let i = 1; i <= a.length; i++) {
            let last = row[0];
            row[0] = i;
            for (let j = 1; j <= b.length; j++) {
                const keep = row[j];
                row[j] = Math.min(row[j] + 1, row[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
                last = keep;
            }
        }
        return row[b.length];
    }

    /** Every setting of a table as paths: `kind`, `handling.speed`, ... */
    function pathsOf(table, prefix = '') {
        const out = [];
        for (const key of Object.keys(table)) {
            out.push(prefix + key);
            if (Array.isArray(table[key])) for (const leaf of table[key]) out.push(prefix + key + '.' + leaf);
        }
        return out;
    }

    /**
     * The setting someone most likely meant by a key that is not one: a
     * word people use for it, a setting of the same name in another group,
     * one that holds the word, or the nearest by spelling. '' for none.
     * `known` are the settings as paths; `under` what the key was found
     * inside (`handling.`), which a suggestion in the same group keeps.
     */
    function suggest(key, known, under = '') {
        const word = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!word) return '';
        const leaf = path => path.split('.').pop().toLowerCase();
        const alias = ALIASES[word];
        if (alias) {
            const found = known.find(path => path === alias || path === alias.replace(/^vehicle\./, '')) || known.find(path => leaf(path) === leaf(alias));
            if (found) return found;
        }
        const same = known.filter(path => leaf(path) === word);
        if (same.length) return same.find(path => under && path.startsWith(under)) || same[0];
        const holds = known.filter(path => leaf(path).length >= 4 && (word.includes(leaf(path)) || (word.length >= 4 && leaf(path).includes(word))));
        if (holds.length) return holds.find(path => under && path.startsWith(under)) || holds.sort((a, b) => leaf(b).length - leaf(a).length)[0];
        let best = '', score = Infinity;
        for (const path of known) {
            const far = distance(word, leaf(path));
            if (far < score) { score = far; best = path; }
        }
        return score <= Math.max(1, Math.floor(word.length / 3)) ? best : '';
    }

    //-------------------------------------------------------------------------
    // Sounds.

    const SOUND_SLOTS = ['engine', 'idle', 'accelerate', 'slowdown', 'start', 'stop', 'bump', 'land', 'scrape', 'skid'];
    const AUDIO_EXTS = ['.ogg', '.m4a', '.mp3', '.wav', '.flac'];

    /**
     * Every sound a type names: `[{ slot, name, kind }]` (`kind` the audio
     * folder: `se`, or `bgm` for its music). A slot the record leaves out
     * takes its kind's stock sound, where the runtime's kinds are loaded.
     */
    function soundsOf(record, lookups) {
        const out = [];
        if (!isObject(record)) return out;
        const V = vehiclesOf(lookups);
        const kind = V && isObject(V.KINDS) ? V.KINDS[has(V.KINDS, record.kind) ? record.kind : 'motorcycle'] : null;
        const stock = kind && isObject(kind.sounds) ? kind.sounds : {};
        const own = isObject(record.sounds) ? record.sounds : {};
        for (const slot of SOUND_SLOTS) {
            const sound = has(own, slot) ? own[slot] : stock[slot];
            const name = typeof sound === 'string' ? sound : sound && sound.name;
            if (typeof name === 'string' && name) out.push({ slot, name, kind: ['idle','accelerate','slowdown'].includes(slot) && sound?.folder!=='se'?'bgs':'se' });
        }
        if (record.bgm && typeof record.bgm.name === 'string' && record.bgm.name) out.push({ slot: 'bgm', name: record.bgm.name, kind: 'bgm' });
        return out;
    }

    /** Whether an audio file of that name is in the project, in any format the game plays (stored plain or encrypted). */
    function audioExists(lookups, kind, name) {
        if (typeof lookups.exists !== 'function') return true;
        return AUDIO_EXTS.some(ext => lookups.exists(`audio/${kind}/${name}${ext}`) || lookups.exists(`audio/${kind}/${name}${ext}_`));
    }

    //-------------------------------------------------------------------------
    // Maps and events.

    const mapFile = id => `data/Map${pad(id)}.json`;
    const mapName = (project, map) => {
        const info = recordOf(project.mapInfos, map.id);
        return (info && info.name) || map.displayName || `Map${pad(map.id)}`;
    };

    /** Every event of the project that carries a vehicle row, in map and event order: `[{ map, mapId, mapName, event, row }]` (`row` null for one the game cannot read). */
    function placed(project, lookups = {}) {
        const out = [];
        const maps = (Array.isArray(project && project.maps) ? project.maps : []).filter(Boolean).slice().sort((a, b) => a.id - b.id);
        for (const map of maps) {
            const starts = vehiclesOf(lookups)?.startingEvents?.(project.types, map.id) || [];
            for (const event of [...(map.events || []), ...starts]) {
                if (!event || event.rrVehicle === undefined || event.rrVehicle === null) continue;
                out.push({ map, mapId: map.id, mapName: mapName(project, map), event, row: S.vehicleOf(event) });
            }
        }
        return out;
    }

    /** Whether a map's own camera is the view from the eyes. */
    function firstPerson(map) {
        const camera = map && map.reactor3d && map.reactor3d.camera;
        const mode = String((camera && camera.mode) || '').toLowerCase().replace(/[\s_-]/g, '');
        return ['firstperson', 'first', '1stperson', 'fps'].includes(mode);
    }

    /** Whether a page does anything when it runs: a command other than the list's end. */
    const hasCommands = page => ((page && page.list) || []).some(command => command && command.code !== 0);

    /**
     * Where the project names a vehicle: `commands` (`[{ name, label,
     * vehicle, mapId, eventId }]`, the plugin commands that take one) and
     * `scripts` (the text of every Script command, Script condition and
     * scripted variable that mentions ReactorVehicles).
     */
    function usesOf(project) {
        const commands = [], scripts = [];
        const walk = (list, mapId, eventId) => {
            for (const command of list || []) {
                if (!command) continue;
                const p = command.parameters || [];
                if (command.code === 357 && p[0] === 'RPGReactor' && COMMANDS.includes(p[1])) {
                    const args = isObject(p[3]) ? p[3] : {};
                    commands.push({ name: p[1], label: typeof p[2] === 'string' && p[2] ? p[2] : p[1], vehicle: args.vehicle === undefined ? (p[1] === 'GetOnVehicle' ? 'this' : '') : String(args.vehicle), mapId, eventId });
                }
                let text = '';
                if (command.code === 355 || command.code === 655) text = String(p[0] || '');
                else if (command.code === 111 && p[0] === 12) text = String(p[1] || '');
                else if (command.code === 122 && p[3] === 4) text = String(p[4] || '');
                if (text.includes('ReactorVehicles')) scripts.push({ text, mapId, eventId });
            }
        };
        for (const map of (Array.isArray(project.maps) ? project.maps : []).filter(Boolean)) {
            for (const event of map.events || []) if (event) for (const page of event.pages || []) walk(page && page.list, map.id, event.id);
        }
        for (const common of Array.isArray(project.commonEvents) ? project.commonEvents : []) if (common) walk(common.list, 0, 0);
        return { commands, scripts };
    }

    const quoted = name => new RegExp('ReactorVehicles\\s*\\.\\s*\\w+\\s*\\(\\s*["\'`]' + String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'`]');

    //-------------------------------------------------------------------------
    // The model's block.

    const FRONTS = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
    /**
     * A front as a unit vector on the ground, read exactly as the game's
     * block reader reads `vehicle.forward`: one of `"+x"`, `"-x"`, `"+z"`,
     * `"-z"` as written (a capital, a space or a bare `x` is none of
     * them), or three numbers that do not point straight up. Null for
     * anything else: the game then guesses the front.
     */
    function frontOf(forward) {
        if (typeof forward === 'string') return has(FRONTS, forward) ? FRONTS[forward].slice() : null;
        if (!Array.isArray(forward) || forward.length !== 3 || !forward.every(value => typeof value === 'number' && Number.isFinite(value))) return null;
        const length = Math.hypot(forward[0], forward[2]);
        return length > 1e-6 ? [forward[0] / length, 0, forward[2] / length] : null;
    }

    /** The part names a wheel entry turns: its own and each `with`. */
    function wheelParts(wheel) {
        if (typeof wheel === 'string') return wheel ? [wheel] : [];
        if (!isObject(wheel)) return [];
        return [wheel.part].concat(Array.isArray(wheel.with) ? wheel.with : []).filter(name => typeof name === 'string' && name);
    }

    /** Whether a model has a part of that name, whole and as written (how a point finds its node). True where the parts are not known. */
    const hasPart = (parts, name) => !Array.isArray(parts) || parts.some(part => part === name);

    /** A model-space direction as the axis it mostly lies along: `+x`, `-z`, ... */
    function axisWord(toward) {
        if (!Array.isArray(toward)) return String(toward || '');
        let at = 0;
        for (let i = 1; i < 3; i++) if (Math.abs(Number(toward[i]) || 0) > Math.abs(Number(toward[at]) || 0)) at = i;
        return (Number(toward[at]) < 0 ? '-' : '+') + 'xyz'[at];
    }

    /**
     * What a rider's fit says, as lines. `fit` is `Reactor3D.Rider.fit`'s
     * report: per hand and foot how far short of its point the limb is and
     * which way the point would have to move, and whether the stand-side
     * foot reaches the ground at a stop. `smaller` is how much smaller the
     * vehicle would have to be for this rider, when the caller worked it out.
     */
    function fitLines(fit, rider, name, where, smaller, add) {
        if (!isObject(fit)) return;
        if (fit.seated === false) { add('vehicleCheck.noSkeleton', 'note', { rider }, { file: where.file, path: where.path }, {}); return; }
        const points = isObject(fit.points) ? fit.points : {};
        for (const limb of ['handL', 'handR', 'footL', 'footR']) {
            const point = points[limb];
            if (!isObject(point)) continue;
            const short = Number(point.short);
            if (!(short > 0.005)) continue;
            // With no size worked out: the vehicle shrunk until the point is one limb's length away.
            const reach = Number(point.reach), size = Number(fit.size) || 0;
            const less = Number.isFinite(smaller) && smaller > 0 ? smaller : reach > 1 && size > 0 ? size * (1 - 1 / reach) : short;
            // A hand holds a grip; a foot stands on a rest.
            add(limb.startsWith('foot') ? 'vehicleCheck.shortRest' : 'vehicleCheck.short', 'fix', {
                rider, limb: MESSAGES['vehicleCheck.limb.' + limb], limbKey: 'vehicleCheck.limb.' + limb, d: round(short), axis: axisWord(point.toward),
                name, s: Math.max(0.1, Math.ceil(less * 10 - 1e-9) / 10)
            }, { file: where.file, path: `${where.path}.${limb}.at` }, { limb });
        }
        if (isObject(fit.foot) && fit.foot.reachesGround === false) add('vehicleCheck.footShort', 'note', { rider }, { file: where.file, path: where.path }, {});
    }

    //-------------------------------------------------------------------------
    // The report.

    /**
     * What is wrong with a project's vehicles (`project`, `lookups`: the
     * head of this file). `lines` come in this order: files that cannot be
     * read; each type (its record, its model, its sounds, its fit); each
     * placed vehicle in map and event order; names two vehicles share; the
     * project's notes. `sentence` is the last line a tool prints and the
     * page's status: "Ready to ride.", with its notes counted, or how many
     * things are to fix.
     */
    function problems(project, lookups = {}) {
        const P = project || {};
        const report = { lines: [], ok: true, fixes: 0, notes: 0, sentence: null, types: [], vehicles: [], skipped: [] };
        const skip = name => { if (!report.skipped.includes(name)) report.skipped.push(name); };
        const said = new Set();
        const add = (key, level, args, where, more) => {
            const line = Object.assign(item(key, args), { level, file: (where && where.file) || '', path: (where && where.path) || '' }, more);
            // One model worn by two types, one name on three vehicles: each thing is said once.
            const mark = line.key + '|' + line.text;
            if (said.has(mark)) return null;
            said.add(mark);
            report.lines.push(line);
            return line;
        };
        const V = vehiclesOf(lookups), R3 = world(lookups), Rider = riderOf(lookups), kinds = kindsOf(lookups);
        const typed = (record, index) => typeOf(record, lookups, index);
        // A type's model as a whole spec: the runtime's own completion when it is loaded, so the two never differ.
        const specOf = (record, known) => { const filled = known || typed(record); return (filled && filled.model) || S.typeModel(record, kinds); };
        const types = Array.isArray(P.types) ? P.types : [];
        // A type's number is its place in the list: the game finds a record there and nowhere else.
        const records = [];
        for (let id = 1; id < types.length; id++) if (isObject(types[id])) records.push({ id, record: types[id] });
        const everywhere = placed(P, lookups);

        for (const file of Array.isArray(P.unreadable) ? P.unreadable : []) add('vehicleCheck.unreadable', 'fix', { file }, { file, path: '' });

        //---------------------------------------------------------------------
        // Types.

        const known = pathsOf(FORMAT.type);
        const blocks = new Map();
        let seated = false;
        for (const { id, record } of records) {
            const at = `[${id}]`;
            const name = String(record.name || '') || `Vehicle ${id}`;
            const where = path => ({ file: TYPES_FILE, path: path ? `${at}.${path}` : at });
            const more = { typeId: id };

            // Its own start, and that of each copy of it (`copies[n]`).
            const placed = [[record, '']].concat((Array.isArray(record.copies) ? record.copies : []).map((copy, n) => [copy, `copies[${n}].`]));
            for (const [start, prefix] of placed) {
                if (!start || typeof start !== 'object' || start.startMapId === undefined || Number(start.startMapId) === 0) continue;
                const map = (P.maps || []).find(map => map && map.id === Number(start.startMapId));
                if (!Number.isInteger(Number(start.startMapId)) || !map) {
                    add('vehicleCheck.unread', 'fix', {file:TYPES_FILE,key:prefix + 'startMapId'}, where(prefix + 'startMapId'), more);
                }
                for (const [key,limit] of [['startX',map?.width],['startY',map?.height]]) {
                    const value = Number(start[key] || 0);
                    if (!Number.isInteger(value) || value < 0 || (Number.isFinite(limit) && value >= limit)) {
                        add('vehicleCheck.unread', 'fix', {file:TYPES_FILE,key:prefix + key}, where(prefix + key), more);
                    }
                }
            }

            // An `id` that says another number than the record's place: an event that names it by that number finds another record, or none.
            if (record.id !== undefined && record.id !== null && Number(record.id) !== id) {
                add('vehicleCheck.idDiffers', 'note', { name, id: typeof record.id === 'number' ? record.id : JSON.stringify(record.id), n: id }, where('id'), Object.assign({ value: id }, more));
            }

            for (const key of Object.keys(record)) {
                if (FORMAT.later.includes(key)) { add('vehicleCheck.notRead', 'note', { name, key }, where(key), more); continue; }
                if (!has(FORMAT.type, key)) {
                    const suggestion = suggest(key, known);
                    add(suggestion ? 'vehicleCheck.notSetting' : 'vehicleCheck.notSettingPlain', 'fix', suggestion ? { file: TYPES_FILE, key, suggestion } : { file: TYPES_FILE, key }, where(key), more);
                    continue;
                }
                const leaves = FORMAT.type[key];
                if (!Array.isArray(leaves) || !isObject(record[key])) continue;
                for (const leaf of Object.keys(record[key])) {
                    if (leaves.includes(leaf)) continue;
                    const full = `${key}.${leaf}`, suggestion = suggest(leaf, known, key + '.');
                    add(suggestion ? 'vehicleCheck.notSetting' : 'vehicleCheck.notSettingPlain', 'fix', suggestion ? { file: TYPES_FILE, key: full, suggestion } : { file: TYPES_FILE, key: full }, where(full), more);
                }
            }

            // No kind is a motorcycle. A kind that is written and is none (an empty word and a number among them) is said, as the game's reader says it.
            const named = record.kind === undefined || record.kind === null ? 'motorcycle' : typeof record.kind === 'string' && record.kind !== '' ? record.kind : JSON.stringify(record.kind);
            const kindName = has(kinds, named) ? named : 'motorcycle', kind = kinds[kindName];
            if (!has(kinds, named)) add('vehicleCheck.badKind', 'fix', { name, kind: named }, where('kind'), Object.assign({ value: 'motorcycle' }, more));
            else if (!kind.played) add('vehicleCheck.laterKind', 'note', { name, kind: MESSAGES['vehicleCheck.kind.' + kindName] || kindName, kindKey: 'vehicleCheck.kind.' + kindName }, where('kind'), more);
            const seat = (record.rider === 'seat' || record.rider === 'inside' ? record.rider : kind.rider) === 'seat';
            if (seat) seated = true;

            const filled = typed(record, id);
            const spec = specOf(record, filled);
            const size = spec ? Number(spec.size) * (Number(spec.scale) > 0 ? Number(spec.scale) : 1) : 0;
            const speed = Number(filled && filled.handling && filled.handling.speed) || Math.max(1, Math.min(30, Number(record.handling && record.handling.speed) || kind.speed));
            report.types.push({ id, name, kind: kindName, model: spec ? spec.name : '', size: spec ? Number(spec.size) : 0, placed: everywhere.filter(entry => entry.row && entry.row.type === id).length, speed });

            // Numbers the game holds to a range.
            for (const group of RANGED_GROUPS) {
                if (!isObject(record[group])) continue;
                for (const leaf of Object.keys(record[group])) {
                    const value = record[group][leaf], path = `${group}.${leaf}`;
                    if (value === null || value === undefined || !FORMAT.type[group].includes(leaf)) continue;
                    // What the game makes of it: its own answer when its code is loaded, else the ranges this file knows.
                    let used = null;
                    if (filled && isObject(filled[group]) && typeof filled[group][leaf] === 'number') used = filled[group][leaf];
                    else if (typeof value === 'number' && RANGES[path]) used = Math.max(RANGES[path][0], Math.min(RANGES[path][1], value));
                    if (used === null || (typeof value === 'number' && Math.abs(used - value) <= 1e-9)) continue;
                    add('vehicleCheck.clamped', 'note', { name, key: path, value: typeof value === 'number' ? value : JSON.stringify(value), clamped: used }, where(path), Object.assign({ value: used }, more));
                }
            }

            // Sounds: each named file is in the project; an engine written as null is silence by hand.
            if (isObject(record.sounds) && has(record.sounds, 'engine') && record.sounds.engine === null && !soundsOf(record, lookups).some(sound => ['idle','accelerate','slowdown'].includes(sound.slot))) add('vehicleCheck.noEngine', 'note', { name }, where('sounds.engine'), more);
            for (const sound of soundsOf(record, lookups)) {
                if (audioExists(lookups, sound.kind, sound.name)) continue;
                add('vehicleCheck.soundMissing', 'fix', { name, file: `audio/${sound.kind}/${sound.name}.ogg` }, where(sound.slot === 'bgm' ? 'bgm' : `sounds.${sound.slot}`), more);
            }
            // What the game's own reader of the record could not take and no line above says: a sound that is no sound, and whatever it learns to refuse later.
            for (const told of typeNotes(record, lookups)) {
                const args = told && isObject(told.args) ? told.args : {};
                if (told && told.key === 'clamped' && typeof args.field === 'string' && !RANGED_GROUPS.includes(args.field.split('.')[0]) && typeof args.value === 'number') {
                    const used = Math.max(Number(args.min), Math.min(Number(args.max), args.value));
                    if (Number.isFinite(used)) add('vehicleCheck.clamped', 'note', { name, key: args.field, value: args.value, clamped: used }, where(args.field), Object.assign({ value: used }, more));
                    continue;
                }
                if (!told || TYPE_NOTES_SAID.includes(told.key) || told.level !== 'fix') continue;
                const key = told.key === 'badSound' ? `sounds.${args.slot}` : String(args.field || args.key || told.key);
                add('vehicleCheck.unread', 'fix', { file: TYPES_FILE, key }, where(key), more);
            }

            if (!spec) {
                const ownImage=everywhere.some(entry=>entry.row?.type===id && entry.event.pages?.some(page=>page?.image?.characterName || page?.image?.tileId));
                if (!record.sheet?.characterName && !ownImage && record.ridable!==false) add('vehicleCheck.noModel', 'fix', { name }, where('model'), more);
                continue;
            }
            const url = R3 && typeof R3.modelUrl === 'function' ? R3.modelUrl(spec.name, spec.ext, spec.file) : `3d/${spec.name}/source/${spec.file}${spec.ext}`;
            const modelFile = `3d/${spec.name}/model.json`;
            if (typeof lookups.exists === 'function' && !lookups.exists(url)) { add('vehicleCheck.modelMissing', 'fix', { name, path: url }, where('model.name'), more); continue; }
            if (!(Number(record.model.size) > 0)) add('vehicleCheck.noSize', 'note', { name, n: kind.size }, where('model.size'), Object.assign({ value: kind.size }, more));

            // The model's own file.
            const json = isObject(P.models) && has(P.models, spec.name) ? P.models[spec.name] : undefined;
            if (json === undefined) continue;
            const raw = isObject(json) && isObject(json.vehicle) ? json.vehicle : null;
            const inModel = path => ({ file: modelFile, path });
            const about = Object.assign({ model: spec.name }, more);
            if (raw) {
                const blockKnown = pathsOf(FORMAT.block);
                for (const key of Object.keys(raw)) {
                    if (has(FORMAT.block, key)) continue;
                    const suggestion = suggest(key, blockKnown);
                    add(suggestion ? 'vehicleCheck.notSetting' : 'vehicleCheck.notSettingPlain', 'fix', suggestion ? { file: modelFile, key: 'vehicle.' + key, suggestion: 'vehicle.' + suggestion } : { file: modelFile, key: 'vehicle.' + key }, inModel('vehicle.' + key), about);
                }
                (Array.isArray(raw.seats) ? raw.seats : []).forEach((entry, index) => {
                    if (!isObject(entry)) return;
                    for (const key of Object.keys(entry)) {
                        const path = `vehicle.seats[${index}].${key}`;
                        if (!FORMAT.block.seats.includes(key)) {
                            const suggestion = suggest(key, FORMAT.block.seats);
                            add(suggestion ? 'vehicleCheck.notSetting' : 'vehicleCheck.notSettingPlain', 'fix', suggestion ? { file: modelFile, key: path, suggestion } : { file: modelFile, key: path }, inModel(path), about);
                        } else if (LIMBS.includes(key) && isObject(entry[key])) {
                            for (const leaf of Object.keys(entry[key])) {
                                if (FORMAT.point.includes(leaf)) continue;
                                const suggestion = suggest(leaf, FORMAT.point);
                                add(suggestion ? 'vehicleCheck.notSetting' : 'vehicleCheck.notSettingPlain', 'fix', suggestion ? { file: modelFile, key: `${path}.${leaf}`, suggestion } : { file: modelFile, key: `${path}.${leaf}` }, inModel(`${path}.${leaf}`), about);
                            }
                        }
                    }
                });
            }
            // The model, measured by the caller. One with nothing to measure (no mesh, a file that cannot be read)
            // is said once and its surface checks are left out.
            let measured = null;
            if (typeof lookups.model === 'function') {
                try { measured = lookups.model(spec); } catch (error) { measured = null; }
                if (measured && !(longest(measured.box) > 0)) measured = null;
                if (!measured) add('vehicleCheck.notMeasured', 'note', { model: spec.name }, inModel(''), about);
            }
            // The box the game's reader is handed: its own measure of the model's template (`boxOf`), with which it
            // looks at the model for a front the file does not name, as it does in the game. A plain box cannot.
            let gameBox = measured ? measured.box : null;
            if (measured && measured.template && V && typeof V.boxOf === 'function') { try { gameBox = V.boxOf(measured.template) || gameBox; } catch (error) { /* the caller's own measure stands */ } }
            let block = null;
            if (V && typeof V.read === 'function') { try { block = V.read(isObject(json) ? json : {}, gameBox, kindName); } catch (error) { block = null; } }
            else skip('model');
            blocks.set(id, { block, raw, spec, json });

            // A front nobody has confirmed (the file names none, names one the game cannot read, or carries a
            // tool's guess): the end the game takes, and the end the front finder sees on the model. They are one
            // where the game looked for it itself; they may differ where the file carries a guess.
            const guesses = !!(block && isObject(block.guessed) && block.guessed.forward);
            const taken = block && typeof block.forward === 'string' && has(FRONTS, block.forward) ? block.forward : '';
            let found = guesses && block.frontFound ? taken : '';
            if (guesses && !found && measured && measured.template && typeof V.findFront === 'function') {
                try { found = V.findFront(gameBox, kindName, measured.template); } catch (error) { found = ''; }
                if (typeof found !== 'string' || !has(FRONTS, found)) found = '';
                // The finder reads every triangle of the model and keeps them with it: given back, as the game gives them back.
                if (typeof V.forgetShape === 'function') { try { V.forgetShape(measured.template); } catch (error) { /* nothing was kept */ } }
            }
            const fronted = found ? { value: found, taken } : {};

            // What the game's block reader could not take: it reads on without it, so each is said here.
            const unread = new Set();
            for (const problem of (block && Array.isArray(block.problems) ? block.problems : [])) {
                const args = problem && isObject(problem.args) ? problem.args : {};
                const point = /^ride\.(\d+)\.(\w+)$/.exec(String(args.point || ''));
                if (problem.key === 'badForward') {
                    unread.add('forward');
                    add('vehicleCheck.badFront', 'fix', { model: spec.name, value: JSON.stringify(raw ? raw.forward : undefined) }, inModel('vehicle.forward'), Object.assign({}, fronted, about));
                } else if (problem.key === 'badPoint' && point) {
                    unread.add(`seats[${point[1]}].${point[2]}`);
                    add('vehicleCheck.badPoint', 'fix', { name, limb: MESSAGES['vehicleCheck.limb.' + point[2]] || point[2], limbKey: 'vehicleCheck.limb.' + point[2] },
                        inModel(`vehicle.seats[${point[1]}].${point[2]}.at`), Object.assign({ limb: point[2] }, about));
                } else if (problem.key === 'noSeatPoint') {
                    // A seat whose seat point was just said to be unreadable is not said twice.
                    if (!unread.has(`seats[${args.seat}].seat`)) add('vehicleCheck.noSeat', 'fix', { name }, inModel(`vehicle.seats[${args.seat}].seat`), about);
                } else if (problem.key === 'controlNeedsAt') {
                    add('vehicleCheck.badControl', 'fix', { name, key: `vehicle.controls[${args.control}]` }, inModel(`vehicle.controls[${args.control}]`), about);
                } else if (problem.key === 'badWheel') {
                    add('vehicleCheck.unread', 'fix', { file: modelFile, key: `vehicle.wheels[${args.index}]` }, inModel(`vehicle.wheels[${args.index}]`), about);
                } else if (problem.key === 'missingPart') {
                    // Said by a caller that built the model; the part checks below say the same of what they can see.
                    const wheel = /^wheel\.(\d+)$/.exec(String(args.point || '')), control = /^control\.(\d+)$/.exec(String(args.point || ''));
                    if (wheel) add('vehicleCheck.lostWheel', 'fix', { name, part: String(args.part) }, inModel(`vehicle.wheels[${wheel[1]}]`), about);
                    else if (control) add('vehicleCheck.lostControl', 'fix', { name, part: String(args.part) }, inModel(`vehicle.controls[${control[1]}].part`), about);
                    else if (point) add('vehicleCheck.lostPart', 'fix', { name, part: String(args.part), limb: MESSAGES['vehicleCheck.limb.' + point[2]] || point[2], limbKey: 'vehicleCheck.limb.' + point[2] }, inModel(`vehicle.seats[${point[1]}].${point[2]}.part`), Object.assign({ limb: point[2] }, about));
                } else if (problem && has(BLOCK_LISTS, problem.key)) {
                    // A list that is no list, a stand that is no object: the whole key is left out by the game.
                    add('vehicleCheck.unread', 'fix', { file: modelFile, key: 'vehicle.' + BLOCK_LISTS[problem.key] }, inModel('vehicle.' + BLOCK_LISTS[problem.key]), about);
                } else if (problem && problem.key) {
                    add('vehicleCheck.unread', 'fix', { file: modelFile, key: `vehicle (${problem.key})` }, inModel('vehicle'), about);
                }
            }

            // The seats the file lists, else the ones the game guesses from the model's box; with neither known, nothing is said.
            const listed = !!(raw && Array.isArray(raw.seats)), guessable = !!(block && measured && measured.box);
            const seats = block && (listed || guessable) ? block.seats : listed ? raw.seats : null;
            const first = Array.isArray(seats) && isObject(seats[0]) ? seats[0] : null;
            if (seat && Array.isArray(seats) && !(first && isObject(first.seat) && Array.isArray(first.seat.at)) && !unread.has('seats[0].seat')) add('vehicleCheck.noSeat', 'fix', { name }, inModel('vehicle.seats'), about);

            const parts = measured && Array.isArray(measured.parts) ? measured.parts : null;
            // Tiles a model unit, as the game draws it: its size over the longest side of the box the game measures.
            const scale = measured && longest(gameBox) > 0 ? size / longest(gameBox) : 0;
            if (seat && first) {
                for (const limb of LIMBS) {
                    const point = first[limb];
                    if (!isObject(point)) continue;
                    const words = { name, limb: MESSAGES['vehicleCheck.limb.' + limb], limbKey: 'vehicleCheck.limb.' + limb };
                    const path = `vehicle.seats[0].${limb}`;
                    if (typeof point.part === 'string' && point.part && parts && !hasPart(parts, point.part)) {
                        add('vehicleCheck.lostPart', 'fix', Object.assign({ part: point.part }, words), inModel(path + '.part'), Object.assign({ limb }, about));
                        continue;
                    }
                    if (!Array.isArray(point.at) || !measured || typeof measured.surface !== 'function' || !(scale > 0)) continue;
                    let far = NaN;
                    try { far = Number(measured.surface(point.at)) * scale; } catch (error) { far = NaN; }
                    if (far > HOLD) add('vehicleCheck.holdsNothing', 'fix', Object.assign({ d: round(far) }, words), inModel(path + '.at'), Object.assign({ limb }, about));
                }
            }

            const controls = block ? block.controls : raw && Array.isArray(raw.controls) ? raw.controls : [];
            let steers = false;
            (controls || []).forEach((control, index) => {
                if (!isObject(control)) return;
                const part = typeof control.part === 'string' ? control.part : '';
                if (part && parts && !hasPart(parts, part)) add('vehicleCheck.lostControl', 'fix', { name, part }, inModel(`vehicle.controls[${index}].part`), about);
                else if (part && (control.input === undefined || control.input === 'steer')) steers = true;
            });
            if (seat && !steers) add('vehicleCheck.noSteering', 'note', { name }, inModel('vehicle.controls'), about);

            const wheels = raw && Array.isArray(raw.wheels) ? raw.wheels : block && Array.isArray(block.wheels) ? block.wheels : [];
            if (!wheels.length && kind.medium === 'ground') add('vehicleCheck.noWheels', 'note', { name }, inModel('vehicle.wheels'), about);
            const rules = isObject(json) && Array.isArray(json.animations) ? json.animations : [];
            const pivots = isObject(json) && isObject(json.pivots) ? json.pivots : {};
            const written = !!(raw && Array.isArray(raw.wheels));
            wheels.forEach((wheel, index) => {
                wheelParts(wheel).forEach((part, n) => {
                    // A wheel the file names that the model does not have: nothing rolls there.
                    if (written && parts && !hasPart(parts, part)) {
                        const path = typeof wheel === 'string' ? `vehicle.wheels[${index}]` : n === 0 ? `vehicle.wheels[${index}].part` : `vehicle.wheels[${index}].with[${n - 1}]`;
                        add('vehicleCheck.lostWheel', 'fix', { name, part }, inModel(path), about);
                        return;
                    }
                    // A motion on the wheel, or on what lies wholly inside it (the file's own node of a carved wheel's rim), turns it a second time.
                    let inside = [];
                    if (measured && typeof measured.within === 'function') { try { inside = measured.within(part) || []; } catch (error) { inside = []; } }
                    const at = rules.findIndex(rule => S.spinReaches(rule, part) || inside.some(each => S.spinReaches(rule, each)));
                    if (at >= 0) add('vehicleCheck.wheelSpin', 'fix', { name, part }, inModel(`animations[${at}]`), about);
                });
                const axle = isObject(wheel) && Array.isArray(wheel.at) ? wheel.at : null;
                if (axle && isObject(wheel) && Array.isArray(pivots[wheel.part]) && differ(pivots[wheel.part], axle)) {
                    add('vehicleCheck.pivotDiffers', 'note', { model: spec.name, part: wheel.part }, inModel(`vehicle.wheels[${index}].at`), about);
                }
            });
            (raw && Array.isArray(raw.controls) ? raw.controls : []).forEach((control, index) => {
                if (isObject(control) && control.part && Array.isArray(control.at) && Array.isArray(pivots[control.part]) && differ(pivots[control.part], control.at)) {
                    add('vehicleCheck.pivotDiffers', 'note', { model: spec.name, part: control.part }, inModel(`vehicle.controls[${index}].at`), about);
                }
            });

            // The front is a guess where the file names none, where a tool wrote its own guess, and wherever the game says it guessed.
            // A front the game could not read has its own line above.
            const guessedFront = block && isObject(block.guessed) ? !!block.guessed.forward : !raw || raw.forward === undefined;
            if (!unread.has('forward') && (guessedFront || (raw && Array.isArray(raw.guessed) && raw.guessed.includes('forward')))) {
                add('vehicleCheck.frontGuess', 'note', { model: spec.name }, inModel('vehicle.forward'), Object.assign({}, fronted, about));
            }
            if (seat && !(raw && Array.isArray(raw.seats))) add('vehicleCheck.pointsGuess', 'note', { model: spec.name }, inModel('vehicle.seats'), about);

            // Whether each starting party member who has a 3D body reaches.
            if (seat && first && block && measured && measured.object) {
                if (!Rider || typeof Rider.fit !== 'function' || typeof lookups.rider !== 'function') skip('fit');
                else {
                    for (const actorId of Array.isArray(P.system && P.system.partyMembers) ? P.system.partyMembers : []) {
                        let body = null;
                        try { body = lookups.rider(actorId); } catch (error) { body = null; }
                        if (!body || !body.object) continue;
                        const actor = recordOf(P.actors, actorId);
                        let fit = null, smaller = NaN;
                        try { fit = Rider.fit(body.object, measured.object, block, size); } catch (error) { fit = null; }
                        if (fit && fit.ok === false && typeof Rider.fitSize === 'function') {
                            try { smaller = size - Number(Rider.fitSize([body.object], measured.object, block, kindName).size); } catch (error) { smaller = NaN; }
                        }
                        fitLines(fit, body.name || (actor && actor.name) || `Actor ${actorId}`, name, { file: modelFile, path: 'vehicle.seats[0]' }, smaller,
                            (key, level, args, at, extra) => add(key, level, args, at, Object.assign({ actorId }, about, extra)));
                    }
                }
            }
        }

        // A party member nobody can show on a seat: a picture hero, or a model with no skeleton.
        if (seated && isObject(P.system) && Array.isArray(P.system.partyMembers)) {
            for (const actorId of P.system.partyMembers) {
                const actor = recordOf(P.actors, actorId);
                let shown = null;
                if (typeof lookups.rider === 'function') { try { shown = !!lookups.rider(actorId); } catch (error) { shown = null; } }
                else if (isObject(P.bindings)) {
                    const entry = isObject(P.bindings.actors) ? P.bindings.actors[String(actorId)] : null;
                    const spec = isObject(entry) ? (isObject(entry.character) ? entry.character : entry) : null;
                    shown = !!(spec && spec.name);
                }
                if (shown === false) add('vehicleCheck.noSkeleton', 'note', { rider: (actor && actor.name) || `Actor ${actorId}` }, { file: 'data/Database.r3d.json', path: `actors.${actorId}` }, { actorId });
            }
        }

        //---------------------------------------------------------------------
        // Vehicles on maps.

        const C = battleCheck(lookups);
        const uses = usesOf(P);
        // What the stand test is given for a map: the caller's lookups, with a body for every event of it (a
        // vehicle's own, else what `unitBody` measures for a unit or a model), so a big neighbor is in the way.
        const standing = new Map();
        const standLookups = map => {
            if (standing.has(map)) return standing.get(map);
            const made = Object.assign({}, lookups, {
                body: (event, unit) => {
                    if (!C.is3D(map,lookups)) return [[0,0]];
                    const row = S.vehicleOf(event), record = row ? S.typeAt(types, row.type) : null;
                    const spec = record ? specOf(record, null) : null;
                    if (spec && typeof lookups.body === 'function') return lookups.body(map, event, spec, row.yaw);
                    return typeof lookups.unitBody === 'function' ? lookups.unitBody(map, event, unit) : null;
                }
            });
            standing.set(map, made);
            return made;
        };
        const free = !(isObject(P.system) && isObject(P.system.reactorVehicles) && P.system.reactorVehicles.free === false);
        const offSaid = new Set(), fastSaid = new Set(), taken = new Map();
        for (const entry of everywhere) {
            const { map, event, row } = entry;
            const at = event._rrDatabaseVehicle ? `[${event._rrDatabaseVehicle}]` : `events[${event.id}].rrVehicle`;
            const where = path => ({ file: event._rrDatabaseVehicle ? TYPES_FILE : mapFile(map.id), path: path ? `${at}.${path}` : at });
            const more = { mapId: map.id, eventId: event.id };
            const label = pad(event.id);
            if (isObject(event.rrVehicle)) {
                for (const key of Object.keys(event.rrVehicle)) {
                    if (FORMAT.row.includes(key)) continue;
                    const suggestion = suggest(key, FORMAT.row);
                    add(suggestion ? 'vehicleCheck.notSetting' : 'vehicleCheck.notSettingPlain', 'fix', suggestion ? { file: mapFile(map.id), key: 'rrVehicle.' + key, suggestion } : { file: mapFile(map.id), key: 'rrVehicle.' + key }, where(key), more);
                }
            }
            // The record at the row's place in the list, as the game finds it.
            const record = row ? S.typeAt(types, row.type) : null;
            if (!row || !record) {
                const asked = isObject(event.rrVehicle) && event.rrVehicle.type !== undefined ? event.rrVehicle.type : '?';
                add('vehicleCheck.noType', 'fix', { event: `${event.name || 'EV' + label} (${label})`, map: entry.mapName, id: String(asked) }, where('type'), more);
                continue;
            }
            more.typeId = row.type;
            const name = String(record.name || '') || `Vehicle ${row.type}`;
            const listed = report.types.find(type => type.id === row.type) || null;
            const words = { name, event: label, map: entry.mapName };
            const deep = C && typeof C.is3D === 'function' ? C.is3D(map, lookups) : /<3d>/i.test(String(map.note || ''));
            let rides = '';
            if (deep && Number(map.scrollType) > 0) rides = 'loopMap';
            else if (deep && firstPerson(map)) rides = 'firstPersonMap';
            else if (!free) rides = 'freeOff';
            else if (record.ridable===false) rides = 'notRidable';
            else if (!deep && !record.sheet?.characterName && event.pages?.some(page=>page && !page.image?.characterName && !page.image?.tileId)) rides='noSprite';
            report.vehicles.push({ mapId: map.id, mapName: entry.mapName, eventId: event.id, name: event.name || '', x: event.x, y: event.y, type: row.type, yaw: row.yaw, board: row.board, key: row.key, rides });
            if (rides && !(rides === 'freeOff' && offSaid.has(map.id))) {
                if (rides === 'freeOff') offSaid.add(map.id);
                add('vehicleCheck.' + rides, rides==='noSprite'?'fix':'note', { name, map: entry.mapName }, where(''), more);
            }

            const raw = String(isObject(event.rrVehicle) && typeof event.rrVehicle.key === 'string' ? event.rrVehicle.key : '').trim();
            if (raw && (S.RESERVED.includes(raw.toLowerCase()) || raw.includes(':'))) add('vehicleCheck.badName', 'fix', { name, event: label, key: raw }, where('key'), more);
            else if (raw) taken.set(raw, (taken.get(raw) || []).concat([entry]));

            const pages = (event.pages || []).filter(Boolean);
            if (row.board === 'ok' && pages.some(hasCommands)) add('vehicleCheck.commandsIdle', 'note', { name, event: label }, where('board'), more);
            if (row.board === 'command') {
                const identity = `${map.id}:${event.id}`;
                const boarded = uses.commands.some(use => use.name === 'GetOnVehicle' && (
                    (use.vehicle === 'this' && use.mapId === map.id && use.eventId === event.id) || (use.vehicle === 'nearest' && use.mapId === map.id)
                    || use.vehicle === identity || (raw && use.vehicle === raw)))
                    || uses.scripts.some(use => /ReactorVehicles\s*\.\s*getOn\s*\(/.test(use.text) && (use.text.includes(identity) || (raw && quoted(raw).test(use.text))
                        || (use.mapId === map.id && use.eventId === event.id)));
                if (!boarded) add('vehicleCheck.noBoarder', 'note', { name, event: label }, where('board'), more);
            }
            if (pages.some(page => Number(page.moveType) > 0)) add('vehicleCheck.movesAlone', 'note', words, { file: mapFile(map.id), path: `events[${event.id}].pages` }, more);

            const held = blocks.get(row.type) || null;
            const front = held ? (held.block && Array.isArray(held.block.f) ? frontOf(held.block.f) : frontOf(held.raw && held.raw.forward)) : null;
            const own = isObject(map.reactor3d) && isObject(map.reactor3d.events) ? map.reactor3d.events[String(event.id)] : null;
            if (front && isObject(own)) {
                const marked = Object.keys(own).map(page => isObject(own[page]) && isObject(own[page].faces) ? frontOf(own[page].faces.front) : null).find(Boolean);
                if (marked && marked[0] * front[0] + marked[2] * front[2] < FRONT_AGREES) add('vehicleCheck.frontMark', 'note', { name, event: label }, { file: `data/Map${pad(map.id)}.r3d.json`, path: `events.${event.id}` }, more);
            }

            // Where it stands, by Battle Setup's stand test, with its own body.
            if (C && typeof C.standing === 'function' && Number.isFinite(map.width) && Number.isFinite(map.height)) {
                let shape = deep ? null : [[0,0]];
                const spec = held ? held.spec : specOf(record, null);
                if (deep && typeof lookups.body === 'function' && spec) { try { shape = C.toShape(lookups.body(map, event, spec, row.yaw)); } catch (error) { shape = null; } }
                const lift = Number(isObject(map.reactor3d) && isObject(map.reactor3d.eventZ) && map.reactor3d.eventZ[String(event.id)]) || 0;
                let stand = null;
                try { stand = C.standing(map, event.x, event.y, { lift, eventId: event.id, body: shape || undefined, name }, standLookups(map)); } catch (error) { stand = null; }
                if (!stand || stand.unknown) skip('stand');
                else if (!stand.ok) add('vehicleCheck.noFit', 'fix', words, { file: mapFile(map.id), path: `events[${event.id}]` }, Object.assign({ why: stand.why, whyKey: stand.whyKey, whyArgs: stand.whyArgs, whyText: stand.whyText, x: event.x, y: event.y }, more));
            }

            const across = Math.max(Number(map.width) || 0, Number(map.height) || 0);
            if (listed && across > 0 && !rides && across / listed.speed < CROSSING && !fastSaid.has(row.type + '|' + map.id)) {
                fastSaid.add(row.type + '|' + map.id);
                add('vehicleCheck.fast', 'note', { name, map: entry.mapName, seconds: round(across / listed.speed, 1) }, { file: mapFile(map.id), path: '' }, more);
            }
        }

        // A name two vehicles carry: wrong when something uses it, said when nothing does.
        for (const [key, list] of taken) {
            if (list.length < 2) continue;
            const far = list[0].mapId !== list[1].mapId;
            const words = entry => `${entry.event.name || 'EV' + pad(entry.event.id)} (${pad(entry.event.id)}${far ? ', ' + entry.mapName : ''})`;
            const args = { key, a: words(list[0]), b: words(list[1]) };
            const where = { file: mapFile(list[1].mapId), path: `events[${list[1].event.id}].rrVehicle.key` };
            const more = { mapId: list[1].mapId, eventId: list[1].event.id };
            const command = uses.commands.find(use => use.vehicle === key);
            if (command) add('vehicleCheck.sameName', 'fix', Object.assign({ command: command.label }, args), where, more);
            else if (uses.scripts.some(use => quoted(key).test(use.text))) add('vehicleCheck.sameNameScript', 'fix', args, where, more);
            else add('vehicleCheck.sameNameUnused', 'note', args, where, more);
        }

        //---------------------------------------------------------------------
        // The project.

        for (const type of report.types) {
            if (!type.placed) add('vehicleCheck.unplaced', 'note', { name: type.name }, { file: TYPES_FILE, path: `[${type.id}]` }, { typeId: type.id });
        }
        if (records.length) {
            for (const plugin of Array.isArray(P.plugins) ? P.plugins : []) {
                if (!plugin || !plugin.status || typeof plugin.name !== 'string') continue;
                const where = { file: 'js/plugins.js', path: plugin.name };
                if (MOVERS.includes(plugin.name)) add('vehicleCheck.pluginMoves', 'note', { plugin: plugin.name }, where, { plugin: plugin.name });
                if (REGIONS.includes(plugin.name)) add('vehicleCheck.pluginRegions', 'note', { plugin: plugin.name }, where, { plugin: plugin.name });
            }
        }

        // A check that was left out is a note of its own: counted in the sentence, and what --strict stops at.
        for (const name of report.skipped) add('vehicleCheck.skip.' + name, 'note', {}, { file: '', path: '' }, { skipped: name });

        report.fixes = report.lines.filter(line => line.level === 'fix').length;
        report.notes = report.lines.length - report.fixes;
        report.ok = report.fixes === 0;
        if (!records.length && !everywhere.length && !report.lines.length) report.sentence = item('vehicleCheck.none', {});
        else report.sentence = sentenceOf(report.fixes, report.notes);
        return report;
    }

    /** A box's longest side: what a model's `size` is the length of. */
    function longest(box) {
        if (!box) return 0;
        if (Array.isArray(box.size)) return Math.max(Number(box.size[0]) || 0, Number(box.size[1]) || 0, Number(box.size[2]) || 0);
        if (Array.isArray(box.min) && Array.isArray(box.max)) return Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);
        return 0;
    }

    /** Whether two model-space points are apart by more than a thousandth of a unit. */
    const differ = (a, b) => [0, 1, 2].some(i => Math.abs((Number(a[i]) || 0) - (Number(b[i]) || 0)) > 1e-3);

    /** The sentence for a count of things to fix and of notes: what a tool prints last and the page's status line says. */
    function sentenceOf(fixes, notes) {
        if (fixes > 0) return item('vehicleCheck.notReady', { count: fixes });
        return notes === 0 ? item('vehicleCheck.ready', {}) : notes === 1 ? item('vehicleCheck.readyNote', {}) : item('vehicleCheck.readyNotes', { count: notes });
    }

    const api = { MESSAGES, KINDS, FORMAT, RANGES, HOLD, MOVERS, REGIONS, COMMANDS, SOUND_SLOTS, problems, say, sentenceOf, soundsOf, placed, suggest, kindsOf, typeOf, frontOf, wheelParts, usesOf, firstPerson };
    root.RRVehicleCheck = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
