//=============================================================================
// reactor_3d_doors.js — RPG Reactor 3D doors that open, and framed windows
//=============================================================================
/*
 * An extension of Reactor3D (reactor_3d.js), loaded after the world builder:
 * in the game from scriptUrls, in the editor from Reactor3D.EXTENSIONS, and in
 * Node by the core's own tail.
 *
 * A door is a piece of its own, hung in a doorway (or a gap in a fence):
 *
 *   { "kind": "door", "x": 52, "y": 30, "z": 0, "rot": 0, "material": "Wood",
 *     "width": 3, "style": "plank", "hinge": "left", "swing": "in", "opens": "auto",
 *     "lock": { "switch": 12 }, "message": "It's locked.",
 *     "sound": { "open": { "name": "door-open-01", "volume": 80, "pitch": 100 } },
 *     "frame": "Wood", "tag": "inn.front" }
 *
 * It stands on its cell and the `width` - 1 cells after it along its own
 * across (rot 0 runs east); `rot` is the way its front faces (0 south, 1 west,
 * 2 north, 3 east, as a stair's). `swing` "in" opens away from the front.
 * `swing`: "away" (the default) opens away from whoever opens it, so a door pushed from inside swings out;
 * "in" always away from the front, "out" always toward it. A leaf never sweeps through a character: it stops
 * short of anyone on its side, and when that side is taken and the other is clearer it opens the other way.
 * `opens`: "auto" opens for whoever walks up to it and closes behind them,
 * "action" opens and closes with the OK button facing it, "locked" stays shut
 * until its `lock` is met (a switch on, or the party holding an item; with no
 * `lock`, a script unlocks it). Each sound is optional; an empty name is
 * silence. Styles: plank, panelled, arched, double (two panelled leaves) and
 * gate (a fence-high gate). Three cells or more hang two leaves.
 *
 * A window may wear a frame: `"frame": { "style": "cottage", "material": "Wood",
 * "shutters": "#3f5f3a", "closed": false, "flowerBox": true }` on the window
 * piece; `rot` points its outside. Windows side by side at one level and turn
 * are framed as one: one sill, one pair of shutters, a mullion between cells.
 *
 * Drawing: casings, frames, sills, shutters and flower boxes are boxes laid
 * with the pieces (`pieceTrims`: pieces of kind "trim", one mesh per chunk and
 * material like any wall); only a door's leaves are objects of their own, so
 * they can swing. A closed door blocks like a wall; an open one is its
 * threshold. In the editor and in Node no door is ever shut against a walker.
 */

(function(root) {
    "use strict";
    const node = typeof process !== "undefined" && process.versions && process.versions.node
        && !process.versions.nw && typeof require === "function";
    const R = node ? require("./reactor_3d.js") : root.Reactor3D;
    if (!R) return;

    //-------------------------------------------------------------------------
    // The format

    R.DOOR_STYLES = ["plank", "panelled", "arched", "double", "gate"];
    R.DOOR_OPENS = ["auto", "action", "locked"];
    R.DOOR_MAX_WIDTH = 6;
    /** A leaf's height, in tiles (2.16 m under a 2.64 m doorway; the transom fills the rest). */
    R.DOOR_LEAF_HEIGHT = 3.6;
    R.DOOR_GATE_HEIGHT = 1.5;
    /** How far a leaf turns open, degrees. */
    R.DOOR_OPEN_ANGLE = 92;
    /** Frames a swing takes. */
    R.DOOR_SWING_FRAMES = 22;
    R.DOOR_SOUND_KEYS = ["open", "close", "locked"];
    R.DOOR_SOUNDS = {
        open: { name: "door-open-01", volume: 80, pitch: 100 },
        close: { name: "door-close-01", volume: 70, pitch: 100 },
        locked: { name: "door-locked-01", volume: 85, pitch: 100 }
    };
    R.GATE_SOUNDS = {
        open: { name: "gate-open-01", volume: 70, pitch: 100 },
        close: { name: "door-close-02", volume: 60, pitch: 110 },
        locked: { name: "door-locked-01", volume: 80, pitch: 100 }
    };
    R.DOOR_LOCKED_TEXT = "It's locked.";
    R.WINDOW_STYLES = ["cottage", "two", "arched", "plain"];
    R.SHUTTER_COLOUR = "#3f5f3a";

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const hex = v => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

    /** One sound's settings, only what was said; null when nothing was. A name of "" is silence. */
    R.normalizeDoorSound = function(raw) {
        if (!raw || typeof raw !== "object") return null;
        const out = {};
        if (typeof raw.name === "string") out.name = raw.name.trim().slice(0, 120);
        const volume = Number(raw.volume), pitch = Number(raw.pitch);
        if (Number.isFinite(volume)) out.volume = clamp(Math.round(volume), 0, 100);
        if (Number.isFinite(pitch)) out.pitch = clamp(Math.round(pitch), 50, 150);
        return Object.keys(out).length ? out : null;
    };

    /** A door's own fields, normalized: what a door piece keeps beyond kind, place, turn and material. */
    R.normalizeDoor = function(raw) {
        raw = raw || {};
        const width = Math.floor(Number(raw.width));
        const out = {
            width: Number.isFinite(width) ? clamp(width, 1, R.DOOR_MAX_WIDTH) : 1,
            style: R.DOOR_STYLES.includes(raw.style) ? raw.style : "plank",
            hinge: raw.hinge === "right" ? "right" : "left",
            swing: raw.swing === "out" || raw.swing === "in" ? raw.swing : "away",
            opens: R.DOOR_OPENS.includes(raw.opens) ? raw.opens : "auto"
        };
        if (out.opens === "locked" && raw.lock && typeof raw.lock === "object") {
            const sw = Math.floor(Number(raw.lock.switch)), item = Math.floor(Number(raw.lock.item));
            if (sw > 0) out.lock = { switch: sw };
            else if (item > 0) out.lock = { item };
        }
        if (typeof raw.message === "string") out.message = raw.message.slice(0, 200);
        if (raw.sound && typeof raw.sound === "object") {
            const sound = {};
            for (const key of R.DOOR_SOUND_KEYS) { const one = R.normalizeDoorSound(raw.sound[key]); if (one) sound[key] = one; }
            if (Object.keys(sound).length) out.sound = sound;
        }
        const frame = text(raw.frame, 80);
        if (frame) out.frame = frame;
        const tag = text(raw.tag, 80);
        if (tag) out.tag = tag;
        return out;
    };

    /** A window's frame, normalized; null for none. */
    R.normalizeWindowFrame = function(raw) {
        if (raw === true) raw = {};
        if (!raw || typeof raw !== "object") return null;
        const out = { style: R.WINDOW_STYLES.includes(raw.style) ? raw.style : "cottage" };
        const material = text(raw.material, 80);
        if (material) out.material = material;
        const shutters = raw.shutters === true ? R.SHUTTER_COLOUR : hex(raw.shutters);
        if (shutters) out.shutters = shutters;
        if (shutters && raw.closed === true) out.closed = true;
        if (raw.flowerBox === true) out.flowerBox = true;
        return out;
    };

    /** A sound a door makes: its own over its style's default. Null when silent. */
    R.doorSound = function(piece, key) {
        const base = (piece && piece.style === "gate" ? R.GATE_SOUNDS : R.DOOR_SOUNDS)[key];
        const own = piece && piece.sound ? piece.sound[key] : null;
        const sound = Object.assign({}, base, own || {});
        return sound.name ? sound : null;
    };

    //-------------------------------------------------------------------------
    // Where a door is

    /** A turn's across (U) and front (V) as world [dx, dz]: rot 0 runs east and faces south. */
    const ACROSS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const FRONT = [[0, 1], [-1, 0], [0, -1], [1, 0]];
    R.doorAxes = function(rot) { const r = ((rot | 0) % 4 + 4) % 4; return { u: ACROSS[r], v: FRONT[r] }; };

    /** The cells a door hangs across: its own and the next `width` - 1 along its across. */
    R.doorCells = function(piece) {
        const { u } = R.doorAxes(piece.rot);
        const cells = [];
        for (let k = 0; k < (piece.width || 1); k++) {
            const x = piece.x + u[0] * k, y = piece.y + u[1] * k;
            if (x >= 0 && y >= 0) cells.push([x, y]);
        }
        return cells;
    };

    /** A point of a door's own frame (u across, v toward its front, cells) on the map, in tiles. */
    R.doorPoint = function(piece, u, v) {
        const { u: U, v: V } = R.doorAxes(piece.rot);
        const cx = piece.x + 0.5 - 0.5 * (U[0] + V[0]), cz = piece.y + 0.5 - 0.5 * (U[1] + V[1]);
        return [cx + u * U[0] + v * V[0], cz + u * U[1] + v * V[1]];
    };

    /** How tall a door's leaf stands. */
    R.doorLeafHeight = function(piece) { return piece && piece.style === "gate" ? R.DOOR_GATE_HEIGHT : R.DOOR_LEAF_HEIGHT; };

    //-------------------------------------------------------------------------
    // State: only the running game shuts doors (a map's own doors, by piece id)

    R._doorStates = null;

    /** Whether the game's party may not pass a door now: shut and not opening on its own. */
    R.doorBlocking = function(piece, state) {
        if (!state) return false;
        if (state.open) return false;
        // An automatic door opens as anyone comes; a locked one, once unlocked, is automatic. One that cannot swing
        // for someone standing in its way holds the walker back until it can.
        if (piece.opens === "auto" || piece.opens === "locked") return R.doorLocked(piece, state) || !!state.wait;
        return true;
    };

    /** The walkable top of a door piece: its threshold, or its leaf while it is shut. */
    R.doorTop = function(piece) {
        const state = this._doorStates ? this._doorStates.get(piece.id) : null;
        return R.doorBlocking(piece, state) ? piece.z + R.doorLeafHeight(piece) : piece.z;
    };

    /** How far through its swing (0 shut, 1 open) a leaf still stands across its doorway to a shot or a look. */
    R.DOOR_SHUT_SWING = 0.3;

    /**
     * Whether a door's leaf stands across its doorway now, whatever kind of door it is: what a shot or a look
     * is stopped by (`worldRay`). An automatic door lets a walker by yet hides what is behind it until it swings.
     * No door is shut in the editor or in Node.
     */
    R.doorShut = function(piece) {
        const state = this._doorStates && piece ? this._doorStates.get(piece.id) : null;
        return !!state && state.t < R.DOOR_SHUT_SWING;
    };

    const gameOn = () => typeof $gamePlayer !== "undefined" && !!$gamePlayer && typeof $gameMap !== "undefined" && !!$gameMap;
    const saved = () => {
        if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
        return $gameSystem._rrDoors || ($gameSystem._rrDoors = {});
    };
    const savedKey = piece => (typeof $gameMap !== "undefined" && $gameMap ? $gameMap.mapId() : 0) + ":" + piece.id;

    /** Whether a door is locked now: a script's word first, then its lock (a switch off, an item not held). */
    R.doorLocked = function(piece, state) {
        const kept = saved();
        const own = kept ? kept[savedKey(piece)] : null;
        if (own && own.locked === true) return true;
        if (own && own.locked === false) return false;
        if (piece.opens !== "locked") return false;
        const lock = piece.lock;
        if (!lock) return true;
        if (lock.switch) return !(typeof $gameSwitches !== "undefined" && $gameSwitches && $gameSwitches.value(lock.switch));
        if (lock.item) {
            if (own && own.unlocked) return false;
            const item = typeof $dataItems !== "undefined" && $dataItems ? $dataItems[lock.item] : null;
            return !(item && typeof $gameParty !== "undefined" && $gameParty && $gameParty.hasItem(item));
        }
        return true;
    };

    //-------------------------------------------------------------------------
    // Trims: casings, transoms, window frames, sills, shutters, flower boxes

    const RGB = value => { const n = parseInt(String(value).slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
    const FLOWER_TINTS = ["#e04a5a", "#f2a3c4", "#f4d54a", "#fafafa", "#9b7de6", "#ef7d3a"].map(RGB);
    const LEAF_TINT = [0.42, 0.62, 0.32];
    const SOIL_TINT = [0.33, 0.24, 0.18];
    const IRON_TINT = [0.2, 0.19, 0.18];
    const BRASS_TINT = [0.95, 0.76, 0.38];
    const seeded = seed => { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

    /** The arch over an opening `w` wide: its height over `y0` at `u`, rising `rise` at the middle. */
    const archAt = (u, w, y0, rise) => { const t = (u - w / 2) / (w / 2); return y0 + rise * Math.sqrt(Math.max(0, 1 - t * t)); };

    /** A door's casing, linings and transom, as boxes in its own frame (u across, y up, v to its front). */
    R.doorTrimBoxes = function(piece, wallMaterial) {
        const W = piece.width || 1, S = R.PIECE_STOREY, top = S - 0.6, F = piece.frame || piece.material || "Wood";
        const out = [];
        const add = (material, box, tint) => out.push({ material, box, tint });
        if (piece.style === "gate") {
            add(F, [-0.12, 0, 0.38, 0.02, 1.75, 0.62]);
            add(F, [W - 0.02, 0, 0.38, W + 0.12, 1.75, 0.62]);
            return out;
        }
        const leaf = R.DOOR_LEAF_HEIGHT;
        // The wall comes down to the door's head (an arch's crown): the casing and the reveal's lining stop there,
        // and nothing crosses the opening between the leaf and the lintel (a transom there read as a bar across it).
        const rise = piece.style === "arched" ? Math.min(top - leaf - 0.06, 0.25 + 0.2 * W) : 0;
        const head = leaf + rise;
        for (const [v0, v1] of [[-0.05, 0], [1, 1.05]]) {
            add(F, [-0.16, 0, v0, 0.02, head + 0.16, v1]);
            add(F, [W - 0.02, 0, v0, W + 0.16, head + 0.16, v1]);
            add(F, [-0.16, head - 0.02, v0, W + 0.16, head + 0.18, v1]);
        }
        add(F, [0, 0, 0, 0.04, head, 1]);
        add(F, [W - 0.04, 0, 0, W, head, 1]);
        if (piece.style === "arched") {
            // The wall comes down over the leaves' arch, the casing following it as stepped voussoirs.
            const n = Math.max(6, Math.round(W * 5));
            for (let i = 0; i < n; i++) {
                const a = (i / n) * W, b = ((i + 1) / n) * W, y = archAt((a + b) / 2, W, leaf, rise);
                add(wallMaterial || F, [a, y + 0.02, 0, b, top, 1]);
                for (const [v0, v1] of [[-0.05, 0], [1, 1.05]]) add(F, [a, y - 0.02, v0, b, y + 0.16, v1]);
            }
            return out;
        }
        add(wallMaterial || F, [0, leaf + 0.02, 0, W, top, 1]);
        return out;
    };

    /** A run of framed windows (one level, one turn, side by side) as boxes in the first one's frame. */
    R.windowTrimBoxes = function(frame, n, wallMaterial, seed) {
        const S = R.PIECE_STOREY, sill = 1.5, top = S - 1.4, F = frame.material || "Wood";
        const out = [];
        const add = (material, box, tint) => out.push({ material, box, tint });
        // The frame in the reveal round the glass, a mullion between cells.
        add(F, [-0.02, sill, 0.3, 0.1, top, 0.7]);
        add(F, [n - 0.1, sill, 0.3, n + 0.02, top, 0.7]);
        add(F, [0, top - 0.12, 0.3, n, top, 0.7]);
        add(F, [0, sill, 0.3, n, sill + 0.1, 0.7]);
        for (let k = 1; k < n; k++) add(F, [k - 0.05, sill, 0.34, k + 0.05, top, 0.66]);
        let glassTop = top - 0.12;
        if (frame.style === "arched") {
            const rise = Math.min(0.9, 0.35 + 0.25 * n), from = top - rise, m = Math.max(6, n * 5);
            for (let i = 0; i < m; i++) {
                const a = (i / m) * n, b = ((i + 1) / m) * n;
                add(wallMaterial || F, [a, archAt((a + b) / 2, n, from, rise), 0, b, top, 1]);
            }
            glassTop = from;
        }
        // Glazing bars: a cottage window is six small panes a cell, a sash two.
        const bar = 0.05;
        for (let k = 0; k < n; k++) {
            if (frame.style === "cottage" || frame.style === "arched") {
                add(F, [k + 0.5 - bar / 2, sill + 0.1, 0.41, k + 0.5 + bar / 2, glassTop, 0.59]);
                const h = glassTop - sill - 0.1;
                for (const f of [1 / 3, 2 / 3]) add(F, [k + 0.1, sill + 0.1 + h * f - bar / 2, 0.41, k + 0.9, sill + 0.1 + h * f + bar / 2, 0.59]);
            } else if (frame.style === "two") {
                const mid = (sill + 0.1 + glassTop) / 2;
                add(F, [k + 0.05, mid - 0.05, 0.4, k + 0.95, mid + 0.05, 0.6]);
            }
        }
        // A sill out front and a board inside, a band over the head.
        add(F, [-0.15, sill - 0.14, 1, n + 0.15, sill, 1.22]);
        add(F, [0, sill - 0.08, -0.1, n, sill, 0.3]);
        add(F, [-0.15, top, 1, n + 0.15, top + 0.16, 1.05]);
        if (frame.shutters) {
            const tint = RGB(frame.shutters), dark = tint.map(c => c * 0.72), w = Math.min(1.2, n / 2);
            const leaves = frame.closed ? [[0, n / 2], [n / 2, n]] : [[-w - 0.03, -0.03], [n + 0.03, n + w + 0.03]];
            const v0 = frame.closed ? 1.0 : 1.03;
            for (const [a, b] of leaves) {
                add(F, [a, sill + 0.04, v0, b, top - 0.04, v0 + 0.06], tint);
                for (const y of [sill + 0.45, top - 0.45]) add(F, [a + 0.06, y, v0 + 0.06, b - 0.06, y + 0.12, v0 + 0.09], dark);
            }
        }
        if (frame.flowerBox) {
            add(F, [0.05, sill - 0.52, 1.08, n - 0.05, sill - 0.16, 1.48]);
            add(F, [0.1, sill - 0.2, 1.12, n - 0.1, sill - 0.15, 1.44], SOIL_TINT);
            const rnd = seeded(seed || 1), count = Math.round(n * 7);
            for (let i = 0; i < count; i++) {
                const u = 0.18 + (n - 0.36) * (i + rnd() * 0.6) / count, v = 1.16 + rnd() * 0.22, h = 0.12 + rnd() * 0.18;
                add(F, [u - 0.06, sill - 0.16, v - 0.06, u + 0.06, sill - 0.16 + h, v + 0.06], LEAF_TINT);
                const s = 0.05 + rnd() * 0.04, tint = FLOWER_TINTS[Math.floor(rnd() * FLOWER_TINTS.length)];
                add(F, [u - s, sill - 0.16 + h, v - s, u + s, sill - 0.16 + h + s * 1.5, v + s], tint);
            }
        }
        return out;
    };

    /** The pieces of a box list, one per material, standing where `at` stands and turned as it is. */
    const trimPieces = (at, boxes, out) => {
        const byMaterial = new Map();
        for (const entry of boxes) {
            let list = byMaterial.get(entry.material);
            if (!list) byMaterial.set(entry.material, list = []);
            list.push(entry.tint ? { box: entry.box, tint: entry.tint } : { box: entry.box });
        }
        for (const [material, list] of byMaterial) out.push({ id: 0, kind: "trim", x: at.x, y: at.y, z: at.z, rot: at.rot, material, boxes: list });
    };

    /**
     * Every door's and framed window's trim on a map, as pieces of kind
     * "trim" (laid with the walls, never stood on). Cached against the
     * sidecar's own piece list.
     */
    R.pieceTrims = function(mapData) {
        const sidecar = mapData && mapData.reactor3d;
        const raw = sidecar && sidecar.pieces;
        if (!Array.isArray(raw) || !raw.length) return [];
        const memo = this._trimMemo || (this._trimMemo = new WeakMap());
        const known = memo.get(raw);
        if (known) return known;
        const out = [];
        const list = R.piecesOf(mapData);
        const at = new Map();
        for (const piece of list) {
            if (piece.kind !== "window" && piece.kind !== "doorway") continue;
            at.set(piece.kind + ":" + piece.x + "," + piece.y + "," + piece.z, piece);
        }
        for (const piece of list) {
            if (piece.kind !== "door") continue;
            const doorway = at.get("doorway:" + piece.x + "," + piece.y + "," + piece.z);
            trimPieces(piece, R.doorTrimBoxes(piece, doorway ? doorway.material : ""), out);
        }
        // Framed windows side by side at one level and turn are one window: framed from the first.
        const seen = new Set();
        for (const piece of list) {
            if (piece.kind !== "window" || !piece.frame || seen.has(piece)) continue;
            const { u } = R.doorAxes(piece.rot);
            // One window: the same turn and the same frame throughout (a window edited on its own frames alone).
            const look = JSON.stringify(piece.frame);
            const same = p => p && p.frame && p.rot === piece.rot && JSON.stringify(p.frame) === look;
            let start = piece;
            for (let prev = at.get("window:" + (start.x - u[0]) + "," + (start.y - u[1]) + "," + start.z); same(prev); prev = at.get("window:" + (start.x - u[0]) + "," + (start.y - u[1]) + "," + start.z)) start = prev;
            let n = 0;
            for (let next = start; same(next) && n < 12; next = at.get("window:" + (start.x + u[0] * (n)) + "," + (start.y + u[1] * (n)) + "," + start.z)) {
                seen.add(next);
                n++;
            }
            trimPieces(start, R.windowTrimBoxes(start.frame, n, start.material, start.id), out);
        }
        memo.set(raw, out);
        return out;
    };

    //-------------------------------------------------------------------------
    // What crosses a doorway

    /**
     * Anything standing in a doorway's opening: the clear box of each doorway cell (the middle of its width,
     * its whole depth, from its threshold to the door's head or the lintel) against the triangles of every
     * piece, shape and trim near it (its own casing included), its own slab and door aside. One entry per doorway cell
     * crossed: { x, y, z, by: [kinds] }. A generator or validate-map reads it.
     */
    R.doorwayCrossings = function(mapData) {
        if (typeof THREE === "undefined") return [];
        const list = R.piecesOf(mapData);
        const doorways = list.filter(p => p.kind === "doorway");
        if (!doorways.length) return [];
        const doors = list.filter(p => p.kind === "door");
        const doorOn = new Map();
        for (const door of doors) for (const [x, y] of R.doorCells(door)) doorOn.set(x + "," + y + "," + door.z, door);
        const trims = R.pieceTrims(mapData);
        const boxes = new Map();
        // Each piece's triangles' boxes, worked out once.
        const trianglesOf = piece => {
            let known = boxes.get(piece);
            if (known) return known;
            const geometry = R.pieceGeometry([piece], mapData), pos = geometry.attributes.position.array;
            known = [];
            for (let i = 0; i + 8 < pos.length; i += 9) known.push([Math.min(pos[i], pos[i + 3], pos[i + 6]), Math.min(pos[i + 1], pos[i + 4], pos[i + 7]), Math.min(pos[i + 2], pos[i + 5], pos[i + 8]),
                Math.max(pos[i], pos[i + 3], pos[i + 6]), Math.max(pos[i + 1], pos[i + 4], pos[i + 7]), Math.max(pos[i + 2], pos[i + 5], pos[i + 8])]);
            geometry.dispose();
            boxes.set(piece, known);
            return known;
        };
        const out = [];
        for (const way of doorways) {
            const door = doorOn.get(way.x + "," + way.y + "," + way.z) || null;
            const base = R.pieceBaseAt(mapData, way.x, way.y) + way.z;
            const top = base + (door ? R.doorLeafHeight(door) : R.PIECE_STOREY - 0.6) - 0.08, bottom = base + 0.4;
            // The opening's middle, across: which way the wall runs is where the doorway's neighbours are walled.
            const wallish = (x, y) => (R.piecesAt(mapData, x, y) || []).some(p => p.z === way.z && (p.kind === "wall" || p.kind === "window" || p.kind === "doorway"));
            const alongX = door ? R.doorAxes(door.rot).u[0] !== 0 : (wallish(way.x - 1, way.y) || wallish(way.x + 1, way.y));
            const box = alongX ? [way.x + 0.12, bottom, way.y, way.x + 0.88, top, way.y + 1] : [way.x, bottom, way.y + 0.12, way.x + 1, top, way.y + 0.88];
            const near = new Set();
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const p of R.piecesAt(mapData, way.x + dx, way.y + dy) || []) {
                if (p.kind === "door" || p.kind === "doorway" || p.kind === "ladder" || (p.kind === "floor" && p.x === way.x && p.y === way.y)) continue;
                near.add(p.standIn ? list.find(q => q.id === p.id) || p : p);
            }
            // The door's own casing too: its linings stand at the opening's sides and its head above the leaf, both
            // outside the clear box; anything else of it in there is a fault.
            for (const t of trims) if (Math.abs(t.x - way.x) <= 8 && Math.abs(t.y - way.y) <= 8) near.add(t);
            const by = new Set();
            for (const piece of near) {
                for (const b of trianglesOf(piece)) {
                    if (b[0] < box[3] - 0.02 && b[3] > box[0] + 0.02 && b[1] < box[4] - 0.02 && b[4] > box[1] + 0.02 && b[2] < box[5] - 0.02 && b[5] > box[2] + 0.02) { by.add(piece.kind); break; }
                }
            }
            if (by.size) out.push({ x: way.x, y: way.y, z: way.z, by: Array.from(by) });
        }
        return out;
    };

    //-------------------------------------------------------------------------
    // Leaves

    /**
     * The boxes of one leaf, in its own frame: x along the leaf from its
     * hinge (out to `length`), y up, z through it (+z toward the door's
     * front), the hinge at the origin. `mirror` hangs it from the far side.
     */
    R.doorLeafBoxes = function(piece, length, offset, mirror, meeting) {
        const H = R.doorLeafHeight(piece), t = piece.style === "gate" ? 0.08 : 0.12, half = t / 2;
        const W = piece.width || 1, style = piece.style;
        const out = [];
        const add = (box, tint) => out.push(tint ? { box, tint } : { box });
        // The leaf's top: flat, or an arch over the whole doorway (two leaves share one).
        const rise = style === "arched" ? Math.min(S_TOP() - R.DOOR_LEAF_HEIGHT - 0.06, 0.25 + 0.2 * W) : 0;
        const topAt = x => (rise ? archAt(mirror ? W - offset - x : offset + x, W, H, rise) : H);
        if (style === "gate") {
            add([0, 0.05, -half, 0.08, H, half]);
            add([length - 0.08, 0.05, -half, length, H, half]);
            for (const y of [0.25, 1.1]) add([0.08, y, -half, length - 0.08, y + 0.14, half]);
            const n = Math.max(2, Math.floor((length - 0.16) / 0.26));
            for (let i = 0; i < n; i++) {
                const a = 0.12 + i * ((length - 0.24) / n), b = a + 0.12;
                add([a, 0.08, half, b, H - 0.05, half + 0.04]);
            }
            add([length - 0.3, 0.95, -half - 0.05, length - 0.18, 1.05, half + 0.05], IRON_TINT);
        } else if (style === "panelled" || style === "double") {
            const k = 0.18;
            add([0, 0, -0.03, length, H, 0.03]);
            add([0, 0, -half, k, H, half]);
            add([length - k, 0, -half, length, H, half]);
            for (const [a, b] of [[0, 0.38], [1.5, 1.72], [H - 0.32, H]]) add([k, a, -half, length - k, b, half]);
            if (length > 1.2) add([length / 2 - 0.07, 0.38, -half, length / 2 + 0.07, H - 0.32, half]);
            add([length - 0.3, 1.62, -half - 0.07, length - 0.2, 1.72, half + 0.07], BRASS_TINT);
        } else {
            // Boards butted tight (no light through a shut door), every other one standing a hair proud so the
            // joints read; ledges inside, strap hinges and a ring outside.
            const n = Math.max(2, Math.round(length / 0.42));
            for (let i = 0; i < n; i++) {
                const a = (i / n) * length, b = ((i + 1) / n) * length;
                add([a, 0.02, -half + 0.01, b, topAt((a + b) / 2), i % 2 ? half - 0.012 : half]);
            }
            for (const y of [0.55, H - 0.95]) add([0.06, y, -half - 0.05, length - 0.06, y + 0.22, -half + 0.01]);
            for (const y of [0.62, H - 0.88]) add([0, y, half, Math.min(length * 0.6, 1.1), y + 0.09, half + 0.02], IRON_TINT);
            add([length - 0.34, 1.55, half, length - 0.22, 1.82, half + 0.07], IRON_TINT);
            add([length - 0.34, 1.62, -half - 0.06, length - 0.24, 1.74, -half], IRON_TINT);
        }
        // The meeting strip of a pair, on the front face, over the joint.
        if (meeting && style !== "gate") add([length - 0.04, 0.02, half - 0.005, length + 0.06, rise ? H : H - 0.02, half + 0.03]);
        // Mirrored for a leaf hung on the far side: x runs back from its hinge.
        if (!mirror) return out;
        return out.map(entry => { const [x0, y0, z0, x1, y1, z1] = entry.box; return Object.assign({}, entry, { box: [-x1, y0, z0, -x0, y1, z1] }); });
    };
    const S_TOP = () => R.PIECE_STOREY - 0.6;

    /** A door's leaves: each one's hinge in the door's frame, its length, and which side it hangs from. */
    R.doorLeaves = function(piece) {
        const W = piece.width || 1, two = piece.style === "double" || W >= 3;
        // Two leaves meet a hair apart, the first carrying a strip over the joint, so nothing shows through when shut.
        if (two) return [{ hinge: 0.02, length: W / 2 - 0.022, offset: 0.02, mirror: false, meeting: true }, { hinge: W - 0.02, length: W / 2 - 0.022, offset: 0.02, mirror: true }];
        const right = piece.hinge === "right";
        return [{ hinge: right ? W - 0.02 : 0.02, length: W - 0.04, offset: 0.02, mirror: right }];
    };

    /**
     * Triangles of boxes in a local frame (x along, y up, z through), with the pieces' planar UVs and shading.
     * `upright` turns the image a quarter on the sides, so a leaf's boards carry their grain up and down.
     */
    const boxesGeometry = (boxes, upright) => {
        const out = { positions: [], uvs: [], colors: [] };
        const shade = (nx, ny, nz) => {
            if (ny > 0.7) return 1;
            if (ny < -0.7) return 0.5;
            const side = 0.62 + 0.16 * (nx * 0.5 + 0.5) + 0.12 * (nz * 0.5 + 0.5);
            return ny > 0 ? side + (1 - side) * ny : side;
        };
        let tint = null;
        const tri = (a, b, c) => {
            const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
            const s = shade(nx, ny, nz), ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
            for (const p of [a, b, c]) {
                out.positions.push(p[0], p[1], p[2]);
                if (ay >= ax && ay >= az) out.uvs.push(p[0], p[2]);
                else if (ax >= az) { if (upright) out.uvs.push(p[1], p[2]); else out.uvs.push(p[2], p[1]); }
                else if (upright) out.uvs.push(p[1], p[0]); else out.uvs.push(p[0], p[1]);
                if (tint) out.colors.push(s * tint[0], s * tint[1], s * tint[2]); else out.colors.push(s, s, s);
            }
        };
        const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
        for (const entry of boxes) {
            tint = entry.tint || null;
            const [x0, y0, z0, x1, y1, z1] = entry.box;
            quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
            quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
            quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
            quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
            quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
            quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
        }
        return out;
    };
    R.doorBoxesGeometry = boxesGeometry;

    //-------------------------------------------------------------------------
    // The scene: a group of leaves, swung each frame of the game

    R.MapScene.prototype.addDoors = function(mapData, load) {
        this.removeDoors();
        const doors = R.piecesOf(mapData).filter(piece => piece.kind === "door");
        this._doorMap = mapData;
        if (!doors.length || typeof THREE === "undefined") { this._syncDoorStates(mapData, doors); return; }
        const group = this._doorGroup = new THREE.Group();
        group.name = "doors";
        this.piecesGroup().add(group);
        this._doors = [];
        for (const piece of doors) {
            const base = R.pieceBaseAt(mapData, piece.x, piece.y) + piece.z;
            const { u: U } = R.doorAxes(piece.rot);
            const yaw = Math.atan2(-U[1], U[0]);
            const leaves = [];
            for (const leaf of R.doorLeaves(piece)) {
                const data = boxesGeometry(R.doorLeafBoxes(piece, leaf.length, leaf.offset, leaf.mirror, leaf.meeting), true);
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
                geometry.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2));
                geometry.setAttribute("color", new THREE.Float32BufferAttribute(data.colors, 3));
                geometry.computeVertexNormals();
                geometry.computeBoundingSphere();
                const mesh = new THREE.Mesh(geometry, this.pieceMaterial(piece.material || "Wood", load));
                mesh.name = "door-leaf";
                mesh.userData.rrDoor = piece.id;
                const [wx, wz] = R.doorPoint(piece, leaf.hinge, 0.5);
                mesh.position.set(wx, base, wz);
                mesh.rotation.y = yaw;
                mesh.updateMatrix();
                mesh.matrixAutoUpdate = false;
                group.add(mesh);
                // Where it turns and which way its free end runs along the wall, for the clearance it needs.
                const { u: U2 } = R.doorAxes(piece.rot), along = leaf.mirror ? -1 : 1;
                leaves.push({ mesh, yaw, mirror: !!leaf.mirror, hinge: [wx, wz], along: [U2[0] * along, U2[1] * along], length: leaf.length });
            }
            const middle = R.doorPoint(piece, (piece.width || 1) / 2, 0.5);
            this._doors.push({ piece, leaves, x: middle[0], z: middle[1], base, angle: 0 });
        }
        this._syncDoorStates(mapData, doors);
    };

    // The states last given to a map's doors and the game they were given in, for as long as that map's data lives.
    const doorStatesOf = new WeakMap();

    /** The game's own map gets its doors' states (shut, unless they open by themselves); a battle room and the editor none. */
    R.MapScene.prototype._syncDoorStates = function(mapData, doors) {
        const game = gameOn() && typeof $dataMap !== "undefined" && mapData === $dataMap;
        if (!game) return;
        // The scene made again for the map the game is still on (back from the menu or a battle): each door is as
        // it was left. Entered anew (a transfer, a loaded save), a door the leader stands in starts open: shut, it
        // would hold the leader in its doorway.
        const last = doorStatesOf.get(mapData);
        const kept = last && last.game === $gameMap ? last.states : null;
        const states = new Map();
        for (const piece of doors) {
            const was = kept ? kept.get(piece.id) : null;
            const stoodIn = !was && R.doorCells(piece).some(([x, y]) => $gamePlayer.x === x && $gamePlayer.y === y) && !R.doorLocked(piece, null);
            states.set(piece.id, was || { open: stoodIn, t: stoodIn ? 1 : 0, idle: 0, by: null, bump: 0, dir: 0, wait: false });
        }
        doorStatesOf.set(mapData, { game: $gameMap, states });
        R._doorStates = states;
        R._doorScene = this;
    };

    R.MapScene.prototype.removeDoors = function() {
        const group = this._doorGroup;
        if (group) {
            if (group.parent) group.parent.remove(group);
            for (const mesh of group.children) mesh.geometry.dispose();
        }
        this._doorGroup = null;
        this._doors = [];
        if (R._doorScene === this) { R._doorScene = null; }
    };

    /** The angle (degrees) a door stands open at swing `t` (0 shut, 1 open), eased. */
    const angleAt = t => t * t * (3 - 2 * t) * R.DOOR_OPEN_ANGLE;

    /**
     * A door's leaves to its swing `t`, toward `dir`: +1 the door's front, -1 its back. A leaf hung from the
     * near side turns its free end toward `dir` one way about its hinge; one hung from the far side the other.
     */
    const swingTo = (door, t, dir) => {
        const angle = angleAt(t) * Math.PI / 180 * (dir || -1);
        if (Math.abs(angle - door.angle) < 1e-4) return;
        door.angle = angle;
        for (const leaf of door.leaves) {
            leaf.mesh.rotation.y = leaf.yaw + (leaf.mirror ? angle : -angle);
            leaf.mesh.updateMatrix();
        }
    };

    /** How wide a character stands for a swinging leaf to miss (tiles). */
    R.DOOR_CLEARANCE = 0.38;

    /**
     * How far a door's leaves may turn toward `dir` (degrees) before one would touch a character on that side:
     * each leaf sweeps a quarter disc about its hinge, and a character in it stops the leaf where its edge meets
     * the character's. Characters in the doorway itself (the wall's thickness) are where the shut leaf is; they
     * are left out, and an open door stays open while anyone is there.
     */
    R.doorClearAngle = function(door, dir, characters) {
        const { v: V } = R.doorAxes(door.piece.rot);
        let limit = R.DOOR_OPEN_ANGLE;
        for (const c of characters || []) {
            if (!c || !Number.isFinite(c._realX)) continue;
            const px = c._realX + 0.5, pz = c._realY + 0.5;
            for (const leaf of door.leaves) {
                const rx = px - leaf.hinge[0], rz = pz - leaf.hinge[1];
                const a = rx * leaf.along[0] + rz * leaf.along[1], b = (rx * V[0] + rz * V[1]) * dir;
                if (b < 0.5) continue;
                const reach = Math.hypot(a, b);
                if (reach > leaf.length + R.DOOR_CLEARANCE) continue;
                const meet = (Math.atan2(b, a) - Math.asin(Math.min(1, R.DOOR_CLEARANCE / reach))) * 180 / Math.PI;
                if (meet < limit) limit = Math.max(0, meet);
            }
        }
        return limit;
    };

    /**
     * Which way a door opens for `by`: its authored way ("in" is away from its front, "out" toward it), or for
     * "away" (the default) away from whoever opens it, so a door pushed from inside opens outward. When that side
     * has someone in the leaves' way and the other side is clearer, the other side.
     */
    R.doorOpenSide = function(door, by, characters) {
        const piece = door.piece;
        if (piece.swing === "in") return -1;
        if (piece.swing === "out") return 1;
        let away = -1;
        if (by && Number.isFinite(by._realX)) {
            const { v: V } = R.doorAxes(piece.rot);
            const s = (by._realX + 0.5 - door.x) * V[0] + (by._realY + 0.5 - door.z) * V[1];
            if (Math.abs(s) > 0.3) away = s > 0 ? -1 : 1;
            else {
                // In the doorway: the way they are walking.
                const d = by.direction ? by.direction() : 2;
                const m = (d === 6 ? 1 : d === 4 ? -1 : 0) * V[0] + (d === 2 ? 1 : d === 8 ? -1 : 0) * V[1];
                if (m) away = m > 0 ? 1 : -1;
            }
        }
        const there = R.doorClearAngle(door, away, characters), back = R.doorClearAngle(door, -away, characters);
        return there >= 70 || there >= back ? away : -away;
    };

    /** The door piece covering a cell of the game's map, if any. */
    R.doorAt = function(mapData, x, y) {
        const stack = R.piecesAt(mapData, x, y);
        if (!stack) return null;
        const found = stack.find(piece => piece.kind === "door");
        if (!found) return null;
        return R.piecesOf(mapData).find(piece => piece.kind === "door" && piece.id === found.id) || null;
    };

    /**
     * How far a character stands from a door, across its leaves and toward its faces (tiles).
     * Asked for every door and character each frame: the answer is one shared record, read
     * before the next call, and nothing is made on the way.
     */
    const reach = { off: 0, away: 0 };
    const reachOf = (door, character) => {
        const piece = door.piece, r = ((piece.rot | 0) % 4 + 4) % 4, U = ACROSS[r], V = FRONT[r];
        // The middle of the doorway's near edge: doorPoint(piece, 0, 0.5).
        const ox = piece.x + 0.5 - 0.5 * U[0], oz = piece.y + 0.5 - 0.5 * U[1];
        const px = character._realX + 0.5 - ox, pz = character._realY + 0.5 - oz;
        const along = px * U[0] + pz * U[1], away = px * V[0] + pz * V[1];
        const W = piece.width || 1;
        reach.off = along < 0 ? -along : along > W ? along - W : 0;
        reach.away = Math.abs(away);
        return reach;
    };

    /** Whether a character faces toward a door's middle. */
    const facesDoor = (door, character) => {
        const d = character.direction ? character.direction() : 2;
        const dx = d === 6 ? 1 : d === 4 ? -1 : 0, dz = d === 2 ? 1 : d === 8 ? -1 : 0;
        return dx * (door.x - (character._realX + 0.5)) + dz * (door.z - (character._realY + 0.5)) > 0.3;
    };

    const playDoorSound = (door, key) => {
        if (typeof AudioManager === "undefined" || typeof $gamePlayer === "undefined" || !$gamePlayer) return;
        const sound = R.doorSound(door.piece, key);
        if (!sound) return;
        const dx = door.x - ($gamePlayer._realX + 0.5), dz = door.z - ($gamePlayer._realY + 0.5);
        const distance = Math.hypot(dx, dz);
        const fall = distance <= 4 ? 1 : Math.max(0, 1 - (distance - 4) / 18);
        if (fall < 0.04) return;
        let pan = clamp(dx * 6, -60, 60);
        const viewport = R._viewport, camera = viewport && viewport.camera ? viewport.camera() : null;
        if (camera && camera.matrixWorld && distance > 0.5) {
            const e = camera.matrixWorld.elements;
            const rx = e[0], rz = e[2], rl = Math.hypot(rx, rz) || 1;
            pan = clamp(((dx * rx + dz * rz) / rl) / distance * 70, -70, 70);
        }
        AudioManager.playSe({ name: sound.name, volume: Math.round((sound.volume ?? 80) * fall), pitch: sound.pitch ?? 100, pan: Math.round(pan) });
    };

    /** What the feed says of a door: the map, its piece id and tag, and who opened it (null for a script). */
    const notice = (door, by) => ({ mapId: typeof $gameMap !== "undefined" && $gameMap ? $gameMap.mapId() : 0, id: door.piece.id, tag: door.piece.tag || "", by: by || null });
    const feed = () => typeof ReactorEvents !== "undefined" && !!ReactorEvents.emit;

    /** Start a door opening (or closing); the sound and the feed's notice go with it. */
    const setOpen = (door, state, open, by) => {
        if (state.open === open) return;
        // A door locked by an item, opened while the party holds it, stays unlocked.
        const lock = door.piece.lock;
        if (open && lock && lock.item) { const kept = saved(); if (kept) kept[savedKey(door.piece)] = Object.assign({}, kept[savedKey(door.piece)], { unlocked: true }); }
        state.open = open;
        state.idle = 0;
        state.by = by || null;
        if (open) { playDoorSound(door, "open"); if (feed()) ReactorEvents.emit("doorOpened", notice(door, by)); }
    };

    const sayLocked = (door, state) => {
        playDoorSound(door, "locked");
        const message = door.piece.message !== undefined ? door.piece.message : R.DOOR_LOCKED_TEXT;
        if (message && typeof $gameMessage !== "undefined" && $gameMessage && !$gameMessage.isBusy()) $gameMessage.add(message);
    };

    /** The OK button facing a door: an action door opens or shuts, a locked one says so (or unlocks with its item). */
    R.doorAction = function(player) {
        const scene = R._doorScene, states = R._doorStates;
        if (!scene || !states || !player || typeof $dataMap === "undefined" || !$dataMap) return false;
        const d = player.direction();
        const fx = $gameMap.roundXWithDirection(player.x, d), fy = $gameMap.roundYWithDirection(player.y, d);
        const piece = R.doorAt($dataMap, fx, fy) || R.doorAt($dataMap, player.x, player.y);
        if (!piece) return false;
        const door = (scene._doors || []).find(entry => entry.piece.id === piece.id);
        const state = states.get(piece.id);
        if (!door || !state) return false;
        if (R.doorLocked(piece, state)) { sayLocked(door, state); return true; }
        if (!state.open && state.t === 0) state.dir = R.doorOpenSide(door, player, scene._doorWalkers || [player]);
        // A locked door, once unlocked, is automatic: shut by the button it would open again at once for whoever pressed.
        const automatic = piece.opens === "auto" || piece.opens === "locked";
        if (automatic && !state.open) { setOpen(door, state, true, player); return true; }
        if (automatic) return false;
        if (state.open && scene._doorOccupied && scene._doorOccupied(door)) return true;
        setOpen(door, state, !state.open, player);
        return true;
    };

    /** Install the game's hooks once its classes exist (this file loads before them). */
    const installGameHooks = () => {
        if (R._doorHooks || typeof Game_Player === "undefined") return;
        R._doorHooks = true;
        const triggerButtonAction = Game_Player.prototype.triggerButtonAction;
        Game_Player.prototype.triggerButtonAction = function() {
            if (triggerButtonAction.apply(this, arguments)) return true;
            if (typeof Input !== "undefined" && Input.isTriggered("ok") && R.doorAction(this)) return true;
            return false;
        };
    };

    /** Whether anyone stands in a door's doorway now. */
    R.MapScene.prototype._doorOccupied = function(door) {
        for (const c of this._doorWalkers || []) {
            const r = reachOf(door, c);
            if (r.off < 0.45 && r.away < 0.75) return true;
        }
        return false;
    };

    const NO_WALKERS = [];
    /**
     * A shut door at rest is passed over while nobody is near enough to be
     * noticed by it, to rattle it or to be in its doorway: on North Haven
     * the thirty-nine doors were asked about every character each frame.
     * `enabled = false` asks every door every frame.
     */
    R.DoorRest = {
        enabled: true,
        /** The walkers' places this frame, read once: [x, z] per walker, NaN for none. */
        _at: new Float64Array(64),
        _count: 0,
        /**
         * Read once a frame rather than once per door: characters come in a
         * dozen and more hidden classes, and a number read from a property
         * through a lookup that sees that many is a new heap object each time
         * (39 doors by 50 walkers was 50 KB a frame).
         */
        gather(walkers) {
            if (this._at.length < walkers.length * 2) this._at = new Float64Array(walkers.length * 4);
            const at = this._at;
            for (let i = 0; i < walkers.length; i++) {
                const c = walkers[i];
                const x = c ? c._realX : NaN, y = c ? c._realY : NaN;
                at[i * 2] = Number.isFinite(x) ? x + 0.5 : NaN;
                at[i * 2 + 1] = Number.isFinite(y) ? y + 0.5 : NaN;
            }
            this._count = walkers.length;
        },
        /** Whether any walker gathered this frame stands within `notice` tiles of the door's doorway (its width counted in). */
        walkerNear(door, notice) {
            const reach = notice + (door.piece.width || 1) * 0.5 + 1, at = this._at, n = this._count * 2;
            const x = door.x, z = door.z;
            for (let i = 0; i < n; i += 2) {
                const dx = at[i] - x, dz = at[i + 1] - z;
                if (dx * dx + dz * dz <= reach * reach) return true;
            }
            return false;
        }
    };

    /** Each frame of the game: who walks up to an automatic door, who has gone, and every leaf to its swing. */
    R.MapScene.prototype.updateDoorsFrame = function(characters) {
        if (!this._doors || !this._doors.length) return;
        const states = R._doorStates;
        if (!states || R._doorScene !== this) return;
        installGameHooks();
        this._doorWalkers = characters || [];
        const step = 1 / R.DOOR_SWING_FRAMES;
        const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
        // The farthest any walker can be noticed from this frame (below: 1.2 tiles beyond the door plus the
        // swing at their pace): a shut door at rest with nobody within that of it has nothing to do this frame.
        const walkers = characters || NO_WALKERS;
        if (R.DoorRest.enabled) R.DoorRest.gather(walkers);
        let noticeFrom = 0;
        for (let i = 0; i < walkers.length; i++) {
            const c = walkers[i];
            if (!c) continue;
            const pace = c.isMoving && c.isMoving() && c.distancePerFrame ? c.distancePerFrame() : 0.0625;
            const reach = 1.2 + pace * R.DOOR_SWING_FRAMES * 1.3;
            if (reach > noticeFrom) noticeFrom = reach;
        }
        for (const door of this._doors) {
            const state = states.get(door.piece.id);
            if (!state) continue;
            const piece = door.piece;
            if (R.DoorRest.enabled && state.t === 0 && !state.open && !(state.bump > 0) && state.dir && door.angle === 0
                && !R.DoorRest.walkerNear(door, noticeFrom)) {
                if (piece.opens === "auto" || (piece.opens === "locked" && !R.doorLocked(piece, state))) state.idle = 0;
                state.wait = false;
                continue;
            }
            // Someone walking up to an automatic door (or the player turned to it), or standing in it: it opens for
            // them and stays open while anyone is in the doorway. Someone merely standing beside it does not hold it.
            // A walker is noticed early enough that the leaf is clear of their way before they reach it:
            // the swing's frames at their own pace, plus a margin.
            let near = null, inside = false;
            for (const c of characters || []) {
                if (!c || (c.isTransparent && c.isTransparent() && c !== player)) continue;
                const r = reachOf(door, c), off = r.off, away = r.away;
                if (off < 0.45 && away < 0.75) { inside = true; if (!near) near = c; continue; }
                if (near) continue;
                // Nobody this far off is noticed at any pace a character walks or rides at.
                if (!(off < 0.9)) continue;
                const moving = c.isMoving && c.isMoving();
                const pace = moving && c.distancePerFrame ? c.distancePerFrame() : 0.0625;
                if (!(away < 1.2 + pace * R.DOOR_SWING_FRAMES * 1.3)) continue;
                if ((moving && facesDoor(door, c)) || (c === player && away < 2.1 && facesDoor(door, c))) near = c;
            }
            if (piece.opens === "auto" || (piece.opens === "locked" && !R.doorLocked(piece, state))) {
                if (near && !state.open && state.t === 0 && !R.doorLocked(piece, state)) state.dir = R.doorOpenSide(door, near, characters);
                if (near && !R.doorLocked(piece, state)) setOpen(door, state, true, near);
                else if (state.open && !inside && !near) { if (++state.idle > 24) setOpen(door, state, false); }
                else state.idle = 0;
            } else if (piece.opens === "action" && state.open) {
                // An action door left open shuts itself once nobody is near, after a while.
                if (!inside && !near) { if (++state.idle > 240) setOpen(door, state, false); } else state.idle = 0;
            }
            // Walking into a locked door rattles it.
            if (player && !player.isMoving() && R.doorLocked(piece, state) && typeof Input !== "undefined" && Input.dir4 === player.direction()) {
                const d = player.direction(), fx = $gameMap.roundXWithDirection(player.x, d), fy = $gameMap.roundYWithDirection(player.y, d);
                if (state.bump <= 0 && R.doorCells(piece).some(([x, y]) => x === fx && y === fy)) { playDoorSound(door, "locked"); state.bump = 45; }
            }
            if (state.bump > 0) state.bump--;
            // The leaves move only as far as nobody is in their way: opening stops short of anyone on the
            // swing side, closing waits for anyone between the leaf and the doorway.
            if (!state.dir) state.dir = piece.swing === "out" ? 1 : -1;
            const before = state.t, clear = state.t > 0 || state.open ? R.doorClearAngle(door, state.dir, characters) : R.DOOR_OPEN_ANGLE;
            const next = clamp(state.t + (state.open ? step : -step), 0, 1);
            if (state.open) { if (angleAt(next) <= clear + 0.5 || next <= state.t) state.t = next; }
            else if (clear >= angleAt(state.t) - 1 || state.t === 0) state.t = next;
            // An automatic door that cannot open at all for someone in its way holds the walker back until it can.
            state.wait = state.open && state.t === 0 && clear < 20 && !inside;
            swingTo(door, state.t, state.dir);
            if (before > 0 && state.t === 0) { playDoorSound(door, "close"); if (feed()) ReactorEvents.emit("doorClosed", notice(door, state.by)); }
        }
    };

    //-------------------------------------------------------------------------
    // Script calls: by piece id or tag, on the map the player is on

    const findDoor = ref => {
        const scene = R._doorScene;
        if (!scene || !scene._doors) return null;
        return scene._doors.find(door => (typeof ref === "number" ? door.piece.id === ref : door.piece.tag === String(ref))) || null;
    };
    R.Doors = {
        file: "reactor_3d_doors.js",
        /** Open a door (an action door stays open; an automatic one shuts again when nobody is near). */
        open(ref) {
            const door = findDoor(ref), state = door && R._doorStates.get(door.piece.id);
            if (!state || R.doorLocked(door.piece, state)) return false;
            // A shut door opened by a script opens into the room unless someone stands there and the street is clearer.
            if (!state.open && state.t === 0) state.dir = R.doorOpenSide(door, null, (R._doorScene && R._doorScene._doorWalkers) || []);
            setOpen(door, state, true, null);
            return true;
        },
        close(ref) { const door = findDoor(ref), state = door && R._doorStates.get(door.piece.id); if (!state) return false; setOpen(door, state, false, null); return true; },
        lock(ref) { const door = findDoor(ref), kept = saved(); if (!door || !kept) return false; kept[savedKey(door.piece)] = Object.assign({}, kept[savedKey(door.piece)], { locked: true }); const state = R._doorStates.get(door.piece.id); if (state) setOpen(door, state, false, null); return true; },
        unlock(ref) { const door = findDoor(ref), kept = saved(); if (!door || !kept) return false; kept[savedKey(door.piece)] = Object.assign({}, kept[savedKey(door.piece)], { locked: false }); return true; },
        isOpen(ref) { const door = findDoor(ref), state = door && R._doorStates.get(door.piece.id); return !!(state && state.open); },
        isLocked(ref) { const door = findDoor(ref), state = door && R._doorStates.get(door.piece.id); return !!(door && R.doorLocked(door.piece, state)); }
    };

    //-------------------------------------------------------------------------
    // Hooks into the scene's own steps

    const wrap = (name, after) => {
        const original = R.MapScene.prototype[name];
        if (typeof original !== "function" || original.__rrDoors) return;
        const wrapped = function() {
            const result = original.apply(this, arguments);
            try { after.apply(this, arguments); } catch (error) { if (typeof console !== "undefined") console.warn("Doors:", error); }
            return result;
        };
        wrapped.__rrDoors = true;
        R.MapScene.prototype[name] = wrapped;
    };
    wrap("addPieces", function(mapData, load) { this.addDoors(mapData, load); });
    wrap("updatePieces", function(mapData, load) {
        // An edit: the leaves are laid again; a door the game holds keeps its state by id.
        const keep = R._doorScene === this ? R._doorStates : null;
        this.addDoors(mapData, load);
        if (keep && R._doorStates) for (const [id, state] of keep) if (R._doorStates.has(id)) R._doorStates.set(id, state);
    });
    wrap("updateRipples", function(frame, characters) { this.updateDoorsFrame(characters); });
    const clear = R.MapScene.prototype.clear;
    if (typeof clear === "function" && !clear.__rrDoors) {
        R.MapScene.prototype.clear = function() {
            R.MapScene.prototype.removeDoors.call(this);
            return clear.apply(this, arguments);
        };
        R.MapScene.prototype.clear.__rrDoors = true;
    }

    if (typeof module !== "undefined" && module.exports) module.exports = R;
})(typeof globalThis !== "undefined" ? globalThis : this);
