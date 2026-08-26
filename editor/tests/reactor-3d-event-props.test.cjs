/**
 * Events that place a tile are part of the world.
 *
 * A door, a sign, a chest, a barrel: an author stands most of these up as an
 * event with a tile graphic, not by painting a layer. The scene is built from
 * the map's tile data, which those tiles are not in, so they stayed flat while
 * the identical tile painted one cell over stood up. This is that gap closed —
 * a classified event tile is written into the map the builder sees, so it
 * becomes the same geometry a painted one would.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

const PLANES = 6;
const DOOR = 40;          // a B-sheet prop
const FLOOR = 2816;       // A2
const TILESET = 7;

function emptyMap(width, height) {
    return { width, height, data: new Array(width * height * PLANES).fill(0), events: [null] };
}

function event(id, x, y, tileId, extra = {}) {
    return { id, x, y, pages: [Object.assign({ image: { tileId }, moveType: 0 }, extra)] };
}

function classify(tileId, kind) {
    Reactor3D.setClassification({
        version: 1,
        tilesets: { [TILESET]: { [Reactor3D.classKey(tileId)]: kind } }
    });
}

test.beforeEach(() => Reactor3D.setClassification(Reactor3D.createClassification()));
test.after(() => Reactor3D.setClassification(Reactor3D.createClassification()));

test('a classified event tile is written into the map the builder sees', () => {
    classify(DOOR, Reactor3D.CLASS_UPRIGHT);
    const map = emptyMap(4, 4);
    map.data[0] = FLOOR;                        // ground under the door
    map.events.push(event(1, 2, 1, DOOR));

    const merged = Reactor3D.mapWithEventTiles(map, TILESET);
    const cell = 1 * 4 + 2;
    assert.equal(merged.data[cell], DOOR, 'the door stands where the event is');
    assert.ok(Reactor3D.isEventProp(1), 'and the flat sprite stands down for it');
});

test('the map the rest of the engine sees is never touched', () => {
    classify(DOOR, Reactor3D.CLASS_UPRIGHT);
    const map = emptyMap(4, 4);
    map.events.push(event(1, 2, 1, DOOR));
    const before = map.data.slice();

    const merged = Reactor3D.mapWithEventTiles(map, TILESET);
    assert.notEqual(merged, map, 'a copy, so plugins and save data see the real map');
    assert.deepEqual(map.data, before);
    assert.equal(map.width, merged.width);
});

test('an unclassified tile is left as the sprite it always was', () => {
    // Nothing here can quietly change how an existing map looks: silence from
    // the author means the old behaviour.
    const map = emptyMap(4, 4);
    map.events.push(event(1, 2, 1, DOOR));

    const merged = Reactor3D.mapWithEventTiles(map, TILESET);
    assert.equal(merged, map, 'no copy is even made');
    assert.equal(Reactor3D.isEventProp(1), false);
});

test('a tile classified as ground stays on the floor as a sprite', () => {
    classify(DOOR, Reactor3D.CLASS_GROUND);
    const map = emptyMap(4, 4);
    map.events.push(event(1, 2, 1, DOOR));
    assert.equal(Reactor3D.mapWithEventTiles(map, TILESET), map);
    assert.equal(Reactor3D.isEventProp(1), false);
});

test('an event that moves keeps its sprite', () => {
    // A prop is baked in at build time and cannot follow anything around, so a
    // walking event would leave its 3D self behind and travel invisibly.
    classify(DOOR, Reactor3D.CLASS_UPRIGHT);
    const map = emptyMap(4, 4);
    map.events.push(event(1, 2, 1, DOOR, { moveType: 1 }));

    assert.equal(Reactor3D.mapWithEventTiles(map, TILESET), map);
    assert.equal(Reactor3D.isEventProp(1), false);
});

test('a prop never overwrites painted art', () => {
    classify(DOOR, Reactor3D.CLASS_UPRIGHT);
    const map = emptyMap(4, 4);
    const cell = 1 * 4 + 2;
    const plane = 16;
    for (let z = 0; z < 4; z++) map.data[z * plane + cell] = FLOOR;
    map.events.push(event(1, 2, 1, DOOR));

    const merged = Reactor3D.mapWithEventTiles(map, TILESET);
    for (let z = 0; z < 4; z++) {
        assert.equal(merged.data[z * plane + cell], FLOOR, `layer ${z} survives`);
    }
    assert.equal(Reactor3D.isEventProp(1), false, 'and the sprite is not hidden either');
});

test('an event off the edge of the map is ignored', () => {
    classify(DOOR, Reactor3D.CLASS_UPRIGHT);
    const map = emptyMap(4, 4);
    map.events.push(event(1, 9, 9, DOOR));
    assert.equal(Reactor3D.isEventProp(1), false);
    assert.doesNotThrow(() => Reactor3D.mapWithEventTiles(map, TILESET));
});

test('the claim is cleared when a map has no props', () => {
    // Otherwise a door on one map hides an unrelated event on the next.
    classify(DOOR, Reactor3D.CLASS_UPRIGHT);
    const withProp = emptyMap(4, 4);
    withProp.events.push(event(1, 2, 1, DOOR));
    Reactor3D.mapWithEventTiles(withProp, TILESET);
    assert.ok(Reactor3D.isEventProp(1));

    Reactor3D.mapWithEventTiles(emptyMap(4, 4), TILESET);
    assert.equal(Reactor3D.isEventProp(1), false);
});

//-----------------------------------------------------------------------------
// Standing on what was built

test('a cell reports the surface that was built on it, not the bare ground', () => {
    // What the *builder* stood geometry on: elevation plus scenery lift, roof
    // lift and foliage lift. This is what a light on a tower roof is placed
    // at. It is deliberately NOT what a character is placed at — projecting
    // people onto it hoisted everyone standing on a cell whose art rises.
    Reactor3D._surface = { width: 4, height: 4, heights: new Float32Array(16) };
    Reactor3D._surface.heights[1 * 4 + 2] = 3;

    const map = emptyMap(4, 4);
    assert.equal(Reactor3D.surfaceHeightAt(map, 2, 1), 3, 'the roof');
    assert.equal(Reactor3D.surfaceHeightAt(map, 0, 0), 0, 'the street');
    Reactor3D._surface = null;
});

test('with no scene built it falls back to plain elevation', () => {
    Reactor3D._surface = null;
    const map = emptyMap(4, 4);
    map.reactor3d = { elevation: new Array(16).fill(0) };
    map.reactor3d.elevation[5] = 2;
    assert.equal(Reactor3D.surfaceHeightAt(map, 1, 1), 2);
});

test('a cell outside the built surface does not read past the buffer', () => {
    Reactor3D._surface = { width: 4, height: 4, heights: new Float32Array(16) };
    const map = emptyMap(4, 4);
    assert.equal(Reactor3D.surfaceHeightAt(map, 99, 99), 0);
    assert.equal(Reactor3D.surfaceHeightAt(map, -1, -1), 0);
    Reactor3D._surface = null;
});

test('the build hands back the surface it settled on', () => {
    const map = emptyMap(3, 3);
    map.data[0] = FLOOR;
    const built = Reactor3D.Geometry.build(map, { tileSize: 48 });
    assert.equal(built.width, 3);
    assert.equal(built.height, 3);
    assert.equal(built.surface.length, 9);
});

//-----------------------------------------------------------------------------
// Occlusion

test('star-flagged standing art still draws over characters', () => {
    // A streetlight the author classified as 3D used to be a star-flagged
    // sprite you walked behind. Built into the scene it went to the ground
    // pass, where nothing can ever occlude a character drawn over it — so you
    // walked in front of every statue and lamp post on the map.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const calls = three.match(/groupFor\([^)]*\)/g) || [];
    const unrouted = calls.filter(call => call.split(',').length < 3);
    assert.deepEqual(unrouted.map(c => c.trim()), [],
        'every primitive names its tilemap pass explicitly');
});

test('a character stands on the ground, not on what was built there', () => {
    // Lights take the built surface, so a searchlight on a tower roof is drawn
    // on the roof. Characters must not: the surface includes the lift under
    // scenery and roofs, and projecting people onto it dragged every one of
    // them off the cell they were standing on.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    const objects = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
    assert.doesNotMatch(sprites, /const ground = Reactor3D\.surfaceHeightAt/);
    assert.doesNotMatch(sprites, /const focusHeight = Reactor3D\.surfaceHeightAt/);
    assert.doesNotMatch(objects, /Reactor3D\.surfaceHeightAt/);

    // A sprite asks where it is standing, which is not always its own cell:
    // a cell whose art was stood into a wall has moved onto that wall, and a
    // sign hanging on it has to move with it.
    assert.match(sprites, /Reactor3D\.standingPlaceFor\(character\)/);
    // Everything that wants to sit against the art goes through one resolver,
    // because the lift runs along the billboard's up axis rather than the
    // world's and nothing may work that out for itself.
    assert.match(sprites, /Reactor3D\.pointOf\(camera, gx \+ 0\.5, stand\)/);
    assert.match(sprites, /projectToScreen\(camera, at\.x, at\.y, at\.z\)/);
    // And where the sprite is drawn is where `screenX`/`screenY` say it is,
    // or every plugin that places an overlay on a character draws it somewhere
    // the character is not.
    assert.match(objects, /const ground = Reactor3D\.elevationAt\(/);
});

test('the above pass says where it sorts to', () => {
    // The tilemap re-sorts its children by `z` every frame, so the index the
    // pass was added at means nothing: with no `z` it sorted as 0, under every
    // character at 3, and you walked in front of everything it contained.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /this\._reactor3dAbove\.sprite\.z = 4;/);

    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    assert.match(core, /Tilemap\.prototype\._compareChildOrder = function\(a, b\) \{/,
        'the sort this has to survive');
    assert.match(core, /const az = a\.z \|\| 0;/, 'and an absent z really does read as 0');
});

test('the camera is aimed before anything projects through it', () => {
    // Character sprites place themselves during the child update; the 3D world
    // is rendered from the camera afterwards. Aiming in between left the two a
    // frame apart — invisible standing still, and a visible slide while
    // walking, worst for whatever was furthest from the focus, because
    // perspective moves a distant point further per unit of camera travel.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    const at = sprites.indexOf('Spriteset_Map.prototype.update = function() {');
    const body = sprites.slice(at, sprites.indexOf('\n};', at));

    const aim = body.indexOf('this.updateReactor3DCamera();');
    const children = body.indexOf('Spriteset_Base.prototype.update.call(this);');
    const render = body.indexOf('this.updateReactor3D();');
    assert.ok(aim > -1, 'the camera is aimed in this method');
    assert.ok(aim < children, 'before the sprites that project through it');
    assert.ok(children < render, 'and the world is rendered after both');
});

//-----------------------------------------------------------------------------
// Standing on the same plane as the art

test('a sprite is scaled onto the quad a 3D object would occupy', () => {
    // A declared 3D object is a billboard, and `billboardMaterial` builds its
    // quad on two specific axes: the camera's right, and — while
    // BILLBOARD_TILT is 0 — world up. A sprite standing in for one has to
    // occupy exactly that, or it is a different size from the standing art
    // beside it and the gap moves as the view moves.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = three.indexOf('Reactor3D.standScaleAt = function');
    const body = three.slice(at, three.indexOf('\n};', at));
    assert.match(body, /\.set\(1, 0, 0\)\.applyQuaternion\(camera\.quaternion\)/,
        "the camera's right axis, as the shader uses");
    assert.match(body, /const up = this\.billboardUp\(camera\);/,
        'and the same up axis the geometry is stacked on');
    const axis = three.indexOf('Reactor3D.billboardUp = function');
    assert.match(three.slice(axis, three.indexOf('\n};', axis)), /Reactor3D\.BILLBOARD_TILT|this\.BILLBOARD_TILT/,
        'leaning with the shader if that changes');
    // Straight-line screen distance: the world axes only line up with the
    // screen's while yaw is zero, and a rotated view would otherwise report a
    // sprite as flat.
    assert.match(body, /Math\.hypot\(across\.x - base\.x, across\.y - base\.y\)/);
    assert.match(body, /Math\.hypot\(upX, upY\)/);
});

test('the two factors are separate, because one number cannot be both', () => {
    // A camera pitched over foreshortens the vertical axis and not the
    // horizontal, so a single uniform scale drew every sprite at full height
    // against art squashed to about six tenths.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /this\.scale\.x \*= stand\.x;/);
    assert.match(sprites, /this\.scale\.y \*= stand\.y;/);
    // Taken back off the same way, or a plugin's own scaling compounds.
    assert.match(sprites, /this\.scale\.x \/= was\.x;/);
    assert.match(sprites, /this\.scale\.y \/= was\.y;/);
});

test('a sprite leans as a parallelogram, not a turned rectangle', () => {
    // A world-vertical line converges towards a vanishing point, so standing
    // art tilts and an axis-aligned sprite did not: the top of a tall sign sat
    // sideways of where it belonged, swinging about as the camera moved. The
    // feet were right all along.
    //
    // Turning the sprite is the wrong correction — it tilts *both* axes. A
    // billboard's bottom edge runs along the camera's right axis, which is
    // perpendicular to the view and stays level on screen; only the vertical
    // edges lean. Rotating lifted the ground line, so a row of characters
    // looked like it was walking up a slope.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = three.indexOf('Reactor3D.standScaleAt = function');
    const body = three.slice(at, three.indexOf('\n};', at));
    assert.match(body, /const skew = -Math\.atan2\(upX, -upY\);/);
    assert.match(body, /skew\n?\s*\};/);
    assert.match(body, /x: wideOnScreen \/ \(spanU \* tileWidth\)/,
        "measured across the thing's own size, not one tile multiplied");
    assert.match(body, /y: tallOnScreen \/ \(spanV \* tileHeight\)/);

    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /this\.skew\.x \+= stand\.skew;/);
    assert.match(sprites, /this\.skew\.x -= was\.skew;/,
        'and taken back off, or a plugin that skews a sprite compounds with it');
    assert.doesNotMatch(sprites, /this\.rotation \+= stand\./, 'a turn is not a parallelogram');
});

test('the shear keeps the ground line level and moves only the top', () => {
    // PIXI composes the transform as
    //     a =  cos(rotation + skew.y) * scale.x
    //     b =  sin(rotation + skew.y) * scale.x
    //     c = -sin(rotation - skew.x) * scale.y
    //     d =  cos(rotation - skew.x) * scale.y
    // so this checks that composition rather than trusting that `skew.x` means
    // what it is hoped to mean.
    const compose = (scaleX, scaleY, skewX) => ({
        a: scaleX, b: 0,
        c: -Math.sin(-skewX) * scaleY,
        d: Math.cos(-skewX) * scaleY
    });
    const apply = (m, x, y) => ({ x: m.a * x + m.c * y, y: m.b * x + m.d * y });

    const tall = 0.594;
    for (const degrees of [0, 10, 20, -20]) {
        const lean = (degrees * Math.PI) / 180;
        const m = compose(1, tall, -lean);
        // Anchor (0.5, 1): the feet are the origin, one tile up is (0, -48).
        const up = apply(m, 0, -48);
        const along = apply(m, 48, 0);

        assert.ok(Math.abs(Math.hypot(up.x, up.y) - 48 * tall) < 0.01,
            `height is the foreshortened one at ${degrees} degrees`);
        assert.ok(Math.abs(Math.atan2(up.x, -up.y) - lean) < 1e-9,
            `and it leans by exactly what was asked at ${degrees} degrees`);
        assert.ok(Math.abs(along.y) < 1e-9,
            `while the ground line stays level at ${degrees} degrees`);
    }
});

test('the lean is zero down the centre column and grows outwards', () => {
    // A stub camera looking straight down a column: the world up-axis projects
    // straight up the screen there and tilts either side of it.
    const project = (camera, x, y, z) => camera.project(x, y, z);
    const stub = {
        quaternion: {},
        // A pinhole at (0, 10, 10) looking at the origin, written out longhand
        // so the expectation does not depend on the code under test.
        project(x, y, z) {
            const dx = x - 0, dy = y - 10, dz = z - 10;
            const f = Math.SQRT1_2;              // 45 degrees down
            const right = [1, 0, 0], up = [0, f, -f], fwd = [0, -f, -f];
            const cx = dx * right[0] + dy * right[1] + dz * right[2];
            const cy = dx * up[0] + dy * up[1] + dz * up[2];
            const cz = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
            return { x: 400 + (cx / cz) * 400, y: 300 - (cy / cz) * 300 };
        }
    };
    const leanAt = x => {
        const base = project(stub, x, 0, 0);
        const above = project(stub, x, 1, 0);
        return Math.atan2(above.x - base.x, base.y - above.y);
    };
    assert.ok(Math.abs(leanAt(0)) < 1e-9, 'straight up the centre column');
    assert.ok(leanAt(5) > 0.05, 'leaning one way to the right');
    assert.ok(leanAt(-5) < -0.05, 'and the other way to the left');
    assert.ok(Math.abs(leanAt(10)) > Math.abs(leanAt(5)), 'and more the further out');
});

//-----------------------------------------------------------------------------
// How far a cut-out leans

test('cut-outs face the camera by default, so art keeps its proportions', () => {
    // Bolt upright is the honest choice and the wrong one for art drawn flat:
    // a pitched camera foreshortens a world-vertical plane to about six tenths,
    // so every character came out squat and every sign was drawn shorter than
    // it was painted. Square-on removes it, because a quad parallel to the
    // image plane projects to a plain scaled rectangle.
    assert.equal(Reactor3D.DEFAULT_BILLBOARD_TILT, 1);
    assert.equal(Reactor3D.billboardTiltFor(null), 1, 'a map that says nothing');
});

test('a map can ask for a tilt of its own', () => {
    assert.equal(Reactor3D.billboardTiltFor({ reactor3d: { billboardTilt: 0.5 } }), 0.5);
    assert.equal(Reactor3D.billboardTiltFor({ reactor3d: { billboardTilt: 0 } }), 0,
        'all the way back to upright');
    // Out of range or not a number cannot produce a shader uniform that means
    // nothing, or a quad that folds inside out.
    assert.equal(Reactor3D.billboardTiltFor({ reactor3d: { billboardTilt: 9 } }), 1);
    assert.equal(Reactor3D.billboardTiltFor({ reactor3d: { billboardTilt: -4 } }), 0);
    assert.equal(Reactor3D.billboardTiltFor({ reactor3d: { billboardTilt: 'x' } }), 1);
});

test('the props and the sprites read one number, so they cannot disagree', () => {
    // A cut-out and the sprite standing next to it have to lean by the same
    // amount or they are different shapes.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    // The shader bakes it in as a uniform when it compiles...
    assert.match(three, /shader\.uniforms\.tilt = \{ value: Reactor3D\.BILLBOARD_TILT \};/);
    // ...the sprite scaling reads the same field each frame, through the one
    // helper that owns the axis...
    const axis = three.indexOf('Reactor3D.billboardUp = function');
    assert.match(three.slice(axis, three.indexOf('\n};', axis)), /this\.BILLBOARD_TILT/);
    const at = three.indexOf('Reactor3D.standScaleAt = function');
    assert.match(three.slice(at, three.indexOf('\n};', at)), /this\.billboardUp\(camera\)/);
    // ...and the build sets it from the map before any material is made.
    const build = three.indexOf('Reactor3D.MapScene.prototype.build = function');
    const body = three.slice(build, three.indexOf('\n};', build));
    assert.match(body, /Reactor3D\.BILLBOARD_TILT = Reactor3D\.billboardTiltFor\(mapData\);/);
    assert.ok(body.indexOf('BILLBOARD_TILT') < body.indexOf('Reactor3D.Geometry.build'),
        'set before the geometry that compiles against it');
});

test('a prop is hidden where the hide will actually stick', () => {
    // `Sprite_Character.update` calls `updatePosition` and *then*
    // `updateVisibility`, so hiding while positioning was recomputed away a
    // moment later. The door was drawn twice — once as geometry standing in
    // the world, once as a flat sprite over it — and because the flat one
    // returned before it was ever placed, it kept whatever position it last
    // had and slid about the screen as the camera moved. Six of them on
    // Moletown looked exactly like sprites trailing the party.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');

    // The stock order this has to survive.
    const update = sprites.indexOf('Sprite_Character.prototype.update = function() {');
    assert.ok(update > -1);
    const body = sprites.slice(update, sprites.indexOf('\n};', update));
    assert.ok(body.indexOf('this.updatePosition();') < body.indexOf('this.updateVisibility();'),
        'visibility is settled after position, which is why the hide moved');

    // So the hide lives in updateVisibility, and nowhere else. The override
    // comes after the stock definition, so this looks for the last one.
    const hide = sprites.lastIndexOf('Sprite_Character.prototype.updateVisibility = function() {');
    assert.ok(hide > -1, 'updateVisibility is overridden');
    const hideBody = sprites.slice(hide, sprites.indexOf('\n};', hide));
    assert.match(hideBody, /Reactor3D\.isEventProp\(character\.eventId\(\)\)/);
    assert.match(hideBody, /this\.visible = false/);
    assert.match(hideBody, /this\._reactor3dBaseVisibility\(\);/, 'and the stock rules still run');

    // And positioning no longer bails out early, so nothing can go stale.
    const place = sprites.indexOf('Sprite_Character.prototype.updateReactor3DPosition = function() {');
    const placeBody = sprites.slice(place, sprites.indexOf('\n};', place));
    assert.doesNotMatch(placeBody, /isEventProp/,
        'a sprite that is never placed keeps the position it last had');
});
