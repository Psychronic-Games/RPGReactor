// The mouth outline: eight points round the lips shape the speech fallback
// (runtime/reactor_3d_speech.js); a model saved with three points keeps the
// mouth it had.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../../runtime/libs/three.js');
const THREE = global.THREE;
const R = require('../../runtime/reactor_3d.js');
global.Reactor3D = R;
const S = require('../../runtime/reactor_3d_speech.js').Speech;

const KEYS = R.MOUTH_OUTLINE_KEYS;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** A mouth on a +Z face: 0.08 wide, 0.04 tall, its middle at (cx, cy, z). The character's left is +X. */
function ring(cx = 0, cy = 0.9, z = 0.2, { smile = 0 } = {}) {
    return [V(cx + 0.04, cy + smile, z), V(cx + 0.02, cy + 0.016, z), V(cx, cy + 0.02, z), V(cx - 0.02, cy + 0.016, z),
        V(cx - 0.04, cy + smile, z), V(cx - 0.02, cy - 0.016, z), V(cx, cy - 0.02, z), V(cx + 0.02, cy - 0.016, z)];
}
const outlineOf = points => Object.fromEntries(KEYS.map((key, i) => [key, points[i].toArray()]));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/** A face: a flat 0.2 by 0.2 grid at z = 0.2 with the back of the head 0.2 behind it. */
function face(landmarks, segments = 40) {
    const object = new THREE.Group(); object.userData.glbSize = { x: 1, y: 1, z: 1 };
    const front = new THREE.PlaneGeometry(0.2, 0.2, segments, segments); front.translate(0, 0.9, 0.2);
    const back = new THREE.PlaneGeometry(0.2, 0.2, 8, 8); back.translate(0, 0.9, 0);
    const mesh = new THREE.Mesh(front, new THREE.MeshBasicMaterial()), rear = new THREE.Mesh(back, new THREE.MeshBasicMaterial());
    object.add(mesh, rear);
    R.bindModelLandmarks(object, R.readModelLandmarks({ landmarks }));
    return { object, mesh, rear, front, back };
}

test('the sidecar keeps a ring of all eight points and ignores a partial one', () => {
    assert.deepEqual(KEYS, ['cornerL', 'upperL', 'upperM', 'upperR', 'cornerR', 'lowerR', 'lowerM', 'lowerL']);
    const outline = outlineOf(ring());
    const read = R.readModelLandmarks({ landmarks: { mouth: { part: 'Head', offset: [0, 0.9, 0.2], interior: 'dark', interiorColor: '#101010', outline, open: 1.5 } } });
    assert.deepEqual(read.mouth.outline, outline);
    assert.notEqual(read.mouth.outline.cornerL, outline.cornerL, 'a copy, not the file\'s own arrays');
    assert.equal(read.mouth.open, 1.5);
    assert.deepEqual(R.readModelLandmarks({ landmarks: read }).mouth, read.mouth, 'what is read is what would be written');
    const partial = { ...outline }; delete partial.lowerM;
    assert.equal(R.readModelLandmarks({ landmarks: { mouth: { offset: [0, 0, 0], outline: partial } } }).mouth.outline, undefined);
    const bad = { ...outline, upperM: [0, NaN, 0] };
    assert.equal(R.readModelLandmarks({ landmarks: { mouth: { offset: [0, 0, 0], outline: bad } } }).mouth.outline, undefined);
    assert.equal(R.readModelLandmarks({ landmarks: { mouth: { offset: [0, 0, 0], open: 9 } } }).mouth.open, 2, 'the opening is held to 0-2');
    assert.equal('open' in R.readModelLandmarks({ landmarks: { mouth: { offset: [0, 0, 0], open: 1 } } }).mouth, false, '1 says nothing');
    // The ring follows the mouth's part, in that part's own coordinates.
    const object = new THREE.Group(), head = new THREE.Bone(); head.name = 'Head'; head.position.set(0, 0.5, 0); object.add(head);
    object.userData.glbSize = { x: 1, y: 1, z: 1 };
    const local = outlineOf(ring(0, 0.4, 0.2));
    R.bindModelLandmarks(object, R.readModelLandmarks({ landmarks: { mouth: { part: 'Head', offset: [0, 0.4, 0.2], outline: local } } }));
    const rest = object.__reactorLandmarkRest;
    assert.equal(rest.outline.length, 8);
    assert.ok(near(rest.outline[2].y, 0.92), 'rest space: the head bone lifts the ring');
    assert.equal(rest.open, 1);
});

test('a mouth on the whole model opens where a body stood on its idle clip has its lips; a mouth on a part is carried by the part', () => {
    const object = new THREE.Group(); object.userData.glbSize = { x: 1, y: 1, z: 1 };
    const head = new THREE.Group(); head.name = 'Head'; head.position.y = 0.5; object.add(head);
    const marks = { eyes: { part: 'Head', offset: [0, 0.45, 0.2] }, mouth: { part: '', offset: [0, 0.9, 0.2], outline: outlineOf(ring()) } };
    R.bindModelLandmarks(object, R.readModelLandmarks({ landmarks: marks }));
    assert.ok(near(object.__reactorLandmarkRest.points.mouth.y, 0.9));
    // The clip's lowest point was 0.07 above the rest pose's feet: the body came down by that.
    object.userData.reactorClipGround = 0.07;
    R.bindModelLandmarks(object, R.readModelLandmarks({ landmarks: marks }));
    const rest = object.__reactorLandmarkRest;
    assert.ok(near(rest.points.mouth.y, 0.83) && near(rest.points.mouth.z, 0.2));
    rest.outline.forEach((point, i) => assert.ok(near(point.y, ring()[i].y - 0.07) && near(point.x, ring()[i].x)));
    assert.ok(near(rest.points.eyes.y, 0.95), 'the head carries its own point');
    assert.ok(near(R.modelLandmarkWorld(object, 'mouth').y, 0.9), 'the point itself stays where the clip holds the head');
});

test('the ring fits the mouth its own frame, facing out of the face', () => {
    const shape = S.outlineShape(ring(), { outward: V(0, 0, 1) });
    assert.equal(shape.kind, 'outline');
    for (const [got, want] of [[shape.across, [1, 0, 0]], [shape.up, [0, 1, 0]], [shape.forward, [0, 0, 1]]]) got.toArray().forEach((v, i) => assert.ok(near(v, want[i])));
    assert.ok(near(shape.width, 0.08)); assert.ok(near(shape.tall, 0.04));
    // Tilted: up stays square to the line between the corners.
    const tilted = ring(); tilted[2].x += 0.01; tilted[0].y += 0.005; tilted[4].y -= 0.005;
    const t = S.outlineShape(tilted, { outward: V(0, 0, 1) });
    assert.ok(near(t.across.dot(t.up), 0)); assert.ok(near(t.forward.length(), 1)); assert.ok(t.forward.z > 0.9);
    // Corners drawn the other way round: the frame still faces out, and the mouth is the same mouth.
    const swapped = ring(); [swapped[0], swapped[4]] = [swapped[4], swapped[0]]; [swapped[1], swapped[3]] = [swapped[3], swapped[1]]; [swapped[5], swapped[7]] = [swapped[7], swapped[5]];
    const s = S.outlineShape(swapped, { outward: V(0, 0, 1) });
    assert.ok(s.forward.z > 0.99);
    assert.ok(near(s.weight(V(0.01, 0.905, 0.2)), shape.weight(V(0.01, 0.905, 0.2))));
    // A lower lip set deeper than the upper does not lean the mouth: it opens as it looks from the front.
    const deep = ring(); deep[6].z -= 0.03; deep[5].z -= 0.02; deep[7].z -= 0.02;
    const d = S.outlineShape(deep, { outward: V(0, 0, 1) });
    for (const [got, want] of [[d.across, [1, 0, 0]], [d.up, [0, 1, 0]], [d.forward, [0, 0, 1]]]) got.toArray().forEach((v, i) => assert.ok(near(v, want[i])));
    const turned = ring(); turned[4].z -= 0.03;
    const q = S.outlineShape(turned, { outward: V(0, 0, 1) });
    for (const [got, want] of [[q.across, [1, 0, 0]], [q.up, [0, 1, 0]], [q.forward, [0, 0, 1]]]) got.toArray().forEach((v, i) => assert.ok(near(v, want[i]), 'a corner set deeper does not turn it'));
    assert.ok(near(q.width, 0.08));
    assert.ok(near(d.signedAt(V(0, 0.9, 0.5)), 0) && near(d.signedAt(V(0, 0.9, -0.5)), 0), 'the lip line is at one height at every depth');
    assert.equal(S.outlineShape(ring().slice(0, 7)), null);
    const flat = ring().map(p => V(p.x, 0.9, p.z));
    assert.equal(S.outlineShape(flat), null, 'a ring with no height is no mouth');
});

test('inside the ring the movement is whole at the lip line and nothing at the ring; outside, and deep behind, nothing moves', () => {
    const shape = S.outlineShape(ring(), { outward: V(0, 0, 1) });
    assert.ok(near(shape.weight(V(0, 0.9, 0.2)), 1), 'whole at the lip line');
    assert.equal(shape.weight(V(0, 0.92, 0.2)), 0, 'nothing on the ring');
    assert.equal(shape.weight(V(0, 0.88, 0.2)), 0);
    assert.equal(shape.weight(V(0, 0.93, 0.2)), 0, 'nothing above it');
    assert.equal(shape.weight(V(0.05, 0.9, 0.2)), 0, 'nothing past a corner');
    assert.equal(shape.weight(V(0.04, 0.9, 0.2)), 0, 'the corners stay closed');
    const half = shape.weight(V(0, 0.91, 0.2));
    assert.ok(near(half, 0.5), 'half way to the ring, half the movement');
    let previous = 1;
    for (let i = 1; i <= 20; i++) { const w = shape.weight(V(0, 0.9 - 0.001 * i, 0.2)); assert.ok(w <= previous + 1e-12, 'falling all the way'); previous = w; }
    // Depth: whole within a third of the width of the mouth's plane, none past six tenths.
    assert.ok(near(shape.weight(V(0, 0.9, 0.2 - 0.02)), 1));
    assert.equal(shape.weight(V(0, 0.9, 0.2 - 0.05)), 0);
    assert.equal(shape.weight(V(0, 0.9, 0)), 0, 'the back of the head never moves');
    const fading = shape.weight(V(0, 0.9, 0.2 - 0.04));
    assert.ok(fading > 0 && fading < 1);
    // Depth is measured from the face under the ring: corners set back on a round face still
    // move what lies on them, and what stands in front of the face (a collar, a visor) is left alone.
    const round = ring(); round[0].z -= 0.03; round[4].z -= 0.03; round[1].z -= 0.01; round[3].z -= 0.01; round[5].z -= 0.01; round[7].z -= 0.01;
    const curved = S.outlineShape(round, { outward: V(0, 0, 1) });
    assert.ok(near(curved.depthAt(0.03, 0) - curved.depthAt(0, 0), -0.02), 'the face falls away toward a corner');
    assert.ok(curved.weight(V(0.03, 0.9, 0.18)) > 0.99, 'whole on the face near a corner');
    assert.equal(curved.weight(V(0.03, 0.9, 0.18 + 0.05)), 0, 'nothing on what stands in front of it there');
    assert.equal(shape.weight(V(0, 0.9, 0.2 + 0.05)), 0);
    // The lower side opens down, the upper lifts a quarter as far; a corner does not move at all.
    const drop = shape.displace(V(0, 0.9, 0.2), -1, 1), rise = shape.displace(V(0, 0.9, 0.2), 1, 1);
    assert.ok(near(drop, -S.OPEN_SHARE * 0.02)); assert.ok(near(rise, 0.25 * S.OPEN_SHARE * 0.02));
    assert.ok(near(shape.displace(V(0.04, 0.9, 0.2), -1, 1), 0));
    assert.ok(Math.abs(shape.displace(V(0.03, 0.9, 0.2), -1, 1)) < Math.abs(drop), 'less toward the corners, as the ring narrows');
    // A lip never folds over itself, however wide the mouth is asked to open.
    for (const open of [1, 2]) {
        const s = S.outlineShape(ring(), { open, outward: V(0, 0, 1) });
        assert.ok(s.share <= S.OPEN_SHARE_MAX + 1e-12);
        let last = Infinity;
        for (let i = 0; i <= 40; i++) {
            const p = V(0, 0.9 - 0.02 * i / 40, 0.2), moved = p.y + s.displace(p, -1, s.weight(p));
            assert.ok(moved < last, 'the lower lip keeps its order from the lip line down to the ring'); last = moved;
        }
    }
    assert.ok(near(S.outlineShape(ring(), { open: 0 }).displace(V(0, 0.9, 0.2), -1, 1), 0), 'open 0 is a mouth that stays shut');
    const wide = S.outlineShape(ring(), { open: 2, outward: V(0, 0, 1) }), usual = S.outlineShape(ring(), { open: 1, outward: V(0, 0, 1) });
    assert.ok(near(wide.drop(0), 2 * usual.drop(0)) && near(wide.rise(0), 2 * usual.rise(0)), 'open 2 opens twice as far');
    assert.ok(near(S.outlineShape(ring(), { open: 5, outward: V(0, 0, 1) }).drop(0), wide.drop(0)), 'and no further');
});

test('the lip line runs corner to corner through the middle of each upper and lower pair, so it can curve', () => {
    const smile = S.outlineShape(ring(0, 0.9, 0.2, { smile: 0.012 }), { outward: V(0, 0, 1) });
    assert.ok(near(smile.signedAt(V(0.04, 0.912, 0.2)), 0), 'through the left corner');
    assert.ok(near(smile.signedAt(V(-0.04, 0.912, 0.2)), 0), 'and the right');
    assert.ok(near(smile.signedAt(V(0, 0.9, 0.2)), 0), 'and the middle, lower than the corners');
    assert.ok(near(smile.signedAt(V(0.02, 0.9, 0.2)), 0), 'and the middle of the upper-left and lower-left pair');
    assert.ok(near(smile.signedAt(V(0.03, 0.906, 0.2)), 0), 'straight between them');
    assert.ok(smile.signedAt(V(0.03, 0.9, 0.2)) < 0, 'a point level with the middle is below the line near a raised corner');
    assert.ok(near(smile.signedAt(V(0.09, 0.92, 0.2)), 0.008), 'past a corner the line holds the corner\'s height');
    // A straight mouth is a plane, as the three points made it.
    const straight = S.outlineShape(ring(), { outward: V(0, 0, 1) });
    for (const x of [-0.03, 0, 0.017]) assert.ok(near(straight.signedAt(V(x, 0.905, 0.2)), 0.005));
    const over = S.heightOver([[0, 1], [2, 3], [1, 5]]);
    assert.deepEqual([over(-1), over(0.5), over(1), over(1.5), over(9)], [1, 3, 5, 4, 3], 'points are taken in order across, and held past the ends');
});

test('a model with a ring opens that mouth: only vertices inside it move, the split copies coincide at rest, the lining follows', () => {
    const points = ring(0.003, 0.9015, 0.2);
    const { object, mesh, rear, front, back } = face({ mouth: { part: '', offset: [0.003, 0.9015, 0.2], outline: outlineOf(points) } });
    const driver = S.prepare(object);
    assert.equal(driver.kind, 'lipMorph'); assert.equal(driver.shape, 'outline');
    assert.equal(rear.geometry, back, 'the back of the head is not touched');
    assert.notEqual(mesh.geometry, front); assert.equal(front.morphAttributes.position, undefined, 'the shared geometry stays as it was');
    const geo = mesh.geometry, pos = geo.getAttribute('position'), morph = geo.morphAttributes.position[0];
    const shape = S.outlineShape(points, { outward: V(0, 0, 1) });
    let moved = 0, outside = 0, down = 0, up = 0;
    for (let i = 0; i < pos.count; i++) {
        const dx = morph.getX(i) - pos.getX(i), dy = morph.getY(i) - pos.getY(i), dz = morph.getZ(i) - pos.getZ(i);
        assert.ok(Math.abs(dx) < 1e-7 && Math.abs(dz) < 1e-7, 'along the mouth\'s up and nowhere else');
        if (Math.abs(dy) < 1e-9) continue;
        moved++;
        const [u, v] = shape.local(V(pos.getX(i), pos.getY(i), pos.getZ(i)));
        if (u <= shape.uMin || u >= shape.uMax || v > shape.topAt(u) + 1e-7 || v < shape.bottomAt(u) - 1e-7) outside++;
        if (dy < 0) down++; else up++;
    }
    assert.ok(moved > 40, `the lips move (${moved} vertices)`);
    assert.equal(outside, 0, 'and nothing outside the ring');
    assert.ok(down > 0 && up > 0);
    // The cut: both copies of each seam vertex sit on one point at rest and part when the mouth opens.
    const added = pos.count - front.getAttribute('position').count;
    assert.ok(added > 0 && added % 2 === 0, 'the lip line was cut, each cut vertex twice');
    const byPlace = new Map();
    for (let i = front.getAttribute('position').count; i < pos.count; i++) {
        const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map(n => n.toFixed(7)).join(',');
        byPlace.set(key, (byPlace.get(key) || []).concat(i));
    }
    let parted = 0;
    for (const copies of byPlace.values()) {
        // Each triangle on the cut keeps its own copies: one or more for the upper lip, as many for the lower.
        assert.ok(copies.length >= 2 && copies.length % 2 === 0, 'copies for both lips, coincident at rest');
        const moves = copies.map(i => morph.getY(i) - pos.getY(i)), a = copies[0];
        const [u] = shape.local(V(pos.getX(a), pos.getY(a), pos.getZ(a)));
        const lifted = moves.filter(d => d >= -1e-12), dropped = moves.filter(d => d < -1e-12);
        const gap = Math.max(...moves) - Math.min(...moves);
        assert.ok(near(gap, shape.drop(u) + shape.rise(u), 1e-6), 'open by what the ring allows there');
        if (gap > 1e-6) { assert.equal(lifted.length, dropped.length, 'half go up with the upper lip, half down with the lower'); parted++; }
        assert.ok(Math.abs(shape.signedAt(V(pos.getX(a), pos.getY(a), pos.getZ(a)))) < 1e-6, 'and the cut lies on the lip line');
    }
    assert.ok(parted > 4);
    // The lining shows only while open, and is gone with the driver.
    const cavity = mesh.children.find(child => child.name === 'Reactor mouth interior');
    assert.ok(cavity); assert.equal(cavity.visible, false);
    driver.apply(0.6); assert.equal(cavity.visible, true); assert.equal(mesh.morphTargetInfluences[0], 0.6);
    driver.restore(); assert.equal(cavity.visible, false); assert.equal(mesh.morphTargetInfluences[0], 0);
    driver.dispose(); assert.equal(mesh.geometry, front); assert.equal(mesh.children.length, 0);
});

test('a smile is cut along its own curve, and an authored morph or jaw still wins over the ring', () => {
    const points = ring(0, 0.9, 0.2, { smile: 0.012 });
    const { object, mesh, front } = face({ mouth: { part: '', offset: [0, 0.9, 0.2], outline: outlineOf(points) } });
    const driver = S.prepare(object), shape = S.outlineShape(points, { outward: V(0, 0, 1) });
    const pos = mesh.geometry.getAttribute('position'), base = front.getAttribute('position').count;
    let high = 0, low = 0;
    for (let i = base; i < pos.count; i++) {
        const p = V(pos.getX(i), pos.getY(i), pos.getZ(i));
        assert.ok(Math.abs(shape.signedAt(p)) < 1e-4, 'every cut vertex is on the curved lip line');
        if (p.y > 0.906) high++; if (p.y < 0.902) low++;
    }
    assert.ok(high > 0 && low > 0, 'which rises toward the corners');
    driver.dispose();
    const authored = face({ mouth: { part: '', offset: [0, 0.9, 0.2], outline: outlineOf(ring()) } });
    authored.mesh.morphTargetDictionary = { mouthOpen: 0 }; authored.mesh.morphTargetInfluences = [0];
    const kept = S.prepare(authored.object);
    assert.equal(kept.kind, 'morph'); assert.equal(kept.shape, null); assert.equal(authored.mesh.geometry, authored.front);
});

test('a model saved with three points keeps the mouth it had, to the last number', () => {
    // Measured from the runtime before outlines existed (2026-10-03), on this face and these points.
    const pinned = { vertices: 521, moved: 114, sum: 0.626342714, maxUp: 0.00449121, maxDown: -0.01796484, cavityVertices: 120, index: 2520,
        samples: { 220: [0, 0.882269204, 0.200000003], 441: [-0.039999999, 0.901675463, 0.200000003], 450: [-0.038499981, 0.901786864, 0.200000003] } };
    const { object, mesh, front } = face({ mouth: { part: '', offset: [0.003, 0.9015, 0.2] }, upperLip: { part: '', offset: [0.003, 0.9115, 0.2] }, lowerLip: { part: '', offset: [0.003, 0.8915, 0.2] } }, 20);
    const driver = S.prepare(object);
    assert.equal(driver.shape, 'points');
    const geo = mesh.geometry, pos = geo.getAttribute('position'), morph = geo.morphAttributes.position[0];
    let moved = 0, sum = 0, maxUp = 0, maxDown = 0;
    for (let i = 0; i < pos.count; i++) { const d = morph.getY(i) - pos.getY(i); if (Math.abs(d) > 1e-9) moved++; sum += Math.abs(d); maxUp = Math.max(maxUp, d); maxDown = Math.min(maxDown, d); }
    assert.equal(pos.count, pinned.vertices); assert.equal(moved, pinned.moved); assert.equal(geo.getIndex().count, pinned.index);
    assert.equal(+sum.toFixed(9), pinned.sum); assert.equal(+maxUp.toFixed(9), pinned.maxUp); assert.equal(+maxDown.toFixed(9), pinned.maxDown);
    for (const [i, want] of Object.entries(pinned.samples)) assert.deepEqual([morph.getX(i), morph.getY(i), morph.getZ(i)].map(n => +n.toFixed(9)), want);
    assert.equal(mesh.children.find(child => child.name === 'Reactor mouth interior').geometry.getAttribute('position').count, pinned.cavityVertices);
    driver.dispose(); assert.equal(mesh.geometry, front);
});

test('three old points imply a ring, and a ring gives the three old points back', () => {
    const points = { mouth: V(0.003, 0.9015, 0.2), upperLip: V(0.003, 0.9115, 0.2), lowerLip: V(0.003, 0.8915, 0.2) };
    const implied = S.outlineFromPoints(points, 1);
    assert.equal(implied.length, 8);
    const old = S.pointsShape(points, 1);
    assert.ok(near(implied[0].x - 0.003, old.radiusX * 0.8) && near(implied[4].x - 0.003, -old.radiusX * 0.8), 'corners where the old rule\'s movement had all but faded');
    assert.ok(near(implied[2].y, 0.9215) && near(implied[6].y, 0.8815), 'the middles on the lips\' outer edges');
    // Lips set unevenly about the mouth point still give a lip line through it.
    const uneven = S.outlineFromPoints({ mouth: V(0, 0.9, 0.2), upperLip: V(0.004, 0.92, 0.2), lowerLip: V(-0.002, 0.89, 0.2) }, 1);
    assert.ok(near(uneven[2].y, 0.93) && near(uneven[6].y, 0.87) && near(uneven[2].x, 0) && near(uneven[0].y, 0.9));
    assert.ok(near(S.outlineMiddles(uneven).mouth.y, 0.9));
    assert.ok(implied[1].x > implied[2].x && implied[3].x < implied[2].x && implied[1].y < implied[2].y, 'the four between, inside the corners and under the middle');
    const shape = S.outlineShape(implied, { outward: V(0, 0, 1) });
    assert.ok(shape && shape.forward.z > 0.99);
    const back = S.outlineMiddles(implied);
    back.mouth.toArray().forEach((v, i) => assert.ok(near(v, points.mouth.toArray()[i])));
    assert.ok(near(back.upperLip.y, 0.9215) && near(back.lowerLip.y, 0.8815));
    // A mouth point alone still implies a ring.
    assert.equal(S.outlineFromPoints({ mouth: V(0, 0.9, 0.2) }, 1).length, 8);
    assert.equal(S.outlineFromPoints({}, 1), null);
});

// ---- Database > 3D Models > Face points -------------------------------------------------------
const Editor = require('../src/database/Database3DEditor.js');
const Rigger = require('../src/database/ModelRigger.js');

/** A Face points editor on a head bone a tile up, twice life size, with no page behind it. */
function faceEditor(t, landmarks) {
    const previous = [global.Reactor3D, global.ModelRigger];
    global.Reactor3D = R; global.ModelRigger = Rigger;
    t.after(() => { [global.Reactor3D, global.ModelRigger] = previous; });
    const e = new Editor({}, {}), object = new THREE.Group(), head = new THREE.Bone();
    head.name = 'Head'; head.position.y = 1; object.add(head); object.scale.setScalar(2); object.updateMatrixWorld(true);
    e._object = object; e._template = { userData: { glbSize: { x: 1, y: 2, z: 1 } } };
    e.partNames = ['Head']; e.customParts = []; e.landmarks = landmarks;
    e._detail = { querySelector: () => null };
    e.deselectPart = e._stopEffectPreview = e._rebuildInstance = e._buildRigVisuals = e.renderRigBar = e.renderEditCard = () => {};
    e._t = text => text; e._modelRecordStatus = () => {}; e.rulesPath = () => '/unused/model.json';
    return { e, object, head };
}

test('Face points shows a ring worked out from three old points, and the mouth as two targets', t => {
    const { e } = faceEditor(t, { eyes: { part: 'Head', offset: [0, 0.8, 0.2] }, mouth: { part: 'Head', offset: [0, 0.7, 0.2] },
        upperLip: { part: 'Head', offset: [0, 0.72, 0.2] }, lowerLip: { part: 'Head', offset: [0, 0.68, 0.2] } });
    assert.equal(e.enterRigMode(true), true);
    assert.equal(e._mouthRingDerived, true, 'worked out, not yet saved');
    assert.equal(e._hasMouthRing(), true);
    const ring = Editor.MOUTH_RING;
    assert.deepEqual(ring.map(m => m.ring), KEYS, 'the markers are the runtime\'s ring, in its order');
    assert.deepEqual(e._rigMarkerDefinitions().map(m => m.key), ['eyes', 'mouth'].concat(ring.map(m => m.key)), 'the lips are not markers of their own any more');
    for (const marker of ring) if (marker.mirror) assert.equal(ring.find(m => m.key === marker.mirror).mirror, marker.key, 'left and right name each other');
    // The upper and lower middles sit twice as far out as the old lip points did, the corners level with the mouth.
    assert.ok(near(e._rigMarkers.mouthUpperM[1], 1.74) && near(e._rigMarkers.mouthLowerM[1], 1.66));
    assert.ok(near(e._rigMarkers.mouthCornerL[1], 1.7) && e._rigMarkers.mouthCornerL[0] > 0 && near(e._rigMarkers.mouthCornerR[0], -e._rigMarkers.mouthCornerL[0]));
    // One target shows at a time: the eyes alone, or the mouth's middle with its eight markers.
    e._facePoint = 'eyes';
    assert.deepEqual(e._rigMarkerDefinitions().filter(m => e._faceMarkerVisible(m.key)).map(m => m.key), ['eyes']);
    e._facePoint = 'mouth';
    assert.equal(e._rigMarkerDefinitions().filter(m => e._faceMarkerVisible(m.key)).length, 9);
    assert.equal(e._mouthRingShape().kind, 'outline');
});

test('Save face points writes the ring in the mouth\'s own part, with the three old points worked out from it, and reopens it as saved', t => {
    const { e, object, head } = faceEditor(t, { mouth: { part: 'Head', offset: [0, 0.7, 0.2] } });
    e.enterRigMode(true);
    // The author shapes it: a wider mouth with a raised left corner, and the lower lip pulled down.
    e._rigMarkers.mouthCornerL = [0.09, 1.71, 0.2]; e._rigMarkers.mouthCornerR = [-0.09, 1.7, 0.2]; e._rigMarkers.mouthLowerM = [0, 1.66, 0.21];
    e._faceBindings.mouth = 'Head'; e._faceBindings.upperLip = ''; e._faceInterior = 'none';
    assert.equal(e._faceMouthOpen, 1, 'a mouth opens as far as usual until it is told otherwise');
    assert.equal('open' in e._facePointRecords().mouth, false);
    e._faceMouthOpen = 1.5;
    let written;
    e._readSidecarForUpdate = () => JSON.stringify({ rig: { bones: [{ name: 'Head' }] }, custom: 7 });
    e._writeFileAtomic = (fs, file, text) => { written = JSON.parse(text); };
    e.saveFacePoints();
    assert.equal(written.custom, 7); assert.deepEqual(written.rig, { bones: [{ name: 'Head' }] });
    const mouth = written.landmarks.mouth;
    assert.deepEqual(Object.keys(mouth.outline), KEYS);
    assert.equal(mouth.interior, 'none'); assert.equal(mouth.open, 1.5);
    // Part-local: the head bone stands a tile up, so a marker at model height 1.71 is 0.71 above it.
    mouth.outline.cornerL.forEach((v, i) => assert.ok(near(v, [0.09, 0.71, 0.2][i])));
    // Mouth is the lip line's middle; the lips are the ring's upper and lower middles, on the mouth's part.
    const upper = e._rigMarkers.mouthUpperM, lower = [0, 1.66, 0.21];
    mouth.offset.forEach((v, i) => assert.ok(near(v, (upper[i] + lower[i]) / 2 - (i === 1 ? 1 : 0))));
    assert.equal(written.landmarks.upperLip.part, 'Head'); assert.equal(written.landmarks.lowerLip.part, 'Head');
    written.landmarks.lowerLip.offset.forEach((v, i) => assert.ok(near(v, lower[i] - (i === 1 ? 1 : 0))));
    // What the game reads from the file is that ring, in rest space.
    const read = R.readModelLandmarks({ landmarks: written.landmarks });
    assert.deepEqual(Object.keys(read.mouth.outline), KEYS);
    R.bindModelLandmarks(object, read);
    assert.equal(object.__reactorLandmarkRest.open, 1.5);
    const rest = object.__reactorLandmarkRest.outline;
    rest[0].toArray().forEach((v, i) => assert.ok(near(v, [0.09, 1.71, 0.2][i])), 'rest space is the model\'s own, whatever its scale in the scene');
    // Reopened: the ring as saved, no longer worked out.
    const before = structuredClone(e._rigMarkers);
    e.landmarks = written.landmarks;
    assert.equal(e.enterRigMode(true), true);
    assert.equal(e._mouthRingDerived, false); assert.equal(e._faceMouthOpen, 1.5);
    for (const marker of Editor.MOUTH_RING) e._rigMarkers[marker.key].forEach((v, i) => assert.ok(near(v, before[marker.key][i])));
    // A head that moves carries the ring with it.
    head.position.y = 1.5; object.updateMatrixWorld(true);
    assert.ok(near(R.modelLandmarkWorld(object, 'mouth').y, 2 * (1.5 + mouth.offset[1])));
});

test('the Face points card keeps a single point\'s numbers under Advanced and gives the ring no sliders', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/database/Database3DEditor.js'), 'utf8');
    assert.match(source, /advanced\.className = 'r3d-face-advanced'/);
    assert.match(source, /const ring = key === 'mouth' && this\._hasMouthRing\(\);\s+if \(!ring\) \{/);
    assert.match(source, /if \(this\._rigFaceMode\) \{ this\._dragFaceMarker\(key, clientX, clientY, modifiers\); return; \}/, 'a face marker has its own drag');
    assert.match(source, /if \(ringMarker\.mirror && !\(modifiers && modifiers\.altKey\)\)/, 'sides mirror unless Alt is held');
    assert.match(source, /resize: !!\(modifiers && modifiers\.shiftKey\) && !!ringMarker/, 'Shift resizes about the middle');
    assert.match(source, /if \(key === 'mouth'\) \{\s+\/\/ The whole mouth/, 'the middle dot carries the whole ring');
    const i18n = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/I18nDeepTranslations.js'), 'utf8');
    assert.match(source, /open\.className = 'r3d-face-mouth-open'/, 'how far the mouth opens is one slider');
    for (const text of ['Left corner', 'Right corner', 'Mouth opening']) assert.equal((i18n.match(new RegExp('"' + text + '": ', 'g')) || []).length, 17, text + ' in every locale');
});
