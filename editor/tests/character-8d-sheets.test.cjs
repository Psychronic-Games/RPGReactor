'use strict';
// Character sheets tagged [8D]: cut as eight blocks of 3 × 4 frames, the
// diagonal block shown for the four diagonals, the dash block while dashing,
// and every sheet without the tag cut exactly as before.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(repo, 'runtime', file), 'utf8');

/** The first `<owner>.<name> = function` in `source`, whole. */
function definition(source, head) {
    const start = source.indexOf(head);
    assert.ok(start >= 0, head);
    const end = source.indexOf('\n};\n', start);
    return source.slice(start, end + 4);
}

function load() {
    const sprites = read('reactor_sprites.js'), managers = read('reactor_managers.js'), core = read('reactor_core.js');
    const stock = ['updateCharacterFrame', 'characterBlockX', 'characterBlockY', 'characterPatternX', 'characterPatternY', 'patternWidth', 'patternHeight', 'setCharacterBitmap']
        .map(name => definition(sprites, `Sprite_Character.prototype.${name} = function`)).join('\n');
    const start = sprites.indexOf('Sprite_Character.RR_DIAGONAL_ROW');
    const end = sprites.indexOf('\n};\n', sprites.indexOf('Sprite_Character.prototype.characterPatternY = function', start)) + 4;
    const eight = sprites.slice(start, end);
    const source = [
        definition(core, 'Utils.extractFileName = function'),
        definition(managers, 'ImageManager.isEightDirCharacter = function'),
        definition(managers, 'ImageManager.isBigCharacter = function'),
        stock, eight
    ].join('\n');
    const context = {
        Utils: {},
        ImageManager: { loadCharacter: () => ({ width: 1200, height: 800 }) },
        Sprite_Character: function() {},
        Game_Follower: function() {},
        Game_CharacterBase: { rrFramesOf: () => 0 },
        $gamePlayer: { isDashing: () => false },
        Math, Object
    };
    vm.createContext(context);
    vm.runInContext('Sprite_Character.prototype.updateHalfBodySprites = function() {};\nSprite_Character.prototype.setFrame = function(x, y, w, h) { this.frame = [x, y, w, h]; };\n' + source, context);
    return context;
}

/** A character standing (or stepping by dx, dy) facing `direction`, its eight-way facing `dir8`. */
function character(o = {}) {
    const x = 5, y = 5;
    return {
        _x: x, _y: y, _realX: x - (o.dx || 0), _realY: y - (o.dy || 0), _reactorDir8: o.dir8,
        characterIndex: () => o.index || 0, direction: () => o.direction || 2, pattern: () => o.pattern ?? 1,
        isMoving: () => !!(o.dx || o.dy), isDashing: () => !!o.dash, isDirectionFixed: () => !!o.fixed
    };
}

function frameOf(ctx, name, c) {
    const sprite = new ctx.Sprite_Character();
    sprite._character = c;
    sprite._characterName = name;
    sprite._bushDepth = 0;
    sprite.setCharacterBitmap();
    sprite.updateCharacterFrame();
    return Array.from(sprite.frame);
}

test('an [8D] sheet faces eight ways: cardinal rows on block 0, diagonals on block 1', () => {
    const ctx = load(), name = '$8D actor 2-4[8D]';
    // Standing, facing each way: [column of the middle frame, row].
    const cell = c => { const f = frameOf(ctx, name, c); return [f[0] / 100, f[1] / 100]; };
    assert.deepEqual(cell(character({ direction: 2 })), [1, 0]);
    assert.deepEqual(cell(character({ direction: 4 })), [1, 1]);
    assert.deepEqual(cell(character({ direction: 6 })), [1, 2]);
    assert.deepEqual(cell(character({ direction: 8 })), [1, 3]);
    assert.deepEqual(cell(character({ direction: 2, dir8: 1 })), [4, 0], 'down-left');
    assert.deepEqual(cell(character({ direction: 6, dir8: 3 })), [4, 1], 'down-right');
    assert.deepEqual(cell(character({ direction: 4, dir8: 7 })), [4, 2], 'up-left');
    assert.deepEqual(cell(character({ direction: 8, dir8: 9 })), [4, 3], 'up-right');
    // Stepping diagonally, whatever its four-way direction says.
    assert.deepEqual(cell(character({ direction: 8, dx: -0.5, dy: 0.5 })), [4, 0], 'stepping down-left');
    assert.deepEqual(cell(character({ direction: 2, dx: 0.5, dy: -0.5 })), [4, 3], 'stepping up-right');
    // A straight step after a diagonal faces straight.
    assert.deepEqual(cell(character({ direction: 4, dir8: 7, dx: -0.5 })), [1, 1]);
    // Direction fix keeps the four-way row.
    assert.deepEqual(cell(character({ direction: 2, dir8: 9, fixed: true })), [1, 0]);
    // Frame size: 12 × 8 frames whatever the "$" says.
    const f = frameOf(ctx, name, character());
    assert.deepEqual([f[2], f[3]], [100, 100]);
});

test('dashing shows block 2 (and its diagonals on block 3), for the player and a follower', () => {
    const ctx = load(), name = '$Hero[8D]';
    const cell = c => { const f = frameOf(ctx, name, c); return [f[0] / 100, f[1] / 100]; };
    assert.deepEqual(cell(character({ direction: 4, dx: -0.5, dash: true, pattern: 0 })), [6, 1]);
    assert.deepEqual(cell(character({ direction: 2, dx: 0.5, dy: 0.5, dash: true, pattern: 2 })), [11, 1]);
    assert.deepEqual(cell(character({ direction: 4, dash: true })), [1, 1], 'standing with the dash key held is standing');
    const follower = Object.assign(Object.create(ctx.Game_Follower.prototype), character({ direction: 6, dx: 0.5 }));
    assert.deepEqual(cell(follower), [1, 2], 'a follower walks while the player walks');
    ctx.$gamePlayer.isDashing = () => true;
    assert.deepEqual(cell(follower), [7, 2], 'and dashes while the player dashes');
});

test('a block chosen on the event shows as chosen; blocks 2 and 4 take their own diagonals', () => {
    const ctx = load(), name = '!$Things[8D]';
    const cell = c => { const f = frameOf(ctx, name, c); return [f[0] / 100, f[1] / 100]; };
    assert.deepEqual(cell(character({ index: 4, direction: 6 })), [1, 6]);
    assert.deepEqual(cell(character({ index: 4, direction: 6, dir8: 3 })), [4, 5]);
    assert.deepEqual(cell(character({ index: 2, direction: 2, dir8: 1 })), [10, 0]);
    assert.deepEqual(cell(character({ index: 6, direction: 8, pattern: 0, dir8: 9 })), [6, 7], 'block 6 never turns diagonal');
    assert.deepEqual(cell(character({ index: 7, direction: 4, pattern: 2 })), [11, 5]);
});

test('sheets without the tag are cut as before', () => {
    const ctx = load();
    const frame = (name, c, w = 576, h = 384) => { ctx.ImageManager.loadCharacter = () => ({ width: w, height: h }); return frameOf(ctx, name, c); };
    // An eight-character sheet (48 × 48 frames): character 5 is block (1, 1).
    assert.deepEqual(frame('Actor1', character({ index: 5, direction: 6, dir8: 3, pattern: 0 })), [3 * 48, (4 + 2) * 48, 48, 48]);
    // A "$" sheet: 3 × 4 frames; a diagonal facing keeps its four-way row.
    assert.deepEqual(frame('$Big', character({ direction: 4, dir8: 7, dx: -0.5, dy: -0.5 }), 144, 192), [48, 48, 48, 48]);
    assert.equal(ctx.ImageManager.isBigCharacter('$Big'), true);
    assert.equal(ctx.ImageManager.isBigCharacter('!$Door'), true);
    assert.equal(ctx.ImageManager.isBigCharacter('$Hero[8D]'), false);
    assert.equal(ctx.ImageManager.isEightDirCharacter('Hero[8d]'), true);
    assert.equal(ctx.ImageManager.isEightDirCharacter('Hero8D'), false);
});

test('a diagonal step keeps the diagonal as the facing after the turn to a straight direction', () => {
    const objects = read('reactor_objects_map.js');
    const body = definition(objects, 'Game_CharacterBase.prototype.moveDiagonally = function');
    assert.ok(body.lastIndexOf('this._reactorDir8 = d8') > body.indexOf('this.setDirection(vert)'));
});

test('the editor cuts [8D] sheets the same way', () => {
    const assets = require(path.join(repo, 'editor', 'src', 'utils', 'AssetFiles.js'));
    assert.equal(assets.isBigCharacter('$8D actor 2-4[8D]'), false);
    assert.equal(assets.isBigCharacter('$Actor-01'), true);
    assert.equal(assets.isEightDirCharacter('characters/$8D actor 2-4[8D].png'), true);
    // The event graphic picker cuts it as 12 × 8 frames; a click in block 7 picks character 7.
    const Picker = require(path.join(repo, 'editor', 'src', 'event', 'CharacterGraphicPicker.js'));
    const layout = Picker.sheetLayout(1200, 800, assets.isBigCharacter('$8D actor 2-4[8D]'));
    assert.deepEqual([layout.columns, layout.rows, layout.frameWidth, layout.frameHeight], [12, 8, 100, 100]);
    const cell = Picker.frameAt(layout, 10, 6);
    assert.deepEqual([cell.characterIndex, cell.pattern, cell.direction], [7, 1, 6]);
    for (const file of ['runtime/reactor_ui_fight.js', 'editor/src/utils/FightHud.js', 'editor/src/event/BattleSetup.js']) {
        assert.match(fs.readFileSync(path.join(repo, file), 'utf8'), /includes\('\$'\) && !\/\\\[8D\\\]\/i\.test/, file);
    }
});
