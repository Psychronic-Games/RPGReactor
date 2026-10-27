'use strict';
// The Grappler: a launcher worn on the right forearm (Character Builder › Accessories › Bags and tools, and the Prop
// Builder's Equipment), its harpoon a part of its own ('Grapple spike'); in a Tactical battle the grapple's line
// leaves from the gauntlet's muzzle, the harpoon flies on its end and the barrel stands empty until it is back.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editor = path.join(__dirname, '..');
const repoRoot = path.join(editor, '..');
const dir = path.join(editor, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail']) load(name);
const Model = load('CharacterModel');
const Props = load('CharacterProps');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;

let pack;
test.before(async () => { pack = await Body.loadPack(); });

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = a => { const l = Math.hypot(...a); return a.map(v => v / l); };

test('the grappler is an accessory of its own slot, in three styles, listed with the tools', () => {
    const def = Props.BY_ID.get('grappler');
    assert.ok(def, 'defined');
    assert.equal(def.slot, 'grappler');
    assert.equal(def.group, 'Bags and tools');
    assert.deepEqual(def.shapes.map(s => s[0]), ['tactical', 'brass', 'salvaged']);
    // Its own slot: it is worn beside a held sword and the forearm screen.
    const worn = Props.normalizeProps([{ id: 'grappler' }, { id: 'forearmScreen' }, { id: 'sword', side: 'right' }]);
    assert.deepEqual(worn.map(item => item.id).sort(), ['forearmScreen', 'grappler', 'sword']);
});

test('on any body it is a shell round the forearm, a launcher on it and the harpoon apart, all riding the forearm', () => {
    for (const shape of ['tactical', 'brass', 'salvaged']) for (const body of [{}, { gender: 1, weight: 1.2, muscle: 2.2 }, { gender: 0, weight: -0.4, height: -0.4 }]) {
        const result = Model.build(pack, Object.assign({ props: [{ id: 'grappler', shape }], outfit: [{ id: 'tshirt' }] }, body), {}, { quality: 'preview' });
        const label = shape + ' ' + JSON.stringify(body);
        const spike = result.parts.find(p => p.name === 'Grapple spike');
        assert.ok(spike, label + ': the harpoon is its own part');
        const fore = result.bones.findIndex(b => b.name === 'RightForeArm');
        for (const part of result.parts.filter(p => /^Grappl/.test(p.name) || p.name === 'Accessories')) {
            for (let k = 0; k < part.joints.length; k += 4) assert.equal(part.joints[k], fore, label + ': ' + part.name + ' rides the forearm');
        }
        // The point is out past the wrist, along the forearm.
        const a0 = result.bones[fore].head, a1 = result.bones.find(b => b.name === 'RightHand').head, d = unit(sub(a1, a0)), length = Math.hypot(...sub(a1, a0));
        let most = -Infinity;
        for (let v = 0; v < spike.positions.length / 3; v++) most = Math.max(most, dot(sub([spike.positions[v * 3], spike.positions[v * 3 + 1], spike.positions[v * 3 + 2]], a0), d) / length);
        assert.ok(most > 1.05 && most < 1.3, label + ': the point is out of the muzzle, past the wrist (' + most.toFixed(2) + ')');
        const triangles = result.parts.filter(p => /^Grappl/.test(p.name) || p.name === 'Accessories').reduce((n, p) => n + p.index.length / 3, 0);
        assert.ok(triangles < 9000, label + ': ' + triangles + ' triangles');
    }
});

test('a loose sleeve is gathered under the shell; past its rims the cloth is let go', () => {
    const plain = Model.build(pack, { outfit: [{ id: 'hoodie' }] }, {}, { quality: 'preview' });
    const worn = Model.build(pack, { outfit: [{ id: 'hoodie' }], props: [{ id: 'grappler' }] }, {}, { quality: 'preview' });
    const bone = (r, n) => r.bones.find(b => b.name === n).head;
    const a0 = bone(worn, 'RightForeArm'), d = unit(sub(bone(worn, 'RightHand'), a0)), length = Math.hypot(...sub(bone(worn, 'RightHand'), a0));
    const reach = (result, from, to) => {
        let most = 0;
        for (const part of result.parts.filter(p => p.name === 'Hoodie')) for (let v = 0; v < part.positions.length / 3; v++) {
            const q = sub([part.positions[v * 3], part.positions[v * 3 + 1], part.positions[v * 3 + 2]], a0), t = dot(q, d) / length;
            if (t < from || t > to) continue;
            const r = Math.hypot(...sub(q, d.map(x => x * dot(q, d))));
            if (r < 0.13) most = Math.max(most, r);
        }
        return most;
    };
    assert.ok(reach(worn, 0.45, 0.8) < reach(plain, 0.45, 0.8) - 0.02, `gathered: ${reach(worn, 0.45, 0.8).toFixed(3)} from ${reach(plain, 0.45, 0.8).toFixed(3)}`);
    // The cloth up the arm, away from the shell, is as it was.
    assert.ok(Math.abs(reach(worn, 0.05, 0.15) - reach(plain, 0.05, 0.15)) < 1e-6);
});

/** The Rope section of the Tactical runtime, run against a scene, a wearer and a camera of our own. */
function ropeWorld({ withGrappler }) {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_fight_tactical.js'), 'utf8');
    const start = source.indexOf('    const Rope = F.Rope = {');
    const end = source.indexOf('    if (typeof Spriteset_Map !== "undefined") {', start);
    assert.ok(start > 0 && end > start, 'the Rope section is locatable');
    const group = new THREE.Group(), scene = { modelsGroup: () => group };
    const model = new THREE.Group();
    let loaded = null;
    if (withGrappler) {
        // A harpoon along +x: shaft from 0 to 0.12, barbs and point crowded at its far end.
        const g = new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6).rotateZ(-Math.PI / 2).translate(0.06, 0, 0);
        const head = new THREE.ConeGeometry(0.01, 0.03, 4).rotateZ(-Math.PI / 2).translate(0.125, 0, 0);
        const merged = new THREE.BufferGeometry();
        const a = g.toNonIndexed().attributes.position.array, b = head.toNonIndexed().attributes.position.array, both = new Float32Array(a.length + b.length);
        both.set(a); both.set(b, a.length);
        merged.setAttribute('position', new THREE.BufferAttribute(both, 3));
        loaded = new THREE.Mesh(merged, new THREE.MeshBasicMaterial());
        loaded.name = 'Grapple_spike';
        model.add(loaded);
    }
    model.position.set(5, 1, 7);
    model.updateMatrixWorld(true);
    const holder = { object: model, binding: {}, rules: [] };
    const character = { _realX: 4.5, _realY: 6.5 };
    let hook = { x: 8, y: 7, z: 4, out: 0.5 };
    const P = { grappleHook: (c, out) => hook ? Object.assign(out, hook) : null };
    const F = { Stage: { holderOf: () => holder, heightOf: () => 3, groundOf: () => 0 } };
    const fight = { isActive: () => true, _units: [{ gone: false }], character: () => character };
    const context = { THREE, F, root: { ReactorPhysics: P, ReactorBattleRoomView: null }, Reactor3D: { viewport: () => null }, $gameFight: fight, Math };
    vm.runInNewContext(source.slice(start, end) + '\nthis.Rope = Rope;', context);
    return { Rope: context.Rope, spriteset: { _reactor3d: { scene } }, group, loaded, setHook: h => { hook = h; } };
}

test('in a battle the line leaves the grappler\'s muzzle, the harpoon flies on its end, and the barrel is empty until it is back', () => {
    const { Rope, spriteset, group, loaded, setHook } = ropeWorld({ withGrappler: true });
    Rope.update(spriteset);
    const [line, head] = group.children.filter(c => c.isMesh);
    assert.ok(line.visible && head.visible, 'a line and a harpoon');
    assert.equal(loaded.visible, false, 'the loaded harpoon left the barrel');
    // The muzzle: a fifth of the way back from the point (0.14 along +x) toward the tail (0), in the world.
    const from = new THREE.Vector3(5 + 0.14 * 0.79, 1, 7);
    const lineStart = line.position.clone().multiplyScalar(2).sub(head.position);
    assert.ok(lineStart.distanceTo(from) < 0.002, 'the line starts at the muzzle: ' + lineStart.toArray().map(v => v.toFixed(3)));
    // Half the line is out: the harpoon is halfway to the edge.
    assert.ok(head.position.distanceTo(from.clone().lerp(new THREE.Vector3(8, 4, 7), 0.5)) < 0.002);
    // The harpoon is the wearer's own length and points along the line, toward the edge.
    assert.ok(Math.abs(head.scale.x - 0.14) < 0.002, 'its own length: ' + head.scale.x.toFixed(3));
    const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(head.quaternion), toward = new THREE.Vector3(8, 4, 7).sub(from).normalize();
    assert.ok(ahead.dot(toward) > 0.99, 'the point leads');
    setHook(null);
    Rope.update(spriteset);
    assert.equal(loaded.visible, true, 'wound back: the harpoon is in the barrel again');
    assert.ok(!line.visible && !head.visible);
});

test('without a grappler the line leaves the hand (the chest without a rigged model) and still carries a harpoon', () => {
    const { Rope, spriteset, group } = ropeWorld({ withGrappler: false });
    Rope.update(spriteset);
    const [line, head] = group.children.filter(c => c.isMesh);
    assert.ok(line.visible && head.visible);
    assert.equal(head.scale.x, Rope.HEAD_LENGTH);
    const start = line.position.clone().multiplyScalar(2).sub(head.position);
    assert.ok(start.distanceTo(new THREE.Vector3(5, 2.25, 7)) < 1e-6, 'from the chest: ' + start.toArray());
});
