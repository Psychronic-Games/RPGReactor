'use strict';
// The battle checker (src/utils/BattleCheck.js) and the two tools built on it
// (build-scripts/validate-battle.cjs, place-unit.cjs): what a map's battle is,
// each thing that can be wrong with it, the sentences Battle Setup shows, and
// units placed by script. The 3D checks ask the game's own world and physics.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const C = require('../src/utils/BattleCheck.js');
const B = require('../src/event/BattleSetup.js');
const V = require('../build-scripts/validate-battle.cjs');
const Placer = require('../build-scripts/place-unit.cjs');

//-----------------------------------------------------------------------------
// A small Database and maps.

const actors = [null, { id: 1, name: 'Ren', characterName: 'Actor1', characterIndex: 0 }, { id: 2, name: 'Mira', characterName: '', characterIndex: 0 }];
const enemies = [null,
    { id: 1, name: 'Raider', battlerName: 'Raider', note: '' },
    { id: 2, name: 'Slime', battlerName: '', note: '' },
    { id: 3, name: 'Wolf', battlerName: '', note: '<unit character: Monster, 3>' },
    { id: 4, name: 'Tank', battlerName: 'Tank', note: '' }];
const system = { partyMembers: [1], optSideView: false };
// Tile 1 is open ground, tile 2 a wall nobody walks onto, tile 0 no tile.
const tilesets = [null, { id: 1, flags: [0x10, 0, 0x0f] }];
const L = more => Object.assign({ system, actors, enemies, tilesets }, more);

const END = { code: 0, indent: 0, parameters: [] };
const page = (more = {}) => Object.assign({
    conditions: {}, image: { tileId: 0, characterName: '', characterIndex: 0, direction: 2, pattern: 1 },
    priorityType: 1, through: false, trigger: 0, moveType: 0, list: [END]
}, more);
const ev = (id, x, y, more = {}) => Object.assign({ id, name: 'EV' + String(id).padStart(3, '0'), note: '', x, y, pages: [page()] }, more);
const unit = (id, x, y, team = 'enemy', record = 'enemy', recordId = 1, more = {}) => ev(id, x, y, Object.assign({ name: 'Raider', rrUnit: { team, record, id: recordId } }, more));
const command = (name, args = {}) => ({ code: 357, indent: 0, parameters: ['RPGReactor', name, name, args] });
const comment = text => ({ code: 108, indent: 0, parameters: [text] });
const starter = (id, x, y, args = {}, pageMore = {}) => ev(id, x, y, { name: 'Villager', pages: [page(Object.assign({ list: [command('StartMapBattle', args), END] }, pageMore))] });

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
 * A 3D map, 14 by 14, of level ground with: a slab two tiles up over (2, 2);
 * a slab laid at a steep tilt on (6, 2); a fence on (10, 2); an upper floor
 * five up over (2, 6); water three deep over (0..3, 10..13) and a wade over
 * (6..9, 10..13).
 */
function deep(events = [], side = {}) {
    const list = [null], data = new Array(14 * 14 * 6).fill(0);
    for (const event of events) list[event.id] = event;
    for (let i = 0; i < 14 * 14; i++) data[i] = 1;
    return {
        id: 2, width: 14, height: 14, tilesetId: 1, note: '<3d>', data, events: list,
        reactor3d: Object.assign({
            version: 1, mode: '3d', width: 14, height: 14, elevation: new Array(196).fill(0),
            pieces: [piece('floor', 2, 2, 2), piece('box', 6, 2, 0, { size: [1, 0.25, 4], tilt: 60 }), piece('fence', 10, 2, 0), piece('floor', 2, 6, 5)],
            water: [{ x0: 0, y0: 10, x1: 3, y1: 13, level: 3 }, { x0: 6, y0: 10, x1: 9, y1: 13, level: 0.3 }]
        }, side)
    };
}
/** The lookups with the game's 3D world and physics, as the tools load them. */
const L3 = more => { const loaded = V.world(); return L(Object.assign({ Reactor3D: loaded.Reactor3D, ReactorPhysics: loaded.ReactorPhysics }, more)); };
const keys = report => report.lines.map(line => line.key.replace('battleCheck.', ''));
const lineOf = (report, key) => report.lines.find(line => line.key === 'battleCheck.' + key);

//-----------------------------------------------------------------------------
// Readers.

test('an event is a unit by its row, a note tag, a page comment or a PTBS comment, as the game reads it', () => {
    const { fightWorld } = require('./helpers/fight-world.cjs');
    const F = fightWorld().ReactorFight;
    const cases = [
        [unit(1, 1, 1), 'row', 0], [unit(2, 1, 1, 'ally', 'actor', 3, { rrUnit: { team: 'ally', record: 'actor', id: 3, move: 6 } }), 'row', 0],
        [ev(3, 1, 1, { rrUnit: { team: 'neutral', record: '', id: 0 } }), 'row', 0],
        [ev(4, 1, 1, { rrUnit: { team: 'enemy' } }), null, 0], [ev(5, 1, 1, { rrUnit: { team: 'boss', record: 'enemy', id: 1 } }), null, 0],
        [ev(6, 1, 1, { note: '<unit: enemy 5>' }), 'note', 0], [ev(7, 1, 1, { note: 'a door\n<Unit: ally 2 move 3>' }), 'note', 0],
        [ev(8, 1, 1, { note: '<unit: neutral>' }), 'note', 0], [ev(9, 1, 1, { note: '<unit: ally enemy 4>' }), 'note', 0], [ev(10, 1, 1, { note: '<unit: enemy>' }), null, 0],
        [ev(11, 1, 1, { pages: [page(), page({ list: [comment('<unit: enemy 7 move 5>'), END] })] }), 'comment', 2],
        [ev(12, 1, 1, { pages: [page({ list: [comment('PTBS_Enemy: 3'), END] })] }), 'ptbs', 1],
        [ev(13, 1, 1, { pages: [page({ list: [comment('PTBS_PartyActor: 2'), END] })] }), 'ptbs', 1],
        [ev(14, 1, 1), null, 0]
    ];
    for (const [event, source, pageNumber] of cases) {
        const mine = C.unitOf(event);
        const list = pageNumber ? event.pages[pageNumber - 1].list : event.pages[0].list;
        const theirs = F.unitSpecOf(event, list);
        assert.equal(!!mine, !!theirs, `event ${event.id}: a unit for the checker exactly when it is one for the game`);
        assert.equal(!!mine, !!source, `event ${event.id}`);
        if (!mine) continue;
        assert.deepEqual([mine.team, mine.record, mine.id], [theirs.team, theirs.record, theirs.id], `event ${event.id}`);
        assert.equal(mine.move, theirs.ownMove ? theirs.move : 0, `event ${event.id}: its own Move`);
        assert.deepEqual([mine.source, mine.page], [source, pageNumber], `event ${event.id}: what makes it a unit`);
        // Battle Setup counts the same rows and note tags.
        if (source === 'row' || source === 'note') {
            const card = B.unitOf(event);
            assert.deepEqual([card.team, card.record, card.id], [mine.team, mine.record, mine.id], `event ${event.id}: Battle Setup reads it the same`);
        }
    }
    assert.equal(C.rowProblem(cases[3][0]), true, 'a row with a side and no record is a row the game cannot read');
    assert.equal(C.rowProblem(cases[4][0]), true);
    assert.equal(C.rowProblem(cases[0][0]), false);
    // Comes back is the row's, for the Enemy side only.
    assert.equal(C.unitOf(ev(1, 0, 0, { rrUnit: { team: 'enemy', record: 'enemy', id: 1, returns: true } })).returns, true);
    assert.equal(C.unitOf(ev(1, 0, 0, { rrUnit: { team: 'ally', record: 'actor', id: 1, returns: true } })).returns, false);
});

test('the mode in force and where it is set: the map\'s tag in any letter case, its sidecar, the game, Classic', () => {
    const tactical = { reactorBattle: { mode: 'tactical' } };
    const mode = (map, lookups) => { const m = C.modeOf(map, lookups); return [m.mode, m.from]; };
    assert.deepEqual(mode({ note: '' }, {}), ['classic', 'default'], 'nothing names one');
    assert.deepEqual(mode({ note: '' }, { system: tactical }), ['tactical', 'game']);
    assert.deepEqual(mode({ note: 'x\n<battle mode: action>' }, { system: tactical }), ['action', 'map'], 'the map over the game');
    assert.deepEqual(mode({ note: '<battle mode: classic>' }, { system: tactical }), ['classic', 'map'], 'a named classic counts');
    assert.deepEqual(mode({ note: '<Battle Mode: FIRSTPERSON>' }, {}), ['firstPerson', 'map'], 'any letter case');
    assert.deepEqual(mode({ note: '<battlemode:firstperson>' }, {}), ['firstPerson', 'map']);
    assert.deepEqual(mode({ note: '', reactor3d: { battle: { mode: 'action' } } }, { system: tactical }), ['action', 'map'], 'the sidecar where the Note has no tag');
    assert.deepEqual(mode({ note: '<battle mode: tactical>', reactor3d: { battle: { mode: 'action' } } }, {}), ['tactical', 'map'], 'the Note over the sidecar');
    // First Person is Action on a 2D map.
    assert.equal(C.modeOf({ note: '<battle mode: firstPerson>' }, {}).playsAs, 'action');
    assert.equal(C.modeOf({ note: '<3d>\n<battle mode: firstPerson>' }, {}).playsAs, 'firstPerson');
    // A tag the game cannot read: the game's mode is in force, and the report says so.
    const bad = C.modeOf({ note: '<battle mode: tactics>' }, { system: tactical });
    assert.deepEqual([bad.mode, bad.from, bad.unreadable], ['tactical', 'game', 'tactics']);
    const report = C.problems(flat([unit(1, 5, 5)], { note: '<battle mode: tactics>' }), L());
    assert.equal(lineOf(report, 'badMode').text, 'The battle mode tag says "tactics": the game reads classic, tactical, action or firstPerson.');
    assert.deepEqual([lineOf(report, 'badMode').level, report.ok], ['fix', false]);
});

test('when the map starts its battle: no tag is 6, a map with a Start Battle on Map event waits, 0, open, a distance', () => {
    const start = map => { const s = C.startOf(map); return [s.kind, s.tiles, s.from]; };
    assert.deepEqual(start({ note: '' }), ['near', 6, 'default'], 'no tag: 6 tiles');
    assert.deepEqual(start(flat([starter(4, 2, 2)])), ['event', 6, 'events'], 'no tag, and an event has Start Battle on Map: the map waits for it');
    assert.deepEqual(start({ note: '<battle trigger: 4>' }), ['near', 4, 'tag']);
    assert.deepEqual(start({ note: '<Battle Trigger: 50>' }), ['near', 50, 'tag']);
    assert.deepEqual(start({ note: '<battle trigger: open>' }), ['open', 6, 'tag']);
    assert.deepEqual(start({ note: '<battle trigger: 0>' }), ['event', 6, 'tag'], 'never by itself');
    assert.deepEqual(start(flat([starter(4, 2, 2)], { note: '<battle trigger: 5>' })), ['near', 5, 'tag'], 'a tag wins over the events');
    assert.deepEqual(start({ note: '', reactor3d: { battle: { trigger: 9 } } }), ['near', 9, 'sidecar'], 'the sidecar where the Note has no tag');
    assert.deepEqual(start({ note: '<battle trigger: 3>', reactor3d: { battle: { trigger: 9 } } }), ['near', 3, 'tag']);
    assert.deepEqual(C.startOf(flat([starter(4, 2, 2), starter(2, 3, 3)])).starters.map(s => s.eventId), [2, 4], 'the events that start one, in id order');
    assert.equal(C.startOf({ note: '<battle lose: continue>' }).lose, 'continue');
    assert.equal(C.startOf({ note: '' }).lose, 'gameover');
    // What the game cannot read is said, and the map falls back to having no tag.
    for (const text of ['soon', '51', '-2', '6 tiles']) {
        const read = C.startOf({ note: `<battle trigger: ${text}>` });
        assert.deepEqual([read.kind, read.tiles, read.unreadable], ['near', 6, text]);
    }
    const report = C.problems(flat([unit(1, 5, 5)], { note: '<battle trigger: soon>' }), L());
    assert.equal(lineOf(report, 'badTrigger').text, 'The battle trigger tag says "soon": the game reads a number of tiles from 1 to 50, open or 0.');
    assert.equal(report.ok, false);
});

test('the tag writer and the reader agree on every value, 0 included', () => {
    let note = 'first line\n<3d>';
    for (const value of [6, 1, 50, 'open', 0]) {
        note = C.withTag(note, 'trigger', value);
        const read = C.startOf({ note });
        assert.equal(read.from, 'tag', String(value));
        assert.equal(read.kind === 'near' ? read.tiles : read.kind === 'open' ? 'open' : 0, value);
        assert.equal((note.match(/<battle trigger/g) || []).length, 1, 'one tag, replaced in place');
    }
    assert.ok(note.startsWith('first line\n<3d>'), 'every other line is kept');
    for (const mode of C.MODES) assert.equal(C.modeOf({ note: C.withTag(note, 'mode', mode) }).mode, mode);
    const both = C.withTag(note, 'mode', 'action');
    assert.equal(C.withTag(C.withTag(both, 'mode', null), 'trigger', null), 'first line\n<3d>', 'taking a tag out takes its line with it');
    assert.equal(C.withTag('', 'trigger', 0), '<battle trigger: 0>');
});

//-----------------------------------------------------------------------------
// The report: one case per thing it says.

test('the units by side, tag units included and named as what they are', () => {
    const map = flat([
        unit(1, 3, 3), unit(2, 4, 3, 'ally', 'actor', 1, { name: 'Ren' }), ev(3, 5, 3, { name: 'Onlooker', rrUnit: { team: 'neutral', record: 'enemy', id: 1 } }),
        ev(4, 6, 3, { name: 'Tagged', note: '<unit: enemy 1>' }),
        ev(5, 7, 3, { name: 'Conscript', pages: [page(), page({ list: [comment('<unit: enemy 1 move 5>'), END] })] }),
        ev(6, 8, 3, { name: 'Old', pages: [page({ list: [comment('PTBS_Enemy: 1'), END] })] }), ev(7, 9, 3, { name: 'Door' })
    ]);
    const report = C.problems(map, L());
    assert.deepEqual(report.units.map(u => [u.eventId, u.name, u.x, u.y, u.team, u.record, u.id, u.recordName, u.source, u.page]), [
        [1, 'Raider', 3, 3, 'enemy', 'enemy', 1, 'Raider', 'row', 0], [2, 'Ren', 4, 3, 'ally', 'actor', 1, 'Ren', 'row', 0],
        [3, 'Onlooker', 5, 3, 'neutral', 'enemy', 1, 'Raider', 'row', 0], [4, 'Tagged', 6, 3, 'enemy', 'enemy', 1, 'Raider', 'note', 0],
        [5, 'Conscript', 7, 3, 'enemy', 'enemy', 1, 'Raider', 'comment', 2], [6, 'Old', 8, 3, 'enemy', 'enemy', 1, 'Raider', 'ptbs', 1]
    ]);
    assert.deepEqual(report.count, { enemy: 4, ally: 1, neutral: 1 }, 'tag units count');
    assert.deepEqual(report.rows, { enemy: 1, ally: 1, neutral: 1 });
    assert.equal(report.units[4].move, 5);
    assert.deepEqual([report.mode.mode, report.mode.from, report.start.kind, report.ok], ['classic', 'default', 'near', true]);
    // The tool prints each as what it is.
    const text = V.print(report).map(line => line.text).join('\n');
    assert.match(text, /Battle mode: Classic/);
    assert.match(text, /Units: enemies 4 \(1 placed as rows, 3 tag units\), allies 1, bystanders 1/);
    assert.match(text, /005 Conscript at \(7, 3\): enemy, enemy 1 Raider, from a comment on page 2/);
    assert.match(text, /004 Tagged at \(6, 3\): enemy, enemy 1 Raider, from a note tag/);
    assert.match(text, /006 Old at \(8, 3\): enemy, enemy 1 Raider, from a PTBS comment on page 1/);
    assert.match(text, /003 Onlooker at \(5, 3\): bystander, enemy 1 Raider, from row/);
});

test('a record that does not exist, and a row the game cannot read', () => {
    const map = flat([unit(12, 3, 3, 'enemy', 'enemy', 99), unit(13, 4, 3, 'ally', 'actor', 42, { name: 'Ghost' }), ev(14, 5, 3, { name: 'Broken', rrUnit: { team: 'enemy', id: 6 } }), unit(15, 6, 3)]);
    const report = C.problems(map, L());
    assert.deepEqual(keys(report), ['noEnemyRecord', 'noActorRecord', 'badRow']);
    assert.equal(lineOf(report, 'noEnemyRecord').text, 'Raider (012) is enemy 99, which is not in the Database.');
    assert.equal(lineOf(report, 'noActorRecord').text, 'Ghost (013) is actor 42, which is not in the Database.');
    assert.equal(lineOf(report, 'badRow').text, 'Broken (014) has an In battle row the game cannot read.');
    assert.ok(report.lines.every(line => line.level === 'fix' && line.fix.kind === 'show'));
    assert.equal(report.ok, false);
    assert.equal(report.count.enemy, 2, 'the row that names a missing record is still a unit; the unreadable row is none');
    // Without the Database lists nothing is said about records, nor about their pictures.
    assert.deepEqual(keys(C.problems(flat([unit(12, 3, 3, 'enemy', 'enemy', 99)]), { system, tilesets })), []);
});

test('a unit always has a look; one with none stands as a plain figure and the report says so', () => {
    const look = (event, lookups, map) => C.lookOf(map || flat([event]), event, C.unitOf(event), L(lookups));
    // The order: its own picture or model, the model the Database binds, a character graphic, the battler picture, a plain figure.
    assert.equal(look(unit(1, 1, 1, 'enemy', 'enemy', 2, { pages: [page({ image: { characterName: 'Monster', characterIndex: 0, tileId: 0, direction: 2 } })] })), 'own');
    assert.equal(look(unit(1, 1, 1, 'enemy', 'enemy', 2), {}, flat([], { reactor3d: { events: { 1: { 0: { name: 'Actors/Raider' } } } } })), 'own', 'its own model');
    assert.equal(look(unit(1, 1, 1, 'enemy', 'enemy', 2), { bindings: { enemies: { 2: { name: 'Actors/Slime' } } } }), 'model');
    assert.equal(look(unit(1, 1, 1, 'ally', 'actor', 2), { bindings: { actors: { 2: { character: { name: 'Actors/Mira' } } } } }), 'model', 'an actor\'s character slot');
    assert.equal(look(unit(1, 1, 1, 'ally', 'actor', 1)), 'character');
    assert.equal(look(unit(1, 1, 1, 'enemy', 'enemy', 3)), 'character', 'an enemy\'s <unit character: ...>');
    assert.equal(look(unit(1, 1, 1)), 'battler');
    assert.equal(look(unit(1, 1, 1, 'enemy', 'enemy', 2)), 'figure');
    assert.equal(look(unit(1, 1, 1, 'ally', 'actor', 2)), 'figure');
    assert.equal(look(ev(1, 1, 1, { rrUnit: { team: 'neutral', record: '', id: 0 } })), 'figure');
    // A comment unit shows the page that fights.
    const conscript = ev(5, 1, 1, { pages: [page({ image: { characterName: 'People', tileId: 0 } }), page({ list: [comment('<unit: enemy 2>'), END] })] });
    assert.equal(look(conscript), 'figure');
    // A battler picture that is named and missing is no look; a side-view game looks in its own folder.
    const asked = [];
    assert.equal(look(unit(1, 1, 1), { exists: file => { asked.push(file); return false; } }), 'figure');
    assert.equal(look(unit(1, 1, 1), { system: { partyMembers: [1], optSideView: true }, exists: file => { asked.push(file); return true; } }), 'battler');
    assert.deepEqual(asked, ['img/enemies/Raider.png', 'img/sv_enemies/Raider.png']);
    // The caller's own look rule wins where it has one.
    assert.equal(look(unit(1, 1, 1), { lookOf: () => ({ kind: 'figure' }) }), 'figure');

    // One unit of several has none: one line, about its record, with where to give it a picture.
    const some = C.problems(flat([unit(1, 3, 3), unit(2, 5, 3, 'enemy', 'enemy', 2, { name: 'Blob' }), unit(3, 7, 3, 'enemy', 'enemy', 2, { name: 'Blob' })]), L());
    assert.deepEqual(keys(some), ['noPicture'], 'said once for the record, however many stand here');
    assert.equal(some.lines[0].text, 'Slime has no picture: it stands as a plain figure.');
    assert.deepEqual([some.lines[0].level, some.lines[0].fix.kind, some.lines[0].fix.page, some.lines[0].fix.id, some.lines[0].fix.label], ['fix', 'picture', 'enemies', 2, 'Give it one']);
    assert.deepEqual(some.units.map(u => u.look), ['battler', 'figure', 'figure']);
    // No enemy has a look: every record is named.
    const none = C.problems(flat([unit(1, 3, 3, 'enemy', 'enemy', 2), unit(2, 5, 3, 'enemy', 'enemy', 4)]), L({ exists: () => false }));
    assert.deepEqual(none.lines.map(line => line.text), ['Slime has no picture: it stands as a plain figure.', 'Tank has no picture: it stands as a plain figure.']);
    assert.equal(none.ok, false);
});

test('a 2D map: a unit off the map, on another event, or on a tile nobody can walk onto stands where nothing can stand', () => {
    const map = flat([unit(12, 3, 3), unit(13, 25, 3), unit(14, 6, 6), ev(15, 6, 6, { name: 'Chest' }), unit(16, 9, 9), unit(17, 12, 12)], {}, [[9, 9]]);
    map.data[12 * 20 + 12] = 0;
    const report = C.problems(map, L());
    assert.deepEqual(report.lines.map(line => [line.eventId, line.key, line.why]), [
        [13, 'battleCheck.noStand', 'offMap'], [14, 'battleCheck.noStand', 'taken'], [16, 'battleCheck.noStand', 'tile'], [17, 'battleCheck.noStand', 'tile']
    ]);
    assert.equal(lineOf(report, 'noStand').text, 'Raider (013) stands where nothing can stand.');
    assert.deepEqual(report.lines.map(line => line.whyText), ['Off the map.', 'Something is already here.', 'Nobody can walk onto this tile.', 'Nobody can walk onto this tile.']);
    assert.ok(report.lines.every(line => line.level === 'fix' && line.fix.kind === 'show' && line.fix.label === 'Show'));
    assert.equal(report.ok, false);
    // The same answer for one tile, as Battle Setup asks it while placing.
    assert.deepEqual([C.standing(map, 3, 4, {}, L()).ok, C.standing(map, 9, 9, { eventId: 16 }, L()).why, C.standing(map, 3, 3, {}, L()).why, C.standing(map, 3, 3, { eventId: 12 }, L()).ok, C.standing(map, -1, 0, {}, L()).why],
        [true, 'tile', 'taken', true, 'offMap']);
    // A tile under a star tile takes the tile below; without the tileset nothing is said, and the report names the check it left out.
    const starred = flat([unit(1, 2, 2)]);
    starred.data[20 * 15 + 2 * 20 + 2] = 3;
    assert.equal(C.problems(starred, L({ tilesets: [null, { id: 1, flags: [0x10, 0, 0x0f, 0x10] }] })).ok, true);
    const blind = C.problems(flat([unit(16, 9, 9)], {}, [[9, 9]]), { system, actors, enemies });
    assert.deepEqual([keys(blind), blind.skipped], [[], ['stand']]);
    // One event a tile, as the editor keeps it: a unit on the tile of an event that is in nobody's way (a floor switch) is on another event.
    const plate = ev(2, 5, 5, { name: 'Trap', pages: [page({ priorityType: 0, trigger: 1 })] });
    assert.deepEqual(C.problems(flat([unit(1, 5, 5), plate]), L()).lines.map(line => [line.eventId, line.why]), [[1, 'taken']]);
    assert.deepEqual([C.standing(flat([plate]), 5, 5, {}, L()).why, C.standing(flat([plate]), 6, 5, {}, L()).ok], ['taken', true]);
});

test('a 3D map with a room and nothing painted: the room\'s floor is stood on', () => {
    const lookups = L3();
    const bare = side => { const map = deep([unit(1, 5, 5), unit(2, 8, 8)], side); map.data.fill(0); return map; };
    assert.deepEqual(C.problems(bare({ room: { floor: 'Deck', wall: 'Hull', height: 5 } }), lookups).lines, []);
    // Without a room, a tile with nothing painted is one nobody can walk onto, as on a 2D map.
    assert.deepEqual(C.problems(bare({}), lookups).lines.map(line => [line.eventId, line.why]), [[1, 'tile'], [2, 'tile']]);
    // A tile painted solid is not the room's floor.
    const walled = bare({ room: { floor: 'Deck' } });
    walled.data[5 * 14 + 5] = 2;
    assert.deepEqual(C.problems(walled, lookups).lines.map(line => [line.eventId, line.why]), [[1, 'tile']]);
});

test('a 3D map: under a ceiling too low, in deep water, on a steep roof, on a fence; the game\'s own physics decides', () => {
    const lookups = L3();
    assert.ok(lookups.Reactor3D && lookups.ReactorPhysics, 'the tools load the game\'s 3D world and physics');
    const lifted = (id, x, y, z) => [unit(id, x, y), z];
    const placed = [lifted(1, 5, 5, 0), lifted(2, 2, 2, 0), lifted(3, 1, 11, 0), lifted(4, 6, 2, 0), lifted(5, 10, 2, 0), lifted(6, 7, 11, 0), lifted(7, 2, 6, 0), lifted(8, 3, 6, 5.1), lifted(9, 8, 8, 5), lifted(10, 2, 3, 2.1)];
    const map = deep(placed.map(([event]) => event));
    map.events.splice(8, 0);
    map.reactor3d.eventZ = Object.fromEntries(placed.filter(([, z]) => z > 0).map(([event, z]) => [String(event.id), z]));
    // Event 8 stands on the upper floor's own tile (2, 6) by its Z; event 10 beside the slab at its height, in the air.
    map.events[8].x = 2; map.events[8].y = 6; map.events[7].x = 12; map.events[7].y = 6;
    const report = C.problems(map, lookups);
    assert.equal(report.is3D, true);
    assert.deepEqual(report.skipped, []);
    assert.deepEqual(report.lines.filter(line => line.level === 'fix').map(line => [line.eventId, line.key.replace('battleCheck.', ''), line.why, line.whyText]), [
        [2, 'noStand', 'low', 'Not enough room to stand up.'], [3, 'noStand', 'water', 'Too deep to stand.'], [4, 'noStand', 'roof', 'Nothing can stand on this roof.'],
        [5, 'noStand', 'taken', 'Something is already here.'], [9, 'noStand', 'nothing', 'Nothing to stand on here.'], [10, 'noStand', 'nothing', 'Nothing to stand on here.']
    ], 'on level ground, in a wade and on the upper floor a unit stands');
    assert.equal(report.ok, false);
    // One tile, as Battle Setup asks it: the tile's own floor, a place near a height, the nearest place to a height, the event's own Z.
    const at = (x, y, options) => { const s = C.standing(deep(), x, y, options, lookups); return s.ok ? Math.round(s.height * 100) / 100 : s.why; };
    assert.deepEqual([at(5, 5, { any: true }), at(2, 6, { any: true }), at(2, 6, { height: 5 }), at(2, 6, { lift: 5.1 }), at(1, 11, { any: true }), at(7, 11, { any: true })],
        [0, 0, 5.1, 5.1, 'water', 0]);
    // With no height named a unit goes on the tile's own floor, never up onto what hangs over it: under the slab over (2, 2) no body has room.
    assert.deepEqual([at(2, 2, { any: true }), at(2, 2, { lift: 0 }), at(2, 2, { height: 2 }), at(2, 2, { height: 1.2, within: Infinity })], ['low', 'low', 2.1, 2.1]);
    assert.deepEqual([at(2, 6, { height: 3 }), at(2, 6, { height: 3, within: Infinity }), at(2, 6, { height: 2, within: Infinity })], ['nothing', 5.1, 0], 'a step from the height asked, or the nearest place to it');
    // The tool says where and why.
    const text = V.print(report).filter(line => line.mark === 'FIX').map(line => line.text);
    assert.equal(text[0], 'Raider (002) stands where nothing can stand. Not enough room to stand up. (2, 2)');
    // Without the game's physics a 3D map's units are not judged, and the report says which check was left out.
    const blind = C.problems(map, L({ Reactor3D: null, ReactorPhysics: {} }));
    assert.deepEqual([keys(blind).filter(key => key === 'noStand'), blind.skipped], [[], ['stand']]);
});

/**
 * A 3D map, 14 by 14, of level ground with a house's pieces: a wall under a
 * roof's ramp (3, 3), a bare wall (5, 3), a wall with the roof four tiles
 * over its top (7, 3), a wall with a deck laid on it (9, 3), a block
 * (11, 3), an eave over the street (3, 7), a ramp on the ground (5, 7), a
 * window under a roof (7, 7), a stall's counter under its awning (9, 7), two
 * storeys of wall under a flat roof (11, 7), a doorway with its door (3, 11),
 * a tower's body eleven tiles tall (13, 3), a paving slab (13, 7), the second
 * step of a stair (11, 11) and of a ramp (9, 11).
 */
function house(events = [], side = {}) {
    const map = deep(events, side);
    map.reactor3d.water = [];
    map.reactor3d.pieces = [
        piece('floor', 3, 3, 0), piece('wall', 3, 3, 0), piece('ramp', 3, 3, 5),
        piece('floor', 5, 3, 0), piece('wall', 5, 3, 0),
        piece('floor', 7, 3, 0), piece('wall', 7, 3, 0), piece('ramp', 7, 3, 9),
        piece('floor', 9, 3, 0), piece('wall', 9, 3, 0), piece('floor', 9, 3, 5),
        piece('block', 11, 3, 0),
        piece('floor', 3, 7, 0), piece('ramp', 3, 7, 9),
        piece('ramp', 5, 7, 0),
        piece('floor', 7, 7, 0), piece('window', 7, 7, 0), piece('glass', 7, 7, 0), piece('ramp', 7, 7, 5),
        piece('floor', 9, 7, 0), piece('box', 9, 7, 0, { size: [1, 1.25, 1] }), piece('box', 9, 7, 3.25, { size: [1, 0.3, 1] }),
        piece('floor', 11, 7, 0), piece('wall', 11, 7, 0), piece('floor', 11, 7, 5), piece('wall', 11, 7, 5), piece('box', 11, 7, 10, { size: [1, 0.25, 1] }),
        piece('floor', 3, 11, 0), piece('doorway', 3, 11, 0), piece('door', 3, 11, 0),
        piece('box', 13, 3, 0, { size: [1, 11, 1] }), piece('box', 13, 7, 0, { size: [1, 0.22, 1] }),
        piece('stair', 11, 11, 1), piece('ramp', 9, 11, 1)
    ];
    return map;
}

test('a 3D map: a tile of a house\'s wall is in a wall, whatever is built over it; a roof\'s slope is a roof', () => {
    const lookups = L3();
    const at = (x, y, options) => { const s = C.standing(house(), x, y, options, lookups); return s.ok ? Math.round(s.height * 100) / 100 : s.why; };
    // A unit put on the tile with no height named: the tile's own floor, which a wall's tile has none of.
    assert.deepEqual([[3, 3], [5, 3], [7, 3], [9, 3], [3, 7], [5, 7], [7, 7], [9, 7], [11, 7], [3, 11], [1, 1]].map(([x, y]) => at(x, y, { any: true })),
        ['wall', 'wall', 'wall', 'wall', 0.1, 0.5, 'wall', 'low', 'wall', 0.1, 0],
        'under an eave, on a ramp laid on the ground and in a doorway a unit stands; under an awning it has no room');
    // Nor is it put up on a thing that stands on the floor: a block is in the way, a tower's body is a wall; paving is the floor.
    assert.deepEqual([at(11, 3, { any: true }), at(13, 3, { any: true }), at(13, 7, { any: true })], ['taken', 'wall', 0.22]);
    assert.deepEqual([at(11, 11, { any: true }), at(9, 11, { any: true })], [1.5, 1.5], 'a stair and a ramp are floors, however high their steps');
    assert.deepEqual([C.standing(house(), 11, 3, { any: true }, lookups).whyText, at(11, 3, { height: 1 }), at(11, 3, { lift: 0 }), at(13, 3, { height: 11 }), at(13, 3, { lift: 0 })],
        ['Something is already here.', 1, 1, 11, 11], 'its top is stood on when its height is named, and by a unit that stands there already');
    // A unit that stands there already (its Z over the tile's floor): on a deck or a flat roof laid over a wall it stands; on a
    // wall's own top, or on a roof's slope over one, it is in the wall.
    assert.deepEqual([[3, 3], [5, 3], [7, 3], [9, 3], [7, 7], [11, 7]].map(([x, y]) => at(x, y, { lift: 0 })), ['wall', 'wall', 'wall', 5.1, 'wall', 10.25]);
    assert.equal(at(7, 3, { lift: 4.5 }), 'roof', 'lifted to the roof that hangs four tiles over the wall\'s top: on the roof, not in the wall');
    assert.deepEqual([at(5, 3, { lift: 4 }), at(9, 7, { lift: 6 })], ['nothing', 'nothing'], 'in the air over a wall or a stall there is nothing to stand on: what lies far under it is not asked about');
    // A height pointed at (a click on a surface, --z): the face of a wall, the roof's slope, a wall's top, a deck, an awning.
    assert.deepEqual([at(5, 3, { height: 2.3 }), at(9, 3, { height: 2.3 }), at(3, 3, { height: 5.5 }), at(7, 3, { height: 9.5 }), at(3, 7, { height: 9.5 }), at(5, 3, { height: 5 }),
        at(9, 3, { height: 5 }), at(11, 7, { height: 10 }), at(9, 7, { height: 3.5 }), at(7, 3, { height: 4, within: Infinity }), at(9, 3, { height: 1, within: Infinity })],
    ['wall', 'wall', 'roof', 'roof', 'roof', 'wall', 5.1, 10.25, 3.55, 'wall', 5.1]);
    assert.equal(C.standing(house(), 3, 3, { height: 5.5 }, lookups).whyText, 'Nothing can stand on this roof.');
    assert.equal(C.standing(house(), 5, 3, { any: true }, lookups).whyText, 'Inside a wall.');
    // The report: the game stands a unit on a wall's tile on top of the wall or on the roof over it, and the checker says so.
    const map = house([unit(1, 3, 3), unit(2, 7, 3), unit(3, 7, 7), unit(4, 9, 3), unit(5, 9, 7), unit(6, 3, 11), unit(7, 5, 7), unit(8, 3, 7)]);
    map.reactor3d.eventZ = { 8: 9.4 };
    const report = C.problems(map, lookups);
    assert.deepEqual(report.lines.map(line => [line.eventId, line.why, line.whyText]), [
        [1, 'wall', 'Inside a wall.'], [2, 'wall', 'Inside a wall.'], [3, 'wall', 'Inside a wall.'], [5, 'low', 'Not enough room to stand up.'], [8, 'roof', 'Nothing can stand on this roof.']
    ]);
    assert.match(V.print(report).map(line => line.text).join('\n'), /Raider \(002\) stands where nothing can stand\. Inside a wall\. \(7, 3\)/);
    // Placing by script refuses the same tiles, and stands a unit on the deck when its height is named.
    const context = { BattleCheck: C, BattleSetup: B, lookups };
    const refusedAt = (spot, z) => Placer.place(house(), { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [spot], z }, context).refused.map(entry => entry.text);
    assert.deepEqual([refusedAt({ x: 3, y: 3 }), refusedAt({ x: 7, y: 3 }), refusedAt({ x: 9, y: 3 }), refusedAt({ x: 9, y: 7 }), refusedAt({ x: 3, y: 3 }, 6)],
        [['Inside a wall.'], ['Inside a wall.'], ['Inside a wall.'], ['Not enough room to stand up.'], ['Nothing can stand on this roof.']]);
    const deck = house(), onDeck = Placer.place(deck, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 9, y: 3 }], z: 5 }, context);
    assert.deepEqual([onDeck.placed[0].height, onDeck.placed[0].lift, deck.reactor3d.eventZ, C.problems(deck, lookups).ok], [5.1, 0, undefined, true], 'the deck is that tile\'s floor: no Z is kept');
});

test('a big unit that does not fit: a typed size, a measured body, against a wall, the map\'s edge and another unit', () => {
    // 2D: three by three round (5, 5) meets the wall tile at (6, 6).
    const walled = flat([unit(25, 5, 5, 'enemy', 'enemy', 4, { name: 'Tank' })], { reactor3d: { eventSize: { 25: [3, 3] }, eventSizeAnchor: 'center' } }, [[6, 6]]);
    const report = C.problems(walled, L());
    assert.deepEqual(keys(report), ['noFit']);
    assert.equal(report.lines[0].text, 'Tank (025) does not fit where it stands.');
    assert.deepEqual([report.lines[0].level, report.lines[0].why, report.lines[0].whyText, report.lines[0].fix.kind], ['fix', 'fit', 'Tank does not fit here.', 'show']);
    assert.deepEqual(report.units[0].body, { ox: -1, oy: -1, w: 3, h: 3, count: 9 });
    // Its own tile in the wall is the other sentence, said once.
    assert.deepEqual(keys(C.problems(flat([unit(25, 6, 6, 'enemy', 'enemy', 4)], { reactor3d: walled.reactor3d }, [[6, 6]]), L())), ['noStand']);
    // In the open it fits; counted from its own tile right and down on a map that is not marked centered.
    assert.equal(C.problems(flat([unit(25, 5, 5, 'enemy', 'enemy', 4)], { reactor3d: { eventSize: { 25: [3, 3] }, eventSizeAnchor: 'center' } }), L()).ok, true);
    assert.deepEqual(C.bodyOf({ reactor3d: { eventSize: { 25: [3, 2] } } }, { id: 25 }, null), { ox: 0, oy: 0, w: 3, h: 2, cells: null, count: 6 });
    // Over the map's edge, and over another unit (who then stands in it).
    assert.deepEqual(keys(C.problems(flat([unit(25, 0, 5, 'enemy', 'enemy', 4)], { reactor3d: { eventSize: { 25: [3, 3] }, eventSizeAnchor: 'center' } }), L())), ['noFit']);
    const crowd = C.problems(flat([unit(25, 5, 5, 'enemy', 'enemy', 4, { name: 'Tank' }), unit(26, 6, 5)], { reactor3d: { eventSize: { 25: [3, 3] }, eventSizeAnchor: 'center' } }), L());
    assert.deepEqual(crowd.lines.map(line => [line.eventId, line.key.replace('battleCheck.', ''), line.why]), [[26, 'noStand', 'taken'], [25, 'noFit', 'fit']]);
    // An event that is in nobody's way (below characters) is not in its way either.
    const trigger = ev(26, 6, 5, { pages: [page({ priorityType: 0, trigger: 1 })] });
    assert.equal(C.problems(flat([unit(25, 5, 5, 'enemy', 'enemy', 4), trigger], { reactor3d: { eventSize: { 25: [3, 3] }, eventSizeAnchor: 'center' } }), L()).ok, true);
    // A body measured from its model (what the tools and the editor pass in): tiles round its own, or the game's shape.
    const body = () => [[0, 0], [1, 0], [2, 0], [0, 1]];
    const measured = C.problems(flat([unit(25, 4, 6, 'enemy', 'enemy', 4)], {}, [[6, 6]]), L({ body }));
    assert.deepEqual([keys(measured), measured.units[0].body], [['noFit'], { ox: 0, oy: 0, w: 3, h: 2, count: 4 }]);
    assert.equal(C.problems(flat([unit(25, 4, 6, 'enemy', 'enemy', 4)], {}, [[6, 7]]), L({ body })).ok, true, 'a tile its shape leaves open is not asked about');
    assert.deepEqual(C.toShape({ ox: -1, oy: 0, w: 2, h: 1, cells: null }), { ox: -1, oy: 0, w: 2, h: 1, cells: null, count: 2 });
    // The size the editor measured for a model event is used where nothing better is given; a typed size wins over both.
    const auto = { reactor3d: { eventSizeAuto: { 25: [2, 1, -1, 0] } } };
    assert.deepEqual(C.problems(flat([unit(25, 7, 6, 'enemy', 'enemy', 4)], auto, [[6, 6]]), L()).units[0].body, { ox: -1, oy: 0, w: 2, h: 1, count: 2 });
    assert.deepEqual(keys(C.problems(flat([unit(25, 7, 6, 'enemy', 'enemy', 4)], auto, [[6, 6]]), L())), ['noFit']);
    // 3D: three by three round (3, 3) reaches under the slab over (2, 2), where no body has room.
    const lookups = L3();
    const sized = side => deep([unit(25, 3, 3, 'enemy', 'enemy', 4, { name: 'Tank' })], side);
    assert.deepEqual(keys(C.problems(sized({ eventSize: { 25: [3, 3] }, eventSizeAnchor: 'center' }), lookups)), ['noFit']);
    assert.equal(C.problems(sized({}), lookups).ok, true);
    const open = deep([unit(25, 8, 7, 'enemy', 'enemy', 4)], { eventSize: { 25: [3, 3] }, eventSizeAnchor: 'center' });
    assert.equal(C.problems(open, lookups).ok, true, 'on open level ground all nine tiles are stood on');
});

test('a tile under a tree or another placed model is taken, as far up as a body reaches', () => {
    // The caller's own measure of the map's models: the tiles they stand in the way on.
    const props = () => [[6, 6, 0], [7, 6, 0], [9, 9, 4]];
    const map = flat([unit(12, 6, 6), unit(13, 9, 9), unit(14, 3, 3)]);
    const report = C.problems(map, L({ props }));
    assert.deepEqual(report.lines.map(line => [line.eventId, line.key, line.why, line.whyText]), [[12, 'battleCheck.noStand', 'taken', 'Something is already here.']],
        'under the tree; a lantern four tiles up is over a unit\'s head');
    assert.deepEqual([C.standing(map, 7, 6, {}, L({ props })).why, C.standing(map, 8, 6, {}, L({ props })).ok], ['taken', true]);
    // A big unit does not fit with a tile of its body under one.
    const big = flat([unit(25, 4, 6, 'enemy', 'enemy', 4)], { reactor3d: { eventSize: { 25: [3, 3] }, eventSizeAnchor: 'center' } });
    assert.deepEqual(keys(C.problems(big, L({ props: () => [[5, 7, 0]] }))), ['noFit']);
    // Without a measure, each solid model stands on its own tile; one that is walked through is in nobody's way.
    const sidecar = { reactor3d: { props: [{ id: 1, name: 'Map-Objects/Tree-01', x: 5.6, y: 5.4, z: 0, passable: false }, { id: 2, name: 'Map-Objects/Rug', x: 8, y: 8, z: 0, passable: true }] } };
    const plain = C.problems(flat([unit(12, 6, 5), unit(13, 8, 8), unit(14, 5, 5)], sidecar), L());
    assert.deepEqual(plain.lines.map(line => [line.eventId, line.why]), [[12, 'taken']]);
    // On a 3D map a model on the ground is not in the way of a unit a floor above it, and is of one beside it.
    const lookups = L3({ props: () => [[2, 6, 0], [5, 5, 0]] });
    const upstairs = deep([unit(1, 2, 6), unit(2, 5, 5), unit(3, 7, 7)]);
    upstairs.reactor3d.eventZ = { 1: 5.1 };
    assert.deepEqual(C.problems(upstairs, lookups).lines.map(line => [line.eventId, line.why]), [[2, 'taken']]);
    // The tools measure a project's placed models with the game's own rule; a model with no file to read keeps its own tile.
    const measured = V.models(path.join(os.tmpdir(), 'rr-no-such-project'), V.world());
    const blocked = measured.props(deep([], { props: [{ id: 1, name: 'Map-Objects/Crate', ext: '.glb', file: 'Crate', x: 4.4, y: 7.6, z: 0, size: 2, scale: 1, passable: false }, { id: 2, name: 'Map-Objects/Rug', x: 8, y: 8, passable: true }] }));
    assert.deepEqual(blocked, [[4, 8, 0]]);
});

/** A model file with a hollow middle: the four walls of a square two units across, one high, and nothing inside. */
function hollowGlb() {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]], positions = [];
    for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
        positions.push(ax, 0, az, bx, 0, bz, bx, 1, bz, ax, 0, az, bx, 1, bz, ax, 1, az);
    }
    const bin = Buffer.from(new Float32Array(positions).buffer);
    const json = Buffer.from(JSON.stringify({
        asset: { version: '2.0' }, buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
        accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-1, 0, -1], max: [1, 1, 1] }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ name: 'trunk', mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
    }));
    const pad = (buffer, fill) => Buffer.concat([buffer, Buffer.alloc((4 - buffer.length % 4) % 4, fill)]);
    const a = pad(json, 0x20), b = pad(bin, 0), head = Buffer.alloc(12), headA = Buffer.alloc(8), headB = Buffer.alloc(8);
    head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + a.length + 8 + b.length, 8);
    headA.writeUInt32LE(a.length, 0); headA.writeUInt32LE(0x4E4F534A, 4); headB.writeUInt32LE(b.length, 0); headB.writeUInt32LE(0x004E4942, 4);
    return Buffer.concat([head, headA, a, headB, b]);
}

test('a model with a hollow middle: the tile it stands on and the tiles it closes in are taken, as the tiles its mesh covers are', t => {
    // One model's tiles: what was measured, the tile it stands on, and what no walker can reach inside it.
    const ring = [[4, 4], [5, 4], [6, 4], [4, 5], [6, 5], [4, 6], [5, 6], [6, 6]];
    const sorted = tiles => tiles.map(tile => tile.join(',')).sort();
    assert.deepEqual(sorted(C.modelTiles(ring, 5.2, 4.6)), sorted(ring.concat([[5, 5]])), 'the middle of a ring');
    assert.deepEqual(sorted(C.modelTiles(ring.map(([x, y]) => ({ x, y })))), sorted(ring.concat([[5, 5]])), 'closed in, whether it is the model\'s own tile or not');
    assert.deepEqual(sorted(C.modelTiles([[4, 4], [6, 4], [4, 5], [6, 5], [4, 6], [5, 6], [6, 6]], 5, 5)), sorted([[4, 4], [6, 4], [4, 5], [6, 5], [4, 6], [5, 6], [6, 6], [5, 5]]),
        'a tile a walker reaches through a gap is not closed in: (5, 4) stays open');
    assert.deepEqual(C.modelTiles([], 3.5, 2.4), [[4, 2]], 'a model nothing was measured of stands on its own tile');
    assert.deepEqual(C.modelTiles([[2, 2], [2, 2]]), [[2, 2]]);
    // The tile a model stands on is taken even where the caller's measure leaves it open.
    const tree = { id: 6, name: 'Map-Objects/Tree-01', x: 5, y: 5.39, z: 0, passable: false };
    const open = flat([unit(12, 5, 5), unit(13, 9, 9)], { reactor3d: { props: [tree] } });
    assert.deepEqual(C.problems(open, L({ props: () => ring.map(([x, y]) => [x, y, 0]) })).lines.map(line => [line.eventId, line.why]), [[12, 'taken']]);

    // The tools: a model file whose mesh is four walls round an empty middle, placed four tiles across.
    const loaded = V.world(), R = loaded.Reactor3D;
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-hollow-'));
    t.after(() => fs.rmSync(project, { recursive: true, force: true }));
    const prop = { id: 1, name: 'Props/Trunk', ext: '.glb', file: 'Trunk', x: 6, y: 6, z: 0, size: 4, scale: 1, passable: false };
    const file = path.join(project, ...R.modelUrl(prop.name, prop.ext, prop.file).split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, hollowGlb());
    const map = flat([unit(1, 6, 6), unit(2, 7, 5), unit(3, 4, 6), unit(4, 10, 10)], { reactor3d: { props: [prop] } });
    const measure = V.models(project, loaded), tiles = measure.props(map);
    const rows = [];
    for (let y = 3; y <= 9; y++) { let row = ''; for (let x = 3; x <= 9; x++) row += tiles.some(tile => tile[0] === x && tile[1] === y) ? '#' : '.'; rows.push(row); }
    assert.deepEqual(rows, ['.......', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '.......'], 'the whole of it, inside and out');
    // The game's own body for it is the ring alone: its walls, with the middle nine tiles open.
    const parts = fs.readFileSync(file), jsonLength = parts.readUInt32LE(12), json = JSON.parse(parts.subarray(20, 20 + jsonLength).toString());
    const bin = new Uint8Array(parts.subarray(28 + jsonLength, 28 + jsonLength + parts.readUInt32LE(20 + jsonLength)));
    const spec = R.normalizeModelSpec(R.propModelSpec(R.mapProps(map)[0]));
    assert.equal(R.blockedTilesFor(R.buildGlbTemplate(json, bin, '', null), json, spec, 2, 6, 6).length, 16);
    const report = C.problems(map, V.lookups(project, { system, actors, enemies, tilesets }, loaded, map, measure));
    assert.deepEqual(report.lines.filter(line => line.key === 'battleCheck.noStand').map(line => [line.eventId, line.why]), [[1, 'taken'], [2, 'taken'], [3, 'taken']],
        'on the model\'s own tile, inside it and under its wall; a unit beside it stands');
});

test('a start that can never fire: no event starts the battle; a Start Battle on Map with no enemy and no troop', () => {
    // Starts is "When an event says so" and no event has Start Battle on Map.
    const waiting = C.problems(flat([unit(1, 3, 3), unit(2, 4, 3), unit(3, 5, 3)], { note: '<battle trigger: 0>' }), L());
    assert.equal(waiting.sentence.text, 'Enemies: 3. No event starts a battle yet: add Start Battle on Map to one.');
    assert.deepEqual([waiting.sentence.level, waiting.starts, waiting.ok], ['warn', '', false]);
    assert.equal(V.print(waiting).find(line => line.mark === 'FIX').text, waiting.sentence.text);
    // A command that would take no enemy: none on the map.
    const empty = C.problems(flat([starter(4, 8, 8)]), L());
    assert.deepEqual(keys(empty), ['emptyStart']);
    assert.equal(empty.lines[0].text, 'Villager (004) starts a battle no enemy would be in. Place some with Battle Setup, or pick a troop.');
    assert.deepEqual([empty.lines[0].level, empty.lines[0].eventId, empty.ok], ['fix', 4, false]);
    // A troop, or a goal that may start empty: it can have one.
    for (const args of [{ troopId: 3 }, { objective: 'survive', turnsToSurvive: 5 }]) assert.equal(C.problems(flat([starter(4, 8, 8, args)]), L()).ok, true, JSON.stringify(args));
    // The troop must be one the Database has, with an enemy in it.
    const troops = [null, { id: 1, name: 'Empty', members: [] }, { id: 2, name: 'Bats', members: [{ enemyId: 1, x: 0, y: 0, hidden: false }] }];
    assert.deepEqual([1, 2, 3].map(troopId => keys(C.problems(flat([starter(4, 8, 8, { troopId })]), L({ troops })))), [['emptyStart'], [], ['emptyStart']]);
    // The event's own Spawn Unit, or its own Change Unit Side that makes an enemy, brings one; another event's does not.
    const spawn = command('SpawnUnit', { record: 'enemy', id: 1, team: 'enemy', at: 'cell', x: 3, y: 3 });
    const spawner = ev(5, 2, 2, { name: 'Elsewhere', pages: [page({ list: [spawn, END] })] });
    assert.deepEqual(keys(C.problems(flat([starter(4, 8, 8), spawner]), L())), ['emptyStart'], 'a Spawn Unit on another event does not fill this battle');
    const ownSpawn = ev(4, 8, 8, { name: 'Villager', pages: [page({ list: [spawn, command('StartMapBattle'), END] })] });
    assert.equal(C.problems(flat([ownSpawn]), L()).ok, true);
    assert.deepEqual(keys(C.problems(flat([ev(4, 8, 8, { name: 'Villager', pages: [page({ list: [command('SpawnUnit', { record: 'actor', id: 1 }), command('StartMapBattle'), END] })] })]), L())), ['emptyStart'], 'a spawned ally is no enemy');
    const bystander = ev(5, 2, 2, { rrUnit: { team: 'neutral', record: 'enemy', id: 1 } });
    const turner = ev(4, 8, 8, { name: 'Villager', pages: [page({ list: [command('ChangeUnitSide', { eventId: 5, team: 'enemy' }), command('StartMapBattle'), END] })] });
    assert.equal(C.problems(flat([turner, bystander]), L()).ok, true);
    const turncoat = ev(5, 2, 2, { rrUnit: { team: 'neutral', record: 'enemy', id: 1 }, pages: [page({ list: [command('ChangeUnitSide', { eventId: 0, team: 'enemy' }), END] })] });
    assert.deepEqual(keys(C.problems(flat([starter(4, 8, 8), turncoat]), L())), ['emptyStart']);
    assert.deepEqual(keys(C.problems(flat([starter(4, 8, 8), unit(5, 2, 2, 'ally', 'actor', 1)]), L())), ['emptyStart'], 'allies are no enemy');
    // On a map that fights on the map: "every unit on this map" (a command with no `who`) takes an enemy anywhere; "the units
    // near the party" only one near the event the party touches.
    const far = unit(1, 18, 13), onMap = { note: '<battle mode: tactical>' };
    assert.equal(C.problems(flat([starter(4, 2, 2), far], onMap), L()).ok, true);
    assert.equal(C.problems(flat([starter(4, 2, 2, { who: 'map' }), far], onMap), L()).ok, true);
    assert.deepEqual(keys(C.problems(flat([starter(4, 2, 2, { who: 'near' }), far], onMap), L())), ['emptyStart']);
    assert.equal(C.problems(flat([starter(4, 2, 2, { who: 'near' }), unit(1, 8, 4)], onMap), L()).ok, true, 'within 6 of where the party stands');
    assert.equal(C.problems(flat([starter(4, 2, 2, { who: 'near' }), unit(1, 12, 2)], { note: '<battle mode: tactical>\n<battle trigger: 9>' }), L()).ok, true, 'the map\'s own distance');
    assert.equal(C.problems(flat([starter(4, 2, 2, { who: 'near' }, { trigger: 3 }), far], onMap), L()).ok, true, 'an autorun runs wherever the party is');
    assert.equal(C.problems(flat([starter(4, 2, 2, { who: 'near' }, { moveType: 1 }), far], onMap), L()).ok, true, 'and so does an event that walks');
    // On a Classic map "This map's mode" is the battle screen against the enemy rows near the party; a named mode takes
    // every unit, tag units too.
    const tagged = ev(1, 3, 3, { name: 'Tagged', note: '<unit: enemy 1>' });
    assert.equal(C.problems(flat([starter(4, 2, 2), unit(1, 5, 3)]), L()).ok, true);
    assert.deepEqual(keys(C.problems(flat([starter(4, 2, 2), far]), L())), ['emptyStart'], 'a row out of the party\'s reach');
    assert.deepEqual(keys(C.problems(flat([starter(4, 2, 2), tagged]), L())), ['emptyStart']);
    assert.equal(C.problems(flat([starter(4, 2, 2, { mode: 'tactical' }), tagged]), L()).ok, true);
    assert.equal(C.problems(flat([starter(4, 2, 2, { mode: 'tactical' }), far]), L()).ok, true);
    assert.equal(C.problems(flat([starter(4, 2, 2), tagged]), L({ system: { partyMembers: [1], reactorBattle: { mode: 'action' } } })).ok, true);
    // One line an event, however many commands it has.
    const twice = ev(4, 8, 8, { name: 'Villager', pages: [page({ list: [command('StartMapBattle'), command('StartMapBattle'), END] }), page({ list: [command('StartMapBattle'), END] })] });
    assert.equal(C.problems(flat([twice]), L()).lines.length, 1);
});

test('enemies behind a switch: they are not on the map until it is on, and a start that neither turns it on nor waits for it takes none of them', () => {
    const gate = { switch1Valid: true, switch1Id: 1 };
    const gated = (id, x, y, conditions = gate) => unit(id, x, y, 'enemy', 'enemy', 1, { pages: [page({ conditions })] });
    const raid = [gated(16, 3, 3), gated(17, 4, 3), gated(18, 5, 3)], onMap = { note: '<battle mode: tactical>\n<battle trigger: 0>' };
    const switchOn = { code: 121, indent: 0, parameters: [1, 1, 0] };
    // The Demo's shape: a Villager whose command finds nobody, and a captain who turns the raid's switch on before she starts it.
    const villager = starter(4, 8, 8, { who: 'map' });
    const rhea = ev(12, 9, 9, { name: 'Rhea Voss', pages: [page({ list: [switchOn, command('StartMapBattle', { who: 'map' }), END] })] });
    const report = C.problems(flat([villager, rhea].concat(raid), onMap), L());
    assert.deepEqual(report.units.map(entry => entry.waits), [true, true, true]);
    assert.deepEqual(report.lines.map(line => [line.key.replace('battleCheck.', ''), line.level, line.eventId || 0, line.text]), [
        ['emptyStart', 'fix', 4, 'Villager (004) starts a battle no enemy would be in. Place some with Battle Setup, or pick a troop.'],
        ['waiting', 'note', 0, 'Enemies that stand here only when their page\'s conditions are met: 3.']
    ]);
    assert.equal(report.sentence.text, 'Enemies: 3. They wait for an event: Rhea Voss (012).', 'the event named is one whose battle an enemy would be in, not the first by number');
    assert.match(V.print(report).map(line => line.text).join('\n'), /016 Raider at \(3, 3\): enemy, enemy 1 Raider, from row, waits for a page condition/);
    // Alone, the Villager is still the event the sentence names, with its line under it.
    const alone = C.problems(flat([villager].concat(raid), onMap), L());
    assert.deepEqual([alone.sentence.text, keys(alone)], ['Enemies: 3. They wait for an event: Villager (004).', ['emptyStart', 'waiting']]);
    // A start whose own page shows on the same switch, or sets the variable they wait for, meets them.
    const later = ev(4, 8, 8, { name: 'Villager', pages: [page(), page({ conditions: gate, list: [command('StartMapBattle'), END] })] });
    assert.deepEqual(keys(C.problems(flat([later].concat(raid), onMap), L())), ['waiting']);
    const counted = { variableValid: true, variableId: 7, variableValue: 2 };
    const setter = ev(4, 8, 8, { name: 'Villager', pages: [page({ list: [{ code: 122, indent: 0, parameters: [7, 7, 0, 0, 2] }, command('StartMapBattle'), END] })] });
    assert.deepEqual(keys(C.problems(flat([setter, gated(16, 3, 3, counted)], onMap), L())), ['waiting']);
    assert.deepEqual(keys(C.problems(flat([villager, gated(16, 3, 3, counted)], onMap), L())), ['emptyStart', 'waiting']);
    // Turning the switch off, or another switch on, does not.
    const wrong = parameters => ev(4, 8, 8, { name: 'Villager', pages: [page({ list: [{ code: 121, indent: 0, parameters }, command('StartMapBattle'), END] })] });
    assert.deepEqual([[1, 1, 1], [2, 5, 0]].map(parameters => keys(C.problems(flat([wrong(parameters)].concat(raid), onMap), L()))), [['emptyStart', 'waiting'], ['emptyStart', 'waiting']]);
    assert.deepEqual(keys(C.problems(flat([wrong([1, 3, 0])].concat(raid), onMap), L())), ['waiting'], 'a range that holds it does');
    // A condition the map's data cannot follow (a self switch, an item, an actor) is taken as met; one unit that
    // stands there from the start is enough; a unit with a page that needs nothing never waits.
    const selfGated = gated(16, 3, 3, { selfSwitchValid: true, selfSwitchCh: 'A' });
    assert.deepEqual(keys(C.problems(flat([villager, selfGated], onMap), L())), ['waiting']);
    assert.deepEqual(keys(C.problems(flat([villager, unit(19, 6, 3)].concat(raid), onMap), L())), ['waiting']);
    const twoPages = unit(16, 3, 3, 'enemy', 'enemy', 1, { pages: [page(), page({ conditions: gate })] });
    assert.deepEqual([C.problems(flat([villager, twoPages], onMap), L()).units[0].waits, keys(C.problems(flat([villager, twoPages], onMap), L()))], [false, []]);
    // A comment unit waits when the page that names it does.
    const conscript = ev(16, 3, 3, { name: 'Conscript', pages: [page(), page({ conditions: gate, list: [comment('<unit: enemy 1>'), END] })] });
    assert.deepEqual([C.problems(flat([villager, conscript], onMap), L()).units[0].waits, keys(C.problems(flat([villager, conscript], onMap), L()))], [true, ['emptyStart', 'waiting']]);
    // With the map's own start they are counted and noted; nothing else is said.
    const near = C.problems(flat(raid), L());
    assert.deepEqual([near.sentence.text, keys(near), near.ok], ['Enemies: 3. Walk within 6 tiles of one and the battle starts.', ['waiting'], true]);
});

test('more than 8 enemy rows within one start distance on a Classic map is a note, not an error', () => {
    const rowOf = (count, x0, y) => Array.from({ length: count }, (unused, i) => unit(i + 1, x0 + i, y));
    const nine = C.problems(flat(rowOf(9, 2, 3)), L());
    assert.deepEqual(keys(nine), ['classicCap']);
    assert.equal(nine.lines[0].text, 'A Classic battle takes the 8 nearest.');
    assert.deepEqual([nine.lines[0].level, nine.ok], ['note', true]);
    assert.equal(V.print(nine).find(line => line.text === 'A Classic battle takes the 8 nearest.').mark, 'note');
    assert.deepEqual(keys(C.problems(flat(rowOf(8, 2, 3)), L())), [], 'eight is what a troop shows');
    // Nine on the map but never nine within one start distance; and all of them when the map opens.
    const spread = flat(rowOf(5, 1, 1).concat(rowOf(4, 15, 13).map((event, i) => Object.assign(event, { id: 6 + i }))), { note: '<battle trigger: 4>' });
    assert.deepEqual(keys(C.problems(spread, L())), []);
    assert.deepEqual(keys(C.problems(Object.assign(spread, { note: '<battle trigger: open>' }), L())), ['classicCap']);
    // The distance is counted from where the party can stand, not from an enemy: nine on a ring five tiles round (9, 7) are
    // all within six of its middle, though no one of them has the other eight that near.
    const ring = Array.from({ length: 9 }, (unused, i) => unit(i + 1, Math.round(9 + 5 * Math.cos(i * 2 * Math.PI / 9)), Math.round(7 + 5 * Math.sin(i * 2 * Math.PI / 9))));
    assert.ok(ring.every(one => ring.filter(other => Math.hypot(one.x - other.x, one.y - other.y) <= 6).length <= 8), 'no enemy has all nine within its own distance');
    assert.deepEqual(keys(C.problems(flat(ring), L())), ['classicCap']);
    assert.deepEqual(keys(C.problems(flat(ring, { note: '<battle trigger: 4>' }), L())), [], 'at four tiles no spot has nine in reach');
    // On a map that fights on the map every one of them fights; tag units take no part in a Classic battle.
    assert.deepEqual(keys(C.problems(flat(rowOf(9, 2, 3), { note: '<battle mode: tactical>' }), L())), []);
    const tags = Array.from({ length: 9 }, (unused, i) => ev(i + 1, 2 + i, 3, { note: '<unit: enemy 1>' }));
    assert.deepEqual(keys(C.problems(flat(tags.concat([unit(10, 2, 5)])), L())), ['classicTags']);
    assert.equal(C.problems(flat(tags.concat([unit(10, 2, 5)])), L()).lines[0].text, 'On a Classic map only enemies placed as rows start a battle: 9 here are tag units.');
});

test('the one sentence says whether Play will start a battle', () => {
    const three = [unit(1, 3, 3), unit(2, 4, 3), unit(3, 5, 3)];
    const say = (map, lookups) => { const report = C.problems(map, lookups || L()); return [report.sentence.text, report.sentence.level, report.starts]; };
    assert.deepEqual(say(flat([])), ['No enemies yet. Click one above, then click the map.', 'ok', '']);
    assert.deepEqual(say(flat([unit(1, 3, 3, 'ally', 'actor', 1)])), ['No enemies yet. Click one above, then click the map.', 'ok', ''], 'allies are no enemies');
    assert.deepEqual(say(flat(three)), ['Enemies: 3. Walk within 6 tiles of one and the battle starts.', 'ok', 'near']);
    assert.deepEqual(say(flat(three, { note: '<battle trigger: 12>' })), ['Enemies: 3. Walk within 12 tiles of one and the battle starts.', 'ok', 'near']);
    assert.deepEqual(say(flat(three, { note: '<battle trigger: 1>' })), ['Enemies: 3. Walk next to one and the battle starts.', 'ok', 'near']);
    assert.deepEqual(say(flat(three, { note: '<battle trigger: open>' })), ['Enemies: 3. The battle starts when the party enters this map.', 'ok', 'open']);
    assert.deepEqual(say(flat(three.concat([starter(4, 8, 8), starter(9, 9, 9)]))), ['Enemies: 3. They wait for an event: Villager (004).', 'ok', 'event']);
    assert.deepEqual(say(flat(three, { note: '<battle trigger: 0>' })), ['Enemies: 3. No event starts a battle yet: add Start Battle on Map to one.', 'warn', '']);
    // The count includes tag units. On a Classic map they start nothing by themselves: they wait for an event.
    const tagged = ev(4, 6, 3, { note: '<unit: enemy 1>' });
    assert.equal(say(flat(three.concat([tagged])))[0], 'Enemies: 4. Walk within 6 tiles of one and the battle starts.');
    assert.deepEqual(say(flat([tagged])), ['Enemies: 1. No event starts a battle yet: add Start Battle on Map to one.', 'warn', '']);
    assert.deepEqual(say(flat([tagged], { note: '<battle mode: action>' })), ['Enemies: 1. Walk within 6 tiles of one and the battle starts.', 'ok', 'near']);
    // Another language through the editor's translator; English where it has no such key.
    const report = C.problems(flat(three), L());
    assert.equal(C.say(report.sentence, (key, args) => `${key}|${args.count}|${args.tiles}`), 'battleCheck.near|3|6');
    assert.equal(C.say(report.sentence, key => key), report.sentence.text);
    assert.equal(C.say(report.sentence), report.sentence.text);
});

test('nobody in the party, and First Person on a 2D map', () => {
    const empty = C.problems(flat([unit(1, 3, 3)]), L({ system: { partyMembers: [] } }));
    assert.deepEqual(keys(empty), ['noParty']);
    assert.deepEqual([empty.lines[0].text, empty.lines[0].level, empty.lines[0].fix.kind, empty.lines[0].fix.page, empty.lines[0].fix.label], ['Nobody is in the party.', 'fix', 'party', 'system1', 'Starting Party']);
    assert.deepEqual(keys(C.problems(flat([unit(1, 3, 3)]), L({ system: { partyMembers: [7] } }))), ['noParty'], 'a member the Database does not have is nobody');
    assert.deepEqual(keys(C.problems(flat([]), L({ system: { partyMembers: [] } }))), [], 'a map with no battle is not told');
    const flatFirst = C.problems(flat([unit(1, 3, 3)]), L({ system: { partyMembers: [1], reactorBattle: { mode: 'firstPerson' } } }));
    assert.deepEqual([keys(flatFirst), flatFirst.lines[0].text, flatFirst.lines[0].level, flatFirst.ok, flatFirst.mode.playsAs], [['firstPerson2D'], 'First Person plays as Action on a 2D map.', 'note', true, 'action']);
});

test('a unit on the tile the party starts on is noted', () => {
    const start = more => L({ system: Object.assign({ partyMembers: [1], startMapId: 1, startX: 3, startY: 9 }, more) });
    const report = C.problems(flat([unit(1, 3, 9), unit(2, 8, 9)]), start());
    assert.deepEqual(report.lines.map(line => [line.key.replace('battleCheck.', ''), line.level, line.eventId, line.text]), [['onStart', 'note', 1, 'Raider (001) stands on the tile the party starts on.']]);
    assert.deepEqual([report.ok, report.lines[0].fix.kind], [true, 'show']);
    assert.match(V.print(report).map(line => `${line.mark} ${line.text}`).join('\n'), /note Raider \(001\) stands on the tile the party starts on\. \(3, 9\)/);
    // The game starts on another map, or on another tile of this one: nothing is said.
    assert.deepEqual(keys(C.problems(flat([unit(1, 3, 9)]), start({ startMapId: 2 }))), []);
    assert.deepEqual(keys(C.problems(flat([unit(1, 4, 9)]), start())), []);
});

//-----------------------------------------------------------------------------
// The editor: the strings, and the page that loads the checker.

test('every sentence is in the editor\'s catalog, in English as the checker says it and translated in the 17 locales', () => {
    const store = new Map();
    const sandbox = {
        window: { dispatchEvent() {} },
        document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } },
        localStorage: { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)) },
        CustomEvent: class { constructor(type) { this.type = type; } }
    };
    sandbox.window.document = sandbox.document; sandbox.window.localStorage = sandbox.localStorage; sandbox.window.CustomEvent = sandbox.CustomEvent;
    const source = ['I18nDeepTranslations.js', 'I18nReviewedTranslations.js', 'I18nManager.js'].map(name => {
        const file = path.join(editorRoot, 'src', name);
        return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    }).join('\n');
    const { RR_LANGUAGES, RR_I18N_STRINGS, manager } = vm.runInNewContext(`${source}\n({ RR_LANGUAGES, RR_I18N_STRINGS, manager: window.I18n })`, sandbox);
    const locales = Array.from(RR_LANGUAGES, language => language.id).filter(id => id !== 'en');
    assert.equal(locales.length, 17);
    const placeholders = text => (String(text).match(/\{\w+\}/g) || []).sort().join(',');
    for (const [key, english] of Object.entries(C.MESSAGES)) {
        assert.equal(RR_I18N_STRINGS.en[key], english, `${key}: the catalog's English is the checker's`);
        for (const locale of locales) {
            const told = RR_I18N_STRINGS[locale][key];
            assert.ok(told && told !== english, `${locale} translates ${key}`);
            assert.equal(placeholders(told), placeholders(english), `${locale} keeps the values of ${key}`);
        }
    }
    assert.deepEqual(Object.keys(RR_I18N_STRINGS.en).filter(key => key.startsWith('battleCheck.')).sort(), Object.keys(C.MESSAGES).sort(), 'and the catalog has no key the checker lacks');
    // A distance is said without a counted noun where the noun's form follows the number (2 to 50 tiles are three forms in
    // Russian and Polish, more in Arabic).
    for (const [locale, noun] of [['ru', /\{tiles\} клет/], ['pl', /\{tiles\} kafel/], ['ar', /\{tiles\} بلاط/]]) {
        assert.doesNotMatch(RR_I18N_STRINGS[locale]['battleCheck.near'], noun, `${locale}: no noun counted by {tiles}`);
        assert.doesNotMatch(RR_I18N_STRINGS[locale]['battleCheck.classicTags'], /\{count\} \S/, `${locale}: no word counted by {count}`);
    }
    // "Starting Party" is the group that starts the game, in each language's own word for a party of adventurers.
    assert.deepEqual(['es', 'zh-Hant', 'pt', 'it', 'fr', 'ja', 'ko'].map(locale => RR_I18N_STRINGS[locale]['battleCheck.fix.party']),
        ['Grupo inicial', '初始隊伍', 'Grupo inicial', 'Gruppo iniziale', 'Groupe de départ', '初期パーティー', '초기 파티']);
    // A report read through the editor's translator.
    manager.setLanguage('de', { persist: false });
    const report = C.problems(flat([unit(1, 3, 3), unit(2, 4, 3), unit(3, 5, 3)]), L());
    assert.equal(C.say(report.sentence, (key, args) => manager.t(key, args)), 'Gegner: 3. Geh bis auf 6 Felder an einen heran, und der Kampf beginnt.');
});

test('the editor page loads the checker once, and it needs no page to load', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.equal((html.match(/<script src="src\/utils\/BattleCheck\.js"><\/script>/g) || []).length, 1);
    const context = {};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'BattleCheck.js'), 'utf8'), context);
    assert.equal(typeof context.RRBattleCheck.problems, 'function');
    assert.equal(context.BattleCheck, context.RRBattleCheck);
    assert.equal(context.RRBattleCheck.problems({ id: 1, width: 4, height: 4, note: '', events: [null] }, {}).sentence.key, 'battleCheck.none');
    // Neither the checker nor the tools ask for a package the packaged editor would have to carry.
    for (const file of ['src/utils/BattleCheck.js', 'build-scripts/validate-battle.cjs', 'build-scripts/place-unit.cjs']) {
        const text = fs.readFileSync(path.join(editorRoot, file), 'utf8');
        for (const match of text.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) assert.ok(match[1].startsWith('node:') || match[1].startsWith('./'), `${file} requires ${match[1]}`);
    }
});

//-----------------------------------------------------------------------------
// Placing by script.

test('place-unit makes the events the editor makes', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
    const method = name => { const start = source.indexOf(`    ${name}(`); return source.slice(start, source.indexOf('\n    }\n', start) + 6); };
    const Manager = new Function(`return class { constructor(map) { this.currentMap = map; }\n${method('getNextEventId')}\n${method('makeDefaultEventPage')}\n${method('makeQuickEvent')}\n}`)();
    const map = { events: [null, { id: 1 }, null, { id: 3 }] };
    const editor = new Manager(map), tool = Placer.manager(map);
    assert.equal(tool.getNextEventId(), editor.getNextEventId());
    const overrides = { image: { characterName: 'Actor1', characterIndex: 2 }, priorityType: 1, trigger: 0, conditions: { selfSwitchValid: true } };
    assert.deepEqual(tool.makeDefaultEventPage(overrides), editor.makeDefaultEventPage(overrides));
    assert.deepEqual(tool.makeDefaultEventPage(), editor.makeDefaultEventPage());
    assert.deepEqual(tool.makeQuickEvent(4, 5, 'Raider', [tool.makeDefaultEventPage()]), editor.makeQuickEvent(4, 5, 'Raider', [editor.makeDefaultEventPage()]));
});

test('placing by script: Battle Setup\'s own events, the row, the facing, the map\'s mode and start; a refused tile writes nothing', () => {
    const { fightWorld } = require('./helpers/fight-world.cjs');
    const context = { BattleCheck: C, BattleSetup: B, lookups: L() };
    const map = flat([], {}, [[9, 9]]);
    const done = Placer.place(map, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 4 }], face: 4, returns: true }, context);
    assert.deepEqual(done.refused, []);
    assert.deepEqual(done.placed.map(entry => [entry.event.id, entry.event.name, entry.event.x, entry.event.y]), [[1, 'Raider', 3, 3], [2, 'Raider', 4, 3], [3, 'Raider', 5, 4]]);
    assert.deepEqual(map.events[1].rrUnit, { team: 'enemy', record: 'enemy', id: 1, returns: true });
    assert.deepEqual(map.events.slice(1).map(event => event.pages[0].image.direction), [4, 4, 4]);
    // The same event Battle Setup makes for that click, with the row's additions.
    const card = B.unitEvent(Placer.manager(flat([])), { team: 'enemy', record: 'enemy', id: 1 }, 3, 3, { actors, enemies, map: flat([]) }).event;
    assert.deepEqual(Object.assign({}, map.events[1], { rrUnit: card.rrUnit, pages: [Object.assign({}, map.events[1].pages[0], { image: card.pages[0].image })] }), card);
    // The game reads them as units.
    const spec = fightWorld().ReactorFight.unitSpecOf(map.events[1], []);
    assert.deepEqual([spec.team, spec.record, spec.id], ['enemy', 'enemy', 1]);
    // The first unit on a map with none writes the start in force into the Note; the report then says what Play does.
    assert.equal(map.note, '<battle trigger: 6>');
    assert.deepEqual(done.notes, ['set <battle trigger: 6>']);
    assert.equal(C.problems(map, L()).sentence.text, 'Enemies: 3. Walk within 6 tiles of one and the battle starts.');
    // More units leave the Note alone; a mode and a start are written when asked for, and taken out again.
    const more = Placer.place(map, { unit: { team: 'ally', record: 'actor', id: 1 }, spots: [{ x: 3, y: 6 }], move: 5, name: 'Ren the Guard', mode: 'firstPerson', start: 'open', lose: 'continue' }, context);
    assert.deepEqual([more.placed[0].event.id, more.placed[0].event.name, more.placed[0].event.rrUnit], [4, 'Ren the Guard', { team: 'ally', record: 'actor', id: 1, move: 5 }]);
    assert.equal(map.note, '<battle trigger: open>\n<battle mode: firstPerson>\n<battle lose: continue>');
    assert.deepEqual([C.modeOf(map, L()).mode, C.startOf(map).kind, C.startOf(map).lose], ['firstPerson', 'open', 'continue']);
    Placer.place(map, { mode: 'game', start: 0, lose: 'gameover' }, context);
    assert.equal(map.note, '<battle trigger: 0>');
    // On a map whose events already start the battle, the first unit writes that: 0.
    const scripted = flat([starter(4, 8, 8)]);
    Placer.place(scripted, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 3, y: 3 }] }, context);
    assert.equal(scripted.note, '<battle trigger: 0>');
    // The sidecar's own keys for the two go when the tags are written: one place.
    const keyed = flat([], { reactor3d: { battle: { mode: 'tactical', trigger: 4 } } });
    const rewritten = Placer.place(keyed, { mode: 'action', start: 8 }, context);
    assert.deepEqual([keyed.note, keyed.reactor3d.battle, rewritten.sidecar], ['<battle mode: action>\n<battle trigger: 8>', undefined, true]);

    // Refusals: a wall tile, another event, off the map, the same tile twice, a record the Database lacks. Nothing is changed.
    const before = JSON.stringify(map);
    const refuse = (order, text) => {
        const out = Placer.place(map, Object.assign({ unit: { team: 'enemy', record: 'enemy', id: 1 } }, order), context);
        assert.deepEqual([out.placed.length, out.refused.map(entry => entry.text)], [0, text]);
        assert.equal(JSON.stringify(map), before);
    };
    refuse({ spots: [{ x: 9, y: 9 }] }, ['Nobody can walk onto this tile.']);
    refuse({ spots: [{ x: 3, y: 3 }] }, ['Something is already here.']);
    refuse({ spots: [{ x: 40, y: 3 }] }, ['Off the map.']);
    refuse({ spots: [{ x: 10, y: 10 }, { x: 10, y: 10 }] }, ['Something is already here.']);
    refuse({ spots: [{ x: 10, y: 10 }, { x: 9, y: 9 }] }, ['Nobody can walk onto this tile.']);
    refuse({ unit: { team: 'enemy', record: 'enemy', id: 99 }, spots: [{ x: 10, y: 10 }] }, ['enemy 99 is not in the Database.']);
    // A big unit is placed only where all of it fits: its body is measured before it is made (three by three round its tile).
    const big = { BattleCheck: C, BattleSetup: B, lookups: L({ body: (event, made) => (made.id === 4 ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : null) }) };
    const tank = { unit: { team: 'enemy', record: 'enemy', id: 4 } };
    const tight = Placer.place(flat([], {}, [[6, 6]]), Object.assign({ spots: [{ x: 5, y: 5 }] }, tank), big);
    assert.deepEqual([tight.placed.length, tight.refused], [0, [{ x: 5, y: 5, text: 'Tank does not fit here.' }]]);
    assert.equal(Placer.place(flat([], {}, [[6, 6]]), Object.assign({ spots: [{ x: 9, y: 5 }] }, tank), big).placed.length, 1);
    assert.equal(Placer.place(flat([], {}, [[6, 6]]), { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 5, y: 5 }] }, big).placed.length, 1, 'a unit of one tile stands beside the wall');
    // `force` places it anyway, and the report then says what is wrong with it.
    const forced = Placer.place(map, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 9, y: 9 }], force: true }, context);
    assert.equal(forced.placed.length, 1);
    assert.deepEqual(keys(C.problems(map, L())).filter(key => key === 'noStand'), ['noStand']);
});

test('placing on a 3D map: the lowest place on the tile, or the place nearest a height, kept as the event\'s Z', () => {
    const lookups = L3(), context = { BattleCheck: C, BattleSetup: B, lookups };
    const map = deep();
    const ground = Placer.place(map, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 5, y: 5 }, { x: 2, y: 6 }, { x: 7, y: 11 }] }, context);
    assert.deepEqual(ground.placed.map(entry => [entry.event.id, entry.lift, entry.height]), [[1, 0, 0], [2, 0, 0], [3, 0, 0]]);
    assert.equal(map.reactor3d.eventZ, undefined, 'on the ground no Z is written');
    assert.equal(ground.sidecar, false);
    const upper = Placer.place(map, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 2, y: 6 }], z: 5 }, context);
    assert.deepEqual(upper.refused.map(entry => entry.text), ['Something is already here.'], 'the tile is taken, whatever the floor');
    map.events[2].x = 3;
    const again = Placer.place(map, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 2, y: 6 }], z: 5 }, context);
    assert.deepEqual([again.placed[0].lift, again.placed[0].height, map.reactor3d.eventZ, again.sidecar], [5.1, 5.1, { 4: 5.1 }, true]);
    assert.equal(C.problems(map, lookups).ok, true, 'and the checker finds every one of them standing');
    // Where nothing can stand, with the reason.
    for (const [spot, text] of [[{ x: 1, y: 11 }, 'Too deep to stand.'], [{ x: 6, y: 2 }, 'Nothing can stand on this roof.'], [{ x: 10, y: 2 }, 'Something is already here.']]) {
        assert.deepEqual(Placer.place(map, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [spot] }, context).refused.map(entry => entry.text), [text]);
    }
    // Under the slab over (2, 2) no body has room, and with no height named a unit is never stood up on what hangs over the
    // tile; a height named takes the place to stand nearest it, however far.
    const under = Placer.place(map, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 2, y: 2 }] }, context);
    assert.deepEqual([under.placed.length, under.refused.map(entry => entry.text)], [0, ['Not enough room to stand up.']]);
    const onTop = Placer.place(map, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 2, y: 2 }], z: 1.5 }, context);
    assert.deepEqual([onTop.placed[0].height, onTop.placed[0].lift], [2.1, 2.1]);
    const nearest = z => { const made = Placer.place(deep(), { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 2, y: 6 }], z }, context); return made.placed.length ? made.placed[0].height : made.refused[0].text; };
    assert.deepEqual([4, 6, 5, 2, 40].map(nearest), [5.1, 5.1, 5.1, 0, 5.1], 'the upper floor from a tile under it or over it; the ground when that is nearer');
    assert.equal(nearest(-3), 0);
});

test('a new event starts clean: what the 3D sidecar kept under its id for an event since deleted goes', () => {
    const lookups = L3(), context = { BattleCheck: C, BattleSetup: B, lookups };
    // Event 1 was deleted by hand: its height, its model, its preview page and its sizes are still in the sidecar. Event 2's are its own.
    const map = deep([ev(2, 9, 9)], {
        eventZ: { 1: 20, 2: 3 }, events: { 1: { 0: { name: 'Actors/Mascot', size: 3 } }, 2: { 0: { name: 'Actors/Guard' } } },
        eventPreviews: { 1: 0 }, eventSize: { 1: [3, 3] }, eventSizeAuto: { 1: [2, 2, 0, 0] }
    });
    const done = Placer.place(map, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 5, y: 5 }, { x: 6, y: 5 }] }, context);
    assert.deepEqual(done.placed.map(entry => [entry.event.id, entry.lift, entry.height]), [[1, 0, 0], [3, 0, 0]], 'the free id is used again, as the editor does');
    assert.equal(done.sidecar, true, 'the sidecar is written');
    const side = map.reactor3d;
    assert.deepEqual([side.eventZ, side.events, side.eventPreviews, side.eventSize, side.eventSizeAuto], [{ 2: 3 }, { 2: { 0: { name: 'Actors/Guard' } } }, undefined, undefined, undefined]);
    // The game then stands it on the ground as its record's own look, and the checker has nothing to say of it.
    const R = lookups.Reactor3D;
    assert.deepEqual([R.eventZAt(map, 1), R.eventModelSpec(map, 1, 0)], [0, null]);
    assert.deepEqual(C.problems(map, lookups).lines.filter(line => line.eventId === 1), []);
    assert.equal(Placer.forget(map, 7), false, 'nothing kept, nothing to write');
    // A height of its own replaces the old one.
    const upper = deep([], { eventZ: { 1: 20 } });
    Placer.place(upper, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 2, y: 6 }], z: 5 }, context);
    assert.deepEqual(upper.reactor3d.eventZ, { 1: 5.1 });
    // On a 2D map too: a typed size left behind would make the new unit nine tiles big.
    const plain = flat([], { reactor3d: { eventSize: { 1: [3, 3] }, eventSizeAnchor: 'center' } });
    const placed = Placer.place(plain, { unit: { team: 'enemy', record: 'enemy', id: 1 }, spots: [{ x: 5, y: 5 }] }, { BattleCheck: C, BattleSetup: B, lookups: L() });
    assert.deepEqual([placed.sidecar, plain.reactor3d.eventSize, C.problems(plain, L()).units[0].body.count], [true, undefined, 1]);
});

test('a model\'s body is measured as the game measures it: the Demo\'s tank covers seven by twelve tiles', t => {
    const demo = path.join(repoRoot, 'template', 'Demo');
    const glb = path.join(demo, '3d', 'Vehicles', 'Oth97_CNO_Consul', 'source', 'Oth97_CNO_Consul.glb');
    const bindingsFile = path.join(demo, 'data', 'Database.r3d.json');
    if (!fs.existsSync(glb) || !fs.existsSync(bindingsFile)) return t.skip('the Demo\'s tank is not in this checkout');
    const bindings = JSON.parse(fs.readFileSync(bindingsFile, 'utf8'));
    const bound = Object.entries(bindings.enemies || {}).find(([, spec]) => spec && spec.name === 'Vehicles/Oth97_CNO_Consul');
    if (!bound) return t.skip('no enemy wears the tank');
    const loaded = V.world();
    const map = { id: 9, width: 40, height: 40, tilesetId: 1, note: '', events: [null] };
    const body = V.models(demo, loaded).bodies(map, { bindings });
    const tank = { id: 9, name: 'Tank', note: '', x: 20, y: 20, rrUnit: { team: 'enemy', record: 'enemy', id: Number(bound[0]) }, pages: [page()] };
    const shape = C.toShape(body(tank, C.unitOf(tank)));
    assert.ok(shape.count > 20, 'a hull of many tiles');
    if (bound[1].size === 15) assert.deepEqual([shape.w, shape.h], [7, 12]);
    // Turned to face right it lies the other way.
    tank.pages[0].image.direction = 6;
    const turned = C.toShape(body(tank, C.unitOf(tank)));
    assert.deepEqual([turned.w, turned.h], [shape.h, shape.w]);
    // An event with no model is not measured: it stands on its own tile.
    assert.equal(body({ id: 10, x: 1, y: 1, pages: [page()] }, null), null);
    // The checker asks that body: in the open the tank fits; with a raider under its hull it does not, and he stands in it.
    map.events[9] = tank;
    const placed = () => C.problems(map, { bindings, body }).lines.filter(line => /noStand|noFit/.test(line.key)).map(line => [line.eventId, line.key.replace('battleCheck.', '')]);
    assert.deepEqual(placed(), []);
    map.events[10] = unit(10, 20 + turned.ox + 1, 20);
    assert.deepEqual(placed(), [[10, 'noStand'], [9, 'noFit']]);
});

//-----------------------------------------------------------------------------
// The two tools as they are run.

function projectIn(folder) {
    const data = path.join(folder, 'data');
    fs.mkdirSync(data, { recursive: true });
    const write = (name, value) => fs.writeFileSync(path.join(data, name), V.world().RRJson.stringify(value));
    write('System.json', Object.assign({ versionId: 1, gameTitle: 'Check' }, system));
    write('Actors.json', actors); write('Enemies.json', enemies); write('Troops.json', [null]); write('Tilesets.json', tilesets);
    write('MapInfos.json', [null, { id: 1, name: 'Field' }, { id: 2, name: 'Keep' }]);
    require('../src/utils/DataLimits.js');
    const plain = flat([], {}, [[9, 9]]), built = deep();
    for (const map of [plain, built]) {
        const stored = Object.assign({}, map);
        delete stored.id; delete stored.reactor3d;
        fs.writeFileSync(path.join(data, `Map00${map.id}.json`), globalThis.RRMapJson.stringify(stored));
    }
    fs.writeFileSync(path.join(data, 'Map002.r3d.json'), require('../src/utils/MapElevation.js').stringifySidecar(built.reactor3d));
    // The battler pictures the Raider and the Tank name (the Tank's stored encrypted); the Slime names none.
    fs.mkdirSync(path.join(folder, 'img', 'enemies'), { recursive: true });
    for (const name of ['Raider.png', 'Tank.png_']) fs.writeFileSync(path.join(folder, 'img', 'enemies', name), '');
    return folder;
}
const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('validate-battle.cjs and place-unit.cjs from the command line: exit codes, what is printed, what is written', t => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-battle-tools-'));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    const project = projectIn(path.join(folder, 'game'));
    const validate = path.join(editorRoot, 'build-scripts', 'validate-battle.cjs'), placeUnit = path.join(editorRoot, 'build-scripts', 'place-unit.cjs');
    const mapFile = path.join(project, 'data', 'Map001.json'), before = fs.readFileSync(mapFile, 'utf8');

    assert.equal(run(validate, []).status, 2, 'no project: usage');
    assert.equal(run(validate, [folder]).status, 2, 'not a project');
    assert.equal(run(validate, [project, '7']).status, 2, 'no such map');
    const quiet = run(validate, [project]);
    assert.equal(quiet.status, 0, quiet.stdout + quiet.stderr);
    assert.match(quiet.stdout, /2 map\(s\) checked, 2 with no units and no battle start; nothing to fix/);

    // A refused tile: exit 1, the reason, the file untouched.
    const refused = run(placeUnit, [project, '1', '--enemy', '1', '--at', '9,9']);
    assert.deepEqual([refused.status, fs.readFileSync(mapFile, 'utf8') === before], [1, true], refused.stdout + refused.stderr);
    assert.match(refused.stdout, /refused \(9, 9\): Nobody can walk onto this tile\.\nnothing written/);
    for (const bad of [['--enemy', '1'], ['--at', '3,3'], ['--enemy', '1', '--at', '3'], ['--enemy', '1', '--at', '3,3', '--mode', 'tactics'], ['--enemy', '1', '--at', '3,3', '--start', '60'],
        ['--actor', '1', '--at', '3,3', '--comes-back'], ['--enemy', '1', '--at', '3,3', '--face', 'north'], []]) {
        assert.equal(run(placeUnit, [project, '1', ...bad]).status, 2, bad.join(' '));
    }
    assert.equal(fs.readFileSync(mapFile, 'utf8'), before);
    // --check reports and writes nothing.
    const checked = run(placeUnit, [project, '1', '--enemy', '1', '--at', '3,3', '--check']);
    assert.deepEqual([checked.status, fs.readFileSync(mapFile, 'utf8') === before], [0, true]);
    assert.match(checked.stdout, /placed 001 Raider at \(3, 3\), facing down: enemy, enemy 1\n/);

    // Placed: the spec's own example line, then the map's report.
    const placed = run(placeUnit, [project, '1', '--enemy', '1', '--at', '3,3', '--at', '4,3', '--at', '5,4', '--face', 'left', '--comes-back', '--mode', 'firstPerson', '--start', '6']);
    assert.equal(placed.status, 0, placed.stdout + placed.stderr);
    assert.match(placed.stdout, /placed 003 Raider at \(5, 4\), facing left: enemy, enemy 1, comes back/);
    assert.match(placed.stdout, /set <battle mode: firstPerson>\nset <battle trigger: 6>\nwrote .*Map001\.json/);
    assert.match(placed.stdout, /Enemies: 3\. Walk within 6 tiles of one and the battle starts\./);
    assert.match(placed.stdout, /note First Person plays as Action on a 2D map\./);
    const written = fs.readFileSync(mapFile, 'utf8'), map = JSON.parse(written);
    assert.equal(written, globalThis.RRMapJson.stringify(map), 'the file is written as the editor writes a map');
    assert.deepEqual([map.note, map.events.length, map.events[2].rrUnit, map.id, map.reactor3d], ['<battle mode: firstPerson>\n<battle trigger: 6>', 4, { team: 'enemy', record: 'enemy', id: 1, returns: true }, undefined, undefined]);
    assert.notEqual(JSON.parse(fs.readFileSync(path.join(project, 'data', 'System.json'), 'utf8')).versionId, 1, 'saves made before reload the map');
    // An ally from an actor.
    assert.equal(run(placeUnit, [project, '1', '--actor', '1', '--at', '3,6']).status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(mapFile, 'utf8')).events[4].rrUnit, { team: 'ally', record: 'actor', id: 1 });

    // The 3D map: on the upper floor by --z, its Z in the sidecar; refused in deep water.
    const sidecarFile = path.join(project, 'data', 'Map002.r3d.json');
    assert.match(run(placeUnit, [project, '2', '--enemy', '1', '--at', '1,11']).stdout, /refused \(1, 11\): Too deep to stand\./);
    const high = run(placeUnit, [project, '2', '--enemy', '4', '--at', '2,6', '--z', '5']);
    assert.equal(high.status, 0, high.stdout + high.stderr);
    assert.match(high.stdout, /placed 001 Tank at \(2, 6\), standing at height 5\.1, facing down/);
    assert.match(high.stdout, /wrote .*Map002\.json\nwrote .*Map002\.r3d\.json/);
    assert.deepEqual(JSON.parse(fs.readFileSync(sidecarFile, 'utf8')).eventZ, { 1: 5.1 });

    // The whole project: clean, exit 0. Then something wrong: exit 1 and a FIX line; --json for a script to read.
    const clean = run(validate, [project]);
    assert.equal(clean.status, 0, clean.stdout);
    assert.match(clean.stdout, /Map 1 \(Field\) 20x15\n {2}ok {3}Battle mode: First Person \(this map's own, <battle mode: firstPerson>\)/);
    assert.match(clean.stdout, /Map 2 \(Keep\) 14x14/);
    assert.match(clean.stdout, /2 map\(s\) checked, 0 with no units and no battle start; nothing to fix/);
    assert.equal(run(placeUnit, [project, '2', '--enemy', '2', '--at', '1,11', '--force']).status, 0);
    // A bystander with no record and no picture of its own is placed, and named as the plain figure it is.
    const onlooker = run(placeUnit, [project, '1', '--side', 'bystander', '--at', '4,6', '--name', 'Onlooker']);
    assert.equal(onlooker.status, 0);
    assert.match(onlooker.stdout, /placed 005 Onlooker at \(4, 6\), facing down: bystander, no record\n/);
    assert.match(onlooker.stdout, /FIX {2}Onlooker has no picture: it stands as a plain figure\./);
    assert.deepEqual(JSON.parse(fs.readFileSync(mapFile, 'utf8')).events[5].rrUnit, { team: 'neutral', record: '', id: 0 });
    const wrong = run(validate, [project, '2']);
    assert.equal(wrong.status, 1, wrong.stdout);
    assert.match(wrong.stdout, /FIX {2}Slime has no picture: it stands as a plain figure\./);
    assert.match(wrong.stdout, /FIX {2}Slime \(002\) stands where nothing can stand\. Too deep to stand\. \(1, 11\)/);
    const json = run(validate, [project, '--json']);
    assert.equal(json.status, 1);
    const reports = JSON.parse(json.stdout);
    assert.deepEqual(reports.map(report => [report.mapId, report.name, report.ok, report.count.enemy]), [[1, 'Field', false, 3], [2, 'Keep', false, 2]]);
    // A picture stored encrypted is a picture: the Tank on the upper floor is no plain figure.
    assert.deepEqual(reports[1].units.map(entry => [entry.recordName, entry.look]), [['Tank', 'battler'], ['Slime', 'figure']]);
});

test('a map or a Database file that is not JSON: said in one line, and every other map is still checked', t => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-battle-broken-'));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    const project = projectIn(path.join(folder, 'game'));
    const validate = path.join(editorRoot, 'build-scripts', 'validate-battle.cjs'), placeUnit = path.join(editorRoot, 'build-scripts', 'place-unit.cjs');
    assert.equal(run(placeUnit, [project, '2', '--enemy', '1', '--at', '5,5']).status, 0);
    // A map of null bytes (a save cut short), and one that is no JSON at all.
    fs.writeFileSync(path.join(project, 'data', 'Map001.json'), Buffer.alloc(4096));
    fs.writeFileSync(path.join(project, 'data', 'Map003.json'), '{ this is not json');
    const whole = run(validate, [project]);
    assert.equal(whole.status, 1, whole.stdout + whole.stderr);
    assert.equal(whole.stderr, '', 'no stack, none of the file\'s bytes');
    assert.match(whole.stdout, /Map 1 \(Field\)\n {2}FIX {2}Map001\.json cannot be read \(not valid JSON\)\n/);
    assert.match(whole.stdout, /Map 2 \(Keep\) 14x14[\s\S]*Enemies: 1\. Walk within 6 tiles of one and the battle starts\./, 'the map after it is checked');
    assert.match(whole.stdout, /Map 3 \(\)\n {2}FIX {2}Map003\.json cannot be read \(not valid JSON\)\n/);
    assert.match(whole.stdout, /3 map\(s\) checked, 0 with no units and no battle start; 2 with something to fix/);
    const one = run(validate, [project, '3']);
    assert.deepEqual([one.status, one.stderr], [1, '']);
    const json = run(validate, [project, '--json']);
    assert.equal(json.status, 1);
    assert.deepEqual(JSON.parse(json.stdout).map(report => [report.mapId, report.ok, report.unreadable || '']),
        [[1, false, 'Map001.json cannot be read (not valid JSON)'], [2, true, ''], [3, false, 'Map003.json cannot be read (not valid JSON)']]);
    // JSON that is no map, and a sidecar that cannot be read.
    fs.writeFileSync(path.join(project, 'data', 'Map003.json'), '[1, 2, 3]');
    assert.match(run(validate, [project, '3']).stdout, /FIX {2}Map003\.json cannot be read \(not a map\)/);
    fs.writeFileSync(path.join(project, 'data', 'Map002.r3d.json'), 'x');
    assert.match(run(validate, [project, '2']).stdout, /FIX {2}Map002\.r3d\.json cannot be read \(not valid JSON\)/);
    // Placing on such a map: one line, nothing written.
    const placed = run(placeUnit, [project, '3', '--enemy', '1', '--at', '3,3']);
    assert.deepEqual([placed.status, placed.stderr.trim(), fs.readFileSync(path.join(project, 'data', 'Map003.json'), 'utf8')], [2, 'Map 3: Map003.json cannot be read (not a map)', '[1, 2, 3]']);
    // A Database file: its checks are left out, the run says which file, and exits 1.
    fs.rmSync(path.join(project, 'data', 'Map001.json')); fs.rmSync(path.join(project, 'data', 'Map003.json'));
    fs.writeFileSync(path.join(project, 'data', 'Map002.r3d.json'), require('../src/utils/MapElevation.js').stringifySidecar(deep().reactor3d));
    assert.equal(run(validate, [project]).status, 0);
    fs.writeFileSync(path.join(project, 'data', 'Enemies.json'), '[null, {');
    const lost = run(validate, [project]);
    assert.deepEqual([lost.status, lost.stderr], [1, '']);
    assert.match(lost.stdout, /^FIX {2}data\/Enemies\.json cannot be read \(not valid JSON\)\n/);
});

test('both tools run from a packaged editor\'s layout: the runtime inside the app folder, no node_modules', t => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-battle-stage-'));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    const app = path.join(folder, 'app'), project = projectIn(path.join(folder, 'game'));
    for (const part of ['build-scripts/validate-battle.cjs', 'build-scripts/place-unit.cjs', 'src/utils', 'src/event', 'src/legacy/EditorPaths.js', 'package.json']) {
        fs.cpSync(path.join(editorRoot, part), path.join(app, part), { recursive: true });
    }
    fs.mkdirSync(path.join(app, 'runtime', 'libs'), { recursive: true });
    for (const name of fs.readdirSync(path.join(repoRoot, 'runtime'))) if (name.endsWith('.js')) fs.copyFileSync(path.join(repoRoot, 'runtime', name), path.join(app, 'runtime', name));
    fs.copyFileSync(path.join(repoRoot, 'runtime', 'libs', 'three.js'), path.join(app, 'runtime', 'libs', 'three.js'));
    assert.equal(fs.existsSync(path.join(folder, 'runtime')), false, 'no runtime beside the app folder, as in a package');
    const placed = run(path.join(app, 'build-scripts', 'place-unit.cjs'), [project, '2', '--enemy', '1', '--at', '5,5', '--at', '1,11']);
    assert.equal(placed.status, 1, placed.stdout + placed.stderr);
    assert.match(placed.stdout, /refused \(1, 11\): Too deep to stand\./, 'the staged runtime\'s physics answered');
    assert.equal(run(path.join(app, 'build-scripts', 'place-unit.cjs'), [project, '2', '--enemy', '1', '--at', '5,5']).status, 0);
    const checked = run(path.join(app, 'build-scripts', 'validate-battle.cjs'), [project]);
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    assert.doesNotMatch(checked.stdout, /could not be loaded/);
    assert.match(checked.stdout, /Map 2 \(Keep\) 14x14[\s\S]*Enemies: 1\. Walk within 6 tiles of one and the battle starts\./);
});
