'use strict';
// Battle Setup (src/event/BattleSetup.js): the card docked beside the map.
// Its DOM-free half is driven here: the map's two Note tags and the game
// reading them back, the events it makes (a unit, Quick Event > Battle
// start), where a click lands and why it is refused, the one sentence, the
// place the party plays from, and the launch line of Play this battle. What
// the card's button, menu entry and map hooks are is read from the files.
// The card itself, drawn and driven, is battle-setup-card.test.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { fightWorld } = require('./helpers/fight-world.cjs');

const B = require('../src/event/BattleSetup.js');
const C = require('../src/utils/BattleCheck.js');
const FightCommandEditor = require('../src/event/commands/FightCommandEditor.js');
const V = require('../build-scripts/validate-battle.cjs');
const editorRoot = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');

//-----------------------------------------------------------------------------
// A small Database, maps, and a map's event manager.

const actors = [null, { id: 1, name: 'Ren', characterName: 'Actor1', characterIndex: 0 }, { id: 2, name: 'Mira', characterName: 'Actor1', characterIndex: 1 }, { id: 3, name: '', characterName: '' }];
const enemies = [null, { id: 1, name: 'Bat', battlerName: 'Bat', note: '' }, { id: 2, name: 'Slime', battlerName: '', note: '' }, { id: 3, name: '', battlerName: '' }, { id: 4, name: 'Tank', battlerName: '', note: '' }];
const system = { partyMembers: [1], optSideView: false };
// Tile 1 is open ground, tile 2 a wall nobody walks onto.
const tilesets = [null, { id: 1, flags: [0x10, 0, 0x0f] }];
const lookups = more => Object.assign({ system, actors, enemies, tilesets }, more);

const END = { code: 0, indent: 0, parameters: [] };
const page = (more = {}) => Object.assign({ conditions: {}, image: { tileId: 0, characterName: '', characterIndex: 0, direction: 2, pattern: 1 }, priorityType: 1, through: false, trigger: 0, moveType: 0, list: [END] }, more);
const ev = (id, x, y, more = {}) => Object.assign({ id, name: 'EV' + String(id).padStart(3, '0'), note: '', x, y, pages: [page()] }, more);
const unit = (id, x, y, team = 'enemy', record = 'enemy', recordId = 1, more = {}) => ev(id, x, y, Object.assign({ name: 'Bat', rrUnit: { team, record, id: recordId } }, more));
const command = (name, args = {}) => ({ code: 357, indent: 0, parameters: ['RPGReactor', name, name, args] });
const comment = text => ({ code: 108, indent: 0, parameters: [text] });
const starter = (id, x, y, args = { who: 'map' }) => ev(id, x, y, { name: 'Villager', pages: [page({ list: [command('StartMapBattle', args), END] })] });

/** A 2D map of open ground, 20 by 15, with walls on the tiles named. */
function flat(events = [], more = {}, walls = []) {
    const width = 20, height = 15, data = new Array(width * height * 6).fill(0);
    for (let i = 0; i < width * height; i++) data[i] = 1;
    for (const [x, y] of walls) data[y * width + x] = 2;
    const list = [null];
    for (const event of events) list[event.id] = event;
    return Object.assign({ id: 1, width, height, tilesetId: 1, note: '', data, events: list }, more);
}

let nextPiece = 1;
const piece = (kind, x, y, z, more) => Object.assign({ id: nextPiece++, kind, x, y, z, rot: 0, material: '' }, more || {});
/**
 * A 3D map, 14 by 14, of level ground with: a deck two up over (2, 2); a
 * slab laid at a steep tilt on (6, 2); a fence on (10, 2); an upper floor
 * five up over (2, 6); a wall on (10, 6); water three deep over (0..3,
 * 10..13).
 */
function deep(events = []) {
    const list = [null], data = new Array(14 * 14 * 6).fill(0);
    for (const event of events) list[event.id] = event;
    for (let i = 0; i < 14 * 14; i++) data[i] = 1;
    return {
        id: 2, width: 14, height: 14, tilesetId: 1, note: '<3d>', data, events: list,
        reactor3d: {
            version: 1, mode: '3d', width: 14, height: 14, elevation: new Array(196).fill(0),
            pieces: [piece('floor', 2, 2, 2), piece('box', 6, 2, 0, { size: [1, 0.25, 4], tilt: 60 }), piece('fence', 10, 2, 0), piece('floor', 2, 6, 5), piece('wall', 10, 6, 0)],
            water: [{ x0: 0, y0: 10, x1: 3, y1: 13, level: 3 }]
        }
    };
}

// EventManager's makers, verbatim, so the events are the ones the editor would make.
const managerSource = read('src/EventManager.js');
const method = name => { const start = managerSource.indexOf(`    ${name}(`); return managerSource.slice(start, managerSource.indexOf('\n    }\n', start) + 6); };
const Makers = new Function(`return class { constructor(map) { this.currentMap = map; }\n${method('getNextEventId')}\n${method('makeDefaultEventPage')}\n${method('makeQuickEvent')}\n}`)();
/** A map's event manager, as far as the card asks it. */
class Manager extends Makers {
    constructor(map) { super(map); this.eventMode = true; this.saved = 0; this.drawn = 0; this.selectedEvent = null; this.forgotten = []; }
    getEventAt(x, y) { return (this.currentMap.events || []).find(event => event && event.x === x && event.y === y) || null; }
    saveState() { this.saved++; }
    renderEvents() { this.drawn++; }
    selectEvent(event) { this.selectedEvent = event; }
    deleteEvent(event) { this.saveState(); this.currentMap.events[event.id] = null; if (this.selectedEvent === event) this.selectedEvent = null; }
    _setEventModels(id, models) { this.forgotten.push(['models', id, models]); }
    _setEventPlacement(id, placement) { this.forgotten.push(['placement', id, placement]); }
}

/** The card with a unit in hand over a map, the Database behind it; `more` are globals for the length of `run` (to the end of what it promises). */
function withCard(map, brush, more, run) {
    const manager = new Manager(map), state = B._state, kept = {};
    const globals = Object.assign({ reactor: { databaseManager: { data: { actors, enemies, tilesets, system }, getSystem: () => system } } }, more || {});
    for (const key of Object.keys(globals)) { kept[key] = globalThis[key]; globalThis[key] = globals[key]; }
    Object.assign(state, { manager, open: true, brush: brush ? Object.assign({ direction: 2 }, brush) : null, pick: null, verdict: null, occupancy: null, report: null, props: null, propsKey: '' });
    state.bound.clear(); state.bodies.clear();
    const tidy = () => {
        Object.assign(state, { manager: null, open: false, brush: null, pick: null, verdict: null, occupancy: null, report: null });
        state.bound.clear(); state.bodies.clear();
        for (const key of Object.keys(globals)) { if (kept[key] === undefined) delete globalThis[key]; else globalThis[key] = kept[key]; }
    };
    let result;
    try { result = run(manager, state); } catch (error) { tidy(); throw error; }
    if (result && typeof result.then === 'function') return result.finally(tidy);
    tidy();
    return result;
}

const RAIDER = { team: 'enemy', record: 'enemy', id: 1 };

//-----------------------------------------------------------------------------
// The map's two Note tags (SPEC 2.12).

test('the start is one Note tag, written in full: a distance, open, and 0', () => {
    assert.equal(B.withTrigger('A quiet road.', 6), 'A quiet road.\n<battle trigger: 6>');
    assert.equal(B.withTrigger('A quiet road.', 'open'), 'A quiet road.\n<battle trigger: open>');
    assert.equal(B.withTrigger('A quiet road.', 0), 'A quiet road.\n<battle trigger: 0>', '"When an event says so" is written, not left out');
    assert.equal(B.withTrigger('', 12), '<battle trigger: 12>');
    // One tag: the old one is replaced where it stands, whatever its spelling; every other line is kept.
    assert.equal(B.withTrigger('a\n<battle trigger: 9>\nb', 4), 'a\n<battle trigger: 4>\nb');
    assert.equal(B.withTrigger('<Battle Trigger:9>', 'OPEN'), '<battle trigger: open>');
    assert.equal(B.withTrigger('a\n<battle trigger: 9>\nb', null), 'a\nb', 'null takes the tag out');
    // A distance is whole and from 1 to 50; words that name no start change nothing.
    assert.equal(B.withTrigger('a', 99), 'a\n<battle trigger: 50>');
    assert.equal(B.withTrigger('a', 7.9), 'a\n<battle trigger: 7>');
    assert.equal(B.withTrigger('a', 'soon'), 'a');
    assert.deepEqual([B.DISTANCE, B.DISTANCE_MAX], [6, 50]);
    // Read back.
    assert.deepEqual(['<battle trigger: 12>', '<battle trigger: OPEN>', '<battle trigger: 0>', '<battle trigger: 51>', '<battle trigger: soon>', ''].map(B.triggerOf), [12, 'open', 0, null, null, null]);
    for (const value of [1, 6, 50, 'open', 0]) assert.equal(B.triggerOf(B.withTrigger('x', value)), value);
});

test('the mode is the other tag; the game\'s mode takes it out', () => {
    assert.equal(B.withMode('a', 'firstperson'), 'a\n<battle mode: firstPerson>', 'written as the game spells it');
    assert.equal(B.withMode('<battle mode: TACTICAL>', 'classic'), '<battle mode: classic>', 'Classic is a mode a map can name');
    for (const none of [null, '', 'game']) assert.equal(B.withMode('a\n<battle mode: action>', none), 'a');
    assert.equal(B.withMode('a', 'nonsense'), 'a');
    assert.deepEqual(B.MODES, ['classic', 'tactical', 'action', 'firstPerson']);
});

test('what the card writes is what the game reads', () => {
    const F = fightWorld().ReactorFight;
    for (const tiles of [1, 6, 50]) assert.equal(F.triggerRange({ note: B.withTrigger('x', tiles) }), tiles);
    assert.equal(F.triggerRange({ note: B.withTrigger('x', 0) }), 0, 'the map never starts one by itself');
    for (const mode of B.MODES) assert.equal(F.mapMode({ note: B.withMode('x', mode) }), mode);
    assert.equal(F.mapMode({ note: B.withMode('x\n<battle mode: action>', null) }), '');
    // And the checker, which the sentence and the tools read with.
    assert.deepEqual([6, 'open', 0].map(value => { const start = C.startOf({ note: B.withTrigger('', value), events: [] }); return [start.kind, start.tiles, start.from]; }),
        [['near', 6, 'tag'], ['open', 6, 'tag'], ['event', 6, 'tag']]);
});

test('the Note is the one place: writing a tag takes the sidecar\'s key away', () => {
    const map = flat([], { reactor3d: { battle: { trigger: 9, mode: 'action' } } });
    assert.equal(B.setStart(map, 4), true);
    assert.deepEqual([map.note, map.reactor3d.battle], ['<battle trigger: 4>', { mode: 'action' }]);
    assert.equal(B.setMode(map, 'tactical'), true);
    assert.deepEqual([map.note, map.reactor3d.battle], ['<battle trigger: 4>\n<battle mode: tactical>', undefined]);
    assert.equal(B.setMode(map, 'tactical'), false, 'nothing changed: no undo step, no dirty map');
    // The game's mode: the tag goes, and a mode left in the sidecar with it.
    const own = flat([], { reactor3d: { battle: { mode: 'action' } } });
    assert.equal(B.setMode(own, null), true);
    assert.deepEqual([own.note, own.reactor3d.battle], ['', undefined]);
});

test('the first unit on a map writes the start in force, so the Note says what will happen', () => {
    const plain = flat(), scripted = flat([starter(4, 2, 2)]), chosen = flat([], { note: 'x\n<battle trigger: open>' });
    assert.equal(B.ensureStart(plain), true);
    assert.equal(plain.note, '<battle trigger: 6>');
    B.ensureStart(scripted);
    assert.equal(scripted.note, '<battle trigger: 0>', 'a map with a Start Battle on Map event waits for its events');
    assert.equal(B.ensureStart(chosen), false);
    assert.equal(chosen.note, 'x\n<battle trigger: open>');
    // A tag the game cannot read is the author's to mend (the checker names it): it is not written over.
    const odd = flat([], { note: '<battle trigger: soon>' });
    assert.equal(B.ensureStart(odd), false);
    assert.equal(odd.note, '<battle trigger: soon>');
});

test('the mode in force: the map\'s tag in any letter case, else the game\'s, else Classic', () => {
    const game = { reactorBattle: { mode: 'tactical' } };
    assert.deepEqual((({ mode, from, game: named }) => [mode, from, named])(B.modeInForce(flat(), game)), ['tactical', 'game', 'tactical']);
    assert.deepEqual((({ mode, from, game: named }) => [mode, from, named])(B.modeInForce(flat([], { note: '<Battle Mode: ACTION>' }), game)), ['action', 'map', 'tactical']);
    assert.deepEqual((({ mode, from }) => [mode, from])(B.modeInForce(flat(), null)), ['classic', 'default']);
    assert.equal(B.modeInForce(flat(), { reactorBattle: { mode: 'firstPerson' } }).playsAs, 'action', 'First Person plays as Action on a 2D map');
    assert.equal(B.modeInForce(flat([], { note: '<3d>' }), { reactorBattle: { mode: 'firstPerson' } }).playsAs, 'firstPerson');
});

//-----------------------------------------------------------------------------
// The card's rows.

test('the mode row: the game\'s mode first, First Person only on a 3D map, and what the mode plays like', () => {
    const classic = B.modeInForce(flat(), null);
    assert.deepEqual(B.modeChoices(B.modeInForce(flat(), { reactorBattle: { mode: 'tactical' } }), false), [['', 'modeGame', { mode: 'Tactical' }], ['classic', 'classic', null], ['tactical', 'tactical', null], ['action', 'action', null]]);
    assert.deepEqual(B.modeChoices(classic, true).map(choice => choice[0]), ['', 'classic', 'tactical', 'action', 'firstPerson']);
    assert.equal(B.say('modeGame', { mode: B.say('classic') }), 'The game\'s mode (Classic)');
    assert.equal(B.playsLine(classic), 'Classic: the separate battle screen. Walk up to an enemy placed here and it opens.');
    assert.equal(B.playsLine(B.modeInForce(flat(), { reactorBattle: { mode: 'tactical' } })), 'Tactical: turns on a grid.');
    assert.equal(B.playsLine(B.modeInForce(flat([], { note: '<battle mode: action>' }), null)), 'Action: you walk and fight in real time. · this map only');
    assert.equal(B.playsLine(B.modeInForce(flat([], { note: '<3d>' }), { reactorBattle: { mode: 'firstPerson' } })), 'First Person: Action seen through the leader\'s eyes.');
    assert.equal(B.playsLine(B.modeInForce(flat(), { reactorBattle: { mode: 'firstPerson' } })), 'First Person plays as Action on a 2D map.');
});

test('the tiles: enemies for the Enemy side, Actors then Enemies for the others, records with no name left out', () => {
    const data = { actors, enemies };
    assert.deepEqual(B.tileRecords('enemy', data, ''), { total: 3, groups: [{ record: 'enemy', list: [{ record: 'enemy', id: 1, name: 'Bat' }, { record: 'enemy', id: 2, name: 'Slime' }, { record: 'enemy', id: 4, name: 'Tank' }] }] });
    for (const team of ['ally', 'neutral']) assert.deepEqual(B.tileRecords(team, data, '').groups.map(group => [group.record, group.list.map(entry => entry.name)]), [['actor', ['Ren', 'Mira']], ['enemy', ['Bat', 'Slime', 'Tank']]]);
    // The search narrows by name or number; the count before it decides whether a search box shows.
    assert.deepEqual(B.tileRecords('enemy', data, 'sl'), { total: 3, groups: [{ record: 'enemy', list: [{ record: 'enemy', id: 2, name: 'Slime' }] }] });
    assert.deepEqual(B.tileRecords('enemy', data, '4').groups[0].list.map(entry => entry.name), ['Tank']);
    assert.deepEqual(B.tileRecords('enemy', data, 'zzz'), { total: 3, groups: [] });
    assert.deepEqual(B.tileRecords('enemy', { enemies: [null] }, ''), { total: 0, groups: [] }, 'a blank project: the empty state');
});

test('a unit\'s look is the one rule\'s answer: own picture, bound model, character, battler picture, plain figure', () => {
    const bat = { id: 1, battlerName: 'Bat', battlerHue: 30 };
    const look = (unitSpec, event, given) => { const found = B.lookOf(unitSpec, event, given); return [found.kind, found.spec ? found.spec.name : found.characterName || found.name || '', found.folder || '', found.color]; };
    assert.deepEqual(look(RAIDER, null, { record: bat, model: { name: 'Actors/Jolt' } }), ['model', 'Actors/Jolt', '', '#ff5a4a']);
    assert.deepEqual(look({ team: 'ally', record: 'actor', id: 1 }, null, { record: actors[1], model: null }), ['character', 'Actor1', '', '#4aa8ff']);
    assert.deepEqual(look(RAIDER, null, { record: { id: 1, note: '<unit character: Monster, 3>', battlerName: 'Bat' }, model: null }), ['character', 'Monster', '', '#ff5a4a']);
    assert.deepEqual(look(RAIDER, null, { record: bat, model: null, sideView: false }), ['picture', 'Bat', 'enemies', '#ff5a4a']);
    assert.deepEqual(look(RAIDER, null, { record: bat, model: null, sideView: true }), ['picture', 'Bat', 'sv_enemies', '#ff5a4a']);
    assert.deepEqual(look(RAIDER, null, { record: bat, model: null, exists: () => false }), ['figure', '', '', '#ff5a4a'], 'a picture named but missing is no look');
    assert.deepEqual(look({ team: 'neutral', record: 'enemy', id: 2 }, null, { record: enemies[2], model: null }), ['figure', '', '', '#e6d15a']);
    // An event's own picture or model comes first; a unit made by a comment on page 2 looks at that page alone.
    const pictured = unit(7, 1, 1);
    pictured.pages[0].image.characterName = 'People1';
    assert.equal(B.lookOf(RAIDER, pictured, { record: bat, model: null }).kind, 'own');
    assert.equal(B.lookOf(RAIDER, unit(8, 1, 1), { record: bat, model: null }).kind, 'picture');
    assert.equal(B.lookOf(Object.assign({ page: 2 }, RAIDER), Object.assign(pictured, { pages: [pictured.pages[0], page()] }), { record: bat, model: null }).kind, 'picture');
    // The sides wear the colors the battle HUD draws them in.
    const hud = read('../runtime/reactor_ui_fight.js');
    for (const [team, color] of Object.entries(B.TEAM_COLORS)) assert.ok(hud.includes(`${team}: '${color}'`), team);
});

//-----------------------------------------------------------------------------
// The events it makes.

test('a placed unit is a plain event with its In battle row and no picture of its own', () => {
    const map = flat(), manager = new Manager(map);
    const made = B.unitEvent(manager, { team: 'ally', record: 'actor', id: 2 }, 4, 5, { actors, enemies, direction: 6 });
    assert.deepEqual(Object.keys(made), ['event']);
    assert.deepEqual([made.event.id, made.event.name, made.event.x, made.event.y], [1, 'Mira', 4, 5]);
    assert.deepEqual(made.event.rrUnit, { team: 'ally', record: 'actor', id: 2 }, 'no move of its own: the record decides');
    const image = made.event.pages[0].image;
    assert.deepEqual([image.characterName, image.tileId, image.direction], ['', 0, 6], 'the record\'s look stands for it, here and in the game');
    assert.deepEqual([made.event.pages.length, made.event.pages[0].priorityType, made.event.pages[0].trigger], [1, 1, 0]);
    assert.equal(B.unitEvent(manager, { team: 'enemy', record: 'enemy', id: 9 }, 1, 1, { actors, enemies }).event.name, 'Enemy', 'a record that is not there: the side names it');
    assert.equal(B.unitEvent(manager, RAIDER, 1, 1, { actors, enemies, direction: 5 }).event.pages[0].image.direction, 2);
    assert.equal(map.reactor3d, undefined, 'placing writes no model onto the event');
    // The game reads it as that unit, and the checker and the command dialogs read the same.
    map.events[1] = made.event;
    const F = fightWorld().ReactorFight, spec = F.unitSpecOf(made.event, []);
    assert.deepEqual([spec.team, spec.record, spec.id], ['ally', 'actor', 2]);
    assert.deepEqual((({ team, record, id, source }) => [team, record, id, source])(B.unitOf(made.event)), ['ally', 'actor', 2, 'row']);
});

test('units are counted whatever makes them one: a row, a note tag, a comment on a page', () => {
    const paged = ev(3, 9, 9, { pages: [page(), page({ list: [comment('<unit: enemy 1 move 4>'), END] })] });
    const map = flat([unit(1, 5, 5), ev(2, 8, 8, { note: '<unit: ally 1>' }), paged, starter(4, 2, 2), ev(5, 1, 1, { note: 'a door' })]);
    assert.deepEqual(B.census(map), { ally: 1, enemy: 2, neutral: 0, starters: 1 });
    assert.deepEqual((({ team, id, move, source, page: on }) => [team, id, move, source, on])(B.unitOf(paged)), ['enemy', 1, 4, 'comment', 2]);
    for (const event of map.events.filter(Boolean)) {
        const mine = B.unitOf(event), theirs = FightCommandEditor.unitOf(event);
        assert.deepEqual(mine && [mine.team, mine.record, mine.id], theirs && [theirs.team, theirs.record, theirs.id], event.name);
    }
    assert.equal(B.isStarter(map.events[4]), true);
    assert.equal(B.isStarter({ pages: [{ list: [command('SpawnUnit')] }] }), false);
    // As the game reads the words of a tag.
    const F = fightWorld().ReactorFight;
    for (const text of ['enemy 5', 'actor 3', 'ally 2', 'ally enemy 4', 'neutral', 'enemy', 'ally enemy 4 move 6']) {
        const theirs = F.parseUnitText(text), mine = B.parseUnitText(text);
        assert.deepEqual(mine && [mine.team, mine.record, mine.id], theirs && [theirs.team, theirs.record, theirs.id], text);
    }
});

test('Quick Event > Battle start: Player Touch, Start Battle on Map as its dialog writes a new one, once', () => {
    const map = flat([unit(1, 10, 7)]), manager = new Manager(map);
    const made = B.battleStartEvent(manager, 4, 6, { map, system, enemies, actors });
    assert.deepEqual([made.id, made.name, made.x, made.y, made.pages.length], [2, 'Battle Start', 4, 6, 2]);
    const [first, second] = made.pages;
    assert.deepEqual([first.trigger, first.priorityType], [1, 0], 'stepped on: Player Touch, below the characters');
    // The command and its branch rows are the dialog's own for a new command.
    const around = FightCommandEditor.context({ map, system, enemies, actors });
    const args = FightCommandEditor.argsOf('StartMapBattle', null, FightCommandEditor.formOf('StartMapBattle', null, around), around);
    const block = FightCommandEditor.block('StartMapBattle', args, 0);
    assert.deepEqual(first.list.slice(0, block.length), block);
    assert.deepEqual(first.list[0].parameters.slice(0, 2), ['RPGReactor', 'StartMapBattle']);
    assert.deepEqual([first.list[0].parameters[3].who, first.list[0].parameters[3].wait, first.list[0].parameters[3].objective], ['near', true, 'defeatAll']);
    assert.deepEqual(first.list.slice(block.length), [{ code: 123, indent: 0, parameters: ['A', 0] }, END], 'then Self Switch A: it starts one battle');
    assert.deepEqual([second.conditions.selfSwitchValid, second.conditions.selfSwitchCh, second.list], [true, 'A', [END]]);
    assert.equal(B.isStarter(made), true);
    // The entry makes it on the clicked tile, and asks nothing.
    assert.match(managerSource, /\{ label: this\._t\('quickEvent\.battleStart'\), action: \(\) => this\.showQuickEventDialog\('battleStart', tileX, tileY\) \}/);
    assert.match(managerSource, /if \(kind === 'battleStart'\) \{\s*const made = typeof window !== 'undefined' \? window\.RRBattleSetup\?\.battleStartEvent\?\.\(this, x, y\) : null;[\s\S]{0,200}?this\.commitQuickEvent\(made\)[\s\S]{0,200}?return;/);
    // With it on the map, "When an event says so" has its event.
    map.events[made.id] = made;
    map.note = B.withTrigger('', 0);
    const report = C.problems(map, lookups());
    assert.deepEqual([report.starts, B.sentenceParts(report).rest], ['event', 'They wait for an event: Battle Start (002).']);
});

//-----------------------------------------------------------------------------
// Where a click lands (SPEC 4.2).

test('a click with a unit in hand stands one on a tile a character can walk onto, as one undo step', () => {
    const map = flat([], {}, [[9, 5]]);
    withCard(map, RAIDER, null, (manager, state) => {
        state.brush.direction = 4;
        assert.equal(B.placeAt(manager, 5, 5), true);
        const made = map.events[1];
        assert.deepEqual([made.name, made.x, made.y, made.rrUnit, made.pages[0].image.direction], ['Bat', 5, 5, RAIDER, 4]);
        assert.equal(manager.saved, 1, 'one undo step');
        assert.equal(manager.selectedEvent, made);
        assert.equal(map.note, '<battle trigger: 6>', 'the first unit writes the start in force');
        assert.deepEqual(manager.forgotten, [['models', 1, null], ['placement', 1, null]], 'what the sidecar kept under a used-again id goes first');
        assert.ok(state.brush, 'still in hand: each click stands one');
        // A second, and the Note is left as it is.
        map.note = 'mine\n<battle trigger: 6>';
        assert.equal(B.placeAt(manager, 6, 5), true);
        assert.deepEqual([map.events[2].x, map.note, manager.saved], [6, 'mine\n<battle trigger: 6>', 2]);
        // A tile nobody can walk onto: the click does nothing, and the reason is kept for the hint line.
        assert.equal(B.placeAt(manager, 9, 5), true, 'the click is taken: the map does not select the tile');
        assert.deepEqual([map.events.filter(Boolean).length, manager.saved, state.verdict.ok, state.verdict.why, state.verdict.whyText], [2, 2, false, 'tile', 'Nobody can walk onto this tile.']);
        // A tile with an event on it is left to the map: the click selects that event.
        assert.equal(B.placeAt(manager, 5, 5), false);
        // Off the map.
        assert.equal(B.judge(manager, 25, 5, null).why, 'offMap');
    });
});

test('nothing in hand, or the card shut: the click is the map\'s', () => {
    const map = flat();
    withCard(map, null, null, manager => {
        assert.equal(B.placeAt(manager, 5, 5), false);
        assert.equal(B.judge(manager, 5, 5, null), null);
    });
    withCard(map, RAIDER, null, (manager, state) => {
        state.open = false;
        assert.equal(B.placeAt(manager, 5, 5), false);
        assert.deepEqual(map.events.filter(Boolean), []);
    });
});

test('R turns what is in hand a quarter at a time; a right-click takes a unit off; a selected unit turns as one undo step', () => {
    assert.deepEqual([2, 4, 8, 6].map(direction => B.turned(direction)), [4, 8, 6, 2]);
    assert.deepEqual([2, 4, 8, 6].map(direction => B.turned(direction, -1)), [6, 2, 4, 8]);
    const map = flat([unit(1, 5, 5), ev(2, 7, 7, { name: 'Door' })]);
    withCard(map, RAIDER, null, (manager, state) => {
        assert.equal(B.turnHand(1), true);
        assert.equal(state.brush.direction, 4);
        assert.equal(B.turnHand(-1), true);
        assert.equal(state.brush.direction, 2);
        // A right-click: units only, and only with something in hand.
        assert.equal(B.removeAt(manager, map.events[2]), false, 'not a unit: the menu opens');
        assert.equal(B.removeAt(manager, map.events[1]), true);
        assert.deepEqual([map.events[1], manager.saved], [null, 1]);
    });
    const again = flat([unit(1, 5, 5)]);
    withCard(again, null, null, manager => {
        assert.equal(B.removeAt(manager, again.events[1]), false, 'nothing in hand: the menu opens');
        manager.selectedEvent = again.events[1];
        again.events[1].pages.push(page());
        assert.equal(B.turnSelected(8), true);
        assert.deepEqual([B.facingOf(again.events[1]), again.events[1].pages[1].image.direction, manager.saved], [8, 8, 1]);
        assert.equal(B.turnSelected(8), true);
        assert.equal(manager.saved, 1, 'already facing that way: no step');
        assert.equal(B.turnSelected(0), true);
        assert.equal(B.facingOf(again.events[1]), 6, 'no direction named: a quarter turn on');
    });
});

test('a click from far off in the 2D view places, and the view comes in on the new unit', () => {
    const view = scale => {
        const moves = [], zooms = [];
        const tilemap = { TILE_WIDTH: 48, TILE_HEIGHT: 48, container: { scale: { x: scale } }, viewportSize: () => ({ width: 800, height: 600 }), minimumZoomScale: () => 0.1,
            setViewportTransform(x, y, zoom) { moves.push([x, y, zoom]); this.container.scale.x = zoom; }, onZoomChange: zoom => zooms.push(zoom) };
        return { tilemap, moves, zooms };
    };
    // A tile 6 pixels wide: placed, and then a tile is 48 pixels with the unit in the middle of the view.
    const far = view(0.13), map = flat();
    withCard(map, RAIDER, null, manager => {
        manager.tilemapManager = far.tilemap;
        assert.equal(B.placeAt(manager, 10, 7), true);
        assert.deepEqual([map.events[1].x, map.events[1].y], [10, 7]);
        assert.deepEqual(far.moves, [[800 / 2 - 10.5 * 48, 600 / 2 - 7.5 * 48, 1]]);
        assert.deepEqual(far.zooms, [1]);
    });
    // At a zoom one can work at the view is left alone: 16 pixels a tile and up.
    const near = view(0.5), again = flat();
    withCard(again, RAIDER, null, manager => {
        manager.tilemapManager = near.tilemap;
        assert.equal(B.placeAt(manager, 10, 7), true);
        assert.deepEqual([near.moves, near.zooms], [[], []]);
    });
    // A refused click from far off moves nothing.
    const refused = view(0.13), walled = flat([], {}, [[10, 7]]);
    withCard(walled, RAIDER, null, manager => {
        manager.tilemapManager = refused.tilemap;
        assert.equal(B.placeAt(manager, 10, 7), true);
        assert.deepEqual([walled.events.filter(Boolean).length, refused.moves], [0, []]);
    });
    // The count button: every unit in view, no larger than the working size.
    const all = view(1), spread = flat([unit(1, 2, 2), unit(2, 18, 12)]);
    withCard(spread, null, null, manager => {
        manager.tilemapManager = all.tilemap;
        assert.equal(B.showAll(manager), true);
        const [x, y, zoom] = all.moves[0];
        assert.equal(zoom, Math.min(48, 800 / 19, 600 / 13) / 48);
        assert.deepEqual([x, y], [400 - 10.5 * 48 * zoom, 300 - 7.5 * 48 * zoom]);
        assert.equal(B.showAll(new Manager(flat())), false, 'no unit: nothing to show');
    });
    // Two units side by side: brought to the working size, not blown up to fill the view.
    const close = view(0.2), pair = flat([unit(1, 5, 5), unit(2, 6, 5)]);
    withCard(pair, null, null, manager => {
        manager.tilemapManager = close.tilemap;
        B.showAll(manager);
        assert.deepEqual(close.moves, [[400 - 6 * 48, 300 - 5.5 * 48, 1]]);
    });
});

test('Pick on the map: one click answers with the tile and the facing, a refused tile does not, Esc gives up', { timeout: 5000 }, async () => {
    const handlers = {}, banners = [];
    const element = () => { const made = { className: '', textContent: '', removed: false, setAttribute() {}, remove() { made.removed = true; }, classList: { toggle() {} } }; banners.push(made); return made; };
    const document = { createElement: element, getElementById: () => null, querySelector: () => null, body: { appendChild() {} }, addEventListener: (name, handler) => { handlers[name] = handler; } };
    const keyDown = key => handlers.keydown({ key, target: {}, shiftKey: false, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
    const map = flat([unit(1, 5, 5)], {}, [[9, 5]]);
    await withCard(map, null, { document }, async (manager, state) => {
        state.open = false;
        state.listening = false;
        try {
            const asked = B.pickTile({ unit: { team: 'enemy', record: 'enemy', id: 2 }, x: null, y: null, direction: 4 });
            assert.equal(banners[0].textContent, 'Click the map to choose the tile for Slime. R turns it, Esc cancels.');
            // The same refusals as placing: nothing is answered, and the banner says why.
            assert.equal(B.placeAt(manager, 9, 5), true);
            assert.equal(banners[0].textContent, 'Nobody can walk onto this tile.');
            assert.equal(state.pick !== null, true);
            // R turns it; the click answers; no event is made.
            keyDown('r');
            assert.equal(B.placeAt(manager, 7, 7), true);
            assert.deepEqual(await asked, { x: 7, y: 7, direction: 8 });
            assert.deepEqual([map.events.filter(Boolean).length, banners[0].removed, state.pick], [1, true, null]);
            // Esc gives up; a second pick ends the first.
            const dropped = B.pickTile({ unit: { team: 'ally', record: 'actor', id: 1 }, x: 3, y: 3, direction: 2 });
            keyDown('Escape');
            assert.equal(await dropped, null);
            const first = B.pickTile({ unit: RAIDER }), second = B.pickTile({ unit: RAIDER });
            assert.equal(await first, null);
            assert.equal(B.placeAt(manager, 6, 6), true);
            assert.deepEqual(await second, { x: 6, y: 6, direction: 2 });
        } finally { state.listening = false; state.pick = null; }
    });
});

test('a body bigger than a tile is judged whole: its tiles are shown, and a place it does not fit is refused by name', () => {
    const spec = { name: 'Vehicles/Tank', ext: '.glb' };
    const world = V.world(), normal = world.Reactor3D.normalizeModelSpec(spec);
    const globals = { Reactor3D: world.Reactor3D, RREventPreviewModels: {}, RRDatabase3DBindings: { get: (home, section, id) => (section === 'enemies' && id === 4 ? spec : null) } };
    const map = flat([unit(1, 12, 5)], {}, [[6, 9]]);
    withCard(map, { team: 'enemy', record: 'enemy', id: 4 }, globals, (manager, state) => {
        manager.projectController = { currentProject: { path: '/project' } };
        // The model's own measure, three tiles wide and two deep round its tile (as the editor reads it once the model is in).
        state.bodies.set(JSON.stringify([normal, 2]), [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]);
        const open = B.judge(manager, 3, 3, null);
        assert.deepEqual([open.ok, open.body.count, open.body.w, open.body.h], [true, 6, 3, 2]);
        const walled = B.judge(manager, 5, 8, null);
        assert.deepEqual([walled.ok, walled.why, walled.whyText], [false, 'fit', 'Tank does not fit here.'], 'a wall under its far corner');
        const crowded = B.judge(manager, 11, 5, null);
        assert.deepEqual([crowded.ok, crowded.why], [false, 'fit'], 'another unit under it');
        assert.equal(B.placeAt(manager, 5, 8), true);
        assert.equal(map.events.filter(Boolean).length, 1, 'refused: nothing placed');
        assert.equal(B.placeAt(manager, 3, 3), true);
        assert.equal(map.events[2].name, 'Tank');
        // The Tank just placed is in the way at once: a tile under its body, beside its own, takes nobody.
        state.brush = Object.assign({ direction: 2 }, RAIDER);
        assert.equal(B.placeAt(manager, 4, 4), true);
        assert.deepEqual([map.events.filter(Boolean).length, state.verdict.ok], [2, false]);
    });
});

test('in the 3D view a click stands the unit on the surface the pointer met, its height kept as the event\'s Z', () => {
    const world = V.world(), R = world.Reactor3D;
    const map = deep();
    withCard(map, RAIDER, { Reactor3D: R, ReactorPhysics: world.ReactorPhysics }, (manager, state) => {
        const editor = { camera: null };
        const where = (x, y, height, level) => B.whereOf(editor, { x, y, height, level }, null);
        // Open ground: its own floor.
        const ground = B.judge(manager, 5, 5, where(5, 5, 0));
        assert.deepEqual([ground.ok, ground.z, ground.height], [true, 0, 0]);
        // A deck two up: the unit stands on the deck, not under it.
        const deck = B.judge(manager, 2, 2, where(2, 2, 2.1));
        assert.deepEqual([deck.ok, deck.z, deck.height], [true, 2.1, 2.1]);
        // The same tile named with no height (a click in the 2D view) is the tile's own floor, under the deck.
        assert.deepEqual((({ ok, why }) => [ok, why])(B.judge(manager, 2, 2, null)), [false, 'low']);
        // What cannot be stood on, each with its reason.
        const refused = (x, y, height, level) => { const verdict = B.judge(manager, x, y, where(x, y, height, level)); return [verdict.ok, verdict.why, verdict.whyText]; };
        assert.deepEqual(refused(6, 2, 2.04), [false, 'roof', 'Nothing can stand on this roof.']);
        assert.deepEqual(refused(10, 6, 5), [false, 'wall', 'Inside a wall.']);
        assert.deepEqual(refused(10, 2, 1), [false, 'taken', 'Something is already here.']);
        // Water: the pointer met its surface; the tile's own floor is its bed, too deep. The preview stays on the surface.
        const lake = B.judge(manager, 1, 11, where(1, 11, 3, 3));
        assert.deepEqual([lake.ok, lake.why, lake.whyText, lake.height], [false, 'water', 'Too deep to stand.', 3]);
        // The click: placed on the deck with its Z, refused on the roof.
        assert.equal(B.placeAt(manager, 2, 2, where(2, 2, 2.1)), true);
        assert.deepEqual([map.events[1].x, map.events[1].y, R.eventZAt(map, 1)], [2, 2, 2.1]);
        assert.equal(B.placeAt(manager, 6, 2, where(6, 2, 2.04)), true);
        assert.equal(map.events.filter(Boolean).length, 1);
        // A unit standing on the deck is not then reported by the checker.
        const report = C.problems(map, lookups({ Reactor3D: R, ReactorPhysics: world.ReactorPhysics }));
        assert.deepEqual(report.lines.filter(line => /noStand|noFit/.test(line.key)), []);
        void state;
    });
});

test('a new plain event opened on a raised surface in the 3D view takes that surface as its Z', () => {
    const world = V.world(), map = deep();
    const live = { canvas: {}, isEnabled: () => true, refreshEvents() { this.redrawn = (this.redrawn || 0) + 1; } };
    withCard(map, null, { Reactor3D: world.Reactor3D, ReactorPhysics: world.ReactorPhysics }, manager => {
        assert.deepEqual([B.liftAt(map, 2, 2, 2.1), B.liftAt(map, 2, 6, 5.1), B.liftAt(map, 5, 5, 0.02), B.liftAt(map, 6, 2, 2.04), B.liftAt(map, 10, 6, 5), B.liftAt(map, 2, 2, NaN)], [2.1, 5.1, 0, 0, 0, 0]);
        manager.projectController = { mapEditor3D: live };
        const editor = manager.eventEditor = { needsInitialCommit: true, currentEvent: { x: 2, y: 2 }, pendingZ: 0, pendingZBaseline: 0 };
        assert.equal(B.standNewEvent(manager, { x: 2, y: 2, height: 2.1 }), 2.1);
        assert.deepEqual([editor.pendingZ, editor.pendingZBaseline], [2.1, 2.1]);
        // Not for an event that is already on the map, another tile, water, or a pick left over from the 3D view while the 2D view is up.
        Object.assign(editor, { pendingZ: 0, pendingZBaseline: 0, needsInitialCommit: false });
        assert.equal(B.standNewEvent(manager, { x: 2, y: 2, height: 2.1 }), 0);
        editor.needsInitialCommit = true;
        assert.equal(B.standNewEvent(manager, { x: 2, y: 6, height: 5.1 }), 0);
        assert.equal(B.standNewEvent(manager, { x: 2, y: 2, height: 3, level: 3 }), 0);
        live.isEnabled = () => false;
        assert.equal(B.standNewEvent(manager, { x: 2, y: 2, height: 2.1 }), 0);
        assert.equal(editor.pendingZ, 0);
        // A Quick Event made at once on the deck is stood there the same way.
        live.isEnabled = () => true;
        const made = ev(7, 2, 6);
        map.events[7] = made;
        assert.equal(B.standEvent(manager, made, { x: 2, y: 6, height: 5.1 }), 5.1);
        assert.equal(world.Reactor3D.eventZAt(map, 7), 5.1);
        assert.equal(B.standEvent(manager, made, { x: 3, y: 6, height: 5.1 }), 0, 'the pick is of another tile');
    });
    // The 3D view hands the height over: tileAt answers with it and keeps its last answer.
    const view = read('src/MapEditor3D.js');
    assert.match(view, /height: Number\.isFinite\(pick\.level\) \? pick\.level : MapEditor3D\.groundAt\(mapData, pick\.px, pick\.pz\) \+ pick\.lift/);
    assert.match(view, /if \(!pick\) \{ this\.lastPick = null; return null; \}\s*return \(this\.lastPick = \{/);
    assert.match(view, /this\.eventManager\(\)\?\.activateEventAt\(tile\.x, tile\.y\) && typeof window !== 'undefined'\) window\.RRBattleSetup\?\.standNewEvent\?\.\(this\.eventManager\(\), tile\)/);
    assert.match(managerSource, /this\.createNewEvent\(tileX, tileY\);[\s\S]{0,200}?const pick = this\.projectController\?\.mapEditor3D\?\.lastPick;\s*if \(pick && pick\.x === tileX && pick\.y === tileY && typeof window !== 'undefined'\) window\.RRBattleSetup\?\.standNewEvent\?\.\(this, pick\);/);
});

//-----------------------------------------------------------------------------
// The one sentence (SPEC 4.2), from the one checker.

test('one sentence says whether Play will start a battle; its count is a part of its own', () => {
    const parts = (map, t) => B.sentenceParts(C.problems(map, lookups()), t);
    assert.deepEqual(parts(flat()), { count: '', rest: 'No enemies yet. Click one above, then click the map.', level: 'ok' });
    assert.deepEqual(parts(flat([unit(1, 5, 5), unit(2, 6, 5), unit(3, 7, 5)])), { count: 'Enemies: 3.', rest: 'Walk within 6 tiles of one and the battle starts.', level: 'ok' });
    assert.deepEqual(parts(flat([unit(1, 5, 5)], { note: '<battle trigger: open>' })), { count: 'Enemies: 1.', rest: 'The battle starts when the party enters this map.', level: 'ok' });
    assert.deepEqual(parts(flat([unit(1, 5, 5), starter(4, 2, 2)])), { count: 'Enemies: 1.', rest: 'They wait for an event: Villager (004).', level: 'ok' });
    assert.deepEqual(parts(flat([unit(1, 5, 5)], { note: '<battle trigger: 0>' })), { count: 'Enemies: 1.', rest: 'No event starts a battle yet: add Start Battle on Map to one.', level: 'warn' });
    // Tag units count.
    assert.equal(parts(flat([unit(1, 5, 5), ev(2, 8, 8, { note: '<unit: enemy 1>' })])).count, 'Enemies: 2.');
    // In a language that ends its sentences another way the count is still cut out whole.
    const t = (key, args) => (key === 'battleCheck.near' ? `敵: ${args.count}。${args.tiles} マス以内に近づくと戦闘が始まります。` : C.say({ key, args }));
    assert.deepEqual(parts(flat([unit(1, 5, 5)]), t), { count: '敵: 1。', rest: '6 マス以内に近づくと戦闘が始まります。', level: 'ok' });
    assert.deepEqual(B.sentenceParts(null), { count: '', rest: '', level: 'ok' });
});

//-----------------------------------------------------------------------------
// Play this battle.

test('Play puts the party where the map\'s own start would begin a battle: comes near', () => {
    const map = flat([unit(1, 10, 7)]), foes = [{ x: 10, y: 7 }];
    // 4 tiles from the nearest enemy, from below, facing it; 2 inside the start distance when that is smaller.
    assert.deepEqual(B.playSpot(map, { enemies: foes }), { x: 10, y: 11, direction: 8 });
    assert.deepEqual(B.playSpot(map, { start: { kind: 'near', tiles: 5 }, enemies: foes }), { x: 10, y: 10, direction: 8 });
    assert.deepEqual(B.playSpot(map, { start: { kind: 'near', tiles: 3 }, enemies: foes }), { x: 10, y: 8, direction: 8 });
    assert.deepEqual(B.playSpot(map, { start: { kind: 'near', tiles: 1 }, enemies: foes }), { x: 10, y: 8, direction: 8 });
    // Never on an event, never off the map, never where nothing stands; in a clear line to the enemy.
    assert.deepEqual(B.playSpot(map, { enemies: foes, taken: (x, y) => x === 10 && y === 11 }), { x: 6, y: 7, direction: 6 });
    assert.deepEqual(B.playSpot(map, { enemies: [{ x: 0, y: 14 }] }), { x: 4, y: 14, direction: 4 });
    const wallsBelow = (x, y) => (y >= 9 && y <= 12 && x >= 8 && x <= 12 ? null : 0);
    assert.deepEqual(B.playSpot(map, { enemies: foes, stand: wallsBelow }), { x: 6, y: 7, direction: 6 });
    // A wall between the place below and the enemy: the party would not see it from there.
    assert.deepEqual(B.playSpot(map, { enemies: foes, stand: (x, y) => (y === 9 && x >= 8 && x <= 12 ? null : 0) }), { x: 6, y: 7, direction: 6 });
    // On the enemy's own level where there is one: a ledge five up below it is passed over.
    assert.deepEqual(B.playSpot(map, { enemies: foes, stand: (x, y) => (y >= 9 ? 5 : 0) }), { x: 6, y: 7, direction: 6 });
    assert.deepEqual(B.playSpot(map, { enemies: [{ x: 11, y: 7 }], stand: (x, y) => (x >= 12 ? 5 : 0) }), { x: 11, y: 11, direction: 8 });
    // The nearest enemy to what the author last worked on.
    assert.deepEqual(B.playSpot(map, { enemies: [{ x: 3, y: 3 }, { x: 16, y: 11 }], near: { x: 17, y: 12 } }), { x: 12, y: 11, direction: 6 });
    // No enemy: nowhere to play a battle from.
    assert.equal(B.playSpot(map, { enemies: [] }), null);
    assert.equal(B.playSpot(null, {}), null);
});

test('Play: the map opens (the game\'s start, else 8 tiles off) and an event says so (2 tiles from the first starter)', () => {
    const map = flat([unit(1, 10, 3)]), foes = [{ x: 10, y: 3 }];
    assert.deepEqual(B.playSpot(map, { start: { kind: 'open' }, enemies: foes, home: { x: 2, y: 3, direction: 6 } }), { x: 2, y: 3, direction: 6 }, 'the game starts on this map: there');
    assert.deepEqual(B.playSpot(map, { start: { kind: 'open' }, enemies: foes, home: { x: 2, y: 3, direction: 0 } }), { x: 2, y: 3, direction: 6 }, 'no facing stored: toward the nearest enemy');
    assert.deepEqual(B.playSpot(map, { start: { kind: 'open' }, enemies: foes }), { x: 10, y: 11, direction: 8 }, '8 tiles from the nearest enemy');
    assert.deepEqual(B.playSpot(map, { start: { kind: 'open' }, enemies: foes, home: { x: 2, y: 3, direction: 6 }, stand: (x, y) => (x === 2 && y === 3 ? null : 0) }), { x: 10, y: 11, direction: 8 }, 'a start nobody can stand on is not used');
    assert.deepEqual(B.playSpot(map, { start: { kind: 'event' }, enemies: foes, starters: [{ x: 4, y: 4 }, { x: 15, y: 10 }] }), { x: 4, y: 6, direction: 8 });
    assert.equal(B.playSpot(map, { start: { kind: 'event' }, enemies: foes }), null, 'no event starts a battle: Play is off, and the sentence says why');
});

test('Play on the open map: by the checker\'s report, on a 2D and a 3D map', () => {
    const play = (map, more) => withCard(map, null, more, manager => B.spotFor(manager, C.problems(map, B.lookupsFor(manager))));
    // 2D: four below the enemy; a wall there, and the party comes from the side.
    assert.deepEqual(play(flat([unit(1, 10, 7)])), { x: 10, y: 11, direction: 8 });
    assert.deepEqual(play(flat([unit(1, 10, 7)], {}, [[10, 9], [10, 10], [10, 11]])), { x: 6, y: 7, direction: 6 });
    assert.equal(play(flat()), null, 'no enemy: Play is off');
    assert.equal(play(flat([unit(1, 10, 7)], { note: '<battle trigger: 0>' })), null, 'nothing starts a battle');
    assert.deepEqual(play(flat([unit(1, 10, 7), starter(4, 3, 3)], { note: '<battle trigger: 0>' })), { x: 3, y: 5, direction: 8 });
    // On a Classic map only rows fight: a tag unit is not what the party is put by.
    assert.equal(play(flat([ev(2, 8, 8, { note: '<unit: enemy 1>' })])), null);
    // 3D: on ground a body can stand on, never in the water south of the enemy.
    const world = V.world(), spot = play(deep([unit(1, 2, 8)]), { Reactor3D: world.Reactor3D, ReactorPhysics: world.ReactorPhysics });
    assert.ok(spot && !(spot.x <= 3 && spot.y >= 10), JSON.stringify(spot));
    assert.equal(Math.round(Math.hypot(spot.x - 2, spot.y - 8)), 4);
    assert.equal(C.standing(deep(), spot.x, spot.y, { any: true }, lookups({ Reactor3D: world.Reactor3D, ReactorPhysics: world.ReactorPhysics })).ok, true);
});

test('the launch line of Play this battle is playat alone; the fight tokens stay for scripts', () => {
    const P = new Function('require', `${read('src/PlaytestManager.js')}\nreturn PlaytestManager;`)(require);
    assert.equal(P.playMode({ mapId: 5, x: 80, y: 60, direction: 4 }), 'test&playat=5,80,60,4');
    assert.equal(P.playMode({ mapId: 5, x: 80.9, y: 60, direction: 5 }), 'test&playat=5,80,60,2', 'a facing the game has not: down');
    assert.equal(P.playMode(null), 'test');
    assert.equal(P.playMode({ mapId: 0, x: 1, y: 1 }), 'test');
    assert.doesNotMatch(P.playMode({ mapId: 5, x: 80, y: 60, direction: 4 }), /fight/, 'the battle is never forced');
    // A project whose game does not read playat yet still gets a battle from the button.
    assert.equal(P.playMode({ mapId: 5, x: 80, y: 60, direction: 4 }, { playat: false }), 'test&fight&fightat=5,80,60');
    assert.equal(P.playMode({ mapId: 5, x: 80, y: 60, direction: 4 }, { playat: false, mode: 'firstPerson' }), 'test&fight&fightat=5,80,60&fightmode=firstPerson');
    assert.equal(P.playMode({ mapId: 5, x: 80, y: 60, direction: 4 }, { playat: false, mode: 'classic' }), 'test&fight&fightat=5,80,60');
    assert.equal(P.fightMode({ mapId: 5, x: 30, y: 12 }), 'test&fight&fightat=5,30,12');
    assert.equal(P.fightMode(null), 'test&fight');
    // On Windows the playtest's profile folder is named by the line's flags alone: every tile played from shares one folder.
    assert.equal(P.profileToken('test&playat=5,80,60,4'), 'test');
    assert.equal(P.profileToken('test&fight&fightat=5,80,60&fightmode=action'), 'test&fight');
    assert.equal(P.profileToken('test&btest'), 'test&btest');
    assert.equal(P.profileToken(undefined), '');
    const made = [], files = { realpathSync: file => file, mkdirSync: folder => { made.push(folder); } };
    const folderOf = mode => P.prototype.resolvePlaytestUserDataDir.call(Object.create(P.prototype), path.win32, files, 'C:\\Games\\Mine',
        { platform: 'win32', env: { LOCALAPPDATA: 'C:\\Local' }, homeDir: 'C:\\Users\\me', nwVersion: '0.107.0', optionToken: mode });
    const plain = folderOf('test');
    assert.match(plain, /\\RPGReactor\\PlaytestProfile\\nwjs-0\.107\.0\\[0-9a-f]{16}&test$/);
    assert.deepEqual([folderOf('test&playat=5,75,59,8'), folderOf('test&playat=5,76,59,8'), folderOf('test&playat=7,1,9,2')], [plain, plain, plain]);
    assert.equal(folderOf('test&btest'), plain + '&btest', 'a second flag still names its own profile');
    assert.equal(made.length, 5, 'each folder asked for is made');
    // The card asks the project's own game file.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-card-'));
    try {
        assert.equal(B.readsPlayAt({ path: home }), true, 'no file to ask: the current game');
        fs.mkdirSync(path.join(home, 'js'));
        fs.writeFileSync(path.join(home, 'js', 'reactor_fight_flow.js'), '// the Test battle boot: fightat=');
        assert.equal(B.readsPlayAt({ path: home }), false);
        fs.writeFileSync(path.join(home, 'js', 'reactor_fight_flow.js'), 'const at = /^playat=(\\d+),(\\d+),(\\d+),(\\d+)$/;');
        assert.equal(B.readsPlayAt({ path: home }), true);
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
    const card = read('src/event/BattleSetup.js');
    assert.match(card, /playtest\.playtestAt\(home\.path, at, \{ playat: readsPlayAt\(home\), mode: report\.mode\.playsAs \}\)/);
    assert.match(card, /const saved = await app\.projectController\.saveAll\(\);\s*if \(!saved\) return false;/, 'saved first');
});

//-----------------------------------------------------------------------------
// One button (SPEC 4.1), and the hooks in the shared files.

test('Battle Setup is a toolbar button after Event mode and a Tools menu entry; the chip and Battle on sight are gone', () => {
    const html = read('index.html');
    assert.match(html, /id="toolbar-event-manager-btn"[^\n]*\n\s*<button class="tool-button" id="toolbar-battle-setup-btn" data-action="battle-setup" title="Battle Setup: put enemies on this map"[^>]*aria-pressed="false"[^>]*data-i18n-title="battleSetup\.button"[^>]*><img src="images\/icon-battle-setup\.svg"/);
    assert.ok(fs.existsSync(path.join(editorRoot, 'images', 'icon-battle-setup.svg')));
    assert.match(html, /<div class="html-menu-option" data-action="battle-setup" data-i18n="battleSetup\.title"[^>]*>Battle Setup<\/div>/);
    const tools = html.slice(html.indexOf('data-menu="tools"'), html.indexOf('data-menu="forge"'));
    assert.ok(tools.includes('data-action="battle-setup"'), 'in the Tools menu');
    assert.doesNotMatch(html, /map-battle-trigger-input|Battle on sight/, 'the card is the one editor of the start');
    for (const file of ['src/EventManager.js', 'src/event/BattleSetup.js', 'css/styles.css']) assert.doesNotMatch(read(file), /rr-battle-setup-chip/, file);
    // The checker and the look rule are loaded before the card that draws with them.
    for (const before of ['src/utils/BattleCheck.js', 'src/utils/FightLook.js']) assert.ok(html.indexOf(before) > 0 && html.indexOf(before) < html.indexOf('src/event/BattleSetup.js'), before);
    // Both the toolbar and the menu end in one toggle, with Event mode switched on by the card itself.
    const ui = read('src/UIManager.js');
    assert.match(ui, /case 'battle-setup':\s*this\.handleToolbarAction\(action\);/);
    assert.match(ui, /case 'battle-setup':\s*if \(!window\.reactor\?\.eventManager\?\.currentMap\) this\.callbacks\.toggleEventMode\?\.\(\);\s*else window\.RRBattleSetup\?\.toggle\(window\.reactor\.eventManager\);/);
    const card = read('src/event/BattleSetup.js');
    assert.match(card, /function open\(manager\) \{[\s\S]{0,400}?if \(!manager\.eventMode\) \{\s*if \(reactor\(\) && reactor\(\)\.toggleEventMode\) reactor\(\)\.toggleEventMode\(\);/);
    assert.match(card, /function toggle\(manager\) \{\s*return state\.open \? !close\(\) : open\(manager\);/);
    assert.match(card, /button\.classList\.toggle\('active', state\.open\);\s*button\.setAttribute\('aria-pressed', String\(state\.open\)\);/);
    // One tool in hand at a time: another tool closes the card; leaving Event mode closes it.
    const main = read('src/main.js');
    assert.match(main, /if \(owner !== 'events'\) window\.RRBattleSetup\?\.close\?\.\(\);/);
    assert.match(main, /window\.RRBattleSetup\?\.syncButton\?\.\(\);/);
    assert.match(card, /if \(!manager\.eventMode \|\| !manager\.currentMap\) \{ close\(\); return; \}/);
    // The right-click entry stays and opens the same card.
    assert.match(managerSource, /\{ label: this\._t\('battleSetup\.title'\), action: \(\) => window\.RRBattleSetup\?\.open\(this\)/);
});

test('the card docks beside the map and redraws the events only', () => {
    const card = read('src/event/BattleSetup.js'), css = read('css/styles.css');
    assert.match(card, /app\.dockMapPanel\(panel\)/);
    assert.match(card, /app\.undockMapPanel\(state\.panel\)/);
    assert.match(css, /#map-side-dock > \.rr-battle-setup \{ flex: 1; width: auto; min-height: 0; \}/);
    // The tiles take what is left and scroll; the middle scrolls by itself in a short window, so the sentence and Play stay in view.
    assert.match(css, /\.rr-battle-setup-body \{ flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; overflow-x: hidden; overflow-y: auto; \}/);
    // The list is as tall as its records, and gives way (scrolling inside itself) when the dock is short: no empty box under a few enemies.
    assert.match(css, /\.rr-battle-setup-part\.is-tiles \{ flex: 0 1 auto; min-height: 96px;/);
    assert.match(css, /\.rr-battle-setup-tiles \{ flex: 0 1 auto; min-height: 0; overflow-y: auto;/);
    assert.match(css, /\.rr-battle-setup-foot \{ flex: 0 0 auto;/);
    assert.match(css, /\.rr-battle-setup-row \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
    assert.match(css, /\.rr-battle-setup-tile > canvas \{ width: 68px; height: 68px;/);
    assert.match(css, /\.rr-battle-setup-grid \{ display: grid; grid-template-columns: 78px minmax\(0, 1fr\);/, 'one label | field grid');
    // What is set for the map (mode, starts) first on one grid, then who is placed, then the one selected; the status and Play below, always in view.
    assert.match(card, /<div class="rr-battle-setup-body rr-accent-scrollbar"><div class="rr-battle-setup-part" data-part="mode"><\/div><div class="rr-battle-setup-part" data-part="start"><\/div>[\s\S]{0,400}?data-part="unit" hidden><\/div><\/div><div class="rr-battle-setup-foot" data-part="foot">/);
    // Play is the theme's primary button.
    assert.match(card, /class="rr-button-primary rr-battle-setup-play"/);
    assert.doesNotMatch(card, /rr-btn-primary/, 'a class the theme does not style');
    const rules = css.split('\n').filter(line => line.startsWith('.rr-battle-setup') && !line.startsWith('.rr-battle-setup-pick'));
    assert.ok(rules.length > 40 && rules.every(line => !/position:\s*(fixed|absolute)/.test(line)), 'it is not a sheet over the map');
    // The units' rings are the map view's to draw: the card has no layer of them.
    assert.doesNotMatch(card, /renderRings|state\.rings|battle setup rings/);
    assert.match(managerSource, /\n    renderUnitRings\(\) \{/);
    // Theme tokens only, in dark and light: no color of the card's own.
    const block = css.slice(css.indexOf('/* Battle Setup (map view): the card docked beside the map.'), css.indexOf('/* Build bar, Terrain:'));
    assert.ok(block.length > 6000 && block.split('\n').filter(line => line.startsWith('.rr-battle-setup')).length === rules.length + 2, 'the card\'s rules are one block');
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    // Another panel of Event mode stands beside the docked card, never over it: the dock is 320 pixels wide.
    assert.match(css, /#map-side-dock \{\s*flex: 0 0 320px;/);
    assert.match(block, /#workspace:has\(#map-side-dock > \.rr-battle-setup\) > \.event-model-panel \{ right: 328px !important; \}/);
    assert.match(read('src/EventModelPanel.js'), /panel\.className = 'event-model-panel';\s*panel\.style\.cssText = \(workspace \? 'position:absolute;top:' \+ top \+ 'px;right:8px;z-index:900;'/, 'the panel the rule moves');
    // Opening, closing and turning a unit never lay the 3D world again.
    assert.doesNotMatch(card, /\.rebuild\(|refreshMap3DView/);
    assert.match(card, /function redrawEvents3D\(manager\) \{\s*const editor = editor3D\(manager\);\s*if \(editor && typeof editor\.refreshEvents === 'function'\) editor\.refreshEvents\(\);/);
    // The editor's own dialogs only.
    assert.doesNotMatch(card, /(^|[^.\w])(alert|confirm|prompt)\(/m);
});

test('both map views hand the pointer to the card first', () => {
    const view = read('src/MapEditor3D.js');
    // 2D: a click, the pointer's tile, a right-click.
    assert.match(managerSource, /window\.RRBattleSetup\?\.placeAt\(this, tileX, tileY\)\) \{\s*this\.resetMapClickTracking\(\);\s*return;/);
    assert.match(managerSource, /window\.RRBattleSetup\.hover2D\(this, inside \? \{ x: tileX, y: tileY \} : null\);/);
    assert.match(managerSource, /this\.hideContextMenu\(\);\s*\/\/[^\n]*\n\s*if \(typeof window !== 'undefined' && window\.RRBattleSetup\?\.removeAt\(this, eventAtPos\)\) return;/);
    assert.match(managerSource, /window\.RRBattleSetup\?\.sync\(this\)/);
    // 3D: the click and the preview are given what the pointer met, so the unit lands where its preview stands.
    assert.match(view, /if \(tile && setup\?\.placeAt\(this\.eventManager\(\), tile\.x, tile\.y, setup\.whereOf\(this, tile, \{ x: clientX, y: clientY \}\)\)\) return;/);
    assert.match(view, /window\.RRBattleSetup\.hover3D\(this, this\.canSelectEvents\(\) \? tile : null, over \? over\.userData\?\.event : null, \{ x: clientX, y: clientY \}\);/);
    assert.match(view, /if \(!tile && typeof window !== 'undefined' && window\.RRBattleSetup\) window\.RRBattleSetup\.hover3D\(this, null\);/);
    const where = B.whereOf({}, { x: 1, y: 2, height: 4.5, level: undefined }, { x: 10, y: 20 });
    assert.deepEqual([where.height, where.level, where.client], [4.5, undefined, { x: 10, y: 20 }]);
    assert.equal(B.whereOf({}, { x: 1, y: 2, height: -11.2, level: -11.2 }, null).height, -11.2);
    assert.equal(B.whereOf(null, { x: 1, y: 2, height: 0 }, null), null);
    // The readout of the pointer's tile starts over when a map opens.
    assert.match(read('src/main.js'), /this\.updateMapInfoBanner\(\);\s*this\.updateMapCoordinates\(null, null\);/);
});

test('a tile\'s picture of a model does not depend on the shared thumbnail renderer', () => {
    const card = read('src/event/BattleSetup.js');
    assert.match(card, /if \(sharedShots\(\)\) \{\s*try \{ shot = await root\.RREventPreviewModels\.thumbnail\(home, spec, editor, 64, facing\); \} catch \(error\) \{ state\.ownShots = true; \}\s*\}\s*if \(!shot && state\.ownShots\) shot = await ownShot\(home, spec, editor, facing\);/);
    assert.match(card, /const side = R\.frameModelSprite\(object, 64, stage\.camera\)\.pixels;/, 'framed as the game frames its sprite');
    assert.match(card, /function close\(\) \{[\s\S]{0,500}?dropStage\(\);/, 'its renderer goes when the card closes');
    // One picture at a time, each after a frame has been drawn: the card is on screen before the first is made.
    assert.match(card, /state\.painting = \(state\.painting \|\| Promise\.resolve\(\)\)\.then\(afterFrame\)\.then\(\(\) => \(button\.isConnected \? artOf\(unit, 2\) : null\)\)/);
    assert.match(card, /const afterFrame = \(\) => new Promise\(resolve => \{\s*if \(typeof requestAnimationFrame !== 'function'\) setTimeout\(resolve, 0\);\s*else requestAnimationFrame\(\(\) => setTimeout\(resolve, 0\)\);/);
});

test('a model\'s picture is drawn once and kept between sessions, until the model changes', { timeout: 5000 }, async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-card-pictures-')), cache = path.join(home, 'cache');
    const folder = path.join(home, '3d', 'Actors', 'Jolt');
    fs.mkdirSync(path.join(folder, 'source'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'source', 'Jolt.glb'), 'glb');
    fs.writeFileSync(path.join(folder, 'model.json'), '{"variants":[]}');
    const spec = { name: 'Actors/Jolt', ext: '.glb', file: 'Jolt', variant: 'Raider' };
    const url = 'data:image/png;base64,' + Buffer.alloc(600, 7).toString('base64');
    const kept = { Database3DEditor: globalThis.Database3DEditor, RREventPreviewModels: globalThis.RREventPreviewModels, RRModelRelease: globalThis.RRModelRelease };
    let drawn = 0;
    globalThis.Database3DEditor = { thumbnailCacheRoot: () => cache };
    globalThis.RREventPreviewModels = { thumbnail: async () => { drawn++; return { url }; }, templateFor: async () => null };
    delete globalThis.RRModelRelease;
    const state = B._state;
    try {
        delete state.ownShots;
        const first = await B.modelShot({ path: home }, spec, null, 2);
        assert.deepEqual([first.url, drawn, fs.readdirSync(cache).length], [url, 1, 1]);
        const again = await B.modelShot({ path: home }, spec, null, 2);
        assert.deepEqual([again.url, again.kept, drawn], [url, true, 1], 'from the disk: nothing is drawn');
        // Another facing and another variant are other pictures.
        await B.modelShot({ path: home }, spec, null, 4);
        await B.modelShot({ path: home }, Object.assign({}, spec, { variant: 'Captain' }), null, 2);
        assert.deepEqual([drawn, fs.readdirSync(cache).length], [3, 3]);
        // The model's sidecar changed (a variant recolored): drawn again.
        fs.writeFileSync(path.join(folder, 'model.json'), '{"variants":[{"name":"Raider"}]}');
        await B.modelShot({ path: home }, spec, null, 2);
        assert.equal(drawn, 4);
        // A model with no file is never kept.
        assert.equal(B.shotFile({ path: home }, { name: 'Actors/Gone', ext: '.glb' }, 2), null);
        // Where the shared renderer cannot run its timer in this window, it is never asked to draw.
        delete state.ownShots;
        globalThis.RRModelRelease = { IdleRenderer: class { use() { throw new TypeError('Illegal invocation'); } } };
        const none = await B.modelShot({ path: home }, Object.assign({}, spec, { variant: 'Other' }), null, 2);
        assert.deepEqual([none, drawn, state.ownShots], [null, 4, true]);
    } finally {
        delete state.ownShots;
        for (const key of Object.keys(kept)) { if (kept[key] === undefined) delete globalThis[key]; else globalThis[key] = kept[key]; }
        fs.rmSync(home, { recursive: true, force: true });
    }
});

//-----------------------------------------------------------------------------
// The card's words.

test('every word of the card is in the editor\'s table, in English and the 17 locales, with its placeholders', () => {
    const source = ['I18nManager.js', 'I18nDeepTranslations.js', 'I18nReviewedTranslations.js'].filter(name => fs.existsSync(path.join(editorRoot, 'src', name))).map(name => read('src/' + name)).join('\n');
    const store = new Map();
    const sandbox = { window: { dispatchEvent() {} }, document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } }, localStorage: { getItem: key => store.get(key) || null, setItem() {} }, CustomEvent: class {} };
    sandbox.window.document = sandbox.document;
    sandbox.window.localStorage = sandbox.localStorage;
    const strings = vm.runInNewContext(source + '\nRR_I18N_STRINGS', sandbox);
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    const keys = Object.keys(B.WORDS).concat('quickEvent.battleStart');
    const holes = text => (String(text).match(/\{\w+\}/g) || []).sort().join(' ');
    for (const key of Object.keys(B.WORDS)) assert.equal(strings.en[key], B.WORDS[key], key);
    assert.equal(strings.en['quickEvent.battleStart'], 'Battle start');
    for (const locale of locales) for (const key of keys) {
        const told = strings[locale] && strings[locale][key];
        assert.ok(typeof told === 'string' && told.trim(), `${locale}: ${key}`);
        assert.equal(holes(told), holes(strings.en[key]), `${locale}: ${key} keeps its placeholders`);
    }
    // An open card says everything again when the editor's language changes.
    assert.match(read('src/event/BattleSetup.js'), /window\.addEventListener\('rr-language-changed', \(\) => \{ if \(!state\.open\) return; state\.tilesKey = ''; state\.verdict = null; retitle\(\); render\(\); \}\);/);
    // The hint line always says the next step, and names what is in hand.
    assert.equal(B.say('hint.pick'), 'Click an enemy, then click the map.');
    assert.equal(B.say('hint.place', { name: 'Raider' }), 'Click the map to place Raider. R turns it, right-click removes one, Esc stops.');
    assert.equal(B.say('starts.near', { tiles: 6 }), 'When the party comes near (6)');
});
