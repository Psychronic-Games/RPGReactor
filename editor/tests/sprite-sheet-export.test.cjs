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
