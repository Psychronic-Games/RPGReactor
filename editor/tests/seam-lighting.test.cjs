'use strict';
// A border crossed without a break (Reactor3D.Neighbors, runtime/reactor_3d_surround.js) keeps the
// picture whole: the reflection capture goes on in the entered map's tiles, the two maps' lighting
// (time of day and sun) meets halfway on the border and is the same reckoned from either map, and
// a camera by the border keeps out of the neighbor's ground. A spriteset let go after the next map's
// has lit itself leaves that lighting alone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { followerWorld } = require('./helpers/follower-world.cjs');

const root = path.resolve(__dirname, '..', '..');

/** Map A (100 x 40, a cool night, its sun west) with map B (60 x 40, noon, its sun east) past its east border. */
function seamWorld() {
    const w = followerWorld({ flat: false, party: [1] });
    const R = w.Reactor3D, N = R.Neighbors, T = w.THREE;
    const sun = (x, y, intensity, radius) => ({ id: 'light1', type: 'sun', x, y, height: 150, radius, intensity, color: '#fff3d2', shadow: true, on: true });
    const A = { id: 1, width: 100, height: 40, note: '<3d>', reactor3d: { lighting: { ambient: 0.2, ambientColour: '#8090ff' }, lights: [sun(30, 10, 1, 150)], surround: { style: 'none', neighbors: { east: { map: 2 } } } } };
    const B = { id: 2, width: 60, height: 40, note: '<3d>', reactor3d: { lighting: { ambient: 1, ambientColour: '#ffffff' }, lights: [sun(20, 15, 0.4, 280)], surround: { style: 'none', neighbors: { west: { map: 1 } } } } };
    const sceneOf = id => ({ id, _scene: new T.Scene(), _groundFrame: { shift: new T.Vector3(), place: new T.Vector3() }, destroyed: false, destroy() { this.destroyed = true; } });
    N.records.clear();
    N.enabled = true;
    const sa = sceneOf(1), sb = sceneOf(2);
    // Each scene as it stands while its map is played: the other map's world past the shared border.
    const bodyB = N.attach(sa, 'east', sb, 2, { x: 100, z: 0 }, { mapId: 2, state: 'ready', map: B });
    const sb2 = sceneOf(2), sa2 = sceneOf(1);
    N.attach(sb2, 'west', sa2, 1, { x: -100, z: 0 }, { mapId: 1, state: 'ready', map: A });
    return { w, R, N, T, A, B, sa, sb, sb2, bodyB };
}

/** The lighting at world place `x` (A's tiles), reckoned from the map played (`map`, its scene, its offset in A's tiles). */
function lightingAt(s, map, scene, origin, x, y) {
    const { w, R } = s;
    w.$gamePlayer._realX = x - origin - 0.5; w.$gamePlayer._realY = y - 0.5;
    w.$dataMap = map;
    R._seamLight = R.Neighbors.lightBlend(scene, map, w.$gamePlayer);
    const ambient = R.seamAmbient(R.ambientFor(map), map);
    const sun = R.nativeLights(map).find(light => light.type === R.LIGHT_SUN);
    return { weight: R._seamLight ? R._seamLight.weight : 0, ambient, sun: sun && { x: sun.x + origin, y: sun.y, intensity: sun.intensity, radius: sun.radius, colour: sun.colour } };
}

test('the step over a border keeps the reflection capture, moved into the entered map\'s tiles', () => {
    const s = seamWorld(), { w, R, N, T, A, sa, sb } = s;
    const F = R.Reflections;
    F.wanted = true; F._ready = true; F._face = 3;
    F._probe = new T.Vector4(99.5, 3, 10.5, 1.5);
    F._owed = F._owedRecord = { renderer: {}, mapScene: sa, scene: sa._scene, camera: {} };
    N.live = { scene: sa };
    w.$dataMap = A;
    N.crossing = { from: 1, to: 2, side: 'east', offset: { x: 100, z: 0 } };
    N.leftMap = A;
    w.$dataMap = s.B;
    const adopted = N.adopt(2);
    assert.equal(adopted, sb, 'the world past the border is the map\'s own');
    assert.equal(F.wanted, true, 'what shone still shines');
    assert.equal(F._ready, true, 'the capture is not thrown away');
    assert.equal(F._face, 3);
    assert.deepEqual([F._probe.x, F._probe.y, F._probe.z, F._probe.w], [-0.5, 3, 10.5, 1.5], 'where it was taken, in the entered map\'s tiles');
    assert.equal(F._owed, null, 'the face owed from the map left is dropped');
    assert.equal(F._owedRecord.mapScene, null, 'and lets the map left go');
    assert.equal(adopted._neighborBodies.west.mapData, A, 'the map left is known before its file is read again');
    assert.equal(N.leftMap, null);
    N.crossing = null;
});

test('lighting meets halfway on the border and is the same reckoned from either map', () => {
    const s = seamWorld(), { R, N, A, B, sa, sb2 } = s;
    assert.equal(lightingAt(s, A, sa, 0, 40, 20).weight, 0, 'far from the border, the map\'s own');
    assert.equal(lightingAt(s, A, sa, 0, 40, 20).sun.x, 30.5 - 0.5, 'and its own sun');
    const onBorderA = lightingAt(s, A, sa, 0, 99.999, 20), onBorderB = lightingAt(s, B, sb2, 100, 100.001, 20);
    assert.equal(onBorderA.weight, 0.5);
    assert.equal(onBorderB.weight, 0.5);
    let last = null;
    for (let x = 100 - N.LIGHT_BAND - 2; x <= 100 + N.LIGHT_BAND + 2; x += 0.25) {
        const fromA = lightingAt(s, A, sa, 0, x, 20), fromB = lightingAt(s, B, sb2, 100, x, 20);
        assert.equal(fromA.weight + fromB.weight, 1, 'at ' + x + ' the two maps\' shares make a whole');
        assert.ok(Math.abs(fromA.ambient.intensity - fromB.ambient.intensity) < 1e-9, 'one time of day at ' + x);
        assert.equal(fromA.ambient.colour, fromB.ambient.colour);
        for (const key of ['x', 'y', 'intensity', 'radius']) assert.ok(Math.abs(fromA.sun[key] - fromB.sun[key]) < 1e-9, 'one sun at ' + x + ' (' + key + ')');
        assert.equal(fromA.sun.colour, fromB.sun.colour);
        // Walking east, the lighting moves only one way, in steps no larger than LIGHT_STEPS gives.
        const here = x < 100 ? fromA : fromB;
        if (last) assert.ok(here.ambient.intensity >= last.ambient.intensity - 1e-9 && here.ambient.intensity - last.ambient.intensity <= (1 - 0.2) / N.LIGHT_STEPS + 1e-9);
        last = here;
    }
    assert.ok(lightingAt(s, A, sa, 0, 99.5, 20).sun.x > 30 && lightingAt(s, A, sa, 0, 99.5, 20).sun.x < 120.5, 'on the border the sun stands between the two maps\' suns');
    R._seamLight = null;
});

test('a camera past the border keeps out of the neighbor\'s ground, and only where its world stands', () => {
    const s = seamWorld(), { w, R, N, A, B, sa } = s;
    // B rises into a bank ten tiles high past its first five columns.
    B.reactor3d.terrainWidth = B.width;
    B.reactor3d.terrain = Array.from({ length: (B.width + 1) * (B.height + 1) }, (_, i) => (i % (B.width + 1)) >= 5 ? 10 : 0);
    w.$dataMap = A;
    w.SceneManager._scene = { _spriteset: { _reactor3d: { scene: sa } } };
    assert.equal(N.solidAt(A, 108, 4, 20, 0, 0), true, 'inside the bank past the border');
    assert.equal(N.solidAt(A, 108, 14, 20, 0, 0), false, 'over it');
    assert.equal(N.solidAt(A, 102, 4, 20, 0, 0), false, 'over the low ground before it');
    assert.equal(N.solidAt(A, 108, 4, -5, 0, 0), false, 'where no world stands');
    const focus = { x: 99, y: 5, z: 20 };
    const reach = R.cameraArm(A, focus, { x: 115, y: 5, z: 20 }, 0, 0);
    assert.ok(reach > 5 && reach < 10, 'the camera\'s way stops at the bank (' + reach + ')');
    w.SceneManager._scene = null;
    assert.equal(N.solidAt(A, 108, 4, 20, 0, 0), false, 'outside a game nothing stands past the border');
});

test('a spriteset let go after the next map\'s has lit itself leaves that lighting alone', () => {
    const source = fs.readFileSync(path.join(root, 'runtime/reactor_sprites.js'), 'utf8');
    const start = source.indexOf('Spriteset_Map.prototype.releaseReactor3D = function');
    const body = source.slice(start, source.indexOf('\n};\n', start) + 3);
    const calls = [];
    const ctx = { Spriteset_Map: function() {}, Reactor3D: {
        Neighbors: null, _lightingOwner: null,
        suppressFlatLighting: on => calls.push('suppress:' + on), setLights: list => calls.push('lights:' + list.length), setAmbient: a => calls.push('ambient:' + a)
    } };
    vm.createContext(ctx);
    vm.runInContext(body, ctx);
    const spriteset = () => Object.assign(new ctx.Spriteset_Map(), { _reactor3dLit: true, destroyReactor3DSprite() {},
        _reactor3d: { scene: { _neighborKept: false, destroy() {} }, viewport: { setVisible() {} } } });
    const old = spriteset(), next = spriteset();
    ctx.Reactor3D._lightingOwner = next;
    old.releaseReactor3D(true);
    assert.deepEqual(calls, [], 'the next map\'s ambient and lights stand');
    assert.equal(old._reactor3dLit, false);
    next.releaseReactor3D(true);
    assert.deepEqual(calls, ['suppress:false', 'lights:0', 'ambient:null'], 'its own are given back');
    assert.equal(ctx.Reactor3D._lightingOwner, null);
});
