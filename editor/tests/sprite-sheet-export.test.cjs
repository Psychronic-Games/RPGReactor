'use strict';
// Forge › 3D Character Builder › Export sprite sheet: the layouts, the cell
// math, the feet baseline, the face sheet's eye line and the pixel helpers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repo = path.resolve(__dirname, '..', '..');
const S = require(path.join(repo, 'editor', 'src', 'forge', 'Character3D', 'CharacterSpriteSheet.js'));
const SAMPLE = path.join(repo, 'template', 'Demo', 'img', 'characters', '$8D actor 2-4[8D].png');

const at = (cells, col, row) => cells.find(c => c.col === col && c.row === row);

test('each layout is the sheet the game cuts', () => {
    const size = id => { const l = S.layout(id); return [l.columns * l.frame, l.rows * l.frame, l.folder]; };
    assert.deepEqual(size('8d'), [1200, 800, 'characters']);
    assert.deepEqual(size('mz'), [144, 192, 'characters']);
    assert.deepEqual(size('sv'), [576, 384, 'sv_actors']);
    assert.deepEqual(size('face'), [576, 288, 'faces']);
    assert.equal(S.fileName('8d', 'Villager'), '$Villager[8D].png');
    assert.equal(S.fileName('mz', 'Villager'), '$Villager.png');
    assert.equal(S.fileName('sv', 'Villager'), 'Villager.png');
    assert.equal(S.fileName('face', 'Villager'), 'Villager.png');
    assert.equal(S.fileName('8d', '$Bad[8D]/name!'), '$Bad8Dname[8D].png', 'the name never carries its own sheet marks');
});

test('the [8D] plan fills every frame once, blocks and rows in the sample\'s order', () => {
    const cells = S.plan('8d');
    assert.equal(cells.length, 96);
    assert.equal(new Set(cells.map(c => c.col + ',' + c.row)).size, 96);
    for (const c of cells) assert.ok(c.col >= 0 && c.col < 12 && c.row >= 0 && c.row < 8);
    // Block origins: 4 across, 2 down, 3 × 4 frames each.
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(b => S.blockOrigin(b)), [
        { col: 0, row: 0 }, { col: 3, row: 0 }, { col: 6, row: 0 }, { col: 9, row: 0 },
        { col: 0, row: 4 }, { col: 3, row: 4 }, { col: 6, row: 4 }, { col: 9, row: 4 }]);
    const dirs = (col, row0) => [0, 1, 2, 3].map(r => at(cells, col, row0 + r).dir);
    assert.deepEqual(dirs(0, 0), [2, 4, 6, 8], 'walk: down, left, right, up');
    assert.deepEqual(dirs(3, 0), [1, 3, 7, 9], 'walk diagonals: down-left, down-right, up-left, up-right');
    assert.deepEqual(dirs(6, 0), [2, 4, 6, 8], 'dash');
    assert.deepEqual(dirs(9, 0), [1, 3, 7, 9], 'dash diagonals');
    assert.deepEqual(dirs(0, 4), [2, 4, 6, 8], 'carry');
    assert.deepEqual(dirs(3, 4), [1, 3, 7, 9], 'carry diagonals');
    // A walk row is MZ's three frames: a step, standing, the other step.
    assert.deepEqual([0, 1, 2].map(c => [at(cells, c, 0).clip, at(cells, c, 0).at]), [['walk', 'stepA'], ['idle', 0], ['walk', 'stepB']]);
    assert.deepEqual([6, 7, 8].map(c => at(cells, c, 1).clip), ['run', 'run', 'run']);
    assert.equal(at(cells, 1, 5).upper, 'lift');
    // The turn faces each way: 0 faces the camera, left is -90.
    assert.equal(at(cells, 0, 1).yaw, -90);
    assert.equal(at(cells, 3, 0).yaw, -45);
    assert.equal(at(cells, 3, 3).yaw, 135);
    assert.equal(at(cells, 6, 7).clip, 'attack');
    assert.deepEqual([9, 10, 11].map(c => at(cells, c, 7).clip), ['hit', 'dead', 'dead']);
});

test('a plain 4-direction sheet is the walk block alone', () => {
    const cells = S.plan('mz');
    assert.equal(cells.length, 12);
    assert.deepEqual([0, 1, 2, 3].map(r => at(cells, 1, r).dir), [2, 4, 6, 8]);
});

test('the side-view plan follows Sprite_Actor.MOTIONS and its cell formula', () => {
    const source = fs.readFileSync(path.join(repo, 'runtime', 'reactor_sprites.js'), 'utf8');
    const block = /Sprite_Actor\.MOTIONS = \{([\s\S]*?)\n\};/.exec(source)[1];
    const motions = Array.from(block.matchAll(/(\w+): \{ index: (\d+), loop: (true|false) \}/g), m => [m[1], Number(m[2]), m[3] === 'true']);
    assert.equal(motions.length, 18);
    motions.forEach(([name, index, loop]) => assert.deepEqual(S.SV_MOTIONS[index], [name, loop], name));
    assert.deepEqual(S.SV_MOTIONS.map(m => m[0]), ['walk', 'wait', 'chant', 'guard', 'damage', 'evade', 'thrust', 'swing', 'missile', 'skill', 'spell', 'item', 'escape', 'victory', 'dying', 'abnormal', 'sleep', 'dead']);
    const cells = S.plan('sv');
    assert.equal(cells.length, 54);
    assert.equal(new Set(cells.map(c => c.col + ',' + c.row)).size, 54);
    // Sprite_Actor.updateFrame: cx = floor(index / 6) * 3 + pattern, cy = index % 6.
    motions.forEach(([name, index]) => {
        for (let pattern = 0; pattern < 3; pattern++) {
            const cell = at(cells, Math.floor(index / 6) * 3 + pattern, index % 6);
            assert.equal(cell.motion, name, `${name} frame ${pattern}`);
        }
    });
    assert.equal(at(cells, 0, 1).clip, 'idle', 'wait is Idle');
    assert.equal(at(cells, 0, 0).clip, 'walk');
    assert.ok(at(cells, 0, 0).yaw < -45 && at(cells, 0, 0).yaw > -90, 'the actor faces left, turned a little toward the viewer');
    assert.ok(at(cells, 6, 0).yaw > 90, 'escape runs off to the right');
    // A looping motion goes out and back over its three frames (MZ plays 0, 1, 2, 1).
    const wait = [0, 1, 2].map(c => at(cells, c, 1).at);
    assert.deepEqual(wait, [0, 0.25, 0.5]);
    assert.equal(at(cells, 3, 1).motion, 'swing');
    // A one-time motion runs up to its key pose and past it; a held one stays about its key pose.
    assert.deepEqual([3, 4, 5].map(c => at(cells, c, 1).at), ['rise', 'key', 'after']);
    assert.deepEqual([0, 1, 2].map(c => at(cells, c, 2).at), ['keyBefore', 'key', 'keyAfter'], 'chant');
    assert.equal(at(cells, 6, 5).motion, 'dead');
});

test('clips resolve to the first one the character has, else Idle', () => {
    const has = new Set(['walk', 'run', 'fight', 'armsUp', 'lieBack', 'kneel']);
    const pick = name => S.resolveClip(name, id => has.has(id));
    assert.equal(pick('attack'), 'fight');
    assert.equal(pick('cast'), 'armsUp');
    assert.equal(pick('dead'), 'lieBack');
    assert.equal(pick('missile'), 'idle');
    assert.equal(pick('idle'), 'idle');
});

test('one scale for the sheet; feet on the baseline; every frame inside its cell', () => {
    for (const size of [48, 64, 100, 144]) {
        for (const outline of [false, true]) {
            const m = S.cellMetrics(size, size, outline);
            const bounds = [
                { kind: 'move', minX: -0.28, maxX: 0.3, minY: -0.04, maxY: 1.62 },
                { kind: 'move', minX: -0.4, maxX: 0.22, minY: -0.06, maxY: 1.58 },
                { kind: 'pose', minX: -0.95, maxX: 0.8, minY: 0, maxY: 0.32 },
                { kind: 'pose', minX: -0.3, maxX: 0.3, minY: 0.45, maxY: 2.1 },
                { kind: 'pose', minX: -0.2, maxX: 1.1, minY: -0.02, maxY: 1.5 }
            ];
            const { scale, anchors } = S.fit(bounds, m);
            bounds.forEach((b, i) => {
                const a = anchors[i];
                const left = a.x + b.minX * scale, right = a.x + b.maxX * scale, top = a.y - b.maxY * scale, bottom = a.y - b.minY * scale;
                assert.ok(left >= m.side - 1e-6 && right <= size - m.side + 1e-6, `${size} frame ${i} across: ${left}..${right}`);
                assert.ok(top >= m.top - 1e-6 && bottom <= size + 1e-6, `${size} frame ${i} down: ${top}..${bottom}`);
                if (b.kind === 'move') {
                    assert.equal(a.y, anchors[0].y, 'every step stands on one line');
                    assert.equal(a.x, size / 2, 'a step is centered on its feet');
                }
            });
            const lowest = Math.max(...bounds.map((b, i) => (b.kind === 'move' ? anchors[i].y - b.minY * scale : -Infinity)));
            assert.ok(Math.abs(lowest - m.baseline) < 1e-9, 'the lowest foot of the steps is on the baseline');
            assert.ok(Math.abs(anchors[2].y - bounds[2].minY * scale - m.baseline) < 1e-9 || anchors[2].y === anchors[0].y, 'a pose lying on the floor stands on the baseline');
            assert.ok(Math.abs(anchors[3].y - bounds[3].minY * scale - m.baseline) < 1e-9, 'a jump is drawn standing on the baseline');
            // The camera's frustum puts the anchor on its pixel.
            const f = S.frustum(anchors[0], scale, size, size);
            assert.ok(Math.abs((0 - f.left) / (f.right - f.left) * size - anchors[0].x) < 1e-6);
            assert.ok(Math.abs((f.top - 0) / (f.top - f.bottom) * size - anchors[0].y) < 1e-6);
        }
    }
});

test('the baseline is the sample sheet\'s: its standing frames end on it', () => {
    const { PNG } = require(path.join(repo, 'editor', 'node_modules', 'pngjs'));
    const png = PNG.sync.read(fs.readFileSync(SAMPLE));
    assert.equal(png.width, 1200); assert.equal(png.height, 800);
    const m = S.cellMetrics(100, 100, true);
    for (const row of [0, 1, 2, 3]) {
        const b = S.alphaBounds(png.data, png.width, 100, 100, 1, row);
        // The sample's outline is the lowest row; ours lies one pixel under the feet.
        assert.ok(Math.abs(b.maxY - (m.baseline + 1)) <= 1, `row ${row}: ${b.maxY} vs ${m.baseline + 1}`);
    }
});

test('portraits hold one eye line whatever the head does', () => {
    const m = S.cellMetrics(144, 144, false);
    for (const eye of [{ x: 0, y: 1.6 }, { x: 0.03, y: 1.58 }, { x: -0.05, y: 1.65 }]) {
        const f = S.fitFace(eye, m, 0.42);
        assert.ok(Math.abs(f.anchor.y - eye.y * f.scale - 144 * 0.42) < 1e-9, 'the eyes 42% down');
        assert.ok(Math.abs(f.anchor.x + eye.x * f.scale - 72) < 1e-9, 'the eyes centered');
        assert.equal(f.scale, 144 / 0.42);
    }
    const cells = S.plan('face', { view: 'three' });
    assert.equal(cells.length, 8);
    assert.deepEqual(cells.map(c => [c.col, c.row]), [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1]]);
    assert.ok(cells.every(c => c.yaw > 0));
    assert.ok(S.plan('face', { view: 'front' }).every(c => c.yaw === 0));
    assert.equal(S.plan('face', { expressions: ['happy'] })[1].expression, 'neutral', 'an empty cell is neutral');
    for (const p of S.FACE_PRESETS) assert.equal(p.expressions.length, 8, p.id);
    // The presets name expressions the builder makes.
    const X = require(path.join(repo, 'editor', 'src', 'forge', 'Character3D', 'CharacterExpressions.js'));
    const made = new Set(X.EXPRESSIONS.map(e => e.id));
    for (const p of X.SHEETS.concat(S.FACE_PRESETS)) for (const id of p.expressions) assert.ok(made.has(id), `${p.id}: ${id}`);
});

test('pixels: supersampled edges, outline, and cells kept to their place', () => {
    // 4 × 4 premultiplied: the left half opaque red, the right half empty -> one half-covered red pixel.
    const k = 4, src = new Uint8Array(k * k * 4);
    for (let y = 0; y < k; y++) for (let x = 0; x < 2; x++) src.set([255, 0, 0, 255], (y * k + x) * 4);
    assert.deepEqual(Array.from(S.downsample(src, k, k, k, false)), [255, 0, 0, 128]);
    // Rows read bottom-up are turned the right way up.
    const two = new Uint8Array(1 * 2 * 4); two.set([0, 0, 255, 255], 0);
    assert.deepEqual(Array.from(S.downsample(two, 1, 2, 1, true)), [0, 0, 0, 0, 0, 0, 255, 255]);
    // One opaque pixel gets a dark ring on its four sides; the corners stay clear.
    const w = 5, px = new Uint8ClampedArray(w * w * 4);
    px.set([200, 100, 50, 255], (2 * w + 2) * 4);
    S.outline(px, w, w);
    for (const [x, y] of [[1, 2], [3, 2], [2, 1], [2, 3]]) { const o = (y * w + x) * 4; assert.equal(px[o + 3], 255); assert.ok(px[o] < 80); }
    for (const [x, y] of [[1, 1], [3, 3]]) assert.equal(px[(y * w + x) * 4 + 3], 0);
    // The Smooth look's outline is a soft rim, never a ring of solid pixels: strongest beside the figure, fainter
    // on the corners, and nothing two pixels out. The figure's own pixel is left as it was.
    const soft = new Uint8ClampedArray(w * w * 4);
    soft.set([200, 100, 50, 255], (2 * w + 2) * 4);
    S.softOutline(soft, w, w);
    const alphaAt = (x, y) => soft[(y * w + x) * 4 + 3];
    assert.deepEqual(Array.from(soft.slice((2 * w + 2) * 4, (2 * w + 2) * 4 + 4)), [200, 100, 50, 255]);
    for (const [x, y] of [[1, 2], [3, 2], [2, 1], [2, 3]]) { assert.ok(alphaAt(x, y) > 100 && alphaAt(x, y) < 160, 'beside: ' + alphaAt(x, y)); assert.ok(soft[(y * w + x) * 4] < 80, 'dark'); }
    for (const [x, y] of [[1, 1], [3, 3]]) assert.ok(alphaAt(x, y) > 40 && alphaAt(x, y) < alphaAt(1, 2), 'corner: ' + alphaAt(x, y));
    assert.equal(alphaAt(0, 2), 0);
    // A half-covered edge pixel keeps its colour over the rim.
    const edge = new Uint8ClampedArray(3 * 1 * 4);
    edge.set([200, 100, 50, 255], 0); edge.set([200, 100, 50, 128], 4);
    S.softOutline(edge, 3, 1);
    assert.ok(edge[4 + 3] > 128 && edge[4 + 3] < 255 && edge[4] > 100, 'still mostly the figure\'s colour');
    // A cell lands at its frame and nowhere else.
    const sheet = new Uint8ClampedArray(3 * 2 * 4 * 4), cell = new Uint8ClampedArray(2 * 2 * 4).fill(255);
    S.blit(sheet, 6, cell, 2, 2, 1, 1);
    assert.deepEqual(S.alphaBounds(sheet, 6, 2, 2, 1, 1), { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    assert.equal(S.alphaBounds(sheet, 6, 2, 2, 0, 1), null);
    assert.equal(S.alphaBounds(sheet, 6, 2, 2, 2, 0), null);
});

test('the builder offers the export beside Save to Project, the page loads the module', () => {
    const builder = fs.readFileSync(path.join(repo, 'editor', 'src', 'forge', 'Character3D', 'Character3DBuilder.js'), 'utf8');
    assert.match(builder, /rr-c3d-sheet[\s\S]*?rr-c3d-save/);
    assert.match(builder, /RRCharacterSpriteSheet\.openPanel\(this\)/);
    const page = fs.readFileSync(path.join(repo, 'editor', 'index.html'), 'utf8');
    assert.ok(page.indexOf('Character3D/CharacterSpriteSheet.js') > page.indexOf('Character3D/Character3DBuilder.js'));
});

test('RPG chibi draws a copy with a big head and short limbs; the recipe is left as it was', () => {
    const recipe = { headSize: 1, shapes: { legLength: 0.4, handSize: 2.8 } };
    const before = JSON.stringify(recipe);
    const c = S.chibiRecipe(recipe);
    assert.equal(JSON.stringify(recipe), before);
    assert.ok(c.headSize > recipe.headSize && c.headSize <= 2.2);
    assert.ok(c.shapes.legLength < -1 && c.shapes.armLength < 0 && c.shapes.torsoLength < 0);
    assert.equal(c.shapes.handSize, 3, 'held to the slider\'s reach');
    assert.ok(c.shapes.footSize > 0);
    assert.ok(c.shapes.eyeSize > 1 && c.morph.eyeTall > 1 && c.eyes.catchlight);
    // The rendered skeleton finishes the proportions by growing the head from its chin.
    for (const [chin, tall] of [[0.85, 0.3], [1.1, 0.27]]) {
        const head = tall * S.headScale(chin, tall);
        assert.ok(Math.abs((chin + head) / head - 2.8) < 1e-6);
    }
    assert.deepEqual(S.STYLES.map(s => s.id), ['realistic', 'chibi']);
});

test('the grade lifts darks and color; pixel art is hard-edged and on a small palette', () => {
    const px = new Uint8ClampedArray([40, 40, 40, 255, 60, 60, 60, 255, 200, 100, 50, 255, 9, 9, 9, 0, 180, 180, 180, 255]);
    S.grade(px);
    assert.ok(px[0] > 15, 'a dark outfit is not crushed to black');
    assert.ok(px[4] - px[0] > 20, 'its folds keep their contrast');
    assert.ok(px[8] - px[10] > 150, 'more color');
    assert.deepEqual(Array.from(px.slice(12, 16)), [9, 9, 9, 0], 'empty pixels untouched');
    assert.ok(px[16] > 180, 'lights brighter');
    const edge = new Uint8ClampedArray([0, 0, 0, 100, 0, 0, 0, 200]);
    assert.deepEqual(Array.from(S.threshold(edge)).filter((_, i) => i % 4 === 3), [0, 255]);
    const n = 64 * 64, many = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) many.set([(i * 37) & 255, (i * 91) & 255, (i * 53) & 255, i % 7 ? 255 : 0], i * 4);
    S.quantize(many, 32);
    const colors = new Set();
    for (let i = 0; i < n; i++) if (many[i * 4 + 3]) colors.add(many[i * 4] + ',' + many[i * 4 + 1] + ',' + many[i * 4 + 2]);
    assert.ok(colors.size <= 32, String(colors.size));
    assert.equal(many[3], 0, 'empty pixels stay empty');
});

// ── 'cel': pixel art, drawn (2026-11-10) ───────────────────────────────────────────────────────────────────────
{
    const S = require('../src/forge/Character3D/CharacterSpriteSheet.js');
    /** A k-times enlarged picture, premultiplied RGBA with rows bottom-up, from rows of [r, g, b] or null. */
    const big = (rows, k) => {
        const h = rows.length, w = rows[0].length, out = new Uint8Array(w * k * h * k * 4);
        for (let y = 0; y < h * k; y++) for (let x = 0; x < w * k; x++) {
            const c = rows[h - 1 - Math.floor(y / k)][Math.floor(x / k)];
            if (c) out.set([c[0], c[1], c[2], 255], (y * w * k + x) * 4);
        }
        return out;
    };

    test('a drawn pixel is the commonest surface under it, never a blend of two', () => {
        const red = [200, 40, 40], blue = [40, 40, 200], k = 4;
        // One output pixel: ten samples of red, six of blue. A mean would be purple.
        const flat = new Uint8Array(k * k * 4), lit = new Uint8Array(k * k * 4);
        for (let i = 0; i < k * k; i++) { flat.set([...(i < 10 ? red : blue), 255], i * 4); lit.set([...(i < 10 ? [100, 20, 20] : [20, 20, 100]), 255], i * 4); }
        const cell = S.celCell(lit, flat, k, k, k);
        assert.deepEqual([...cell.albedo], red);
        assert.deepEqual([...cell.shown], [100, 20, 20]);
        assert.equal(cell.alpha[0], 255);
        // Fewer than half its samples drawn: the pixel is empty, so edges are hard.
        const thin = new Uint8Array(k * k * 4);
        for (let i = 0; i < 7; i++) thin.set([...red, 255], i * 4);
        assert.equal(S.celCell(thin, thin, k, k, k).alpha[0], 0);
    });

    test('a drawn sheet holds a few colors, each in a few tones set by the light, and a lone pixel joins its neighbours', () => {
        const red = [200, 40, 40], k = 2, w = 6, h = 4;
        const flat = big(Array.from({ length: h }, () => Array(w).fill(red)), k);
        // Lit: the left third in shadow, the right third bright, and one stray dark pixel in the middle.
        const lit = big(Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x < 2 ? [60, 12, 12] : x > 3 ? [250, 50, 50] : (x === 3 && y === 1 ? [60, 12, 12] : [160, 32, 32])))), k);
        const cell = S.celCell(lit, flat, w * k, h * k, k);
        const px = S.celDraw([cell], 8)[0];
        const at = (x, y) => [...px.slice((y * w + x) * 4, (y * w + x) * 4 + 3)].join();
        const tones = new Set();
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tones.add(at(x, y));
        assert.equal(tones.size, 3, 'shadow, base and light of one red');
        assert.notEqual(at(0, 0), at(2, 0));
        assert.notEqual(at(5, 0), at(2, 0));
        assert.equal(at(3, 1), at(2, 1), 'the stray pixel is taken into the base around it');
        const ramp = S.celRamp(red), bright = c => c[0] + c[1] + c[2];
        assert.ok(bright(ramp[0]) < bright(ramp[1]) && bright(ramp[1]) < bright(ramp[2]) && bright(ramp[2]) < bright(ramp[3]));
        assert.ok(ramp[0][2] / ramp[0][0] > red[2] / red[0], 'a shadow leans cool');
    });

    test('the workspace shows a sheet as the animations in it, each played from its own frames', () => {
        const walk = S.strips({ layout: 'mz', frames: 3 });
        assert.deepEqual(walk.map(x => [x.label, x.col, x.row, x.count]), [['Walk · Down', 0, 0, 3], ['Walk · Left', 0, 1, 3], ['Walk · Right', 0, 2, 3], ['Walk · Up', 0, 3, 3]], 'each is named for what it is and which way it faces');
        assert.deepEqual(walk[0].order, [1, 0, 1, 2], 'three frames step as the game steps them');
        assert.deepEqual(S.strips({ layout: 'mz', frames: 6 })[0].order, [0, 1, 2, 3, 4, 5]);
        const all = S.strips({ layout: '8d', frames: 3 });
        assert.equal(all.length, 32);
        assert.ok(all.some(x => x.label === 'Walk · Down-left') && all.some(x => x.label === 'Run · Down') && all.some(x => /^Guard · /.test(x.label)));
        assert.deepEqual([all[0].name, all[0].direction], ['walk', 'Down'], 'the two parts apart, for the editor\'s language');
        // The game's pace: a frame every 10 updates walking and 8 at a dash, a block stepped like a walk whatever it holds.
        const ms = updates => 1000 / 60 * updates;
        assert.equal(walk[0].period, ms(10));
        assert.equal(all.find(x => x.name === 'run').period, ms(8));
        const guard = all.find(x => x.name === 'guard');
        assert.deepEqual([guard.order, guard.period, guard.loops], [[1, 0, 1, 2], ms(10), true]);
        const battler = S.strips({ layout: 'sv' });
        assert.deepEqual([battler.length, battler[0].label, battler[0].count, battler.at(-1).label], [18, 'Walk', 3, 'Dead']);
        // A battler's motion takes 12 updates a frame: there and back when it loops, once through when it does not.
        const swing = battler.find(x => x.name === 'swing');
        assert.deepEqual([battler[0].order, battler[0].period, battler[0].loops], [[0, 1, 2, 1], ms(12), true]);
        assert.deepEqual([swing.order, swing.loops], [[0, 1, 2], false]);
        assert.deepEqual(S.strips({ layout: 'face' }).map(x => x.count), Array(8).fill(1));
        // Every frame of the sheet belongs to exactly one animation.
        for (const [id, columns, rows] of [['mz', 3, 4], ['8d', 12, 8], ['sv', 9, 6], ['face', 4, 2]]) {
            assert.equal(S.strips({ layout: id, frames: 3 }).reduce((sum, x) => sum + x.count, 0), columns * rows, id);
        }
    });

    test('tiles are enlarged by whole pixels, as far as the stage holds them, and the settings a sheet is drawn with are the ones exported', () => {
        assert.equal(S.tileZoom(4, 48, 900, 600), 5);
        assert.equal(S.tileZoom(32, 100, 900, 600), 1);
        // Frames too large to show whole are shown smaller, so the whole sheet's animations are seen and none is cut off.
        assert.equal(S.tileZoom(32, 300, 900, 600), 0.25);
        assert.equal(S.tileZoom(4, 300, 900, 600), 0.75);
        assert.equal(S.tileZoom(64, 512, 300, 200), 0.25, 'a quarter at the least; past that the stage scrolls');
        // A face sheet is shown as it is laid out, four across and two down: the zoom is the one that grid fits at.
        assert.equal(S.gridZoom(4, 2, 144, 900, 600), 1);
        assert.equal(S.gridZoom(4, 2, 144, 1400, 700), 2);
        assert.equal(S.gridZoom(4, 2, 144, 560, 560), 0.75);
        assert.equal(S.gridZoom(4, 2, 512, 300, 200), 0.25);
        const set = S.settingsOf({ layout: 'mz', frame: 37, frames: 6, elevation: 20, outline: false, style: 'chibi', look: 'cel', colors: 9, background: '' });
        assert.deepEqual([set.layout, set.frame, set.frames, set.elevation, set.outline, set.style, set.look, set.colors], ['mz', 37, 6, 20, false, 'chibi', 'cel', 9]);
        assert.equal(S.settingsOf({ layout: 'sv', frames: 6 }).frames, 3, 'a battler sheet is three frames a motion');
    });

    test('the drawn look is offered beside the others', () => {
        assert.deepEqual(S.LOOKS.map(l => l.id), ['smooth', 'pixel', 'cel']);
    });
}

test('a shadow lies on the ground from the feet, the way its angle points, and never leaves the frame', () => {
    // A figure four pixels wide and sixteen tall, feet on row 26 of a 32 × 32 frame.
    const w = 32, figure = () => { const px = new Uint8ClampedArray(w * w * 4); for (let y = 11; y <= 26; y++) for (let x = 14; x <= 17; x++) px.set([200, 150, 100, 255], (y * w + x) * 4); return px; };
    // The shadow alone: where it is and how dark, as the darkness-weighted middle of it.
    const shadow = px => { let sum = 0, cx = 0, cy = 0, most = 0, ring = 0; const shades = new Set();
        for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, a = px[o + 3]; if (a > 0 && a < 255 && px[o] === 0) { sum += a; cx += x * a; cy += y * a; most = Math.max(most, a); shades.add(a); if (x === 0 || y === 0 || x === w - 1 || y === w - 1) ring += a; } }
        return { sum, x: cx / sum, y: cy / sum, most, ring, shades: shades.size }; };
    const at = (angle, scale = 1, hard = false, px = figure()) => shadow(S.shadowed(px, w, w, angle, scale, hard));
    // Each way it points: to the right, to the left, behind the figure (up the picture), towards the viewer (down it).
    const right = at(90), left = at(-90), back = at(0), front = at(180);
    assert.ok(right.sum > 0 && right.x > 18 && Math.abs(right.y - 26) < 1.5, JSON.stringify(right));
    assert.ok(left.x < 13 && Math.abs(left.y - 26) < 1.5, JSON.stringify(left));
    assert.ok(Math.abs(right.x - 15.5 + (left.x - 15.5)) < 1, 'left is the mirror of right');
    assert.ok(front.y > 27 && Math.abs(front.x - 15.5) < 1, JSON.stringify(front));
    assert.ok(back.sum < front.sum, 'behind the figure most of it is hidden by the figure');
    // Lighter than the figure and never over it: the figure's own pixels are as they were.
    assert.ok(right.most > 40 && right.most < 110, String(right.most));
    const drawn = S.shadowed(figure(), w, w, 90, 1, false);
    for (let y = 11; y <= 26; y++) for (let x = 14; x <= 17; x++) assert.deepEqual(Array.from(drawn.slice((y * w + x) * 4, (y * w + x) * 4 + 4)), [200, 150, 100, 255]);
    // A soft edge: many shades. Pixel art: one darkness.
    assert.ok(right.shades > 6, String(right.shades));
    assert.equal(at(90, 1, true).shades, 1);
    // It fades out before the frame's edge, whatever its length: nothing on the outermost pixels, for a figure at
    // the frame's side whose shadow has no room, and for one standing on the frame's last row.
    const side = new Uint8ClampedArray(w * w * 4); for (let y = 6; y <= 26; y++) for (let x = 27; x <= 29; x++) side.set([9, 9, 9, 255], (y * w + x) * 4);
    const low = new Uint8ClampedArray(w * w * 4); for (let y = 16; y <= 31; y++) for (let x = 14; x <= 17; x++) low.set([9, 9, 9, 255], (y * w + x) * 4);
    for (const [px, angle] of [[figure(), 90], [side, 90], [low, 180], [figure(), -90]]) assert.equal(at(angle, 1, false, px).ring, 0);
    // The length that fits: whole where there is room, less for a figure near the edge it points at, nothing for one on the last row.
    assert.equal(S.shadowFit(figure(), w, w, 90), 1);
    const fit = S.shadowFit(side, w, w, 90);
    assert.ok(fit > 0 && fit < 0.3, String(fit));
    assert.equal(S.shadowFit(low, w, w, 180), 0);
    assert.equal(S.shadowFit(new Uint8ClampedArray(w * w * 4), w, w, 45), 1, 'an empty frame asks for nothing');
    // A whole sheet: every frame's shadow at one length, the tightest frame's but never so short that one frame
    // with something out at its side takes the shadow off the whole sheet.
    const sheet = new Uint8ClampedArray(w * 2 * w * 4);
    S.blit(sheet, w * 2, figure(), w, w, 0, 0);
    S.blit(sheet, w * 2, side, w, w, 1, 0);
    const scale = S.castShadows(sheet, w * 2, w, w, 90, false);
    assert.ok(scale >= 0.5 && scale < 1 && scale > fit, String(scale));
    const cell = col => { const px = new Uint8ClampedArray(w * w * 4); for (let y = 0; y < w; y++) px.set(sheet.subarray((y * w * 2 + col * w) * 4, (y * w * 2 + col * w + w) * 4), y * w * 4); return shadow(px); };
    assert.ok(cell(0).sum > right.sum * 0.4 && cell(0).x < right.x, 'the roomy frame keeps a shadow, a little shorter');
    assert.equal(cell(1).ring, 0, 'the tight frame\'s fades out inside its frame');
    for (let y = 0; y < w; y++) assert.equal(sheet[(y * w * 2 + w) * 4 + 3], 0, 'nothing of the first frame\'s shadow in the second frame\'s first column');
    const set = S.settingsOf({ layout: 'mz', frame: 48, shadow: true, shadowAngle: -45 });
    assert.deepEqual([set.shadow, set.shadowAngle, S.settingsOf({ layout: 'mz' }).shadow, S.settingsOf({ layout: 'mz' }).shadowAngle], [true, -45, false, 30], '30 degrees unless chosen');
    // Distance: how far it reaches. Half as far and twice as far to the right, and under the feet at none.
    const near = at(90, 1, false, figure()), half = shadow(S.shadowed(figure(), w, w, 90, 1, false, 0.5)), far = shadow(S.shadowed(figure(), w, w, 90, 1, false, 1.6)), none = shadow(S.shadowed(figure(), w, w, 90, 1, false, 0));
    assert.ok(half.x < near.x && near.x < far.x, [half.x, near.x, far.x].join(' '));
    assert.ok(Math.abs(none.x - 15.5) < 0.6 && none.sum > 0, 'at none it lies under the feet: ' + none.x);
    assert.ok(S.shadowFit(side, w, w, 90, 2) < S.shadowFit(side, w, w, 90, 1), 'a longer shadow has less room');
    assert.deepEqual([S.settingsOf({ layout: 'mz' }).shadowDistance, S.settingsOf({ layout: 'mz', shadowDistance: 150 }).shadowDistance, S.settingsOf({ layout: 'mz', shadowDistance: 900 }).shadowDistance], [100, 150, 200]);
});

test('the frame-edge guide is a preference kept with the editor: off and magenta until changed', () => {
    const kept = {}, storage = { getItem: key => (key in kept ? kept[key] : null), setItem: (key, value) => { kept[key] = String(value); } };
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
    try {
        assert.deepEqual(S.loadGuide(), { on: false, color: '#ff00ff' });
        S.saveGuide({ on: true, color: '#00ffcc' });
        assert.deepEqual(S.loadGuide(), { on: true, color: '#00ffcc' });
        kept.rrSpriteFrameGuide = '{"on":true,"color":"red; background:url(x)"}';
        assert.deepEqual(S.loadGuide(), { on: true, color: '#ff00ff' }, 'only a plain colour is taken');
        kept.rrSpriteFrameGuide = 'not json';
        assert.deepEqual(S.loadGuide(), { on: false, color: '#ff00ff' });
    } finally { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage; }
});

test('a face sheet can have frames: each face talks or sweeps, the set is named [4F], laid as the game cuts it', () => {
    // Still, as before: eight portraits, four across.
    const still = S.plan('face', {});
    assert.deepEqual([still.length, Math.max(...still.map(c => c.col)), S.fileName('face', 'Reid')], [8, 3, 'Reid.png']);
    // Four frames a face; the second face sweeps, the others talk.
    const state = { layout: 'face', faceFrames: 4, faceKinds: ['talk', 'sweep'], talkMouths: [null, 'ee'] };
    const anim = S.faceAnimOf(state);
    assert.deepEqual([anim.frames, anim.kinds, anim.mouths], [4, ['talk', 'sweep', 'talk', 'talk', 'talk', 'talk', 'talk', 'talk'], ['ih', 'ee', 'aa']], 'the usual mouths unless chosen');
    const cells = S.plan('face', { face: anim });
    assert.equal(cells.length, 32);
    assert.equal(new Set(cells.map(c => c.col + ',' + c.row)).size, 32, 'every frame has a place of its own');
    // Frame k of face i at column (i % 4) * 4 + k; the fifth face starts the second row.
    assert.deepEqual(cells.slice(0, 4).map(c => [c.col, c.row, c.expression, c.plays, c.talk, c.mouth]), [[0, 0, 'neutral', 'talk', 0, ''], [1, 0, 'neutral', 'talk', 1, 'ih'], [2, 0, 'neutral', 'talk', 2, 'ee'], [3, 0, 'neutral', 'talk', 3, 'aa']]);
    assert.deepEqual(cells.slice(4, 8).map(c => [c.col, c.plays, c.sweep]), [[4, 'sweep', 0], [5, 'sweep', 1 / 3], [6, 'sweep', 2 / 3], [7, 'sweep', 1]], 'a sweep goes from the neutral face to the whole expression');
    assert.deepEqual(cells.slice(16, 20).map(c => [c.col, c.row]), [[0, 1], [1, 1], [2, 1], [3, 1]]);
    // The name says the frames and nothing else; a character sheet's frames are its own.
    assert.equal(S.fileName('face', 'Reid', 3, state), 'Reid[4F].png');
    assert.equal(S.fileName('mz', 'Reid', 6, state), '$Reid[6F].png');
    assert.deepEqual([S.faceAnimOf({}).frames, S.faceAnimOf({ faceFrames: 99 }).frames, S.faceAnimOf({ faceFrames: 2 }).mouths, S.faceAnimOf({ faceFrames: 3, talkMouths: ['nope', 'oh'] }).mouths], [1, 8, ['aa'], ['ih', 'oh']]);
    assert.deepEqual(S.settingsOf(state).face, anim);
    // What each frame draws: the expression, the neutral face at a sweep's start, a blend between.
    assert.equal(S.frameFace({ expression: 'happy', talk: 0, mouth: '' }), 'happy');
    assert.equal(S.frameFace({ expression: 'happy', sweep: 0 }), 'neutral');
    assert.equal(S.frameFace({ expression: 'happy', sweep: 1 }), 'happy');
    const had = globalThis.RRCharacterExpressions;
    try {
        if (had && typeof had.blend === 'function') {
            const jaw = face => Object.entries(face.units || {}).filter(([unit]) => /^jawDrop/.test(unit)).reduce((sum, [, weight]) => sum + weight, 0);
            assert.ok(jaw(S.frameFace({ expression: 'happy', mouth: 'aa' })) > jaw(S.frameFace({ expression: 'happy', mouth: 'ih' })), 'a wider mouth shape opens the jaw further');
        }
        globalThis.RRCharacterExpressions = { blend: list => ({ blended: list }) };
        assert.deepEqual(S.frameFace({ expression: 'happy', mouth: 'oh' }), { blended: [['happy', 1], ['viseme_oh', 1]] });
        assert.deepEqual(S.frameFace({ expression: 'happy', sweep: 0.5 }), { blended: [['happy', 0.5]] });
        delete globalThis.RRCharacterExpressions;
        assert.equal(S.frameFace({ expression: 'happy', mouth: 'aa' }), 'happy', 'a builder with no expressions: the expression itself');
    } finally { if (had === undefined) delete globalThis.RRCharacterExpressions; else globalThis.RRCharacterExpressions = had; }
    // The view plays each face as the game will: a talking face rests then follows a line of text, a sweep runs
    // through once and holds its last frame.
    const strips = S.strips(S.settingsOf(state));
    assert.deepEqual([strips.length, strips[0].count, strips[1].col, strips[0].label], [8, 4, 4, 'Neutral']);
    assert.deepEqual(strips[1].steps, [[0, 20], [1, 5], [2, 5], [3, 70]]);
    const talk = strips[0].steps;
    assert.deepEqual([talk[0], talk.at(-1)], [[0, 24], [0, 40]]);
    assert.ok(talk.slice(1, -1).every(([frame, updates]) => frame >= 0 && frame < 4 && updates === 4) && new Set(talk.map(step => step[0])).size >= 3, 'several mouths, each held as the game holds it');
    assert.ok(talk.length > 40, 'a letter at a time');
    assert.equal(S.strips({ layout: 'face' })[0].steps, null);
    // The mouth for a letter is the game's own rule, letter for letter.
    const windows = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_windows.js'), 'utf8');
    const game = require('node:vm').runInNewContext('const Window_Message = {};' + windows.slice(windows.indexOf('Window_Message.faceMouth = function'), windows.indexOf('/**\n * A face set with frames moves in the message window')) + 'Window_Message;');
    for (const c of 'abcdefghijklmnopqrstuvwxyz0123456789 .,!?あ漢Жé-'.split('').concat([''])) assert.equal(S.mouthOpen(c), game.faceMouth(c), JSON.stringify(c));
    for (const open of [0, 0.15, 0.3, 0.5, 0.8, 1]) for (const n of [1, 2, 3, 4, 8]) assert.equal(S.talkFrame(open, n), game.faceTalkFrame(open, n));
});

test('a portrait\'s small see-through gaps are closed, and the ground and large openings are left', () => {
    // A 20 × 20 face of skin with clear ground round it, a two-pixel gap at the mouth, and a hoop's large opening.
    const w = 20, px = new Uint8ClampedArray(w * w * 4);
    for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) px.set([220, 170, 150, 255], (y * w + x) * 4);
    const clear = (x, y) => px.set([0, 0, 0, 0], (y * w + x) * 4);
    clear(9, 12); clear(10, 12);
    for (let y = 4; y < 9; y++) for (let x = 4; x < 9; x++) clear(x, y);
    const at = (x, y) => Array.from(px.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
    S.closeHoles(px, w, w, 6);
    assert.equal(at(9, 12)[3], 255, 'the gap at the mouth is filled');
    assert.ok(at(9, 12)[0] < 100 && at(9, 12)[0] > at(9, 12)[1], 'dark, and warm like the inside of a mouth: ' + at(9, 12));
    assert.deepEqual(at(10, 12), at(9, 12));
    assert.equal(at(6, 6)[3], 0, 'an opening larger than the limit is meant, and left');
    assert.equal(at(0, 0)[3], 0, 'the ground is left');
    assert.deepEqual(at(3, 3), [220, 170, 150, 255], 'the face itself is as it was');
    // A notch open to the ground is ground, not a hole.
    const open = new Uint8ClampedArray(w * w * 4);
    for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) open.set([220, 170, 150, 255], (y * w + x) * 4);
    for (let x = 0; x < 6; x++) open.set([0, 0, 0, 0], (10 * w + x) * 4);
    S.closeHoles(open, w, w, 6);
    assert.equal(open[(10 * w + 4) * 4 + 3], 0);
});

test('every mouth shape a talking frame can take has a name in plain words', () => {
    for (const id of S.MOUTH_SHAPES) assert.ok(/^[A-Z][a-z].* \(.+\)$/.test(S.MOUTH_NAMES[id] || ''), id + ': ' + S.MOUTH_NAMES[id]);
    assert.equal(Object.keys(S.MOUTH_NAMES).length, S.MOUTH_SHAPES.length);
    assert.equal(S.MOUTH_NAMES.aa, 'Wide open (ah)');
});
