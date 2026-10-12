'use strict';
// The on-map battle commands from the editor's side: what FightCommandEditor
// writes is what reactor_fight.js reads, run through the real interpreter; the
// list rows say what each does; the System card and the event's Unit row and
// Battle hook write the shapes the runtime reads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');

const FightCommandEditor = require('../src/event/commands/FightCommandEditor.js');
const EventCommandList = require('../src/event/EventCommandList.js');
const EventEditor = require('../src/event/EventEditor.js');
const BattleProcessingEditor = require('../src/event/commands/BattleProcessingEditor.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const end = { code: 0, indent: 0, parameters: [] };

/** A world whose event 1 runs `commands` once, as an autorun, in a game that fights its battles on the map (Tactical). */
function runCommands(commands, options = {}) {
    const list = commands.concat([{ code: 123, indent: 0, parameters: ['A', 0] }, end]);
    const off = page({ conditions: Object.assign(page().conditions, { selfSwitchValid: true, selfSwitchCh: 'A' }) });
    return fightWorld(Object.assign({ system: { reactorBattle: { mode: 'tactical' } } }, options, { events: [event(1, 18, 13, { pages: [page({ trigger: 3, priorityType: 0, list }), off] })].concat(options.events || []) }));
}

test('every command is a Reactor plugin command the event list names by what it does', () => {
    for (const name of FightCommandEditor.NAMES) {
        const built = FightCommandEditor.build(name, {}, 2);
        assert.equal(built.code, 357);
        assert.equal(built.indent, 2);
        assert.deepEqual(built.parameters.slice(0, 3), ['RPGReactor', name, FightCommandEditor.LABELS[name]]);
    }
    // With no Database and no map to look names up in, a line still says what happens.
    assert.equal(FightCommandEditor.summary('ChangeBattleMode', { mode: 'tactical', scope: 'next' }), 'Tactical for the next battle');
    assert.equal(FightCommandEditor.summary('SpawnUnit', { record: 'enemy', id: 2, at: 'cell', x: 12, y: 8 }), 'Enemy 0002 (enemy) at (12, 8)');
    assert.equal(FightCommandEditor.summary('SpawnUnit', { record: 'actor', id: 3, at: 'event', eventId: 0 }), 'Actor 0003 (ally) next to this event');
    assert.equal(FightCommandEditor.summary('StartMapBattle', { troopId: 0, objective: 'survive', turnsToSurvive: 3, wait: true, who: 'near' }), "This map's mode (Classic): defeat every enemy");
    assert.equal(FightCommandEditor.summary('StartMapBattle', { mode: 'tactical', troopId: 0, objective: 'survive', turnsToSurvive: 3, wait: true, who: 'near' }), 'Tactical: survive 3 turns');
    assert.equal(FightCommandEditor.summary('RemoveUnit', { eventId: 0 }), 'This event leaves the battle and the map');
    assert.equal(FightCommandEditor.summary('EndMapBattle', { result: 'lose' }), 'As a loss');
    // Wired where the editor finds Reactor commands.
    assert.match(read('src/event/EventCommandList.js'), /FightCommandEditor\.supports\(name\)\) return this\.fightCommandEditor/);
    assert.match(read('src/event/EventCommandPicker.js'), /title: 'Battles on the Map'/);
    assert.match(read('index.html'), /src\/event\/commands\/FightCommandEditor\.js/);
});

test('Change Battle Mode as written sets the mode the runtime resolves', () => {
    const w = runCommands([FightCommandEditor.build('ChangeBattleMode', { mode: 'action', scope: 'map' }), FightCommandEditor.build('ChangeBattleMode', { mode: 'tactical', scope: 'next' })]);
    w.run(3);
    assert.equal(w.ReactorFight.resolveMode(1), 'tactical', 'the next battle');
    w.ReactorFight.changeMode('default', 'next');
    assert.equal(w.ReactorFight.resolveMode(1), 'action', 'then this map');
});

test('Start Battle on Map as written fights, waits and puts the result in its variable', () => {
    const start = FightCommandEditor.build('StartMapBattle', { mode: 'tactical', troopId: 1, turns: 'initiative', objective: 'defeatAll', onTransfer: 'escape', bgm: 'map', canEscape: true, canLose: true, wait: true, resultVariable: 1 });
    const after = { code: 121, indent: 0, parameters: [4, 4, 0] };
    const w = runCommands([start, after]);
    w.run(3);
    assert.ok(w.$gameFight.isActive());
    assert.equal(w.$gameFight._turns, 'initiative');
    assert.equal(w.$gameFight.mode(), 'tactical');
    assert.equal(w.$gameSwitches.value(4), false, 'the event waits for it');
    w.$gameVariables.setValue(1, 99);
    w.run(8000, () => w.$gameSwitches.value(4));
    assert.equal(w.$gameVariables.value(1), 0, 'a win is 0');
    assert.equal(w.$gameSwitches.value(4), true, 'and the event goes on');
});

test('the survive goal ends the battle as a win after its turns', () => {
    const w = runCommands([FightCommandEditor.build('StartMapBattle', { troopId: 0, objective: 'survive', turnsToSurvive: 2 })], { events: [event(2, 15, 10, { note: '<unit: enemy 1>' })] });
    w.$dataEnemies[1].params = [9999, 0, 1, 999, 5, 5, 1, 5];
    let turn = 0;
    w.run(8000, () => { if (w.$gameFight.isActive()) turn = w.$gameFight.turn(); return turn > 0 && !w.$gameFight.isActive(); });
    assert.equal(turn, 2);
    assert.ok(w.messages.some(text => /victorious/.test(text)));
});

test('Spawn Unit, Remove Unit and End Battle on Map as written', () => {
    const w = fightWorld({ events: [event(2, 15, 10, { note: '<unit: enemy 1>' })] });
    w.$dataEnemies[1].params[0] = 9999;
    w.$gameFight.start({ mode: 'tactical' });
    const interpreter = new w.Game_Interpreter();
    interpreter.setup([
        FightCommandEditor.build('SpawnUnit', { record: 'enemy', id: 2, team: 'enemy', at: 'cell', x: 10, y: 10, template: 0 }),
        FightCommandEditor.build('SpawnUnit', { record: 'actor', id: 3, team: 'ally', at: 'event', eventId: 2, template: 0 }),
        end
    ], 2);
    interpreter.update();
    const enemies = w.$gameFight.units({ team: 'enemy' }), allies = w.$gameFight.units({ team: 'ally' });
    assert.equal(enemies.length, 2, 'the Bat joined the enemies');
    const bat = enemies.find(unit => unit.enemy.enemyId() === 2);
    assert.deepEqual([w.$gameMap.event(bat.eventId).x, w.$gameMap.event(bat.eventId).y], [10, 10]);
    const guest = allies.find(unit => unit.actorId === 3 && !unit.party);
    const at = w.$gameMap.event(guest.eventId);
    assert.ok(Math.abs(at.x - 15) + Math.abs(at.y - 10) <= 2, 'next to event 2');
    assert.equal(w.$dataMap.events[guest.eventId].pages[0].image.characterName, 'Actor1', "an actor spawns in its own character");
    const remover = new w.Game_Interpreter();
    remover.setup([FightCommandEditor.build('RemoveUnit', { eventId: bat.eventId, keep: false }), FightCommandEditor.build('EndMapBattle', { result: 'escape' }), end], 2);
    remover.update();
    assert.ok(bat.gone && w.$gameMap.event(bat.eventId)._erased, 'removed and erased');
    w.run(300, () => !w.$gameFight.isActive());
    assert.equal(w.$gameFight.resultOf(w.$gameFight.serial()), w.ReactorFight.ESCAPE);
    assert.equal(w.$gameParty.gold(), 0, 'a removed unit gives no reward');
});

test("the editor's Unit row, Battle hook and System card write what the runtime reads", () => {
    const F = fightWorld().ReactorFight;
    // The shapes the editor writes (EventEditor.createUnitRow, EventPageEditor.createFightHookRow, the System 1 card).
    // The row's own writer; a move range is stored only when one is typed, so the record's Move decides otherwise.
    const lists = { enemies: [null, { id: 1, name: 'Slime' }, { id: 3, name: 'Bat' }], actors: [null, { id: 1, name: 'Ren' }] };
    const typed = EventEditor.unitRowValue({ team: 'enemy', record: 'enemy', id: 1 }, { team: 'enemy', record: 'enemy:3', move: '5' }, lists);
    assert.deepEqual(typed, { team: 'enemy', record: 'enemy', id: 3, move: 5 });
    assert.deepEqual({ ...F.unitSpecOf({ rrUnit: typed }, []) }, { team: 'enemy', record: 'enemy', id: 3, move: 5 });
    assert.equal('move' in EventEditor.unitRowValue(typed, { team: 'enemy', record: 'enemy:3', move: '' }, lists), false);
    assert.deepEqual({ ...F.unitSpecOf({ rrUnit: { team: 'enemy', record: 'enemy', id: 3, move: 5 } }, []) }, { team: 'enemy', record: 'enemy', id: 3, move: 5 });
    assert.deepEqual({ ...F.unitSpecOf({ rrUnit: { team: 'neutral', id: 0, move: 4 } }, []) }, { team: 'neutral', record: '', id: 0, move: 4 });
    const hookWriter = read('src/event/EventPageEditor.js');
    assert.match(hookWriter, /page\.rrFightHook = next;/);
    for (const raw of [{ on: 'battleStart' }, { on: 'turnStart', turn: 2, team: 'enemy' }, { on: 'turnEnd', turn: 0, team: 'any' }, { on: 'unitDefeated', unit: 'this' }, { on: 'unitEnters', region: 3, team: 'ally' }]) {
        assert.ok(F.normalizeHook(raw), `${raw.on} as the page writes it is a hook`);
    }
    const systemWriter = read('src/database/DatabaseSystem1Editor.js');
    // The card writes the keys it owns over what is there, so terms, partySize and hand-written keys survive a save.
    assert.match(systemWriter, /const battle = Object\.assign\(\{\}, system\.reactorBattle \|\| \{\}, \{ mode, turns \}\);/);
    assert.match(systemWriter, /if \(plain\) delete system\.reactorBattle; else system\.reactorBattle = battle;/);
    const w = fightWorld({ system: { reactorBattle: { mode: 'firstPerson', turns: 'initiative' } } });
    assert.equal(w.ReactorFight.resolveMode(1), 'firstPerson');
    assert.equal(w.ReactorFight.resolveTurns(), 'initiative');
});

test('a switch or a variable can be the goal: the battle is won the moment an event says so', () => {
    const tough = w => { w.$dataEnemies[1].params = [9999, 0, 1, 999, 5, 5, 1, 5]; };
    // A switch goal: nobody falls; the battle ends as a win when the switch turns ON.
    let w = runCommands([FightCommandEditor.build('StartMapBattle', { troopId: 0, objective: 'switch', goalSwitchId: 7 })], { events: [event(2, 15, 10, { note: '<unit: enemy 1>' })] });
    tough(w);
    w.run(200);
    assert.ok(w.$gameFight.isActive(), 'still fighting while the switch is OFF');
    assert.deepEqual({ ...w.$gameFight.objective() }, { type: 'switch', switchId: 7 });
    w.$gameSwitches.setValue(7, true);
    w.run(2000, () => !w.$gameFight.isActive());
    assert.equal(w.$gameFight.isActive(), false);
    assert.ok(w.messages.some(text => /victorious/.test(text)), 'won, with the victory words');
    // A variable goal: won when the variable is at least the value.
    w = runCommands([FightCommandEditor.build('StartMapBattle', { troopId: 0, objective: 'variable', goalVariableId: 3, goalValue: 5 })], { events: [event(2, 15, 10, { note: '<unit: enemy 1>' })] });
    tough(w);
    w.$gameVariables.setValue(3, 4);
    w.run(200);
    assert.ok(w.$gameFight.isActive(), '4 is not yet 5');
    w.$gameVariables.setValue(3, 6);
    w.run(2000, () => !w.$gameFight.isActive());
    assert.equal(w.$gameFight.isActive(), false, 'at least the value wins');
    // What the list rows say.
    assert.equal(FightCommandEditor.summary('StartMapBattle', { mode: 'action', troopId: 0, objective: 'switch', goalSwitchId: 7, who: 'near', wait: true }), 'Action: until switch 0007 is ON');
    assert.equal(FightCommandEditor.summary('ChangeBattleGoal', { objective: 'variable', goalVariableId: 3, goalValue: 5 }), 'Until variable 0003 ≥ 5');
    assert.equal(FightCommandEditor.summary('ChangeBattleGoal', { objective: 'defeatAll' }), 'Defeat every enemy');
});

test('Change Battle Goal as written gives the running battle a new goal, judged at once and kept through a save', () => {
    const w = runCommands([FightCommandEditor.build('StartMapBattle', { troopId: 0, objective: 'survive', turnsToSurvive: 50 })], { events: [event(2, 15, 10, { note: '<unit: enemy 1>' })] });
    w.$dataEnemies[1].params = [9999, 0, 1, 999, 5, 5, 1, 5];
    w.run(100);
    assert.equal(w.$gameFight.objective().type, 'survive');
    // The command, run by the real interpreter (a hook page or any event would do the same).
    const change = FightCommandEditor.build('ChangeBattleGoal', { objective: 'switch', goalSwitchId: 9 });
    w.PluginManager.callCommand({ _eventId: 1 }, 'RPGReactor', 'ChangeBattleGoal', change.parameters[3]);
    assert.deepEqual({ ...w.$gameFight.objective() }, { type: 'switch', switchId: 9 });
    assert.ok(w.$gameFight.isActive(), 'the switch is OFF: the battle goes on under its new goal');
    assert.deepEqual({ ...JSON.parse(JSON.stringify(w.$gameFight))._options.objective }, { type: 'switch', switchId: 9 }, 'the goal is part of what a save keeps');
    // A goal already met when it is set ends the battle there.
    w.$gameSwitches.setValue(8, true);
    w.PluginManager.callCommand({ _eventId: 1 }, 'RPGReactor', 'ChangeBattleGoal', { objective: 'switch', goalSwitchId: 8 });
    w.run(2000, () => !w.$gameFight.isActive());
    assert.equal(w.$gameFight.isActive(), false);
    // With no battle running the command does nothing.
    w.PluginManager.callCommand({ _eventId: 1 }, 'RPGReactor', 'ChangeBattleGoal', { objective: 'defeatAll' });
    assert.equal(w.$gameFight.isActive(), false);
});

test('the Start Battle form: no Music row, a wait worded as what it does, the battle row worded as when it runs', () => {
    const form = read('src/event/commands/FightCommandEditor.js');
    assert.doesNotMatch(form, /row\(t\('Music'\)/, 'the music is the game\'s battle BGM, set by Change Battle BGM');
    assert.match(form, /check\('wait', t\('Wait here until the battle ends'\), form\.wait\)/);
    // An older command that kept the map's music still does: the form starts from a copy of what is stored.
    assert.equal(FightCommandEditor.argsOf('StartMapBattle', { bgm: 'map', wait: false }, FightCommandEditor.formOf('StartMapBattle', { bgm: 'map', wait: false }, {}), {}).bgm, 'map');
    const page = read('src/event/EventPageEditor.js');
    assert.match(page, /tt\('Runs during a battle'\)/);
    assert.match(page, /plain\('', this\._t\('event\.hookNever'\), on\)/, '"Never" has a key of its own: the phrase has another meaning elsewhere');
    for (const label of ['When the battle starts', 'When a turn starts', 'When a turn ends', 'When a unit is defeated', 'When a unit steps on a region']) assert.ok(page.includes(`'${label}'`), label);
    assert.match(page, /words\(this\._t\('event\.hookTurn'\)\)[^\n]*words\(tt\('\(0: every turn\)'\)\)/, 'the turn field says what 0 means');
    assert.match(page, /words\(this\._t\('event\.hookRegion'\)\)/);
    assert.match(page, /event-fight-hook-note/);
    assert.match(read('src/event/EventCommandPicker.js'), /name: 'Change Battle Goal', code: 357, reactor: 'ChangeBattleGoal'/);
    // The battle music still plays unless the command says to keep the map's.
    const w = runCommands([FightCommandEditor.build('StartMapBattle', { troopId: 0, objective: 'defeatAll' })], { events: [event(2, 15, 10, { note: '<unit: enemy 1>' })] });
    w.run(3);
    assert.equal(w.$gameFight._options.bgm, 'battle');
});

test('Change Unit Side as written: an enemy becomes an ally in the running battle and in the ones after', () => {
    const start = FightCommandEditor.build('StartMapBattle', { troopId: 0, objective: 'defeatAll' });
    const w = runCommands([start], { events: [event(2, 15, 10, { note: '<unit: enemy 1>' }), event(3, 16, 11, { note: '<unit: enemy 1>' }), event(4, 14, 12, { note: '<unit: neutral>' })] });
    for (const enemy of [w.$dataEnemies[1]]) enemy.params = [9999, 0, 1, 999, 5, 5, 1, 5];
    w.run(60);
    assert.ok(w.$gameFight.isActive());
    const side = id => w.$gameFight.unitOfEvent(id).team;
    assert.deepEqual([side(2), side(3), side(4)], ['enemy', 'enemy', 'neutral']);
    const command = (eventId, team, self = 1) => w.PluginManager.callCommand({ _eventId: self }, 'RPGReactor', 'ChangeUnitSide', FightCommandEditor.build('ChangeUnitSide', { eventId, team }).parameters[3]);
    command(2, 'ally');
    assert.equal(side(2), 'ally', 'at once, in the battle that is running');
    assert.ok(w.$gameFight.isActive(), 'event 3 is still an enemy: the battle goes on');
    assert.ok(w.$gameFight.units({ team: 'ally', alive: true }).some(unit => unit.eventId === 2), 'and it fights for the party');
    // 0 is the event running the command.
    command(0, 'ally', 3);
    assert.equal(side(3), 'ally');
    w.run(2000, () => !w.$gameFight.isActive());
    assert.equal(w.$gameFight.isActive(), false, 'the last enemy changed sides: no enemy is left, the battle is won');
    // A bystander with no Database record has nothing to fight with.
    assert.equal(w.$gameFight.sideOverride(1, 2), 'ally', 'the side outlasts the battle');
    w.$gameFight.start({ mode: 'tactical' });
    assert.equal(side(2), 'ally', 'the next battle on this map starts with it an ally');
    command(4, 'enemy');
    assert.equal(side(4), 'neutral', 'a bystander with no record cannot be made to fight');
    command(2, 'neutral');
    assert.equal(side(2), 'neutral', 'a fighter can stand aside');
    command(2, '');
    assert.equal(side(2), 'enemy', 'As set: back to the event\'s own side');
    assert.equal(w.$gameFight.sideOverride(1, 2), '');
    // The party's own members never change sides, and the side is part of the save.
    assert.ok(w.$gameFight.units({ team: 'ally' }).some(unit => unit.party));
    assert.equal(JSON.parse(JSON.stringify(w.$gameFight))._sides['1,3'], 'ally');
    // What the list row says, and where the command is found.
    assert.equal(FightCommandEditor.summary('ChangeUnitSide', { eventId: 0, team: 'ally' }), 'This event fights as an ally');
    assert.equal(FightCommandEditor.summary('ChangeUnitSide', { eventId: 5, team: '' }), 'Event 5 goes back to its own side');
    assert.match(read('src/event/EventCommandPicker.js'), /name: 'Change Unit Side', code: 357, reactor: 'ChangeUnitSide'/);
});

//-----------------------------------------------------------------------------
// The dialogs as forms, their list lines, the event's In battle row.

/** A map like North Haven's square: named events, units by row, by Note and by a page comment. */
function northHaven(overrides = {}) {
    const comment = text => ({ code: 108, indent: 0, parameters: [text] });
    const events = [null,
        event(4, 84, 52, { name: 'Villager' }),
        event(12, 80, 57, { name: 'Rhea Voss' }),
        event(16, 82, 55, { name: 'Raider', rrUnit: { team: 'enemy', record: 'enemy', id: 6 } }),
        event(17, 83, 60, { name: 'Raider', rrUnit: { team: 'enemy', record: 'enemy', id: 6 } }),
        event(20, 98, 63, { name: 'Conscript', pages: [page(), page({ list: [comment('<unit: enemy 13>'), end] })] }),
        event(21, 107, 60, { name: 'Raider Captain', note: '<unit: neutral enemy 12>' }),
        event(23, 86, 74, { name: 'Vay Drokan', rrUnit: { team: 'ally', record: 'actor', id: 5 } })];
    const switches = ['', 'Raid started', 'North Haven defended'], variables = ['', 'Battle result', '', 'Spawn X', 'Spawn Y'];
    const system = { switches, variables, reactorBattle: { mode: 'classic', turns: 'team' } };
    return Object.assign({
        map: { id: 5, width: 200, height: 200, note: '<3d>\n<battle mode: firstPerson>', events },
        system, switches, variables, event: events[2],
        enemies: [null, { id: 6, name: 'Raider' }, { id: 12, name: 'Raider Captain' }, { id: 13, name: 'Conscript' }, { id: 16, name: 'Militia Marksman' }],
        actors: [null, { id: 2, name: 'Carol Everson' }, { id: 5, name: 'Vay Drokan' }],
        troops: [null, { id: 1, name: 'Psychronic Battle' }]
    }, overrides);
}

test('every list line reads as a sentence, with names where the map and the Database have them', () => {
    const c = northHaven(), line = (name, args) => FightCommandEditor.summary(name, args, c);
    const start = args => line('StartMapBattle', Object.assign({ who: 'near', wait: true }, args));
    assert.equal(start({ mode: 'firstPerson', objective: 'defeatAll' }), 'First Person: defeat every enemy');
    assert.equal(start({ mode: 'tactical', objective: 'survive', turnsToSurvive: 5 }), 'Tactical: survive 5 turns');
    assert.equal(start({ mode: 'action', objective: 'defeatUnit', unitEventId: 21 }), 'Action: defeat Raider Captain (event 21)');
    assert.equal(start({ mode: 'tactical', objective: 'switch', goalSwitchId: 2 }), 'Tactical: until switch 0002 North Haven defended is ON');
    assert.equal(start({ mode: 'tactical', objective: 'variable', goalVariableId: 1, goalValue: 3 }), 'Tactical: until variable 0001 Battle result ≥ 3');
    assert.equal(start({ mode: '', objective: 'defeatAll' }), "This map's mode (First Person): defeat every enemy");
    assert.equal(start({ mode: 'firstPerson', who: 'map' }), 'First Person: defeat every enemy · every unit on this map');
    assert.equal(line('StartMapBattle', { mode: 'firstPerson', wait: true }), 'First Person: defeat every enemy · every unit on this map', 'no "who" is every unit');
    assert.equal(start({ mode: 'firstPerson', troopId: 1 }), 'First Person against troop 0001: Psychronic Battle: defeat every enemy');
    assert.equal(start({ mode: 'action', wait: false }), 'Action: defeat every enemy (the event carries on)');
    assert.equal(start({ mode: 'tactical', view: 'map' }), "Tactical: defeat every enemy · the map's own camera");
    assert.equal(start({ mode: 'action', view: 'map' }), 'Action: defeat every enemy', 'the view is a Tactical matter');
    // The map's mode in force, worked out as the game does: the map's own, else the game's, else Classic.
    assert.equal(FightCommandEditor.summary('StartMapBattle', { who: 'near', wait: true, objective: 'survive', turnsToSurvive: 5 }, northHaven({ map: { note: '', events: [] } })),
        "This map's mode (Classic): defeat every enemy", 'a Classic battle has one goal');

    const goal = args => line('ChangeBattleGoal', args);
    assert.equal(goal({ objective: 'defeatAll' }), 'Defeat every enemy');
    assert.equal(goal({ objective: 'survive', turnsToSurvive: 5 }), 'Survive 5 turns');
    assert.equal(goal({ objective: 'defeatUnit', unitEventId: 21 }), 'Defeat Raider Captain (event 21)');
    assert.equal(goal({ objective: 'switch', goalSwitchId: 2 }), 'Until switch 0002 North Haven defended is ON');
    assert.equal(goal({ objective: 'variable', goalVariableId: 1, goalValue: 3 }), 'Until variable 0001 Battle result ≥ 3');

    assert.equal(line('ChangeUnitSide', { eventId: 20, team: 'enemy' }), 'Conscript (event 20) fights as an enemy');
    assert.equal(line('ChangeUnitSide', { eventId: 0, team: 'ally' }), 'This event fights as an ally');
    assert.equal(line('ChangeUnitSide', { eventId: 21, team: 'neutral' }), 'Raider Captain (event 21) becomes a bystander');
    assert.equal(line('ChangeUnitSide', { eventId: 20, team: '' }), 'Conscript (event 20) goes back to its own side');

    assert.equal(line('SpawnUnit', { record: 'enemy', id: 6, team: 'enemy', at: 'cell', x: 86, y: 53, direction: 4 }), 'Raider (enemy) at (86, 53), facing left');
    assert.equal(line('SpawnUnit', { record: 'enemy', id: 16, team: 'ally', at: 'cell', x: 105, y: 75, direction: 6 }), 'Militia Marksman (ally) at (105, 75), facing right', 'the side, not the Database list');
    assert.equal(line('SpawnUnit', { record: 'enemy', id: 6, team: 'enemy', at: 'event', eventId: 0 }), 'Raider (enemy) next to this event');
    assert.equal(line('SpawnUnit', { record: 'enemy', id: 6, team: 'enemy', at: 'event', eventId: 12 }), 'Raider (enemy) next to Rhea Voss (event 12)');
    assert.equal(line('SpawnUnit', { record: 'enemy', id: 6, team: 'enemy', at: 'event', eventId: -1 }), 'Raider (enemy) next to the player');
    assert.equal(line('SpawnUnit', { record: 'actor', id: 2, team: 'ally', at: 'variables', x: 3, y: 4 }), 'Carol Everson (ally) at the tile in variables 0003 and 0004');
    assert.equal(line('SpawnUnit', { record: 'enemy', id: 6, team: 'enemy', at: 'event', eventId: 0, count: 3 }), '3 × Raider (enemy) next to this event');
    assert.equal(line('SpawnUnit', { record: 'enemy', id: 6, team: 'neutral', at: 'event', eventId: 0, stay: true }), 'Raider (bystander) next to this event · stays after the battle');

    assert.equal(line('RemoveUnit', { eventId: 20, keep: false }), 'Conscript (event 20) leaves the battle and the map');
    assert.equal(line('RemoveUnit', { eventId: 0, keep: true }), 'This event leaves the battle and stays on the map');
    assert.deepEqual(['win', 'escape', 'lose'].map(result => line('EndMapBattle', { result })), ['As a win', 'As an escape', 'As a loss']);
    assert.equal(line('ChangeBattleMode', { mode: 'firstPerson', scope: 'next' }), 'First Person for the next battle');
    assert.equal(line('ChangeBattleMode', { mode: 'tactical', scope: 'map' }), 'Tactical for this map');
    assert.equal(line('ChangeBattleMode', { mode: 'tactical', scope: 'game' }), 'Tactical for the whole game');
    assert.equal(line('ChangeBattleMode', { mode: 'default', scope: 'map' }), "This map goes back to the game's own mode");
    assert.equal(line('SetTerrainCost', { type: 'region', id: 1, cost: 0 }), 'Region 1 is blocked');
    assert.equal(line('SetTerrainCost', { type: 'terrain', id: 0, cost: 2 }), 'Terrain tag 0 costs 2 steps');
    assert.equal(line('SetTerrainCost', { type: 'region', id: 3, cost: 1 }), 'Region 3 is normal again');
    // No line says "As set", "cell" or names a Database list where a side is meant.
    const all = [start({}), goal({}), line('ChangeUnitSide', {}), line('SpawnUnit', { at: 'variables' }), line('RemoveUnit', {}), line('EndMapBattle', {}), line('ChangeBattleMode', {}), line('SetTerrainCost', {})].join('\n');
    assert.doesNotMatch(all, /As set|\bcell\b|Neutral/);
});

test('a round trip through every dialog loses no argument', () => {
    const c = northHaven();
    const trip = (name, stored, context = c) => FightCommandEditor.argsOf(name, stored, FightCommandEditor.formOf(name, stored, context), context);
    // Rhea Voss's first Spawn Unit, as the Demo stores it: the facing and the event stay.
    const spawn = { at: 'cell', direction: 4, eventId: 0, id: 6, record: 'enemy', team: 'enemy', template: 22, x: 86, y: 53 };
    assert.deepEqual(trip('SpawnUnit', spawn), spawn);
    assert.deepEqual(trip('SpawnUnit', { record: 'actor', id: 2, team: 'ally', at: 'variables', x: 3, y: 4, direction: 6, count: 3, stay: true, template: 0, custom: 'kept' }),
        { record: 'actor', id: 2, team: 'ally', at: 'variables', x: 3, y: 4, direction: 6, count: 3, stay: true, template: 0, custom: 'kept' });
    assert.deepEqual(trip('SpawnUnit', { record: 'enemy', id: 6, team: 'neutral', at: 'event', eventId: 12, x: 9, y: 9, direction: 8 }),
        { record: 'enemy', id: 6, team: 'neutral', at: 'event', eventId: 12, x: 9, y: 9, direction: 8 }, 'a tile kept while the unit stands next to an event');
    // The Demo's raid: the four goal numbers the goal does not use stay too; "who" is written out as what it meant.
    const raid = { mode: 'tactical', troopId: 0, turns: 'team', objective: 'survive', turnsToSurvive: 5, unitEventId: 0, goalSwitchId: 0, goalVariableId: 0, goalValue: 0,
        onTransfer: 'escape', canEscape: false, canLose: true, wait: true, resultVariable: 1, bgm: 'map' };
    assert.deepEqual(trip('StartMapBattle', raid), Object.assign({}, raid, { who: 'map' }));
    const full = { mode: 'tactical', who: 'near', troopId: 1, turns: 'initiative', view: 'map', objective: 'variable', goalVariableId: 1, goalValue: -3, goalText: 'Hold the gate',
        onTransfer: 'keep', canEscape: true, canLose: false, wait: false, custom: 7 };
    assert.deepEqual(trip('StartMapBattle', full), full);
    // On a Classic map the rows that mean nothing are hidden, and what they hold is not touched.
    assert.deepEqual(trip('StartMapBattle', Object.assign({}, full, { mode: '' }), northHaven({ map: { note: '', events: [] } })), Object.assign({}, full, { mode: '' }));
    for (const [name, stored] of [
        ['ChangeBattleGoal', { objective: 'switch', goalSwitchId: 2, goalText: 'Defend North Haven', turnsToSurvive: 9 }],
        ['ChangeUnitSide', { eventId: 20, team: '', note: 'kept' }],
        ['ChangeUnitSide', { eventId: 0, team: 'neutral' }],
        ['RemoveUnit', { eventId: 21, keep: true, extra: 1 }],
        ['EndMapBattle', { result: 'escape', extra: 1 }],
        ['ChangeBattleMode', { mode: 'default', scope: 'map', extra: 1 }],
        ['SetTerrainCost', { type: 'terrain', id: 0, cost: 2, extra: 1 }]
    ]) assert.deepEqual(trip(name, stored), stored, name);
    // A value cleared in the form goes; one never stored is not added.
    const cleared = FightCommandEditor.argsOf('StartMapBattle', full, Object.assign(FightCommandEditor.formOf('StartMapBattle', full, c), { view: '', goalText: '' }), c);
    assert.deepEqual([cleared.view, cleared.goalText], ['', '']);
    const plain = trip('StartMapBattle', { mode: 'action', wait: true });
    for (const key of ['view', 'goalText', 'resultVariable']) assert.equal(key in plain, false, key);
    // A form stored with nothing changed leaves these as they were: a Spawn Unit with no facing gets none
    // (the game then keeps the facing of the pages it copies), one stored as 0 keeps 0.
    const faceless = { record: 'enemy', id: 6, team: 'enemy', at: 'cell', x: 0, y: 0, eventId: 0, template: 22 };
    assert.deepEqual(trip('SpawnUnit', faceless), faceless);
    assert.deepEqual(trip('SpawnUnit', Object.assign({ direction: 0 }, faceless)), Object.assign({ direction: 0 }, faceless));
    assert.equal(FightCommandEditor.formOf('SpawnUnit', faceless, c).direction, 0, 'no button is lit');
    assert.equal(FightCommandEditor.formOf('SpawnUnit', null, c).direction, 2, 'a new command faces down');
    // A Facing button writes the facing; the lit one pressed again takes it off.
    const faced = FightCommandEditor.faced(FightCommandEditor.formOf('SpawnUnit', faceless, c), 8);
    assert.equal(FightCommandEditor.argsOf('SpawnUnit', faceless, faced, c).direction, 8);
    const stored = Object.assign({ direction: 8 }, faceless);
    assert.equal('direction' in FightCommandEditor.argsOf('SpawnUnit', stored, FightCommandEditor.faced(FightCommandEditor.formOf('SpawnUnit', stored, c), 8), c), false);
    // A terrain cost the list does not offer is kept, offered as itself and worded as the list line words it.
    for (const cost of [4, 2.5, 12]) assert.deepEqual(trip('SetTerrainCost', { type: 'region', id: 7, cost }), { type: 'region', id: 7, cost });
    assert.deepEqual(FightCommandEditor.costChoices(FightCommandEditor.formOf('SetTerrainCost', { cost: 4 }, c)), [['0', 'Blocked'], ['2', 'Slow (2 steps)'], ['3', 'Slow (3 steps)'], ['4', 'Slow (4 steps)'], ['1', 'Normal']]);
    assert.deepEqual(FightCommandEditor.costChoices(FightCommandEditor.formOf('SetTerrainCost', null, c)).map(([value]) => value), ['0', '2', '3', '1']);
    assert.equal(FightCommandEditor.formOf('SetTerrainCost', { cost: 'x' }, c).cost, '1');
    // A goal's words go with the goal: changed to a goal that words itself, they are taken out; left alone, they stay.
    const worded = { objective: 'switch', goalSwitchId: 2, goalText: 'Hold the gate' };
    const changed = FightCommandEditor.argsOf('ChangeBattleGoal', worded, Object.assign(FightCommandEditor.formOf('ChangeBattleGoal', worded, c), { objective: 'defeatAll' }), c);
    assert.deepEqual(changed, { objective: 'defeatAll', goalSwitchId: 2 });
    assert.deepEqual(trip('ChangeBattleGoal', worded), worded);
    assert.deepEqual(trip('ChangeBattleGoal', { objective: 'defeatAll', goalText: 'kept: the goal did not change' }), { objective: 'defeatAll', goalText: 'kept: the goal did not change' });
    const toVariable = FightCommandEditor.argsOf('StartMapBattle', Object.assign({ mode: 'action', wait: true }, worded), Object.assign(FightCommandEditor.formOf('StartMapBattle', Object.assign({ mode: 'action', wait: true }, worded), c), { objective: 'variable' }), c);
    assert.equal(toVariable.goalText, 'Hold the gate', 'a switch goal changed to a variable goal keeps its words');
    // A mode the game does not know is the game's own setting, as the game reads it; a new command names Tactical.
    assert.deepEqual(trip('ChangeBattleMode', { mode: 'firstperson', scope: 'map' }), { mode: 'default', scope: 'map' });
    assert.equal(FightCommandEditor.formOf('ChangeBattleMode', null, c).mode, 'tactical');
});

test('what the dialogs decide, without a page: the rows a mode shows, the modes a map offers, the side a record brings, what OK stores', () => {
    const c = northHaven(), F = FightCommandEditor;
    const form = (name, stored, changes) => Object.assign(F.formOf(name, stored, c), changes);
    // Rows: a goal's own fields, nothing of the map's in a Classic battle, the Tactical rows in Tactical only.
    assert.deepEqual(F.shown('StartMapBattle', form('StartMapBattle', null, {}), c), { onmap: true, survive: false, unit: false, goalswitch: false, goalvariable: false, goaltext: false, tactical: false, wait: true, troop: false });
    assert.deepEqual(F.shown('StartMapBattle', form('StartMapBattle', null, { mode: 'tactical', objective: 'variable', wait: false, troopId: 1 }), c),
        { onmap: true, survive: false, unit: false, goalswitch: false, goalvariable: true, goaltext: true, tactical: true, wait: false, troop: true });
    const classic = northHaven({ map: { note: '', events: [] } });
    assert.deepEqual(F.shown('StartMapBattle', form('StartMapBattle', null, { objective: 'survive' }), classic), { onmap: false, survive: false, unit: false, goalswitch: false, goalvariable: false, goaltext: false, tactical: false, wait: true, troop: false });
    assert.equal(F.shown('StartMapBattle', form('StartMapBattle', null, { mode: 'action', objective: 'survive' }), classic).survive, true, 'a mode the command names is fought on the map');
    assert.deepEqual(F.shown('ChangeBattleGoal', form('ChangeBattleGoal', null, { objective: 'defeatUnit' }), c), { onmap: true, survive: false, unit: true, goalswitch: false, goalvariable: false, goaltext: false });
    assert.deepEqual(F.shown('SpawnUnit', form('SpawnUnit', null, {}), c), {});
    // Modes: First Person on a 3D map only; a stored mode is always offered as itself.
    assert.deepEqual(F.modeChoices({ mode: '' }, c), [['', "This map's mode (First Person)"], ['tactical', 'Tactical'], ['action', 'Action'], ['firstPerson', 'First Person']]);
    assert.deepEqual(F.modeChoices({ mode: '' }, classic), [['', "This map's mode (Classic)"], ['tactical', 'Tactical'], ['action', 'Action']]);
    assert.deepEqual(F.modeChoices({ mode: 'firstPerson' }, classic).map(([value]) => value), ['', 'tactical', 'action', 'firstPerson']);
    // The Enemies line counts with the form's "Who fights" and warns at none.
    assert.deepEqual(F.enemiesLine(form('StartMapBattle', null, {}), c), { words: '2 near the party would fight.', warn: false });
    assert.deepEqual(F.enemiesLine(form('StartMapBattle', null, { who: 'map', troopId: 1 }), c), { words: '3 on this map would fight. The troop fights beside them.', warn: false });
    assert.deepEqual(F.enemiesLine(form('StartMapBattle', null, {}), classic), { words: 'No enemy would be in this battle. Place some with Battle Setup, or pick a troop under More.', warn: true });
    assert.deepEqual(F.enemiesLine(form('StartMapBattle', null, { troopId: 1 }), classic), { words: 'Only the troop would fight.', warn: false });
    // The map's own start.
    assert.equal(F.startsLine(c), '');
    assert.equal(F.startsLine({ map: { note: '<battle trigger: 9>' } }), 'This map also starts a battle when the party comes near.');
    assert.equal(F.startsLine({ map: { note: '<battle trigger: open>' } }), 'This map also starts a battle when it opens.');
    assert.equal(F.startsLine({ map: { note: '<battle trigger: 0>' } }), '');
    const square = { note: '<3d>\n<battle trigger: 9>' };
    assert.equal(F.leaveToEvents(square), true);
    assert.equal(square.note, '<3d>\n<battle trigger: 0>');
    assert.equal(F.leaveToEvents(square), false, 'nothing left to change');
    assert.equal(F.leaveToEvents(null), false);
    // The side follows the record until it is chosen by hand.
    assert.deepEqual(['enemy:6', 'actor:2', ''].map(F.recordSide), ['enemy', 'ally', 'enemy']);
    assert.equal(F.followsRecord({ who: 'actor:2', team: 'ally' }), true);
    assert.equal(F.followsRecord({ who: 'enemy:16', team: 'ally' }), false, 'an enemy record made an ally by hand stays one');
    // More opens with the dialog when something under it is set.
    assert.equal(F.moreOpen('StartMapBattle', form('StartMapBattle', null, {})), false);
    for (const set of [{ who: 'map' }, { troopId: 1 }, { turns: 'team' }, { view: 'map' }, { onTransfer: 'keep' }, { resultVariable: 3 }]) assert.equal(F.moreOpen('StartMapBattle', form('StartMapBattle', null, set)), true, Object.keys(set)[0]);
    assert.equal(F.moreOpen('SpawnUnit', form('SpawnUnit', null, {})), false);
    for (const set of [{ count: 2 }, { template: 12 }, { stay: true }]) assert.equal(F.moreOpen('SpawnUnit', form('SpawnUnit', null, set)), true, Object.keys(set)[0]);
    assert.equal(F.moreOpen('EndMapBattle', {}), false);
    // A pick on the map writes the tile, and the facing when the pick turned the unit.
    assert.deepEqual((({ tileX, tileY, direction }) => [tileX, tileY, direction])(F.picked(form('SpawnUnit', null, {}), { x: 83.7, y: 59, direction: 8 })), [83, 59, 8]);
    assert.deepEqual((({ tileX, tileY, direction }) => [tileX, tileY, direction])(F.picked(form('SpawnUnit', null, {}), { x: 5, y: 6 })), [5, 6, 2]);
    assert.equal(F.picked(form('SpawnUnit', null, {}), null).tileX, null, 'a pick given up changes nothing');
    assert.deepEqual([2, 4, 6, 8, 5].map(direction => F.faced({ direction: 0 }, direction).direction), [2, 4, 6, 8, 0]);
    // OK: a problem in words, or the block the event list takes, at the command's depth.
    assert.deepEqual(F.store('SpawnUnit', null, form('SpawnUnit', null, { at: 'cell' }), c, 0), { problem: 'Pick the tile first.', commands: null });
    const kept = F.store('StartMapBattle', null, form('StartMapBattle', null, { canLose: true }), c, 1);
    assert.equal(kept.problem, '');
    assert.deepEqual(kept.commands.map(command => [command.code, command.indent]), [[357, 1], [601, 1], [0, 2], [602, 1], [0, 2], [603, 1], [0, 2], [604, 1]]);
    assert.deepEqual(F.store('EndMapBattle', { result: 'lose', extra: 1 }, form('EndMapBattle', { result: 'lose' }, {}), c, 3).commands, [F.build('EndMapBattle', { result: 'lose', extra: 1 }, 3)]);
    // Enter is OK in a field; a button, a list and a text area use it themselves.
    const press = (tagName, more = {}) => F.confirmsOn(Object.assign({ key: 'Enter', target: { tagName } }, more));
    assert.deepEqual(['INPUT', 'DIV', 'BUTTON', 'SELECT', 'TEXTAREA'].map(tag => press(tag)), [true, true, false, false, false]);
    assert.equal(press('INPUT', { key: 'Escape' }), false);
    assert.equal(press('INPUT', { isComposing: true }), false, 'Enter that ends a composed word is not OK');
    assert.equal(press('INPUT', { defaultPrevented: true }), false);
    // An event named by its own number is listed by name; without that, "This event" stands for it.
    const conscript = northHaven({ event: c.map.events[5] });
    assert.deepEqual(F.eventChoices(conscript, { self: true, stored: 20 }).find(([value]) => value === '20'), ['20', '020: Conscript']);
    assert.equal(F.eventChoices(conscript, { self: true, stored: 0 }).some(([value]) => value === '20'), false);
    assert.equal(F.eventChoices(conscript, { self: true, stored: 20 }).some(([, label]) => /no such event/.test(label)), false);
});

test('a new command starts where a beginner would: near the party, waiting, next to this event, never at (0, 0)', () => {
    const c = northHaven();
    const made = name => FightCommandEditor.argsOf(name, null, FightCommandEditor.formOf(name, null, c), c);
    assert.deepEqual(made('StartMapBattle'), { mode: '', who: 'near', troopId: 0, turns: '', objective: 'defeatAll', onTransfer: 'escape', canEscape: true, canLose: false, wait: true });
    assert.deepEqual(made('SpawnUnit'), { record: 'enemy', id: 6, team: 'enemy', at: 'event', eventId: 0, direction: 2 });
    // "On a tile" with no tile picked, and "in variables" with one missing, are refused in words.
    const form = FightCommandEditor.formOf('SpawnUnit', null, c);
    assert.equal(FightCommandEditor.problemOf('SpawnUnit', form), '');
    assert.equal(FightCommandEditor.problemOf('SpawnUnit', Object.assign({}, form, { at: 'cell' })), 'Pick the tile first.');
    assert.equal(FightCommandEditor.problemOf('SpawnUnit', Object.assign({}, form, { at: 'cell', tileX: 86, tileY: 53 })), '');
    assert.equal(FightCommandEditor.problemOf('SpawnUnit', Object.assign({}, form, { at: 'variables', varX: 3 })), 'Choose both variables first.');
    // A stored command with no wait opens unticked; one that never said "who" took every unit.
    const old = FightCommandEditor.formOf('StartMapBattle', { mode: 'firstPerson', wait: false, canEscape: true }, c);
    assert.deepEqual([old.wait, old.who, old.canEscape], [false, 'map', true]);
    // The new arguments, under the names the game reads.
    const spawned = FightCommandEditor.argsOf('SpawnUnit', null, Object.assign(form, { count: 3, stay: true, template: 12 }), c);
    assert.deepEqual([spawned.count, spawned.stay, spawned.template], [3, true, 12]);
    const goal = FightCommandEditor.argsOf('ChangeBattleGoal', null, Object.assign(FightCommandEditor.formOf('ChangeBattleGoal', null, c), { objective: 'switch', goalSwitchId: 2, goalText: ' Defend North Haven ' }), c);
    assert.deepEqual(goal, { objective: 'switch', goalSwitchId: 2, goalText: 'Defend North Haven' });
});

test('the forms name the mode in force, the map\'s own start and who would fight', () => {
    const c = northHaven();
    assert.equal(FightCommandEditor.modeInForce(c), 'firstPerson');
    assert.equal(FightCommandEditor.modeInForce(northHaven({ map: { note: '<Battle Mode: FIRSTPERSON>' } })), 'firstPerson', 'whatever its letter case');
    assert.equal(FightCommandEditor.modeInForce(northHaven({ map: { note: '', reactor3d: { battle: { mode: 'action' } } } })), 'action', 'the sidecar where the Note has no tag');
    assert.equal(FightCommandEditor.modeInForce(northHaven({ map: { note: '' }, system: { reactorBattle: { mode: 'tactical' } } })), 'tactical', 'then the game');
    assert.equal(FightCommandEditor.modeInForce({}), 'classic');
    assert.equal(FightCommandEditor.formMode({ mode: 'action' }, c), 'action');
    assert.equal(FightCommandEditor.formMode({ mode: '' }, c), 'firstPerson');
    assert.equal(FightCommandEditor.is3DMap(c.map), true);
    assert.equal(FightCommandEditor.is3DMap({ note: '' }), false);
    // Starts, as the Note says.
    assert.equal(FightCommandEditor.startOf('<3d>'), null);
    assert.deepEqual(FightCommandEditor.startOf('<battle trigger: 9>'), { kind: 'near', tiles: 9 });
    assert.deepEqual(FightCommandEditor.startOf('<Battle Trigger: Open>'), { kind: 'open' });
    assert.deepEqual(FightCommandEditor.startOf('<battle trigger: 0>'), { kind: 'events' });
    // "Leave it to events" writes the one tag, and keeps every other line.
    assert.equal(FightCommandEditor.leftToEvents('<3d>'), '<3d>\n<battle trigger: 0>');
    assert.equal(FightCommandEditor.leftToEvents('<3d>\n<battle trigger: 9>\nA square.'), '<3d>\n<battle trigger: 0>\nA square.');
    const range = fightWorld({ tactical: true }).ReactorFight.triggerRange;
    if (typeof range === 'function') assert.equal(range({ note: FightCommandEditor.leftToEvents('<battle trigger: 9>') }), 0, 'the game reads it as never');
    // Who would fight: the enemies within the start distance of the event, or every one on the map; a page comment counts.
    assert.equal(FightCommandEditor.fighters(c, 'near', 'firstPerson'), 2, 'the two Raiders by Rhea');
    assert.equal(FightCommandEditor.fighters(c, 'map', 'firstPerson'), 3, 'and the Conscript made by a comment');
    assert.equal(FightCommandEditor.fighters(northHaven({ map: Object.assign({}, c.map, { note: '<battle trigger: 30>' }) }), 'near', 'action'), 3, "the map's own distance");
    assert.equal(FightCommandEditor.fighters(c, 'map', 'classic'), 2, 'a Classic battle takes rows only, near the party');
    assert.equal(FightCommandEditor.fighters(northHaven({ event: { id: 4, x: 0, y: 0 } }), 'near', 'action'), 0);
    // Events by name: This event and Player where asked for, units first, a stored id the map has lost as itself.
    const choices = FightCommandEditor.eventChoices(c, { self: true, player: true, stored: 99 });
    assert.deepEqual(choices.map(([value]) => value), ['0', '-1', '16', '17', '20', '21', '23', '4', '99']);
    assert.deepEqual(choices.slice(0, 3).map(([, label]) => label), ['This event', 'Player', '016: Raider']);
    assert.equal(choices[choices.length - 1][1], '099: (no such event)');
    assert.deepEqual(FightCommandEditor.eventChoices(c).map(([value]) => value), ['16', '17', '20', '21', '23', '4', '12'], 'a goal names any event of the map');
    // A unit by its row, by its Note and by a comment on a page.
    assert.deepEqual(FightCommandEditor.unitOf(c.map.events[5]), { team: 'enemy', record: 'enemy', id: 13, move: 0, from: 'comment', page: 2 });
    assert.deepEqual(FightCommandEditor.unitOf(c.map.events[6]), { team: 'neutral', record: 'enemy', id: 12, move: 0, from: 'note', page: 0 });
    assert.equal(FightCommandEditor.unitOf(c.map.events[3]).from, 'row');
    assert.equal(FightCommandEditor.unitOf(c.map.events[1]), null);
    // Battle Processing says where it will be fought, on a map that fights on the map only.
    assert.equal(BattleProcessingEditor.foughtOnMap(c), "Fought on this map as First Person (this map's mode): the troop appears round the party and the enemy units near it join.");
    assert.equal(BattleProcessingEditor.foughtOnMap(northHaven({ map: { note: '' } })), '');
});

test('Start Battle on Map that waits is followed by If Win, If Escape and If Lose, and the game takes the right one', () => {
    const codes = block => block.map(command => command.code);
    const block = args => FightCommandEditor.block('StartMapBattle', args, 1);
    assert.deepEqual(codes(block({ wait: true, canEscape: true, canLose: true })), [357, 601, 0, 602, 0, 603, 0, 604]);
    assert.deepEqual(codes(block({ wait: true, canEscape: false, canLose: false })), [357, 601, 0, 604], 'If Win always');
    assert.deepEqual(codes(block({ wait: true, canEscape: true, canLose: false })), [357, 601, 0, 602, 0, 604]);
    assert.deepEqual(codes(block({ wait: false, canEscape: true, canLose: true })), [357], 'no rows when the event carries on');
    assert.deepEqual(block({ wait: true }).map(command => command.indent), [1, 1, 2, 1], 'at the command\'s depth, bodies one deeper');
    assert.deepEqual(codes(FightCommandEditor.block('SpawnUnit', { wait: true })), [357]);
    // In the game: each result runs its own branch and no other.
    for (const [result, sw] of [['WIN', 5], ['ESCAPE', 6], ['LOSE', 7]]) {
        const start = FightCommandEditor.block('StartMapBattle', { mode: 'tactical', troopId: 0, objective: 'defeatAll', who: 'map', canEscape: true, canLose: true, wait: true }, 0);
        const on = id => ({ code: 121, indent: 1, parameters: [id, id, 0] });
        // Each branch's body: its switch, before the body's terminator.
        const list = [];
        for (const command of start) {
            list.push(command);
            if (command.code === 601) list.push(on(5));
            if (command.code === 602) list.push(on(6));
            if (command.code === 603) list.push(on(7));
        }
        list.push({ code: 121, indent: 0, parameters: [8, 8, 0] });
        const w = runCommands(list, { events: [event(2, 15, 10, { note: '<unit: enemy 1>' })] });
        w.$dataEnemies[1].params = [9999, 0, 1, 999, 5, 5, 1, 5];
        w.run(3);
        assert.ok(w.$gameFight.isActive(), 'the battle runs and the event waits');
        assert.equal(w.$gameSwitches.value(8), false);
        w.$gameFight.end(w.ReactorFight[result]);
        w.run(3000, () => w.$gameSwitches.value(8));
        assert.equal(w.$gameSwitches.value(8), true, `${result}: the event goes on`);
        assert.deepEqual([5, 6, 7].filter(id => w.$gameSwitches.value(id)), [sw], `${result} takes its own branch`);
    }
});

test('the In battle row: one side, one record, a first choice that picks for you, a tag unit shown as what it is', () => {
    const lists = { enemies: [null, { id: 6, name: 'Raider' }, { id: 13, name: 'Conscript' }], actors: [null, { id: 1, name: 'Fleagus' }] };
    const write = (current, change) => EventEditor.unitRowValue(current, Object.assign({ record: '', move: '', returns: false }, change), lists);
    // A first choice of side takes the first enemy (Enemy, Bystander) or the first actor (Ally).
    assert.deepEqual(write(null, { team: 'enemy' }), { team: 'enemy', record: 'enemy', id: 6 });
    assert.deepEqual(write(null, { team: 'neutral' }), { team: 'neutral', record: 'enemy', id: 6 });
    assert.deepEqual(write(null, { team: 'ally' }), { team: 'ally', record: 'actor', id: 1 });
    assert.equal(write({ team: 'enemy', record: 'enemy', id: 6 }, { team: '' }), null, 'Does not fight');
    // A later change of side never changes the record: Ally then Enemy keeps the actor the user chose, and nothing else.
    const ally = write(null, { team: 'ally' });
    assert.deepEqual(write(ally, { team: 'enemy', record: 'actor:1' }), { team: 'enemy', record: 'actor', id: 1 });
    assert.deepEqual(write({ team: 'enemy', record: 'enemy', id: 13 }, { team: 'ally', record: 'enemy:13' }), { team: 'ally', record: 'enemy', id: 13 });
    // The record select writes record and id together.
    assert.deepEqual(write({ team: 'enemy', record: 'enemy', id: 6 }, { team: 'enemy', record: 'actor:1' }), { team: 'enemy', record: 'actor', id: 1 });
    // Comes back is an enemy's only; a key the row does not show stays.
    assert.deepEqual(write({ team: 'enemy', record: 'enemy', id: 6, later: 1 }, { team: 'enemy', record: 'enemy:6', returns: true, move: '3' }), { team: 'enemy', record: 'enemy', id: 6, later: 1, move: 3, returns: true });
    assert.equal('returns' in write({ team: 'enemy', record: 'enemy', id: 6, returns: true }, { team: 'ally', record: 'enemy:6', returns: true }), false);
    // A bystander may have no record; a fighter is given one.
    assert.deepEqual(write({ team: 'neutral', id: 0 }, { team: 'neutral', record: '' }), { team: 'neutral', id: 0 });
    assert.deepEqual(write({ team: 'neutral', id: 0 }, { team: 'enemy', record: '' }), { team: 'enemy', record: 'enemy', id: 6 });
    const F = fightWorld().ReactorFight;
    for (const stored of [write(null, { team: 'enemy' }), write(ally, { team: 'enemy', record: 'actor:1' }), write({ team: 'neutral', id: 0 }, { team: 'neutral', record: '' })]) {
        assert.ok(F.normalizeUnit(stored), 'the game reads what the row writes');
    }
    // A unit made by a comment is read back as the row would store it, and becomes a row.
    const c = northHaven(), conscript = JSON.parse(JSON.stringify(c.map.events[5]));
    assert.deepEqual(EventEditor.tagRow(EventEditor.tagUnit(conscript)), { team: 'enemy', record: 'enemy', id: 13 });
    assert.deepEqual(EventEditor.tagRow(EventEditor.tagUnit(c.map.events[6])), { team: 'neutral', record: 'enemy', id: 12 });
    assert.equal(EventEditor.tagRow(null), null);
    assert.equal(EventEditor.tagUnit(c.map.events[3]), null, 'a row is a row');
    assert.equal(EventEditor.useUnitRow(conscript), true);
    assert.deepEqual(conscript.rrUnit, { team: 'enemy', record: 'enemy', id: 13 });
    assert.deepEqual(conscript.pages[1].list.map(command => command.code), [0], 'the tag\'s comment line is gone');
    assert.deepEqual({ ...F.unitSpecOf(conscript, []) }, { team: 'enemy', record: 'enemy', id: 13, move: F.DEFAULT_MOVE });
    const noted = { note: 'Keep.\n<unit: ally 5, move 3>', pages: [page({ list: [{ code: 108, indent: 0, parameters: ['<unit: ally 5> stays'] }, { code: 408, indent: 0, parameters: ['more'] }, end] })] };
    assert.equal(EventEditor.useUnitRow(noted), true);
    assert.deepEqual([noted.rrUnit, noted.note, noted.pages[0].list[0].parameters[0], noted.pages[0].list.length], [{ team: 'ally', record: 'actor', id: 5, move: 3 }, 'Keep.', 'stays', 3]);
    assert.equal(EventEditor.useUnitRow(noted), false, 'nothing left to convert');
    // The automatic name gives way to the record's; a name the author typed does not.
    assert.deepEqual(['EV001', 'EV12', 'Raider', 'EV', ''].map(EventEditor.isAutomaticName), [true, true, false, false, false]);
    const source = read('src/event/EventEditor.js');
    for (const label of ['In battle', 'Does not fight', 'Bystander', 'Comes back']) assert.ok(source.includes(`'${label}'`), label);
    // A tag unit is not a second mode of the row: no read-only line, no button.
    assert.doesNotMatch(source, /'Battle unit'|'Neutral'|'Move range'|Use this row instead|event-unit-tag|event-unit-use/);
    assert.match(read('src/event/EventPageEditor.js'), /Looks like \{name\} \(Database › Enemies\)/);
});

//-----------------------------------------------------------------------------
// The dialogs, the row and the battle row driven as a user drives them: a
// small DOM (elements parsed from the markup the code writes, class and tag
// selectors, events that bubble) stands in for the page.

function miniDom() {
    const decode = text => String(text).replace(/&#(\d+);/g, (m, code) => String.fromCodePoint(Number(code)))
        .replace(/&times;/g, '×').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const VOID = ['INPUT', 'BR', 'IMG'];
    const doc = { activeElement: null };
    class Element {
        constructor(tag) {
            Object.assign(this, { tagName: String(tag).toUpperCase(), children: [], parentNode: null, attrs: {}, listeners: [], style: {}, dataset: {}, text: '', hidden: false, selected: false, disabled: false });
            const names = () => String(this.attrs.class || '').split(/\s+/).filter(Boolean);
            this.classList = {
                contains: name => names().includes(name),
                add: name => { if (!names().includes(name)) this.attrs.class = names().concat([name]).join(' '); },
                remove: name => { this.attrs.class = names().filter(other => other !== name).join(' '); },
                toggle: (name, on) => { const want = on === undefined ? !names().includes(name) : !!on; if (want) this.classList.add(name); else this.classList.remove(name); return want; }
            };
        }
        get className() { return this.attrs.class || ''; }
        set className(value) { this.attrs.class = String(value); }
        get type() { return this.attrs.type || (this.tagName === 'SELECT' ? 'select-one' : this.tagName === 'INPUT' ? 'text' : ''); }
        set type(value) { this.attrs.type = String(value); }
        get name() { return this.attrs.name || ''; }
        get title() { return this.attrs.title || ''; }
        set title(value) { this.attrs.title = String(value); }
        get placeholder() { return this.attrs.placeholder || ''; }
        set placeholder(value) { this.attrs.placeholder = String(value); }
        get isConnected() { let node = this; while (node.parentNode) node = node.parentNode; return node === doc.body; }
        get parentElement() { return this.parentNode; }
        get options() { return this.querySelectorAll('option'); }
        get selectedIndex() { const options = this.options; const at = options.findIndex(option => option.selected); return at < 0 ? 0 : at; }
        get value() {
            if (this.tagName === 'SELECT') { const option = this.options[this.selectedIndex]; return option ? option.value : ''; }
            if (this.tagName === 'OPTION') return 'value' in this.attrs ? this.attrs.value : this.textContent;
            return 'value' in this.attrs ? this.attrs.value : '';
        }
        set value(value) {
            if (this.tagName === 'SELECT') for (const option of this.options) option.selected = option.value === String(value);
            else this.attrs.value = String(value);
        }
        get checked() { return !!this._checked; }
        set checked(on) {
            this._checked = !!on;
            // A radio that turns on turns the others of its name off.
            if (on && this.type === 'radio') { let top = this; while (top.parentNode) top = top.parentNode; for (const other of top.querySelectorAll('input')) if (other !== this && other.type === 'radio' && other.name === this.name) other._checked = false; }
        }
        get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
        set textContent(value) { this.children = []; this.text = String(value); }
        get innerHTML() { return this._html || ''; }
        set innerHTML(html) {
            this._html = String(html);
            this.children = [];
            this.text = '';
            const stack = [this];
            const tags = /<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)/g;
            let match;
            while ((match = tags.exec(this._html)) !== null) {
                const top = stack[stack.length - 1];
                if (match[1]) { while (stack.length > 1 && stack.pop().tagName !== match[1].toUpperCase()); continue; }
                if (match[4] !== undefined) { if (match[4].trim()) { const piece = new Element('#text'); piece.text = decode(match[4]); piece.parentNode = top; top.children.push(piece); } continue; }
                const node = new Element(match[2]);
                for (const attr of (match[3] || '').matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
                    const value = decode(attr[2] !== undefined ? attr[2] : attr[3] !== undefined ? attr[3] : attr[4] !== undefined ? attr[4] : '');
                    if (attr[1] === 'hidden') node.hidden = true;
                    else if (attr[1] === 'checked') node._checked = true;
                    else if (attr[1] === 'selected') node.selected = true;
                    else if (attr[1] === 'disabled') node.disabled = true;
                    else if (attr[1].startsWith('data-')) node.dataset[attr[1].slice(5).replace(/-(\w)/g, (m, c) => c.toUpperCase())] = value;
                    else node.attrs[attr[1]] = value;
                }
                node.parentNode = top;
                top.children.push(node);
                if (!VOID.includes(node.tagName)) stack.push(node);
            }
        }
        setAttribute(name, value) { this.attrs[name] = String(value); }
        getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
        hasAttribute(name) { return name in this.attrs; }
        appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.push(child); return child; }
        removeChild(child) { this.children = this.children.filter(other => other !== child); child.parentNode = null; return child; }
        remove() { if (this.parentNode) this.parentNode.removeChild(this); }
        after(node) { const list = this.parentNode.children; node.parentNode = this.parentNode; list.splice(list.indexOf(this) + 1, 0, node); }
        contains(node) { for (let at = node; at; at = at.parentNode) if (at === this) return true; return false; }
        matches(selector) {
            return selector.split(',').some(one => {
                // The last compound of the selector decides; the ones before it are ancestors.
                const parts = one.trim().split(/\s+/);
                const fits = (node, compound) => {
                    const tag = /^[a-zA-Z][a-zA-Z0-9]*/.exec(compound);
                    if (tag && node.tagName !== tag[0].toUpperCase()) return false;
                    for (const cls of compound.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(cls[1])) return false;
                    for (const attr of compound.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
                        const have = attr[1].startsWith('data-') ? node.dataset[attr[1].slice(5).replace(/-(\w)/g, (m, c) => c.toUpperCase())] : node.attrs[attr[1]];
                        if (have === undefined || (attr[2] !== undefined && String(have) !== attr[2])) return false;
                    }
                    return !/:checked/.test(compound) || node.checked;
                };
                if (this.tagName === '#TEXT' || !fits(this, parts[parts.length - 1])) return false;
                let node = this.parentNode;
                for (let i = parts.length - 2; i >= 0; i--) { while (node && !fits(node, parts[i])) node = node.parentNode; if (!node) return false; node = node.parentNode; }
                return true;
            });
        }
        querySelectorAll(selector) {
            const found = [];
            const walk = node => { for (const child of node.children) { if (child.matches(selector)) found.push(child); walk(child); } };
            walk(this);
            return found;
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches && node.matches(selector)) return node; return null; }
        getClientRects() { for (let node = this; node; node = node.parentNode) if (node.hidden || node.style.display === 'none') return []; return [{}]; }
        focus() { doc.activeElement = this; }
        addEventListener(type, listener, capture) { this.listeners.push({ type, listener, capture: !!capture }); }
        removeEventListener(type, listener) { this.listeners = this.listeners.filter(entry => entry.type !== type || entry.listener !== listener); }
        /** Runs the listeners as a page does: down from the top for the capturing ones, then up from the target. */
        dispatch(type, init = {}) {
            const event = Object.assign({ type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } }, init);
            const path = [];
            for (let node = this; node; node = node.parentNode) path.push(node);
            const run = (node, capture) => { for (const entry of node.listeners.slice()) if (!event.stopped && entry.type === type && entry.capture === capture) entry.listener(event); };
            for (const node of path.slice().reverse()) run(node, true);
            for (const node of path) run(node, false);
            return event;
        }
        click() { return this.dispatch('click'); }
    }
    doc.Element = Element;
    doc.createElement = tag => new Element(tag);
    doc.body = new Element('body');
    const byId = (node, id) => { for (const child of node.children) { if (child.attrs.id === id) return child; const deep = byId(child, id); if (deep) return deep; } return null; };
    doc.getElementById = id => byId(doc.body, id);
    doc.querySelector = selector => doc.body.querySelector(selector);
    doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
    // The page's own listeners: a dialog listens there for the keys that land on no control.
    doc.listeners = [];
    doc.addEventListener = (type, listener) => { doc.listeners.push({ type, listener }); };
    doc.removeEventListener = (type, listener) => { doc.listeners = doc.listeners.filter(entry => entry.type !== type || entry.listener !== listener); };
    /** A key pressed while the focus is on the page itself. */
    doc.pressOnPage = key => { const event = { type: 'keydown', key, target: doc.body, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
        for (const entry of doc.listeners.slice()) if (entry.type === 'keydown') entry.listener(event); return event; };
    return doc;
}

/**
 * Runs `run(page)` with the mini DOM as the page: `page.document`, the event
 * editor's own map and event (`context`), the editor's question (`page.asked`
 * holds what was asked, `page.answer` what is answered) and its dialog keys
 * (`page.escape()` presses Escape in the dialog on top).
 */
async function withPage(context, run) {
    const names = ['document', 'window', 'RRKeyboardNavigation', 'RRDialog', 'rrEscapeHtml', 'FightCommandEditor', 'RRBattleSetup', 'SwitchVariablePicker', 'TransferPlayerEditor'];
    const before = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
    const document = miniDom();
    const manager = { data: { enemies: context.enemies, actors: context.actors, troops: context.troops, system: context.system }, getSystem: () => context.system,
        getEnemies: () => context.enemies, getActors: () => context.actors };
    const page = { document, manager, asked: [], answer: true, escapes: [] };
    globalThis.document = document;
    globalThis.window = { reactor: { databaseManager: manager, eventManager: { currentMap: context.map, eventEditor: { currentEvent: context.event } } } };
    globalThis.RRKeyboardNavigation = { modal: (overlay, options) => { page.escapes.push(options.onEscape); return { enter(target) { page.focused = target || overlay.querySelectorAll('select, input, button').find(control => !control.classList.contains('rr-modal-close')); }, leave() {}, dispose() {} }; } };
    globalThis.RRDialog = { confirm: async (message, options) => { page.asked.push({ message, options }); return page.answer; } };
    globalThis.rrEscapeHtml = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    globalThis.FightCommandEditor = FightCommandEditor;
    delete globalThis.RRBattleSetup;
    page.escape = () => page.escapes[page.escapes.length - 1]();
    try {
        return await run(page);
    } finally {
        for (const [name, descriptor] of before) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
    }
}

/** The dialog for `command` (null: a new one named `name`), open on the page: what OK and Cancel hand back land in `out.got`. */
function openDialog(page, name, command, hooks) {
    const out = { got: undefined, calls: 0 };
    const editor = new FightCommandEditor(page.manager, null);
    out.editor = editor;
    editor.show(command, commands => { out.got = commands; out.calls++; }, name, hooks);
    out.modal = page.document.body.children[page.document.body.children.length - 1];
    out.$ = key => out.modal.querySelector('.fc-' + key);
    out.all = selector => out.modal.querySelectorAll(selector);
    out.set = (key, value) => { const control = out.$(key); if (control.type === 'checkbox') control.checked = value; else control.value = value; control.dispatch('change'); };
    out.open = () => !!out.modal.parentNode;
    out.shown = cls => out.all('.fc-when-' + cls).map(row => !row.hidden);
    return out;
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('the Start Battle on Map dialog, driven: what it shows for the map, what OK, Enter and Escape do', async () => {
    await withPage(northHaven({ map: Object.assign({}, northHaven().map, { note: '<3d>\n<battle mode: firstPerson>\n<battle trigger: 9>' }) }), async page => {
        let d = openDialog(page, 'StartMapBattle', null);
        assert.equal(page.focused === d.$('mode'), true, 'the focus starts on the first control');
        assert.deepEqual(d.$('mode').options.map(option => [option.value, option.textContent]),
            [['', "This map's mode (First Person)"], ['tactical', 'Tactical'], ['action', 'Action'], ['firstPerson', 'First Person']]);
        assert.equal(d.$('enemies').textContent, '2 near the party would fight.');
        assert.equal(d.$('enemies').classList.contains('fc-warn'), false);
        assert.equal(d.$('wait').checked, true, 'a new command waits');
        assert.deepEqual(d.shown('wait'), [true], 'and says what waiting adds');
        // Under More, folded: nothing shows until it is opened; the Tactical rows only in a Tactical battle.
        assert.ok(d.all('.fc-more').every(row => row.hidden), 'More starts folded on a new command');
        d.$('more-toggle').click();
        assert.deepEqual(d.shown('tactical'), [false, false], 'First Person: no Turn order, no Tactical view');
        d.set('mode', 'tactical');
        assert.deepEqual(d.shown('tactical'), [true, true]);
        d.set('who', 'map');
        assert.equal(d.$('enemies').textContent, '3 on this map would fight.');
        // The map starts a battle by itself: the line says so, and the button hands the start to its events.
        assert.equal(d.$('starts').hidden, false);
        assert.equal(d.$('starts-text').textContent, 'This map also starts a battle when the party comes near.');
        d.$('leave').click();
        assert.equal(globalThis.window.reactor.eventManager.currentMap.note, '<3d>\n<battle mode: firstPerson>\n<battle trigger: 0>');
        assert.equal(d.$('starts').hidden, true);
        // A goal's own fields under the goal chosen.
        assert.deepEqual([d.shown('survive'), d.shown('goaltext')], [[false], [false]]);
        d.set('objective', 'switch');
        assert.deepEqual([d.shown('goalswitch'), d.shown('goaltext'), d.shown('survive')], [[true], [true], [false]]);
        // OK hands the event list the command and its branch rows.
        d.$('ok').click();
        await settle();
        assert.equal(d.open(), false);
        assert.deepEqual(d.got.map(command => command.code), [357, 601, 0, 602, 0, 604]);
        assert.deepEqual([d.got[0].parameters[3].mode, d.got[0].parameters[3].who, d.got[0].parameters[3].objective], ['tactical', 'map', 'switch']);
        // The party cannot escape, the game goes on after a loss: If Lose instead of If Escape. Enter in a field is OK.
        d = openDialog(page, 'StartMapBattle', null);
        d.set('canEscape', false);
        d.set('canLose', true);
        d.$('turnsToSurvive').dispatch('keydown', { key: 'Enter' });
        await settle();
        assert.deepEqual(d.got.map(command => command.code), [357, 601, 0, 603, 0, 604]);
        // Enter on a button or a list is that control's own; Escape is Cancel.
        d = openDialog(page, 'StartMapBattle', null);
        d.$('more-toggle').dispatch('keydown', { key: 'Enter' });
        d.$('mode').dispatch('keydown', { key: 'Enter' });
        await settle();
        assert.equal(d.open(), true);
        page.escape();
        assert.deepEqual([d.open(), d.got, d.calls], [false, null, 1]);
        // Without Wait there are no rows.
        d = openDialog(page, 'StartMapBattle', null);
        d.set('wait', false);
        assert.deepEqual(d.shown('wait'), [false]);
        d.$('ok').click();
        await settle();
        assert.deepEqual(d.got.map(command => command.code), [357]);
        // A stored command opens as it is stored, with More open when something under it is set, and at its own depth.
        const stored = FightCommandEditor.build('StartMapBattle', { mode: 'action', who: 'near', troopId: 1, wait: true, canEscape: true, canLose: true, objective: 'defeatAll' }, 2);
        d = openDialog(page, null, stored);
        assert.equal(d.modal.classList.contains('fc-more-open'), true);
        assert.equal(d.$('enemies').textContent, '2 near the party would fight. The troop fights beside them.');
        d.$('ok').click();
        await settle();
        assert.deepEqual(d.got.map(command => [command.code, command.indent]), [[357, 2], [601, 2], [0, 3], [602, 2], [0, 3], [603, 2], [0, 3], [604, 2]]);
    });
    // On a map whose mode in force is Classic the rows that mean nothing there are hidden, and no enemy is a warning.
    await withPage(northHaven({ map: { id: 9, note: '', width: 20, height: 20, events: [null] }, event: { id: 1, x: 3, y: 3 } }), async page => {
        const d = openDialog(page, 'StartMapBattle', null);
        assert.deepEqual(d.$('mode').options.map(option => option.value), ['', 'tactical', 'action'], 'no First Person on a 2D map');
        d.$('more-toggle').click();
        assert.ok(d.shown('onmap').length >= 3 && d.shown('onmap').every(on => !on), 'To win, Who fights and If the party leaves the map');
        assert.equal(d.$('enemies').classList.contains('fc-warn'), true);
        assert.equal(d.$('enemies').textContent, 'No enemy would be in this battle. Place some with Battle Setup, or pick a troop under More.');
        assert.equal(d.$('starts').hidden, true);
        d.set('mode', 'action');
        assert.ok(d.shown('onmap').every(on => on));
    });
});

test('the event list asks before a branch goes with its commands; the dialog stays open on Cancel', async () => {
    const waiting = { mode: 'tactical', who: 'near', wait: true, canEscape: true, canLose: true, objective: 'defeatAll', troopId: 0, turns: '', onTransfer: 'escape' };
    const row = (code, indent = 0, parameters = []) => ({ code, indent, parameters });
    const shape = list => list.map(command => `${command.code}@${command.indent || 0}`);
    const make = () => [FightCommandEditor.build('StartMapBattle', waiting, 0), row(601), row(121, 1, [5, 5, 0]), row(0, 1), row(602), row(0, 1), row(603), row(353, 1), row(0, 1), row(604), row(121, 0, [8, 8, 0]), row(0)];
    await withPage(northHaven(), async page => {
        const list = make(), listPage = { list };
        let refreshed = 0;
        // The event list as it edits a command: the real dialog, the real question.
        const owner = Object.assign(Object.create(EventCommandList.prototype), { selectedIndices: [], fightCommandEditor: new FightCommandEditor(page.manager, null), refreshCommandList() { refreshed++; } });
        const dialog = () => page.document.body.children[page.document.body.children.length - 1];
        // "The game goes on if the party loses" unticked while If Lose holds Game Over: asked, and Cancel changes nothing.
        owner.editCommand(0, listPage, 0);
        let modal = dialog();
        modal.querySelector('.fc-canLose').checked = false;
        page.answer = false;
        modal.querySelector('.fc-ok').click();
        await settle();
        assert.equal(page.asked.length, 1);
        assert.equal(page.asked[0].message, 'The commands under If Lose will be deleted.');
        assert.deepEqual([page.asked[0].options.danger, page.asked[0].options.ok, page.asked[0].options.title], [true, 'Delete', 'Start Battle on Map']);
        assert.equal(!!modal.parentNode, true, 'the dialog is still open');
        assert.deepEqual(shape(list), shape(make()), 'and the list is as it was');
        assert.equal(refreshed, 0);
        // Delete: If Lose goes with Game Over. Nothing that ran after a loss runs after a win.
        page.answer = true;
        modal.querySelector('.fc-ok').click();
        await settle();
        assert.equal(!!modal.parentNode, false);
        assert.equal(page.asked.length, 2);
        assert.deepEqual(shape(list), ['357@0', '601@0', '121@1', '0@1', '602@0', '0@1', '604@0', '121@0', '0@0']);
        assert.equal(list.some(command => command.code === 353), false);
        assert.equal(refreshed, 1);
        // An empty branch goes without a question.
        owner.editCommand(0, listPage, 0);
        modal = dialog();
        modal.querySelector('.fc-canEscape').checked = false;
        modal.querySelector('.fc-ok').click();
        await settle();
        assert.equal(page.asked.length, 2, 'If Escape held nothing: no third question');
        assert.deepEqual(shape(list), ['357@0', '601@0', '121@1', '0@1', '604@0', '121@0', '0@0']);
        // Wait unticked while If Win holds a command: asked by name.
        owner.editCommand(0, listPage, 0);
        modal = dialog();
        modal.querySelector('.fc-wait').checked = false;
        modal.querySelector('.fc-ok').click();
        await settle();
        assert.equal(page.asked.length, 3);
        assert.equal(page.asked[2].message, 'The commands under If Win will be deleted.');
        assert.deepEqual(shape(list), ['357@0', '121@0', '0@0']);
    });
});

test('in the game, what was under If Lose never runs after a win, whether the branch stayed or went', () => {
    const waiting = { mode: 'tactical', who: 'map', wait: true, canEscape: true, canLose: true, objective: 'defeatAll', troopId: 0, turns: '', onTransfer: 'escape' };
    const row = (code, indent = 0, parameters = []) => ({ code, indent, parameters });
    const on = (id, indent) => row(121, indent, [id, id, 0]);
    for (const drop of [false, true]) {
        // If Win turns switch 5 on, If Lose switch 7, and the event goes on to switch 8.
        const list = [FightCommandEditor.build('StartMapBattle', waiting, 0), row(601), on(5, 1), row(0, 1), row(602), row(0, 1), row(603), on(7, 1), row(0, 1), row(604), on(8, 0)];
        // "The game goes on if the party loses" unticked.
        EventCommandList.replaceBattleStart(list, 0, FightCommandEditor.block('StartMapBattle', Object.assign({}, waiting, { canLose: false }), 0), { drop });
        assert.equal(list.some(command => command.code === 603), !drop);
        assert.equal(list.filter(command => command.code === 121 && command.parameters[0] === 7).every(command => command.indent === 1), true, 'never at the depth of the commands that always run');
        const w = runCommands(list, { events: [event(2, 15, 10, { note: '<unit: enemy 1>' })] });
        w.$dataEnemies[1].params = [9999, 0, 1, 999, 5, 5, 1, 5];
        w.run(3);
        assert.ok(w.$gameFight.isActive());
        w.$gameFight.end(w.ReactorFight.WIN);
        w.run(3000, () => w.$gameSwitches.value(8));
        assert.deepEqual([5, 7, 8].map(id => w.$gameSwitches.value(id)), [true, false, true], drop ? 'the branch went with its commands' : 'the branch stayed, with its commands');
    }
});

test('the Spawn Unit dialog, driven: the three places, the facing, the side that follows, the refusal', async () => {
    await withPage(northHaven(), async page => {
        let d = openDialog(page, 'SpawnUnit', null);
        assert.equal(d.modal.querySelector('.fc-at:checked').value, 'event', 'a new command stands next to this event');
        assert.deepEqual(d.$('eventId').options.slice(0, 3).map(option => option.textContent), ['This event', 'Player', '016: Raider']);
        assert.deepEqual(d.all('.fc-face').map(button => button.classList.contains('is-on')), [true, false, false, false], 'a new command faces down');
        // A press on the tile line chooses it; with no tile picked OK is refused in words and the dialog stays.
        d.all('.fc-where')[0].dispatch('pointerdown');
        assert.equal(d.modal.querySelector('.fc-at:checked').value, 'cell');
        assert.equal(d.$('tile').textContent, '(not picked)');
        d.$('ok').click();
        await settle();
        assert.deepEqual([d.open(), d.calls, d.$('problem').hidden, d.$('problem').textContent], [true, 0, false, 'Pick the tile first.']);
        // Pick on the map: the tile and the way the pick turned the unit.
        d.editor.pickTile = async (modal, request) => { d.asked = request; return { x: 83, y: 59, direction: 8 }; };
        d.$('pick-tile').click();
        await settle();
        assert.deepEqual(d.asked, { unit: { team: 'enemy', record: 'enemy', id: 6 }, x: null, y: null, direction: 2 });
        assert.equal(d.$('tile').textContent, '(83, 59)');
        assert.equal(d.$('problem').hidden, true, 'the refusal goes when the form changes');
        assert.deepEqual(d.all('.fc-face').map(button => button.classList.contains('is-on')), [false, false, false, true]);
        // A Facing button; the side follows the record until it is chosen by hand.
        d.all('.fc-face')[1].click();
        d.set('who', 'actor:2');
        assert.equal(d.$('team').value, 'ally');
        d.set('team', 'neutral');
        d.set('who', 'enemy:6');
        assert.equal(d.$('team').value, 'neutral', 'a side chosen by hand stays');
        d.$('more-toggle').click();
        d.set('count', '3');
        d.$('ok').click();
        await settle();
        assert.deepEqual(d.got.map(command => command.code), [357], 'no branch rows under any other command');
        assert.deepEqual(d.got[0].parameters[3], { record: 'enemy', id: 6, team: 'neutral', at: 'cell', x: 83, y: 59, direction: 4, count: 3 });
        // A stored command with no facing has none lit and gets none; the lit one pressed again takes it off.
        const old = FightCommandEditor.build('SpawnUnit', { record: 'enemy', id: 6, team: 'enemy', at: 'event', eventId: 12, template: 22 }, 0);
        d = openDialog(page, null, old);
        assert.deepEqual(d.all('.fc-face').map(button => button.classList.contains('is-on')), [false, false, false, false]);
        assert.equal(d.modal.classList.contains('fc-more-open'), true, 'Copy pages from is set');
        d.$('ok').click();
        await settle();
        assert.deepEqual(d.got[0].parameters[3], { record: 'enemy', id: 6, team: 'enemy', at: 'event', eventId: 12, template: 22 });
        d = openDialog(page, null, FightCommandEditor.build('SpawnUnit', { record: 'enemy', id: 6, team: 'enemy', at: 'event', eventId: 0, direction: 6 }, 0));
        d.all('.fc-face')[2].click();
        d.$('ok').click();
        await settle();
        assert.equal('direction' in d.got[0].parameters[3], false);
        // Set Terrain Cost offers a stored cost the list does not have, and keeps it.
        d = openDialog(page, null, FightCommandEditor.build('SetTerrainCost', { type: 'region', id: 7, cost: 4 }, 0));
        assert.deepEqual(d.$('cost').options.map(option => [option.value, option.textContent]), [['0', 'Blocked'], ['2', 'Slow (2 steps)'], ['3', 'Slow (3 steps)'], ['4', 'Slow (4 steps)'], ['1', 'Normal']]);
        assert.equal(d.$('cost').value, '4');
        d.$('ok').click();
        await settle();
        assert.deepEqual(d.got[0].parameters[3], { type: 'region', id: 7, cost: 4 });
        // A command that names its own event by number lists it by name, and stores the number.
        page.document.body.children.length = 0;
        globalThis.window.reactor.eventManager.eventEditor.currentEvent = northHaven().map.events[5];
        d = openDialog(page, null, FightCommandEditor.build('ChangeUnitSide', { eventId: 20, team: 'ally' }, 0));
        assert.equal(d.$('eventId').options[d.$('eventId').selectedIndex].textContent, '020: Conscript');
        assert.equal(d.$('eventId').options.some(option => /no such event/.test(option.textContent)), false);
        d.$('ok').click();
        await settle();
        assert.deepEqual(d.got[0].parameters[3], { eventId: 20, team: 'ally' });
    });
});

test('the In battle row, driven: a side makes a unit, names the event and redraws the Image box; a page comment is asked about', async () => {
    const c = northHaven();
    await withPage(c, async page => {
        const field = page.document.createElement('input');
        field.attrs.id = 'event-name-field';
        page.document.body.appendChild(field);
        let redrawn = 0, reopened = 0;
        const editor = Object.assign(Object.create(EventEditor.prototype), { databaseManager: page.manager, _t: key => ({ 'event.unitAs': 'as', 'event.unitMove': 'Move' })[key] || key,
            pageEditor: { refreshCharacterPreview() { redrawn++; } }, showEventEditor() { reopened++; } });
        const holder = page.document.createElement('div');
        holder.className = 'event-editor-container';
        page.document.body.appendChild(holder);
        const event = { id: 4, name: 'EV004', note: '', pages: [newPage()] };
        const row = editor.createUnitRow(event);
        const team = row.querySelector('.event-unit-team'), more = row.querySelector('.event-unit-more'), returns = row.querySelector('.event-unit-returns');
        assert.deepEqual(team.options.map(option => option.textContent), ['Does not fight', 'Enemy', 'Ally', 'Bystander']);
        assert.equal(more.hidden, true, 'an event that does not fight shows the side alone');
        team.value = 'enemy';
        team.dispatch('change');
        assert.deepEqual(event.rrUnit, { team: 'enemy', record: 'enemy', id: 6 });
        assert.deepEqual([more.hidden, returns.hidden], [false, false]);
        assert.equal(row.querySelector('.event-unit-id').value, 'enemy:6', 'the record select follows the choice made for it');
        assert.deepEqual([event.name, field.value], ['Raider', 'Raider'], 'the automatic name gives way to the record');
        assert.equal(redrawn, 1, 'the Image box is drawn again');
        // Ally: Comes back is an enemy's; the record stays.
        team.value = 'ally';
        team.dispatch('change');
        assert.deepEqual([event.rrUnit, returns.hidden, redrawn], [{ team: 'ally', record: 'enemy', id: 6 }, true, 2]);
        // A name the author typed is not taken.
        event.name = 'Gate guard';
        row.querySelector('.event-unit-id').value = 'enemy:13';
        row.querySelector('.event-unit-id').dispatch('change');
        assert.deepEqual([event.rrUnit.id, event.name], [13, 'Gate guard']);
        team.value = '';
        team.dispatch('change');
        assert.deepEqual(['rrUnit' in event, more.hidden], [false, true]);
        assert.equal(event.name, 'Gate guard', 'and stays when the event stops fighting');
        // "Does not fight" again: the name the row gave goes back to the one it replaced, however many records it went through.
        const passer = { id: 7, name: 'EV007', note: '', pages: [newPage()] };
        const second = editor.createUnitRow(passer), side = second.querySelector('.event-unit-team');
        side.value = 'enemy';
        side.dispatch('change');
        second.querySelector('.event-unit-id').value = 'enemy:13';
        second.querySelector('.event-unit-id').dispatch('change');
        assert.deepEqual([passer.name, field.value], ['Conscript', 'Conscript']);
        side.value = '';
        side.dispatch('change');
        assert.deepEqual(['rrUnit' in passer, passer.name, field.value], [false, 'EV007', 'EV007']);
        side.value = 'enemy';
        side.dispatch('change');
        assert.equal(passer.name, 'Raider', 'and a unit again takes its record\'s name again');
        assert.equal(EventEditor.nameWithoutUnit('Raider', { name: 'Raider', was: 'EV004' }), 'EV004');
        assert.equal(EventEditor.nameWithoutUnit('Gate guard', { name: 'Raider', was: 'EV004' }), null, 'a typed name stays');
        assert.equal(EventEditor.nameWithoutUnit('Raider', null), null, 'a name the row did not give stays');

        // A unit by a comment on page 2 of two shows in the same controls. Changing one says what a row changes, and Cancel leaves the tag.
        const conscript = JSON.parse(JSON.stringify(c.map.events[5]));
        editor.currentEvent = conscript;
        const tagged = editor.createUnitRow(conscript), tagTeam = tagged.querySelector('.event-unit-team'), tagId = tagged.querySelector('.event-unit-id');
        assert.deepEqual([tagTeam.value, tagId.value, tagged.querySelector('.event-unit-more').hidden], ['enemy', 'enemy:13', false]);
        page.answer = false;
        tagTeam.value = 'ally';
        tagTeam.dispatch('change');
        await settle();
        assert.deepEqual(page.asked.map(asked => asked.message), ['A row makes it a unit on every page, not only on page 2.']);
        assert.deepEqual(['rrUnit' in conscript, conscript.pages[1].list.length, reopened, tagTeam.value], [false, 2, 0, 'enemy']);
        page.answer = true;
        tagTeam.value = 'ally';
        tagTeam.dispatch('change');
        await settle();
        assert.deepEqual([conscript.rrUnit, conscript.pages[1].list.length, reopened], [{ team: 'ally', record: 'enemy', id: 13 }, 1, 1]);
        // A Note tag, or a comment on an event's only page, is the same unit as a row: no question.
        const captain = JSON.parse(JSON.stringify(c.map.events[6]));
        editor.currentEvent = captain;
        const noted = editor.createUnitRow(captain), notedMove = noted.querySelector('.event-unit-move');
        assert.equal(noted.querySelector('.event-unit-team').value, 'neutral');
        notedMove.value = '3';
        notedMove.dispatch('change');
        await settle();
        assert.deepEqual([page.asked.length, captain.rrUnit, captain.note, reopened], [2, { team: 'neutral', record: 'enemy', id: 12, move: 3 }, '', 2]);
        // "Does not fight" on a tag unit takes the tag out, with no question.
        const leaver = JSON.parse(JSON.stringify(c.map.events[5]));
        editor.currentEvent = leaver;
        const leaving = editor.createUnitRow(leaver).querySelector('.event-unit-team');
        leaving.value = '';
        leaving.dispatch('change');
        await settle();
        assert.deepEqual([page.asked.length, 'rrUnit' in leaver, EventEditor.tagUnit(leaver), leaver.pages[1].list.length], [2, false, null, 1]);
    });
    // When a row widens what a tag did.
    const comment = text => ({ code: 108, indent: 0, parameters: [text] });
    assert.equal(EventEditor.rowWidens(c.map.events[5]), 2);
    assert.equal(EventEditor.rowWidens(c.map.events[6]), 0, 'a Note tag');
    assert.equal(EventEditor.rowWidens({ pages: [page({ list: [comment('<unit: enemy 6>'), end] })] }), 0, 'its only page');
    assert.equal(EventEditor.rowWidens({ pages: [page({ list: [comment('<unit: enemy 6>'), end] }), page({ list: [comment('<unit: enemy 6>'), end] })] }), 0, 'a comment on every page');
    assert.equal(EventEditor.rowWidens(c.map.events[3]), 0, 'a row already');
    // The name: the record's while the event's own is automatic or one the row gave.
    const lists = { enemies: c.enemies, actors: c.actors };
    assert.equal(EventEditor.nameAfterUnit('EV004', { record: 'enemy', id: 6 }, lists, null), 'Raider');
    assert.equal(EventEditor.nameAfterUnit('Raider', { record: 'enemy', id: 13 }, lists, 'Raider'), 'Conscript', 'a name the row gave follows the record');
    assert.equal(EventEditor.nameAfterUnit('Raider', { record: 'enemy', id: 13 }, lists, null), null, 'a typed name stays');
    assert.equal(EventEditor.nameAfterUnit('EV004', { record: 'enemy', id: 99 }, lists, null), null);
});

test('the Image box of a unit: whose look it shows, in order', () => {
    const EventPageEditor = require('../src/event/EventPageEditor.js');
    const tx = (text, params) => FightCommandEditor._t(text, params);
    const colors = { ally: '#4aa8ff', enemy: '#ff5a4a', neutral: '#e6d15a' };
    const raider = { id: 6, name: 'Raider', battlerName: 'Raider_01', battlerHue: 40, note: '' };
    const enemy = { team: 'enemy', record: 'enemy', id: 6 }, ally = { team: 'ally', record: 'actor', id: 2 };
    const look = (unit, record, more = {}) => EventPageEditor.lookOf(unit, record, Object.assign({ colors, tx }, more));
    const note = 'Looks like Raider (Database › Enemies)';
    // Battle Setup's answer first, then the bound model, then a character, a battler picture, a plain figure.
    assert.deepEqual(look(enemy, raider, { given: { kind: 'character', characterName: 'Given', characterIndex: 3 }, model: { name: 'Raider.glb' } }), { note, kind: 'character', characterName: 'Given', characterIndex: 3 });
    assert.deepEqual(look(enemy, raider, { given: { kind: 'nonsense' }, model: { name: 'Raider.glb' } }), { kind: 'model', spec: { name: 'Raider.glb' }, note });
    assert.deepEqual(look(enemy, Object.assign({}, raider, { note: '<unit character: Monster, 2>' })), { kind: 'character', characterName: 'Monster', characterIndex: 2, note });
    assert.deepEqual(look(enemy, raider), { kind: 'picture', folder: 'enemies', name: 'Raider_01', hue: 40, note });
    assert.equal(look(enemy, raider, { sideView: true }).folder, 'sv_enemies');
    assert.deepEqual(look(enemy, { id: 6, name: 'Raider' }), { kind: 'figure', color: '#ff5a4a', note: 'Raider has no picture: it stands as a plain figure.' });
    assert.deepEqual(look(ally, { id: 2, name: 'Carol Everson', characterName: 'Actor1', characterIndex: 1 }), { kind: 'character', characterName: 'Actor1', characterIndex: 1, note: 'Looks like Carol Everson (Database › Actors)' });
    assert.deepEqual(look({ team: 'neutral', record: '', id: 0 }, null), { kind: 'figure', color: '#e6d15a', note: '' }, 'a bystander with no record');
    // The box shows it only where the page has no picture, tile or model of its own.
    assert.equal(EventPageEditor.showsUnitLook({ tileId: 0, characterName: '' }, null), true);
    assert.equal(EventPageEditor.showsUnitLook({ tileId: 0, characterName: 'Actor1' }, null), false);
    assert.equal(EventPageEditor.showsUnitLook({ tileId: 12, characterName: '' }, null), false);
    assert.equal(EventPageEditor.showsUnitLook({ tileId: 0, characterName: '' }, { name: 'Tank.glb' }), false);
    // The instance asks for the look of the page it is on: a comment unit is one on its own page only.
    const c = northHaven();
    const editor = Object.assign(Object.create(EventPageEditor.prototype), { parentEditor: { currentEvent: c.map.events[5], currentPageIndex: 1 },
        databaseManager: { getEnemies: () => c.enemies, getActors: () => c.actors, getSystem: () => ({ optSideView: false }) }, projectController: { currentProject: null } });
    const before = globalThis.FightCommandEditor;
    globalThis.FightCommandEditor = FightCommandEditor;
    try {
        assert.equal(editor.unitLook(0), null, 'page 1 holds no tag');
        assert.deepEqual(editor.unitLook(1), { kind: 'figure', color: '#ff5a4a', note: 'Conscript has no picture: it stands as a plain figure.' });
    } finally { globalThis.FightCommandEditor = before; }
});

test('the battle row in Conditions, driven: the moment and only the fields it has', async () => {
    const EventPageEditor = require('../src/event/EventPageEditor.js');
    assert.deepEqual(EventPageEditor.hookValue('turnStart', { turn: '3', team: 'enemy' }), { on: 'turnStart', turn: 3, team: 'enemy' });
    assert.deepEqual(EventPageEditor.hookValue('turnEnd', { turn: '-2' }), { on: 'turnEnd', turn: 0, team: 'any' });
    assert.deepEqual(EventPageEditor.hookValue('unitDefeated', { unit: 'this', turn: 9 }), { on: 'unitDefeated', unit: 'this' });
    assert.deepEqual(EventPageEditor.hookValue('unitEnters', { region: '0', team: 'ally' }), { on: 'unitEnters', region: 1, team: 'ally' });
    assert.deepEqual(EventPageEditor.hookValue('battleStart', { turn: 2 }), { on: 'battleStart' });
    assert.equal(EventPageEditor.hookValue('', {}), null);
    await withPage(northHaven(), async () => {
        const words = { 'event.hookNever': 'Never', 'event.hookTurn': 'turn', 'event.hookRegion': 'region' };
        const editor = Object.assign(Object.create(EventPageEditor.prototype), { _tt: text => text, _t: key => words[key] || key });
        const stored = newPage();
        const row = editor.createFightHookRow(stored);
        const select = row.querySelector('.event-fight-hook-on'), more = row.querySelector('.event-fight-hook-more');
        assert.equal(row.querySelector('.event-fight-hook-label').textContent, 'Runs during a battle');
        assert.deepEqual(select.options.map(option => option.textContent), ['Never', 'When the battle starts', 'When a turn starts', 'When a turn ends', 'When a unit is defeated', 'When a unit steps on a region']);
        select.value = 'turnStart';
        select.dispatch('change');
        assert.deepEqual(stored.rrFightHook, { on: 'turnStart' });
        assert.equal(more.textContent.replace(/\s+/g, ' ').trim().startsWith('turn(0: every turn)'), true, 'the turn field says what 0 means');
        const turn = more.querySelector('.event-fight-hook-turn');
        turn.value = '3';
        turn.dispatch('change');
        assert.deepEqual(stored.rrFightHook, { on: 'turnStart', turn: 3, team: 'any' });
        select.value = 'unitEnters';
        select.dispatch('change');
        const region = more.querySelector('.event-fight-hook-region');
        assert.equal(more.querySelector('.event-fight-hook-turn'), null);
        region.value = '7';
        region.dispatch('change');
        assert.deepEqual(stored.rrFightHook, { on: 'unitEnters', region: 7, team: 'any' });
        select.value = '';
        select.dispatch('change');
        assert.equal('rrFightHook' in stored, false, 'Never takes it away');
        assert.equal(more.children.length, 0);
        assert.equal(F_normalizes(EventPageEditor.hookValue('turnStart', { turn: '3', team: 'enemy' })), true, 'the game reads what the row writes');
    });
    // Battle Processing's line is asked for while the map's event editor is open.
    await withPage(northHaven(), async page => {
        const real = globalThis.document;
        const line = display => {
            globalThis.document = { getElementById: id => (id === 'event-editor-modal' && display !== null ? { style: { display } } : null) };
            try { return BattleProcessingEditor.prototype.foughtOnMapLine.call({ databaseManager: page.manager }); } finally { globalThis.document = real; }
        };
        assert.equal(line(''), "Fought on this map as First Person (this map's mode): the troop appears round the party and the enemy units near it join.");
        assert.equal(line('none'), '', 'the Database has no map to fight on');
        assert.equal(line(null), '');
        assert.match(read('src/event/commands/BattleProcessingEditor.js'), /const fought = this\.foughtOnMapLine\(\);\s+if \(fought\) \{[^}]*line\.textContent = fought;\s+content\.appendChild\(line\);/);
    });
});
const newPage = overrides => page(overrides);
const F_normalizes = hook => !!fightWorld().ReactorFight.normalizeHook(hook);

test('a dialog and the tile picker are entered once: the focus that falls to the page is taken again, and what opened them gets it back', async () => {
    await withPage(northHaven(), async page => {
        const { document } = page;
        // The editor's own dialog keys, on the small page.
        globalThis.RRKeyboardNavigation = require('../src/utils/KeyboardNavigation.js');
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        let d = openDialog(page, 'SpawnUnit', null);
        assert.equal(document.activeElement, d.$('who'), 'the focus starts on the first control');
        // The editor dresses the lists up once they are in the page, and the focus falls to the page.
        document.body.focus();
        await new Promise(resolve => setTimeout(resolve, 5));
        assert.equal(document.activeElement, d.$('who'), 'the dialog takes it again');
        d.all('.fc-cancel')[1].click();
        assert.equal(d.open(), false);
        assert.equal(document.activeElement, opener, 'and what opened the dialog has it back');
        // With the focus on the page, Enter is still the dialog's OK.
        d = openDialog(page, 'EndMapBattle', null);
        document.body.focus();
        document.pressOnPage('Enter');
        await settle();
        assert.deepEqual([d.open(), d.got.map(command => command.parameters[1])], [false, ['EndMapBattle']]);
        assert.equal(document.listeners.length, 0, 'a closed dialog listens to nothing on the page');

        // The picker of Pick on the map: OK is off while the map is drawn and cannot hold the focus.
        const TransferPlayerEditor = require('../src/event/commands/TransferPlayerEditor.js');
        const paint = new Proxy({}, { get: (target, key) => (key in target ? target[key] : () => {}), set: (target, key, value) => { target[key] = value; return true; } });
        const create = document.createElement;
        document.createElement = tag => { const element = create(tag); if (tag === 'canvas') element.getContext = () => paint; return element; };
        const controller = { getCurrentProject: () => ({ maps: [{ id: 5, name: 'North Haven Village' }] }),
            tilemapManager: { TILE_SIZE: 48, currentMap: null, renderMapToCanvas: async () => true, fs: { existsSync: () => false }, path, projectPath: path.join(__dirname, 'no-such-project') } };
        const got = { cancelled: 0, confirmed: null };
        const openPicker = () => {
            new TransferPlayerEditor(page.manager, controller).showMapPicker({ mapId: 5, x: 3, y: 4, thisMapOnly: true, onConfirm: at => { got.confirmed = at; }, onCancel: () => { got.cancelled++; } });
            return document.body.children[document.body.children.length - 1];
        };
        opener.focus();
        let picker = openPicker();
        const ok = () => picker.querySelector('.rr-button-primary');
        assert.equal(ok().disabled, true, 'OK is off while the map is drawn');
        // The coordinates: one line over the map's corner that takes no room above the map and lets a click through.
        const chip = picker.querySelector('.coords-display');
        assert.equal(chip.textContent, 'X: 3, Y: 4');
        assert.match(chip.style.cssText, /white-space: nowrap;/);
        assert.match(chip.style.cssText, /height: 28px;[^]*margin: 8px 8px -36px 8px;/, 'its margins add up to its height');
        assert.doesNotMatch(chip.style.cssText, /float:/, 'a float would push the map down');
        assert.match(chip.style.cssText, /pointer-events: none;/);
        document.body.focus();
        for (let i = 0; i < 6; i++) await settle();
        assert.equal(ok().disabled, false);
        assert.equal(document.activeElement, ok(), 'OK takes the focus once the map is drawn');
        picker.dispatch('keydown', { key: 'Escape' });
        assert.deepEqual([picker.parentNode, got.cancelled, got.confirmed], [null, 1, null], 'Escape is Cancel');
        assert.equal(document.activeElement, opener, 'and what opened the picker has the focus back');
        // Enter on the page (a click on the picture leaves the focus there) is OK: the tile it opened on comes back.
        picker = openPicker();
        document.body.focus();
        for (let i = 0; i < 6; i++) await settle();
        document.body.focus();
        document.pressOnPage('Enter');
        assert.deepEqual([picker.parentNode, got.cancelled, got.confirmed], [null, 1, { mapId: 5, x: 3, y: 4 }]);
        assert.equal(document.activeElement, opener);
        assert.equal(document.listeners.length, 0, 'a closed picker listens to nothing on the page');
    });
});

test('every word the forms, the lines and the row show is translated into the 17 locales', () => {
    const vm = require('node:vm');
    const source = ['I18nDeepTranslations.js', 'I18nReviewedTranslations.js', 'I18nManager.js'].map(file => {
        const full = path.join(__dirname, '..', 'src', file);
        return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
    }).join('\n');
    const document = { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } };
    const sandbox = { window: { dispatchEvent() {}, document }, document, localStorage: { getItem() { return null; }, setItem() {} }, CustomEvent: class {} };
    const { text, commands, keyed } = vm.runInNewContext(`${source}\n({ text: RR_TEXT_TRANSLATIONS, commands: RR_EVENT_COMMAND_NAMES, keyed: RR_I18N_STRINGS });`, sandbox);
    // The phrases: every label in the tables, and every string a translating call is given in the files this package owns.
    const phrases = new Set();
    const F = FightCommandEditor;
    for (const table of [F.GOALS, F.MODES, F.SCOPES, F.RESULTS, F.SIDES, F.TURNS, F.VIEWS, F.COSTS, F.TERRAINS, F.FACINGS, F.FACING_LINES]) for (const [, label] of table) phrases.add(label);
    for (const title of Object.values(F.TITLES)) phrases.add(title);
    const looksLikeWords = value => /[A-Za-z]/.test(value) && (/\s|\{/.test(value) || /^[A-Z(]/.test(value)) && !/^[.#<]|fc-|event-|rr-/.test(value);
    const literals = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
    const scan = (file, callers) => {
        const code = read(file);
        const call = new RegExp(`(?<![\\w$.])(?:${callers.join('|')})\\(`, 'g');
        let match;
        while ((match = call.exec(code)) !== null) {
            // The call's own arguments, to its closing bracket.
            let depth = 1, at = call.lastIndex;
            for (; at < code.length && depth > 0; at++) {
                const ch = code[at];
                if (ch === "'" || ch === '"' || ch === '`') { const close = code.indexOf(ch, at + 1); at = close < 0 ? code.length : close; while (code[at - 1] === '\\') at = code.indexOf(ch, at + 1); }
                else if (ch === '(') depth++;
                else if (ch === ')') depth--;
            }
            const inside = code.slice(call.lastIndex, at);
            let literal;
            literals.lastIndex = 0;
            while ((literal = literals.exec(inside)) !== null) {
                const value = (literal[1] !== undefined ? literal[1] : literal[2]).replace(/\\(['"])/g, '$1');
                if (looksLikeWords(value)) phrases.add(value);
            }
        }
    };
    scan('src/event/commands/FightCommandEditor.js', ['t', 'tr', 'sentence', 'check', '_t']);
    scan('src/event/commands/BattleProcessingEditor.js', ['FightCommandEditor\\._t']);
    for (const name of ['createUnitRow']) {
        const code = read('src/event/EventEditor.js'), from = code.indexOf(`    ${name}(`);
        assert.ok(from > 0, name);
        const body = code.slice(from, code.indexOf('\n    }\n', from));
        for (const literal of body.matchAll(/(?<![\w$.])(?:tt|t)\(\s*(?:[^'"()]*\?\s*)?'((?:[^'\\\n]|\\.)*)'/g)) phrases.add(literal[1].replace(/\\'/g, "'"));
        for (const literal of body.matchAll(/\['[a-z]*', '([A-Z][^']*)'\]/g)) phrases.add(literal[1]);
        for (const literal of body.matchAll(/: '([A-Z][a-z]+)'/g)) phrases.add(literal[1]);
    }
    const listCode = read('src/event/EventCommandList.js');
    const asked = listCode.slice(listCode.indexOf('    static lostBranchWords(lost, name, t) {'), listCode.indexOf('    static replaceBattleStart('));
    for (const literal of asked.matchAll(/(?<![\w$.])t\('((?:[^'\\\n]|\\.)*)'/g)) phrases.add(literal[1]);
    const pageCode = read('src/event/EventPageEditor.js');
    const hook = pageCode.slice(pageCode.indexOf('    createFightHookRow(page) {'), pageCode.indexOf('    createImageSection('));
    for (const literal of hook.matchAll(/'([A-Z(][^'\n]*)'/g)) phrases.add(literal[1]);
    const look = pageCode.slice(pageCode.indexOf('    static lookOf(unit, record, '), pageCode.indexOf('    _showUnitLookNote('));
    for (const literal of look.matchAll(/'([A-Z{][^'\n]* [^'\n]*)'/g)) phrases.add(literal[1]);
    // A list line's words: the ones the spec's lines are made of must be among them.
    for (const phrase of ['{who} fights as an enemy', '{unit} at ({x}, {y}), facing left', 'every unit on this map', '(the event carries on)', 'Pick on the map…', 'Runs during a battle', 'Comes back',
        'Looks like {name} (Database › Enemies)', 'When a unit steps on a region', '(0: every turn)', 'Leave it to events', "This map's mode ({mode})",
        'The commands under {branches} will be deleted.', 'A row makes it a unit on every page, not only on page {page}.', 'Slow ({steps} steps)', 'With none chosen it faces as its pages say.', 'Delete']) assert.ok(phrases.has(phrase), `the scan sees ${phrase}`);
    assert.ok(phrases.size > 120, `${phrases.size} phrases`);
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    const missing = [];
    // The bare words of the row and the battle row are keyed, so each has one meaning.
    for (const key of ['event.unitAs', 'event.unitMove', 'event.hookNever', 'event.hookTurn', 'event.hookRegion']) {
        assert.ok(keyed.en[key], key);
        for (const locale of locales) if (!keyed[locale][key] || keyed[locale][key] === keyed.en[key]) missing.push(`${locale}: ${key}`);
    }
    for (const locale of locales) {
        for (const phrase of phrases) {
            const translated = (text[locale] && text[locale][phrase]) || (commands[locale] && commands[locale][phrase]);
            if (!translated) missing.push(`${locale}: ${phrase}`);
            else {
                const slots = value => (value.match(/\{\w+\}/g) || []).sort().join();
                assert.equal(slots(translated), slots(phrase), `${locale} keeps the slots of ${phrase}`);
            }
        }
    }
    assert.deepEqual(missing, [], `untranslated:\n${missing.join('\n')}`);
});
