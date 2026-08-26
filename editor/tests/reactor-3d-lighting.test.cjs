/**
 * Lights in three dimensions.
 *
 * A 2D lighting plugin draws circles and cones onto the screen, which on a 3D
 * map is a picture of light rather than light: flat over the world instead of
 * pooling on the ground and climbing walls. The geometry is there to be lit, so
 * this lights it — reading each plugin's own lights through a shim, and never
 * modifying the plugin.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

/** Run `body` with globals a shim expects, and put the world back after. */
function withGlobals(globals, body) {
    const saved = new Map();
    for (const [key, value] of Object.entries(globals)) {
        saved.set(key, global[key]);
        global[key] = value;
    }
    try {
        return body();
    } finally {
        for (const [key, value] of saved) {
            if (value === undefined) delete global[key];
            else global[key] = value;
        }
    }
}

const gameMap = { tileWidth: () => 48, tileHeight: () => 48 };

test('lighting is off unless a map asks for it', () => {
    // A project already lit to its author's satisfaction in 2D must not have
    // that quietly replaced by something that looks different.
    assert.equal(Reactor3D.wantsLights3D({ meta: { '3d': true } }), false);
    assert.equal(Reactor3D.wantsLights3D({ meta: { '3d': true, '3d lights': true } }), true);
    // Not a 3D map at all: nothing to light.
    assert.equal(Reactor3D.wantsLights3D({ meta: { '3d lights': true } }), false);

    // The sidecar can say so instead, and wins when it does.
    const map = { meta: { '3d': true, '3d lights': true },
        reactor3d: { mode: '3d', lighting: { enabled: false } } };
    assert.equal(Reactor3D.wantsLights3D(map), false);
});

test('an unlit map is fully lit, which is the look it already had', () => {
    // The scene always uses a lit material now, so "unlit" has to mean an
    // ambient of one — anything less would darken every existing 3D map.
    Reactor3D.setAmbient(null);
    assert.equal(Reactor3D.ambient(), null);
    assert.equal(Reactor3D.isLit(), false);

    const ambient = Reactor3D.ambientFor({ meta: {} });
    assert.equal(ambient.intensity, 0.25, 'a lit map has a dim floor, not black');
    assert.equal(Reactor3D.ambientFor(
        { reactor3d: { lighting: { ambient: 0.6 } } }).intensity, 0.6, 'and it is authorable');
});

//-----------------------------------------------------------------------------
// Nova

test('MVNovaLighting: a lantern becomes a point, a flashlight a cone', () => {
    const lights = withGlobals({
        $gameMap: gameMap,
        Anisoft: { Nova: { LightManager: { currentMapLights: () => [
            { type: 'light', position: { x: 10, y: 4 }, scale: { x: 240 },
              tint: 0xffaa00, alpha: 0.8, active: true },
            { type: 'flashlight', position: { x: 3, y: 7 }, scale: { x: 512 },
              bitmap: { width: 44, height: 82.5, resolution: 64 },
              tint: 0xffffff, alpha: 1, active: true, rotation: 0 },
            { type: 'light', position: { x: 1, y: 1 }, scale: { x: 100 }, active: false },
            { type: 'light', position: { x: 2, y: 2 }, scale: { x: 0 } }
        ] } } }
    }, () => Reactor3D.LightShims.nova());

    assert.equal(lights.length, 2, 'an inactive light and a zero radius are dropped');

    const [lamp, torch] = lights;
    assert.equal(lamp.type, Reactor3D.LIGHT_POINT);
    assert.equal(lamp.x, 10);
    assert.equal(lamp.y, 4);
    assert.equal(lamp.radius, 5, 'pixels become tiles');
    assert.equal(lamp.colour, 0xffaa00);
    assert.equal(lamp.intensity, 0.8);

    assert.equal(torch.type, Reactor3D.LIGHT_SPOT);
    // Nova's own numbers for a stock 12x16 flashlight: a 44 x 82.5 bitmap
    // drawn at scale/resolution = 512/64.
    assert.equal(Math.round(torch.radius * 100) / 100, 13.75);
});

test('MVNovaLighting: a missing plugin is not an error', () => {
    assert.equal(withGlobals({ Anisoft: undefined }, () => Reactor3D.LightShims.nova()), null);
    assert.equal(withGlobals({ Anisoft: { Nova: {} } },
        () => Reactor3D.LightShims.nova()), null);
});

//-----------------------------------------------------------------------------
// Rave

/** A map whose events carry the light configs, the way Rave stores them. */
function raveWorld(events, player = { _realX: 0, _realY: 0, direction: () => 2 }) {
    return {
        $gameMap: Object.assign({ events: () => events }, gameMap),
        $gamePlayer: player,
        $gameSystem: { isLightOn: (id) => id !== 'off' }
    };
}

test('PSYCHRONIC_RaveLighting: lights are read from the character, not a sprite', () => {
    // A light belongs to a character, as a config on `_lights`. The plugin also
    // builds glow sprites from those configs into the spriteset's
    // `_lightContainer`, and reading THOSE is the mistake this replaced: they
    // are pooled, made lazily and left invisible when unused, so a fully lit
    // map can present an empty container. Freelancers' map 342 did exactly
    // that -- five lit events, nothing in the container, no lights in 3D.
    const lights = withGlobals(raveWorld([
        { _realX: 6, _realY: 9, direction: () => 2, _lights: [
            { _lightId: 'a', _lightType: 'light', _lightRadius: 300,
              _lightColor: '#ff0000' }] },
        { _realX: 2, _realY: 2, direction: () => 4, _lights: [
            { _lightId: 'b', _lightType: 'flashlight', _coneLengthPx: 480,
              _coneWidthPx: 240, _lightColor: '#ffffff' }] },
        { _realX: 1, _realY: 1, direction: () => 2, _lights: [
            { _lightId: 'off', _lightType: 'light', _lightRadius: 300 }] },
        { _realX: 0, _realY: 0, direction: () => 2, _lights: [
            { _lightId: 'c', _lightType: 'light', _lightRadius: 0 }] }
    ]), () => Reactor3D.LightShims.rave());

    assert.equal(lights.length, 2, 'a switched-off light and a zero radius are dropped');

    const [lamp, torch] = lights;
    assert.equal(lamp.x, 6);
    assert.equal(lamp.y, 9);
    assert.equal(lamp.radius, 300 / 48);
    assert.equal(lamp.colour, 0xff0000, 'a #rrggbb string reads as a colour');
    assert.equal(lamp.yaw, 0, 'facing south');

    assert.equal(torch.type, Reactor3D.LIGHT_SPOT);
    // Rave states its cone in pixels outright, so it needs no such workings.
    assert.equal(torch.radius, 480 / 48);
    assert.equal(torch.yaw, 90, 'facing west');
    assert.ok(torch.angle > 0 && torch.angle < 90, `a cone has a spread, got ${torch.angle}`);
});

test('PSYCHRONIC_RaveLighting: each shape keeps its reach in its own field', () => {
    const [fire, pulse, beam] = withGlobals(raveWorld([
        // Offsets are per shape too, and in pixels.
        { _realX: 4, _realY: 4, direction: () => 2, _lights: [
            { _lightId: 'f', _lightType: 'fire', _lightRadius: 200,
              _fireOffsetX: 24, _fireOffsetY: -48, _lightColor: '#9d6228' }] },
        // Pulsate's radius is where it is now; its reach is where it gets to.
        { _realX: 0, _realY: 0, direction: () => 2, _lights: [
            { _lightId: 'p', _lightType: 'pulsate', _lightRadius: 96,
              _pulsateMaxRadius: 336 }] },
        { _realX: 0, _realY: 0, direction: () => 2, _lights: [
            { _lightId: 'b', _lightType: 'beam', _beamLength: 240, _beamWidth: 48 }] }
    ]), () => Reactor3D.LightShims.rave());

    assert.equal(fire.radius, 200 / 48);
    assert.equal(fire.x, 4 + 0.5, 'a pixel offset lands in tiles');
    assert.equal(fire.y, 4 - 1);
    assert.equal(fire.colour, 0x9d6228);
    assert.equal(pulse.radius, 336 / 48, 'the reach, not the current radius');
    assert.equal(beam.type, Reactor3D.LIGHT_SPOT);
    assert.equal(beam.radius, 240 / 48);
});

test('PSYCHRONIC_RaveLighting: a flashlight points where it is turned', () => {
    // It turns smoothly and can track a target, so the plugin's own running
    // angle is the truthful answer wherever it has one -- radians clockwise
    // from south, which is this codebase's own convention.
    const [tracked] = withGlobals(raveWorld([
        { _realX: 0, _realY: 0, direction: () => 8, _lights: [
            { _lightId: 'a', _lightType: 'flashlight', _coneLengthPx: 96,
              _smoothFlashlightAngle: Math.PI / 2 }] }
    ]), () => Reactor3D.LightShims.rave());
    assert.equal(tracked.yaw, 90, 'the running angle wins over the facing');

    const [plain] = withGlobals(raveWorld([
        { _realX: 0, _realY: 0, direction: () => 8, _lights: [
            { _lightId: 'a', _lightType: 'flashlight', _coneLengthPx: 96 }] }
    ]), () => Reactor3D.LightShims.rave());
    assert.equal(plain.yaw, 180, 'and the facing is the fallback');
});

test('PSYCHRONIC_RaveLighting: the player carries lights too', () => {
    const lights = withGlobals(raveWorld([],
        { _realX: 3, _realY: 7, direction: () => 2, _lights: [
            { _lightId: 'lamp', _lightType: 'light', _lightRadius: 144 }] }
    ), () => Reactor3D.LightShims.rave());
    assert.equal(lights.length, 1, 'a lantern the player is holding is a light');
    assert.equal(lights[0].x, 3);
});

test('a colour is read however it is written', () => {
    assert.equal(Reactor3D.parseColour('#ff8800'), 0xff8800);
    assert.equal(Reactor3D.parseColour('ff8800'), 0xff8800);
    assert.equal(Reactor3D.parseColour(0x123456), 0x123456);
    assert.equal(Reactor3D.parseColour(undefined), 0xffffff, 'white rather than black');
    assert.equal(Reactor3D.parseColour('not a colour'), 0xffffff);
});

test('facing becomes a yaw the scene understands', () => {
    assert.equal(Reactor3D.facingYaw(2), 0);
    assert.equal(Reactor3D.facingYaw(4), 90);
    assert.equal(Reactor3D.facingYaw(6), -90);
    assert.equal(Reactor3D.facingYaw(8), 180);
    assert.equal(Reactor3D.facingYaw(undefined), 0, 'south for anything unrecognised');
});

//-----------------------------------------------------------------------------
// Collecting

test('a shim that throws costs its lights, not the frame', () => {
    // A plugin can be updated underneath this at any time, and a 3D map going
    // black because a shim threw would be a poor trade for lighting.
    const shims = Reactor3D.LightShims;
    const saved = { ...shims };
    try {
        Reactor3D.LightShims = {
            broken: () => { throw new Error('the plugin moved'); },
            fine: () => [{ x: 1, y: 1, radius: 3 }]
        };
        const warned = [];
        const realWarn = console.warn;
        console.warn = (...args) => warned.push(args);
        try {
            const lights = Reactor3D.collectLights();
            assert.equal(lights.length, 1, 'the working shim still contributes');
            assert.equal(warned.length, 1, 'and the broken one is reported');
            Reactor3D.collectLights();
            assert.equal(warned.length, 1, 'once, not every frame');
        } finally {
            console.warn = realWarn;
        }
    } finally {
        Reactor3D.LightShims = saved;
    }
});

test('both plugins can be present at once', () => {
    const lights = withGlobals({
        $gameMap: gameMap,
        Anisoft: { Nova: { LightManager: { currentMapLights: () => [
            { type: 'light', position: { x: 1, y: 1 }, scale: { x: 96 }, active: true }
        ] } } },
        $gameSystem: { isLightOn: () => true },
        $gamePlayer: { _realX: 0, _realY: 0, direction: () => 2 },
        SceneManager: { _scene: { _spriteset: {} } }
    }, () => {
        global.$gameMap = Object.assign({ events: () => [
            { _realX: 5, _realY: 5, direction: () => 2, _lights: [
                { _lightId: 'a', _lightType: 'light', _lightRadius: 96,
                  _lightColor: '#00ff00' }] }
        ] }, gameMap);
        return Reactor3D.collectLights();
    });
    assert.equal(lights.length, 2);
});

test('the flat lightmap is hidden, never modified', () => {
    // Turning 3D lighting off has to bring the plugin's own lighting straight
    // back, so nothing may be destroyed or rewritten.
    //
    // `renderable`, not `visible`. Rave rewrites `_lightContainer.visible` from
    // the options setting on every frame of its own Spriteset_Map.update, so a
    // one-shot `visible = false` is undone before it is ever drawn -- and
    // writing `visible` back each frame would overrule the player turning
    // lighting effects off. `visible` is the plugin's; `renderable` is nobody's.
    const nova = { visible: true, renderable: true };
    const raveLights = { visible: true, renderable: true };
    const raveDark = { visible: true, renderable: true };
    withGlobals({
        Anisoft: { Nova: { lightMapContainer: nova } },
        SceneManager: { _scene: { _spriteset: {
            _lightContainer: raveLights, _toneSprite: raveDark } } }
    }, () => {
        Reactor3D.suppressFlatLighting(true);
        assert.equal(nova.renderable, false);
        assert.equal(raveLights.renderable, false);
        // The darkness, which is the half that was being missed: Rave's
        // `_toneSprite` is a full-screen bitmap filled with the screen tone.
        // On a night map that is opaque black over a 3D world already lit for
        // real, so hiding only `_lightContainer` left the map unviewable.
        assert.equal(raveDark.renderable, false, 'the darkness goes too, not just the lights');

        for (const part of [nova, raveLights, raveDark]) {
            assert.equal(part.visible, true, 'the plugin keeps ownership of visible');
        }

        Reactor3D.suppressFlatLighting(false);
        assert.equal(nova.renderable, true);
        assert.equal(raveLights.renderable, true);
        assert.equal(raveDark.renderable, true);
    });
});

test('suppression is re-applied every frame, not only when it changes', () => {
    // Walking from one lit 3D map to another never crosses the boundary, so a
    // one-shot leaves the second map's freshly built overlay covering it -- and
    // a plugin is entitled to rebuild its own overlay whenever it likes.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    const update = sprites.slice(
        sprites.indexOf('Spriteset_Map.prototype.updateReactor3DLights = function'));
    const guard = update.indexOf('if (wants !== this._reactor3dLit)');
    const call = update.indexOf('Reactor3D.suppressFlatLighting(wants)');
    assert.ok(call >= 0, 'suppression still happens');
    assert.ok(call > update.indexOf('}', guard),
        'and outside the changed-this-frame guard');
});

test('the renderer is told to light the scene every frame', () => {
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /Spriteset_Map\.prototype\.updateReactor3DLights = function/);
    assert.match(sprites, /Reactor3D\.setLights\(wants \? Reactor3D\.collectLights\(\) : \[\]\)/);
    assert.match(sprites, /state\.scene\.syncLights\(focus\)/);
    // And what it borrowed is given back when the map goes.
    assert.match(sprites, /Reactor3D\.suppressFlatLighting\(false\);/);
});

test('every surface takes the ambient, ground and cut-out alike', () => {
    // Ground and billboards are dimmed the same way, by multiplying the
    // material colour. Normals mean nothing to a billboard — the shader
    // rewrites its vertices to face the camera — and they buy the ground
    // nothing either, when the lights are additive quads in their own pass.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(three, /new THREE\.MeshBasicMaterial\(\{/);
    assert.match(three, /Reactor3D\.MapScene\.prototype\.syncLights = function/);
    assert.match(three, /material\.__reactorBillboard = true;/);
    assert.match(three, /material\.__reactorShaded = true;/);
    assert.match(three, /material\.__reactorBillboard \|\| material\.__reactorShaded/);
});

//-----------------------------------------------------------------------------
// The budget

test('a street of lanterns is a street of lanterns', () => {
    // One `PointLight` per light does not survive a real map: three.js compiles
    // the light count into every material's shader, so a city overruns the
    // fragment uniform budget and the map draws nothing. Capping to fit is not
    // a fix either — twelve lights on a street of a hundred is not lighting.
    // Lights are drawn instead, so the budget is geometry rather than uniforms.
    assert.ok(Reactor3D.MAX_LIGHTS >= 256,
        `a map should not run out of lights at ${Reactor3D.MAX_LIGHTS}`);

    const many = [];
    for (let i = 0; i < 300; i++) many.push({ x: i % 40, y: Math.floor(i / 40), radius: 5 });
    assert.equal(Reactor3D.nearestLights(many, { x: 0, y: 0 }).length, 300,
        'all of them fit');
});

test('lights are geometry, not simulated lights', () => {
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    // Nothing per-light — and, since the ambient is a plain multiplier on the
    // material colour, no three light of any kind.
    assert.doesNotMatch(three, /new THREE\.AmbientLight/);
    assert.doesNotMatch(three, /new THREE\.PointLight/,
        'a light per lantern is what broke the shader');
    assert.doesNotMatch(three, /new THREE\.SpotLight/);

    // All of one shape share a mesh, so a hundred lights is one draw call.
    assert.match(three, /Reactor3D\.MapScene\.prototype\.lightPool = function/);
    assert.match(three, /this\.lightGroup\(\)\.add\(mesh\)/,
        'lights are their own pass, not mixed with the trees');
    assert.match(three, /blending: THREE\.AdditiveBlending/, 'light adds');
    assert.match(three, /depthWrite: false/, 'and two pools do not punch holes');
    assert.match(three, /mesh\.frustumCulled = false/, 'the buffer is rewritten each frame');
    assert.match(three, /setDrawRange\(0, pool\.count \* 6\)/,
        'only the used part is drawn, so no allocation per frame');

    // The discs are generated, so a project ships no extra art.
    assert.match(three, /Reactor3D\.roundLightTexture = function/);
    assert.match(three, /Reactor3D\.coneLightTexture = function/);
});

test('a light that cannot reach the player is not drawn', () => {
    const lights = [
        { x: 100, y: 100, radius: 4 },   // far away
        { x: 1, y: 1, radius: 4 },       // right here
        { x: 60, y: 0, radius: 4 },      // out of reach
        { x: 3, y: 0, radius: 4 }
    ];
    // Under the cap, the list is passed through untouched: culling a light that
    // fits costs a sort and buys nothing.
    assert.equal(Reactor3D.nearestLights(lights, { x: 0, y: 0 }).length, 4);

    const crowd = lights.slice();
    for (let i = 0; i < Reactor3D.MAX_LIGHTS + 40; i++) {
        crowd.push({ x: 200 + i, y: 200, radius: 2 });
    }
    const carried = Reactor3D.nearestLights(crowd, { x: 0, y: 0 });
    assert.equal(carried.length, 2, 'only the two within reach survive');
    assert.deepEqual(carried.map(l => l.x), [1, 3], 'nearest first');
});

test('with nowhere to look from, the cap still holds', () => {
    // A frame before the player exists cannot rank anything, so it takes what
    // fits rather than everything.
    const many = [];
    for (let i = 0; i < Reactor3D.MAX_LIGHTS + 100; i++) many.push({ x: i, y: 0, radius: 5 });
    assert.equal(Reactor3D.nearestLights(many, null).length, Reactor3D.MAX_LIGHTS);
});

test('the scene is told where to spend the budget', () => {
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /state\.scene\.syncLights\(focus\)/);
    assert.match(sprites, /\$gamePlayer\._realX, y: \$gamePlayer\._realY/);
});

test('a cone shines out of its source, not into it', () => {
    // `CanvasTexture` flips V by default, which would put the wide end of the
    // beam where the torch is and the source out at the far wall.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(three, /_roundLight\.flipY = false;/);
    assert.match(three, /_coneLight\.flipY = false;/);

    // The near corner of the cone takes the bottom of the picture, which is
    // where it was drawn from; a round pool still takes the whole square.
    const at = three.indexOf('Reactor3D.MapScene.prototype.syncLights = function');
    const body = three.slice(at, three.indexOf('\n};', at));
    assert.match(body, /\[\[0, 0\], \[1, 0\], \[0\.5, 1\], \[0\.5, 1\]\]/);
    assert.match(body, /\[\[0, 0\], \[1, 0\], \[1, 1\], \[0, 1\]\]/);
    assert.match(body, /const tipU = alongU \* radius/, 'the far edge is a radius away');
});

test('light is added to the scene, not painted over it', () => {
    // Three passes, not two. The star-flagged tiles are composited by covering,
    // because a tree hides what is behind it; light covers nothing. Sharing one
    // pass blended a lantern as a pale disc painted on the ground rather than
    // as light falling on it — dim and oddly solid at once.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = three.indexOf('Reactor3D.MapScene.prototype.setPass = function');
    const body = three.slice(at, three.indexOf('\n};', at));
    assert.match(body, /this\._lightGroup\.visible = which === "lights"/,
        'the light pass is never drawn with the others');

    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /sprite\.blendMode = modes && modes\.ADD !== undefined \? modes\.ADD : "add"/,
        'and it is composited additively');
    assert.match(sprites, /renderPass\(state\.scene, "lights", "lights"\)/);

    // Drawn last, over everything else.
    const below = sprites.indexOf('this.updateReactor3DTexture(this._reactor3dBelow');
    const lights = sprites.indexOf('renderPass(state.scene, "lights", "lights")');
    assert.ok(lights > below, 'after the ground');

    // And only built when the map is lit: an additive full-screen sprite is
    // not free.
    assert.match(sprites, /this\._reactor3dLights = Reactor3D\.wantsLights3D\(\$dataMap\)/);
});

test('the strength of a light is one number', () => {
    // A plugin's alphas were chosen against a flat overlay multiplied into a
    // dark screen, which is a different thing from a pool added to a lit one.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(three, /Reactor3D\.LIGHT_GAIN = /);
    assert.match(three, /\* Reactor3D\.LIGHT_GAIN;/);
    assert.ok(Reactor3D.LIGHT_GAIN > 0);
});

//-----------------------------------------------------------------------------
// Where each pass sits

test('the star pass replaces the tilemap layer it stands in for', () => {
    // It is the tilemap's own upper layer in 3D form, so it belongs where that
    // layer was: inside the tilemap, above the characters, below everything a
    // plugin hangs off the spriteset. As a sibling of the tilemap it floated
    // over fog and weather that ought to cover it.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /make\(this\._tilemap, this\._tilemap\.children\.length, "above"\)/);
});

test('lights stay the last thing drawn, however late a plugin adds a layer', () => {
    // Plugins add fog, weather and overlays long after the spriteset is built,
    // and each lands on top of what is there. Light is the one thing that
    // belongs over all of it.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /Spriteset_Map\.prototype\.keepReactor3DLightsOnTop = function/);
    assert.match(sprites, /if \(parent\.children\[last\] !== sprite\) parent\.setChildIndex\(sprite, last\)/,
        'and only moved when something got above it');
    // On the spriteset, not the base sprite: the screen tone must not dim the
    // lights along with the world.
    assert.match(sprites, /make\(this, this\.children\.length, "lights"\)/);
});

test('a colour keeps its hue however bright the light is', () => {
    // Clamping happens per channel, so a colour with one channel over full
    // loses that channel's lead and the light drifts to white.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(three, /const peak = Math\.max\(r, g, b\);/);
    assert.match(three, /if \(peak > 1\) \{ r \/= peak; g \/= peak; b \/= peak; \}/);
    assert.equal(Reactor3D.LIGHT_GAIN, 1, 'and gain does not push it there by default');
});

/** Run the cone texture and hand back the alpha channel it painted. */
function coneAlpha() {
    delete Reactor3D._coneLight;
    let painted = null;
    const canvas = {
        width: 0, height: 0,
        getContext: () => ({
            createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: image => { painted = image; }
        })
    };
    withGlobals({
        document: { createElement: () => canvas },
        THREE: { CanvasTexture: function() { this.flipY = true; } }
    }, () => Reactor3D.coneLightTexture());
    delete Reactor3D._coneLight;

    const size = painted.width;
    const alphaAt = (u, v) => painted.data[((Math.floor(v * (size - 1)) * size)
        + Math.floor(u * (size - 1))) * 4 + 3];
    // The quad gives the near corners v = 1, so v = 1 is the torch.
    return { size, alphaAt, atSource: u => alphaAt(u, 1), atTip: u => alphaAt(u, 0) };
}

test('the beam is brightest at the torch and fades along its length', () => {
    // The quad this is painted on is *already* the cone — a trapezoid opening
    // away from the torch. The picture drew a second wedge inside it, and the
    // two multiplied into a pinched triangle that was fully transparent at the
    // one place a light definitely comes from.
    const cone = coneAlpha();
    assert.ok(cone.atSource(0.5) > 200, `the torch end is lit (${cone.atSource(0.5)})`);
    assert.ok(cone.atTip(0.5) < 40, `and it has faded out by the far end (${cone.atTip(0.5)})`);

    // Monotonic along the axis, so there is no bright band floating in mid-air.
    let previous = Infinity;
    for (let v = 1; v >= 0; v -= 0.1) {
        const here = cone.alphaAt(0.5, v);
        assert.ok(here <= previous + 1, `alpha rose again at v=${v.toFixed(1)}`);
        previous = here;
    }
});

test('the beam is soft at the rim rather than a cut-out triangle', () => {
    const cone = coneAlpha();
    const axis = cone.alphaAt(0.5, 0.75);
    const middle = cone.alphaAt(0.75, 0.75);
    const rim = cone.alphaAt(0.99, 0.75);
    assert.ok(axis > middle && middle > rim, `${axis} > ${middle} > ${rim}`);
    assert.ok(rim < 20, 'and it reaches nothing at the edge');
});

test('a plugin that does not say how wide its cone is gets a beam, not a line', () => {
    assert.ok(Reactor3D.DEFAULT_CONE_ANGLE >= 60,
        `${Reactor3D.DEFAULT_CONE_ANGLE} degrees is a line, not a beam`);
});

test('a pool sits where the thing casting it stands', () => {
    // On the ground, the southern edge of the cell, like every other standing
    // thing. On a wall, the wall — a neon sign's glow placed by the ground
    // alone lit the pavement while the sign it comes from had been stood
    // several tiles up and a couple further back, and the two slid apart as
    // the camera panned.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(three, /const cz = \(facade \? facade\.z : light\.y \+ 1\) \+ up\.z \* lift;/);
    assert.match(three, /const lift = facade \? facade\.lift : 0;/,
        'and it travels up the wall the way the courses were stacked');
    assert.match(three, /const facade = Reactor3D\.facadeAt\(Math\.round\(light\.x\), Math\.round\(light\.y\)\);/);
    assert.match(three, /\? light\.groundY\n\s*: \(facade \? facade\.height/,
        'and a plugin that states a height still wins');
});

test('a sprite gets smaller the further away it stands', () => {
    // Measuring the projection of a world-*vertical* segment is the natural
    // way to size a sprite and the wrong one: a pitched camera foreshortens
    // such a segment, and that foreshortening eases with distance at almost
    // exactly the rate perspective shrinks it. The two cancelled, every sprite
    // came out the same size wherever it stood, and the map was in perspective
    // while the people on it were not. A billboard turns to face the camera and
    // is never foreshortened, so its size is the plain perspective divide.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = three.indexOf('Reactor3D.screenScaleAt = function');
    const body = three.slice(at, three.indexOf('\n};', at));

    assert.match(body, /\.dot\(forward\)/, 'depth along the view, not straight-line distance');
    assert.match(body, /height \/ \(2 \* depth \* Math\.tan\(fov \/ 2\)\)/);
    assert.doesNotMatch(body, /projectToScreen\(camera, x, y \+ 1, z\)/,
        'the vertical-segment measure is what cancelled itself out');

    // Guard the property rather than the arithmetic: halving the depth should
    // double the size, whatever the camera happens to be.
    const fake = {
        fov: 30,
        quaternion: {},
        position: { x: 0, y: 0, z: 0 }
    };
    // A stand-in for three's vector maths, so this runs without a renderer.
    const realTHREE = global.THREE;
    global.THREE = { Vector3: function (x, y, z) {
        this.x = x; this.y = y; this.z = z;
        this.applyQuaternion = () => this;
        this.sub = other => { this.x -= other.x; this.y -= other.y; this.z -= other.z; return this; };
        this.dot = () => -this.z;     // forward is -z
    } };
    const realGraphics = global.Graphics;
    const realMap = global.$gameMap;
    global.Graphics = { height: 720 };
    global.$gameMap = { tileHeight: () => 48 };
    try {
        const near = Reactor3D.screenScaleAt(fake, 0, 0, -10);
        const far = Reactor3D.screenScaleAt(fake, 0, 0, -20);
        assert.ok(Math.abs(near / far - 2) < 1e-6,
            `twice the depth should be half the size, got ${near} and ${far}`);
    } finally {
        global.THREE = realTHREE;
        global.Graphics = realGraphics;
        global.$gameMap = realMap;
    }
});

test('a Nova flashlight is the size of the cone Nova drew', () => {
    // Neither `scale` nor the bitmap alone says how big the beam is:
    // `Sprite_Light.refresh` draws it at `scale.x / bitmap.resolution` times
    // the bitmap. Reading only `scale` gave a beam built from the 512 fallback
    // Nova leaves in `radius` for cones; reading only the bitmap dropped the
    // factor and gave a needle.
    const lights = withGlobals({
        $gameMap: gameMap,
        Anisoft: { Nova: { LightManager: { currentMapLights: () => [
            { type: 'flashlight', position: { x: 0, y: 0 }, scale: { x: 512 },
              bitmap: { width: 44, height: 82.5, resolution: 64 }, active: true }
        ] } } }
    }, () => Reactor3D.LightShims.nova());

    assert.equal(lights.length, 1);
    const torch = lights[0];
    // Nova draws the bitmap at `scale / bitmap.resolution` — 512/64, an eight
    // times factor. Dropping it left a stock torch as a two-tile needle.
    assert.equal(Math.round(torch.radius * 100) / 100, 13.75);
    assert.ok(torch.angle > 25 && torch.angle < 35, `got ${torch.angle} degrees`);
});

test('a flashlight with no bitmap still gets a beam', () => {
    const lights = withGlobals({
        $gameMap: gameMap,
        Anisoft: { Nova: { LightManager: { currentMapLights: () => [
            { type: 'flashlight', position: { x: 0, y: 0 }, scale: { x: 512 }, active: true }
        ] } } }
    }, () => Reactor3D.LightShims.nova());
    assert.equal(lights[0].radius, Reactor3D.DEFAULT_CONE_LENGTH);
    assert.equal(lights[0].angle, Reactor3D.DEFAULT_CONE_ANGLE);
});

test('a round light still reads its radius from scale', () => {
    // Only the cone case was wrong; a lamp's scale really is its radius.
    const lights = withGlobals({
        $gameMap: gameMap,
        Anisoft: { Nova: { LightManager: { currentMapLights: () => [
            { type: 'light', position: { x: 0, y: 0 }, scale: { x: 240 }, active: true }
        ] } } }
    }, () => Reactor3D.LightShims.nova());
    assert.equal(lights[0].radius, 5);
    assert.equal(lights[0].angle, undefined, 'and asks for no spread');
});

//-----------------------------------------------------------------------------
// Framing

test('the camera frames about as much map as the flat view does', () => {
    // A fixed distance of 12 was roughly half this: the map arrived at twice
    // its flat size, which showed a quarter of the world, upscaled every
    // sprite past the resolution its art was painted at, and made every light
    // look twice the size its author drew it.
    const at = (height, tile, fov) => withGlobals({
        Graphics: { height },
        $gameMap: { tileHeight: () => tile, tileWidth: () => tile }
    }, () => Reactor3D.defaultCameraDistance({ fov }));

    const base = at(624, 48, 30);
    assert.ok(base > 20 && base < 30, `${base} is not a flat-sized frame`);

    // Derived, not tuned: it has to move with every term it depends on.
    assert.ok(at(624, 48, 45) < base, 'a wider lens sits closer');
    assert.ok(at(1080, 48, 30) > base, 'a taller screen sees more, so sits further');
    assert.ok(at(624, 32, 30) > base, 'smaller tiles mean more of them in shot');
});

test('a map that states a distance keeps it', () => {
    const camera = { fov: 30, position: { set() {} }, lookAt() {}, updateMatrixWorld() {} };
    let placed = null;
    camera.position.set = (x, y, z) => { placed = { x, y, z }; };
    withGlobals({ Graphics: { height: 624 }, $gameMap: { tileHeight: () => 48 } }, () => {
        Reactor3D.aimCamera(camera, { x: 0, y: 0, z: 0 }, { distance: 8, pitch: 90 });
    });
    assert.ok(Math.abs(placed.y - 8) < 0.001, `authored distance ignored (${placed.y})`);
});

test('a cone is a triangle, so its picture has no seam to show', () => {
    // As a trapezoid the quad split into two triangles whose UVs interpolate
    // independently, and the crease along that diagonal read as a bright slit
    // straight up the middle of the beam.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    // Corners are in the billboard's own plane now, so the source is its
    // origin rather than a world position.
    assert.match(three, /\[0, 0\],\s*\n\s*\[0, 0\]/,
        'both near corners sit on the source');
    assert.match(three, /\[0\.5, 1\], \[0\.5, 1\]/,
        'and both take the middle of the source edge');
});

test('nothing occludes a light', () => {
    // A doorway standing between a lamp and its own pool sliced a bite out of
    // it; depth-testing light is wrong for a view whose ground is 3D and whose
    // people are flat.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = three.indexOf('Reactor3D.MapScene.prototype.lightPool = function');
    const body = three.slice(at, three.indexOf('\n};', at));
    assert.match(body, /depthTest: false/);
    assert.doesNotMatch(body, /polygonOffsetFactor/,
        'and the coplanar flicker it used to guard against cannot happen now');
});

test('a beam arrives at nothing rather than at an edge', () => {
    // `1 - across^2` still meets the rim at a slope, and against a dark map a
    // slope reads as an edge: the beam looked like a cut-out triangle rather
    // than light. A raised cosine lands on zero with zero slope.
    const cone = coneAlpha();
    const gradient = [];
    for (let u = 0.5; u <= 1.0001; u += 0.05) gradient.push(cone.alphaAt(u, 0.75));

    // The last step before the rim has to be small — that is what "soft" means.
    const lastStep = Math.abs(gradient[gradient.length - 1] - gradient[gradient.length - 2]);
    assert.ok(lastStep < 8, `the rim falls off a cliff of ${lastStep}`);
    // And the same along the beam's length, at its far end.
    const alongEnd = Math.abs(cone.alphaAt(0.5, 0.05) - cone.alphaAt(0.5, 0));
    assert.ok(alongEnd < 8, `the far end stops dead (${alongEnd})`);
});

test('the ground is not shaded by three, it is multiplied by the ambient', () => {
    // Lambert under an AmbientLight came out visibly darker than the same map
    // in 2D: three divides diffuse by pi, so "ambient 1" is nowhere near
    // "unlit", and the factor moves between releases. Nothing here needs a
    // light model — the lights are additive quads in a pass of their own.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.doesNotMatch(three, /MeshLambertMaterial/);
    assert.doesNotMatch(three, /new THREE\.AmbientLight/);
    assert.match(three, /material\.color\.setRGB\(r, g, b\)/);
});

test('a cut-out is blended at the alpha it was painted at', () => {
    // A tileset paints soft edges — the shadow beside a column sits at 50-60%
    // alpha in the art — and cutting them draws every texel that survives at
    // full strength, so the shadow came out solid. It was never being
    // discarded; it was being promoted.
    //
    // Coverage was the previous answer and only approximates: the mask has one
    // bit per multisample, so alpha quantises to the sample count and 55% lands
    // on 50%. Blending is exact — but blending alone emptied the map, because a
    // transparent mesh goes into three.js's sorted pass, which orders per mesh
    // by centroid while still writing depth, and a centroid says nothing about
    // a mesh spanning the whole map.
    //
    // The opaque-core pass settles that at the root: fully opaque texels write
    // their colour and depth together before fractional alpha is blended.
    const source = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const material = source.slice(source.indexOf('Reactor3D.billboardMaterial = function'));
    const body = material.slice(0, material.indexOf('material.onBeforeCompile'));

    assert.match(body, /transparent: true/, 'alpha reaches the framebuffer as painted');
    assert.match(body, /depthWrite: false/, 'and a blended fragment does not add to depth');
    assert.match(body, /alphaTest: 0,/,
        'nothing is cut here — the halo is drawn at the fraction it was painted at');
    assert.match(material, /footwardScale = \{ value: edgeHinged \? 0 : 1 \}/,
        'a declared flat-row hinge is not shifted into its own footing');

    assert.match(source, /opaqueCore\.colorWrite = true;/,
        'the core cannot hide the destination without supplying its own colour');
    assert.match(source, /opaqueCore\.alphaTest = 1\.0;/,
        'only genuinely opaque texels own depth');
    assert.match(source, /coreMesh\.renderOrder = -20 \+ \(group\.layer \|\| 0\);/,
        'opaque cores retain source-layer order');
});

test('flat shadows blend over a colour-bearing opaque core', () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const material = source.slice(source.indexOf(': new THREE.MeshBasicMaterial({'),
        source.indexOf('const target =', source.indexOf(': new THREE.MeshBasicMaterial({')));

    assert.match(material, /transparent: true/);
    assert.match(material, /depthWrite: false/);
    assert.match(material, /alphaTest: 0,/,
        'the colour pass does not cut partially transparent footing shadows');
    assert.match(source, /const opaqueCore = group\.billboard[\s\S]*new THREE\.MeshBasicMaterial/,
        'flat geometry receives the same opaque colour core as billboards');
    assert.doesNotMatch(source, /colorWrite = false/,
        'no colorless prepass may punch the destination out from under a shadow');
});

test('multi-cell foliage gap fill stays faint and owns no opaque depth', () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(source, /material\.opacity = group\.underlay \? 0\.6 : 1/);
    assert.match(source, /opaqueCore\.opacity = group\.underlay \? 0\.6 : 1/,
        'the exact-opaque core rejects every underlay texel');
});
