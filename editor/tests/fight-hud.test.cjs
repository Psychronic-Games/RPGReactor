const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const Hud = require('../../runtime/reactor_ui_fight.js');
const Stock = require('../src/utils/StockInterfaces.js');
const Editor = require('../src/database/DatabaseUserInterfaceEditor.js');

/** A 2D context that only counts what was asked of it. */
function fakeContext() {
    const calls = { fillText: [], drawImage: 0, fillRect: 0, images: [] };
    const gradient = { addColorStop() {} };
    return new Proxy({ calls }, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'createLinearGradient') return () => gradient;
            if (key === 'fillText') return (text, x, y) => calls.fillText.push([String(text), Math.round(x), Math.round(y)]);
            if (key === 'drawImage') return (...args) => { calls.drawImage++; calls.images.push(args.slice(1)); };
            if (key === 'measureText') return text => ({ width: String(text).length * 10 });
            if (key === 'fillRect') return () => { calls.fillRect++; };
            return () => {};
        },
        set(target, key, value) { target[key] = value; return true; }
    });
}

const theme = (pictures = {}) => ({
    font: (size, bold) => `${bold ? 'bold ' : ''}${size}px test`,
    textColor: '#ffffff', systemColor: '#84aaff', outlineColor: 'rgba(0,0,0,0.6)', outlineWidth: 3, crisisColor: '#ffff40', deathColor: '#ff2020',
    gauge: { hp: ['#e08040', '#f0c040'], mp: ['#4080c0', '#40c0f0'], tp: ['#00a040', '#00e060'], back: '#202040' },
    terms: { level: 'Lv', hp: 'HP', mp: 'MP', tp: 'TP' },
    face: name => (name in pictures ? pictures[name] : null),
    character: name => (name in pictures ? pictures[name] : null),
    icons: () => ({ width: 512, height: 640 }),
    thumbnail: () => false
});

const database = {
    system: { partyMembers: [1, 2], optDisplayTp: true, terms: { basic: ['Level', 'Lv', 'HP', 'HP', 'MP', 'MP', 'TP', 'TP'], commands: [] }, advanced: { screenWidth: 1280, screenHeight: 720 } },
    actors: [null, { id: 1, name: 'Reid', classId: 1, initialLevel: 3, faceName: 'Actor1', faceIndex: 0, characterName: 'Actor1', characterIndex: 0 },
        { id: 2, name: 'Priscilla', classId: 1, initialLevel: 2, faceName: '', faceIndex: 0, characterName: '$Big', characterIndex: 0 }],
    classes: [null, { id: 1, name: 'Soldier', params: [0, 1, 2, 3, 4, 5, 6, 7].map(p => [0, 100 + p, 110 + p, 120 + p, 130 + p]) }],
    enemies: [null, { id: 1, name: 'Bat', params: [200, 0, 30, 30, 30, 30, 30, 30] }, { id: 2, name: 'Slime', params: [250, 0, 30, 30, 30, 30, 20, 30] }],
    skills: [null, { id: 1, name: 'Attack', stypeId: 0 }, { id: 2, name: 'Guard', stypeId: 0 }, { id: 3, name: '-----Magic', stypeId: 1 }, { id: 4, name: 'Fire', stypeId: 1 }]
};

function overlaps(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The stock layout's node rectangles on a screen, by node name (anchors resolved as the runtime resolves them). */
function stockRects(width, height) {
    const anchors = { topLeft: [0, 0], top: [0.5, 0], topRight: [1, 0], bottomLeft: [0, 1], bottomRight: [1, 1] };
    const rects = {};
    for (const node of Hud.stockNodes({ width, height })) {
        const [ax, ay] = anchors[node.anchor];
        rects[node.name] = { x: Math.round(width * ax - node.width * ax + node.x), y: Math.round(height * ay - node.height * ay + node.y), width: node.width, height: node.height };
    }
    return rects;
}

test('the runtime and the editor draw the HUD from one file, byte for byte', () => {
    assert.equal(read('editor/src/utils/FightHud.js'), read('runtime/reactor_ui_fight.js'));
    assert.match(read('editor/index.html'), /src\/utils\/FightHud\.js[\s\S]*src\/utils\/StockInterfaces\.js/);
    assert.match(read('runtime/reactor_main.js'), /"js\/reactor_ui_fight\.js",[\s\S]*"js\/reactor_ui\.js"/);
});

test('node settings come back in range, with the defaults for what is missing', () => {
    const unit = Hud.normalizeProps({ fightUnit: 'nobody', fightFields: ['hp', 'bogus', 'portrait'], fightStats: ['move', 'x'], fightPortrait: 9999, allyColor: 'red',
        fightLabels: { hit: 'Chance', nothing: 'x', damage: '' } }, 'fightUnit');
    assert.equal(unit.fightUnit, 'active');
    assert.deepEqual(unit.fightFields, ['portrait', 'hp']);
    assert.deepEqual(unit.fightStats, ['move']);
    assert.equal(unit.fightPortrait, 512);
    assert.equal(unit.allyColor, Hud.TEAM_COLORS.ally);
    assert.deepEqual(unit.fightLabels, { hit: 'Chance' });
    assert.equal(Hud.label(unit, 'hit'), 'Chance');
    assert.equal(Hud.label(unit, 'damage'), 'Damage');
    const strip = Hud.normalizeProps({ cellSize: -5, cellGap: 999, maxCells: 4 }, 'fightTurnOrder');
    assert.deepEqual([strip.cellSize, strip.cellGap, strip.maxCells, strip.turnAnimate], [0, 64, 4, true]);
    assert.equal(Hud.normalizeProps({ fightInfo: 'x' }, 'fightInfo').fightInfo, 'objective');
    assert.equal(Hud.normalizeProps({ fightWindow: 'item' }, 'fightWindow').fightWindow, 'item');
});

test('a unit panel lays its parts inside its contents without overlap, at every stock size', () => {
    for (const [width, height] of [[816, 624], [1024, 768], [1280, 720], [1920, 1080]]) {
        const node = Hud.stockNodes({ width, height }).find(entry => entry.name === 'Active Unit');
        const w = node.width - 24, h = node.height - 24;
        const layout = Hud.unitLayout(node, w, h, true);
        const parts = [layout.portrait, layout.states, layout.header, ...layout.gauges, layout.block, ...layout.stats].filter(Boolean);
        for (const part of parts) {
            assert.ok(part.x >= 0 && part.y >= 0 && part.x + part.width <= w + 1 && part.y + part.height <= h + 1, `${width}x${height}: a part leaves the panel ${JSON.stringify(part)}`);
        }
        const column = [layout.header, ...layout.gauges, layout.block];
        for (let i = 1; i < column.length; i++) assert.ok(column[i].y >= column[i - 1].y + column[i - 1].height - 1, `${width}x${height}: rows overlap`);
        // The portrait is a square, centered top to bottom, the same distance from the panel's top and bottom.
        assert.equal(layout.portrait.width, layout.portrait.height);
        assert.ok(Math.abs(layout.portrait.y - (h - layout.portrait.y - layout.portrait.height)) <= 1, `${width}x${height}: the portrait is not centered`);
        assert.ok(!overlaps(layout.portrait, layout.header));
        // The states sit inside the portrait, along its lower edge.
        assert.ok(layout.states.over && layout.states.y + layout.states.height <= layout.portrait.y + layout.portrait.height && layout.states.x > 0);
        // The column is centered top to bottom too.
        const top = column[0].y, bottom = h - (layout.block.y + layout.block.height);
        assert.ok(Math.abs(top - bottom) <= 2, `${width}x${height}: the column is not centered (${top} above, ${bottom} below)`);
        assert.equal(layout.gauges.length, 3);
        assert.equal(layout.stats.length, 6);
        // A parameter's label and number never share pixels: three to a row where there is room, else two.
        const perRow = layout.stats.filter(stat => stat.y === layout.stats[0].y).length;
        assert.ok(perRow === 3 || perRow === 2);
        assert.ok(layout.stats[0].width >= layout.small * 3.4, `${width}x${height}: a parameter cell is too narrow (${layout.stats[0].width} at ${layout.small}px)`);
        assert.ok(layout.small >= 10 && layout.font >= 12 && layout.font <= 26, `${width}x${height}: text out of range (${layout.font}/${layout.small})`);
    }
    // TP hidden by the project: its row goes.
    const node = Object.assign(Hud.defaultProps('fightUnit'));
    assert.equal(Hud.unitLayout(node, 300, 120, false).gauges.length, 2);
});

test('a portrait sits centered in its frame with the same inset on every side, whatever it is made from', () => {
    const size = 100, border = 2, inset = Hud.portraitInset(size, border), inner = size - inset * 2;
    assert.ok(inset > border, 'the picture never reaches the border');
    const draw = (view, pictures) => { const ctx = fakeContext(); Hud.drawPortrait(ctx, 10, 20, size, Object.assign(Hud.newUnitView(), view), pictures, '#ff0000', border); return ctx.calls.images[0]; };
    // A face: its 144 cell fills the inner square.
    let args = draw({ faceName: 'Actor1', faceIndex: 5 }, theme({ Actor1: { width: 576, height: 288 } }));
    assert.deepEqual(args, [144, 144, 144, 144, 10 + inset, 20 + inset, inner, inner]);
    // A model's portrait: the same square.
    args = draw({ name: 'Tank', model: { name: 'Tank' } }, Object.assign(theme(), { thumbnail: () => ({ width: 128, height: 128 }) }));
    assert.deepEqual(args, [10 + inset, 20 + inset, inner, inner]);
    // A map sprite: enlarged in whole steps, whole, centered both ways.
    args = draw({ characterName: 'People1', characterIndex: 0 }, theme({ People1: { width: 576, height: 384 } }));
    const scale = Math.floor(inner / 48), drawn = 48 * scale;
    assert.deepEqual(args.slice(4), [10 + inset + Math.round((inner - drawn) / 2), 20 + inset + Math.round((inner - drawn) / 2), drawn, drawn]);
    assert.ok(scale >= 1 && drawn <= inner);
    // An enemy's battle picture: scaled to fit, whole, centered both ways.
    args = draw({ battlerName: 'Bat' }, Object.assign(theme(), { enemy: () => ({ width: 200, height: 100 }) }));
    const bw = inner, bh = Math.round(100 * inner / 200);
    assert.deepEqual(args.slice(4), [10 + inset, 20 + inset + Math.round((inner - bh) / 2), bw, bh]);
    // The acting unit's box in the turn strip: a wider frame (gold, its side's line inside), and the picture still inside it.
    const ctx = fakeContext();
    Hud.drawTurnCell(ctx, 60, 6, Hud.defaultProps('fightTurnOrder'), { team: 'ally', active: true, acted: false }, Object.assign(Hud.newUnitView(), { faceName: 'Actor1' }), theme({ Actor1: { width: 576, height: 288 } }));
    const cell = ctx.calls.images[0], cellInset = Hud.portraitInset(60, 3) + 2;
    assert.deepEqual(cell.slice(4), [cellInset, cellInset, 60 - cellInset * 2, 60 - cellInset * 2]);
});

test('gauges: clipped corners by default (label, bar, numbers on the bar\'s right end), the thin bar still to be had', () => {
    assert.equal(Hud.normalizeProps({}, 'fightUnit').gaugeStyle, 'clipped');
    assert.equal(Hud.normalizeProps({ gaugeStyle: 'bar' }, 'fightUnit').gaugeStyle, 'bar');
    assert.equal(Hud.normalizeProps({ gaugeStyle: 'round' }, 'fightUnit').gaugeStyle, 'clipped');
    assert.equal(Hud.stockNodes({ width: 1280, height: 720 }).find(node => node.type === 'fightUnit').gaugeStyle, 'clipped');
    const reader = Hud.sampleReader(database);
    const view = Hud.fillUnitView(Hud.newUnitView(), reader, reader.activeUnit(), true, null);
    const texts = style => { const ctx = fakeContext(); Hud.drawUnit(ctx, 400, 220, Object.assign(Hud.defaultProps('fightUnit'), { gaugeStyle: style }), view, theme({ Actor1: false })); return ctx.calls.fillText; };
    const at = (list, word) => list.find(call => call[0] === word);
    for (const style of ['clipped', 'bar']) {
        const list = texts(style);
        // Label left, numbers right, one baseline, the same in all three rows.
        const rows = [['HP', '120/120'], ['MP', '97/121'], ['TP', '0']].map(([label, value]) => [at(list, label), at(list, value)]);
        for (const [label, value] of rows) assert.ok(label && value && value[1] > label[1], `${style}: ${JSON.stringify(rows)}`);
        assert.equal(new Set(rows.map(([label]) => label[1])).size, 1, `${style}: the labels share a left edge`);
        assert.equal(new Set(rows.map(([, value]) => value[1])).size, 1, `${style}: the numbers share a right edge`);
        for (const [label, value] of rows) assert.ok(Math.abs(label[2] - value[2]) <= 3, `${style}: label and numbers on one line`);
        const steps = [rows[1][0][2] - rows[0][0][2], rows[2][0][2] - rows[1][0][2]];
        assert.equal(steps[0], steps[1], `${style}: the rows are evenly spaced`);
    }
    // HP that was just lost shows as a stretch of the bar that runs down; the numbers are the real ones at once.
    const hurt = Object.assign({}, view, { hp: 60, hpShown: 100, stats: view.stats, icons: [] });
    const ctx = fakeContext();
    Hud.drawUnit(ctx, 400, 220, Hud.defaultProps('fightUnit'), hurt, theme({ Actor1: false }));
    assert.ok(ctx.calls.fillText.some(call => call[0] === '60/120'));
});

test('a unit panel draws the unit: name, level, gauges with numbers, parameters; the forecast takes the parameters\' place', () => {
    const reader = Hud.sampleReader(database);
    const node = Object.assign(Hud.defaultProps('fightUnit'), { fightUnit: 'active' });
    const active = Hud.fillUnitView(Hud.newUnitView(), reader, Hud.panelUnit(node, reader), true, null);
    assert.deepEqual([active.name, active.level, active.className, active.team, active.mhp, active.stats.atk, active.stats.move], ['Reid', 3, 'Soldier', 'ally', 120, 122, 4]);
    let ctx = fakeContext();
    assert.equal(Hud.drawUnit(ctx, 300, 124, node, active, theme({ Actor1: { width: 576, height: 288 } })), true);
    let words = ctx.calls.fillText.map(call => call[0]);
    for (const word of ['Reid', 'Lv 3', 'HP', '120/120', 'MP', 'TP', 'ATK', '122', 'MOV', '4']) assert.ok(words.includes(word), `missing ${word} in ${words}`);
    assert.ok(!words.some(word => /^Hit/.test(word)));

    const focusedNode = Object.assign(Hud.defaultProps('fightUnit'), { fightUnit: 'focused' });
    const target = Hud.panelUnit(focusedNode, reader);
    const focused = Hud.fillUnitView(Hud.newUnitView(), reader, target, true, reader.preview(target));
    assert.equal(focused.team, 'enemy');
    ctx = fakeContext();
    Hud.drawUnit(ctx, 300, 124, focusedNode, focused, theme());
    words = ctx.calls.fillText.map(call => call[0]);
    for (const word of ['Bat', 'Hit 85%', 'Crit 10%', 'Damage 34-41', 'Half cover · Flanked · High ground']) assert.ok(words.includes(word), `missing ${word} in ${words}`);
    assert.ok(!words.includes('ATK') && !words.includes('MP') && !words.includes('TP'), 'the forecast takes the room of the parameters, MP and TP');
    assert.ok(words.includes('HP'), 'HP stays, with what the blow would take marked on its bar');
    // The forecast is large: its two lines share what the three gauges and the parameters had.
    const rest = Hud.unitLayout(focusedNode, 300, 124, true, false), aimed = Hud.unitLayout(focusedNode, 300, 124, true, true);
    assert.equal(aimed.gauges.length, 1);
    assert.deepEqual([aimed.header.y, aimed.gauges[0].y], [rest.header.y, rest.gauges[0].y], 'the name and HP do not jump when the forecast comes up');
    assert.ok(aimed.forecast.height >= rest.block.height * 1.8 && aimed.forecast.y + aimed.forecast.height <= 124);
    // A blow that would finish the target says so in capitals on a red band, in place of the notes.
    focused.preview = Object.assign({}, focused.preview, { defeats: true });
    ctx = fakeContext();
    Hud.drawUnit(ctx, 300, 124, focusedNode, focused, theme());
    words = ctx.calls.fillText.map(call => call[0]);
    assert.ok(words.includes('DEFEATS') && !words.some(word => /cover/.test(word)));
    // An action that lands on several units: the panel steps through them, and one line sums them all up.
    const area = Hud.sampleReader(database, { area: true });
    assert.deepEqual([0, 1, 2].map(cycle => Hud.panelUnit(focusedNode, area, cycle).id), [3, 4, 3]);
    const second = Hud.panelUnit(focusedNode, area, 1);
    const view = Hud.fillUnitView(Hud.newUnitView(), area, second, true, area.preview(second));
    view.area = Hud.areaSummary(area, second, {});
    assert.deepEqual(view.area, { count: 2, index: 1, hitMin: 0.7, hitMax: 0.85, damageMin: 34, damageMax: 60, defeats: 1, heals: 0 });
    ctx = fakeContext();
    Hud.drawUnit(ctx, 300, 124, focusedNode, view, theme());
    words = ctx.calls.fillText.map(call => call[0]);
    for (const word of ['Slime', '2/2', 'Hit 70%', 'Damage 52-60', 'DEFEATS', '2 targets:  Hit 70-85%  Damage 34-60  Defeats 1']) assert.ok(words.includes(word), `missing ${word} in ${words}`);
    assert.equal(Hud.areaSummary(reader, target, {}), null, 'one target: no summary');
    assert.equal(Hud.rangeText(12, 12), '12');
    assert.equal(Hud.percent(1.4), '100%');
});

test('a portrait is the face, else the model\'s portrait, else the map sprite, else the battle picture, else the initials; none needs 3D', () => {
    const none = theme();
    const withModel = picture => Object.assign(theme(), { thumbnail: () => picture, enemy: () => false });
    assert.equal(Hud.portraitKind({ faceName: 'Actor1', characterName: 'Actor1', model: { name: 'Tank' } }, withModel({})), 'face');
    assert.equal(Hud.portraitKind({ faceName: '', characterName: 'People1', model: { name: 'Tank' } }, withModel({ width: 128 })), 'model');
    assert.equal(Hud.portraitKind({ faceName: '', characterName: 'People1', model: { name: 'Tank' } }, withModel(null)), 'modelPending');
    assert.equal(Hud.portraitKind({ faceName: '', characterName: 'People1', model: { name: 'Tank' } }, withModel(false)), 'character', 'no portrait to be had: the map sprite');
    assert.equal(Hud.portraitKind({ faceName: '', characterName: 'People1' }, none), 'character');
    assert.equal(Hud.portraitKind({ faceName: '', characterName: '', battlerName: 'Bat' }, withModel(false)), 'battler');
    assert.equal(Hud.portraitKind({ faceName: '', characterName: '', battlerName: 'Bat', model: { name: 'Tank' } }, withModel(false)), 'initials', 'a model unit has no use for a battle picture');
    assert.equal(Hud.portraitKind({ faceName: '', characterName: '', model: { file: 'tank.glb' } }, none), 'initials');
    assert.equal(Hud.portraitKind({ faceName: '', characterName: '' }), 'initials');
    assert.equal(Hud.initials('Dark Knight'), 'DK');
    assert.equal(Hud.initials('bat'), 'B');
    assert.equal(Hud.initials(''), '?');
    // An 8-character sheet: character 5 is the second of the lower row; the standing frame is the middle of its first row.
    assert.deepEqual(Hud.characterFrame('People1', 5, 576, 384), [48 * 4, 192, 48, 48]);
    assert.deepEqual(Hud.characterFrame('$BigMonster', 0, 144, 192), [48, 0, 48, 48]);
    assert.deepEqual(Hud.characterFrame('!$Door', 3, 144, 192), [48, 0, 48, 48]);
    // Loading (null) asks for another draw; a picture that does not exist (false) falls back to the initials at once.
    const view = Object.assign(Hud.newUnitView(), { name: 'Bat', characterName: 'Monster' });
    let ctx = fakeContext();
    assert.equal(Hud.drawPortrait(ctx, 0, 0, 64, view, theme(), '#ff0000', 2), false);
    ctx = fakeContext();
    assert.equal(Hud.drawPortrait(ctx, 0, 0, 64, view, theme({ Monster: false }), '#ff0000', 2), true);
    assert.deepEqual(ctx.calls.fillText.map(call => call[0]), ['B']);
    ctx = fakeContext();
    assert.equal(Hud.drawPortrait(ctx, 0, 0, 64, view, theme({ Monster: { width: 576, height: 384 } }), '#ff0000', 2), true);
    assert.equal(ctx.calls.drawImage, 1);
    // A model unit: its portrait once it is made; a plain figure (never a letter) while it is being made, and another draw asked for.
    const tank = Object.assign(Hud.newUnitView(), { name: 'Tank', model: { name: 'Vehicles/Tank' } });
    ctx = fakeContext();
    assert.equal(Hud.drawPortrait(ctx, 0, 0, 64, tank, withModel({ width: 128, height: 128 }), '#ff0000', 2), true);
    assert.deepEqual([ctx.calls.drawImage, ctx.calls.fillText.length], [1, 0]);
    ctx = fakeContext();
    assert.equal(Hud.drawPortrait(ctx, 0, 0, 64, tank, withModel(null), '#ff0000', 2), false);
    assert.deepEqual([ctx.calls.drawImage, ctx.calls.fillText.length], [0, 0]);
});

test('Overwatch, Wait and End Turn are written the way the project writes Attack: its case, and icons from its own sheet', () => {
    const demo = Hud.commandStyle(['\\i[588] ATTACK', '\\i[496] SKILLS', '\\i[595] ITEMS']);
    const plain = Hud.commandStyle(['Attack', 'Skill', 'Item']);
    assert.deepEqual([demo, plain], [{ upper: true, icons: true }, { upper: false, icons: false }]);
    assert.deepEqual(Hud.commandStyle(['\\i[1] Attack', 'SKILL', 'Item']), { upper: false, icons: false }, 'only when all three agree');
    const node = Hud.normalizeProps({ fightWindow: 'command' }, 'fightWindow');
    assert.equal(node.commandIcons, true);
    assert.deepEqual(Hud.WINDOW_LABELS, ['mount', 'dismount', 'overwatch', 'wait', 'endTurn', 'auto']);
    assert.equal(Hud.commandText(node, 'auto', '', demo, () => true), '\\i[237] AUTO');
    assert.equal(Hud.commandLabel(node, 'wait', '', demo), 'WAIT');
    assert.equal(Hud.commandLabel(node, 'overwatch', '', demo), 'OVERWATCH');
    assert.equal(Hud.commandLabel(node, 'endTurn', '', plain), 'End Turn');
    assert.equal(Hud.commandLabel(node, 'wait', 'Hold', demo), 'Hold', 'the project\'s own term is written as given');
    // The window draws an icon code the way it draws Attack's: one mechanism for every row.
    const every = () => true, none = () => false;
    assert.equal(Hud.commandText(node, 'wait', '', demo, every), '\\i[191] WAIT');
    assert.equal(Hud.commandText(node, 'endTurn', '', demo, every), '\\i[587] END TURN');
    assert.equal(Hud.commandText(node, 'overwatch', '', demo, every), '\\i[236] OVERWATCH');
    assert.equal(Hud.commandText(node, 'wait', '', plain, every), 'Wait', 'a project whose commands carry no icons gets none');
    assert.equal(Hud.commandText(Object.assign({}, node, { waitIcon: 12 }), 'wait', '', demo, every), '\\i[12] WAIT', 'the node names another icon');
    assert.equal(Hud.commandText(Object.assign({}, node, { waitIcon: 0 }), 'wait', '', demo, every), 'WAIT', '0: no icon from the sheet');
    const own = Hud.normalizeProps({ fightWindow: 'command', fightLabels: { wait: '\\i[75] Stand by' }, commandIcons: false }, 'fightWindow');
    assert.equal(Hud.commandText(own, 'wait', 'Hold', demo, every), '\\i[75] Stand by', 'the node\'s word wins, with whatever icon it brings');
    assert.equal(Hud.commandText(own, 'endTurn', '', demo, every), 'END TURN', 'icons switched off on the node');
    // A sheet with no picture at that index: the word alone, and the HUD draws its own icon in the same place.
    const bare = Hud.commandText(node, 'wait', '', demo, none);
    assert.equal(bare, 'WAIT');
    assert.equal(Hud.commandGlyph(node, 'wait', bare, demo), true);
    assert.equal(Hud.commandGlyph(node, 'wait', '\\i[191] WAIT', demo), false);
    assert.equal(Hud.commandGlyph(node, 'wait', 'Wait', plain), false);
    assert.equal(Hud.commandGlyph(own, 'endTurn', 'END TURN', demo), false, 'switched off on the node');
    assert.equal(Hud.commandGlyph(node, 'attack', 'ATTACK', demo), false);
    const ctx = fakeContext();
    for (const key of Hud.WINDOW_LABELS) Hud.drawGlyph(ctx, key, 0, 0, 32, '#ffffff');
});

test('Mount and Dismount are the battle\'s own commands: the project\'s case, an icon from its sheet, the HUD\'s drawing where the sheet has none', () => {
    const demo = Hud.commandStyle(['\\i[588] ATTACK', '\\i[496] SKILLS', '\\i[595] ITEMS']);
    const plain = Hud.commandStyle(['Attack', 'Skill', 'Item']);
    const node = Hud.normalizeProps({ fightWindow: 'command' }, 'fightWindow');
    assert.deepEqual([node.mountIcon, node.dismountIcon], [Hud.COMMAND_ICONS.mount, Hud.COMMAND_ICONS.dismount]);
    const every = () => true, none = () => false;
    assert.equal(Hud.commandText(node, 'mount', '', demo, every), '\\i[' + Hud.COMMAND_ICONS.mount + '] MOUNT');
    assert.equal(Hud.commandText(node, 'dismount', '', demo, every), '\\i[' + Hud.COMMAND_ICONS.dismount + '] DISMOUNT');
    assert.equal(Hud.commandText(node, 'dismount', '', plain, every), 'Dismount');
    assert.equal(Hud.commandText(Object.assign({}, node, { mountIcon: 12 }), 'mount', 'Saddle up', demo, every), '\\i[12] Saddle up', 'the node names another icon; the project its own word');
    // A sheet with no picture there (a stock sheet is shorter): the HUD draws a wheel and an arrow in the icon's place.
    const bare = Hud.commandText(node, 'mount', '', demo, none);
    assert.equal(bare, 'MOUNT');
    assert.equal(Hud.commandGlyph(node, 'mount', bare, demo), true);
    const ctx = fakeContext();
    for (const key of ['mount', 'dismount']) Hud.drawGlyph(ctx, key, 0, 0, 32, '#ffffff');
});

test('a unit that rides a vehicle with a life of its own shows that life under its own HP', () => {
    const node = Hud.normalizeProps({}, 'fightUnit');
    const keys = layout => layout.gauges.map(row => row.key);
    assert.deepEqual(keys(Hud.unitLayout(node, 520, 220, true, false)), ['hp', 'mp', 'tp']);
    assert.deepEqual(keys(Hud.unitLayout(node, 520, 220, true, false, true)), ['hp', 'vhp', 'mp', 'tp']);
    assert.deepEqual(keys(Hud.unitLayout(node, 520, 220, true, true, true)), ['hp'], 'the forecast takes the room, as it takes MP and TP');
    assert.ok(Hud.unitLayout(node, 520, 220, true, false, true).unit <= Hud.unitLayout(node, 520, 220, true, false).unit, 'the rows share the height');
    // The view carries the vehicle's life, and the panel is drawn again when it changes.
    const battler = { hp: 50, mhp: 100, mp: 5, mmp: 10, tp: 0, name: () => 'Rider', isActor: () => true };
    const vehicle = { hp: 300, mhp: 544, name: () => 'Motorcycle' };
    const reader = { unitInfo: () => ({ id: 1, name: 'Rider', team: 'ally', battler, level: 3, vehicle }) };
    const view = Hud.fillUnitView(Hud.newUnitView(), reader, { id: 1 }, true, null);
    assert.deepEqual([view.vhp, view.vmhp, view.vname], [300, 544, 'Motorcycle']);
    const key = Hud.viewKey(view);
    vehicle.hp = 200;
    assert.notEqual(Hud.viewKey(Hud.fillUnitView(view, reader, { id: 1 }, true, null)), key);
    reader.unitInfo = () => ({ id: 1, name: 'Rider', team: 'ally', battler, level: 3, vehicle: null });
    assert.equal(Hud.fillUnitView(view, reader, { id: 1 }, true, null).vmhp, 0, 'on foot: no such row');
});

test('the hint says why the highlighted choice cannot be made; the battle\'s own line stands in for the plain stage line', () => {
    const reader = Hud.sampleReader(database);
    const node = Object.assign(Hud.defaultProps('fightInfo'), { fightInfo: 'hint' });
    const terms = { mp: 'MP', tp: 'TP' };
    const battler = reader.unitInfo(reader.activeUnit()).battler;
    reader.state.state = 'command';
    assert.equal(Hud.infoText(node, reader, null, terms), 'Choose an action');
    assert.equal(Hud.infoText(node, reader, { kind: 'command', symbol: 'attack', enabled: true }, terms), 'Choose an action');
    assert.equal(Hud.infoText(node, reader, { kind: 'command', symbol: 'attack', enabled: false }, terms), 'Cannot attack');
    assert.equal(Hud.infoText(node, reader, { kind: 'command', symbol: 'skill', enabled: false }, terms), 'No skill to use');
    assert.equal(Hud.infoText(node, reader, { kind: 'command', symbol: 'item', enabled: false }, terms), 'No item to use');
    reader.state.state = 'skill';
    battler.mp = 3; battler.tp = 10;
    assert.equal(Hud.infoText(node, reader, { kind: 'skill', enabled: false, item: { mpCost: 8, tpCost: 0 } }, terms), 'Not enough MP');
    assert.equal(Hud.infoText(node, reader, { kind: 'skill', enabled: false, item: { mpCost: 0, tpCost: 20 } }, terms), 'Not enough TP');
    assert.equal(Hud.infoText(node, reader, { kind: 'skill', enabled: false, item: { mpCost: 0, tpCost: 0 } }, terms), 'Cannot be used now');
    assert.equal(Hud.infoText(node, reader, { kind: 'item', enabled: false, item: {} }, terms), 'Cannot be used now');
    // Aiming: a cell the action does not reach, a cell with nobody to land on.
    reader.state.state = 'target';
    assert.equal(Hud.infoText(node, reader, null, terms), 'Fire: Choose a target');
    reader.inRange = () => false;
    assert.equal(Hud.infoText(node, reader, null, terms), 'Fire: Out of reach');
    reader.inRange = () => true;
    reader.state.focused = null;
    assert.equal(Hud.infoText(node, reader, null, terms), 'Fire: No target there');
    const custom = Object.assign({}, node, { fightLabels: { whyCost: 'Short of %1' } });
    reader.state.state = 'skill';
    assert.equal(Hud.infoText(custom, reader, { kind: 'skill', enabled: false, item: { mpCost: 8 } }, terms), 'Short of MP');
    // The battle's own line (a tip) takes the plain stage line's place, never the reason a choice is greyed.
    reader.hintText = () => 'Left Right: turn the unit';
    reader.state.state = 'command';
    assert.equal(Hud.infoText(node, reader, null, terms), 'Left Right: turn the unit');
    assert.equal(Hud.infoText(node, reader, { kind: 'command', symbol: 'attack', enabled: true }, terms), 'Left Right: turn the unit');
    assert.equal(Hud.infoText(node, reader, { kind: 'command', symbol: 'attack', enabled: false }, terms), 'Cannot attack');
    // The battle says why it greyed a command of its own: nobody stands in the attack's reach.
    reader.commandReason = symbol => (symbol === 'attack' ? 'whyNoReach' : symbol === 'skill' ? 'notALabel' : '');
    assert.equal(Hud.infoText(node, reader, { kind: 'command', symbol: 'attack', enabled: false }, terms), 'Nobody in reach');
    assert.equal(Hud.infoText(node, reader, { kind: 'command', symbol: 'skill', enabled: false }, terms), 'No skill to use', 'a reason the HUD has no words for leaves it its own');
    assert.equal(Hud.infoText(node, reader, { kind: 'command', symbol: 'attack', enabled: true }, terms), 'Left Right: turn the unit', 'no reason is asked for a choice that can be made');
    reader.state.state = 'skill';
    reader.hintText = () => '';
    assert.equal(Hud.infoText(node, reader, { kind: 'skill', enabled: false, item: { mpCost: 8 } }, terms), 'Not enough MP', 'an empty line leaves the HUD its own words');
});

test('the turn strip lists both turn styles, leaves out the fallen, and shows as many boxes as fit', () => {
    const node = Object.assign(Hud.defaultProps('fightTurnOrder'), { cellGap: 6 });
    const team = Hud.sampleReader(database, { turns: 'team' });
    const teamOrder = team.turnOrder();
    // Team turns: the side whose turn it is (those yet to act first), then the other side.
    assert.deepEqual(teamOrder.map(entry => [entry.team, entry.active, entry.acted]),
        [['ally', true, false], ['ally', false, true], ['enemy', false, false], ['enemy', false, false]]);
    let layout = Hud.turnLayout(node, 600, 56, teamOrder, {});
    assert.equal(layout.count, 4);
    // A tile takes three quarters of the strip's room; the acting unit's is a little larger, and no taller than the room.
    assert.equal(layout.size, Math.round((56 - layout.marker) * 0.75));
    assert.ok(layout.big > layout.size && layout.big <= 56 - layout.marker);
    assert.deepEqual(Array.from(layout.sizes), [layout.big, layout.size, layout.size, layout.size], 'the first unit is acting');
    // One tile every size + gap, and a wider gap where the other side begins. The acting tile is centered on its
    // own place: it reaches the same few pixels past it on both sides, into the gaps, and stops short of its neighbor.
    const over = layout.top;
    assert.equal(over, Math.floor((layout.big - layout.size) / 2));
    assert.equal(layout.xs[1] - (layout.xs[0] + over), layout.size + 6);
    assert.equal(layout.xs[2] - layout.xs[1], layout.size + 18);
    assert.ok(layout.xs[1] - (layout.xs[0] + layout.big) >= 1);
    // Centered: the same room on both sides (the room the acting tile's growth takes is kept at both ends).
    assert.ok(Math.abs(layout.xs[0] - (600 - (layout.xs[3] + layout.size + (layout.big - layout.size - over)))) <= 1);
    // The row stands still whoever acts, and when nobody does.
    const idle = Hud.turnLayout(node, 600, 56, teamOrder.map(entry => Object.assign({}, entry, { active: false })), {});
    assert.deepEqual(Array.from(idle.xs).slice(1), Array.from(layout.xs).slice(1));
    assert.equal(idle.xs[0], layout.xs[0] + over);
    const second = Hud.turnLayout(node, 600, 56, teamOrder.map((entry, i) => Object.assign({}, entry, { active: i === 2 })), {});
    assert.deepEqual([second.xs[0], second.xs[1], second.xs[2] + over, second.xs[3]], Array.from(idle.xs));
    // A strip with no gap between its tiles has no room to grow one: the acting tile is marked, not larger.
    const tight = Hud.turnLayout(Object.assign({}, node, { cellGap: 0 }), 600, 56, teamOrder, {});
    assert.deepEqual([tight.big, tight.top], [tight.size, 0]);

    const initiative = Hud.sampleReader(database, { turns: 'initiative' });
    assert.equal(initiative.currentTeam(), 'any');
    const order = initiative.turnOrder();
    assert.equal(order.length, 4);
    assert.deepEqual(order.map(entry => entry.unitId), [1, 2, 3, 4], 'initiative: fastest first (ties by id)');

    assert.deepEqual([layout.chipCount, Hud.turnLayout(node, 600, 56, order, {}).chipCount], [0, 0], 'everyone fits: no count');
    // An army, 30 a side (one ally fallen), team turns: each side shows its first few and ends in a box with the count of its others.
    const army = active => Array.from({ length: 60 }, (_, i) => ({ unitId: i + 1, team: i < 30 ? 'ally' : 'enemy', active: i === active, acted: false, defeated: i === 1 }));
    let many = army(0);
    layout = Hud.turnLayout(node, 600, 56, many, layout);
    // Counting: the tiles are at their smallest, and the acting tile's extra width is set aside.
    assert.equal(layout.size, Math.max(Hud.TURN_LEAST, Math.round(Math.round((56 - layout.marker) * 0.75) * Hud.TURN_SMALL)));
    const step = layout.size + 6, slots = Math.floor((600 - 12 + 6 - (layout.big - layout.size)) / step);
    assert.equal(layout.chipCount, 2);
    assert.equal(layout.count + 2, slots, 'every place in the strip is used, and no more boxes than fit');
    const allies = layout.entries.filter(entry => entry.team === 'ally').length, enemies = layout.count - allies;
    assert.ok(allies > enemies && enemies >= 2, 'the side whose turn it is gets the larger share');
    assert.deepEqual(layout.chips.slice(0, 2).map(chip => [chip.team, chip.count]), [['ally', 29 - allies], ['enemy', 30 - enemies]]);
    assert.ok(!layout.ids.includes(2), 'a fallen unit has no box and is not counted');
    assert.equal(layout.ids[0], 1, 'the acting unit leads');
    // In order along the strip: allies, their count, a wider gap, enemies, their count; all inside it.
    assert.equal(layout.chips[0].x, layout.xs[allies - 1] + step);
    assert.equal(layout.xs[allies], layout.chips[0].x + step + 12);
    assert.equal(layout.chips[1].x, layout.xs[layout.count - 1] + step);
    assert.ok(layout.xs[0] >= 0 && layout.chips[1].x + layout.size <= 600);
    // The acting unit is far down its side's list (the player picked the 25th): it is shown all the same, first.
    layout = Hud.turnLayout(node, 600, 56, army(24), layout);
    assert.equal(layout.ids[0], 25);
    assert.deepEqual(layout.ids.slice(1, 3), [1, 3]);
    assert.equal(layout.entries.filter(entry => entry.team === 'ally').length, allies, 'in the same number of boxes');
    // A side small enough to show whole keeps all its boxes and gives the rest of the room to the other.
    many = army(0).filter((entry, i) => i < 4 || i >= 30);
    layout = Hud.turnLayout(node, 600, 56, many, layout);
    assert.deepEqual([layout.chipCount, layout.chips[0].team, layout.entries.filter(entry => entry.team === 'ally').length], [1, 'enemy', 3]);
    assert.equal(layout.count + 1, slots);
    // Initiative (the sides mixed): one count at the end, in no side's color.
    many = Array.from({ length: 60 }, (_, i) => ({ unitId: i + 1, team: i % 2 ? 'enemy' : 'ally', active: i === 0, acted: false, defeated: false }));
    layout = Hud.turnLayout(node, 600, 56, many, layout);
    assert.deepEqual([layout.chipCount, layout.chips[0].team, layout.chips[0].count], [1, '', 60 - layout.count]);
    assert.ok(layout.count + 1 <= slots + 1 && layout.chips[0].x + layout.size <= 600);
    // The Demo's strip at 1080p with 30 a side.
    const wide = Hud.turnLayout(node, 1884, 90, army(0), {});
    assert.ok(wide.count >= 14 && wide.chipCount === 2 && wide.chips[1].x + wide.size <= 1884);
    assert.equal(wide.count + wide.chips[0].count + wide.chips[1].count, 59);
    const capped = Hud.turnLayout(Object.assign({}, node, { maxCells: 3 }), 600, 56, army(0), {});
    assert.ok(capped.count <= 3 && capped.count + capped.chips[0].count + capped.chips[1].count === 59);
    assert.equal(Hud.turnLayout(Object.assign({}, node, { align: 'left' }), 600, 56, army(0), {}).xs[0], 0);
    const counted = fakeContext();
    Hud.drawTurnOrder(counted, 600, 56, node, army(0), id => Object.assign(Hud.newUnitView(), { name: 'U' + id }), theme());
    assert.deepEqual(counted.calls.fillText.map(call => call[0]).filter(word => word.startsWith('+')), ['+' + (29 - allies), '+' + (30 - enemies)]);

    const ctx = fakeContext();
    const view = Hud.newUnitView();
    Hud.drawTurnOrder(ctx, 600, 56, node, teamOrder, id => Hud.fillUnitView(view, team, team.unit(id), false, null), theme({ Actor1: false, $Big: false }));
    assert.deepEqual(ctx.calls.fillText.map(call => call[0]), ['R', 'P', 'B', 'S'], 'units with no picture show their initials');
});

test('battle text: objective, turn with the phase, the banner, and what to do next', () => {
    const reader = Hud.sampleReader(database);
    const info = kind => Hud.infoText(Object.assign(Hud.defaultProps('fightInfo'), { fightInfo: kind }), reader);
    assert.equal(info('objective'), 'Defeat all enemies');
    assert.equal(info('turn'), 'Turn 2  ·  Player Phase');
    assert.equal(info('phase'), 'Player Phase');
    assert.equal(info('hint'), 'Fire: Choose a target');
    reader.state.state = 'move';
    assert.equal(info('hint'), 'Choose where to move');
    reader.state.team = 'enemy';
    assert.equal(info('phase'), 'Enemy Phase');
    const initiative = Hud.sampleReader(database, { turns: 'initiative' });
    assert.equal(Hud.infoText(Object.assign(Hud.defaultProps('fightInfo'), { fightInfo: 'turn' }), initiative), 'Turn 2');
    assert.equal(Hud.infoText(Object.assign(Hud.defaultProps('fightInfo'), { fightInfo: 'phase' }), initiative), '', 'no phases under initiative');
    const custom = Object.assign(Hud.defaultProps('fightInfo'), { fightInfo: 'phase', fightLabels: { enemyPhase: 'Their move' } });
    assert.equal(Hud.infoText(custom, reader), 'Their move');
    // The banner fades in, holds, fades out, and is then gone.
    assert.equal(Hud.bannerAlpha(0, 90), 0);
    assert.equal(Hud.bannerAlpha(45, 90), 1);
    assert.ok(Hud.bannerAlpha(85, 90) < 1);
    assert.equal(Hud.bannerAlpha(90, 90), 0);
});

test('the stock layout keeps to the edges at 4:3 and 16:9, from 816x624 to 1920x1080', () => {
    for (const [width, height] of [[816, 624], [1024, 768], [1280, 720], [1920, 1080]]) {
        const rects = stockRects(width, height);
        for (const [name, rect] of Object.entries(rects)) {
            assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height, `${width}x${height}: ${name} leaves the screen ${JSON.stringify(rect)}`);
        }
        // The owner's three: acting unit lower left, focused unit lower right, turn order across the top.
        assert.ok(rects['Active Unit'].x < width * 0.05 && rects['Active Unit'].y + rects['Active Unit'].height > height * 0.95);
        assert.ok(rects['Focused Unit'].x + rects['Focused Unit'].width > width * 0.95 && rects['Focused Unit'].y + rects['Focused Unit'].height > height * 0.95);
        assert.ok(rects['Turn Order'].y < height * 0.05);
        assert.deepEqual([rects['Active Unit'].width, rects['Active Unit'].height], [rects['Focused Unit'].width, rects['Focused Unit'].height]);
        // The center of the battlefield stays clear of everything that is always up.
        const middle = { x: width * 0.4, y: height * 0.25, width: width * 0.2, height: height * 0.45 };
        for (const name of ['Active Unit', 'Focused Unit', 'Turn Order', 'Objective', 'Hint', 'Turn', 'Phase Banner']) {
            assert.ok(!overlaps(rects[name], middle), `${width}x${height}: ${name} covers the middle`);
        }
        // The command menu stands beside the acting unit's panel: one top, one baseline, one height, an even gap.
        const panel = rects['Active Unit'], command = rects.Command;
        assert.deepEqual([command.y, command.height], [panel.y, panel.height], `${width}x${height}: the command window and the panel differ in height or baseline`);
        assert.ok(command.x - (panel.x + panel.width) >= 6 && command.x - (panel.x + panel.width) <= panel.x + 2, `${width}x${height}: the gap is uneven`);
        assert.ok(!overlaps(command, rects['Focused Unit']), `${width}x${height}: the command menu covers the other panel`);
        // The lists stand on the panel, edge to edge with it, the same gap above it.
        for (const name of ['Skills', 'Items']) {
            assert.deepEqual([rects[name].x, rects[name].width], [panel.x, panel.width], `${width}x${height}: ${name} is not edge to edge with the panel`);
            assert.equal(panel.y - (rects[name].y + rects[name].height), command.x - (panel.x + panel.width));
        }
        for (const name of ['Objective', 'Hint', 'Turn']) assert.ok(!overlaps(rects[name], rects['Turn Order']));
        assert.ok(!overlaps(rects.Objective, rects.Hint) && !overlaps(rects.Hint, rects.Turn));
    }
    // The panels are seven commands tall (each an icon high) from 720p up, and 37% of a smaller screen at most.
    assert.equal(stockRects(1920, 1080)['Active Unit'].height, 7 * 34 + 24);
    assert.equal(stockRects(1280, 720)['Active Unit'].height, 7 * 34 + 24);
    assert.ok(stockRects(816, 624)['Active Unit'].height <= 624 * 0.37 + 1);
});

test('the command window is fitted to its list: as wide as its longest row, its rows sharing the panel\'s height', () => {
    const metrics = { padding: 12, lineHeight: 36, itemPadding: 8, colSpacing: 8, iconSize: 32 };
    const panel = 7 * 34 + 24;
    // Seven commands (Attack, Skills, Items, Overwatch, Wait, End Turn, Auto) in the stock panel: each row an icon high, the panel's height exactly.
    let fit = Hud.fitCommands(panel, [150, 120, 110, 190, 100, 170, 100], metrics, {});
    assert.deepEqual([fit.itemHeight, fit.height, fit.width], [34, panel, 190 + 16 + 8 + 24 + 8]);
    // Six and five: the rows grow to share the same height (the few pixels left over stay in the window).
    fit = Hud.fitCommands(panel, [150, 120, 110, 190, 100, 170], metrics, {});
    assert.deepEqual([fit.itemHeight, fit.height], [39, panel]);
    fit = Hud.fitCommands(panel, [150, 120, 110, 100, 170], metrics, {});
    assert.deepEqual([fit.itemHeight, fit.height, fit.width], [47, panel, 170 + 56]);
    // Four (initiative turns): still the panel's height.
    fit = Hud.fitCommands(panel, [150, 120, 110, 100], metrics, {});
    assert.deepEqual([fit.itemHeight, fit.height], [59, panel]);
    // Rows never stretch past 1.4 times stock, and never shrink under what an icon needs: a short node gives a taller window instead of crushed rows.
    fit = Hud.fitCommands(panel, [150, 120], metrics, {});
    assert.deepEqual([fit.itemHeight, fit.height], [62, 2 * 62 + 24]);
    fit = Hud.fitCommands(180, [1, 2, 3, 4, 5, 6], metrics, {});
    assert.deepEqual([fit.itemHeight, fit.height], [34, 228]);
    const node = Hud.normalizeProps({ fightWindow: 'command' }, 'fightWindow');
    assert.deepEqual([node.fitCommands, node.commandAlign, node.overwatchIcon, node.autoIcon, node.waitIcon, node.endTurnIcon], [true, 'left', 236, 237, 191, 587]);
    assert.deepEqual(Hud.normalizeProps({ fightWindow: 'command', fitCommands: false, commandAlign: 'center', waitIcon: 12, endTurnIcon: -4 }, 'fightWindow').waitIcon, 12);
});

//-----------------------------------------------------------------------------
// The runtime, against stubs for the engine classes it extends. No Reactor3D,
// no model, no 3D map: a plain 2D map is all the HUD ever needs.

function loadRuntime({ system = {}, interfaces = [], shared = true } = {}) {
    class Bitmap {
        constructor(width, height) { this.width = width; this.height = height; this.context = fakeContext(); this.fontSize = 26; this.clears = 0; }
        clear() { this.clears++; this.context.calls.fillText.length = 0; }
        isReady() { return true; }
    }
    function Window_Base() { this.initialize(...arguments); }
    Window_Base.prototype.initialize = function(rect) {
        Object.assign(this, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: true, alpha: 1, children: [], parent: null });
        this.updatePadding();
        this.createContents();
    };
    Window_Base.prototype.updatePadding = function() { this.padding = 12; };
    Window_Base.prototype.contentsWidth = function() { return this.width - this.padding * 2; };
    Window_Base.prototype.contentsHeight = function() { return this.height - this.padding * 2; };
    Window_Base.prototype.createContents = function() { this.contents = new Bitmap(this.contentsWidth(), this.contentsHeight()); };
    Window_Base.prototype.update = function() {};
    Window_Base.prototype.move = function(x, y, width, height) { Object.assign(this, { x, y, width, height }); };
    Window_Base.prototype.addInnerChild = function(child) { this.children.push(child); child.parent = this; };
    Window_Base.prototype.destroy = function() { this.destroyed = true; };
    class Sprite { constructor(bitmap) { Object.assign(this, { bitmap, x: 0, y: 0, alpha: 1, visible: true, parent: null }); } }
    const stub = () => { const C = function() {}; C.prototype.initialize = function() {}; return C; };
    // A Classic battle scene: what it builds and what it runs each frame are counted, nothing more.
    const SceneBattle = stub();
    SceneBattle.prototype.createDisplayObjects = function() { this.built = (this.built || 0) + 1; };
    SceneBattle.prototype.update = function() { this.frames = (this.frames || 0) + 1; };
    for (const name of ['isTimeActive', 'needsInputWindowChange', 'onEnemyCancel', 'onActorCancel', 'onSkillOk', 'onSkillCancel', 'commandSkill']) SceneBattle.prototype[name] = function() { return true; };
    const layer = { x: 0, y: 0, children: [], addChildAt(child, index) { this.children.splice(index, 0, child); child.parent = this; },
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; } };
    const sandbox = {
        console, location: { search: '' }, nw: { App: { argv: [] } }, process: { platform: 'linux' }, require: () => ({ existsSync: () => false }),
        Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
        Point: class { constructor(x, y) { this.x = x; this.y = y; } },
        Utils: { isNwjs: () => true }, Bitmap, Sprite, Window_Base, Window_Selectable: stub(),
        Scene_MenuBase: stub(), Scene_Boot: stub(), Scene_Map: stub(), Scene_Battle: SceneBattle, Scene_Title: stub(),
        TouchInput: { isTriggered: () => false, x: 0, y: 0 }, BattleManager: { actor: () => null, isTpb: () => false }, Scene_Menu: stub(), Scene_Status: stub(),
        Scene_GameEnd: stub(), Scene_Options: stub(), Scene_Save: stub(), Scene_Load: stub(),
        Graphics: { width: 1280, height: 720, boxWidth: 1280, boxHeight: 720 },
        DataManager: { isTitleSkip: () => false }, ConfigManager: { save() {} },
        PluginManager: { registerCommand() {} },
        SceneManager: { _stack: [], _scene: null, push() {}, goto() {} },
        ColorManager: new Proxy({}, { get: (_, key) => () => '#' + String(key).length.toString(16).padStart(6, '0') }),
        TextManager: { levelA: 'Lv', hpA: 'HP', mpA: 'MP', tpA: 'TP' },
        ImageManager: { iconWidth: 32, faceWidth: 144, loadFace: () => new Bitmap(576, 288), loadCharacter: () => new Bitmap(576, 384), loadSystem: () => new Bitmap(512, 640) },
        $dataSystem: Object.assign({ variables: [], optDisplayTp: true }, system),
        $gameSystem: { mainFontFace: () => 'test, sans-serif', windowPadding: () => 12, windowOpacity: () => 192 },
        $gameMap: { mapId: () => 1 }, $gameSwitches: { value: () => false }, $gameVariables: { value: () => 0 },
        $gameActors: { actor: () => null }, $gameParty: { members: () => [], inBattle: () => false },
        XMLHttpRequest: class { open() {} send() {} overrideMimeType() {} }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    if (shared) vm.runInContext(read('runtime/reactor_ui_fight.js'), sandbox);
    vm.runInContext(read('runtime/reactor_ui.js'), sandbox);
    sandbox.__layer = layer;
    sandbox.$dataUserInterfaces = interfaces;
    sandbox.__scene = { _windowLayer: layer, addWindow(window) { layer.children.push(window); } };
    sandbox.__battleScene = () => Object.assign(new SceneBattle(), { _windowLayer: layer, addWindow(window) { layer.children.push(window); } });
    return sandbox;
}

/** Two tiles (or a tile and a count box) of the game's strip that can be seen and stand on each other now, as words; '' when none do. */
function stripOverlap(strip) {
    const seen = [];
    for (const [id, sprite] of strip._turnSprites) if (sprite.visible && sprite.alpha > 0) seen.push({ name: 'unit ' + id, x: sprite.x, size: sprite._turnSize || strip._turnLayout.size });
    strip._turnMore.forEach((more, i) => { if (more.visible && more.alpha > 0) seen.push({ name: 'count ' + i, x: more.x, size: more._turnSize || strip._turnLayout.size }); });
    for (let i = 0; i < seen.length; i++) {
        for (let j = i + 1; j < seen.length; j++) {
            const a = seen[i], b = seen[j];
            if (a.x < b.x + b.size && b.x < a.x + a.size) return `${a.name} at ${a.x.toFixed(1)} (${a.size}) on ${b.name} at ${b.x.toFixed(1)} (${b.size})`;
        }
    }
    return '';
}

/** A battle that speaks the tactical calls, over the sample; `bump` says something changed. */
function fakeFight(options) {
    const reader = Hud.sampleReader(database, options);
    return Object.assign(reader, { isActive: () => true, isHere: () => true, mode: () => 'tactical', bump() { reader.state.revision++; } });
}

test('the runtime keeps the HUD nodes and the Tactical Battle HUD presentation through normalize', () => {
    const sandbox = loadRuntime();
    assert.equal(typeof sandbox.Reactor3D, 'undefined');
    const record = sandbox.ReactorUI.normalizeInterface(Object.assign({ id: 14 }, Hud.stockRecord({ width: 1280, height: 720 })));
    assert.equal(record.mode, 'tactical');
    assert.deepEqual(Array.from(record.nodes, node => node.type), ['fightTurnOrder', 'fightInfo', 'fightInfo', 'fightInfo', 'fightInfo', 'fightUnit', 'fightUnit', 'fightWindow', 'fightWindow', 'fightWindow']);
    const focused = record.nodes.find(node => node.name === 'Focused Unit');
    assert.deepEqual([focused.fightUnit, focused.fill, focused.anchor, focused.hideSameUnit], ['focused', 'window', 'bottomRight', true]);
    assert.equal(record.nodes.find(node => node.type === 'fightTurnOrder').fill, 'none');
    assert.equal(sandbox.ReactorUI.normalizeNode({ type: 'fightInfo', fightInfo: 'hint' }).fightInfo, 'hint');
});

test('a project with no Tactical HUD of its own gets the stock layout; a bound Tactical Battle HUD replaces it', () => {
    const own = { id: 2, name: 'Mine', mode: 'tactical', coordinateSpace: 'screen', nodes: [{ id: 1, type: 'fightUnit', x: 0, y: 0, width: 200, height: 100 }] };
    let sandbox = loadRuntime();
    assert.equal(sandbox.ReactorUI.fightInterface().nodes.length, 10, 'unbound: the stock layout, sized for the screen');
    assert.equal(sandbox.ReactorUI.fightInterface().nodes.find(node => node.name === 'Turn Order').width, 1280 - 24);
    sandbox = loadRuntime({ system: { reactorTacticalInterfaceId: 2 }, interfaces: [null, { id: 1, name: 'Menu', mode: 'scene', nodes: [] }, own] });
    assert.equal(sandbox.ReactorUI.fightInterface().name, 'Mine');
    sandbox = loadRuntime({ system: { reactorTacticalInterfaceId: 1 }, interfaces: [null, { id: 1, name: 'Menu', mode: 'scene', nodes: [] }, own] });
    assert.equal(sandbox.ReactorUI.fightInterface().nodes.length, 10, 'a binding that is not a Tactical Battle HUD plays the stock layout');
    // What the first builds wrote is read as the same thing: the old field, the old presentation name.
    sandbox = loadRuntime({ system: { reactorFightInterfaceId: 2 }, interfaces: [null, null, Object.assign({}, own, { mode: 'fight' })] });
    assert.deepEqual([sandbox.ReactorUI.fightInterface().name, sandbox.ReactorUI.fightInterface().mode], ['Mine', 'tactical']);
});

test('the HUD exists while a battle runs on the map, binds with no 3D at all, and redraws only when the battle says so', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    assert.equal(typeof sandbox.Reactor3D, 'undefined');
    UI.updateFightScene(scene);
    assert.equal(scene._reactorFightHud, null, 'no battle, no HUD');
    const fight = sandbox.$gameFight = fakeFight();
    UI.updateFightScene(scene);
    // Made on one frame and drawn from the next: nothing of it shows, or is drawn, on the frame that makes it.
    assert.ok(scene._reactorFightHud && scene._reactorFightHud._nodeWindows.every(window => window.visible === false && !window._fightShown));
    UI.updateFightScene(scene);
    const hud = scene._reactorFightHud;
    assert.equal(hud._nodeWindows.length, 7, 'three panels and strips, four text lines; the window nodes steer stock windows');
    assert.equal(hud._fightNodes.length, 3);
    const windowOf = name => hud._nodeWindows.find(window => window.node().name === name);
    const active = windowOf('Active Unit'), focused = windowOf('Focused Unit'), strip = windowOf('Turn Order'), turn = windowOf('Turn'), banner = windowOf('Phase Banner');
    const text = window => window.contents.context.calls.fillText.map(call => call[0]);
    assert.ok(text(active).includes('Reid') && text(active).includes('120/120'));
    assert.ok(text(focused).includes('Bat') && text(focused).includes('Hit 85%'));
    assert.deepEqual(text(turn), ['Turn 2  ·  Player Phase']);
    assert.equal(strip.children.length, 4, 'one sprite per turn box');
    assert.ok(active.visible && focused.visible && strip.visible);

    // Frames with nothing new: not one redraw, not one new sprite.
    const before = [active, focused, turn, banner].map(window => window.contents.clears);
    const cells = strip.children.map(sprite => sprite.bitmap.clears);
    for (let i = 0; i < 30; i++) UI.updateFightScene(scene);
    assert.deepEqual([active, focused, turn, banner].map(window => window.contents.clears), before);
    assert.deepEqual(strip.children.map(sprite => sprite.bitmap.clears), cells);
    assert.equal(strip.children.length, 4);

    // The acting unit is hurt: its panel redraws once, with the new number; a box whose state did not change is left alone.
    fight.unitInfo(fight.activeUnit()).battler.hp = 77;
    fight.bump();
    UI.updateFightScene(scene);
    assert.equal(active.contents.clears, before[0] + 1);
    assert.ok(text(active).includes('77/120'));
    const hurtTile = strip._turnSprites.get(fight.activeUnit().id);
    assert.deepEqual(strip.children.map(sprite => sprite.bitmap.clears - (sprite === hurtTile ? 1 : 0)), cells, 'its tile shows the new HP line; no other tile is drawn again');
    assert.equal(turn.contents.clears, before[2], 'a line whose words did not change is not redrawn');

    // The cursor leaves the target: the focused panel hides; the acting unit under its own cursor is not shown twice.
    fight.state.focused = null; fight.state.state = 'move'; fight.bump();
    UI.updateFightScene(scene);
    assert.equal(focused.visible, false);
    fight.state.focused = fight.state.active; fight.bump();
    UI.updateFightScene(scene);
    assert.equal(focused.visible, false);

    // The turn passes to the enemy: the banner replays, the strip reuses its sprites.
    assert.equal(banner._banner.frame > 0, true);
    fight.state.team = 'enemy'; fight.bump();
    UI.updateFightScene(scene);
    assert.deepEqual(text(banner), ['Enemy Phase']);
    assert.equal(banner._banner.frame, 1);
    for (let i = 0; i < 100; i++) UI.updateFightScene(scene);
    assert.equal(banner.visible, false, 'the banner goes away by itself');
    assert.equal(strip.children.length, 4);

    // The battle ends: the HUD is taken down, and a later battle builds it again.
    const layer = scene._windowLayer;
    assert.equal(layer.children.length, 7);
    sandbox.$gameFight = { isActive: () => false };
    UI.updateFightScene(scene);
    assert.equal(scene._reactorFightHud, null);
    assert.equal(layer.children.length, 0);
});

test('where the map can hold a battle its HUD is made ahead and out of sight, the battle takes it, and an edited record is built anew', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene, layer = scene._windowLayer;
    let records = [];
    sandbox.ReactorFight = Object.assign(sandbox.ReactorFight || {}, { Stage: { mapRecords: () => records } });
    sandbox.$dataMap = sandbox.$dataMap || { events: [] };
    UI.updateFightScene(scene);
    assert.equal(scene._reactorFightHudReady, false, 'a map that names no unit and spawns none readies nothing');
    assert.equal(layer.children.length, 0);
    // A map with a unit: made on the first quiet frame, hidden, and it is not yet the battle's.
    records = [{ record: 'enemy', id: 1 }]; scene._reactorFightHudReady = undefined;
    UI.updateFightScene(scene);
    const ready = scene._reactorFightHudReady;
    assert.ok(ready && ready.hud._nodeWindows.length === 7 && ready.hud._nodeWindows.every(window => window.visible === false && !window._fightShown));
    assert.equal(scene._reactorFightHud, null, 'no battle, no HUD');
    UI.updateFightScene(scene);
    assert.equal(scene._reactorFightHudReady, ready, 'made once');
    // The battle begins: the same windows, nothing built, drawn from the next frame as a new one is.
    sandbox.$gameFight = fakeFight();
    UI.updateFightScene(scene);
    assert.equal(scene._reactorFightHud, ready.hud);
    assert.equal(scene._reactorFightHudReady, undefined);
    assert.ok(ready.hud._nodeWindows.every(window => window.visible === false));
    UI.updateFightScene(scene);
    assert.ok(ready.hud._nodeWindows.some(window => window.visible), 'shown on the battle\'s second frame');
    assert.equal(layer.children.length, 7);
    // It ends: taken down as ever, and the next one is made after the map has had a second to itself.
    sandbox.$gameFight = { isActive: () => false };
    UI.updateFightScene(scene);
    assert.equal(layer.children.length, 0);
    for (let i = 0; i < 59; i++) UI.updateFightScene(scene);
    assert.equal(scene._reactorFightHudReady, undefined);
    for (let i = 0; i < 2; i++) UI.updateFightScene(scene);
    const again = scene._reactorFightHudReady;
    assert.ok(again && again.hud !== ready.hud && layer.children.length === 7);
    // The screen (so the stock record) changed in between: what was made ahead is let go and the battle builds its own.
    sandbox.Graphics.width += 96;
    sandbox.$gameFight = fakeFight();
    UI.updateFightScene(scene);
    assert.ok(scene._reactorFightHud && scene._reactorFightHud !== again.hud, 'built from the record as it is now');
    assert.equal(again.hud._nodeWindows.length, 0, 'the stale one was taken down');
    assert.equal(layer.children.length, 7);
});

test('the turn strip slides its boxes when the order changes and pools the ones that leave', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = fakeFight({ turns: 'initiative' });
    UI.updateFightScene(scene);
    const strip = scene._reactorFightHud._nodeWindows.find(window => window.node().type === 'fightTurnOrder');
    for (let i = 0; i < 40; i++) UI.updateFightScene(scene);
    assert.equal(strip._turnMoving, false, 'settled: nothing moves, nothing is computed');
    const order = fight.turnOrder();
    const firstSprite = strip._turnSprites.get(order[0].unitId), firstX = firstSprite.x;
    const nextSprite = strip._turnSprites.get(order[1].unitId), nextX = nextSprite.x;
    assert.equal(stripOverlap(strip), '');
    // The first unit acted and fell to the back; the last was defeated.
    order.push(order.shift());
    order[2].defeated = true;
    fight.bump();
    UI.updateFightScene(scene);
    assert.equal(strip._turnSprites.size, 3);
    assert.equal(strip._turnPool.length, 1);
    assert.equal(strip._turnMoving, true);
    // The tiles that keep their order slide up; the one that goes behind them does not slide over them: it goes
    // out where it was and comes up at its new place when they have made room.
    assert.ok(nextSprite.x < nextX && nextSprite.x > nextSprite._turnX, 'a tile that keeps its order is on its way, not there yet');
    assert.deepEqual([firstSprite.x, firstSprite.alpha], [firstSprite._turnX, 0], 'the tile that changes places is out of sight at its new place');
    assert.ok(firstSprite._turnX > firstX);
    let waited = 0;
    for (let i = 0; i < 60; i++) {
        UI.updateFightScene(scene);
        assert.equal(stripOverlap(strip), '', 'frame ' + i);
        if (firstSprite.alpha === 0) waited++;
    }
    assert.ok(waited >= 3, 'it waited for the others to leave its place (' + waited + ' frames)');
    assert.deepEqual([firstSprite.x, firstSprite.alpha, nextSprite.x], [firstSprite._turnX, 1, nextSprite._turnX]);
    assert.equal(strip._turnMoving, false);
    assert.equal(strip._turnMore.length, 0, 'everyone fits: no count box');
    // Reinforcements past what the strip holds: one more sprite with their count, redrawn only when the count changes.
    const sprites = strip.children.length;
    for (let i = 0; i < 80; i++) order.push({ unitId: 100 + i, team: i % 2 ? 'ally' : 'enemy', active: false, acted: false, defeated: false });
    fight.unit = id => ({ id, team: 'enemy' });
    fight.unitInfo = unit => ({ id: unit.id, name: 'Raider', team: 'enemy', battler: {}, move: 4 });
    fight.bump();
    UI.updateFightScene(scene);
    const more = strip._turnMore[0];
    assert.ok(more && more.visible && strip._turnMore.length === 1);
    const hidden = 83 - strip._turnSprites.size;
    assert.deepEqual(more.bitmap.context.calls.fillText.map(call => call[0]), ['+' + hidden]);
    assert.ok(strip._turnSprites.size + 1 <= Math.floor((strip.contentsWidth() + 6) / (strip._turnLayout.size + 6)), 'no more sprites than fit');
    for (let i = 0; i < 40; i++) { UI.updateFightScene(scene); assert.equal(stripOverlap(strip), '', 'with the count box, frame ' + i); }
    assert.equal(more.alpha, 1, 'the count box came up once its place was clear');
    assert.ok(strip.children.length <= strip._turnSprites.size + 1 + sprites, 'boxes are reused, not piled up');
    const drawn = more.bitmap.clears;
    order[5].acted = true;
    fight.bump();
    UI.updateFightScene(scene);
    assert.equal(more.bitmap.clears, drawn);
    // Most of them fall: everyone fits again and the count box is put away.
    for (let i = 8; i < order.length; i++) order[i].defeated = true;
    fight.bump();
    UI.updateFightScene(scene);
    assert.equal(more.visible, false);
});

test('a Tactical Window node places the stock window and leaves a missing one alone', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    sandbox.$gameFight = fakeFight();
    const command = { x: 0, y: 0, width: 100, height: 100, visible: true, openness: 255, alpha: 1, move(x, y, width, height) { Object.assign(this, { x, y, width, height }); }, refresh() { this.refreshed = true; } };
    scene._fightCommandWindow = command;
    UI.updateFightScene(scene);
    UI.updateFightScene(scene);
    const node = scene._reactorFightHud._fightNodes.find(entry => entry.node.fightWindow === 'command').node;
    const rect = stockRects(1280, 720).Command;
    assert.deepEqual([command.width, command.height, command.refreshed], [rect.width, rect.height, true]);
    assert.equal(command.x, rect.x);
    assert.ok(command.y > rect.y, 'it slides in from below');
    for (let i = 0; i < node.slideDuration + 1; i++) UI.updateFightScene(scene);
    assert.equal(command.y, rect.y);
});

test('the automatic battle (no tactical calls) still fills the HUD: acting unit, its target, the rest of the round', () => {
    const battler = (name, hp, agi, actor) => ({ hp, mhp: 100, mp: 5, mmp: 10, tp: 0, atk: 10, def: 10, mat: 10, mdf: 10, agi, luk: 10, name: () => name, isActor: () => !!actor,
        level: 4, faceName: () => 'Actor1', faceIndex: () => 2, allIcons: () => [], currentClass: () => ({ name: 'Scout' }) });
    const units = [
        { id: 1, team: 'ally', party: true, actorId: 1, enemy: null, eventId: 0, move: 5, defeated: false, gone: false, _b: battler('Reid', 90, 12, true) },
        { id: 2, team: 'enemy', party: false, actorId: 0, enemy: battler('Bat', 60, 20), eventId: 7, move: 3, defeated: false, gone: false },
        { id: 3, team: 'enemy', party: false, actorId: 0, enemy: battler('Slime', 0, 5), eventId: 8, move: 3, defeated: true, gone: true }
    ];
    const fight = {
        _units: units, _turns: 'team', _act: { unitId: 1, targetId: 2 }, _queue: [{ kind: 'unit', unitId: 2 }, { kind: 'turnEnd', team: 'enemy' }, { kind: 'unit', unitId: 3 }, { kind: 'roundEnd' }],
        turn: () => 3, unit: id => units.find(unit => unit.id === id) || null, battler: unit => unit.enemy || unit._b,
        character: unit => ({ x: unit.id, y: 4, characterName: () => (unit.eventId ? 'Monster' : 'Actor1'), characterIndex: () => 1 }),
        objective: () => ({ type: 'survive', turns: 5 }), unitOfEvent: () => null
    };
    const reader = Hud.reader(fight);
    assert.notEqual(reader, fight);
    assert.equal(Hud.reader(fight), reader, 'one stand-in per battle');
    assert.equal(reader.activeUnit().id, 1);
    assert.equal(reader.focusedUnit().id, 2);
    assert.equal(reader.tacticalState(), 'acting');
    assert.equal(reader.currentTeam(), 'ally');
    assert.equal(reader.objectiveText(), 'Survive 5 turns');
    assert.equal(reader.preview(units[1]), null);
    const order = reader.turnOrder();
    assert.deepEqual(order.map(entry => [entry.unitId, entry.active]), [[1, true], [2, false]], 'the acting unit, then who is still to act; the gone are left out');
    assert.equal(reader.turnOrder(), order, 'the same list until something changes');
    const revision = reader.tacticalRevision();
    assert.equal(reader.tacticalRevision(), revision);
    units[1].enemy.hp = 40;
    assert.notEqual(reader.tacticalRevision(), revision, 'a hit shows');
    const view = Hud.fillUnitView(Hud.newUnitView(), reader, units[0], true, null);
    assert.deepEqual([view.name, view.level, view.className, view.faceName, view.faceIndex, view.hp, view.stats.move], ['Reid', 4, 'Scout', 'Actor1', 2, 90, 5]);
    const enemy = Hud.fillUnitView(Hud.newUnitView(), reader, units[1], true, null);
    assert.deepEqual([enemy.faceName, enemy.characterName, enemy.level], ['', 'Monster', 0], 'an enemy with no face shows its map sprite');
    // Initiative: no side has the turn.
    fight._turns = 'initiative';
    assert.equal(reader.currentTeam(), 'any');
    // A battle that does speak the tactical calls is read as it is.
    const real = fakeFight();
    assert.equal(Hud.reader(real), real);
});

test('model portraits: none without the 3D runtime; with it, one drawing a frame, only while the battle rests, kept by model and variant across battles', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, P = UI.FightPortraits;
    // No Reactor3D at all (a plain 2D project): no portrait to be had, and nothing is queued or thrown.
    assert.equal(typeof sandbox.Reactor3D, 'undefined');
    assert.equal(UI.fightThumbnail({ name: 'Vehicles/Tank' }), false);
    assert.equal(UI.fightModelOf({ id: 1 }), null);
    assert.deepEqual([P.entries.size, P.queue.length], [0, 0]);
    assert.equal(UI.fightThumbnail(null), false);
    // With it: the loading and the drawing are stood in for here; the queue's own rules are what is under test.
    const painted = [], released = [];
    let coverage = { 'Vehicles/Tank': [0, 0.2, 0.31, 0.31], 'Actors/Scout': [0.5, 0.5] };
    P.available = () => true;
    P.load = entry => { entry.loading = false; entry.object = {}; entry.template = {}; };
    P.paint = entry => { painted.push(entry.model.name); entry.staged = entry.staged || { canvas: entry.model.name }; return coverage[entry.model.name].shift(); };
    P.release = entry => { if (entry.object) released.push(entry.model.name); entry.object = entry.template = entry.scene = entry.camera = null; };
    P.WAIT = 2;
    const tank = { name: 'Vehicles/Tank', file: 'Tank', ext: '.glb' }, scout = { name: 'Actors/Scout', file: 'Scout', ext: '.glb' };
    assert.equal(UI.fightThumbnail(tank), null, 'being made');
    assert.equal(UI.fightThumbnail(Object.assign({}, tank)), null, 'the same model is the same portrait');
    assert.equal(UI.fightThumbnail(scout), null);
    assert.equal(UI.fightThumbnail(Object.assign({}, tank, { variant: 'Desert' })), null, 'another variant is another portrait');
    assert.equal(P.entries.size, 3);
    coverage['Vehicles/Tank'].push(0.4, 0.4);
    const version = P.version;
    // A unit walks or an action plays: nothing is drawn.
    for (let i = 0; i < 5; i++) P.update(true);
    assert.deepEqual(painted, []);
    // At rest: one drawing a frame, the first that is due.
    P.update(false);
    assert.deepEqual(painted, ['Vehicles/Tank']);
    assert.equal(UI.fightThumbnail(tank), null, 'an empty drawing (its shaders and pictures not there yet) is not shown');
    P.update(false);
    assert.deepEqual(painted, ['Vehicles/Tank', 'Actors/Scout'], 'the tank pauses; the next model draws meanwhile');
    assert.deepEqual(UI.fightThumbnail(scout), { canvas: 'Actors/Scout' }, 'shown as soon as something is in the picture');
    assert.ok(P.version > version, 'and the HUD is told to draw again');
    for (let i = 0; i < 40; i++) P.update(false);
    assert.equal(P.queue.length, 0, 'done when two drawings in a row agree');
    assert.deepEqual(UI.fightThumbnail(tank), { canvas: 'Vehicles/Tank' });
    assert.deepEqual(released.slice().sort(), ['Actors/Scout', 'Vehicles/Tank', 'Vehicles/Tank'], 'the copies that made them are let go');
    const count = painted.length;
    for (let i = 0; i < 20; i++) P.update(false);
    assert.equal(painted.length, count, 'no cost once they are made');
    // A model that never draws anything has no portrait; the HUD falls back to the map sprite or the initials.
    coverage = { 'Vehicles/Ghost': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    const ghost = { name: 'Vehicles/Ghost' };
    UI.fightThumbnail(ghost);
    for (let i = 0; i < 60; i++) P.update(false);
    assert.equal(UI.fightThumbnail(ghost), false);
    // The battle ends: what made the portraits goes; a finished portrait is kept for the next battle, an unfinished one is not.
    coverage = { 'Vehicles/Half': [0.3, 0.6, 0.9, 0.2, 0.5, 0.7, 0.1, 0.4, 0.8] };
    const half = { name: 'Vehicles/Half' };
    UI.fightThumbnail(half);
    P.update(false);
    assert.deepEqual(UI.fightThumbnail(half), { canvas: 'Vehicles/Half' }, 'shown, and still being drawn');
    P.clear();
    assert.deepEqual([P.queue.length, P.target, P.pending], [0, null, null]);
    assert.equal(P.entries.has(P.keyOf(half)), false, 'a portrait still being made goes');
    assert.equal(P.entries.has(P.keyOf(ghost)), false, 'and one that failed');
    const before = painted.length;
    assert.deepEqual(UI.fightThumbnail(tank), { canvas: 'Vehicles/Tank' }, 'the next battle has it at once');
    assert.deepEqual(UI.fightThumbnail(scout), { canvas: 'Actors/Scout' });
    for (let i = 0; i < 10; i++) P.update(false);
    assert.equal(painted.length, before, 'and draws nothing for it');
    assert.equal(P.queue.length, 0);
    // No more than KEEP are held; the oldest go first.
    P.KEEP = 1;
    P.clear();
    assert.equal(P.entries.size, 1);
    P.forget();
    assert.deepEqual([P.entries.size, P.queue.length, P.target], [0, 0, null]);
});

test('a portrait fetched without waiting for the graphics card: one at a time, settled when it arrives, dropped if the battle ended meanwhile', async () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, P = UI.FightPortraits;
    const arrivals = [], painted = [];
    P.available = () => true;
    P.load = entry => { entry.loading = false; entry.object = {}; entry.template = {}; entry.scene = {}; };
    P.release = entry => { entry.object = entry.template = entry.scene = entry.camera = null; };
    P.paint = entry => { painted.push(entry.model.name); entry.staged = entry.staged || { canvas: entry.model.name }; return new Promise(resolve => arrivals.push(resolve)); };
    P.WAIT = 3;
    const a = { name: 'A' }, b = { name: 'B' };
    UI.fightThumbnail(a); UI.fightThumbnail(b);
    P.update(false);
    assert.deepEqual(painted, ['A']);
    assert.equal(P.pending.model.name, 'A');
    for (let i = 0; i < 5; i++) P.update(false);
    assert.deepEqual(painted, ['A'], 'nothing else is drawn while a picture is on its way');
    assert.equal(UI.fightThumbnail(a), null);
    arrivals.shift()(0.4);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(P.pending, null);
    assert.deepEqual(UI.fightThumbnail(a), { canvas: 'A' }, 'shown when its picture arrives');
    P.update(false);
    assert.deepEqual(painted, ['A', 'B'], 'the next is drawn while the first pauses');
    // The battle ends with B's picture still on its way: its arrival changes nothing.
    P.clear();
    const version = P.version;
    arrivals.shift()(0.4);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(P.version, version);
    assert.equal(P.entries.has(P.keyOf(b)), false);
    // The drawing itself: the async fetch is used when the renderer has one, and three's pack buffer is unbound at once.
    const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../runtime/reactor_ui.js'), 'utf8');
    assert.match(source, /fetched = renderer\.readRenderTargetPixelsAsync\(this\.target, 0, 0, drawn, drawn, pixels\);[\s\S]{0,260}gl\.bindBuffer\(gl\.PIXEL_PACK_BUFFER, null\);/);
    assert.match(source, /if \(fetched\) return fetched\.then\(\(\) => this\.develop\(entry, pixels\)\);/);
});

test('the highlighted menu row is read from the Tactical windows alone, and Wait draws with the HUD\'s icon', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI;
    const out = {};
    sandbox.SceneManager._scene = {};
    assert.equal(UI.fightMenuRow(out), null, 'no menu up');
    const command = { active: true, openness: 255, index: () => 2, commandSymbol: () => 'item', isCommandEnabled: () => false };
    // A Classic battle's own command window is never looked at.
    sandbox.SceneManager._scene = { _actorCommandWindow: command };
    assert.equal(UI.fightMenuRow(out), null);
    sandbox.SceneManager._scene = { _fightCommandWindow: command };
    const row = UI.fightMenuRow(out);
    assert.deepEqual([row.kind, row.symbol, row.enabled], ['command', 'item', false]);
    const key = row.key;
    command.isCommandEnabled = () => true;
    assert.notEqual(UI.fightMenuRow(out).key, key, 'the key changes with the row, so the hint is rewritten only then');
    const skill = { id: 9, mpCost: 30 };
    sandbox.SceneManager._scene._fightCommandWindow = Object.assign({}, command, { active: false });
    sandbox.SceneManager._scene._fightSkillWindow = { active: true, openness: 255, index: () => 0, item: () => skill, isEnabled: () => false };
    assert.deepEqual([UI.fightMenuRow(out).kind, out.item, out.enabled], ['skill', skill, false]);
    // Drawing Wait: the HUD's icon in an icon's room, then the word, in the window's own font and opacity.
    sandbox.TextManager.attack = '\\i[1] ATTACK'; sandbox.TextManager.skill = '\\i[2] SKILLS'; sandbox.TextManager.item = '\\i[3] ITEMS';
    const drawn = [];
    const win = {
        contents: { context: fakeContext(), paintOpacity: 255 },
        commandSymbol: index => ['attack', 'wait'][index], commandName: index => ['\\i[1] ATTACK', 'Wait'][index], isCommandEnabled: () => true,
        itemLineRect: () => ({ x: 0, y: 0, width: 200, height: 36 }), itemTextAlign: () => 'center', resetFontSettings() {}, changePaintOpacity() {},
        textWidth: text => text.length * 10, drawText: (text, x, y, width, align) => drawn.push(['text', text, x, align]), drawItem: index => drawn.push(['stock', index])
    };
    // The sheet here has 320 icons: Wait's (191) is on it, End Turn's (587) is past its end.
    const win2 = Object.assign({}, win, { commandSymbol: index => ['attack', 'wait', 'endTurn'][index], commandName: index => ['\\i[1] ATTACK', 'Wait', 'End Turn'][index],
        textSizeEx: text => ({ width: text.replace(/\\i\[\d+\]/g, '').length * 10 + (/\\i\[/.test(text) ? 36 : 0) }) });
    UI.styleFightCommands(win2, Hud.normalizeProps({ fightWindow: 'command' }, 'fightWindow'));
    assert.deepEqual([0, 1, 2].map(index => win2.commandName(index)), ['\\i[1] ATTACK', '\\i[191] WAIT', 'END TURN']);
    assert.equal(win2.itemTextAlign(), 'left', 'every row starts on one edge');
    for (let index = 0; index < 3; index++) win2.drawItem(index);
    // Attack and Wait go through the window's own drawing (the project's icon codes); End Turn gets the HUD's icon on the same left edge.
    assert.deepEqual(drawn, [['stock', 0], ['stock', 1], ['text', ' END TURN', 36, 'left']]);
    assert.deepEqual([0, 1, 2].map(index => win2._fightTextWidth(index)), [36 + 70, 36 + 50, 36 + 90], 'every row measures as an icon and a word');
});

test('in the game: the command window is fitted when it opens, HP runs down over a few frames, and a director\'s shot fades the panels', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = fakeFight();
    sandbox.TextManager.attack = '\\i[1] ATTACK'; sandbox.TextManager.skill = '\\i[2] SKILLS'; sandbox.TextManager.item = '\\i[3] ITEMS';
    let names = ['\\i[1] ATTACK', '\\i[2] SKILLS', '\\i[3] ITEMS', 'Wait', 'End Turn'], symbols = ['attack', 'skill', 'item', 'wait', 'endTurn'];
    const command = { x: 0, y: 0, width: 100, height: 100, visible: true, openness: 255, alpha: 1, padding: 12, refreshed: 0,
        move(x, y, width, height) { Object.assign(this, { x, y, width, height }); }, refresh() { this.refreshed++; }, createContents() {},
        maxItems: () => names.length, commandSymbol: index => symbols[index], commandName: index => names[index], drawItem() {},
        lineHeight: () => 36, itemPadding: () => 8, colSpacing: () => 8, itemHeight: () => 44, textWidth: text => text.length * 10,
        textSizeEx: text => ({ width: text.replace(/\\i\[\d+\]/g, '').length * 10 + (/\\i\[/.test(text) ? 36 : 0) }) };
    scene._fightCommandWindow = command;
    UI.updateFightScene(scene);
    const hud = scene._reactorFightHud;
    const node = hud._fightNodes.find(entry => entry.node.fightWindow === 'command');
    const rect = stockRects(1280, 720).Command, panel = stockRects(1280, 720)['Active Unit'];
    for (let i = 0; i < node.node.slideDuration + 2; i++) UI.updateFightScene(scene);
    // Five rows share the panel's height (262: 47 each), on its baseline, as wide as " END TURN" (the HUD's icon, 36 + 90) and its margins.
    assert.deepEqual([command.x, command.y, command.height, command.itemHeight()], [rect.x, panel.y, panel.height, 47]);
    assert.equal(command.width, 36 + 90 + 16 + 8 + 24 + 8);
    assert.ok(command.width < rect.width, 'no dead space');
    // The next unit has Overwatch, and Auto is on offer: seven rows, each an icon high, in the same height.
    names = names.slice(0, 3).concat(['Overwatch', 'Wait', 'End Turn', 'Auto']); symbols = symbols.slice(0, 3).concat(['overwatch', 'wait', 'endTurn', 'auto']);
    command.openness = 0;
    UI.updateFightScene(scene);
    command.openness = 255;
    for (let i = 0; i < node.node.slideDuration + 2; i++) UI.updateFightScene(scene);
    assert.deepEqual([command.y, command.height, command.itemHeight()], [panel.y, panel.height, 34]);
    assert.deepEqual([command.commandName(3), command.commandName(6)], ['\\i[236] OVERWATCH', '\\i[237] AUTO']);
    // The acting unit is hit: the numbers change at once, the bar runs down over the next frames and then rests.
    const active = hud._nodeWindows.find(window => window.node().name === 'Active Unit');
    fight.unitInfo(fight.activeUnit()).battler.hp = 40;
    fight.bump();
    UI.updateFightScene(scene);
    assert.equal(active._fightView.hp, 40);
    assert.equal(active._fightView.hpShown, 120);
    const clears = active.contents.clears;
    UI.updateFightScene(scene);
    assert.ok(active._fightView.hpShown < 120 && active._fightView.hpShown > 40);
    for (let i = 0; i < 80; i++) UI.updateFightScene(scene);
    assert.equal(active._fightView.hpShown, -1, 'at rest');
    const settled = active.contents.clears;
    assert.ok(settled > clears + 3 && settled < clears + 60, 'drawn while it runs');
    for (let i = 0; i < 30; i++) UI.updateFightScene(scene);
    assert.equal(active.contents.clears, settled, 'and not after');
    // A camera director's shot: the unit panels and the menus fade with it; the strip and the text lines stay.
    const strip = hud._nodeWindows.find(window => window.node().name === 'Turn Order'), turn = hud._nodeWindows.find(window => window.node().name === 'Turn');
    const look = { hud: 0.25, bars: 1 };
    sandbox.ReactorFight = { Director: { presentation: () => look } };
    active.alpha = strip.alpha = turn.alpha = 1;
    UI.updateFightScene(scene);
    assert.ok(Math.abs(command.alpha - 0.25) < 1e-9);
    const faded = active.alpha;
    look.hud = 1;
    active.alpha = 1;
    UI.updateFightScene(scene);
    assert.equal(command.alpha, 1);
    assert.ok(faded <= active.alpha * 0.25 + 1e-9 && active.alpha > 0, `${faded} against ${active.alpha}`);
    sandbox.ReactorFight = { Director: null };
    UI.updateFightScene(scene);
    assert.equal(command.alpha, 1, 'no director: as before');
});

//-----------------------------------------------------------------------------
// Tactical alone. A Classic battle (Scene_Battle, its Battle HUD record, its
// stock windows) reads nothing of the Tactical HUD, and the Tactical HUD
// nothing of it; the other map modes show none of it.

const box = (id, extra) => Object.assign({ id, type: 'box', name: 'Box ' + id, x: 10 * id, y: 0, width: 100, height: 40, fill: 'color', color: '#102030' }, extra);
const classicRecord = { id: 8, name: 'Battle', mode: 'battle', coordinateSpace: 'screen', hideStatusWindow: true, roles: ['battle'],
    nodes: [box(1), { id: 2, type: 'battleWindow', name: 'Actor Command', x: 0, y: 0, width: 192, height: 200, battleWindow: 'actorCommand' }] };
const tacticalRecord = Object.assign({ id: 9 }, Hud.stockRecord({ width: 1280, height: 720 }));

test('an army acting by itself: the unit panels and the strip follow a few times a second, the last change shown; the player\'s turn at once', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = fakeFight();
    let army = true, waits = false;
    fight.overlaps = () => army;
    fight.awaitsPlayer = () => waits;
    UI.updateFightScene(scene);
    const hud = scene._reactorFightHud;
    const active = hud._nodeWindows.find(window => window.node().name === 'Active Unit'), strip = hud._nodeWindows.find(window => window.node().name === 'Turn Order');
    const battler = fight.unitInfo(fight.activeUnit()).battler;
    const text = () => active.contents.context.calls.fillText.map(call => call[0]);
    const hurt = hp => { battler.hp = hp; fight.bump(); UI.updateFightScene(scene); };
    // The HP bar runs to its number over some frames after a change; the count starts when it rests.
    for (let i = 0; i < 60; i++) UI.updateFightScene(scene);
    const layouts = [];
    const layout = strip.layoutTurnOrder;
    strip.layoutTurnOrder = function() { layouts.push(1); return layout.apply(this, arguments); };
    // Thirty frames, a change on every one: three or four redraws, never one a frame.
    let before = active.contents.clears, shown = 0, last = '';
    for (let i = 0; i < 30; i++) {
        hurt(100 - i);
        const now = text().find(word => /\/120$/.test(word));
        if (now !== last) { last = now; shown++; }
    }
    assert.ok(shown >= 3 && shown <= 4, 'numbers shown: ' + shown);
    assert.ok(layouts.length >= 3 && layouts.length <= 4, 'strip layouts: ' + layouts.length);
    // The changes stop: the last one arrives by itself.
    for (let i = 0; i < UI.FIGHT_ARMY_FRAMES + 1; i++) UI.updateFightScene(scene);
    assert.ok(text().includes('71/120'));
    // The player's turn: every change on its own frame.
    waits = true;
    for (let i = 0; i < 60; i++) UI.updateFightScene(scene);
    hurt(60); assert.ok(text().includes('60/120'));
    hurt(59); assert.ok(text().includes('59/120'));
    // A battle that is no army is followed at once too.
    waits = false; army = false;
    hurt(58); assert.ok(text().includes('58/120'));
    hurt(57); assert.ok(text().includes('57/120'));
    assert.ok(active.contents.clears > before);
    // The hint line stays up through the short rests between an army's acts, and goes when the battle is no army.
    const hint = hud._nodeWindows.find(window => window.node().name === 'Hint');
    army = true;
    fight.state.active = fight.units.find(unit => unit.team === 'enemy');
    fight.state.state = 'enemy'; fight.bump(); UI.updateFightScene(scene);
    assert.equal(hint._fightText, 'The enemy is moving');
    const drawn = hint.contents.clears;
    fight.state.state = 'idle'; fight.bump(); UI.updateFightScene(scene);
    fight.state.state = 'enemy'; fight.bump(); UI.updateFightScene(scene);
    assert.deepEqual([hint._fightText, hint.contents.clears], ['The enemy is moving', drawn]);
    army = false;
    fight.state.state = 'idle'; fight.bump(); UI.updateFightScene(scene);
    assert.equal(hint._fightText, '');
});

test('a model\'s portrait is kept in memory, so a panel drawn from it never waits on the graphics card', () => {
    const source = read('runtime/reactor_ui.js');
    assert.match(source, /CONTEXT: \{ willReadFrequently: true \}/);
    assert.match(source, /this\.scratch\.getContext\("2d", this\.CONTEXT\)/);
    assert.match(source, /\(entry\.canvas \|\| entry\.staged\)\.getContext\("2d", this\.CONTEXT\)/);
});

test('a Classic battle reads only its own Battle HUD record, whatever is bound for Tactical', () => {
    const interfaces = [null, null, null, null, null, null, null, null, classicRecord, tacticalRecord];
    const battle = system => loadRuntime({ system, interfaces }).ReactorUI.battleInterface();
    assert.equal(battle({}), null, 'neither bound: the stock battle');
    assert.equal(battle({ reactorTacticalInterfaceId: 9 }), null, 'a Tactical record bound, no Battle record: the stock battle');
    assert.equal(battle({ reactorBattleInterfaceId: 8, reactorTacticalInterfaceId: 9 }).name, 'Battle');
    assert.equal(battle({ reactorBattleInterfaceId: 8 }).name, 'Battle');
    assert.equal(battle({ reactorBattleInterfaceId: 9 }), null, 'a Tactical record bound as the Battle HUD is not one');
    // The same Battle HUD record, whatever else is bound and whether or not the Tactical half is even loaded: the same bytes.
    const plain = JSON.stringify(loadRuntime({ system: { reactorBattleInterfaceId: 8 }, interfaces, shared: false }).ReactorUI.battleInterface());
    assert.equal(JSON.stringify(battle({ reactorBattleInterfaceId: 8 })), plain);
    assert.equal(JSON.stringify(battle({ reactorBattleInterfaceId: 8, reactorTacticalInterfaceId: 9 })), plain);
    assert.doesNotMatch(plain, /fightUnit|fightLabels|allyColor|cellSize|fightWindow|commandIcons/, 'no Tactical setting on a Classic node');
    // The other way round: a Battle record bound for Tactical is not one; the stock Tactical layout plays.
    const tactical = loadRuntime({ system: { reactorTacticalInterfaceId: 8, reactorBattleInterfaceId: 8 }, interfaces }).ReactorUI.fightInterface();
    assert.deepEqual([tactical.mode, tactical.name, tactical.nodes.length], ['tactical', 'Tactical Battle', 10]);
});

test('a Classic battle builds and runs exactly what it did: its own HUD or none, and never a Tactical window', () => {
    const interfaces = [null, null, null, null, null, null, null, null, classicRecord, tacticalRecord];
    const run = system => {
        const sandbox = loadRuntime({ system, interfaces });
        // Even with a Tactical battle left running on some map, the battle scene has nothing to do with it.
        sandbox.$gameFight = fakeFight();
        const scene = sandbox.__battleScene();
        scene.createDisplayObjects();
        for (let i = 0; i < 5; i++) scene.update();
        return { sandbox, scene, layer: sandbox.__layer };
    };
    for (const system of [{}, { reactorTacticalInterfaceId: 9 }]) {
        const { scene, layer } = run(system);
        assert.deepEqual([scene.built, scene.frames, scene._reactorBattleHud, scene._reactorFightHud, layer.children.length], [1, 5, undefined, undefined, 0]);
    }
    for (const system of [{ reactorBattleInterfaceId: 8 }, { reactorBattleInterfaceId: 8, reactorTacticalInterfaceId: 9 }]) {
        const { sandbox, scene, layer } = run(system);
        assert.equal(scene._reactorFightHud, undefined);
        assert.equal(scene._reactorBattleHud._interface.name, 'Battle');
        assert.deepEqual(Array.from(layer.children, window => window.node().name), ['Box 1'], 'the Battle record\'s own nodes, nothing else');
        assert.ok(!layer.children.some(window => window instanceof sandbox.Window_ReactorUIFight));
        assert.deepEqual(Array.from(scene._reactorBattleHud._battleNodes, entry => entry.node.battleWindow), ['actorCommand']);
    }
    // A Tactical node dropped into a Battle HUD record by hand is nothing there.
    const mixed = Object.assign({}, classicRecord, { nodes: [...classicRecord.nodes, { id: 3, type: 'fightUnit', x: 0, y: 0, width: 300, height: 140 },
        { id: 4, type: 'fightWindow', x: 0, y: 0, width: 200, height: 200 }] });
    const sandbox = loadRuntime({ system: { reactorBattleInterfaceId: 8 }, interfaces: [null, null, null, null, null, null, null, null, mixed] });
    const scene = sandbox.__battleScene();
    scene._fightCommandWindow = { move() { throw new Error('a Tactical node moved a window in a Classic battle'); } };
    scene.createDisplayObjects();
    scene.update();
    assert.deepEqual(Array.from(sandbox.__layer.children, window => window.node().name), ['Box 1']);
    assert.equal(scene._reactorBattleHud._fightNodes, undefined);
});

test('on the map: a Battle HUD record never draws, and the Tactical HUD shows in a Tactical battle only', () => {
    const overlay = { id: 3, name: 'Clock', mode: 'overlay', coordinateSpace: 'screen', nodes: [box(1)] };
    const sandbox = loadRuntime({ system: { reactorBattleInterfaceId: 8 }, interfaces: [null, null, null, overlay, null, null, null, null, classicRecord, tacticalRecord] });
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    // Map overlays are the records presented as overlays, and no others.
    scene.ensureReactorUIOverlay = sandbox.Scene_Map.prototype.ensureReactorUIOverlay;
    sandbox.Scene_Map.prototype.createReactorUIOverlays.call(scene);
    assert.deepEqual(Array.from(scene._reactorUIOverlays.keys()), [3]);
    assert.equal(sandbox.Scene_Map.prototype.ensureReactorUIOverlay.call(scene, UI.normalizeInterface(classicRecord)), null);
    assert.equal(sandbox.Scene_Map.prototype.ensureReactorUIOverlay.call(scene, UI.normalizeInterface(tacticalRecord)), null);
    const before = sandbox.__layer.children.length;
    // Action and First Person battles run on the map too; they get their own HUDs later and nothing of this one now.
    for (const mode of ['action', 'firstPerson', 'classic']) {
        sandbox.$gameFight = Object.assign(fakeFight(), { mode: () => mode });
        for (let i = 0; i < 3; i++) UI.updateFightScene(scene);
        assert.equal(scene._reactorFightHud, null, mode);
        assert.equal(sandbox.__layer.children.length, before, mode);
        assert.equal(UI.fightNow(), null, mode);
    }
    sandbox.$gameFight = fakeFight();
    UI.updateFightScene(scene);
    assert.equal(scene._reactorFightHud._interface.mode, 'tactical');
    assert.ok(sandbox.__layer.children.length > before);
    // The battle changes mode mid-way (a script): the Tactical HUD goes.
    sandbox.$gameFight.mode = () => 'action';
    UI.updateFightScene(scene);
    assert.equal(scene._reactorFightHud, null);
    assert.equal(sandbox.__layer.children.length, before);
});

test('the Tactical windows are their own: other scene properties, other classes, and styling one touches no other window', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI;
    const classic = Object.values(UI.BATTLE_WINDOWS), tactical = Object.values(Hud.WINDOWS);
    assert.deepEqual(tactical, ['_fightCommandWindow', '_fightSkillWindow', '_fightItemWindow']);
    assert.ok(!tactical.some(name => classic.includes(name)), 'no scene property is shared');
    const driver = path.join(repoRoot, 'runtime', 'reactor_fight_tactical.js');
    if (fs.existsSync(driver)) {
        const source = fs.readFileSync(driver, 'utf8');
        assert.match(source, /Window_FightCommand\.prototype = Object\.create\(Window_Command\.prototype\)/);
        assert.match(source, /Window_FightSkill\.prototype = Object\.create\(Window_SkillList\.prototype\)/);
        assert.match(source, /Window_FightItem\.prototype = Object\.create\(Window_ItemList\.prototype\)/);
        assert.doesNotMatch(source, /Object\.create\(Window_(ActorCommand|PartyCommand|BattleSkill|BattleItem)\.prototype\)/);
    }
    // Wait and End Turn are renamed on the one window the node places: its class and every other window keep their own.
    function Command() {}
    Command.prototype.commandSymbol = function(index) { return ['attack', 'wait', 'endTurn'][index]; };
    Command.prototype.commandName = function(index) { return ['Attack', 'Wait', 'End Turn'][index]; };
    Command.prototype.drawItem = function() {};
    const protoName = Command.prototype.commandName, protoDraw = Command.prototype.drawItem;
    const placed = new Command(), other = new Command();
    sandbox.TextManager.attack = '\\i[1] ATTACK'; sandbox.TextManager.skill = '\\i[2] SKILLS'; sandbox.TextManager.item = '\\i[3] ITEMS';
    UI.styleFightCommands(placed, Hud.normalizeProps({ fightWindow: 'command' }, 'fightWindow'));
    assert.deepEqual([0, 1, 2].map(index => placed.commandName(index)), ['Attack', '\\i[191] WAIT', 'END TURN']);
    assert.deepEqual([0, 1, 2].map(index => other.commandName(index)), ['Attack', 'Wait', 'End Turn']);
    assert.ok(Command.prototype.commandName === protoName && Command.prototype.drawItem === protoDraw && other.drawItem === protoDraw);
    // The Classic command styling reaches only the Classic windows it is given.
    assert.equal(Object.keys(UI.BATTLE_COMMANDS).join(), 'actorCommand,partyCommand');
});

test('the editor keeps the two roles apart: Use As and Stock Layout never offer one role\'s record for the other', () => {
    const previous = { window: global.window, escape: global.rrEscapeHtml, document: global.document, stock: global.RRStockInterfaces };
    global.window = {};
    global.rrEscapeHtml = value => String(value);
    global.document = { createElement: () => ({ className: '', innerHTML: '' }) };
    global.RRStockInterfaces = Stock;
    try {
        const fields = Object.fromEntries(Editor.REPLACEMENT_ROLES.map(([role, , field]) => [role, field]));
        assert.deepEqual([fields.battle, fields.tactical], ['reactorBattleInterfaceId', 'reactorTacticalInterfaceId']);
        assert.equal(new Set(Object.values(fields)).size, Object.keys(fields).length, 'every role has a System field of its own');
        // Use As.
        const editor = new Editor({ data: database }, null, null, null);
        editor.current = { mode: 'tactical' };
        assert.deepEqual(['battle', 'tactical', 'menu'].map(role => editor.roleFitsMode(role)), [false, true, false]);
        editor.current = { mode: 'battle' };
        assert.deepEqual(['battle', 'tactical', 'menu'].map(role => editor.roleFitsMode(role)), [true, false, false]);
        editor.current = { mode: 'scene' };
        assert.deepEqual(['battle', 'tactical', 'menu'].map(role => editor.roleFitsMode(role)), [false, false, true]);
        const system = { reactorBattleInterfaceId: 0, reactorTacticalInterfaceId: 0 };
        const bind = Object.create(Editor.prototype);
        Object.assign(bind, { databaseManager: { data: { system }, getSystem: () => system }, current: { id: 9, mode: 'tactical', roles: [] }, touch() {} });
        assert.equal(bind.setReplacementRole('battle', true), false);
        assert.equal(bind.setReplacementRole('tactical', true), true);
        assert.deepEqual(system, { reactorBattleInterfaceId: 0, reactorTacticalInterfaceId: 9 });
        bind.current = { id: 8, mode: 'battle', roles: [] };
        assert.equal(bind.setReplacementRole('tactical', true), false);
        assert.equal(bind.setReplacementRole('battle', true), true);
        assert.deepEqual(system, { reactorBattleInterfaceId: 8, reactorTacticalInterfaceId: 9 });
        // Stock Layout: laying the other kind over a bound record takes the binding it can no longer fill off.
        const lay = (record, bound, kind) => {
            const sys = Object.assign({}, database.system, bound);
            const stockEditor = Object.create(Editor.prototype);
            const manager = { data: Object.assign({}, database, { system: sys }), getSystem: () => sys };
            Object.assign(stockEditor, { databaseManager: manager, wrapper: null, _t: text => text,
                current: stockEditor.normalizeInterface.call({ databaseManager: manager, nextNodeId: Editor.prototype.nextNodeId, screenMetrics: Editor.prototype.screenMetrics }, JSON.parse(JSON.stringify(record))),
                undoStack: [], redoStack: [], selectedIds: new Set(), selectedId: 0, renderTree() {}, renderProperties() {}, refreshFirstFocus() {}, scheduleRender() {} });
            assert.equal(stockEditor.applyStockLayout(kind), true);
            return [stockEditor.current.mode, sys.reactorBattleInterfaceId || 0, sys.reactorTacticalInterfaceId || 0];
        };
        assert.deepEqual(lay(classicRecord, { reactorBattleInterfaceId: 8 }, 'tactical'), ['tactical', 0, 0], 'a Tactical HUD cannot stay bound as the Battle HUD');
        assert.deepEqual(lay(tacticalRecord, { reactorTacticalInterfaceId: 9 }, 'battle'), ['battle', 0, 0], 'a Battle HUD cannot stay bound as the Tactical HUD');
        assert.deepEqual(lay(tacticalRecord, { reactorTacticalInterfaceId: 9, reactorBattleInterfaceId: 8 }, 'tactical'), ['tactical', 8, 9], 'the other role\'s binding is left alone');
        // The Classic baseline is built as it was: no Tactical node, no Tactical setting.
        const classic = Stock.buildOne('battle', { system: database.system });
        assert.ok(!classic.nodes.some(node => Hud.isFightNode(node.type)));
        assert.doesNotMatch(JSON.stringify(classic), /fightUnit|fightLabels|allyColor|cellSize|commandIcons/);
        assert.ok(!Stock.buildOne('tactical', { system: database.system }).nodes.some(node => node.type === 'battleWindow' || node.type === 'battleCursor'));
    } finally {
        global.window = previous.window; global.rrEscapeHtml = previous.escape; global.document = previous.document;
        if (previous.stock === undefined) delete global.RRStockInterfaces; else global.RRStockInterfaces = previous.stock;
    }
});

//-----------------------------------------------------------------------------
// The editor.

test('the editor offers the Tactical Battle role, its presentation, the four nodes and the stock layout', () => {
    assert.deepEqual(Editor.REPLACEMENT_ROLES.find(role => role[0] === 'tactical'), ['tactical', 'Tactical Battle', 'reactorTacticalInterfaceId']);
    for (const type of Hud.NODE_TYPES) assert.ok(Editor.NODE_TYPES.includes(type), type);
    const panel = Editor.defaultNode('fightUnit', 5);
    assert.deepEqual([panel.id, panel.type, panel.fightUnit, panel.fill, panel.width, panel.height], [5, 'fightUnit', 'active', 'window', 320, 148]);
    assert.deepEqual(panel.fightStats, Hud.DEFAULT_STATS);
    assert.equal(Editor.defaultNode('fightTurnOrder', 1).fill, 'none');
    assert.equal(Editor.defaultNode('fightWindow', 1).fightWindow, 'command');

    assert.equal(Stock.KINDS[13], 'tactical');
    const records = Stock.build({ system: database.system });
    assert.deepEqual([records[13].id, records[13].name, records[13].mode, records[13].stock], [14, 'Tactical Battle', 'tactical', 'tactical']);
    assert.deepEqual(records[13].roles, ['tactical']);
    assert.deepEqual(records[13].nodes, Hud.stockNodes({ width: 1280, height: 720, itemHeight: 44, padding: 12 }), 'the editor builds the layout the game falls back to');
    assert.equal(records[12].stock, 'battle', 'earlier baselines keep their ids');

    const editor = new Editor({ data: database }, null, null, null);
    const record = editor.normalizeInterface(JSON.parse(JSON.stringify(Object.assign({ id: 14 }, records[13]))));
    assert.equal(record.mode, 'tactical');
    assert.equal(record.nodes.length, 10);
    assert.equal(record.nodes.find(node => node.name === 'Focused Unit').fightUnit, 'focused');
    assert.equal(editor.normalizeInterface({ id: 3, mode: 'fight', nodes: [] }).mode, 'tactical', 'the first builds\' name for the presentation');
});

test('the editor canvas draws the HUD with the game\'s own drawing: the same words in the same places', () => {
    const editor = new Editor({ data: database }, null, null, null);
    editor._t = text => text;
    const record = editor.normalizeInterface(Object.assign({ id: 14 }, Hud.stockRecord({ width: 1280, height: 720 })));
    editor.current = record;
    editor.scale = 1;
    editor.ctx = fakeContext();
    editor.skin = { image: null };
    editor.image = () => ({ image: null, failed: true });
    editor.drawSurface = () => {};
    const draw = name => {
        editor.ctx.calls.fillText.length = 0;
        const node = record.nodes.find(entry => entry.name === name);
        editor.drawFightNode(node, { x: 0, y: 0, width: node.width, height: node.height });
        return editor.ctx.calls.fillText.map(call => call.join(','));
    };
    // What the game draws for the same battle, on a bare context with the same theme inputs.
    const reader = Hud.sampleReader(database, { party: editor.previewPartyActors() });
    const game = (name, paint) => {
        const node = record.nodes.find(entry => entry.name === name);
        const ctx = fakeContext();
        paint(ctx, node, node.width - (node.fill === 'window' ? 24 : 0), node.height - (node.fill === 'window' ? 24 : 0), editor.fightTheme(node));
        return ctx.calls.fillText.map(call => call.join(','));
    };
    assert.deepEqual(draw('Active Unit'), game('Active Unit', (ctx, node, w, h, look) =>
        Hud.drawUnit(ctx, w, h, node, Hud.fillUnitView(Hud.newUnitView(), reader, reader.activeUnit(), true, null), look)));
    assert.deepEqual(draw('Focused Unit'), game('Focused Unit', (ctx, node, w, h, look) =>
        Hud.drawUnit(ctx, w, h, node, Hud.fillUnitView(Hud.newUnitView(), reader, reader.focusedUnit(), true, reader.preview(reader.focusedUnit())), look)));
    assert.ok(draw('Focused Unit').some(call => call.startsWith('Hit 85%')), 'the canvas shows the forecast');
    assert.deepEqual(draw('Turn Order').map(call => call.split(',')[0]), ['R', 'P', 'B', 'S']);
    assert.deepEqual(draw('Objective').map(call => call.split(',')[0]), ['Defeat all enemies']);
    assert.deepEqual(draw('Turn').map(call => call.split(',')[0]), ['Turn 2  ·  Player Phase']);
});

test('a HUD taken down lets go of every picture it made: turn boxes, pooled ones, and nothing that is not its own', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI;
    const freed = [];
    const picture = (name, own) => ({ _rrHud: own, destroy() { freed.push(name); } });
    const sprite = (name, own, children = []) => ({ _bitmap: picture(name, own), children });
    const window = {
        children: [sprite('box', true, [sprite('nested', true)]), sprite('skin', false), { children: [sprite('deep', true)] }],
        _turnPool: [sprite('pooled', true)], _turnMore: [sprite('more', true)], _turnSprites: new Map([[3, sprite('listed', true)]])
    };
    assert.equal(UI.releaseHudBitmaps(window), 6);
    assert.deepEqual(freed.slice().sort(), ['box', 'deep', 'listed', 'more', 'nested', 'pooled']);
    assert.equal(UI.releaseHudBitmaps(window), 0, 'each is freed once');
    assert.equal(UI.releaseHudBitmaps(null), 0);
    // Every picture the map battle HUDs make is marked as theirs, and both HUDs free them as they go.
    const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../runtime/reactor_ui.js'), 'utf8');
    const from = source.indexOf('function Window_ReactorUIFight()'), to = source.indexOf('// Battle HUD: a Battle HUD record over Scene_Battle.');
    assert.ok(from > 0 && to > from);
    const mine = source.slice(from, to);
    assert.equal((mine.match(/new Bitmap\(/g) || []).length, 1, 'only hudBitmap itself makes one directly');
    assert.ok((mine.match(/ReactorUI\.hudBitmap\(/g) || []).length >= 9);
    assert.match(mine, /destroyFightHud = function\(scene, hud\) \{[\s\S]{0,220}this\.releaseHudBitmaps\(window\);/);
    assert.match(mine, /destroyActionHud = function\(scene, hud\) \{[\s\S]{0,700}this\.releaseHudBitmaps\(hud\._actionLayer\);/);
});

//-----------------------------------------------------------------------------
// The strip's tiles (their size, their HP line, that they never stand on each
// other, that a point on one names its unit), the lines that teach, and what
// the forecast is shown against.

const lineup = (allies, enemies, active = 0) => Array.from({ length: allies + enemies },
    (_, i) => ({ unitId: i + 1, team: i < allies ? 'ally' : 'enemy', active: i === active, acted: false, defeated: false }));
const stripNode = (width, height) => Hud.stockNodes({ width, height }).find(node => node.type === 'fightTurnOrder');
const stripSize = (node, count) => Hud.turnLayout(node, node.width, node.height, lineup(Math.ceil(count / 2), Math.floor(count / 2)), {});

/** The tiles and count boxes of a layout as spans along the strip, left to right. */
function layoutSpans(layout) {
    const spans = [];
    for (let i = 0; i < layout.count; i++) spans.push({ x: layout.xs[i], width: layout.sizes[i] });
    for (let i = 0; i < layout.chipCount; i++) spans.push({ x: layout.chips[i].x, width: layout.size });
    return spans.sort((a, b) => a.x - b.x);
}

/** A 2D context that keeps every filled rectangle with the color it was filled in. */
function paintContext() {
    const rects = [];
    const gradient = { addColorStop() {} };
    return new Proxy({ rects, fillStyle: '' }, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'createLinearGradient') return () => gradient;
            if (key === 'measureText') return text => ({ width: String(text).length * 10 });
            if (key === 'fillRect') return (x, y, width, height) => { rects.push({ style: target.fillStyle, x, y, width, height }); };
            return () => {};
        },
        set(target, key, value) { target[key] = value; return true; }
    });
}

/** A battle for the game's HUD whose order and units are the test's own: `fight.order` is the turn order as it stands. */
function orderedFight(order) {
    const fight = fakeFight();
    const hp = new Map();
    fight.order = order;
    fight.turnOrder = () => fight.order;
    fight.unit = id => ({ id, team: (fight.order.find(entry => entry.unitId === id) || {}).team || 'ally' });
    fight.hpOf = id => { if (!hp.has(id)) hp.set(id, { hp: 100, mhp: 100 }); return hp.get(id); };
    fight.unitInfo = unit => ({ id: unit.id, name: 'Unit ' + unit.id, team: unit.team, battler: fight.hpOf(unit.id), move: 4 });
    fight.activeUnit = () => { const entry = fight.order.find(e => e.active); return entry ? fight.unit(entry.unitId) : null; };
    fight.focusedUnit = () => null;
    fight.pendingItem = () => null;
    return fight;
}

test('strip-portraits-smaller: a quarter smaller than they were, smaller still for a long order, the acting tile a little larger', () => {
    // The stock strip at 1280x720: a tile was as tall as the strip's room (53); it is three quarters of it now.
    const node = stripNode(1280, 720);
    const room = node.height - Math.max(4, Math.round(node.height * 0.12));
    assert.equal(room, 53);
    const four = stripSize(node, 4), twelve = stripSize(node, 12), thirty = stripSize(node, 30);
    assert.deepEqual([four.size, twelve.size], [40, 40], 'a quarter smaller than 53');
    assert.equal(thirty.size, 35, 'thirty units: smaller tiles, and everyone still has one');
    assert.deepEqual([four.count, twelve.count, thirty.count, thirty.chipCount], [4, 12, 30, 0]);
    for (const layout of [four, twelve, thirty]) {
        assert.ok(layout.big > layout.size && layout.big <= Math.ceil(layout.size * 1.2), `the acting tile is a little larger (${layout.big} against ${layout.size})`);
        assert.equal(Array.from(layout.sizes).filter(size => size === layout.big).length, 1, 'and it is the only one');
        assert.ok(layout.big <= room, 'inside the strip');
    }
    // Thirty-six still have a tile each at the smallest size that reads; fifty do not: the strip counts, at that size.
    const least = Math.round(40 * Hud.TURN_SMALL);
    assert.deepEqual([stripSize(node, 36).size, stripSize(node, 36).chipCount], [least, 0]);
    const fifty = stripSize(node, 50);
    assert.deepEqual([fifty.size, fifty.chipCount], [least, 2]);
    assert.ok(fifty.count > 27, `counting, it still shows more tiles (${fifty.count}) than the full size had room for (27)`);
    // The same rule on the Demo's screen and on the smallest one.
    const hd = stripNode(1920, 1080), small = stripNode(640, 480);
    assert.deepEqual([4, 12, 30].map(count => stripSize(hd, count).size), [59, 59, 56]);
    assert.equal(hd.height - Math.max(4, Math.round(hd.height * 0.12)), 79, 'a tile was 79 there');
    assert.deepEqual([4, 12, 30].map(count => [stripSize(small, count).size, stripSize(small, count).chipCount]), [[32, 0], [32, 0], [22, 2]]);
    assert.ok(stripSize(small, 16).chipCount === 0, 'the raid\'s sixteen all have a tile on a 640x480 screen');
    // A node that names its own Cell Size keeps it for its tiles; the acting one grows as far as the strip has room.
    const own = Hud.turnLayout(Object.assign({}, node, { cellSize: 48 }), node.width, node.height, lineup(2, 2), {});
    assert.deepEqual([own.size, own.big], [48, 53]);
    // Nobody acting (between two units): no tile is larger, and the row does not shift for it.
    const rest = Hud.turnLayout(node, node.width, node.height, lineup(2, 2, -1), {});
    assert.deepEqual(Array.from(rest.sizes), [40, 40, 40, 40]);
    assert.equal(rest.top, four.top, 'the tiles sit at the same height either way');
});

test('the strip\'s tiles never touch and never leave the strip, for any number of units on any screen', () => {
    for (const [width, height] of [[640, 480], [816, 624], [1280, 720], [1920, 1080]]) {
        const node = stripNode(width, height);
        for (let allies = 1; allies <= 40; allies += 3) {
            for (let enemies = 0; enemies <= 40; enemies += 4) {
                for (const active of [-1, 0, allies - 1, allies + enemies - 1]) {
                    const order = lineup(allies, enemies, active);
                    const layout = Hud.turnLayout(node, node.width, node.height, order, {});
                    const spans = layoutSpans(layout), where = `${width}x${height}, ${allies}+${enemies}, acting ${active}`;
                    assert.ok(spans.length > 0 && spans[0].x >= 0 && spans[spans.length - 1].x + spans[spans.length - 1].width <= node.width, `${where}: off the strip`);
                    for (let i = 1; i < spans.length; i++) {
                        // A gap between two tiles; the acting tile grows into the gaps beside it and stops a pixel short.
                        const grown = spans[i].width > layout.size || spans[i - 1].width > layout.size;
                        assert.ok(spans[i].x >= spans[i - 1].x + spans[i - 1].width + (grown ? 1 : node.cellGap), `${where}: tiles ${i - 1} and ${i} touch`);
                    }
                    // The same places whoever acts: the row never shifts when the turn passes.
                    const idle = Hud.turnLayout(node, node.width, node.height, order.map(entry => Object.assign({}, entry, { active: false })), {});
                    if (idle.chipCount === 0 && layout.chipCount === 0) {
                        assert.deepEqual(Array.from(layout.xs).map((x, i) => (layout.entries[i].active ? x + layout.top : x)), Array.from(idle.xs), `${where}: the row shifted`);
                    }
                    let counted = 0;
                    for (let i = 0; i < layout.chipCount; i++) counted += layout.chips[i].count;
                    assert.equal(layout.count + counted, allies + enemies, `${where}: everyone is shown or counted`);
                    if (active >= 0) assert.ok(layout.entries.some(entry => entry.active), `${where}: the acting unit has a tile`);
                    assert.ok(layout.big + layout.marker <= node.height && layout.top + layout.size <= layout.big, `${where}: taller than the strip`);
                }
            }
        }
    }
    // The sliding rule: tiles that keep their order slide, the fewest possible come up anew.
    const slides = (before) => Array.from(Hud.turnSliders(before, before.length, []));
    assert.deepEqual(slides([0, 50, 100, 150]), [true, true, true, true], 'nothing changed places');
    assert.deepEqual(slides([50, 100, 150, 0]), [true, true, true, false], 'the first went to the back');
    assert.deepEqual(slides([50, 0]), [true, false], 'two neighbors changed places: one slides, one comes up anew');
    assert.deepEqual(slides([NaN, 0, 50, NaN]), [false, true, true, false], 'new tiles come up at their places');
    assert.deepEqual(slides([200, 250, 300, 0, 50, 100, 150]), [false, false, false, true, true, true, true], 'the sides changed places: the larger side slides');
    assert.deepEqual(slides([NaN, NaN]), [false, false]);
});

test('whatever the order does (a unit acts, the sides change places, units join and fall), no two tiles of the game\'s strip are seen on each other', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = orderedFight(lineup(4, 5));
    UI.updateFightScene(scene);
    UI.updateFightScene(scene);
    const strip = scene._reactorFightHud._nodeWindows.find(window => window.node().type === 'fightTurnOrder');
    const change = (order, label, frames = 60) => {
        fight.order = order;
        fight.bump();
        for (let i = 0; i < frames; i++) { UI.updateFightScene(scene); assert.equal(stripOverlap(strip), '', `${label}, frame ${i}`); }
    };
    const settled = label => {
        assert.equal(strip._turnMoving, false, label + ': still moving');
        for (const [id, sprite] of strip._turnSprites) assert.deepEqual([sprite.x, sprite.alpha], [sprite._turnX, 1], `${label}: unit ${id} is not at its place, whole`);
        assert.equal(strip._turnSprites.size, strip._turnLayout.count);
    };
    change(fight.order, 'the battle begins'); settled('the battle begins');
    // Nobody is acting, then a unit is chosen, then another: its tile grows where it stands, and no tile leaves its place.
    const places = () => Array.from(strip._turnSprites, ([id, sprite]) => [id, sprite._turnX + (sprite._turnOver || 0)]).sort((a, b) => a[0] - b[0]);
    const choose = index => fight.order.map((entry, i) => Object.assign({}, entry, { active: i === index }));
    change(choose(-1), 'nobody is acting'); settled('nobody is acting');
    const still = places();
    for (const index of [0, 3, 4, -1, 8]) {
        fight.order = choose(index); fight.bump(); UI.updateFightScene(scene);
        assert.equal(stripOverlap(strip), '', 'unit ' + index + ' was chosen');
        assert.deepEqual(places(), still, 'the row moved when unit ' + index + ' was chosen');
        const sizes = Array.from(strip._turnSprites.values(), sprite => sprite._turnSize);
        assert.equal(sizes.filter(size => size === strip._turnLayout.big).length, index < 0 ? 0 : 1);
        for (const sprite of strip._turnSprites.values()) assert.deepEqual([sprite.x, sprite.alpha], [sprite._turnX, 1], 'nothing slides and nothing blinks');
    }
    change(choose(0), 'the first is acting again'); settled('the first is acting again');
    const allies = () => fight.order.filter(entry => entry.team === 'ally'), enemies = () => fight.order.filter(entry => entry.team === 'enemy');
    // The acting unit acts and goes behind its side's others; the next one is acting.
    let acted = allies()[0];
    change([...allies().slice(1).map((entry, i) => Object.assign({}, entry, { active: i === 0 })), Object.assign({}, acted, { active: false, acted: true }), ...enemies()], 'a unit acted');
    settled('a unit acted');
    // The enemy's phase: the sides change places.
    change([...enemies().map((entry, i) => Object.assign({}, entry, { active: i === 0 })), ...allies().map(entry => Object.assign({}, entry, { active: false, acted: false }))], 'the sides changed places');
    settled('the sides changed places');
    // Two neighbors change places; one falls; three join.
    const swapped = fight.order.slice(); [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
    change(swapped, 'two neighbors changed places'); settled('two neighbors changed places');
    change(fight.order.map((entry, i) => (i === 3 ? Object.assign({}, entry, { defeated: true }) : entry)), 'one fell'); settled('one fell');
    change([...fight.order, ...[21, 22, 23].map(unitId => ({ unitId, team: 'ally', active: false, acted: false, defeated: false }))], 'three joined'); settled('three joined');
    // Changes that come faster than the tiles settle (an order shuffled every third frame for two seconds).
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 40; round++) {
        const next = fight.order.map(entry => Object.assign({}, entry, { active: false, defeated: random() < 0.1 ? !entry.defeated : entry.defeated }));
        for (let i = next.length - 1; i > 0; i--) { if (random() < 0.3) { const j = Math.floor(random() * (i + 1)); [next[i], next[j]] = [next[j], next[i]]; } }
        const standing = next.filter(entry => !entry.defeated);
        if (standing.length) standing[Math.floor(random() * standing.length)].active = true;
        change(next, 'shuffle ' + round, 3);
    }
    change(fight.order, 'after the shuffles', 80); settled('after the shuffles');
    // An army joins: the strip counts, and its count boxes obey the same rule.
    change([...fight.order, ...Array.from({ length: 70 }, (_, i) => ({ unitId: 100 + i, team: i % 3 ? 'enemy' : 'ally', active: false, acted: false, defeated: false }))], 'an army joined', 80);
    assert.ok(strip._turnMore.some(more => more.visible && more.alpha === 1), 'the count box is up');
    settled('an army joined');
    // Most of them fall and the tiles grow back: at their old places they would stand on their neighbors, so that
    // layout is taken at once, whole.
    const shrunk = strip._turnLayout.size;
    fight.order = fight.order.map((entry, i) => Object.assign({}, entry, { defeated: i >= 8 }));
    fight.bump(); UI.updateFightScene(scene);
    assert.ok(strip._turnLayout.size > shrunk, `the tiles grew (${shrunk} to ${strip._turnLayout.size})`);
    assert.equal(stripOverlap(strip), '');
    assert.ok(strip._turnMore.every(more => !more.visible));
    for (const [id, sprite] of strip._turnSprites) assert.deepEqual([sprite.x, sprite.alpha, sprite.visible], [sprite._turnX, 1, true], 'unit ' + id);
});

test('a turn tile carries a thin HP line along its foot, drawn again only when the line itself changes', () => {
    const line = Hud.turnHpRect(40, 2, {});
    assert.deepEqual([line.x, line.width, line.height, line.y + line.height], [3, 34, 3, 37], 'inside the frame, three pixels of a 40 pixel tile');
    assert.deepEqual([[100, 100], [50, 100], [1, 1000], [0, 100], [5, 0]].map(([hp, mhp]) => Hud.turnHpFill(34, hp, mhp)), [34, 17, 1, 0, 0],
        'full, half, a sliver for anyone still standing, none for the fallen or a unit with no life to show');
    const node = Hud.defaultProps('fightTurnOrder'), look = theme({});
    const drawn = (hp, mhp) => {
        const ctx = paintContext();
        Hud.drawTurnCell(ctx, 40, 5, node, { team: 'enemy', active: false, acted: false }, Object.assign(Hud.newUnitView(), { name: 'Raider', team: 'enemy', hp, mhp }), look);
        return ctx.rects.filter(rect => rect.y >= line.y - 1 && rect.height <= line.height + 1 && rect.x === line.x);
    };
    const full = drawn(720, 720), half = drawn(360, 720), low = drawn(100, 720);
    assert.deepEqual(full.map(rect => rect.width), [34, 34], 'its dark bed, and the line over all of it');
    assert.equal(half[1].width, 17);
    assert.equal(full[1].style, look.gauge.hp[1]);
    assert.deepEqual([low[1].width, low[1].style], [5, look.crisisColor], 'under a quarter: the warning color');
    assert.equal(drawn(0, 0).length, 0, 'no life to show: no line');

    // In the game: a pixel's worth of change draws the tile again, less does not, and no other tile is touched.
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = orderedFight(lineup(2, 2));
    for (let i = 0; i < 40; i++) UI.updateFightScene(scene);
    const strip = scene._reactorFightHud._nodeWindows.find(window => window.node().type === 'fightTurnOrder');
    const tile = strip._turnSprites.get(3), other = strip._turnSprites.get(4);
    const clears = () => [tile.bitmap.clears, other.bitmap.clears];
    const before = clears();
    const width = Hud.turnHpRect(tile._turnSize, 2, {}).width;
    fight.hpOf(3).hp = 99; fight.bump(); UI.updateFightScene(scene);
    assert.equal(Hud.turnHpFill(width, 99, 100), width, 'one point of a hundred is less than a pixel');
    assert.deepEqual(clears(), before);
    fight.hpOf(3).hp = 50; fight.bump(); UI.updateFightScene(scene);
    assert.deepEqual(clears(), [before[0] + 1, before[1]]);
    fight.hpOf(3).hp = 24; fight.bump(); UI.updateFightScene(scene);
    assert.deepEqual(clears(), [before[0] + 2, before[1]]);
    for (let i = 0; i < 20; i++) UI.updateFightScene(scene);
    assert.deepEqual(clears(), [before[0] + 2, before[1]], 'frames with nothing new draw nothing');
    // A battle that hands out its battlers is asked for nothing more when a change redraws no tile (a cursor that moved).
    let details = 0, inStrip = false;
    const unitInfo = fight.unitInfo, layoutStrip = strip.layoutTurnOrder;
    strip.layoutTurnOrder = function() { inStrip = true; try { return layoutStrip.apply(this, arguments); } finally { inStrip = false; } };
    fight.unitInfo = unit => { if (inStrip) details++; return unitInfo(unit); };
    fight.battler = unit => fight.hpOf(unit.id);
    fight.bump(); UI.updateFightScene(scene);
    assert.deepEqual([details, clears()], [0, [before[0] + 2, before[1]]]);
    fight.hpOf(4).hp = 10; fight.bump(); UI.updateFightScene(scene);
    assert.deepEqual([details, clears()], [1, [before[0] + 2, before[1] + 1]], 'the one tile that is drawn again reads its unit once');
});

test('a point on a turn tile names its unit; a point between tiles, on a tile not yet seen, or with no HUD names none', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    sandbox.SceneManager._scene = scene;
    assert.equal(UI.fightStripUnit(100, 30), 0, 'no battle');
    const fight = sandbox.$gameFight = orderedFight(lineup(3, 3));
    UI.updateFightScene(scene);
    UI.updateFightScene(scene);
    const strip = scene._reactorFightHud._nodeWindows.find(window => window.node().type === 'fightTurnOrder');
    const middle = sprite => [strip.x + strip.padding + sprite.x + sprite._turnSize / 2, strip.y + strip.padding + sprite.y + sprite._turnSize / 2];
    const first = strip._turnSprites.get(1);
    assert.ok(first.alpha > 0 && first.alpha < 1, 'coming up');
    assert.equal(UI.fightStripUnit(...middle(first)), 1, 'a tile that can be seen can be clicked');
    const shown = first.alpha;
    first.alpha = 0;
    assert.equal(UI.fightStripUnit(...middle(first)), 0, 'one that is out of sight (waiting for its place) cannot');
    first.alpha = shown;
    for (let i = 0; i < 40; i++) UI.updateFightScene(scene);
    for (const [id, sprite] of strip._turnSprites) {
        const [x, y] = middle(sprite);
        assert.equal(UI.fightStripUnit(x, y), id);
        assert.equal(UI.fightStripUnit(strip.x + strip.padding + sprite.x, strip.y + strip.padding + sprite.y), id, 'its first pixel');
        assert.equal(UI.fightStripUnit(strip.x + strip.padding + sprite.x + sprite._turnSize, y), 0, 'the gap beside it');
        assert.equal(UI.fightStripUnit(x, strip.y + strip.padding + sprite.y + sprite._turnSize + 1), 0, 'under it');
    }
    const second = strip._turnSprites.get(2), [sx, sy] = middle(second);
    // The window layer's own offset (a screen wider than the UI area), and a record shown at another scale.
    scene._windowLayer.x = 40; scene._windowLayer.y = 10;
    assert.deepEqual([UI.fightStripUnit(sx, sy) === 2, UI.fightStripUnit(sx + 40, sy + 10)], [false, 2]);
    scene._windowLayer.x = 0; scene._windowLayer.y = 0;
    strip._uiFitScale = 0.5;
    assert.equal(UI.fightStripUnit(strip.x + (strip.padding + second.x + second._turnSize / 2) * 0.5, strip.y + (strip.padding + second.y + second._turnSize / 2) * 0.5), 2);
    strip._uiFitScale = undefined;
    // The battle ends: nothing to click.
    sandbox.$gameFight = { isActive: () => false };
    UI.updateFightScene(scene);
    assert.equal(UI.fightStripUnit(sx, sy), 0);
    assert.ok(fight);
});

test('before the first turn the turn line says nothing: "Turn 0" is never written', () => {
    const reader = Hud.sampleReader(database);
    const node = Object.assign(Hud.defaultProps('fightInfo'), { fightInfo: 'turn' });
    reader.state.turn = 0;
    assert.equal(Hud.infoText(node, reader), '');
    reader.state.turn = 1;
    assert.equal(Hud.infoText(node, reader), 'Turn 1  ·  Player Phase');
    // In the game the line is not shown at all during the opening, and appears with the first turn.
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = fakeFight();
    fight.state.turn = 0;
    for (let i = 0; i < 3; i++) UI.updateFightScene(scene);
    const turn = scene._reactorFightHud._nodeWindows.find(window => window.node().name === 'Turn');
    assert.equal(turn.visible, false);
    assert.deepEqual(turn.contents.context.calls.fillText, []);
    fight.state.turn = 1; fight.bump(); UI.updateFightScene(scene);
    assert.equal(turn.visible, true);
    assert.deepEqual(turn.contents.context.calls.fillText.map(call => call[0]), ['Turn 1  ·  Player Phase']);
});

test('the forecast is shown only against a unit the aimed action would land on: never against the attacker under its own cursor', () => {
    const reader = Hud.sampleReader(database);
    const panel = Object.assign(Hud.defaultProps('fightUnit'), { fightUnit: 'focused' });
    const me = reader.state.active, foe = reader.state.focused;
    assert.equal(Hud.previewFor(reader, foe).hit, 0.85, 'aimed at an enemy in reach: its forecast');
    assert.equal(Hud.panelUnit(panel, reader, 0), foe);
    // Attack chosen with nobody in reach: the cursor rests on the attacker's own cell. Whatever the battle would
    // answer if asked (it used to be asked: "Hit 95%  Damage 308-460" on the attacker), nothing is shown.
    reader.state.focused = me;
    reader.targetsAtCursor = () => [];
    reader.preview = () => ({ hit: 0.95, critical: 0.01, damageMin: 308, damageMax: 460, heals: false, defeats: false, cover: 0, flank: 'front', height: 0 });
    assert.equal(Hud.previewFor(reader, me), null);
    assert.equal(Hud.panelUnit(panel, reader, 0), null, 'and the acting unit gets no second panel');
    assert.equal(Hud.panelUnit(Object.assign({}, panel, { hideSameUnit: false }), reader, 0), me, 'a HUD that wants the second panel anyway has it, without a forecast');
    // A heal aimed at itself does land on it: forecast and panel.
    reader.targetsAtCursor = () => [me];
    assert.equal(Hud.previewFor(reader, me).hit, 0.95);
    assert.equal(Hud.panelUnit(panel, reader, 0), me);
    // Someone under the cursor outside the action's reach: looked at, not forecast.
    reader.state.focused = foe;
    reader.targetsAtCursor = () => [];
    assert.equal(Hud.panelUnit(panel, reader, 0), foe);
    assert.equal(Hud.previewFor(reader, foe), null);
    // Nothing aimed: no forecast for anyone.
    reader.state.state = 'move';
    reader.targetsAtCursor = () => [foe];
    assert.equal(Hud.previewFor(reader, foe), null);

    // In the game: the second panel hides for the attacker; made to stay, it shows the unit and no forecast.
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = fakeFight();
    for (let i = 0; i < 3; i++) UI.updateFightScene(scene);
    const focused = scene._reactorFightHud._nodeWindows.find(window => window.node().name === 'Focused Unit');
    const words = () => focused.contents.context.calls.fillText.map(call => call[0]);
    assert.ok(words().includes('Hit 85%'));
    fight.state.focused = fight.state.active;
    fight.targetsAtCursor = () => [];
    fight.preview = () => ({ hit: 0.95, critical: 0.01, damageMin: 308, damageMax: 460, heals: false, defeats: false, cover: 0, flank: 'front', height: 0 });
    fight.bump(); UI.updateFightScene(scene);
    assert.equal(focused.visible, false);
    focused.node().hideSameUnit = false;
    fight.bump(); UI.updateFightScene(scene);
    assert.equal(focused.visible, true);
    assert.ok(words().includes('Reid') && !words().some(word => /^Hit |^Damage /.test(word)), words().join(' | '));
});

test('while units move by themselves the hint says whose they are', () => {
    const reader = Hud.sampleReader(database);
    const node = Object.assign(Hud.defaultProps('fightInfo'), { fightInfo: 'hint' });
    const ally = reader.units.find(unit => unit.team === 'ally'), enemy = reader.units.find(unit => unit.team === 'enemy');
    reader.state.state = 'enemy';
    reader.state.active = enemy;
    assert.equal(Hud.infoText(node, reader), 'The enemy is moving');
    reader.state.active = ally;
    assert.equal(Hud.infoText(node, reader), 'Your side is moving', 'the player\'s own units under Auto, an ally that fights by itself');
    // What the battle says comes first (nobody is the acting unit while a unit still decides).
    reader.actingTeam = () => 'enemy';
    assert.equal(Hud.infoText(node, reader), 'The enemy is moving');
    reader.actingTeam = () => 'ally';
    reader.state.active = enemy;
    assert.equal(Hud.infoText(node, reader), 'Your side is moving');
    reader.actingTeam = () => '';
    assert.equal(Hud.infoText(node, reader), 'The enemy is moving', 'a battle that does not say is read from the acting unit');
    assert.equal(Hud.infoText(Object.assign({}, node, { fightLabels: { hintAlly: 'Allies act' } }), Object.assign(reader, { actingTeam: () => 'ally' })), 'Allies act');
    // The battle's tip stands in for it ("Hold Shift to hurry").
    reader.hintText = () => 'Hold Shift to hurry';
    assert.equal(Hud.infoText(node, reader), 'Hold Shift to hurry');
});

test('the phase banner: the phase\'s words first, what the battle announces after them and in full, never in their place', () => {
    const reader = Hud.sampleReader(database);
    const node = Object.assign(Hud.defaultProps('fightInfo'), { fightInfo: 'phase' });
    assert.equal(Hud.infoText(node, reader), 'Player Phase');
    reader.notice = () => 'New goal: Defeat Raider Captain';
    assert.equal(Hud.infoText(node, reader), 'New goal: Defeat Raider Captain', 'a still picture of the banner shows what is announced');
    assert.equal(Hud.phaseText(node, reader), 'Player Phase', 'the phase\'s own words are there to be played first');
    assert.equal(Hud.infoText(node, Hud.sampleReader(database, { turns: 'initiative' })), '');
    assert.equal(Hud.infoText(node, Object.assign(Hud.sampleReader(database, { turns: 'initiative' }), { notice: () => 'New goal: Hold the gate' })), 'New goal: Hold the gate', 'with no phases to announce the notice still shows');

    // The banner's order, frame by frame: what could be seen on it, each with the frames it was seen for.
    const FRAMES = 90, NOTE = 'Tank had no room and was moved', GOAL = 'New goal: Defeat Raider Captain';
    const PHASE = FRAMES - 1, LONG = Hud.NOTICE_FRAMES - 1;                          // a banner cannot be seen on the frame it starts
    assert.ok(Hud.NOTICE_FRAMES > FRAMES, 'a sentence stands longer than a phase\'s two words');
    /** Each step: frames to play, what the battle says on the first of them (`[team, phase words, notice]`, or none), and whether the banner is held. */
    const play = (state, steps) => {
        const seen = [];
        let last = null;
        for (const step of steps) {
            for (let i = 0; i < step.frames; i++) {
                const read = i === 0 && step.read ? step.read : null;
                Hud.bannerStep(state, step.span || FRAMES, !!read, read ? read[0] : state.team, read ? read[1] : '', read ? read[2] : state.notice, !!step.hold);
                if (!(state.alpha > 0)) last = null;
                else if (last && last[0] === state.text) last[1]++;
                else seen.push(last = [state.text, 1]);
            }
        }
        return seen;
    };
    // A battle that begins with something to announce: its first banner is the phase's, the notice follows.
    assert.deepEqual(play(Hud.bannerState(), [{ frames: 400, read: ['ally', 'Player Phase', NOTE] }]), [['Player Phase', PHASE], [NOTE, LONG]]);
    // Announced during the opening, before any side's turn: it plays at once; the first turn cuts it short and it plays again, in full, after the phase.
    assert.deepEqual(play(Hud.bannerState(), [{ frames: 40, read: ['', '', NOTE] }, { frames: 400, read: ['ally', 'Player Phase', NOTE] }]),
        [[NOTE, 39], ['Player Phase', PHASE], [NOTE, LONG]]);
    // Announced while the phase's words play: they finish first.
    assert.deepEqual(play(Hud.bannerState(), [{ frames: 10, read: ['enemy', 'Enemy Phase', ''] }, { frames: 400, read: ['enemy', 'Enemy Phase', GOAL] }]),
        [['Enemy Phase', PHASE], [GOAL, LONG]]);
    // The turn passes twice in a moment (the other side at "Skip to my turn"): each phase takes the banner at once, the notice waits for the last.
    assert.deepEqual(play(Hud.bannerState(), [{ frames: 30, read: ['enemy', 'Enemy Phase', GOAL] }, { frames: 400, read: ['ally', 'Player Phase', GOAL] }]),
        [['Enemy Phase', 29], ['Player Phase', PHASE], [GOAL, LONG]]);
    // With the banner at rest a notice plays at once; when it has had its time a new phase plays alone.
    let state = Hud.bannerState();
    assert.deepEqual(play(state, [{ frames: 200, read: ['ally', 'Player Phase', ''] }]), [['Player Phase', PHASE]]);
    assert.deepEqual(play(state, [{ frames: 60, read: ['ally', 'Player Phase', GOAL] }, { frames: 200, read: ['ally', 'Player Phase', ''] }]), [[GOAL, LONG]], 'the battle\'s notice ending does not cut the banner short');
    assert.deepEqual(play(state, [{ frames: 200, read: ['enemy', 'Enemy Phase', ''] }]), [['Enemy Phase', PHASE]], 'and a notice that was read is not played again');
    // The same words announced again later are news; a different notice takes the place of one that is up.
    assert.deepEqual(play(state, [{ frames: 20, read: ['enemy', 'Enemy Phase', GOAL] }, { frames: 300, read: ['enemy', 'Enemy Phase', NOTE] }]), [[GOAL, 19], [NOTE, LONG]]);
    // Where the turns are not by side there is no phase to wait for.
    assert.deepEqual(play(Hud.bannerState(), [{ frames: 300, read: ['any', '', GOAL] }]), [[GOAL, LONG]]);
    // Held (out of sight behind a menu) the banner does not move on: nothing plays for nobody.
    state = Hud.bannerState();
    play(state, [{ frames: 20, read: ['ally', 'Player Phase', GOAL] }]);
    const at = state.frame;
    play(state, [{ frames: 500, hold: true }]);
    assert.deepEqual([state.text, state.frame, state.next], ['Player Phase', at, GOAL]);
    assert.deepEqual(play(state, [{ frames: 400 }]), [['Player Phase', FRAMES - at], [GOAL, LONG]]);
    // A banner set to play longer than a notice keeps its length for both.
    assert.deepEqual(play(Hud.bannerState(), [{ frames: 900, span: 300, read: ['ally', 'Player Phase', GOAL] }]), [['Player Phase', 299], [GOAL, 299]]);

    // In the game: a battle that begins with something to announce shows "Player Phase" first, then the notice.
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = fakeFight();
    let notice = NOTE, open = false;
    fight.notice = () => notice;
    sandbox.ReactorFight = Object.assign(sandbox.ReactorFight || {}, { Windows: { isMenuOpen: () => open } });
    UI.updateFightScene(scene);
    const banner = scene._reactorFightHud._nodeWindows.find(window => window.node().name === 'Phase Banner');
    const words = () => banner.contents.context.calls.fillText.map(call => call[0]);
    const shown = [];
    const frame = () => { UI.updateFightScene(scene); if (banner.visible && shown[shown.length - 1] !== words()[0]) shown.push(words()[0]); };
    for (let i = 0; i < 60; i++) frame();
    assert.deepEqual(shown, ['Player Phase'], 'the phase\'s words are the first thing on the banner');
    // The battle's notice has had its time meanwhile: the banner still gives it its turn.
    notice = ''; fight.bump();
    for (let i = 0; i < 60; i++) frame();
    assert.deepEqual(shown, ['Player Phase', NOTE]);
    assert.equal(banner.visible, true);
    // The battle menu opens over it: the banner waits behind the menu and goes on when it shuts.
    const waited = banner._banner.frame;
    open = true;
    for (let i = 0; i < 300; i++) frame();
    assert.equal(banner.visible, false);
    assert.equal(banner._banner.frame, waited, 'nothing played behind the menu');
    open = false;
    frame();
    assert.equal(banner.visible, true);
    // Another notice while one is up plays from its start; the same words do not.
    const before = banner._banner.frame;
    fight.bump(); frame();
    assert.equal(banner._banner.frame, before + 1);
    notice = GOAL; fight.bump(); frame();
    assert.deepEqual([words(), banner._banner.frame], [[GOAL], 1]);
    for (let i = 0; i < Hud.NOTICE_FRAMES + 10; i++) frame();
    assert.equal(banner.visible, false, 'and goes away by itself');
    // The notice ends: the phase's words do not play again.
    notice = ''; fight.bump();
    for (let i = 0; i < 10; i++) frame();
    assert.equal(banner.visible, false);
    assert.deepEqual(shown, ['Player Phase', NOTE, GOAL]);
    // The next phase plays as ever.
    fight.state.team = 'enemy'; fight.bump(); frame();
    assert.deepEqual([words(), banner._banner.frame], [['Enemy Phase'], 1]);
});

test('keys and buttons are named one way for every line that mentions them, the best known key of an action first', () => {
    assert.deepEqual([13, 27, 32, 16, 9, 17, 81, 87, 33, 34, 37, 39, 88, 90, 49, 98, 112, 255].map(code => Hud.keyName(code)),
        ['Enter', 'Esc', 'Space', 'Shift', 'Tab', 'Ctrl', 'Q', 'W', 'Page Up', 'Page Down', 'Left', 'Right', 'X', 'Z', '1', 'Num 2', 'F1', '']);
    assert.equal(Hud.keyName('81'), 'Q', 'a key map\'s codes are strings');
    const best = codes => codes.slice().sort((a, b) => Hud.keyRank(a) - Hud.keyRank(b))[0];
    assert.equal(best([90, 32, 13]), 13, 'Enter before Space before Z');
    assert.equal(best([90, 32]), 32);
    assert.equal(best([88, 96, 45, 27]), 27, 'Esc before X, Insert and the number pad');
    assert.equal(best([33, 81]), 81, 'Q before Page Up: the shorter word');
    assert.equal(best([100, 37]), 37, 'the arrow before the number pad');
    assert.equal(Hud.keyRank(255), Infinity, 'a key with no name is never the one shown');
    assert.deepEqual([0, 1, 2, 3, 4, 5, 10, 11, 12, 15, 99].map(index => Hud.buttonName(index)), ['A', 'B', 'X', 'Y', 'LB', 'RB', 'L3', 'R3', 'D-pad Up', 'D-pad Right', '']);
    assert.equal(Hud.buttonName('4'), 'LB');
});

test('the stock layout fits a 640x480 game, and the hint has the widest share of its row on every screen', () => {
    const rects = stockRects(640, 480);
    for (const [name, rect] of Object.entries(rects)) {
        assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 640 && rect.y + rect.height <= 480, `${name} leaves the screen ${JSON.stringify(rect)}`);
    }
    assert.ok(!overlaps(rects.Objective, rects.Hint) && !overlaps(rects.Hint, rects.Turn) && !overlaps(rects.Command, rects['Focused Unit']) && !overlaps(rects.Command, rects['Active Unit']));
    for (const name of ['Objective', 'Hint', 'Turn', 'Phase Banner']) assert.ok(!overlaps(rects[name], rects['Turn Order']), name + ' is on the strip');
    for (const [width, height] of [[640, 480], [816, 624], [1280, 720], [1920, 1080]]) {
        const row = stockRects(width, height);
        assert.ok(row.Hint.width > row.Objective.width && row.Hint.width > row.Turn.width, `${width}x${height}`);
        assert.equal(row.Objective.width, row.Turn.width);
    }
    // Wide enough for a goal that counts and a tip with a key's name at the smallest size (about 7 pixels a letter).
    assert.ok(rects.Objective.width >= 'Survive: 3 turns left'.length * 7 && rects.Hint.width >= 'Enter on the unit\'s own tile: stay'.length * 7);
});

test('a reason the battle gave is written in the battle\'s own words, which a project replaces in one place; a node\'s own label comes first', () => {
    const reader = Hud.sampleReader(database);
    const node = Object.assign(Hud.defaultProps('fightInfo'), { fightInfo: 'hint' });
    const attack = { kind: 'command', symbol: 'attack', enabled: false }, skill = { kind: 'command', symbol: 'skill', enabled: false };
    reader.state.state = 'command';
    reader.commandReason = symbol => (symbol === 'attack' ? 'whyNoReach' : symbol === 'skill' ? 'whyBound' : '');
    // The battle's terms as the project wrote them.
    let terms = { whyNoReach: 'Nobody near enough', whyBound: 'Its hands are tied' };
    reader.term = key => terms[key] || '';
    assert.equal(Hud.infoText(node, reader, attack), 'Nobody near enough');
    assert.equal(Hud.infoText(node, reader, skill), 'Its hands are tied', 'a reason only the battle has words for is written too');
    assert.equal(Hud.reasonText(node, reader, 'whyNoReach'), 'Nobody near enough');
    assert.equal(Hud.infoText(Object.assign({}, node, { fightLabels: { whyNoReach: 'Too far' } }), reader, attack), 'Too far', 'the HUD record\'s own label first');
    // A battle with no words for it: the HUD's stock label; a reason nobody has words for leaves the HUD its own.
    terms = {};
    assert.equal(Hud.infoText(node, reader, attack), 'Nobody in reach');
    assert.equal(Hud.infoText(node, reader, skill), 'No skill to use');
    // The HUD's own reasons are translated in the same place when the project has words for them.
    reader.commandReason = () => '';
    assert.equal(Hud.infoText(node, reader, attack), 'Cannot attack');
    terms = { whyAttack: 'No weapon in hand' };
    assert.equal(Hud.infoText(node, reader, attack), 'No weapon in hand');
    assert.equal(Hud.battleTerm({}, 'whyNoReach'), '', 'a battle that has no terms');
});

test('while the battle menu is up the hint and the phase banner stand down behind it; the strip, the goal and the panels stay', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = fakeFight();
    let open = false;
    sandbox.ReactorFight = Object.assign(sandbox.ReactorFight || {}, { Windows: { isMenuOpen: () => open } });
    fight.state.state = 'unit';
    for (let i = 0; i < 3; i++) UI.updateFightScene(scene);
    const windowOf = name => scene._reactorFightHud._nodeWindows.find(window => window.node().name === name);
    const hint = windowOf('Hint'), banner = windowOf('Phase Banner'), strip = windowOf('Turn Order'), goal = windowOf('Objective'), active = windowOf('Active Unit');
    assert.deepEqual([hint.visible, banner.visible, strip.visible, goal.visible, active.visible], [true, true, true, true, true]);
    open = true;
    UI.updateFightScene(scene);
    assert.deepEqual([hint.visible, banner.visible], [false, false], 'nothing of theirs shows through the menu');
    assert.deepEqual([strip.visible, goal.visible, active.visible], [true, true, true]);
    open = false;
    UI.updateFightScene(scene);
    assert.deepEqual([hint.visible, banner.visible], [true, true], 'and they are back when it shuts');
    // A game with no battle menu (another mode's windows, none at all) is left as it is.
    sandbox.ReactorFight.Windows = {};
    UI.updateFightScene(scene);
    assert.equal(hint.visible, true);
});

test('a point on a unit panel that can be seen is the panel\'s: the map behind it is not pointed at through it', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    sandbox.SceneManager._scene = scene;
    assert.equal(UI.fightPanelAt(100, 600), false, 'no battle');
    const fight = sandbox.$gameFight = fakeFight();
    UI.updateFightScene(scene);
    UI.updateFightScene(scene);
    const windowOf = name => scene._reactorFightHud._nodeWindows.find(window => window.node().name === name);
    const active = windowOf('Active Unit'), focused = windowOf('Focused Unit'), strip = windowOf('Turn Order'), goal = windowOf('Objective');
    assert.ok(active.visible && focused.visible);
    for (const panel of [active, focused]) {
        assert.equal(UI.fightPanelAt(panel.x, panel.y), true, 'its first pixel');
        assert.equal(UI.fightPanelAt(panel.x + panel.width / 2, panel.y + panel.height / 2), true);
        assert.equal(UI.fightPanelAt(panel.x + panel.width - 1, panel.y + panel.height - 1), true);
        assert.equal(UI.fightPanelAt(panel.x + panel.width / 2, panel.y - 1), false, 'the map over it');
    }
    assert.equal(UI.fightPanelAt((active.x + active.width + focused.x) / 2, active.y + 10), false, 'between the two the map is free');
    // The text lines and the strip are not panels (the strip answers for its own tiles).
    assert.equal(UI.fightPanelAt(goal.x + 5, goal.y + 5), false);
    assert.equal(UI.fightPanelAt(strip.x + strip.width / 2, strip.y + 5), false);
    // A panel that shows nothing covers nothing.
    fight.state.focused = null; fight.bump();
    UI.updateFightScene(scene);
    assert.equal(focused.visible, false);
    assert.equal(UI.fightPanelAt(focused.x + 10, focused.y + 10), false);
    // The window layer's own offset, and a record shown at another scale.
    scene._windowLayer.x = 40; scene._windowLayer.y = 10;
    assert.deepEqual([UI.fightPanelAt(active.x + 1, active.y + 1), UI.fightPanelAt(active.x + 41, active.y + 11)], [false, true]);
    scene._windowLayer.x = 0; scene._windowLayer.y = 0;
    active._uiFitScale = 0.5;
    assert.deepEqual([UI.fightPanelAt(active.x + active.width * 0.5 - 1, active.y + 1), UI.fightPanelAt(active.x + active.width * 0.5 + 1, active.y + 1)], [true, false]);
    active._uiFitScale = undefined;
    sandbox.$gameFight = { isActive: () => false };
    UI.updateFightScene(scene);
    assert.equal(UI.fightPanelAt(active.x + 10, active.y + 10), false, 'the battle over: nothing in the way');
});

test('a unit keeping watch says so: a band with the battle\'s words on its panel, a corner mark on its turn tile, each drawn anew when the watch begins or ends', () => {
    const reader = Hud.sampleReader(database);
    const node = Object.assign(Hud.defaultProps('fightUnit'), { fightUnit: 'focused' });
    const unit = reader.units.find(entry => entry.team === 'ally');
    const info = reader.unitInfo(unit);
    const draw = (panel, view) => { const ctx = fakeContext(); Hud.drawUnit(ctx, 360, 150, panel, view, theme({ Actor1: { width: 576, height: 288 } })); return ctx.calls.fillText.map(call => call[0]); };
    let view = Hud.fillUnitView(Hud.newUnitView(), reader, unit, true, null);
    assert.equal(view.watch, false);
    assert.ok(!draw(node, view).includes('On watch'));
    const resting = Hud.viewKey(view);
    info.overwatch = true;
    view = Hud.fillUnitView(Hud.newUnitView(), reader, unit, true, null);
    assert.equal(view.watch, true);
    assert.notEqual(Hud.viewKey(view), resting, 'the panel is drawn again when the watch begins');
    assert.ok(draw(node, view).includes('On watch'));
    // The battle's own words (a project's translation), and a node's own label over them.
    reader.term = key => (key === 'unitWatch' ? 'En guardia' : '');
    view = Hud.fillUnitView(Hud.newUnitView(), reader, unit, true, null);
    assert.ok(draw(node, view).includes('En guardia'));
    assert.ok(draw(Object.assign({}, node, { fightLabels: { watch: 'Ready' } }), view).includes('Ready'));
    // A panel with no portrait says it under its header.
    assert.ok(draw(Object.assign({}, node, { fightFields: ['name', 'hp'] }), view).includes('En guardia'));
    // The turn tile: a mark in its upper right corner, inside the frame, and only for a unit on watch.
    const mark = Hud.turnWatchMark(48, 2, {});
    assert.ok(mark.x + mark.size <= 48 - 2 && mark.y >= 2 && mark.size >= 12 && mark.size <= 24, JSON.stringify(mark));
    const fills = entry => { const ctx = fakeContext(); let paths = 0; const begin = ctx.beginPath; ctx.beginPath = () => { paths++; return begin(); }; Hud.drawTurnCell(ctx, 48, 6, Object.assign(Hud.defaultProps('fightTurnOrder')), entry, view, theme({ Actor1: { width: 576, height: 288 } })); return paths; };
    const plain = fills({ unitId: unit.id, team: 'ally', active: false, acted: true, watch: false });
    assert.equal(fills({ unitId: unit.id, team: 'ally', active: false, acted: true, watch: true }), plain + 2, 'the mark and its dark edge');

    // In the game: the tile of a unit whose watch begins is drawn again, no other.
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = fakeFight();
    for (let i = 0; i < 3; i++) UI.updateFightScene(scene);
    const strip = scene._reactorFightHud._nodeWindows.find(window => window.node().type === 'fightTurnOrder');
    const order = fight.turnOrder();
    const watcher = order[1].unitId, tile = strip._turnSprites.get(watcher);
    const before = new Map(Array.from(strip._turnSprites, ([id, sprite]) => [id, sprite.bitmap.clears]));
    order[1].watch = true; fight.bump();
    UI.updateFightScene(scene);
    for (const [id, sprite] of strip._turnSprites) assert.equal(sprite.bitmap.clears, before.get(id) + (id === watcher ? 1 : 0), 'tile ' + id);
    order[1].watch = false; fight.bump();
    UI.updateFightScene(scene);
    assert.equal(tile.bitmap.clears, before.get(watcher) + 2, 'and again when the watch ends');
});
