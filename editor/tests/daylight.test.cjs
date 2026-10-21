'use strict';
// A sun, the sky dome and the studio reflection follow the map's time of day: its ambient.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const L = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapLights.js'));

// The Lighting panel's presets.
const DAY = { intensity: 1, colour: 0xffffff }, DUSK = { intensity: 0.55, colour: 0xffc9a0 };
const NIGHT = { intensity: 0.22, colour: 0x9db4ff }, INDOOR = { intensity: 0.45, colour: 0xffe9c4 };
const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

test('the time of day the ambient presets stand for', () => {
    const day = Reactor3D.daylightOf(DAY);
    assert.ok(near(day.sun, 1) && near(day.day, 1) && day.sky.every(v => near(v, 1)), 'day: the sun as authored, the sky as painted');
    const dusk = Reactor3D.daylightOf(DUSK);
    assert.ok(dusk.sun > 0.5 && dusk.sun < 0.7, 'dusk: a lower sun (' + dusk.sun + ')');
    assert.ok(dusk.amberMix > 0.5 && dusk.sky[0] > dusk.sky[2], 'dusk: amber, the sky warm');
    const night = Reactor3D.daylightOf(NIGHT);
    assert.ok(night.sun > 0.06 && night.sun < 0.16, 'night: moonlight (' + night.sun + ')');
    assert.ok(night.moonMix > 0.85 && night.sky[2] > night.sky[0] && night.sky[2] < 0.45 && night.skyLinear[2] < 0.15, 'night: pale blue, a dark blue sky');
    const unlit = Reactor3D.daylightOf(null);
    assert.ok(near(unlit.sun, 1) && unlit.sky.every(v => near(v, 1)), 'an unlit map is day');
    const indoor = Reactor3D.daylightOf(INDOOR);
    assert.ok(indoor.sun > night.sun && indoor.sun < 1, 'the Indoor preset reads as a dim, warm twilight');
    // No pops: brightness only rises with the level, white to cool alike.
    let last = 0;
    for (let level = 0; level <= 1.0001; level += 0.05) {
        const d = Reactor3D.daylightOf({ intensity: level, colour: 0xc0c8ff });
        assert.ok(d.sun >= last - 1e-9, 'smooth from night to day at ' + level.toFixed(2));
        assert.ok(near(d.day + d.twilight + d.night, 1, 1e-9));
        last = d.sun;
    }
});

test('a sun follows unless fixed; nothing else does', () => {
    const night = Reactor3D.daylightOf(NIGHT);
    const out = {};
    const auto = Reactor3D.sunAtDaylight({ type: 'sun', daylight: 'auto' }, 0xfff3d2, 1, night, out);
    assert.equal(auto, out, 'written into the caller\'s object');
    assert.ok(auto.intensity < 0.16, 'dimmed to moonlight');
    assert.ok((auto.colour & 255) > (auto.colour >> 16 & 255), 'and turned pale blue');
    const fixed = Reactor3D.sunAtDaylight({ type: 'sun', daylight: 'fixed' }, 0xfff3d2, 1, night, {});
    assert.deepEqual([fixed.colour, fixed.intensity], [0xfff3d2, 1]);
    const lamp = Reactor3D.sunAtDaylight({ type: 'point' }, 0xffaa55, 2, night, {});
    assert.deepEqual([lamp.colour, lamp.intensity], [0xffaa55, 2], 'a lamp is a lamp at any hour');
    const noon = Reactor3D.sunAtDaylight({ type: 'sun' }, 0xfff3d2, 1, Reactor3D.daylightOf(DAY), {});
    assert.deepEqual([noon.colour, noon.intensity], [0xfff3d2, 1]);
});

test('the map\'s native sun at night, live as the ambient changes', () => {
    const map = { width: 20, height: 20, reactor3d: { lighting: { ambient: 0.22, ambientColour: '#9db4ff' },
        lights: [{ id: 'sun', type: 'sun', x: 10, y: 10, height: 150, radius: 150, color: '#fff3d2', intensity: 1 },
            { id: 'still', type: 'sun', x: 10, y: 10, height: 150, radius: 150, color: '#fff3d2', intensity: 1, daylight: 'fixed' },
            { id: 'lamp', type: 'point', x: 5, y: 5, radius: 4, color: '#ffaa55', intensity: 1 }] } };
    assert.deepEqual(Reactor3D.readMapLights(map).map(l => l.daylight), ['auto', 'fixed', 'auto']);
    const at = () => Object.fromEntries(Reactor3D.nativeLights(map).map(l => [l.id, l]));
    let lights = at();
    assert.ok(lights.sun.intensity < 0.16 && lights.still.intensity === 1 && lights.lamp.intensity === 1);
    map.reactor3d.lighting = { ambient: 1, ambientColour: '#ffffff' };
    lights = at();
    assert.equal(lights.sun.intensity, 1, 'morning comes the next frame');
    assert.equal(lights.sun.colour, 0xfff3d2);
});

test('the sky dome and the studio reflection are tinted, without making anything a frame', () => {
    Reactor3D.setAmbient(NIGHT);
    const a = Reactor3D.daylight(), b = Reactor3D.daylight();
    assert.equal(a, b, 'the same object while the ambient holds');
    const set = [];
    const mesh = { parent: {}, matrixAutoUpdate: true, position: { copy() {} }, material: { color: { setRGB: (...rgb) => set.push(rgb) } }, userData: { sky: null } };
    Reactor3D.MapScene.prototype.updateSky.call({ _sky: mesh }, null, 1);
    assert.ok(set.length === 1 && set[0][2] > set[0][0] && set[0][2] < 0.15, 'a dark blue sky at night');
    const env = Reactor3D.Reflections.uniforms();
    Reactor3D.Reflections.bind({});
    assert.ok(env.rrSkyLight.value.z < 0.15, 'the studio reflection dims with it');
    // Indoors (no sky dome): the studio reflection is left as it is, whatever the ambient.
    Reactor3D.MapScene.prototype.updateSky.call({ _sky: null }, null, 2);
    Reactor3D.Reflections.bind({});
    assert.ok(near(env.rrSkyLight.value.z, 1), 'a room with no sky keeps its reflections');
    Reactor3D.MapScene.prototype.updateSky.call({ _sky: mesh }, null, 3);
    Reactor3D.setAmbient(DAY);
    Reactor3D.Reflections.bind({});
    assert.ok(near(env.rrSkyLight.value.x, 1), 'and comes back at day');
    Reactor3D.setAmbient(null);
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'), 'utf8');
    assert.match(source, /uniform vec3 rrSkyLight;/);
    assert.match(source, /else rrEnv \*= rrSkyLight;/, 'only the studio cube is tinted: a live capture sees the dome itself');
});

test('the editor keeps a fixed sun and writes nothing for one that follows', () => {
    const map = { reactor3d: { version: 1, lights: [{ id: 'sun', type: 'sun', x: 1, y: 1, daylight: 'fixed' }] } };
    L.update(map, 'sun', { intensity: 0.8 });
    assert.equal(L.get(map, 'sun').daylight, 'fixed');
    L.update(map, 'sun', { daylight: 'auto' });
    assert.equal('daylight' in L.get(map, 'sun'), false, 'following is the default, so nothing is written');
    const panel = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'LightingManager.js'), 'utf8');
    assert.match(panel, /commit\(\{ daylight: field\.checked \? 'auto' : 'fixed' \}\)/);
    assert.match(panel, /map\(light => this\._atDaylight\(\{/, 'the editor\'s 3D view shows the sun as the game does');
    assert.match(panel, /Reactor3D\.sunAtDaylight\(light, light\.colour, light\.intensity, day,/);
});

test('a battle room\'s sun and ambient follow the map\'s ambient as it is now', () => {
    global.$dataMap = { width: 20, height: 20, reactor3d: { lighting: { ambient: 0.22, ambientColour: '#9db4ff' },
        lights: [{ id: 'sun', type: 'sun', x: 10, y: 10, height: 150, radius: 150, color: '#fff3d2', intensity: 1 }] } };
    global.$gameMap = { mapId: () => 5, _reactorLightStates: null };
    global.Graphics = { frameCount: 100 };
    global.Reactor3D = Reactor3D;
    require(path.join(repoRoot, 'runtime', 'reactor_battle_room.js'));
    const View = global.ReactorBattleRoomView;
    const room = { map: global.$dataMap, frame: 0, assets: {}, models: new Map(), billboards: new Map(), roomAmbient: View.prototype.roomAmbient };
    const sun = () => View.prototype.roomLights.call(room).find(l => l.type === 'sun');
    assert.ok(sun().intensity < 0.16, 'night: moonlight in the room too');
    Reactor3D.setMapAmbient({ intensity: 1, color: '#ffffff' }, 0);
    assert.equal(sun().intensity, 1, 'an AmbientLight command brings the morning into the room');
    assert.equal(View.prototype.roomAmbient.call(room).intensity, 1);
    room.map = { reactor3d: { lighting: {} } };
    assert.equal(View.prototype.roomAmbient.call(room).intensity, 1, 'a room with no ambient keeps its full fill');
    delete global.$dataMap; delete global.$gameMap; delete global.Graphics;
});
