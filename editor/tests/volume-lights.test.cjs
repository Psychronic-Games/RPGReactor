/**
 * Lights in volume.
 *
 * The flat quads lit the floor and nothing else: a light's height was
 * discarded, a wall beside a lamp stayed dark, a spot could only sweep
 * sideways. In volume mode every map material takes the map's lights as
 * shader uniforms and lights each pixel by its distance from every source in
 * three dimensions, and each source stands in the world as a glowing body a
 * wall can hide.
 */
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

test('volume is the default, and a map or the engine can ask for the flat quads', () => {
    assert.equal(Reactor3D.LIGHT_MODE, 'volume');
    assert.equal(Reactor3D.lightModeFor({ reactor3d: {} }), 'volume');
    assert.equal(Reactor3D.lightModeFor({ reactor3d: { lighting: { mode: 'flat' } } }), 'flat');
    assert.equal(Reactor3D.lightModeFor(null), 'volume');
    const was = Reactor3D.LIGHT_MODE;
    try {
        Reactor3D.LIGHT_MODE = 'flat';
        assert.equal(Reactor3D.lightModeFor({ reactor3d: {} }), 'flat');
    } finally {
        Reactor3D.LIGHT_MODE = was;
    }
});

test('a spot carries a pitch: read from the sidecar, bounded, resolved per frame, mirrored by the editor', () => {
    Reactor3D._nativeNorm = null;
    const map = { reactor3d: { lights: [
        { id: 'a', type: 'spot', x: 1, y: 2, yaw: 45, pitch: -60, height: 3 },
        { id: 'b', type: 'spot', pitch: 500 },
        { id: 'c', type: 'point' }
    ] } };
    const lights = Reactor3D.readMapLights(map);
    assert.equal(lights[0].pitch, -60);
    assert.equal(lights[1].pitch, 90, 'bounded to straight up');
    assert.equal(lights[2].pitch, 0, 'level by default');
    const resolved = Reactor3D.nativeLights(map);
    assert.equal(resolved[0].pitch, -60, 'pitch is not flipped the way yaw is');
    assert.equal(resolved[0].yaw, -45);
    assert.equal(resolved[0].height, 3);

    const editor = read('editor/src/utils/MapLights.js');
    assert.match(editor, /pitch: number\(raw\.pitch, 0, -90, 90\),/);
    const manager = read('editor/src/LightingManager.js');
    assert.match(manager, /yaw: light\.yaw, pitch: light\.pitch,/, 'resolvedLights carries it');
    assert.match(manager, /yaw: -light\.yaw, pitch: light\.pitch, occlude: light\.occlude/, 'feed3D hands it to the compositor');
    assert.match(manager, /this\._slider\('pitch', light\.pitch, -90, 90, 1\)/, 'the panel edits it for anything aimed');
    const i18n = read('editor/src/I18nManager.js');
    assert.equal((i18n.match(/"lit\.pitch": "/g) || []).length, 18, 'named in every locale');
});

test('a lit material composes with earlier injections and keys its program apart', () => {
    const calls = [];
    const material = {
        onBeforeCompile(shader) { calls.push('earlier'); shader.vertexShader = '/*E*/' + shader.vertexShader; },
        customProgramCacheKey() { return 'earlier-key'; }
    };
    assert.equal(Reactor3D.litMaterial(material), material);
    assert.equal(material.__reactorLit, true);
    assert.equal(Reactor3D.litMaterial(material), material, 'idempotent');
    assert.equal(material.customProgramCacheKey(), 'earlier-key|reactor3d-lit');

    const shader = {
        uniforms: {},
        vertexShader: 'void main() {\n#include <begin_vertex>\n#include <project_vertex>\n}',
        fragmentShader: 'void main() {\n\tvec4 diffuseColor = vec4( diffuse, opacity );\n#include <map_fragment>\n}'
    };
    material.onBeforeCompile(shader, null);
    assert.deepEqual(calls, ['earlier'], 'the earlier hook ran first');
    assert.ok(shader.vertexShader.startsWith('varying vec3 vRRWorldPos;\n/*E*/'));
    assert.match(shader.vertexShader, /#include <project_vertex>\n\tvRRWorldPos = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xyz;/);
    assert.match(shader.fragmentShader, /vec4 diffuseColor = vec4\( diffuse \* mix\(rrLight\(vRRWorldPos\), vec3\(1\.0\), rrSelfLit\), opacity \);/);
    assert.match(shader.fragmentShader, /uniform vec4 rrLightPos\[32\];/);
    assert.match(shader.fragmentShader, /smoothstep\(aim\.w, mix\(aim\.w, 1\.0, 0\.35\), c\)/, 'a cone is soft at its rim');
    const uniforms = Reactor3D.lightUniforms();
    for (const key of ['rrLightCount', 'rrLightPos', 'rrLightColor', 'rrLightAim', 'rrAmbient']) {
        assert.equal(shader.uniforms[key], uniforms[key], key + ' is the shared value object, not a copy');
    }
    assert.equal(uniforms.rrLightPos.value.length, Reactor3D.SHADER_LIGHTS * 4);

    const bare = {};
    Reactor3D.litMaterial(bare);
    assert.equal(bare.customProgramCacheKey(), '|reactor3d-lit');
    assert.equal(Reactor3D.litMaterial(null), null);
});

test('every surface of the map is lit: tiles, cut-outs, rooms, models, characters', () => {
    const three = source3D();
    const sites = [
        /"reactor3d-billboard-clamped" : "reactor3d-tile-clamped"\);\n\s*Reactor3D\.litMaterial\(material\);/,
        /"reactor3d-billboard-clamped" : "reactor3d-tile-clamped"\);\n\s*Reactor3D\.litMaterial\(opaqueCore\);/,
        /material\.__reactorShaded = true;\n\s*Reactor3D\.litMaterial\(material\);\n\s*this\._materials\.push\(material\);/,
        /mat\.userData\.baseColor = mat\.color\.clone\(\);\n\s*Reactor3D\.litMaterial\(mat\);/,
        /defaultMat\.__reactorModel = true;\n\s*Reactor3D\.litMaterial\(defaultMat\);/,
        /fog: false \}\);\n\s*Reactor3D\.litMaterial\(material\);/,
        /Reactor3D\.straightenBillboardDepth\(material\);\n\s*Reactor3D\.litMaterial\(material\);/
    ];
    for (const site of sites) assert.match(three, site);
    // Lit materials keep their base colour; the ambient reaches them as a uniform.
    assert.match(three, /const shared = Reactor3D\.lightUniforms\(\)\.rrAmbient\.value;/);
    assert.match(three, /for \(const material of this\._materials\) \{\n\s*if \(material\.__reactorLit\) continue;/);
});

test('in volume mode syncLights writes uniforms and bodies, never quads or a pass', () => {
    const three = source3D();
    const at = three.indexOf('Reactor3D.MapScene.prototype.syncLights = function');
    const body = three.slice(at, three.indexOf('\n};', at));
    assert.match(body, /if \(Reactor3D\.lightModeFor\(\) === "volume"\) \{\n\s*this\.syncVolumeLights\(declared, focus\);\n\s*return;\n\s*\}/);
    assert.match(body, /Reactor3D\.lightUniforms\(\)\.rrLightCount\.value = 0;/, 'the flat path clears the field');

    const volume = three.slice(three.indexOf('Reactor3D.MapScene.prototype.syncVolumeLights = function'));
    assert.match(volume, /const y = standsOn \+ lift \+ height;/, 'height is a coordinate now');
    assert.match(volume, /ay = Math\.sin\(pitch\);/, 'a spot aims up or down');
    assert.match(volume, /cosHalf = Math\.cos\(\(Math\.min\(angle, 178\) \* Math\.PI\) \/ 360\);/);
    assert.match(volume, /gain = intensity \* Reactor3D\.VOLUME_LIGHT_GAIN/);
    assert.match(volume, /new THREE\.SphereGeometry\(1, 24, 16\)/, 'a point light has a sphere');
    assert.match(volume, /new THREE\.ConeGeometry\(1, 1, 32, 1, true\)/, 'a spot has a cone');
    assert.match(volume, /cone\.quaternion\.setFromUnitVectors\(down, aimVector\)/);
    assert.match(volume, /depthWrite: false,\n\s*depthTest: true,/, 'bodies are hidden by walls and never hide each other');
    assert.match(volume, /blending: THREE\.AdditiveBlending/);

    // The bodies live in the world's passes, with the models.
    const pass = three.slice(three.indexOf('Reactor3D.MapScene.prototype.setPass = function'));
    assert.match(pass, /this\._lightBodyGroup\.visible = all \|\| world \|\| which === "below";/);
    // And a cleared map lets go of them.
    assert.match(three, /this\._lightBodies\.dispose\(\);\n\s*this\._lightBodies = null;/);

    // The game builds no additive pass, and the flat 2D composite stands down on a 3D map.
    const sprites = read('runtime/reactor_sprites.js');
    assert.match(sprites, /this\._reactor3dLights = Reactor3D\.wantsLights3D\(\$dataMap\)\n\s*&& Reactor3D\.lightModeFor\(\$dataMap\) === "flat"/);
    assert.match(sprites, /&& !\(this\._reactor3dBelow && Reactor3D\.lightModeFor\(\$dataMap\) === "volume"\)/);
});

test('the field selects the nearest lights to the focus when there are more than the shader holds', () => {
    // A minimal scene: no THREE, so bodies are stubbed; the uniforms are real.
    const scene = Object.create(Reactor3D.MapScene.prototype);
    const placed = [];
    scene.lightBodies = () => ({ place: (i, l) => placed.push(l), trim: () => {} });
    const saved = { facadeAt: Reactor3D.facadeAt, surfaceHeightAt: Reactor3D.surfaceHeightAt };
    Reactor3D.facadeAt = () => null;
    Reactor3D.surfaceHeightAt = () => 0;
    try {
        const lights = [];
        for (let i = 0; i < 40; i++) {
            lights.push({ type: 'point', x: i * 2, y: 0, height: 1, radius: 3, colour: 0xff8000, intensity: 1 });
        }
        lights.push({ type: 'spot', x: 5, y: 5, height: 4, radius: 6, angle: 60, yaw: 90, pitch: -90, colour: 0xffffff, intensity: 2 });
        scene.syncVolumeLights(lights, { x: 5, y: 5 });
        const u = Reactor3D.lightUniforms();
        assert.equal(u.rrLightCount.value, Reactor3D.SHADER_LIGHTS);
        assert.equal(placed.length, Reactor3D.SHADER_LIGHTS);
        const spot = placed.find(l => l.spot);
        assert.ok(spot, 'the spot right at the focus made the cut');
        assert.ok(placed.every(l => l.x <= 61), 'the far end of the street did not');
        assert.equal(spot.y, 4, 'stood at its height');
        assert.equal(spot.x, 5.5);
        assert.equal(spot.z, 6, 'the southern edge of its cell, like the flat pool');
        const at = placed.indexOf(spot) * 4;
        assert.ok(Math.abs(u.rrLightAim.value[at + 1] + 1) < 1e-6, 'pitched -90 aims straight down');
        assert.ok(Math.abs(u.rrLightAim.value[at + 3] - Math.cos(Math.PI / 6)) < 1e-6, 'cos of half the spread');
        assert.equal(u.rrLightColor.value[at + 3], 1, 'flagged as a spot');
        assert.equal(u.rrLightColor.value[at], 2 * Reactor3D.VOLUME_LIGHT_GAIN, 'colour carries intensity and gain');
        assert.equal(u.rrLightPos.value[at + 3], 6, 'and its reach');

        scene.syncVolumeLights([], null);
        assert.equal(u.rrLightCount.value, 0);
    } finally {
        Reactor3D.facadeAt = saved.facadeAt;
        Reactor3D.surfaceHeightAt = saved.surfaceHeightAt;
    }
});

//-----------------------------------------------------------------------------
// Beams, and the event commands that switch, move and recolour lights

/** Globals a command path expects: a map with lights, a Game_Map, a clock. */
function withLightWorld(map, frame, body) {
    const saved = { $dataMap: global.$dataMap, $gameMap: global.$gameMap, Graphics: global.Graphics, $gamePlayer: global.$gamePlayer };
    global.$dataMap = map;
    global.$gameMap = { mapId: () => 7, event: () => null };
    global.Graphics = { frameCount: frame };
    global.$gamePlayer = undefined;
    Reactor3D._nativeNorm = null;
    try {
        return body();
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete global[key];
            else global[key] = value;
        }
    }
}

test('a beam is a constant-width cylinder of light: read, packed, shaded and bodied like one', () => {
    Reactor3D._nativeNorm = null;
    const map = { reactor3d: { lights: [
        { id: 'laser', type: 'beam', x: 2, y: 3, yaw: 90, pitch: 0, height: 1, width: 0.3 },
        { id: 'fat', type: 'beam', width: 99 },
        { id: 'lamp', type: 'point' }
    ] } };
    const lights = Reactor3D.readMapLights(map);
    assert.equal(lights[0].type, Reactor3D.LIGHT_BEAM);
    assert.equal(lights[0].radius, Reactor3D.DEFAULT_BEAM_LENGTH, 'a beam defaults to its own length');
    assert.equal(lights[0].width, 0.3);
    assert.equal(lights[1].width, 5, 'width is bounded');
    assert.equal(lights[2].width, Reactor3D.DEFAULT_BEAM_WIDTH, 'a point carries the default unused');
    assert.equal(Reactor3D.lightIsAimed(lights[0]), true);
    assert.equal(Reactor3D.lightIsAimed(lights[2]), false);
    const resolved = Reactor3D.nativeLights(map);
    assert.equal(resolved[0].width, 0.3, 'width reaches the compositor');

    // Packed: colour.w = 2 says beam, aim.w carries HALF the width — width is the beam's full thickness.
    const scene = Object.create(Reactor3D.MapScene.prototype);
    const placed = [];
    scene.lightBodies = () => ({ place: (i, l) => placed.push(l), trim: () => {} });
    const saved = { facadeAt: Reactor3D.facadeAt, surfaceHeightAt: Reactor3D.surfaceHeightAt };
    Reactor3D.facadeAt = () => null;
    Reactor3D.surfaceHeightAt = () => 0;
    try {
        scene.syncVolumeLights([{ type: 'beam', x: 1, y: 1, height: 1, radius: 8, width: 0.25, yaw: 0, pitch: 0, colour: 0xff0000, intensity: 1 }], { x: 1, y: 1 });
        const u = Reactor3D.lightUniforms();
        assert.equal(u.rrLightColor.value[3], 2, 'flagged as a beam');
        assert.equal(u.rrLightAim.value[3], 0.125, 'the aim carries half the width');
        assert.ok(Math.abs(u.rrLightAim.value[2] - 1) < 1e-6, 'yaw 0 aims along +z, as a spot does');
        assert.equal(placed[0].beam, true);
        assert.equal(placed[0].width, 0.25);
        scene.syncVolumeLights([], null);
    } finally {
        Reactor3D.facadeAt = saved.facadeAt;
        Reactor3D.surfaceHeightAt = saved.surfaceHeightAt;
    }

    // Shaded: its own branch, before the cone's, on the axis distance.
    const glsl = Reactor3D.lightGlsl(false);
    assert.match(glsl, /if \(lc\.w > 1\.5\) \{[\s\S]*float t = dot\(d, aim\.xyz\);[\s\S]*float perp = length\(d - aim\.xyz \* t\);[\s\S]*smoothstep\(aim\.w, aim\.w \* 0\.35, perp\)[\s\S]*\} else if \(lc\.w > 0\.5\) \{/);
    assert.match(glsl, /if \(t < 0\.0 \|\| t > lp\.w\) continue;/, 'nothing behind the source or past the length');

    // Bodied: a cylinder aimed like the cone, and a flat bar in 2D.
    const three = source3D();
    assert.match(three, /new THREE\.CylinderGeometry\(1, 1, 1, 24, 1, true\)/);
    assert.match(three, /beamBody\.quaternion\.setFromUnitVectors\(down, aimVector\)/);
    assert.match(three, /for \(const list of \[cores, glows, cones, beams, dots\]\) \{/, 'disposed with the rest');
    assert.match(three, /this\.lightIsAimed\(light\) && light\.followFacing && carrier\.direction/, 'a carried beam turns with its carrier');
    const sprites = read('runtime/reactor_sprites.js');
    assert.match(sprites, /reactorFlatLightTexture\(beam \? "beam" : spot \? "cone" : "round"\)/);
    assert.match(sprites, /beam \? width \* tw : 2 \* Math\.tan\(spread\) \* reach/, 'the 2D bar is the full width');
    assert.match(three, /beamBody\.scale\.set\(light\.width \* 0\.5, light\.radius, light\.width \* 0\.5\)/, 'the body is the full width across');
    assert.match(three, /width: number\(entry\.width, this\.DEFAULT_BEAM_WIDTH, 0\.005, 5\)/, 'a laser can be a hair');
});

test('LightSwitch turns a light or a tag on, off and over', () => {
    const map = { reactor3d: { lights: [
        { id: 'a', type: 'point', tag: 'row' },
        { id: 'b', type: 'point', tag: 'row', on: false },
        { id: 'c', type: 'point' }
    ] } };
    withLightWorld(map, 10, () => {
        assert.equal(Reactor3D.nativeLights(map).map(l => l.id).join(''), 'ac');
        Reactor3D.switchLight('c', 'off');
        assert.equal(Reactor3D.nativeLights(map).map(l => l.id).join(''), 'a');
        Reactor3D.switchLight('c', 'toggle');
        assert.equal(Reactor3D.nativeLights(map).map(l => l.id).join(''), 'ac');
        Reactor3D.switchLight('#row', 'on');
        assert.equal(Reactor3D.nativeLights(map).map(l => l.id).join(''), 'abc', 'the tag lit b');
        Reactor3D.switchLight('#row', 'toggle');
        assert.equal(Reactor3D.nativeLights(map).map(l => l.id).join(''), 'c', 'toggle reads the first tagged light');
        assert.deepEqual(global.$gameMap._reactorLightStates, { c: true, '#row': false }, 'saved as plain state');
    });
});

test('TransformLight eases a light, by id over its tag, and resets', () => {
    const map = { reactor3d: { lights: [
        { id: 'a', type: 'spot', x: 1, y: 1, yaw: 0, radius: 4, intensity: 1, color: '#000000', tag: 'row' },
        { id: 'b', type: 'spot', x: 5, y: 1, yaw: 0, radius: 6, tag: 'row' }
    ] } };
    withLightWorld(map, 100, () => {
        Reactor3D.transformLight('#row', { yaw: 90, intensity: '', color: '#ffffff' }, 100);
        const block = global.$gameMap._reactorLightOverrides['#row'];
        assert.equal(block.mapId, 7);
        assert.deepEqual(block.to, { yaw: 90, color: 0xffffff }, 'an empty field is left alone');
        assert.equal(block.duration, 100);
        global.Graphics.frameCount = 150;
        let lights = Reactor3D.nativeLights(map);
        assert.equal(lights[0].yaw, -45, 'halfway there, in the scene convention');
        assert.equal(lights[1].yaw, -45, 'every light of the tag');
        assert.equal(lights[0].colour, 0x808080, 'colour eases per channel');
        assert.equal(lights[1].radius, 6, 'an untouched field stays authored');
        // The light's own override wins per field and starts from what it shows now.
        Reactor3D.transformLight('a', { yaw: 0, radius: 2 }, 0);
        const own = global.$gameMap._reactorLightOverrides.a;
        assert.equal(own.from.yaw, 45, 'from where the tag ease had reached');
        lights = Reactor3D.nativeLights(map);
        assert.equal(lights[0].yaw, -0, 'immediate');
        assert.equal(lights[0].radius, 2);
        assert.equal(lights[0].colour, 0x808080, 'the tag still colours it');
        assert.equal(lights[1].yaw, -45, 'b keeps riding the tag');
        // Positions are authored-space: an offset when attached.
        Reactor3D.transformLight('b', { x: 9, height: 3 }, 0);
        lights = Reactor3D.nativeLights(map);
        assert.equal(lights[1].x, 9);
        assert.equal(lights[1].height, 3);
        // A block from another map is ignored; a reset clears the key.
        global.$gameMap._reactorLightOverrides.b.mapId = 99;
        assert.equal(Reactor3D.nativeLights(map)[1].x, 5);
        Reactor3D.transformLight('#row', null);
        assert.equal(global.$gameMap._reactorLightOverrides['#row'], undefined);
        assert.equal(Reactor3D.nativeLights(map)[1].yaw, -0);
    });
});

test('AmbientLight eases the map ambient through ambientFor, and the 3D path re-applies a changed value', () => {
    const map = { reactor3d: { lighting: { ambient: 0.2, ambientColour: '#000000' } } };
    withLightWorld(map, 0, () => {
        assert.deepEqual(Reactor3D.ambientFor(map), { intensity: 0.2, colour: 0 });
        Reactor3D.setMapAmbient({ intensity: 1, color: '#ffffff' }, 10);
        global.Graphics.frameCount = 5;
        const mid = Reactor3D.ambientFor(map);
        assert.ok(Math.abs(mid.intensity - 0.6) < 1e-9);
        assert.equal(mid.colour, 0x808080);
        global.Graphics.frameCount = 50;
        assert.deepEqual(Reactor3D.ambientFor(map), { intensity: 1, colour: 0xffffff });
        Reactor3D.setMapAmbient({ intensity: 0.5 }, 0);
        assert.deepEqual(Reactor3D.ambientFor(map), { intensity: 0.5, colour: 0xffffff }, 'colour carried from where it was');
        global.$gameMap._reactorAmbientOverride.mapId = 3;
        assert.deepEqual(Reactor3D.ambientFor(map), { intensity: 0.2, colour: 0 }, 'another map\'s block is ignored');
        Reactor3D.setMapAmbient(null);
        assert.equal(global.$gameMap._reactorAmbientOverride, undefined);
    });
    const sprites = read('runtime/reactor_sprites.js');
    assert.match(sprites, /const key = ambient\.intensity \* 16777216 \+ ambient\.colour;\n\s*if \(key !== this\._reactor3dAmbientKey\)/);
    const three = source3D();
    for (const name of ['LightSwitch', 'TransformLight', 'AmbientLight']) {
        assert.match(three, new RegExp('registerCommand\\("RPGReactor", "' + name + '"'));
    }
});

test('a beam stops where it lands and leaves a dot there: the march, the models, the packer, the preview', () => {
    // The march: a raised cell ahead stops the beam at its face; a clear run does not.
    const savedBlock = Reactor3D.lightBlockHeightAt;
    Reactor3D.lightBlockHeightAt = (x, y) => (Math.round(x) >= 5 ? 3 : 0);
    try {
        const level = Reactor3D.beamHit(1, 1, 1, 1, 0, 0, 10, null);
        assert.ok(level !== null && level >= 3.4 && level <= 3.7, 'a level beam from x=1 meets the block at x≈4.5 (' + level + ')');
        assert.equal(Reactor3D.beamHit(1, 1, 1, 0, 0, 1, 3, null), null, 'nothing ahead: no landing');
        const dive = Reactor3D.beamHit(1, 1, 1, 0, -1, 0, 5, null);
        assert.ok(dive !== null && dive <= 1.2, 'aimed straight down it lands on the ground within a step (' + dive + ')');
    } finally {
        Reactor3D.lightBlockHeightAt = savedBlock;
    }
    // Placed models: their bounds stop it; the one it starts inside never does.
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    Reactor3D.lightBlockHeightAt = () => -100;
    try {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        crate.position.set(4.5, 0.5, 2);
        crate.updateMatrixWorld(true);
        const carrier = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
        carrier.position.set(1.5, 1, 2);
        carrier.updateMatrixWorld(true);
        const scene = { _modelInstances: new Map([['a', { object: carrier }], ['b', { object: crate }]]) };
        const hit = Reactor3D.beamHit(1, 1, 1, 1, 0, 0, 10, scene);
        assert.ok(hit !== null && Math.abs(hit - 2.5) < 1e-6, 'the crate face at x=4 is 2.5 tiles out (' + hit + ')');
    } finally {
        Reactor3D.lightBlockHeightAt = savedBlock;
    }
    const three = source3D();
    // The packer: the beam's reach is the landing, the next light is the dot on the surface, the body gets the hit.
    const scene = Object.create(Reactor3D.MapScene.prototype);
    const placed = [];
    scene.lightBodies = () => ({ place: (i, l) => placed.push(l), trim: () => {} });
    const saved = { facadeAt: Reactor3D.facadeAt, surfaceHeightAt: Reactor3D.surfaceHeightAt, beamHit: Reactor3D.beamHit };
    Reactor3D.facadeAt = () => null;
    Reactor3D.surfaceHeightAt = () => 0;
    Reactor3D.beamHit = () => 2;
    try {
        scene.syncVolumeLights([{ type: 'beam', x: 1, y: 1, height: 1, radius: 8, width: 0.1, yaw: 0, pitch: 0, colour: 0xff0000, intensity: 1 }], { x: 1, y: 1 });
        const u = Reactor3D.lightUniforms();
        assert.equal(u.rrLightCount.value, 2, 'the beam and its dot');
        assert.equal(u.rrLightPos.value[3], 2, 'the beam reaches only to the landing');
        assert.equal(u.rrLightColor.value[7], 0, 'the dot is a point light');
        assert.ok(Math.abs(u.rrLightPos.value[6] - 4) < 1e-6, 'two tiles along +z from z=2');
        assert.ok(Math.abs(u.rrLightPos.value[7] - Math.max(0.1 * Reactor3D.BEAM_DOT_REACH, 0.3)) < 1e-6, 'its reach scales with the width');
        assert.equal(placed[0].radius, 2, 'the body stops there too');
        assert.ok(placed[0].hit && Math.abs(placed[0].hit.z - 4) < 1e-6, 'and knows where');
        // A camera past the landing looks at the surface's back: no dot for it.
        const savedEye = Reactor3D.viewEye;
        Reactor3D.viewEye = () => ({ x: 1.5, y: 1, z: 9 });
        placed.length = 0;
        scene.syncVolumeLights([{ type: 'beam', x: 1, y: 1, height: 1, radius: 8, width: 0.1, yaw: 0, pitch: 0, colour: 0xff0000, intensity: 1 }], { x: 1, y: 1 });
        assert.equal(placed[0].hit.facesEye, false, 'the eye beyond the wall sees no dot');
        Reactor3D.viewEye = () => ({ x: 1.5, y: 1, z: 0 });
        placed.length = 0;
        scene.syncVolumeLights([{ type: 'beam', x: 1, y: 1, height: 1, radius: 8, width: 0.1, yaw: 0, pitch: 0, colour: 0xff0000, intensity: 1 }], { x: 1, y: 1 });
        assert.equal(placed[0].hit.facesEye, true, "the eye on the beam's side does");
        Reactor3D.viewEye = savedEye;
        assert.match(three, /if \(light\.beam && light\.hit && light\.hit\.facesEye !== false\) \{/, 'the body pool honours it');
        scene.syncVolumeLights([], null);
    } finally {
        Object.assign(Reactor3D, saved);
    }
    assert.match(three, /group, glows, cores, cones, beams, dots,/, 'the body pool carries the dots');
    const editor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'), 'utf8');
    assert.match(editor, /_beamLanding\(live, light, x, y, z\) \{/);
    assert.match(editor, /_skinnedBounds\(mesh, box\)/, 'a rig is bounded by its bones, never re-skinned per cast');
    assert.match(editor, /now - live\.landing\.at < this\.BEAM_LANDING_INTERVAL/, 'and a moving beam re-asks a few times a second, not every frame');
});
