'use strict';
// A battle unit is never invisible. One rule says what it stands as (runtime/reactor_fight_look.js, the same file
// as editor/src/utils/FightLook.js): the event's own picture or model, else the model the Database binds to its
// record, else the record's character sheet, else an enemy's battler picture, else a plain figure in its side's
// color. The game asks it through ReactorFight.unitLook and eventLook (reactor_fight.js); the event's sprite draws
// the sheet, the picture or the figure (reactor_sprites.js) and a 3D scene's billboard reads the same picture
// (reactor_3d_models.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { realWorld, event, page } = require('./helpers/fight-real-world.cjs');

const repo = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');
const L = require(path.join(repo, 'runtime', 'reactor_fight_look.js'));
const plain = value => JSON.parse(JSON.stringify(value));

//-----------------------------------------------------------------------------
// The rule

const ENEMY = { team: 'enemy', record: 'enemy', id: 6 };
const ACTOR = { team: 'ally', record: 'actor', id: 2 };
const MODEL = { name: 'Actors/Raider', ext: '.glb', size: 3 };

test('the order for an enemy: its own look, the bound model, a note sheet, the battler picture, a plain figure', () => {
    const record = { id: 6, name: 'Raider', battlerName: 'Goblin', battlerHue: 0, note: '<move: 5>\n<unit character: Monster, 3>' };
    const all = { own: true, model: MODEL, record, sideView: false };
    assert.equal(L.resolve(ENEMY, all).kind, 'own');
    assert.deepEqual(L.resolve(ENEMY, Object.assign({}, all, { own: false })), { kind: 'model', team: 'enemy', color: '#ff5a4a', spec: MODEL });
    assert.deepEqual(L.resolve(ENEMY, { record }), { kind: 'character', team: 'enemy', color: '#ff5a4a', characterName: 'Monster', characterIndex: 3 });
    assert.deepEqual(L.resolve(ENEMY, { record: Object.assign({}, record, { note: '<move: 5>' }) }),
        { kind: 'picture', team: 'enemy', color: '#ff5a4a', folder: 'enemies', name: 'Goblin', hue: 0 });
    assert.deepEqual(L.resolve(ENEMY, { record: { id: 6, name: 'Raider', battlerName: '', note: '' } }), { kind: 'figure', team: 'enemy', color: '#ff5a4a' });
    // A model with no name is no model; a record that is not there leaves the figure.
    assert.equal(L.resolve(ENEMY, { model: { name: '' }, record }).kind, 'character');
    assert.equal(L.resolve(ENEMY, {}).kind, 'figure');
    assert.equal(L.resolve(ENEMY).kind, 'figure');
    assert.deepEqual(L.KINDS, ['own', 'model', 'character', 'picture', 'figure']);
});

test('the order for an actor: its own look, the bound model, its character graphic, a plain figure (never its battler sheet)', () => {
    const record = { id: 2, name: 'Mira', characterName: 'Actor1', characterIndex: 5, battlerName: 'Actor1_2', note: '<unit character: Other, 1>' };
    assert.equal(L.resolve(ACTOR, { own: true, model: MODEL, record }).kind, 'own');
    assert.equal(L.resolve(ACTOR, { model: MODEL, record }).kind, 'model');
    assert.deepEqual(L.resolve(ACTOR, { record }), { kind: 'character', team: 'ally', color: '#4aa8ff', characterName: 'Actor1', characterIndex: 5 });
    assert.deepEqual(L.resolve(ACTOR, { record: Object.assign({}, record, { characterName: '' }) }), { kind: 'figure', team: 'ally', color: '#4aa8ff' },
        'an actor with no character graphic: the figure, whatever its side-view battler and its note say');
});

test('the battler picture is the side-view one in a side-view game, with its hue', () => {
    const record = { battlerName: 'Bat', battlerHue: 200, note: '' };
    assert.deepEqual(plain(L.resolve(ENEMY, { record, sideView: true })), { kind: 'picture', team: 'enemy', color: '#ff5a4a', folder: 'sv_enemies', name: 'Bat', hue: 200 });
    assert.equal(L.resolve(ENEMY, { record, sideView: false }).folder, 'enemies');
    assert.equal(L.resolve(ENEMY, { record: { battlerName: 'Bat', battlerHue: -90 } }).hue, 270);
    assert.equal(L.resolve(ENEMY, { record: { battlerName: 'Bat', battlerHue: 720 } }).hue, 0);
    assert.equal(L.resolve(ENEMY, { record: { battlerName: 'Bat' } }).hue, 0);
});

test('a picture file that is not there is passed over', () => {
    const record = { battlerName: 'Gone', note: '<unit character: Lost, 0>' };
    const asked = [];
    const exists = (folder, name) => { asked.push(folder + '/' + name); return false; };
    assert.equal(L.resolve(ENEMY, { record, exists, sideView: true }).kind, 'figure');
    assert.deepEqual(asked, ['characters/Lost', 'sv_enemies/Gone']);
    assert.equal(L.resolve(ENEMY, { record, exists: folder => folder !== 'characters' }).kind, 'picture', 'the sheet is missing, the battler picture is there');
    assert.equal(L.resolve(ENEMY, { record, exists: () => undefined }).kind, 'character', 'only a plain false says a file is missing');
});

test('the figure takes its side\'s color; a project\'s own colors win; an unknown side is a bystander', () => {
    assert.equal(L.resolve({ team: 'ally', record: 'enemy', id: 1 }, {}).color, '#4aa8ff');
    assert.equal(L.resolve({ team: 'neutral', record: '', id: 0 }, {}).color, '#e6d15a');
    assert.deepEqual(L.resolve({ team: 'pirates' }, {}), { kind: 'figure', team: 'neutral', color: '#e6d15a' });
    assert.equal(L.resolve(null, {}).team, 'neutral');
    assert.equal(L.resolve(ENEMY, { colors: { enemy: '#AA0000', ally: 'red' } }).color, '#AA0000');
    assert.equal(L.color('ally', { ally: 'red' }), '#4aa8ff', 'a color that is no hex is not taken');
    assert.equal(L.shade('#ff5a4a', 0), 'rgb(255, 90, 74)');
    assert.equal(L.shade('#808080', 1), 'rgb(255, 255, 255)');
    assert.equal(L.shade('#808080', -1), 'rgb(0, 0, 0)');
    assert.equal(L.shade('#404040', -0.5), 'rgb(32, 32, 32)');
});

test('an enemy\'s <unit character: Name, index> note', () => {
    assert.deepEqual(L.unitCharacter('<unit character: Monster, 3>'), { characterName: 'Monster', characterIndex: 3 });
    assert.deepEqual(L.unitCharacter('<ai: ranged>\n<UNIT  Character:  $BigMonster1 >'), { characterName: '$BigMonster1', characterIndex: 0 }, 'no index is 0; letter case and spaces do not matter');
    assert.deepEqual(L.unitCharacter('<unit character: People 2,12>'), { characterName: 'People 2', characterIndex: 7 }, 'a sheet holds eight');
    assert.equal(L.unitCharacter('<unit character: >'), null);
    assert.equal(L.unitCharacter('<unit: enemy 5>'), null, 'the unit tag is another tag');
    assert.equal(L.unitCharacter(''), null);
    assert.equal(L.unitCharacter(undefined), null);
    assert.equal(L.recordCharacter({ record: 'enemy' }, { characterName: 'Actor1', note: '' }), null, 'an enemy record has no character field');
    assert.equal(L.recordCharacter({ record: '' }, { note: '<unit character: A, 1>' }), null, 'a bystander with no record has no sheet');
});

test('an event shows something of its own when its page has a picture, a tile or a model', () => {
    assert.equal(L.hasOwn({ tileId: 0, characterName: '' }, null), false);
    assert.equal(L.hasOwn({ tileId: 0, characterName: 'Actor1' }, null), true);
    assert.equal(L.hasOwn({ tileId: 12, characterName: '' }, null), true);
    assert.equal(L.hasOwn({ tileId: 0, characterName: '' }, { name: 'Props/Crate' }), true);
    assert.equal(L.hasOwn(null, { name: '' }), false);
    assert.equal(L.hasOwn(undefined, undefined), false);
});

test('a picture is fit to one tile wide and one and a half tall, its proportions kept; a typed size makes it that many tiles wide', () => {
    // Stock pictures on 48 pixel tiles: the box is 48 by 72.
    assert.deepEqual(L.fit(122, 124, 48, 48), { scale: 48 / 122, width: 48, height: 49 });
    assert.deepEqual(L.fit(350, 300, 48, 48), { scale: 48 / 350, width: 48, height: 41 });
    const tall = L.fit(100, 400, 48, 48);
    assert.deepEqual([tall.width, tall.height], [18, 72], 'a tall picture is held by the height');
    assert.deepEqual([L.fit(24, 24, 48, 48).width, L.fit(24, 24, 48, 48).height], [48, 48], 'a small picture grows');
    assert.deepEqual([L.fit(256, 384, 48, 48).width, L.fit(256, 384, 48, 48).height], [48, 72], 'the plain figure fills the box');
    assert.deepEqual([L.fit(256, 384, 32, 32).width, L.fit(256, 384, 32, 32).height], [32, 48]);
    assert.deepEqual([L.fit(350, 300, 48, 48, 2).width, L.fit(350, 300, 48, 48, 2).height], [96, 82], 'a unit two tiles wide');
    assert.deepEqual(L.fit(350, 300, 48, 48, 0), L.fit(350, 300, 48, 48, 1));
    assert.deepEqual([L.fit(0, 0, 48, 48).width, L.fit(0, 0, 48, 48).height], [48, 48], 'nothing to measure: still a size to draw at');
    assert.equal(L.TILES_WIDE, 1);
    assert.equal(L.TILES_TALL, 1.5);
});

test('a flat map\'s picture of a model is scaled so a unit stands no taller than a unit\'s picture', () => {
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' is not ' + b);
    near(L.modelFit(3), 1.5 / (3 * 0.574 + 0.3));
    assert.ok(L.modelFit(3) > 0.74 && L.modelFit(3) < 0.75);
    assert.equal(L.modelFit(1.5), 1, 'one that already fits is not enlarged');
    assert.equal(L.modelFit(40), 0.2, 'and nothing is drawn under a fifth');
    near(L.modelFit(6, 2), 3 / (6 * 0.574 + 0.3));
    assert.equal(L.modelFit(0), 1);
});

test('a picture\'s margin is cut off: the box of its art', () => {
    const width = 6, height = 5, data = new Uint8ClampedArray(width * height * 4);
    const put = (x, y, alpha) => { data[(y * width + x) * 4 + 3] = alpha; };
    assert.equal(L.trim(data, width, height), null, 'all of it clear');
    put(2, 1, 255); put(4, 3, 200); put(0, 4, L.TRIM_ALPHA);
    assert.deepEqual(L.trim(data, width, height), { x: 2, y: 1, width: 3, height: 3 }, 'a pixel as faint as the margin is margin');
    put(0, 4, L.TRIM_ALPHA + 1);
    assert.deepEqual(L.trim(data, width, height), { x: 0, y: 1, width: 5, height: 4 });
    data.fill(255);
    assert.deepEqual(L.trim(data, width, height), { x: 0, y: 0, width, height });
});

test('a battler\'s hue turns its picture as the battle screen turns it', () => {
    // The engine's own turn (ColorFilter): to hue, saturation and lightness, the hue moved, and back.
    const engine = (r, g, b, hue) => {
        r /= 255; g /= 255; b /= 255;
        const cmin = Math.min(r, g, b), cmax = Math.max(r, g, b), delta = cmax - cmin, l = (cmin + cmax) / 2;
        let h = 0, s = 0;
        if (delta > 0) {
            h = r === cmax ? (((g - b) / delta + 6) % 6) / 6 : g === cmax ? ((b - r) / delta + 2) / 6 : ((r - g) / delta + 4) / 6;
            if (l < 1) s = delta / (1 - Math.abs(2 * l - 1));
        }
        h = (h + hue / 360) % 1;
        const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h * 6) % 2 - 1)), m = l - c / 2;
        const out = h < 1 / 6 ? [c, x, 0] : h < 2 / 6 ? [x, c, 0] : h < 3 / 6 ? [0, c, x] : h < 4 / 6 ? [0, x, c] : h < 5 / 6 ? [x, 0, c] : [c, 0, x];
        return out.map(v => Math.round((v + m) * 255));
    };
    const turn = (pixel, hue) => Array.from(L.rotateHue(Uint8ClampedArray.from(pixel), hue));
    assert.deepEqual(turn([255, 0, 0, 255], 120), [0, 255, 0, 255]);
    assert.deepEqual(turn([255, 0, 0, 255], 240), [0, 0, 255, 255]);
    assert.deepEqual(turn([255, 0, 0, 128], -120), [0, 0, 255, 128], 'a turn the other way; the opacity is left alone');
    assert.deepEqual(turn([90, 90, 90, 255], 77), [90, 90, 90, 255], 'a gray has no hue');
    assert.deepEqual(turn([10, 200, 30, 0], 90), [10, 200, 30, 0], 'a clear pixel is not touched');
    assert.deepEqual(turn([10, 200, 30, 255], 0), [10, 200, 30, 255]);
    assert.deepEqual(turn([10, 200, 30, 255], 360), [10, 200, 30, 255]);
    for (const color of [[200, 40, 90], [12, 180, 240], [250, 250, 10], [33, 66, 99], [128, 255, 0], [1, 2, 3]]) {
        for (const hue of [30, 77, 145, 200, 290, 359]) {
            const got = turn(color.concat(255), hue), want = engine(color[0], color[1], color[2], hue);
            for (let i = 0; i < 3; i++) assert.ok(Math.abs(got[i] - want[i]) <= 1, `${color} by ${hue}: ${got} is not ${want}`);
        }
    }
});

/** A canvas context that keeps what was asked of it. */
function recorder(gradients = true) {
    const ops = [], set = {};
    const context = {
        ops, set,
        save() { ops.push(['save']); }, restore() { ops.push(['restore']); },
        beginPath() { ops.push(['beginPath']); }, closePath() { ops.push(['closePath']); },
        moveTo(x, y) { ops.push(['point', x, y]); }, lineTo(x, y) { ops.push(['point', x, y]); },
        quadraticCurveTo(cx, cy, x, y) { ops.push(['point', cx, cy]); ops.push(['point', x, y]); },
        arc(x, y, r) { ops.push(['arc', x, y, r]); },
        fill() { ops.push(['fill', context.fillStyle]); }, stroke() { ops.push(['stroke', context.strokeStyle, context.lineWidth]); }
    };
    if (gradients) context.createLinearGradient = (x0, y0, x1, y1) => ({ from: [x0, y0, x1, y1], stops: [], addColorStop(at, color) { this.stops.push([at, color]); } });
    return context;
}

test('the plain figure: a head over a body, in the side\'s color, its feet on the middle of the bottom edge', () => {
    const context = recorder();
    L.drawFigure(context, 10, 20, 48, 72, '#ff5a4a');
    const points = context.ops.filter(op => op[0] === 'point'), arcs = context.ops.filter(op => op[0] === 'arc');
    assert.equal(arcs.length, 1, 'one head');
    const [, headX, headY, radius] = arcs[0];
    assert.equal(headX, 34, 'in the middle of the box');
    assert.ok(headY - radius >= 20 && headY - radius < 22, 'the head touches the top');
    for (const [, x, y] of points) assert.ok(x >= 10 && x <= 58 && y >= 20 && y <= 92, `(${x}, ${y}) is inside the box`);
    const ground = Math.max(...points.map(point => point[2]));
    assert.ok(ground > 90 && ground <= 92, 'the body stands on the bottom edge (' + ground + ')');
    const feet = points.filter(point => point[2] === ground).map(point => point[1]);
    assert.equal(feet.length, 2);
    assert.ok(Math.abs((feet[0] + feet[1]) / 2 - 34) < 1e-9, 'feet either side of the middle');
    const top = Math.min(...points.map(point => point[2]));
    assert.ok(top > headY + radius, 'the body begins under the head');
    const fills = context.ops.filter(op => op[0] === 'fill'), strokes = context.ops.filter(op => op[0] === 'stroke');
    assert.equal(fills.length, 2);
    assert.equal(strokes.length, 2);
    assert.ok(fills[0][1].stops.some(stop => stop[1] === '#ff5a4a'), 'painted in the side\'s color');
    assert.equal(strokes[0][1], L.shade('#ff5a4a', -0.6), 'outlined in its dark');
    assert.deepEqual([context.ops[0][0], context.ops[context.ops.length - 1][0]], ['save', 'restore'], 'the context is left as it was');
});

test('the plain figure keeps its proportions in any box and needs no gradient', () => {
    const wide = recorder(false);
    L.drawFigure(wide, 0, 0, 200, 72, '#4aa8ff');
    const xs = wide.ops.filter(op => op[0] === 'point').map(op => op[1]);
    assert.ok(Math.min(...xs) >= 76 && Math.max(...xs) <= 124, 'as wide as its height allows, in the middle');
    assert.equal(wide.ops.find(op => op[0] === 'fill')[1], '#4aa8ff');
    const tall = recorder();
    L.drawFigure(tall, 0, 0, 48, 300, 'no color');
    const ys = tall.ops.filter(op => op[0] === 'point').map(op => op[2]);
    assert.ok(Math.min(...ys) > 228 && Math.max(...ys) <= 300, 'as tall as its width allows, standing on the bottom');
    assert.ok(tall.ops.find(op => op[0] === 'fill')[1].stops.some(stop => stop[1] === L.COLORS.neutral), 'a color that is none is the bystanders\'');
});

//-----------------------------------------------------------------------------
// One file for the game and the editor

test('the editor loads the rule byte for byte, and the game boots it before the battle core', () => {
    assert.equal(read('editor/src/utils/FightLook.js'), read('runtime/reactor_fight_look.js'));
    const index = read('editor/index.html');
    assert.equal(index.split('src/utils/FightLook.js').length, 2, 'one script line');
    assert.ok(index.indexOf('src/utils/FightLook.js') < index.indexOf('src/event/BattleSetup.js'), 'before Battle Setup, which draws with it');
    const scripts = Array.from(read('runtime/reactor_main.js').match(/"js\/[^"]+"/g), quoted => quoted.slice(4, -1));
    assert.ok(scripts.includes('reactor_fight_look.js'));
    assert.ok(scripts.indexOf('reactor_fight_look.js') < scripts.indexOf('reactor_fight.js'));
    for (const file of ['build.js', 'build-worker.js', 'dist-editor-worker.js']) {
        assert.ok(read('editor/build-scripts/' + file).includes("'reactor_fight_look.js'"), file + ' checks a project for it');
    }
});

test('the rule needs nothing of a running game: it loads alone and names no game global', () => {
    const source = read('runtime/reactor_fight_look.js');
    const context = vm.createContext({});
    vm.runInContext(source, context, { filename: 'reactor_fight_look.js' });
    assert.equal(typeof context.ReactorFightLook.resolve, 'function');
    assert.deepEqual(plain(context.ReactorFightLook.resolve({ team: 'enemy', record: 'enemy', id: 1 }, { record: { battlerName: 'Bat' } })),
        { kind: 'picture', team: 'enemy', color: '#ff5a4a', folder: 'enemies', name: 'Bat', hue: 0 });
    assert.doesNotMatch(source, /\$data|\$game|ImageManager|document\.|Reactor3D|PIXI|THREE/);
});

//-----------------------------------------------------------------------------
// The game: what a record and an event stand as

const SPEC = { name: 'Actors/Raider', ext: '.glb', size: 3, scale: 1, yaw: 0 };
const pictured = { tileId: 0, characterName: 'People1', characterIndex: 2, direction: 2, pattern: 1 };
const comment = text => [{ code: 108, indent: 0, parameters: [text] }, { code: 0, indent: 0, parameters: [] }];
const row = (id, x, y, rrUnit, extra = {}) => event(id, x, y, Object.assign({ rrUnit }, extra));

/** The game's objects over the real 3D runtime, with the look rule loaded as the game loads it. */
function world(options = {}) {
    const w = realWorld(Object.assign({ flat: true }, options));
    vm.runInContext(read('runtime/reactor_fight_look.js'), w, { filename: 'reactor_fight_look.js' });
    // Slime and Bat have battler pictures; three more records for the other looks.
    const enemy = (id, fields) => Object.assign(JSON.parse(JSON.stringify(w.$dataEnemies[1])), { id }, fields);
    w.$dataEnemies = w.$dataEnemies.concat([
        enemy(3, { name: 'Nobody', battlerName: '' }),
        enemy(4, { name: 'Sheet', battlerName: 'Bat', note: '<unit character: Monster, 3>' }),
        enemy(5, { name: 'Hue', battlerName: 'Slime', battlerHue: 120 })
    ]);
    return w;
}
const bind = (w, section, id, spec = SPEC) => {
    const sidecar = Object.assign({}, w.Reactor3D._databaseSidecar || {});
    sidecar[section] = Object.assign({}, sidecar[section], { [id]: spec });
    w.Reactor3D._databaseSidecar = sidecar;
};

test('a record\'s look in the game: model, sheet, battler picture, figure, in that order', () => {
    const w = world(), F = w.ReactorFight;
    assert.deepEqual(plain(F.unitLook('enemy', 1)), { kind: 'picture', team: 'enemy', color: '#ff5a4a', folder: 'enemies', name: 'Slime', hue: 0 });
    assert.deepEqual(plain(F.unitLook('enemy', 5)), { kind: 'picture', team: 'enemy', color: '#ff5a4a', folder: 'enemies', name: 'Slime', hue: 120 });
    assert.deepEqual(plain(F.unitLook('enemy', 4)), { kind: 'character', team: 'enemy', color: '#ff5a4a', characterName: 'Monster', characterIndex: 3 });
    assert.deepEqual(plain(F.unitLook('enemy', 3)), { kind: 'figure', team: 'enemy', color: '#ff5a4a' });
    assert.deepEqual(plain(F.unitLook('actor', 2)), { kind: 'character', team: 'ally', color: '#4aa8ff', characterName: 'Actor1', characterIndex: 1 });
    assert.deepEqual(plain(F.unitLook('enemy', 3, 'ally')), { kind: 'figure', team: 'ally', color: '#4aa8ff' }, 'an enemy record on the allies\' side');
    assert.deepEqual(plain(F.unitLook('enemy', 99)), { kind: 'figure', team: 'enemy', color: '#ff5a4a' }, 'a record that is not there: never nothing');
    assert.deepEqual(plain(F.unitLook('', 0, 'neutral')), { kind: 'figure', team: 'neutral', color: '#e6d15a' }, 'a bystander with no record');
    assert.equal(F.unitLook('enemy', 1), F.unitLook('enemy', 1), 'the answer is kept, not made again');
    assert.ok(Object.isFrozen(F.unitLook('enemy', 1)));
    // An actor and an enemy of one number are two records, also on one side.
    assert.equal(F.unitLook('enemy', 3, 'ally').kind, 'figure');
    assert.deepEqual(plain(F.unitLook('actor', 3, 'ally')), { kind: 'character', team: 'ally', color: '#4aa8ff', characterName: 'Actor1', characterIndex: 2 });
    assert.equal(F.unitLook('enemy', 3, 'ally').kind, 'figure');
    assert.equal(F.unitLook('actor', 3, 'enemy').kind, 'character');
    assert.equal(F.unitLook('enemy', 3, 'enemy').kind, 'figure');
    // A side-view game stands the side-view picture up.
    w.$dataSystem.optSideView = true;
    assert.equal(F.unitLook('enemy', 1).folder, 'sv_enemies');
    w.$dataSystem.optSideView = false;
    // The Database binds a model: it comes before everything the record itself holds.
    bind(w, 'enemies', 4);
    assert.equal(F.unitLook('enemy', 4).kind, 'model');
    assert.equal(F.unitLook('enemy', 4).spec.name, 'Actors/Raider');
    bind(w, 'actors', 2, { character: SPEC });
    assert.equal(F.unitLook('actor', 2).kind, 'model');
    assert.equal(F.unitLook('enemy', 1).kind, 'picture', 'a record it binds nothing to is as before');
});

test('a bound model whose file could not be read is nobody\'s look: the next thing the record gives', () => {
    const w = world({ events: [row(1, 5, 5, { team: 'enemy', record: 'enemy', id: 1 }), row(2, 6, 5, { team: 'enemy', record: 'enemy', id: 3 })] });
    const F = w.ReactorFight, R = w.Reactor3D;
    bind(w, 'enemies', 1); bind(w, 'enemies', 3);
    assert.equal(F.unitLook('enemy', 1).kind, 'model', 'still being read: the model');
    assert.equal(R.characterModelSpec(w.$gameMap.event(1)).name, 'Actors/Raider');
    R._glbCache[R.modelCacheKey(SPEC.name, SPEC.ext, '')] = { promise: Promise.resolve(null), template: null, failed: true };
    assert.equal(F.unitLook('enemy', 1).kind, 'picture');
    assert.equal(F.unitLook('enemy', 3).kind, 'figure');
    assert.equal(R.characterModelSpec(w.$gameMap.event(1)), null, 'and the event wears no model');
    assert.equal(F.eventLook(w.$gameMap.event(1)).kind, 'picture');
    assert.equal(F.eventLook(w.$gameMap.event(2)).kind, 'figure');
});

test('an event\'s look: its own picture or model first, then its record\'s; nothing for an event that is no unit', () => {
    const w = world({ events: [
        row(1, 5, 5, { team: 'enemy', record: 'enemy', id: 1 }),
        row(2, 6, 5, { team: 'enemy', record: 'enemy', id: 1 }, { pages: [page({ image: pictured })] }),
        row(3, 7, 5, { team: 'enemy', record: 'enemy', id: 1 }, { note: '<r3d: Props/Statue>' }),
        event(4, 8, 5),
        event(5, 9, 5, { note: '<unit: neutral>' }),
        event(6, 10, 5, { note: '<unit: ally 2>' }),
        row(7, 11, 5, { team: 'ally', record: 'actor', id: 3 }, { pages: [page({ image: { tileId: 9, characterName: '', characterIndex: 0, direction: 2, pattern: 0 } })] }),
        row(8, 12, 5, { team: 'enemy', record: 'enemy', id: 1 })
    ], sidecar: { events: { 8: { 0: { name: 'Props/Statue', ext: '.glb', size: 1, scale: 1, yaw: 0 } } } } });
    const F = w.ReactorFight, look = id => F.eventLook(w.$gameMap.event(id));
    // A model the map gives the event itself: its own look, whatever its record would stand as, and the model it wears.
    assert.equal(F.ownModelSpec(w.$gameMap.event(8)).name, 'Props/Statue');
    assert.deepEqual(plain(look(8)), { kind: 'own', team: 'enemy', color: '#ff5a4a' });
    assert.equal(F.ownModelSpec(w.$gameMap.event(1)), null);
    bind(w, 'enemies', 1);
    w.Graphics.frameCount += F.LOOK_BEAT;
    assert.equal(look(8).kind, 'own');
    assert.equal(w.Reactor3D.characterModelSpec(w.$gameMap.event(8)).name, 'Props/Statue', 'not the model the Database binds to its record');
    assert.equal(look(1).kind, 'model');
    w.Reactor3D._databaseSidecar = null;
    w.Graphics.frameCount += F.LOOK_BEAT;
    assert.deepEqual(plain(look(1)), { kind: 'picture', team: 'enemy', color: '#ff5a4a', folder: 'enemies', name: 'Slime', hue: 0 });
    assert.deepEqual(plain(look(2)), { kind: 'own', team: 'enemy', color: '#ff5a4a' }, 'a character picture of its own');
    assert.equal(look(7).kind, 'own', 'a tile of its own');
    assert.equal(w.Reactor3D.modelSpecFromNote(w.$dataMap.events[3].note) ? look(3).kind : 'own', 'own', 'a model of its own');
    assert.equal(look(4), null, 'no unit: no look');
    assert.deepEqual(plain(look(5)), { kind: 'figure', team: 'neutral', color: '#e6d15a' }, 'a bystander with no record still stands as something');
    assert.deepEqual(plain(look(6)), { kind: 'character', team: 'ally', color: '#4aa8ff', characterName: 'Actor1', characterIndex: 1 });
    assert.equal(F.eventLook($player(w)), null, 'the player is no event');
    assert.equal(F.eventLook(null), null);
    // Erased (a fallen unit), it shows nothing and has no look.
    w.$gameMap.event(1).erase();
    assert.equal(look(1), null);
});
const $player = w => w.$gamePlayer;

test('a unit made by a comment has its look on that page only; an event with no page met has none', () => {
    const gated = conditions => Object.assign(page().conditions, conditions);
    const w = world({ events: [
        event(1, 5, 5, { pages: [page(), page({ conditions: gated({ switch1Valid: true, switch1Id: 4 }), list: comment('<unit: enemy 3>') })] }),
        event(2, 6, 5, { rrUnit: { team: 'enemy', record: 'enemy', id: 1 }, pages: [page({ conditions: gated({ switch1Valid: true, switch1Id: 5 }) })] }),
        event(3, 7, 5, { pages: [page({ list: comment('PTBS_Enemy: 3') })] })
    ] });
    const F = w.ReactorFight, R = w.Reactor3D, look = id => F.eventLook(w.$gameMap.event(id));
    bind(w, 'enemies', 3);
    assert.equal(look(1), null, 'page 1 names no unit');
    assert.equal(R.characterModelSpec(w.$gameMap.event(1)), null);
    assert.equal(look(2), null, 'a row whose only page is not met is not on the map');
    assert.equal(R.characterModelSpec(w.$gameMap.event(2)), null);
    assert.equal(look(3).kind, 'model', 'a unit of the plugin\'s own tag is a unit');
    w.$gameSwitches.setValue(4, true); w.$gameSwitches.setValue(5, true);
    w.$gameMap.event(1).refresh(); w.$gameMap.event(2).refresh();
    assert.equal(look(1).kind, 'model', 'on its page the comment unit wears its record\'s model');
    assert.equal(R.characterModelSpec(w.$gameMap.event(1)).name, 'Actors/Raider');
    assert.equal(look(2).kind, 'picture');
    w.$gameSwitches.setValue(4, false);
    w.$gameMap.event(1).refresh();
    assert.equal(look(1), null, 'and off it nothing');
    assert.equal(R.characterModelSpec(w.$gameMap.event(1)), null);
});

test('the event\'s own picture comes before a model the Database binds; a spawned unit\'s record sheet does not', () => {
    const w = world({ events: [
        row(1, 5, 5, { team: 'ally', record: 'actor', id: 1 }),
        row(2, 6, 5, { team: 'ally', record: 'actor', id: 1 }, { pages: [page({ image: pictured })] }),
        row(3, 7, 5, { team: 'ally', record: 'actor', id: 1 }, { pages: [page({ image: { tileId: 0, characterName: 'Actor1', characterIndex: 0, direction: 2, pattern: 1 } })] })
    ] });
    const F = w.ReactorFight, R = w.Reactor3D;
    bind(w, 'actors', 1, { character: SPEC });
    assert.equal(R.characterModelSpec(w.$gameMap.event(1)).name, 'Actors/Raider', 'no picture of its own: the record\'s model');
    assert.equal(F.eventLook(w.$gameMap.event(1)).kind, 'model');
    assert.equal(R.characterModelSpec(w.$gameMap.event(2)), null, 'its own picture stays');
    assert.equal(F.eventLook(w.$gameMap.event(2)).kind, 'own');
    assert.equal(R.characterModelSpec(w.$gameMap.event(3)), null, 'even when it is the sheet the record names: the author put it there');
    // Spawn Unit writes the record's sheet into the event it makes: that is the record's look, so the model still comes first.
    w.$gameFight.spawn({ record: 'actor', id: 1, team: 'ally', x: 12, y: 12 });
    const spawned = w.$gameMap.events().find(each => each.event().rrSpawned);
    assert.equal(spawned.characterName(), 'Actor1');
    assert.equal(R.characterModelSpec(spawned).name, 'Actors/Raider');
    assert.equal(F.eventLook(spawned).kind, 'model');
    // Given another picture by a move route, it is its own: another sheet, or another character of the same sheet.
    spawned.setImage('People1', 0);
    assert.equal(R.characterModelSpec(spawned), null);
    assert.equal(F.eventLook(spawned).kind, 'own');
    spawned.setImage('Actor1', 0);
    assert.equal(F.eventLook(spawned).kind, 'model', 'the record\'s sheet again');
    spawned.setImage('Actor1', 4);
    assert.equal(F.hasOwnPicture(spawned, F.lookUnit(spawned)), true);
    w.Graphics.frameCount += F.LOOK_BEAT;
    assert.equal(R.characterModelSpec(spawned), null);
    assert.equal(F.eventLook(spawned).kind, 'own');
});

test('a plain figure wears the color of the side a command gave the unit', () => {
    const w = world({ events: [row(1, 5, 5, { team: 'enemy', record: 'enemy', id: 3 }), row(2, 6, 5, { team: 'enemy', record: 'enemy', id: 3 })] });
    const F = w.ReactorFight, look = id => F.eventLook(w.$gameMap.event(id));
    assert.equal(look(1).color, '#ff5a4a');
    assert.equal(w.$gameFight.setEventSide(1, 'ally'), true);
    assert.deepEqual(plain(look(1)), { kind: 'figure', team: 'ally', color: '#4aa8ff' });
    assert.equal(look(2).color, '#ff5a4a', 'the other one keeps its side');
    w.$gameFight.setEventSide(1, 'neutral');
    assert.equal(look(1).color, '#e6d15a');
    w.$gameFight.setEventSide(1, 'default');
    assert.equal(look(1).color, '#ff5a4a');
});

test('the look is kept beside the event between beats, read again at once when its page or picture changes, and never saved', () => {
    const gated = Object.assign(page().conditions, { switch1Valid: true, switch1Id: 4 });
    const w = world({ events: [
        row(1, 5, 5, { team: 'enemy', record: 'enemy', id: 3 }),
        event(2, 6, 5, { rrUnit: { team: 'enemy', record: 'enemy', id: 3 }, pages: [page(), page({ conditions: gated, image: pictured })] }),
        event(3, 7, 5, { pages: [page({ list: comment('<unit: enemy 3>') }), page({ conditions: Object.assign(page().conditions, { switch1Valid: true, switch1Id: 5 }) })] })
    ] });
    const F = w.ReactorFight, one = w.$gameMap.event(1), two = w.$gameMap.event(2), three = w.$gameMap.event(3);
    w.Graphics.frameCount = 100;
    let reads = 0;
    const unitSpecOf = F.unitSpecOf, lookUnit = F.lookUnit;
    F.lookUnit = function(character) { reads++; return lookUnit.call(this, character); };
    const first = F.eventLook(one);
    assert.equal(first.kind, 'figure');
    for (let frame = 101; frame < 100 + F.LOOK_BEAT; frame++) { w.Graphics.frameCount = frame; assert.equal(F.eventLook(one), first); }
    assert.equal(reads, 1, 'asked every frame, read once a beat');
    // A side changed by a command shows on the next beat.
    w.$gameFight.setEventSide(1, 'ally');
    assert.equal(F.eventLook(one).team, 'enemy');
    w.Graphics.frameCount = 100 + F.LOOK_BEAT;
    assert.equal(F.eventLook(one).team, 'ally');
    assert.equal(reads, 2);
    // A page change is seen the same frame.
    assert.equal(F.eventLook(two).kind, 'figure');
    w.$gameSwitches.setValue(4, true); two.refresh();
    assert.equal(F.eventLook(two).kind, 'own');
    w.$gameSwitches.setValue(4, false); two.refresh();
    assert.equal(F.eventLook(two).kind, 'figure');
    // Also when neither page has a picture: a unit by a comment on page 1, nobody on page 2.
    assert.equal(F.eventLook(three).kind, 'figure');
    w.$gameSwitches.setValue(5, true); three.refresh();
    assert.equal(three.characterName(), '');
    assert.equal(F.eventLook(three), null, 'the page that names no unit: no look, the same frame');
    w.$gameSwitches.setValue(5, false); three.refresh();
    assert.equal(F.eventLook(three).kind, 'figure');
    // So is a picture a move route gives it.
    one.setImage('People1', 1);
    assert.equal(F.eventLook(one).kind, 'own');
    one.setImage('', 0);
    assert.equal(F.eventLook(one).kind, 'figure');
    // And a tile.
    one.setTileImage(9);
    assert.equal(F.eventLook(one).kind, 'own');
    one.setImage('', 0);
    assert.equal(F.eventLook(one).kind, 'figure');
    // A frame count that goes back (a loaded game counts from where it was saved): what was kept is read again.
    assert.equal(F.eventLook(one).team, 'ally');
    w.$gameFight.setEventSide(1, 'neutral');
    assert.equal(F.eventLook(one).team, 'ally', 'within the beat: as kept');
    w.Graphics.frameCount = 7;
    assert.equal(F.eventLook(one).team, 'neutral');
    F.lookUnit = lookUnit;
    assert.equal(F.unitSpecOf, unitSpecOf);
    // What is kept is not part of the event's own fields: a save does not carry it.
    assert.equal(Object.keys(one).includes('_rrLookKept'), false);
    assert.doesNotMatch(w.JsonEx.stringify(one), /_rrLookKept|figure/);
});

test('an event\'s unit is read from its page once, however often the 3D view asks', () => {
    const w = world({ events: [event(1, 5, 5, { pages: [page({ list: comment('<unit: enemy 1>') })] }), event(2, 6, 5)] });
    const F = w.ReactorFight, R = w.Reactor3D;
    bind(w, 'enemies', 1);
    let scans = 0;
    const unitSpecOf = F.unitSpecOf;
    F.unitSpecOf = function(data, list) { scans++; return unitSpecOf.call(this, data, list); };
    for (let i = 0; i < 50; i++) { R.characterModelSpec(w.$gameMap.event(1)); R.characterModelSpec(w.$gameMap.event(2)); F.lookUnit(w.$gameMap.event(1)); }
    assert.equal(scans, 2, 'one read of each event\'s page');
    assert.equal(F.lookUnit(w.$gameMap.event(1)).id, 1);
    assert.equal(F.lookUnit(w.$gameMap.event(2)), null);
    // The row written on the event later (a script) is seen: the page's answer is held against the event's own fields.
    w.$dataMap.events[2].rrUnit = { team: 'enemy', record: 'enemy', id: 3 };
    assert.equal(F.lookUnit(w.$gameMap.event(2)).id, 3);
    F.unitSpecOf = unitSpecOf;
});

test('the model a unit wears is worked out once a frame, and again at once when its page or its picture changes', () => {
    const gated = Object.assign(page().conditions, { switch1Valid: true, switch1Id: 4 });
    const w = world({ events: [
        row(1, 5, 5, { team: 'enemy', record: 'enemy', id: 1 }),
        event(2, 6, 5, { rrUnit: { team: 'enemy', record: 'enemy', id: 1 }, pages: [page(), page({ conditions: gated, image: pictured })] }),
        event(3, 7, 5, { pages: [page({ list: comment('<unit: enemy 1>') }),
            page({ conditions: Object.assign(page().conditions, { switch1Valid: true, switch1Id: 6 }), list: comment('<unit: enemy 2>') })] })
    ] });
    const R = w.Reactor3D, one = w.$gameMap.event(1), two = w.$gameMap.event(2);
    bind(w, 'enemies', 1);
    let asks = 0;
    const databaseModelSpec = R.databaseModelSpec;
    R.databaseModelSpec = function(section, id) { asks++; return databaseModelSpec.call(this, section, id); };
    w.Graphics.frameCount = 200;
    for (let i = 0; i < 40; i++) assert.equal(R.characterModelSpec(one).name, 'Actors/Raider');
    assert.equal(asks, 1, 'forty asks in one frame, one look at the Database');
    w.Graphics.frameCount = 201;
    R.characterModelSpec(one); R.characterModelSpec(one);
    assert.equal(asks, 2, 'and one the next frame');
    // Its page changes inside a frame: the page with a picture of its own wears no model, at once; and back.
    assert.equal(R.characterModelSpec(two).name, 'Actors/Raider');
    w.$gameSwitches.setValue(4, true); two.refresh();
    assert.equal(R.characterModelSpec(two), null);
    w.$gameSwitches.setValue(4, false); two.refresh();
    assert.equal(R.characterModelSpec(two).name, 'Actors/Raider');
    // Two pages with no picture that name different units: the other page's model, in the same frame.
    bind(w, 'enemies', 2, { name: 'Actors/Bat', ext: '.glb', size: 2, scale: 1, yaw: 0 });
    w.Graphics.frameCount = 210;
    const three = w.$gameMap.event(3);
    assert.equal(R.characterModelSpec(three).name, 'Actors/Raider');
    w.$gameSwitches.setValue(6, true); three.refresh();
    assert.equal(three.characterName(), '');
    assert.equal(R.characterModelSpec(three).name, 'Actors/Bat');
    // The model's file turns out to be unreadable: seen from the next frame.
    R._glbCache[R.modelCacheKey(SPEC.name, SPEC.ext, '')] = { promise: Promise.resolve(null), template: null, failed: true };
    w.Graphics.frameCount = 202;
    assert.equal(R.characterModelSpec(one), null);
    // Erased, it wears nothing in the same frame.
    R._glbCache[R.modelCacheKey(SPEC.name, SPEC.ext, '')].failed = false;
    w.Graphics.frameCount = 203;
    assert.equal(R.characterModelSpec(one).name, 'Actors/Raider');
    // A picture a move route gives it is its own from that ask on, and the model is back when it is taken away.
    one.setImage('People1', 1);
    assert.equal(R.characterModelSpec(one), null);
    one.setImage('', 0);
    assert.equal(R.characterModelSpec(one).name, 'Actors/Raider');
    one.erase();
    assert.equal(R.characterModelSpec(one), null);
    R.databaseModelSpec = databaseModelSpec;
    assert.equal(Object.keys(one).includes('_rrWornKept'), false, 'what is kept is not saved with the event');
});

//-----------------------------------------------------------------------------
// The sprite: the sheet, the picture and the figure on the map

/**
 * The game's character sprite (the class, its late bitmap step and the look's functions, cut from
 * reactor_sprites.js) over a bitmap that keeps what was drawn on it and loads when the test says so.
 */
function spriteWorld(options = {}) {
    const w = world(options);
    vm.runInContext(`
        Utils.encodeURI = name => encodeURIComponent(name).replace(/%2F/g, "/");
        Bitmap = class Bitmap {
            constructor(width, height) {
                this.width = width || 0; this.height = height || 0; this._loadingState = "none"; this._url = ""; this.ops = []; this.uploads = 0;
                this._baseTexture = { update: () => { this.uploads++; }, destroy() {} };
                const ops = this.ops, bitmap = this;
                this._context = {
                    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, stroke() {},
                    fill() { ops.push(["fill", this.fillStyle]); },
                    createLinearGradient() { return { stops: [], addColorStop(at, color) { this.stops.push(color); } }; },
                    drawImage(...args) { ops.push(["drawImage", ...args]); },
                    getImageData(x, y, width, height) { ops.push(["getImageData", x, y, width, height]); return { data: bitmap.pixels, width, height }; },
                    putImageData(image) { ops.push(["putImageData", Array.from(image.data.slice(0, 4))]); }
                };
                Bitmap.made.push(this);
            }
            static load(url, fallbacks) {
                const bitmap = new Bitmap(0, 0);
                bitmap._url = url; bitmap._loadingState = "loading";
                Bitmap.loads.push(bitmap);
                (Bitmap._loadWatchList = Bitmap._loadWatchList || []).push(bitmap);
                return bitmap;
            }
            get url() { return this._url; }
            get context() { return this._context; }
            get canvas() { return this._canvas || (this._canvas = { of: this, width: this.width, height: this.height }); }
            isReady() { return this._loadingState === "loaded" || this._loadingState === "none"; }
            isError() { return this._loadingState === "error"; }
            addLoadListener(listener) { if (this.isReady()) listener(this); }
            destroy() { this.destroyed = true; }
            /** The file has been read: a picture of this size, every pixel as given, clear outside 'art'. */
            arrive(width, height, art, color = [200, 40, 40, 255]) {
                this.width = width; this.height = height; this._loadingState = "loaded";
                this.pixels = new Uint8ClampedArray(width * height * 4);
                for (let y = art.y; y < art.y + art.height; y++) for (let x = art.x; x < art.x + art.width; x++) this.pixels.set(color, (y * width + x) * 4);
            }
            miss() { this._loadingState = "error"; }
        };
        Bitmap.made = []; Bitmap.loads = [];
        ImageManager._emptyBitmap = new Bitmap(1, 1);
        Sprite = function Sprite() { this.initialize(...arguments); };
        Sprite.prototype.initialize = function() { this.anchor = { x: 0, y: 0 }; this.scale = { x: 1, y: 1 }; this.skew = { x: 0, y: 0 }; this.bitmap = null; this.visible = true; this.children = []; this._frame = { x: 0, y: 0, width: 0, height: 0 }; };
        Sprite.prototype.update = function() {};
        Sprite.prototype.updateVisibility = function() { this.visible = true; };
        Sprite.prototype.destroy = function() {};
        Sprite.prototype.addChild = function(child) { this.children.push(child); return child; };
        Sprite.prototype.getBlendColor = function() { return [0, 0, 0, 0]; };
        Sprite.prototype.setBlendColor = function() {};
        Sprite.prototype.getColorTone = function() { return [0, 0, 0, 0]; };
        Sprite.prototype.setColorTone = function() {};
        // As the engine's: every cut is counted, and one that moves the frame is a texture made again.
        Sprite.cuts = 0; Sprite.recuts = 0;
        Sprite.prototype.setFrame = function(x, y, width, height) {
            const was = this._frame;
            Sprite.cuts++;
            if (was.x !== x || was.y !== y || was.width !== width || was.height !== height) Sprite.recuts++;
            this._frame = { x, y, width, height };
        };
    `, w);
    const source = read('runtime/reactor_sprites.js');
    const cut = (from, to) => { const a = source.indexOf(from); assert.ok(a >= 0, from); const b = to ? source.indexOf(to, a) : source.length; assert.ok(b > a, to); return source.slice(a, b); };
    vm.runInContext(cut('function Sprite_Character() {', '//-----------------------------------------------------------------------------\n// Sprite_Battler'), w, { filename: 'reactor_sprites.js' });
    vm.runInContext(cut('const _reactorSpriteCharacterUpdateBitmap = Sprite_Character.prototype.updateBitmap;', '// A battler-slot actor binding renders the actor'), w, { filename: 'reactor_sprites.js' });
    vm.runInContext(cut('const _rrMultiPatternWidth = Sprite_Character.prototype.patternWidth;'), w, { filename: 'reactor_sprites.js' });
    w.sprite = id => { const made = vm.runInContext('(id => new Sprite_Character($gameMap.event(id)))', w)(id); return made; };
    w.step = sprite => { sprite.updateBitmap(); sprite.updateFrame(); return sprite; };
    return w;
}
const UNIT = id => ({ team: 'enemy', record: 'enemy', id });

test('a unit with only a battler picture stands as it: cut to its art, fit to its tile, never through the image cache', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(1))] });
    const sprite = w.step(w.sprite(1));
    assert.equal(w.Bitmap.loads.length, 1);
    assert.equal(w.Bitmap.loads[0].url, 'img/enemies/Slime.png');
    assert.deepEqual(Object.keys(w.ImageManager._cache), [], 'the picture is not the image cache\'s to fail on');
    assert.equal(sprite.isEmptyCharacter(), true, 'nothing to show while the file is read');
    // The file arrives: 200 by 120, its art the 100 by 100 in the middle.
    w.Bitmap.loads[0].arrive(200, 120, { x: 50, y: 10, width: 100, height: 100 });
    w.step(sprite);
    assert.equal(sprite.isEmptyCharacter(), false);
    assert.deepEqual([sprite.bitmap.width, sprite.bitmap.height], [48, 48], 'the art, one tile wide');
    assert.deepEqual(plain(sprite._frame), { x: 0, y: 0, width: 48, height: 48 }, 'the whole picture is the frame');
    const state = sprite._rrLook;
    assert.deepEqual([state.full.width, state.full.height], [100, 100], 'the copy the 3D view draws: the art alone');
    assert.deepEqual(Array.from(state.full.ops[0]).slice(2), [50, 10, 100, 100, 0, 0, 100, 100], 'cut out of its margin');
    assert.deepEqual([state.wide, state.tall], [1, 1], 'its size in tiles');
    assert.equal(sprite.bitmap.ops[0][1], state.full.canvas, 'the tile-sized picture is drawn from that copy');
    assert.deepEqual(Array.from(sprite.bitmap.ops[0]).slice(2), [0, 0, 100, 100, 0, 0, 48, 48]);
    assert.ok(sprite.bitmap.uploads >= 1 && state.full.uploads >= 1, 'both reach the GPU');
    assert.equal(w.Bitmap.loads[0].destroyed, true, 'the file\'s own copy is given back');
    assert.deepEqual([sprite.patternWidth(), sprite.patternHeight()], [48, 48]);
    assert.equal(sprite._characterName || '', '');
});

test('a larger picture is kept no larger than the 3D view needs, and a hue is turned once in the picture', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(5)), row(2, 6, 5, UNIT(5)), row(3, 7, 5, UNIT(1))] });
    const a = w.step(w.sprite(1)), b = w.step(w.sprite(2)), c = w.step(w.sprite(3));
    assert.equal(w.Bitmap.loads.length, 2, 'one file a picture and hue, however many stand as it');
    const [hued, natural] = w.Bitmap.loads;
    hued.arrive(1200, 900, { x: 0, y: 0, width: 1200, height: 900 }, [255, 0, 0, 255]);
    natural.arrive(1200, 900, { x: 0, y: 0, width: 1200, height: 900 }, [255, 0, 0, 255]);
    w.step(a); w.step(b); w.step(c);
    assert.deepEqual([a._rrLook.full.width, a._rrLook.full.height], [512, 384]);
    assert.equal(a._rrLook.full, b._rrLook.full, 'forty of one record share one picture');
    assert.equal(a.bitmap, b.bitmap);
    assert.notEqual(a.bitmap, c.bitmap);
    assert.deepEqual(Array.from(hued.ops.find(op => op[0] === 'putImageData')[1]), [0, 255, 0, 255], 'red turned by 120 is green');
    assert.equal(natural.ops.some(op => op[0] === 'putImageData'), false, 'no hue: the pixels are left alone');
    assert.deepEqual([a.bitmap.width, a.bitmap.height], [48, 36]);
    assert.ok(Math.abs(a._rrLook.tall - 0.75) < 1e-9);
});

test('a picture whose file is missing makes its unit a plain figure, not a load error', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(1))] });
    const sprite = w.step(w.sprite(1)), file = w.Bitmap.loads[0];
    file.miss();
    w.step(sprite);
    assert.equal(sprite.isEmptyCharacter(), false);
    assert.deepEqual([sprite.bitmap.width, sprite.bitmap.height], [48, 72]);
    assert.ok(sprite.bitmap.ops.some(op => op[0] === 'fill' && op[1].stops.includes('#ff5a4a')), 'the figure, in the enemies\' color');
    assert.equal(w.Bitmap._loadWatchList.includes(file), false, 'nothing tries the file again');
    assert.equal(file.destroyed, true);
    assert.deepEqual(Object.keys(w.ImageManager._cache), []);
    assert.equal(w.ImageManager.isReady(), true, 'the next scene starts');
    // So is a file the load watchdog gave up on and blanked.
    const w3 = spriteWorld({ events: [row(1, 5, 5, UNIT(1))] });
    const slow = w3.step(w3.sprite(1));
    w3.Bitmap.loads[0]._degradedToBlank = true;
    w3.Bitmap.loads[0]._loadingState = 'loaded';
    w3.step(slow);
    assert.deepEqual([slow.bitmap.width, slow.bitmap.height], [48, 72]);
    assert.equal(w3.Bitmap.loads[0].destroyed, true);
    assert.equal(w3.Bitmap.loads[0].ops.length, 0, 'its pixels are not read');
    // A file that holds no art at all is the same.
    const w2 = spriteWorld({ events: [row(1, 5, 5, UNIT(1))] });
    const blank = w2.step(w2.sprite(1));
    w2.Bitmap.loads[0].arrive(64, 64, { x: 0, y: 0, width: 0, height: 0 });
    w2.step(blank);
    assert.deepEqual([blank.bitmap.width, blank.bitmap.height], [48, 72]);
});

test('a unit with nothing stands as a plain figure in its side\'s color, at once', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(3)), row(2, 6, 5, { team: 'ally', record: 'enemy', id: 3 }), event(3, 7, 5, { note: '<unit: neutral>' }), event(4, 8, 5)] });
    const enemy = w.step(w.sprite(1)), ally = w.step(w.sprite(2)), bystander = w.step(w.sprite(3)), nobody = w.step(w.sprite(4));
    assert.equal(w.Bitmap.loads.length, 0, 'no file is asked for');
    const painted = sprite => sprite.bitmap.ops.filter(op => op[0] === 'fill')[0][1].stops;
    assert.ok(painted(enemy).includes('#ff5a4a'));
    assert.ok(painted(ally).includes('#4aa8ff'));
    assert.ok(painted(bystander).includes('#e6d15a'));
    for (const sprite of [enemy, ally, bystander]) {
        assert.equal(sprite.isEmptyCharacter(), false);
        assert.deepEqual([sprite.bitmap.width, sprite.bitmap.height], [48, 72], 'one tile wide, one and a half tall');
        assert.deepEqual(plain(sprite._frame), { x: 0, y: 0, width: 48, height: 72 });
        assert.deepEqual([sprite._rrLook.full.width, sprite._rrLook.full.height], [256, 384]);
        assert.deepEqual([sprite._rrLook.wide, sprite._rrLook.tall], [1, 1.5]);
    }
    assert.equal(nobody.isEmptyCharacter(), true, 'an event that is no unit and has no picture shows nothing, as ever');
    assert.equal(nobody._rrLook, undefined);
    // The side a command gives it shows on the next beat.
    w.Graphics.frameCount = 500;
    w.step(enemy);
    w.$gameFight.setEventSide(1, 'ally');
    w.Graphics.frameCount = 500 + w.ReactorFight.LOOK_BEAT;
    w.step(enemy);
    assert.ok(painted(enemy).includes('#4aa8ff'));
    assert.equal(enemy.bitmap, ally.bitmap, 'one figure a color');
});

test('a record\'s sheet is cut and walked as an event\'s own, by the record\'s index', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(4)), row(2, 6, 5, { team: 'ally', record: 'actor', id: 2 })] });
    const monster = w.sprite(1), mira = w.sprite(2);
    monster.updateBitmap(); mira.updateBitmap();
    assert.deepEqual(Array.from(w.Bitmap.loads, file => file.url), ['img/characters/Monster.png', 'img/characters/Actor1.png'], 'sheets come from the game\'s own image cache');
    assert.equal(Object.keys(w.ImageManager._cache).length, 2);
    for (const file of w.Bitmap.loads) { file.width = 576; file.height = 384; file._loadingState = 'loaded'; }
    w.step(monster); w.step(mira);
    assert.equal(monster.isEmptyCharacter(), false);
    assert.equal(monster._characterName, 'Monster');
    // Index 3: the fourth block of the top row. Facing down, pattern 1.
    assert.deepEqual(plain(monster._frame), { x: (9 + w.$gameMap.event(1).pattern()) * 48, y: 0, width: 48, height: 48 });
    assert.deepEqual(plain(mira._frame), { x: (3 + w.$gameMap.event(2).pattern()) * 48, y: 0, width: 48, height: 48 });
    w.$gameMap.event(1).setDirection(8);
    w.step(monster);
    assert.equal(monster._frame.y, 3 * 48, 'it turns with the event');
    assert.equal(monster._rrLook.full, null, 'the 3D view cuts the sheet as it does any character\'s');
});

test('a plugin that replaces the sheet\'s frame functions has no say in a picture, and cuts a record\'s sheet its own way', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(3)), row(2, 6, 5, UNIT(1)), row(3, 7, 5, UNIT(4))] });
    w.$dataEnemies[4].note = '<unit character: Walker%(8), 5>';
    // A character-frames plugin as games ship it: a frame count kept per sheet, set where the sheet is loaded, and
    // frame functions replaced outright that read it. A sprite that never loaded a sheet has no count.
    vm.runInContext(`{
        const stockSet = Sprite_Character.prototype.setCharacterBitmap;
        Sprite_Character.prototype.setCharacterBitmap = function() { const named = /%\\((\\d+)\\)/.exec(this._characterName); this._cframes = named ? Number(named[1]) : 3; stockSet.call(this); };
        Sprite_Character.prototype.characterBlockX = function() { return this._isBigCharacter ? 0 : this._character.characterIndex() % 4 * this._cframes; };
        Sprite_Character.prototype.patternWidth = function() { return this._tileId > 0 ? $gameMap.tileWidth() : this._isBigCharacter ? this.bitmap.width / this._cframes : this.bitmap.width / (this._cframes * 4); };
    }`, w);
    const figure = w.step(w.sprite(1)), picture = w.step(w.sprite(2)), walker = w.sprite(3);
    assert.deepEqual(plain(figure._frame), { x: 0, y: 0, width: 48, height: 72 }, 'the figure, whole');
    const file = w.Bitmap.loads.find(each => each.url === 'img/enemies/Slime.png');
    file.arrive(122, 124, { x: 0, y: 0, width: 122, height: 124 });
    w.step(picture);
    assert.deepEqual(plain(picture._frame), { x: 0, y: 0, width: 48, height: 49 }, 'the picture, whole');
    assert.ok(Number.isFinite(figure.patternWidth()) && Number.isFinite(picture.patternWidth()), 'and the plugin\'s own measure of them is a number');
    // The record's sheet has eight frames a character: 1536 by 384. Index 5 is the second block of the lower row.
    walker.updateBitmap();
    const sheet = w.Bitmap.loads.find(each => each.url === 'img/characters/Walker%25(8).png');
    assert.ok(sheet, 'the sheet is asked for by the stock step: ' + Array.from(w.Bitmap.loads, each => each.url));
    sheet.width = 1536; sheet.height = 384; sheet._loadingState = 'loaded';
    w.step(walker);
    assert.equal(walker._cframes, 8, 'the plugin counted the sheet\'s frames');
    assert.deepEqual(plain(walker._frame), { x: 384 + w.$gameMap.event(3).pattern() * 48, y: 192, width: 48, height: 48 });
});

test('an event with a picture of its own, and one that is no unit any more, are drawn the stock way', () => {
    const gated = Object.assign(page().conditions, { switch1Valid: true, switch1Id: 4 });
    const w = spriteWorld({ events: [
        row(1, 5, 5, UNIT(3), { pages: [page({ image: pictured })] }),
        event(2, 6, 5, { pages: [page({ list: comment('<unit: enemy 3>') }), page({ conditions: gated })] })
    ] });
    const own = w.sprite(1), turning = w.sprite(2);
    own.updateBitmap();
    assert.equal(own._rrLook, undefined);
    assert.equal(own._characterName, 'People1');
    assert.equal(w.Bitmap.loads[0].url, 'img/characters/People1.png');
    w.step(turning);
    assert.equal(turning.isEmptyCharacter(), false, 'a figure on the page that names the unit');
    w.$gameSwitches.setValue(4, true); w.$gameMap.event(2).refresh();
    w.step(turning);
    assert.equal(turning._rrLook, null, 'the look is dropped with the page');
    assert.equal(turning.isEmptyCharacter(), true);
    assert.equal(turning.bitmap, w.ImageManager._emptyBitmap);
    w.$gameSwitches.setValue(4, false); w.$gameMap.event(2).refresh();
    w.step(turning);
    assert.equal(turning.isEmptyCharacter(), false);
    // A unit given a model later (its bindings arrive after the map) is the model's from then on.
    bind(w, 'enemies', 3);
    w.step(turning);
    assert.equal(turning._rrLook, null);
});

test('a typed size makes the picture that many tiles wide', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(3)), row(2, 8, 5, UNIT(3))], sidecar: { eventSize: { 2: [2, 2] }, eventSizeAnchor: 'center' } });
    const one = w.step(w.sprite(1)), two = w.step(w.sprite(2));
    assert.deepEqual([one.bitmap.width, one.bitmap.height], [48, 72]);
    assert.deepEqual([two.bitmap.width, two.bitmap.height], [96, 144]);
    assert.deepEqual([two._rrLook.wide, two._rrLook.tall], [2, 3]);
});

test('standing still costs nothing: no picture is made, drawn, read or cut again from frame to frame', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(1)), row(2, 6, 5, UNIT(3)), row(3, 7, 5, UNIT(4)), event(4, 8, 5)] });
    const sprites = [1, 2, 3, 4].map(id => w.step(w.sprite(id)));
    w.Bitmap.loads[0].arrive(122, 124, { x: 0, y: 0, width: 122, height: 124 });
    const sheet = w.Bitmap.loads.find(file => file.url === 'img/characters/Monster.png');
    sheet.width = 576; sheet.height = 384; sheet._loadingState = 'loaded';
    w.Graphics.frameCount = 1000;
    for (const sprite of sprites) w.step(sprite);
    assert.equal(sprites[2]._frame.x, (9 + w.$gameMap.event(3).pattern()) * 48, 'the record\'s sheet is shown from the record\'s block');
    const made = w.Bitmap.made.length, ops = Array.from(w.Bitmap.made, bitmap => bitmap.ops.length + bitmap.uploads);
    w.Sprite.cuts = 0; w.Sprite.recuts = 0;
    // What is counted: the pages read for a unit, the rule asked, and the record looked up.
    const F = w.ReactorFight, rule = w.ReactorFightLook, unitSpecOf = F.unitSpecOf, resolve = rule.resolve, unitLook = F.unitLook;
    let pages = 0, rules = 0, records = 0;
    F.unitSpecOf = function(data, list) { pages++; return unitSpecOf.call(this, data, list); };
    rule.resolve = function(unit, sources) { rules++; return resolve.call(this, unit, sources); };
    F.unitLook = function(record, id, team) { records++; return unitLook.call(this, record, id, team); };
    for (let frame = 0; frame < 120; frame++) { w.Graphics.frameCount++; for (const sprite of sprites) w.step(sprite); }
    F.unitSpecOf = unitSpecOf; rule.resolve = resolve; F.unitLook = unitLook;
    assert.equal(w.Bitmap.made.length, made, 'no bitmap');
    assert.deepEqual(Array.from(w.Bitmap.made, bitmap => bitmap.ops.length + bitmap.uploads), ops, 'no drawing, no upload');
    assert.equal(pages, 0, 'no page is read again');
    assert.equal(rules, 0, 'the rule is not asked again');
    assert.ok(records > 0 && records <= 3 * (120 / F.LOOK_BEAT + 1), 'each unit\'s record is looked up once a beat (' + records + ')');
    // A frame that moves is a texture made again: a unit that stands still moves none, whatever it stands as.
    assert.equal(w.Sprite.recuts, 0, 'no frame moves');
    assert.equal(w.Sprite.cuts, sprites.length * 120, 'each sprite cuts its frame once a frame');
});

test('a record\'s sheet is cut once, from the record\'s block, and the event keeps its own index', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(4)), row(2, 6, 5, UNIT(4))] });
    w.$dataEnemies[4].note = '<unit character: Monster, 6>';
    const sprite = w.sprite(1), character = w.$gameMap.event(1);
    sprite.updateBitmap();
    const sheet = w.Bitmap.loads[0];
    sheet.width = 576; sheet.height = 384; sheet._loadingState = 'loaded';
    // Every index the stock step asks for while it cuts.
    const asked = [];
    const characterIndex = character.characterIndex;
    character.characterIndex = function() { const index = characterIndex.call(this); asked.push(index); return index; };
    w.Sprite.cuts = 0; w.Sprite.recuts = 0;
    sprite.updateFrame();
    // Index 6: the third block of the lower row.
    assert.deepEqual(plain(sprite._frame), { x: (6 + character.pattern()) * 48, y: 4 * 48, width: 48, height: 48 });
    assert.equal(w.Sprite.cuts, 1, 'one cut');
    assert.ok(asked.length > 0 && asked.every(index => index === 6), 'the step saw the record\'s index throughout: ' + asked);
    assert.equal(character._characterIndex, 0, 'and the event\'s own is as it was');
    assert.equal(character.characterIndex(), 0);
    // Walking: one frame change a step of the pattern, never two.
    w.Sprite.cuts = 0; w.Sprite.recuts = 0;
    character._pattern = (character._pattern + 1) % 4;
    sprite.updateFrame(); sprite.updateFrame();
    assert.deepEqual([w.Sprite.cuts, w.Sprite.recuts], [2, 1]);
    // A step that fails (a plugin's own frame function throws) still leaves the event its index.
    const other = w.sprite(2), second = w.$gameMap.event(2);
    other.updateBitmap();
    other.characterPatternX = () => { throw new Error('a plugin fault'); };
    assert.throws(() => other.updateFrame(), /a plugin fault/);
    assert.equal(second._characterIndex, 0);
});

test('a sheet of one character ($) has no blocks: the record\'s index moves nothing', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(4))] });
    w.$dataEnemies[4].note = '<unit character: $BigMonster, 5>';
    const sprite = w.sprite(1);
    sprite.updateBitmap();
    assert.equal(w.Bitmap.loads[0].url, 'img/characters/%24BigMonster.png');
    w.Bitmap.loads[0].width = 288; w.Bitmap.loads[0].height = 384; w.Bitmap.loads[0]._loadingState = 'loaded';
    w.step(sprite);
    assert.equal(sprite._isBigCharacter, true);
    assert.deepEqual(plain(sprite._frame), { x: w.$gameMap.event(1).pattern() * 96, y: 0, width: 96, height: 96 }, 'three frames across, four rows');
    w.$gameMap.event(1).setDirection(6);
    w.step(sprite);
    assert.equal(sprite._frame.y, 2 * 96);
});

test('in a bush a picture and a record\'s sheet are drawn as two halves, each from the right place', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(3)), row(2, 6, 5, UNIT(4))] });
    const figure = w.step(w.sprite(1)), monster = w.sprite(2);
    monster.updateBitmap();
    const sheet = w.Bitmap.loads[0];
    sheet.width = 576; sheet.height = 384; sheet._loadingState = 'loaded';
    w.step(monster);
    assert.equal(figure._upperBody, null, 'no halves on open ground');
    // The figure, 48 by 72, twelve pixels deep in the bush.
    figure._bushDepth = 12;
    w.step(figure);
    assert.deepEqual(plain(figure._upperBody._frame), { x: 0, y: 0, width: 48, height: 60 });
    assert.deepEqual(plain(figure._lowerBody._frame), { x: 0, y: 60, width: 48, height: 12 });
    assert.deepEqual(plain(figure._frame), { x: 0, y: 0, width: 0, height: 72 }, 'the sprite itself draws nothing: its halves do');
    assert.equal(figure._upperBody.bitmap, figure.bitmap);
    assert.equal(figure._lowerBody.bitmap, figure.bitmap);
    assert.ok(figure._upperBody.visible && figure._lowerBody.visible);
    // A bush deeper than the picture is tall hides no more than all of it.
    figure._bushDepth = 200;
    w.step(figure);
    assert.deepEqual(plain(figure._upperBody._frame), { x: 0, y: 0, width: 48, height: 0 });
    assert.deepEqual(plain(figure._lowerBody._frame), { x: 0, y: 0, width: 48, height: 72 });
    // Out of the bush it is whole again.
    figure._bushDepth = 0;
    w.step(figure);
    assert.deepEqual(plain(figure._frame), { x: 0, y: 0, width: 48, height: 72 });
    assert.equal(figure._upperBody.visible || figure._lowerBody.visible, false);
    // The record's sheet (index 3): both halves from the record's block, as the sprite's own frame is.
    const sx = (9 + w.$gameMap.event(2).pattern()) * 48;
    monster._bushDepth = 12;
    w.Sprite.cuts = 0;
    w.step(monster);
    assert.deepEqual(plain(monster._upperBody._frame), { x: sx, y: 0, width: 48, height: 36 });
    assert.deepEqual(plain(monster._lowerBody._frame), { x: sx, y: 36, width: 48, height: 12 });
    assert.deepEqual(plain(monster._frame), { x: sx, y: 0, width: 0, height: 48 });
    assert.equal(w.Sprite.cuts, 3, 'one cut each');
});

test('a parked sprite keeps its unit\'s look up: the picture that arrives, the side that changes, the unit that falls, the event that becomes a unit', () => {
    const gated = Object.assign(page().conditions, { switch1Valid: true, switch1Id: 4 });
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(1)), row(2, 6, 5, UNIT(3)), row(3, 7, 5, UNIT(3)), event(4, 8, 5),
        event(5, 9, 5, { pages: [page(), page({ conditions: gated, list: comment('<unit: enemy 3>') })] }),
        event(6, 10, 5, { pages: [page({ image: pictured })] })] });
    const picture = w.sprite(1), figure = w.sprite(2), fallen = w.sprite(3), nobody = w.sprite(4), ambush = w.sprite(5), villager = w.sprite(6);
    const all = [picture, figure, fallen, nobody, ambush, villager];
    const BEAT = w.ReactorFight.LOOK_BEAT;
    w.Graphics.frameCount = 700;
    // The first update of each, on screen: the picture's file is asked for and is still being read.
    for (const sprite of all) sprite.update();
    assert.equal(picture.isEmptyCharacter(), true);
    assert.equal(picture._rrLook.full, null);
    // The map parks them all (they are off screen; a 3D scene may still see them).
    for (const sprite of all) sprite._rrCulled = true;
    let asks = 0;
    const eventLook = w.ReactorFight.eventLook;
    w.ReactorFight.eventLook = function(character) { asks++; return eventLook.call(this, character); };
    // What parking saves: an event with no picture that is no unit is asked once a beat, on its own frame of it;
    // an event with a picture of its own is never asked.
    const beatFrames = [];
    for (let i = 0; i < 10 * BEAT; i++) {
        w.Graphics.frameCount++;
        const before = asks;
        nobody.update(); villager.update();
        if (asks > before) beatFrames.push(w.Graphics.frameCount);
    }
    assert.equal(asks, 10, 'ten beats, ten asks');
    assert.ok(beatFrames.every((frame, index) => index === 0 || frame - beatFrames[index - 1] === BEAT), 'a beat apart: ' + beatFrames);
    assert.equal((beatFrames[0] + 4) % BEAT, 0, 'each event on its own frame of the beat (its number)');
    // A page turned by a switch makes a parked event a unit: it stands as its record within a beat.
    assert.equal(ambush.isEmptyCharacter(), true);
    w.$gameSwitches.setValue(4, true); w.$gameMap.event(5).refresh();
    for (let i = 0; i < BEAT; i++) { w.Graphics.frameCount++; ambush.update(); }
    assert.equal(ambush.isEmptyCharacter(), false, 'the ambush stands as a figure though its sprite is parked');
    assert.deepEqual([ambush._rrLook.full.width, ambush._rrLook.full.height], [256, 384]);
    assert.equal(ambush.visible, false);
    asks = 0;
    w.Bitmap.loads.find(file => file.url === 'img/enemies/Slime.png').arrive(350, 300, { x: 0, y: 0, width: 350, height: 300 });
    w.Graphics.frameCount++;
    picture.update();
    assert.equal(picture.isEmptyCharacter(), false, 'the picture is shown though the sprite is parked');
    assert.deepEqual([picture._rrLook.full.width, picture._rrLook.full.height], [350, 300], 'with the copy a billboard is drawn from');
    assert.deepEqual([picture._rrLook.wide, picture._rrLook.tall], [1, 41 / 48]);
    assert.equal(picture.visible, false, 'and stays parked');
    // A side given by a command repaints a parked figure on the look's beat.
    const painted = sprite => sprite._rrLook.full.ops.filter(op => op[0] === 'fill')[0][1].stops;
    assert.ok(painted(figure).includes('#ff5a4a'));
    w.$gameFight.setEventSide(2, 'ally');
    w.Graphics.frameCount += w.ReactorFight.LOOK_BEAT;
    figure.update();
    assert.ok(painted(figure).includes('#4aa8ff'));
    // A unit that falls while its sprite is parked stops standing there.
    assert.equal(fallen.isEmptyCharacter(), false);
    w.$gameMap.event(3).erase();
    fallen.update();
    assert.equal(fallen._rrLook, null);
    assert.equal(fallen.isEmptyCharacter(), true);
    w.ReactorFight.eventLook = eventLook;
});

test('the pictures go when the game drops its images, and a sprite that stays draws its own again', () => {
    const w = spriteWorld({ events: [row(1, 5, 5, UNIT(1)), row(2, 6, 5, UNIT(3))] });
    const picture = w.step(w.sprite(1)), figure = w.step(w.sprite(2));
    w.Bitmap.loads[0].arrive(122, 124, { x: 0, y: 0, width: 122, height: 124 });
    w.step(picture);
    const was = [picture.bitmap, picture._rrLook.full, figure.bitmap, figure._rrLook.full];
    w.ImageManager.clear();
    for (const bitmap of was) assert.equal(bitmap.destroyed, true);
    w.step(picture); w.step(figure);
    assert.equal(figure.bitmap.destroyed, undefined, 'the figure is drawn afresh');
    assert.notEqual(figure.bitmap, was[2]);
    assert.equal(w.Bitmap.loads.length, 2, 'the picture is read afresh');
    assert.equal(picture.isEmptyCharacter(), true);
    // Dropped again while that file is still being read: the read is given up, and nothing waits for it.
    assert.equal(w.Bitmap._loadWatchList.includes(w.Bitmap.loads[1]), true);
    w.ImageManager.clear();
    assert.equal(w.Bitmap.loads[1].destroyed, true);
    assert.equal(w.Bitmap._loadWatchList.includes(w.Bitmap.loads[1]), false);
    w.step(picture);
    assert.equal(w.Bitmap.loads.length, 3);
    w.Bitmap.loads[2].arrive(122, 124, { x: 0, y: 0, width: 122, height: 124 });
    w.step(picture);
    assert.equal(picture.isEmptyCharacter(), false);
    assert.equal(picture.bitmap.destroyed, undefined);
});

test('the picture is drawn again for tiles of another size, and a dropped look gives the sprite back to the stock step', () => {
    const gate = id => Object.assign(page().conditions, { switch1Valid: true, switch1Id: id });
    const w = spriteWorld({ events: [
        row(1, 5, 5, UNIT(3)),
        event(2, 6, 5, { pages: [page({ image: pictured }), page({ conditions: gate(4), list: comment('<unit: enemy 3>') }), page({ conditions: gate(5) })] })
    ] });
    const figure = w.step(w.sprite(1));
    assert.deepEqual([figure.bitmap.width, figure.bitmap.height], [48, 72]);
    const full = figure._rrLook.full;
    w.$gameMap.tileWidth = () => 32; w.$gameMap.tileHeight = () => 32;
    w.step(figure);
    assert.deepEqual([figure.bitmap.width, figure.bitmap.height], [32, 48], 'one tile wide on the new tiles');
    assert.deepEqual(plain(figure._frame), { x: 0, y: 0, width: 32, height: 48 });
    assert.equal(figure._rrLook.full, full, 'the larger copy is the same one');
    assert.deepEqual([figure._rrLook.wide, figure._rrLook.tall], [1, 1.5]);
    w.$gameMap.tileWidth = () => 48; w.$gameMap.tileHeight = () => 48;
    // An event that showed its own sheet, then stood as a unit's figure, then is nobody with no picture: the
    // stock step reads its (empty) picture afresh, and the figure's bitmap is not left on the sprite.
    const turning = w.step(w.sprite(2));
    assert.equal(turning._characterName, 'People1');
    w.$gameSwitches.setValue(4, true); w.$gameMap.event(2).refresh();
    w.step(turning);
    assert.equal(turning._rrLook.look.kind, 'figure');
    const drawn = turning.bitmap;
    assert.deepEqual([drawn.width, drawn.height], [48, 72]);
    w.$gameSwitches.setValue(5, true); w.$gameMap.event(2).refresh();
    w.step(turning);
    assert.equal(turning._rrLook, null);
    assert.equal(turning.isEmptyCharacter(), true);
    assert.equal(turning.bitmap, w.ImageManager._emptyBitmap);
    assert.notEqual(turning.bitmap, drawn);
});

//-----------------------------------------------------------------------------
// The 3D scene's billboard and a flat map's model pictures

test('a 3D scene stands the picture up as a billboard: the larger copy, whole, the size the rule gives it', () => {
    const w = spriteWorld({ flat: false, events: [row(1, 5, 5, UNIT(1)), row(2, 6, 5, UNIT(3))] });
    const picture = w.step(w.sprite(1)), figure = w.step(w.sprite(2));
    w.Bitmap.loads[0].arrive(350, 300, { x: 0, y: 0, width: 350, height: 300 });
    w.step(picture);
    const make = vm.runInContext(`(() => {
        const texture = new THREE.Texture(), geometry = new THREE.PlaneGeometry(1, 1), material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        return { texture, geometry, object: new THREE.Mesh(geometry, material), stampFields: null, view: null, above: false };
    })`, w);
    const scene = Object.create(w.Reactor3D.MapScene.prototype);
    const board = make(), other = make();
    scene._updateCharacterBillboard(board, picture, w.$gameMap.event(1));
    assert.equal(board.object.visible, true);
    assert.ok(Math.abs(board.object.scale.x - 1) < 1e-9 && Math.abs(board.object.scale.y - 41 / 48) < 1e-9, 'one tile wide, its own proportions');
    assert.equal(board.view.image, picture._rrLook.full.canvas, 'drawn from the larger copy, not the tile-sized one');
    assert.deepEqual([board.view.repeat.x, board.view.repeat.y, board.view.offset.x, board.view.offset.y], [1, 1, 0, 0], 'the whole of it');
    scene._updateCharacterBillboard(other, figure, w.$gameMap.event(2));
    assert.deepEqual([other.object.scale.x, other.object.scale.y], [1, 1.5]);
    assert.equal(other.view.image, figure._rrLook.full.canvas);
    // The side changes: another drawn picture of the same size and no file name. The billboard takes it.
    w.Graphics.frameCount = 300;
    w.step(figure);
    w.$gameFight.setEventSide(2, 'ally');
    w.Graphics.frameCount = 300 + w.ReactorFight.LOOK_BEAT;
    w.step(figure);
    scene._updateCharacterBillboard(other, figure, w.$gameMap.event(2));
    assert.equal(other.view.image, figure._rrLook.full.canvas, 'the ally-colored figure');
    assert.ok(figure._rrLook.full.ops.some(op => op[0] === 'fill' && op[1].stops.includes('#4aa8ff')));
    // The game drops its images (a new map): the 3D scene's copy of each picture goes from the GPU with it.
    const copies = [picture._rrLook.full, figure._rrLook.full].map(full => w.Reactor3D._sheetTextures.get(full).texture);
    let disposed = 0;
    for (const copy of copies) copy.dispose = () => { disposed++; };
    w.ImageManager.clear();
    assert.equal(disposed, 2);
});

test('on a flat map, while a battle runs there, a fighter drawn from a model stands no taller than a unit\'s picture; a big one keeps its size', () => {
    const w = world({ events: [
        row(1, 5, 5, UNIT(1)),
        event(2, 9, 5, { note: '' }),
        row(3, 20, 12, UNIT(2))
    ], sidecar: { events: { 2: { 0: SPEC } } } });
    const R = w.Reactor3D, F = w.ReactorFight, fit = (sprite, character) => R.flatUnitFit(sprite, character);
    bind(w, 'enemies', 1);
    bind(w, 'enemies', 2, { name: 'Vehicles/Truck', ext: '.glb', size: 4, scale: 1, yaw: 0 });
    bind(w, 'actors', 1, { character: SPEC });
    // A figure three tiles tall (its box one wide, three high) and a truck four tiles long.
    w.model('Actors/Raider', w.boxModel(1, 3, 1));
    w.model('Vehicles/Truck', w.boxModel(4, 3, 2));
    w.Graphics.frameCount = 50;
    const unit = {}, prop = {}, truck = {}, lead = {};
    const one = w.$gameMap.event(1), two = w.$gameMap.event(2), three = w.$gameMap.event(3);
    assert.equal(R.characterHeightTiles(one), 3);
    assert.equal(R.characterModelSpec(two).name, 'Actors/Raider', 'the prop is drawn from a model too');
    assert.ok(R.eventBody(three).count > 1);
    assert.ok(L.modelFit(R.characterHeightTiles(three)) < 1, 'the truck is tall enough to be fit, were it one tile big');
    const want = L.modelFit(3);
    // No battle: the party and the units are the size their models are, the same as each other.
    for (let i = 0; i < 30; i++) {
        w.Graphics.frameCount++;
        assert.deepEqual([fit(unit, one), fit(prop, two), fit(truck, three), fit(lead, w.$gamePlayer)], [1, 1, 1, 1]);
    }
    // What it costs between beats: who is a fighter and how big a body is are not asked again.
    // A battle starts on this map. From its first frame the unit and the party ease to one size, together.
    assert.ok(w.$gameFight.start({ mode: 'action', canEscape: true }) > 0);
    let looks = 0, bodies = 0;
    const eventLook = F.eventLook, eventBody = R.eventBody;
    F.eventLook = function(character) { looks++; return eventLook.call(this, character); };
    R.eventBody = function(character) { bodies++; return eventBody.call(this, character); };
    const seen = [], party = [];
    for (let i = 0; i < 120; i++) {
        w.Graphics.frameCount++;
        seen.push(fit(unit, one)); party.push(fit(lead, w.$gamePlayer));
        assert.equal(fit(prop, two), 1, 'a model event that is no unit keeps the size it was given');
        assert.equal(fit(truck, three), 1, 'a unit bigger than its tile is drawn as big as it is');
    }
    assert.ok(Math.abs(seen[0] - (1 + (want - 1) * 0.2)) < 1e-9, 'the first frame of the battle: a fifth of the way (' + seen[0] + ')');
    assert.ok(Math.abs(seen[1] - (seen[0] + (want - seen[0]) * 0.2)) < 1e-9, 'then a fifth of what is left');
    assert.deepEqual(party, seen, 'the party is the units\' size at every frame');
    assert.ok(seen.every((value, index) => index === 0 || value <= seen[index - 1] + 1e-9), 'it eases one way');
    assert.ok(Math.abs(seen[119] - want) < 1e-9, 'and ends where a unit\'s picture is as tall');
    // Four sprites over 120 frames: each read at the start and once a beat after.
    const beats = 120 / F.LOOK_BEAT + 1;
    assert.ok(looks > 0 && looks <= 3 * beats, 'three events asked what they are once a beat (' + looks + ')');
    assert.ok(bodies > 0 && bodies <= 3 * beats, 'the bodies of the two fighting events and the leader read once a beat (' + bodies + ')');
    F.eventLook = eventLook; R.eventBody = eventBody;
    // A battle kept on the map the party has left is not a battle on the map it stands on.
    const mapId = w.$gameFight._mapId;
    w.$gameFight._mapId = mapId + 1;
    for (let i = 0; i < 80; i++) { w.Graphics.frameCount++; fit(unit, one); fit(lead, w.$gamePlayer); }
    assert.deepEqual([fit(unit, one), fit(lead, w.$gamePlayer)], [1, 1]);
    w.$gameFight._mapId = mapId;
    for (let i = 0; i < 80; i++) { w.Graphics.frameCount++; fit(unit, one); fit(lead, w.$gamePlayer); }
    assert.ok(Math.abs(fit(unit, one) - want) < 1e-9 && Math.abs(fit(lead, w.$gamePlayer) - want) < 1e-9);
    // The battle ends: back to their own size from that frame on, eased.
    w.$gameFight.end(F.ESCAPE, true);
    w.run(300, () => !w.$gameFight.isActive());
    assert.equal(w.$gameFight.isActive(), false);
    const back = [];
    for (let i = 0; i < 80; i++) { w.Graphics.frameCount++; back.push(fit(unit, one)); assert.equal(fit(lead, w.$gamePlayer), back[i]); }
    assert.ok(back[0] > want && back[0] < 1, 'it starts back at once (' + back[0] + ')');
    assert.equal(back[79], 1);
    // The model's sprite takes the smaller of this and the Tactical battle's own fit.
    assert.match(read('runtime/reactor_3d_models.js'), /const fit = Math\.min\(fight \? fight\.flatFit\(character\) : 1, this\.flatUnitFit\(sprite, character\)\);\s+if \(fit !== 1 && fit > 0\) \{ sprite\.scale\.x \*= fit; sprite\.scale\.y \*= fit; sprite\._reactorFlatFit = fit; \}/);
});

test('a fighter whose model is changed for another during a battle keeps its size until the new picture is drawn', async () => {
    const w = world({ events: [row(1, 5, 5, UNIT(1))] });
    const R = w.Reactor3D;
    w.model('Actors/Raider', w.boxModel(1, 3, 1));
    w.model('Actors/Brute', w.boxModel(1, 3, 1));
    bind(w, 'enemies', 1);
    R.paintModelSpriteCanvas = () => {};
    const one = w.$gameMap.event(1);
    const sprite = { _character: one, scale: { x: 1, y: 1 }, anchor: { x: 0, y: 0 }, bitmap: null, setFrame() {}, texture: null, _reactorMapModel: null };
    const arrived = async () => { for (let i = 0; i < 40 && !(sprite._reactorMapModel && sprite._reactorMapModel.ready); i++) await new Promise(resolve => setTimeout(resolve, 5)); };
    const frame = () => { w.Graphics.frameCount++; R.updateMapModelSprite(sprite); return sprite.scale.x; };
    w.Graphics.frameCount = 50;
    frame();
    await arrived();
    assert.equal(sprite._reactorMapModel.ready, true);
    assert.equal(frame(), 1, 'no battle: the model\'s own size');
    assert.ok(w.$gameFight.start({ mode: 'action', canEscape: true }) > 0);
    let size = 1;
    for (let i = 0; i < 80; i++) size = frame();
    const want = L.modelFit(3);
    assert.ok(Math.abs(size - want) < 1e-9, 'in the battle: fit (' + size + ')');
    // Another model for the same unit (a party member shown as another actor is the same change): the picture is
    // made again, and for the frames that takes nothing new is drawn.
    const was = sprite._reactorMapModel;
    bind(w, 'enemies', 1, { name: 'Actors/Brute', ext: '.glb', size: 3, scale: 1, yaw: 0 });
    size = frame();
    assert.notEqual(sprite._reactorMapModel, was, 'the picture is being made again');
    assert.equal(sprite._reactorMapModel.ready, false);
    assert.ok(Math.abs(size - want) < 1e-9, 'the sprite keeps the size it had (' + size + ')');
    assert.ok(Math.abs(frame() - want) < 1e-9, 'frame after frame');
    await arrived();
    assert.ok(Math.abs(frame() - want) < 1e-9, 'and when the new picture is there');
    for (let i = 0; i < 30; i++) size = frame();
    assert.ok(Math.abs(size - want) < 1e-9, 'scaled once a frame, not again and again');
    // A character that stops being drawn from a model is given its own scale back.
    w.Reactor3D._databaseSidecar = null;
    assert.equal(frame(), 1);
});

test('a picture whose creature flies high over its own shadow is cut so it stands just over it, in its own cell', () => {
    // The stock Crow: the bird in the top 134 rows of 234, its shadow in the last 20, open air between.
    const width = 10, height = 234, data = new Uint8ClampedArray(width * height * 4);
    const paint = (from, to) => { for (let y = from; y < to; y++) for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = 255; };
    paint(0, 134); paint(214, 234);
    const box = L.trim(data, width, height);
    const art = L.art(data, width, box);
    assert.equal(art.parts.length, 2);
    assert.deepEqual(plain(art.parts), [{ y: 0, height: 134 }, { y: 214, height: 20 }]);
    assert.equal(art.gap, Math.round(234 * L.GAP_KEEP));
    assert.equal(art.height, 134 + art.gap + 20, 'the open air is cut to a sliver');
    // Fitted as a unit's picture, the bird no longer rises a whole tile over its cell.
    const before = L.fit(width, height, 48, 48, 1), after = L.fit(art.width, art.height, 48, 48, 1);
    assert.ok(after.height * (134 / art.height) > before.height * (134 / 234), 'the bird itself is drawn larger');
    // Drawn part by part, top to bottom, the band between them left empty.
    const calls = [];
    L.drawArt({ drawImage: (...args) => calls.push(args.slice(1)) }, 'source', box, art, 10, art.height);
    assert.deepEqual(calls, [[0, 0, 10, 134, 0, 0, 10, 134], [0, 214, 10, 20, 0, 134 + art.gap, 10, 20]]);
    // A picture with no such band is drawn whole.
    const whole = new Uint8ClampedArray(width * 40 * 4).fill(255);
    const solid = L.art(whole, width, L.trim(whole, width, 40));
    assert.equal(solid.parts.length, 1);
    assert.equal(solid.height, 40);
});
