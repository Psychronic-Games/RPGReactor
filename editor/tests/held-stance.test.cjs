'use strict';
/**
 * A long gun held in both hands turns the chest into a shooter's stance (Reactor3D.Held.blade). The turn is laid
 * over the pose each frame and must not build up: on a body whose chest the model's own motion does not write every
 * frame (the Demo's Fleagus, a Mixamo body, turns its file's Spine, which only a walk or run clip moves) every frame's
 * turn went on top of the last one, so in Database > Action Sequences > Sniper Shot the shooter spun round with the
 * gun some plays and not others, and stayed turned after putting it away. Behavioral, against the real three.js and
 * the Battle Room's holding code; the second test plays Sniper Shot's hold on the Demo's own models.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
global.Reactor3D = Reactor3D;
Reactor3D._loadGlbTexture = () => null;
const B = global.ReactorBattleData = require(path.join(repoRoot, 'editor', 'src', 'battle', 'BattleData.js'));
const View = global.ReactorBattleRoomView = require(path.join(repoRoot, 'runtime', 'reactor_battle_room.js'));

const yawOf = node => { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion())); return Math.atan2(f.x, f.z) * 180 / Math.PI; };
const barrelYaw = object => { object.updateMatrixWorld(true); const s = Reactor3D.heldShape(object), a = new THREE.Vector3().fromArray(s.axis).transformDirection(object.matrixWorld); return Math.atan2(a.x, a.z) * 180 / Math.PI; };
const turnBetween = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180 / Math.PI;

const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d, 8, 6, 2); g.translate(x, y, z); return new THREE.Mesh(g, new THREE.MeshBasicMaterial()); };
/** A body facing +z with short arms (a long gun's fore grip is out of the other hand's reach square on): Chest > shoulders > arms, five marked fingers a hand. */
function body() {
    const joint = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); parent.add(b); return b; };
    const root = new THREE.Group(), chest = joint('Chest', root, 0, 1.2, 0), head = joint('Head', chest, 0, .35, 0), arms = [];
    for (const [side, sign] of [['Right', -1], ['Left', 1]]) {
        const shoulder = joint(side + 'Shoulder', chest, sign * .2, .2, 0), upper = joint(side + 'UpperArm', shoulder, 0, 0, 0), fore = joint(side + 'LowerArm', upper, 0, -.25, 0), hand = joint(side + 'Hand', fore, 0, -.25, 0);
        const points = {};
        for (const [name, base, tip] of [['thumb', [.02, -.06, .05], [.02, -.10, .07]], ['index', [0, -.10, .03], [0, -.16, .03]], ['middle', [0, -.10, .01], [0, -.17, .01]], ['ring', [0, -.10, -.01], [0, -.16, -.01]], ['pinky', [0, -.10, -.03], [0, -.15, -.03]]])
            points[name] = { base: [-sign * base[0], base[1], base[2]], tip: [-sign * tip[0], tip[1], tip[2]] };
        Reactor3D.attachRigFingers(root, hand, side, points, null);
        arms.push(upper, fore, hand);
    }
    root.userData.glbSize = { x: .6, y: 1.8, z: .3 };
    root.updateMatrixWorld(true);
    return { root, chest, head, arms };
}

test('a long gun\'s stance turns the chest once a frame, however often the hold is laid, and comes off when the gun is put away', () => {
    const view = new View({}, {}, { projection: '3d', camera: {} }, {});
    const a = body(), rest = a.arms.map(j => j.quaternion.clone()), chestRest = a.chest.quaternion.clone();
    const rifle = new THREE.Group(); rifle.add(box(1.4, .06, .05, 0, 0, 0), box(.14, .14, .05, -.63, -.07, 0), box(.06, .16, .05, -.3, -.1, 0)); rifle.userData.glbSize = { x: 1.4, y: .2, z: .05 };
    view.models.set('user', { object: a.root, extent: a.root.userData.glbSize, scale: 1, position: { x: 3, y: 5, z: 0, facing: 0 } });
    view.models.set('gun', { object: rifle, scale: 1, spec: {}, position: { x: 0, y: 0, z: 0 } });
    a.root.position.set(3.5, 0, 5.5); a.root.updateMatrixWorld(true);
    const step = { type: 'weapon', mode: 'show', attachment: 'rightHand', hands: 'both', aim: 'target', hold: 'fist', gripY: 0 };
    const at = { x: 3, y: 12, z: 0, height: 1.2 }, pose = { x: 3, y: 5, z: 0, facing: 0 };
    // The model's own motion this frame: the arms go back to their pose, the chest is not touched (a file joint no clip writes).
    const motion = () => { a.arms.forEach((j, i) => j.quaternion.copy(rest[i])); a.root.updateMatrixWorld(true); };
    const hold = () => view.holdHeld('user', 'gun', step, pose, at, { ...B.heldPlacement(pose, 0, step, {}), visible: true });
    const stances = [], aims = [];
    let turned = 0;
    const blade = Reactor3D.Held.blade;
    Reactor3D.Held.blade = function () { const angle = blade.apply(this, arguments); if (angle) turned++; return angle; };
    try {
        for (let frame = 0; frame < 12; frame++) {
            motion();
            // The editor's preview lays every hold twice a paint (paintProps, then its hold updater); the battle once from the spriteset and once from the room.
            hold(); hold();
            Reactor3D.HandGrip.update();
            stances.push(a.chest.quaternion.clone()); aims.push(barrelYaw(rifle));
        }
    } finally { Reactor3D.Held.blade = blade; }
    assert.ok(turned > 0, 'the fore grip is out of reach square on, so the chest turns into a stance');
    const first = stances[0];
    assert.ok(turnBetween(first, chestRest) > 1, 'the chest has turned');
    for (let i = 1; i < stances.length; i++) assert.ok(turnBetween(stances[i], first) < .5, `frame ${i}: the stance is the same turn every frame (${turnBetween(stances[i], first).toFixed(1)} degrees off)`);
    for (const yaw of aims) assert.ok(Math.abs(yaw - aims[0]) < .5 && Math.abs(yaw) < 5, `the barrel stays on the target (yaw ${yaw.toFixed(1)})`);
    // Put away: no hold lays the stance this frame, and the chest goes back to its pose.
    motion();
    Reactor3D.HandGrip.update();
    assert.ok(turnBetween(a.chest.quaternion, chestRest) < 1e-3, 'the chest is back as it was once the gun is put away');
    assert.equal(Reactor3D.Held.stances.size, 0);
    // A chest the motion does write is left as the motion wrote it.
    motion(); hold();
    const posed = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .3);
    a.chest.quaternion.copy(posed);
    Reactor3D.HandGrip.update(); Reactor3D.HandGrip.update();
    assert.ok(a.chest.quaternion.equals(posed), 'a pose written over the stance is kept');
});

// The Demo's Fleagus holding the Brass Marksman Rifle (weapon 62, the Railgun Rifle model) through Sniper Shot (#35).
const demo = path.join(repoRoot, 'template', 'Demo');
const fleagus = path.join(demo, '3d', 'Actors', 'Fleagus', 'source', 'Fleagus.glb'), railgun = path.join(demo, '3d', 'Weapons', 'Railgun Rifle', 'source', 'Railgun-Rifle.glb');
test('Sniper Shot on the Demo\'s Fleagus: the rifle stays on the target every frame of every play, and he stands square again after', { skip: !(fs.existsSync(fleagus) && fs.existsSync(railgun)) && 'the Demo models are not in this tree' }, async () => {
    const glbParts = bytes => {
        const buffer = new Uint8Array(bytes).buffer, data = new DataView(buffer);
        let offset = 12, json = null, bin = null;
        while (offset + 8 <= data.byteLength) {
            const length = data.getUint32(offset, true), type = data.getUint32(offset + 4, true), at = offset + 8;
            if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(buffer, at, length)));
            else if (type === 0x004E4942) bin = new Uint8Array(buffer, at, length);
            offset = at + length;
        }
        return { json, bin };
    };
    const assets = { async model(spec) {
        const dir = path.join(demo, '3d', spec.name), file = path.join(dir, 'model.json'), sidecar = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
        const parts = glbParts(fs.readFileSync(path.join(dir, 'source', spec.file + spec.ext))), template = Reactor3D.buildGlbTemplate(parts.json, parts.bin, '', null);
        Reactor3D.groundAnimatedTemplate(template, sidecar);
        return { template, sidecar };
    } };
    const sequence = JSON.parse(fs.readFileSync(path.join(demo, 'data', 'ActionSequences.json'), 'utf8'))[35], bindings = JSON.parse(fs.readFileSync(path.join(demo, 'data', 'Database.r3d.json'), 'utf8'));
    const view = new View({}, {}, { projection: '3d', camera: {} }, assets);
    view.scene = new THREE.Scene(); view.light = () => {};
    await view.addModel('user', Reactor3D.normalizeModelSpec(bindings.actors['1'].battler), { x: 0, y: 0, z: 0 });
    await view.addModel('extra:held:user', Reactor3D.normalizeModelSpec(bindings.weapons['62']), { x: 0, y: 0, z: 0 });
    const user = view.models.get('user'), gun = view.models.get('extra:held:user');
    assert.ok(user.object && gun.object, 'both models built');
    // As the sequence editor previews it: the user at home facing the target, the step's pose rules, the hold laid twice a paint.
    const homes = { user: { x: 3, y: 5.5, z: 0 }, target: { x: 11, y: 5.5, z: 0 }, target0: { x: 11, y: 5.5, z: 0 } };
    homes.user.facing = B.facingToward(homes.user, homes.target); homes.target.facing = homes.target0.facing = B.facingToward(homes.target, homes.user);
    const context = { homes, target: homes.target, direction: 1 }, plan = B.posePlan(sequence, () => 0);
    user.rules = user.rules.concat(Object.values(plan.rules).flat());
    const torso = Reactor3D.Held.torso(user, 'right'), chest = torso.chest;
    const cues = B.timeline(sequence), end = cues.at(-1).end;
    const paint = frame => {
        const poses = Object.fromEntries(Object.entries(B.previewVisuals(sequence, frame, context).poses).map(([k, p]) => [k, B.visualPose(p)])), p = poses.user;
        let motion = null, held = null;
        for (const cue of cues) { if (cue.start > frame) break; const step = { ...B.commandDefaults(cue.step.type), ...cue.step };
            if (step.type === 'motion' && B.roleKey(step) === 'user') motion = { name: B.motionActionName(step, plan), frame: cue.start };
            if (step.type === 'weapon' && B.roleKey(step) === 'user') held = B.weaponMode(step) === 'hide' ? null : step; }
        view.place('user', { ...p, facing: p.facing ?? B.facingToward(p, poses.target) });
        Reactor3D.applyModelAnimation(user.binding, user.rules, { frame, moving: false, distance: 0, scale: user.scale, action: motion && motion.name !== 'idle' ? motion : null, seek: true });
        user.object.updateMatrixWorld(true);
        let yaw = null;
        if (held) {
            const at = { ...poses.target0, height: 1.2 }, point = view.attachmentPoint('user', held, p), placement = { ...B.heldPlacement(point, p.facing || 0, held, bindings.weapons['62']), visible: true };
            view.holdHeld('user', 'extra:held:user', held, p, at, placement); view.holdHeld('user', 'extra:held:user', held, p, at, placement);
            yaw = barrelYaw(gun.object);
        }
        Reactor3D.HandGrip.update();
        return yaw;
    };
    paint(end);
    const square = yawOf(chest);
    for (const stride of [1, 1.37, 2.9]) {
        // Every stride ends on the sequence's last frame, as the preview's playback does, after the rifle is put away.
        for (let frame = 0; frame < end + stride; frame += stride) {
            frame = Math.min(frame, end);
            const yaw = paint(frame);
            // The target stands straight down +x from the shooter: a yaw of 90 degrees.
            if (yaw !== null) assert.ok(Math.abs(yaw - 90) < 6, `stride ${stride}, frame ${frame.toFixed(2)}: the barrel points at the target (yaw ${yaw.toFixed(1)})`);
        }
        assert.ok(Math.abs(yawOf(chest) - square) < .5, `stride ${stride}: after the shot the chest is square again (${yawOf(chest).toFixed(1)} against ${square.toFixed(1)})`);
    }
});
