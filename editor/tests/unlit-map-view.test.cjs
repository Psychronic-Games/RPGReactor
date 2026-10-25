/**
 * A map with no lighting is drawn fully lit in the game, and the editor's
 * views draw it the same way. The editor used to fill in the 25% ambient a
 * lit map would get and light every map with it, so its 3D view of an
 * unlit map was about half as bright as the game's.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.join(repoRoot, 'editor');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const MapLights = require(path.join(editorRoot, 'src', 'utils', 'MapLights.js'));
const LightingManager = require(path.join(editorRoot, 'src', 'LightingManager.js'));

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));

/** A LightingManager on `map`, with a 3D view whose scene records its syncLights calls. */
function managerOn(map) {
    const scene = { synced: [], syncLights(focus) { this.synced.push(focus); } };
    const view = { isEnabled: () => true, mapScene: scene };
    global.window = { reactor: { mapEditor3D: view } };
    global.Reactor3D = Reactor3D;
    global.RRMapLights = MapLights;
    const manager = new LightingManager({ tilemapManager: { currentMap: map } });
    manager._update3DRing = () => {};
    return { manager, scene };
}

function cleanup() {
    delete global.window;
    delete global.Reactor3D;
    delete global.RRMapLights;
    Reactor3D.setLights([]);
    Reactor3D.setAmbient(null);
}

test('the sidecar\'s lighting choice: lights, a darkened or tinted ambient, the final flag', () => {
    assert.equal(Reactor3D.mapLightingChoice({}), null, 'nothing said');
    assert.equal(Reactor3D.mapLightingChoice({ reactor3d: { mode: '3d' } }), null);
    assert.equal(Reactor3D.mapLightingChoice({ reactor3d: { lights: [{ x: 1, y: 1 }] } }), true);
    // What the Lighting panel's ambient controls write, with no light placed yet.
    assert.equal(Reactor3D.mapLightingChoice({ reactor3d: { lighting: { ambient: 0.22, ambientColour: '#9db4ff' } } }), true,
        'an author who set the map to night wants night');
    assert.equal(Reactor3D.mapLightingChoice({ reactor3d: { lighting: { ambient: 1, ambientColour: '#ffc9a0' } } }), true,
        'a tint is an ask too');
    assert.equal(Reactor3D.mapLightingChoice({ reactor3d: { lighting: { ambientColour: '#ffffff' } } }), true,
        'a colour alone reads at the default 25%, as ambientFor reads it');
    // What every new map is created with: full white daylight, the unlit look.
    assert.equal(Reactor3D.mapLightingChoice({ reactor3d: { lighting: { ambient: 1, ambientColour: '#ffffff' } } }), null);
    assert.equal(Reactor3D.mapLightingChoice({ reactor3d: { lighting: { shadows: false } } }), null);
    assert.equal(Reactor3D.mapLightingChoice({ reactor3d: { lights: [{ x: 1, y: 1 }], lighting: { enabled: false, ambient: 0.2 } } }), false,
        'the enabled flag is final');
});

test('the game lights a night map with no lights placed, in 2D and in 3D', () => {
    const night = { meta: { '3d': true }, reactor3d: { lighting: { ambient: 0.22, ambientColour: '#9db4ff' } } };
    assert.equal(Reactor3D.lightingEnabled(night), true);
    assert.equal(Reactor3D.wantsLights3D(night), true);
    const day = { meta: { '3d': true }, reactor3d: { lighting: { ambient: 1, ambientColour: '#ffffff' } } };
    assert.equal(Reactor3D.lightingEnabled(day), false);
    assert.equal(Reactor3D.wantsLights3D(day), false);
});

test('note tags read from the note when a map comes without meta, as the editor\'s maps do', () => {
    assert.deepEqual(Reactor3D.mapMeta({ note: '<3d>\n<3d lights>\n<fog: 3>' }), { '3d': true, '3d lights': true, fog: ' 3' });
    assert.equal(Reactor3D.mapMeta({ note: 'plain' }), null);
    const meta = { lighting: true };
    assert.equal(Reactor3D.mapMeta({ meta, note: '<other>' }), meta, 'the game\'s own meta wins');
    assert.equal(Reactor3D.lightingEnabled({ note: '<lighting>' }), true);
    assert.equal(Reactor3D.wantsLights3D({ meta: { '3d': true }, note: '' }), false);
});

test('the editor\'s 3D view draws an unlit map fully lit, and repaints the scene once', () => {
    try {
        const map = { width: 17, height: 13, reactor3d: { mode: '3d' } };
        const { manager, scene } = managerOn(map);
        Reactor3D.setAmbient({ intensity: 0.25, colour: 0xffffff });
        manager.feed3D(0);
        assert.equal(Reactor3D.ambient(), null, 'no ambient: the game\'s unlit look');
        assert.equal(Reactor3D.lights().length, 0);
        assert.deepEqual(scene.synced, [null], 'the materials are told once');
        manager.feed3D(16);
        manager.feed3D(32);
        assert.equal(scene.synced.length, 1, 'a still unlit map costs nothing per frame');

        // The Lighting tool open: the darkness its panel shows, in both views.
        manager.active = true;
        manager.feed3D(48);
        assert.equal(Reactor3D.ambient().intensity, 0.25);
        manager.active = false;
        manager.feed3D(64);
        assert.equal(Reactor3D.ambient(), null);
        assert.equal(scene.synced.length, 3, 'leaving the lit look repaints again');
    } finally {
        cleanup();
    }
});

test('a lit map stays lit in the editor at its authored ambient', () => {
    try {
        const map = { width: 10, height: 10, reactor3d: { mode: '3d' } };
        MapLights.add(map, { x: 2, y: 2, radius: 4 });
        const { manager } = managerOn(map);
        manager.feed3D(0);
        assert.equal(Reactor3D.ambient().intensity, 0.25, 'placed lights read against the default floor');
        assert.equal(Reactor3D.lights().length, 1);

        const night = { width: 10, height: 10, reactor3d: { mode: '3d' } };
        MapLights.setAmbient(night, { ambient: 0.22, ambientColour: '#9db4ff' });
        const second = managerOn(night).manager;
        second.feed3D(0);
        assert.equal(Reactor3D.ambient().intensity, 0.22);
        assert.equal(Reactor3D.ambient().colour, 0x9db4ff);
        assert.equal(Reactor3D.lightingEnabled(night), true, 'and the game agrees');
    } finally {
        cleanup();
    }
});

test('real maps: the editor\'s lit choice is the game\'s', () => {
    const cases = [
        ['Map002', false], // a 3D map with no lighting at all
        ['Map004', true], // night ambient, no lights: lit as its battle room already lights it
        ['Map001', true], // Reactor Room
        ['Map005', true], // North Haven
        ['Map008', true] // full daylight with one light placed
    ];
    try {
        for (const [name, expected] of cases) {
            const project = 'Demo';
            const dir = path.join(repoRoot, 'template', 'Demo', 'data');
            const file = path.join(dir, name + '.json');
            if (!fs.existsSync(file)) continue;
            const map = readJson(file);
            const sidecar = path.join(dir, name + '.r3d.json');
            if (fs.existsSync(sidecar)) map.reactor3d = readJson(sidecar);
            const { manager } = managerOn(map);
            const game = Reactor3D.lightingEnabled(Object.assign({ meta: {} }, map));
            assert.equal(game, expected, `${project} ${name} in the game`);
            assert.equal(manager.lit(map), game, `${project} ${name} in the editor`);
        }
    } finally {
        cleanup();
    }
});

test('the editor\'s 3D view draws no fog, as the game draws none', () => {
    // A fog measured from the eye, starting at 0.9x the map's longest side,
    // greyed out the far half of a 17x13 map seen from the game's camera.
    const MapEditor3D = require(path.join(editorRoot, 'src', 'MapEditor3D.js'));
    const scene = { fog: { near: 15.3, far: 37.4 }, background: null };
    const savedThree = global.THREE;
    global.THREE = { Color: function Color(value) { this.value = value; } };
    try {
        MapEditor3D.prototype.applyAtmosphere.call({ mapScene: { scene: () => scene }, skyColour: () => 0x1a1a1a }, { width: 17, height: 13 });
    } finally {
        if (savedThree === undefined) delete global.THREE; else global.THREE = savedThree;
    }
    assert.equal(scene.fog, null);
    assert.equal(scene.background.value, 0x1a1a1a, 'the theme backdrop stays');
    const runtime = ['reactor_3d.js', 'reactor_3d_world.js', 'reactor_3d_lighting.js']
        .map(file => fs.readFileSync(path.join(repoRoot, 'runtime', file), 'utf8')).join('\n');
    assert.doesNotMatch(runtime, /scene\.fog = new THREE\.Fog/, 'if the game ever fogs, the editor follows it rather than its own');
});

test('the 2D views use the same choice', () => {
    const manager = fs.readFileSync(path.join(editorRoot, 'src', 'LightingManager.js'), 'utf8');
    assert.match(manager, /const enabled = this\.lit\(map, lights\.length\);/);
    assert.doesNotMatch(manager, /ambient\.ambient === undefined/, 'ambient() always fills the default, so it can never tell lit from unlit');
    const preview = fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'ModelPropsPreview2D.js'), 'utf8');
    assert.match(preview, /lighting\.lit\(lighting\.map\(\), lights\.length\)/);
});

test('an AmbientLight command lights an unlit map, easing from its daylight; a map lit off stays off', () => {
    const map = { meta: { '3d': true }, reactor3d: {} };
    global.$gameMap = { mapId: () => 7 };
    global.Graphics = { frameCount: 100 };
    try {
        assert.equal(Reactor3D.wantsLights3D(map), false, 'unlit before the command');
        assert.equal(Reactor3D.ambientFor(map).intensity, 1, 'its daylight, not the lit default of a quarter');
        Reactor3D.setMapAmbient({ intensity: 0.2, colour: '#9db4ff' }, 60);
        assert.equal(Reactor3D.wantsLights3D(map), true, 'the command lights it');
        assert.equal(Reactor3D.ambientFor(map).intensity, 1, 'from daylight at the start of the ease');
        global.Graphics.frameCount = 160;
        assert.ok(Math.abs(Reactor3D.ambientFor(map).intensity - 0.2) < 1e-9, 'night at its end');
        const flat = { meta: {}, reactor3d: {} };
        assert.equal(Reactor3D.lightingEnabled(flat), true, 'a 2D map too');
        const off = { meta: { '3d': true }, reactor3d: { lighting: { enabled: false } } };
        assert.equal(Reactor3D.wantsLights3D(off), false, 'lighting turned off stays off');
        Reactor3D.setMapAmbient(null);
        assert.equal(Reactor3D.wantsLights3D(map), false, 'reset: unlit again');
        const lit = { meta: { '3d': true }, reactor3d: { lights: [{ x: 1, y: 1 }] } };
        assert.equal(Reactor3D.ambientFor(lit).intensity, 0.25, 'a lit map with no ambient written keeps the quarter');
    } finally {
        delete global.$gameMap;
        delete global.Graphics;
    }
});
