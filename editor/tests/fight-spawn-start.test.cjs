'use strict';
// Spawn Unit followed by Start Battle on Map in the same frame (runtime/reactor_fight.js). On a map with model props
// (events from id 10000 up) the spawned event goes into a hole of the event array, which the once-a-frame event list
// (Game_Map.events, reactor_objects_map.js) did not see until the next frame: the battle found no enemy and was won
// on the spot.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fightWorld, event } = require('./helpers/fight-world.cjs');

function world() {
    // A prop-like event far up the id range leaves the array full of holes.
    const w = fightWorld({ events: [event(10001, 15, 12)] });
    w.$dataEnemies[1].params[0] = 9000;
    return w;
}

const call = (w, name, args) => w.PluginManager.callCommand({ _eventId: 0, setWaitMode() {}, character: () => null }, 'RPGReactor', name, args);
const start = { mode: 'tactical', troopId: 0, turns: 'team', objective: 'defeatAll', turnsToSurvive: 0, unitEventId: 0, goalSwitchId: 0,
    goalVariableId: 0, goalValue: 0, onTransfer: 'escape', canEscape: true, canLose: true, wait: false, resultVariable: 1 };

test('a unit spawned in the frame a battle starts is in that battle', () => {
    const w = world();
    // The list is read once in this frame before the spawn, as the map's events are every frame.
    assert.equal(w.$gameMap.events().length, 1);
    call(w, 'SpawnUnit', { record: 'enemy', id: 1, team: 'enemy', at: 'cell', x: 8, y: 2, eventId: 0, template: 0, direction: 4 });
    assert.equal(w.$gameMap.events().length, 2, 'the spawned event is in the list at once');
    w.$gameVariables.setValue(1, -1);
    call(w, 'StartMapBattle', start);
    assert.equal(w.$gameFight.isActive(), true, 'the battle starts: it has an enemy');
    assert.equal(w.$gameFight.units({ team: 'enemy' }).length, 1);
    assert.equal(w.$gameVariables.value(1), -1, 'no result was given before the battle');
});

test('the event list is made again once an event is taken out of the map', () => {
    const w = world();
    call(w, 'SpawnUnit', { record: 'enemy', id: 1, team: 'enemy', at: 'cell', x: 8, y: 2, eventId: 0, template: 0, direction: 4 });
    const spawned = w.$gameMap.events().find(e => e.eventId() !== 10001);
    spawned.erase();
    w.ReactorFight.sweepSpawned();
    assert.equal(w.$gameMap.events().includes(spawned), false);
});

test('Spawn Unit\'s How many spawns that many, the others on the nearest free tiles', () => {
    const w = world();
    call(w, 'SpawnUnit', { record: 'enemy', id: 1, team: 'enemy', at: 'cell', x: 8, y: 2, count: '3' });
    const spawned = w.$gameMap.events().filter(e => e.eventId() !== 10001);
    assert.equal(spawned.length, 3);
    assert.equal(new Set(spawned.map(e => `${e.x},${e.y}`)).size, 3, 'each on a tile of its own');
});

test('Spawn Unit\'s Stays on the map: the unit is kept with the game for its map, through leaving it and coming back', () => {
    const w = world();
    // A transfer reads the map's file again: its own events, none spawned.
    const own = w.$dataMap.events.slice(), reload = () => { w.$dataMap.events = own.slice(); };
    call(w, 'SpawnUnit', { record: 'enemy', id: 1, team: 'enemy', at: 'cell', x: 8, y: 2, stay: 'true' });
    call(w, 'SpawnUnit', { record: 'enemy', id: 1, team: 'enemy', at: 'cell', x: 3, y: 3 });
    const mapId = w.$gameMap.mapId();
    const [kept] = w.$gameMap.events().filter(e => e.eventId() !== 10001 && e.x === 8);
    kept.setDirection(6);
    reload(); w.$gameMap.setup(mapId + 1);
    assert.equal(Object.keys(w.$gameSystem._rrStayingUnits[mapId]).length, 1, 'only the one that stays is kept');
    reload(); w.$gameMap.setup(mapId);
    const back = w.$gameMap.events().filter(e => e.eventId() !== 10001);
    assert.equal(JSON.stringify(back.map(e => [e.x, e.y, e.direction()])), JSON.stringify([[8, 2, 6]]), 'it is back where it stood, as it faced; the other left with the map');
    // Once it is gone from the map (fallen, or removed), it is no longer kept.
    back[0].erase();
    w.ReactorFight.sweepSpawned();
    assert.equal(Object.keys(w.$gameSystem._rrStayingUnits[mapId]).length, 0);
});
