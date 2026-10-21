'use strict';
// Placed enemies on a Classic map (runtime/reactor_fight_classic.js): the enemy rows the start rule takes open
// the battle screen as a troop made for that battle. Who is taken (the rows and the group standing with
// them), the made troop and where its members stand, the record in $dataTroops while the battle runs and
// its leaving, the result (the fallen are defeated units after a win or an escape, nothing after a loss),
// the battle screen's own end, and the two rules that serve every battle screen: the stage and the hold.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');
const { runtimeSource, runtimeRoot } = require('./helpers/runtime-source.cjs');

const classicSource = fs.readFileSync(path.join(runtimeRoot, 'reactor_fight_classic.js'), 'utf8');

/** A function of the battle scene as the game ships it. */
function stockScene(name) {
    const source = runtimeSource('reactor_scenes.js');
    const start = source.indexOf(`Scene_Battle.prototype.${name} = function`);
    assert.ok(start >= 0, `reactor_scenes.js has Scene_Battle.prototype.${name}`);
    return source.slice(start, source.indexOf('\n};', start) + 3);
}

/** The battleback sprite's choice of picture as the game ships it: every function from battleback1Name to autotileType. */
function stockBattlebackRule() {
    const source = runtimeSource('reactor_sprites.js');
    const start = source.indexOf('Sprite_Battleback.prototype.battleback1Name = function');
    const last = source.indexOf('Sprite_Battleback.prototype.autotileType = function', start);
    assert.ok(start >= 0 && last > start, 'reactor_sprites.js has the battleback rule');
    return source.slice(start, source.indexOf('\n};', last) + 3);
}

/** Values made inside the world, as this realm's own (deepEqual does not cross realms). */
const plain = value => JSON.parse(JSON.stringify(value));

const WIN = 0, ESCAPE = 1, LOSE = 2;
const row = (id, x, y, enemyId = 1, extra = {}) => event(id, x, y, { rrUnit: Object.assign({ team: 'enemy', record: 'enemy', id: enemyId }, extra) });

/**
 * The battle world with the battle scene's own end (the shipped terminate and shouldAutosave), the map
 * scene's two functions the file wraps, and the file under test. `saves` holds what an autosave would have
 * found at the moment it was asked for. The party's leader stands at 2,2.
 */
function world(options = {}) {
    const w = fightWorld(options);
    vm.runInContext(`
        Scene_Message = function Scene_Message() {};
        Scene_Message.prototype.terminate = function() {};
        // The map scene: the battle's launch (its stop calls it when the next scene is the battle screen) and
        // whether a scene change must wait for it.
        Scene_Map = function Scene_Map() {};
        launches = 0;
        mapBusy = false;
        Scene_Map.prototype.launchBattle = function() { launches++; };
        Scene_Map.prototype.isBusy = function() { return mapBusy; };
        Scene_Options = function Scene_Options() {};
        Scene_Battle.prototype = Object.create(Scene_Message.prototype);
        Scene_Battle.prototype.constructor = Scene_Battle;
        ${stockScene('terminate')}
        ${stockScene('shouldAutosave')}
        saves = [];
        Scene_Battle.prototype.requestAutosave = function() {
            saves.push({ troopId: $gameTroop._troopId, members: $gameTroop.members().length, troops: $dataTroops.length, fallen: Object.keys($gameFight._fallen || {}).sort() });
        };
        SceneManager._stack = [];
        SceneManager._next = Scene_Map;
        SceneManager.isNextScene = function(sceneClass) { return this._next === sceneClass; };
        SceneManager.pop = function() { this.pushed.push("pop"); };
        DataManager.isPlaytestCheckpointEnabled = () => false;
        BattleManager.setLogWindow({ clear() {} });
        // The battleback sprite's rule, and pictures that answer at once (\`files\` are the ones the project has)
        // or, with \`holdLoads\`, when the test says so.
        Sprite_Battleback = function Sprite_Battleback() {};
        ${stockBattlebackRule()}
        Utils.encodeURI = text => encodeURIComponent(text).replace(/%2F/g, "/");
        Utils.resolveFileCase = url => url;
        Utils.hasEncryptedImages = () => false;
        files = [];
        loads = [];
        holdLoads = false;
        Image = function Image() { this.width = 0; this.url = ""; loads.push(this); };
        Object.defineProperty(Image.prototype, "src", {
            get() { return this.url; },
            set(url) {
                this.url = url;
                if (holdLoads) return;
                if (files.includes(url)) { this.width = 1000; if (this.onload) this.onload(); }
                else if (this.onerror) this.onerror();
            }
        });
        stageNames = () => { const sprite = Object.create(Sprite_Battleback.prototype); return [sprite.battleback1Name(), sprite.battleback2Name()]; };
    `, w);
    vm.runInContext(classicSource, w, { filename: 'reactor_fight_classic.js' });
    w.$dataEnemies[1].name = 'Raider';
    w.$dataEnemies[2].name = 'Raider Cutter';
    w.Classic = w.ReactorFight.Classic;
    /** The battle scene as it starts: the party and the troop are in battle. */
    w.begin = () => vm.runInContext('BattleManager.setLogWindow({ clear() {} }); BattleManager.startBattle();', w);
    w.kill = index => vm.runInContext(`$gameTroop.members()[${index}].addState(1)`, w);
    w.win = () => { for (let i = 0; i < w.$gameTroop.members().length; i++) w.kill(i); vm.runInContext('BattleManager.processVictory(); BattleManager.updateBattleEnd();', w); };
    w.escape = () => vm.runInContext('BattleManager.onEscapeSuccess(); BattleManager.updateBattleEnd();', w);
    w.lose = () => vm.runInContext('for (const actor of $gameParty.members()) actor.addState(1); BattleManager.processDefeat(); BattleManager.updateBattleEnd();', w);
    /** The battle scene ends. `next` is the scene that follows it. */
    w.endScene = (next = 'Scene_Map') => vm.runInContext(`SceneManager._next = ${next}; new Scene_Battle().terminate();`, w);
    w.erased = id => !!w.$gameMap.event(id)._erased;
    w.fallen = () => Object.keys(w.$gameFight._fallen || {}).sort();
    /** A held picture answers: it loaded, or the project does not have it. */
    w.answer = (index, found) => { const image = w.loads[index]; if (found) { image.width = 1000; image.onload(); } else image.onerror(); };
    /** Whether a scene change must wait for the map scene. */
    w.busy = () => vm.runInContext('new Scene_Map().isBusy()', w);
    /** A battle screen somebody else opens from the map (Battle Processing, a random encounter): the map scene stops for it. */
    w.stockBattle = () => vm.runInContext('BattleManager.setup(1, true, true); new Scene_Map().launchBattle(); BattleManager.startBattle();', w);
    /** Title > New Game, as DataManager.setupNewGame leaves the game objects. */
    w.newGame = () => vm.runInContext('DataManager.createGameObjects(); $gameParty.setupStartingMembers(); $gameMap.setup(1); $gamePlayer.locate(2, 2); $gamePlayer.refresh();', w);
    return w;
}

const threeRaiders = () => [row(3, 5, 2, 1), row(4, 6, 3, 1), row(5, 7, 2, 2)];

/** A world map (its tileset is the world type) that names no battleback: the stock rule says Grassland. */
function worldMap(files = [], events = threeRaiders()) {
    const w = world({ events });
    w.$dataTilesets[1].mode = 0;
    w.files.push(...files);
    assert.deepEqual(plain(w.stageNames()), ['Grassland', 'Grassland'], 'the stock choice, before any battle');
    return w;
}
const GRASS = ['img/battlebacks1/Grassland.png', 'img/battlebacks2/Grassland.png'];

//-----------------------------------------------------------------------------
// Who fights.

test('the enemy rows among the events are taken, nearest first by a straight line, the event id deciding a tie', () => {
    const w = world({ events: [
        row(3, 2, 7),                    // 5 tiles down: 25
        row(4, 5, 5),                    // 3 across and 3 down: 18, nearer by a straight line though further by steps
        row(5, 2, 4), row(6, 4, 2),      // both 2 tiles off
        row(7, 9, 9, 2)
    ] });
    assert.deepEqual(plain(w.Classic.take(w.$gameMap.events()).map(r => r.eventId)), [5, 6, 4, 3, 7]);
    assert.deepEqual(plain(w.Classic.take([7, 3], false).map(r => r.eventId)), [3, 7], 'event ids are taken as events');
    assert.deepEqual(plain(w.Classic.take().map(r => r.eventId)), [5, 6, 4, 3, 7], 'no list is every event of the map');
    assert.deepEqual(plain(w.Classic.take([w.$gameMap.event(7), 7, 7]).map(r => [r.eventId, r.enemyId])), [[7, 2]], 'an event counts once');
    // An empty list is nobody, not the whole map.
    assert.deepEqual(plain(w.Classic.take([])), []);
    assert.equal(w.Classic.start([]), 0);
    assert.equal(w.Classic.isRunning(), false);
});

test('on a map that loops, the nearest is the nearest across the edge', () => {
    const w = world({ events: [row(3, 12, 2), row(4, 19, 2)] });
    assert.deepEqual(plain(w.Classic.take().map(r => r.eventId)), [3, 4], 'no loop: 10 tiles and 17 tiles');
    w.$dataMap.scrollType = 2;    // loops horizontally: 19 is 3 tiles left of 2
    assert.deepEqual(plain(w.Classic.take().map(r => r.eventId)), [4, 3]);
});

test('allies, bystanders, tag units, actor records, spawned units, events off the map and records that do not exist take no part', () => {
    const w = world({ events: [
        row(3, 4, 2),
        event(4, 5, 2, { rrUnit: { team: 'ally', record: 'enemy', id: 1 } }),
        event(5, 6, 2, { rrUnit: { team: 'neutral', record: 'enemy', id: 1 } }),
        event(6, 7, 2, { note: '<unit: enemy 1>' }),
        event(7, 8, 2, { pages: [page({ list: [{ code: 108, indent: 0, parameters: ['<unit: enemy 1>'] }, { code: 0, indent: 0, parameters: [] }] })] }),
        event(8, 9, 2, { pages: [page({ list: [{ code: 108, indent: 0, parameters: ['PTBS_Enemy: 1'] }, { code: 0, indent: 0, parameters: [] }] })] }),
        // An actor record on the Enemy side, with an id an enemy record has too: it is not fought as that enemy.
        event(9, 10, 2, { rrUnit: { team: 'enemy', record: 'actor', id: 2 } }),
        row(10, 11, 2, 77),
        event(11, 12, 2, { rrUnit: { team: 'enemy', record: 'enemy', id: 1 }, pages: [page({ conditions: Object.assign(page().conditions, { switch1Valid: true, switch1Id: 4 }) })] }),
        row(12, 13, 2),
        event(13, 14, 2)
    ] });
    w.$gameMap.event(12).erase();
    assert.equal(w.Classic.rowOf(9), null);
    // A unit a command spawned stands as an ordinary event on a Classic map.
    const spawnedId = w.ReactorFight.freeEventId();
    w.$gameFight.spawn({ record: 'enemy', id: 1, team: 'enemy', x: 4, y: 4 });
    assert.ok(w.$gameMap.event(spawnedId) && w.$gameMap.event(spawnedId).event().rrUnit, 'the spawned unit is on the map');
    assert.equal(w.Classic.rowOf(spawnedId), null);
    assert.deepEqual(plain(w.Classic.take().map(r => r.eventId)), [3]);
    // None of them comes with a row that fights, however near it stands.
    assert.deepEqual(plain(w.Classic.take([3]).map(r => r.eventId)), [3]);
    // Nothing but those: no battle.
    w.$gameMap.event(3).erase();
    assert.equal(w.Classic.start(), 0);
    assert.equal(w.Classic.isRunning(), false);
    assert.deepEqual(plain(w.pushed), []);
    assert.equal(w.$dataTroops.length, 3, 'no record is made');
    // The row whose page needs a switch is on the map once the switch is on.
    w.$gameSwitches.setValue(4, true);
    w.$gameMap.refresh();
    assert.deepEqual(plain(w.Classic.take().map(r => r.eventId)), [11]);
});

test('a row a command turned into an enemy fights; one turned away from the enemy side does not', () => {
    const w = world({ events: [row(3, 4, 2), event(4, 5, 2, { rrUnit: { team: 'neutral', record: 'enemy', id: 2 } })] });
    assert.deepEqual(plain(w.Classic.take().map(r => r.eventId)), [3]);
    w.$gameFight.setEventSide(4, 'enemy');
    w.$gameFight.setEventSide(3, 'ally');
    assert.deepEqual(plain(w.Classic.take().map(r => [r.eventId, r.enemyId, r.remembered])), [[4, 2, false]], 'and it is not remembered: its own side is not Enemy');
});

test('a group is fought whole: an enemy row within 3 tiles of one that is taken comes with it', () => {
    // A line of three one tile apart, met head on: the middle one is 6 tiles off, its neighbors a little more.
    const w = world({ events: [
        row(3, 8, 2), row(4, 8, 1), row(5, 8, 3),
        row(6, 11, 2),                                                         // 3 tiles behind the middle one
        row(7, 11, 3),                                                         // 3 across and 1 down from it: further than 3
        event(8, 8, 4, { rrUnit: { team: 'ally', record: 'enemy', id: 1 } }),  // an ally beside them
        event(9, 9, 2, { note: '<unit: enemy 1>' })                            // a tag unit beside them
    ] });
    assert.equal(w.Classic.GROUP, 3);
    assert.deepEqual(plain(w.Classic.take([3]).map(r => r.eventId)), [3, 4, 5, 6], 'the rows standing with it, nearest first');
    assert.deepEqual(plain(w.Classic.take([3], false).map(r => r.eventId)), [3], 'a list that is meant as it is');
    // Only the rows near one that was named: 7 stands within 3 tiles of 5 and 6, which were not.
    assert.deepEqual(plain(w.Classic.take([4]).map(r => r.eventId)), [3, 4, 5]);
    // The battle.
    const id = w.Classic.start([3]);
    assert.equal(w.$dataTroops[id].members.length, 4);
    assert.deepEqual(plain(w.Classic._session.members.map(m => m.eventId)), [3, 4, 5, 6]);
    w.begin(); w.win(); w.endScene();
    assert.deepEqual([3, 4, 5, 6, 7].map(w.erased), [true, true, true, true, false]);
    assert.deepEqual([8, 9].map(w.erased), [false, false]);
    // A start that names its rows and wants no others.
    const v = world({ events: [row(3, 8, 2), row(4, 8, 1), row(5, 8, 3)] });
    v.Classic.start([3], { group: false });
    assert.deepEqual(plain(v.Classic._session.members.map(m => m.eventId)), [3]);
    // The distance is a setting of the file: none.
    const u = world({ events: [row(3, 8, 2), row(4, 8, 1), row(5, 8, 3)] });
    u.Classic.GROUP = 0;
    assert.deepEqual(plain(u.Classic.take([3]).map(r => r.eventId)), [3]);
});

test('at most 8 fight: the nearest, and the rest stay on the map', () => {
    const events = [];
    for (let i = 0; i < 10; i++) events.push(row(3 + i, 3 + i, 2));
    const w = world({ events });
    const id = w.Classic.start(w.$gameMap.events());
    assert.ok(id > 0);
    assert.equal(w.$dataTroops[id].members.length, 8);
    assert.deepEqual(plain(w.Classic._session.members.map(m => m.eventId)), [3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(w.$gameTroop.members().length, 8);
    w.begin(); w.win(); w.endScene();
    assert.deepEqual([11, 12].map(w.erased), [false, false], 'the two furthest were not in the battle');
    assert.deepEqual([3, 4, 5, 6, 7, 8, 9, 10].map(w.erased), new Array(8).fill(true));
    // The group counts toward the 8: one row named, nine standing with it.
    const many = [row(3, 8, 7)];
    [[6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [6, 8], [7, 8], [8, 8], [9, 8]].forEach(([x, y], i) => many.push(row(4 + i, x, y)));
    const v = world({ events: many });
    assert.deepEqual(plain(v.Classic.take([3]).map(r => r.eventId)), [4, 5, 6, 9, 3, 10, 7, 11], 'the nearest 8 to the leader, the named row among them');
});

//-----------------------------------------------------------------------------
// The made troop.

test('the troop made from three rows: its record, its name, its members in order, one page that never runs', () => {
    const w = world({ events: threeRaiders() });
    const before = w.$dataTroops.length;
    const id = w.Classic.start([w.$gameMap.event(5), w.$gameMap.event(3), w.$gameMap.event(4)]);
    assert.equal(id, before, 'it stands at the end of the list');
    const record = w.$dataTroops[id];
    assert.equal(record.id, id);
    assert.equal(record.name, 'Raider*2, Raider Cutter');
    assert.deepEqual(plain(record.members), [
        { enemyId: 1, x: 204, y: 437, hidden: false },
        { enemyId: 1, x: 408, y: 437, hidden: false },
        { enemyId: 2, x: 612, y: 437, hidden: false }
    ], 'three in one row across the battle field (816 by 624 here)');
    assert.deepEqual(Object.keys(record).sort(), ['id', 'members', 'name', 'pages']);
    assert.equal(record.pages.length, 1);
    assert.deepEqual(plain(record.pages[0].list), [{ code: 0, indent: 0, parameters: [] }]);
    assert.equal(Object.values(record.pages[0].conditions).some(value => value === true), false, 'no condition is set');
    // The battle's own troop is that record.
    assert.equal(w.$gameTroop._troopId, id);
    assert.equal(w.$gameTroop.troop(), record);
    assert.deepEqual(plain(w.$gameTroop.members().map(e => e.name())), ['Raider A', 'Raider B', 'Raider Cutter']);
    assert.deepEqual(plain(w.$gameTroop.members().map(e => [e.screenX(), e.screenY()])), [[204, 437], [408, 437], [612, 437]]);
    assert.deepEqual(plain(w.Classic._session.members.map(m => [m.eventId, m.enemyId])), [[3, 1], [4, 1], [5, 2]], 'each member remembers its event');
});

test('the members are placed in the battle field (the UI area), not the screen', () => {
    const w = world({ events: threeRaiders() });
    w.Graphics.boxWidth = 808; w.Graphics.boxHeight = 616;
    const id = w.Classic.start();
    assert.deepEqual(plain(w.$dataTroops[id].members.map(m => [m.x, m.y])), [[202, 431], [404, 431], [606, 431]]);
});

test('a troop is named as the Troops page names one: each name once, in order, with its count', () => {
    const w = world();
    assert.equal(w.Classic.troopName([1, 1, 2]), 'Raider*2, Raider Cutter');
    assert.equal(w.Classic.troopName([2, 1, 1, 2, 1]), 'Raider Cutter*2, Raider*3');
    assert.equal(w.Classic.troopName([2]), 'Raider Cutter');
    assert.equal(w.Classic.troopName([]), '');
});

test('positions for 1 to 8 members, front view and side view', () => {
    const w = world();
    const at = (n, side) => plain(w.Classic.positions(n, side, 808, 616).map(p => [p.x, p.y]));
    // Up to four in one row at 0.70 of the height, member k of n at k / (n + 1) of the width.
    assert.deepEqual(at(1, false), [[404, 431]]);
    assert.deepEqual(at(2, false), [[269, 431], [539, 431]]);
    assert.deepEqual(at(3, false), [[202, 431], [404, 431], [606, 431]]);
    assert.deepEqual(at(4, false), [[162, 431], [323, 431], [485, 431], [646, 431]]);
    // Five to eight in two rows: the nearer half in front at 0.72, the rest behind at 0.58, in the gaps of the front row.
    assert.deepEqual(at(5, false), [[202, 444], [404, 444], [606, 444], [303, 357], [505, 357]]);
    assert.deepEqual(at(7, false), [[162, 444], [323, 444], [485, 444], [646, 444], [242, 357], [404, 357], [566, 357]]);
    // Rows as long as each other, front view: the two rows centered together, a quarter step each way.
    assert.deepEqual(at(6, false), [[152, 444], [354, 444], [556, 444], [253, 357], [455, 357], [657, 357]]);
    assert.deepEqual(at(8, false), [[121, 444], [283, 444], [444, 444], [606, 444], [202, 357], [364, 357], [525, 357], [687, 357]]);
    // A side-view game: the same rows on the left 0.55 of the width.
    assert.deepEqual(at(1, true), [[222, 431]]);
    assert.deepEqual(at(2, true), [[148, 431], [296, 431]]);
    assert.deepEqual(at(3, true), [[111, 431], [222, 431], [333, 431]]);
    assert.deepEqual(at(4, true), [[89, 431], [178, 431], [267, 431], [356, 431]]);
    assert.deepEqual(at(5, true), [[111, 444], [222, 444], [333, 444], [167, 357], [278, 357]]);
    assert.deepEqual(at(7, true), [[89, 444], [178, 444], [267, 444], [356, 444], [133, 357], [222, 357], [311, 357]]);
    // Rows as long as each other, side view: the back row's last member stands on the party's side, not against the screen's edge.
    assert.deepEqual(at(6, true), [[111, 444], [222, 444], [333, 444], [167, 357], [278, 357], [389, 357]]);
    assert.deepEqual(at(8, true), [[89, 444], [178, 444], [267, 444], [356, 444], [133, 357], [222, 357], [311, 357], [400, 357]]);
    // Whatever the screen: everyone on the field, nobody on another's spot, no side-view member on the party's part,
    // and nobody nearer a screen edge than a step (three quarters of one where two equal rows are centered).
    for (const [width, height] of [[808, 616], [1912, 1072], [1272, 712]]) {
        for (const side of [false, true]) {
            for (let n = 1; n <= 8; n++) {
                const spots = w.Classic.positions(n, side, width, height);
                assert.equal(spots.length, n);
                assert.equal(new Set(spots.map(p => p.x + ',' + p.y)).size, n, `${n} members at ${width}x${height}: no two on one spot`);
                const field = side ? 0.55 * width : width;
                const perRow = n <= 4 ? n : Math.ceil(n / 2), step = field / (perRow + 1);
                const margin = !side && n > 4 && n % 2 === 0 ? 0.75 * step : step;
                const xs = spots.map(p => p.x);
                assert.ok(Math.min(...xs) >= margin - 0.5, `${n} members, side ${side}, ${width} wide: ${Math.min(...xs)} is at least ${margin} from the left edge`);
                assert.ok(Math.max(...xs) < field, `${n} members, side ${side}: x ${Math.max(...xs)} of ${field}`);
                if (!side) assert.ok(width - Math.max(...xs) >= margin - 0.5, `${n} members, front view, ${width} wide: as far from the right edge`);
                for (const p of spots) assert.ok(p.y > 0.55 * height && p.y <= Math.round(0.72 * height), 'no lower than the lowest line a troop stands on');
            }
        }
    }
    assert.equal(w.Classic.positions(9, false, 808, 616).length, 8, 'never more than a troop shows');
    assert.deepEqual(plain(w.Classic.positions(0, false, 808, 616)), []);
});

test('the line the rows stand on: the project\'s own troops\' line, between the highest line and the stock one', () => {
    const w = world();
    const troop = (id, heights, extra = {}) => Object.assign({ id, name: 'T' + id, members: heights.map((y, i) => ({ enemyId: 1, x: 100 + 100 * i, y, hidden: false })), pages: [] }, extra);
    // The helper's troops stand at the field's top edge (never placed): the stock line.
    assert.equal(w.Classic.troopLine(616), 0.70);
    w.$dataTroops.length = 1;
    assert.equal(w.Classic.troopLine(616), 0.70, 'a project with no troop');
    // The middle of the heights the members stand at.
    w.$dataTroops.push(troop(1, [200, 300]), troop(2, [250]));
    assert.equal(w.Classic.troopLine(500), 0.5);
    w.$dataTroops.push(troop(3, [280]));
    assert.equal(w.Classic.troopLine(500), 0.53, 'an even count: between the two middle ones (250 and 280)');
    // Members never placed, a hole in the list and troops that fight on the map are not counted.
    w.$dataTroops.push(null, troop(5, [0, 0, 0, 0, 0]), troop(6, [40, 40, 40, 40, 40], { reactorBattle: { mode: 'tactical' } }), troop(7, [270], { reactorBattle: { mode: 'classic' } }));
    assert.equal(w.Classic.troopLine(500), 0.54, 'a troop that names Classic counts: 270 is the middle of the five');
    // Never lower than the stock line, never higher than the highest.
    w.$dataTroops.length = 1;
    w.$dataTroops.push(troop(1, [480, 480, 480]));
    assert.equal(w.Classic.troopLine(500), 0.70);
    w.$dataTroops[1] = troop(1, [60, 60, 60]);
    assert.equal(w.Classic.troopLine(500), 0.30);
    assert.equal(w.Classic.troopLine(0), 0.70);
    assert.equal(w.Classic.troopLine(NaN), 0.70);
    // The rows at a line: one row on it; two rows 0.14 apart about it, the front one no lower than 0.72.
    const at = (n, line) => plain(w.Classic.positions(n, false, 1000, 1000, line).map(p => p.y));
    assert.deepEqual(at(3, 0.5), [500, 500, 500]);
    assert.deepEqual(at(5, 0.5), [570, 570, 570, 430, 430]);
    assert.deepEqual(at(5, 0.68), [720, 720, 720, 580, 580]);
    assert.deepEqual(at(3, 0.9), [700, 700, 700], 'a line below the stock one is the stock one');
    assert.deepEqual(at(3, 0.1), [300, 300, 300]);
});

test('in a game whose troops stand high on a big screen, the made troop stands with them', () => {
    // A 1920 by 1080 side-view game whose own troops stand at 430 to 490 of 1072 (its battle interface opens
    // the actor's commands below that), beside older ones left on the stock line.
    const heights = [[678, 457], [436, 436], [436, 436], [436], [436], [430, 490, 430], [430, 490, 430, 490, 430], [430, 490, 430, 490, 430]];
    const make = events => {
        const w = world({ events, system: { optSideView: true } });
        w.Graphics.boxWidth = 1912; w.Graphics.boxHeight = 1072;
        w.$dataTroops.length = 1;
        heights.forEach((list, index) => w.$dataTroops.push({ id: index + 1, name: '', members: list.map((y, i) => ({ enemyId: 1, x: 200 + 110 * i, y, hidden: false })), pages: [] }));
        return w;
    };
    let w = make(threeRaiders());
    let id = w.Classic.start();
    assert.deepEqual(plain(w.$dataTroops[id].members.map(m => [m.x, m.y])), [[263, 436], [526, 436], [789, 436]],
        'on the middle line of the game\'s troops (0.70 of the height would be 750)');
    const eight = [];
    for (let i = 0; i < 8; i++) eight.push(row(3 + i, 3 + i, 2));
    w = make(eight);
    id = w.Classic.start();
    assert.deepEqual(plain(w.$dataTroops[id].members.map(m => [m.x, m.y])),
        [[210, 511], [421, 511], [631, 511], [841, 511], [315, 361], [526, 361], [736, 361], [946, 361]]);
    // The made record is not one of the project's troops: the next battle stands on the same line.
    w.begin(); w.kill(0); w.escape(); w.endScene();
    id = w.Classic.start();
    assert.equal(w.$dataTroops[id].members.length, 7);
    assert.deepEqual(plain(Array.from(new Set(w.$dataTroops[id].members.map(m => m.y)))), [511, 361]);
});

test('the made troop stands on the side-view rows in a side-view game', () => {
    const events = [];
    for (let i = 0; i < 8; i++) events.push(row(3 + i, 3 + i, 2, i % 2 ? 2 : 1));
    const w = world({ events, system: { optSideView: true } });
    const id = w.Classic.start();
    assert.deepEqual(plain(w.$dataTroops[id].members.map(m => [m.x, m.y])),
        plain(w.Classic.positions(8, true, 816, 624).map(p => [p.x, p.y])));
    assert.ok(w.$dataTroops[id].members.every(m => m.x < 0.55 * 816), 'left of the party');
    assert.equal(w.$dataTroops[id].name, 'Raider*4, Raider Cutter*4');
});

//-----------------------------------------------------------------------------
// The flow: a random encounter's.

test('the battle starts as a random encounter does: it can be escaped, a loss is Game Over, the battle scene is pushed', () => {
    const w = world({ events: threeRaiders() });
    let encounters = 0;
    const onEncounter = w.BattleManager.onEncounter;
    w.BattleManager.onEncounter = function() { encounters++; return onEncounter.call(this); };
    w.$gamePlayer._encounterCount = 0;
    const id = w.Classic.start(w.$gameMap.events());
    assert.ok(id > 0);
    assert.deepEqual(plain(w.pushed), ['Scene_Battle']);
    assert.equal(w.BattleManager.canEscape(), true);
    assert.equal(w.BattleManager.canLose(), false);
    assert.equal(encounters, 1, 'the party may strike first or be surprised');
    assert.ok(w.$gamePlayer._encounterCount > 0, 'the count to the next random encounter starts again');
    assert.equal(w.Classic.isRunning(), true);
    assert.equal(w.$gameFight.isActive(), false, 'it is not a battle on the map');
});

test('the options of a scripted start: no escape, a battle that can be lost, no first strike, the result handed back', () => {
    const w = world({ events: threeRaiders() });
    let encounters = 0;
    w.BattleManager.onEncounter = function() { encounters++; };
    const results = [];
    assert.ok(w.Classic.start([3, 4], { group: false, canEscape: false, canLose: true, encounter: false, onResult: n => results.push([n, w.$gameMap.event(3)._erased, !!w.$dataTroops[w.$gameTroop._troopId]]) }) > 0);
    assert.equal(w.BattleManager.canEscape(), false);
    assert.equal(w.BattleManager.canLose(), true);
    assert.equal(encounters, 0);
    assert.equal(w.$gameTroop.members().length, 2);
    w.begin(); w.win();
    assert.deepEqual(results, [[WIN, true, true]], 'once, when the battle ends: the fallen are gone and the troop is still there');
    w.endScene();
    assert.equal(results.length, 1);
});

test('a waiting event\'s branches follow the result: If Win, If Escape, If Lose', () => {
    // What a command that starts this battle does with onResult, as Battle Processing does with its own battle.
    // `silent`: the battle's ending never calls the battle's callback (a plugin's own ending).
    const branchAfter = (end, options = {}, silent = false) => {
        const w = world({ events: threeRaiders() });
        const list = [
            { code: 601, indent: 0, parameters: [] }, { code: 121, indent: 1, parameters: [1, 1, 0] }, { code: 0, indent: 1, parameters: [] },
            { code: 602, indent: 0, parameters: [] }, { code: 121, indent: 1, parameters: [2, 2, 0] }, { code: 0, indent: 1, parameters: [] },
            { code: 603, indent: 0, parameters: [] }, { code: 121, indent: 1, parameters: [3, 3, 0] }, { code: 0, indent: 1, parameters: [] },
            { code: 604, indent: 0, parameters: [] }, { code: 0, indent: 0, parameters: [] }
        ];
        const interpreter = vm.runInContext('new Game_Interpreter()', w);
        interpreter.setup(list, 0);
        const indent = interpreter._indent;
        let told = 0;
        assert.ok(w.Classic.start(w.$gameMap.events(), Object.assign({ onResult: n => { told++; interpreter._branch[indent] = n; } }, options)) > 0);
        w.begin();
        if (silent) w.BattleManager.setEventCallback(null);
        w[end]();
        assert.equal(told, silent ? 0 : 1);
        w.endScene(end === 'lose' && !options.canLose ? 'Scene_Gameover' : 'Scene_Map');
        assert.equal(told, 1, 'told once');
        for (let i = 0; i < 20 && interpreter.isRunning(); i++) interpreter.update();
        return [1, 2, 3].find(id => w.$gameSwitches.value(id)) || 0;
    };
    assert.equal(branchAfter('win'), 1);
    assert.equal(branchAfter('escape'), 2);
    assert.equal(branchAfter('lose', { canLose: true }), 3);
    // A battle that ended without saying so: the result is read from who is left when its scene closes.
    assert.equal(branchAfter('win', {}, true), 1);
    assert.equal(branchAfter('escape', {}, true), 2);
    assert.equal(branchAfter('lose', {}, true), 3);
});

test('nothing starts over a battle: one made here, a battle on the map, a battle screen, a scene already changing', () => {
    const w = world({ events: threeRaiders() });
    // A scene change already asked for.
    w.SceneManager.isSceneChanging = () => true;
    assert.equal(w.Classic.start(), 0);
    w.SceneManager.isSceneChanging = () => false;
    // A battle on the map.
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    assert.equal(w.Classic.start(), 0);
    w.$gameFight._ending = { result: ESCAPE, shown: true, quiet: true };
    w.$gameFight.finish();
    assert.equal(w.$dataTroops.length, 3);
    // One made here.
    const id = w.Classic.start();
    assert.ok(id > 0);
    assert.equal(w.Classic.start(), 0);
    assert.equal(w.$dataTroops.length, id + 1, 'no second record');
    // A battle screen somebody else opened, with enemy rows in reach.
    const v = world({ events: threeRaiders() });
    vm.runInContext('BattleManager.setup(1, true, true); BattleManager.startBattle();', v);
    assert.equal(v.$gameParty.inBattle(), true);
    assert.equal(v.Classic.start([3, 4, 5]), 0);
    assert.equal(v.$gameTroop._troopId, 1, 'the running battle keeps its troop');
    assert.equal(v.$dataTroops.length, 3);
});

//-----------------------------------------------------------------------------
// $dataTroops during and after.

test('the record is in $dataTroops for the whole battle and gone once the battle scene has ended', () => {
    const w = world({ events: threeRaiders() });
    const before = plain(w.$dataTroops);
    const id = w.Classic.start(w.$gameMap.events());
    w.begin();
    // What a plugin reads during the battle.
    assert.equal(w.$dataTroops[w.$gameTroop._troopId], w.$gameTroop.troop());
    assert.equal(w.$gameTroop.troop().members.length, 3);
    assert.equal(w.$gameTroop.troop().pages[0].list[0].code, 0);
    // No page runs, at the start or as the turns pass.
    w.$gameTroop.setupBattleEvent();
    w.$gameTroop.increaseTurn();
    w.$gameTroop.setupBattleEvent();
    assert.equal(w.$gameTroop.isEventRunning(), false);
    w.win();
    assert.equal(w.$dataTroops[id], w.$gameTroop.troop(), 'still there while the victory is shown');
    assert.equal(w.Classic.isRunning(), true);
    w.endScene();
    assert.equal(w.$dataTroops.length, id, 'the list is as long as it was');
    assert.deepEqual(plain(w.$dataTroops), before);
    assert.equal(w.$gameTroop._troopId, 0);
    assert.equal(w.$gameTroop.members().length, 0);
    assert.equal(w.Classic.isRunning(), false);
    // The next battle is made afresh at the same place.
    w.$gameMap.setup(1);
    assert.equal(w.Classic.start(), id);
});

test('$gameTroop is cleared before the battle scene asks for the autosave, its members ended as the battle screen ends them', () => {
    const w = world({ events: threeRaiders() });
    let ended = 0;
    const onBattleEnd = w.Game_Battler.prototype.onBattleEnd;
    w.Game_Battler.prototype.onBattleEnd = function() { if (this.isEnemy()) ended++; return onBattleEnd.call(this); };
    const id = w.Classic.start(w.$gameMap.events());
    w.begin(); w.win(); w.endScene();
    assert.deepEqual(plain(w.saves), [{ troopId: 0, members: 0, troops: id, fallen: ['1,3', '1,4', '1,5'] }],
        'the save holds no troop id past the list\'s end, and it holds the defeated');
    assert.equal(ended, 3, 'each made member is told the battle ended');
    assert.equal(w.$gameParty.inBattle(), false);
    assert.equal(w.$gameTroop.inBattle(), false);
});

test('only the made troop and its record are taken away: a troop set up in its place and a record added after it stay', () => {
    const w = world({ events: threeRaiders() });
    const id = w.Classic.start(w.$gameMap.events());
    w.begin();
    // During the battle a plugin adds a record of its own and sets up another troop.
    w.$dataTroops.push({ id: id + 1, name: 'Later', members: [], pages: [] });
    w.$gameTroop.setup(1);
    w.endScene();
    assert.equal(w.$gameTroop._troopId, 1);
    assert.equal(w.$gameTroop.members().length, 2);
    assert.equal(w.$dataTroops.length, id + 2);
    assert.equal(w.$dataTroops[id], null, 'its place is left empty: the record after it keeps its id');
    assert.equal(w.$dataTroops[id + 1].name, 'Later');
});

test('a battle made any other way is left as it is', () => {
    const w = world({ events: threeRaiders() });
    vm.runInContext('BattleManager.setup(1, true, true); BattleManager.startBattle();', w);
    w.win(); w.endScene();
    assert.deepEqual(plain(w.saves), [{ troopId: 1, members: 2, troops: 3, fallen: [] }]);
    assert.deepEqual([3, 4, 5].map(w.erased), [false, false, false]);
});

test('a scene pushed over the battle does not end it', () => {
    const w = world({ events: threeRaiders() });
    const id = w.Classic.start(w.$gameMap.events());
    w.begin();
    // The battle scene is on the stack: it comes back.
    vm.runInContext('SceneManager._stack = [Scene_Map, Scene_Battle];', w);
    w.endScene('Scene_Options');
    assert.equal(w.Classic.isRunning(), true);
    assert.equal(w.$gameTroop._troopId, id);
    assert.equal(w.$dataTroops[id].members.length, 3);
    assert.deepEqual([3, 4, 5].map(w.erased), [false, false, false]);
    assert.equal(w.$gameFight._triggerHeld, undefined, 'the battle is not over');
    // Back in the battle, and won.
    vm.runInContext('SceneManager._stack = [];', w);
    w.win(); w.endScene();
    assert.equal(w.Classic.isRunning(), false);
    assert.deepEqual([3, 4, 5].map(w.erased), [true, true, true]);
});

test('a battle whose scene never ends is forgotten when the game is made anew', () => {
    // The battle scene never opens (other code replaced the scene change): Title, New Game.
    let w = world({ events: threeRaiders() });
    const before = w.$dataTroops.length;
    assert.ok(w.Classic.start(w.$gameMap.events()) > 0);
    assert.equal(w.$dataTroops.length, before + 1);
    const oldParty = w.$gameParty;
    w.newGame();
    assert.notEqual(w.$gameParty, oldParty, 'the game objects are made');
    assert.equal(w.Classic.isRunning(), false);
    assert.equal(w.$dataTroops.length, before, 'the made record is gone');
    assert.equal(w.Classic._stage, null);
    assert.equal(w.Classic.start(w.$gameMap.events()), before, 'placed battles start again');
    // A scene pushed over the battle leaves for the title: the battle scene does not come back.
    w = world({ events: threeRaiders() });
    w.Classic.start(w.$gameMap.events());
    w.begin();
    vm.runInContext('SceneManager._stack = [Scene_Map, Scene_Battle];', w);
    w.endScene('Scene_Options');
    vm.runInContext('SceneManager._stack = [];', w);
    w.newGame();
    assert.equal(w.Classic.isRunning(), false);
    assert.equal(w.$dataTroops.length, before);
    assert.deepEqual([3, 4, 5].map(w.erased), [false, false, false], 'nothing was settled');
    assert.equal(w.Classic.start(w.$gameMap.events()), before);
    // A record another battle put after the made one keeps its place.
    w = world({ events: threeRaiders() });
    const id = w.Classic.start(w.$gameMap.events());
    w.$dataTroops.push({ id: id + 1, name: 'Later', members: [], pages: [] });
    w.newGame();
    assert.equal(w.$dataTroops[id], null);
    assert.equal(w.$dataTroops[id + 1].name, 'Later');
});

test('a battle whose battle screen never opened stops no other: the next start forgets it', () => {
    // The scene manager as the game has it: the map scene is the scene, and a scene asked for is the next scene.
    const live = () => {
        const w = world({ events: threeRaiders() });
        vm.runInContext(`
            SceneManager._scene = new Scene_Map();
            SceneManager.push = function(sceneClass) { this.pushed.push(sceneClass.name); this._nextScene = new sceneClass(); };
            // The scene change happens.
            turn = () => { SceneManager._scene = SceneManager._nextScene; SceneManager._nextScene = null; };
        `, w);
        return w;
    };
    let w = live();
    const before = w.$dataTroops.length;
    assert.equal(w.Classic.isRunning(), false);
    assert.equal(w.Classic.start(w.$gameMap.events()), before);
    // Asked for and not yet up; up; under a scene pushed over it: running, and nothing starts over it.
    assert.equal(w.Classic.isRunning(), true, 'the battle screen is the next scene');
    assert.equal(w.Classic.start(w.$gameMap.events()), 0);
    vm.runInContext('turn();', w);
    assert.equal(w.Classic.isRunning(), true, 'the battle screen is up');
    assert.equal(w.Classic.start(w.$gameMap.events()), 0);
    vm.runInContext('SceneManager._stack = [Scene_Map, Scene_Battle]; SceneManager._scene = new Scene_Options();', w);
    assert.equal(w.Classic.isRunning(), true, 'the battle screen is under the scene pushed over it');
    assert.equal(w.Classic.start(w.$gameMap.events()), 0);
    assert.equal(w.$dataTroops.length, before + 1);
    // A battle scene of the project's own kind is one.
    vm.runInContext('Scene_OwnBattle = function Scene_OwnBattle() {}; Scene_OwnBattle.prototype = Object.create(Scene_Battle.prototype); SceneManager._stack = [Scene_Map, Scene_OwnBattle];', w);
    assert.equal(w.Classic.isRunning(), true);
    vm.runInContext('SceneManager._stack = [Scene_Map];', w);
    assert.equal(w.Classic.isRunning(), false, 'a stack with no battle screen on it');

    // Another scene is asked for in the battle screen's place before it opens (a plugin's own scene): the
    // battle screen never opens.
    w = live();
    w.Classic.start(w.$gameMap.events());
    vm.runInContext('SceneManager._nextScene = new Scene_Options(); turn();', w);
    assert.equal(w.Classic.isRunning(), false, 'no battle screen anywhere');
    assert.equal(w.$dataTroops.length, before + 1, 'nothing is touched until a battle is asked for');
    // Back on the map the placed enemies fight.
    vm.runInContext('SceneManager._scene = new Scene_Map();', w);
    assert.equal(w.Classic.start(w.$gameMap.events()), before, 'the battle starts, where the forgotten record stood');
    assert.equal(w.$dataTroops.length, before + 1, 'one made record, not two');
    assert.equal(w.Classic.isRunning(), true);
    assert.deepEqual(plain(w.SceneManager.pushed), ['Scene_Battle', 'Scene_Battle']);
    assert.deepEqual([3, 4, 5].map(w.erased), [false, false, false], 'the battle that never was had no result');
    assert.equal(w.$gameFight._triggerHeld, undefined);
    // And it ends as any other.
    vm.runInContext('turn();', w);
    w.begin(); w.win(); w.endScene();
    assert.equal(w.$dataTroops.length, before);
    assert.deepEqual([3, 4, 5].map(w.erased), [true, true, true]);
});

//-----------------------------------------------------------------------------
// The result.

test('won: every member is a defeated unit, erased and remembered, when the battle ends and before its scene closes', () => {
    const w = world({ events: threeRaiders() });
    w.Classic.start(w.$gameMap.events());
    w.begin(); w.win();
    assert.deepEqual([3, 4, 5].map(w.erased), [true, true, true]);
    assert.deepEqual(w.fallen(), ['1,3', '1,4', '1,5']);
    assert.equal(w.$gameFight._fallen['1,3'], true);
    // The rewards are the battle screen's own, over the made troop.
    assert.equal(w.BattleManager._rewards.exp, 25);
    assert.equal(w.BattleManager._rewards.gold, 17);
    assert.equal(w.$gameParty.gold(), 17);
    assert.equal(w.$gameSystem.winCount(), 1);
    assert.deepEqual(plain(w.pushed), ['Scene_Battle', 'pop']);
    assert.equal(w.$gameFight._triggerHeld, undefined, 'the hold is set when the battle screen is left');
    w.endScene();
    assert.equal(w.$gameFight._triggerHeld, true, 'the map starts no battle until the leader has been out of reach once');
});

test('escaped with one killed: that one is gone, the others stand and are unhurt next time', () => {
    const w = world({ events: threeRaiders() });
    const results = [];
    w.Classic.start(w.$gameMap.events(), { onResult: n => results.push(n) });
    w.begin();
    w.kill(1);
    w.$gameTroop.members()[0].gainHp(-20);
    w.escape();
    assert.deepEqual([3, 4, 5].map(w.erased), [false, true, false]);
    assert.deepEqual(w.fallen(), ['1,4']);
    assert.equal(w.$gameSystem.escapeCount(), 1);
    // The result is taken once: a member that falls after it, and a second word from the battle, change nothing.
    w.kill(0);
    w.Classic.onResult(WIN);
    assert.deepEqual([3, 4, 5].map(w.erased), [false, true, false]);
    assert.deepEqual(w.fallen(), ['1,4']);
    assert.deepEqual(results, [ESCAPE]);
    w.endScene();
    assert.deepEqual(results, [ESCAPE]);
    assert.equal(w.$gameFight._triggerHeld, true);
    assert.equal(w.$gameTroop._troopId, 0);
    // The two that stand fight again, with fresh battlers.
    const id = w.Classic.start(w.$gameMap.events());
    assert.deepEqual(plain(w.Classic._session.members.map(m => m.eventId)), [3, 5]);
    assert.equal(w.$dataTroops[id].name, 'Raider, Raider Cutter');
    assert.deepEqual(plain(w.$gameTroop.members().map(e => e.hp === e.mhp)), [true, true]);
});

test('lost: Game Over, and nothing is written or erased', () => {
    const w = world({ events: threeRaiders() });
    const id = w.Classic.start(w.$gameMap.events());
    w.begin();
    w.kill(0);
    w.lose();
    assert.deepEqual(plain(w.pushed), ['Scene_Battle', 'goto:Scene_Gameover']);
    assert.deepEqual([3, 4, 5].map(w.erased), [false, false, false]);
    assert.deepEqual(w.fallen(), []);
    w.endScene('Scene_Gameover');
    assert.deepEqual(w.fallen(), []);
    assert.equal(w.$dataTroops.length, id);
    assert.equal(w.$gameTroop._troopId, 0);
    assert.deepEqual(plain(w.saves), [], 'no autosave on the way to Game Over');
});

test('lost and survived (a start that can be lost): the enemy that fell stands where it was placed', () => {
    const w = world({ events: threeRaiders() });
    const results = [];
    w.Classic.start(w.$gameMap.events(), { canLose: true, onResult: n => results.push(n) });
    w.begin();
    w.kill(2);
    w.lose();
    assert.deepEqual(results, [LOSE]);
    assert.deepEqual(plain(w.pushed), ['Scene_Battle', 'pop']);
    w.endScene();
    assert.deepEqual([3, 4, 5].map(w.erased), [false, false, false]);
    assert.deepEqual(w.fallen(), []);
    assert.deepEqual([3, 4, 5].map(id => [w.$gameMap.event(id).x, w.$gameMap.event(id).y]), [[5, 2], [6, 3], [7, 2]]);
});

test('Comes back: the row is gone for this visit, is not remembered, and stands again when the map is entered again', () => {
    const w = world({ events: [row(3, 5, 2, 1, { returns: true }), row(4, 6, 3, 1)] });
    w.Classic.start(w.$gameMap.events());
    w.begin(); w.win(); w.endScene();
    assert.deepEqual([3, 4].map(w.erased), [true, true]);
    assert.deepEqual(w.fallen(), ['1,4']);
    w.$gameMap.setup(1);
    assert.equal(w.erased(3), false);
    assert.equal(w.Classic.take().some(r => r.eventId === 3), true);
});

test('the defeated are handed to the battle core where it keeps the list', () => {
    const w = world({ events: [row(3, 5, 2, 1), row(4, 6, 3, 1, { returns: true }), row(5, 7, 2, 2)] });
    const calls = [];
    w.$gameFight.setEventDefeated = function(eventId, defeated, mapId) { calls.push([eventId, defeated, mapId]); };
    w.Classic.start(w.$gameMap.events());
    w.begin(); w.win(); w.endScene();
    assert.deepEqual(calls, [[3, true, 1], [5, true, 1]]);
    assert.deepEqual([3, 4, 5].map(w.erased), [true, true, true], 'and each has left the map');
});

test('a member falls on the map its battle started on: on another map only the list is written', () => {
    const w = world({ events: threeRaiders() });
    w.Classic.start(w.$gameMap.events());
    w.begin();
    // The map in play is another one when the result comes: its events with the same ids are not the members.
    w.$gameMap._mapId = 2;
    w.win(); w.endScene();
    assert.deepEqual([3, 4, 5].map(w.erased), [false, false, false]);
    assert.deepEqual(w.fallen(), ['1,3', '1,4', '1,5']);
});

test('a member that hid or ran is not defeated; one that changed its record keeps its event; an added enemy has none', () => {
    const w = world({ events: threeRaiders() });
    w.Classic.start(w.$gameMap.events());
    w.begin();
    w.$gameTroop.members()[0].transform(2);
    w.kill(0);
    w.$gameTroop.members()[1].hide();
    vm.runInContext('$gameTroop._enemies.push(new Game_Enemy(2, 0, 0)); $gameTroop.members()[3].addState(1);', w);
    w.kill(2);
    assert.equal(w.$gameTroop.isAllDead(), true);
    vm.runInContext('BattleManager.processVictory(); BattleManager.updateBattleEnd();', w);
    w.endScene();
    assert.deepEqual([3, 4, 5].map(w.erased), [true, false, true]);
    assert.deepEqual(w.fallen(), ['1,3', '1,5']);
});

test('a battle that ends without saying so (a plugin\'s own ending) is still settled when its scene closes', () => {
    const w = world({ events: threeRaiders() });
    const id = w.Classic.start(w.$gameMap.events());
    w.begin();
    w.BattleManager.setEventCallback(null);
    w.win();
    assert.deepEqual([3, 4, 5].map(w.erased), [false, false, false]);
    w.endScene();
    assert.deepEqual([3, 4, 5].map(w.erased), [true, true, true]);
    assert.deepEqual(w.fallen(), ['1,3', '1,4', '1,5']);
    assert.equal(w.$dataTroops.length, id);
    // And an escape: who is left decides.
    const v = world({ events: threeRaiders() });
    v.Classic.start(v.$gameMap.events());
    v.begin();
    v.BattleManager.setEventCallback(null);
    v.kill(2);
    v.escape();
    v.endScene();
    assert.deepEqual([3, 4, 5].map(v.erased), [false, false, true]);
    assert.deepEqual(v.fallen(), ['1,5']);
    // And a loss: the party fell, nothing is written.
    const u = world({ events: threeRaiders() });
    u.Classic.start(u.$gameMap.events());
    u.begin();
    u.BattleManager.setEventCallback(null);
    u.kill(0);
    u.lose();
    u.endScene('Scene_Gameover');
    assert.deepEqual([3, 4, 5].map(u.erased), [false, false, false]);
    assert.deepEqual(u.fallen(), []);
});

//-----------------------------------------------------------------------------
// The hold.

test('the hold: after any battle screen, whoever opened it, and not while a scene pushed over it is up', () => {
    // Battle Processing beside placed rows: when its battle screen is left, the rows' own battle is held too.
    const w = world({ events: threeRaiders() });
    w.stockBattle();
    w.win();
    vm.runInContext('SceneManager._stack = [Scene_Map, Scene_Battle];', w);
    w.endScene('Scene_Options');
    assert.equal(w.$gameFight._triggerHeld, undefined);
    vm.runInContext('SceneManager._stack = [];', w);
    w.endScene();
    assert.equal(w.$gameFight._triggerHeld, true);
    assert.deepEqual([3, 4, 5].map(w.erased), [false, false, false], 'the rows were no part of that battle');
    // And after a loss that is survived.
    const v = world({ events: threeRaiders() });
    v.Classic.start(v.$gameMap.events(), { canLose: true });
    v.begin(); v.lose(); v.endScene();
    assert.equal(v.$gameFight._triggerHeld, true);
});

//-----------------------------------------------------------------------------
// The stage.

test('the stage: a stock battleback chosen by terrain that the project does not have is left out', () => {
    // The project has neither picture: the battle shows the map behind it.
    let w = worldMap();
    w.Classic.start(w.$gameMap.events());
    assert.deepEqual(plain(w.loads.map(image => image.url)), GRASS, 'both are tried as the battle starts');
    assert.deepEqual(plain(w.stageNames()), ['', '']);
    assert.equal(w.busy(), false, 'both answers are in: nothing to wait for');
    w.begin(); w.win(); w.endScene();
    assert.deepEqual(plain(w.stageNames()), ['Grassland', 'Grassland'], 'the stock rule is as it was once the battle is over');
    assert.equal(w.Classic._stage, null);
    // It has both: both are shown.
    w = worldMap(GRASS);
    w.Classic.start(w.$gameMap.events());
    assert.deepEqual(plain(w.stageNames()), ['Grassland', 'Grassland']);
    // It has one: that one is shown.
    w = worldMap([GRASS[1]]);
    w.Classic.start(w.$gameMap.events());
    assert.deepEqual(plain(w.stageNames()), ['', 'Grassland']);
    // The map scene's own launch does not try them a second time for a battle made here.
    vm.runInContext('new Scene_Map().launchBattle()', w);
    assert.equal(w.loads.length, 2);
    assert.equal(w.launches, 1, 'and the scene\'s own launch runs');
    // An encrypted project's pictures are not tried: the stock choice stands.
    w = worldMap();
    w.Utils.hasEncryptedImages = () => true;
    w.Classic.start(w.$gameMap.events());
    assert.deepEqual(plain(w.loads), []);
    assert.deepEqual(plain(w.stageNames()), ['Grassland', 'Grassland']);
    assert.equal(w.busy(), false);
});

test('the stage: the picture is asked for by the address the game loads it from', () => {
    // A name is encoded as the image loader encodes it.
    let w = worldMap(['img/battlebacks1/Old%20Road.png']);
    vm.runInContext('Sprite_Battleback.prototype.overworldBattleback1Name = () => "Old Road";', w);
    w.Classic.start(w.$gameMap.events());
    assert.deepEqual(plain(w.loads.map(image => image.url)), ['img/battlebacks1/Old%20Road.png', GRASS[1]]);
    assert.deepEqual(plain(w.stageNames()), ['Old Road', '']);
    // The file's own letter case on disk is used.
    w = worldMap(['img/battlebacks1/GRASSLAND.png']);
    const asked = [];
    w.Utils.resolveFileCase = (url, suffix) => { asked.push([url, suffix]); return url.replace('battlebacks1/Grassland', 'battlebacks1/GRASSLAND'); };
    w.Classic.start(w.$gameMap.events());
    assert.deepEqual(asked, [[GRASS[0], ''], [GRASS[1], '']]);
    assert.deepEqual(plain(w.stageNames()), ['Grassland', '']);
});

test('the stage: a picture that is slow to answer is waited for, and one the project has is never left out', () => {
    let w = worldMap(GRASS);
    w.holdLoads = true;
    assert.equal(w.busy(), false, 'nothing is tried outside a battle\'s start');
    w.Classic.start(w.$gameMap.events());
    // No answer yet: the scene change to the battle waits for the map scene.
    assert.equal(w.busy(), true);
    assert.deepEqual(plain(w.stageNames()), ['Grassland', 'Grassland'], 'unanswered, a picture is asked for as the stock rule asks');
    assert.deepEqual(Array.from(w.Classic._stage.tried, entry => entry.image === null), [false, false], 'each picture is kept while it loads');
    w.answer(0, true);
    assert.equal(w.busy(), true, 'one answer is still out');
    w.answer(1, false);
    assert.equal(w.busy(), false);
    assert.deepEqual(plain(w.stageNames()), ['Grassland', ''], 'the one that loaded is shown, the one the project does not have is left out');
    assert.deepEqual(Array.from(w.Classic._stage.tried, entry => entry.image), [null, null], 'a picture that has answered is let go: the battle holds no second copy of its stage');
    // The wait has an end: 180 frames from the battle's start. A picture unanswered then is asked for as the stock rule asks.
    w = worldMap(GRASS);
    w.holdLoads = true;
    w.Graphics.frameCount = 1000;
    w.Classic.start(w.$gameMap.events());
    w.Graphics.frameCount = 1179;
    assert.equal(w.busy(), true);
    w.Graphics.frameCount = 1180;
    assert.equal(w.busy(), false);
    assert.deepEqual(plain(w.stageNames()), ['Grassland', 'Grassland']);
    // The map scene's own reasons to be busy stand.
    w.mapBusy = true;
    assert.equal(w.busy(), true);
});

test('the stage: every battle screen opened from the map gets it', () => {
    // Battle Processing or a random encounter on a world map whose project has no stock battlebacks.
    let w = worldMap();
    w.stockBattle();
    assert.equal(w.launches, 1, 'the map scene\'s own launch runs');
    assert.deepEqual(plain(w.loads.map(image => image.url)), GRASS);
    assert.deepEqual(plain(w.stageNames()), ['', ''], 'the battle shows the map behind it instead of stopping on a missing picture');
    w.win(); w.endScene();
    assert.equal(w.Classic._stage, null);
    assert.deepEqual(plain(w.stageNames()), ['Grassland', 'Grassland']);
    // The pictures are there: shown as ever.
    w = worldMap(GRASS);
    w.stockBattle();
    assert.deepEqual(plain(w.stageNames()), ['Grassland', 'Grassland']);
    // Each battle tries its own: the next one stands on other ground.
    w.win(); w.endScene();
    w.files.length = 0;
    w.stockBattle();
    assert.equal(w.loads.length, 4);
    assert.deepEqual(plain(w.stageNames()), ['', '']);
    // The rule can be kept to the battles made here.
    w = worldMap();
    w.Classic.STAGE_EVERY_BATTLE = false;
    w.stockBattle();
    assert.deepEqual(plain(w.loads), []);
    assert.deepEqual(plain(w.stageNames()), ['Grassland', 'Grassland']);
    assert.equal(w.launches, 1);
});

test('the stage: a choice by terrain that cannot be made away from its sprite stops no battle', () => {
    // A plugin's choice that reads its own sprite throws when asked without one: that picture is not tried, and
    // the battle scene asks for it as it always did.
    const ownChoice = 'Sprite_Battleback.prototype.overworldBattleback1Name = function() { return this._own.name; };';
    let w = worldMap();
    vm.runInContext(ownChoice, w);
    const id = w.Classic.start(w.$gameMap.events());
    assert.ok(id > 0, 'the battle made here starts');
    assert.deepEqual(plain(w.SceneManager.pushed), ['Scene_Battle']);
    assert.deepEqual(plain(w.loads.map(image => image.url)), [GRASS[1]], 'the other picture is tried as ever');
    assert.equal(w.Classic._stage.tried[0], null);
    assert.equal(w.busy(), false);
    // A battle somebody else opens from the map: the map scene's own launch still runs.
    w = worldMap();
    vm.runInContext(ownChoice, w);
    w.stockBattle();
    assert.equal(w.launches, 1);
    assert.deepEqual(plain(w.loads.map(image => image.url)), [GRASS[1]]);
    vm.runInContext('ownSprite = Object.create(Sprite_Battleback.prototype); ownSprite._own = { name: "Marsh" };', w);
    assert.equal(vm.runInContext('ownSprite.battleback1Name()', w), 'Marsh', 'its own sprite gets its own answer');
    assert.equal(vm.runInContext('ownSprite.battleback2Name()', w), '', 'and the picture the project lacks is left out beside it');
});

test('the stage: a battleback the map names, a map that is not a world map and the battle test are untouched', () => {
    // The map's own battlebacks are asked for as they are, whether the project has them or not.
    let w = world({ events: threeRaiders() });
    w.$dataTilesets[1].mode = 0;
    w.$gameMap.changeBattleback('Ruins', 'Temple');
    w.Classic.start(w.$gameMap.events());
    assert.deepEqual(plain(w.loads), [], 'nothing is tried');
    assert.deepEqual(plain(w.stageNames()), ['Ruins', 'Temple']);
    // A map that is not a world map shows the map behind the battle: no picture to try.
    w = world({ events: threeRaiders() });
    w.Classic.start(w.$gameMap.events());
    assert.deepEqual(plain(w.loads), []);
    assert.deepEqual(plain(w.stageNames()), ['', '']);
    // Only the picture that was tried is ever left out: a battleback named after the battle started is asked for as it is.
    w = worldMap();
    w.Classic.start(w.$gameMap.events());
    assert.deepEqual(plain(w.stageNames()), ['', '']);
    vm.runInContext('Sprite_Battleback.prototype.overworldBattleback1Name = () => "Desert";', w);
    assert.deepEqual(plain(w.stageNames()), ['Desert', '']);
    w.$gameMap.changeBattleback('Ruins', 'Temple');
    assert.deepEqual(plain(w.stageNames()), ['Ruins', 'Temple']);
    // The battle test's battlebacks are the author's.
    w = worldMap();
    w.$dataSystem.battleback1Name = 'Test1';
    w.$dataSystem.battleback2Name = 'Test2';
    w.BattleManager.isBattleTest = () => true;
    w.Classic.tryStage();
    assert.deepEqual(plain(w.loads), []);
    assert.deepEqual(plain(w.stageNames()), ['Test1', 'Test2']);
});

test('the file adds nothing to the game loop: what it wraps runs at a battle\'s start and end, at a scene change and when the game is made', () => {
    assert.equal(/Game_Map\.prototype\.update|Scene_Map\.prototype\.update|Game_Player\.prototype\.update|requestAnimationFrame|setInterval/.test(classicSource), false);
    const wrapped = Array.from(classicSource.matchAll(/^\s*([A-Za-z_]+(?:\.prototype)?\.[A-Za-z0-9_]+)\s*=\s*function/gm), m => m[1]).filter(name => !/^C\./.test(name));
    assert.deepEqual(wrapped, ['Sprite_Battleback.prototype.battleback1Name', 'Sprite_Battleback.prototype.battleback2Name',
        'Scene_Map.prototype.launchBattle', 'Scene_Map.prototype.isBusy', 'Scene_Battle.prototype.terminate', 'DataManager.createGameObjects']);
    // Outside a battle's start the map scene's busy test is the stock one plus one null check.
    const w = world();
    assert.equal(w.Classic._stage, null);
    assert.equal(w.busy(), false);
});
