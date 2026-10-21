// Passage in the 3D map view, the words: what a character can do at each edge of the tile under the pointer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const Labels = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapEdgeLabels.js'));

let nextId = 1;
const piece = (kind, x, y, z, more) => Object.assign({ id: nextId++, kind, x, y, z, rot: 0, material: '' }, more || {});
const column = (x, y, levels) => Array.from({ length: levels }, (unused, z) => piece('block', x, y, z));
const mapOf = pieces => ({ width: 14, height: 14, note: '<3d>', reactor3d: { version: 1, mode: '3d', pieces } });
/** The game's physics in its own realm, with no game running: as the editor has it. */
function physicsOf() {
    const context = { console, Math, JSON, Number, Object, Array, WeakMap, Map, Reactor3D: R };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('runtime/reactor_physics.js'), context);
    return context.ReactorPhysics;
}
/** The four sides of the place of a cell at a height, as the pointer's labels ask them: the field's own reading. */
function sidesOf(map, x, y, height, P) {
    const field = new Labels.Field(map, P, { world: R, rules: Labels.rules(map) });
    const place = field.cell(x, y).find(entry => Math.abs(entry.top - height) < 1e-4);
    return place ? place.sides : [];
}

test('each edge of a tile says what a character can do there, and why not', () => {
    const P = physicsOf();
    // East a three-high crate, south a storey of wall, west a one-high block, north open ground.
    const map = mapOf([...column(5, 4, 3), ...column(4, 5, 5), ...column(3, 4, 1)]);
    const edges = sidesOf(map, 4, 4, 0, P);
    assert.deepEqual(edges.map(e => e.d), [8, 6, 2, 4], 'north, east, south, west');
    const said = edges.map(e => Labels.text(e.option));
    assert.deepEqual(said, ['Walk', 'Mantle +3.0', 'Blocked: Too high', 'Hop +1.0']);
    // From the crate's top the way back is a drop, with how far.
    const down = sidesOf(map, 5, 4, 3, P).find(e => e.d === 4);
    assert.equal(Labels.text(down.option), 'Drop -3.0');
    // Every reason a side or a place is given has plain words: none reads as a bare Blocked.
    assert.deepEqual(Labels.WHY.slice(1), ['offmap', 'edge', 'steep', 'thin', 'headroom', 'overhead', 'high', 'tile', 'body', 'water', 'bush', 'stair', 'unreached']);
    for (const reason of Labels.WHY.slice(1)) {
        assert.ok(Labels.REASONS[reason], reason);
        assert.equal(Labels.text({ kind: 'blocked', reason }), 'Blocked: ' + Labels.REASONS[reason]);
        assert.equal(Labels.noStandText(reason), 'Nobody can stand here: ' + Labels.REASONS[reason]);
    }
    assert.equal(Labels.text({ kind: 'blocked', reason: 'edge' }), 'Blocked: Something in the way');
    assert.equal(Labels.noStandText('bush'), 'Nobody can stand here: Plants in the way');
    assert.equal(Labels.noStandText('unreached'), 'Nobody can stand here: No way to get here');
    assert.equal(Labels.text({ kind: 'blocked', reason: 'overhead' }), 'Blocked: Something overhead');
    assert.equal(Labels.text(P.edge(map, 0, 0, 4, 0)), 'Blocked: Map edge');
    assert.equal(Labels.text({ kind: 'ladder', rise: 5 }), 'Climb ladder +5.0');
    assert.equal(Labels.text({ kind: 'walk', rise: 0.4 }), 'Walk', 'a walk says no height');
    assert.equal(Labels.text({ kind: 'hop', rise: 1 }, word => '[' + word + ']'), '[Hop] +1.0', 'the words go through the translator');
    assert.equal(new Labels.Field(map, null, { world: R }).physics, null, 'without the physics only the tiles speak');
    assert.equal(Labels.edgesOf, undefined, 'the labels ask the field, as the marks do: no second reading');
    // A cell with two ways on says both: under a deck on foot, onto it by the hands.
    const deck = mapOf([piece('floor', 6, 8, 3), piece('floor', 6, 9, 3)]);
    const under = sidesOf(deck, 5, 8, 0, P).find(e => e.d === 6);
    assert.equal(Labels.label(under), 'Walk · Mantle +3.1');
    assert.equal(Labels.label(edges[1]), 'Mantle +3.0', 'one way on, one word');
});

test('the limits are the project\'s and the map\'s own, as the game reads them', () => {
    const P = physicsOf();
    const system = { reactorPhysics: { jumpHeight: 1.25, mantleReach: 1 }, reactorControls: {} };
    globalThis.reactor = { databaseManager: { getSystem: () => system } };
    try {
        const map = mapOf([...column(5, 4, 3)]);
        assert.equal(Labels.text(sidesOf(map, 4, 4, 0, P).find(e => e.d === 6).option), 'Blocked: Too high', 'a reach of one tile over the jump: three is too high');
        map.reactor3d.physics = { mantleReach: 3 };
        assert.equal(Labels.text(sidesOf(map, 4, 4, 0, P).find(e => e.d === 6).option), 'Mantle +3.0', 'the map\'s own reach wins');
        system.reactorPhysics.mantle = false;
        assert.equal(sidesOf(map, 4, 4, 0, P).find(e => e.d === 6).option.kind, 'blocked', 'mantling off in the project');
        system.reactorPhysics = {}; system.reactorControls = { jump: false };
        assert.deepEqual(Labels.rules(mapOf([])), { jump: false, mantle: true });
        const jumping = mapOf([]); jumping.reactor3d.physics = { jump: true };
        assert.equal(Labels.rules(jumping).jump, true, 'a map set to jump jumps');
    } finally { delete globalThis.reactor; }
});

test('the words belong to Passage: no tick of their own, one test of a flag on a pointer move, every word in every language', () => {
    const html = read('editor/index.html');
    assert.doesNotMatch(html, /map-edges-view/, 'the Edges tick is folded into Passage');
    assert.match(html, /id="map-passage" type="checkbox"/);
    assert.match(html, /<script src="src\/utils\/MapEdges\.js"><\/script>\s*<script src="src\/utils\/MapEdgeLabels\.js"><\/script>/);
    const view = read('editor/src/MapEditor3D.js');
    assert.match(view, /if \(globalThis\.RRMapEdgeLabels\?\.on\) globalThis\.RRMapEdgeLabels\.hover\(this, event\.clientX, event\.clientY, tile\);/, 'one test of a flag while off');
    const source = read('editor/src/utils/MapEdgeLabels.js');
    assert.match(source, /if \(key !== state\.hoverKey\) \{/, 'written again only when the place or what it says changes');
    assert.doesNotMatch(source, /rr\.edgesView|map-edges-view/, 'nothing of the old tick is left in use');
    assert.equal(Labels.on, false);
    assert.equal(Labels.hover({}, 0, 0, { x: 1, y: 1 }), undefined);
    // Every word it writes is in all 17 locales.
    const context = { console, window: {}, document: { addEventListener() {}, querySelectorAll: () => [], documentElement: { setAttribute() {} } }, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'en' } };
    context.window = context; context.globalThis = context; vm.createContext(context);
    for (const file of ['I18nManager.js', 'I18nDeepTranslations.js']) vm.runInContext(read('editor/src/' + file) + '\n;globalThis.__T = typeof RR_TEXT_TRANSLATIONS !== "undefined" ? RR_TEXT_TRANSLATIONS : globalThis.__T; globalThis.__S = typeof RR_I18N_STRINGS !== "undefined" ? RR_I18N_STRINGS : null;', context);
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    const words = [...new Set([...Object.values(Labels.WORDS), ...Object.values(Labels.REASONS), Labels.NO_STAND])];
    for (const locale of locales) {
        for (const word of words) assert.ok((context.RR_DEEP_TEXT_TRANSLATIONS[locale] || {})[word] || ((context.__T || {})[locale] || {})[word], `${locale}: ${word}`);
        assert.ok(context.__S[locale]['toolbar.title.showPassage'], `${locale}: the Passage tick's tooltip`);
    }
});
