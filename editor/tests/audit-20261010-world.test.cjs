'use strict';
// Audit of 2026-10-10, the world's side of the runtime: the party's followers
// (runtime/reactor_objects_followers.js) and the doors of a 3D map
// (runtime/reactor_3d_doors.js). Each test is a way the game went wrong.
const assert = require('node:assert/strict');
const test = require('node:test');
const { followerWorld } = require('./helpers/follower-world.cjs');

const tiles = list => Array.from(list, f => f.x + ',' + f.y).join(' ');

/** A party of four that has walked five tiles east: three followers in a file behind the leader. */
function walked(options = {}) {
    const w = followerWorld(Object.assign({ width: 60, start: [10, 12] }, options));
    const p = w.$gamePlayer, F = p.followers();
    w.walk(6, 5); w.rest();
    return { w, p, F };
}

//-----------------------------------------------------------------------------
// Followers

test('Gather Followers ends although a follower is given an order while the party gathers', () => {
    for (const order of ['stay', 'route']) {
        const { w, p, F } = walked();
        const interpreter = new w.Game_Interpreter();
        interpreter.setup([{ code: 217, indent: 0, parameters: [] }, { code: 121, indent: 0, parameters: [5, 5, 0] }, { code: 0, indent: 0, parameters: [] }], 0);
        interpreter.update();
        assert.equal(F.areGathering(), true);
        // Another event (a parallel one) gives the last follower something to do meanwhile.
        if (order === 'stay') F.order(3, 'stay');
        else F.route(3, { repeat: false, skippable: true, wait: false, list: [{ code: 1 }, { code: 1 }, { code: 0 }] });
        let frames = 0;
        while (interpreter.isRunning() && frames < 1200) { interpreter.update(); w.run(1); frames++; }
        assert.equal(w.$gameSwitches.value(5), true, `${order}: the event goes on after the gather`);
        assert.equal(F.areGathering(), false, `${order}: the gather is over`);
        assert.ok(F._data[0].pos(p.x, p.y) && F._data[1].pos(p.x, p.y), `${order}: those that follow stand on the leader`);
        assert.ok(F._data[2].rrIsHeld(), `${order}: the one on its own is still on its own`);
    }
});

test('a follower given an order while it fades in is seen: back on foot after a ride, and brought behind the party', () => {
    // Back on foot: the followers fade in on the leader's tile, and an event sends them off at once.
    {
        const { w, p, F } = walked();
        F.rrAboard(true); w.run(20);
        w.walk(6, 3);
        F.rrAboard(false);
        w.run(2);
        assert.ok(F._data[0].opacity() < 255, 'the fade is under way');
        F.order(1, 'goto', { x: 20, y: 15 });
        F.order(2, 'stay');
        F.route(3, { repeat: false, skippable: true, wait: false, list: [{ code: 1 }, { code: 1 }, { code: 0 }] });
        w.run(300);
        assert.deepEqual(Array.from(F._data, f => f.opacity()), [255, 255, 255], 'each is as solid as the leader');
        assert.deepEqual([F._data[0].x, F._data[0].y], [20, 15], 'and the one sent to a tile walked there');
        assert.equal(p.opacity(), 255);
    }
    // Brought behind the party by the formation, and told to stay before the fade is over.
    {
        const { w, F } = walked();
        F.setFormation('rank');
        w.walk(6, 3); w.rest();
        const last = F._data[2];
        F.rrBring(last, F._rrTrail);
        w.run(3);
        assert.ok(last.opacity() < 255);
        F.order(3, 'stay');
        w.run(60);
        assert.equal(last.opacity(), 255);
    }
});

test('a follower given an order while it fades to go aboard stays out of the vehicle, seen and solid', () => {
    const { w, p, F } = walked();
    const first = F._data[0], at = tiles([first]);
    F.rrAboard(true);
    w.run(6);
    assert.ok(first.opacity() < 255 && first.isVisible(), 'the fade is under way');
    F.order(1, 'stay');
    w.run(40);
    assert.equal(first.opacity(), 255, 'it is as solid as the leader');
    assert.equal(first.isVisible(), true);
    assert.equal(first._rrAboard, false, 'it did not go aboard');
    assert.deepEqual([F._data[1].isVisible(), F._data[2].isVisible()], [false, false], 'the others did');
    assert.equal(F.rrHeldAt(first.x, first.y, p), true, 'and it is in the leader\'s way');
    w.walk(6, 3);
    F.rrAboard(false);
    w.run(40);
    assert.equal(tiles([first]), at, 'it is where it was told to stay');
    assert.equal(first.opacity(), 255);
    assert.equal(tiles([F._data[1], F._data[2]]), `${p.x},${p.y} ${p.x},${p.y}`, 'the others are back with the leader');
    // Told to follow during the next ride, it goes aboard with the others as ever.
    F.rrAboard(true); w.run(20);
    F.order(1, 'follow');
    w.run(40);
    assert.equal(first.isVisible(), false);
});

/** A platform five tiles up over x 2..12, y 2..5 with a ladder on its south face at (7, 6); the party four tiles south of it. */
function ladderWorld(formation) {
    const pieces = [];
    for (let x = 2; x <= 12; x++) for (let y = 2; y <= 5; y++) for (let z = 0; z < 5; z++) pieces.push({ id: pieces.length + 1, kind: 'block', x, y, z, rot: 0, material: '' });
    for (let z = 0; z < 5; z++) pieces.push({ id: pieces.length + 1, kind: 'ladder', x: 7, y: 6, z, rot: 2, material: '' });
    const w = followerWorld({ flat: false, width: 20, height: 20, start: [7, 14], sidecar: { pieces } });
    const p = w.$gamePlayer, F = p.followers();
    if (formation) F.setFormation(formation);
    w.walk(8, 4); w.rest();
    return { w, p, F };
}
const heightOf = c => (Number.isFinite(c._reactorAlt) ? c._reactorAlt : c._reactorGround || 0);

test('up a ladder with one follower out of the line: those behind it climb after the leader, and nobody walks into the wall', () => {
    for (const formation of [null, 'wedge']) {
        for (const held of [1, 2]) {
            const { w, p, F } = ladderWorld(formation), label = `${formation || 'stock file'}, follower ${held} stays`;
            F.order(held, 'stay');
            const stays = F._data[held - 1], at = tiles([stays]);
            const follow = Array.from(F._data).filter(f => f !== stays);
            w.walk(8, 4);
            // Frames a follower spends inside the platform, under its top, off the ladder.
            let inside = 0;
            const each = () => { for (const f of follow) if (f.x >= 2 && f.x <= 12 && f.y >= 2 && f.y <= 5 && heightOf(f) < 4.5 && !f._reactorOnLadder) inside++; };
            w.hold(8);
            w.run(900, () => { each(); return p.y <= 5 && !p.isMoving(); });
            w.hold(0);
            assert.ok(heightOf(p) > 4.9, `${label}: the leader is on top`);
            w.run(600, each);
            w.walk(8, 2);
            w.run(900, each);
            assert.equal(inside, 0, `${label}: nobody walked into the platform under its top`);
            assert.ok(follow.every(f => heightOf(f) > 4.9 && f.y <= 5), `${label}: the two that follow climbed after the leader (${follow.map(f => f.x + ',' + f.y + '@' + heightOf(f).toFixed(1)).join(' ')})`);
            assert.equal(tiles([stays]), at, `${label}: the one told to stay is where it was`);
            assert.ok(heightOf(stays) < 0.1);
        }
    }
});

test('a follower on a route or sent to a tile is not drawn onto the ladder its leader climbs', () => {
    const { w, p, F } = ladderWorld(null);
    const first = F._data[0], second = F._data[1];
    // The first walks two tiles east and waits there; the second is sent to the far corner.
    F.route(1, { repeat: false, skippable: true, wait: false, list: [{ code: 3 }, { code: 3 }, { code: 15, parameters: [900] }, { code: 0 }] });
    F.order(2, 'goto', { x: 15, y: 15 });
    w.run(80);
    const waits = tiles([first]);
    assert.equal(first.isMoveRouteForcing(), true, 'its route has it wait');
    w.walk(8, 4);
    w.hold(8);
    w.run(600, () => p._reactorOnLadder && p._reactorAlt > 2);
    w.hold(0);
    assert.equal(p._reactorOnLadder, true, 'the leader is on the ladder');
    w.run(240);
    assert.equal(tiles([first]), waits, 'the one on a route waits where its route has it');
    assert.ok(heightOf(first) < 0.1, 'on the ground');
    assert.deepEqual([second.x, second.y], [15, 15], 'and the one sent to a tile came to it');
});

//-----------------------------------------------------------------------------
// Doors

/** A 3D room: a wall along y = 5 with one doorway at x = 6 and a door hung in it. */
function doorWorld(door, start) {
    const pieces = [];
    let id = 1;
    for (let x = 2; x <= 12; x++) pieces.push({ id: id++, kind: x === 6 ? 'doorway' : 'wall', x, y: 5, z: 0, rot: 0, material: 'Stone' });
    pieces.push(Object.assign({ id: 50, kind: 'door', x: 6, y: 5, z: 0, rot: 0, material: 'Wood', width: 1 }, door));
    const w = followerWorld({ width: 20, height: 20, flat: false, party: [1], start, sidecar: { elevation: new Array(400).fill(0), pieces } });
    const R = w.Reactor3D;
    w.played = [];
    w.fed = [];
    w.AudioManager.playSe = se => w.played.push(se.name);
    w.ReactorEvents.on('doorOpened', payload => w.fed.push('opened ' + payload.id));
    /** The map's 3D scene as the map screen builds it, as far as doors go: a new one each time the screen is made. */
    w.buildScene = () => {
        if (w.scene) w.scene.removeDoors();
        const scene = w.scene = Object.create(R.MapScene.prototype);
        const group = new w.THREE.Group();
        scene.piecesGroup = () => group;
        scene.pieceMaterial = () => new w.THREE.MeshBasicMaterial();
        scene.addDoors(w.$dataMap, () => null);
        return scene;
    };
    /** Frames of the game with the doors' own frame, as the map screen runs them. */
    w.play = frames => { for (let i = 0; i < frames; i++) { w.run(1); w.scene.updateDoorsFrame([w.$gamePlayer]); } };
    /** Walks the leader one tile by the keys; false when it could not. */
    w.step = direction => {
        const p = w.$gamePlayer, x = p.x, y = p.y;
        w.hold(direction);
        for (let i = 0; i < 40 && p.x === x && p.y === y; i++) w.play(1);
        for (let i = 0; i < 40 && p.isMoving(); i++) w.play(1);
        w.hold(0);
        return p.x !== x || p.y !== y;
    };
    w.buildScene();
    return w;
}

test('a door is as it was left when the map screen is made again: nobody is shut in its doorway by the menu', () => {
    const w = doorWorld({ opens: 'action' }, [6, 7]);
    const R = w.Reactor3D, p = w.$gamePlayer;
    assert.equal(w.step(8), true);
    assert.equal(w.step(8), false, 'a shut door is a wall');
    p.setDirection(8);
    assert.equal(R.doorAction(p), true, 'OK facing it opens it');
    w.play(R.DOOR_SWING_FRAMES + 2);
    assert.equal(R._doorStates.get(50).t, 1);
    assert.equal(w.step(8), true, 'and the leader walks into the doorway');
    assert.deepEqual([p.x, p.y], [6, 5]);
    // The menu is opened and closed: the map screen and its 3D scene are made again for the same map.
    w.buildScene();
    const state = R._doorStates.get(50);
    assert.equal(state.open, true, 'the door is still open');
    assert.equal(state.t, 1);
    w.play(2);
    assert.ok(Math.abs(w.scene._doors[0].leaves[0].mesh.rotation.y - w.scene._doors[0].leaves[0].yaw) > 1.5, 'and its new leaf stands open');
    assert.equal(w.step(8), true, 'the leader walks on through');
    assert.deepEqual([p.x, p.y], [6, 4]);
});

test('a door somebody stands in is open when the map is entered: a save made in a doorway loads free to walk', () => {
    const w = doorWorld({ opens: 'action' }, [6, 7]);
    const R = w.Reactor3D;
    w.step(8);
    w.$gamePlayer.setDirection(8);
    R.doorAction(w.$gamePlayer);
    w.play(R.DOOR_SWING_FRAMES + 2);
    w.step(8);
    assert.deepEqual([w.$gamePlayer.x, w.$gamePlayer.y], [6, 5]);
    w.saveAndLoad();
    w.buildScene();
    const p = w.$gamePlayer;
    assert.deepEqual([p.x, p.y], [6, 5], 'the save was made in the doorway');
    assert.equal(R._doorStates.get(50).open, true, 'the door stands open round the leader');
    w.play(2);
    assert.equal(w.step(2), true, 'who walks out of it');
    // Another door of the map, with nobody in it, is shut as ever; and this one shuts again once it is left.
    assert.equal(w.step(2), true);
    w.play(300);
    assert.equal(R._doorStates.get(50).open, false, 'left alone, it shuts');
    const fresh = doorWorld({ opens: 'action' }, [6, 7]);
    assert.equal(fresh.Reactor3D._doorStates.get(50).open, false, 'a door nobody stands in starts shut');
});

test('OK facing an unlocked door that stands open leaves it alone: it is an automatic door, with no second opening', () => {
    const w = doorWorld({ opens: 'locked', lock: { switch: 3 } }, [6, 8]);
    const R = w.Reactor3D, p = w.$gamePlayer;
    p.setDirection(8);
    w.play(5);
    assert.equal(R._doorStates.get(50).open, false, 'locked: shut');
    w.$gameSwitches.setValue(3, true);
    assert.equal(w.step(8), true);
    assert.equal(w.step(8), true);
    w.play(R.DOOR_SWING_FRAMES + 2);
    const state = R._doorStates.get(50);
    assert.deepEqual([p.x, p.y], [6, 6], 'the leader stands before the door');
    assert.equal(state.open, true, 'unlocked, it opens for whoever walks up');
    assert.deepEqual(w.fed, ['opened 50']);
    const opened = w.played.filter(name => name === 'door-open-01').length;
    assert.equal(opened, 1);
    // OK, facing the open door.
    const taken = R.doorAction(p);
    w.play(3);
    assert.equal(taken, false, 'the press is not the door\'s');
    assert.equal(state.open, true);
    assert.equal(state.t, 1, 'the leaf did not move');
    assert.deepEqual(w.fed, ['opened 50'], 'and nothing was told it opened again');
    assert.equal(w.played.filter(name => name === 'door-open-01').length, opened, 'nor did it sound again');
});

//-----------------------------------------------------------------------------
// Controls

test('a battle key that is also the project\'s jump key is the battle\'s until the battle ends, and is given back exactly', () => {
    const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
    const runtime = path.resolve(__dirname, '..', '..', 'runtime');
    for (const mode of ['action', 'tactical']) {
        // The project jumps on Q (Page Up everywhere else); an action battle changes weapons on Q, and the project's
        // own tactical keys turn the view with it.
        const c = { console: { warn() {}, info() {} }, $dataSystem: { reactorControls: { jumpKeys: [81], jumpButtons: [], tacticalKeys: { 81: 'viewLeft', 87: 'viewRight' } } }, $dataMap: { reactor3d: {} },
            Input: { keyMapper: { 13: 'ok', 32: 'ok', 81: 'pageup', 87: 'pagedown', 27: 'escape' }, gamepadMapper: { 0: 'ok', 2: 'shift' }, _currentState: {} } };
        c.window = c; c.globalThis = c;
        vm.createContext(c);
        vm.runInContext('class Scene_Map {}; globalThis.Scene_Map = Scene_Map; globalThis.Reactor3D = { isMap3D: () => true };', c);
        for (const file of ['reactor_controls.js', 'reactor_physics.js']) vm.runInContext(fs.readFileSync(path.join(runtime, file), 'utf8'), c, { filename: file });
        const C = c.ReactorControls, scene = vm.runInContext('new Scene_Map()', c);
        const battle = on => (mode === 'action' ? C.setAction(on) : C.setTactical(on));
        const inBattle = mode === 'action' ? 'weapon' : 'viewLeft';
        C.setField3D(true);
        assert.equal(c.Input.keyMapper[81], 'jump', `${mode}: Q jumps on the 3D map`);
        battle(true);
        assert.equal(c.Input.keyMapper[81], inBattle, `${mode}: the battle has Q`);
        // The check that runs about once a second on the map.
        C.checkField3D(scene);
        assert.equal(c.Input.keyMapper[81], inBattle, `${mode}: and keeps it for as long as it runs`);
        battle(false);
        assert.equal(c.Input.keyMapper[81], 'jump', `${mode}: after the battle Q jumps again`);
        C.setField3D(false);
        assert.equal(c.Input.keyMapper[81], 'pageup', `${mode}: and off the map it is Page Up, as it was`);
    }
});
