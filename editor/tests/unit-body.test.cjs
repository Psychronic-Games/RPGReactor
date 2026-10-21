'use strict';
// A character's body: the tiles it covers (Reactor3D.eventBody) and what map
// collision makes of them, for the player, followers and events, in and out
// of a battle. The shipped objects, the 3D runtime and reactor_fight.js in one
// context; models are boxes of a known size, so every footprint is known.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');

// A hull 3 tiles wide and 5 long (facing down: x -1..1, y -2..2 round its own tile), and a person on one tile.
const MODELS = { Tank: { x: 3, y: 2, z: 5 }, Person: { x: 1, y: 3, z: 1 } };
const BINDINGS = { enemies: { 1: { name: 'Tank', size: 5 }, 2: { name: 'Person', size: 3 } }, actors: {} };
const unit = (id, x, y, enemyId = 1, overrides = {}) => event(id, x, y, Object.assign({ rrUnit: { team: 'enemy', record: 'enemy', id: enemyId } }, overrides));

/**
 * The world: the map's events, its sidecar (`null`: a 2D map with none), the
 * Database's model bindings, and each model's size. `tick()` is the next
 * frame; `at(id)` an event.
 */
function world({ events = [], sidecar = { version: 1 }, bindings = BINDINGS, models = MODELS, action = true, three = false } = {}) {
    const w = fightWorld({ events, action, mapSidecar: sidecar });
    // With `three`, a model is real meshes and its footprint is the engine's own mask: `w.mesh(name, parts)` builds
    // one of boxes (`size` and middle `at`, in tiles at the size it is bound with; `skinned` for a skinned mesh).
    if (three) {
        vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'libs', 'three.js'), 'utf8'), w, { filename: 'three.js' });
        w.mesh = (name, parts) => vm.runInContext(`(function(name, parts) {
            const template = new THREE.Group(), low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
            for (const part of parts) {
                const geometry = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
                const mesh = part.skinned ? new THREE.SkinnedMesh(geometry) : new THREE.Mesh(geometry);
                mesh.position.set(part.at[0], part.at[1], part.at[2]);
                template.add(mesh);
                for (let k = 0; k < 3; k++) { low[k] = Math.min(low[k], part.at[k] - part.size[k] / 2); high[k] = Math.max(high[k], part.at[k] + part.size[k] / 2); }
            }
            template.updateMatrixWorld(true);
            template.userData.glbSize = { x: high[0] - low[0], y: high[1] - low[1], z: high[2] - low[2] };
            const spec = Reactor3D.normalizeModelSpec({ name });
            Reactor3D._glbCache[Reactor3D.modelCacheKey(spec.name, spec.ext, spec.file)] = { template };
            return template;
        })`, w)(name, parts);
    }
    vm.runInContext(source3D(), w, { filename: 'reactor_3d.js' });
    vm.runInContext('Reactor3D.installPropHooks();', w);
    // The game loads the 3D runtime before reactor_fight.js, which then gives a unit its record's model: that block, as shipped.
    const fight = fs.readFileSync(path.join(runtimeRoot, 'reactor_fight.js'), 'utf8');
    const from = fight.indexOf('// A unit event with no model of its own wears');
    assert.ok(from > 0, 'reactor_fight.js gives a unit its record\'s model');
    vm.runInContext(`(function(F) {${fight.slice(from, fight.indexOf('//-----', from))}})(ReactorFight);`, w);
    // The stage that plays a battle's action sequences on the map.
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_fight_stage.js'), 'utf8'), w, { filename: 'reactor_fight_stage.js' });
    const R = w.Reactor3D;
    R._databaseSidecar = bindings;
    R._databaseSidecarState = 'done';
    for (const [name, size] of Object.entries(models)) {
        const spec = R.normalizeModelSpec({ name });
        R._glbCache[R.modelCacheKey(spec.name, spec.ext, spec.file)] = { template: { userData: { glbSize: size } } };
    }
    w.tick = () => { w.Graphics.frameCount++; };
    w.at = id => w.$gameMap.event(id);
    // The tiles round an event its body covers, as rows of '#' and '.', `reach` tiles each way.
    w.rows = (id, reach) => {
        const e = w.at(id), out = [];
        for (let y = e.y - reach; y <= e.y + reach; y++) {
            let row = '';
            for (let x = e.x - reach; x <= e.x + reach; x++) row += R.eventBodyCovers(e, x, y) ? '#' : '.';
            out.push(row);
        }
        return out;
    };
    return w;
}

test('a unit covers the tiles under the model its record wears, turned with its facing', () => {
    const w = world({ events: [unit(1, 10, 7), unit(2, 4, 12, 2), event(3, 16, 3)] });
    const R = w.Reactor3D;
    assert.deepEqual(w.rows(1, 3), ['.......', '..###..', '..###..', '..###..', '..###..', '..###..', '.......'], 'facing down: 3 wide, 5 long');
    const body = R.eventBody(w.at(1));
    assert.deepEqual([body.ox, body.oy, body.w, body.h, body.count, body.reach, body.model], [-1, -2, 3, 5, 15, 2, true]);
    assert.equal(w.at(1).pos(11, 9), true, 'the event is at every tile of it');
    assert.equal(w.$gameMap.eventsXy(9, 5).length, 1, 'and the map finds it there');
    w.at(1).setDirection(6);
    assert.deepEqual([...[R.eventBody(w.at(1))].map(b => [b.ox, b.oy, b.w, b.h])[0]], [-2, -1, 5, 3], 'facing right: 5 wide, 3 long, at once');
    assert.equal(R.bodyHas(R.eventBody(w.at(1)), 2, 1), true);
    assert.equal(R.bodyHas(R.eventBody(w.at(1)), 1, 2), false);
    // A person and a plain event stand on one tile.
    assert.deepEqual(w.rows(2, 1), ['...', '.#.', '...']);
    assert.equal(R.eventBody(w.at(3)), R.BODY_TILE);
    assert.equal(R.eventBody(w.$gamePlayer), R.BODY_TILE, 'the player is one tile');
    assert.equal(R.eventBody(w.$gamePlayer.followers().follower(0)), R.BODY_TILE, 'and so is a follower');
});

test('a typed size wins over the model; a through or below-characters event of any size blocks nothing', () => {
    const w = world({
        events: [unit(1, 10, 7), unit(2, 4, 4, 1, { pages: [page({ through: true })] }), unit(3, 15, 11, 1, { pages: [page({ priorityType: 0 })] })],
        sidecar: { version: 1, eventSize: { 1: [2, 2] }, eventSizeAnchor: 'center' }
    });
    const R = w.Reactor3D, player = w.$gamePlayer;
    assert.deepEqual(w.rows(1, 2), ['.....', '.....', '..##.', '..##.', '.....'], 'two by two, centred as the map says');
    assert.equal(R.eventBody(w.at(1)).model, false);
    // Counted right and down on a map that is not marked centred.
    delete w.$dataMap.reactor3d.eventSizeAnchor;
    w.tick();
    assert.deepEqual([R.eventBody(w.at(1)).ox, R.eventBody(w.at(1)).oy], [0, 0]);
    // The size taken away, the model is the body again.
    delete w.$dataMap.reactor3d.eventSize;
    w.tick();
    assert.equal(R.eventBody(w.at(1)).count, 15);
    // The through hull covers its tiles (a touch still finds it) and stops nobody; the one below characters likewise.
    assert.equal(w.at(2).pos(5, 6), true);
    assert.equal(player.isCollidedWithEvents(5, 6), false, 'through');
    assert.equal(player.isCollidedWithEvents(4, 4), false);
    assert.equal(player.isCollidedWithEvents(15, 12), false, 'below characters');
    assert.equal(player.isCollidedWithEvents(10, 9), true, 'the solid one does');
});

test('the player stops at the hull from every side, and a plain event walker with it', () => {
    const w = world({ events: [unit(1, 10, 7), event(2, 10, 12), event(3, 14, 7)] });
    const player = w.$gamePlayer;
    // Hull: x 9..11, y 5..9.
    for (const [x, y, d, why] of [[10, 3, 2, 'from the north'], [10, 11, 8, 'from the south'], [7, 7, 6, 'from the west'], [13, 7, 4, 'from the east'],
        [8, 5, 6, 'at its corner'], [12, 9, 4, 'at its far corner']]) {
        player.locate(x, y);
        const stepX = d === 6 ? 1 : d === 4 ? -1 : 0, stepY = d === 2 ? 1 : d === 8 ? -1 : 0;
        assert.equal(player.canPass(x, y, d), d === 2 || d === 8 ? y + stepY !== 5 && y + stepY !== 9 : x + stepX !== 9 && x + stepX !== 11, why + ': the first step');
        player.locate(x + (x + stepX === 9 || x + stepX === 11 ? 0 : stepX), y + (y + stepY === 5 || y + stepY === 9 ? 0 : stepY));
        assert.equal(player.canPass(player.x, player.y, d), false, why + ': stopped at the hull');
    }
    // Beside it, along it: free.
    player.locate(8, 6);
    assert.equal(player.canPass(8, 6, 2), true);
    // An event drawn from a sheet walks up to it and no further.
    assert.equal(w.at(2).canPass(10, 12, 8), true);
    w.at(2).locate(10, 10);
    assert.equal(w.at(2).canPass(10, 10, 8), false);
    assert.equal(w.at(3).canPass(14, 7, 4), true);
    w.at(3).locate(12, 7);
    assert.equal(w.at(3).canPass(12, 7, 4), false);
});

test('a walker that wears a model cannot enter a hull either', () => {
    // It used to ask only whether its own model would cover the tank's own tile, and walked through the rest of it.
    const w = world({ events: [unit(1, 10, 7), unit(2, 7, 8, 2), event(3, 13, 6)],
        sidecar: { version: 1, events: { 3: { 0: { name: 'Person', size: 3 } } } } });
    const raider = w.at(2), walker = w.at(3);
    assert.equal(raider.canPass(7, 8, 6), true, 'up to the hull');
    raider.locate(8, 8);
    assert.equal(raider.canPass(8, 8, 6), false, 'a unit wearing its record\'s model stops at the hull');
    assert.equal(walker.canPass(13, 6, 4), true);
    walker.locate(12, 6);
    assert.equal(walker.canPass(12, 6, 4), false, 'so does an event with a model of its own');
    // A route across it gets nowhere: twenty attempts at Move Right.
    raider.locate(6, 8);
    for (let i = 0; i < 20; i++) { raider.moveStraight(6); raider.setPosition(raider.x, raider.y); w.tick(); }
    assert.deepEqual([raider.x, raider.y], [8, 8]);
});

test('a hull cannot roll over a follower, a unit beside its own tile or another hull', () => {
    const w = world({ events: [unit(1, 10, 7), unit(2, 12, 11, 2), unit(3, 15, 6)] });
    const tank = w.at(1), player = w.$gamePlayer, follower = player.followers().follower(0);
    player.locate(2, 2);
    // A follower who is not walked through (a battle's, or a plugin's) under the tiles the step would take.
    w.$gamePlayer.followers().show();
    follower.locate(11, 10);
    assert.equal(tank.canPass(10, 7, 2), false, 'south: the follower is under its corner');
    follower.locate(2, 2);
    assert.equal(tank.canPass(10, 7, 2), true);
    // The player at its other corner.
    player.locate(9, 10);
    assert.equal(tank.canPass(10, 7, 2), false, 'the player under its corner');
    player.locate(2, 2);
    // A raider two tiles south-east of where the hull would stand after two steps: off its own tile, under its corner.
    tank.locate(11, 7);
    assert.equal(tank.canPass(11, 7, 2), true, 'one step: clear of the raider');
    tank.locate(11, 8);
    assert.equal(tank.canPass(11, 8, 2), false, 'the next would put its corner on the raider');
    // Another hull: x 14..16, y 4..8. This one, at 12,6, covers x 11..13.
    tank.locate(12, 6);
    assert.equal(tank.canPass(12, 6, 6), false, 'hull against hull, their own tiles three apart');
    assert.equal(w.Reactor3D.bodyFits(tank, 12, 6), true);
    assert.equal(w.Reactor3D.bodyFits(tank, 13, 6), false);
});

test('a step that turns a hull must clear what the turn sweeps; a turn in place likewise', () => {
    const w = world({ events: [unit(1, 10, 7), unit(2, 12, 8, 2)] });
    const tank = w.at(1), raider = w.at(2), R = w.Reactor3D;
    // Facing down it covers x 9..11; the raider at 12,8 is beside it. Facing right it would cover x 8..12, y 6..8.
    assert.equal(R.eventModelCanFace(tank, 6), false, 'the turn would swing onto the raider');
    assert.equal(tank.canPass(10, 7, 4), false, 'a step west turns it: the swing at the tile it leaves');
    raider.locate(13, 10);
    assert.equal(R.eventModelCanFace(tank, 6), true);
    tank.setDirection(6);
    assert.equal(tank.direction(), 6);
    // While the turn plays out the hull is on what it swings over, and only on that.
    assert.equal(tank.pos(11, 9), true, 'under the swinging corner');
    assert.equal(tank.pos(10, 11), false, 'four tiles south: no part of it passes there');
    for (let i = 0; i < R.MODEL_TURN_SWEEP_FRAMES; i++) w.tick();
    assert.equal(tank.pos(11, 9), false, 'the turn over, its new tiles alone');
    assert.deepEqual(w.rows(1, 3), ['.......', '.......', '.#####.', '.#####.', '.#####.', '.......', '.......']);
    // A person turns on the spot: the tiles beside one are free the moment it has turned.
    raider.setDirection(4);
    assert.equal(w.$gamePlayer.isCollidedWithEvents(13, 11), false, 'beside a person who has just turned');
    assert.equal(w.$gamePlayer.isCollidedWithEvents(13, 10), true);
});

test('a gliding hull is on the tiles it is going to and still on those it is leaving', () => {
    const w = world({ events: [unit(1, 10, 7)] });
    const tank = w.at(1), player = w.$gamePlayer;
    player.locate(2, 2);
    tank.moveStraight(2);
    assert.equal(tank.isMoving(), true);
    assert.equal(player.isCollidedWithEvents(10, 10), true, 'where it is going');
    assert.equal(player.isCollidedWithEvents(10, 5), true, 'where it still is');
    while (tank.isMoving()) { tank.update(); w.tick(); }
    assert.equal(player.isCollidedWithEvents(10, 5), false, 'arrived: the tiles behind are free');
    assert.equal(player.isCollidedWithEvents(10, 10), true);
});

test('a unit a battle sequence has taken is still on its cell', () => {
    // A sequence draws its unit elsewhere (a lunge, a leap) and puts it back; the unit never leaves its cell. Its
    // body used to follow the drawing, and whoever pushed at it walked in.
    const w = world({ events: [unit(1, 10, 7), unit(2, 4, 12, 2), unit(3, 17, 13, 2)] });
    const R = w.Reactor3D, Stage = w.ReactorFight.Stage, player = w.$gamePlayer, tank = w.at(1), raider = w.at(2);
    const still = ['.......', '..###..', '..###..', '..###..', '..###..', '..###..', '.......'];
    player.locate(2, 2);
    w.tick();
    assert.deepEqual(w.rows(1, 3), still);
    // Taken and drawn a third of a tile back, as a recoil draws it, then three tiles north.
    const claim = Stage.claim(tank);
    Stage.put(claim, 10, 6.68, 0, null);
    assert.equal(tank.isMoving(), false);
    w.tick();
    assert.deepEqual(w.rows(1, 3), still, 'the same tiles');
    Stage.put(claim, 10, 4, 0, null);
    w.tick();
    assert.deepEqual(w.rows(1, 3), still);
    assert.equal(player.isCollidedWithEvents(11, 9), true, 'its corner is still taken');
    assert.equal(player.isCollidedWithEvents(10, 3), false, 'where it is drawn is not');
    assert.equal(R.eventBodyGap(tank, 13.5, 7.5), 1.5, 'the gap is to its cell too');
    // A leap is drawn, not stood at (a 3D map lifts the character itself).
    tank._rrStage.world = true; tank._rrStage.z = 9; tank._reactorLift = 9;
    assert.equal(player.isCollidedWithEvents(10, 7), true);
    assert.equal(tank._reactorLift, 9, 'and asking leaves it as it was');
    tank._rrStage.world = false; tank._rrStage.z = 0; tank._reactorLift = 0;
    // A turn in a sequence is a turn like any other: refused onto a bystander, else the body turns on its cell.
    w.at(3).locate(12, 8);
    Stage.put(claim, 10, 4, 0, 90);
    assert.equal(tank.direction(), 2, 'not onto the raider beside it');
    w.at(3).locate(17, 13);
    w.tick();
    Stage.put(claim, 10, 4, 0, 89.9);
    assert.equal(tank.direction(), 6);
    for (let i = 0; i < R.MODEL_TURN_SWEEP_FRAMES; i++) w.tick();
    assert.deepEqual(w.rows(1, 3), ['.......', '.......', '.#####.', '.#####.', '.#####.', '.......', '.......'], 'turned, on its cell');
    // A unit on one tile, drawn half way to its target.
    const lunge = Stage.claim(raider);
    Stage.put(lunge, 6.5, 12, 0, null);
    w.tick();
    assert.equal(player.isCollidedWithEvents(4, 12), true);
    assert.equal(player.isCollidedWithEvents(6, 12), false);
    assert.equal(player.isCollidedWithEvents(7, 12), false);
    // Let go: back on its tile, turned back to how it stood.
    Stage.release(claim, true);
    assert.deepEqual([tank._realY, tank.direction(), !!tank._rrStage], [7, 2, false]);
    for (let i = 0; i < R.MODEL_TURN_SWEEP_FRAMES; i++) w.tick();
    assert.deepEqual(w.rows(1, 3), still);
    Stage.release(lunge, true);
});

test('a fallen unit and an erased one block nothing', () => {
    const w = world({ events: [unit(1, 10, 7), unit(2, 5, 12, 2)] });
    const player = w.$gamePlayer, fight = w.$gameFight;
    player.locate(2, 2);
    assert.ok(fight.start({ mode: 'action' }));
    assert.equal(player.isCollidedWithEvents(10, 9), true, 'standing: in the way');
    const tank = fight.unitOfEvent(1);
    fight.battler(tank)._hp = 0;
    fight.battler(tank).refresh();
    assert.equal(w.Reactor3D.eventIsFallen(w.at(1)), true);
    assert.equal(player.isCollidedWithEvents(10, 9), false, 'fallen: walked through while it fades');
    assert.equal(player.isCollidedWithEvents(10, 7), false);
    assert.equal(player.isCollidedWithEvents(5, 12), true, 'the one still standing is not');
    assert.equal(w.at(2).canPass(5, 12, 2), true);
    w.at(2).locate(10, 11);
    assert.equal(w.at(2).canPass(10, 11, 8), true, 'a unit walks over the fallen hull too');
    w.at(1).erase();
    assert.equal(player.isCollidedWithEvents(10, 9), false, 'erased');
    assert.equal(w.Reactor3D.eventBody(w.at(1)).count, 1, 'and its body is its tile again');
});

test('whoever stands inside a body may step toward its edge, never deeper in', () => {
    const w = world({ events: [unit(1, 10, 7)] });
    const player = w.$gamePlayer, R = w.Reactor3D;
    // The hull's middle column, x 10, is two tiles from its sides; (10, 5) is at its north end.
    player.locate(10, 6);
    assert.equal(R.bodyDepth(R.eventBody(w.at(1)), 0, -1), 2);
    assert.equal(player.canPass(10, 6, 8), true, 'north, to the end tile: nearer the edge');
    assert.equal(player.canPass(10, 6, 4), true, 'west, to a side tile');
    assert.equal(player.canPass(10, 6, 2), false, 'south, to the middle: no nearer');
    player.locate(9, 7);
    assert.equal(player.canPass(9, 7, 4), true, 'from a side tile out');
    assert.equal(player.canPass(9, 7, 6), false, 'not back in');
    assert.equal(player.canPass(9, 7, 2), false, 'nor along the side');
    player.locate(8, 7);
    assert.equal(player.canPass(8, 7, 6), false, 'and once out, the hull is solid');
});

test('a battle starts with the party clear of the units it is about to fight: the party steps aside, the unit stays', () => {
    // The player on the hull's own tile, a follower inside it; then the player on another of its tiles.
    for (const [px, py] of [[10, 7], [9, 6]]) {
        const w = world({ events: [unit(1, 10, 7), event(2, 8, 7)] });
        const player = w.$gamePlayer, follower = player.followers().follower(0), R = w.Reactor3D;
        player.locate(px, py);
        player.followers().show();
        follower.locate(10, 8);
        assert.ok(w.$gameFight.start({ mode: 'action' }));
        assert.deepEqual([w.at(1).x, w.at(1).y], [10, 7], 'the unit keeps the place the map gave it');
        for (const member of [player, follower]) {
            assert.equal(R.eventBodyCovers(w.at(1), member.x, member.y), false, 'moved out of the hull');
            assert.ok(Math.abs(member.x - 10) <= 2 && Math.abs(member.y - 7) <= 4, 'to a tile beside it');
            assert.notDeepEqual([member.x, member.y], [8, 7], 'not onto an event that is in the way');
        }
        assert.notDeepEqual([player.x, player.y], [follower.x, follower.y], 'each to a tile of its own');
        assert.equal(R.freePartyOfBodies(), 0, 'nobody is moved twice');
    }
    // Two members on one tile inside a hull take a tile each; nobody on the tile of a one-tile event is moved for it.
    const w = world({ events: [unit(1, 10, 7), event(2, 4, 12)] });
    const player = w.$gamePlayer, follower = player.followers().follower(0), R = w.Reactor3D;
    player.locate(10, 7);
    player.followers().show();
    follower.locate(10, 7);
    assert.equal(R.freePartyOfBodies(), 2);
    assert.notDeepEqual([player.x, player.y], [follower.x, follower.y]);
    player.locate(4, 12);
    player.followers().hide();
    assert.equal(R.freePartyOfBodies(), 0, 'a body of one tile is nobody\'s to be freed from');
    // A gliding hull is where it stands: nobody is moved for the row it is leaving.
    player.locate(2, 2);
    w.tick();
    w.at(1).moveStraight(2);
    assert.equal(w.at(1).isMoving(), true);
    assert.equal(R.eventBodyCovers(w.at(1), 10, 5), true, 'the row it is leaving is still in the way');
    player.locate(10, 5);
    assert.equal(R.freePartyOfBodies(), 0, 'and is not a place to be freed from');
});

test('a unit wearing a model on a 2D map has that body; an event drawn larger than a tile keeps one tile', () => {
    const w = world({ events: [unit(1, 10, 7), event(2, 4, 12, { pages: [page({ image: { tileId: 0, characterName: '$BigMonster', characterIndex: 0, direction: 2, pattern: 1 } })] })], sidecar: null });
    const player = w.$gamePlayer;
    assert.equal(w.$dataMap.reactor3d, undefined);
    assert.equal(player.isCollidedWithEvents(11, 9), true, 'the hull\'s corner');
    assert.equal(player.isCollidedWithEvents(12, 9), false);
    assert.equal(player.isCollidedWithEvents(4, 12), true, 'the big sprite: its own tile');
    assert.equal(player.isCollidedWithEvents(4, 11), false, 'and no other');
    assert.equal(player.isCollidedWithEvents(5, 12), false);
});

test('what the mesh leaves open stays open (an arch is walked under); a unit always holds its own tile', () => {
    // A mask that covers the two tiles either side of the model's own and leaves the middle free.
    const arch = { minX: -1.5, maxX: 1.5, minZ: -0.5, maxZ: 0.5, blocksTile: (x, z) => Math.abs(z) < 0.5 && Math.abs(Math.abs(x) - 1) < 0.5 };
    const w = world({ events: [event(1, 10, 7), unit(2, 10, 12, 3)], models: Object.assign({ Arch: { x: 3, y: 4, z: 1 } }, MODELS),
        bindings: { enemies: { 3: { name: 'Arch', size: 4 } }, actors: {} },
        sidecar: { version: 1, events: { 1: { 0: { name: 'Arch', size: 4 } } } } });
    const R = w.Reactor3D, player = w.$gamePlayer;
    w.THREE = {};
    R._collisionMasks = {};
    R._collisionMasks[R.collisionKeysFor(R.characterModelSpec(w.at(1))).pose] = arch;
    w.tick();
    assert.deepEqual(w.rows(1, 2), ['.....', '.....', '.#.#.', '.....', '.....'], 'the gateway: its posts');
    assert.equal(player.isCollidedWithEvents(10, 7), false, 'under the arch');
    assert.equal(player.isCollidedWithEvents(9, 7), true, 'its post');
    assert.deepEqual(w.rows(2, 2), ['.....', '.....', '.###.', '.....', '.....'], 'a unit of that shape stands on its own tile as well');
    // Raised above a walker's head, a body is in nobody's way.
    w.at(1)._reactorLift = 6;
    assert.equal(player.isCollidedWithEvents(9, 7), false, 'a model nine tiles up');
});

test('a collision test reads the body it kept: nothing is measured again until the model, facing or page changes', () => {
    const w = world({ events: [unit(1, 10, 7)].concat(Array.from({ length: 30 }, (_, i) => unit(10 + i, 2 + (i % 15), 13 + Math.floor(i / 15), 2))) });
    const R = w.Reactor3D, player = w.$gamePlayer;
    player.locate(2, 2);
    // Frames are counted from the game's first; before it nothing is taken on trust.
    w.tick();
    player.isCollidedWithEvents(3, 2);
    const counts = { spec: 0, foot: 0 };
    const spec = R.characterModelSpec, foot = R.eventModelFootprint;
    R.characterModelSpec = function() { counts.spec++; return spec.apply(this, arguments); };
    R.eventModelFootprint = function() { counts.foot++; return foot.apply(this, arguments); };
    for (let i = 0; i < 200; i++) { player.isCollidedWithEvents(3 + (i % 10), 2 + (i % 7)); w.at(10).canPass(2, 13, 8); }
    assert.deepEqual(counts, { spec: 0, foot: 0 }, '400 tests in a frame: no model looked up, no footprint measured');
    w.tick();
    player.isCollidedWithEvents(3, 2);
    assert.equal(counts.spec, 31, 'a new frame: each event\'s model is looked at once');
    assert.equal(counts.foot, 0, 'and none is measured: nothing changed');
    // A new facing is measured once, and so is each turn's swing; after that both are kept.
    w.at(1).setDirection(4);
    player.isCollidedWithEvents(3, 2);
    w.at(1).setDirection(2);
    player.isCollidedWithEvents(3, 2);
    assert.ok(counts.foot >= 2 && counts.foot <= 4, 'the facing and the two swings, once each: ' + counts.foot);
    const before = counts.foot;
    for (let i = 0; i < 6; i++) { w.at(1).setDirection(i % 2 ? 2 : 4); player.isCollidedWithEvents(3, 2); w.at(10).canPass(2, 13, 8); }
    assert.equal(counts.foot, before, 'facings and swings seen before are kept');
    // Thirty units of one model and facing share one shape.
    assert.equal(R.eventBody(w.at(10)), R.eventBody(w.at(39)));
    // What is kept beside an event never reaches a save.
    assert.ok(w.at(1)._reactorBody, 'kept on the event');
    assert.equal(Object.keys(w.at(1)).includes('_reactorBody'), false);
    assert.doesNotMatch(w.JsonEx.stringify(w.at(1)), /_reactorBody|cells|facedYaw/);
});

test('a unit that steps onto the map mid-frame, and a model that finishes loading, are seen at once and next frame', () => {
    // A unit whose page waits for a switch: off the map (and walked through) until it is on.
    const waiting = unit(1, 10, 7, 1, { pages: [page({ conditions: Object.assign({}, page().conditions, { switch1Valid: true, switch1Id: 4 }) })] });
    const w = world({ events: [waiting, unit(2, 4, 12)] });
    const R = w.Reactor3D, player = w.$gamePlayer;
    player.locate(2, 2);
    w.tick(); w.tick();
    assert.equal(player.isCollidedWithEvents(11, 9), false, 'no page met: nothing there');
    assert.equal(player.isCollidedWithEvents(15, 9), false);
    w.$gameSwitches.setValue(4, true);
    w.$gameMap.refresh();
    assert.equal(player.isCollidedWithEvents(11, 9), true, 'the same frame its page is met, its hull is in the way');
    assert.equal(player.isCollidedWithEvents(12, 9), false);
    // A model still loading stands as the square its size allows (5 by 5); loaded, as itself.
    const key = R.collisionKeysFor(R.characterModelSpec(w.at(2))).model, entry = R._glbCache[key];
    delete R._glbCache[key];
    w.tick();
    assert.equal(R.eventBody(w.at(2)).count, 25);
    R._glbCache[key] = entry;
    w.tick();
    assert.equal(R.eventBody(w.at(2)).count, 15, 'measured again once it is in');
});

test('an event with a typed size moves as all of it', () => {
    const w = world({ events: [event(1, 6, 6), event(2, 9, 7), event(3, 6, 10)], sidecar: { version: 1, eventSize: { 1: [3, 3] }, eventSizeAnchor: 'center' } });
    const block = w.at(1), player = w.$gamePlayer;
    player.locate(2, 2);
    // It covers x 5..7, y 5..7; event 2 stands at (9, 7), two tiles east of its corner.
    assert.equal(block.canPass(6, 6, 6), true, 'one step east: x 6..8');
    block.locate(7, 6);
    assert.equal(block.canPass(7, 6, 6), false, 'the next would put its corner on the event at (9, 7)');
    assert.equal(block.canPass(7, 6, 8), true, 'north is open');
    block.locate(6, 8);
    assert.equal(block.canPass(6, 8, 2), false, 'south: its lower edge would be on the event at (6, 10)');
    player.locate(4, 9);
    assert.equal(block.canPass(6, 8, 4), false, 'west: the player is under the corner it would take');
    assert.equal(w.at(2).canPass(9, 7, 4), true);
    w.at(2).locate(8, 8);
    assert.equal(w.at(2).canPass(8, 8, 4), false, 'and nobody walks into its side');
});

test('how far a point is from a body, for a blow or a shot that is aimed at it', () => {
    const w = world({ events: [unit(1, 10, 7)] });
    const R = w.Reactor3D, tank = w.at(1);
    assert.equal(R.eventBodyGap(tank, 10.5, 7.5), 0, 'its middle');
    assert.equal(R.eventBodyGap(tank, 11.9, 9.9), 0, 'its corner tile');
    assert.equal(Number(R.eventBodyGap(tank, 13.5, 7.5).toFixed(3)), 1.5, 'east of it: from its side, not its middle');
    assert.equal(Number(R.eventBodyGap(tank, 10.5, 12).toFixed(3)), 2, 'south of it');
    assert.equal(Number(R.eventBodyGap(w.$gamePlayer, w.$gamePlayer.x + 2.5, w.$gamePlayer.y + 0.5).toFixed(3)), 1.5, 'a character on one tile');
});

test('a unit is solid as high as a character stands: a gun at head height is part of its body', () => {
    // A hull three tiles wide and three long, a tile high, facing down from its own tile's row back; a barrel at head
    // height reaching three tiles out of its front; a wing over a character's head, wider than the hull.
    const gun = [{ size: [3, 1, 3], at: [0, 0.5, -1.5] }, { size: [0.6, 0.4, 3], at: [0, 2.4, 1.5] }, { size: [5, 0.4, 1], at: [0, 3.3, -1.5] }];
    // A figure of skinned meshes, its legs and its arms held out at head height as the file has them, with a rigid
    // pack at its feet; and one that is skinned all through.
    const figure = [{ size: [1, 6, 1], at: [0, 3, 0], skinned: true }, { size: [5, 0.4, 0.6], at: [0, 2.4, 0], skinned: true }];
    const w = world({ three: true, models: {}, events: [unit(1, 10, 6, 3), event(2, 4, 6), unit(3, 16, 6, 4), unit(5, 16, 12, 5)],
        bindings: { enemies: { 3: { name: 'Gun', size: 6 }, 4: { name: 'Giant', size: 6 }, 5: { name: 'Dancer', size: 6 } }, actors: {} },
        sidecar: { version: 1, events: { 2: { 0: { name: 'Gun', size: 6 } } } } });
    const R = w.Reactor3D, player = w.$gamePlayer;
    const template = w.mesh('Gun', gun);
    w.mesh('Giant', figure.concat([{ size: [1, 1, 1], at: [0, 0.5, 0] }]));
    w.mesh('Dancer', figure);
    player.locate(2, 2);
    w.tick();
    const hull = ['.........', '...###...', '...###...', '...###...', '...###...'];
    assert.deepEqual(w.rows(1, 4), hull.concat(['....#....', '....#....', '....#....', '.........']), 'worn by a unit: the hull and the tiles under its barrel');
    assert.deepEqual(w.rows(2, 4), hull.concat(['.........', '.........', '.........', '.........']), 'a prop of the same model: what is below walking height');
    assert.equal(player.isCollidedWithEvents(10, 8), true, 'nobody walks under the unit\'s gun');
    assert.equal(player.isCollidedWithEvents(10, 10), false, 'past its muzzle');
    assert.equal(player.isCollidedWithEvents(12, 4), false, 'under the wing over a character\'s head');
    assert.equal(player.isCollidedWithEvents(4, 8), false, 'the prop\'s is walked under, as every prop\'s overhang is');
    assert.equal(w.at(2).canPass(4, 6, 2), true, 'and the prop moves as what it blocks');
    // The barrel turns with the unit, and swings over nobody.
    player.locate(12, 8);
    assert.equal(R.eventModelCanFace(w.at(1), 6), false, 'the player in the arc its barrel would swing through');
    player.locate(2, 2);
    w.at(1).setDirection(6);
    for (let i = 0; i < R.MODEL_TURN_SWEEP_FRAMES; i++) w.tick();
    assert.equal(player.isCollidedWithEvents(13, 6), true, 'facing right, the barrel reaches right');
    assert.equal(player.isCollidedWithEvents(10, 8), false);
    // A skinned figure is drawn where its animation puts it: its stance is its body, not its arms as the file holds them.
    assert.deepEqual(w.rows(3, 2), ['.....', '.....', '..#..', '.....', '.....']);
    assert.deepEqual(w.rows(5, 2), ['.....', '.....', '..#..', '.....', '.....']);
    assert.notEqual(R.modelCollisionMask(R.characterModelSpec(w.at(3)), true), R.modelCollisionMask(R.characterModelSpec(w.at(3))));
    assert.equal(R.modelCollisionMask(R.characterModelSpec(w.at(5)), true), R.modelCollisionMask(R.characterModelSpec(w.at(5))), 'skinned all through: one footprint, measured once');
    // A model's footprint, as others measure it, is what stands in a walker's way; a unit's body is asked for by name.
    const gunSpec = R.characterModelSpec(w.at(1));
    assert.equal(R.eventModelFootprint(w.at(1), gunSpec, 0).mask.blocksTile(0, 2), false);
    assert.equal(R.eventModelFootprint(w.at(1), gunSpec, 0, true).mask.blocksTile(0, 2), true, 'under the barrel');
    // The editor's footprint of a unit's model, when it says the model is a unit's.
    const spec = R.normalizeModelSpec({ name: 'Gun', size: 6 });
    assert.equal(R.blockedTilesFor(template, null, spec, 2, 10, 6).length, 12);
    assert.equal(R.blockedTilesFor(template, null, spec, 2, 10, 6, true).length, 15);
    // A unit's footprint is taken with its model, under the loading fade.
    assert.match(source3D(), /A unit's collision footprint[^\n]*\n\s*if \(!held\) \{ try \{ this\.modelCollisionMask\(spec, true\); \}/);
});

test('an Event Touch event touches with its whole body', () => {
    const say = [{ code: 121, indent: 0, parameters: [9, 9, 0] }, { code: 0, indent: 0, parameters: [] }];
    // The event walks right until it is refused; a touch starts it.
    const walk = (w, id) => {
        const e = w.at(id);
        for (let i = 0; i < 12 && !e._starting; i++) {
            e.moveStraight(6);
            while (e.isMoving()) { e.update(); w.tick(); }
            w.tick();
        }
        return [e.x, !!e._starting];
    };
    // A typed size, three by three: it stops with its edge against the player and starts.
    let w = world({ events: [event(1, 6, 6, { pages: [page({ trigger: 2, list: say })] })], sidecar: { version: 1, eventSize: { 1: [3, 3] }, eventSizeAnchor: 'center' } });
    w.$gamePlayer.locate(12, 6);
    w.$gamePlayer.followers().hide();
    w.tick();
    assert.deepEqual(walk(w, 1), [10, true], 'its own tile two from the player, its body beside it');
    // A hull, five tiles long once it faces the way it goes.
    w = world({ events: [unit(1, 6, 6, 1, { pages: [page({ trigger: 2, list: say })] })] });
    w.$gamePlayer.locate(14, 6);
    w.$gamePlayer.followers().hide();
    w.tick();
    assert.deepEqual(walk(w, 1), [11, true], 'a model\'s body touches too');
    // One tile: as it always was.
    w = world({ events: [event(1, 6, 6, { pages: [page({ trigger: 2, list: say })] })] });
    w.$gamePlayer.locate(9, 6);
    w.$gamePlayer.followers().hide();
    w.tick();
    assert.deepEqual(walk(w, 1), [8, true]);
    // The player beside the way, not in it, is not touched.
    w = world({ events: [event(1, 6, 6, { pages: [page({ trigger: 2, list: say })] }), event(2, 9, 6)], sidecar: { version: 1, eventSize: { 1: [3, 3] }, eventSizeAnchor: 'center' } });
    w.$gamePlayer.locate(8, 9);
    w.$gamePlayer.followers().hide();
    w.tick();
    assert.deepEqual(walk(w, 1), [7, false], 'stopped by another event: no touch');
    // The player walking into any tile of a Player Touch body starts it.
    w = world({ events: [event(1, 6, 6, { pages: [page({ trigger: 1, list: say })] })], sidecar: { version: 1, eventSize: { 1: [3, 3] }, eventSizeAnchor: 'center' } });
    w.$gamePlayer.locate(8, 7);
    w.$gamePlayer.followers().hide();
    w.tick();
    w.$gamePlayer.moveStraight(4);
    assert.deepEqual([w.$gamePlayer.x, !!w.at(1)._starting], [8, true], 'its corner tile (7, 7)');
    assert.match(fs.readFileSync(path.join(runtimeRoot, 'reactor_objects_map.js'), 'utf8'),
        /Game_Event\.prototype\.checkEventTriggerTouch = function\(x, y\) \{[\s\S]{0,400}?Reactor3D\.bodyTouchesPlayer\(this, x, y\) : \$gamePlayer\.pos\(x, y\)/);
});

test('two bodies placed over each other can step apart, turning or not, and never deeper', () => {
    // Hull a covers x 9..11, y 5..9; hull b x 10..12, y 6..10: eight tiles shared.
    const w = world({ events: [unit(1, 10, 7), unit(2, 11, 8)] });
    const a = w.at(1), b = w.at(2), R = w.Reactor3D;
    w.$gamePlayer.locate(2, 2);
    w.tick();
    assert.equal(a.canPass(10, 7, 4), true, 'a west, a quarter turn: six shared after it');
    assert.equal(a.canPass(10, 7, 8), true, 'a north, a half turn: six');
    assert.equal(a.canPass(10, 7, 2), false, 'a south: ten');
    assert.equal(a.canPass(10, 7, 6), false, 'a east, across b: nine');
    assert.equal(b.canPass(11, 8, 2), true, 'b south: six');
    assert.equal(b.canPass(11, 8, 6), true, 'b east, a quarter turn: six');
    assert.equal(b.canPass(11, 8, 8), false, 'b north: ten');
    assert.equal(b.canPass(11, 8, 4), false, 'b west, across a: nine');
    // Where a body may be put down allows nothing for what it stands on now.
    assert.equal(R.bodyFits(a, 10, 6), false, 'fewer shared is not clear');
    assert.equal(R.bodyFits(a, 5, 7), true);
    // The step is taken as it was allowed: turned.
    a.moveStraight(4);
    assert.deepEqual([a.x, a.direction(), a.isMovementSucceeded()], [9, 4, true]);
    // Anyone else in the way of the turn still refuses it.
    const w2 = world({ events: [unit(1, 10, 7), unit(2, 11, 8), unit(3, 8, 8, 2)] });
    w2.$gamePlayer.locate(2, 2);
    w2.tick();
    assert.equal(w2.at(1).canPass(10, 7, 4), false, 'a raider where the turned hull would lie');
    assert.equal(w2.Reactor3D.eventModelCanFace(w2.at(1), 4), false);
    w2.at(3).locate(2, 12);
    assert.equal(w2.Reactor3D.eventModelCanFace(w2.at(1), 4), true, 'the hull it already lies on is not asked about a turn');
    // A raider inside a hull may walk to its edge; the edge is still no place to put a unit down.
    w2.at(2).locate(17, 3);
    w2.at(3).locate(10, 7);
    w2.tick();
    assert.equal(w2.at(3).canPass(10, 7, 4), true);
    assert.equal(w2.Reactor3D.bodyFits(w2.at(3), 9, 7), false);
    assert.equal(w2.Reactor3D.bodyFits(w2.at(3), 8, 7), true);
});

test('as the game counts frames: what is kept between tests is still right', () => {
    // Every test below asks once a frame first, as the game does many times: after that an event out of reach is
    // passed over on what was kept of it.
    const w = world({ events: [event(1, 15, 7), event(2, 18, 8), unit(3, 5, 5), event(4, 6, 9)], sidecar: { version: 1, eventSize: { 1: [3, 3] }, eventSizeAnchor: 'center' } });
    const R = w.Reactor3D, player = w.$gamePlayer, walker = w.at(2), tank = w.at(3);
    const frame = () => { w.tick(); player.isCollidedWithEvents(1, 1); };
    player.locate(2, 2);
    frame(); frame();
    // The block covers x 14..16, y 6..8, its own tile in the middle.
    assert.equal(walker.canPass(18, 8, 4), true);
    walker.locate(17, 8);
    frame();
    assert.equal(walker.canPass(17, 8, 4), false, 'a walker at the corner of a typed size');
    player.locate(17, 6);
    frame();
    assert.equal(player.canPass(17, 6, 4), false, 'and the player');
    assert.equal(player.canPass(17, 6, 8), true);
    // The hull covers x 4..6, y 3..7; an event stands at (6, 9), under the corner it would take two steps south.
    player.locate(2, 12);
    frame();
    assert.equal(tank.canPass(5, 5, 2), true);
    tank.locate(5, 6);
    frame();
    assert.equal(tank.canPass(5, 6, 2), false, 'a hull against an event beside its own column');
    // An event told to vanish without its page being looked at again (a plugin's way) is gone the same frame.
    assert.equal(player.isCollidedWithEvents(6, 8), true);
    tank._erased = true;
    assert.equal(player.isCollidedWithEvents(6, 8), false);
    assert.equal(R.eventBody(tank).count, 1);
});

test('the player alone stops a hull; a turn in place is refused onto the player and onto a follower', () => {
    const w = world({ events: [unit(1, 10, 7)] });
    const R = w.Reactor3D, player = w.$gamePlayer, tank = w.at(1), followers = player.followers();
    followers.hide();
    player.locate(9, 10);
    w.tick();
    assert.equal(tank.canPass(10, 7, 2), false, 'the player under the corner it would take, nobody following');
    player.locate(12, 8);
    w.tick();
    assert.equal(R.eventModelCanFace(tank, 6), false, 'the turn would swing onto the player');
    tank.setDirection(6);
    assert.equal(tank.direction(), 2, 'so it does not turn');
    assert.equal(tank.canPass(10, 7, 2), true, 'and may still go where the player is not');
    player.locate(2, 2);
    followers.show();
    followers.follower(0).locate(12, 8);
    w.tick();
    assert.equal(R.eventModelCanFace(tank, 6), false, 'nor onto a follower');
    followers.follower(0).locate(2, 2);
    assert.equal(R.eventModelCanFace(tank, 6), true);
});

test('a hull moves and turns over what is in nobody\'s way: a fallen unit, a through event, one below characters', () => {
    const w = world({ events: [unit(1, 10, 7), unit(2, 16, 12, 2), event(3, 9, 10, { pages: [page({ through: true })] }), event(4, 10, 10, { pages: [page({ priorityType: 0 })] }),
        event(5, 12, 8, { pages: [page({ through: true })] })] });
    const R = w.Reactor3D, player = w.$gamePlayer, fight = w.$gameFight, tank = w.at(1), raider = w.at(2);
    player.locate(2, 2);
    assert.ok(fight.start({ mode: 'action' }));
    w.tick();
    // A step south puts its last row on y 10.
    assert.equal(tank.canPass(10, 7, 2), true, 'over the through event and the one below characters');
    assert.equal(R.eventModelCanFace(tank, 6), true, 'and it turns over a through event');
    raider.locate(11, 10);
    w.tick();
    assert.equal(tank.canPass(10, 7, 2), false, 'a unit that stands is in its way');
    raider.locate(12, 7);
    w.tick();
    assert.equal(R.eventModelCanFace(tank, 6), false, 'and in the way of its turn');
    const unitOf = fight.unitOfEvent(2);
    fight.battler(unitOf)._hp = 0;
    fight.battler(unitOf).refresh();
    assert.equal(R.eventIsFallen(raider), true);
    assert.equal(R.eventModelCanFace(tank, 6), true, 'fallen: it turns over it');
    raider.locate(11, 10);
    w.tick();
    assert.equal(tank.canPass(10, 7, 2), true, 'and drives over it');
});

test('the facing a page gives an event as the map is set up swings over nothing', () => {
    // Its model is first drawn at that facing: there is no turn to wait out, and nobody near it is held up for one.
    const w = world({ events: [unit(1, 10, 7, 1, { pages: [page({ image: { tileId: 0, characterName: '', characterIndex: 0, direction: 6, pattern: 1 } })] })] });
    const R = w.Reactor3D, player = w.$gamePlayer;
    assert.equal(w.at(1).direction(), 6);
    assert.equal(w.at(1)._reactorTurnStamp, 0, 'the setup turned it');
    player.locate(2, 2);
    w.tick();
    assert.deepEqual(w.rows(1, 3), ['.......', '.......', '.#####.', '.#####.', '.#####.', '.......', '.......'], 'its tiles as it faces, and no more');
    assert.equal(player.isCollidedWithEvents(11, 9), false, 'beside it, inside the circle its corners would turn through');
    // A turn it is seen to make is waited out.
    w.at(1).setDirection(2);
    assert.equal(player.isCollidedWithEvents(11, 9), true);
    assert.equal(player.isCollidedWithEvents(12, 9), true, 'the arc between the two facings');
    assert.equal(player.isCollidedWithEvents(8, 9), false, 'not the quarter it does not swing through');
    for (let i = 0; i < R.MODEL_TURN_SWEEP_FRAMES; i++) w.tick();
    assert.equal(player.isCollidedWithEvents(12, 9), false);
});

test('the map objects ask the body rule, and say so where a plugin would look', () => {
    const objects = fs.readFileSync(path.join(runtimeRoot, 'reactor_objects_map.js'), 'utf8');
    assert.match(objects, /Game_CharacterBase\.prototype\.isCollidedWithEvents = function\(x, y\) \{[\s\S]{0,400}?Reactor3D\.bodyBlocksTile\(this, x, y\)/);
    assert.match(objects, /Reactor3D\.bodyMeetsEvents\(this, x, y, this\._reactorMoveDirection\(x, y\)\)/);
    assert.match(objects, /Reactor3D\.bodyMeetsParty\(this, x, y, this\._reactorMoveDirection\(x, y\)\)/);
    assert.match(objects, /Game_Event\.prototype\.pos = function\(x, y\) \{[\s\S]{0,300}?Reactor3D\.eventBodyCovers\(this, x, y\)/);
    // Without the 3D runtime the stock rule stands.
    const w = fightWorld({ events: [event(1, 8, 8)] });
    assert.equal(w.$gamePlayer.isCollidedWithEvents(8, 8), true);
    assert.equal(w.$gamePlayer.isCollidedWithEvents(9, 8), false);
    assert.equal(w.$gameMap.event(1).pos(8, 8), true);
});
