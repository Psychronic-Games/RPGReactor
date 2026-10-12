'use strict';
// A stock vehicle's sprite is chosen and drawn in Database > Vehicles. System 1
// keeps the vehicles' starting positions and has no image row or BGM row for
// them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createPages } = require('./helpers/database-pages.cjs');

const editorRoot = path.resolve(__dirname, '..');
const vehicle = (characterName, characterIndex) => ({ bgm: { name: 'Ship1', pan: 0, pitch: 100, volume: 90 }, characterIndex, characterName, startMapId: 4, startX: 5, startY: 6 });

/** A System.json with these vehicles. */
const systemWith = vehicles => Object.assign({ gameTitle: 'Sample', equipTypes: ['', 'Weapon'] }, vehicles);

function project(system, image) {
    const manager = {
        mutationGeneration: 0, data: {},
        getSystem: () => system, getActors: () => [], getActor: () => null,
        getClasses: () => [], getClass: () => null, getWeapons: () => [], getArmors: () => [],
        getVehicles: () => [], getVehicle: () => null, getMapInfos: () => []
    };
    return Object.assign(createPages(manager, { image }), { manager });
}
/** The cells a Vehicles page drew into its sprite box: [sx, sy, width, height] of each. */
const drawn = page => page.querySelector('.vehicle-sprite-preview').calls.filter(call => call[0] === 'drawImage').map(call => call.slice(1, 5));

test('System 1 has no vehicle image row and no vehicle BGM row; the starting positions stay', () => {
    const system = systemWith({ boat: vehicle('Vehicle', 0), ship: vehicle('Vehicle', 1), airship: vehicle('Vehicle', 3) });
    const before = JSON.stringify(system);
    const page = project(system).system1();
    assert.equal(page.querySelectorAll('.vehicle-change-btn, .vehicle-sprite-preview').length, 0);
    assert.ok(!page.querySelectorAll('.database-section-header').some(header => header.dataset.sectionKey === 'vehicle-images'));
    assert.deepEqual(page.querySelectorAll('.music-row').map(row => row.dataset.musicType), ['title', 'battle', 'victory', 'defeat', 'gameOver']);
    assert.deepEqual(page.querySelectorAll('.system-pos-row').map(row => row.dataset.posOwner), ['player', 'boat', 'ship', 'airship']);
    assert.equal(JSON.stringify(system), before, 'drawing the page writes nothing');
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseSystem1Editor.js'), 'utf8');
    for (const gone of ['showVehicleImagePicker', 'renderVehiclePreview', 'vehicle-change-btn', 'Vehicle Images']) assert.ok(!source.includes(gone), gone);
});

test('a vehicle draws the sheet cell its stored index names', () => {
    // An eight-character sheet is 12 columns by 8 rows; index 5 is the second
    // character of the second block row, drawn facing down, mid-step: column 1
    // of its own 3x4 block.
    const pages = project(systemWith({ boat: vehicle('Vehicle', 5) }), { width: 576, height: 384 });
    assert.deepEqual(drawn(pages.vehicle('boat')), [[((5 % 4) * 3 + 1) * 48, Math.floor(5 / 4) * 4 * 48, 48, 48]]);
});

test('a $ sheet holds one character, so its index is ignored', () => {
    // `$Vehicle` is 3 columns by 4 rows and holds one character. A stored index
    // would otherwise read a cell that is not there.
    const pages = project(systemWith({ airship: vehicle('$Vehicle', 6) }), { width: 144, height: 192 });
    assert.deepEqual(drawn(pages.vehicle('airship')), [[48, 0, 48, 48]]);
});

test('an unset vehicle draws nothing rather than guessing a sheet', () => {
    assert.deepEqual(drawn(project(systemWith({ ship: vehicle('', 0) })).vehicle('ship')), []);
    assert.deepEqual(drawn(project(systemWith({})).vehicle('ship')), []);
});

test('the vehicle picker stores the cell that was clicked and leaves the rest of the vehicle alone', () => {
    const system = systemWith({ boat: vehicle('Old', 1) });
    const pages = project(system);
    const page = pages.vehicle('boat');
    page.querySelector('.vehicle-image-browse').onclick();
    const asked = pages.opened.images[0];
    assert.deepEqual([asked.name, asked.index, asked.pattern, asked.direction], ['Old', 1, 1, 2], 'the picker opens on the cell the vehicle already uses');
    asked.callback({ characterName: 'Vehicle', characterIndex: 3, pattern: 2, direction: 8 });
    assert.deepEqual(system.boat, vehicle('Vehicle', 3), 'the sheet and the clicked cell, and nothing of the frame');
    assert.equal(page.querySelector('.graphic-preview-name').textContent, 'Vehicle');
    assert.equal(pages.manager.mutationGeneration, 1);
    assert.equal('reactorVehicle' in system.boat, false, 'an image is RPG Maker data: no extension is written for it');
});
