'use strict';
// Diagonal movement (owner, 2026-10-16): with Database › System 1 › Options › Diagonal movement on,
// two arrow keys held together walk the player diagonally; blocked there, it slides along the wall.
// A project without the setting walks in four directions, as it always did; a new project has it on.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { followerWorld } = require('./helpers/follower-world.cjs');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

/** Holds up and right together (dir8 9, dir4 one of its axes) for one step; returns where the player stands. */
function stepUpRight(w) {
    const p = w.$gamePlayer, x = p.x, y = p.y;
    w.Input.dir8 = 9; w.Input.dir4 = 8;
    w.run(200, () => p.x !== x || p.y !== y);
    w.Input.dir8 = 0; w.Input.dir4 = 0;
    w.run(200, () => !p.isMoving());
    return [p.x, p.y];
}

test('on: up and right together walk up-right, and the party follows', () => {
    const w = followerWorld({ system: { reactorDiagonalMove: true }, start: [10, 10] });
    assert.deepEqual(stepUpRight(w), [11, 9]);
    assert.deepEqual(stepUpRight(w), [12, 8]);
    w.rest();
    for (const f of Array.from(w.$gamePlayer.followers()._data).filter(f => f.isVisible())) {
        assert.ok(Math.abs(f.x - 12) <= 4 && Math.abs(f.y - 8) <= 4, `follower at ${f.x},${f.y} came along`);
    }
});

test('off, or a project without the setting: four directions only', () => {
    for (const system of [{}, { reactorDiagonalMove: false }]) {
        const w = followerWorld({ system, start: [10, 10] });
        assert.deepEqual(stepUpRight(w), [10, 9], JSON.stringify(system));
    }
});

test('blocked on the diagonal, the player slides along the wall', () => {
    const w = followerWorld({ system: { reactorDiagonalMove: true }, start: [10, 10], walls: [[11, 9], [11, 10]] });
    assert.deepEqual(stepUpRight(w), [10, 9], 'up, the way still open');
    const v = followerWorld({ system: { reactorDiagonalMove: true }, start: [10, 10], walls: [[10, 9], [11, 9]] });
    assert.deepEqual(stepUpRight(v), [11, 10], 'right, when up is shut');
});

test('System 1 has the checkbox, and a new project starts with it on', () => {
    assert.match(read('src/database/DatabaseSystem1Editor.js'), /system\.reactorDiagonalMove === true \? 'checked' : ''\} data-field="reactorDiagonalMove"/);
    const manager = read('src/ProjectManager.js');
    assert.match(manager, /if \(systemData\.reactorDiagonalMove === undefined\) systemData\.reactorDiagonalMove = true;/, 'from a template');
    assert.match(manager, /reactorDiagonalMove: true,/, 'blank');
    const i18n = read('src/I18nManager.js');
    for (const locale of ['ja', 'zh-Hant', 'zh-Hans', 'ko', 'es', 'pt', 'fr', 'it', 'de', 'ru', 'pl', 'el', 'ar', 'tr', 'id', 'vi', 'th']) {
        assert.match(i18n, new RegExp(`RR_TEXT_TRANSLATIONS\\["${locale}"\\], \\{"Diagonal movement":`), locale);
    }
});
