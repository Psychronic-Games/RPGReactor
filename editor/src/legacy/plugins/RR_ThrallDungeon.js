/*:
 * @target MZ
 * @plugindesc Procedural Dungeon Generator (VX), for imported games
 * @author Strak; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallDungeon.js
 *
 * Every time the player enters a dungeon map (the maps listed below), a new
 * floor is laid out: a 4 × 3 grid of rooms picked by the game's room rules,
 * each a painted room from img/Rooms/<dungeon>/Ground/<room>/ (with its
 * Overlay, Light and Shadow pictures). The rooms are painted into the map's
 * Ground, Par, Light and Shadow overlays (RR_ThrallOverlays), and the strip
 * of coloured pixels beside each room picture sets the map's floor tiles:
 *
 *   magenta  start point (the player, "Enemy" and "Mission" events)
 *   yellow   wall             red    chest ("Chest", "Switch" events)
 *   green    open floor (every other event)
 *   blue     open, nothing placed there
 *   dark red / dark blue   "Special 1" / "Special 2" events (erased when
 *                          the floor has no such place)
 *
 * Then the player and the map's events are placed at random on those
 * floors; an event named SKIP stays where it is. Floor tiles are TileA5
 * 96–102 (104–110, which show, while the debug switch is on). A variable
 * above 0 forces every room to the room letter it numbers (1 = A).
 *
 * The floor is kept with the map in a save, and its pictures are painted
 * again after loading. (The original repainted them only when it made the
 * floor, so a game loaded inside a dungeon showed the unpainted pictures.)
 * Where the original stopped with an error (a room letter with no picture
 * of the variant it asked for left, an overlay the map does not have), the
 * port reuses a room picture or leaves that overlay out.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param maps
 * @text Dungeon maps
 * @type multiline_string
 * @default {}
 * @desc JSON: map id → { folder, roomW, roomH, startX, startY, roomSize, lMap, sMap, overlap, varType, oMap, overwrite } (STRAK::PDG.map_settings).
 *
 * @param rules
 * @text Room rules
 * @type multiline_string
 * @default {}
 * @desc JSON: A2, B2, A6, B6, X1Y1 … X4Y3 and FAILSAFE, the room letters each place allows.
 *
 * @param rooms
 * @text Room pictures
 * @type multiline_string
 * @default {}
 * @desc JSON: folder → room letter → file names in img/Rooms/<folder>Ground/<letter>/. Empty: listed from disk.
 *
 * @param floors
 * @text Floor tiles
 * @default [96,97,98,99,100,101,102]
 * @desc JSON: TileA5 indexes for open floor, wall, chest, open-unused, start, special 1, special 2.
 *
 * @param debugFloors
 * @text Floor tiles while debugging
 * @default [104,105,106,107,108,109,110]
 *
 * @param debugSwitch
 * @type switch
 * @default 30
 *
 * @param overrideVariable
 * @text Forced room variable
 * @type variable
 * @default 160
 *
 * @param maxEvents
 * @text Events placed (1 to)
 * @type number
 * @default 65
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallDungeon');
    const json = (v, d) => { try { const x = JSON.parse(v); return x == null ? d : x; } catch (_) { return d; } };
    const MAPS = json(params.maps, {});
    const RULES = Object.assign({
        A2: ['A', 'C', 'D', 'E', 'F', 'H', 'K', 'L', 'P', 'R', 'S', 'T', 'U', 'W', 'Z'], A6: ['A', 'B', 'D', 'E', 'G', 'J', 'K', 'O', 'P', 'Q', 'S', 'T', 'V', 'Y', 'Z'],
        B2: ['B', 'G', 'I', 'J', 'M', 'N', 'O', 'Q', 'V', 'X', 'Y'], B6: ['C', 'F', 'H', 'I', 'L', 'M', 'N', 'R', 'U', 'W', 'X'],
        X1Y1: ['I', 'M', 'N', 'X'], X2Y1: ['B', 'G', 'I', 'J', 'M', 'N', 'O', 'Q', 'V', 'X', 'Y'], X3Y1: ['B', 'G', 'I', 'J', 'M', 'N', 'O', 'Q', 'V', 'X', 'Y'], X4Y1: ['J', 'N', 'O', 'Y'],
        X1Y2: ['C', 'F', 'H', 'I', 'L', 'M', 'N', 'R', 'U', 'W', 'X'], X2Y2: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), X3Y2: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
        X4Y2: ['E', 'F', 'J', 'K', 'L', 'N', 'O', 'T', 'U', 'Y', 'Z'], X1Y3: ['H', 'L', 'M', 'W'], X2Y3: ['D', 'G', 'H', 'K', 'L', 'M', 'O', 'S', 'V', 'W', 'Z'],
        X3Y3: ['D', 'G', 'H', 'K', 'L', 'M', 'O', 'S', 'V', 'W', 'Z'], X4Y3: ['K', 'L', 'O', 'Z'], FAILSAFE: ['I', 'B', 'B', 'J', 'C', 'A', 'A', 'E', 'H', 'D', 'D', 'K']
    }, json(params.rules, {}));
    let ROOMS = json(params.rooms, {});
    const FLOORS = json(params.floors, [96, 97, 98, 99, 100, 101, 102]);
    const DEBUG_FLOORS = json(params.debugFloors, [104, 105, 106, 107, 108, 109, 110]);
    const DEBUG_SWITCH = Number(params.debugSwitch || 0);
    const OVERRIDE_VARIABLE = Number(params.overrideVariable || 0);
    const MAX_EVENTS = Number(params.maxEvents || 65);
    const ROOM_FOLDER = 'img/Rooms/';
    const TILE_A5 = 1536;   // (floor + 128) + 1408 in the original
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    // The exits each room letter has: the original's case lists.
    const RIGHT = ['A', 'B', 'C', 'D', 'G', 'H', 'I', 'M', 'P', 'Q', 'R', 'S', 'V', 'W', 'X'];
    const LEFT = ['A', 'B', 'D', 'E', 'G', 'J', 'K', 'O', 'P', 'Q', 'S', 'T', 'V', 'Y', 'Z'];
    const DOWN = ['A', 'B', 'C', 'E', 'F', 'I', 'J', 'N', 'P', 'Q', 'R', 'T', 'U', 'X', 'Y'];
    const UP = ['A', 'C', 'D', 'E', 'F', 'H', 'K', 'L', 'P', 'R', 'S', 'T', 'U', 'W', 'Z'];
    // Per grid cell (1..12): its rule, then [neighbour index, letters that open toward this cell, rule pair].
    const CELLS = [
        null,
        ['X1Y1'],
        ['X2Y1', [0, ['I', 'M', 'X'], 6]],
        ['X3Y1', [1, ['B', 'G', 'I', 'M', 'Q', 'V', 'X'], 6]],
        ['X4Y1', [2, ['B', 'G', 'I', 'M', 'Q', 'V', 'X'], 6]],
        ['X1Y2', [0, ['I', 'N', 'X'], 2]],
        ['X2Y2', [1, ['B', 'I', 'J', 'N', 'Q', 'X', 'Y'], 2], [4, ['C', 'H', 'I', 'M', 'R', 'W', 'X'], 6]],
        ['X3Y2', [2, ['B', 'I', 'J', 'N', 'Q', 'X', 'Y'], 2], [5, RIGHT, 6]],
        ['X4Y2', [3, ['J', 'N', 'Y'], 2], [6, RIGHT, 6]],
        ['X1Y3', [4, ['C', 'F', 'I', 'N', 'R', 'U', 'X'], 2]],
        ['X2Y3', [5, DOWN, 2], [8, ['H', 'M', 'W'], 6]],
        ['X3Y3', [6, DOWN, 2], [9, ['D', 'G', 'H', 'M', 'S', 'V', 'W'], 6]],
        ['X4Y3', [7, ['E', 'F', 'J', 'N', 'T', 'U', 'Y'], 2], [10, ['D', 'G', 'H', 'M', 'S', 'V', 'W'], 6]]
    ];
    const minus = (a, b) => a.filter(x => !b.includes(x));
    // Ruby arrays: a negative index counts from the end, writing past the end grows the array.
    const rget = (a, i) => a[i < 0 ? i + a.length : i];
    const rset = (a, i, v) => { if (i < 0) i += a.length; while (a.length < i) a.push(null); a[i] = v; };
    const allOpen = (v) => v.length === 12 && v.every(x => x === 1);

    /**
     * The original's layout: twelve room letters, and the variant (1 = A … 5 = E) of each.
     * `rand(n)` is Ruby's rand: an integer below n.
     */
    function makeLayout(settings, rand = Math.randomInt) {
        let layout = [], validate = [];
        for (let attempt = 1; attempt <= 50; attempt++) {
            layout = [];
            for (let i = 1; i <= 12; i++) {
                const [rule, ...checks] = CELLS[i];
                let choice = RULES[rule] || [];
                for (const [at, open, pair] of checks) {
                    choice = minus(choice, open.includes(layout[at]) ? RULES['B' + pair] : RULES['A' + pair]);
                }
                layout.push(choice.length ? choice[rand(choice.length)] : null);
            }
            validate = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (let i = 0; i < layout.length && !allOpen(validate); i++) {
                for (let ii = 0; ii < layout.length; ii++) {
                    if (rget(validate, ii) === 1) {
                        if (RIGHT.includes(layout[ii])) rset(validate, ii + 1, 1);
                        if (LEFT.includes(layout[ii])) rset(validate, ii - 1, 1);
                        if (DOWN.includes(layout[ii])) rset(validate, ii + 4, 1);
                        if (UP.includes(layout[ii])) rset(validate, ii - 4, 1);
                    }
                    if (allOpen(validate)) break;
                }
            }
            if (allOpen(validate)) break;
            layout = RULES.FAILSAFE.slice();
        }
        // Room variants, in the same array.
        if (settings.varType === 1) {
            const i = rand(2) + 5;
            validate[i] = rand(5) + 1;
            switch (validate[i]) {
                case 2: validate[i - 4] = 3; validate[i - 3] = 4; validate[i + 1] = 5; break;
                case 3: validate[i + 1] = 4; validate[i + 4] = 2; validate[i + 5] = 5; break;
                case 4: validate[i - 1] = 3; validate[i + 3] = 2; validate[i + 4] = 5; break;
                case 5: validate[i - 5] = 3; validate[i - 4] = 4; validate[i - 1] = 2; break;
            }
        } else if (settings.varType === 2) {
            const i = rand(12);
            validate[i] = Math.abs(rand(3) - 1) + 1;
        }
        // No fewer than seven rooms (A–O): corridors P–Z become rooms A–K, first ones first.
        let rooms = layout.filter(l => l && l.charCodeAt(0) <= 79).length;
        if (rooms < 7) {
            for (let i = 0; i < layout.length; i++) {
                const c = layout[i] ? layout[i].charCodeAt(0) : 0;
                if (c < 80 || c > 90) continue;
                layout[i] = String.fromCharCode(c - 15);
                rooms++;
                if (rooms >= 7) break;
            }
        }
        return { layout, variants: validate };
    }

    // The room pictures of a dungeon folder: the importer's list, or the disk's.
    function roomFiles(folder, room) {
        if (!ROOMS[folder]) ROOMS[folder] = {};
        if (!ROOMS[folder][room]) {
            let files = [];
            try {
                if (typeof require === 'function' && typeof process === 'object') {
                    const fs = require('fs'), path = require('path');
                    const dir = path.join(path.dirname(process.mainModule.filename), ROOM_FOLDER, folder, 'Ground', room);
                    files = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile());
                }
            } catch (_) { files = []; }
            ROOMS[folder][room] = files;
        }
        return ROOMS[folder][room];
    }

    /** The rooms of a floor: letter, picture and grid position (in tiles) of each. */
    function makePlan(settings, layout, variants, rand = Math.randomInt) {
        const hRooms = Math.floor((settings.roomSize[0] - settings.startX * 2) / settings.roomW);
        const vRooms = Math.floor((settings.roomSize[1] - settings.startY * 2) / settings.roomH);
        // The original stepped rows by h_rooms.size: Integer#size, the 4 bytes of a Fixnum.
        const ROW = 4;
        const plan = [], used = [];
        let y = settings.startY;
        for (let i = 1; i <= vRooms; i++) {
            let x = settings.startX;
            for (let ii = 1; ii <= hRooms; ii++) {
                const at = (ii - 1) + (i - 1) * ROW;
                let room = layout[at];
                const forced = OVERRIDE_VARIABLE > 0 ? $gameVariables.value(OVERRIDE_VARIABLE) : 0;
                if (forced > 0 && LETTERS[forced - 1]) room = LETTERS[forced - 1];
                const variant = 'ABCDE'[(rget(variants, at) || 0) - 1] || 'A';
                const files = room ? roomFiles(settings.folder, room) : [];
                const ofVariant = files.filter(f => f.startsWith(variant));
                let pick = minus(ofVariant, used);
                if (!pick.length) pick = ofVariant.length ? ofVariant : files;
                const file = pick.length ? pick[rand(pick.length)] : null;
                used.push(file);
                if (file) plan.push({ room, file: file.replace(/\.png$/i, ''), x, y });
                x += settings.roomW;
            }
            y += settings.roomH;
        }
        return plan;
    }

    const KIND_FOLDER = { ground: 'Ground', par: 'Overlay', light: 'Light', shadow: 'Shadow' };
    const roomBitmap = (settings, kind, entry) => ImageManager.loadBitmap(ROOM_FOLDER, `${settings.folder}${KIND_FOLDER[kind]}/${entry.room}/${entry.file}`);
    const composedKinds = (settings) => ['ground'].concat(settings.oMap ? ['par'] : [], settings.lMap ? ['light'] : [], settings.sMap ? ['shadow'] : []);

    //=========================================================================
    // Game_Map
    //=========================================================================
    Game_Map.prototype.rrPdgSettings = function() {
        return MAPS[this.mapId()] || null;
    };

    const _setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _setup.call(this, mapId);
        this._rrPdg = null;
        if (this.rrPdgSettings()) this.rrPdgCreate();
    };

    Game_Map.prototype.rrPdgCreate = function() {
        const settings = this.rrPdgSettings();
        const debug = DEBUG_SWITCH > 0 && $gameSwitches.value(DEBUG_SWITCH);
        const { layout, variants } = makeLayout(settings);
        const plan = makePlan(settings, layout, variants);
        // Cache.clear: sheets the events drew into go back to their files.
        if (ImageManager.rrThrallCacheClear) ImageManager.rrThrallCacheClear();
        this._rrPdg = { id: `${Date.now()}-${Math.random()}`, mapId: this.mapId(), floors: (debug ? DEBUG_FLOORS : FLOORS).slice(), layout, plan, tiles: null, placed: false };
        this.rrPdgRequest();
    };

    Game_Map.prototype.rrPdgCurrent = function() {
        const pdg = this._rrPdg;
        return pdg && pdg.mapId === this.mapId() && this.rrPdgSettings() ? pdg : null;
    };

    /** Asks for every picture the floor needs, so the map waits for them. */
    Game_Map.prototype.rrPdgRequest = function() {
        const pdg = this.rrPdgCurrent();
        if (!pdg) return [];
        const settings = this.rrPdgSettings();
        const out = [];
        for (const kind of composedKinds(settings)) {
            for (const entry of pdg.plan) out.push(roomBitmap(settings, kind, entry));
            const base = baseOverlay.call(this, kind);
            if (base) out.push(base);
        }
        return out;
    };

    /** The floor tiles: written into the map, and kept to write again whenever the map is reloaded. */
    Game_Map.prototype.rrPdgApplyTiles = function() {
        const pdg = this.rrPdgCurrent();
        if (!pdg || !pdg.tiles) return;
        for (const [index, tile] of pdg.tiles) $dataMap.data[index] = tile;
    };

    Game_Map.prototype.rrPdgFinalize = function() {
        const pdg = this.rrPdgCurrent();
        if (!pdg || pdg.placed) return true;
        const settings = this.rrPdgSettings();
        const grounds = pdg.plan.map(entry => roomBitmap(settings, 'ground', entry));
        if (!grounds.every(b => b.isReady() || b.isError())) return false;
        pdg.tiles = this.rrPdgCollision(settings, pdg, grounds);
        this.rrPdgApplyTiles();
        this.rrPdgPlace(pdg);
        pdg.placed = true;
        const scene = SceneManager._scene;
        if (scene && scene._spriteset && scene._spriteset._tilemap) scene._spriteset._tilemap.refresh();
        return true;
    };

    /** The coloured strip right of each room picture, cell by cell, as floor tiles. */
    Game_Map.prototype.rrPdgCollision = function(settings, pdg, grounds) {
        const [gFloor, rFloor, yFloor, bFloor, pFloor, drFloor, dbFloor] = pdg.floors.map(f => f + TILE_A5);
        const ow = settings.overwrite, rw = settings.roomW, rh = settings.roomH;
        const w = (rw + settings.overlap * 2) * 32;
        const cols = rw + ow * 2, rows = rh + ow * 2;
        const width = this.width(), height = this.height();
        const tiles = new Map();
        pdg.plan.forEach((entry, n) => {
            const g = grounds[n];
            if (!g.isReady() || g.isError() || !g.width) return;
            const strip = g.context.getImageData(w, 0, Math.max(1, Math.min(cols, g.width - w)), Math.max(1, Math.min(rows, g.height))).data;
            const sw = Math.max(1, Math.min(cols, g.width - w));
            const pixel = (px, py) => {
                const sx = px - w;
                if (sx < 0 || sx >= sw || py < 0 || py >= rows || py >= g.height) return [0, 0, 0];
                const i = (py * sw + sx) * 4;
                return [strip[i], strip[i + 1], strip[i + 2]];
            };
            const x = entry.x, y = entry.y;
            let rx = x - ow, ry = y - ow, px = w, py = 0;
            for (let p = 0; p <= cols * rows; p++) {
                const [r, gr, b] = pixel(px, py);
                let tile = 0;
                if (r === 255 && b === 255) tile = pFloor;
                else if (r === 255 && gr === 255) tile = rFloor;
                else if (r === 255) tile = yFloor;
                else if (gr === 255) tile = gFloor;
                else if (b === 255) tile = bFloor;
                else if (r === 128) tile = drFloor;
                else if (b === 128) tile = dbFloor;
                if (tile && rx >= 0 && ry >= 0 && rx < width && ry < height) tiles.set(ry * width + rx, tile);
                rx++; px++;
                if (rx > x + ow + rw - 1) { ry++; rx = x - ow; }
                if (px - ow * 2 >= w + rw) { py++; px = w; }
                if (ry > y + ow + rh - 1) break;
            }
        });
        return Array.from(tiles);
    };

    /** set_player: the player and events onto the floor's places. */
    Game_Map.prototype.rrPdgPlace = function(pdg) {
        const [gFloor, , yFloor, , pFloor, drFloor, dbFloor] = pdg.floors.map(f => f + TILE_A5);
        const width = this.width(), height = this.height();
        const at = (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? this.tileId(x, y, 0) : null);
        const g = [], yel = [], p = [], dr = [], db = [];
        // The original's scan: w × h + 1 steps over rows one cell wider than the map, so the
        // last row is mostly left unread.
        let x = 0, y = 0;
        const s = width * height;
        for (let i = 0; i <= s; i++) {
            const tile = at(x, y);
            if (tile === gFloor) g.push([x, y]);
            if (tile === yFloor) yel.push([x, y]);
            if (tile === pFloor) p.push([x, y]);
            if (tile === drFloor) dr.push([x, y]);
            if (tile === dbFloor) db.push([x, y]);
            x++;
            if (x > width) { y++; x = 0; }
            if (y > height) break;
        }
        const take = (list) => {
            if (!list.length) return null;
            const spot = list[Math.randomInt(list.length)];
            list.splice(list.indexOf(spot), 1);
            return spot;
        };
        const spawn = take(p);
        if (spawn) $gamePlayer.locate(spawn[0], spawn[1]);
        for (let id = 1; id <= MAX_EVENTS; id++) {
            const event = this.event(id);
            if (!event) continue;
            const name = event.event() ? event.event().name : '';
            let spot;
            switch (name) {
                case 'Chest': case 'Switch': spot = take(yel); break;
                case 'Enemy': case 'Mission': spot = take(p); break;
                case 'Special 1': spot = take(dr); if (!spot) event.erase(); break;
                case 'Special 2': spot = take(db); if (!spot) event.erase(); break;
                case 'SKIP': spot = null; break;
                default: spot = take(g); break;
            }
            if (spot) event.locate(spot[0], spot[1]);
        }
    };

    const _update = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        _update.call(this, sceneActive);
        if (this._rrPdg && !this._rrPdg.placed) this.rrPdgFinalize();
    };

    //=========================================================================
    // The floor's pictures, painted into the map's overlays
    //=========================================================================
    const baseOverlay = Game_Map.prototype.rrUomBitmap || function() { return null; };
    const UOM_KIND = { ground: 'ground', par: 'par', light: 'light', shadow: 'shadow' };
    let composed = { id: null, bitmaps: {} };

    Game_Map.prototype.rrPdgComposite = function(kind) {
        const pdg = this.rrPdgCurrent();
        if (!pdg) return null;
        if (composed.id !== pdg.id) {
            for (const b of Object.values(composed.bitmaps)) if (b && b.destroy) b.destroy();
            composed = { id: pdg.id, bitmaps: {} };
        }
        if (composed.bitmaps[kind]) return composed.bitmaps[kind];
        const settings = this.rrPdgSettings();
        const base = baseOverlay.call(this, UOM_KIND[kind]);
        if (!base) return null;
        const rooms = pdg.plan.map(entry => roomBitmap(settings, kind, entry));
        const parFirst = kind === 'ground' && settings.overlap > 0 && settings.oMap;
        const par = parFirst ? this.rrPdgComposite('par') : null;
        if (!base.isReady() || rooms.some(b => !b.isReady() && !b.isError()) || (parFirst && !par)) return null;
        const out = new Bitmap(base.width, base.height);
        out.blt(base, 0, 0, base.width, base.height, 0, 0);
        const w = (settings.roomW + settings.overlap * 2) * 32, h = (settings.roomH + settings.overlap * 2) * 32;
        pdg.plan.forEach((entry, n) => {
            const room = rooms[n];
            if (!room.isReady() || room.isError()) return;
            const sw = Math.min(w, room.width), sh = Math.min(h, room.height);
            out.blt(room, 0, 0, sw, sh, (entry.x - settings.overlap) * 32, (entry.y - settings.overlap) * 32);
        });
        // Overlapping rooms: the painted overlay goes onto the ground too.
        if (par) {
            const rw = Math.min(settings.roomSize[0] * 32, par.width), rh = Math.min(settings.roomSize[1] * 32, par.height);
            out.blt(par, 0, 0, rw, rh, 0, 0);
        }
        composed.bitmaps[kind] = out;
        return out;
    };

    Game_Map.prototype.rrUomBitmap = function(kind) {
        const pdg = this.rrPdgCurrent();
        if (pdg && composedKinds(this.rrPdgSettings()).includes(kind)) return this.rrPdgComposite(kind);
        return baseOverlay.call(this, kind);
    };

    //=========================================================================
    // Scene_Map: wait for the pictures; place the floor before the first frame
    //=========================================================================
    const _onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function() {
        // A map reloaded without a transfer (back from a menu, a battle or a save) gets its floor again.
        if (!this._transfer && $gameMap.rrPdgCurrent()) {
            $gameMap.rrPdgApplyTiles();
            $gameMap.rrPdgRequest();
        }
        _onMapLoaded.call(this);
    };
    const _start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        $gameMap.rrPdgFinalize();
        _start.call(this);
    };

    // For tests.
    Game_Map.rrPdgMakeLayout = makeLayout;
    Game_Map.rrPdgMakePlan = makePlan;
})();
