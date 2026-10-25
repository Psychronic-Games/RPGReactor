/**
 * Things held by characters on the map (Reactor3D.MapHeld): a model's hand
 * takes the weapon's model, the thing rides the hand, an aimed gun points at
 * its target, a carried weapon comes back after a sequence, and everything
 * is freed. Behavioral, against the real three.js and the Battle Room's own
 * holding code (Reactor3D.Held), which both stages share.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
global.Reactor3D = Reactor3D;
global.ReactorBattleData = require(path.join(repoRoot, 'editor', 'src', 'battle', 'BattleData.js'));
global.ReactorBattleRoomView = require(path.join(repoRoot, 'runtime', 'reactor_battle_room.js'));

const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d, 8, 6, 2); g.translate(x, y, z); return new THREE.Mesh(g, new THREE.MeshBasicMaterial()); };
/** A body facing +z: a chest, a head, and two arms hanging from the shoulders, each hand with five marked fingers. */
function body() {
    const joint = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); parent.add(b); return b; };
    const root = new THREE.Group(), chest = joint('Chest', root, 0, 1.2, 0), head = joint('Head', chest, 0, .35, 0), hands = {};
    for (const [side, sign] of [['Right', -1], ['Left', 1]]) {
        const upper = joint(side + 'UpperArm', chest, sign * .2, .2, 0), fore = joint(side + 'LowerArm', upper, 0, -.3, 0), hand = joint(side + 'Hand', fore, 0, -.3, 0);
        // The hand hangs down -y, palm toward the body, knuckles along z with the index finger forward.
        const points = {};
        for (const [name, base, tip] of [['thumb', [.02, -.06, .05], [.02, -.10, .07]], ['index', [0, -.10, .03], [0, -.16, .03]], ['middle', [0, -.10, .01], [0, -.17, .01]], ['ring', [0, -.10, -.01], [0, -.16, -.01]], ['pinky', [0, -.10, -.03], [0, -.15, -.03]]])
            points[name] = { base: [-sign * base[0], base[1], base[2]], tip: [-sign * tip[0], tip[1], tip[2]] };
        Reactor3D.attachRigFingers(root, hand, side, points, null);
        hands[side] = hand;
    }
    root.userData.glbSize = { x: .6, y: 1.8, z: .3 };
    root.updateMatrixWorld(true);
    return { root, chest, head, hands };
}
const character = (id, x, y) => ({ _realX: x, _realY: y, _x: x, _y: y, eventId: () => id, direction: () => 2, isMoving: () => false });
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a map character holds its weapon: shown in the fist, carried, aimed at a target, eased back and freed', async () => {
    const M = Reactor3D.MapHeld, kept = {};
    for (const name of ['characterModelSpec', 'databaseModelSpec', 'loadModel', 'loadModelSidecar', 'characterGround']) kept[name] = Reactor3D[name];
    global.$gameMap = { mapId: () => 5 }; global.Graphics = { frameCount: 0 };
    const pistol = new THREE.Group(); pistol.add(box(.5, .06, .04, 0, 0, 0), box(.07, .2, .04, -.2, -.12, 0)); pistol.userData.glbSize = { x: .5, y: .26, z: .04 };
    const rifle = new THREE.Group(); rifle.add(box(1, .06, .05, 0, 0, 0), box(.12, .14, .05, -.44, -.07, 0), box(.06, .16, .05, -.2, -.1, 0)); rifle.userData.glbSize = { x: 1, y: .2, z: .05 };
    const sword = new THREE.Group(); sword.add(box(.02, .2, .02, 0, .1, 0), box(.14, .02, .03, 0, .21, 0), box(.05, .8, .01, 0, .62, 0)); sword.userData.glbSize = { x: .14, y: 1.02, z: .03 };
    const templates = { Pistol: pistol, Rifle: rifle, Sword: sword }, sizes = { Pistol: .3, Rifle: 1, Sword: .9 };
    let loads = 0;
    try {
        const unit = character(1, 4, 4), foe = character(2, 4, 9), bare = character(3, 0, 0);
        Reactor3D.characterModelSpec = c => (c === bare ? null : { name: 'Actors/Unit', size: 1.8, scale: 1 });
        Reactor3D.databaseModelSpec = (section, id) => (section === 'weapons' && ['Pistol', 'Rifle', 'Sword'][id - 1] ? { name: ['Pistol', 'Rifle', 'Sword'][id - 1], ext: '.glb', file: '', size: sizes[['Pistol', 'Rifle', 'Sword'][id - 1]], scale: 1 } : null);
        Reactor3D.loadModel = async name => { loads++; return templates[name]; };
        Reactor3D.loadModelSidecar = async () => ({});
        Reactor3D.characterGround = () => 0;
        const battler = id => ({ weapons: () => [{ id }] });
        const place = b => { b.root.position.set(4.5, 0, 4.5); b.root.updateMatrixWorld(true); return { object: b.root, character: unit }; };
        const frame = holder => { Graphics.frameCount++; return M.update(holder, unit, null, false); };
        const barrel = object => { object.updateWorldMatrix(true, false); const s = Reactor3D.heldShape(object); return new THREE.Vector3(...s.axis).transformDirection(object.matrixWorld); };

        assert.equal(M.show(bare, { battler: battler(1), hold: 'fist', attachment: 'rightHand' }), false, 'a character without a model holds nothing here');
        assert.equal(M.show(unit, { battler: { weapons: () => [] }, hold: 'fist', attachment: 'rightHand' }), false, 'nor a battler with no weapon model');
        assert.equal(M.count, 0);
        assert.equal(M.hide(unit), false);

        // A pistol shown in the fist, aimed at the foe five tiles down the map.
        const a = body(), holder = place(a);
        assert.equal(M.show(unit, { battler: battler(1), targetCharacter: foe, hold: 'fist', attachment: 'rightHand', hands: 'one', aim: 'target', gripY: 0, duration: 0 }), true);
        await settle();
        frame(holder);
        const state = M.states.get('e1'), gun = state.record.object;
        assert.equal(gun.parent, a.hands.Right, 'the pistol rides the hand as its child');
        assert.ok(Reactor3D._handGrips.get(a.hands.Right).pinned, 'and the hand keeps hold of it');
        const goal = new THREE.Vector3(4.5, 1.8 * .6, 9.5), muzzle = gun.localToWorld(new THREE.Vector3(...Reactor3D.heldShape(gun).base).add(new THREE.Vector3(...Reactor3D.heldShape(gun).axis).multiplyScalar(Reactor3D.heldShape(gun).length)));
        assert.ok(barrel(gun).angleTo(goal.clone().sub(muzzle)) < .06, `the barrel points at the target (${(barrel(gun).angleTo(goal.clone().sub(muzzle)) * 57.3).toFixed(1)} degrees off)`);
        assert.ok(a.hands.Right.getWorldPosition(new THREE.Vector3()).y > 1.1, 'the arm has come up');
        // The model's motion writes the arm again each frame: the hold is laid back over it, and the pistol stays on target.
        for (let i = 0; i < 3; i++) { a.hands.Right.parent.parent.quaternion.identity(); a.hands.Right.parent.quaternion.identity(); a.root.updateMatrixWorld(true); frame(holder); }
        a.root.updateMatrixWorld(true);
        assert.ok(barrel(gun).angleTo(new THREE.Vector3(0, 0, 1)) < .25, 'still aimed after the motion rewrote the arm');
        // The unit walks: the thing goes with the model; the target moves: the aim follows.
        unit._realX = 6; a.root.position.x = 6.5; a.root.updateMatrixWorld(true);
        for (let i = 0; i < 8; i++) frame(holder);
        a.root.updateMatrixWorld(true);
        const after = gun.localToWorld(new THREE.Vector3());
        assert.ok(after.x > 5.8 && after.distanceTo(a.hands.Right.getWorldPosition(new THREE.Vector3())) < .3, 'the pistol went with the unit, in its hand');
        assert.ok(barrel(gun).x < -.2, `and turned toward the target it has stepped away from (${barrel(gun).x.toFixed(2)})`);

        // Hide with nothing carried: the thing leaves the hand, the fingers are let go, the arm eases back and the unit is forgotten.
        assert.equal(M.hide(unit), true);
        assert.equal(gun.parent, null);
        assert.equal(Reactor3D._handGrips.get(a.hands.Right).pinned, false);
        for (let i = 0; i < M.EASE + 2; i++) frame(holder);
        assert.ok(a.hands.Right.parent.parent.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, 'the arm is the motion\'s again');
        assert.equal(M.count, 0, 'nothing is kept for a unit that holds nothing');

        // Carrying: the weapon is loaded and in the hand before any sequence shows it; a sequence's hold eases back to the carry when it hides.
        loads = 0;
        assert.equal(M.carry(unit, { battler: battler(3) }), true);
        await settle();
        frame(holder);
        const carried = M.states.get('e1'), blade = carried.record.object;
        assert.equal(loads, 1);
        assert.equal(blade.parent, a.hands.Right, 'a carried sword is in the hand');
        const rest = blade.quaternion.clone();
        assert.ok(carried.slots.every(slot => !slot.node || !slot.hasTo), 'and the arms are left to the model\'s own motion');
        assert.equal(M.show(unit, { battler: battler(3), hold: 'fist', attachment: 'rightHand', gripY: 0, x: .02, rotation: 40, duration: 0 }), true);
        frame(holder);
        assert.equal(loads, 1, 'the first Show of a carried weapon loads nothing');
        assert.equal(carried.record.object, blade);
        const shown = blade.quaternion.clone();
        for (let i = 0; i < 10; i++) frame(holder);
        assert.ok(blade.quaternion.angleTo(shown) > .1, 'the step\'s own tilt is eased in, not popped');
        assert.equal(M.move(unit, { rotation: 0, x: 0, duration: 6 }), true);
        for (let i = 0; i < 8; i++) frame(holder);
        assert.ok(blade.quaternion.angleTo(rest) > .3, 'the step holds it level, not as it is carried');
        assert.equal(M.hide(unit), true);
        assert.equal(blade.parent, a.hands.Right, 'after the sequence the sword is still carried');
        for (let i = 0; i < M.EASE + 2; i++) frame(holder);
        assert.ok(blade.quaternion.angleTo(rest) < 1e-3, 'back in the carry hold');

        // A rifle carried in both hands at the ready; taking aim brings it up onto the line to the target; the model rebuilt keeps it.
        M.clear();
        assert.equal(M.count, 0);
        unit._realX = 4; a.root.position.x = 4.5; a.root.updateMatrixWorld(true);
        M.carry(unit, { battler: battler(2) });
        await settle();
        frame(holder);
        const armed = M.states.get('e1'), long = armed.record.object;
        a.root.updateMatrixWorld(true);
        assert.ok(barrel(long).z > .5 && barrel(long).y < -.2, `at the ready: forward and down (${barrel(long).toArray().map(n => n.toFixed(2))})`);
        assert.equal(armed.pinned.length, 2, 'both hands hold it');
        assert.equal(M.aim(unit, foe), true);
        for (let i = 0; i < 14; i++) frame(holder);
        a.root.updateMatrixWorld(true);
        assert.ok(barrel(long).angleTo(new THREE.Vector3(0, 0, 1)) < .12, `aimed down the map at the foe (${(barrel(long).angleTo(new THREE.Vector3(0, 0, 1)) * 57.3).toFixed(1)} degrees)`);
        assert.ok(armed.heldOffHand && armed.heldOffHand.along > Reactor3D.heldShape(long).handle.along + .1, 'the other hand is out along the fore end');
        const b = body(), rebuilt = place(b);
        M.detach(holder);
        assert.equal(long.parent, null, 'a model that goes gives the rifle up');
        frame(rebuilt);
        assert.equal(long.parent, b.hands.Right, 'and the model built in its place takes it');
        M.aim(unit, null);
        assert.equal(M.drop(unit), true);
        for (let i = 0; i < M.EASE + 2; i++) frame(rebuilt);
        assert.equal(M.count, 0);
        // Leaving the map frees what is held there.
        M.carry(unit, { battler: battler(1) });
        assert.equal(M.count, 1);
        global.$gameMap = { mapId: () => 6 };
        assert.equal(M.hide(unit), false);
        assert.equal(M.count, 0);
    } finally {
        M.clear();
        Object.assign(Reactor3D, kept);
        delete global.$gameMap; delete global.Graphics;
    }
});

test('hand markers go with a model that was stood on its idle clip: the finger joints stay on the fingers', () => {
    const make = ground => {
        const root = new THREE.Group(), hand = new THREE.Bone();
        hand.name = 'RightHand'; hand.position.set(-.4, 1, 0); hand.userData.parts = [{ name: 'RightHand', pivot: [0, 0, 0] }];
        root.add(hand);
        if (ground) root.userData.reactorClipGround = ground;
        Reactor3D.attachRigHands(root, { markers: { palmR: [-.4, .93, 0], indexBaseR: [-.4, .9, .03], indexTipR: [-.4, .84, .03] }, bones: [] }, [hand]);
        return hand.userData;
    };
    const plain = make(0), stood = make(.05);
    assert.ok(Math.abs(plain.__reactorPalm[1] - -.07) < 1e-9);
    assert.ok(Math.abs(stood.__reactorPalm[1] - -.12) < 1e-9, 'the palm marker moved with the model');
    assert.ok(Math.abs(stood.__reactorFingerPoints.index.tip[1] - (plain.__reactorFingerPoints.index.tip[1] - .05)) < 1e-9, 'and each finger marker with it');
});

test('a held model is measured once for the session, and a battle\'s models are readied with the map', async () => {
    // Two copies of one model laid out alike read one shape and one surface; another layout, or markers, its own.
    const weapon = () => { const root = new THREE.Group(), g = shared; const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); root.add(mesh); root.updateMatrixWorld(true); return root; };
    const shared = new THREE.BoxGeometry(.06, .9, .04, 2, 12, 2);
    const a = weapon(), b = weapon();
    const shape = Reactor3D.heldShape(a), cloud = Reactor3D.heldCloud(a);
    assert.ok(shape && cloud && cloud.count > 0);
    b.position.set(5, 2, 1); b.scale.setScalar(3); b.updateMatrixWorld(true);
    assert.equal(Reactor3D.heldShape(b), shape, 'the same model wherever and however large it stands');
    assert.equal(Reactor3D.heldCloud(b), cloud);
    const turned = weapon(); turned.children[0].rotation.z = Math.PI / 2; turned.updateMatrixWorld(true);
    assert.notEqual(Reactor3D.heldShape(turned), shape, 'laid out another way: measured for itself');
    const marked = weapon(); marked.userData.__heldRig = { template: 'blade', markers: { gripTop: [0, -.2, 0], gripBottom: [0, -.4, 0], tip: [0, .45, 0], edge: [.03, 0, 0] } };
    assert.notEqual(Reactor3D.heldShape(marked), shape, 'with markers: its own');
    const other = new THREE.Group(); other.add(new THREE.Mesh(new THREE.BoxGeometry(.06, .9, .04, 2, 12, 2), new THREE.MeshBasicMaterial())); other.updateMatrixWorld(true);
    assert.notEqual(Reactor3D.heldShape(other), shape, 'other geometry: its own');

    // What a battle on the map will bring: the records its unit events and Spawn Unit commands name, and the weapons carried.
    const was = { F: global.ReactorFight, party: global.$gameParty, actors: global.$gameActors, spec: Reactor3D.databaseModelSpec };
    const actor = id => ({ weapons: () => [{ id: id === 2 ? 50 : 49 }, null] });
    global.$gameActors = { actor }; global.$gameParty = { allMembers: () => [actor(1), actor(2)] };
    global.ReactorFight = {
        dataUnitSpec: data => (data.rrUnit ? { team: data.rrUnit.team, record: data.rrUnit.record, id: data.rrUnit.id } : null),
        unitSpecOf: (data, list) => { const c = (list || []).find(x => x.code === 108 && /<unit: enemy (\d+)>/.test(x.parameters[0])); return c ? { team: 'enemy', record: 'enemy', id: Number(/(\d+)/.exec(c.parameters[0])[1]) } : null; }
    };
    Reactor3D.databaseModelSpec = (section, id) => ({ name: section + '/' + id, file: String(id), ext: '.glb' });
    try {
        const map = { events: [null,
            { rrUnit: { team: 'enemy', record: 'enemy', id: 6 }, pages: [{ list: [] }] },
            { rrUnit: { team: 'ally', record: 'actor', id: 2 }, pages: [{ list: [] }] },
            { pages: [{ list: [{ code: 108, parameters: ['<unit: enemy 7>'] }] }] },
            { pages: [{ list: [{ code: 357, parameters: ['RPGReactor', 'SpawnUnit', '', { record: 'enemy', id: '9', team: 'enemy' }] }, { code: 357, parameters: ['RPGReactor', 'SpawnUnit', '', { record: 'enemy', id: '6' }] },
                { code: 357, parameters: ['Other', 'SpawnUnit', '', { record: 'enemy', id: '11' }] }] }] }] };
        const specs = Reactor3D.collectBattleModelSpecs(map);
        assert.deepEqual(specs.units.map(s => s.name), ['enemies/6', 'actors/2', 'enemies/7', 'enemies/9'], 'each record once, in the order met');
        assert.deepEqual(specs.held.map(s => s.name), ['weapons/50', 'weapons/49'], 'the unit actor\'s weapon, then the party\'s');
        assert.deepEqual(Reactor3D.collectBattleModelSpecs({ events: [] }).units, []);
        // The preload builds each, queues its pictures, and measures the weapons through a copy that is let go.
        const loaded = [], measured = [], released = [];
        const template = name => { const t = weapon(); t.userData.glbTextures = [{ isTexture: true, image: {}, name }]; t.userData.name = name; return t; };
        const real = { load: Reactor3D.loadModel, sidecar: Reactor3D.loadModelSidecar, build: Reactor3D.MapHeld.build, release: Reactor3D.releaseModelInstance, shape: Reactor3D.heldShape, cloud: Reactor3D.heldCloud };
        Reactor3D.loadModel = name => { loaded.push(name); return Promise.resolve(name === 'enemies/9' ? null : template(name)); };
        Reactor3D.loadModelSidecar = () => Promise.resolve(null);
        Reactor3D.MapHeld.build = (t, sidecar, spec) => { const o = weapon(); o.userData.from = spec.name; return o; };
        Reactor3D.heldShape = o => { measured.push('shape ' + o.userData.from); return {}; };
        Reactor3D.heldCloud = o => { measured.push('cloud ' + o.userData.from); return {}; };
        Reactor3D.releaseModelInstance = (o, t) => { released.push(o.userData.from); };
        Reactor3D._prewarmTemplates = [];
        try {
            const done = await Reactor3D.preloadBattleModels(map);
            assert.deepEqual(loaded, ['enemies/6', 'actors/2', 'enemies/7', 'enemies/9', 'weapons/50', 'weapons/49']);
            assert.equal(done.filter(Boolean).length, 5, 'a model that is not there is passed over');
            assert.deepEqual(measured, ['shape weapons/50', 'cloud weapons/50', 'shape weapons/49', 'cloud weapons/49'], 'only what is held is measured');
            assert.deepEqual(released, ['weapons/50', 'weapons/49']);
            assert.equal(Reactor3D._prewarmTemplates.length, 5);
            // One model's pictures a frame go to the warm-up, those not yet on the GPU.
            const asked = [], W = Reactor3D.ShaderWarmup, w = { supported: W.supported, uploaded: W.uploaded, request: W.request, enabled: W.enabled };
            W.supported = () => true; W.uploaded = (r, t) => t.name === 'actors/2'; W.request = (r, t) => asked.push(t.name); W.enabled = true;
            try {
                Reactor3D.prewarmTextures({}); Reactor3D.prewarmTextures({}); Reactor3D.prewarmTextures({});
                assert.deepEqual(asked, ['enemies/6', 'enemies/7']);
                assert.equal(Reactor3D._prewarmTemplates.length, 2);
                W.supported = () => false; Reactor3D.prewarmTextures({});
                assert.equal(Reactor3D._prewarmTemplates.length, 2, 'without parallel compiles the old warm-up pass has them');
            } finally { Object.assign(W, w); }
        } finally {
            Reactor3D.loadModel = real.load; Reactor3D.loadModelSidecar = real.sidecar; Reactor3D.MapHeld.build = real.build; Reactor3D.releaseModelInstance = real.release; Reactor3D.heldShape = real.shape; Reactor3D.heldCloud = real.cloud;
            Reactor3D._prewarmTemplates = [];
        }
    } finally { global.ReactorFight = was.F; global.$gameParty = was.party; global.$gameActors = was.actors; Reactor3D.databaseModelSpec = was.spec; }
});

test('units taking up carried weapons together do it one a frame; a sequence\'s own hold never waits', async () => {
    const M = Reactor3D.MapHeld, kept = {};
    for (const name of ['characterModelSpec', 'databaseModelSpec', 'loadModel', 'loadModelSidecar', 'characterGround']) kept[name] = Reactor3D[name];
    global.$gameMap = { mapId: () => 5 }; global.Graphics = { frameCount: 100 };
    const sword = () => { const s = new THREE.Group(); s.add(box(.02, .2, .02, 0, .1, 0), box(.05, .8, .01, 0, .62, 0)); s.userData.glbSize = { x: .05, y: 1.02, z: .02 }; return s; };
    try {
        M.clear();
        Reactor3D.characterModelSpec = () => ({ name: 'Actors/Unit', size: 1.8, scale: 1 });
        Reactor3D.databaseModelSpec = section => (section === 'weapons' ? { name: 'Sword', ext: '.glb', file: '', size: .9, scale: 1 } : null);
        Reactor3D.loadModel = async () => sword();
        Reactor3D.loadModelSidecar = async () => ({});
        Reactor3D.characterGround = () => 0;
        const battler = { weapons: () => [{ id: 1 }] };
        const units = [1, 2, 3].map(id => { const c = character(id, 4 + id, 4), b = body(); b.root.position.set(4.5 + id, 0, 4.5); b.root.updateMatrixWorld(true); return { c, b, holder: { object: b.root, character: c } }; });
        for (const u of units) assert.equal(M.carry(u.c, { battler }), true);
        await settle();
        const held = () => units.map(u => { const s = M.states.get('e' + u.c.eventId()); return !!(s && s.solved); });
        const frame = () => { Graphics.frameCount++; for (const u of units) M.update(u.holder, u.c, null, false); };
        frame(); assert.deepEqual(held(), [true, false, false], 'the first frame takes one');
        frame(); assert.deepEqual(held(), [true, true, false]);
        // The third is shown its weapon by a sequence on the very frame another carry was taken: it is not put off.
        M.clear();
        for (const u of units) M.carry(u.c, { battler });
        await settle();
        assert.equal(M.show(units[2].c, { battler, hold: 'fist', attachment: 'rightHand', gripY: 0, duration: 0 }), true);
        frame();
        assert.deepEqual(held(), [true, false, true], 'a carry and the sequence\'s hold on one frame');
        frame(); assert.deepEqual(held(), [true, true, true]);
        for (const u of units) assert.equal(M.states.get('e' + u.c.eventId()).record.object.parent, u.b.hands.Right, 'each ends with its sword in the hand');
    } finally { M.clear(); Object.assign(Reactor3D, kept); }
});

test('a battle\'s first frame finds every footprint taken: one per size a model stands at, and a unit event\'s own models on any page', async () => {
    const map = { events: [null, { id: 1, rrUnit: { team: 'enemy', record: 'enemy', id: 6 }, pages: [{ list: [] }] }, { id: 2, pages: [{ list: [] }] }],
        reactor3d: { events: { 1: { 0: { name: 'Actors/Raider', size: 3 }, 1: { name: 'Actors/Raider', size: 3.6 }, 2: { name: 'Actors/Captain', size: 3 } }, 2: { 0: { name: 'Actors/Raider', size: 3 } } } } };
    // One model at two sizes is two poses; the same pose on another event is the one.
    const poses = Reactor3D.collectMapPoseSpecs(map);
    assert.deepEqual(poses.map(spec => spec.name + ' ' + spec.size), ['Actors/Raider 3', 'Actors/Raider 3.6', 'Actors/Captain 3']);
    assert.deepEqual(Reactor3D.collectMapPoseSpecs({}), []);
    const was = { F: global.ReactorFight, party: global.$gameParty, spec: Reactor3D.databaseModelSpec };
    const real = {}; for (const name of ['ensureLoaded', 'loadModel', 'loadModelSidecar', 'loadDatabaseSidecar', 'modelCollisionMask', 'preloadBattleModels']) real[name] = Reactor3D[name];
    global.ReactorFight = { dataUnitSpec: data => (data.rrUnit ? { team: data.rrUnit.team, record: data.rrUnit.record, id: data.rrUnit.id } : null), unitSpecOf: () => null };
    global.$gameParty = undefined;
    Reactor3D.databaseModelSpec = (section, id) => ({ name: section + '/' + id, file: String(id), ext: '.glb' });
    try {
        // The unit event's models on every page are a battle's models; the plain event's are the map's alone.
        assert.deepEqual(Reactor3D.collectBattleModelSpecs(map).units.map(s => s.name), ['enemies/6', 'Actors/Raider', 'Actors/Captain']);
        const order = [];
        Reactor3D.ensureLoaded = () => Promise.resolve(true);
        Reactor3D.loadDatabaseSidecar = () => {};
        Reactor3D.preloadBattleModels = () => Promise.resolve([]);
        const templates = [];
        Reactor3D.loadModel = name => { order.push('load ' + name); const t = new THREE.Group(); t.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial())); templates.push(t); return Promise.resolve(t); };
        Reactor3D.loadModelSidecar = () => Promise.resolve(null);
        Reactor3D.modelCollisionMask = spec => { order.push('mask ' + spec.name + ' ' + spec.size); if (spec.size === 3.6) throw new Error('unreadable'); return null; };
        await Reactor3D.preloadMapModels(map);
        const masks = order.filter(line => line.startsWith('mask '));
        assert.ok(masks.includes('mask Actors/Raider 3.6') && masks.includes('mask Actors/Raider 3') && masks.includes('mask Actors/Captain 3'), `each pose's footprint is taken with the map (${masks}); one that fails stops nothing`);
        assert.ok(order.indexOf('mask Actors/Raider 3.6') > order.lastIndexOf('load Actors/Captain'), 'after the models are in');
        // Each model's rest bounds are worked out under the fade too: its copies and detail levels take them from it.
        assert.ok(templates.length >= 2 && templates.every(t => t.children[0].geometry.boundingBox && t.children[0].geometry.boundingSphere));
        assert.equal(Reactor3D.boundModelTemplate(null), null);
    } finally { Object.assign(Reactor3D, real); Reactor3D.databaseModelSpec = was.spec; global.ReactorFight = was.F; global.$gameParty = was.party; }
});

test('models that join a running battle are built inside a budget a frame, in order; outside a battle each is built at once', () => {
    const J = Reactor3D.ModelJoins, was = { now: J.now, fight: global.$gameFight, error: console.error, graphics: global.Graphics };
    let clock = 0, active = false;
    const built = [], job = name => () => { built.push(name); clock += 3; if (name === 'bad') throw new Error('unreadable'); };
    J.now = () => clock; J.queue.length = 0; J.spent = 0;
    global.$gameFight = { isActive: () => active };
    // Each drain on a frame of its own; the budget is the frame's.
    global.Graphics = { frameCount: 0 };
    const frame = () => { Graphics.frameCount++; J.drain(); };
    try {
        // No battle (a map loading): every model the moment its files are in, whatever it costs.
        for (const name of ['a', 'b', 'c', 'd']) J.add(job(name));
        assert.deepEqual(built, ['a', 'b', 'c', 'd']);
        assert.equal(J.queue.length, 0);
        // A battle runs and an army arrives: 3 ms each against 4 ms a frame is two a frame, the rest wait their turn.
        active = true; built.length = 0; frame();
        for (const name of ['e', 'f', 'g', 'bad', 'h', 'i']) J.add(job(name));
        assert.deepEqual(built, ['e', 'f']);
        // A second scene synced in the same frame (a neighbor's world) drains from the same budget.
        J.drain();
        assert.deepEqual(built, ['e', 'f'], 'one budget a frame, however many scenes ask');
        const errors = []; console.error = (...args) => errors.push(args[0]);
        frame();
        assert.deepEqual(built, ['e', 'f', 'g', 'bad'], 'oldest first');
        assert.equal(errors.length, 1, 'one that fails is reported and stops nobody');
        // One arriving while others wait goes behind them.
        J.add(job('j'));
        assert.deepEqual(built, ['e', 'f', 'g', 'bad']);
        frame();
        assert.deepEqual(built, ['e', 'f', 'g', 'bad', 'h', 'i']);
        // The battle ends with some waiting: they are all built on the next frame.
        J.add(job('k')); J.add(job('l'));
        active = false; frame();
        assert.deepEqual(built.slice(6), ['j', 'k', 'l']);
        assert.equal(J.queue.length, 0);
    } finally { J.now = was.now; J.queue.length = 0; J.spent = 0; global.$gameFight = was.fight; console.error = was.error; global.Graphics = was.graphics; }
});

test('a target behind the unit is aimed at from the front: the arm never reaches behind the back', async () => {
    const M = Reactor3D.MapHeld, kept = {};
    for (const name of ['characterModelSpec', 'databaseModelSpec', 'loadModel', 'loadModelSidecar', 'characterGround']) kept[name] = Reactor3D[name];
    global.$gameMap = { mapId: () => 5 }; global.Graphics = { frameCount: 0 };
    const rifle = new THREE.Group(); rifle.add(box(1, .06, .05, 0, 0, 0), box(.12, .14, .05, -.44, -.07, 0), box(.06, .16, .05, -.2, -.1, 0)); rifle.userData.glbSize = { x: 1, y: .2, z: .05 };
    try {
        // The unit faces +z (down the map); the foe stands three tiles behind it, as while it is still turning to aim.
        const unit = character(11, 4, 4), foe = character(12, 4, 1);
        Reactor3D.characterModelSpec = () => ({ name: 'Actors/Unit', size: 1.8, scale: 1 });
        Reactor3D.databaseModelSpec = (section, id) => (section === 'weapons' && id === 1 ? { name: 'Rifle', ext: '.glb', file: '', size: 1, scale: 1 } : null);
        Reactor3D.loadModel = async () => rifle;
        Reactor3D.loadModelSidecar = async () => ({});
        Reactor3D.characterGround = () => 0;
        const b = body();
        b.root.position.set(4.5, 0, 4.5); b.root.updateMatrixWorld(true);
        const holder = { object: b.root, character: unit };
        assert.equal(M.show(unit, { battler: { weapons: () => [{ id: 1 }] }, targetCharacter: foe, hold: 'fist', attachment: 'rightHand', hands: 'both', aim: 'target', gripY: 0, duration: 0 }), true);
        await settle();
        for (let i = 0; i < 3; i++) { Graphics.frameCount++; M.update(holder, unit, null, false); }
        const gun = M.states.get('e11').record.object;
        gun.updateWorldMatrix(true, false);
        const shape = Reactor3D.heldShape(gun);
        const muzzle = gun.localToWorld(new THREE.Vector3(...shape.base).add(new THREE.Vector3(...shape.axis).multiplyScalar(shape.length)));
        const hand = b.hands.Right.getWorldPosition(new THREE.Vector3()), chest = b.chest.getWorldPosition(new THREE.Vector3());
        assert.ok(hand.z > chest.z, `the shooting hand stays in front of the chest (${(hand.z - chest.z).toFixed(2)})`);
        assert.ok(muzzle.z > chest.z, `the muzzle is in front, not through the body (${(muzzle.z - chest.z).toFixed(2)})`);
        const barrel = new THREE.Vector3(...shape.axis).transformDirection(gun.matrixWorld);
        assert.ok(barrel.z > 0, 'the barrel points forward of sideways, at the edge of the arms\' arc');
        // The arc's edge itself: a goal straight behind is turned to 70 degrees off the front, at the same distance and height.
        const shoulder = b.hands.Right.parent.parent, S = shoulder.getWorldPosition(new THREE.Vector3());
        const turned = Reactor3D.Held.frontGoal(M.states.get('e11').owner, 'right', shoulder, new THREE.Vector3(S.x, 1.1, S.z - 3));
        const flat = turned.clone().sub(S).setY(0);
        assert.ok(Math.abs(flat.angleTo(new THREE.Vector3(0, 0, 1)) - Reactor3D.Held.AIM_ARC) < 1e-6, 'turned to the arc\'s edge');
        assert.ok(Math.abs(flat.length() - 3) < 1e-6 && turned.y === 1.1, 'at the same distance and height');
        const ahead = new THREE.Vector3(S.x + 1, 1.1, S.z + 3);
        assert.equal(Reactor3D.Held.frontGoal(M.states.get('e11').owner, 'right', shoulder, ahead), ahead, 'a goal in front is aimed at as it is');
    } finally {
        M.clear && M.clear();
        for (const name of Object.keys(kept)) Reactor3D[name] = kept[name];
    }
});
