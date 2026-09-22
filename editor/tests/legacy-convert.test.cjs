'use strict';
// LegacyConvert: the 2003 chipset and map layers become MZ tilesets and
// six-layer map data. The tables the reference implementation (EasyRPG
// Player, tilemap_layer.cpp) uses to draw a 2003 tile are reproduced here
// as the oracle: a map drawn by those rules from the original chipset must
// equal the same map drawn by MZ's rules from the converted sheets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const K = require('../src/legacy/LegacyConvert.js');
const L = require('../src/legacy/LcfReader.js');

// [variant][row][col] → chipset row of the water A piece, -1 = plain water
const BLOCK_A = [[[-1, -1], [-1, -1]], [[3, -1], [-1, -1]], [[-1, 3], [-1, -1]], [[3, 3], [-1, -1]], [[-1, -1], [-1, 3]], [[3, -1], [-1, 3]], [[-1, 3], [-1, 3]], [[3, 3], [-1, 3]], [[-1, -1], [3, -1]], [[3, -1], [3, -1]], [[-1, 3], [3, -1]], [[3, 3], [3, -1]], [[-1, -1], [3, 3]], [[3, -1], [3, 3]], [[-1, 3], [3, 3]], [[3, 3], [3, 3]], [[1, -1], [1, -1]], [[1, 3], [1, -1]], [[1, -1], [1, 3]], [[1, 3], [1, 3]], [[2, 2], [-1, -1]], [[2, 2], [-1, 3]], [[2, 2], [3, -1]], [[2, 2], [3, 3]], [[-1, 1], [-1, 1]], [[-1, 1], [3, 1]], [[3, 1], [-1, 1]], [[3, 1], [3, 1]], [[-1, -1], [2, 2]], [[3, -1], [2, 2]], [[-1, 3], [2, 2]], [[3, 3], [2, 2]], [[1, 1], [1, 1]], [[2, 2], [2, 2]], [[0, 2], [1, -1]], [[0, 2], [1, 3]], [[2, 0], [-1, 1]], [[2, 0], [3, 1]], [[-1, 1], [2, 0]], [[3, 1], [2, 0]], [[1, -1], [0, 2]], [[1, 3], [0, 2]], [[0, 0], [1, 1]], [[0, 2], [0, 2]], [[1, 1], [0, 0]], [[2, 0], [2, 0]], [[0, 0], [0, 0]]];
// [variant][row][col] → [x, y] tile inside a 3×4 terrain block
const BLOCK_D = [[[[1, 2], [1, 2]], [[1, 2], [1, 2]]], [[[2, 0], [1, 2]], [[1, 2], [1, 2]]], [[[1, 2], [2, 0]], [[1, 2], [1, 2]]], [[[2, 0], [2, 0]], [[1, 2], [1, 2]]], [[[1, 2], [1, 2]], [[1, 2], [2, 0]]], [[[2, 0], [1, 2]], [[1, 2], [2, 0]]], [[[1, 2], [2, 0]], [[1, 2], [2, 0]]], [[[2, 0], [2, 0]], [[1, 2], [2, 0]]], [[[1, 2], [1, 2]], [[2, 0], [1, 2]]], [[[2, 0], [1, 2]], [[2, 0], [1, 2]]], [[[1, 2], [2, 0]], [[2, 0], [1, 2]]], [[[2, 0], [2, 0]], [[2, 0], [1, 2]]], [[[1, 2], [1, 2]], [[2, 0], [2, 0]]], [[[2, 0], [1, 2]], [[2, 0], [2, 0]]], [[[1, 2], [2, 0]], [[2, 0], [2, 0]]], [[[2, 0], [2, 0]], [[2, 0], [2, 0]]], [[[0, 2], [0, 2]], [[0, 2], [0, 2]]], [[[0, 2], [2, 0]], [[0, 2], [0, 2]]], [[[0, 2], [0, 2]], [[0, 2], [2, 0]]], [[[0, 2], [2, 0]], [[0, 2], [2, 0]]], [[[1, 1], [1, 1]], [[1, 1], [1, 1]]], [[[1, 1], [1, 1]], [[1, 1], [2, 0]]], [[[1, 1], [1, 1]], [[2, 0], [1, 1]]], [[[1, 1], [1, 1]], [[2, 0], [2, 0]]], [[[2, 2], [2, 2]], [[2, 2], [2, 2]]], [[[2, 2], [2, 2]], [[2, 0], [2, 2]]], [[[2, 0], [2, 2]], [[2, 2], [2, 2]]], [[[2, 0], [2, 2]], [[2, 0], [2, 2]]], [[[1, 3], [1, 3]], [[1, 3], [1, 3]]], [[[2, 0], [1, 3]], [[1, 3], [1, 3]]], [[[1, 3], [2, 0]], [[1, 3], [1, 3]]], [[[2, 0], [2, 0]], [[1, 3], [1, 3]]], [[[0, 2], [2, 2]], [[0, 2], [2, 2]]], [[[1, 1], [1, 1]], [[1, 3], [1, 3]]], [[[0, 1], [0, 1]], [[0, 1], [0, 1]]], [[[0, 1], [0, 1]], [[0, 1], [2, 0]]], [[[2, 1], [2, 1]], [[2, 1], [2, 1]]], [[[2, 1], [2, 1]], [[2, 0], [2, 1]]], [[[2, 3], [2, 3]], [[2, 3], [2, 3]]], [[[2, 0], [2, 3]], [[2, 3], [2, 3]]], [[[0, 3], [0, 3]], [[0, 3], [0, 3]]], [[[0, 3], [2, 0]], [[0, 3], [0, 3]]], [[[0, 1], [2, 1]], [[0, 1], [2, 1]]], [[[0, 1], [0, 1]], [[0, 3], [0, 3]]], [[[0, 3], [2, 3]], [[0, 3], [2, 3]]], [[[2, 1], [2, 1]], [[2, 3], [2, 3]]], [[[0, 1], [2, 1]], [[0, 3], [2, 3]]], [[[1, 2], [1, 2]], [[1, 2], [1, 2]]], [[[1, 2], [1, 2]], [[1, 2], [1, 2]]], [[[0, 0], [0, 0]], [[0, 0], [0, 0]]]];
const FLOOR = (() => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_core.js'), 'utf8');
    const start = src.indexOf('Tilemap.FLOOR_AUTOTILE_TABLE = [');
    return JSON.parse(src.slice(src.indexOf('[', start), src.indexOf('];', start) + 1));
})();
const T = 16;

// ---- a synthetic chipset where every pixel names its own position -----------
function syntheticChipset() {
    const img = K.blank(480, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 480; x++) {
        const i = (y * 480 + x) * 4;
        img.data[i] = x & 255; img.data[i + 1] = y & 255; img.data[i + 2] = (x >> 8) * 16 + (y >> 8); img.data[i + 3] = 255;
    }
    return img;
}
const px = (img, x, y) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const srcXY = (img, x, y) => { const p = px(img, x, y); return [p[0] + (p[2] >> 4) * 256, p[1] + (p[2] & 15) * 256]; };

test('the 2003 variant numbering is MZ shape numbering: same quadrant roles for all 47', () => {
    // role of each quadrant of a 2003 block tile, by tile position, then by quadrant
    const role2k = { '0,0': ['solo', 'solo', 'solo', 'solo'], '2,0': ['iTL', 'iTR', 'iBL', 'iBR'],
        '0,1': ['cTL', 'T', 'L', 'C'], '1,1': ['T', 'T', 'C', 'C'], '2,1': ['T', 'cTR', 'C', 'R'],
        '0,2': ['L', 'C', 'L', 'C'], '1,2': ['C', 'C', 'C', 'C'], '2,2': ['C', 'R', 'C', 'R'],
        '0,3': ['L', 'C', 'cBL', 'B'], '1,3': ['C', 'C', 'B', 'B'], '2,3': ['C', 'R', 'B', 'cBR'] };
    const roleMZ = { '0,0': ['solo', 'solo', 'solo', 'solo'], '1,0': ['iTL', 'iTR', 'iBL', 'iBR'],
        '0,1': ['cTL', 'T', 'L', 'C'], '1,1': ['T', 'cTR', 'C', 'R'], '0,2': ['L', 'C', 'cBL', 'B'], '1,2': ['C', 'R', 'B', 'cBR'] };
    for (let v = 0; v < 50; v++) {
        const shape = K.shapeOf(v);
        const rolesA = [0, 1, 2, 3].map(q => { const [x, y] = BLOCK_D[v][q >> 1][q & 1]; return role2k[`${x},${y}`][q]; });
        const rolesB = [0, 1, 2, 3].map(q => { const [qsx, qsy] = FLOOR[shape][q]; return roleMZ[`${qsx >> 1},${qsy >> 1}`][(qsy & 1) * 2 + (qsx & 1)]; });
        assert.deepEqual(rolesA, rolesB, `variant ${v} → shape ${shape}`);
    }
});

test('a chipset is cut into MZ sheets tile for tile', () => {
    const chip = syntheticChipset();
    const { A1, A2, B, C } = K.chipsetToSheets(chip);
    assert.deepEqual([A1.width, A1.height, A2.width, A2.height, B.width, B.height, C.width, C.height], [256, 192, 256, 192, 256, 256, 256, 256]);
    // lower tile 0 → B slot 1 (id 0 would draw nothing), lower 96 → the second panel, upper 0 → C slot 0, upper 48 → the third panel
    assert.deepEqual(srcXY(B, 1 * T, 0), [12 * T, 0]);
    assert.deepEqual(srcXY(B, (96 + 1) % 8 * T, Math.floor((96 + 1) / 8) * T), [18 * T, 0]);
    assert.deepEqual(srcXY(C, 0, 0), [18 * T, 8 * T]);
    assert.deepEqual(srcXY(C, 0, 6 * T), [24 * T, 0]);
    // terrain block 5 (at chipset columns 9-11, rows 0-3) → kind 5: solo, inner corners, and a box tile whose quadrants come from corner, edge, edge, centre
    assert.deepEqual(srcXY(A2, 10 * T, 0), [9 * T, 0]);
    assert.deepEqual(srcXY(A2, 11 * T, 0), [11 * T, 0]);
    assert.deepEqual(srcXY(A2, 10 * T, 1 * T), [9 * T, 1 * T]);            // TL quadrant of TL tile: the corner tile
    assert.deepEqual(srcXY(A2, 10 * T + 8, 1 * T), [10 * T + 8, 1 * T]);    // TR quadrant: the top-edge tile
    assert.deepEqual(srcXY(A2, 10 * T, 1 * T + 8), [9 * T, 2 * T + 8]);     // BL quadrant: the left-edge tile
    assert.deepEqual(srcXY(A2, 10 * T + 8, 1 * T + 8), [10 * T + 8, 2 * T + 8]); // BR quadrant: the centre tile
    // its corner-faithful twin, kind 17 (column 1 of the third block row), takes the corner tile whole
    const [kx, ky] = [(17 % 8) * 2, Math.floor(17 / 8) * 3];
    assert.deepEqual(srcXY(A2, kx * T + 8, (ky + 1) * T + 8), [9 * T + 8, 1 * T + 8]);
    // water A frame 1 → kind 0 at block column 2: inner corners from row 3, box TL quadrant from row 0, solo from row 4
    assert.deepEqual(srcXY(A1, 3 * T, 0), [1 * T, 3 * T]);
    assert.deepEqual(srcXY(A1, 2 * T, 1 * T), [1 * T, 0]);
    assert.deepEqual(srcXY(A1, 2 * T, 0), [1 * T, 4 * T]);
    // water C frame 0 → kind 4 at block column 8, solo from row 7
    assert.deepEqual(srcXY(A1, 8 * T, 0), [0, 7 * T]);
    // the animated tiles' first frames follow the lower tiles in B
    const [ac, ar] = K.bcPos(K.ANIMATED_B_INDEX);
    assert.deepEqual(srcXY(B, ac * T, ar * T), [3 * T, 4 * T]);
});

test('map layers become six MZ layers with the right ids', () => {
    const map = { width: 3, height: 1, lower_layer: [4000 + 2 * 50 + 34, 5000 + 7, 2000 + 5 * 50 + 3], upper_layer: [10000, 10005, 10000] };
    const { data, notes } = K.mapData(map);
    assert.equal(data.length, 18);
    assert.equal(data[0], 2816 + (12 + 2) * 48 + 34, 'corner variant → corner-faithful kind');
    assert.equal(data[1], 0); assert.equal(data[3 + 1], K.LOWER_B_OFFSET + 7);
    assert.equal(data[2], 2048 + 4 * 48 + 3, 'water C → kind 4'); assert.equal(notes.waterMix, 1);
    assert.deepEqual(data.slice(6, 9), [0, 256 + 5, 0]);
    assert.equal(K.lowerTile(4000 + 49).z0, 2816 + 47, 'solo variant → shape 47');
    assert.equal(K.lowerTile(4000 + 47).z0, 2816 + 0, 'duplicate centre → shape 0');
    assert.equal(K.lowerTile(3050).z1, K.ANIMATED_B_INDEX + 1);
});

test('passability flips from passable-bits to impassable-bits and carries star, counter, bush and damage', () => {
    assert.equal(K.mzFlag(0x0f, null), 0);
    assert.equal(K.mzFlag(0x00, null), 0x0f);
    assert.equal(K.mzFlag(0x1f, null), 0x10);
    assert.equal(K.mzFlag(0x4f, null), 0x80);
    assert.equal(K.mzFlag(0x0f, { bush_depth: 8, damage: 5 }), 0x140);
    const chipset = { passable_data_lower: new Array(162).fill(0x0f), passable_data_upper: new Array(144).fill(0x1f), terrain_data: new Array(162).fill(1) };
    chipset.passable_data_lower[18 + 3] = 0x00; chipset.passable_data_lower[6 + 1] = 0x00;
    const flags = K.tilesetFlags(chipset, [null, { bush_depth: 0, damage: 0 }]);
    assert.equal(flags.length, 8192);
    assert.equal(flags[K.LOWER_B_OFFSET + 3], 0x0f);
    assert.equal(flags[2816 + 1 * 48 + 20], 0x0f);
    assert.equal(flags[2816 + (12 + 1) * 48 + 20], 0x0f, 'the corner-faithful twin blocks the same way');
    assert.equal(flags[256 + 9], 0x10, 'upper tiles marked above the hero are stars');
});

test('character sheets reorder rows into MZ order and gain the object prefix', () => {
    const img = K.blank(288, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 288; x++) { const i = (y * 288 + x) * 4; img.data[i] = Math.floor(y / 32); img.data[i + 3] = 255; }
    const out = K.reorderCharset(img);
    assert.deepEqual([0, 1, 2, 3].map(r => px(out, 0, r * 32)[0]), [2, 3, 1, 0], 'down, left, right, up');
    assert.deepEqual([0, 1, 2, 3].map(r => px(out, 0, 128 + r * 32)[0]), [6, 7, 5, 4]);
    assert.equal(K.charsetName('$Solvac'), '!Solvac');
    assert.equal(K.charsetName('!Raven Chara!'), '!Raven Chara!');
    assert.equal(K.charsetName('Ramirez'), '!Ramirez');
});

test('System.json takes the 2003 framework and the game’s own start, party, title and sounds', () => {
    const base = { gameTitle: 'x', advanced: { screenWidth: 1280, screenHeight: 720, uiAreaWidth: 1280, uiAreaHeight: 720, fontSize: 26 }, sounds: new Array(24).fill(null).map(() => ({ name: 'stock', pan: 0, pitch: 100, volume: 90 })), switches: [], variables: [] };
    const db = { system: { party: [1, 3, 0], title_name: 'Titel', title_music: { name: 'Theme.ogg', volume: 80, tempo: 100, balance: 60 }, cursor_se: { name: 'cur', volume: 100, tempo: 100, balance: 50 } }, switches: [null, { name: 'A' }, null], variables: [null, { name: 'V' }] };
    const out = K.systemJson(base, db, { start: { party_map_id: 3, party_x: 7, party_y: 10 } }, { RPG_RT: { GameTitle: 'Deep 8' } });
    assert.equal(out.gameTitle, 'Deep 8');
    assert.deepEqual([out.tileSize, out.faceSize, out.iconSize], [16, 48, 32], 'icons stay 32 px: the stock sheet stands in for 2003, which had none');
    assert.deepEqual([out.advanced.screenWidth, out.advanced.screenHeight, out.advanced.uiAreaWidth, out.advanced.uiAreaHeight, out.advanced.picturesUpperLimit], [320, 240, 320, 240, 500]);
    assert.deepEqual([out.startMapId, out.startX, out.startY], [3, 7, 10]);
    assert.deepEqual(out.partyMembers, [1, 3]);
    assert.equal(out.title1Name, 'Titel');
    assert.equal(out.rrSkipTitle, false);
    const hidden = K.systemJson(base, { system: { show_title: false, title_name: 'Titel' }, switches: [], variables: [] }, { start: {} }, {});
    assert.deepEqual([hidden.rrSkipTitle, hidden.title1Name], [true, ''], 'a hidden 2003 title screen means no title image and a boot straight into the game');
    assert.deepEqual(out.titleBgm, { name: 'Theme', pan: 20, pitch: 100, volume: 80 });
    assert.equal(out.sounds[0].name, 'cur'); assert.equal(out.sounds[1].name, 'stock');
    assert.deepEqual(out.switches, ['', 'A', '']); assert.deepEqual(out.variables, ['', 'V']);
});

test('an event page keeps its graphic, movement and conditions', () => {
    const notes = {};
    const page = K.eventPage({ condition: { flags: 0x05, switch_a_id: 12, variable_id: 3, variable_value: 4, compare_operator: 1 }, character_name: '$Guy', character_index: 5, character_direction: 1, character_pattern: 2, move_type: 4, move_speed: 5, move_frequency: 8, trigger: 3, layer: 1, animation_type: 3 }, notes);
    assert.deepEqual(page.image, { characterIndex: 5, characterName: '!Guy', direction: 6, pattern: 2, tileId: 0 });
    assert.deepEqual([page.conditions.switch1Valid, page.conditions.switch1Id, page.conditions.variableValid, page.conditions.variableValue, page.conditions.switch2Valid], [true, 12, true, 4, false]);
    assert.deepEqual([page.moveType, page.moveSpeed, page.moveFrequency, page.trigger, page.priorityType], [2, 5, 5, 3, 1]);
    assert.deepEqual([page.directionFix, page.stepAnime, page.walkAnime], [true, true, true]);
    assert.deepEqual(notes, {});
    K.eventPage({ condition: { flags: 0x24, compare_operator: 0 }, move_type: 5 }, notes);
    assert.deepEqual(notes, { moveType: 1, timerCondition: 1, variableOperator: 1 });
});

// ---- the corpus oracle: Deep 8 drawn both ways -----------------------------
const deep8 = path.resolve(__dirname, '..', '..', 'template', 'DEEP 8');
let PNG = null;
try { ({ PNG } = require('pngjs')); } catch (_) { /* reported by the skip */ }

function decode(file, key) {
    const bytes = fs.readFileSync(file);
    const png = PNG.sync.read(bytes);
    const img = { width: png.width, height: png.height, data: new Uint8Array(png.data) };
    if (key) {
        let pos = 8;
        while (pos + 8 <= bytes.length) {
            const len = bytes.readUInt32BE(pos), type = bytes.toString('latin1', pos + 4, pos + 8);
            if (type === 'PLTE') { K.keyColour(img, bytes[pos + 8], bytes[pos + 9], bytes[pos + 10]); break; }
            if (type === 'IDAT') break;
            pos += 12 + len;
        }
    }
    return img;
}
const quadCopy = (dst, src, sx, sy, dx, dy) => K.blit(dst, src, sx, sy, 8, 8, dx, dy);

/** A map's lower layer drawn by EasyRPG's rules from the chipset, frame 0. */
function draw2k(map, chip) {
    const w = map.width, h = map.height, out = K.blank(w * T, h * T), classes = [];
    map.lower_layer.forEach((id, i) => {
        const x = (i % w) * T, y = Math.floor(i / w) * T;
        let cls = 'plain';
        if (id < 3000) {
            const block = Math.floor(id / 1000), b = Math.floor((id % 1000) / 50), a = id % 1000 - b * 50;
            cls = b ? 'waterMix' : 'water';
            for (let q = 0; q < 4; q++) {
                const j = q >> 1, k = q & 1;
                let col, row;
                if (BLOCK_A[a][j][k] === -1) { let t = (b >> (j * 2 + k)) & 1; if (block === 2) t ^= 3; col = 0; row = 4 + t; }
                else { col = block === 1 ? 3 : 0; row = BLOCK_A[a][j][k]; }
                if (b !== 0 && a !== 0) { let t = (b >> (j * 2 + k)) & 1; if (block === 2) t *= 2; if (t) { col = 0; row = 4 + t; } }
                quadCopy(out, chip, col * T + k * 8, row * T + j * 8, x + k * 8, y + j * 8);
            }
        } else if (id < 4000) { cls = 'animated'; K.tile(out, chip, 3 + Math.floor((id - 3000) / 50), 4, x / T, y / T); }
        else if (id < 5000) {
            cls = 'terrain';
            const block = Math.floor((id - 4000) / 50), sub = id - 4000 - block * 50, [bx, by] = K.blockPos(block);
            for (let q = 0; q < 4; q++) { const [tx, ty] = BLOCK_D[sub][q >> 1][q & 1]; quadCopy(out, chip, (bx + tx) * T + (q & 1) * 8, (by + ty) * T + (q >> 1) * 8, x + (q & 1) * 8, y + (q >> 1) * 8); }
        } else if (id < 5144) { const [c, r] = K.lowerPos(id - 5000); K.tile(out, chip, c, r, x / T, y / T); }
        classes.push(cls);
    });
    return { out, classes };
}

/** The same map drawn by MZ's rules from converted sheets and data. */
function drawMZ(data, w, h, sheets) {
    const out = K.blank(w * T, h * T);
    const draw = (id, x, y) => {
        if (!id) return;
        if (id >= 2048) {
            let kind = Math.floor((id - 2048) / 48), shape = (id - 2048) % 48, sheet, bx, by;
            if (id >= 2816) { sheet = sheets.A2; kind -= 16; bx = (kind % 8) * 2; by = Math.floor(kind / 8) * 3; }
            else { sheet = sheets.A1; [bx, by] = kind === 0 ? [0, 0] : kind === 1 ? [0, 3] : [8, 0]; }
            FLOOR[shape].forEach(([qsx, qsy], q) => quadCopy(out, sheet, (bx * 2 + qsx) * 8, (by * 2 + qsy) * 8, x + (q & 1) * 8, y + (q >> 1) * 8));
        } else { const [c, r] = K.bcPos(id % 256); K.tile(out, id < 256 ? sheets.B : sheets.C, c, r, x / T, y / T); }
    };
    const n = w * h;
    for (let i = 0; i < n; i++) { const x = (i % w) * T, y = Math.floor(i / w) * T; draw(data[i], x, y); draw(data[n + i], x, y); }
    return out;
}

test('Deep 8 maps drawn by the 2003 rules and by MZ’s rules agree, tile for tile', { skip: !PNG || !fs.existsSync(path.join(deep8, 'RPG_RT.ldb')) }, () => {
    const files = { read: (n) => (fs.existsSync(path.join(deep8, n)) ? fs.readFileSync(path.join(deep8, n)) : null), list: () => [] };
    const project = L.readProject(files);
    const results = [];
    for (const id of [3, 8, 12, 13, 14, 139]) {
        const map = project.maps[id];
        const chipset = project.database.chipsets[map.chipset_id];
        const file = fs.readdirSync(path.join(deep8, 'ChipSet')).find(f => f.toLowerCase() === (chipset.chipset_name + '.png').toLowerCase());
        const chip = decode(path.join(deep8, 'ChipSet', file), true);
        const sheets = K.chipsetToSheets(chip);
        const { data } = K.mapData(map);
        const a = draw2k(map, chip), b = drawMZ(data, map.width, map.height, sheets);
        let differ = 0, comparable = 0;
        for (let i = 0; i < map.width * map.height; i++) {
            if (a.classes[i] === 'waterMix') continue; // two water types in one tile: MZ has no such tile
            if (a.classes[i] === 'terrain') { const v = (map.lower_layer[i] - 4000) % 50; if (v >= 16 && v <= 31) continue; } // edge halves next to the centre: the artist's, not the format's
            comparable++;
            const x = (i % map.width) * T, y = Math.floor(i / map.width) * T;
            let same = true;
            for (let yy = 0; yy < T && same; yy++) for (let xx = 0; xx < T; xx++) {
                const p = ((y + yy) * a.out.width + x + xx) * 4;
                const ta = a.out.data[p + 3], tb = b.data[p + 3];
                if (ta !== tb || (ta && (a.out.data[p] !== b.data[p] || a.out.data[p + 1] !== b.data[p + 1] || a.out.data[p + 2] !== b.data[p + 2]))) { same = false; break; }
            }
            if (!same) differ++;
        }
        results.push({ id, comparable, differ });
    }
    for (const r of results) assert.equal(r.differ, 0, `map ${r.id}: ${r.differ} of ${r.comparable} comparable tiles differ`);
    assert.ok(results.reduce((n, r) => n + r.comparable, 0) > 30000, 'the oracle covered a real number of tiles');
});
