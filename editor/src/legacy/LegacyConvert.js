/**
 * LegacyConvert - turns RPG Maker 2000/2003 data (as LcfReader reads it)
 * into Reactor's MZ-format data and images. Pure: images are plain
 * { width, height, data } RGBA buffers, so the same code runs from a CLI
 * (pngjs) and in the editor (canvas).
 *
 * The chipset is the heart of it. A 480×256 chipset at 16 px holds:
 *
 *   columns 0-2, rows 0-3   water A, three animation columns; row 0 outer
 *                           corners, 1 vertical edges, 2 horizontal edges,
 *                           3 inner corners
 *   columns 3-5, rows 0-3   water B (deep), same rows
 *   columns 0-2, rows 4-7   the plain water each quadrant falls back to:
 *                           row 4 water A, 5 its coast piece, 7 water C
 *                           (ids 2000+), 6 its coast piece
 *   columns 3-5, rows 4-7   three animated tiles, four frames stacked
 *   twelve 3×4 terrain autotile blocks: 0-3 at columns 0/3 rows 8/12,
 *                           4-11 at columns 6/9 rows 0/4/8/12; in a block
 *                           (0,0) is the solo tile, (2,0) the inner
 *                           corners, rows 1-3 the 3×3 box of edges
 *   columns 12-17 and 18-23 the 144 lower tiles (96 + 48, six per row)
 *   columns 18-23 rows 8-15 and 24-29 the 144 upper tiles (48 + 96)
 *
 * Tile ids: 0-2999 water (block × 1000 + coastBits × 50 + variant),
 * 3000-3149 animated (tile × 50), 4000-4599 terrain (block × 50 +
 * variant), 5000-5143 lower, 10000-10143 upper. The 47 autotile variants
 * are numbered exactly as MZ's 48 shapes (47 and 48 repeat the centre,
 * 49 is the solo tile, which MZ calls shape 47), so a 2003 variant is an
 * MZ shape. These positions and the variant tables are EasyRPG Player's,
 * the reference implementation of the format.
 */
(function (root) {
    'use strict';

    const T = 16; // source tile size; every output sheet is at this size

    // ---- images ---------------------------------------------------------

    function blank(width, height) {
        return { width, height, data: new Uint8Array(width * height * 4) };
    }

    /** Copy a w×h pixel rect from src at (sx, sy) to dst at (dx, dy). */
    function blit(dst, src, sx, sy, w, h, dx, dy) {
        for (let y = 0; y < h; y++) {
            const sy1 = sy + y, dy1 = dy + y;
            if (sy1 < 0 || sy1 >= src.height || dy1 < 0 || dy1 >= dst.height) continue;
            const from = (sy1 * src.width + sx) * 4, to = (dy1 * dst.width + dx) * 4;
            const n = Math.min(w, src.width - sx, dst.width - dx) * 4;
            if (n > 0) dst.data.set(src.data.subarray(from, from + n), to);
        }
    }

    /** Copy tile (col, row) of a 16 px sheet to tile (dcol, drow). */
    const tile = (dst, src, col, row, dcol, drow) => blit(dst, src, col * T, row * T, T, T, dcol * T, drow * T);

    /** Copy quadrant q (0 TL, 1 TR, 2 BL, 3 BR) of tile (col,row) to quadrant q of tile (dcol,drow). */
    function quad(dst, src, col, row, dcol, drow, q) {
        const h = T / 2, ox = (q % 2) * h, oy = Math.floor(q / 2) * h;
        blit(dst, src, col * T + ox, row * T + oy, h, h, dcol * T + ox, drow * T + oy);
    }

    /** Make every pixel of one colour transparent (the 2000/2003 rule: palette entry 0). */
    function keyColour(img, r, g, b) {
        const d = img.data;
        let hits = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] === r && d[i + 1] === g && d[i + 2] === b) { d[i + 3] = 0; hits++; }
        }
        return hits;
    }

    // ---- chipset → A1, A2, B, C -------------------------------------------

    /** The 2003 lower-tile (col,row) for lower id n (0-143). */
    function lowerPos(n) { return n < 96 ? [12 + n % 6, Math.floor(n / 6)] : [18 + (n - 96) % 6, Math.floor((n - 96) / 6)]; }
    /** The 2003 upper-tile (col,row) for upper id n (0-143). */
    function upperPos(n) { return n < 48 ? [18 + n % 6, 8 + Math.floor(n / 6)] : [24 + (n - 48) % 6, Math.floor((n - 48) / 6)]; }
    /** The 2003 terrain autotile block origin (col,row) for block k (0-11). */
    function blockPos(k) { return k < 4 ? [(k % 2) * 3, 8 + Math.floor(k / 2) * 4] : [6 + (k % 2) * 3, Math.floor((k - 4) / 2) * 4]; }
    /** Where MZ's B/C sheet puts tile n (0-255): [col,row] in a 16-wide sheet. */
    function bcPos(n) { return [(Math.floor(n / 128) % 2) * 8 + n % 8, Math.floor((n % 256) / 8) % 16]; }

    // MZ draws tile id 0 as nothing, so the 144 lower tiles take B slots 1-144 and the three animated tiles 145-147.
    const LOWER_B_OFFSET = 1;
    const ANIMATED_B_INDEX = LOWER_B_OFFSET + 144;

    /**
     * Build one MZ 2×3 water block at tile (bx, by) of `a1` from frame `f`
     * of a chipset water set. `aCol` is the set's first column (0 for water
     * A and C, 3 for B); `baseRow` the plain-water row that quadrants fall
     * back to (4 for A and B, 7 for C).
     */
    function waterBlock(a1, chip, f, aCol, baseRow, bx, by) {
        const a = aCol + f;
        tile(a1, chip, f, baseRow, bx, by);            // solo: plain water
        tile(a1, chip, a, 3, bx + 1, by);              // inner corners
        // box tiles, quadrant by quadrant: 0 TL 1 TR 2 BL 3 BR
        const C = [f, baseRow], corner = [a, 0], vert = [a, 1], horiz = [a, 2];
        const put = (dcol, drow, spec) => spec.forEach(([src, q]) => quad(a1, chip, src[0], src[1], dcol, drow, q));
        put(bx, by + 1, [[corner, 0], [horiz, 1], [vert, 2], [C, 3]]);       // TL: corner, top, left, centre
        put(bx + 1, by + 1, [[horiz, 0], [corner, 1], [C, 2], [vert, 3]]);   // TR
        put(bx, by + 2, [[vert, 0], [C, 1], [corner, 2], [horiz, 3]]);       // BL
        put(bx + 1, by + 2, [[C, 0], [vert, 1], [horiz, 2], [corner, 3]]);   // BR
    }

    /**
     * Build one MZ 2×3 terrain block at (bx, by) of `a2` from 2003 block k.
     * MZ has six tiles where 2003 had twelve, so its four box tiles are
     * composed quadrant by quadrant: the outer corner from the 2003 corner
     * tile, the edge halves from the 2003 edge tiles, the centre from the
     * 2003 centre tile. Centre, edge and inner-corner variants then draw
     * exactly as they did; an outer corner draws its edge halves from the
     * edge tiles rather than the corner tile, which only shows where an
     * artist drew those halves differently. So every block is written
     * twice: kind k composed this way, and kind 12 + k whose box tiles are
     * the 2003 corner tiles whole, which the outer-corner variants (34-45)
     * use. Both kinds carry the same passability.
     */
    function terrainBlock(a2, chip, k, bx, by, cornerFaithful) {
        const [cx, cy] = blockPos(k);
        tile(a2, chip, cx, cy, bx, by);                // solo
        tile(a2, chip, cx + 2, cy, bx + 1, by);        // inner corners
        if (cornerFaithful) {
            tile(a2, chip, cx, cy + 1, bx, by + 1); tile(a2, chip, cx + 2, cy + 1, bx + 1, by + 1);
            tile(a2, chip, cx, cy + 3, bx, by + 2); tile(a2, chip, cx + 2, cy + 3, bx + 1, by + 2);
            return;
        }
        const TL = [cx, cy + 1], Tt = [cx + 1, cy + 1], TR = [cx + 2, cy + 1];
        const Lt = [cx, cy + 2], Cc = [cx + 1, cy + 2], Rt = [cx + 2, cy + 2];
        const BL = [cx, cy + 3], Bt = [cx + 1, cy + 3], BR = [cx + 2, cy + 3];
        const put = (dcol, drow, spec) => spec.forEach(([src, q]) => quad(a2, chip, src[0], src[1], dcol, drow, q));
        put(bx, by + 1, [[TL, 0], [Tt, 1], [Lt, 2], [Cc, 3]]);
        put(bx + 1, by + 1, [[Tt, 0], [TR, 1], [Cc, 2], [Rt, 3]]);
        put(bx, by + 2, [[Lt, 0], [Cc, 1], [BL, 2], [Bt, 3]]);
        put(bx + 1, by + 2, [[Cc, 0], [Rt, 1], [Bt, 2], [BR, 3]]);
    }

    const CORNER_KIND_OFFSET = 12;
    const kindPos = (kind) => [(kind % 8) * 2, Math.floor(kind / 8) * 3];

    /**
     * A chipset image (480×256 RGBA) → { A1, A2, B, C } RGBA sheets at 16 px.
     * A1 is 256×192 (kinds 0, 1 and 4 animated; MZ's three frames side by
     * side), A2 256×192 (12 blocks as kinds 0-11), B and C 256×256.
     */
    function chipsetToSheets(chip) {
        if (chip.width < 480 || chip.height < 256) throw new Error(`chipset is ${chip.width}×${chip.height}, expected 480×256`);
        const A1 = blank(16 * T, 12 * T), A2 = blank(16 * T, 12 * T), B = blank(16 * T, 16 * T), C = blank(16 * T, 16 * T);
        for (let f = 0; f < 3; f++) {
            waterBlock(A1, chip, f, 0, 4, f * 2, 0);      // kind 0: water A
            waterBlock(A1, chip, f, 3, 4, f * 2, 3);      // kind 1: water B (deep)
            waterBlock(A1, chip, f, 0, 7, 8 + f * 2, 0);  // kind 4: water C (A's coast over the deeper base)
        }
        for (let k = 0; k < 12; k++) { terrainBlock(A2, chip, k, ...kindPos(k), false); terrainBlock(A2, chip, k, ...kindPos(CORNER_KIND_OFFSET + k), true); }
        for (let n = 0; n < 144; n++) { const [sc, sr] = lowerPos(n), [dc, dr] = bcPos(LOWER_B_OFFSET + n); tile(B, chip, sc, sr, dc, dr); }
        for (let t = 0; t < 3; t++) { const [dc, dr] = bcPos(ANIMATED_B_INDEX + t); tile(B, chip, 3 + t, 4, dc, dr); }
        for (let n = 0; n < 144; n++) { const [sc, sr] = upperPos(n), [dc, dr] = bcPos(n); tile(C, chip, sc, sr, dc, dr); }
        return { A1, A2, B, C };
    }

    // ---- tile ids ---------------------------------------------------------

    const TILE_ID_A1 = 2048, TILE_ID_A2 = 2816, TILE_ID_C = 256;
    const WATER_KIND = [0, 1, 4];

    /** A 2003 autotile variant (0-49) as an MZ shape (0-47). */
    function shapeOf(variant) { return variant < 47 ? variant : variant === 49 ? 47 : 0; }

    /**
     * One 2003 lower-layer id → { z0, z1 } MZ tile ids for data layers 0 and
     * 1, with a note when something is lost.
     */
    function lowerTile(id) {
        if (id < 3000) {
            const block = Math.floor(id / 1000), rest = id - block * 1000, coast = Math.floor(rest / 50), variant = rest - coast * 50;
            const note = coast !== 0 ? 'waterMix' : null; // a quadrant of another water type: MZ has one autotile per tile
            return { z0: TILE_ID_A1 + WATER_KIND[block] * 48 + shapeOf(variant), z1: 0, note };
        }
        if (id < 4000) return { z0: 0, z1: ANIMATED_B_INDEX + Math.min(2, Math.floor((id - 3000) / 50)), note: 'animated' };
        if (id < 5000) {
            const block = Math.floor((id - 4000) / 50), variant = id - 4000 - block * 50;
            const shape = shapeOf(variant), kind = shape >= 34 && shape <= 45 ? CORNER_KIND_OFFSET + block : block;
            return { z0: TILE_ID_A2 + kind * 48 + shape, z1: 0, note: null };
        }
        if (id < 5144) return { z0: 0, z1: LOWER_B_OFFSET + (id - 5000), note: null };
        return { z0: 0, z1: 0, note: 'badLower' };
    }

    /** One 2003 upper-layer id → MZ tile id for data layer 2 (upper 0 is the empty tile). */
    function upperTile(id) {
        if (id < 10000 || id >= 10144) return { z2: 0, note: id === 0 ? null : 'badUpper' };
        return { z2: id === 10000 ? 0 : TILE_ID_C + (id - 10000), note: null };
    }

    /** A map's two 2003 layers → MZ's six-layer data array, plus counts of what was approximated. */
    function mapData(map) {
        const w = map.width, h = map.height, n = w * h;
        const data = new Array(n * 6).fill(0);
        const notes = {};
        const lower = map.lower_layer || [], upper = map.upper_layer || [];
        for (let i = 0; i < n; i++) {
            const lo = lowerTile(lower[i] ?? 0);
            data[i] = lo.z0; data[n + i] = lo.z1;
            if (lo.note) notes[lo.note] = (notes[lo.note] || 0) + 1;
            const up = upperTile(upper[i] ?? 10000);
            data[2 * n + i] = up.z2;
            if (up.note) notes[up.note] = (notes[up.note] || 0) + 1;
        }
        return { data, notes };
    }

    // ---- passability --------------------------------------------------------

    // 2003 bits: 1 down, 2 left, 4 right, 8 up passable; 0x10 above hero; 0x20 wall; 0x40 counter.
    // MZ bits: 1 down, 2 left, 4 right, 8 up IMpassable; 0x10 star; 0x20 ladder; 0x40 bush; 0x80 counter; 0x100 damage.
    function mzFlag(p, terrain) {
        let f = (~p & 0x0f) | (p & 0x10 ? 0x10 : 0) | (p & 0x40 ? 0x80 : 0);
        if (terrain) {
            if (terrain.bush_depth > 0) f |= 0x40;
            if (terrain.damage > 0) f |= 0x100;
        }
        return f;
    }

    /**
     * MZ tileset flags (8192 entries) from a chipset's passability and
     * terrain tables. Lower index: 0-2 water, 3-5 animated, 6-17 terrain,
     * 18-161 normal; upper index 0-143.
     */
    function tilesetFlags(chipset, terrains) {
        const flags = new Array(8192).fill(0);
        const lower = chipset.passable_data_lower || [], upper = chipset.passable_data_upper || [], terr = chipset.terrain_data || [];
        const terrainOf = (i) => (terrains && terr[i] ? terrains[terr[i]] : null);
        const lowerFlag = (i) => mzFlag(lower[i] ?? 0x0f, terrainOf(i));
        for (let block = 0; block < 3; block++) for (let s = 0; s < 48; s++) flags[TILE_ID_A1 + WATER_KIND[block] * 48 + s] = lowerFlag(block);
        // A terrain block marked "wall" can still be walked along its top edge: these shapes pass (EasyRPG's IsPassableLowerTile).
        const WALL_TOPS = new Set([20, 21, 22, 23, 33, 34, 35, 36, 37, 42, 43, 45, 46]);
        for (let k = 0; k < 12; k++) for (let s = 0; s < 48; s++) {
            const wallTop = ((lower[6 + k] ?? 0x0f) & 0x20) && WALL_TOPS.has(s);
            flags[TILE_ID_A2 + k * 48 + s] = flags[TILE_ID_A2 + (CORNER_KIND_OFFSET + k) * 48 + s] = wallTop ? lowerFlag(6 + k) & ~0x0f : lowerFlag(6 + k);
        }
        for (let n = 0; n < 144; n++) flags[LOWER_B_OFFSET + n] = lowerFlag(18 + n);
        for (let t = 0; t < 3; t++) flags[ANIMATED_B_INDEX + t] = lowerFlag(3 + t);
        for (let n = 0; n < 144; n++) flags[TILE_ID_C + n] = mzFlag(upper[n] ?? 0x0f, null);
        flags[TILE_ID_C] = 0x10; // upper tile 0 is empty: never blocks, never covers
        flags[0] = 0x10;         // MZ's tile 0 is nothing: an empty layer must defer to the tiles under it
        return flags;
    }

    // ---- character sheets --------------------------------------------------

    /**
     * A 2003 charset (4×2 characters, each 3 frames × 4 rows up/right/down/left)
     * → the same sheet with rows in MZ order (down/left/right/up). Any size:
     * the grid is 12 frames across and 8 rows down.
     */
    function reorderCharset(img) {
        const out = blank(img.width, img.height);
        const fw = img.width / 12, fh = img.height / 8;
        const order = [2, 3, 1, 0]; // MZ row r takes 2003 row order[r]
        for (let ch = 0; ch < 8; ch++) {
            const cx = (ch % 4) * 3 * fw, cy = Math.floor(ch / 4) * 4 * fh;
            for (let r = 0; r < 4; r++) blit(out, img, cx, cy + order[r] * fh, 3 * fw, fh, cx, cy + r * fh);
        }
        return out;
    }

    /** MZ character-sheet name for a 2003 charset: '!' so it stands on the tile without the 6 px lift, and no '$'. */
    function charsetName(name) {
        if (!name) return '';
        let n = name.replace(/^\$/, '');
        if (!n.startsWith('!')) n = '!' + n;
        return n;
    }

    const DIRECTION = [8, 6, 2, 4]; // 2003 up, right, down, left → MZ

    // ---- data files -----------------------------------------------------

    // Only a media extension comes off: 2000/2003 names carry none, and names like "Buddler 1.1" or
    // "lazar NEU default o.ô" keep their dots.
    function stripExt(name) { return String(name || '').replace(/\.(png|bmp|xyz|jpe?g|gif|wav|ogg|opus|mp3|midi?|wma|flac|m4a|avi|mpe?g|mp4|wmv|webm|ogv)$/i, ''); }

    function audio(m) {
        if (!m || !m.name || m.name === '(OFF)') return { name: '', pan: 0, pitch: 100, volume: 90 };
        return { name: stripExt(m.name), pan: Math.max(-100, Math.min(100, ((m.balance ?? 50) - 50) * 2)), pitch: m.tempo ?? 100, volume: m.volume ?? 100 };
    }

    /** MapInfos.json from the map tree (maps only; areas have no MZ counterpart). */
    function mapInfos(tree) {
        const out = [null];
        const order = new Map(tree.treeOrder.map((id, i) => [id, i]));
        for (const info of tree.maps) {
            if (!info || info.type !== 1) continue;
            out[info.id] = { id: info.id, expanded: !!info.expanded_node, name: info.name || `MAP${String(info.id).padStart(3, '0')}`, order: order.get(info.id) ?? info.id, parentId: info.parent_map || 0, scrollX: 0, scrollY: 0 };
        }
        return out;
    }

    /** The BGM a map plays: its own, or the nearest ancestor's when it inherits. */
    function mapMusic(tree, id) {
        let info = tree.maps[id];
        for (let guard = 0; info && guard < 64; guard++) {
            if (info.music_type === 2) return info.music || null;   // specified
            if (info.music_type === 0 || !info.parent_map) return null; // none, or root
            info = tree.maps[info.parent_map];
        }
        return null;
    }

    function encounterSteps(tree, id) {
        let info = tree.maps[id];
        for (let guard = 0; info && guard < 64; guard++) {
            if (info.encounter_steps) return info.encounter_steps;
            if (!info.parent_map) break;
            info = tree.maps[info.parent_map];
        }
        return 30;
    }

    /** One MZ event page from a 2003 page: graphic, movement and conditions; commands are a later stage's. */
    function eventPage(pg, notes, convertCommands, convertRoute) {
        const c = pg.condition || {}, flags = c.flags || 0;
        const anim = pg.animation_type ?? 0;
        const moveType = { 0: 0, 1: 1, 4: 2, 6: 3 }[pg.move_type ?? 0] ?? 0;
        if ([2, 3, 5].includes(pg.move_type)) notes.moveType = (notes.moveType || 0) + 1;
        if (flags & 0x60) notes.timerCondition = (notes.timerCondition || 0) + 1;
        return {
            conditions: {
                actorId: c.actor_id || 1, actorValid: !!(flags & 0x10), itemId: c.item_id || 1, itemValid: !!(flags & 0x08),
                selfSwitchCh: 'A', selfSwitchValid: false, switch1Id: c.switch_a_id || 1, switch1Valid: !!(flags & 0x01),
                switch2Id: c.switch_b_id || 1, switch2Valid: !!(flags & 0x02), variableId: c.variable_id || 1, variableValid: !!(flags & 0x04),
                variableValue: c.variable_value || 0,
                // 2003 compares a variable six ways (0 ==, 1 >=, 2 <=, 3 >, 4 <, 5 !=); MZ only >=, so others are kept for the runtime
                ...((flags & 0x04) && (c.compare_operator ?? 1) !== 1 ? { rrVariableOp: Math.max(0, Math.min(5, c.compare_operator)) } : {})
            },
            directionFix: anim === 2 || anim === 3 || anim === 4,
            // no charset name: the page shows upper-layer tile `character_index` (EasyRPG's HasTileSprite)
            image: pg.character_name ? { characterIndex: pg.character_index ?? 0, characterName: charsetName(pg.character_name), direction: DIRECTION[pg.character_direction ?? 2] ?? 2, pattern: pg.character_pattern ?? 1, tileId: 0 }
                : { characterIndex: 0, characterName: '', direction: DIRECTION[pg.character_direction ?? 2] ?? 2, pattern: pg.character_pattern ?? 1, tileId: TILE_ID_C + (pg.character_index ?? 0) },
            list: convertCommands ? convertCommands(pg.event_commands || []) : [{ code: 0, indent: 0, parameters: [] }],
            moveFrequency: Math.max(1, Math.min(5, Math.round(((pg.move_frequency ?? 3) * 5) / 8))),
            moveRoute: Object.assign(convertRoute ? convertRoute(pg.move_route && pg.move_route.move_commands || []) : { list: [{ code: 0, parameters: [] }] }, { repeat: !!(pg.move_route && pg.move_route.repeat), skippable: !!(pg.move_route && pg.move_route.skippable), wait: false }),
            moveSpeed: Math.max(1, Math.min(6, pg.move_speed ?? 3)),
            moveType,
            priorityType: Math.max(0, Math.min(2, pg.layer ?? 0)),
            // read by the runtime for imports: a translucent page starts at transparency 3, a spinning one turns in place
            rrTranslucent: !!pg.translucent, rrSpin: anim === 5, rrFixedGraphic: anim === 4,
            stepAnime: anim === 1 || anim === 3,
            through: false,
            trigger: Math.max(0, Math.min(4, pg.trigger ?? 0)),
            walkAnime: anim !== 4
        };
    }

    /**
     * A 2003 panorama auto-scroll speed (-8..8) → MZ's parallaxSx/Sy. The old engine moves the image
     * 2^|speed| / 32 px a frame, a positive speed to the right (down); MZ moves it sx / 4 px a frame the
     * other way (EasyRPG's Parallax::Update and GetX).
     */
    function parallaxSpeed(speed) {
        speed = Number(speed) || 0;
        return speed === 0 ? 0 : -Math.sign(speed) * Math.pow(2, Math.abs(speed)) / 8;
    }

    /** MapNNN.json for one map. */
    function mapJson(map, tree, id, tilesetId, convertCommands, convertRoute) {
        const info = tree.maps[id] || {};
        const music = mapMusic(tree, id);
        const { data, notes } = mapData(map);
        const events = [null];
        for (const ev of (map.events || [])) {
            if (!ev) continue;
            events[ev.id] = { id: ev.id, name: ev.name || `EV${String(ev.id).padStart(3, '0')}`, note: '', pages: (ev.pages || []).filter(Boolean).map(pg => eventPage(pg, notes, convertCommands, convertRoute)), x: ev.x || 0, y: ev.y || 0 };
        }
        const encounters = (info.encounters || []).filter(Boolean).map(e => ({ regionSet: [], troopId: e.troop_id, weight: 10 }));
        return {
            json: {
                autoplayBgm: !!music, autoplayBgs: false, battleback1Name: '', battleback2Name: '', bgm: audio(music),
                bgs: { name: '', pan: 0, pitch: 100, volume: 90 }, disableDashing: true, displayName: '', encounterList: encounters,
                encounterStep: encounterSteps(tree, id), height: map.height, note: '', parallaxLoopX: !!map.parallax_loop_x, parallaxLoopY: !!map.parallax_loop_y,
                parallaxName: map.parallax_flag ? stripExt(map.parallax_name) : '', parallaxShow: true,
                parallaxSx: map.parallax_flag && map.parallax_auto_loop_x ? parallaxSpeed(map.parallax_sx) : 0, parallaxSy: map.parallax_flag && map.parallax_auto_loop_y ? parallaxSpeed(map.parallax_sy) : 0,
                scrollType: map.scroll_type || 0, specifyBattleback: false, tilesetId, width: map.width, data, events
            },
            notes
        };
    }

    /** MZ tile id → 2003 terrain number, for the tileset note the runtime's terrain lookup reads. */
    function terrainMap(chipset) {
        const terr = chipset.terrain_data || [];
        const out = {};
        const put = (tileId, index) => { const t = terr[index]; if (t) out[tileId] = t; };
        for (let block = 0; block < 3; block++) for (let s = 0; s < 48; s++) put(TILE_ID_A1 + WATER_KIND[block] * 48 + s, block);
        for (let k = 0; k < 12; k++) for (let s = 0; s < 48; s++) { put(TILE_ID_A2 + k * 48 + s, 6 + k); put(TILE_ID_A2 + (CORNER_KIND_OFFSET + k) * 48 + s, 6 + k); }
        for (let n = 0; n < 144; n++) put(LOWER_B_OFFSET + n, 18 + n);
        for (let t = 0; t < 3; t++) put(ANIMATED_B_INDEX + t, 3 + t);
        return out;
    }

    /** The battle background the map's most common terrain names (2003 chose it per tile), or null. */
    function mapBattleback(map, chipset, terrains) {
        if (!chipset || !chipset.terrain_data || !terrains) return null;
        const counts = new Map();
        for (const id of map.lower_layer || []) {
            let index = -1;
            if (id < 3000) index = Math.floor(id / 1000); else if (id < 4000) index = 3 + Math.floor((id - 3000) / 50); else if (id < 5000) index = 6 + Math.floor((id - 4000) / 50); else if (id < 5144) index = 18 + id - 5000;
            const t = chipset.terrain_data[index];
            if (t) counts.set(t, (counts.get(t) || 0) + 1);
        }
        let best = null;
        for (const [t, n] of counts) if (!best || n > best[1]) best = [t, n];
        const terrain = best && terrains[best[0]];
        return terrain && terrain.background_name ? stripExt(terrain.background_name) : null;
    }

    /** Nearest-neighbour scale of an RGBA image by an integer or half-integer factor. */
    function scaleNearest(img, factor) {
        const w = Math.round(img.width * factor), h = Math.round(img.height * factor);
        const out = blank(w, h);
        for (let y = 0; y < h; y++) {
            const sy = Math.min(img.height - 1, Math.floor(y / factor));
            for (let x = 0; x < w; x++) {
                const sx = Math.min(img.width - 1, Math.floor(x / factor));
                const si = (sy * img.width + sx) * 4, di = (y * w + x) * 4;
                out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = img.data[si + 3];
            }
        }
        return out;
    }

    /**
     * A 2003 System graphic (160×80) laid into an MZ Window.png (192×192),
     * over a stock skin for the parts 2003 had no equivalent of. 2003:
     * background (0,0) 32×32, frame (32,0) 32×32 with 8 px borders, cursor
     * (64,0) 32×32 with 8 px borders, twenty text colours at (0,48) in 16 px
     * cells. MZ: background (0,0) 96×96, frame (96,0) 96×96 with 24 px
     * borders, cursor (96,96) 48×48, text colours at (96,144) in 12 px cells.
     */
    function windowSkin(system, base) {
        const out = base ? { width: base.width, height: base.height, data: new Uint8Array(base.data) } : blank(192, 192);
        if (!system || system.width < 160 || system.height < 80) return out;
        const region = (sx, sy, w, h) => { const r = blank(w, h); blit(r, system, sx, sy, w, h, 0, 0); return r; };
        blit(out, scaleNearest(region(0, 0, 32, 32), 3), 0, 0, 96, 96, 0, 0);
        // The frame keeps its 8 px thickness: MZ cuts 24 px corners from the 96 px cell, so the 2003 corners sit in
        // the outer 8 px of each, the edges stretch along the sides and the rest of the cell is clear.
        {
            const frame = region(32, 0, 32, 32);
            const cell = blank(96, 96);
            const stretch = (sx, sy, sw, sh, dx, dy, dw, dh) => { const part = blank(sw, sh); blit(part, frame, sx, sy, sw, sh, 0, 0); const scaled = blank(dw, dh); for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const si = (Math.floor(y * sh / dh) * sw + Math.floor(x * sw / dw)) * 4, di = (y * dw + x) * 4; for (let k = 0; k < 4; k++) scaled.data[di + k] = part.data[si + k]; } blit(cell, scaled, 0, 0, dw, dh, dx, dy); };
            stretch(0, 0, 8, 8, 0, 0, 8, 8); stretch(24, 0, 8, 8, 88, 0, 8, 8); stretch(0, 24, 8, 8, 0, 88, 8, 8); stretch(24, 24, 8, 8, 88, 88, 8, 8);
            stretch(8, 0, 16, 8, 8, 0, 80, 8); stretch(8, 24, 16, 8, 8, 88, 80, 8); stretch(0, 8, 8, 16, 0, 8, 8, 80); stretch(24, 8, 8, 16, 88, 8, 8, 80);
            blit(out, cell, 0, 0, 96, 96, 96, 0);
            // The scroll arrows: 2003's up (40,8) and down (40,16), centred in MZ's 24×12 arrow cells inside the frame cell.
            blit(out, region(40, 8, 16, 8), 0, 0, 16, 8, 136, 26);
            blit(out, region(40, 16, 16, 8), 0, 0, 16, 8, 136, 62);
            // The pause sign: the 2003 down arrow (the frame cell's centre, lower half) in each of MZ's four 24 px frames, unscaled and centred.
            const arrow = region(40, 16, 16, 8);
            for (const [fx, fy] of [[144, 96], [168, 96], [144, 120], [168, 120]]) { const f = blank(24, 24); blit(f, arrow, 0, 0, 16, 8, 4, 8); blit(out, f, 0, 0, 24, 24, fx, fy); }
        }
        blit(out, scaleNearest(region(64, 0, 32, 32), 1.5), 0, 0, 48, 48, 96, 96);
        for (let i = 0; i < 20; i++) {
            const cell = scaleNearest(region((i % 10) * 16, 48 + Math.floor(i / 10) * 16, 16, 16), 0.75);
            blit(out, cell, 0, 0, 12, 12, 96 + (i % 8) * 12, 144 + Math.floor(i / 8) * 12);
        }
        return out;
    }

    /** Tilesets.json entry for one chipset. */
    function tilesetJson(chipset, terrains, names) {
        return { id: chipset.id, flags: tilesetFlags(chipset, terrains), mode: 1, name: chipset.name || `Chipset ${chipset.id}`, note: '', tilesetNames: [names.A1, names.A2, '', '', '', names.B, names.C, '', ''] };
    }

    const SOUND_SLOTS = { cursor_se: 0, decision_se: 1, cancel_se: 2, buzzer_se: 3, battle_se: 7, escape_se: 8, enemy_attack_se: 9, enemy_damaged_se: 10, enemy_death_se: 11, actor_damaged_se: 13, dodge_se: 16, item_se: 21 };

    /** Patch an MZ System.json to the 2003 engine's framework: 320×240 at 16 px, faces 48, and the game's own start, party, title and sounds. */
    function systemJson(base, db, tree, ini) {
        const sys = db.system || {};
        const out = JSON.parse(JSON.stringify(base));
        out.gameTitle = (ini && ini.RPG_RT && ini.RPG_RT.GameTitle) || out.gameTitle;
        out.tileSize = 16; out.faceSize = 48; out.iconSize = 32; // 2003 has no icon set; MZ's stock 32 px sheet stands in
        // 500 picture slots: 1-100 for the game's own pictures, the rest for named sprites (DynRPG's sprite plugin had no limit).
        // 2003 text: 12 px glyphs on 16 px lines, 8 px window padding, a 1 px shadow rather than MZ's 3 px outline.
        // A 320×240 game is pixel art; it scales up with nearest-neighbour sampling, never a blur.
        out.advanced = Object.assign({}, out.advanced, { screenWidth: 320, screenHeight: 240, uiAreaWidth: 320, uiAreaHeight: 240, fontSize: 12, lineHeight: 16, windowPadding: 8, textOutlineWidth: 1, rrTextShadow: true, windowMargin: 0, pixelatedRendering: true, windowOpacity: 255, picturesUpperLimit: 500 });
        if (tree && tree.start) { out.startMapId = tree.start.party_map_id || 1; out.startX = tree.start.party_x || 0; out.startY = tree.start.party_y || 0; }
        out.partyMembers = (sys.party || []).filter(id => id > 0);
        out.title1Name = stripExt(sys.title_name); out.title2Name = '';
        // A 2003 game can hide its title screen and run its own from events; the runtime honours rrSkipTitle.
        out.rrSkipTitle = sys.show_title === false;
        if (out.rrSkipTitle) out.title1Name = '';
        // 2000/2003 erase pictures when the party changes map, unless a Show Picture keeps its own (rrKeepPicture).
        out.rrPicturesEraseOnMapChange = true;
        // Pictures draw on a map layer (7 unless a Show Picture names one) and stay out of battles without a battle layer.
        out.rrPictureLayers = true;
        // A sound the game names but never shipped (a standard RTP file it relied on) stays silent.
        out.rrSkipMissingAudio = true;
        // So does an image it names but never shipped: it draws nothing.
        out.rrSkipMissingImages = true;
        // Variables are whole numbers within the engine's limit; dividing by zero leaves one as it was.
        out.rrLegacyVariableLimit = db.engine === 'RPG Maker 2000' ? 999999 : 9999999;
        // Erase Screen holds through teleports but not through the save screen or the menu.
        out.rrLegacyEraseScreen = true;
        // Passage is decided the old engine's way: upper tile first, then the lower tile by its own bits.
        out.rrLegacyPassage = true;
        // and update parallel common events before map events, as the old engine does.
        out.rrLegacyEventOrder = true;
        // Characters stand on the tile's bottom edge, not 6 px above it as in MZ.
        out.rrCharacterShiftY = 0;
        // An event's page change resets its transparency (a route may have faded it out).
        out.rrLegacyPageOpacity = true;
        // A panorama that neither scrolls nor loops moves with the camera in proportion, as in the old engine.
        out.rrLegacyParallax = true;
        // Choices are listed inside the message window, after the text.
        out.rrChoicesInMessage = true;
        // Characters walk and jump at the old engine's pace (twice MZ's at the same speed number).
        out.rrLegacyMotion = true;
        out.titleBgm = audio(sys.title_music); out.battleBgm = audio(sys.battle_music);
        out.victoryMe = audio(sys.battle_end_music); out.gameoverMe = audio(sys.gameover_music);
        out.optSideView = false; out.optDrawTitle = true; out.optTransparent = false;
        out.editMapId = out.startMapId;
        if (Array.isArray(out.sounds)) for (const [field, slot] of Object.entries(SOUND_SLOTS)) if (sys[field] && sys[field].name && out.sounds[slot]) out.sounds[slot] = audio(sys[field]);
        out.switches = ['', ...(db.switches || []).slice(1).map(s => (s && s.name) || '')];
        out.variables = ['', ...(db.variables || []).slice(1).map(v => (v && v.name) || '')];
        return out;
    }

    const api = { parallaxSpeed, TILE_ID_C, T, CORNER_KIND_OFFSET, LOWER_B_OFFSET, blank, blit, tile, quad, keyColour, chipsetToSheets, lowerPos, upperPos, blockPos, bcPos, ANIMATED_B_INDEX, shapeOf, lowerTile, upperTile, mapData, mzFlag, tilesetFlags, reorderCharset, charsetName, DIRECTION, audio, mapInfos, mapMusic, eventPage, mapJson, tilesetJson, systemJson, stripExt, terrainMap, mapBattleback, scaleNearest, windowSkin };
    root.RRLegacyConvert = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
