/**
 * StructureCapture - what stands on a map, made into a structure to use again.
 *
 * A selection of pieces (a box, a building, everything touching one piece)
 * becomes a structure file in the built format (AUTHORING.md › Built
 * structures): its pieces in the plot's own cells, and what stands inside
 * the box they cover: map lights, media surfaces, placed models (`props`),
 * water sheets wholly inside it (`water`, levels above the pad) and, when
 * asked, the events (as `spots` + `events` with a template each, the way a
 * plan places its people). The Build bar's "Save as structure" and
 * build-scripts/save-structure.cjs both use it.
 */
(function(root) {
    'use strict';

    const STOREY = 5;

    /** The cells a piece covers: its own cell, a shape's footprint about its anchor as well. */
    function cellsOf(piece) {
        const x = Number(piece.x) || 0, y = Number(piece.y) || 0;
        if (!Array.isArray(piece.size)) return [[x, y]];
        const ox = Array.isArray(piece.offset) ? Number(piece.offset[0]) || 0 : 0, oy = Array.isArray(piece.offset) ? Number(piece.offset[1]) || 0 : 0;
        // Its width and depth turned by its angle about the vertical (a tilt or roll is left out).
        const hw = (Number(piece.size[0]) || 1) / 2, hd = (Number(piece.size[2] === undefined ? piece.size[0] : piece.size[2]) || 1) / 2;
        const turn = (Number(piece.angle) || 0) * Math.PI / 180, c = Math.abs(Math.cos(turn)), sn = Math.abs(Math.sin(turn));
        const ex = c * hw + sn * hd, ez = sn * hw + c * hd;
        const cx = x + 0.5 + ox, cy = y + 0.5 + oy;
        const out = [];
        for (let cy0 = Math.floor(cy - ez + 1e-6); cy0 <= Math.floor(cy + ez - 1e-6); cy0++) for (let cx0 = Math.floor(cx - ex + 1e-6); cx0 <= Math.floor(cx + ex - 1e-6); cx0++) out.push([cx0, cy0]);
        return out.length ? out : [[x, y]];
    }

    /**
     * Every piece belonging with one: its building's whole group when it has one, else every loose
     * piece reachable from it across shared or touching cells (a stack, a wall run, a roof over it).
     */
    function connected(list, startId) {
        const start = (list || []).find(piece => piece && piece.id === startId);
        if (!start) return [];
        // Rocks are the ground's, not a building's: a building's walk passes them by (a wall built against a cliff
        // took the cliff with it, and a finish given the building mirrored the rocks), and a rock's takes only rocks.
        const kin = piece => (piece.kind === 'rock') === (start.kind === 'rock');
        if (start.group) return list.filter(piece => piece.group === start.group && kin(piece)).map(piece => piece.id);
        const loose = list.filter(piece => piece && !piece.group && kin(piece));
        const byCell = new Map();
        for (const piece of loose) for (const [x, y] of cellsOf(piece)) { const key = x + ',' + y; (byCell.get(key) || byCell.set(key, []).get(key)).push(piece); }
        const chosen = new Set([start.id]);
        const queue = cellsOf(start).map(([x, y]) => x + ',' + y), seen = new Set(queue);
        while (queue.length) {
            const key = queue.pop();
            const [cx, cy] = key.split(',').map(Number);
            for (const piece of byCell.get(key) || []) chosen.add(piece.id);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const next = (cx + dx) + ',' + (cy + dy);
                if (!seen.has(next) && byCell.has(next)) { seen.add(next); queue.push(next); }
            }
            // A shape spanning several cells joins every cell it covers to the flood.
            for (const piece of byCell.get(key) || []) {
                if (!Array.isArray(piece.size)) continue;
                for (const [x, y] of cellsOf(piece)) { const k = x + ',' + y; if (!seen.has(k)) { seen.add(k); queue.push(k); } }
            }
        }
        return list.filter(piece => chosen.has(piece.id)).map(piece => piece.id);
    }

    /** The box (cells, inclusive) the pieces cover, or null. */
    function boxOf(pieces) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const piece of pieces) for (const [x, y] of cellsOf(piece)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
    }

    /** The ground's mean height over a box's corners (what a stamp levels its pad to), 0 with no terrain. */
    function padHeight(map, box, E) {
        if (!E || !E.hasTerrain || !E.hasTerrain(map)) return 0;
        const grid = E.terrain(map), stride = map.width + 1;
        let sum = 0, n = 0;
        for (let y = box.y0; y <= box.y1 + 1; y++) for (let x = box.x0; x <= box.x1 + 1; x++) { sum += Number(grid[y * stride + x]) || 0; n++; }
        return n ? Math.round((sum / n) * 1000) / 1000 : 0;
    }

    /** A name as a file stem: what a structure's file and its events' templates are called. */
    function fileStem(name) {
        return String(name || 'Structure').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '-') || 'Structure';
    }

    /** A spot name from an event's name, unique in `taken`. */
    function spotName(name, taken) {
        const base = String(name || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
        let spot = base, n = 2;
        while (taken.has(spot)) spot = `${base}-${n++}`;
        taken.add(spot);
        return spot;
    }

    const round = value => Math.round(value * 1000) / 1000;

    /**
     * The structure the pieces `ids` make, with what stands in their box. `options`: `E` (the
     * editor's RRMapElevation, required), `name`, `description`, `category`, `events` (true:
     * the events in the box come along as people at spots), `storey` (levels a floor, 5).
     * Returns { plan, templates: [{ name, event }], box, counts } or null when nothing is selected.
     */
    function capture(map, ids, options = {}) {
        const E = options.E;
        if (!map || !E) return null;
        const wanted = new Set(ids || []);
        const pieces = E.pieces(map).filter(piece => wanted.has(piece.id));
        if (!pieces.length) return null;
        const box = boxOf(pieces);
        const { x0, y0, x1, y1 } = box;
        const inCells = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
        const inArea = (x, y) => x >= x0 && x < x1 + 1 && y >= y0 && y < y1 + 1;
        const sidecar = map.reactor3d || {};
        const storey = Number(options.storey) > 0 ? Number(options.storey) : STOREY;
        const plan = { name: String(options.name || 'Structure'), size: [x1 - x0 + 1, y1 - y0 + 1], storey };
        if (options.description) plan.description = String(options.description);
        if (options.category) plan.category = String(options.category);
        let top = 0;
        plan.pieces = pieces.map(piece => {
            const out = Object.assign({}, piece, { x: piece.x - x0, y: piece.y - y0 });
            delete out.id; delete out.group;
            const rise = Array.isArray(piece.size) ? Number(piece.size[1]) || 1 : (/^(wall|doorway|window|pillar|glass|door)$/.test(piece.kind) ? storey : 1);
            top = Math.max(top, (Number(piece.z) || 0) + rise);
            return out;
        });
        plan.height = Math.max(1, Math.min(24, Math.ceil(top / storey)));
        // Lights standing in the box (not the sun, not one riding a character): heights are above the ground already.
        const lights = (Array.isArray(sidecar.lights) ? sidecar.lights : []).filter(light => light && light.type !== 'sun' && !light.attach && inArea(Number(light.x), Number(light.y)))
            .map(light => { const out = Object.assign({}, light, { x: round(Number(light.x) - x0), y: round(Number(light.y) - y0) }); delete out.id; if (!out.tag || /^structure:\d+$/.test(String(out.tag))) delete out.tag; delete out.structure; return out; });
        if (lights.length) plan.lights = lights;
        const surfaces = (Array.isArray(sidecar.mediaSurfaces) ? sidecar.mediaSurfaces : []).filter(row => row && (!row.target || row.target === 'map') && inArea(Number(row.x), Number(row.y)))
            .map(row => { const out = Object.assign({}, row, { x: round(Number(row.x) - x0), y: round(Number(row.y) - y0) }); delete out.id; delete out.structure; return out; });
        if (surfaces.length) plan.surfaces = surfaces;
        // Placed models stand on a cell (their event's): x and y round to it.
        const props = (E.props ? E.props(map) : []).filter(prop => inCells(Math.round(prop.x), Math.round(prop.y)))
            .map(prop => { const out = Object.assign({}, prop, { x: round(prop.x - x0), y: round(prop.y - y0) }); delete out.id; delete out.structure; return out; });
        if (props.length) plan.props = props;
        // Water wholly inside (a fountain's basin, a pond in a garden), its level above the ground it stood on.
        const pad = padHeight(map, box, E);
        const water = (E.water ? E.water(map) : []).filter(sheet => sheet.x0 >= x0 && sheet.x1 <= x1 && sheet.y0 >= y0 && sheet.y1 <= y1)
            .map(sheet => {
                const out = JSON.parse(JSON.stringify(sheet));
                Object.assign(out, { x0: sheet.x0 - x0, y0: sheet.y0 - y0, x1: sheet.x1 - x0, y1: sheet.y1 - y0, level: round(sheet.level - pad) });
                if (Array.isArray(sheet.path)) out.path = sheet.path.map(p => [round(p[0] - x0), round(p[1] - y0), round(p[2] - pad)]);
                delete out.structure;
                return out;
            });
        if (water.length) plan.water = water;
        // The building it was stamped as: its named spots come along (in the plot's cells).
        const groups = new Set(pieces.map(piece => piece.group).filter(Boolean));
        const record = groups.size === 1 && E.structureOf ? E.structureOf(map, [...groups][0]) : null;
        const spots = {};
        for (const [name, at] of Object.entries((record && record.spots) || {})) if (Array.isArray(at) && inCells(at[0], at[1])) spots[name] = [at[0] - x0, at[1] - y0];
        // People: each event in the box a template and a spot, placed where it stood when the structure is stamped.
        const templates = [];
        if (options.events) {
            const taken = new Set(Object.keys(spots));
            const stem = fileStem(plan.name);
            plan.events = [];
            for (const event of Array.isArray(map.events) ? map.events : []) {
                if (!event || !inCells(event.x, event.y)) continue;
                const spot = spotName(event.name, taken);
                spots[spot] = [event.x - x0, event.y - y0];
                const template = `${stem}.${spot}`;
                const copy = JSON.parse(JSON.stringify(event));
                // The tag a stamp puts on a building's people is the stamp's to give, not the template's.
                copy.note = String(copy.note || '').replace(/<structure:\d+>\s*<spot:[^>]+>/g, '').trim();
                delete copy.id; delete copy.x; delete copy.y;
                templates.push({ name: template, event: copy });
                const direction = Number(event.pages && event.pages[0] && event.pages[0].image && event.pages[0].image.direction) || 2;
                plan.events.push({ spot, name: event.name || spot, template, direction });
            }
            if (!plan.events.length) delete plan.events;
        }
        if (Object.keys(spots).length) plan.spots = spots;
        return { plan, templates, box, pad, counts: { pieces: pieces.length, lights: lights.length, surfaces: surfaces.length, props: props.length, water: water.length, events: templates.length } };
    }

    /** How many events stand in the box the pieces cover (what "Include people" would bring). */
    function eventsInBox(map, ids, E) {
        const wanted = new Set(ids || []);
        const box = boxOf(E.pieces(map).filter(piece => wanted.has(piece.id)));
        if (!box) return 0;
        return (Array.isArray(map.events) ? map.events : []).filter(event => event && event.x >= box.x0 && event.x <= box.x1 && event.y >= box.y0 && event.y <= box.y1).length;
    }

    /**
     * Write a captured structure under `<project>/3d/Structures`: `<file>` and its event
     * templates in `events/`. `fs`/`path` are Node's; `stringify` writes the plan (the
     * editor's compact sidecar writer when given). Returns the file name.
     */
    function write(projectPath, result, { fs, path, file, stringify } = {}) {
        const directory = path.join(projectPath, '3d', 'Structures');
        fs.mkdirSync(directory, { recursive: true });
        const name = file || fileStem(result.plan.name) + '.json';
        const text = (typeof stringify === 'function' ? stringify(result.plan) : JSON.stringify(result.plan, null, 2)) + '\n';
        const target = path.join(directory, name), temp = target + '.tmp';
        fs.writeFileSync(temp, text, 'utf8');
        fs.renameSync(temp, target);
        if (result.templates.length) {
            const events = path.join(directory, 'events');
            fs.mkdirSync(events, { recursive: true });
            for (const template of result.templates) fs.writeFileSync(path.join(events, template.name + '.json'), JSON.stringify(template.event, null, 2) + '\n', 'utf8');
        }
        return name;
    }

    const api = { cellsOf, connected, boxOf, padHeight, fileStem, capture, eventsInBox, write };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.RRStructureCapture = api;
})(typeof window !== 'undefined' ? window : globalThis);
