'use strict';
// How an on-map battle ends, and what can never hang one (runtime/reactor_fight.js, reactor_controls.js):
// event work queued during a battle runs, the keys come back with nothing left pressed, the followers return
// without holding the player, the fallen get up, and a unit is only put where a body can stand.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');

const battleProcessing = (troopId, canEscape = true, canLose = true) => [
    { code: 301, indent: 0, parameters: [0, troopId, canEscape, canLose] },
    { code: 601, indent: 0, parameters: [] }, { code: 121, indent: 1, parameters: [1, 1, 0] }, { code: 0, indent: 1, parameters: [] },
    { code: 602, indent: 0, parameters: [] }, { code: 121, indent: 1, parameters: [2, 2, 0] }, { code: 0, indent: 1, parameters: [] },
    { code: 603, indent: 0, parameters: [] }, { code: 121, indent: 1, parameters: [3, 3, 0] }, { code: 0, indent: 1, parameters: [] },
    { code: 604, indent: 0, parameters: [] },
    { code: 123, indent: 0, parameters: ['A', 0] },
    { code: 0, indent: 0, parameters: [] }
];
const end = { code: 0, indent: 0, parameters: [] };
const starter = (id, list) => event(id, 18, 13, { pages: [page({ trigger: 3, priorityType: 0, list }), page({ conditions: Object.assign(page().conditions, { selfSwitchValid: true, selfSwitchCh: 'A' }) })] });
const reactor = (name, args, indent = 0) => ({ code: 357, indent, parameters: ['RPGReactor', name, name, args] });
const outcome = w => [1, 2, 3].find(i => w.$gameSwitches.value(i)) || 0;
const done = w => () => outcome(w) > 0 && !w.$gameFight.isActive();
const bell = { id: 1, name: 'Bell', trigger: 0, switchId: 0, list: [
    { code: 101, indent: 0, parameters: ['', 0, 0, 2, ''] }, { code: 401, indent: 0, parameters: ['The bell rings.'] },
    { code: 122, indent: 0, parameters: [2, 2, 1, 0, 1] }, end] };
const foe = (id, x, y) => event(id, x, y, { note: '<unit: enemy 1>' });
/** The world has no pictures to load: Show Text asks for its face all the same. */
const noPictures = w => { w.ImageManager.loadFace = () => null; return w; };
const cells = list => list.map(c => c.x + ',' + c.y);

//-----------------------------------------------------------------------------
// Event work queued during a battle.

test('a common event reserved while the starting event waits for the battle runs in it, and the battle goes on', () => {
    const w = noPictures(fightWorld({ system: { reactorBattle: { mode: 'tactical' } }, events: [starter(1, battleProcessing(1))] }));
    w.$dataCommonEvents[1] = bell;
    // A long battle nobody falls in: tough enemies that cannot hurt.
    w.$dataEnemies[1].params = [4000, 0, 1, 5, 5, 5, 10, 5];
    w.run(40);
    assert.ok(w.$gameFight.isActive());
    assert.ok(w.$gameFight.waitingInterpreter(), 'the map\'s event waits for the battle');
    const turn = w.$gameFight.turn();
    w.$gameTemp.reserveCommonEvent(1);
    assert.equal(w.$gameFight.isBusy(), true, 'the battle waits for it');
    w.run(6);
    assert.equal(w.$gameVariables.value(2), 1, 'the common event ran');
    assert.equal(w.$gameTemp.isCommonEventReserved(), false);
    assert.ok(w.messages.includes('The bell rings.'), 'and its message was shown');
    w.run(900);
    assert.ok(w.$gameFight.turn() > turn, 'the battle went on');
    // One that names no common event is taken off the queue and holds nothing.
    w.$gameTemp.reserveCommonEvent(77);
    w.run(4);
    assert.equal(w.$gameTemp.isCommonEventReserved(), false);
    assert.equal(w.$gameFight.isBusy() && !w.$gameFight._act, false);
});

test('a skill with a Common Event effect is used in a waited battle and the battle still ends', () => {
    const w = noPictures(fightWorld({ system: { reactorBattle: { mode: 'tactical' } }, events: [starter(1, battleProcessing(1))] }));
    w.$dataCommonEvents[1] = bell;
    w.$dataSkills[1].effects = [{ code: 44, dataId: 1, value1: 0, value2: 0 }];
    w.run(6000, done(w));
    assert.equal(outcome(w), 1, 'If Win ran');
    assert.ok(w.$gameVariables.value(2) >= 2, 'the common event ran for the blows struck');
    assert.equal(w.$gameTemp.isCommonEventReserved(), false);
});

test('a common event reserved in a battle nothing waits for is run by the map, as outside a battle', () => {
    const w = noPictures(fightWorld({ events: [foe(1, 8, 8)] }));
    w.$dataCommonEvents[1] = bell;
    w.$dataEnemies[1].params[0] = 4000;
    w.$gameFight.start({ mode: 'tactical' });
    w.run(20);
    assert.equal(w.$gameFight.waitingInterpreter(), null);
    w.$gameTemp.reserveCommonEvent(1);
    w.run(6);
    assert.equal(w.$gameVariables.value(2), 1);
    assert.equal(w.$gameFight._hookInterpreter && w.$gameFight._hookInterpreter.isRunning(), false, 'not on the battle\'s own interpreter');
});

test('a battle started inside a called common event runs and takes its branch', () => {
    // The common event's interpreter waits, not the event's own: the battle must still know it is waited for.
    const caller = starter(1, [{ code: 117, indent: 0, parameters: [2] }, { code: 123, indent: 0, parameters: ['A', 0] }, end]);
    const w = fightWorld({ system: { reactorBattle: { mode: 'tactical' } }, events: [caller] });
    w.$dataCommonEvents[2] = { id: 2, name: 'Fight', trigger: 0, switchId: 0, list: battleProcessing(1).filter(c => c.code !== 123) };
    w.run(30);
    assert.ok(w.$gameFight.isActive());
    assert.equal(w.$gameMap._interpreter._waitMode, '', 'the event itself only called the common event');
    assert.ok(w.$gameFight.waitingInterpreter(), 'the called common event is the one waiting');
    assert.equal(w.$gameFight.waitingInterpreter()._waitMode, 'reactorFight');
    w.run(6000, done(w));
    assert.equal(outcome(w), 1, 'If Win ran');
    assert.equal(w.$gameParty.gold(), 14);
});

test('battle pages queued when the battle is decided all run before it is over', () => {
    // Four pages start with the battle; the first meets the goal. The other three still run.
    const set = n => page({ rrFightHook: { on: 'battleStart' }, list: [{ code: 122, indent: 0, parameters: [n, n, 1, 0, 1] }, end] });
    const goal = page({ rrFightHook: { on: 'battleStart' }, list: [{ code: 121, indent: 0, parameters: [6, 6, 0] }, end] });
    const w = fightWorld({ events: [foe(1, 14, 12), event(3, 11, 1, { pages: [page(), goal, set(3), set(4), set(5)] })] });
    const serial = w.$gameFight.start({ mode: 'tactical', objective: { type: 'switch', switchId: 6 } });
    w.run(2);
    assert.equal(w.$gameFight.isBusy(), true, 'pages queued behind the one running hold the battle');
    w.run(200, () => !w.$gameFight.isActive());
    assert.equal(w.$gameFight.resultOf(serial), w.ReactorFight.WIN);
    assert.deepEqual([3, 4, 5].map(n => w.$gameVariables.value(n)), [1, 1, 1], 'every page ran');
});

test('a battle page that takes the party to another map ends the battle and still runs its last commands', () => {
    const leave = page({ rrFightHook: { on: 'battleStart' }, list: [
        { code: 201, indent: 0, parameters: [0, 2, 1, 1, 0, 0] }, { code: 121, indent: 0, parameters: [5, 5, 0] }, end] });
    const w = fightWorld({ events: [foe(1, 8, 8), event(2, 12, 1, { pages: [page(), leave] })] });
    const serial = w.$gameFight.start({ mode: 'tactical' });
    w.run(4);
    assert.equal(w.$gameFight.isActive(), false, 'leaving the map ended it');
    assert.equal(w.$gameFight.resultOf(serial), w.ReactorFight.ESCAPE);
    assert.equal(w.$gameSwitches.value(5), false, 'the page waits for the transfer');
    assert.ok(w.$gameFight._tail, 'and is kept to be finished');
    // The transfer is done (the scene's part, not played here).
    w.$gamePlayer.clearTransferInfo();
    w.run(3);
    assert.equal(w.$gameSwitches.value(5), true, 'the command after the transfer ran');
    assert.equal(w.$gameFight._tail, null);
    // It is saved with the game while it runs.
    const again = fightWorld({ events: [foe(1, 8, 8), event(2, 12, 1, { pages: [page(), leave] })] });
    again.$gameFight.start({ mode: 'tactical' });
    again.run(4);
    const loaded = again.JsonEx.parse(again.JsonEx.stringify(again.$gameFight));
    assert.ok(loaded._tail && loaded._tail.isRunning(), 'the unfinished page is in the save');
});

test('an event waiting for a battle that is kept on a map the party left goes on, as after an escape', () => {
    const list = [reactor('StartMapBattle', { mode: 'tactical', wait: 'true', onTransfer: 'keep', resultVariable: '1' }), { code: 121, indent: 0, parameters: [5, 5, 0] }, { code: 123, indent: 0, parameters: ['A', 0] }, end];
    const w = fightWorld({ events: [starter(1, list), foe(2, 8, 8)] });
    w.$dataEnemies[1].params[0] = 9000;
    w.run(20);
    assert.ok(w.$gameFight.isActive() && w.$gameFight.waitingInterpreter());
    assert.equal(w.$gameSwitches.value(5), false);
    // The party is on another map now; the battle stays on its own.
    w.$gameMap._mapId = 2;
    w.run(3);
    assert.equal(w.$gameFight.isActive(), true, 'the battle is kept');
    assert.equal(w.$gameSwitches.value(5), true, 'the event did not wait for it for good');
    assert.equal(w.$gameVariables.value(1), w.ReactorFight.ESCAPE);
});

test('a hold that never lets go is passed over, and a long wait names its cause once', () => {
    const w = fightWorld({ events: [foe(1, 8, 8)] });
    const F = w.ReactorFight;
    const warned = [];
    w.console = Object.assign({}, console, { warn: text => warned.push(String(text)) });
    F.Director = { isBusy: () => true };
    w.Graphics.frameCount = 100;
    assert.equal(F.isHeld(), true);
    for (let i = 0; i < F.HOLD_MAX; i++) { w.Graphics.frameCount++; assert.equal(F.isHeld(), true, 'held, frame ' + i); }
    w.Graphics.frameCount++;
    assert.equal(F.isHeld(), false, 'longer than any shot lasts: the battle goes on');
    assert.equal(warned.length, 1);
    w.Graphics.frameCount++;
    assert.equal(F.isHeld(), false);
    assert.equal(warned.length, 1, 'said once');
    // A hold nobody asked about for a while starts afresh.
    w.Graphics.frameCount += 500;
    assert.equal(F.isHeld(), true);
    F.Director = null;
    assert.equal(F.isHeld(), false);

    // A battle page that never ends holds the battle; the console says what it waits for.
    const stuck = page({ rrFightHook: { on: 'battleStart' }, list: [{ code: 112, indent: 0, parameters: [] }, { code: 230, indent: 1, parameters: [10] }, end, { code: 413, indent: 0, parameters: [] }, end] });
    const s = fightWorld({ events: [foe(1, 8, 8), event(2, 12, 1, { pages: [page(), stuck] })] });
    const said = [];
    s.console = Object.assign({}, console, { warn: text => said.push(String(text)) });
    s.$gameFight.start({ mode: 'tactical' });
    s.run(s.ReactorFight.STALL_WARN + 40);
    assert.equal(said.length, 1, 'once');
    assert.match(said[0], /waited .* for the battle page of event 2/);
    assert.match(s.$gameFight.waitReason(), /event 2/);
});

//-----------------------------------------------------------------------------
// The followers after a battle.

/** A battle started and ended by script, with the followers put where the test wants them in between. */
function endedBattle({ party = [1, 2, 3], place, system = {}, result } = {}) {
    const w = fightWorld({ system: Object.assign({ partyMembers: party }, system), events: [foe(1, 17, 12)] });
    w.$dataEnemies[1].params[0] = 9000;
    w.$gamePlayer.locate(8, 7);
    w.$gamePlayer.setDirection(2);
    w.$gameFight.start({ mode: 'tactical', canLose: true });
    const followers = w.$gamePlayer.followers(), visible = followers.visibleFollowers();
    if (place) place(w, visible);
    // The end is taken one frame (nothing to show: it is quiet) and the battle is over the next.
    w.$gameFight.end(result === undefined ? w.ReactorFight.ESCAPE : result, true);
    w.run(1);
    assert.equal(w.$gameFight.isActive(), true);
    return { w, followers, visible };
}
const beside = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
const settle = (w, followers, limit = 400) => { let n = 0; for (; n < limit && (followers._rrRegroup || followers.visibleFollowers().some(f => f.isMoving())); n++) w.run(1); return n; };

test('the moment a battle is over the player can walk: no follower is waited for', () => {
    const { w, followers, visible } = endedBattle({ place: (w, f) => { w.Game_CharacterBase.prototype.locate.call(f[0], 19, 7); w.Game_CharacterBase.prototype.locate.call(f[1], 3, 2); } });
    w.run(1);
    assert.equal(w.$gameFight.isActive(), false);
    assert.equal(followers.areGathering(), false, 'no gather is asked for');
    assert.equal(w.$gamePlayer.areFollowersGathering(), false);
    assert.equal(w.$gamePlayer.canMove(), true, 'control is back on the frame the battle ends');
    assert.ok(followers._rrRegroup, 'the followers are on their way back');
    // The player walks off at once, and the walk is never refused while they return.
    for (let i = 0; i < 40; i++) {
        assert.equal(w.$gamePlayer.canMove(), true, 'frame ' + i);
        if (!w.$gamePlayer.isMoving()) w.$gamePlayer.moveStraight(6);
        w.run(1);
    }
    assert.ok(w.$gamePlayer.x >= 10, 'the player moved: ' + w.$gamePlayer.x);
    settle(w, followers);
    assert.equal(followers._rrRegroup, null, 'the walk back ends');
    assert.ok(beside(visible[0], w.$gamePlayer) && beside(visible[1], visible[0]), 'each beside the one before it: ' + cells([w.$gamePlayer, ...visible]));
    assert.ok(visible.every(f => f.isThrough()), 'and they trail the leader again');
});

test('a follower far from the leader is put beside it and fades in; nobody walks 11 tiles back', () => {
    const { w, followers, visible } = endedBattle({ party: [1, 2], place: (w, f) => w.Game_CharacterBase.prototype.locate.call(f[0], 19, 7) });
    w.run(1);
    const far = visible[0];
    assert.ok(beside(far, w.$gamePlayer), 'beside the leader on the frame the battle ends: ' + cells([far]));
    assert.deepEqual([far.x, far.y], [8, 6], 'behind the leader (who faces down)');
    assert.ok(far.opacity() < 255, 'not fully there yet');
    w.run(w.ReactorFight.REGROUP_FADE + 1);
    assert.equal(far.opacity(), 255, 'faded in');
    assert.equal(followers._rrRegroup, null);
    // The followers past the party's two stand for nobody: they are not walked or placed.
    assert.ok(followers._data.length > 1 && followers._data.slice(1).every(f => f.pos(8, 7)), 'left where they were: ' + cells(followers._data));
});

test('a follower near the leader walks back at a run and stops beside it; one stopped on the way is put there', () => {
    const { w, followers, visible } = endedBattle({ party: [1, 2], place: (w, f) => w.Game_CharacterBase.prototype.locate.call(f[0], 13, 7) });
    const walker = visible[0];
    w.run(2);
    assert.ok(walker.isMoving() && walker._realX < 13 && walker._realX > 12, 'it walks: ' + walker._realX);
    const frames = settle(w, followers);
    assert.deepEqual([walker.x, walker.y], [9, 7], 'it stops beside the leader, not on its cell');
    assert.ok(frames <= 4 * 8 + 4, 'four tiles at a run (8 frames a tile): ' + frames);
    assert.equal(walker.opacity(), 255);
    assert.equal(walker.isThrough(), true);

    // Something stands in the way: the walk ends there and the follower is beside the leader at once.
    const blocked = fightWorld({ system: { partyMembers: [1, 2] }, events: [foe(1, 17, 12), event(2, 10, 7)] });
    blocked.$dataEnemies[1].params[0] = 9000;
    blocked.$gamePlayer.locate(8, 7);
    blocked.$gameFight.start({ mode: 'tactical' });
    const f = blocked.$gamePlayer.followers().visibleFollowers()[0];
    blocked.Game_CharacterBase.prototype.locate.call(f, 13, 7);
    blocked.$gameFight.end(blocked.ReactorFight.ESCAPE, true);
    blocked.run(2);
    assert.ok(f.isMoving(), 'it sets off');
    settle(blocked, blocked.$gamePlayer.followers());
    assert.ok(beside(f, blocked.$gamePlayer), 'beside the leader: ' + cells([f]));
    assert.notDeepEqual([f.x, f.y], [10, 7], 'never through the event in its way');
});

test('followers left on the leader\'s cell step off it: the party ends on cells of its own', () => {
    const { w, followers, visible } = endedBattle({ place: (w, f) => { for (const c of f) w.Game_CharacterBase.prototype.locate.call(c, 8, 7); } });
    w.run(1);
    assert.ok(followers._rrRegroup);
    settle(w, followers);
    const all = cells([w.$gamePlayer, ...visible]);
    assert.equal(new Set(all).size, all.length, 'nobody shares a cell: ' + all);
    assert.ok(beside(visible[0], w.$gamePlayer) && beside(visible[1], visible[0]));
    assert.ok(visible.every(f => f.opacity() === 255), 'a step, not a fade');

    // In a corner with one free cell beside the leader the rest stand where they can, never in a wall.
    const walled = fightWorld({ system: { partyMembers: [1, 2, 3] }, events: [foe(1, 17, 12)] });
    walled.$dataTilesets[1].flags[1537] = 0x0f;
    for (const [x, y] of [[0, 1], [1, 1]]) walled.$dataMap.data[y * 20 + x] = 1537;
    walled.$dataEnemies[1].params[0] = 9000;
    walled.$gamePlayer.locate(0, 0);
    walled.$gameFight.start({ mode: 'tactical' });
    const pair = walled.$gamePlayer.followers().visibleFollowers();
    for (const c of pair) walled.Game_CharacterBase.prototype.locate.call(c, 12, 9);
    walled.$gameFight.end(walled.ReactorFight.ESCAPE, true);
    walled.run(2);
    settle(walled, walled.$gamePlayer.followers());
    assert.deepEqual([pair[0].x, pair[0].y], [1, 0], 'the one free cell');
    assert.deepEqual([pair[1].x, pair[1].y], [2, 0], 'and the next one along');
});

test('hidden followers are simply with the leader again, and a gather an event asks for still gathers', () => {
    const w = fightWorld({ system: { partyMembers: [1, 2, 3], optFollowers: false }, events: [foe(1, 17, 12)] });
    w.$dataEnemies[1].params[0] = 9000;
    w.$gamePlayer.locate(8, 7);
    w.$gameFight.start({ mode: 'tactical' });
    const followers = w.$gamePlayer.followers();
    assert.equal(followers.isVisible(), true, 'shown for the battle');
    w.Game_CharacterBase.prototype.locate.call(followers._data[0], 15, 3);
    w.$gameFight.end(w.ReactorFight.ESCAPE, true);
    w.run(2);
    assert.equal(w.$gameFight.isActive(), false);
    assert.equal(followers.isVisible(), false);
    assert.equal(followers._rrRegroup || null, null);
    assert.ok(followers._data.every(f => f.pos(8, 7) && f.isThrough()));

    const { w: g, followers: gf, visible } = endedBattle({ place: (w, f) => w.Game_CharacterBase.prototype.locate.call(f[0], 13, 7) });
    g.run(1);
    assert.ok(gf._rrRegroup);
    gf.gather();
    g.run(200, () => !gf.areGathering());
    assert.equal(gf._rrRegroup, null, 'the gather takes over');
    assert.ok(visible.every(f => f.pos(g.$gamePlayer.x, g.$gamePlayer.y)), 'as a gather always ends');
});

test('in a battle a follower is a unit of its own: it keeps its place and its dimness whatever the leader does', () => {
    const w = fightWorld({ system: { partyMembers: [1, 2, 3] }, events: [foe(1, 17, 12)] });
    w.$dataEnemies[1].params[0] = 9000;
    w.$gamePlayer.locate(8, 7);
    w.$gameFight.start({ mode: 'tactical' });
    const fight = w.$gameFight, [a, b] = w.$gamePlayer.followers().visibleFollowers();
    // Nobody takes a turn while this is looked at.
    fight._wait = 1e6;
    w.Game_CharacterBase.prototype.locate.call(a, 4, 4);
    w.Game_CharacterBase.prototype.locate.call(b, 12, 9);
    // The leader falls: it dims, the others do not.
    const lead = fight._units.find(u => fight.character(u) === w.$gamePlayer);
    fight.battler(lead).setHp(0);
    fight.defeat(lead);
    w.run(3);
    assert.equal(w.$gamePlayer.opacity(), 110);
    assert.deepEqual([a.opacity(), b.opacity()], [255, 255], 'a fallen leader does not dim the party');
    // A follower falls: it stays dim.
    const other = fight._units.find(u => fight.character(u) === b);
    fight.battler(other).setHp(0);
    fight.defeat(other);
    w.run(3);
    assert.equal(b.opacity(), 110, 'a fallen follower stays dim');
    // The player is put somewhere on the battle's map: the others stay on their cells.
    w.$gamePlayer.locate(10, 10);
    assert.deepEqual(cells([a, b]), ['4,4', '12,9']);
    fight.end(w.ReactorFight.WIN, true);
    w.run(2);
    assert.equal(fight.isActive(), false);
    assert.deepEqual([w.$gamePlayer.opacity(), a.opacity()], [255, 255]);
    // Outside a battle a transfer brings them along as always.
    w.$gamePlayer.followers()._rrRegroup = null;
    w.$gamePlayer.locate(3, 3);
    assert.deepEqual(cells([a, b]), ['3,3', '3,3']);
});

//-----------------------------------------------------------------------------
// The fallen.

/**
 * A battle with party members 1 and 2 and an ally event that stands for actor 3. `before`: who is already down when
 * it starts; `fall`: who falls in it; `during(w, fight)`: anything else before it ends with `result`.
 */
function fallen({ result, system, before = [], fall = [2, 3], during } = {}) {
    const ally = event(2, 10, 3, { note: '<unit: actor 3>' });
    const w = fightWorld({ system: Object.assign({ partyMembers: [1, 2] }, system), events: [foe(1, 17, 12), ally] });
    w.$dataEnemies[1].params[0] = 9000;
    for (const id of before) { w.$gameActors.actor(id).setHp(0); w.$gameActors.actor(id).refresh(); }
    w.$gamePlayer.locate(8, 7);
    w.$gameFight.start({ mode: 'tactical', canLose: true });
    const fight = w.$gameFight, follower = w.$gamePlayer.followers().visibleFollowers()[0];
    // Nobody takes a turn while this is set up.
    fight._wait = 1e6;
    for (const id of fall) {
        const unit = fight._units.find(u => u.actorId === id);
        fight.battler(unit).setHp(0);
        fight.defeat(unit);
    }
    follower._reactorFall = 19; follower._reactorPosePitch = 1;
    if (during) during(w, fight);
    fight.end(result, true);
    // The ally's event falls, lies and fades before the battle is over.
    w.run(w.ReactorFight.FALL_REST + w.ReactorFight.DEFEAT_FADE + 4);
    assert.equal(fight.isActive(), false);
    return { w, follower, hp: id => w.$gameActors.actor(id).hp };
}

test('whoever fell in a battle on the party\'s side gets up with 1 HP when it is won; a setting keeps them down', () => {
    const F = fightWorld().ReactorFight;
    const won = fallen({ result: F.WIN });
    assert.equal(won.hp(2), 1, 'the party member gets up');
    assert.equal(won.w.$gameActors.actor(2).isDead(), false);
    assert.equal(won.hp(3), 1, 'and so does the ally an event stands for');
    assert.deepEqual([won.follower._reactorFall, won.follower._reactorPosePitch, won.follower.opacity()], [0, 0, 255], 'nothing of the fall is left on the follower');
    assert.equal(won.hp(1), won.w.$gameActors.actor(1).mhp, 'the living are left as they are');
    const lost = fallen({ result: F.LOSE });
    assert.equal(lost.hp(2), 1, 'a battle that can be lost revives, as it always did');
    assert.equal(lost.hp(3), 1);
    const kept = fallen({ result: F.WIN, system: { reactorBattle: { reviveAfterBattle: false } } });
    assert.equal(kept.hp(2), 0, 'the game keeps them down when it says so');
    assert.deepEqual([kept.follower._reactorFall, kept.follower.opacity()], [0, 255], 'the pose is the battle\'s and goes with it all the same');
});

test('a battle is no free revival: one already down before it stays down, and leaving a battle gets nobody up', () => {
    const F = fightWorld().ReactorFight;
    // Left by an escape, or ended quietly by an event: the fallen are as they were, as after leaving a Classic battle.
    const left = fallen({ result: F.ESCAPE });
    assert.deepEqual([left.hp(2), left.hp(3)], [0, 0], 'an escape revives nobody');
    assert.deepEqual([left.follower._reactorFall, left.follower.opacity()], [0, 255], 'the pose and the dimness still go with the battle');
    // Down before the battle began (a member, and the actor an ally event stands for): a win does not get them up.
    const down = fallen({ result: F.WIN, before: [2, 3], fall: [] });
    assert.deepEqual([down.hp(2), down.hp(3)], [0, 0], 'who was down before it stays down');
    assert.equal(fallen({ result: F.ESCAPE, before: [2], fall: [] }).hp(2), 0, 'starting a battle and leaving it at once revives nobody');
    // Down before, struck again in the battle (a blow on a fallen body): still not this battle's fallen.
    const struck = fallen({ result: F.WIN, before: [2], fall: [2] });
    assert.equal(struck.hp(2), 0);
    // Down before, revived in the battle, fallen again: that fall is this battle's, and the win gets them up.
    const again = fallen({ result: F.WIN, before: [2], fall: [], during: (w, fight) => {
        const unit = fight._units.find(u => u.actorId === 2), battler = fight.battler(unit);
        assert.equal(unit.down, true, 'known to have joined down');
        battler.setHp(50); battler.refresh();
        fight.checkOutcome();
        assert.equal(unit.down, false, 'seen alive in the battle');
        battler.setHp(0); battler.refresh();
        fight.defeat(unit);
    } });
    assert.equal(again.hp(2), 1);
    // A battle that is lost and can be revives the whole party, as the stock rule has it.
    assert.equal(fallen({ result: F.LOSE, before: [2], fall: [] }).hp(2), 1);
});

//-----------------------------------------------------------------------------
// The keys.

function controls(system = {}) {
    const context = { console, Math, JSON, Number, Object, Array, $dataSystem: system, $dataMap: { reactor3d: {} },
        Input: { keyMapper: { 9: 'tab', 13: 'ok', 16: 'shift', 27: 'escape', 32: 'ok', 81: 'pageup', 87: 'pagedown', 90: 'ok' },
            gamepadMapper: { 0: 'ok', 1: 'cancel', 2: 'shift', 3: 'menu', 4: 'pageup', 5: 'pagedown' }, _currentState: {} } };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('runtime/reactor_controls.js'), context);
    // What the engine's own key handlers do: the name the key gives at that moment is pressed or released.
    context.down = code => { const name = context.Input.keyMapper[code]; if (name) context.Input._currentState[name] = true; };
    context.up = code => { const name = context.Input.keyMapper[code]; if (name) context.Input._currentState[name] = false; };
    context.pressed = () => Object.keys(context.Input._currentState).filter(name => context.Input._currentState[name]).sort();
    return context;
}

test('a key held when an action battle ends is not pressed in the next one, and the keys come back exactly', () => {
    const c = controls();
    const before = JSON.stringify([c.Input.keyMapper, c.Input.gamepadMapper]);
    c.ReactorControls.setAction(true);
    assert.equal(c.Input.keyMapper[70], 'attack');
    c.down(70); c.down(86);
    assert.deepEqual(c.pressed(), ['attack', 'guard']);
    // The battle ends with F and V still down; they come up afterwards, when F and V mean nothing.
    c.ReactorControls.setAction(false);
    assert.deepEqual(c.pressed(), [], 'nothing is left pressed under a battle name');
    c.up(70); c.up(86);
    assert.equal(JSON.stringify([c.Input.keyMapper, c.Input.gamepadMapper]), before, 'every key and button does what it did');
    c.ReactorControls.setAction(true);
    assert.deepEqual(c.pressed(), [], 'the next battle starts with nothing pressed');
    c.ReactorControls.setAction(false);

    // A key held under its map name when a battle takes it is let go too: its release would clear the battle's name.
    c.down(81);
    assert.deepEqual(c.pressed(), ['pageup']);
    c.ReactorControls.setAction(true);
    assert.deepEqual(c.pressed(), [], 'Q was Page Up; it is the weapon key now and Page Up is not held');
    c.up(81);
    c.ReactorControls.setAction(false);
    // A button whose battle name is an ordinary one (Start is the menu in a battle) is let go as it is given back.
    c.ReactorControls.setAction(true);
    c.Input._currentState.menu = true;
    c.ReactorControls.setAction(false);
    assert.deepEqual(c.pressed(), []);
    // A name stuck from an older battle (a save, a plugin) is cleared when the next one begins.
    c.Input._currentState.attack = true;
    c.ReactorControls.setAction(true);
    assert.deepEqual(c.pressed(), []);
    c.ReactorControls.setAction(false);
    assert.equal(JSON.stringify([c.Input.keyMapper, c.Input.gamepadMapper]), before);
});

test('the jump key held across a change of map is let go with it', () => {
    const c = controls();
    c.ReactorPhysics = { jumpAllowed: () => true };
    c.ReactorControls.setField3D(true);
    assert.equal(c.Input.keyMapper[32], 'jump');
    c.down(32);
    assert.deepEqual(c.pressed(), ['jump']);
    c.ReactorControls.setField3D(false);
    assert.deepEqual(c.pressed(), [], 'Space confirms again; Jump is not held on the next 3D map');
    c.down(32);
    assert.deepEqual(c.pressed(), ['ok']);
    c.ReactorControls.setField3D(true);
    assert.deepEqual(c.pressed(), [], 'and Confirm is not held under a key that jumps');
    assert.equal(typeof c.ReactorControls.letGo, 'function');
});

//-----------------------------------------------------------------------------
// Where a unit is put.

const { runtime3DFiles } = require('./helpers/runtime-3d-source.cjs');
let nextId = 1;
const piece = (kind, x, y, z, more) => Object.assign({ id: nextId++, kind, x, y, z, rot: 0, material: '' }, more || {});
const column = (x, y, levels) => Array.from({ length: levels }, (unused, z) => piece('block', x, y, z));

/** The battle world on a 3D map: the real 3D runtime (in the game's own realm, so it reads the game's map) and physics over the test map. */
function world3D({ pieces = [], water = [], events = [], party = [1, 2], foliage = null } = {}) {
    const sidecar = { version: 1, mode: '3d', pieces, water };
    if (foliage) sidecar.foliage = foliage;
    const w = fightWorld({ system: { partyMembers: party }, events, mapNote: '<3d>', mapSidecar: sidecar });
    for (const file of runtime3DFiles()) vm.runInContext(read('runtime/' + file), w, { filename: file });
    vm.runInContext(read('runtime/reactor_controls.js'), w);
    vm.runInContext(read('runtime/reactor_physics.js'), w);
    return w;
}
const yard = () => world3D({
    pieces: [
        ...column(10, 5, 5),                                                    // a post: its only place to stand is its top
        piece('floor', 12, 5, 2),                                               // a low roof: no room to stand under, and nobody is put on it
        piece('block', 9, 6, 0),                                                // a ledge a whole tile up
        piece('floor', 11, 6, 0),                                               // a floor slab on the ground
        ...[14, 15, 16].flatMap(x => [5, 6, 7].map(y => piece('floor', x, y, 5)))  // an upper floor over open ground
    ],
    water: [{ x0: 4, y0: 10, x1: 7, y1: 12, level: 1, material: 'Water' }]
});

test('a body is put only where one can stand: not a post, a low roof, a ledge or deep water', () => {
    const w = yard(), F = w.ReactorFight;
    assert.equal(F.standLevel(3, 3), 0, 'open ground');
    assert.ok(Math.abs(F.standLevel(11, 6) - 0.1) < 0.02, 'a floor slab is the ground: ' + F.standLevel(11, 6));
    assert.ok(Number.isNaN(F.standLevel(10, 5)), 'not the top of a post');
    assert.ok(Number.isNaN(F.standLevel(12, 5)), 'not under a roof too low for a body, nor on it');
    assert.ok(Number.isNaN(F.standLevel(9, 6)), 'not a ledge a tile up');
    assert.ok(Number.isNaN(F.standLevel(5, 11)), 'not deep water');
    assert.equal(F.standLevel(15, 6), 0, 'under an upper floor: the ground');
    assert.ok(Math.abs(F.standLevel(15, 6, 5.1) - 5.1) < 0.02, 'asked from upstairs: the upper floor');
    assert.ok(Number.isNaN(F.standLevel(3, 3, 5.1)), 'and never the ground below it');
    assert.ok(Number.isFinite(F.standLevel(10, 5, 5)), 'someone already up a post is level with it');
    // A map without 3D has one level everywhere.
    assert.equal(fightWorld().ReactorFight.standLevel(3, 3), 0);
});

test('the free cell found beside someone is on their own level, and never one of the bad cells', () => {
    const w = yard(), fight = w.$gameFight;
    // The party stands with the post, the ledge and the slab around it.
    w.$gamePlayer.locate(10, 6);
    w.run(2);
    const taken = [];
    for (let i = 0; i < 6; i++) {
        const spot = fight.freeSpotNear(10, 6, 1);
        taken.push(spot.x + ',' + spot.y);
        assert.ok(Number.isFinite(spot.height) && spot.height < 0.2, 'on the ground: ' + JSON.stringify(spot));
        w.$dataMap.events[20 + i] = event(20 + i, spot.x, spot.y);
        w.$gameMap._events[20 + i] = new w.Game_Event(1, 20 + i);
    }
    assert.ok(!taken.includes('10,5') && !taken.includes('9,6'), 'not the post, not the ledge: ' + taken);
    assert.ok(taken.includes('11,6'), 'the slab beside is as good as the ground');
    // Upstairs, the cell found is upstairs.
    w.$gamePlayer.locate(15, 6);
    w.$gamePlayer._reactorGround = 5.1;
    const up = fight.freeSpotNear(15, 6, 1);
    assert.ok(Math.abs(up.height - 5.1) < 0.02 && up.x >= 14 && up.x <= 16 && up.y >= 5 && up.y <= 7, 'on the upper floor: ' + JSON.stringify(up));
    // Where no cell is level with the place asked from, plain ground of its own is taken.
    const lone = world3D({ pieces: [piece('floor', 5, 5, 5)] });
    lone.$gamePlayer.locate(5, 5);
    lone.$gamePlayer._reactorGround = 5.1;
    const down = lone.$gameFight.freeSpotNear(5, 5, 1);
    assert.equal(down.height, 0, 'the ground beside the lone platform');
});

test('a unit spawned on a bad or taken cell appears on the nearest good one, standing on its level', () => {
    const w = yard(), fight = w.$gameFight;
    w.$gamePlayer.locate(3, 3);
    w.run(2);
    fight.start({ mode: 'tactical' });
    const at = unit => { const c = fight.character(unit); return [c.x, c.y]; };
    const post = fight.spawn({ record: 'enemy', id: 1, x: 10, y: 5 });
    assert.notDeepEqual(at(post), [10, 5], 'not on the post');
    assert.ok(Math.max(Math.abs(at(post)[0] - 10), Math.abs(at(post)[1] - 5)) === 1, 'beside it: ' + at(post));
    assert.equal(fight.character(post)._reactorGround, w.ReactorFight.standLevel(...at(post)), 'on the ground there');
    const pond = fight.spawn({ record: 'enemy', id: 1, x: 5, y: 11 });
    assert.ok(Number.isFinite(w.ReactorFight.standLevel(...at(pond))), 'not in the pond: ' + at(pond));
    const onPlayer = fight.spawn({ record: 'enemy', id: 1, x: 3, y: 3 });
    assert.notDeepEqual(at(onPlayer), [3, 3], 'not inside the player');
    const again = fight.spawn({ record: 'enemy', id: 1, x: at(post)[0], y: at(post)[1] });
    assert.notDeepEqual(at(again), at(post), 'not inside another unit');
    const free = fight.spawn({ record: 'enemy', id: 1, x: 18, y: 2 });
    assert.deepEqual(at(free), [18, 2], 'a good, free cell is taken as asked');
    const upstairs = fight.spawn({ record: 'enemy', id: 1, x: 15, y: 6, height: 5.1 });
    assert.deepEqual(at(upstairs), [15, 6]);
    assert.ok(Math.abs(fight.character(upstairs)._reactorGround - 5.1) < 0.02, 'on the floor asked for');
    w.run(3);
    assert.ok(Math.abs(fight.character(upstairs)._reactorGround - 5.1) < 0.02, 'and it stays there');
    assert.ok(fight.character(post)._reactorGround < 0.2);
    // The data of the event says where it really is (a save, a reload).
    assert.deepEqual([w.$dataMap.events[post.eventId].x, w.$dataMap.events[post.eventId].y], at(post));

    // On a map without 3D only who stands there matters.
    const flat = fightWorld({ events: [foe(1, 6, 6)] });
    flat.$gameFight.start({ mode: 'tactical' });
    const f = flat.$gameFight, a = f.spawn({ record: 'enemy', id: 2, x: 6, y: 6 }), b = f.spawn({ record: 'enemy', id: 2, x: 12, y: 8 });
    assert.notDeepEqual([f.character(a).x, f.character(a).y], [6, 6]);
    assert.deepEqual([f.character(b).x, f.character(b).y], [12, 8]);
});

test('on a 3D map a follower on another level is put on the leader\'s floor, not walked through the building', () => {
    const w = yard();
    w.$dataEnemies[1].params[0] = 9000;
    w.$dataMap.events[1] = foe(1, 2, 13);
    w.$gameMap._events[1] = new w.Game_Event(1, 1);
    w.$gamePlayer.locate(13, 9);
    w.run(2);
    w.$gameFight.start({ mode: 'tactical' });
    const followers = w.$gamePlayer.followers(), f = followers.visibleFollowers()[0];
    // It fought its way up onto the upper floor, three cells from the leader.
    w.$gameFight._wait = 1e6;
    w.Game_CharacterBase.prototype.locate.call(f, 14, 7);
    f._reactorGround = 5.1;
    w.run(2);
    assert.ok(f._reactorGround > 5, 'upstairs: ' + f._reactorGround);
    w.$gameFight.end(w.ReactorFight.ESCAPE, true);
    w.run(3);
    assert.equal(w.$gameFight.isActive(), false);
    assert.ok(beside(f, w.$gamePlayer), 'beside the leader: ' + cells([f]));
    assert.ok(f._reactorGround < 0.2, 'on the leader\'s floor: ' + f._reactorGround);
    settle(w, followers);
    w.run(20);
    assert.ok(f._reactorGround < 0.2 && f.opacity() === 255);
});

/**
 * Units wear a model whose body is known: the Database binds each enemy id of `models` to a box of that size
 * (x across, y high, z long, in tiles), as a loaded model reads. A unit facing down covers x by z cells round its own.
 */
function bindModels(w, models) {
    // The game loads the 3D runtime before reactor_fight.js, which then gives a unit its record's model: that block, as shipped.
    const fight = read('runtime/reactor_fight.js');
    const from = fight.indexOf('// A unit event with no model of its own wears');
    assert.ok(from > 0, 'reactor_fight.js gives a unit its record\'s model');
    vm.runInContext(`(function(F) {${fight.slice(from, fight.indexOf('//-----', from))}})(ReactorFight);`, w);
    const R = w.Reactor3D, enemies = {};
    for (const [id, size] of Object.entries(models)) {
        const name = 'Model' + id;
        enemies[id] = { name, size: Math.max(size.x, size.y, size.z) };
        const spec = R.normalizeModelSpec({ name });
        R._glbCache[R.modelCacheKey(spec.name, spec.ext, spec.file)] = { template: { userData: { glbSize: size } } };
    }
    R._databaseSidecar = { enemies, actors: {} };
    R._databaseSidecarState = 'done';
    return w;
}
const covered = (w, character) => {
    const R = w.Reactor3D, out = [];
    for (let y = character.y - 6; y <= character.y + 6; y++) for (let x = character.x - 6; x <= character.x + 6; x++) if (R.eventBodyCovers(character, x, y)) out.push(x + ',' + y);
    return out;
};

test('nobody is put inside a big unit: every cell its body covers is taken', () => {
    // A hull three cells wide and five long, known only by the model its record wears: no size is typed for it.
    const w = bindModels(world3D({ events: [foe(5, 6, 6)] }), { 1: { x: 3, y: 2, z: 5 } });
    w.$gamePlayer.locate(15, 12);
    w.run(2);
    const fight = w.$gameFight;
    fight.start({ mode: 'tactical' });
    const hull = w.$gameMap.event(5);
    assert.equal(w.Reactor3D.eventBody(hull).count, 15, 'three by five');
    const inside = (x, y) => x >= 5 && x <= 7 && y >= 4 && y <= 8;
    assert.equal(fight.unitAt(7, 8), null, 'its own cell is the only one the battle counts it on');
    assert.equal(fight.cellTaken(7, 8), true, 'a corner of its body is taken');
    assert.equal(fight.cellTaken(8, 8), false);
    const spot = fight.freeSpotNear(6, 6, 1);
    assert.ok(!inside(spot.x, spot.y), 'beside the body, not in it: ' + JSON.stringify(spot));
    const unit = fight.spawn({ record: 'enemy', id: 2, x: 7, y: 4 });
    const c = fight.character(unit);
    assert.ok(!inside(c.x, c.y), 'a unit asked for under it appears beside it: ' + [c.x, c.y]);
});

test('a unit bigger than its cell is put clear of the party and of the others; the party is never moved for it', () => {
    // A troop of one hull nine cells square: three cells from the leader, where a small unit goes, it would cover the party.
    const w = bindModels(world3D({ party: [1, 2, 3] }), { 3: { x: 9, y: 3, z: 9 }, 1: { x: 1, y: 3, z: 1 } });
    w.$dataEnemies[3] = Object.assign({}, w.$dataEnemies[1], { id: 3, name: 'Hull' });
    w.$dataTroops[3] = { id: 3, name: 'Hull', members: [{ enemyId: 3, x: 0, y: 0, hidden: false }], pages: [] };
    w.$gamePlayer.locate(10, 7);
    w.run(2);
    const fight = w.$gameFight, R = w.Reactor3D;
    fight.start({ mode: 'tactical', troopId: 3 });
    const hull = fight.character(fight.units({ team: 'enemy' })[0]);
    assert.equal(R.eventBody(hull).count, 81);
    assert.deepEqual([w.$gamePlayer.x, w.$gamePlayer.y], [10, 7], 'the leader stands where it stood');
    const party = [w.$gamePlayer, ...w.$gamePlayer.followers().visibleFollowers()];
    for (const member of party) assert.equal(R.eventBodyCovers(hull, member.x, member.y), false, 'no member is under the hull at ' + [hull.x, hull.y]);
    // Its body keeps the distance a small unit's cell would have: three cells from the leader's.
    assert.ok(R.eventBodyGap(hull, 10.5, 7.5) >= 2.5, 'open ground between the hull and the leader: ' + R.eventBodyGap(hull, 10.5, 7.5) + ' (hull at ' + [hull.x, hull.y] + ')');
    assert.ok(Math.max(Math.abs(hull.x - 10), Math.abs(hull.y - 7)) >= 7, 'so its own cell is that and its reach away');
    assert.deepEqual([w.$dataMap.events[hull.eventId()].x, w.$dataMap.events[hull.eventId()].y], [hull.x, hull.y], 'and its data says where it is');
    // A small unit asked for where the hull lies goes beside it; a second hull asked for on the first is put clear of it and of the party.
    const second = fight.character(fight.spawn({ record: 'enemy', id: 3, x: hull.x, y: hull.y }));
    const first = covered(w, hull), other = covered(w, second);
    assert.equal(other.filter(cell => first.includes(cell)).length, 0, 'the two hulls share no cell: ' + [second.x, second.y]);
    for (const member of party) assert.equal(R.eventBodyCovers(second, member.x, member.y), false);

    // A hull asked for by its cell stays on that cell when it is clear of everybody, whatever ground lies under its sides.
    const yardWorld = bindModels(yard(), { 3: { x: 5, y: 3, z: 5 } });
    yardWorld.$dataEnemies[3] = Object.assign({}, yardWorld.$dataEnemies[1], { id: 3, name: 'Hull' });
    yardWorld.$gamePlayer.locate(2, 13);
    yardWorld.run(2);
    yardWorld.$gameFight.start({ mode: 'tactical' });
    // (12, 7): its sides lie over the post at (10, 5) and the low roof at (12, 5).
    const placed = yardWorld.$gameFight.character(yardWorld.$gameFight.spawn({ record: 'enemy', id: 3, x: 12, y: 7 }));
    assert.equal(yardWorld.Reactor3D.eventBodyCovers(placed, 10, 5), true);
    assert.deepEqual([placed.x, placed.y], [12, 7], 'the game\'s own choice of cell is kept');
    // One the battle places itself (next to someone) is put where its whole body is on ground it could stand on.
    const near = yardWorld.$gameFight.character(yardWorld.$gameFight.spawn({ record: 'enemy', id: 3, x: 3, y: 10, around: yardWorld.$gamePlayer }));
    const P = yardWorld.ReactorPhysics;
    for (const cell of covered(yardWorld, near)) {
        const [x, y] = cell.split(',').map(Number);
        assert.notEqual(P.standingAt(yardWorld.$dataMap, x, y, 0, { within: 1 }), null, 'ground under the hull at ' + cell + ' (hull at ' + [near.x, near.y] + ')');
    }
    assert.equal(yardWorld.Reactor3D.eventBodyCovers(near, 2, 13), false);

    // A model that has not loaded yet is a guess (a square of its longest side): a formation asked for cell by cell
    // stands on the cells asked, whatever the guesses cover. Placed by the battle itself, the guess is kept clear.
    const early = bindModels(world3D(), {});
    early.Reactor3D._databaseSidecar = { enemies: { 1: { name: 'NotLoadedYet', size: 3 } }, actors: {} };
    early.$gamePlayer.locate(3, 12);
    early.run(2);
    early.$gameFight.start({ mode: 'tactical' });
    const line = [[10, 5], [11, 5], [12, 5], [10, 6]].map(([x, y]) => early.$gameFight.character(early.$gameFight.spawn({ record: 'enemy', id: 1, x, y })));
    assert.equal(early.Reactor3D.eventBody(line[0]).count, 9, 'guessed three cells square');
    assert.deepEqual(line.map(c => [c.x, c.y]), [[10, 5], [11, 5], [12, 5], [10, 6]], 'each on the cell asked');
    const guessed = early.$gameFight.character(early.$gameFight.spawn({ record: 'enemy', id: 1, x: 4, y: 12, around: early.$gamePlayer }));
    assert.equal(early.Reactor3D.eventBodyCovers(guessed, 3, 12), false, 'clear of the leader by its guessed body: ' + [guessed.x, guessed.y]);
});

test('a battle page that gathers the followers does not wait for a gather that cannot happen', () => {
    // In a battle the followers are units on their own cells: Gather Followers has nothing to do, and waiting for it would never end.
    const gather = page({ rrFightHook: { on: 'battleStart' }, list: [{ code: 217, indent: 0, parameters: [] }, { code: 121, indent: 0, parameters: [5, 5, 0] }, end] });
    const w = fightWorld({ system: { partyMembers: [1, 2, 3] }, events: [foe(1, 14, 12), event(2, 12, 1, { pages: [page(), gather] })] });
    w.$dataEnemies[1].params = [9000, 0, 1, 5, 5, 5, 10, 5];
    // The followers stand apart, as units do: a gather would have somewhere to walk them.
    w.$gamePlayer.locate(5, 5);
    const apart = w.$gamePlayer.followers().visibleFollowers();
    w.Game_CharacterBase.prototype.locate.call(apart[0], 9, 5);
    w.Game_CharacterBase.prototype.locate.call(apart[1], 5, 9);
    // A gather already under way when the battle starts ends with it.
    w.$gamePlayer.followers().gather();
    w.$gameFight.start({ mode: 'tactical' });
    assert.equal(w.$gamePlayer.followers().areGathering(), false);
    w.run(30);
    assert.equal(w.$gameSwitches.value(5), true, 'the page ran past the gather');
    assert.equal(w.$gamePlayer.followers().areGathering(), false);
    assert.equal(w.$gameFight._hookInterpreter.isRunning(), false);
    w.run(600);
    assert.ok(w.$gameFight.turn() >= 2, 'and the battle goes on');
});

//-----------------------------------------------------------------------------
// A unit asked for by its cell alone: the ground of that cell, whatever it is built of.

/**
 * A field with ground built up on it: a stage of blocks one tile up with no steps, a causeway of boxes rising by
 * low steps to a deck over open ground, a crate, a stall too low to stand under, a stump, a fountain's rim, a
 * bush, and an upper floor over open ground.
 */
const field = () => world3D({
    party: [1, 2],
    pieces: [
        ...[6, 7, 8].flatMap(x => [3, 4, 5].map(y => piece('block', x, y, 0))),          // the stage: top 1
        piece('box', 11, 12, 0, { size: [1, 0.7, 1] }), piece('box', 12, 12, 0, { size: [1, 1.4, 1] }),
        piece('box', 13, 12, 0, { size: [1, 2.1, 1] }), piece('box', 14, 12, 0, { size: [1, 2.8, 1] }),
        piece('box', 15, 12, 3.2, { size: [1, 0.2, 1] }),                                // the deck: top 3.4, open ground under it
        piece('box', 3, 10, 0, { size: [1, 1, 1] }),                                     // a crate
        piece('box', 17, 3, 2.5, { size: [1, 0.3, 1] }),                                 // a stall's roof, too low to stand under
        piece('cylinder', 2, 6, 0, { size: [0.3, 0.4, 0.3] }),                           // a stump: low, and too thin to stand on
        piece('tube', 10, 8, 0, { size: [3.4, 0.7, 3.4], angle: 0, thick: 0.2 }),         // a rim 0.7 high
        ...[14, 15, 16].flatMap(x => [5, 6, 7].map(y => piece('floor', x, y, 5)))        // an upper floor
    ],
    foliage: { bushes: [{ x: 4.5, y: 13.5, size: 2, seed: 1 }] }
});
const near = (a, b, tolerance = 0.02) => Math.abs(a - b) < tolerance;

test('a unit asked for by its cell stands on ground that is built up: a stage, a causeway, a deck a walker reaches', () => {
    const w = field(), F = w.ReactorFight, P = w.ReactorPhysics;
    w.$gamePlayer.locate(18, 13);
    w.run(2);
    // The cell's own ground is not the place on any of these: each is more than a low step over it.
    for (const [x, y] of [[7, 4], [12, 12], [14, 12]]) assert.ok(Number.isNaN(F.standLevel(x, y)), 'not its own ground: ' + [x, y]);
    assert.equal(F.groundLevel(7, 4), 1, 'the stage: blocks are ground, steps or none');
    assert.ok(near(F.groundLevel(11, 12), 0.7) && near(F.groundLevel(14, 12), 2.8), 'the causeway, reached by its low steps: ' + [F.groundLevel(11, 12), F.groundLevel(14, 12)]);
    assert.equal(F.reachedOnFoot(14, 12, P.standingAt(w.$dataMap, 14, 12)), true);
    // With the party on neither level, the deck and not the ground under it: the highest ground a walker reaches.
    w.$gamePlayer.locate(7, 4);
    w.$gamePlayer._reactorGround = 1;
    assert.equal(P.standingAt(w.$dataMap, 15, 12, 0), 0, 'a body can stand under the deck');
    assert.ok(near(F.groundLevel(15, 12), 3.4, 0.1), 'the deck: ' + F.groundLevel(15, 12));
    assert.equal(F.groundLevel(15, 6), 0, 'never an upper floor only stairs lead to');
    // The floor the party is on comes first: the battle is there.
    w.$gamePlayer.locate(18, 13);
    w.$gamePlayer._reactorGround = 0;
    assert.equal(F.groundLevel(15, 12), 0, 'the party on the ground: under the deck');
    w.$gamePlayer.locate(15, 6);
    w.$gamePlayer._reactorGround = 5.1;
    assert.ok(near(F.groundLevel(14, 5), 5.1), 'the party upstairs: the upper floor');
    w.$gamePlayer.locate(18, 13);
    w.$gamePlayer._reactorGround = 0;
    w.run(2);

    // A formation asked for on the stage stands on it, each on the cell asked.
    const fight = w.$gameFight;
    fight.start({ mode: 'tactical' });
    const asked = [[6, 3], [6, 4], [7, 3], [7, 4], [8, 5], [12, 12], [14, 12]], got = [];
    for (const [x, y] of asked) { const c = fight.character(fight.spawn({ record: 'enemy', id: 1, x, y })); got.push([c.x, c.y]); }
    assert.deepEqual(got, asked, 'nobody is thrown off built-up ground');
    assert.equal(fight.character(fight.unitAt(7, 4))._reactorGround, 1);
    assert.ok(near(fight.character(fight.unitAt(14, 12))._reactorGround, 2.8));
    w.run(3);
    assert.equal(fight.character(fight.unitAt(7, 4))._reactorGround, 1, 'and stays on it');
});

test('a unit is never put on the top of something that only stands there, on a rim, a stump or in a bush', () => {
    const w = field(), F = w.ReactorFight, P = w.ReactorPhysics, R = w.Reactor3D;
    w.$gamePlayer.locate(18, 13);
    w.run(2);
    const rim = [];
    for (let y = 5; y <= 11; y++) for (let x = 7; x <= 13; x++) if (P.levelsAt(w.$dataMap, x, y).some(level => level.kind === 'tube' && level.stand)) rim.push([x, y]);
    assert.ok(rim.length >= 4, 'the rim crosses cells: ' + rim.length);
    // The physics lets a body stand on each of these, and a walker reaches the rim: the battle still puts nobody there.
    const tops = [[3, 10, 'a crate'], [17, 3, 'a stall\'s roof'], [rim[0][0], rim[0][1], 'a fountain\'s rim']];
    for (const [x, y, what] of tops) {
        assert.notEqual(P.standingAt(w.$dataMap, x, y), null, what + ': a body can stand there');
        assert.ok(Number.isNaN(F.groundLevel(x, y)), 'nobody is put on ' + what);
    }
    assert.equal(F.reachedOnFoot(rim[0][0], rim[0][1], P.standingAt(w.$dataMap, rim[0][0], rim[0][1])), true, 'the rim is a low step from the ground');
    assert.equal(F.reachedOnFoot(3, 10, 1), false, 'the crate is not');
    // A stump is within a low step of the ground and too thin to stand on; a bush blocks its cells.
    assert.equal(P.levelsAt(w.$dataMap, 2, 6).some(level => level.stand), false);
    assert.ok(Number.isNaN(F.standLevel(2, 6)) && Number.isNaN(F.standLevel(2, 6, 0)), 'not a stump');
    assert.equal(R.bushBlocksCell(w.$dataMap, 4, 13), true);
    assert.ok(Number.isNaN(F.standLevel(4, 13)) && Number.isNaN(F.standLevel(4, 13, 0)) && Number.isNaN(F.groundLevel(4, 13)), 'not in a bush');

    const fight = w.$gameFight;
    fight.start({ mode: 'tactical' });
    for (const [x, y, what] of [...tops, [2, 6, 'a stump'], [4, 13, 'a bush'], [5, 13, 'the bush\'s side']]) {
        const c = fight.character(fight.spawn({ record: 'enemy', id: 1, x, y }));
        assert.notDeepEqual([c.x, c.y], [x, y], 'asked for on ' + what + ', put beside it');
        assert.ok(near(c._reactorGround, 0), 'on the ground: ' + c._reactorGround);
        assert.equal(R.bushBlocksCell(w.$dataMap, c.x, c.y), false);
    }
    // The free cell found beside someone is never one of them either.
    w.$gamePlayer.locate(4, 11);
    w.run(1);
    for (let i = 0; i < 12; i++) {
        const spot = fight.freeSpotNear(4, 11, 1);
        assert.ok(!(spot.x === 3 && spot.y === 10) && !R.bushBlocksCell(w.$dataMap, spot.x, spot.y), 'not the crate, not the bush: ' + JSON.stringify(spot));
        fight.spawn({ record: 'enemy', id: 1, x: spot.x, y: spot.y, height: spot.height });
    }
});

test('a free cell is plain ground before a deck, and never one the tiles close', () => {
    // A low deck (a body stands on it, a low step up) is the first cell the search comes to; the ground next to it is taken instead.
    const w = world3D({ pieces: [piece('box', 9, 6, 0, { size: [1, 0.3, 1] })] });
    w.$gamePlayer.locate(10, 7);
    w.run(2);
    const F = w.ReactorFight, fight = w.$gameFight;
    assert.ok(near(F.standLevel(9, 6, 0), 0.3), 'the deck is a place to stand');
    assert.ok(Number.isNaN(F.standLevel(9, 6, 0, true)), 'but not plain ground');
    assert.deepEqual([fight.freeSpotNear(10, 7, 1).x, fight.freeSpotNear(10, 7, 1).y], [9, 7]);
    // Where no plain ground is level with the one asked from, a deck is: a platform of boxes three tiles up.
    const high = world3D({ pieces: [4, 5, 6].flatMap(x => [2, 3, 4].map(y => piece('box', x, y, 0, { size: [1, 3, 1] }))) });
    high.$gamePlayer.locate(5, 3);
    high.$gamePlayer._reactorGround = 3;
    const up = high.$gameFight.freeSpotNear(5, 3, 1);
    assert.ok(up.x >= 4 && up.x <= 6 && up.y >= 2 && up.y <= 4 && near(up.height, 3, 0.1), 'on the platform: ' + JSON.stringify(up));

    // On a map without 3D a cell whose tile lets nobody in from any side is passed over.
    const flat = fightWorld();
    flat.$dataTilesets[1].flags[1537] = 0x0f;
    flat.$dataMap.data[6 * 20 + 9] = 1537;
    flat.$gamePlayer.locate(10, 7);
    const spot = flat.$gameFight.freeSpotNear(10, 7, 1);
    assert.deepEqual([spot.x, spot.y], [9, 7], 'not the closed cell the search comes to first');
});

test('Spawn Unit next to an event stands the unit on that event\'s floor; a height names the floor on a cell with several', () => {
    const w = yard(), fight = w.$gameFight;
    // The party is on the ground; an event stands upstairs.
    w.$dataMap.events[7] = event(7, 15, 6);
    w.$gameMap._events[7] = new w.Game_Event(1, 7);
    w.$gameMap.event(7)._reactorGround = 5.1;
    w.$gamePlayer.locate(3, 3);
    w.run(2);
    assert.ok(near(w.$gameMap.event(7)._reactorGround, 5.1), 'the event is upstairs');
    fight.start({ mode: 'tactical' });
    const interpreter = new w.Game_Interpreter();
    interpreter.setup([end], 0);
    const spawned = args => { const before = fight._units.length; w.PluginManager.callCommand(interpreter, 'RPGReactor', 'SpawnUnit', args); assert.equal(fight._units.length, before + 1); return fight.character(fight._units[before]); };
    const beside = spawned({ at: 'event', eventId: '7', record: 'enemy', id: '1' });
    assert.ok(beside.x >= 14 && beside.x <= 16 && beside.y >= 5 && beside.y <= 7, 'on the upper floor: ' + [beside.x, beside.y]);
    assert.ok(near(beside._reactorGround, 5.1), 'at its height: ' + beside._reactorGround);
    // By its cell alone it is the ground floor (the party is down there); with a height, the floor named.
    const below = spawned({ at: 'cell', x: '14', y: '7', record: 'enemy', id: '1' });
    assert.deepEqual([below.x, below.y, below._reactorGround], [14, 7, 0]);
    const named = spawned({ at: 'cell', x: '16', y: '7', height: '5.1', record: 'enemy', id: '1' });
    assert.deepEqual([named.x, named.y], [16, 7]);
    assert.ok(near(named._reactorGround, 5.1));
    w.run(3);
    assert.ok(near(beside._reactorGround, 5.1) && near(named._reactorGround, 5.1) && below._reactorGround === 0, 'each stays on its floor');
});

//-----------------------------------------------------------------------------
// The walk back on a map with floors, water and walls.

/** A battle on a 3D map ended by script, the followers put where the test wants them (`[x, y, height]` each). */
function ended3D(w, lead, places) {
    w.$dataEnemies[1].params[0] = 9000;
    w.$dataMap.events[1] = foe(1, 2, 13);
    w.$gameMap._events[1] = new w.Game_Event(1, 1);
    w.$gamePlayer.locate(lead[0], lead[1]);
    w.$gamePlayer.setDirection(2);
    if (lead[2] !== undefined) w.$gamePlayer._reactorGround = lead[2];
    w.run(2);
    w.$gameFight.start({ mode: 'tactical' });
    w.$gameFight._wait = 1e6;
    const followers = w.$gamePlayer.followers(), visible = followers.visibleFollowers();
    places.forEach(([x, y, height], i) => { w.Game_CharacterBase.prototype.locate.call(visible[i], x, y); if (height !== undefined) visible[i]._reactorGround = height; });
    w.run(2);
    w.$gameFight.end(w.ReactorFight.ESCAPE, true);
    w.run(2);
    assert.equal(w.$gameFight.isActive(), false);
    return { followers, visible };
}

test('a follower beside the leader but on another floor is not back: it is put on the leader\'s floor', () => {
    // One cell east of the leader in plan, on the upper floor over open ground: the roof over the next cell, to the leader.
    for (const [label, lead, at] of [['beside', [13, 6], [14, 6, 5.1]], ['on the diagonal', [13, 8], [14, 7, 5.1]]]) {
        const w = yard();
        const { followers, visible } = ended3D(w, lead, [at]);
        settle(w, followers);
        w.run(20);
        const f = visible[0];
        assert.ok(f._reactorGround < 0.2, label + ': on the ground with the leader, not left upstairs: ' + f._reactorGround);
        assert.ok(beside(f, w.$gamePlayer), label + ': beside the leader: ' + cells([f]));
        assert.equal(followers._rrRegroup, null);
    }
    // The other way round: the leader upstairs, the follower far off on the ground. It is put upstairs, and stays there.
    const w = yard();
    const { followers, visible } = ended3D(w, [15, 6, 5.1], [[3, 12]]);
    const f = visible[0];
    assert.ok(beside(f, w.$gamePlayer) && f.x >= 14 && f.x <= 16 && f.y >= 5 && f.y <= 7, 'beside the leader on the upper floor: ' + cells([f]));
    assert.ok(near(f._reactorGround, 5.1), 'at the floor\'s height, on the frame it is put there: ' + f._reactorGround);
    settle(w, followers);
    w.run(20);
    assert.ok(near(f._reactorGround, 5.1), 'and it stays upstairs: ' + f._reactorGround);
    // A follower one stair's step from the leader is in its place: stairs are walked.
    const F = w.ReactorFight;
    assert.equal(F.standsBeside({ x: 15, y: 6, _reactorGround: 5.1 }, { x: 15, y: 5, _reactorGround: 5.1 }), true, 'level, beside');
    assert.equal(F.standsBeside({ x: 13, y: 6, _reactorGround: 0 }, { x: 14, y: 6, _reactorGround: 5.1 }), false, 'the floor over the next cell');
    assert.equal(F.standsBeside({ x: 13, y: 6, _reactorGround: 0 }, { x: 14, y: 6, _reactorGround: 0 }), true, 'under it');
});

test('the party never ends stacked: beside a leader standing in water the followers stand in it too', () => {
    // The yard's pond: water one tile deep over cells 4..7, 10..12. Nobody is put in it from dry land.
    const w = yard(), F = w.ReactorFight;
    const world = world3D({ party: [1, 2, 3], pieces: [], water: [{ x0: 4, y0: 10, x1: 7, y1: 12, level: 1, material: 'Water' }] });
    assert.ok(Number.isNaN(F.standLevel(5, 10, 0)), 'the pond is no place to put somebody');
    const { followers, visible } = ended3D(world, [5, 11, 0], [[17, 2], [16, 13]]);
    settle(world, followers);
    const all = cells([world.$gamePlayer, ...visible]);
    assert.equal(new Set(all).size, all.length, 'each on a cell of its own: ' + all);
    assert.deepEqual([visible[0].x, visible[0].y], [5, 10], 'the first behind the leader, in the water it stands in');
    assert.ok(beside(visible[1], visible[0]), 'the second beside the first: ' + all);
    assert.ok(visible.every(f => near(f._reactorGround, 0)), 'on the pond\'s floor and the bank, the leader\'s level');
    // A leader on dry land beside the pond: nobody is put into the water.
    const dry = world3D({ party: [1, 2, 3], pieces: [], water: [{ x0: 4, y0: 10, x1: 7, y1: 12, level: 1, material: 'Water' }] });
    const bank = ended3D(dry, [5, 13, 0], [[17, 2], [16, 3]]);
    settle(dry, bank.followers);
    const wet = (x, y) => x >= 4 && x <= 7 && y >= 10 && y <= 12;
    assert.ok(bank.visible.every(f => !wet(f.x, f.y)), 'on the bank: ' + cells(bank.visible));
    assert.equal(new Set(cells([dry.$gamePlayer, ...bank.visible])).size, 3);
    // A leader on a mound in the middle of a pond, knee-deep: the water round it is deep, and nobody is put into it.
    const pond = { x0: 4, y0: 9, x1: 8, y1: 13, level: 1, material: 'Water' };
    const islet = world3D({ party: [1, 2], pieces: [piece('box', 6, 11, 0, { size: [1, 0.7, 1] })], water: [pond] });
    const stood = ended3D(islet, [6, 11, 0.7], [[17, 2]]);
    settle(islet, stood.followers);
    const f = stood.visible[0];
    assert.ok(!(f.x >= 4 && f.x <= 8 && f.y >= 9 && f.y <= 13), 'on dry land, the nearest there is: ' + cells([f]));
    assert.ok(near(f._reactorGround, 0) && !f.pos(6, 11), 'not on the leader\'s cell: ' + cells([f]));
});

test('where nobody can stand beside the leader the followers take the nearest standing places round it, never its own cell', () => {
    // The leader on a lone post five tiles up: every cell beside it is a drop. The ground below is the nearest place.
    const w = world3D({ party: [1, 2, 3], pieces: column(10, 7, 5) });
    const { followers, visible } = ended3D(w, [10, 7, 5], [[17, 2], [3, 12]]);
    settle(w, followers);
    const all = cells([w.$gamePlayer, ...visible]);
    assert.equal(new Set(all).size, all.length, 'nobody shares a cell: ' + all);
    for (const f of visible) {
        const d = Math.max(Math.abs(f.x - 10), Math.abs(f.y - 7));
        assert.ok(d >= 1 && d <= w.ReactorFight.REGROUP_AROUND, 'near the post: ' + cells([f]));
        assert.ok(near(f._reactorGround, 0), 'standing on the ground: ' + f._reactorGround);
    }
});

test('a follower is put beside the leader by a step a walker takes: not across a wall', () => {
    // A map without 3D: the cell behind the leader (who faces up) is a wall tile.
    const w = fightWorld({ system: { partyMembers: [1, 2] }, events: [foe(1, 17, 12)] });
    w.$dataTilesets[1].flags[1537] = 0x0f;
    w.$dataMap.data[6 * 20 + 5] = 1537;
    w.$dataEnemies[1].params[0] = 9000;
    w.$gamePlayer.locate(5, 5);
    w.$gamePlayer.setDirection(8);
    w.$gameFight.start({ mode: 'tactical' });
    const f = w.$gamePlayer.followers().visibleFollowers()[0];
    w.Game_CharacterBase.prototype.locate.call(f, 17, 2);
    w.$gameFight.end(w.ReactorFight.ESCAPE, true);
    w.run(2);
    assert.notDeepEqual([f.x, f.y], [5, 6], 'not in the wall behind the leader');
    assert.deepEqual([f.x, f.y], [6, 5], 'at its side');
    // On a 3D map: a wall piece behind the leader, and a corner both of whose sides are walls.
    const walled = world3D({ pieces: [piece('wall', 10, 6, 0), piece('wall', 9, 7, 0), piece('wall', 11, 7, 0)] });
    const F = walled.ReactorFight, lead = { x: 10, y: 7, _reactorGround: 0, direction: () => 8 };
    assert.ok(Number.isNaN(F.besideLands(lead, 0, -1)), 'no step into the wall');
    assert.ok(Number.isNaN(F.besideLands(lead, -1, -1)) && Number.isNaN(F.besideLands(lead, 1, -1)), 'nor round a corner both of whose cells are walls');
    assert.equal(F.besideLands(lead, 0, 1), 0, 'the open cell in front');
    const out = ended3D(walled, [10, 7, 0], [[19, 1]]);
    assert.deepEqual([out.visible[0].x, out.visible[0].y], [10, 8], 'the one open cell beside the leader');
});

test('the walk back never lasts longer than its frames, holds the trailing step meanwhile, and ends at a gather, a transfer or hidden followers', () => {
    const start = () => endedBattle({ place: (w, f) => { w.Game_CharacterBase.prototype.locate.call(f[0], 14, 7); w.Game_CharacterBase.prototype.locate.call(f[1], 8, 13); } });
    // A follower that would never arrive is put in its place when the frames are up.
    {
        const { w, followers } = start();
        const F = w.ReactorFight, step = F.regroupStep, lasts = [];
        F.regroupStep = function(group, follower, lead, index, last) { lasts.push(last); return true; };
        w.run(F.REGROUP_FRAMES + 1);
        assert.equal(followers._rrRegroup, null, 'over after ' + F.REGROUP_FRAMES + ' frames');
        assert.equal(lasts[lasts.length - 1], true, 'the last frame says so, and the follower is placed');
        assert.equal(lasts[0], false);
        F.regroupStep = step;
    }
    // While it lasts no follower takes the trailing step a leader's step gives it: each makes for its own place.
    {
        const { w, followers } = start();
        let chased = 0;
        const chase = w.Game_Follower.prototype.chaseCharacter;
        w.Game_Follower.prototype.chaseCharacter = function() { chased++; return chase.apply(this, arguments); };
        w.run(1);
        assert.ok(followers._rrRegroup);
        w.$gamePlayer.moveStraight(6);
        w.run(4);
        assert.equal(chased, 0, 'no trailing step during the walk back');
        settle(w, followers);
        w.run(20, () => !w.$gamePlayer.isMoving());
        w.$gamePlayer.moveStraight(6);
        assert.ok(chased > 0, 'and after it they trail the leader again');
    }
    // It ends where it stands when an event gathers the followers, when the party is transferred, when followers are hidden.
    for (const [what, act] of [['a gather', (w, followers) => followers.gather()], ['a transfer', w => w.$gamePlayer.reserveTransfer(1, 3, 3, 2, 0)], ['hidden followers', (w, followers) => followers.hide()]]) {
        const { w, followers } = start();
        w.run(2);
        assert.ok(followers._rrRegroup, what + ': under way');
        act(w, followers);
        w.run(1);
        assert.equal(followers._rrRegroup, null, 'ended by ' + what);
        assert.ok(followers._data.every(f => f.isThrough()), 'followers are walked through again');
    }
});

test('a follower still fading in when the next battle starts is whole in it', () => {
    const { w, visible } = endedBattle({ party: [1, 2], place: (w, f) => w.Game_CharacterBase.prototype.locate.call(f[0], 19, 7) });
    w.run(5);
    const far = visible[0];
    assert.ok(far.opacity() < 255 && far._rrFade > 0, 'fading in: ' + far.opacity());
    // An event starts the next battle a few frames after the last (Start Battle on Map, Wait, Start Battle on Map).
    w.$gameFight.start({ mode: 'tactical' });
    assert.deepEqual([far.opacity(), far._rrFade], [255, 0], 'whole when the battle starts');
    w.$gameFight._wait = 1e6;
    w.run(40);
    assert.equal(far.opacity(), 255, 'and through it');
});

//-----------------------------------------------------------------------------
// What the battle knows of the events round it.

test('only the event that waits for this battle counts as waiting for it', () => {
    const w = fightWorld({ events: [foe(1, 8, 8)] });
    w.$dataEnemies[1].params[0] = 9000;
    const serial = w.$gameFight.start({ mode: 'tactical' });
    const interpreter = w.$gameMap._interpreter;
    interpreter.setup([{ code: 230, indent: 0, parameters: [600] }, end], 0);
    assert.equal(w.$gameFight.waitingInterpreter(), null, 'an event doing something else');
    // An event still waiting for an earlier battle's number is not waiting for this one.
    interpreter._waitMode = 'reactorFight';
    interpreter._rrFightSerial = serial - 1;
    assert.equal(w.$gameFight.waitingInterpreter(), null);
    assert.equal(w.$gameFight.isBusy(), true, 'it is an event running on the map, and the battle waits for it');
    interpreter._rrFightSerial = serial;
    assert.equal(w.$gameFight.waitingInterpreter(), interpreter);
});

test('work the battle owes after its result is read runs before the battle is over', () => {
    // A common event with a wait in it, reserved while the victory text is up: the waiting event goes on only after it.
    const w = noPictures(fightWorld({ system: { reactorBattle: { mode: 'tactical' } }, events: [starter(1, battleProcessing(1))] }));
    w.$dataCommonEvents[1] = { id: 1, name: 'Late', trigger: 0, switchId: 0, list: [{ code: 230, indent: 0, parameters: [10] }, { code: 122, indent: 0, parameters: [2, 2, 1, 0, 1] }, end] };
    w.run(6000, () => !!(w.$gameFight._ending && w.$gameFight._ending.shown));
    assert.ok(w.$gameFight.isActive() && w.$gameFight._ending.shown, 'the result is up');
    w.$gameTemp.reserveCommonEvent(1);
    w.run(200, () => w.$gameVariables.value(2) === 1);
    assert.equal(w.$gameVariables.value(2), 1, 'the common event ran');
    assert.equal(outcome(w), 0, 'before the event that waits for the battle went on');
    w.run(20, done(w));
    assert.equal(outcome(w), 1);
    assert.equal(w.$gameFight._tail, null);
});

test('arriving on the map of a battle that was kept, the followers come with the leader', () => {
    const w = fightWorld({ system: { partyMembers: [1, 2, 3] }, events: [foe(1, 8, 8)] });
    w.$dataEnemies[1].params[0] = 9000;
    w.$gamePlayer.locate(4, 4);
    w.$gameFight.start({ mode: 'tactical', onTransfer: 'keep' });
    w.$gameFight._wait = 1e6;
    const [a, b] = w.$gamePlayer.followers().visibleFollowers();
    w.Game_CharacterBase.prototype.locate.call(a, 12, 3);
    w.Game_CharacterBase.prototype.locate.call(b, 3, 12);
    // The party left for another map and comes back: it arrives together.
    w.$gameMap._mapId = 2;
    assert.equal(w.$gameFight.isHere(), false);
    w.$gamePlayer.reserveTransfer(1, 6, 9, 2, 0);
    w.$gamePlayer.performTransfer();
    assert.equal(w.$gameFight.isActive() && w.$gameFight.isHere(), true, 'the battle is here again');
    assert.deepEqual(cells([w.$gamePlayer, a, b]), ['6,9', '6,9', '6,9']);
    // Put somewhere on that map by a battle page, the leader goes alone.
    w.Game_CharacterBase.prototype.locate.call(a, 12, 3);
    w.$gamePlayer.reserveTransfer(1, 2, 2, 2, 0);
    w.$gamePlayer.performTransfer();
    assert.deepEqual(cells([w.$gamePlayer, a]), ['2,2', '12,3']);
});

test('the menu opens while the only event running is one waiting for the battle, however deep it waits', () => {
    // The scene's rule, as shipped, over a scene that has the stock one.
    const caller = starter(1, [{ code: 117, indent: 0, parameters: [2] }, { code: 123, indent: 0, parameters: ['A', 0] }, end]);
    const w = fightWorld({ system: { reactorBattle: { mode: 'tactical' } }, events: [caller] });
    w.$dataCommonEvents[2] = { id: 2, name: 'Fight', trigger: 0, switchId: 0, list: battleProcessing(1).filter(c => c.code !== 123) };
    w.$dataEnemies[1].params[0] = 9000;
    vm.runInContext(`Scene_Map = function Scene_Map() {};
        Scene_Map.prototype.onMapLoaded = function() {};
        Scene_Map.prototype.checkGameover = function() {};
        Scene_Map.prototype.isMenuEnabled = function() { return $gameSystem.isMenuEnabled() && !$gameMap.isEventRunning(); };`, w);
    const fight = read('runtime/reactor_fight.js');
    const from = fight.indexOf('if (typeof Scene_Map !== "undefined") {'), to = fight.indexOf('// Battle Processing in an on-map mode fights here', from);
    assert.ok(from > 0 && to > from);
    vm.runInContext(`(function(F) {${fight.slice(from, to)}})(ReactorFight);`, w);
    const scene = new w.Scene_Map();
    w.run(30);
    assert.ok(w.$gameFight.isActive() && w.$gameMap.isEventRunning());
    assert.equal(w.$gameMap._interpreter._waitMode, '', 'the event itself only called a common event');
    assert.equal(scene.isMenuEnabled(), true, 'the menu opens in the battle');
    // An event that does something else keeps the menu shut, as on any map.
    w.$gameFight.waitingInterpreter()._waitMode = '';
    assert.equal(scene.isMenuEnabled(), false);
});
