'use strict';
// How a battle on the map begins and who is in it (runtime/reactor_fight_flow.js, and the mode, the units and the
// commands of runtime/reactor_fight.js):
// - the mode: its order, the map's Note tag in any letter case and before the sidecar, the mode in force;
// - a map starts its battle by itself: no tag is 6 tiles, a map whose events start battles waits, `0`, `open`, a
//   number; a straight line and a sight line; each thing that holds the start; nothing starts with nobody to
//   fight; the hold after a battle, which is against the units that were in it and belongs to its map; on a
//   Classic map the battle screen against the enemy rows;
// - one rule says who is in a battle, at its start and while it runs: who joins, who a command names, the win
//   judged after one more look;
// - one answer to "is this event a unit now";
// - one battle at a time: a command reached while a battle runs joins it;
// - the launch line of Play this battle, read in a playtest only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');
const BattleCheck = require('../src/utils/BattleCheck.js');

const runtimeRoot = path.resolve(__dirname, '..', '..', 'runtime');
const source = name => fs.readFileSync(path.join(runtimeRoot, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
/** An enemy row, as Battle Setup makes one: `rrUnit` on the event. */
const row = (id, x, y, enemyId = 1, extra = {}) => event(id, x, y, Object.assign({ rrUnit: { team: 'enemy', record: 'enemy', id: enemyId } }, extra));
const behind = switchId => page({ conditions: Object.assign(page().conditions, { switch1Valid: true, switch1Id: switchId }) });
const reactor = (name, args, indent = 0) => ({ code: 357, indent, parameters: ['RPGReactor', name, name, args] });
const end = { code: 0, indent: 0, parameters: [] };
const once = { code: 123, indent: 0, parameters: ['A', 0] };
const off = () => page({ conditions: Object.assign(page().conditions, { selfSwitchValid: true, selfSwitchCh: 'A' }) });
/** An autorun event in the far corner that runs `list` once. */
const starter = (id, list) => event(id, 19, 14, { pages: [page({ trigger: 3, priorityType: 0, list: list.concat([once, end]) }), off()] });
const on = (id, indent = 1) => ({ code: 121, indent, parameters: [id, id, 0] });
/** If Win / If Escape / If Lose rows that turn switches 1 / 2 / 3 on, then switch 4. */
const branches = () => [{ code: 601, indent: 0, parameters: [] }, on(1), { code: 0, indent: 1, parameters: [] }, { code: 602, indent: 0, parameters: [] }, on(2), { code: 0, indent: 1, parameters: [] },
    { code: 603, indent: 0, parameters: [] }, on(3), { code: 0, indent: 1, parameters: [] }, { code: 604, indent: 0, parameters: [] }, on(4, 0)];
const switches = w => [1, 2, 3, 4].filter(id => w.$gameSwitches.value(id));

/** A world with the Tactical grid (sight) whose game fights in `mode`. */
const world = (mode, options = {}) => fightWorld(Object.assign({ tactical: true, system: mode && mode !== 'classic' ? { reactorBattle: { mode } } : {} }, options));
/** The same with the battle screen's file loaded as the game boots it. */
const classicWorld = (options = {}) => world('classic', Object.assign({ classic: true, prepare: ctx => vm.runInContext('Scene_Battle.prototype.terminate = function() {};', ctx) }, options));
/** The next beat (every twelfth frame), played. */
const beat = w => { w.Graphics.frameCount = (Math.floor(w.Graphics.frameCount / 12) + 1) * 12; w.run(1); };
/** A frame that is no beat. */
const offBeat = w => { w.Graphics.frameCount = Math.floor(w.Graphics.frameCount / 12) * 12 + 5; w.run(1); };
/** The leader put on a tile with the followers (set-up). */
const put = (w, x, y) => vm.runInContext(`$gamePlayer.locate(${x}, ${y}); $gamePlayer.followers().synchronize(${x}, ${y}, 2);`, w);
/** A wall: a tile nobody walks onto or sees through. */
const wall = (w, x, y, flag = 0x60F) => { w.$dataTilesets[1].flags[1537 + flag] = flag; w.$dataMap.data[y * 20 + x] = 1537 + flag; };
/** The party arrives on another map: this floor and these events under another id, with a note of its own. */
const arrive = (w, mapId, note, x, y) => {
    w.$dataMap = Object.assign({}, w.$dataMap, { note });
    vm.runInContext(`$gameMap.setup(${mapId}); $gamePlayer.locate(${x}, ${y}); $gamePlayer.followers().synchronize(${x}, ${y}, 2);`, w);
};
const inBattle = w => Array.from(w.$gameFight._units).filter(u => u.eventId && !u.gone).map(u => u.eventId).sort((a, b) => a - b);
const hold = w => [!!w.$gameFight._triggerHeld, w.$gameFight._triggerHeldMap || 0];
/** The unit events the hold is against. */
const heldUnits = w => plain(w.$gameFight._triggerHeldIds || []).sort((a, b) => a - b);
/** An enemy of the battle falls (set-up): its battler is killed and the battle judges the blow. */
const kill = (w, eventId) => { const u = w.$gameFight.unitOfEvent(eventId); u.enemy.setHp(0); w.$gameFight.defeat(u); w.$gameFight.checkOutcome(); };
/** The battle screen's own calls recorded, and nothing opened. */
const recordScreen = w => {
    const calls = [];
    w.ReactorFight.Classic.start = (rows, options) => { calls.push({ rows: rows ? Array.from(rows, e => (typeof e === 'number' ? e : e.eventId())) : null, options: Object.assign({}, options, options && options.onResult ? { onResult: 'function' } : {}) }); return 0; };
    return calls;
};

//-----------------------------------------------------------------------------
// 2.1 The mode.

test('the mode: the next battle, the troop, a command for this map, the map\'s own, a command for the game, System, Classic; a named classic counts', () => {
    const w = world('classic'), F = w.ReactorFight;
    assert.equal(F.resolveMode(1), 'classic');
    assert.equal(F.modeInForce(), 'classic');
    w.$dataSystem.reactorBattle = { mode: 'action' };
    assert.equal(F.resolveMode(1), 'action', 'System');
    F.changeMode('firstPerson', 'game');
    assert.equal(F.resolveMode(1), 'firstPerson', 'a command for the game beats System');
    w.$dataMap.note = '<battle mode: tactical>';
    assert.equal(F.resolveMode(1), 'tactical', 'the map beats the game');
    F.changeMode('action', 'map');
    assert.equal(F.resolveMode(1), 'action', 'a command for this map beats the map\'s own');
    assert.equal(F.resolveMode(2), 'tactical', 'the troop (troop 2 fights Tactical) beats the map');
    F.changeMode('classic', 'next');
    assert.equal(F.resolveMode(2), 'classic', 'the next battle beats the troop, and a named classic names a mode');
    // The mode in force: no troop, no next-battle setting.
    assert.equal(F.modeInForce(), 'action', 'the command for this map');
    F.changeMode('default', 'map');
    assert.equal(F.modeInForce(), 'tactical', 'the map\'s own');
    w.$dataMap.note = '<battle mode: classic>';
    assert.equal(F.modeInForce(), 'classic', 'a map that names Classic in a game that fights on the map');
    w.$dataMap.note = '';
    assert.equal(F.modeInForce(), 'firstPerson', 'the command for the game');
    F.changeMode('default', 'game');
    assert.equal(F.modeInForce(), 'action', 'System');
});

test('the map\'s own mode is its Note tag, in any letter case, before the sidecar; a tag that names no mode names none', () => {
    const F = world('classic').ReactorFight;
    const mode = (note, sidecar) => F.mapMode(Object.assign({ note }, sidecar ? { reactor3d: { battle: sidecar } } : {}));
    assert.equal(mode('<battle mode: tactical>'), 'tactical');
    assert.equal(mode('<battle mode: firstperson>'), 'firstPerson', 'firstperson is First Person');
    assert.equal(mode('<Battle Mode: FIRSTPERSON>'), 'firstPerson');
    assert.equal(mode('<battle mode: Tactical>'), 'tactical');
    assert.equal(mode('<3d>\n<battle  mode :  ACTION >\nA square.'), 'action');
    assert.equal(mode('<battle mode: classic>'), 'classic');
    assert.equal(mode(''), '');
    assert.equal(mode(null), '');
    assert.equal(F.mapMode(null), '');
    assert.equal(mode('<battle mode: action>', { mode: 'tactical' }), 'action', 'the Note before the sidecar');
    assert.equal(mode('', { mode: 'tactical' }), 'tactical', 'the sidecar where the Note has no tag');
    assert.equal(mode('<battle mode: retreat>', { mode: 'tactical' }), '', 'a tag that names no mode names none, and the sidecar is not asked');
    assert.equal(mode('<battle mode: Tactical>\n<battle mode: action>'), 'tactical', 'the first tag');
    assert.equal(mode('', { mode: 'Tactical' }), '', 'the sidecar is data: its own spelling only');
    // A changed Note or sidecar is read again (the answer is kept per map).
    const map = { note: '<battle mode: action>' };
    assert.equal(F.mapMode(map), 'action');
    map.note = '';
    assert.equal(F.mapMode(map), '');
    map.reactor3d = { battle: { mode: 'firstPerson' } };
    assert.equal(F.mapMode(map), 'firstPerson');
    assert.equal(F.modeNamed(' FirstPerson '), 'firstPerson');
    assert.equal(F.modeNamed('retreat'), '');
});

test('the game and the editor read a map\'s mode and start alike: every value, on a 2D and a 3D map', () => {
    const F = world('classic').ReactorFight;
    const start = reactor('StartMapBattle', { mode: 'tactical' });
    const withStarter = [null, event(1, 3, 3, { pages: [page({ list: [start, end] })] })];
    const notes = ['', '<battle trigger: 6>', '<battle trigger: 1>', '<battle trigger: 50>', '<battle trigger: 51>', '<battle trigger: 0>', '<battle trigger: open>', '<Battle Trigger : OPEN >',
        '<battle trigger: 4.5>', '<battle trigger: near>', '<battle trigger: -3>', '<battle trigger: 9>\n<battle trigger: 3>', '<battle lose: continue>', '<battle lose: Continue>\n<battle trigger: 12>',
        '<battle lose: gameover>', '<battle mode: firstperson>\n<battle trigger: open>', '<battle mode: TACTICAL>', '<battle mode: sideways>', 'A quiet square.'];
    const sidecars = [undefined, { battle: {} }, { battle: { trigger: 4, mode: 'action' } }, { battle: { trigger: 0 } }, { battle: { trigger: 'open', mode: 'classic' } }, { battle: { trigger: 4.7 } }, { battle: { trigger: 99 } }];
    let compared = 0;
    for (const deep of [false, true]) for (const note of notes) for (const reactor3d of sidecars) for (const events of [[null], withStarter]) {
        const map = { note: (deep ? '<3d>\n' : '') + note, events, width: 20, height: 15 };
        if (reactor3d) map.reactor3d = reactor3d;
        const said = JSON.stringify({ note: map.note, reactor3d });
        const game = F.mapStart(map), editor = BattleCheck.startOf(map);
        assert.deepEqual({ kind: game.kind, tiles: game.tiles, lose: game.lose, from: game.from }, { kind: editor.kind, tiles: editor.tiles, lose: editor.lose, from: editor.from }, `${said}: the start`);
        assert.equal(F.triggerRange(map), editor.kind === 'near' ? editor.tiles : 0, `${said}: the distance at which the map starts by itself`);
        const mode = BattleCheck.modeOf(map, { system: {} });
        assert.equal(F.mapMode(map), mode.from === 'map' ? mode.mode : '', `${said}: the map's own mode`);
        compared++;
    }
    assert.ok(compared > 500);
    assert.equal(F.START_DISTANCE, BattleCheck.DISTANCE);
    assert.equal(F.START_MAX, BattleCheck.DISTANCE_MAX);
});

//-----------------------------------------------------------------------------
// 2.2, 2.12 What the map stores, and the start it gives.

test('what a Note says of the start: no tag is 6 tiles, a map whose events start battles waits, 0 never, open, a number from 1 to 50', () => {
    const F = world('classic').ReactorFight;
    const start = (note, extra = {}) => plain(F.mapStart(Object.assign({ note, events: [null] }, extra)));
    assert.deepEqual(start(''), { kind: 'near', tiles: 6, lose: 'gameover', from: 'default' });
    assert.deepEqual(start('<3d>'), { kind: 'near', tiles: 6, lose: 'gameover', from: 'default' }, 'a 3D map the same');
    assert.deepEqual(start('<battle trigger: 9>'), { kind: 'near', tiles: 9, lose: 'gameover', from: 'tag' });
    assert.deepEqual(start('<3d>\n<battle trigger: 9>'), { kind: 'near', tiles: 9, lose: 'gameover', from: 'tag' });
    assert.deepEqual(start('<battle trigger: 0>'), { kind: 'event', tiles: 6, lose: 'gameover', from: 'tag' }, 'never by itself; a battle there takes units 6 tiles round the party');
    assert.deepEqual(start('<battle trigger: open>'), { kind: 'open', tiles: 6, lose: 'gameover', from: 'tag' });
    assert.deepEqual(start('<battle trigger: 50>').tiles, 50);
    assert.deepEqual(start('<battle trigger: 51>'), { kind: 'near', tiles: 6, lose: 'gameover', from: 'default' }, 'past 50 is no distance: as with no tag');
    assert.deepEqual(start('<battle trigger: soon>'), { kind: 'near', tiles: 6, lose: 'gameover', from: 'default' });
    assert.deepEqual(start('<battle lose: continue>'), { kind: 'near', tiles: 6, lose: 'continue', from: 'default' });
    // No tag, and an event of the map has a Start Battle on Map command on any page: the map waits for its events.
    const scripted = [null, event(1, 3, 3), event(2, 4, 4, { pages: [page(), page({ list: [{ code: 101, indent: 0, parameters: [] }, reactor('StartMapBattle', {}), end] })] })];
    assert.deepEqual(start('', { events: scripted }), { kind: 'event', tiles: 6, lose: 'gameover', from: 'events' });
    assert.deepEqual(start('<battle trigger: 7>', { events: scripted }), { kind: 'near', tiles: 7, lose: 'gameover', from: 'tag' }, 'a tag says so itself');
    assert.equal(F.mapHasStarter({ events: [null, event(1, 3, 3, { pages: [page({ list: [{ code: 357, indent: 0, parameters: ['Other', 'StartMapBattle', '', {}] }, reactor('SpawnUnit', {}), end] })] })] }), false, 'another plugin\'s command, another command');
    // The sidecar only where the Note has no tag.
    assert.deepEqual(start('', { reactor3d: { battle: { trigger: 4 } } }), { kind: 'near', tiles: 4, lose: 'gameover', from: 'sidecar' });
    assert.deepEqual(start('<battle trigger: 9>', { reactor3d: { battle: { trigger: 4 } } }).tiles, 9, 'the Note beats the sidecar');
    assert.deepEqual(start('<battle trigger: 0>', { reactor3d: { battle: { trigger: 4 } } }).kind, 'event');
    assert.equal(F.triggerRange({ note: '<battle trigger: 0>' }), 0);
    assert.equal(F.triggerRange({ note: '<battle trigger: open>' }), 0);
    assert.equal(F.triggerRange({ note: '' }), 6);
    assert.equal(F.triggerRange(null), 0);
    // The events are read once for a map; its Note again when it changes.
    const map = { note: '', events: scripted };
    let scans = 0;
    const scan = F.mapHasStarter;
    F.mapHasStarter = data => { scans++; return scan(data); };
    assert.equal(F.mapStart(map).kind, 'event');
    map.note = '<battle trigger: 3>';
    assert.equal(F.mapStart(map).tiles, 3);
    map.note = '';
    assert.equal(F.mapStart(map).kind, 'event');
    assert.equal(F.mapStart(map), F.mapStart(map), 'the same record while nothing changes');
    assert.equal(scans, 1);
});

test('a map with no tag starts its battle when the leader comes within 6 tiles of an enemy it sees: a straight line, judged on the beat and on a new tile', () => {
    const w = world('tactical', { events: [row(1, 9, 2)] });
    const fight = w.$gameFight;
    beat(w);
    assert.equal(fight.isActive(), false, '7 tiles off');
    put(w, 3, 2);
    offBeat(w);
    assert.equal(fight.isActive(), true, 'the frame the leader stands on the seventh tile from it, without waiting for the beat');
    assert.equal(fight.mode(), 'tactical', 'in the mode in force');
    assert.deepEqual(plain(fight.objective()), { type: 'defeatAll' });
    assert.deepEqual([fight._options.canEscape, fight._options.canLose], [true, false], 'it can be escaped and cannot be lost');
    // A circle, as the editor draws it: 4 across and 4 down is inside 6, 5 across and 4 down is outside.
    const inside = world('action', { events: [row(1, 10, 10)] });
    put(inside, 6, 6);
    beat(inside);
    assert.equal(inside.$gameFight.isActive(), true, '4 across and 4 down');
    assert.equal(inside.$gameFight.mode(), 'action');
    const outside = world('action', { events: [row(1, 10, 10)] });
    put(outside, 5, 6);
    beat(outside);
    assert.equal(outside.$gameFight.isActive(), false, '5 across and 4 down');
    // An enemy that walks into reach of a leader standing still is found on the beat, not before.
    const walker = world('tactical', { events: [row(1, 12, 2)] });
    beat(walker);
    walker.$gameMap.event(1).locate(8, 2);
    offBeat(walker);
    assert.equal(walker.$gameFight.isActive(), false, 'between beats nothing is looked at');
    beat(walker);
    assert.equal(walker.$gameFight.isActive(), true);
    // A sight line: in reach behind a wall starts nothing.
    const hidden = world('tactical', { events: [row(1, 9, 2)] });
    wall(hidden, 7, 2);
    put(hidden, 5, 2);
    beat(hidden);
    assert.equal(hidden.$gameFight.isActive(), false, 'in reach but behind a wall');
    put(hidden, 5, 4);
    beat(hidden);
    assert.equal(hidden.$gameFight.isActive(), true, 'round the wall it is seen');
});

test('the tag sets the distance, 0 switches the start off, and a map whose events start battles waits for them', () => {
    const near = world('tactical', { events: [row(1, 9, 2)], mapNote: '<battle trigger: 4>' });
    put(near, 4, 2);
    beat(near);
    assert.equal(near.$gameFight.isActive(), false, '5 tiles off on a map that says 4');
    put(near, 5, 2);
    beat(near);
    assert.equal(near.$gameFight.isActive(), true);
    const far = world('tactical', { events: [row(1, 16, 2)], mapNote: '<3d>\n<battle trigger: 14>' });
    beat(far);
    assert.equal(far.$gameFight.isActive(), true, '14 tiles on a 3D map\'s Note');
    const never = world('tactical', { events: [row(1, 4, 2)], mapNote: '<battle trigger: 0>' });
    beat(never); beat(never);
    assert.equal(never.$gameFight.isActive(), false, '0: an event says so');
    // No tag, and an event with Start Battle on Map that has not run: nothing starts by itself.
    const talk = event(5, 15, 12, { pages: [page({ list: [reactor('StartMapBattle', { mode: 'tactical' }), end] })] });
    const waits = world('tactical', { events: [row(1, 4, 2), talk] });
    beat(waits); beat(waits);
    assert.equal(waits.$gameFight.isActive(), false, 'the map waits for its events');
    // The sidecar alone still asks.
    const side = world('tactical', { events: [row(1, 6, 2)], mapSidecar: { battle: { trigger: 5 } } });
    beat(side);
    assert.equal(side.$gameFight.isActive(), true);
});

test('only an enemy unit that is on the map starts a battle: not one with no page met, an erased one, an ally, a bystander or an enemy a command turned', () => {
    const hiddenRow = row(1, 4, 2, 1, { pages: [behind(5)] });
    const w = world('tactical', { events: [hiddenRow, unit(2, 3, 4, 'ally 3'), unit(3, 4, 4, 'neutral')] });
    beat(w); beat(w);
    assert.equal(w.$gameFight.isActive(), false, 'the enemy\'s only page needs a switch; an ally and a bystander start nothing');
    w.$gameSwitches.setValue(5, true);
    w.run(1);
    beat(w);
    assert.equal(w.$gameFight.isActive(), true, 'the switch is on: it stands on the map');
    assert.deepEqual(inBattle(w), [1, 2, 3], 'and the battle takes every unit the rule takes, of any side');
    // An erased enemy.
    const erased = world('tactical', { events: [row(1, 4, 2)] });
    erased.$gameMap.event(1).erase();
    beat(erased);
    assert.equal(erased.$gameFight.isActive(), false);
    // An enemy a command turned into an ally starts nothing; an ally turned enemy does.
    const turned = world('tactical', { events: [row(1, 4, 2)] });
    turned.$gameFight.setEventSide(1, 'ally');
    beat(turned);
    assert.equal(turned.$gameFight.isActive(), false);
    turned.$gameFight.setEventSide(1, '');
    beat(turned);
    assert.equal(turned.$gameFight.isActive(), true, 'back on its own side');
    const foe = world('tactical', { events: [unit(1, 4, 2, 'ally 3')] });
    beat(foe);
    assert.equal(foe.$gameFight.isActive(), false);
    foe.$gameFight.setEventSide(1, 'enemy');
    beat(foe);
    assert.equal(foe.$gameFight.isActive(), true);
    // A tag unit and a comment unit on the page shown start one as a row does (on a map that fights on the map).
    const comment = event(1, 4, 2, { pages: [page({ list: [{ code: 108, indent: 0, parameters: ['<unit: enemy 2>'] }, end] })] });
    const tagged = world('action', { events: [comment] });
    beat(tagged);
    assert.equal(tagged.$gameFight.isActive(), true);
});

test('a battle starts only against an enemy that is one now: a unit that left the map or changed sides since the last count starts nothing, and the map\'s own battle never starts with nobody to fight', () => {
    // The map's units are counted on the beat. A step between two beats asks those in reach whether they are enemies still.
    for (const mode of ['tactical', 'action', 'firstPerson']) {
        const w = world(mode, { events: [row(1, 12, 2, 1, { pages: [behind(5)] })] });
        vm.runInContext('$gameSwitches.setValue(5, true); $gameMap.refresh();', w);
        beat(w); offBeat(w);
        assert.equal(w.ReactorFight.unitEvents().count, 1, 'counted: an enemy 10 tiles off');
        vm.runInContext('$gameSwitches.setValue(5, false); $gameMap.refresh();', w);
        let lines = 0;
        const sees = w.ReactorFight.sees;
        w.ReactorFight.sees = (from, to) => { lines++; return sees(from, to); };
        put(w, 7, 2);
        offBeat(w);
        assert.equal(w.$gameFight.isActive(), false, `${mode}: its page went off between two beats, then the leader stepped to 5 tiles from where it stood`);
        assert.equal(w.$gameFight.serial(), 0, `${mode}: no battle at all`);
        assert.equal(lines, 0, `${mode}: and no sight line is asked for one that is no unit`);
        beat(w); beat(w);
        assert.equal(w.$gameFight.serial(), 0);
        // It comes back: the battle starts.
        vm.runInContext('$gameSwitches.setValue(5, true); $gameMap.refresh();', w);
        beat(w);
        assert.equal(w.$gameFight.isActive(), true, `${mode}: back on the map, it starts its battle`);
    }
    // An enemy a command made an ally between two beats.
    const turned = world('tactical', { events: [row(1, 12, 2)] });
    beat(turned); offBeat(turned);
    turned.$gameFight.setEventSide(1, 'ally');
    put(turned, 7, 2);
    offBeat(turned);
    assert.equal(turned.$gameFight.serial(), 0, 'no battle of the party and one ally');
    // One erased between two beats.
    const erased = world('action', { events: [row(1, 12, 2)] });
    beat(erased); offBeat(erased);
    erased.$gameMap.event(1).erase();
    put(erased, 7, 2);
    offBeat(erased);
    assert.equal(erased.$gameFight.serial(), 0);
    // An "open" map whose only enemy left while a message held the start.
    const opened = world('tactical', { events: [row(1, 18, 12, 1, { pages: [behind(5)] })], mapNote: '<battle trigger: open>' });
    vm.runInContext('$gameSwitches.setValue(5, true); $gameMap.refresh();', opened);
    opened.$gameMessage.add('Welcome.');
    opened.Graphics.frameCount = 12;
    opened.$gameMap.update(true);
    assert.equal(opened.$gameFight.isActive(), false, 'the message holds it');
    opened.$gameMessage.clear();
    vm.runInContext('$gameSwitches.setValue(5, false); $gameMap.refresh();', opened);
    put(opened, 3, 2);
    offBeat(opened);
    assert.equal(opened.$gameFight.serial(), 0, 'nobody on the map any more: nothing opens');
    assert.ok(!opened.$gameFight._openedMap, 'and the visit is not used up');
    // The battle the map starts refuses by itself where the rule takes no enemy (2.2: it would be won the moment it began).
    const lone = world('action', { events: [unit(1, 4, 2, 'ally 3'), row(2, 18, 12)], mapNote: '<battle trigger: 0>' });
    const F = lone.ReactorFight, start = F.mapStart(lone.$dataMap);
    assert.equal(F.startOwn(lone.$gameFight, start, 'action', 'near', null), false, 'the only enemy is across the map: the rule takes none');
    assert.deepEqual([lone.$gameFight.isActive(), lone.$gameFight.serial(), !!lone.$gameFight._triggerHeld], [false, 0, false]);
    assert.equal(F.startOwn(lone.$gameFight, start, 'action', 'map', null), true, 'the whole map has one');
    assert.deepEqual(inBattle(lone), [1, 2]);
    const friends = world('tactical', { events: [unit(1, 4, 2, 'ally 3'), unit(2, 5, 3, 'neutral')], mapNote: '<battle trigger: 0>' });
    const G = friends.ReactorFight;
    assert.equal(G.startOwn(friends.$gameFight, G.mapStart(friends.$dataMap), 'tactical', 'map', null), false, 'a map of allies and bystanders');
    assert.equal(G.startOwn(friends.$gameFight, G.mapStart(friends.$dataMap), 'tactical', 'near', null), false);
    assert.equal(friends.$gameFight.serial(), 0);
});

test('what holds the start: an event, a message, a transfer, a vehicle, the air, water, a route, encounters off, walking through walls, a battle, a touch screen', () => {
    const w = world('action', { events: [row(1, 4, 2)] });
    const F = w.ReactorFight, player = w.$gamePlayer;
    const held = mode => F.startHeld(mode || 'action');
    assert.equal(held(), '');
    w.$gameMap._interpreter.setup([{ code: 230, indent: 0, parameters: [600] }, end], 0);
    assert.equal(held(), 'event', 'an event is running');
    w.$gameMap._interpreter.clear();
    w.$gameMap.event(1)._starting = true;
    assert.equal(held(), 'event', 'an event is about to start');
    w.$gameMap.event(1)._starting = false;
    w.$gameTemp.reserveCommonEvent(1);
    assert.equal(held(), 'event', 'a common event is reserved');
    w.$gameTemp.clearCommonEventReservation();
    w.$gameMessage.add('A line.');
    assert.equal(held(), 'message');
    w.$gameMessage.clear();
    player.reserveTransfer(2, 3, 3, 2, 0);
    assert.equal(held(), 'transfer');
    player.clearTransferInfo();
    player._vehicleType = 'boat';
    assert.equal(held(), 'vehicle');
    player._vehicleType = 'walk';
    player._jumpCount = 5;
    assert.equal(held(), 'air', 'a jump');
    player._jumpCount = 0;
    w.ReactorPhysics = { isAirborne: who => who === player, isSwimming: () => false };
    assert.equal(held(), 'air', 'a fall or a hop of the 3D world');
    w.ReactorPhysics = { isAirborne: () => false, isSwimming: who => who === player };
    assert.equal(held(), 'swimming');
    delete w.ReactorPhysics;
    player._moveRouteForcing = true;
    assert.equal(held(), 'route');
    player._moveRouteForcing = false;
    w.$gameSystem.disableEncounter();
    assert.equal(held(), 'encounters', 'Change Encounter: off');
    w.$gameSystem.enableEncounter();
    w.$gameTemp._isPlaytest = true;
    w.Input.isPressed = name => name === 'control';
    assert.equal(held(), 'through', 'the tester walks through walls');
    w.Input.isPressed = () => false;
    w.$gameParty._inBattle = true;
    assert.equal(held(), 'battle', 'the battle screen');
    w.$gameParty._inBattle = false;
    w.SceneManager.isSceneChanging = () => true;
    assert.equal(held(), 'scene');
    w.SceneManager.isSceneChanging = () => false;
    w.SceneManager._scene = { isFading: () => true };
    assert.equal(held(), 'scene', 'the map is still fading in: the player sees it before a battle begins on it');
    w.SceneManager._scene = { isFading: () => false };
    assert.equal(held(), '');
    w.SceneManager._scene = null;
    // A touch screen: no Action or First Person battle by itself; Tactical and the battle screen are not held.
    w.ReactorControls.device = () => 'touch';
    assert.equal(held('action'), 'touch');
    assert.equal(held('firstPerson'), 'touch');
    assert.equal(held('tactical'), '');
    assert.equal(held('classic'), '');
    beat(w); beat(w);
    assert.equal(w.$gameFight.isActive(), false, 'held while the last input was a touch');
    w.ReactorControls.device = () => 'keys';
    assert.equal(held(), '');
    // Each of them really keeps the battle from starting, and it starts once nothing holds it.
    for (const [name, hold, free] of [
        ['a message', () => w.$gameMessage.add('A line.'), () => w.$gameMessage.clear()],
        ['a route', () => { player._moveRouteForcing = true; }, () => { player._moveRouteForcing = false; }],
        ['encounters off', () => w.$gameSystem.disableEncounter(), () => w.$gameSystem.enableEncounter()],
        ['a vehicle', () => { player._vehicleType = 'ship'; }, () => { player._vehicleType = 'walk'; }]]) {
        hold();
        w.Graphics.frameCount += 12 - (w.Graphics.frameCount % 12);
        w.$gameMap.update(true);
        assert.equal(w.$gameFight.isActive(), false, name);
        free();
    }
    beat(w);
    assert.equal(w.$gameFight.isActive(), true, 'nothing holds it: it starts');
    assert.equal(F.startHeld('action'), 'battle', 'and a battle that runs holds the next');
    // A Tactical map is not held by a touch.
    const touch = world('tactical', { events: [row(1, 4, 2)] });
    touch.ReactorControls.device = () => 'touch';
    beat(touch);
    assert.equal(touch.$gameFight.isActive(), true);
});

test('a start held for a moment (the map fading in, a hop) begins the frame it is let go; any other hold is asked again on the beat', () => {
    const w = world('tactical', { events: [row(1, 4, 2)] });
    let fading = true;
    w.SceneManager._scene = { isFading: () => fading };
    beat(w);
    offBeat(w);
    assert.equal(w.$gameFight.isActive(), false, 'the map is fading in');
    fading = false;
    w.Graphics.frameCount++;
    w.run(1);
    assert.equal(w.$gameFight.isActive(), true, 'the first frame the map is seen whole, not the next beat');
    const hop = world('tactical', { events: [row(1, 4, 2)] });
    hop.$gamePlayer._jumpCount = 3;
    beat(hop);
    hop.$gamePlayer._jumpCount = 0;
    offBeat(hop);
    assert.equal(hop.$gameFight.isActive(), true, 'landed');
    // A hold that can last (encounters switched off): nothing is asked between beats.
    const off = world('tactical', { events: [row(1, 4, 2)] });
    off.$gameSystem.disableEncounter();
    beat(off);
    let asked = 0;
    const startHeld = off.ReactorFight.startHeld;
    off.ReactorFight.startHeld = mode => { asked++; return startHeld(mode); };
    off.$gameSystem.enableEncounter();
    offBeat(off);
    assert.deepEqual([off.$gameFight.isActive(), asked], [false, 0]);
    beat(off);
    assert.equal(off.$gameFight.isActive(), true);
});

test('after a battle the enemies that were in it start none until the leader has been out of their reach once, each for itself: a win, an escape, a loss survived, a battle an event started', () => {
    const F = world('tactical').ReactorFight;
    const ended = result => {
        const w = world('tactical', { events: [row(1, 6, 2), row(2, 7, 2)], mapNote: result === F.LOSE ? '<battle lose: continue>' : '' });
        w.$dataEnemies[1].params[0] = 9000;
        beat(w);
        assert.equal(w.$gameFight.isActive(), true);
        assert.equal(w.$gameFight._options.canLose, result === F.LOSE, 'the Note says whether it can be lost');
        w.$gameFight.end(result, true);
        w.run(120, () => !w.$gameFight.isActive());
        assert.equal(w.$gameFight.isActive(), false);
        return w;
    };
    for (const [name, result] of [['a win with enemies left standing', F.WIN], ['an escape', F.ESCAPE], ['a loss the game goes on after', F.LOSE]]) {
        const w = ended(result);
        beat(w); beat(w);
        assert.equal(w.$gameFight.isActive(), false, `${name}: held beside the enemies`);
        assert.deepEqual(hold(w), [true, 1]);
        assert.deepEqual(heldUnits(w), [1, 2], `${name}: the hold is against the two that were in the battle`);
        // The distance alone lets one go: the start distance and a group's width (6 + 3 tiles).
        put(w, 2, 6);
        beat(w);
        assert.deepEqual(heldUnits(w), [1, 2], `${name}: 4 across and 4 down from the nearest is in reach`);
        put(w, 0, 8);
        beat(w);
        assert.deepEqual(hold(w), [true, 1], `${name}: 8.5 tiles from the nearest: whoever stood with it would still come`);
        assert.deepEqual(heldUnits(w), [1], `${name}: the other is 9.2 tiles off and let go, each for itself`);
        put(w, 0, 10);
        beat(w);
        assert.deepEqual(hold(w), [false, 0], `${name}: 10 tiles off: out of reach of both once`);
        assert.deepEqual(heldUnits(w), []);
        put(w, 2, 2);
        beat(w);
        assert.equal(w.$gameFight.isActive(), true, `${name}: the leader comes back and the battle starts again`);
        assert.equal(w.$gameFight.serial(), 2);
    }
    // A battle an event started (the map's own start never fired): the hold is made the same.
    const scripted = world('tactical', { events: [row(1, 6, 2)], mapNote: '<battle trigger: 5>' });
    scripted.$dataEnemies[1].params[0] = 9000;
    assert.ok(scripted.$gameFight.start({ mode: 'tactical', canEscape: true }) > 0);
    scripted.run(2);
    scripted.$gameFight.end(F.ESCAPE, true);
    scripted.run(120, () => !scripted.$gameFight.isActive());
    assert.deepEqual(hold(scripted), [true, 1]);
    assert.deepEqual(heldUnits(scripted), [1]);
    beat(scripted); beat(scripted);
    assert.equal(scripted.$gameFight.isActive(), false, 'held beside the enemy, 4 tiles off');
    assert.equal(scripted.$gameFight.serial(), 1);
    put(scripted, 12, 12);
    beat(scripted);
    assert.deepEqual(hold(scripted), [false, 0]);
    // With no group the start distance alone holds.
    const plainHold = ended(F.ESCAPE);
    plainHold.ReactorFight.GROUP = 0;
    put(plainHold, 0, 8);
    beat(plainHold);
    assert.deepEqual(hold(plainHold), [false, 0], '8.5 tiles off with no group: let go');
    // A battle won to the last enemy leaves nobody to hold for.
    const won = world('action', { events: [row(1, 4, 2)] });
    beat(won);
    kill(won, 1);
    won.run(400, () => !won.$gameFight.isActive());
    assert.equal(won.$gameFight.isActive(), false);
    beat(won);
    assert.deepEqual(hold(won), [false, 0]);
    // One of the battle that is no enemy any more holds nothing.
    const turned = ended(F.ESCAPE);
    turned.$gameFight.setEventSide(1, 'ally');
    turned.$gameMap.event(2).erase();
    beat(turned);
    assert.deepEqual(hold(turned), [false, 0], 'one changed sides, the other left the map');
    // The hold is saved with the game, with whom it is against.
    const saved = ended(F.ESCAPE);
    saved.$gameFight = saved.JsonEx.parse(saved.JsonEx.stringify(saved.$gameFight));
    beat(saved);
    assert.equal(saved.$gameFight.isActive(), false, 'held after a load');
    assert.deepEqual(hold(saved), [true, 1]);
    assert.deepEqual(heldUnits(saved), [1, 2]);
});

test('the hold is against the units of the battle that ended, never the map: a second group fights when the leader comes within 6 tiles of it, after a win and after an escape', () => {
    const groups = () => world('action', { events: [row(1, 7, 2), row(2, 2, 10), row(3, 3, 10)] });
    // A win: the first group has fallen where the leader stands 8 tiles from the second.
    const won = groups();
    beat(won);
    assert.deepEqual(inBattle(won), [1], 'the first battle: the one 5 tiles off');
    kill(won, 1);
    won.run(400, () => !won.$gameFight.isActive());
    assert.equal(won.$gameFight.isActive(), false);
    put(won, 2, 3);
    offBeat(won);
    assert.equal(won.$gameFight.isActive(), false, '7 tiles from the second group');
    assert.deepEqual(hold(won), [false, 0], 'nobody of the battle is left to hold for');
    put(won, 2, 4);
    offBeat(won);
    assert.equal(won.$gameFight.isActive(), true, '6 tiles from the second group: its battle starts, though the leader was never 9 tiles from it');
    assert.equal(won.$gameFight.serial(), 2);
    assert.deepEqual(inBattle(won), [2, 3]);
    // An escape: the one escaped from still stands in reach, and holds only itself.
    const fled = groups();
    fled.$dataEnemies[1].params[0] = 9000;
    beat(fled);
    fled.$gameFight.end(fled.ReactorFight.ESCAPE, true);
    fled.run(120, () => !fled.$gameFight.isActive());
    beat(fled); beat(fled);
    assert.equal(fled.$gameFight.isActive(), false, 'beside the enemy it escaped from: nothing');
    assert.deepEqual(heldUnits(fled), [1]);
    put(fled, 2, 3);
    beat(fled);
    assert.equal(fled.$gameFight.isActive(), false, '7 tiles from the second group');
    put(fled, 2, 4);
    offBeat(fled);
    assert.equal(fled.$gameFight.isActive(), true, 'an enemy that was not in the battle starts its own as always');
    assert.deepEqual(inBattle(fled), [1, 2, 3], 'and the one escaped from, 5.4 tiles off and in sight, is in it: the rule takes it');
    // With the second group out of the way the hold alone speaks: the leader stands 2 tiles from the one it escaped and nothing starts.
    const alone = world('action', { events: [row(1, 7, 2)] });
    alone.$dataEnemies[1].params[0] = 9000;
    beat(alone);
    alone.$gameFight.end(alone.ReactorFight.ESCAPE, true);
    alone.run(120, () => !alone.$gameFight.isActive());
    put(alone, 5, 2);
    for (let i = 0; i < 3; i++) beat(alone);
    assert.equal(alone.$gameFight.isActive(), false);
    assert.equal(alone.$gameFight.serial(), 1);
    // Whoever joined the battle later, or left it and stayed on the map, is under the hold as well.
    const joined = world('action', { events: [row(1, 6, 2), row(2, 10, 2), row(3, 2, 10)] });
    joined.$dataEnemies[1].params[0] = 9000;
    beat(joined);
    assert.deepEqual(inBattle(joined), [1], 'the other two stand 8 tiles off, each alone');
    assert.ok(joined.$gameFight.join(2, true), 'a command brings one in');
    joined.$gameFight.removeUnit(joined.$gameFight.join(3, true), true);
    assert.deepEqual(inBattle(joined), [1, 2], 'the third came and left, and stands on the map still');
    joined.$gameFight.end(joined.ReactorFight.ESCAPE, true);
    joined.run(120, () => !joined.$gameFight.isActive());
    beat(joined);
    assert.deepEqual(heldUnits(joined), [1, 2, 3]);
    put(joined, 4, 8);
    for (let i = 0; i < 3; i++) beat(joined);
    assert.equal(joined.$gameFight.isActive(), false, '2.8 tiles from the one that left the battle and stayed: held');
    put(joined, 2, 14);
    beat(joined);
    assert.deepEqual(heldUnits(joined), [3], 'the two the leader is now 12 tiles and more from are let go; the one beside it is not');
    put(joined, 14, 2);
    beat(joined);
    assert.equal(joined.$gameFight.isActive(), true, 'the one that joined by a command, let go a moment ago and now 4 tiles off, starts its battle');
    assert.deepEqual(inBattle(joined), [2]);
});

test('the hold belongs to the map it was made on: another map does not inherit it, and a map that starts no battle lets it go', () => {
    // A battle an event started on a map whose events start its battles: its units come under the hold as it ends, and the map lets it go at once.
    const w = world('tactical', { events: [row(1, 6, 2)], mapNote: '<battle trigger: 0>' });
    w.$dataEnemies[1].params[0] = 9000;
    assert.ok(w.$gameFight.start({ mode: 'tactical', canEscape: true }) > 0);
    w.run(2);
    assert.deepEqual(hold(w), [false, 0], 'no hold while the battle runs: it is made as the battle ends');
    w.$gameFight.end(w.ReactorFight.ESCAPE, true);
    let made = null;
    const finishAround = w.$gameFight.finishAround;
    w.$gameFight.finishAround = function(result) { made = [hold(w), heldUnits(w)]; return finishAround.call(this, result); };
    w.run(120, () => !w.$gameFight.isActive());
    assert.deepEqual(made, [[true, 1], [1]], 'as it ends');
    w.run(1);
    assert.deepEqual(hold(w), [false, 0], 'nothing to hold on a map that starts no battle of its own');
    assert.deepEqual(heldUnits(w), []);
    // A hold made on one map: the next map does not inherit it, nor whom it was against.
    const e = world('tactical', { events: [row(1, 6, 2)], mapNote: '<battle trigger: 5>' });
    e.$dataEnemies[1].params[0] = 9000;
    beat(e);
    assert.equal(e.$gameFight.isActive(), true);
    e.$gameFight.end(e.ReactorFight.ESCAPE, true);
    e.run(120, () => !e.$gameFight.isActive());
    beat(e);
    assert.deepEqual(hold(e), [true, 1], 'held beside the enemy it escaped from');
    assert.deepEqual(heldUnits(e), [1]);
    arrive(e, 2, '<battle trigger: 3>', 2, 2);
    beat(e);
    assert.deepEqual(hold(e), [false, 0], 'on the next map the hold is let go');
    assert.deepEqual(heldUnits(e), [], 'with whom it was against: event 1 of this map is another event');
    assert.equal(e.$gameFight.isActive(), false, '4 tiles from this map\'s enemy, on a map that says 3');
    put(e, 3, 2);
    beat(e);
    assert.equal(e.$gameFight.isActive(), true, 'in reach, it starts its battle: another map does not inherit the hold');
    assert.equal(e.$gameFight.serial(), 2);
    // An escape from one enemy, a battle with another, an escape again: the first is still under the hold. It was never out of reach.
    const both = world('action', { events: [row(1, 6, 2), row(2, 2, 7)] });
    both.$dataEnemies[1].params[0] = 9000;
    for (let x = 0; x <= 7; x++) wall(both, x, 5);
    beat(both);
    assert.deepEqual(inBattle(both), [1], 'the other is behind a wall');
    both.$gameFight.end(both.ReactorFight.ESCAPE, true);
    both.run(120, () => !both.$gameFight.isActive());
    put(both, 2, 6);
    beat(both);
    assert.deepEqual(inBattle(both), [2], 'its side of the wall: the second battle, without the first enemy');
    both.$gameFight.end(both.ReactorFight.ESCAPE, true);
    both.run(120, () => !both.$gameFight.isActive());
    beat(both);
    assert.deepEqual(heldUnits(both), [1, 2], 'both under the hold');
    put(both, 3, 4);
    for (let i = 0; i < 3; i++) beat(both);
    assert.equal(both.$gameFight.isActive(), false, 'back in sight of the first, 3.6 tiles off: no battle');
    assert.equal(both.$gameFight.serial(), 2);
    // A battle screen no unit of the map fought in (Battle Processing against a troop, a random encounter, a save made
    // before the hold named its units) holds nobody: the row in reach starts its battle.
    const v = classicWorld({ events: [row(1, 6, 2)], mapNote: '<battle trigger: 5>' });
    const calls = recordScreen(v);
    vm.runInContext('new Scene_Battle().terminate();', v);
    assert.equal(v.$gameFight._triggerHeld, true, 'the battle screen leaves its hold');
    beat(v);
    assert.deepEqual(hold(v), [false, 0], 'against nobody: let go');
    assert.deepEqual(calls.map(call => call.rows), [[1]], 'and the row 4 tiles off, which was in no battle, starts its own');
    // The same on a map that fights on the map.
    const t = world('tactical', { classic: true, prepare: ctx => vm.runInContext('Scene_Battle.prototype.terminate = function() {};', ctx), events: [row(1, 6, 2)] });
    vm.runInContext('new Scene_Battle().terminate();', t);
    beat(t);
    assert.equal(t.$gameFight.isActive(), true);
});

test('open: the battle starts as the map opens, with every unit on it, once per visit, and only where an enemy stands', () => {
    const w = world('tactical', { events: [row(1, 18, 12), unit(2, 17, 3, 'ally 3'), unit(3, 10, 13, 'neutral')], mapNote: '<battle trigger: open>' });
    w.$dataEnemies[1].params[0] = 9000;
    w.run(1);
    assert.equal(w.$gameFight.isActive(), true, 'on the first frame the map is live');
    assert.deepEqual(inBattle(w), [1, 2, 3], 'every unit on the map, however far');
    assert.equal(w.$gameFight._openedMap, 1);
    w.$gameFight.end(w.ReactorFight.ESCAPE, true);
    w.run(120, () => !w.$gameFight.isActive());
    put(w, 0, 0);
    for (let i = 0; i < 4; i++) beat(w);
    put(w, 16, 12);
    for (let i = 0; i < 4; i++) beat(w);
    assert.equal(w.$gameFight.isActive(), false, 'once per visit: not again, wherever the party walks');
    assert.equal(w.$gameFight.serial(), 1);
    // A load of the map the party is on is not a new visit; a save keeps what was opened.
    w.$gameFight = w.JsonEx.parse(w.JsonEx.stringify(w.$gameFight));
    vm.runInContext('$gameMap.setup(1);', w);
    for (let i = 0; i < 3; i++) beat(w);
    assert.equal(w.$gameFight.isActive(), false);
    // Entering it again (from another map) is.
    arrive(w, 2, '', 2, 2);
    w.run(1);
    arrive(w, 1, '<battle trigger: open>', 2, 2);
    w.run(1);
    assert.equal(w.$gameFight.isActive(), true, 'the next visit');
    assert.equal(w.$gameFight.serial(), 2);
    // Out and back in with no frame played on the other map: still a new visit.
    w.$gameFight.end(w.ReactorFight.ESCAPE, true);
    w.run(120, () => !w.$gameFight.isActive());
    arrive(w, 2, '', 2, 2);
    arrive(w, 1, '<battle trigger: open>', 2, 2);
    w.run(2);
    assert.equal(w.$gameFight.serial(), 3);
    // Never with no enemy on the map.
    const empty = world('tactical', { events: [unit(2, 5, 3, 'ally 3'), unit(3, 4, 4, 'neutral')], mapNote: '<battle trigger: open>' });
    for (let i = 0; i < 3; i++) beat(empty);
    assert.equal(empty.$gameFight.isActive(), false);
    assert.ok(!empty.$gameFight._openedMap, 'and the visit is not used up: an enemy that comes on the map later opens it');
    // A battle an event of the map started first: the map's own waits until the leader has been out of its units' reach.
    const first = world('tactical', { events: [row(1, 6, 2), row(2, 18, 12), starter(9, [reactor('StartMapBattle', { mode: 'tactical', who: 'near' })])], mapNote: '<battle trigger: open>' });
    first.$dataEnemies[1].params[0] = 9000;
    first.run(3);
    assert.deepEqual([first.$gameFight.serial(), inBattle(first)], [1, [1]], 'the event\'s battle, with the enemy near the party');
    assert.ok(!first.$gameFight._openedMap, 'not the map\'s own');
    first.$gameFight.end(first.ReactorFight.ESCAPE, true);
    first.run(120, () => !first.$gameFight.isActive());
    for (let i = 0; i < 3; i++) beat(first);
    assert.equal(first.$gameFight.serial(), 1, 'beside the enemy it escaped from, the map opens no battle');
    put(first, 2, 13);
    beat(first);
    assert.equal(first.$gameFight.serial(), 2, 'out of its reach: the map\'s own battle, with every unit');
    assert.deepEqual(inBattle(first), [1, 2]);
    // It waits for whatever holds a start (an event running as the map opens).
    const busy = world('tactical', { events: [row(1, 18, 12)], mapNote: '<battle trigger: open>' });
    busy.$gameMessage.add('Welcome.');
    busy.$gameMap.update(true);
    assert.equal(busy.$gameFight.isActive(), false);
    busy.$gameMessage.clear();
    busy.run(1);
    assert.equal(busy.$gameFight.isActive(), true);
});

test('the map\'s own start leaves a next-battle mode for the battle it was set for; the battle a command starts uses it up', () => {
    const w = world('tactical', { events: [row(1, 6, 2)] });
    const F = w.ReactorFight;
    w.$dataEnemies[1].params[0] = 9000;
    F.changeMode('action', 'next');
    beat(w);
    assert.equal(w.$gameFight.isActive(), true);
    assert.equal(w.$gameFight.mode(), 'tactical', 'the map\'s own start fights in the mode in force, whatever the next battle is set to');
    assert.equal(F.overrides().next, 'action', 'and the setting is still there');
    w.$gameFight.end(F.ESCAPE, true);
    w.run(120, () => !w.$gameFight.isActive());
    // Battle Processing is the next battle: it fights in that mode and uses it up.
    w.$gameMap._interpreter.setup([{ code: 301, indent: 0, parameters: [0, 1, true, true] }, end], 0);
    w.run(2);
    assert.equal(w.$gameFight.mode(), 'action');
    assert.equal(F.overrides().next, undefined);
    // A next battle set to Classic is used up by the battle screen it opens.
    const c = world('tactical');
    c.ReactorFight.changeMode('classic', 'next');
    c.$gameMap._interpreter.setup([{ code: 301, indent: 0, parameters: [0, 1, true, true] }, end], 0);
    c.run(2);
    assert.deepEqual([...c.pushed], ['Scene_Battle'], 'the battle screen');
    assert.equal(c.$gameFight.isActive(), false);
    assert.equal(c.ReactorFight.overrides().next, undefined, 'used up: the battle after it is the map\'s mode again');
    assert.equal(c.ReactorFight.resolveMode(1), 'tactical');
    assert.equal(Object.prototype.hasOwnProperty.call(c.$gamePlayer, 'makeEncounterTroopId'), false, 'and the party chooses its next random troop as it always did');
    // A random encounter that opens the battle screen uses it up too.
    const r = world('tactical');
    r.ReactorFight.changeMode('classic', 'next');
    r.$dataMap.encounterList = [{ troopId: 1, weight: 10, regionSet: [] }];
    r.$gamePlayer._encounterCount = 0;
    assert.equal(r.$gamePlayer.executeEncounter(), true, 'the battle screen');
    assert.equal(r.$gameFight.isActive(), false);
    assert.equal(r.ReactorFight.overrides().next, undefined, 'used up by the encounter');
    assert.equal(Object.prototype.hasOwnProperty.call(r.$gamePlayer, 'makeEncounterTroopId'), false);
    // So does Start Battle on Map where the battle screen opens: against a troop, and against the rows near the party.
    const command = args => [reactor('StartMapBattle', Object.assign({ who: 'near', canEscape: true }, args))];
    for (const [name, args] of [['a troop', { troopId: 1 }], ['the rows near the party', {}]]) {
        const s = world('tactical', { classic: true, prepare: ctx => vm.runInContext('Scene_Battle.prototype.terminate = function() {};', ctx), events: [row(1, 6, 2), starter(9, command(args))], mapNote: '<battle trigger: 0>' });
        s.ReactorFight.changeMode('classic', 'next');
        s.run(3);
        assert.deepEqual([...s.pushed], ['Scene_Battle'], `${name}: the battle screen`);
        assert.equal(s.$gameFight.isActive(), false);
        assert.equal(s.ReactorFight.overrides().next, undefined, `${name}: used up`);
    }
});

//-----------------------------------------------------------------------------
// 2.15 A Classic map: the same rule opens the battle screen.

test('on a Classic map the rule hands the battle screen the enemy rows the leader sees; tag units, allies and bystanders start nothing', () => {
    const w = classicWorld({ events: [row(1, 8, 2), row(2, 8, 4, 2), unit(3, 6, 3, 'enemy 1'), unit(4, 5, 4, 'ally 3'), row(5, 16, 12), row(6, 7, 6, 1, { pages: [behind(5)] })] });
    const calls = recordScreen(w), F = w.ReactorFight;
    assert.equal(F.modeInForce(), 'classic');
    put(w, 1, 2);
    beat(w);
    assert.deepEqual(calls, [], 'the rows are 7 tiles off and more; the tag unit and the ally in reach start nothing');
    put(w, 3, 2);
    offBeat(w);
    assert.equal(calls.length, 1, 'the frame the leader is within 6 tiles of a row it sees');
    assert.deepEqual(calls[0].rows, [1, 2], 'the rows in reach and in sight: not the tag unit, the ally, the far row or the one with no page met');
    assert.deepEqual(calls[0].options, { canEscape: true, canLose: false }, 'a random encounter\'s terms');
    assert.equal(w.$gameFight.isActive(), false, 'no battle on the map');
    // A row behind a wall is not handed over, and starts nothing alone.
    const walled = classicWorld({ events: [row(1, 8, 2), row(2, 4, 7)] });
    const seen = recordScreen(walled);
    wall(walled, 6, 2);
    put(walled, 4, 2);
    for (let x = 0; x <= 8; x++) wall(walled, x, 5);
    beat(walled);
    assert.deepEqual(seen, [], 'both rows are in reach, each behind a wall');
    walled.$dataMap.data[2 * 20 + 6] = 1536;
    walled.$gameMap.refresh();
    put(walled, 3, 2);
    beat(walled);
    assert.deepEqual(seen.map(call => call.rows), [[1]], 'the row the leader sees; the one behind the other wall is not handed over');
    // <battle lose: continue>, a number, open and 0 mean what they mean on any map.
    const tagged = classicWorld({ events: [row(1, 12, 2)], mapNote: '<battle trigger: 10>\n<battle lose: continue>' });
    const far = recordScreen(tagged);
    beat(tagged);
    assert.deepEqual(far, [{ rows: [1], options: { canEscape: true, canLose: true } }]);
    const opened = classicWorld({ events: [row(1, 18, 12), unit(2, 4, 2, 'enemy 1')], mapNote: '<battle trigger: open>' });
    const whole = recordScreen(opened);
    opened.run(1);
    assert.deepEqual(whole, [{ rows: null, options: { canEscape: true, canLose: false } }], 'open: every enemy row of the map (the battle screen takes the nearest 8)');
    const none = classicWorld({ events: [unit(2, 4, 2, 'enemy 1')], mapNote: '<battle trigger: open>' });
    const nobody = recordScreen(none);
    for (let i = 0; i < 3; i++) beat(none);
    assert.deepEqual(nobody, [], 'open with no enemy row: nothing');
    const never = classicWorld({ events: [row(1, 4, 2)], mapNote: '<battle trigger: 0>' });
    const quiet = recordScreen(never);
    beat(never); beat(never);
    assert.deepEqual(quiet, []);
    // A map set to Classic in a game that fights on the map opens the battle screen too; a next-battle mode is not looked at.
    const island = world('action', { classic: true, prepare: ctx => vm.runInContext('Scene_Battle.prototype.terminate = function() {};', ctx), events: [row(1, 6, 2)], mapNote: '<battle mode: classic>' });
    const screen = recordScreen(island);
    island.ReactorFight.changeMode('tactical', 'next');
    beat(island);
    assert.equal(screen.length, 1);
    assert.equal(island.$gameFight.isActive(), false);
    assert.equal(island.ReactorFight.overrides().next, 'tactical');
});

test('on a Classic map the battle screen really opens, the map starts no second one over it, and the hold after it is against the rows that fought, a group\'s width further out', () => {
    const w = classicWorld({ events: [row(1, 8, 2), row(2, 10, 2)] });
    const C = w.ReactorFight.Classic;
    w.$dataEnemies[1].params[0] = 9000;
    put(w, 3, 2);
    offBeat(w);
    assert.deepEqual([...w.pushed], ['Scene_Battle'], 'the battle screen');
    assert.equal(C.isRunning(), true);
    assert.equal(w.ReactorFight.startHeld('classic'), 'battle', 'the battle made there holds the next');
    assert.deepEqual(plain(C._session.members.map(member => member.eventId)), [1, 2], 'the row in reach, and the one standing with it (a group is fought whole)');
    assert.equal(w.$gameTroop.members().length, 2);
    for (let i = 0; i < 3; i++) beat(w);
    assert.deepEqual([...w.pushed], ['Scene_Battle'], 'held while that battle runs');
    // The battle screen is left (an escape: both still stand): the hold is the screen's own.
    vm.runInContext('new Scene_Battle().terminate();', w);
    assert.equal(C.isRunning(), false);
    beat(w);
    assert.deepEqual(hold(w), [true, 1]);
    assert.deepEqual(heldUnits(w), [1, 2], 'the hold is against the rows that fought');
    assert.deepEqual([...w.pushed], ['Scene_Battle'], 'no battle restarts beside the standing enemies');
    // 6 tiles is the start distance; on a Classic map the hold stands 3 tiles further (Classic.GROUP).
    put(w, 0, 2);
    beat(w);
    assert.deepEqual(hold(w), [true, 1], '8 tiles from the nearest row: inside 6 + 3');
    assert.deepEqual(heldUnits(w), [1], 'the row 10 tiles off is let go');
    put(w, 8, 12);
    beat(w);
    assert.deepEqual(hold(w), [false, 0], '10 tiles off: let go');
    put(w, 4, 2);
    beat(w);
    assert.deepEqual([...w.pushed], ['Scene_Battle', 'Scene_Battle'], 'and the leader walks up again');
    // A battle screen that was won: its row is gone, and a second group 8 tiles off fights when the leader comes within 6 of it.
    const won = classicWorld({ events: [row(1, 7, 2), row(2, 2, 10), row(3, 3, 10)] });
    const session = () => plain(won.ReactorFight.Classic._session.members.map(member => member.eventId));
    beat(won);
    assert.deepEqual(session(), [1]);
    won.$gameTroop.members().forEach(member => member.setHp(0));
    vm.runInContext('ReactorFight.Classic.onResult(0); new Scene_Battle().terminate();', won);
    assert.equal(won.$gameMap.event(1)._erased, true, 'the row that fell has left the map');
    put(won, 2, 3);
    offBeat(won);
    assert.deepEqual([...won.pushed], ['Scene_Battle'], '7 tiles from the second group');
    assert.deepEqual(hold(won), [false, 0], 'nobody of that battle is left to hold for');
    put(won, 2, 4);
    offBeat(won);
    assert.deepEqual([...won.pushed], ['Scene_Battle', 'Scene_Battle'], '6 tiles from the second group: its battle screen opens');
    assert.deepEqual(session(), [2, 3]);
    // An escape from one group, then a second group in reach: it fights, and the row escaped from is handed over with it when the leader sees it.
    const fled = classicWorld({ events: [row(1, 7, 2), row(2, 2, 10), row(3, 3, 10)] });
    fled.$dataEnemies[1].params[0] = 9000;
    beat(fled);
    vm.runInContext('new Scene_Battle().terminate();', fled);
    const again = recordScreen(fled);
    for (let i = 0; i < 2; i++) beat(fled);
    assert.deepEqual(again, [], 'held beside the row it escaped from');
    put(fled, 2, 4);
    offBeat(fled);
    assert.deepEqual(again.map(call => call.rows), [[2, 1]], 'the row in reach that was in no battle starts one (the screen brings the one beside it); the one under the hold, 5.4 tiles off and in sight, is handed over with it');
    // With no battle screen file loaded a Classic map starts nothing and throws nothing.
    const bare = world('classic', { events: [row(1, 4, 2)] });
    assert.doesNotThrow(() => { beat(bare); beat(bare); });
    assert.equal(bare.$gameFight.isActive(), false);
    assert.deepEqual([...bare.pushed], []);
});

//-----------------------------------------------------------------------------
// 2.3 Who is in the battle.

test('a battle the map starts takes the units within the start distance of a party member who sees them; one 7 tiles off joins when a party member steps to 6', () => {
    const w = world('action', { events: [row(1, 8, 2), row(2, 15, 3), unit(3, 3, 6, 'ally 3'), unit(4, 4, 7, 'neutral'), row(5, 4, 12), unit(6, 14, 4, 'ally 3')] });
    const fight = w.$gameFight, F = w.ReactorFight;
    w.$dataEnemies[1].params[0] = 9000;
    let begun = 0;
    const onBattleStart = w.Game_Battler.prototype.onBattleStart;
    w.Game_Battler.prototype.onBattleStart = function(advantageous) { if (this.isEnemy()) begun++; return onBattleStart.call(this, advantageous); };
    beat(w);
    assert.equal(fight.isActive(), true, 'row 1 is 6 tiles off');
    assert.deepEqual(inBattle(w), [1, 3, 4], 'the enemy, and the ally and the bystander in reach: any side; not the units 13 and 10 tiles off');
    assert.equal(begun, 1);
    assert.equal(fight.objectiveText(), 'Enemies left: 1', 'the goal counts the enemies in the battle');
    assert.deepEqual(plain(Array.from({ length: F.outside.count }, (unused, i) => [F.outside.events[i].eventId(), F.outside.teams[i]])), [], 'nobody looked at yet');
    offBeat(w);
    assert.deepEqual(plain(Array.from({ length: F.outside.count }, (unused, i) => [F.outside.events[i].eventId(), F.outside.teams[i]])), [[2, 'enemy'], [5, 'enemy'], [6, 'ally']], 'the units outside, looked at on the battle\'s first frame');
    // Row 2 stands 7 tiles from the leader's new tile: outside. One step more and it joins, a full member.
    put(w, 8, 3);
    beat(w);
    assert.deepEqual(inBattle(w), [1, 3, 4], '7 tiles off');
    assert.deepEqual(plain(w.$gamePlayer.followers().data().map(f => [f.x, f.y])).slice(0, 1), [[2, 2]], 'the followers are units of their own: they stay where they stood');
    put(w, 9, 3);
    offBeat(w);
    assert.deepEqual(inBattle(w), [1, 3, 4], 'units outside are looked at on the beat');
    beat(w);
    assert.deepEqual(inBattle(w), [1, 2, 3, 4, 6], 'row 2 and the ally beside it join');
    assert.equal(begun, 2, 'its battler starts its battle');
    assert.equal(fight.objectiveText(), 'Enemies left: 2', 'and it counts for the goal');
    assert.equal(w.$gameTroop._enemies.length, 2, 'the troop holds its battler');
    // A follower's eyes count as the leader's do.
    w.$gamePlayer.followers().data()[0].locate(3, 8);
    beat(w);
    assert.deepEqual(inBattle(w), [1, 2, 3, 4, 5, 6], 'row 5 is 4 tiles from the follower');
    // Its reward is given with the others'.
    const actor = w.$gameActors.actor(1), before = actor.currentExp();
    kill(w, 1); kill(w, 2); kill(w, 5);
    w.run(600, () => !fight.isActive());
    assert.equal(fight.isActive(), false);
    assert.equal(actor.currentExp() - before, 30, 'the EXP of the three, the two joiners among them');
});

test('units outside a battle join only by sight; a beat asks for a few sight lines and goes on from there', () => {
    const w = world('action', { events: [row(1, 6, 2), row(2, 2, 7)] });
    w.$dataEnemies[1].params[0] = 9000;
    for (let x = 0; x <= 7; x++) wall(w, x, 5);
    beat(w);
    assert.deepEqual(inBattle(w), [1], 'row 2 is 5 tiles off, behind a wall');
    for (let i = 0; i < 3; i++) beat(w);
    assert.deepEqual(inBattle(w), [1]);
    put(w, 2, 6);
    beat(w);
    assert.deepEqual(inBattle(w), [1, 2], 'seen from its side of the wall');
    // A battle that is ending takes nobody any more: the look asks for no line, and a unit a command names is refused.
    const over = world('action', { events: [row(1, 6, 2), row(2, 2, 7)] });
    over.$dataEnemies[1].params[0] = 9000;
    for (let x = 0; x <= 7; x++) wall(over, x, 5);
    beat(over);
    over.$gameFight.end(over.ReactorFight.ESCAPE, true);
    let asked = 0;
    const line = over.ReactorFight.sees;
    over.ReactorFight.sees = (from, to) => { asked++; return line(from, to); };
    put(over, 2, 6);
    assert.equal(over.ReactorFight.bringNear(over.$gameFight, true), 0);
    assert.equal(asked, 0, 'nobody is looked at');
    assert.equal(over.$gameFight.join(2, true), null, 'and a named unit does not join');
    assert.deepEqual(inBattle(over), [1]);
    // Many units in reach and out of sight: the lines of one beat are counted.
    const rows = [];
    for (let i = 0; i < 30; i++) rows.push(row(10 + i, 5 + (i % 6), 5 + Math.floor(i / 6)));
    const crowd = world('action', { events: [row(1, 3, 2)].concat(rows), mapNote: '<battle trigger: 12>' });
    crowd.$dataEnemies[1].params[0] = 9000;
    const F = crowd.ReactorFight;
    let lines = 0, blind = true;
    const sees = F.sees;
    F.sees = (from, to) => { lines++; return to.eventId() === 1 ? sees(from, to) : !blind && sees(from, to); };
    beat(crowd);
    assert.deepEqual(inBattle(crowd), [1]);
    lines = 0;
    beat(crowd);
    assert.equal(lines, F.BEAT_LINES, 'no more than the beat\'s lines');
    lines = 0;
    offBeat(crowd);
    assert.equal(lines, 0, 'and none between beats');
    // The first twenty stay out of sight: the lines go on from where the last beat stopped, so the ten behind them are asked too.
    F.sees = (from, to) => { lines++; return to.eventId() === 1 || to.eventId() >= 30; };
    for (let i = 0; i < 8; i++) beat(crowd);
    assert.deepEqual(inBattle(crowd).filter(id => id >= 30), [30, 31, 32, 33, 34, 35, 36, 37, 38, 39], 'everyone is asked in turn');
    assert.ok(inBattle(crowd).some(id => id > 1 && id < 30), 'and whoever stands with one that joined came too');
});

test('a group is fought whole: who stands within 3 tiles of a unit the rule takes comes with it, at the start and when one joins; one step out, not a chain', () => {
    // A line of three one tile apart, met head on: 6, 6.08 and 6.08 tiles off on the step that starts the battle.
    const line = () => [row(1, 7, 2), row(2, 8, 2), row(3, 9, 2), row(4, 12, 2)];
    const w = world('action', { events: line() });
    w.$dataEnemies[1].params[0] = 9000;
    put(w, 2, 2);
    beat(w);
    assert.equal(w.$gameFight.isActive(), true);
    assert.deepEqual(inBattle(w), [1, 2, 3], 'row 1 is seen 5 tiles off, row 2 at 6; row 3, 7 tiles off, stands beside row 2');
    assert.equal(w.$gameFight.objectiveText(), 'Enemies left: 3');
    for (let i = 0; i < 3; i++) beat(w);
    assert.deepEqual(inBattle(w), [1, 2, 3], 'row 4 stands 3 tiles from row 3, which came along, and 4 from row 2: no chain');
    // Out of sight counts for nothing in a group: the one behind a wall comes with the one that is seen.
    const hidden = world('action', { events: [row(1, 6, 2), row(2, 6, 4)] });
    hidden.$dataEnemies[1].params[0] = 9000;
    for (let x = 3; x <= 9; x++) wall(hidden, x, 3);
    beat(hidden);
    assert.deepEqual(inBattle(hidden), [1, 2]);
    // A unit that joins brings who stands with it.
    const later = world('action', { events: [row(1, 6, 2), row(2, 14, 8), row(3, 16, 9), row(4, 19, 9)] });
    later.$dataEnemies[1].params[0] = 9000;
    beat(later); beat(later);
    assert.deepEqual(inBattle(later), [1]);
    put(later, 9, 5);
    beat(later);
    assert.deepEqual(inBattle(later), [1, 2, 3], 'row 2 is 5.8 tiles off and seen; row 3 stands 2.2 tiles from it; row 4 is 3 from row 3 only');
    assert.deepEqual(plain(Array.from({ length: later.ReactorFight.outside.count }, (unused, i) => later.ReactorFight.outside.events[i].eventId())), [4], 'who is left outside');
    // Any side: an ally standing with an enemy that is taken is in the battle too.
    const mixed = world('action', { events: [row(1, 8, 2), unit(2, 10, 3, 'ally 3'), unit(3, 9, 4, 'neutral')] });
    beat(mixed);
    assert.deepEqual(inBattle(mixed), [1, 2, 3]);
    // The plain rule, with no group.
    const alone = world('action', { events: line() });
    alone.ReactorFight.GROUP = 0;
    alone.$dataEnemies[1].params[0] = 9000;
    beat(alone);
    assert.deepEqual(inBattle(alone), [1, 2], 'within 6 tiles and seen, and nobody else');
    // Start Battle on Map near the party takes the group too.
    const scripted = world('tactical', { events: line().concat([starter(9, [reactor('StartMapBattle', { mode: 'action', who: 'near' })])]), mapNote: '<battle trigger: 0>' });
    scripted.run(3);
    assert.deepEqual(inBattle(scripted), [1, 2, 3]);
});

test('a unit\'s body hides no unit from the rule: the line is asked with the scenery alone in its way', () => {
    const w = world('action', { events: [row(1, 6, 2), event(2, 4, 2), unit(3, 5, 3, 'ally 3')], mapNote: '<battle trigger: 0>' });
    const F = w.ReactorFight, leader = w.$gamePlayer, target = w.$gameMap.event(1);
    // The models the Action driver measures as standing in a line's way: every event with a model that is no unit of a battle.
    const prop = { _eventId: 10007, x: 5, y: 2 };
    const bodies = [{ character: target }, { character: w.$gameMap.event(2) }, { character: w.$gameMap.event(3) }, { character: prop }, { character: null }];
    const all = { count: 4, list: bodies, stamp: 1 };
    let asked = 0;
    const props = () => { asked++; return all; };
    F.Action = { props };
    let inLine = null;
    const sight = F.Grid.sight;
    F.Grid.sight = function() { const seen = F.Action.props(); inLine = Array.from(seen.list.slice(0, seen.count), body => body.character); return sight.apply(this, arguments); };
    assert.equal(F.sees(leader, target), true);
    assert.deepEqual(inLine.map(c => c._eventId), [2, 10007], 'the plain event and the placed model stand in the way; the unit looked at and the unit beside it do not');
    assert.equal(F.Action.props, props, 'the driver has its own list back');
    // A unit that stops being one is scenery again on the next look.
    w.$gameMap.event(3).erase();
    w.run(1);
    F.sees(leader, target);
    assert.deepEqual(inLine.map(c => c._eventId), [2, 3, 10007]);
    // A line that throws still gives the list back.
    F.Grid.sight = () => { throw new Error('no line'); };
    assert.throws(() => F.sees(leader, target), /no line/);
    assert.equal(F.Action.props, props);
    // Nothing measured (a 2D map): the grid's line as it is.
    F.Grid.sight = sight;
    all.count = 0;
    assert.equal(F.sees(leader, target), true);
    delete F.Action;
    assert.equal(F.sees(leader, target), true);
    assert.equal(F.sees(leader, null), false);
});

test('the win is judged after one more look: an enemy the rule takes now joins, and the battle goes on against it', () => {
    const w = world('action', { events: [row(1, 6, 2), row(2, 12, 2)] });
    const fight = w.$gameFight;
    w.$dataEnemies[1].params[0] = 9000;
    beat(w);
    assert.deepEqual(inBattle(w), [1]);
    // The leader is within 6 tiles of row 2 and sees it, and the beat has not come yet.
    put(w, 7, 3);
    w.Graphics.frameCount += 5;
    kill(w, 1);
    assert.equal(fight._ending, null, 'not won: row 2 stands in reach');
    assert.deepEqual(inBattle(w), [1, 2]);
    assert.equal(fight.objectiveText(), 'Enemies left: 1');
    kill(w, 2);
    assert.equal(fight._ending.result, w.ReactorFight.WIN, 'the last of them falls: won at once, no waiting');
    // An enemy out of reach is not waited for.
    const far = world('action', { events: [row(1, 6, 2), row(2, 16, 12)] });
    beat(far);
    kill(far, 1);
    assert.equal(far.$gameFight._ending.result, far.ReactorFight.WIN);
});

test('Start Battle on Map: "near" takes what the rule takes round the party, "map" and no word take every unit on the map; the goal\'s unit joins wherever it stands', () => {
    const units = () => [row(1, 6, 2), row(2, 19, 13), unit(3, 3, 5, 'ally 3'), unit(4, 18, 1, 'ally 3')];
    const started = args => {
        const w = world('tactical', { events: units().concat([starter(9, [reactor('StartMapBattle', Object.assign({ mode: 'action' }, args))])]), mapNote: '<battle trigger: 0>' });
        w.$dataEnemies[1].params[0] = 9000;
        w.run(3);
        return w;
    };
    assert.deepEqual(inBattle(started({ who: 'near' })), [1, 3], 'the units within 6 tiles of the party that it sees');
    assert.deepEqual(inBattle(started({ who: 'map' })), [1, 2, 3, 4], 'every unit, one 20 tiles off among them');
    assert.deepEqual(inBattle(started({})), [1, 2, 3, 4], 'a command with no "who" means the map');
    assert.deepEqual(inBattle(started({ who: 'near', objective: 'defeatUnit', unitEventId: 2 })), [1, 2, 3], 'the unit the goal names is in it wherever it stands');
    assert.deepEqual(inBattle(started({ who: 'map', objective: 'defeatUnit', unitEventId: 2 })), [1, 2, 3, 4], 'and is one unit, not two, where the whole map is taken');
    // Before a battle the followers who stand for a battle member look as the leader does; one past the party's number stands for nobody.
    const apart = world('tactical', { events: [row(1, 13, 2), row(2, 4, 13)], mapNote: '<battle trigger: 0>' });
    assert.deepEqual(plain(apart.ReactorFight.takenNear().map(e => e.eventId())), []);
    apart.$gamePlayer.followers().data()[0].locate(8, 2);
    apart.$gamePlayer.followers().data()[2].locate(2, 12);
    assert.deepEqual(plain(apart.ReactorFight.takenNear().map(e => e.eventId())), [1], 'row 1 is 5 tiles from the follower who stands for the second member; row 2 only near a follower nobody stands behind');
    // The map's distance is the rule's.
    const wide = world('tactical', { events: units(), mapNote: '<battle trigger: 30>' });
    assert.equal(wide.ReactorFight.startDistance(), 30);
    assert.deepEqual(plain(wide.ReactorFight.takenNear().map(e => e.eventId())), [1, 2, 3, 4]);
});

test('a battle that would be won the moment it starts does not start, and the event carries on down If Win', () => {
    const run = (args, events = []) => {
        const w = world('tactical', { events: events.concat([starter(9, [reactor('StartMapBattle', Object.assign({ mode: 'tactical', who: 'near', wait: true, resultVariable: 2 }, args))].concat(branches()))]), mapNote: '<battle trigger: 0>' });
        w.$gameVariables.setValue(2, 99);
        w.run(4);
        return w;
    };
    const empty = run({});
    assert.equal(empty.$gameFight.isActive(), false, 'no enemy unit is taken and no troop comes');
    assert.equal(empty.$gameFight.serial(), 0, 'no battle at all: no banner, no reward');
    assert.deepEqual(switches(empty), [1, 4], 'If Win, and the event goes on');
    assert.equal(empty.$gameVariables.value(2), 0, 'the result variable says a win');
    assert.deepEqual(empty.messages, []);
    assert.deepEqual(switches(run({}, [row(1, 18, 2)])), [1, 4], 'an enemy out of reach is not taken: nothing starts');
    assert.equal(run({ who: 'map' }, [row(1, 18, 2)]).$gameFight.isActive(), true, '"every unit on this map" takes it');
    assert.equal(run({}, [unit(1, 4, 2, 'ally 3')]).$gameFight.isActive(), false, 'an ally alone is nobody to defeat');
    assert.equal(run({ troopId: 1 }).$gameFight.isActive(), true, 'a troop comes');
    assert.equal(run({ objective: 'survive', turnsToSurvive: 3 }).$gameFight.isActive(), true, 'another goal starts empty: its own pages bring the enemies');
    assert.equal(run({ objective: 'switch', goalSwitchId: 7 }).$gameFight.isActive(), true);
    const hidden = run({ troopId: 3 });
    assert.equal(hidden.$gameFight.isActive(), false, 'a troop that brings nobody');
});

test('Battle Processing and a random encounter on a map that fights on the map take what the rule takes and always bring their troop', () => {
    const w = world('tactical', { events: [row(1, 6, 2, 2), row(2, 18, 12, 2), starter(9, [{ code: 301, indent: 0, parameters: [0, 1, true, true] }].concat(branches()))], mapNote: '<battle trigger: 0>' });
    w.run(3);
    const fight = w.$gameFight;
    assert.equal(fight.isActive(), true);
    assert.deepEqual([...w.pushed], [], 'no battle screen');
    const enemies = fight.units({ team: 'enemy' });
    assert.equal(enemies.length, 3, 'the placed enemy in reach and the troop\'s two Slimes');
    assert.deepEqual(plain(enemies.map(u => u.enemy.enemyId()).sort()), [1, 1, 2]);
    assert.ok(fight.unitOfEvent(1) && !fight.unitOfEvent(2), 'not the placed enemy out of reach');
    const spawned = enemies.filter(u => u.eventId !== 1).map(u => fight.character(u));
    assert.ok(spawned.every(c => Math.max(Math.abs(c.x - w.$gamePlayer.x), Math.abs(c.y - w.$gamePlayer.y)) <= 9), 'the troop stands round the party');
    assert.deepEqual([fight._options.canEscape, fight._options.canLose], [true, true]);
    fight.end(w.ReactorFight.ESCAPE, true);
    w.run(200, () => w.$gameSwitches.value(4));
    assert.deepEqual(switches(w), [2, 4], 'If Escape');
    // A random encounter.
    const r = world('action', { events: [row(1, 6, 2, 2), row(2, 18, 12, 2)], mapNote: '<battle trigger: 0>' });
    r.$dataMap.encounterList = [{ troopId: 1, weight: 10, regionSet: [] }];
    r.$gamePlayer._encounterCount = 0;
    assert.equal(r.$gamePlayer.executeEncounter(), false, 'no battle screen is asked for');
    assert.equal(r.$gameFight.isActive(), true);
    assert.equal(r.$gameFight.mode(), 'action');
    assert.equal(r.$gameFight.units({ team: 'enemy' }).length, 3);
    assert.ok(r.$gameFight.unitOfEvent(1) && !r.$gameFight.unitOfEvent(2), 'the placed enemy near the party, not the one across the map');
    assert.deepEqual([r.$gameFight._options.canEscape, r.$gameFight._options.canLose], [true, false]);
    assert.ok(r.$gamePlayer._encounterCount > 0, 'the count to the next one is made');
    // On a Classic map the stock encounter fights the troop whose mode was read.
    const c = world('classic');
    c.$dataMap.encounterList = [{ troopId: 1, weight: 10, regionSet: [] }, { troopId: 2, weight: 10, regionSet: [] }];
    let rolls = 0;
    c.$gamePlayer.makeEncounterTroopId = () => (rolls++ === 0 ? 1 : 2);
    c.$gamePlayer._encounterCount = 0;
    assert.equal(c.$gamePlayer.executeEncounter(), true, 'the battle screen');
    assert.equal(c.$gameTroop._troopId, 1, 'troop 1 was read as Classic: troop 1 fights, not a second roll');
    assert.equal(c.$gameFight.isActive(), false);
    assert.equal(rolls, 1, 'one roll');
    assert.equal(c.$gamePlayer.makeEncounterTroopId(), 2, 'and the party\'s own way of choosing a troop is back for the next encounter');
    assert.equal(rolls, 2);
});

test('a unit a command names joins first, wherever it stands: Change Unit Side, Change Battle Goal, Remove Unit; a unit that left is not brought back by the rule', () => {
    const w = world('action', { events: [row(1, 6, 2), row(2, 18, 12), unit(3, 17, 2, 'ally 3'), row(4, 15, 13), row(5, 4, 4)] });
    const fight = w.$gameFight, call = (name, args) => w.PluginManager.callCommand({ _eventId: 9 }, 'RPGReactor', name, args);
    w.$dataEnemies[1].params[0] = 9000;
    beat(w);
    assert.deepEqual(inBattle(w), [1, 5]);
    call('ChangeUnitSide', { eventId: 3, team: 'enemy' });
    assert.deepEqual(inBattle(w), [1, 3, 5], 'the ally 15 tiles off joins');
    assert.equal(fight.unitOfEvent(3).team, 'enemy', 'on the side the command gives it');
    call('ChangeBattleGoal', { objective: 'defeatUnit', unitEventId: 2 });
    assert.deepEqual(inBattle(w), [1, 2, 3, 5], 'the goal\'s unit joins');
    assert.equal(fight.objective().eventId, 2);
    // Remove Unit on a unit outside the battle: it joins, and leaves the battle and the map.
    call('RemoveUnit', { eventId: 4 });
    assert.equal(w.$gameMap.event(4)._erased, true);
    assert.deepEqual(inBattle(w), [1, 2, 3, 5]);
    // A unit that left and stays on the map as a bystander is not brought back by the rule.
    call('RemoveUnit', { eventId: 5, keep: true });
    assert.equal(w.$gameMap.event(5)._erased, false);
    for (let i = 0; i < 3; i++) beat(w);
    assert.deepEqual(inBattle(w), [1, 2, 3], 'it stands 2 tiles from the leader and is left alone');
    assert.equal(fight.join(5), null, 'the rule never brings it back');
    fight.adopt({ who: 'map', canEscape: true, canLose: false, objective: { type: 'defeatUnit', eventId: 2 } });
    assert.deepEqual(inBattle(w), [1, 2, 3], 'nor does a second Start Battle on Map that takes every unit');
    // A command that names it brings it back.
    call('ChangeUnitSide', { eventId: 5, team: 'ally' });
    assert.deepEqual(inBattle(w), [1, 2, 3, 5]);
    assert.equal(fight.unitOfEvent(5).team, 'ally');
    // An event that is no unit is not made one.
    const plainEvent = world('action', { events: [row(1, 6, 2), event(2, 10, 10)] });
    beat(plainEvent);
    plainEvent.PluginManager.callCommand({ _eventId: 9 }, 'RPGReactor', 'ChangeUnitSide', { eventId: 2, team: 'enemy' });
    assert.deepEqual(inBattle(plainEvent), [1]);
    assert.equal(plainEvent.$gameFight.join(2, true), null);
    assert.equal(plainEvent.$gameFight.join(99, true), null);
    // With no battle running nobody joins anything.
    const idle = world('action', { events: [row(1, 16, 12)] });
    assert.equal(idle.$gameFight.join(1, true), null);
});

test('units outside a Tactical battle stand still; in the other modes they carry on as the map has them', () => {
    const wander = (id, x, y) => row(id, x, y, 1, { pages: [page({ moveType: 1 })] });
    /** How often the unit outside the battle (event 2, which walks at random) is moved by its own page in three beats. */
    const walks = mode => {
        const w = world(mode, { events: [row(1, 6, 2), wander(2, 16, 12)] });
        w.$dataEnemies[1].params[0] = 9000;
        beat(w);
        assert.equal(w.$gameFight.isActive(), true);
        assert.deepEqual(inBattle(w), [1]);
        beat(w);
        const far = w.$gameMap.event(2);
        let calls = 0;
        w.Game_Event.prototype.moveTypeRandom = function() { if (this === far) calls++; };
        for (let i = 0; i < 3; i++) { far._stopCount = 9999; beat(w); }
        return calls;
    };
    assert.equal(walks('tactical'), 0, 'Tactical: the unit outside stands still');
    assert.ok(walks('action') > 0, 'Action: it goes on walking');
    assert.ok(walks('firstPerson') > 0);
    // With no battle it walks as the map has it, and a unit in the battle never walks by itself.
    const idle = world('tactical', { events: [wander(2, 16, 12)] });
    let walked = 0;
    idle.Game_Event.prototype.moveTypeRandom = function() { walked++; };
    idle.$gameMap.event(2)._stopCount = 9999;
    beat(idle);
    assert.ok(walked > 0);
    const inside = world('action', { events: [wander(2, 6, 2)] });
    inside.$dataEnemies[1].params[0] = 9000;
    beat(inside);
    assert.deepEqual(inBattle(inside), [2]);
    let stepped = 0;
    inside.Game_Event.prototype.moveTypeRandom = function() { stepped++; };
    inside.$gameMap.event(2)._stopCount = 9999;
    beat(inside);
    assert.equal(stepped, 0);
    // The mark is never part of a save.
    const marked = world('tactical', { events: [row(1, 6, 2), wander(2, 16, 12)] });
    beat(marked); beat(marked);
    assert.ok(marked.$gameMap.event(2)._rrStandsBy > 0);
    assert.equal(Object.keys(marked.$gameMap.event(2)).includes('_rrStandsBy'), false);
});

//-----------------------------------------------------------------------------
// 2.6 One answer to "is this event a unit now".

test('the start, the map\'s own start and the join give one answer: a row with no met page, a comment unit on and off its page, an erased event, a side a command changed', () => {
    const comment = text => ({ code: 108, indent: 0, parameters: [text] });
    const events = () => [
        row(1, 4, 2, 1, { pages: [behind(5)] }),                                                                        // a row whose only page needs switch 5
        event(2, 5, 2, { pages: [page(), Object.assign(behind(6), { list: [comment('<unit: enemy 2>'), end] })] }),      // an enemy by a comment on page 2 (switch 6)
        row(3, 4, 4),                                                                                                   // an enemy row
        row(4, 5, 4)                                                                                                    // an enemy row a command turns into a bystander
    ];
    const answers = (w, eventId) => {
        const F = w.ReactorFight, e = w.$gameMap.event(eventId);
        const unit = F.eventUnit(e);
        return { unit: unit ? unit.team + ' ' + unit.record + ' ' + unit.id : null, side: F.eventSide(e) };
    };
    // What each of the three takes, in a world of its own with the same switches and commands.
    const taken = (how, setUp) => {
        const w = world('action', { events: events().concat([row(8, 3, 6)]), mapNote: how === 'own' ? '' : '<battle trigger: 0>' });
        w.$dataEnemies[1].params[0] = 9000; w.$dataEnemies[2].params[0] = 9000;
        // The join: a battle that began with event 8 alone looks at the others on its first frame.
        if (how === 'join') w.$gameFight.start({ mode: 'action', taken: [w.$gameMap.event(8)] });
        setUp(w);
        w.run(1);
        if (how === 'start') w.$gameFight.start({ mode: 'action' });
        else beat(w);
        return { battle: inBattle(w).filter(id => id !== 8), w };
    };
    const cases = [
        ['nothing set', () => {}, [3, 4], { 1: null, 2: null, 3: 'enemy enemy 1', 4: 'enemy enemy 1' }],
        ['switch 5 on: the row has a page', w => w.$gameSwitches.setValue(5, true), [1, 3, 4], { 1: 'enemy enemy 1' }],
        ['switch 6 on: the comment\'s page shows', w => w.$gameSwitches.setValue(6, true), [2, 3, 4], { 2: 'enemy enemy 2' }],
        ['the row erased', w => w.$gameMap.event(3).erase(), [4], { 3: null }],
        ['a command made row 4 a bystander', w => w.$gameFight.setEventSide(4, 'neutral'), [3, 4], { 4: 'neutral enemy 1' }],
        ['a command made row 4 an ally', w => w.$gameFight.setEventSide(4, 'ally'), [3, 4], { 4: 'ally enemy 1' }]
    ];
    for (const [name, setUp, expected, units] of cases) {
        const byStart = taken('start', setUp), byOwn = taken('own', setUp), byJoin = taken('join', setUp);
        assert.deepEqual(byStart.battle, expected, `${name}: a battle's start`);
        assert.deepEqual(byOwn.battle, expected, `${name}: the map's own start`);
        assert.deepEqual(byJoin.battle, expected, `${name}: the join`);
        for (const [id, said] of Object.entries(units)) {
            for (const one of [byStart, byOwn, byJoin]) {
                const answer = answers(one.w, Number(id));
                assert.equal(answer.unit, said, `${name}: event ${id}`);
                assert.equal(answer.side, said ? said.split(' ')[0] : '', `${name}: event ${id}'s side`);
            }
        }
    }
    // The answer is the caller's own record each time, and what a page names is read once.
    const w = world('action', { events: events() }), F = w.ReactorFight, e = w.$gameMap.event(3);
    const first = F.eventUnit(e);
    first.team = 'ally';
    assert.equal(F.eventUnit(e).team, 'enemy');
    assert.equal(F.eventSide(w.$gameMap.event(2)), '');
    let reads = 0;
    const unitSpecOf = F.unitSpecOf;
    F.unitSpecOf = (data, list) => { reads++; return unitSpecOf(data, list); };
    for (let i = 0; i < 5; i++) { F.eventSide(e); F.eventUnit(e); F.eventSide(w.$gameMap.event(2)); }
    assert.equal(reads, 0, 'kept per page: nothing is read again on the beat');
    assert.equal(F.eventUnit(null), null);
    assert.equal(F.eventSide(null), '');
});

test('the map\'s units are counted on the beat, not every frame, and a start asks the map again', () => {
    const w = world('tactical', { events: [row(1, 12, 2), row(2, 14, 4), unit(3, 16, 6, 'ally 3'), event(4, 10, 10)], mapNote: '<battle trigger: 3>' });
    const F = w.ReactorFight;
    let asked = 0;
    const eventSide = F.eventSide;
    F.eventSide = e => { asked++; return eventSide(e); };
    beat(w);
    assert.equal(asked, 4, 'every event of the map once');
    const census = F.unitEvents();
    assert.deepEqual([census.count, plain(census.events.slice(0, census.count).map(e => e.eventId())), plain(census.teams.slice(0, census.count))], [3, [1, 2, 3], ['enemy', 'enemy', 'ally']]);
    asked = 0;
    for (let i = 0; i < 11; i++) { w.Graphics.frameCount++; w.run(1); }
    assert.equal(asked, 0, 'eleven frames between beats: nobody is asked');
    put(w, 3, 2);
    w.Graphics.frameCount -= 5;
    w.run(1);
    w.Graphics.frameCount += 5;
    assert.equal(asked, 0, 'a new tile between beats counts nobody again: with no enemy in reach, none is asked whether it still is one');
    put(w, 17, 8);
    w.run(1);
    assert.equal(asked, 0, 'nor is an ally, 2.2 tiles off: only those the count had as enemies');
    w.Graphics.frameCount++;
    w.run(1);
    assert.equal(asked, 4, 'the next beat');
    asked = 0;
    assert.equal(F.unitEvents(), census, 'the same lists, reused');
    assert.equal(asked, 0);
    F.unitEvents(true);
    assert.equal(asked, 4, 'a battle about to start counts the map again');
});

//-----------------------------------------------------------------------------
// 2.10 One battle at a time.

test('Start Battle on Map reached while a battle runs gives that battle its goal and terms, brings its units and waits for that battle', () => {
    const second = [reactor('StartMapBattle', { mode: 'tactical', who: 'map', objective: 'survive', turnsToSurvive: 9, canEscape: false, canLose: true, wait: true, resultVariable: 3 })].concat(branches());
    const w = world('action', { events: [row(1, 6, 2), row(2, 18, 12), event(9, 19, 14, { pages: [page({ list: second.concat([end]) })] })], mapNote: '<battle trigger: 0>' });
    const fight = w.$gameFight, F = w.ReactorFight;
    w.$dataEnemies[1].params[0] = 9000;
    assert.ok(fight.start({ mode: 'action', who: 'near', canEscape: true, canLose: false }) > 0);
    w.run(2);
    assert.deepEqual(inBattle(w), [1]);
    // The map's event reaches the command.
    w.$gameMap._interpreter.setup(second.concat([end]), 9);
    w.run(2);
    assert.equal(fight.serial(), 1, 'no second battle');
    assert.equal(fight.mode(), 'action', 'the running battle keeps its mode');
    assert.deepEqual(plain(fight.objective()), { type: 'survive', turns: 9 }, 'its goal is the command\'s');
    assert.deepEqual([fight._options.canEscape, fight._options.canLose], [false, true], 'and so are Can Escape and Can Lose');
    assert.deepEqual(inBattle(w), [1, 2], 'the units it would have taken join');
    assert.equal(w.$gameMap._interpreter._waitMode, 'reactorFight', 'the event waits');
    assert.equal(fight.waitingInterpreter(), w.$gameMap._interpreter, 'for the battle that runs');
    assert.deepEqual(switches(w), []);
    fight.end(F.LOSE, true);
    w.run(300, () => w.$gameSwitches.value(4));
    assert.deepEqual(switches(w), [3, 4], 'If Lose: the branch follows that battle\'s result');
    assert.equal(w.$gameVariables.value(3), F.LOSE);
    assert.equal(w.$gameParty.inBattle(), false);
    assert.deepEqual([...w.pushed], []);
    // "Near the party" brings what the rule takes there, and leaves a unit across the map outside.
    const near = world('action', { events: [row(1, 6, 2), row(2, 18, 12), row(3, 2, 7)], mapNote: '<battle trigger: 0>' });
    near.$dataEnemies[1].params[0] = 9000;
    wall(near, 2, 5);
    assert.ok(near.$gameFight.start({ mode: 'action', who: 'near', canEscape: true }) > 0);
    near.run(2);
    assert.deepEqual(inBattle(near), [1], 'the one behind the wall is not seen, the other is across the map');
    near.$dataMap.data[5 * 20 + 2] = 1536;
    near.$gameMap.refresh();
    near.$gameMap._interpreter.setup([reactor('StartMapBattle', { who: 'near', wait: true }), end], 9);
    near.Graphics.frameCount = Math.floor(near.Graphics.frameCount / 12) * 12 + 5;
    near.run(1);
    assert.deepEqual(inBattle(near), [1, 3], 'the command brings the one the rule now takes, and not the unit 19 tiles off');
    assert.equal(near.$gameFight.serial(), 1);
    // A battle kept on another map while the party is away gives way to the command here: it ends as an escape,
    // and the command's battle is fought on this map, the event waiting for it.
    const keptAway = () => {
        const away = world('action', { events: [row(1, 6, 2)], mapNote: '<battle trigger: 0>' });
        away.$dataEnemies[1].params[0] = 9000;
        assert.ok(away.$gameFight.start({ mode: 'action', who: 'near', onTransfer: 'keep' }) > 0);
        away.run(2);
        arrive(away, 2, '<battle trigger: 0>', 2, 2);
        return away;
    };
    const away = keptAway();
    away.$gameMap._interpreter.setup(second.concat([end]), 9);
    away.run(3);
    assert.equal(away.$gameFight.resultOf(1), F.ESCAPE, 'the battle left behind ended as an escape');
    assert.deepEqual([away.$gameFight.serial(), away.$gameFight.isHere(), away.$gameFight.mode()], [2, true, 'tactical'], 'the command\'s battle runs here');
    assert.deepEqual(plain(away.$gameFight.objective()), { type: 'survive', turns: 9 });
    assert.equal(away.$gameMap._interpreter._waitMode, 'reactorFight', 'the event waits for it');
    assert.deepEqual(switches(away), []);
    // Ended from afar (a script's call), a kept battle leaves no hold on the map the party stands on: its units are another map's events.
    const afar = keptAway();
    afar.run(3);
    afar.$gameFight._ending = { result: F.ESCAPE, shown: true, quiet: true };
    afar.$gameFight.finish();
    assert.equal(afar.$gameFight.isActive(), false);
    assert.deepEqual([hold(afar), heldUnits(afar)], [[false, 0], []]);
});

test('Battle Processing reached while a battle runs brings its troop into it and waits; the battle screen never opens over a battle on the map', () => {
    const list = [{ code: 301, indent: 0, parameters: [0, 1, true, true] }].concat(branches());
    const w = world('tactical', { events: [row(1, 6, 2, 2)], mapNote: '<battle trigger: 0>' });
    const fight = w.$gameFight, F = w.ReactorFight;
    w.$dataEnemies[2].params[0] = 9000;
    w.$dataEnemies[1].params[0] = 9000;
    assert.ok(fight.start({ mode: 'tactical', canEscape: true, canLose: true }) > 0);
    w.run(2);
    assert.equal(fight.units({ team: 'enemy' }).length, 1);
    w.$gameMap._interpreter.setup(list.concat([end]), 0);
    w.run(2);
    assert.deepEqual([...w.pushed], [], 'no battle screen over the battle on the map');
    assert.equal(w.$gameParty.inBattle(), false);
    assert.equal(fight.serial(), 1);
    assert.equal(fight.units({ team: 'enemy' }).length, 3, 'the troop\'s two members came into the running battle');
    assert.equal(w.$gameMap._interpreter._waitMode, 'reactorFight');
    fight.end(F.WIN, true);
    w.run(300, () => w.$gameSwitches.value(4));
    assert.deepEqual(switches(w), [1, 4], 'If Win, from that battle');
    // The same in a game whose mode is Classic, during a battle a command started on the map.
    const c = world('classic', { events: [row(1, 6, 2, 2)], mapNote: '<battle trigger: 0>' });
    c.$dataEnemies[2].params[0] = 9000;
    assert.ok(c.$gameFight.start({ mode: 'action' }) > 0);
    c.run(2);
    c.$gameMap._interpreter.setup(list.concat([end]), 0);
    c.run(2);
    assert.deepEqual([...c.pushed], [], 'Classic is the mode in force, and still no battle screen');
    assert.equal(c.$gameFight.units({ team: 'enemy' }).length, 3);
});

test('a battle page never waits for the battle it runs in', () => {
    const hookPage = list => Object.assign(page({ list: list.concat([end]) }), { rrFightHook: { on: 'battleStart' } });
    const inner = [reactor('StartMapBattle', { mode: 'tactical', who: 'map', wait: true }), { code: 601, indent: 0, parameters: [] }, on(1), { code: 0, indent: 1, parameters: [] }, { code: 604, indent: 0, parameters: [] },
        { code: 301, indent: 0, parameters: [0, 1, true, true] }, { code: 601, indent: 0, parameters: [] }, on(2), { code: 0, indent: 1, parameters: [] }, { code: 604, indent: 0, parameters: [] }, on(5, 0)];
    const w = world('action', { events: [row(1, 6, 2, 2), event(7, 12, 12, { pages: [page(), hookPage(inner)] })], mapNote: '<battle trigger: 0>' });
    const fight = w.$gameFight;
    w.$dataEnemies[2].params[0] = 9000; w.$dataEnemies[1].params[0] = 9000;
    assert.ok(fight.start({ mode: 'action', canEscape: true }) > 0);
    w.run(20, () => w.$gameSwitches.value(5));
    assert.equal(w.$gameSwitches.value(5), true, 'the page ran to its end while the battle went on');
    assert.equal(fight.isActive(), true);
    assert.deepEqual([1, 2].map(id => w.$gameSwitches.value(id)), [false, false], 'none of its result rows is taken: the battle has no result yet');
    assert.equal(fight.units({ team: 'enemy' }).length, 3, 'its Battle Processing brought the troop');
    assert.equal(w.ReactorFight.isBattlePage(fight._hookInterpreter), true);
    assert.equal(w.ReactorFight.isBattlePage(w.$gameMap._interpreter), false);
    // One found waiting (a save made by an older game) is let go.
    const waiting = fight.hookInterpreter();
    waiting._branch = {}; waiting._indent = 0;
    waiting._rrFightSerial = fight.serial();
    waiting._waitMode = 'reactorFight';
    assert.equal(waiting.updateWaitMode(), false);
    assert.equal(waiting._waitMode, '');
});

//-----------------------------------------------------------------------------
// 2.15, 4.5 Start Battle on Map where the mode is Classic.

test('Start Battle on Map with "This map\'s mode (Classic)" opens the battle screen against the enemy rows near the party, and never falls back to Tactical', () => {
    const start = args => [reactor('StartMapBattle', Object.assign({ who: 'near', wait: true, canEscape: true, canLose: false }, args))].concat(branches());
    const w = classicWorld({ events: [row(1, 6, 2), row(2, 18, 12), unit(3, 4, 4, 'enemy 1'), starter(9, start({ resultVariable: 2 }))], mapNote: '<battle trigger: 0>' });
    const C = w.ReactorFight.Classic, calls = [];
    const real = C.start;
    // The battle screen stands in: asked for, the scene changes (the event stops there, as after Battle Processing) until its result is told.
    let result = null, changing = false;
    w.SceneManager.isSceneChanging = () => changing;
    C.start = (rows, options) => { calls.push({ rows: rows ? Array.from(rows, e => e.eventId()) : null, options: Object.assign({}, options, { onResult: typeof options.onResult }) }); result = options.onResult; changing = true; return 77; };
    w.$gameVariables.setValue(2, 99);
    w.run(3);
    assert.deepEqual(switches(w), [], 'the event waits while the battle screen is up');
    assert.equal(w.$gameFight.isActive(), false, 'no battle on the map');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].rows.filter(id => id !== 3), [1], 'what the rule takes round the party (the battle screen keeps the enemy rows among them)');
    assert.deepEqual(calls[0].options, { canEscape: true, canLose: false, encounter: false, onResult: 'function' }, 'the command\'s terms, and no first strike or surprise');
    // The result reaches the event's rows and its variable, as Battle Processing's does.
    result(1);
    changing = false;
    w.run(3);
    assert.deepEqual(switches(w), [2, 4], 'If Escape');
    assert.equal(w.$gameVariables.value(2), 1);
    // "Every unit on this map": the whole map's rows.
    C.start = real;
    const whole = classicWorld({ events: [row(1, 6, 2), row(2, 18, 12), starter(9, start({ who: 'map' }))], mapNote: '<battle trigger: 0>' });
    const all = recordScreen(whole);
    whole.run(3);
    assert.deepEqual(all.map(call => call.rows), [null]);
    assert.deepEqual(switches(whole), [1, 4], 'nobody to fight (the screen did not open): on down If Win');
    // For real: the screen opens against the row.
    const live = classicWorld({ events: [row(1, 6, 2), starter(9, start({}))], mapNote: '<battle trigger: 0>' });
    live.run(3);
    assert.deepEqual([...live.pushed], ['Scene_Battle']);
    assert.equal(live.ReactorFight.Classic.isRunning(), true);
    assert.equal(live.$gameFight.isActive(), false);
    assert.equal(live.BattleManager._preemptive || live.BattleManager._surprise, false);
    // The rows that fight are under the hold: after an escape the map's own start opens no second screen beside them.
    const tagged = classicWorld({ events: [row(1, 6, 2), starter(9, start({}))], mapNote: '<battle trigger: 6>' });
    tagged.$dataEnemies[1].params[0] = 9000;
    tagged.run(3);
    assert.deepEqual([...tagged.pushed], ['Scene_Battle']);
    assert.deepEqual(heldUnits(tagged), [1]);
    vm.runInContext('new Scene_Battle().terminate();', tagged);
    for (let i = 0; i < 3; i++) beat(tagged);
    assert.deepEqual([...tagged.pushed], ['Scene_Battle'], 'held beside the row it escaped from, 4 tiles off');
    put(tagged, 16, 2);
    beat(tagged);
    assert.deepEqual(hold(tagged), [false, 0]);
    put(tagged, 4, 2);
    beat(tagged);
    assert.deepEqual([...tagged.pushed], ['Scene_Battle', 'Scene_Battle'], 'out of its reach once, then back: the map starts the next one');
    // A troop the command names is fought on the battle screen as Battle Processing fights it.
    const troop = classicWorld({ events: [row(1, 6, 2), starter(9, start({ troopId: 2, canLose: true }))], mapNote: '<battle trigger: 0>' });
    troop.$dataTroops[2].reactorBattle = undefined;
    troop.run(3);
    assert.deepEqual([...troop.pushed], ['Scene_Battle']);
    assert.equal(troop.$gameTroop._troopId, 2);
    assert.deepEqual([troop.BattleManager.canEscape(), troop.BattleManager.canLose()], [true, true]);
    assert.equal(troop.ReactorFight.Classic.isRunning(), false, 'the troop is the Database\'s own, not one made from rows');
    // In a Classic game with no enemy row near, nothing starts at all.
    const none = classicWorld({ events: [starter(9, start({}))], mapNote: '<battle trigger: 0>' });
    none.run(3);
    assert.equal(none.$gameFight.isActive(), false, 'no Tactical battle by default');
    assert.deepEqual([...none.pushed], []);
    assert.deepEqual(switches(none), [1, 4]);
    // A mode the command names is fought on the map, on a Classic map too.
    const named = classicWorld({ events: [row(1, 6, 2), starter(9, start({ mode: 'firstPerson' }))], mapNote: '<battle trigger: 0>' });
    named.run(3);
    assert.equal(named.$gameFight.mode(), 'firstPerson');
    assert.deepEqual([...named.pushed], []);
});

//-----------------------------------------------------------------------------
// The results kept for waiting events.

test('the results of the last 16 battles are kept for an event that waits; an older battle reads as an escape', () => {
    const w = world('action', { mapNote: '<battle trigger: 0>' });
    const fight = w.$gameFight, F = w.ReactorFight;
    for (let i = 1; i <= 20; i++) {
        assert.equal(fight.start({ mode: 'action', canLose: true }), i);
        fight.end(i % 2 ? F.WIN : F.LOSE, true);
        w.run(200, () => !fight.isActive());
        assert.equal(fight.isActive(), false);
    }
    assert.equal(F.RESULTS_KEPT, 16);
    assert.deepEqual(Object.keys(fight._results).map(Number).sort((a, b) => a - b), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    assert.equal(fight.resultOf(20), F.LOSE);
    assert.equal(fight.resultOf(19), F.WIN);
    assert.equal(fight.resultOf(5), F.WIN);
    assert.equal(fight.resultOf(4), F.ESCAPE, 'one let go reads as an escape');
    assert.equal(JSON.parse(JSON.stringify(fight))._results['20'], F.LOSE, 'kept with a save');
});

//-----------------------------------------------------------------------------
// The launch line.

const STAND_INS = `
    Scene_Base = function() {};
    Scene_Base.prototype.start = function() {};
    Scene_Map = function() {};
    Scene_Map.prototype = Object.create(Scene_Base.prototype);
    Object.assign(Scene_Map.prototype, { update() {}, terminate() {}, start() {}, isActive() { return true; } });
    Scene_Boot = function() {};
    Scene_Boot.prototype = Object.create(Scene_Base.prototype);
    Scene_Boot.prototype.start = function() { this.stockStart = true; };
    Scene_Boot.prototype.resizeScreen = function() {};
    Scene_Boot.prototype.updateDocumentTitle = function() {};
    SoundManager.preloadImportantSounds = function() {};
`;
/** A world with a boot scene and a map scene to stand on, and neither driver. */
const staged = (options = {}) => fightWorld(Object.assign({ prepare: ctx => vm.runInContext(STAND_INS, ctx) }, options));

test('Play this battle: playat on the launch line is a new game on that tile, facing that way, and no battle is forced', () => {
    const w = staged({ system: { reactorBattle: { mode: 'action' } }, events: [unit(1, 4, 2, 'enemy 1')] });
    const F = w.ReactorFight;
    const ask = search => { w.location = { search }; return plain(F.playRequest()); };
    assert.equal(ask('?test'), null);
    assert.deepEqual(ask('?test&playat=5,80,60,4'), { mapId: 5, x: 80, y: 60, direction: 4 });
    assert.deepEqual(ask('?test&playat=1,9,6,8'), { mapId: 1, x: 9, y: 6, direction: 8 });
    assert.deepEqual(ask('?test&playat=1,9,6,5'), { mapId: 1, x: 9, y: 6, direction: 2 }, 'a facing that is none faces down');
    assert.equal(ask('?test&playat=1,9'), null);
    assert.equal(ask('?test&playat=1,9,6'), null, 'the four numbers, or nothing');
    assert.equal(ask('?test&fight&fightat=1,9,6'), null, 'the Test battle\'s tokens are another thing');
    assert.equal(ask('?playat=5,80,60,4'), null, 'not a playtest: a game that was deployed starts at its title whatever its address says');
    assert.equal(ask('?contest&playat=5,80,60,4'), null);
    // NW.js hands the line over as an argument.
    const nw = staged();
    nw.Utils.isNwjs = () => true;
    nw.nw = { App: { argv: ['--some-flag', 'test&playat=3,4,5,6'] } };
    assert.deepEqual(plain(nw.ReactorFight.playRequest()), { mapId: 3, x: 4, y: 5, direction: 6 });
    nw.nw = { App: { argv: ['--some-flag', 'playat=3,4,5,6'] } };
    assert.equal(nw.ReactorFight.playRequest(), null, 'no playtest among the arguments');
    nw.nw = { App: { argv: ['test', 'playat=3,4,5,6'] } };
    assert.deepEqual(plain(nw.ReactorFight.playRequest()), { mapId: 3, x: 4, y: 5, direction: 6 }, 'the two words in two arguments');
    // The boot: the title is skipped, a new game is made, the party is sent to the tile facing that way.
    w.location = { search: '?test&playat=1,9,6,6' };
    assert.equal(F.bootRequest(), null, 'it is no Test battle');
    let newGames = 0;
    const setupNewGame = w.DataManager.setupNewGame;
    w.DataManager.setupNewGame = () => { newGames++; };
    const boot = new w.Scene_Boot();
    boot.start();
    w.DataManager.setupNewGame = setupNewGame;
    assert.equal(boot.stockStart, undefined, 'the stock start (the title) is skipped');
    assert.equal(newGames, 1, 'a new game');
    assert.deepEqual([...w.pushed], ['goto:Scene_Map']);
    assert.deepEqual([w.$gamePlayer.isTransferring(), w.$gamePlayer.newMapId(), w.$gamePlayer._newX, w.$gamePlayer._newY, w.$gamePlayer._newDirection], [true, 1, 9, 6, 6]);
    // On the map no battle is forced, however long the party stands beside an enemy: the map's own start decides, as in the game.
    w.$gamePlayer.clearTransferInfo();
    const scene = new w.Scene_Map();
    w.SceneManager._scene = scene;
    scene.start();
    assert.equal(F._bootFight, 0);
    for (let i = 0; i < 10; i++) { scene.update(); beat(w); }
    assert.equal(w.$gameFight.isActive(), false);
    assert.equal(w.$gameFight.serial(), 0);
    // Without the token the game boots as it always does.
    const stock = staged();
    stock.location = { search: '?test' };
    const plainBoot = new stock.Scene_Boot();
    plainBoot.start();
    assert.equal(plainBoot.stockStart, true);
    // In the battle test and the event test the token does nothing.
    const tested = staged();
    tested.location = { search: '?test&playat=1,9,6,6' };
    tested.DataManager.isBattleTest = () => true;
    const battleTest = new tested.Scene_Boot();
    battleTest.start();
    assert.equal(battleTest.stockStart, true);
    // Outside a playtest the boot is the game's own: the title, no new game on a tile the address names.
    for (const search of ['?playat=1,9,6,6', '?fight&fightat=1,9,6']) {
        const shipped = staged();
        shipped.location = { search };
        const boot = new shipped.Scene_Boot();
        boot.start();
        assert.equal(boot.stockStart, true, search);
        assert.deepEqual([...shipped.pushed], [], search);
        assert.equal(shipped.$gamePlayer.isTransferring(), false, search);
    }
    // The editor asks the project's own flow file whether it reads the token.
    assert.ok(source('reactor_fight_flow.js').includes('playat='));
});

test('a scripted Test battle (fight, fightat, fightmode) still starts its battle, with the test troop only where the map has no enemy', () => {
    const w = staged({ events: [unit(1, 18, 12, 'enemy 2')], mapNote: '<battle trigger: 0>' });
    const F = w.ReactorFight;
    w.location = { search: '?test&fight&fightat=1,4,4&fightmode=action' };
    assert.deepEqual(plain(F.bootRequest()), { at: { mapId: 1, x: 4, y: 4 }, mode: 'action' });
    assert.equal(F.playRequest(), null);
    const scene = new w.Scene_Map();
    w.SceneManager._scene = scene;
    scene.start();
    for (let i = 0; i < 4; i++) scene.update();
    assert.equal(w.$gameFight.isActive(), true);
    assert.equal(w.$gameFight.mode(), 'action');
    assert.deepEqual(inBattle(w), [1], 'the map\'s units, however far: the test troop stays home');
    const empty = staged({ mapNote: '<battle trigger: 0>' });
    empty.location = { search: '?test&fight' };
    const second = new empty.Scene_Map();
    empty.SceneManager._scene = second;
    second.start();
    for (let i = 0; i < 4; i++) second.update();
    assert.equal(empty.$gameFight.mode(), 'tactical', 'a Classic game\'s Test battle is Tactical');
    assert.equal(empty.$gameFight.units({ team: 'enemy' }).length, 2, 'the Database\'s test troop');
    // Outside a playtest the words do nothing.
    const shipped = staged({ events: [unit(1, 18, 12, 'enemy 2')], mapNote: '<battle trigger: 0>' });
    shipped.location = { search: '?fight&fightat=1,4,4&fightmode=action' };
    assert.equal(shipped.ReactorFight.bootRequest(), null);
    const third = new shipped.Scene_Map();
    shipped.SceneManager._scene = third;
    third.start();
    for (let i = 0; i < 6; i++) third.update();
    assert.equal(shipped.$gameFight.serial(), 0, 'no battle is forced in a game that was deployed');
});
