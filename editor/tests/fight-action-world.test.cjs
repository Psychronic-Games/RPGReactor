'use strict';
// An Action or First Person battle against the 3D world (runtime/reactor_fight_action.js with the real world
// queries of runtime/reactor_3d_world.js): bodies are their models' footprints, shots, looks and blows stop at
// what is built and pass through open air, units keep out of one another and out of pillars, a shot is traced
// from the eye, a shot that meets the world leaves a mark, and a fallen leader hands the lead on where the next
// member stands. Models are what a test hangs on a character (`_body`).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');

const R = require(path.join(__dirname, '..', '..', 'runtime', 'reactor_3d.js'));
// The real three, for the tests that read a model's mesh. It is given to a test's world by name (`w.THREE`) and
// kept out of this file's own globals, where the world queries would take every test's stand-in model for a mesh.
global.self = global; global.window = global;
require(path.join(__dirname, '..', '..', 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
delete global.THREE;

const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const facing = direction => ({ pages: [page({ image: { tileId: 0, characterName: '', characterIndex: 0, direction, pattern: 1 } })] });
const foe = (w, eventId) => w.$gameFight.unitOfEvent(eventId);
let nextId = 1;
const piece = (kind, x, y, z, extra = {}) => Object.assign({ id: nextId++, kind, x, y, z, rot: 0, material: 'Stone' }, extra);
const shape = (kind, x, y, z, size, extra = {}) => piece(kind, x, y, z, Object.assign({ size, angle: 0 }, extra));

/**
 * A 3D fight world on the helper's 20 by 15 floor: the real world queries over `pieces`, and for models whatever
 * a test hangs on a character as `_body` ({ tall, halfX, halfZ, yaw, mask }); a character without one is a sprite.
 * A body with a `model` names a loaded model of its own (`Reactor3D._glbCache[model]`), whose mesh is read.
 * `spriteset`: the map's scene and sprites exist before the driver loads, so the driver hooks their frames as in the game.
 */
function world(pieces, options = {}) {
    const w = fightWorld(Object.assign({ action: !options.spriteset, mapNote: '<3d>', mapSidecar: { version: 1, mode: '3d', pieces } }, options));
    if (options.spriteset) {
        vm.runInContext(`Spriteset_Map = function() {}; Spriteset_Map.prototype.update = function() {};
            Scene_Map = function() { this.children = []; };
            Object.assign(Scene_Map.prototype, { update() {}, stop() {}, isMapTouchOk: () => true, isMenuCalled: () => false,
                addChild(sprite) { sprite.parent = this; this.children.push(sprite); }, removeChild(sprite) { sprite.parent = null; this.children.splice(this.children.indexOf(sprite), 1); } });`, w);
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_fight_action.js'), 'utf8'), w, { filename: 'reactor_fight_action.js' });
    }
    w.$dataSystem.weaponTypes = ['', 'Sword', 'Rifle', 'Pistol', 'Shotgun', 'Bow', 'Cannon', 'Dagger'];
    const weapon = (id, name, wtypeId, note = '') => ({ id, name, wtypeId, etypeId: 1, params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], note, iconIndex: 96 + id, animationId: 0, price: 0, description: '' });
    w.$dataWeapons.push(weapon(1, 'Blade', 1), weapon(2, 'Rifle', 2, '<range: 3-9>\n<fire rate: 5> <magazine: 0> <spread: 0>'), weapon(3, 'Launcher', 6, '<range: 3-9>\n<spread: 0>'));
    for (let type = 1; type <= 7; type++) w.$dataClasses[1].traits.push({ code: 51, dataId: type, value: 1 });
    w.$dataEnemies[1].params[0] = 5000;
    w.$dataEnemies[2].params[0] = 5000;
    const facade = Object.create(R);
    Object.assign(facade, {
        isMap3D: () => true, shouldRender3D: () => true,
        // Every model counts as loaded (a model still loading has no measure of its own).
        collisionKeysFor: spec => ({ model: (spec && spec.model) || 'loaded', pose: (spec && spec.model) || 'loaded' }), _glbCache: { loaded: { template: { userData: {} } } },
        characterModelSpec: c => (c && c._body) || null,
        characterHeightTiles: c => (c && c._body ? c._body.tall : 1.5),
        eventModelWorldYaw: (c, spec) => (spec && spec.yaw) || 0,
        eventModelFootprint: (c, spec) => ({ rawX: spec.halfX, rawZ: spec.halfZ, halfX: spec.halfX, halfZ: spec.halfZ, yaw: spec.yaw || 0, mask: spec.mask || null }),
        // No camera of its own: a test that looks through one gives it (see `eye`).
        Camera: { currentState: () => ({ mode: facade.cameraMode || 'isometric' }), look: { yaw: 0, pitch: 0 } },
        viewport: () => (facade.camera ? { camera: () => facade.camera } : null)
    });
    w.Reactor3D = facade;
    R._doorStates = null;
    return w;
}
const equip = (w, weaponId, actorId = 1) => { w.$gameActors.actor(actorId).forceChangeEquip(0, weaponId ? w.$dataWeapons[weaponId] : null); return w.$gameActors.actor(actorId); };
function begin(w, options = {}) {
    assert.ok(w.$gameFight.start(Object.assign({ mode: 'action' }, options)) > 0);
    w.run(3);
    return w.$gameFight;
}
/** Everyone but the player stands still. */
const still = w => { for (const u of w.$gameFight._units) if (u !== w.$gameFight.playerUnit()) w.$gameFight.act().ai[u.id] = Object.assign(w.ReactorFight.Action.aiOf(w.$gameFight, w.$gameFight.act(), u, w.$gameFight.character(u)), { state: 'stagger', timer: 100000 }); };
const solo = w => { for (const id of w.$gameParty._actors.slice(1)) w.$gameParty.removeActor(id); };
const hp = (w, eventId) => w.$gameFight.battler(foe(w, eventId)).hp;
/** A figure three tiles tall, as the bundled characters stand. */
const figure = (tall = 3) => ({ tall, halfX: 0.6, halfZ: 0.6 });
/** Gives a character a model (or takes it away), measured afresh by the driver, which keeps a body's measure a few seconds. */
function dress(w, character, body) {
    if (body) character._body = body; else delete character._body;
    w.ReactorFight.Action.bodyOf(w.$gameFight, character).at = -1e9;
    return character;
}
/** A first-person eye for the player: a camera at `at` looking along `dir` (three's own vectors are not needed). */
function eye(w, at, dir) {
    const length = Math.hypot(dir[0], dir[1], dir[2]);
    w.Reactor3D.cameraMode = 'firstPerson';
    w.Reactor3D.camera = { position: { x: at[0], y: at[1], z: at[2] }, fov: 60, getWorldDirection(v) { v.x = dir[0] / length; v.y = dir[1] / length; v.z = dir[2] / length; return v; } };
    w.THREE = { Vector3: function() { this.x = 0; this.y = 0; this.z = 0; } };
}

test('a big unit is its footprint as it stands, not a round post of its longest half: it soaks no shot aimed beside it', () => {
    // A tank 15.6 long (east to west) and 7 wide at (8,7); a raider four tiles north of its middle, well inside
    // the circle of its longest half (7.8) and outside its hull.
    const w = world([], { events: [unit(1, 8, 7, 'enemy 1', facing(4)), unit(2, 8, 2, 'enemy 2', facing(2))] });
    solo(w);
    equip(w, 2);
    w.$gamePlayer.locate(2, 2);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const tank = fight.character(foe(w, 1)), raider = fight.character(foe(w, 2));
    dress(w, tank, { tall: 5, halfX: 7.8, halfZ: 3.5 });
    dress(w, raider, figure()); dress(w, w.$gamePlayer, figure());
    assert.equal(fight.bodyRadius(tank), 7.8, 'the furthest it reaches any way');
    assert.equal(fight.bodyRadius(tank, { x: 8, y: 2 }), 3.5, 'toward its flank: its half width');
    assert.equal(fight.bodyRadius(tank, { x: 0, y: 7 }), 7.8, 'toward its end: its half length');
    assert.equal(fight.bodyRadius(raider, tank), 0.5, 'a standing figure is on its cell, whatever its arms span');
    const size = A.bodyOf(fight, tank);
    assert.deepEqual([size.round, size.halfX, size.halfZ], [false, 7.8, 3.5]);
    assert.equal(A.bodyOf(fight, raider).round, true);
    assert.ok(Math.abs(A.bodyOf(fight, raider).wide - 0.39) < 1e-9, 'a figure is a post as wide as its shoulders');
    // Along row 2, at chest height: the line passes a tile and a half north of the hull and meets the raider.
    w.$gamePlayer.setDirection(6);
    w.run(2);
    const shots = [];
    w.ReactorEvents.on('fightShot', payload => shots.push(payload.targetId));
    assert.equal(fight.actionAttack(), true);
    assert.deepEqual(Array.from(shots), [foe(w, 2).id], 'the raider is struck');
    assert.equal(hp(w, 1), 5000, 'not the tank');
    const hud = fight.actionHud();
    assert.equal(hud.target && hud.target.unitId, foe(w, 2).id, 'and it is the raider under the crosshair');
    // The same line against bodies alone: the tank's footprint ends two cells short of it.
    assert.equal(A.rayBody(A.bodies(fight, 'enemy').list.find(b => b.unit === foe(w, 1)), 2.5, 1.8, 2.5, 1, 0, 0, 18, false), -1);
    // Straight at the hull it is struck at its near face, 3.5 from its middle.
    const hull = A.rayBody(A.bodies(fight, 'enemy').list.find(b => b.unit === foe(w, 1)), 8.5, 1.8, 1.5, 0, 0, 1, 18, false);
    assert.ok(Math.abs(hull - 2.5) < 1e-9, `at its flank (${hull})`);
    assert.ok(Math.abs(A.reachTo(fight, 8.5, 2.5, tank) - 1.5) < 1e-9, 'the room to it is to its flank');
    assert.equal(A.reachTo(fight, 3.5, 7.5, tank), 0, 'inside its footprint: none');
    // Turned a quarter (its yaw follows its facing), the footprint turns with it.
    dress(w, tank, { tall: 5, halfX: 7.8, halfZ: 3.5, yaw: Math.PI / 2 });
    assert.ok(Math.abs(A.reachTo(fight, 8.5, 2.5, tank)) < 1e-9, 'now row 2 is under its length');
});

test('a model that says which cells it covers is struck only there', () => {
    const w = world([], { events: [unit(1, 10, 7, 'enemy 1', facing(4))] });
    solo(w);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    // An L: the west half of its box is solid, the east half only along the north edge.
    const has = (x, z) => x >= -3 && x < 0 && z >= -2 && z < 2 || x >= 0 && x < 3 && z >= -2 && z < -1;
    const mask = { sub: 4, touches: (x, z, r) => has(x, z) || has(x + r, z) || has(x - r, z) || has(x, z + r) || has(x, z - r), blocksTile: (x, z) => has(x, z) };
    const tank = fight.character(foe(w, 1));
    dress(w, tank, { tall: 4, halfX: 3.34, halfZ: 2.34, mask });
    const body = A.bodies(fight, 'enemy').list[0];
    assert.equal(body.mask, mask);
    assert.equal(A.rayBody(body, 12.5, 1.5, 12.5, 0, 0, -1, 4, false), -1, 'up the open part of the L, as far as its box: nothing');
    const north = A.rayBody(body, 12.5, 1.5, 12.5, 0, 0, -1, 12, false);
    assert.ok(north > 5.6 && north < 6.2, `the arm of the L beyond it (${north})`);
    const west = A.rayBody(body, 8.5, 1.5, 12.5, 0, 0, -1, 12, false);
    assert.ok(west > 2.6 && west < 3.2, `the solid half at its south face (${west})`);
    assert.equal(A.rayBody(body, 8.5, 6, 12.5, 0, 0, -1, 12, false), -1, 'over its top');
    // A step into the solid half is refused, into the open part of its box allowed.
    const me = fight.playerUnit();
    assert.equal(A.roomAt(fight, me, w.$gamePlayer, 9, 8), false);
    assert.equal(A.roomAt(fight, me, w.$gamePlayer, 12, 8), true);
});

test('shots and looks stop at a wall and pass open air: no red crosshair, no bar, no hit on one behind a wall', () => {
    // A wall across column 6 from row 0 to 4 between the player (2,2) and a raider (9,2); another raider stands in
    // the open under an awning beside a post (9,8), the player's line to it passing a third of a tile off the post.
    const pieces = [];
    for (let y = 0; y <= 4; y++) pieces.push(piece('wall', 6, y, 0));
    pieces.push(shape('box', 8, 8, 3.2, [5, 0.2, 3]), shape('cylinder', 6, 8, 0, [0.24, 4, 0.24], { offset: [0, 0.33] }));
    const w = world(pieces, { events: [unit(1, 9, 2, 'enemy 1', facing(4)), unit(2, 9, 8, 'enemy 2', facing(4))] });
    solo(w);
    equip(w, 2);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const hidden = fight.character(foe(w, 1)), shown = fight.character(foe(w, 2));
    for (const c of [hidden, shown, w.$gamePlayer]) dress(w, c, figure());
    assert.equal(A.deep(), true);
    assert.equal(A.sees(fight, w.$gamePlayer, hidden), false, 'the wall hides it');
    w.$gamePlayer.setDirection(6);
    w.run(2);
    assert.equal(fight.actionAttack(), true);
    assert.equal(A.rayMet, 'piece');
    assert.equal(hp(w, 1), 5000, 'the shot stops at the wall');
    let hud = fight.actionHud();
    assert.equal(hud.crosshair.onTarget, false, 'the crosshair is not on it');
    assert.equal(hud.target, null, 'no target bar');
    assert.equal(hud.enemies.find(e => e.unitId === foe(w, 1).id).visible, false, 'no bar over its head');
    // Locked on from before it went behind the wall: the bar is not shown through the wall either.
    fight.act().player.lock = foe(w, 1).id;
    w.run(1);
    assert.equal(fight.actionHud().target, null);
    fight.act().player.lock = 0;
    fight.actionLock();
    assert.equal(fight.act().player.lock, foe(w, 2).id, 'and the lock takes the one in sight, never the one behind the wall');
    fight.actionLock();
    assert.equal(fight.act().player.lock, 0, 'after which there is no other to take');
    // Under the awning, beside the post.
    w.$gamePlayer.locate(2, 8);
    w.$gamePlayer.setDirection(6);
    w.run(25);
    assert.equal(A.sees(fight, w.$gamePlayer, shown), true, 'seen under the awning, past the post');
    assert.equal(A.sees(fight, shown, w.$gamePlayer), true);
    assert.equal(fight.actionAttack(), true);
    assert.ok(hp(w, 2) < 5000, 'and hit');
    hud = fight.actionHud();
    assert.equal(hud.crosshair.onTarget, true);
    assert.equal(hud.enemies.find(e => e.unitId === foe(w, 2).id).visible, true);
    // The walking rule, which lines were read by before, calls both of those cells solid.
    assert.ok(R.groundHeightAt(w.$dataMap, 6.5, 8.5, 1.8) > 3, 'the post\'s cell reads as the post\'s top');
    assert.ok(R.groundHeightAt(w.$dataMap, 8.5, 8.5, 1.8) > 3, 'the cell under the awning as the awning');
});

test('eyes are at nine tenths of a body and a chest at six: a waist-high counter hides nobody, a shut door does', () => {
    const pieces = [shape('box', 5, 2, 0, [1, 1.3, 1]), piece('doorway', 5, 8, 0), piece('wall', 5, 7, 0), piece('wall', 5, 9, 0),
        piece('door', 5, 8, 0, { id: 700, rot: 1, width: 1, material: 'Wood', opens: 'auto' })];
    const w = world(pieces, { events: [unit(1, 8, 2, 'enemy 1', facing(4)), unit(2, 8, 8, 'enemy 2', facing(4))] });
    solo(w);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const a = fight.character(foe(w, 1)), b = fight.character(foe(w, 2));
    for (const c of [a, b, w.$gamePlayer]) dress(w, c, figure());
    assert.deepEqual([A.EYE, A.CHEST], [0.9, 0.6]);
    assert.equal(A.sees(fight, w.$gamePlayer, a), true, 'over the counter: eyes at 2.7, the chest at 1.8');
    assert.equal(A.sees(fight, a, w.$gamePlayer), true);
    // A sprite a tile and a half tall does not see over it.
    dress(w, a, null); dress(w, w.$gamePlayer, null);
    assert.equal(A.sees(fight, w.$gamePlayer, a), false, 'eyes at 1.35 look at a chest at 0.9 through it');
    dress(w, w.$gamePlayer, figure());
    // The door.
    w.$gamePlayer.locate(2, 8);
    w.run(1);
    assert.equal(A.sees(fight, w.$gamePlayer, b), true, 'no door is shut where no game hangs one');
    try {
        R._doorStates = new Map([[700, { open: false, t: 0 }]]);
        assert.equal(A.sees(fight, w.$gamePlayer, b), false, 'shut: not seen');
        assert.equal(A.sees(fight, b, w.$gamePlayer), false);
        R._doorStates.get(700).t = 1;
        assert.equal(A.sees(fight, w.$gamePlayer, b), true, 'open: seen');
    } finally { R._doorStates = null; }
});

test('no blade, blow or hotbar skill lands through a wall; in the open they land', () => {
    // A wall the whole height of the map on column 3, one cell thick: the player (2,2) and a raider (4,2) stand
    // either side of it, a body's width inside each other's reach. A second raider is on the player's side, far
    // out of any skill's reach.
    const pieces = [];
    for (let y = 0; y < 15; y++) pieces.push(piece('wall', 3, y, 0));
    const w = world(pieces, { events: [unit(1, 4, 2, 'enemy 1', facing(4)), unit(2, 0, 14, 'enemy 1', facing(6))] });
    solo(w);
    equip(w, 1);
    w.$dataSkills[3] = Object.assign({}, w.$dataSkills[1], { id: 3, name: 'Strike', stypeId: 1, mpCost: 0 });
    w.$gameActors.actor(1).learnSkill(3);
    const fight = begin(w), A = w.ReactorFight.Action, actor = w.$gameActors.actor(1);
    still(w);
    const walled = fight.character(foe(w, 1)), open = fight.character(foe(w, 2));
    // Four tiles tall, as the Demo's raiders: half a tile wide, so two cells apart is inside a blade's reach.
    for (const c of [walled, open, w.$gamePlayer]) dress(w, c, figure(4));
    assert.ok(A.gap(fight, w.$gamePlayer, walled) <= A.profile(actor).reach, 'within the blade\'s reach by distance');
    assert.ok(A.gap(fight, walled, w.$gamePlayer) <= 1.5, 'and within the raider\'s');
    assert.equal(A.blowClear(fight, w.$gamePlayer, walled), false);
    // The whole chain at the wall.
    w.$gamePlayer.setDirection(6);
    for (let i = 0; i < 3; i++) { fight.actionAttack(); w.run(30); }
    assert.equal(hp(w, 1), 5000, 'the blade does not reach through the wall');
    assert.equal(fight.actionUse(1), false, 'nor is a skill used on one behind it');
    assert.equal(hp(w, 1), 5000);
    // The raider's own blow at the player through the wall: it never winds up, and looks for a way round instead.
    const ai = fight.act().ai[foe(w, 1).id];
    Object.assign(ai, { state: 'chase', alert: true, timer: 0, cool: 0, targetId: fight.playerUnit().id });
    let wound = false;
    w.run(300, () => { wound = wound || ai.state === 'windup'; return false; });
    assert.equal(wound, false, 'it does not wind up at the wall');
    assert.equal(actor.hp, actor.mhp, 'nor strike through it');
    Object.assign(ai, { state: 'stagger', timer: 100000 });
    // In the open.
    w.$gamePlayer.locate(2, 8);
    w.$gamePlayer.setDirection(4);
    open.locate(1, 8);
    w.run(2);
    assert.equal(A.blowClear(fight, w.$gamePlayer, open), true);
    fight.actionAttack();
    w.run(30);
    assert.ok(hp(w, 2) < 5000, 'a swing lands on one beside the player');
    const before = hp(w, 2);
    assert.equal(fight.actionUse(1), true);
    w.run(60);
    assert.ok(hp(w, 2) < before, 'and so does the skill');
});

test('a blow already begun does not land when a wall has come between', () => {
    const w = world([], { events: [unit(1, 4, 2, 'enemy 1', facing(4))] });
    solo(w);
    const fight = begin(w), A = w.ReactorFight.Action, actor = w.$gameActors.actor(1);
    const enemy = foe(w, 1), from = fight.character(enemy);
    still(w);
    from.locate(3, 2);
    // Its blow is in the air (a run with a reach) when the player is put behind a wall, still within its reach.
    const action = new w.Game_Action(fight.battler(enemy));
    action.setAttack();
    A.startRun(fight, enemy, action, [fight.playerUnit()], { reach: 3 });
    w.$dataMap.reactor3d.pieces = [piece('wall', 3, 3, 0)];
    w.$gamePlayer.locate(3, 4);
    w.run(40);
    assert.equal(actor.hp, actor.mhp, 'the wall takes it');
    // The same blow with nothing between lands.
    w.$dataMap.reactor3d.pieces = [];
    A.startRun(fight, enemy, action, [fight.playerUnit()], { reach: 3 });
    w.run(40);
    assert.ok(actor.hp < actor.mhp);
});

test('a rocket\'s blast needs a clear way and a sane height: not through a wall, not onto a roof', () => {
    // The rocket strikes the wall on (6,2). One raider stands beside the wall on the player's side, one right behind it.
    const w = world([piece('wall', 6, 1, 0), piece('wall', 6, 2, 0), piece('wall', 6, 3, 0)],
        { events: [unit(1, 5, 3, 'enemy 1', facing(4)), unit(2, 7, 2, 'enemy 1', facing(4))] });
    solo(w);
    equip(w, 3);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    for (const c of [fight.character(foe(w, 1)), fight.character(foe(w, 2)), w.$gamePlayer]) dress(w, c, figure());
    w.$gamePlayer.setDirection(6);
    w.run(2);
    assert.equal(A.profile(w.$gameActors.actor(1)).blast, 1.5);
    assert.equal(fight.actionAttack(), true);
    w.run(40);
    assert.equal(fight.act().shots.length, 0, 'it burst');
    assert.ok(hp(w, 1) < 5000, 'the one in the open beside the burst is caught');
    assert.equal(hp(w, 2), 5000, 'the one behind the wall is not');
});

test('units keep out of one another and out of what is built: a step, a knock-back and a dodge need room for the body', () => {
    // A pillar a tile and a half across on (6,6): it reaches a quarter of a tile into the cells beside it, which the
    // walking rule (a cell is the pillar's when its middle is) leaves open.
    const w = world([shape('cylinder', 6, 6, 0, [1.5, 3, 1.5])], { events: [unit(1, 10, 10, 'enemy 1', facing(4)), unit(2, 12, 2, 'enemy 2', facing(4))] });
    equip(w, 1);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const me = fight.playerUnit(), enemy = foe(w, 1), raider = fight.character(enemy);
    for (const c of [raider, w.$gamePlayer]) dress(w, c, figure());
    assert.equal(A.roomAt(fight, enemy, raider, 7, 6), false, 'beside the pillar the body would stand in it');
    assert.equal(A.roomAt(fight, enemy, raider, 8, 6), true);
    assert.equal(A.roomAt(fight, enemy, raider, 6, 4), true);
    // Walking at a spot beyond the pillar it goes round, never onto the cells the pillar reaches into.
    raider.locate(9, 6);
    const trail = [];
    for (let i = 0; i < 200 && raider.x > 3; i++) { A.step(fight, enemy, raider, 2, 6, false); w.run(1); trail.push(raider.x + ',' + raider.y); }
    for (const cell of ['7,6', '5,6', '6,5', '6,7', '6,6']) assert.equal(trail.includes(cell), false, 'never on ' + cell);
    assert.ok(raider.x <= 3, 'and it got past: ' + trail.filter((c, i) => trail.indexOf(c) === i).join(' '));
    // A knock-back toward the pillar does not drive it in.
    raider.locate(8, 6);
    w.$gamePlayer.locate(9, 6);
    w.run(1);
    assert.equal(A.knock(fight, enemy, raider, w.$gamePlayer), false);
    raider.locate(8, 10);
    w.$gamePlayer.locate(9, 10);
    w.run(1);
    assert.equal(A.knock(fight, enemy, raider, w.$gamePlayer), true, 'in the open it is driven back');
    w.run(30);
    assert.deepEqual([raider.x, raider.y], [7, 10]);
    // A dodge lands on the furthest cell with room: never on a friend, nor in a big body.
    const friend = fight.character(fight._units.find(u => u.party && u !== me));
    fight.act().ai[fight._units.find(u => u.party && u !== me).id].state = 'stagger';
    w.$gamePlayer.locate(14, 10);
    friend.locate(14, 12);
    w.$gamePlayer.setDirection(8);
    w.run(40);
    assert.equal(fight.actionDodge(), true);
    assert.deepEqual([w.$gamePlayer.x, w.$gamePlayer.y], [14, 11], 'one cell: the next holds a friend');
    const big = fight.character(foe(w, 2));
    dress(w, big, { tall: 4, halfX: 2.5, halfZ: 2.5 });
    big.locate(14, 5);
    w.$gamePlayer.locate(14, 9);
    w.$gamePlayer.setDirection(2);
    w.run(40);
    assert.equal(fight.actionDodge(), true);
    assert.deepEqual([w.$gamePlayer.x, w.$gamePlayer.y], [14, 8], 'one cell: the next is under the big body');
    assert.equal(A.roomAt(fight, me, w.$gamePlayer, 14, 7), false);
    assert.equal(A.knock(fight, foe(w, 2), big, w.$gamePlayer), false, 'a big body is not driven');
});

test('a battle does not begin with a unit inside a big one: it takes the nearest clear cell', () => {
    const w = world([], { events: [unit(1, 10, 7, 'enemy 1', facing(4)), unit(2, 11, 6, 'enemy 2', facing(2)), unit(3, 16, 2, 'enemy 2', facing(2))] });
    // The footprint is known before the battle begins, as a placed model's is.
    w.$gameMap.event(1)._body = { tall: 5, halfX: 4, halfZ: 2.5 };
    w.$gameMap.event(2)._body = figure();
    // As the battle starts, before anyone has taken a step.
    assert.ok(w.$gameFight.start({ mode: 'action' }) > 0);
    const fight = w.$gameFight, A = w.ReactorFight.Action;
    const inside = fight.character(foe(w, 2)), tank = fight.character(foe(w, 1));
    assert.deepEqual([tank.x, tank.y], [10, 7], 'the big one stays');
    assert.notDeepEqual([inside.x, inside.y], [11, 6], 'the one inside it was moved');
    assert.ok(A.reachTo(fight, inside.x + 0.5, inside.y + 0.5, tank) > 0, `and stands clear of it now (${inside.x},${inside.y})`);
    assert.ok(A.standsClear(fight, foe(w, 2), inside));
    assert.ok(Math.max(Math.abs(inside.x - 11), Math.abs(inside.y - 6)) <= 8, 'within the few cells round it that are looked at');
    const far = fight.character(foe(w, 3));
    assert.deepEqual([far.x, far.y], [16, 2], 'one that stood clear is where it was put');
    assert.deepEqual([w.$gamePlayer.x, w.$gamePlayer.y], [2, 2], 'the player is never moved');
});

test('a shot goes where the crosshair says: traced along the eye\'s own line, drawn from the muzzle', () => {
    // The raider stands at (9,2). A post stands right in front of the player's body (3,2) on the line from its
    // middle; the eye, a third of a tile to the side, has a clear line past the post.
    const w = world([shape('cylinder', 3, 2, 0, [0.3, 4, 0.3])], { events: [unit(1, 9, 2, 'enemy 1', facing(4))] });
    solo(w);
    equip(w, 2);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const raider = fight.character(foe(w, 1));
    for (const c of [raider, w.$gamePlayer]) dress(w, c, figure());
    w.run(1);
    eye(w, [2.5, 2.7, 2.9], [7, -0.9, -0.4]);
    w.run(2);
    const aim = A.aimNow;
    assert.equal(aim.eye, true);
    assert.equal(aim.under, foe(w, 1).id, 'the eye\'s line reaches the raider');
    // From the body's middle (where the muzzle is with nothing held) the line would stop at the post.
    const m = A.muzzle(w.$gamePlayer, {});
    const d = [9.5 - m.ox, 1.8 - m.oy, 2.5 - m.oz], far = Math.hypot(...d);
    assert.ok(A.rayWorld(m.ox, m.oy, m.oz, d[0] / far, d[1] / far, d[2] / far, far, false) < 1, 'the muzzle\'s own line meets the post');
    const shots = [];
    w.ReactorEvents.on('fightShot', payload => shots.push(payload));
    assert.equal(fight.actionAttack(), true);
    assert.ok(hp(w, 1) < 5000, 'the shot lands where the crosshair is');
    assert.equal(shots[0].targetId, foe(w, 1).id);
    assert.ok(Math.abs(shots[0].from.x - m.ox) < 1e-9 && Math.abs(shots[0].from.z - m.oz) < 1e-9, 'and its streak leaves the muzzle');
    assert.equal(fight.actionHud().crosshair.onTarget, true);
    // The eye turned to look at the post: the crosshair is on nothing, and the shot stops there.
    eye(w, [2.5, 2.7, 2.9], [1, -0.5, -0.4]);
    w.run(30);
    const before = hp(w, 1);
    assert.equal(fight.actionAttack(), true);
    assert.equal(hp(w, 1), before);
    assert.equal(fight.actionHud().crosshair.onTarget, false);
});

test('pressed against a wall, the weapon\'s tip may poke through it: the shot is still the eye\'s, and stops at the wall', () => {
    // The eye stands a fifth of a tile from a wall on (3,2); the weapon in view ends beyond the wall's near face.
    const w = world([piece('wall', 3, 2, 0)], { events: [unit(1, 6, 2, 'enemy 1', facing(4))] });
    solo(w);
    equip(w, 2);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    for (const c of [fight.character(foe(w, 1)), w.$gamePlayer]) dress(w, c, figure());
    eye(w, [2.8, 2.7, 2.5], [1, -0.2, 0]);
    A.View.muzzle = out => { out.ox = 3.3; out.oy = 2.4; out.oz = 2.6; return true; };
    w.run(2);
    assert.equal(A.aimNow.eye, true);
    assert.ok(Math.abs(A.aimNow.ex - 2.8) < 1e-9, 'the line starts at the eye, not abreast of the tip');
    assert.ok(A.aimNow.reach < 0.25, 'and meets the wall at once: ' + A.aimNow.reach);
    assert.equal(fight.actionAttack(), true);
    assert.equal(hp(w, 1), 5000, 'nothing behind the wall is hit');
    assert.equal(fight.actionHud().crosshair.onTarget, false);
    // Over the shoulder the camera stands behind the player: what is between it and the player's own body does not stop the shot.
    w.Reactor3D.cameraMode = 'thirdPerson';
    w.$dataMap.reactor3d.pieces = [piece('wall', 0, 2, 0)];
    w.Reactor3D.camera.position = { x: -1.5, y: 2.7, z: 2.5 };
    A.View.muzzle = () => false;
    w.run(14);
    assert.ok(A.aimNow.ex > 2.3 && A.aimNow.ex < 2.7, 'the line starts where it passes the player, beyond the wall behind: ' + A.aimNow.ex);
    assert.equal(fight.actionAttack(), true);
    assert.ok(hp(w, 1) < 5000);
});

test('a shot that meets the world leaves a spark and a mark there, from a fixed few made once', () => {
    const w = world([piece('wall', 6, 2, 0)], { events: [unit(1, 9, 2, 'enemy 1', facing(4))] });
    solo(w);
    equip(w, 2);
    // A scene to hang them in, and just enough of three for the bodies.
    const added = [];
    const scene = { modelsGroup: () => ({ add: (...objects) => added.push(...objects) }) };
    const vector = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, setScalar(s) { this.x = this.y = this.z = s; } });
    w.THREE = { IcosahedronGeometry: function() {}, MeshBasicMaterial: function(options) { Object.assign(this, options); }, AdditiveBlending: 2,
        Mesh: function(geometry, material) { this.geometry = geometry; this.material = material; this.position = vector(); this.scale = vector(); this.rotation = vector(); this.visible = true; } };
    w.ReactorFight.Stage = { mapScene: () => scene };
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    w.$gamePlayer.setDirection(6);
    w.run(2);
    assert.equal(fight.actionAttack(), true);
    assert.equal(hp(w, 1), 5000);
    assert.equal(added.length, A.MARKS * 2, 'a spark and a mark for each of the few');
    const marks = A.marks.list, first = marks[0];
    assert.equal(A.marks.live, 1);
    assert.deepEqual([first.spark.visible, first.dot.visible], [true, true]);
    assert.ok(Math.abs(first.dot.position.x - 6) < 0.06 && Math.abs(first.dot.position.z - 2.5) < 0.01, 'on the wall\'s face: ' + first.dot.position.x);
    // Held fire: more shots than there are marks makes no more bodies.
    for (let i = 0; i < A.MARKS + 6; i++) { w.run(13); fight.actionAttack(); A.updateMarks(); }
    assert.equal(added.length, A.MARKS * 2, 'none made after the first');
    assert.equal(marks.length, A.MARKS);
    assert.ok(A.marks.live <= A.MARKS);
    // The spark is gone in a few frames; the mark stays a while, then goes.
    A.impact(4, 1, 4);
    const last = marks[(A.marks.next + marks.length - 1) % marks.length];
    for (let i = 0; i < A.SPARK_FRAMES + 1; i++) A.updateMarks();
    assert.deepEqual([last.spark.visible, last.dot.visible], [false, true]);
    for (let i = 0; i < A.MARK_FRAMES; i++) A.updateMarks();
    assert.equal(last.dot.visible, false);
    assert.equal(A.marks.live, 0);
    // A shot into open air or into a body leaves none.
    w.$dataMap.reactor3d.pieces = [];
    w.run(13);
    assert.equal(fight.actionAttack(), true);
    assert.ok(hp(w, 1) < 5000);
    assert.equal(A.marks.live, 0);
});

test('the leader falls: the player takes over the next member where that member stands, the fallen stays where it fell, and a line says who leads', () => {
    const w = world([], { events: [unit(1, 15, 12, 'enemy 1', facing(4)), unit(2, 17, 12, 'enemy 1', facing(4))] });
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const ren = w.$gameActors.actor(1), mira = w.$gameActors.actor(2);
    const follower = w.$gamePlayer.followers().data().find(f => f.actor() === mira);
    follower.locate(9, 5);
    follower.setDirection(4);
    w.$gamePlayer.locate(4, 4);
    w.$gamePlayer.setDirection(6);
    w.run(2);
    // The leader is struck down.
    ren.setHp(0);
    fight.defeat(fight._units.find(u => u.actorId === 1));
    w.run(3);
    assert.equal(w.$gameParty.leader(), mira, 'the next member leads');
    assert.deepEqual([w.$gamePlayer.x, w.$gamePlayer.y, w.$gamePlayer.direction()], [9, 5, 4], 'and the player is that member, where it stood, as it faced');
    assert.equal(follower.actor(), ren, 'the follower shows the fallen leader');
    assert.deepEqual([follower.x, follower.y], [4, 4], 'where it fell');
    assert.ok(follower._reactorFall > 0 && follower._reactorPosePitch > 0, 'fallen, not upright');
    assert.ok(!(w.$gamePlayer._reactorFall > 0), 'the new leader stands');
    assert.equal(w.$gamePlayer.opacity(), 255);
    assert.equal(fight.character(fight._units.find(u => u.actorId === 1)), follower);
    assert.equal(fight.playerUnit().actorId, 2);
    // The player is told, in one line that stays a few seconds.
    assert.equal(A.noticeNow.text, 'Mira takes the lead');
    assert.ok(A.noticeNow.frames > 60);
    assert.equal(fight.actionHud().notice, 'Mira takes the lead', 'a HUD that writes its own lines reads it here');
    assert.ok(fight.act().player.safe > 30, 'and has a moment before anything can hurt it');
    // A project's own words.
    w.$dataSystem.reactorBattle = { terms: { lead: '%1 is in command' } };
    A.handOver(fight, fight.act(), 0);
    assert.equal(A.noticeNow.text, 'Mira is in command');
    // The last member falls while an enemy that fell a moment before still lies there (the ending waits for it):
    // the battle's own frame has stopped with the outcome, and the body goes down all the same.
    const enemy = foe(w, 1);
    fight.battler(enemy).setHp(0);
    fight.defeat(enemy);
    mira.setHp(0);
    fight.defeat(fight.playerUnit());
    fight.checkOutcome();
    assert.ok(fight._ending, 'the party is beaten');
    w.run(30);
    assert.equal(fight.isActive(), true, 'the ending is still waiting');
    assert.ok(w.$gamePlayer._reactorPosePitch > 0.9, 'the last to fall lies down too: ' + w.$gamePlayer._reactorPosePitch);
    assert.ok(follower._reactorPosePitch > 0.9);
});

test('each member\'s model stays with its body when the lead passes on: the scene is made to look again at whose model a character wears', () => {
    const w = world([], { events: [unit(1, 15, 12, 'enemy 1', facing(4))] });
    const actorOf = c => (c === w.$gamePlayer ? w.$gameParty.leader() : c.actor());
    // The party stands as models, one a member; the map's scene keeps one for the player and one for each follower.
    Object.assign(w.Reactor3D, {
        characterModelSpec: c => (c._body ? c._body : c === w.$gamePlayer || c._memberIndex ? { name: 'Actor' + actorOf(c).actorId(), tall: 3, halfX: 0.6, halfZ: 0.6 } : null),
        characterHeightTiles: () => 3,
        modelInstanceKey: c => (c === w.$gamePlayer ? 'p' : 'f' + c._memberIndex),
        modelCacheKey: name => name
    });
    const removed = [];
    const holder = (key, spec) => ({ key, spec, variant: '', object: { parent: { remove() { removed.push(key); } } } });
    const scene = { modelsGroup: () => ({ add() {} }), _modelInstances: new Map([['p', holder('p', 'Actor1')], ['f1', holder('f1', 'Actor2')]]) };
    w.ReactorFight.Stage = { mapScene: () => scene };
    const fight = begin(w);
    still(w);
    w.$gameActors.actor(1).setHp(0);
    fight.defeat(fight._units.find(u => u.actorId === 1));
    w.run(2);
    assert.equal(w.$gameParty.leader().actorId(), 2);
    assert.deepEqual(removed.sort(), ['f1', 'p'], 'both models were let go');
    assert.equal(scene._modelInstances.size, 0, 'so the scene makes each character the model of the member it shows now');
    // A character whose member did not change keeps its model.
    scene._modelInstances.set('p', holder('p', 'Actor2'));
    removed.length = 0;
    assert.equal(w.ReactorFight.Action.remodel(w.$gamePlayer), false);
    assert.equal(removed.length, 0);
});

test('when the battle ends the party\'s order comes back with every body where it is, and the result names who led the party in', () => {
    const w = world([], { events: [unit(1, 15, 12, 'enemy 1', facing(4))] });
    w.$dataSystem.terms.messages.partyName = "%1's Party";
    const fight = begin(w, { canLose: true });
    still(w);
    const ren = w.$gameActors.actor(1), mira = w.$gameActors.actor(2);
    const follower = w.$gamePlayer.followers().data().find(f => f.actor() === mira);
    follower.locate(9, 5);
    w.$gamePlayer.locate(4, 4);
    w.run(2);
    ren.setHp(0);
    fight.defeat(fight._units.find(u => u.actorId === 1));
    w.run(3);
    assert.deepEqual(Array.from(w.$gameParty._actors), [2, 1]);
    // The last enemy falls.
    const enemy = foe(w, 1);
    fight.battler(enemy).setHp(0);
    fight.defeat(enemy);
    fight.checkOutcome();
    w.run(400, () => !fight.isActive());
    assert.equal(fight.isActive(), false);
    assert.ok(w.messages.some(text => /Ren/.test(text) && /victorious/.test(text)), 'Ren\'s party won: ' + w.messages.join(' | '));
    assert.ok(!w.messages.some(text => /Mira.*victorious/.test(text)));
    assert.deepEqual(Array.from(w.$gameParty._actors), [1, 2], 'the party\'s own order');
    assert.equal(w.$gameParty.leader(), ren);
    assert.deepEqual([w.$gamePlayer._realX, w.$gamePlayer._realY], [4, 4], 'the leader is where the leader fell');
});

test('a Tactical battle\'s sight takes the same line: seen under an awning and past a post, hidden by a wall and a shut door', () => {
    const pieces = [shape('box', 8, 8, 3.2, [5, 0.2, 3]), shape('cylinder', 6, 8, 0, [0.24, 4, 0.24], { offset: [0, 0.33] })];
    for (let y = 0; y <= 4; y++) pieces.push(piece('wall', 6, y, 0));
    pieces.push(piece('doorway', 6, 12, 0), piece('wall', 6, 11, 0), piece('wall', 6, 13, 0), piece('door', 6, 12, 0, { id: 800, rot: 1, width: 1, material: 'Wood' }));
    const w = world(pieces, { tactical: true });
    const F = w.ReactorFight, G = F.Grid, A = F.Action;
    w.$gamePlayer._body = figure();
    assert.equal(G.is3D(), true);
    assert.equal(G.sightBody(), 3, 'the party stands three tiles tall');
    assert.equal(G.sight(2, 8, 0, 10, 8, 0), true, 'under the awning, past the post');
    assert.equal(G.sight(2, 2, 0, 10, 2, 0), false, 'the wall hides');
    assert.equal(G.sight(2, 12, 0, 10, 12, 0), true, 'through the doorway');
    try {
        R._doorStates = new Map([[800, { open: false, t: 0 }]]);
        assert.equal(G.sight(2, 12, 0, 10, 12, 0), false, 'not through its shut door');
    } finally { R._doorStates = null; }
    // The two modes agree, cell for cell, along a row that crosses all of it.
    w.$gameFight.start({ mode: 'action' });
    const fight = w.$gameFight;
    const dummy = (x, y) => ({ _realX: x, _realY: y, x, y, _body: figure(), direction: () => 2 });
    for (const [x, y] of [[10, 8], [10, 2], [10, 12], [14, 8], [3, 8], [10, 5]]) {
        const from = dummy(2, y), to = dummy(x, y);
        assert.equal(A.sees(fight, from, to), G.sight(2, y, 0, x, y, 0), `(${x},${y})`);
    }
});

test('an aim taken from above (no height of its own) is stopped by a wall and a model, not by a counter or a slope', () => {
    // Row 2: a waist-high counter, then a raider. Row 8: a wall, then a raider. Row 12: a crate of a prop, then a raider.
    const pieces = [shape('box', 5, 2, 0, [1, 1.3, 1]), piece('wall', 5, 8, 0)];
    const w = world(pieces, { events: [unit(1, 9, 2, 'enemy 1', facing(4)), unit(2, 9, 8, 'enemy 1', facing(4)), unit(3, 9, 12, 'enemy 1', facing(4)), event(4, 5, 12)] });
    solo(w);
    equip(w, 2);
    w.$gameMap.event(4)._body = { tall: 3, halfX: 0.5, halfZ: 0.5 };
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    for (const c of [w.$gamePlayer, fight.character(foe(w, 1)), fight.character(foe(w, 2)), fight.character(foe(w, 3))]) dress(w, c, figure());
    assert.equal(A.cameraMode(), 'isometric');
    const shoot = (y) => { w.$gamePlayer.locate(2, y); w.$gamePlayer.setDirection(6); w.run(14); assert.equal(fight.actionAttack(), true); };
    shoot(2);
    assert.equal(A.aimNow.flat, true);
    assert.ok(hp(w, 1) < 5000, 'over the counter');
    shoot(8);
    assert.equal(hp(w, 2), 5000, 'not through the wall');
    assert.equal(fight.actionHud().crosshair.onTarget, false);
    shoot(12);
    assert.equal(hp(w, 3), 5000, 'not through a model that stands in the way');
    assert.equal(A.rayMet, 'prop');
    assert.equal(A.props(fight).count, 1, 'the prop is one; units are bodies of the battle, not props');
    // Up a slope the same wall stops it: the line keeps its height over the ground it passes.
    const terrain = new Array(21 * 16).fill(0);
    for (let y = 0; y <= 15; y++) for (let x = 0; x <= 20; x++) terrain[y * 21 + x] = Math.max(0, x - 3) * 0.5;
    w.$dataMap.reactor3d = Object.assign({}, w.$dataMap.reactor3d, { terrain });
    shoot(2);
    const before = hp(w, 1);
    assert.ok(before < 5000);
    shoot(2);
    assert.ok(hp(w, 1) < before, 'up the slope, over the counter');
    shoot(8);
    assert.equal(hp(w, 2), 5000, 'and still not through the wall');
});

test('the battle gives the look back as it found it', () => {
    const w = world([], { events: [unit(1, 15, 12, 'enemy 1', facing(4))] });
    w.Reactor3D.cameraMode = 'thirdPerson';
    w.Reactor3D.Camera.look.pitch = 25;
    const fight = begin(w);
    assert.equal(w.Reactor3D.Camera.look.pitch, 8, 'levelled for the crosshair');
    w.Reactor3D.Camera.look.pitch = 2;
    fight.end(w.ReactorFight.ESCAPE, true);
    w.run(200, () => !fight.isActive());
    assert.equal(fight.isActive(), false);
    assert.equal(w.Reactor3D.Camera.look.pitch, 25, 'tipped back to where it was');
});

//-----------------------------------------------------------------------------
// Bodies as their meshes stand, shots that start on the body's side of a wall, what a shot leaves where it lands,
// and the ways units take round what is built.

/** A tank of three boxes, in tiles: a hull 8 long, 4 wide and 2 tall, a turret on its middle up to 3.5, a barrel at 2.6 to 2.9 that reaches 2 past the hull's west end. */
function tankTemplate() {
    const group = new THREE.Group();
    const box = (sx, sy, sz, x, y, z) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz)); mesh.position.set(x, y, z); group.add(mesh); };
    box(8, 2, 4, 0, 1, 0); box(2, 1.5, 2, 0, 2.75, 0); box(5, 0.3, 0.3, -3.5, 2.75, 0);
    group.userData.glbSize = { x: 10, y: 3.5, z: 4 };
    return group;
}
/** The tank as a body: its walking footprint is its hull's. */
const tankBody = (extra = {}) => Object.assign({ tall: 3.5, halfX: 4, halfZ: 2, model: 'tank', size: 10 }, extra);
/** The world with the real three and the tank's model loaded. */
function tankWorld(pieces, options) {
    const w = world(pieces, options);
    w.THREE = THREE;
    w.Reactor3D._glbCache.tank = { template: tankTemplate() };
    return w;
}
/** A scene for marks to hang in and just enough of three for them; `added` is every body made. */
function markScene(w) {
    const added = [];
    const scene = { modelsGroup: () => ({ add: (...objects) => added.push(...objects) }) };
    const vector = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, setScalar(s) { this.x = this.y = this.z = s; } });
    w.THREE = { Vector3: function() { this.x = 0; this.y = 0; this.z = 0; }, IcosahedronGeometry: function() {}, MeshBasicMaterial: function(options) { Object.assign(this, options); }, AdditiveBlending: 2,
        Mesh: function(geometry, material) { this.geometry = geometry; this.material = material; this.position = vector(); this.scale = vector(); this.rotation = vector(); this.visible = true; } };
    w.ReactorFight.Stage = Object.assign(w.ReactorFight.Stage || {}, { mapScene: () => scene });
    return added;
}
const body = (w, eventId) => w.ReactorFight.Action.bodies(w.$gameFight, 'enemy').list.find(b => b.unit === foe(w, eventId));
/** A unit let loose on the player (everyone else stays as `still` left them). */
function loose(w, eventId, extra = {}) {
    const fight = w.$gameFight, u = foe(w, eventId);
    return Object.assign(fight.act().ai[u.id], { state: 'chase', alert: true, timer: 0, cool: 0, lost: 0, targetId: fight.playerUnit().id }, extra);
}

test('a big unit is struck where its mesh is, at the heights it is: the air over its hull is open, and its barrel is part of it', () => {
    // The tank's middle is at (10.5, 7.5): hull x 6.5 to 14.5 and z 5.5 to 9.5, turret x 9.5 to 11.5, barrel west to x 4.5.
    const w = tankWorld([], { events: [unit(1, 10, 7, 'enemy 1', facing(4)), unit(2, 13, 11, 'enemy 2', facing(8))] });
    solo(w);
    equip(w, 2);
    w.$gamePlayer.locate(13, 2);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const tank = fight.character(foe(w, 1));
    dress(w, tank, tankBody()); dress(w, fight.character(foe(w, 2)), figure()); dress(w, w.$gamePlayer, figure());
    const hull = A.bodyOf(fight, tank).hull;
    assert.ok(hull, 'its mesh was read');
    const span = (x, z) => { const c = Math.floor(x * hull.sub) - hull.i0, r = Math.floor(z * hull.sub) - hull.j0, at = c * hull.rows + r; return c < 0 || r < 0 || c >= hull.cols || r >= hull.rows || hull.high[at] < hull.low[at] ? null : [hull.low[at], hull.high[at]].map(v => Math.round(v * 100) / 100); };
    assert.deepEqual(span(3.1, 1.1), [0, 2], 'the hull beside the turret stands to 2');
    assert.deepEqual(span(0.1, 0.1), [0, 3.5], 'under the turret, to its top');
    assert.deepEqual(span(-5.1, 0.05), [2.6, 2.9], 'the barrel past the hull\'s end: only the barrel');
    assert.equal(span(-5.1, 1.1), null, 'beside the barrel: nothing');
    assert.equal(span(4.1, 0.1), null, 'past the hull\'s other end: nothing (a face on a cell line marks its own side only)');
    assert.deepEqual([hull.bottom, Math.round(hull.top * 100) / 100, hull.minX, hull.maxX], [0, 3.5, -6, 4]);
    assert.equal(A.hullOf(w.Reactor3D, tank._body), hull, 'worked out once and kept');
    w.run(1);
    const at = body(w, 1);
    assert.equal(A.rayBody(at, 13.5, 2.6, 3, 0, 0, 1, 20, false), -1, 'a line over the hull, lower than the turret stands: open air');
    assert.ok(Math.abs(A.rayBody(at, 13.5, 1, 3, 0, 0, 1, 20, false) - 2.5) < 1e-6, 'into the hull\'s side');
    assert.ok(Math.abs(A.rayBody(at, 10.5, 3, 3, 0, 0, 1, 20, false) - 3.5) < 1e-6, 'over the hull into the turret');
    const barrel = A.rayBody(at, 5.5, 2.75, 3, 0, 0, 1, 20, false);
    assert.ok(barrel > 4.2 && barrel < 4.4, `the barrel, two tiles past the hull (${barrel})`);
    assert.equal(A.rayBody(at, 5.5, 1.5, 3, 0, 0, 1, 20, false), -1, 'under the barrel');
    // Down from above onto the hull beside the turret: it lands on the hull's top, not on a lid at the turret's height.
    const down = A.rayBody(at, 13.5, 6, 7.5, 0, -1, 0, 10, false);
    assert.ok(Math.abs(down - 3.9) < 1e-6, `on the deck (${down})`);
    // Through the eyes, over the hull at a raider standing beyond it: the raider is struck, the tank untouched.
    eye(w, [13.5, 2.6, 2.5], [0, 0, 1]);
    w.THREE = THREE;
    w.run(2);
    assert.equal(fight.actionAttack(), true);
    assert.ok(hp(w, 2) < 5000, 'the raider beyond the hull is struck');
    assert.equal(hp(w, 1), 5000, 'the tank soaks nothing');
    assert.equal(fight.actionHud().target.unitId, foe(w, 2).id);
    // At the barrel: the crosshair is on the tank and the shot lands.
    eye(w, [5.5, 2.75, 2.5], [0, 0, 1]);
    w.THREE = THREE;
    w.run(14);
    assert.equal(fight.actionHud().crosshair.onTarget, true, 'the barrel is the tank');
    assert.equal(fight.actionAttack(), true);
    assert.ok(hp(w, 1) < 5000);
    // Turned a quarter, its heights turn with it.
    dress(w, tank, tankBody({ yaw: Math.PI / 2 }));
    w.run(1);
    const turned = body(w, 1);
    assert.equal(A.rayBody(turned, 3, 2.6, 4.5, 1, 0, 0, 20, false), -1, 'over the hull, which now lies north to south');
    assert.ok(A.rayBody(turned, 3, 1, 4.5, 1, 0, 0, 20, false) > 0);
});

test('scenery in the way is what stands in a walker\'s way, as tall as it is there: nothing stops under what hangs overhead or over a low part', () => {
    const w = tankWorld([], { events: [unit(1, 18, 2, 'enemy 1', facing(4)), event(5, 8, 3), event(6, 8, 11)] });
    solo(w);
    equip(w, 2);
    // A lamp hung nine tiles up (a box of a body), and the tank parked as scenery with a mask over its hull.
    const lamp = w.$gameMap.event(5), parked = w.$gameMap.event(6);
    lamp._body = { tall: 2, halfX: 1.5, halfZ: 1.5 };
    lamp._reactorLift = 9;
    const has = (i, j) => i >= -16 && i < 16 && j >= -8 && j < 8;
    parked._body = tankBody({ halfX: 4.34, halfZ: 2.34, mask: { sub: 4, has, touches: (x, z) => has(Math.floor(x * 4), Math.floor(z * 4)), blocksTile: (x, z) => has(Math.floor(x * 4), Math.floor(z * 4)) } });
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const props = A.props(fight);
    assert.equal(props.count, 2);
    const hung = props.list.find(b => b.character === lamp), tank = props.list.find(b => b.character === parked);
    assert.deepEqual([hung.ground, hung.top, hung.hull], [9, 11, null]);
    assert.ok(tank.hull && tank.only, 'the parked tank is its hull\'s cells at the heights its mesh has there');
    // Under the lamp, along the floor: a line with its own height passes, and so does an aim with none.
    assert.equal(A.rayWorld(4.5, 2, 3.5, 1, 0, 0, 7, false), 7);
    assert.equal(A.rayWorld(4.5, 2, 3.5, 1, 0, 0, 7, true), 7, 'a flat aim is not stopped by what hangs nine tiles over the floor');
    assert.equal(A.rayMet, '');
    // The same lamp stood on the floor stops both.
    lamp._reactorLift = 0;
    A.props(fight).stamp = -1e9;
    assert.equal(A.rayWorld(4.5, 2, 3.5, 1, 0, 0, 7, false), 2.5);
    assert.equal(A.rayWorld(4.5, 2, 3.5, 1, 0, 0, 7, true), 2.5);
    assert.equal(A.rayMet, 'prop');
    // The parked tank (middle 8.5, 11.5): over its hull beside the turret, and through its barrel past the hull's
    // end, lines pass; into the hull they stop.
    assert.equal(A.rayProps(10.5, 2.6, 8, 0, 0, 1, 8, false), 8, 'over the hull');
    assert.equal(A.rayProps(3.5, 2.75, 8, 0, 0, 1, 8, false), 8, 'what overhangs is not in a walker\'s way');
    assert.ok(Math.abs(A.rayProps(10.5, 1, 8, 0, 0, 1, 8, false) - 1.5) < 1e-6, 'the hull stops it');
    assert.ok(Math.abs(A.rayProps(8.5, 3, 8, 0, 0, 1, 8, false) - 2.5) < 1e-6, 'and the turret over it');
});

test('a long weapon held against a wall ends beyond it: the shot starts on the body\'s side of the wall and stops there, from above and with what flies', () => {
    const wall = () => { const pieces = []; for (let y = 0; y < 15; y++) pieces.push(piece('wall', 3, y, 0)); return pieces; };
    const tipOf = (w, of, reach) => { w.Reactor3D.MapHeld = { tipPoint: c => (c === of ? { x: c._realX + 0.5 + reach, y: 1.8, z: c._realY + 0.5 } : null) }; };
    // Seen from above: the player (2,2) faces a wall on column 3 with a raider right behind it; the rifle's tip is past the wall.
    let w = world(wall(), { events: [unit(1, 4, 2, 'enemy 1', facing(4))] });
    solo(w);
    equip(w, 2);
    let fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    for (const c of [fight.character(foe(w, 1)), w.$gamePlayer]) dress(w, c, figure());
    tipOf(w, w.$gamePlayer, 1.6);
    w.$gamePlayer.setDirection(6);
    w.run(3);
    assert.equal(A.aimNow.flat, true);
    assert.equal(A.muzzle(w.$gamePlayer, {}).ox, 4.1, 'the tip itself is past the wall');
    assert.equal(A.aimNow.walled, true);
    assert.ok(A.aimNow.ox > 2.9 && A.aimNow.ox < 3, `the shot starts on this side of it (${A.aimNow.ox})`);
    let hud = fight.actionHud();
    assert.deepEqual([hud.crosshair.onTarget, hud.target], [false, null], 'no target through the wall');
    assert.equal(fight.actionAttack(), true);
    assert.equal(hp(w, 1), 5000, 'and no hit');
    // Nothing between: the shot leaves the tip.
    w.$dataMap.reactor3d.pieces = [];
    w.run(14);
    assert.equal(A.aimNow.walled, false);
    assert.equal(A.aimNow.ox, 4.1);
    assert.equal(fight.actionAttack(), true);
    assert.ok(hp(w, 1) < 5000);

    // Over the shoulder with a launcher: the rocket leaves the weapon, whose tip is past the wall.
    w = world(wall(), { events: [unit(1, 4, 2, 'enemy 1', facing(4))] });
    solo(w);
    equip(w, 3);
    fight = begin(w); A = w.ReactorFight.Action;
    still(w);
    for (const c of [fight.character(foe(w, 1)), w.$gamePlayer]) dress(w, c, figure());
    tipOf(w, w.$gamePlayer, 1.6);
    eye(w, [0.5, 2.6, 2.5], [1, -0.05, 0]);
    w.Reactor3D.cameraMode = 'thirdPerson';
    w.$gamePlayer.setDirection(6);
    w.run(3);
    assert.equal(A.aimNow.eye, true);
    assert.ok(A.aimNow.reach < 0.6, 'the eye\'s line meets the wall');
    assert.ok(A.aimNow.ox < 3 && A.aimNow.dx > 0.99, `the rocket starts on this side and flies as the eye looks (${A.aimNow.ox}, ${A.aimNow.dx})`);
    assert.equal(fight.actionHud().crosshair.onTarget, false);
    assert.equal(fight.actionAttack(), true);
    w.run(40);
    assert.equal(fight.act().shots.length, 0, 'it burst on the wall');
    assert.equal(hp(w, 1), 5000, 'and the raider behind the wall is untouched');

    // A raider's own bolt: its weapon's end is through the wall, on the player's side.
    w = world(wall(), { events: [unit(1, 4, 2, 'enemy 1', facing(4))] });
    solo(w);
    fight = begin(w); A = w.ReactorFight.Action;
    still(w);
    const raider = fight.character(foe(w, 1)), actor = w.$gameActors.actor(1);
    for (const c of [raider, w.$gamePlayer]) dress(w, c, figure());
    tipOf(w, raider, -1.6);
    const ai = fight.act().ai[foe(w, 1).id];
    A.strike(fight, fight.act(), foe(w, 1), raider, fight.battler(foe(w, 1)), Object.assign(ai, { kind: 'shot', reach: 6, skillId: 1, targetId: fight.playerUnit().id }));
    Object.assign(ai, { state: 'stagger', timer: 100000 });
    w.run(40);
    assert.equal(fight.act().shots.length, 0);
    assert.equal(actor.hp, actor.mhp, 'its bolt ends on its own side of the wall');
    w.$dataMap.reactor3d.pieces = [];
    A.strike(fight, fight.act(), foe(w, 1), raider, fight.battler(foe(w, 1)), Object.assign(ai, { kind: 'shot', reach: 6, skillId: 1, targetId: fight.playerUnit().id }));
    Object.assign(ai, { state: 'stagger', timer: 100000 });
    w.run(40);
    assert.ok(actor.hp < actor.mhp, 'with no wall it lands');
});

test('a rocket that meets a wall bursts in the open before it, at the height it flew, and leaves its mark on the wall', () => {
    const w = world([piece('wall', 6, 1, 0), piece('wall', 6, 2, 0), piece('wall', 6, 3, 0)], { events: [unit(1, 15, 12, 'enemy 1', facing(4))] });
    solo(w);
    equip(w, 3);
    w.$dataAnimations.push({ id: 1, name: 'Explosion' });
    const added = markScene(w), played = [];
    const Stage = w.ReactorFight.Stage;
    Stage.groundOf = c => w.Reactor3D.characterGround(w.$dataMap, c);
    Stage.animate = (spot, id, where, height) => { played.push({ id, where, cell: [spot._x, spot._y], x: spot._realX + 0.5, at: Stage.groundOf(spot) + height }); return {}; };
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    dress(w, w.$gamePlayer, figure());
    w.$gamePlayer.setDirection(6);
    w.run(2);
    assert.equal(fight.actionAttack(), true);
    w.run(40);
    assert.equal(fight.act().shots.length, 0);
    assert.equal(played.length, 1, 'the burst is played');
    assert.deepEqual([played[0].id, played[0].where], [1, 'body']);
    assert.deepEqual(played[0].cell, [5, 2], 'on the open cell before the wall, not on the wall\'s own');
    assert.ok(Math.abs(played[0].x - 5.75) < 0.01, 'a quarter tile back from where it struck');
    assert.ok(Math.abs(played[0].at - 2.1) < 0.01, `at the height the rocket flew, not on the wall's top (${played[0].at})`);
    assert.equal(A.marks.live, 1, 'and what it struck keeps a mark');
    assert.ok(Math.abs(A.marks.list[0].dot.position.x - 6) < 0.05);
    assert.equal(added.length, A.MARKS * 2);
    // Against a wall under an awning: the cell before the wall reads as the awning's top to a walker, and the burst
    // is still where the rocket flew, under it.
    w.$dataMap.reactor3d.pieces = [piece('wall', 6, 8, 0), shape('box', 5, 8, 3.2, [3, 0.2, 3])];
    w.$gamePlayer.locate(2, 8);
    w.$gamePlayer.setDirection(6);
    for (let i = 0; i < A.MARK_FRAMES + 1; i++) A.updateMarks();
    w.run(60);
    assert.equal(fight.actionAttack(), false, 'its one rocket is spent: it reloads');
    w.run(140);
    assert.equal(fight.actionAttack(), true);
    w.run(40);
    assert.equal(played.length, 2);
    assert.deepEqual(played[1].cell, [5, 8]);
    assert.ok(R.groundHeightAt(w.$dataMap, 5.75, 8.5, 2.1) > 3, 'the cell under the awning reads as the awning');
    assert.ok(Math.abs(played[1].at - 2.1) < 0.01, `under the awning, not on it (${played[1].at})`);
    // One that bursts in the open (its range run out) leaves no mark on anything.
    w.$dataMap.reactor3d.pieces = [];
    for (let i = 0; i < A.MARK_FRAMES + 1; i++) A.updateMarks();
    w.run(60);
    assert.equal(fight.actionAttack(), false);
    w.run(140);
    assert.equal(fight.actionAttack(), true);
    w.run(80);
    assert.equal(played.length, 3);
    assert.equal(A.marks.live, 0);
});

test('a spark and a mark are never larger in the picture than a spark and a bullet\'s mark: sized for the eye that sees them', () => {
    const w = world([], { events: [unit(1, 15, 12, 'enemy 1', facing(4))] });
    solo(w);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    // No eye of its own (the map seen from above, far off): their own sizes.
    markScene(w);
    A.impact(6, 2.7, 2.5, 1, 0, 0);
    let mark = A.marks.list[0];
    assert.deepEqual([mark.spark.scale.x, mark.dot.scale.x, mark.dot.visible], [A.SPARK_SIZE, A.MARK_SIZE, true]);
    // The eye three tiles off (a view 60 degrees tall): each no more than its share of the picture's height.
    eye(w, [3, 2.7, 2.5], [1, 0, 0]);
    markScene(w);
    A.impact(6, 2.7, 2.5, 1, 0, 0);
    mark = A.marks.list[0];
    const span = 3 * Math.tan(30 * Math.PI / 180);
    assert.ok(Math.abs(mark.spark.scale.x - span * A.SPARK_SHARE) < 1e-9 && mark.spark.scale.x < A.SPARK_SIZE, `the spark (${mark.spark.scale.x})`);
    assert.ok(Math.abs(mark.dot.scale.x - span * A.MARK_SHARE) < 1e-9 && mark.dot.scale.x < A.MARK_SIZE, `the mark (${mark.dot.scale.x})`);
    assert.equal(mark.dot.visible, true);
    // The eye against the wall: a small spark, and no mark at all.
    eye(w, [5.6, 2.7, 2.5], [1, 0, 0]);
    markScene(w);
    A.impact(6, 2.7, 2.5, 1, 0, 0);
    mark = A.marks.list[0];
    assert.ok(mark.spark.scale.x < 0.01, `a spark of a few pixels (${mark.spark.scale.x})`);
    assert.equal(mark.dot.visible, false, 'nothing is left on what the eye is right against');
    assert.ok(Math.abs(mark.spark.position.x - (6 - mark.spark.scale.x)) < 1e-9, 'the spark sits its own width off what was struck');
    // It shrinks from the size it was given.
    A.updateMarks();
    assert.ok(mark.spark.scale.x < 0.01);
    assert.equal(fight.isActive(), true);
});

test('a shooter that sees its target through glass does not fire at the glass: it walks for a line, as a blade walks round a wall', () => {
    // A wall down column 5 with a glazed window on row 2 and a gap on row 6. The shooter stands inside at (8,2),
    // the player outside at (2,2), in its sight through the glass.
    const pieces = [];
    for (let y = 0; y < 15; y++) if (y !== 6) pieces.push(piece(y === 2 ? 'window' : 'wall', 5, y, 0));
    pieces.push(piece('glass', 5, 2, 0, { rot: 1, material: 'Glass' }));
    const w = world(pieces, { tactical: true, events: [unit(1, 8, 2, 'enemy 1', facing(4))] });
    solo(w);
    w.$dataSkills[1].note = '<range: 2-6>';
    const fight = begin(w), A = w.ReactorFight.Action, actor = w.$gameActors.actor(1);
    still(w);
    const shooter = fight.character(foe(w, 1));
    for (const c of [shooter, w.$gamePlayer]) dress(w, c, figure());
    assert.equal(A.sees(fight, shooter, w.$gamePlayer), true, 'seen through the glass');
    assert.equal(A.lineOpen(fight, shooter, 0.7, w.$gamePlayer, 0.55, false), false, 'which a bolt does not pass');
    assert.equal(A.blowClear(fight, shooter, w.$gamePlayer), false);
    const ai = loose(w, 1);
    let woundAtGlass = false;
    const cells = new Set();
    w.run(900, () => {
        if (ai.state === 'windup' && !A.wayClear(fight, ai, shooter, w.$gamePlayer)) woundAtGlass = true;
        cells.add(shooter.x + ',' + shooter.y);
        return actor.hp < actor.mhp;
    });
    assert.equal(ai.kind, 'shot');
    assert.equal(woundAtGlass, false, 'it never winds up with the glass between');
    assert.ok(cells.size > 2, 'it walks: ' + Array.from(cells).join(' '));
    assert.ok(actor.hp < actor.mhp, 'and shoots when it has a line');
    assert.equal(A.marks.live, 0, 'no bolt was spent on the glass');
    // The gap shut: no way round. A few steps nearer the glass are no way to a line, so it stands where it is (it does
    // not pace up to the window and back), and still never fires at the glass.
    Object.assign(ai, { state: 'stagger', timer: 100000 });
    w.$dataMap.reactor3d.pieces = pieces.concat([piece('wall', 5, 6, 0)]);
    shooter.locate(8, 2);
    w.run(40);
    assert.equal(A.route(shooter, 2, 2), 2, 'two steps would bring it nearer');
    assert.equal(A.route(shooter, 2, 2, true), 0, 'but there is no way round');
    loose(w, 1, { route: null, routeAsk: 0 });
    const before = actor.hp, stood = new Set();
    let wound = false;
    w.run(400, () => { stood.add(shooter.x + ',' + shooter.y); wound = wound || ai.state === 'windup'; return false; });
    assert.deepEqual(Array.from(stood), ['8,2'], 'it stands');
    assert.equal(wound, false);
    assert.equal(actor.hp, before);
    assert.equal(A.marks.live, 0);
});

test('a Tactical attack that needs sight takes a shot\'s line: glass stops it as it stops the same shot in an Action battle; a look passes glass', () => {
    const pieces = [];
    for (let y = 0; y < 5; y++) pieces.push(piece(y === 2 ? 'window' : 'wall', 5, y, 0));
    pieces.push(piece('glass', 5, 2, 0, { rot: 1, material: 'Glass' }));
    // Row 8: a counter two tiles high. Row 12: a model in the way.
    pieces.push(shape('box', 5, 8, 0, [1, 2, 1]));
    const w = world(pieces, { tactical: true, events: [unit(1, 8, 2, 'enemy 1', facing(4)), event(4, 5, 12)] });
    solo(w);
    const F = w.ReactorFight, G = F.Grid, A = F.Action;
    w.$gamePlayer._body = figure();
    w.$gameMap.event(4)._body = { tall: 3, halfX: 0.5, halfZ: 0.5 };
    assert.equal(G.sight(2, 2, 0, 8, 2, 0), false, 'no shot through the glass');
    assert.equal(G.sight(2, 2, 0, 8, 2, 0, true), true, 'a look passes it');
    // Eyes at nine tenths of a three-tile body look over a counter two tiles high; a sprite's do not.
    assert.deepEqual([F.EYE_SHARE, F.CHEST_SHARE, F.EYE, F.CHEST], [0.9, 0.6, 1.3, 0.9]);
    assert.equal(G.sight(2, 8, 0, 8, 8, 0), true, 'over the counter: from 2.7 to 1.8');
    delete w.$gamePlayer._body;
    G._sightBody.at = -1e9;
    assert.equal(G.sight(2, 8, 0, 8, 8, 0), false, 'a sprite looks from 1.3 at 0.9, through it');
    w.$gamePlayer._body = figure();
    G._sightBody.at = -1e9;
    // A model that stands between hides, as it stops a shot.
    assert.equal(G.sight(2, 12, 0, 8, 12, 0), false, 'the model on (5,12) is in the way');
    assert.equal(G.sight(2, 13, 0, 8, 13, 0), true, 'the row beside it is open');
    // The same window in an Action battle.
    const fight = begin(w);
    still(w);
    const raider = fight.character(foe(w, 1));
    dress(w, raider, figure()); dress(w, w.$gamePlayer, figure());
    assert.equal(A.sees(fight, w.$gamePlayer, raider), true, 'seen');
    assert.equal(A.blowClear(fight, w.$gamePlayer, raider), false, 'not struck');
    assert.equal(A.lineOpen(fight, w.$gamePlayer, A.EYE, raider, A.CHEST, false), G.sight(2, 2, 0, 8, 2, 0), 'the two modes agree on the shot');
    // What the map says of a cell is asked again when the map has refreshed (a rule hung on a switch), and when its tiles change.
    let shut = false;
    const checkPassage = w.$gameMap.checkPassage;
    w.$gameMap.checkPassage = function(x, y, bit) { return !(shut && x === 12 && y === 10) && checkPassage.call(this, x, y, bit); };
    assert.equal(G.blocksSight(12, 10), false);
    shut = true;
    assert.equal(G.blocksSight(12, 10), false, 'kept until the map says something changed');
    w.$gameMap.refresh();
    assert.equal(G.blocksSight(12, 10), true, 'asked again after a refresh');
    shut = false;
    w.$gameMap.refresh();
    assert.equal(G.blocksSight(12, 10), false);
    w.$gameMap.checkPassage = checkPassage;
    // A tile nobody walks, sails or flies low over.
    const flags = w.$dataTilesets[1].flags;
    flags[1537] = 0x060f;
    w.$dataMap.data[10 * 20 + 13] = 1537;
    assert.equal(G.blocksSight(13, 10), true, 'a cell whose tile changed to one nobody walks on');
    w.$dataMap.data[10 * 20 + 13] = 1536;
    assert.equal(G.blocksSight(13, 10), false);
});

test('a hotbar skill lands on whoever of its targets it has a clear way to; one that needs no line is used over a wall', () => {
    const wall = () => { const pieces = []; for (let y = 0; y < 15; y++) pieces.push(piece('wall', 3, y, 0)); return pieces; };
    const learn = (w, id, extra) => { w.$dataSkills[id] = Object.assign({}, w.$dataSkills[1], { id, stypeId: 1, mpCost: 0 }, extra); w.$gameActors.actor(1).learnSkill(id); };
    // An all-enemies skill: the nearer enemy is behind the wall, another stands in the open, both within its reach.
    let w = world(wall(), { tactical: true, events: [unit(1, 4, 2, 'enemy 1', facing(4)), unit(2, 2, 5, 'enemy 1', facing(8))] });
    solo(w);
    equip(w, 1);
    learn(w, 3, { name: 'Sweep', scope: 2, note: '<range: 1-4>' });
    let fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    for (const c of [fight.character(foe(w, 1)), fight.character(foe(w, 2)), w.$gamePlayer]) dress(w, c, figure(4));
    w.$gamePlayer.setDirection(6);
    w.run(2);
    assert.equal(A.blowClear(fight, w.$gamePlayer, fight.character(foe(w, 1))), false);
    assert.equal(fight.actionUse(1), true, 'used: one of its targets is in the open');
    w.run(80);
    assert.ok(hp(w, 2) < 5000, 'the one in the open is struck');
    assert.equal(hp(w, 1), 5000, 'the one behind the wall is not');
    assert.equal(w.$gamePlayer.direction(), 2, 'and the player turned to the one it was used on');
    // The two side by side with the wall between them: the skill is aimed at (and played on) the one in the open alone.
    fight.character(foe(w, 2)).locate(2, 2);
    w.$gamePlayer.locate(2, 3);
    fight.act().player.hot = {};
    w.run(2);
    assert.equal(fight.distance(fight.character(foe(w, 1)), fight.character(foe(w, 2))), 2, 'near enough for one blow to take both');
    assert.equal(fight.actionUse(1), true);
    assert.deepEqual(Array.from(fight.act().runs[0].run.targetIds), [foe(w, 2).id], 'only the one it has a clear way to');
    w.run(80);

    // A skill tagged <los: no>, one target and all: over the wall at the only enemy, who is behind it.
    w = world(wall(), { tactical: true, events: [unit(1, 4, 2, 'enemy 1', facing(4))] });
    solo(w);
    equip(w, 1);
    learn(w, 3, { name: 'Lob', note: '<range: 1-4>\n<los: no>' });
    learn(w, 4, { name: 'Quake', scope: 2, note: '<range: 1-4>\n<los: no>' });
    learn(w, 5, { name: 'Strike', note: '<range: 1-4>' });
    fight = begin(w); A = w.ReactorFight.Action;
    still(w);
    for (const c of [fight.character(foe(w, 1)), w.$gamePlayer]) dress(w, c, figure(4));
    w.run(2);
    assert.deepEqual(Array.from(A.hotbarOf(w.$gameActors.actor(1)), s => s.name), ['Lob', 'Quake', 'Strike']);
    assert.equal(fight.actionUse(3), false, 'one that needs a line is not used on one behind a wall');
    assert.equal(fight.actionUse(1), true, 'one that needs none is');
    w.run(80);
    const after = hp(w, 1);
    assert.ok(after < 5000, 'and it lands');
    assert.equal(fight.actionUse(2), true);
    w.run(80);
    assert.ok(hp(w, 1) < after, 'on all of them as well');
    // An enemy's own skill of that kind: no bolt (which would end on the wall), thrown over it.
    w.$dataSkills[1].note = '<range: 1-4>\n<los: no>';
    const ai = loose(w, 1), actor = w.$gameActors.actor(1);
    w.run(300, () => actor.hp < actor.mhp);
    assert.deepEqual([ai.kind, ai.lobbed], ['skill', true]);
    assert.ok(actor.hp < actor.mhp, 'it lands over the wall');
});

test('the hotbar\'s number keys use their slot by going down, though Input calls another name of the key triggered', () => {
    const w = world([], { events: [unit(1, 3, 2, 'enemy 1', facing(4))] });
    solo(w);
    equip(w, 1);
    w.$dataSkills[3] = Object.assign({}, w.$dataSkills[1], { id: 3, name: 'Strike', stypeId: 1, mpCost: 0 });
    w.$gameActors.actor(1).learnSkill(3);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    // Input holds the key down under its battle name and never says it was triggered (a number key carries a second
    // name for the old engines' key commands, and only the later name of a key counts as triggered).
    let down = '';
    w.Input.isPressed = name => name === down;
    w.Input.isTriggered = () => false;
    let used = 0;
    const actionUse = fight.actionUse;
    fight.actionUse = function(slot) { used += slot === 1 ? 1 : 100; return actionUse.call(this, slot); };
    w.run(3);
    assert.equal(used, 0);
    down = 'hotbar1';
    w.run(1);
    assert.equal(used, 1, 'the key went down: the slot is used');
    assert.ok(fight.act().player.hot.s3 > 0, 'and its skill is on cooldown');
    w.run(60);
    assert.equal(used, 1, 'held down, it is not used again');
    down = '';
    w.run(2);
    down = 'hotbar1';
    w.run(1);
    assert.equal(used, 2, 'pressed again, again');
    // A key already down as the battle takes the keys is not a press.
    down = 'hotbar1';
    A.Input.reset();
    w.run(5);
    assert.equal(used, 2);
});

test('a hand-to-hand unit behind a wall walks the way round and strikes; where there is no way it stands, and does not pace the wall', () => {
    // A wall down column 6 with one gap on row 6. The raider (7,2) and the player (5,2) stand either side of it, in reach of each other by distance.
    const pieces = [];
    for (let y = 0; y < 15; y++) if (y !== 6) pieces.push(piece('wall', 6, y, 0));
    const w = world(pieces, { events: [unit(1, 7, 2, 'enemy 1', facing(4))] });
    solo(w);
    w.$gamePlayer.locate(5, 2);
    const fight = begin(w), A = w.ReactorFight.Action, actor = w.$gameActors.actor(1);
    still(w);
    const raider = fight.character(foe(w, 1));
    for (const c of [raider, w.$gamePlayer]) dress(w, c, figure(4));
    assert.ok(A.gap(fight, raider, w.$gamePlayer) <= 1.5 && !A.blowClear(fight, raider, w.$gamePlayer), 'at arm\'s length, the wall between');
    // The way itself: down to the gap, through it and up the other side, to the cell beside the player.
    const count = A.route(raider, 5, 2);
    assert.deepEqual(Array.from(A.routes.steps.slice(0, count)), [2, 2, 2, 2, 4, 4, 8, 8, 8]);
    assert.ok(A.routes.cells <= A.ROUTE_CELLS, `found within its budget of cells (${A.routes.cells})`);
    const ai = loose(w, 1);
    let woundAtWall = false;
    const trail = [];
    const frames = w.run(700, () => {
        if (ai.state === 'windup' && !A.blowClear(fight, raider, w.$gamePlayer)) woundAtWall = true;
        const cell = raider.x + ',' + raider.y;
        if (trail[trail.length - 1] !== cell) trail.push(cell);
        return actor.hp < actor.mhp;
    });
    assert.equal(woundAtWall, false, 'it never winds up at the wall');
    assert.ok(actor.hp < actor.mhp, 'it came round and struck: ' + trail.join(' '));
    assert.deepEqual(trail, ['7,2', '7,3', '7,4', '7,5', '7,6', '6,6', '5,6', '5,5', '5,4', '5,3'], 'straight along the way, no pacing');
    assert.ok(frames < 320, `at a walk, not a step each thought (${frames} frames)`);
    assert.ok(A.routes.searches <= 3, `and the way was searched for once or twice, not at every step (${A.routes.searches})`);
    // Shut the gap: no way round. It does not wind up, and it stays on its cell rather than pacing.
    Object.assign(ai, { state: 'stagger', timer: 100000 });
    w.$dataMap.reactor3d.pieces = pieces.concat([piece('wall', 6, 6, 0)]);
    raider.locate(7, 2);
    w.run(2);
    assert.equal(A.route(raider, 5, 2), 0, 'no way');
    loose(w, 1, { route: null, routeAsk: 0 });
    const hpBefore = actor.hp, seen = new Set();
    w.run(250, () => { seen.add(raider.x + ',' + raider.y); return false; });
    assert.equal(actor.hp, hpBefore);
    assert.deepEqual(Array.from(seen), ['7,2'], 'it stands where it is');
    // A wider target, nearer by its outline: the wall is known between decisions too (it walks at once, with its blow not yet ready).
    w.$dataMap.reactor3d.pieces = pieces;
    dress(w, w.$gamePlayer, figure(5.8));
    w.run(2);
    assert.ok(A.gap(fight, raider, w.$gamePlayer) <= 1.5 * 0.85);
    loose(w, 1, { cool: 5000, route: null, routeAsk: 0, skillId: 1, kind: 'melee', reach: 1.5 });
    w.run(60);
    assert.notDeepEqual([raider.x, raider.y], [7, 2], 'on its way round before its blow is ready');
    // From a cell a row down (the player north-west of it, the wall between): the open step north is no way to the
    // player, and it is not taken; the way round is, at once.
    Object.assign(ai, { state: 'stagger', timer: 100000 });
    raider.locate(7, 3);
    w.run(20);
    assert.ok(A.gap(fight, raider, w.$gamePlayer) <= 1.5 && !A.blowClear(fight, raider, w.$gamePlayer));
    loose(w, 1, { cool: 0, route: null, routeAsk: 0 });
    const walked = [];
    w.run(60, () => { walked.push(raider.x + ',' + raider.y); return false; });
    assert.equal(walked.includes('7,2'), false, 'no step toward the wall first');
    assert.ok(raider.y > 3, 'it set off down the wall for the gap');
});

test('a unit\'s body has room where it steps: backing off, and on the way it was going between thoughts', () => {
    // A pillar a tile and a half across on (6,6) reaches into (7,6), which the walking rule leaves open.
    const w = world([shape('cylinder', 6, 6, 0, [1.5, 3, 1.5])], { events: [unit(1, 8, 6, 'enemy 1', facing(4))] });
    solo(w);
    w.$gamePlayer.locate(15, 12);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const enemy = foe(w, 1), raider = fight.character(enemy);
    dress(w, raider, figure());
    assert.equal(raider.canPass(8, 6, 4), true, 'the walking rule allows the step');
    assert.equal(A.roomAt(fight, enemy, raider, 7, 6), false, 'the body has no room there');
    // Backing off from a spot east of it: west is furthest, and is the pillar's.
    assert.equal(A.step(fight, enemy, raider, 10, 6, true), true);
    w.run(20);
    assert.notDeepEqual([raider.x, raider.y], [7, 6]);
    assert.ok(raider.y !== 6 && raider.x === 8, `it backed off another way (${raider.x},${raider.y})`);
    // Between thoughts it keeps on the way it was going, but not into the pillar.
    raider.locate(8, 6);
    w.run(1);
    const st = fight.act(), ai = st.ai[enemy.id], battler = fight.battler(enemy);
    Object.assign(ai, { state: 'chase', alert: true, timer: 0, cool: 100, walk: true, walkAway: false, heading: 4, late: false, route: null, targetId: fight.playerUnit().id });
    while ((st.clock + enemy.id * 3) % A.THINK === 0) st.clock++;
    A.updateUnit(fight, st, enemy, raider, battler, ai, w.$gamePlayer);
    assert.equal(raider.isMoving(), false, 'no step into the pillar');
    raider.locate(8, 10);
    A.updateUnit(fight, st, enemy, raider, battler, ai, w.$gamePlayer);
    assert.equal(raider.isMoving(), true, 'in the open it walks on');
    assert.equal(raider.x, 7);
});

test('a rocket\'s blast reaches up and down no further than it reaches across', () => {
    // The rocket lands on the ground at (9, 8.5). One raider hangs six tiles over that spot, one stands a tile off it.
    const w = world([], { events: [unit(1, 9, 8, 'enemy 1', facing(4)), unit(2, 10, 8, 'enemy 1', facing(4))] });
    solo(w);
    equip(w, 3);
    w.$gamePlayer.locate(2, 8);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const high = fight.character(foe(w, 1));
    for (const c of [high, fight.character(foe(w, 2)), w.$gamePlayer]) dress(w, c, figure());
    high._reactorLift = 6;
    eye(w, [2.5, 2.1, 8.5], [6.5, -2.1, 0]);
    w.run(2);
    assert.equal(A.groundOf(high), 6);
    assert.equal(fight.actionAttack(), true);
    w.run(60);
    assert.equal(fight.act().shots.length, 0, 'it burst');
    assert.ok(hp(w, 2) < 5000, 'the one beside the burst is caught');
    assert.equal(hp(w, 1), 5000, 'the one six tiles over it is not');
});

test('what flies keeps its height over the ground it passes, leaves a mark where the world stops it, and none at the map\'s edge', () => {
    // Up a slope, a counter 1.6 tall on (6,2), a raider beyond it.
    const w = world([shape('box', 6, 2, 0, [1, 1.6, 1]), piece('wall', 6, 8, 0)], { events: [unit(1, 9, 2, 'enemy 1', facing(4))] });
    solo(w);
    w.$dataWeapons.push({ id: 4, name: 'Bow', wtypeId: 5, etypeId: 1, params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], note: '<range: 3-9>\n<spread: 0>', iconIndex: 100, animationId: 0, price: 0, description: '' });
    equip(w, 4);
    const terrain = new Array(21 * 16).fill(0);
    for (let y = 0; y <= 15; y++) for (let x = 0; x <= 20; x++) terrain[y * 21 + x] = Math.max(0, x - 3) * 0.5;
    w.$dataMap.reactor3d = Object.assign({}, w.$dataMap.reactor3d, { terrain });
    markScene(w);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    for (const c of [fight.character(foe(w, 1)), w.$gamePlayer]) dress(w, c, figure());
    w.$gamePlayer.setDirection(6);
    w.run(14);
    assert.equal(A.profile(w.$gameActors.actor(1)).projectile, 'arrow');
    assert.equal(fight.actionAttack(), true);
    const shot = fight.act().shots[0];
    assert.ok(Math.abs(shot.over - 2.1) < 1e-9, 'it left the bow 2.1 over the ground');
    w.run(4);
    const base = R.pieceBaseAt(w.$dataMap, Math.floor(shot.x), Math.floor(shot.z));
    assert.ok(base > 0.4 && Math.abs(shot.y - base - 2.1) < 0.3, `and flies that high over the slope (${shot.y} over ${base})`);
    w.run(40);
    assert.ok(hp(w, 1) < 5000, 'over the counter, up the slope, into the raider');
    assert.equal(A.marks.live, 0);
    // Into a wall: a mark where it stopped.
    w.$gamePlayer.locate(2, 8);
    w.$gamePlayer.setDirection(6);
    w.run(60);
    assert.equal(fight.actionAttack(), true);
    w.run(40);
    assert.equal(fight.act().shots.length, 0);
    assert.equal(A.marks.live, 1, 'the arrow marks the wall');
    assert.ok(Math.abs(A.marks.list[0].dot.position.x - 6) < 0.05);
    for (let i = 0; i < A.MARK_FRAMES + 1; i++) A.updateMarks();
    // Off the map's edge, a bullet and an arrow: nothing to mark.
    w.$gamePlayer.locate(17, 12);
    w.$gamePlayer.setDirection(6);
    w.run(60);
    assert.equal(fight.actionAttack(), true);
    w.run(40);
    equip(w, 2);
    w.run(30);
    assert.equal(fight.actionAttack(), true);
    assert.equal(A.rayMet, 'edge');
    assert.equal(A.marks.live, 0);
});

test('the marks age with the map\'s sprites, with no battle frame needed', () => {
    const w = world([], { spriteset: true, events: [unit(1, 15, 12, 'enemy 1', facing(4))] });
    solo(w);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    markScene(w);
    A.impact(6, 2, 2.5, 1, 0, 0);
    assert.equal(A.marks.live, 1);
    const sprites = new w.Spriteset_Map();
    for (let i = 0; i < A.SPARK_FRAMES + 1; i++) sprites.update();
    assert.equal(A.marks.list[0].spark.visible, false, 'the spark is gone');
    for (let i = 0; i < A.MARK_FRAMES; i++) sprites.update();
    assert.equal(A.marks.live, 0, 'and then the mark');
    assert.equal(fight.isActive(), true);
});

test('a blade\'s arc is to the nearest part of a big body, whose middle may be tiles off to the side', () => {
    // A long body lying east to west, its west end right in front of the player; its middle is four tiles east.
    const w = world([], { events: [unit(1, 14, 5, 'enemy 1', facing(4))] });
    solo(w);
    equip(w, 1);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const big = fight.character(foe(w, 1));
    dress(w, big, { tall: 2, halfX: 4.5, halfZ: 1 }); dress(w, w.$gamePlayer, figure());
    w.$gamePlayer.locate(10, 7);
    w.$gamePlayer.setDirection(8);
    w.run(2);
    assert.ok(Math.abs(A.gap(fight, w.$gamePlayer, big) - 1) < 1e-9, 'its flank is a tile off');
    const middle = [14.5 - 10.5, 5.5 - 7.5], off = -middle[1] / Math.hypot(...middle);
    assert.ok(off < Math.cos(60 * Math.PI / 180), 'its middle is outside the swing\'s arc');
    fight.actionAttack();
    w.run(30);
    assert.ok(hp(w, 1) < 5000, 'the swing lands on the part in front of the blade');
});

test('as a battle starts: two units on one cell part, a member moved off the leader\'s cell keeps the level it was found, and nothing measured before counts', () => {
    const w = world([], { events: [unit(1, 10, 7, 'enemy 1', facing(4)), unit(2, 10, 7, 'enemy 1', facing(4)), unit(3, 14, 3, 'enemy 1', facing(4))] });
    const A = w.ReactorFight.Action, fight = w.$gameFight;
    w.$gameMap.event(3)._body = { tall: 3, halfX: 1, halfZ: 1 };
    // Before the battle the model on (14,3) is scenery to a line.
    assert.equal(A.props(fight).count, 1);
    fight.freeSpotNear = () => ({ x: 3, y: 2, height: 4 });
    assert.ok(fight.start({ mode: 'action' }) > 0);
    const follower = w.$gamePlayer.followers().data()[0];
    assert.deepEqual([follower.x, follower.y, follower._reactorGround], [3, 2, 4], 'the member takes the spot, at the height it was found');
    assert.equal(A.props(fight).count, 0, 'in the battle it is a unit: measured again as the battle begins');
    const a = fight.character(foe(w, 1)), b = fight.character(foe(w, 2));
    assert.deepEqual([a.x, a.y], [10, 7], 'the first stays');
    assert.notDeepEqual([b.x, b.y], [10, 7], 'the later of two on one cell moves');
    assert.ok(Math.abs(b.x - 10) + Math.abs(b.y - 7) === 1, 'to the cell beside it');
});

test('a moving body\'s ground is the physics\' own; a unit whose step is refused for a moment tries the low ledge', () => {
    // The raider stands in a pit: a block a tile high on each side of it.
    const w = world([piece('block', 7, 6, 0), piece('block', 9, 6, 0), piece('block', 8, 5, 0), piece('block', 8, 7, 0)], { events: [unit(1, 8, 6, 'enemy 1', facing(4))] });
    solo(w);
    w.$gamePlayer.locate(3, 6);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const raider = fight.character(foe(w, 1));
    for (const c of [raider, w.$gamePlayer]) dress(w, c, figure());
    const asked = [];
    w.ReactorPhysics = { groundUnder: c => (c === raider ? 0.5 : 0), stepUp: (c, d) => { asked.push([fight.act().clock, d]); return false; }, tryMantle: () => false };
    raider._reactorLift = 0.25;
    assert.equal(A.groundOf(raider), 0.75, 'the ground under it as the physics reads it, and its lift');
    raider._reactorLift = 0;
    const started = fight.act().clock;
    loose(w, 1);
    w.run(80);
    assert.ok(asked.length > 0, 'the ledge is tried');
    assert.equal(asked[0][1], 4, 'toward where it is going');
    assert.ok(asked[0][0] - started >= A.THINK, `after the step was refused more than once (${asked[0][0] - started} frames)`);
    assert.ok(asked.length <= 8, 'once a thought, not every frame');
});

test('the lead passes on: what the fallen leader was doing ends, each holds its own, a flash and a sound mark it, and the line is drawn and then goes', () => {
    const w = world([], { spriteset: true, events: [unit(1, 15, 12, 'enemy 1', facing(4))] });
    const fight = begin(w), A = w.ReactorFight.Action, F = w.ReactorFight;
    // The driver's own small HUD is not what is looked at here.
    F.stockActionHud = false;
    still(w);
    const st = fight.act(), p = st.player;
    const held = [], flashes = [];
    const heldItem = F.heldItem;
    F.heldItem = function(character, op, options) { held.push([character === w.$gamePlayer ? 'player' : 'follower', op, options && options.battler ? options.battler.name() : null]); return heldItem.apply(this, arguments); };
    F.Stage = { flash: (character, color, frames) => flashes.push([character === w.$gamePlayer, frames]) };
    let sounded = 0;
    w.SoundManager.playActorCollapse = () => { sounded++; };
    Object.assign(p, { swing: { step: 2, frame: 3, hit: [] }, buffered: true, combo: 2, comboTimer: 9, aim: true, guard: true, reload: 30, dodge: 5, lock: foe(w, 1).id, cooldown: 0 });
    w.$gameActors.actor(1).setHp(0);
    A.handOver(fight, st, 1);
    assert.deepEqual([p.swing, p.buffered, p.combo, p.comboTimer, p.aim, p.guard, p.reload, p.dodge, p.lock], [null, false, 0, 0, false, false, 0, 0, 0], 'the swing, the aim, the guard, the reload and the lock were the fallen leader\'s');
    assert.ok(p.cooldown >= 20 && p.safe >= A.LEAD_SAFE);
    assert.deepEqual(held.filter(entry => entry[0] === 'player'), [['player', 'aim', null], ['player', 'drop', 'Ren'], ['player', 'carry', 'Mira']], 'the player now carries the new leader\'s own');
    assert.deepEqual(held.filter(entry => entry[0] === 'follower'), [['follower', 'aim', null], ['follower', 'drop', 'Mira'], ['follower', 'carry', 'Ren']]);
    assert.deepEqual(flashes, [[true, 20]], 'a flash on the new leader');
    assert.equal(sounded, 1, 'and the sound of one falling');
    // The line: drawn over the view for its frames, then freed.
    const drawn = [];
    w.Bitmap = function(width, height) { this.width = width; this.height = height; };
    Object.assign(w.Bitmap.prototype, { gradientFillRect() {}, drawText(text) { drawn.push(text); }, destroy() { this.destroyed = true; } });
    w.Sprite = function(bitmap) { this.bitmap = this._bitmap = bitmap; this.anchor = { set() {} }; this.children = []; this.parent = null; this.opacity = 255; };
    w.Sprite.prototype.destroy = function() { this.gone = true; };
    // The map's scene, frame by frame.
    const scene = new w.Scene_Map();
    scene.update();
    const sprite = A.Notice.sprite;
    assert.ok(sprite && sprite.parent === scene, 'the line is on the screen');
    assert.deepEqual(drawn, ['Mira takes the lead']);
    assert.ok(sprite.opacity > 0 && sprite.opacity < 255, 'coming in');
    for (let i = 0; i < 20; i++) scene.update();
    assert.equal(sprite.opacity, 255);
    assert.equal(drawn.length, 1, 'drawn once, not every frame');
    for (let i = 0; i < A.NOTICE_FRAMES; i++) scene.update();
    assert.equal(A.Notice.sprite, null, 'gone when its time is up');
    assert.deepEqual([sprite.gone, sprite.bitmap.destroyed, A.noticeNow, scene.children.length], [true, true, null, 0], 'and its picture freed');
    // A HUD that writes the line itself: nothing is drawn by the driver, and the line still runs out.
    A.notice('Again', 5);
    A.Notice.off = true;
    scene.update();
    assert.equal(A.Notice.sprite, null);
    assert.equal(fight.actionHud().notice, 'Again');
    for (let i = 0; i < 6; i++) scene.update();
    assert.equal(fight.actionHud().notice, '');
    A.Notice.off = false;
});

test('a body a sequence draws off its cell stands on its own cell\'s ground: a blow struck with a wall at the striker\'s back lands', () => {
    // A wall on (5,2) right behind the player (4,2); the enemy two cells in front (2,2). A sequence's wind-up draws the
    // striker half a tile back, so its body's middle is over the wall's cell, whose only surface is the wall's top.
    const w = world([piece('wall', 5, 2, 0)], { events: [unit(1, 2, 2, 'enemy 1', facing(6))] });
    solo(w);
    w.$gamePlayer.locate(4, 2);
    const fight = begin(w), A = w.ReactorFight.Action;
    still(w);
    const enemy = fight.character(foe(w, 1));
    for (const c of [enemy, w.$gamePlayer]) dress(w, c, figure());
    // The physics' own read: the ground at the body's middle, nearest the level it stands on.
    w.ReactorPhysics = { groundUnder: c => R.groundHeightAt(w.$dataMap, c._realX + 0.5, c._realY + 0.5, c._reactorGround) };
    w.$gamePlayer._reactorGround = 0;
    assert.equal(A.groundOf(w.$gamePlayer), 0);
    w.$gamePlayer._realX = 4.5;
    assert.equal(w.ReactorPhysics.groundUnder(w.$gamePlayer), R.PIECE_STOREY, 'the physics reads the wall\'s top there');
    assert.equal(A.groundOf(w.$gamePlayer), 0, 'the body is still on the floor of its own cell');
    assert.equal(A.blowClear(fight, w.$gamePlayer, enemy), true, 'and its blow starts from there, not from the roof');
    // A skill used from that cell lands though the striker is drawn back against the wall as it does.
    const action = new w.Game_Action(fight.battler(fight.playerUnit()));
    action.setAttack();
    A.startRun(fight, fight.playerUnit(), action, [foe(w, 1)], { aimed: true });
    w.run(40, () => { w.$gamePlayer._realX = 4.5; return false; });
    assert.ok(hp(w, 1) < 5000, 'the blow lands');
    // Lifted for real (a climb, a lift), the body's own height is believed.
    w.$gamePlayer._realX = 4;
    w.$gamePlayer._reactorLift = 2;
    assert.equal(A.groundOf(w.$gamePlayer), 2);
});
