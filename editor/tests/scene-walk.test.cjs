'use strict';
// A pass's draw walks the visible scene once: everything that reads the tree
// before three draws it (the split of the quarter-size light, the shader
// warm-up, the bone palettes, the distance levels, the depth-first draw)
// reads that one list, both halves of a split pass included, and each half
// hides what has no part in it as whole subtrees. The shadow rows, drawn from
// inside the first half, see the whole pass.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const root = path.join(__dirname, '..', '..');
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const Reactor3D = require(path.join(root, 'runtime', 'reactor_3d.js'));
require(path.join(root, 'runtime', 'reactor_3d_lighting.js'));
// The split as an integrated GPU draws it (a discrete one lights per pixel: HalfLight.WEAK_ONLY).
Reactor3D.HalfLight.WEAK_ONLY = false;
const W = Reactor3D.SceneWalk, HL = Reactor3D.HalfLight;

const lit = options => Reactor3D.litMaterial(new THREE.MeshBasicMaterial(options));
const plain = () => new THREE.MeshBasicMaterial();
const mesh = material => new THREE.Mesh(new THREE.PlaneGeometry(), material);
const withVolume = fn => {
    const saved = Reactor3D.LightVolume.supported;
    Reactor3D.LightVolume.supported = () => true;
    try { return fn(); } finally { Reactor3D.LightVolume.supported = saved; }
};
const visited = (fn) => { const seen = []; fn(object => { seen.push(object); }); return seen; };

function tree() {
    const scene = new THREE.Scene();
    const a = new THREE.Group(), b = new THREE.Group(), hidden = new THREE.Group();
    a.add(mesh(plain()), mesh(plain()));
    b.add(mesh(plain()));
    b.children[0].add(mesh(plain()));
    hidden.visible = false; hidden.add(mesh(plain()));
    scene.add(a, hidden, b);
    return { scene, a, b, hidden };
}

test('the held walk reads as three\'s traverseVisible, asking visibility as it goes', () => {
    const { scene, a, b } = tree();
    const expected = visited(fn => scene.traverseVisible(fn));
    assert.deepEqual(visited(fn => W.each(scene, fn)), expected, 'not held: walked as before');
    const held = W.hold(scene);
    try {
        assert.equal(held, true);
        assert.equal(W.list(scene).count, expected.length, 'the visible tree, gathered once');
        assert.deepEqual(visited(fn => W.each(scene, fn)), expected, 'held: the same objects in the same order');
        // Hidden since the gather: passed over with everything under it.
        b.visible = false;
        assert.deepEqual(visited(fn => W.each(scene, fn)), visited(fn => scene.traverseVisible(fn)));
        b.visible = true;
        // A reader returning true passes over that subtree; hiding without it still visits the children, as traverseVisible does.
        const skipping = []; W.each(scene, object => { skipping.push(object); return object === a; });
        assert.ok(skipping.includes(a) && !skipping.includes(a.children[0]));
        // Nested holds of the scene share the list; another scene is walked on its own.
        const serial = W.heldSerial(scene);
        const again = W.hold(scene);
        assert.equal(W.heldSerial(scene), serial, 'the same gather');
        W.release(again);
        assert.equal(W.heldSerial(scene), serial, 'still held by the outer');
        const other = new THREE.Scene(); other.add(mesh(plain()));
        assert.equal(W.hold(other), false);
        assert.equal(W.list(other), null);
        assert.equal(visited(fn => W.each(other, fn)).length, 2);
    } finally { W.release(held); }
    assert.equal(W.list(scene), null, 'released');
    assert.equal(W._list.nodes.filter(Boolean).length, 0, 'and it holds no object of the scene after');
    W.enabled = false;
    try { assert.equal(W.hold(scene), false, 'the kill switch walks as before'); } finally { W.enabled = true; }
});

test('every reader of a draw shares one gather: a scene drawn once, and both halves of a split pass', () => withVolume(() => {
    const scene = new THREE.Scene();
    scene.add(mesh(lit({})), mesh(plain()));
    const gather = W.gather, counted = { n: 0 };
    W.gather = function() { counted.n++; return gather.apply(this, arguments); };
    const renderer = { render() {}, getRenderTarget: () => null, domElement: { height: 1080 }, autoClear: true, extensions: { has: () => false } };
    const camera = new THREE.PerspectiveCamera();
    try {
        Reactor3D.renderScene(renderer, scene, camera);
        assert.equal(counted.n, 1, 'one gather for the warm-up, the palettes, the levels and the depth-first draw');
        // A pass split in two: the split, the first half's readers and the second half's, one gather between them.
        counted.n = 0;
        const target = { depthTexture: new THREE.DepthTexture(4, 4), width: 4, height: 4, samples: 0 };
        const held = W.hold(scene);
        try {
            const split = HL.begin(renderer, scene, target);
            assert.ok(split);
            Reactor3D.renderScene(renderer, scene, camera);
            HL.unswap(split);
            Reactor3D.renderScene(renderer, scene, camera);
            HL.restore(split);
        } finally { W.release(held); }
        assert.equal(counted.n, 1);
    } finally { W.gather = gather; }
}));

test('each half hides what has no part in it as the largest whole subtrees, and shows them again', () => withVolume(() => {
    const scene = new THREE.Scene();
    // A model drawn lit at full size, a field of lit plants, and a group with some of each.
    const model = new THREE.Group(), inner = new THREE.Group();
    inner.add(mesh(plain()), mesh(plain())); model.add(inner, new THREE.Bone());
    const field = new THREE.Group(); field.add(mesh(lit({})), mesh(lit({})));
    const mixed = new THREE.Group(), mixedLit = mesh(lit({})), mixedPlain = mesh(plain()); mixed.add(mixedLit, mixedPlain);
    // A light and a group holding one are read by three's own walk: never hidden whole.
    const lamp = new THREE.Group(); lamp.add(new THREE.PointLight(), mesh(plain()));
    // Hidden since the walk (the haze, taken for its own pass): no half's, and left hidden.
    const haze = mesh(plain());
    scene.add(model, field, mixed, lamp, haze);
    const target = { depthTexture: new THREE.DepthTexture(4, 4), width: 4, height: 4, samples: 0 };
    const held = W.hold(scene);
    haze.visible = false;
    try {
        const split = HL.begin({}, scene, target);
        const same = (a, b, text) => assert.ok(a.length === b.length && a.every((x, i) => x === b[i]), text);
        same(split.albedoHide, [model, mixedPlain, lamp.children[1]], 'the first half: the model as one, the unlit one of the mixed group alone');
        same(split.forwardHide, [field, mixedLit], 'the second half: the field as one');
        assert.equal(model.visible, false);
        assert.equal(inner.visible, true, 'nothing under a hidden subtree is touched');
        assert.equal(lamp.visible, true, 'a group holding a light stays');
        assert.equal(lamp.children[1].visible, false, 'what stands beside the light waits on its own');
        assert.equal(field.children[0].material, HL.twin(field.children[0].material.__rrTwinOf), 'the field drawn unlit');
        // The shadow rows are drawn from inside the first half: they see the whole pass.
        const seen = [];
        HL.whole(() => seen.push(model.visible, lamp.children[1].visible));
        assert.deepEqual(seen, [true, true]);
        assert.equal(model.visible, false, 'and the half after');
        // Between the halves (the light's own draws are not run here): the second half's hides.
        HL.unswap(split);
        for (const m of split.forward) m.visible = true;
        for (const object of split.albedoHide) object.visible = true;
        for (const m of split.deferred) m.visible = false;
        for (const object of split.forwardHide) object.visible = false;
        split.phase = 'forward';
        assert.equal(field.visible, false);
        assert.equal(model.visible, true);
        HL.whole(() => seen.push(field.visible));
        assert.equal(seen[2], true);
        HL.restore(split);
        for (const object of [model, field, mixed, mixedLit, mixedPlain, lamp]) assert.equal(object.visible, true);
        assert.equal(haze.visible, false, 'what was hidden before the split stays hidden');
        assert.equal(HL._split, null);
        let called = false;
        HL.whole(() => { called = true; });
        assert.ok(called, 'no split: the rows are drawn as they are');
    } finally { W.release(held); }
}));

test('the shadow rows are drawn through the split\'s whole pass', () => {
    const S = Reactor3D.Shadows, saved = { original: S._flushOriginal, whole: HL.whole };
    const order = [];
    S._flushOriginal = function() { order.push('rows'); };
    HL.whole = function(fn) { order.push('whole'); return fn(); };
    try { S._flush(); } finally { S._flushOriginal = saved.original; HL.whole = saved.whole; }
    assert.deepEqual(order, ['whole', 'rows']);
});

test('a kind of shadow row walks only the subtrees holding its casters, and draws what it drew', () => {
    const S = Reactor3D.Shadows;
    const scene = new THREE.Scene();
    const pieces = new THREE.Group(), wall = mesh(plain()), roof = mesh(plain());
    pieces.add(wall, roof);
    S.markCaster(wall, false); S.markCaster(roof, false);
    const plants = new THREE.Group(); plants.add(mesh(plain()), mesh(plain()));
    const models = new THREE.Group(), hero = new THREE.Group(), body = mesh(plain());
    hero.add(new THREE.Bone(), body); models.add(hero);
    S.markCaster(hero, true);
    const away = new THREE.Group(); away.visible = false; away.add(mesh(plain()));
    scene.add(pieces, plants, models, away);
    // What three's walk of one face draws: every object visible down its path that passes the camera's layers.
    const drawn = layer => { const mask = 1 << layer, out = []; scene.traverseVisible(o => { if (o.isMesh && (o.layers.mask & mask)) out.push(o); }); return out; };
    const same = (a, b, text) => assert.ok(a.length === b.length && a.every((x, i) => x === b[i]), text);
    for (const [layer, expected] of [[Reactor3D.SHADOW_LAYER_STATIC, [plants, models]], [Reactor3D.SHADOW_LAYER_DYNAMIC, [pieces, plants, hero.children[0]]]]) {
        const before = drawn(layer);
        const hidden = S._hideNonCasters(scene, layer);
        same(hidden, expected, 'the largest subtrees with none of the row\'s casters (a skeleton\'s bones among them)');
        same(drawn(layer), before, 'the faces draw what they drew');
        S._showAgain(hidden);
        for (const object of expected) assert.equal(object.visible, true);
        assert.equal(away.visible, false, 'what was hidden stays hidden');
        assert.equal(W._list === null || W._list.count === 0, true);
    }
    assert.equal(S._casterList.nodes.filter(Boolean).length, 0, 'a walk of its own keeps no object after');
    // Inside a pass's draw the rows read the pass's walk.
    const gather = W.gather; let gathered = 0;
    const held = W.hold(scene);
    W.gather = function() { gathered++; return gather.apply(this, arguments); };
    try { S._showAgain(S._hideNonCasters(scene, Reactor3D.SHADOW_LAYER_DYNAMIC)); } finally { W.gather = gather; W.release(held); }
    assert.equal(gathered, 0);
    S.casterOnly = false;
    try { assert.equal(S._hideNonCasters(scene, Reactor3D.SHADOW_LAYER_STATIC), null, 'the kill switch'); } finally { S.casterOnly = true; }
    S._static.delete(wall); S._static.delete(roof); S._dynamic.delete(hero);
});
