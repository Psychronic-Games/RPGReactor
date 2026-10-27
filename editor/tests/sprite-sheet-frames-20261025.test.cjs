'use strict';
// Forge › 3D Character Builder › Export sprite sheet with a frame count: the
// [NF] file name ($Name[6F], $Name[8D][6F]), the plan's frames in the order
// an [NF] sheet plays them, the editor reading every spelling of the tag, and
// the game cutting an [8D][NF] sheet N frames to a block.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..', '..');
const S = require(path.join(repo, 'editor', 'src', 'forge', 'Character3D', 'CharacterSpriteSheet.js'));
const A = require(path.join(repo, 'editor', 'src', 'utils', 'AssetFiles.js'));
const read = file => fs.readFileSync(path.join(repo, 'runtime', file), 'utf8');
const at = (cells, col, row) => cells.find(c => c.col === col && c.row === row);
const ON = { rrMultiFrames: true };

test('the file name carries the frame count number first, like [8D]; 3 frames is named as before', () => {
    assert.equal(S.fileName('8d', 'Hero'), '$Hero[8D].png');
    assert.equal(S.fileName('8d', 'Hero', 3), '$Hero[8D].png');
    assert.equal(S.fileName('mz', 'Hero', 3), '$Hero.png');
    assert.equal(S.fileName('8d', 'Hero', 6), '$Hero[8D][6F].png');
    assert.equal(S.fileName('mz', 'Hero', 6), '$Hero[6F].png');
    assert.equal(S.fileName('mz', 'Hero', 1), '$Hero[1F].png');
    assert.equal(S.fileName('8d', 'Hero', 12), '$Hero[8D][12F].png');
    assert.equal(S.fileName('sv', 'Hero', 6), 'Hero.png', 'a battler sheet takes no frame count');
    assert.equal(S.fileName('face', 'Hero', 6), 'Hero.png');
    assert.equal(S.fileName('mz', 'Hero', 7), '$Hero.png', 'a count off the list is MZ\'s 3');
    assert.ok(S.FRAME_CHOICES.includes(1) && S.FRAME_CHOICES.includes(3) && S.FRAME_CHOICES.includes(6));
    assert.equal(S.frameTag(6), '[6F]');
    assert.equal(S.frameTag(3), '');
    assert.equal(A.frameTag(1), '[1F]');
});

test('at 3 frames the plan is MZ\'s, cell for cell', () => {
    for (const id of ['mz', '8d']) assert.deepEqual(S.plan(id, { frames: 3 }), S.plan(id));
    assert.equal(S.columnsOf('8d', 3), 12);
    assert.equal(S.columnsOf('mz', 3), 3);
    const mz = S.plan('mz');
    assert.equal(mz.length, 12);
    assert.deepEqual([0, 1, 2].map(c => [at(mz, c, 0).clip, at(mz, c, 0).at]), [['walk', 'stepA'], ['idle', 0], ['walk', 'stepB']]);
});

test('a 6-frame 4-direction sheet: 6 × 4, each row standing on frame 0 then the walk cycle round', () => {
    const cells = S.plan('mz', { frames: 6 });
    assert.equal(S.columnsOf('mz', 6), 6);
    assert.equal(cells.length, 24);
    assert.equal(new Set(cells.map(c => c.col + ',' + c.row)).size, 24);
    for (const c of cells) assert.ok(c.col >= 0 && c.col < 6 && c.row >= 0 && c.row < 4);
    assert.deepEqual([0, 1, 2, 3].map(r => at(cells, 0, r).dir), [2, 4, 6, 8]);
    for (let r = 0; r < 4; r++) {
        assert.deepEqual([at(cells, 0, r).clip, at(cells, 0, r).at], ['idle', 0], 'frame 0 stands: the frame the game rests on');
        // Frames 1-5: the walk from its passing frame, a sixth of the cycle apart, so frame 5 leads back to 0.
        assert.deepEqual([1, 2, 3, 4, 5].map(c => [at(cells, c, r).clip, at(cells, c, r).at, at(cells, c, r).shift]),
            [1, 2, 3, 4, 5].map(c => ['walk', 'pass', c / 6]));
    }
});

test('a 6-frame [8D] sheet: 48 × 8, every block 6 wide, dash and poses over 6 frames', () => {
    const cells = S.plan('8d', { frames: 6 });
    assert.equal(S.columnsOf('8d', 6), 24);
    assert.equal(cells.length, 24 * 8);
    assert.equal(new Set(cells.map(c => c.col + ',' + c.row)).size, 24 * 8);
    for (const c of cells) assert.ok(c.col >= 0 && c.col < 24 && c.row >= 0 && c.row < 8);
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(b => S.blockOrigin(b, 6)), [
        { col: 0, row: 0 }, { col: 6, row: 0 }, { col: 12, row: 0 }, { col: 18, row: 0 },
        { col: 0, row: 4 }, { col: 6, row: 4 }, { col: 12, row: 4 }, { col: 18, row: 4 }]);
    const dirs = col => [0, 1, 2, 3].map(r => at(cells, col, r).dir);
    assert.deepEqual(dirs(0), [2, 4, 6, 8], 'walk');
    assert.deepEqual(dirs(6), [1, 3, 7, 9], 'walk diagonals');
    assert.deepEqual(dirs(12), [2, 4, 6, 8], 'dash');
    assert.deepEqual(dirs(18), [1, 3, 7, 9], 'dash diagonals');
    // Walk diagonals stand on 0 too; the dash never stands: its passing frame, then on round the run.
    assert.equal(at(cells, 6, 0).clip, 'idle');
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(c => [at(cells, 12 + c, 0).clip, at(cells, 12 + c, 0).shift]), [0, 1, 2, 3, 4, 5].map(c => ['run', c / 6]));
    // Carry: the walk with the arms held up.
    assert.equal(at(cells, 0, 4).clip, 'idle');
    assert.equal(at(cells, 3, 4).upper, 'lift');
    assert.equal(at(cells, 6, 5).upper, 'lift');
    // Attack: from its start to the key pose by the middle frame, then after it.
    const attack = [0, 1, 2, 3, 4, 5].map(c => at(cells, 12 + c, 4));
    assert.ok(attack.every(c => c.clip === 'attack' && c.kind === 'pose'));
    assert.deepEqual(attack.map(c => [c.at, c.to, c.u]), [
        ['start', 'key', 0], ['start', 'key', 1 / 3], ['start', 'key', 2 / 3], ['start', 'key', 1], ['key', 'after', 0.5], ['key', 'after', 1]]);
    // The poses block: jump, guard, cast, down, six frames each.
    assert.deepEqual([0, 1, 2, 3].map(r => at(cells, 18, r + 4).clip), ['jump', 'guard', 'cast', 'hit']);
    assert.deepEqual([1, 2, 3, 4, 5].map(c => at(cells, 18 + c, 7).clip), ['dead', 'dead', 'dead', 'dead', 'dead']);
    assert.equal(at(cells, 23, 7).u, 1, 'the last frame lies still');
});

test('a 1-frame sheet: one standing frame a row', () => {
    const mz = S.plan('mz', { frames: 1 });
    assert.equal(mz.length, 4);
    assert.ok(mz.every(c => c.col === 0 && c.clip === 'idle'));
    const eight = S.plan('8d', { frames: 1 });
    assert.equal(eight.length, 32);
    assert.equal(S.columnsOf('8d', 1), 4);
    for (const c of eight) assert.ok(Number.isFinite(c.u === undefined ? 0 : c.u), 'no frame divides by zero');
    assert.equal(at(eight, 2, 4).at, 'key', 'attack: its key pose');
});

test('the editor reads every spelling of the tag, beside [8D] too, only with multi-frame sheets on', () => {
    for (const name of ['$Hero[6F]', '$Hero[6f]', '$Hero[F6]', '$Hero[f6]', '$Hero[8D][6F]', '$Hero[8D][f6]', '$Hero[F6][8D]', 'img/characters/$Hero[8D][6F]']) {
        assert.equal(A.framesTagged(name), 6, name);
        assert.equal(A.characterFrameCount(name, ON), 6, name);
        assert.equal(A.characterFrameCount(name, {}), 3, name + ' with the feature off');
    }
    assert.equal(A.characterFrameCount('$Hero[1F]', ON), 1);
    assert.equal(A.characterFrameCount('$Hero[8D]', ON), 3, '[8D] is no frame count');
    assert.equal(A.characterFrameCount('Actor1', ON), 3);
    assert.equal(A.isEightDirCharacter('$Hero[8D][6F]'), true);
    assert.equal(A.isEightDirCharacter('$Hero[6F]'), false);
    assert.equal(A.isBigCharacter('$Hero[8D][6F]'), false, 'an [8D] sheet is cut as eight blocks whatever its $');
    assert.equal(A.isBigCharacter('$Hero[6F]'), true);
});

// The game: rrFramesOf, the [NF] cut and the [8D] cut, as reactor_sprites.js stacks them.
function definition(source, head) {
    const start = source.indexOf(head);
    assert.ok(start >= 0, head);
    return source.slice(start, source.indexOf('\n};\n', start) + 4);
}

function load(system) {
    const sprites = read('reactor_sprites.js'), managers = read('reactor_managers.js'), core = read('reactor_core.js'), legacy = read('reactor_objects_legacy.js');
    const stock = ['updateCharacterFrame', 'characterBlockX', 'characterBlockY', 'characterPatternX', 'characterPatternY', 'patternWidth', 'patternHeight', 'setCharacterBitmap']
        .map(name => definition(sprites, `Sprite_Character.prototype.${name} = function`)).join('\n');
    const from = sprites.indexOf('const _rrMultiPatternWidth');
    const to = sprites.indexOf('\n};\n', sprites.indexOf('Sprite_Character.prototype.characterPatternY = function', from)) + 4;
    const source = [
        definition(core, 'Utils.extractFileName = function'),
        definition(managers, 'ImageManager.isEightDirCharacter = function'),
        definition(managers, 'ImageManager.isBigCharacter = function'),
        definition(legacy, 'Game_CharacterBase.rrFramesOf = function'),
        stock, sprites.slice(from, to)
    ].join('\n');
    const context = {
        Utils: {}, $dataSystem: system,
        ImageManager: { loadCharacter: name => (/\[8D\]/i.test(name) ? { width: 48 * 6 * 4, height: 64 * 8 } : { width: 48 * 6, height: 64 * 4 }) },
        Sprite_Character: function() {}, Game_CharacterBase: function() {}, Game_Follower: function() {},
        $gamePlayer: { isDashing: () => false }, Math, Object, Number, String
    };
    vm.createContext(context);
    vm.runInContext('Sprite_Character.prototype.updateHalfBodySprites = function() {};\nSprite_Character.prototype.setFrame = function(x, y, w, h) { this.frame = [x, y, w, h]; };\n' + source, context);
    return context;
}

function frameOf(ctx, name, o = {}) {
    const x = 5, y = 5, sprite = new ctx.Sprite_Character();
    sprite._character = {
        _x: x, _y: y, _realX: x - (o.dx || 0), _realY: y - (o.dy || 0), _reactorDir8: o.dir8,
        characterIndex: () => o.index || 0, direction: () => o.direction || 2, pattern: () => o.pattern || 0,
        isMoving: () => !!(o.dx || o.dy), isDashing: () => !!o.dash, isDirectionFixed: () => false
    };
    sprite._characterName = name;
    sprite._bushDepth = 0;
    sprite.setCharacterBitmap();
    sprite.updateCharacterFrame();
    return Array.from(sprite.frame);
}

test('the game reads every spelling of the tag', () => {
    const ctx = load(ON);
    for (const name of ['$Hero[6F]', '$Hero[6f]', '$Hero[F6]', '$Hero[f6]', '$Hero[8D][6F]', '$Hero[8D][f6]']) assert.equal(ctx.Game_CharacterBase.rrFramesOf(name), 6, name);
    assert.equal(ctx.Game_CharacterBase.rrFramesOf('$Hero[1F]'), 1);
    assert.equal(ctx.Game_CharacterBase.rrFramesOf('$Hero[8D]'), 0);
    assert.equal(load({}).Game_CharacterBase.rrFramesOf('$Hero[6F]'), 0, 'off unless the project turns multi-frame sheets on');
});

test('the game cuts a $Name[6F] sheet 6 frames across and an $Name[8D][6F] sheet 6 frames to a block', () => {
    const ctx = load(ON);
    // [x, y, w, h] in frames of 48 × 64.
    const cell = (name, o) => { const f = frameOf(ctx, name, o); return [f[0] / 48, f[1] / 64, f[2], f[3]]; };
    assert.deepEqual(cell('$Hero[6F]', { pattern: 0 }), [0, 0, 48, 64]);
    assert.deepEqual(cell('$Hero[6F]', { pattern: 5, direction: 8 }), [5, 3, 48, 64]);
    assert.deepEqual(cell('$Hero[8D][6F]', { pattern: 0 }), [0, 0, 48, 64], 'standing, facing down');
    assert.deepEqual(cell('$Hero[8D][6F]', { pattern: 4, direction: 6 }), [4, 2, 48, 64]);
    assert.deepEqual(cell('$Hero[8D][6F]', { pattern: 2, dir8: 3 }), [6 + 2, 1, 48, 64], 'down-right: block 1');
    assert.deepEqual(cell('$Hero[8D][6F]', { pattern: 1, dash: true, dx: 1, direction: 6 }), [12 + 1, 2, 48, 64], 'dashing: block 2');
    assert.deepEqual(cell('$Hero[8D][6F]', { pattern: 3, dash: true, dx: 1, dy: 1 }), [18 + 3, 1, 48, 64], 'dashing down-right: block 3');
    assert.deepEqual(cell('$Hero[8D][6F]', { index: 6, pattern: 5, direction: 4 }), [12 + 5, 4 + 1, 48, 64], 'attack block');
    assert.deepEqual(cell('$Hero[8D][6F]', { index: 7, pattern: 0, direction: 2 }), [18, 4, 48, 64], 'poses block');
});

test('the export turns multi-frame sheets on in the open Database, as Reactor Features does', () => {
    const features = require(path.join(repo, 'editor', 'src', 'ReactorFeatures.js'));
    const system = {}, calls = [];
    const saved = { reactor: globalThis.reactor, ReactorFeatures: globalThis.ReactorFeatures };
    globalThis.ReactorFeatures = features;
    globalThis.reactor = { databaseManager: { data: { system } }, databaseEditorUI: { featuresEditor: { apply: (sys, id, on) => { calls.push(id); features.set(id, on, sys); } } } };
    try {
        assert.equal(S.turnOnMultiFrames(), true);
        assert.deepEqual(calls, ['multiFrames']);
        assert.equal(system.rrMultiFrames, true);
        assert.equal(S.turnOnMultiFrames(), false, 'already on: nothing to say');
        // No Database page made yet: the flag is set on the loaded System.json and the change counted.
        const other = {};
        globalThis.reactor = { databaseManager: { data: { system: other } } };
        assert.equal(S.turnOnMultiFrames(), true);
        assert.equal(other.rrMultiFrames, true);
        assert.equal(globalThis.reactor.databaseManager.mutationGeneration, 1);
    } finally {
        globalThis.reactor = saved.reactor;
        globalThis.ReactorFeatures = saved.ReactorFeatures;
    }
});
