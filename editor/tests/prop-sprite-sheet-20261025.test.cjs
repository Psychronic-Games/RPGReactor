'use strict';
// Forge › 3D Prop Builder › Export Sprite Sheet: 1, 4 or 8 directions, the
// prop's loop over N frames, `!$Name[1D][8F]` / `!$Name[4F]` / `!$Name[8D][6F]`,
// and [1D] sheets (one row, shown whichever way the event faces) cut alike by
// the game and the editor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..', '..');
const src = path.join(repo, 'editor', 'src');
require(path.join(src, 'forge', 'Character3D', 'CharacterSpriteSheet.js'));
const A = require(path.join(src, 'utils', 'AssetFiles.js'));
const P = require(path.join(src, 'forge', 'Props', 'PropSpriteSheet.js'));
const read = file => fs.readFileSync(path.join(repo, 'runtime', file), 'utf8');
const at = (cells, col, row) => cells.find(c => c.col === col && c.row === row);

test('a prop sheet is one object character ("!$") and always says its frame count', () => {
    assert.equal(P.fileName('Oak', 1, 8), '!$Oak[1D][8F].png');
    assert.equal(P.fileName('Oak', 4, 1), '!$Oak[1F].png');
    assert.equal(P.fileName('Crate', 4, 3), '!$Crate[3F].png', 'a prop\'s 3 frames are its loop, not MZ\'s step, stand, step');
    assert.equal(P.fileName('Windmill', 8, 6), '!$Windmill[8D][6F].png');
    assert.equal(P.fileName('Bad/[1D]name', 1, 2), '!$Bad1Dname[1D][2F].png', 'the name never carries its own sheet marks');
    assert.deepEqual(P.FRAME_CHOICES, [1, 2, 3, 4, 6, 8, 10, 12]);
    assert.deepEqual(P.DIRECTIONS, [1, 4, 8]);
    for (const name of ['!$Oak[1D][8F]', '!$Crate[3F]', '!$Windmill[8D][6F]']) {
        assert.equal(A.isBigCharacter(name), !name.includes('[8D]'), name);
        assert.equal(A.isObjectCharacter ? A.isObjectCharacter(name) : name.startsWith('!'), true, name);
    }
    assert.equal(A.characterFrameCount('!$Oak[1D][8F]', { rrMultiFrames: true }), 8);
    assert.equal(A.characterFrameCount('!$Windmill[8D][6F]', { rrMultiFrames: true }), 6);
});

test('the plan: the loop spread over the frames, turned to each direction', () => {
    const one = P.plan(1, 8);
    assert.deepEqual(P.grid(1, 8), { columns: 8, rows: 1 });
    assert.equal(one.length, 8);
    assert.deepEqual(one.map(c => c.u), [0, 1, 2, 3, 4, 5, 6, 7].map(i => i / 8), 'frame 7 leads back to frame 0');
    assert.ok(one.every(c => c.row === 0 && c.yaw === 0));

    const four = P.plan(4, 3);
    assert.deepEqual(P.grid(4, 3), { columns: 3, rows: 4 });
    assert.equal(four.length, 12);
    assert.deepEqual([0, 1, 2, 3].map(r => at(four, 0, r).dir), [2, 4, 6, 8]);
    assert.deepEqual([0, 1, 2, 3].map(r => at(four, 0, r).yaw), [0, -90, 90, 180]);

    const still = P.plan(4, 1);
    assert.equal(still.length, 4);
    assert.ok(still.every(c => c.u === 0 && c.col === 0));
});

test('8 directions: blocks 0 and 1 drawn, every other block the same frames', () => {
    const n = 6, cells = P.plan(8, n);
    assert.deepEqual(P.grid(8, n), { columns: 24, rows: 8 });
    assert.equal(cells.length, 8 * n, 'drawn once each');
    assert.deepEqual([0, 1, 2, 3].map(r => at(cells, 0, r).dir), [2, 4, 6, 8]);
    assert.deepEqual([0, 1, 2, 3].map(r => at(cells, n, r).dir), [1, 3, 7, 9]);
    // Every cell of the sheet is written: drawn or copied.
    const written = new Set();
    for (const c of cells) { written.add(c.col + ',' + c.row); for (const o of c.copies) written.add(o.col + ',' + o.row); }
    assert.equal(written.size, 24 * 8);
    // A cardinal frame goes to blocks 2, 4 and 6; a diagonal one to 3, 5 and 7, in the same place in its block.
    assert.deepEqual(at(cells, 2, 1).copies, [{ col: 12 + 2, row: 1 }, { col: 2, row: 5 }, { col: 12 + 2, row: 5 }]);
    assert.deepEqual(at(cells, n + 4, 3).copies, [{ col: 18 + 4, row: 3 }, { col: 6 + 4, row: 7 }, { col: 18 + 4, row: 7 }]);
});

test('the cell is as tall as the prop needs at the width that fits it', () => {
    // A tree reaching 1.1 either side of its trunk, 4.3 from its lowest point to its top: at the scale that fits
    // 48 across (44.16 px of room over 2.2), 86.3 px of tree in 95% of the cell, rounded up to 4s.
    const tree = [{ minX: -1, maxX: 1, minY: -0.2, maxY: 4 }, { minX: -1.1, maxX: 0.9, minY: -0.2, maxY: 4.1 }];
    const h = P.cellHeight(48, tree);
    assert.equal(h, 92);
    assert.equal(P.cellHeight(48, [{ minX: -1, maxX: 1, minY: 0, maxY: 0.5 }]), 48, 'never shorter than it is wide');
    assert.equal(P.cellHeight(48, [{ minX: -0.1, maxX: 0.1, minY: 0, maxY: 10 }]), 192, 'never more than four times as tall');
    // Fitted by the character sheet's rule, the tallest frame then just fits the cell and the base keeps one line.
    const S = globalThis.RRCharacterSpriteSheet, m = S.cellMetrics(48, h, true);
    const fitted = S.fit(tree.map(b => Object.assign({ kind: 'move' }, b)), m);
    assert.equal(fitted.anchors[0].y, fitted.anchors[1].y);
    assert.ok(4.1 * fitted.scale <= h);
});

// The game: [1D] beside the [NF] and [8D] cuts, as reactor_sprites.js stacks them.
function definition(source, head) {
    const start = source.indexOf(head);
    assert.ok(start >= 0, head);
    return source.slice(start, source.indexOf('\n};\n', start) + 4);
}

function load() {
    const sprites = read('reactor_sprites.js'), managers = read('reactor_managers.js'), core = read('reactor_core.js'), legacy = read('reactor_objects_legacy.js');
    const stock = ['updateCharacterFrame', 'characterBlockX', 'characterBlockY', 'characterPatternX', 'characterPatternY', 'patternWidth', 'patternHeight', 'setCharacterBitmap']
        .map(name => definition(sprites, `Sprite_Character.prototype.${name} = function`)).join('\n');
    const from = sprites.indexOf('const _rrMultiPatternWidth');
    const to = sprites.indexOf('\n};\n', sprites.indexOf('Sprite_Character.prototype.characterPatternY = function', sprites.indexOf('const _rr1DPatternY'))) + 4;
    const source = [
        definition(core, 'Utils.extractFileName = function'),
        definition(managers, 'ImageManager.isEightDirCharacter = function'),
        definition(managers, 'ImageManager.isOneDirCharacter = function'),
        definition(managers, 'ImageManager.isBigCharacter = function'),
        definition(legacy, 'Game_CharacterBase.rrFramesOf = function'),
        stock, sprites.slice(from, to)
    ].join('\n');
    const context = {
        Utils: {}, $dataSystem: { rrMultiFrames: true },
        // A [1D] "$" sheet: 8 frames of 48 × 96 in one row; without "$", eight such characters 4 × 2.
        ImageManager: { loadCharacter: name => (name.includes('$') ? { width: 48 * 8, height: 96 } : { width: 48 * 8 * 4, height: 96 * 2 }) },
        Sprite_Character: function() {}, Game_CharacterBase: function() {}, Game_Follower: function() {},
        $gamePlayer: { isDashing: () => false }, Math, Object, Number, String
    };
    vm.createContext(context);
    vm.runInContext('Sprite_Character.prototype.updateHalfBodySprites = function() {};\nSprite_Character.prototype.setFrame = function(x, y, w, h) { this.frame = [x, y, w, h]; };\n' + source, context);
    return context;
}

function frameOf(ctx, name, o = {}) {
    const sprite = new ctx.Sprite_Character();
    sprite._character = {
        _x: 5, _y: 5, _realX: 5, _realY: 5,
        characterIndex: () => o.index || 0, direction: () => o.direction || 2, pattern: () => o.pattern || 0,
        isMoving: () => false, isDashing: () => false, isDirectionFixed: () => false
    };
    sprite._characterName = name;
    sprite._bushDepth = 0;
    sprite.setCharacterBitmap();
    sprite.updateCharacterFrame();
    return Array.from(sprite.frame);
}

test('the game shows a [1D] sheet\'s one row whichever way the event faces', () => {
    const ctx = load();
    for (const direction of [2, 4, 6, 8]) {
        assert.deepEqual(frameOf(ctx, '!$Oak[1D][8F]', { direction, pattern: 5 }), [5 * 48, 0, 48, 96], 'facing ' + direction);
    }
    // Eight characters on one [1D] sheet: four across, two down, a row each.
    assert.deepEqual(frameOf(ctx, 'Lamps[1D][8F]', { index: 6, direction: 8, pattern: 2 }), [(2 * 8 + 2) * 48, 96, 48, 96]);
    assert.equal(ctx.ImageManager.isOneDirCharacter('!$Oak[1D][8F]'), true);
    assert.equal(ctx.ImageManager.isOneDirCharacter('!$Oak[8F]'), false);
});

test('the editor cuts a [1D] sheet the same way: one row a character', () => {
    assert.equal(A.isOneDirCharacter('!$Oak[1D][8F]'), true);
    assert.equal(A.isOneDirCharacter('img/characters/!$Oak[1d]'), true);
    assert.equal(A.isOneDirCharacter('!$Mill[8D][1D]'), false, '[8D] wins');
    assert.equal(A.characterRows('!$Oak[1D][8F]'), 1);
    assert.equal(A.characterRows('Actor1'), 4);
    global.RRAssetFiles = A;
    const Picker = require(path.join(src, 'event', 'CharacterGraphicPicker.js'));
    const layout = Picker.sheetLayout(48 * 8, 96, true, 8, 1);
    assert.equal(layout.rows, 1);
    assert.equal(layout.frameHeight, 96);
    assert.deepEqual(Picker.cellOf(layout, 0, 5, 8), { column: 5, row: 0 }, 'facing up is the one row');
    assert.equal(Picker.frameAt(layout, 3, 0).direction, 2);
    const many = Picker.sheetLayout(48 * 32, 192, false, 8, 1);
    assert.deepEqual(Picker.cellOf(many, 6, 2, 4), { column: 18, row: 1 });
    assert.equal(Picker.frameAt(many, 18, 1).characterIndex, 6);
    // A four-way sheet is cut as before.
    const stock = Picker.sheetLayout(144, 192, true);
    assert.equal(stock.rows, 4);
    assert.deepEqual(Picker.cellOf(stock, 0, 1, 8), { column: 1, row: 3 });
});

test('a prop turns about the middle of what it stands on, not of its whole box', () => {
    // A chest 1 × 1 at the base with its lid open behind it, reaching 1.2 further back up top.
    const base = { positions: [-0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0.6, 0.5] }, lid = { positions: [-0.5, 0.6, -0.5, 0.5, 1.4, -1.7] };
    assert.deepEqual(P.footprint([base, lid], 0, 1.4), { x: 0, z: 0 });
    assert.deepEqual(P.footprint([], 0, 1), { x: 0, z: 0 });
});

test('the cell is a tile wide until one is chosen', () => {
    const saved = globalThis.reactor;
    try {
        globalThis.reactor = { databaseManager: { data: { system: { tileSize: 32 } } } };
        assert.equal(P.defaultWidth(), 32);
        globalThis.reactor = { databaseManager: { data: { system: {} } } };
        assert.equal(P.defaultWidth(), 48);
        globalThis.reactor = undefined;
        assert.equal(P.defaultWidth(), 48);
    } finally { globalThis.reactor = saved; }
});

test('at the character sheets\' scale a prop is as big beside a character as in the world', () => {
    const S = globalThis.RRCharacterSpriteSheet, ppm = S.pixelsPerMeter(48);
    // A 1.68 m character fills the 48 px cell's room (44 px): about 26 px a metre.
    assert.ok(Math.abs(ppm - 44 / 1.68) < 1e-9);
    const m32 = S.cellMetrics(32, 32, true);
    assert.equal(S.pixelsPerMeter(32), (m32.baseline - m32.top) / 1.68, 'a smaller tile, a smaller scale');
    // An 8 m oak, 4.2 m across: several tiles tall and wide; a chest about a tile or less.
    const oak = P.matchSize([{ minX: -2, maxX: 2.2, minY: -0.5, maxY: 8 }], ppm, true);
    assert.deepEqual([oak.w, oak.h, oak.shrunk], [128, 240, 1]);
    assert.ok(oak.h - oak.anchor.y < 0.1 * oak.h, 'the base stands near the bottom line');
    const chest = P.matchSize([{ minX: -0.5, maxX: 0.5, minY: -0.3, maxY: 0.6 }], ppm, true);
    assert.ok(chest.w <= 48 && chest.h <= 48);
    // A tower 60 m across: drawn smaller to keep the frame within the limit, and said so.
    const tower = P.matchSize([{ minX: -30, maxX: 30, minY: 0, maxY: 50 }], ppm, true);
    assert.ok(tower.w <= P.MAX_FRAME && tower.h <= P.MAX_FRAME);
    assert.ok(tower.shrunk < 1);
});

test('the panel\'s size comes from the prop at rest, turned to each direction about its footprint', () => {
    // A 2 × 1 box, 1 tall: wider facing down than facing left.
    const box = { positions: [-1, 0, -0.5, 1, 0, 0.5, -1, 1, 0.5, 1, 1, -0.5] };
    const [down, left] = P.restBounds([box], 4, 0);
    assert.ok(Math.abs(down.maxX - 1) < 1e-9 && Math.abs(left.maxX - 0.5) < 1e-9);
    assert.equal(P.restBounds([box], 1, 30).length, 1);
    assert.equal(P.restBounds([box], 8, 30).length, 8);
});

test('the width the user sets, in tiles: the cell that wide, the height following the prop', () => {
    const S = globalThis.RRCharacterSpriteSheet, ppm = S.pixelsPerMeter(48);
    const oak = [{ minX: -2, maxX: 2.2, minY: -0.5, maxY: 8 }];
    // Its own width beside characters: 128 px, 2.75 tiles to a quarter; at most what keeps both sides within the limit.
    assert.deepEqual(P.widthTiles(oak, true, 48), { atScale: 2.75, most: 11.25 });
    // Three tiles: a 144 px cell, the scale filling it, as tall as the oak then needs, its base on the bottom line.
    const three = P.matchSize(oak, ppm, true, 144);
    assert.equal(three.w, 144);
    assert.ok(three.scale > ppm && three.h > 240 && three.h % 4 === 0);
    const m = S.cellMetrics(144, three.h, true);
    assert.ok(8.5 * three.scale <= m.baseline - m.top + 1e-9);
    assert.equal(three.anchor.y, m.baseline - 0.5 * three.scale);
    // Smaller than characters is fine too.
    assert.equal(P.matchSize(oak, ppm, true, 48).w, 48);
    // A width whose height would pass the limit comes down, and says so.
    const tall = P.matchSize([{ minX: -0.5, maxX: 0.5, minY: 0, maxY: 20 }], ppm, true, 480);
    assert.ok(tall.h <= P.MAX_FRAME && tall.shrunk < 1);
    // A chest stays about its own size, a quarter tile at the least.
    assert.equal(P.widthTiles([{ minX: -0.1, maxX: 0.1, minY: 0, maxY: 0.2 }], true, 48).atScale, 0.25);
});
