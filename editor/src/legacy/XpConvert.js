/**
 * XpConvert - RPG Maker XP (RGSS1) tilesets and maps into RPG Maker MZ's.
 * Pure: RGBA images and plain objects in, MZ sheets, flags and map data out.
 *
 * An XP tileset is one image eight tiles wide plus up to seven autotiles
 * (96×128, or three such frames side by side when animated). XP tile ids:
 * 0 is empty, 48..383 are the seven autotiles (48 shapes each), 384 and up the
 * tileset image read left to right. MZ's B–E sheets hold 256 tiles each as two
 * eight-wide columns, and B–E ids run 0..1023 in that same order, so an XP id
 * n ≥ 384 is MZ id n − 384 once the image is re-cut into those columns.
 *
 * Autotiles become MZ autotiles: an animated one takes an A1 slot that MZ
 * animates in three frames across (kinds 0, 1, 4, 6, 8, 10, 12, 14), a still
 * one an A2 kind. XP's block is a 3×3 of edges under a row holding the
 * isolated tile and the inner corners; MZ's is the same row over a 2×2, which
 * is XP's 3×3 with the middle 32 px cut out both ways (16 px quarter columns
 * and rows 0, 1, 4, 5). Both engines share the 48-shape numbering.
 *
 * Passage bits are MZ's own (1 down, 2 left, 4 right, 8 up, 0x40 bush,
 * 0x80 counter); an XP priority above 0 is MZ's star (drawn over characters);
 * the terrain tag goes to bits 12–15.
 */
(function (root) {
    'use strict';

    const blank = (w, h) => ({ width: w, height: h, data: new Uint8Array(w * h * 4) });
    function blit(dst, src, sx, sy, w, h, dx, dy) {
        for (let y = 0; y < h; y++) {
            const syy = sy + y, dyy = dy + y;
            if (syy < 0 || syy >= src.height || dyy < 0 || dyy >= dst.height) continue;
            for (let x = 0; x < w; x++) {
                const sxx = sx + x, dxx = dx + x;
                if (sxx < 0 || sxx >= src.width || dxx < 0 || dxx >= dst.width) continue;
                const si = (syy * src.width + sxx) * 4, di = (dyy * dst.width + dxx) * 4;
                dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1]; dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = src.data[si + 3];
            }
        }
    }

    /** One XP autotile frame (96×128 at `frameX`) as an MZ autotile block (64×96). `t` is the tile size. */
    function autotileBlock(img, frameX = 0, t = 32) {
        const q = t / 2, out = blank(t * 2, t * 3);
        blit(out, img, frameX, 0, t, t, 0, 0);                 // the isolated tile
        blit(out, img, frameX + t * 2, 0, t, t, t, 0);         // the inner corners
        const keep = [0, 1, 4, 5];                             // quarter columns and rows of XP's 3×3 that MZ's 2×2 keeps
        for (let qy = 0; qy < 4; qy++) for (let qx = 0; qx < 4; qx++) {
            blit(out, img, frameX + keep[qx] * q, t + keep[qy] * q, q, q, qx * q, t + qy * q);
        }
        return out;
    }

    /** An autotile image is animated when it holds more than one 96 px frame. */
    const frameCount = (img, t = 32) => Math.max(1, Math.floor((img ? img.width : 0) / (t * 3)));

    const A1_ANIMATED_KINDS = [0, 1, 4, 6, 8, 10, 12, 14];
    /** Where MZ reads an A1 kind's first frame, in tiles (Tilemap._addAutotile). */
    function a1Origin(kind) {
        if (kind === 0) return [0, 0];
        if (kind === 1) return [0, 3];
        const tx = kind % 8, ty = Math.floor(kind / 8);
        return [Math.floor(tx / 4) * 8, ty * 6 + (Math.floor(tx / 2) % 2) * 3];
    }

    /**
     * The MZ sheets for one XP tileset: { A1, A2, B, C, D, E } (RGBA images, or
     * null when nothing goes there) and `autotiles`: per XP autotile index, the
     * MZ tile id base (2048 + kind × 48 for A1, 2816 + kind × 48 for A2).
     */
    function tilesetSheets(tileset, autotiles, t = 32) {
        const sheets = { A1: null, A2: null, B: null, C: null, D: null, E: null };
        const bases = [];
        let a1 = 0, a2 = 0;
        (autotiles || []).forEach((img, index) => {
            if (!img) { bases[index] = null; return; }
            const frames = frameCount(img, t);
            if (frames > 1 && a1 < A1_ANIMATED_KINDS.length) {
                const kind = A1_ANIMATED_KINDS[a1++];
                if (!sheets.A1) sheets.A1 = blank(t * 16, t * 12);
                const [ox, oy] = a1Origin(kind);
                // MZ plays frames 0, 1, 2, 1 two tiles apart; XP's frames fill the three slots.
                for (let f = 0; f < 3; f++) blit(sheets.A1, autotileBlock(img, Math.min(f, frames - 1) * t * 3, t), 0, 0, t * 2, t * 3, (ox + f * 2) * t, oy * t);
                bases[index] = 2048 + kind * 48;
            } else if (a2 < 32) {
                const kind = a2++;
                if (!sheets.A2) sheets.A2 = blank(t * 16, t * 12);
                blit(sheets.A2, autotileBlock(img, 0, t), 0, 0, t * 2, t * 3, (kind % 8) * t * 2, Math.floor(kind / 8) * t * 3);
                bases[index] = 2816 + kind * 48;
            } else bases[index] = null;
        });
        if (tileset) {
            const tiles = Math.floor(tileset.width / t) * Math.floor(tileset.height / t);
            const perRow = Math.floor(tileset.width / t);
            for (let i = 0; i < Math.min(tiles, 1024); i++) {
                const key = ['B', 'C', 'D', 'E'][Math.floor(i / 256)];
                if (!sheets[key]) sheets[key] = blank(t * 16, t * 16);
                const j = i % 256, col = (j % 8) + (j >= 128 ? 8 : 0), row = Math.floor((j % 128) / 8);
                blit(sheets[key], tileset, (i % perRow) * t, Math.floor(i / perRow) * t, t, t, col * t, row * t);
            }
        }
        return { sheets, autotiles: bases };
    }

    /** An XP tile id as an MZ tile id (0 when it has no counterpart). */
    function tileId(id, autotileBases) {
        if (!id) return 0;
        if (id >= 384) return id - 384 < 1024 ? id - 384 : 0;
        if (id >= 48) {
            const base = autotileBases[Math.floor(id / 48) - 1];
            return base === null || base === undefined ? 0 : base + (id % 48);
        }
        return 0;
    }

    const flagOf = (passage, priority, terrain) => (passage & 0xcf) | (priority > 0 ? 0x10 : 0) | ((terrain & 0x0f) << 12);

    /** MZ Tilesets.json flags (8192) from XP's passages, priorities and terrain tags (Tables indexed by XP id). */
    function tilesetFlags(xp, autotileBases) {
        const flags = new Array(8192).fill(0);
        const at = (table, i) => (table && table.data && i < table.data.length ? table.data[i] & 0xffff : 0);
        for (let id = 384; id < 384 + 1024; id++) flags[id - 384] = flagOf(at(xp.passages, id), at(xp.priorities, id), at(xp.terrain_tags, id));
        flags[0] = 0x10;   // MZ's tile 0 is "nothing here"
        (autotileBases || []).forEach((base, index) => {
            if (base === null || base === undefined) return;
            for (let s = 0; s < 48; s++) {
                const id = (index + 1) * 48 + s;
                flags[base + s] = flagOf(at(xp.passages, id), at(xp.priorities, id), at(xp.terrain_tags, id));
            }
        });
        return flags;
    }

    /** MZ map data (six layers) from an XP map's three-layer Table. */
    function mapData(table, width, height, autotileBases) {
        const data = new Array(width * height * 6).fill(0);
        if (!table) return data;
        for (let z = 0; z < Math.min(3, table.zsize); z++) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            data[(z * height + y) * width + x] = tileId(table.data[x + y * table.xsize + z * table.xsize * table.ysize] & 0xffff, autotileBases);
        }
        return data;
    }

    // ---- event commands -------------------------------------------------------

    /**
     * XP ran at 40 frames a second and MZ runs at 60, so every duration an event
     * gives in frames is half as long again here (waits, fades, tints, picture
     * moves, shakes, flashes, weather, scrolling waits).
     */
    const FRAMES = (n) => Math.round((Number(n) || 0) * 1.5);
    const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const str = (v) => (typeof v === 'string' ? v : '');
    const list = (v) => (Array.isArray(v) ? v : []);
    const audio = (a) => (a ? { name: str(a.name), volume: num(a.volume, 100), pitch: num(a.pitch, 100), pan: 0 } : { name: '', volume: 100, pitch: 100, pan: 0 });
    const tone = (t) => (t ? [Math.round(num(t.red)), Math.round(num(t.green)), Math.round(num(t.blue)), Math.round(num(t.gray))] : [0, 0, 0, 0]);
    const color = (c) => (c ? [Math.round(num(c.red)), Math.round(num(c.green)), Math.round(num(c.blue)), Math.round(num(c.alpha))] : [255, 255, 255, 255]);
    const tag = (notes, key, n = 1) => { if (notes) notes[key] = (notes[key] || 0) + n; };
    /** RGSS1's Input constants → MZ key names. */
    const BUTTONS = { 2: 'down', 4: 'left', 6: 'right', 8: 'up', 11: 'shift', 12: 'cancel', 13: 'ok', 14: 'shift', 15: 'shift', 16: 'ok', 17: 'pageup', 18: 'pagedown', 21: 'shift', 22: 'control', 23: 'shift' };
    const WEATHER = ['none', 'rain', 'storm', 'snow'];

    /** An XP character sheet's name in the project: every XP sheet is one character, four frames a row. */
    const characterName = (name) => (name ? `$${name}[f4]` : '');

    function moveCommand(c, notes, ruby) {
        const code = num(c.code);
        let parameters = list(c.parameters).map(p => (p && p.__class === 'RPG::AudioFile' ? audio(p) : p));
        switch (code) {
            case 15: parameters = [FRAMES(parameters[0])]; break;                          // wait
            case 41: parameters = [characterName(str(parameters[0])), 0]; break;          // change graphic (name, hue, direction, pattern)
            case 45: {                                                                      // script
                const js = ruby ? ruby(str(parameters[0]), 'statement', { self: 'character' }) : null;
                if (js !== null) { parameters = [js]; tag(notes, 'rubyTranslated'); }
                else { parameters = ['/* Ruby: ' + str(parameters[0]).replace(/\*\//g, '* /') + ' */']; tag(notes, 'moveRouteScript'); }
                break;
            }
            default: break;
        }
        return { code, parameters, indent: null };
    }
    const moveRoute = (r, notes, ruby) => ({ list: list(r && r.list).map(c => moveCommand(c, notes, ruby)), repeat: !!(r && r.repeat), skippable: !!(r && r.skippable), wait: false });

    /**
     * One XP event command list → MZ. `ruby(source, kind, context)` translates
     * Script text (RgssConvert.ruby); untranslatable Ruby stays as a comment.
     */
    function commands(cmds, notes, ruby) {
        const out = [];
        const src = list(cmds);
        // Change Text Options (104) sets where later messages go; MZ says it on each message.
        let position = 2, background = 0;
        const push = (code, indent, parameters) => out.push({ code, indent, parameters });
        for (let i = 0; i < src.length; i++) {
            const c = src[i] || {};
            const code = num(c.code), indent = num(c.indent), p = list(c.parameters);
            switch (code) {
                case 101: push(101, indent, ['', 0, background, position, '']); push(401, indent, [str(p[0])]); break;
                case 401: push(401, indent, [str(p[0])]); break;
                case 102: {
                    const choices = list(p[0]).map(str), cancel = num(p[1]);
                    push(102, indent, [choices, cancel === 0 ? -1 : cancel > choices.length ? -2 : cancel - 1, 0, 2, background]);
                    break;
                }
                case 402: push(402, indent, [num(p[0]), str(p[1])]); break;
                case 403: case 404: push(code, indent, []); break;
                case 103: push(103, indent, [num(p[0]), num(p[1], 1)]); break;
                case 104: position = num(p[0], 2); background = num(p[1]) ? 2 : 0; tag(notes, 'textOptions'); break;
                case 105: push(355, indent, [`this.rrKeyInput?.(${num(p[0])})`]); tag(notes, 'buttonInput'); break;
                case 106: push(230, indent, [FRAMES(p[0])]); break;
                case 108: case 408: push(code, indent, [str(p[0])]); break;
                case 111: {
                    const type = num(p[0]);
                    if (type === 4 && num(p[2]) >= 2) { push(111, indent, [4, num(p[1]), num(p[2]) + 1, p[3]]); tag(notes, 'actorCondition'); }
                    else if (type === 11) push(111, indent, [11, BUTTONS[num(p[1])] || 'ok', 0]);
                    else if (type === 12) {
                        const js = ruby ? ruby(str(p[1]), 'expression', {}) : null;
                        push(111, indent, [12, js !== null ? js : 'false /* Ruby: ' + str(p[1]).replace(/\*\//g, '* /') + ' */']);
                        tag(notes, js !== null ? 'rubyTranslated' : 'rubyCondition');
                    } else if (type === 6) push(111, indent, [6, num(p[1]), num(p[2])]);
                    else if (type === 3) push(111, indent, [3, num(p[1]), num(p[2])]);
                    else push(111, indent, p.slice());
                    break;
                }
                case 411: case 412: case 112: case 413: case 113: case 115: case 0: push(code, indent, []); break;
                case 116: push(214, indent, []); break;
                case 117: push(117, indent, [num(p[0])]); break;
                case 118: push(118, indent, [str(p[0])]); break;
                case 119: push(119, indent, [str(p[0])]); break;
                case 121: case 123: case 124: case 125: case 126: case 127: case 128: case 129:
                case 134: case 135: case 136: case 314: case 315: case 316: case 320: case 321: case 351: case 352: case 353: case 354:
                    push(code, indent, p.map(x => (x && typeof x === 'object' ? audio(x) : x)));
                    break;
                case 122: {
                    // XP operands 3..7 (item, actor, enemy, character, other) are MZ's game data (3, type, …).
                    const [start, end, op, type] = p;
                    if (type <= 2) push(122, indent, [start, end, op, type, p[4], p[5]]);
                    else if (type === 3) push(122, indent, [start, end, op, 3, 0, p[4], 0]);
                    else if (type === 4) push(122, indent, [start, end, op, 3, 3, p[4], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11][num(p[5])] ?? 0]);
                    else if (type === 5) push(122, indent, [start, end, op, 3, 4, p[4], num(p[5])]);
                    else if (type === 6) push(122, indent, [start, end, op, 3, 5, p[4], num(p[5])]);
                    else push(122, indent, [start, end, op, 3, 7, num(p[4]), 0]);
                    if (type >= 4) tag(notes, 'variableGameData');
                    break;
                }
                case 131: {
                    push(355, indent, [`$gameSystem.rrSetWindowskin?.(${JSON.stringify(str(p[0]))})`]);
                    tag(notes, 'windowskin');
                    // Which skins events switch to (not a count for the report): the importer's default when the system names none.
                    if (notes) { if (!notes.windowskinNames) Object.defineProperty(notes, 'windowskinNames', { value: {}, enumerable: false }); notes.windowskinNames[str(p[0])] = (notes.windowskinNames[str(p[0])] || 0) + 1; }
                    break;
                }
                case 132: case 133: push(code, indent, [audio(p[0])]); break;
                case 201: push(201, indent, [num(p[0]), num(p[1]), num(p[2]), num(p[3]), num(p[4]), num(p[5]) === 1 ? 2 : 0]); break;
                case 202: push(203, indent, [num(p[0]), num(p[1]), num(p[2]), num(p[3]), num(p[4])]); break;
                case 203: push(204, indent, [num(p[0]), num(p[1]), num(p[2]), false]); break;
                case 204: {
                    // Map settings: 0 panorama, 1 fog, 2 battleback.
                    const kind = num(p[0]);
                    if (kind === 0) push(284, indent, [str(p[1]), false, false, 0, 0]);
                    else if (kind === 1) push(355, indent, [`$gameMap.rrXpFog?.(${JSON.stringify(str(p[1]))}, ${num(p[2])}, ${num(p[3], 64)}, ${num(p[4])}, ${num(p[5], 200)}, ${num(p[6])}, ${num(p[7])})`]);
                    else push(283, indent, [str(p[1]), '']);
                    break;
                }
                case 205: push(355, indent, [`$gameScreen.rrTintFog?.(0, ${tone(p[0]).join(', ')}, ${FRAMES(p[1])})`]); break;
                case 206: push(355, indent, [`$gameScreen.rrFadeFog?.(0, ${num(p[0])}, ${FRAMES(p[1])})`]); break;
                case 207: push(212, indent, [num(p[0]), num(p[1]), false]); break;
                case 208: push(211, indent, [num(p[0]) === 0 ? 0 : 1]); break;
                case 209: push(205, indent, [num(p[0]), moveRoute(p[1], notes, ruby)]); break;
                case 509: push(505, indent, [moveCommand(p[0] || {}, notes, ruby)]); break;
                case 210: push(355, indent, ['this.rrWaitForAllMoves?.()']); break;
                case 221: push(355, indent, ['this.rrPrepareTransition?.()']); break;
                case 222: push(355, indent, [`this.rrExecuteTransition?.(${JSON.stringify(str(p[0]))}, ${FRAMES(20)})`]); break;
                case 223: push(223, indent, [tone(p[0]), FRAMES(p[1]), false]); break;
                case 224: push(224, indent, [color(p[0]), FRAMES(p[1]), false]); break;
                case 225: push(225, indent, [num(p[0]), num(p[1]), FRAMES(p[2]), false]); break;
                case 231: push(231, indent, [num(p[0]), str(p[1]), num(p[2]), num(p[3]), p[4], p[5], num(p[6], 100), num(p[7], 100), num(p[8], 255), num(p[9])]); break;
                case 232: push(232, indent, [num(p[0]), '', num(p[2]), num(p[3]), p[4], p[5], num(p[6], 100), num(p[7], 100), num(p[8], 255), num(p[9]), FRAMES(p[1]), false, 0]); break;
                case 233: push(233, indent, [num(p[0]), num(p[1])]); break;
                case 234: push(234, indent, [num(p[0]), tone(p[1]), FRAMES(p[2]), false]); break;
                case 235: push(235, indent, [num(p[0])]); break;
                case 236: push(236, indent, [WEATHER[num(p[0])] || 'none', num(p[1]), FRAMES(p[2]), false]); break;
                case 241: case 245: case 249: case 250: push(code, indent, [audio(p[0])]); break;
                case 242: case 246: push(code, indent, [num(p[0])]); break;
                case 247: push(243, indent, []); break;
                case 248: push(244, indent, []); break;
                case 251: push(251, indent, []); break;
                case 301: push(301, indent, [0, num(p[0]), !!p[1], !!p[2]]); break;
                case 601: case 602: case 603: case 604: push(code, indent, []); break;
                case 302: case 605: push(code, indent, [num(p[0]), num(p[1]), 0, 0, false].slice(0, code === 302 ? 5 : 4)); break;
                case 303: push(303, indent, [num(p[0]), num(p[1], 8)]); break;
                case 311: case 312: push(code, indent, [0, num(p[0]), num(p[1]), num(p[2]), num(p[3]), code === 311]); break;
                case 313: push(313, indent, [0, num(p[0]), num(p[1]), num(p[2])]); break;
                case 317: push(317, indent, [0, num(p[0]), [0, 1, 2, 7, 6, 4][num(p[1])] ?? 0, num(p[2]), num(p[3]), num(p[4])]); tag(notes, 'parameterMapped'); break;
                case 318: push(318, indent, [0, num(p[0]), num(p[1]), num(p[2])]); break;
                case 319: push(319, indent, [num(p[0]), num(p[1]) + 1, num(p[2])]); break;
                case 322: push(322, indent, [num(p[0]), characterName(str(p[1])), 0, '', 0, str(p[3])]); break;
                case 331: case 332: case 333: case 334: case 335: case 336: case 337: case 338: case 339: case 340:
                    push(code, indent, p.map(x => (x && typeof x === 'object' ? audio(x) : x)));
                    tag(notes, 'battleCommand');
                    break;
                case 355: {
                    const lines = [str(p[0])];
                    while (i + 1 < src.length && src[i + 1] && src[i + 1].code === 655) lines.push(str(list(src[++i].parameters)[0]));
                    const translated = ruby ? lines.map(l => ruby(l, 'statement', {})) : lines.map(() => null);
                    if (translated.every(t => t !== null)) {
                        push(355, indent, [translated[0]]);
                        for (const t of translated.slice(1)) push(655, indent, [t]);
                        tag(notes, 'rubyTranslated');
                    } else {
                        push(108, indent, ['Ruby script (did not carry over):']);
                        for (const l of lines) push(408, indent, [l]);
                        tag(notes, 'rubyScript');
                    }
                    break;
                }
                default:
                    push(108, indent, [`XP command ${code}: ${JSON.stringify(p).slice(0, 200)}`]);
                    tag(notes, 'unknownCommand');
            }
        }
        if (!out.length || out[out.length - 1].code !== 0) out.push({ code: 0, indent: 0, parameters: [] });
        return out;
    }

    // ---- records ----------------------------------------------------------------

    const EMPTY_ROUTE = { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false };

    /**
     * An XP event page. XP draws events with an opacity and blend mode of their
     * own, which MZ pages lack: a first-line comment <rrOpacity: n> <rrBlend: n>
     * carries them (RR_XpCompat reads it), visible and editable in the event.
     */
    function eventPage(pg, bases, notes, ruby) {
        const c = pg.condition || {}, g = pg.graphic || {};
        const body = commands(pg.list, notes, ruby);
        const look = [];
        if (num(g.opacity, 255) !== 255) look.push(`<rrOpacity: ${num(g.opacity)}>`);
        if (num(g.blend_type)) look.push(`<rrBlend: ${num(g.blend_type)}>`);
        if (num(g.character_hue)) { look.push(`<rrHue: ${num(g.character_hue)}>`); tag(notes, 'characterHue'); }
        if (look.length) body.unshift({ code: 108, indent: 0, parameters: [look.join(' ')] });
        return {
            conditions: { actorId: 1, actorValid: false, itemId: 1, itemValid: false, selfSwitchCh: str(c.self_switch_ch) || 'A', selfSwitchValid: !!c.self_switch_valid,
                switch1Id: num(c.switch1_id, 1), switch1Valid: !!c.switch1_valid, switch2Id: num(c.switch2_id, 1), switch2Valid: !!c.switch2_valid,
                variableId: num(c.variable_id, 1), variableValid: !!c.variable_valid, variableValue: num(c.variable_value) },
            directionFix: !!pg.direction_fix,
            image: { characterIndex: 0, characterName: g.tile_id ? '' : characterName(str(g.character_name)), direction: num(g.direction, 2), pattern: num(g.pattern), tileId: tileId(num(g.tile_id), bases) },
            list: body, moveFrequency: num(pg.move_frequency, 3), moveRoute: pg.move_route ? moveRoute(pg.move_route, notes, ruby) : EMPTY_ROUTE,
            moveSpeed: num(pg.move_speed, 3), moveType: num(pg.move_type),
            // XP events share the characters' level; "always on top" is MZ's above-characters.
            priorityType: pg.always_on_top ? 2 : 1,
            stepAnime: !!pg.step_anime, through: !!pg.through, trigger: num(pg.trigger), walkAnime: pg.walk_anime !== false
        };
    }

    /** An XP map as MZ's. `tileset` is the XP tileset record (panorama, fog and battleback live there). */
    function map(m, tileset, bases, notes, ruby) {
        const w = num(m.width), h = num(m.height);
        const events = [null];
        const entries = m.events instanceof Map ? Array.from(m.events.values()) : Object.values(m.events || {});
        for (const e of entries) {
            if (!e || !e.id) continue;
            events[e.id] = { id: e.id, name: str(e.name), note: '', x: num(e.x), y: num(e.y), pages: list(e.pages).map(pg => eventPage(pg, bases, notes, ruby)) };
        }
        for (let i = 1; i < events.length; i++) if (events[i] === undefined) events[i] = null;
        const ts = tileset || {};
        // XP's fog (a tiled image scrolled over the map) has no MZ field: a map note that RR_XpCompat shows.
        const note = ts.fog_name ? `<rrFog: ${[str(ts.fog_name), num(ts.fog_hue), num(ts.fog_opacity, 64), num(ts.fog_blend_type), num(ts.fog_zoom, 100), num(ts.fog_sx), num(ts.fog_sy)].join(', ')}>` : '';
        if (note) tag(notes, 'fogMap');
        return {
            autoplayBgm: !!m.autoplay_bgm, autoplayBgs: !!m.autoplay_bgs, battleback1Name: str(ts.battleback_name), battleback2Name: '', bgm: audio(m.bgm), bgs: audio(m.bgs),
            disableDashing: false, displayName: '',
            encounterList: list(m.encounter_list).map(id => ({ regionSet: [], troopId: num(id, 1), weight: 10 })),
            encounterStep: num(m.encounter_step, 30), height: h, note,
            // The panorama is MZ's parallax, which scrolls at half the map's speed like XP's.
            parallaxLoopX: false, parallaxLoopY: false, parallaxName: str(ts.panorama_name), parallaxShow: true, parallaxSx: 0, parallaxSy: 0,
            scrollType: 0, specifyBattleback: !!ts.battleback_name, tilesetId: num(m.tileset_id, 1), width: w, data: mapData(m.data, w, h, bases), events
        };
    }

    function troops(xpTroops, notes, ruby) {
        const out = [null];
        for (const t of list(xpTroops)) {
            if (!t || !t.id) continue;
            if (list(t.members).some(m => m && m.immortal)) tag(notes, 'immortalMember');
            out[t.id] = {
                id: t.id, name: str(t.name),
                members: list(t.members).map(m => ({ enemyId: num(m.enemy_id), x: num(m.x), y: num(m.y), hidden: !!m.hidden })),
                pages: list(t.pages).map(pg => {
                    const c = pg.condition || {};
                    return { conditions: { actorHp: num(c.actor_hp, 50), actorId: num(c.actor_id, 1), actorValid: !!c.actor_valid, enemyHp: num(c.enemy_hp, 50), enemyIndex: num(c.enemy_index), enemyValid: !!c.enemy_valid,
                        switchId: num(c.switch_id, 1), switchValid: !!c.switch_valid, turnA: num(c.turn_a), turnB: num(c.turn_b), turnEnding: false, turnValid: !!c.turn_valid },
                        list: commands(pg.list, notes, ruby), span: num(pg.span) };
                })
            };
        }
        for (let i = 1; i < out.length; i++) if (out[i] === undefined) out[i] = null;
        return out;
    }

    function commonEvents(xpCommon, notes, ruby) {
        const out = [null];
        for (const ce of list(xpCommon)) if (ce && ce.id) out[ce.id] = { id: ce.id, list: commands(ce.list, notes, ruby), name: str(ce.name), switchId: num(ce.switch_id, 1), trigger: num(ce.trigger) };
        for (let i = 1; i < out.length; i++) if (out[i] === undefined) out[i] = null;
        return out;
    }

    /** The MZ tileset record; `names` are the sheet file names the importer wrote ({ A1, A2, B … E }). */
    const tilesetRecord = (ts, names, flags) => ({
        id: ts.id, flags, mode: 1, name: str(ts.name), note: '',
        tilesetNames: ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'].map(k => names[k] || '')
    });

    // ---- the window skin ---------------------------------------------------------

    /** XP's text colours (Window_Base#text_color 0..7, system, crisis, knockout) laid into MZ's palette slots. */
    const TEXT_COLORS = [[255, 255, 255], [128, 128, 255], [255, 128, 128], [128, 255, 128], [128, 255, 255], [255, 128, 255], [255, 255, 128], [192, 192, 192]];
    const SYSTEM_COLORS = { 16: [192, 224, 255], 17: [255, 255, 64], 18: [255, 64, 0] };

    /**
     * An XP Windowskin (192×128) as an MZ Window.png (192×192) on `base` (the
     * template's, for what XP draws in code). XP: background (0,0) 128×128,
     * frame (128,0) 64×64 with 16 px corners, scroll arrows in its middle,
     * cursor (128,64) 32×32, pause sign (160,64) as four 16 px frames. The
     * frame keeps its 16 px thickness inside MZ's 24 px corners; background and
     * cursor are resampled, which MZ stretches over the window anyway. XP has
     * no pattern layer; its text colours are code, written into MZ's palette.
     */
    function windowSkin(skin, base) {
        const out = base ? { width: base.width, height: base.height, data: new Uint8Array(base.data) } : blank(192, 192);
        if (!skin || skin.width < 192 || skin.height < 128) return out;
        const region = (sx, sy, w, h) => { const r = blank(w, h); blit(r, skin, sx, sy, w, h, 0, 0); return r; };
        const clear = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) out.data.fill(0, (yy * out.width + x) * 4, (yy * out.width + x + w) * 4); };
        const stretch = (src, dw, dh) => { const d = blank(dw, dh); for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const si = (Math.floor(y * src.height / dh) * src.width + Math.floor(x * src.width / dw)) * 4, di = (y * dw + x) * 4; for (let k = 0; k < 4; k++) d.data[di + k] = src.data[si + k]; } return d; };
        clear(0, 0, 96, 192);
        blit(out, stretch(region(0, 0, 128, 128), 96, 96), 0, 0, 96, 96, 0, 0);
        clear(96, 0, 96, 96);
        const F = (x, y, w, h) => region(128 + x, y, w, h);
        blit(out, F(0, 0, 16, 16), 0, 0, 16, 16, 96, 0); blit(out, F(48, 0, 16, 16), 0, 0, 16, 16, 176, 0);
        blit(out, F(0, 48, 16, 16), 0, 0, 16, 16, 96, 80); blit(out, F(48, 48, 16, 16), 0, 0, 16, 16, 176, 80);
        blit(out, stretch(F(16, 0, 32, 16), 80, 16), 0, 0, 80, 16, 104, 0); blit(out, stretch(F(16, 48, 32, 16), 80, 16), 0, 0, 80, 16, 104, 80);
        blit(out, stretch(F(0, 16, 16, 32), 16, 80), 0, 0, 16, 80, 96, 8); blit(out, stretch(F(48, 16, 16, 32), 16, 80), 0, 0, 16, 80, 176, 8);
        blit(out, F(24, 16, 16, 8), 0, 0, 16, 8, 136, 26); blit(out, F(24, 40, 16, 8), 0, 0, 16, 8, 136, 62);
        clear(96, 96, 96, 48);
        blit(out, stretch(region(128, 64, 32, 32), 48, 48), 0, 0, 48, 48, 96, 96);
        for (let i = 0; i < 4; i++) blit(out, region(160 + (i % 2) * 16, 64 + Math.floor(i / 2) * 16, 16, 16), 0, 0, 16, 16, 144 + (i % 2) * 24 + 4, 96 + Math.floor(i / 2) * 24 + 4);
        const swatch = (i, rgb) => {
            const dx = 96 + (i % 8) * 12, dy = 144 + Math.floor(i / 8) * 12;
            for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const di = ((dy + y) * out.width + dx + x) * 4; out.data[di] = rgb[0]; out.data[di + 1] = rgb[1]; out.data[di + 2] = rgb[2]; out.data[di + 3] = 255; }
        };
        TEXT_COLORS.forEach((rgb, i) => swatch(i, rgb));
        for (const [i, rgb] of Object.entries(SYSTEM_COLORS)) swatch(Number(i), rgb);
        return out;
    }

    const api = { eventPage, map, troops, commonEvents, tilesetRecord, windowSkin, FRAMES, characterName, commands, moveRoute, blank, blit, autotileBlock, frameCount, a1Origin, tilesetSheets, tileId, tilesetFlags, mapData, A1_ANIMATED_KINDS };
    root.RRXpConvert = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
