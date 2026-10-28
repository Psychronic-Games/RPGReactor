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
    // The cord's first ring is round its start, its last round its end (Rope.shape).
    const ringMiddle = (mesh, ring) => { const P = mesh.geometry.attributes.position, sides = Rope.SIDES, c = new THREE.Vector3(); for (let k = 0; k < sides; k++) c.add(new THREE.Vector3().fromBufferAttribute(P, ring * sides + k)); return c.multiplyScalar(1 / sides); };
    const lineStart = ringMiddle(line, 0);
    assert.ok(ringMiddle(line, Rope.SEGMENTS).distanceTo(head.position) < 0.002, 'and ends at the harpoon');
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
    const P = line.geometry.attributes.position, start = new THREE.Vector3();
    for (let k = 0; k < Rope.SIDES; k++) start.add(new THREE.Vector3().fromBufferAttribute(P, k));
    start.multiplyScalar(1 / Rope.SIDES);
    assert.ok(start.distanceTo(new THREE.Vector3(5, 2.25, 7)) < 1e-6, 'from the chest: ' + start.toArray());
});

test('looked at from inside the cuff, the bracer has a wall: nothing in it is seen through', () => {
    // The shell was one open loft facing out, so from inside every face was a back face, culled: a look into the
    // cuff (the Prop Builder shows it off the arm) saw through the whole bracer. Rays from the forearm's axis out
    // through the shell meet a face turned toward them first.
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    for (const shape of ['tactical', 'brass', 'salvaged']) {
        const result = Model.build(pack, { props: [{ id: 'grappler', shape }] }, {}, { quality: 'preview' });
        const parts = result.parts.filter(p => p.name === 'Accessories' || /^Grappl/.test(p.name));
        const fore = result.bones.find(b => b.name === 'RightForeArm').head, hand = result.bones.find(b => b.name === 'RightHand').head;
        const d = unit(sub(hand, fore)), side = unit(cross(d, [0, 1, 0])), up = cross(side, d);
        for (const t of [0.45, 0.6, 0.75]) for (let k = 0; k < 12; k++) {
            const a = k / 12 * Math.PI * 2, o = fore.map((v, i) => v + (hand[i] - v) * t), dir = side.map((v, i) => v * Math.cos(a) + up[i] * Math.sin(a));
            let best = Infinity, facing = 0;
            for (const p of parts) {
                const P = p.positions, I = p.index, at = v => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
                for (let q = 0; q < I.length; q += 3) {
                    const A = at(I[q]), e1 = sub(at(I[q + 1]), A), e2 = sub(at(I[q + 2]), A), h = cross(dir, e2), det = dot(e1, h);
                    if (Math.abs(det) < 1e-12) continue;
                    const s = sub(o, A), u = dot(s, h) / det, qv = cross(s, e1), v = dot(dir, qv) / det, dist = dot(e2, qv) / det;
                    if (u < 0 || v < 0 || u + v > 1 || dist <= 0 || dist >= best) continue;
                    best = dist; facing = dot(cross(e1, e2), dir);
                }
            }
            assert.ok(best < Infinity, `${shape}: the ray at ${t} ${k} meets the bracer`);
            assert.ok(facing < 0, `${shape}: from inside at ${t}, ray ${k}, the first face of the bracer is turned away (culled)`);
        }
    }
});

test('the line hangs slack as it flies and as the hook bites, and stands straight when drawn taut', () => {
    const { Rope, spriteset, group, setHook } = ropeWorld({ withGrappler: false });
    const middle = line => { const P = line.geometry.attributes.position, ring = Rope.SEGMENTS / 2, c = new THREE.Vector3(); for (let k = 0; k < Rope.SIDES; k++) c.add(new THREE.Vector3().fromBufferAttribute(P, ring * Rope.SIDES + k)); return c.multiplyScalar(1 / Rope.SIDES); };
    const end = line => { const P = line.geometry.attributes.position, c = new THREE.Vector3(); for (let k = 0; k < Rope.SIDES; k++) c.add(new THREE.Vector3().fromBufferAttribute(P, Rope.SEGMENTS * Rope.SIDES + k)); return c.multiplyScalar(1 / Rope.SIDES); };
    const start = new THREE.Vector3(5, 2.25, 7);
    setHook({ x: 8, y: 7, z: 4, out: 1, slack: 1, phase: 'tight' });
    Rope.update(spriteset);
    let line = group.children.filter(c => c.isMesh)[0];
    const span = start.distanceTo(end(line)), straight = start.clone().lerp(end(line), 0.5);
    assert.ok(Math.abs(straight.y - middle(line).y - Rope.SAG * span) < 0.01, 'slack: it hangs by its sag at the middle');
    setHook({ x: 8, y: 7, z: 4, out: 1, slack: 0, phase: 'pull' });
    Rope.update(spriteset);
    line = group.children.filter(c => c.isMesh)[0];
    assert.ok(middle(line).distanceTo(straight) < 0.01, 'taut: straight');
    // A cord, lit as the map is: not the unlit white rod it was.
    assert.equal(line.material.type, 'MeshStandardMaterial');
    assert.ok(Rope.WIDTH <= 0.05);
});
