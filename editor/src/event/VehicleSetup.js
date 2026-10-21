/**
 * VehicleSetup - a vehicle on a map and in its files, as plain data.
 *
 * A vehicle in the world is an ordinary event with one extra key,
 * `rrVehicle: { type, yaw, board, key }`; what is true of its model lives in
 * the model's own `model.json` under `vehicle`; its type is a record of
 * `data/ReactorVehicles.json`. This file makes and reads those three, for
 * the event editor's Vehicle row, the Vehicles page, the map tools and
 * build-scripts/place-vehicle.cjs, make-vehicle.cjs and carve-part.cjs:
 *
 *   RRVehicles.vehicleEvent(id, x, y, { type, yaw, key, board, name }) -> event
 *   RRVehicles.vehicleOf(event)                 -> { type, yaw, board, key } | null
 *   RRVehicles.modelOf(event, types, kinds)     -> model spec | null
 *   RRVehicles.rowValue(current, change, lists) -> { value, problem }
 *   RRVehicles.mergeModel(text, vehicle, pivots, options) -> text
 *   RRVehicles.withPart(text, part, options)    -> text
 *   RRVehicles.withType(text, record, options)  -> { text, id, added }
 *
 * Facings are degrees, 0 north, clockwise. No DOM, no file access.
 */
(function(root) {
    'use strict';

    // What a vehicle's name may not be: the three words a command uses for "this event's", "the one the party rides" and "the nearest".
    const RESERVED = ['this', 'ridden', 'nearest'];
    const BOARD = ['ok', 'command'];
    const FACES = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
    const FACE_WORDS = { 0: 'north', 45: 'north-east', 90: 'east', 135: 'south-east', 180: 'south', 225: 'south-west', 270: 'west', 315: 'north-west' };
    // Tiles a model is drawn long when its record has no size, where the runtime's own table of kinds is not loaded.
    const KIND_SIZE = { motorcycle: 3.5, tank: 12, airship: 12, shuttle: 9, car: 5, boat: 6, hover: 4 };

    const MESSAGES = {
        'vehicleCheck.nameReserved': '"{key}" cannot be a vehicle\'s name.',
        'vehicleCheck.nameTaken': 'Another vehicle is already named "{key}".'
    };

    const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const fill = (text, args) => String(text).replace(/\{(\w+)\}/g, (token, key) => (args && has(args, key) ? String(args[key]) : token));
    const item = (key, args) => ({ key, args: args || {}, text: fill(MESSAGES[key], args) });
    const clone = value => JSON.parse(JSON.stringify(value));
    const json = () => (typeof root.RRJson !== 'undefined' && root.RRJson && root.RRJson.stringify ? root.RRJson
        : (typeof module !== 'undefined' && module.exports ? require('../utils/JsonFiles.js') : null));
    const stringify = data => { const J = json(); return J ? J.stringify(data) : JSON.stringify(data, null, 2); };

    /** An item's sentence through a translator `t(key, args)`; the English without one, or where it has no such key. */
    function say(entry, t) {
        if (!entry) return '';
        if (typeof t === 'function') {
            const told = t(entry.key, entry.args || {});
            if (told && told !== entry.key) return told;
        }
        return fill(MESSAGES[entry.key] || entry.text || entry.key, entry.args);
    }

    //-------------------------------------------------------------------------
    // Facings.

    /** A facing as degrees from 0 up to 360, to a thousandth; null for what is no number. */
    function degrees(value) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        if (!Number.isFinite(number)) return null;
        const turned = ((number % 360) + 360) % 360;
        const rounded = Math.round(turned * 1000) / 1000;
        return rounded >= 360 ? 0 : rounded;
    }

    /** The degrees an RPG Maker direction faces: 8 north 0, 6 east 90, 2 south 180, 4 west 270, and the four between. */
    function yawOfDirection(direction) {
        return ({ 8: 0, 9: 45, 6: 90, 3: 135, 2: 180, 1: 225, 4: 270, 7: 315 })[Number(direction)] ?? 180;
    }

    /** The nearest of the four directions to a facing in degrees. */
    function directionOfYaw(yaw) {
        const turn = degrees(yaw);
        return [8, 6, 2, 4][Math.round((turn === null ? 180 : turn) / 90) % 4];
    }

    /** The nearest of the eight directions to a facing in degrees. */
    function dir8OfYaw(yaw) {
        const turn = degrees(yaw);
        return [8, 9, 6, 3, 2, 1, 4, 7][Math.round((turn === null ? 180 : turn) / 45) % 8];
    }

    /** `south`, `north-east`, ...: the nearest of eight, for a tool's line. */
    const faceWord = yaw => FACE_WORDS[(Math.round((degrees(yaw) ?? 180) / 45) % 8) * 45];

    //-------------------------------------------------------------------------
    // The event.

    /** The editor's own new page (`EventManager.makeDefaultEventPage`): Same as Characters, Action Button, no picture. */
    function defaultPage() {
        return {
            conditions: {
                actorId: 1, actorValid: false, itemId: 1, itemValid: false,
                selfSwitchCh: 'A', selfSwitchValid: false,
                switch1Id: 1, switch1Valid: false,
                switch2Id: 1, switch2Valid: false,
                variableId: 1, variableValid: false, variableValue: 0
            },
            directionFix: false,
            image: { tileId: 0, characterName: '', direction: 2, pattern: 0, characterIndex: 0 },
            moveFrequency: 3,
            moveRoute: { list: [{ code: 0, indent: null, parameters: [] }], repeat: true, skippable: false, wait: false },
            moveSpeed: 3, moveType: 0, priorityType: 1,
            stepAnime: false, through: false, trigger: 0, walkAnime: true,
            list: [{ code: 0, indent: 0, parameters: [] }]
        };
    }

    /** The row to store: `type` first, then only what says something (`yaw` when given, `board` when a command boards, `key` when named). */
    function rowOf(type, yaw, board, key) {
        const row = { type: Math.max(0, Math.floor(Number(type) || 0)) };
        const turn = degrees(yaw);
        if (turn !== null) row.yaw = turn;
        if (board === 'command') row.board = 'command';
        const name = String(key === null || key === undefined ? '' : key).trim();
        if (name) row.key = name;
        return row;
    }

    /**
     * A vehicle as an event at (x, y): named after its type, one empty
     * page, priority Same as Characters, trigger Action Button, no picture,
     * and its row. `options`: `type` (the record's place in the list), `yaw` (degrees),
     * `board` (`ok` or `command`), `key` (a name for commands and scripts),
     * `name` (the event's name: the type's).
     */
    function vehicleEvent(id, x, y, options = {}) {
        const row = rowOf(options.type, options.yaw, options.board, options.key);
        const page = defaultPage();
        page.image.direction = directionOfYaw(has(row, 'yaw') ? row.yaw : 180);
        return { id, name: String(options.name || '') || 'Vehicle', note: '', pages: [page], x, y, rrVehicle: row };
    }

    /**
     * The vehicle an event is, as the game reads its row: `{ type, yaw,
     * board, key }`, or null. `yaw` is the row's, else the facing of the
     * event's first page.
     */
    function vehicleOf(event) {
        const raw = event && event.rrVehicle;
        if (!raw || typeof raw !== 'object') return null;
        const type = Math.floor(Number(raw.type)) || 0;
        if (!(type > 0)) return null;
        const image = event.pages && event.pages[0] && event.pages[0].image;
        const own = degrees(raw.yaw);
        return {
            type,
            yaw: own !== null ? own : yawOfDirection(image && image.direction),
            board: raw.board === 'command' ? 'command' : 'ok',
            key: typeof raw.key === 'string' ? raw.key.trim() : ''
        };
    }

    /**
     * A record's placements, as the game reads them (runtime/reactor_3d_vehicles.js `startsOf`): its own start is
     * copy 1, each entry of `copies` (`{ id, startMapId, startX, startY, startDirection }`, `id` from 2 up) another
     * vehicle of that kind. `[{ copy, mapId, x, y, direction, source }]`; `source` is the object that holds it.
     */
    const COPY = 10000;
    const identityOf = (type, copy) => '0:' + (type + COPY * ((copy > 1 ? Math.floor(copy) : 1) - 1));
    function startsOf(record) {
        const starts = [];
        if (!record || typeof record !== 'object') return starts;
        const read = (source, copy) => starts.push({ copy, mapId: Math.floor(Number(source.startMapId)) || 0, x: Number(source.startX || 0), y: Number(source.startY || 0),
            direction: [1, 2, 3, 4, 6, 7, 8, 9].includes(source.startDirection) ? source.startDirection : 2, source });
        read(record, 1);
        for (const entry of Array.isArray(record.copies) ? record.copies : []) {
            const copy = entry && typeof entry === 'object' ? Math.floor(Number(entry.id)) : 0;
            if (copy > 1 && copy < COPY && !starts.some(start => start.copy === copy)) read(entry, copy);
        }
        return starts;
    }
    /** Another copy of a record, unplaced: added to its `copies` under the next number never used on it. */
    function addCopy(record) {
        if (!Array.isArray(record.copies)) record.copies = [];
        const taken = startsOf(record).map(start => start.copy);
        const id = Math.max(1, Number(record.copyCount) || 0, ...taken) + 1;
        // (The count is kept, so a copy taken away never gives its number, and what a save holds of it, to another.)
        record.copyCount = id;
        const entry = { id, startMapId: 0, startX: 0, startY: 0 };
        record.copies.push(entry);
        return entry;
    }
    /** Every vehicle of the Database a command can name: `{ value, type, copy, label }`, a record with no copy placed once by its own number. */
    function placedVehicles(types) {
        const list = [];
        (Array.isArray(types) ? types : []).forEach((record, type) => {
            if (!(type > 0) || !record || typeof record !== 'object') return;
            const starts = startsOf(record), several = starts.length > 1;
            starts.forEach((start, at) => list.push({ value: identityOf(type, start.copy), type, copy: start.copy,
                label: String(type).padStart(4, '0') + ': ' + (record.name || '') + (several ? ' ' + (at + 1) : '') }));
        });
        return list;
    }

    const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
    /**
     * The type record a row's `type` names: the one at that place in the
     * list (`types[type]`), as the game finds it. A record's own `id` is
     * not asked. Null where the list has no record there.
     */
    function typeAt(types, type) {
        const at = Math.floor(Number(type));
        return Array.isArray(types) && at > 0 && isRecord(types[at]) ? types[at] : null;
    }
    /** The number an event's row names a record by: its place in the list. 0 for a record the list does not hold. */
    function typeIdOf(types, record) {
        const at = Array.isArray(types) && isRecord(record) ? types.indexOf(record) : -1;
        return at > 0 ? at : 0;
    }
    const lastPart = name => String(name || '').split('/').filter(Boolean).pop() || '';

    /**
     * A type record's model as a whole spec: `file` the last part of `name`
     * when absent, `ext` `.glb`, `size` the record's or its kind's. Null
     * for a record with no model. `kinds` is the runtime's table of kinds.
     */
    function typeModel(record, kinds) {
        const model = record && record.model;
        if (record?.graphic3d === false) return null;
        if (!model || typeof model !== 'object' || !model.name) return null;
        const vehicles = root.Reactor3D && root.Reactor3D.Vehicles;
        if (!kinds && vehicles && typeof vehicles.typeOf === 'function') {
            // A record the game's own reader cannot take (a kind that is no kind) is read here, as a motorcycle.
            let typed = null;
            try { typed = vehicles.typeOf(Object.assign({}, record)); } catch (error) { typed = null; }
            if (typed && typed.model) return typed.model;
        }
        const table = kinds || (vehicles && vehicles.KINDS) || null;
        // A kind is a key the table itself has: `constructor` is no kind.
        const known = name => typeof name === 'string' && ((!!table && has(table, name)) || has(KIND_SIZE, name));
        const kind = known(record.kind) ? record.kind : 'motorcycle';
        const size = Number(model.size) > 0 ? Number(model.size) : Number(table && has(table, kind) && table[kind] && table[kind].size) || KIND_SIZE[kind] || KIND_SIZE.motorcycle;
        const spec = { name: String(model.name), file: String(model.file || '') || lastPart(model.name), ext: String(model.ext || '') || '.glb', size };
        for (const key of ['scale', 'variant', 'texture', 'offset']) if (model[key] !== undefined) spec[key] = clone(model[key]);
        return spec;
    }

    /**
     * The model a vehicle event is drawn as when it has no picture or model
     * of its own: its type's. Its heading is `vehicleOf(event).yaw`. Null
     * for an event that is no vehicle, a type the list lacks, a type with no
     * model. The type is the record at the row's place in the list.
     */
    function modelOf(event, types, kinds) {
        const row = vehicleOf(event);
        if (!row) return null;
        return typeModel(typeAt(types, row.type), kinds);
    }

    /**
     * Why a name cannot be a vehicle's: one of the three reserved words, a
     * `:` in it (an identity is `"<mapId>:<eventId>"`), or a name in `taken`
     * (the names other vehicles carry). Null for a name that can.
     */
    function nameProblem(key, taken) {
        const name = String(key === null || key === undefined ? '' : key).trim();
        if (!name) return null;
        if (RESERVED.includes(name.toLowerCase()) || name.includes(':')) return item('vehicleCheck.nameReserved', { key: name });
        if (Array.isArray(taken) && taken.some(other => String(other || '').trim() === name)) return item('vehicleCheck.nameTaken', { key: name });
        return null;
    }

    /** The name an event takes when it becomes a vehicle: the type's, for an event still called `EV` and digits. */
    function nameAfter(eventName, record) {
        return /^EV\d+$/.test(String(eventName || '')) && record && record.name ? String(record.name) : null;
    }

    /**
     * What the event editor's Vehicle row stores after a change. `current`
     * is the event's `rrVehicle` (null: not a vehicle), `change` the row's
     * controls, each optional: `{ type, yaw, board, key }`; `type` is a
     * record's place in the list, and 0, '' or null is "Not a vehicle".
     * `lists`: `types` (the records), `taken` (the
     * names other vehicles carry), `commands` (the event's page already has
     * commands: a vehicle chosen for the first time is then boarded by a
     * command). Returns `{ value, problem }`: `value` the row, or null;
     * `problem` the sentence of a refused name, whose row keeps the name it
     * had and takes the rest of the change.
     */
    function rowValue(current, change, lists) {
        const now = current && typeof current === 'object' ? current : null;
        const asked = change || {};
        const cleared = has(asked, 'type') && !(Number(asked.type) > 0);
        if (cleared) return { value: null, problem: null };
        const types = (lists && lists.types) || null;
        let type = has(asked, 'type') ? Math.floor(Number(asked.type)) : now ? Math.floor(Number(now.type) || 0) : 0;
        // A type the Database does not have is not chosen: the row keeps the one it had, else takes the first there is.
        if (type > 0 && Array.isArray(types) && !typeAt(types, type)) {
            const first = types.findIndex((entry, index) => index > 0 && isRecord(entry));
            type = now && Number(now.type) > 0 ? Math.floor(Number(now.type)) : first > 0 ? first : 0;
        }
        if (!(type > 0)) return { value: null, problem: null };
        const next = Object.assign({}, now || {}, { type });
        if (has(asked, 'yaw')) {
            const turn = degrees(asked.yaw);
            if (turn === null) delete next.yaw; else next.yaw = turn;
        }
        if (has(asked, 'board')) {
            if (asked.board === 'command') next.board = 'command'; else delete next.board;
        } else if (!now && lists && lists.commands) next.board = 'command';
        let problem = null;
        if (has(asked, 'key')) {
            const name = String(asked.key === null || asked.key === undefined ? '' : asked.key).trim();
            problem = nameProblem(name, lists && lists.taken);
            if (!problem) { if (name) next.key = name; else delete next.key; }
        }
        // Stored in one order whatever was changed first: type, yaw, board, key, then keys the row does not show.
        const value = {};
        for (const key of ['type', 'yaw', 'board', 'key']) if (has(next, key)) value[key] = next[key];
        for (const key of Object.keys(next)) if (!has(value, key)) value[key] = next[key];
        return { value, problem };
    }

    //-------------------------------------------------------------------------
    // The files.

    /** A file's text as its object; `{}` for no text. Throws for text that is not a JSON object. */
    function objectOf(text, what) {
        if (text === null || text === undefined || String(text).trim() === '') return {};
        const parsed = JSON.parse(String(text).replace(/^﻿/, ''));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${what} must contain a JSON object`);
        return parsed;
    }

    /**
     * Whether a Spin motion reaches a part, as the rule engine matches a
     * rule to a part: case does not matter; the rule's `part` is the
     * beginning of the part's name, or its whole name when the rule is
     * `exact`.
     */
    function spinReaches(rule, part) {
        if (!rule || rule.type !== 'spin' || typeof rule.part !== 'string' || rule.part === '') return false;
        const asked = rule.part.toLowerCase(), name = String(part).toLowerCase();
        return rule.exact === true ? name === asked : name.startsWith(asked);
    }

    /**
     * A model's `model.json` with its `vehicle` block set and the named
     * `pivots` entries set; every other key is kept, in its place.
     * `vehicle` null takes the block out, undefined leaves it; a `pivots`
     * entry of null takes that pivot out. `options.removeSpins` (part
     * names) takes the Spin motions of those parts out of `animations`: a
     * wheel rolls by the road, and a motion left on it would turn it twice.
     */
    function mergeModel(previousText, vehicle, pivots, options = {}) {
        const data = objectOf(previousText, 'model.json');
        if (vehicle === null) delete data.vehicle;
        else if (vehicle !== undefined) data.vehicle = vehicle;
        if (pivots && typeof pivots === 'object') {
            const kept = data.pivots && typeof data.pivots === 'object' && !Array.isArray(data.pivots) ? data.pivots : {};
            for (const name of Object.keys(pivots)) {
                if (pivots[name] === null || pivots[name] === undefined) delete kept[name];
                else kept[name] = pivots[name];
            }
            if (Object.keys(kept).length) data.pivots = kept; else delete data.pivots;
        }
        const wheels = Array.isArray(options.removeSpins) ? options.removeSpins : [];
        if (wheels.length && Array.isArray(data.animations)) {
            data.animations = data.animations.filter(rule => !wheels.some(part => spinReaches(rule, part)));
        }
        return stringify(data) + '\n';
    }

    /** The Spin motions of a `model.json` object that would also turn one of the parts named. */
    function spinsOn(data, parts) {
        const rules = data && Array.isArray(data.animations) ? data.animations : [];
        return rules.filter(rule => (parts || []).some(part => spinReaches(rule, part)));
    }

    /** Two lists of triangle runs as one, sorted, with runs that touch or overlap joined. */
    function joinRuns(a, b) {
        const runs = [].concat(a || [], b || []).map(run => [Math.floor(run[0]), Math.floor(run[1])]).filter(run => run[0] >= 0 && run[1] > 0)
            .sort((p, q) => p[0] - q[0]);
        const out = [];
        for (const [start, count] of runs) {
            const last = out[out.length - 1];
            if (last && start <= last[0] + last[1]) last[1] = Math.max(last[1], start + count - last[0]);
            else out.push([start, count]);
        }
        return out;
    }

    /**
     * A model's `model.json` with one carved part (`{ name, pivot, meshes:
     * { "<carve index>": [[start, count]] } }`, the Select tool's own
     * format) written: over the part of that name, else added after the
     * others. `options.add` joins its runs to the part of that name (the
     * pivot is `part.pivot` when given, else the one it had);
     * `options.remove` takes the part out. Every other key is kept.
     */
    function withPart(previousText, part, options = {}) {
        const data = objectOf(previousText, 'model.json');
        const parts = Array.isArray(data.parts) ? data.parts : [];
        const at = parts.findIndex(entry => entry && entry.name === part.name);
        if (options.remove) {
            if (at >= 0) parts.splice(at, 1);
        } else {
            let entry = { name: String(part.name), pivot: part.pivot, meshes: part.meshes };
            if (options.add && at >= 0) {
                const meshes = Object.assign({}, parts[at].meshes || {});
                for (const key of Object.keys(part.meshes || {})) meshes[key] = joinRuns(meshes[key], part.meshes[key]);
                entry = { name: String(part.name), pivot: part.pivot || parts[at].pivot, meshes };
            }
            const sorted = {};
            for (const key of Object.keys(entry.meshes || {}).sort((a, b) => Number(a) - Number(b))) sorted[key] = entry.meshes[key];
            entry.meshes = sorted;
            if (at >= 0) parts[at] = entry; else parts.push(entry);
        }
        if (parts.length) data.parts = parts; else delete data.parts;
        return stringify(data) + '\n';
    }

    /**
     * `data/ReactorVehicles.json` with a type record written: at
     * `options.id` when given, else over the record of the same name, else
     * at the next free place. A type's number is its place in the list
     * (what an event's row names it by); the record's own `id` is written
     * to say the same. An updated record keeps the keys `record` does not
     * carry (and, inside `model`, `handling`, `body`, `sounds` and
     * `camera`, the keys those do not carry). No text is a new list.
     * Returns `{ text, id, added }`.
     */
    function withType(previousText, record, options = {}) {
        let list = [null];
        if (previousText !== null && previousText !== undefined && String(previousText).trim() !== '') {
            const parsed = JSON.parse(String(previousText).replace(/^﻿/, ''));
            if (!Array.isArray(parsed)) throw new Error('ReactorVehicles.json must contain a list');
            list = parsed;
        }
        if (!list.length) list.push(null);
        let id = Number(options.id) > 0 ? Math.floor(Number(options.id)) : 0;
        if (!id) {
            const same = list.findIndex((entry, index) => index > 0 && isRecord(entry) && entry.name === record.name);
            if (same > 0) id = same;
        }
        if (!id) { id = 1; while (list[id]) id++; }
        const before = isRecord(list[id]) ? list[id] : null;
        const next = Object.assign({ id }, before || {});
        for (const key of Object.keys(record)) {
            if (key === 'id') continue;
            const value = record[key];
            const nested = ['model', 'handling', 'body', 'sounds', 'camera'].includes(key) && value && typeof value === 'object' && !Array.isArray(value)
                && before && before[key] && typeof before[key] === 'object';
            next[key] = nested ? Object.assign({}, before[key], value) : value;
        }
        next.id = id;
        while (list.length < id) list.push(null);
        list[id] = next;
        return { text: stringify(list), id, added: !before };
    }

    const api = {
        RESERVED, BOARD, FACES, KIND_SIZE, MESSAGES,
        vehicleEvent, vehicleOf, modelOf, typeModel, typeAt, typeIdOf, rowValue, nameProblem, nameAfter,
        COPY, identityOf, startsOf, addCopy, placedVehicles,
        mergeModel, withPart, withType, spinsOn, spinReaches, joinRuns,
        degrees, yawOfDirection, directionOfYaw, dir8OfYaw, faceWord, defaultPage, say
    };
    root.RRVehicles = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
