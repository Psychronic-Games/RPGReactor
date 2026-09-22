'use strict';
// LegacyCommands and LegacyDatabase: 2003 event commands and database
// records become MZ-format ones. Fixtures are written the way the reader
// returns them; Deep 8's 33,000 command lists are checked for MZ structure
// when the project is present.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const C = require('../src/legacy/LegacyCommands.js');
const D = require('../src/legacy/LegacyDatabase.js');
const L = require('../src/legacy/LcfReader.js');

const cmd = (code, parameters = [], string = '', indent = 0) => ({ code, indent, string, parameters });
const ctx = () => ({ itemKind: (id) => (id === 7 ? 'weapons' : id === 8 ? 'armors' : 'items'), itemType: (id) => (id === 7 ? 1 : id === 8 ? 3 : 6), actors: { 1: { faceName: 'F', faceIndex: 2, characterName: '!C', characterIndex: 1 } }, classOffset: 14, terms: { inn_a_greeting_1: 'Stay for', inn_a_greeting_2: 'gold?', inn_a_greeting_3: 'Rest?', inn_a_accept: 'Yes', inn_a_cancel: 'No' }, system: { inn_music: { name: 'Inn.ogg' } }, notes: {} });
const codes = (list) => list.map(c => c.code);
// the reader gives every record its id; fixtures get theirs from their index
const ids = (arr) => arr.map((r, i) => (r ? { id: i, ...r } : r));
const withIds = (db) => Object.fromEntries(Object.entries(db).map(([k, v]) => [k, Array.isArray(v) ? ids(v) : v]));

/** MZ structure: every opener has its closer at the same indent, bodies are one deeper. */
function checkStructure(list, where = '') {
    const OPEN = { 111: 412, 102: 404, 112: 413 };
    const stack = [];
    let last = 0;
    list.forEach((c, i) => {
        assert.ok(c.indent <= last + 1, `${where}#${i}: indent jumps from ${last} to ${c.indent}`);
        last = c.indent;
        if ([412, 404, 413].includes(c.code)) { const top = stack.pop(); assert.ok(top && OPEN[top.code] === c.code && top.indent === c.indent, `${where}#${i}: ${c.code} closes ${top && top.code} at ${top && top.indent}`); }
        if (OPEN[c.code]) stack.push(c);
        if ([402, 403, 411].includes(c.code)) assert.ok(stack.length && stack[stack.length - 1].indent === c.indent, `${where}#${i}: ${c.code} outside its block`);
    });
    assert.equal(stack.length, 0, `${where}: unclosed ${stack.map(s => s.code)}`);
    assert.equal(list[list.length - 1].code, 0, `${where}: no terminator`);
}

test('a message with a face and continuation lines becomes 101 + 401s, codes translated', () => {
    const { list } = C.convertList([cmd(10130, [3, 0, 0], 'Faces.png'), cmd(10120, [1, 0, 0, 0]), cmd(10110, [], 'Hi \\c[2]\\n[1]\\_'), cmd(20110, [], 'line \\s[3]two'), cmd(0)], ctx());
    assert.deepEqual(list.slice(0, 3), [{ code: 101, indent: 0, parameters: ['Faces', 3, 2, 0, ''] }, { code: 401, indent: 0, parameters: ['Hi \\c[2]\\n[1]\\.'] }, { code: 401, indent: 0, parameters: ['line two'] }]);
});

test('choices keep their texts, cancel choice or cancel branch, and nest', () => {
    const { list } = C.convertList([
        cmd(10140, [5], 'Yes/No'), cmd(20140, [0], 'Yes'), cmd(10140, [2], 'A/B', 1), cmd(20140, [0], 'A', 1), cmd(10210, [0, 1, 1, 0], '', 2), cmd(20140, [1], 'B', 1), cmd(20141, [], '', 1),
        cmd(20140, [1], 'No'), cmd(20140, [2], ''), cmd(11410, [10], '', 1), cmd(20141)
    ], ctx());
    checkStructure(list);
    assert.deepEqual(list[0], { code: 102, indent: 0, parameters: [['Yes', 'No'], -2, 0, 2, 0] });
    assert.deepEqual(list[2], { code: 102, indent: 1, parameters: [['A', 'B'], 1, 0, 2, 0] });
    const cancel = list.find(c => c.code === 403);
    assert.ok(cancel && cancel.indent === 0, 'the fifth option is the cancel branch of the outer choice');
    assert.deepEqual(codes(list), [102, 402, 102, 402, 121, 402, 404, 402, 403, 230, 404, 0]);
});

test('switches and variables map to 121 and 122, with script operands where MZ has none', () => {
    const c = ctx();
    const { list } = C.convertList([
        cmd(10210, [0, 5, 5, 0]), cmd(10210, [1, 5, 9, 1]), cmd(10210, [0, 5, 5, 2]), cmd(10210, [2, 3, 3, 0]),
        cmd(10220, [0, 1, 1, 1, 0, 42]), cmd(10220, [1, 1, 3, 0, 3, 1, 6]), cmd(10220, [0, 2, 2, 0, 4, 7, 0]), cmd(10220, [0, 2, 2, 0, 5, 1, 9]),
        cmd(10220, [0, 2, 2, 0, 6, 10001, 1]), cmd(10220, [0, 2, 2, 0, 7, 0]), cmd(10220, [0, 2, 2, 0, 5, 1, 12]), cmd(10220, [2, 4, 4, 1, 0, 3])
    ], c);
    assert.deepEqual(list[0].parameters, [5, 5, 0]);
    assert.deepEqual(list[1].parameters, [5, 9, 1]);
    assert.equal(list[2].code, 355);
    assert.match(list[3].parameters[0], /setValue\(\$gameVariables\.value\(3\), true\)/);
    assert.deepEqual(list[4].parameters, [1, 1, 1, 0, 42]);
    assert.deepEqual(list[5].parameters, [1, 3, 0, 2, 1, 6]);
    assert.deepEqual(list[6].parameters, [2, 2, 0, 3, 2, 7], 'a weapon count reads the weapon table');
    assert.deepEqual(list[7].parameters, [2, 2, 0, 3, 3, 1, 10], 'agility is MZ param 6, game data index 10');
    assert.deepEqual(list[8].parameters, [2, 2, 0, 3, 6, -1, 0], 'the player x');
    assert.deepEqual(list[9].parameters, [2, 2, 0, 3, 7, 2], 'gold');
    assert.equal(list[10].parameters[3], 4, 'an equipment id is a script operand');
    assert.match(list[11].parameters[0], /const t = \$gameVariables\.value\(4\)/);
    assert.deepEqual(c.notes, { toggleSwitch: 1, indirectSwitch: 1, indirectVariable: 1 });
});

test('conditional branches carry every 2003 condition MZ can express and script the rest', () => {
    const c = ctx();
    const { list } = C.convertList([
        cmd(12010, [0, 3, 1]), cmd(22011), cmd(12010, [1, 2, 1, 4, 3]), cmd(22011), cmd(12010, [4, 7, 1]), cmd(22011), cmd(12010, [5, 1, 5, 8]), cmd(22011),
        cmd(12010, [6, 10005, 3]), cmd(22010), cmd(22011), cmd(12010, [7, 2]), cmd(22011), cmd(12010, [5, 1, 2, 10]), cmd(22011), cmd(12010, [3, 100, 1]), cmd(22011)
    ], c);
    checkStructure(list);
    assert.deepEqual(list[0].parameters, [0, 3, 1]);
    assert.deepEqual(list[2].parameters, [1, 2, 1, 4, 3]);
    assert.deepEqual(list[4].parameters, [12, '!$gameParty.hasItem($dataWeapons[7], true)']);
    assert.deepEqual(list[6].parameters, [4, 1, 5, 8], 'equipped armor');
    assert.deepEqual(list[8].parameters, [6, 0, 4], 'this event faces left');
    assert.equal(list[9].code, 411);
    assert.deepEqual(list[11].parameters, [13, 2]);
    assert.match(list[13].parameters[1], /level >= 10/);
    assert.deepEqual(list[15].parameters, [7, 100, 1]);
});

test('move routes translate every step and sum jumps', () => {
    const route = C.convertRoute([{ code: 24 }, { code: 1 }, { code: 1 }, { code: 2 }, { code: 25 }, { code: 0 }, { code: 21 }, { code: 32, parameter_a: 9 }, { code: 34, parameter_string: '$Guy', parameter_a: 3 }, { code: 35, parameter_string: 'Bang.wav', parameter_a: 80, parameter_b: 100, parameter_c: 50 }, { code: 28 }, { code: 40 }, { code: 23 }], ctx());
    assert.deepEqual(route.list, [
        { code: 14, parameters: [2, 1] }, { code: 4, parameters: [] }, { code: 25, parameters: [] }, { code: 27, parameters: [9] }, { code: 41, parameters: ['!Guy', 3] },
        { code: 44, parameters: [{ name: 'Bang', volume: 80, pitch: 100, pan: 0 }] }, { code: 29, parameters: [5] }, { code: 42, parameters: [223] }, { code: 15, parameters: [20] }, { code: 0, parameters: [] }
    ]);
    // packed in a Move Event command: 7-bit integers and a length-prefixed string
    const { list } = C.convertList([cmd(11330, [10005, 3, 1, 0, 34, 3, 71, 117, 121, 2, 0, 32, 129, 0], '')], ctx());
    assert.equal(list[0].code, 205);
    assert.deepEqual(list[0].parameters[0], 0);
    assert.deepEqual(list[0].parameters[1].list.slice(0, 3), [{ code: 41, parameters: ['!Guy', 2] }, { code: 4, parameters: [] }, { code: 27, parameters: [128] }]);
    assert.equal(list[0].parameters[1].repeat, true);
});

test('battles, shops and inns fold their handlers into MZ blocks', () => {
    const c = ctx();
    const { list } = C.convertList([
        cmd(10710, [0, 3, 0, 2, 1, 0, 0, 0, 0]), cmd(20710), cmd(11410, [5], '', 1), cmd(20711), cmd(20712), cmd(20713),
        cmd(10720, [0, 0, 1, 0, 2, 7, 8]), cmd(20720), cmd(11410, [1], '', 1), cmd(20721), cmd(20722),
        cmd(10730, [0, 50, 1]), cmd(20730), cmd(11410, [2], '', 1), cmd(20731), cmd(20732),
        cmd(10730, [0, 20, 0])
    ], c);
    checkStructure(list);
    assert.deepEqual(list[0], { code: 301, indent: 0, parameters: [0, 3, true, true] });
    assert.deepEqual(codes(list).slice(0, 6), [301, 601, 230, 602, 603, 604]);
    assert.deepEqual(list[6].parameters, [0, 2, 0, 0, false]);
    assert.deepEqual(list[7].parameters, [1, 7, 0, 0]);
    assert.deepEqual(list[8].parameters, [2, 8, 0, 0]);
    assert.deepEqual(list[9].parameters, [12, '$gameTemp._rrShopTransaction']);
    assert.deepEqual(codes(list).slice(9, 13), [111, 230, 411, 412]);
    const inn = list.slice(13);
    assert.deepEqual(codes(inn).slice(0, 4), [101, 401, 401, 102]);
    assert.deepEqual(inn[3].parameters[0], ['Yes', 'No']);
    assert.equal(inn[1].parameters[0], 'Stay for 50 gold?');
    assert.deepEqual(codes(inn).slice(4, 12), [402, 125, 221, 249, 230, 314, 222, 230], 'the stay branch pays, fades, plays the inn music and heals before the authored commands');
    assert.deepEqual(inn[5].parameters, [1, 0, 50]);
    const second = list.slice(list.findIndex((x, i) => i > 20 && x.code === 101));
    assert.deepEqual(codes(second), [101, 401, 401, 102, 402, 125, 221, 249, 230, 314, 222, 402, 404, 0], 'an inn without handlers is written out whole');
});

test('commands MZ lacks call the runtime equivalents', () => {
    const c = ctx();
    const { list } = C.convertList([cmd(12330, [1, 12, 2]), cmd(12330, [0, 5]), cmd(11610, [3, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1]), cmd(11340), cmd(11350), cmd(11320, [10001, 31, 0, 0, 31, 5, 1]), cmd(10910, [0, 4, 6, 9]), cmd(11060, [3]), cmd(12420), cmd(1008, [1, 2, 3, 0, 0, 0, 0])], c);
    assert.equal(list[0].parameters[0], 'this.rrCallMapEvent(12, 2)');
    assert.deepEqual(list[1], { code: 117, indent: 0, parameters: [5] });
    assert.equal(list[2].parameters[0], 'this.rrKeyInput(3, [5,6,1,4], true, 0)');
    assert.equal(list[3].parameters[0], 'this.rrWaitForAllMoves()');
    assert.equal(list[4].parameters[0], 'this.rrHaltAllMoves()');
    assert.equal(list[5].parameters[0], 'this.rrFlashCharacter(-1, [248, 0, 0, 248], 30, true)');
    assert.equal(list[6].parameters[0], '$gameVariables.setValue(9, this.rrTerrainId(4, 6))');
    assert.equal(list[7].parameters[0], 'this.rrPanReset()');
    assert.equal(list[8].code, 353);
    assert.deepEqual(list[9].parameters, [2, 17, true], 'a 2003 class id is offset past the per-actor classes');
    assert.deepEqual(c.notes, { callMapEvent: 1, keyInput: 1 });
});

test('pictures, screen and audio keep their numbers in MZ units', () => {
    const { list } = C.convertList([
        cmd(11110, [3, 0, 160, 120, 0, 150, 40, 0, 100, 100, 100, 100, 0, 0], 'Pic.png'), cmd(11110, [4, 1, 10, 11, 0, 100, 0, 0, 200, 100, 100, 0, 0, 0], 'Red'),
        cmd(11120, [3, 0, 0, 0, 0, 100, 100, 0, 100, 100, 100, 100, 0, 0, 15, 1]), cmd(11130, [3]),
        cmd(11030, [100, 100, 100, 0, 10, 1]), cmd(11040, [31, 31, 0, 15, 5, 0, 0]), cmd(11050, [5, 3, 20, 1, 0]), cmd(11410, [25]),
        cmd(11510, [0, 80, 100, 50], 'Town.ogg'), cmd(11550, [90, 150, 0], 'Hit.wav'), cmd(10810, [7, 3, 4, 1]), cmd(11070, [2, 2])
    ], ctx());
    assert.deepEqual(list[0].parameters, [3, 'Pic', 1, 0, 160, 120, 150, 150, 153, 0]);
    assert.deepEqual(list[1].parameters, [4, 'Red', 1, 1, 10, 11, 100, 100, 255, 0]);
    assert.deepEqual(list[2], { code: 234, indent: 0, parameters: [4, [255, 0, 0, 255], 1, false] });
    assert.deepEqual(list[3].parameters, [3, 0, 1, 0, 0, 0, 100, 100, 0, 0, 90, true, 0], 'MZ Move Picture: id, unused, origin, designation, x, y, scales, opacity, blend, frames, wait, easing');
    assert.deepEqual(list[4], { code: 234, indent: 0, parameters: [3, [0, 0, 0, 0], 90, false] }, 'a move restates the colour, so an earlier tint can clear');
    assert.deepEqual(list[5].parameters, [3]);
    assert.deepEqual(list[6].parameters, [[0, 0, 0, 255], 60, true]);
    assert.deepEqual(list[7].parameters, [[248, 248, 0, 120], 30, false]);
    assert.deepEqual(list[8].parameters, [5, 3, 120, true]);
    assert.deepEqual(list[9].parameters, [150]);
    assert.deepEqual(list[10].parameters, [{ name: 'Town', volume: 80, pitch: 100, pan: 0 }]);
    assert.deepEqual(list[11].parameters, [{ name: 'Hit', volume: 90, pitch: 150, pan: -100 }]);
    assert.deepEqual(list[12].parameters, [0, 7, 3, 4, 8, 0], 'a 2003 facing of 1 (up) is MZ 8');
    assert.deepEqual(list[13].parameters, ['snow', 9, 1, false]);
});

test('Show Picture names the keyed file, or the opaque copy when the call turns the transparent colour off', () => {
    const cmd = (code, parameters, string = '') => ({ code, indent: 0, string, parameters });
    const use = { Flag: 'both', Solid: false, Keyed: true };
    const ctx = { itemKind: () => 'items', actors: {}, notes: {}, pictureFile: (name, transparent) => (!transparent && use[name] === 'both' ? name + ' (opaque)' : name) };
    const { list } = C.convertList([
        cmd(11110, [1, 0, 0, 0, 0, 100, 0, 0, 100, 100, 100, 100, 0, 0], 'Flag.png'), cmd(11110, [2, 0, 0, 0, 0, 100, 0, 1, 100, 100, 100, 100, 0, 0], 'Flag.png'),
        cmd(11110, [3, 0, 0, 0, 0, 100, 0, 0, 100, 100, 100, 100, 0, 0], 'Solid.png'), cmd(11110, [4, 0, 0, 0, 0, 100, 0, 1, 100, 100, 100, 100, 0, 0], 'Keyed.png')], ctx);
    assert.deepEqual(list.filter(c => c.code === 231).map(c => c.parameters[1]), ['Flag (opaque)', 'Flag', 'Solid', 'Keyed']);
});

test('2003 picture rotation and wave effects become runtime picture effects, cleared when a later show or move drops them', () => {
    const c = ctx();
    const { list } = C.convertList([
        cmd(11110, [501, 0, 120, 80, 0, 100, 0, 0, 100, 100, 100, 100, 2, 1, 0, 68], 'Flag'),
        cmd(11120, [501, 0, 120, 80, 0, 100, 0, 0, 100, 100, 100, 100, 0, 0, 5, 0]),
        cmd(11110, [7, 0, 0, 0, 0, 100, 0, 0, 100, 100, 100, 100, 1, 4, 0, 0], 'Spin'),
        cmd(11110, [8, 0, 0, 0, 0, 100, 0, 0, 100, 100, 100, 100, 0, 0, 0, 0], 'Still')
    ], c);
    assert.deepEqual(codes(list), [231, 355, 232, 234, 355, 231, 355, 231, 0]);
    assert.equal(list[1].parameters[0], '$gameScreen.rrPictureEffect(501, 2, 1)');
    assert.equal(list[4].parameters[0], '$gameScreen.rrPictureEffect(501, 0, 0)');
    assert.equal(list[6].parameters[0], '$gameScreen.rrPictureEffect(7, 1, 4)');
    assert.equal(c.notes.pictureEffect, 2);
});

// ---- database ------------------------------------------------------------------
test('the 2003 EXP curve is a table the runtime reads, and four stats fill eight', () => {
    assert.deepEqual(D.expTable({ exp_base: 30, exp_inflation: 30, exp_correction: 0 }, false, 4), [0, 0, 60, 150, 270]);
    assert.deepEqual(D.expTable({ exp_base: 30, exp_inflation: 30, exp_correction: 0 }, true, 3).slice(2), [30, 84], 'the 2000 curve: 30, then 30 + 30·1.8');
    const curve = [10, 20, 5, 6, 1, 2, 3, 4, 7, 8, 9, 10];
    const p = D.params(curve);
    assert.equal(p.length, 8); assert.equal(p[0].length, 100);
    assert.deepEqual([p[0][1], p[0][2], p[0][99], p[1][1], p[2][2], p[4][1], p[5][1], p[6][2], p[7][1]], [10, 20, 20, 5, 2, 7, 7, 10, 50]);
});

test('skills and items get MZ formulas, scopes and effects that reproduce the 2003 arithmetic', () => {
    const db = {
        engine: 'RPG Maker 2003', actors: [null], classes: [null], states: [null, { name: 'Dead' }, { name: 'Poison', a_rate: 100, b_rate: 80, c_rate: 60, d_rate: 40, e_rate: 0 }], attributes: [null, { name: 'Fire', a_rate: 300, b_rate: 200, c_rate: 100, d_rate: 50, e_rate: 0 }], commonevents: [null, { name: 'x', event_commands: [] }],
        skills: [null, { name: 'Fire', type: 0, scope: 1, power: 40, physical_rate: 0, magical_rate: 10, variance: 4, hit: 95, sp_cost: 6, affect_hp: true, attribute_effects: [true], animation_id: 3, occasion_field: false, occasion_battle: true, using_message1: 'casts Fire' },
            { name: 'Heal', type: 0, scope: 3, power: 60, magical_rate: 5, affect_hp: true, occasion_field: true, occasion_battle: true, state_effects: [false, true], reverse_state_effect: true },
            { name: 'Open', type: 3, switch_id: 12, occasion_field: true, occasion_battle: false }],
        items: [null, { name: 'Potion', type: 6, price: 50, recover_hp: 100, recover_hp_rate: 0, uses: 1, occasion_field1: true, state_set: [false, true] }, { name: 'Sword', type: 1, price: 300, atk_points1: 12, hit: 95, critical_hit: 10, two_handed: true, attribute_set: [true] }, { name: 'Cap', type: 4, price: 80, def_points1: 4 }, { name: 'Key', type: 0, price: 0 }, { name: 'Tome', type: 7, skill_id: 1, uses: 1 }, { name: 'Wand', type: 9, skill_id: 1, uses: 0 }]
    };
    const notes = {};
    const out = D.convert(withIds(db), { start: {} }, notes);
    assert.equal(out.skills[1].damage.formula, 'Math.max(0, Math.floor(40 + a.mat * 10 / 40 - b.mdf * 10 / 80))');
    assert.deepEqual([out.skills[1].scope, out.skills[1].occasion, out.skills[1].damage.type, out.skills[1].damage.elementId, out.skills[1].damage.variance, out.skills[1].successRate, out.skills[1].mpCost, out.skills[1].hitType, out.skills[1].message1], [2, 1, 1, 1, 40, 95, 6, 2, ' casts Fire']);
    assert.deepEqual([out.skills[2].scope, out.skills[2].damage.type, out.skills[2].damage.formula], [7, 3, 'Math.max(0, Math.floor(60 + a.mat * 5 / 40))']);
    assert.deepEqual(out.skills[2].effects, [{ code: 22, dataId: 2, value1: 1, value2: 0 }]);
    assert.deepEqual(out.skills[3].effects, [{ code: 44, dataId: 2, value1: 0, value2: 0 }], 'a switch skill calls a generated common event');
    assert.equal(out.commonEvents[2].name, 'Skill switch: Open');
    assert.deepEqual(out.commonEvents[2].list[0], { code: 121, indent: 0, parameters: [12, 12, 0] });
    assert.equal(out.items[1].effects[0].code, 11); assert.deepEqual(out.items[1].effects[1], { code: 22, dataId: 2, value1: 1, value2: 0 });
    assert.deepEqual([out.items[1].consumable, out.items[1].scope, out.items[1].occasion], [true, 7, 0], 'medicine is always usable in battle; the field flag adds the map');
    assert.equal(out.weapons[2].params[2], 12); assert.ok(out.weapons[2].traits.some(t => t.code === 54 && t.dataId === 2), 'two-handed seals the shield');
    assert.ok(out.weapons[2].traits.some(t => t.code === 31 && t.dataId === 1), 'attack element');
    assert.deepEqual([out.armors[3].etypeId, out.armors[3].params[3]], [3, 4], 'a helmet is head gear');
    assert.deepEqual([out.items[4].itypeId, out.items[4].occasion], [2, 3], 'common goods are key items');
    assert.deepEqual(out.items[5].effects, [{ code: 43, dataId: 1, value1: 0, value2: 0 }]);
    assert.equal(out.items[6].damage.formula, out.skills[1].damage.formula, 'a special item borrows its skill');
    assert.deepEqual([out.ctx.itemKind(2), out.ctx.itemKind(3), out.ctx.itemKind(1)], ['weapons', 'armors', 'items']);
});

test('actors own a class each, 2003 classes follow, ranks become rate traits, states and enemies map', () => {
    const db = {
        engine: 'RPG Maker 2003', states: [null, { name: 'Dead', type: 1 }, { name: 'Sleep', type: 0, restriction: 1, priority: 60, auto_release_prob: 50, hold_turn: 3, release_by_damage: 100, a_rate: 100, b_rate: 80, c_rate: 60, d_rate: 40, e_rate: 0, message_actor: 'sleeps' }],
        attributes: [null, { name: 'Fire', a_rate: 300, b_rate: 200, c_rate: 100, d_rate: 50, e_rate: 0 }],
        actors: [null, { name: 'Ann', title: 'Knight', character_name: '$Ann', character_index: 2, face_name: 'F', face_index: 3, initial_level: 2, parameters: new Array(6 * 50).fill(7), initial_equipment: [1, 2, 3, 4, 5], two_weapon: true, state_ranks: [2, 0], attribute_ranks: [4], skills: [null, { level: 5, skill_id: 9 }], exp_base: 30, exp_inflation: 30, exp_correction: 0 }],
        classes: [null, { name: 'Mage', parameters: new Array(6 * 50).fill(3) }],
        enemies: [null, { name: 'Slime', battler_name: 'slime.png', max_hp: 30, attack: 8, defense: 4, spirit: 2, agility: 5, exp: 3, gold: 2, drop_id: 1, drop_prob: 25, actions: [null, { kind: 0, basic: 0, rating: 100 }, { kind: 1, skill_id: 4, condition_type: 2, condition_param1: 2, condition_param2: 4, rating: 50 }], state_ranks: [0] }],
        troops: [null, { name: 'Slimes', members: [null, { enemy_id: 1, x: 100, y: 120 }], pages: [null, { condition: { flags: 0x08, turn_a: 1, turn_b: 2 }, event_commands: [{ code: 12420, indent: 0, string: '', parameters: [] }] }] }],
        commonevents: [null]
    };
    const out = D.convert(withIds(db), { start: {} }, {});
    assert.deepEqual([out.actors[1].classId, out.actors[1].characterName, out.actors[1].nickname, out.actors[1].maxLevel], [1, '!Ann', 'Knight', 50]);
    assert.deepEqual(out.actors[1].equips, [1, 2, 4, 3, 5], 'weapon, shield, head (helmet), body (armor), accessory');
    assert.ok(out.actors[1].traits.some(t => t.code === 55));
    assert.deepEqual(out.actors[1].traits.filter(t => t.code === 13 || t.code === 11), [{ code: 13, dataId: 2, value: 1 }, { code: 11, dataId: 1, value: 0 }], 'rank A on Sleep, rank E on Fire');
    assert.equal(out.classes[1].expTable[2], 60);
    assert.deepEqual(out.classes[1].learnings, [{ level: 5, skillId: 9, note: '' }]);
    assert.equal(out.classes[2].name, 'Mage'); assert.equal(out.ctx.classOffset, 1);
    assert.deepEqual([out.states[2].restriction, out.states[2].removeAtBattleEnd, out.states[2].autoRemovalTiming, out.states[2].minTurns, out.states[2].removeByDamage, out.states[2].message1], [4, true, 2, 3, true, 'sleeps']);
    assert.deepEqual(out.enemies[1].params, [30, 0, 8, 4, 2, 2, 5, 50]);
    assert.deepEqual(out.enemies[1].dropItems, [{ kind: 1, dataId: 1, denominator: 4 }]);
    assert.deepEqual(out.enemies[1].actions, [{ skillId: 1, rating: 9, conditionType: 0, conditionParam1: 0, conditionParam2: 0 }, { skillId: 4, rating: 5, conditionType: 1, conditionParam1: 2, conditionParam2: 4 }]);
    assert.deepEqual(out.troops[1].members, [{ enemyId: 1, x: 100, y: 120, hidden: false }]);
    assert.deepEqual([out.troops[1].pages[0].conditions.turnValid, out.troops[1].pages[0].conditions.turnA, out.troops[1].pages[0].list[0].code], [true, 1, 353]);
});

test('battle animations become MV sheet animations scaled to 192 px cells', () => {
    const out = D.animations({ animations: ids([null, { name: 'Slash', animation_name: 'slash.png', large: false, position: 0, frames: [null, { cells: [null, { valid: true, cell_id: 3, x: 10, y: -20, zoom: 100, transparency: 50 }] }], timings: [null, { frame: 1, se: { name: 'hit.wav', volume: 90, tempo: 100, balance: 50 }, flash_scope: 1, flash_red: 31, flash_green: 0, flash_blue: 0, flash_power: 31 }] }]) }, {});
    assert.deepEqual(out[1].frames, [[[3, 10, -20, 50, 0, 0, 128, 0]]]);
    assert.deepEqual(out[1].timings, [{ frame: 0, se: { name: 'hit', pan: 0, pitch: 100, volume: 90 }, flashScope: 1, flashColor: [248, 0, 0, 248], flashDuration: 5 }]);
    assert.deepEqual([out[1].animation1Name, out[1].position], ['slash', 0]);
});

test('System terms, types and vehicles come from the 2003 terms and system', () => {
    const base = { terms: { basic: new Array(10).fill(''), commands: new Array(26).fill(''), params: new Array(10).fill(''), messages: {} }, currencyUnit: 'G' };
    const out = D.system(base, { engine: 'RPG Maker 2003', terms: { level: 'Lvl', health_points: 'HP', attack: 'Angriff', menu_equipment: 'Ausrüstung', new_game: 'Neu', gold: 'Taler', weapon: 'Waffe', shield: 'Schild', helmet: 'Helm', armor: 'Rüstung', accessory: 'Zubehör', victory: 'Sieg!', exp_received: 'EP erhalten' }, attributes: [null, { name: 'Feuer' }], system: { boat_name: 'Boot', boat_index: 1 }, terrains: [] }, { start: { boat_map_id: 4, boat_x: 5, boat_y: 6 } }, {});
    assert.deepEqual([out.terms.basic[0], out.terms.params[2], out.terms.commands[6], out.terms.commands[18], out.currencyUnit], ['Lvl', 'Angriff', 'Ausrüstung', 'Neu', 'Taler']);
    assert.deepEqual(out.equipTypes, ['', 'Waffe', 'Schild', 'Helm', 'Rüstung', 'Zubehör']);
    assert.deepEqual(out.elements, ['', 'Feuer']);
    assert.deepEqual([out.terms.messages.victory, out.terms.messages.obtainExp, out.battleSystem], ['Sieg!', '%1 EP erhalten', 1]);
    assert.deepEqual(out.boat, { characterName: '!Boot', characterIndex: 1, bgm: { name: '', pan: 0, pitch: 100, volume: 90 }, startMapId: 4, startX: 5, startY: 6 });
});

// ---- Deep 8 ------------------------------------------------------------------------
const deep8 = path.resolve(__dirname, '..', '..', 'template', 'DEEP 8');
test('every Deep 8 command list converts to well-formed MZ structure', { skip: !fs.existsSync(path.join(deep8, 'RPG_RT.ldb')) }, () => {
    const files = { read: (n) => (fs.existsSync(path.join(deep8, n)) ? fs.readFileSync(path.join(deep8, n)) : null), list: () => [] };
    const project = L.readProject(files);
    const notes = {};
    const out = D.convert(project.database, project.tree, notes);
    const decoder = new TextDecoder(project.encoding);
    out.ctx.decode = (b) => decoder.decode(b);
    let lists = 0;
    for (const ce of out.commonEvents) if (ce) { checkStructure(ce.list, `CE${ce.id}`); lists++; }
    for (const t of out.troops) if (t) for (const pg of t.pages) { checkStructure(pg.list, `troop${t.id}`); lists++; }
    for (const id of [3, 12, 13, 139]) for (const ev of project.maps[id].events) if (ev) for (const pg of ev.pages) if (pg) { checkStructure(C.convertList(pg.event_commands || [], out.ctx).list, `map${id} ev${ev.id}`); lists++; }
    assert.ok(lists > 900, `checked ${lists} lists`);
    assert.equal(notes.unknownCommand, undefined, 'no unknown commands');
    assert.equal(notes.unknownMove, undefined, 'no unknown move steps');
    assert.equal(out.actors.filter(Boolean).length, 14);
    assert.equal(out.classes.filter(Boolean).length, 14 + 18);
    assert.equal(out.commonEvents.filter(Boolean).length, 820);
    assert.ok(notes.callMapEvent > 100 && notes.keyInput > 100, JSON.stringify(notes));
});
