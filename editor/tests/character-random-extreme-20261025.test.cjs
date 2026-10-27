'use strict';
// Randomize follows the tab's switches: with Extreme proportions on, rolled sliders reach into their extreme
// ranges; with Anatomical detail on, its sliders roll with the body. Before, every roll stayed natural and the
// anatomy kept what it had, whatever was ticked.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Q = require('./helpers/character-quality-matrix.cjs');

function builder() {
    const window = { RRHumanBody: Q.Body, RRCharacterModel: Q.Model, RRCharacterSpecies: Q.Species, RRCreatureBody: Q.Creature };
    const C3 = path.join(__dirname, '../src/forge/Character3D');
    for (const [name, file] of [['RRCharacterSkin', 'CharacterSkin.js'], ['RRCharacterHair', 'CharacterHair.js'], ['RRCharacterBodyArt', 'CharacterBodyArt.js'], ['RRSlimeBody', 'SlimeBody.js'], ['RRCharacterExpressions', 'CharacterExpressions.js']]) {
        try { if (fs.existsSync(path.join(C3, file))) window[name] = require(path.join(C3, file)); } catch (e) { /* the tab works without it */ }
    }
    window.RRRandomPartsMenu = require('../src/forge/RandomPartsMenu.js');
    const scope = { window, console, setTimeout, clearTimeout, rrEscapeHtml: s => String(s), ...window };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8'), scope);
    const ui = Object.create(scope.window.Character3DBuilder.prototype);
    Object.assign(ui, { _t: s => s, extreme: false, folded: {}, _replace(r) { this.recipe = r; } });
    return ui;
}

test('Extreme proportions on: rolls reach past the natural ranges; off: they stay inside', () => {
    const ui = builder();
    ui.recipe = Q.Model.normalize(Q.Model.random(11, { species: 'human' }));
    const ranges = ui._sliderRanges(ui.recipe);
    const wide = [...ranges].filter(([p, s]) => s.extreme && !p.startsWith('anatomy.') && (s.extreme[0] < s.natural[0] || s.extreme[1] > s.natural[1]));
    assert.ok(wide.length > 20, 'the body and face sliders with extreme ranges are found (' + wide.length + ')');
    const get = (o, p) => p.split('.').reduce((v, k) => v == null ? v : v[k], o);
    const outside = on => {
        ui.extreme = on; let n = 0;
        for (let k = 0; k < 12; k++) {
            ui.randomParts = new Set(['gender', 'body', 'face', 'hair', 'bodyart', 'outfit', 'colors']);
            ui._randomize();
            for (const [p, s] of wide) { const v = get(ui.recipe, p); if (typeof v === 'number' && (v < s.natural[0] - 1e-6 || v > s.natural[1] + 1e-6)) n++; }
        }
        return n;
    };
    assert.equal(outside(false), 0, 'natural rolls stay natural');
    assert.ok(outside(true) > 40, 'extreme rolls use the extreme ranges');
});

test('Anatomical detail on: its sliders roll with the body; off, or Body unticked: they are kept', () => {
    const ui = builder();
    ui.recipe = Q.Model.normalize({ ...Q.Model.random(5, { species: 'human', gender: 1 }), anatomy: { ...Q.Model.normalize(Q.Model.random(5, { species: 'human', gender: 1 })).anatomy, detail: true } });
    const anatomy = () => JSON.stringify([ui.recipe.anatomy.length, ui.recipe.anatomy.girth, ui.recipe.anatomy.areola, ui.recipe.anatomy.nipple]);
    const seen = new Set([anatomy()]);
    ui.randomParts = new Set(['body']);
    for (let k = 0; k < 6; k++) { ui._randomize(); seen.add(anatomy()); }
    assert.ok(seen.size > 3, 'the anatomy rolls');
    assert.equal(ui.recipe.anatomy.detail, true);
    const kept = anatomy();
    ui.randomParts = new Set(['face', 'hair']);
    ui._randomize();
    assert.equal(anatomy(), kept, 'Body unticked keeps it');
    ui.recipe = Q.Model.normalize({ ...ui.recipe, anatomy: { ...ui.recipe.anatomy, detail: false } });
    const off = anatomy();
    ui.randomParts = new Set(['body']);
    ui._randomize();
    assert.equal(anatomy(), off, 'detail off keeps it');
});
