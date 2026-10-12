'use strict';
// What the player sees in a battle on the map (runtime/reactor_fight_action.js,
// reactor_fight.js, reactor_fight_stage.js): the over-the-shoulder camera's
// distance and how it comes in, the look's pitch after a battle, a shake that
// is the camera's, the weapon in view drawn over the world, damage numbers
// that stay on their unit, and animations that are not drawn where nothing is.
// The 3D world is a stand-in: these are the driver's own rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fightWorld, event } = require('./helpers/fight-world.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');

global.self = global; global.window = global;
require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
const THREE = global.THREE;
const source = file => fs.readFileSync(path.join(runtimeRoot, file), 'utf8');
const unit = (id, x, y, text) => event(id, x, y, { note: `<unit: ${text}>` });
const DEG = Math.PI / 180;

/**
 * A fight world on a 3D map seen from behind the player: a stand-in Reactor3D whose camera stands eight tiles
 * back as the map's own does, and whose `cameraArm` answers from `w.wall` (how far the world lets a camera
 * stand back; Infinity in the open), `w.sideWall` (out to the side), `w.door` (the way back with a door swinging
 * shut counted), `w.sightWall` (the line from the camera's place to the player) and `w.midWall` (the way back
 * from behind the head, where that differs from the shoulder's: null is the same). The action driver is loaded
 * after it, so its camera hook is in place.
 */
function world3(options = {}) {
    const w = fightWorld({ events: options.events || [unit(1, 12, 9, 'enemy 1')] });
    w.THREE = THREE;
    w.wall = Infinity;
    w.sideWall = Infinity;
    w.door = Infinity;
    w.sightWall = Infinity;
    w.midWall = null;
    w.armCalls = 0;
    w.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 500);
    w.arms = [];
    vm.runInContext(`
        $gameMap._reactorCamera3d = { mode: "thirdPerson", pitch: null };
        Reactor3D = {
            isMap3D: () => true, shouldRender3D: () => true, groundHeightAt: () => 0, characterGround: () => 0, characterHeightTiles: () => 3,
            hasCharacterModel: () => false, viewport: () => ({ camera: () => camera }),
            cameraArmHit: false,
            characterHiddenByCamera: () => false,
            // The questions of a frame, told apart by where they start and which way they go: out to the side;
            // the way back from the shoulder ("beside", a door swinging shut counted; "back" as the world stands);
            // the way back from behind the head; the line from the camera's place to the player.
            cameraArm(map, from, to, least, margin, step, how) {
                const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
                const n = armCalls++;
                const centred = Math.hypot(from.x - $gamePlayer._realX - 0.5, from.z - $gamePlayer._realY - 0.5) < 1e-6;
                const yaw = this.Camera.look.yaw * Math.PI / 180;
                const straight = Math.abs((to.x - from.x) * Math.cos(yaw) + (to.z - from.z) * Math.sin(yaw)) < 1e-6;
                const kind = n === 0 ? "side" : centred ? (straight ? "behind" : "sight") : how === "closing" ? "beside" : "back";
                const way = kind === "behind" && midWall !== null ? midWall : wall;
                const limit = kind === "side" ? sideWall : kind === "sight" ? sightWall : how === "closing" ? Math.min(way, door) : way;
                arms.push({ kind, length, lateral: Math.hypot(from.x - $gamePlayer._realX - 0.5, from.z - $gamePlayer._realY - 0.5) });
                this.cameraArmHit = limit < length;
                return Math.max(least || 0, Math.min(length, limit));
            },
            Camera: {
                look: { yaw: 90, pitch: null, locked: false },
                MODES: { thirdPerson: { pitch: 25, fov: 45, distance: 8 }, firstPerson: { pitch: 0, fov: 70 } },
                currentState: () => $gameMap._reactorCamera3d,
                normalizeState: state => Object.assign({ pitch: null }, state),
                requestLook() {}, releaseLook() {},
                // The map's own camera: eight tiles behind the player along the look, at the look's pitch.
                update(spriteset) {
                    const live = spriteset._reactor3d, look = this.look, state = this.currentState();
                    const pitch = (look.pitch === null ? this.MODES[state.mode].pitch : look.pitch) * Math.PI / 180, yaw = look.yaw * Math.PI / 180;
                    const x = $gamePlayer._realX, z = $gamePlayer._realY, y = 1;
                    live.cameraCurrent = { mode: state.mode, x, y, z, fov: this.MODES[state.mode].fov, pitch: pitch * 180 / Math.PI, yaw: look.yaw };
                    const d = state.mode === "firstPerson" ? 0 : 8;
                    live.camera.position.set(x + 0.5 - Math.sin(yaw) * Math.cos(pitch) * d, y + Math.sin(pitch) * d, z + 0.5 + Math.cos(yaw) * Math.cos(pitch) * d);
                    live.camera.lookAt(live.camera.position.x + Math.sin(yaw) * Math.cos(pitch), live.camera.position.y - Math.sin(pitch), live.camera.position.z - Math.cos(yaw) * Math.cos(pitch));
                    live.camera.fov = live.cameraCurrent.fov;
                    live.camera.updateMatrixWorld();
                    return true;
                }
            }
        };
    `, w);
    vm.runInContext(source('reactor_fight_action.js'), w, { filename: 'reactor_fight_action.js' });
    w.spriteset = { _reactor3d: { camera: w.camera, cameraCurrent: null, scene: null } };
    /** One frame: the game, then the camera as the spriteset asks for it. */
    w.frame = (n = 1) => { for (let i = 0; i < n; i++) { w.run(1); w.Graphics.frameCount++; w.armCalls = 0; w.Reactor3D.Camera.update(w.spriteset); } };
    /** How far to the side of the player's own axis the camera stands, over the ground. */
    w.aside = () => {
        const c = w.camera.position, p = w.$gamePlayer, yaw = w.Reactor3D.Camera.look.yaw * DEG;
        return Math.abs((c.x - p._realX - 0.5) * Math.cos(yaw) + (c.z - p._realY - 0.5) * Math.sin(yaw));
    };
    /** How far the camera stands from the point over the player it looks past, along the ground and in all. */
    w.back = () => {
        const c = w.camera.position, p = w.$gamePlayer;
        return Math.hypot(c.x - (p._realX + 0.5), c.z - (p._realY + 0.5));
    };
    return w;
}
const still = w => { for (const u of w.$gameFight._units) if (u !== w.$gameFight.playerUnit()) w.$gameFight.act().ai[u.id] = Object.assign(w.ReactorFight.Action.aiOf(w.$gameFight, w.$gameFight.act(), u, w.$gameFight.character(u)), { state: 'stagger', timer: 100000 }); };
const begin = (w, mode = 'action') => { assert.ok(w.$gameFight.start({ mode }) > 0); w.frame(3); still(w); return w.$gameFight; };

test('third person: the battle camera stands back about as far as the map\'s own, and comes in at once for a wall', () => {
    const w = world3(), A = w.ReactorFight.Action;
    w.frame(2);
    assert.equal(A.SHOULDER.rest, 0.45, 'the figure a little under half the picture\'s height');
    begin(w);
    w.frame(140);
    // A three-tile figure at 0.45 of a 45 degree picture: about eight tiles, as the map's own camera stands.
    const want = A.heightOf(w.$gamePlayer) / (0.45 * 2 * Math.tan(22.5 * DEG));
    assert.ok(want > 7 && want < 8.5, 'about eight tiles: ' + want.toFixed(2));
    assert.ok(Math.abs(A._arm.back - want) < 0.05, 'in the open the whole length: ' + A._arm.back.toFixed(2));
    assert.ok(w.back() < 9, 'never the 14 tiles it stood back before: ' + w.back().toFixed(2));
    // A wall two tiles behind: the very next frame the camera is on the player's side of it.
    w.wall = 2;
    w.frame(1);
    assert.equal(A._arm.back, 2, 'at once: the picture is never the inside of a wall');
    assert.ok(w.back() < 2.6, 'the camera itself: ' + w.back().toFixed(2));
    // The wall gone, it backs off slowly: no jump out.
    w.wall = Infinity;
    w.frame(1);
    assert.ok(A._arm.back > 2 && A._arm.back < 2.6, 'a little a frame: ' + A._arm.back.toFixed(2));
    let last = A._arm.back, biggest = 0;
    for (let i = 0; i < 200; i++) { w.frame(1); biggest = Math.max(biggest, A._arm.back - last); last = A._arm.back; }
    assert.ok(biggest < 0.5, 'never more than half a tile in a frame on the way out: ' + biggest.toFixed(2));
    assert.ok(Math.abs(A._arm.back - want) < 0.05, 'and all the way back in the end');
    // Something at the shoulder: the camera tucks in behind the head instead of standing in it.
    w.sideWall = 0.2;
    w.frame(1);
    assert.equal(A._arm.side, 0.2);
    // The room to the side back, the shoulder is on its way out: the way back is asked from where the camera
    // stands now, not only from where its shoulder is going.
    w.sideWall = Infinity;
    w.arms.length = 0;
    w.frame(1);
    assert.ok(A._arm.side > 0.2 && A._arm.side < 0.4);
    assert.deepEqual(w.arms.map(arm => arm.kind), ['side', 'beside', 'beside', 'sight']);
    assert.ok(Math.abs(w.arms[1].lateral - 1.35) < 1e-6 && Math.abs(w.arms[2].lateral - A._arm.side) < 1e-6, 'from the shoulder it is going to, then from the one it is at');
    w.sideWall = 0.2;
    w.frame(1);
    // Hard against a wall it comes in to the least, and sits close behind the head, not a tile out to the side:
    // with the whole room to the side again, the camera is still tucked in while it is this close.
    w.sideWall = Infinity;
    w.frame(300);
    assert.ok(Math.abs(A._arm.side - 1.35) < 0.02, 'the side is all there again: ' + A._arm.side.toFixed(2));
    assert.ok(w.aside() > 1.2, 'at its distance the camera stands a shoulder out: ' + w.aside().toFixed(2));
    assert.equal(w.Reactor3D.characterHiddenByCamera(w.$gamePlayer, true), false, 'and the player\'s body is in the picture');
    w.wall = 0;
    w.frame(1);
    assert.equal(A._arm.back, A.SHOULDER.least);
    const c = w.camera.position, p = w.$gamePlayer;
    assert.ok(Math.hypot(c.x - p._realX - 0.5, c.z - p._realY - 0.5) < 0.6, 'tucked in');
    assert.ok(w.aside() < 0.4, 'behind the head, a quarter of the way out to the side: ' + w.aside().toFixed(2));
    // That close, the picture would be the inside of the player's own body: it is taken out, model and sprite.
    assert.equal(w.Reactor3D.characterHiddenByCamera(w.$gamePlayer, true), true, 'the body is out of the picture');
    assert.equal(w.Reactor3D.characterHiddenByCamera(w.$gamePlayer), true);
    assert.equal(w.Reactor3D.characterHiddenByCamera(w.$gameFight.character(w.$gameFight.unitOfEvent(1)), true), false, 'nobody else\'s is');
    // Only from behind the player: a map seen from above keeps the body, however short the arm was left.
    w.$gameMap._reactorCamera3d = { mode: 'isometric', pitch: null };
    assert.equal(w.Reactor3D.characterHiddenByCamera(w.$gamePlayer, true), false, 'not in a view from above');
    w.$gameMap._reactorCamera3d = { mode: 'thirdPerson', pitch: null };
    // Back when the camera has room again, a little later than it went (no flicker at the edge).
    w.wall = A.BODY_NEAR + 0.2;
    w.frame(120);
    assert.ok(Math.abs(A._arm.back - (A.BODY_NEAR + 0.2)) < 0.01);
    assert.equal(w.Reactor3D.characterHiddenByCamera(w.$gamePlayer, true), true, 'still out just past where it went');
    w.wall = A.BODY_NEAR + 0.6;
    w.frame(120);
    assert.equal(w.Reactor3D.characterHiddenByCamera(w.$gamePlayer, true), false, 'and back with room');
});

test('third person: what is built between the camera and the player, and a door swinging shut behind, bring the camera in eased', () => {
    const w = world3(), A = w.ReactorFight.Action;
    w.frame(2);
    begin(w);
    w.frame(140);
    const want = A.heightOf(w.$gamePlayer) / (0.45 * 2 * Math.tan(22.5 * DEG));
    assert.ok(Math.abs(A._arm.back - want) < 0.05);
    // The camera's own way back is clear; a pillar stands on its line to the player, three tiles from the player.
    w.sightWall = 3;
    let last = A._arm.back, biggest = 0;
    w.frame(1);
    assert.ok(A._arm.back < want - 0.5 && A._arm.back > want - 1.2, 'it starts in, not all at once (the camera is in nothing): ' + A._arm.back.toFixed(2));
    for (let i = 0; i < 60; i++) { last = A._arm.back; w.frame(1); biggest = Math.max(biggest, Math.abs(A._arm.back - last)); }
    assert.ok(biggest < 1, 'no frame moves it a tile: ' + biggest.toFixed(2));
    // Three tiles along the line to the player, as a length of the way back.
    const sight = w.arms.filter(arm => arm.kind === 'sight').pop().length;
    assert.ok(Math.abs(A._arm.back - 3 * want / sight) < 0.05, 'this side of what hid the player: ' + A._arm.back.toFixed(2));
    w.sightWall = Infinity;
    w.frame(1);
    assert.ok(A._arm.back < 3.4, 'and out slowly after');
    w.frame(300);
    assert.ok(Math.abs(A._arm.back - want) < 0.05);
    // A door four tiles behind begins to swing shut: the camera starts in at once and is there before the leaves
    // meet (fifteen frames on), so their meeting moves it a hair, not four tiles.
    w.door = 4;
    w.arms.length = 0;
    biggest = 0;
    for (let i = 0; i < 15; i++) { last = A._arm.back; w.frame(1); biggest = Math.max(biggest, Math.abs(A._arm.back - last)); }
    assert.ok(biggest < 0.8, 'eased: never most of a tile in a frame: ' + biggest.toFixed(2));
    assert.ok(A._arm.back < 4.3, 'nearly there as the door shuts: ' + A._arm.back.toFixed(2));
    assert.ok(w.arms.some(arm => arm.kind === 'back'), 'what stands on the way now is asked when something was met');
    w.wall = 4;
    last = A._arm.back;
    w.frame(1);
    assert.equal(A._arm.back, 4, 'shut: the camera is this side of it');
    assert.ok(last - A._arm.back < 0.3, 'by a hair: ' + (last - A._arm.back).toFixed(2));
    // In the open nothing is asked twice.
    w.wall = w.door = Infinity;
    w.arms.length = 0;
    w.frame(1);
    assert.deepEqual(w.arms.map(arm => arm.kind), ['side', 'beside', 'sight'], 'three things asked of the world a frame');
    // Something built right by the player (a pillar leaned on): the camera could only sit in at the head, so it
    // stays where it is and the cutaway shows the player through it.
    w.sightWall = 1;
    w.frame(300);
    assert.ok(Math.abs(A._arm.back - want) < 0.05, 'left to the cutaway: ' + A._arm.back.toFixed(2));
    assert.equal(w.Reactor3D.characterHiddenByCamera(w.$gamePlayer, true), false);
});

test('third person: where a wall shuts the way back from the shoulder only, the camera looks from behind the head at its distance', () => {
    const w = world3(), A = w.ReactorFight.Action;
    w.frame(2);
    begin(w);
    w.frame(140);
    const want = A.heightOf(w.$gamePlayer) / (0.45 * 2 * Math.tan(22.5 * DEG));
    assert.ok(Math.abs(A._arm.side - 1.35) < 0.02 && Math.abs(A._arm.back - want) < 0.05);
    // Through a doorway and a step past it: the wall beside the door is right behind the shoulder, the doorway
    // itself is open behind the head.
    w.wall = 0.45; w.midWall = Infinity;
    w.frame(1);
    assert.equal(A._arm.side, 0, 'the side comes in at once');
    assert.ok(w.aside() < 0.01, 'the camera is behind the head');
    assert.ok(Math.abs(A._arm.back - want) < 0.05, 'and keeps its distance: it did not come in by seven tiles, ' + A._arm.back.toFixed(2));
    assert.equal(w.Reactor3D.characterHiddenByCamera(w.$gamePlayer, true), false, 'the player stays in the picture');
    // Further into the room the wall is still much nearer than the way out through the door: no change.
    w.wall = 3.7;
    w.frame(30);
    assert.equal(A._arm.side, 0);
    assert.ok(Math.abs(A._arm.back - want) < 0.05);
    // The two ways about as long (the door has shut): the shoulder is the place to look from again, slowly.
    w.midWall = 4.2;
    w.frame(1);
    assert.ok(A._arm.side > 0 && A._arm.side < 0.2, 'out again a little a frame: ' + A._arm.side.toFixed(2));
    w.frame(300);
    assert.ok(Math.abs(A._arm.side - 1.35) < 0.02);
    assert.equal(A._arm.back, 3.7);
    // A wall behind both (the player's back to it) is no reason to tuck: the camera comes in as ever.
    w.midWall = null; w.wall = 2;
    w.frame(1);
    assert.ok(A._arm.side > 1.3 && A._arm.back === 2);
});

test('third person: a body on the way brings the camera in past it, eased, and out again after', () => {
    // Looking east (yaw 90) from (10,9): the camera stands to the west, a little south. The enemy at (6,9) is on the way.
    const w = world3({ events: [unit(1, 6, 9, 'enemy 1')] }), A = w.ReactorFight.Action;
    w.$gamePlayer.locate(10, 9);
    w.frame(2);
    w.$gameFight.start({ mode: 'action' });
    w.frame(1); still(w);
    const first = A._arm.back;
    // Its footprint (a sprite: 0.3 each way) lies 1.35 south of the camera's line: not on the way.
    w.frame(60);
    const want = A.heightOf(w.$gamePlayer) / (0.45 * 2 * Math.tan(22.5 * DEG));
    assert.ok(Math.abs(A._arm.back - want) < 0.05, 'a body beside the way is nothing to it: ' + A._arm.back.toFixed(2));
    // On the way: the camera's line runs 1.35 south of the player's row.
    const enemy = w.$gameFight.character(w.$gameFight.unitOfEvent(1));
    enemy._realY = enemy._y = 9 + 1.35;
    w.frame(1);
    const one = A._arm.back;
    assert.ok(one < want - 0.5 && one > want - 2.5, 'it starts in, not all at once: ' + one.toFixed(2) + ' from ' + first.toFixed(2));
    w.frame(40);
    // Four tiles between their middles: its near face is 3.7 from the shoulder, and the camera keeps 0.4 clear of it.
    assert.ok(Math.abs(A._arm.back - (4 - 0.3 - A.SHOULDER.clear)) < 0.1, 'and ends a little short of the body: ' + A._arm.back.toFixed(2));
    enemy._realY = enemy._y = 3;
    w.Graphics.frameCount += 30;
    w.frame(1);
    assert.ok(A._arm.back > 3.3 && A._arm.back < 4, "then out slowly: " + A._arm.back.toFixed(2));
    w.frame(200);
    assert.ok(Math.abs(A._arm.back - want) < 0.05);
    // A body that would stand between the camera and the player (off the camera's own way) hides the player: in past it too.
    enemy._realY = enemy._y = 9 + 1.35 * 4 / want;
    w.Graphics.frameCount += 30;
    w.frame(60);
    assert.ok(A._arm.back > 2.9 && A._arm.back < 3.6, 'in to the near side of what hid the player: ' + A._arm.back.toFixed(2));
    // A body right at the shoulder takes the room to the side, as a wall there does.
    enemy._realX = enemy._x = 10; enemy._realY = enemy._y = 10;
    w.Graphics.frameCount += 30;
    w.frame(1);
    assert.ok(A._arm.side < 1.35 && A._arm.side > 0.9, 'eased, not at once: ' + A._arm.side.toFixed(2));
    w.frame(60);
    assert.ok(Math.abs(A._arm.side - (0.7 - A.SHOULDER.clear)) < 0.05, 'the camera moves in beside the head: ' + A._arm.side.toFixed(2));
    // A body just behind the shoulder would shut the way back at once: the shoulder moves nearer the head and the
    // camera keeps its distance, rather than coming in to the head.
    enemy._realX = enemy._x = 9; enemy._realY = enemy._y = 9 + 1.35;
    w.Graphics.frameCount += 30;
    w.frame(200);
    assert.ok(Math.abs(A._arm.side - 1.35 / 2) < 0.05, 'half the way out to the side: ' + A._arm.side.toFixed(2));
    assert.ok(Math.abs(A._arm.back - want) < 0.1, 'and all the way back: ' + A._arm.back.toFixed(2));
    enemy._realX = enemy._x = 6; enemy._realY = enemy._y = 3;
    // Scenery counts where its model says what stands at walking height (a tree is its trunk); a model that is only
    // the box round its crown is no body to the camera.
    const fight = w.$gameFight, tree = { _realX: 6, _realY: 9 + 1.35, _erased: false, eventId: () => 10001, isThrough: () => false };
    const events = w.$gameMap.events, bodies = () => { A._cameraBodies.at = -1e9; const kept = A.cameraBodies(fight); return kept.list.slice(0, kept.count).filter(body => body.character === tree); };
    w.$gameMap.events = () => [tree];
    w.Reactor3D.hasCharacterModel = character => character === tree;
    w.Reactor3D.eventModelFootprint = () => ({ rawX: 7, rawZ: 7, yaw: 0, mask: null });
    assert.equal(bodies().length, 0, 'a crown\'s box is not a body');
    w.Reactor3D.eventModelFootprint = () => ({ rawX: 0.6, rawZ: 0.5, yaw: 0, mask: {} });
    assert.equal(JSON.stringify(bodies().map(body => [body.halfX, body.halfZ])), '[[0.6,0.5]]', 'a trunk is');
    // A mask's bounds can be as wide as the crown (low boughs, roots): only where it is filled stops the camera.
    tree._realX = 20; tree._realY = 20;
    const mask = { sub: 4, has: (i, j) => i >= -2 && i <= 1 && j >= -2 && j <= 1 };
    w.Reactor3D.eventModelFootprint = () => ({ rawX: 7, rawZ: 7, yaw: 0, mask });
    assert.equal(bodies().length, 1);
    assert.equal(A.cameraBodyReach(fight, { x: 10.5, y: 2, z: 25.5 }, { x: 30.5, y: 2, z: 25.5 }, 20), 20, 'under the crown, clear of the trunk: nothing in the way');
    const trunk = A.cameraBodyReach(fight, { x: 10.5, y: 2, z: 20.5 }, { x: 30.5, y: 2, z: 20.5 }, 20);
    assert.ok(Math.abs(trunk - (9.5 - A.SHOULDER.clear)) < 0.25, 'through the trunk: stopped a little this side of it: ' + trunk.toFixed(2));
    assert.equal(A.cameraBodyReach(fight, { x: 10.5, y: 5, z: 20.5 }, { x: 30.5, y: 5, z: 20.5 }, 20), 20, 'over its top: clear');
    w.$gameMap.events = events;
});

test('after a battle the map\'s own camera comes back at its own angle', () => {
    // A third-person battle levels the look and the mouse moves it; the map's look is back when it is over.
    const w = world3(), look = w.Reactor3D.Camera.look;
    w.frame(3);
    assert.equal(look.pitch, null, 'the map\'s own: 25 degrees down');
    const fight = begin(w);
    assert.equal(look.pitch, 8, 'the battle levels the look');
    look.pitch = 1.6;
    w.frame(30);
    w.$gameMap._reactorCamera3dTween = null;
    fight.end(w.ReactorFight.ESCAPE, true);
    w.frame(2);
    assert.equal(fight.isActive(), false);
    assert.equal(look.pitch, null, 'back to the map\'s own');
    assert.ok(w.$gameMap._reactorCamera3dTween && w.$gameMap._reactorCamera3dTween.frames > 0, 'and the camera eases there, it does not snap');
    // A look the player had set before the battle is the one that comes back.
    look.pitch = 40;
    w.frame(3);
    const again = begin(w);
    assert.equal(look.pitch, 8);
    again.end(w.ReactorFight.ESCAPE, true);
    w.frame(80);
    assert.equal(look.pitch, 40);
    // A First Person battle on a map seen from behind: the eyes look level; the map's camera returns at its own angle.
    look.pitch = null;
    w.frame(3);
    const eyes = begin(w, 'firstPerson');
    assert.equal(w.$gameMap._reactorCamera3d.mode, 'firstPerson');
    look.pitch = 1.6;
    w.frame(20);
    eyes.end(w.ReactorFight.ESCAPE, true);
    w.frame(80);
    assert.equal(w.$gameMap._reactorCamera3d.mode, 'thirdPerson');
    assert.equal(look.pitch, null, 'not left at eye level behind the player');
});

test('a screen shake in a battle seen from behind or through the eyes shakes the camera, never slides the picture', () => {
    const w = world3();
    w.frame(2);
    w.$gameScreen.startShake(5, 5, 10);
    assert.equal(w.$gameScreen._shakeDuration, 10, 'on the map the stock shake is the stock shake');
    w.$gameScreen.clearShake();
    const fight = begin(w), p = fight.act().player;
    p.shake = 0;
    w.$gameScreen.startShake(5, 5, 10);
    assert.equal(w.$gameScreen._shakeDuration, 0, 'the picture is not slid sideways (its edge showed as a black band)');
    assert.ok(p.shake > 0.2 && p.shake <= 1, 'the camera shakes instead: ' + p.shake);
    const before = w.camera.position.clone();
    w.frame(1);
    w.wall = Infinity;
    const moved = w.camera.position.distanceTo(before);
    assert.ok(moved > 0 && moved < 0.2, 'a small jolt of the camera: ' + moved.toFixed(3));
    // A map seen from above keeps the stock shake.
    w.$gameMap._reactorCamera3d = { mode: 'isometric', pitch: null };
    w.$gameScreen.startShake(5, 5, 10);
    assert.equal(w.$gameScreen._shakeDuration, 10);
});

test('first person: the weapon in view is drawn over the world by the eye\'s camera only', () => {
    const w = world3(), View = w.ReactorFight.Action.View;
    const pivot = new THREE.Group(), mesh = new THREE.Mesh(), flash = new THREE.Mesh(), group = new THREE.Group();
    pivot.add(group); group.add(mesh); pivot.add(flash);
    View.overWorld(pivot);
    for (const part of [mesh, flash]) {
        assert.equal(part.onBeforeRender, View.nearBefore);
        assert.equal(part.onAfterRender, View.nearAfter);
        assert.equal(part.castShadow, false, 'it throws no shadow of its own into the world');
        assert.ok(part.renderOrder >= 6000, 'after the map');
    }
    const calls = [];
    const renderer = { getContext: () => ({ depthRange: (near, far) => calls.push([near, far]) }) };
    const eye = new THREE.PerspectiveCamera(), light = new THREE.PerspectiveCamera();
    View.eye = eye;
    mesh.onBeforeRender(renderer, null, eye);
    mesh.onAfterRender(renderer, null, eye);
    assert.deepEqual(calls, [[0, View.DEPTH], [0, 1]], 'the nearest sliver of the depth range, then the whole range again');
    assert.ok(View.DEPTH > 0 && View.DEPTH <= 0.05);
    calls.length = 0;
    mesh.onBeforeRender(renderer, null, light);
    mesh.onAfterRender(renderer, null, light);
    assert.deepEqual(calls, [], 'a light\'s or a mirror\'s camera sees it where it is');
    // A pass that ends between the two calls must not leave the range squeezed for the next one.
    mesh.onBeforeRender(renderer, null, eye);
    View.eye = null;
    mesh.onAfterRender(renderer, null, eye);
    assert.deepEqual(calls, [[0, View.DEPTH], [0, 1]]);
});

test('first person: on aim the weapon comes to the middle with its top just under the crosshair', () => {
    const w = world3(), A = w.ReactorFight.Action, View = A.View;
    w.$dataSystem.weaponTypes = ['', 'Sword', 'Rifle'];
    w.$dataWeapons.push({ id: 1, name: 'Rifle', wtypeId: 2, etypeId: 1, params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], note: '', iconIndex: 1, animationId: 0, price: 0, description: '' });
    w.$dataClasses[1].traits.push({ code: 51, dataId: 2, value: 1 });
    w.$gameActors.actor(1).forceChangeEquip(0, w.$dataWeapons[1]);
    w.$gameMap._reactorCamera3d = { mode: 'firstPerson', pitch: null };
    w.Reactor3D.Camera.look.pitch = 0;
    w.frame(2);
    const fight = begin(w, 'firstPerson'), st = fight.act();
    // A weapon already in view (its model would be loaded from the project): its top stands 0.3 over the grip.
    const scene = {};
    View.pivot = new THREE.Group(); View.weaponId = 1; View.scene = scene; View.sight = 0.3; View.pose = null;
    const place = () => {
        View.update(w.camera, fight, st, scene);
        return View.pivot.position.clone().sub(w.camera.position).applyQuaternion(w.camera.quaternion.clone().invert()).divideScalar(View.SCALE);
    };
    A.aimBlend = 0;
    for (let i = 0; i < 40; i++) place();
    const rest = place();
    assert.ok(rest.x > 0.3 && rest.y < -0.45, 'at rest: low and to the right');
    A.aimBlend = 1; st.player.aim = true;
    for (let i = 0; i < 60; i++) place();
    const aimed = place();
    assert.ok(Math.abs(aimed.x) < 0.02, 'in the middle: ' + aimed.x.toFixed(3));
    // Its top (0.3 over the grip) is a hair under the eye's line: the crosshair is clear above it.
    assert.ok(aimed.y + 0.3 < 0 && aimed.y + 0.3 > -0.12, 'its top just under the line of sight: ' + (aimed.y + 0.3).toFixed(3));
    assert.equal(View.eye, w.camera, 'and it knows the eye\'s camera');
    View.pivot = null; View.weaponId = -1; View.scene = null;
});

test('first person: the look comes to an opponent at arm\'s length who stands off the crosshair, when the hand is still', () => {
    const w = world3({ events: [unit(1, 16, 9, 'enemy 1')] }), A = w.ReactorFight.Action, look = w.Reactor3D.Camera.look;
    w.$gameMap._reactorCamera3d = { mode: 'firstPerson', pitch: null };
    w.$gamePlayer.locate(10, 9);
    look.yaw = 90; look.pitch = 0;
    w.frame(2);
    const fight = begin(w, 'firstPerson');
    const enemy = fight.character(fight.unitOfEvent(1));
    w.frame(60);
    assert.equal(look.pitch, 0, 'an opponent six tiles off is aimed at by hand');
    // At arm's length. The stand-in's eye is a tile up and the opponent three tall: its chest is over the eye's
    // line, so the look goes up to it (in the game a tall hero's eye is over a short opponent, and it goes down).
    enemy.locate(12, 9);
    const chest = Math.atan2(w.camera.position.y - A.heightOf(enemy) * 0.6, 2) / DEG;
    assert.ok(chest < -10, 'well off the level look: ' + chest.toFixed(1));
    // A mouse held for the look aims by itself, however long it rests off the opponent.
    look.locked = true;
    w.frame(A.NEAR_LOOK.still * 4);
    assert.equal(look.pitch, 0, 'a held mouse is never steered');
    look.locked = false;
    // The hand has just moved the look: it is left alone for a moment.
    look.pitch = 0.5; w.frame(1); look.pitch = 0;
    w.frame(A.NEAR_LOOK.still - 2);
    assert.equal(look.pitch, 0, 'not while the hand is on its way');
    let biggest = 0, last = 0;
    for (let i = 0; i < 80; i++) { w.frame(1); biggest = Math.max(biggest, Math.abs(look.pitch - last)); last = look.pitch; }
    assert.ok(look.pitch < -5, 'the look went to it: ' + look.pitch.toFixed(1));
    assert.ok(biggest <= A.NEAR_LOOK.most + 1e-9, 'eased, never more than a degree and a half a frame: ' + biggest.toFixed(2));
    const settled = look.pitch;
    w.frame(30);
    assert.equal(look.pitch, settled, 'and rests once the crosshair is on it, or near enough');
    assert.ok(fight.actionHud().crosshair.onTarget || Math.abs(settled - chest) <= A.NEAR_LOOK.slack + 0.01, 'on the opponent: ' + settled.toFixed(1) + ' for ' + chest.toFixed(1));
    // The hand moves the look: it is left alone.
    look.pitch = 30;
    w.frame(1);
    look.pitch = 31;
    w.frame(A.NEAR_LOOK.still - 3);
    assert.equal(look.pitch, 31, 'a look being moved by hand is the hand\'s');
    // From behind the player nothing moves the look.
    w.$gameMap._reactorCamera3d = { mode: 'thirdPerson', pitch: null };
    look.pitch = 8;
    w.frame(60);
    assert.equal(look.pitch, 8);
});

/** The damage-number code of reactor_fight.js, in a small world of its own: sprites are plain records. */
function popupWorld(options = {}) {
    const text = source('reactor_fight.js');
    const from = text.indexOf('    // Damage numbers over units, and spawned units\' sprites.');
    const to = text.indexOf('    // A unit event with no model of its own wears the one the Database binds to its record.');
    assert.ok(from > 0 && to > from, 'the damage-number section is where it was');
    const w = { console, Math, Number };
    vm.createContext(w);
    vm.runInContext(`
        Graphics = { width: 1600, height: 900, frameCount: 0 };
        Spriteset_Map = function() { this.children = []; };
        Spriteset_Map.prototype.update = function() {};
        Spriteset_Map.prototype.addChild = function(child) { this.children.push(child); };
        Spriteset_Map.prototype.removeChild = function(child) { this.children.splice(this.children.indexOf(child), 1); };
        Sprite_Damage = function() { this.x = 0; this.y = 0; this.visible = true; this.frames = 90; };
        Sprite_Damage.prototype.setup = function(battler) { this.battler = battler; };
        Sprite_Damage.prototype.isPlaying = function() { return --this.frames > 0; };
        Sprite_Damage.prototype.destroy = function() { this.destroyed = true; };
        Sprite_Character = function() {};
        SceneManager = { _scene: {} };
        $dataMap = {}; $gameMap = { tileHeight: () => 48 };
        $gamePlayer = { _realX: 5, _realY: 5, reactor3DScreenPoint: () => { ownPoints++; return {}; }, screenX: () => 0, screenY: () => 0 };
        mode = "thirdPerson"; seen = true; asked = 0; shown = null; ground = true; ownPoints = 0;
        $gameFight = { _active: true, _mode: "action", isHere: () => true };
        // The camera looks north from (10, 4, 20): one tile is 100 pixels at ten tiles; anything south of it is behind.
        Reactor3D = {
            shouldRender3D: () => true, characterGround: () => 0, characterHeightTiles: () => 3,
            Camera: { currentState: () => ({ mode }) },
            viewport: () => ({ camera: () => ({ position: { x: 10, y: 4, z: 20 } }) }),
            projectToScreen(camera, x, y, z, out) {
                const ahead = 20 - z;
                out.visible = ahead > 0;
                out.x = ahead > 0 ? 800 + (x - 10) * 1000 / ahead : -6400;
                out.y = ahead > 0 ? 450 - (y - 4) * 1000 / ahead : 7200;
                return out;
            },
            // What the cutaway has opened for a character is not in the way of a look at it; the ground still is.
            cutawayShows: character => character === shown,
            cameraArm(map, eye, to, least, margin, step, how) { asked++; const length = Math.hypot(to.x - eye.x, to.y - eye.y, to.z - eye.z); return (how === "ground" || seen) && ground ? length : length / 2; }
        };
        F = {};
    `, w);
    vm.runInContext('(function() {\n' + text.slice(from, to) + '\n})();', w, { filename: 'reactor_fight.js (damage numbers)' });
    /** A unit whose middle stands at a point of the world. */
    w.unit = (x, z) => ({ _realX: x - 0.5, _realY: z - 0.5, reactor3DScreenPoint: () => { w.ownPoints++; return {}; }, screenX: () => 0, screenY: () => 0 });
    w.moveTo = (unit, x, z) => { unit._realX = x - 0.5; unit._realY = z - 0.5; };
    w.spriteset = new w.Spriteset_Map();
    w.tick = (n = 1) => { for (let i = 0; i < n; i++) { w.Graphics.frameCount++; w.spriteset.update(); } };
    if (options.mode) w.mode = options.mode;
    return w;
}

test('a damage number stays on its unit as the unit and the camera move, clear of the picture\'s edges', () => {
    const w = popupWorld(), raider = w.unit(10, 10);
    w.spriteset.rrFightPopup(raider, {});
    const number = w.spriteset._rrFightPopups[0];
    // Its head (its height and a fifth of a tile: 3.2 up) ten tiles ahead of an eye four tiles up.
    assert.deepEqual([number.x, number.y, number.visible], [800, 530, true]);
    w.moveTo(raider, 12, 10);
    w.tick();
    assert.equal(number.x, 1000, 'placed again every frame: it goes where the unit goes');
    // At the picture's edge the digits are kept whole; a unit well off to the side has no number in the picture.
    w.moveTo(raider, 17.9, 10);
    w.tick();
    assert.deepEqual([number.x, number.visible], [1600 - w.F.POPUP_EDGE.side, true], 'never cut by the side of the picture');
    w.moveTo(raider, 30, 10);
    w.tick();
    assert.equal(number.visible, false, 'a unit off to the side: its number is not pinned to the edge');
    // A unit under the view (at arm's length under the eye): its number stays over the HUD's bottom row, not on it.
    w.moveTo(raider, 10, 19.4);
    w.tick();
    assert.deepEqual([number.visible, number.y], [true, Math.round(900 * w.F.POPUP_EDGE.bottom)], 'clear of the hotbar');
    // One towering over the eye: under the target's name at the top, and its next numbers stand downward from there.
    w.Reactor3D.characterHeightTiles = () => 12;
    const giant = w.unit(10, 19);
    w.spriteset.rrFightPopup(giant, {}); w.spriteset.rrFightPopup(giant, {});
    // The limit is where the number's foot stands: its own height (`line`) is above that, under the top of the HUD.
    const top = Math.round(900 * w.F.POPUP_EDGE.top) + w.F.POPUP_EDGE.line;
    assert.deepEqual([w.spriteset._rrFightPopups[1].y, w.spriteset._rrFightPopups[2].y], [top, top + w.F.POPUP_SPREAD[1][1]]);
    for (let i = 0; i < 100; i++) w.tick();
    assert.equal(w.spriteset._rrFightPopups.length, 0, 'and goes when it has played');
    assert.equal(number.destroyed, true);
});

test('a number is out of sight while its unit is behind the eye or behind a wall, and back when it is not', () => {
    const w = popupWorld(), behind = w.unit(10, 24);
    w.spriteset.rrFightPopup(behind, {});
    const hidden = w.spriteset._rrFightPopups[0];
    assert.equal(hidden.visible, false, 'a unit behind the eye: its number was drawn over whatever the eye was looking at');
    w.moveTo(behind, 10, 10);
    w.tick();
    assert.deepEqual([hidden.visible, hidden.x, hidden.y], [true, 800, 530], 'in front again: shown, on it');
    // Behind something built: looked at when made, then a few times a second, not every frame.
    w.seen = false;
    const walled = w.unit(13, 10);
    w.asked = 0;
    w.spriteset.rrFightPopup(walled, {});
    const number = w.spriteset._rrFightPopups[1];
    assert.equal(number.visible, false, 'a unit behind a wall: no number on the wall');
    w.tick(w.F.POPUP_LOOK * 4);
    assert.ok(w.asked >= 5 && w.asked <= 2 * 5 + 2, 'the world is asked every few frames: ' + w.asked + ' times in ' + (w.F.POPUP_LOOK * 4 + 1) + ' frames for two numbers');
    w.seen = true;
    w.tick(w.F.POPUP_LOOK);
    assert.equal(number.visible, true, 'it steps out: shown');
    // Behind a wall the picture shows it through (a corridor held open to it, a tactical battle's ground): it is
    // in plain view, and so is its number. Only the ground can still hide it.
    w.seen = false;
    w.tick(w.F.POPUP_LOOK);
    assert.equal(number.visible, false);
    w.shown = walled;
    w.tick(w.F.POPUP_LOOK);
    assert.equal(number.visible, true, 'seen through the wall: its number is shown');
    w.ground = false;
    w.tick(w.F.POPUP_LOOK);
    assert.equal(number.visible, false, 'behind a hill nothing is opened');
    w.ground = true; w.shown = null;
    w.tick(w.F.POPUP_LOOK);
    assert.equal(number.visible, false, 'the corridor gone, the wall hides it again');
    assert.equal(w.ownPoints, 0, 'placing a number never asks a character for a screen point of its own (a record a call)');
    // A 2D map (no camera): numbers as ever, nothing asked of the world.
    const flat = popupWorld();
    flat.Reactor3D.viewport = () => null;
    const sprite = { _realX: 3, _realY: 4, reactor3DScreenPoint: () => null, screenX: () => 300, screenY: () => 400 };
    flat.asked = 0;
    flat.spriteset.rrFightPopup(sprite, {});
    assert.deepEqual([flat.spriteset._rrFightPopups[0].x, flat.spriteset._rrFightPopups[0].y, flat.spriteset._rrFightPopups[0].visible, flat.asked], [300, 400 - 67, true, 0]);
});

test('numbers that land together on one unit stand apart; another unit\'s start at its own head', () => {
    const w = popupWorld(), raider = w.unit(10, 10), other = w.unit(12, 10);
    for (let i = 0; i < 4; i++) w.spriteset.rrFightPopup(raider, {});
    w.spriteset.rrFightPopup(other, {});
    const numbers = w.spriteset._rrFightPopups, places = numbers.slice(0, 4).map(n => n.x + ',' + n.y);
    assert.equal(new Set(places).size, 4, 'four numbers, four places: ' + places.join(' '));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        assert.ok(Math.abs(numbers[i].x - numbers[j].x) >= 28 || Math.abs(numbers[i].y - numbers[j].y) >= 20, `numbers ${i} and ${j} do not pile up`);
    }
    assert.deepEqual([numbers[4].x, numbers[4].y], [1000, 530], 'the other unit\'s first number is at its own head');
    assert.deepEqual([numbers[0].x, numbers[0].y], [800, 530], 'the first is where one alone would be');
    // A place is free again once its number has gone.
    numbers[0].frames = 1;
    w.tick();
    w.spriteset.rrFightPopup(raider, {});
    assert.deepEqual([numbers[numbers.length - 1].x, numbers[numbers.length - 1].y], [800, 530]);
});

test('through the eyes the player\'s own number is shown by the HUD\'s vitals, never in the world', () => {
    const w = popupWorld({ mode: 'firstPerson' });
    w.$gameFight._mode = 'firstPerson';
    // The player's body is at the eye: its head projects behind the camera, or fills the middle of the picture.
    w.SceneManager._scene._reactorActionHud = { _nodeWindows: [
        { visible: true, x: 600, y: 700, width: 440, height: 56, node: () => ({ type: 'actionHotbar' }) },
        { visible: true, x: 16, y: 800, width: 320, height: 84, node: () => ({ type: 'actionVitals' }) }] };
    w.spriteset.rrFightPopup(w.$gamePlayer, {});
    const own = w.spriteset._rrFightPopups[0];
    assert.equal(own.visible, true);
    assert.ok(own.x > 16 && own.x < 336 && own.y < 800 && own.y > 760, `over the vitals panel: ${own.x}, ${own.y}`);
    w.$gamePlayer._realX = 40;
    w.tick();
    assert.ok(own.x < 336, 'it does not follow the body');
    // Without a HUD of that kind: the lower left.
    w.SceneManager._scene._reactorActionHud = false;
    w.tick();
    assert.ok(own.x < 400 && own.y > 600, `lower left: ${own.x}, ${own.y}`);
    // From behind, the player's number is over the player as anyone's is.
    w.mode = 'thirdPerson';
    w.moveTo(w.$gamePlayer, 10, 10);
    w.tick();
    assert.deepEqual([own.x, own.y], [800, 530]);
    // An opponent's number through the eyes is in the world.
    w.mode = 'firstPerson';
    w.spriteset.rrFightPopup(w.unit(12, 10), {});
    assert.equal(w.spriteset._rrFightPopups[1].x, 1000);
    // A Tactical battle has its own view, whatever the map's camera is: the leader's number is on the leader.
    w.tick();
    assert.ok(own.x < 400, 'through the eyes: by the vitals');
    w.$gameFight._mode = 'tactical';
    w.tick();
    assert.deepEqual([own.x, own.y], [800, 530], 'in a Tactical battle on a first-person map: over the unit');
    w.$gameFight._mode = 'firstPerson'; w.$gameFight._active = false;
    w.tick();
    assert.deepEqual([own.x, own.y], [800, 530], 'and with no battle running');
});

test('an animation on a body plays where its point is seen: not behind the camera, not through a wall, not on the eye\'s own body', () => {
    const w = fightWorld({ events: [unit(1, 3, 2, 'enemy 1')] });
    vm.runInContext(`
        mode = "thirdPerson"; behindCamera = false; seen = true; asked = 0;
        Reactor3D = {
            viewport: () => ({ camera: () => ({}) }), shouldRender3D: () => true,
            characterGround: () => 0, characterHeightTiles: () => 2,
            Camera: { currentState: () => ({ mode }) },
            projectToScreen: (camera, x, y, z, out) => Object.assign(out || {}, behindCamera ? { x: -6400, y: 7200, visible: false } : { x: x * 10, y: 500 - y * 10, visible: true }),
            modelInstanceKey: character => character, modelHolderFor: () => null
        };
    `, w);
    for (const file of ['reactor_battle_data.js', 'reactor_battle_presentation.js', 'reactor_fight_stage.js']) vm.runInContext(source(file), w, { filename: file });
    const F = w.ReactorFight, S = F.Stage;
    F.pointSeen = () => { w.asked++; return w.seen; };
    const enemy = w.$gameMap.event(1);
    const entry = { character: enemy, where: 'body', height: 1, anchor: { x: 0, y: 0, parent: null } };
    S.placeAnchor(entry);
    assert.deepEqual([entry.anchor.x, entry.anchor.y], [35, 490], 'in sight: on the body');
    // Behind the camera: off the picture (it was drawn mirrored in front, over nothing).
    w.behindCamera = true;
    S.placeAnchor(entry);
    assert.deepEqual([entry.anchor.x, entry.anchor.y], [S.ANCHOR_AWAY, S.ANCHOR_AWAY]);
    w.behindCamera = false;
    S.placeAnchor(entry);
    assert.deepEqual([entry.anchor.x, entry.anchor.y], [35, 490], 'and back when the camera turns to it');
    // Behind a wall: asked every few frames, not every frame.
    w.seen = false; w.asked = 0;
    w.Graphics.frameCount += S.ANCHOR_LOOK;
    for (let i = 0; i < S.ANCHOR_LOOK * 3; i++) { S.placeAnchor(entry); w.Graphics.frameCount++; }
    assert.equal(entry.anchor.x, S.ANCHOR_AWAY, 'a hit behind a wall draws nothing on the wall');
    assert.equal(w.asked, 3, 'the world is asked a few times a second');
    w.seen = true;
    w.Graphics.frameCount += S.ANCHOR_LOOK;
    S.placeAnchor(entry);
    assert.equal(entry.anchor.x, 35);
    // Through the eyes, an animation on the player's own body would fill the picture.
    const own = { character: w.$gamePlayer, where: 'body', height: 1, anchor: { x: 0, y: 0, parent: null } };
    S.placeAnchor(own);
    assert.notEqual(own.anchor.x, S.ANCHOR_AWAY, 'from behind it plays on the player');
    w.mode = 'firstPerson';
    S.placeAnchor(own);
    assert.notEqual(own.anchor.x, S.ANCHOR_AWAY, 'a first-person map with no battle: the map\'s own animations are the map\'s');
    Object.assign(w.$gameFight, { _active: true, _mode: 'firstPerson', _mapId: w.$gameMap.mapId() });
    S.placeAnchor(own);
    assert.equal(own.anchor.x, S.ANCHOR_AWAY, 'through the eyes in a battle it does not');
    S.placeAnchor(entry);
    assert.equal(entry.anchor.x, 35, 'an opponent\'s still does');
    w.$gameFight._mode = 'tactical';
    S.placeAnchor(own);
    assert.notEqual(own.anchor.x, S.ANCHOR_AWAY, 'a Tactical battle has its own view: the leader\'s animation plays on the leader');
    w.$gameFight._active = false;
    // Who the picture shows through a wall is asked about with its character, so the cutaway can answer.
    let askedFor = null;
    F.pointSeen = (world, character) => { askedFor = character; return true; };
    w.Graphics.frameCount += S.ANCHOR_LOOK;
    S.placeAnchor(entry);
    assert.equal(askedFor, enemy);
});

test('nothing this file adds is made anew each frame', () => {
    const action = source('reactor_fight_action.js'), fight = source('reactor_fight.js');
    const body = (text, name) => { const at = text.indexOf(name); assert.ok(at > 0, name); return text.slice(at, text.indexOf('\n    };', at)); };
    for (const name of ['A.shoulderCamera = function', 'A.cameraBodyReach = function', 'A.lookToNear = function']) {
        const code = body(action, name).replace(/A\._\w+ \|\| \(A\._\w+ = \{[^;]*?\}\)/g, '');
        assert.doesNotMatch(code, /=>|new THREE|\{ x:|\[\]/, name + ' makes no closure, vector or record per call');
    }
    for (const name of ['F.placePopup = function', 'F.pointSeen = function', 'F.throughEyes = function', 'F.ownPopupPoint = function']) {
        const code = body(fight, name).replace(/F\._\w+ \|\| \(F\._\w+ = \{[^;]*?\}\)/g, '');
        assert.doesNotMatch(code, /=>|new |\[\]/, name + ' makes nothing per call');
    }
    // The head point fills the caller's record (and its own scratch), and does not go through the character's
    // screen point, which makes a record each call.
    const head = body(fight, 'F.headPoint = function').replace(/F\._\w+ \|\| \(F\._\w+ = \{[^;]*?\}\)/g, '')
        .replace('out = out || { x: 0, y: 0, visible: true };', '').replace('out.world || (out.world = { x: 0, y: 0, z: 0 })', '').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(head, /=>|new |\[\]|\{ x:|reactor3DScreenPoint/, 'F.headPoint makes nothing per call');
    // The camera's bodies are listed a few times a second, and the look's pitch is read without a scan.
    assert.match(action, /if \(kept\.serial === fight\._serial && now >= kept\.at && now - kept\.at < 20\) return kept;/);
});

test('the crosshair has a dark edge two pixels wide round every stroke, its ends too', () => {
    const Hud = require('../../runtime/reactor_ui_action.js');
    // A 2D context that keeps how each stroke was drawn.
    const strokes = [];
    const ctx = new Proxy({ lineWidth: 1, strokeStyle: '', lineCap: 'butt', globalAlpha: 1 }, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'stroke') return () => strokes.push({ width: target.lineWidth, style: target.strokeStyle, cap: target.lineCap });
            return () => {};
        },
        set(target, key, value) { target[key] = value; return true; }
    });
    const node = Hud.defaultProps('actionCrosshair');
    for (const crossStyle of ['cross', 'chevrons', 'circle', 'dot']) {
        strokes.length = 0;
        Hud.drawCrosshair(ctx, 96, Object.assign({}, node, { crossStyle }), { gap: 10, onTarget: false, ranged: true, reload: 0, sprinting: false, aiming: false, hit: 0, kill: 0 });
        assert.equal(strokes.length, 2, crossStyle + ': an edge, then the stroke over it');
        const [edge, line] = strokes;
        assert.equal(edge.width, node.crossThickness + 4, crossStyle + ': two pixels each side (pale ticks alone are lost on lit stone)');
        assert.equal(edge.style, 'rgba(0,0,0,0.8)', crossStyle + ': dark enough to read on bright ground');
        assert.equal(edge.cap, 'square', crossStyle + ': the ends are edged as the sides are');
        assert.deepEqual([line.width, line.style, line.cap], [node.crossThickness, node.crossColor, 'butt'], crossStyle + ': the stroke itself is as set');
    }
    // A blade's brackets over something in reach are edged the same way.
    strokes.length = 0;
    Hud.drawCrosshair(ctx, 96, node, { gap: 10, onTarget: true, ranged: false, reload: 0, sprinting: false, aiming: false, hit: 0, kill: 0 });
    assert.deepEqual([strokes[0].width, strokes[0].style, strokes[0].cap], [node.crossThickness + 4, 'rgba(0,0,0,0.8)', 'square']);
    assert.equal(strokes[1].style, node.targetColor);
});
