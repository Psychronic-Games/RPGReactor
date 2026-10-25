'use strict';
// The vehicles the vehicle commands offer (src/event/commands/VehicleCommandEditor.js, SetVehicleLocationEditor.js):
// Get On lists only the Vehicles page's vehicles that are placed or named, and the map's vehicle events; Set Vehicle
// Location lists every vehicle of the Vehicles page and the vehicle events of the map open in the editor.
const test = require('node:test');
const assert = require('node:assert/strict');

global.RRVehicles = require('../src/event/VehicleSetup.js');
const VehicleCommandEditor = require('../src/event/commands/VehicleCommandEditor.js');
const SetVehicleLocationEditor = require('../src/event/commands/SetVehicleLocationEditor.js');

const vehicles = [null,
    { id: 1, name: 'Motorcycle', startMapId: 5, startX: 21, startY: 16, copies: [{ id: 4, startMapId: 5, startX: 22, startY: 23 }, { id: 5, startMapId: 0, startX: 0, startY: 0 }] },
    { id: 2, name: 'Tank' },
    { id: 3, name: '' },
    { id: 4, name: '  ', startMapId: 8, startX: 3, startY: 4 }];
const map = { id: 5, events: [null, { id: 1, name: 'Bike', rrVehicle: { type: 1 }, pages: [{ image: { direction: 2 } }] }, { id: 2, name: 'Guard', pages: [] },
    { id: 3, name: '', rrVehicle: { type: 2, yaw: 90 }, pages: [{ image: { direction: 6 } }] }] };
const values = list => list.map(entry => entry.value);

test('Get On lists the placed and the named vehicles of the Vehicles page, and the map\'s vehicle events', () => {
    assert.deepEqual(values(VehicleCommandEditor.vehicleChoices(vehicles)), ['0:1', '0:30001', '0:40001', '0:2', '0:4'],
        'every copy of the named Motorcycle, placed or not; the named Tank; the unnamed record that is placed; not the blank one');
    const choices = VehicleCommandEditor.choices('nearest', vehicles, key => key, { map, event: null });
    assert.deepEqual(values(choices), ['nearest', 'boat', 'ship', 'airship', '0:1', '0:30001', '0:40001', '0:2', '0:4', '1', '3']);
    assert.equal(choices.find(entry => entry.value === '3').label, 'EV003: Tank', 'an event with no name is named by its vehicle');
    // A command that names a blank record keeps it, as it is.
    assert.ok(values(VehicleCommandEditor.choices('0:3', vehicles, key => key, { map })).includes('0:3'));
});

test('Set Vehicle Location lists every vehicle of the Vehicles page and the vehicle events of the map open in the editor', () => {
    const list = SetVehicleLocationEditor.reactorVehicles({ data: { vehicles } }, 0, map);
    assert.deepEqual(values(list), ['0:1', '0:30001', '0:40001', '0:2', '0:3', '0:4', '5:1', '5:3']);
    assert.equal(list.find(entry => entry.value === '5:1').label, 'EV001: Bike');
    // A stored event of another map is kept, named by its map and number.
    const other = SetVehicleLocationEditor.reactorVehicles({ data: { vehicles } }, '8:12', map);
    assert.equal(other.find(entry => entry.value === '8:12').label, 'Map 8 EV012');
    assert.equal(SetVehicleLocationEditor.vehicleName('5:3', { data: { vehicles } }), 'Map 5 EV003', 'no map open: by its map and number');
    // No map open: the page's vehicles only.
    assert.deepEqual(values(SetVehicleLocationEditor.reactorVehicles({ data: { vehicles } }, 0, null)), ['0:1', '0:30001', '0:40001', '0:2', '0:3', '0:4']);
});
