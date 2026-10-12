'use strict';
// The cinematic camera for Tactical battles (runtime/reactor_fight_camera.js):
// which shot an event of the battle gets at each level, the hold the battle
// waits on, skipping, the view given back exactly (a flat map's scroll and
// zoom, a 3D map's pose) however a shot ends, where the camera stands and
// what it does when a wall is in the way, how it moves (no step in where it
// is, how fast it goes or how fast time runs, except a cut it chose), and
// slow motion that slows the battle and nothing else. Runs with no
// Reactor3D: a flat map is a real path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { fightWorld, event } = require('./helpers/fight-world.cjs');

const file = path.join(__dirname, '..', '..', 'runtime', 'reactor_fight_camera.js');

/**
 * A battle on the 20x15 test map: the party at (2,2), a near enemy (unit of
 * event 1) at (4,2), a far one (event 2) at (12,2), a third (event 3) at
 * (5,4). `flat: false` gives the director a synthetic 3D world (`solid`).
 */
function battle({ cinematic, flat = true, solid = () => false, system = {} } = {}) {
    const w = fightWorld({
        events: [event(1, 4, 2, { note: '<unit: enemy 1>' }), event(2, 12, 2, { note: '<unit: enemy 2>' }), event(3, 5, 4, { note: '<unit: enemy 1>' })],
        system: Object.assign({ reactorBattle: Object.assign({ mode: 'tactical' }, cinematic ? { cinematic } : {}) }, system)
    });
    vm.runInContext(`
        updates = { main: 0, scene: 0 };
        Scene_Map = function Scene_Map() {};
        Scene_Map.prototype.update = function() { updates.scene++; this.updateMainMultiply(); };
        Scene_Map.prototype.updateMainMultiply = function() { updates.main++; };
        Scene_Map.prototype.stop = function() {};
        pressed = "";
        Input.isTriggered = name => name === pressed;
        SceneManager.isSceneChanging = () => false;
    `, w);
    vm.runInContext(fs.readFileSync(file, 'utf8'), w, { filename: 'reactor_fight_camera.js' });
    const D = w.ReactorFight.Director, C = w.ReactorFight.Camera;
    if (!flat) C.testWorld = { is3D: true, ground: () => 0, height: () => 2, solid };
    w.$gameFight.start({ mode: 'tactical' });
    const unitOf = eventId => w.$gameFight.unitOfEvent(eventId).id;
    const hero = w.$gameFight.units().find(u => u.party).id;
    const scene = new w.Scene_Map();
    /** Step the scene; on a 3D world, show each frame through `pose3` as the map camera hook does. */
    const base3 = { eye: { x: 30, y: 40, z: 30 }, look: { x: 2.5, y: 0, z: 2.5 }, fov: 15 };
    const poses = [];
    const run = (frames, until) => {
        for (let i = 0; i < frames; i++) {
            scene.update();
            if (!flat && D.active()) poses.push(D.pose3(base3));
            if (until && until()) return i + 1;
        }
        return frames;
    };
    const emit = (name, payload) => w.ReactorEvents.emit(name, payload);
    const aim = (targetEvent, extra = {}) => emit('fightAim', Object.assign({ unitId: hero, kind: 'skill', itemId: 1, targetIds: [unitOf(targetEvent)], cell: { x: 0, y: 0 }, ranged: true }, extra));
    const fire = () => emit('fightFire', { unitId: hero, kind: 'skill', itemId: 1, targetIds: [], cell: { x: 0, y: 0 } });
    const impact = (targetEvent, extra = {}) => emit('fightImpact', Object.assign({ unitId: hero, targetId: unitOf(targetEvent), damage: 10, critical: false, missed: false, evaded: false, defeated: false, heal: false }, extra));
    const end = () => emit('fightActionEnd', { unitId: hero });
    /** Past the opening sweep, the view the map's own again. */
    const settle = () => { run(600, () => !D.active() && !D._pending); assert.equal(D.active(), false, 'the opening sweep ends by itself'); };
    const view = () => ({ ...w.$gameMap }._displayX + ',' + w.$gameMap._displayY + ',' + w.$gameMap._parallaxX + ',' + w.$gameMap._parallaxY + ','
        + w.$gameScreen._zoomX + ',' + w.$gameScreen._zoomY + ',' + w.$gameScreen._zoomScale + ',' + w.$gameScreen._zoomScaleTarget + ',' + w.$gameScreen._zoomDuration);
    return { w, D, C, scene, run, emit, aim, fire, impact, end, settle, view, unitOf, hero, base3, poses };
}

const plain = value => JSON.parse(JSON.stringify(value));
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('the setting reads System, defaults to Some, and a game can change the level in play', () => {
    const b = battle();
    assert.deepEqual(plain(b.C.settings()), { level: 'some', slowMotion: true, skip: true });
    assert.deepEqual(plain(b.C.normalizeSettings({ level: 'every', slowMotion: false, skip: false })), { level: 'every', slowMotion: false, skip: false });
    assert.equal(b.C.normalizeSettings({ level: 'lots' }).level, 'some', 'an unknown level is the default');
    b.w.$dataSystem.reactorBattle.cinematic = { level: 'every', slowMotion: false };
    assert.deepEqual(plain(b.C.settings()), { level: 'every', slowMotion: false, skip: true });
    b.D.setLevel('off');
    assert.equal(b.C.settings().level, 'off');
    assert.equal(b.w.JsonEx.parse(b.w.JsonEx.stringify(b.w.$gameSystem))._rrBattle.cinematic.level, 'off', 'saved with the game');
    b.D.setLevel('default');
    assert.equal(b.C.settings().level, 'every');
});

test('Off is the battle without a director: nothing holds, moves, slows or dresses the screen', () => {
    const b = battle({ cinematic: { level: 'off' } });
    const before = b.view();
    b.run(10);
    assert.equal(b.D.active(), false, 'no opening sweep');
    b.aim(2); b.run(5); b.fire(); b.impact(2, { defeated: true }); b.run(5); b.end();
    b.emit('fightMoveStart', { unitId: b.hero, path: [{ x: 2, y: 2 }, { x: 9, y: 2 }], long: true });
    b.emit('fightUnitSpawned', { unitId: b.unitOf(3), eventId: 3, team: 'enemy' });
    b.run(20);
    assert.equal(b.D.active(), false);
    assert.equal(b.D.isBusy(), false);
    assert.equal(b.D.timeScale(), 1);
    assert.equal(b.view(), before);
    assert.deepEqual(plain(b.D.presentation()), { hud: 1, bars: 0, raw: 0 });
    assert.equal(b.w.updates.main, b.w.updates.scene, 'every frame is a full frame of the battle');
    assert.equal(b.D.sequenceCamera({ anchor: 'target', x: 0, y: 0, z: 0, duration: 10 }, { user: b.w.$gamePlayer, target: b.w.$gameMap.event(1) }), false);
});

test('a battle opens on a sweep the battle waits for, once the frames are steady; only a Tactical battle is filmed', () => {
    const b = battle();
    assert.equal(b.D.shot(), null, 'not on the battle\'s first, loading frames');
    assert.equal(b.D.isBusy(), true, 'but the battle waits for it');
    b.run(8);
    assert.equal(b.D.shot().name, 'establish');
    const frames = b.run(400, () => !b.D.isBusy());
    assert.ok(frames >= 120 && frames <= 160, 'the sweep and the way back: ' + frames);
    b.run(20);
    assert.equal(b.D.active(), false);
    // A message in those first frames (the game speaking) is not talked over.
    const c = battle();
    c.w.$gameMessage.add('Hold the square!');
    c.run(10);
    assert.equal(c.D.active(), false);
    assert.equal(c.D.isBusy(), false);

    const action = fightWorld({ events: [event(1, 4, 2, { note: '<unit: enemy 1>' })] });
    vm.runInContext(fs.readFileSync(file, 'utf8'), action, { filename: 'reactor_fight_camera.js' });
    action.$gameFight.start({ mode: 'action' });
    assert.equal(action.ReactorFight.Director.isBusy(), false, 'an Action battle is left alone');
});

test('Some: the long shot is filmed, an ordinary action only leans the tactical view toward it, a kill brings the camera down', () => {
    const b = battle();
    b.settle();
    const { C } = b;
    assert.equal(C.treatment('ranged', 'some'), 'lean');
    assert.equal(C.treatment('melee', 'some'), 'lean');
    assert.equal(C.treatment('sniper', 'some'), 'full');
    assert.equal(C.treatment('area', 'some'), 'full');
    assert.equal(C.treatment('self', 'some'), 'none');
    assert.equal(C.treatment('self', 'every'), 'full');
    assert.equal(C.treatment('sniper', 'off'), 'none');
    assert.equal(C.treatment('sniper', 'some', true), 'lean', 'a reaction (overwatch) stays in the tactical view at Some');
    assert.equal(C.treatment('sniper', 'every', true), 'full');
    b.aim(1);
    const lean = b.D.shot();
    assert.equal(lean.name, 'lean');
    assert.equal(b.D.isBusy(), false, 'nothing waits for it');
    assert.equal(lean.bars, false, 'and the screen is not dressed for it');
    const base = { eye: { x: 30, y: 40, z: 30 }, look: { x: 2.5, y: 0, z: 2.5 }, fov: 15 };
    const leaned = lean.lean(base);
    assert.ok(leaned.fov < 15 && leaned.fov > 12, 'a slight push');
    assert.ok(gap(leaned.eye, base.eye) < 2 && Math.abs(gap(leaned.eye, leaned.look) - gap(base.eye, base.look)) < 1e-9, 'the same view, moved a little');
    b.run(30); b.fire(); b.impact(1, { critical: true });
    assert.equal(b.D.shot().name, 'lean', 'a critical hit alone does not cut in');
    b.impact(1, { defeated: true });
    assert.equal(b.D.shot().name, 'impact');
    assert.equal(b.D.shot().result, 'kill');
    b.end(); b.run(200);
    assert.equal(b.D.active(), false);
    b.aim(2);
    assert.equal(b.D.shot().name, 'sight', 'ten tiles of direct fire is a sniper shot, always filmed');
    // An overwatch shot down a long line: the view only leans, nothing waits; its kill is still filmed.
    b.end(); b.run(200);
    b.aim(2, { overwatch: true });
    assert.equal(b.D.shot().name, 'lean');
    assert.equal(b.D.isBusy(), false);
    b.fire(); b.impact(2, { defeated: true, overwatch: true });
    assert.equal(b.D.shot().result, 'kill');
    // An army battle's quick actions (a third of a second each) are left alone entirely, kill or not.
    b.end(); b.run(200);
    b.aim(2, { quick: true });
    assert.equal(b.D.active(), false);
    b.fire(); b.impact(2, { defeated: true });
    assert.equal(b.D.active(), false);
    assert.equal(b.D.isBusy(), false);
    assert.equal(b.D.timeScale(), 1);
    b.end();
    // No sweep at a side's turn, and only a real run is followed.
    b.end(); b.run(200);
    b.emit('fightTeamTurn', { team: 'enemy', turn: 2 });
    b.run(8);
    assert.equal(b.D.active(), false);
    b.emit('fightMoveStart', { unitId: b.hero, path: Array.from({ length: 6 }, (_, i) => ({ x: 2 + i, y: 2 })), long: true });
    assert.equal(b.D.active(), false, 'six tiles is routine');
    b.emit('fightMoveStart', { unitId: b.hero, path: Array.from({ length: 9 }, (_, i) => ({ x: 2 + i, y: 2 })), long: true });
    const run = b.D.shot();
    assert.equal(run.name, 'move');
    b.w.$dataSystem.reactorBattle.cinematic = { level: 'every' };
    b.run(5);
    b.emit('fightMoveStart', { unitId: b.unitOf(1), path: Array.from({ length: 9 }, (_, i) => ({ x: 4, y: 2 + i })), long: true });
    assert.equal(b.D.shot(), run, 'units setting off together: the run on screen keeps the camera');
});

test('Every films each action; the classifier reads range, line of sight and the area', () => {
    const b = battle({ cinematic: { level: 'every' } });
    b.settle();
    for (let i = 0; i < 3; i++) { b.aim(1); assert.equal(b.D.shot().name, 'aim'); b.run(60); b.end(); b.run(80); }
    b.aim(1, { quick: true });
    const first = b.D.shot();
    assert.equal(first.name, 'aim', 'Every films a quick action too');
    b.run(5);
    b.emit('fightAim', { unitId: b.unitOf(3), kind: 'skill', itemId: 1, targetIds: [b.hero], cell: { x: 2, y: 2 }, ranged: true, quick: true });
    assert.equal(b.D.shot(), first, 'but one at a time: an action beside it does not take the camera');
    b.run(60); b.end(); b.run(80);
    const U = { x: 2.5, z: 2.5, c: 1 }, far = { x: 12.5, z: 2.5, c: 2 }, near = { x: 4.5, z: 2.5, c: 3 };
    const C = b.C;
    assert.equal(C.classify({ ranged: true }, U, [far], { los: true, area: { shape: 'single' } }), 'sniper');
    assert.equal(C.classify({ ranged: true }, U, [far], { los: false, area: { shape: 'single' } }), 'ranged', 'indirect fire has no sight line to look down');
    assert.equal(C.classify({ ranged: true }, U, [near], null), 'ranged');
    assert.equal(C.classify({ ranged: false }, U, [near], null), 'melee');
    assert.equal(C.classify({ ranged: true }, U, [near, far], null), 'area');
    assert.equal(C.classify({ ranged: true }, U, [near], { area: { shape: 'circle', size: 2 } }), 'area');
    assert.equal(C.classify({ ranged: false }, U, [U], null), 'self');
    b.emit('fightTeamTurn', { team: 'ally', turn: 1 });
    assert.equal(b.D.isBusy(), false, 'not straight after the opening sweep');
    b.emit('fightTeamTurn', { team: 'enemy', turn: 1 });
    assert.equal(b.D.isBusy(), true);
    b.run(6);
    assert.equal(b.D.shot().name, 'phase', 'a side\'s turn opens on a short sweep');
});

test('the battle waits for the aim, the shot stays and pushes in until the hit; the cut to the target holds, rests, and the battle waits for the way back', () => {
    const b = battle({ cinematic: { level: 'every' } });
    b.settle();
    b.aim(1);
    assert.equal(b.D.isBusy(), true, 'held while the camera comes over the shoulder');
    assert.equal(b.run(200, () => !b.D.isBusy()), 36);
    assert.equal(b.D.shot().name, 'aim', 'still over the shoulder while the action plays');
    b.fire(); b.run(12);
    assert.equal(b.D.shot().name, 'aim');
    b.impact(1);
    const cut = b.D.shot();
    assert.equal(cut.name, 'impact');
    assert.equal(cut.result, 'hit');
    assert.ok(cut.hold >= 36, 'long enough to read');
    assert.ok(cut.hold - cut.frames >= 10, 'the move ends before the shot does: a beat of stillness on the result');
    // A second landing on the same target does not cut again; a kill deepens the shot that is up.
    b.impact(1);
    assert.equal(b.D.shot(), cut);
    b.impact(1, { defeated: true });
    assert.equal(b.D.shot(), cut);
    assert.equal(cut.result, 'kill');
    b.end();
    const frames = b.run(300, () => !b.D.isBusy());
    assert.ok(frames >= 54 + 18 && frames <= 54 + 18 + 14, 'the shot, then the whole way back: ' + frames);
    b.run(14);
    assert.equal(b.D.active(), false);

    // An action that never lands: the hold still ends, and the shot with the action.
    b.aim(1);
    b.run(45);
    assert.equal(b.D.isBusy(), false);
    b.end();
    b.run(40);
    assert.equal(b.D.active(), false);
    // An action that never ends cannot keep the camera.
    b.aim(1);
    b.run(b.C.MAX_FRAMES + 40);
    assert.equal(b.D.active(), false);
    // No more than three shots for one action.
    assert.ok(b.C.MAX_FRAMES > 0);
});

test('with nothing to go by the shoulder alternates; with a camera, the shot stays on its side of the line between the two', () => {
    const b = battle({ cinematic: { level: 'every' } });
    b.settle();
    const variants = [];
    for (let i = 0; i < 4; i++) { b.aim(1); variants.push(b.D.shot().variant); b.run(45); b.fire(); b.impact(1); b.end(); b.run(120); }
    assert.deepEqual(variants, ['right', 'left', 'right', 'left']);
    assert.deepEqual(Array.from(b.C.order(['a', 'b', 'c'], 'a')), ['b', 'c', 'a']);

    // Screen direction: the camera right of the line from the shooter to the target stays right of it for the hit.
    const c = battle({ cinematic: { level: 'every' }, flat: false });
    c.settle();
    const U = { x: 2.5, z: 2.5 }, T = { x: 4.5, z: 2.5 };
    assert.equal(c.C.sideOf({ x: 0, z: 5 }, U, T), 1);
    assert.equal(c.C.sideOf({ x: 0, z: 0 }, U, T), -1);
    for (const z of [9, -4]) {
        Object.assign(c.base3.eye, { x: 2.5, y: 7, z });
        c.aim(1); c.run(50);
        const side = c.C.sideOf(c.D._shown3.eye, U, T);
        assert.equal(side, z > 2.5 ? 1 : -1, 'the shoulder nearer the tactical camera');
        c.fire(); c.impact(1); c.run(2);
        assert.equal(c.C.sideOf(c.D._shown3.eye, U, T), side, 'and the hit is seen from the same side');
        c.end(); c.run(120);
    }
});

test('a press skips the shot and the rest of that action, not the press that started it', () => {
    const b = battle({ cinematic: { level: 'every' } });
    b.settle();
    b.w.pressed = 'ok';
    b.aim(1);
    b.run(b.C.SKIP_GUARD - 1);
    assert.equal(b.D.shot().name, 'aim', 'the confirming press is not a skip');
    b.run(1);
    assert.equal(b.D.shot(), null);
    assert.equal(b.D.isBusy(), false, 'the battle goes on at once');
    b.w.pressed = '';
    b.fire(); b.impact(1, { defeated: true });
    assert.equal(b.D.shot(), null, 'nothing more of this action is filmed');
    b.run(30); b.end();
    assert.equal(b.D.active(), false);
    b.aim(1);
    assert.equal(b.D.shot().name, 'aim', 'the next action is');

    const off = battle({ cinematic: { level: 'every', skip: false } });
    off.settle();
    off.w.pressed = 'cancel';
    off.aim(1); off.run(20);
    assert.equal(off.D.shot().name, 'aim', 'no skipping when the game turns it off');
});

test('a flat map: pan to the shooter, zoom on the aim, whip to the target, tighter and slow on a kill, and back exactly', () => {
    const b = battle({ cinematic: { level: 'every' } });
    assert.equal(typeof b.w.Reactor3D, 'undefined', 'no 3D runtime at all');
    b.settle();
    const { $gameMap, $gameScreen } = b.w;
    $gameMap._displayX = 1; $gameMap._displayY = 0.5; $gameMap._parallaxX = 3; $gameMap._parallaxY = 4;
    const before = b.view();
    const centre = () => ({ x: $gameMap._displayX + $gameMap.screenTileX() / 2, z: $gameMap._displayY + $gameMap.screenTileY() / 2 });
    // Every frame of it: the zoom and the pan never step.
    const zooms = [], pans = [];
    const watch = () => { zooms.push($gameScreen.zoomScale()); pans.push(centre().x); return false; };
    // The far enemy, 10 tiles east: the sight line, the round, the hit.
    b.aim(2);
    b.run(1, watch);
    assert.ok($gameScreen.zoomScale() <= 1.02, 'eased in, not jumped');
    b.run(70, watch);
    assert.ok(Math.abs($gameScreen.zoomScale() - 1.75) < 0.01, 'zoomed in on the aim, to a scale whole tiles land on: ' + $gameScreen.zoomScale());
    b.fire();
    assert.equal(b.D.shot().name, 'round');
    const from = centre().x;
    b.run(30, watch);
    assert.ok(b.D.timeScale() < 1, 'the round flies in slow motion');
    assert.ok(centre().x > from + 0.5, 'the pan follows the round toward the target');
    b.impact(2, { defeated: true });
    b.run(24, watch);
    const zoom = $gameScreen.zoomScale();
    assert.ok(Math.abs(zoom - 2) < 0.02, 'tighter on the kill: ' + zoom);
    assert.ok(b.D.timeScale() < 1, 'and slow');
    // The far enemy, off the middle of the scrolled-to-the-edge screen, is brought to the middle by the zoom's centre.
    const px = (12.5 - $gameMap._displayX) * 48, shownAt = px * zoom - $gameScreen.zoomX() * (zoom - 1);
    assert.ok(Math.abs(shownAt - 408) < 80, 'the target is near the middle of the screen: ' + shownAt);
    b.end();
    b.run(300, () => { watch(); return !b.D.active(); });
    assert.equal(b.view(), before, 'scroll, parallax and zoom are the saved numbers');
    for (let i = 1; i < zooms.length; i++) assert.ok(Math.abs(zooms[i] - zooms[i - 1]) < 0.12, `the zoom moves, never jumps (frame ${i}: ${zooms[i - 1]} to ${zooms[i]})`);
    for (let i = 1; i < pans.length - 1; i++) assert.ok(Math.abs(pans[i] - pans[i - 1]) < 1.3, `the pan moves, never jumps (frame ${i}: ${pans[i - 1]} to ${pans[i]})`);

    // A long run is followed; an area attack is shown wide.
    b.emit('fightMoveStart', { unitId: b.unitOf(1), path: [{ x: 4, y: 2 }, { x: 4, y: 9 }], long: true });
    assert.equal(b.D.shot().name, 'move');
    assert.equal(b.D.isBusy(), false, 'a move is never waited on');
    const ev = b.w.$gameMap.event(1);
    const zs = [];
    b.run(60, () => { ev._realY = Math.min(9, ev._realY + 0.125); zs.push(centre().z); return false; });
    assert.ok(zs[zs.length - 1] > zs[10], 'the pan moves with the runner');
    assert.ok(Math.abs($gameScreen.zoomScale() - 1.25) < 0.01);
    b.emit('fightMoveEnd', { unitId: b.unitOf(1), x: 4, y: 9 });
    b.run(60);
    assert.equal(b.view(), before);
    b.aim(2, { targetIds: [b.unitOf(1), b.unitOf(3)], kind: 'item' });
    assert.equal(b.D.shot().name, 'area');
    b.run(70);
    assert.ok(Math.abs($gameScreen.zoomScale() - 1) < 0.005, 'wide is the whole screen');
});

test('the view comes back exactly when a battle ends or the scene leaves mid-shot, and eases back under a message', () => {
    for (const how of ['end', 'message', 'scene', 'stop', 'off']) {
        const b = battle({ cinematic: { level: 'every' } });
        b.settle();
        const before = b.view();
        b.aim(2); b.run(40); b.fire(); b.run(8);
        assert.notEqual(b.view(), before, 'mid-shot the view is the shot\'s');
        assert.ok(b.D.timeScale() < 1);
        if (how === 'end') b.emit('mapBattleEnd', { serial: 1, result: 0 });
        else if (how === 'message') {
            b.w.$gameMessage.add('Wait!'); b.run(1);
            assert.equal(b.D.shot(), null, 'the shot ends as the game speaks');
            assert.equal(b.D.isBusy(), false);
            b.run(40);
        } else if (how === 'scene') { b.w.SceneManager.isSceneChanging = () => true; b.run(1); }
        else if (how === 'stop') b.scene.stop();
        else b.D.setLevel('off');
        assert.equal(b.view(), before, how);
        assert.equal(b.D.active(), false, how);
        assert.equal(b.D.isBusy(), false, how);
        assert.equal(b.D.timeScale(), 1, how);
    }
});

test('a 3D map: the shot is laid over the map camera\'s pose and taken off again; the camera moves there and back, and only a chosen cut jumps', () => {
    const b = battle({ cinematic: { level: 'every' }, flat: false });
    b.settle();
    const before = b.view();
    const home = plain(b.base3);
    b.poses.length = 0;
    b.aim(1);
    b.run(70);
    assert.equal(b.view(), before, 'no scroll and no zoom on a 3D map');
    assert.ok(gap(b.poses[0].eye, home.eye) < 1, 'it starts from the tactical view');
    assert.ok(gap(b.poses[b.poses.length - 1].eye, b.D._want3.eye) < 0.05, 'and arrives at the shot, which is still pushing in');
    const aimed = b.poses.length;
    b.fire(); b.impact(1);
    b.run(1);
    assert.deepEqual(plain(b.poses[b.poses.length - 1].look), { x: 4.5, y: 0.62 * 2, z: 2.5 }, 'a cut inside the action: the target at once');
    b.end();
    b.run(300);
    assert.equal(b.D.active(), false);
    const last = b.poses[b.poses.length - 1];
    assert.ok(gap(last.eye, home.eye) < 0.05, 'the last frame of the way back is home');
    assert.equal(b.D.pose3(b.base3), b.base3, 'given back: the map camera\'s own pose, untouched');
    assert.deepEqual(plain(b.base3), home);
    assert.equal(b.D.cutSubjects(), null, 'nothing held open for a shot that is over');
    // Fifty tiles down to the shoulder and back up: no frame jumps, and the speed never steps (the one cut aside).
    const speeds = b.poses.map((p, i) => (i ? gap(p.eye, b.poses[i - 1].eye) : 0));
    for (let i = 1; i < speeds.length; i++) {
        if (i === aimed || i === aimed + 1) continue;
        assert.ok(speeds[i] < 5, `frame ${i} moves ${speeds[i]}`);
        assert.ok(Math.abs(speeds[i] - speeds[i - 1]) < 0.9 || i === aimed + 2, `frame ${i}: speed ${speeds[i - 1]} to ${speeds[i]}`);
    }
    assert.ok(speeds[aimed] > 1 || speeds[aimed + 1] > 1, 'the cut is the one jump');

    // A wall across the way: the crane goes over it, never through; with no way over, a cut.
    const solid = (x, y, z) => z > 12 && z < 13 && y < 9;
    const c = battle({ cinematic: { level: 'every' }, flat: false, solid });
    c.settle();
    Object.assign(c.base3.eye, { x: 2.5, y: 7, z: 22 });
    c.poses.length = 0;
    c.aim(1); c.run(60);
    assert.ok(c.D._lift > 0, 'lifted over the wall');
    assert.ok(c.poses.every(p => !solid(p.eye.x, p.eye.y, p.eye.z)), 'never inside it');
    assert.ok(gap(c.poses[c.poses.length - 1].eye, c.D._want3.eye) < 0.05);
    assert.equal(b.C.clearWay({ solid: (x, y, z) => z > 12 && z < 13 }, { eye: { x: 0, y: 5, z: 20 }, look: { x: 0, y: 0, z: 0 }, fov: 30 }, { eye: { x: 0, y: 2, z: 4 }, look: { x: 0, y: 0, z: 0 }, fov: 30 }), null, 'a wall with no top is no way');
    assert.equal(b.C.clearWay({ solid: () => false }, { eye: { x: 0, y: 5, z: 20 }, look: { x: 0, y: 0, z: 0 }, fov: 30 }, { eye: { x: 0, y: 2, z: 4 }, look: { x: 0, y: 0, z: 0 }, fov: 30 }).lift, 0);
    // A building right by where the camera lands: the crane crests late, over it, and drops in.
    const byTheEnd = (x, y, z) => z > 7 && z < 10 && y < 4;
    const late = b.C.clearWay({ solid: byTheEnd }, { eye: { x: 0, y: 30, z: 40 }, look: { x: 0, y: 0, z: 0 }, fov: 15 }, { eye: { x: 0, y: 2, z: 4 }, look: { x: 0, y: 1, z: -4 }, fov: 40 });
    assert.ok(late && late.lift > 0, JSON.stringify(late));
});

test('the crane and the spring: the eye closes on the subject by ratio, and the spring lands on a still target', () => {
    const { C } = battle();
    const a = { eye: { x: 0, y: 30, z: 40 }, look: { x: 0, y: 0, z: 0 }, fov: 15 }, z = { eye: { x: 3, y: 2, z: 0 }, look: { x: 8, y: 1, z: 0 }, fov: 40 };
    assert.ok(gap(C.swing(a, z, 0).eye, a.eye) < 1e-9 && gap(C.swing(a, z, 1).eye, z.eye) < 1e-9);
    const d = e => { const p = C.swing(a, z, e); return gap(p.eye, p.look); };
    assert.ok(Math.abs(d(0.5) - Math.sqrt(d(0) * d(1))) < 1e-9, 'half way is the geometric middle of the two distances');
    assert.ok(Math.abs(C.swing(a, z, 0.5, 0.5, 6).eye.y - C.swing(a, z, 0.5).eye.y - 6) < 1e-9, 'a lift is highest in the middle');
    assert.equal(C.smoother(0), 0); assert.equal(C.smoother(1), 1); assert.ok(C.smoother(0.02) < 0.0001, 'starts at rest');
    const state = { x: [0], v: [0] };
    let worst = 0, last = 0;
    for (let i = 0; i < 60; i++) { C.damp(state, [10], 4); worst = Math.max(worst, state.x[0]); assert.ok(state.x[0] >= last - 1e-9); last = state.x[0]; }
    assert.ok(worst <= 10 + 1e-6 && Math.abs(state.x[0] - 10) < 0.01, 'no overshoot, and there in the end');
});

/** Degrees between where a pose looks and a point. */
function offAxis(pose, point) {
    const a = [pose.look.x - pose.eye.x, pose.look.y - pose.eye.y, pose.look.z - pose.eye.z];
    const c = [point.x - pose.eye.x, point.y - pose.eye.y, point.z - pose.eye.z];
    const dot = a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
    return Math.acos(Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...c)))) * 180 / Math.PI;
}

test('over the shoulder: behind the shooter on the weapon side, both in frame; a wall there sends it to the other shoulder, then up', () => {
    const b = battle({ flat: false });
    const { C } = b;
    const world = solid => ({ is3D: true, ground: () => 0, height: () => 2, solid });
    const U = { x: 2.5, y: 0, z: 2.5, h: 2, c: { direction: () => 6 } }, T = { x: 8.5, y: 0, z: 2.5, h: 2, c: {} };
    const open = C.shots.aim(world(() => false), U, T, null);
    assert.equal(open.variant, 'right');
    // Shooting east, the right hand is south (+z); the camera is behind (west of) the shooter.
    assert.ok(open.b.eye.x < U.x && open.b.eye.z > U.z && open.b.eye.y > 1.5, JSON.stringify(open.b.eye));
    assert.ok(offAxis(open.b, { x: 8.5, y: 1.24, z: 2.5 }) < 1, 'aimed at the target');
    assert.ok(offAxis(open.b, { x: 2.5, y: 1.24, z: 2.5 }) < open.b.fov * 0.8, 'the shooter is in the picture');
    assert.ok(Math.hypot(open.b.eye.x - U.x, open.b.eye.z - U.z) < Math.hypot(open.a.eye.x - U.x, open.a.eye.z - U.z), 'it pushes in');
    assert.ok(open.frames >= 120 && open.curve === 'linear', 'slowly, for as long as the shot is up');

    // A wall along the shooter's right side.
    const rightWall = (x, y, z) => z >= 3 && z <= 4.5 && y < 5;
    const other = C.shots.aim(world(rightWall), U, T, null);
    assert.equal(other.variant, 'left');
    assert.ok(other.b.eye.z < U.z);
    // Walls on both sides, open above 3: from over the head.
    const corridor = (x, y, z) => (z >= 3 || z <= 2) && y < 3;
    const raised = C.shots.aim(world(corridor), U, T, null);
    assert.equal(raised.variant, 'raised');
    assert.ok(!corridor(raised.b.eye.x, raised.b.eye.y, raised.b.eye.z));
    // A low roof over the shooter as well: high and wide, outside it all.
    const boxed = (x, y, z) => ((z >= 3 || z <= 2) && y < 6) || (y > 2.5 && y < 6 && x < 6);
    const high = C.shots.aim(world(boxed), U, T, null);
    assert.equal(high.variant, 'high');
    assert.equal(high.fallback, true);
    assert.ok(!boxed(high.b.eye.x, high.b.eye.y, high.b.eye.z), 'the camera is never inside a solid');
    assert.ok(offAxis(high.b, { x: 5.5, y: 1, z: 2.5 }) < 12, 'both still in frame');
    // Another unit standing where the camera would: the other shoulder; one in the line of fire: over its head.
    const crowd = bodies => Object.assign(world(() => false), { bodies });
    const behind = C.shots.aim(crowd([{ x: U.x - 2.9, y: 0, z: U.z + 1.1, h: 2, c: {} }]), U, T, null);
    assert.equal(behind.variant, 'left', 'an ally at the right shoulder');
    assert.equal(C.shots.aim(crowd([{ x: 4, y: 0, z: 3, h: 2, c: {} }]), U, T, null).variant, 'left', 'a unit in the right shoulder\'s line of sight');
    const between = C.shots.aim(crowd([{ x: 4, y: 0, z: 3, h: 2, c: {} }, { x: 4, y: 0, z: 2, h: 2, c: {} }]), U, T, null);
    assert.equal(between.variant, 'raised', 'units across both lines: over their heads');
    assert.equal(C.shots.aim(crowd([U, T]), U, T, null).variant, 'right', 'the shot\'s own two are not in its way');
    // A tree's canopy over the right shoulder (scenery is models, which the map's solids know nothing of): the other shoulder.
    const wood = list => Object.assign(world(() => false), { scenery: list });
    assert.equal(C.shots.aim(wood([{ x: 0.5, y: 0, z: 4.5, h: 6, r: 1.6 }]), U, T, null).variant, 'left', 'a pine where the camera would stand');
    assert.equal(C.shots.aim(wood([{ x: 5.5, y: 0, z: 3.4, h: 6, r: 1.2 }]), U, T, null).variant, 'left', 'a pine across the right shoulder\'s view');
    assert.equal(C.shots.aim(wood([{ x: 5.5, y: 0, z: 9, h: 6, r: 1.2 }]), U, T, null).variant, 'right', 'one off to the side is no matter');
    const through = C.shots.aim(wood([{ x: 5.5, y: 0, z: 2.5, h: 8, r: 2.5 }]), U, T, null);
    assert.equal(through.variant, 'high', 'a canopy over the whole line: from above');
    assert.equal(through.region, true, 'where the map keeps the field open (trees thin, roofs cut)');
    assert.equal(open.region, false);
    // Something between the camera and the target counts as blocked, the subject's own last stretch does not.
    assert.equal(C.blocked(world((x, y, z) => x > 5 && x < 5.5), { x: 0, y: 1, z: 2.5 }, { x: 8.5, y: 1, z: 2.5 }), true);
    assert.equal(C.blocked(world((x, y, z) => x > 8.2), { x: 0, y: 1, z: 2.5 }, { x: 8.5, y: 1, z: 2.5 }), false);

    // The hit is seen from the attacker's side of the target, on the side asked for; that side walled, from over the line before the other side.
    const hit = C.shots.impact(world(() => false), U, T, 'hit', 'left');
    assert.equal(hit.variant, 'right');
    assert.ok(hit.b.eye.x < T.x && hit.b.eye.z > T.z, 'right of the line, toward the shooter');
    const walled = C.shots.impact(world((x, y, z) => z > 3.2 && y < 2), U, T, 'hit', 'left');
    assert.equal(walled.variant, 'raised');
});

test('the sniper sequence: down the sight line, then with the round to the target, then the hit', () => {
    const b = battle({ cinematic: { level: 'some' }, flat: false });
    b.settle();
    b.aim(2);
    const sight = b.D.shot();
    assert.equal(sight.name, 'sight');
    // Behind the shooter, close to the line, the lens closing.
    assert.ok(sight.a.eye.x < 2.5 && Math.abs(sight.b.eye.z - 2.5) < 1 && sight.b.fov < sight.a.fov / 2);
    assert.ok(offAxis(sight.b, { x: 12.5, y: 1.24, z: 2.5 }) < 0.5);
    assert.equal(b.run(200, () => !b.D.isBusy()), 60, 'the battle waits for the sight line');
    b.fire();
    const round = b.D.shot();
    assert.equal(round.name, 'round');
    assert.equal(round.blend, 0, 'a cut, inside the action');
    assert.ok(round.a.eye.x > 2.5 && round.a.eye.x < 4.5 && round.b.eye.x > 8 && round.b.eye.x < 12.5, 'from beside the muzzle, ahead of the shooter, to just short of the target');
    assert.ok(Math.abs(round.a.eye.z - 2.5) > 0.5 && Math.abs(round.a.eye.z - 2.5) < 1.2, 'beside the line, not on it');
    assert.equal(round.frames, 36, 'never shorter than a shot can be read');
    b.poses.length = 0;
    const scales = [];
    b.run(36, () => { scales.push(b.D.timeScale()); return false; });
    const xs = b.poses.map(p => p.eye.x);
    assert.ok(xs.every((x, i) => i === 0 || x >= xs[i - 1] - 1e-9), 'forward all the way');
    assert.ok(b.poses.every(p => offAxis(p, { x: 12.5, y: 1.24, z: 2.5 }) < 0.5), 'the target stays dead ahead');
    assert.ok(Math.min(...scales) <= 0.31 && scales.every((s, i) => i === 0 || Math.abs(s - scales[i - 1]) <= b.C.TIME_RAMP + 1e-9), 'slow, eased in and out');
    b.impact(2);
    assert.equal(b.D.shot().name, 'impact');
    assert.equal(b.D._seq.shots, 3, 'three shots for the action, no more');

    // The action's own projectile is ridden when the sequence player has one: the camera waits for it to leave.
    b.end(); b.run(300);
    let flight = null;
    b.w.ReactorFight.Stage = { projectile: () => flight, sequenceInfo: () => ({ cameraSteps: 0, impactAt: [30], length: 60 }) };
    b.aim(2); b.run(62); b.fire();
    assert.equal(b.D.shot().name, 'sight', 'still on the sight line until the round is in the air');
    b.run(10);
    assert.equal(b.D.timeScale(), 1);
    b.run(40, () => b.D.timeScale() < 1);
    assert.ok(b.D.timeScale() < 1, 'time starts to slow before the round leaves');
    assert.equal(b.D.shot().name, 'sight');
    flight = { x: 6.5, y: 1.4, z: 2.5, t: 0.4 };
    b.run(1);
    assert.equal(b.D.shot().name, 'round');
    b.poses.length = 0; b.run(1);
    assert.ok(Math.abs(b.poses[0].eye.x - (6.5 - 3)) < 0.01 && Math.abs(b.poses[0].eye.y - (1.4 + 0.56)) < 0.01, 'just behind the projectile and a little above it');
    b.run(12);
    assert.ok(b.D.timeScale() <= b.C.RIDE_SLOW + 1e-9);
    flight = null;
    b.run(14);
    assert.equal(b.D.timeScale(), 1, 'time runs again once it has landed');
});

test('slow motion: eased in and out; the battle runs on a fraction of the frames, the scene and the camera on all of them', () => {
    const b = battle({ cinematic: { level: 'every' } });
    b.settle();
    b.aim(1); b.run(45); b.fire();
    const { updates } = b.w;
    let scene = updates.scene, main = updates.main;
    b.run(10);
    assert.equal(updates.main - main, 10, 'full speed until something worth slowing');
    b.impact(1, { defeated: true });
    scene = updates.scene; main = updates.main;
    const frame = b.D._frame, scales = [];
    b.run(64, () => { scales.push(b.D.timeScale()); return false; });
    assert.equal(updates.scene - scene, 64);
    assert.ok(updates.main - main > 26 && updates.main - main < 46, 'the battle ran ' + (updates.main - main) + ' of 64 frames');
    assert.equal(b.D._frame - frame, 64, 'the camera keeps its own time');
    assert.equal(Math.min(...scales), 0.4);
    assert.ok(scales.every((s, i) => i === 0 || Math.abs(s - scales[i - 1]) <= b.C.TIME_RAMP + 1e-9), 'never a step');
    assert.equal(b.D.timeScale(), 1);
    main = updates.main;
    b.run(10);
    assert.equal(updates.main - main, 10, 'then full speed again');

    const still = battle({ cinematic: { level: 'every', slowMotion: false } });
    still.settle();
    still.aim(1); still.run(45); still.impact(1, { defeated: true });
    assert.equal(still.D.shot().result, 'kill', 'the kill shot without the slow motion');
    still.run(20);
    assert.equal(still.D.timeScale(), 1);
});

test('the screen is dressed for a shot: the bars ease in, the HUD fades by the same amount, the cell highlights hide', () => {
    const b = battle({ cinematic: { level: 'every' } });
    b.settle();
    b.w.ReactorFight.Marks = {};
    const p = b.D.presentation();
    assert.deepEqual(plain(p), { hud: 1, bars: 0, raw: 0 });
    b.aim(1);
    const bars = [];
    b.run(30, () => { bars.push(p.bars); return false; });
    assert.equal(p.bars, 1);
    assert.equal(p.hud, 0);
    assert.equal(b.w.ReactorFight.Marks.hidden, true);
    assert.ok(bars[0] < 0.01 && bars.every((v, i) => i === 0 || (v >= bars[i - 1] && v - bars[i - 1] < 0.2)), 'eased, not switched');
    b.end(); b.run(60);
    assert.deepEqual(plain(p), { hud: 1, bars: 0, raw: 0 });
    assert.equal(b.w.ReactorFight.Marks.hidden, false);
    assert.equal(b.D.presentation(), p, 'the same object every call');
});

test('an Action Sequence\'s own camera steps replace the automatic shots; its kill still slows', () => {
    const b = battle({ cinematic: { level: 'every' }, flat: false });
    b.settle();
    const user = b.w.$gamePlayer, target = b.w.$gameMap.event(1);
    b.w.ReactorFight.Stage = { sequenceInfo: () => ({ cameraSteps: 2, impactAt: [20], length: 60 }) };
    b.aim(1);
    assert.equal(b.D.shot(), null, 'no automatic aim');
    assert.equal(b.D.isBusy(), false);
    assert.equal(b.D.sequenceCamera({ anchor: 'target', x: 0, y: 0, z: 0.5, duration: 20, easing: 'smooth' }, { user, target, targets: [target] }), true);
    const shot = b.D.shot();
    assert.equal(shot.name, 'authored');
    assert.equal(shot.blend, 20, 'over the step\'s own frames');
    assert.deepEqual(plain(shot.b.look), { x: 4.5, y: 1.24 + 0.5, z: 2.5 }, 'the step\'s offset moves what is looked at');
    assert.equal(b.D.isBusy(), false, 'a sequence is never held by its own camera');
    b.run(25);
    b.impact(1, { defeated: true });
    assert.equal(b.D.shot().name, 'authored', 'no cut away from the authored shot');
    b.run(6);
    assert.ok(b.D.timeScale() < 1, 'the kill still slows');
    assert.equal(b.D.sequenceCamera({ anchor: 'home', x: 0, y: 0, z: 0, duration: 12, easing: 'smooth' }, { user, target }), true);
    assert.equal(b.D.shot(), null);
    b.run(80);
    assert.equal(b.D.active(), false, 'Home gives the view back');

    // The sequence player may only learn of camera steps as it starts: the automatic shot makes way.
    delete b.w.ReactorFight.Stage;
    b.end(); b.run(5);
    b.aim(1);
    assert.equal(b.D.shot().name, 'aim');
    b.run(45);
    b.D.sequenceStart({ unitId: b.hero, targetIds: [b.unitOf(1)], cameraSteps: 1, impactAt: [10], length: 30 });
    assert.equal(b.D.shot(), null);
    b.impact(1);
    assert.equal(b.D.shot(), null, 'and the automatic cut does not come back');
});

test('reinforcements get a shot of their own, several at once one shot', () => {
    const b = battle({ cinematic: { level: 'some' }, flat: false });
    b.settle();
    b.emit('fightUnitSpawned', { unitId: b.unitOf(1), eventId: 1, team: 'enemy' });
    const shot = b.D.shot();
    assert.equal(shot.name, 'reveal');
    assert.equal(shot.points.length, 1);
    b.run(3);
    b.emit('fightUnitSpawned', { unitId: b.unitOf(3), eventId: 3, team: 'enemy' });
    assert.equal(b.D.shot(), shot, 'the same shot, re-aimed while it is still on its way: nothing restarts');
    assert.equal(shot.points.length, 2);
    assert.equal(b.D.isBusy(), true);
    b.run(200);
    assert.equal(b.D.active(), false);
});

test('the file is in every runtime list, after reactor_fight.js', () => {
    const repo = path.join(__dirname, '..', '..');
    const main = fs.readFileSync(path.join(repo, 'runtime', 'reactor_main.js'), 'utf8');
    assert.ok(main.indexOf('"js/reactor_fight.js"') > 0 && main.indexOf('"js/reactor_fight.js"') < main.indexOf('"js/reactor_fight_camera.js"'));
    assert.ok(main.indexOf('"js/reactor_fight_camera.js"') < main.indexOf('"js/reactor_plugins.js"'));
    for (const name of ['build-scripts/build.js', 'build-scripts/build-worker.js', 'build-scripts/dist-editor-worker.js']) {
        assert.ok(fs.readFileSync(path.join(repo, 'editor', name), 'utf8').includes("'reactor_fight_camera.js'"), name);
    }
});

test('the battle\'s opening sweep asks the Tactical view which way it looks, and ends looking that way', () => {
    const b = battle({ flat: false });
    // The view chose the quarter that looks north-west (the battle's own view, set up as the battle began).
    const toward = { dx: -Math.SQRT1_2, dz: -Math.SQRT1_2 };
    b.w.ReactorFight.View = { direction: () => toward };
    b.run(8);
    const shot = b.D.shot();
    assert.equal(shot.name, 'establish');
    const dx = shot.b.look.x - shot.b.eye.x, dz = shot.b.look.z - shot.b.eye.z, far = Math.hypot(dx, dz);
    assert.ok(Math.abs(dx / far - toward.dx) < 1e-6 && Math.abs(dz / far - toward.dz) < 1e-6, `it ends looking ${dx / far},${dz / far}`);
});

test('the opening sweep ends looking the way the Tactical view will be watched from', () => {
    const b = battle({ flat: false });
    const C = b.C, world = { is3D: true, ground: () => 0, height: () => 2, solid: () => false };
    const allies = [{ x: 10.5, y: 0, z: 10.5, h: 2, c: null }], enemies = [{ x: 16.5, y: 0, z: 10.5, h: 2, c: null }];
    // The way the last pose of a shot looks over the ground.
    const looks = shot => { const dx = shot.b.look.x - shot.b.eye.x, dz = shot.b.look.z - shot.b.eye.z, far = Math.hypot(dx, dz); return { dx: dx / far, dz: dz / far }; };
    const start = shot => { const dx = shot.a.look.x - shot.a.eye.x, dz = shot.a.look.z - shot.a.eye.z, far = Math.hypot(dx, dz); return { dx: dx / far, dz: dz / far }; };
    // The view's quarter is known (it looks south-east): the arc ends looking exactly that way, and began well off it.
    const toward = { dx: Math.SQRT1_2, dz: Math.SQRT1_2 };
    const aimed = C.shots.establish(world, allies, enemies, null, toward);
    assert.ok(Math.abs(looks(aimed).dx - toward.dx) < 1e-6 && Math.abs(looks(aimed).dz - toward.dz) < 1e-6, JSON.stringify(looks(aimed)));
    assert.ok(start(aimed).dx * toward.dx + start(aimed).dz * toward.dz < 0.7, 'it sweeps to that view from the side');
    assert.equal(aimed.name, 'establish');
    assert.equal(aimed.hold, 120);
    // Whichever quarter the view chose, the arc goes there: looking back over the party from behind the enemy as well.
    const behind = C.shots.establish(world, allies, enemies, null, { dx: -Math.SQRT1_2, dz: -Math.SQRT1_2 });
    assert.ok(looks(behind).dx < -0.7 && looks(behind).dz < -0.7);
    // With no view of the battle's own (a battle that keeps the map's camera) the arc is the party's shoulder, as before.
    const plainArc = C.shots.establish(world, allies, enemies, null);
    const off = looks(plainArc), angle = Math.acos(Math.max(-1, Math.min(1, off.dx))) * 180 / Math.PI;
    assert.ok(Math.abs(angle - 40) < 0.5, `forty degrees off the line to the enemy (${angle})`);
});

test('a tree\'s crown is in the camera\'s way far past its trunk; a model as wide as it stands has none', () => {
    const b = battle({ cinematic: 'all', flat: false });
    const C = b.w.ReactorFight.Camera;
    // A 26-tile tree whose model spreads 20 across, bumped into only at its trunk (2.8 tiles); a cart as wide as its footprint.
    b.w.Reactor3D = { collisionKeysFor: spec => ({ model: spec.name }), _glbCache: {
        tree: { template: { userData: { glbSize: { x: 10, y: 13, z: 9 } } } },
        cart: { template: { userData: { glbSize: { x: 2, y: 1.5, z: 3 } } } } } };
    const crown = C.crownOf({ name: 'tree', size: 26 }, 2.84);
    assert.ok(Math.abs(crown - 10 * 2 / 2 * C.CROWN_FILL) < 1e-9, 'four fifths of its widest reach');
    assert.equal(C.crownOf({ name: 'cart', size: 3 }, 1.5), 0);
    assert.equal(C.crownOf({ name: 'not loaded', size: 3 }, 1), 0);
    // A camera in the crown, or looking through it, is blocked; under it, beside the trunk, it is not.
    const world = { solid: () => false, scenery: [{ x: 10, z: 10, y: 0, h: 26, r: 2.13 }, { x: 10, z: 10, y: 26 * C.CROWN_FROM, h: 26 * (1 - C.CROWN_FROM), r: crown }] };
    assert.equal(C.blocked(world, { x: 14, y: 10, z: 10 }, { x: 30, y: 2, z: 10 }), true, 'the eye is in the leaves');
    assert.equal(C.blocked(world, { x: 0, y: 12, z: 10 }, { x: 30, y: 12, z: 10 }), true, 'the line passes through them');
    assert.equal(C.blocked(world, { x: 14, y: 3, z: 10 }, { x: 30, y: 2, z: 10 }), false, 'under the crown');
});
