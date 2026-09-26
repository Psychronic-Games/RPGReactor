// Controls (keys and buttons, jump on 3D maps) and physics (jump, gravity, falls).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');

function sandbox(system = {}, mapPhysics = null) {
    const context = { console, Math, JSON, Number, Object, Array, $dataSystem: system, $dataMap: { reactor3d: mapPhysics ? { physics: mapPhysics } : {} },
        Input: { keyMapper: { 13: 'ok', 32: 'ok', 90: 'ok', 27: 'escape' }, gamepadMapper: { 0: 'ok', 2: 'shift' } } };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('runtime/reactor_controls.js'), context);
    vm.runInContext(read('runtime/reactor_physics.js'), context);
    return context;
}

test('on a 3D map the jump keys jump, and leaving gives them back exactly; a player\'s own changes are kept', () => {
    const c = sandbox();
    c.ReactorControls.applyProject();
    assert.equal(c.Input.keyMapper[32], 'ok', 'no project controls: the stock map stands');
    c.Input.keyMapper[70] = 'ok';
    c.ReactorControls.setField3D(true);
    assert.equal(c.Input.keyMapper[32], 'jump');
    assert.equal(c.Input.gamepadMapper[2], 'jump');
    assert.equal(c.Input.keyMapper[90], 'ok', 'Z still confirms');
    c.ReactorControls.setField3D(false);
    assert.equal(c.Input.keyMapper[32], 'ok');
    assert.equal(c.Input.gamepadMapper[2], 'shift');
    assert.equal(c.Input.keyMapper[70], 'ok', 'a remap made in game survives');
    const off = sandbox({ reactorControls: { jump: false } });
    off.ReactorControls.setField3D(true);
    assert.equal(off.Input.keyMapper[32], 'ok', 'jumping off: Space stays confirm');
    const own = sandbox({ reactorControls: { keys: { 13: 'ok', 75: 'ok' }, gamepad: { 0: 'ok' }, jumpKeys: [74], jumpButtons: [] } });
    own.ReactorControls.applyProject();
    assert.deepEqual(Object.keys(own.Input.keyMapper).sort(), ['13', '75'], 'the project\'s keys are the game\'s');
    own.ReactorControls.setField3D(true);
    assert.equal(own.Input.keyMapper[74], 'jump');
});

test('a jump reaches its height under any gravity; the Moon only makes it last longer', () => {
    const run = gravity => {
        const c = sandbox({ reactorPhysics: { gravity, jumpHeight: 1.5 } });
        c.Reactor3D = { isMap3D: () => true, groundHeightAt: () => 0, TERRAIN_SLOPE_LIMIT: 0.75 };
        const who = { x: 0, y: 0, _realX: 0, _realY: 0, _reactorGround: 0 };
        c.ReactorPhysics.update(who);
        assert.equal(c.ReactorPhysics.jump(who), true);
        let peak = 0, frames = 0;
        do { c.ReactorPhysics.update(who); peak = Math.max(peak, who._reactorAir); frames++; } while (who._reactorAir > 0 && frames < 5000);
        return { peak, frames };
    };
    const earth = run(1), moon = run(0.166);
    assert.ok(Math.abs(earth.peak - 1.5) < 0.1, `earth peak ${earth.peak}`);
    assert.ok(Math.abs(moon.peak - 1.5) < 0.1, `moon peak ${moon.peak}`);
    assert.ok(moon.frames > earth.frames * 2.2, 'about √6 times longer');
});

test('down a step a walker keeps its footing; off a ledge it falls, and a long fall hurts when the map says so', () => {
    const c = sandbox({}, { fallDamage: true, fallFrom: 3, fallPercent: 10 });
    let ground = 0;
    c.Reactor3D = { isMap3D: () => true, groundHeightAt: () => ground, TERRAIN_SLOPE_LIMIT: 0.75 };
    const hurt = [];
    const player = { x: 0, y: 0, _realX: 0, _realY: 0, _reactorGround: 5 };
    c.$gamePlayer = player;
    c.$gameParty = { members: () => [{ isAlive: () => true, mhp: 100, gainHp: v => hurt.push(v) }], isAllDead: () => false };
    player._reactorAlt = 1; ground = 0;
    c.ReactorPhysics.update(player);
    assert.equal(player._reactorAir, 0, 'a one-level step is walked down, not fallen');
    player._reactorAlt = 8;
    c.ReactorPhysics.update(player);
    assert.ok(player._reactorAir > 7, 'off a ledge: in the air');
    for (let i = 0; i < 200 && player._reactorAir > 0; i++) c.ReactorPhysics.update(player);
    assert.equal(player._reactorAir, 0, 'landed');
    assert.deepEqual(hurt, [-50], 'fell 8, safe 3: five tiles at 10% of max HP');
});

test('deep water is swum: a fall in splashes and bobs up unhurt, a swimmer jumps out and climbs onto a low bank', () => {
    const c = sandbox({}, { fallDamage: true, fallFrom: 1, fallPercent: 10 });
    // A bank at 0 for x < 5, a pool floor at -6 beyond it, the surface at -1.
    let bank = 0;
    c.Reactor3D = { isMap3D: () => true, TERRAIN_SLOPE_LIMIT: 0.75, hasWater: () => true,
        groundHeightAt: (m, x) => (x < 5 ? bank : -6), waterLevelAt: (m, x) => (x >= 5 ? -1 : null) };
    const hurt = [];
    const player = { x: 5, y: 0, _realX: 5, _realY: 0, _reactorGround: 0, _reactorAlt: 0 };
    c.$gamePlayer = player;
    c.$gameParty = { members: () => [{ isAlive: () => true, mhp: 100, gainHp: v => hurt.push(v) }], isAllDead: () => false };
    let deepest = 0;
    for (let i = 0; i < 400; i++) { c.ReactorPhysics.update(player); deepest = Math.min(deepest, player._reactorAlt); }
    assert.ok(player._reactorSplash, 'splashed in');
    assert.ok(deepest < -3.3, `dipped under the float (${deepest})`);
    assert.ok(Math.abs(player._reactorAlt - -3.2) < 0.05, `floats 2.2 under the surface (${player._reactorAlt})`);
    assert.equal(c.ReactorPhysics.isSwimming(player), true);
    assert.equal(c.ReactorPhysics.isAirborne(player), false, 'a swimmer is not in the air');
    assert.deepEqual(hurt, [], 'water breaks a fall');
    assert.equal(c.ReactorPhysics.jump(player), true, 'a swimmer can jump');
    let peak = -10;
    for (let i = 0; i < 300; i++) { c.ReactorPhysics.update(player); peak = Math.max(peak, player._reactorAlt); }
    assert.ok(Math.abs(peak - 0.25) < 0.12, `the jump clears the surface by the jump height (${peak})`);
    assert.equal(c.ReactorPhysics.isSwimming(player), true, 'back in the water');
    // Onto a bank half a tile over the surface: climbed over a few frames.
    bank = -0.5; player._realX = 4; player.x = 4;
    c.ReactorPhysics.update(player);
    assert.ok(player._reactorAlt < -0.5 && player._reactorClimb, 'climbing, not teleported');
    for (let i = 0; i < 60; i++) c.ReactorPhysics.update(player);
    assert.equal(player._reactorAlt, -0.5);
    assert.equal(c.ReactorPhysics.isSwimming(player), false);
    // Swimming off keeps the old rule: the pool is the floor.
    const dry = sandbox({ reactorPhysics: { swim: false } });
    dry.Reactor3D = c.Reactor3D;
    assert.equal(dry.ReactorPhysics.floatHeight({}, 6, 0, -6), null);
});

test('a swimmer dives while Dash is held, holds its depth, rises with Jump, and never goes through the bottom', () => {
    const c = sandbox();
    c.Reactor3D = { isMap3D: () => true, TERRAIN_SLOPE_LIMIT: 0.75, hasWater: () => true, groundHeightAt: () => -6, waterLevelAt: () => -1 };
    const who = { x: 5, y: 0, _realX: 5, _realY: 0, _reactorGround: -6, _reactorAlt: -3.2, _reactorSwim: true };
    for (let i = 0; i < 60; i++) c.ReactorPhysics.update(who);
    for (let i = 0; i < 40; i++) { c.ReactorPhysics.steerDive(who, true, false); c.ReactorPhysics.update(who); }
    for (let i = 0; i < 200; i++) c.ReactorPhysics.update(who);
    assert.ok(Math.abs(who._reactorAlt - (-3.2 - 2)) < 0.05, `held at two tiles down (${who._reactorAlt})`);
    assert.equal(c.ReactorPhysics.isUnderwater(who), true);
    assert.equal(c.ReactorPhysics.jump(who), false, 'no leap from under the surface');
    for (let i = 0; i < 400; i++) { c.ReactorPhysics.steerDive(who, true, false); c.ReactorPhysics.update(who); }
    assert.ok(who._reactorAlt >= -6 + 0.3 - 0.05, `stops above the bottom (${who._reactorAlt})`);
    for (let i = 0; i < 400; i++) { c.ReactorPhysics.steerDive(who, false, true); c.ReactorPhysics.update(who); }
    assert.ok(Math.abs(who._reactorAlt - -3.2) < 0.05 && who._reactorDive === 0, 'back at the surface');
    assert.equal(c.ReactorPhysics.jump(who), true, 'and leaps out from there');
});

test('water is a volume: lit materials and the sky dim through it, per scene, and the sheet itself is exempt', () => {
    const lighting = read('runtime/reactor_3d_lighting.js'), core = read('runtime/reactor_3d.js'), world = read('runtime/reactor_3d_world.js');
    assert.match(lighting, /Reactor3D\.injectWaterVolume\(this, shader\);\n    \};/);
    assert.match(lighting, /material && material\.__reactorWater\) \|\|/);
    assert.match(core, /if \(this\.useSceneWater\) this\.useSceneWater\(scene\);/);
    assert.match(core, /Reactor3D\.waterVolumeMaterial\(material\)/);
    assert.match(world, /this\.noteWaterVolume\(\);/);
});

test('the terrain lets a swimmer into deep water and out onto a low bank only', () => {
    const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    const saved = {};
    const stub = { hasWater: () => true, terrainOf: () => null, hasPieces: () => false, stairPieceAt: () => null,
        groundHeightAt: (m, x) => (x < 5 ? bankHeight : -6), waterLevelAt: (m, x) => (x >= 5 ? -1 : null) };
    let bankHeight = 0;
    for (const key of Object.keys(stub)) { saved[key] = R[key]; R[key] = stub[key]; }
    try {
        const map = { width: 10, height: 10 };
        global.ReactorPhysics = { settings: () => ({ swim: true, swimDepth: 2.2 }) };
        assert.equal(R.terrainBlocks(map, 4, 0, 5, 0), false, 'in off the bank');
        assert.equal(R.terrainBlocks(map, 5, 0, 6, 0), false, 'across the pool');
        assert.equal(R.terrainBlocks(map, 5, 0, 4, 0), true, 'a bank a whole tile over the surface is jumped onto, not climbed');
        bankHeight = -0.5;
        assert.equal(R.terrainBlocks(map, 5, 0, 4, 0), false, 'out onto a bank a step over the surface');
        global.ReactorPhysics = { settings: () => ({ swim: false, swimDepth: 2.2 }) };
        bankHeight = 0;
        assert.equal(R.terrainBlocks(map, 4, 0, 5, 0), true, 'no swimming: deep water is not walked into');
    } finally {
        delete global.ReactorPhysics;
        for (const key of Object.keys(saved)) R[key] = saved[key];
    }
});

test('the runtime loads controls before physics, and every build ships both', () => {
    const main = read('runtime/reactor_main.js');
    assert.ok(main.indexOf('"js/reactor_controls.js"') > 0 && main.indexOf('"js/reactor_controls.js"') < main.indexOf('"js/reactor_physics.js"'));
    for (const file of ['editor/build-scripts/build.js', 'editor/build-scripts/build-worker.js', 'editor/build-scripts/dist-editor-worker.js']) {
        assert.match(read(file), /'reactor_controls\.js', 'reactor_physics\.js'/, file);
    }
});

test('a ladder is climbed, not stood on: off its top onto the ledge, onto it from the ledge, never walked up', () => {
    const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    const pieces = [{ id: 1, kind: 'wall', x: 5, y: 5, z: 0, rot: 0, material: '' }];
    for (let z = 0; z < 5; z++) pieces.push({ id: 2 + z, kind: 'ladder', x: 5, y: 6, z, rot: 2, material: '' });
    const map = { width: 10, height: 10, reactor3d: { version: 1, mode: '3d', pieces } };
    const ladder = R.ladderAt(map, 5, 6);
    assert.deepEqual([ladder.dir, ladder.bottom, ladder.top], [8, 0, 5], 'climbs north, toward the wall, a storey');
    assert.ok(R.groundHeightAt(map, 5.5, 6.5, 5) < 0.5, 'nobody stands on a ladder');
    assert.equal(R.terrainBlocks(map, 5, 6, 5, 5, 0), true, 'the wall is not walked up from the foot');
    assert.equal(R.terrainBlocks(map, 5, 6, 5, 5, 5), false, 'from the top of the ladder onto the wall top');
    assert.equal(R.terrainBlocks(map, 5, 5, 5, 6, 5), false, 'from the wall top onto the ladder');
    assert.equal(R.terrainBlocks(map, 5, 6, 5, 7, 0), false, 'walks away at the foot');
    const physics = read('runtime/reactor_physics.js');
    assert.match(physics, /Game_Player\.prototype\.moveStraight = function\(d\)/);
    assert.match(physics, /if \(ladder && height > ground \+ 0\.02\) \{/);
});

test('the editor and the runtime know the same piece kinds (a ladder is placeable and survives a save)', () => {
    const E = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapElevation.js'));
    const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    assert.deepEqual([...E.PIECE_KINDS].sort(), [...R.PIECE_KINDS].sort());
    assert.equal(E.normalizePiece({ kind: 'ladder', x: 1, y: 1, z: 0, rot: 2 }, { width: 5, height: 5 }).kind, 'ladder');
});

test('a placed ladder is edited whole: its height from the foot, its turn, its move and its removal', () => {
    const src = read('editor/src/PieceBuilderManager.js'), bar = read('editor/src/BuildHotbar.js'), css = read('editor/css/styles.css');
    assert.match(src, /setLadderHeight\(piece, height, record = true\)/);
    assert.match(src, /if \(piece\.kind === 'ladder'\) \{\n\s+const ids = new Set\(this\.ladderStack\(piece\)/);
    assert.match(src, /const gone = new Set\(piece\.kind === 'ladder' \? this\.ladderStack\(piece\)/);
    assert.match(bar, /if \(s\.piece\) manager\.setLadderHeight\(s\.piece, height\)/);
    assert.match(css, /\.rr-build-note\.rr-build-wrap \{ white-space: normal;/);
});

test('the Shape slot offers every shape, a placed shape changes kind in place, and a shape lands under the pointer', () => {
    const bar = read('editor/src/BuildHotbar.js'), manager = read('editor/src/PieceBuilderManager.js'), view = read('editor/src/MapEditor3D.js');
    assert.match(bar, /class="rr-build-shapes"/);
    assert.match(bar, /manager\.updateSelected\(patch\);\n\s+\} else \{ manager\.lastShape = kind; manager\.setKind\(kind\); \}/);
    assert.match(manager, /shapeOffsetFor\(target\) \{/);
    assert.match(view, /const off = manager\.shapeOffsetFor \? manager\.shapeOffsetFor\(target\) : null;/);
});

test('from the bottom of a deep pool the water lifts a swimmer to the surface and no further', () => {
    const c = sandbox({ reactorPhysics: { gravity: 0.5 } });
    c.Reactor3D = { isMap3D: () => true, TERRAIN_SLOPE_LIMIT: 0.75, hasWater: () => true, groundHeightAt: () => -20, waterLevelAt: () => -1 };
    const who = { x: 5, y: 0, _realX: 5, _realY: 0, _reactorGround: -20, _reactorAlt: -20, _reactorSwim: true };
    let highest = -Infinity;
    for (let i = 0; i < 1200; i++) { c.ReactorPhysics.update(who); highest = Math.max(highest, who._reactorAlt); }
    assert.ok(highest <= -3.2 + 1e-6, `never past the float (${highest})`);
    assert.ok(Math.abs(who._reactorAlt - -3.2) < 0.05, 'floats there');
    assert.equal(c.ReactorPhysics.isAirborne(who), false);
});

test('a swimmer steers its depth with the camera in third and first person', () => {
    const c = sandbox();
    const held = new Set(['forward']);
    c.Input.dir4 = 0;
    c.Reactor3D = { Camera: { currentState: () => ({ mode: 'thirdPerson' }), look: { pitch: 70 }, held } };
    assert.ok(c.ReactorPhysics.lookDive({}) > 0.9, 'looking down dives');
    c.Reactor3D.Camera.look.pitch = -10;
    assert.ok(c.ReactorPhysics.lookDive({}) < -0.5, 'looking up rises');
    c.Reactor3D.Camera.look.pitch = 27;
    assert.equal(c.ReactorPhysics.lookDive({}), 0, 'the resting view swims level');
    c.Reactor3D.Camera.currentState = () => ({ mode: 'fixed' });
    c.Reactor3D.Camera.look.pitch = 70;
    assert.equal(c.ReactorPhysics.lookDive({}), 0, 'fixed views keep Dash and Jump');
});

test('a ladder placed beside a wall leans on it, and its preview shows that', () => {
    const manager = read('editor/src/PieceBuilderManager.js'), view = read('editor/src/MapEditor3D.js');
    assert.match(manager, /ladderRotFor\(target\) \{/);
    assert.match(manager, /if \(this\.kind === 'ladder'\) \{ const rot = this\.ladderRotFor\(target\); if \(rot !== null\) piece\.rot = rot; \}/);
    assert.match(view, /manager\.ladderRotFor\(target\) \?\? manager\.rot/);
});
