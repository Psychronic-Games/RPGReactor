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
